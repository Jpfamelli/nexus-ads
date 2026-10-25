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
  // plano 2000d · DU-160: «quebrado» = o domínio ativo parou de apontar (a verificação diária do servidor marca)
  if (!Array.isArray(valor) || valor.some(d => !d || typeof d !== "object" || typeof d.host !== "string" || !["pendente", "ativo", "quebrado"].includes(d.status))) {
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
  // plano 2000d · DU-172: palavras dos ajustes DENTRO das seções (rodízio, assinatura, 2 etapas, foto…)
  // plano 2000d · FX-051: sinônimos do dia a dia (zap, wpp, silencioso, função, avaliação, feriado)
  perfil: "nome celular senha aparelhos sair avisos som notificação conta foto assinatura verificação duas etapas 2fa ausente sessões silencioso madrugada última tela",
  usuarios: "equipe convite convidar papel administrador atendente acesso pessoas rodízio rodizio vê colegas permissões exportar pausar férias 2 etapas lista csv função funcionário suspender",
  empresa: "endereço telefone instagram fuso horário guarda retenção lgpd variáveis avaliação google feriados minutos tempo poupado",
  departamentos: "horário horario funcionamento expediente fora do horário setor rodízio", numeros: "whatsapp zap wpp whats codewords meta api oficial número conectar modelos templates",
  respostas: "atalho frases prontas barra mensagens", atendimento: "assinatura fila avisos preferências", ia: "inteligência artificial assistente robô bot memória tom",
  funis: "etapas pipeline kanban vendas", campos: "campos extras cadastro personalizados", etiquetas: "tags marcadores cores", motivos: "perda não fechou",
  agenda: "horários consultas dias fechados duração", anuncios: "meta google facebook instagram contas campanhas", formulario: "site formulário lead",
  rastreio: "script utm origem campanha site", marca: "logo cores tema tela de entrada favicon termos privacidade site e-mail remetente ícone app teste grátis",
  dominio: "endereço cname dns subdomínio registro.br hostinger cloudflare godaddy", plano: "limites uso cobrança assinatura fatura pagamento cancelar pacote ia renovação",
});
const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** AS-083: ids das seções que casam com a busca (título + descrição + palavras-chave, sem acento; todas as palavras digitadas). */
export function filtrarSecoes(secoes, termo) {
  // plano 2000d · FX-053: pontuação não atrapalha («2-etapas», «e-mail,» e «whatsapp?» acham a seção)
  const ps = semAcento(termo).replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter(Boolean);
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
  // plano 2000d · FX-064: espaço no meio (colado do e-mail: «crm .agencia.com.br») também sai
  return String(v ?? "").replace(/\s+/g, "").toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
}
export const RE_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
/**
 * plano 1000b · UB-263/UB-106: erro do endereço digitado para domínio próprio (texto) ou null quando serve.
 * Recusa o formato inválido, o próprio endereço do app aberto agora e qualquer *.netlify.app (é o destino do CNAME, não um domínio próprio).
 */
export function erroHostDominio(host, hostAtual = "") {
  const x = normalizarHost(host);
  // plano 2000d · FX-063: endereço com acento ou cedilha diz o porquê (antes caía no «Use algo como…» genérico)
  if (/[^\x00-\x7f]/.test(x)) return "Use o endereço sem acento nem cedilha (ex.: crm.clinicasaojose.com.br). Se o domínio tem acento, use a versão que começa com «xn--».";
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
  // plano 2000d · FX-032: o papel também entra na busca («supervisor», «somente leitura»)
  return l.filter(u => `${u.nome || ""} ${u.email || ""} ${u.papel ? rotuloPapel(u.papel) : ""}`.normalize("NFD").replace(/[^\x00-\x7F]/g, "").toLowerCase().includes(t));
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
  // plano 2000d · FX-035: «Ana Souza <ana@x.com>» (colado do Outlook/Gmail) vira só o e-mail — o nome não conta como inválido
  const limpo = String(texto || "").replace(/(^|[,;\n\r])[^,;\n\r<>]*<([^<>\s]+)>/g, "$1$2");
  for (const p of limpo.split(/[,;\n\r\t ]+/).map(x => x.trim().replace(/^mailto:/i, "")).filter(Boolean)) {
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
export function avisoStatusPlano(status, testeAte, hoje, { regularizarAte = null } = {}) {
  if (status === "pendente") return avisoPagamentoPendente(regularizarAte);      // plano 2000d · DU-164
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

/* ---------------------------------------------------------------- plano 2000d · lógica nova (frente config) */
/** plano 2000d · DU-131: baixa um texto como arquivo (CSV da equipe). */
function baixarTexto(texto, nome, tipo) {
  try {
    const url = URL.createObjectURL(new Blob([texto], { type: `${tipo};charset=utf-8` }));
    const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch { return false; }
}
/** Servidor sem a função (ou rota inexistente): o recurso degrada sem barulho. */
export const semFuncaoRpc = e => /pgrst202|could not find the function|http_404|funcao_invalida/i.test(String((e && (e.codigo || e.message)) || ""));
const dataCurta = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${m[3]}/${m[2]}` : ""; };

/** plano 2000d · DU-109: o que cada papel pode além do básico (a matriz que o admin edita; o servidor é quem barra). */
export const PERMISSOES = Object.freeze([
  Object.freeze({ id: "exportar", rotulo: "Exportar contatos e listas" }),
  Object.freeze({ id: "excluir", rotulo: "Excluir registros" }),
  Object.freeze({ id: "ver_valores", rotulo: "Ver valores (negócios e orçamentos)" }),
  Object.freeze({ id: "automacoes", rotulo: "Criar e mudar automações" }),
  Object.freeze({ id: "anuncios", rotulo: "Ver anúncios e investimento" }),
]);
/** DU-109: os padrões repetem o que cada papel faz hoje (administrador tudo; somente leitura nada que altere). */
export const PERMISSOES_PADRAO = Object.freeze({
  admin: Object.freeze({ exportar: true, excluir: true, ver_valores: true, automacoes: true, anuncios: true }),
  supervisor: Object.freeze({ exportar: true, excluir: true, ver_valores: true, automacoes: true, anuncios: true }),
  atendente: Object.freeze({ exportar: true, excluir: true, ver_valores: true, automacoes: false, anuncios: false }),
  leitura: Object.freeze({ exportar: false, excluir: false, ver_valores: true, automacoes: false, anuncios: false }),
});
/** DU-109: a matriz efetiva (o salvo por cima do padrão); o administrador é sempre tudo e «somente leitura» nunca exclui. */
export function matrizPermissoes(salvas) {
  const s = salvas && typeof salvas === "object" ? salvas : {};
  const out = {};
  for (const papel of Object.keys(PERMISSOES_PADRAO)) {
    out[papel] = {};
    for (const p of PERMISSOES) {
      const v = s[papel] && typeof s[papel][p.id] === "boolean" ? s[papel][p.id] : PERMISSOES_PADRAO[papel][p.id];
      out[papel][p.id] = papel === "admin" ? true : papel === "leitura" && (p.id === "excluir" || p.id === "automacoes") ? false : v;
    }
  }
  return out;
}

/** plano 2000d · DU-111: o acesso está pausado agora? → a data ISO de volta (futura) ou null. */
export function acessoPausado(u, agora = Date.now()) {
  const t = Date.parse((u && u.pausado_ate) || "");
  const a = agora instanceof Date ? agora.getTime() : Number(agora);
  return Number.isFinite(t) && t > a ? u.pausado_ate : null;
}
/** plano 2000d · DU-128: a pessoa marcou «ausente» (fora do rodízio) até uma hora futura? → ISO ou null. */
export function ausenteAte(u, agora = Date.now()) {
  const t = Date.parse((u && u.ausente_ate) || "");
  const a = agora instanceof Date ? agora.getTime() : Number(agora);
  return Number.isFinite(t) && t > a ? u.ausente_ate : null;
}
/** DU-128: «Ficar ausente por 1 h» / «até amanhã» (8 h do dia seguinte, horário local) → ISO. */
export function fimAusencia(opcao, agora = new Date()) {
  const a = agora instanceof Date ? agora : new Date(agora);
  if (opcao === "1h") return new Date(a.getTime() + 3600e3).toISOString();
  const d = new Date(a.getTime()); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

/** plano 2000d · DU-112: «3 negócios e 2 tarefas» que mudam de dono ao remover (null quando o servidor não manda as contagens). */
export function resumoTransferencia(u) {
  const n = Number(u && u.negocios_abertos), t = Number(u && u.tarefas_abertas);
  const temN = u && u.negocios_abertos != null && Number.isFinite(n), temT = u && u.tarefas_abertas != null && Number.isFinite(t);
  if (!temN && !temT) return null;
  const partes = [temN ? `${n} ${n === 1 ? "negócio" : "negócios"}` : null, temT ? `${t} ${t === 1 ? "tarefa" : "tarefas"}` : null].filter(Boolean);
  return partes.join(" e ");
}

/** plano 2000d · DU-113/DU-396: uma linha do registro de auditoria em português («Ana mudou o papel de Bia para Supervisor»). */
export function textoEventoAuditoria(ev) {
  const e = ev || {}, d = e.detalhe || {};
  const quem = e.quem || "Alguém", alvo = e.alvo || "uma pessoa";
  switch (e.acao) {
    case "convite_criado": return `${quem} convidou ${alvo}${d.papel ? ` como ${rotuloPapel(d.papel, { minusculo: true })}` : ""}.`;
    case "convite_revogado": return `${quem} revogou o convite de ${alvo}.`;
    case "convite_aceito": return `${alvo} aceitou o convite e entrou na equipe.`;
    case "papel_trocado": return `${quem} mudou o papel de ${alvo}${d.de ? ` de ${rotuloPapel(d.de)}` : ""}${d.para ? ` para ${rotuloPapel(d.para)}` : ""}.`;
    case "acesso_removido": return `${quem} removeu o acesso de ${alvo}.`;
    case "acesso_pausado": return `${quem} pausou o acesso de ${alvo}${d.ate ? ` até ${dataCurta(d.ate)}` : ""}.`;
    case "dono_transferido": return `${quem} tornou ${alvo} o dono da empresa.`;
    case "email_trocado": return `${quem} trocou o e-mail de ${alvo}.`;
    case "config_alterada": return `${quem} alterou ${d.secao ? `«${d.secao}»` : "as configurações"}${d.resumo ? `: ${d.resumo}` : ""}.`;
    default: return `${quem}: ${String(e.acao || "alteração").replace(/_/g, " ")}${e.alvo ? ` (${alvo})` : ""}.`;
  }
}

/** plano 2000d · DU-114: «Pode entrar de… até…» — os dois vazios (sem limite) ou os dois em HH:MM, com início antes do fim. */
export function horarioAcessoValido(de, ate) {
  const a = String(de || "").trim(), b = String(ate || "").trim();
  if (!a && !b) return true;
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  return re.test(a) && re.test(b) && a < b;
}
export function rotuloHorarioAcesso(u) {
  const h = u && u.horario_acesso;
  return h && h.de && h.ate ? `Entra das ${h.de} às ${h.ate}` : "";
}

/** plano 2000d · DU-116: departamentos pelo nome (sem acento). */
export function filtrarDepartamentos(deps, termo) {
  const t = semAcento(termo).trim();
  const l = Array.isArray(deps) ? deps : [];
  return t ? l.filter(d => semAcento(d && d.nome).includes(t)) : l;
}

/** plano 2000d · DU-117: desligar o rodízio desta pessoa deixa a empresa sem ninguém recebendo conversas novas? */
export function ultimoNoRodizio(usuarios, contaId) {
  const l = (Array.isArray(usuarios) ? usuarios : []).filter(u => u && !u.gestor);
  const eu = l.find(u => u.conta_id === contaId);
  return !!eu && !!eu.recebe_conversas && !l.some(u => u.conta_id !== contaId && u.recebe_conversas && !acessoPausado(u));
}

/** plano 2000d · DU-118: o servidor diz quem tem 2 etapas? e quem está sem. */
export const informa2Etapas = us => (Array.isArray(us) ? us : []).some(u => u && typeof u.dois_fatores === "boolean");
export const sem2Etapas = us => (Array.isArray(us) ? us : []).filter(u => u && !u.gestor && u.dois_fatores === false);

/** plano 2000d · DU-120: o texto do convite (WhatsApp) neutro — «Você recebeu um convite» (sem flexão de gênero). */
export function textoConviteWhats({ nome = "", cliente = "", produto = "" } = {}) {
  const saud = nome ? `Olá, ${String(nome).trim().split(/\s+/)[0]}!` : "Olá!";
  return `${saud} Você recebeu um convite para acessar a ${cliente}${produto ? ` no ${produto}` : ""}. Crie seu acesso por este link:`;
}

/** plano 2000d · DU-122: «email: link» por linha (o «Copiar todos» dos vários convites). */
export function textoTodosLinks(lista) {
  return (Array.isArray(lista) ? lista : []).filter(x => x && x.link).map(x => `${x.email || "convite"}: ${x.link}`).join("\n");
}

/** plano 2000d · DU-123: convite sem nome nem e-mail diz o papel e quando foi criado («Atendente · criado há 1 dia»). */
export function rotuloConvite(cv, agora = Date.now()) {
  const c = cv || {};
  if (c.nome || c.email) return c.nome || c.email;
  const t = Date.parse(c.criado_em || "");
  const a = agora instanceof Date ? agora.getTime() : Number(agora);
  const n = Number.isFinite(t) ? Math.max(0, Math.floor((a - t) / 86400000)) : null;
  const quando = n === null ? "sem nome" : n === 0 ? "criado há poucas horas" : n === 1 ? "criado há 1 dia" : `criado há ${n} dias`;
  return `${rotuloPapel(c.papel || "atendente")} · ${quando}`;
}

/** plano 2000d · DU-125: o último papel escolhido no convite, por pessoa e empresa (só preferência deste aparelho). */
export const chavePapelPreferido = (conta, cliente) => `nx-cfg-papel:${conta || "-"}:${cliente || "-"}`;
export function lerPapelPreferido(armazenamento, conta, cliente) {
  try { const v = armazenamento && armazenamento.getItem(chavePapelPreferido(conta, cliente)); return ["admin", "supervisor", "atendente", "leitura"].includes(v) ? v : "atendente"; }
  catch { return "atendente"; }
}
export function gravarPapelPreferido(armazenamento, conta, cliente, papel) {
  try { if (armazenamento && ["admin", "supervisor", "atendente", "leitura"].includes(papel)) { armazenamento.setItem(chavePapelPreferido(conta, cliente), papel); return true; } } catch { /* sem storage */ }
  return false;
}

/** plano 2000d · DU-130: quantas pessoas por papel (sem o gestor da revenda) e o filtro. */
export function contarPorPapel(us) {
  const r = {};
  for (const u of Array.isArray(us) ? us : []) if (u && !u.gestor && u.papel) r[u.papel] = (r[u.papel] || 0) + 1;
  return r;
}
export const filtrarPorPapel = (us, papel) => (Array.isArray(us) ? us : []).filter(u => u && !u.gestor && (!papel || u.papel === papel));

/** plano 2000d · DU-131: a lista da equipe em CSV (separador «;», BOM, sem fórmula) — nome, e-mail, papel, departamentos e último acesso. */
export function csvEquipe(usuarios, departamentos = []) {
  const esc = v => { let s = v === null || v === undefined ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const nomeDep = id => ((departamentos || []).find(d => d && d.id === id) || {}).nome || "";
  // plano 2000d · FX-037: «Situação» (suspenso, pausado, ausente) e «2 etapas» (quando o servidor informa) — a auditoria de acesso completa
  const lista = (Array.isArray(usuarios) ? usuarios : []).filter(Boolean);
  const com2 = informa2Etapas(lista);
  const linhas = lista.map(u => [u.nome, u.email, u.gestor ? "Gestor" : rotuloPapel(u.papel),
    Array.isArray(u.departamentos) && u.departamentos.length ? u.departamentos.map(nomeDep).filter(Boolean).join(", ") : "Todos",
    u.ultimo_acesso ? String(u.ultimo_acesso).slice(0, 10) : "nunca entrou", situacaoAcesso(u),
    ...(com2 ? [u.gestor ? "" : u.dois_fatores === true ? "sim" : "não"] : [])]);
  return "﻿" + [["Nome", "E-mail", "Papel", "Departamentos", "Último acesso", "Situação", ...(com2 ? ["2 etapas"] : [])], ...linhas].map(l => l.map(esc).join(";")).join("\r\n");
}

/** plano 2000d · DU-132/DU-143: código de 6 dígitos (2 etapas, celular). */
// plano 2000d · FX-017: o código colado como «123-456» ou «123.456» (como chega no WhatsApp) também vale
export const limparCodigo = v => String(v ?? "").replace(/[\s.\-–]/g, "");
export const codigoValido = v => /^\d{6}$/.test(limparCodigo(v));

/** plano 2000d · DU-138: «Chrome · Windows · Taubaté» (sistema e cidade quando o servidor manda). */
export function rotuloSessao(s) {
  const x = s || {};
  // plano 2000d · FX-085: o app instalado (PWA) se distingue da aba do navegador
  return [x.navegador || "Navegador", x.instalado === true ? "app instalado" : null, x.sistema || null, x.cidade || null].filter(Boolean).join(" · ");
}

/** plano 2000d · DU-142: os avisos de mensagem nova por PESSOA (computador compartilhado) — chave com a conta, migrando a antiga. */
export const CHAVE_AVISOS_ANTIGA = "nx-cv-avisos";
export const chaveAvisos = conta => (conta ? `${CHAVE_AVISOS_ANTIGA}:${conta}` : CHAVE_AVISOS_ANTIGA);
export function lerAvisos(armazenamento, conta) {
  const ler = k => { try { const p = JSON.parse((armazenamento && armazenamento.getItem(k)) || "null"); return p && typeof p === "object" ? p : null; } catch { return null; } };
  return ler(chaveAvisos(conta)) || ler(CHAVE_AVISOS_ANTIGA) || {};
}
export function gravarAvisos(armazenamento, conta, mudanca) {
  try {
    const novo = { ...lerAvisos(armazenamento, conta), ...mudanca };
    armazenamento.setItem(chaveAvisos(conta), JSON.stringify(novo));
    // DU-142: enquanto Conversas lê a chave antiga (pendência da frente conv), o espelho mantém o som/aviso deste aparelho funcionando
    armazenamento.setItem(CHAVE_AVISOS_ANTIGA, JSON.stringify(novo));
    return true;
  } catch { return false; }
}

/** plano 2000d · DU-144: a ajuda do e-mail no Perfil diz quem troca (outro administrador, quando existe e o servidor permite). */
export function ajudaEmailPerfil({ trocarEmail = false, outrosAdmins = 0, gestor = false } = {}) {
  if (gestor) return "O e-mail é o seu login. Para trocar, fale com a plataforma.";
  if (trocarEmail && outrosAdmins > 0) return "O e-mail é o seu login. Para trocar, peça a outro administrador (Usuários e convites).";
  return "O e-mail é o seu login. Para trocar o e-mail, fale com quem cuida do seu plano.";
}

/** plano 2000d · DU-145/DU-146/DU-147/DU-202: campos novos da marca da revenda (o servidor antigo recusa — a tela salva o resto e avisa). */
// plano 2000d · DU-152 / FX-056: a janela de boas-vindas da agência (título, texto até 400) e o contato dela
export const CHAVES_MARCA_NOVAS = Object.freeze(["suporte_email", "site", "termos_url", "privacidade_url", "email_remetente", "email_rodape", "icone_app", "teste_aberto",
  "boas_vindas_titulo", "boas_vindas", "contato_agencia"]);
const ROT_CHAVE_NOVA = { suporte_email: "e-mail de suporte", site: "site", termos_url: "link dos Termos", privacidade_url: "link da Política de Privacidade",
  email_remetente: "nome do remetente", email_rodape: "rodapé dos e-mails", icone_app: "ícone do app", teste_aberto: "teste grátis pelo site",
  boas_vindas_titulo: "título das boas-vindas", boas_vindas: "texto das boas-vindas", contato_agencia: "contato da agência" };
export const rotuloChaveMarca = k => ROT_CHAVE_NOVA[k] || k;
/** DU-145/DU-146: erros dos campos novos → [{campo, texto}] (links só https; e-mail válido; limites de tamanho). */
export function validarLinksMarca(m) {
  const x = m || {}, erros = [];
  for (const k of ["site", "termos_url", "privacidade_url"]) {
    const v = String(x[k] || "").trim();
    if (!v) continue;
    let ok = false;
    try { const u = new URL(v); ok = u.protocol === "https:" && RE_HOST.test(u.hostname); } catch { ok = false; }
    if (!ok) erros.push({ campo: k, texto: "Use um endereço completo com https://, ex.: https://suaagencia.com.br/termos" });
  }
  if (x.suporte_email && !RE_EMAIL.test(String(x.suporte_email).trim())) erros.push({ campo: "suporte_email", texto: "Esse e-mail não parece válido." });
  if (x.email_remetente && String(x.email_remetente).trim().length > 60) erros.push({ campo: "email_remetente", texto: "Até 60 caracteres." });
  if (x.email_rodape && String(x.email_rodape).trim().length > 200) erros.push({ campo: "email_rodape", texto: "Até 200 caracteres." });
  // plano 2000d · DU-152 / FX-056
  if (x.boas_vindas_titulo && String(x.boas_vindas_titulo).trim().length > 80) erros.push({ campo: "boas_vindas_titulo", texto: "Até 80 caracteres." });
  if (x.boas_vindas && String(x.boas_vindas).trim().length > 400) erros.push({ campo: "boas_vindas", texto: "Até 400 caracteres." });
  if (x.contato_agencia && String(x.contato_agencia).trim().length > 120) erros.push({ campo: "contato_agencia", texto: "Até 120 caracteres." });
  return erros;
}
/** DU-147: a imagem que vira o ícone do app instalado — o ícone próprio vence o logo (logo largo fica ilegível no celular). */
export function origemIconeApp(m) {
  const x = m || {};
  return x.icone_app || x.logo_cliente || x.favicon || x.logo || null;
}
/** DU-145: tira do pedido as chaves que o servidor recusou (marca_invalida com hint numa chave nova) → {resto, tiradas}. */
export function semChavesNovas(p, recusada = null) {
  const resto = { ...(p || {}) }, tiradas = [];
  for (const k of CHAVES_MARCA_NOVAS) if (k in resto && (!recusada || CHAVES_MARCA_NOVAS.includes(recusada))) { delete resto[k]; tiradas.push(k); }
  return { resto, tiradas };
}

/** plano 2000d · DU-149: link relativo (#/convite/…) com o domínio ativo da revenda — o cliente recebe o endereço da marca. */
export function linkComDominio(link, dominio) {
  const l = String(link || "");
  if (!dominio || !l.startsWith("#")) return l;
  return `https://${normalizarHost(dominio)}/app/${l}`;
}

/** plano 2000d · DU-159: o «Nome» do CNAME como os painéis pedem (só a parte antes do domínio: «crm» em crm.agencia.com.br). */
export function rotuloCname(host) {
  const p = normalizarHost(host).split(".").filter(Boolean);
  for (const n of [3, 2]) {      // o sufixo duplo (agencia.com.br) primeiro: «com.br» sozinho também parece raiz
    if (p.length > n && ehDominioRaiz(p.slice(-n).join("."))) return p.slice(0, -n).join(".");
  }
  return p.length > 2 ? p[0] : "@";
}
/** DU-159: os provedores mais comuns no Brasil, com o caminho até o CNAME. */
export const PROVEDORES_DNS = Object.freeze([
  Object.freeze({ id: "registrobr", nome: "Registro.br" }), Object.freeze({ id: "hostinger", nome: "Hostinger" }),
  Object.freeze({ id: "cloudflare", nome: "Cloudflare" }), Object.freeze({ id: "godaddy", nome: "GoDaddy" }),
]);
export function passosProvedor(id, host, alvo) {
  const nome = rotuloCname(host), valor = alvo || "o destino que a plataforma informar";
  const comum = [`Em Tipo, escolha CNAME.`, `Em Nome (ou Host), escreva só «${nome}».`, `Em Valor (ou Aponta para / Destino), cole ${valor}.`];
  switch (id) {
    case "registrobr": return ["Entre em registro.br e abra o domínio.", "Clique em «Editar zona» (se aparecer «Utilizar DNS do Registro.br», ative antes).", "Clique em «Nova entrada».", ...comum, "Salve e clique em «Salvar alterações»."];
    case "hostinger": return ["No hPanel, abra Domínios → o domínio → «DNS / Nameservers».", "Na parte «Gerenciar registros DNS», adicione um registro.", ...comum, "Deixe o TTL padrão e clique em «Adicionar registro»."];
    case "cloudflare": return ["No painel da Cloudflare, abra o domínio → DNS → Registros.", "Clique em «Adicionar registro».", ...comum, "Deixe o proxy DESLIGADO (nuvem cinza, «somente DNS») e salve."];
    case "godaddy": return ["Em Meus produtos, abra o domínio → «Gerenciar DNS».", "Clique em «Adicionar novo registro».", ...comum, "Salve."];
    default: return comum;
  }
}
/** plano 2000d · DU-161: domínio raiz digitado → o subdomínio sugerido (app.agencia.com.br); null quando já é subdomínio. */
export function sugestaoSubdominio(host) {
  const x = normalizarHost(host);
  return x && ehDominioRaiz(x) ? `app.${x}` : null;
}

/** plano 2000d · DU-164: pagamento pendente → o prazo para regularizar (antes da suspensão). */
export function avisoPagamentoPendente(regularizarAte) {
  const d = dataCurta(regularizarAte);
  return { texto: `O pagamento está pendente.${d ? ` Regularize até ${d} para a conta não ser suspensa.` : " Regularize para a conta não ser suspensa."}`, tom: "aten" };
}

/** plano 2000d · DU-167: os planos do «Comparar» por preço (sob consulta no fim) e o selo «Mais escolhido» no marcado pela revenda. */
export function ordenarPlanosComparar(lista) {
  const preco = p => (p && p.preco_mensal != null && Number.isFinite(Number(p.preco_mensal)) ? Number(p.preco_mensal) : Infinity);
  return (Array.isArray(lista) ? lista : []).filter(Boolean).map((p, i) => ({ p, i })).sort((a, b) => preco(a.p) - preco(b.p) || a.i - b.i).map(x => x.p);
}

/** plano 2000d · DU-168: quando a cota de IA volta a zero (dia 1º do mês seguinte, data de São Paulo). */
export function textoRenovacaoIA(hoje) {
  const m = /^(\d{4})-(\d{2})/.exec(String(hoje || ""));
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2], 1));
  return `Renova em 01/${String(d.getUTCMonth() + 1).padStart(2, "0")}.`;
}

/** plano 2000d · DU-169: o pedido de um pacote avulso de IA para o mês (não troca o plano inteiro). */
export function textoPedidoPacoteIA({ cliente = "", quantidade = 500 } = {}) {
  return `Olá! Quero comprar um pacote extra de ${quantidade} usos de IA neste mês para a ${cliente}, sem mudar o plano.`.replace(/\s+/g, " ").trim();
}

/** plano 2000d · DU-170: o plano sem preço diz com quem o valor foi combinado. */
export const textoSemPreco = org => (org ? `Valor combinado com a ${org}.` : "Valor combinado com quem cuida do seu plano.");

/** plano 2000d · DU-171: «6 de 9 prontos» a partir das pendências do checklist (só as seções visíveis que o checklist acompanha). */
export function progressoChecklist(pend, idsVisiveis) {
  const ids = (Array.isArray(idsVisiveis) ? idsVisiveis : []).filter(id => SECOES_COM_PEND.includes(id));
  const p = pend || {};
  return { feitos: ids.filter(id => !(Number(p[id]) > 0)).length, total: ids.length };
}

/** plano 2000d · DU-173: as seções que cada módulo de outra frente publica — se o import falhar, o item continua no menu com o erro. */
export const SECOES_EXTERNAS_CONHECIDAS = Object.freeze({
  "crm-config.js": Object.freeze([["funis", "Funis e etapas", "CRM"], ["campos", "Campos personalizados", "CRM"], ["etiquetas", "Etiquetas", "CRM"], ["motivos", "Motivos de perda", "CRM"]]),
  "cv-config.js": Object.freeze([["numeros", "Números de WhatsApp", "Atendimento"], ["respostas", "Respostas rápidas", "Atendimento"], ["atendimento", "Preferências do atendimento", "Atendimento"], ["ia", "Assistente de IA", "Atendimento"], ["departamentos", "Departamentos e horários", "Equipe"]]),
  "ads-config.js": Object.freeze([["anuncios", "Anúncios", "Anúncios"], ["formulario", "Formulário do site", "Anúncios"]]),
  "agenda-config.js": Object.freeze([["agenda", "Agenda", "CRM"]]),
  "rastreio-config.js": Object.freeze([["rastreio", "Site e anúncios", "Anúncios"]]),
});

/** plano 2000d · DU-174: há um diálogo ou gaveta aberto (o «/» não rouba o foco de dentro dele)? */
export function haCamadaAberta(doc = typeof document !== "undefined" ? document : null) {
  try { return !!(doc && doc.querySelector && doc.querySelector("dialog[open], [aria-modal=\"true\"], .gaveta[open]")); } catch { return false; }
}

/** plano 2000d · DU-178: a senha atual errada na troca avisa quantas tentativas faltam (hint «restam:N», a mesma régua do login). */
export function fraseSenhaAtualErrada(hint) {
  const base = "A senha atual não confere.";
  const m = /restam:(\d{1,2})\b/.exec(String(hint ?? ""));
  if (!m) return base;
  const n = Number(m[1]);
  return n <= 0 ? `${base} A próxima tentativa errada bloqueia por 15 min.` : `${base} Mais ${n} tentativa${n === 1 ? "" : "s"} antes de bloquear por 15 min.`;
}

/** plano 2000d · DU-179: o texto da seção indisponível cita quem cuida do plano (a revenda) — nunca a plataforma. */
export function textoMotivoSecao(motivo, orgNome = null) {
  const quem = orgNome ? `a ${orgNome}` : "quem cuida do seu plano";
  if (motivo === "modulo") return `Ela não faz parte do plano desta empresa. Veja o Plano e uso ou fale com ${quem}.`;
  if (motivo === "papel") return "O seu acesso não inclui esta seção. Peça a um administrador da empresa.";
  if (motivo === "inexistente") return "Esse endereço não corresponde a nenhuma seção.";
  return "";
}

/** plano 2000d · DU-394/DU-395/DU-422: Dados da empresa — fusos do Brasil, prazos de guarda e as variáveis para as mensagens. */
export const FUSOS_BR = Object.freeze([["America/Sao_Paulo", "Brasília (SP, RJ, MG, Sul, Nordeste…)"], ["America/Manaus", "Amazonas (−1 h)"], ["America/Cuiaba", "Mato Grosso (−1 h)"],
  ["America/Porto_Velho", "Rondônia (−1 h)"], ["America/Boa_Vista", "Roraima (−1 h)"], ["America/Rio_Branco", "Acre (−2 h)"], ["America/Noronha", "Fernando de Noronha (+1 h)"]]);
export const PRAZOS_GUARDA = Object.freeze([["", "Para sempre (padrão)"], ["12", "12 meses"], ["24", "24 meses"], ["60", "60 meses"]]);
/** → [{campo, texto}] */
export function validarDadosEmpresa(d) {
  const x = d || {}, erros = [];
  // plano 2000d · FX-025 / FX-102: 0800, 4004 e DDD que não existe
  if (x.telefone_empresa && !telefoneEmpresaValido(x.telefone_empresa)) erros.push({ campo: "telefone_empresa", texto: "Use DDD + número, ex.: (12) 3632-0000 (ou 0800 / 4004)." });
  else if (x.telefone_empresa && !dddValido(x.telefone_empresa)) erros.push({ campo: "telefone_empresa", texto: "Esse DDD não existe. Confira os dois primeiros números." });
  // plano 2000d · FX-024: o link do perfil colado vira o usuário
  if (x.instagram && !/^@?[a-z0-9._]{1,30}$/i.test(normalizarInstagram(x.instagram))) erros.push({ campo: "instagram", texto: "Só o usuário, ex.: @suaclinica." });
  // plano 2000d · DU-095 / DU-036 / DU-072 (FX-020 / FX-021 / FX-022)
  if (x.minutos_por_mensagem !== undefined && x.minutos_por_mensagem !== null && x.minutos_por_mensagem !== "" && Number.isNaN(lerMinutos(x.minutos_por_mensagem))) erros.push({ campo: "minutos_por_mensagem", texto: "De 0,5 a 30 minutos." });
  if (x.link_avaliacao && !linkHttpsValido(completarHttps(x.link_avaliacao))) erros.push({ campo: "link_avaliacao", texto: "Cole o link completo da avaliação, ex.: https://g.page/r/…/review" });
  if (x.feriados) { const f = separarFeriados(x.feriados); if (f.invalidos.length) erros.push({ campo: "feriados", texto: `Datas que não entendemos: ${f.invalidos.slice(0, 4).join(", ")}. Use 25/12, 20/01/2027 ou 2027-01-20.` }); }
  if (x.endereco && String(x.endereco).trim().length > 200) erros.push({ campo: "endereco", texto: "Até 200 caracteres." });
  if (x.fuso && !FUSOS_BR.some(([v]) => v === x.fuso)) erros.push({ campo: "fuso", texto: "Escolha um fuso da lista." });
  if (x.retencao_meses && !PRAZOS_GUARDA.some(([v]) => v === String(x.retencao_meses))) erros.push({ campo: "retencao_meses", texto: "Escolha um prazo da lista." });
  return erros;
}
/** DU-395: {endereco}, {telefone_empresa} e {instagram} trocados pelo cadastro (o que falta fica como está). */
export function trocarVariaveisEmpresa(texto, d) {
  const x = d || {};
  // plano 2000d · DU-036 / FX-021: {link_avaliacao} também
  return String(texto || "").replace(/\{(endereco|telefone_empresa|instagram|link_avaliacao)\}/g, (t, k) => {
    const v = String(x[k] || "").trim();
    if (!v) return t;
    if (k === "link_avaliacao") return completarHttps(v);
    return k === "instagram" ? `@${normalizarInstagram(v)}` : v;
  });
}

/** plano 2000d · DU-148: o nome curto do app instalado (short_name do manifesto) — a mesma régua do rotas.nomeCurto, sem carregar o shell. */
export function nomeCurtoManifesto(produto, curto, max = 12) {
  const p = String(produto || "").trim(), c = String(curto || "").trim();
  const junto = `${p} ${c}`.trim();
  if (junto.length <= max) return junto;
  if (p.length <= max) return p;
  const corte = p.slice(0, max + 1).lastIndexOf(" ");
  if (corte > 0) return p.slice(0, corte).trim();
  return c && c.length <= max ? c : p.slice(0, max);
}

/* ---------------------------------------------------------------- plano 2000d · complemento da frente config (FX) */
/** plano 2000d · FX-001 / DU-128: as partes do Perfil que ?secao= abre (aceita «avisos#cfg-pf-avisos», o link do menu da conta). */
export const PARTES_PERFIL = Object.freeze({ dados: "cfg-pf-dados", avisos: "cfg-pf-avisos", ausente: "cfg-pf-avisos", seguranca: "cfg-pf-seguranca", "2fa": "cfg-pf-seguranca",
  senha: "cfg-pf-senha", sessoes: "cfg-pf-sessoes" });
export function parteDoPerfil(secao) {
  const s = String(secao || "").split("#")[0].trim().toLowerCase();
  return Object.hasOwn(PARTES_PERFIL, s) ? PARTES_PERFIL[s] : null;
}
const RE_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** plano 2000d · FX-003 / DU-268: horário silencioso — os dois vazios (desligado) ou os dois em HH:MM e diferentes (pode atravessar a meia-noite). */
export function silencioValido(de, ate) {
  const a = String(de || "").trim(), b = String(ate || "").trim();
  if (!a && !b) return true;
  return RE_HHMM.test(a) && RE_HHMM.test(b) && a !== b;
}
/** plano 2000d · FX-004: a frase do horário silencioso («Sem som nem aviso das 22:00 às 07:00, atravessando a meia-noite.»). */
export function rotuloSilencio(s) {
  if (!s || !RE_HHMM.test(String(s.de || "")) || !RE_HHMM.test(String(s.ate || "")) || s.de === s.ate) return "Sem horário silencioso: os avisos tocam a qualquer hora.";
  return `Sem som nem aviso das ${s.de} às ${s.ate}${s.de > s.ate ? ", atravessando a meia-noite" : ""}.`;
}
/** plano 2000d · FX-005 / DU-408: «Abrir o app na última tela» (padrão ligado; "0" desliga — o app.js lê). */
export const CHAVE_ABRIR_ULTIMA = "nx-abrir-ultima";
export function lerAbrirUltima(arm) { try { return !arm || arm.getItem(CHAVE_ABRIR_ULTIMA) !== "0"; } catch { return true; } }
export function gravarAbrirUltima(arm, ligado) {
  try { if (ligado) arm.removeItem(CHAVE_ABRIR_ULTIMA); else arm.setItem(CHAVE_ABRIR_ULTIMA, "0"); return true; } catch { return false; }
}
/** plano 2000d · FX-009: nome sem espaço sobrando («  Ana   Souza » → «Ana Souza»). */
export const limparNome = v => String(v ?? "").trim().replace(/\s+/g, " ");
/** plano 2000d · FX-008: a repetição da senha conferida enquanto digita → {ok, texto} (ok null = ainda digitando um começo igual). */
export function conferirRepeticao(nova, nova2) {
  const a = String(nova || ""), b = String(nova2 || "");
  if (!b) return { ok: null, texto: "" };
  if (a === b) return { ok: true, texto: "As senhas conferem." };
  if (a.startsWith(b)) return { ok: null, texto: "" };
  return { ok: false, texto: "As duas senhas não são iguais." };
}
/** plano 2000d · FX-010: como a assinatura sai no fim de uma mensagem. */
export function previaAssinatura(assinatura, mensagem = "Tem sim! Às 14h ou às 16h?") {
  const a = String(assinatura || "").trim();
  return a ? `${mensagem}\n${a}` : "";
}
/** plano 2000d · FX-102: DDD que existe no Brasil (com ou sem 55 na frente). Números especiais (0800/4004) e de fora passam. */
const DDDS = new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
export function dddValido(v) {
  const t = String(v ?? "").trim();
  let d = t.replace(/\D/g, "");
  if (!d || numeroEspecial(d)) return true;
  if (t.startsWith("+") && !d.startsWith("55")) return true;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return true;
  return DDDS.has(Number(d.slice(0, 2)));
}
/** plano 2000d · FX-012: parece telefone fixo (8 dígitos começando com 2 a 5 depois do DDD) — o WhatsApp precisa de celular. */
export function pareceFixo(v) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  return d.length === 10 && /^[2-5]$/.test(d[2]);
}
/** plano 2000d · FX-025: 0800/0300 e 3003/4003/4004/4020/4062 (números de empresa sem DDD). */
const numeroEspecial = d => /^0[3589]00\d{6,7}$/.test(d) || /^(3003|4003|4004|4020|4062)\d{4}$/.test(d);
export function telefoneEmpresaValido(v) { const d = String(v ?? "").replace(/\D/g, ""); return numeroEspecial(d) || telefoneValido(v); }
export function normalizarTelefoneEmpresa(v) { const d = String(v ?? "").replace(/\D/g, ""); return numeroEspecial(d) ? d : normalizarTelefone(v); }
/** plano 2000d · FX-024: «https://www.instagram.com/clinica/?hl=pt» e «@clinica» → «clinica». */
export function normalizarInstagram(v) {
  const t = String(v ?? "").trim();
  const m = /instagram\.com\/([^/?#\s]+)/i.exec(t);
  return (m ? m[1] : t).replace(/^@+/, "").trim();
}
/** plano 2000d · FX-020 / DU-095: minutos por mensagem (0,5 a 30; aceita vírgula). null = vazio; NaN = fora da régua. */
export function lerMinutos(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0.5 && n <= 30 ? Math.round(n * 10) / 10 : NaN;
}
/** plano 2000d · FX-058: «suaagencia.com.br/termos» ganha o https:// (http:// também vira https://). */
export function completarHttps(v) {
  const t = String(v ?? "").trim();
  if (!t) return "";
  if (/^https:\/\//i.test(t)) return t;
  if (/^http:\/\//i.test(t)) return `https://${t.slice(7)}`;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(t) ? `https://${t}` : t;
}
const linkHttpsValido = v => { try { const u = new URL(String(v || "")); return u.protocol === "https:" && RE_HOST.test(u.hostname); } catch { return false; } };
/** plano 2000d · FX-022 / DU-072: feriados da empresa — «25/12, 20/01/2027; 2027-03-04» → {lista: ["12-25", "2027-01-20", …], invalidos}. */
export function separarFeriados(texto) {
  const lista = new Set(), invalidos = [];
  const valida = (a, m, d) => { const dt = new Date(Date.UTC(a, m - 1, d)); return m >= 1 && m <= 12 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; };
  for (const p of String(texto || "").split(/[,;\n\r]+/).map(x => x.trim()).filter(Boolean)) {
    let m;
    const dois = n => String(n).padStart(2, "0");
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p)) && valida(+m[1], +m[2], +m[3])) lista.add(`${m[1]}-${m[2]}-${m[3]}`);
    else if ((m = /^(\d{2})-(\d{2})$/.exec(p)) && valida(2024, +m[1], +m[2])) lista.add(`${m[1]}-${m[2]}`);
    else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(p)) && valida(+m[3], +m[2], +m[1])) lista.add(`${m[3]}-${dois(m[2])}-${dois(m[1])}`);
    else if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(p)) && valida(2024, +m[2], +m[1])) lista.add(`${dois(m[2])}-${dois(m[1])}`);
    else invalidos.push(p);
  }
  return { lista: [...lista].sort((a, b) => a.slice(-5).localeCompare(b.slice(-5)) || a.localeCompare(b)), invalidos };
}
/** plano 2000d · FX-022: a lista guardada de volta no campo («25/12, 20/01/2027»). */
export const feriadosEmTexto = l => (Array.isArray(l) ? l : []).map(f => { const p = String(f).split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : `${p[1]}/${p[0]}`; }).join(", ");
/** plano 2000d · FX-023: os campos novos da empresa (o servidor de hoje pode recusar — a tela salva o resto e avisa). */
export const CHAVES_EMPRESA_NOVAS = Object.freeze(["minutos_por_mensagem", "link_avaliacao", "feriados"]);
export const ROTULO_CHAVE_EMPRESA = Object.freeze({ minutos_por_mensagem: "minutos por mensagem", link_avaliacao: "link de avaliação", feriados: "feriados" });
/** plano 2000d · FX-026: as variáveis que os dados da empresa alimentam. */
export const VARIAVEIS_EMPRESA = Object.freeze(["{endereco}", "{telefone_empresa}", "{instagram}", "{link_avaliacao}"]);
/** plano 2000d · FX-027: o deslocamento (minutos) de um fuso numa data. */
function deslocamentoFuso(tz, d) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
    const g = t => Number((p.find(x => x.type === t) || {}).value);
    return Math.round((Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - d.getTime()) / 60000);
  } catch { return null; }
}
/** FX-027: o fuso da empresa tem outra hora que o deste aparelho agora? (Bahia e São Paulo têm a mesma hora: não avisa) */
export function fusoDifere(fusoEmpresa, fusoAparelho, agora = new Date()) {
  if (!fusoEmpresa || !fusoAparelho || fusoEmpresa === fusoAparelho) return false;
  const a = deslocamentoFuso(fusoEmpresa, agora), b = deslocamentoFuso(fusoAparelho, agora);
  return a !== null && b !== null && a !== b;
}
/** plano 2000d · FX-119: o novo prazo de guarda apaga algo? (de «para sempre» para N meses, ou de N para menos) */
export function prazoEncurta(antes, depois) {
  const a = Number(antes) || 0, b = Number(depois) || 0;
  return b > 0 && (a === 0 || b < a);
}
/** plano 2000d · FX-112: o perfil do Instagram (para conferir o usuário). */
export const linkInstagram = v => { const u = normalizarInstagram(v); return /^[a-z0-9._]{1,30}$/i.test(u) ? `https://www.instagram.com/${u}/` : null; };
/** plano 2000d · FX-093: «Ver no mapa» do endereço. */
export const linkMapa = endereco => (String(endereco || "").trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(endereco).trim())}` : null);
/** plano 2000d · FX-019 / DR-333: a chave do checklist (pulados) — sem conta não há chave («nx-onb:<cli>:-» não é mais lida). */
export const chaveOnboardingCfg = (cliente, conta) => (cliente && conta ? `nx-onb:${cliente}:${conta}` : null);
/** plano 2000d · FX-013: este aparelho primeiro, depois o uso mais recente. */
export function ordenarSessoes(lista) {
  const t = s => Date.parse((s && (s.ultimo_uso || s.criado_em)) || "") || 0;
  return (Array.isArray(lista) ? lista : []).filter(Boolean).map((s, i) => ({ s, i })).sort((a, b) => (b.s.atual === true) - (a.s.atual === true) || t(b.s) - t(a.s) || a.i - b.i).map(x => x.s);
}
/** plano 2000d · FX-015: o arquivo dos códigos de recuperação (sem a marca da plataforma: o produto é o da marca em uso). */
export function textoCodigosRecuperacao({ produto = "", email = "", codigos = [], data = "" } = {}) {
  return [`Códigos de recuperação${produto ? ` — ${produto}` : ""}`, email ? `Conta: ${email}` : null, data ? `Gerados em ${data}` : null, "",
    "Cada código vale uma vez, para entrar se você perder o celular.", "", ...(Array.isArray(codigos) ? codigos : []).map(String)].filter(x => x !== null).join("\n");
}
/** plano 2000d · FX-016: a chave do app autenticador em grupos de 4 («JBSW Y3DP EHPK»). */
export const agruparSegredo = s => String(s || "").replace(/\s+/g, "").toUpperCase().replace(/(.{4})(?=.)/g, "$1 ");
/** plano 2000d · FX-034 / FX-050: erro comum de digitação no domínio do e-mail → a sugestão (ou null). */
const DOMINIOS_CERTOS = { "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com", "gamil.com": "gmail.com", "gmail.com.br": "gmail.com", "gmal.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmail.co": "hotmail.com", "hotmai.com": "hotmail.com", "homail.com": "hotmail.com",
  "outlok.com": "outlook.com", "outlook.co": "outlook.com", "otlook.com": "outlook.com", "yaho.com": "yahoo.com", "yahoo.com.b": "yahoo.com.br",
  "uol.com": "uol.com.br", "bol.com": "bol.com.br", "icloud.co": "icloud.com", "iclod.com": "icloud.com" };
export function sugestaoEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(e);
  if (!m || !DOMINIOS_CERTOS[m[2]]) return null;
  return `${m[1]}@${DOMINIOS_CERTOS[m[2]]}`;
}
/** plano 2000d · FX-105: quantos convites de uma vez («Vários e-mails»). */
export const LIMITE_CONVITES_LOTE = 50;
/** plano 2000d · FX-036: «4 e-mails · 1 não parece e-mail» enquanto cola a lista. */
export function resumoEmails(texto) {
  const { validos, invalidos } = separarEmails(texto);
  if (!validos.length && !invalidos.length) return "";
  return [`${validos.length} ${validos.length === 1 ? "e-mail" : "e-mails"}`, invalidos.length ? `${invalidos.length} ${invalidos.length === 1 ? "não parece e-mail" : "não parecem e-mail"}` : null].filter(Boolean).join(" · ");
}
/** plano 2000d · FX-037 / SC-004: a situação do acesso da pessoa numa palavra. */
export function situacaoAcesso(u, agora = Date.now()) {
  if (u && u.suspenso === true) return "Suspenso";
  if (acessoPausado(u, agora)) return `Pausado até ${dataCurta(u.pausado_ate)}`;
  if (ausenteAte(u, agora)) return "Ausente";
  return "Ativo";
}
/** plano 2000d · FX-038: nome de arquivo sem acento, espaço nem traço sobrando («Clínica São José!» → «clinica-sao-jose»). */
export const nomeArquivo = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "empresa";
/** plano 2000d · FX-039: quantas pessoas estão com o app aberto agora. */
export const contarOnline = (us, agora = Date.now()) => (Array.isArray(us) ? us : []).filter(u => u && !u.gestor && estaOnline(u.ultimo_acesso, agora)).length;
/** plano 2000d · FX-041: dias sem entrar (null para quem nunca entrou ou sem data). */
export function diasSemEntrar(u, agora = Date.now()) {
  const t = Date.parse((u && u.ultimo_acesso) || "");
  const a = agora instanceof Date ? agora.getTime() : Number(agora);
  return Number.isFinite(t) ? Math.max(0, Math.floor((a - t) / 86400000)) : null;
}
/** FX-041/FX-042: quem tem acesso e não entra há 30 dias ou mais (vaga do plano parada). */
export const inativos = (us, dias = 30, agora = Date.now()) => (Array.isArray(us) ? us : []).filter(u => u && !u.gestor && !u.eu && (diasSemEntrar(u, agora) ?? -1) >= dias);
/** plano 2000d · FX-033: convites aguardando — o que vence primeiro no topo. */
export function ordenarConvites(l) {
  const t = c => { const x = Date.parse((c && c.expira_em) || ""); return Number.isFinite(x) ? x : Infinity; };
  return (Array.isArray(l) ? l : []).filter(Boolean).map((c, i) => ({ c, i })).sort((a, b) => t(a.c) - t(b.c) || a.i - b.i).map(x => x.c);
}
/** plano 2000d · FX-043: o texto do link de equipe para o WhatsApp (neutro, sem a marca da plataforma). */
export const textoLinkEquipe = ({ cliente = "", produto = "" } = {}) => `Olá! Para entrar na equipe da ${cliente}${produto ? ` no ${produto}` : ""}, peça seu acesso por este link:`.replace(/\s+/g, " ");
/** plano 2000d · FX-044: o link de equipe ainda serve? → "ativo" | "esgotado" | "vencido". */
export function estadoLinkEquipe(le, agora = Date.now()) {
  const x = le || {};
  const a = agora instanceof Date ? agora.getTime() : Number(agora);
  const exp = Date.parse(x.expira_em || "");
  if (Number.isFinite(exp) && exp <= a) return "vencido";
  if (Number(x.limite) > 0 && Number(x.usos || 0) >= Number(x.limite)) return "esgotado";
  return "ativo";
}
/** plano 2000d · FX-101: o link de equipe não promete mais entradas do que as vagas do plano. → erro ou null. */
export function erroLimiteLinkEquipe(limite, { uso = null, lim = null } = {}) {
  const n = Math.floor(Number(limite));
  if (!(n >= 1 && n <= 50)) return "De 1 a 50 pessoas.";
  if (Number(lim) > 0 && Number.isFinite(Number(uso))) {
    const vagas = Math.max(0, Number(lim) - Number(uso));
    if (n > vagas) return vagas ? `O plano tem só ${vagas} ${vagas === 1 ? "vaga" : "vagas"} de usuário agora.` : "O plano não tem vagas de usuário agora.";
  }
  return null;
}
/** plano 2000d · FX-046: a matriz mudou? (só as caixas que a pessoa pode mexer contam) */
export function permissoesIguais(a, b) {
  const x = matrizPermissoes(a), y = matrizPermissoes(b);
  return Object.keys(x).every(p => PERMISSOES.every(pm => x[p][pm.id] === y[p][pm.id]));
}
/** plano 2000d · FX-047: AAAA-MM-DD mais n dias (atalhos de pausa: 1 semana, 15 dias, 30 dias). */
export function dataMaisDias(iso, n) {
  const t = diaUTC(iso);
  return Number.isFinite(t) ? new Date(t + Number(n) * 86400000).toISOString().slice(0, 10) : "";
}
/** plano 2000d · FX-054 / DU-150: impressão curta da marca salva (FNV-1a) — as outras abas repintam quando muda. */
export function hashCurto(v) {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? null);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
/** plano 2000d · FX-055 / DU-322: o nome aproximado da cor («Azul petróleo» seguido do código) para o leitor de tela. */
export function nomeCor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return String(hex || "");
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d) hue = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (hue < 0) hue += 360;
  const cod = `#${m[1].toUpperCase()}`;
  let nome;
  if (s < 0.12) nome = l < 0.12 ? "Preto" : l > 0.92 ? "Branco" : l < 0.4 ? "Cinza-escuro" : l > 0.7 ? "Cinza-claro" : "Cinza";
  else {
    const base = hue < 15 || hue >= 345 ? "Vermelho" : hue < 40 ? (l < 0.35 ? "Marrom" : "Laranja") : hue < 65 ? (l < 0.35 ? "Oliva" : "Amarelo") : hue < 160 ? "Verde"
      : hue < 195 ? "Azul petróleo" : hue < 250 ? "Azul" : hue < 290 ? "Roxo" : "Rosa";
    nome = base === "Azul petróleo" || base === "Marrom" || base === "Oliva" ? base : l < 0.3 ? `${base}-escuro` : l > 0.75 ? `${base}-claro` : base;
  }
  return `${nome} ${cod}`;
}
/** plano 2000d · FX-057: o nome do produto que não cabe no ícone do celular avisa como fica. */
export function avisoNomeCurto(produto) {
  const p = String(produto || "").trim();
  const curto = nomeCurtoManifesto(p, "");
  return p && curto !== p ? `Na tela inicial do celular, aparece como «${curto}».` : "";
}
/** plano 2000d · FX-061: as três cores em texto (para mandar ao designer). */
export function textoCoresMarca(c) {
  const x = c || {};
  return [["Primária", x.primaria], ["Secundária", x.secundaria], ["Fundo", x.fundo]].filter(([, v]) => v).map(([k, v]) => `${k}: ${String(v).toUpperCase()}`).join("\n");
}
/** plano 2000d · FX-087 / FX-088: o arquivo de imagem serve? → mensagem de erro ou null (antes de decodificar: 40 MB travava a aba). */
export function erroArquivoImagem(f, { mb = 15 } = {}) {
  if (!f) return "Nenhum arquivo escolhido.";
  const tipo = String(f.type || "").toLowerCase(), nome = String(f.name || "").toLowerCase();
  if (tipo === "image/svg+xml" || /\.svg$/.test(nome)) return "SVG não é aceito: exporte o logo como PNG (fundo transparente) e envie de novo.";
  if (/heic|heif/.test(tipo) || /\.(heic|heif)$/.test(nome)) return "Foto HEIC do iPhone não é aceita: exporte como JPEG (ou tire um print) e envie de novo.";
  if (tipo && !/^image\/(png|jpeg|webp)$/.test(tipo)) return "Use uma imagem PNG, JPEG ou WebP.";
  if (Number(f.size) > mb * 1024 * 1024) return `A imagem tem mais de ${mb} MB. Reduza antes de enviar (um print da tela já serve).`;
  return null;
}
/** plano 2000d · FX-066: domínios que precisam de atenção primeiro (parou de apontar, pendente, ativo), depois por nome. */
export function ordenarDominios(l) {
  const peso = { quebrado: 0, pendente: 1, ativo: 2 };
  return (Array.isArray(l) ? l : []).filter(Boolean).slice().sort((a, b) => (peso[a.status] ?? 3) - (peso[b.status] ?? 3) || String(a.host).localeCompare(String(b.host)));
}
/** plano 2000d · FX-067: o endereço já está na lista? (a recusa vinha só do servidor, depois do toque) */
export const hostJaCadastrado = (lista, host) => (Array.isArray(lista) ? lista : []).some(d => d && normalizarHost(d.host) === normalizarHost(host));
/** plano 2000d · FX-095: o registro inteiro para mandar a quem cuida do DNS. */
export function textoRegistroDns(host, alvo) {
  return [`Tipo: CNAME`, `Nome: ${rotuloCname(host)} (endereço completo: ${normalizarHost(host)})`, `Valor: ${alvo || "o destino que a plataforma informar"}`,
    "Se usar Cloudflare, deixe o proxy desligado (nuvem cinza)."].join("\n");
}
/** plano 2000d · FX-068: «R$ 300 em aberto em 2 faturas (1 atrasada)» → {aberto, n, atrasadas} ou null sem nada em aberto. */
export function resumoFaturas(fs) {
  const abertas = (Array.isArray(fs) ? fs : []).filter(f => f && f.status !== "paga");
  if (!abertas.length) return null;
  return { aberto: Math.round(abertas.reduce((s, f) => s + (Number(f.valor) || 0), 0) * 100) / 100, n: abertas.length, atrasadas: abertas.filter(f => f.status === "atrasada").length };
}
/** plano 2000d · FX-069: atrasadas primeiro, depois em aberto pelo vencimento, depois as pagas (mais recente primeiro). */
export function ordenarFaturas(fs) {
  const g = f => (f.status === "atrasada" ? 0 : f.status === "paga" ? 2 : 1);
  return (Array.isArray(fs) ? fs : []).filter(Boolean).slice().sort((a, b) => g(a) - g(b) || (g(a) === 2 ? String(b.vencimento || "").localeCompare(String(a.vencimento || "")) : String(a.vencimento || "").localeCompare(String(b.vencimento || ""))));
}
/** plano 2000d · FX-096: dias de atraso de uma fatura (0 quando não venceu). */
export function diasAtraso(vencimento, hoje) {
  const a = diaUTC(vencimento), b = diaUTC(hoje);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : 0;
}
/** plano 2000d · FX-071: «Sobram 2» / «No limite» / «1 acima do limite» ao lado da barra (null sem limite). */
export function sobraLimite(uso, limite) {
  const l = Number(limite), u = Math.max(0, Number(uso) || 0);
  if (limite === null || limite === undefined || !(l > 0)) return null;
  if (u < l) return `Sobram ${l - u}`;
  return u === l ? "No limite" : `${u - l} acima do limite`;
}
/** plano 2000d · FX-072: variação em % de um mês para o outro (null sem base). */
export function variacaoPct(atual, anterior) {
  const a = Number(atual), b = Number(anterior);
  return Number.isFinite(a) && Number.isFinite(b) && b > 0 ? Math.round(((a - b) / b) * 100) : null;
}
/** plano 2000d · FX-073: a mídia guardada passou de 90 % do limite? */
export const midiaQuaseCheia = (mb, limite) => Number(limite) > 0 && (Number(mb) || 0) / Number(limite) >= 0.9;
/** plano 2000d · FX-070: o pedido de cancelamento com «Outro motivo» precisa do texto. → erro ou null. */
export function erroCancelamento(d) {
  const x = d || {};
  if (!x.motivo) return { campo: "motivo", texto: "Escolha um motivo." };
  if (x.motivo === "outro" && String(x.faltou || "").trim().length < 3) return { campo: "faltou", texto: "Conte em poucas palavras o motivo." };
  return null;
}
/** plano 2000d · FX-092: o histórico em CSV (auditoria de acesso para a LGPD). */
export function csvAuditoria(evs) {
  const esc = v => { let s = v === null || v === undefined ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // a hora no fuso de São Paulo (o servidor manda em UTC)
  const quando = em => {
    const d = new Date(em || "");
    if (Number.isNaN(d.getTime())) return String(em || "").replace("T", " ").slice(0, 16);
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  };
  const linhas = (Array.isArray(evs) ? evs : []).filter(Boolean).map(e => [quando(e.em), e.quem || "", textoEventoAuditoria(e)]);
  return "﻿" + [["Quando", "Quem", "O que aconteceu"], ...linhas].map(l => l.map(esc).join(";")).join("\r\n");
}
/** plano 2000d · FX-091: os e-mails da lista (para mandar um comunicado). */
export const emailsDe = us => [...new Set((Array.isArray(us) ? us : []).filter(u => u && !u.gestor && u.email).map(u => String(u.email).trim().toLowerCase()))].join(", ");
/** plano 2000d · FX-100: a seção pedida não existe — a mais parecida pelo endereço («#/config/usuario» → Usuários e convites). */
export function secaoParecida(secoes, pedida) {
  const p = semAcento(pedida).replace(/[^a-z0-9]+/g, " ").trim();
  if (p.length < 3) return null;
  const l = Array.isArray(secoes) ? secoes : [];
  return l.find(s => s.id.startsWith(p.slice(0, 4)) || p.startsWith(s.id.slice(0, 4))) || l.find(s => filtrarSecoes([s], p).length) || null;
}

let _podeSair = null, _pendente = null;      // plano 1000 · AS-082: a seção aberta diz se pode sair (alteração não salva → pergunta antes de trocar)

/** plano 2000d · DU-173: importar = (caminho) → módulo (injetável no teste). Falha no import de um módulo que esta versão conhece não some
    em silêncio: as seções dele continuam no menu e abrem «Não carregou — tentar de novo»; nada fica em cache, a próxima abertura tenta de novo. */
export async function secoesExternas(ctx, importar = null) {
  if (_externas && _versaoExt === ctx.versao) return _externas;
  const lista = [];
  let falhou = false;
  await Promise.all(EXTERNOS.map(async arq => {
    try {
      const m = importar ? await importar(`./${arq}?v=${encodeURIComponent(ctx.versao)}`) : await import(`./${arq}?v=${encodeURIComponent(ctx.versao)}`);
      if (Array.isArray(m.secoesConfig)) for (const s of m.secoesConfig) if (s && s.id && typeof s.montar === "function") lista.push(s);
    } catch (e) {
      falhou = true;
      console.error(`config: ${arq} não carregou`, e);
      for (const [id, titulo, grupo] of SECOES_EXTERNAS_CONHECIDAS[arq] || []) lista.push({ id, titulo, grupo, desc: "Não carregou — toque para tentar de novo", icone: "alerta", falhou: true, papelMin: "admin",
        montar: (c, alvo) => { c.ui.limpar(alvo); alvo.appendChild(c.ui.erroCartao(Object.assign(new Error("Esta seção não carregou. Confira a internet e tente de novo."), { codigo: "secao_nao_carregou" }), () => { _externas = null; montar(c); })); } });
    }
  }));
  _externas = falhou ? null : lista; _versaoExt = falhou ? null : ctx.versao;
  return lista;
}

function secoesProprias() {
  return [
    { id: "perfil", titulo: "Perfil", desc: "Seu nome, celular e senha", grupo: "Você", papelMin: null, icone: "usuario", semCliente: true, montar: secaoPerfil },
    { id: "usuarios", titulo: "Usuários e convites", desc: "Quem entra e com qual papel", grupo: "Equipe", papelMin: "admin", icone: "convidar", montar: secaoUsuarios },
    // plano 2000d · DU-394/DU-395/DU-422: endereço, telefone e Instagram para as mensagens, fuso e prazo de guarda (aparece quando o shell
    // lista «empresa» em CONFIG_PRONTAS — o servidor precisa de nx_empresa_dados/nx_empresa_dados_salvar)
    { id: "empresa", titulo: "Dados da empresa", desc: "Endereço, telefone, Instagram e fuso horário", grupo: "Equipe", papelMin: "admin", icone: "empresa", montar: secaoEmpresa },
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
    // plano 2000d · FX-052: Esc limpa a busca (com ela vazia, o Esc segue para quem mais ouvir)
    if (ev.key === "Escape" && campoBusca.value) { ev.preventDefault(); campoBusca.value = ""; campoBusca.dispatchEvent(new Event("input")); return; }
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
      if (haCamadaAberta(document)) return;      // plano 2000d · DU-174: com diálogo/gaveta aberto o «/» é dele
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
    // plano 2000d · FX-019 / DR-333: sem conta não há chave (a antiga «nx-onb:<cliente>:-» não é mais lida — o Início também não lê)
    const chOnb = chaveOnboardingCfg(ctx.cliente.id, ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id);
    if (chOnb) try { pulados = (JSON.parse(localStorage.getItem(chOnb) || "{}").pulados) || []; } catch { /* sem storage */ }
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
  // plano 2000d · DU-396: «Alterações recentes» nas configurações (nx_auditoria_listar; servidor sem a função → o cartão nem aparece)
  sec.append(cartaoAuditoria(ctx, { tipo: "config", titulo: "Alterações recentes", sub: "Quem mudou o quê nas configurações, mais recente primeiro.", limite: 20 }));
  return pendenciasDoHub(ctx).then(p => {
    if (!pend.isConnected) return;
    ui.limpar(pend);
    // plano 2000d · DU-171: o total do checklist no topo («6 de 9 prontos»)
    const prog = progressoChecklist(p, vistas.map(s => s.id));
    if (prog.total) pend.append(h("div", { class: "cfg-vg-prog" }, ui.barraUso(`${prog.feitos} de ${prog.total} ${prog.total === 1 ? "pronto" : "prontos"}`, prog.feitos, prog.total)));
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
    // plano 2000d · DU-179: cita a revenda (quem cuida do plano), não «a equipe» genérica
    const textoMotivo = textoMotivoSecao(motivo, ctx.sessao && ctx.sessao.org ? ctx.sessao.org.nome : null);
    // plano 2000d · FX-100: endereço que não existe (link velho, digitado) sugere a seção mais parecida que a pessoa VÊ
    const parecida = pedida && motivo === "inexistente" ? secaoParecida(vistas, pedida) : null;
    sec.appendChild(ui.vazio({ titulo: pedida ? "Esta seção não está disponível." : "Nada para configurar por aqui.",
      texto: parecida ? `${textoMotivo} Você quis dizer «${parecida.titulo}»?` : textoMotivo, icone: "engrenagem",
      acao: parecida ? { rotulo: `Abrir ${parecida.titulo}`, fn: () => ctx.navegar(`#/config/${parecida.id}`) }
        : pedida ? { rotulo: "Ver as configurações", fn: () => ctx.navegar("#/config") } : null }));
    return;
  }
  ctx.titulo(tituloSecao(atual));      // plano 1000 · AS-275: «Departamentos e horários · Configurações»
  const voltar = h("a", { class: "voltar-link cfg-voltar", href: "#/config" }, ui.icone("seta-esq"), "Configurações");
  const alvo = h("div", { class: "pilha" });
  sec.append(voltar, alvo);
  if (pedida && typeof ui.anunciar === "function") ui.anunciar(`${atual.titulo} aberta.`);
  try {
    const r = await atual.montar(ctx, alvo);
    // plano 2000d · DU-172: ?campo=<nome> rola até o ajuste e o foca (a busca leva ao campo, não só à seção)
    const campoQ = ctx.rota && ctx.rota.query && ctx.rota.query.campo;
    if (campoQ && /^[\w-]{1,40}$/.test(campoQ)) {
      const el = alvo.querySelector(`[name="${campoQ}"], #${campoQ}`);
      if (el) try { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); } catch { /* ok */ }
    }
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
  // plano 2000d · DU-129: «Como assinar as mensagens» (só com o servidor que guarda — a conta já vem com «assinatura»)
  const temAssinatura = Object.hasOwn(c, "assinatura");
  const formDados = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome", nome: "nome", valor: c.nome, obrigatorio: true, autocomplete: "name", max: 80 }),
      // plano 1000 · AS-086: máscara e validação de telefone como no resto do app (antes «1299» só era recusado pelo servidor)
      ui.campo({ rotulo: "Celular (WhatsApp)", nome: "telefone", tipo: "tel", validar: "telefone", valor: c.telefone ? ui.telBR(c.telefone) : "", autocomplete: "tel",
        // plano 1000b · UB-196/UB-197: ajudas que dizem para que serve o celular e onde se troca o e-mail
        ajuda: "Opcional. Para avisos do sistema a você; clientes não veem." }),
      // plano 1500c · UCB-111 / plano 2000d · DU-144: quem troca o e-mail (outro administrador, quando existe e o servidor permite)
      ui.campo({ rotulo: "E-mail", nome: "email_ro", valor: c.email, desabilitado: true, ajuda: ajudaEmailPerfil({ gestor: c.papel === "gestor" || !!c.super }) }),
      temAssinatura ? ui.campo({ rotulo: "Como assinar as mensagens", nome: "assinatura", valor: c.assinatura || "", max: 60, autocomplete: "off", placeholder: "— Ana, recepção",
        ajuda: "Vai no fim das mensagens que você envia quando a empresa liga a assinatura por pessoa." }) : null),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Salvar dados")));
  // DU-144: o administrador sabe se outro administrador pode trocar o e-mail dele (a lista de Usuários já fica em cache)
  if (!c.super && c.papel !== "gestor" && ctx.cliente && typeof ctx.pode === "function" && ctx.pode("admin")) {
    Promise.resolve().then(() => api.rpcC("nx_usuarios_listar")).then(dd => {
      const outros = ((dd && dd.usuarios) || []).filter(u => u && !u.gestor && u.papel === "admin" && !u.eu && u.email !== c.email).length;
      const aj = formDados.querySelector("[data-campo=email_ro] .campo-ajuda");
      if (aj) aj.textContent = ajudaEmailPerfil({ trocarEmail: dd && dd.trocar_email === true, outrosAdmins: outros });
    }).catch(() => { /* fica a ajuda padrão */ });
  }
  // plano 2000d · FX-012: número fixo não recebe WhatsApp — avisa enquanto digita (não impede salvar)
  const inpTel = formDados.querySelector("input[name=telefone]");
  const avisoFixo = h("small", { class: "campo-ajuda cfg-tel-fixo", role: "status", hidden: true }, "Parece um telefone fixo: os avisos pelo WhatsApp precisam de um celular.");
  if (inpTel && inpTel.closest("[data-campo]")) inpTel.closest("[data-campo]").appendChild(avisoFixo);
  const pintarFixo = () => { avisoFixo.hidden = !(inpTel && inpTel.value && pareceFixo(inpTel.value)); };
  if (inpTel) { inpTel.addEventListener("input", pintarFixo); pintarFixo(); }
  // plano 2000d · FX-010: como a assinatura sai numa mensagem, ao vivo
  const inpAss = formDados.querySelector("[name=assinatura]");
  const previaAss = h("p", { class: "cv-previa cfg-ass-previa", "aria-live": "polite", hidden: true });
  if (inpAss && inpAss.closest("[data-campo]")) inpAss.closest("[data-campo]").appendChild(previaAss);
  const pintarAss = () => { const t = previaAssinatura(inpAss && inpAss.value); previaAss.textContent = t; previaAss.hidden = !t; };
  if (inpAss) { inpAss.addEventListener("input", pintarAss); pintarAss(); }
  // plano 2000d · DU-397: sair do Perfil com o nome/celular mexido e não salvo pergunta antes
  const estadoDados = () => { try { return JSON.stringify(ui.lerForm(formDados)); } catch { return ""; } };
  let dadosSalvos = estadoDados();
  formDados.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(formDados, null);
    // plano 2000d · FX-011: sem mudança, não chama o servidor (e diz por quê)
    if (estadoDados() === dadosSalvos) { ui.toast("Nada para salvar: os seus dados estão iguais aos salvos.", { tipo: "info" }); return; }
    const d = ui.lerForm(formDados);
    // plano 1500c · UCB-112: a mesma frase do servidor (com o limite) · plano 2000d · FX-009: espaços dobrados saem
    const nomeLimpo = limparNome(d.nome);
    if (nomeLimpo.length < 2 || nomeLimpo.length > 80) return ui.marcarErro(formDados, "nome", "Informe o seu nome (2 a 80 letras).");
    if (d.telefone && !telefoneValido(d.telefone)) return ui.marcarErro(formDados, "telefone", "Use DDD + número, ex.: (12) 99830-3030.");
    if (d.telefone && !dddValido(d.telefone)) return ui.marcarErro(formDados, "telefone", "Esse DDD não existe. Confira os dois primeiros números.");      // FX-102
    try {
      // plano 1500c · UCB-113: o celular vai só com dígitos (55 + DDD + número), como nos outros pontos
      const dadosPerfil = { nome: nomeLimpo, telefone: normalizarTelefone(d.telefone) };
      if (temAssinatura) dadosPerfil.assinatura = String(d.assinatura || "").trim() || null;      // DU-129
      await ui.carregando(formDados.querySelector("[type=submit]"), api.rpc("nx_perfil_salvar", { p_dados: dadosPerfil }));
      dadosSalvos = estadoDados();
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
  // plano 2000d · FX-008: a repetição é conferida enquanto digita (antes só no «Trocar senha»)
  const inpNova2 = formSenha.querySelector("[name=nova2]");
  const confere = h("small", { class: "campo-ajuda cfg-senha-confere", "aria-live": "polite" });
  if (inpNova2 && inpNova2.closest("[data-campo]")) inpNova2.closest("[data-campo]").appendChild(confere);
  const pintarConfere = () => {
    const r = conferirRepeticao((formSenha.querySelector("[name=nova]") || {}).value, inpNova2 && inpNova2.value);
    confere.textContent = r.texto; confere.dataset.ok = r.ok === null ? "" : String(r.ok);
  };
  for (const n of ["nova", "nova2"]) { const el = formSenha.querySelector(`[name=${n}]`); if (el) el.addEventListener("input", pintarConfere); }
  formSenha.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(formSenha, null);
    const d = ui.lerForm(formSenha);
    if (!d.atual) return ui.marcarErro(formSenha, "atual", "Informe a senha atual.");
    if (!d.nova || d.nova.length < 8) return ui.marcarErro(formSenha, "nova", "A senha precisa ter pelo menos 8 caracteres.");
    // plano 1000b · UB-084: trocar pela mesma senha não protege nada (e encerraria as outras sessões à toa)
    if (d.nova === d.atual) return ui.marcarErro(formSenha, "nova", "Use uma senha diferente da atual.");
    if (d.nova !== d.nova2) return ui.marcarErro(formSenha, "nova2", "As duas senhas não são iguais.");
    // plano 2000d · FX-007 / UCB-044: a mesma régua de senha fácil do convite (e-mail, nome, empresa e produto) — sem o login.js, segue
    try {
      const L = await import(`./login.js?v=${encodeURIComponent(ctx.versao)}`);
      if (typeof L.senhaFraca === "function" && L.senhaFraca(d.nova, { email: c.email, nome: c.nome, empresa: ctx.cliente ? ctx.cliente.nome : "",
        produto: (() => { try { return ctx.shell.marcaEfetiva().produto; } catch { return ""; } })() })) return ui.marcarErro(formSenha, "nova", L.FRASE_SENHA_FRACA || "Essa senha é fácil de adivinhar.");
    } catch { /* sem a régua: o servidor ainda confere o tamanho */ }
    try {
      const rs = await ui.carregando(formSenha.querySelector("[type=submit]"), api.rpc("nx_senha_trocar", { p_atual: d.atual, p_nova: d.nova }));
      formSenha.reset();
      // plano 1500c · UCB-114: só promete o que a resposta confirma (o nx_senha_trocar antigo não encerra as outras sessões)
      const n = rs && Number.isFinite(Number(rs.sessoes_encerradas)) ? Number(rs.sessoes_encerradas) : null;
      ui.toast(n === null ? "Senha trocada. Entre de novo nos outros aparelhos." : n === 0 ? "Senha trocada. Não havia outras sessões abertas."
        : `Senha trocada. ${n} ${n === 1 ? "outra sessão encerrada" : "outras sessões encerradas"}.`, { tipo: "ok" });
    } catch (e) {
      // plano 2000d · DU-178: com o hint «restam:N», avisa quantas tentativas faltam antes do bloqueio (a régua do login)
      if (e.codigo === "credenciais_invalidas") return ui.marcarErro(formSenha, "atual", fraseSenhaAtualErrada(e.hint));
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });

  const btTodas = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("sair"), "Sair de todos os aparelhos");
  btTodas.addEventListener("click", async () => {
    // plano 1000 · AS-091: desconecta todo mundo da conta — confirmação com destaque de perigo
    // plano 2000d · FX-086: com a lista de sessões carregada, a confirmação diz quantos outros aparelhos saem
    const outrosN = Number(sessoesEl.dataset.outros);
    const ok = await ui.confirmar({ titulo: "Sair de todos os aparelhos?", perigo: true, rotulo: "Sair de todos",
      texto: Number.isFinite(outrosN) && sessoesEl.dataset.outros !== undefined && sessoesEl.dataset.outros !== ""
        ? `Este aparelho e ${outrosN === 0 ? "nenhum outro" : outrosN === 1 ? "mais 1 aparelho" : `mais ${outrosN} aparelhos`} vão precisar entrar de novo.`
        : "Você e qualquer outro aparelho conectado com a sua conta vão precisar entrar de novo, inclusive este." });
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
  // plano 2000d · FX-002: «Ficar ausente» mora no cartão de avisos (é sobre receber conversas) — o «Ficar ausente» do menu da conta cai nele
  const ausente = blocoAusente(ctx);
  const avisos = blocoAvisos(ctx, { ausente });
  const seguranca = blocoSeguranca(ctx);
  // plano 2000d · DU-177: índice no topo (Dados · Avisos · Senha · Sessões) — no celular o Perfil é uma rolagem longa
  const ancoras = [["cfg-pf-dados", "Dados"], avisos ? ["cfg-pf-avisos", "Avisos"] : null, ["cfg-pf-seguranca", "Segurança"], ["cfg-pf-senha", "Senha"], ["cfg-pf-sessoes", "Sessões"]].filter(Boolean);
  const irPara = id => { const el = alvo.querySelector(`#${id}`); if (!el || el.hidden) return false; try { el.scrollIntoView({ block: "start" }); el.focus({ preventScroll: true }); } catch { /* ok */ } return true; };
  const indice = h("nav", { class: "cfg-pf-indice linha", "aria-label": "Partes do perfil" }, ancoras.map(([id, rot]) => {
    const a = h("a", { href: `#${id}`, class: "bt bt-fant bt-p" }, rot);
    a.addEventListener("click", ev => { if (irPara(id)) ev.preventDefault(); });
    return a;
  }));
  if (avisos) { avisos.id = "cfg-pf-avisos"; avisos.setAttribute("tabindex", "-1"); }
  // plano 2000d · FX-014 / FX-086: a lista de sessões diz quantas há (título) e guarda quantos outros aparelhos (confirmação do «Sair de todos»)
  const sessoesEl = listaSessoes(ctx);
  const titSessoes = h("h2", null, "Sessões em outros aparelhos");
  sessoesEl.aoContar = n => { titSessoes.textContent = n > 0 ? `Sessões em outros aparelhos (${n})` : "Sessões em outros aparelhos"; };
  alvo.append(
    indice,
    h("div", { class: "cartao", id: "cfg-pf-dados", tabindex: "-1" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Seus dados"),
      h("p", { class: "sub cfg-papel" }, papel.frase),
      papel.outras.length ? h("p", { class: "fraco cfg-papel-outras" }, `Também tem acesso a: ${papel.outras.join(" · ")}.`) : null)),
      ...[blocoFoto(ctx), avisos ? null : ausente, formDados, blocoCelularVerificado(ctx)].filter(Boolean)),
    ...[avisos].filter(Boolean),
    seguranca,
    h("div", { class: "cartao", id: "cfg-pf-senha", tabindex: "-1" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Senha"),
      h("p", { class: "sub" }, "Ao trocar, as sessões abertas em outros aparelhos são encerradas."))), formSenha),
    blocoAparelho(ctx),
    h("div", { class: "cartao", id: "cfg-pf-sessoes", tabindex: "-1" }, h("div", { class: "cartao-cab" }, h("div", null, titSessoes,
      // plano 1000b · UB-087: o título não promete uma lista de aparelhos que a tela não tem
      h("p", { class: "sub" }, "Esqueceu a conta aberta num computador da recepção? Encerre todas as sessões de uma vez, inclusive esta."))), sessoesEl, btTodas));
  // plano 2000d · FX-001 / DU-128: ?secao=avisos (o «Ficar ausente» do menu da conta), ?secao=senha… rola e foca a parte pedida
  const q = (ctx.rota && ctx.rota.query) || {};
  const parte = parteDoPerfil(q.secao);
  if (parte && parte !== "cfg-pf-seguranca") irPara(parte);
  // plano 2000d · FX-006 / DU-119: ?ativar2fa=1 (o aviso de «a empresa exige») abre direto o passo de ligar
  if (String(q.ativar2fa || "").split("#")[0] === "1" || parte === "cfg-pf-seguranca") seguranca.aoCarregar = est => {
    irPara("cfg-pf-seguranca");
    const b = !est.ativo ? seguranca.querySelector(".cfg-2fa-ligar") : null;
    if (b) try { b.focus(); } catch { /* ok */ }
  };
  // DU-397: alteração não salva nos dados → pergunta antes de sair
  return {
    pendente: () => formDados.isConnected && estadoDados() !== dadosSalvos,
    podeSair: async () => estadoDados() === dadosSalvos || ui.confirmar({ titulo: "Sair sem salvar os seus dados?", rotulo: "Sair sem salvar", perigo: true,
      texto: "O nome, o celular ou a assinatura mudaram e ainda não foram salvos." }),
  };
}

/** plano 2000d · DU-127: foto de perfil (reduzida a 256 px, como o logo) — só com o servidor que guarda (a conta já vem com «foto»). */
function blocoFoto(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const c = ctx.sessao.conta;
  if (!Object.hasOwn(c, "foto")) return null;
  const amostra = h("span", { class: "cfg-foto-amostra" });
  const pintar = () => { ui.limpar(amostra); amostra.append(ui.avatar(c.nome, c.id, c.foto || null, { tamanho: "g" })); };
  const arquivo = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
  const btEnviar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("clipe"), c.foto ? "Trocar foto" : "Enviar foto");
  const btTirar = h("button", { type: "button", class: "bt bt-fant bt-p", hidden: !c.foto }, ui.icone("lixeira"), "Tirar foto");
  const erro = h("small", { class: "campo-erro", role: "alert", hidden: true });
  const salvar = async (foto, botao) => {
    erro.hidden = true;
    try {
      await ui.carregando(botao, api.rpc("nx_perfil_salvar", { p_dados: { nome: c.nome, telefone: c.telefone || "", foto } }));
      c.foto = foto; pintar(); btTirar.hidden = !foto;
      ui.toast(foto ? "Foto salva." : "Foto tirada.", { tipo: "ok" });
      try { await ctx.shell.recarregarSessao(); } catch { /* aparece na próxima leitura */ }
    } catch (e) { erro.textContent = api.mensagemErro(e); erro.hidden = false; }
  };
  btEnviar.addEventListener("click", () => arquivo.click());
  arquivo.addEventListener("change", async () => {
    const f = arquivo.files && arquivo.files[0];
    arquivo.value = "";
    if (!f) return;
    // plano 2000d · FX-087 / FX-088: HEIC, SVG ou arquivo enorme dizem o que fazer antes de tentar decodificar
    const errArq = erroArquivoImagem(f);
    if (errArq) { erro.textContent = errArq; erro.hidden = false; return; }
    try { const r = await processarImagem(f, { W: 256, H: 256, quadrado: true }); await salvar(r.url, btEnviar); }
    catch (e) { erro.textContent = textoErroImagem(e); erro.hidden = false; }
  });
  // plano 2000d · FX-113: «Tirar foto» com «Desfazer» (a foto antiga volta sem precisar achar o arquivo)
  btTirar.addEventListener("click", async () => {
    const antes = c.foto;
    await salvar(null, btTirar);
    if (antes && !c.foto) ui.toast("Foto tirada.", { tipo: "ok", acao: { rotulo: "Desfazer", fn: () => salvar(antes, btEnviar) } });
  });
  pintar();
  return h("div", { class: "linha cfg-foto" }, amostra, h("div", { class: "pilha-p" }, h("b", null, "Foto"), h("small", { class: "fraco" }, "Aparece para a equipe no lugar das iniciais."),
    h("div", { class: "linha" }, btEnviar, btTirar), erro), arquivo);
}

/** plano 2000d · DU-128: «Ficar ausente» tira a pessoa do rodízio por 1 h ou até amanhã (servidor com ausente_ate na conta). */
function blocoAusente(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const c = ctx.sessao.conta;
  if (!Object.hasOwn(c, "ausente_ate") || !ctx.cliente) return null;
  const caixa = h("div", { class: "linha cfg-ausente", role: "group", "aria-label": "Ficar ausente" });
  const pintar = () => {
    ui.limpar(caixa);
    const ate = ausenteAte(c);
    if (ate) {
      const voltar = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Voltar agora");
      voltar.addEventListener("click", () => mudar(null, voltar));
      caixa.append(ui.pilula(`Ausente até ${ui.dataHoraBR(ate)}`, "aten"), voltar);
      return;
    }
    const b1 = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("relogio"), "Ficar ausente por 1 h");
    const b2 = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Ausente até amanhã");
    b1.addEventListener("click", () => mudar(fimAusencia("1h"), b1));
    b2.addEventListener("click", () => mudar(fimAusencia("amanha"), b2));
    caixa.append(b1, b2, h("small", { class: "fraco" }, "Enquanto ausente, você não recebe conversas novas do rodízio."));
  };
  const mudar = async (ate, botao) => {
    try {
      await ui.carregando(botao, api.rpc("nx_ausencia_salvar", { p_ate: ate }));
      c.ausente_ate = ate; pintar();
      ui.toast(ate ? "Você está ausente: conversas novas vão para os colegas." : "De volta ao rodízio.", { tipo: "ok" });
    } catch (e) { ui.toast(semFuncaoRpc(e) ? "Este servidor ainda não tem o «ausente»." : api.mensagemErro(e), { tipo: "erro" }); }
  };
  pintar();
  return caixa;
}

/** plano 2000d · DU-143: «Verificar celular» manda um código e marca o número como verificado (conta com «celular_verificado»). */
function blocoCelularVerificado(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const c = ctx.sessao.conta;
  if (!Object.hasOwn(c, "celular_verificado") || !c.telefone) return null;
  const caixa = h("div", { class: "linha cfg-cel-verif" });
  const pintar = () => {
    ui.limpar(caixa);
    if (c.celular_verificado === true) { caixa.append(ui.pilula("Celular verificado", "ok", { icone: "check" })); return; }
    const b = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("whatsapp"), "Verificar celular");
    b.addEventListener("click", async () => {
      try { await ui.carregando(b, api.rpc("nx_celular_verificar_iniciar", {})); }
      catch (e) { ui.toast(semFuncaoRpc(e) ? "Este servidor ainda não verifica o celular." : api.mensagemErro(e), { tipo: "erro" }); return; }
      const fm = h("form", { class: "pilha", novalidate: true }, h("p", null, `Mandamos um código de 6 dígitos para ${ui.telBR(c.telefone)} pelo WhatsApp.`),
        ui.campo({ rotulo: "Código", nome: "codigo", inputmode: "numeric", autocomplete: "one-time-code", max: 6 }));
      const ok = await ui.modal({ titulo: "Verificar celular", corpo: fm, largura: "p", acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Verificar", tipo: "primario", fn: async () => {
        ui.marcarErro(fm, null);
        const cod = limparCodigo(ui.lerForm(fm).codigo);      // plano 2000d · FX-017
        if (!codigoValido(cod)) { ui.marcarErro(fm, "codigo", "Digite os 6 números do código."); return false; }
        try { await api.rpc("nx_celular_verificar_confirmar", { p_codigo: cod }); return true; }
        catch (e) { if (e && e.codigo === "codigo_invalido") { ui.marcarErro(fm, "codigo", "Código errado ou vencido."); return false; } throw e; }
      } }] });
      if (ok) { c.celular_verificado = true; pintar(); ui.toast("Celular verificado.", { tipo: "ok" }); }
    });
    caixa.append(ui.pilula("Celular não verificado", "aten"), b);
  };
  pintar();
  return caixa;
}

/**
 * plano 2000d · DU-132/DU-137: «Verificação em duas etapas» (nx_2fa_estado/iniciar/confirmar/desligar) e o aviso de entrada em aparelho novo.
 * Servidor sem as funções → o cartão some (a tela não promete o que o servidor não faz).
 */
function blocoSeguranca(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const corpo = h("div", { class: "pilha" });
  const cartao = h("div", { class: "cartao cfg-seguranca", id: "cfg-pf-seguranca", tabindex: "-1", hidden: true },
    h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Verificação em duas etapas"),
      h("p", { class: "sub" }, "Além da senha, um código do celular ou de um app autenticador na hora de entrar."))), corpo);
  let est = null;
  const pintar = () => {
    ui.limpar(corpo);
    if (est.ativo) {
      const desligar = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Desligar");
      desligar.addEventListener("click", async () => {
        if (est.exigido) { ui.toast("A empresa exige a verificação em duas etapas: ela não pode ser desligada.", { tipo: "info" }); return; }
        if (!(await ui.confirmar({ titulo: "Desligar a verificação em duas etapas?", perigo: true, rotulo: "Desligar", texto: "Sua conta volta a pedir só a senha." }))) return;
        try { await ui.carregando(desligar, api.rpc("nx_2fa_desligar", {})); est.ativo = false; pintar(); ui.toast("Verificação em duas etapas desligada.", { tipo: "ok" }); }
        catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      });
      corpo.append(h("p", { class: "linha" }, ui.pilula(`Ligada · ${est.metodo === "totp" ? "app autenticador" : "WhatsApp"}`, "ok", { icone: "check" }), est.exigido ? null : desligar));
    } else {
      const bWa = h("button", { type: "button", class: "bt bt-prim bt-p cfg-2fa-ligar" }, ui.icone("whatsapp"), "Ligar com o WhatsApp");
      const bApp = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("cadeado"), "Ligar com app autenticador");
      bWa.addEventListener("click", () => ativar("whatsapp", bWa));
      bApp.addEventListener("click", () => ativar("totp", bApp));
      corpo.append(...[est.exigido ? h("p", { class: "aviso aviso-aten" }, ui.icone("alerta"), h("span", null, "A empresa exige a verificação em duas etapas. Ligue agora para continuar entrando.")) : null,
        h("div", { class: "linha" }, bWa, bApp)].filter(Boolean));
    }
    // DU-137: aviso quando a conta entra num aparelho novo (só com o servidor que guarda a preferência)
    if (typeof est.avisar_nova_sessao === "boolean") {
      const sw = ui.campo({ tipo: "interruptor", nome: "avisar_nova_sessao", rotulo: "Avisar quando a conta entrar num aparelho novo", valor: est.avisar_nova_sessao,
        ajuda: "Chega no sino e no WhatsApp do seu perfil, com o botão para encerrar a sessão se não foi você." });
      const inp = sw.querySelector("input");
      inp.addEventListener("change", async () => {
        try { await api.rpc("nx_2fa_preferencias_salvar", { p_avisar_nova_sessao: inp.checked }); est.avisar_nova_sessao = inp.checked; ui.toast(inp.checked ? "Aviso de aparelho novo ligado." : "Aviso de aparelho novo desligado.", { tipo: "ok" }); }
        catch (e) { inp.checked = !inp.checked; ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      });
      corpo.append(sw);
    }
  };
  async function ativar(metodo, botao) {
    let ini;
    try { ini = await ui.carregando(botao, api.rpc("nx_2fa_iniciar", { p_metodo: metodo })); }
    catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); return; }
    ini = ini || {};
    const fm = h("form", { class: "pilha", novalidate: true },
      metodo === "totp"
        ? h("div", { class: "pilha-p" }, h("p", null, "No app autenticador (Google Authenticator, Microsoft Authenticator…), adicione uma conta pela chave abaixo e digite o código que aparecer."),
          // plano 2000d · FX-016: a chave em grupos de 4 (digitar 32 letras seguidas no celular errava fácil); copiar leva sem espaços
          ini.segredo ? h("p", { class: "linha" }, h("span", { class: "mono cfg-2fa-segredo" }, agruparSegredo(ini.segredo)),
            h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => ui.copiar(String(ini.segredo).replace(/\s+/g, ""), { aviso: "Chave copiada." }) } }, ui.icone("copiar"), "Copiar chave")) : null,
          ini.otpauth ? h("a", { href: String(ini.otpauth).startsWith("otpauth://") ? ini.otpauth : "#", class: "bt bt-fant bt-p" }, "Abrir no app deste aparelho") : null)
        : h("p", null, "Mandamos um código de 6 dígitos para o celular do seu perfil pelo WhatsApp."),
      ui.campo({ rotulo: "Código", nome: "codigo", inputmode: "numeric", autocomplete: "one-time-code", max: 6 }));
    const r = await ui.modal({ titulo: "Ligar a verificação em duas etapas", corpo: fm, largura: "m", acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Confirmar", tipo: "primario", fn: async () => {
      ui.marcarErro(fm, null);
      const cod = limparCodigo(ui.lerForm(fm).codigo);      // plano 2000d · FX-017
      if (!codigoValido(cod)) { ui.marcarErro(fm, "codigo", "Digite os 6 números do código."); return false; }
      try { return (await api.rpc("nx_2fa_confirmar", { p_codigo: cod })) || {}; }
      catch (e) { if (e && e.codigo === "codigo_invalido") { ui.marcarErro(fm, "codigo", "Código errado ou vencido."); return false; } throw e; }
    } }] });
    if (!r) return;
    est.ativo = true; est.metodo = metodo; pintar();
    const cods = Array.isArray(r.codigos_recuperacao) ? r.codigos_recuperacao : [];
    if (cods.length) {
      const txt = cods.join("\n");
      await ui.modal({ titulo: "Guarde os códigos de recuperação", largura: "m", corpo: h("div", { class: "pilha" },
        h("p", null, "Cada código vale uma vez, para entrar se você perder o celular. Guarde num lugar seguro: eles não aparecem de novo."),
        h("pre", { class: "mono cfg-2fa-cods" }, txt), h("div", { class: "linha" }, h("button", { type: "button", class: "bt bt-sec", on: { click: () => ui.copiar(txt, { aviso: "Códigos copiados." }) } }, ui.icone("copiar"), "Copiar os códigos"),
          // plano 2000d · FX-015: baixar como arquivo .txt (guardar fora do celular que pode se perder)
          h("button", { type: "button", class: "bt bt-fant cfg-2fa-baixar", on: { click: () => {
            const prod = (() => { try { return ctx.shell.marcaEfetiva().produto; } catch { return ""; } })();
            const ok = baixarTexto(textoCodigosRecuperacao({ produto: prod, email: ctx.sessao.conta.email, codigos: cods, data: ui.hojeSP() }), `codigos-recuperacao-${nomeArquivo(prod || "conta")}.txt`, "text/plain");
            ui.toast(ok ? "Códigos baixados. Guarde o arquivo num lugar seguro." : "O navegador não deixou baixar o arquivo.", { tipo: ok ? "ok" : "erro" });
          } } }, ui.icone("baixar"), "Baixar (.txt)"))),
        acoes: [{ rotulo: "Já guardei", tipo: "primario", valor: true }] });
    }
    ui.toast("Verificação em duas etapas ligada. O próximo login pede o código.", { tipo: "ok" });
  }
  Promise.resolve().then(() => api.rpc("nx_2fa_estado", {})).then(r => {
    if (!r || typeof r !== "object" || typeof r.ativo !== "boolean") return;
    est = r; cartao.hidden = false; pintar();
    // plano 2000d · FX-006 / DU-119: quem abriu com ?ativar2fa=1 cai direto no passo de ligar
    if (typeof cartao.aoCarregar === "function") try { cartao.aoCarregar(est); } catch { /* ok */ }
  }).catch(() => { /* servidor sem 2 etapas: o cartão fica escondido */ });
  return cartao;
}

/** plano 2000d · DU-113/DU-396: «Histórico de acessos» / «Alterações recentes» (nx_auditoria_listar); sem a função ou com erro, some. */
export function cartaoAuditoria(ctx, { tipo = "equipe", titulo = "Histórico de acessos", sub = "", limite = 50 } = {}) {
  const { ui, api } = ctx;
  const h = ui.h;
  const lista = h("ul", { class: "cfg-audit-lista" });
  const cartao = h("details", { class: "cartao cfg-audit", hidden: true }, h("summary", null, h("b", null, titulo), sub ? h("small", { class: "fraco" }, ` · ${sub}`) : null), lista);
  cartao.pronto = Promise.resolve().then(() => api.rpcC ? api.rpcC("nx_auditoria_listar", { p_tipo: tipo, p_limite: limite }) : api.rpc("nx_auditoria_listar", { p_tipo: tipo, p_limite: limite })).then(evs => {
    if (!Array.isArray(evs)) return false;
    ui.limpar(lista);
    if (!evs.length) lista.append(h("li", { class: "fraco" }, "Nada registrado ainda."));
    for (const ev of evs.slice(0, limite)) lista.append(h("li", { class: "linha linha-entre" }, h("span", null, textoEventoAuditoria(ev)),
      ev.em ? h("small", { class: "fraco", title: ui.dataHoraBR(ev.em) }, ui.relativo(ev.em)) : null));
    // plano 2000d · FX-092: o histórico em CSV (pedido de auditoria / LGPD)
    if (evs.length && !cartao.querySelector(".cfg-audit-csv")) cartao.append(h("div", { class: "linha linha-fim" }, h("button", { type: "button", class: "bt bt-fant bt-p cfg-audit-csv", on: { click: () => {
      const ok = baixarTexto(csvAuditoria(evs.slice(0, limite)), `historico-${tipo}-${ui.hojeSP()}.csv`, "text/csv");
      ui.toast(ok ? "Histórico baixado." : "O navegador não deixou baixar o arquivo.", { tipo: ok ? "ok" : "erro" });
    } } }, ui.icone("baixar"), "Baixar histórico (CSV)")));
    cartao.hidden = false;
    return true;
  }).catch(() => { cartao.hidden = true; return false; });
  return cartao;
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
    // plano 2000d · FX-013: este aparelho primeiro, depois o uso mais recente
    const l = ordenarSessoes((Array.isArray(lista) ? lista : []).filter(s => s && s.id != null));
    // plano 2000d · FX-014 / FX-086: quantos OUTROS aparelhos (o título e o «Sair de todos» usam)
    const outros = l.filter(s => !s.atual).length;
    caixa.dataset.outros = String(outros);
    if (typeof caixa.aoContar === "function") try { caixa.aoContar(outros); } catch { /* ok */ }
    if (!l.length) { caixa.hidden = true; return; }
    caixa.hidden = false;
    caixa.append(h("ul", { class: "cfg-sessoes-lista" }, l.map(s => {
      const b = s.atual ? null : h("button", { type: "button", class: "bt bt-fant bt-p" }, "Encerrar");
      if (b) b.addEventListener("click", async () => {
        // plano 2000d · DU-139: encerrar pede confirmação com o aparelho e o último uso (antes agia no primeiro toque)
        const quando = s.ultimo_uso ? `usado ${ui.relativo(s.ultimo_uso)}` : s.criado_em ? `aberto em ${ui.dataBR(s.criado_em)}` : "";
        if (!(await ui.confirmar({ titulo: `Encerrar a sessão ${rotuloSessao(s)}?`, rotulo: "Encerrar", perigo: true,
          texto: `${quando ? `${quando[0].toUpperCase()}${quando.slice(1)}. ` : ""}Quem estiver usando esse aparelho precisa entrar de novo.` }))) return;
        try {
          await ui.carregando(b, api.rpc("nx_sessao_encerrar", { p_id: s.id }));
          ui.toast("Sessão encerrada.", { tipo: "ok" });
          desenhar(l.filter(x => x !== s));
          const prox = caixa.querySelector("button");
          try { (prox || caixa.closest(".cartao") || caixa).focus(); } catch { /* ok */ }
        } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      });
      // plano 2000d · DU-138: sistema e cidade aproximada (quando o servidor manda) e a deste aparelho em destaque
      return h("li", { class: ["linha", "linha-entre", "cfg-sessao", s.atual && "cfg-sessao-atual"] },
        h("span", null, h("b", null, rotuloSessao(s)), s.atual ? ui.pilula("Este aparelho", "info") : null,
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
  const rot = p => rotuloPapel(p);      // plano 2000d · DU-435: o rótulo do papel num lugar só
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
function blocoAvisos(ctx, { ausente = null } = {}) {
  const { ui } = ctx;
  const h = ui.h;
  if (!ctx.cliente || (typeof ctx.temModulo === "function" && !ctx.temModulo("conversas"))) return null;
  // plano 2000d · DU-142: por pessoa (chave com a conta, migrando a antiga) — no computador da recepção cada atendente tem o seu som
  const conta = ctx.sessao && ctx.sessao.conta ? ctx.sessao.conta.id : null;
  const armaz = (() => { try { return localStorage; } catch { return null; } })();
  const ler = () => lerAvisos(armaz, conta);
  const gravar = mud => gravarAvisos(armaz, conta, mud);
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
  // plano 2000d · FX-118: «Testar o som» toca o aviso aqui (confere o volume antes de precisar)
  const btSom = h("button", { type: "button", class: "bt bt-fant bt-p cfg-av-testar" }, ui.icone("play"), "Testar o som");
  btSom.addEventListener("click", () => { if (!tocarAvisoTeste()) ui.toast("Este navegador não tocou o som. Confira o volume e se o site pode tocar áudio.", { tipo: "info" }); });
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
  // plano 2000d · FX-018: o navegador já bloqueou os avisos → a explicação aparece ao abrir (antes só depois de tentar ligar)
  try { if (typeof Notification !== "undefined" && Notification.permission === "denied") nota.textContent = "O navegador está bloqueando os avisos deste site. Para ligar, libere em Configurações do site (cadeado ao lado do endereço)."; } catch { /* ok */ }
  // plano 2000d · FX-003 / FX-004 / DU-268: horário silencioso (de/até) — o app.js já lê silencio {de, ate} e o pulso decide
  const sil = p.silencio && typeof p.silencio === "object" ? p.silencio : null;
  const formSil = h("form", { class: "pilha-p cfg-silencio", novalidate: true },
    h("p", { class: "rotulo" }, "Horário silencioso"),
    h("div", { class: "form-grade" }, ui.campo({ rotulo: "Sem som a partir de", nome: "sil_de", tipo: "hora", valor: (sil && sil.de) || "" }),
      ui.campo({ rotulo: "até", nome: "sil_ate", tipo: "hora", valor: (sil && sil.ate) || "" })));
  const frase = h("small", { class: "fraco cfg-silencio-frase", "aria-live": "polite" }, rotuloSilencio(sil));
  const btSil = h("button", { type: "submit", class: "bt bt-sec bt-p" }, "Salvar horário");
  const btTirar = h("button", { type: "button", class: "bt bt-fant bt-p", hidden: !sil }, "Sem horário silencioso");
  formSil.append(frase, h("div", { class: "linha" }, btSil, btTirar));
  const aplicarSil = (novo, aviso) => {
    if (!gravar({ silencio: novo })) { ui.toast("Este navegador não deixou guardar a preferência.", { tipo: "erro" }); return; }
    frase.textContent = rotuloSilencio(novo); btTirar.hidden = !novo;
    ui.toast(aviso, { tipo: "ok" });
  };
  formSil.addEventListener("submit", ev => {
    ev.preventDefault();
    ui.marcarErro(formSil, null);
    const d = ui.lerForm(formSil);
    if (!silencioValido(d.sil_de, d.sil_ate)) { ui.marcarErro(formSil, "sil_ate", "Preencha os dois horários (diferentes) ou deixe os dois vazios."); return; }
    const novo = d.sil_de && d.sil_ate ? { de: d.sil_de, ate: d.sil_ate } : null;
    aplicarSil(novo, novo ? rotuloSilencio(novo) : "Horário silencioso desligado.");
  });
  btTirar.addEventListener("click", () => {
    for (const n of ["sil_de", "sil_ate"]) { const el = formSil.querySelector(`[name=${n}]`); if (el) el.value = ""; }
    aplicarSil(null, "Horário silencioso desligado.");
  });
  return h("div", { class: "cartao cfg-avisos" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, ausente ? "Avisos e disponibilidade" : "Avisos de mensagem nova"),
    h("p", { class: "sub" }, "Valem neste aparelho e são os mesmos do menu «Avisos» de Conversas."))), ...[ausente, som, h("div", { class: "linha" }, btSom), tela, nota, formSil].filter(Boolean));
}

/** plano 2000d · FX-118: um toque curto (o mesmo timbre do aviso de mensagem) — true quando o navegador tocou. */
export function tocarAvisoTeste(AC = typeof AudioContext !== "undefined" ? AudioContext : (typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null)) {
  if (!AC) return false;
  try {
    const a = new AC(), t0 = a.currentTime;
    for (const [freq, atraso] of [[880, 0], [1320, 0.16]]) {
      const osc = a.createOscillator(), g = a.createGain();
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + atraso);
      g.gain.exponentialRampToValueAtTime(0.07, t0 + atraso + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + atraso + 0.38);
      osc.connect(g); g.connect(a.destination);
      osc.start(t0 + atraso); osc.stop(t0 + atraso + 0.42);
    }
    setTimeout(() => { try { a.close(); } catch { /* ok */ } }, 1200);
    return true;
  } catch { return false; }
}

/** plano 2000d · FX-005 / DU-408: «Neste aparelho» — abrir o app instalado na última tela (padrão) ou sempre no Início. */
function blocoAparelho(ctx) {
  const { ui } = ctx;
  const h = ui.h;
  const armaz = (() => { try { return localStorage; } catch { return null; } })();
  if (!armaz) return null;
  const sw = ui.campo({ tipo: "interruptor", nome: "abrir_ultima", rotulo: "Abrir o app na última tela usada", valor: lerAbrirUltima(armaz),
    ajuda: "Vale para o app instalado no celular ou no computador. Desligado, ele sempre abre no Início." });
  const inp = sw.querySelector("input");
  if (inp) inp.addEventListener("change", () => {
    if (!gravarAbrirUltima(armaz, inp.checked)) { inp.checked = !inp.checked; ui.toast("Este navegador não deixou guardar a preferência.", { tipo: "erro" }); return; }
    ui.toast(inp.checked ? "O app abre na última tela usada." : "O app abre sempre no Início.", { tipo: "ok" });
  });
  return h("div", { class: "cartao cfg-aparelho", id: "cfg-pf-aparelho", tabindex: "-1" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Neste aparelho"))), sw);
}

/* ============================================================
   plano 2000d · DU-394/DU-395/DU-422: DADOS DA EMPRESA
   (nx_empresa_dados / nx_empresa_dados_salvar; servidor sem as funções → a seção diz que ainda não está disponível)
   ============================================================ */
async function secaoEmpresa(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  alvo.append(ui.esqueleto("cartoes", 1));
  let d;
  try { d = (await api.rpcC("nx_empresa_dados", {})) || {}; }
  catch (e) {
    ui.limpar(alvo);
    if (semFuncaoRpc(e)) { alvo.append(ui.vazio({ titulo: "Ainda não disponível.", texto: "Os dados da empresa chegam com a próxima atualização do sistema.", icone: "empresa" })); return; }
    alvo.append(ui.erroCartao(e, () => { ui.limpar(alvo); secaoEmpresa(ctx, alvo); }));
    return;
  }
  ui.limpar(alvo);
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Endereço", nome: "endereco", valor: d.endereco || "", max: 200, autocomplete: "street-address", ajuda: "Vira {endereco} nas mensagens e automações." }),
      ui.campo({ rotulo: "Telefone da empresa", nome: "telefone_empresa", tipo: "tel", validar: "telefone", valor: d.telefone_empresa ? ui.telBR(d.telefone_empresa) : "", ajuda: "Vira {telefone_empresa}." }),
      ui.campo({ rotulo: "Instagram", nome: "instagram", valor: d.instagram || "", max: 31, placeholder: "@suaempresa", autocomplete: "off", ajuda: "Vira {instagram}." }),
      ui.campo({ rotulo: "Fuso horário", nome: "fuso", tipo: "select", valor: d.fuso || "America/Sao_Paulo", opcoes: FUSOS_BR.map(([valor, rotulo]) => ({ valor, rotulo })),
        ajuda: "Lembretes, automações e o horário de funcionamento seguem este fuso." }),
      ui.campo({ rotulo: "Guardar as conversas por", nome: "retencao_meses", tipo: "select", valor: d.retencao_meses ? String(d.retencao_meses) : "", opcoes: PRAZOS_GUARDA.map(([valor, rotulo]) => ({ valor, rotulo })),
        ajuda: "Passado o prazo, as conversas mais antigas são apagadas sozinhas (com aviso 30 dias antes). Contatos e negócios ficam." }),
      // plano 2000d · DU-036 / FX-021: o link de avaliação no Google (vira {link_avaliacao} nas mensagens de pós-atendimento)
      ui.campo({ rotulo: "Link de avaliação (Google)", nome: "link_avaliacao", tipo: "url", valor: d.link_avaliacao || "", autocomplete: "off", placeholder: "https://g.page/r/…/review",
        ajuda: "Vira {link_avaliacao}: as automações de pós-atendimento pedem a avaliação por ele." }),
      // plano 2000d · DU-095 / FX-020: quanto tempo cada mensagem automática poupa (o «tempo poupado» das automações)
      ui.campo({ rotulo: "Minutos por mensagem", nome: "minutos_por_mensagem", inputmode: "decimal", valor: d.minutos_por_mensagem != null ? String(d.minutos_por_mensagem).replace(".", ",") : "", placeholder: "2",
        ajuda: "Quanto tempo a equipe levaria para escrever cada mensagem que o sistema manda sozinho (0,5 a 30). Usado no «tempo poupado»." }),
      // plano 2000d · DU-072 / FX-022: os feriados da cidade/empresa (o «Respeitar horário» das automações não envia neles)
      ui.campo({ rotulo: "Feriados da empresa", nome: "feriados", tipo: "textarea", linhas: 2, valor: feriadosEmTexto(d.feriados), placeholder: "20/01, 23/04, 08/12",
        ajuda: "Separados por vírgula: 25/12 (todo ano) ou 20/01/2027 (só nesse ano). Automações com «respeitar horário» não enviam nesses dias." })),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Salvar dados da empresa")));
  // DU-395: a prévia de uma frase com as variáveis já trocadas
  const previa = h("p", { class: "cv-previa cfg-empresa-previa", "aria-live": "polite" });
  // plano 2000d · FX-093 / FX-094: «Ver no mapa» do endereço e «Testar» o link de avaliação (abrem numa aba nova)
  const mapa = h("a", { class: "bt bt-fant bt-p cfg-empresa-mapa", target: "_blank", rel: "noopener noreferrer", hidden: true }, ui.icone("externo"), "Ver no mapa");
  const testarAval = h("a", { class: "bt bt-fant bt-p cfg-empresa-aval", target: "_blank", rel: "noopener noreferrer", hidden: true }, ui.icone("externo"), "Testar o link de avaliação");
  // plano 2000d · FX-112: conferir o Instagram digitado
  const abrirInsta = h("a", { class: "bt bt-fant bt-p cfg-empresa-insta", target: "_blank", rel: "noopener noreferrer", hidden: true }, ui.icone("externo"), "Abrir o Instagram");
  // plano 2000d · FX-027: o fuso da empresa com outra hora que este aparelho avisa (lembretes saem pela hora da empresa)
  const avisoFuso = h("p", { class: "aviso aviso-info cfg-empresa-fuso", role: "status", hidden: true });
  const fusoAparelho = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
  const pintarPrevia = () => {
    const x = ui.lerForm(form);
    previa.textContent = trocarVariaveisEmpresa("Estamos na {endereco}. Ligue {telefone_empresa} ou veja {instagram}. Avalie: {link_avaliacao}", x);
    const lm = linkMapa(x.endereco); mapa.hidden = !lm; if (lm) mapa.setAttribute("href", lm);
    const li = x.instagram ? linkInstagram(x.instagram) : null; abrirInsta.hidden = !li; if (li) abrirInsta.setAttribute("href", li);
    const la = completarHttps(x.link_avaliacao); const okA = !!la && linkHttpsValido(la); testarAval.hidden = !okA; if (okA) testarAval.setAttribute("href", la);
    const dif = fusoDifere(x.fuso, fusoAparelho);
    avisoFuso.hidden = !dif;
    if (dif) avisoFuso.textContent = "Este aparelho está em outro fuso: lembretes e automações seguem a hora da empresa, não a deste aparelho.";
  };
  form.addEventListener("input", pintarPrevia); form.addEventListener("change", pintarPrevia); pintarPrevia();
  // plano 2000d · FX-026: as variáveis à mão — um toque copia
  const chips = h("div", { class: "linha cfg-empresa-vars", role: "group", "aria-label": "Copiar variável" }, VARIAVEIS_EMPRESA.map(v =>
    h("button", { type: "button", class: "bt bt-fant bt-p mono", "aria-label": `Copiar ${v}`, on: { click: () => ui.copiar(v, { aviso: `${v} copiado.` }) } }, v)));
  const estado = () => { try { return JSON.stringify(ui.lerForm(form)); } catch { return ""; } };
  let salvo = estado();
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const x = ui.lerForm(form);
    const erros = validarDadosEmpresa(x);
    if (erros.length) { for (const e of erros) ui.marcarErro(form, e.campo, e.texto); return; }
    // plano 2000d · FX-024 / FX-025: Instagram pelo link do perfil e 0800/4004 sem o 55
    const p = { endereco: String(x.endereco || "").trim() || null, telefone_empresa: normalizarTelefoneEmpresa(x.telefone_empresa) || null,
      instagram: normalizarInstagram(x.instagram) || null, fuso: x.fuso || "America/Sao_Paulo", retencao_meses: x.retencao_meses ? Number(x.retencao_meses) : null };
    // plano 2000d · FX-020/FX-021/FX-022: os campos novos só vão quando preenchidos (ou quando o servidor já os tinha)
    const minutos = lerMinutos(x.minutos_por_mensagem);
    if (minutos !== null || Object.hasOwn(d, "minutos_por_mensagem")) p.minutos_por_mensagem = minutos;
    const aval = completarHttps(x.link_avaliacao);
    if (aval || Object.hasOwn(d, "link_avaliacao")) p.link_avaliacao = aval || null;
    const fer = separarFeriados(x.feriados).lista;
    if (fer.length || Object.hasOwn(d, "feriados")) p.feriados = fer;
    // plano 2000d · FX-119: só pergunta quando o prazo ENCURTA (guardar por mais tempo não apaga nada)
    if (prazoEncurta(d.retencao_meses, p.retencao_meses) && !(await ui.confirmar({ titulo: `Guardar as conversas por ${p.retencao_meses} meses?`, perigo: true, rotulo: "Usar este prazo",
      texto: "As conversas mais antigas que o prazo serão apagadas de vez (com aviso 30 dias antes). Isso não pode ser desfeito." }))) return;
    const bt = form.querySelector("[type=submit]");
    try {
      let r, tiradas = [];
      try { r = await ui.carregando(bt, api.rpcC("nx_empresa_dados_salvar", { p_dados: p })); }
      catch (e) {
        // plano 2000d · FX-023: o servidor de hoje recusa os campos novos — salva o resto e diz o que ficou de fora
        const novas = CHAVES_EMPRESA_NOVAS.filter(k => k in p);
        if (!novas.length || !(e && /dados_invalidos|chave_invalida/.test(String(e.codigo || "")))) throw e;
        const resto = { ...p };
        for (const k of novas) delete resto[k];
        tiradas = novas;
        r = await ui.carregando(bt, api.rpcC("nx_empresa_dados_salvar", { p_dados: resto }));
      }
      d = r || p; salvo = estado();
      ui.toast(tiradas.length ? `Dados salvos, mas este servidor ainda não guarda: ${tiradas.map(k => ROTULO_CHAVE_EMPRESA[k]).join(", ")}.` : "Dados da empresa salvos.", { tipo: tiradas.length ? "info" : "ok" });
    }
    catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  });
  alvo.append(h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Dados da empresa"),
    h("p", { class: "sub" }, "Usados nas mensagens, na IA e nas automações — escreva uma vez só."))), avisoFuso, form,
    h("div", { class: "linha" }, mapa, abrirInsta, testarAval),
    h("p", { class: "rotulo" }, "Como fica numa mensagem"), previa, chips));
  return {
    pendente: () => form.isConnected && estado() !== salvo,
    podeSair: async () => estado() === salvo || ui.confirmar({ titulo: "Sair sem salvar os dados da empresa?", rotulo: "Sair sem salvar", perigo: true, texto: "As mudanças ainda não foram salvas." }),
  };
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
const ROT_PAPEL = Object.fromEntries(PAPEIS_EMPRESA.map(p => [p.valor, rotuloPapel(p.valor)]));      // plano 2000d · DU-435

/** plano 2000d · DU-149: com o domínio ativo da revenda/empresa (dados.dominio_ativo, quando o servidor manda), o link sai com ele. */
function linkCompleto(ctx, link, dominio = null) {
  if (dominio && String(link || "").startsWith("#")) return linkComDominio(link, dominio);
  return String(link || "").startsWith("#") ? ctx.linkPublico(link) : link;
}

async function secaoUsuarios(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  let dados = null;
  let abriuConvite = false;      // plano 2000d · FX-028
  const pint = { convites: () => {}, uso: () => {} };      // plano 1500c · UCB-017: o desenho vivo da lista de convites e do uso

  async function carregar() {
    ui.limpar(alvo);
    alvo.appendChild(ui.esqueleto("tabela", 4));
    try {
      dados = await api.rpcC("nx_usuarios_listar");
      desenhar();
      // plano 2000d · FX-028 / UC-028: #/config/usuarios?convidar=1 (o atalho do Início e do checklist) já abre o convite — uma vez, com vaga
      const q = (ctx.rota && ctx.rota.query) || {};
      if (!abriuConvite && String(q.convidar || "").split("#")[0] === "1") {
        abriuConvite = true;
        const cheio = !!dados.limite && dados.uso >= dados.limite;
        if (cheio) ui.toast("O plano não tem vagas de usuário agora: revogue um convite ou remova alguém para convidar.", { tipo: "info" });
        else abrirConvite();
      }
    } catch (e) {
      ui.limpar(alvo);
      alvo.appendChild(ui.erroCartao(e, carregar));
    }
  }

  // plano 1000b · UB-088: o termo da busca de pessoas sobrevive ao redesenho (salvar um interruptor não apaga o filtro)
  let termoUs = "";
  let soNunca = false;          // plano 1500c · UCB-033: chip «Nunca entraram»
  let papelFiltro = "", soSem2 = false;      // plano 2000d · DU-130 / DU-118
  let soInativos = false;                    // plano 2000d · FX-042
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
      const lista = h("div", { class: "flut-lista" });
      // plano 2000d · FX-049: «3 de 8 marcados» ao vivo (com a busca, os marcados fora da vista também contam)
      const contagem = h("small", { class: "fraco cfg-deps-n", "aria-live": "polite" });
      const pintarN = () => { contagem.textContent = sel.size ? `${sel.size} de ${deps.length} marcados` : "Nenhum marcado = todos"; };
      // plano 2000d · DU-116: com mais de 6 departamentos, busca e «Todos/Nenhum» (a pilha de caixas não cabia nem se achava)
      const pintarLista = (termo = "") => {
        ui.limpar(lista);
        const vis = filtrarDepartamentos(deps, termo);
        lista.append(...vis.map(d => h("label", { class: "flut-op" },
          h("input", { type: "checkbox", checked: sel.has(d.id), value: d.id, on: { change: ev => { ev.target.checked ? sel.add(d.id) : sel.delete(d.id); pintarN(); } } }),
          ui.etiqueta({ nome: d.nome, cor: d.cor }))));
        if (!vis.length) lista.append(h("p", { class: "fraco" }, "Nenhum departamento com esse nome."));
        pintarN();
      };
      pintarLista();
      const muitos = deps.length > 6;
      const busca = muitos ? h("input", { type: "search", class: "cfg-deps-busca", placeholder: "Buscar departamento", "aria-label": "Buscar departamento", autocomplete: "off" }) : null;
      if (busca) busca.addEventListener("input", () => pintarLista(busca.value));
      const marcarTodos = on => { for (const d of filtrarDepartamentos(deps, busca ? busca.value : "")) on ? sel.add(d.id) : sel.delete(d.id); pintarLista(busca ? busca.value : ""); };
      const bTodos = muitos ? h("button", { type: "button", class: "bt bt-fant bt-p cfg-deps-todos", on: { click: () => marcarTodos(true) } }, "Todos") : null;
      const bNenhum = muitos ? h("button", { type: "button", class: "bt bt-fant bt-p cfg-deps-nenhum", on: { click: () => marcarTodos(false) } }, "Nenhum") : null;
      const ok = h("button", { type: "button", class: "bt bt-prim bt-p" }, "Aplicar");
      const f = ui.flutuante(b, h("div", { class: "pilha-p" }, ...[h("p", { class: "rotulo" }, "Departamentos"),
        contagem, busca, muitos ? h("div", { class: "linha" }, bTodos, bNenhum) : null, lista, ok].filter(Boolean)), { largura: 260 });
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
    inp.addEventListener("change", async () => {
      // plano 1000b · UB-089: travado até a resposta — dois toques rápidos não geram duas chamadas fora de ordem
      if (inp.getAttribute("aria-busy") === "true") return;
      // plano 2000d · DU-117: desligar o último que recebe conversas deixa a fila sem ninguém — pergunta antes
      if (chave === "recebe_conversas" && !inp.checked && ultimoNoRodizio(dados.usuarios, u.conta_id)) {
        inp.setAttribute("aria-busy", "true");
        const ok = await ui.confirmar({ titulo: "Ninguém mais vai receber conversas novas", rotulo: "Tirar do rodízio", perigo: true,
          texto: `${u.nome} é a única pessoa no rodízio. Sem ninguém nele, as conversas novas ficam na fila até alguém pegar.` });
        inp.removeAttribute("aria-busy");
        if (!ok) { inp.checked = true; try { inp.focus(); } catch { /* ok */ } return; }
      }
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
    const com2Etapas = informa2Etapas(us);      // plano 2000d · DU-118
    // plano 2000d · FX-039: quantas estão com o app aberto agora
    const online = contarOnline(us);
    const textoUso = () => `${lim ? `${dados.uso} de ${lim} usuários do plano (convites pendentes contam).` : `${us.length} ${us.length === 1 ? "pessoa" : "pessoas"} com acesso.`}${online ? ` ${online} online agora.` : ""}`;
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
        // plano 2000d · DU-127: a foto da pessoa (quando o servidor manda) no lugar das iniciais
        { chave: "nome", rotulo: "Pessoa", ordenavel: true, principal: true, render: u => h("div", { class: "cel-nome" }, ui.avatar(u.nome, u.conta_id, u.foto || null),
          h("div", null, h("b", null, u.nome, u.eu ? " (você)" : ""),
            // plano 1000 · AS-273: quem está com o app aberto agora (acesso nos últimos 5 min)
            estaOnline(u.ultimo_acesso) ? h("span", { class: "cfg-online" }, h("i", { "aria-hidden": "true" }), "online") : null,
            h("small", null, u.email),
            // plano 2000d · DU-111 / DU-128 / DU-114: acesso pausado, ausente (fora do rodízio) e horário de acesso
            acessoPausado(u) ? ui.pilula(`Acesso pausado até ${ui.dataBR(u.pausado_ate)}`, "aten", { class: "cfg-us-pausado" }) : null,
            // plano 2000d · FX-031 / SC-004: acesso suspenso (servidor que manda «suspenso») e FX-041: sem entrar há 30+ dias (vaga parada)
            u.suspenso === true ? ui.pilula("Acesso suspenso", "ruim", { class: "cfg-us-suspenso" }) : null,
            !u.gestor && !u.eu && (diasSemEntrar(u) ?? -1) >= 30 ? h("small", { class: "fraco cfg-us-inativo" }, `sem entrar há ${diasSemEntrar(u)} dias`) : null,
            ausenteAte(u) ? ui.pilula(`Ausente até ${ui.dataHoraBR(u.ausente_ate)}`, "neutra", { class: "cfg-us-ausente" }) : null,
            rotuloHorarioAcesso(u) ? h("small", { class: "fraco cfg-us-horario" }, rotuloHorarioAcesso(u)) : null)) },
        colPapel,
        // plano 2000d · DU-118: quem já ligou a verificação em duas etapas (só quando o servidor informa)
        ...(com2Etapas ? [{ chave: "dois_fatores", rotulo: "2 etapas", render: u => u.gestor ? h("span", { class: "fraco" }, "—")
          : u.dois_fatores === true ? ui.pilula("Sim", "ok", { icone: "check", class: "cfg-2fa-sim" }) : ui.pilula("Não", "aten", { class: "cfg-2fa-nao" }) }] : []),
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
            // plano 2000d · FX-109: o e-mail da pessoa à mão (o celular corta o texto da tabela)
            u.email ? { rotulo: "Copiar e-mail", icone: "copiar", fn: () => ui.copiar(u.email, { aviso: "E-mail copiado." }) } : null,
            // plano 1500c · UCB-036: tornar dono (só com o servidor que conhece o dono)
            comDono && u.dono !== true ? { rotulo: "Tornar dono", icone: "chave", fn: () => tornarDono(u) } : null,
            // plano 2000d · DU-114: horário de acesso por pessoa (servidor que anuncia dados.horario_acesso)
            dados.horario_acesso === true && !u.eu ? { rotulo: "Horário de acesso", icone: "relogio", fn: () => horarioAcesso(u) } : null,
            // plano 2000d · DU-111: pausar (férias) sem remover — servidor que anuncia dados.pausar_acesso
            dados.pausar_acesso === true && !u.eu ? (acessoPausado(u) ? { rotulo: "Liberar o acesso agora", icone: "play", fn: () => pausarAcesso(u, null) }
              : { rotulo: "Pausar acesso até…", icone: "pausa", desabilitado: ultimo, motivo: ultimo ? MOTIVO_ULTIMO_ADMIN : null, fn: () => pausarAcesso(u) }) : null,
            // plano 2000d · FX-031 / SC-004: suspender sem data (o servidor que manda «suspenso» por pessoa tem nx_acesso_suspender)
            typeof u.suspenso === "boolean" && !u.eu ? (u.suspenso ? { rotulo: "Reativar o acesso", icone: "play", fn: () => suspenderAcesso(u, false) }
              : { rotulo: "Suspender acesso", icone: "cadeado", desabilitado: ultimo, motivo: ultimo ? MOTIVO_ULTIMO_ADMIN : null, fn: () => suspenderAcesso(u, true) }) : null,
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
    // plano 2000d · DU-130 / DU-118: filtro por papel e «Sem 2 etapas» (somam ao «Nunca entraram» e à busca)
    const porPapel = contarPorPapel(usVis);
    if (papelFiltro && !porPapel[papelFiltro]) papelFiltro = "";
    const semDois = com2Etapas ? sem2Etapas(usVis) : [];
    if (!semDois.length) soSem2 = false;
    // plano 2000d · FX-042: «Sem entrar há 30+ dias (N)» — vagas do plano paradas
    const parados = inativos(usVis);
    if (!parados.length) soInativos = false;
    const filtrar = () => {
      let base = soNunca ? nuncaEntraram(usVis.filter(u => !u.gestor)) : usVis;
      if (papelFiltro) base = filtrarPorPapel(base, papelFiltro);
      if (soSem2) base = base.filter(u => !u.gestor && u.dois_fatores === false);
      if (soInativos) base = inativos(base);
      return termoUs ? filtrarUsuarios(base, termoUs) : base;
    };
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
      statusUs.textContent = termoUs.trim() || soNunca || papelFiltro || soSem2 || soInativos ? `${vis.length} ${vis.length === 1 ? "pessoa encontrada" : "pessoas encontradas"}.` : "";
    };
    const chipInativos = parados.length ? h("button", { type: "button", class: "bt bt-fant bt-p cfg-us-inativos", "aria-pressed": String(soInativos) }, `Sem entrar há 30+ dias (${parados.length})`) : null;
    if (chipInativos) chipInativos.addEventListener("click", () => { soInativos = !soInativos; chipInativos.setAttribute("aria-pressed", String(soInativos)); repintarTabela(); });
    // plano 2000d · FX-091: os e-mails de quem está na lista (com os filtros) — para mandar um comunicado
    const btEmails = h("button", { type: "button", class: "bt bt-fant bt-p cfg-us-emails" }, ui.icone("copiar"), "Copiar e-mails");
    btEmails.addEventListener("click", () => {
      const t = emailsDe(filtrar());
      if (!t) { ui.toast("Ninguém na lista com e-mail.", { tipo: "info" }); return; }
      ui.copiar(t, { aviso: `${t.split(", ").length} e-mails copiados.` });
    });
    if (buscaUs) buscaUs.addEventListener("input", ui.debounce(() => { termoUs = buscaUs.value; repintarTabela(); }, 150));
    // plano 1500c · UCB-033: «Nunca entraram (N)» filtra quem ainda não usou o sistema
    const chipNunca = nunca.length ? h("button", { type: "button", class: "bt bt-fant bt-p cfg-us-nunca", "aria-pressed": String(soNunca) }, `Nunca entraram (${nunca.length})`) : null;
    if (chipNunca) chipNunca.addEventListener("click", () => { soNunca = !soNunca; chipNunca.setAttribute("aria-pressed", String(soNunca)); repintarTabela(); });
    // plano 2000d · DU-130: chips por papel com a contagem (só com 2 papéis ou mais na equipe)
    const papeisPresentes = PAPEIS_EMPRESA.filter(p => porPapel[p.valor]);
    const chipsPapel = papeisPresentes.length > 1 ? papeisPresentes.map(p => {
      const b = h("button", { type: "button", class: "bt bt-fant bt-p cfg-us-papel-chip", "aria-pressed": String(papelFiltro === p.valor), dataset: { papel: p.valor } }, `${p.rotulo} (${porPapel[p.valor]})`);
      b.addEventListener("click", () => {
        papelFiltro = papelFiltro === p.valor ? "" : p.valor;
        for (const x of b.parentNode ? b.parentNode.querySelectorAll(".cfg-us-papel-chip") : [b]) x.setAttribute("aria-pressed", String(x.dataset.papel === papelFiltro));
        repintarTabela();
      });
      return b;
    }) : [];
    // plano 2000d · DU-118: «Sem 2 etapas (N)»
    const chipSem2 = semDois.length ? h("button", { type: "button", class: "bt bt-fant bt-p cfg-us-sem2", "aria-pressed": String(soSem2) }, `Sem 2 etapas (${semDois.length})`) : null;
    if (chipSem2) chipSem2.addEventListener("click", () => { soSem2 = !soSem2; chipSem2.setAttribute("aria-pressed", String(soSem2)); repintarTabela(); });
    // plano 2000d · DU-131: a lista da equipe em CSV (auditoria de LGPD: quem tem acesso)
    const btCsv = h("button", { type: "button", class: "bt bt-fant bt-p cfg-us-csv" }, ui.icone("baixar"), "Baixar lista (CSV)");
    btCsv.addEventListener("click", () => {
      // plano 2000d · FX-038: o nome do arquivo sem traço sobrando nem acento
      const ok = baixarTexto(csvEquipe(us, dados.departamentos || []), `equipe-${nomeArquivo(ctx.cliente && ctx.cliente.nome)}-${ui.hojeSP()}.csv`, "text/csv");
      ui.toast(ok ? "Lista da equipe baixada." : "O navegador não deixou baixar o arquivo.", { tipo: ok ? "ok" : "erro" });
    });
    // plano 1500c · UCB-032: o que cada papel pode fazer, recolhido acima da tabela (o seletor aponta para cá)
    const ajudaPapeis = h("details", { class: "cfg-papeis" }, h("summary", null, "O que cada papel pode fazer"),
      h("dl", { class: "cfg-papeis-lista", id: ID_PAPEIS }, PAPEIS_EMPRESA.flatMap(p => [h("dt", null, p.rotulo), h("dd", null, p.ajuda)])));
    // plano 2000d · DU-115: empresa sem departamentos vê o caminho para criar (Conversas no plano)
    const semDeps = !(dados.departamentos || []).length && (typeof ctx.temModulo !== "function" || ctx.temModulo("conversas"));
    const linkDeps = semDeps ? h("p", { class: "fraco cfg-us-sem-deps" }, "Sem departamentos: todo mundo vê todas as filas. ", h("a", { href: "#/config/departamentos" }, "Criar departamentos")) : null;

    // plano 1000b · UB-092: revogar tira só o item da lista de convites — a tabela de usuários não some nem pisca com o esqueleto
    const caixaConv = h("div", { class: "cfg-conv-lista" });
    const titConv = h("h2", { tabindex: "-1" }, "Convites pendentes");
    // plano 2000d · FX-040: o título diz quantos aguardam
    const pintarConvites = () => {
      ui.limpar(caixaConv); caixaConv.append(listaDeConvites());
      const n = (dados.convites || []).filter(c => c && !c.vencido).length;
      titConv.textContent = n ? `Convites pendentes (${n})` : "Convites pendentes";
    };
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
          // plano 2000d · DU-123: sem nome nem e-mail, o papel e quando foi criado («Atendente · criado há 1 dia»)
          h("div", { class: "linha cfg-conv-tit" }, h("b", null, rotuloConvite(cv)),
            ui.pilula(ROT_PAPEL[cv.papel] || cv.papel || "Papel", cv.papel === "admin" ? "prim" : "neutra", { class: "cfg-conv-papel" }),
            // plano 1500c · UCB-028: menos de 24 h para vencer → em destaque
            logo ? ui.pilula("vence hoje", "aten", { class: "cfg-conv-vence" }) : null),
          h("small", null, [cv.email && cv.nome ? cv.email : null, Array.isArray(cv.departamentos) ? (depsCv.length ? `Departamentos: ${depsCv.join(", ")}` : "Todos os departamentos") : null,
            cv.vencido ? `venceu ${ui.relativo(cv.expira_em)} sem uso` : `vence ${ui.relativo(cv.expira_em)}`,
            // plano 2000d · DU-121: o convite enviado pelo sistema diz se o e-mail saiu (e se foi aberto)
            cv.email_aberto_em ? "e-mail aberto" : cv.email_enviado_em ? "e-mail enviado" : null].filter(Boolean).join(" · "))),
        h("div", { class: "linha cfg-conv-acoes" }, cv.vencido || logo ? bNovo : null, cv.vencido ? null : b));
    };
    const listaDeConvites = () => {
      const todos = dados.convites || [];
      // plano 2000d · FX-033: o que vence primeiro no topo
      const ativos = ordenarConvites(todos.filter(c => !c.vencido)), vencidos = todos.filter(c => c.vencido);
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
        linkDeps,
        ajudaPapeis,
        h("div", { class: "linha cfg-us-filtros" }, ...[buscaUs ? h("label", { class: "busca cfg-us-busca" }, ui.icone("busca"), buscaUs) : null, chipNunca, ...chipsPapel, chipSem2, chipInativos,
          h("span", { class: "marca-espaco" }), btEmails, btCsv].filter(Boolean)),
        statusUs,
        caixaTab),
      h("div", { class: "cartao cfg-conv-cartao" },
        h("div", { class: "cartao-cab" }, h("div", null, titConv,
          h("p", { class: "sub" }, "Links gerados que ainda não foram usados. Quem abrir cria a conta; se já usar o sistema, entra com a senha atual."))),
        caixaConv),
      ...[cartaoLinkEquipe(), cartaoPoliticas(), cartaoMatriz(), cartaoAuditoria(ctx, { tipo: "equipe", titulo: "Histórico de acessos", sub: "convites, papéis e remoções (últimos 50)" })].filter(Boolean));
  }

  /** plano 2000d · DU-119: «Exigir verificação em duas etapas» para a empresa (servidor que manda dados.exigir_2fa). */
  function cartaoPoliticas() {
    if (typeof dados.exigir_2fa !== "boolean") return null;
    const sw = ui.campo({ tipo: "interruptor", nome: "exigir_2fa", rotulo: "Exigir verificação em duas etapas de toda a equipe", valor: dados.exigir_2fa,
      ajuda: "Quem ainda não ligou é levado a ligar no próximo login (no Perfil). Recomendado para dados de saúde." });
    const inp = sw.querySelector("input");
    inp.addEventListener("change", async () => {
      const ligar = inp.checked;
      if (ligar && !(await ui.confirmar({ titulo: "Exigir duas etapas de todos?", rotulo: "Exigir", texto: `${sem2Etapas(dados.usuarios).length || "Quem"} ainda sem a verificação vai precisar ligar no próximo login.` }))) { inp.checked = false; return; }
      try { await api.rpcC("nx_empresa_politica_salvar", { p_exigir_2fa: ligar }); dados.exigir_2fa = ligar; ui.toast(ligar ? "Duas etapas exigidas da equipe." : "Duas etapas agora são opcionais.", { tipo: "ok" }); }
      catch (e) { inp.checked = !ligar; ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    return h("div", { class: "cartao cfg-politicas" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Segurança da equipe"))), sw);
  }

  /** plano 2000d · DU-109: a matriz de permissões por papel (servidor que manda dados.permissoes). */
  function cartaoMatriz() {
    if (!dados.permissoes || typeof dados.permissoes !== "object") return null;
    const mat = matrizPermissoes(dados.permissoes);
    const papeis = PAPEIS_EMPRESA.map(p => p.valor);
    const tab = h("table", { class: "cfg-perm-tab" }, h("caption", { class: "sr-only" }, "O que cada papel pode fazer"),
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Permissão"), papeis.map(p => h("th", { scope: "col" }, rotuloPapel(p))))),
      h("tbody", null, PERMISSOES.map(pm => h("tr", null, h("th", { scope: "row" }, pm.rotulo), papeis.map(p => {
        const fixo = p === "admin" || (p === "leitura" && (pm.id === "excluir" || pm.id === "automacoes"));
        return h("td", null, h("input", { type: "checkbox", checked: mat[p][pm.id], disabled: fixo, dataset: { papel: p, perm: pm.id }, "aria-label": `${pm.rotulo} — ${rotuloPapel(p)}` }));
      })))));
    const bt = h("button", { type: "button", class: "bt bt-prim bt-p" }, "Salvar permissões");
    const lerTela = () => { const nova = matrizPermissoes({}); for (const cb of tab.querySelectorAll("input[type=checkbox]")) nova[cb.dataset.papel][cb.dataset.perm] = !!cb.checked; return matrizPermissoes(nova); };
    // plano 2000d · FX-046: «Salvar» só vale com mudança (aria-disabled: o Tab ainda alcança e o clique diz o porquê)
    const pintarBt = () => bt.setAttribute("aria-disabled", String(permissoesIguais(lerTela(), dados.permissoes)));
    tab.addEventListener("change", pintarBt);
    bt.addEventListener("click", async () => {
      if (bt.getAttribute("aria-disabled") === "true") { ui.toast("Nada para salvar: as permissões estão iguais às salvas.", { tipo: "info" }); return; }
      const nova = lerTela();
      try { await ui.carregando(bt, api.rpcC("nx_permissoes_salvar", { p_permissoes: nova })); dados.permissoes = nova; pintarBt(); ui.toast("Permissões salvas. Valem no próximo carregamento de cada pessoa.", { tipo: "ok" }); }
      catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    // plano 2000d · FX-045: voltar à tabela padrão (na tela; só vale ao salvar)
    const padrao = h("button", { type: "button", class: "bt bt-fant bt-p cfg-perm-padrao" }, "Voltar ao padrão");
    padrao.addEventListener("click", () => {
      const p = matrizPermissoes({});
      for (const cb of tab.querySelectorAll("input[type=checkbox]")) cb.checked = !!p[cb.dataset.papel][cb.dataset.perm];
      pintarBt();
      ui.toast("Permissões padrão na tela. Só valem ao salvar.", { tipo: "info" });
    });
    pintarBt();
    return h("details", { class: "cartao cfg-perm" }, h("summary", null, h("b", null, "Permissões por papel"), h("small", { class: "fraco" }, " · exportar, excluir, ver valores, automações e anúncios")),
      h("div", { class: "cfg-perm-rolagem" }, tab), h("div", { class: "linha linha-fim" }, padrao, bt));
  }

  /** plano 2000d · DU-124: link de equipe reutilizável (QR na recepção) — dados.link_equipe (null = o servidor tem, mas não há link). */
  function cartaoLinkEquipe() {
    if (!Object.hasOwn(dados, "link_equipe")) return null;
    const le = dados.link_equipe;
    const corpo = h("div", { class: "pilha-p" });
    if (le && le.link) {
      const desligar = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Desligar o link");
      desligar.addEventListener("click", async () => {
        if (!(await ui.confirmar({ titulo: "Desligar o link de equipe?", perigo: true, rotulo: "Desligar", texto: "Quem abrir o link depois disso não consegue mais pedir acesso." }))) return;
        try { dados = (await ui.carregando(desligar, api.rpcC("nx_link_equipe_salvar", { p_ativo: false }))) || { ...dados, link_equipe: null }; desenhar(); }
        catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      });
      // plano 2000d · FX-044: esgotado ou vencido não fica parecendo que funciona
      const est = estadoLinkEquipe(le);
      // plano 2000d · FX-043: o texto pronto para mandar no grupo da equipe (neutro, com o produto da marca)
      const prod = (() => { try { return ctx.shell.marcaEfetiva().produto; } catch { return ""; } })();
      corpo.append(...[est !== "ativo" ? h("p", { class: "aviso aviso-aten cfg-link-equipe-fim", role: "status" }, ui.icone("alerta"),
        h("span", null, est === "vencido" ? "Este link venceu: quem abrir não consegue mais pedir acesso. Desligue e crie outro." : "Este link já foi usado o número máximo de vezes. Desligue e crie outro para mais pessoas.")) : null,
        ui.blocoLink(linkCompleto(ctx, le.link, dados && dados.dominio_ativo), { rotulo: "Link de equipe", textoWhats: textoLinkEquipe({ cliente: ctx.cliente ? ctx.cliente.nome : "", produto: prod }) }),
        h("p", { class: "fraco" }, [`Entra como ${rotuloPapel(le.papel || "atendente", { minusculo: true })}`, le.limite ? `${le.usos || 0} de ${le.limite} usos` : null, le.expira_em ? `vale até ${ui.dataBR(le.expira_em)}` : null].filter(Boolean).join(" · ")),
        h("div", { class: "linha" }, desligar)].filter(Boolean));
    } else {
      const criar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("link"), "Criar link de equipe");
      criar.addEventListener("click", async () => {
        const fm = h("form", { class: "pilha", novalidate: true },
          ui.campo({ rotulo: "Papel de quem entrar", nome: "papel", tipo: "select", valor: "atendente", opcoes: PAPEIS_EMPRESA.filter(p => p.valor !== "admin").map(p => ({ valor: p.valor, rotulo: p.rotulo })) }),
          ui.campo({ rotulo: "Quantas pessoas podem usar", nome: "limite", tipo: "numero", valor: 5, min: 1, max: 50 }),
          ui.campo({ rotulo: "Vale por", nome: "dias", tipo: "select", valor: "7", opcoes: [["1", "1 dia"], ["7", "7 dias"], ["30", "30 dias"]].map(([valor, rotulo]) => ({ valor, rotulo })) }));
        const r = await ui.modal({ titulo: "Link de equipe", corpo: fm, largura: "p", acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Criar link", tipo: "primario", fn: async () => {
          const d = ui.lerForm(fm);
          const lim = Math.floor(Number(d.limite));
          // plano 2000d · FX-101: não promete mais entradas que as vagas do plano
          const erroLim = erroLimiteLinkEquipe(d.limite, { uso: dados.uso, lim: dados.limite });
          if (erroLim) { ui.marcarErro(fm, "limite", erroLim); return false; }
          return api.rpcC("nx_link_equipe_salvar", { p_ativo: true, p_papel: d.papel, p_limite: lim, p_dias: Number(d.dias) || 7 });
        } }] });
        if (r) { dados = r.usuarios ? r : { ...dados, link_equipe: r }; desenhar(); ui.toast("Link de equipe criado. Cada entrada aparece aqui para você aprovar.", { tipo: "ok" }); }
      });
      corpo.append(h("p", { class: "fraco" }, "Um link só para a recepção (ou um QR impresso): cada pessoa que abrir pede acesso e você aprova aqui."), h("div", { class: "linha" }, criar));
    }
    // as entradas pelo link aguardam aprovação
    const pend = Array.isArray(dados.entradas_pendentes) ? dados.entradas_pendentes : [];
    if (pend.length) corpo.append(h("p", { class: "rotulo" }, "Aguardando aprovação"), h("ul", { class: "cfg-entradas" }, pend.map(x => {
      const ap = h("button", { type: "button", class: "bt bt-prim bt-p" }, "Aprovar"), rc = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Recusar");
      const decidir = (ok, b) => async () => { try { dados = (await ui.carregando(b, api.rpcC("nx_entrada_equipe_decidir", { p_id: x.id, p_aprovar: ok }))) || dados; desenhar(); } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); } };
      ap.addEventListener("click", decidir(true, ap)); rc.addEventListener("click", decidir(false, rc));
      return h("li", { class: "linha linha-entre" }, h("span", null, h("b", null, x.nome || x.email || "Sem nome"), x.email && x.nome ? h("small", { class: "fraco" }, ` · ${x.email}`) : null), h("span", { class: "linha" }, ap, rc));
    })));
    return h("div", { class: "cartao cfg-link-equipe" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Link de equipe"),
      h("p", { class: "sub" }, "Para quem contrata sempre: um link reutilizável, com limite de usos e validade."))), corpo);
  }

  /** plano 2000d · DU-111: pausar o acesso até uma data (bloqueia o login e tira do rodízio; volta sozinho). ate=null libera. */
  async function pausarAcesso(u, ateDado) {
    let ate = ateDado;
    if (ateDado === undefined) {
      const fm = h("form", { class: "pilha", novalidate: true }, ui.campo({ rotulo: "Volta em", nome: "ate", tipo: "data", valor: "", obrigatorio: true,
        ajuda: "Até lá a pessoa não entra e sai do rodízio. Conversas e registros dela ficam. Na data, o acesso volta sozinho." }));
      // plano 2000d · FX-047: atalhos de férias (1 semana, 15 dias, 30 dias) preenchem a data
      fm.append(h("div", { class: "linha cfg-pausa-atalhos", role: "group", "aria-label": "Atalhos de prazo" }, [[7, "1 semana"], [15, "15 dias"], [30, "30 dias"]].map(([n, rot]) =>
        h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { const i = fm.querySelector("[name=ate]"); if (i) { i.value = dataMaisDias(ui.hojeSP(), n); i.dispatchEvent(new Event("input")); } } } }, rot))));
      ate = await ui.modal({ titulo: `Pausar o acesso de ${u.nome}`, corpo: fm, largura: "p", acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Pausar acesso", tipo: "primario", fn: async () => {
        const d = String(ui.lerForm(fm).ate || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d <= ui.hojeSP()) { ui.marcarErro(fm, "ate", "Escolha uma data a partir de amanhã."); return false; }
        return d;
      } }] });
      if (!ate) return;
    }
    return salvar(u.conta_id, { pausado_ate: ate }, { texto: ate ? `Acesso de ${u.nome} pausado até ${ui.dataBR(ate)}.` : `Acesso de ${u.nome} liberado.` });
  }

  /** plano 2000d · FX-031 / SC-004: suspender (sem data) ou reativar — nx_acesso_suspender(p_cliente, p_conta, p_suspenso). */
  async function suspenderAcesso(u, suspenso) {
    if (suspenso && !(await ui.confirmar({ titulo: `Suspender o acesso de ${u.nome}?`, perigo: true, rotulo: "Suspender acesso",
      texto: "A pessoa não entra mais até você reativar e sai do rodízio. Conversas e registros dela ficam, e a vaga do plano continua ocupada." }))) return;
    try {
      const r = await api.rpcC("nx_acesso_suspender", { p_cliente: ctx.cliente.id, p_conta: u.conta_id, p_suspenso: !!suspenso });
      if (r && Array.isArray(r.usuarios)) dados = r;
      else { const x = (dados.usuarios || []).find(y => y.conta_id === u.conta_id); if (x) x.suspenso = !!suspenso; }
      ui.toast(suspenso ? `Acesso de ${u.nome} suspenso.` : `Acesso de ${u.nome} reativado.`, { tipo: "ok" });
      desenhar();
    } catch (e) { ui.toast(semFuncaoRpc(e) ? "Este servidor ainda não suspende acessos." : api.mensagemErro(e), { tipo: "erro" }); }
  }

  /** plano 2000d · DU-114: «Pode entrar de… até…» (vazio = sem limite). */
  async function horarioAcesso(u) {
    const hz = u.horario_acesso || {};
    const fm = h("form", { class: "pilha", novalidate: true }, h("p", { class: "fraco" }, "Fora deste horário o login é recusado com uma mensagem clara. Deixe vazio para não limitar."),
      h("div", { class: "form-grade" }, ui.campo({ rotulo: "Pode entrar de", nome: "de", tipo: "hora", valor: hz.de || "" }), ui.campo({ rotulo: "até", nome: "ate", tipo: "hora", valor: hz.ate || "" })));
    // plano 2000d · FX-048: «Horário comercial» (08:00–18:00) e «Sem limite» de um toque
    const pore = (de, ate) => () => { for (const [n, v] of [["de", de], ["ate", ate]]) { const i = fm.querySelector(`[name=${n}]`); if (i) i.value = v; } };
    fm.append(h("div", { class: "linha cfg-horario-atalhos" }, h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: pore("08:00", "18:00") } }, "Horário comercial"),
      h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: pore("", "") } }, "Sem limite")));
    const r = await ui.modal({ titulo: `Horário de acesso de ${u.nome}`, corpo: fm, largura: "p", acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Salvar horário", tipo: "primario", fn: async () => {
      ui.marcarErro(fm, null);
      const d = ui.lerForm(fm);
      if (!horarioAcessoValido(d.de, d.ate)) { ui.marcarErro(fm, "ate", "Preencha os dois horários (o fim depois do início) ou deixe os dois vazios."); return false; }
      return { valor: d.de && d.ate ? { de: d.de, ate: d.ate } : null };
    } }] });
    if (!r) return;
    return salvar(u.conta_id, { horario_acesso: r.valor }, { texto: r.valor ? `Horário de ${u.nome} salvo.` : `${u.nome} pode entrar a qualquer hora.` });
  }

  /** UCB-110: no celular, «Mudar papel» abre um seletor num modal curto. */
  async function mudarPapelModal(u) {
    // plano 2000d · DU-126: a lista de papéis é a descrição do seletor (aria-describedby) e o papel escolhido fica em destaque
    const idLista = `cfg-papeis-modal-${++_seqAjuda}`;
    const lista = h("dl", { class: "cfg-papeis-lista", id: idLista }, PAPEIS_EMPRESA.flatMap(p => [h("dt", { dataset: { papel: p.valor } }, p.rotulo), h("dd", { dataset: { papel: p.valor } }, p.ajuda)]));
    const form = h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: `Papel de ${u.nome}`, nome: "papel", tipo: "select", valor: u.papel, opcoes: PAPEIS_EMPRESA.map(p => ({ valor: p.valor, rotulo: p.rotulo })) }),
      lista);
    const sel = form.querySelector("select[name=papel]");
    sel.setAttribute("aria-describedby", [...new Set([...(sel.getAttribute("aria-describedby") || "").split(" ").filter(Boolean), idLista])].join(" "));
    const destacar = () => { for (const x of lista.querySelectorAll("dt, dd")) x.classList.toggle("cfg-papel-escolhido", x.dataset.papel === sel.value); };
    sel.addEventListener("change", destacar); destacar();
    const r = await ui.modal({ titulo: "Mudar papel", corpo: form, largura: "p",
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Aplicar", tipo: "primario", fn: async () => ui.lerForm(form).papel }] });
    if (r && r !== u.papel) await trocarPapel(u, r);
  }

  /** UCB-037: nx_usuario_email_trocar(p_conta, p_email) — só aparece quando o servidor anuncia (dados.trocar_email). */
  async function trocarEmail(u) {
    const form = h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: "E-mail novo", nome: "email", tipo: "email", valor: u.email || "", autocomplete: "off", ajuda: "É o login da pessoa. As sessões abertas dela são encerradas." }));
    let avisado = null;      // plano 2000d · FX-050
    const r = await ui.modal({ titulo: `Trocar o e-mail de ${u.nome}`, corpo: form, largura: "p", acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Trocar e-mail", tipo: "primario", fn: async () => {
      ui.marcarErro(form, null);
      const email = normEmail(ui.lerForm(form).email);
      if (!RE_EMAIL.test(email)) { ui.marcarErro(form, "email", "Esse e-mail não parece válido."); return false; }
      if (email === normEmail(u.email)) { ui.marcarErro(form, "email", "É o mesmo e-mail de agora."); return false; }
      // plano 2000d · FX-050: «gmial.com» pergunta uma vez (o segundo toque usa como está)
      const sug = sugestaoEmail(email);
      if (sug && avisado !== email) { avisado = email; ui.marcarErro(form, "email", `Você quis dizer ${sug}? Corrija ou toque de novo para usar como está.`); return false; }
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
      departamentos: pd.departamentos || [], expira_em: r && r.expira_em, criado_em: (r && r.criado_em) || new Date().toISOString(),      // plano 2000d · DU-123
      email_enviado_em: (r && r.email_enviado_em) || null }];      // DU-121
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
        // plano 2000d · FX-030 / SC-005: o servidor novo gera o link novo do MESMO convite (nx_convite_regerar); sem a função, revoga e cria outro
        try {
          const rg = await api.rpcC("nx_convite_regerar", { p_cliente: ctx.cliente.id, p_convite: cv.id });
          if (rg && rg.link) {
            dados.convites = (dados.convites || []).filter(x => x.id !== cv.id);
            if (!cv.vencido && typeof dados.uso === "number" && dados.uso > 0) dados.uso--;
            return rg;
          }
        } catch (e) { if (!semFuncaoRpc(e)) throw e; }
        if (!cv.vencido) await api.rpcC("nx_convite_revogar", { p_convite: cv.id });
        dados.convites = (dados.convites || []).filter(x => x.id !== cv.id);
        if (!cv.vencido && typeof dados.uso === "number" && dados.uso > 0) dados.uso--;
        return api.rpcC("nx_convite_criar", { p_dados: pd, p_org: null });
      })());
    } catch (e) { pint.convites(); pint.uso(); ui.toast(api.mensagemErro(e), { tipo: "erro" }); return; }
    acrescentarConvite(r, pd);
    await ui.modal({ titulo: "Convite gerado de novo", largura: "m",
      corpo: h("div", { class: "pilha" },
        h("p", null, "O link antigo deixou de valer. Envie este para a pessoa — ele não chega por e-mail."),
        // plano 2000d · DU-120: texto neutro («Você recebeu um convite»)
        ui.blocoLink(linkCompleto(ctx, r.link, dados && dados.dominio_ativo), { rotulo: "Link do convite", textoWhats: textoConviteWhats({ nome: pd.nome, cliente: ctx.cliente.nome, produto: ctx.shell.marcaEfetiva().produto }) }),
        r.expira_em ? h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(r.expira_em)} e só uma vez.`) : null),
      acoes: [{ rotulo: "Concluir", tipo: "primario", valor: true }] });
  }

  async function abrirConvite() {
    // plano 2000d · FX-116: os departamentos em ordem alfabética no convite (a ordem do banco era a de criação)
    const deps = [...(dados.departamentos || [])].sort((a, b) => String(a && a.nome).localeCompare(String(b && b.nome), "pt-BR"));
    const idAjudaPapel = `ajuda-papel-${++_seqAjuda}`;      // plano 1000b · UB-093: id único por abertura
    // plano 1500c · UCB-030: «Vários e-mails» — um convite por e-mail, no limite das vagas do plano
    let varios = false;
    const caixaUm = h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome (opcional)", nome: "nome", max: 80, autocomplete: "off" }),
      // plano 1500c · UCB-031: o e-mail informado trava o convite (só ele aceita)
      ui.campo({ rotulo: "E-mail (opcional)", nome: "email", tipo: "email", autocomplete: "off", ajuda: "Se preencher, só este e-mail poderá aceitar o convite." }));
    const caixaVarios = h("div", { class: "pilha-p", hidden: true },
      ui.campo({ rotulo: "E-mails", nome: "emails", tipo: "textarea", linhas: 4, autocomplete: "off", ajuda: "Um por linha, ou separados por vírgula ou ponto e vírgula. Cada pessoa recebe um link próprio." }));
    // plano 2000d · FX-036: a contagem enquanto cola a lista («6 e-mails · 1 não parece e-mail»)
    const contaEmails = h("small", { class: "fraco cfg-conv-conta", "aria-live": "polite" });
    caixaVarios.append(contaEmails);
    const txtEmails = caixaVarios.querySelector("[name=emails]");
    if (txtEmails) txtEmails.addEventListener("input", () => { contaEmails.textContent = resumoEmails(txtEmails.value); });
    // plano 2000d · FX-029 / DU-249: convidar pela FUNÇÃO (Recepção, Gerente, Sócio…) — o papel vem junto (rotas.FUNCOES_EQUIPE)
    // (vem pelo ctx.rotas do shell — os módulos não importam o rotas.js; shell antigo sem ele → só o papel)
    const R = ctx.rotas && Array.isArray(ctx.rotas.FUNCOES_EQUIPE) && typeof ctx.rotas.papelDaFuncao === "function" ? ctx.rotas : null;
    const funcoes = R ? R.FUNCOES_EQUIPE : [], papelDaFuncao = R ? R.papelDaFuncao : null;
    const btVarios = h("button", { type: "button", class: "bt bt-fant bt-p cfg-conv-varios", "aria-pressed": "false" }, ui.icone("convidar"), "Convidar várias pessoas de uma vez");
    btVarios.addEventListener("click", () => {
      varios = !varios;
      btVarios.setAttribute("aria-pressed", String(varios));
      caixaUm.hidden = varios; caixaVarios.hidden = !varios;
      btVarios.lastChild.textContent = varios ? "Convidar uma pessoa só" : "Convidar várias pessoas de uma vez";
    });
    // plano 2000d · DU-125: o seletor nasce no último papel escolhido nesta empresa (quem convida 5 supervisores não troca 5 vezes)
    const contaId = ctx.sessao && ctx.sessao.conta ? ctx.sessao.conta.id : null;
    const armaz = (() => { try { return localStorage; } catch { return null; } })();
    const papelIni = lerPapelPreferido(armaz, contaId, ctx.cliente && ctx.cliente.id);
    // plano 2000d · DU-121: o servidor que manda e-mail (dados.convite_email) ganha «Mandar por e-mail agora»
    const comEmail = dados.convite_email === true;
    const swEmail = comEmail ? ui.campo({ tipo: "interruptor", nome: "enviar_email", rotulo: "Mandar o convite por e-mail agora", valor: true,
      ajuda: "Sai com a marca da sua empresa para o e-mail preenchido. Sem e-mail, só o link." }) : null;
    const form = h("form", { class: "pilha", novalidate: true },
      ...(funcoes.length ? [ui.campo({ rotulo: "O que a pessoa faz (opcional)", nome: "funcao", tipo: "select", valor: "",
        opcoes: [{ valor: "", rotulo: "Escolher o papel direto" }, ...funcoes.map(f => ({ valor: f.id, rotulo: f.rotulo }))], ajuda: "Escolhe o papel certo para a função." })] : []),
      ui.campo({ rotulo: "Papel", nome: "papel", tipo: "select", valor: papelIni, opcoes: PAPEIS_EMPRESA.map(p => ({ valor: p.valor, rotulo: p.rotulo })) }),
      h("p", { class: "campo-ajuda", id: idAjudaPapel }, (PAPEIS_EMPRESA.find(p => p.valor === papelIni) || PAPEIS_EMPRESA[2]).ajuda),
      caixaUm, caixaVarios, h("div", { class: "linha" }, btVarios),
      // plano 2000d · DU-115: sem departamentos, o caminho para criar aparece no convite também
      deps.length ? ui.campo({ rotulo: "Departamentos", nome: "departamentos", tipo: "multipla", opcoes: deps.map(d => ({ valor: d.id, rotulo: d.nome })), ajuda: "Nenhum marcado = todos." })
        : typeof ctx.temModulo !== "function" || ctx.temModulo("conversas") ? h("p", { class: "fraco cfg-conv-sem-deps" }, "Sem departamentos: a pessoa vê todas as filas. ", h("a", { href: "#/config/departamentos" }, "Criar departamentos")) : null,
      swEmail,
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
    // FX-029: a função escolhida põe o papel (dá para trocar depois no seletor do papel)
    const selFuncao = form.querySelector("select[name=funcao]");
    if (selFuncao && papelDaFuncao) selFuncao.addEventListener("change", () => {
      const p = papelDaFuncao(selFuncao.value);
      if (p && PAPEIS_EMPRESA.some(x => x.valor === p)) { selPapel.value = p; selPapel.dispatchEvent(new Event("change")); }
    });
    let criado = null, repetirPendente = null, avisadoEmail = null, adminConfirmado = false;
    await ui.modal({
      titulo: "Convidar para a equipe", corpo: form, largura: "m",
      acoes: [
        { rotulo: "Cancelar", tipo: "neutro" },
        { rotulo: "Gerar link", tipo: "primario", fn: async m => {
          if (criado) return true;
          ui.marcarErro(form, null);
          const d = ui.lerForm(form);
          gravarPapelPreferido(armaz, contaId, ctx.cliente && ctx.cliente.id, d.papel);      // DU-125
          const base = { papel: d.papel, departamentos: d.departamentos || [], dias: Number(d.dias) || Number(DIAS_CONVITE_PADRAO) };
          if (comEmail && d.enviar_email) base.enviar_email = true;      // DU-121: só o servidor que anuncia recebe a chave
          // plano 2000d · FX-090: convite de ADMINISTRADOR (acesso total, inclusive usuários) pede confirmação uma vez
          if (d.papel === "admin" && !adminConfirmado) {
            if (!(await ui.confirmar({ titulo: "Convidar como administrador?", rotulo: "Convidar como administrador",
              texto: "Quem entrar por este convite vê e muda tudo da empresa, inclusive usuários, números e configurações." }))) return false;
            adminConfirmado = true;
          }
          if (varios) return criarVarios(m, form, d, base);
          const email = normEmail(d.email);
          if (email && !RE_EMAIL.test(email)) { ui.marcarErro(form, "email", "Esse e-mail não parece válido."); return false; }
          // plano 2000d · FX-034: «ana@gmial.com» pergunta uma vez (o segundo toque usa como está)
          const sug = sugestaoEmail(email);
          if (sug && avisadoEmail !== email) { avisadoEmail = email; ui.marcarErro(form, "email", `Você quis dizer ${sug}? Corrija ou toque de novo para usar como está.`); return false; }
          // plano 1500c · UCB-014: e-mail de quem já tem acesso não gasta vaga; com convite aguardando, pergunta antes
          const dup = conviteDuplicado(dados, email);
          if (dup === "membro") { ui.marcarErro(form, "email", "Essa pessoa já tem acesso a esta empresa."); return false; }
          if (dup === "pendente" && repetirPendente !== email) {
            if (!(await ui.confirmar({ titulo: "Já há um convite para esse e-mail", rotulo: "Gerar outro", texto: "Gerar outro cria mais um link (e ocupa mais uma vaga do plano até ser usado ou revogado). Gerar assim mesmo?" }))) return false;
            repetirPendente = email;
          }
          const pd = { ...base, nome: limparNome(d.nome) || null, email: email || null };      // plano 2000d · FX-089
          let r;
          // plano 1500c · UCB-016: cada erro do servidor vai para o seu campo e o modal continua aberto
          try { r = await api.rpcC("nx_convite_criar", { p_dados: pd, p_org: null }); }
          catch (e) { if (erroDoConvite(form, e)) return false; throw e; }
          criado = r;
          acrescentarConvite(r, pd);
          const link = linkCompleto(ctx, r.link, dados && dados.dominio_ativo);
          ui.limpar(m.corpo);
          // plano 2000d · DU-121: com o e-mail enviado pelo sistema, a frase diz isso (e não «não chega por e-mail»)
          const foiEmail = !!(pd.enviar_email && pd.email && (r.email_enviado_em || r.email_enviado));
          m.corpo.append(
            h("div", { class: "aviso aviso-ok" }, ui.icone("check"), h("p", null, foiEmail ? `Convite criado e enviado para ${pd.email}. O link abaixo também serve.` : "Convite criado. Envie o link para a pessoa — ele não chega por e-mail.")),
            // plano 2000d · DU-120: texto neutro
            ui.blocoLink(link, { rotulo: "Link do convite", textoWhats: textoConviteWhats({ nome: d.nome, cliente: ctx.cliente.nome, produto: ctx.shell.marcaEfetiva().produto }),
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
      // plano 2000d · FX-108: «Convidar outra pessoa» já do sucesso (quem monta a equipe convida em sequência), se ainda há vaga
      const cheio = !!dados.limite && dados.uso >= dados.limite;
      if (!cheio && m.corpo && !m.corpo.querySelector(".cfg-conv-outra")) {
        const outra = h("button", { type: "button", class: "bt bt-sec bt-p cfg-conv-outra" }, ui.icone("convidar"), "Convidar outra pessoa");
        outra.addEventListener("click", () => { m.fechar(true); const ir = () => abrirConvite(); if (ui.camadas && typeof ui.camadas.aposVolta === "function") ui.camadas.aposVolta(ir); else setTimeout(ir, 0); });
        m.corpo.append(h("div", { class: "linha" }, outra));
      }
    }
    /** UCB-030: um convite por e-mail válido (sem repetir quem já tem acesso), dentro das vagas do plano. */
    async function criarVarios(m, form, d, base) {
      const { validos, invalidos } = separarEmails(d.emails);
      if (invalidos.length) { ui.marcarErro(form, "emails", `Não parecem e-mails: ${invalidos.slice(0, 5).join(", ")}${invalidos.length > 5 ? "…" : ""}`); return false; }
      const membros = validos.filter(e => conviteDuplicado(dados, e) === "membro");
      const novos = validos.filter(e => !membros.includes(e));
      if (!novos.length) { ui.marcarErro(form, "emails", validos.length ? "Todas essas pessoas já têm acesso." : "Escreva pelo menos um e-mail."); return false; }
      // plano 2000d · FX-105: até 50 por vez (uma lista colada errada não dispara centenas de convites)
      if (novos.length > LIMITE_CONVITES_LOTE) { ui.marcarErro(form, "emails", `Até ${LIMITE_CONVITES_LOTE} e-mails por vez (a lista tem ${novos.length}).`); return false; }
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
      m.corpo.append(...[      // plano 2000d: com o «Copiar todos» condicional, a lista inteira passa pelo filter(Boolean)
        h("div", { class: "aviso aviso-ok" }, ui.icone("check"), h("p", null, `${feitos.length} ${feitos.length === 1 ? "convite criado" : "convites criados"}. Envie cada link para a pessoa — eles não chegam por e-mail.`)),
        membros.length ? h("p", { class: "fraco" }, `Já tinham acesso (sem convite): ${membros.join(", ")}.`) : null,
        falhas.length ? h("p", { class: "aviso aviso-aten" }, ui.icone("alerta"), h("span", null, `Não deu para convidar: ${falhas.join("; ")}.`)) : null,
        // plano 2000d · DU-122: «Copiar todos» monta «email: link» por linha (8 pessoas = 1 cópia, não 8)
        feitos.length > 1 ? h("div", { class: "linha" }, h("button", { type: "button", class: "bt bt-sec bt-p cfg-conv-copiar-todos",
          on: { click: () => ui.copiar(textoTodosLinks(feitos.map(f => ({ email: f.email, link: linkCompleto(ctx, f.r.link, dados && dados.dominio_ativo) }))), { aviso: `${feitos.length} links copiados.` }) } }, ui.icone("copiar"), "Copiar todos")) : null,
        h("div", { class: "pilha cfg-conv-links" }, feitos.map(f => ui.blocoLink(linkCompleto(ctx, f.r.link, dados && dados.dominio_ativo), { rotulo: f.email,
          textoWhats: textoConviteWhats({ cliente: ctx.cliente.nome, produto: ctx.shell.marcaEfetiva().produto }) })))].filter(Boolean));      // DU-120
      trocarRodape(m);
      return false;
    }
  }

  async function linkSenha(u) {
    try {
      const r = await api.rpcC("nx_senha_link_criar", { p_conta: u.conta_id });
      const link = linkCompleto(ctx, r.link, dados && dados.dominio_ativo);
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
    const textoBase = `A conta continua existindo; ela só deixa de entrar nesta empresa. Conversas e registros dela ficam.${extra}`;
    // plano 2000d · DU-112: com o servidor que transfere (dados.remover_transfere), negócios e tarefas passam para outra pessoa (padrão: quem remove)
    let params = { p_conta: u.conta_id };
    if (dados.remover_transfere === true) {
      const outros = (dados.usuarios || []).filter(x => x && x.conta_id !== u.conta_id && !x.gestor && !acessoPausado(x));
      const eu = outros.find(x => x.eu) || outros[0];
      const resumo = resumoTransferencia(u);
      const fm = h("form", { class: "pilha", novalidate: true }, h("p", null, textoBase),
        outros.length ? ui.campo({ rotulo: "Passar negócios e tarefas para", nome: "para", tipo: "select", valor: eu ? eu.conta_id : "",
          opcoes: outros.map(x => ({ valor: x.conta_id, rotulo: `${x.nome}${x.eu ? " (você)" : ""}` })),
          ajuda: resumo ? `${resumo} ${/^1 /.test(resumo) && !/ e /.test(resumo) ? "muda" : "mudam"} de dono.` : "Os negócios e as tarefas abertas dela mudam de dono." }) : null);
      const r = await ui.modal({ titulo: `Remover o acesso de ${u.nome}?`, corpo: fm, largura: "m",
        acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Remover acesso", tipo: "perigo", icone: "lixeira", fn: async () => ({ para: ui.lerForm(fm).para || null }) }] });
      if (!r) return;
      if (r.para) params = { ...params, p_transferir_para: r.para };
    } else {
      const ok = await ui.confirmar({ titulo: `Remover o acesso de ${u.nome}?`, texto: textoBase, rotulo: "Remover acesso", perigo: true });
      if (!ok) return;
    }
    try {
      dados = await api.rpcC("nx_usuario_remover", params);
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
      rod,
      // plano 2000d · DU-145: Termos e Política de Privacidade no rodapé da entrada (decoração na prévia)
      h("p", { class: "pv-login-legais" })));
  const legaisEl = el.querySelector(".pv-login-legais");
  return {
    el,
    legais({ termos = "", privacidade = "" } = {}) {
      const partes = [termos ? "Termos de uso" : null, privacidade ? "Política de Privacidade" : null].filter(Boolean);
      legaisEl.textContent = partes.join(" · ");
      legaisEl.hidden = !partes.length;
    },
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
const LIMITE_ICONE_APP = 120 * 1024;      // plano 2000d · DU-147

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
        cores: { ...coresOrg, ...(base.cores || {}) }, login_titulo: base.login_titulo || "", login_texto: base.login_texto || "", suporte_wa: base.suporte_wa || "",
        // plano 2000d · DU-145/DU-146/DU-147/DU-202: contato, links legais, e-mails do sistema, ícone do app e teste grátis pelo site
        ...Object.fromEntries(CHAVES_MARCA_NOVAS.map(k => [k, k === "teste_aberto" ? base[k] === true : typeof base[k] === "string" ? base[k] : ""])) };
  let coresProprias = soTema ? !!(base.cores && Object.keys(base.cores).length) : true;
  let appInteiro = false;
  let salvo = JSON.stringify(payload());

  function payload() {
    const r = {};
    const chaves = soTema ? ["logo", "logo_claro"] : ["produto", "assinatura", "logo", "logo_claro", "favicon", "login_titulo", "login_texto", "suporte_wa",
      ...CHAVES_MARCA_NOVAS.filter(k => k !== "teste_aberto")];      // plano 2000d · DU-145/DU-146/DU-147: só vão quando preenchidos
    for (const k of chaves) {
      let v = typeof m[k] === "string" ? m[k].trim() : "";
      if (k === "suporte_wa") v = v.replace(/\D/g, "");
      // plano 2000d · FX-058: link sem https:// ganha o https:// · FX-059: e-mail de suporte em minúsculas
      if (k === "site" || k === "termos_url" || k === "privacidade_url") v = completarHttps(v);
      if (k === "suporte_email") v = v.toLowerCase();
      if (v) r[k] = v;
    }
    if (!soTema && m.teste_aberto === true) r.teste_aberto = true;      // plano 2000d · DU-202
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
  // plano 2000d · FX-057: o nome que não cabe embaixo do ícone do celular diz como fica
  const avisoCurto = h("small", { class: "campo-ajuda cfg-nome-curto", "aria-live": "polite", hidden: true });
  const inpProduto = form.querySelector("input[name=produto]");
  if (inpProduto && inpProduto.closest("[data-campo]")) inpProduto.closest("[data-campo]").appendChild(avisoCurto);
  const pintarCurto = () => { const t = soTema ? "" : avisoNomeCurto(m.produto); avisoCurto.textContent = t; avisoCurto.hidden = !t; };
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
      // plano 2000d · FX-062: o exemplo não cita a marca da plataforma (a revenda copiava a frase com «órbita»)
      ui.campo({ rotulo: "Título da tela de entrada", nome: "login_titulo", valor: m.login_titulo, max: T.LIMITES_MARCA.login_titulo, placeholder: "Atendimento, vendas e agenda num lugar só." }),
      ui.campo({ rotulo: "Texto de apoio", nome: "login_texto", tipo: "textarea", linhas: 2, valor: m.login_texto, max: T.LIMITES_MARCA.login_texto, placeholder: "Entre com o e-mail e a senha que você recebeu." }),
      ui.campo({ rotulo: "WhatsApp de suporte", nome: "suporte_wa", tipo: "tel", valor: m.suporte_wa, placeholder: "5512999998888", ajuda: "Só números, com 55 e DDD. Aparece em \"Esqueci a senha\" e nos avisos de teste e suspensão." }),
      h("div", { class: "linha cfg-wa-linha" }, previaWa, testarWa), avisoSemWa,
      // plano 2000d · DU-202: o teste grátis pelo site (/app/?org=slug#/testar) — a revenda liga aqui
      ui.campo({ tipo: "interruptor", nome: "teste_aberto", rotulo: "Teste grátis pelo site", valor: m.teste_aberto === true,
        ajuda: "Liga o «Testar grátis» na tela de entrada: quem chega pelo seu link cria uma conta de teste de 14 dias sozinho." }),
      // plano 2000d · DU-152 / FX-056: a janela de boas-vindas que o administrador do cliente vê no primeiro acesso (o app.js já mostra)
      h("p", { class: "rotulo cfg-boas-vindas-tit" }, "Boas-vindas ao cliente novo"),
      ui.campo({ rotulo: "Título das boas-vindas", nome: "boas_vindas_titulo", valor: m.boas_vindas_titulo, max: 80, autocomplete: "off", placeholder: "Bem-vindo! Vamos deixar tudo pronto?" }),
      ui.campo({ rotulo: "Texto das boas-vindas", nome: "boas_vindas", tipo: "textarea", linhas: 3, valor: m.boas_vindas, max: 400, placeholder: "Comece conectando o seu WhatsApp. Qualquer dúvida, chame a gente." }),
      ui.campo({ rotulo: "Contato da agência", nome: "contato_agencia", valor: m.contato_agencia, max: 120, autocomplete: "off", placeholder: "Ana · (12) 99999-0000 · seg a sex, 9h às 18h",
        ajuda: "Aparece nas boas-vindas para o cliente saber quem procurar." }));
  }
  // plano 2000d · DU-145/DU-146: contato, site, Termos e Política de Privacidade (LGPD) e os e-mails que o sistema manda
  const formLegal = h("form", { class: "pilha", novalidate: true });
  formLegal.addEventListener("submit", ev => ev.preventDefault());
  if (!soTema) formLegal.append(
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "E-mail de suporte", nome: "suporte_email", tipo: "email", valor: m.suporte_email, autocomplete: "off", placeholder: "suporte@suaagencia.com.br" }),
      ui.campo({ rotulo: "Site", nome: "site", tipo: "url", valor: m.site, autocomplete: "off", placeholder: "https://suaagencia.com.br" }),
      ui.campo({ rotulo: "Termos de uso (link)", nome: "termos_url", tipo: "url", valor: m.termos_url, autocomplete: "off", placeholder: "https://suaagencia.com.br/termos" }),
      ui.campo({ rotulo: "Política de Privacidade (link)", nome: "privacidade_url", tipo: "url", valor: m.privacidade_url, autocomplete: "off", placeholder: "https://suaagencia.com.br/privacidade",
        ajuda: "A LGPD pede que a política esteja à vista: aparece no rodapé da tela de entrada e no teste grátis." }),
      ui.campo({ rotulo: "Nome do remetente dos e-mails", nome: "email_remetente", valor: m.email_remetente, max: 60, autocomplete: "off", placeholder: "Equipe Conecta" }),
      ui.campo({ rotulo: "Rodapé dos e-mails", nome: "email_rodape", tipo: "textarea", linhas: 2, valor: m.email_rodape, max: 200, placeholder: "Conecta Marketing · Taubaté/SP" })));
  // plano 2000d · FX-111: «Abrir» ao lado de site, Termos e Privacidade (confere que o link não dá erro antes de salvar)
  for (const k of ["site", "termos_url", "privacidade_url"]) {
    const inp = formLegal.querySelector(`input[name=${k}]`);
    if (!inp || !inp.closest("[data-campo]")) continue;
    const a = h("a", { class: "bt bt-fant bt-p cfg-link-abrir", target: "_blank", rel: "noopener noreferrer", hidden: true }, ui.icone("externo"), "Abrir");
    const pintar = () => { const u = completarHttps(inp.value); const ok = !!u && linkHttpsValido(u); a.hidden = !ok; if (ok) a.setAttribute("href", u); };
    inp.addEventListener("input", pintar); pintar();
    inp.closest("[data-campo]").appendChild(a);
  }
  formEntrada.addEventListener("change", ev => {
    if (!ev.target || ev.target.name !== "teste_aberto") return;
    m.teste_aberto = !!ev.target.checked; atualizar();
  });
  for (const f of [form, formEntrada, formLegal]) {
    f.addEventListener("input", ev => {
      const n = ev.target && ev.target.name;
      if (!n || !(n in m) || n === "cores" || n === "teste_aberto") return;
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
      // plano 2000d · FX-055 / DU-322: o nome da cor para o leitor de tela e aria-pressed na que já é a primária
      const b = h("button", { type: "button", class: "cor-op", style: { "--cor": ui.corOk(c) }, "aria-label": `Usar a cor ${nomeCor(c)} do logo`, title: nomeCor(c), dataset: { cor: String(T.normalizarHex(c) || c) }, "aria-pressed": "false" });
      b.addEventListener("click", () => ui.menu(b, [
        { rotulo: "Usar como primária", icone: "pincel", fn: () => usarCor("primaria", c) },
        { rotulo: "Usar como secundária", icone: "pincel", fn: () => usarCor("secundaria", c) },
        { rotulo: "Usar como fundo", icone: "pincel", fn: () => usarCor("fundo", c) },
      ]));
      sugestoes.append(b);
    }
    pintarSugestoesPressionadas();
  }
  /** FX-055: a amostra igual a uma das cores em uso fica «pressionada». */
  function pintarSugestoesPressionadas() {
    const usadas = new Set(["primaria", "secundaria", "fundo"].map(k => String(T.normalizarHex(m.cores[k]) || "").toUpperCase()));
    for (const b of sugestoes.querySelectorAll(".cor-op")) b.setAttribute("aria-pressed", String(usadas.has(String(b.dataset.cor || "").toUpperCase())));
  }
  let colarLogo = null;         // AS-110: Ctrl+V de uma imagem no editor vai para o logo
  function controleImagem({ chave, rotulo, ajuda, claro = false, favicon = false, icone = false }) {
    const amostra = h("div", { class: ["logo-amostra", claro && "claro", (favicon || icone) && "favicon"], title: "Arraste uma imagem para cá" });
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
      // plano 2000d · FX-087 / FX-088: SVG, HEIC ou arquivo enorme → a mensagem certa antes de decodificar
      const errArq = erroArquivoImagem(f);
      if (errArq) { mostrarErro(errArq); return; }
      try {
        // plano 2000d · DU-147: o ícone do app é quadrado (até 512 px)
        const r = await ui.carregando(btEnviar, processarImagem(f, favicon ? { W: 64, H: 64, limite: LIMITE_FAVICON, quadrado: true, png: true }
          : icone ? { W: 512, H: 512, limite: LIMITE_ICONE_APP, quadrado: true } : {}));
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
  // plano 2000d · DU-148: o ícone e o nome curto na tela inicial do celular (o short_name do manifesto, cortado por rotas.nomeCurto)
  const pvHomeIc = h("span", { class: "pv-home-ic" });
  const pvHomeNome = h("span", { class: "pv-home-nome" });
  const pvHome = h("div", { class: "pv-home", role: "img", "aria-label": "Pré-visualização do app instalado no celular" }, h("span", { class: "pv-home-app", "aria-hidden": "true" }, pvHomeIc, pvHomeNome));
  // (os módulos não carregam rotas.js — vem do shell; nomeCurtoManifesto é a mesma régua do rotas.nomeCurto)
  const nomeCurtoFn = nomeCurtoManifesto;
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
    // DU-148 / DU-147: o ícone instalado prefere o «Ícone do app» ao logo
    ui.limpar(pvHomeIc);
    const ic = T.imagemSegura(origemIconeApp({ icone_app: soTema ? null : m.icone_app, logo_cliente: soTema ? ef.logo_cliente : null, favicon: soTema ? ef.favicon : m.favicon, logo: lg }));
    pvHomeIc.append(ic ? h("img", { src: ic, alt: "" }) : h("svg", { class: "pv-marca", viewBox: "0 0 48 48", "aria-hidden": "true" }, h("use", { href: "#marca-orbita" })));
    const curto = nomeCurtoFn(ef.produto || "", "");
    pvHomeNome.textContent = curto;
    pvHome.setAttribute("aria-label", `App instalado no celular: «${curto}»`);
    // DU-145: os links legais no rodapé da prévia da tela de entrada
    if (!soTema) pvLogin.legais({ termos: m.termos_url, privacidade: m.privacidade_url });
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
    pintarCurto();      // plano 2000d · FX-057
    pintarSugestoesPressionadas();      // plano 2000d · FX-055
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
  let salvando = false;      // plano 2000d · FX-060: Ctrl+S repetido não dispara dois salvamentos
  btSalvar.addEventListener("click", async () => {
    if (salvando) return;
    if (btSalvar.getAttribute("aria-disabled") === "true") { ui.toast("Nada para salvar: a marca está igual à salva.", { tipo: "info" }); return; }      // UB-261
    salvando = true;
    try { await salvarMarca(); } finally { salvando = false; }
  });
  async function salvarMarca() {
    ui.marcarErro(form, null); ui.marcarErro(formEntrada, null); ui.marcarErro(formLegal, null);
    const p = payload();
    // plano 2000d · DU-145: as chaves novas têm validação própria (o validarMarca do tema ainda não as conhece)
    let erros = [...T.validarMarca(semChavesNovas(p).resto, soTema), ...(soTema ? [] : validarLinksMarca(p))];
    if (!soTema && !p.produto) erros.push({ campo: "produto", texto: "Informe o nome do produto." });
    // plano 1000b · UB-178: uma frase só para o WhatsApp de suporte (a do tema.js saía junto, diferente)
    if (!soTema && m.suporte_wa && !suporteWaValido(m.suporte_wa).ok) erros = [...erros.filter(e => e.campo !== "suporte_wa"), { campo: "suporte_wa", texto: suporteWaValido(m.suporte_wa).erro }];
    if (erros.length) {
      for (const e of erros) {
        if (form.querySelector(`[name="${e.campo}"]`)) ui.marcarErro(form, e.campo, e.texto);
        else if (formEntrada.querySelector(`[name="${e.campo}"]`)) ui.marcarErro(formEntrada, e.campo, e.texto);
        else if (formLegal.querySelector(`[name="${e.campo}"]`)) ui.marcarErro(formLegal, e.campo, e.texto);
      }
      // plano 1000b · UB-094: marcarErro foca cada campo; o foco termina no PRIMEIRO erro (na ordem da tela), não no último
      const primeiro = [form, formEntrada, formLegal].map(f => f.querySelector("[data-campo][data-estado=erro] input, [data-campo][data-estado=erro] textarea, [data-campo][data-estado=erro] select")).find(Boolean);
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
        let r, tiradas = [];
        try { r = await ui.carregando(btSalvar, api.rpc("nx_org_salvar", { p_org: { id: orgInfo.id, marca: p } })); }
        catch (e) {
          // plano 2000d · DU-145: o servidor antigo recusa as chaves novas — salva o resto e diz o que ficou de fora
          if (!(e && e.codigo === "marca_invalida" && CHAVES_MARCA_NOVAS.includes(e.hint))) throw e;
          const s = semChavesNovas(p, e.hint);
          tiradas = s.tiradas;
          r = await ui.carregando(btSalvar, api.rpc("nx_org_salvar", { p_org: { id: orgInfo.id, marca: s.resto } }));
        }
        if (r && r.marca) orgInfo.marca = r.marca;
        if (tiradas.length) ui.toast(`Marca salva, mas este servidor ainda não guarda: ${tiradas.map(rotuloChaveMarca).join(", ")}.`, { tipo: "info", ms: 9000 });
      }
      salvo = JSON.stringify(p);
      if (appInteiro) { appInteiro = false; btApp.setAttribute("aria-pressed", "false"); }
      // plano 2000d · DU-150: quem já está com o app aberto vê a marca nova ao abrir de novo (ou na próxima conferência, em até 10 min)
      ui.toast(soTema ? "Tema salvo. Quem entrar nesta empresa já vê a marca nova." : "Marca salva. Seus clientes veem a marca nova ao abrir o app (quem já está com ele aberto, em até 10 min).", { tipo: "ok" });
      try { await ctx.shell.recarregarMarca(); } catch { /* aparece na próxima entrada */ }
      // plano 2000d · FX-054 / DU-150: as outras abas deste navegador repintam na hora (o app.js ouve «nx-marca-hash» no storage)
      try { localStorage.setItem("nx-marca-hash", hashCurto({ tipo, org: orgInfo ? orgInfo.id : null, p })); } catch { /* sem storage: em até 10 min */ }
      atualizar();
      if (aoSalvar) try { aoSalvar(p); } catch { /* ok */ }
    } catch (e) {
      const campo = e && e.codigo === "marca_invalida" && e.hint;
      if (campo && form.querySelector(`[name="${campo}"]`)) ui.marcarErro(form, campo, api.mensagemErro(e));
      else if (campo && formEntrada.querySelector(`[name="${campo}"]`)) ui.marcarErro(formEntrada, campo, api.mensagemErro(e));
      else if (campo && formLegal.querySelector(`[name="${campo}"]`)) ui.marcarErro(formLegal, campo, api.mensagemErro(e));
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  }

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

  /** plano 2000d · DU-151 / DU-158: as últimas versões salvas da marca (nx_marca_versoes) e «Ver como cliente» (empresa de demonstração). */
  function blocoVersoes() {
    const lista = h("ul", { class: "cfg-marca-versoes" });
    const caixa = h("div", { class: "cartao cfg-marca-hist", hidden: true }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Versões anteriores"),
      h("p", { class: "sub" }, "Salvou um logo errado? Volte a uma das últimas versões salvas."))), lista);
    if (orgInfo && orgInfo.demo_disponivel === true) {
      const bDemo = h("button", { type: "button", class: "bt bt-sec bt-p cfg-ver-cliente" }, ui.icone("olho"), "Ver como cliente");
      bDemo.addEventListener("click", async () => {
        try { await ui.carregando(bDemo, api.rpc("nx_demo_entrar", { p_org: orgInfo.id })); await ctx.shell.recarregarSessao(); ctx.navegar("#/"); }
        catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      });
      caixa.append(h("p", { class: "linha" }, bDemo, h("small", { class: "fraco" }, "Abre a empresa de demonstração com a sua marca, só para olhar.")));
      caixa.hidden = false;
    }
    Promise.resolve().then(() => api.rpc("nx_marca_versoes", { p_org: orgInfo.id })).then(vs => {
      if (!Array.isArray(vs) || !vs.length) return;
      for (const v of vs.slice(0, 5)) {
        const b = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Voltar a esta");
        b.addEventListener("click", async () => {
          if (sujo() && !(await ui.confirmar({ titulo: "Descartar as mudanças não salvas?", perigo: true, rotulo: "Descartar e voltar", texto: "A versão escolhida substitui o que está na tela." }))) return;
          if (!(await ui.confirmar({ titulo: `Voltar à marca de ${ui.dataHoraBR(v.em)}?`, rotulo: "Voltar a esta versão", texto: "Ela passa a valer para todos os seus clientes. A atual fica guardada nas versões." }))) return;
          try {
            await ui.carregando(b, api.rpc("nx_marca_versoes", { p_org: orgInfo.id, p_restaurar: v.id }));
            ui.toast("Marca de volta à versão escolhida.", { tipo: "ok" });
            try { await ctx.shell.recarregarMarca(); } catch { /* ok */ }
            editorMarca(ctx, alvo, { tipo, org, aoSalvar });
          } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
        });
        lista.append(h("li", { class: "linha linha-entre" }, h("span", null, `Salva ${ui.relativo(v.em)}`, v.autor ? h("small", { class: "fraco" }, ` · ${v.autor}`) : null), b));
      }
      caixa.hidden = false;
    }).catch(() => { /* servidor sem versões: o cartão só aparece com o «Ver como cliente» */ });
    return caixa;
  }

  // ---- montagem
  const cartao = (titulo, sub, ...filhos) => h("div", { class: "cartao" },
    h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, titulo), sub ? h("p", { class: "sub" }, sub) : null)), ...filhos);
  const imagens = [
    // plano 1500c · UCB-061: o formato ideal, não só o limite
    controleImagem({ chave: "logo", rotulo: "Logo", ajuda: "PNG com fundo transparente, de preferência horizontal (até 320 × 160). Também aceita JPEG e WebP. Reduzimos para até 60 KB." }),
    controleImagem({ chave: "logo_claro", rotulo: "Logo para fundo claro", ajuda: "Opcional: usado quando o fundo é claro.", claro: true }),
    soTema ? null : controleImagem({ chave: "favicon", rotulo: "Ícone da aba", ajuda: "Quadrado, 64 × 64. Pode gerar a partir do logo.", favicon: true }),
    // plano 2000d · DU-147: o ícone do app instalado no celular (logo largo vira ícone ilegível)
    soTema ? null : controleImagem({ chave: "icone_app", rotulo: "Ícone do app instalado", ajuda: "Quadrado, 512 × 512, sem texto pequeno. Sem ele, o app usa o ícone da aba ou o logo.", icone: true }),
  ];
  const esquerda = h("div", { class: "pilha" },
    soTema ? null : cartao("Identidade", "Como o produto se chama para os seus clientes.", form),
    cartao("Logo", null, h("div", { class: "pilha" }, imagens, sugestoes)),
    cartao("Cores", "Três cores bastam: o app deriva todo o resto e garante o contraste.", h("div", { class: "pilha" }, ...[blocoProprias, notaCoresOff, caixaCores,
      // plano 2000d · FX-061: as três cores em texto (para o designer ou o site)
      h("div", { class: "linha linha-fim" }, h("button", { type: "button", class: "bt bt-fant bt-p cfg-copiar-cores", on: { click: () => ui.copiar(textoCoresMarca(m.cores), { aviso: "Cores copiadas." }) } }, ui.icone("copiar"), "Copiar as cores"))].filter(Boolean))),
    soTema ? null : cartao("Tela de entrada", "O que aparece antes do login, no seu domínio ou pelo link de entrada.", linhaLinkEntrada, formEntrada),
    soTema ? null : cartao("Contato, links legais e e-mails", "Para os seus clientes acharem você e para os e-mails do sistema saírem com a sua marca.", formLegal),
    soTema ? null : blocoVersoes());
  const direita = h("div", { class: "marca-previa-env" },
    h("div", { class: "linha linha-entre" }, h("p", { class: "rotulo" }, "Pré-visualização ao vivo"), pvEsquema),
    h("div", { class: "linha linha-entre cfg-prev-ctl" }, segPreviaEl, segEsquema),
    h("div", { class: "linha cfg-prev-mini" }, pvAba, pvHome), previa, pvCel, pvLogin.el, avisos,
    h("div", { class: "linha marca-acoes" }, btApp, btPadrao, h("span", { class: "marca-espaco" }), btSalvar),
    estado);
  ui.limpar(alvo);
  const editorEl = h("div", { class: "marca-ed" }, esquerda, direita);
  // AS-110: colar (Ctrl+V) uma imagem com o foco no editor troca o logo — texto colado num campo segue normal
  // plano 2000d · FX-060: Ctrl/⌘+S salva a marca (o navegador não abre o «Salvar página»)
  editorEl.addEventListener("keydown", ev => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || String(ev.key || "").toLowerCase() !== "s") return;
    ev.preventDefault();
    btSalvar.click();
  });
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
  // plano 1500c · UCB-018: gestor sem clientes ainda · plano 2000d · FX-115: em ordem alfabética (achar um cliente entre 40)
  const clientes = [...((typeof ctx.shell.clientes === "function" && ctx.shell.clientes()) || [])].sort((a, b) => String(a && a.nome).localeCompare(String(b && b.nome), "pt-BR"));
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      // plano 2000d · DU-161: a sugestão é «app.» + o seu domínio (o domínio raiz é o do site e não aceita CNAME)
      ui.campo({ rotulo: "Endereço", nome: "host", placeholder: "app.suaagencia.com.br", autocomplete: "off", inputmode: "url",
        ajuda: "Use um subdomínio, como app.suaagencia.com.br: o domínio raiz (suaagencia.com.br) é o do seu site e não aceita CNAME." }),
      ui.campo({ rotulo: "Para quem", nome: "cliente", tipo: "select", valor: "",
        opcoes: [{ valor: "", rotulo: "Toda a agência (login com a sua marca)" }, ...clientes.map(c => ({ valor: c.id, rotulo: `Só a ${c.nome}` }))],
        ajuda: "Com um cliente escolhido, quem entra por esse endereço já cai na empresa dele." })),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, ui.icone("mais"), "Adicionar domínio")));
  // DU-161: digitou o domínio raiz → avisa já e oferece o subdomínio com um toque
  const inpHost = form.querySelector("input[name=host]");
  const sugestao = h("p", { class: "aviso aviso-aten cfg-dom-sugestao", role: "status", hidden: true });
  inpHost.closest("[data-campo]").appendChild(sugestao);
  inpHost.addEventListener("input", ui.debounce ? ui.debounce(() => pintarSugestao(), 250) : () => pintarSugestao());
  function pintarSugestao() {
    const s = sugestaoSubdominio(inpHost.value);
    ui.limpar(sugestao);
    sugestao.hidden = !s;
    if (!s) return;
    const usar = h("button", { type: "button", class: "bt bt-sec bt-p" }, `Usar ${s}`);
    usar.addEventListener("click", () => { inpHost.value = s; sugestao.hidden = true; inpHost.focus(); });
    sugestao.append(ui.icone("alerta"), h("span", null, "Esse é o domínio do seu site: ele não aceita CNAME. "), usar);
  }
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    const host = normalizarHost(d.host);
    // plano 1000b · UB-263: o próprio endereço do app (ou um *.netlify.app) não é domínio próprio — é o destino do CNAME
    const erroHost = erroHostDominio(host, typeof location !== "undefined" ? location.hostname : "");
    if (erroHost) return ui.marcarErro(form, "host", erroHost);
    // plano 2000d · FX-067: o mesmo endereço já está na lista — diz na hora, sem ir ao servidor
    if (hostJaCadastrado(lista, host)) return ui.marcarErro(form, "host", "Esse endereço já está cadastrado (veja na lista abaixo).");
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
    // plano 2000d · FX-066: o que precisa de atenção (parou de apontar, pendente) primeiro
    for (const d of ordenarDominios(lista)) caixa.append(cartaoDominio(ctx, d, { aoRemover: async () => { lista = validarListaDominios(await api.rpc("nx_dominios_listar")); desenhar(); } }));
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
      // plano 2000d · DU-160: o ativo que parou de apontar fica em vermelho
      d.status === "quebrado" ? ui.pilula("Parou de apontar", "ruim", { icone: "alerta" }) : ui.pilula(ativo ? "Ativo" : "Pendente", ativo ? "ok" : "aten")),
    d.status === "quebrado" ? h("p", { class: "aviso aviso-ruim dom-quebrado", role: "status" }, ui.icone("alerta"),
      h("span", null, `O CNAME de ${d.host} não aponta mais para o app${d.verificado_em ? ` (conferido ${ui.relativo(d.verificado_em)})` : ""}: quem entra por ele cai num erro. Confira o registro no seu provedor.`)) : null,
    // plano 2000d · FX-065: o «Nome» como os painéis pedem (só «crm» em crm.agencia.com.br), com o completo de reserva
    ativo ? null : h("dl", { class: "dns" },
      h("dt", null, "Tipo"), h("dd", null, "CNAME"),
      h("dt", null, "Nome"), h("dd", null, copiavel(rotuloCname(d.host), "Nome"), h("small", { class: "fraco dns-nome-completo" }, ` (se o provedor pedir o endereço inteiro: ${d.host})`)),
      h("dt", null, "Valor"), h("dd", null, alvoDns ? copiavel(alvoDns, "Valor") : h("span", { class: "fraco" }, "a plataforma informa"))),
    // plano 2000d · FX-095: o registro inteiro num toque (para mandar a quem cuida do DNS)
    ativo ? null : h("div", { class: "linha" }, h("button", { type: "button", class: "bt bt-fant bt-p dom-copiar-tudo", on: { click: () => ui.copiar(textoRegistroDns(d.host, alvoDns), { aviso: "Registro copiado." }) } }, ui.icone("copiar"), "Copiar o registro inteiro")),
    h("p", { class: "fraco dom-nota" }, ativo
      ? `No ar${d.ativado_em ? ` desde ${ui.dataBR(d.ativado_em)}` : ""}. Convites e links de senha já saem com este endereço.`
      : alvoDns
        ? `Crie o registro CNAME: ${d.host} → ${alvoDns}${semAlvo ? " (o endereço atual do app)" : ""}. A plataforma ativa o domínio em até 1 dia útil.`
        : `Peça à plataforma o destino do registro CNAME de ${d.host} antes de mexer no DNS. A plataforma ativa o domínio em até 1 dia útil.`),
    // plano 1500c · UCB-068: a armadilha do proxy do Cloudflare (com a nuvem laranja o certificado não sai)
    ativo ? null : h("p", { class: "fraco dom-nota dom-cloudflare" }, "Usa Cloudflare? Deixe o proxy desligado (nuvem cinza, «somente DNS»)."),
    // plano 2000d · DU-159: o passo a passo nos provedores mais comuns, com o nome e o valor já certos
    ativo ? null : h("details", { class: "dom-provedores" }, h("summary", null, "Passo a passo no seu provedor"),
      h("div", { class: "pilha-p" }, PROVEDORES_DNS.map(pv => h("details", { class: "dom-provedor", dataset: { provedor: pv.id } }, h("summary", null, pv.nome),
        h("ol", { class: "dom-passos" }, passosProvedor(pv.id, d.host, alvoDns).map(p => h("li", null, p))))))),
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

/** plano 2000d · DU-163: «Pagamentos» — próximas cobranças, faturas pagas (PDF) e trocar forma de pagamento (nx_faturas_listar). Sem a função → some. */
function cartaoFaturas(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const corpo = h("div", { class: "pilha-p" });
  const cartao = h("div", { class: "cartao cfg-faturas", hidden: true }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Pagamentos"),
    h("p", { class: "sub" }, "Próximas cobranças e faturas pagas."))), corpo);
  const linkOk = u => typeof u === "string" && /^https:\/\//.test(u);
  cartao.pronto = Promise.resolve().then(() => api.rpcC("nx_faturas_listar", {})).then(r => {
    const fs = Array.isArray(r) ? r : r && Array.isArray(r.faturas) ? r.faturas : null;
    if (!fs) return false;
    ui.limpar(corpo);
    // plano 2000d · FX-068: o total em aberto no topo; FX-069: atrasadas primeiro; FX-096: há quantos dias atrasou
    const res = resumoFaturas(fs);
    if (res) corpo.append(h("p", { class: ["aviso", res.atrasadas ? "aviso-ruim" : "aviso-aten", "cfg-faturas-resumo"], role: "status" }, ui.icone(res.atrasadas ? "alerta" : "relogio"),
      h("span", null, `${ui.brl(res.aberto)} em aberto em ${res.n} ${res.n === 1 ? "fatura" : "faturas"}${res.atrasadas ? ` (${res.atrasadas} ${res.atrasadas === 1 ? "atrasada" : "atrasadas"})` : ""}.`)));
    const hojeF = ui.hojeSP();
    if (!fs.length) corpo.append(h("p", { class: "fraco" }, "Nenhuma fatura ainda."));
    else corpo.append(h("ul", { class: "cfg-faturas-lista" }, ordenarFaturas(fs).slice(0, 24).map(f => h("li", { class: "linha linha-entre" },
      h("span", null, h("b", null, f.vencimento ? ui.dataBR(f.vencimento) : "—"), h("small", { class: "fraco" }, ` · ${f.valor != null ? ui.brl(f.valor) : ""}`)),
      h("span", { class: "linha" }, ui.pilula(f.status === "paga" ? "Paga" : f.status === "atrasada" ? (diasAtraso(f.vencimento, hojeF) ? `Atrasada há ${diasAtraso(f.vencimento, hojeF)} ${diasAtraso(f.vencimento, hojeF) === 1 ? "dia" : "dias"}` : "Atrasada") : "Em aberto",
        f.status === "paga" ? "ok" : f.status === "atrasada" ? "ruim" : "aten"),
        linkOk(f.pdf_url) ? h("a", { class: "bt bt-fant bt-p", href: f.pdf_url, target: "_blank", rel: "noopener noreferrer" }, ui.icone("baixar"), "Recibo") : null,
        f.status !== "paga" && linkOk(f.pagar_url) ? h("a", { class: "bt bt-prim bt-p", href: f.pagar_url, target: "_blank", rel: "noopener noreferrer" }, "Pagar") : null)))));
    if (r && linkOk(r.trocar_pagamento_url)) corpo.append(h("a", { class: "bt bt-sec bt-p", href: r.trocar_pagamento_url, target: "_blank", rel: "noopener noreferrer" }, ui.icone("cartao"), "Trocar forma de pagamento"));
    cartao.hidden = false;
    return true;
  }).catch(() => { cartao.hidden = true; return false; });
  return cartao;
}

/** plano 2000d · DU-165: «Cancelar assinatura» — motivo, o que faltou, oferta de pausa; avisa quem cuida do plano (nx_cancelamento_pedir). */
export const MOTIVOS_CANCELAMENTO = Object.freeze([["preco", "O preço não cabe agora"], ["uso", "A equipe não está usando"], ["falta", "Falta algo que preciso"], ["outro_sistema", "Vou para outro sistema"], ["fechou", "A empresa fechou ou parou"], ["outro", "Outro motivo"]]);
function cartaoCancelar(ctx, { nomeCli = "", quem = null } = {}) {
  const { ui, api } = ctx;
  const h = ui.h;
  const b = h("button", { type: "button", class: "bt bt-fant bt-p cfg-cancelar" }, "Cancelar assinatura");
  b.addEventListener("click", async () => {
    const fm = h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: "Por que você quer cancelar?", nome: "motivo", tipo: "select", valor: "", obrigatorio: true, opcoes: [{ valor: "", rotulo: "Escolha um motivo" }, ...MOTIVOS_CANCELAMENTO.map(([valor, rotulo]) => ({ valor, rotulo }))] }),
      ui.campo({ rotulo: "O que faltou para continuar? (opcional)", nome: "faltou", tipo: "textarea", linhas: 3, max: 500 }),
      ui.campo({ tipo: "interruptor", nome: "pausar", rotulo: "Prefiro pausar por 1 mês em vez de cancelar", valor: false, ajuda: "Os dados ficam guardados e nada é cobrado na pausa." }));
    const r = await ui.modal({ titulo: `Cancelar a assinatura da ${nomeCli}`, corpo: fm, largura: "m", acoes: [{ rotulo: "Voltar", tipo: "neutro" }, { rotulo: "Enviar pedido", tipo: "perigo", icone: "alerta", fn: async () => {
      ui.marcarErro(fm, null);
      const d = ui.lerForm(fm);
      // plano 2000d · FX-070: «Outro motivo» pede o texto (senão quem cuida do plano recebe um pedido sem motivo)
      const errC = erroCancelamento(d);
      if (errC) { ui.marcarErro(fm, errC.campo, errC.texto); return false; }
      return api.rpcC("nx_cancelamento_pedir", { p_motivo: d.motivo, p_detalhe: String(d.faltou || "").trim() || null, p_pausar: !!d.pausar }).then(x => x || { ok: true, pausar: !!d.pausar });
    } }] });
    if (r) ui.toast(r.pausar ? `Pedido de pausa enviado${quem ? ` para a ${quem}` : ""}.` : `Pedido de cancelamento enviado${quem ? ` para a ${quem}` : ""}. Os dados ficam guardados.`, { tipo: "ok" });
  });
  return h("div", { class: "cartao cfg-cancelar-cartao" }, h("p", { class: "linha linha-entre" }, h("span", { class: "fraco" }, "Quer parar de usar? Conte o motivo: quem cuida do plano recebe o pedido."), b));
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
const ROT_STATUS = { ativo: ["Ativo", "ok"], teste: ["Em teste", "info"], suspenso: ["Suspenso", "aten"], cancelado: ["Cancelado", "ruim"],
  pendente: ["Pagamento pendente", "aten"] };      // plano 2000d · DU-164
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
    corpo.append(h("ul", { class: "cfg-ia-meses-lista" }, meses.map((x, i) => {
      // plano 2000d · FX-072: os meses fechados comparados com o anterior («+20 %») — só com os dois meses inteiros
      const ant = meses[i + 1];
      const v = i > 0 && ant && !x.parcial && !ant.parcial ? variacaoPct(x.chamadas, ant.chamadas) : null;
      return h("li", { class: "linha linha-entre" },
        h("span", null, x.rotulo, i === 0 ? h("small", { class: "fraco" }, " (até hoje)") : x.parcial ? h("small", { class: "fraco" }, " (só parte do mês)") : null),
        h("span", null, h("b", { class: "mono dado" }, `${ui.num(x.chamadas)} ${x.chamadas === 1 ? "chamada" : "chamadas"}`),
          v !== null && v !== 0 ? h("small", { class: "fraco cfg-ia-var" }, ` ${v > 0 ? "+" : "−"}${Math.abs(v)}% sobre ${ant.rotulo.split(" ")[0]}`) : null));
    })));
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
  const checkoutOk = typeof r.checkout_url === "string" && /^https:\/\//.test(r.checkout_url);      // plano 2000d · DU-162
  // plano 1500c · UCB-074: em teste o preço diz que nada é cobrado até o fim do teste
  const precoTxt = p.preco_mensal != null ? `${ui.brl(p.preco_mensal, { centavos: false })} por mês` : null;
  const subPreco = emTeste && r.teste_ate && r.teste_ate >= hoje
    ? `Grátis até ${ui.dataBR(r.teste_ate)}${precoTxt ? ` · depois ${precoTxt}` : ""}`
    : precoTxt || textoSemPreco(quem);      // plano 2000d · DU-170: com quem o valor foi combinado (a revenda)
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
        // plano 2000d · DU-162: com checkout da revenda configurado (r.checkout_url, https), «Assinar agora» paga pelo próprio app
        checkoutOk ? h("a", { class: "bt bt-prim cfg-assinar", href: r.checkout_url, target: "_blank", rel: "noopener noreferrer" }, ui.icone("cartao"), emTeste ? "Assinar agora" : "Pagar agora") : null,
        wa ? h("a", { class: ["bt", checkoutOk ? "bt-sec" : "bt-prim", "cfg-quero-aumentar"], href: ui.linkWhatsApp(pedido, wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), rotuloPedido)
          : bQueroAumentar,
        wa ? h("a", { class: "bt bt-sec", href: ui.linkWhatsApp(`Olá! Quero falar sobre o plano da ${nomeCli}.`, wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Falar com o suporte") : null)));
  // plano 1500c · UCB-075: suspensa, cancelada ou teste encerrado — o que parou e o caminho de volta
  const st = avisoStatusPlano(r.status, r.teste_ate, hoje, { regularizarAte: r.regularizar_ate || null });      // plano 2000d · DU-164
  const avisoSt = st ? h("div", { class: ["aviso", st.tom === "ruim" ? "aviso-ruim" : "aviso-aten", "cfg-plano-status"], role: "status" }, ui.icone("alerta"),
    h("p", null, st.texto, wa ? " " : "", wa ? h("a", { href: ui.linkWhatsApp(pedido, wa), target: "_blank", rel: "noopener noreferrer" }, "Falar com o suporte") : null,
      // DU-164: pagamento pendente com checkout → «Pagar agora» no próprio aviso
      r.status === "pendente" && checkoutOk ? h("a", { class: "bt bt-prim bt-p cfg-pagar", href: r.checkout_url, target: "_blank", rel: "noopener noreferrer" }, "Pagar agora") : null)) : null;
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
      // plano 2000d · DU-169: perto de passar, um pacote avulso de IA só para este mês (não o plano inteiro)
      if (passa) {
        const txtPacote = textoPedidoPacoteIA({ cliente: nomeCli, quantidade: 500 });
        b.appendChild(wa ? h("a", { class: "bt bt-sec bt-p cfg-pacote-ia", href: ui.linkWhatsApp(txtPacote, wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Comprar +500 usos de IA neste mês")
          : h("button", { type: "button", class: "bt bt-sec bt-p cfg-pacote-ia", on: { click: () => ui.copiar(txtPacote, { aviso: "Pedido do pacote de IA copiado. Mande para quem cuida do seu plano." }) } }, ui.icone("copiar"), "Pedir +500 usos de IA neste mês"));
      }
    }
    // plano 2000d · DU-168: quando a cota de IA zera
    if (k === "ia_mes" && lim !== 0) b.appendChild(h("small", { class: "uso-det cfg-ia-renova" }, textoRenovacaoIA(hoje)));
    // plano 2000d · FX-071: quanto sobra (ou passou) em palavras — a barra sozinha não diz o número
    const sobra = lim !== 0 ? sobraLimite(r.uso ? r.uso[k] : 0, lim) : null;
    if (sobra) b.appendChild(h("small", { class: ["uso-det", "cfg-uso-sobra", /acima|No limite/.test(sobra) && "cfg-uso-sobra-aten"] }, sobra));
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
  // plano 2000d · DU-167: por preço, com o selo «Mais escolhido» no plano que a revenda destacou
  const outros = ordenarPlanosComparar(Array.isArray(r.planos_disponiveis) ? r.planos_disponiveis.filter(x => x && x.nome) : []);
  const cartaoComparar = outros.length > 1 || (outros.length === 1 && outros[0].nome !== p.nome) ? h("div", { class: "cartao cfg-comparar" },
    h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Comparar planos"), h("p", { class: "sub" }, "O que cada plano libera em relação ao seu."))),
    h("div", { class: "cfg-comparar-grade" }, outros.map(x => {
      const atual = x.nome === p.nome || (x.id && x.id === p.id);
      const dif = atual ? [] : diferencasPlanoTexto({ limites: r.limites || p.limites || {}, modulos: r.modulos || [] }, x);
      const txt = textoPedidoAumento({ plano: x.nome, cliente: nomeCli, teste: emTeste, testeAte: r.teste_ate || "" });
      return h("article", { class: ["cfg-comparar-it", atual && "atual"], "aria-current": atual ? "true" : null },
        h("b", null, x.nome, atual ? " (o seu)" : ""), x.destaque === true ? ui.pilula("Mais escolhido", "prim", { class: "cfg-comparar-selo" }) : null,
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
      // plano 2000d · DU-166: com limite de mídia no plano, a barra (e o caminho para os arquivos grandes, quando o servidor diz onde)
      r.limites && Number(r.limites.storage_mb) > 0
        ? h("div", { class: "plano-storage-barra" }, ui.barraUso(`Mídia guardada (${formatarArmazenamento(r.storage_mb)} de ${formatarArmazenamento(r.limites.storage_mb)})`, Math.round(Number(r.storage_mb) || 0), Number(r.limites.storage_mb)),
          // plano 2000d · FX-073: perto de encher (90 %), avisa o que acontece
          midiaQuaseCheia(r.storage_mb, r.limites.storage_mb) ? h("small", { class: "uso-det cfg-uso-sobra-aten cfg-midia-cheia" }, "Quase cheio: quando encher, fotos e áudios novos deixam de ser guardados. Apague arquivos grandes ou peça mais espaço.") : null,
          typeof r.arquivos_grandes_href === "string" && r.arquivos_grandes_href.startsWith("#/") ? h("a", { class: "cfg-uso-ir", href: r.arquivos_grandes_href }, "Ver arquivos grandes", ui.icone("seta-dir")) : null)
        : h("p", { class: "fraco plano-storage" }, ui.icone("clipe"), `Mídia guardada: ${formatarArmazenamento(r.storage_mb)}`)),
    cartaoComparar,
    cartaoFaturas(ctx),
    // plano 2000d · DU-165: cancelar pelo app com 3 perguntas e oferta de pausa (só com o servidor que anuncia r.pode_cancelar)
    r.pode_cancelar === true ? cartaoCancelar(ctx, { nomeCli, quem }) : null,
    historicoIA(ctx),
    agencia ? h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Sua agência"),
      h("p", { class: "sub" }, "Soma de todos os clientes da revenda."))),
      h("div", { class: "adm-uso" }, agencia.map(x => ui.barraUso(x.rotulo, x.uso, x.limite)))) : null].filter(Boolean));
}
