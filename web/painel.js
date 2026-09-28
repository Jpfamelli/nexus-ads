/* ============================================================
   NEXUS ADS — painel.js (módulo ESM, sem build)

   Toda conta passa por M = montar(dataset). O dataset vem do banco
   (nx_dados → datasetDeLinhas) ou do gerador fictício (?demo →
   gerarDemo). O painel não sabe — nem precisa saber — de onde veio.

   SISTEMA DE MOVIMENTO (plano-sequência noturno) — como usar
   · ANIM: falso com ?noanim ou prefers-reduced-motion → tudo nasce no
     quadro final, estático e determinístico. Sempre consulte ANIM.
   · FX = ./efeitos.js (a câmera) e CINE = ./cinema.js (o palco), ambos por
     import() dinâmico com catch: podem ser null e o painel segue de pé.
   · Bloco que entra em quadro: <article class="card" data-cena>. Na 1ª vez
     que aparece ganha .em-cena + .entrando; animação interna = ".entrando X"
     no CSS (nunca ".em-cena X", senão repete a cada filtro).
   · Número que rola: <b data-n="106" data-f="int" data-k="chave-unica">106</b>
     (texto já final). numeros(raiz) roda o odômetro do valor anterior
     (guardado por data-k) até o novo; ao entrar em cena, parte de 0.
   · Gráfico: path com pathLength="1" → FX.caneta(path) ao entrar em cena.
     Redesenho com mudança de altura: FX.fotografar antes + FX.flip depois.
   · Tokens: painel.css :root (--e-out, --mola, --t-dados…); em JS, FX.MOV.
   · Camadas: PALCO (cinema.js, só ele respira) · OBJETOS (cartões, papel,
     celulares) · CÂMERA (efeitos.js). Tilt só no herói e nos celulares.

   PACOTE DE RECURSOS (mesma lente, mesmas camadas)
   · Módulos por import() com catch, carregados só quando pedidos:
     curta.js (modo apresentação, tecla P), folha.js (A4 do mês),
     paleta.js (Ctrl/⌘+K), arrastar.js (fichas do kanban), marca.js
     (logo/cor em Ajustes). Sem eles, o painel de hoje segue de pé.
   · Mesmo número em todo lugar: herói, régua, curta e folha saem de
     numerosPeriodo() / M.* — nada de fórmula nova.
   · Bloco PURO (entre as marcas "PURO") é testado no Node: statusEnvio,
     contraste da marca, estado da integração, simulador, linguagem leiga.
   ============================================================ */
import {
  datasetDeLinhas, montar, hojeSP, meioDia, isoDe, fin, brl, brl0, int, pc, dec, esc, waHtml, fmtN,
  razao, variacao, plural, nomePlat, CFG_PADRAO, cfgCom, MESES, MES3, SEMANA,
} from "./nucleo.js";
import { gerarDemo } from "./demo.js";
import * as api from "./dados.js";

/* ============================================================
   0. UTILIDADES
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const Q = new URLSearchParams(location.search);
const DEMO = Q.has("demo");
// ?noanim: tudo estático (capturas de tela e testes)
const NOANIM = Q.has("noanim");
if (NOANIM) document.documentElement.classList.add("noanim");
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches || NOANIM;
const ANIM = !REDUCE;          // a flag única do movimento
const FINE = matchMedia("(pointer: fine)").matches;
const DIAS_JANELA = 130;
const NOME_DEMO = "Clínica Demonstração";
// demo com a cara da clínica da reunião: ?clinica= (só texto, até 40 letras) e ?cor= (hex de 6 dígitos)
const CLINICA_Q = DEMO ? String(Q.get("clinica") || "").replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
const COR_Q = DEMO && /^[0-9a-f]{6}$/i.test(Q.get("cor") || "") ? "#" + Q.get("cor").toUpperCase() : "";

/* primeiro quadro já na fonte da marca: o palco acende, o conteúdo espera as fontes (teto 1,2 s) */
document.documentElement.classList.add("fontes-espera");
{
  const pronto = () => { document.documentElement.classList.remove("fontes-espera"); document.documentElement.classList.add("fontes-ok"); };
  const teto = new Promise(r => setTimeout(r, 1200));
  const fontes = document.fonts && document.fonts.ready
    ? Promise.all(["600 1em 'Nx Clash'", "500 1em 'Nx Satoshi'", "700 1em 'Nx Satoshi'", "500 1em 'Nx Plex'"].map(f => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready)
    : Promise.resolve();
  // reserva: se as fontes locais não carregarem, liga os <link> da Fontshare/Google (media=print até lá: nada é baixado à toa)
  const reserva = () => {
    try { if (document.fonts && !document.fonts.check("600 1em 'Nx Clash'") && !document.fonts.check("500 1em 'Nx Satoshi'")) document.querySelectorAll("link[data-reserva]").forEach(l => { l.media = "all"; }); } catch { /* sem FontFaceSet */ }
  };
  Promise.race([fontes, teto]).then(() => { pronto(); reserva(); }, pronto);
}
/* efeitos em módulos à parte: se não carregarem, o painel continua igual (só parado) */
let FX = null, CINE = null;
const FX_P = import("./efeitos.js?v=2").catch(() => null);
const CINE_P = import("./cinema.js?v=3").then(m => { m.ligar({ anim: ANIM, semente: DEMO ? 1 : 3 }); return m; }).catch(() => null);
CINE_P.then(m => { CINE = m; if (m && S.aba === "radar" && M) renderRadar(); });
/* recursos em módulos (import() dinâmico com catch): só baixam quando alguém pede */
const MODS = {};
const MOD_SRC = {
  curta: () => import("./curta.js?v=1"),
  folha: () => import("./folha.js?v=1"),
  paleta: () => import("./paleta.js?v=1"),
  arrastar: () => import("./arrastar.js?v=1"),
  marca: () => import("./marca.js?v=1"),
};
function modulo(nome) {
  if (!MODS[nome]) MODS[nome] = MOD_SRC[nome]().catch(e => { console.warn(`[nexus] ${nome}.js não carregou`, e); delete MODS[nome]; return null; });
  return MODS[nome];
}

const p2 = n => String(n).padStart(2, "0");
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const soDigitos = s => String(s ?? "").replace(/\D/g, "");
const semAcento = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const slugDe = s => semAcento(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const lerLocal = k => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };

/* ---------- datas do servidor (sempre no fuso de São Paulo) ---------- */
const FMT_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const FMT_DDMM = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const FMT_DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const quando = iso => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : d; };
const horaSP = iso => { const d = quando(iso); return d ? FMT_HORA.format(d) : "—"; };
const dataTs = iso => { const d = quando(iso); return d ? FMT_DATA.format(d) : "—"; };
function quandoSP(iso) {
  const d = quando(iso);
  if (!d) return "—";
  const dia = hojeSP(d), hoje = hojeSP();
  const o = meioDia(hoje); o.setDate(o.getDate() - 1);
  const rot = dia === hoje ? "hoje" : dia === isoDe(o) ? "ontem" : `em ${FMT_DDMM.format(d)}`;
  return `${rot} às ${FMT_HORA.format(d)}`;
}
const dataIso = iso => { const [a, m, d] = String(iso || "").slice(0, 10).split("-"); return d ? `${d}/${m}/${a}` : "—"; };
const ddmmHora = iso => { const d = quando(iso); return d ? `${FMT_DDMM.format(d)} ${FMT_HORA.format(d)}` : "—"; };

/* ==== PURO: início — testes/painel.teste.mjs roda este trecho no Node (só usa horaSP/quandoSP) ==== */
/** Status de um envio de WhatsApp (relatório ou aviso), honesto como o próprio WhatsApp:
    ✓ = a API aceitou (enviado) · ✓✓ = chegou no celular (entregue) · "!" = não saiu.
    Nunca azul: no WhatsApp azul é "lido", e o servidor não sabe disso. */
function statusEnvio(x) {
  if (!x) return null;
  const erro = String(x.erro || x.erro_envio || "");
  const naoChegou = /não entregou/i.test(erro);
  if (x.entregue_em) return { k: "entregue", tique: "✓✓", rotulo: `entregue às ${horaSP(x.entregue_em)}`, hora: horaSP(x.entregue_em), quando: quandoSP(x.entregue_em) };
  if (x.enviado_em && !naoChegou) return { k: "enviado", tique: "✓", rotulo: `enviado às ${horaSP(x.enviado_em)} · entrega ainda não confirmada`, hora: horaSP(x.enviado_em), quando: quandoSP(x.enviado_em) };
  if (erro) return { k: "erro", tique: "!", rotulo: naoChegou ? "não entregue" : "não enviado", hora: x.enviado_em ? horaSP(x.enviado_em) : null, erro: erro.slice(0, 160) };
  return { k: "pendente", tique: "◷", rotulo: "gerado, ainda não enviado", hora: null };
}

/* marca da clínica: contraste pela luminância relativa (WCAG) */
const hexValido = s => /^#[0-9a-f]{6}$/i.test(String(s || ""));
function luminancia(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255]
    .map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
}
const contraste = (a, b) => { const x = luminancia(a), y = luminancia(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
/** Texto sobre a cor da clínica: o preto da Nexus ou branco — o que tiver mais contraste (≥ 4,5:1 quando der). */
const corTexto = hex => (contraste(hex, "#05080C") >= contraste(hex, "#FFFFFF") ? "#05080C" : "#FFFFFF");
/** Logo só entra por img.src, e só PNG/JPEG/WebP em base64 ou https (nunca SVG). */
const logoValido = u => typeof u === "string" && u.length <= 120000
  && (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(u) || /^https:\/\/[^\s"'<>()\\]+$/i.test(u));

/* conexão com Meta/Google (regra "integracao", que só o servidor conhece) */
function canalDe(a) {
  const s = `${(a && a.chave) || ""} ${(a && a.mensagem) || ""}`.toLowerCase();
  return /\|meta\b|\bmeta\b/.test(s) ? "meta" : /\|google\b|\bgoogle\b/.test(s) ? "google" : null;
}
function nomeRegraSrv(a, regras = []) {
  if (a.regra === "integracao") { const c = canalDe(a); return c ? `Conexão com ${c === "meta" ? "Meta" : "Google"}` : "Conexão com os anúncios"; }
  const r = regras.find(x => x.id === a.regra);
  return r ? r.nome : a.regra === "ritmo" ? "Ritmo do orçamento" : "Aviso do radar";
}
/** Estado das leituras: erro (status "erro…" ou aviso de conexão das últimas 24 h sem leitura boa depois),
    atrasado (última leitura há mais de 2 h), aguardando (nunca leu) ou ok. */
function estadoIntegracao(integs = [], alertas = [], agora = Date.now()) {
  const H = 36e5, ORD_E = { erro: 3, atrasado: 2, aguardando: 1, ok: 0 };
  const canais = (integs || []).filter(i => i && i.ativo).map(i => {
    const sync = i.ultimo_sync ? Date.parse(i.ultimo_sync) : NaN;
    const al = (alertas || []).filter(a => a && a.regra === "integracao" && canalDe(a) === i.canal && agora - Date.parse(a.criado_em) <= 24 * H)
      .sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)))[0] || null;
    const statusErro = /^erro/i.test(i.status || "");
    const alAtivo = !!al && (statusErro || !(Number.isFinite(sync) && sync > Date.parse(al.criado_em)));
    const estado = statusErro || alAtivo ? "erro" : !Number.isFinite(sync) ? "aguardando" : agora - sync > 2 * H ? "atrasado" : "ok";
    return { canal: i.canal, estado, sync: Number.isFinite(sync) ? sync : null, status: i.status || "", alerta: alAtivo ? al : null };
  });
  const nivel = canais.reduce((n, c) => (ORD_E[c.estado] > ORD_E[n] ? c.estado : n), canais.length ? "ok" : "nenhuma");
  const syncs = canais.map(c => c.sync).filter(Boolean);
  return { nivel, canais, erros: canais.filter(c => c.estado === "erro"), ultimo: syncs.length ? Math.max(...syncs) : null };
}

/** Simulador da demo: as MESMAS taxas do período, resultado em faixa de ±20% (estimativa, nunca promessa). */
function simular(tx, inv, ticket) {
  const conv = tx.cpa > 0 ? inv / tx.cpa : 0, pac = conv * tx.ag * tx.veio * tx.fe;
  const fx = v => [Math.max(0, Math.floor(v * .8)), Math.max(0, Math.ceil(v * 1.2))];
  const fxR = v => [Math.max(0, Math.floor(v * .8 / 100) * 100), Math.max(0, Math.ceil(v * 1.2 / 100) * 100)];
  return { conversas: fx(conv), pacientes: fx(pac), tratamentos: fxR(pac * ticket) };
}

/** Linguagem de consultório: [termo do gestor, versão leiga]. rot(chave) escolhe pelo papel. */
const LEIGO = {
  "hero.retorno": ["Retorno total", "O que voltou"],
  "hero.retornoPlat": ["Retorno sobre anúncios", "O que voltou"],
  "funil.exibido": ["Anúncio exibido", "Anúncio na tela"],
  "funil.cliques": ["Cliques", "Tocaram"],
  "meta.acima": ["acima da meta", "melhor que o normal"],
  "meta.na": ["na meta", "dentro do normal"],
  "meta.abaixo": ["abaixo da meta", "abaixo do normal"],
  "ritmo.titulo": ["Ritmo do mês", "Orçamento do mês"],
  "impressoes": ["impressões", "vezes na tela"],
  r1: ["Custo por conversa alto", "Conversa ficando cara"],
  r2: ["Campanha sem conversa", "Anúncio sem nenhuma conversa"],
  r3: ["Criativo com CTR baixo", "Anúncio que pouca gente toca"],
  r4: ["Fadiga de criativo", "Anúncio cansado (visto demais)"],
  ritmo: ["Ritmo do orçamento", "Orçamento do mês"],
};
/** Uma linha leiga por regra, acima da mensagem do núcleo (que não muda). */
const LEIGO_LINHA = {
  r1: "Cada conversa está saindo mais cara do que o combinado.",
  r2: "O anúncio gastou e ninguém chamou no WhatsApp.",
  r3: "Muita gente vê o anúncio, quase ninguém toca.",
  r4: "As mesmas pessoas já viram este anúncio muitas vezes.",
  ritmo: "No ritmo de agora, o mês passa do orçamento.",
  integracao: "O painel parou de receber os números dessa plataforma.",
};
/* ==== PURO: fim ==== */

/* ============================================================
   1. ESTADO
   ============================================================ */
const novoAj = () => ({ carregado: false, integ: null, contas: null, config: null, novoCliente: false, tRecarga: 0 });
const S = {
  aba: "geral", dias: 30, plat: "", sort: { key: "gasto", dir: -1 }, varridoEm: null,
  demo: DEMO, token: null, conta: null, clientes: [], clienteId: null, dados: null, estado: null,
  busca: "", kVer: {}, pedirCodigo: false, aj: novoAj(), comparar: true,
  nomeDemo: CLINICA_Q || NOME_DEMO, destacar: new Set(), marcoFixo: null,
};
let DS = null, M = null;
const gestor = () => !S.demo && !!S.conta && S.conta.papel === "gestor";
/** Termo do gestor × versão leiga (clínica e demo). rotT: o gestor vê o técnico com o leigo no title. */
const rot = k => { const e = LEIGO[k]; return !e ? k : gestor() ? e[0] : e[1]; };
const rotT = k => { const e = LEIGO[k]; return !e ? esc(k) : gestor() ? `<span title="${esc(e[1])}">${esc(e[0])}</span>` : esc(e[1]); };
const clienteAtual = () => S.clientes.find(c => c.id === S.clienteId) || null;
// plataforma vem do banco e a clínica pode gravar texto livre nela: nunca vai crua para um atributo
const classePlat = p => (p === "meta" || p === "google" ? p : "neutro");
const nomeCliente = () => S.demo ? S.nomeDemo : (clienteAtual() || {}).nome || (DS && DS.nome) || "Nexus Ads";
const semAnuncios = () => !M || !M.LINHAS.length;
const isoI = i => isoDe(M.dataDe(i));
const iDeIso = iso => M.R + Math.round((meioDia(String(iso).slice(0, 10)) - meioDia(isoI(M.R))) / 864e5);
function montarDe(ds) { DS = ds; M = montar(ds); }

/* ---------- marca da clínica: só nos OBJETOS (selo, celular do resumo, curta, folha) ---------- */
const MARCA = { cor: null, logo: null };
function aplicarMarca({ cor, logo } = {}) {
  const st = document.documentElement.style;
  MARCA.cor = hexValido(cor) ? String(cor).toUpperCase() : null;
  MARCA.logo = logoValido(logo) ? logo : null;
  if (MARCA.cor) { st.setProperty("--marca", MARCA.cor); st.setProperty("--marca-txt", corTexto(MARCA.cor)); }
  else { st.removeProperty("--marca"); st.removeProperty("--marca-txt"); }
  renderSelo();
}
/** Avatar da clínica: o logo (sempre por img.src, nunca por string) ou a inicial sobre a cor da clínica. */
function avatarMarca(el, nome, marca = MARCA) {
  if (!el) return;
  const logo = marca && logoValido(marca.logo) ? marca.logo : null;
  el.textContent = "";
  el.classList.toggle("com-logo", !!logo);
  if (logo) {
    const img = document.createElement("img");
    img.alt = ""; img.decoding = "async"; img.src = logo;
    el.appendChild(img);
  } else el.textContent = (String(nome || "C").trim().charAt(0) || "C").toUpperCase();
}
function renderSelo() {
  const selo = $("#selo");
  if (!selo) return;
  const nome = nomeCliente();
  selo.hidden = !(S.demo || clienteAtual());
  $("#selo-nome").textContent = nome;
  avatarMarca($("#selo-av"), nome);
  avatarMarca($("#top-av"), nome);
}

// cores dos objetos no palco escuro (claras o bastante para ler sobre --surface)
const SERV_COR = { "Aparelho invisível": "#6FA3CF", "Implante": "#CF9540", "Clareamento": "#E0876F", "Clínica geral": "#A9C3D6", "Limpeza": "#CDBB9B", "Canal / urgência": "#B98A4C" };
const COR_EXTRA = ["#8FB7DA", "#D9A457", "#8DBFA6", "#D49A8C", "#A6A9D6", "#C4B8A6"];
const corServ = (nome, n) => SERV_COR[nome] || COR_EXTRA[n % COR_EXTRA.length];
const AVC = ["#2B5A80", "#2F5F86", "#7A5114", "#8A4B2E", "#4E6B5E", "#A0584A", "#132A40"];   // branco por cima ≥ 4,5:1

const ETAPAS = [
  ["nova", "Nova conversa", "#9FB4C7"],
  ["agendada", "Agendada", "#6FA3CF"],
  ["orcamento", "Avaliou · orçamento", "#CF9540"],
  ["fechou", "Fechou", "#7FD1A5"],
  ["nao_fechou", "Não fechou", "#9D9486"],
  ["faltou", "Faltou", "#F08A74"],
  ["perdida", "Não agendou", "#7E8A94"],
];
const NOME_ETAPA = Object.fromEntries(ETAPAS.map(([k, l]) => [k, l]));
const COM_DATA = new Set(["agendada", "orcamento", "fechou", "nao_fechou", "faltou"]);
const ORIGENS = [
  ["indicacao", "Indicação de alguém"],
  ["organico", "Instagram ou Google, sem anúncio"],
  ["whatsapp", "Chamou direto no WhatsApp"],
  ["site", "Site da clínica"],
  ["manual", "Outro"],
];

/* ============================================================
   2. DESENHO — traço, eixos, sparklines, contagem
   ============================================================ */
/** Traço suave (Catmull-Rom → Bézier). */
function traco(p) {
  if (!p.length) return "";
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)} ${(b[1] + (c[1] - a[1]) / 6).toFixed(1)} ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)} ${(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
  }
  return d;
}
/** Teto do eixo = 4 degraus "redondos" (1, 2, 2,5, 5 × 10ⁿ): rótulos R$ 10/20/30, nunca R$ 6/13/19. */
const niceMax = v => {
  if (v <= 0) return 4;
  const bruto = v / 4, p = Math.pow(10, Math.floor(Math.log10(bruto))), n = bruto / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p * 4;
};
/** Sparkline com dupla exposição: o período anterior tracejado por baixo, na MESMA escala.
    `atual` e `anterior` têm o mesmo tamanho; `de` é o índice do 1º dia (para o ponto do dia). */
function spark(atual, anterior = [], de = 0) {
  const w = 300, h = 36;
  const lim = v => v.map(x => (fin(x) ? x : null));
  const a = lim(atual), b = lim(anterior);
  const todos = [...a, ...b].filter(x => x != null);
  const mx = todos.length ? Math.max(...todos) : 1, mn = todos.length ? Math.min(...todos) : 0, sp = mx - mn || 1;
  const pts = v => v.map((y, i) => [i / Math.max(1, v.length - 1) * w, h - 3 - ((y ?? mn) - mn) / sp * (h - 9)]);
  const pa = pts(a), d = traco(pa);
  const dAnt = b.some(x => x != null) ? traco(pts(b)) : "";
  const ys = pa.map(p => p[1].toFixed(1)).join(",");
  return `<span class="spark-box" data-de="${de}" data-ys="${ys}" aria-hidden="true"><svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
    (dAnt ? `<path class="ant" d="${dAnt}"/>` : "") +
    `<path class="a" d="${d} L${w} ${h} L0 ${h} Z"/><path class="l" pathLength="1" d="${d}"/></svg><i class="spk-dot"></i></span>`;
}

/* ---------- números que rolam (odômetro do efeitos.js) ---------- */
const ULT = new Map();   // data-k → último valor mostrado
function numeros(raiz) {
  for (const el of $$("[data-n]", raiz)) {
    const para = +el.dataset.n;
    if (!fin(para)) continue;
    const k = el.dataset.k, f = el.dataset.f;
    const antes = k && ULT.has(k) ? ULT.get(k) : null;
    if (k) ULT.set(k, para);
    if (!FX || !ANIM) continue;
    const bloco = el.closest("[data-cena]");
    if (FX.assentado(bloco)) {
      if (antes != null && antes !== para) FX.odometro(el, fmtN(antes, f), fmtN(para, f));
    } else el.dataset.de = antes ?? 0;   // rola quando o bloco entrar em quadro
  }
}
function numerosEntrando(bloco) {
  if (!FX) return;
  for (const el of $$("[data-n]", bloco)) {
    if (el.dataset.de == null) continue;
    const de = +el.dataset.de, para = +el.dataset.n, f = el.dataset.f;
    delete el.dataset.de;
    if (fin(para) && de !== para) FX.odometro(el, fmtN(de, f), fmtN(para, f));
  }
}
/** Liga as cenas da aba: cada [data-cena] entra em quadro uma vez (com FX); sem FX, tudo já pronto. */
function cenas(view) {
  if (FX) FX.cenas(view, aoEntrar);
  else $$("[data-cena]", view).forEach(b => b.classList.add("em-cena"));
}
function aoEntrar(bloco) {
  numerosEntrando(bloco);
  if (bloco.querySelector("#chart-dia")) canetaDiario();
  if (bloco.classList.contains("phone-col")) destravarFone(bloco);
}

/* ---------- nomes e datas para os objetos ---------- */
const SEMANA_LONGA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
/** Só primeiro nome + inicial (nada de telefone nem sobrenome nos objetos). */
function nomeCurto(nome) {
  const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length || /^sem nome$/i.test(String(nome).trim())) return "Paciente";
  if (p.length === 1) return p[0];
  const ult = p[p.length - 1].replace(/\.$/, "");
  return `${p[0]} ${ult.charAt(0).toUpperCase()}.`;
}
const semMarcas = s => String(s || "").replace(/[*_]/g, "");
const dataLonga = d => `${SEMANA_LONGA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;

/** O celular de verdade (moldura metálica, ilha, reflexo). `tela` é HTML já escapado. */
const foneHtml = (tela, cls = "", tilt = 6) =>
  `<div class="fone ${cls}" data-tilt="${tilt}" data-foco aria-hidden="true"><div class="fone-tela">${tela}</div></div>`;
function telaBloqueada(hora, data, notifs) {
  return `<div class="bloq"><p class="bloq-hora">${esc(hora)}</p><p class="bloq-data">${esc(data)}</p>${notifs.map((n, i) =>
    `<div class="notif${n.nx ? " notif-nx" : ""}" style="--n:${i}"><span class="notif-ic ${n.nx ? "nx" : "wa"}">${n.nx ? `<svg class="nx-mono"><use href="#nx-mono"/></svg>` : `<svg><use href="#ic-wa"/></svg>`}</span>` +
    `<div><b>${esc(n.titulo)}</b><span>${esc(n.texto)}</span><small>${esc(n.quando)}</small></div></div>`).join("")}</div>`;
}

/* ---------- estados vazios, avisos ---------- */
const FIO_VAZIO = `<svg class="fio-vazio" viewBox="0 0 64 24" aria-hidden="true"><path d="M6 12H58"/><circle cx="6" cy="12" r="3"/><circle cx="32" cy="12" r="3"/><circle cx="58" cy="12" r="3"/><circle class="conta-luz" cx="6" cy="12" r="3.2"/></svg>`;
function cartaoVazio({ titulo, texto, botoes = "", erro = false }) {
  // sem emoji em destaque: um fio com a conta de luz esperando no 1º nó; o "!" só para erro
  return `<div class="vazio-card${erro ? " erro" : ""}"><span class="vazio-ic" aria-hidden="true">${erro ? `<span class="erro-ic">!</span>` : FIO_VAZIO}</span>` +
    `<div><h2>${titulo}</h2><p>${texto}</p>${botoes ? `<div class="acoes">${botoes}</div>` : ""}</div></div>`;
}
const carregandoHtml = msg => `<p class="carregando"><i aria-hidden="true"></i>${esc(msg)}</p>`;
/** Esqueleto com a geometria real (herói, régua, gráfico com 30 tocos). */
function esqueletoHtml(msg) {
  const tocos = Array.from({ length: 30 }, (_, i) => `<i class="sk-bloco" style="height:${30 + ((i * 37) % 55)}%"></i>`).join("");
  return `<div class="esqueleto-in" role="status" aria-live="polite"><span class="sr-only">${esc(msg)}</span>
    <div class="card card-hero sk sk-hero" aria-hidden="true"><div class="sk-l"><i class="sk-bloco sk-linha" style="width:30%;height:1rem"></i>
      <i class="sk-bloco sk-linha"></i><i class="sk-bloco sk-linha" style="width:80%"></i><div class="sk-trilha"><i class="sk-bloco"></i><i class="sk-bloco"></i><i class="sk-bloco"></i></div></div>
      <i class="sk-bloco sk-fone"></i></div>
    <div class="card regua sk" aria-hidden="true" style="padding:1.1rem"><div class="sk-regua">${"<i class=\"sk-bloco\"></i>".repeat(6)}</div></div>
    <div class="card sk" aria-hidden="true"><div class="sk-chart">${tocos}</div></div></div>`;
}

function htmlSemAnuncios() {
  const ligadas = ((S.dados && S.dados.integracoes) || []).filter(i => i.ativo);
  const btnAj = gestor() ? `<button class="pill pill-ink" type="button" data-ir="ajustes">Abrir Ajustes</button>` : "";
  if (S.demo) return cartaoVazio({ titulo: "Sem números no período", texto: "Escolha outro período." });
  if (ligadas.length) {
    const comErro = ligadas.find(i => /^erro/i.test(i.status || ""));
    if (comErro) return cartaoVazio({
      erro: true, titulo: `A leitura do ${nomePlat(comErro.canal)} deu erro`,
      texto: `${esc(comErro.status)}. ${gestor() ? "Confira as credenciais em Ajustes." : "A Nexus já foi avisada e está vendo isso."}`, botoes: btnAj,
    });
    const nomes = ligadas.map(i => nomePlat(i.canal)).join(" e ");
    return cartaoVazio({
      titulo: `${nomes} ${ligadas.length > 1 ? "conectados" : "conectado"} — esperando a primeira leitura`,
      texto: "O servidor lê os anúncios de hora em hora. Os números aparecem aqui sozinhos, sem precisar fazer nada.", botoes: btnAj,
    });
  }
  return gestor()
    ? cartaoVazio({ titulo: "Nenhum anúncio conectado ainda", texto: "Conecte o Meta e/ou o Google deste cliente em Ajustes. A primeira leitura chega em até 1 hora.",
        botoes: `<button class="pill pill-ink" type="button" data-ir="ajustes">Conectar em Ajustes</button>` })
    : cartaoVazio({ titulo: "Os anúncios ainda não começaram", texto: "Os números aparecem aqui assim que os anúncios começarem a rodar. Enquanto isso, a aba Pacientes já funciona: dá para registrar cada paciente que chegar.",
        botoes: `<button class="pill pill-ink" type="button" data-ir="pacientes">Ir para Pacientes</button>` });
}

/** Aviso rápido. tipo: ok · erro · nota (neutro). acao = { rotulo, fn } vira um botão (ex.: "Desfazer", 5 s). */
function toast(msg, tipo = "ok", acao = null) {
  const t = $("#toast");
  clearTimeout(t._t); clearTimeout(t._t2);
  t.className = "toast" + (tipo === "erro" ? " erro" : tipo === "nota" ? " nota" : "") + (acao ? " com-acao" : "");
  t.textContent = "";
  const m = document.createElement("span");
  m.textContent = msg;
  t.appendChild(m);
  const some = () => { t.classList.remove("on"); t._t2 = setTimeout(() => { t.textContent = ""; t.classList.remove("com-acao"); }, 400); };
  if (acao) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "toast-acao"; b.textContent = acao.rotulo;
    b.addEventListener("click", () => { clearTimeout(t._t); some(); acao.fn(); }, { once: true });
    t.appendChild(b);
  }
  requestAnimationFrame(() => t.classList.add("on"));
  t._t = setTimeout(some, acao ? 5000 : tipo === "erro" ? 6000 : 3600);
}
function ocupado(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  if (on) btn.setAttribute("aria-busy", "true"); else btn.removeAttribute("aria-busy");
}
function avisoForm(el, msg, erro) {
  if (!el) return;
  el.textContent = msg;
  el.className = "aj-st " + (erro ? "erro" : "ok");
}
async function copiar(txt, btn) {
  try { await navigator.clipboard.writeText(txt); }
  catch {
    const ta = Object.assign(document.createElement("textarea"), { value: txt });
    ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch { /* sem área de transferência */ }
    ta.remove();
  }
  if (!btn) return;
  if (!btn.dataset.rotulo) btn.dataset.rotulo = btn.textContent;
  btn.textContent = "Copiado ✓";
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = btn.dataset.rotulo; }, 1600);
}

/* ============================================================
   3. VISÃO GERAL
   ============================================================ */
const janela = () => { const de = M.R - S.dias + 1; return { de, ate: M.R, deA: de - S.dias, ateA: de - 1 }; };
const campanhas = () => Object.values(M.CAMP).filter(c => c.plat && (!S.plat || c.plat === S.plat));

/** Os números do período ativo — a ÚNICA conta do herói, da régua, do curta e do simulador.
    retorno = tratamentos ÷ (anúncios + gestão); com uma plataforma só, ÷ anúncios. */
function numerosPeriodo() {
  const { de, ate, deA, ateA } = janela(), f = { plat: S.plat };
  const t = M.consolidar(M.linhasDe(de, ate, f)), ta = M.consolidar(M.linhasDe(deA, ateA, f));
  const c = M.crmTot(de, ate, f), ca = M.crmTot(deA, ateA, f);
  const roas = t.gasto ? c.receita / t.gasto : null;
  const fee = S.plat ? 0 : (M.CFG.fee || 0) * S.dias / 30;
  const custoTotal = t.gasto + fee;
  const retorno = S.plat ? roas : (custoTotal ? c.receita / custoTotal : null);
  return { de, ate, deA, ateA, f, t, ta, c, ca, roas, fee, custoTotal, retorno, dias: S.dias, plat: S.plat };
}

function renderGeral() {
  const vazio = semAnuncios();
  $("#vazio-geral").hidden = !vazio;
  $("#corpo-geral").hidden = vazio;
  if (vazio) { $("#vazio-geral").innerHTML = htmlSemAnuncios(); renderSimulador(); return; }

  const { de, t, ta, c, ca, roas, retorno } = numerosPeriodo();
  const CFG = M.CFG;
  renderDesdeVisita();

  // herói — a frase que a doutora lê em 3 segundos
  $("#hero-periodo").textContent = `Últimos ${S.dias} dias${S.plat ? " · só " + nomePlat(S.plat) : ""}`;
  $("#hero-frase").innerHTML =
    `Os anúncios trouxeram <b>${int(c.conversas)}</b> ${c.conversas === 1 ? "conversa" : "conversas"} no WhatsApp, ` +
    `<b>${int(c.agendadas)}</b> ${c.agendadas === 1 ? "avaliação agendada" : "avaliações agendadas"} e ` +
    `<b>${int(c.fecharam)}</b> <em>${c.fecharam === 1 ? "paciente novo" : "pacientes novos"}</em>.`;

  // a trilha 106 → 44 → 13, ligada por um fio de bronze
  const passo = (v, k, rot, taxa) => `<div class="tr-passo">${taxa == null ? `<span class="tr-no" aria-hidden="true"></span>` : `<span class="tr-taxa" title="de uma etapa para a outra">${pc(taxa, 0)}</span>`}` +
    `<b class="tr-n" data-n="${v}" data-f="int" data-k="${k}">${int(v)}</b><span class="tr-l">${rot}</span></div>`;
  const tx1 = razao(c.agendadas, c.conversas), tx2 = razao(c.fecharam, c.agendadas);
  $("#trilha").innerHTML =
    `<svg class="fio" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="fio-h" pathLength="1" d="M0 50H100"/><path class="fio-v" pathLength="1" d="M50 0V100"/></svg>` +
    `<span class="fio-conta" aria-hidden="true"></span>` +
    passo(c.conversas, "h-conv", c.conversas === 1 ? "conversa no WhatsApp" : "conversas no WhatsApp", null) +
    passo(c.agendadas, "h-ag", c.agendadas === 1 ? "avaliação agendada" : "avaliações agendadas", fin(tx1) ? tx1 : 0) +
    passo(c.fecharam, "h-fe", c.fecharam === 1 ? "paciente novo" : "pacientes novos", fin(tx2) ? tx2 : 0);

  // a conta em linguagem de consultório (o MESMO retorno de sempre, só reescrito)
  $("#hero-conta").innerHTML = `
    <div class="hc"><span class="hc-l">No consultório</span>
      <p class="hc-f"><b data-n="${c.receita}" data-f="brl0" data-k="h-rec">${brl0(c.receita)}</b> em tratamentos</p>
      <small>estimativa pelo valor de cada tratamento</small></div>
    <div class="hc hc-x"><span class="hc-l">${rotT(S.plat ? "hero.retornoPlat" : "hero.retorno")}${gestor() && fin(retorno) ? ` · ${dec(retorno, 1)}x` : ""}</span>
      <p class="hc-f">${fin(retorno) ? `Cada R$ 1 ${S.plat ? "em anúncio" : "investido"} virou <b>${brl(retorno)}</b>` : "Sem investimento no período"}</p>
      <small>${S.plat ? "tratamentos ÷ investimento em anúncios" : "tratamentos ÷ (anúncios + gestão)"}</small></div>`;

  // o celular de verdade: tela bloqueada recebendo as conversas vindas de anúncio
  const hoje = M.dataDe(M.R + 1);
  const recentes = M.LEADS.filter(L => L.plat && L.i <= M.R && (!S.plat || L.plat === S.plat))
    .sort((a, b) => (b.i - a.i) || String(b.id).localeCompare(String(a.id), "pt-BR", { numeric: true })).slice(0, 3);
  const quando = i => { const d = M.R - i; return d <= 0 ? "ontem" : d === 1 ? "anteontem" : `há ${d + 1} dias`; };
  const notifs = [{ nx: true, titulo: "Nexus · Tráfego", texto: semMarcas(M.relDiario(M.R).split("\n")[0]), quando: "08:00" }]
    .concat(recentes.map(L => {
      const k = L.cri && M.CRI[L.cri], cp = M.CAMP[L.camp];
      return { titulo: `${nomeCurto(L.nome)} · via anúncio`, texto: `Chamou pelo anúncio «${(k && k.curto) || (cp && cp.curto) || "anúncio"}»`, quando: quando(L.i) };
    }));
  $("#hero-fone").innerHTML = foneHtml(telaBloqueada("08:00", dataLonga(hoje), notifs), "fone-hero", 6);

  // régua de instrumentos: 6 células, número + período anterior tracejado por baixo
  const meta = CFG.cpaAlvo;
  const sd = M.porDia(S.plat), idx = Array.from({ length: S.dias }, (_, n) => de + n), idxA = idx.map(i => i - S.dias);
  const par = fn => [idx.map(fn), idxA.map(i => (i < 0 ? null : fn(i)))];
  const m7 = arr => i => (i < 0 ? null : M.media7(arr, i));
  const acum = lista => lista.reduce((acc, i) => (acc.push(i < 0 ? null : (acc[acc.length - 1] || 0) + sd.rec[i]), acc), []);
  const cpa7 = i => { if (i < 0) return null; const g = M.soma7(sd.meta, i) + M.soma7(sd.google, i), n = M.soma7(sd.conv, i); return n ? g / n : null; };
  const dif = fin(t.cpa) ? Math.abs(t.cpa - meta) / meta * 100 : null;
  const K = [
    { k: "k-inv", l: "Investido em anúncios", v: t.gasto, a: ta.gasto, f: "brl0", s: "neutro", sp: par(i => sd.meta[i] + sd.google[i]) },
    { k: "k-cpa", l: "Custo por conversa", v: t.cpa, a: ta.cpa, f: "brl", s: "baixo", medidor: true,
      extra: !fin(t.cpa) ? `meta ${brl(meta)}` : t.cpa <= meta ? `meta ${brl(meta)} · ${pc(dif, 0)} abaixo` : `meta ${brl(meta)} · ${pc(dif, 0)} acima`,
      sp: par(cpa7) },
    { k: "k-conv", l: "Conversas no WhatsApp", v: c.conversas, a: ca.conversas, f: "int", s: "cima", sp: par(m7(sd.conv)) },
    { k: "k-ag", l: "Avaliações agendadas", v: c.agendadas, a: ca.agendadas, f: "int", s: "cima", sp: par(m7(sd.ag)) },
    { k: "k-fe", l: "Pacientes novos", v: c.fecharam, a: ca.fecharam, f: "int", s: "cima", sp: par(m7(sd.fe)) },
    { k: "k-rec", l: "Tratamentos fechados", v: c.receita, a: ca.receita, f: "brl0", s: "cima",
      // a clínica lê a conta do herói (com a gestão); o "x" só anúncios fica para o gestor
      extra: !gestor() ? "estimativa pelo valor de cada tratamento" : fin(roas) ? `${dec(roas, 1)}x o investido em anúncios` : "", sp: [acum(idx), acum(idxA)] },
  ];
  // conexão parada: as células que dependem da leitura dos anúncios avisam de que dia é o número
  const parada = estadoInteg().erros.filter(e => !S.plat || e.canal === S.plat);
  const notaParada = parada.map(e => `${nomePlat(e.canal)}: leitura parada${e.sync ? ` em ${FMT_DDMM.format(new Date(e.sync))}` : ""}`).join(" · ");
  const DE_ANUNCIO = new Set(["k-inv", "k-cpa", "k-conv"]);
  const chipVar = k => {
    const v = variacao(k.v, k.a);
    if (v == null) return `<span class="var var-neutro">sem base</span>`;
    const bom = k.s === "cima" ? v >= 0 : k.s === "baixo" ? v <= 0 : null;
    const cls = bom == null || Math.abs(v) < 1 ? "var-neutro" : bom ? "var-bom" : "var-ruim";
    return `<span class="var ${cls}">${v >= 0 ? "▲" : "▼"} ${pc(Math.abs(v), 0)}</span>`;
  };
  $("#kpis").innerHTML = K.map(k => `
    <div class="kpi">
      <span class="kpi-l">${k.l}</span>
      <span class="kpi-v"><span ${fin(k.v) ? `data-n="${k.v}" data-f="${k.f}" data-k="${k.k}"` : ""}>${fmtN(k.v, k.f)}</span></span>
      <span class="kpi-row">${chipVar(k)}<span class="kpi-ctx">vs. ${S.dias} dias antes</span></span>
      ${k.medidor ? `<div class="meter" style="--w:${fin(t.cpa) ? Math.min(t.cpa / (meta * 2), 1) * 100 : 0}%;--m:50%" aria-hidden="true"><i></i><b title="meta"></b></div>` : ""}
      ${k.extra ? `<span class="kpi-extra">${k.extra}</span>` : ""}
      ${notaParada && DE_ANUNCIO.has(k.k) ? `<span class="kpi-parada"><svg aria-hidden="true"><use href="#ic-sinal"/></svg>${esc(notaParada)}</span>` : ""}
      ${spark(k.sp[0], S.comparar ? k.sp[1] : [], de)}
    </div>`).join("");

  desenharChart("troca");
  renderFunil(t, c);
  renderMeses();
  renderLeitura(t, ta, c);
  renderRitmo();
  renderSimulador();
}

function serieDia(de, ate, plat) {
  const sd = M.porDia(plat), out = [];
  for (let i = de; i <= ate; i++) out.push(i < 0 ? null : { i, meta: sd.meta[i], google: sd.google[i], conv: sd.conv[i], convMedia: M.media7(sd.conv, i) });
  return out;
}

/** modo: "troca" (filtro mudou: barras interpolam, linha faz crossfade) · null (redesenho puro, ex.: resize). */
function desenharChart(modo) {
  const el = $("#chart-dia");
  if (!M || semAnuncios()) return;
  // sem largura ainda (primeiro paint, aba oculta): o ResizeObserver redesenha quando houver
  if (!el.clientWidth) { el._pendente = true; return; }
  el._pendente = false;
  el._w = el.clientWidth;
  const { de, ate, deA, ateA } = janela(), serie = serieDia(de, ate, S.plat), ant = serieDia(deA, ateA, S.plat);
  const W = Math.max(300, Math.round(el.clientWidth)), H = W < 560 ? 230 : 280;
  const P = { l: W < 560 ? 50 : 60, r: 30, t: 14, b: 30 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
  const maxG = niceMax(Math.max(1, ...serie.map(d => d.meta + d.google)));
  const maxC = Math.max(4, Math.ceil(Math.max(...serie.map(d => d.convMedia), ...ant.filter(Boolean).map(d => d.convMedia)) * 1.1 / 4) * 4);
  const bw = iw / serie.length, base = P.t + ih;
  const y = v => base - v / maxG * ih, yc = v => base - v / maxC * ih;
  const bloco = el.closest("[data-cena]");
  const troca = modo === "troca" && FX && ANIM && FX.assentado(bloco) && el.querySelector("svg");
  const foto = troca ? FX.fotografar(el, ".bars rect", "data-id") : null;

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Investimento diário por plataforma e conversas no WhatsApp nos últimos ${S.dias} dias">`;
  for (let k = 0; k <= 4; k++) {
    const yy = y(maxG * k / 4);
    s += `<line class="gl" x1="${P.l}" x2="${W - P.r}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
    s += `<text x="${P.l - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end">${brl0(maxG * k / 4)}</text>`;
    s += `<text x="${W - P.r + 8}" y="${(yy + 4).toFixed(1)}">${maxC * k / 4}</text>`;
  }
  s += `<rect class="feixe" x="${P.l}" y="${P.t}" width="28" height="${ih}"/>`;
  s += `<g class="bars">`;
  serie.forEach((d, n) => {
    const x = P.l + n * bw + bw * .17, w = Math.max(1.5, bw * .66), rx = Math.min(3, w / 2);
    if (d.meta > 0) s += `<rect class="bm" data-i="${d.i}" data-id="m${d.i}" x="${x.toFixed(1)}" y="${y(d.meta).toFixed(1)}" width="${w.toFixed(1)}" height="${(base - y(d.meta)).toFixed(1)}" rx="${rx}" style="--k:${n}"/>`;
    if (d.google > 0) s += `<rect class="bg" data-i="${d.i}" data-id="g${d.i}" x="${x.toFixed(1)}" y="${y(d.meta + d.google).toFixed(1)}" width="${w.toFixed(1)}" height="${(y(d.meta) - y(d.meta + d.google)).toFixed(1)}" rx="${rx}" style="--k:${n}"/>`;
  });
  s += `</g>`;
  // marcos (claquetes): linha tracejada creme no dia + a claquete no topo
  for (const mk of marcosAtuais()) {
    const i = iDeIso(mk.d), n = i - de;
    if (n < 0 || n >= serie.length) continue;
    const x = (P.l + n * bw + bw / 2).toFixed(1);
    s += `<g class="marco${mk.exemplo ? " exemplo" : ""}" data-i="${i}"><line x1="${x}" x2="${x}" y1="${P.t + 16}" y2="${base}"/><use href="#ic-claq" x="${(+x - 8).toFixed(1)}" y="${P.t - 4}" width="16" height="16"/></g>`;
  }
  const pts = serie.map((d, n) => [P.l + n * bw + bw / 2, yc(d.convMedia)]);
  const dl = traco(pts);
  const ptsA = ant.map((d, n) => (d ? [P.l + n * bw + bw / 2, yc(d.convMedia)] : null)).filter(Boolean);
  const cls = troca ? " troca" : "";
  if (ptsA.length > 1) s += `<path class="ant${cls}" d="${traco(ptsA)}"/>`;
  s += `<path class="area${cls}" d="${dl} L${pts[pts.length - 1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z"/>`;
  s += `<path class="lin${cls}" pathLength="1" d="${dl}"/>`;
  const passo = Math.ceil(serie.length / (W < 560 ? 4 : 7));
  serie.forEach((d, n) => { if (n % passo === 0) s += `<text x="${(P.l + n * bw + bw / 2).toFixed(1)}" y="${H - 9}" text-anchor="middle">${M.ddmm(d.i)}</text>`; });
  s += `<circle class="ponto" r="4.5" cx="-20" cy="-20"/></svg>`;
  if (el._esconder) el._esconder();   // redesenho não pode herdar a leitura do dia antigo
  el.innerHTML = s;
  el.classList.toggle("sem-ant", !S.comparar);
  el._d = { serie, ant, P, bw, W, yc };
  if (foto) FX.flip(el, ".bars rect", foto, "data-id");
  if (el._canetaPendente) { el._canetaPendente = false; canetaDiario(); }
}
/** A caneta de luz desenha a linha de conversas quando o gráfico entra em quadro. */
function canetaDiario() {
  const el = $("#chart-dia"), p = el.querySelector(".lin");
  if (!p) { el._canetaPendente = true; return; }
  if (FX) FX.caneta(p, { atraso: FX.MOV.tUi });
}

function ligarChart() {
  const el = $("#chart-dia"), leg = $("#chart-leg"), vivo = $("#chart-vivo");
  const padrao = leg.innerHTML;
  let n = -1, raf = 0, alvoX = 0, xAtual = null, tVivo = 0, fixo = false;   // fixo: o gestor clicou num dia para marcar
  const feixe = () => el.querySelector(".feixe");
  const passo = () => {
    raf = 0;
    const f = feixe();
    if (!f || xAtual == null) return;
    xAtual += (alvoX - xAtual) * .25;
    f.setAttribute("x", xAtual.toFixed(1));
    if (Math.abs(alvoX - xAtual) > .3) raf = requestAnimationFrame(passo);
  };
  const esconder = () => {
    if (n < 0 && !el.classList.contains("foco")) return;
    n = -1; xAtual = null;
    el.classList.remove("foco");
    leg.innerHTML = padrao;
    $$(".bars rect.ativo", el).forEach(r => r.classList.remove("ativo"));
    document.dispatchEvent(new CustomEvent("nx:dia", { detail: { i: null } }));
  };
  const mostrarDia = k => {
    const d = el._d, svg = el.querySelector("svg");
    if (!d || !svg || !M) return;
    k = Math.max(0, Math.min(d.serie.length - 1, k));
    n = k;
    const p = d.serie[k], cx = d.P.l + k * d.bw + d.bw / 2, cy = d.yc(p.convMedia);
    alvoX = cx - 14;
    const f = feixe();
    if (!ANIM || xAtual == null) { xAtual = alvoX; f.setAttribute("x", xAtual.toFixed(1)); }
    else if (!raf) raf = requestAnimationFrame(passo);
    const pt = svg.querySelector(".ponto");
    pt.setAttribute("cx", cx.toFixed(1)); pt.setAttribute("cy", cy.toFixed(1));
    $$(".bars rect", svg).forEach(r => r.classList.toggle("ativo", +r.dataset.i === p.i));
    el.classList.add("foco");
    const dt = M.dataDe(p.i), g = p.meta + p.google, cpc = p.conv ? g / p.conv : null, a = d.ant[k];
    // legenda fixa no cabeçalho: o título do cartão nunca some (Google manda conversão fracionada: plural/int)
    leg.innerHTML = `<b>${SEMANA[dt.getDay()]} · ${M.ddmm(p.i)}</b> — Meta <span class="v">${brl(p.meta)}</span> · Google <span class="v">${brl(p.google)}</span> · ` +
      `<span class="v">${plural(p.conv, "conversa", "conversas")}</span>${fin(cpc) ? ` · <span class="v">${brl(cpc)}</span> por conversa` : ""}` +
      `${a ? ` · antes: <span class="v">${int(a.conv)}</span>` : ""}`;
    const mk = marcoDoDia(p.i);
    if (mk) leg.innerHTML += ` · <span class="marco-leg"><svg aria-hidden="true"><use href="#ic-claq"/></svg>Marco${mk.exemplo ? " (exemplo)" : ""}: ${esc(mk.t)}</span>`;
    clearTimeout(tVivo);
    tVivo = setTimeout(() => { vivo.textContent = leg.textContent; }, 350);
    document.dispatchEvent(new CustomEvent("nx:dia", { detail: { i: p.i } }));
  };
  const indice = e => {
    const d = el._d, svg = el.querySelector("svg");
    if (!d || !svg) return -1;
    const r = svg.getBoundingClientRect(), k = r.width / d.W;
    return Math.floor(((e.clientX - r.left) / k - d.P.l) / d.bw);
  };
  const peloPonteiro = e => {
    const d = el._d, svg = el.querySelector("svg");
    if (!d || !svg || (fixo && e.type === "pointermove")) return;
    const r = svg.getBoundingClientRect(), k = r.width / d.W;
    const i = Math.floor(((e.clientX - r.left) / k - d.P.l) / d.bw);
    if (i < 0 || i >= d.serie.length) return esconder();
    mostrarDia(i);
  };
  const fixar = k => { const d = el._d; if (!d || !gestor() || k < 0 || k >= d.serie.length) return; fixo = true; mostrarDia(k); abrirMarco(d.serie[k].i); };
  el._esconder = () => { fixo = false; esconder(); };
  el._soltar = () => { fixo = false; esconder(); };
  el.addEventListener("pointermove", peloPonteiro);
  el.addEventListener("pointerdown", e => { if (fixo) return; peloPonteiro(e); });
  // gestor: clicar num dia fixa a mira e abre o "Marcar dd/mm" embaixo do gráfico
  el.addEventListener("click", e => { if (gestor()) fixar(indice(e)); });
  el.addEventListener("pointerleave", e => { if (e.pointerType !== "touch" && !fixo) esconder(); });
  document.addEventListener("pointerdown", e => {
    if (el.contains(e.target) || $("#marco-form").contains(e.target)) return;
    if (fixo) fecharMarco(false); else esconder();
  });
  // teclado: o gráfico vira um "scrubber" (←/→ troca o dia, Home/End vão às pontas, Esc sai)
  el.addEventListener("keydown", e => {
    const d = el._d;
    if (!d) return;
    const ult = d.serie.length - 1;
    const mapa = { ArrowRight: n < 0 ? 0 : n + 1, ArrowLeft: n < 0 ? ult : n - 1, Home: 0, End: ult };
    if (e.key === "Escape") { if (fixo) fecharMarco(true); else esconder(); return; }
    if (e.key === "Enter" && n >= 0 && gestor()) { e.preventDefault(); fixar(n); return; }
    if (!(e.key in mapa)) return;
    e.preventDefault();
    if (fixo) { fixo = false; $("#marco-form").hidden = true; S.marcoFixo = null; }
    mostrarDia(mapa[e.key]);
  });
  el.addEventListener("blur", () => { if (!fixo) esconder(); });
}

function renderFunil(t, c) {
  const leigo = !gestor();
  const cadaCem = (r, quem, fez) => {
    if (!fin(r)) return "";
    return r >= 1 ? `de cada 100 que ${quem}, ${Math.round(r)} ${fez}` : `de cada 1.000 que ${quem}, ${Math.round(r * 10)} ${fez}`;
  };
  const rConv = razao(c.conversas, t.cliques);
  const E = [
    { l: rot("funil.exibido"), s: "vezes na tela", v: t.impressoes },
    { l: rot("funil.cliques"), s: "no anúncio", v: t.cliques, r: t.ctr, rl: leigo ? cadaCem(t.ctr, "viram", "tocaram") : "CTR (Meta e Google juntos)", solto: leigo },
    { l: "Conversas", s: "no WhatsApp", v: c.conversas, r: rConv, solto: leigo,
      rl: leigo ? (fin(rConv) && rConv >= 1 ? `${Math.round(rConv)} de cada 100 que tocaram chamaram` : cadaCem(rConv, "tocaram", "chamaram")) : "dos cliques" },
    { l: "Agendaram", s: "avaliação", v: c.agendadas, r: razao(c.agendadas, c.conversas), rl: "das conversas", faixa: [30, 50] },
    { l: "Compareceram", s: "à consulta", v: c.compareceram, r: razao(c.compareceram, c.agendadas), rl: "dos agendados", faixa: [60, 80] },
    { l: "Fecharam", s: "tratamento", v: c.fecharam, r: razao(c.fecharam, c.compareceram), rl: "de quem veio", faixa: [30, 50] },
  ];
  const mx = Math.log10(Math.max(...E.map(e => e.v)) + 1) || 1;
  $("#funil").innerHTML = E.map((e, n) => {
    const w = Math.max(7, Math.log10(e.v + 1) / mx * 100), fora = w < 24;
    const r = fin(e.r) ? Math.min(e.r, 100) : null;
    let st = "";
    if (e.faixa && r != null) {
      // a clínica lê "dentro do normal"; o gestor vê a meta com a faixa (e o leigo no title)
      const fx = leigo ? "" : ` (${e.faixa[0]}–${e.faixa[1]}%)`;
      st = r > e.faixa[1] ? `<span class="st st-ok">${rotT("meta.acima")}${fx}</span>`
        : r >= e.faixa[0] ? `<span class="st st-ok">${rotT("meta.na")}${fx}</span>`
        : `<span class="st st-warn">${rotT("meta.abaixo")}${fx}</span>`;
    }
    const taxa = r == null ? "" : e.solto ? e.rl : `${pc(r, r < 10 ? 1 : 0)} ${e.rl}`;
    return `<div class="fun-row">
        <span class="fun-l">${e.l}<small>${e.s}</small></span>
        <div class="fun-bar"><div class="fun-fill${fora ? " out" : ""}" style="--w:${w.toFixed(1)}%;--i:${n}"><span data-n="${e.v}" data-f="int" data-k="fun-${n}">${int(e.v)}</span></div></div>
        ${r != null ? `<p class="fun-rate">${taxa} ${st}</p>` : ""}
      </div>`;
  }).join("");
}

function renderMeses() {
  const todos = M.mesesDados(), fp = { plat: S.plat };
  const lista = todos.filter(m => m.ate - m.de >= 9 || m.ate === M.R).slice(-5);
  const rit = M.ritmoMes(M.R);
  const dados = lista.map(m => {
    const c = M.crmTot(m.de, m.ate, fp), atual = m.ate === M.R && !m.completo;
    // projeção do mês corrente (calculada aqui, no painel): fecharam ÷ dias passados × dias do mês
    const proj = atual && rit.pass > 0 ? Math.round(c.fecharam / rit.pass * rit.diasMes) : null;
    return { m, t: M.consolidar(M.linhasDe(m.de, m.ate, fp)), c, parcial: !m.completo, atual, proj: proj != null && proj > c.fecharam ? proj : null };
  });
  const el = $("#mes-a-mes");
  if (!dados.length) { el.innerHTML = `<p class="vazio">Ainda não há meses para comparar.</p>`; return; }
  const v0 = dados[0].c.fecharam, ult = dados[dados.length - 1], vN = ult.c.fecharam;
  const pn = v => (v === 1 ? "paciente novo" : "pacientes novos");
  const parc = ult.parcial ? ` <span class="mam-parc">(${MES3[ult.m.mes]}. parcial)</span>` : "";
  $("#mam-titulo").innerHTML = dados.length < 2 ? `${vN} ${pn(vN)} em ${MESES[ult.m.mes]}${parc}`
    : v0 === vN ? `${vN} ${pn(vN)} por mês, estável${parc}`
    : `De ${v0} para ${vN} ${pn(vN)} por mês${parc}`;
  const acum = todos.reduce((s, m) => s + M.crmTot(m.de, m.ate, fp).fecharam, 0);
  $("#mam-sub").textContent = `${plural(acum, "paciente novo", "pacientes novos")} vindos dos anúncios desde ${MESES[todos[0].mes]}.`;

  const bloco = el.closest("[data-cena]");
  const troca = FX && ANIM && FX.assentado(bloco) && el.querySelector(".mam-bar");
  const foto = troca ? FX.fotografar(el, ".mam-bar", "data-m") : null;
  const mx = Math.max(1, ...dados.map(d => Math.max(d.c.fecharam, d.proj || 0)));
  const n = dados.length, pct = v => Math.max(4, v / mx * 100);
  const tend = dados.map((d, k) => `${k ? "L" : "M"}${((k + .5) / n * 100).toFixed(2)} ${(150 - pct(d.c.fecharam) * 1.5).toFixed(1)}`).join(" ");
  el.innerHTML = `<div class="mam-area">
      ${n > 1 ? `<svg class="mam-tend" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true"><path d="${tend}"/></svg>` : ""}
      ${dados.map((d, k) => {
        const h = pct(d.c.fecharam), hp = d.proj ? pct(d.proj) : null, dentro = hp && hp - h < 20 && h > 22;
        return `<div class="mam-col${d.parcial ? " parcial" : ""}" style="--i:${k}"><div class="mam-bar-box" style="--h:${h.toFixed(1)}%${hp ? `;--hp:${hp.toFixed(1)}%` : ""}">
          ${hp ? `<span class="mam-fantasma" aria-hidden="true"></span><span class="mam-proj">projeção ${d.proj}</span>` : ""}
          <div class="mam-bar" data-m="${d.m.ano}-${d.m.mes}"></div>
          <b class="mam-n${dentro ? " dentro" : ""}">${d.c.fecharam}</b></div></div>`;
      }).join("")}
    </div>
    <div class="mam-rot">${dados.map(d => `<div><span class="mam-m">${MES3[d.m.mes]}${d.parcial ? " · parcial" : ""}</span>
      <span class="mam-s">${plural(d.t.conversoes, "conversa", "conversas")} · ${brl(d.t.cpa)} cada</span></div>`).join("")}</div>`;
  if (foto) FX.flip(el, ".mam-bar", foto, "data-m");
}

function linhasCamp() {
  const { de, ate } = janela();
  return campanhas().map(c => {
    const t = M.consolidar(M.linhasDe(de, ate, { camp: c.id }));
    if (!t.gasto) return null;
    const k = M.crmTot(de, ate, { camp: c.id });
    return {
      c, t, k,
      cpp: k.fecharam ? t.gasto / k.fecharam : null,       // custo por paciente
      cpag: k.agendadas ? t.gasto / k.agendadas : null,    // custo por avaliação agendada
      roas: t.gasto ? k.receita / t.gasto : null,
    };
  }).filter(Boolean);
}

function renderLeitura(t, ta, c) {
  const out = [], meta = M.CFG.cpaAlvo;
  if (fin(t.cpa)) {
    const v = variacao(t.cpa, ta.cpa);
    const vt = v == null ? "" : ` (${v <= 0 ? "caiu" : "subiu"} ${pc(Math.abs(v), 0)} em relação aos ${S.dias} dias anteriores)`;
    out.push(t.cpa <= meta
      ? { k: "bom", h: `Cada conversa no WhatsApp custou <b>${brl(t.cpa)}</b>, dentro da meta de ${brl(meta)}${vt}.` }
      : { k: "aten", h: `Cada conversa no WhatsApp custou <b>${brl(t.cpa)}</b>, acima da meta de ${brl(meta)}${vt}.` });
  }
  // campanha com alerta ativo não pode ser elogiada nem receber verba
  const comAlerta = new Set(M.avaliar(M.R).filter(a => a.regra.nivel === "campanha").map(a => a.chave.split("|")[1]));
  const rows = linhasCamp().filter(r => r.t.gasto >= 40);
  const efic = rows.filter(r => r.k.fecharam > 0 && !comAlerta.has(r.c.id)).sort((a, b) => a.cpp - b.cpp)[0];
  if (efic) out.push({ k: "bom", h: `<b>${esc(efic.c.nome)}</b> é a campanha mais eficiente: cada paciente novo custou ${brl0(efic.cpp)} em anúncio.` });
  const serv = Object.entries(c.serv).sort((a, b) => b[1].v - a[1].v)[0];
  if (serv && c.receita) out.push({ k: "bom", h: `<b>${esc(serv[0])}</b> trouxe ${pc(serv[1].v / c.receita * 100, 0)} do valor em tratamentos fechados (${serv[1].n} de ${c.fecharam} ${c.fecharam === 1 ? "paciente" : "pacientes"}).` });
  const al = M.avaliar(M.R, true)[0];
  // a clínica lê o nome leigo da regra; a mensagem do núcleo só vai quando não tem tecniquês
  if (al) out.push({ k: "aten", h: gestor() ? `Radar: ${esc(al.msg)}`
    : `Radar · <b>${esc(rot(al.regra.id))}</b>: ${/\b(CTR|ROAS|CPA|CPM|impress)/i.test(al.msg) ? esc(LEIGO_LINHA[al.regra.id] || "") : esc(al.msg)}` });
  // Meta × Google: a conversa do Google costuma custar mais, mas chega mais decidida.
  if (!S.plat) {
    const { de } = janela();
    const pm = M.crmTot(de, M.R, { plat: "meta" }), pg = M.crmTot(de, M.R, { plat: "google" });
    if (pm.conversas >= 10 && pg.conversas >= 10) {
      const tm = razao(pm.agendadas, pm.conversas), tg = razao(pg.agendadas, pg.conversas);
      const cm = M.consolidar(M.linhasDe(de, M.R, { plat: "meta" })).cpa, cg = M.consolidar(M.linhasDe(de, M.R, { plat: "google" })).cpa;
      const [a, b, ta2, tb, ca2, cb] = tg >= tm ? ["Google", "Instagram/Facebook", tg, tm, cg, cm] : ["Instagram/Facebook", "Google", tm, tg, cm, cg];
      out.push({ k: "acao", h: `No <b>${a}</b>, de cada 100 conversas ${Math.round(ta2)} viram avaliação (contra ${Math.round(tb)} no ${b}). ${ca2 > cb ? `A conversa custa mais (${brl(ca2)} × ${brl(cb)}), mas chega mais decidida.` : "E ainda sai mais barata."}` });
    }
  }
  $("#leitura").innerHTML = out.slice(0, 5).map((x, n) => `<li class="${x.k}" style="--i:${n}"><span class="lt-n" aria-hidden="true">${p2(n + 1)}</span>` +
    `<p class="lt-t">${x.k === "aten" ? `<span class="lt-tag">atenção</span>` : ""}${x.h}</p></li>`).join("")
    || `<li><span class="lt-n" aria-hidden="true">01</span><p class="lt-t">Sem dados suficientes no período.</p></li>`;
}

function renderRitmo() {
  const m = M.ritmoMes(M.R), orc = M.CFG.orcamento, escala = Math.max(orc, m.proj, 1) * 1.08;
  $("#ritmo-sub").textContent = `${MESES[m.mes]} · dia ${m.pass} de ${m.diasMes} · todas as plataformas`;
  $("#ritmo-h").innerHTML = rotT("ritmo.titulo");
  const w = m.gasto / escala * 100, wp = m.proj / escala * 100, mo = orc / escala * 100;
  const acima = m.proj > orc * 1.02, noLimite = !acima && m.proj >= orc * .98;
  const msg = m.restam === 0 ? `Mês fechado em ${brl0(m.gasto)}.`
    : acima ? `No ritmo atual o mês fecha ${brl0(m.proj - orc)} acima do orçamento. O radar já sugeriu segurar ${brl((m.proj - orc) / m.restam)} por dia.`
    : noLimite ? `No limite: o mês deve fechar em ${brl0(m.proj)}, praticamente no orçamento.`
    : `Dentro do orçamento: o mês deve fechar em ${brl0(m.proj)} (sobram ${brl0(orc - m.proj)}).`;
  $("#ritmo").innerHTML = `
    <div class="ritmo-num"><strong data-n="${m.gasto}" data-f="brl0" data-k="rit">${brl0(m.gasto)}</strong><span>investidos de ${brl0(orc)}</span></div>
    <div class="pbar" style="--w:${w.toFixed(1)}%;--w0:${w.toFixed(1)}%;--w1:${Math.max(0, wp - w).toFixed(1)}%;--m:${mo.toFixed(1)}%"><i></i><u></u><b title="orçamento"></b></div>
    <div class="ritmo-leg"><span>gasto até ontem</span><span>projeção ${brl0(m.proj)}</span><span>▮ orçamento</span></div>
    <p class="ritmo-msg${acima ? " aten" : ""}">${msg}</p>`;
}

/* ============================================================
   4. CAMPANHAS
   ============================================================ */
const COLS_CAMP = [
  ["nome", "Campanha"], ["gasto", "Investido"], ["conv", "Conversas"], ["cpa", "Custo/conversa"], ["ctr", "CTR"],
  ["ag", "Agendadas"], ["fe", "Pacientes"], ["rec", "Tratamentos"], ["roas", "Retorno"],
];
const VAL_CAMP = {
  nome: r => r.c.nome, gasto: r => r.t.gasto, conv: r => r.t.conversoes, cpa: r => r.t.cpa, ctr: r => r.t.ctr,
  ag: r => r.k.agendadas, fe: r => r.k.fecharam, rec: r => r.k.receita, roas: r => r.roas,
};
const pontoCpa = cpa => !fin(cpa) ? "dot-bad" : cpa <= M.CFG.cpaAlvo ? "dot-ok" : cpa <= M.CFG.cpaAlvo * 1.35 ? "dot-warn" : "dot-bad";

function renderCampanhas() {
  const vazio = semAnuncios();
  $("#vazio-campanhas").hidden = !vazio;
  $("#corpo-campanhas").hidden = vazio;
  if (vazio) { $("#vazio-campanhas").innerHTML = htmlSemAnuncios(); return; }

  const rows = linhasCamp(), { key, dir } = S.sort, fv = VAL_CAMP[key], { de } = janela();
  rows.sort((a, b) => {
    const x = fv(a), y = fv(b);
    if (typeof x === "string") return x.localeCompare(y, "pt-BR") * dir;
    return ((fin(x) ? x : -Infinity) - (fin(y) ? y : -Infinity)) * dir;
  });
  const T = M.consolidar(rows.flatMap(r => M.linhasDe(de, M.R, { camp: r.c.id })));
  const K = rows.reduce((a, r) => ({ ag: a.ag + r.k.agendadas, fe: a.fe + r.k.fecharam, rec: a.rec + r.k.receita }), { ag: 0, fe: 0, rec: 0 });
  const th = COLS_CAMP.map(([k, l]) => `<th scope="col"><button type="button" data-sort="${k}"${k === key ? ` aria-sort="${dir < 0 ? "descending" : "ascending"}"` : ""}>${l}</button></th>`).join("");
  $("#tbl-campanhas").innerHTML = rows.length ? `<table>
    <caption class="sr-only">Campanhas nos últimos ${S.dias} dias</caption>
    <thead><tr>${th}</tr></thead>
    <tbody>${rows.map((r, n) => `<tr style="--i:${n}" data-camp="${esc(r.c.id)}">
      <td><div class="nm"><span class="dot ${pontoCpa(r.t.cpa)}" title="custo por conversa vs. meta"></span><div class="nm-t"><span>${esc(r.c.nome)}</span><small><span class="chip chip-${classePlat(r.c.plat)}">${nomePlat(r.c.plat)}</span></small></div></div></td>
      <td>${brl0(r.t.gasto)}</td><td>${int(r.t.conversoes)}</td><td>${brl(r.t.cpa)}</td><td>${pc(r.t.ctr, 2)}</td>
      <td>${r.k.agendadas}</td><td>${r.k.fecharam}</td><td>${brl0(r.k.receita)}</td><td>${fin(r.roas) ? dec(r.roas, 1) + "x" : "—"}</td>
    </tr>`).join("")}</tbody>
    <tfoot><tr><td>Total</td><td>${brl0(T.gasto)}</td><td>${int(T.conversoes)}</td><td>${brl(T.cpa)}</td><td>${pc(T.ctr, 2)}</td>
      <td>${K.ag}</td><td>${K.fe}</td><td>${brl0(K.rec)}</td><td>${T.gasto ? dec(K.rec / T.gasto, 1) + "x" : "—"}</td></tr></tfoot>
  </table>` : `<p class="vazio">Nenhuma campanha com investimento nos últimos ${S.dias} dias${S.plat ? " no " + nomePlat(S.plat) : ""}.</p>`;

  // a situação vem do radar (janela recente), não da média do período — senão a
  // tabela diria "ok" para o criativo que o radar acabou de acusar
  const agora = M.avaliar(M.R), sitDe = id => agora.filter(a => a.chave === `r4|${id}` || a.chave === `r3|${id}`);
  const cris = Object.values(M.CRI).filter(k => k.plat && (!S.plat || k.plat === S.plat)).map(k => ({ k, t: M.consolidar(M.linhasDe(de, M.R, { cri: k.id })) }))
    .filter(x => x.t.gasto > 0).sort((a, b) => b.t.gasto - a.t.gasto);
  $("#tbl-criativos").innerHTML = cris.length ? `<table>
    <caption class="sr-only">Criativos nos últimos ${S.dias} dias</caption>
    <thead><tr><th scope="col">Criativo</th><th scope="col">Investido</th><th scope="col">Impressões</th><th scope="col">CTR</th><th scope="col">Frequência</th><th scope="col">Conversas</th><th scope="col">Custo/conversa</th><th scope="col">Situação agora</th></tr></thead>
    <tbody>${cris.map(({ k, t }, n) => {
      const s = sitDe(k.id), a4 = s.find(a => a.regra.id === "r4"), a3 = s.find(a => a.regra.id === "r3");
      const sit = (a4 ? `<span class="chip chip-bad" title="frequência nos últimos ${a4.regra.janela} dias">fadiga · ${dec(a4.valor, 1)} em ${a4.regra.janela}d</span> ` : "")
        + (a3 ? `<span class="chip chip-warn" title="CTR nos últimos ${a3.regra.janela} dias">CTR ${pc(a3.valor, 2)} em ${a3.regra.janela}d</span>` : "")
        || `<span class="chip chip-ok">ok</span>`;
      const fq = fin(t.freq)
        ? `<span class="fq"><span class="fq-bar${a4 ? " alto" : ""}"><i style="--w:${Math.min(100, t.freq / 4 * 100)}%"></i><b></b></span>${dec(t.freq, 1)}</span>`
        : "—";
      const camp = M.CAMP[k.camp];
      return `<tr style="--i:${n}">
        <td><div class="nm-t"><span>${esc(k.nome)}</span><small>${esc(camp ? camp.curto : "")} · <span class="chip chip-${classePlat(k.plat)}">${nomePlat(k.plat)}</span></small></div></td>
        <td>${brl0(t.gasto)}</td><td>${int(t.impressoes)}</td><td>${pc(t.ctr, 2)}</td><td>${fq}</td><td>${int(t.conversoes)}</td><td>${brl(t.cpa)}</td><td class="sit"><span class="sit-chips">${sit}</span></td>
      </tr>`;
    }).join("")}</tbody>
  </table>` : `<p class="vazio">Nenhum criativo com investimento no período.</p>`;
}

/* ============================================================
   5. PACIENTES — kanban, tabela de origem, donut, gaveta
   ============================================================ */
const COLS_K = [
  ["nova", "Nova conversa", "#9FB4C7"],
  ["agendada", "Avaliação agendada", "#6FA3CF"],
  ["orcamento", "Avaliou · orçamento", "#CF9540"],
  ["fechou", "Fechou (30 dias)", "#7FD1A5"],
  ["parou", "Não seguiu (30 dias)", "#9D9486"],
];
const K_MAX = 8, K_PASSO = 24;
const refParou = L => L.iConsulta ?? L.iAgenda ?? L.i;

function colunaDe(L) {
  const e = M.etapa(L), R = M.R;
  if (e === "fechou") return (L.iConsulta ?? L.i) >= R - 29 ? "fechou" : null;
  if (e === "faltou" || e === "nao_fechou" || e === "perdida") return refParou(L) >= R - 29 ? "parou" : null;
  return e;
}

function quandoLead(L, e) {
  const R = M.R, dd = i => M.ddmm(i);
  if (e === "nova") { const d = R - L.i + 1; return { txt: d <= 0 ? "chamou hoje" : d === 1 ? "chamou ontem" : `chamou há ${d} dias` }; }
  if (e === "agendada") {
    if (L.iConsulta == null || (!S.demo && !(L.bruto && L.bruto.data_consulta))) return { txt: "sem data da consulta", atraso: true };
    const d = L.iConsulta - R;
    if (d <= 0) return { txt: `consulta era em ${dd(L.iConsulta)} — atualizar`, atraso: true };
    return { txt: d === 1 ? "consulta hoje" : d === 2 ? "consulta amanhã" : `consulta em ${dd(L.iConsulta)}` };
  }
  if (e === "orcamento") return { txt: L.iConsulta != null ? `avaliou em ${dd(L.iConsulta)} · orçamento enviado` : "orçamento enviado" };
  if (e === "fechou") return { txt: L.iConsulta != null ? `fechou em ${dd(L.iConsulta)}` : "fechou" };
  if (e === "faltou") return { txt: L.iConsulta != null ? `faltou em ${dd(L.iConsulta)}` : "faltou à consulta" };
  if (e === "nao_fechou") return { txt: "avaliou e não fechou" };
  return { txt: `chamou em ${dd(L.i)} · não agendou` };
}

function cardLead(L, col, n) {
  const e = M.etapa(L);
  const ini = String(L.nome).split(/\s+/).map(p => p[0] || "").join("").slice(0, 2).toUpperCase() || "?";
  const q = quandoLead(L, e), camp = M.CAMP[L.camp];
  // uma ficha estreita não comporta 2 chips: a plataforma vira um ponto de cor (com texto para leitor de tela)
  const origem = L.plat
    ? `<span class="chip chip-camp"><i class="pt pt-${classePlat(L.plat)}" aria-hidden="true"></i><span class="sr-only">${nomePlat(L.plat)}: </span>${esc(camp ? camp.curto : "")}</span>`
    : `<span class="chip chip-neutro">${esc(camp ? camp.curto : "Sem anúncio")}</span>`;
  // em "Não seguiu" a etapa já está escrita na linha de baixo (faltou / não agendou / não fechou): só marca a falta
  const etq = col === "parou" && e === "faltou" ? `<span class="chip chip-bad">${NOME_ETAPA[e]}</span>` : "";
  return `<button type="button" class="lead${S.destacar.has(String(L.id)) ? " destaque" : ""}" data-lead="${esc(String(L.id))}" data-col="${col}" style="--i:${n}" aria-haspopup="dialog" aria-describedby="k-dica">
    <span class="av" style="--c:${AVC[hash(L.nome) % AVC.length]}" aria-hidden="true">${esc(ini)}</span>
    <span><strong>${esc(L.nome)}</strong><span class="lp${q.atraso ? " atrasada" : ""}">${esc(L.servico)} · ${esc(q.txt)}</span>
      <span class="chips">${etq}${origem}${e === "fechou" ? `<span class="val">${brl0(M.valorLead(L))}</span>` : ""}</span></span></button>`;
}

function renderKanban() {
  const g = Object.fromEntries(COLS_K.map(([k]) => [k, []]));
  const q = semAcento(S.busca.trim()), qd = soDigitos(S.busca);
  for (const L of M.LEADS) {
    if (S.plat && L.plat !== S.plat) continue;
    if (q && !(semAcento(L.nome).includes(q) || (qd.length >= 3 && soDigitos(L.telefone).includes(qd)))) continue;
    const col = colunaDe(L);
    if (col && g[col]) g[col].push(L);
  }
  const ord = v => (v == null ? Infinity : v);
  g.nova.sort((a, b) => b.i - a.i);
  g.agendada.sort((a, b) => ord(a.iConsulta) - ord(b.iConsulta));
  g.orcamento.sort((a, b) => (b.iConsulta ?? b.i) - (a.iConsulta ?? a.i));
  g.fechou.sort((a, b) => (b.iConsulta ?? b.i) - (a.iConsulta ?? a.i));
  g.parou.sort((a, b) => refParou(b) - refParou(a));
  let n = 0;
  $("#kanban").innerHTML = COLS_K.map(([k, l, cor]) => {
    const tot = g[k].length, ver = Math.min(tot, S.kVer[k] || K_MAX), resto = tot - ver;
    return `<section class="kcol" data-col="${k}" aria-label="${l}: ${tot} ${tot === 1 ? "paciente" : "pacientes"}">
      <header class="kcol-h"><span><i class="kd" style="background:${cor}"></i>${l}</span><b>${tot}</b></header>
      ${g[k].slice(0, ver).map(L => cardLead(L, k, n++)).join("")}
      ${resto > 0 ? `<button type="button" class="kmore" data-kmais="${k}">Mostrar mais ${Math.min(resto, K_PASSO)} de ${resto}</button>` : ""}
      ${!tot ? `<p class="kmore">${q ? "nenhum encontrado" : "nenhum no momento"}</p>` : ""}
    </section>`;
  }).join("");
}

function renderPacientes() {
  renderKanban();
  ligarArrasto();

  // anúncio × consultório (+ quem chegou sem anúncio, para o dono ver o todo)
  const { de } = janela(), rows = linhasCamp().sort((a, b) => b.k.receita - a.k.receita);
  const orgs = S.plat ? [] : Object.values(M.CAMP).filter(c => !c.plat)
    .map(c => ({ c, k: M.crmTot(de, M.R, { camp: c.id, organicos: true }) }))
    .filter(x => x.k.conversas || x.k.agendadas || x.k.fecharam);
  $("#tbl-origem").innerHTML = rows.length || orgs.length ? `<table>
    <caption class="sr-only">Resultado de cada campanha no consultório, últimos ${S.dias} dias</caption>
    <thead><tr><th scope="col">Origem</th><th scope="col">Conversas</th><th scope="col">Agendaram</th><th scope="col">Vieram</th><th scope="col">Pacientes</th><th scope="col">Tratamentos</th><th scope="col">Custo/paciente</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr style="--i:${i}">
      <td><div class="nm-t"><span>${esc(r.c.nome)}</span><small><span class="chip chip-${classePlat(r.c.plat)}">${nomePlat(r.c.plat)}</span></small></div></td>
      <td>${r.k.conversas}</td><td>${r.k.agendadas}</td><td>${r.k.compareceram}</td><td>${r.k.fecharam}</td><td>${brl0(r.k.receita)}</td><td>${brl0(r.cpp)}</td>
    </tr>`).join("")}${orgs.map(({ c, k }, i) => `<tr class="org" style="--i:${rows.length + i}">
      <td><div class="nm-t"><span>${esc(c.nome)}</span><small><span class="chip chip-neutro">sem anúncio</span></small></div></td>
      <td>${k.conversas}</td><td>${k.agendadas}</td><td>${k.compareceram}</td><td>${k.fecharam}</td><td>${brl0(k.receita)}</td><td>—</td>
    </tr>`).join("")}</tbody>
  </table>` : `<p class="vazio">Nenhuma conversa registrada nos últimos ${S.dias} dias.</p>`;

  // tratamentos fechados (donut)
  const c = M.crmTot(de, M.R, { plat: S.plat });
  const segs = Object.entries(c.serv).sort((a, b) => b[1].v - a[1].v).map(([nome, s], n) => ({ nome, ...s, cor: corServ(nome, n) }));
  $("#donut-sub").textContent = `Pacientes dos anúncios, últimos ${S.dias} dias · estimativa pelo valor de cada tratamento.`;
  if (!c.receita) { $("#donut").innerHTML = `<p class="vazio">Nenhum tratamento fechado no período.</p>`; return; }
  let acc = 0;
  const arcs = segs.map(s => {
    const p = s.v / c.receita * 100, gap = segs.length > 1 ? .8 : 0;
    const d = `<circle class="seg-c" cx="21" cy="21" r="15.915" stroke="${s.cor}" stroke-dasharray="${Math.max(.1, p - gap).toFixed(2)} ${(100 - p + gap).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"/>`;
    acc += p; return d;
  }).join("");
  $("#donut").innerHTML = `
    <div class="donut"><svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.915" stroke="rgba(245,233,214,.08)"/>${arcs}</svg>
      <div class="ctr"><b data-n="${c.receita}" data-f="brl0" data-k="donut">${brl0(c.receita)}</b><small>${c.fecharam} ${c.fecharam === 1 ? "paciente" : "pacientes"}</small></div></div>
    <ul class="dleg">${segs.map(s => `<li><i style="background:${s.cor}"></i>${esc(s.nome)} <span>${s.n} · ${brl0(s.v)}</span></li>`).join("")}</ul>`;
}

/* ---------- gaveta do paciente ---------- */
const gv = { lead: null, volta: null };
const gvEtapa = () => { const r = $('input[name="lf-etapa"]:checked'); return r ? r.value : "nova"; };
const hojeDados = () => (S.dados && S.dados.hoje) || hojeSP();

function opcoesOrigem() {
  const camps = Object.values(M.CAMP).filter(c => c.plat).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return `<optgroup label="Sem anúncio">${ORIGENS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</optgroup>` +
    (camps.length ? `<optgroup label="Veio de um anúncio">${camps.map(c => `<option value="camp:${esc(c.id)}">${esc(c.nome)} (${nomePlat(c.plat)})</option>`).join("")}</optgroup>` : "");
}

function gvAtualizar() {
  const e = gvEtapa();
  const ind = $("#lf-etapas-op .etapa-ind");
  if (ind) ind.style.setProperty("--k", Math.max(0, ETAPAS.findIndex(x => x[0] === e)));
  $("#lf-box-consulta").hidden = !COM_DATA.has(e);
  $("#lf-consulta-l").textContent = e === "agendada" ? "Quando é a consulta?" : e === "faltou" ? "Dia da consulta que faltou" : "Dia da consulta";
  $("#lf-box-valor").hidden = e !== "fechou";
  const v = $("#lf-valor"), sug = M.CFG.ticket[$("#lf-servico").value];
  $("#lf-valor-dica").textContent = sug ? `Sugestão pelo tratamento: ${brl0(sug)}. Ajuste para o valor combinado.` : "Informe o valor combinado com o paciente.";
  // sugestão só entra se o campo estiver vazio ou ainda com a sugestão anterior
  if (e === "fechou" && sug && (!v.value || v.value === v.dataset.sug)) v.value = sug;
  v.dataset.sug = sug ? String(sug) : "";
}

/** Fita da jornada: 4 fotogramas (chamou → agendou → consulta → fechou), só com os campos que existem. */
function fitaHtml(L) {
  if (!L) return "";
  const e = M.etapa(L), R = M.R;
  const dia = i => (i == null ? null : `${SEMANA[M.dataDe(i).getDay()]} · ${M.ddmm(i)}`);
  const entre = (a, b, txt) => (a != null && b != null && b >= a ? (b - a === 0 ? `no mesmo dia` : `${plural(b - a, "dia", "dias")} ${txt}`) : "");
  const fechou = e === "fechou";
  const quadros = [
    { t: "Chamou", q: dia(L.i), on: true, v: L.plat ? `via ${nomePlat(L.plat)}` : "sem anúncio" },
    { t: "Agendou", q: dia(L.iAgenda), on: L.iAgenda != null && e !== "nova" && e !== "perdida", d: entre(L.i, L.iAgenda, "até agendar") },
    { t: "Consulta", q: dia(L.iConsulta), on: L.iConsulta != null && ETAPAS_VEIO.has(e), marcado: L.iConsulta != null && e === "agendada",
      falta: e === "faltou", d: entre(L.iAgenda, L.iConsulta, "até a consulta") },
    { t: "Fechou", q: fechou ? brl0(M.valorLead(L)) : null, on: fechou, v: fechou ? L.servico : "" },
  ];
  return quadros.map((f, n) => `<li class="ft${f.on ? " on" : ""}${f.marcado && !f.on ? " marcado" : ""}${f.falta ? " falta" : ""}" style="--i:${n}">
      <span class="ft-t">${f.t}</span><b class="ft-q">${f.falta ? "faltou" : f.q && (f.on || f.marcado) ? esc(f.q) : "—"}</b>
      ${f.v && f.on ? `<span class="ft-v">${esc(f.v)}</span>` : ""}${f.d && (f.on || f.marcado) ? `<span class="ft-d">${esc(f.d)}</span>` : ""}</li>`).join("");
}
const ETAPAS_VEIO = new Set(["orcamento", "fechou", "nao_fechou"]);

function abrirGaveta(L, o = {}) {
  if (!M) return;
  tourFim();
  gv.lead = L || null;
  gv.volta = o.volta || document.activeElement;
  gv.antes = L ? M.etapa(L) : null;
  const b = (L && L.bruto) || {};
  const e = o.etapa || (L ? M.etapa(L) : "nova");
  $("#gv-titulo").textContent = L ? L.nome : "Novo paciente";
  $("#gv-eyebrow").textContent = L ? `Conversa de ${M.dataBR(L.i)}` : "Cadastro manual";
  $("#gv-demo").hidden = !S.demo;
  $("#gv-erro").textContent = ""; $("#gv-erro").classList.remove("nota");
  $("#gv-fita").innerHTML = fitaHtml(L);
  $("#gv-fita").hidden = !L;

  // quem veio de anúncio identificado pelo WhatsApp não muda de origem na mão: vira o cartão de referência do anúncio
  const travado = !!(L && L.plat && (S.demo || b.anuncio_ext));
  if (travado) {
    const k = L.cri && M.CRI[L.cri], c = M.CAMP[L.camp];
    $("#gv-origem-info").innerHTML = `<span class="ref-mini ref-${classePlat(L.plat)}" aria-hidden="true"><svg><use href="#ic-wa"/></svg></span>
      <span class="ref-q"><small>Anúncio · ${nomePlat(L.plat)}</small><b>${esc(k ? k.nome : "anúncio da campanha")}</b><span>${esc(c ? c.nome : "—")}</span></span>`;
  } else {
    $("#lf-origem").innerHTML = opcoesOrigem();
    const v = L && L.plat && M.CAMP[L.camp] ? "camp:" + L.camp : (b.origem && b.origem !== "anuncio" ? b.origem : (L && L.origem && L.origem !== "anuncio" ? L.origem : L ? "whatsapp" : "indicacao"));
    $("#lf-origem").value = v;
    if ($("#lf-origem").value !== v) $("#lf-origem").value = "manual";
  }
  $("#gv-origem-info").hidden = !travado;
  $("#lf-box-origem").hidden = travado;

  const servs = Object.keys(M.CFG.ticket);
  const sv = L ? L.servico : (servs.includes("Clínica geral") ? "Clínica geral" : servs[0]);
  if (sv && !servs.includes(sv)) servs.push(sv);
  $("#lf-servico").innerHTML = servs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  $("#lf-servico").value = sv || "";

  $("#lf-nome").value = L && L.nome !== "Sem nome" ? L.nome : "";
  $("#lf-tel").value = L ? L.telefone || "" : "";
  $("#lf-obs").value = L ? L.obs || "" : "";
  $("#lf-consulta").value = !L ? "" : S.demo ? (L.iConsulta != null ? isoI(L.iConsulta) : "") : (b.data_consulta ? String(b.data_consulta).slice(0, 10) : "");
  const v = $("#lf-valor");
  v.value = !L ? "" : S.demo ? (L.fechou ? M.valorLead(L) : "") : (b.valor != null ? b.valor : "");
  v.dataset.sug = "";
  // chegou a "agendada" pelo arrasto sem data: a consulta que já estava marcada no passado não serve
  if (o.etapa === "agendada" && $("#lf-consulta").value && iDeIso($("#lf-consulta").value) <= M.R) $("#lf-consulta").value = "";
  $$('input[name="lf-etapa"]').forEach(r => { r.checked = r.value === e; });
  gvAtualizar();

  const g = $("#gaveta");
  clearTimeout(g._tFecha); g._fechando = false;
  g.classList.remove("sai", "volta", "arrastando"); g.style.removeProperty("--gx");
  $("#gaveta-fundo").classList.remove("sai");
  $("#gaveta-fundo").hidden = false;
  g.hidden = false;
  $("#app").inert = true;
  document.body.style.overflow = "hidden";
  // veio de um arrasto até "Agendada"/"Fechou": a etapa já vem marcada e o campo que falta ganha o foco
  const foco = o.etapa === "fechou" ? $("#lf-valor") : o.etapa === "agendada" ? $("#lf-consulta")
    : L ? $('input[name="lf-etapa"]:checked') : $("#lf-nome");
  if (foco) foco.focus();
}

function fecharGaveta(semFoco) {
  const g = $("#gaveta"), fundo = $("#gaveta-fundo");
  if (g.hidden || g._fechando) return;
  const fim = () => {
    g._fechando = false; g.hidden = true; fundo.hidden = true;
    g.classList.remove("sai", "volta", "arrastando"); g.style.removeProperty("--gx"); fundo.classList.remove("sai");
  };
  // sai em 160 ms (e-io); sessão expirada e trocas internas fecham na hora
  if (ANIM && !semFoco) { g._fechando = true; g.classList.add("sai"); fundo.classList.add("sai"); g._tFecha = setTimeout(fim, 200); }
  else fim();
  $("#app").inert = false;
  document.body.style.overflow = "";
  if (!semFoco) {
    let v = gv.volta;
    if (!v || v === document.body || !document.contains(v)) v = gv.lead ? $(`[data-lead="${CSS.escape(String(gv.lead.id))}"]`) : $("#btn-novo-lead");
    if (v) v.focus();
  }
  gv.lead = null;
}

/* ---------- mover um paciente de etapa (gaveta, arrasto, teclado) ---------- */
const fotoLead = L => ({ etapa: M.etapa(L), etapaReal: L.etapaReal, iAgenda: L.iAgenda, iConsulta: L.iConsulta,
  compareceu: L.compareceu, fechou: L.fechou, valor: L.valor, servico: L.servico, nome: L.nome, obs: L.obs });
const restaurarLead = (L, f) => { const { etapa, ...resto } = f; Object.assign(L, resto); };
/** Demo: a ficha muda SÓ na memória desta tela (recarregar volta aos números da demo). */
function aplicarEtapaMem(L, etapa, { consulta, valor } = {}) {
  const R = M.R, passado = i => (i != null && i <= R ? i : null);
  const iC = consulta ? iDeIso(consulta) : null;
  L.etapaReal = etapa;
  if (etapa === "nova" || etapa === "perdida") { L.iAgenda = null; L.iConsulta = null; L.compareceu = false; L.fechou = false; }
  else if (etapa === "agendada") { L.iAgenda = passado(L.iAgenda) ?? R; L.iConsulta = iC != null && iC > R ? iC : R + 1; L.compareceu = false; L.fechou = false; }
  else {
    // o que já aconteceu conta no último dia fechado (ontem): é o que o herói e a régua enxergam
    L.iConsulta = iC != null ? Math.min(iC, R) : passado(L.iConsulta) ?? R;
    L.iAgenda = passado(L.iAgenda) ?? L.iConsulta;
    L.compareceu = etapa !== "faltou";
    L.fechou = etapa === "fechou";
  }
  if (etapa === "fechou") L.valor = valor !== "" && valor != null && fin(+valor) ? +valor : null;
}
function depoisDeMover(L, antes) {
  M = montar(DS);
  const agora = M.etapa(L);
  if (S.aba !== "ajustes") render(false);
  atualizarBadge();
  if (agora === "fechou" && antes.etapa !== "fechou") celebrar(L);
}
/** Arrasto/teclado para uma coluna que não pede dado novo: grava na hora (nx_lead_salvar) com "Desfazer" por 5 s. */
async function moverLead(L, etapa) {
  const antes = fotoLead(L), rotEt = NOME_ETAPA[etapa];
  if (S.demo) {
    aplicarEtapaMem(L, etapa);
    depoisDeMover(L, antes);
    toast(`Movido: ${nomeCurto(L.nome)} → ${rotEt} · só nesta tela`, "nota", { rotulo: "Desfazer", fn: () => { const f = fotoLead(L); restaurarLead(L, antes); depoisDeMover(L, f); } });
    return true;
  }
  const b = L.bruto || {}, hoje = hojeDados(), p = { id: L.id, etapa };
  if (etapa === "nova" || etapa === "perdida") { if (b.data_agenda || b.data_consulta) { p.data_agenda = ""; p.data_consulta = ""; } }
  else if (COM_DATA.has(etapa)) p.data_consulta = b.data_consulta || hoje;
  const volta = { id: L.id, etapa: b.etapa || antes.etapa, data_agenda: b.data_agenda || "", data_consulta: b.data_consulta || "" };
  try { await api.leadSalvar(S.token, S.clienteId, p); }
  catch (err) { if (err.codigo !== "sessao_invalida") toast(api.mensagemErro(err), "erro"); return false; }
  toast(`Movido: ${nomeCurto(L.nome)} → ${rotEt}`, "ok", { rotulo: "Desfazer", fn: async () => {
    try { await api.leadSalvar(S.token, S.clienteId, volta); toast("Desfeito ✓"); await carregarDados({ entrada: false }); }
    catch (err) { if (err.codigo !== "sessao_invalida") toast(api.mensagemErro(err), "erro"); }
  } });
  await carregarDados({ entrada: false });
  return true;
}
/** Solta uma ficha numa coluna do kanban (arrastar.js): agenda/fecha pela gaveta, "não seguiu" pelo mini-menu. */
function soltarNaColuna(L, col, o = {}) {
  if (!L || !M) return Promise.resolve(false);
  if (col === colunaDe(L)) return Promise.resolve(false);
  if (col === "agendada" || col === "fechou") {
    abrirGaveta(L, { etapa: col, volta: $(`#kanban [data-lead="${CSS.escape(String(L.id))}"]`) });
    return Promise.resolve(false);
  }
  if (col === "parou") return menuParou(L, o.x, o.y);
  return moverLead(L, col);
}
/** "Não seguiu" tem três motivos: um mini-menu pergunta qual. */
function menuParou(L, x, y) {
  return new Promise(res => {
    const m = $("#menu-parou"), volta = document.activeElement;
    m.innerHTML = `<p class="mp-t">${esc(nomeCurto(L.nome))} não seguiu porque…</p>` +
      [["faltou", "Faltou à consulta"], ["nao_fechou", "Avaliou e não fechou"], ["perdida", "Não agendou"]]
        .map(([v, l]) => `<button type="button" role="menuitem" data-mp="${v}">${l}</button>`).join("") +
      `<button type="button" role="menuitem" class="mp-x" data-mp="">Cancelar</button>`;
    const w = 240, h = 210;
    m.style.left = Math.max(12, Math.min(innerWidth - w - 12, (x ?? innerWidth / 2) - w / 2)) + "px";
    m.style.top = Math.max(12, Math.min(innerHeight - h - 12, (y ?? innerHeight / 2) - 20)) + "px";
    m.hidden = false;
    const itens = $$("[data-mp]", m);
    itens[0].focus();
    const fim = async v => {
      m.hidden = true;
      m.removeEventListener("click", clique); m.removeEventListener("keydown", tecla); document.removeEventListener("pointerdown", fora, true);
      if (volta && document.contains(volta)) volta.focus();
      res(v ? await moverLead(L, v) : false);
    };
    const clique = e => { const b = e.target.closest("[data-mp]"); if (b) fim(b.dataset.mp); };
    const tecla = e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fim(""); }
      const k = itens.indexOf(document.activeElement), d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (d) { e.preventDefault(); itens[(k + d + itens.length) % itens.length].focus(); }
    };
    const fora = e => { if (!m.contains(e.target)) fim(""); };
    m.addEventListener("click", clique); m.addEventListener("keydown", tecla);
    setTimeout(() => document.addEventListener("pointerdown", fora, true), 0);
  });
}

/* ---------- o momento "Fechou": luz bronze curta, uma vez por evento (≤ 1,4 s) ---------- */
function celebrar(L) {
  if (!L || !M) return;
  const v = M.valorLead(L), d = M.dataDe(M.R), ini = Math.max(0, M.R - (d.getDate() - 1));
  const soma = M.crmTot(ini, M.R).receita, mes = MESES[d.getMonth()];
  const el = $("#celebra");
  el.innerHTML = `<p class="cb-t">Paciente novo!</p><p class="cb-l">${esc(nomeCurto(L.nome))} fechou ${esc(L.servico)} · <b>${brl0(v)}</b></p>` +
    `<p class="cb-s">${mes.charAt(0).toUpperCase() + mes.slice(1)} agora soma <b>${brl0(soma)}</b></p>`;
  clearTimeout(el._t);
  el.hidden = false;
  el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  el._t = setTimeout(() => { el.classList.remove("on"); el._t = setTimeout(() => { el.hidden = true; }, 400); }, 3400);
  const card = $(`#kanban [data-lead="${CSS.escape(String(L.id))}"]`);
  if (card) { card.classList.remove("brilha"); void card.offsetWidth; card.classList.add("brilha"); setTimeout(() => card.classList.remove("brilha"), 1600); }
  if (ANIM && CINE && CINE.faiscas) CINE.faiscas((card && card.offsetParent ? card : el).getBoundingClientRect());
  try { if (navigator.vibrate && matchMedia("(pointer: coarse)").matches) navigator.vibrate(12); } catch { /* sem vibração */ }
}

async function salvarLead(ev) {
  ev.preventDefault();
  // tom "nota" = aviso neutro (demo), nunca vermelho; com a gaveta já fechada, vira aviso rápido
  const erro = (msg, o = {}) => {
    const g = $("#gaveta");
    if (g.hidden || g._fechando) return toast(msg, o.tom === "nota" ? "nota" : "erro");
    $("#gv-erro").textContent = msg;
    $("#gv-erro").classList.toggle("nota", o.tom === "nota");
  };
  const L = gv.lead, b = (L && L.bruto) || {}, e = gvEtapa(), hoje = hojeDados();
  const nome = $("#lf-nome").value.trim(), tel = soDigitos($("#lf-tel").value);
  if (!L && !nome && !tel) { $("#lf-nome").focus(); return erro("Informe pelo menos o nome ou o telefone."); }
  const p = { nome, telefone: tel, servico: $("#lf-servico").value, etapa: e, obs: $("#lf-obs").value.trim() };
  if (L) p.id = L.id; else p.data_conversa = hoje;

  if (!$("#lf-box-origem").hidden) {
    const v = $("#lf-origem").value;
    if (v.startsWith("camp:")) {
      const c = M.CAMP[v.slice(5)];
      if (c) { p.origem = "anuncio"; p.plataforma = c.plat; p.campanha_ext = c.id.slice(c.plat.length + 1); }
    } else {
      p.origem = v;
      if (b.plataforma || b.campanha_ext) { p.plataforma = ""; p.campanha_ext = ""; }
    }
  }

  const consulta = $("#lf-consulta").value;
  if (e === "agendada") {
    if (!consulta) { $("#lf-consulta").focus(); return erro("Informe o dia da consulta."); }
    p.data_consulta = consulta;
    if (!b.data_agenda) p.data_agenda = hoje;
  } else if (COM_DATA.has(e)) {
    p.data_consulta = consulta || b.data_consulta || hoje;
  } else if (b.data_agenda || b.data_consulta) {
    // voltou para "nova"/"não agendou": o funil não pode continuar contando o agendamento
    p.data_agenda = ""; p.data_consulta = "";
  }
  if (e === "fechou") {
    const bruto = $("#lf-valor").value.trim();
    if (bruto === "") p.valor = "";
    else {
      const n = parseFloat(bruto.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) { $("#lf-valor").focus(); return erro("Valor inválido."); }
      p.valor = n;
    }
  }

  // demo: a ficha muda só nesta tela e a celebração acontece ANTES da guarda (que continua: nada é gravado)
  if (S.demo && L) {
    const antes = fotoLead(L);
    aplicarEtapaMem(L, e, { consulta: p.data_consulta, valor: p.valor });
    Object.assign(L, { servico: p.servico, obs: p.obs }, p.nome ? { nome: p.nome } : {});
    depoisDeMover(L, antes);
    fecharGaveta();   // o foco volta para a ficha já redesenhada na coluna nova
  }
  if (S.demo) return erro("Demonstração: nada foi salvo — a ficha mudou só nesta tela. No painel da clínica, este botão grava na hora.", { tom: "nota" });

  const btn = $("#gv-salvar"), antes = L ? M.etapa(L) : null;
  ocupado(btn, true);
  try {
    await api.leadSalvar(S.token, S.clienteId, p);
    fecharGaveta();
    toast(L ? "Paciente atualizado ✓" : "Paciente cadastrado ✓");
    await carregarDados({ entrada: false });
    if (L && e === "fechou" && antes !== "fechou") celebrar(M.LEADS.find(x => String(x.id) === String(L.id)) || L);
    // o kanban foi redesenhado: o cartão que tinha o foco não existe mais
    if (document.activeElement === document.body || !document.activeElement) {
      const volta = L && $(`[data-lead="${CSS.escape(String(L.id))}"]`);
      (volta || $("#btn-novo-lead")).focus();
    }
  } catch (err) {
    if (err.codigo !== "sessao_invalida") erro(api.mensagemErro(err));
  } finally { ocupado(btn, false); }
}

/* ============================================================
   6. RADAR
   ============================================================ */
const OPS = { ">": "acima de", "<": "abaixo de", ">=": "a partir de", "<=": "até" };
const ROT_MET = { cpa: "Custo por conversa", ctr: "CTR", freq: "Frequência", conversoes: "Conversas" };
const SEV_NOME = { critico: "crítico", alerta: "alerta", info: "informativo" };
let radarCtl = null, radarChega = false;   // varredura em canvas (cinema.js), se houver
const horaCheia = () => `${p2(new Date().getHours())}:00`;
const ultimoSync = () => ((S.dados && S.dados.integracoes) || []).map(i => i.ultimo_sync).filter(Boolean).sort().pop() || null;

function alertasServidor() {
  const m = new Map();
  for (const a of (S.dados && S.dados.alertas) || []) {
    const e = m.get(a.chave);
    if (!e || String(a.criado_em) > String(e.criado_em)) m.set(a.chave, a);
  }
  return m;
}

/* ---------- envios de WhatsApp: a mesma régua em todo lugar (statusEnvio) ---------- */
const tiqueHtml = s => (s ? `<i class="tq tq-${s.k}" aria-hidden="true">${s.tique}</i>` : "");
const envLinha = s => (s ? `<span class="env env-${s.k}">${esc(s.rotulo)} ${tiqueHtml(s)}</span>` : "");
const chipExemplo = x => (x && x.exemplo ? `<span class="chip chip-exemplo">exemplo</span>` : "");
/** Linha do tempo de um envio: gerado/registrado → enviado → entregue (só o que o servidor sabe). */
function linhaTempo(x, tipo) {
  const s = statusEnvio(x);
  const p0 = x.criado_em ? { l: tipo === "alerta" ? "registrado" : "gerado", q: quandoSP(x.criado_em), c: "ok" }
    : x.referencia ? { l: "referente a", q: dataIso(x.referencia), c: "ok" } : null;
  const passos = [p0,
    { l: "enviado", q: x.enviado_em ? quandoSP(x.enviado_em) : s.k === "erro" ? "não saiu" : "ainda não", c: x.enviado_em ? "ok" : s.k === "erro" ? "erro" : "falta" },
    { l: "entregue", q: x.entregue_em ? quandoSP(x.entregue_em) : s.k === "erro" && x.enviado_em ? "não chegou" : "sem confirmação ainda",
      c: x.entregue_em ? "ok" : s.k === "erro" && x.enviado_em ? "erro" : "falta" },
  ].filter(Boolean);
  return `<ol class="env-tempo">${passos.map(p => `<li class="et-${p.c}"><b>${p.l}</b><span>${esc(p.q)}</span></li>`).join("")}</ol>` +
    (s.erro ? `<p class="env-motivo">${esc(s.erro)}</p>` : "");
}
let envN = 0;
/** Item de lista com um envio: título + status (✓/✓✓/!) que abre a linha do tempo. */
function itemEnvio({ titulo, sub = "", x, tipo, antes = "", depois = "", cls = "" }) {
  const id = `env-${++envN}`, s = statusEnvio(x);
  return `<li class="env-item ${cls}">${antes}<div class="env-q">
      <button class="env-alt" type="button" aria-expanded="false" aria-controls="${id}">
        <span class="env-t">${titulo}</span>${sub ? `<span class="env-sub">${sub}</span>` : ""}
        <span class="env-s">${chipExemplo(x)}${envLinha(s)}<svg class="env-seta" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5"/></svg></span>
      </button>
      <div class="env-abre" id="${id}"><div>${linhaTempo(x, tipo)}</div></div>
    </div>${depois}</li>`;
}

/* ---------- conexão com Meta/Google: pílula no topo, faixa em todas as abas ---------- */
const estadoInteg = () => estadoIntegracao((S.dados && S.dados.integracoes) || [], (S.dados && S.dados.alertas) || []);
const SIMULAR_INTEG = DEMO && Q.get("simular") === "integracao";
let syncT = 0;
function minutosAtras(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 6e4));
  return m < 1 ? "agora há pouco" : m < 60 ? `há ${m} min` : m < 120 ? "há 1 h" : m < 48 * 60 ? `há ${Math.floor(m / 60)} h` : `há ${Math.floor(m / 1440)} dias`;
}
function renderIntegracao() {
  const pill = $("#sync-pill"), faixa = $("#faixa-integ");
  if (!pill) return;
  const temApp = !!M && !S.estado;
  const e = estadoInteg();
  const demoCalma = S.demo && !SIMULAR_INTEG;
  let nivel = e.nivel, txt = "";
  if (demoCalma) { nivel = "demo"; txt = `Demonstração · dados de ${M ? M.ddmm(M.R) : "—"}`; }
  else if (nivel === "erro") {
    const nomes = e.erros.map(x => nomePlat(x.canal));
    txt = `${nomes.join(" e ")} ${nomes.length > 1 ? "desconectados" : "desconectado"}`;
  } else if (nivel === "atrasado") txt = "Leitura atrasada";
  else if (nivel === "aguardando") txt = "Aguardando a 1ª leitura";
  else if (nivel === "ok") txt = `Atualizado ${minutosAtras(e.ultimo)}`;
  pill.hidden = !temApp || nivel === "nenhuma";
  pill.className = `sync-pill sp-${nivel}`;
  $("#sync-txt").textContent = txt;
  // faixa de conexão caída: aparece em todas as abas, com o próximo passo
  const erros = S.demo && !SIMULAR_INTEG ? [] : e.erros;
  faixa.hidden = !temApp || !erros.length;
  if (erros.length) {
    const partes = erros.map(x => `A conexão com o ${nomePlat(x.canal)} caiu: os números do ${nomePlat(x.canal)} estão parados desde ${x.sync ? ddmmHora(new Date(x.sync).toISOString()) : "a última leitura"}.`);
    faixa.innerHTML = `<svg class="fi-ic" aria-hidden="true"><use href="#ic-sinal"/></svg><p>${partes.map(esc).join(" ")}</p>` +
      (gestor() ? `<button class="pill pill-ink pill-sm" type="button" data-ir="ajustes">Abrir Ajustes</button>` : `<p class="fi-nota">A Nexus já foi avisada e está resolvendo.</p>`);
  }
  if ($("#sync-pop").hidden === false) renderSyncPop();
  // "há X min" anda sozinho (a cada 30 s; parado com a aba oculta)
  clearInterval(syncT);
  if (temApp && nivel === "ok") syncT = setInterval(() => { if (!document.hidden) renderIntegracao(); }, 30000);
}
function renderSyncPop() {
  const e = estadoInteg(), pop = $("#sync-pop");
  const ESTADO = { ok: "lendo normalmente", atrasado: "leitura atrasada", aguardando: "esperando a 1ª leitura", erro: "desconectado" };
  const prox = 60 - new Date().getMinutes();
  const linhas = e.canais.map(c => `<li class="spp-${c.estado}"><b>${nomePlat(c.canal)}</b><span>${c.sync ? `lida às ${FMT_HORA.format(new Date(c.sync))} (${quandoSP(new Date(c.sync).toISOString()).replace(/ às .*/, "")})` : "ainda não leu"} · ${ESTADO[c.estado]}</span></li>`).join("");
  const radarQ = S.varridoEm ? `hoje às ${S.varridoEm}` : e.ultimo ? quandoSP(new Date(e.ultimo).toISOString()) : "—";
  pop.innerHTML = `<p class="spp-h">${S.demo ? "Leitura dos anúncios (exemplo)" : "Leitura dos anúncios"}</p>` +
    (linhas ? `<ul>${linhas}</ul>` : `<p class="spp-v">Nenhuma plataforma conectada.</p>`) +
    `<p class="spp-v">Próxima leitura em ~${prox} min · de hora em hora</p><p class="spp-v">Última varredura do radar: ${esc(radarQ)}</p>`;
}
function abrirSyncPop(on) {
  const pop = $("#sync-pop"), b = $("#sync-pill");
  if (on) renderSyncPop();
  pop.hidden = !on;
  b.setAttribute("aria-expanded", String(on));
  if (!on && pop.contains(document.activeElement)) b.focus();
}

/** Demo: relatórios e avisos de EXEMPLO (rótulo "exemplo"), com estados de entrega variados.
    O modo real nunca passa por aqui: lá só aparece o que o servidor registrou. */
function exemploDemo() {
  const hora = (i, hms) => `${isoI(i)}T${hms}-03:00`;
  const seg = s => `08:0${Math.floor(s / 60)}:${p2(s % 60)}`;
  const relatorios = [];
  for (let k = 0; k < 6; k++) {
    const i = M.R - k, env = 12 + k * 7, ent = env + 9 + (k * 13) % 40;
    relatorios.push({ tipo: "diario", referencia: isoI(i), texto: M.relDiario(i), leitura_ia: null, erro: null, exemplo: true,
      enviado_em: hora(i + 1, seg(env)), entregue_em: k === 3 ? null : hora(i + 1, seg(ent)) });   // 1 sem confirmação
  }
  const mes = M.mesesDados().filter(m => m.completo).pop();
  if (mes) relatorios.push({ tipo: "mensal", referencia: isoI(mes.de), texto: M.relMensal(mes), leitura_ia: null, erro: null, exemplo: true,
    enviado_em: hora(mes.ate + 1, "09:00:04"), entregue_em: hora(mes.ate + 1, "09:00:31") });
  const alertas = M.avaliar(M.R, true).map((a, n) => ({
    regra: a.regra.id, chave: a.chave, severidade: a.sev, mensagem: a.msg, acao: a.acao, referencia: isoI(M.R), exemplo: true,
    criado_em: hora(M.R + 1, `07:0${n}:00`), enviado_em: hora(M.R + 1, `07:0${n}:03`), entregue_em: n === 1 ? null : hora(M.R + 1, `07:0${n}:1${n}`),
  }));
  const agora = Date.now();
  const integracoes = [
    { canal: "meta", ativo: true, ultimo_sync: new Date(agora - 12 * 6e4).toISOString(), status: "ok — 120 linhas" },
    { canal: "google", ativo: true, ultimo_sync: new Date(agora - 12 * 6e4).toISOString(), status: "ok — 36 linhas" },
  ];
  // ?demo&simular=integracao: o token do Meta "expirou" ontem à noite (só na demo)
  if (SIMULAR_INTEG) {
    integracoes[0].status = "erro — token de acesso expirado";
    integracoes[0].ultimo_sync = hora(M.R, "22:00:00");
    alertas.unshift({ regra: "integracao", chave: "integracao|meta", severidade: "critico", mensagem: "Token do Meta expirou",
      acao: "Gerar um token novo no Meta e colar em Ajustes → Integrações.", referencia: isoI(M.R), exemplo: true,
      criado_em: new Date(agora - 40 * 6e4).toISOString(), enviado_em: new Date(agora - 40 * 6e4 + 3000).toISOString(), entregue_em: new Date(agora - 40 * 6e4 + 9000).toISOString() });
  }
  return { hoje: hojeSP(), relatorios, alertas, integracoes, exemplo: true };
}

function renderRadar() {
  const vazio = semAnuncios();
  const atuais = M.avaliar(M.R, true), hist = vazio ? [] : M.historico(), srv = alertasServidor();
  const scope = $("#scope");
  $$(".blip", scope).forEach(b => b.remove());
  atuais.forEach((a, n) => {
    const ang = (n * 137.5 + 40) * Math.PI / 180, rad = { critico: 17, alerta: 27, info: 37 }[a.sev];
    const b = document.createElement("span");
    b.className = "blip " + a.sev;
    b.style.left = 50 + rad * Math.cos(ang) + "%";
    b.style.top = 50 + rad * Math.sin(ang) + "%";
    b.style.animationDelay = n * .45 + "s";
    scope.appendChild(b);
  });
  if (CINE && CINE.radar) {
    if (!radarCtl) {
      radarCtl = CINE.radar(scope);
      radarCtl.aoApontar(chave => $$("#alerts li[data-chave]").forEach(li => li.classList.toggle("realce", li.dataset.chave === chave)));
    }
    radarCtl.atualizar(atuais.map((a, n) => ({ chave: a.chave, sev: a.sev, ang: (n * 137.5 + 40) * Math.PI / 180, rad: { critico: .34, alerta: .54, info: .74 }[a.sev] })));
  }
  const qtd = `${atuais.length} ${atuais.length === 1 ? "alerta ativo" : "alertas ativos"}`;
  const u = ultimoSync();
  $("#scope-status").innerHTML = vazio && !S.demo ? "Sem números de anúncio ainda: o radar começa a vigiar assim que a primeira leitura chegar."
    : S.varridoEm ? `Conferido às <b>${S.varridoEm}</b> · ${qtd}.`
    : S.demo ? `Última varredura: <b>hoje, ${horaCheia()}</b> · ${qtd}.`
    : u ? `Última leitura dos anúncios: <b>${quandoSP(u)}</b> · ${qtd}.` : `${qtd}.`;
  $("#btn-varrer").textContent = S.demo ? "Varrer agora" : "Conferir agora";

  // conexão parada (regra "integracao", só o servidor conhece): sempre NO TOPO, com o sinal cortado
  const est = estadoInteg();
  const integs = [...srv.values()].filter(a => a.regra === "integracao").sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)));
  const htmlInteg = integs.map((a, n) => {
    const c = canalDe(a), ativo = est.erros.some(x => x.canal === c);
    const env = a.enviado_em || a.entregue_em ? ` · <span class="al-env">${envLinha(statusEnvio(a))}</span>` : "";
    return `<li class="al-integ" style="--i:${n}"><span class="sev sev-critico sev-ic" role="img" aria-label="conexão parada"><svg><use href="#ic-sinal"/></svg></span>
      <div><p class="al-t">${esc(nomeRegraSrv(a))} <span class="chip chip-conexao">conexão</span> <span class="chip ${ativo ? "chip-bad" : "chip-ok"}">${ativo ? "ativo" : "resolvido"}</span>${chipExemplo(a)}</p>
      ${!gestor() ? `<p class="al-leigo">${esc(LEIGO_LINHA.integracao)}</p>` : ""}<p class="al-m">${esc(a.mensagem || "")}</p>
      <p class="al-d">${quandoSP(a.criado_em)}${env}</p>${ativo && gestor() ? `<button class="link-b" type="button" data-ir="ajustes">Resolver em Ajustes → Integrações</button>` : ""}</div></li>`;
  }).join("");
  const htmlHist = hist.slice(0, 8).map((e, n) => {
    const ativo = e.ate === M.R, a = e.a, id = a.regra.id;
    const desde = ativo ? (e.desde === M.R ? "desde ontem · continua" : `desde ${M.dMes(e.desde)} · continua`)
      : e.desde === e.ate ? `em ${M.dMes(e.desde)}` : `de ${M.dMes(e.desde)} a ${M.dMes(e.ate)}`;
    const s = srv.get(a.chave);
    const env = s && (s.enviado_em || s.entregue_em) ? ` · <span class="al-env">aviso ${envLinha(statusEnvio(s))}</span>${chipExemplo(s)}` : "";
    return `<li style="--i:${n + integs.length}"${ativo ? ` data-chave="${esc(a.chave)}"` : ""}><span class="sev sev-${a.sev}" role="img" aria-label="${SEV_NOME[a.sev]}">${M.ICONE[a.sev]}</span>
      <div><p class="al-t">${rotT(id)} <span class="chip ${ativo ? (a.sev === "critico" ? "chip-bad" : "chip-warn") : "chip-ok"}">${ativo ? "ativo" : "resolvido"}</span></p>
      ${!gestor() && LEIGO_LINHA[id] ? `<p class="al-leigo">${esc(LEIGO_LINHA[id])}</p>` : ""}<p class="al-m">${esc(a.msg)}</p><p class="al-d">${desde}${env}</p></div></li>`;
  }).join("");
  $("#alerts").innerHTML = htmlInteg + htmlHist || `<li class="vazio">Nenhum alerta nos últimos 14 dias.</li>`;

  const pode = S.demo || gestor();
  $("#rules").innerHTML = M.REGRAS.map(r => {
    const f = M.FMT_MET[r.metrica];
    const cond = `${ROT_MET[r.metrica]} ${OPS[r.op]} ${f(r.limite())} · ${r.janela} dias · por ${r.nivel === "campanha" ? "campanha" : "criativo"}${r.plat ? " (Meta)" : ""}` +
      (r.minGasto ? ` · gasto mínimo ${brl0(r.minGasto)}` : "") + (r.minImpr ? ` · mín. ${r.minImpr} impressões` : "");
    return `<li><div><p class="rl-t">${esc(r.nome)} <span class="chip ${r.sev === "critico" ? "chip-bad" : r.sev === "alerta" ? "chip-warn" : "chip-meta"}">${SEV_NOME[r.sev]}</span></p><p class="rl-c">${cond}</p></div>
      <button class="sw" type="button" role="switch" aria-checked="${r.ativa}" aria-label="Regra ${esc(r.nome)}" data-regra="${r.id}"${pode ? "" : ` aria-disabled="true" title="Só a equipe da Nexus liga ou desliga regras"`}></button></li>`;
  }).join("");
  $("#rules-nota").textContent = S.demo ? "Na demonstração, ligar e desligar regras e mexer nas metas não salva nada — é só para ver o efeito."
    : gestor() ? "Ligar ou desligar uma regra vale na hora para este cliente." : "Só a equipe da Nexus liga ou desliga regras.";

  $("#metas-demo").hidden = !S.demo;
  $("#metas-real").hidden = S.demo;
  if (S.demo) {
    $("#in-cpa").value = M.CFG.cpaAlvo; $("#out-cpa").textContent = brl(M.CFG.cpaAlvo);
    $("#in-orc").value = M.CFG.orcamento; $("#out-orc").textContent = brl0(M.CFG.orcamento);
  } else {
    $("#metas-real").innerHTML = `<p class="metas-l"><span>Meta de custo por conversa</span><b>${brl(M.CFG.cpaAlvo)}</b></p>` +
      `<p class="metas-l"><span>Orçamento de anúncios do mês</span><b>${brl0(M.CFG.orcamento)}</b></p>` +
      (gestor() ? `<button class="link-b" type="button" data-ir="ajustes">Alterar metas em Ajustes</button>` : "");
  }
  $("#wa-alerta").innerHTML = `<span class="ph-day">hoje</span><div class="bubble${radarChega && ANIM ? " chega" : ""}">${waHtml(M.textoAlerta(atuais))}<span class="hr">${horaCheia()}</span></div>`;

  // registro do servidor (na demo, os avisos de exemplo): nome próprio para cada regra e o tique honesto
  const log = ((S.dados && S.dados.alertas) || []).slice().sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))).slice(0, 10);
  const SEV_OK = new Set(["critico", "alerta", "info"]);
  $("#avisos-log").innerHTML = !log.length ? `<li class="vazio">Nenhum aviso enviado ainda.</li>`
    : log.map(a => {
      const sev = SEV_OK.has(a.severidade) ? a.severidade : "alerta";
      const ic = a.regra === "integracao" ? `<svg><use href="#ic-sinal"/></svg>` : M.ICONE[sev];
      const nome = a.regra === "integracao" ? nomeRegraSrv(a) : LEIGO[a.regra] ? rot(a.regra) : nomeRegraSrv(a, M.REGRAS);
      return itemEnvio({ titulo: esc(nome), sub: esc(a.mensagem || ""), x: a, tipo: "alerta",
        antes: `<span class="sev sev-${sev}${a.regra === "integracao" ? " sev-ic" : ""}" role="img" aria-label="${SEV_NOME[sev]}">${ic}</span>` });
    }).join("");
  atualizarBadge(atuais.length);
}

function atualizarBadge(n) {
  if (n == null) n = M && !semAnuncios() ? M.avaliar(M.R, true).length : 0;
  $$("[data-badge]").forEach(b => {
    const antes = b.textContent;
    b.textContent = n; b.hidden = !n;
    // pulsa UMA vez quando o número muda (nunca em loop)
    if (ANIM && n && b._visto && antes !== String(n)) { b.classList.remove("pulsa"); void b.offsetWidth; b.classList.add("pulsa"); }
    b._visto = true;
  });
}

async function alternarRegra(id) {
  const antes = [...(DS.CFG.regrasOff || [])];
  const off = new Set(antes);
  if (off.has(id)) off.delete(id); else off.add(id);
  DS.CFG.regrasOff = [...off];
  M = montar(DS);
  const focar = () => { const nb = $(`#rules [data-regra="${id}"]`); if (nb) nb.focus(); };
  renderRadar(); focar();
  if (S.demo) return;
  try {
    await salvarCfgCliente({ regrasOff: DS.CFG.regrasOff });
    toast(`Regra ${off.has(id) ? "desligada" : "ligada"} ✓`);
  } catch (err) {
    DS.CFG.regrasOff = antes;
    M = montar(DS);
    if (S.aba === "radar") { renderRadar(); focar(); }
    if (err.codigo !== "sessao_invalida") toast(api.mensagemErro(err), "erro");
  }
}

async function salvarCfgCliente(parcial) {
  const c = clienteAtual();
  if (!c) throw Object.assign(new Error("cliente_nao_encontrado"), { codigo: "cliente_nao_encontrado" });
  // "ativo" vai com o valor atual: o contrato não garante que a chave ausente mantém o cliente pausado
  const r = await api.clienteSalvar(S.token, { id: c.id, slug: c.slug, nome: c.nome, ativo: c.ativo !== false, cfg: parcial });
  c.cfg = (r && r.cfg) || { ...(c.cfg || {}), ...parcial };
}

/* ============================================================
   7. RELATÓRIOS
   ============================================================ */
let relDe = null;   // M para o qual os seletores de dia/mês foram montados

function relServidor() {
  const m = new Map();
  for (const r of (S.dados && S.dados.relatorios) || []) m.set(`${r.tipo}|${String(r.referencia).slice(0, 10)}`, r);
  return m;
}

function digitar(el, txt, dia, hora, st) {
  clearTimeout(el._t);
  el._texto = txt;
  const fim = () => {
    // o tique sai do statusEnvio (✓ enviado · ✓✓ entregue · ! não saiu) — nunca azul
    el.innerHTML = `<span class="ph-day">${esc(dia)}</span><div class="bubble${REDUCE ? "" : " chega"}">${waHtml(txt)}<span class="hr">${esc(hora)}${st ? ` ${tiqueHtml(st)}<span class="sr-only">${esc(st.rotulo)}</span>` : ""}</span></div>`;
    el.scrollTop = 0;
  };
  if (REDUCE) return fim();
  el.innerHTML = `<span class="ph-day">${esc(dia)}</span><div class="typing" role="img" aria-label="digitando"><i></i><i></i><i></i></div>`;
  el._t = setTimeout(fim, 850);
}

function mostrarRel(tipo, rel, previa, dia, horaPadrao, dBloq) {
  const el = $("#ph-" + tipo), st = $("#st-" + tipo), bloq = $("#bloq-" + tipo);
  let txt, hora = horaPadrao, nao = null;
  if (rel && rel.texto) {
    const s = statusEnvio(rel);
    txt = rel.texto; hora = rel.enviado_em ? horaSP(rel.enviado_em) : horaPadrao; nao = s;
    const cls = { entregue: "chip-ok", enviado: "chip-neutro", erro: "chip-bad", pendente: "chip-warn" }[s.k];
    st.innerHTML = `${chipExemplo(rel)}<span class="chip ${cls}">${esc(s.rotulo)} ${tiqueHtml(s)}</span>` +
      (s.erro ? ` <span class="rel-erro">${esc(s.erro)}</span>` : "") + (rel.leitura_ia ? ` <span class="chip chip-ia">leitura por IA</span>` : "");
  } else if (semAnuncios() || !previa) {
    clearTimeout(el._t);
    el._texto = ""; el._espera = null;
    el.innerHTML = `<p class="vazio">Ainda não há números de anúncio para montar este relatório.</p>`;
    st.innerHTML = ""; bloq.hidden = true;
    return;
  } else {
    txt = previa();
    st.innerHTML = S.demo ? "" : `<span class="chip chip-neutro">prévia</span> calculada agora com os números do painel`;
  }
  const col = el.closest(".phone-col");
  if (FX && ANIM && col && !col.classList.contains("em-cena")) {
    // 1ª vez: o relatório chega na tela bloqueada e destrava quando o celular entra em quadro
    clearTimeout(el._t);
    el._texto = txt; el.innerHTML = "";
    const titulo = tipo === "diario" ? "Nexus · Tráfego" : `${M.NOME} · Resultados`;
    bloq.innerHTML = telaBloqueada(horaPadrao, dBloq ? dataLonga(dBloq) : "", [{ nx: true, titulo, texto: semMarcas(String(txt).split("\n")[0]), quando: "agora" }]);
    bloq.classList.remove("destrava"); bloq.hidden = false;
    el._espera = () => digitar(el, txt, dia, hora, nao);
  } else {
    bloq.hidden = true; el._espera = null;
    digitar(el, txt, dia, hora, nao);
  }
}
/** A tela bloqueada sobe (500 ms) e entra o "digitando…" + o balão. */
function destravarFone(col) {
  const el = $(".ph-body", col), bloq = $(".fone-bloq", col);
  if (!el || !bloq || !el._espera) return;
  const seguir = el._espera;
  el._espera = null;
  setTimeout(() => {
    bloq.classList.add("destrava");
    setTimeout(() => { bloq.hidden = true; bloq.classList.remove("destrava"); }, 560);
    seguir();
  }, 900);
}

function montarSeletoresRel() {
  const sd = $("#sel-dia"), sm = $("#sel-mes"), vd = sd.value, vm = sm.value;
  sd.innerHTML = ""; sm.innerHTML = "";
  for (let k = 0; k < 14; k++) { const i = M.R - k; sd.add(new Option(`${k === 0 ? "Ontem" : SEMANA[M.dataDe(i).getDay()]} · ${M.ddmm(i)}`, isoI(i))); }
  M.mesesDados().filter(m => m.completo).reverse().forEach(m => sm.add(new Option(`${MESES[m.mes]} de ${m.ano}`, isoI(m.de))));
  if (vd && [...sd.options].some(o => o.value === vd)) sd.value = vd;
  if (vm && [...sm.options].some(o => o.value === vm)) sm.value = vm;
  relDe = M;
}

function renderRelatorios() {
  if (relDe !== M) montarSeletoresRel();
  const sd = $("#sel-dia"), sm = $("#sel-mes"), srv = relServidor();
  // o celular do Resumo é da clínica: logo/cor dela no avatar e o nome inteiro
  avatarMarca($("#ph-av-cli"), nomeCliente());
  $("#ph-nome-cli").textContent = nomeCliente();
  $("#btn-folha").hidden = !$("#sel-mes").value;

  const isoD = sd.value, iD = iDeIso(isoD);
  mostrarRel("diario", srv.get(`diario|${isoD}`), iD >= 0 && iD <= M.R ? () => M.relDiario(iD) : null,
    iD === M.R ? "hoje" : M.dMes(iD + 1), "08:00", M.dataDe(iD + 1));

  const isoM = sm.value;
  if (!isoM) {
    const el = $("#ph-mensal");
    clearTimeout(el._t); el._texto = "";
    el.innerHTML = `<p class="vazio">Ainda não há um mês completo.</p>`;
    $("#st-mensal").innerHTML = "";
    $("#bloq-mensal").hidden = true;
  } else {
    const m = M.mesesDados().find(x => isoI(x.de) === isoM), mes = +isoM.slice(5, 7);
    mostrarRel("mensal", srv.get(`mensal|${isoM}`), m ? () => M.relMensal(m) : null, `1º de ${MESES[mes % 12]}`, "09:00", m ? M.dataDe(m.ate + 1) : null);
  }

  const lista = ((S.dados && S.dados.relatorios) || []).slice()
    .sort((a, b) => String(b.referencia).localeCompare(String(a.referencia)) || (a.tipo === "mensal" ? -1 : 1)).slice(0, 12);
  $("#rel-lista").innerHTML = !lista.length
    ? `<li class="vazio">Nenhum relatório enviado ainda. O primeiro diário sai às 8h do dia seguinte à primeira leitura dos anúncios.</li>`
    : lista.map(r => {
      const ref = String(r.referencia).slice(0, 10);
      const tit = r.tipo === "mensal" ? `Resumo de ${MESES[+ref.slice(5, 7) - 1]} de ${ref.slice(0, 4)}` : `Diário de ${dataIso(ref)}`;
      return itemEnvio({ titulo: `${esc(tit)}${r.leitura_ia ? ` <span class="chip chip-ia">IA</span>` : ""}`, x: r, tipo: "relatorio",
        cls: r.tipo === "mensal" ? "env-mensal" : "",
        depois: `<button class="pill pill-ghost pill-sm" type="button" data-ver-rel="${esc(r.tipo)}|${esc(ref)}" aria-label="Ver ${esc(tit)} no celular">Ver</button>` });
    }).join("");
  $("#rel-nota").textContent = S.demo
    ? "No sistema real, a “leitura do dia” é escrita por IA a partir dos números. Aqui ela sai de regras fixas, só para demonstrar o formato."
    : "Quando o servidor já enviou o relatório do dia escolhido, o celular mostra o texto que foi enviado. Nos outros dias, mostra uma prévia calculada agora.";
}

function verRelatorio(chave) {
  const [tipo, ref] = chave.split("|"), sel = $(tipo === "mensal" ? "#sel-mes" : "#sel-dia");
  if (![...sel.options].some(o => o.value === ref)) {
    const rot = tipo === "mensal" ? `${MESES[+ref.slice(5, 7) - 1]} de ${ref.slice(0, 4)}` : dataIso(ref);
    sel.add(new Option(rot, ref));
  }
  sel.value = ref;
  renderRelatorios();
  const col = sel.closest(".phone-col");
  if (col) col.scrollIntoView({ behavior: REDUCE ? "auto" : "smooth", block: "start" });
}

/* ============================================================
   8. AJUSTES (só gestor)
   ============================================================ */
const CANAIS = {
  meta: {
    nome: "Meta (Instagram e Facebook)", curto: "Meta",
    campos: [["meta_access_token", "Token de acesso", true], ["meta_ad_account_id", "ID da conta de anúncios", false, "act_1234567890"], ["conta_nome", "Nome da conta (opcional)", false]],
  },
  google: {
    nome: "Google Ads", curto: "Google",
    campos: [["google_developer_token", "Developer token", true], ["google_customer_id", "ID do cliente (só números)", false, "1234567890"],
      ["google_login_customer_id", "ID da conta gerente — MCC (opcional)", false], ["google_client_id", "OAuth client ID", false],
      ["google_client_secret", "OAuth client secret", true], ["google_refresh_token", "Refresh token", true]],
  },
};
const REGRAS_NOMES = [["r1", "Custo por conversa alto"], ["r2", "Campanha sem conversa"], ["r3", "Criativo com CTR baixo"], ["r4", "Fadiga de criativo"]];

function renderAjustes() {
  if (!gestor()) return;
  if (!S.aj.carregado) carregarAjustes();
  renderFormCliente();
  renderFormMarca();
  renderIntegracoes();
  renderContas();
  renderConfig();
}

/* ---------- marca da clínica (logo + cor) → cfg.corMarca / cfg.logoUrl ---------- */
function renderFormMarca() {
  const f = $("#form-marca"), c = clienteAtual();
  if (!c || S.aj.novoCliente) { f.innerHTML = `<p class="vazio">Salve o cliente primeiro; depois escolha o logo e a cor.</p>`; return; }
  const cfg = c.cfg || {}, cor = hexValido(cfg.corMarca) ? String(cfg.corMarca).toUpperCase() : "#B0761F";
  S.aj.marca = { cor, logo: logoValido(cfg.logoUrl) ? cfg.logoUrl : null, sugestoes: [] };
  f.innerHTML = `
    <div class="mk-logo">
      <div class="mk-logo-v" id="mk-logo-v" aria-hidden="true"></div>
      <div class="mk-logo-q">
        <div class="acoes"><label class="pill pill-ghost mk-file">Escolher logo<input type="file" id="mk-arquivo" accept="image/png,image/jpeg,image/webp"></label>
          <button class="link-b" type="button" id="mk-tirar">Tirar o logo</button></div>
        <small>PNG, JPG ou WebP (SVG não). O painel reduz para no máximo 320 × 160 e 60 KB.</small>
      </div>
    </div>
    <fieldset class="mk-cores"><legend>Cor da clínica</legend>
      <div class="mk-sug" id="mk-sug"></div>
      <div class="mk-cor-l">
        <label class="mk-picker"><span class="sr-only">Escolher a cor</span><input type="color" id="mk-cor" value="${cor.toLowerCase()}"></label>
        <label class="campo mk-hex"><span class="sr-only">Cor em hexadecimal</span><input type="text" id="mk-hex" value="${cor}" maxlength="7" spellcheck="false" autocomplete="off" inputmode="text"></label>
      </div>
    </fieldset>
    <div class="mk-prev" id="mk-prev" aria-label="Prévia"></div>
    <p class="mk-aviso" id="mk-aviso"></p>
    <div class="aj-pe"><button class="pill pill-bronze" type="submit" id="mk-salvar">Salvar marca</button></div>
    <p class="aj-st" id="mk-status" role="status"></p>`;
  previaMarca();
}
function previaMarca() {
  const mk = S.aj.marca, prev = $("#mk-prev");
  if (!mk || !prev) return;
  const nome = (clienteAtual() || {}).nome || "Clínica", txt = corTexto(mk.cor), ct = contraste(mk.cor, txt);
  prev.style.setProperty("--pm", mk.cor);
  prev.style.setProperty("--pm-txt", txt);
  const selo = `<span class="selo"><span class="selo-av" data-mk-av></span><span class="selo-nome">${esc(nome)}</span></span>`;
  prev.innerHTML = `<div class="mk-fundo mk-escuro">${selo}<small>no painel</small></div><div class="mk-fundo mk-claro">${selo}<small>no papel</small></div>
    <div class="mk-faixa"><span class="selo-av" data-mk-av></span><b>${esc(nome)}</b><span>Resultados do mês</span></div>`;
  $$("[data-mk-av]", prev).forEach(el => avatarMarca(el, nome, mk));
  avatarMarca($("#mk-logo-v"), nome, mk);
  $("#mk-tirar").hidden = !mk.logo;
  $("#mk-sug").innerHTML = mk.sugestoes.length
    ? `<span class="mk-sug-l">Cores do logo</span>` + mk.sugestoes.map(c => `<button type="button" class="mk-amostra" data-sug="${c}" style="--c:${c}" aria-label="Usar a cor ${c}" aria-pressed="${c === mk.cor}"></button>`).join("")
    : `<span class="mk-sug-l">Suba o logo para ver as cores dele</span>`;
  $("#mk-aviso").textContent = ct < 4.5 ? "Contraste baixo mesmo com preto ou branco: prefira uma cor mais escura ou mais clara."
    : txt === "#05080C" ? "Contraste baixo com letra branca: o texto sobre esta cor vai em preto." : "";
}
function corMarcaNova(c) {
  if (!hexValido(c) || !S.aj.marca) return;
  S.aj.marca.cor = c.toUpperCase();
  $("#mk-cor").value = c.toLowerCase();
  if (document.activeElement !== $("#mk-hex")) $("#mk-hex").value = c.toUpperCase();
  previaMarca();
}
async function logoEscolhido(input) {
  const arq = input.files && input.files[0], st = $("#mk-status");
  if (!arq) return;
  if (!/^image\/(png|jpeg|webp)$/.test(arq.type)) { avisoForm(st, "Use PNG, JPG ou WebP (SVG não entra).", true); input.value = ""; return; }
  const m = await modulo("marca");
  if (!m) return avisoForm(st, "Não deu para ler a imagem agora. Tente de novo.", true);
  avisoForm(st, "Preparando o logo…", false);
  try {
    const r = await m.processarLogo(arq);
    if (!logoValido(r.url)) throw new Error("formato");
    S.aj.marca.logo = r.url;
    S.aj.marca.sugestoes = r.cores;
    if (r.cores[0] && (!S.aj.marca.cor || S.aj.marca.cor === "#B0761F")) S.aj.marca.cor = r.cores[0];
    corMarcaNova(S.aj.marca.cor);
    avisoForm(st, `Logo pronto (${Math.round(r.url.length / 1024)} KB). Confira a prévia e salve.`, false);
  } catch (err) {
    avisoForm(st, err && err.message === "grande" ? "Esse logo ficou grande demais mesmo reduzido. Tente um arquivo mais simples." : "Não deu para ler essa imagem.", true);
  }
  input.value = "";
}
async function salvarMarca(ev) {
  ev.preventDefault();
  const mk = S.aj.marca, st = $("#mk-status"), btn = $("#mk-salvar");
  if (!mk) return;
  ocupado(btn, true);
  try {
    await salvarCfgCliente({ corMarca: mk.cor, logoUrl: mk.logo || "" });
    aplicarMarca({ cor: mk.cor, logo: mk.logo });
    avisoForm(st, "Marca salva ✓ — já vale no painel, na apresentação e na folha do mês.", false);
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, api.mensagemErro(err), true);
  } finally { ocupado(btn, false); }
}

let ajN = 0;
async function carregarAjustes() {
  S.aj.carregado = true;
  S.aj.integ = null; S.aj.contas = null; S.aj.config = null;
  const id = S.clienteId, n = ++ajN;
  const [integ, contas, config] = await Promise.allSettled([
    id ? api.integracoesStatus(S.token, id) : Promise.resolve([]),
    api.contasListar(S.token),
    api.configVer(S.token),
  ]);
  // só vale a leitura mais recente (trocar de cliente ou salvar dispara outra)
  if (n !== ajN || id !== S.clienteId) return;
  const val = r => (r.status === "fulfilled" ? r.value : { erro: r.reason });
  S.aj.integ = val(integ); S.aj.contas = val(contas); S.aj.config = val(config);
  if (S.aba === "ajustes") { renderIntegracoes(); renderContas(); renderConfig(); }
  atualizarBadgeContas();
}

const linhaTicket = (s = "", v = "") => `<div class="tk-row">
  <input type="text" aria-label="Tratamento" value="${esc(s)}" placeholder="Tratamento" data-tk-s>
  <input type="number" aria-label="Valor de ${esc(s || "tratamento")} em reais" value="${esc(v)}" min="0" step="10" inputmode="decimal" placeholder="R$" data-tk-v>
  <button class="tk-x" type="button" aria-label="Remover ${esc(s || "tratamento")}" data-tk-x>×</button></div>`;

function renderFormCliente() {
  const c = clienteAtual(), novo = S.aj.novoCliente || !c;
  const base = novo ? { nome: "", slug: "", ativo: true, cfg: {} } : c;
  const cfg = cfgCom(base.cfg), off = new Set(cfg.regrasOff || []);
  const lista = v => [].concat(v || []).join("\n");
  $("#aj-cliente-h").textContent = novo ? "Novo cliente" : "Cliente";
  $("#btn-novo-cliente").hidden = novo;
  $("#form-cliente").innerHTML = `
    <h3>Identificação</h3>
    <div class="form-2">
      <label class="campo"><span>Nome do cliente</span><input type="text" id="cl-nome" value="${esc(base.nome)}" required></label>
      <label class="campo"><span>Nome curto (relatórios)</span><input type="text" id="cl-curto" value="${esc((base.cfg && base.cfg.nomeCurto) || "")}" placeholder="ex.: Kamiguchi"></label>
    </div>
    <div class="form-2">
      <label class="campo"><span>Identificador</span><input type="text" id="cl-slug" value="${esc(base.slug)}" placeholder="gerado pelo nome" spellcheck="false" autocapitalize="off"><small>Só letras minúsculas, números e hífen.</small></label>
      <div class="campo"><span id="cl-ativo-l">Cliente ativo</span><span class="sw-l"><button class="sw" type="button" role="switch" id="cl-ativo" aria-checked="${base.ativo !== false}" aria-labelledby="cl-ativo-l"></button><small>Desligado: o servidor para de ler e de enviar.</small></span></div>
    </div>
    <h3>Metas</h3>
    <div class="form-3">
      <label class="campo"><span>Custo por conversa (R$)</span><input type="number" id="cl-cpa" min="1" step="0.5" inputmode="decimal" value="${esc(cfg.cpaAlvo)}"></label>
      <label class="campo"><span>Orçamento do mês (R$)</span><input type="number" id="cl-orc" min="0" step="50" inputmode="decimal" value="${esc(cfg.orcamento)}"></label>
      <label class="campo"><span>Gestão mensal (R$)</span><input type="number" id="cl-fee" min="0" step="1" inputmode="decimal" value="${esc(cfg.fee)}"></label>
    </div>
    <h3>Valor de cada tratamento</h3>
    <p class="nota-sm">Estima o resultado quando a clínica não informa o valor fechado.</p>
    <div class="tickets" id="cl-tickets">${Object.entries(cfg.ticket).map(([s, v]) => linhaTicket(s, v)).join("")}</div>
    <p><button class="link-b" type="button" id="cl-tk-add">+ tratamento</button></p>
    <h3>WhatsApp</h3>
    <div class="form-2">
      <label class="campo"><span>Gestor (alertas e diário)</span><textarea id="cl-wagestor" rows="2" placeholder="5512999998888">${esc(lista(cfg.waGestor))}</textarea><small>Um número por linha, com DDD.</small></label>
      <label class="campo"><span>Clínica (resumo do mês)</span><textarea id="cl-wacliente" rows="2" placeholder="5512997552370">${esc(lista(cfg.waCliente))}</textarea><small>Um número por linha, com DDD.</small></label>
    </div>
    <div class="form-2">
      <label class="campo"><span>ID do número da clínica (Cloud API)</span><input type="text" id="cl-waphone" inputmode="numeric" spellcheck="false" autocomplete="off" placeholder="${novo ? "phone_number_id" : "em branco = mantém o atual"}"><small>Liga as conversas que chegam pelo webhook a este cliente.</small></label>
      <label class="campo"><span>Assinatura do resumo</span><input type="text" id="cl-assinatura" value="${esc(cfg.assinatura)}"></label>
    </div>
    <h3>Regras do radar</h3>
    <ul class="regras-aj">${REGRAS_NOMES.map(([id, n]) => `<li><span id="cl-rg-${id}-l">${n}</span><button class="sw" type="button" role="switch" data-rg="${id}" aria-checked="${!off.has(id)}" aria-labelledby="cl-rg-${id}-l"></button></li>`).join("")}</ul>
    <div class="aj-pe">
      <button class="pill pill-bronze" type="submit" id="cl-salvar">${novo ? "Criar cliente" : "Salvar cliente"}</button>
      ${novo && S.clientes.length ? `<button class="pill pill-ghost" type="button" id="cl-cancelar">Cancelar</button>` : ""}
    </div>
    <p class="aj-st" id="cl-status" role="status"></p>`;
}

async function salvarCliente(ev) {
  ev.preventDefault();
  const st = $("#cl-status"), btn = $("#cl-salvar");
  const c = clienteAtual(), novo = S.aj.novoCliente || !c;
  const nome = $("#cl-nome").value.trim();
  if (!nome) { $("#cl-nome").focus(); return avisoForm(st, "Informe o nome do cliente.", true); }
  const slug = $("#cl-slug").value.trim().toLowerCase() || slugDe(nome);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { $("#cl-slug").focus(); return avisoForm(st, "Identificador: use só letras minúsculas, números e hífen.", true); }
  const num = (sel, pad) => { const v = parseFloat(String($(sel).value).replace(",", ".")); return Number.isFinite(v) && v >= 0 ? v : pad; };
  const ticket = {};
  $$("#cl-tickets .tk-row").forEach(r => {
    const s = $("[data-tk-s]", r).value.trim(), v = parseFloat(String($("[data-tk-v]", r).value).replace(",", "."));
    if (s && Number.isFinite(v)) ticket[s] = v;
  });
  // separa por linha, vírgula ou ponto e vírgula — espaço faz parte de "(12) 99999-8888"
  const numeros = sel => [...new Set($(sel).value.split(/[\n,;]+/).map(soDigitos).filter(n => n.length >= 10))];
  const cfg = {
    nomeCurto: $("#cl-curto").value.trim(),
    cpaAlvo: num("#cl-cpa", CFG_PADRAO.cpaAlvo), orcamento: num("#cl-orc", CFG_PADRAO.orcamento), fee: num("#cl-fee", CFG_PADRAO.fee),
    ticket, waGestor: numeros("#cl-wagestor"), waCliente: numeros("#cl-wacliente"),
    assinatura: $("#cl-assinatura").value.trim() || CFG_PADRAO.assinatura,
    regrasOff: $$("#form-cliente [data-rg]").filter(b => b.getAttribute("aria-checked") !== "true").map(b => b.dataset.rg),
  };
  const p = { slug, nome, ativo: $("#cl-ativo").getAttribute("aria-checked") === "true", cfg };
  if (!novo) p.id = c.id;
  const wa = $("#cl-waphone").value.trim();
  if (wa) p.wa_phone_number_id = wa;

  ocupado(btn, true);
  try {
    const r = await api.clienteSalvar(S.token, p);
    const s = await api.sessao(S.token);
    S.clientes = ordenarClientes(s.clientes || []);
    if (novo && r && r.id) S.clienteId = r.id;
    if (!clienteAtual() && S.clientes[0]) S.clienteId = S.clientes[0].id;
    gravarLocal("nx-cliente", S.clienteId);
    S.aj.novoCliente = false;
    S.aj.carregado = false;
    preencherSeletor();
    toast(novo ? "Cliente criado ✓" : "Cliente salvo ✓");
    if (novo) { DS = null; M = null; S.dados = null; relDe = null; }
    renderAjustes();
    await carregarDados({ entrada: false });
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, api.mensagemErro(err), true);
  } finally { ocupado(btn, false); }
}

function htmlCanal(canal) {
  const d = CANAIS[canal], lista = Array.isArray(S.aj.integ) ? S.aj.integ : [];
  const st = lista.find(i => i.canal === canal) || {}, pre = new Set(st.preenchidos || []);
  const status = !st.canal ? "Ainda não configurada."
    : st.ultimo_sync ? `Última leitura ${quandoSP(st.ultimo_sync)}${st.status ? " · " + st.status : ""}` : (st.status || "Ainda não leu os anúncios.");
  const cls = /^erro/i.test(st.status || "") ? " erro" : /^ok/i.test(st.status || "") ? " ok" : "";
  return `<form class="integ" data-canal="${canal}" novalidate>
    <div class="integ-h"><h3>${d.nome}</h3><span class="sw-l"><span id="ig-${canal}-l">Ligada</span><button class="sw" type="button" role="switch" data-ig-ativo aria-checked="${!!st.ativo}" aria-labelledby="ig-${canal}-l"></button></span></div>
    <p class="integ-st${cls}">${esc(status)}</p>
    ${d.campos.map(([k, rot, secreto, ph]) => `<label class="campo"><span>${rot}${pre.has(k) ? `<b class="ok-preenchido">✓ preenchido</b>` : ""}</span>
      <input type="${secreto ? "password" : "text"}" name="${k}" id="ig-${canal}-${k}" autocomplete="${secreto ? "new-password" : "off"}" spellcheck="false" autocapitalize="off" placeholder="${pre.has(k) ? "em branco = mantém o atual" : esc(ph || "")}"></label>`).join("")}
    <div class="aj-pe"><button class="pill pill-ink" type="submit">Salvar ${d.curto}</button></div>
    <p class="aj-st" role="status"></p>
  </form>`;
}

function renderIntegracoes() {
  const box = $("#aj-integracoes");
  if (!S.clienteId || S.aj.novoCliente) { box.innerHTML = `<p class="vazio">Salve o cliente primeiro; depois conecte o Meta e o Google aqui.</p>`; return; }
  if (S.aj.integ == null) { box.innerHTML = carregandoHtml("Lendo as integrações…"); return; }
  if (S.aj.integ.erro) { box.innerHTML = `<p class="vazio">${esc(api.mensagemErro(S.aj.integ.erro))}</p>`; return; }
  box.innerHTML = Object.keys(CANAIS).map(htmlCanal).join("");
}

async function salvarIntegracao(form) {
  const canal = form.dataset.canal, st = $(".aj-st", form), btn = $('[type="submit"]', form);
  const cred = {};
  $$("input[name]", form).forEach(i => { const v = i.value.trim(); if (v) cred[i.name] = v; });
  const ativo = $("[data-ig-ativo]", form).getAttribute("aria-checked") === "true";
  ocupado(btn, true);
  try {
    const r = await api.integracaoSalvar(S.token, S.clienteId, canal, cred, ativo);
    if (Array.isArray(r)) S.aj.integ = r;
    else if (r && r.canal) S.aj.integ = [...(Array.isArray(S.aj.integ) ? S.aj.integ : []).filter(i => i.canal !== r.canal), r];
    if (S.dados && Array.isArray(S.aj.integ)) S.dados.integracoes = S.aj.integ.map(({ canal: c, ativo: a, ultimo_sync, status }) => ({ canal: c, ativo: a, ultimo_sync, status }));
    // redesenha o bloco: credencial digitada não fica na tela
    form.outerHTML = htmlCanal(canal);
    avisoForm($(`#aj-integracoes [data-canal="${canal}"] .aj-st`), `Salvo ✓ — a próxima leitura já usa estes dados.`, false);
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, api.mensagemErro(err), true);
    ocupado(btn, false);
  }
}

async function executarTarefa(tipo, btn) {
  const cid = S.clienteId, st = $("#exec-status");
  if (!cid) return avisoForm(st, "Cadastre ou escolha um cliente primeiro.", true);
  const [tarefa, corpo] = tipo === "ciclo" ? ["nx-ciclo", { cliente: cid }] : ["nx-relatorio", { tipo, cliente: cid, forcar: true }];
  ocupado(btn, true);
  try {
    await api.executar(S.token, tarefa, corpo);
    const h = FMT_HORA.format(new Date());
    avisoForm(st, tipo === "ciclo"
      ? `Pedido enviado às ${h}. Os números novos aparecem em 1 ou 2 minutos — o painel recarrega sozinho.`
      : `Pedido enviado às ${h}. O ${tipo === "mensal" ? "resumo do mês" : "relatório do dia"} chega no WhatsApp dos destinos em instantes.`, false);
    clearTimeout(S.aj.tRecarga);
    S.aj.tRecarga = setTimeout(() => { if (S.clienteId === cid) carregarDados({ entrada: false }); }, tipo === "ciclo" ? 90000 : 45000);
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, api.mensagemErro(err), true);
  } finally { ocupado(btn, false); }
}

function htmlConta(c) {
  const eu = S.conta && c.id === S.conta.id, clis = new Set(c.clientes || []), pend = !c.aprovado, id = esc(c.id);
  return `<li class="conta${pend ? " pendente" : ""}" data-conta="${id}">
    <div class="ct-q"><strong>${esc(c.nome || "Sem nome")}${eu ? " (você)" : ""}</strong><span>${esc(c.email)}</span><small>conta criada em ${dataTs(c.criado_em)}</small>
      <span class="chips">${pend ? `<span class="chip chip-warn">aguardando aprovação</span>` : `<span class="chip chip-ok">acesso liberado</span>`}<span class="chip chip-neutro">${c.papel === "gestor" ? "gestor" : "clínica"}</span></span></div>
    <div class="ct-ctrl">
      <div class="ct-linha">
        <label class="campo"><span>Tipo de conta</span><select data-ct-papel>
          <option value="clinica"${c.papel !== "gestor" ? " selected" : ""}>Clínica — vê só os clientes marcados</option>
          <option value="gestor"${c.papel === "gestor" ? " selected" : ""}>Gestor da Nexus — vê todos</option></select></label>
        <span class="sw-l"><button class="sw" type="button" role="switch" data-ct-aprov aria-checked="${!!c.aprovado}" aria-labelledby="ct-${id}-l"></button><span id="ct-${id}-l">Acesso liberado</span></span>
      </div>
      <fieldset class="ct-clis" data-ct-clis${c.papel === "gestor" ? " hidden" : ""}><legend>Clientes que esta conta vê</legend>
        ${S.clientes.length ? S.clientes.map(k => `<label class="chk"><input type="checkbox" value="${esc(k.id)}"${clis.has(k.id) ? " checked" : ""}> ${esc(k.nome)}</label>`).join("") : `<span class="nota-sm">Nenhum cliente cadastrado ainda.</span>`}
      </fieldset>
      <div class="aj-pe">${pend ? `<button class="pill pill-bronze" type="button" data-ct-aprovar>Aprovar e salvar</button>` : ""}<button class="pill pill-ink" type="button" data-ct-salvar>Salvar</button></div>
      <p class="aj-st" role="status"></p>
    </div></li>`;
}

function renderContas() {
  const ul = $("#aj-contas"), L = S.aj.contas;
  if (L == null) { ul.innerHTML = `<li>${carregandoHtml("Lendo as contas…")}</li>`; return; }
  if (L.erro) { ul.innerHTML = `<li class="vazio">${esc(api.mensagemErro(L.erro))}</li>`; return; }
  if (!L.length) { ul.innerHTML = `<li class="vazio">Nenhuma conta ainda.</li>`; return; }
  ul.innerHTML = L.slice().sort((a, b) => (!!a.aprovado - !!b.aprovado) || String(b.criado_em).localeCompare(String(a.criado_em))).map(htmlConta).join("");
}

function atualizarBadgeContas() {
  const n = Array.isArray(S.aj.contas) ? S.aj.contas.filter(c => !c.aprovado).length : 0;
  $$("[data-badge-aj]").forEach(b => { b.textContent = n; b.hidden = !n; });
}

async function salvarConta(li, aprovar, btn) {
  const st = $(".aj-st", li), sw = $("[data-ct-aprov]", li);
  const papel = $("[data-ct-papel]", li).value;
  if (aprovar) sw.setAttribute("aria-checked", "true");
  const aprovado = sw.getAttribute("aria-checked") === "true";
  const clientes = papel === "gestor" ? [] : $$("[data-ct-clis] input:checked", li).map(i => i.value);
  if (aprovado && papel !== "gestor" && !clientes.length) return avisoForm(st, "Marque pelo menos um cliente para esta conta ver.", true);
  ocupado(btn, true);
  try {
    const r = await api.contaDefinir(S.token, li.dataset.conta, aprovado, papel, clientes);
    if (Array.isArray(r)) S.aj.contas = r;
    renderContas();
    atualizarBadgeContas();
    toast("Conta atualizada ✓");
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, api.mensagemErro(err), true);
    ocupado(btn, false);
  }
}

const nomeTarefa = t => ({ "nx-ciclo": "Leitura dos anúncios + radar", "nx-relatorio": "Relatório", "nx-whatsapp": "Webhook do WhatsApp" }[t] || t || "Tarefa");
const resumoTxt = r => !r ? "" : typeof r === "string" ? r.slice(0, 180) : JSON.stringify(r).slice(0, 180);

function renderConfig() {
  const c = S.aj.config, f = $("#form-config"), ex = $("#aj-execucoes");
  if (c == null) { f.innerHTML = carregandoHtml("Lendo a configuração…"); ex.innerHTML = ""; return; }
  if (c.erro) { f.innerHTML = `<p class="vazio">${esc(api.mensagemErro(c.erro))}</p>`; ex.innerHTML = ""; return; }
  $("#cfg-webhook").textContent = c.webhook_url || "—";
  $("#cfg-verify").textContent = c.wa_verify_token || "—";
  const sec = (k, rot, tem, dica) => `<label class="campo"><span>${rot}${tem ? `<b class="ok-preenchido">✓ preenchido</b>` : ""}</span>` +
    `<input type="password" name="${k}" id="cf-${k}" autocomplete="new-password" spellcheck="false" placeholder="${tem ? "em branco = mantém o atual" : ""}">${dica ? `<small>${dica}</small>` : ""}</label>`;
  const txt = (k, rot, dica = "", ph = "") => `<label class="campo"><span>${rot}</span>` +
    `<input type="text" name="${k}" id="cf-${k}" value="${esc(c[k] ?? "")}" spellcheck="false" autocapitalize="off" placeholder="${esc(ph)}"${k === "modelo_ia" ? ` list="cf-modelos"` : ""}>${dica ? `<small>${dica}</small>` : ""}</label>`;
  f.innerHTML = `
    <h3>WhatsApp da Nexus (quem envia os avisos)</h3>
    <div class="form-2">${txt("wa_phone_number_id", "ID do número (phone_number_id)")}${sec("wa_access_token", "Token de acesso", c.tem_wa_token)}</div>
    <div class="form-2">${txt("wa_template", "Modelo aprovado (fora da janela de 24h)", "Parâmetros do modelo: título curto e link do painel.")}${sec("meta_app_secret", "App secret (confere o webhook)", c.tem_app_secret)}</div>
    <h3>Leitura por IA</h3>
    <div class="form-2">${sec("anthropic_api_key", "Chave da API", c.tem_ia, "Sem chave, a leitura sai por regras fixas.")}${txt("modelo_ia", "Modelo", "", "claude-opus-5")}</div>
    <datalist id="cf-modelos"><option value="claude-opus-5"></option><option value="claude-fable-5-1"></option></datalist>
    <h3>Outros</h3>
    <div class="form-2">${txt("painel_url", "Endereço do painel", "Vai como link no modelo de WhatsApp.")}${txt("google_api_versao", "Versão da API do Google", "Em branco: o servidor descobre sozinho.", "automático")}</div>
    <div class="aj-pe"><button class="pill pill-bronze" type="submit" id="cf-salvar">Salvar configuração</button></div>
    <p class="aj-st" id="cf-status" role="status"></p>`;
  const L = c.ultimas_execucoes || [];
  ex.innerHTML = `<h3>Últimas execuções do servidor</h3>` + (L.length
    ? `<ul>${L.slice(0, 8).map(e => `<li><span aria-hidden="true">${e.ok === false ? "✗" : e.ok ? "✓" : "…"}</span><div><b>${esc(nomeTarefa(e.tarefa))}</b> · ${quandoSP(e.inicio)}` +
        `<span class="sr-only">${e.ok === false ? " — deu erro" : e.ok ? " — deu certo" : " — em andamento"}</span>${e.ok === false ? ` <span class="chip chip-bad">erro</span>` : ""}<small>${esc(resumoTxt(e.resumo))}</small></div></li>`).join("")}</ul>`
    : `<p class="vazio">Nenhuma execução registrada ainda.</p>`);
}

async function salvarConfig(ev) {
  ev.preventDefault();
  const f = $("#form-config"), st = $("#cf-status"), btn = $("#cf-salvar");
  // segredo em branco = mantém; texto em branco só é mandado quando "vazio" tem sentido
  const LIMPAVEIS = new Set(["wa_template", "google_api_versao"]);
  const cfg = {};
  $$("input[name]", f).forEach(i => {
    const v = i.value.trim();
    if (v || (i.type !== "password" && LIMPAVEIS.has(i.name))) cfg[i.name] = v;
  });
  ocupado(btn, true);
  try {
    const r = await api.configSalvar(S.token, cfg);
    if (r && typeof r === "object" && !Array.isArray(r)) S.aj.config = r;
    renderConfig();
    avisoForm($("#cf-status"), "Configuração salva ✓", false);
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, api.mensagemErro(err), true);
    ocupado(btn, false);
  }
}

/* ============================================================
   8½. RECURSOS — curta, folha, simulador, marcos, "desde a última visita"
   ============================================================ */
/** "Para o próximo mês": os MESMOS textos do resumo mensal (sem emoji, sem tópico). */
function proximosPassos(mes) {
  const L = M.relMensal(mes).split("\n"), i = L.findIndex(l => /Para o próximo mês/.test(l));
  if (i < 0) return [];
  const out = [];
  for (let k = i + 1; k < L.length && L[k].trim(); k++) out.push(semMarcas(L[k]).replace(/^[•\-\s]+/, "").trim());
  return out.filter(Boolean).slice(0, 3);
}
/** O anúncio campeão: a campanha com mais pacientes que fecharam (crmTot) e o criativo dela com mais conversas. */
function campeao(de, ate, f = {}) {
  const top = Object.values(M.CAMP).filter(c => c.plat && (!f.plat || c.plat === f.plat))
    .map(c => ({ c, k: M.crmTot(de, ate, { camp: c.id }) })).filter(x => x.k.conversas || x.k.fecharam)
    .sort((a, b) => (b.k.fecharam - a.k.fecharam) || (b.k.receita - a.k.receita) || (b.k.conversas - a.k.conversas))[0];
  if (!top) return null;
  const cri = Object.values(M.CRI).filter(k => k.camp === top.c.id)
    .map(k => ({ k, t: M.consolidar(M.linhasDe(de, ate, { cri: k.id })) })).sort((a, b) => b.t.conversoes - a.t.conversoes)[0];
  return { camp: top.c, k: top.k, cri: cri ? cri.k : null };
}
const mesDoPeriodo = () => { const d = M.dataDe(M.R); return { de: janela().de, ate: M.R, mes: d.getMonth(), ano: d.getFullYear() }; };

/* ---------- o curta (curta.js) ---------- */
function ctxCurta() {
  const P = numerosPeriodo();
  return {
    M, P, nome: nomeCliente(), marca: { ...MARCA }, demo: S.demo, gestor: gestor(), anim: ANIM, fino: FINE, FX, CINE,
    campeao: campeao(P.de, P.ate, P.f), proximos: proximosPassos(mesDoPeriodo()),
    nomeCurto, foneHtml, avatarMarca, simuladorHtml, ligarSimulador, corServ, AVC, hash,
    voltar: () => $("#btn-apresentar"),
    aoFolha: () => abrirFolhaMes(),
    aoSair: () => { if (CINE) CINE.semente(1); },
  };
}
async function apresentar(o = {}) {
  if (!M || semAnuncios()) return toast("Ainda não há números de anúncio para apresentar.", "nota");
  const m = await modulo("curta");
  if (!m) return toast("Não deu para abrir a apresentação agora. Tente de novo.", "erro");
  if (CINE) CINE.semente(5);
  m.abrir(ctxCurta(), o);
}
/** Link da reunião: a demo já abre com o nome e a cor da clínica (o logo não vai no link). */
function linkReuniao() {
  const q = ["demo"];
  if (CLINICA_Q) q.push("clinica=" + encodeURIComponent(CLINICA_Q));
  if (MARCA.cor) q.push("cor=" + MARCA.cor.slice(1));
  q.push("apresentar");
  return `${location.origin}${location.pathname}?${q.join("&")}`;
}

/* ---------- a folha do mês (folha.js) ---------- */
async function abrirFolhaMes(iso) {
  if (!M) return;
  const meses = M.mesesDados().filter(m => m.completo);
  const pedido = iso ? String(iso).slice(0, 7) : null;
  const m = pedido ? meses.find(x => isoI(x.de).slice(0, 7) === pedido) : meses[meses.length - 1];
  if (!m) return toast(pedido ? "Esse mês ainda não está completo: a folha sai de mês fechado." : "Ainda não há um mês completo para a folha.", "nota");
  const f = await modulo("folha");
  if (!f) return toast("Não deu para montar a folha agora. Tente de novo.", "erro");
  const lista = M.mesesDados().filter(x => x.de <= m.de && (x.ate - x.de >= 9 || x.completo)).slice(-4);
  f.abrir({
    M, m, nome: nomeCliente(), marca: { ...MARCA }, demo: S.demo, avatarMarca, corServ,
    meses: lista.map(x => ({ ...x, fecharam: M.crmTot(x.de, x.ate).fecharam })),
    proximos: proximosPassos(m), campeao: campeao(m.de, m.ate), volta: document.activeElement,
  });
}

/* ---------- "E na sua clínica?" (só na demo) ---------- */
function taxasDemo() {
  const { t, c } = numerosPeriodo();
  return { cpa: t.cpa || 0, ag: c.conversas ? c.agendadas / c.conversas : 0, veio: c.agendadas ? c.compareceram / c.agendadas : 0,
    fe: c.compareceram ? c.fecharam / c.compareceram : 0, ticket: c.fecharam ? c.receita / c.fecharam : 0, mensal: t.gasto * 30 / S.dias };
}
const SIM = { inv: null, tk: null };
function simuladorHtml(curto = false) {
  const tx = taxasDemo();
  const inv = SIM.inv ?? Math.min(6000, Math.max(800, Math.round(tx.mensal / 100) * 100));
  const tk = SIM.tk ?? Math.max(300, Math.round(tx.ticket / 10) * 10);
  const res = (k, rot) => `<div class="sim-res-i"><dt>${rot}</dt><dd>entre <b data-sim="${k}0">—</b> e <b data-sim="${k}1">—</b></dd></div>`;
  return `${curto ? "" : `<header class="card-h"><div><p class="eyebrow">só na demonstração</p><h2>E na sua clínica?</h2>
      <p class="sub">Mexa no investimento e no valor médio do tratamento. A conta usa as taxas deste período da demonstração.</p></div></header>`}
    <div class="sim">
      <div class="sim-ctl">
        <label class="sim-r"><span class="sim-l">Investimento em anúncios por mês <output class="sim-inv-o"></output></span>
          <input class="sim-inv" type="range" min="800" max="6000" step="100" value="${inv}"></label>
        <label class="sim-r"><span class="sim-l">Valor médio do tratamento <output class="sim-tk-o"></output></span>
          <input class="sim-tk" type="range" min="300" max="6000" step="10" value="${tk}"></label>
      </div>
      <dl class="sim-res">${res("c", "conversas no WhatsApp por mês")}${res("p", "pacientes novos por mês")}${res("r", "em tratamentos por mês")}</dl>
      <p class="sim-nota">Estimativa com as taxas desta demonstração. Não é promessa: cada clínica tem o seu ritmo.</p>
    </div>`;
}
function ligarSimulador(box) {
  const tx = taxasDemo(), inv = $(".sim-inv", box), tk = $(".sim-tk", box);
  if (!inv || !tk) return;
  const por = (k, v, f) => {
    const el = $(`[data-sim="${k}"]`, box), novo = fmtN(v, f), antes = el.dataset.v;
    el.dataset.v = novo;
    if (FX && ANIM && antes && antes !== novo) FX.odometro(el, antes, novo, { dur: FX.MOV.tInterp }); else el.textContent = novo;
  };
  const atualizar = () => {
    SIM.inv = +inv.value; SIM.tk = +tk.value;
    const r = simular(tx, SIM.inv, SIM.tk);
    $(".sim-inv-o", box).textContent = brl0(SIM.inv);
    $(".sim-tk-o", box).textContent = brl0(SIM.tk);
    por("c0", r.conversas[0], "int"); por("c1", r.conversas[1], "int");
    por("p0", r.pacientes[0], "int"); por("p1", r.pacientes[1], "int");
    por("r0", r.tratamentos[0], "brl0"); por("r1", r.tratamentos[1], "brl0");
  };
  inv.addEventListener("input", atualizar);
  tk.addEventListener("input", atualizar);
  atualizar();
}
function renderSimulador() {
  const box = $("#card-sim");
  if (!box) return;
  if (!S.demo || !M || semAnuncios()) { box.hidden = true; box.innerHTML = ""; return; }
  box.innerHTML = simuladorHtml();
  box.hidden = false;
  ligarSimulador(box);
}

/* ---------- marcos no gráfico (claquetes) ---------- */
const MARCOS_DEMO = [{ atras: 9, t: "Verba +20% no aparelho invisível" }, { atras: 21, t: "Troca de criativo · prova social" }];
function marcosAtuais() {
  if (!M) return [];
  if (S.demo) return MARCOS_DEMO.map(m => ({ d: isoI(M.R - m.atras), t: m.t, exemplo: true }));
  const c = clienteAtual(), l = (c && c.cfg && Array.isArray(c.cfg.marcos)) ? c.cfg.marcos : Array.isArray(M.CFG.marcos) ? M.CFG.marcos : [];
  return l.filter(m => m && /^\d{4}-\d{2}-\d{2}$/.test(m.d) && typeof m.t === "string" && m.t.trim()).slice(-40);
}
const marcoDoDia = i => marcosAtuais().find(m => iDeIso(m.d) === i) || null;
function abrirMarco(i) {
  const f = $("#marco-form");
  if (!gestor() || i == null) { f.hidden = true; return; }
  const m = marcoDoDia(i);
  S.marcoFixo = i;
  f.innerHTML = `<svg class="mf-ic" aria-hidden="true"><use href="#ic-claq"/></svg>
    <label class="campo"><span>Marcar ${SEMANA[M.dataDe(i).getDay()]} · ${M.ddmm(i)}</span>
      <input type="text" id="marco-txt" maxlength="60" autocomplete="off" placeholder="ex.: Troca de criativo" value="${esc(m ? m.t : "")}"></label>
    <div class="acoes"><button class="pill pill-bronze pill-sm" type="submit">Salvar marco</button>
      ${m ? `<button class="pill pill-ghost pill-sm" type="button" data-marco="remover">Remover</button>` : ""}
      <button class="link-b" type="button" data-marco="cancelar">Cancelar</button></div>`;
  f.hidden = false;
  $("#marco-txt").focus({ preventScroll: true });
}
function fecharMarco(focar) {
  const f = $("#marco-form");
  if (f.hidden) return;
  f.hidden = true; f.innerHTML = ""; S.marcoFixo = null;
  const ch = $("#chart-dia");
  if (ch._soltar) ch._soltar();
  if (focar) ch.focus({ preventScroll: true });
}
async function salvarMarco(remover) {
  const i = S.marcoFixo;
  if (i == null || !gestor()) return;
  const d = isoI(i), t = remover ? "" : ($("#marco-txt").value || "").trim().slice(0, 60);
  const lista = marcosAtuais().filter(m => m.d !== d).map(({ d: dd, t: tt }) => ({ d: dd, t: tt }));
  if (t) lista.push({ d, t });
  lista.sort((a, b) => a.d.localeCompare(b.d));
  try {
    await salvarCfgCliente({ marcos: lista.slice(-40) });
    toast(remover ? "Marco removido ✓" : t ? "Marco salvo ✓" : "Marco removido ✓");
    fecharMarco(true);
    desenharChart(null);
  } catch (err) { if (err.codigo !== "sessao_invalida") toast(api.mensagemErro(err), "erro"); }
}

/* ---------- "Desde a sua última visita" (conta de clínica, modo real) ---------- */
const chaveVistos = () => `nx-fechados-${S.clienteId}`;
function renderDesdeVisita() {
  const box = $("#desde-visita");
  if (!box) return;
  if (S.demo || gestor() || !S.clienteId || !M) { box.hidden = true; return; }
  const fechados = M.LEADS.filter(L => M.etapa(L) === "fechou"), ids = fechados.map(L => String(L.id));
  let vistos;
  try { const s = localStorage.getItem(chaveVistos()); vistos = s ? JSON.parse(s) : null; } catch { box.hidden = true; return; }
  // 1ª visita: só guarda quem já fechou; o cartão aparece a partir da próxima
  if (!Array.isArray(vistos)) { gravarLocal(chaveVistos(), JSON.stringify(ids)); box.hidden = true; return; }
  const ja = new Set(vistos.map(String)), novos = fechados.filter(L => !ja.has(String(L.id)));
  if (!novos.length) { box.hidden = true; return; }
  const total = novos.reduce((s, L) => s + M.valorLead(L), 0);
  box.innerHTML = `<div class="desde-q"><p class="eyebrow">Desde a sua última visita</p>
      <h2 id="desde-h"><b>${plural(novos.length, "paciente novo", "pacientes novos")}</b> · ${brl0(total)}</h2>
      <ul class="desde-l">${novos.slice(0, 5).map(L => `<li><b>${esc(nomeCurto(L.nome))}</b><span>${esc(L.servico)} · ${brl0(M.valorLead(L))}</span></li>`).join("")}${novos.length > 5 ? `<li><span>e mais ${novos.length - 5}</span></li>` : ""}</ul></div>
    <div class="acoes"><button class="pill pill-bronze" type="button" data-desde="ver">Ver no quadro</button><button class="pill pill-ghost" type="button" data-desde="ok">Ok</button></div>`;
  box.setAttribute("aria-labelledby", "desde-h");
  box._ids = ids; box._novos = novos.map(L => String(L.id));
  box.hidden = false;
}
function desdeAcao(acao) {
  const box = $("#desde-visita");
  gravarLocal(chaveVistos(), JSON.stringify(box._ids || []));
  box.hidden = true;
  if (acao === "ver") {
    S.destacar = new Set(box._novos || []);
    setAba("pacientes", { corte: true });
    setTimeout(() => { const c = $("#kanban .lead.destaque"); if (c) { c.scrollIntoView({ block: "center", behavior: REDUCE ? "auto" : "smooth" }); c.focus({ preventScroll: true }); } }, 120);
    setTimeout(() => { S.destacar = new Set(); $$("#kanban .lead.destaque").forEach(c => c.classList.remove("destaque")); }, 9000);
  } else { const h = $(".card-hero"); if (h) h.setAttribute("tabindex", "-1"), h.focus({ preventScroll: true }); }
}

/* ---------- paleta (paleta.js) e arrasto das fichas (arrastar.js) ---------- */
const modalAberto = () => !$("#gaveta").hidden || !$("#palco-curta").hidden || !$("#folha-modal").hidden || !!document.querySelector(".paleta:not([hidden])");
async function abrirPaleta() {
  const m = await modulo("paleta");
  if (!m) return;
  m.abrir({
    abas: Object.entries(ABAS).filter(([k]) => k !== "ajustes" || gestor()).map(([k, v]) => ({ k, nome: v[0] })),
    leads: M ? M.LEADS.filter(L => colunaDe(L) || M.etapa(L) === "nova").sort((a, b) => b.i - a.i).map(L => ({ id: String(L.id), nome: nomeCurto(L.nome), sub: `${L.servico} · ${NOME_ETAPA[M.etapa(L)] || ""}` })) : [],
    campanhas: M ? Object.values(M.CAMP).filter(c => c.plat).map(c => ({ id: c.id, nome: c.nome, sub: nomePlat(c.plat) })) : [],
    acoes: [
      ...[7, 30, 60].map(d => ({ k: `d${d}`, nome: `${d} dias`, sub: "período", fn: () => $(`#seg-periodo [data-v="${d}"]`).click() })),
      ...[["", "Tudo"], ["meta", "Meta"], ["google", "Google"]].map(([v, n]) => ({ k: `p${v}`, nome: n, sub: "plataforma", fn: () => $(`#seg-plat [data-v="${v}"]`).click() })),
      { k: "apresentar", nome: "Apresentar", sub: "modo reunião · P", fn: () => apresentar({ gesto: true }) },
      { k: "folha", nome: "Folha do mês", sub: "A4 para imprimir", fn: () => abrirFolhaMes() },
      ...(S.demo ? [{ k: "tour", nome: "Tour de 1 minuto", sub: "demonstração", fn: () => tourIr(0) }] : []),
      { k: "varrer", nome: "Varrer agora", sub: "radar", fn: () => { setAba("radar", { corte: true }); setTimeout(() => $("#btn-varrer").click(), 60); } },
      { k: "novo", nome: "Novo paciente", sub: "cadastro manual", fn: () => { setAba("pacientes"); abrirGaveta(null); } },
      ...(gestor() && S.clientes.length > 1 ? [{ k: "cliente", nome: "Trocar cliente", sub: "gestor", fn: () => { const s = $("#sel-cliente").offsetParent ? $("#sel-cliente") : $("#sel-cliente-m"); s.focus(); } }] : []),
      ...(!S.demo ? [{ k: "sair", nome: "Sair", sub: "encerrar a sessão", fn: sair }] : []),
    ],
    irAba: k => setAba(k, { corte: true }),
    abrirLead: id => { const L = M.LEADS.find(x => String(x.id) === id); if (L) { if (S.aba !== "pacientes") setAba("pacientes"); abrirGaveta(L); } },
    abrirCampanha: id => {
      setAba("campanhas", { corte: true });
      setTimeout(() => { const tr = $(`#tbl-campanhas tr[data-camp="${CSS.escape(id)}"]`); if (tr) { tr.classList.add("realce"); tr.scrollIntoView({ block: "center", behavior: REDUCE ? "auto" : "smooth" }); setTimeout(() => tr.classList.remove("realce"), 2400); } }, 80);
    },
    semAcento, anim: ANIM,
  });
}
let arrastoOk = false;
function ligarArrasto() {
  if (arrastoOk) return;
  arrastoOk = true;
  modulo("arrastar").then(m => {
    if (!m) { arrastoOk = false; return; }
    m.ligar($("#kanban"), {
      fino: FINE, anim: ANIM, FX,
      colunas: COLS_K.map(c => c[0]),
      nomeColuna: k => ((COLS_K.find(c => c[0] === k) || [])[1] || k).replace(/\s*\(.*\)$/, ""),
      lead: id => (M ? M.LEADS.find(x => String(x.id) === String(id)) : null),
      nome: L => nomeCurto(L.nome),
      soltar: (L, col, o) => soltarNaColuna(L, col, o),
      anunciar: msg => { const v = $("#k-vivo"); v.textContent = ""; setTimeout(() => { v.textContent = msg; }, 30); },
    });
  });
}

/* ============================================================
   9. ABAS, FILTROS, TOUR (e a câmera na troca de aba)
   ============================================================ */
const ABAS = {
  geral: ["Visão geral", "Anúncios → WhatsApp → consultório", renderGeral],
  campanhas: ["Campanhas", "O que cada anúncio entrega", renderCampanhas],
  pacientes: ["Pacientes", "Do WhatsApp à cadeira do consultório", renderPacientes],
  radar: ["Radar", "Vigilância automática das campanhas", renderRadar],
  relatorios: ["Relatórios", "O que chega no WhatsApp", renderRelatorios],
  ajustes: ["Ajustes", "Cliente, integrações, contas e WhatsApp", renderAjustes],
};
const COM_FILTRO = ["geral", "campanhas", "pacientes"];

function estadoApp(tipo, o = {}) {
  S.estado = tipo || null;
  const el = $("#estado-app");
  el.innerHTML = !tipo ? "" : tipo === "carregando" ? esqueletoHtml(o.msg || "Carregando os números…") : cartaoVazio(o);
  aplicarVisibilidade();
  renderIntegracao();
}

function aplicarVisibilidade() {
  const dadosOk = !S.estado && !!M;
  const ver = S.aba === "ajustes" ? gestor() : dadosOk;
  $$(".view").forEach(v => { v.hidden = !(ver && v.id === "view-" + S.aba); });
  $("#estado-app").hidden = !S.estado || S.aba === "ajustes";
  $("#filters").hidden = !COM_FILTRO.includes(S.aba) || !dadosOk || (S.aba !== "pacientes" && semAnuncios());
  $("#btn-tour").hidden = !S.demo || !dadosOk;
  $("#btn-apresentar").hidden = !dadosOk || S.aba === "ajustes" || semAnuncios();
  // sem filtro nem tour, a caixa vazia ainda ocupava o espaçamento do cabeçalho
  $(".top-tools").hidden = $("#filters").hidden && $("#btn-tour").hidden && $("#btn-apresentar").hidden;
  $("#btn-filtros-m").hidden = $("#filters").hidden;
  if ($(".top-tools").hidden) abrirFolha(false);
}

function render() {
  aplicarVisibilidade();
  if (S.aba !== "ajustes" && (S.estado || !M)) return;
  const view = $("#view-" + S.aba);
  ABAS[S.aba][2]();
  // câmera: números rolam do valor anterior; cada bloco entra em quadro uma vez (depois só transforma)
  numeros(view);
  cenas(view);
  posicionarSegs();
  renderIntegracao();
}

let vtAtual = null;
function setAba(aba, o = {}) {
  if (!ABAS[aba] || (aba === "ajustes" && !gestor())) aba = "geral";
  if (!o.doTour) tourFim();
  const cortar = o.corte && ANIM && aba !== S.aba;
  const trocar = () => {
    S.aba = aba;
    $$("[data-aba]").forEach(b => { if (b.dataset.aba === aba) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $("#top-h1").textContent = ABAS[aba][0];
    $("#top-eyebrow").textContent = ABAS[aba][1];
    document.title = `${ABAS[aba][0]} · ${nomeCliente()} · Nexus Ads${S.demo ? " (demonstração)" : ""}`;
    if (!o.semRolar) scrollTo({ top: 0, behavior: "instant" });
    render(true);
    moverIndicadores();
    if (cortar) {
      const h = $("#top-h1");
      h.classList.remove("revela"); void h.offsetWidth; h.classList.add("revela");
      if (CINE) CINE.corte();
    }
    try { history.replaceState(null, "", "#" + aba); } catch { /* file:// */ }
  };
  // corte de cinema: o foco sai, uma faixa de luz cruza e o foco volta (View Transitions, com recuo por classes)
  if (cortar && document.startViewTransition) {
    try { if (vtAtual) vtAtual.skipTransition(); } catch { /* já terminou */ }
    try {
      vtAtual = document.startViewTransition(trocar);
      vtAtual.ready.catch(() => {}); vtAtual.updateCallbackDone.catch(() => {});
      vtAtual.finished.catch(() => {}).then(() => { vtAtual = null; });
      return;
    } catch { vtAtual = null; }
  }
  trocar();
  if (cortar) {
    const v = $("#view-" + aba);
    v.classList.remove("foca"); void v.offsetWidth; v.classList.add("foca");
    clearTimeout(v._tFoca); v._tFoca = setTimeout(() => v.classList.remove("foca"), 800);
  }
}

/** Indicadores únicos que deslizam: pílula do menu lateral e da tab bar. */
function moverIndicadores() {
  const nav = $("#side-nav"), ind = nav && $(".nav-ind", nav), on = nav && $('.nav-b[aria-current="page"]', nav);
  if (ind && on && on.offsetHeight) {
    ind.style.setProperty("--y", on.offsetTop + "px");
    ind.style.height = on.offsetHeight + "px";
    if (!ind.classList.contains("pronto")) requestAnimationFrame(() => requestAnimationFrame(() => ind.classList.add("pronto")));
  }
  const tb = $("#tabbar"), ti = tb && $(".tab-ind", tb), ta = tb && $('button[aria-current="page"]', tb);
  if (ti && ta && ta.offsetWidth) {
    ti.style.setProperty("--tx", ta.offsetLeft + "px");
    ti.style.setProperty("--tw", ta.offsetWidth + "px");
    if (!ti.classList.contains("pronto")) requestAnimationFrame(() => requestAnimationFrame(() => ti.classList.add("pronto")));
  }
}

/* ---------- folha de filtros (celular) ---------- */
const textoFiltros = () => { const t = $("#filtros-m-txt"); if (t) t.textContent = `${S.dias} dias · ${S.plat ? nomePlat(S.plat) : "Tudo"}`; };
function abrirFolha(on) {
  const tools = $("#top-tools"), bf = $("#btn-filtros-m"), ff = $("#filtros-fundo");
  if (!tools || (!on && !tools.classList.contains("aberta"))) return;
  tools.classList.toggle("aberta", on);
  $(".top").classList.toggle("folha-aberta", on);   // tira a folha do contexto do cabeçalho (fica acima da tab bar)
  tools.classList.remove("arrastando");
  tools.style.removeProperty("--fy");
  ff.hidden = !on; ff.classList.toggle("on", on);
  bf.setAttribute("aria-expanded", String(on));
  if (on) { posicionarSegs(); const r = $('#seg-periodo [aria-checked="true"]'); if (r) r.focus({ preventScroll: true }); }
  else if (tools.contains(document.activeElement)) bf.focus({ preventScroll: true });
}

function ligarSeg(seg, aoMudar) {
  const btns = $$("button", seg), ind = $(".seg-ind", seg);
  const pos = () => {
    const on = btns.find(b => b.getAttribute("aria-checked") === "true");
    if (!on || !on.offsetWidth) return;
    // pílula que desliza com mola (clip-path mantém as pontas redondas; nada de animar largura)
    ind.style.setProperty("--sx", (on.offsetLeft - 3) + "px");
    ind.style.setProperty("--sw", on.offsetWidth + "px");
    if (!ind.classList.contains("pronto")) requestAnimationFrame(() => requestAnimationFrame(() => ind.classList.add("pronto")));
  };
  const sel = b => {
    btns.forEach(x => { const s = x === b; x.setAttribute("aria-checked", String(s)); x.tabIndex = s ? 0 : -1; });
    pos(); aoMudar(b.dataset.v);
  };
  btns.forEach((b, n) => {
    b.tabIndex = b.getAttribute("aria-checked") === "true" ? 0 : -1;
    b.addEventListener("click", () => { if (b.getAttribute("aria-checked") !== "true") sel(b); });
    b.addEventListener("keydown", e => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const nb = btns[(n + d + btns.length) % btns.length];
      sel(nb); nb.focus();
    });
  });
  seg._pos = pos;
}
const posicionarSegs = () => $$(".seg").forEach(s => s._pos && s._pos());

const TOUR = [
  { aba: "geral", alvo: '[data-tour="hero"]', txt: "Tudo o que importa, numa frase: quantas pessoas chamaram no WhatsApp, quantas agendaram e quantas viraram pacientes — e quanto isso rendeu." },
  { aba: "geral", alvo: '[data-tour="funil"]', txt: "O funil mostra onde cada paciente entrou e onde parou. Cada etapa é comparada com a meta, para saber exatamente o que melhorar." },
  { aba: "pacientes", alvo: '[data-tour="kanban"]', txt: "Cada conversa vira um cartão. A senhora vê quais pacientes vieram dos anúncios, de qual anúncio e quanto cada um rendeu — e muda a etapa com um toque." },
  { aba: "radar", alvo: '[data-tour="radar"]', txt: "O radar confere tudo de hora em hora. Se um anúncio começa a gastar mal, o aviso chega na hora — antes de desperdiçar verba." },
  { aba: "relatorios", alvo: '[data-tour="relatorio"]', txt: "E todo dia 1º, este resumo chega no WhatsApp da senhora. Sem precisar abrir sistema nenhum." },
];
let tourI = -1, tourEl = null;

/** Rola para o alvo caber na faixa LIVRE: abaixo do cabeçalho fixo (desktop) e
    acima do cartão do tour e da tab bar (celular). */
function tourRolar(el) {
  const topo = $(".top"), card = $("#tour");
  const sobe = topo && getComputedStyle(topo).position === "sticky" ? topo.getBoundingClientRect().height : 0;
  const desce = card.hidden ? innerHeight : card.getBoundingClientRect().top;
  const livre = Math.max(120, desce - sobe - 24);
  const r = el.getBoundingClientRect();
  const alvoTopo = scrollY + r.top;
  const y = r.height <= livre ? alvoTopo - sobe - 12 - (livre - r.height) / 2 : alvoTopo - sobe - 12;
  scrollTo({ top: Math.max(0, y), behavior: REDUCE ? "auto" : "smooth" });
}

function tourIr(n) {
  if (tourEl) tourEl.classList.remove("tour-on");
  if (n < 0 || n >= TOUR.length) return tourFim();
  tourI = n;
  const p = TOUR[n];
  if (S.aba !== p.aba) setAba(p.aba, { doTour: true, semRolar: true });
  tourEl = $(p.alvo);
  // mostra ANTES de preencher: região viva que acabou de aparecer não é anunciada
  $("#tour").hidden = false;
  $("#tour-step").textContent = `${n + 1} de ${TOUR.length}`;
  $("#tour-text").textContent = p.txt;
  $("#tour-next").textContent = n === TOUR.length - 1 ? "Concluir ✓" : "Próximo →";
  setTimeout(() => {
    if (!tourEl) return;
    tourEl.classList.add("tour-on");
    tourRolar(tourEl);
  }, 80);
  $("#tour-next").focus({ preventScroll: true });
}
function tourFim() {
  const estavaAberto = tourI >= 0;
  if (tourEl) tourEl.classList.remove("tour-on");
  tourEl = null; tourI = -1;
  $("#tour").hidden = true;
  // o foco estava num botão que acabou de sumir: devolve para quem abriu o tour
  if (estavaAberto && ($("#tour").contains(document.activeElement) || document.activeElement === document.body)) {
    const b = $("#btn-tour");
    if (b && b.offsetParent) b.focus({ preventScroll: true });
  }
}

/* ============================================================
   11. SESSÃO — entrar, criar conta, cliente, carregar dados
   ============================================================ */
function mostrarTela(t) {
  $("#boot").hidden = t !== "boot";
  $("#tela-auth").hidden = t !== "auth";
  $("#app").hidden = t !== "app";
  $(".skip").setAttribute("href", t === "auth" ? "#tela-auth" : "#main");
  $("#tela-auth").classList.toggle("auth-anim", ANIM);
  // o palco troca de cenário: login (semente 3) × painel (semente 1)
  CINE_P.then(m => { if (m) m.semente(t === "auth" ? 3 : 1); });
  if (t === "app") requestAnimationFrame(moverIndicadores);
}
function bootMsg(msg, comAcoes = false) {
  $("#boot-msg").textContent = msg;
  $("#boot-acoes").hidden = !comAcoes;
}

function authModo(modo, msg = "") {
  $("#form-entrar").hidden = modo !== "entrar";
  $("#form-criar").hidden = !(modo === "criar" || modo === "primeiro");
  $("#auth-pendente").hidden = modo !== "pendente";
  if (modo === "primeiro") S.pedirCodigo = true;
  if (modo === "criar") S.pedirCodigo = false;
  $("#cr-codigo-box").hidden = !S.pedirCodigo;
  $("#criar-h").textContent = modo === "primeiro" ? "Primeiro acesso" : "Criar conta";
  $("#criar-sub").textContent = modo === "primeiro"
    ? "A primeira conta é da Nexus e precisa do código de ativação."
    : "Depois de criada, a Nexus libera o seu acesso.";
  $("#auth-erro").textContent = msg;
  document.title = `${modo === "pendente" ? "Aguardando aprovação" : modo === "entrar" ? "Entrar" : "Criar conta"} · Nexus Ads`;
  const foco = modo === "entrar" ? $("#en-email") : modo === "pendente" ? $("#pend-h") : $("#cr-nome");
  if (foco) setTimeout(() => foco.focus(), 30);
}

async function entrar(ev) {
  ev.preventDefault();
  const email = $("#en-email").value.trim(), senha = $("#en-senha").value, btn = $("#btn-entrar");
  if (!email || !senha) return void ($("#auth-erro").textContent = "Preencha o e-mail e a senha.");
  $("#auth-erro").textContent = "";
  ocupado(btn, true);
  try {
    const r = await api.entrar(email, senha);
    api.guardarToken(r.token);
    S.token = r.token;
    $("#en-senha").value = "";
    await carregarSessao();
  } catch (err) {
    if (err.codigo === "conta_pendente") authModo("pendente");
    else $("#auth-erro").textContent = api.mensagemErro(err);
  } finally { ocupado(btn, false); }
}

async function criarConta(ev) {
  ev.preventDefault();
  const nome = $("#cr-nome").value.trim(), email = $("#cr-email").value.trim(), senha = $("#cr-senha").value;
  const codigo = S.pedirCodigo ? $("#cr-codigo").value.trim() : "";
  const erro = (msg, el) => { $("#auth-erro").textContent = msg; if (el) el.focus(); };
  if (!nome) return erro("Informe o seu nome.", $("#cr-nome"));
  if (!email) return erro("Informe o e-mail.", $("#cr-email"));
  if (senha.length < 8) return erro("A senha precisa ter pelo menos 8 caracteres.", $("#cr-senha"));
  $("#auth-erro").textContent = "";
  const btn = $("#btn-criar");
  ocupado(btn, true);
  try {
    const r = await api.criarConta({ email, senha, nome, codigo });
    if (r && r.aprovado) {
      const s = await api.entrar(email, senha);
      api.guardarToken(s.token);
      S.token = s.token;
      $("#cr-senha").value = "";
      await carregarSessao();
    } else authModo("pendente");
  } catch (err) {
    if (err.codigo === "codigo_invalido") {
      const semCodigo = !S.pedirCodigo || !codigo;
      S.pedirCodigo = true;
      $("#cr-codigo-box").hidden = false;
      erro(semCodigo ? "Esta é a primeira conta do sistema: informe o código de ativação da Nexus." : api.mensagemErro(err), $("#cr-codigo"));
    } else erro(api.mensagemErro(err));
  } finally { ocupado(btn, false); }
}

function sessaoExpirou() {
  api.apagarToken();
  S.token = null; S.conta = null;
  // a recarga agendada pelo "Fazer agora" viraria outra chamada sem token e roubaria o foco do login
  clearTimeout(S.aj.tRecarga);
  fecharGaveta(true); tourFim();
  mostrarTela("auth");
  authModo("entrar", api.MENSAGENS.sessao_invalida);
}

async function sair() {
  const t = S.token;
  api.apagarToken();
  S.token = null;
  try { if (t) await api.sair(t); } catch { /* o token já saiu do navegador */ }
  location.replace(location.pathname);
}

const ordenarClientes = l => l.slice().sort((a, b) => ((b.ativo !== false) - (a.ativo !== false)) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));

function preencherSeletor() {
  const mostra = !S.demo && S.clientes.length > 0 && (gestor() || S.clientes.length > 1);
  const html = S.clientes.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}${c.ativo === false ? " (pausado)" : ""}</option>`).join("");
  for (const [sel, box] of [["#sel-cliente", "#sel-cliente-box"], ["#sel-cliente-m", "#sel-cliente-m-box"]]) {
    $(sel).innerHTML = html;
    if (S.clienteId) $(sel).value = S.clienteId;
    $(box).hidden = !mostra;
  }
  const nome = S.demo ? S.nomeDemo : (clienteAtual() || {}).nome || (gestor() ? "Nenhum cliente ainda" : "Nenhuma clínica ligada");
  $("#side-cliente-nome").textContent = nome;
  $("#side-cliente-nome").hidden = mostra;
  $("#top-cliente").textContent = nome;
  $("#top-cliente").hidden = mostra;
}

function prepararApp() {
  const g = gestor();
  $$('[data-aba="ajustes"]').forEach(b => { b.hidden = !g; });
  $("#ribbon").hidden = !S.demo;
  $("#side-demo").hidden = !S.demo;
  $("#side-user").hidden = S.demo;
  $("#btn-sair-m").hidden = S.demo;
  if (!S.demo && S.conta) {
    $("#side-nome").textContent = S.conta.nome || S.conta.email || "";
    $("#side-papel").textContent = g ? "gestor · Nexus" : "clínica";
  }
  $("#side-cli-l").textContent = g ? "Cliente" : "Clínica";
  $("#foot-txt").innerHTML = S.demo
    ? `<b>${esc(S.nomeDemo)}</b> · painel de demonstração operado por <b>Nexus</b>`
    : `Painel operado por <b>Nexus</b> · Taubaté — SP`;
  $("#foot-link").textContent = S.demo ? "Entrar no painel →" : "Ver a demonstração";
  $("#foot-link").setAttribute("href", S.demo ? location.pathname : "?demo");
  $("#kanban-sub").textContent = (S.demo
    ? "Situação de agora. Os nomes são fictícios — toque num cartão para ver a gaveta do paciente."
    : "Situação de agora. Toque num cartão para mudar a etapa do paciente.") + (FINE ? " Arraste a ficha para outra coluna." : "");
  // demo com o nome da clínica da reunião: a faixa continua dizendo que é demonstração (e não some)
  if (S.demo && CLINICA_Q) {
    const rt = $("#ribbon-txt");
    rt.textContent = "";
    const b = document.createElement("b");
    b.textContent = `Demonstração para ${CLINICA_Q}`;
    rt.append(b, " — números ilustrativos, gerados para mostrar como o painel funciona. Nenhum dado real de paciente.");
  }
  $("#btn-link-reuniao").hidden = !S.demo;
  if (!S.demo) { const sim = $("#card-sim"); if (sim) sim.remove(); }   // o simulador só existe na demo
  preencherSeletor();
  renderSelo();
}

function atualizarTopo() {
  if (!M) { $("#top-sync").textContent = ""; renderIntegracao(); return; }
  // a hora da leitura mora na pílula ao lado (viva: "Atualizado há 12 min", "Meta desconectado"…)
  $("#top-sync").textContent = `Números até ontem, ${M.ddmm(M.R)}`;
  renderIntegracao();
}

function semCliente() {
  estadoApp("sem-cliente", gestor()
    ? { titulo: "Cadastre o primeiro cliente", texto: "Comece pelo cliente: nome, metas e valor de cada tratamento. Depois conecte o Meta e o Google e o painel se enche sozinho.",
        botoes: `<button class="pill pill-bronze" type="button" data-acao="novo-cliente">Cadastrar cliente</button>` }
    : { titulo: "Sua conta ainda não está ligada a uma clínica", texto: "A Nexus precisa marcar qual clínica você acompanha. Assim que isso acontecer, é só abrir o painel de novo.",
        botoes: `<button class="pill pill-ink" type="button" data-acao="recarregar-sessao">Já liberaram — abrir de novo</button>` });
}

async function carregarSessao() {
  mostrarTela("boot");
  bootMsg("Abrindo o painel…");
  let s;
  try { s = await api.sessao(S.token); }
  catch (e) {
    if (e.codigo !== "sessao_invalida") bootMsg(api.mensagemErro(e), true);
    return;
  }
  S.conta = s.conta || null;
  S.clientes = ordenarClientes(s.clientes || []);
  DS = null; M = null; S.dados = null; relDe = null; S.aj = novoAj(); S.kVer = {}; S.busca = "";
  const salvo = lerLocal("nx-cliente");
  const escolhido = S.clientes.find(c => c.id === salvo) || S.clientes.find(c => c.ativo !== false) || S.clientes[0];
  S.clienteId = escolhido ? escolhido.id : null;
  prepararApp();
  mostrarTela("app");
  if (S.clienteId) estadoApp("carregando"); else semCliente();
  abrirAbaInicial();
  if (S.clienteId) carregarDados({ entrada: true });
  if (gestor()) api.contasListar(S.token).then(l => { if (!S.aj.contas) { S.aj.contas = l; atualizarBadgeContas(); } }).catch(() => {});
}

let cargaN = 0;
async function carregarDados(o = {}) {
  const id = S.clienteId;
  if (!id || !S.token) return;
  const n = ++cargaN, primeira = !M;
  if (primeira) estadoApp("carregando"); else $("#main").classList.add("recarregando");
  try {
    const r = await api.dados(S.token, id, DIAS_JANELA) || {};
    if (n !== cargaN || id !== S.clienteId) return;
    S.dados = r;
    const c = clienteAtual();
    if (c && r.cliente) { c.cfg = r.cliente.cfg || c.cfg; c.nome = r.cliente.nome || c.nome; }
    montarDe(datasetDeLinhas({ metricas: r.metricas || [], leads: r.leads || [], cliente: r.cliente || c || {}, hoje: r.hoje || hojeSP(), dias: DIAS_JANELA }));
    // marca da clínica (logo e cor gravados pelo gestor em Ajustes) nos objetos do painel
    const cfgC = (r.cliente && r.cliente.cfg) || (c && c.cfg) || {};
    aplicarMarca({ cor: cfgC.corMarca, logo: cfgC.logoUrl });
    relDe = null;
    estadoApp(null);
    atualizarTopo();
    document.title = `${ABAS[S.aba][0]} · ${nomeCliente()} · Nexus Ads`;
    // Ajustes não depende dos números: redesenhar apagaria o que está sendo digitado
    if (S.aba !== "ajustes") render(primeira || o.entrada);
    atualizarBadge();
    // link direto: ?folha=AAAA-MM abre a folha; ?apresentar abre o curta (só na 1ª carga)
    if (primeira && o.entrada) pedidosDaUrl();
  } catch (e) {
    if (n !== cargaN || e.codigo === "sessao_invalida") return;
    if (primeira) {
      estadoApp("erro", { erro: true, titulo: e.codigo === "sem_acesso" ? "Sem acesso a esta clínica" : "Não deu para carregar os números",
        texto: esc(api.mensagemErro(e)), botoes: `<button class="pill pill-ink" type="button" data-acao="recarregar">Tentar de novo</button>` });
    } else toast(api.mensagemErro(e), "erro");
  } finally {
    if (n === cargaN) $("#main").classList.remove("recarregando");
  }
}

function trocarCliente(id) {
  if (!id || id === S.clienteId) return;
  S.clienteId = id;
  gravarLocal("nx-cliente", id);
  preencherSeletor();
  DS = null; M = null; S.dados = null; relDe = null;
  S.kVer = {}; S.busca = ""; $("#k-busca").value = ""; S.varridoEm = null; ULT.clear();
  clearTimeout(S.aj.tRecarga);
  S.aj.carregado = false; S.aj.novoCliente = false;
  tourFim(); fecharGaveta(true); fecharMarco(false);
  aplicarMarca({});
  estadoApp("carregando");
  atualizarTopo();
  atualizarBadge(0);
  if (S.aba === "ajustes") renderAjustes();
  carregarDados({ entrada: true });
}

function abrirAbaInicial() {
  // ?aba= tem precedência sobre o #hash (captura headless por linha de comando não leva #fragmento)
  const pedido = Q.get("aba") || location.hash.slice(1);
  setAba(ABAS[pedido] ? pedido : "geral", { semRolar: true });
}

/* ============================================================
   12. INÍCIO
   ============================================================ */
function ligarEventos() {
  /* ---------- entrar / criar conta ---------- */
  $("#form-entrar").addEventListener("submit", entrar);
  $("#form-criar").addEventListener("submit", criarConta);
  $("#ir-criar").addEventListener("click", () => authModo("criar"));
  $("#ir-primeiro").addEventListener("click", () => authModo("primeiro"));
  $("#ir-entrar").addEventListener("click", () => authModo("entrar"));
  $("#pend-voltar").addEventListener("click", () => authModo("entrar"));
  $("#boot-tentar").addEventListener("click", () => carregarSessao());
  $("#boot-sair").addEventListener("click", sair);
  $("#btn-sair").addEventListener("click", sair);
  $("#btn-sair-m").addEventListener("click", sair);

  /* ---------- navegação ---------- */
  $$("[data-aba]").forEach(b => b.addEventListener("click", () => setAba(b.dataset.aba, { corte: true })));
  ligarSeg($("#seg-periodo"), v => { S.dias = +v; textoFiltros(); render(false); });
  ligarSeg($("#seg-plat"), v => { S.plat = v; S.kVer = {}; textoFiltros(); render(false); });
  // menu: fantasma que segue o ponteiro (180 ms) atrás do indicador único
  const nav = $("#side-nav"), fant = $(".nav-fantasma", nav);
  nav.addEventListener("pointerover", e => {
    const b = e.target.closest(".nav-b");
    if (!b || !FINE || !ANIM) return;
    fant.style.setProperty("--y", b.offsetTop + "px"); fant.style.height = b.offsetHeight + "px"; fant.classList.add("on");
  });
  nav.addEventListener("pointerleave", () => fant.classList.remove("on"));
  // celular: faixa da demo vira chip; filtros numa folha inferior
  $("#ribbon-chip").addEventListener("click", () => {
    const r = $("#ribbon"), on = !r.classList.contains("aberto");
    r.classList.toggle("aberto", on); $("#ribbon-chip").setAttribute("aria-expanded", String(on));
  });
  document.addEventListener("pointerdown", e => {
    const r = $("#ribbon");
    if (r.classList.contains("aberto") && !r.contains(e.target)) { r.classList.remove("aberto"); $("#ribbon-chip").setAttribute("aria-expanded", "false"); }
  });
  $("#btn-filtros-m").addEventListener("click", () => abrirFolha(!$("#top-tools").classList.contains("aberta")));
  $("#filtros-fundo").addEventListener("click", () => abrirFolha(false));
  $("#top-tools").addEventListener("keydown", e => { if (e.key === "Escape" && $("#top-tools").classList.contains("aberta")) { e.stopPropagation(); abrirFolha(false); } });
  arrastavel($("#top-tools"), { eixo: "y", var: "--fy", alca: ".folha-alca, .top-tools-h", ativo: () => $("#top-tools").classList.contains("aberta"), fechar: () => abrirFolha(false) });
  $("#btn-comparar").addEventListener("click", () => {
    S.comparar = !S.comparar;
    $("#btn-comparar").setAttribute("aria-pressed", String(S.comparar));
    if (S.aba === "geral" && M) render(false);
  });
  // o dia lido no gráfico ganha um ponto nas 6 sparklines da régua (os números da régua não mudam)
  document.addEventListener("nx:dia", e => {
    const i = e.detail ? e.detail.i : null;
    $$("#kpis .spark-box").forEach(s => {
      const de = +s.dataset.de, ys = (s.dataset.ys || "").split(","), n = ys.length, k = i == null ? -1 : i - de;
      if (k < 0 || k >= n) { s.classList.remove("com-dia"); return; }
      s.style.setProperty("--x", (k / Math.max(1, n - 1) * 100).toFixed(2) + "%");
      s.style.setProperty("--y", (+ys[k] / 36 * 38).toFixed(1) + "px");
      s.classList.add("com-dia");
    });
  });
  $("#sel-cliente").addEventListener("change", e => trocarCliente(e.target.value));
  $("#sel-cliente-m").addEventListener("change", e => trocarCliente(e.target.value));
  // botões dos estados vazios e atalhos entre abas
  $("#main").addEventListener("click", e => {
    const ir = e.target.closest("[data-ir]");
    if (ir) return setAba(ir.dataset.ir, { corte: true });
    const ds = e.target.closest("[data-desde]");
    if (ds) return desdeAcao(ds.dataset.desde);
    const ac = e.target.closest("[data-acao]");
    if (!ac) return;
    if (ac.dataset.acao === "recarregar") { M = null; carregarDados({ entrada: true }); }
    else if (ac.dataset.acao === "recarregar-sessao") carregarSessao();
    else if (ac.dataset.acao === "novo-cliente") { S.aj.novoCliente = true; setAba("ajustes"); }
  });
  ligarChart();

  /* ---------- campanhas ---------- */
  $("#tbl-campanhas").addEventListener("click", e => {
    const b = e.target.closest("[data-sort]");
    if (!b) return;
    const k = b.dataset.sort;
    S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : (k === "nome" ? 1 : -1) };
    renderCampanhas();
    const nb = $(`#tbl-campanhas [data-sort="${k}"]`);
    if (nb) nb.focus();
  });

  /* ---------- pacientes ---------- */
  $("#kanban").addEventListener("click", e => {
    const mais = e.target.closest("[data-kmais]");
    if (mais) {
      const k = mais.dataset.kmais, antes = S.kVer[k] || K_MAX;
      S.kVer[k] = antes + K_PASSO;
      renderKanban();
      // o foco vai para o primeiro cartão que acabou de aparecer
      const col = $$("#kanban .kcol")[COLS_K.findIndex(c => c[0] === k)];
      const prox = col && $$(".lead", col)[antes];
      if (prox) prox.focus();
      return;
    }
    const b = e.target.closest("[data-lead]");
    if (!b) return;
    const L = M.LEADS.find(x => String(x.id) === b.dataset.lead);
    if (L) abrirGaveta(L);
  });
  let buscaT;
  $("#k-busca").addEventListener("input", e => {
    clearTimeout(buscaT);
    buscaT = setTimeout(() => { S.busca = e.target.value; S.kVer = {}; if (M) renderKanban(); }, 140);
  });
  $("#btn-novo-lead").addEventListener("click", () => abrirGaveta(null));

  /* ---------- gaveta ---------- */
  // etapas: contas num fio; os radios continuam por baixo (setas do teclado, leitor de tela)
  $("#lf-etapas-op").innerHTML = `<span class="etapa-ind" aria-hidden="true"></span>` + ETAPAS.map(([v, l, c]) =>
    `<label class="etapa-op"><input type="radio" name="lf-etapa" value="${v}"><span class="bead" style="--c:${c}" aria-hidden="true"></span><span class="rot">${l}</span></label>`).join("");
  $("#lf-etapas-op").addEventListener("change", gvAtualizar);
  $("#lf-servico").addEventListener("change", gvAtualizar);
  $("#form-lead").addEventListener("submit", salvarLead);
  $("#gv-fechar").addEventListener("click", () => fecharGaveta());
  $("#gv-cancelar").addEventListener("click", () => fecharGaveta());
  $("#gaveta-fundo").addEventListener("click", () => fecharGaveta());
  $("#gaveta").addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); fecharGaveta(); } });
  // arrastar a gaveta para a direita (> 80 px ou > .5 px/ms) fecha; senão volta com mola
  arrastavel($("#gaveta"), { eixo: "x", var: "--gx", alca: "#gv-alca", ativo: () => !$("#gaveta").hidden, fechar: () => fecharGaveta() });

  /* ---------- radar ---------- */
  $("#alerts").addEventListener("pointerover", e => { const li = e.target.closest("li[data-chave]"); if (radarCtl) radarCtl.realcar(li ? li.dataset.chave : null); });
  $("#alerts").addEventListener("pointerleave", () => { if (radarCtl) radarCtl.realcar(null); });
  $("#rules").addEventListener("click", e => {
    const b = e.target.closest("[data-regra]");
    if (!b) return;
    if (b.getAttribute("aria-disabled") === "true") return toast("Só a equipe da Nexus liga ou desliga regras.");
    alternarRegra(b.dataset.regra);
  });
  let metaT;
  const aoMeta = () => {
    if (!S.demo || !DS) return;
    DS.CFG.cpaAlvo = +$("#in-cpa").value; DS.CFG.orcamento = +$("#in-orc").value;
    $("#out-cpa").textContent = brl(DS.CFG.cpaAlvo); $("#out-orc").textContent = brl0(DS.CFG.orcamento);
    clearTimeout(metaT);
    metaT = setTimeout(() => {
      M = montar(DS);
      const foco = document.activeElement;
      renderRadar();
      atualizarBadge();
      if (foco && foco.id) { const f = document.getElementById(foco.id); if (f) f.focus(); }
    }, 120);
  };
  $("#in-cpa").addEventListener("input", aoMeta);
  $("#in-orc").addEventListener("input", aoMeta);
  $("#btn-varrer").addEventListener("click", async () => {
    const scope = $("#scope"), btn = $("#btn-varrer");
    btn.disabled = true;
    scope.classList.add("scanning");
    if (radarCtl) radarCtl.varrer();
    if (ANIM) {
      const wa = $("#wa-alerta");
      wa.insertAdjacentHTML("beforeend", `<div class="typing" role="img" aria-label="digitando"><i></i><i></i><i></i></div>`);
      wa.scrollTop = wa.scrollHeight;
    }
    $("#scope-status").textContent = `Varrendo ${plural(campanhasTodas(), "campanha", "campanhas")} e ${plural(Object.values(M.CRI).filter(k => k.plat).length, "criativo", "criativos")}…`;
    const t0 = Date.now();
    if (!S.demo) await carregarDados({ entrada: false });
    setTimeout(() => {
      scope.classList.remove("scanning");
      const d = new Date();
      S.varridoEm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
      btn.disabled = false;
      radarChega = true;
      if (S.aba === "radar" && M) renderRadar();
      radarChega = false;
    }, Math.max(0, (REDUCE ? 0 : 1500) - (Date.now() - t0)));
  });

  /* ---------- relatórios ---------- */
  $("#sel-dia").addEventListener("change", renderRelatorios);
  $("#sel-mes").addEventListener("change", renderRelatorios);
  $$("[data-copiar]").forEach(b => b.addEventListener("click", () => {
    const el = $("#ph-" + b.dataset.copiar);
    if (el._texto) copiar(el._texto, b);
  }));
  $("#rel-lista").addEventListener("click", e => {
    const b = e.target.closest("[data-ver-rel]");
    if (b) verRelatorio(b.dataset.verRel);
  });
  // cada envio abre a linha do tempo (gerado → enviado → entregue)
  const alternarEnv = e => {
    const b = e.target.closest(".env-alt");
    if (!b) return;
    const on = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", String(on));
    b.closest(".env-item").classList.toggle("aberto", on);
  };
  $("#rel-lista").addEventListener("click", alternarEnv);
  $("#avisos-log").addEventListener("click", alternarEnv);

  /* ---------- ajustes ---------- */
  $("#btn-novo-cliente").addEventListener("click", () => { S.aj.novoCliente = true; renderFormCliente(); renderFormMarca(); renderIntegracoes(); $("#cl-nome").focus(); });
  const fc = $("#form-cliente");
  fc.addEventListener("submit", salvarCliente);
  fc.addEventListener("click", e => {
    const t = e.target;
    const sw = t.closest(".sw");
    if (sw) return sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true"));
    if (t.closest("[data-tk-x]")) {
      const row = t.closest(".tk-row"), prox = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      const f = prox ? $("[data-tk-s]", prox) : $("#cl-tk-add");
      if (f) f.focus();
      return;
    }
    if (t.closest("#cl-tk-add")) {
      $("#cl-tickets").insertAdjacentHTML("beforeend", linhaTicket());
      const ult = $$("#cl-tickets [data-tk-s]").pop();
      if (ult) ult.focus();
      return;
    }
    if (t.closest("#cl-cancelar")) { S.aj.novoCliente = false; renderFormCliente(); renderFormMarca(); renderIntegracoes(); $("#btn-novo-cliente").focus(); }
  });
  fc.addEventListener("input", e => {
    // identificador acompanha o nome enquanto ninguém mexeu nele
    if (e.target.id === "cl-nome" && (S.aj.novoCliente || !clienteAtual())) {
      const s = $("#cl-slug");
      if (s && (!s.value || s.dataset.auto === "1")) { s.value = slugDe(e.target.value); s.dataset.auto = "1"; }
    }
    if (e.target.id === "cl-slug") e.target.dataset.auto = "";
  });
  const fm = $("#form-marca");
  fm.addEventListener("submit", salvarMarca);
  fm.addEventListener("change", e => { if (e.target.id === "mk-arquivo") logoEscolhido(e.target); });
  fm.addEventListener("input", e => {
    if (e.target.id === "mk-cor") corMarcaNova(e.target.value);
    if (e.target.id === "mk-hex") { const v = e.target.value.trim(), h = v.startsWith("#") ? v : "#" + v; if (hexValido(h)) corMarcaNova(h); }
  });
  fm.addEventListener("click", e => {
    const s = e.target.closest("[data-sug]");
    if (s) return corMarcaNova(s.dataset.sug);
    if (e.target.closest("#mk-tirar") && S.aj.marca) { S.aj.marca.logo = null; previaMarca(); $("#mk-arquivo").focus(); }
  });
  const ig = $("#aj-integracoes");
  ig.addEventListener("submit", e => { e.preventDefault(); salvarIntegracao(e.target); });
  ig.addEventListener("click", e => {
    const sw = e.target.closest("[data-ig-ativo]");
    if (sw) sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true"));
  });
  $$("[data-exec]").forEach(b => b.addEventListener("click", () => executarTarefa(b.dataset.exec, b)));
  const ct = $("#aj-contas");
  ct.addEventListener("click", e => {
    const li = e.target.closest("[data-conta]");
    if (!li) return;
    const sw = e.target.closest("[data-ct-aprov]");
    if (sw) return sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true"));
    const b = e.target.closest("[data-ct-salvar], [data-ct-aprovar]");
    if (b) salvarConta(li, b.hasAttribute("data-ct-aprovar"), b);
  });
  ct.addEventListener("change", e => {
    const sel = e.target.closest("[data-ct-papel]");
    if (sel) $("[data-ct-clis]", sel.closest("[data-conta]")).hidden = sel.value === "gestor";
  });
  $("#form-config").addEventListener("submit", salvarConfig);
  $$("[data-copiar-el]").forEach(b => b.addEventListener("click", () => {
    const t = $("#" + b.dataset.copiarEl).textContent.trim();
    if (t && t !== "—") copiar(t, b);
  }));

  /* ---------- recursos: apresentar, folha do mês, conexão, marcos, atalhos ---------- */
  $("#btn-apresentar").addEventListener("click", () => { abrirFolha(false); apresentar({ gesto: true }); });
  $("#btn-folha").addEventListener("click", () => abrirFolhaMes($("#sel-mes").value));
  $("#btn-link-reuniao").addEventListener("click", e => copiar(linkReuniao(), e.currentTarget));
  $("#sync-pill").addEventListener("click", () => abrirSyncPop($("#sync-pop").hidden));
  $(".sync-box").addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sync-pop").hidden) { e.stopPropagation(); abrirSyncPop(false); } });
  document.addEventListener("pointerdown", e => { if (!$("#sync-pop").hidden && !e.target.closest(".sync-box")) abrirSyncPop(false); });
  $("#marco-form").addEventListener("submit", e => { e.preventDefault(); salvarMarco(false); });
  $("#marco-form").addEventListener("click", e => {
    const b = e.target.closest("[data-marco]");
    if (!b) return;
    if (b.dataset.marco === "remover") salvarMarco(true); else fecharMarco(true);
  });
  // atalhos: Ctrl/⌘+K abre a busca; P apresenta; 1/2/3 = 7/30/60 dias — nunca dentro de um campo de texto
  addEventListener("keydown", e => {
    const t = e.target, emCampo = !!(t && t.closest && t.closest("input, select, textarea, [contenteditable]"));
    const k = e.key, app = !$("#app").hidden && !!M && !S.estado;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (k === "k" || k === "K")) {
      if (!app || modalAberto()) return;
      e.preventDefault(); abrirPaleta(); return;
    }
    if (emCampo || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || !app || modalAberto()) return;
    if (k === "p" || k === "P") { e.preventDefault(); tourFim(); apresentar({ gesto: true }); }
    else if (k === "1" || k === "2" || k === "3") {
      const b = $(`#seg-periodo [data-v="${{ 1: 7, 2: 30, 3: 60 }[k]}"]`);
      if (b && !$("#filters").hidden) { e.preventDefault(); b.click(); }
    }
  });

  /* ---------- tour ---------- */
  $("#btn-tour").addEventListener("click", () => { abrirFolha(false); tourIr(0); });
  $("#tour-next").addEventListener("click", () => tourIr(tourI + 1));
  $("#tour-sair").addEventListener("click", tourFim);
  addEventListener("keydown", e => {
    if (tourI < 0) return;
    if (e.key === "Escape") return tourFim();
    // setas são do controle que estiver focado (slider, filtro, select) — não do tour
    const t = e.target;
    if (e.defaultPrevented || (t && t.closest && t.closest("input, select, textarea, [role='radio'], [role='switch']"))) return;
    if (e.key === "ArrowRight") tourIr(tourI + 1);
    if (e.key === "ArrowLeft" && tourI > 0) tourIr(tourI - 1);
  });

  /* ---------- topo, gráfico, herói ---------- */
  const top = $(".top");
  addEventListener("scroll", () => top.classList.toggle("stuck", scrollY > 8), { passive: true });
  const chartEl = $("#chart-dia");
  if ("ResizeObserver" in window) {
    let rzc;
    new ResizeObserver(() => {
      const w = chartEl.clientWidth;
      if (!w || S.aba !== "geral" || !M || (w === chartEl._w && !chartEl._pendente)) return;
      clearTimeout(rzc);
      rzc = setTimeout(() => desenharChart(null), 120);
    }).observe(chartEl);
  }
  let rz;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { posicionarSegs(); moverIndicadores(); }, 180); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { posicionarSegs(); moverIndicadores(); });
  // a conta de luz do fio só corre com o herói em quadro
  if ("IntersectionObserver" in window) new IntersectionObserver(en => $(".card-hero").classList.toggle("em-quadro", en[en.length - 1].isIntersecting)).observe($(".card-hero"));
}

/** Arrastar para fechar (gaveta → direita, folha de filtros → baixo): passou de 80 px ou
    de .5 px/ms, fecha; senão volta com mola. O teclado nunca depende disto (Esc fecha). */
function arrastavel(el, o) {
  const alca = o.alca ? $$(o.alca, el) : [el];
  let a = null;
  const pos = e => (o.eixo === "x" ? e.clientX : e.clientY);
  alca.forEach(h => {
    h.addEventListener("pointerdown", e => {
      if (!o.ativo() || e.button > 0 || e.target.closest("button:not(.folha-alca), input, select, textarea, a")) return;
      a = { p0: pos(e), p: pos(e), t: performance.now(), v: 0 };
      try { h.setPointerCapture(e.pointerId); } catch { /* ok */ }
      el.classList.add("arrastando"); el.classList.remove("volta");
    });
    h.addEventListener("pointermove", e => {
      if (!a) return;
      const agora = performance.now(), d = Math.max(0, pos(e) - a.p0);
      a.v = (pos(e) - a.p) / Math.max(1, agora - a.t); a.p = pos(e); a.t = agora;
      el.style.setProperty(o.var, d + "px");
    });
    const soltar = () => {
      if (!a) return;
      const d = Math.max(0, a.p - a.p0), v = a.v;
      a = null;
      el.classList.remove("arrastando");
      if (d > 80 || v > .5) o.fechar();
      else { el.classList.add("volta"); el.style.setProperty(o.var, "0px"); }
    };
    h.addEventListener("pointerup", soltar);
    h.addEventListener("pointercancel", soltar);
  });
}
const campanhasTodas = () => Object.values(M.CAMP).filter(c => c.plat).length;

let pedidosFeitos = false;
function pedidosDaUrl() {
  if (pedidosFeitos) return;
  pedidosFeitos = true;
  if (Q.get("folha")) abrirFolhaMes(Q.get("folha"));
  else if (Q.has("apresentar")) {
    const n = parseInt(Q.get("cena"), 10);
    // ?cena=N abre direto na cena; sem ela, o cartão-título "Começar ▶" (a tela cheia precisa de um gesto)
    apresentar({ cena: Number.isFinite(n) ? n : 1, titulo: !Q.has("cena"), gesto: false });
  }
}

async function iniciar() {
  ligarEventos();
  api.aoSessaoInvalida(sessaoExpirou);
  if (S.demo && CLINICA_Q) bootMsg(`Abrindo o painel da ${CLINICA_Q}…`);
  // a câmera precisa estar pronta antes do 1º quadro (senão o conteúdo piscaria); teto de 900 ms.
  // A folha pedida pela URL não espera (imprimir/PDF logo na abertura).
  const ate = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  const soFolha = !!Q.get("folha");
  const fx = await ate(FX_P, soFolha ? 40 : 900);
  if (fx) { fx.ligar({ anim: ANIM }); FX = fx; }
  if (!CINE) CINE = await ate(CINE_P, soFolha ? 20 : 300);
  // vinheta (1ª abertura da sessão): as entradas em cena esperam o monograma sair; os dados, não
  const vin = CINE && !soFolha && !Q.has("apresentar") ? CINE.vinheta() : null;
  if (vin && FX) FX.segurar(vin);
  if (S.demo) {
    // gerarDemo recebe SÓ o nome (nunca cfg): os números da demo não mudam com a clínica
    montarDe(gerarDemo({ nome: S.nomeDemo }));
    S.dados = exemploDemo();
    aplicarMarca({ cor: COR_Q });
    prepararApp();
    mostrarTela("app");
    atualizarTopo();
    abrirAbaInicial();
    atualizarBadge();
    pedidosDaUrl();
    return;
  }
  S.token = api.lerToken();
  if (!S.token) { mostrarTela("auth"); authModo("entrar"); return; }
  carregarSessao();
}

iniciar();
