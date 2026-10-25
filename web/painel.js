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
// plano 1500c · AC-225: DIAS_MIN_PROJECAO (o «cedo para projetar» do Órbita e do WhatsApp) vem do núcleo
import {
  datasetDeLinhas, montar, hojeSP, meioDia, isoDe, fin, brl, brl0, int, pc, dec, esc, waHtml, fmtN,
  razao, variacao, plural, pluralDec, nomePlat, CFG_PADRAO, cfgCom, MESES, MES3, SEMANA,
  DIAS_MIN_PROJECAO,
} from "./nucleo.js";
import { gerarDemo } from "./demo.js";
import * as api from "./dados.js";

/* ============================================================
   0. UTILIDADES
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const Q = new URLSearchParams(location.search);
function lerLocalCedo(k) { try { return localStorage.getItem(k); } catch { return null; } }
const DEMO = Q.has("demo");
// ?noanim: tudo estático (capturas de tela e testes)
const NOANIM = Q.has("noanim");
if (NOANIM) document.documentElement.classList.add("noanim");
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches || NOANIM;
const ANIM = !REDUCE;          // a flag única do movimento
const FINE = matchMedia("(pointer: fine)").matches;
const DIAS_JANELA = 130;
const OCULTAR_NOMES = Q.has("apresentar") || lerLocalCedo("nx-ocultar-nomes") === "1";
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
const CINE_P = import("./cinema.js?v=4").then(m => { m.ligar({ anim: ANIM, semente: DEMO ? 1 : 3 }); return m; }).catch(() => null);
CINE_P.then(m => { CINE = m; if (m && S.aba === "radar" && M) renderRadar(); });
/* recursos em módulos (import() dinâmico com catch): só baixam quando alguém pede */
const MODS = {};
const MOD_SRC = {
  curta: () => import("./curta.js?v=2"),
  folha: () => import("./folha.js?v=2"),
  paleta: () => import("./paleta.js?v=2"),
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
/** plano 1000b · AB-080: os erros que a Meta devolve em inglês viram português claro (a MESMA tabela do rel-logica.erroEnvioPt);
    o texto original fica em `erroOriginal` (vai no title). Erro sem padrão conhecido passa como veio. */
const ERROS_ENVIO_PT = [
  [/131047|re-?engagement/i, "fora da janela de 24 h: só um modelo aprovado pela Meta pode abrir a conversa"],
  [/131026|undeliverable|not a valid whatsapp user/i, "o número não recebeu a mensagem (pode não ter WhatsApp ou estar com o app desatualizado)"],
  [/131030|not in (the )?allowed list/i, "o número não está na lista de destinos permitidos do número de teste"],
  [/131056|pair rate limit/i, "muitas mensagens seguidas para o mesmo número: tente de novo em alguns minutos"],
  [/130429|131048|rate limit|spam rate/i, "limite de envio da Meta atingido: tente de novo mais tarde"],
  [/132000|132001|template.*(does not exist|not exist|translation)/i, "o modelo de mensagem não existe ou não foi aprovado neste idioma"],
  [/access token|oauth|session has expired/i, "o acesso do número ao WhatsApp expirou: conecte o número de novo"],
  [/131031|account.*(locked|restricted)/i, "a conta do WhatsApp está bloqueada ou restrita pela Meta"],
  [/timed? ?out|ETIMEDOUT/i, "o WhatsApp demorou demais para responder"],
];
function erroEnvioPt(erro) {
  const s = String(erro || "");
  if (!s) return "";
  const achou = ERROS_ENVIO_PT.find(([re]) => re.test(s));
  return achou ? achou[1] : s;
}
/** plano 1000b · AB-199: com `agora`, o «enviado» sem confirmação há mais de 24 h vira «enviado · sem confirmação de entrega»
    (antes um diário de 10 dias atrás dizia «entrega ainda não confirmada» para sempre). Sem `agora`, o texto de sempre. */
const SEM_CONFIRMACAO_MS = 24 * 36e5;
function statusEnvio(x, agora = null) {
  if (!x) return null;
  const erro = String(x.erro || x.erro_envio || "");
  const naoChegou = /não entregou/i.test(erro);
  // plano 1000 (AD-032): saiu para um número e falhou para outro — «parcial», nunca ✓ limpo (a mesma regra de rel-logica.statusEnvio)
  if ((x.enviado_em || x.entregue_em) && erro && !naoChegou) {
    const total = Array.isArray(x.destinos) ? x.destinos.length : 0, falhas = erro.split("; ").filter(t => /^[^:\s]+: /.test(t)).length;
    const ok = total && falhas && falhas < total ? total - falhas : 0, q = x.entregue_em || x.enviado_em;
    return { k: "parcial", tique: "✓!", rotulo: ok ? `enviado a ${ok} de ${total} às ${horaSP(q)}` : `enviado em parte às ${horaSP(q)}`, hora: horaSP(q), quando: quandoSP(q), erro: erroEnvioPt(erro).slice(0, 160), erroOriginal: erro.slice(0, 300) };   // plano 1000b · AB-080
  }
  if (x.entregue_em) return { k: "entregue", tique: "✓✓", rotulo: `entregue às ${horaSP(x.entregue_em)}`, hora: horaSP(x.entregue_em), quando: quandoSP(x.entregue_em) };
  if (x.enviado_em && !naoChegou) {
    const velho = agora != null && Number.isFinite(+agora) && +agora - Date.parse(x.enviado_em) > SEM_CONFIRMACAO_MS;   // plano 1000b · AB-199
    return { k: "enviado", tique: "✓", rotulo: velho ? "enviado · sem confirmação de entrega" : `enviado às ${horaSP(x.enviado_em)} · entrega ainda não confirmada`, hora: horaSP(x.enviado_em), quando: quandoSP(x.enviado_em) };
  }
  if (erro) return { k: "erro", tique: "!", rotulo: naoChegou ? "não entregue" : "não enviado", hora: x.enviado_em ? horaSP(x.enviado_em) : null, erro: erroEnvioPt(erro).slice(0, 160), erroOriginal: erro.slice(0, 300) };   // plano 1000b · AB-080
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
/** plano 1000b · AB-081: a CHAVE decide primeiro («integracao|google»); a mensagem só quando a chave não diz — e nela «Google» vence
    «meta», que também é palavra comum («a meta de custo» numa mensagem do Google ia para o Meta). Igual ao rel-logica.canalDe. */
function canalDe(a) {
  const k = String((a && a.chave) || "").toLowerCase(), m = String((a && a.mensagem) || "").toLowerCase();
  if (/\|meta\b|\bmeta\b/.test(k)) return "meta";
  if (/\|google\b|\bgoogle\b/.test(k)) return "google";
  return /\bgoogle\b/.test(m) ? "google" : /\bmeta\b/.test(m) ? "meta" : null;
}
/** plano 1000b · AB-076: a última leitura dos anúncios pelo MAIOR instante (antes .sort() no texto: «…Z» × «…-03:00» saía fora de ordem). */
function ultimaLeitura(integracoes = []) {
  let melhor = null, t0 = -Infinity;
  for (const i of integracoes || []) { const t = Date.parse(i && i.ultimo_sync); if (Number.isFinite(t) && t > t0) { t0 = t; melhor = i.ultimo_sync; } }
  return melhor;
}
/** plano 1000b · AB-142: «A Nexus já foi avisada» só quando um aviso de conexão desta plataforma SAIU (enviado_em) nas últimas 24 h
    (a mesma regra do anuncios.equipeAvisada do Órbita). */
function equipeAvisada(alertas = [], erros = [], agora = Date.now()) {
  const canais = new Set((erros || []).map(e => e && e.canal));
  return (alertas || []).some(a => a && a.regra === "integracao" && (a.enviado_em || a.entregue_em) && agora - Date.parse(a.criado_em) <= 24 * 36e5
    && canais.has(canalDe(a)));
}
function nomeRegraSrv(a, regras = []) {
  if (a.regra === "integracao") { const c = canalDe(a); return c ? `Conexão com ${c === "meta" ? "Meta" : "Google"}` : "Conexão com os anúncios"; }
  const r = regras.find(x => x.id === a.regra);
  return r ? r.nome : a.regra === "ritmo" ? "Ritmo do orçamento" : "Aviso do radar";
}
/** Estado das leituras: erro (status "erro…" ou aviso de conexão das últimas 24 h sem leitura boa depois),
    atrasado (última leitura há mais de 2 h), parcial (a leitura rodou mas pode estar incompleta — plano 1000, AD-208,
    igual ao rel-logica.estadoIntegracao), aguardando (nunca leu) ou ok. */
function estadoIntegracao(integs = [], alertas = [], agora = Date.now()) {
  const H = 36e5, ORD_E = { erro: 4, atrasado: 3, parcial: 2, aguardando: 1, ok: 0 };
  const canais = (integs || []).filter(i => i && i.ativo).map(i => {
    const sync = i.ultimo_sync ? Date.parse(i.ultimo_sync) : NaN;
    const al = (alertas || []).filter(a => a && a.regra === "integracao" && canalDe(a) === i.canal && agora - Date.parse(a.criado_em) <= 24 * H)
      .sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)))[0] || null;
    const statusErro = /^erro/i.test(i.status || "");
    const alAtivo = !!al && (statusErro || !(Number.isFinite(sync) && sync > Date.parse(al.criado_em)));
    // plano 1000 (AD-138/SV-195): leitura PARCIAL não avança ultimo_sync — fica em ultimo_sync_parcial (servidor novo, por detecção).
    // Parcial mais nova que a última completa e recente (≤ 2 h) é «parcial», não «atrasado» nem «aguardando»
    const parc = i.ultimo_sync_parcial ? Date.parse(i.ultimo_sync_parcial) : NaN;
    const parcRecente = Number.isFinite(parc) && !(parc <= sync) && agora - parc <= 2 * H;
    const estado = statusErro || alAtivo ? "erro" : parcRecente ? "parcial" : !Number.isFinite(sync) ? "aguardando" : agora - sync > 2 * H ? "atrasado" : /^parcial/i.test(i.status || "") ? "parcial" : "ok";
    return { canal: i.canal, estado, sync: Number.isFinite(sync) ? sync : null, parcial: Number.isFinite(parc) ? parc : null, status: i.status || "", alerta: alAtivo ? al : null };
  });
  const nivel = canais.reduce((n, c) => (ORD_E[c.estado] > ORD_E[n] ? c.estado : n), canais.length ? "ok" : "nenhuma");
  const syncs = canais.map(c => c.sync).filter(Boolean);
  return { nivel, canais, erros: canais.filter(c => c.estado === "erro"), ultimo: syncs.length ? Math.max(...syncs) : null };
}
/** Quando vem a próxima leitura: o ciclo roda de hora em hora, então ~1 h depois da ÚLTIMA leitura
    (e não na "hora cheia", que erraria por até 59 min conforme o minuto em que o ciclo roda). */
const ATRASO_LEITURA_MS = 2 * 36e5;   // plano 1000b · AB-155: a mesma régua do «atrasado» do estadoIntegracao
function proximaLeitura(ultimo, agora = Date.now()) {
  if (!ultimo) return "em até 1 h";
  // plano 1000b · AB-155: passou de 2 h sem leitura não é «em instantes» — diz desde quando está atrasada
  if (agora - ultimo > ATRASO_LEITURA_MS) {
    const iso = new Date(ultimo).toISOString();
    const desde = agora - ultimo < 20 * 36e5 ? horaSP(iso) : String(quandoSP(iso)).replace(/^em /, "");
    return `leitura atrasada desde ${desde} — tenta de novo a cada hora`;
  }
  const falta = Math.ceil((ultimo + 36e5 - agora) / 6e4);
  return falta >= 1 && falta <= 60 ? `em ~${falta} min` : "em instantes";
}
/** plano 1000b · AB-225: o orçamento diário que fecha o mês no orçamento — (orçamento − gasto) ÷ dias que restam (igual ao
    anuncios.diarioSugerido do Órbita). null sem dias ou sem orçamento; 0 quando o orçamento já foi todo usado. */
function diarioSugerido(orc, gasto, restam) {
  if (!(+restam > 0) || !(+orc > 0)) return null;
  const saldo = +orc - (+gasto || 0);
  return saldo > 0 ? saldo / +restam : 0;
}
/** plano 1000b · AB-053/AB-143: «Mostrando os 12 relatórios mais recentes de 20.» — "" quando nada ficou de fora (rel-logica.notaCorte). */
function notaCorte(mostrados, total, { um = "relatório", varios = "relatórios" } = {}) {
  const m = +mostrados || 0, t = +total || 0;
  if (!(t > m)) return "";
  return `Mostrando ${m === 1 ? `o ${um} mais recente` : `os ${m} ${varios} mais recentes`} de ${t.toLocaleString("pt-BR")}.`;
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
  r5: ["Investimento parou de repente", "Os anúncios pararam de gastar"],
  r6: ["CRM parou de receber as conversas do Meta", "Conversas do anúncio não estão chegando"],
  ritmo: ["Ritmo do orçamento", "Orçamento do mês"],
};
/** Uma linha leiga por regra, acima da mensagem do núcleo (que não muda). */
const LEIGO_LINHA = {
  r1: "Cada conversa está saindo mais cara do que o combinado.",
  r2: "O anúncio gastou e ninguém chamou no WhatsApp.",
  r3: "Muita gente vê o anúncio, quase ninguém toca.",
  r4: "As mesmas pessoas já viram este anúncio muitas vezes.",
  r5: "Os anúncios pararam de gastar de um dia para o outro (cartão, saldo ou anúncio reprovado?).",
  r6: "O Meta conta conversas que não estão chegando ao painel.",
  ritmo: "No ritmo de agora, o mês passa do orçamento.",
  integracao: "O painel parou de receber os números dessa plataforma.",
};
/** Topo do eixo do gráfico diário: ~8% acima da maior barra, em 4 degraus de valor inteiro
    (R$ 15/30/45/60, nunca R$ 6/13/19) — sem o terço de altura morta de um eixo só em 1/2/2,5/5
    (barras até R$ 55 num eixo de R$ 80). */
const eixoTopo = (v, n = 4) => {
  if (!(v > 0)) return n;
  const bruto = v * 1.08 / n, p = Math.pow(10, Math.floor(Math.log10(bruto))), r = bruto / p;
  // degraus que dão rótulo inteiro (R$ 16/32/48/64, R$ 35/70/105…), apertados o bastante para sobrar pouco no topo
  const degraus = p >= 10 ? [1, 1.2, 1.5, 1.6, 1.8, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 10];
  return degraus.find(x => x >= r - 1e-9) * p * n;
};
/** "Não seguiu" tem três motivos, mas só os que cabem na etapa de onde a ficha saiu: quem nunca
    agendou não "faltou" (isso inventaria uma consulta), e quem avaliou não "deixou de agendar". */
const MOTIVOS_PAROU = { faltou: "Faltou à consulta", nao_fechou: "Avaliou e não fechou", perdida: "Não agendou" };
const PAROU_DE = { nova: ["perdida"], agendada: ["faltou", "perdida"], orcamento: ["nao_fechou"], fechou: ["nao_fechou"] };

/* Órbita (o app novo): para onde o clássico manda quem está fora do plano, com teste vencido ou sem permissão.
   É o mesmo endereço do redirecionador que o GitHub Pages serve em /app/. */
const ORBITA_URL = "https://orbita-nexus-ads.netlify.app/app/";
/** Estados de tela por código do Órbita (nx_ctx/nx_exigir_modulo): o que aconteceu e para onde ir — em vez do código cru. */
const ESTADOS_ORBITA = {
  modulo_desligado: { titulo: "Os anúncios não fazem parte do seu plano", texto: "Esta empresa não tem o módulo de anúncios ligado. Conversas, agenda e CRM continuam no Órbita; para ligar os anúncios, fale com a Nexus.", orbita: true, erro: false },
  teste_expirado: { titulo: "O período de teste terminou", texto: "Para continuar acompanhando os anúncios, fale com a Nexus. O Órbita segue aberto só para leitura.", orbita: true, erro: false },
  conta_suspensa: { titulo: "Acesso suspenso", texto: "O acesso desta empresa está suspenso. Fale com a Nexus para reativar.", orbita: false, erro: true },
  cliente_pausado: { titulo: "Cliente pausado", texto: "A Nexus pausou este cliente: o servidor não lê os anúncios nem envia relatórios até reativar.", orbita: false, erro: false },
  sem_permissao: { titulo: "Seu acesso não permite ver os anúncios", texto: "Peça ao administrador da empresa para liberar o módulo de anúncios para a sua conta.", orbita: true, erro: false },
  sem_acesso: { titulo: "Sem acesso a esta clínica", texto: "", orbita: false, erro: true },
};
function estadoDeErro(codigo, mensagem = "") {
  const e = ESTADOS_ORBITA[codigo];
  return e ? { ...e, texto: e.texto || mensagem, codigo } : { titulo: "Não deu para carregar os números", texto: mensagem, orbita: false, erro: true, codigo };
}
/** nx_config.saas_url: https completo, sem ?parâmetro nem #rota, terminando em "/" (o banco concatena "#/convite/…" direto;
    só o host vira "https://host/app/"). Vazio é permitido (apaga). */
function normalizarSaasUrl(v) {
  const s = String(v || "").trim();
  if (!s) return { ok: true, valor: "" };
  let u;
  try { u = new URL(s); } catch { return { ok: false, erro: "Endereço inválido. Use algo como https://orbita-nexus-ads.netlify.app/app/" }; }
  if (u.protocol !== "https:" || u.search || u.hash || u.username || !u.hostname.includes(".")) return { ok: false, erro: "Use um endereço https completo, sem ?parâmetros nem #rota." };
  const caminho = u.pathname === "/" ? "/app/" : (u.pathname.endsWith("/") ? u.pathname : u.pathname + "/");
  return { ok: true, valor: `${u.origin}${caminho}` };
}
/** Nota honesta sobre a receita de um crmTot do núcleo (herói, régua, donut): o que é real, o que é estimado, o que falta. */
function notaReceita(c, servico = "tratamento") {
  if (!c) return "";
  const base = c.receitaEstimada > 0 ? (c.receitaReal > 0 ? `parte estimada pelo valor de cada ${servico}` : `estimativa pelo valor de cada ${servico}`)
    : c.receita > 0 ? "valores informados na ficha" : "";
  // quem fechou sem valor não entra na soma: a nota diz quantos ficaram de fora (mesmo quando há receita)
  const falta = c.semValor > 0 ? `${c.semValor === 1 ? "1 fechamento" : `${c.semValor} fechamentos`} sem valor informado` : "";
  return base && falta ? `${base} · ${falta}` : base || falta;
}
/** «Fazer agora» com retorno real: acha, nas últimas execuções do servidor, a que atendeu ao pedido feito em `desde`. */
function execucaoDoPedido(execucoes, tarefa, desde) {
  const lista = (execucoes || []).filter(e => e && e.tarefa === tarefa && Date.parse(e.inicio) >= desde - 60000)
    .sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio));
  const e = lista[0];
  if (!e) return { k: "nada", rotulo: "O servidor ainda não registrou o pedido. Confira em Configuração da Nexus o endereço das funções e o token do cron." };
  if (e.ok === false) return { k: "erro", rotulo: `Deu erro no servidor${e.resumo ? `: ${mascararSegredos(typeof e.resumo === "string" ? e.resumo : JSON.stringify(e.resumo)).slice(0, 160)}` : ""}.`, e };   // plano 1000b · AB-161
  if (e.ok === true) return { k: "ok", rotulo: `Rodou no servidor${e.fim ? ` às ${horaSP(e.fim)}` : ""} ✓`, e };
  return { k: "rodando", rotulo: "Começou no servidor e ainda está rodando.", e };
}
/** Plano 1000 (AD-195): faixas «normais» do funil e subtítulos por vertical (antes 30–50/60–80/30–50 da odontologia para todos).
    Referências de mercado aproximadas: oficina e loja agendam mais e fecham mais de quem vem; o genérico usa faixas largas. */
const FAIXAS_FUNIL = {
  odonto: { faixas: [[30, 50], [60, 80], [30, 50]], s: ["avaliação", "à consulta", "tratamento"] },
  oficina: { faixas: [[35, 60], [60, 85], [45, 70]], s: ["visita", "à oficina", "orçamento aprovado"] },
  loja: { faixas: [[20, 45], [50, 80], [40, 70]], s: ["visita", "à loja", "compra"] },
  generico: { faixas: [[20, 50], [50, 80], [25, 55]], s: ["agendamento", "ao atendimento", "venda"] },
};
const faixasFunil = vertical => FAIXAS_FUNIL[vertical] || FAIXAS_FUNIL.odonto;
/** Plano 1000 (AD-206): projeção de fechamentos do mês só a partir do 7º dia. */
const DIAS_PROJECAO_FECHAMENTOS = 7;
/** Plano 1000 (AD-201): «Ocultar nomes» do modo apresentação — iniciais no lugar do nome («Maria Souza» → «M. S.»). */
const iniciais = nome => String(nome || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).map(p => `${p.charAt(0).toUpperCase()}.`).join(" ") || "—";
/** Plano 1000 (AD-202): valor falado dos controles do simulador. */
const valorFalado = (v, tipo) => (tipo === "brl" ? `${brl0(+v)} por mês` : tipo === "dias" ? `${int(+v)} dias` : String(v));

/** plano 1000b · AB-161: o resumo das execuções vem cru do servidor — trechos com cara de segredo (token do Meta EAA…, do Google ya29.,
    chave sb_secret_, sequência longa de letras e números) são mascarados antes de ir para a tela. */
function mascararSegredos(txt) {
  return String(txt ?? "")
    .replace(/\b(EAA)[A-Za-z0-9]{6,}/g, "$1•••")
    .replace(/\b(ya29\.)[A-Za-z0-9._-]{6,}/g, "$1•••")
    .replace(/\b(sb_secret_)[A-Za-z0-9_-]{4,}/g, "$1•••")
    .replace(/\b(sk-ant-)[A-Za-z0-9_-]{4,}/g, "$1•••")
    .replace(/\b[A-Za-z0-9_]{31,}\b/g, m => `${m.slice(0, 4)}•••`);
}
/** plano 1000b · AB-138: conversões da plataforma com fração (1,5 do Google não vira 2): inteiro quando inteiro, 1 casa quando não. */
const fmtConv = v => (v != null && v !== "" && Number.isFinite(+v) && !Number.isInteger(+v) ? dec(+v, 1) : int(v));
/** plano 1000b · AB-139: a leitura de um dia do gráfico — com Google no dia, conversão fracionada e a palavra «conversão». */
function convDiaTxt(p) {
  if (!(p && p.google > 0)) return plural(p ? p.conv : 0, "conversa", "conversas");
  return p.meta > 0 ? pluralDec(p.conv, "conversa ou conversão", "conversas e conversões") : pluralDec(p.conv, "conversão", "conversões");
}
/** plano 1000b · AB-148: a linha de cada mês do «Mês a mês» — conversões sem arredondar e sem «— cada» quando não houve conversão. */
const subMes = t => `${pluralDec(t.conversoes, "conversa", "conversas")}${Number.isFinite(t.cpa) ? ` · ${brl(t.cpa)} cada` : ""}`;
/** plano 1000b · AB-150: a seta do chip de variação — «→» abaixo de 1% (mesma regra do rel-logica.chipVar). */
const setaVar = v => (Math.abs(v) < 1 ? "→" : v >= 0 ? "▲" : "▼");
/** plano 1000b · AB-140/AB-213: rótulos das tabelas e do quadro com o vocabulário da vertical (M.VOC), não «Pacientes/Tratamentos» fixos. */
const capt = x => String(x || "").charAt(0).toUpperCase() + String(x || "").slice(1);
function colunasCamp(V) {
  return [
    ["nome", "Campanha"], ["gasto", "Investido"], ["conv", "Conversas"], ["cpa", "Custo/conversa"], ["ctr", "CTR"],
    ["ag", "Agendadas"], ["fe", capt(V.novo[1])], ["rec", V.receita],
    // só anúncio (sem a gestão): o "Cada R$ 1 virou" do herói, do curta e da folha soma a gestão
    ["roas", "Retorno do anúncio", `${V.receita} ÷ investimento em anúncios desta campanha (sem a gestão da Nexus). O “Cada R$ 1 investido virou” da Visão geral inclui a gestão.`],
  ];
}
const rotuloCelula = V => ({ gasto: "Investido", conv: "Conversas", cpa: "Custo por conversa", fe: capt(V.novo[1]) });
/** plano 1000b · AB-164: as cores das colunas vêm dos tokens do painel.css (--etapa-*), não de hex solto. */
function colunasKanban(V, vertical = "odonto") {
  return [
    ["nova", "Nova conversa", "var(--etapa-nova)"],
    ["agendada", capt(V.agendada[0]), "var(--etapa-agendada)"],
    ["orcamento", vertical === "odonto" ? "Avaliou · orçamento" : `${capt(V.compareceu[0])} · orçamento`, "var(--etapa-orcamento)"],
    ["fechou", "Fechou (30 dias)", "var(--etapa-fechou)"],
    ["parou", "Não seguiu (30 dias)", "var(--etapa-parou)"],
  ];
}
/** plano 1000b · AB-010/AB-231: regrasOff do formulário clássico — os interruptores que a tela mostra decidem os seus ids; ids que a
    tela não conhece (o «ritmo» desligado no Órbita, regra nova) ficam como estavam. `estados` = {id: ligada}. */
function regrasOffDoForm(atual = [], estados = {}) {
  const conhecidas = new Set(Object.keys(estados || {}));
  const fica = [].concat(atual || []).filter(id => typeof id === "string" && !conhecidas.has(id));
  const desligadas = Object.entries(estados || {}).filter(([, ligada]) => !ligada).map(([id]) => id);
  return [...new Set([...fica, ...desligadas])];
}
/** plano 1000b · AB-144: destinos de WhatsApp do formulário clássico — 10 a 13 dígitos (DDD + número, com ou sem 55), como no Órbita.
    Separa por linha, vírgula ou ponto e vírgula (espaço faz parte de «(12) 99999-8888"). → {ok: [...], invalidos: [...]} */
function numerosWa(texto) {
  const ok = [], invalidos = [];
  for (const parte of String(texto || "").split(/[\n,;]+/)) {
    const d = parte.replace(/\D/g, "");
    if (!parte.trim()) continue;
    if (d.length >= 10 && d.length <= 13) { if (!ok.includes(d)) ok.push(d); } else invalidos.push(parte.trim());
  }
  return { ok, invalidos };
}
/** plano 1000b · AB-145: formato das credenciais antes de salvar (cópia do ads-config.erroCredencial do Órbita, AD-068) → texto do erro ou "". */
function erroCredencial(campo, valor) {
  const v = String(valor ?? "").trim(), dig = v.replace(/\D/g, "");
  if (!v) return "";                                     // em branco = mantém o salvo
  if (campo === "meta_ad_account_id") return /^(act_)?\d{6,20}$/.test(v) ? "" : "Use o ID da conta de anúncios: act_ seguido só de números (ex.: act_1234567890).";
  if (campo === "meta_access_token") return /\s/.test(v) ? "O token não tem espaços: copie de novo, inteiro." : v.length < 40 ? "Token curto demais: copie o token de acesso inteiro (costuma começar com EAA)." : "";
  if (campo === "google_customer_id" || campo === "google_login_customer_id") return dig.length === 10 && /^[\d\s-]+$/.test(v) ? "" : "O ID do Google Ads tem 10 números (ex.: 123-456-7890).";
  if (campo === "google_developer_token") return /\s/.test(v) || v.length < 15 ? "Developer token inválido: copie o token inteiro, sem espaços." : "";
  if (campo === "google_client_id") return /\.apps\.googleusercontent\.com$/.test(v) ? "" : "O client ID termina em .apps.googleusercontent.com.";
  if (campo === "google_client_secret" || campo === "google_refresh_token") return /\s/.test(v) || v.length < 10 ? "Valor inválido: copie de novo, inteiro e sem espaços." : "";
  return "";
}
/** plano 1000b · AB-147: meta/orçamento do formulário — vazio = sem valor (null); negativo ou texto = erro (antes −15 apagava a meta calado). */
function valorMeta(texto) {
  const s = String(texto ?? "").trim();
  if (!s) return { ok: true, valor: null };
  // plano 1500c · AC-275: «1.500» e «1.234,50» (milhar com ponto, do jeito brasileiro) não viram 1,5 — e «R$ » na frente é aceito
  const t = s.replace(/^R\$\s*/i, "");
  const v = parseFloat(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(",", "."));
  if (!Number.isFinite(v)) return { ok: false, erro: "use só números" };
  if (v < 0) return { ok: false, erro: "não pode ser negativo" };
  return { ok: true, valor: v };
}
/** plano 1000b · AB-141: último dia com gasto de cada campanha (até ontem, R) — «pausada» quando não gasta há 3 dias ou mais
    (mesma regra do rel-logica.linhasCampanhas, AD-108). */
const DIAS_PAUSADA = 3;
function ultimoGastoCamp(linhas = [], R = 0) {
  const ult = new Map();
  for (const l of linhas || []) if ((+l.gasto || 0) > 0 && l.i <= R && (!ult.has(l.camp) || l.i > ult.get(l.camp))) ult.set(l.camp, l.i);
  return ult;
}
/** plano 1000b · AB-162: o marco salvo é mesclado na lista RELIDA do servidor (antes a lista inteira do carregamento sobrescrevia o marco
    que outro gestor gravou nesse meio-tempo). `t` vazio remove o marco do dia `d`. */
function mesclarMarcos(frescos = [], d, t) {
  const lista = (Array.isArray(frescos) ? frescos : []).filter(m => m && /^\d{4}-\d{2}-\d{2}$/.test(m.d) && typeof m.t === "string" && m.t.trim() && m.d !== d)
    .map(m => ({ d: m.d, t: m.t }));
  if (t) lista.push({ d, t });
  return lista.sort((a, b) => a.d.localeCompare(b.d)).slice(-40);
}
/** plano 1000b · AB-154: período, plataforma e ordem da tabela guardados por cliente (como o Órbita, AD-098/AD-260). */
const chaveFiltros = clienteId => `nx-filtros:${clienteId || "?"}`;
const COLS_ORDEM = ["nome", "gasto", "conv", "cpa", "ctr", "ag", "fe", "rec", "roas"];
function lerFiltros(bruto) {
  const o = { dias: 30, plat: "", sort: { key: "gasto", dir: -1 } };
  let x = null;
  try { x = JSON.parse(bruto || "null"); } catch { x = null; }
  if (!x || typeof x !== "object") return o;
  if ([7, 30, 60].includes(+x.dias)) o.dias = +x.dias;
  if (["", "meta", "google"].includes(x.plat)) o.plat = x.plat;
  if (x.sort && COLS_ORDEM.includes(x.sort.key) && (x.sort.dir === 1 || x.sort.dir === -1)) o.sort = { key: x.sort.key, dir: x.sort.dir };
  return o;
}
/** plano 1500c · AC-224: a cor do custo contra a meta QUE VALE para a campanha (própria, do Google ou do Meta) — antes a meta do Meta
    pintava o Google de vermelho. Sem meta: neutro. */
function nivelCpa(cpa, meta) {
  if (!(meta > 0)) return "dot-neutro";
  if (!Number.isFinite(cpa)) return "dot-bad";
  return cpa <= meta ? "dot-ok" : cpa <= meta * 1.35 ? "dot-warn" : "dot-bad";
}
/** plano 1500c · AC-229: «campanha mais eficiente» com amostra que se sustenta — 3 fechamentos, ou 10 conversas com algum fechamento. */
const amostraEficiente = k => !!k && k.fecharam > 0 && (k.fecharam >= 3 || k.conversas >= 10);
/** plano 1500c · AC-227/AC-228: Meta × Google — só compara custo quando as DUAS plataformas têm custo por contato (antes «E ainda sai
    mais barata» com o Google sem conversão e «R$ —»); a palavra é «contato» (conversão do Google não é conversa). */
function fraseCustoPlat(ca, cb) {
  if (!Number.isFinite(ca) || !Number.isFinite(cb)) return "";
  return ca > cb ? `Cada contato custa mais ali (${brl(ca)} × ${brl(cb)}), mas chega mais decidido.`
    : `E cada contato ainda sai mais barato (${brl(ca)} × ${brl(cb)}).`;
}
/** plano 1500c · AC-235: CTR-limite em linguagem de consultório sem arredondar 0,9% para «1 em cada 100» — fora do inteiro, por 1.000. */
const ctrLeigo = lim => (lim >= 1 && Number.isInteger(lim) ? `menos de ${lim} em cada 100` : `menos de ${Math.max(1, Math.round(lim * 10))} em cada 1.000`);
/** plano 1500c · AC-236: frequência-limite com a casa decimal quando houver (2,5 não vira «3»). */
const vezesLeigo = lim => (Number.isInteger(lim) ? String(lim) : dec(lim, 1));
/** plano 1500c · AC-225/AC-226/AC-271: a frase do ritmo do mês. Orçamento já gasto é um caso próprio (nada de «Segurar R$ X por dia»); nos
    primeiros dias (cedo) não há projeção. m = M.ritmoMes(); orc > 0; sug = diarioSugerido(). → {msg, aten} */
function msgRitmo(m, orc, sug) {
  const txtSug = sug != null && sug > 0 ? ` Orçamento diário sugerido: ${brl(sug)} (somando as plataformas).` : "";
  if (m.restam === 0) return { msg: `Mês fechado em ${brl0(m.gasto)}.`, aten: false };
  if (m.gasto >= orc) return { msg: `O orçamento do mês já foi todo usado (${brl0(m.gasto)} de ${brl0(orc)}) e ${m.restam === 1 ? "falta 1 dia" : `faltam ${m.restam} dias`}: pausar as campanhas ou aumentar a verba do mês.`, aten: true };
  if (m.cedo) return { msg: `Cedo para projetar (dia ${m.pass} do mês): até ontem foram investidos ${brl0(m.gasto)} de ${brl0(orc)}.${txtSug}`, aten: false };
  const acima = m.proj > orc * 1.02, noLimite = !acima && m.proj >= orc * .98;
  // plano 1000 (AD-198): frase neutra — o painel não sabe se o aviso do radar saiu
  if (acima) return { msg: `No ritmo atual o mês fecha ${brl0(m.proj - orc)} acima do orçamento. Segurar ${brl((m.proj - orc) / m.restam)} por dia fecha dentro.${txtSug}`, aten: true };
  if (noLimite) return { msg: `No limite: o mês deve fechar em ${brl0(m.proj)}, praticamente no orçamento.`, aten: false };
  return { msg: `Dentro do orçamento: o mês deve fechar em ${brl0(m.proj)} (sobram ${brl0(orc - m.proj)}).`, aten: false };
}
/** plano 1500c · AC-231: «De X para Y por mês» só entre meses FECHADOS — o mês corrente parcial não é comparado com um mês cheio.
    dados = [{fecharam, parcial}] em ordem → {de, para, parcial} (de null = sem 2 meses fechados). */
function comparaMeses(dados) {
  const cheios = dados.filter(d => !d.parcial), ult = dados[dados.length - 1];
  return { de: cheios.length >= 2 ? cheios[0].fecharam : null, para: cheios.length ? cheios[cheios.length - 1].fecharam : null, parcial: ult && ult.parcial ? ult.fecharam : null };
}
/** plano 1500c · AC-239: linhas de valor por serviço com valor mas sem nome (antes descartadas em silêncio ao salvar). */
const ticketsSemNome = linhas => (linhas || []).filter(([s, v]) => !String(s || "").trim() && String(v ?? "").trim() !== "").length;
/** plano 1500c · AC-248: CSV (separador «;», decimal com vírgula, BOM para o Excel em português) — aspas quando precisa. */
function csvDe(linhas) {
  const cel = v => {
    const s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace(".", ",") : "") : String(v ?? "");
    return s.includes('"') || s.includes(";") || /[\n\r]/.test(s) ? '"' + s.split('"').join('""') + '"' : s;
  };
  return String.fromCharCode(0xFEFF) + linhas.map(l => l.map(cel).join(";")).join("\r\n");
}
/** plano 1500c · AC-245/AC-273: modo apresentação — o nome do paciente vira iniciais em toda lista (não só no celular do herói). */
const nomeExibido = (nome, ocultar) => (ocultar ? String(nome || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).map(p => `${p.charAt(0).toUpperCase()}.`).join(" ") || "—" : String(nome || ""));
/** plano 1500c · AC-241: status técnico da integração («erro — invalid_grant (…)») em português com o que fazer — cópia do
    ads-config.explicarStatusIntegracao do Órbita (AB-106); o texto cru fica no title. → {texto, tecnico} */
function explicarStatusInteg(status) {
  const s = String(status || "").trim();
  if (!/^erro/i.test(s)) return { texto: s, tecnico: "" };
  const cru = s.replace(/^erro\s*[—:-]?\s*/i, "");
  const regras = [
    [/invalid_grant|expired|revoked|expirad|revogad|OAuthException|\b190\b|session has/i, "o acesso expirou ou foi revogado — gere um token novo na plataforma e salve aqui"],
    [/permission|permiss|PERMISSION_DENIED|\b403\b|not authorized|unauthori[sz]ed|\b401\b/i, "a conta não deu permissão para ler os anúncios — confira o acesso do usuário à conta de anúncios"],
    [/not.?found|\b404\b|CUSTOMER_NOT|does not exist|inexistente|n[ãa]o encontrad/i, "a conta de anúncios não foi encontrada — confira o ID da conta e salve de novo"],
    [/rate|quota|\b429\b|too many|limite/i, "a plataforma pediu para esperar (limite de leituras) — costuma passar sozinho na próxima hora"],
    [/timeout|timed out|ETIMEDOUT|ECONN|\b50[234]\b|unavailable|indispon/i, "a plataforma não respondeu a tempo — costuma passar sozinho na próxima hora"],
    [/developer.?token/i, "o developer token do Google não foi aceito — confira se ele está aprovado e salve de novo"],
  ];
  const achou = regras.find(([re]) => re.test(cru));
  return { texto: `a leitura falhou: ${achou ? achou[1] : "confira os dados da conexão e salve de novo"}`, tecnico: cru };
}
/** plano 1500c · AC-275: número no campo de texto com vírgula (o input type=number recusava «12,5» em navegador em inglês). */
const numCampo = v => (v == null || v === "" || !Number.isFinite(+v) ? "" : String(+v).replace(".", ","));
/** plano 1500c · AC-068: o dia (YYYY-MM-DD, SP) dos dados carregados ficou para trás? */
const diaVirou = (hojeDados, hojeAgora) => !!hojeDados && !!hojeAgora && String(hojeAgora) > String(hojeDados).slice(0, 10);
/* ==== PURO: fim ==== */

/* ============================================================
   1. ESTADO
   ============================================================ */
const novoAj = () => ({ carregado: false, integ: null, contas: null, config: null, novoCliente: false, tRecarga: 0, tConfere: 0 });
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
/** plano 1500c · AC-245/AC-273: modo apresentação (?apresentar ou «nx-ocultar-nomes») — iniciais em TODA lista de pacientes (kanban,
    gaveta, avisos, «desde a última visita», paleta), não só no celular do herói. */
const nomeTela = nome => (OCULTAR_NOMES ? nomeExibido(nome, true) : nomeCurto(nome));
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
/** Só as notificações que cabem INTEIRAS na tela (com 12 px de respiro no pé): nunca um cartão
    cortado ao meio. Mede pelo layout (offsetTop, sem as transformações da entrada) e repete
    quando a tela muda de tamanho (celular 220 px ↔ desktop 250 px, aba que aparece). */
const roNotif = "ResizeObserver" in window ? new ResizeObserver(es => es.forEach(e => caberNotifs(e.target, true))) : null;
function caberNotifs(bloq, doRO) {
  if (!bloq) return;
  if (!doRO && roNotif) roNotif.observe(bloq);
  if (!doRO && document.fonts && document.fonts.status === "loading") document.fonts.ready.then(() => caberNotifs(bloq, true));
  const h = bloq.clientHeight;
  if (!h) return;
  const ns = [...bloq.querySelectorAll(".notif")];
  ns.forEach(n => { n.hidden = false; });
  let corta = false;
  for (const n of ns) { if (corta || n.offsetTop + n.offsetHeight > h - 12) { corta = true; n.hidden = true; } }
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
      // plano 1500c · AC-241: o status cru vira frase com o que fazer
      texto: `${esc(capt(explicarStatusInteg(comErro.status).texto))}. ${gestor() ? "Confira as credenciais em Ajustes." : "A equipe que cuida dos anúncios já foi avisada e está vendo isso."}`, botoes: btnAj,
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
/** plano 1500c · AC-242: confirmação no diálogo do próprio painel (<dialog> modal: foco preso, Esc cancela, o foco volta ao botão de
    origem) — antes o confirm() nativo, sem estilo e diferente em cada navegador. → Promise<boolean> */
function confirmar(msg, { ok = "Confirmar", cancelar = "Cancelar" } = {}) {
  const volta = document.activeElement;
  let d = $("#dlg-confirmar");
  if (!d && typeof HTMLDialogElement === "function") {
    d = document.createElement("dialog");
    d.id = "dlg-confirmar"; d.className = "dlg-confirmar";
    d.setAttribute("aria-labelledby", "dlg-confirmar-t");
    d.innerHTML = `<form method="dialog"><p id="dlg-confirmar-t" class="dlg-t"></p><div class="acoes"><button class="pill pill-ghost" value="nao" type="submit" data-cancelar></button><button class="pill pill-bronze" value="sim" type="submit" data-ok></button></div></form>`;
    document.body.appendChild(d);
  }
  if (!d || typeof d.showModal !== "function") return Promise.resolve(window.confirm(msg));   // navegador sem <dialog>
  $("#dlg-confirmar-t", d).textContent = msg;
  $("[data-ok]", d).textContent = ok;
  $("[data-cancelar]", d).textContent = cancelar;
  d.returnValue = "";
  return new Promise(res => {
    d.addEventListener("close", () => { res(d.returnValue === "sim"); if (volta && document.contains(volta)) volta.focus({ preventScroll: true }); }, { once: true });
    d.showModal();
    $("[data-cancelar]", d).focus();   // o padrão seguro é não fazer
  });
}
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
  // plano 1500c · AC-016: é a MESMA conta de nucleo.retornoInvestimento, usada pelo resumo mensal e pela folha (receita ÷ anúncios + gestão)
  const custoTotal = t.gasto + fee;
  const retorno = S.plat ? roas : (custoTotal ? c.receita / custoTotal : null);
  return { de, ate, deA, ateA, f, t, ta, c, ca, roas, fee, custoTotal, retorno, dias: S.dias, plat: S.plat };
}

function renderGeral() {
  const vazio = semAnuncios();
  $("#vazio-geral").hidden = !vazio;
  $("#corpo-geral").hidden = vazio;
  if (vazio) { $("#vazio-geral").innerHTML = htmlSemAnuncios(); renderSimulador(); return; }

  // fee = gestão do período (0 quando o cliente não configurou: a conta e o rótulo passam a ser só anúncios)
  const { de, t, ta, c, ca, roas, retorno, fee } = numerosPeriodo();
  const CFG = M.CFG;
  renderDesdeVisita();

  // herói — a frase que a doutora lê em 3 segundos
  $("#hero-periodo").textContent = `Últimos ${S.dias} dias${S.plat ? " · só " + nomePlat(S.plat) : ""}`;
  // plano 1000 (AD-194): o vocabulário é o da vertical (M.VOC) — oficina e loja não têm «avaliações» nem «pacientes»
  const V = M.VOC;
  $("#hero-frase").innerHTML =
    `Os anúncios trouxeram <b>${int(c.conversas)}</b> ${c.conversas === 1 ? "conversa" : "conversas"} no WhatsApp, ` +
    `<b>${int(c.agendadas)}</b> ${esc(c.agendadas === 1 ? V.agendada[0] : V.agendada[1])} e ` +
    `<b>${int(c.fecharam)}</b> <em>${esc(c.fecharam === 1 ? V.novo[0] : V.novo[1])}</em>.`;

  // a trilha 106 → 44 → 13, ligada por um fio de bronze
  const passo = (v, k, rot, taxa) => `<div class="tr-passo">${taxa == null ? `<span class="tr-no" aria-hidden="true"></span>` : `<span class="tr-taxa" title="de uma etapa para a outra">${pc(taxa, 0)}</span>`}` +
    `<b class="tr-n" data-n="${v}" data-f="int" data-k="${k}">${int(v)}</b><span class="tr-l">${rot}</span></div>`;
  const tx1 = razao(c.agendadas, c.conversas), tx2 = razao(c.fecharam, c.agendadas);
  $("#trilha").innerHTML =
    `<svg class="fio" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="fio-h" pathLength="1" d="M0 50H100"/><path class="fio-v" pathLength="1" d="M50 0V100"/></svg>` +
    `<span class="fio-conta" aria-hidden="true"></span>` +
    passo(c.conversas, "h-conv", c.conversas === 1 ? "conversa no WhatsApp" : "conversas no WhatsApp", null) +
    // plano 1000b · AB-012: sem base (nenhuma conversa/agendamento) a taxa é null — o passo desenha o marcador vazio, nunca «0%»
    passo(c.agendadas, "h-ag", esc(c.agendadas === 1 ? V.agendada[0] : V.agendada[1]), fin(tx1) ? tx1 : null) +
    passo(c.fecharam, "h-fe", esc(c.fecharam === 1 ? V.novo[0] : V.novo[1]), fin(tx2) ? tx2 : null);

  // a conta em linguagem de consultório (o MESMO retorno de sempre, só reescrito); a nota diz o que é real e o que é estimado
  $("#hero-conta").innerHTML = `
    <div class="hc"><span class="hc-l">${esc(V.local)}</span>
      <p class="hc-f"><b data-n="${c.receita}" data-f="brl0" data-k="h-rec">${brl0(c.receita)}</b> ${esc(V.receitaEm)}</p>
      <small>${esc(notaReceita(c, V.servico))}</small></div>
    <div class="hc hc-x"><span class="hc-l">${rotT(S.plat || !fee ? "hero.retornoPlat" : "hero.retorno")}${gestor() && fin(retorno) ? ` · ${dec(retorno, 1)}x` : ""}</span>
      <p class="hc-f">${fin(retorno) ? `Cada R$ 1 ${S.plat ? "em anúncio" : "investido"} virou <b>${brl(retorno)}</b>` : "Sem investimento no período"}</p>
      <small>${S.plat || !fee ? "receita ÷ investimento em anúncios" : "receita ÷ (anúncios + gestão)"}</small></div>`;

  // o celular de verdade: tela bloqueada recebendo as conversas vindas de anúncio
  const hoje = M.dataDe(M.R + 1);
  const recentes = M.LEADS.filter(L => L.plat && L.i <= M.R && (!S.plat || L.plat === S.plat))
    .sort((a, b) => (b.i - a.i) || String(b.id).localeCompare(String(a.id), "pt-BR", { numeric: true })).slice(0, 3);
  const quando = i => { const d = M.R - i; return d <= 0 ? "ontem" : d === 1 ? "anteontem" : `há ${d + 1} dias`; };
  // a prévia da notificação conta o dia (a 1ª linha com números do relatório das 8h), sem emoji
  // (o relatório é da conta inteira, como o do WhatsApp: não segue o filtro de plataforma)
  const lOntem = M.linhasDe(M.R, M.R), ontem = M.consolidar(lOntem);
  // plano 1000 (AD-199): o Google manda 1,5 conversão — a prévia não arredonda e usa a palavra certa; AD-116: meta 0 = sem meta
  const gOntem = lOntem.some(l => l.plat === "google"), mOntem = lOntem.some(l => l.plat === "meta");
  const convOntem = gOntem ? pluralDec(ontem.conversoes, mOntem ? "conversa ou conversão" : "conversão", mOntem ? "conversas e conversões" : "conversões") : plural(ontem.conversoes, "conversa", "conversas");
  const previaRel = ontem.gasto > 0
    ? `Ontem: ${convOntem}${fin(ontem.cpa) ? ` · ${brl(ontem.cpa)} cada` : ""}${CFG.cpaAlvo > 0 ? ` · meta ${brl(CFG.cpaAlvo)}` : ""}`
    : "Ontem: nenhum anúncio no ar";
  const notifs = [{ nx: true, titulo: "Nexus · Tráfego", texto: previaRel, quando: "08:00" }]
    .concat(recentes.map(L => {
      const k = L.cri && M.CRI[L.cri], cp = M.CAMP[L.camp];
      // AD-201: aberto em modo apresentação (?apresentar) ou com «nx-ocultar-nomes» = 1, o celular do herói mostra só iniciais
      return { titulo: `${(OCULTAR_NOMES ? iniciais : nomeCurto)(L.nome)} · via anúncio`, texto: `Chamou pelo anúncio «${(k && k.curto) || (cp && cp.curto) || "anúncio"}»`, quando: quando(L.i) };
    }));
  $("#hero-fone").innerHTML = foneHtml(telaBloqueada("08:00", dataLonga(hoje), notifs), "fone-hero", 6);
  caberNotifs($("#hero-fone .bloq"));

  // régua de instrumentos: 6 células, número + período anterior tracejado por baixo
  const meta = CFG.cpaAlvo;
  const sd = M.porDia(S.plat), idx = Array.from({ length: S.dias }, (_, n) => de + n), idxA = idx.map(i => i - S.dias);
  const par = fn => [idx.map(fn), idxA.map(i => (i < 0 ? null : fn(i)))];
  const m7 = arr => i => (i < 0 ? null : M.media7(arr, i));
  const acum = lista => lista.reduce((acc, i) => (acc.push(i < 0 ? null : (acc[acc.length - 1] || 0) + sd.rec[i]), acc), []);
  // plano 1500c · AC-009/AC-246: TikTok e outras plataformas («outras» do porDia) entram nas somas do dia
  const cpa7 = i => { if (i < 0) return null; const g = M.soma7(sd.meta, i) + M.soma7(sd.google, i) + M.soma7(sd.outras, i), n = M.soma7(sd.conv, i); return n ? g / n : null; };
  const dif = fin(t.cpa) && meta > 0 ? Math.abs(t.cpa - meta) / meta * 100 : null;   // AD-116: meta 0 não divide (antes «Infinity% abaixo»)
  const temG = S.plat ? S.plat === "google" : M.linhasDe(de, M.R, { plat: "google" }).some(l => (+l.gasto || 0) > 0 || (+l.conversoes || 0) > 0);
  const cap = x => String(x).charAt(0).toUpperCase() + String(x).slice(1);
  const K = [
    { k: "k-inv", l: "Investido em anúncios", v: t.gasto, a: ta.gasto, f: "brl0", s: "neutro", sp: par(i => sd.meta[i] + sd.google[i] + sd.outras[i]) },
    // AD-196: com Google no período o custo é «por conversão da plataforma» e a meta (de conversa no WhatsApp) não é régua
    { k: "k-cpa", l: temG ? "Custo por conversão da plataforma" : "Custo por conversa", v: t.cpa, a: ta.cpa, f: "brl", s: "baixo", medidor: !temG && meta > 0,
      extra: !(meta > 0) ? "sem meta definida" : temG ? `a meta de ${brl(meta)} vale para conversas no WhatsApp (Meta)` : !fin(t.cpa) ? `meta ${brl(meta)}` : t.cpa <= meta ? `meta ${brl(meta)} · ${pc(dif, 0)} abaixo` : `meta ${brl(meta)} · ${pc(dif, 0)} acima`,
      sp: par(cpa7) },
    { k: "k-conv", l: "Conversas no WhatsApp", v: c.conversas, a: ca.conversas, f: "int", s: "cima", sp: par(m7(sd.conv)) },
    { k: "k-ag", l: cap(V.agendada[1]), v: c.agendadas, a: ca.agendadas, f: "int", s: "cima", sp: par(m7(sd.ag)) },
    { k: "k-fe", l: cap(V.novo[1]), v: c.fecharam, a: ca.fecharam, f: "int", s: "cima", sp: par(m7(sd.fe)) },
    { k: "k-rec", l: V.receita, v: c.receita, a: ca.receita, f: "brl0", s: "cima",
      // a clínica lê a conta do herói (com a gestão); o "x" só anúncios fica para o gestor
      // plano 1000b · AB-151: a nota usa o serviço da vertical («valor de cada serviço/produto»)
      extra: !gestor() ? esc(notaReceita(c, V.servico)) : fin(roas) ? `${dec(roas, 1)}x o investido em anúncios` : esc(notaReceita(c, V.servico)), sp: [acum(idx), acum(idxA)] },
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
    return `<span class="var ${cls}">${esc(setaVar(v))} ${pc(Math.abs(v), 0)}</span>`;   // plano 1000b · AB-150: «→» abaixo de 1%
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
  renderTabelaDia();
  renderMarcosLista();   // plano 1500c · AC-272
  renderFunil(t, c);
  renderMeses();
  renderLeitura(t, ta, c);
  renderRitmo();
  renderSimulador();
}

function serieDia(de, ate, plat) {
  const sd = M.porDia(plat), out = [];
  // plano 1500c · AC-246: «outras» (TikTok…) na série do gráfico e da tabela
  for (let i = de; i <= ate; i++) out.push(i < 0 ? null : { i, meta: sd.meta[i], google: sd.google[i], outras: sd.outras[i], conv: sd.conv[i], convMedia: M.media7(sd.conv, i) });
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
  const maxG = eixoTopo(Math.max(1, ...serie.map(d => d.meta + d.google + d.outras)));   // plano 1500c · AC-246
  const maxC = Math.max(4, Math.ceil(Math.max(...serie.map(d => d.convMedia), ...ant.filter(Boolean).map(d => d.convMedia)) * 1.1 / 4) * 4);
  const bw = iw / serie.length, base = P.t + ih;
  const y = v => base - v / maxG * ih, yc = v => base - v / maxC * ih;
  const bloco = el.closest("[data-cena]");
  const troca = modo === "troca" && FX && ANIM && FX.assentado(bloco) && el.querySelector("svg");
  const foto = troca ? FX.fotografar(el, ".bars rect", "data-id") : null;

  // plano 1000b · AB-158: a linha são as conversões da plataforma (média de 7 dias), não «conversas no WhatsApp»
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Investimento diário por plataforma e conversões da plataforma (média de 7 dias) nos últimos ${S.dias} dias">`;
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
    // plano 1500c · AC-246: a fatia das outras plataformas empilhada por cima
    if (d.outras > 0) s += `<rect class="bo" data-i="${d.i}" data-id="o${d.i}" x="${x.toFixed(1)}" y="${y(d.meta + d.google + d.outras).toFixed(1)}" width="${w.toFixed(1)}" height="${(y(d.meta + d.google) - y(d.meta + d.google + d.outras)).toFixed(1)}" rx="${rx}" style="--k:${n}"/>`;
  });
  s += `</g>`;
  // marcos (claquetes): linha tracejada creme no dia + a claquete no topo
  for (const mk of marcosAtuais()) {
    const i = iDeIso(mk.d), n = i - de;
    if (n < 0 || n >= serie.length) continue;
    const x = (P.l + n * bw + bw / 2).toFixed(1);
    s += `<g class="marco${mk.exemplo ? " exemplo" : ""}" data-i="${i}"><line x1="${x}" x2="${x}" y1="${P.t + 15}" y2="${base}"/><use href="#ic-claq" x="${(+x - 10).toFixed(1)}" y="${P.t - 7}" width="20" height="20"/></g>`;
  }
  const pts = serie.map((d, n) => [P.l + n * bw + bw / 2, yc(d.convMedia)]);
  const dl = traco(pts);
  const ptsA = ant.map((d, n) => (d ? [P.l + n * bw + bw / 2, yc(d.convMedia)] : null)).filter(Boolean);
  const cls = troca ? " troca" : "";
  s += `<path class="area${cls}" d="${dl} L${pts[pts.length - 1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z"/>`;
  s += `<path class="lin${cls}" pathLength="1" d="${dl}"/>`;
  // dupla exposição: o período anterior POR CIMA das barras e da linha (creme tracejado), para ser visto
  if (ptsA.length > 1) s += `<path class="ant${cls}" d="${traco(ptsA)}"/>`;
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
/** Plano 1000 (AD-209): tabela do gráfico diário (dia, Meta, Google, conversões da plataforma, custo por conversão). */
function renderTabelaDia() {
  const el = $("#tabela-dia");
  if (!el || el.hidden || !M || semAnuncios()) return;
  const { de, ate } = janela(), serie = serieDia(de, ate, S.plat).filter(Boolean);
  // plano 1500c · AC-246: coluna «Outras» só quando há TikTok/outra plataforma no período; o custo usa o total do dia
  const temOutras = serie.some(d => d.outras > 0);
  el.innerHTML = `<div class="tabela-dia-rol" role="region" tabindex="0" aria-label="Investimento e conversões por dia"><table class="tabela-dia-t">
    <caption class="sr-only">Investimento e conversões da plataforma por dia, últimos ${int(S.dias)} dias</caption>
    <thead><tr><th scope="col">Dia</th><th scope="col">Meta</th><th scope="col">Google</th>${!temOutras ? "" : `<th scope="col">Outras</th>`}<th scope="col">Conversões</th><th scope="col">Custo por conversão</th></tr></thead>
    <tbody>${serie.map(d => `<tr><th scope="row">${esc(SEMANA[M.dataDe(d.i).getDay()])} · ${esc(M.ddmm(d.i))}</th><td>${brl(d.meta)}</td><td>${brl(d.google)}</td>${!temOutras ? "" : `<td>${brl(d.outras)}</td>`}<td>${Number.isInteger(d.conv) ? int(d.conv) : dec(d.conv, 1)}</td><td>${brl((d.meta + d.google + d.outras) / d.conv)}</td></tr>`).join("")}</tbody>
  </table></div>`;
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
    const dt = M.dataDe(p.i), g = p.meta + p.google + p.outras, cpc = p.conv ? g / p.conv : null, a = d.ant[k];   // plano 1500c · AC-246
    // legenda fixa no cabeçalho: o título do cartão nunca some (Google manda conversão fracionada: plural/int)
    leg.innerHTML = `<b>${SEMANA[dt.getDay()]} · ${M.ddmm(p.i)}</b> — Meta <span class="v">${brl(p.meta)}</span> · Google <span class="v">${brl(p.google)}</span>${p.outras > 0 ? ` · Outras <span class="v">${brl(p.outras)}</span>` : ""} · ` +
      // plano 1000b · AB-139: com Google no dia, conversão sem arredondar e «por conversão»
      `<span class="v">${esc(convDiaTxt(p))}</span>${fin(cpc) ? ` · <span class="v">${brl(cpc)}</span> por ${p.google > 0 ? "conversão" : "conversa"}` : ""}` +
      `${a ? ` · antes: <span class="v">${esc(fmtConv(a.conv))}</span>` : ""}`;
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

// plano 1500c · AC-230: taxa acima de 100% (quem veio agora tinha agendado antes do período) é cortada em 100% — e a nota diz por quê
const NOTA_FUNIL = "inclui quem entrou na etapa anterior antes do período";
function renderFunil(t, c) {
  const leigo = !gestor();
  const FUNIL_VERT = faixasFunil(M.vertical);
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
    // plano 1000 (AD-194/AD-195): rótulos e faixas «normais» por vertical (antes as da odontologia para oficina e loja também)
    { l: "Agendaram", s: FUNIL_VERT.s[0], v: c.agendadas, r: razao(c.agendadas, c.conversas), rl: "das conversas", faixa: FUNIL_VERT.faixas[0] },
    { l: "Compareceram", s: FUNIL_VERT.s[1], v: c.compareceram, r: razao(c.compareceram, c.agendadas), rl: "dos agendados", faixa: FUNIL_VERT.faixas[1] },
    { l: "Fecharam", s: FUNIL_VERT.s[2], v: c.fecharam, r: razao(c.fecharam, c.compareceram), rl: "de quem veio", faixa: FUNIL_VERT.faixas[2] },
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
        ${r != null ? `<p class="fun-rate">${taxa} ${st}${!(fin(e.r) && e.r > 100) ? "" : `<small class="fun-nota">${esc(NOTA_FUNIL)}</small>`}</p>` : ""}
      </div>`;
  }).join("");
}

function renderMeses() {
  const todos = M.mesesDados(), fp = { plat: S.plat };
  // plano 1500c · AC-043: mês com menos de 3 dias de número (o cliente começou no fim dele) não vira barra
  const lista = todos.filter(m => (m.ate - m.de >= 9 && (m.diasComDado ?? 99) >= 3) || m.ate === M.R).slice(-5);
  const rit = M.ritmoMes(M.R);
  const dados = lista.map(m => {
    const c = M.crmTot(m.de, m.ate, fp), atual = m.ate === M.R && !m.completo;
    // projeção do mês corrente (calculada aqui, no painel): fecharam ÷ dias passados × dias do mês
    // plano 1000 (AD-206): no começo do mês 1 fechamento virava «projeção 30» — só a partir do 7º dia
    const proj = atual && rit.pass >= DIAS_PROJECAO_FECHAMENTOS ? Math.round(c.fecharam / rit.pass * rit.diasMes) : null;
    return { m, t: M.consolidar(M.linhasDe(m.de, m.ate, fp)), c, parcial: !m.completo, atual, proj: proj != null && proj > c.fecharam ? proj : null };
  });
  const el = $("#mes-a-mes");
  if (!dados.length) { el.innerHTML = `<p class="vazio">Ainda não há meses para comparar.</p>`; return; }
  const ult = dados[dados.length - 1], vN = ult.c.fecharam;
  const pn = v => (v === 1 ? M.VOC.novo[0] : M.VOC.novo[1]);   // AD-194
  // plano 1500c · AC-231: a comparação é entre meses FECHADOS; o mês corrente parcial aparece só como «(out. parcial: N)»
  const cmp = comparaMeses(dados.map(d => ({ fecharam: d.c.fecharam, parcial: d.parcial })));
  const parc = ult.parcial ? ` <span class="mam-parc">(${MES3[ult.m.mes]}. parcial${!(cmp.de == null && cmp.para == null) ? `: ${int(vN)}` : ""})</span>` : "";
  $("#mam-titulo").innerHTML = cmp.de == null ? (cmp.para != null && ult.parcial ? `${int(cmp.para)} ${pn(cmp.para)} no último mês fechado${parc}` : `${int(vN)} ${pn(vN)} em ${MESES[ult.m.mes]}${ult.parcial ? ` <span class="mam-parc">(${MES3[ult.m.mes]}. parcial)</span>` : ""}`)
    : cmp.de === cmp.para ? `${int(cmp.para)} ${pn(cmp.para)} por mês, estável${parc}`
    : `De ${int(cmp.de)} para ${int(cmp.para)} ${pn(cmp.para)} por mês${parc}`;
  const acum = todos.reduce((s, m) => s + M.crmTot(m.de, m.ate, fp).fecharam, 0);
  $("#mam-sub").textContent = `${plural(acum, M.VOC.novo[0], M.VOC.novo[1])} vindos dos anúncios desde ${MESES[todos[0].mes]}.`;

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
      <span class="mam-s">${esc(subMes(d.t))}</span></div>`).join("")}</div>`;
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
  // plano 1000 (AD-197): «Cada conversa no WhatsApp custou» é o CPA do META; o Google ganha frase própria (custo por conversão)
  const { de: deL } = janela();
  const tm = S.plat === "google" ? null : M.consolidar(M.linhasDe(deL, M.R, { plat: "meta" })), tmA = S.plat === "google" ? null : M.consolidar(M.linhasDe(deL - S.dias, deL - 1, { plat: "meta" }));
  const tg = S.plat === "meta" ? null : M.consolidar(M.linhasDe(deL, M.R, { plat: "google" }));
  if (tm && fin(tm.cpa)) {
    const v = variacao(tm.cpa, tmA.cpa);
    const vt = v == null ? "" : ` (${v <= 0 ? "caiu" : "subiu"} ${pc(Math.abs(v), 0)} em relação aos ${S.dias} dias anteriores)`;
    // plano 1000 (AD-001): sem meta definida, a frase diz o custo sem comparar com meta nenhuma
    out.push(!(meta > 0) ? { k: "bom", h: `Cada conversa no WhatsApp custou <b>${brl(tm.cpa)}</b>${vt} — sem meta de custo definida.` }
      : tm.cpa <= meta
      ? { k: "bom", h: `Cada conversa no WhatsApp custou <b>${brl(tm.cpa)}</b>, dentro da meta de ${brl(meta)}${vt}.` }
      : { k: "aten", h: `Cada conversa no WhatsApp custou <b>${brl(tm.cpa)}</b>, acima da meta de ${brl(meta)}${vt}.` });
  }
  if (tg && tg.gasto > 0) out.push(fin(tg.cpa)
    ? { k: "bom", h: `No Google, cada conversão registrada custou <b>${brl(tg.cpa)}</b> (conversão do Google não é conversa no WhatsApp: fica fora da meta).` }
    : { k: "aten", h: `O Google investiu ${brl0(tg.gasto)} e não registrou conversão no período — confira o acompanhamento de conversões da conta.` });
  void t; void ta;
  // campanha com alerta ativo não pode ser elogiada nem receber verba
  const comAlerta = new Set(M.avaliar(M.R).filter(a => a.regra.nivel === "campanha").map(a => a.chave.split("|")[1]));
  const rows = linhasCamp().filter(r => r.t.gasto >= 40);
  // plano 1500c · AC-229: «mais eficiente» só com amostra que se sustenta (3 fechamentos, ou 10 conversas com algum fechamento)
  const efic = rows.filter(r => amostraEficiente(r.k) && !comAlerta.has(r.c.id)).sort((a, b) => a.cpp - b.cpp)[0];
  if (efic) out.push({ k: "bom", h: `<b>${esc(efic.c.nome)}</b> é a campanha mais eficiente: cada ${esc(M.VOC.novo[0])} custou ${brl0(efic.cpp)} em anúncio.` });
  const serv = Object.entries(c.serv).sort((a, b) => b[1].v - a[1].v)[0];
  if (serv && c.receita) out.push({ k: "bom", h: `<b>${esc(serv[0])}</b> trouxe ${pc(serv[1].v / c.receita * 100, 0)} do valor ${esc(M.VOC.receitaEm)} (${serv[1].n} de ${c.fecharam} ${esc(c.fecharam === 1 ? M.VOC.pessoa[0] : M.VOC.pessoa[1])}).` });   // AD-194
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
      // plano 1000b · AB-149: «viram <agendamento da vertical>» e «Meta» (antes «avaliação» e «Instagram/Facebook» fixos)
      const [a, b, ta2, tb, ca2, cb] = tg >= tm ? [nomePlat("google"), nomePlat("meta"), tg, tm, cg, cm] : [nomePlat("meta"), nomePlat("google"), tm, tg, cm, cg];
      out.push({ k: "acao", h: `No <b>${a}</b>, de cada 100 conversas ${Math.round(ta2)} viram ${esc(M.VOC.agendada[0])} (contra ${Math.round(tb)} no ${b}). ${esc(fraseCustoPlat(ca2, cb))}` });
    }
  }
  $("#leitura").innerHTML = out.slice(0, 5).map((x, n) => `<li class="${x.k}" style="--i:${n}"><span class="lt-n" aria-hidden="true">${p2(n + 1)}</span>` +
    `<p class="lt-t">${x.k === "aten" ? `<span class="lt-aten">Atenção —</span> ` : ""}${x.h}</p></li>`).join("")
    || `<li><span class="lt-n" aria-hidden="true">01</span><p class="lt-t">Sem dados suficientes no período.</p></li>`;
}

function renderRitmo() {
  const m = M.ritmoMes(M.R), orc = M.CFG.orcamento, escala = Math.max(orc, (m.cedo || m.pass < DIAS_MIN_PROJECAO) ? m.gasto : m.proj, 1) * 1.08;   // AC-225
  $("#ritmo-sub").textContent = `${MESES[m.mes]} · dia ${m.pass} de ${m.diasMes} · todas as plataformas`;
  $("#ritmo-h").innerHTML = rotT("ritmo.titulo");
  // plano 1000 (AD-001/AD-007): sem orçamento definido (null ou 0) não há barra nem «acima/abaixo» — só o gasto do mês
  if (!(orc > 0)) {
    $("#ritmo").innerHTML = `
    <div class="ritmo-num"><strong data-n="${m.gasto}" data-f="brl0" data-k="rit">${brl0(m.gasto)}</strong><span>investidos no mês</span></div>
    <p class="ritmo-msg">Orçamento do mês não definido${gestor() ? " — preencha em Ajustes para ver o ritmo e a projeção contra ele" : ""}.</p>`;
    return;
  }
  // plano 1000b · AB-156: na legenda, o glifo «▮» fica aria-hidden (o leitor de tela lê só «orçamento»)
  // plano 1500c · AC-225: nos primeiros dias (DIAS_MIN_PROJECAO, como o Órbita e o WhatsApp) a projeção é ruído — sem barra de projeção
  const cedo = m.cedo || m.pass < DIAS_MIN_PROJECAO;
  const w = m.gasto / escala * 100, wp = cedo ? w : m.proj / escala * 100, mo = orc / escala * 100;
  // plano 1000b · AB-225: quanto investir por dia daqui até o fim do mês para fechar no orçamento — (orçamento − gasto) ÷ dias restantes
  const sug = diarioSugerido(orc, m.gasto, m.restam);
  // plano 1500c · AC-226: orçamento esgotado tem frase própria (antes «Segurar R$ X por dia…» junto com «já foi todo usado»)
  const { msg, aten } = msgRitmo({ ...m, cedo }, orc, sug);
  $("#ritmo").innerHTML = `
    <div class="ritmo-num"><strong data-n="${m.gasto}" data-f="brl0" data-k="rit">${brl0(m.gasto)}</strong><span>investidos de ${brl0(orc)}</span></div>
    <div class="pbar" style="--w:${w.toFixed(1)}%;--w0:${w.toFixed(1)}%;--w1:${Math.max(0, wp - w).toFixed(1)}%;--m:${mo.toFixed(1)}%"><i></i><u></u><b title="orçamento"></b></div>
    <div class="ritmo-leg"><span>investido até ontem</span><span>${!cedo ? `projeção ${brl0(m.proj)}` : "cedo para projetar"}</span><span><span aria-hidden="true">▮</span> orçamento</span></div>
    <p class="ritmo-msg${!aten ? "" : " aten"}">${msg}</p>`;   // plano 1500c · AC-271: «investido», não «gasto», para o dono
}

/* ============================================================
   4. CAMPANHAS
   ============================================================ */
// plano 1000b · AB-140: as colunas (colunasCamp) e os rótulos do cartão do celular (rotuloCelula) saem do vocabulário da vertical — bloco PURO
const VAL_CAMP = {
  nome: r => r.c.nome, gasto: r => r.t.gasto, conv: r => r.t.conversoes, cpa: r => r.t.cpa, ctr: r => r.t.ctr,
  ag: r => r.k.agendadas, fe: r => r.k.fecharam, rec: r => r.k.receita, roas: r => r.roas,
};
// AD-116: sem meta (0) o ponto fica neutro (antes toda campanha virava vermelha)
// plano 1500c · AC-224: a meta da campanha (própria) ou da plataforma dela — Google com cpaAlvoGoogle, nunca a meta de conversa do Meta
const metaDe = camp => (camp && typeof M.metaDaCampanha === "function" ? M.metaDaCampanha(camp) : camp && camp.plat === "google" ? (M.CFG.cpaAlvoGoogle > 0 ? +M.CFG.cpaAlvoGoogle : null) : M.CFG.cpaAlvo);
const pontoCpa = (cpa, camp) => nivelCpa(cpa, metaDe(camp));
/** plano 1000b · AB-152: o ponto de cor do CPA também em texto (para leitor de tela). */
const NIVEL_CPA = { "dot-ok": "dentro da meta", "dot-warn": "um pouco acima da meta", "dot-bad": "acima da meta", "dot-neutro": "sem meta definida" };

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
  // no celular (≤ 700 px) cada linha vira um cartão: nome + 4 números em 2×2 (data-l é o rótulo de cada um)
  const ROT_CEL = rotuloCelula(M.VOC);
  const td = (k, v) => `<td class="c-${k}"${ROT_CEL[k] ? ` data-l="${esc(ROT_CEL[k])}"` : ""}>${v}</td>`;
  // plano 1000b · AB-011: aria-sort no <th> (cabeçalho de coluna), não no botão — leitor de tela anuncia a ordenação
  const th = colunasCamp(M.VOC).map(([k, l, tt]) => `<th scope="col"${tt ? ` title="${esc(tt)}"` : ""}${k === key ? ` aria-sort="${dir < 0 ? "descending" : "ascending"}"` : ""}><button type="button" data-sort="${k}">${esc(l)}</button></th>`).join("");
  // plano 1000b · AB-141: campanha sem gasto há 3 dias ou mais ganha o chip «pausada · último gasto dd/mm» (como o Órbita, AD-108)
  const ultG = ultimoGastoCamp(M.LINHAS, M.R);
  rows.forEach(r => { const u = ultG.get(r.c.id); r.pausaDe = u != null && M.R - u >= DIAS_PAUSADA ? u : null; });
  // plano 1500c · AC-232: agendou/fechou com int() (separador de milhar, como as outras colunas); AC-224: a cor pela meta da campanha
  S.csvCamp = rows;   // plano 1500c · AC-248: o botão «Baixar CSV» exporta exatamente o que a tabela mostra
  $("#tbl-campanhas").innerHTML = rows.length ? `<table>
    <caption class="sr-only">Campanhas nos últimos ${S.dias} dias</caption>
    <thead><tr>${th}</tr></thead>
    <tbody>${rows.map((r, n) => `<tr style="--i:${n}" data-camp="${esc(r.c.id)}">
      <td><div class="nm"><span class="dot ${pontoCpa(r.t.cpa, r.c)}" title="custo por ${r.c.plat === "google" ? "conversão" : "conversa"} vs. meta" aria-hidden="true"></span><span class="sr-only">${esc(NIVEL_CPA[pontoCpa(r.t.cpa, r.c)])}: </span><div class="nm-t"><span>${esc(r.c.nome)}</span><small><span class="chip chip-${classePlat(r.c.plat)}">${nomePlat(r.c.plat)}</span>${r.pausaDe !== null ? ` <span class="chip chip-neutro" title="Sem investimento desde ${esc(M.ddmm(r.pausaDe))}">pausada · último gasto ${esc(M.ddmm(r.pausaDe))}</span>` : ""}</small></div></div></td>
      ${td("gasto", brl0(r.t.gasto))}${td("conv", esc(fmtConv(r.t.conversoes)))}${td("cpa", brl(r.t.cpa))}${td("ctr", pc(r.t.ctr, 2))}
      ${td("ag", int(r.k.agendadas))}${td("fe", int(r.k.fecharam))}${td("rec", brl0(r.k.receita))}${td("roas", fin(r.roas) ? dec(r.roas, 1) + "x" : "—")}
    </tr>`).join("")}</tbody>
    <tfoot><tr><th scope="row">Total</th>${td("gasto", brl0(T.gasto))}${td("conv", esc(fmtConv(T.conversoes)))}${td("cpa", brl(T.cpa))}${td("ctr", pc(T.ctr, 2))}
      ${td("ag", int(K.ag))}${td("fe", int(K.fe))}${td("rec", brl0(K.rec))}${td("roas", T.gasto ? dec(K.rec / T.gasto, 1) + "x" : "—")}</tr></tfoot>
  </table>` : `<p class="vazio">Nenhuma campanha com investimento nos últimos ${S.dias} dias${S.plat ? " no " + nomePlat(S.plat) : ""}.</p>`;

  // a situação vem do radar (janela recente), não da média do período — senão a
  // tabela diria "ok" para o criativo que o radar acabou de acusar
  const agora = M.avaliar(M.R), sitDe = id => agora.filter(a => a.chave === `r4|${id}` || a.chave === `r3|${id}`);
  const freqLim = (M.LIM && M.LIM.freqMax > 0) ? M.LIM.freqMax : 3;
  const cris = Object.values(M.CRI).filter(k => k.plat && (!S.plat || k.plat === S.plat)).map(k => ({ k, t: M.consolidar(M.linhasDe(de, M.R, { cri: k.id })) }))
    .filter(x => x.t.gasto > 0).sort((a, b) => b.t.gasto - a.t.gasto);
  // plano 1500c · AC-233: no Google é «conversão»; com as duas plataformas, «contato» (antes «Conversas» para tudo)
  const gCri = cris.some(x => x.k.plat === "google"), mCri = cris.some(x => x.k.plat !== "google");
  const rotConvCri = gCri && !mCri ? ["Conversões", "Custo/conversão"] : gCri ? ["Conversas e conversões", "Custo/contato"] : ["Conversas", "Custo/conversa"];
  $("#tbl-criativos").innerHTML = cris.length ? `<table>
    <caption class="sr-only">Criativos nos últimos ${S.dias} dias</caption>
    <thead><tr><th scope="col">Criativo</th><th scope="col">Investido</th><th scope="col">Impressões</th><th scope="col">CTR</th><th scope="col" title="Frequência: quantas vezes, em média, a mesma pessoa viu o anúncio">Freq.</th><th scope="col">${esc(rotConvCri[0])}</th><th scope="col">${esc(rotConvCri[1])}</th><th scope="col">Situação agora</th></tr></thead>
    <tbody>${cris.map(({ k, t }, n) => {
      const s = sitDe(k.id), a4 = s.find(a => a.regra.id === "r4"), a3 = s.find(a => a.regra.id === "r3");
      const sit = (a4 ? `<span class="chip chip-bad" title="frequência nos últimos ${a4.regra.janela} dias">fadiga · ${dec(a4.valor, 1)} em ${a4.regra.janela}d</span> ` : "")
        + (a3 ? `<span class="chip chip-warn" title="CTR nos últimos ${a3.regra.janela} dias">CTR ${pc(a3.valor, 2)} em ${a3.regra.janela}d</span>` : "")
        || `<span class="chip chip-ok">dentro dos limites</span>`;   // plano 1500c · AC-234: «ok» dizia pouco
      // plano 1000b · AB-157: a barra enche em limite × 1,33 (o limite é configurável, cfg.radar.freqMax) e a marca (a 75%) é o limite
      const fq = fin(t.freq)
        ? `<span class="fq" title="limite de ${dec(freqLim, 1)} vezes"><span class="fq-bar${a4 ? " alto" : ""}"><i style="--w:${Math.min(100, t.freq / (freqLim * 1.33) * 100)}%"></i><b></b></span>${dec(t.freq, 1)}</span>`
        : "—";
      const camp = M.CAMP[k.camp];
      return `<tr style="--i:${n}">
        <td><div class="nm-t"><span>${esc(k.nome)}</span><small>${esc(camp ? camp.curto : "")} · <span class="chip chip-${classePlat(k.plat)}">${nomePlat(k.plat)}</span></small></div></td>
        <td>${brl0(t.gasto)}</td><td>${int(t.impressoes)}</td><td>${pc(t.ctr, 2)}</td><td>${fq}</td><td>${esc(fmtConv(t.conversoes))}</td><td>${brl(t.cpa)}</td><td class="sit"><span class="sit-chips">${sit}</span></td>
      </tr>`;
    }).join("")}</tbody>
  </table>` : `<p class="vazio">Nenhum criativo com investimento no período.</p>`;
}

/* ============================================================
   5. PACIENTES — kanban, tabela de origem, donut, gaveta
   ============================================================ */
// plano 1000b · AB-213/AB-164: rótulos das colunas pelo vocabulário da vertical e cores pelos tokens --etapa-* (colunasKanban, bloco PURO)
const colsK = () => colunasKanban(M ? M.VOC : { agendada: ["avaliação agendada"], compareceu: ["compareceu"] }, M ? M.vertical : "odonto");
const COLS_K = colunasKanban({ agendada: ["avaliação agendada"], compareceu: ["compareceu"] });   // só as chaves e a ordem (iguais em toda vertical)
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
  // a campanha ganha uma linha só dela, na largura inteira da ficha (nome inteiro no title); a plataforma
  // vira um ponto de cor (com texto para leitor de tela). "Faltou" e o valor sobem para a linha do nome.
  const origem = L.plat
    ? `<span class="chip chip-camp" title="${esc(camp ? camp.nome : "")}"><i class="pt pt-${classePlat(L.plat)}" aria-hidden="true"></i><span class="sr-only">${nomePlat(L.plat)}: </span>${esc(camp ? camp.curto : "")}</span>`
    : `<span class="chip chip-neutro">${esc(camp ? camp.curto : "Sem anúncio")}</span>`;
  // em "Não seguiu" a etapa já está escrita na linha de baixo (faltou / não agendou / não fechou): só marca a falta
  const etq = col === "parou" && e === "faltou" ? `<span class="chip chip-bad">${NOME_ETAPA[e]}</span>` : "";
  // fechou sem valor e sem tabela: a ficha diz "sem valor" em vez de inventar R$ 0
  const vd = e === "fechou" ? M.valorDe(L) : null;
  const val = vd ? `<span class="val">${vd.semValor ? "sem valor" : brl0(vd.valor)}</span>` : "";
  return `<button type="button" class="lead${S.destacar.has(String(L.id)) ? " destaque" : ""}" data-lead="${esc(String(L.id))}" data-col="${col}" style="--i:${n}" aria-haspopup="dialog" aria-describedby="k-dica">
    <span class="av" style="--c:${AVC[hash(L.nome) % AVC.length]}" aria-hidden="true">${esc(ini)}</span>
    <span class="l-txt"><span class="l-nome"><strong>${esc(OCULTAR_NOMES ? nomeExibido(L.nome, true) : L.nome)}</strong>${etq}${val}</span><span class="lp${q.atraso ? " atrasada" : ""}">${esc(L.servico)} · ${esc(q.txt)}</span></span>
    <span class="chips">${origem}</span></button>`;
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
  const V = M.VOC;
  $("#kanban").innerHTML = colsK().map(([k, l, cor]) => {
    const tot = g[k].length, ver = Math.min(tot, S.kVer[k] || K_MAX), resto = tot - ver;
    return `<section class="kcol" data-col="${k}" aria-label="${esc(l)}: ${tot} ${esc(tot === 1 ? V.pessoa[0] : V.pessoa[1])}">
      <header class="kcol-h"><span><i class="kd" style="background:${cor}"></i>${esc(l)}</span><b>${tot}</b></header>
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
  // plano 1000b · AB-140: cabeçalhos, rosca e legenda com o vocabulário da vertical (antes «Pacientes/Tratamentos» fixos)
  const V = M.VOC;
  const { de } = janela(), rows = linhasCamp().sort((a, b) => b.k.receita - a.k.receita);
  // anúncio sem campanha identificada (e campanha sem gasto no período): sem custo, mas o paciente existe
  const comRow = new Set(rows.map(r => r.c.id));
  const semGasto = campanhas().filter(c => !comRow.has(c.id))
    .map(c => ({ c, k: M.crmTot(de, M.R, { camp: c.id }) }))
    .filter(x => x.k.conversas || x.k.agendadas || x.k.fecharam);
  const orgs = S.plat ? [] : Object.values(M.CAMP).filter(c => !c.plat)
    .map(c => ({ c, k: M.crmTot(de, M.R, { camp: c.id, organicos: true }) }))
    .filter(x => x.k.conversas || x.k.agendadas || x.k.fecharam);
  $("#tbl-origem").innerHTML = rows.length || semGasto.length || orgs.length ? `<table>
    <caption class="sr-only">Resultado de cada campanha no consultório, últimos ${S.dias} dias</caption>
    <thead><tr><th scope="col">Origem</th><th scope="col">Conversas</th><th scope="col">Agendaram</th><th scope="col">Vieram</th><th scope="col">${esc(capt(V.novo[1]))}</th><th scope="col">${esc(V.receita)}</th><th scope="col">Custo/${esc(V.pessoa[0])}</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr style="--i:${i}">
      <td><div class="nm-t"><span>${esc(r.c.nome)}</span><small><span class="chip chip-${classePlat(r.c.plat)}">${nomePlat(r.c.plat)}</span></small></div></td>
      <td>${r.k.conversas}</td><td>${r.k.agendadas}</td><td>${r.k.compareceram}</td><td>${r.k.fecharam}</td><td>${brl0(r.k.receita)}</td><td>${brl0(r.cpp)}</td>
    </tr>`).join("")}${semGasto.map(({ c, k }, i) => `<tr style="--i:${rows.length + i}">
      <td><div class="nm-t"><span>${esc(c.nome)}</span><small><span class="chip chip-${classePlat(c.plat)}">${nomePlat(c.plat)}</span>${c.semCampanha ? ` <span class="chip chip-neutro" title="o anúncio ainda não apareceu na leitura do Meta/Google (ou chegou sem identificação)">sem campanha</span>` : ""}</small></div></td>
      <td>${k.conversas}</td><td>${k.agendadas}</td><td>${k.compareceram}</td><td>${k.fecharam}</td><td>${brl0(k.receita)}</td><td>—</td>
    </tr>`).join("")}${orgs.map(({ c, k }, i) => `<tr class="org" style="--i:${rows.length + semGasto.length + i}">
      <td><div class="nm-t"><span>${esc(c.nome)}</span><small><span class="chip chip-neutro">sem anúncio</span></small></div></td>
      <td>${k.conversas}</td><td>${k.agendadas}</td><td>${k.compareceram}</td><td>${k.fecharam}</td><td>${brl0(k.receita)}</td><td>—</td>
    </tr>`).join("")}</tbody>
  </table>` : `<p class="vazio">Nenhuma conversa registrada nos últimos ${S.dias} dias.</p>`;

  // tratamentos fechados (donut)
  const c = M.crmTot(de, M.R, { plat: S.plat });
  const segs = Object.entries(c.serv).filter(([, s]) => s.v > 0).sort((a, b) => b[1].v - a[1].v).map(([nome, s], n) => ({ nome, ...s, cor: corServ(nome, n) }));
  const nota = notaReceita(c, V.servico);   // plano 1000b · AB-151
  $("#donut-sub").textContent = `${capt(V.pessoa[1])} dos anúncios, últimos ${S.dias} dias${nota ? ` · ${nota}` : ""}.`;
  if (!c.receita) {
    $("#donut").innerHTML = `<p class="vazio">${c.semValor > 0
      ? `${esc(nota)}. Abra a ficha e registre o valor para ele entrar na conta.` : "Nenhum fechamento no período."}</p>`;
    return;
  }
  let acc = 0;
  const arcs = segs.map(s => {
    const p = s.v / c.receita * 100, gap = segs.length > 1 ? .8 : 0;
    const d = `<circle class="seg-c" cx="21" cy="21" r="15.915" stroke="${s.cor}" stroke-dasharray="${Math.max(.1, p - gap).toFixed(2)} ${(100 - p + gap).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"/>`;
    acc += p; return d;
  }).join("");
  $("#donut").innerHTML = `
    <div class="donut"><svg viewBox="0 0 42 42" aria-hidden="true"><circle class="donut-trilha" cx="21" cy="21" r="15.915"/>${arcs}</svg>
      <div class="ctr"><b data-n="${c.receita}" data-f="brl0" data-k="donut">${brl0(c.receita)}</b><small>${c.fecharam} ${esc(c.fecharam === 1 ? V.pessoa[0] : V.pessoa[1])}</small></div></div>
    <ul class="dleg">${segs.map(s => `<li><i style="background:${s.cor}"></i>${esc(s.nome)} <span>${s.n} · ${brl0(s.v)}</span></li>`).join("")}</ul>`;
}

/* ---------- gaveta do paciente ---------- */
const gv = { lead: null, volta: null };
const gvEtapa = () => { const r = $('input[name="lf-etapa"]:checked'); return r ? r.value : "nova"; };
const hojeDados = () => (S.dados && S.dados.hoje) || hojeSP();

function opcoesOrigem() {
  // o balde "sem campanha identificada" não é uma campanha que se escolha: quem está nele fica travado na origem
  const camps = Object.values(M.CAMP).filter(c => c.plat && !c.semCampanha).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
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
    { t: "Fechou", q: fechou ? (M.valorDe(L).semValor ? "sem valor" : brl0(M.valorLead(L))) : null, on: fechou, v: fechou ? L.servico : "" },
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
  $("#gv-titulo").textContent = L ? (OCULTAR_NOMES ? nomeExibido(L.nome, true) : L.nome) : "Novo paciente";   // AC-245
  $("#gv-eyebrow").textContent = L ? `Conversa de ${M.dataBR(L.i)}` : "Cadastro manual";
  $("#gv-demo").hidden = !S.demo;
  $("#gv-erro").textContent = ""; $("#gv-erro").classList.remove("nota");
  $("#gv-fita").innerHTML = fitaHtml(L);
  $("#gv-fita").hidden = !L;

  // quem veio de anúncio identificado pelo WhatsApp não muda de origem na mão: vira o cartão de referência do anúncio
  // (vale também para o anúncio ainda sem campanha identificada — senão qualquer edição apagaria a origem)
  const travado = !!(L && L.plat && (S.demo || b.anuncio_ext || (M.CAMP[L.camp] && M.CAMP[L.camp].semCampanha)));
  if (travado) {
    const k = L.cri && M.CRI[L.cri], c = M.CAMP[L.camp];
    $("#gv-origem-info").innerHTML = `<span class="ref-mini ref-${classePlat(L.plat)}" aria-hidden="true"><svg><use href="#ic-wa"/></svg></span>
      <span class="ref-q"><small>Anúncio · ${nomePlat(L.plat)}</small><b>${esc(k ? k.nome : c && c.semCampanha ? "anúncio ainda não identificado" : "anúncio da campanha")}</b><span>${esc(c ? c.nome : "—")}</span></span>`;
  } else {
    $("#lf-origem").innerHTML = opcoesOrigem();
    const v = L && L.plat && M.CAMP[L.camp] ? "camp:" + L.camp : (b.origem && b.origem !== "anuncio" ? b.origem : (L && L.origem && L.origem !== "anuncio" ? L.origem : L ? "whatsapp" : "indicacao"));
    $("#lf-origem").value = v;
    if ($("#lf-origem").value !== v) $("#lf-origem").value = "manual";
  }
  $("#gv-origem-info").hidden = !travado;
  $("#lf-box-origem").hidden = travado;

  // sem tabela de valores configurada, a lista ainda oferece o serviço padrão da vertical
  const servs = Object.keys(M.CFG.ticket), padrao = M.VOC.servicoPadrao;
  const sv = L ? L.servico : (servs.includes(padrao) ? padrao : servs[0] || padrao);
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
    // quem abriu pode ter sumido (ex.: o campo da paleta Ctrl+K, já fechada): cai na ficha ou em "Novo paciente"
    const invisivel = el => (el.checkVisibility ? !el.checkVisibility() : el.offsetParent === null);
    if (!v || v === document.body || !document.contains(v) || invisivel(v)) v = gv.lead ? $(`[data-lead="${CSS.escape(String(gv.lead.id))}"]`) : $("#btn-novo-lead");
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
    toast(`Movido: ${nomeTela(L.nome)} → ${rotEt} · só nesta tela`, "nota", { rotulo: "Desfazer", fn: () => { const f = fotoLead(L); restaurarLead(L, antes); depoisDeMover(L, f); } });
    return true;
  }
  const b = L.bruto || {}, hoje = hojeDados(), p = { id: L.id, etapa };
  if (etapa === "nova" || etapa === "perdida") { if (b.data_agenda || b.data_consulta) { p.data_agenda = ""; p.data_consulta = ""; } }
  else if (COM_DATA.has(etapa)) p.data_consulta = b.data_consulta || hoje;
  const volta = { id: L.id, etapa: b.etapa || antes.etapa, data_agenda: b.data_agenda || "", data_consulta: b.data_consulta || "" };
  try { await api.leadSalvar(S.token, S.clienteId, p); }
  catch (err) { if (err.codigo !== "sessao_invalida") toast(api.mensagemErro(err), "erro"); return false; }
  toast(`Movido: ${nomeTela(L.nome)} → ${rotEt}`, "ok", { rotulo: "Desfazer", fn: async () => {
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
/** "Não seguiu": um mini-menu pergunta o motivo — só os que cabem na coluna de origem (PAROU_DE). */
function menuParou(L, x, y) {
  return new Promise(res => {
    const m = $("#menu-parou"), volta = document.activeElement;
    const motivos = PAROU_DE[colunaDe(L)] || Object.keys(MOTIVOS_PAROU);
    m.innerHTML = `<p class="mp-t">${esc(nomeTela(L.nome))} não seguiu porque…</p>` +
      motivos.map(v => [v, MOTIVOS_PAROU[v]])
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
  const vd = M.valorDe(L), d = M.dataDe(M.R), ini = Math.max(0, M.R - (d.getDate() - 1));
  const soma = M.crmTot(ini, M.R).receita, mes = MESES[d.getMonth()];
  const el = $("#celebra");
  el.innerHTML = `<p class="cb-t">Paciente novo!</p><p class="cb-l">${esc(nomeTela(L.nome))} fechou ${esc(L.servico)}${vd.semValor ? "" : ` · <b>${brl0(vd.valor)}</b>`}</p>` +
    (soma > 0 ? `<p class="cb-s">${mes.charAt(0).toUpperCase() + mes.slice(1)} agora soma <b>${brl0(soma)}</b></p>` : "");
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
/** A condição de cada regra em linguagem de consultório (a clínica e a demo); o gestor lê a técnica. */
function condLeiga(r) {
  const lim = r.limite(), janela = `olhando ${r.janela} dias`, meta = r.plat ? " · anúncios do Instagram e Facebook" : "";
  if (r.metrica === "cpa") return `Avisa quando cada conversa passa de ${brl(lim)} (${janela}, por campanha)`;
  if (r.metrica === "conversoes") return `Avisa quando um anúncio gasta mais de ${brl0(r.minGasto || 0)} em ${r.janela} dias sem nenhuma conversa`;
  // plano 1500c · AC-235/AC-236: 0,9% é «9 em cada 1.000» (antes «1 em cada 100»); frequência 2,5 não vira «3»
  if (r.metrica === "ctr") return `Avisa quando ${ctrLeigo(lim)} que viram tocaram no anúncio (${janela}${r.minImpr ? `, a partir de ${r.minImpr} vezes na tela` : ""}${meta})`;
  if (r.metrica === "freq") return `Avisa quando a mesma pessoa já viu o anúncio mais de ${vezesLeigo(lim)} vezes (${janela}${meta})`;
  return `${ROT_MET[r.metrica] || r.metrica} ${OPS[r.op]} ${M.FMT_MET[r.metrica](lim)}`;
}
/** Depois de "CTR de 0,83%" (texto do núcleo), a clínica lê a conta: "(de cada 100 que viram, menos de 1 tocou)". */
function traducaoCTR(msg, tag = "span") {
  if (gestor()) return "";
  const m = /CTR de (\d+(?:,\d+)?)%/.exec(String(msg || ""));
  if (!m) return "";
  const v = parseFloat(m[1].replace(",", "."));
  if (!fin(v)) return "";
  const t = `(de cada 100 que viram, ${v < 1 ? "menos de 1 tocou" : `${Math.round(v)} ${Math.round(v) === 1 ? "tocou" : "tocaram"}`})`;
  return tag === "p" ? `<p class="al-trad">${t}</p>` : ` <span class="al-trad">${t}</span>`;
}
const SEV_NOME = { critico: "crítico", alerta: "alerta", info: "informativo" };
let radarCtl = null, radarChega = false;   // varredura em canvas (cinema.js), se houver
// plano 1500c · AC-237: a hora de São Paulo (antes a do aparelho — gestor viajando via «07:00» às 11h de Brasília)
const horaCheia = () => `${FMT_HORA.format(new Date()).slice(0, 2)}:00`;
const ultimoSync = () => ultimaLeitura((S.dados && S.dados.integracoes) || []);   // plano 1000b · AB-076: pelo maior instante

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
  const s = statusEnvio(x, Date.now());   // plano 1000b · AB-199: «sem confirmação de entrega» depois de 24 h
  const p0 = x.criado_em ? { l: tipo === "alerta" ? "registrado" : "gerado", q: quandoSP(x.criado_em), c: "ok" }
    : x.referencia ? { l: "referente a", q: dataIso(x.referencia), c: "ok" } : null;
  const passos = [p0,
    { l: "enviado", q: x.enviado_em ? quandoSP(x.enviado_em) : s.k === "erro" ? "não saiu" : "ainda não", c: x.enviado_em ? "ok" : s.k === "erro" ? "erro" : "falta" },
    { l: "entregue", q: x.entregue_em ? quandoSP(x.entregue_em) : s.k === "erro" && x.enviado_em ? "não chegou" : "sem confirmação ainda",
      c: x.entregue_em ? "ok" : s.k === "erro" && x.enviado_em ? "erro" : "falta" },
  ].filter(Boolean);
  return `<ol class="env-tempo">${passos.map(p => `<li class="et-${p.c}"><b>${p.l}</b><span>${esc(p.q)}</span></li>`).join("")}</ol>` +
    (s.erro ? `<p class="env-motivo" title="${esc(s.erroOriginal || "")}">${esc(s.erro)}</p>` : "");   // AB-080: o texto da Meta fica no title
}
let envN = 0;
/** Item de lista com um envio: título + status (✓/✓✓/!) que abre a linha do tempo. */
function itemEnvio({ titulo, sub = "", x, tipo, antes = "", depois = "", cls = "" }) {
  const id = `env-${++envN}`, s = statusEnvio(x, Date.now());   // plano 1000b · AB-199
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
  // a data já está ao lado ("Números até ontem, DD/MM"): a pílula da demo diz só o que é
  if (demoCalma) { nivel = "demo"; txt = "Demonstração"; }
  else if (nivel === "erro") {
    const nomes = e.erros.map(x => nomePlat(x.canal));
    txt = `${nomes.join(" e ")} ${nomes.length > 1 ? "desconectados" : "desconectado"}`;
  } else if (nivel === "atrasado") txt = "Leitura atrasada";
  else if (nivel === "parcial") txt = `Leitura parcial · ${e.canais.filter(c => c.estado === "parcial").map(c => nomePlat(c.canal)).join(" e ")}`;   // AD-208
  else if (nivel === "aguardando") txt = "Aguardando a 1ª leitura";
  else if (nivel === "ok") txt = `Atualizado ${minutosAtras(e.ultimo)}`;
  pill.hidden = !temApp || nivel === "nenhuma";
  pill.className = `sync-pill sp-${nivel}`;
  $("#sync-txt").textContent = txt;
  // faixa de conexão caída: aparece em todas as abas, com o próximo passo
  const erros = S.demo && !SIMULAR_INTEG ? [] : e.erros;
  faixa.hidden = !temApp || !erros.length;
  if (erros.length) {
    faixa.innerHTML = `<svg class="fi-ic" aria-hidden="true"><use href="#ic-sinal"/></svg><p>${esc(textoQueda(erros))}</p>` +
      // plano 1000b · AB-142: «já foi avisada» só quando o aviso de conexão SAIU nas últimas 24 h (equipeAvisada); senão pede para avisar
      (!gestor() ? `<p class="fi-nota">${esc(equipeAvisada((S.dados && S.dados.alertas) || [], erros) ? "A Nexus já foi avisada e está resolvendo." : "Avise a Nexus para refazer a conexão.")}</p>`
        : S.aba === "ajustes" ? `<p class="fi-nota">Refaça a conexão no bloco Integrações, aqui em Ajustes.</p>`
        : `<button class="pill pill-ink pill-sm" type="button" data-ir="ajustes">Abrir Ajustes</button>`);
  }
  if ($("#sync-pop").hidden === false) renderSyncPop();
  // "há X min" anda sozinho (a cada 30 s; parado com a aba oculta)
  clearInterval(syncT);
  if (temApp && nivel === "ok") syncT = setInterval(() => { if (!document.hidden) renderIntegracao(); }, 30000);
}
const textoQueda = erros => erros.map(x => `A conexão com o ${nomePlat(x.canal)} caiu: os números do ${nomePlat(x.canal)} estão parados desde ${x.sync ? ddmmHora(new Date(x.sync).toISOString()) : "a última leitura"}.`).join(" ");
function renderSyncPop() {
  const e = estadoInteg(), pop = $("#sync-pop");
  // o popover pode cobrir a faixa de conexão caída: repete o recado dela no topo (nada importante some)
  const queda = !(S.demo && !SIMULAR_INTEG) && e.erros.length ? `<p class="spp-queda">${esc(textoQueda(e.erros))}</p>` : "";
  const ESTADO = { ok: "lendo normalmente", atrasado: "leitura atrasada", parcial: "leitura parcial (pode faltar parte dos números)", aguardando: "esperando a 1ª leitura", erro: "desconectado" };
  const linhas = e.canais.map(c => `<li class="spp-${c.estado}"><b>${nomePlat(c.canal)}</b><span>${c.sync ? `lida às ${FMT_HORA.format(new Date(c.sync))} (${quandoSP(new Date(c.sync).toISOString()).replace(/ às .*/, "")})` : "ainda não leu"} · ${ESTADO[c.estado]}</span></li>`).join("");
  const radarQ = S.varridoEm ? `hoje às ${S.varridoEm}` : e.ultimo ? quandoSP(new Date(e.ultimo).toISOString()) : "—";
  pop.innerHTML = `<p class="spp-h">${S.demo ? "Leitura dos anúncios (exemplo)" : "Leitura dos anúncios"}</p>` + queda +
    (linhas ? `<ul>${linhas}</ul>` : `<p class="spp-v">Nenhuma plataforma conectada.</p>`) +
    // plano 1000b · AB-155: passou de 2 h sem leitura, a linha diz desde quando está atrasada (não «em instantes»)
    `<p class="spp-v">${esc(/^leitura atrasada/.test(proximaLeitura(e.ultimo)) ? capt(proximaLeitura(e.ultimo)) : `Próxima leitura ${proximaLeitura(e.ultimo)} · de hora em hora`)}</p><p class="spp-v">Última varredura do radar: ${esc(radarQ)}</p>`;
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
  const nAtivos = atuais.length + conexoesCaidas();
  const qtd = `${nAtivos} ${nAtivos === 1 ? "alerta ativo" : "alertas ativos"}`;
  const u = ultimoSync();
  $("#scope-status").innerHTML = vazio && !S.demo ? "Sem números de anúncio ainda: o radar começa a vigiar assim que a primeira leitura chegar."
    : S.varridoEm ? `Conferido às <b>${S.varridoEm}</b> · ${qtd}.`
    : S.demo ? `Última varredura: <b>${u ? esc(quandoSP(u).replace(" às ", ", ")) : `hoje, ${horaCheia()}`}</b> · ${qtd}.`
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
    // revisão 13/10 (como o Órbita, AD-046): episódio interrompido por «Silenciar 7 dias» é «silenciado», não «resolvido»
    const silenciado = !ativo && typeof M.silenciadoAte === "function" ? M.silenciadoAte(a.chave) : null;
    const desde = (ativo ? (e.desde === M.R ? "desde ontem · continua" : `desde ${M.dMes(e.desde)} · continua`)
      : e.desde === e.ate ? `em ${M.dMes(e.desde)}` : `de ${M.dMes(e.desde)} a ${M.dMes(e.ate)}`)
      + (silenciado ? esc(` · silenciado até ${silenciado.slice(8, 10)}/${silenciado.slice(5, 7)}`) : "");
    const s = srv.get(a.chave);
    const env = s && (s.enviado_em || s.entregue_em) ? ` · <span class="al-env">aviso ${envLinha(statusEnvio(s))}</span> ${chipExemplo(s)}` : "";
    return `<li style="--i:${n + integs.length}"${ativo ? ` data-chave="${esc(a.chave)}"` : ""}><span class="sev sev-${a.sev}" role="img" aria-label="${SEV_NOME[a.sev]}">${M.ICONE[a.sev]}</span>
      <div><p class="al-t">${rotT(id)} <span class="chip ${ativo ? (a.sev === "critico" ? "chip-bad" : "chip-warn") : !silenciado ? "chip-ok" : "chip-meta"}">${ativo ? "ativo" : !silenciado ? "resolvido" : "silenciado"}</span></p>
      ${!gestor() && LEIGO_LINHA[id] ? `<p class="al-leigo">${esc(LEIGO_LINHA[id])}</p>` : ""}<p class="al-m">${esc(a.msg)}</p>${traducaoCTR(a.msg, "p")}<p class="al-d">${desde}${env}</p></div></li>`;
  }).join("");
  // plano 1000 (AD-052): conta Google sem nenhuma conversão em 30 dias — o r2 dela fica calado; o clássico agora DIZ por quê (como o Órbita)
  const htmlGoogle = !vazio && M.GOOGLE_SEM_CONVERSAO ? `<li class="al-info-google"><span class="sev sev-info" role="img" aria-label="${esc(SEV_NOME.info)}">${esc(M.ICONE.info)}</span>
      <div><p class="al-t">Google sem acompanhamento de conversões <span class="chip chip-meta">informativo</span></p>
      <p class="al-m">O Google Ads gastou nos últimos 30 dias e não registrou nenhuma conversão: o acompanhamento de conversões da conta não está ligado. Enquanto isso, «Campanha sem conversa» fica desligada para o Google.</p>
      <p class="al-d">Ligue o acompanhamento de conversões (clique no WhatsApp ou formulário) na conta do Google Ads.</p></div></li>` : "";
  // plano 1000b · AB-143: os 8 episódios mais recentes — o resto é contado em vez de sumir calado
  const htmlMais = hist.length > 8 ? `<li class="al-mais"><p class="al-d">… e mais ${int(hist.length - 8)} nos últimos 14 dias.</p></li>` : "";
  $("#alerts").innerHTML = htmlInteg + htmlGoogle + htmlHist + htmlMais || `<li class="vazio">Nenhum alerta nos últimos 14 dias.</li>`;

  const pode = S.demo || gestor();
  $("#rules").innerHTML = M.REGRAS.map(r => {
    const f = M.FMT_MET[r.metrica];
    // plano 1000 (AD-235/AD-237): r5/r6 são da conta inteira — sem métrica/limite genéricos, a condição vem escrita do núcleo
    // plano 1000 (AD-010): a r1 também traz a condição escrita (régua de cada plataforma, ou parada sem meta)
    const cond = r.descricao ? r.descricao : `${ROT_MET[r.metrica]} ${OPS[r.op]} ${f(r.limite())} · ${r.janela} dias · por ${r.nivel === "campanha" ? "campanha" : "criativo"}${r.plat ? " (Meta)" : ""}` +
      (r.minGasto ? ` · gasto mínimo ${brl0(r.minGasto)}` : "") + (r.minImpr ? ` · mín. ${r.minImpr} impressões` : "");
    const leigo = !gestor() && LEIGO[r.id];
    const nomeR = leigo ? `<span title="${esc(r.nome)}">${esc(LEIGO[r.id][1])}</span>` : esc(r.nome);
    const condR = leigo ? `<span title="${esc(cond)}">${esc(r.descricaoLeiga || condLeiga(r))}</span>` : esc(cond);
    // revisão 13/10: sem meta a r1 aparece desligada e o clique «ligava» gravando o contrário (r1 em regrasOff) — fica travada
    return `<li><div><p class="rl-t">${nomeR} <span class="chip ${r.sev === "critico" ? "chip-bad" : r.sev === "alerta" ? "chip-warn" : "chip-meta"}">${SEV_NOME[r.sev]}</span></p><p class="rl-c">${condR}</p></div>
      <button class="sw" type="button" role="switch" aria-checked="${r.ativa}" aria-label="Regra ${esc(!gestor() && LEIGO[r.id] ? LEIGO[r.id][1] : r.nome)}" data-regra="${r.id}"${!r.semMeta ? (pode ? "" : ` aria-disabled="true" aria-describedby="rl-trava" title="Só a equipe da Nexus liga ou desliga regras"`)
        : ` aria-disabled="true" aria-describedby="rl-trava-meta" data-sem-meta="1" title="${esc(SEM_META_REGRA)}"`}></button></li>`;
  }).join("");
  // plano 1000b · AB-163: o motivo do interruptor travado também em texto — #rl-trava/#rl-trava-meta (index.html) via aria-describedby
  $("#rules-nota").textContent = S.demo ? "Na demonstração, ligar e desligar regras e mexer nas metas não salva nada — é só para ver o efeito."
    : gestor() ? "Ligar ou desligar uma regra vale na hora para este cliente." : "Só a equipe da Nexus liga ou desliga regras.";

  $("#metas-demo").hidden = !S.demo;
  $("#metas-real").hidden = S.demo;
  if (S.demo) {
    $("#in-cpa").value = M.CFG.cpaAlvo; $("#out-cpa").textContent = brl(M.CFG.cpaAlvo);
    $("#in-orc").value = M.CFG.orcamento; $("#out-orc").textContent = brl0(M.CFG.orcamento);
  } else {
    // AD-001: meta/orçamento não configurados aparecem como «não definida(o)», nunca como um número padrão
    $("#metas-real").innerHTML = `<p class="metas-l"><span>Meta de custo por conversa</span><b>${M.CFG.cpaAlvo > 0 ? brl(M.CFG.cpaAlvo) : "não definida"}</b></p>` +
      `<p class="metas-l"><span>Orçamento de anúncios do mês</span><b>${M.CFG.orcamento > 0 ? brl0(M.CFG.orcamento) : "não definido"}</b></p>` +
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
      return itemEnvio({ titulo: esc(nome), sub: esc(a.mensagem || "") + traducaoCTR(a.mensagem, "span"), x: a, tipo: "alerta",
        antes: `<span class="sev sev-${sev}${a.regra === "integracao" ? " sev-ic" : ""}" role="img" aria-label="${SEV_NOME[sev]}">${ic}</span>` });
    }).join("");
  // plano 1500c · AC-238: o número no ícone não conta os informativos (ritmo) — como o Órbita (AD-045); a lista segue mostrando tudo
  atualizarBadge(atuais.filter(a => a.sev !== "info").length + conexoesCaidas());
}

/** Conexões com Meta/Google caídas agora (a regra "integracao" só o servidor conhece): contam como alerta ativo. */
const conexoesCaidas = () => (S.demo && !SIMULAR_INTEG ? 0 : estadoInteg().erros.length);
function atualizarBadge(n) {
  if (n == null) n = (M && !semAnuncios() ? M.avaliar(M.R, true).filter(a => a.sev !== "info").length : 0) + (M ? conexoesCaidas() : 0);   // AC-238
  $$("[data-badge]").forEach(b => {
    const antes = b.textContent;
    b.textContent = n; b.hidden = !n;
    // pulsa UMA vez quando o número muda (nunca em loop)
    if (ANIM && n && b._visto && antes !== String(n)) { b.classList.remove("pulsa"); void b.offsetWidth; b.classList.add("pulsa"); }
    b._visto = true;
  });
}

/** Revisão 13/10: o interruptor de uma regra parada por falta de meta não liga nada — explica o que fazer. */
const SEM_META_REGRA = "Esta regra está parada: defina a meta de custo por conversa em Ajustes de anúncios para ligá-la.";
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
    // sem hora de envio (não saiu / ainda não saiu), o balão não inventa "08:00": escreve o estado no lugar da hora
    const hr = !hora ? `${st ? `${esc(st.rotulo)} ${tiqueHtml(st)}` : ""}`
      : `${esc(hora)}${st ? ` ${tiqueHtml(st)}<span class="sr-only">${esc(st.rotulo)}</span>` : ""}`;
    el.innerHTML = `<span class="ph-day">${esc(dia)}</span><div class="bubble${REDUCE ? "" : " chega"}">${waHtml(txt)}<span class="hr">${hr}</span></div>`;
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
    const s = statusEnvio(rel, Date.now());   // plano 1000b · AB-199
    txt = rel.texto; hora = rel.enviado_em ? horaSP(rel.enviado_em) : ""; nao = s;
    const cls = { entregue: "chip-ok", enviado: "chip-neutro", erro: "chip-bad", pendente: "chip-warn", parcial: "chip-warn" }[s.k];
    // plano 1000b · AB-255: relatório que não saiu (ou saiu em parte) ganha «Enviar de novo» para o gestor — só o mais recente de cada tipo,
    // que é o que o «Fazer agora» do servidor manda (o diário de ontem e o resumo do último mês fechado)
    const ref = String(rel.referencia || "").slice(0, 10), ultMes = M.mesesDados().filter(m => m.completo).pop();
    const ehUltimo = tipo === "diario" ? ref === isoI(M.R) : !!ultMes && ref === isoI(ultMes.de);
    const reenviar = gestor() && !vedadoSuper() && !rel.exemplo && ehUltimo && (s.k === "erro" || s.k === "parcial");
    st.innerHTML = `${chipExemplo(rel)}<span class="chip ${cls}">${esc(s.rotulo)} ${tiqueHtml(s)}</span>` +
      (s.erro ? ` <span class="rel-erro" title="${esc(s.erroOriginal || "")}">${esc(s.erro)}</span>` : "") + (rel.leitura_ia ? ` <span class="chip chip-ia">leitura por IA</span>` : "") +
      (reenviar ? ` <button class="link-b" type="button" data-reenviar="${tipo === "mensal" ? "mensal" : "diario"}">Enviar de novo</button>` : "");
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
  // relatório que não saiu não "chega" na tela bloqueada: vai direto para o balão com o "!"
  const naoSaiu = !!nao && (nao.k === "erro" || nao.k === "pendente");
  if (FX && ANIM && col && !col.classList.contains("em-cena") && !naoSaiu) {
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
  const mesSel = M.mesesDados().find(x => isoI(x.de) === $("#sel-mes").value);
  $("#btn-folha").hidden = !mesSel || semAnuncios() || !mesTemNumeros(mesSel);

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

  const todosRel = ((S.dados && S.dados.relatorios) || []).slice();
  const lista = todosRel
    .sort((a, b) => String(b.referencia).localeCompare(String(a.referencia)) || (a.tipo === "mensal" ? -1 : 1)).slice(0, 12);
  // plano 1000b · AB-053: a lista mostra os 12 mais recentes — e diz quando há mais (antes cortava calada)
  const corteRel = notaCorte(lista.length, todosRel.length);
  $("#rel-lista").innerHTML = !lista.length
    ? `<li class="vazio">Nenhum relatório enviado ainda. O primeiro diário sai às 8h do dia seguinte à primeira leitura dos anúncios.</li>`
    : lista.map(r => {
      const ref = String(r.referencia).slice(0, 10);
      const tit = r.tipo === "mensal" ? `Resumo de ${MESES[+ref.slice(5, 7) - 1]} de ${ref.slice(0, 4)}` : `Diário de ${dataIso(ref)}`;
      return itemEnvio({ titulo: `${esc(tit)}${r.leitura_ia ? ` <span class="chip chip-ia">IA</span>` : ""}`, x: r, tipo: "relatorio",
        cls: r.tipo === "mensal" ? "env-mensal" : "",
        depois: `<button class="pill pill-ghost pill-sm" type="button" data-ver-rel="${esc(r.tipo)}|${esc(ref)}" aria-label="Ver ${esc(tit)} no celular">Ver</button>` });
    }).join("") + (corteRel ? `<li class="rel-corte nota-sm">${esc(corteRel)}</li>` : "");
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
const REGRAS_NOMES = [["r1", "Custo por conversa alto"], ["r2", "Campanha sem conversa"], ["r3", "Criativo com CTR baixo"], ["r4", "Fadiga de criativo"],
  ["r5", "Investimento parou de repente"], ["r6", "CRM parou de receber as conversas do Meta"],
  ["ritmo", "Ritmo do orçamento"]];   // plano 1000 · plano 1000b · AB-010: o «ritmo» também (desligado no Órbita não religa ao salvar aqui)

/** Configuração da Nexus e «Fazer agora» são só do super: nx_sessao passa a dizer `super`; sem o campo, o
    so_plataforma do nx_config_ver denuncia um gestor de revenda (antes o cartão ficava na tela sempre falhando). */
const vedadoSuper = () => !!(S.conta && S.conta.super === false) || !!(S.aj.config && S.aj.config.erro && S.aj.config.erro.codigo === "so_plataforma");
function aplicarVedados() {
  const v = vedadoSuper();
  $("#card-config").hidden = v;
  $("#card-exec").hidden = v;
}

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
  else aplicarVedados();
  atualizarBadgeContas();
}

const linhaTicket = (s = "", v = "") => `<div class="tk-row">
  <input type="text" aria-label="Tratamento" value="${esc(s)}" placeholder="Tratamento" data-tk-s>
  <input type="text" aria-label="Valor de ${esc(s || "tratamento")} em reais" value="${esc(numCampo(v))}" inputmode="decimal" autocomplete="off" placeholder="R$" data-tk-v>
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
      <label class="campo"><span>Custo por conversa (R$)</span><input type="text" id="cl-cpa" inputmode="decimal" autocomplete="off" value="${esc(numCampo(cfg.cpaAlvo))}" placeholder="sem meta"></label>
      <label class="campo"><span>Orçamento do mês (R$)</span><input type="text" id="cl-orc" inputmode="decimal" autocomplete="off" value="${esc(numCampo(cfg.orcamento))}" placeholder="não definido"></label>
      <label class="campo"><span>Gestão mensal (R$)</span><input type="text" id="cl-fee" inputmode="decimal" autocomplete="off" value="${esc(numCampo(cfg.fee))}"></label>
    </div>
    <div class="form-2">
      <label class="campo"><span>Custo por conversão do Google (R$)</span><input type="text" id="cl-cpag" inputmode="decimal" autocomplete="off" value="${esc(numCampo(cfg.cpaAlvoGoogle))}" placeholder="sem meta (o Google fica fora do alerta)"><small>A conversão de pesquisa costuma custar 2 a 3 vezes a conversa do Meta: meta própria.</small></label>
      <p class="campo nota-sm">Limites do radar (CTR, frequência, gasto mínimo), metas por campanha e endereço do painel: <a href="${esc(ORBITA_URL)}#/config/anuncios" target="_blank" rel="noopener">ajustar no Órbita</a>.</p>
    </div>
    <h3>Valor de cada tratamento</h3>
    <p class="nota-sm">Estima o resultado quando a clínica não informa o valor fechado — e só para os tratamentos desta lista. Sem a lista, entra na conta apenas o valor informado em cada ficha.</p>
    <div class="tickets" id="cl-tickets">${Object.entries(cfg.ticket).map(([s, v]) => linhaTicket(s, v)).join("")}</div>
    <p><button class="link-b" type="button" id="cl-tk-add">+ tratamento</button></p>
    <h3>WhatsApp</h3>
    <div class="form-2">
      <label class="campo"><span>Gestor (alertas e diário)</span><textarea id="cl-wagestor" rows="2" placeholder="5512999998888">${esc(lista(cfg.waGestor))}</textarea><small>Um número por linha, com DDD.</small></label>
      <label class="campo"><span>Clínica (resumo do mês)</span><textarea id="cl-wacliente" rows="2" placeholder="5512997552370">${esc(lista(cfg.waCliente))}</textarea><small>Um número por linha, com DDD.</small></label>
    </div>
    <div class="form-2">
      <label class="campo"><span>ID do número da clínica (Cloud API)</span><input type="text" id="cl-waphone" inputmode="numeric" spellcheck="false" autocomplete="off" placeholder="${novo ? "phone_number_id" : "em branco = mantém o atual"}"><small>Liga as conversas que chegam pelo webhook a este cliente.</small></label>
      <label class="campo"><span>Assinatura do resumo</span><input type="text" id="cl-assinatura" value="${esc(cfg.assinatura)}" placeholder="ex.: Equipe Nexus · gestão de tráfego"><small>Em branco: o resumo sai sem assinatura.</small></label>
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
  // plano 1500c · AC-275: o mesmo leitor do aviso (valorMeta) — vírgula, milhar com ponto e «R$»
  const num = (sel, pad) => { const v = valorMeta($(sel).value); return v.ok && v.valor != null ? v.valor : pad; };
  // plano 1000b · AB-147: meta, orçamento ou gestão negativos (ou texto) param o salvamento com aviso — antes −15 apagava a meta calado
  for (const [sel, rotulo] of [["#cl-cpa", "Custo por conversa"], ["#cl-orc", "Orçamento do mês"], ["#cl-fee", "Gestão mensal"], ["#cl-cpag", "Custo por conversão do Google"]]) {
    const v = valorMeta($(sel).value);
    if (!v.ok) { $(sel).focus(); return avisoForm(st, `${rotulo}: ${v.erro}.`, true); }
  }
  // plano 1000b · AB-144: WhatsApp com DDD (10 a 13 dígitos) — número curto ou longo demais avisa em vez de sumir ao salvar
  const waG = numerosWa($("#cl-wagestor").value), waC = numerosWa($("#cl-wacliente").value);
  if (waG.invalidos.length || waC.invalidos.length) {
    const [sel, inv] = waG.invalidos.length ? ["#cl-wagestor", waG.invalidos] : ["#cl-wacliente", waC.invalidos];
    $(sel).focus();
    return avisoForm(st, `WhatsApp «${inv[0]}» inválido: use DDD + número (ex.: 12 99999-8888).`, true);
  }
  const ticket = {};
  // plano 1500c · AC-239: valor sem o nome do serviço avisa (antes sumia calado ao salvar)
  const tkLinhas = $$("#cl-tickets .tk-row").map(r => [$("[data-tk-s]", r).value, $("[data-tk-v]", r).value]);
  if (ticketsSemNome(tkLinhas)) {
    const r = $$("#cl-tickets .tk-row").find(x => !$("[data-tk-s]", x).value.trim() && $("[data-tk-v]", x).value.trim());
    if (r) $("[data-tk-s]", r).focus();
    return avisoForm(st, `Dê um nome ao ${M ? M.VOC.servico : "serviço"} que tem valor (ou apague a linha).`, true);
  }
  tkLinhas.forEach(([s0, v0]) => {
    const s = String(s0).trim(), v = valorMeta(v0);
    if (s && v.ok && v.valor != null) ticket[s] = v.valor;
  });
  const cfgAntes = cfgCom((c && !novo && c.cfg) || {});
  const cfg = {
    nomeCurto: $("#cl-curto").value.trim(),
    cpaAlvo: num("#cl-cpa", CFG_PADRAO.cpaAlvo), orcamento: num("#cl-orc", CFG_PADRAO.orcamento), fee: num("#cl-fee", CFG_PADRAO.fee),
    cpaAlvoGoogle: num("#cl-cpag", null),   // plano 1500c · AC-240: a meta própria do Google também pelo clássico
    ticket, waGestor: waG.ok, waCliente: waC.ok,
    // plano 1000b · AB-022: salva o que foi digitado (vazio = resumo sem assinatura); nada de repor «Equipe Nexus» por conta própria
    assinatura: $("#cl-assinatura").value.trim(),
    // plano 1000b · AB-010/AB-231: ids que a tela não mostra continuam em regrasOff (antes o «ritmo» desligado no Órbita era apagado)
    regrasOff: regrasOffDoForm(cfgAntes.regrasOff, Object.fromEntries($$("#form-cliente [data-rg]").map(b => [b.dataset.rg, b.getAttribute("aria-checked") === "true"]))),
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
  // plano 1500c · AC-241: o status cru («erro — invalid_grant…») vira frase com o que fazer; o técnico fica no title
  const ex = explicarStatusInteg(st.status);
  const status = !st.canal ? "Ainda não configurada."
    : st.ultimo_sync ? `Última leitura ${quandoSP(st.ultimo_sync)}${ex.texto ? " · " + ex.texto : ""}` : (ex.texto || "Ainda não leu os anúncios.");
  const cls = /^erro/i.test(st.status || "") ? " erro" : /^ok/i.test(st.status || "") ? " ok" : "";
  return `<form class="integ" data-canal="${canal}" novalidate>
    <div class="integ-h"><h3>${d.nome}</h3><span class="sw-l"><span id="ig-${canal}-l">Ligada</span><button class="sw" type="button" role="switch" data-ig-ativo aria-checked="${!!st.ativo}" aria-labelledby="ig-${canal}-l"></button></span></div>
    <p class="integ-st${cls}"${!ex.tecnico ? "" : ` title="${esc(ex.tecnico)}"`}>${esc(status)}</p>
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
  // plano 1000b · AB-145: confere o formato antes de mandar (ID com espaço, token cortado) — o erro antes só aparecia na próxima leitura
  for (const i of $$("input[name]", form)) {
    const msg = erroCredencial(i.name, i.value);
    if (msg) { i.focus(); return avisoForm(st, msg, true); }
  }
  const ativo = $("[data-ig-ativo]", form).getAttribute("aria-checked") === "true";
  // plano 1000b · AB-146: desligar uma integração que estava ligada pergunta antes (como o Órbita, AD-085)
  const antes = (Array.isArray(S.aj.integ) ? S.aj.integ : []).find(i => i.canal === canal) || {};
  if (antes.ativo && !ativo) {
    const nomeC = (CANAIS[canal] || {}).curto || canal;
    if (!(await confirmar(`Desligar a integração do ${nomeC}? As leituras de hora em hora e o radar do ${nomeC} param até você ligar de novo. Os números já lidos continuam no painel.`, { ok: "Desligar" }))) return;   // plano 1500c · AC-242
  }
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
    const desde = Date.now();
    const r = await api.executar(S.token, tarefa, corpo);
    const h = FMT_HORA.format(new Date());
    avisoForm(st, tipo === "ciclo"
      ? `Pedido enviado às ${h}. Os números novos aparecem em 1 ou 2 minutos — o painel recarrega sozinho. Em 30 s confiro se o servidor começou.`
      : `Pedido enviado às ${h}. O ${tipo === "mensal" ? "resumo do mês" : "relatório do dia"} chega no WhatsApp dos destinos em instantes. Em 30 s confiro se o servidor começou.`, false);
    clearTimeout(S.aj.tRecarga);
    S.aj.tRecarga = setTimeout(() => { if (S.clienteId === cid) carregarDados({ entrada: false }); }, tipo === "ciclo" ? 90000 : 45000);
    // retorno real: 30 s depois, lê as últimas execuções do servidor e diz se o pedido rodou (ou se nada aconteceu)
    clearTimeout(S.aj.tConfere);
    S.aj.tConfere = setTimeout(() => conferirPedido(tarefa, desde, r && r.pedido), 30000);
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, api.mensagemErro(err), true);
  } finally { ocupado(btn, false); }
}
async function conferirPedido(tarefa, desde, pedido) {
  const st = $("#exec-status");
  if (!st || S.aba !== "ajustes") return;
  try {
    const c = await api.configVer(S.token);
    if (c && typeof c === "object" && !Array.isArray(c)) { S.aj.config = c; renderExecucoes(c); }
    const r = execucaoDoPedido(c && c.ultimas_execucoes, tarefa, desde);
    avisoForm(st, `${nomeTarefa(tarefa)}${pedido ? ` (pedido ${pedido})` : ""}: ${r.rotulo}`, r.k === "erro" || r.k === "nada");
  } catch (err) {
    if (err.codigo !== "sessao_invalida") avisoForm(st, `Não consegui conferir no servidor agora (${api.mensagemErro(err)}).`, true);
  }
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

/** Só as contas da plataforma (gestor da Nexus e "clínica" do clássico). Usuário do Órbita (convidado pelo cliente)
    tem papel e departamentos que esta tela não conhece: quando o servidor marcar `origem: 'orbita'`, ele sai daqui
    e o cartão aponta para Admin → Clientes → Usuários. */
const contaDaPlataforma = c => !c || !c.origem || c.origem !== "orbita";
function renderContas() {
  const ul = $("#aj-contas"), L = S.aj.contas;
  if (L == null) { ul.innerHTML = `<li>${carregandoHtml("Lendo as contas…")}</li>`; return; }
  if (L.erro) { ul.innerHTML = `<li class="vazio">${esc(api.mensagemErro(L.erro))}</li>`; return; }
  const lista = L.filter(contaDaPlataforma), orbita = L.length - lista.length;
  const nota = $("#contas-orbita");
  if (nota) nota.textContent = orbita ? `${orbita === 1 ? "1 usuário do Órbita não aparece" : `${orbita} usuários do Órbita não aparecem`} aqui: papel e departamentos deles se ajustam em Admin → Clientes → Usuários.` : "";
  if (!lista.length) { ul.innerHTML = `<li class="vazio">Nenhuma conta ainda.</li>`; return; }
  ul.innerHTML = lista.slice().sort((a, b) => (!!a.aprovado - !!b.aprovado) || String(b.criado_em).localeCompare(String(a.criado_em))).map(htmlConta).join("");
}

function atualizarBadgeContas() {
  const n = Array.isArray(S.aj.contas) ? S.aj.contas.filter(c => !c.aprovado && contaDaPlataforma(c)).length : 0;
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
// plano 1000b · AB-161: trechos com cara de segredo saem mascarados (mascararSegredos, bloco PURO)
const resumoTxt = r => !r ? "" : mascararSegredos(typeof r === "string" ? r : JSON.stringify(r)).slice(0, 180);

// segredos (só escrita) e a flag que o nx_config_ver devolve para cada um
const SEGREDOS = { wa_access_token: "tem_wa_token", meta_app_secret: "tem_app_secret", anthropic_api_key: "tem_ia" };
// texto em branco só é mandado quando "vazio" tem sentido (o servidor apaga a coluna); os três últimos pedem confirmação
const LIMPAVEIS = new Set(["wa_template", "google_api_versao", "painel_url", "wa_phone_number_id", "saas_url", "ia_aviso_custo_usd"]);
const ROTULO_CFG = { wa_template: "o modelo aprovado", google_api_versao: "a versão da API do Google", painel_url: "o endereço do painel",
  wa_phone_number_id: "o ID do número da Nexus", saas_url: "o endereço do Órbita" };

function renderExecucoes(c) {
  const ex = $("#aj-execucoes"), L = (c && c.ultimas_execucoes) || [];
  ex.innerHTML = `<h3>Últimas execuções do servidor</h3>` + (L.length
    ? `<ul>${L.slice(0, 8).map(e => `<li><span aria-hidden="true">${e.ok === false ? "✗" : e.ok ? "✓" : "…"}</span><div><b>${esc(nomeTarefa(e.tarefa))}</b> · ${quandoSP(e.inicio)}` +
        `<span class="sr-only">${e.ok === false ? " — deu erro" : e.ok ? " — deu certo" : " — em andamento"}</span>${e.ok === false ? ` <span class="chip chip-bad">erro</span>` : ""}<small>${esc(resumoTxt(e.resumo))}</small></div></li>`).join("")}</ul>`
    : `<p class="vazio">Nenhuma execução registrada ainda.</p>`);
}

function renderConfig() {
  const c = S.aj.config, f = $("#form-config"), ex = $("#aj-execucoes");
  aplicarVedados();
  if (c == null) { f.innerHTML = carregandoHtml("Lendo a configuração…"); ex.innerHTML = ""; return; }
  if (c.erro) { f.innerHTML = `<p class="vazio">${esc(api.mensagemErro(c.erro))}</p>`; ex.innerHTML = ""; return; }
  $("#cfg-webhook").textContent = c.webhook_url || "—";
  $("#cfg-verify").textContent = c.wa_verify_token || "—";
  // segredo preenchido ganha «Remover» (null explícito no nx_config_salvar, com confirmação)
  const sec = (k, rot, tem, dica) => `<label class="campo"><span>${rot}${tem ? `<b class="ok-preenchido">✓ preenchido</b> <button class="link-b" type="button" data-rm-segredo="${k}" aria-label="Remover ${rot}">Remover</button>` : ""}</span>` +
    `<input type="password" name="${k}" id="cf-${k}" autocomplete="new-password" spellcheck="false" placeholder="${tem ? "em branco = mantém o atual" : ""}">${dica ? `<small>${dica}</small>` : ""}</label>`;
  const txt = (k, rot, dica = "", ph = "") => `<label class="campo"><span>${rot}</span>` +
    `<input type="text" name="${k}" id="cf-${k}" value="${esc(c[k] ?? "")}" spellcheck="false" autocapitalize="off" placeholder="${esc(ph)}"${k === "modelo_ia" ? ` list="cf-modelos"` : ""}>${dica ? `<small>${dica}</small>` : ""}</label>`;
  f.innerHTML = `
    <h3>WhatsApp da Nexus (quem envia os avisos)</h3>
    <div class="form-2">${txt("wa_phone_number_id", "ID do número (phone_number_id)", "Em branco: apaga (com confirmação).")}${sec("wa_access_token", "Token de acesso", c.tem_wa_token)}</div>
    <div class="form-2">${txt("wa_template", "Modelo aprovado (fora da janela de 24h)", "Parâmetros do modelo: título curto e link do painel.")}${sec("meta_app_secret", "App secret (confere o webhook)", c.tem_app_secret)}</div>
    <h3>Leitura por IA</h3>
    <div class="form-2">${sec("anthropic_api_key", "Chave da API", c.tem_ia, "Sem chave, a leitura sai por regras fixas.")}${txt("modelo_ia", "Modelo", "", "claude-opus-5")}</div>
    <div class="form-2">${txt("ia_aviso_custo_usd", "Avisar quando a IA de um cliente passar de (US$ por dia)", "A equipe recebe um aviso no WhatsApp. Em branco: US$ 10.", "10")}</div>
    <datalist id="cf-modelos"><option value="claude-opus-5-5"></option><option value="claude-sonnet-5-5"></option><option value="claude-haiku-5-5"></option><option value="claude-fable-5-1"></option></datalist>
    <h3>Endereços</h3>
    <div class="form-2">${txt("saas_url", "Endereço do Órbita (link base)", "Base dos convites e dos domínios dos clientes, terminando em /app/. Sem ele, o convite sai com o endereço de onde o admin estava.", "https://orbita-nexus-ads.netlify.app/app/")}${txt("painel_url", "Endereço do painel clássico", "Vai como link no modelo de WhatsApp. Em branco: apaga.")}</div>
    <h3>Outros</h3>
    <div class="form-2">${txt("google_api_versao", "Versão da API do Google", "Em branco: o servidor descobre sozinho.", "automático")}</div>
    <div class="aj-pe"><button class="pill pill-bronze" type="submit" id="cf-salvar">Salvar configuração</button></div>
    <p class="aj-st" id="cf-status" role="status"></p>`;
  renderExecucoes(c);
}

async function salvarConfig(ev) {
  ev.preventDefault();
  const f = $("#form-config"), st = $("#cf-status"), btn = $("#cf-salvar"), atual = S.aj.config || {};
  // segredo em branco = mantém; texto em branco só vai quando o campo é limpável
  const cfg = {};
  $$("input[name]", f).forEach(i => {
    const v = i.value.trim();
    if (v || (i.type !== "password" && LIMPAVEIS.has(i.name))) cfg[i.name] = v;
  });
  if ("saas_url" in cfg) {
    const n = normalizarSaasUrl(cfg.saas_url);
    if (!n.ok) { f.elements.saas_url.focus(); return avisoForm(st, n.erro, true); }
    cfg.saas_url = n.valor;
    if (n.valor && n.valor !== String(f.elements.saas_url.value).trim()) f.elements.saas_url.value = n.valor;
  }
  if (cfg.ia_aviso_custo_usd) {   // «12,50» → «12.50»; o servidor só aceita até 10000 com 2 casas
    const v = cfg.ia_aviso_custo_usd.replace(/^US\$\s*/i, "").replace(",", ".");
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(v) || Number(v) <= 0 || Number(v) > 10000) {
      f.elements.ia_aviso_custo_usd.focus();
      return avisoForm(st, "O teto de custo da IA precisa ser um valor em dólar entre 0,01 e 10.000 (ex.: 10 ou 12,50).", true);
    }
    cfg.ia_aviso_custo_usd = v;
  }
  // apagar o que estava preenchido só com confirmação (painel_url, número da Nexus, endereço do Órbita)
  const apagando = ["painel_url", "wa_phone_number_id", "saas_url"].filter(k => k in cfg && !cfg[k] && String(atual[k] || "").trim());
  if (apagando.length && !(await confirmar(`Apagar ${apagando.map(k => ROTULO_CFG[k]).join(", ")}? O servidor fica sem esse valor até você preencher de novo.`, { ok: "Apagar" }))) {   // AC-242
    return avisoForm(st, "Nada foi salvo.", false);
  }
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

/** «Remover» um segredo: manda null explícito (nx_config_salvar apaga e audita). Se o servidor ainda for o antigo
    (null = mantém), a flag volta preenchida e a tela diz isso em vez de fingir que removeu. */
async function removerSegredo(k, btn) {
  const st = $("#cf-status"), flag = SEGREDOS[k];
  if (!flag) return;
  const rot = (btn.getAttribute("aria-label") || "Remover segredo").replace(/^Remover /, "");
  if (!(await confirmar(`Remover ${rot} do servidor? O que depende dele para de funcionar até você gravar um novo.`, { ok: "Remover" }))) return;   // AC-242
  ocupado(btn, true);
  try {
    const r = await api.configSalvar(S.token, { [k]: null });
    if (r && typeof r === "object" && !Array.isArray(r)) S.aj.config = r;
    renderConfig();
    const ainda = S.aj.config && S.aj.config[flag];
    avisoForm($("#cf-status"), ainda ? "O servidor ainda não aceita remover esse segredo (atualização do banco pendente) — nada mudou." : `${rot}: removido ✓`, !!ainda);
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
// plano 1500c · AC-243: o mês do «até» do período com os limites DELE (antes «de» era o início da janela de 30 dias, que caía no mês
// anterior, com o rótulo do mês do «até»: o relMensal não achava o mês anterior para comparar)
const mesDoPeriodo = () => {
  const m = M.mesesDados().find(x => x.de <= M.R && x.ate >= M.R);
  if (m) return m;
  const d = M.dataDe(M.R); return { de: janela().de, ate: M.R, mes: d.getMonth(), ano: d.getFullYear() };
};

/* ---------- o curta (curta.js) ---------- */
function ctxCurta() {
  const P = numerosPeriodo();
  return {
    M, P, nome: nomeCliente(), marca: { ...MARCA }, demo: S.demo, gestor: gestor(), anim: ANIM, fino: FINE, FX, CINE,
    campeao: campeao(P.de, P.ate, P.f), proximos: proximosPassos(mesDoPeriodo()),
    // plano 1000 (AD-201): na apresentação (reunião, tela compartilhada) os nomes saem em iniciais por padrão; ?nomes=1 mostra
    nomeCurto: Q.get("nomes") === "1" ? nomeCurto : iniciais, foneHtml, avatarMarca, simuladorHtml, ligarSimulador, corServ, AVC, hash,
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
/** A folha só sai de mês fechado COM números de anúncio: mês vazio viraria uma folha de zeros na mesa do dentista. */
function mesTemNumeros(m) {
  const t = M.consolidar(M.linhasDe(m.de, m.ate));
  return t.impressoes > 0 || t.gasto > 0 || M.crmTot(m.de, m.ate).conversas > 0;
}
async function abrirFolhaMes(iso) {
  if (!M) return;
  if (semAnuncios()) return toast("Ainda não há números de anúncio para a folha do mês.", "nota");
  const meses = M.mesesDados().filter(m => m.completo);
  const pedido = iso ? String(iso).slice(0, 7) : null;
  const m = pedido ? meses.find(x => isoI(x.de).slice(0, 7) === pedido) : meses.filter(mesTemNumeros).pop();
  if (!m) return toast(pedido ? "Esse mês ainda não está completo: a folha sai de mês fechado." : "Ainda não há um mês fechado com números de anúncio para a folha.", "nota");
  if (!mesTemNumeros(m)) return toast(`${MESES[m.mes].charAt(0).toUpperCase() + MESES[m.mes].slice(1)} não tem números de anúncio: a folha sairia em branco.`, "nota");
  const f = await modulo("folha");
  if (!f) return toast("Não deu para montar a folha agora. Tente de novo.", "erro");
  const lista = M.mesesDados().filter(x => x.de <= m.de && (x.ate - x.de >= 9 || x.completo)).slice(-4);
  f.abrir({
    M, m, nome: nomeCliente(), marca: { ...MARCA }, demo: S.demo, avatarMarca, corServ,
    meses: lista.map(x => ({ ...x, fecharam: M.crmTot(x.de, x.ate).fecharam })),
    proximos: proximosPassos(m), campeao: campeao(m.de, m.ate), volta: document.activeElement,
    editavel: S.demo || gestor(),   // plano 1500c · AC-265: o gestor reescreve «Para o próximo mês» antes de imprimir
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
    // plano 1000 (AD-202): o leitor de tela fala «R$ 2.000 por mês», não «2000»
    inv.setAttribute("aria-valuetext", valorFalado(SIM.inv, "brl"));
    tk.setAttribute("aria-valuetext", brl0(SIM.tk));
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
/** plano 1500c · AC-272: a lista de marcos do cliente (gestor, modo real) com «Remover» em cada um — antes só dava para tirar um marco
    clicando no dia certo do gráfico (e o de fora do período não tinha como sair). */
function renderMarcosLista() {
  const box = $("#marcos-lista");
  if (!box) return;
  const l = !S.demo && gestor() ? marcosAtuais().slice().sort((a, b) => b.d.localeCompare(a.d)) : [];
  box.hidden = !l.length;
  if (!l.length) return;
  $("#marcos-lista-s").textContent = `Marcos no gráfico (${l.length})`;
  $("#marcos-lista-ul").innerHTML = l.map(m => `<li><span><b>${esc(dataIso(m.d))}</b> — ${esc(m.t)}</span><button class="link-b" type="button" data-marco-rm="${esc(m.d)}" aria-label="Remover o marco de ${esc(dataIso(m.d))}: ${esc(m.t)}">Remover</button></li>`).join("");
}
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
  try {
    // plano 1000b · AB-162: relê os marcos do servidor e mescla por data antes de gravar — o marco que outro gestor salvou
    // depois do carregamento não some (se a releitura falhar, vale a lista da tela, como antes)
    let frescos = marcosAtuais();
    try {
      const r = await api.dados(S.token, S.clienteId, 1);
      const cf = r && r.cliente && r.cliente.cfg;
      if (cf && Array.isArray(cf.marcos)) { frescos = cf.marcos; const c = clienteAtual(); if (c) c.cfg = { ...(c.cfg || {}), marcos: cf.marcos }; }
    } catch (e) { if (e && e.codigo === "sessao_invalida") throw e; }
    await salvarCfgCliente({ marcos: mesclarMarcos(frescos, d, t) });
    toast(remover ? "Marco removido ✓" : t ? "Marco salvo ✓" : "Marco removido ✓");
    fecharMarco(true);
    desenharChart(null);
    renderMarcosLista();   // AC-272
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
  // plano 1000b · AB-160: «cliente novo» para oficina e loja (M.VOC.novo), não «paciente novo» fixo
  box.innerHTML = `<div class="desde-q"><p class="eyebrow">Desde a sua última visita</p>
      <h2 id="desde-h"><b>${esc(plural(novos.length, M.VOC.novo[0], M.VOC.novo[1]))}</b>${total > 0 ? ` · ${brl0(total)}` : ""}</h2>
      <ul class="desde-l">${novos.slice(0, 5).map(L => `<li><b>${esc(nomeTela(L.nome))}</b><span>${esc(L.servico)} · ${M.valorDe(L).semValor ? "sem valor" : brl0(M.valorLead(L))}</span></li>`).join("")}${novos.length > 5 ? `<li><span>e mais ${novos.length - 5}</span></li>` : ""}</ul></div>
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
    leads: M ? M.LEADS.filter(L => colunaDe(L) || M.etapa(L) === "nova").sort((a, b) => b.i - a.i).map(L => ({ id: String(L.id), nome: nomeTela(L.nome), sub: `${L.servico} · ${NOME_ETAPA[M.etapa(L)] || ""}` })) : [],
    campanhas: M ? Object.values(M.CAMP).filter(c => c.plat && !c.semCampanha).map(c => ({ id: c.id, nome: c.nome, sub: nomePlat(c.plat) })) : [],
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
      // plano 1000b · AB-159: a linha recebe o foco (teclado e leitor de tela vão junto); campanha sem gasto no período avisa em vez de nada
      setTimeout(() => {
        const tr = $(`#tbl-campanhas tr[data-camp="${CSS.escape(id)}"]`);
        if (!tr) { toast(`Sem investimento nesta campanha nos últimos ${S.dias} dias${S.plat ? ` no ${nomePlat(S.plat)}` : ""}.`); return; }
        tr.classList.add("realce"); tr.setAttribute("tabindex", "-1");
        tr.scrollIntoView({ block: "center", behavior: REDUCE ? "auto" : "smooth" });
        tr.focus({ preventScroll: true });
        setTimeout(() => tr.classList.remove("realce"), 2400);
      }, 80);
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
      nomeColuna: k => ((colsK().find(c => c[0] === k) || [])[1] || k).replace(/\s*\(.*\)$/, ""),
      lead: id => (M ? M.LEADS.find(x => String(x.id) === String(id)) : null),
      nome: L => nomeTela(L.nome),
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
  medirTopo();
}

/* ---------- topo que gruda (desktop) ----------
   Gruda com top NEGATIVO (--cima): a linha de cima (selo, eyebrow, leitura) sai de quadro sozinha
   e fica só a faixa de baixo — título curto (20 px) + filtros, Tour e Apresentar, ~64 px. Nada muda
   de altura no fluxo: o conteúdo não pula. */
const TOPO_LARGO = matchMedia("(min-width: 901px)");
function medirTopo() {
  const top = $(".top");
  if (!top) return;
  if (!TOPO_LARGO.matches) { top.style.removeProperty("--cima"); top.style.removeProperty("--faixa"); return; }
  const tools = $("#top-tools"), h = top.offsetHeight;
  if (!h) return;
  const ini = !tools.hidden && tools.offsetHeight ? tools.offsetTop - 10 : h - 60;
  const cima = Math.max(0, Math.round(Math.min(ini, h - 56)));
  top.style.setProperty("--cima", cima + "px");
  top.style.setProperty("--faixa", (h - cima) + "px");
}
function grudou() {
  const top = $(".top");
  const cima = TOPO_LARGO.matches ? parseFloat(top.style.getPropertyValue("--cima")) || 0 : 0;
  const on = scrollY > 8 && (!TOPO_LARGO.matches || top.getBoundingClientRect().top <= -cima + 1);
  if (on === top.classList.contains("stuck")) return;
  top.classList.toggle("stuck", on);
  if (on && !$("#sync-pop").hidden) abrirSyncPop(false);
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
    $("#top-mini").textContent = ABAS[aba][0];
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
  // plano 1000b · AB-153: pelas setas o botão muda na hora, mas o redesenho da página espera 150 ms sem tecla (segurar a seta = 1 render)
  let tTecla = 0;
  const sel = (b, teclado = false) => {
    btns.forEach(x => { const s = x === b; x.setAttribute("aria-checked", String(s)); x.tabIndex = s ? 0 : -1; });
    pos();
    clearTimeout(tTecla);
    if (teclado) tTecla = setTimeout(() => aoMudar(b.dataset.v), 150);
    else aoMudar(b.dataset.v);
  };
  btns.forEach((b, n) => {
    b.tabIndex = b.getAttribute("aria-checked") === "true" ? 0 : -1;
    b.addEventListener("click", () => { if (b.getAttribute("aria-checked") !== "true") sel(b); });
    b.addEventListener("keydown", e => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const nb = btns[(n + d + btns.length) % btns.length];
      sel(nb, true); nb.focus();
    });
  });
  seg._pos = pos;
}
const posicionarSegs = () => $$(".seg").forEach(s => s._pos && s._pos());
/* plano 1000b · AB-154: período, plataforma e ordem da tabela ficam guardados por cliente (antes cada F5 voltava a 30 dias e «Tudo») */
function guardarFiltros() {
  if (S.demo || !S.clienteId) return;
  gravarLocal(chaveFiltros(S.clienteId), JSON.stringify({ dias: S.dias, plat: S.plat, sort: S.sort }));
}
function aplicarFiltrosSalvos() {
  if (S.demo || !S.clienteId) return;
  const f = lerFiltros(lerLocal(chaveFiltros(S.clienteId)));
  S.dias = f.dias; S.plat = f.plat; S.sort = f.sort;
  for (const [sel, v] of [["#seg-periodo", String(f.dias)], ["#seg-plat", f.plat]]) {
    const seg = $(sel);
    if (!seg) continue;
    $$("button", seg).forEach(b => { const on = b.dataset.v === v; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
    if (seg._pos) seg._pos();
  }
  textoFiltros();
}

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
  // grudado, o topo só mostra a faixa de baixo (--faixa, ~64 px): é isso que cobre o conteúdo
  const sobe = topo && getComputedStyle(topo).position === "sticky" ? (parseFloat(topo.style.getPropertyValue("--faixa")) || topo.getBoundingClientRect().height) : 0;
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
  // plano 1500c · AC-287: falhou ao abrir — o foco vai para «Tentar de novo» (teclado e leitor de tela chegam na saída sem procurar)
  if (comAcoes) requestAnimationFrame(() => { const b = $("#boot-tentar"); if (b && !$("#boot").hidden) b.focus({ preventScroll: true }); });
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
    vigiarSessao();
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
      vigiarSessao();
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

/** Plano 1000 (AD-200): em origem compartilhada (GitHub Pages) a sessão do navegador vence por ociosidade/teto (dados.js);
    a aba aberta confere a cada minuto e, vencida, volta ao login em vez de seguir com o token só na memória.
    Revisão 13/10: clique/tecla renovam a ociosidade (api.renovarUso, no máx. 1×/min — trocar aba/período não chama RPC) e o
    conferidor nasce também depois de um login novo (antes só se já havia token ao abrir a página). Idempotente. */
let vigiaSessao = false;
function vigiarSessao() {
  if (vigiaSessao || !api.origemCompartilhada(location.hostname)) return;
  vigiaSessao = true;
  const tocar = () => { if (S.token) api.renovarUso(); };
  document.addEventListener("pointerdown", tocar, { capture: true, passive: true });
  document.addEventListener("keydown", tocar, true);
  setInterval(() => { if (S.token && !api.lerToken(Date.now(), { renovar: false })) sessaoExpirou(); }, 60000);
}

function sessaoExpirou() {
  api.apagarToken();
  S.token = null; S.conta = null;
  // a recarga agendada pelo "Fazer agora" viraria outra chamada sem token e roubaria o foco do login
  clearTimeout(S.aj.tRecarga); clearTimeout(S.aj.tConfere);
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
  aplicarFiltrosSalvos();   // plano 1000b · AB-154
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
    if (!r.hoje) r.hoje = hojeSP();   // plano 1500c · AC-068: o dia da carga fica guardado (a virada da meia-noite recarrega)
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
      // módulo desligado, teste vencido, suspenso, sem permissão: estado próprio, com o caminho para o Órbita quando faz sentido
      const est = estadoDeErro(e.codigo, api.mensagemErro(e));
      estadoApp("erro", { erro: est.erro, titulo: esc(est.titulo), texto: esc(est.texto),
        botoes: (est.orbita ? `<a class="pill pill-bronze" href="${ORBITA_URL}" rel="noopener">Abrir no Órbita</a>` : "")
          + `<button class="pill pill-ink" type="button" data-acao="recarregar">Tentar de novo</button>` });
    // plano 1500c · AC-270: recarga que falhou (com o painel já aberto) oferece «Tentar de novo» no próprio aviso
    } else toast(api.mensagemErro(e), "erro", { rotulo: "Tentar de novo", fn: () => carregarDados() });
  } finally {
    if (n === cargaN) $("#main").classList.remove("recarregando");
  }
}

function trocarCliente(id) {
  if (!id || id === S.clienteId) return;
  S.clienteId = id;
  gravarLocal("nx-cliente", id);
  aplicarFiltrosSalvos();   // plano 1000b · AB-154: cada cliente com o próprio período/plataforma/ordem
  preencherSeletor();
  DS = null; M = null; S.dados = null; relDe = null;
  S.kVer = {}; S.busca = ""; $("#k-busca").value = ""; S.varridoEm = null; ULT.clear();
  clearTimeout(S.aj.tRecarga); clearTimeout(S.aj.tConfere);
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
  // o ?aba= só vale na abertura: sai da URL (fica o #aba), senão o F5 voltaria sempre para ela
  if (Q.has("aba")) {
    Q.delete("aba");
    const resto = location.search.slice(1).split("&").filter(p => p && !/^aba(=|$)/.test(p)).join("&");
    try { history.replaceState(null, "", location.pathname + (resto ? "?" + resto : "") + location.hash); } catch { /* file:// */ }
  }
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
  ligarSeg($("#seg-periodo"), v => { S.dias = +v; guardarFiltros(); textoFiltros(); render(false); });
  ligarSeg($("#seg-plat"), v => { S.plat = v; S.kVer = {}; guardarFiltros(); textoFiltros(); render(false); });
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
  // plano 1000 (AD-209): «ver como tabela» — os mesmos números do gráfico diário numa tabela (aberta, segue o período e a plataforma)
  $("#btn-tabela-dia").addEventListener("click", () => {
    const b = $("#btn-tabela-dia"), aberta = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(aberta));
    b.textContent = aberta ? "esconder a tabela" : "ver como tabela";
    $("#tabela-dia").hidden = !aberta;
    if (aberta) renderTabelaDia();
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
  // plano 1500c · AC-068: painel aberto da noite para o dia — ao voltar para a aba depois da meia-noite (SP), recarrega (o «ontem» mudou)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || S.demo || !M || !S.dados || !S.token) return;
    if (diaVirou(S.dados.hoje, hojeSP())) carregarDados();
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
    guardarFiltros();   // plano 1000b · AB-154
    renderCampanhas();
    const nb = $(`#tbl-campanhas [data-sort="${k}"]`);
    if (nb) nb.focus();
  });
  // plano 1500c · AC-248: «Baixar planilha (CSV)» — o que a tabela mostra (período, plataforma e ordem), com os rótulos da vertical
  const btnCsv = $("#btn-csv-camp");
  if (btnCsv) btnCsv.addEventListener("click", () => {
    const rows = S.csvCamp || [];
    if (!M || !rows.length) return toast("Nenhuma campanha com investimento no período para baixar.", "nota");
    const V = M.VOC, cab = ["Campanha", "Plataforma", "Investido (R$)", "Conversas/conversões", "Custo por contato (R$)", "CTR (%)", capt(V.agendada[1]), capt(V.novo[1]), `${V.receita} (R$)`, "Retorno (x)"];
    const csv = csvDe([cab, ...rows.map(r => [r.c.nome, nomePlat(r.c.plat), r.t.gasto, r.t.conversoes, r.t.cpa, r.t.ctr, r.k.agendadas, r.k.fecharam, r.k.receita, r.roas])]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `campanhas-${slugDe(nomeCliente()) || "cliente"}-${isoI(M.R)}-${S.dias}d.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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
  // Esc fecha a gaveta mesmo com o foco fora dela (clique no título, que não é focável; link "Pular" etc.)
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || e.defaultPrevented || $("#gaveta").hidden) return;
    if (e.target && e.target.closest && e.target.closest(".paleta, #menu-parou, #palco-curta, #folha-modal")) return;
    fecharGaveta();
  });
  // arrastar a gaveta para a direita (> 80 px ou > .5 px/ms) fecha; senão volta com mola
  arrastavel($("#gaveta"), { eixo: "x", var: "--gx", alca: "#gv-alca", ativo: () => !$("#gaveta").hidden, fechar: () => fecharGaveta() });

  /* ---------- radar ---------- */
  $("#alerts").addEventListener("pointerover", e => { const li = e.target.closest("li[data-chave]"); if (radarCtl) radarCtl.realcar(li ? li.dataset.chave : null); });
  $("#alerts").addEventListener("pointerleave", () => { if (radarCtl) radarCtl.realcar(null); });
  $("#rules").addEventListener("click", e => {
    const b = e.target.closest("[data-regra]");
    if (!b) return;
    if (b.dataset.semMeta) return toast(SEM_META_REGRA);
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
  // plano 1000b · AB-255: «Enviar de novo» no chip do relatório que não saiu — o mesmo «Fazer agora» de Ajustes (nx-relatorio forçado)
  for (const id of ["#st-diario", "#st-mensal"]) $(id).addEventListener("click", async e => {
    const b = e.target.closest("[data-reenviar]");
    if (!b || !gestor()) return;
    await executarTarefa(b.dataset.reenviar === "mensal" ? "mensal" : "diario", b);
    const st = $("#exec-status");
    toast(st && st.classList.contains("erro") ? st.textContent : "Pedido enviado: o relatório sai de novo em instantes.", st && st.classList.contains("erro") ? "erro" : undefined);
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
  $("#form-config").addEventListener("click", e => {
    const b = e.target.closest("[data-rm-segredo]");
    if (b) { e.preventDefault(); removerSegredo(b.dataset.rmSegredo, b); }
  });
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
  // plano 1500c · AC-272: «Remover» na lista de marcos
  const ml = $("#marcos-lista");
  if (ml) ml.addEventListener("click", e => {
    const b = e.target.closest("[data-marco-rm]");
    if (!b || !gestor() || !M) return;
    S.marcoFixo = iDeIso(b.dataset.marcoRm);
    salvarMarco(true);
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
  addEventListener("scroll", grudou, { passive: true });
  if ("ResizeObserver" in window) new ResizeObserver(() => { medirTopo(); grudou(); }).observe(top);
  else addEventListener("resize", medirTopo);
  TOPO_LARGO.addEventListener("change", () => { medirTopo(); grudou(); });
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
  // com um diálogo aberto (gaveta, curta, folha) o #app fica inerte; o link "Pular para o conteúdo" mora fora
  // dele e acompanha — senão o Tab sai do diálogo por ele e o Esc deixa de fechar
  const skip = $(".skip");
  if (skip && "MutationObserver" in window) new MutationObserver(() => { skip.inert = $("#app").inert; }).observe($("#app"), { attributes: true, attributeFilter: ["inert"] });
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
  vigiarSessao();
  carregarSessao();
}

iniciar();
