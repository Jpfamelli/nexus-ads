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
      if (servida || !dados || typeof dados !== "object") return;
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

/** Os funis/etapas da base desta empresa mudaram depois de a tela abrir com o dado guardado: chama quem pediu para saber (o Kanban). */
function avisarBase(id) {
  for (const fn of [...(ouvintesBase.get(id) || [])]) { try { fn(); } catch (e) { console.error(e); } }
}

/** Kit compartilhado pelos arquivos do CRM. */
async function kitDe(ctx) {
  const [Lg, base] = await Promise.all([logica(ctx), obterBase(ctx)]);
  const ui = ctx.ui;
  const k = {
    ctx, ui, api: ctx.api, L: Lg, v: ctx.vocab, base,
    h: ui.h,
    mod: nome => carregarArq(ctx, nome),
    async recarregarBase() { k.base = await obterBase(ctx, { forcar: true }); return k.base; },
    /** aoBaseMudar(fn) → cancelar(). `fn` roda quando a rede troca os funis/etapas da base que a tela recebeu do aparelho (a tela refaz o que desenhou com eles). */
    aoBaseMudar(fn) {
      const id = ctx.cliente && ctx.cliente.id;
      if (!id || typeof fn !== "function") return () => {};
      if (!ouvintesBase.has(id)) ouvintesBase.set(id, new Set());
      ouvintesBase.get(id).add(fn);
      return () => { const s = ouvintesBase.get(id); if (s) { s.delete(fn); if (!s.size) ouvintesBase.delete(id); } };
    },
    /** texto do erro (rótulo de campo, trava do Ads, códigos do CRM; o resto pelo api.mensagemErro) */
    erro: e => Lg.textoErro(e, { campos: k.base.campos, padrao: ctx.api && ctx.api.mensagemErro ? ctx.api.mensagemErro : ui.mensagemErro }),
    toastErro: e => ui.toast(k.erro(e), { tipo: "erro" }),
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
      const cor = paleta.length ? paleta[k.base.etiquetas.length % paleta.length] : null;
      const e = await ctx.api.rpcC("nx_etiqueta_salvar", { p_etiqueta: { nome, ...(ui.corOk(cor) ? { cor } : {}) } });
      if (e && e.id && !k.base.etiquetas.some(x => x.id === e.id)) k.base.etiquetas = [...k.base.etiquetas, e].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      return e;
    },
    /** valor em reais formatado */
    brl: (v, o) => ui.brl(v, o),
    /** M25: escrita com chave de idempotência — em erro ambíguo (prazo, conexão) repete com a MESMA chave e nunca duplica. → {resultado, req} */
    escrever: (nome, params, o) => Lg.escreverComReq(ctx.api, nome, params, o),
    novaReq: () => Lg.novaReq(),
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
  const k = await kitDe(ctx);
  const N = await k.mod("negocio");
  return N.abrirNegocio(k, id, opts);
}
/** novoNegocio(ctx, {contato_id, conversa_id, funil_id, estagio_id}, {aoCriar}) — mesma gaveta em modo criação. */
export async function novoNegocio(ctx, dados = {}, opts = {}) {
  const k = await kitDe(ctx);
  const N = await k.mod("negocio");
  return N.novoNegocio(k, dados, opts);
}
/** abrirContato(ctx, id, {aoMudar}) — ficha 360 numa gaveta larga (sem sair da tela atual). */
export async function abrirContato(ctx, id, opts = {}) {
  const k = await kitDe(ctx);
  const N = await k.mod("negocio");
  return N.abrirContato(k, id, opts);
}

function fecharGavetaAtual() {
  const gaveta = telaAtual && telaAtual.gaveta;
  if (!gaveta) return;
  telaAtual.gaveta = null;
  try { gaveta.fechar(); } catch (e) { console.error(e); }
}

/* ============================================================ esqueleto */
/** Forma da tela enquanto carrega (a troca não desloca nada): cabeçalho, e no Kanban também os 3 totais, ou a lista de linhas. Só classes do ui.esqueleto (A). */
function esqueletoDe(ctx, tipo) {
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
  return ui.esqueleto("tabela", 6);
}

/* ============================================================ paleta de comandos (Ctrl/⌘+K, frente B) */
let comandosAtivos = [];
function limparComandos() { for (const f of comandosAtivos) { try { f(); } catch { /* ok */ } } comandosAtivos = []; }
/** Enquanto o CRM está aberto, a paleta oferece «Nova oportunidade», «Nova tarefa» e «Novo paciente». Sem a paleta (shell antigo) não faz nada. */
function registrarComandos(ctx, k) {
  limparComandos();
  if (!ctx.comandos || typeof ctx.comandos.registrar !== "function" || !k.pode("atendente")) return;
  const reg = c => { try { const d = ctx.comandos.registrar(c); if (typeof d === "function") comandosAtivos.push(d); } catch { /* sem paleta */ } };
  reg({ id: "crm.novo-negocio", rotulo: k.v.novo("negocio"), palavras: "oportunidade negócio lead cartão criar novo", fazer: () => novoNegocio(ctx, {}) });
  reg({ id: "crm.nova-tarefa", rotulo: "Nova tarefa", palavras: "tarefa lembrete ligar retorno criar", fazer: async () => {
    try { const kk = await kitDe(ctx); const T = await kk.mod("tarefas"); const t = await T.formTarefa(kk, null, {}); if (t) ctx.ui.toast("Tarefa criada.", { tipo: "ok", ms: 2200 }); }
    catch (e) { console.error(e); ctx.ui.toast("Não foi possível abrir a tarefa.", { tipo: "erro" }); }
  } });
  reg({ id: "crm.novo-contato", rotulo: k.v.novo("contato"), palavras: "paciente contato cliente cadastrar criar novo", fazer: async () => {
    try { const kk = await kitDe(ctx); const M = await kk.mod("listas"); const c = await M.formContato(kk); if (c) ctx.navegar(`#/contatos/${c.id}`); }
    catch (e) { console.error(e); ctx.ui.toast("Não foi possível abrir o cadastro.", { tipo: "erro" }); }
  } });
}

/* ============================================================ montagem */
export function desmontar() {
  montagem++;
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
  if (modulo === "crm") { tipo = "kanban"; chave = `kanban|${r.query && r.query.funil || ""}`; }
  else if (modulo === "contatos" && partes[0] === "importar") { tipo = "importar"; chave = "importar"; }
  else if (modulo === "contatos" && partes[0]) { tipo = "ficha"; chave = `ficha|${partes[0]}`; }
  else if (modulo === "contatos") { tipo = "contatos"; chave = "contatos"; }
  else if (modulo === "empresas" && partes[0]) { tipo = "empresa"; chave = `empresa|${partes[0]}`; }
  else if (modulo === "empresas") { tipo = "empresas"; chave = "empresas"; }
  else if (modulo === "tarefas") { tipo = "tarefas"; chave = "tarefas"; }
  else { tipo = "kanban"; chave = "kanban|"; }

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
    ctx.alvo.appendChild(ui.erroCartao(e, () => { cacheBase.delete(ctx.cliente && ctx.cliente.id); montar(ctx); }));
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
      else if (tipo === "empresa") tela = await M.montarEmpresa(k, el, partes[0]);
      else if (tipo === "tarefas") tela = await M.montarTarefas(k, el, r);
      else if (tipo === "importar") tela = await M.montarImportar(k, el, r);
      if (minha !== montagem) { if (tela && tela.desmontar) tela.desmontar(); return; }
      ui.limpar(ctx.alvo);
      ctx.alvo.appendChild(el);
      telaAtual = { tipo, chave, el, ...(tela || {}) };
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
        aoFechar: () => {
          // volta o endereço para o quadro sem remontar a tela
          const q = r.query && r.query.funil ? `?funil=${encodeURIComponent(r.query.funil)}` : "";
          const prefixo = `#/crm/negocio/${idNegocio}`;
          if (location.hash === prefixo || location.hash.startsWith(prefixo + "?")) history.replaceState(history.state, "", `${location.pathname}${location.search}#/crm${q}`);
        },
      });
      if (minha !== montagem) { gaveta && gaveta.fechar(); return; }
      if (telaAtual) telaAtual.gaveta = gaveta;
    } else fecharGavetaAtual();
  } catch (e) {
    console.error("crm: montar falhou", e);
    if (minha !== montagem) return;
    ui.limpar(ctx.alvo);
    ctx.alvo.appendChild(ui.erroCartao(e, () => montar(ctx)));
  }
}
