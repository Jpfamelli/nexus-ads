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

/** Base do CRM (funis, etapas, campos, etiquetas, motivos, usuários, ticket) — em memória por empresa. */
async function obterBase(ctx, { forcar = false } = {}) {
  const id = ctx.cliente && ctx.cliente.id;
  if (!id) throw Object.assign(new Error("cliente_nao_encontrado"), { codigo: "cliente_nao_encontrado" });
  const c = cacheBase.get(id);
  if (!forcar && c && c.base && Date.now() - c.em < BASE_VALIDADE_MS) return c.base;
  if (!forcar && c && c.promessa) return c.promessa;
  const promessa = ctx.api.rpcC("nx_crm_base").then(base => {
    cacheBase.set(id, { base, em: Date.now(), promessa: null });
    return base;
  }).catch(e => { cacheBase.delete(id); throw e; });
  cacheBase.set(id, { base: c && c.base, em: c ? c.em : 0, promessa });
  return promessa;
}

/** Kit compartilhado pelos arquivos do CRM. */
async function kitDe(ctx) {
  const Lg = await logica(ctx);
  const base = await obterBase(ctx);
  const ui = ctx.ui;
  const k = {
    ctx, ui, api: ctx.api, L: Lg, v: ctx.vocab, base,
    h: ui.h,
    mod: nome => carregarArq(ctx, nome),
    async recarregarBase() { k.base = await obterBase(ctx, { forcar: true }); return k.base; },
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

/* ============================================================ montagem */
export function desmontar() {
  montagem++;
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
    ctx.alvo.appendChild(ui.esqueleto(tipo === "kanban" ? "kanban" : tipo === "ficha" ? "cartoes" : "tabela", 6));
  }

  let k;
  try {
    k = await kitDe(ctx);
  } catch (e) {
    if (minha !== montagem) return;
    ui.limpar(ctx.alvo);
    ctx.alvo.appendChild(ui.erroCartao(e, () => { cacheBase.delete(ctx.cliente && ctx.cliente.id); montar(ctx); }));
    return;
  }
  if (minha !== montagem) return;

  try {
    if (!reaproveita) {
      const arquivo = { kanban: "kanban", contatos: "listas", ficha: "listas", empresas: "listas", empresa: "listas",
        tarefas: "tarefas", importar: "importar" }[tipo];
      const M = await k.mod(arquivo);
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
