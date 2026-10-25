/* ============================================================
   ÓRBITA — config.js · frente F3 · ESPEC T14 (§7.7), §2.8
   Hub #/config e #/config/<secao>. Seções da F3: perfil, usuarios
   (P0-A); marca, dominio, plano (P0-B). As outras frentes entram por secoesConfig de
   crm-config.js (F4), cv-config.js (F5), ads-config.js (F6),
   agenda-config.js e rastreio-config.js (F8),
   carregados por import() com ?v= e catch. Só aparece o que está
   em CONFIG_PRONTAS (ou ?dev=1 do super).
   ============================================================ */

const GRUPOS = ["Você", "Equipe", "Atendimento", "CRM", "Anúncios", "Marca", "Plano"];
const EXTERNOS = ["crm-config.js", "cv-config.js", "ads-config.js", "agenda-config.js", "rastreio-config.js"];
let _externas = null;      // cache das seções das outras frentes (por versão)
let _versaoExt = null;
let _limpeza = [];
let _montagemCfg = 0;
let _seqAjuda = 0;
/** plano 1000b · UB-221: tela de celular (a mesma régua de 760 px do CSS). */
const celular = () => { try { return typeof matchMedia === "function" && !!matchMedia("(max-width: 760px)").matches; } catch { return false; } };
/** Teto de espera pela folha config.css antes do 1º desenho (G7). */
export const ESPERA_CSS_MS = 1500;

/**
 * Aviso para um logo muito estreito/alto (largura < metade da altura): no menu (caixa de 36 px) e no login (44 px) o logo é desenhado
 * «contido», então um 90 × 500 sobra com ~7 px de largura. Devolve o texto do aviso ou "" quando a proporção serve.
 */
export function avisoProporcaoLogo(largura, altura) {
  const w = Number(largura), h = Number(altura);
  if (!(w > 0) || !(h > 0) || w / h >= 0.5) return "";
  return "Este logo é muito estreito e alto: no menu e na tela de entrada ele aparece bem pequeno e pode ficar ilegível. Prefira um logo quadrado ou mais largo.";
}

/** Valida o contrato da RPC antes de a tela tratar uma resposta inválida como lista vazia. */
export function validarListaDominios(valor) {
  if (!Array.isArray(valor) || valor.some(d => !d || typeof d !== "object" || typeof d.host !== "string" || !["pendente", "ativo"].includes(d.status))) {
    const erro = new Error("O servidor devolveu uma lista de domínios inválida. Tente atualizar a tela.");
    erro.codigo = "resposta_invalida";
    throw erro;
  }
  return valor;
}

/** Desfaz só a seção aberta (a navegação do hub continua montada — AS-080).
    plano 1000b · UB-259: sair de uma seção que GRAVOU algo (salvou um número, um departamento…) invalida o estado do checklist — o selo não
    fica velho por 60 s; só navegar entre seções continua usando o mesmo estado (AS-080). */
function limparSecao() {
  for (const f of _limpeza) try { f(); } catch { /* ok */ }
  _limpeza = []; _podeSair = null; _pendente = null;
  if (_secaoGravou) { _pendCache.clear(); _secaoGravou = false; }
}
let _secaoGravou = false;
/** UB-259: a chamada muda dados? (api.ehLeitura quando existe; senão pelo nome da RPC). */
export function rpcGrava(api, nome) {
  if (api && typeof api.ehLeitura === "function") try { return !api.ehLeitura(nome); } catch { /* cai no nome */ }
  return /_(salvar|criar|remover|revogar|apagar|excluir|trocar|ativar|conectar|desconectar|status|pausar|marcar|importar|enviar)(_|$)/.test(String(nome || ""));
}
/** UB-259: embrulha ctx.api (uma vez) para saber se a seção aberta gravou alguma coisa. */
function vigiarGravacoes(ctx) {
  const a = ctx.api;
  if (!a || a.__vigiado) return;
  const w = { ...a, __vigiado: true };
  for (const k of ["rpc", "rpcC", "fn"]) if (typeof a[k] === "function") w[k] = (n, ...r) => { if (k === "fn" || rpcGrava(a, n)) _secaoGravou = true; return a[k](n, ...r); };
  try { ctx.api = w; } catch { /* ctx congelado: segue sem vigiar */ }
}
export function desmontar() {
  limparSecao();
  _hub = null;
  for (const f of _cancelarComandos.splice(0)) try { f(); } catch { /* ok */ }
}

let _hub = null;                 // plano 1000 · AS-080: {chave, alvo, raiz, lista, sec, cab, busca} — trocar de seção reaproveita a navegação
let _cancelarComandos = [];      // AS-083: as seções registradas na paleta Ctrl/⌘+K
const _pendCache = new Map();    // AS-080: nx_onboarding_estado por cliente, por 60 s → {em, est}
export const PEND_CACHE_MS = 60_000;

/** plano 1000 · AS-083: palavras extras de busca por seção (o título e a descrição já entram). */
export const PALAVRAS_SECAO = Object.freeze({
  perfil: "nome celular senha aparelhos sair avisos som notificação conta", usuarios: "equipe convite convidar papel administrador atendente acesso pessoas",
  departamentos: "horário horario funcionamento expediente fora do horário setor rodízio", numeros: "whatsapp codewords meta api oficial número conectar modelos templates",
  respostas: "atalho frases prontas barra mensagens", atendimento: "assinatura fila avisos preferências", ia: "inteligência artificial assistente robô bot memória tom",
  funis: "etapas pipeline kanban vendas", campos: "campos extras cadastro personalizados", etiquetas: "tags marcadores cores", motivos: "perda não fechou",
  agenda: "horários consultas dias fechados duração", anuncios: "meta google facebook instagram contas campanhas", formulario: "site formulário lead",
  rastreio: "script utm origem campanha site", marca: "logo cores tema tela de entrada favicon", dominio: "endereço cname dns subdomínio", plano: "limites uso cobrança assinatura",
});
const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** AS-083: ids das seções que casam com a busca (título + descrição + palavras-chave, sem acento; todas as palavras digitadas). */
export function filtrarSecoes(secoes, termo) {
  const ps = semAcento(termo).split(/\s+/).filter(Boolean);
  return (secoes || []).filter(s => {
    const alvo = semAcento(`${s.titulo} ${s.desc || ""} ${s.grupo || ""} ${PALAVRAS_SECAO[s.id] || ""} ${s.palavras || ""}`);
    return ps.every(p => alvo.includes(p));
  }).map(s => s.id);
}

/** plano 1000 · AS-086: o mesmo critério do ui (VALIDADORES.telefone): 10/11 dígitos com DDD, ou «+» e 8 a 15 dígitos. */
export function telefoneValido(v) {
  const t = String(v ?? "").trim(), d = t.replace(/\D/g, "");
  return d.length === 10 || d.length === 11 || (t.startsWith("+") && d.length >= 8 && d.length <= 15);
}

/**
 * plano 1000 · AS-113: domínio RAIZ (suaagencia.com.br, empresa.com) não aceita CNAME. Verdadeiro quando o host é só o domínio registrável:
 * 2 rótulos, ou 3 com sufixo de dois níveis (.com.br, .net.br, .org.br, .co.uk…).
 */
export function ehDominioRaiz(host) {
  const p = String(host || "").toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (p.length < 2) return false;
  const duplo = /^(com|net|org|gov|edu|art|blog|eco|ind|inf|med|adv|eng|tur|app|dev|co|ac)$/.test(p[p.length - 2]) && p[p.length - 1].length === 2;
  return p.length === 2 || (p.length === 3 && duplo);
}

/**
 * plano 1000 · AS-109: WhatsApp de suporte que o wa.me entende — 55 + DDD + número (12 ou 13 dígitos) ou, para fora do Brasil, «+» e 8 a 15 dígitos.
 * → {ok, digitos, erro}. Vazio é válido (o campo é opcional).
 */
export function suporteWaValido(v) {
  const t = String(v ?? "").trim(), d = t.replace(/\D/g, "");
  if (!t) return { ok: true, digitos: "", erro: null };
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return { ok: true, digitos: d, erro: null };
  // plano 1000b · UB-178: fora do Brasil, 10 a 15 dígitos — a MESMA régua de validarMarca e marcaEfetiva (tema.js); antes 8–9 passava aqui e sumia lá
  if (t.startsWith("+") && !d.startsWith("55") && d.length >= 10 && d.length <= 15) return { ok: true, digitos: d, erro: null };
  return { ok: false, digitos: d, erro: ERRO_SUPORTE_WA };
}
export const ERRO_SUPORTE_WA = "Use 55 + DDD + número, ex.: 5512999998888 (ou + e o código do país, se for fora do Brasil).";

/** plano 1000b · UB-098: «Mídia guardada» com 1 casa (pt-BR) e em GB a partir de 1024 MB. */
export function formatarArmazenamento(mb) {
  const n = Math.max(0, Number(mb) || 0);
  const fmt = v => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return n >= 1024 ? `${fmt(n / 1024)} GB` : `${fmt(n)} MB`;
}

/** plano 1000b · UB-106/UB-108: o endereço como o servidor espera — sem espaço, minúsculo, sem protocolo, caminho nem ponto final. */
export function normalizarHost(v) {
  return String(v ?? "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
}
export const RE_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
/**
 * plano 1000b · UB-263/UB-106: erro do endereço digitado para domínio próprio (texto) ou null quando serve.
 * Recusa o formato inválido, o próprio endereço do app aberto agora e qualquer *.netlify.app (é o destino do CNAME, não um domínio próprio).
 */
export function erroHostDominio(host, hostAtual = "") {
  const x = normalizarHost(host);
  if (!RE_HOST.test(x)) return "Use algo como crm.suaempresa.com.br.";
  if (/\.netlify\.app$/.test(x)) return "Esse é um endereço do Netlify, não um domínio próprio. Use um subdomínio seu, como crm.suaempresa.com.br.";
  if (hostAtual && x === normalizarHost(hostAtual)) return "Esse é o endereço em que o app já está aberto. Use um subdomínio seu, como crm.suaempresa.com.br.";
  return null;
}

/** plano 1000 · AS-116: dias úteis (seg a sex) completos desde `iso` até `agora` (sexta 10h → segunda 10h = 1). null sem data. Teto de 60. */
export function diasUteisDesde(iso, agora = new Date()) {
  const ini = new Date(iso), fim = agora instanceof Date ? agora : new Date(agora);
  if (isNaN(ini) || isNaN(fim)) return null;
  let n = 0;
  const d = new Date(ini.getTime());
  for (let i = 0; i < 120 && n < 60; i++) {
    d.setTime(d.getTime() + 86400000);
    if (d > fim) break;
    const dia = d.getDay();
    if (dia !== 0 && dia !== 6) n++;
  }
  return n;
}

/** plano 1000 · AS-117: status do plano para a pílula — «Em teste» com o teste já vencido vira «Teste encerrado». hoje = AAAA-MM-DD. */
export function statusDoPlano(status, testeAte, hoje) {
  if (status === "teste" && testeAte && hoje && String(testeAte) < String(hoje)) return ["Teste encerrado", "ruim"];
  return ROT_STATUS[status] || [status || "—", "neutra"];
}

/** plano 1000 · AS-100: pessoas cujo nome ou e-mail contém o termo (sem acento, sem maiúsculas). */
export function filtrarUsuarios(usuarios, termo) {
  const t = String(termo || "").normalize("NFD").replace(/[^\x00-\x7F]/g, "").toLowerCase().trim();
  const l = Array.isArray(usuarios) ? usuarios : [];
  if (!t) return l;
  return l.filter(u => `${u.nome || ""} ${u.email || ""}`.normalize("NFD").replace(/[^\x00-\x7F]/g, "").toLowerCase().includes(t));
}

/** plano 1000 · AS-273: «online» = acesso nos últimos 5 minutos. */
export const ONLINE_MS = 5 * 60_000;
export function estaOnline(iso, agora = Date.now()) {
  const t = Date.parse(iso || "");
  const a = agora instanceof Date ? agora.getTime() : Number(agora);
  return Number.isFinite(t) && a - t >= -60_000 && a - t < ONLINE_MS;
}

/** plano 1000 · AS-297: validade do convite — 3 dias por padrão; 30 dias só com aviso (link vazado vale um mês). */
export const DIAS_CONVITE_PADRAO = "3";
export function avisoValidadeConvite(dias) {
  return Number(dias) >= 30 ? "Um link de 30 dias que vazar continua valendo por um mês. Prefira 3 ou 7 dias e gere outro se a pessoa demorar." : "";
}

/** plano 1000 · AS-242: o que conta em cada limite do plano (a mesma regra do nx_uso no servidor). */
export const REGRA_USO = Object.freeze({
  usuarios: "Pessoas com acesso a esta empresa mais os convites ainda válidos (não usados, não revogados e dentro do prazo). Revogar um convite libera a vaga.",
  canais: "Todos os números cadastrados, conectados ou não. Excluir um número libera a vaga.",
  funis: "Só os funis ligados. Desligar um funil libera a vaga; os negócios dele continuam guardados.",
  automacoes: "Todas as automações, ligadas e desligadas. Só excluir libera a vaga.",
  contatos: "Todos os contatos guardados, de qualquer origem (WhatsApp, anúncios, importação). Só excluir libera a vaga.",
  // plano 1500c · UCB-079: o efeito de chegar no limite (a IA para; o resto segue)
  ia_mes: "Cada sugestão ou montagem de IA feita pela equipe neste mês. Volta a zero no dia 1º (horário de Brasília). No limite, a IA para de sugerir até o dia 1º; o atendimento e as automações sem IA seguem normais.",
});

/** plano 1000 · AS-275: título da aba numa seção das Configurações (estável, mesmo se a seção falhar e o hub remontar). */
export const tituloSecao = s => (s && s.titulo ? `${s.titulo} · Configurações` : "Configurações");

/** plano 1000 · AS-093: trocar papel que mexe com Administrador pede confirmação; os demais salvam com «Desfazer». */
export function trocaDePapelPedeConfirmacao(antes, depois) { return antes !== depois && (antes === "admin" || depois === "admin"); }

/* ---------------------------------------------------------------- plano 1500c · lógica nova (frente config) */
const ROTULOS_PAPEL = Object.freeze({ admin: "Administrador", supervisor: "Supervisor", atendente: "Atendente", leitura: "Somente leitura", gestor: "Gestor" });
/** plano 1500c · UCB-041: o rótulo do papel num lugar só (config, admin; login.js fica como pendência). */
export function rotuloPapel(p, { minusculo = false } = {}) {
  const r = ROTULOS_PAPEL[p] || (p ? String(p) : "usuário");
  return minusculo ? r.toLowerCase() : r;
}
/** plano 1500c · UCB-082: as seções que o checklist do Início marca como pendentes (hub e Visão geral usam a mesma lista). */
export const SECOES_COM_PEND = Object.freeze(["numeros", "departamentos", "agenda", "rastreio", "usuarios", "funis"]);
const normEmail = e => String(e || "").trim().toLowerCase();
/** plano 1500c · UCB-014: o e-mail já é de alguém da equipe ('membro'), de um convite aguardando ('pendente') ou livre (null). */
export function conviteDuplicado(dados, email) {
  const e = normEmail(email);
  if (!e) return null;
  if (((dados && dados.usuarios) || []).some(u => normEmail(u && u.email) === e)) return "membro";
  if (((dados && dados.convites) || []).some(c => !(c && c.vencido) && normEmail(c && c.email) === e)) return "pendente";
  return null;
}
/** plano 1500c · UCB-015: a pessoa é o único administrador (o servidor recusa tirar o último — ultimo_admin). */
export function ehUltimoAdmin(usuarios, contaId) {
  const l = (Array.isArray(usuarios) ? usuarios : []).filter(u => u && !u.gestor);
  const eu = l.find(u => u.conta_id === contaId);
  return !!eu && eu.papel === "admin" && !l.some(u => u.conta_id !== contaId && u.papel === "admin");
}
/** plano 1500c · UCB-027: os dados de um convite pendente (ou vencido) para gerar outro igual. */
export function dadosParaReconvite(cv, dias = DIAS_CONVITE_PADRAO) {
  const c = cv || {};
  return { papel: c.papel || "atendente", nome: c.nome || null, email: c.email || null,
    departamentos: Array.isArray(c.departamentos) ? c.departamentos.slice() : [], dias: Number(dias) || Number(DIAS_CONVITE_PADRAO) };
}
/** plano 1500c · UCB-028: o convite vence em menos de 24 h (e ainda não venceu). */
export function conviteVenceLogo(expiraEm, agora = Date.now()) {
  const t = Date.parse(expiraEm || ""), a = agora instanceof Date ? agora.getTime() : Number(agora);
  return Number.isFinite(t) && t > a && t - a < 86400000;
}
export const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** plano 1500c · UCB-030: «a@b.com; c@d.com\nerrado» → {validos:[…], invalidos:[…]} (vírgula, ponto e vírgula ou linha; sem repetir). */
export function separarEmails(texto) {
  const vistos = new Set(), validos = [], invalidos = [];
  for (const p of String(texto || "").split(/[,;\n\r\t ]+/).map(x => x.trim()).filter(Boolean)) {
    const e = p.toLowerCase();
    if (vistos.has(e)) continue;
    vistos.add(e);
    (RE_EMAIL.test(e) ? validos : invalidos).push(RE_EMAIL.test(e) ? e : p);
  }
  return { validos, invalidos };
}
/** plano 1500c · UCB-033: quem nunca entrou no sistema. */
export function nuncaEntraram(usuarios) { return (Array.isArray(usuarios) ? usuarios : []).filter(u => u && !u.ultimo_acesso); }
/** plano 1500c · UCB-057: o link completo da tela de entrada da revenda (o domínio ativo da agência, quando houver). */
export function linkEntradaOrg(origem, slug, dominioAtivo = null) {
  if (dominioAtivo) return `https://${normalizarHost(dominioAtivo)}/app/`;
  const base = String(origem || "").replace(/\/+$/, "");
  return slug ? `${base}/app/?org=${encodeURIComponent(slug)}` : `${base}/app/`;
}
const diaUTC = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
/** plano 1500c · UCB-072: dias de teste que faltam (0 = termina hoje; negativo = já terminou). Datas AAAA-MM-DD de São Paulo. null sem data. */
export function diasRestantesTeste(testeAte, hoje) {
  const a = diaUTC(testeAte), b = diaUTC(hoje);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((a - b) / 86400000) : null;
}
/** plano 1500c · UCB-072: «Faltam 3 dias de teste» / «O teste termina hoje» → {texto, tom}; null quando não está em teste ou já acabou. */
export function rotuloDiasTeste(status, testeAte, hoje) {
  const n = status === "teste" ? diasRestantesTeste(testeAte, hoje) : null;
  if (n === null || n < 0) return null;
  return { texto: n === 0 ? "O teste termina hoje" : n === 1 ? "Falta 1 dia de teste" : `Faltam ${n} dias de teste`, tom: n <= 3 ? "aten" : "info" };
}
/** plano 1500c · UCB-075: o que a situação da conta significa (suspensa, cancelada, teste encerrado) → {texto, tom} ou null. */
export function avisoStatusPlano(status, testeAte, hoje) {
  if (status === "suspenso") return { texto: "A conta está suspensa: a equipe não consegue usar o sistema. Os dados continuam guardados; fale com o suporte para reativar.", tom: "ruim" };
  if (status === "cancelado") return { texto: "A conta foi cancelada: a equipe não entra mais. Os dados continuam guardados por um tempo; fale com o suporte para voltar.", tom: "ruim" };
  const n = status === "teste" ? diasRestantesTeste(testeAte, hoje) : null;
  if (n !== null && n < 0) return { texto: "O período de teste terminou. Seus dados ficam guardados: contrate para continuar usando.", tom: "ruim" };
  return null;
}
/** plano 1500c · UCB-076 / UC-008: o texto do pedido (aumentar o plano ou, em teste, contratar) — o mesmo no WhatsApp e no modal. */
export function textoPedidoAumento({ plano = "", cliente = "", itens = [], teste = false, testeAte = "" } = {}) {
  const lista = (itens || []).filter(Boolean).join(", ").replace(/, ([^,]*)$/, " e $1");
  const dataBr = /^\d{4}-\d{2}-\d{2}/.test(String(testeAte)) ? `${testeAte.slice(8, 10)}/${testeAte.slice(5, 7)}` : "";
  const t = teste
    ? `Olá! Estou testando o sistema na ${cliente}${dataBr ? ` (teste até ${dataBr})` : ""} e quero contratar${plano ? ` o plano ${plano}` : ""}.`
    : `Olá! Quero aumentar${plano ? ` o plano ${plano}` : " o plano"} da ${cliente}${lista ? `: estamos no limite (ou perto) de ${lista}` : ""}.`;
  return t.replace(/\s+/g, " ").trim();
}
/** plano 1500c · UCB-078: no ritmo do mês até hoje, quanto o uso chega no último dia (uso ÷ dias passados × dias do mês). */
export function projecaoMes(uso, hoje) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(hoje || ""));
  const u = Math.max(0, Number(uso) || 0);
  if (!m) return u;
  const dia = +m[3], diasMes = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
  return Math.round((u / Math.max(1, dia)) * diasMes);
}
const ROT_LIMITE_CURTO = { usuarios: "usuários", canais: "números", funis: "funis", automacoes: "automações", contatos: "contatos", ia_mes: "IA no mês", empresas: "clientes" };
/** plano 1500c · UCB-080 / UC-009: o que muda do plano atual para outro (limites e módulos) → ['usuarios: 3 → 10', …]. */
export function diferencasPlano(atual, outro) {
  const la = (atual && atual.limites) || {}, lb = (outro && outro.limites) || {};
  const fmt = v => (v === null || v === undefined ? "sem limite" : String(v));
  const out = [];
  for (const k of [...new Set([...Object.keys(la), ...Object.keys(lb)])]) if ((la[k] ?? null) !== (lb[k] ?? null)) out.push(`${k}: ${fmt(la[k])} → ${fmt(lb[k])}`);
  const ma = new Set((atual && atual.modulos) || []);
  for (const m of (outro && outro.modulos) || []) if (!ma.has(m)) out.push(`+ ${ROT_MOD[m] || m}`);
  return out;
}
/** plano 1500c · UCB-080: a mesma diferença em português (para a tela). */
export function diferencasPlanoTexto(atual, outro) {
  return diferencasPlano(atual, outro).map(s => s.replace(/^(\w+):/, (_, k) => `${ROT_LIMITE_CURTO[k] || k}:`));
}
/** plano 1500c · UCB-123: por que a seção não aparece — 'papel' (precisa de outro acesso), 'modulo' (fora do plano) ou 'inexistente'. */
export function motivoSecaoIndisponivel(ctx, secao) {
  if (!secao) return "inexistente";
  if (secao.conta === "gestor" || (secao.papelMin && typeof ctx.pode === "function" && !ctx.pode(secao.papelMin))) return "papel";
  if (secao.modulo && typeof ctx.temModulo === "function" && !ctx.temModulo(secao.modulo)) return "modulo";
  return "papel";
}
/** plano 1500c · UCB-113: o celular como o servidor guarda — só dígitos, com 55 quando vier com DDD (10/11 dígitos). */
export function normalizarTelefone(v) {
  const t = String(v ?? "").trim(), d = t.replace(/\D/g, "");
  if (!d) return "";
  return !t.startsWith("+") && (d.length === 10 || d.length === 11) ? `55${d}` : d;
}
/** plano 1500c · UCB-007: as três barras do cartão «Sua agência» (org sem «uso» ou com uso null vira 0, sem quebrar). */
export function usoAgencia(r) {
  const o = (r && r.org) || {}, u = o.uso || {}, l = o.limites || {};
  return [["Clientes", "empresas"], ["Usuários", "usuarios"], ["Números de WhatsApp", "canais"]]
    .map(([rotulo, k]) => ({ rotulo, uso: Number(u[k]) || 0, limite: l[k] ?? null }));
}
/** plano 1500c · UC-040: «Dia 9 de 14» do teste (inicio e fim AAAA-MM-DD) → {dia, total} ou null sem as datas. */
export function progressoTeste(inicio, fim, hoje) {
  const dif = diasRestantesTeste(fim, inicio), passados = diasRestantesTeste(hoje, inicio);
  if (dif === null || passados === null || dif < 0) return null;
  const total = dif + 1;      // o primeiro e o último dia contam
  return { dia: Math.min(total, Math.max(1, passados + 1)), total };
}

let _podeSair = null, _pendente = null;      // plano 1000 · AS-082: a seção aberta diz se pode sair (alteração não salva → pergunta antes de trocar)

async function secoesExternas(ctx) {
  if (_externas && _versaoExt === ctx.versao) return _externas;
  const lista = [];
  await Promise.all(EXTERNOS.map(async arq => {
    try {
      const m = await import(`./${arq}?v=${encodeURIComponent(ctx.versao)}`);
      if (Array.isArray(m.secoesConfig)) for (const s of m.secoesConfig) if (s && s.id && typeof s.montar === "function") lista.push(s);
    } catch { /* frente ainda não publicou: a seção não aparece */ }
  }));
  _externas = lista; _versaoExt = ctx.versao;
  return lista;
}

function secoesProprias() {
  return [
    { id: "perfil", titulo: "Perfil", desc: "Seu nome, celular e senha", grupo: "Você", papelMin: null, icone: "usuario", semCliente: true, montar: secaoPerfil },
    { id: "usuarios", titulo: "Usuários e convites", desc: "Quem entra e com qual papel", grupo: "Equipe", papelMin: "admin", icone: "convidar", montar: secaoUsuarios },
    ...secoesMarcaPlano(),
  ];
}

/** Agrupa as seções visíveis na ordem de GRUPOS: [{grupo, itens}] (o que a navegação lateral desenha). */
export function agruparSecoes(vistas, grupos = GRUPOS) {
  const ordenadas = [...(vistas || [])].sort((a, b) => (grupos.indexOf(a.grupo) + 1 || 99) - (grupos.indexOf(b.grupo) + 1 || 99));
  const out = [];
  for (const s of ordenadas) {
    const nome = s.grupo || "Outros";
    let g = out[out.length - 1];
    if (!g || g.grupo !== nome) out.push(g = { grupo: nome, itens: [] });
    g.itens.push(s);
  }
  return out;
}

function visivel(ctx, s) {
  if (!ctx.configPronta(s.id)) return false;
  if (s.conta === "gestor") return ctx.sessao.conta.papel === "gestor";
  if (s.semCliente && typeof s.visivel === "function") try { return !!s.visivel(ctx); } catch { return false; }
  if (s.semCliente) return true;
  if (!ctx.cliente) return false;
  if (s.modulo && !ctx.temModulo(s.modulo)) return false;
  if (s.papelMin && !ctx.pode(s.papelMin)) return false;
  if (typeof s.visivel === "function") try { return !!s.visivel(ctx); } catch { return false; }
  return true;
}

export async function montar(ctx) {
  const gravou = _secaoGravou;
  limparSecao();
  vigiarGravacoes(ctx);
  const { ui } = ctx;
  const h = ui.h;
  ctx.titulo("Configurações");
  // G7: a folha da tela chega ANTES do 1º desenho (sem o salto de layout da lista e dos cartões); com teto de espera, para uma rede
  // ruim não prender a tela — passado o teto, desenha assim mesmo e a folha se aplica quando chegar
  const css = Promise.resolve(typeof ui.carregarCss === "function" ? ui.carregarCss("config") : true).catch(() => false);
  let relogio = null;
  const teto = new Promise(r => { relogio = setTimeout(r, ESPERA_CSS_MS); });
  const [, externas] = await Promise.all([Promise.race([css, teto]).finally(() => clearTimeout(relogio)), secoesExternas(ctx)]);
  const todas = [...secoesProprias(), ...externas];
  const grupos = agruparSecoes(todas.filter(s => visivel(ctx, s)));
  const vistas = grupos.flatMap(g => g.itens);
  const pedida = ctx.rota.partes[0] || null;
  const atual = pedida ? vistas.find(s => s.id === pedida) || null : null;

  // plano 1000 · AS-080: trocar de seção (mesmo cliente, mesma pessoa, mesmas seções) não remonta o hub — só o conteúdo da seção muda
  const chaveHub = `${ctx.cliente ? ctx.cliente.id : "-"}|${ctx.sessao && ctx.sessao.conta ? ctx.sessao.conta.id || ctx.sessao.conta.email || "-" : "-"}|${vistas.map(s => s.id).join(",")}`;
  if (_hub && _hub.chave === chaveHub && _hub.alvo === ctx.alvo && _hub.raiz.isConnected) {
    const hub = _hub;
    for (const a of hub.lista.querySelectorAll("a.cfg-nav-item")) {
      if (atual && a.getAttribute("href") === `#/config/${atual.id}`) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
    hub.raiz.classList.toggle("na-secao", !!pedida);
    hub.cab.classList.toggle("na-secao", !!pedida);
    // plano 1000b · UB-082: escolher uma seção limpa a busca do menu (voltar ao menu não o mostra filtrado sem aviso)
    if (hub.busca && hub.busca.value) { hub.busca.value = ""; hub.busca.dispatchEvent(new Event("input")); }
    // UB-259: a seção que fechou gravou algo → o selo de pendências é conferido de novo
    if (gravou && hub.pintarPend) hub.pintarPend();
    ui.limpar(hub.sec);
    return montarSecao(ctx, hub.sec, atual, pedida, vistas, todas);
  }
  for (const f of _cancelarComandos.splice(0)) try { f(); } catch { /* ok */ }

  // navegação lateral (item 56): grupo, ícone, título e uma linha dizendo o que a seção faz; o ponto de pendência entra depois
  const lista = h("nav", { class: "cfg-lista", "aria-label": "Seções das configurações" });
  // plano 1000 · AS-083: «Buscar ajuste» acima do menu (título, descrição e palavras-chave, sem acento)
  const campoBusca = vistas.length > 4 ? h("input", { type: "search", class: "cfg-busca-inp", placeholder: "Buscar ajuste: horário, senha, logo…", "aria-label": "Buscar nas configurações", autocomplete: "off" }) : null;
  const semAchado = h("p", { class: "fraco cfg-busca-vazio", hidden: true }, "Nenhum ajuste com essas palavras.");
  const statusBusca = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });
  if (campoBusca) lista.append(h("label", { class: "busca cfg-busca" }, ui.icone("busca"), campoBusca), semAchado, statusBusca);
  for (const g of grupos) {
    lista.appendChild(h("p", { class: "rotulo cfg-grupo", dataset: { grupo: g.grupo } }, g.grupo));
    for (const s of g.itens) {
      const emObra = !ctx.shell.prontos.CONFIG_PRONTAS.includes(s.id);
      lista.appendChild(h("a", { class: "cfg-nav-item", href: `#/config/${s.id}`, "aria-current": atual && atual.id === s.id ? "page" : null, dataset: { secao: s.id, grupo: g.grupo } },
        h("span", { class: "cfg-nav-ic", "aria-hidden": "true" }, ui.icone(s.icone || "engrenagem")),
        h("span", { class: "cfg-nav-txt" }, h("span", { class: "cfg-nav-tit" }, s.titulo), s.desc ? h("small", { class: "cfg-nav-desc" }, s.desc) : null),
        emObra ? h("span", { class: "nav-selo" }, "obra") : null));
    }
  }
  // M32: o mesmo estado do checklist do Início vira um ponto com o número de passos pendentes ao lado de cada seção (só admin; é um complemento)
  const minhaMontagem = ++_montagemCfg;
  const comPend = !!(ctx.cliente && ctx.pode("admin") && vistas.some(s => SECOES_COM_PEND.includes(s.id)));      // plano 1500c · UCB-082
  const pintarPend = () => {
    if (!comPend) return;
    // AS-080: o estado do checklist vale por 60 s (voltar ao hub ou trocar de empresa e voltar não repete a chamada)
    pendenciasDoHub(ctx).then(pend => {
      if (minhaMontagem !== _montagemCfg || !lista.isConnected) return;
      for (const a of lista.querySelectorAll(".cfg-nav-item")) {
        const id = String(a.getAttribute("href") || "").replace("#/config/", "");
        const n = pend[id];
        for (const velho of a.querySelectorAll(".cfg-pend, .cfg-pend-sr")) velho.remove();
        delete a.dataset.pend;
        if (!n) continue;
        // plano 1000b · UB-260: o número visível é decoração (aria-hidden) e o leitor ouve título, descrição E «, 2 passos pendentes» (sr-only):
        // antes o aria-label do link trocava tudo só pelo título e a descrição da seção sumia
        const frase = `${n} ${n === 1 ? "passo pendente" : "passos pendentes"}`;
        a.appendChild(h("span", { class: "nav-selo cfg-pend", "aria-hidden": "true", title: `${frase} no checklist` }, String(n)));
        a.appendChild(h("span", { class: "sr-only cfg-pend-sr" }, `, ${frase}`));
        a.dataset.pend = String(n);
      }
    }).catch(() => { /* sem o checklist o menu fica como estava */ });
  };
  pintarPend();
  // plano 1000b · UB-081: Enter na busca abre a 1ª seção encontrada
  if (campoBusca) campoBusca.addEventListener("keydown", ev => {
    if (ev.key !== "Enter") return;
    const a = [...lista.querySelectorAll("a.cfg-nav-item")].find(x => !x.hidden);
    if (!a) return;
    ev.preventDefault();
    a.click();
  });
  // plano 1500c · UCB-122: «/» foca a busca do menu (fora de campo de texto)
  if (campoBusca && typeof document !== "undefined" && typeof document.addEventListener === "function") {
    const aoBarra = ev => {
      if (ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey || !campoBusca.isConnected) return;
      const a = document.activeElement;
      if (a && (/^(input|textarea|select)$/i.test(a.localName || a.tagName || "") || a.isContentEditable)) return;
      ev.preventDefault();
      try { campoBusca.focus(); } catch { /* ok */ }
    };
    document.addEventListener("keydown", aoBarra);
    _cancelarComandos.push(() => document.removeEventListener("keydown", aoBarra));
    campoBusca.setAttribute("aria-keyshortcuts", "/");
  }
  if (campoBusca) campoBusca.addEventListener("input", () => {
    const termo = campoBusca.value.trim();
    const ok = new Set(filtrarSecoes(vistas, termo));
    let n = 0;
    for (const a of lista.querySelectorAll("a.cfg-nav-item")) { const v = !termo || ok.has(a.dataset.secao); a.hidden = !v; if (v) n++; }
    for (const p of lista.querySelectorAll(".cfg-grupo")) p.hidden = !!termo && !vistas.some(s => s.grupo === p.dataset.grupo && ok.has(s.id));
    semAchado.hidden = !termo || n > 0;
    statusBusca.textContent = termo ? `${n} ${n === 1 ? "ajuste encontrado" : "ajustes encontrados"}.` : "";
  });
  // AS-083: cada seção também na paleta Ctrl/⌘+K («Configurações: Departamentos e horários»)
  if (ctx.comandos && typeof ctx.comandos.registrar === "function") {
    for (const s of vistas) {
      try {
        const c = ctx.comandos.registrar({ id: `config.${s.id}`, rotulo: `Configurações: ${s.titulo}`, icone: s.icone || "engrenagem",
          palavras: `configuracoes ajustes ${s.desc || ""} ${PALAVRAS_SECAO[s.id] || ""}`, fazer: () => ctx.navegar(`#/config/${s.id}`) });
        if (typeof c === "function") _cancelarComandos.push(c);
      } catch { /* a paleta é um extra */ }
    }
  }
  // plano 1000 · AS-077: a seção NÃO é região viva (abrir Usuários lia a tabela inteira; Números a cada 30 s) — anuncia só «X aberta»
  // revisão 1000b · UB-176: <section> sem nome acessível não vira região — aria-labelledby no título da seção (#cfg-sec-tit,
  // posto por montarSecao: o h2 da Visão geral ou o nome da seção aberta)
  const sec = h("section", { class: "cfg-sec", "aria-labelledby": "cfg-sec-tit" });
  const raiz = h("div", { class: ["cfg", pedida && "na-secao"] }, lista, sec);
  // plano 1000 · AS-082: trocar de seção com alteração não salva pergunta antes (links da lista e o «‹ Configurações»)
  raiz.addEventListener("click", ev => {
    const a = ev.target && ev.target.closest ? ev.target.closest("a.cfg-nav-item, a.cfg-voltar") : null;
    if (!a || !_podeSair || (_pendente && !_pendente()) || ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const destino = a.getAttribute("href");
    if (!destino || (typeof location !== "undefined" && destino === location.hash)) return;
    ev.preventDefault();
    const pergunta = _podeSair;
    Promise.resolve().then(() => pergunta()).then(ok => { if (ok) { _podeSair = null; _pendente = null; ctx.navegar(destino); } }, () => {});
  });
  ui.limpar(ctx.alvo);
  // plano 1000 · AS-081: no celular, dentro de uma seção, o cabeçalho do hub some da TELA (fica para leitor de tela: o h1 continua)
  const cab = h("header", { class: ["cab-pag", "cfg-cab", pedida && "na-secao"] }, h("div", null,
    h("p", { class: "rotulo" }, ctx.cliente ? ctx.cliente.nome : ctx.sessao.org ? ctx.sessao.org.nome : ""),
    h("h1", { class: "titulo-pag" }, "Configurações")));
  ctx.alvo.append(cab, raiz);
  _hub = { chave: chaveHub, alvo: ctx.alvo, raiz, lista, sec, cab, busca: campoBusca, pintarPend };
  return montarSecao(ctx, sec, atual, pedida, vistas, todas);
}

/** AS-080/AS-293: {id da seção: nº de passos pendentes} do checklist do Início (nx_onboarding_estado por 60 s, por cliente). */
function pendenciasDoHub(ctx) {
  const memo = _pendCache.get(ctx.cliente.id);
  const estado = memo && Date.now() - memo.em < PEND_CACHE_MS ? Promise.resolve(memo.est)
    : ctx.api.rpcC("nx_onboarding_estado", {}).then(est => { _pendCache.set(ctx.cliente.id, { em: Date.now(), est }); return est; });
  return Promise.all([import(`./rel-logica.js?v=${encodeURIComponent(ctx.versao)}`), estado]).then(([L, est]) => {
    let pulados = [];
    try { pulados = (JSON.parse(localStorage.getItem(`nx-onb:${ctx.cliente.id}:${(ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id) || "-"}`) || "{}").pulados) || []; } catch { /* sem storage */ }
    return L.pendenciasConfig(est, { pulados }) || {};
  });
}

/** plano 1000 · AS-293: a página inicial das Configurações no computador — pendências do checklist e atalhos por grupo. */
function visaoGeral(ctx, sec, vistas) {
  const { ui } = ctx;
  const h = ui.h;
  const pend = h("div", { class: "cfg-vg-pend", "aria-live": "polite" });
  const grupos = agruparSecoes(vistas);
  sec.append(
    h("section", { class: "cartao cfg-vg" },
      h("div", { class: "cartao-cab" }, h("div", null, h("h2", { id: "cfg-sec-tit" }, "Visão geral"), h("p", { class: "sub" }, "O que ainda falta configurar e o caminho para cada ajuste."))),
      pend,
      h("div", { class: "cfg-vg-grupos" }, grupos.map(g => h("div", { class: "cfg-vg-grupo" },
        h("p", { class: "rotulo" }, g.grupo),
        h("ul", { class: "cfg-vg-lista" }, g.itens.map(s => h("li", null, h("a", { href: `#/config/${s.id}`, class: "cfg-vg-item" },
          h("span", { class: "cfg-nav-ic", "aria-hidden": "true" }, ui.icone(s.icone || "engrenagem")),
          h("span", { class: "cfg-nav-txt" }, h("span", { class: "cfg-nav-tit" }, s.titulo), s.desc ? h("small", { class: "cfg-nav-desc" }, s.desc) : null))))))))));
  // plano 1500c · UCB-081: o teste acabando (ou acabado) aparece no topo da Visão geral, com o caminho para o Plano e uso
  const cli = ctx.cliente || {};
  const dTeste = ctx.cliente && ctx.pode("admin") && cli.status === "teste" ? diasRestantesTeste(cli.teste_ate, ui.hojeSP()) : null;
  if (dTeste !== null) {
    const txt = dTeste < 0 ? "O período de teste terminou." : dTeste === 0 ? "O teste termina hoje." : `O teste termina em ${dTeste} ${dTeste === 1 ? "dia" : "dias"}.`;
    sec.firstChild.insertBefore(h("p", { class: ["aviso", dTeste <= 3 && "aviso-aten", "cfg-vg-teste"] }, ui.icone("relogio"),
      h("span", null, `${txt} `, h("a", { href: "#/config/plano" }, "Ver plano e uso"))), pend);
  }
  const ids = new Set(vistas.map(s => s.id));
  if (!ctx.cliente || !ctx.pode("admin") || !SECOES_COM_PEND.some(id => ids.has(id))) { pend.hidden = true; return; }      // UCB-082
  pend.append(h("p", { class: "fraco" }, "Conferindo o que falta…"));
  return pendenciasDoHub(ctx).then(p => {
    if (!pend.isConnected) return;
    ui.limpar(pend);
    const falta = vistas.filter(s => p[s.id] > 0);
    if (!falta.length) {
      pend.append(h("p", { class: "aviso aviso-ok" }, ui.icone("check"), h("span", null, "Tudo o que o checklist pede já está configurado.")));
      // plano 1500c · UCB-124: «tudo pronto» com os próximos passos (só os que existem para esta empresa)
      const tem = m => typeof ctx.temModulo !== "function" || ctx.temModulo(m);
      const passos = [ids.has("usuarios") ? ["#/config/usuarios", "convidar", "Convidar a equipe"] : null,
        ids.has("ia") && tem("conversas") ? ["#/config/ia", "ia", "Ligar e ajustar a IA"] : null,
        tem("relatorios") ? ["#/relatorios", "grafico", "Ver os relatórios"] : null].filter(Boolean);
      if (passos.length) pend.append(h("p", { class: "rotulo" }, "Próximos passos"), h("ul", { class: "cfg-vg-lista cfg-vg-proximos" }, passos.map(([href, ic, rot]) =>
        h("li", null, h("a", { href, class: "cfg-vg-item cfg-vg-falta" }, h("span", { class: "cfg-nav-ic", "aria-hidden": "true" }, ui.icone(ic)), h("span", { class: "cfg-nav-tit" }, rot), ui.icone("seta-dir"))))));
      return;
    }
    pend.append(h("p", { class: "rotulo" }, "Falta configurar"),
      h("ul", { class: "cfg-vg-lista cfg-vg-faltam" }, falta.map(s => h("li", null, h("a", { href: `#/config/${s.id}`, class: "cfg-vg-item cfg-vg-falta" },
        h("span", { class: "cfg-nav-ic", "aria-hidden": "true" }, ui.icone(s.icone || "engrenagem")),
        h("span", { class: "cfg-nav-txt" }, h("span", { class: "cfg-nav-tit" }, s.titulo), h("small", { class: "cfg-nav-desc" }, `${p[s.id]} ${p[s.id] === 1 ? "passo pendente" : "passos pendentes"}`)),
        ui.icone("seta-dir"))))));
  }).catch(() => { pend.hidden = true; });
}

/** Desenha a seção pedida dentro do hub (montado agora ou reaproveitado — AS-080). */
async function montarSecao(ctx, sec, atual, pedida, vistas = [], todas = []) {
  const { ui } = ctx;
  const h = ui.h;
  // plano 1000 · AS-293: #/config sem seção abre a «Visão geral» (o que falta configurar + atalhos), não mais o Perfil
  if (!pedida && vistas.length) { ctx.titulo("Configurações"); return visaoGeral(ctx, sec, vistas); }
  // revisão 1000b · UB-176: o nome da região (lido pelo aria-labelledby da <section>; o texto não aparece duas vezes na tela)
  sec.appendChild(h("span", { id: "cfg-sec-tit", hidden: true }, atual ? atual.titulo : "Configurações"));
  if (!atual) {
    ctx.titulo("Configurações");      // AS-275: a seção que não existe não herda o título da anterior
    // plano 1500c · UCB-123: a tela sabe se é o acesso (papel) ou o plano (módulo) — diz qual
    const motivo = pedida ? motivoSecaoIndisponivel(ctx, (todas || []).find(s => s.id === pedida)) : null;
    const textoMotivo = motivo === "modulo" ? "Ela não faz parte do plano desta empresa. Veja o Plano e uso ou fale com quem cuida do seu plano."
      : motivo === "papel" ? "O seu acesso não inclui esta seção. Peça a um administrador da empresa."
      : motivo === "inexistente" ? "Esse endereço não corresponde a nenhuma seção." : "";
    sec.appendChild(ui.vazio({ titulo: pedida ? "Esta seção não está disponível." : "Nada para configurar por aqui.",
      texto: textoMotivo, icone: "engrenagem",
      acao: pedida ? { rotulo: "Ver as configurações", fn: () => ctx.navegar("#/config") } : null }));
    return;
  }
  ctx.titulo(tituloSecao(atual));      // plano 1000 · AS-275: «Departamentos e horários · Configurações»
  const voltar = h("a", { class: "voltar-link cfg-voltar", href: "#/config" }, ui.icone("seta-esq"), "Configurações");
  const alvo = h("div", { class: "pilha" });
  sec.append(voltar, alvo);
  if (pedida && typeof ui.anunciar === "function") ui.anunciar(`${atual.titulo} aberta.`);
  try {
    const r = await atual.montar(ctx, alvo);
    // a seção devolve a limpeza (função) e/ou {limpar, podeSair}; podeSair() → Promise<boolean> (AS-082)
    if (typeof r === "function") _limpeza.push(r);
    else if (r && typeof r === "object" && typeof r.limpar === "function") _limpeza.push(r.limpar);
    const ps = r && typeof r.podeSair === "function" ? r.podeSair : null;
    if (ps) {
      _podeSair = ps; _pendente = typeof r.pendente === "function" ? r.pendente : null;
      // a guarda do shell cobre o resto (menu lateral, paleta, voltar do navegador, troca de empresa, Sair); os links da lista já perguntaram
      // (zeram _podeSair) e trocar de seção desregistra (limparSecao roda as _limpeza)
      if (typeof ctx.aoSairDaRota === "function") {
        const guarda = () => {
          if (_podeSair !== ps || (_pendente && !_pendente())) return true;
          return Promise.resolve().then(() => ps()).then(ok => !!ok, () => true);
        };
        try { const c = ctx.aoSairDaRota(guarda); if (typeof c === "function") _limpeza.push(c); } catch { /* a guarda é um extra */ }
      }
    }
  } catch (e) {
    console.error(`config ${atual.id}`, e);
    ui.limpar(alvo);
    alvo.appendChild(ui.erroCartao(e, () => montar(ctx)));
  }
}

/* ============================================================
   PERFIL
   ============================================================ */
async function secaoPerfil(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  const c = ctx.sessao.conta;
  const formDados = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome", nome: "nome", valor: c.nome, obrigatorio: true, autocomplete: "name", max: 80 }),
      // plano 1000 · AS-086: máscara e validação de telefone como no resto do app (antes «1299» só era recusado pelo servidor)
      ui.campo({ rotulo: "Celular (WhatsApp)", nome: "telefone", tipo: "tel", validar: "telefone", valor: c.telefone ? ui.telBR(c.telefone) : "", autocomplete: "tel",
        // plano 1000b · UB-196/UB-197: ajudas que dizem para que serve o celular e onde se troca o e-mail
        ajuda: "Opcional. Para avisos do sistema a você; clientes não veem." }),
      // plano 1500c · UCB-111: nenhum administrador tem essa ação na tela — quem troca é o suporte
      ui.campo({ rotulo: "E-mail", nome: "email_ro", valor: c.email, desabilitado: true, ajuda: "O e-mail é o seu login. Para trocar o e-mail, fale com o suporte." })),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Salvar dados")));
  formDados.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(formDados, null);
    const d = ui.lerForm(formDados);
    // plano 1500c · UCB-112: a mesma frase do servidor (com o limite)
    const nomeLimpo = String(d.nome || "").trim();
    if (nomeLimpo.length < 2 || nomeLimpo.length > 80) return ui.marcarErro(formDados, "nome", "Informe o seu nome (2 a 80 letras).");
    if (d.telefone && !telefoneValido(d.telefone)) return ui.marcarErro(formDados, "telefone", "Use DDD + número, ex.: (12) 99830-3030.");
    try {
      // plano 1500c · UCB-113: o celular vai só com dígitos (55 + DDD + número), como nos outros pontos
      await ui.carregando(formDados.querySelector("[type=submit]"), api.rpc("nx_perfil_salvar", { p_dados: { nome: nomeLimpo, telefone: normalizarTelefone(d.telefone) } }));
      ui.toast("Dados salvos.", { tipo: "ok" });
    } catch (e) {
      if (e.codigo === "telefone_invalido") return ui.marcarErro(formDados, "telefone", "Use DDD + número, ex.: (12) 99830-3030.");
      if (e.codigo === "nome_invalido") return ui.marcarErro(formDados, "nome", "Informe o seu nome (2 a 80 letras).");
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
      return;
    }
    // plano 1000b · UB-083: os dados JÁ foram salvos — se só a releitura da sessão falhar, nada de toast de erro depois do «Dados salvos»
    try { await ctx.shell.recarregarSessao(); } catch { /* o nome novo aparece na próxima leitura da sessão */ }
  });

  const formSenha = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Senha atual", nome: "atual", tipo: "senha", autocomplete: "current-password", obrigatorio: true }),
      // plano 1000b · UB-086: a célula vazia da grade some no celular (uma coluna) — antes virava um buraco entre «Senha atual» e «Senha nova»
      h("span", { class: "form-grade-quebra", "aria-hidden": "true" }),
      // plano 1000b · UB-085: o medidor de força (o mesmo do convite) na senha nova
      ui.campo({ rotulo: "Senha nova", nome: "nova", tipo: "senha", validar: "senha", autocomplete: "new-password", obrigatorio: true, ajuda: "Pelo menos 8 caracteres." }),
      ui.campo({ rotulo: "Repita a senha nova", nome: "nova2", tipo: "senha", autocomplete: "new-password", obrigatorio: true })),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Trocar senha")));
  formSenha.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(formSenha, null);
    const d = ui.lerForm(formSenha);
    if (!d.atual) return ui.marcarErro(formSenha, "atual", "Informe a senha atual.");
    if (!d.nova || d.nova.length < 8) return ui.marcarErro(formSenha, "nova", "A senha precisa ter pelo menos 8 caracteres.");
    // plano 1000b · UB-084: trocar pela mesma senha não protege nada (e encerraria as outras sessões à toa)
    if (d.nova === d.atual) return ui.marcarErro(formSenha, "nova", "Use uma senha diferente da atual.");
    if (d.nova !== d.nova2) return ui.marcarErro(formSenha, "nova2", "As duas senhas não são iguais.");
    try {
      const rs = await ui.carregando(formSenha.querySelector("[type=submit]"), api.rpc("nx_senha_trocar", { p_atual: d.atual, p_nova: d.nova }));
      formSenha.reset();
      // plano 1500c · UCB-114: só promete o que a resposta confirma (o nx_senha_trocar antigo não encerra as outras sessões)
      const n = rs && Number.isFinite(Number(rs.sessoes_encerradas)) ? Number(rs.sessoes_encerradas) : null;
      ui.toast(n === null ? "Senha trocada. Entre de novo nos outros aparelhos." : n === 0 ? "Senha trocada. Não havia outras sessões abertas."
        : `Senha trocada. ${n} ${n === 1 ? "outra sessão encerrada" : "outras sessões encerradas"}.`, { tipo: "ok" });
    } catch (e) {
      if (e.codigo === "credenciais_invalidas") return ui.marcarErro(formSenha, "atual", "A senha atual não confere.");
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });

  const btTodas = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("sair"), "Sair de todos os aparelhos");
  btTodas.addEventListener("click", async () => {
    // plano 1000 · AS-091: desconecta todo mundo da conta — confirmação com destaque de perigo
    const ok = await ui.confirmar({ titulo: "Sair de todos os aparelhos?", perigo: true, rotulo: "Sair de todos",
      texto: "Você e qualquer outro aparelho conectado com a sua conta vão precisar entrar de novo, inclusive este." });
    if (!ok) return;
    // SV-128 (20261013e): nx_sessoes_encerrar(p_todas) derruba as OUTRAS sessões; esta sai logo depois pelo shell.sair().
    // Servidor anterior (sem a função): cai no nx_sair_todas antigo. Erro de verdade: avisa e NÃO sai (os outros aparelhos seguiriam conectados).
    const semFuncao = e => /pgrst202|could not find the function|http_404|funcao_invalida/i.test(String((e && (e.codigo || e.message)) || ""));
    const encerrar = async () => {
      try { return await api.rpc("nx_sessoes_encerrar", { p_todas: true }); }
      catch (e) { if (!semFuncao(e)) throw e; return api.rpc("nx_sair_todas"); }
    };
    try { await ui.carregando(btTodas, encerrar()); }
    catch (e) {
      // plano 1000b · UB-198: a mensagem da API já diz o que fazer — sem o «Tente de novo» repetido
      ui.toast(`Não deu para encerrar as sessões dos outros aparelhos. ${api.mensagemErro(e)}`, { tipo: "erro" });
      return;
    }
    ui.toast("As sessões dos outros aparelhos foram encerradas.", { tipo: "ok" });
    await ctx.shell.sair();
  });

  // plano 1000 · AS-085: o papel na empresa ativa (e nas outras), em vez de «usuário da empresa»
  const papel = papelNaConta(ctx);
  alvo.append(
    h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Seus dados"),
      h("p", { class: "sub cfg-papel" }, papel.frase),
      papel.outras.length ? h("p", { class: "fraco cfg-papel-outras" }, `Também tem acesso a: ${papel.outras.join(" · ")}.`) : null)), formDados),
    ...[blocoAvisos(ctx)].filter(Boolean),
    h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Senha"),
      h("p", { class: "sub" }, "Ao trocar, as sessões abertas em outros aparelhos são encerradas."))), formSenha),
    h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Sessões em outros aparelhos"),
      // plano 1000b · UB-087: o título não promete uma lista de aparelhos que a tela não tem
      h("p", { class: "sub" }, "Esqueceu a conta aberta num computador da recepção? Encerre todas as sessões de uma vez, inclusive esta."))), listaSessoes(ctx), btTodas));
}

/**
 * plano 1500c · UCB-050: os aparelhos com a conta aberta (nx_sessoes_listar) com «Encerrar» por linha (nx_sessao_encerrar).
 * Servidor sem as funções (ou erro): a lista some e fica só o «Sair de todos os aparelhos».
 */
export function listaSessoes(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const caixa = h("div", { class: "cfg-sessoes", hidden: true });
  const desenhar = lista => {
    ui.limpar(caixa);
    const l = (Array.isArray(lista) ? lista : []).filter(s => s && s.id != null);
    if (!l.length) { caixa.hidden = true; return; }
    caixa.hidden = false;
    caixa.append(h("ul", { class: "cfg-sessoes-lista" }, l.map(s => {
      const b = s.atual ? null : h("button", { type: "button", class: "bt bt-fant bt-p" }, "Encerrar");
      if (b) b.addEventListener("click", async () => {
        try {
          await ui.carregando(b, api.rpc("nx_sessao_encerrar", { p_id: s.id }));
          ui.toast("Sessão encerrada.", { tipo: "ok" });
          desenhar(l.filter(x => x !== s));
          const prox = caixa.querySelector("button");
          try { (prox || caixa.closest(".cartao") || caixa).focus(); } catch { /* ok */ }
        } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      });
      return h("li", { class: "linha linha-entre cfg-sessao" },
        h("span", null, h("b", null, s.navegador || "Navegador"), s.atual ? ui.pilula("Este aparelho", "info") : null,
          h("small", { class: "fraco" }, ` · ${s.ultimo_uso ? `usado ${ui.relativo(s.ultimo_uso)}` : s.criado_em ? `desde ${ui.dataBR(s.criado_em)}` : ""}`)), b);
    })));
  };
  Promise.resolve().then(() => api.rpc("nx_sessoes_listar")).then(desenhar, () => { caixa.hidden = true; });
  return caixa;
}

/**
 * plano 1000 · AS-085: «Você é Administrador na Clínica X» (papel do cliente ativo) + as outras empresas e papéis.
 * Exportada para teste. ctx: {sessao:{conta}, cliente, shell:{clientes()}}.
 */
export function papelNaConta(ctx) {
  const conta = (ctx.sessao && ctx.sessao.conta) || {};
  const rot = p => ({ admin: "Administrador", supervisor: "Supervisor", atendente: "Atendente", leitura: "Somente leitura", gestor: "Gestor" })[p] || p || "usuário";
  const outras = [];
  try {
    const todas = ctx.shell && typeof ctx.shell.clientes === "function" ? ctx.shell.clientes() || [] : [];
    for (const c of todas) if (c && (!ctx.cliente || c.id !== ctx.cliente.id) && c.nome) outras.push(c.papel ? `${c.nome} (${rot(c.papel)})` : c.nome);
  } catch { /* sem a lista, só a empresa ativa */ }
  let frase;
  if (conta.super) frase = "Você entra como equipe da plataforma.";
  else if (conta.papel === "gestor") frase = `Você é gestor${ctx.sessao && ctx.sessao.org ? ` da ${ctx.sessao.org.nome}` : ""}${ctx.cliente ? `, vendo a ${ctx.cliente.nome}` : ""}.`;
  else if (ctx.cliente && ctx.cliente.papel) frase = `Você é ${rot(ctx.cliente.papel)} na ${ctx.cliente.nome}.`;
  else frase = ctx.cliente ? `Você tem acesso à ${ctx.cliente.nome}.` : "Você entra como usuário da empresa.";
  return { frase, outras: outras.slice(0, 8) };
}

/**
 * plano 1000 · AS-090: os avisos de mensagem nova (som e aviso na área de trabalho) também no Perfil — a MESMA chave do menu «Avisos»
 * de Conversas (localStorage nx-cv-avisos: som ligado por padrão, aviso de tela só se a pessoa ligou). null sem o módulo Conversas.
 */
function blocoAvisos(ctx) {
  const { ui } = ctx;
  const h = ui.h;
  if (!ctx.cliente || (typeof ctx.temModulo === "function" && !ctx.temModulo("conversas"))) return null;
  const ler = () => { try { const p = JSON.parse(localStorage.getItem("nx-cv-avisos") || "{}"); return p && typeof p === "object" ? p : {}; } catch { return {}; } };
  const gravar = mud => { try { localStorage.setItem("nx-cv-avisos", JSON.stringify({ ...ler(), ...mud })); return true; } catch { return false; } };
  const p = ler();
  const nota = h("p", { class: "fraco cfg-avisos-nota", "aria-live": "polite" });
  const sw = (id, rotulo, ajuda, ligado, aoMudar) => {
    // plano 1000 · AS-265: nome acessível de um elemento só (aria-labelledby → o texto do rótulo)
    const inp = h("input", { type: "checkbox", id, role: "switch", checked: ligado, "aria-labelledby": `${id}-rot` });
    inp.addEventListener("change", () => aoMudar(inp));
    return h("div", { class: "campo campo-check campo-switch cfg-aviso-op" },
      h("label", { for: id }, inp, h("span", { class: "check-marca", "aria-hidden": "true" }), h("span", { id: `${id}-rot` }, rotulo)),
      ajuda ? h("small", { class: "campo-ajuda" }, ajuda) : null);
  };
  const som = sw("cfg-av-som", "Som de mensagem nova", "Toca quando chega mensagem e você está em outra tela.", p.som !== false, inp => {
    if (!gravar({ som: inp.checked })) { inp.checked = !inp.checked; ui.toast("Este navegador não deixou guardar a preferência.", { tipo: "erro" }); return; }
    ui.toast(inp.checked ? "Som ligado." : "Som desligado.", { tipo: "ok" });
  });
  const tela = sw("cfg-av-tela", "Aviso na área de trabalho", /* plano 1500c · UCB-005: sem a marca da plataforma (white-label) */ "Mostra um aviso do sistema mesmo com o app em segundo plano.", p.tela === true, async inp => {
    if (inp.checked) {
      const N = typeof Notification !== "undefined" ? Notification : null;
      let perm = N ? N.permission : "denied";
      if (N && perm === "default" && typeof N.requestPermission === "function") { try { perm = await N.requestPermission(); } catch { perm = "denied"; } }
      if (perm !== "granted") {
        inp.checked = false;
        nota.textContent = N ? "O navegador bloqueou os avisos. Libere em Configurações do site (cadeado ao lado do endereço) e tente de novo." : "Este navegador não mostra avisos na área de trabalho.";
        return;
      }
    }
    nota.textContent = "";
    if (!gravar({ tela: inp.checked })) { inp.checked = !inp.checked; return; }
    ui.toast(inp.checked ? "Aviso na área de trabalho ligado." : "Aviso na área de trabalho desligado.", { tipo: "ok" });
  });
  return h("div", { class: "cartao cfg-avisos" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Avisos de mensagem nova"),
    h("p", { class: "sub" }, "Valem neste aparelho e são os mesmos do menu «Avisos» de Conversas."))), som, tela, nota);
}

/* ============================================================
   USUÁRIOS E CONVITES
   ============================================================ */
const PAPEIS_EMPRESA = [
  { valor: "admin", rotulo: "Administrador", ajuda: "Tudo da empresa, inclusive usuários e configurações." },
  { valor: "supervisor", rotulo: "Supervisor", ajuda: "Conversas dos seus departamentos, respostas rápidas e importação." },
  { valor: "atendente", rotulo: "Atendente", ajuda: "Atende as conversas e cuida do CRM." },
  { valor: "leitura", rotulo: "Somente leitura", ajuda: "Só consulta; não altera nada." },
];
const ROT_PAPEL = Object.fromEntries(PAPEIS_EMPRESA.map(p => [p.valor, p.rotulo]));

function linkCompleto(ctx, link) { return String(link || "").startsWith("#") ? ctx.linkPublico(link) : link; }

async function secaoUsuarios(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  let dados = null;
  const pint = { convites: () => {}, uso: () => {} };      // plano 1500c · UCB-017: o desenho vivo da lista de convites e do uso

  async function carregar() {
    ui.limpar(alvo);
    alvo.appendChild(ui.esqueleto("tabela", 4));
    try {
      dados = await api.rpcC("nx_usuarios_listar");
      desenhar();
    } catch (e) {
      ui.limpar(alvo);
      alvo.appendChild(ui.erroCartao(e, carregar));
    }
  }

  // plano 1000b · UB-088: o termo da busca de pessoas sobrevive ao redesenho (salvar um interruptor não apaga o filtro)
  let termoUs = "";
  let soNunca = false;          // plano 1500c · UCB-033: chip «Nunca entraram»
  async function salvar(conta_id, mudanca, { desfazer = null, texto = "Acesso atualizado.", focoId = null } = {}) {
    try {
      dados = await api.rpcC("nx_usuario_salvar", { p_usuario: { conta_id, ...mudanca } });
      // plano 1000 · AS-093: troca de papel comum sai com «Desfazer» (volta o papel anterior)
      ui.toast(texto, { tipo: "ok", acao: desfazer ? { rotulo: "Desfazer", fn: () => salvar(conta_id, desfazer, { texto: "Papel anterior de volta." }) } : null });
    } catch (e) {
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
    desenhar();
    // UB-088: o foco volta ao MESMO controle (pelo id), não cai no body
    if (focoId) { const el = document.getElementById(focoId); if (el && alvo.contains(el)) try { el.focus({ preventScroll: true }); } catch { /* ok */ } }
  }

  function seletorDeps(u) {
    const deps = dados.departamentos || [];
    const sel = new Set(u.departamentos || []);
    const txt = () => sel.size === 0 ? "Todos" : deps.filter(d => sel.has(d.id)).map(d => d.nome).join(", ") || "Todos";
    if (!u.editavel || !deps.length) return h("span", { class: "fraco" }, txt());
    const b = h("button", { type: "button", class: "bt bt-fant bt-p", "aria-label": `Departamentos de ${u.nome}: ${txt()}` }, txt(), ui.icone("seta-baixo"));
    b.addEventListener("click", () => {
      const lista = h("div", { class: "flut-lista" }, deps.map(d => h("label", { class: "flut-op" },
        h("input", { type: "checkbox", checked: sel.has(d.id), on: { change: ev => { ev.target.checked ? sel.add(d.id) : sel.delete(d.id); } } }),
        ui.etiqueta({ nome: d.nome, cor: d.cor }))));
      const ok = h("button", { type: "button", class: "bt bt-prim bt-p" }, "Aplicar");
      const f = ui.flutuante(b, h("div", { class: "pilha-p" }, h("p", { class: "rotulo" }, "Departamentos"),
        h("p", { class: "fraco" }, "Nenhum marcado = todos."), lista, ok), { largura: 260 });
      ok.addEventListener("click", () => {
        f.fechar();
        // plano 1000b · UB-090: «Aplicar» sem mudar nada só fecha (nada de chamada nem de «Acesso atualizado.»)
        const antes = new Set(u.departamentos || []);
        if (antes.size === sel.size && [...sel].every(x => antes.has(x))) return;
        salvar(u.conta_id, { departamentos: [...sel] });
      });
    });
    return b;
  }

  function interruptor(u, chave, rotulo) {
    const id = `sw-${chave}-${u.conta_id}`;
    // plano 1000 · AS-265: o texto oculto é o ÚNICO nome (aria-labelledby): o <label> que envolve e aponta por for não soma outra leitura
    const inp = h("input", { type: "checkbox", id, role: "switch", checked: !!u[chave], disabled: !u.editavel, "aria-labelledby": `${id}-rot` });
    inp.addEventListener("change", () => {
      // plano 1000b · UB-089: travado até a resposta — dois toques rápidos não geram duas chamadas fora de ordem
      if (inp.getAttribute("aria-busy") === "true") return;
      inp.disabled = true; inp.setAttribute("aria-busy", "true");
      salvar(u.conta_id, { [chave]: inp.checked }, { focoId: id });
    });
    return h("div", { class: "campo campo-check campo-switch" }, h("label", { for: id }, inp, h("span", { class: "check-marca", "aria-hidden": "true" }), h("span", { class: "sr-only", id: `${id}-rot` }, `${rotulo}: ${u.nome}`)));
  }

  /** plano 1500c · UCB-110: a troca de papel num lugar só (o seletor da tabela e o «Mudar papel» do celular). */
  async function trocarPapel(u, depois, aoDesistir = null) {
    const antes = u.papel;
    if (depois === antes) return;
    // plano 1000 · AS-093: promover a Administrador (acesso total) ou rebaixar um administrador pede confirmação
    if (trocaDePapelPedeConfirmacao(antes, depois)) {
      const ok = await ui.confirmar(depois === "admin"
        ? { titulo: `Tornar ${u.nome} administrador?`, rotulo: "Tornar administrador", texto: "Administradores veem e mudam tudo da empresa, inclusive usuários, números e configurações." }
        : { titulo: `Tirar ${u.nome} de administrador?`, rotulo: `Mudar para ${ROT_PAPEL[depois] || depois}`, perigo: true, texto: "A pessoa perde o acesso às configurações e aos usuários da empresa." });
      if (!ok) { if (aoDesistir) aoDesistir(); return; }
      return salvar(u.conta_id, { papel: depois }, { texto: `${u.nome} agora é ${ROT_PAPEL[depois] || depois}.` });
    }
    return salvar(u.conta_id, { papel: depois }, { desfazer: { papel: antes }, texto: `${u.nome} agora é ${ROT_PAPEL[depois] || depois}.` });
  }

  const colVer = u => interruptor(u, "ver_todas", "Vê as conversas dos colegas");
  const colRodizio = u => interruptor(u, "recebe_conversas", "Recebe conversas novas no rodízio");
  const colAcesso = u => u.ultimo_acesso ? h("span", { title: ui.dataHoraBR(u.ultimo_acesso) }, ui.relativo(u.ultimo_acesso)) : h("span", { class: "fraco" }, "Nunca entrou");
  const MOTIVO_ULTIMO_ADMIN = "A empresa precisa de pelo menos um administrador.";
  const ID_PAPEIS = "cfg-papeis-ajuda";

  function desenhar() {
    ui.limpar(alvo);
    const us = dados.usuarios || [];
    const lim = dados.limite;
    const comDono = us.some(x => typeof x.dono === "boolean");      // UCB-036: o servidor novo diz quem é o dono
    const textoUso = () => lim ? `${dados.uso} de ${lim} usuários do plano (convites pendentes contam).` : `${us.length} ${us.length === 1 ? "pessoa" : "pessoas"} com acesso.`;
    const subUso = h("p", { class: "sub" }, textoUso());
    // plano 1500c · UCB-034: o uso de usuários também em barra (some sem limite)
    const caixaBarra = h("div", { class: "cfg-us-barra" });
    const pintarBarra = () => { ui.limpar(caixaBarra); caixaBarra.hidden = !lim; if (lim) caixaBarra.append(ui.barraUso("Usuários do plano", dados.uso, lim)); };
    pintarBarra();
    // plano 1000 · AS-094: no limite o «Convidar» nem abre (antes o modal abria, a pessoa preenchia e o servidor recusava)
    const cheio = !!lim && dados.uso >= lim;
    const btConvidar = h("button", { type: "button", class: "bt bt-prim", disabled: cheio, "aria-describedby": cheio ? "cfg-us-limite" : null }, ui.icone("convidar"), "Convidar");
    btConvidar.addEventListener("click", () => { if (!btConvidar.disabled) abrirConvite(); });
    const avisoLimite = cheio ? h("p", { class: "aviso aviso-aten cfg-us-limite", id: "cfg-us-limite" }, ui.icone("alerta"),
      h("span", null, `Plano com ${dados.uso} de ${lim} usuários (convites pendentes contam). Revogue um convite, remova alguém ou `,
        h("a", { href: "#/config/plano" }, "veja o Plano e uso"), ".")) : null;
    // UB-092: revogar no lugar atualiza a contagem e libera o «Convidar» sem redesenhar a tabela
    const pintarUso = () => {
      subUso.textContent = textoUso();
      pintarBarra();
      if (lim && dados.uso < lim && btConvidar.disabled) { btConvidar.disabled = false; btConvidar.removeAttribute("aria-describedby"); if (avisoLimite) avisoLimite.remove(); }
      if (lim && dados.uso >= lim && !btConvidar.disabled) btConvidar.disabled = true;
    };
    pint.uso = pintarUso;

    const celularAgora = celular();
    const colPapel = { chave: "papel", rotulo: "Papel", ordenavel: true, render: u => {
      const pilDono = u.dono === true ? ui.pilula("Dono", "sec", { class: "cfg-dono" }) : null;
      // plano 1500c · UCB-015: o único administrador não pode virar outro papel (o servidor recusaria depois da confirmação)
      if (!u.editavel || ehUltimoAdmin(us, u.conta_id) || celularAgora) {
        const pil = ui.pilula(u.gestor ? "Gestor" : ROT_PAPEL[u.papel] || u.papel, u.papel === "admin" ? "prim" : "neutra", { class: "cfg-papel-pil" });
        const nota = u.editavel && !celularAgora && ehUltimoAdmin(us, u.conta_id) ? h("small", { class: "fraco cfg-ultimo-admin" }, "Único administrador") : null;
        return h("span", { class: "adm-pilulas" }, pil, pilDono, nota);
      }
      const s = h("select", { class: "sel papel-sel", "aria-label": `Papel de ${u.nome}`, "aria-describedby": ID_PAPEIS, title: "Veja «O que cada papel pode fazer» acima da tabela" },
        PAPEIS_EMPRESA.map(p => h("option", { value: p.valor, selected: p.valor === u.papel }, p.rotulo)));
      s.addEventListener("change", () => trocarPapel(u, s.value, () => { s.value = u.papel; s.focus(); }));
      return pilDono ? h("span", { class: "adm-pilulas" }, s, pilDono) : s;
    } };

    // plano 1000 · AS-100: com muita gente, busca por nome ou e-mail (sem acento) acima da tabela
    const montarTabela = linhas => ui.tabela({
      rotulo: "Usuários com acesso",
      chave: "conta_id",
      colunas: [
        { chave: "nome", rotulo: "Pessoa", ordenavel: true, principal: true, render: u => h("div", { class: "cel-nome" }, ui.avatar(u.nome, u.conta_id),
          h("div", null, h("b", null, u.nome, u.eu ? " (você)" : ""),
            // plano 1000 · AS-273: quem está com o app aberto agora (acesso nos últimos 5 min)
            estaOnline(u.ultimo_acesso) ? h("span", { class: "cfg-online" }, h("i", { "aria-hidden": "true" }), "online") : null,
            h("small", null, u.email))) },
        colPapel,
        { chave: "departamentos", rotulo: "Departamento", render: seletorDeps },
        // plano 1000b · UB-221: no celular a tabela vira cartão — «Vê colegas», «Rodízio» e «Acesso» vão para um «Mais» recolhido (até 4 linhas por pessoa)
        ...(celularAgora ? [{ chave: "mais", rotulo: "Mais", render: u => h("details", { class: "cfg-us-mais" }, h("summary", null, "Mais"),
          h("div", { class: "pilha-p" },
            h("div", { class: "linha cfg-us-mais-it" }, h("span", { class: "fraco" }, "Vê colegas"), colVer(u)),
            h("div", { class: "linha cfg-us-mais-it" }, h("span", { class: "fraco" }, "Rodízio"), colRodizio(u)),
            h("div", { class: "linha cfg-us-mais-it" }, h("span", { class: "fraco" }, "Acesso"), colAcesso(u)))) }]
          : [
            { chave: "ver_todas", rotulo: "Vê colegas", render: colVer },
            { chave: "recebe_conversas", rotulo: "Rodízio", render: colRodizio },
            { chave: "ultimo_acesso", rotulo: "Acesso", ordenavel: true, render: colAcesso }]),
        { chave: "acoes", rotulo: "Ações", alinhar: "dir", render: u => {
          if (!u.editavel) return h("span", { class: "sr-only" }, "Sem ações");
          const b = h("button", { type: "button", class: "bt-icone", "aria-label": `Ações para ${u.nome}` }, ui.icone("opcoes"));
          const ultimo = ehUltimoAdmin(us, u.conta_id);
          b.addEventListener("click", () => ui.menu(b, [
            // plano 1500c · UCB-110: no celular o papel é pílula e muda por aqui
            celularAgora ? { rotulo: "Mudar papel", icone: "usuario", desabilitado: ultimo, motivo: ultimo ? MOTIVO_ULTIMO_ADMIN : null, fn: () => mudarPapelModal(u) } : null,
            // plano 1000b · UB-091: o link vale 24 h — um toque errado no menu não cria um sem a pessoa confirmar
            { rotulo: "Gerar link de nova senha", icone: "cadeado", fn: async () => {
              if (!(await ui.confirmar({ titulo: `Gerar um link de nova senha para ${u.nome}?`, rotulo: "Gerar link",
                texto: "O link vale 24 horas e só uma vez. Quem abrir cria uma senha nova e as sessões abertas dessa conta são encerradas." }))) return;
              return linkSenha(u);
            } },
            // plano 1500c · UCB-037: trocar o e-mail de login (só quando o servidor tem a função — dados.trocar_email)
            dados.trocar_email === true ? { rotulo: "Trocar e-mail", icone: "editar", fn: () => trocarEmail(u) } : null,
            // plano 1500c · UCB-036: tornar dono (só com o servidor que conhece o dono)
            comDono && u.dono !== true ? { rotulo: "Tornar dono", icone: "chave", fn: () => tornarDono(u) } : null,
            "-",
            // UCB-015: o último administrador não sai (o motivo aparece no próprio item)
            { rotulo: "Remover acesso", icone: "lixeira", perigo: true, desabilitado: ultimo, motivo: ultimo ? MOTIVO_ULTIMO_ADMIN : null, fn: () => remover(u) },
          ].filter(Boolean)));
          return b;
        } },
      ],
      linhas,
      vazio: us.length ? (soNunca ? "Todo mundo já entrou pelo menos uma vez." : "Ninguém com esse nome ou e-mail.") : "Ninguém com acesso ainda. Convide a equipe.",
    });
    // plano 1000 · AS-235: #/config/usuarios?dep=<id> (o atalho do cartão do departamento) mostra só quem é daquele departamento
    const depQ = ctx.rota && ctx.rota.query && ctx.rota.query.dep;
    const depFiltro = depQ ? (dados.departamentos || []).find(d => d.id === depQ) || null : null;
    const usVis = depFiltro ? us.filter(u => (u.departamentos || []).includes(depFiltro.id)) : us;
    const buscaUs = us.length >= 8 ? h("input", { type: "search", class: "cfg-us-busca-inp", placeholder: "Buscar por nome ou e-mail", "aria-label": "Buscar pessoa por nome ou e-mail", autocomplete: "off", value: termoUs }) : null;
    if (!buscaUs) termoUs = "";
    const nunca = nuncaEntraram(usVis.filter(u => !u.gestor));
    if (!nunca.length) soNunca = false;
    const filtrar = () => { const base = soNunca ? nuncaEntraram(usVis.filter(u => !u.gestor)) : usVis; return termoUs ? filtrarUsuarios(base, termoUs) : base; };
    // UB-088: o redesenho (depois de salvar) mantém o filtro digitado
    let tab = montarTabela(filtrar());
    const caixaTab = h("div", { class: "cfg-us-tab", tabindex: "-1" }, tab.el);
    const chipDep = depFiltro ? h("p", { class: "linha cfg-us-dep" }, ui.pilula(`Departamento ${depFiltro.nome} · ${usVis.length} ${usVis.length === 1 ? "pessoa" : "pessoas"}`, "info"),
      h("a", { href: "#/config/usuarios", class: "bt bt-fant bt-p" }, ui.icone("fechar"), "Ver todos")) : null;
    const statusUs = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });
    const repintarTabela = () => {
      const vis = filtrar();
      tab = montarTabela(vis);
      ui.limpar(caixaTab); caixaTab.appendChild(tab.el);
      statusUs.textContent = termoUs.trim() || soNunca ? `${vis.length} ${vis.length === 1 ? "pessoa encontrada" : "pessoas encontradas"}.` : "";
    };
    if (buscaUs) buscaUs.addEventListener("input", ui.debounce(() => { termoUs = buscaUs.value; repintarTabela(); }, 150));
    // plano 1500c · UCB-033: «Nunca entraram (N)» filtra quem ainda não usou o sistema
    const chipNunca = nunca.length ? h("button", { type: "button", class: "bt bt-fant bt-p cfg-us-nunca", "aria-pressed": String(soNunca) }, `Nunca entraram (${nunca.length})`) : null;
    if (chipNunca) chipNunca.addEventListener("click", () => { soNunca = !soNunca; chipNunca.setAttribute("aria-pressed", String(soNunca)); repintarTabela(); });
    // plano 1500c · UCB-032: o que cada papel pode fazer, recolhido acima da tabela (o seletor aponta para cá)
    const ajudaPapeis = h("details", { class: "cfg-papeis" }, h("summary", null, "O que cada papel pode fazer"),
      h("dl", { class: "cfg-papeis-lista", id: ID_PAPEIS }, PAPEIS_EMPRESA.flatMap(p => [h("dt", null, p.rotulo), h("dd", null, p.ajuda)])));

    // plano 1000b · UB-092: revogar tira só o item da lista de convites — a tabela de usuários não some nem pisca com o esqueleto
    const caixaConv = h("div", { class: "cfg-conv-lista" });
    const titConv = h("h2", { tabindex: "-1" }, "Convites pendentes");
    const pintarConvites = () => { ui.limpar(caixaConv); caixaConv.append(listaDeConvites()); };
    pint.convites = pintarConvites;
    const itemConvite = cv => {
      const b = h("button", { type: "button", class: "bt bt-fant bt-p cfg-conv-revogar" }, "Revogar");
      b.addEventListener("click", async () => {
        if (!(await ui.confirmar({ titulo: "Revogar convite?", texto: "O link deixa de funcionar na hora.", rotulo: "Revogar", perigo: true }))) return;
        const lista = [...caixaConv.querySelectorAll(".cfg-conv-revogar")];
        const pos = lista.indexOf(b);
        try {
          await ui.carregando(b, api.rpcC("nx_convite_revogar", { p_convite: cv.id }));
          dados.convites = (dados.convites || []).filter(x => x.id !== cv.id);
          if (!cv.vencido && typeof dados.uso === "number" && dados.uso > 0) dados.uso--;      // convite pendente contava no limite: a vaga volta
          pintarConvites(); pintarUso();
          ui.toast("Convite revogado.", { tipo: "ok" });
          // plano 1500c · UCB-038: o foco vai ao próximo «Revogar» (ou ao título da lista), não cai no body
          const restantes = [...caixaConv.querySelectorAll(".cfg-conv-revogar")];
          const alvoFoco = restantes[Math.min(pos, restantes.length - 1)] || titConv;
          try { alvoFoco.focus(); } catch { /* ok */ }
        } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      });
      // plano 1500c · UCB-027: «Gerar de novo» revoga e cria outro igual (papel, nome, e-mail, departamentos), sem preencher tudo
      const bNovo = h("button", { type: "button", class: "bt bt-sec bt-p cfg-conv-novo" }, ui.icone("reabrir"), "Gerar de novo");
      bNovo.addEventListener("click", () => regerarConvite(cv, bNovo));
      // plano 1000 · AS-099: papel em destaque (pílula) e os departamentos escolhidos (quando o servidor manda)
      const depsCv = (Array.isArray(cv.departamentos) ? cv.departamentos : []).map(id => ((dados.departamentos || []).find(d => d.id === id) || {}).nome).filter(Boolean);
      const logo = !cv.vencido && conviteVenceLogo(cv.expira_em);
      return h("div", { class: ["convite-item", logo && "cfg-conv-logo"] }, ui.icone("link"),
        h("div", null,
          h("div", { class: "linha cfg-conv-tit" }, h("b", null, cv.nome || cv.email || "Convite sem nome"),
            ui.pilula(ROT_PAPEL[cv.papel] || cv.papel || "Papel", cv.papel === "admin" ? "prim" : "neutra", { class: "cfg-conv-papel" }),
            // plano 1500c · UCB-028: menos de 24 h para vencer → em destaque
            logo ? ui.pilula("vence hoje", "aten", { class: "cfg-conv-vence" }) : null),
          h("small", null, [cv.email && cv.nome ? cv.email : null, Array.isArray(cv.departamentos) ? (depsCv.length ? `Departamentos: ${depsCv.join(", ")}` : "Todos os departamentos") : null,
            cv.vencido ? `venceu ${ui.relativo(cv.expira_em)} sem uso` : `vence ${ui.relativo(cv.expira_em)}`].filter(Boolean).join(" · "))),
        h("div", { class: "linha cfg-conv-acoes" }, cv.vencido || logo ? bNovo : null, cv.vencido ? null : b));
    };
    const listaDeConvites = () => {
      const todos = dados.convites || [];
      const ativos = todos.filter(c => !c.vencido), vencidos = todos.filter(c => c.vencido);
      return h("div", { class: "pilha-p" },
        ativos.length ? h("div", { class: "lista-convites" }, ativos.map(itemConvite)) : h("p", { class: "fraco" }, "Nenhum convite aguardando."),
        // plano 1500c · UCB-029: os que venceram sem uso (quando o servidor manda «vencido»)
        vencidos.length ? h("div", { class: "pilha-p cfg-conv-vencidos" }, h("p", { class: "rotulo" }, "Venceram sem uso"),
          h("div", { class: "lista-convites" }, vencidos.map(itemConvite))) : null);
    };
    pintarConvites();

    alvo.append(
      h("div", { class: "cartao" },
        h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Usuários e convites"), subUso,
          h("p", { class: "fraco" }, "Vê colegas: enxerga as conversas atribuídas a outras pessoas. Rodízio: recebe conversas novas automaticamente.")), btConvidar),
        caixaBarra,
        avisoLimite,
        chipDep,
        ajudaPapeis,
        buscaUs || chipNunca ? h("div", { class: "linha cfg-us-filtros" }, buscaUs ? h("label", { class: "busca cfg-us-busca" }, ui.icone("busca"), buscaUs) : null, chipNunca) : null,
        statusUs,
        caixaTab),
      h("div", { class: "cartao cfg-conv-cartao" },
        h("div", { class: "cartao-cab" }, h("div", null, titConv,
          h("p", { class: "sub" }, "Links gerados que ainda não foram usados. Quem abrir cria a conta; se já usar o sistema, entra com a senha atual."))),
        caixaConv));
  }

  /** UCB-110: no celular, «Mudar papel» abre um seletor num modal curto. */
  async function mudarPapelModal(u) {
    const form = h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: `Papel de ${u.nome}`, nome: "papel", tipo: "select", valor: u.papel, opcoes: PAPEIS_EMPRESA.map(p => ({ valor: p.valor, rotulo: p.rotulo })) }),
      h("dl", { class: "cfg-papeis-lista" }, PAPEIS_EMPRESA.flatMap(p => [h("dt", null, p.rotulo), h("dd", null, p.ajuda)])));
    const r = await ui.modal({ titulo: "Mudar papel", corpo: form, largura: "p",
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Aplicar", tipo: "primario", fn: async () => ui.lerForm(form).papel }] });
    if (r && r !== u.papel) await trocarPapel(u, r);
  }

  /** UCB-037: nx_usuario_email_trocar(p_conta, p_email) — só aparece quando o servidor anuncia (dados.trocar_email). */
  async function trocarEmail(u) {
    const form = h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: "E-mail novo", nome: "email", tipo: "email", valor: u.email || "", autocomplete: "off", ajuda: "É o login da pessoa. As sessões abertas dela são encerradas." }));
    const r = await ui.modal({ titulo: `Trocar o e-mail de ${u.nome}`, corpo: form, largura: "p", acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Trocar e-mail", tipo: "primario", fn: async () => {
      ui.marcarErro(form, null);
      const email = normEmail(ui.lerForm(form).email);
      if (!RE_EMAIL.test(email)) { ui.marcarErro(form, "email", "Esse e-mail não parece válido."); return false; }
      if (email === normEmail(u.email)) { ui.marcarErro(form, "email", "É o mesmo e-mail de agora."); return false; }
      try { return (await api.rpcC("nx_usuario_email_trocar", { p_conta: u.conta_id, p_email: email })) || { ok: true }; }
      catch (e) { if (e && e.codigo === "email_em_uso") { ui.marcarErro(form, "email", "Esse e-mail já é de outra conta."); return false; } throw e; }
    } }] });
    if (!r) return;
    if (r && Array.isArray(r.usuarios)) dados = r; else { const x = (dados.usuarios || []).find(y => y.conta_id === u.conta_id); if (x) x.email = normEmail(ui.lerForm(form).email); }
    ui.toast(`E-mail de ${u.nome} trocado.`, { tipo: "ok" });
    desenhar();
  }

  /** UCB-036: nx_dono_transferir(p_conta) com confirmação digitada. */
  async function tornarDono(u) {
    if (!(await ui.confirmar({ titulo: `Tornar ${u.nome} o dono da empresa?`, perigo: true, rotulo: "Tornar dono", digitar: "dono",
      texto: "O dono é quem responde pela conta: só ele (ou quem cuida do seu plano) passa a administração principal adiante, e nenhum outro administrador pode removê-lo." }))) return;
    try {
      const r = await api.rpcC("nx_dono_transferir", { p_conta: u.conta_id });
      if (r && Array.isArray(r.usuarios)) dados = r;
      else for (const x of dados.usuarios || []) x.dono = x.conta_id === u.conta_id;
      ui.toast(`${u.nome} agora é o dono da empresa.`, { tipo: "ok" });
      desenhar();
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }

  /** UCB-017: o convite recém-criado entra na lista e no uso sem recarregar a seção. */
  function acrescentarConvite(r, pd) {
    dados.convites = [...(dados.convites || []), { id: r && r.id != null ? r.id : `novo-${Date.now()}`, papel: pd.papel, nome: pd.nome || null, email: pd.email || null,
      departamentos: pd.departamentos || [], expira_em: r && r.expira_em }];
    if (typeof dados.uso === "number") dados.uso++;
    pint.convites(); pint.uso();
  }

  /** UCB-016: o erro do nx_convite_criar no campo certo; devolve true quando tratou. */
  function erroDoConvite(form, e, campoEmail = "email") {
    const c = e && e.codigo, hint = String((e && e.hint) || "");
    if (c === "email_invalido") { ui.marcarErro(form, campoEmail, "Esse e-mail não parece válido."); return true; }
    if (c === "nome_invalido") { ui.marcarErro(form, "nome", "Use de 2 a 80 letras no nome."); return true; }
    if (c === "dados_invalidos" && /departamentos/.test(hint)) { ui.marcarErro(form, "departamentos", "Algum departamento escolhido não existe mais. Revise a lista."); return true; }
    if (c === "dados_invalidos" && /dias/.test(hint)) { ui.marcarErro(form, "dias", "Escolha uma das validades da lista."); return true; }
    if (c === "limite_plano") {
      ui.marcarErro(form, campoEmail, "O plano não tem mais vagas de usuário.");
      ui.toast("Sem vagas de usuário no plano: revogue um convite, remova alguém ou veja o Plano e uso.", { tipo: "erro", acao: { rotulo: "Plano e uso", fn: () => ctx.navegar("#/config/plano") } });
      return true;
    }
    return false;
  }

  /** UCB-027: revoga o convite antigo e cria outro com os mesmos dados; o link novo aparece no modal de link. */
  async function regerarConvite(cv, botao) {
    const pd = dadosParaReconvite(cv);
    let r;
    try {
      r = await ui.carregando(botao, (async () => {
        if (!cv.vencido) await api.rpcC("nx_convite_revogar", { p_convite: cv.id });
        dados.convites = (dados.convites || []).filter(x => x.id !== cv.id);
        if (!cv.vencido && typeof dados.uso === "number" && dados.uso > 0) dados.uso--;
        return api.rpcC("nx_convite_criar", { p_dados: pd, p_org: null });
      })());
    } catch (e) { pint.convites(); pint.uso(); ui.toast(api.mensagemErro(e), { tipo: "erro" }); return; }
    acrescentarConvite(r, pd);
    const saud = pd.nome ? `Olá, ${String(pd.nome).split(" ")[0]}!` : "Olá!";
    await ui.modal({ titulo: "Convite gerado de novo", largura: "m",
      corpo: h("div", { class: "pilha" },
        h("p", null, "O link antigo deixou de valer. Envie este para a pessoa — ele não chega por e-mail."),
        ui.blocoLink(linkCompleto(ctx, r.link), { rotulo: "Link do convite", textoWhats: `${saud} Você foi convidado para acessar a ${ctx.cliente.nome} no ${ctx.shell.marcaEfetiva().produto}. Crie seu acesso por este link:` }),
        r.expira_em ? h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(r.expira_em)} e só uma vez.`) : null),
      acoes: [{ rotulo: "Concluir", tipo: "primario", valor: true }] });
  }

  async function abrirConvite() {
    const deps = dados.departamentos || [];
    const idAjudaPapel = `ajuda-papel-${++_seqAjuda}`;      // plano 1000b · UB-093: id único por abertura
    // plano 1500c · UCB-030: «Vários e-mails» — um convite por e-mail, no limite das vagas do plano
    let varios = false;
    const caixaUm = h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome (opcional)", nome: "nome", max: 80, autocomplete: "off" }),
      // plano 1500c · UCB-031: o e-mail informado trava o convite (só ele aceita)
      ui.campo({ rotulo: "E-mail (opcional)", nome: "email", tipo: "email", autocomplete: "off", ajuda: "Se preencher, só este e-mail poderá aceitar o convite." }));
    const caixaVarios = h("div", { class: "pilha-p", hidden: true },
      ui.campo({ rotulo: "E-mails", nome: "emails", tipo: "textarea", linhas: 4, autocomplete: "off", ajuda: "Um por linha, ou separados por vírgula ou ponto e vírgula. Cada pessoa recebe um link próprio." }));
    const btVarios = h("button", { type: "button", class: "bt bt-fant bt-p cfg-conv-varios", "aria-pressed": "false" }, ui.icone("convidar"), "Convidar várias pessoas de uma vez");
    btVarios.addEventListener("click", () => {
      varios = !varios;
      btVarios.setAttribute("aria-pressed", String(varios));
      caixaUm.hidden = varios; caixaVarios.hidden = !varios;
      btVarios.lastChild.textContent = varios ? "Convidar uma pessoa só" : "Convidar várias pessoas de uma vez";
    });
    const form = h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: "Papel", nome: "papel", tipo: "select", valor: "atendente", opcoes: PAPEIS_EMPRESA.map(p => ({ valor: p.valor, rotulo: p.rotulo })) }),
      h("p", { class: "campo-ajuda", id: idAjudaPapel }, PAPEIS_EMPRESA[2].ajuda),
      caixaUm, caixaVarios, h("div", { class: "linha" }, btVarios),
      deps.length ? ui.campo({ rotulo: "Departamentos", nome: "departamentos", tipo: "multipla", opcoes: deps.map(d => ({ valor: d.id, rotulo: d.nome })), ajuda: "Nenhum marcado = todos." }) : null,
      ui.campo({ rotulo: "O link vale por", nome: "dias", tipo: "select", valor: DIAS_CONVITE_PADRAO, opcoes: [["1", "1 dia"], ["3", "3 dias"], ["7", "7 dias"], ["14", "14 dias"], ["30", "30 dias (menos seguro)"]].map(([v, r]) => ({ valor: v, rotulo: r })) }));
    // plano 1000 · AS-297: 3 dias por padrão; escolher 30 mostra o risco
    const selDias = form.querySelector("select[name=dias]");
    const avisoDias = h("p", { class: "aviso aviso-aten cfg-conv-30", role: "status", hidden: true }, ui.icone("alerta"), h("span"));
    selDias.closest(".campo").appendChild(avisoDias);
    selDias.addEventListener("change", () => { const t = avisoValidadeConvite(selDias.value); avisoDias.hidden = !t; avisoDias.lastChild.textContent = t; });
    const selPapel = form.querySelector("select[name=papel]");
    // UB-093: a explicação do papel faz parte da descrição do seletor — trocar o papel, o leitor de tela lê o que ele pode fazer
    selPapel.setAttribute("aria-describedby", [...new Set([...(selPapel.getAttribute("aria-describedby") || "").split(" ").filter(Boolean), idAjudaPapel])].join(" "));
    selPapel.addEventListener("change", () => { const p = PAPEIS_EMPRESA.find(x => x.valor === selPapel.value); form.querySelector(`#${idAjudaPapel}`).textContent = p ? p.ajuda : ""; });
    let criado = null, repetirPendente = null;
    await ui.modal({
      titulo: "Convidar para a equipe", corpo: form, largura: "m",
      acoes: [
        { rotulo: "Cancelar", tipo: "neutro" },
        { rotulo: "Gerar link", tipo: "primario", fn: async m => {
          if (criado) return true;
          ui.marcarErro(form, null);
          const d = ui.lerForm(form);
          const base = { papel: d.papel, departamentos: d.departamentos || [], dias: Number(d.dias) || Number(DIAS_CONVITE_PADRAO) };
          if (varios) return criarVarios(m, form, d, base);
          const email = normEmail(d.email);
          if (email && !RE_EMAIL.test(email)) { ui.marcarErro(form, "email", "Esse e-mail não parece válido."); return false; }
          // plano 1500c · UCB-014: e-mail de quem já tem acesso não gasta vaga; com convite aguardando, pergunta antes
          const dup = conviteDuplicado(dados, email);
          if (dup === "membro") { ui.marcarErro(form, "email", "Essa pessoa já tem acesso a esta empresa."); return false; }
          if (dup === "pendente" && repetirPendente !== email) {
            if (!(await ui.confirmar({ titulo: "Já há um convite para esse e-mail", rotulo: "Gerar outro", texto: "Gerar outro cria mais um link (e ocupa mais uma vaga do plano até ser usado ou revogado). Gerar assim mesmo?" }))) return false;
            repetirPendente = email;
          }
          const pd = { ...base, nome: d.nome || null, email: email || null };
          let r;
          // plano 1500c · UCB-016: cada erro do servidor vai para o seu campo e o modal continua aberto
          try { r = await api.rpcC("nx_convite_criar", { p_dados: pd, p_org: null }); }
          catch (e) { if (erroDoConvite(form, e)) return false; throw e; }
          criado = r;
          acrescentarConvite(r, pd);
          const link = linkCompleto(ctx, r.link);
          const saud = d.nome ? `Olá, ${d.nome.split(" ")[0]}!` : "Olá!";
          ui.limpar(m.corpo);
          m.corpo.append(
            h("div", { class: "aviso aviso-ok" }, ui.icone("check"), h("p", null, "Convite criado. Envie o link para a pessoa — ele não chega por e-mail.")),
            ui.blocoLink(link, { rotulo: "Link do convite", textoWhats: `${saud} Você foi convidado para acessar a ${ctx.cliente.nome} no ${ctx.shell.marcaEfetiva().produto}. Crie seu acesso por este link:`,
              // plano 1000 · AS-272: abre as Conversas com o texto pronto no campo (não envia sozinho); só com o módulo de Conversas
              // plano 1000b · UB-199: o texto (com o TOKEN do convite) não vai mais no endereço das Conversas (parâmetro «texto»), que ficava no histórico
              // do navegador e em Recentes: segue pela área de transferência — o mesmo caminho que Conversas já usava sem conversa aberta
              central: typeof ctx.temModulo === "function" && !ctx.temModulo("conversas") ? null : texto => {
                m.fechar(true);
                Promise.resolve(ui.copiar(String(texto).slice(0, 1000), { aviso: "Texto do convite copiado. Abra a conversa da pessoa e cole no campo para enviar." })).catch(() => {});
                const ir = () => ctx.navegar("#/conversas");
                if (ui.camadas && typeof ui.camadas.aposVolta === "function") ui.camadas.aposVolta(ir); else ir();
              } }),
            h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(r.expira_em)} e só uma vez.`));
          trocarRodape(m);
          return false;
        } },
      ],
    });

    function trocarRodape(m) {
      const bt = m.el.querySelector(".modal-rod [data-tipo=primario]");
      if (bt) bt.textContent = "Concluir";
      const cancelar = m.el.querySelector(".modal-rod [data-tipo=neutro]");
      if (cancelar) cancelar.hidden = true;
    }
    /** UCB-030: um convite por e-mail válido (sem repetir quem já tem acesso), dentro das vagas do plano. */
    async function criarVarios(m, form, d, base) {
      const { validos, invalidos } = separarEmails(d.emails);
      if (invalidos.length) { ui.marcarErro(form, "emails", `Não parecem e-mails: ${invalidos.slice(0, 5).join(", ")}${invalidos.length > 5 ? "…" : ""}`); return false; }
      const membros = validos.filter(e => conviteDuplicado(dados, e) === "membro");
      const novos = validos.filter(e => !membros.includes(e));
      if (!novos.length) { ui.marcarErro(form, "emails", validos.length ? "Todas essas pessoas já têm acesso." : "Escreva pelo menos um e-mail."); return false; }
      const vagas = dados.limite ? Math.max(0, dados.limite - (dados.uso || 0)) : Infinity;
      if (novos.length > vagas) { ui.marcarErro(form, "emails", `O plano tem ${vagas} ${vagas === 1 ? "vaga" : "vagas"} de usuário e a lista tem ${novos.length} e-mails.`); return false; }
      const feitos = [], falhas = [];
      for (const email of novos) {
        const pd = { ...base, nome: null, email };
        try { const r = await api.rpcC("nx_convite_criar", { p_dados: pd, p_org: null }); feitos.push({ email, r }); acrescentarConvite(r, pd); }
        catch (e) { falhas.push(`${email} (${api.mensagemErro(e)})`); if (e && e.codigo === "limite_plano") break; }
      }
      if (!feitos.length) { ui.marcarErro(form, "emails", `Nenhum convite criado: ${falhas[0] || "tente de novo"}.`); return false; }
      criado = feitos;
      ui.limpar(m.corpo);
      m.corpo.append(
        h("div", { class: "aviso aviso-ok" }, ui.icone("check"), h("p", null, `${feitos.length} ${feitos.length === 1 ? "convite criado" : "convites criados"}. Envie cada link para a pessoa — eles não chegam por e-mail.`)),
        membros.length ? h("p", { class: "fraco" }, `Já tinham acesso (sem convite): ${membros.join(", ")}.`) : null,
        falhas.length ? h("p", { class: "aviso aviso-aten" }, ui.icone("alerta"), h("span", null, `Não deu para convidar: ${falhas.join("; ")}.`)) : null,
        h("div", { class: "pilha cfg-conv-links" }, feitos.map(f => ui.blocoLink(linkCompleto(ctx, f.r.link), { rotulo: f.email,
          textoWhats: `Olá! Você foi convidado para acessar a ${ctx.cliente.nome} no ${ctx.shell.marcaEfetiva().produto}. Crie seu acesso por este link:` }))));
      trocarRodape(m);
      return false;
    }
  }

  async function linkSenha(u) {
    try {
      const r = await api.rpcC("nx_senha_link_criar", { p_conta: u.conta_id });
      const link = linkCompleto(ctx, r.link);
      await ui.modal({
        titulo: "Link de nova senha", largura: "m",
        corpo: h("div", { class: "pilha" },
          h("p", null, `Envie para ${u.nome}. Quem abrir cria uma senha nova e todas as sessões abertas dessa conta são encerradas.`),
          ui.blocoLink(link, { rotulo: "Link de nova senha", textoWhats: `Olá, ${String(u.nome).split(" ")[0]}! Crie sua senha nova por este link:` }),
          h("p", { class: "fraco" }, `Vale por 24 horas (até ${ui.dataHoraBR(r.expira_em)}) e só uma vez.`)),
        acoes: [{ rotulo: "Concluir", tipo: "primario", valor: true }],
      });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }

  async function remover(u) {
    // plano 1500c · UCB-035: com o número de conversas abertas dela (quando o servidor manda), a confirmação diz o que acontece com elas
    const n = Number.isFinite(Number(u.conversas_abertas)) && u.conversas_abertas !== null ? Number(u.conversas_abertas) : null;
    const extra = n === null ? " Ela sai do rodízio de conversas novas." : n === 0 ? " Ela sai do rodízio e não tem conversas abertas."
      : ` Ela sai do rodízio e tem ${n} ${n === 1 ? "conversa aberta, que volta" : "conversas abertas, que voltam"} para a fila.`;
    const ok = await ui.confirmar({ titulo: `Remover o acesso de ${u.nome}?`, texto: `A conta continua existindo; ela só deixa de entrar nesta empresa. Conversas e registros dela ficam.${extra}`, rotulo: "Remover acesso", perigo: true });
    if (!ok) return;
    try {
      dados = await api.rpcC("nx_usuario_remover", { p_conta: u.conta_id });
      ui.toast("Acesso removido.", { tipo: "ok" });
      desenhar();
      // plano 1500c · UCB-039: o foco fica no cartão de usuários (busca ou tabela) e o leitor ouve o que aconteceu
      const foco = alvo.querySelector(".cfg-us-busca-inp") || alvo.querySelector(".cfg-us-tab");
      try { if (foco) foco.focus(); } catch { /* ok */ }
      if (typeof ui.anunciar === "function") ui.anunciar(`Acesso de ${u.nome} removido.`);
    }
    catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }

  // plano 1500c · UCB-022: girar a tela (ou mudar a largura da janela) troca o layout da tabela na hora
  let mq = null, aoGirar = null;
  try {
    if (typeof matchMedia === "function") {
      mq = matchMedia("(max-width: 760px)");
      let antes = !!mq.matches;
      aoGirar = () => { const agora = !!mq.matches; if (agora === antes) return; antes = agora; if (dados && alvo.isConnected) desenhar(); };
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", aoGirar);
    }
  } catch { mq = null; }
  await carregar();
  return () => { try { if (mq && aoGirar && typeof mq.removeEventListener === "function") mq.removeEventListener("change", aoGirar); } catch { /* ok */ } };
}

/* ============================================================
   MARCA, DOMÍNIO, PLANO E USO (P0-B)
   ============================================================ */
function secoesMarcaPlano() {
  return [
    { id: "marca", titulo: "Marca e tema", desc: "Logo, cores e a tela de entrada", grupo: "Marca", icone: "pincel", semCliente: true, visivel: podeMarca, montar: secaoMarca },
    { id: "dominio", titulo: "Domínio próprio", desc: "O app no seu endereço, com a sua marca", grupo: "Marca", icone: "globo", conta: "gestor", montar: secaoDominio },
    { id: "plano", titulo: "Plano e uso", desc: "Limites do plano e o uso do mês", grupo: "Plano", icone: "cartao", papelMin: "admin", montar: secaoPlano },
  ];
}

/**
 * Mini tela de entrada para a prévia da Marca (item 56): recebe as mesmas variáveis do tema que o mini-app e os textos do login.
 * Devolve { el, atualizar(ef, {logo}) }. Tudo dentro é decoração (role=img no contêiner): nada aqui é um controle de verdade.
 */
export function montarPreviaLogin(ui) {
  const h = ui.h;
  const logo = h("span", { class: "pv-login-logo" });
  const prod = h("b", { class: "pv-login-prod" });
  const tit = h("p", { class: "pv-login-tit" });
  const txt = h("p", { class: "pv-login-txt" });
  const rod = h("p", { class: "pv-login-rodape" });
  const el = h("div", { class: "pv-login", role: "img", "aria-label": "Pré-visualização da tela de entrada com a marca" },
    h("div", { class: "pv-login-palco", "aria-hidden": "true" },
      h("div", { class: "pv-login-marca" }, logo, prod),
      tit, txt,
      h("div", { class: "pv-login-cartao" },
        h("span", { class: "pv-login-campo" }, h("small", null, "E-mail"), h("span", null, "voce@suaempresa.com.br")),
        h("span", { class: "pv-login-campo" }, h("small", null, "Senha"), h("span", null, "••••••••")),
        h("span", { class: "bt bt-prim pv-login-bt" }, "Entrar"),
        h("span", { class: "pv-link" }, "Esqueci a senha")),
      rod));
  return {
    el,
    atualizar(ef = {}, { logo: lg = null } = {}) {
      ui.limpar(logo);
      logo.append(lg ? h("img", { src: lg, alt: "" }) : h("svg", { class: "pv-marca", viewBox: "0 0 48 48", "aria-hidden": "true" }, h("use", { href: "#marca-orbita" })));
      prod.textContent = ef.produto || "";
      tit.textContent = ef.login_titulo || "Anúncio, conversa e venda na mesma órbita.";
      txt.textContent = ef.login_texto || "Entre com o e-mail e a senha que você recebeu.";
      rod.textContent = ef.suporte_wa ? "Precisa de ajuda? Fale com o suporte pelo WhatsApp." : "";
      rod.hidden = !ef.suporte_wa;
    },
  };
}

const EQUIPE = ["gestor", "super"];
/** Tema da empresa: admin com o módulo `marca` no plano, ou a equipe (gestor/super) — §3.4. */
function podeTema(ctx) { return !!ctx.cliente && ctx.pode("admin") && (ctx.temModulo("marca") || EQUIPE.includes(ctx.cliente.papel)); }
/** Marca da org: conta de gestor (revenda) ou super (plataforma). */
function podeOrg(ctx) { return ctx.sessao.conta.papel === "gestor" && !!ctx.sessao.org; }
function podeMarca(ctx) { return podeTema(ctx) || podeOrg(ctx); }

function erroCod(codigo) { return Object.assign(new Error(codigo), { codigo }); }

/* ---------------- imagens (reimplementa a lógica do web/marca.js: canvas, WebP, ≤ 60 KB) ---------------- */
const LIMITE_LOGO = 60 * 1024;
const LIMITE_FAVICON = 28000;

function paraDataUrl(blob) {
  return new Promise((ok, falha) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result));
    fr.onerror = () => falha(erroCod("leitura"));
    fr.readAsDataURL(blob);
  });
}
async function desenharReduzido(bmp, W, H, { quadrado = false, png = false, q = .9 } = {}) {
  const esc = Math.min(1, W / bmp.width, H / bmp.height);
  const w = quadrado ? W : Math.max(1, Math.round(bmp.width * esc));
  const hh = quadrado ? H : Math.max(1, Math.round(bmp.height * esc));
  const c = document.createElement("canvas");
  c.width = w; c.height = hh;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  if (quadrado) {
    const e = Math.min(W / bmp.width, H / bmp.height), dw = bmp.width * e, dh = bmp.height * e;
    g.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else g.drawImage(bmp, 0, 0, w, hh);
  let blob = png ? null : await new Promise(r => c.toBlob(r, "image/webp", q));
  if (!blob || blob.type !== "image/webp") blob = await new Promise(r => c.toBlob(r, "image/png"));
  if (!blob) throw erroCod("canvas");
  return paraDataUrl(blob);
}
function amostraPx(bmp) {
  try {
    const c = document.createElement("canvas");
    c.width = 48; c.height = 48;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, 48, 48);
    return g.getImageData(0, 0, 48, 48).data;
  } catch { return null; }
}
/** Arquivo PNG/JPEG/WebP → { url: data URL dentro do limite, px: amostra para cores sugeridas }. */
async function processarImagem(arquivo, { W = 320, H = 160, limite = LIMITE_LOGO, quadrado = false, png = false } = {}) {
  if (!arquivo || !/^image\/(png|jpeg|webp)$/.test(arquivo.type)) throw erroCod("formato");
  if (arquivo.size > 8 * 1024 * 1024) throw erroCod("arquivo_grande");
  const bmp = await createImageBitmap(arquivo);
  try {
    let url = await desenharReduzido(bmp, W, H, { quadrado, png, q: .9 });
    if (url.length > limite) url = await desenharReduzido(bmp, Math.round(W * .6), Math.round(H * .6), { quadrado, png, q: .75 });
    if (url.length > limite) throw erroCod("arquivo_grande");
    return { url, px: amostraPx(bmp) };
  } finally { if (bmp.close) bmp.close(); }
}
/** Cores sugeridas de uma imagem já salva (data: ou https com CORS); falha em silêncio. */
async function pxDeUrl(url) {
  try {
    const img = new Image();
    img.decoding = "async";
    if (!url.startsWith("data:")) img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const bmp = await createImageBitmap(img);
    const px = amostraPx(bmp);
    if (bmp.close) bmp.close();
    return px;
  } catch { return null; }
}
function textoErroImagem(e) {
  const c = e && e.codigo;
  if (c === "formato") return "Use uma imagem PNG, JPEG ou WebP (SVG não é aceito).";
  if (c === "arquivo_grande") return "A imagem ficou grande demais mesmo reduzida. Tente um arquivo mais simples.";
  return "Não foi possível ler essa imagem. Tente outro arquivo.";
}

/* ---------------- seção: Marca e tema ---------------- */
async function secaoMarca(ctx, alvo) {
  const { ui } = ctx;
  const h = ui.h;
  const temTema = podeTema(ctx), temOrg = podeOrg(ctx);
  const org = ctx.sessao.org;
  const nomeOrg = ctx.sessao.conta.super ? "plataforma" : (org ? org.nome : "agência");
  const itens = [
    temTema ? { id: "tema", rotulo: `Tema da ${ctx.cliente.nome}`, icone: "empresa" } : null,
    temOrg ? { id: "org", rotulo: ctx.sessao.conta.super ? "Marca da plataforma" : `Marca da ${nomeOrg}`, icone: "pincel" } : null,
  ].filter(Boolean);
  const de = ctx.rota && ctx.rota.query ? ctx.rota.query.de : null;      // plano 1500c · UCB-020: rota sem query não quebra
  let ativa = itens.some(i => i.id === de) ? de : itens[0].id;
  let limpar = null;
  let montagemMarca = 0;
  const corpo = h("div", { class: "pilha" });
  const explica = h("p", { class: "sub" });
  const sujoAgora = () => !!(limpar && typeof limpar.sujo === "function" && limpar.sujo());
  function abrir(id) {
    ativa = id;
    if (limpar) try { limpar(); } catch { /* ok */ }
    limpar = null;
    explica.textContent = id === "tema"
      ? `Logo e cores só desta empresa. Quem entra na ${ctx.cliente.nome} vê o app com elas; o resto segue a marca da ${nomeOrg}.`
      : (ctx.sessao.conta.super
        ? "A marca padrão do produto: nome, logo, cores e a tela de entrada. Vale para os clientes da plataforma sem tema próprio."
        : "O app com a SUA marca para todos os seus clientes: nome do produto, logo, cores, tela de entrada e WhatsApp de suporte.");
    // plano 1000 · AS-102: cada aba ganha um contêiner próprio e só a última montagem vale — trocar rápido não deixa o editor antigo
    // terminar depois e pintar por cima do novo (nem devolver a limpeza errada)
    const eu = ++montagemMarca;
    const caixa = h("div", { class: "pilha" });
    ui.limpar(corpo); corpo.appendChild(caixa);
    editorMarca(ctx, caixa, { tipo: id, org }).then(f => {
      if (eu !== montagemMarca) { try { if (f) f(); } catch { /* ok */ } return; }
      limpar = f;
    }).catch(e => {
      // plano 1500c · UCB-021: falha fora da carga não deixa a aba presa no esqueleto
      if (eu !== montagemMarca) return;
      console.error("config marca", e);
      ui.limpar(caixa);
      caixa.append(ui.erroCartao(e, () => abrir(id)));
    });
  }
  let ab = null;
  if (itens.length > 1) {
    ab = ui.abas({ itens, ativo: ativa, rotulo: "O que editar", aoMudar: async id => {
      if (id === ativa) return;
      // plano 1000 · AS-103: trocar de aba com cor/logo mexidos e não salvos pergunta antes de descartar
      if (sujoAgora() && !(await ui.confirmar({ titulo: "Descartar as mudanças da marca?", rotulo: "Descartar", perigo: true,
        texto: "As mudanças desta aba ainda não foram salvas e serão perdidas." }))) { ab.ativar(ativa); return; }
      abrir(id);
    } });
    alvo.append(ab.el);
  }
  alvo.append(explica, corpo);
  abrir(ativa);
  return {
    limpar: () => { montagemMarca++; if (limpar) limpar(); },
    pendente: sujoAgora,
    podeSair: async () => !sujoAgora() || ui.confirmar({ titulo: "Sair sem salvar a marca?", rotulo: "Sair sem salvar", perigo: true,
      texto: "As mudanças de logo e cores ainda não foram salvas e serão perdidas." }),
  };
}

/**
 * Editor de marca com pré-visualização ao vivo (T14 → Marca; também usado pelo Admin → Revendas).
 * tipo 'tema' = tema da empresa ativa (logo, logo claro, cores) · 'org' = marca de uma org (tudo de §4.2.1).
 * Devolve uma função de limpeza (desfaz o "Ver no app inteiro").
 */
export async function editorMarca(ctx, alvo, { tipo = "tema", org = null, aoSalvar = null } = {}) {
  const { ui, api } = ctx;
  const h = ui.h;
  const T = ctx.shell.tema;
  const soTema = tipo === "tema";
  ui.limpar(alvo);
  alvo.appendChild(ui.esqueleto("cartoes", 2));

  let base = {}, reserva = {}, orgMarca = {}, orgInfo = null;
  try {
    if (soTema) {
      const r = await api.rpcC("nx_cliente_tema");
      base = (r && r.tema) || {};
      reserva = (r && r.marca_cliente) || {};
      orgMarca = ctx.shell.marcaOrg() || {};
    } else {
      const lista = await api.rpc("nx_orgs_listar");
      orgInfo = (lista || []).find(o => org && o.id === org.id) || null;
      if (!orgInfo) throw erroCod("sem_permissao");
      base = orgInfo.marca || {};
    }
  } catch (e) {
    ui.limpar(alvo);
    alvo.appendChild(ui.erroCartao(e, () => editorMarca(ctx, alvo, { tipo, org, aoSalvar })));
    return () => {};
  }

  // ---- estado de trabalho
  const coresOrg = T.marcaEfetiva(soTema ? orgMarca : base, {}).cores;
  const m = soTema
    ? { logo: base.logo || "", logo_claro: base.logo_claro || "", cores: { ...coresOrg, ...(reserva.corMarca && T.corValida(reserva.corMarca) ? { primaria: reserva.corMarca.toUpperCase() } : {}), ...(base.cores || {}) } }
    : { produto: base.produto || "", assinatura: base.assinatura || "", logo: base.logo || "", logo_claro: base.logo_claro || "", favicon: base.favicon || "",
        cores: { ...coresOrg, ...(base.cores || {}) }, login_titulo: base.login_titulo || "", login_texto: base.login_texto || "", suporte_wa: base.suporte_wa || "" };
  let coresProprias = soTema ? !!(base.cores && Object.keys(base.cores).length) : true;
  let appInteiro = false;
  let salvo = JSON.stringify(payload());

  function payload() {
    const r = {};
    const chaves = soTema ? ["logo", "logo_claro"] : ["produto", "assinatura", "logo", "logo_claro", "favicon", "login_titulo", "login_texto", "suporte_wa"];
    for (const k of chaves) {
      let v = typeof m[k] === "string" ? m[k].trim() : "";
      if (k === "suporte_wa") v = v.replace(/\D/g, "");
      if (v) r[k] = v;
    }
    if (!soTema || coresProprias) {
      const c = {};
      for (const k of ["primaria", "secundaria", "fundo"]) { const x = T.normalizarHex(m.cores[k]); if (x) c[k] = x; }
      if (Object.keys(c).length) r.cores = c;
    }
    return r;
  }
  function efetiva() {
    const p = payload();
    // a reserva do painel clássico (cfg.corMarca/logoUrl) vale como no shell: só onde o tema não tem valor
    if (soTema) return T.marcaEfetiva(orgMarca, p, reserva);
    return T.marcaEfetiva(p, {});
  }
  const sujo = () => JSON.stringify(payload()) !== salvo;

  // ---- formulário de textos (org)
  const form = h("form", { class: "pilha", novalidate: true });
  form.addEventListener("submit", ev => ev.preventDefault());
  if (!soTema) {
    form.append(
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Nome do produto", nome: "produto", valor: m.produto, max: T.LIMITES_MARCA.produto, placeholder: T.PADRAO.produto, ajuda: "Aparece no menu, na aba do navegador e na tela de entrada." }),
        ui.campo({ rotulo: "Assinatura", nome: "assinatura", valor: m.assinatura, max: T.LIMITES_MARCA.assinatura, placeholder: "Equipe Sorriso", ajuda: "Usada pela IA e nos textos automáticos." })));
  }
  const formEntrada = h("form", { class: "pilha", novalidate: true });
  formEntrada.addEventListener("submit", ev => ev.preventDefault());
  // plano 1000 · AS-109: prévia do link do «Falar com o suporte» (o número errado abria conversa com outra pessoa)
  const previaWa = h("p", { class: "fraco cfg-wa-previa", "aria-live": "polite" });
  // plano 1500c · UCB-058: «Testar» abre o wa.me do número digitado (para conferir que é o certo)
  const testarWa = h("a", { class: "bt bt-fant bt-p cfg-wa-testar", target: "_blank", rel: "noopener noreferrer", hidden: true }, ui.icone("whatsapp"), "Testar");
  // plano 1500c · UC-033: sem WhatsApp de suporte os clientes ficam sem botão de ajuda e de contratar — a revenda é avisada
  const avisoSemWa = h("p", { class: "aviso aviso-aten cfg-sem-wa", role: "note", hidden: true }, ui.icone("alerta"),
    h("span", null, "Sem WhatsApp de suporte, seus clientes não têm botão de ajuda nem de contratar (no teste, na suspensão e em «Esqueci a senha»)."));
  const pintarPreviaWa = () => {
    const v = String(m.suporte_wa || "").trim();
    const r = suporteWaValido(v);
    previaWa.textContent = !v ? "" : r.ok ? `O botão de suporte abre: wa.me/${r.digitos}` : r.erro;
    previaWa.classList.toggle("campo-erro", !!v && !r.ok);
    testarWa.hidden = !(v && r.ok);
    if (v && r.ok) testarWa.setAttribute("href", `https://wa.me/${r.digitos}`);
    avisoSemWa.hidden = !!v;
  };
  if (!soTema) {
    formEntrada.append(
      ui.campo({ rotulo: "Título da tela de entrada", nome: "login_titulo", valor: m.login_titulo, max: T.LIMITES_MARCA.login_titulo, placeholder: "Anúncio, conversa e venda na mesma órbita." }),
      ui.campo({ rotulo: "Texto de apoio", nome: "login_texto", tipo: "textarea", linhas: 2, valor: m.login_texto, max: T.LIMITES_MARCA.login_texto, placeholder: "Entre com o e-mail e a senha que você recebeu." }),
      ui.campo({ rotulo: "WhatsApp de suporte", nome: "suporte_wa", tipo: "tel", valor: m.suporte_wa, placeholder: "5512999998888", ajuda: "Só números, com 55 e DDD. Aparece em \"Esqueci a senha\" e nos avisos de teste e suspensão." }),
      h("div", { class: "linha cfg-wa-linha" }, previaWa, testarWa), avisoSemWa);
  }
  for (const f of [form, formEntrada]) {
    f.addEventListener("input", ev => {
      const n = ev.target && ev.target.name;
      if (!n || !(n in m) || n === "cores") return;
      m[n] = ev.target.value;
      ui.marcarErro(f, n, null);
      atualizar();
    });
  }

  // ---- imagens
  const sugestoes = h("div", { class: "cores-sug", "aria-live": "polite" });
  function mostrarSugestoes(px) {
    ui.limpar(sugestoes);
    const cores = px ? T.coresSugeridas(px, 5) : [];
    if (!cores.length) return;
    sugestoes.append(h("span", { class: "rotulo" }, "Cores do logo"));
    for (const c of cores) {
      const b = h("button", { type: "button", class: "cor-op", style: { "--cor": ui.corOk(c) }, "aria-label": `Usar a cor ${c} do logo`, title: c });
      b.addEventListener("click", () => ui.menu(b, [
        { rotulo: "Usar como primária", icone: "pincel", fn: () => usarCor("primaria", c) },
        { rotulo: "Usar como secundária", icone: "pincel", fn: () => usarCor("secundaria", c) },
        { rotulo: "Usar como fundo", icone: "pincel", fn: () => usarCor("fundo", c) },
      ]));
      sugestoes.append(b);
    }
  }
  let colarLogo = null;         // AS-110: Ctrl+V de uma imagem no editor vai para o logo
  function controleImagem({ chave, rotulo, ajuda, claro = false, favicon = false }) {
    const amostra = h("div", { class: ["logo-amostra", claro && "claro", favicon && "favicon"], title: "Arraste uma imagem para cá" });
    const arquivo = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
    const btEnviar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("clipe"), "Enviar imagem");
    const btRemover = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("lixeira"), "Remover");
    const extra = favicon ? h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("copiar"), "Gerar do logo") : null;
    // plano 1500c · UCB-062: o erro tem id e entra na descrição do «Enviar imagem» enquanto estiver visível
    const idErro = `img-erro-${chave}-${++_seqAjuda}`;
    const erro = h("small", { class: "campo-erro", role: "alert", hidden: true, id: idErro });
    const mostrarErro = txt => { erro.textContent = txt; erro.hidden = false; btEnviar.setAttribute("aria-describedby", idErro); };
    const esconderErro = () => { erro.hidden = true; btEnviar.removeAttribute("aria-describedby"); };
    const avisoProp = h("p", { class: "aviso aviso-aten img-aviso", role: "status", hidden: true });
    function desenhar() {
      ui.limpar(amostra);
      avisoProp.hidden = true;
      const u = T.imagemSegura(m[chave]);
      if (u) {
        const im = h("img", { src: u, alt: `${rotulo} atual` });
        // logo estreito/alto demais: avisa na prévia (o ícone da aba é sempre quadrado e fica de fora)
        if (!favicon) im.addEventListener("load", () => {
          const txt = avisoProporcaoLogo(im.naturalWidth, im.naturalHeight);
          ui.limpar(avisoProp);
          if (txt) avisoProp.append(ui.icone("alerta"), h("span", null, txt));
          avisoProp.hidden = !txt;
        });
        amostra.append(im);
      // plano 1500c · UCB-063: a amostra vazia diz que aceita arrastar/colar (só com mouse — o CSS esconde no toque)
      } else amostra.append(h("span", { class: "fraco" }, "Sem imagem"), h("small", { class: "fraco logo-arraste" }, "ou arraste/cole aqui"));
      btRemover.hidden = !u;
    }
    btEnviar.addEventListener("click", () => arquivo.click());
    btRemover.addEventListener("click", () => {
      // plano 1000b · UB-262: «Remover» guarda a imagem anterior e oferece «Desfazer» (antes era preciso achar o arquivo de novo)
      const antes = m[chave];
      m[chave] = ""; desenhar(); if (chave === "logo") mostrarSugestoes(null); atualizar();
      ui.toast(`${rotulo} removido da prévia. Só vale ao salvar a marca.`, { tipo: "info", acao: { rotulo: "Desfazer", fn: () => {
        if (m[chave]) return;          // já pôs outra imagem: não troca por cima
        m[chave] = antes; desenhar(); atualizar();
        if (chave === "logo") { const u = T.imagemSegura(antes); if (u) pxDeUrl(u).then(px => { if (px) mostrarSugestoes(px); }); }
        ui.anunciar(`${rotulo} de volta na pré-visualização.`);
      } } });
    });
    async function usarArquivo(f) {
      if (!f) return;
      esconderErro();
      try {
        const r = await ui.carregando(btEnviar, processarImagem(f, favicon ? { W: 64, H: 64, limite: LIMITE_FAVICON, quadrado: true, png: true } : {}));
        m[chave] = r.url;
        if (chave === "logo") mostrarSugestoes(r.px);
        desenhar(); atualizar();
        ui.anunciar(`${rotulo} atualizado na pré-visualização.`);
      } catch (e) { mostrarErro(textoErroImagem(e)); }
    }
    arquivo.addEventListener("change", () => {
      const f = arquivo.files && arquivo.files[0];
      arquivo.value = "";
      usarArquivo(f);
    });
    // plano 1000 · AS-110: arrastar o arquivo para a amostra também troca a imagem (o mesmo processarImagem do botão)
    amostra.addEventListener("dragover", ev => { if (!ev.dataTransfer || ![...(ev.dataTransfer.types || [])].includes("Files")) return; ev.preventDefault(); amostra.classList.add("logo-alvo"); });
    amostra.addEventListener("dragleave", () => amostra.classList.remove("logo-alvo"));
    amostra.addEventListener("drop", ev => {
      amostra.classList.remove("logo-alvo");
      const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (!f) return;
      ev.preventDefault();
      usarArquivo(f);
    });
    if (chave === "logo") colarLogo = usarArquivo;
    if (extra) extra.addEventListener("click", async () => {
      const u = T.imagemSegura(m.logo);
      if (!u) { mostrarErro("Envie o logo primeiro."); return; }
      try {
        // plano 1000 · AS-105: decodificar e redesenhar um logo grande demora — o botão mostra que está trabalhando
        m.favicon = await ui.carregando(extra, (async () => {
          // plano 1500c · UCB-006: logo por https (painel clássico) com crossOrigin — senão o canvas fica «sujo» e o toBlob falha
          const img = new Image();
          if (!String(u).startsWith("data:")) img.crossOrigin = "anonymous";
          img.src = u; await img.decode();
          const bmp = await createImageBitmap(img);
          try { return await desenharReduzido(bmp, 64, 64, { quadrado: true, png: true }); } finally { if (bmp.close) bmp.close(); }
        })());
        esconderErro(); desenhar(); atualizar();
        ui.anunciar("Ícone da aba gerado a partir do logo.");
      } catch {
        mostrarErro(String(u).startsWith("data:") ? "Não foi possível gerar o ícone a partir do logo."
          : "Não foi possível gerar o ícone a partir deste logo (ele está em outro endereço). Envie o logo como arquivo para gerar o ícone.");
      }
    });
    desenhar();
    return h("div", { class: "img-campo" },
      h("div", { class: "img-campo-txt" }, h("b", null, rotulo), ajuda ? h("small", { class: "campo-ajuda" }, ajuda) : null),
      h("div", { class: "logo-caixa" }, amostra, h("div", { class: "linha" }, btEnviar, extra, btRemover), arquivo), erro, avisoProp);
  }

  // ---- cores
  const seletores = {};
  // plano 1500c · UCB-064: o grupo das cores tem nome para o leitor de tela
  const caixaCores = h("fieldset", { class: "pilha cores-caixa" }, h("legend", { class: "sr-only" }, "Cores da marca"));
  // plano 1500c · UCB-108: desligado, diz por que não dá para escolher
  const notaCoresOff = h("p", { class: "fraco cfg-cores-off", hidden: true }, "Ligue «Usar cores próprias nesta empresa» para escolher as cores.");
  const ROT = { primaria: "Cor primária", secundaria: "Cor secundária", fundo: "Cor de fundo" };
  const AJ = {
    primaria: "Botões, destaques e links. O texto sobre ela é escolhido sozinho para ficar legível.",
    secundaria: "Detalhes, gráficos e o segundo brilho do fundo.",
    fundo: "Escuro vira o palco noturno; claro vira o tema claro. O contraste do texto é garantido.",
  };
  for (const k of ["primaria", "secundaria", "fundo"]) {
    const sc = ui.seletorCor({ valor: m.cores[k], paleta: k === "fundo" ? T.FUNDOS : ctx.paleta, rotulo: ROT[k],
      aoMudar: c => { m.cores[k] = c; atualizar(); } });
    seletores[k] = sc;
    caixaCores.append(h("div", { class: "cor-campo" }, h("div", { class: "img-campo-txt" }, h("b", null, ROT[k]), h("small", { class: "campo-ajuda" }, AJ[k])), sc));
  }
  function usarCor(k, c) {
    m.cores[k] = T.normalizarHex(c);
    if (soTema && !coresProprias) { coresProprias = true; if (swProprias) swProprias.checked = true; caixaCores.disabled = false; notaCoresOff.hidden = true; }
    seletores[k].definir(m.cores[k]);
    atualizar();
  }
  let swProprias = null;
  const blocoProprias = soTema ? (() => {
    const c = ui.campo({ tipo: "interruptor", nome: "cores_proprias", rotulo: "Usar cores próprias nesta empresa", valor: coresProprias,
      ajuda: reserva.corMarca ? `Desligado, vale a cor do painel clássico (${reserva.corMarca}) e as cores da ${ctx.sessao.org ? ctx.sessao.org.nome : "agência"}.` : `Desligado, vale a marca da ${ctx.sessao.org ? ctx.sessao.org.nome : "agência"}.` });
    swProprias = c.querySelector("input");
    swProprias.addEventListener("change", () => { coresProprias = swProprias.checked; caixaCores.disabled = !coresProprias; notaCoresOff.hidden = coresProprias; atualizar(); });
    caixaCores.disabled = !coresProprias;
    notaCoresOff.hidden = coresProprias;
    return c;
  })() : null;

  // ---- pré-visualização ao vivo (mini-app com as variáveis aplicadas SÓ nele)
  const pvLogo = h("span", { class: "pv-logo" });
  const pvProduto = h("b", null);
  const pvEsquema = h("span", { class: "pilula pilula-neutra" });
  const previa = h("div", { class: "previa", role: "img", "aria-label": "Pré-visualização do app com a marca" },
    h("div", { class: "pv-lat", "aria-hidden": "true" }, pvLogo,
      h("span", { class: "pv-ic on" }, ui.icone("inicio")), h("span", { class: "pv-ic" }, ui.icone("chat")),
      h("span", { class: "pv-ic" }, ui.icone("funil")), h("span", { class: "pv-ic" }, ui.icone("grafico"))),
    h("div", { class: "pv-main", "aria-hidden": "true" },
      h("div", { class: "pv-topo" }, pvProduto, h("span", { class: "linha" }, h("span", { class: "pilula pilula-prim" }, "3 novas"), h("span", { class: "pv-av" }, "JP"))),
      h("div", { class: "pv-corpo" },
        h("div", { class: "pv-kpis" },
          h("div", { class: "pv-kpi" }, h("small", null, "Conversas"), h("b", null, "128")),
          h("div", { class: "pv-kpi" }, h("small", null, "Fechados"), h("b", { class: "luz" }, "21")),
          h("div", { class: "pv-kpi" }, h("small", null, "Receita"), h("b", null, "18,4 mil"))),
        h("div", { class: "pv-dupla" },
          h("div", { class: "pv-kanban" },
            h("div", { class: "pv-col" }, h("div", { class: "pv-col-h", style: { "--cor": "var(--pal-0)" } }, h("i"), "Nova conversa"),
              h("div", { class: "pv-card" }, "Marina Alves", h("small", null, "Anúncio · há 5 min")),
              h("div", { class: "pv-card" }, "Carlos Dias", h("small", null, "Indicação"))),
            h("div", { class: "pv-col" }, h("div", { class: "pv-col-h", style: { "--cor": "var(--pal-4)" } }, h("i"), "Fechou"),
              h("div", { class: "pv-card" }, "Ana Souza", h("small", null, "R$ 2.400")))),
          h("div", { class: "pv-chat" },
            h("div", { class: "pv-bolha pv-in" }, "Oi! Vi o anúncio, ainda tem horário amanhã?"),
            h("div", { class: "pv-bolha pv-out" }, "Tem sim! Às 14h ou às 16h?"),
            h("div", { class: "pv-bolha pv-nota" }, "Nota interna: paciente indicou a amiga."))),
        h("div", { class: "pv-botoes" },
          h("span", { class: "bt bt-prim" }, "Agendar"), h("span", { class: "bt bt-sec" }, "Transferir"),
          h("span", { class: "pv-link" }, "Ver histórico"), h("span", { class: "pilula pilula-ok" }, "Fechou"), h("span", { class: "pilula pilula-sec" }, "Meta")))));
  // a mesma marca na tela de entrada (item 56): alterna com o mini-app; as duas prévias recebem as variáveis do tema
  const pvLogin = montarPreviaLogin(ui);
  pvLogin.el.hidden = true;
  // plano 1500c · UCB-059: a marca numa tela de celular (topo com o logo, cartões e o menu de baixo)
  const pvCelLogo = h("span", { class: "pv-cel-logo" });
  const pvCelProd = h("b", { class: "pv-cel-prod" });
  const pvCel = h("div", { class: "pv-cel", role: "img", "aria-label": "Pré-visualização do app no celular", hidden: true },
    h("div", { class: "pv-cel-tela", "aria-hidden": "true" },
      h("div", { class: "pv-cel-topo" }, pvCelLogo, pvCelProd, h("span", { class: "pv-av" }, "JP")),
      h("div", { class: "pv-cel-corpo" },
        h("div", { class: "pv-kpi" }, h("small", null, "Conversas"), h("b", null, "128")),
        h("div", { class: "pv-card" }, "Marina Alves", h("small", null, "Anúncio · há 5 min")),
        h("div", { class: "pv-bolha pv-out" }, "Tem sim! Às 14h ou às 16h?"),
        h("span", { class: "bt bt-prim" }, "Agendar")),
      h("div", { class: "pv-cel-nav" }, ["inicio", "chat", "funil", "grafico"].map((ic, i) => h("span", { class: ["pv-ic", i === 0 && "on"] }, ui.icone(ic))))));
  // plano 1500c · UCB-060: a aba do navegador com o ícone e o nome do produto (o favicon antes só era conferido salvando)
  const pvAbaIc = h("span", { class: "pv-aba-ic" });
  const pvAbaNome = h("span", { class: "pv-aba-nome" });
  const pvAba = h("div", { class: "pv-aba", role: "img", "aria-label": "Pré-visualização da aba do navegador" }, h("span", { class: "pv-aba-guia", "aria-hidden": "true" }, pvAbaIc, pvAbaNome));
  const segPrevia = ui.segmentado({ tipo: "abas", rotulo: "Qual prévia mostrar", valor: "app", classe: "marca-seg",
    opcoes: [{ valor: "app", rotulo: "App", icone: "inicio" }, { valor: "celular", rotulo: "Celular", icone: "telefone" }, { valor: "entrada", rotulo: "Tela de entrada", icone: "cadeado" }],
    aoMudar: v => { previa.hidden = v !== "app"; pvLogin.el.hidden = v !== "entrada"; pvCel.hidden = v !== "celular"; } });
  const segPreviaEl = segPrevia && segPrevia.nodeType ? segPrevia : segPrevia.el;     // ui.segmentado devolve o elemento (ou {el}, nas versões anteriores)
  // AS-112: «Claro / Escuro» na prévia (botões alternáveis; o marcado é o esquema mostrado agora)
  let esquemaPrevia = null;
  const segEsquema = T.FUNDOS_ESQUEMA ? h("div", { class: "linha cfg-esq-prev", role: "group", "aria-label": "Ver a prévia em" },
    [["claro", "Claro"], ["escuro", "Escuro"]].map(([k, rot]) => {
      const b = h("button", { type: "button", class: "bt bt-fant bt-p", "aria-pressed": "false", dataset: { esq: k } }, rot);
      b.addEventListener("click", () => { esquemaPrevia = k; atualizar(); });
      return b;
    })) : null;
  const avisos = h("div", { class: "avisos-marca", "aria-live": "polite" });
  const estado = h("small", { class: "fraco marca-estado", "aria-live": "polite" });

  const btApp = h("button", { type: "button", class: "bt bt-sec", "aria-pressed": "false" }, ui.icone("olho"), "Ver no app inteiro");
  // plano 1500c · UCB-065: o rótulo diz que as cores próprias desligam (não que as da agência são copiadas)
  const btPadrao = h("button", { type: "button", class: "bt bt-fant" }, soTema ? "Voltar às cores da " + (ctx.sessao.org ? ctx.sessao.org.nome : "agência") : "Cores padrão");
  // revisão 1000b · UB-122: data-escrita — sem internet o shell (app.js SEL_ESCRITA) marca este botão aria-disabled com a dica antes do clique
  const btSalvar = h("button", { type: "button", class: "bt bt-prim", "data-escrita": "" }, ui.icone("check"), "Salvar marca");

  function logoPrevia(ef, escuroDado = null) {
    // plano 1500c · UCB-066: quem chama pode dizer o esquema (a tela de entrada usa o do tema aplicado nela, não o dataset do mini-app)
    const escuro = typeof escuroDado === "boolean" ? escuroDado : previa.dataset.esquema !== "claro";
    return soTema ? ((escuro ? ef.logo_cliente : (ef.logo_cliente_claro || ef.logo_cliente)) || (escuro ? ef.logo : (ef.logo_claro || ef.logo)))
      : (escuro ? ef.logo : (ef.logo_claro || ef.logo));
  }
  function atualizar() {
    const ef = efetiva();
    const t = T.derivarTema(ef.cores);
    // plano 1000 · AS-112: a prévia mostra a mesma marca no outro esquema (fundo claro/escuro padrão), sem mudar o que será salvo
    const esqMarca = t.escuro ? "escuro" : "claro";
    const outro = esquemaPrevia && esquemaPrevia !== esqMarca && T.FUNDOS_ESQUEMA ? T.derivarTema({ ...ef.cores, fundo: T.FUNDOS_ESQUEMA[esquemaPrevia] }) : null;
    const tv = outro || t;
    T.aplicarTema(tv.vars, previa);
    ui.limpar(pvLogo);
    const lg = logoPrevia(ef);
    pvLogo.append(lg ? h("img", { src: lg, alt: "" }) : h("svg", { class: "pv-marca", viewBox: "0 0 48 48", "aria-hidden": "true" }, h("use", { href: "#marca-orbita" })));
    pvProduto.textContent = ef.produto;
    pvEsquema.textContent = (t.escuro ? "Palco escuro" : "Tema claro") + (outro ? " · prévia no outro esquema" : "");
    if (segEsquema) for (const b of segEsquema.querySelectorAll("button")) { const on = b.dataset.esq === (esquemaPrevia || esqMarca); b.setAttribute("aria-pressed", String(on)); }
    T.aplicarTema(tv.vars, pvLogin.el);
    pvLogin.atualizar(ef, { logo: logoPrevia(ef, !!tv.escuro) });      // UCB-066
    // UCB-059 / UCB-060: celular e aba do navegador com a mesma marca
    T.aplicarTema(tv.vars, pvCel);
    ui.limpar(pvCelLogo);
    pvCelLogo.append(lg ? h("img", { src: lg, alt: "" }) : h("svg", { class: "pv-marca", viewBox: "0 0 48 48", "aria-hidden": "true" }, h("use", { href: "#marca-orbita" })));
    pvCelProd.textContent = ef.produto || "";
    ui.limpar(pvAbaIc);
    const fav = T.imagemSegura(soTema ? ef.favicon : m.favicon) || T.imagemSegura(ef.favicon);
    pvAbaIc.append(fav ? h("img", { src: fav, alt: "" }) : h("svg", { class: "pv-marca", viewBox: "0 0 48 48", "aria-hidden": "true" }, h("use", { href: "#marca-orbita" })));
    pvAbaNome.textContent = ef.produto || "";
    pvAba.setAttribute("aria-label", `Aba do navegador: ${fav ? "com o ícone" : "sem ícone próprio"}, «${ef.produto || ""}»`);
    // plano 1000b · UB-200: as regiões vivas só são reescritas quando o TEXTO muda — digitar o hex não faz o leitor repetir o aviso a cada tecla
    const chaveAvisos = t.avisos.map(a => a.texto).join("\n");
    if (avisos.dataset.chave !== chaveAvisos || !avisos.firstChild) {
      avisos.dataset.chave = chaveAvisos;
      ui.limpar(avisos);
      if (t.avisos.length) for (const a of t.avisos) avisos.append(h("div", { class: "aviso aviso-aten" }, ui.icone("alerta"), h("p", null, a.texto)));
      else avisos.append(h("div", { class: "aviso aviso-ok" }, ui.icone("check"), h("p", null, "Contraste conferido: textos, links e botões legíveis.")));
    }
    const s = sujo();
    const txtEstado = s ? "Alterações ainda não salvas." : "Tudo salvo.";
    if (estado.textContent !== txtEstado) estado.textContent = txtEstado;
    // plano 1000 · AS-104: sem mudança não há o que salvar — plano 1000b · UB-261: aria-disabled (o Tab ainda alcança) e o clique diz o porquê
    btSalvar.setAttribute("aria-disabled", String(!s));
    if (!soTema) pintarPreviaWa();
    if (appInteiro) ctx.shell.pintarMarca(ef);
  }
  btApp.addEventListener("click", () => {
    appInteiro = !appInteiro;
    // plano 1000b · UB-095: um padrão só — texto fixo + aria-pressed (antes o texto virava «Voltar ao tema salvo» E ficava «pressionado»)
    btApp.setAttribute("aria-pressed", String(appInteiro));
    if (appInteiro) { ctx.shell.pintarMarca(efetiva()); ui.toast("Mostrando o app inteiro com a marca nova (só para você, até salvar).", { tipo: "info" }); }
    else ctx.shell.aplicarMarcaCliente();
  });
  btPadrao.addEventListener("click", () => {
    if (soTema) {
      coresProprias = false; if (swProprias) swProprias.checked = false; caixaCores.disabled = true; notaCoresOff.hidden = false;
      if (typeof ui.anunciar === "function") ui.anunciar("Cores próprias desligadas.");      // UCB-065
    } else {
      // plano 1500c · UCB-056: as três cores trocadas de uma vez voltam com «Desfazer»
      const antes = { ...m.cores };
      for (const k of ["primaria", "secundaria", "fundo"]) { m.cores[k] = T.PADRAO.cores[k]; seletores[k].definir(m.cores[k]); }
      ui.toast("Cores padrão na prévia. Só vale ao salvar a marca.", { tipo: "info", acao: { rotulo: "Desfazer", fn: () => {
        for (const k of ["primaria", "secundaria", "fundo"]) { m.cores[k] = antes[k]; seletores[k].definir(m.cores[k]); }
        atualizar();
        if (typeof ui.anunciar === "function") ui.anunciar("Cores anteriores de volta na pré-visualização.");
      } } });
    }
    atualizar();
  });
  btSalvar.addEventListener("click", async () => {
    if (btSalvar.getAttribute("aria-disabled") === "true") { ui.toast("Nada para salvar: a marca está igual à salva.", { tipo: "info" }); return; }      // UB-261
    ui.marcarErro(form, null); ui.marcarErro(formEntrada, null);
    const p = payload();
    let erros = T.validarMarca(p, soTema);
    if (!soTema && !p.produto) erros.push({ campo: "produto", texto: "Informe o nome do produto." });
    // plano 1000b · UB-178: uma frase só para o WhatsApp de suporte (a do tema.js saía junto, diferente)
    if (!soTema && m.suporte_wa && !suporteWaValido(m.suporte_wa).ok) erros = [...erros.filter(e => e.campo !== "suporte_wa"), { campo: "suporte_wa", texto: suporteWaValido(m.suporte_wa).erro }];
    if (erros.length) {
      for (const e of erros) {
        if (form.querySelector(`[name="${e.campo}"]`)) ui.marcarErro(form, e.campo, e.texto);
        else if (formEntrada.querySelector(`[name="${e.campo}"]`)) ui.marcarErro(formEntrada, e.campo, e.texto);
      }
      // plano 1000b · UB-094: marcarErro foca cada campo; o foco termina no PRIMEIRO erro (na ordem da tela), não no último
      const primeiro = [form, formEntrada].map(f => f.querySelector("[data-campo][data-estado=erro] input, [data-campo][data-estado=erro] textarea, [data-campo][data-estado=erro] select")).find(Boolean);
      if (primeiro) try { primeiro.focus({ preventScroll: false }); } catch { /* ok */ }
      ui.toast(erros[0].texto, { tipo: "erro" });
      return;
    }
    // plano 1500c · UCB-055: contraste ruim não sai sem a pessoa confirmar (numa revenda, vai para todos os clientes)
    const avisosContraste = (T.derivarTema(efetiva().cores).avisos || []).map(a => a.texto).filter(Boolean);
    if (avisosContraste.length && !(await ui.confirmar({ titulo: "Há textos difíceis de ler com estas cores", rotulo: "Salvar assim mesmo",
      texto: `${avisosContraste.join(" ")} Salvar assim mesmo?${soTema ? "" : " A marca vale para todos os seus clientes."}` }))) return;
    try {
      if (soTema) await ui.carregando(btSalvar, api.rpcC("nx_tema_salvar", { p_tema: p }));
      else {
        const r = await ui.carregando(btSalvar, api.rpc("nx_org_salvar", { p_org: { id: orgInfo.id, marca: p } }));
        if (r && r.marca) orgInfo.marca = r.marca;
      }
      salvo = JSON.stringify(p);
      if (appInteiro) { appInteiro = false; btApp.setAttribute("aria-pressed", "false"); }
      ui.toast(soTema ? "Tema salvo. Quem entrar nesta empresa já vê a marca nova." : "Marca salva. A tela de entrada e o app já usam a marca nova.", { tipo: "ok" });
      try { await ctx.shell.recarregarMarca(); } catch { /* aparece na próxima entrada */ }
      atualizar();
      if (aoSalvar) try { aoSalvar(p); } catch { /* ok */ }
    } catch (e) {
      const campo = e && e.codigo === "marca_invalida" && e.hint;
      if (campo && form.querySelector(`[name="${campo}"]`)) ui.marcarErro(form, campo, api.mensagemErro(e));
      else if (campo && formEntrada.querySelector(`[name="${campo}"]`)) ui.marcarErro(formEntrada, campo, api.mensagemErro(e));
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });

  // plano 1500c · UCB-057: o link de entrada completo (com o domínio ativo da agência, quando houver) e «Copiar»
  const origemApp = typeof location !== "undefined" && location.origin && location.origin !== "null" ? location.origin : "";
  const txtLinkEntrada = h("span", { class: "mono cfg-link-entrada-txt" });
  const btCopiarEntrada = h("button", { type: "button", class: "bt bt-sec bt-p cfg-link-entrada-copiar" }, ui.icone("copiar"), "Copiar link de entrada");
  let linkEntrada = "";
  const pintarLinkEntrada = dominio => { linkEntrada = linkEntradaOrg(origemApp, orgInfo ? orgInfo.slug : "", dominio); txtLinkEntrada.textContent = linkEntrada; };
  btCopiarEntrada.addEventListener("click", () => ui.copiar(linkEntrada, { aviso: "Link de entrada copiado." }));
  const linhaLinkEntrada = soTema ? null : h("p", { class: "linha cfg-link-entrada" }, txtLinkEntrada, btCopiarEntrada);
  if (!soTema) {
    pintarLinkEntrada(null);
    if (!ctx.sessao.conta.super) Promise.resolve().then(() => api.rpc("nx_dominios_listar")).then(l => {
      const d = (Array.isArray(l) ? l : []).find(x => x && x.status === "ativo" && !x.cliente && typeof x.host === "string");
      if (d) pintarLinkEntrada(d.host);
    }).catch(() => { /* fica o link padrão */ });
  }

  // ---- montagem
  const cartao = (titulo, sub, ...filhos) => h("div", { class: "cartao" },
    h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, titulo), sub ? h("p", { class: "sub" }, sub) : null)), ...filhos);
  const imagens = [
    // plano 1500c · UCB-061: o formato ideal, não só o limite
    controleImagem({ chave: "logo", rotulo: "Logo", ajuda: "PNG com fundo transparente, de preferência horizontal (até 320 × 160). Também aceita JPEG e WebP. Reduzimos para até 60 KB." }),
    controleImagem({ chave: "logo_claro", rotulo: "Logo para fundo claro", ajuda: "Opcional: usado quando o fundo é claro.", claro: true }),
    soTema ? null : controleImagem({ chave: "favicon", rotulo: "Ícone da aba", ajuda: "Quadrado, 64 × 64. Pode gerar a partir do logo.", favicon: true }),
  ];
  const esquerda = h("div", { class: "pilha" },
    soTema ? null : cartao("Identidade", "Como o produto se chama para os seus clientes.", form),
    cartao("Logo", null, h("div", { class: "pilha" }, imagens, sugestoes)),
    cartao("Cores", "Três cores bastam: o app deriva todo o resto e garante o contraste.", h("div", { class: "pilha" }, blocoProprias, notaCoresOff, caixaCores)),
    soTema ? null : cartao("Tela de entrada", "O que aparece antes do login, no seu domínio ou pelo link de entrada.", linhaLinkEntrada, formEntrada));
  const direita = h("div", { class: "marca-previa-env" },
    h("div", { class: "linha linha-entre" }, h("p", { class: "rotulo" }, "Pré-visualização ao vivo"), pvEsquema),
    h("div", { class: "linha linha-entre cfg-prev-ctl" }, segPreviaEl, segEsquema),
    pvAba, previa, pvCel, pvLogin.el, avisos,
    h("div", { class: "linha marca-acoes" }, btApp, btPadrao, h("span", { class: "marca-espaco" }), btSalvar),
    estado);
  ui.limpar(alvo);
  const editorEl = h("div", { class: "marca-ed" }, esquerda, direita);
  // AS-110: colar (Ctrl+V) uma imagem com o foco no editor troca o logo — texto colado num campo segue normal
  editorEl.addEventListener("paste", ev => {
    const itens = ev.clipboardData ? [...(ev.clipboardData.files || [])] : [];
    const img = itens.find(f => f && /^image\//.test(f.type));
    if (!img || !colarLogo) return;
    ev.preventDefault();
    colarLogo(img);
  });
  alvo.append(editorEl);
  atualizar();
  const lg = T.imagemSegura(m.logo) || (soTema ? T.imagemSegura(reserva.logoUrl) : null);
  if (lg) pxDeUrl(lg).then(px => { if (px && alvo.isConnected) mostrarSugestoes(px); });

  const fim = () => { if (appInteiro) { appInteiro = false; ctx.shell.aplicarMarcaCliente(); } };
  fim.sujo = sujo;          // plano 1000 · AS-103/AS-082: quem abriu o editor sabe se há mudança não salva
  return fim;
}

/* ---------------- seção: Domínio próprio ---------------- */
async function secaoDominio(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  let lista = [];
  const caixa = h("div", { class: "pilha" });
  const clientes = (typeof ctx.shell.clientes === "function" && ctx.shell.clientes()) || [];      // plano 1500c · UCB-018: gestor sem clientes ainda
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Endereço", nome: "host", placeholder: "crm.suaagencia.com.br", autocomplete: "off", inputmode: "url",
        ajuda: "Use um subdomínio: domínio raiz (suaagencia.com.br) não aceita CNAME." }),
      ui.campo({ rotulo: "Para quem", nome: "cliente", tipo: "select", valor: "",
        opcoes: [{ valor: "", rotulo: "Toda a agência (login com a sua marca)" }, ...clientes.map(c => ({ valor: c.id, rotulo: `Só a ${c.nome}` }))],
        ajuda: "Com um cliente escolhido, quem entra por esse endereço já cai na empresa dele." })),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, ui.icone("mais"), "Adicionar domínio")));
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    const host = normalizarHost(d.host);
    // plano 1000b · UB-263: o próprio endereço do app (ou um *.netlify.app) não é domínio próprio — é o destino do CNAME
    const erroHost = erroHostDominio(host, typeof location !== "undefined" ? location.hostname : "");
    if (erroHost) return ui.marcarErro(form, "host", erroHost);
    // plano 1000 · AS-113: domínio raiz não aceita CNAME — a pessoa criava o registro e o domínio nunca ativava
    if (ehDominioRaiz(host) && !(await ui.confirmar({ titulo: "Isso parece um domínio raiz", rotulo: "Usar mesmo assim",
      texto: `«${host}» não aceita CNAME na maioria dos provedores, e sem CNAME o domínio não ativa. Prefira um subdomínio, como crm.${host} ou app.${host}.` }))) {
      ui.marcarErro(form, "host", `Use um subdomínio, como crm.${host}.`);
      return;
    }
    try {
      lista = validarListaDominios(await ui.carregando(form.querySelector("[type=submit]"), api.rpc("nx_dominio_salvar", { p_host: host, p_cliente: d.cliente || null })));
      form.reset();
      ui.toast("Domínio cadastrado. Agora crie o registro CNAME no seu provedor.", { tipo: "ok" });
      desenhar();
    } catch (e) {
      if (e.codigo === "dominio_invalido" || e.codigo === "dominio_em_uso") return ui.marcarErro(form, "host", api.mensagemErro(e));
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });

  function desenhar() {
    ui.limpar(caixa);
    if (!lista.length) {
      caixa.append(ui.vazio({ titulo: "Nenhum domínio ainda.", icone: "globo",
        texto: "Com um domínio próprio, a tela de entrada, os convites e os links de senha saem com o seu endereço e a sua marca." }));
      return;
    }
    for (const d of lista) caixa.append(cartaoDominio(ctx, d, { aoRemover: async () => { lista = validarListaDominios(await api.rpc("nx_dominios_listar")); desenhar(); } }));
  }
  alvo.append(
    h("div", { class: "cartao" },
      h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Novo domínio"),
        h("p", { class: "sub" }, "Cadastre o endereço, crie o registro CNAME no seu provedor de DNS e aguarde a ativação."))),
      form),
    caixa);
  caixa.append(ui.esqueleto("lista", 2));
  try { lista = validarListaDominios(await api.rpc("nx_dominios_listar")); desenhar(); }
  catch (e) { ui.limpar(caixa); caixa.append(ui.erroCartao(e, () => secaoDominio(ctx, (ui.limpar(alvo), alvo)))); }
}

/** Cartão de um domínio com a instrução de DNS (usado também pelo Admin). */
export function cartaoDominio(ctx, d, { aoRemover, aoStatus, mostrarOrg = false, hostAtual: hostDado = null, conferirDns = conferirCname } = {}) {
  const { ui, api } = ctx;
  const h = ui.h;
  const ativo = d.status === "ativo";
  // sem nx_config.saas_url, o destino só vale se o app estiver aberto no próprio servidor (Netlify ou domínio
  // já ligado). No espelho do GitHub Pages ou em localhost o CNAME sairia ERRADO: aí a tela diz a verdade.
  // plano 1500c · UCB-019: sem location (teste, worker) não quebra; dá para injetar o host
  const hostAtual = hostDado !== null ? String(hostDado) : typeof location !== "undefined" && location ? String(location.hostname || "") : "";
  // plano 1000b · UB-097: só o endereço do Netlify vale como destino — aberto por um domínio próprio (crm.agencia.com.br), o cartão mandava
  // apontar o domínio novo para OUTRO domínio próprio
  const hostServe = /\.netlify\.app$/i.test(hostAtual);
  const semAlvo = !(d.dns && d.dns.valor);
  const alvoDns = semAlvo ? (hostServe ? hostAtual : null) : d.dns.valor;
  const copiavel = (txt, rot) => h("span", { class: "dns-val" }, h("span", { class: "mono" }, txt),
    h("button", { type: "button", class: "bt-icone bt-icone-p", "aria-label": `Copiar ${rot}`, on: { click: () => ui.copiar(txt, { aviso: `${rot} copiado.` }) } }, ui.icone("copiar")));
  const acoes = h("div", { class: "linha" });
  if (aoStatus) {
    const b = h("button", { type: "button", class: ativo ? "bt bt-sec bt-p" : "bt bt-prim bt-p" }, ui.icone(ativo ? "relogio" : "check"), ativo ? "Voltar a pendente" : "Marcar ativo");
    b.addEventListener("click", async () => {
      if (!ativo && !(await ui.confirmar({ titulo: `Ativar ${d.host}?`, texto: "Confirme que o alias já foi adicionado no Netlify e o certificado saiu. A partir daqui, os links desse cliente/agência usam este endereço.", rotulo: "Marcar ativo" }))) return;
      // plano 1000 · AS-115: voltar a pendente tira o endereço do ar para convites e links — um toque não basta
      if (ativo && !(await ui.confirmar({ titulo: `Voltar ${d.host} a pendente?`, perigo: true, rotulo: "Voltar a pendente",
        texto: "Convites, links de nova senha e a tela de entrada deixam de usar este endereço na hora e voltam ao endereço padrão. Quem abrir um link antigo com ele pode cair numa página de erro." }))) return;
      try { await ui.carregando(b, aoStatus(!ativo)); } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    acoes.append(b);
  }
  if (aoRemover) {
    const b = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("lixeira"), "Remover");
    b.addEventListener("click", async () => {
      if (!(await ui.confirmar({ titulo: `Remover ${d.host}?`, texto: ativo ? "O endereço deixa de abrir o app com a sua marca e os links passam a usar o endereço padrão." : "O cadastro pendente é apagado.", rotulo: "Remover", perigo: true }))) return;
      try { await ui.carregando(b, api.rpc("nx_dominio_remover", { p_host: d.host })); ui.toast("Domínio removido.", { tipo: "ok" }); await aoRemover(); }
      catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    acoes.append(b);
  }
  // plano 1000 · AS-116: pendente há quanto tempo (a promessa é 1 dia útil); passado o prazo, «Avisar o suporte» pelo WhatsApp de suporte
  // plano 1000b · UB-096: nenhum texto do cartão cita «Nexus» — o gestor da revenda (e os clientes dele) veem «a plataforma»
  const idade = !ativo && d.criado_em ? diasUteisDesde(d.criado_em) : null;
  const wa = (() => { try { const me = ctx.shell && typeof ctx.shell.marcaEfetiva === "function" ? ctx.shell.marcaEfetiva() : null; return me && me.suporte_wa; } catch { return null; } })();
  const atrasado = idade != null && idade >= 1;
  const linhaIdade = idade != null ? h("p", { class: ["fraco", "dom-idade", atrasado && "dom-idade-atrasado"] }, ui.icone("relogio"),
    h("span", null, `Cadastrado ${ui.relativo(d.criado_em)}${atrasado ? " — passou de 1 dia útil." : "."}`),
    atrasado && wa && !aoStatus ? h("a", { class: "bt bt-sec bt-p dom-avisar", href: ui.linkWhatsApp(`Olá! O domínio ${d.host} está pendente desde ${ui.dataBR(d.criado_em)}. Já criei o CNAME; podem ativar?`, wa), target: "_blank", rel: "noopener noreferrer" },
      ui.icone("whatsapp"), "Avisar o suporte") : null) : null;
  // plano 1500c · UCB-067: «Conferir DNS» no pendente — diz em palavras se o CNAME já aponta para o destino
  let linhaDns = null;
  if (!ativo && typeof conferirDns === "function") {
    const res = h("span", { class: "dom-dns-res", role: "status", "aria-live": "polite" });
    const b = h("button", { type: "button", class: "bt bt-sec bt-p dom-conferir" }, ui.icone("reabrir"), "Conferir DNS");
    b.addEventListener("click", async () => {
      res.textContent = "";
      try {
        const r = await ui.carregando(b, conferirDns(d.host, alvoDns));
        res.dataset.tom = r.aponta ? "ok" : "aten";
        res.textContent = r.aponta ? "O CNAME já aponta certo. Agora é com a plataforma, que ativa em até 1 dia útil."
          : r.valor ? `O CNAME aponta para ${r.valor}${alvoDns ? `, não para ${alvoDns}` : ""}. Corrija no seu provedor.`
          : "Ainda não achamos o registro CNAME. Depois de criar, a mudança pode levar algumas horas para aparecer.";
      } catch { res.dataset.tom = "aten"; res.textContent = "Não deu para conferir o DNS agora. Tente de novo em instantes."; }
    });
    linhaDns = h("div", { class: "linha dom-dns" }, b, res);
  }
  // plano 1500c · UCB-069: o domínio ativo abre numa aba nova para conferir
  if (ativo) acoes.prepend(h("a", { class: "bt bt-sec bt-p dom-abrir", href: `https://${d.host}/app/`, target: "_blank", rel: "noopener noreferrer" }, ui.icone("externo"), "Abrir"));
  return h("article", { class: "cartao dom-item" },
    h("div", { class: "cartao-cab" },
      h("div", { class: "dom-tit" }, ui.icone("globo"),
        h("div", null, h("b", { class: "mono" }, d.host),
          h("small", null, [mostrarOrg && d.org ? d.org.nome : null, d.cliente ? `Só a ${d.cliente.nome}` : "Agência toda"].filter(Boolean).join(" · ")))),
      ui.pilula(ativo ? "Ativo" : "Pendente", ativo ? "ok" : "aten")),
    ativo ? null : h("dl", { class: "dns" },
      h("dt", null, "Tipo"), h("dd", null, "CNAME"),
      h("dt", null, "Nome"), h("dd", null, copiavel(d.host, "Nome")),
      h("dt", null, "Valor"), h("dd", null, alvoDns ? copiavel(alvoDns, "Valor") : h("span", { class: "fraco" }, "a plataforma informa"))),
    h("p", { class: "fraco dom-nota" }, ativo
      ? `No ar${d.ativado_em ? ` desde ${ui.dataBR(d.ativado_em)}` : ""}. Convites e links de senha já saem com este endereço.`
      : alvoDns
        ? `Crie o registro CNAME: ${d.host} → ${alvoDns}${semAlvo ? " (o endereço atual do app)" : ""}. A plataforma ativa o domínio em até 1 dia útil.`
        : `Peça à plataforma o destino do registro CNAME de ${d.host} antes de mexer no DNS. A plataforma ativa o domínio em até 1 dia útil.`),
    // plano 1500c · UCB-068: a armadilha do proxy do Cloudflare (com a nuvem laranja o certificado não sai)
    ativo ? null : h("p", { class: "fraco dom-nota dom-cloudflare" }, "Usa Cloudflare? Deixe o proxy desligado (nuvem cinza, «somente DNS»)."),
    linhaDns,
    linhaIdade,
    acoes.childNodes.length ? acoes : null);
}

/**
 * plano 1500c · UCB-067: o CNAME do host já responde? Consulta pública de DNS (dns.google, já liberado no connect-src do app).
 * → {aponta, valor} (valor = o destino achado, sem ponto final; null sem CNAME). Falha de rede → lança.
 */
export async function conferirCname(host, esperado, buscar = typeof fetch === "function" ? fetch : null) {
  if (!buscar) throw new Error("sem_rede");
  const r = await buscar(`https://dns.google/resolve?name=${encodeURIComponent(normalizarHost(host))}&type=CNAME`, { headers: { accept: "application/dns-json" } });
  if (!r || !r.ok) throw new Error("dns_indisponivel");
  const j = await r.json();
  const resp = (Array.isArray(j && j.Answer) ? j.Answer : []).find(a => a && a.type === 5);
  const valor = resp ? normalizarHost(String(resp.data || "")) : null;
  return { aponta: !!valor && !!esperado && valor === normalizarHost(esperado), valor };
}

/* ---------------- seção: Plano e uso ---------------- */
const USO_ROT = [
  ["usuarios", "Usuários (convites pendentes contam)", "usuários"], ["canais", "Números de WhatsApp", "números de WhatsApp"],
  ["funis", "Funis ativos", "funis"], ["automacoes", "Automações", "automações"], ["contatos", "Contatos", "contatos"],
  ["ia_mes", "Sugestões de IA neste mês", "sugestões de IA do mês"],
];
/**
 * plano 1000b · UB-100: nx_ia_uso_dia (até 90 dias) → chamadas de IA do mês atual e dos dois anteriores, mais novo primeiro:
 * [{mes: "AAAA-MM", rotulo: "outubro de 2026", chamadas, parcial}] — `parcial` quando a série não cobre o mês inteiro (começa depois do dia 1).
 * null quando a resposta não é a série.
 */
export function usoIAPorMes(lista, hoje) {
  if (!Array.isArray(lista) || !/^\d{4}-\d{2}-\d{2}$/.test(String(hoje || ""))) return null;
  const [a, m] = hoje.split("-").map(Number);
  const meses = [0, 1, 2].map(k => { const d = new Date(Date.UTC(a, m - 1 - k, 1)); return d.toISOString().slice(0, 7); });
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const dias = lista.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.dia || ""))).map(x => String(x.dia)).sort();
  const primeiro = dias[0] || null;
  return meses.map(mes => ({
    mes, rotulo: `${nomes[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`,
    chamadas: lista.reduce((s, x) => s + (x && String(x.dia || "").slice(0, 7) === mes ? Math.max(0, Math.floor(Number(x.chamadas) || 0)) : 0), 0),
    parcial: !primeiro || primeiro > `${mes}-01`,
  }));
}

/** plano 1000b · UB-264: a tela que libera a vaga de cada limite (só com o módulo, quando ele existe). */
export const GERENCIAR_USO = Object.freeze({
  usuarios: { href: "#/config/usuarios" }, canais: { href: "#/config/numeros", modulo: "conversas" },
  funis: { href: "#/config/funis", modulo: "crm" }, automacoes: { href: "#/automacoes", modulo: "automacoes" },
  // plano 1500c · UCB-129 / UCB-128: contatos levam à lista do CRM; a IA leva à seção da IA (tom, ligar/desligar)
  contatos: { href: "#/crm/contatos", modulo: "crm" }, ia_mes: { href: "#/config/ia", modulo: "conversas" },
});
const ROT_STATUS = { ativo: ["Ativo", "ok"], teste: ["Em teste", "info"], suspenso: ["Suspenso", "aten"], cancelado: ["Cancelado", "ruim"] };
const ROT_MOD = { crm: "CRM", conversas: "Conversas", relatorios: "Relatórios", ads: "Anúncios", automacoes: "Automações", marca: "Marca própria" };

/** plano 1000b · UB-100: «IA nos últimos meses» (mês atual e os dois anteriores) por nx_ia_uso_dia; servidor sem a função ou erro → o cartão some. */
function historicoIA(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const corpo = h("div", { class: "cfg-ia-meses" }, ui.esqueleto("lista", 1));
  const cartao = h("div", { class: "cartao cfg-ia-hist" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "IA nos últimos meses"),
    h("p", { class: "sub" }, "Todas as chamadas de IA (sugestões, resumos e automações) por mês, para comparar com o mês atual."))), corpo);
  cartao.pronto = Promise.resolve().then(() => api.rpcC("nx_ia_uso_dia", { p_dias: 90 })).then(lista => {
    const meses = usoIAPorMes(lista, ui.hojeSP());
    if (!meses) { cartao.remove(); cartao.hidden = true; return false; }
    ui.limpar(corpo);
    corpo.append(h("ul", { class: "cfg-ia-meses-lista" }, meses.map((x, i) => h("li", { class: "linha linha-entre" },
      h("span", null, x.rotulo, i === 0 ? h("small", { class: "fraco" }, " (até hoje)") : x.parcial ? h("small", { class: "fraco" }, " (só parte do mês)") : null),
      h("b", { class: "mono dado" }, `${ui.num(x.chamadas)} ${x.chamadas === 1 ? "chamada" : "chamadas"}`)))));
    return true;
  }).catch(() => { cartao.remove(); cartao.hidden = true; return false; });
  return cartao;
}

/**
 * plano 1500c · UCB-083: «Números» e «IA» a partir do checklist (nx_onboarding_estado) e do uso de números do plano.
 * → [{rotulo, texto, tom, href}] (vazio sem o estado).
 */
export function estadoNumerosIA(est, usoCanais = null) {
  const itens = est && Array.isArray(est.itens) ? est.itens : null;
  if (!itens) return [];
  const feito = id => { const x = itens.find(i => i && i.id === id); return x ? !!x.feito : null; };
  const pareado = feito("aparelho_pareado"), ia = feito("ia_ou_direto");
  const n = Number(usoCanais);
  const out = [];
  if (Number.isFinite(n) && n === 0) out.push({ rotulo: "Números", texto: "nenhum cadastrado", tom: "aten", href: "#/config/numeros" });
  else if (pareado !== null) out.push({ rotulo: "Números", texto: pareado ? "conectado" : "desconectado ou sem parear", tom: pareado ? "ok" : "ruim", href: "#/config/numeros" });
  if (ia !== null) out.push({ rotulo: "IA", texto: ia ? "ligada (ou recebendo direto)" : "ainda não validada", tom: ia ? "ok" : "aten", href: "#/config/ia" });
  return out;
}

/** plano 1500c · UC-007: os números do «No seu teste até agora» (nx_uso_plano.resumo_periodo); null quando o servidor não manda. */
export function resumoDoPeriodo(rp) {
  if (!rp || typeof rp !== "object") return null;
  const campos = [["conversas", "Conversas atendidas"], ["contatos_novos", "Contatos novos"], ["negocios", "Negócios criados"],
    ["automacoes_execucoes", "Automações executadas"], ["leads_anuncio", "Leads de anúncio"]];
  const l = campos.filter(([k]) => rp[k] != null && Number.isFinite(Number(rp[k]))).map(([k, rotulo]) => ({ chave: k, rotulo, valor: Number(rp[k]) }));
  return l.length ? { desde: rp.desde || null, itens: l, ganhos: Number.isFinite(Number(rp.ganhos_valor)) ? Number(rp.ganhos_valor) : null } : null;
}

async function secaoPlano(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  alvo.append(ui.esqueleto("cartoes", 3));
  let r;
  try { r = await api.rpcC("nx_uso_plano"); }
  catch (e) { ui.limpar(alvo); alvo.append(ui.erroCartao(e, () => { ui.limpar(alvo); secaoPlano(ctx, alvo); })); return; }
  ui.limpar(alvo);
  r = r || {};
  const p = r.plano || {};
  const wa = ctx.shell.marcaEfetiva() && ctx.shell.marcaEfetiva().suporte_wa;
  const hoje = ui.hojeSP();
  const [stTxt, stCor] = statusDoPlano(r.status, r.teste_ate, hoje);     // plano 1000 · AS-117
  const emTeste = r.status === "teste";
  const nomeCli = (ctx.cliente && ctx.cliente.nome) || "";
  // plano 1000b · UB-099: limite 0 = recurso fora do plano (não «esgotado»): fica fora do aviso de limite
  const fracao = k => (r.limites && r.limites[k] != null && r.limites[k] > 0 ? ((r.uso && r.uso[k]) || 0) / r.limites[k] : 0);
  const cheios = USO_ROT.filter(([k]) => fracao(k) >= 1), perto = USO_ROT.filter(([k]) => fracao(k) >= .8 && fracao(k) < 1);
  const lista = xs => xs.map(x => x[2]).join(", ").replace(/, ([^,]*)$/, " e $1");
  const quem = (r.org && r.org.nome) || (ctx.sessao && ctx.sessao.org && ctx.sessao.org.nome) || null;
  // plano 1500c · UCB-076 / UC-008 / UCB-073: o mesmo texto no WhatsApp e no modal; em teste o pedido é para contratar
  const pedido = textoPedidoAumento({ plano: p.nome || "", cliente: nomeCli, itens: [...cheios, ...perto].map(x => x[2]), teste: emTeste, testeAte: r.teste_ate || "" });
  const rotuloPedido = emTeste ? "Quero contratar" : "Quero aumentar";
  const bQueroAumentar = wa ? null : h("button", { type: "button", class: "bt bt-prim cfg-quero-aumentar" }, rotuloPedido);
  if (bQueroAumentar) bQueroAumentar.addEventListener("click", async () => {
    const bCopiar = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("copiar"), "Copiar o pedido");
    bCopiar.addEventListener("click", () => ui.copiar(pedido, { aviso: "Pedido copiado." }));
    await ui.modal({ titulo: emTeste ? "Contratar o plano" : "Aumentar o plano", largura: "p",
      corpo: h("div", { class: "pilha" },
        h("p", null, quem ? `Quem cuida do seu plano é a ${quem}. Mande o pedido por e-mail ou mensagem para quem atende vocês lá.` : "Quem cuida do seu plano é a empresa que contratou o sistema para vocês. Mande o pedido para quem atende vocês."),
        h("p", { class: "cv-previa" }, pedido), h("div", { class: "linha" }, bCopiar)),
      acoes: [{ rotulo: "Fechar", tipo: "neutro" }] });
  });
  // plano 1500c · UCB-074: em teste o preço diz que nada é cobrado até o fim do teste
  const precoTxt = p.preco_mensal != null ? `${ui.brl(p.preco_mensal, { centavos: false })} por mês` : null;
  const subPreco = emTeste && r.teste_ate && r.teste_ate >= hoje
    ? `Grátis até ${ui.dataBR(r.teste_ate)}${precoTxt ? ` · depois ${precoTxt}` : ""}`
    : precoTxt || "Condição combinada com a equipe.";
  // plano 1500c · UCB-072: quantos dias de teste faltam (atenção a partir de 3)
  const dias = rotuloDiasTeste(r.status, r.teste_ate, hoje);
  // plano 1500c · UC-040: «Dia 9 de 14» quando o servidor diz o início do teste
  const prog = emTeste ? progressoTeste(String(r.teste_inicio || r.criado_em || "").slice(0, 10), r.teste_ate, hoje) : null;
  const cab = h("div", { class: "cartao plano-cab" },
    h("div", { class: "plano-tit" },
      h("p", { class: "rotulo" }, "Seu plano"),
      h("h2", { class: "num-grande" }, p.nome || "—"),
      h("p", { class: "sub cfg-plano-preco" }, subPreco),
      dias ? h("p", { class: ["cfg-dias-teste", dias.tom === "aten" && "cfg-dias-teste-aten"] }, ui.icone("relogio"), dias.texto) : null,
      prog ? h("div", { class: "cfg-teste-prog" }, ui.barraUso(`Dia ${prog.dia} de ${prog.total} do teste`, prog.dia, prog.total)) : null,
      emTeste ? h("p", { class: "fraco cfg-dados-guardados" }, "Seus dados ficam guardados quando você contratar.") : null),
    h("div", { class: "pilha-p plano-lado" },
      h("div", { class: "linha" }, ui.pilula(stTxt, stCor),
        emTeste && r.teste_ate ? ui.pilula(r.teste_ate >= hoje ? `Teste até ${ui.dataBR(r.teste_ate)}` : `Teste terminou em ${ui.dataBR(r.teste_ate)}`, r.teste_ate >= hoje ? "info" : "ruim") : null),
      h("div", { class: "linha" }, (r.modulos || []).map(m => ui.pilula(ROT_MOD[m] || m, "neutra"))),
      // plano 1000 · AS-241: sempre há um próximo passo para aumentar (WhatsApp da revenda, ou quem procurar quando não há WhatsApp)
      h("div", { class: "linha" },
        wa ? h("a", { class: "bt bt-prim cfg-quero-aumentar", href: ui.linkWhatsApp(pedido, wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), rotuloPedido)
          : bQueroAumentar,
        wa ? h("a", { class: "bt bt-sec", href: ui.linkWhatsApp(`Olá! Quero falar sobre o plano da ${nomeCli}.`, wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Falar com o suporte") : null)));
  // plano 1500c · UCB-075: suspensa, cancelada ou teste encerrado — o que parou e o caminho de volta
  const st = avisoStatusPlano(r.status, r.teste_ate, hoje);
  const avisoSt = st ? h("div", { class: ["aviso", st.tom === "ruim" ? "aviso-ruim" : "aviso-aten", "cfg-plano-status"], role: "status" }, ui.icone("alerta"),
    h("p", null, st.texto, wa ? " " : "", wa ? h("a", { href: ui.linkWhatsApp(pedido, wa), target: "_blank", rel: "noopener noreferrer" }, "Falar com o suporte") : null)) : null;
  // plano 1500c · UCB-078: projeção da IA até o fim do mês
  const projIA = projecaoMes(r.uso ? r.uso.ia_mes : 0, hoje);
  const limIA = r.limites ? r.limites.ia_mes : null;
  // AS-242: cada barra explica o que conta (convites pendentes, funis desligados, contatos…)
  const usos = h("div", { class: "adm-uso" }, USO_ROT.map(([k, rot]) => {
    const lim = r.limites ? r.limites[k] : null;
    // UB-099: limite 0 → «não incluído no plano» (a barra cheia «0 / 0» parecia recurso esgotado)
    const b = lim === 0 ? h("div", { class: "uso uso-fora" }, h("div", { class: "uso-l" }, h("span", null, rot), h("span", { class: "fraco" }, "não incluído no plano")))
      : ui.barraUso(rot, r.uso ? r.uso[k] : 0, lim);
    if (k === "ia_mes" && lim !== 0 && (r.uso && r.uso.ia_mes)) {
      const passa = limIA != null && limIA > 0 && projIA > limIA;
      b.appendChild(h("small", { class: ["uso-det", "cfg-uso-proj", passa && "cfg-uso-proj-aten"] },
        `No ritmo atual, chega a ~${ui.num(projIA)} até o fim do mês${passa ? " — passa do limite do plano" : ""}.`));
    }
    if (REGRA_USO[k] && lim !== 0) b.appendChild(h("small", { class: "uso-det cfg-uso-regra" }, REGRA_USO[k]));
    // plano 1000b · UB-264: cada barra leva à tela que libera a vaga
    const ir = GERENCIAR_USO[k];
    if (ir && lim !== 0 && (!ir.modulo || typeof ctx.temModulo !== "function" || ctx.temModulo(ir.modulo)))
      b.appendChild(h("a", { class: "cfg-uso-ir", href: ir.href, "aria-label": `Gerenciar ${rot.toLowerCase()}` }, "Gerenciar", ui.icone("seta-dir")));
    return b;
  }));
  // plano 1500c · UCB-083: números e IA (do checklist em cache) — é onde se decide se vale aumentar
  const linhaEstado = h("p", { class: "linha cfg-plano-estado", hidden: true });
  if (ctx.cliente && typeof ctx.pode === "function" && ctx.pode("admin")) {
    const memo = _pendCache.get(ctx.cliente.id);
    const est = memo && Date.now() - memo.em < PEND_CACHE_MS ? Promise.resolve(memo.est)
      : Promise.resolve().then(() => api.rpcC("nx_onboarding_estado", {})).then(e => { _pendCache.set(ctx.cliente.id, { em: Date.now(), est: e }); return e; });
    est.then(e => {
      const l = estadoNumerosIA(e, r.uso ? r.uso.canais : null);
      if (!l.length || !linhaEstado.isConnected) return;
      linhaEstado.append(...l.flatMap((x, i) => [i ? h("span", { class: "fraco", "aria-hidden": "true" }, "·") : null,
        h("a", { href: x.href, class: "cfg-plano-estado-it", dataset: { tom: x.tom } }, `${x.rotulo}: ${x.texto}`)].filter(Boolean)));
      linhaEstado.hidden = false;
    }).catch(() => { /* sem o checklist, a linha não aparece */ });
  }
  // plano 1500c · UC-007: o que o sistema já fez no período (servidor novo manda resumo_periodo; sem ele, o cartão não aparece)
  const rp = resumoDoPeriodo(r.resumo_periodo);
  const cartaoResumo = rp ? h("div", { class: "cartao cfg-resumo-periodo" }, h("div", { class: "cartao-cab" }, h("div", null,
    h("h2", null, emTeste ? "No seu teste até agora" : "Neste mês até agora"),
    rp.desde ? h("p", { class: "sub" }, `Desde ${ui.dataBR(rp.desde)}.`) : null)),
    h("div", { class: "cfg-resumo-grade" }, rp.itens.map(x => h("div", { class: "cfg-resumo-it" }, h("b", { class: "mono dado" }, ui.num(x.valor)), h("small", null, x.rotulo))),
      rp.ganhos != null ? h("div", { class: "cfg-resumo-it" }, h("b", { class: "mono dado" }, ui.brl(rp.ganhos, { centavos: false })), h("small", null, "Em negócios ganhos")) : null)) : null;
  // plano 1500c · UCB-080 / UC-009: comparar com os outros planos (servidor novo manda planos_disponiveis)
  const outros = Array.isArray(r.planos_disponiveis) ? r.planos_disponiveis.filter(x => x && x.nome) : [];
  const cartaoComparar = outros.length > 1 || (outros.length === 1 && outros[0].nome !== p.nome) ? h("div", { class: "cartao cfg-comparar" },
    h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Comparar planos"), h("p", { class: "sub" }, "O que cada plano libera em relação ao seu."))),
    h("div", { class: "cfg-comparar-grade" }, outros.map(x => {
      const atual = x.nome === p.nome || (x.id && x.id === p.id);
      const dif = atual ? [] : diferencasPlanoTexto({ limites: r.limites || p.limites || {}, modulos: r.modulos || [] }, x);
      const txt = textoPedidoAumento({ plano: x.nome, cliente: nomeCli, teste: emTeste, testeAte: r.teste_ate || "" });
      return h("article", { class: ["cfg-comparar-it", atual && "atual"], "aria-current": atual ? "true" : null },
        h("b", null, x.nome, atual ? " (o seu)" : ""),
        h("p", { class: "sub" }, x.preco_mensal != null ? `${ui.brl(x.preco_mensal, { centavos: false })} por mês` : "Sob consulta"),
        dif.length ? h("ul", { class: "cfg-comparar-dif" }, dif.map(d => h("li", null, d))) : atual ? null : h("p", { class: "fraco" }, "Mesmos limites."),
        atual ? null : wa ? h("a", { class: "bt bt-sec bt-p", href: ui.linkWhatsApp(txt, wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), `Quero o ${x.nome}`)
          : h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => ui.copiar(txt, { aviso: "Pedido copiado. Mande para quem cuida do seu plano." }) } }, ui.icone("copiar"), `Pedir o ${x.nome}`));
    }))) : null;
  // plano 1500c · UCB-007: «Sua agência» sem «uso» (ou uso null) não quebra a seção
  const agencia = r.org ? usoAgencia(r) : null;
  // Element.append() transforma null em texto: só entram os blocos que existem
  alvo.append(...[avisoSt, cab, linhaEstado,
    // plano 1500c · UCB-077: sem WhatsApp de suporte o caminho é o botão, não «o suporte»
    cheios.length || perto.length ? h("div", { class: ["aviso", cheios.length ? "aviso-ruim" : "aviso-aten"] }, ui.icone("alerta"), h("p", null,
      [cheios.length ? `No limite do plano: ${lista(cheios)}.` : null, perto.length ? `Perto do limite: ${lista(perto)}.` : null,
        wa ? "Para aumentar, fale com o suporte." : `Para aumentar, use o botão ${rotuloPedido}.`].filter(Boolean).join(" "))) : null,
    cartaoResumo,
    h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Uso do plano"),
      h("p", { class: "sub" }, "Contagem de agora. Sugestões de IA contam no mês corrente."))), usos,
      // plano 1000b · UB-098: 1 casa e GB acima de 1024 MB (antes «12,345678 MB»)
      h("p", { class: "fraco plano-storage" }, ui.icone("clipe"), `Mídia guardada: ${formatarArmazenamento(r.storage_mb)}`)),
    cartaoComparar,
    historicoIA(ctx),
    agencia ? h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Sua agência"),
      h("p", { class: "sub" }, "Soma de todos os clientes da revenda."))),
      h("div", { class: "adm-uso" }, agencia.map(x => ui.barraUso(x.rotulo, x.uso, x.limite)))) : null].filter(Boolean));
}
