/* ============================================================
   ÓRBITA — crm.js · frente F4 · entrada do módulo CRM (§7.2)
   Rotas: #/crm · #/crm?funil=<id> · #/crm/negocio/<id>
          #/contatos · #/contatos/<id> · #/contatos/importar
          #/empresas · #/empresas/<id> · #/tarefas
   Pontes (§7.2, sem segunda instância): abrirNegocio, novoNegocio,
   abrirContato — o shell faz (await ctx.carregar('crm')).abrirNegocio(ctx, …)
   e este arquivo carrega crm-negocio.js com ctx.versao.
   Um "kit" (k) leva ctx, ui, api, lógica pura e a base do CRM
   (nx_crm_base, em memória por empresa) para os outros arquivos.
   ============================================================ */

const BASE_VALIDADE_MS = 5 * 60 * 1000;
const cacheBase = new Map();          // clienteId → {base, em, promessa}
const ouvintesBase = new Map();       // clienteId → Set<fn>: telas que querem saber quando os funis da base mudaram
const modulos = new Map();            // "logica" | "kanban" | … → Promise<módulo>
let L = null;                         // crm-logica.js
let montagem = 0;
let telaAtual = null;                 // {tipo, chave, desmontar?}

function carregarArq(ctx, nome) {
  const chave = `${nome}|${ctx.versao}`;
  if (!modulos.has(chave)) {
    const p = import(`./crm-${nome}.js?v=${encodeURIComponent(ctx.versao)}`);
    p.catch(() => modulos.delete(chave));
    modulos.set(chave, p);
  }
  return modulos.get(chave);
}

async function logica(ctx) {
  if (!L) L = await carregarArq(ctx, "logica");
  return L;
}

/** graficos.js (contadores animados, sparkline quando a frente A entregar): opcional — sem ele as telas mostram os números parados. */
let G = null, promessaG = null;
function graficos(ctx) {
  if (G) return Promise.resolve(G);
  if (!promessaG) {
    promessaG = import(`./graficos.js?v=${encodeURIComponent(ctx.versao)}`).then(m => { G = m; return m; }, () => { promessaG = null; return null; });
  }
  return promessaG;
}

/**
 * Base do CRM (funis, etapas, campos, etiquetas, motivos, usuários, ticket) — em memória por empresa.
 * M30: a PRIMEIRA leitura da sessão usa o último dado guardado no aparelho (rpcC com cache) e já devolve; quando a rede responde, a mesma base é
 * atualizada no lugar (Object.assign: quem já guarda `k.base` passa a ver o dado novo) e, se os funis ou as etapas mudaram, as telas que pediram
 * (k.aoBaseMudar) são avisadas. Recarga forçada (depois de criar etiqueta/funil) vai direto à rede e também renova a cópia guardada no aparelho.
 */
async function obterBase(ctx, { forcar = false } = {}) {
  const id = ctx.cliente && ctx.cliente.id;
  if (!id) throw Object.assign(new Error("cliente_nao_encontrado"), { codigo: "cliente_nao_encontrado" });
  const c = cacheBase.get(id);
  if (!forcar && c && c.base && Date.now() - c.em < BASE_VALIDADE_MS) return c.base;
  if (!forcar && c && c.promessa) return c.promessa;
  const promessa = new Promise((resolve, reject) => {
    let servida = null;
    const fim = base => {
      let mudouFunis = false;
      if (servida && servida !== base) {                           // a tela já recebeu o dado guardado: atualiza o MESMO objeto
        mudouFunis = JSON.stringify(servida.funis || null) !== JSON.stringify(base.funis || null);
        for (const k of Object.keys(servida)) if (!(k in base)) delete servida[k];
        Object.assign(servida, base);
        base = servida;
      }
      cacheBase.set(id, { base, em: Date.now(), promessa: null });
      resolve(base);
      if (mudouFunis) avisarBase(id);                              // o quadro foi desenhado com etapas antigas: refaz o funil e recarrega
    };
    // forçada: `cache: true` sem `aoCache` — nada é servido do aparelho, mas a resposta nova substitui a cópia guardada (a próxima abertura não mostra etapas antigas)
    ctx.api.rpcC("nx_crm_base", {}, forcar ? { cache: true } : { cache: true, aoCache: dados => {
      if (servida || !baseValida(dados)) return;          // plano 1000b · RB-189: base guardada em formato antigo/estragado → espera a rede
      servida = (c && c.base) || dados;                            // já havia uma base em memória (vencida)? é ELA que as telas guardam: a rede atualiza esse objeto
      cacheBase.set(id, { base: servida, em: Date.now() - BASE_VALIDADE_MS + 15000, promessa });   // vale por 15 s: a rede atualiza em seguida
      resolve(servida);
    } }).then(fim, e => {
      // a rede falhou depois de a tela abrir com o dado guardado: a base fica, mas vencida e sem promessa — a próxima chamada tenta a rede de novo
      if (servida) { cacheBase.set(id, { base: servida, em: 0, promessa: null }); return; }
      cacheBase.delete(id); reject(e);
    });
  });
  cacheBase.set(id, { base: c && c.base, em: c ? c.em : 0, promessa });
  return promessa;
}

/**
 * plano 1000b · RB-189: a base guardada no aparelho só é servida se tiver as listas que o kit usa (funis com etapas, usuários, etiquetas,
 * motivos e, quando vier, campos) — um formato antigo ({funis: null}) derrubava o CRM antes de a rede responder.
 */
export function baseValida(b) {
  if (!b || typeof b !== "object") return false;
  if (!["funis", "usuarios", "etiquetas", "motivos"].every(x => Array.isArray(b[x]))) return false;
  if (b.campos !== undefined && b.campos !== null && !Array.isArray(b.campos)) return false;
  return b.funis.every(f => f && typeof f === "object" && Array.isArray(f.estagios));
}

/** Os funis/etapas da base desta empresa mudaram depois de a tela abrir com o dado guardado: chama quem pediu para saber (o Kanban). */
function avisarBase(id) {
  for (const fn of [...(ouvintesBase.get(id) || [])]) { try { fn(); } catch (e) { console.error(e); } }
}

/** comandos.js (recentes da paleta): opcional — sem ele «Recentes» só não ganha o negócio aberto pelo quadro. */
let promessaC = null;
function comandos(ctx) {
  if (!promessaC) promessaC = import(`./comandos.js?v=${encodeURIComponent(ctx.versao)}`).catch(() => { promessaC = null; return null; });
  return promessaC;
}

/** Kit compartilhado pelos arquivos do CRM. */
async function kitDe(ctx) {
  const [Lg, base, Gr] = await Promise.all([logica(ctx), obterBase(ctx), graficos(ctx)]);
  const ui = ctx.ui;
  const k = {
    ctx, ui, api: ctx.api, L: Lg, v: ctx.vocab, base,
    G: Gr,                                   // graficos.js ou null: as telas conferem `typeof k.G.contar === "function"` antes de usar
    h: ui.h,
    mod: nome => carregarArq(ctx, nome),
    async recarregarBase() {
      k.base = await obterBase(ctx, { forcar: true });
      // plano 1000b · RB-194: funil criado/renomeado entra já nos «Ir para o funil» da paleta
      if (comandosDe && comandosDe.ctx.cliente && ctx.cliente && comandosDe.ctx.cliente.id === ctx.cliente.id) registrarComandos(comandosDe.ctx, comandosDe.k);
      return k.base;
    },
    /** aoBaseMudar(fn) → cancelar(). `fn` roda quando a rede troca os funis/etapas da base que a tela recebeu do aparelho (a tela refaz o que desenhou com eles). */
    aoBaseMudar(fn) {
      const id = ctx.cliente && ctx.cliente.id;
      if (!id || typeof fn !== "function") return () => {};
      if (!ouvintesBase.has(id)) ouvintesBase.set(id, new Set());
      ouvintesBase.get(id).add(fn);
      return () => { const s = ouvintesBase.get(id); if (s) { s.delete(fn); if (!s.size) ouvintesBase.delete(id); } };
    },
    /** texto do erro (rótulo de campo, trava do Ads, códigos do CRM; o resto pelo api.mensagemErro) */
    erro: e => Lg.textoErro(e, { campos: k.base.campos, vocab: ctx.vocab, padrao: ctx.api && ctx.api.mensagemErro ? ctx.api.mensagemErro : ui.mensagemErro }),
    // plano 1000 (CR-208): a frase sai sem o código técnico; o código vai para o console (o suporte acha lá)
    toastErro: e => { const c = (Lg.codigoSuporte ? Lg.codigoSuporte(e) : null) || (e && e.message); if (c) console.warn("crm: erro", c); ui.toast(k.erro(e), { tipo: "erro" }); },
    pode: min => ctx.pode(min),
    eu: () => (k.base.eu && k.base.eu.id) || (ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id),
    funil: id => k.base.funis.find(f => f.id === id) || null,
    funilPadrao: () => k.base.funis.find(f => f.padrao && f.ativo !== false) || k.base.funis.find(f => f.ativo !== false) || k.base.funis[0] || null,
    estagio: id => { for (const f of k.base.funis) { const e = f.estagios.find(x => x.id === id); if (e) return e; } return null; },
    funilDoEstagio: id => k.base.funis.find(f => f.estagios.some(e => e.id === id)) || null,
    etiqueta: id => k.base.etiquetas.find(e => e.id === id) || null,
    usuario: id => k.base.usuarios.find(u => u.id === id) || null,
    nomes: () => Object.fromEntries(k.base.usuarios.map(u => [u.id, u.nome])),
    motivosPorId: () => Object.fromEntries(k.base.motivos.map(m => [m.id, m.nome])),
    cor: c => ui.corOk(c),
    /** cria etiqueta (atendente+) e já põe no catálogo em memória */
    async criarEtiqueta(nome) {
      const paleta = ctx.paleta || [];
      // plano 1500c · RC-068: a cor da paleta MENOS usada no catálogo (depois de excluir uma, a próxima não repete a última)
      const cor = k.L && typeof k.L.corMenosUsada === "function" ? k.L.corMenosUsada(paleta, (k.base.etiquetas || []).map(e => e.cor))
        : paleta.length ? paleta[k.base.etiquetas.length % paleta.length] : null;
      const e = await ctx.api.rpcC("nx_etiqueta_salvar", { p_etiqueta: { nome, ...(ui.corOk(cor) ? { cor } : {}) } });
      if (e && e.id && !k.base.etiquetas.some(x => x.id === e.id)) k.base.etiquetas = [...k.base.etiquetas, e].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));   // plano 1000b · RB-192: etiqueta sem nome não quebra
      return e;
    },
    /** valor em reais formatado */
    brl: (v, o) => ui.brl(v, o),
    /** M25: escrita com chave de idempotência — em erro ambíguo (prazo, conexão) repete com a MESMA chave e nunca duplica. → {resultado, req} */
    escrever: (nome, params, o) => Lg.escreverComReq(ctx.api, nome, params, o),
    novaReq: () => Lg.novaReq(),
    /**
     * plano 1000 (CR-188): entra em «Recentes» da paleta (Ctrl+K) — o negócio aberto pelo cartão do quadro não muda o endereço, então o shell não o
     * vê. Mesma lista do shell (comandos.js: chave por conta + empresa, no aparelho). Nunca atrapalha a tela.
     */
    lembrarRecente(item) {
      const conta = ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id, cli = ctx.cliente && ctx.cliente.id;
      if (!conta || !cli || !item) return Promise.resolve(null);
      return comandos(ctx).then(C => {
        if (!C) return null;
        try { return C.criarRecentes({ armazenamento: localStorage, chave: C.chaveRecentes(conta, cli) }).registrar({ sub: ctx.vocab && ctx.vocab.negocio, ...item }); } catch { return null; }
      });
    },
    /** M30: guarda o que a pessoa digita neste campo (ctx.rascunho do shell: por conta + empresa, 7 dias) e devolve o controle {apagar()}.
        Chame `.apagar()` só depois que o servidor confirmar. Sem o recurso do shell vira no-op. */
    rascunho: (campo, chave, opcoes) => {
      try { if (ctx.rascunho && typeof ctx.rascunho.ligar === "function") return ctx.rascunho.ligar(campo, chave, opcoes); } catch { /* sem rascunho a tela funciona igual */ }
      return { restaurado: false, apagar() {}, desligar() {}, salvarAgora() {} };
    },
  };
  return k;
}

/** Kit para as seções do CRM no hub de configurações (crm-config.js pega por ctx.carregar('crm')). */
export async function kit(ctx) { return kitDe(ctx); }
/** Esquece a base em memória da empresa (a próxima tela pede de novo ao servidor). */
export function invalidarBase(clienteId) { if (clienteId) cacheBase.delete(clienteId); else cacheBase.clear(); }

/* ============================================================ pontes (§7.2) */
/** abrirNegocio(ctx, id, {aoMudar, aoFechar}) — gaveta do negócio por cima de qualquer tela. */
export async function abrirNegocio(ctx, id, opts = {}) {
  // plano 1000b · RB-195: a ponte não rejeita (o Início chama sem await/catch) — erro de rede vira aviso e o retorno é null
  try {
    const k = await kitDe(ctx);
    const N = await k.mod("negocio");
    return await N.abrirNegocio(k, id, opts);
  } catch (e) { erroDaPonte(ctx, e); return null; }
}
function erroDaPonte(ctx, e) {
  console.error(e);
  try { ctx.ui.toast(L && L.textoErro ? L.textoErro(e, { vocab: ctx.vocab }) : "Não deu certo agora. Tente de novo em instantes.", { tipo: "erro" }); } catch { /* sem ui */ }
}
/** novoNegocio(ctx, {contato_id, conversa_id, funil_id, estagio_id}, {aoCriar}) — mesma gaveta em modo criação. */
export async function novoNegocio(ctx, dados = {}, opts = {}) {
  try {         // plano 1000b · RB-195
    const k = await kitDe(ctx);
    const N = await k.mod("negocio");
    return await N.novoNegocio(k, dados, opts);
  } catch (e) { erroDaPonte(ctx, e); return null; }
}
/** abrirContato(ctx, id, {aoMudar}) — ficha 360 numa gaveta larga (sem sair da tela atual). */
export async function abrirContato(ctx, id, opts = {}) {
  try {         // plano 1000b · RB-195
    const k = await kitDe(ctx);
    const N = await k.mod("negocio");
    return await N.abrirContato(k, id, opts);
  } catch (e) { erroDaPonte(ctx, e); return null; }
}

function fecharGavetaAtual() {
  const gaveta = telaAtual && telaAtual.gaveta;
  if (!gaveta) return;
  telaAtual.gaveta = null;
  try { gaveta.fechar(); } catch (e) { console.error(e); }
}

/* ============================================================ esqueleto */
/** Forma da tela enquanto carrega (a troca não desloca nada): cabeçalho, e no Kanban também os 3 totais, ou a lista de linhas. Só classes do ui.esqueleto (A). */
export function esqueletoDe(ctx, tipo) {      // plano 1000b · RB-193: exportada para o teste
  const { ui } = ctx;
  if (tipo === "kanban") {
    const sk = ui.esqueleto("kanban", { n: 5, cabecalho: { sub: false, acao: true } });
    const kpis = ui.esqueleto("cartoes", { n: 3 }).querySelector(".sk-cartoes"), cols = sk.querySelector(".sk-kanban");
    if (kpis && cols) sk.insertBefore(kpis, cols);
    return sk;
  }
  if (tipo === "contatos" || tipo === "empresas") return ui.esqueleto("lista", { n: 8, cabecalho: { sub: true, acao: true } });
  if (tipo === "tarefas") return ui.esqueleto("lista", { n: 5, cabecalho: { sub: false, acao: true } });
  if (tipo === "ficha" || tipo === "empresa") return ui.esqueleto("cartoes", 4);
  // plano 1000b · RB-193: a importação abre com a forma da tela final (cabeçalho + passos + o cartão do arquivo), não com uma tabela genérica
  if (tipo === "importar") return ui.esqueleto("cartao", { cabecalho: { sub: true, acao: true } });
  return ui.esqueleto("tabela", 6);
}

/* ============================================================ paleta de comandos (Ctrl/⌘+K, frente B) */
let comandosAtivos = [];
let comandosDe = null;                // plano 1000b · RB-194: {ctx, k} dos comandos registrados (refeitos quando a base muda)
let soltarBaseComandos = null;
function limparComandos() {
  for (const f of comandosAtivos) { try { f(); } catch { /* ok */ } }
  comandosAtivos = [];
  comandosDe = null;
  if (soltarBaseComandos) { soltarBaseComandos(); soltarBaseComandos = null; }
}
/**
 * Enquanto o CRM está aberto, a paleta oferece «Nova oportunidade», «Nova tarefa», «Novo paciente», os funis e (plano 1000, CR-189) «Importar planilha»,
 * «Exportar planilha» e «Nova empresa» conforme o papel. Sem a paleta (shell antigo) não faz nada.
 */
function registrarComandos(ctx, k) {
  limparComandos();
  if (!ctx.comandos || typeof ctx.comandos.registrar !== "function") return;
  comandosDe = { ctx, k };
  // plano 1000b · RB-194: a rede trocou os funis da base (cache → rede) — os «Ir para o funil» são refeitos
  if (typeof k.aoBaseMudar === "function") soltarBaseComandos = k.aoBaseMudar(() => { if (comandosDe && comandosDe.k === k) registrarComandos(ctx, k); });
  const reg = c => { try { const d = ctx.comandos.registrar(c); if (typeof d === "function") comandosAtivos.push(d); } catch { /* sem paleta */ } };
  // plano 1000 (CR-037): «Ir para o funil «X»» (com 2 funis ou mais) — o mesmo que Alt+1…5 no quadro.
  // plano 1000b · RB-190: registrado ANTES do teste de papel — navegar entre funis não escreve nada (o «somente leitura» também usa);
  // e com a base mais nova em memória (RB-194: recarregarBase de outro kit troca o objeto)
  const baseAgora = (ctx.cliente && cacheBase.get(ctx.cliente.id) && cacheBase.get(ctx.cliente.id).base) || k.base;
  const ativos = ((baseAgora && baseAgora.funis) || []).filter(f => f.ativo !== false);
  if (ativos.length > 1) ativos.forEach((f, i) => reg({ id: `crm.funil-${f.id}`, rotulo: `Ir para o funil «${f.nome}»`, palavras: `funil quadro kanban ${f.nome}${i < 5 ? ` alt+${i + 1}` : ""}`,
    fazer: () => ctx.navegar(`#/crm?funil=${encodeURIComponent(f.id)}`) }));
  if (!k.pode("atendente")) return;
  const tipoTela = telaAtual && telaAtual.tipo;
  // plano 1000 (CR-267): no quadro a tecla N cria um cartão (o quadro atende a tecla; aqui ela aparece na folha «?»)
  reg({ id: "crm.novo-negocio", rotulo: k.v.novo("negocio"), palavras: "oportunidade negócio lead cartão criar novo", ...(tipoTela === "kanban" ? { atalho: "N" } : {}), fazer: () => novoNegocio(ctx, {}) });
  reg({ id: "crm.nova-tarefa", rotulo: "Nova tarefa", palavras: "tarefa lembrete ligar retorno criar", fazer: async () => {
    try { const kk = await kitDe(ctx); const T = await kk.mod("tarefas"); const t = await T.formTarefa(kk, null, {}); if (t) ctx.ui.toast("Tarefa criada.", { tipo: "ok", ms: 2200 }); }
    catch (e) { console.error(e); ctx.ui.toast("Não foi possível abrir a tarefa.", { tipo: "erro" }); }
  } });
  const cadastrar = async (pre = {}) => {
    try {
      const kk = await kitDe(ctx); const M = await kk.mod("listas"); const c = await M.formContato(kk, pre);
      if (!c) return;
      // plano 1000 (CR-223): só a lista de contatos navega para a ficha nova; nas outras telas a pessoa continua onde estava, com «Abrir» no aviso
      if (telaAtual && telaAtual.tipo === "contatos") { ctx.navegar(`#/contatos/${c.id}`); return; }
      ctx.ui.toast(`${k.v.contato} cadastrad${k.v.art("contato")}.`, { tipo: "ok", ms: 6000, acao: { rotulo: "Abrir", fn: () => ctx.navegar(`#/contatos/${c.id}`) } });
    } catch (e) { console.error(e); ctx.ui.toast("Não foi possível abrir o cadastro.", { tipo: "erro" }); }
  };
  reg({ id: "crm.novo-contato", rotulo: k.v.novo("contato"), palavras: "paciente contato cliente cadastrar criar novo", fazer: () => cadastrar(),
    // plano 1000 (CR-187): a busca da paleta não achou ninguém → «Cadastrar «Mariana» como paciente» já com o nome (ou o telefone) preenchido
    rotuloTermo: t => `Cadastrar «${t}» como ${k.v.min("contato")}`,
    comTermo: t => cadastrar(/^[+\d\s().-]{8,}$/.test(t) && t.replace(/\D/g, "").length >= 8 ? { telefone: t } : { nome: t }) });
  // plano 1000 (CR-189): importar (supervisor+), exportar (admin) e nova empresa — antes só existiam dentro das telas
  if (k.pode("supervisor")) reg({ id: "crm.importar", rotulo: "Importar planilha", palavras: `importar planilha csv excel ${k.v.min("contatos")}`, icone: "camadas",
    fazer: () => ctx.navegar("#/contatos/importar") });
  if (k.pode("admin")) reg({ id: "crm.exportar", rotulo: "Exportar planilha", palavras: `exportar planilha csv excel baixar ${k.v.min("contatos")}`, icone: "baixar",
    fazer: () => ctx.navegar("#/contatos?exportar=1") });
  reg({ id: "crm.nova-empresa", rotulo: "Nova empresa", palavras: "empresa convenio frota parceiro cadastrar criar nova", icone: "empresa", fazer: async () => {
    try {
      const kk = await kitDe(ctx); const M = await kk.mod("listas"); const e = await M.formEmpresa(kk, null);
      if (e) ctx.ui.toast(`Empresa «${e.nome || ""}» cadastrada.`, { tipo: "ok", ms: 6000, acao: { rotulo: "Abrir", fn: () => ctx.navegar(`#/empresas/${e.id}`) } });
    } catch (err) { console.error(err); ctx.ui.toast("Não foi possível abrir o cadastro da empresa.", { tipo: "erro" }); }
  } });
}

/**
 * plano 1000 (CR-266): o cartão de erro da tela leva, pequeno, o código e a hora («código http_500 · 14:02») — é o que o suporte pergunta.
 * A frase continua a do ui.erroCartao.
 */
function cartaoErro(ctx, e, tentar) {
  const card = ctx.ui.erroCartao(e, tentar);
  // plano 1000b · RB-191: só o código (ou o status HTTP) vai para a tela — «código Failed to fetch» confundia; a mensagem crua fica no console
  const cod = e && (e.codigo || (e.status ? `http_${e.status}` : null));
  if (!cod && e && e.message) console.warn("crm: erro", e.message);
  let hora = "";
  try { hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }); } catch { /* sem Intl */ }
  if (card && typeof card.appendChild === "function" && (cod || hora)) {
    card.appendChild(ctx.ui.h("small", { class: "crm-erro-cod" }, [cod ? `código ${String(cod).slice(0, 60)}` : null, hora || null].filter(Boolean).join(" · ")));
  }
  return card;
}

/* ============================================================ botão flutuante (CR-009) */
/**
 * plano 1000 (CR-009): no celular o «+» flutuante some enquanto a pessoa rola para BAIXO (lendo os cartões, ele cobria o ⋮ «Mover para…» do
 * último cartão e a paginação) e volta ao rolar para cima ou parar no topo. Vale para o quadro, Pacientes e Tarefas.
 */
let soltarFab = null;
function ligarFab(el) {
  if (soltarFab) { soltarFab(); soltarFab = null; }
  if (!el || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  const ultimo = new WeakMap();
  const aoRolar = ev => {
    const fab = el.querySelector && el.querySelector(".crm-fab");
    if (!fab) return;
    const alvo = ev && ev.target && ev.target !== document ? ev.target : (document.scrollingElement || document.documentElement);
    if (!alvo || (alvo.nodeType === 1 && alvo !== document.scrollingElement && alvo !== document.documentElement && !el.contains(alvo))) return;
    const y = Number(alvo.scrollTop) || 0, antes = ultimo.has(alvo) ? ultimo.get(alvo) : y;
    ultimo.set(alvo, y);
    if (y <= 8 || y < antes - 4) fab.classList.remove("crm-fab-some");
    else if (y > antes + 4) fab.classList.add("crm-fab-some");
  };
  document.addEventListener("scroll", aoRolar, { capture: true, passive: true });
  soltarFab = () => document.removeEventListener("scroll", aoRolar, { capture: true });
}

/* ============================================================ montagem */
export function desmontar() {
  montagem++;
  if (soltarFab) { soltarFab(); soltarFab = null; }
  limparComandos();
  fecharGavetaAtual();
  if (telaAtual && typeof telaAtual.desmontar === "function") { try { telaAtual.desmontar(); } catch (e) { console.error(e); } }
  telaAtual = null;
}

export async function montar(ctx) {
  const minha = ++montagem;
  const { ui } = ctx;
  ui.carregarCss("crm");
  const r = ctx.rota || { modulo: "crm", partes: [], query: {} };
  const modulo = r.modulo || "crm";
  const partes = r.partes || [];

  // decide a tela
  let tipo, chave;
  // plano 1500c · UC-028: o atalho «Importar planilha» do Início/ajuda aponta para #/crm?importar=1 — abre a importação (não o quadro)
  if (modulo === "crm" && r.query && String(r.query.importar) === "1" && !partes[0]) { tipo = "importar"; chave = "importar"; }
  else if (modulo === "crm") { tipo = "kanban"; chave = `kanban|${r.query && r.query.funil || ""}|${r.query && r.query.busca || ""}`; }   // plano 1000 (CR-185): ?busca nova remonta o quadro
  else if (modulo === "contatos" && partes[0] === "importar") { tipo = "importar"; chave = "importar"; }
  else if (modulo === "contatos" && partes[0]) { tipo = "ficha"; chave = `ficha|${partes[0]}`; }
  else if (modulo === "contatos") { tipo = "contatos"; chave = `contatos|${JSON.stringify(r.query || {})}`; }   // plano 1000: filtro de link novo (?busca, ?empresa, ?origem) remonta a lista
  else if (modulo === "empresas" && partes[0]) { tipo = "empresa"; chave = `empresa|${partes[0]}`; }
  else if (modulo === "empresas") { tipo = "empresas"; chave = "empresas"; }
  else if (modulo === "tarefas") { tipo = "tarefas"; chave = "tarefas"; }
  else { tipo = "kanban"; chave = "kanban|"; }
  // plano 1500c · RC-067: #/crm/negocio/ID sem ?funil/?busca abre a gaveta SOBRE o quadro que já está aberto (herda funil e busca) — não refaz o quadro
  if (tipo === "kanban" && partes[0] === "negocio" && !(r.query && (r.query.funil || r.query.busca)) && telaAtual && telaAtual.tipo === "kanban") chave = telaAtual.chave;

  // plano 1000 (CR-040): #/contatos/abc e #/empresas/xyz não viram erro técnico (Number("abc") = null no servidor) — «não encontrado», nenhuma RPC
  if ((tipo === "ficha" || tipo === "empresa") && !/^\d+$/.test(String(partes[0]))) {
    fecharGavetaAtual();
    if (telaAtual && typeof telaAtual.desmontar === "function") { try { telaAtual.desmontar(); } catch (e) { console.error(e); } }
    telaAtual = null;
    ui.limpar(ctx.alvo);
    const lista = tipo === "ficha" ? { hash: "#/contatos", nome: (ctx.vocab && ctx.vocab.contatos) || "Contatos" } : { hash: "#/empresas", nome: "Empresas" };
    ctx.alvo.appendChild(ui.h("div", { class: "crm", dataset: { tela: tipo } }, ui.vazio({ titulo: tipo === "ficha" ? "Cadastro não encontrado" : "Empresa não encontrada",
      texto: "O endereço não aponta para um cadastro válido. Ele pode ter sido digitado errado.", icone: tipo === "ficha" ? "contato" : "empresa",
      acao: { rotulo: `Ver ${lista.nome.toLowerCase()}`, fn: () => ctx.navegar(lista.hash) } })));
    return;
  }

  // mesma tela ainda na vista (ex.: #/crm/negocio/42 sobre o quadro já aberto): só abre a gaveta
  const reaproveita = telaAtual && telaAtual.chave === chave && telaAtual.el && telaAtual.el.isConnected && ctx.alvo.contains(telaAtual.el);
  if (!reaproveita) {
    fecharGavetaAtual();
    if (telaAtual && typeof telaAtual.desmontar === "function") { try { telaAtual.desmontar(); } catch (e) { console.error(e); } }
    telaAtual = null;
    ui.limpar(ctx.alvo);
    ctx.alvo.appendChild(esqueletoDe(ctx, tipo));
  }

  const arquivoDaTela = { kanban: "kanban", contatos: "listas", ficha: "listas", empresas: "listas", empresa: "listas", tarefas: "tarefas", importar: "importar" }[tipo];
  let k;
  try {
    // M30: lógica, base, o arquivo da tela (e, no Kanban, a gaveta do negócio) chegam juntos em vez de em fila
    [k] = await Promise.all([kitDe(ctx), reaproveita ? null : carregarArq(ctx, arquivoDaTela), !reaproveita && tipo === "kanban" ? carregarArq(ctx, "negocio") : null]);
  } catch (e) {
    if (minha !== montagem) return;
    ui.limpar(ctx.alvo);
    ctx.alvo.appendChild(cartaoErro(ctx, e, () => { cacheBase.delete(ctx.cliente && ctx.cliente.id); montar(ctx); }));
    return;
  }
  if (minha !== montagem) return;

  try {
    if (!reaproveita) {
      const M = await k.mod(arquivoDaTela);
      if (minha !== montagem) return;
      const el = ui.h("div", { class: "crm", dataset: { tela: tipo } });
      let tela;
      if (tipo === "kanban") tela = await M.montarKanban(k, el, r);
      else if (tipo === "contatos") tela = await M.montarContatos(k, el, r);
      else if (tipo === "ficha") tela = await M.montarFicha(k, el, partes[0], {});
      else if (tipo === "empresas") tela = await M.montarEmpresas(k, el, r);
      else if (tipo === "empresa") tela = await M.montarEmpresa(k, el, partes[0], r);
      else if (tipo === "tarefas") tela = await M.montarTarefas(k, el, r);
      else if (tipo === "importar") tela = await M.montarImportar(k, el, r);
      if (minha !== montagem) { if (tela && tela.desmontar) tela.desmontar(); return; }
      ui.limpar(ctx.alvo);
      ctx.alvo.appendChild(el);
      telaAtual = { tipo, chave, el, ...(tela || {}) };
      ligarFab(el);
    }
    registrarComandos(ctx, k);
    // deep link da gaveta: #/crm/negocio/<id>
    if (tipo === "kanban" && partes[0] === "negocio" && /^\d+$/.test(partes[1] || "")) {
      const N = await k.mod("negocio");
      if (minha !== montagem) return;
      fecharGavetaAtual();
      const idNegocio = Number(partes[1]);
      const gaveta = await N.abrirNegocio(k, idNegocio, {
        aoMudar: c => telaAtual && telaAtual.aoMudarNegocio && telaAtual.aoMudarNegocio(c),
        // plano 1000 (CR-039): o negócio é de outro funil → o quadro por baixo troca para ele (ao fechar a gaveta, o cartão está à vista)
        aoCarregar: d => { const f = d && d.negocio && d.negocio.funil_id; if (f && telaAtual && typeof telaAtual.mostrarFunil === "function") telaAtual.mostrarFunil(f); },
        aoFechar: () => {
          // volta o endereço para o quadro sem remontar a tela (no funil que o quadro mostra agora)
          const fAtual = telaAtual && typeof telaAtual.funilAtual === "function" ? telaAtual.funilAtual() : null;
          const fq = fAtual || (r.query && r.query.funil);
          const q = fq ? `?funil=${encodeURIComponent(fq)}` : "";
          const prefixo = `#/crm/negocio/${idNegocio}`;
          if (location.hash === prefixo || location.hash.startsWith(prefixo + "?")) history.replaceState(history.state, "", `${location.pathname}${location.search}#/crm${q}`);
        },
      });
      if (minha !== montagem) { gaveta && gaveta.fechar(); return; }
      if (telaAtual) telaAtual.gaveta = gaveta;
    } else {
      fecharGavetaAtual();
      // plano 1500c · RX-064: #/crm/negocio/abc (link cortado/digitado errado) avisa em vez de só mostrar o quadro calado
      if (tipo === "kanban" && partes[0] === "negocio" && partes[1] !== undefined && !/^\d+$/.test(partes[1] || "")) {
        const art = ctx.vocab && typeof ctx.vocab.art === "function" ? ctx.vocab.art("negocio") : "o";
        ui.toast(`Esse link não aponta para ${art === "a" ? "uma" : "um"} ${(ctx.vocab && typeof ctx.vocab.min === "function" && ctx.vocab.min("negocio")) || "negócio"} válid${art}.`, { tipo: "erro" });
      }
    }
  } catch (e) {
    console.error("crm: montar falhou", e);
    if (minha !== montagem) return;
    ui.limpar(ctx.alvo);
    ctx.alvo.appendChild(cartaoErro(ctx, e, () => montar(ctx)));
  }
}
