/* ============================================================
   ÓRBITA — admin.js · frente F3 · ESPEC T15 (§7.7), §5.2
   #/admin/clientes (lista, criar), #/admin/clientes/<id> (plano,
   status, teste, módulos, limites extras, uso, usuários, convite do
   administrador, Entrar). P0-B: #/admin/revendas, #/admin/planos,
   #/admin/dominios (super / gestor), atrás de pronto('admin_revendas').
   Só gestor (revenda) e super (plataforma) chegam aqui (rotas.js).
   ============================================================ */

const STATUS = [
  { valor: "ativo", rotulo: "Ativo", cor: "ok" },
  { valor: "teste", rotulo: "Em teste", cor: "info" },
  { valor: "suspenso", rotulo: "Suspenso", cor: "aten" },
  { valor: "cancelado", rotulo: "Cancelado", cor: "ruim" },
];
const MODULOS = [
  { valor: "crm", rotulo: "CRM" }, { valor: "conversas", rotulo: "Conversas" }, { valor: "relatorios", rotulo: "Relatórios" },
  { valor: "ads", rotulo: "Anúncios" }, { valor: "automacoes", rotulo: "Automações" }, { valor: "marca", rotulo: "Marca própria" },
];
const CHAVES_LIMITE = [
  { chave: "usuarios", rotulo: "Usuários" }, { chave: "canais", rotulo: "Números de WhatsApp" }, { chave: "funis", rotulo: "Funis" },
  { chave: "automacoes", rotulo: "Automações" }, { chave: "contatos", rotulo: "Contatos" }, { chave: "ia_mes", rotulo: "Sugestões de IA por mês", curto: "IA no mês" },
];
const VERTICAIS = [
  { valor: "odonto", rotulo: "Clínica odontológica" }, { valor: "oficina", rotulo: "Oficina mecânica" },
  { valor: "loja", rotulo: "Loja" }, { valor: "generico", rotulo: "Outro negócio" },
];

/** Pacotes comerciais Nexus. O plano de acesso ao Órbita continua sendo uma decisão técnica separada. */
export const PACOTES_COMERCIAIS = Object.freeze([
  Object.freeze({ id: "essencial", nome: "PLANO ESSENCIAL", mensalCentavos: 129478, integracaoCentavos: 88945,
    acesso: "essencial", itens: Object.freeze(["Site profissional", "5 a 10 posts por mês", "1 diária de gravação por mês", "Edição de vídeo", "Sistema de atendimento"]) }),
  Object.freeze({ id: "profissional", nome: "PLANO PROFISSIONAL", mensalCentavos: 187253, integracaoCentavos: 119289,
    acesso: "profissional", itens: Object.freeze(["Tudo do Essencial", "IA no atendimento", "10 a 15 posts por mês", "Sistema de atendimento e CRM", "Gestão de tráfego pago"]) }),
  Object.freeze({ id: "ultra", nome: "PLANO ULTRA", mensalCentavos: 228734, integracaoCentavos: 134457,
    acesso: "completo", itens: Object.freeze(["Tudo do Profissional", "15 a 20 posts por mês", "Edição completa de conteúdos", "CRM e IA no atendimento", "Sistema de atendimento", "Gestão de tráfego pago e sistema de gestão", "Mais 1 sistema completo à sua escolha"]) }),
]);

/** O formulário aceita qualquer segmento; só os modelos já existentes são reconhecidos automaticamente. */
export function verticalPorSegmento(segmento) {
  const s = String(segmento || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/odont|dentist|dent[aá]ria/.test(s)) return "odonto";
  if (/oficina|mecanic|autopeca|automot/.test(s)) return "oficina";
  if (/\bloja\b|varejo|comercio|e-commerce/.test(s)) return "loja";
  return "generico";
}

function campoPacoteComercial(ui, selecionado = null, { obrigatorio = false, comercial = null, pacotes = PACOTES_COMERCIAIS } = {}) {
  const h = ui.h;
  const radios = pacotes.map(p => {
    const salvo = comercial && comercial.pacote === p.id ? comercial : null;
    const mensal = Number.isInteger(salvo && salvo.mensal_centavos) ? salvo.mensal_centavos : p.mensalCentavos;
    const integracao = Number.isInteger(salvo && salvo.integracao_centavos) ? salvo.integracao_centavos : p.integracaoCentavos;
    // plano 2000d · DU-209: o radio diz nome e preço numa frase; as inclusões vêm pelo aria-describedby (o leitor não lê tudo de uma vez)
    const idInc = `oferta-inc-${p.id}`;
    const radio = h("input", { type: "radio", name: "pacote_comercial", value: p.id, checked: selecionado === p.id, required: !!obrigatorio,
      "aria-label": rotuloRadioPacote(p.nome, ui.brl(mensal / 100), ui.brl(integracao / 100)), "aria-describedby": idInc });
    return h("label", { class: "oferta-card" }, radio,
      h("span", { class: "oferta-conteudo", "aria-hidden": "true" },
        h("span", { class: "oferta-cab" }, h("b", null, p.nome), h("span", { class: "oferta-preco" }, `${ui.brl(mensal / 100)}/mês`)),
        h("span", { class: "oferta-integracao" }, `${ui.brl(integracao / 100)} de integração · valor único`),
        h("span", { class: "oferta-inclusoes-tit" }, "Inclui")),
      h("span", { class: "oferta-inclusoes", id: idInc }, h("span", { class: "sr-only" }, "Inclui: "), p.itens.map(item => h("span", null, item))));
  });
  const erro = h("small", { class: "campo-erro", hidden: true });
  return h("fieldset", { class: "campo campo-ofertas", dataset: { campo: "pacote_comercial" } },
    h("legend", null, "Plano comercial", obrigatorio ? h("span", { class: "obrig", "aria-hidden": "true" }, " *") : null),
    h("div", { class: "ofertas-grade", role: "radiogroup", "aria-label": "Escolha um plano comercial" }, radios),
    h("small", { class: "campo-ajuda" }, TEXTO_AJUDA_PACOTE), erro);      // plano 2000d · DU-193: sem a marca da plataforma
}
/** plano 2000d · DU-193: a ajuda do pacote comercial, sem marca. */
export const TEXTO_AJUDA_PACOTE = "O pacote registra o escopo contratado. O acesso aos recursos segue a configuração técnica da empresa.";
/** plano 2000d · DU-209: «Plano Essencial, R$ 1.294,78 por mês, mais R$ 889,45 de integração». */
export function rotuloRadioPacote(nome, mensal, integracao) {
  const n = String(nome || "").toLowerCase().replace(/(^|\s)\p{L}/gu, c => c.toUpperCase());
  return `${n}, ${mensal} por mês${integracao ? `, mais ${integracao} de integração` : ""}`;
}

const comClasse = (el, cls) => { el.classList.add(cls); return el; };
function rotuloPacote(id) { return PACOTES_COMERCIAIS.find(p => p.id === id)?.nome || "Sem pacote comercial"; }

/** plano 1000 · AS-155: o endereço da lista com os filtros (?busca=&status=&org=) — sobrevive a abrir um cliente e voltar. */
export function hashClientes(filtro = {}) {
  const q = new URLSearchParams();
  if (filtro.busca) q.set("busca", filtro.busca);
  if (filtro.status) q.set("status", filtro.status);
  if (filtro.org_id) q.set("org", filtro.org_id);
  const t = q.toString();
  return t ? `#/admin/clientes?${t}` : "#/admin/clientes";
}

/** plano 1000 · AS-168: o nome do modelo que o segmento escrito vai aplicar («Clínica odontológica», «Outro negócio»…). */
export function rotuloModeloSegmento(segmento) {
  const v = verticalPorSegmento(segmento);
  return (VERTICAIS.find(x => x.valor === v) || { rotulo: "Outro negócio" }).rotulo;
}

/** Edição do cliente: o modelo (vertical) só é recalculado quando o segmento MUDOU — salvar outros dados não desfaz o modelo escolhido. */
export function verticalAoEditar(segmento, segmentoInicial, verticalAtual) {
  const norm = s => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!norm(segmento) || norm(segmento) === norm(segmentoInicial)) return verticalAtual;
  return verticalPorSegmento(segmento);
}

/**
 * plano 1000 · AS-161: trocar o plano não zera os módulos ligados à mão. Mantém os marcados que ainda valem (no plano novo; para a
 * plataforma, também os extras que ela ligou fora do plano antigo) e diz quais saíram.
 */
export function modulosAoTrocarPlano({ atuais = [], planoAntigo = [], planoNovo = [], superConta = false } = {}) {
  const novo = new Set(planoNovo);
  const marcados = new Set(planoNovo);
  for (const m of atuais) {
    const extra = !planoAntigo.includes(m);
    if (novo.has(m) || (superConta && extra)) marcados.add(m);
  }
  const lista = MODULOS.map(m => m.valor).filter(v => marcados.has(v));
  const sairam = atuais.filter(m => !marcados.has(m));
  return { marcados: lista, sairam };
}
/**
 * plano 2000d · DU-196: os módulos do cliente novo — pré-marcados pelo plano e editáveis no Novo cliente. A escolha da pessoa vale dentro
 * do plano (a revenda não liga módulo de fora; a plataforma pode); CRM e Conversas andam juntos. Sem escolha = todos os do plano.
 */
export function modulosIniciais(planoModulos = [], escolha = null, superConta = false) {
  if (!Array.isArray(escolha)) return MODULOS.map(m => m.valor).filter(v => planoModulos.includes(v));
  const ok = new Set(escolha.filter(v => superConta || planoModulos.includes(v)));
  if (ok.has("crm") || ok.has("conversas")) for (const v of ["crm", "conversas"]) if (superConta || planoModulos.includes(v)) ok.add(v);
  return MODULOS.map(m => m.valor).filter(v => ok.has(v));
}
/** plano 2000d · DU-198: o que o cliente vê — a marca da agência com o tema da empresa por cima (o mesmo cálculo do tema.js). */
export function marcaDoCliente(tema, cli) {
  const org = (cli && cli.org) || {};
  const marcaOrg = org.marca || {};
  const temaCli = (cli && (cli.tema || (cli.marca && typeof cli.marca === "object" ? cli.marca : null))) || {};
  if (tema && typeof tema.marcaEfetiva === "function") return tema.marcaEfetiva(marcaOrg, temaCli);
  return { produto: marcaOrg.produto || "", logo: temaCli.logo || marcaOrg.logo || null, cores: { ...(marcaOrg.cores || {}), ...(temaCli.cores || {}) } };
}

/** plano 1000b · UB-116: teto de espera pela config.css antes do 1º desenho (o mesmo ESPERA_CSS_MS do config.js). */
export const ESPERA_CSS_MS = 1500;
/** plano 1000b · UB-201: validade do convite do administrador — as mesmas opções do convite em Usuários (config.js), padrão 3 dias. */
export const DIAS_CONVITE_ADMIN = "3";
const OPCOES_VALIDADE_CONVITE = [["1", "1 dia"], ["3", "3 dias"], ["7", "7 dias"], ["14", "14 dias"], ["30", "30 dias (menos seguro)"]].map(([valor, rotulo]) => ({ valor, rotulo }));
/** plano 1000b · UB-225: linhas da lista de clientes por vez («Mostrar mais» acrescenta outras tantas). */
export const POR_PAGINA_CLIENTES = 50;
let _ultimoHashClientes = "#/admin/clientes";
let _planos = null;
let _orgs = null;
let _limpeza = [];

export function desmontar() { for (const f of _limpeza) try { f(); } catch { /* ok */ } _limpeza = []; }

function statusDe(v) { return STATUS.find(s => s.valor === v) || { rotulo: v, cor: "neutra" }; }
export function sugerirSlug(nome) {
  return String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
}

async function planos(ctx) { if (!_planos) _planos = await ctx.api.rpc("nx_planos_listar"); return _planos; }
async function orgs(ctx) { if (!_orgs) _orgs = await ctx.api.rpc("nx_orgs_listar"); return _orgs; }

/** Cliente usando 80 % ou mais de algum limite do plano. */
export const pertoDoLimite = it => { const u = (it && it.uso) || {}, lim = (it && it.limites) || {}; return Object.keys(lim).some(k => Number(lim[k]) > 0 && (Number(u[k]) || 0) / Number(lim[k]) >= .8); };

/** Resumo da lista de clientes (item 58): por situação e quantos estão perto de algum limite (≥ 80 %).
    plano 1000 · AS-164: «ativo» só conta quem não está pausado pela Nexus (ativo === false vira «pausados», à parte). */
export function resumoClientes(itens, hoje = null) {
  const l = Array.isArray(itens) ? itens : [];
  // plano 1500c · UCB-085: com `hoje`, também acabando7 (teste que termina em até 7 dias, hoje incluído), vencidos (fim já passado)
  // e sem_pacote (UCB-098) — sem `hoje` o resumo continua o de antes
  const r = { total: l.length, ativo: 0, teste: 0, suspenso: 0, cancelado: 0, perto_limite: 0 };
  if (hoje) Object.assign(r, { acabando7: 0, vencidos: 0, sem_pacote: 0 });
  for (const it of l) {
    if (it && it.ativo === false) r.pausados = (r.pausados || 0) + 1;     // só aparece quando há pausado
    if (it && Object.hasOwn(r, it.status) && ["ativo", "teste", "suspenso", "cancelado"].includes(it.status) && !(it.status === "ativo" && it.ativo === false)) r[it.status]++;
    if (pertoDoLimite(it)) r.perto_limite++;
    if (hoje && it && it.status === "teste") {
      const n = diasAteFimTeste(it.teste_ate, hoje);
      if (n !== null && n < 0) r.vencidos++; else if (n !== null && n <= 7) r.acabando7++;
    }
    if (hoje && semPacote(it)) r.sem_pacote++;
  }
  return r;
}

/** plano 1000 · AS-165: filtro local dos KPIs que não são uma situação («perto» do limite, «pausados»).
    `status` = a situação filtrada no servidor: «ativo» segue a régua do contador (resumoClientes) — pausado pela Nexus não é «Ativo». */
export function filtrarLocal(itens, local, status = "", hoje = _hojeDaLista) {
  let l = Array.isArray(itens) ? itens : [];
  if (status === "ativo") l = l.filter(it => !(it && it.ativo === false));
  if (local === "perto") return l.filter(pertoDoLimite);
  if (local === "pausados") return l.filter(it => it && it.ativo === false);
  // plano 1500c · UCB-085 / UC-021 / UCB-098: teste acabando (até 7 dias), teste vencido e sem pacote comercial
  const fim = it => (it && it.status === "teste" && hoje ? diasAteFimTeste(it.teste_ate, hoje) : null);
  if (local === "acabando") return l.filter(it => { const n = fim(it); return n !== null && n >= 0 && n <= 7; });
  if (local === "vencido") return l.filter(it => { const n = fim(it); return n !== null && n < 0; });
  if (local === "sem_pacote") return l.filter(semPacote);
  // plano 2000d · DU-184 / DU-188 / DU-402 / DU-405 / DU-191: pagamento atrasado, parados na ativação, automações com erro, em risco, etiqueta
  if (local === "atrasado") return l.filter(it => it && it.situacao_pagamento === "atrasado");
  if (local === "parados") return l.filter(it => hoje && paradoNaAtivacao(it, hoje));
  if (local === "auto_erro") return l.filter(it => it && Number(it.automacoes_erro) > 0);
  if (local === "risco") return l.filter(it => hoje && emRisco(it, hoje));
  if (typeof local === "string" && local.startsWith("etiqueta:")) {
    const e = local.slice(9).toLowerCase();
    return l.filter(it => etiquetasCliente(it).some(x => x.toLowerCase() === e));
  }
  return l;
}
/** plano 1500c · UCB-085: o «hoje» (São Paulo) da lista aberta — a tela de clientes grava ao montar; os testes passam o deles. */
let _hojeDaLista = null;
/** plano 1500c: o texto do chip de cada filtro local. */
export const ROTULO_FILTRO_LOCAL = Object.freeze({ perto: "Só quem está perto do limite", acabando: "Só o teste acabando (até 7 dias)",
  vencido: "Só o teste vencido", sem_pacote: "Só os sem pacote comercial",
  // plano 2000d · DU-184 / DU-188 / DU-402 / DU-405
  atrasado: "Só o pagamento atrasado", parados: "Só os parados na ativação", auto_erro: "Só com automações com erro", risco: "Só os em risco de cancelar" });
/** plano 2000d · DU-191: o chip do filtro (etiqueta inclusive). */
export const rotuloFiltroLocal = local => (typeof local === "string" && local.startsWith("etiqueta:") ? `Só a etiqueta «${local.slice(9)}»` : ROTULO_FILTRO_LOCAL[local] || null);

/** plano 1000 · AS-158: dias desde o fim do teste (só status «teste» com a data já passada); null quando não venceu. hoje = AAAA-MM-DD. */
export function testeVencidoHa(it, hoje) {
  if (!it || it.status !== "teste" || !it.teste_ate || !hoje || String(it.teste_ate) >= String(hoje)) return null;
  const d = (Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${String(it.teste_ate).slice(0, 10)}T12:00:00Z`)) / 86400000;
  return Number.isFinite(d) ? Math.max(1, Math.round(d)) : null;
}
export const rotuloTesteVencido = dias => (dias === 1 ? "Teste vencido há 1 dia" : `Teste vencido há ${dias} dias`);

/* ---------------------------------------------------------------- plano 1500c · lógica nova do Admin (frente config) */
const diaUTC = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
/** plano 1500c · UCB-084/UCB-088: dias até o fim do teste (0 = hoje; negativo = já passou), por datas de São Paulo; null sem data. */
export function diasAteFimTeste(testeAte, hoje) {
  const a = diaUTC(testeAte), b = diaUTC(hoje);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((a - b) / 86400000) : null;
}
/** plano 1500c · UCB-084: «acaba hoje» / «acaba em 2 dias» (≤ 3 dias, tom de atenção) para a coluna «Fim do teste»; null fora disso. */
export function rotuloFimTeste(it, hoje) {
  if (!it || it.status !== "teste") return null;
  const n = diasAteFimTeste(it.teste_ate, hoje);
  if (n === null || n < 0 || n > 3) return null;
  return { texto: n === 0 ? "acaba hoje" : n === 1 ? "acaba amanhã" : `acaba em ${n} dias`, tom: "aten" };
}
/** plano 1500c · UCB-087 / UC-022: mais N dias de teste, a partir do maior entre hoje e o fim atual. */
export function estenderTeste(testeAte, hoje, dias) {
  const base = /^\d{4}-\d{2}-\d{2}/.test(String(testeAte || "")) && String(testeAte).slice(0, 10) > String(hoje) ? String(testeAte).slice(0, 10) : String(hoje);
  return isoMais(base, Number(dias) || 0);
}
export const prorrogarTeste = estenderTeste;
/** plano 1500c · UCB-008: salvar «Em teste» com o fim já passado bloqueia o cliente na hora. */
export function testeNoPassado(status, testeAte, hoje) { return status === "teste" && !!testeAte && String(testeAte).slice(0, 10) < String(hoje); }
/** plano 1500c · UCB-009: plano sem nenhum limite preenchido (= tudo ilimitado). */
export function planoSemLimites(limites) { return !Object.values(limites || {}).some(v => v !== null && v !== undefined && v !== ""); }
/** plano 1500c · UCB-025: preço por mês válido (vazio = sob consulta). */
export function precoPlanoValido(v) { return v === null || v === undefined || v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0); }
/** plano 1500c · UCB-115: slug sem hífen no começo, no fim ou dobrado (2 a 40). */
export function slugValido(s) { return /^[a-z0-9](?:[a-z0-9]|-(?!-)){0,38}[a-z0-9]$/.test(String(s || "")); }
/** plano 1500c · UCB-001: a situação da revenda — «Cancelada» entra quando é a atual (senão o seletor caía em «Ativa» e reativava). */
export function opcoesStatusRevenda(statusAtual) {
  const l = [{ valor: "ativo", rotulo: "Ativa" }, { valor: "suspenso", rotulo: "Suspensa (os clientes da agência não entram)" }];
  if (statusAtual === "cancelado") l.push({ valor: "cancelado", rotulo: "Cancelada" });
  return l;
}
/** plano 1500c · UCB-004: as opções do plano padrão — o atual desligado continua, marcado «(desligado)» (salvar sem mexer não troca). */
export function opcoesPlanoPadrao(planos, atual) {
  const l = (Array.isArray(planos) ? planos : []).filter(p => p && p.ativo && p.id !== "interno").map(p => ({ valor: p.id, rotulo: p.nome }));
  if (atual && !l.some(o => o.valor === atual)) {
    const p = (Array.isArray(planos) ? planos : []).find(x => x && x.id === atual);
    l.unshift({ valor: atual, rotulo: `${p ? p.nome : atual} (desligado)` });
  }
  return l;
}
/**
 * plano 1500c · UCB-002: os pacotes comerciais (ESPEC §1.4) são da Nexus e valem só para a org plataforma. O gestor de uma revenda
 * (marca própria, preço próprio) escolhe o plano técnico. orgEscolhida = a org do novo cliente (super escolhe; gestor é a dele).
 */
export function pacoteObrigatorio(sessao, orgEscolhida = null) {
  const conta = (sessao && sessao.conta) || {};
  const org = orgEscolhida || (sessao && sessao.org) || null;
  if (conta.super) return !org || org.tipo !== "revenda";
  return !!org && org.tipo === "plataforma";
}
/**
 * plano 1500c · UCB-003: o plano de acesso do cliente novo. Com pacote, o do pacote; sem pacote (revenda), o escolhido ou o plano padrão
 * da org (o da revenda que o super escolheu, não «interno»); a plataforma sem revenda continua no «interno».
 */
export function planoDeAcessoNovo({ superConta = false, oferta = null, planoPadraoOrg = null, planos = [], orgEscolhida = null, escolhido = null } = {}) {
  const existe = id => !!id && (planos || []).some(p => p && p.id === id && (superConta || p.ativo !== false));
  if (escolhido && existe(escolhido)) return escolhido;
  if (oferta && !superConta) return oferta.acesso;
  if (superConta && (!orgEscolhida || orgEscolhida.tipo !== "revenda")) return "interno";
  const padrao = (orgEscolhida && orgEscolhida.limites && orgEscolhida.limites.plano_padrao) || planoPadraoOrg;
  if (existe(padrao)) return padrao;
  if (existe("essencial")) return "essencial";
  const p = (planos || []).find(x => x && x.ativo !== false && x.id !== "interno");
  return p ? p.id : null;
}
/** plano 1500c · UCB-005: quem pausa o cliente, dito sem a marca da plataforma para a revenda (white-label). */
// plano 2000d · DU-195: «pela plataforma» para todos — o CSV e as telas do super também saem sem a marca (são repassados à revenda)
export function quemPausa(superConta) { void superConta; return "pela plataforma"; }
/** plano 1500c · UCB-086: receita mensal da carteira — preço do plano dos ativos não pausados (teste não entra). */
export function mrrClientes(itens, planos) {
  const preco = new Map((Array.isArray(planos) ? planos : []).map(p => [p && p.id, Number(p && p.preco_mensal) || 0]));
  // plano 2000d · DU-182: o valor combinado com o cliente (comercial.valor_mensal) vale mais que o preço de tabela do plano
  return (Array.isArray(itens) ? itens : []).reduce((s, it) => s + (it && it.status === "ativo" && it.ativo !== false ? (valorCobrado(it) ?? (preco.get(it.plano) || 0)) : 0), 0);
}
/** plano 1500c · UCB-097: o nome do CSV diz o filtro (situação e filtro local). */
export function nomeCsvClientes(filtro = {}, hoje = "") {
  const partes = ["clientes", filtro.status, filtro.local === "perto" ? "perto-do-limite" : filtro.local === "sem_pacote" ? "sem-pacote" : filtro.local, hoje].filter(Boolean);
  return `${partes.join("-")}.csv`;
}
/** plano 1500c · UCB-127: a mensagem ao cliente cujo teste acaba (o produto é o nome da marca da revenda). */
export function textoAvisoTeste(cli, dias, produto = "sistema") {
  const quando = dias === null || dias === undefined ? "está acabando" : dias < 0 ? "terminou" : dias === 0 ? "termina hoje" : dias === 1 ? "termina amanhã" : `termina em ${dias} dias`;
  // plano 2000d · DU-185: com o responsável do cadastro, a mensagem chama pelo nome
  const resp = String((contatoCliente(cli).responsavel) || "").trim().split(/\s+/)[0];
  return `Olá${resp ? `, ${resp}` : ""}! Seu teste do ${produto} na ${(cli && cli.nome) || "sua empresa"} ${quando}. Quer continuar usando? Seus dados ficam guardados — me responda por aqui que eu deixo tudo pronto.`;
}
/** plano 1500c · UC-023: o follow-up para copiar (com o uso, quando houver). */
export function mensagemFollowupTeste(cli, hoje, produto = "sistema") {
  const n = diasAteFimTeste(cli && cli.teste_ate, hoje);
  const u = (cli && cli.uso) || {};
  const uso = [u.contatos ? `${u.contatos} contatos` : null, u.usuarios ? `${u.usuarios} ${u.usuarios === 1 ? "pessoa" : "pessoas"} na equipe` : null].filter(Boolean).join(" e ");
  return `${textoAvisoTeste(cli, n, produto)}${uso ? ` Até agora vocês já têm ${uso} no sistema.` : ""}`;
}
/**
 * plano 1500c · UC-032: o checklist da revenda nova (marca, WhatsApp de suporte, domínio opcional, primeiro cliente, primeiro acesso).
 * → [{id, rotulo, feito, opcional, href}]
 */
export function passosRevenda(marca, clientes, dominios, { linkTeste = null } = {}) {
  const m = marca || {}, cs = Array.isArray(clientes) ? clientes : [], ds = Array.isArray(dominios) ? dominios : [];
  return [
    { id: "marca", rotulo: "Logo e cores da sua marca", feito: !!(m.logo || m.logo_claro) && !!(m.cores && Object.keys(m.cores).length), href: "#/config/marca?de=org" },
    { id: "suporte", rotulo: "WhatsApp de suporte", feito: !!m.suporte_wa, href: "#/config/marca?de=org" },
    { id: "dominio", rotulo: "Domínio próprio (opcional)", feito: ds.some(d => d && d.status === "ativo"), opcional: true, href: "#/config/dominio" },
    { id: "cliente", rotulo: "Primeiro cliente criado", feito: cs.length > 0, href: "#/admin/clientes" },
    { id: "acesso", rotulo: "Primeiro cliente com a equipe entrando", feito: cs.some(c => c && c.uso && Number(c.uso.usuarios) > 0), href: "#/admin/clientes" },
    // plano 2000d · DU-202: teste grátis pelo site da agência (opcional) — o link para divulgar vai junto
    { id: "teste_gratis", rotulo: "Teste grátis pelo seu site", feito: m.teste_aberto === true, opcional: true, href: "#/config/marca?de=org&campo=teste_aberto", link: linkTeste },
  ];
}
/** plano 2000d · DU-202: o link público do teste grátis da agência (/app/?org=slug#/testar), com o domínio ativo quando houver. */
export function linkTesteGratis(origem, slugOrg, dominioAtivo = null) {
  if (dominioAtivo) return `https://${String(dominioAtivo).trim().toLowerCase().replace(/\/+$/, "")}/app/#/testar`;
  return slugOrg ? `${String(origem || "").replace(/\/+$/, "")}/app/?org=${encodeURIComponent(slugOrg)}#/testar` : null;
}

/* ---------------------------------------------------------------- plano 2000d · lógica nova do Admin (frente config) */
/**
 * plano 2000d: recurso que depende de função nova do servidor só aparece quando a sessão diz que ele existe (sessao.recursos = ["…"]).
 * Servidor de hoje não manda a lista → nada aparece (nenhum botão que só daria erro). Nomes: planos_revenda, pausa_agencia,
 * cliente_modelo, arquivar_testes, transferir_cliente, exportar_cliente, papeis_revenda.
 */
export function temRecurso(sessao, nome) { return !!(sessao && Array.isArray(sessao.recursos) && sessao.recursos.includes(nome)); }
/** plano 2000d · DU-182/185/191: as chaves de `comercial` que foram enviadas e a resposta não trouxe de volta (servidor que ainda não guarda). */
export function chavesNaoGuardadas(enviado, resposta, chaves) {
  const e = enviado || {}, r = (resposta && resposta.comercial) || {};
  return chaves.filter(k => e[k] !== undefined && e[k] !== null && e[k] !== "" && !(Array.isArray(e[k]) && !e[k].length) && !(k in r));
}
export const ROTULO_CHAVE_COMERCIAL = Object.freeze({ valor_mensal: "valor cobrado", dia_vencimento: "dia de vencimento", contato: "contato do cliente", etiquetas: "etiquetas" });
const semFuncaoAdm =e => /pgrst202|could not find the function|http_404|funcao_invalida/i.test(String((e && (e.codigo || e.message)) || ""));
/** plano 2000d · DU-182: o valor mensal que a revenda cobra de fato (comercial.valor_mensal, em reais) — null quando não registrado. */
export function valorCobrado(it) {
  const v = it && it.comercial ? it.comercial.valor_mensal : null;
  return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
}
/** DU-182: dia de vencimento 1–28 (ou null). */
export const diaVencimentoValido = v => { const n = Number(v); return v === "" || v === null || v === undefined ? null : Number.isInteger(n) && n >= 1 && n <= 28 ? n : NaN; };

/** plano 2000d · DU-184: situação do pagamento do cliente (quando há cobrança): em_dia / atrasado / sem_cobranca → rótulo e tom. */
export function rotuloPagamento(sit) {
  return ({ em_dia: ["Em dia", "ok"], atrasado: ["Atrasado", "ruim"], pendente: ["Vence logo", "aten"], sem_cobranca: ["Sem cobrança", "neutra"] })[sit] || null;
}

/** plano 2000d · DU-185: CPF ou CNPJ com dígitos verificadores. → "cpf" | "cnpj" | null (inválido) ; vazio → "" */
export function tipoDocumento(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (/^(\d)\1+$/.test(d)) return null;
  if (d.length === 11) {
    const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]) ? "cpf" : null;
  }
  if (d.length === 14) {
    const dv = n => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * pesos[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]) ? "cnpj" : null;
  }
  return null;
}
/** DU-185: «12.345.678/0001-95» / «123.456.789-09». */
export function formatarDocumento(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return String(v ?? "");
}
/** DU-185: o contato do cliente guardado (comercial.contato). */
/** DU-185: o bloco «Contato do cliente» do formulário (ct_*) → {valor: {…}|null, erro: {campo, msg}|null}. Vazio = null (nada a guardar). */
export function lerContato(d = {}) {
  const t = k => String(d[`ct_${k}`] ?? "").trim();
  const v = { responsavel: t("responsavel"), whatsapp: t("whatsapp").replace(/[^\d+]/g, ""), email: t("email").toLowerCase(), documento: t("documento").replace(/\D/g, "") };
  if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return { valor: null, erro: { campo: "ct_email", msg: "Esse e-mail não parece válido." } };
  if (v.whatsapp && v.whatsapp.replace(/\D/g, "").length < 10) return { valor: null, erro: { campo: "ct_whatsapp", msg: "Use o número com DDD." } };
  if (v.documento && !tipoDocumento(v.documento)) return { valor: null, erro: { campo: "ct_documento", msg: "CPF ou CNPJ inválido (confira os dígitos)." } };
  const limpo = Object.fromEntries(Object.entries(v).filter(([, x]) => x));
  return { valor: Object.keys(limpo).length ? limpo : null, erro: null };
}
export const contatoCliente = it =>(it && it.comercial && it.comercial.contato && typeof it.comercial.contato === "object" ? it.comercial.contato : {});

/** plano 2000d · DU-188: os 5 marcos de ativação (entrou, conectou número, 1ª conversa, 1ª automação, 1º relatório) → {feitos, total, marcos}. */
export function marcosAtivacao(it) {
  const u = (it && it.uso) || {}, a = (it && it.ativacao) || {};
  const sim = (k, alt) => (typeof a[k] === "boolean" ? a[k] : !!alt);
  const conectado = Array.isArray(it && it.canais) ? it.canais.some(c => c && c.estado === "conectado") : Number(u.canais) > 0;
  const marcos = [
    { id: "entrou", rotulo: "Equipe entrou", feito: sim("entrou", (it && it.ultimo_acesso) || Number(u.usuarios) > 0) },
    { id: "numero", rotulo: "Número conectado", feito: sim("numero", conectado) },
    { id: "conversa", rotulo: "Primeira conversa", feito: sim("conversa", Number(u.conversas) > 0 || Number(u.contatos) > 0) },
    { id: "automacao", rotulo: "Primeira automação", feito: sim("automacao", Number(u.automacoes) > 0) },
    { id: "relatorio", rotulo: "Primeiro relatório", feito: sim("relatorio", false) },
  ];
  return { feitos: marcos.filter(m => m.feito).length, total: marcos.length, marcos };
}
/** DU-188: criado há 5 dias ou mais e com menos de 2 marcos. */
export function paradoNaAtivacao(it, hoje) {
  const dias = diasAteFimTeste(hoje, String((it && it.criado_em) || "").slice(0, 10));
  return dias !== null && dias >= 5 && marcosAtivacao(it).feitos < 2;
}

/** plano 2000d · DU-191: as etiquetas do cliente (comercial.etiquetas) e todas as da lista. */
export const etiquetasCliente = it => (it && it.comercial && Array.isArray(it.comercial.etiquetas) ? it.comercial.etiquetas.map(String).filter(Boolean) : []);
export function todasEtiquetas(itens) { return [...new Set((Array.isArray(itens) ? itens : []).flatMap(etiquetasCliente))].sort((a, b) => a.localeCompare(b, "pt-BR")); }
/** «clínicas, Taubaté ,clínicas» → ["clínicas", "Taubaté"] (até 10, 30 letras cada). */
export function separarEtiquetas(texto) {
  const vistas = new Set(), out = [];
  for (const p of String(texto || "").split(/[,;\n]+/).map(x => x.trim().slice(0, 30)).filter(Boolean)) { const k = p.toLowerCase(); if (!vistas.has(k)) { vistas.add(k); out.push(p); } }
  return out.slice(0, 10);
}

/** plano 2000d · DU-201: «usado: 7 de 10» ao lado de cada limite da agência. */
export function rotuloUsoLimite(uso, limite) {
  const u = Math.max(0, Number(uso) || 0);
  return limite === null || limite === undefined || limite === "" ? `usado: ${u} (sem limite)` : `usado: ${u} de ${limite}`;
}

/** plano 2000d · DU-203: os dois tons da mensagem de fim de teste (próximo / formal). */
export function mensagemFollowupTesteTom(cli, hoje, produto = "sistema", tom = "proximo") {
  if (tom !== "formal") return mensagemFollowupTeste(cli, hoje, produto);
  const n = diasAteFimTeste(cli && cli.teste_ate, hoje);
  const quando = n === null ? "está chegando ao fim" : n < 0 ? "foi encerrado" : n === 0 ? "termina hoje" : n === 1 ? "termina amanhã" : `termina em ${n} dias`;
  const resp = contatoCliente(cli).responsavel;
  return `${resp ? `Prezado(a) ${String(resp).trim().split(/\s+/)[0]},` : "Prezados,"} o período de teste do ${produto} para a ${(cli && cli.nome) || "sua empresa"} ${quando}. Para dar continuidade sem perder os dados já cadastrados, basta responder a esta mensagem que providenciamos a contratação. Ficamos à disposição.`;
}

/** plano 2000d · DU-405: risco de cancelamento (0–100) com os motivos — uso parado, número caído, pagamento atrasado, teste vencido, automações com erro. */
export function riscoCliente(it, hoje, agora = Date.now()) {
  const motivos = [];
  let p = 0;
  const ult = Date.parse((it && it.ultimo_acesso) || "");
  const a = agora instanceof Date ? agora.getTime() : Number(agora);
  if (Number.isFinite(ult) && a - ult > 14 * 86400e3) { p += 35; motivos.push(`sem acesso há ${Math.floor((a - ult) / 86400e3)} dias`); }
  const e = estadoNumerosCliente(it && it.canais);
  if (e && e.caidos) { p += 25; motivos.push("número desconectado"); }
  if (it && it.situacao_pagamento === "atrasado") { p += 30; motivos.push("pagamento atrasado"); }
  if (testeVencidoHa(it, hoje)) { p += 20; motivos.push("teste vencido"); }
  if (it && Number(it.automacoes_erro) > 0) { p += 10; motivos.push("automações com erro"); }
  return { pontos: Math.min(100, p), motivos };
}
export const emRisco = (it, hoje, agora) => riscoCliente(it, hoje, agora).pontos >= 50;

/** plano 2000d · DU-428: o custo de IA no mês do cliente bem acima da média da carteira (2× ou mais, com média > 0). */
export function iaAcimaDaMedia(itens, it, chave = "ia_custo_mes") {
  const val = x => Number(x && (x[chave] ?? (x.uso && x.uso.ia_mes))) || 0;
  const l = (Array.isArray(itens) ? itens : []).filter(Boolean);
  if (l.length < 3) return false;
  const media = l.reduce((s, x) => s + val(x), 0) / l.length;
  return media > 0 && val(it) >= 2 * media;
}

/** plano 2000d · DU-427: os pacotes comerciais que a sessão vê — os do servidor (por org) quando vierem; os fixos só para a plataforma. */
export function pacotesDaSessao(sessao, doServidor = null) {
  if (Array.isArray(doServidor) && doServidor.length) return doServidor;
  const daPlataforma = !!(sessao && ((sessao.conta && sessao.conta.super) || (sessao.org && sessao.org.tipo === "plataforma")));
  return daPlataforma ? PACOTES_COMERCIAIS : [];
}

/** plano 2000d · DU-206: o papel do gestor na revenda (gestor = tudo; suporte sem preços; financeiro sem «Entrar»). */
export const papelRevenda = sessao => (sessao && sessao.conta && ["suporte", "financeiro"].includes(sessao.conta.papel_revenda) ? sessao.conta.papel_revenda : "gestor");
export const PAPEIS_REVENDA = Object.freeze([["gestor", "Gestor (tudo)"], ["suporte", "Suporte (entra nos clientes, sem preços)"], ["financeiro", "Financeiro (planos e cobrança)"]]);

/** plano 2000d · DU-210: o link que o cliente usa (?c=slug), com o domínio ativo da agência quando houver. */
export function linkEntradaCliente(origem, slug, dominioAtivo = null) {
  const base = dominioAtivo ? `https://${String(dominioAtivo).trim().toLowerCase().replace(/\/+$/, "")}` : String(origem || "").replace(/\/+$/, "");
  return slug ? `${base}/app/#/?c=${encodeURIComponent(slug)}` : `${base}/app/`;
}

/** plano 2000d · DU-189 / DU-426: escapa texto para o HTML gerado (relatório e proposta). */
const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const imgSegura = u => (typeof u === "string" && (/^data:image\/(png|jpeg|webp);base64,/.test(u) || /^https:\/\//.test(u)) ? u : null);
/** DU-189: o relatório do mês do cliente com a marca da revenda (HTML para imprimir/salvar em PDF) — nunca cita a plataforma. */
export function htmlRelatorioMes({ marca = {}, cliente = {}, mes = "", numeros = [] } = {}) {
  const logo = imgSegura(marca.logo_claro || marca.logo);
  const linhas = numeros.filter(x => x && x.rotulo && x.valor !== null && x.valor !== undefined).map(x => `<tr><th scope="row">${escHtml(x.rotulo)}</th><td>${escHtml(x.valor)}</td></tr>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(cliente.nome)} · ${escHtml(mes)}</title>`
    + `<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:black}header{display:flex;gap:16px;align-items:center}img{max-height:56px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:10px;border-bottom:1px solid gainsboro;text-align:left}td{text-align:right;font-variant-numeric:tabular-nums}footer{margin-top:24px;color:dimgray;font-size:13px}</style></head><body>`
    + `<header>${logo ? `<img src="${escHtml(logo)}" alt="${escHtml(marca.produto || "")}">` : ""}<div><h1>${escHtml(cliente.nome)}</h1><p>O que o ${escHtml(marca.produto || "sistema")} fez por você em ${escHtml(mes)}</p></div></header>`
    + `<table>${linhas || `<tr><td>Sem números neste período.</td></tr>`}</table><footer>${escHtml(marca.assinatura || marca.produto || "")}</footer></body></html>`;
}
/** DU-426: a proposta comercial para um prospect com os planos escolhidos, preços e validade — com a marca da revenda. */
export function htmlProposta({ marca = {}, prospect = "", planos = [], validade = "", observacao = "" } = {}) {
  const logo = imgSegura(marca.logo_claro || marca.logo);
  const brl = v => (v === null || v === undefined || v === "" ? "Sob consulta" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mês`);
  const cartoes = planos.map(p => `<section><h2>${escHtml(p.nome)}</h2><p class="preco">${escHtml(brl(p.preco_mensal))}</p>${Array.isArray(p.itens) && p.itens.length ? `<ul>${p.itens.map(i => `<li>${escHtml(i)}</li>`).join("")}</ul>` : ""}</section>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Proposta · ${escHtml(prospect)}</title>`
    + `<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:black}header{display:flex;gap:16px;align-items:center}img{max-height:56px}section{border:1px solid gainsboro;border-radius:12px;padding:16px;margin:12px 0}.preco{font-size:22px;font-weight:600}footer{margin-top:24px;color:dimgray;font-size:13px}</style></head><body>`
    + `<header>${logo ? `<img src="${escHtml(logo)}" alt="${escHtml(marca.produto || "")}">` : ""}<div><h1>Proposta para ${escHtml(prospect)}</h1><p>${escHtml(marca.produto || "")}</p></div></header>`
    + `${cartoes}${observacao ? `<p>${escHtml(observacao)}</p>` : ""}<footer>${validade ? `Proposta válida até ${escHtml(validade)}. ` : ""}${escHtml(marca.assinatura || "")}</footer></body></html>`;
}

/** plano 1000 · AS-166: CSV da lista de clientes (separador «;» e BOM para o Excel em português). */
export function csvClientes(itens, nomeDoPlano = id => id, { superConta = true, hoje = null } = {}) {
  // plano 1000b · UB-103: valor que começa com = + - @ (ou tab/CR) vira fórmula no Excel — sai com apóstrofo na frente (texto puro)
  const esc = v => { let s = v === null || v === undefined ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // plano 1500c · UCB-005: a revenda entrega este CSV ao cliente — sem a marca da plataforma e sem o pacote comercial da Nexus
  const cab = ["Cliente", "Endereço", "Revenda", "Plano", ...(superConta ? ["Pacote comercial"] : []), "Situação", `Pausado ${quemPausa(superConta)}`, "Fim do teste", "Criado em",
    ...CHAVES_LIMITE.flatMap(k => [`${k.rotulo} (uso)`, `${k.rotulo} (limite)`]),
    // plano 2000d · DU-406 / DU-182 / DU-185 / DU-191: valor cobrado, vencimento, dias de teste restantes, última atividade, contato e etiquetas
    "Valor mensal (R$)", "Dia de vencimento", "Dias de teste restantes", "Última atividade", "Responsável", "WhatsApp do responsável", "E-mail do responsável", "CPF/CNPJ", "Etiquetas"];
  const num2 = v => (v === null ? "" : Number(v).toFixed(2).replace(".", ","));
  const linhas = (Array.isArray(itens) ? itens : []).map(it => { const ct = contatoCliente(it); return [it.nome, it.slug, it.org ? it.org.nome : "", nomeDoPlano(it.plano),
    ...(superConta ? [it.comercial && it.comercial.pacote ? rotuloPacote(it.comercial.pacote) : ""] : []), statusDe(it.status).rotulo, it.ativo === false ? "sim" : "não",
    it.teste_ate || "", String(it.criado_em || "").slice(0, 10),
    ...CHAVES_LIMITE.flatMap(k => [it.uso && it.uso[k.chave] != null ? it.uso[k.chave] : "", it.limites && it.limites[k.chave] != null ? it.limites[k.chave] : "sem limite"]),
    num2(valorCobrado(it)), it.comercial && it.comercial.dia_vencimento ? it.comercial.dia_vencimento : "",
    it.status === "teste" && hoje ? (diasAteFimTeste(it.teste_ate, hoje) ?? "") : "", String(it.ultimo_acesso || "").slice(0, 10),
    ct.responsavel || "", ct.whatsapp || "", ct.email || "", ct.documento ? formatarDocumento(ct.documento) : "", etiquetasCliente(it).join(", ")]; });
  return "\uFEFF" + [cab, ...linhas].map(l => l.map(esc).join(";")).join("\r\n");
}

/** plano 1000 · AS-169: o endereço digitado já é de outro cliente? (a busca do servidor acha por trecho; aqui só o slug idêntico). */
export function slugTomado(itens, slug, idProprio = null) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return null;
  return (Array.isArray(itens) ? itens : []).find(it => it && it.id !== idProprio && String(it.slug || "").toLowerCase() === s) || null;
}

/** plano 1000 · AS-171: domínios por situação e busca (endereço, cliente ou revenda; sem acento). */
export function filtrarDominios(lista, { status = "", busca = "" } = {}) {
  const n = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = n(busca).trim();
  return (Array.isArray(lista) ? lista : []).filter(d => (!status || d.status === status)
    && (!q || n(`${d.host} ${d.cliente ? d.cliente.nome : ""} ${d.org ? d.org.nome : ""}`).includes(q)));
}

/** plano 1000 · AS-248: o «Entrar» guarda de onde veio (o detalhe do cliente) para o «Sair» da faixa de suporte voltar para lá. */
export const CHAVE_VOLTA_ADMIN = "nx-admin-volta";
export function lembrarVoltaAdmin(hash, armazenamento = globalThis.sessionStorage) {
  try { if (armazenamento && /^#\/admin\//.test(String(hash || ""))) { armazenamento.setItem(CHAVE_VOLTA_ADMIN, String(hash)); return true; } } catch { /* sem storage */ }
  return false;
}

/** nx_saude (só plataforma) → {ok, problemas[], pausaGeral, clientesPausados} para o cartão do Admin; null quando a resposta não é a esperada. */
export function resumoSaude(r) {
  if (!r || typeof r !== "object" || !Array.isArray(r.problemas)) return null;
  return { ok: !r.problemas.length, problemas: r.problemas.map(String).slice(0, 12), pausaGeral: r.envios_pausados === true,
    clientesPausados: Math.max(0, Number(r.clientes_pausados) || 0), em: r.em || null };
}
const semFuncao = e => /pgrst202|could not find the function|http_404|funcao_invalida/i.test(String((e && (e.codigo || e.message)) || ""));

/* ------------------------------------------------------------ plano 100 (frente G): uso de IA por dia, números, pacote, convite */

/**
 * nx_ia_uso_dia → [{dia, chamadas, tokens_in, tokens_out, custo_usd}] (mais antigo primeiro). Resumo para o Admin: totais, as séries
 * do sparkline e `custoIncompleto` (dia com chamada e custo zero = chamada registrada antes do custo existir; o total fica por baixo).
 * null quando a resposta não é a série (banco antigo).
 */
export function resumoUsoIA(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const linhas = [];
  for (const x of lista) {
    if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.dia || ""))) return null;
    const n = v => Math.max(0, Number(v) || 0);
    linhas.push({ dia: x.dia, chamadas: Math.floor(n(x.chamadas)), tokens_in: Math.floor(n(x.tokens_in)), tokens_out: Math.floor(n(x.tokens_out)), custo_usd: n(x.custo_usd) });
  }
  linhas.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  const soma = k => linhas.reduce((s, x) => s + x[k], 0);
  return { dias: linhas.length, linhas, chamadas: soma("chamadas"), tokens_in: soma("tokens_in"), tokens_out: soma("tokens_out"),
    custo_usd: Math.round(soma("custo_usd") * 1e4) / 1e4, serieChamadas: linhas.map(x => x.chamadas), serieCusto: linhas.map(x => x.custo_usd),
    custoIncompleto: linhas.some(x => x.chamadas > 0 && !(x.custo_usd > 0)) };
}

/** US$ com 2 casas (4 abaixo de 1 dólar: o custo por dia de IA costuma ser de centavos). */
export function dolar(v) {
  const n = Number(v) || 0;
  return `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 1 ? 4 : 2 })}`;
}

/**
 * Situação dos números de WhatsApp de um cliente (G10): `canais` do nx_clientes_admin quando vier; null quando o servidor não manda
 * (a coluna some). → {total, conectados, caidos, rotulo, tom}.
 */
export function estadoNumerosCliente(canais) {
  if (!Array.isArray(canais)) return null;
  const total = canais.length;
  const conectados = canais.filter(c => c && c.estado === "conectado").length;
  const caidos = canais.filter(c => c && c.estado === "desconectado").length;
  if (!total) return { total, conectados, caidos, rotulo: "Sem número", tom: "neutra" };
  if (caidos) return { total, conectados, caidos, rotulo: caidos === 1 ? "1 desconectado" : `${caidos} desconectados`, tom: "ruim" };
  if (conectados === total) return { total, conectados, caidos, rotulo: total === 1 ? "Conectado" : `${total} conectados`, tom: "ok" };
  return { total, conectados, caidos, rotulo: "Sem confirmação", tom: "neutra" };
}

/** Cliente sem pacote comercial registrado (criado pelo painel clássico ou antes das ofertas): pílula «Sem pacote» e aviso para completar. */
export const semPacote = it => !!it && !(it.comercial && it.comercial.pacote);

/** O app pode ser servido deste host? (Netlify ou domínio próprio sim; GitHub Pages, localhost e .test/.localhost não.) */
export function hostServeApp(host) {
  const x = String(host || "").toLowerCase();
  if (/\.netlify\.app$/.test(x)) return true;
  return x.includes(".") && !/(^|\.)github\.io$/.test(x) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(x) && !/\.(localhost|test)$/.test(x);
}

/**
 * Link de convite seguro (H305): o servidor manda absoluto quando tem o endereço do Órbita (saas_url/domínio); relativo («#/convite/…»)
 * vira absoluto com o endereço desta tela SÓ se ela estiver num host que serve o app. Senão → {link:null, motivo}: o link sairia quebrado.
 */
export function linkConvite(link, loc, { superConta = true } = {}) {
  const l = String(link || "");
  if (/^https?:\/\//i.test(l)) return { link: l, motivo: null };
  if (!l.startsWith("#")) return { link: null, motivo: "O servidor não devolveu um link de convite válido." };
  const host = loc && loc.hostname;
  // plano 2000d · DU-194: «Órbita» só para a plataforma; a revenda lê «o app da sua marca»
  if (!hostServeApp(host)) return { link: null, motivo: superConta
    ? `Esta tela está aberta em ${host || "um endereço local"}, que não abre o Órbita para o cliente, e a plataforma ainda não tem o «Endereço do Órbita» cadastrado: o link sairia quebrado. Abra o Admin pelo endereço oficial (ou cadastre o endereço do Órbita) e gere o convite de novo — este expira sozinho.`
    : `Esta tela está aberta em ${host || "um endereço local"}, que não abre o app da sua marca para o cliente: o link sairia quebrado. Abra o Admin pelo endereço do app da sua marca e gere o convite de novo — este expira sozinho.` };
  return { link: new URL("./", loc.href).href.split("#")[0] + l, motivo: null };
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, texto = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  if (texto !== null) el.appendChild(document.createTextNode(String(texto)));
  return el;
}

/** Anel de uso (role=meter): uso ÷ limite, com cor por faixa; sem limite mostra só o número. Usado no uso de IA do cliente. */
export function anelUso(ui, { uso, limite, rotulo = "Uso" } = {}) {
  const h = ui.h;
  const u = Math.max(0, Number(uso) || 0);
  const semLimite = limite === null || limite === undefined || !(Number(limite) > 0);
  const p = semLimite ? 0 : Math.min(100, Math.round((u / Number(limite)) * 100));
  const r = 44, C = 2 * Math.PI * r;
  const nivel = semLimite ? "neutra" : p >= 100 ? "ruim" : p >= 80 ? "aten" : "ok";
  const txt = semLimite ? `${ui.num(u)} · sem limite` : `${ui.num(u)} de ${ui.num(limite)} (${p}%)`;
  const svg = svgEl("svg", { class: `adm-anel adm-anel-${nivel}`, viewBox: "0 0 112 112", role: "meter", "aria-valuemin": "0",
    "aria-valuemax": String(semLimite ? Math.max(u, 1) : Number(limite)), "aria-valuenow": String(u), "aria-label": rotulo, "aria-valuetext": txt });
  svg.appendChild(svgEl("circle", { class: "adm-anel-trilho", cx: 56, cy: 56, r, fill: "none", "stroke-width": 10 }));
  svg.appendChild(svgEl("circle", { class: "adm-anel-arco", cx: 56, cy: 56, r, fill: "none", "stroke-width": 10, "stroke-linecap": "round",
    "stroke-dasharray": C.toFixed(1), "stroke-dashoffset": (C * (1 - (semLimite ? 1 : p / 100))).toFixed(1), transform: "rotate(-90 56 56)" }));
  svg.appendChild(svgEl("text", { class: "adm-anel-num", x: 56, y: 53, "text-anchor": "middle" }, semLimite ? ui.num(u) : `${p}%`));
  svg.appendChild(svgEl("text", { class: "adm-anel-sub", x: 56, y: 71, "text-anchor": "middle" }, semLimite ? "sem limite" : "do limite"));
  return h("div", { class: "adm-anel-caixa" }, svg, h("div", { class: "adm-anel-txt" }, h("b", null, rotulo), h("span", null, txt)));
}

export async function montar(ctx) {
  desmontar();
  _planos = null; _orgs = null;
  const aba = ctx.rota.partes[0] || "clientes";
  const id = ctx.rota.partes[1] || null;
  const { ui } = ctx;
  const h = ui.h;
  // plano 1000b · UB-116: a folha config.css chega ANTES do 1º desenho (sem o salto de layout da lista), com o mesmo teto do config.js
  const css = Promise.resolve(typeof ui.carregarCss === "function" ? ui.carregarCss("config") : true).catch(() => false);
  let relogioCss = null;
  await Promise.race([css, new Promise(r => { relogioCss = setTimeout(r, ESPERA_CSS_MS); })]).finally(() => clearTimeout(relogioCss));
  const superConta = !!ctx.sessao.conta.super;
  const extras = ctx.pronto("admin_revendas");
  const abas = [
    { id: "clientes", rotulo: "Clientes", icone: "empresa" },
    ...(extras && superConta ? [{ id: "revendas", rotulo: "Revendas", icone: "camadas" }] : []),
    // plano 2000d · DU-181: a revenda cria os próprios planos quando o servidor tem planos por agência (sessao.recursos «planos_revenda»);
    // DU-206: o papel «suporte» da revenda não vê preços
    ...(extras && (superConta || (temRecurso(ctx.sessao, "planos_revenda") && papelRevenda(ctx.sessao) !== "suporte")) ? [{ id: "planos", rotulo: "Planos", icone: "cartao" }] : []),
    ...(extras ? [{ id: "dominios", rotulo: "Domínios", icone: "globo" }] : []),
  ];
  if (!abas.some(a => a.id === aba)) { ctx.navegar("#/admin/clientes", { substituir: true }); return; }

  const nav = ui.abas({ itens: abas, ativo: aba, rotulo: "Áreas do Admin", aoMudar: a => ctx.navegar(`#/admin/${a}`) });
  const corpo = h("div", { class: "pilha" });
  ui.limpar(ctx.alvo);
  if (id) {
    // detalhe: só o caminho de volta; o cartão do cliente faz o papel de título
    ctx.alvo.append(h("a", { class: "voltar-link adm-voltar", href: _ultimoHashClientes }, ui.icone("seta-esq"), "Clientes"), corpo);
    return telaCliente(ctx, corpo, id);
  }
  ctx.alvo.append(
    h("header", { class: "cab-pag" }, h("div", null,
      h("p", { class: "rotulo" }, `Admin · ${ctx.sessao.org ? ctx.sessao.org.nome : ""}${superConta ? " · plataforma" : ""}`),
      h("h1", { class: "titulo-pag" }, { clientes: "Clientes", revendas: "Revendas", planos: "Planos", dominios: "Domínios" }[aba]),
      h("p", { class: "sub" }, {
        clientes: "Crie clientes, acompanhe o uso de cada um e entre no ambiente deles como suporte.",
        revendas: "Agências que revendem com a própria marca, com limites somados de todos os clientes delas.",
        planos: "Preço, limites e módulos de cada plano. Mudar aqui vale na hora, sem publicar nada.",
        dominios: "Endereços próprios das revendas e dos clientes. Depois do CNAME, a plataforma ativa o domínio.",
      }[aba])),
    abas.length > 1 ? nav.el : null),
    corpo);

  if (aba === "clientes") return telaClientes(ctx, corpo);
  if (typeof EXTRAS[aba] === "function") return EXTRAS[aba](ctx, corpo);
}

/* ============================================================
   LISTA DE CLIENTES
   ============================================================ */
async function telaClientes(ctx, corpo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Clientes");
  const superConta = !!ctx.sessao.conta.super;
  const filtro = { busca: ctx.rota.query.busca || "", status: ctx.rota.query.status || "", org_id: ctx.rota.query.org || "", local: "" };
  // plano 1000 · AS-155: cada mudança de filtro vai para o endereço (replaceState: sem entrada nova no histórico nem nova montagem)
  const gravarFiltro = () => {
    _ultimoHashClientes = hashClientes(filtro);
    try { if (typeof history !== "undefined" && history.replaceState && typeof location !== "undefined" && location.hash !== _ultimoHashClientes) history.replaceState(history.state, "", _ultimoHashClientes); } catch { /* sem histórico: só o link de voltar lembra */ }
  };
  _ultimoHashClientes = hashClientes(filtro);

  const busca = h("input", { type: "search", value: filtro.busca, placeholder: "Buscar por nome ou endereço", "aria-label": "Buscar cliente" });
  // filtro de situação como segmentado com contagem (item 58); as contagens vêm da lista sem filtro de situação
  const segStatus = ui.segmentado({ tipo: "filtro", rotulo: "Filtrar por situação", classe: "adm-seg-status", valor: filtro.status || "",
    opcoes: [{ valor: "", rotulo: "Todas" }, ...STATUS.map(s => ({ valor: s.valor, rotulo: s.rotulo }))],
    aoMudar: v => { filtro.status = v; gravarFiltro(); carregar(); } });
  // plano 1500c · UCB-096: «revenda», não «org» (jargão)
  const selOrg = superConta ? h("select", { class: "sel", "aria-label": "Filtrar por revenda" }, h("option", { value: "" }, "Todas as revendas")) : null;
  // plano 1500c · UCB-117: o texto visível diz a ação inteira (no celular fica só o ícone, com o nome acessível)
  const novo = h("button", { type: "button", class: "bt bt-prim adm-novo" }, ui.icone("mais"), h("span", { class: "adm-novo-rot" }, "Novo cliente"));
  novo.setAttribute("aria-label", "Novo cliente");
  // plano 1000 · AS-166: a lista que está na tela (com os filtros) vira CSV para a cobrança e o relatório da revenda
  const btCsv = h("button", { type: "button", class: "bt bt-fant adm-csv" }, ui.icone("baixar"), "Exportar CSV");
  // plano 2000d · DU-426: proposta comercial com os planos e a marca da agência (página para imprimir ou salvar em PDF)
  const btProposta = papelRevenda(ctx.sessao) === "suporte" ? null : h("button", { type: "button", class: "bt bt-fant adm-proposta" }, ui.icone("folha"), "Gerar proposta");
  if (btProposta) btProposta.addEventListener("click", () => gerarProposta(ctx));
  // plano 2000d · DU-191: filtro por etiqueta (só aparece quando algum cliente tem etiqueta)
  const selEtiqueta = h("select", { class: "sel adm-sel-etiqueta", "aria-label": "Filtrar por etiqueta", hidden: true }, h("option", { value: "" }, "Todas as etiquetas"));
  selEtiqueta.addEventListener("change", () => { filtro.local = selEtiqueta.value ? `etiqueta:${selEtiqueta.value}` : ""; carregar(); });
  const segStatusEl = segStatus && segStatus.nodeType ? segStatus : segStatus.el;     // ui.segmentado devolve o elemento (ou {el}, nas versões anteriores)
  const faixa = h("div", { class: "adm-kpis", role: "group", "aria-label": "Resumo dos clientes", hidden: true });
  const chipLocal = h("p", { class: "linha adm-filtro-local", hidden: true });
  const saude = superConta ? h("div", { class: "adm-saude", hidden: true }) : null;
  const lista = h("div", { class: "adm-lista-clientes" });      // plano 2000d · DU-344: as linhas usam content-visibility (config.css)
  // plano 2000d · DU-187: a agência tem a própria pausa de emergência (só os clientes dela), quando o servidor tiver
  const pausaAgencia = !superConta && ctx.sessao.org && temRecurso(ctx.sessao, "pausa_agencia") ? h("div", { class: "adm-saude adm-pausa-agencia", hidden: true }) : null;
  corpo.append(...[saude, pausaAgencia, faixa, h("div", { class: "adm-filtros" }, h("label", { class: "busca" }, ui.icone("busca"), busca), segStatusEl, selOrg, selEtiqueta, btCsv, btProposta, novo), chipLocal, lista].filter(Boolean));
  if (pausaAgencia) cartaoPausaAgencia(ctx, pausaAgencia);
  // AS-165: KPI que filtra — situação vai para o segmentado; «perto do limite» e «pausados» são filtro local (com chip removível)
  let ultimosItens = [];
  const kpi = typeof ui.kpi === "function"
    ? o => ui.kpi({ rotulo: o.rotulo, valor: o.valor, ajuda: o.ajuda, aoClicar: o.aoClicar || null })
    : o => h("div", { class: "adm-kpi", title: o.ajuda || null }, h("span", { class: "adm-kpi-rot" }, o.rotulo), h("span", { class: "adm-kpi-val mono dado" }, ui.num(o.valor)));
  function aplicarKpi({ status = "", local = "" }) {
    filtro.local = local;
    if (status !== undefined && filtro.status !== status) {
      filtro.status = status;
      if (typeof segStatus.ativar === "function") segStatus.ativar(status);
      gravarFiltro();
    }
    carregar();
  }
  function pintarChipLocal() {
    ui.limpar(chipLocal);
    chipLocal.hidden = !filtro.local;
    if (!filtro.local) return;
    const tirar = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("fechar"), "Tirar filtro");
    tirar.addEventListener("click", () => { filtro.local = ""; selEtiqueta.value = ""; carregar(); });
    // plano 1500c · UCB-005: «pausados pela plataforma» para a revenda; UCB-085/UCB-098: os chips novos
    // plano 2000d · DU-191: o chip da etiqueta
    chipLocal.append(ui.pilula(rotuloFiltroLocal(filtro.local) || `Só os pausados ${quemPausa(superConta)}`, "info"), tirar);
    // plano 2000d · DU-200: com o filtro «teste vencido», arquivar de uma vez os vencidos há mais de 60 dias (o CSV sai antes)
    if (filtro.local === "vencido" && temRecurso(ctx.sessao, "arquivar_testes")) {
      const velhos = ultimosItens.filter(it => (testeVencidoHa(it, hoje) || 0) > 60);
      if (velhos.length) {
        const bArq = h("button", { type: "button", class: "bt bt-sec bt-p adm-arquivar" }, ui.icone("baixar"), `Arquivar ${velhos.length} vencidos há +60 dias`);
        bArq.addEventListener("click", () => arquivarVencidos(velhos, bArq));
        chipLocal.append(bArq);
      }
    }
  }
  async function arquivarVencidos(alvos, botao) {
    if (!(await ui.confirmar({ titulo: `Arquivar ${alvos.length} ${alvos.length === 1 ? "cliente" : "clientes"}?`, rotulo: "Baixar e arquivar", perigo: true,
      texto: "Antes de arquivar, a lista sai em CSV. Os arquivados somem da lista padrão (ficam no filtro «Arquivados» do servidor) e a equipe deles não entra." }))) return;
    exportarCsv(alvos);
    let ok = 0; const falhas = [];
    await ui.carregando(botao, (async () => {
      for (const it of alvos) {
        try { await api.rpc("nx_cliente_arquivar", { p_cliente: it.id }); ok++; } catch (e) { falhas.push(`${it.nome}: ${api.mensagemErro(e)}`); }
      }
    })());
    ui.toast(falhas.length ? `${ok} arquivados; não deu em ${falhas.length}: ${falhas.join("; ")}` : `${ok} ${ok === 1 ? "cliente arquivado" : "clientes arquivados"}.`, { tipo: falhas.length ? "erro" : "ok" });
    carregar();
  }
  const exportarCsv = itens => {
    if (!itens.length) { ui.toast("Nenhum cliente na lista para exportar.", { tipo: "info" }); return; }
    // plano 1500c · UCB-097: o nome do arquivo diz o filtro; UCB-005: sem «Nexus» no CSV da revenda
    if (baixarArquivoTexto(csvClientes(itens, nomePlano, { superConta, hoje: ui.hojeSP() }), nomeCsvClientes(filtro, ui.hojeSP()), "text/csv")) ui.toast(`${itens.length} ${itens.length === 1 ? "cliente exportado" : "clientes exportados"}.`, { tipo: "ok" });
    else ui.toast("O navegador não deixou baixar o arquivo.", { tipo: "erro" });
  };
  btCsv.addEventListener("click", () => exportarCsv(ultimosItens));
  // nx_saude (20261013c, só plataforma): a saúde da operação no topo da lista; servidor antigo → o cartão nem aparece
  if (saude) cartaoSaude(ctx, saude);
  // plano 1500c · UC-032: o gestor de revenda vê «Deixe sua revenda pronta» no topo (até completar ou dispensar)
  // (pintado uma vez, com a lista completa que o resumo já trouxe — nenhuma chamada a mais de clientes)
  let passosEl = null;
  if (!superConta && ctx.sessao.org) { passosEl = h("div", { class: "adm-passos", hidden: true }); corpo.prepend(passosEl); }
  // o resumo é sempre da lista SEM situação nem busca (só a revenda do filtro): é o que dá as contagens do segmentado
  let resumoDaOrg = null, seqResumo = 0;          // de qual org_id ("" = todas) é o resumo pintado
  function pintarResumo(itens, orgId) {
    const r = resumoClientes(itens, hoje);
    resumoDaOrg = orgId;
    if (passosEl && !passosEl.dataset.feito) { passosEl.dataset.feito = "1"; cartaoPassosRevenda(ctx, passosEl, itens); }      // UC-032
    ui.limpar(faixa);
    const ajudaTotal = orgId ? "Todos os clientes da revenda escolhida no filtro." : superConta ? "Todos os clientes da plataforma." : "Todos os clientes desta revenda.";
    // plano 1500c · UCB-086: receita mensal pelos preços dos planos (ativos não pausados; teste fora)
    const mrr = mrrClientes(itens, _planos || []);
    faixa.append(...[
      kpi({ rotulo: "Clientes", valor: r.total, ajuda: ajudaTotal, aoClicar: () => aplicarKpi({ status: "", local: "" }) }),
      kpi({ rotulo: "Ativos", valor: r.ativo, ajuda: `Pagando e com acesso liberado (sem os pausados ${quemPausa(superConta)}).`, aoClicar: () => aplicarKpi({ status: "ativo", local: "" }) }),
      kpi({ rotulo: "Em teste", valor: r.teste, ajuda: "Período de avaliação (em andamento ou vencido).", aoClicar: () => aplicarKpi({ status: "teste", local: "" }) }),
      // plano 1500c · UCB-085 / UC-021: quem precisa de contato esta semana e quem já venceu
      r.acabando7 ? kpi({ rotulo: "Teste acabando", valor: r.acabando7, ajuda: "Teste que termina nos próximos 7 dias (hoje incluído): é a hora de converter.", aoClicar: () => aplicarKpi({ status: "", local: "acabando" }) }) : null,      // só quando há algum (a faixa não cresce à toa)
      r.vencidos ? kpi({ rotulo: "Teste vencido", valor: r.vencidos, ajuda: "Ainda «Em teste», com o fim do teste já passado: a equipe do cliente está bloqueada.", aoClicar: () => aplicarKpi({ status: "", local: "vencido" }) }) : null,
      kpi({ rotulo: "Perto do limite", valor: r.perto_limite, ajuda: "Usando 80 % ou mais de algum limite do plano.", aoClicar: () => aplicarKpi({ local: "perto" }) }),
      // plano 2000d · DU-182: com o valor combinado de cada cliente; DU-206: o papel «suporte» da revenda não vê receita
      mrr > 0 && papelRevenda(ctx.sessao) !== "suporte" ? kpi({ rotulo: "Receita mensal", valor: mrr, formato: v => ui.brl(v, { centavos: false }), ajuda: "Soma dos clientes ativos (sem teste nem pausados): o valor cobrado de cada um quando registrado; senão, o preço do plano." }) : null,
      // plano 2000d · DU-184 / DU-188 / DU-402 / DU-405: só aparecem quando o servidor manda o dado e há alguém na situação
      ...kpisNovos(itens).map(o => kpi({ ...o, aoClicar: () => aplicarKpi({ status: "", local: o.local }) })),
      // UCB-098: só a plataforma tem pacote comercial
      superConta && r.sem_pacote ? kpi({ rotulo: "Sem pacote", valor: r.sem_pacote, ajuda: "Sem pacote comercial registrado: abra o cliente para completar.", aoClicar: () => aplicarKpi({ local: "sem_pacote" }) }) : null,
      r.pausados ? kpi({ rotulo: "Pausados", valor: r.pausados, ajuda: `Pausados ${quemPausa(superConta)}: a equipe do cliente não entra.`, aoClicar: () => aplicarKpi({ local: "pausados" }) }) : null].filter(Boolean));
    faixa.hidden = false;
    if (typeof segStatus.contar === "function") { for (const s of STATUS) segStatus.contar(s.valor, r[s.valor]); segStatus.contar("", r.total); }
    // plano 2000d · DU-191: as etiquetas da carteira no seletor
    const ets = todasEtiquetas(itens);
    selEtiqueta.hidden = !ets.length;
    const atual = filtro.local && filtro.local.startsWith("etiqueta:") ? filtro.local.slice(9) : "";
    selEtiqueta.replaceChildren(h("option", { value: "" }, "Todas as etiquetas"), ...ets.map(e => h("option", { value: e, selected: e === atual }, e)));
  }
  /** plano 2000d: os KPIs novos (pagamento atrasado, parados na ativação, automações com erro, em risco) — por presença do dado no servidor. */
  function kpisNovos(itens) {
    const tem = k => itens.some(it => it && Object.hasOwn(it, k));
    const conta = f => itens.filter(f).length;
    const l = [];
    if (tem("situacao_pagamento")) { const n = conta(it => it.situacao_pagamento === "atrasado"); if (n) l.push({ rotulo: "Pagamento atrasado", valor: n, local: "atrasado", ajuda: "Clientes com a cobrança em atraso." }); }
    if (tem("ativacao") || tem("ultimo_acesso")) { const n = conta(it => paradoNaAtivacao(it, hoje)); if (n) l.push({ rotulo: "Parados na ativação", valor: n, local: "parados", ajuda: "Criados há 5 dias ou mais e com menos de 2 dos 5 marcos (equipe, número, conversa, automação, relatório)." }); }
    if (tem("automacoes_erro")) { const n = conta(it => Number(it.automacoes_erro) > 0); if (n) l.push({ rotulo: "Automações com erro", valor: n, local: "auto_erro", ajuda: "Clientes com automação que falhou nos últimos 7 dias." }); }
    if (tem("ultimo_acesso") || tem("situacao_pagamento")) { const n = conta(it => emRisco(it, hoje)); if (n) l.push({ rotulo: "Em risco", valor: n, local: "risco", ajuda: "Pontuação de risco de cancelamento 50 ou mais: uso parado, número caído, pagamento atrasado, teste vencido." }); }
    return l;
  }
  /** Aberto com ?status= ou ?busca= (ou trocou a revenda com eles ligados): busca à parte a lista sem esses filtros, só para o resumo. */
  // plano 1000b · UB-118: o resumo de uma org é pedido UMA vez (buscas seguidas, antes de a 1ª resposta chegar, não repetem a lista inteira)
  let resumoPedido = null;
  async function carregarResumo() {
    const n = ++seqResumo, orgId = filtro.org_id || "";
    if (resumoPedido === orgId) return;
    resumoPedido = orgId;
    try {
      const todos = await api.rpc("nx_clientes_admin", { p_filtro: { busca: null, status: null, org_id: orgId || null } });
      if (n !== seqResumo || orgId !== (filtro.org_id || "")) return;
      pintarResumo(Array.isArray(todos) ? todos : [], orgId);
    } catch { /* sem resumo: a lista continua; a faixa só aparece com números de verdade */ }
    finally { if (resumoPedido === orgId) resumoPedido = null; }
  }

  if (superConta) {
    const carregarOrgs = () => orgs(ctx).then(os => {
      selOrg.disabled = false; selOrg.removeAttribute("title");
      for (const o of os) selOrg.appendChild(h("option", { value: o.id, selected: o.id === filtro.org_id }, o.nome));
      const rec = selOrg.parentNode && selOrg.parentNode.querySelector(".adm-orgs-recarregar"); if (rec) rec.remove();
    }).catch(() => {
      // plano 1500c · UCB-026: a lista de revendas falhou — o seletor diz por quê e oferece tentar de novo
      _orgs = null;
      selOrg.disabled = true;
      selOrg.title = "Não deu para carregar as revendas.";
      if (selOrg.parentNode && !selOrg.parentNode.querySelector(".adm-orgs-recarregar")) {
        const b = h("button", { type: "button", class: "bt bt-fant bt-p adm-orgs-recarregar", title: "Não deu para carregar as revendas" }, ui.icone("reabrir"), "Recarregar revendas");
        b.addEventListener("click", () => ui.carregando(b, carregarOrgs()));
        selOrg.after(b);
      }
    });
    carregarOrgs();
  }

  let seq = 0;
  const hoje = ui.hojeSP();
  _hojeDaLista = hoje;      // plano 1500c · UCB-085: filtrarLocal (acabando/vencido) usa a data de SP desta tela
  let mostrar = POR_PAGINA_CLIENTES, ultimosDoFiltro = [];
  async function carregar() {
    const n = ++seq;
    mostrar = POR_PAGINA_CLIENTES;
    // plano 1000b · UB-117: esqueleto só na 1ª carga — nas buscas seguintes a tabela fica (aria-busy) até a resposta chegar
    if (!lista.firstChild) lista.appendChild(ui.esqueleto("tabela", 6));
    lista.setAttribute("aria-busy", "true");
    try {
      const todosDoFiltro = await api.rpc("nx_clientes_admin", { p_filtro: { busca: filtro.busca || null, status: filtro.status || null, org_id: filtro.org_id || null } });
      if (n !== seq) return;
      lista.removeAttribute("aria-busy");
      ultimosDoFiltro = todosDoFiltro;
      pintarLista(todosDoFiltro);
    } catch (e) {
      if (n !== seq) return;
      lista.removeAttribute("aria-busy");
      ui.limpar(lista);
      lista.appendChild(ui.erroCartao(e, carregar));
    }
  }
  /** plano 1500c · UC-023/UCB-127: o nome do produto da marca em uso (o da revenda para o gestor). */
  function produtoMarca() { try { const me = ctx.shell.marcaEfetiva(); return (me && me.produto) || "sistema"; } catch { return "sistema"; } }
  /** plano 1500c · UCB-099: «N selecionados: Estender teste +7 · Exportar» — chamadas em sequência e um resumo no fim. */
  function barraLote(tab) {
    const barra = h("div", { class: "linha adm-lote", role: "region", "aria-label": "Ações nos clientes selecionados", hidden: true });
    if (!tab || typeof tab.selecionados !== "function") return barra;
    const txt = h("b", { class: "adm-lote-n", "aria-live": "polite" });
    const bEstender = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("relogio"), "Estender teste +7 dias");
    const bExportar = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("baixar"), "Exportar");
    const pintar = () => {
      const sel = tab.selecionados();
      barra.hidden = !sel.length;
      txt.textContent = `${sel.length} ${sel.length === 1 ? "selecionado" : "selecionados"}`;
      bEstender.disabled = !sel.some(it => it.status === "teste");
    };
    tab.el.addEventListener("change", () => setTimeout(pintar, 0));
    bExportar.addEventListener("click", () => exportarCsv(tab.selecionados()));
    bEstender.addEventListener("click", async () => {
      const alvos = tab.selecionados().filter(it => it.status === "teste");
      if (!alvos.length) return;
      if (!(await ui.confirmar({ titulo: `Estender o teste de ${alvos.length} ${alvos.length === 1 ? "cliente" : "clientes"}?`, rotulo: "Estender +7 dias",
        texto: "Cada um ganha mais 7 dias a partir do fim atual (ou de hoje, se já venceu). Os selecionados que não estão em teste ficam como estão." }))) return;
      let ok = 0; const falhas = [];
      await ui.carregando(bEstender, (async () => {
        for (const it of alvos) {
          try { await api.rpc("nx_cliente_admin_salvar", { p_cliente: { id: it.id, teste_ate: estenderTeste(it.teste_ate, hoje, 7) } }); ok++; }
          catch (e) { falhas.push(`${it.nome}: ${api.mensagemErro(e)}`); }
        }
      })());
      ui.toast(falhas.length ? `${ok} ${ok === 1 ? "teste estendido" : "testes estendidos"}; não deu em ${falhas.length}: ${falhas.join("; ")}` : `${ok} ${ok === 1 ? "teste estendido" : "testes estendidos"} em 7 dias.`, { tipo: falhas.length ? "erro" : "ok" });
      carregar();
    });
    barra.append(txt, bEstender, bExportar);
    return barra;
  }
  function pintarLista(todosDoFiltro) {
    {
      const itens = filtrarLocal(todosDoFiltro, filtro.local, filtro.status);
      ultimosItens = itens;
      pintarChipLocal();
      ui.limpar(lista);
      if (!filtro.status && !filtro.busca) { seqResumo++; pintarResumo(todosDoFiltro, filtro.org_id || ""); }
      else if (resumoDaOrg !== (filtro.org_id || "")) carregarResumo();
      if (!itens.length && !filtro.busca && !filtro.status && !filtro.org_id && !filtro.local) {
        lista.appendChild(ui.vazio({ titulo: "Nenhum cliente ainda.", texto: "Crie o primeiro — o funil, as etiquetas e as respostas rápidas da área dele entram prontos.",
          icone: "empresa", acao: { rotulo: "Criar o primeiro cliente", fn: () => criarCliente(ctx) } }));
        return;
      }
      // uso × limite como mini-barra (item 58): a cor avisa quem está perto do teto
      const uso = (it, k, rot) => {
        const u = it.uso ? it.uso[k] : null, l = it.limites ? it.limites[k] : null;
        return h("span", { class: "adm-uso-mini" }, ui.barraUso(rot, u ?? 0, l));
      };
      // G10: a coluna do número só existe quando o servidor manda `canais` (senão não há o que mostrar com honestidade)
      const comNumeros = itens.some(it => Array.isArray(it.canais));
      const tab = ui.tabela({
        rotulo: "Clientes",
        colunas: [
          // plano 1000 · AS-289: o nome é um link de verdade (Ctrl+clique abre em outra aba; dá para copiar o endereço)
          { chave: "nome", rotulo: "Cliente", ordenavel: true, principal: true, render: it => h("div", { class: "cel-nome" }, ui.avatar(it.nome, it.id),
            h("div", null, h("a", { class: "adm-nome-link", href: `#/admin/clientes/${encodeURIComponent(it.id)}` }, h("b", null, it.nome)), h("small", null, it.slug),
              // plano 2000d · DU-191: as etiquetas do cliente embaixo do nome
              etiquetasCliente(it).length ? h("span", { class: "adm-etiquetas" }, etiquetasCliente(it).map(e => h("span", { class: "adm-etiqueta" }, e))) : null)) },
          ...(superConta ? [{ chave: "org_nome", rotulo: "Revenda", ordenavel: true, render: it => it.org ? it.org.nome : "—" }] : []),      // plano 1500c · UCB-096
          // G5 [H306]: sem pacote comercial registrado (criado pelo clássico) → pílula; o detalhe ensina a completar
          // plano 1500c · UCB-002: o pacote comercial é da plataforma — a revenda (white-label) não vê «Sem pacote»
          { chave: "plano", rotulo: "Plano", ordenavel: true, render: it => h("span", { class: "adm-pilulas" }, ui.pilula(nomePlano(it.plano), it.plano === "interno" ? "sec" : "prim"),
            superConta && semPacote(it) ? ui.pilula("Sem pacote", "aten", { title: "Sem pacote comercial registrado. Abra o cliente para escolher um." }) : null) },
          { chave: "status", rotulo: "Situação", ordenavel: true, render: it => h("span", { class: "adm-pilulas" }, ui.pilula(statusDe(it.status).rotulo, statusDe(it.status).cor),
            it.ativo === false ? ui.pilula("Pausado", "ruim", { icone: "cadeado", title: `Pausado ${quemPausa(superConta)}: a equipe do cliente não entra.` }) : null) },
          ...(comNumeros ? [{ chave: "n_numeros", rotulo: "Número", ordenavel: true, render: it => {
            const e = estadoNumerosCliente(it.canais);
            return e ? h("span", { class: "adm-numero", dataset: { tom: e.tom } }, ui.pilula(e.rotulo, e.tom, { icone: e.tom === "ok" ? "check" : e.tom === "ruim" ? "alerta" : "whatsapp" })) : "—";
          } }] : []),
          { chave: "teste_ate", rotulo: "Fim do teste", ordenavel: true, render: it => {
            if (!(it.status === "teste" && it.teste_ate)) return "—";
            const venc = testeVencidoHa(it, hoje);      // plano 1000 · AS-158: data passada não fica muda
            const logo = rotuloFimTeste(it, hoje);       // plano 1500c · UCB-084: acabando em até 3 dias também se destaca
            // plano 1500c · UC-023: «Follow-up» copia a mensagem pronta (só copia; nada sai pelo sistema)
            const bFollow = venc || logo ? h("button", { type: "button", class: "bt bt-fant bt-p adm-followup", "aria-label": `Copiar mensagem de follow-up para ${it.nome}` }, ui.icone("copiar"), "Follow-up") : null;
            // plano 2000d · DU-203: escolhe o tom (próximo ou formal) e edita antes de copiar
            if (bFollow) bFollow.addEventListener("click", () => abrirFollowup(ctx, it, hoje, produtoMarca()));
            if (venc) return h("span", { class: "adm-pilulas" }, ui.pilula(rotuloTesteVencido(venc), "ruim", { icone: "alerta" }), h("small", { class: "fraco" }, ui.dataBR(it.teste_ate)), bFollow);
            if (logo) return h("span", { class: "adm-pilulas" }, ui.pilula(logo.texto, logo.tom, { icone: "relogio" }), h("small", { class: "fraco" }, ui.dataBR(it.teste_ate)), bFollow);
            return ui.dataBR(it.teste_ate);
          } },
          // plano 2000d · DU-184: pagamento (em dia / atrasado / sem cobrança) quando a cobrança existir no servidor
          ...(itens.some(it => Object.hasOwn(it, "situacao_pagamento")) ? [{ chave: "situacao_pagamento", rotulo: "Pagamento", ordenavel: true, render: it => {
            const p = rotuloPagamento(it.situacao_pagamento); return p ? ui.pilula(p[0], p[1]) : "—"; } }] : []),
          // plano 2000d · DU-188: ativação em marcos (0–5)
          ...(itens.some(it => it.ativacao || Object.hasOwn(it, "ultimo_acesso")) ? [{ chave: "n_ativacao", rotulo: "Ativação", ordenavel: true, render: it => {
            const m = marcosAtivacao(it);
            return h("span", { class: "adm-ativacao", title: m.marcos.map(x => `${x.feito ? "✓" : "·"} ${x.rotulo}`).join("\n"), "aria-label": `Ativação: ${m.feitos} de ${m.total} marcos` },
              h("span", { class: "adm-ativacao-pontos", "aria-hidden": "true" }, m.marcos.map(x => h("span", { class: ["adm-ativacao-ponto", x.feito && "feito"] }))), h("span", { class: "mono" }, `${m.feitos}/${m.total}`));
          } }] : []),
          // plano 2000d · DU-404: última atividade
          ...(itens.some(it => Object.hasOwn(it, "ultimo_acesso")) ? [{ chave: "ultimo_acesso", rotulo: "Última atividade", ordenavel: true, render: it => it.ultimo_acesso ? ui.relativo(it.ultimo_acesso) : "nunca" }] : []),
          // plano 2000d · DU-405: risco de cancelamento com os motivos
          ...(itens.some(it => Object.hasOwn(it, "ultimo_acesso") || Object.hasOwn(it, "situacao_pagamento")) ? [{ chave: "n_risco", rotulo: "Risco", ordenavel: true, render: it => {
            const r = riscoCliente(it, hoje);
            return r.pontos ? h("span", { class: "adm-risco", title: r.motivos.join(", ") }, ui.pilula(`${r.pontos}`, r.pontos >= 50 ? "ruim" : "aten"),
              h("span", { class: "sr-only" }, ` de 100: ${r.motivos.join(", ")}`)) : h("span", { class: "fraco" }, "baixo");
          } }] : []),
          // plano 2000d · DU-402: automações com erro
          ...(itens.some(it => Object.hasOwn(it, "automacoes_erro")) ? [{ chave: "automacoes_erro", rotulo: "Automações", ordenavel: true, render: it => Number(it.automacoes_erro) > 0
            ? ui.pilula(`${it.automacoes_erro} com erro`, "ruim", { icone: "alerta" }) : h("span", { class: "fraco" }, "ok") }] : []),
          // plano 2000d · DU-428: custo de IA no mês, com alerta acima da média da carteira (o papel «suporte» não vê valores)
          ...(papelRevenda(ctx.sessao) !== "suporte" && itens.some(it => Object.hasOwn(it, "ia_custo_mes")) ? [{ chave: "ia_custo_mes", rotulo: "IA no mês", ordenavel: true, render: it => h("span", { class: "adm-pilulas" },
            h("span", { class: "mono" }, dolar(it.ia_custo_mes)), iaAcimaDaMedia(itens, it) ? ui.pilula("acima da média", "aten", { icone: "alerta" }) : null) }] : []),
          { chave: "u_usuarios", rotulo: "Usuários", render: it => uso(it, "usuarios", "Usuários") },
          { chave: "u_canais", rotulo: "Números", render: it => uso(it, "canais", "Números de WhatsApp") },
          { chave: "u_contatos", rotulo: "Contatos", render: it => uso(it, "contatos", "Contatos") },
          { chave: "criado_em", rotulo: "Criado em", ordenavel: true, render: it => ui.dataBR(it.criado_em) },
        ],
        // ordenar «Número»: desconectados primeiro (o que precisa de atenção), depois sem confirmação, depois conectados
        // plano 1000b · UB-225: 50 linhas por vez (paginação local) — com 300 clientes a tabela não desenha tudo de uma vez
        linhas: itens.slice(0, mostrar).map(it => { const e = estadoNumerosCliente(it.canais);
          return { ...it, org_nome: it.org ? it.org.nome : "", u_usuarios: it.uso && it.uso.usuarios, n_numeros: e ? (e.caidos ? 0 : e.tom === "ok" ? 2 : 1) : null,
            n_ativacao: marcosAtivacao(it).feitos, n_risco: riscoCliente(it, hoje).pontos }; }),      // plano 2000d · DU-188 / DU-405: ordenáveis
        // plano 1500c · UCB-109: o clique na linha faz o que o link faria (Ctrl/⌘ ou botão do meio abrem em outra aba)
        aoClicar: (it, ev) => {
          const href = `#/admin/clientes/${encodeURIComponent(it.id)}`;
          if (ev && (ev.ctrlKey || ev.metaKey || ev.button === 1) && typeof window !== "undefined" && typeof window.open === "function") { window.open(href, "_blank", "noopener"); return; }
          ctx.navegar(`#/admin/clientes/${it.id}`);
        },
        selecao: true,      // plano 1500c · UCB-099: ações em lote
        vazio: "Nenhum cliente com esse filtro.",
      });
      // UCB-109: o alvo de teclado é só o link do nome (a linha inteira não entra no Tab duas vezes)
      for (const tr of tab.el.querySelectorAll("tr[tabindex]")) tr.removeAttribute("tabindex");
      lista.appendChild(barraLote(tab));
      lista.appendChild(tab.el);
      if (itens.length > mostrar) {
        const mais = h("button", { type: "button", class: "bt bt-sec adm-mais" }, `Mostrar mais (${ui.num(Math.min(POR_PAGINA_CLIENTES, itens.length - mostrar))} de ${ui.num(itens.length - mostrar)} restantes)`);
        mais.addEventListener("click", () => { mostrar += POR_PAGINA_CLIENTES; pintarLista(ultimosDoFiltro); });
        lista.appendChild(h("div", { class: "linha adm-mais-linha" }, h("p", { class: "fraco" }, `Mostrando ${ui.num(mostrar)} de ${ui.num(itens.length)} clientes.`), mais));
      }
    }
  }
  const aoBuscar = ui.debounce(() => { filtro.busca = busca.value.trim(); gravarFiltro(); carregar(); }, 300);
  busca.addEventListener("input", aoBuscar);
  if (selOrg) selOrg.addEventListener("change", () => { filtro.org_id = selOrg.value; gravarFiltro(); carregar(); });
  novo.addEventListener("click", () => criarCliente(ctx));
  _limpeza.push(() => aoBuscar.cancelar());
  try { await planos(ctx); } catch { /* nomes de plano caem no id */ }
  await carregar();
}

/** plano 1500c · UC-032: o checklist da revenda (marca, WhatsApp de suporte, domínio, primeiro cliente, primeiro acesso), dispensável. */
async function cartaoPassosRevenda(ctx, caixa, cls = []) {
  const { ui, api } = ctx;
  const h = ui.h;
  const chave = `nx-adm-passos:${ctx.sessao.org.id}`;
  try { if (globalThis.localStorage && localStorage.getItem(chave) === "dispensado") return; } catch { /* sem storage: mostra */ }
  let os = [], doms = [];
  try { [os, doms] = await Promise.all([orgs(ctx).catch(() => []), api.rpc("nx_dominios_listar").catch(() => [])]); } catch { return; }
  const minha = (os || []).find(o => o && o.id === ctx.sessao.org.id);
  const marca = (minha && minha.marca) || ctx.sessao.org.marca || {};
  // plano 2000d · DU-202: o link do teste grátis (com o domínio ativo da agência, quando houver)
  const domAg = (Array.isArray(doms) ? doms : []).find(d => d && d.status === "ativo" && !d.cliente);
  const linkTeste = linkTesteGratis(typeof location !== "undefined" ? location.origin : "", (minha && minha.slug) || ctx.sessao.org.slug, domAg ? domAg.host : null);
  const passos = passosRevenda(marca, cls, doms, { linkTeste });
  const obrig = passos.filter(p => !p.opcional);
  const feitos = obrig.filter(p => p.feito).length;
  if (feitos === obrig.length || !caixa.isConnected) return;
  const dispensar = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("fechar"), "Dispensar");
  dispensar.addEventListener("click", () => { try { localStorage.setItem(chave, "dispensado"); } catch { /* ok */ } caixa.hidden = true; ui.limpar(caixa); });
  caixa.append(h("section", { class: "cartao adm-passos-cartao", "aria-labelledby": "adm-passos-tit" },
    h("div", { class: "cartao-cab" }, h("div", null, h("h2", { id: "adm-passos-tit" }, "Deixe sua revenda pronta"),
      h("p", { class: "sub" }, `${feitos} de ${obrig.length} passos feitos.`)), dispensar),
    h("ul", { class: "adm-passos-lista" }, passos.map(p => h("li", { class: ["adm-passo", p.feito && "feito"] },
      ui.icone(p.feito ? "check" : "seta-dir"),
      p.feito ? h("span", null, p.rotulo) : h("a", { href: p.href }, p.rotulo),
      p.feito ? h("span", { class: "sr-only" }, " (feito)") : null,
      // DU-202: o link para divulgar já fica à mão (vale depois de ligar o «teste grátis» na marca)
      p.link ? botaoCopiarLink(ui, p.link, "Copiar o link do teste grátis") : null)))));
  caixa.hidden = false;
}

function baixarArquivoTexto(texto, nome, tipo) {
  try {
    const url = URL.createObjectURL(new Blob([texto], { type: `${tipo};charset=utf-8` }));
    const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch { return false; }
}

/* ---------------- plano 2000d · peças de tela novas do Admin ---------------- */
function botaoCopiarLink(ui, link, rotulo) {
  const b = ui.h("button", { type: "button", class: "bt bt-fant bt-p adm-copiar-link", "aria-label": rotulo }, ui.icone("copiar"), "Copiar link");
  b.addEventListener("click", () => ui.copiar(link, { aviso: "Link copiado." }));
  return b;
}
/** plano 2000d · DU-203: a mensagem de fim de teste em dois tons, editável antes de copiar. */
async function abrirFollowup(ctx, cli, hoje, produto) {
  const { ui } = ctx;
  const h = ui.h;
  const form = h("form", { class: "pilha", novalidate: true },
    ui.campo({ rotulo: "Tom", nome: "tom", tipo: "select", valor: "proximo", opcoes: [{ valor: "proximo", rotulo: "Próximo (informal)" }, { valor: "formal", rotulo: "Formal" }] }),
    ui.campo({ rotulo: "Mensagem", nome: "texto", tipo: "textarea", linhas: 6, max: 1000, valor: mensagemFollowupTesteTom(cli, hoje, produto, "proximo"), ajuda: "Edite à vontade antes de copiar. Nada sai pelo sistema." }));
  const sel = form.querySelector("select[name=tom]"), txt = form.querySelector("textarea[name=texto]");
  let mexido = false;
  if (txt) txt.addEventListener("input", () => { mexido = true; });
  if (sel) sel.addEventListener("change", async () => {
    if (mexido && !(await ui.confirmar({ titulo: "Trocar o tom?", rotulo: "Trocar", texto: "O texto que você editou é substituído pelo modelo do outro tom." }))) return;
    txt.value = mensagemFollowupTesteTom(cli, hoje, produto, sel.value); mexido = false;
  });
  await ui.modal({ titulo: `Mensagem para ${cli.nome}`, corpo: form, largura: "m", acoes: [{ rotulo: "Fechar", tipo: "neutro" },
    { rotulo: "Copiar mensagem", tipo: "primario", fn: async () => { await ui.copiar(String(txt ? txt.value : "").trim(), { aviso: "Mensagem copiada." }); return true; } }] });
}
/** plano 2000d · DU-426: proposta comercial com os planos da agência, preço e validade — página com a marca dela (sem a da plataforma). */
async function gerarProposta(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  let ps = [];
  try { ps = (await planos(ctx)).filter(p => p && p.ativo !== false && p.id !== "interno"); } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); return; }
  if (!ps.length) { ui.toast("Nenhum plano disponível para montar a proposta.", { tipo: "info" }); return; }
  const validade = isoMais(ui.hojeSP(), 15);
  const form = h("form", { class: "pilha", novalidate: true },
    ui.campo({ rotulo: "Para quem é a proposta", nome: "prospect", obrigatorio: true, max: 80, autocomplete: "off", placeholder: "Ex.: Clínica Bem Estar" }),
    ui.campo({ rotulo: "Planos na proposta", nome: "planos", tipo: "multipla", valor: ps.slice(0, 3).map(p => p.id), opcoes: ps.map(p => ({ valor: p.id, rotulo: `${p.nome}${p.preco_mensal != null ? ` — ${ui.brl(p.preco_mensal, { centavos: false })}/mês` : " — sob consulta"}` })) }),
    ui.campo({ rotulo: "Válida até", nome: "validade", tipo: "data", valor: validade }),
    ui.campo({ rotulo: "Observação (opcional)", nome: "obs", tipo: "textarea", linhas: 3, max: 600 }));
  const d = await ui.modal({ titulo: "Gerar proposta", corpo: form, largura: "m", acoes: [{ rotulo: "Cancelar", tipo: "neutro" },
    { rotulo: "Baixar proposta", tipo: "primario", fn: async () => {
      ui.marcarErro(form, null);
      const v = ui.lerForm(form);
      if (String(v.prospect || "").trim().length < 2) { ui.marcarErro(form, "prospect", "Informe para quem é a proposta."); return false; }
      if (!Array.isArray(v.planos) || !v.planos.length) { ui.marcarErro(form, "planos", "Escolha pelo menos um plano."); return false; }
      return v;
    } }] });
  if (!d) return;
  let marca = {};
  try { marca = ctx.shell.marcaEfetiva() || {}; } catch { /* sem marca: a página sai só com o texto */ }
  const MOD = Object.fromEntries(MODULOS.map(m => [m.valor, m.rotulo]));
  const html = htmlProposta({ marca, prospect: String(d.prospect).trim(), validade: d.validade ? ui.dataBR(d.validade) : "", observacao: d.obs || "",
    planos: ps.filter(p => d.planos.includes(p.id)).map(p => ({ nome: p.nome, preco_mensal: p.preco_mensal, itens: (p.modulos || []).map(m => MOD[m] || m) })) });
  if (baixarArquivoTexto(html, `proposta-${sugerirSlug(d.prospect) || "cliente"}.html`, "text/html")) ui.toast("Proposta baixada. Abra no navegador para imprimir ou salvar em PDF.", { tipo: "ok" });
  else ui.toast("O navegador não deixou baixar o arquivo.", { tipo: "erro" });
}
/** plano 2000d · DU-187: pausa de emergência dos envios automáticos de TODOS os clientes da agência (nx_envios_pausar com p_org). */
function cartaoPausaAgencia(ctx, caixa) {
  const { ui, api } = ctx;
  const h = ui.h;
  let pausado = ctx.sessao.org && typeof ctx.sessao.org.envios_pausados === "boolean" ? ctx.sessao.org.envios_pausados : false;
  const pintar = () => {
    const b = h("button", { type: "button", class: pausado ? "bt bt-prim bt-p" : "bt bt-sec bt-p" }, ui.icone(pausado ? "play" : "pausa"), pausado ? "Retomar os envios da agência" : "Pausar os envios de todos os clientes");
    b.addEventListener("click", async () => {
      const pausar = !pausado;
      if (!(await ui.confirmar(pausar
        ? { titulo: "Pausar os envios automáticos de todos os seus clientes?", rotulo: "Pausar tudo", perigo: true, digitar: "pausar",
            texto: "Lembretes, campanhas e automações de todos os clientes da agência param até você retomar. As mensagens digitadas pela equipe continuam saindo." }
        : { titulo: "Retomar os envios automáticos?", rotulo: "Retomar", texto: "A fila volta a andar para os clientes que não estão pausados um a um." }))) return;
      try {
        const r = await ui.carregando(b, api.rpc("nx_envios_pausar", { p_cliente: null, p_org: ctx.sessao.org.id, p_pausar: pausar, p_motivo: pausar ? "Pausa de emergência da agência" : null }));
        pausado = r && typeof r.pausado === "boolean" ? r.pausado : pausar;
        ui.toast(pausado ? "Envios automáticos da agência pausados." : "Envios automáticos retomados.", { tipo: "ok" });
        pintar();
      } catch (e) { if (semFuncaoAdm(e)) { caixa.hidden = true; return; } ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    caixa.replaceChildren(h("div", { class: ["aviso", pausado ? "aviso-ruim" : "aviso-ok", "adm-saude-cx"] }, ui.icone(pausado ? "alerta" : "check"),
      h("div", { class: "pilha-p" }, h("p", null, h("b", null, pausado ? "Envios automáticos pausados em todos os clientes." : "Envios automáticos saindo normalmente."),
        " Use a pausa de emergência se um texto errado estiver indo para vários clientes."), h("div", { class: "linha" }, b))));
    caixa.hidden = false;
  };
  pintar();
}

/** Saúde da operação (nx_saude, só plataforma) + pausa de emergência de TODOS os envios (nx_envios_pausar sem cliente). */
function cartaoSaude(ctx, caixa) {
  const { ui, api } = ctx;
  const h = ui.h;
  async function carregar() {
    let s = null, falha = null;
    try { s = resumoSaude(await api.rpc("nx_saude")); } catch (e) { if (semFuncao(e)) { caixa.hidden = true; return; } falha = e; }
    ui.limpar(caixa);
    // plano 1000b · UB-104: erro de verdade não esconde o cartão — a plataforma vê que a saúde NÃO foi conferida e pode tentar de novo
    if (falha) {
      const tentar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("reabrir"), "Tentar de novo");
      tentar.addEventListener("click", () => ui.carregando(tentar, carregar()));
      caixa.hidden = false;
      caixa.append(h("div", { class: "aviso aviso-aten adm-saude-cx adm-saude-falha", role: "status" }, ui.icone("alerta"),
        h("div", { class: "pilha-p" }, h("p", null, h("b", null, "Não deu para conferir a saúde da operação agora."), ` ${api.mensagemErro(falha)}`), h("div", { class: "linha" }, tentar))));
      return;
    }
    if (!s) { caixa.hidden = true; return; }
    caixa.hidden = false;
    const bPausa = h("button", { type: "button", class: s.pausaGeral ? "bt bt-prim bt-p" : "bt bt-sec bt-p" }, ui.icone(s.pausaGeral ? "play" : "pausa"), s.pausaGeral ? "Retomar todos os envios" : "Pausar todos os envios");
    bPausa.addEventListener("click", async () => {
      const pausar = !s.pausaGeral;
      if (!(await ui.confirmar(pausar
        ? { titulo: "Pausar os envios automáticos de TODOS os clientes?", rotulo: "Pausar tudo", perigo: true, digitar: "pausar",
            texto: "A fila de WhatsApp e as decisões de IA das automações param na plataforma inteira até você retomar. Mensagens digitadas pela equipe nas conversas continuam saindo." }
        : { titulo: "Retomar os envios automáticos?", rotulo: "Retomar", texto: "A fila volta a andar para os clientes que não estão pausados um a um." }))) return;
      try {
        await ui.carregando(bPausa, api.rpc("nx_envios_pausar", { p_cliente: null, p_pausar: pausar, p_motivo: pausar ? "Pausa de emergência pelo Admin" : null }));
        ui.toast(pausar ? "Envios automáticos pausados na plataforma." : "Envios automáticos retomados.", { tipo: "ok" });
        carregar();
      } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    caixa.append(h("div", { class: ["aviso", s.pausaGeral ? "aviso-ruim" : s.ok ? "aviso-ok" : "aviso-aten", "adm-saude-cx"] },
      ui.icone(s.ok ? "check" : "alerta"),
      h("div", { class: "pilha-p" },
        h("p", null, h("b", null, s.ok ? "Operação em ordem." : `${s.problemas.length} ${s.problemas.length === 1 ? "ponto de atenção" : "pontos de atenção"} na operação.`),
          s.clientesPausados ? ` ${s.clientesPausados} ${s.clientesPausados === 1 ? "cliente com envios pausados" : "clientes com envios pausados"}.` : ""),
        s.problemas.length ? h("ul", { class: "adm-saude-lista" }, s.problemas.map(p => h("li", null, p))) : null,
        h("div", { class: "linha" }, bPausa))));
  }
  carregar();
}

function nomePlano(id) {
  const p = (_planos || []).find(x => x.id === id);
  return p ? p.nome : id || "—";
}

/* ============================================================
   NOVO CLIENTE
   ============================================================ */
async function criarCliente(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const superConta = !!ctx.sessao.conta.super;
  let ps = [], os = [];
  try { ps = await planos(ctx); } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); return; }
  try { os = await orgs(ctx); } catch { os = []; }
  const orgPadrao = ctx.sessao.org ? ctx.sessao.org.id : null;
  const minhaOrg = os.find(o => o.id === orgPadrao) || (ctx.sessao.org ? { ...ctx.sessao.org } : null);
  const padraoOrg = minhaOrg && minhaOrg.limites && minhaOrg.limites.plano_padrao;
  // plano 1500c · UCB-093: os dias de teste padrão da revenda (limites.dias_teste, quando o servidor guardar); senão 14
  const diasPadrao = diasDeTesteValidos(minhaOrg && minhaOrg.limites && minhaOrg.limites.dias_teste) || 14;
  const orgDe = id => os.find(o => o.id === id) || (id === orgPadrao ? minhaOrg : null);
  // plano 1500c · UCB-002: o plano técnico (nx_planos ativos, sem o interno) — é o que a revenda escolhe no lugar do pacote da Nexus
  const opcoesTecnicas = ps.filter(p => p && p.ativo !== false && p.id !== "interno").map(p => ({ valor: p.id, rotulo: `${p.nome}${p.preco_mensal != null ? ` — ${ui.brl(p.preco_mensal, { centavos: false })}/mês` : ""}` }));
  const planoInicial = () => planoDeAcessoNovo({ superConta: false, planoPadraoOrg: padraoOrg, planos: ps, orgEscolhida: superConta ? null : minhaOrg }) || (opcoesTecnicas[0] && opcoesTecnicas[0].valor) || "";
  const campoPlanoTec = opcoesTecnicas.length ? ui.campo({ rotulo: "Plano", nome: "plano_tecnico", tipo: "select", valor: planoInicial(), opcoes: opcoesTecnicas,
    ajuda: "Limites e módulos que o cliente recebe. O preço que você cobra é combinado por você." }) : null;
  // plano 2000d · DU-427: os pacotes comerciais fixos são só da plataforma (a revenda recebe os do servidor, quando houver)
  const campoPacote = campoPacoteComercial(ui, null, { obrigatorio: true, pacotes: pacotesDaSessao(ctx.sessao, minhaOrg && minhaOrg.pacotes) });
  // plano 2000d · DU-180: copiar a configuração de um cliente-modelo (só quando o servidor copia: sessao.recursos «cliente_modelo»)
  let modelos = [];
  if (temRecurso(ctx.sessao, "cliente_modelo")) { try { modelos = await api.rpc("nx_clientes_admin", { p_filtro: { busca: null, status: null, org_id: superConta ? null : orgPadrao } }); } catch { modelos = []; } }
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome do cliente", nome: "nome", obrigatorio: true, max: 80, placeholder: "Ex.: Clínica Sorriso", autocomplete: "off" }),
      // plano 2000d · DU-352: «Endereço curto» (sem «slug»)
      ui.campo({ rotulo: "Endereço curto", nome: "slug", obrigatorio: true, max: 40, ajuda: "Letras minúsculas, números e hífen (sem hífen no começo ou no fim).", autocomplete: "off" }),
      ui.campo({ rotulo: "Segmento do cliente", nome: "segmento", max: 120, placeholder: "Escreva livremente, por exemplo: clínica odontológica, loja de roupas, consultoria…",
        ajuda: "Sem opções predefinidas. Clínicas odontológicas, oficinas e lojas reconhecidas recebem o modelo correspondente; os demais usam o modelo genérico." }),
      ui.campo({ rotulo: "Situação", nome: "status", tipo: "select", valor: "teste", opcoes: STATUS.slice(0, 2) }),
      ui.campo({ rotulo: "Dias de teste", nome: "dias", tipo: "numero", valor: diasPadrao, min: 1, max: 90 }),
      superConta && os.length ? ui.campo({ rotulo: "Revenda / plataforma", nome: "org_id", tipo: "select", valor: orgPadrao, opcoes: os.map(o => ({ valor: o.id, rotulo: `${o.nome}${o.tipo === "plataforma" ? " (plataforma)" : ""}` })) }) : null,
      campoPlanoTec),
    // plano 1000b · UB-113: nenhum pacote vem marcado — a escolha é obrigatória de verdade («Escolha um dos três» aparece se pular)
    campoPacote,
    // plano 2000d · DU-196: os módulos contratados, pré-marcados pelo plano
    h("div", { class: "campo-modulos adm-novo-modulos" }),
    // plano 2000d · DU-185: com quem falar (vai na mensagem de fim de teste e no convite)
    h("fieldset", { class: "campo adm-contato" }, h("legend", null, "Contato do cliente (opcional)"),
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Responsável", nome: "ct_responsavel", max: 80, autocomplete: "off" }),
        ui.campo({ rotulo: "WhatsApp", nome: "ct_whatsapp", tipo: "tel", autocomplete: "off" }),
        ui.campo({ rotulo: "E-mail", nome: "ct_email", tipo: "email", autocomplete: "off" }),
        ui.campo({ rotulo: "CPF ou CNPJ", nome: "ct_documento", max: 18, autocomplete: "off", ajuda: "Para a nota fiscal. Conferimos os dígitos." }))),
    // plano 2000d · DU-186: o convite do administrador sai junto com o cliente
    ui.campo({ rotulo: "E-mail do administrador (opcional)", nome: "email_admin", tipo: "email", autocomplete: "off",
      ajuda: "Se preencher, o convite do administrador já sai pronto ao criar (só este e-mail poderá aceitar)." }),
    // plano 2000d · DU-191: etiquetas livres
    ui.campo({ rotulo: "Etiquetas (opcional)", nome: "etiquetas", max: 300, autocomplete: "off", placeholder: "Ex.: clínicas, Taubaté", ajuda: "Separe por vírgula. Servem para filtrar a lista e saem no CSV." }),
    modelos.length ? ui.campo({ rotulo: "Copiar a configuração de… (opcional)", nome: "copiar_de", tipo: "select", valor: "",
      opcoes: [{ valor: "", rotulo: "Não copiar (usar o modelo do segmento)" }, ...modelos.map(c => ({ valor: c.id, rotulo: c.nome }))],
      ajuda: "Funis, etiquetas, campos, respostas rápidas e automações (desligadas) vêm iguais às desse cliente." }) : null,
    ui.campo({ rotulo: "Especificações do cliente", nome: "especificacoes", tipo: "textarea", max: 5000, linhas: 4,
      placeholder: "Escreva necessidades, objetivos, entregas combinadas e observações…", ajuda: "Campo livre, sem modelos ou respostas predefinidas." }));
  const selOrgNovo = form.querySelector("select[name=org_id]");
  // DU-196: os chips de módulo seguem o plano escolhido (a escolha da pessoa vale dentro do plano)
  const caixaModNovo = form.querySelector(".adm-novo-modulos");
  let escolhaModulos = null;
  const planoNovoModulos = () => {
    const sel = form.querySelector("select[name=plano_tecnico]");
    const rad = !campoPacote.hidden ? campoPacote.querySelector("input[type=radio]:checked") : null;
    const pac = rad ? PACOTES_COMERCIAIS.find(p => p.id === rad.value) : null;
    const id = pac ? pac.acesso : campoPlanoTec && !campoPlanoTec.hidden && sel ? sel.value : planoInicial();
    return ((ps.find(p => p.id === id) || {}).modulos) || [];
  };
  const pintarModulosNovo = () => {
    const doPlano = planoNovoModulos();
    caixaModNovo.replaceChildren(ui.campo({ rotulo: "Módulos contratados", nome: "modulos", tipo: "multipla", valor: modulosIniciais(doPlano, escolhaModulos, superConta),
      opcoes: MODULOS.map(m => ({ ...m, desabilitado: !superConta && !doPlano.includes(m.valor), rotulo: m.rotulo + (!doPlano.includes(m.valor) ? " (fora do plano)" : "") })),
      ajuda: "Vêm marcados pelo plano. Desmarque o que o cliente não contratou. CRM e Conversas andam juntos." }));
    const cbs = caixaModNovo.querySelectorAll("input[type=checkbox]");
    for (const cb of cbs) cb.addEventListener("change", () => {
      const outro = [...cbs].find(x => x.value === ({ crm: "conversas", conversas: "crm" })[cb.value]);
      if (outro && !outro.disabled) outro.checked = cb.checked;
      escolhaModulos = [...cbs].filter(x => x.checked).map(x => x.value);
    });
  };
  pintarModulosNovo();
  const selPlanoTecNovo = form.querySelector("select[name=plano_tecnico]");
  if (selPlanoTecNovo) selPlanoTecNovo.addEventListener("change", pintarModulosNovo);
  // DU-210: a prévia do link que o cliente vai usar
  const previaLink = h("p", { class: "campo-ajuda adm-slug-previa mono", "aria-live": "polite" });
  const orgAlvo = () => (superConta ? orgDe(selOrgNovo ? selOrgNovo.value : orgPadrao) : minhaOrg);
  // UCB-002: pacote (Nexus) só para a plataforma; plano técnico só para revenda. O super alterna conforme a org escolhida.
  const pintarOferta = () => {
    const comPacote = pacoteObrigatorio(ctx.sessao, orgAlvo());
    campoPacote.hidden = !comPacote;
    for (const r of campoPacote.querySelectorAll("input[type=radio]")) r.required = comPacote;
    const cp = campoPlanoTec;
    if (cp) {
      cp.hidden = comPacote;
      if (!comPacote) {
        const o = orgAlvo();
        const sel = cp.querySelector("select");
        const sug = planoDeAcessoNovo({ superConta, planoPadraoOrg: padraoOrg, planos: ps, orgEscolhida: o });
        if (sel && sug && sel.querySelector(`option[value="${sug}"]`)) sel.value = sug;
      }
    }
  };
  if (selOrgNovo) selOrgNovo.addEventListener("change", pintarOferta);
  pintarOferta();
  // DU-196: trocar a revenda, o plano ou o pacote redesenha os módulos
  if (selOrgNovo) selOrgNovo.addEventListener("change", pintarModulosNovo);
  campoPacote.addEventListener("change", pintarModulosNovo);
  pintarModulosNovo();
  const nome = form.querySelector("input[name=nome]"), slug = form.querySelector("input[name=slug]");
  // plano 1000 · AS-168: «Vamos usar o modelo: …» ao digitar o segmento, com opção de trocar
  const inpSegNovo = form.querySelector("input[name=segmento]");
  const selModelo = h("select", { class: "sel adm-modelo-sel", "aria-label": "Modelo do cliente" }, VERTICAIS.map(v => h("option", { value: v.valor }, v.rotulo)));
  const linhaModeloNovo = h("p", { class: "campo-ajuda adm-modelo" }, h("span", null, "Vamos usar o modelo: "), selModelo);
  let modeloMexido = false;
  selModelo.addEventListener("change", () => { modeloMexido = true; });
  const pintarModeloNovo = () => { if (!modeloMexido) selModelo.value = verticalPorSegmento(inpSegNovo.value); };
  if (inpSegNovo) { inpSegNovo.addEventListener("input", pintarModeloNovo); inpSegNovo.closest("[data-campo]") ? inpSegNovo.closest("[data-campo]").appendChild(linhaModeloNovo) : inpSegNovo.parentNode.appendChild(linhaModeloNovo); pintarModeloNovo(); }
  let slugMexido = false;
  const conferirSlug = conferidorDeSlug(ctx, slug, null);
  // plano 1500c · UCB-102: o slug sugerido pelo nome só é conferido quando a pessoa sai do nome (não a cada letra digitada)
  // plano 2000d · DU-210: «Link do cliente: …/app/#/?c=clinica-x» embaixo do endereço curto
  const dominioAg = minhaOrg && minhaOrg.dominio_ativo ? minhaOrg.dominio_ativo : null;
  const pintarPrevia = () => { previaLink.textContent = slug.value ? `Link do cliente: ${linkEntradaCliente(typeof location !== "undefined" ? location.origin : "", slug.value, superConta ? null : dominioAg)}` : ""; };
  (slug.closest("[data-campo]") || slug.parentNode).appendChild(previaLink);
  nome.addEventListener("input", () => { if (!slugMexido) slug.value = sugerirSlug(nome.value); pintarPrevia(); });
  nome.addEventListener("blur", () => { if (!slugMexido && slug.value) conferirSlug(); });
  slug.addEventListener("input", () => { slugMexido = true; conferirSlug(); pintarPrevia(); });
  const selStatus = form.querySelector("select[name=status]");
  const campoDias = form.querySelector("[data-campo=dias]");
  let pacoteCriado = "essencial";
  let enviadoComercial = null, emailAdmCriar = "";      // plano 2000d · DU-185 / DU-186
  const ajustarDias = () => { campoDias.hidden = selStatus.value !== "teste"; };
  selStatus.addEventListener("change", ajustarDias); ajustarDias();
  // plano 1000b · UB-112: «Termina em dd/mm/aaaa» ao lado dos dias; fora de 1–90 vira erro na hora (antes era corrigido em silêncio)
  const inpDias = form.querySelector("input[name=dias]");
  const fimTeste = h("p", { class: "campo-ajuda adm-teste-fim", "aria-live": "polite" });
  if (campoDias) campoDias.appendChild(fimTeste);
  const pintarFimTeste = () => {
    const n = diasDeTesteValidos(inpDias && inpDias.value);
    fimTeste.textContent = n ? `Termina em ${ui.dataBR(isoMais(ui.hojeSP(), n))}.` : "";
    ui.marcarErro(form, "dias", n || !String(inpDias && inpDias.value || "").trim() ? null : "Use de 1 a 90 dias.");
  };
  if (inpDias) { inpDias.addEventListener("input", pintarFimTeste); pintarFimTeste(); }

  const r = await ui.modal({
    titulo: "Novo cliente", corpo: form, largura: "g",
    descricao: pacoteObrigatorio(ctx.sessao, orgAlvo()) ? "Registre o segmento e as necessidades com suas próprias palavras e escolha uma das três ofertas comerciais."
      : "Registre o segmento e as necessidades com suas próprias palavras e escolha o plano do cliente.",
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Criar cliente", tipo: "primario", fn: async () => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        // plano 1500c · UCB-116: nome só com espaços não passa
        if (String(d.nome || "").trim().length < 2) { ui.marcarErro(form, "nome", "Informe o nome."); return false; }
        // plano 1500c · UCB-115: sem hífen no começo, no fim ou dobrado
        if (!slugValido(d.slug)) { ui.marcarErro(form, "slug", "Use de 2 a 40 letras minúsculas, números ou hífen (sem hífen no começo, no fim ou dois seguidos)."); return false; }
        const org = orgAlvo();
        const comPacote = pacoteObrigatorio(ctx.sessao, org);
        const oferta = comPacote ? PACOTES_COMERCIAIS.find(p => p.id === d.pacote_comercial) : null;
        if (comPacote && !oferta) { ui.marcarErro(form, "pacote_comercial", "Escolha um dos três planos comerciais."); return false; }
        if (oferta) pacoteCriado = oferta.id;
        // plano 1500c · UCB-003: o plano padrão da revenda (a escolhida pelo super, ou a do gestor) vale de verdade
        const planoAcesso = planoDeAcessoNovo({ superConta, oferta, planoPadraoOrg: padraoOrg, planos: ps, orgEscolhida: superConta ? org : minhaOrg,
          escolhido: comPacote ? null : d.plano_tecnico || null });
        if (!planoAcesso || !ps.some(p => p.id === planoAcesso && (superConta || p.ativo !== false))) {
          ui.marcarErro(form, comPacote ? "pacote_comercial" : "plano_tecnico", "O plano de acesso correspondente não está disponível para esta revenda. Fale com a plataforma."); return false;
        }
        const dias = diasDeTesteValidos(d.dias);
        if (d.status === "teste" && !dias) { ui.marcarErro(form, "dias", "Use de 1 a 90 dias."); return false; }      // UB-112
        const teste = d.status === "teste" ? isoMais(ui.hojeSP(), dias) : null;
        // plano 2000d · DU-185: o contato (com CPF/CNPJ conferido); DU-186: o e-mail do administrador
        const contato = lerContato(d);
        if (contato.erro) { ui.marcarErro(form, contato.erro.campo, contato.erro.msg); return false; }
        const emailAdm = String(d.email_admin || "").trim().toLowerCase();
        if (emailAdm && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailAdm)) { ui.marcarErro(form, "email_admin", "Esse e-mail não parece válido."); return false; }
        const p = { nome: String(d.nome).trim(), slug: d.slug, vertical: VERTICAIS.some(v => v.valor === selModelo.value) ? selModelo.value : verticalPorSegmento(d.segmento), plano: planoAcesso, status: d.status, teste_ate: teste,
          comercial: { pacote: oferta ? oferta.id : null, segmento: d.segmento || "", especificacoes: d.especificacoes || "" } };
        if (contato.valor) p.comercial.contato = contato.valor;
        const ets = separarEtiquetas(d.etiquetas);
        if (ets.length) p.comercial.etiquetas = ets;                                  // DU-191
        // DU-196: os módulos escolhidos dentro do plano
        p.modulos = modulosIniciais(((ps.find(x => x.id === planoAcesso) || {}).modulos) || [], Array.isArray(d.modulos) ? d.modulos : null, superConta);
        if (d.copiar_de) p.copiar_de = d.copiar_de;                                    // DU-180
        enviadoComercial = p.comercial; emailAdmCriar = emailAdm;
        if (superConta && d.org_id) p.org_id = d.org_id;
        try {
          return await api.rpc("nx_cliente_admin_salvar", { p_cliente: p });
        } catch (e) {
          if (e.codigo === "slug_em_uso") { ui.marcarErro(form, "slug", "Esse endereço já está em uso."); return false; }
          if (e.codigo === "dados_invalidos" && e.hint === "comercial") { ui.marcarErro(form, "especificacoes", "Revise as especificações informadas."); return false; }
          throw e;
        }
      } },
    ],
  });
  if (r && r.id) {
    const comPacote = !!(r.comercial && r.comercial.pacote);
    ui.toast(comPacote ? `Cliente criado com ${rotuloPacote(r.comercial.pacote || pacoteCriado)}.` : `Cliente criado no plano ${nomePlano(r.plano)}.`, { tipo: "ok" });
    // plano 2000d: servidor que ainda não guarda contato/etiquetas diz isso (em vez de sumir com o que foi digitado)
    const perdidas = chavesNaoGuardadas(enviadoComercial, r, ["contato", "etiquetas"]);
    if (perdidas.length) ui.toast(`O servidor ainda não guarda: ${perdidas.map(k => ROTULO_CHAVE_COMERCIAL[k]).join(", ")}.`, { tipo: "info", ms: 8000 });
    try { await ctx.shell.recarregarSessao(); } catch { /* o seletor atualiza na próxima entrada */ }
    // plano 2000d · DU-186: com o e-mail do administrador, o convite sai agora e o link aparece aqui mesmo
    if (emailAdmCriar) {
      let cv = null;
      try { cv = await api.rpc("nx_convite_criar", { p_cliente: r.id, p_dados: { papel: "admin", dias: Number(DIAS_CONVITE_ADMIN), nome: null, email: emailAdmCriar }, p_org: null }); }
      catch (e) { ui.toast(`Cliente criado, mas o convite não saiu: ${api.mensagemErro(e)} Gere pelo detalhe.`, { tipo: "erro" }); }
      if (cv) {
        const lc = linkConvite(cv.link, typeof location !== "undefined" ? location : null, { superConta });
        let produto = "sistema"; try { produto = ctx.shell.marcaEfetiva().produto || produto; } catch { /* ok */ }
        await ui.modal({ titulo: "Convite do administrador", largura: "m", corpo: h("div", { class: "pilha adm-convite-criado" },
          h("p", null, `Envie para ${emailAdmCriar}. Só este e-mail poderá aceitar.`),
          lc.link ? ui.blocoLink(lc.link, { rotulo: "Link do convite", textoWhats: `Olá! Aqui está o acesso de administrador da ${r.nome} no ${produto}. Crie sua conta por este link:` })
            : h("div", { class: "aviso aviso-ruim adm-link-ruim", role: "alert" }, ui.icone("alerta"), h("p", null, lc.motivo)),
          cv.expira_em ? h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(cv.expira_em)} e só uma vez.`) : null),
          acoes: [{ rotulo: "Abrir o cliente", tipo: "primario", valor: true }] });
        ctx.navegar(`#/admin/clientes/${r.id}`);
        return;
      }
    }
    // plano 1500c · UCB-090: o detalhe abre com o próximo passo em destaque (convidar o administrador)
    ctx.navegar(`#/admin/clientes/${r.id}?novo=1`);
  }
}

/** plano 1000 · AS-169: confere o endereço enquanto digita (400 ms parado) com nx_clientes_admin {busca: slug} — aviso embaixo do campo.
    plano 1500c · UCB-102: cache por slug já conferido (voltar a um endereço não chama de novo). */
function conferidorDeSlug(ctx, inp, idProprio) {
  const { ui, api } = ctx;
  const campo = inp.closest("[data-campo]") || inp.parentNode;
  const aviso = ui.h("small", { class: "campo-erro adm-slug-tomado", role: "status", hidden: true });
  campo.appendChild(aviso);
  let seq = 0;
  const cache = new Map();
  const conferir = ui.debounce(async () => {
    const n = ++seq, v = inp.value.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(v)) { aviso.hidden = true; return; }
    let achado = null;
    try {
      if (!cache.has(v)) cache.set(v, slugTomado(await api.rpc("nx_clientes_admin", { p_filtro: { busca: v } }), v, idProprio));
      achado = cache.get(v);
    } catch { return; }
    if (n !== seq) return;
    aviso.hidden = !achado;
    aviso.textContent = achado ? `Esse endereço já é de «${achado.nome}». Escolha outro.` : "";
  }, 400);
  return conferir;
}

/** plano 1000b · UB-112: dias de teste digitados → inteiro de 1 a 90, ou null (fora da faixa, vazio ou não numérico). */
export function diasDeTesteValidos(v) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim().replace(",", "."));
  return String(v ?? "").trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 90 ? n : null;
}

export function isoMais(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/* ============================================================
   DETALHE DO CLIENTE
   ============================================================ */
async function telaCliente(ctx, corpo, id) {
  const { ui, api } = ctx;
  const h = ui.h;
  const superConta = !!ctx.sessao.conta.super;
  corpo.appendChild(ui.esqueleto("cartoes", 3));
  let cli, ps;
  try {
    const [lista, planosLista] = await Promise.all([api.rpc("nx_clientes_admin", { p_filtro: { id } }), planos(ctx)]);
    cli = lista && lista[0];
    ps = planosLista;
    if (!cli) throw Object.assign(new Error("cliente_nao_encontrado"), { codigo: "cliente_nao_encontrado" });
  } catch (e) {
    ui.limpar(corpo);
    corpo.append(ui.erroCartao(e, () => telaCliente(ctx, (ui.limpar(corpo), corpo), id)));
    return;
  }
  ctx.titulo(cli.nome);
  ui.limpar(corpo);
  const hojeDet = ui.hojeSP();
  // plano 1000 · AS-162: cabeçalho redesenhável (salvar atualiza nome, situação, plano e pílulas sem remontar a tela)
  const cabNome = h("h1", { class: "titulo-sec" }, cli.nome);
  const cabPilulas = h("div", { class: "linha" });
  const cabAvatar = h("span", { class: "adm-cab-av" }, ui.avatar(cli.nome, cli.id));
  function pintarCabecalho() {
    const s = statusDe(cli.status);
    cabNome.textContent = cli.nome;
    cabAvatar.replaceChildren(ui.avatar(cli.nome, cli.id));
    const venc = testeVencidoHa(cli, hojeDet);
    const logo = rotuloFimTeste(cli, hojeDet);                 // plano 1500c · UCB-084
    const nums = estadoNumerosCliente(cli.canais);             // plano 1500c · UCB-100: o WhatsApp também no cabeçalho
    cabPilulas.replaceChildren(...[ui.pilula(s.rotulo, s.cor), ui.pilula(nomePlano(cli.plano), cli.plano === "interno" ? "sec" : "prim"),
      // plano 1500c · UCB-002/UCB-005: pacote comercial e «Nexus» só para a plataforma (white-label)
      !superConta ? null : cli.comercial && cli.comercial.pacote ? ui.pilula(rotuloPacote(cli.comercial.pacote), "info") : ui.pilula("Sem pacote", "aten"),
      venc ? ui.pilula(rotuloTesteVencido(venc), "ruim", { icone: "alerta" }) : logo ? ui.pilula(`Teste ${logo.texto}`, logo.tom, { icone: "relogio" }) : null,
      nums && nums.total ? ui.pilula(nums.rotulo, nums.tom, { icone: nums.tom === "ok" ? "check" : nums.tom === "ruim" ? "alerta" : "whatsapp", class: "adm-cab-numeros" }) : null,
      cli.ativo === false ? ui.pilula(`Pausado ${quemPausa(superConta)}`, "ruim", { icone: "cadeado" }) : null,
      // plano 2000d · DU-191: as etiquetas no cabeçalho
      ...etiquetasCliente(cli).map(e => h("span", { class: "adm-etiqueta" }, e)),
      h("span", { class: "fraco" }, `${cli.org ? cli.org.nome : ""} · desde ${ui.dataBR(cli.criado_em)}`)].filter(Boolean));
  }
  pintarCabecalho();
  // plano 2000d · DU-198: «o que este cliente vê» — a marca efetiva (agência + tema da empresa), com o caminho para editar
  const marcaVista = (() => {
    let ef = null;
    try { ef = marcaDoCliente(ctx.shell.tema, cli); } catch { ef = null; }
    if (!ef) return null;
    const cores = ef.cores || {};
    const logo = ef.logo || ef.logo_claro;
    return h("div", { class: "adm-marca-vista", role: "group", "aria-label": `O que este cliente vê: ${ef.produto || "marca padrão"}` },
      h("span", { class: "adm-marca-vista-logo", style: { "--cor": ui.corOk(cores.fundo) } }, logo ? h("img", { src: logo, alt: "" }) : ui.icone("pincel")),
      h("span", { class: "adm-marca-vista-txt" }, h("small", { class: "fraco" }, "O cliente vê"), h("b", null, ef.produto || "Marca padrão")),
      h("span", { class: "adm-marca-vista-cores", "aria-hidden": "true" }, ["primaria", "secundaria"].map(k => h("span", { class: "rev-cor", style: { "--cor": ui.corOk(cores[k]) } }))),
      h("a", { class: "bt bt-fant bt-p", href: "#/config/marca?de=org" }, ui.icone("editar"), "Editar marca"));
  })();

  // ---- ações de topo
  const btEntrar = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("seta-dir"), "Entrar");
  // plano 1000b · UB-102: entrar como suporte com try/catch — falha vira toast e o botão continua utilizável (antes a promessa rejeitava muda)
  // UB-226: o mesmo caminho serve ao «Ver números» (entra e abre #/config/numeros)
  async function entrarComo(botao, destino) {
    lembrarVoltaAdmin(`#/admin/clientes/${cli.id}`);      // plano 1000 · AS-248: o «Sair» da faixa de suporte volta para este cliente
    try {
      await ui.carregando(botao, (async () => {
        if (!ctx.shell.clientes().some(c => c.id === cli.id)) await ctx.shell.recarregarSessao();
        await ctx.shell.escolherCliente(cli.id, { remontar: false });
      })());
    } catch (e) {
      ui.toast(`Não deu para entrar na ${cli.nome}. ${api.mensagemErro(e)}`, { tipo: "erro" });
      return;
    }
    ctx.navegar(destino);
  }
  // plano 1500c · UCB-091: antes de entrar, um motivo opcional vai para a auditoria (nx_suporte_entrar); servidor sem a função segue igual
  async function registrarEntrada(destino, botao) {
    const form = h("form", { class: "pilha", novalidate: true },
      h("p", null, `Você vai ver a ${cli.nome} como a equipe dela vê. A entrada fica registrada.`),
      ui.campo({ rotulo: "Motivo (opcional)", nome: "motivo", max: 200, autocomplete: "off", placeholder: "Ex.: conferir o número a pedido do cliente" }));
    const r = await ui.modal({ titulo: `Entrar na ${cli.nome}`, corpo: form, largura: "p", acoes: [{ rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Entrar", tipo: "primario", fn: async () => ({ motivo: String(ui.lerForm(form).motivo || "").trim() }) }] });
    if (!r) return;
    try { await api.rpc("nx_suporte_entrar", { p_cliente: cli.id, p_motivo: r.motivo || null }); }
    catch (e) { if (!semFuncao(e)) { ui.toast(`Não deu para registrar a entrada. ${api.mensagemErro(e)}`, { tipo: "erro" }); return; } }
    return entrarComo(botao, destino);
  }
  btEntrar.addEventListener("click", () => registrarEntrada("#/", btEntrar));
  // plano 2000d · DU-206: o papel «financeiro» da revenda não entra no ambiente do cliente
  if (papelRevenda(ctx.sessao) === "financeiro") btEntrar.hidden = true;
  // plano 2000d · DU-189: o relatório do mês com a marca da agência (HTML para imprimir/salvar em PDF)
  const btRelatorio = h("button", { type: "button", class: "bt bt-fant adm-relatorio" }, ui.icone("grafico"), "Relatório do mês");
  btRelatorio.addEventListener("click", () => ui.carregando(btRelatorio, relatorioDoMes()));
  async function relatorioDoMes() {
    let r = null;
    try { r = await api.rpc("nx_cliente_relatorio_mes", { p_cliente: cli.id }); } catch (e) { if (!semFuncaoAdm(e)) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); return; } }
    const u = cli.uso || {};
    const numeros = r && Array.isArray(r.numeros) ? r.numeros : [
      { rotulo: "Contatos na base", valor: ui.num(u.contatos || 0) },
      { rotulo: "Pessoas da equipe usando", valor: ui.num(u.usuarios || 0) },
      { rotulo: "Números de WhatsApp", valor: ui.num(u.canais || 0) },
      { rotulo: "Automações ligadas", valor: ui.num(u.automacoes || 0) },
      { rotulo: "Sugestões de IA no mês", valor: ui.num(u.ia_mes || 0) }];
    let marca = {};
    try { marca = marcaDoCliente(ctx.shell.tema, cli) || {}; } catch { /* sem marca */ }
    const mes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date());
    const html = htmlRelatorioMes({ marca, cliente: cli, mes: (r && r.periodo) || mes, numeros });
    if (baixarArquivoTexto(html, `relatorio-${cli.slug || "cliente"}-${ui.hojeSP().slice(0, 7)}.html`, "text/html")) ui.toast(r ? "Relatório baixado." : "Relatório baixado com os números de uso de agora (o resumo do período ainda não vem deste servidor).", { tipo: r ? "ok" : "info" });
    else ui.toast("O navegador não deixou baixar o arquivo.", { tipo: "erro" });
  }
  // plano 2000d · DU-208: exportar tudo do cliente (LGPD/saída), quando o servidor gera o pacote
  const btExportar = temRecurso(ctx.sessao, "exportar_cliente") ? h("button", { type: "button", class: "bt bt-fant adm-exportar" }, ui.icone("baixar"), "Exportar dados") : null;
  if (btExportar) btExportar.addEventListener("click", async () => {
    if (!(await ui.confirmar({ titulo: `Exportar todos os dados de ${cli.nome}?`, rotulo: "Gerar arquivo", texto: "Contatos, negócios e conversas num arquivo. O pedido fica registrado com o seu nome e o link vale por 24 horas." }))) return;
    try {
      const r = await ui.carregando(btExportar, api.rpc("nx_cliente_exportar", { p_cliente: cli.id }));
      if (r && r.url) { ui.toast("Arquivo pronto.", { tipo: "ok" }); if (typeof window !== "undefined" && window.open) window.open(r.url, "_blank", "noopener"); }
      else ui.toast("O arquivo está sendo gerado. Volte aqui em alguns minutos.", { tipo: "info" });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  });
  // plano 2000d · DU-199: a plataforma move o cliente para outra revenda (o servidor confere os limites do destino)
  const btTransferir = superConta && temRecurso(ctx.sessao, "transferir_cliente") ? h("button", { type: "button", class: "bt bt-fant adm-transferir" }, ui.icone("transferir"), "Transferir") : null;
  if (btTransferir) btTransferir.addEventListener("click", async () => {
    let os = [];
    try { os = (await orgs(ctx)).filter(o => o && (!cli.org || o.id !== cli.org.id)); } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); return; }
    if (!os.length) { ui.toast("Não há outra revenda para receber o cliente.", { tipo: "info" }); return; }
    const fm = h("form", { class: "pilha", novalidate: true }, ui.campo({ rotulo: "Para qual revenda", nome: "org", tipo: "select", valor: os[0].id,
      opcoes: os.map(o => ({ valor: o.id, rotulo: `${o.nome}${o.tipo === "plataforma" ? " (plataforma)" : ""}` })), ajuda: "O cliente passa a usar a marca e os limites da revenda de destino." }));
    const destino = await ui.modal({ titulo: `Transferir ${cli.nome}`, corpo: fm, largura: "p", acoes: [{ rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Transferir", tipo: "primario", fn: async () => ui.lerForm(fm).org }] });
    if (!destino) return;
    try {
      const r = await ui.carregando(btTransferir, api.rpc("nx_cliente_transferir_org", { p_cliente: cli.id, p_org: destino }));
      cli = { ...cli, ...(r || {}), org: (r && r.org) || os.find(o => o.id === destino) || cli.org };
      pintarCabecalho();
      ui.toast(`${cli.nome} agora é da ${cli.org ? cli.org.nome : "nova revenda"}.`, { tipo: "ok" });
    } catch (e) { ui.toast(e && e.codigo === "limite_excedido" ? "A revenda de destino já está no limite de clientes, usuários ou números." : api.mensagemErro(e), { tipo: "erro" }); }
  });
  const btNumeros = typeof cli.modulos === "object" && Array.isArray(cli.modulos) && !cli.modulos.includes("conversas") ? null
    : h("button", { type: "button", class: "bt bt-sec adm-ver-numeros" }, ui.icone("whatsapp"), "Ver números");
  if (btNumeros) btNumeros.addEventListener("click", () => registrarEntrada("#/config/numeros", btNumeros));      // UCB-091
  const btConvite = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("convidar"), "Gerar convite do administrador");
  let convitesPend = [];        // preenchido pela lista de usuários (nx_usuarios_listar → convites)
  btConvite.addEventListener("click", async () => {
    // plano 1000 · AS-159: cada clique criava mais um convite; com um já aguardando, pergunta antes de gerar outro
    const admins = convitesPend.filter(c => !c.papel || c.papel === "admin");
    if (admins.length && !(await ui.confirmar({ titulo: "Já existe um convite aguardando", rotulo: "Gerar outro link",
      texto: `${admins.length === 1 ? "Há 1 convite de administrador" : `Há ${admins.length} convites de administrador`} ainda não usado${admins.length === 1 ? "" : "s"}. Gerar outro cria um link novo (os anteriores continuam valendo até você revogar em «Usuários com acesso»).` }))) return;
    // plano 1000b · UB-201: a validade é escolhida antes de gerar (1 a 30 dias, padrão 3) — a mesma régua do convite em Usuários
    const form = h("form", { class: "pilha", novalidate: true },
      h("p", null, `Envie para quem vai administrar a ${cli.nome}. O link cria a conta de administrador (ou acrescenta o acesso, se a pessoa já usa o sistema).`),
      // plano 1500c · UCB-042: nome e e-mail opcionais, como no convite de Usuários (o e-mail trava o convite)
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Nome (opcional)", nome: "nome", max: 80, autocomplete: "off" }),
        ui.campo({ rotulo: "E-mail (opcional)", nome: "email", tipo: "email", autocomplete: "off", ajuda: "Se preencher, só este e-mail poderá aceitar o convite." })),
      ui.campo({ rotulo: "O link vale por", nome: "dias", tipo: "select", valor: DIAS_CONVITE_ADMIN, opcoes: OPCOES_VALIDADE_CONVITE }));
    let criado = null;
    try {
      await ui.modal({
        titulo: "Convite do administrador", corpo: form, largura: "m",
        acoes: [
          { rotulo: "Cancelar", tipo: "neutro" },
          { rotulo: "Gerar link", tipo: "primario", fn: async m => {
            if (criado) return true;
            const dl = ui.lerForm(form);
            const dias = Number(dl.dias) || Number(DIAS_CONVITE_ADMIN);
            ui.marcarErro(form, null);
            const nomeCv = String(dl.nome || "").trim(), emailCv = String(dl.email || "").trim().toLowerCase();
            if (nomeCv && nomeCv.length < 2) { ui.marcarErro(form, "nome", "Use de 2 a 80 letras no nome."); return false; }
            if (emailCv && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailCv)) { ui.marcarErro(form, "email", "Esse e-mail não parece válido."); return false; }
            let r;
            try { r = await api.rpc("nx_convite_criar", { p_cliente: cli.id, p_dados: { papel: "admin", dias, nome: nomeCv || null, email: emailCv || null }, p_org: null }); }
            catch (e) {
              if (e && e.codigo === "email_invalido") { ui.marcarErro(form, "email", "Esse e-mail não parece válido."); return false; }
              if (e && e.codigo === "nome_invalido") { ui.marcarErro(form, "nome", "Use de 2 a 80 letras no nome."); return false; }
              throw e;
            }
            criado = r;
            convitesPend.push({ id: r.id || null, papel: "admin", nome: nomeCv || null, email: emailCv || null, expira_em: r.expira_em || null });   // o próximo clique já sabe que há um aguardando
            // G5 [H305]: link relativo aberto num host que não serve o app (Pages, localhost) sairia quebrado → aviso no lugar do link
            const lc = linkConvite(r.link, typeof location !== "undefined" ? location : null, { superConta });      // plano 2000d · DU-194
            ui.limpar(m.corpo);
            m.corpo.append(h("div", { class: "pilha" },
              lc.link ? ui.blocoLink(lc.link, { rotulo: "Link do convite", textoWhats: `Olá! Aqui está o acesso de administrador da ${cli.nome} no ${ctx.shell.marcaEfetiva().produto}. Crie sua conta por este link:` })
                : h("div", { class: "aviso aviso-ruim adm-link-ruim", role: "alert" }, ui.icone("alerta"), h("p", null, lc.motivo)),
              h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(r.expira_em)} e só uma vez.`)));
            const bt = m.el.querySelector(".modal-rod [data-tipo=primario]"); if (bt) bt.textContent = "Concluir";
            const cancelar = m.el.querySelector(".modal-rod [data-tipo=neutro]"); if (cancelar) cancelar.hidden = true;
            return false;
          } },
        ],
      });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    // plano 1000b · UB-202: o convite gerado entra na lista «aguardando» sem recarregar a tela
    if (criado) pintarConvitesAdmin();
  });

  // ---- formulário: acesso ao Órbita, pacote comercial, segmento e especificações
  const planoAtual = () => ps.find(p => p.id === form.querySelector("select[name=plano]").value) || ps.find(p => p.id === cli.plano) || { modulos: [], limites: {} };
  const opcoesPlano = ps.some(p => p.id === cli.plano) ? ps : [{ id: cli.plano, nome: cli.plano, modulos: cli.modulos, limites: {} }, ...ps];
  const comercial = cli.comercial || {};
  const verPrecos = papelRevenda(ctx.sessao) !== "suporte";      // plano 2000d · DU-206
  // plano 1500c · UCB-094: o campo vazio diz qual é o limite do plano («plano: 5» ou «plano: sem limite»)
  const placeholderLimite = (k, plano = null) => {
    const p = plano || ps.find(x => x.id === cli.plano) || { limites: {} };
    const v = p.limites ? p.limites[k] : null;
    return `plano: ${v === null || v === undefined ? "sem limite" : v}`;
  };
  let segmentoInicial = comercial.segmento || (VERTICAIS.find(v => v.valor === cli.vertical) || {}).rotulo || "";
  const segmento = ui.campo({ rotulo: "Segmento do cliente", nome: "segmento", valor: segmentoInicial, max: 120,
    placeholder: "Escreva livremente o ramo de atividade…",
    ajuda: "Sem opções predefinidas. Clínicas odontológicas, oficinas e lojas reconhecidas recebem o modelo correspondente; os demais usam o genérico." });
  const especificacoes = ui.campo({ rotulo: "Especificações do cliente", nome: "especificacoes", tipo: "textarea", valor: comercial.especificacoes || "", max: 5000, linhas: 4,
    placeholder: "Necessidades, objetivos, entregas combinadas e observações…", ajuda: "Texto livre. Até 5.000 caracteres." });
  segmento.classList.add("inteiro"); especificacoes.classList.add("inteiro");
  // plano 1000 · AS-168: o modelo que o segmento escrito aplica, à vista (antes a escolha odonto/oficina/loja/genérico era silenciosa)
  const linhaModelo = h("p", { class: "campo-ajuda adm-modelo", "aria-live": "polite" });
  const inpSeg = segmento.querySelector("input");
  const pintarModelo = () => {
    const v = verticalAoEditar(inpSeg.value, segmentoInicial, cli.vertical);
    const rot = (VERTICAIS.find(x => x.valor === v) || { rotulo: "Outro negócio" }).rotulo;
    linhaModelo.textContent = v !== cli.vertical ? `Ao salvar, passa a usar o modelo: ${rot}.` : `Modelo em uso: ${rot}.`;
  };
  if (inpSeg) { inpSeg.addEventListener("input", pintarModelo); segmento.appendChild(linhaModelo); pintarModelo(); }
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome", nome: "nome", valor: cli.nome, obrigatorio: true, max: 80 }),
      ui.campo({ rotulo: "Endereço curto", nome: "slug", valor: cli.slug, obrigatorio: true, max: 40 }),      // plano 2000d · DU-352
      // plano 1500c · UCB-005: sem o nome do produto da plataforma (a revenda vende com a própria marca)
      // plano 2000d · DU-206: o papel «suporte» da revenda não vê preços
      ui.campo({ rotulo: "Plano de acesso", nome: "plano", tipo: "select", valor: cli.plano, opcoes: opcoesPlano.map(p => ({ valor: p.id, rotulo: `${p.nome}${p.preco_mensal != null && verPrecos ? ` — ${ui.brl(p.preco_mensal, { centavos: false })}/mês` : ""}` })) }),
      ui.campo({ rotulo: "Situação", nome: "status", tipo: "select", valor: cli.status, opcoes: STATUS }),
      ui.campo({ rotulo: "Fim do teste", nome: "teste_ate", tipo: "data", valor: cli.teste_ate || "" }),
      // plano 2000d · DU-182: o que a agência cobra de fato (entra na receita mensal no lugar do preço do plano)
      verPrecos ? ui.campo({ rotulo: "Valor mensal cobrado (R$)", nome: "valor_mensal", tipo: "moeda", valor: valorCobrado(cli) ?? "", ajuda: "Em branco = o preço do plano." }) : null,
      verPrecos ? ui.campo({ rotulo: "Dia de vencimento", nome: "dia_vencimento", tipo: "numero", min: 1, max: 28, valor: comercial.dia_vencimento ?? "" }) : null,
      // plano 2000d · DU-191
      ui.campo({ rotulo: "Etiquetas", nome: "etiquetas", max: 300, valor: etiquetasCliente(cli).join(", "), autocomplete: "off", placeholder: "Ex.: clínicas, Taubaté", ajuda: "Separe por vírgula." }),
      segmento, especificacoes),
    // plano 2000d · DU-185: o contato do cliente
    h("fieldset", { class: "campo adm-contato" }, h("legend", null, "Contato do cliente"),
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Responsável", nome: "ct_responsavel", max: 80, valor: contatoCliente(cli).responsavel || "", autocomplete: "off" }),
        ui.campo({ rotulo: "WhatsApp", nome: "ct_whatsapp", tipo: "tel", valor: contatoCliente(cli).whatsapp || "", autocomplete: "off" }),
        ui.campo({ rotulo: "E-mail", nome: "ct_email", tipo: "email", valor: contatoCliente(cli).email || "", autocomplete: "off" }),
        ui.campo({ rotulo: "CPF ou CNPJ", nome: "ct_documento", max: 18, valor: contatoCliente(cli).documento ? formatarDocumento(contatoCliente(cli).documento) : "", autocomplete: "off" }))),
    // plano 1500c · UCB-002: o pacote comercial (ESPEC §1.4) é da plataforma — o gestor de revenda não vê os pacotes nem os preços da Nexus
    superConta ? campoPacoteComercial(ui, comercial.pacote || null, { comercial }) : null,
    // G5 (contrato 9): o interruptor da Nexus. Só aparece quando o servidor diz o estado (cli.ativo) e só a plataforma muda
    superConta && typeof cli.ativo === "boolean" ? comClasse(ui.campo({ rotulo: "Cliente ativo", nome: "ativo", tipo: "interruptor", valor: cli.ativo,
        // plano 1000b · UB-120: ajuda curta; o detalhe (anúncios, relatórios, rastreio, vigia, sessão aberta) vai no diálogo de confirmação
        ajuda: "Desligado: a equipe do cliente não entra e as rotinas param. Os dados ficam guardados." }), "adm-ativo") : null,
    h("div", { class: "campo-modulos" }),
    superConta ? h("fieldset", { class: "campo" }, h("legend", null, "Limites extras (só a plataforma)"),
      h("p", { class: "campo-ajuda" }, "Em branco = o limite do plano. 0 bloqueia o recurso (nenhum permitido)."),
      h("div", { class: "form-grade" }, CHAVES_LIMITE.map(k => ui.campo({ rotulo: k.rotulo, nome: `lim_${k.chave}`, tipo: "numero", min: 0,
        valor: cli.limites_extra && cli.limites_extra[k.chave] != null ? cli.limites_extra[k.chave] : "", placeholder: placeholderLimite(k.chave) })))) : null,
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Salvar cliente")));      // plano 2000d · DU-350

  const caixaMod = form.querySelector(".campo-modulos");
  const inpSlugDet = form.querySelector("input[name=slug]");
  inpSlugDet.addEventListener("input", conferidorDeSlug(ctx, inpSlugDet, cli.id));      // AS-169
  // plano 2000d · DU-210: a prévia do link que o cliente usa
  const previaDet = h("p", { class: "campo-ajuda adm-slug-previa mono", "aria-live": "polite" });
  const pintarPreviaDet = () => { previaDet.textContent = inpSlugDet.value ? `Link do cliente: ${linkEntradaCliente(typeof location !== "undefined" ? location.origin : "", inpSlugDet.value, cli.org && cli.org.dominio_ativo ? cli.org.dominio_ativo : null)}` : ""; };
  (inpSlugDet.closest("[data-campo]") || inpSlugDet.parentNode).appendChild(previaDet);
  inpSlugDet.addEventListener("input", pintarPreviaDet); pintarPreviaDet();
  function desenharModulos(marcados) {
    ui.limpar(caixaMod);
    const doPlano = planoAtual().modulos || [];
    const opcoes = MODULOS.map(m => ({ ...m, desabilitado: !superConta && !doPlano.includes(m.valor), rotulo: m.rotulo + (!doPlano.includes(m.valor) ? " (fora do plano)" : "") }));
    caixaMod.appendChild(ui.campo({ rotulo: "Módulos ligados", nome: "modulos", tipo: "multipla", valor: marcados, opcoes,
      ajuda: superConta ? "A plataforma pode ligar módulo fora do plano. CRM e Conversas andam juntos." : "Só os módulos do plano. CRM e Conversas andam juntos." }));
    // CRM e Conversas juntos
    const cbs = caixaMod.querySelectorAll("input[type=checkbox]");
    const par = { crm: "conversas", conversas: "crm" };
    for (const cb of cbs) cb.addEventListener("change", () => {
      const outro = [...cbs].find(x => x.value === par[cb.value]);
      if (outro && !outro.disabled) outro.checked = cb.checked;
    });
  }
  desenharModulos(cli.modulos);
  const selPlano = form.querySelector("select[name=plano]");
  let planoAntes = (planoAtual().modulos || []).slice();
  const avisoModulos = h("p", { class: "aviso aviso-aten adm-mod-aviso", role: "status", hidden: true });
  caixaMod.after(avisoModulos);
  selPlano.addEventListener("change", () => {
    // plano 1000 · AS-161: os módulos que a plataforma ligou à mão continuam; os que saíram são ditos (antes o plano novo zerava tudo)
    const atuais = [...caixaMod.querySelectorAll("input[type=checkbox]")].filter(x => x.checked).map(x => x.value);
    const r = modulosAoTrocarPlano({ atuais, planoAntigo: planoAntes, planoNovo: planoAtual().modulos || [], superConta });
    planoAntes = (planoAtual().modulos || []).slice();
    for (const k of CHAVES_LIMITE) { const inp = form.querySelector(`input[name=lim_${k.chave}]`); if (inp) inp.setAttribute("placeholder", placeholderLimite(k.chave, planoAtual())); }      // UCB-094
    desenharModulos(r.marcados);
    ui.limpar(avisoModulos);
    avisoModulos.hidden = !r.sairam.length;
    if (r.sairam.length) avisoModulos.append(ui.icone("alerta"), h("span", null,
      `Fora do plano novo: ${r.sairam.map(v => (MODULOS.find(m => m.valor === v) || { rotulo: v }).rotulo).join(", ")}. Ao salvar, ${r.sairam.length === 1 ? "esse módulo é desligado" : "esses módulos são desligados"}.`));
  });
  const selSt = form.querySelector("select[name=status]");
  const campoTeste = form.querySelector("[data-campo=teste_ate]");
  const inpTeste = form.querySelector("input[name=teste_ate]");
  // plano 1000b · UB-109: «Em teste» sempre com data de fim — vazio ganha hoje + 14 dias (e apagar a data vira erro ao salvar)
  const ajustarTeste = () => {
    campoTeste.hidden = selSt.value !== "teste";
    if (selSt.value === "teste" && inpTeste && !inpTeste.value) inpTeste.value = isoMais(ui.hojeSP(), 14);
  };
  selSt.addEventListener("change", ajustarTeste); ajustarTeste();
  // plano 1500c · UCB-088: «Faltam N dias» ao vivo; UCB-087 / UC-022: «+7 dias» e «+14 dias» a partir do maior entre hoje e o fim atual
  const ajudaTeste = h("p", { class: "campo-ajuda adm-teste-faltam", "aria-live": "polite" });
  const pintarFaltam = () => {
    const n = diasAteFimTeste(inpTeste && inpTeste.value, ui.hojeSP());
    ajudaTeste.textContent = n === null ? "" : n < 0 ? `Terminou há ${-n} ${n === -1 ? "dia" : "dias"}.` : n === 0 ? "Termina hoje." : n === 1 ? "Falta 1 dia." : `Faltam ${n} dias.`;
  };
  const btMais = dias => {
    const b = h("button", { type: "button", class: "bt bt-fant bt-p adm-teste-mais" }, `+${dias} dias`);
    b.addEventListener("click", () => {
      if (!inpTeste) return;
      inpTeste.value = estenderTeste(inpTeste.value, ui.hojeSP(), dias);
      inpTeste.dispatchEvent(new Event("input", { bubbles: true }));
      if (typeof ui.anunciar === "function") ui.anunciar(`Fim do teste: ${ui.dataBR(inpTeste.value)}.`);
    });
    return b;
  };
  /** plano 1500c · UCB-089 / UC-022: «Converter em pagante» — confirma plano e preço e salva a situação «Ativo» (o fim do teste fica como histórico). */
  async function converter(botao) {
    const pl = ps.find(x => x.id === cli.plano);
    const preco = pl && pl.preco_mensal != null ? ` por ${ui.brl(pl.preco_mensal, { centavos: false })}/mês` : "";
    if (!(await ui.confirmar({ titulo: `Converter ${cli.nome} em cliente pagante?`, rotulo: "Converter em pagante",
      texto: `A situação passa a «Ativo» no plano ${nomePlano(cli.plano)}${preco}. A data do fim do teste fica guardada como histórico.` }))) return;
    try {
      const r = await ui.carregando(botao, api.rpc("nx_cliente_admin_salvar", { p_cliente: { id: cli.id, status: "ativo" } }));
      cli = { ...cli, ...r, status: (r && r.status) || "ativo", uso: r && r.uso ? r.uso : cli.uso };
      selSt.value = cli.status; ajustarTeste();
      formSalvo = estadoDoForm();
      pintarCabecalho(); pintarAvisoTeste();
      ui.toast("Cliente convertido em pagante.", { tipo: "ok" });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }
  const btConverter = h("button", { type: "button", class: "bt bt-sec bt-p adm-converter" }, ui.icone("check"), "Converter em pagante");
  btConverter.addEventListener("click", () => converter(btConverter));
  if (campoTeste) campoTeste.append(h("div", { class: "linha adm-teste-atalhos" }, btMais(7), btMais(14), btConverter), ajudaTeste);
  if (inpTeste) { inpTeste.addEventListener("input", pintarFaltam); inpTeste.addEventListener("change", pintarFaltam); }
  pintarFaltam();

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (String(d.nome || "").trim().length < 2) return ui.marcarErro(form, "nome", "Informe o nome.");      // plano 1500c · UCB-116
    // plano 1500c · UCB-115: o slug que já existe com hífen nas pontas continua (o servidor aceita); só o NOVO passa pela régua
    if (d.slug !== cli.slug && !slugValido(d.slug)) return ui.marcarErro(form, "slug", "Use de 2 a 40 letras minúsculas, números ou hífen (sem hífen no começo, no fim ou dois seguidos).");
    if (d.status === "teste" && !d.teste_ate) return ui.marcarErro(form, "teste_ate", "Informe até quando vai o teste.");      // UB-109
    // plano 1500c · UCB-008: fim do teste no passado bloqueia a equipe na hora — pergunta antes
    if (testeNoPassado(d.status, d.teste_ate, ui.hojeSP()) && d.teste_ate !== cli.teste_ate
      && !(await ui.confirmar({ titulo: "O teste já terá terminado", rotulo: "Salvar assim mesmo", perigo: true,
        texto: "Com o fim do teste no passado, a equipe do cliente fica sem acesso assim que salvar. Salvar assim mesmo?" }))) return;
    const p = { id: cli.id, nome: String(d.nome).trim(), slug: d.slug, plano: d.plano, status: d.status,
      vertical: verticalAoEditar(d.segmento, segmentoInicial, cli.vertical),      // segmento igual: mantém o modelo escolhido
      teste_ate: d.status === "teste" ? (d.teste_ate || null) : cli.teste_ate, modulos: d.modulos || [],
      // UCB-002: a revenda não vê o pacote — o registro que já existe fica como está
      comercial: { pacote: superConta ? d.pacote_comercial || null : comercial.pacote || null, segmento: d.segmento || "", especificacoes: d.especificacoes || "" } };
    // plano 2000d · DU-182 / DU-185 / DU-191: valor cobrado, vencimento, contato e etiquetas (o que já estava guardado e não aparece na tela fica)
    const ct = lerContato(d);
    if (ct.erro) return ui.marcarErro(form, ct.erro.campo, ct.erro.msg);
    if (verPrecos) {
      if (d.valor_mensal !== null && d.valor_mensal !== undefined && d.valor_mensal !== "" && !precoPlanoValido(d.valor_mensal)) return ui.marcarErro(form, "valor_mensal", "Use um valor de zero para cima (ou deixe em branco).");
      const dv = diaVencimentoValido(d.dia_vencimento);
      if (Number.isNaN(dv)) return ui.marcarErro(form, "dia_vencimento", "Use um dia de 1 a 28.");
      if (d.valor_mensal !== null && d.valor_mensal !== undefined && d.valor_mensal !== "") p.comercial.valor_mensal = Number(d.valor_mensal);
      if (dv) p.comercial.dia_vencimento = dv;
    } else {
      if (comercial.valor_mensal != null) p.comercial.valor_mensal = comercial.valor_mensal;
      if (comercial.dia_vencimento != null) p.comercial.dia_vencimento = comercial.dia_vencimento;
    }
    if (ct.valor) p.comercial.contato = ct.valor;
    const etsDet = separarEtiquetas(d.etiquetas);
    if (etsDet.length) p.comercial.etiquetas = etsDet;
    if (superConta) {
      const lim = {};
      for (const k of CHAVES_LIMITE) { const v = d[`lim_${k.chave}`]; if (v !== null && v !== undefined && v !== "" && Number.isFinite(v)) lim[k.chave] = Math.max(0, Math.floor(v)); }
      p.limites = lim;
    }
    const pedeAtivo = superConta && typeof cli.ativo === "boolean" && typeof d.ativo === "boolean" && d.ativo !== cli.ativo ? d.ativo : null;
    if (pedeAtivo !== null) {
      p.ativo = pedeAtivo;
      if (!pedeAtivo && !(await ui.confirmar({ titulo: `Pausar ${cli.nome}?`, rotulo: "Pausar cliente", perigo: true,
        texto: "O Órbita para de ler os anúncios e de mandar relatórios e alertas deste cliente, o rastreio do site e a vigia do número param, e a equipe dele passa a ver «conta pausada» ao abrir o app (quem já está com ele aberto é bloqueado na próxima leitura da sessão). Os dados continuam guardados e dá para religar aqui. A situação (ativo, teste, suspenso) é outra coisa: é a do contrato." }))) return;
    }
    if ((d.status === "suspenso" || d.status === "cancelado") && d.status !== cli.status) {
      const ok = await ui.confirmar({ titulo: d.status === "suspenso" ? "Suspender o cliente?" : "Cancelar o cliente?",
        texto: "A equipe do cliente deixa de acessar na hora. Os dados continuam guardados e a situação pode voltar a Ativo.", rotulo: d.status === "suspenso" ? "Suspender" : "Cancelar cliente", perigo: true });
      if (!ok) return;
      // plano 1500c · UCB-092: o motivo que a equipe do cliente vê — só com o servidor que guarda (o cliente já vem com «motivo_status»)
      if (Object.hasOwn(cli, "motivo_status")) {
        const fm = h("form", { class: "pilha", novalidate: true }, ui.campo({ rotulo: "Motivo (o cliente vê)", nome: "motivo", max: 200, valor: cli.motivo_status || "", autocomplete: "off",
          placeholder: "Ex.: pagamento em aberto desde 10/10", ajuda: "Opcional. Aparece para a equipe do cliente no aviso de conta suspensa." }));
        const rm = await ui.modal({ titulo: "Motivo para o cliente", corpo: fm, largura: "p", acoes: [{ rotulo: "Pular", tipo: "neutro", valor: { motivo: null } },
          { rotulo: "Usar este motivo", tipo: "primario", fn: async () => ({ motivo: String(ui.lerForm(fm).motivo || "").trim() || null }) }] });
        p.motivo_status = rm && rm.motivo ? rm.motivo : null;
      }
    }
    try {
      const r = await ui.carregando(form.querySelector("[type=submit]"), api.rpc("nx_cliente_admin_salvar", { p_cliente: p }));
      cli = { ...cli, ...r, uso: r && r.uso ? r.uso : cli.uso };      // UB-111: o uso que a resposta não traz continua o de antes
      segmentoInicial = d.segmento || segmentoInicial;     // o segmento salvo vira a referência (o modelo só muda se mudar de novo)
      if (inpSeg) pintarModelo();
      // por detecção: o servidor que ainda não grava «ativo» devolve o valor antigo — a tela diz a verdade em vez de fingir que pausou
      if (pedeAtivo !== null && r && r.ativo !== pedeAtivo) {
        ui.toast(`Os outros dados foram salvos, mas o servidor ainda não grava ${pedeAtivo ? "a religação" : "a pausa"} por aqui. Use o painel clássico (cadastro do cliente → «Cliente ativo») por enquanto.`, { tipo: "info", ms: 9000 });
      } else ui.toast(pedeAtivo === false ? "Cliente pausado." : pedeAtivo === true ? "Cliente religado." : "Cliente atualizado.", { tipo: "ok" });
      // plano 2000d: o servidor que ainda não guarda valor/vencimento/contato/etiquetas diz isso (a tela não finge)
      const perdidas = chavesNaoGuardadas(p.comercial, r, ["valor_mensal", "dia_vencimento", "contato", "etiquetas"]);
      if (perdidas.length) ui.toast(`O servidor ainda não guarda: ${perdidas.map(k => ROTULO_CHAVE_COMERCIAL[k]).join(", ")}.`, { tipo: "info", ms: 8000 });
      try { await ctx.shell.recarregarSessao(); } catch { /* ok */ }
      // plano 1000 · AS-162: o cabeçalho e as pílulas se atualizam no lugar — a tela não remonta nem volta ao topo
      pintarCabecalho();
      pintarUso();          // plano 1000b · UB-111: as barras usam os limites novos (plano ou limites extras) sem recarregar
      formSalvo = estadoDoForm();      // UB-267: o que está na tela agora é o salvo
      ctx.titulo(cli.nome);
    } catch (e) {
      if (e.codigo === "slug_em_uso") return ui.marcarErro(form, "slug", "Esse endereço já está em uso.");
      if (e.codigo === "dados_invalidos" && e.hint === "comercial") return ui.marcarErro(form, "especificacoes", "Revise as especificações informadas.");
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });

  // ---- uso × limite
  const usoEl = h("div", { class: "adm-uso" });
  function pintarUso() { usoEl.replaceChildren(...CHAVES_LIMITE.map(k => barraUso(ui, k.curto || k.rotulo, cli.uso ? cli.uso[k.chave] : 0, cli.limites ? cli.limites[k.chave] : null))); }
  pintarUso();

  // plano 1000b · UB-267: sair do detalhe («‹ Clientes», menu, voltar do navegador) com o formulário mexido pergunta antes
  const estadoDoForm = () => { try { return JSON.stringify(ui.lerForm(form)); } catch { return ""; } };
  let formSalvo = estadoDoForm();
  if (typeof ctx.aoSairDaRota === "function") {
    try {
      const c = ctx.aoSairDaRota(async () => {
        if (!form.isConnected || estadoDoForm() === formSalvo) return true;
        return ui.confirmar({ titulo: `Sair sem salvar ${cli.nome}?`, rotulo: "Sair sem salvar", perigo: true,
          texto: "As mudanças em «Plano e situação» ainda não foram salvas e serão perdidas." });
      });
      if (typeof c === "function") _limpeza.push(c);
    } catch { /* a guarda é um extra */ }
  }

  // ---- usuários com acesso
  // revisão 1000b · UB-209: esqueleto secundário (o detalhe do cliente já anunciou «Carregando…») — não fala de novo
  const usuariosEl = h("div", { class: "pilha-p", tabindex: "-1" }, ui.esqueleto("lista", { n: 2, anunciar: false }));
  // plano 1500c · UCB-041: o rótulo do papel vem do config.js (rotuloPapel); sem ele, o mesmo mapa local
  let rotPapel = p => ({ admin: "Administrador", supervisor: "Supervisor", atendente: "Atendente", leitura: "Somente leitura", gestor: "Gestor" })[p] || p;
  let cfgMod = null;
  function pintarUsuarios(r) {
    ui.limpar(usuariosEl);
    const us = r.usuarios || [];
    const adm = us.find(u => u && u.papel === "admin" && u.telefone);
    telAdmin = adm ? String(adm.telefone) : null;
    if (!us.length) usuariosEl.appendChild(h("p", { class: "fraco" }, "Ninguém com acesso ainda. Gere o convite do administrador."));
    // plano 1000 · AS-160: ações de suporte por pessoa (link de nova senha) sem precisar «Entrar» no cliente
    for (const u of us) {
      const b = h("button", { type: "button", class: "bt-icone adm-us-acoes", "aria-label": `Ações de suporte para ${u.nome}` }, ui.icone("opcoes"));
      // plano 1500c · UCB-040: remover o acesso e mudar o papel também daqui (as mesmas confirmações das Configurações)
      const ultimo = cfgMod && typeof cfgMod.ehUltimoAdmin === "function" ? cfgMod.ehUltimoAdmin(us, u.conta_id)
        : u.papel === "admin" && !us.some(x => x.conta_id !== u.conta_id && x.papel === "admin" && !x.gestor);
      const motivo = ultimo ? "A empresa precisa de pelo menos um administrador." : null;
      b.addEventListener("click", () => ui.menu(b, [
        { rotulo: "Gerar link de nova senha", icone: "cadeado", fn: () => linkSenhaSuporte(u) },
        { rotulo: "Mudar papel", icone: "usuario", desabilitado: ultimo, motivo, fn: () => mudarPapelSuporte(u) },
        "-",
        { rotulo: "Remover acesso", icone: "lixeira", perigo: true, desabilitado: ultimo, motivo, fn: () => removerSuporte(u) },
      ]));
      usuariosEl.appendChild(h("div", { class: "cel-nome adm-us-linha" }, ui.avatar(u.nome, u.conta_id),
        h("div", null, h("b", null, u.nome), h("small", null, `${rotPapel(u.gestor ? "gestor" : u.papel)} · ${u.email}`)      /* plano 2000d · DU-435: o rótulo do papel sempre pelo rotuloPapel */),
        u.editavel === false ? null : b));
    }
    convitesPend = Array.isArray(r.convites) ? r.convites : [];
    usuariosCarregados = true;
    pintarConvitesAdmin();
    pintarAvisoTeste();
  }
  Promise.all([api.rpc("nx_usuarios_listar", { p_cliente: cli.id }), modConfig(ctx).catch(() => null)]).then(([r, cfg]) => {
    cfgMod = cfg;
    if (cfg && typeof cfg.rotuloPapel === "function") rotPapel = p => cfg.rotuloPapel(p);
    pintarUsuarios(r || {});
  }).catch(e => { ui.limpar(usuariosEl); usuariosEl.appendChild(h("p", { class: "fraco" }, ui.mensagemErro(e))); });
  async function mudarPapelSuporte(u) {
    const opcoes = [["admin", "Administrador"], ["supervisor", "Supervisor"], ["atendente", "Atendente"], ["leitura", "Somente leitura"]].map(([valor, rotulo]) => ({ valor, rotulo: rotPapel(valor) || rotulo }));
    const fm = h("form", { class: "pilha", novalidate: true }, ui.campo({ rotulo: `Papel de ${u.nome}`, nome: "papel", tipo: "select", valor: u.papel, opcoes }));
    const novo = await ui.modal({ titulo: "Mudar papel", corpo: fm, largura: "p", acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Aplicar", tipo: "primario", fn: async () => ui.lerForm(fm).papel }] });
    if (!novo || novo === u.papel) return;
    if ((novo === "admin" || u.papel === "admin") && !(await ui.confirmar(novo === "admin"
      ? { titulo: `Tornar ${u.nome} administrador?`, rotulo: "Tornar administrador", texto: "Administradores veem e mudam tudo da empresa, inclusive usuários, números e configurações." }
      : { titulo: `Tirar ${u.nome} de administrador?`, rotulo: `Mudar para ${rotPapel(novo)}`, perigo: true, texto: "A pessoa perde o acesso às configurações e aos usuários da empresa." }))) return;
    try {
      const r = await api.rpc("nx_usuario_salvar", { p_cliente: cli.id, p_usuario: { conta_id: u.conta_id, papel: novo } });
      pintarUsuarios(r || {});
      ui.toast(`${u.nome} agora é ${rotPapel(novo)}.`, { tipo: "ok" });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }
  async function removerSuporte(u) {
    if (!(await ui.confirmar({ titulo: `Remover o acesso de ${u.nome}?`, rotulo: "Remover acesso", perigo: true,
      texto: "A conta continua existindo; ela só deixa de entrar nesta empresa. Conversas e registros dela ficam, e ela sai do rodízio de conversas novas." }))) return;
    try {
      const r = await api.rpc("nx_usuario_remover", { p_cliente: cli.id, p_conta: u.conta_id });
      pintarUsuarios(r || {});
      ui.toast("Acesso removido.", { tipo: "ok" });
      const foco = usuariosEl.querySelector(".adm-us-acoes");
      try { (foco || usuariosEl).focus(); } catch { /* ok */ }
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }
  /** UB-202: (re)desenha a lista «N convites aguardando» dentro do cartão de usuários. */
  let usuariosCarregados = false;
  function pintarConvitesAdmin() {
    if (!usuariosCarregados) return;          // a lista ainda vai chegar e desenhar com o convite novo (convitesPend já o tem)
    for (const v of usuariosEl.querySelectorAll(".adm-convites")) v.remove();
    if (convitesPend.length) usuariosEl.appendChild(listaConvitesAdmin());
  }

  async function linkSenhaSuporte(u) {
    try {
      const r = await api.rpc("nx_senha_link_criar", { p_cliente: cli.id, p_conta: u.conta_id });
      const lc = linkConvite(r.link, location, { superConta: !!ctx.sessao.conta.super });      // plano 2000d · DU-194
      await ui.modal({ titulo: `Link de nova senha · ${u.nome}`, largura: "m",
        corpo: h("div", { class: "pilha" },
          h("p", null, `Envie para ${u.nome}. Quem abrir cria uma senha nova e todas as sessões abertas dessa conta são encerradas.`),
          lc.link ? ui.blocoLink(lc.link, { rotulo: "Link de nova senha", textoWhats: `Olá, ${String(u.nome).split(" ")[0]}! Crie sua senha nova por este link:` })
            : h("div", { class: "aviso aviso-ruim adm-link-ruim", role: "alert" }, ui.icone("alerta"), h("p", null, lc.motivo)),
          r.expira_em ? h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(r.expira_em)} e só uma vez.`) : null),
        acoes: [{ rotulo: "Concluir", tipo: "primario", valor: true }] });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }

  /** nx_envios_pausar (20261013c, só plataforma): pausa de emergência dos envios automáticos DESTE cliente. */
  function cartaoEnvios() {
    if (!superConta) return null;
    let pausado = typeof cli.envios_pausados === "boolean" ? cli.envios_pausados : null;
    const estado = h("p", { class: "sub adm-envios-estado" });
    const bPausar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("pausa"), "Pausar envios");
    const bRetomar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("play"), "Retomar envios");
    const pintar = () => {
      estado.textContent = pausado === true ? "Pausados: a fila de WhatsApp e as decisões de IA das automações deste cliente estão paradas."
        : pausado === false ? "Saindo normalmente." : "A situação atual não vem nesta tela; use os botões para pausar ou retomar.";
      bPausar.hidden = pausado === true; bRetomar.hidden = pausado === false;
    };
    const acao = pausar => async () => {
      if (pausar && !(await ui.confirmar({ titulo: `Pausar os envios automáticos de ${cli.nome}?`, rotulo: "Pausar envios", perigo: true,
        texto: "A fila de WhatsApp (lembretes, campanhas, automações) e as decisões de IA deste cliente param até você retomar. As mensagens que a equipe digita nas conversas continuam saindo." }))) return;
      try {
        const r = await ui.carregando(pausar ? bPausar : bRetomar, api.rpc("nx_envios_pausar", { p_cliente: cli.id, p_pausar: pausar, p_motivo: pausar ? "Pausa de emergência pelo Admin" : null }));
        pausado = r && typeof r.pausado === "boolean" ? r.pausado : pausar;
        pintar();
        ui.toast(pausado ? "Envios automáticos pausados." : "Envios automáticos retomados.", { tipo: "ok" });
      } catch (e) {
        ui.toast(semFuncao(e) ? "Este servidor ainda não tem a pausa de envios." : api.mensagemErro(e), { tipo: "erro" });
      }
    };
    bPausar.addEventListener("click", acao(true));
    bRetomar.addEventListener("click", acao(false));
    pintar();
    return h("div", { class: "cartao adm-envios" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Envios automáticos"),
      h("p", { class: "sub" }, "Pausa de emergência: para tudo que sai sozinho deste cliente, sem desligar as automações uma a uma."))),
      estado, h("div", { class: "linha" }, bPausar, bRetomar));
  }

  /** plano 1000 · AS-159: os convites que aguardam, cada um com «Revogar» (o link deixa de valer na hora). */
  function listaConvitesAdmin() {
    const caixa = h("div", { class: "pilha-p adm-convites" }, h("p", { class: "rotulo" }, convitesPend.length === 1 ? "1 convite aguardando" : `${convitesPend.length} convites aguardando`));
    for (const cv of convitesPend) {
      const b = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Revogar");
      b.addEventListener("click", async () => {
        if (!(await ui.confirmar({ titulo: "Revogar convite?", texto: "O link deixa de funcionar na hora.", rotulo: "Revogar", perigo: true }))) return;
        try {
          await ui.carregando(b, api.rpc("nx_convite_revogar", { p_cliente: cli.id, p_convite: cv.id }));
          const pos = convitesPend.findIndex(x => x.id === cv.id);
          convitesPend = convitesPend.filter(x => x.id !== cv.id);
          const nova = convitesPend.length ? listaConvitesAdmin() : null;
          if (nova) caixa.replaceWith ? caixa.replaceWith(nova) : (caixa.parentNode.insertBefore(nova, caixa), caixa.remove()); else caixa.remove();
          ui.toast("Convite revogado.", { tipo: "ok" });
          // plano 1500c · UCB-043: o foco vai ao próximo «Revogar» (ou ao rótulo da lista de usuários), não cai no body
          const bts = nova ? [...nova.querySelectorAll("button")] : [];
          const alvoFoco = bts[Math.min(Math.max(0, pos), bts.length - 1)] || usuariosEl;
          try { alvoFoco.focus(); } catch { /* ok */ }
        } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      });
      const papel = cv.papel ? rotPapel(cv.papel) : "Administrador";      // plano 1500c · UCB-041
      caixa.appendChild(h("div", { class: "convite-item" }, ui.icone("link"),
        h("div", null, h("b", null, cv.nome || cv.email || "Convite sem nome"),
          h("small", null, [papel, cv.expira_em ? `vence ${ui.relativo(cv.expira_em)}` : null].filter(Boolean).join(" · "))), b));
    }
    return caixa;
  }

  /** G5 [H306]: cliente sem pacote comercial (criado pelo clássico): diz o que falta e leva ao campo. */
  function avisoSemPacote() {
    const ir = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Escolher o pacote");
    ir.addEventListener("click", () => {
      const campo = form.querySelector("[data-campo=pacote_comercial]");
      if (!campo) return;
      campo.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem() });
      const r = campo.querySelector("input[type=radio]");
      if (r) r.focus({ preventScroll: true });
    });
    return h("div", { class: "aviso aviso-aten adm-sem-pacote", role: "note" }, ui.icone("alerta"),
      h("div", { class: "pilha-p" }, h("p", null, "Este cliente não tem pacote comercial registrado (provavelmente criado pelo painel clássico). Escolha um dos três em «Plano e situação» e salve: o registro comercial do cliente fica completo."),
        h("div", { class: "linha" }, ir)));
  }

  // plano 1500c · UCB-101: a projeção do mês no anel de IA (a mesma conta do Plano e uso — projecaoMes do config.js)
  const projecaoIAEl = h("p", { class: "fraco adm-ia-proj", hidden: true });
  if (cli.uso && Number(cli.uso.ia_mes) > 0) modConfig(ctx).then(cfg => {
    if (!cfg || typeof cfg.projecaoMes !== "function") return;
    const proj = cfg.projecaoMes(cli.uso.ia_mes, ui.hojeSP());
    const lim = cli.limites ? cli.limites.ia_mes : null;
    projecaoIAEl.textContent = `No ritmo atual, ~${ui.num(proj)} até o fim do mês${lim != null && lim > 0 && proj > lim ? " (passa do limite)" : ""}.`;
    projecaoIAEl.hidden = false;
  }).catch(() => { /* sem a projeção */ });
  // plano 1500c · UCB-126: teste vencido ou acabando (≤ 3 dias) → aviso no topo com «+7 dias», «Converter» e (UCB-127) a mensagem pronta
  const avisoTesteEl = h("div", { class: "aviso aviso-aten adm-aviso-teste", role: "status", hidden: true });
  let telAdmin = null;          // o celular do administrador do cliente, quando a lista de usuários traz
  function pintarAvisoTeste() {
    ui.limpar(avisoTesteEl);
    const n = cli.status === "teste" ? diasAteFimTeste(cli.teste_ate, ui.hojeSP()) : null;
    if (n === null || n > 3) { avisoTesteEl.hidden = true; return; }
    avisoTesteEl.hidden = false;
    avisoTesteEl.classList.toggle("aviso-ruim", n < 0);
    const b7 = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("relogio"), "+7 dias de teste");
    b7.addEventListener("click", async () => {
      try {
        const novo = estenderTeste(cli.teste_ate, ui.hojeSP(), 7);
        const r = await ui.carregando(b7, api.rpc("nx_cliente_admin_salvar", { p_cliente: { id: cli.id, teste_ate: novo } }));
        cli = { ...cli, ...r, teste_ate: (r && r.teste_ate) || novo, uso: r && r.uso ? r.uso : cli.uso };
        if (inpTeste) { inpTeste.value = cli.teste_ate; inpTeste.dispatchEvent(new Event("input", { bubbles: true })); }
        formSalvo = estadoDoForm();
        pintarCabecalho(); pintarAvisoTeste();
        ui.toast(`Teste estendido até ${ui.dataBR(cli.teste_ate)}.`, { tipo: "ok" });
      } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    const bConv = h("button", { type: "button", class: "bt bt-prim bt-p" }, ui.icone("check"), "Converter em pagante");
    bConv.addEventListener("click", () => converter(bConv));
    let produto = "sistema";
    try { const me = ctx.shell.marcaEfetiva(); if (me && me.produto) produto = me.produto; } catch { /* ok */ }
    const txtWa = textoAvisoTeste(cli, n, produto);
    const aWa = h("a", { class: "bt bt-fant bt-p adm-avisar-teste", href: ui.linkWhatsApp(txtWa, telAdmin || ""), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Avisar pelo WhatsApp");
    // plano 2000d · DU-203: a mensagem em dois tons, editável antes de copiar
    const bMsg = h("button", { type: "button", class: "bt bt-fant bt-p adm-followup" }, ui.icone("copiar"), "Escrever mensagem");
    bMsg.addEventListener("click", () => abrirFollowup(ctx, cli, ui.hojeSP(), produto));
    avisoTesteEl.append(ui.icone("alerta"), h("div", { class: "pilha-p" },
      h("p", null, n < 0 ? `${rotuloTesteVencido(-n)}: a equipe do cliente está sem acesso.` : n === 0 ? "O teste acaba hoje." : `O teste acaba em ${n} ${n === 1 ? "dia" : "dias"}.`),
      h("div", { class: "linha" }, b7, bConv, aWa, bMsg)));
  }
  pintarAvisoTeste();
  // plano 1500c · UCB-090: depois de criar, o próximo passo é o convite do administrador (em destaque)
  const avisoNovo = ctx.rota && ctx.rota.query && ctx.rota.query.novo ? (() => {
    const b = h("button", { type: "button", class: "bt bt-prim bt-p" }, ui.icone("convidar"), "Gerar convite do administrador");
    b.addEventListener("click", () => btConvite.click());
    return h("div", { class: "aviso aviso-ok adm-proximo-passo", role: "status" }, ui.icone("check"),
      h("div", { class: "pilha-p" }, h("p", null, h("b", null, "Cliente criado. "), "Próximo passo: convidar quem vai administrar a empresa."), h("div", { class: "linha" }, b)));
  })() : null;
  corpo.append(...[
    h("div", { class: "cartao" },
      h("div", { class: "cartao-cab" },
        h("div", { class: "cel-nome" }, cabAvatar, h("div", null, cabNome, cabPilulas)),
        h("div", { class: "linha" }, ...[btConvite, btNumeros, btRelatorio, btExportar, btTransferir, btEntrar].filter(Boolean))),
      marcaVista),      // plano 2000d · DU-198
    avisoNovo,
    avisoTesteEl,
    superConta && semPacote(cli) ? avisoSemPacote() : null,
    h("div", { class: "adm-det" },
      h("div", { class: "pilha" },
        h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Plano e situação"),
          h("p", { class: "sub" }, superConta ? "Como plataforma, você também define limites extras." : "O plano Interno e os limites extras são só da plataforma."))), form)),
      h("div", { class: "pilha" },
        // uso de IA do mês em anel (item 58) + a série por dia do servidor (G2, nx_ia_uso_dia) com o custo estimado
        h("div", { class: "cartao adm-ia" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "IA neste mês"), h("p", { class: "sub" }, "Sugestões da IA usadas no mês corrente. Zera todo dia 1."))),
          anelUso(ui, { uso: cli.uso ? cli.uso.ia_mes : 0, limite: cli.limites ? cli.limites.ia_mes : null, rotulo: "Sugestões de IA" }),
          projecaoIAEl,
          usoIAPorDia(ctx, cli)),
        h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Uso do plano"), h("p", { class: "sub" }, "Contagem de agora; sugestões de IA no mês corrente."))), usoEl),
        h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Usuários com acesso"))), usuariosEl),
        cartaoCanais(ui, cli),          // plano 2000d · DU-403
        cartaoNotas(ctx, cli),          // plano 2000d · DU-192
        cartaoEnvios(),
        EXTRAS.dominiosCliente ? EXTRAS.dominiosCliente(ctx, cli) : null))].filter(Boolean));
}

export function barraUso(ui, rotulo, uso, limite) { return ui.barraUso(rotulo, uso, limite); }

/** plano 2000d · DU-403: os números de WhatsApp do cliente, a situação de cada um e a última queda (quando o servidor manda `canais`). */
export function cartaoCanais(ui, cli) {
  if (!cli || !Array.isArray(cli.canais) || !cli.canais.length) return null;
  const h = ui.h;
  const ROT = { conectado: ["Conectado", "ok"], desconectado: ["Desconectado", "ruim"] };
  return h("div", { class: "cartao adm-canais" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Números de WhatsApp"))),
    h("ul", { class: "adm-canais-lista" }, cli.canais.map(c => {
      const [rot, tom] = ROT[c && c.estado] || ["Sem confirmação", "neutra"];
      return h("li", { class: ["adm-canal", tom === "ruim" && "caido"] }, ui.icone("whatsapp"),
        h("span", { class: "mono" }, (c && (c.numero || c.nome)) || "Número"), ui.pilula(rot, tom),
        c && c.ultima_queda ? h("small", { class: "fraco" }, `última queda ${ui.relativo(c.ultima_queda)}`) : null);
    })));
}

/** plano 2000d · DU-192: notas internas da agência sobre o cliente (data, autor, texto) — o cliente não vê. Servidor sem a função: o cartão some. */
function cartaoNotas(ctx, cli) {
  const { ui, api } = ctx;
  const h = ui.h;
  const lista = h("ul", { class: "adm-notas-lista" });
  const txt = h("textarea", { class: "adm-nota-txt", rows: 2, maxlength: 2000, "aria-label": "Nova nota sobre o cliente", placeholder: "Ex.: ligou pedindo mais um número; combinado desconto até dezembro" });
  const bt = h("button", { type: "submit", class: "bt bt-sec bt-p" }, ui.icone("mais"), "Adicionar nota");
  const form = h("form", { class: "pilha-p adm-nota-form", novalidate: true }, txt, h("div", { class: "linha" }, bt));
  const cartao = h("div", { class: "cartao adm-notas", hidden: true }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Notas da agência"),
    h("p", { class: "sub" }, "Ligações, combinados e histórico do atendimento. Só a sua equipe vê."))), form, lista);
  const pintar = notas => {
    lista.replaceChildren(...(notas.length ? notas : []).map(n => h("li", { class: "adm-nota" },
      h("p", null, n.texto), h("small", { class: "fraco" }, [n.autor_nome || n.autor || null, n.criado_em ? ui.dataHoraBR(n.criado_em) : null].filter(Boolean).join(" · ")))));
    if (!notas.length) lista.append(h("li", { class: "fraco" }, "Nenhuma nota ainda."));
  };
  api.rpc("nx_cliente_notas_listar", { p_cliente: cli.id }).then(r => { cartao.hidden = false; pintar(Array.isArray(r) ? r : []); })
    .catch(e => { if (semFuncaoAdm(e)) { cartao.remove(); return; } cartao.hidden = false; lista.replaceChildren(h("li", { class: "fraco", role: "alert" }, api.mensagemErro(e))); });
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const t = txt.value.trim();
    if (t.length < 2) { txt.focus(); return; }
    try {
      const r = await ui.carregando(bt, api.rpc("nx_cliente_nota_criar", { p_cliente: cli.id, p_texto: t }));
      txt.value = "";
      pintar(Array.isArray(r) ? r : []);
      ui.toast("Nota guardada.", { tipo: "ok" });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  });
  return cartao;
}

/**
 * G2 (contrato 7): uso de IA por dia do cliente (nx_ia_uso_dia, 14 dias) — chamadas e custo com sparkline (ui.kpi) e a tabela por dia.
 * O custo é ESTIMADO (calculado pelos tokens no momento da chamada) e aparece como estimativa. Banco antigo: uma nota, nada inventado.
 */
export function usoIAPorDia(ctx, cli, { dias = 14 } = {}) {
  const { ui, api } = ctx;
  const h = ui.h;
  const caixa = h("div", { class: "adm-ia-dia", "aria-live": "polite" }, ui.esqueleto("kpi", { n: 2, anunciar: false }));   // revisão 1000b · UB-209
  const pronto = (async () => {
    let r = null, falha = null;
    try { r = resumoUsoIA(await api.rpc("nx_ia_uso_dia", { p_cliente: cli.id, p_dias: dias })); } catch (e) { falha = e; }
    ui.limpar(caixa);
    if (!r) {
      const semRpc = !falha || /pgrst202|could not find the function|http_404/i.test(String((falha && (falha.codigo || falha.message)) || ""));
      caixa.appendChild(h("p", { class: "fraco adm-ia-dia-nota" }, ui.icone("info"),
        h("span", null, semRpc ? "O uso de IA por dia ainda não vem deste servidor." : `Não deu para ler o uso por dia: ${api.mensagemErro(falha)}`)));
      return false;
    }
    const kpis = h("div", { class: "adm-ia-kpis" },
      ui.kpi({ rotulo: `Chamadas · ${r.dias} dias`, valor: r.chamadas, serie: r.serieChamadas, ajuda: "Chamadas à IA feitas por este cliente (sugestões, resumos, automações), por dia." }),
      ui.kpi({ rotulo: `Custo · ${r.dias} dias`, valor: r.custo_usd, formato: dolar, serie: r.serieCusto, estimativa: true,
        ajuda: `Estimado pelos tokens de cada chamada (${ui.num(r.tokens_in)} de entrada e ${ui.num(r.tokens_out)} de saída), em dólares.` }));
    const tab = h("table", { class: "adm-ia-tab" },
      h("caption", { class: "sr-only" }, `Uso de IA por dia, últimos ${r.dias} dias`),
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Dia"), h("th", { scope: "col", class: "num" }, "Chamadas"), h("th", { scope: "col", class: "num" }, "Tokens"), h("th", { scope: "col", class: "num" }, "Custo estimado"))),
      h("tbody", null, r.linhas.filter(x => x.chamadas).reverse().map(x => h("tr", null,
        h("th", { scope: "row" }, `${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)}`), h("td", { class: "num mono" }, ui.num(x.chamadas)),
        h("td", { class: "num mono" }, ui.num(x.tokens_in + x.tokens_out)), h("td", { class: "num mono" }, x.custo_usd > 0 ? dolar(x.custo_usd) : "—")))));
    // plano 1000b · UB-268: a revenda cobra em reais — o custo em dólar diz o que é (estimativa, sem cotação do dia)
    const notaDolar = ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.super ? null
      : h("p", { class: "fraco adm-ia-dolar" }, ui.icone("info"), h("span", null, "Custo estimado em dólar (cotação do dia não aplicada)."));
    caixa.append(...[kpis, notaDolar,
      r.custoIncompleto ? h("p", { class: "fraco adm-ia-dia-nota" }, ui.icone("info"), h("span", null, "Há dias com chamadas sem custo registrado (feitas antes de o custo ser gravado): o custo total está por baixo.")) : null,
      r.chamadas ? h("details", { class: "adm-ia-det" }, h("summary", null, "Ver por dia"), tab) : h("p", { class: "fraco" }, `Nenhuma chamada de IA nos últimos ${r.dias} dias.`)].filter(Boolean));
    return true;
  })();
  caixa.pronto = pronto;
  return caixa;
}

/* ============================================================
   P0-B: revendas, planos, domínios
   ============================================================ */
const EXTRAS = { revendas: telaRevendas, planos: telaPlanos, dominios: telaDominios, dominiosCliente: cartaoDominiosCliente };

/** config.js tem o editor de marca e o cartão de domínio: carregado com o MESMO ?v= do roteador. */
function modConfig(ctx) { return import(`./config.js?v=${encodeURIComponent(ctx.versao)}`); }
const LIMITES_ORG = [{ chave: "empresas", rotulo: "Clientes" }, { chave: "usuarios", rotulo: "Usuários (soma)" }, { chave: "canais", rotulo: "Números de WhatsApp (soma)" }];

/* ---------------- REVENDAS (super) ---------------- */
async function telaRevendas(ctx, corpo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Revendas");
  const novo = h("button", { type: "button", class: "bt bt-prim adm-novo" }, ui.icone("mais"), h("span", { class: "adm-novo-rot" }, "Nova revenda"));      // plano 1500c · UCB-117
  novo.setAttribute("aria-label", "Nova revenda");
  const lista = h("div", { class: "pilha" }, ui.esqueleto("cartoes", 3));
  corpo.append(h("div", { class: "adm-filtros adm-filtros-fim" }, novo), lista);
  novo.addEventListener("click", () => formRevenda(ctx, null, carregar));

  async function carregar() {
    ui.limpar(lista);
    lista.append(ui.esqueleto("cartoes", 3));
    let os;
    try { _orgs = null; os = await orgs(ctx); await planos(ctx); }
    catch (e) { ui.limpar(lista); lista.append(ui.erroCartao(e, carregar)); return; }
    ui.limpar(lista);
    const plat = os.find(o => o.tipo === "plataforma");
    const revs = os.filter(o => o.tipo === "revenda").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (plat) {
      lista.append(h("div", { class: "cartao rev-plat" },
        h("div", { class: "rev-cab" }, marcaMini(ctx, plat),
          h("div", { class: "rev-tit" }, h("b", null, plat.nome), h("small", { class: "mono" },
            `plataforma · ${contagem(plat.empresas, "cliente", "clientes")} · ${contagem(plat.usuarios, "usuário", "usuários")}`))),      // plano 1000b · UB-105
        h("div", { class: "linha" },
          h("a", { class: "bt bt-sec bt-p", href: "#/config/marca?de=org" }, ui.icone("pincel"), "Marca da plataforma"),
          h("a", { class: "bt bt-fant bt-p", href: `#/admin/clientes?org=${encodeURIComponent(plat.id)}` }, "Ver clientes"))));
    }
    if (!revs.length) {
      lista.append(ui.vazio({ titulo: "Nenhuma revenda ainda.", icone: "camadas",
        texto: "Uma revenda é uma agência que vende o sistema com a própria marca, dentro dos limites que você define.",
        acao: { rotulo: "Criar a primeira revenda", fn: () => formRevenda(ctx, null, carregar) } }));
      return;
    }
    lista.append(h("div", { class: "rev-grade" }, revs.map(o => cartaoRevenda(ctx, o, carregar))));
  }
  await carregar();
}

/** plano 1000b · UB-105: «1 cliente», «3 clientes» (sem número vira 0). */
export function contagem(n, um, varios) { const v = Math.max(0, Number(n) || 0); return `${v} ${v === 1 ? um : varios}`; }
/** plano 1000b · UB-115: rótulo e cor da situação da revenda (cancelada não é «Suspensa»). */
export function statusRevenda(status) {
  return ({ ativo: ["Ativa", "ok"], suspenso: ["Suspensa", "aten"], cancelado: ["Cancelada", "ruim"] })[status] || [status ? String(status) : "—", "neutra"];
}
/** plano 1000b · UB-114: as três cores da revenda numa frase para o leitor de tela. */
export function rotuloCoresRevenda(cores = {}) {
  return `Cores: primária ${cores.primaria || "padrão"}, secundária ${cores.secundaria || "padrão"}, fundo ${cores.fundo || "padrão"}`;
}

function marcaMini(ctx, o) {
  const { ui } = ctx;
  const h = ui.h;
  const T = ctx.shell.tema;
  const ef = T.marcaEfetiva(o.marca || {}, {});
  const logo = ef.logo || ef.logo_claro;
  const el = h("span", { class: "rev-logo", style: { "--cor": ui.corOk(ef.cores.fundo) } },
    logo ? h("img", { src: logo, alt: "" }) : h("svg", { viewBox: "0 0 48 48", "aria-hidden": "true" }, h("use", { href: "#marca-orbita" })));
  return el;
}

function cartaoRevenda(ctx, o, recarregar) {
  const { ui, api } = ctx;
  const h = ui.h;
  const T = ctx.shell.tema;
  const ef = T.marcaEfetiva(o.marca || {}, {});
  const lim = o.limites || {};
  const pp = (_planos || []).find(p => p.id === lim.plano_padrao);
  const btEditar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("editar"), "Editar");
  const btConvite = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("convidar"), "Convidar gestor");
  const btMarca = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("pincel"), "Marca");
  btEditar.addEventListener("click", () => formRevenda(ctx, o, recarregar));
  btConvite.addEventListener("click", () => convidarGestor(ctx, o, btConvite));
  btMarca.addEventListener("click", () => editarMarcaOrg(ctx, o, recarregar));
  return h("article", { class: "cartao rev-cartao" },
    h("div", { class: "rev-cab" }, marcaMini(ctx, o),
      h("div", { class: "rev-tit" }, h("b", null, o.nome), h("small", { class: "mono" }, `${ef.produto} · ?org=${o.slug}`)),
      ui.pilula(...statusRevenda(o.status))),       // plano 1000b · UB-115
    // plano 1000b · UB-114: role=img com as três cores no nome (antes aria-label numa div sem papel e cada cor só no title)
    h("div", { class: "rev-cores", role: "img", "aria-label": rotuloCoresRevenda(ef.cores) }, ["primaria", "secundaria", "fundo"].map(k =>
      h("span", { class: "rev-cor", "aria-hidden": "true", style: { "--cor": ui.corOk(ef.cores[k]) }, title: `${{ primaria: "Primária", secundaria: "Secundária", fundo: "Fundo" }[k]} ${ef.cores[k]}` }))),
    h("div", { class: "adm-uso" },
      ui.barraUso("Clientes", o.empresas, lim.empresas ?? null),
      ui.barraUso("Usuários", o.usuarios, lim.usuarios ?? null),
      ui.barraUso("Números de WhatsApp", o.canais, lim.canais ?? null)),
    h("p", { class: "fraco rev-pp" }, `Plano padrão dos clientes novos: ${pp ? pp.nome : lim.plano_padrao || "Essencial"}`),
    h("div", { class: "linha" }, btEditar, btConvite, btMarca,
      h("a", { class: "bt bt-fant bt-p", href: `#/admin/clientes?org=${encodeURIComponent(o.id)}` }, "Clientes")));
}

async function formRevenda(ctx, o, aoSalvar) {
  const { ui, api } = ctx;
  const h = ui.h;
  const T = ctx.shell.tema;
  let ps = [], falhaPlanos = null;
  try { ps = await planos(ctx); } catch (e) { ps = []; falhaPlanos = e; }
  const lim = (o && o.limites) || { empresas: 10, usuarios: 50, canais: 10, plano_padrao: "essencial" };
  // plano 1500c · UCB-004: o plano padrão desligado continua na lista (salvar sem mexer não troca em silêncio)
  const opPadrao = falhaPlanos ? [] : opcoesPlanoPadrao(ps, lim.plano_padrao || "essencial");
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome da agência", nome: "nome", valor: o ? o.nome : "", obrigatorio: true, max: 80, autocomplete: "off", placeholder: "Ex.: Agência Conecta" }),
      ui.campo({ rotulo: "Endereço curto", nome: "slug", valor: o ? o.slug : "", obrigatorio: true, max: 40, autocomplete: "off",      /* plano 2000d · DU-352 */
        ajuda: "Vira o link de entrada: /app/?org=slug (até ter domínio próprio)." }),
      // plano 1500c · UCB-001: «Cancelada» aparece quando é a situação atual (antes o seletor caía em «Ativa» e salvar reativava)
      o ? ui.campo({ rotulo: "Situação", nome: "status", tipo: "select", valor: o.status, opcoes: opcoesStatusRevenda(o.status),
        ajuda: "Suspensa: as equipes dos clientes da agência deixam de entrar. O gestor continua entrando para organizar e exportar." }) : null,
      ui.campo({ rotulo: "Plano padrão dos clientes novos", nome: "plano_padrao", tipo: "select", valor: lim.plano_padrao || "essencial",
        opcoes: opPadrao })),
    h("fieldset", { class: "campo" }, h("legend", null, "Limites da agência (somados em todos os clientes)"),
      h("p", { class: "campo-ajuda" }, "Em branco = sem limite."),
      // plano 2000d · DU-201: «usado: 7 de 10» ao lado de cada limite (o uso que a lista de revendas já traz)
      h("div", { class: "form-grade form-grade-3" }, LIMITES_ORG.map(k => ui.campo({ rotulo: k.rotulo, nome: `lim_${k.chave}`, tipo: "numero", min: 0, valor: lim[k.chave] ?? "",
        ajuda: o ? rotuloUsoLimite(o[k.chave], lim[k.chave]) : null })))),
    o ? null : h("fieldset", { class: "campo" }, h("legend", null, "Marca inicial"),
      h("p", { class: "campo-ajuda" }, "A agência completa (logo, textos do login, WhatsApp) depois, em Configurações → Marca e tema."),
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Nome do produto", nome: "produto", max: 40, placeholder: "Ex.: Conecta CRM", autocomplete: "off" }),
        ui.campo({ rotulo: "Cor primária", nome: "cor_primaria", tipo: "cor", valor: T.PADRAO.cores.primaria, paleta: ctx.paleta }),
        ui.campo({ rotulo: "Cor secundária", nome: "cor_secundaria", tipo: "cor", valor: T.PADRAO.cores.secundaria, paleta: ctx.paleta }),
        ui.campo({ rotulo: "Cor de fundo", nome: "cor_fundo", tipo: "cor", valor: T.PADRAO.cores.fundo, paleta: T.FUNDOS }))));
  // plano 1000b · UB-119: sem a lista de planos o «Plano padrão» sairia vazio — o modal diz e não deixa salvar
  if (falhaPlanos) form.prepend(h("div", { class: "aviso aviso-ruim adm-planos-falha", role: "alert" }, ui.icone("alerta"),
    h("p", null, `Não deu para carregar os planos: ${api.mensagemErro(falhaPlanos)} Feche e abra de novo para salvar.`)));
  const nome = form.querySelector("input[name=nome]"), slug = form.querySelector("input[name=slug]");
  let slugMexido = !!o;
  // plano 1000b · UB-203: o endereço já usado por outra revenda aparece enquanto digita (a lista nx_orgs_listar já está carregada)
  const conferirSlug = conferidorSlugRevenda(ctx, slug, o ? o.id : null);
  nome.addEventListener("input", () => { if (!slugMexido) { slug.value = sugerirSlug(nome.value); conferirSlug(); } });
  slug.addEventListener("input", () => { slugMexido = true; conferirSlug(); });

  const r = await ui.modal({
    titulo: o ? `Editar ${o.nome}` : "Nova revenda", corpo: form, largura: "g",
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: o ? "Salvar revenda" : "Criar revenda", tipo: "primario", desabilitado: !!falhaPlanos, fn: async () => {
        if (falhaPlanos) return false;
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        if (String(d.nome || "").trim().length < 2) { ui.marcarErro(form, "nome", "Informe o nome."); return false; }      // plano 1500c · UCB-116
        // plano 1500c · UCB-115: régua do slug sem hífen nas pontas (o slug que já existe continua valendo)
        if (!(o && d.slug === o.slug) && !slugValido(d.slug)) { ui.marcarErro(form, "slug", "Use de 2 a 40 letras minúsculas, números ou hífen (sem hífen no começo, no fim ou dois seguidos)."); return false; }
        const limites = {};
        for (const k of LIMITES_ORG) { const v = d[`lim_${k.chave}`]; if (v !== null && v !== undefined && v !== "" && Number.isFinite(v)) limites[k.chave] = Math.max(0, Math.floor(v)); }
        if (d.plano_padrao) limites.plano_padrao = d.plano_padrao;
        // limites que o servidor guarda e esta tela não edita (ex.: dias_teste) continuam
        for (const [k, v] of Object.entries((o && o.limites) || {})) if (!(k in limites) && !LIMITES_ORG.some(x => x.chave === k) && k !== "plano_padrao") limites[k] = v;
        const p = { nome: String(d.nome).trim(), slug: d.slug, limites };
        if (o) { p.id = o.id; p.status = d.status; }
        else {
          const marca = { cores: {} };
          if (d.produto) marca.produto = d.produto;
          for (const k of ["primaria", "secundaria", "fundo"]) { const c = T.normalizarHex(d[`cor_${k}`]); if (c) marca.cores[k] = c; }
          p.marca = marca;
        }
        if (o && o.status === "ativo" && d.status === "suspenso"
          && !(await ui.confirmar({ titulo: `Suspender ${o.nome}?`, texto: "As equipes de TODOS os clientes da agência deixam de acessar na hora. O gestor da agência continua entrando. Os dados ficam guardados.", rotulo: "Suspender", perigo: true }))) return false;
        // plano 1500c · UCB-001: sair de «Cancelada» é reativar — pergunta antes
        if (o && o.status === "cancelado" && d.status !== "cancelado"
          && !(await ui.confirmar({ titulo: `Reativar a revenda ${o.nome}?`, rotulo: "Reativar", texto: `A revenda passa a «${d.status === "suspenso" ? "Suspensa" : "Ativa"}»${d.status === "ativo" ? " e os clientes dela voltam a entrar" : ""}.` }))) return false;
        try { return await api.rpc("nx_org_salvar", { p_org: p }); }
        catch (e) {
          if (e.codigo === "slug_em_uso") { ui.marcarErro(form, "slug", "Esse endereço já está em uso."); return false; }
          if (e.codigo === "dados_invalidos" && /^limites\./.test(e.hint || "")) { ui.marcarErro(form, `lim_${e.hint.slice(8)}`, "Use um número inteiro (ou deixe em branco)."); return false; }
          // plano 1500c · UCB-024: marca inválida vai para o campo dela (nome do produto ou a cor)
          if (e.codigo === "marca_invalida") {
            const hint = String(e.hint || "");
            const campo = hint === "produto" ? "produto" : /^cores?\.?(primaria|secundaria|fundo)$/.test(hint) ? `cor_${hint.replace(/^cores?\.?/, "")}` : null;
            if (campo && form.querySelector(`[name="${campo}"]`)) { ui.marcarErro(form, campo, api.mensagemErro(e)); return false; }
          }
          throw e;
        }
      } },
    ],
  });
  if (r && r.id) {
    ui.toast(o ? "Revenda atualizada." : `Revenda criada. Convide o gestor para ${r.nome} começar.`, { tipo: "ok" });
    if (aoSalvar) await aoSalvar();
    if (!o) convidarGestor(ctx, r, null);
  }
}

/** plano 1000b · UB-203: a revenda que já usa o endereço (slug idêntico, sem contar a própria) ou null. */
export function slugDeRevendaTomado(orgsLista, slug, idProprio = null) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return null;
  return (Array.isArray(orgsLista) ? orgsLista : []).find(x => x && x.id !== idProprio && String(x.slug || "").toLowerCase() === s) || null;
}
/** UB-203: aviso embaixo do slug da revenda, com 300 ms de pausa, pela lista de orgs em memória (sem nova chamada se já carregou). */
function conferidorSlugRevenda(ctx, inp, idProprio) {
  const { ui } = ctx;
  const campo = inp.closest("[data-campo]") || inp.parentNode;
  const aviso = ui.h("small", { class: "campo-erro adm-slug-tomado", role: "status", hidden: true });
  campo.appendChild(aviso);
  return ui.debounce(async () => {
    const v = inp.value.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(v)) { aviso.hidden = true; return; }
    let achado = null;
    try { achado = slugDeRevendaTomado(await orgs(ctx), v, idProprio); } catch { return; }
    if (inp.value.trim().toLowerCase() !== v) return;
    aviso.hidden = !achado;
    aviso.textContent = achado ? `Esse endereço já é da revenda «${achado.nome}». Escolha outro.` : "";
  }, 300);
}

async function convidarGestor(ctx, o, botao) {
  const { ui, api } = ctx;
  const h = ui.h;
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "aviso" }, ui.icone("info"), h("p", null, "O link cria uma conta NOVA de gestor desta agência. Quem já tem conta no sistema precisa usar outro e-mail.")),
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome (opcional)", nome: "nome", max: 80, autocomplete: "off" }),
      ui.campo({ rotulo: "E-mail (opcional)", nome: "email", tipo: "email", autocomplete: "off" })),
    // plano 1500c · UCB-023: a validade é escolhida, como no convite do administrador (antes fixa em 7 dias)
    ui.campo({ rotulo: "O link vale por", nome: "dias", tipo: "select", valor: "7", opcoes: OPCOES_VALIDADE_CONVITE }),
    // plano 2000d · DU-206: papéis da equipe da revenda (gestor, suporte, financeiro), quando o servidor tiver
    temRecurso(ctx.sessao, "papeis_revenda") ? ui.campo({ rotulo: "Papel na agência", nome: "papel_revenda", tipo: "select", valor: "gestor", opcoes: PAPEIS_REVENDA.map(([valor, rotulo]) => ({ valor, rotulo })) }) : null);
  let feito = null;
  await ui.modal({
    titulo: `Convidar gestor · ${o.nome}`, corpo: form, largura: "m",
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Gerar link", tipo: "primario", fn: async m => {
        if (feito) return true;
        const d = ui.lerForm(form);
        if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) { ui.marcarErro(form, "email", "Esse e-mail não parece válido."); return false; }
        // UCB-023: o «ocupado» é o do próprio «Gerar link» do modal (o ui.modal já marca o botão clicado) — não mais o botão do cartão por trás
        const r = await api.rpc("nx_convite_criar", { p_cliente: null, p_dados: { papel: "gestor", dias: Number(d.dias) || 7, nome: d.nome || null, email: d.email || null, ...(d.papel_revenda && d.papel_revenda !== "gestor" ? { papel_revenda: d.papel_revenda } : {}) }, p_org: o.id });
        feito = r;
        const lc = linkConvite(r.link, location, { superConta: !!ctx.sessao.conta.super });      // plano 2000d · DU-194
        ui.limpar(m.corpo);
        m.corpo.append(...[
          lc.link ? h("div", { class: "aviso aviso-ok" }, ui.icone("check"), h("p", null, "Convite de gestor criado. Envie o link — ele não chega por e-mail.")) : null,
          lc.link ? ui.blocoLink(lc.link, { rotulo: "Link do convite de gestor", textoWhats: `Olá${d.nome ? `, ${d.nome.split(" ")[0]}` : ""}! Aqui está o seu acesso de gestor da ${o.nome}. Crie sua conta por este link:` })
            : h("div", { class: "aviso aviso-ruim adm-link-ruim", role: "alert" }, ui.icone("alerta"), h("p", null, lc.motivo)),
          h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(r.expira_em)}, uma vez só, e apenas para conta nova.`)].filter(Boolean));
        const bt = m.el.querySelector(".modal-rod [data-tipo=primario]"); if (bt) bt.textContent = "Concluir";
        const cancelar = m.el.querySelector(".modal-rod [data-tipo=neutro]"); if (cancelar) cancelar.hidden = true;
        return false;
      } },
    ],
  });
}

async function editarMarcaOrg(ctx, o, aoFechar) {
  const { ui } = ctx;
  const h = ui.h;
  let limpar = null;
  const corpo = h("div", { class: "pilha" });
  const g = ui.gaveta({ titulo: `Marca · ${o.nome}`, corpo, largura: "g",
    aoFechar: () => { if (limpar) try { limpar(); } catch { /* ok */ } if (aoFechar) aoFechar(); } });
  // plano 1000b · UB-204: fechar a gaveta (X, voltar, clique fora ou Esc) com cor/logo mexidos e não salvos pergunta antes — editorMarca
  // expõe .sujo(); a proteção de texto da gaveta não vê troca de cor nem de imagem
  const sujo = () => !!(limpar && typeof limpar.sujo === "function" && limpar.sujo());
  let perguntando = false;
  const perguntarEFechar = async () => {
    if (perguntando) return;
    perguntando = true;
    try {
      if (await ui.confirmar({ titulo: "Fechar sem salvar a marca?", rotulo: "Fechar sem salvar", perigo: true,
        texto: `As mudanças da marca da ${o.nome} ainda não foram salvas e serão perdidas.` })) g.fechar();
    } finally { perguntando = false; }
  };
  if (g && g.el && typeof g.el.addEventListener === "function") {
    g.el.addEventListener("click", ev => {
      const t = ev.target;
      const fechar = t === g.el || (t && t.closest && t.closest(".gaveta-x, .gaveta-voltar"));
      if (!fechar || !sujo()) return;
      ev.preventDefault(); ev.stopPropagation();
      perguntarEFechar();
    }, true);
    g.el.addEventListener("keydown", ev => {
      if (ev.key !== "Escape" || !sujo()) return;
      ev.preventDefault(); ev.stopPropagation();
      perguntarEFechar();
    }, true);
  }
  try {
    const cfg = await modConfig(ctx);
    limpar = await cfg.editorMarca(ctx, corpo, { tipo: "org", org: o });
  } catch (e) {
    ui.limpar(corpo);
    corpo.append(ui.erroCartao(e, null));
  }
  return g;
}

/* ---------------- PLANOS (super) ---------------- */
async function telaPlanos(ctx, corpo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Planos");
  const novo = h("button", { type: "button", class: "bt bt-prim adm-novo" }, ui.icone("mais"), h("span", { class: "adm-novo-rot" }, "Novo plano"));      // plano 1500c · UCB-117
  novo.setAttribute("aria-label", "Novo plano");
  const grade = h("div", { class: "plano-grade" }, ui.esqueleto("cartoes", 3));
  corpo.append(h("div", { class: "adm-filtros adm-filtros-fim" },
    h("p", { class: "fraco adm-dica" }, "Limite em branco = sem limite. Mudanças valem na hora para todos os clientes do plano (exceto limites extras de cada cliente)."), novo), grade);

  async function carregar() {
    ui.limpar(grade); grade.append(ui.esqueleto("cartoes", 3));
    let ps;
    try { _planos = null; ps = await planos(ctx); }
    catch (e) { ui.limpar(grade); grade.append(ui.erroCartao(e, carregar)); return; }
    ui.limpar(grade);
    for (const p of ps) grade.append(cartaoPlano(ctx, p, carregar));
    sujos.clear();
  }
  novo.addEventListener("click", async () => {
    const form = h("form", { class: "pilha", novalidate: true },
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Nome", nome: "nome", obrigatorio: true, max: 40, autocomplete: "off", placeholder: "Ex.: Premium" }),
        ui.campo({ rotulo: "Código", nome: "id", obrigatorio: true, max: 30, autocomplete: "off", ajuda: "Minúsculas, números e _ (não muda depois)." })));
    const nome = form.querySelector("input[name=nome]"), id = form.querySelector("input[name=id]");
    let mexido = false;
    nome.addEventListener("input", () => { if (!mexido) id.value = sugerirSlug(nome.value).replace(/-/g, "_").slice(0, 30); });
    id.addEventListener("input", () => { mexido = true; });
    const r = await ui.modal({ titulo: "Novo plano", corpo: form, largura: "m", acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Criar plano", tipo: "primario", fn: async () => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        if (!d.nome || d.nome.length < 2) { ui.marcarErro(form, "nome", "Informe o nome."); return false; }
        if (!/^[a-z0-9_]{2,30}$/.test(d.id || "")) { ui.marcarErro(form, "id", "Use de 2 a 30 letras minúsculas, números ou _."); return false; }
        if ((_planos || []).some(p => p.id === d.id)) { ui.marcarErro(form, "id", "Já existe um plano com esse código."); return false; }
        return api.rpc("nx_plano_salvar", { p_plano: { id: d.id, nome: d.nome, ativo: false, modulos: ["crm", "conversas", "relatorios"],
          ordem: ((_planos || []).reduce((mx, p) => Math.max(mx, p.ordem || 0), 0) + 1) } });
      } },
    ] });
    if (r && r.id) { ui.toast("Plano criado desligado. Ajuste preço, limites e módulos e ligue quando estiver pronto.", { tipo: "ok" }); await carregar(); }
  });
  // plano 1000b · UB-266: cartão de plano mexido e não salvo → sair da tela (Clientes, menu, voltar) pergunta antes
  const sujos = new Set();
  grade.addEventListener("input", ev => { const c = ev.target && ev.target.closest ? ev.target.closest(".plano-cartao") : null; if (c) sujos.add(c); });
  grade.addEventListener("change", ev => { const c = ev.target && ev.target.closest ? ev.target.closest(".plano-cartao") : null; if (c) sujos.add(c); });
  if (typeof ctx.aoSairDaRota === "function") {
    try {
      const c = ctx.aoSairDaRota(async () => {
        const abertos = [...sujos].filter(x => x.isConnected);
        if (!abertos.length) return true;
        return ui.confirmar({ titulo: abertos.length === 1 ? "Sair sem salvar o plano?" : `Sair sem salvar ${abertos.length} planos?`, rotulo: "Sair sem salvar", perigo: true,
          texto: "Há mudanças de preço, limites ou módulos que ainda não foram salvas e serão perdidas." });
      });
      if (typeof c === "function") _limpeza.push(c);
    } catch { /* a guarda é um extra */ }
  }
  await carregar();
}

/** plano 1000b · UB-110: os limites ou os módulos do plano mudaram em relação ao salvo? (sem limite = chave ausente) */
export function mudouLimitesOuModulos(plano, { limites = {}, modulos = [] } = {}) {
  const a = (plano && plano.limites) || {};
  const chaves = new Set([...Object.keys(a), ...Object.keys(limites)]);
  for (const k of chaves) if ((a[k] ?? null) !== (limites[k] ?? null)) return true;
  const m1 = [...((plano && plano.modulos) || [])].sort().join(","), m2 = [...modulos].sort().join(",");
  return m1 !== m2;
}
/** UB-110: quantos clientes usam o plano (pela lista do nx_clientes_admin). */
export function contarClientesDoPlano(itens, planoId) { return (Array.isArray(itens) ? itens : []).filter(it => it && it.plano === planoId).length; }

function cartaoPlano(ctx, p, recarregar) {
  const { ui, api } = ctx;
  const h = ui.h;
  const lim = p.limites || {};
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome", nome: "nome", valor: p.nome, max: 40 }),
      ui.campo({ rotulo: "Preço por mês (R$)", nome: "preco_mensal", tipo: "moeda", valor: p.preco_mensal != null ? Number(p.preco_mensal) : "", ajuda: "Em branco = sob consulta." }),
      ui.campo({ rotulo: "Ordem", nome: "ordem", tipo: "numero", valor: p.ordem ?? 0, min: 0 }),
      ui.campo({ tipo: "interruptor", nome: "ativo", rotulo: "Disponível para novos clientes", valor: !!p.ativo })),
    h("fieldset", { class: "campo" }, h("legend", null, "Limites"),
      h("div", { class: "form-grade form-grade-3" }, CHAVES_LIMITE.map(k => ui.campo({ rotulo: k.curto || k.rotulo, nome: `lim_${k.chave}`, tipo: "numero", min: 0, valor: lim[k.chave] ?? "", placeholder: "sem limite" })))),
    ui.campo({ rotulo: "Módulos", nome: "modulos", tipo: "multipla", valor: p.modulos || [], opcoes: MODULOS, ajuda: "CRM e Conversas andam juntos." }),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Salvar plano")));
  const cbs = form.querySelectorAll("[data-multi=modulos] input[type=checkbox]");
  for (const cb of cbs) cb.addEventListener("change", () => {
    const par = { crm: "conversas", conversas: "crm" }[cb.value];
    const outro = [...cbs].find(x => x.value === par);
    if (outro) outro.checked = cb.checked;
  });
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (!d.nome || d.nome.length < 2) return ui.marcarErro(form, "nome", "Informe o nome.");
    // plano 1500c · UCB-025: preço negativo ou inválido não vai ao servidor
    if (!precoPlanoValido(d.preco_mensal)) return ui.marcarErro(form, "preco_mensal", "Use um valor de zero para cima (ou deixe em branco para «sob consulta»).");
    const limites = {};
    for (const k of CHAVES_LIMITE) { const v = d[`lim_${k.chave}`]; if (v !== null && v !== undefined && v !== "" && Number.isFinite(v)) limites[k.chave] = Math.max(0, Math.floor(v)); }
    // plano 1500c · UCB-009: ligar um plano sem nenhum limite deixa tudo ilimitado — pergunta antes
    if (d.ativo && p.id !== "interno" && planoSemLimites(limites) && !(await ui.confirmar({ titulo: "Este plano não tem nenhum limite", rotulo: "Salvar sem limites",
      texto: "Disponível assim, quem entrar neste plano terá usuários, números, contatos e IA sem limite. Salvar assim mesmo?" }))) return;
    if (p.id === "interno" && d.ativo === false && !(await ui.confirmar({ titulo: "Desligar o plano Interno?", texto: "Os clientes da plataforma continuam nele; ele só deixa de aparecer para novos clientes.", rotulo: "Desligar" }))) return;
    // plano 1000b · UB-110: mudar limite ou módulo vale na hora para TODOS os clientes do plano — antes de salvar, diz quantos
    if (mudouLimitesOuModulos(p, { limites, modulos: d.modulos || [] })) {
      let n = null;
      try { n = contarClientesDoPlano(await api.rpc("nx_clientes_admin", { p_filtro: { busca: null, status: null, org_id: null } }), p.id); } catch { /* sem a contagem: pergunta assim mesmo */ }
      const quem = n === null ? "todos os clientes deste plano" : n === 1 ? "1 cliente" : `${n} clientes`;
      if (n !== 0 && !(await ui.confirmar({ titulo: n === null ? `Mudar os limites ou módulos do plano ${p.nome}?` : `Afeta ${quem}`, rotulo: "Salvar plano",
        texto: `A mudança de limites ou módulos vale na hora para ${quem} (exceto os limites extras de cada cliente).` }))) return;
    }
    try {
      const r = await ui.carregando(form.querySelector("[type=submit]"), api.rpc("nx_plano_salvar", { p_plano: {
        id: p.id, nome: d.nome, preco_mensal: d.preco_mensal, ordem: Number.isFinite(d.ordem) ? Math.max(0, Math.floor(d.ordem)) : 0,
        ativo: !!d.ativo, limites, modulos: d.modulos || [] } }));
      Object.assign(p, r);
      _planos = null;
      ui.toast(`Plano ${r.nome} salvo. Vale na hora para os clientes dele.`, { tipo: "ok" });
      if (recarregar) await recarregar();
    } catch (e) {
      if (e.codigo === "dados_invalidos" && /^limites\./.test(e.hint || "")) return ui.marcarErro(form, `lim_${e.hint.slice(8)}`, "Use um número inteiro (ou deixe em branco).");
      if (e.codigo === "nome_invalido") return ui.marcarErro(form, "nome", "Use de 2 a 40 caracteres.");
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });
  // plano 1500c · UCB-095: «Duplicar» cria outro plano com o mesmo preço, limites e módulos (desligado)
  const btDup = h("button", { type: "button", class: "bt bt-fant bt-p adm-plano-dup" }, ui.icone("copiar"), "Duplicar");
  btDup.addEventListener("click", async () => {
    const fd = h("form", { class: "pilha", novalidate: true }, h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome", nome: "nome", valor: `${p.nome} (cópia)`.slice(0, 40), max: 40, autocomplete: "off" }),
      ui.campo({ rotulo: "Código", nome: "id", valor: `${p.id}_copia`.slice(0, 30), max: 30, autocomplete: "off", ajuda: "Minúsculas, números e _ (não muda depois)." })));
    const r = await ui.modal({ titulo: `Duplicar ${p.nome}`, corpo: fd, largura: "m", acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Duplicar", tipo: "primario", fn: async () => {
      ui.marcarErro(fd, null);
      const d = ui.lerForm(fd);
      if (String(d.nome || "").trim().length < 2) { ui.marcarErro(fd, "nome", "Informe o nome."); return false; }
      if (!/^[a-z0-9_]{2,30}$/.test(d.id || "")) { ui.marcarErro(fd, "id", "Use de 2 a 30 letras minúsculas, números ou _."); return false; }
      if ((_planos || []).some(x => x.id === d.id)) { ui.marcarErro(fd, "id", "Já existe um plano com esse código."); return false; }
      return api.rpc("nx_plano_salvar", { p_plano: { id: d.id, nome: String(d.nome).trim(), ativo: false, preco_mensal: p.preco_mensal ?? null, limites: { ...(p.limites || {}) },
        modulos: [...(p.modulos || [])], ordem: ((_planos || []).reduce((mx, x) => Math.max(mx, x.ordem || 0), 0) + 1) } });
    } }] });
    if (r && r.id) { _planos = null; ui.toast(`Plano ${r.nome || ""} criado desligado, igual ao ${p.nome}. Ajuste e ligue quando estiver pronto.`, { tipo: "ok" }); if (recarregar) await recarregar(); }
  });
  return h("article", { class: ["cartao", "plano-cartao", !p.ativo && "inativo"] },
    h("div", { class: "cartao-cab" },
      h("div", null, h("h2", { class: "titulo-sec" }, p.nome),
        h("p", { class: "mono fraco" }, `${p.id}${p.preco_mensal != null ? ` · ${ui.brl(p.preco_mensal, { centavos: false })}/mês` : ""}`)),
      h("div", { class: "linha" }, ui.pilula(p.id === "interno" ? "Só plataforma" : p.ativo ? "Disponível" : "Desligado", p.id === "interno" ? "sec" : p.ativo ? "ok" : "neutra"), btDup)),
    form);
}

/** plano 1000b · UB-265: o endereço da tela de domínios com os filtros. */
export function hashDominios({ status = "", busca = "" } = {}) {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (busca) q.set("busca", busca);
  const t = q.toString();
  return t ? `#/admin/dominios?${t}` : "#/admin/dominios";
}

/* ---------------- DOMÍNIOS (super: todos, com ativação · gestor: os da org) ---------------- */
async function telaDominios(ctx, corpo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Domínios");
  const superConta = !!ctx.sessao.conta.super;
  const filtro = h("select", { class: "sel", "aria-label": "Filtrar por situação" },
    h("option", { value: "" }, "Todos"), h("option", { value: "pendente" }, "Pendentes"), h("option", { value: "ativo" }, "Ativos"));
  const novo = h("button", { type: "button", class: "bt bt-prim adm-novo" }, ui.icone("mais"), h("span", { class: "adm-novo-rot" }, "Novo domínio"));      // plano 1500c · UCB-117
  novo.setAttribute("aria-label", "Novo domínio");
  // plano 1000 · AS-171: busca por endereço, cliente ou revenda (além da situação)
  const buscaDom = h("input", { type: "search", placeholder: "Buscar endereço ou cliente", "aria-label": "Buscar domínio", autocomplete: "off" });
  const lista = h("div", { class: "dom-grade" }, ui.esqueleto("cartoes", 2));
  corpo.append(...[
    superConta ? h("div", { class: "aviso" }, ui.icone("info"), h("p", null, "Para ativar: no Netlify, em Domain management → Add a domain alias, adicione o endereço; espere o certificado HTTPS sair e só então clique em Marcar ativo.")) : null,
    h("div", { class: "adm-filtros" }, h("label", { class: "busca" }, ui.icone("busca"), buscaDom), filtro, novo), lista].filter(Boolean));
  // plano 1000b · UB-265: situação e busca vão para o endereço (?status=&busca=, replaceState) — recarregar mantém o filtro
  const q0 = (ctx.rota && ctx.rota.query) || {};
  if (["pendente", "ativo"].includes(q0.status)) filtro.value = q0.status;
  if (q0.busca) buscaDom.value = String(q0.busca);
  const gravarFiltroDom = () => {
    const alvoHash = hashDominios({ status: filtro.value, busca: buscaDom.value.trim() });
    try { if (typeof history !== "undefined" && history.replaceState && typeof location !== "undefined" && location.hash !== alvoHash) history.replaceState(history.state, "", alvoHash); } catch { /* sem histórico */ }
  };
  buscaDom.addEventListener("input", ui.debounce(() => { gravarFiltroDom(); desenhar(); }, 150));
  let dados = [], cfg = null;
  async function carregar() {
    ui.limpar(lista); lista.append(ui.esqueleto("cartoes", 2));
    try {
      const [resposta, modulo] = await Promise.all([api.rpc("nx_dominios_listar"), cfg || modConfig(ctx)]);
      cfg = modulo;
      dados = cfg.validarListaDominios(resposta);
    }
    catch (e) { ui.limpar(lista); lista.append(ui.erroCartao(e, carregar)); return; }
    desenhar();
  }
  function desenhar() {
    ui.limpar(lista);
    const itens = filtrarDominios(dados, { status: filtro.value, busca: buscaDom.value });
    if (!itens.length) {
      lista.append(ui.vazio({ titulo: dados.length ? "Nenhum domínio com esse filtro ou busca." : "Nenhum domínio ainda.", icone: "globo",
        texto: dados.length ? "" : "Revendas e clientes podem usar o próprio endereço (ex.: crm.agencia.com.br) com a marca deles." }));
      return;
    }
    for (const d of itens) lista.append(cfg.cartaoDominio(ctx, d, {
      mostrarOrg: superConta,
      aoRemover: carregar,
      aoStatus: superConta ? async ativo => { dados = cfg.validarListaDominios(await api.rpc("nx_dominio_status", { p_host: d.host, p_ativo: ativo })); ui.toast(ativo ? `${d.host} ativo.` : `${d.host} voltou a pendente.`, { tipo: "ok" }); desenhar(); } : null,
    }));
  }
  filtro.addEventListener("change", () => { gravarFiltroDom(); desenhar(); });
  novo.addEventListener("click", async () => {
    const clientes = (typeof ctx.shell.clientes === "function" && ctx.shell.clientes()) || [];      // plano 1500c · UCB-018
    const form = h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: "Endereço", nome: "host", placeholder: "crm.agencia.com.br", autocomplete: "off", ajuda: "Subdomínio (domínio raiz não aceita CNAME)." }),
      ui.campo({ rotulo: "Para quem", nome: "cliente", tipo: "select", valor: "",
        opcoes: [{ valor: "", rotulo: superConta ? "Plataforma (sem cliente)" : "Toda a agência" }, ...clientes.map(c => ({ valor: c.id, rotulo: `${c.nome}${c.org_nome ? ` (${c.org_nome})` : ""}` }))] }));
    const r = await ui.modal({ titulo: "Novo domínio", corpo: form, largura: "m", acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Cadastrar", tipo: "primario", fn: async () => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        // plano 1000b · UB-106/UB-107: a mesma limpeza e as mesmas checagens das Configurações (protocolo, barra, maiúsculas; domínio raiz)
        const c = cfg || (cfg = await modConfig(ctx));
        const host = c.normalizarHost(d.host);
        const erroHost = c.erroHostDominio(host, typeof location !== "undefined" ? location.hostname : "");
        if (erroHost) { ui.marcarErro(form, "host", erroHost); return false; }
        if (c.ehDominioRaiz(host) && !(await ui.confirmar({ titulo: "Isso parece um domínio raiz", rotulo: "Usar mesmo assim",
          texto: `«${host}» não aceita CNAME na maioria dos provedores, e sem CNAME o domínio não ativa. Prefira um subdomínio, como crm.${host} ou app.${host}.` }))) {
          ui.marcarErro(form, "host", `Use um subdomínio, como crm.${host}.`); return false;
        }
        try { return await api.rpc("nx_dominio_salvar", { p_host: host, p_cliente: d.cliente || null }); }
        catch (e) {
          if (e.codigo === "dominio_invalido" || e.codigo === "dominio_em_uso") { ui.marcarErro(form, "host", api.mensagemErro(e)); return false; }
          throw e;
        }
      } },
    ] });
    if (r !== null && r !== undefined) {
      try { dados = cfg.validarListaDominios(r); desenhar(); ui.toast("Domínio cadastrado como pendente.", { tipo: "ok" }); }
      catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); await carregar(); }
    }
  });
  await carregar();
}

/** Cartão "Domínios" no detalhe do cliente (P0-B, atrás de admin_revendas). */
function cartaoDominiosCliente(ctx, cli) {
  if (!ctx.pronto("admin_revendas")) return null;
  const { ui, api } = ctx;
  const h = ui.h;
  const lista = h("div", { class: "pilha-p" }, ui.esqueleto("lista", { n: 1, anunciar: false }));   // revisão 1000b · UB-209: cartão dentro do detalhe
  // plano 1000b · UB-205: placeholder genérico (o slug do cliente não é um domínio que ele tenha)
  const host = h("input", { type: "text", placeholder: "crm.empresadocliente.com.br", "aria-label": `Novo domínio para ${cli.nome}`, autocomplete: "off", inputmode: "url" });
  const bt = h("button", { type: "submit", class: "bt bt-sec bt-p" }, ui.icone("mais"), "Adicionar");
  const erro = h("small", { class: "campo-erro", role: "alert", hidden: true });
  const form = h("form", { class: "dom-add", novalidate: true }, host, bt);
  async function carregar() {
    try {
      const modulo = await modConfig(ctx);
      const todos = modulo.validarListaDominios(await api.rpc("nx_dominios_listar"));
      const meus = todos.filter(d => d.cliente && d.cliente.id === cli.id);
      ui.limpar(lista);
      if (!meus.length) lista.append(h("p", { class: "fraco" }, "Sem domínio próprio. Os links usam o endereço da agência."));
      // plano 1500c · UCB-071: cada domínio leva à instrução dele (a tela de domínios já filtrada pelo endereço)
      for (const d of meus) lista.append(h("a", { class: "dom-linha dom-linha-link", href: hashDominios({ busca: d.host }) }, ui.icone("globo"), h("span", { class: "mono" }, d.host),
        ui.pilula(d.status === "ativo" ? "Ativo" : "Pendente", d.status === "ativo" ? "ok" : "aten"), ui.icone("seta-dir")));
    } catch (e) {
      ui.limpar(lista);
      const tentar = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Tentar novamente");
      tentar.addEventListener("click", carregar);
      lista.append(h("p", { class: "fraco", role: "alert" }, api.mensagemErro(e)), tentar);
    }
  }
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    erro.hidden = true;
    try {
      // plano 1000b · UB-108: a mesma limpeza (HTTPS://Crm.X.com.br/ → crm.x.com.br) e a checagem de domínio raiz do UB-106/UB-107
      const c = await modConfig(ctx);
      const limpo = c.normalizarHost(host.value);
      const erroHost = c.erroHostDominio(limpo, typeof location !== "undefined" ? location.hostname : "");
      if (erroHost) { erro.textContent = erroHost; erro.hidden = false; host.focus(); return; }
      if (c.ehDominioRaiz(limpo) && !(await ui.confirmar({ titulo: "Isso parece um domínio raiz", rotulo: "Usar mesmo assim",
        texto: `«${limpo}» não aceita CNAME na maioria dos provedores, e sem CNAME o domínio não ativa. Prefira um subdomínio, como crm.${limpo}.` }))) {
        erro.textContent = `Use um subdomínio, como crm.${limpo}.`; erro.hidden = false; return;
      }
      await ui.carregando(bt, api.rpc("nx_dominio_salvar", { p_host: limpo, p_cliente: cli.id }));
      host.value = ""; ui.toast("Domínio cadastrado. Veja a instrução de DNS em Admin → Domínios.", { tipo: "ok" }); carregar();
    }
    catch (e) { erro.textContent = api.mensagemErro(e); erro.hidden = false; }
  });
  carregar();
  return h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Domínios do cliente"),
    h("p", { class: "sub" }, "Quem entra por esse endereço já cai nesta empresa, com a marca dela."))),
    lista, form, erro, h("a", { class: "voltar-link adm-voltar", href: "#/admin/dominios" }, "Instruções de DNS e ativação", ui.icone("seta-dir")));
}
