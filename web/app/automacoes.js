/* ============================================================
   ÓRBITA — automacoes.js · frente F7 · T12 (ESPEC §2.6, §5.7, §5.8) + PLANO-NOITE-20261001
   Rotas: #/automacoes · #/automacoes/nova[?modelo=<id>|?ia=1] · #/automacoes/<id>[?aba=execucoes|?testar=1]
   Lista (criar com IA + suas automações + receitas prontas + do sistema); o editor mora em auto-editor.js.
   Dados: nx_automacoes_listar (traz também a base do editor), nx_automacao_salvar | _ativar | _excluir | _execucoes,
   nx_auto_simular (testar), nx-ia ação automacao_montar (criar com IA — nunca salva sozinha).
   Regras do app: sem import estático (auto-logica.js, auto-pecas.js e auto-editor.js vêm por import()
   com ctx.versao), texto de usuário só por textContent (ui.h), nenhuma cor escrita aqui
   (só tokens do CSS / --cor validada).
   ============================================================ */

let L = null;              // auto-logica.js (puro)
let PE = null;             // auto-pecas.js
let ED = null;             // auto-editor.js
let montagem = 0;          // descarta respostas de montagens antigas
let cancelarPulso = null;
let rascunhoIA = null;     // {auto, explicacao, avisos} — a montagem da IA que o editor abre (a cópia da aba fica em rascunhosDe(ctx), chave «ia»)
let textoIA = "";          // o que a pessoa já digitou na caixa «Criar com IA» (sobrevive a voltar da lista)
let donoIA = "";           // «cliente|conta» a quem pertencem textoIA e rascunhoIA: outro cliente ou outra pessoa nunca os vê

/** Zera o que foi digitado/montado na «Criar com IA» (troca de empresa, de pessoa, saída do módulo). */
function esquecerIA() { textoIA = ""; rascunhoIA = null; donoIA = ""; }

/** Guarda o dono do texto/rascunho; se mudou o cliente ativo ou a conta (a aba não recarrega ao trocar), descarta o que era do outro. */
function conferirDonoIA(ctx) {
  const dono = `${ctx.cliente ? ctx.cliente.id : "-"}|${ctx.sessao && ctx.sessao.conta ? (ctx.sessao.conta.id || ctx.sessao.conta.email || "?") : "-"}`;
  if (donoIA !== dono) { esquecerIA(); donoIA = dono; }
}

async function modulos(ctx, editor) {
  const v = encodeURIComponent(ctx.versao);
  if (!L) L = await import(`./auto-logica.js?v=${v}`);
  if (!PE) PE = await import(`./auto-pecas.js?v=${v}`);
  if (editor && !ED) ED = await import(`./auto-editor.js?v=${v}`);
  return { L, P: PE.pecas(ctx.ui, L), ED };
}

/**
 * Rascunhos guardados na aba (sessionStorage), por empresa + conta + automação: o que ainda não foi salvo sobrevive a recarregar a página,
 * ao Voltar, ao menu e à paleta. «nova» = a automação ainda sem id; «ia» = a montagem da IA (não gasta a cota de novo). Some ao fechar a aba.
 * Tudo em try/catch: sem storage (janela anônima cheia, bloqueio) o editor funciona igual, só sem a rede de proteção.
 */
function rascunhosDe(ctx) {
  const cli = ctx.cliente ? ctx.cliente.id : "-";
  const conta = ctx.sessao && ctx.sessao.conta ? (ctx.sessao.conta.id || ctx.sessao.conta.email || "-") : "-";
  const chave = id => L.chaveRascunho(cli, conta, id);
  return {
    ler(id) { try { return L.lerRascunho(sessionStorage.getItem(chave(id))); } catch { return null; } },
    guardar(id, auto, extra) { try { sessionStorage.setItem(chave(id), L.empacotarRascunho(auto, extra)); return true; } catch { return false; } },
    apagar(id) { try { sessionStorage.removeItem(chave(id)); } catch { /* sem storage */ } },
  };
}

/** plano 1000 · AS-019: chave do texto da caixa «Criar com IA» (mesma régua dos rascunhos: empresa + conta). */
function chaveTextoIA(ctx) {
  const cli = ctx.cliente ? ctx.cliente.id : "-";
  const conta = ctx.sessao && ctx.sessao.conta ? (ctx.sessao.conta.id || ctx.sessao.conta.email || "-") : "-";
  return L.chaveRascunho(cli, conta, "ia-texto");
}

let limpezas = [];         // o que a tela montada precisa desfazer ao sair (ex.: a altura do cabeçalho fixo no scroll-padding)
function desfazerTela() { for (const f of limpezas.splice(0)) { try { f(); } catch { /* ok */ } } }

function pararPulso() {
  if (cancelarPulso) { try { cancelarPulso(); } catch { /* ok */ } cancelarPulso = null; }
}

/* ================================================================== entrada do módulo */

export async function montar(ctx) {
  const eu = ++montagem;
  const { ui } = ctx;
  pararPulso();
  desfazerTela();
  conferirDonoIA(ctx);
  ui.carregarCss("automacoes");
  ui.limpar(ctx.alvo);
  const parte = ctx.rota.partes[0] || null;
  const raiz = ui.h("div", { class: ["au", parte ? "au-pag-editor" : "au-pag-lista"] });
  ctx.alvo.appendChild(raiz);
  // G9: a forma da tela que vem (números do topo + cartões) em vez do esqueleto genérico
  raiz.appendChild(parte ? ui.esqueleto("lista", 5) : ui.h("div", { class: "au-esq" }, ui.esqueleto("kpi", 4), ui.esqueleto("cartao"), ui.esqueleto("cartao")));
  let dados, pecas;
  try {
    const r = await Promise.all([modulos(ctx, !!parte), ctx.api.rpcC("nx_automacoes_listar")]);
    pecas = r[0];
    dados = r[1];
  } catch (e) {
    if (eu !== montagem) return;
    ui.limpar(raiz);
    raiz.appendChild(ui.erroCartao(e, () => montar(ctx)));
    return;
  }
  if (eu !== montagem) return;
  ui.limpar(raiz);
  dados.itens = dados.itens || [];
  dados.base = dados.base || {};
  const rascunhos = rascunhosDe(ctx);
  const amb = {
    L, P: pecas.P,
    rascunho: null,
    rascunhos,
    duplicar: (c, a, botao) => duplicar(c, a, dados.base, botao),
    limparRascunho: () => { rascunhoIA = null; rascunhos.apagar("ia"); },
    aoSair: f => { limpezas.push(f); },
    testarAoAbrir: false,
  };
  if (!parte) return telaLista(ctx, raiz, dados, pecas.P);
  if (parte === "nova") {
    if (!dados.pode_editar) return semEditar(ctx, raiz, dados);
    if (ctx.rota.query && ctx.rota.query.ia === "1") {
      // a memória se perde ao recarregar a página (ou ao sair do módulo): a montagem volta do que ficou guardado na aba
      if (!rascunhoIA) { const g = rascunhos.ler("ia"); if (g) rascunhoIA = { auto: g.auto, explicacao: g.explicacao, avisos: g.avisos }; }
      if (rascunhoIA) amb.rascunho = rascunhoIA;
      else ui.toast("Não encontramos mais a montagem da IA nesta aba. Descreva de novo na caixa «Criar com IA».", { tipo: "info" });
    }
    return ED.telaEditor(ctx, raiz, dados, null, amb);
  }
  const item = dados.itens.find(x => x.id === parte);
  if (!item) {
    ctx.titulo("Automação não encontrada");
    raiz.appendChild(ui.vazio({ titulo: "Não encontramos essa automação", texto: "Ela pode ter sido excluída. Volte para a lista.", icone: "raio", tema: "automacoes",
      acao: { rotulo: "Ver automações", fn: () => ctx.navegar("#/automacoes") } }));
    return;
  }
  return ED.telaEditor(ctx, raiz, dados, item, amb);
}

export function desmontar() {
  montagem++;
  pararPulso();
  desfazerTela();
  esquecerIA();   // o app só desmonta ao sair do módulo, trocar de empresa ou sair da conta
}

function semEditar(ctx, raiz, dados = null) {
  ctx.titulo("Automações");
  // plano 1000 · AS-228: diz A QUEM pedir (os administradores da empresa), não só «somente administradores»
  const pedir = L.frasePedirAdmin(dados && dados.base && dados.base.usuarios);
  raiz.appendChild(ctx.ui.vazio({ titulo: "Somente administradores criam automações", texto: `Você pode ver as automações e o histórico de execuções. ${pedir}`, icone: "cadeado",
    acao: { rotulo: "Ver automações", fn: () => ctx.navegar("#/automacoes") } }));
}

/* ================================================================== LISTA */

function telaLista(ctx, raiz, dados, P) {
  const { ui } = ctx;
  const h = ui.h;
  const vv = ctx.vocab;
  const vertical = dados.vertical || (ctx.cliente && ctx.cliente.vertical) || "generico";
  ctx.titulo("Automações");
  const itens = dados.itens;
  const lim = dados.limite || {};
  const noLimite = lim.limite != null && lim.usadas >= lim.limite;
  const podeEditar = !!dados.pode_editar;

  const usoTxt = lim.limite == null ? `${itens.length} ${itens.length === 1 ? "automação" : "automações"} · sem limite no plano`
    : `${lim.usadas} de ${lim.limite} no plano`;
  const btNova = podeEditar ? h("button", { type: "button", class: "bt bt-sec", disabled: noLimite,
    title: noLimite ? `Seu plano permite até ${lim.limite} automações.` : null,
    on: { click: () => ctx.navegar("#/automacoes/nova") } }, ui.icone("mais"), "Criar do zero") : null;
  // plano 1000 · AS-016: botão de emergência — desliga de uma vez tudo o que manda WhatsApp (com «Religar as mesmas» no aviso)
  const btPausar = podeEditar ? h("button", { type: "button", class: "bt bt-fant au-pausar", hidden: !L.ligadasQueEnviam(itens).length },
    ui.icone("parar"), "Pausar envios agora") : null;
  // plano 1000 · AS-022: desligar não libera vaga no plano — a pílula diz isso (dica no toque/foco e para o leitor de tela)
  const ajudaUso = lim.limite == null ? null : "Desligadas também contam no plano; para liberar vaga, exclua uma automação.";
  const pilulaUso = h("span", { class: ["pilula", noLimite ? "pilula-aten" : "pilula-neutra", "au-uso"], title: ajudaUso, tabindex: ajudaUso ? "0" : null }, usoTxt);
  if (ajudaUso && typeof ui.dica === "function") { try { ui.dica(pilulaUso, ajudaUso); } catch { /* o title basta */ } }

  raiz.appendChild(h("header", { class: "cab-pag au-cab" },
    h("div", null,
      h("p", { class: "rotulo" }, "Operação no automático"),
      h("h1", { class: "titulo-pag" }, "Automações"),
      // plano 1000 · AS-018: o «por onde sai» vem dos números da empresa (CodeWords, Meta, os dois ou nenhum)
      h("p", { class: "sub" }, `Quando algo acontece, o sistema confere as condições e faz o resto: move no funil, cria tarefas, avisa a equipe, etiqueta, espera um tempo e ${L.viaWhatsApp(dados.base && dados.base.canais)}.`)),
    h("div", { class: "linha au-cab-acoes" },
      pilulaUso,
      btPausar, btNova)));

  if (!podeEditar) raiz.appendChild(h("p", { class: "aviso au-aviso-papel" }, ui.icone("cadeado"),
    h("span", null, "Você pode ver as automações e o histórico. Para criar ou mudar, fale com um administrador.")));
  if (noLimite && podeEditar) raiz.appendChild(h("p", { class: "aviso aviso-aten" }, ui.icone("alerta"),
    h("span", null, `Seu plano chegou ao limite de ${lim.limite} automações. Exclua uma que não usa ou fale com o suporte para aumentar.`)));

  // ------------------------------------------------ resumo em números (item 52): ligadas, execuções, taxa de sucesso, em espera
  const faixaResumo = h("div", { class: "au-resumo", role: "group", "aria-label": "Resumo das automações" });
  const pintarResumo = () => {
    ui.limpar(faixaResumo);
    const r = L.resumoAutomacoes(itens);
    // plano 1000 · AS-014: os números dizem o período (desde a criação; últimos 30 dias quando o servidor manda os contadores do mês)
    const periodo = L.periodoDoResumo(itens) === "30d" ? "nos últimos 30 dias" : "desde a criação de cada uma";
    // ui.kpi (frente A) quer número + formato; enquanto não existe, a peça local aceita o texto pronto
    const kpi = typeof ui.kpi === "function"
      ? o => ui.kpi({ rotulo: o.rotulo, valor: o.num, formato: o.formato || "int", ajuda: o.ajuda })
      : o => P.kpi({ rotulo: o.rotulo, valor: o.texto, ajuda: o.ajuda, icone: o.icone, tom: o.tom });
    faixaResumo.append(
      kpi({ rotulo: `Ligadas de ${r.total}`, num: r.ligadas, texto: `${r.ligadas} de ${r.total}`, ajuda: "Automações que estão rodando agora.", icone: "raio", tom: r.ligadas ? "ok" : null }),
      kpi({ rotulo: "Execuções", num: r.execucoes, texto: ui.num(r.execucoes), ajuda: `Quantas vezes as automações rodaram ${periodo}, somando todas.`, icone: "relogio" }),
      kpi({ rotulo: "Deram certo", num: r.pct == null ? null : r.pct / 100, formato: "pct", texto: r.pct == null ? "—" : `${r.pct}%`,
        ajuda: r.pct == null ? "Ainda não há execuções para medir." : `${ui.num(r.execucoes - r.erros)} de ${ui.num(r.execucoes)} execuções sem erro ${periodo}.`, icone: "check", tom: r.pct == null ? null : L.nivelTaxa(r.pct) }),
      kpi({ rotulo: "Em espera", num: r.em_espera, texto: ui.num(r.em_espera), ajuda: "Pessoas no meio de uma sequência, aguardando o próximo passo.", icone: "relogio", tom: r.em_espera ? "info" : null }));
  };
  if (itens.length) { pintarResumo(); raiz.appendChild(faixaResumo); }

  // ------------------------------------------------ criar com IA
  if (podeEditar) raiz.appendChild(cartaoIA(ctx, dados, noLimite, P));

  // ------------------------------------------------ as do cliente
  const metas = new Map();
  // ligar/desligar (interruptor ou pulso) muda os números do topo e as contagens dos filtros: tudo sai de `itens`, recontado na hora
  let recontarSuas = () => {};
  let suas = null;
  let aoMudarCmds = () => {};     // re-registra os comandos «Ligar/Desligar» da paleta (definido mais abaixo)
  const aoMudarEstado = () => {
    if (itens.length) pintarResumo(); recontarSuas();
    if (btPausar) btPausar.hidden = !L.ligadasQueEnviam(itens).length;
    try { aoMudarCmds(); } catch { /* a paleta é um extra */ }
  };
  const vazioLista = () => h("div", { class: "au-vazio" }, ui.vazio({ tema: "automacoes",
    titulo: "Automações fazem o trabalho repetitivo.", texto: podeEditar ? "Descreva o que você quer na caixa acima, ou comece por uma receita pronta." : "Ainda não há automações criadas.", icone: "raio" }));
  if (itens.length) {
    suas = secaoSuas(ctx, dados, itens, metas, P, aoMudarEstado, () => {
      // plano 1000 · AS-010: a última automação saiu — a seção vira o vazio e o resumo do topo some (sem redesenhar a tela inteira)
      if (itens.length) return;
      const v = vazioLista();
      suas.el.replaceWith ? suas.el.replaceWith(v) : (suas.el.parentNode.insertBefore(v, suas.el), suas.el.remove());
      faixaResumo.remove();
      const alvo = raiz.querySelector(".au-ia-txt:not(:disabled)") || btNova;
      if (alvo && !alvo.disabled) alvo.focus({ preventScroll: true });
    });
    recontarSuas = suas.recontar;
    raiz.appendChild(suas.el);
  } else raiz.appendChild(vazioLista());

  if (btPausar) btPausar.addEventListener("click", () => pausarEnvios(ctx, itens, metas, btPausar, aoMudarEstado));

  // ------------------------------------------------ receitas prontas
  if (podeEditar) raiz.appendChild(secaoReceitas(ctx, dados, vertical, vv, noLimite, itens.length, P));

  // ------------------------------------------------ do sistema
  const sis = h("ul", { class: "au-sis", role: "list" });
  for (const r of dados.sistema || []) {
    // plano 1000 · AS-017: as regras que têm ajuste em outro lugar levam até ele
    const ajuste = L.ajusteDaRegraSistema(r.nome);
    sis.appendChild(h("li", { class: "au-sis-item" },
      h("span", { class: "au-sis-ic", "aria-hidden": "true" }, ui.icone("escudo")),
      h("div", null, h("p", { class: "au-sis-nome" }, r.nome), h("p", { class: "au-sis-desc" }, r.descricao),
        ajuste ? h("a", { class: "au-sis-link", href: ajuste.href }, ajuste.rotulo, ui.icone("seta-dir")) : null),
      h("span", { class: "pilula pilula-ok au-sis-selo" }, ui.icone("check"), "Sempre ligada")));
  }
  // plano 1000 · AS-017: no celular a seção nasce recolhida (5 regras fixas não empurram a tela); no computador, aberta
  const celular = (() => { try { return typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches; } catch { return false; } })();
  const nSis = (dados.sistema || []).length;
  raiz.appendChild(h("section", { class: "au-sec au-sec-sistema", "aria-labelledby": "au-sis" },
    h("details", { class: "au-sis-det", open: !celular },
      h("summary", { class: "au-sec-cab au-sis-sum" },
        h("h2", { class: "titulo-sec", id: "au-sis" }, "Do sistema"),
        h("span", { class: "rotulo" }, `${nSis} ${nSis === 1 ? "regra pronta" : "regras prontas"} · não dá para desligar`),
        ui.icone("seta-baixo", "au-sis-seta")),
      sis)));

  // ------------------------------------------------ contadores ao vivo (pulso, no máx. 1× a cada 20 s)
  if (itens.length && ctx.pulso && ctx.pulso.assinar) {
    let ultimo = Date.now(), pedindo = false;
    const eu = montagem;
    cancelarPulso = ctx.pulso.assinar(async () => {
      if (pedindo || Date.now() - ultimo < 20000 || eu !== montagem) return;
      pedindo = true; ultimo = Date.now();
      try {
        const novo = await ctx.api.rpcC("nx_automacoes_listar");
        if (eu !== montagem) return;
        // os da lista se repintam; os fora do filtro atual (sem cartão na tela) só atualizam o dado, que o resumo e os filtros contam
        for (const it of novo.itens || []) { const m = metas.get(it.id); if (m) m(it); else { const x = itens.find(y => y.id === it.id); if (x) Object.assign(x, it); } }
        aoMudarEstado();
      } catch { /* silencioso: o próximo pulso tenta de novo */ } finally { pedindo = false; }
    });
  }

  // ------------------------------------------------ paleta Ctrl/⌘+K (item 59): o que esta tela oferece
  // plano 1000 · AS-229: cada automação na paleta — «Ligar/desligar …» usa o mesmo interruptor do cartão (com as mesmas confirmações)
  // o comando guarda o estado pedido (c.ligar): se a automação já está assim (o rótulo ficou velho), avisa em vez de inverter
  const fazerCmdAuto = c => {
    if (c.acao === "abrir") { ctx.navegar(`#/automacoes/${c.automacao}`); return; }
    const sw = raiz.querySelector(`.au-item[data-id="${String(c.automacao).replace(/"/g, "")}"] .au-sw`);
    if (sw && !sw.disabled) {
      sw.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem() }); sw.focus({ preventScroll: true });
      const agora = typeof sw.ligado === "function" ? sw.ligado() : null;
      if (typeof c.ligar === "boolean" && agora === c.ligar) { ui.toast(`«${c.nome || "A automação"}» já está ${c.ligar ? "ligada" : "desligada"}.`, { tipo: "info" }); return; }
      sw.click();
    } else ctx.navegar(`#/automacoes/${c.automacao}`);      // fora do filtro da lista: abre a automação
  };
  // re-registrados a cada mudança de estado (aoMudarEstado): o rótulo «Ligar/Desligar» acompanha o interruptor
  const cmdsAuto = [];
  const registrarCmdsAuto = () => {
    for (const f of cmdsAuto.splice(0)) { try { f(); } catch { /* ok */ } }
    registrarComandos(ctx, L.comandosDasAutomacoes(itens, { podeEditar }).map(c => ({ ...c, fazer: () => fazerCmdAuto(c) })), cmdsAuto);
  };
  registrarCmdsAuto();
  limpezas.push(() => { for (const f of cmdsAuto.splice(0)) { try { f(); } catch { /* ok */ } } });
  aoMudarCmds = registrarCmdsAuto;
  registrarComandos(ctx, [
    podeEditar && !noLimite ? { id: "automacoes.nova", rotulo: "Criar automação do zero", palavras: "nova automacao criar regra fluxo", icone: "mais", fazer: () => ctx.navegar("#/automacoes/nova") } : null,
    podeEditar && !L.iaDesligada(dados) ? { id: "automacoes.ia", rotulo: "Criar automação com IA", palavras: "ia inteligencia artificial descrever montar", icone: "ia",
      fazer: () => { const t = raiz.querySelector(".au-ia-txt"); if (t) { t.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem() }); t.focus({ preventScroll: true }); } } } : null,
    podeEditar ? { id: "automacoes.receitas", rotulo: "Ver receitas prontas", palavras: "receitas modelos prontas exemplos", icone: "modelo",
      fazer: () => { const e = raiz.querySelector("#au-mod"); if (e) { e.scrollIntoView({ block: "start", behavior: ui.comportamentoRolagem() }); const b = raiz.querySelector(".au-modelos-busca input"); if (b) b.focus({ preventScroll: true }); } } } : null,
  ]);
}

/** Registra comandos na paleta (quando o shell oferece ctx.comandos) e desfaz ao sair da tela. Nunca derruba a tela. */
function registrarComandos(ctx, lista, guardar = limpezas) {
  const reg = ctx.comandos && typeof ctx.comandos.registrar === "function" ? ctx.comandos.registrar : null;
  if (!reg) return;
  for (const c of lista) {
    if (!c) continue;
    try { const cancelar = reg(c); if (typeof cancelar === "function") guardar.push(cancelar); } catch { /* a paleta é um extra */ }
  }
}

/* ------------------------------------------------------------------ Criar com IA */

function cartaoIA(ctx, dados, noLimite, P) {
  const { ui } = ctx;
  const h = ui.h;
  const EXEMPLOS_IA = L.exemplosIA(ctx.vocab);     // 5 pedidos do dia a dia, no vocabulário da vertical (item 55)
  const ia = dados.ia || (dados.base && dados.base.ia) || null;
  // nx_automacoes_listar → ia:{disponivel, usadas, limite}; a base de Conversas usa ia:{ligada, cota:{usadas, limite}} (aceitamos as duas)
  const desligada = L.iaDesligada(dados);
  const cota = ia && (ia.cota || (ia.limite !== undefined ? { usadas: ia.usadas, limite: ia.limite } : null));
  const semCota = !!cota && cota.limite != null && Number(cota.usadas) >= Number(cota.limite);
  const MAX = L.LIMITES.descricao_ia;
  const MIN = 12;

  const id = `au-ia-${Math.random().toString(36).slice(2, 7)}`;
  // plano 1000 · AS-019: o pedido em digitação sobrevive a F5 e à atualização automática (na aba, como os rascunhos do editor)
  if (!textoIA) { try { const g = sessionStorage.getItem(chaveTextoIA(ctx)); if (g) textoIA = String(g).slice(0, MAX); } catch { /* sem storage */ } }
  const guardarTexto = ui.debounce(() => { try { if (textoIA.trim()) sessionStorage.setItem(chaveTextoIA(ctx), textoIA); else sessionStorage.removeItem(chaveTextoIA(ctx)); } catch { /* sem storage */ } }, 400);
  const area = h("textarea", { id, class: "au-ia-txt", rows: 3, maxlength: MAX, disabled: desligada,
    placeholder: `Ex.: ${EXEMPLOS_IA[0]}`, "aria-describedby": noLimite && !desligada ? `${id}-aj ${id}-lim` : `${id}-aj` }, textoIA);
  area.value = textoIA;                // o texto guardado (memória ou aba) volta para a caixa
  const contador = h("span", { class: "au-ia-cont mono", "aria-hidden": "true" }, `${textoIA.length}/${MAX}`);
  const btCriar = h("button", { type: "button", class: "bt bt-prim bt-g au-ia-bt", disabled: true }, ui.icone("ia"), "Criar com IA");
  const estado = h("div", { class: "au-ia-estado", "aria-live": "polite" });
  // plano 1000 · AS-007: no limite de automações os exemplos também apagam (encher a caixa sem poder pedir não ajuda)
  const usar = t => { area.value = t; area.dispatchEvent(new Event("input", { bubbles: true })); area.focus(); };
  const exemplos = h("div", { class: "au-ia-ex-caixa" },
    h("p", { class: "au-ia-ex-rot", id: `${id}-ex` }, "Exemplos — toque para usar"),
    h("div", { class: "au-chips au-ia-ex", role: "group", "aria-labelledby": `${id}-ex` }, EXEMPLOS_IA.map(t => {
      const b = h("button", { type: "button", class: "au-chip au-chip-ex", disabled: desligada || semCota || noLimite, title: t }, ui.icone("ia"), h("span", null, t));
      b.addEventListener("click", () => usar(t));
      return b;
    })));
  // plano 1000 · AS-072: os últimos pedidos desta pessoa nesta empresa voltam como chips (só o texto, no aparelho)
  const chaveRecentes = `nx-au-ia-recentes:${ctx.cliente ? ctx.cliente.id : "-"}|${ctx.sessao && ctx.sessao.conta ? (ctx.sessao.conta.id || ctx.sessao.conta.email || "-") : "-"}`;
  const lerRecentes = () => { try { const v = JSON.parse(localStorage.getItem(chaveRecentes) || "[]"); return Array.isArray(v) ? v.filter(x => typeof x === "string").slice(0, 5) : []; } catch { return []; } };
  const recentesCaixa = h("div", { class: "au-ia-ex-caixa au-ia-recentes" });
  const pintarRecentes = () => {
    ui.limpar(recentesCaixa);
    const l = lerRecentes();
    recentesCaixa.hidden = !l.length || desligada;
    if (recentesCaixa.hidden) return;
    recentesCaixa.append(h("p", { class: "au-ia-ex-rot", id: `${id}-rec` }, "Pedidos recentes"),
      h("div", { class: "au-chips au-ia-ex", role: "group", "aria-labelledby": `${id}-rec` }, l.map(t => {
        const b = h("button", { type: "button", class: "au-chip au-chip-ex au-chip-rec", disabled: semCota || noLimite, title: t }, ui.icone("relogio"), h("span", null, t));
        b.addEventListener("click", () => usar(t));
        return b;
      })));
  };
  // pedido com telefone, CPF ou e-mail (AS-071) não fica guardado no aparelho
  const guardarRecente = t => { if (L.dadosPessoaisNoPedido(t).length) return; try { localStorage.setItem(chaveRecentes, JSON.stringify(L.juntarPedidoRecente(lerRecentes(), t))); } catch { /* sem storage */ } };
  pintarRecentes();
  // AS-007: a frase do limite fica logo abaixo da caixa (o botão apagado sozinho não dizia o porquê)
  const avisoLimite = noLimite && !desligada ? h("p", { class: "au-ia-limite sub", id: `${id}-lim` }, ui.icone("alerta"),
    h("span", null, `O plano chegou ao limite de ${(dados.limite || {}).limite} automações: exclua uma (desligar não libera vaga) para criar outra com a IA.`)) : null;

  // plano 1000 · AS-070: quanto da cota do mês já foi usado, ANTES de pedir (amarelo a partir de 80 %)
  const cotaInfo = desligada ? null : L.linhaCotaIA(cota);
  const linhaCota = cotaInfo ? h("p", { class: ["au-ia-cota", `au-ia-cota-${cotaInfo.tom}`], dataset: { tom: cotaInfo.tom } }, cotaInfo.texto) : null;
  const pintarBotao = () => {
    const n = area.value.trim().length;
    contador.textContent = `${area.value.length}/${MAX}`;
    // plano 1000 · AS-006: sem cota, o botão nem acende (antes a pessoa digitava, esperava e só então recebia «ia_cota»)
    btCriar.disabled = desligada || noLimite || semCota || n < MIN;
    textoIA = area.value;
    guardarTexto();
  };
  area.addEventListener("input", pintarBotao);
  area.addEventListener("keydown", ev => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey) && !btCriar.disabled) { ev.preventDefault(); btCriar.click(); } });
  pintarBotao();

  const cartao = h("section", { class: ["cartao", "au-ia", desligada && "au-ia-off"], "aria-labelledby": `${id}-t` },
    h("div", { class: "au-ia-cab" },
      h("span", { class: "au-ia-ic", "aria-hidden": "true" }, ui.icone("ia")),
      h("div", null,
        h("p", { class: "rotulo" }, "Descreva e a IA monta"),
        h("h2", { class: "titulo-sec", id: `${id}-t` }, "Criar com IA"))),
    h("p", { class: "sub" }, "Descreva o que você quer que aconteça, do jeito que falaria com alguém da equipe. A IA monta a automação, você confere, ajusta e só então salva — ela nunca liga nada sozinha."),
    h("div", { class: "campo campo-textarea au-ia-campo" },
      h("label", { for: id }, "O que você quer automatizar?"),
      area,
      // plano 1000 · AS-071: o pedido vai para a IA (Anthropic) — nada de nome, telefone ou dado de saúde de cliente
      h("small", { class: "campo-ajuda au-ia-ajuda", id: `${id}-aj` }, "Conte o gatilho (quando), o que checar e o que fazer. Use as palavras do seu dia a dia. Não cole nomes, telefones, CPF ou dados de saúde de clientes: o pedido é lido por um serviço de IA externo."),
      avisoLimite),
    recentesCaixa,
    exemplos,
    h("div", { class: "au-ia-rodape" }, contador, btCriar),
    linhaCota,
    estado);

  if (desligada) estado.appendChild(h("p", { class: "aviso aviso-aten" }, ui.icone("ia"),
    h("span", null, "A IA ainda não está ligada nesta plataforma. Avise a equipe da Nexus para ativar; enquanto isso, use as receitas prontas abaixo ou crie do zero.")));
  else if (semCota) estado.appendChild(h("p", { class: "aviso aviso-aten" }, ui.icone("alerta"),
    h("span", null, "A cota de IA deste mês acabou. As receitas prontas e o editor continuam funcionando; a cota volta no dia 1º do próximo mês (ou fale com a equipe da Nexus para ampliar).")));

  let pedindo = false;
  let pedidoAtual = 0;           // plano 1000 · AS-073: «Parar de esperar» abandona o pedido em andamento (a resposta que chegar depois é ignorada)
  btCriar.addEventListener("click", async () => {
    if (pedindo || btCriar.disabled) return;
    const descricao = area.value.trim();
    // plano 1000 · AS-071: telefone, CPF ou e-mail no pedido → pergunta antes de mandar para a IA
    const pessoais = L.dadosPessoaisNoPedido(descricao);
    if (pessoais.length) {
      pedindo = true;
      const ok = await ui.confirmar({ titulo: "Mandar dados pessoais para a IA?", rotulo: "Mandar assim mesmo",
        texto: `O pedido tem ${pessoais.map(x => `${x.tipo} («${x.trecho}»)`).join(", ")}. Ele é lido por um serviço de IA externo; para montar a automação não é preciso dado de cliente — troque por algo genérico, como «o paciente».` });
      pedindo = false;
      if (!ok) { area.focus(); return; }
    }
    pedindo = true;
    const meu = ++pedidoAtual;
    guardarRecente(descricao);
    // revisão: a montagem anterior (já paga) volta à tela se a nova chamada falhar (cota, rede) — antes ela sumia de vez
    const anteriores = [...estado.childNodes].filter(n => !(n.classList && (n.classList.contains("au-ia-erro") || n.classList.contains("au-ia-carregando"))));
    ui.limpar(estado);
    const txtCarregando = h("span", null, "A IA está montando a automação… isso leva alguns segundos.");
    // plano 1000 · AS-073: a espera pode passar de 1 minuto — dá para desistir (a caixa volta; a cota pode já ter sido usada)
    let desistir = null;
    const desistiu = new Promise((_, rej) => { desistir = () => rej(Object.assign(new Error("cancelado"), { cancelado: true })); });
    desistiu.catch(() => {});
    const controle = typeof AbortController === "function" ? new AbortController() : null;
    const btParar = h("button", { type: "button", class: "bt bt-fant bt-p au-ia-parar" }, ui.icone("fechar"), "Parar de esperar");
    btParar.addEventListener("click", () => { try { if (controle) controle.abort(); } catch { /* ok */ } desistir(); });
    estado.appendChild(h("div", { class: "au-ia-carregando", role: "status" }, h("span", { class: "au-giro", "aria-hidden": "true" }), txtCarregando, btParar));
    // pedidos grandes demoram (o navegador espera até L.PRAZO_MONTAR_IA_MS): diz que ainda está trabalhando, para não clicarem de novo
    const lento = setTimeout(() => { txtCarregando.textContent = "Ainda montando… pedidos maiores levam até 2 minutos. Não feche esta tela nem clique de novo."; }, 20_000);
    area.readOnly = true;   // só-leitura (não disabled): o campo mantém o foco do teclado durante a chamada
    try {
      // `sinal` cancela a chamada de rede quando o api.js aceitar (hoje a resposta que chegar depois só é ignorada)
      const chamada = ctx.api.fn("nx-ia", { acao: "automacao_montar", descricao }, { prazoMs: L.PRAZO_MONTAR_IA_MS, sinal: controle ? controle.signal : undefined });
      const r = await ui.carregando(btCriar, Promise.race([chamada, desistiu]));
      if (meu !== pedidoAtual) return;
      if (!r || !r.automacao || typeof r.automacao !== "object") throw Object.assign(new Error("ia_resposta_invalida"), { codigo: "ia_resposta_invalida" });
      const conv = L.deFormatoIA(r.automacao, dados.base);
      const avisos = [...(Array.isArray(r.avisos) ? r.avisos : []).map(String), ...conv.avisos].filter(Boolean).slice(0, 12);
      const montagemIA = { auto: conv.auto, explicacao: typeof r.explicacao === "string" ? r.explicacao.trim().slice(0, 1500) : "", avisos, descricao };
      ui.limpar(estado);
      estado.appendChild(resultadoIA(ctx, dados, montagemIA, () => { area.focus(); }, reenviar, P));
    } catch (e) {
      ui.limpar(estado);
      if (e && e.cancelado) {
        pedidoAtual++;      // a resposta que ainda chegar não pinta nada
        estado.appendChild(h("p", { class: "aviso au-ia-desistiu", role: "status" }, ui.icone("info"),
          h("span", null, "Paramos de esperar. Se a IA já tinha começado, este pedido pode ter usado 1 montagem da cota do mês. O texto continua na caixa.")));
        if (anteriores.length) estado.append(...anteriores);
        area.focus();
        return;
      }
      // G4 [E167]: reprovada na conferência, mas a montagem voltou (a cota já foi gasta) → abre no editor com o motivo
      const rep = L.montagemReprovada(e, dados.base);
      if (rep) { estado.appendChild(resultadoIA(ctx, dados, { ...rep, descricao }, () => { area.focus(); }, reenviar, P)); return; }
      const x = L.erroDaIA(e, ctx.api.mensagemErro(e));
      estado.appendChild(h("div", { class: ["aviso", x.tipo === "cota" || x.tipo === "chave" || x.tipo === "desligada" ? "aviso-aten" : "aviso-ruim", "au-ia-erro"], role: "alert" },
        ui.icone(x.tipo === "rede" ? "alerta" : "ia"),
        h("div", { class: "pilha-p" }, h("p", null, h("b", null, x.titulo)), h("p", null, x.texto),
          x.tipo === "cota" || x.tipo === "chave" || x.tipo === "desligada"
            ? h("div", { class: "linha" }, h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => ctx.navegar("#/automacoes/nova") } }, ui.icone("mais"), "Criar do zero"))
            : null)));
      if (anteriores.length) estado.append(...anteriores);   // a montagem de antes continua usável

    } finally {
      clearTimeout(lento);
      pedindo = false;
      area.readOnly = false;
      pintarBotao();
      pintarRecentes();
    }
  });
  /** G4: as respostas às dúvidas da IA viram um pedido novo (o texto vai para a caixa, à vista) e a IA monta de novo. */
  function reenviar(novoTexto) {
    area.value = novoTexto;
    pintarBotao();
    if (btCriar.disabled) { area.focus(); return; }
    btCriar.click();
  }
  return cartao;
}

/** A montagem da IA: explicação, avisos, a frase da automação e o botão que abre o editor. */
function resultadoIA(ctx, dados, m, tentarOutra, reenviar, P) {
  const { ui } = ctx;
  const h = ui.h;
  const frase = L.descrever(m.auto, dados.base, ctx.vocab);
  const problema = L.validar(m.auto, { base: dados.base, ligar: false });
  m.avisos = Array.isArray(m.avisos) ? m.avisos : [];
  const abrir = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("seta-dir"), "Conferir e ajustar no editor");
  abrir.addEventListener("click", () => {
    rascunhoIA = m;
    rascunhosDe(ctx).guardar("ia", m.auto, { explicacao: m.explicacao, avisos: m.avisos });   // recarregar a página não gasta a cota de IA de novo
    ctx.navegar("#/automacoes/nova?ia=1");
  });
  const outra = h("button", { type: "button", class: "bt bt-fant" }, "Pedir de outro jeito");
  outra.addEventListener("click", tentarOutra);
  return h("div", { class: "au-ia-res", role: "status" },
    h("p", { class: "rotulo" }, m.reprovada ? "A IA montou, mas falta completar" : "A IA montou"),
    h("p", { class: "au-ia-res-nome" }, m.auto.nome || "Automação sem nome"),
    h("p", { class: "au-ia-res-frase" }, frase),
    m.explicacao ? h("p", { class: "au-ia-res-exp" }, m.explicacao) : null,
    m.reprovada ? h("p", { class: "aviso aviso-ruim au-ia-reprovada" }, ui.icone("alerta"),
      h("span", null, `A conferência reprovou: ${m.reprovada.motivo}. A montagem não se perdeu — abra no editor e complete o que falta.`)) : null,
    m.avisos.length ? perguntasIA(ctx, dados, m, reenviar, P) : null,
    !m.reprovada && !problema.ok ? h("p", { class: "aviso aviso-aten" }, ui.icone("info"), h("span", null, `Falta completar no editor: ${problema.motivo}.`)) : null,
    h("div", { class: "linha au-ia-res-acoes" }, abrir, outra),
    h("p", { class: "sub" }, "Nada foi salvo ainda. No editor você confere cada passo e decide se liga."));
}

/**
 * G4 [E179]: as dúvidas da IA (avisos) como perguntas respondíveis — chips com o que existe no sistema (etapas, pessoas, etiquetas,
 * números) ou «Sim / Não», e um campo livre. «Montar de novo com as respostas» junta tudo ao pedido e chama a IA outra vez.
 */
function perguntasIA(ctx, dados, m, reenviar, P) {
  const { ui } = ctx;
  const h = ui.h;
  const perguntas = L.perguntasDosAvisos(m.avisos, dados.base);
  const respostas = {};
  const bt = h("button", { type: "button", class: "bt bt-sec au-ia-perg-bt", disabled: true }, ui.icone("ia"), "Montar de novo com as respostas");
  const nota = h("p", { class: "sub au-ia-perg-nota", "aria-live": "polite" });
  const atualizar = () => {
    const n = perguntas.filter(p => String(respostas[p.id] || "").trim()).length;
    bt.disabled = !n || typeof reenviar !== "function" || !m.descricao;
    nota.textContent = n ? `${n} ${n === 1 ? "resposta" : "respostas"} para mandar à IA (usa mais uma montagem da cota).` : "";
  };
  const lista = h("ol", { class: "au-ia-perg", role: "list" }, perguntas.map(p => {
    const idCampo = `au-ia-resp-${p.id}-${Math.random().toString(36).slice(2, 6)}`;
    const campo = h("input", { id: idCampo, type: "text", class: "au-ia-resp", maxlength: 200, autocomplete: "off", placeholder: "Sua resposta (opcional)" });
    const chips = h("div", { class: "au-chips au-ia-perg-chips", role: "group", "aria-label": `Respostas rápidas: ${p.pergunta}` }, p.opcoes.map(op => {
      const c = P ? P.chip({ rotulo: op, ligado: false, aoClicar: b => {
        const ligar = b.getAttribute("aria-pressed") !== "true";
        chips.querySelectorAll(".au-chip").forEach(x => x.setAttribute("aria-pressed", String(x === b && ligar)));
        campo.value = ligar ? op : "";
        respostas[p.id] = campo.value;
        atualizar();
      } }) : h("button", { type: "button", class: "au-chip" }, op);
      return c;
    }));
    campo.addEventListener("input", () => {
      respostas[p.id] = campo.value;
      chips.querySelectorAll(".au-chip").forEach(x => x.setAttribute("aria-pressed", String(x.textContent === campo.value)));
      atualizar();
    });
    return h("li", { class: "au-ia-perg-item", dataset: { pergunta: p.id } },
      h("label", { class: "au-ia-perg-txt", for: idCampo }, ui.icone("alerta"), h("span", null, p.pergunta)),
      chips, campo);
  }));
  bt.addEventListener("click", () => {
    if (bt.disabled) return;
    const r = L.descricaoComRespostas(m.descricao, perguntas, respostas);
    if (r.cortado) ui.toast(`Nem todas as respostas couberam no limite de ${L.LIMITES.descricao_ia} caracteres do pedido; mandamos as primeiras.`, { tipo: "info" });
    reenviar(r.texto);
  });
  atualizar();
  return h("div", { class: "au-ia-perg-caixa" },
    h("p", { class: "rotulo" }, perguntas.length === 1 ? "Um ponto para conferir" : "Pontos para conferir"),
    h("p", { class: "sub" }, "Responda o que quiser (é opcional) e a IA monta de novo com isso — ou ajuste direto no editor."),
    lista, h("div", { class: "linha au-ia-perg-rod" }, bt), nota);
}

/* ------------------------------------------------------------------ Suas automações */

/** plano 1000 · AS-004: quanto tempo o cartão que saiu do filtro fica à vista («saindo») antes de sumir. */
export const SAIDA_FILTRO_MS = 1500;
const duplicando = new Set();      // plano 1000 · AS-005: trava por automação — dois toques em «Duplicar» criam UMA cópia

/**
 * «Suas automações»: filtros com contagem + lista. Devolve {el, recontar}; recontar() refaz as contagens depois de ligar/desligar.
 * aoEsvaziar(): a última automação foi excluída de vez (a tela troca a seção pelo vazio).
 */
function secaoSuas(ctx, dados, itens, metas, P, aoMudarEstado, aoEsvaziar = () => {}) {
  const { ui } = ctx;
  const h = ui.h;
  let filtro = "todas";
  const lista = h("ul", { class: "au-lista", role: "list" });
  const vazio = h("div", { class: "au-lista-vazio", hidden: true });
  const filtros = [["todas", "Todas", () => true], ["ligadas", "Ligadas", x => !!x.ativo], ["desligadas", "Desligadas", x => !x.ativo],
    ["erros", "Com erro", x => Number(x.erros) > 0]];
  const fnFiltro = () => filtros.find(x => x[0] === filtro)[2];
  const barra = h("div", { class: "au-chips au-lista-filtro", role: "radiogroup", "aria-label": "Mostrar automações" });
  const pintarVazio = () => {
    const n = lista.querySelectorAll(".au-item").length;
    vazio.hidden = n > 0;
    ui.limpar(vazio);
    if (!n) vazio.appendChild(h("p", { class: "sub" }, termo.trim() ? `Nenhuma automação com «${termo.trim()}» no nome.` : "Nenhuma automação nesta situação."));
  };
  const ops = {
    /** AS-004: ligou/desligou e o item não casa mais com o filtro → o cartão sai (depois de um instante) e o foco vai ao próximo interruptor. */
    aoMudarItem(it, li) {
      if (fnFiltro()(it)) return;
      li.classList.add("au-saindo");
      setTimeout(() => {
        if (!li.isConnected || fnFiltro()(it)) { li.classList.remove("au-saindo"); return; }
        const tinhaFoco = li.contains(document.activeElement);
        const prox = li.nextSibling || li.parentNode && [...li.parentNode.childNodes].reverse().find(x => x !== li && x.nodeType === 1);
        li.remove(); metas.delete(it.id);
        pintarVazio();
        if (tinhaFoco) { const alvo = prox && prox.querySelector && prox.querySelector(".au-sw"); if (alvo) alvo.focus({ preventScroll: true }); }
      }, SAIDA_FILTRO_MS);
    },
    /** AS-010 + AS-011: o cartão some na hora com «Desfazer»; só quando o aviso fecha a exclusão vale no servidor. */
    excluirItem(it, li, foco) { return excluir(ctx, it, li, { itens, metas, aoMudarEstado, pintarVazio, aoEsvaziar, foco }); },
  };
  // plano 1000 · AS-015: com muitas automações, busca por nome (sem acento) e ordem lembrada por pessoa neste aparelho
  const chaveOrdem = `nx-au-ordem:${ctx.cliente ? ctx.cliente.id : "-"}|${ctx.sessao && ctx.sessao.conta ? (ctx.sessao.conta.id || "-") : "-"}`;
  let termo = "";
  let ordem = "criacao";
  try { const o = localStorage.getItem(chaveOrdem); if (L.ORDENS_AUTOMACAO.some(([k]) => k === o)) ordem = o; } catch { /* sem storage */ }
  const comFerramentas = itens.length >= 6;
  const campoBusca = h("input", { type: "search", class: "au-lista-busca-inp", placeholder: "Buscar automação pelo nome", "aria-label": "Buscar automação pelo nome", autocomplete: "off" });
  const selOrdem = h("select", { class: "sel au-lista-ordem", "aria-label": "Ordenar automações" },
    L.ORDENS_AUTOMACAO.map(([k, rot]) => h("option", { value: k, selected: k === ordem }, rot)));
  selOrdem.value = ordem;
  const ferramentas = comFerramentas ? h("div", { class: "au-lista-ferramentas" },
    h("label", { class: "busca au-lista-busca" }, ui.icone("busca"), campoBusca), selOrdem) : null;
  const desenhar = () => {
    ui.limpar(lista);
    const vis = L.listaAutomacoes(itens.filter(fnFiltro()), { termo, ordem });
    metas.clear();
    vis.forEach((it, i) => lista.appendChild(itemLista(ctx, dados, it, metas, P, i, aoMudarEstado, ops)));
    // só os da tela entram em `metas`; o pulso atualiza o dado dos outros direto em `itens` (o resumo do topo conta todos)
    pintarVazio();
  };
  const chips = [];
  const escolher = (k, b) => { filtro = k; barra.querySelectorAll(".au-chip").forEach(c => c.setAttribute("aria-checked", String(c === b))); desenhar(); };
  for (const [k, rot, fn] of filtros) {
    // plano 1000 · AS-003: o chip «Com erro» existe sempre (escondido sem erro): o pulso que traz um erro novo faz ele aparecer
    const b = P.chip({ rotulo: `${rot} · ${itens.filter(fn).length}`, ligado: k === filtro, modo: "radio", aoClicar: () => escolher(k, b) });
    b.setAttribute("aria-label", rotuloChipLista(rot, itens.filter(fn).length));
    chips.push([b, rot, fn, k]);
    barra.appendChild(b);
  }
  P.setas(barra);
  desenhar();
  const contaCab = h("span", { class: "rotulo" });
  const recontar = () => {
    const ligadas = itens.filter(x => x.ativo).length;
    contaCab.textContent = `${ligadas} ${ligadas === 1 ? "ligada" : "ligadas"} de ${itens.length}`;
    for (const [b, rot, fn, k] of chips) {
      const n = itens.filter(fn).length;
      b.textContent = `${rot} · ${n}`;
      b.setAttribute("aria-label", rotuloChipLista(rot, n));
      if (k === "erros") {
        b.hidden = !n;
        if (!n && filtro === "erros") escolher("todas", chips[0][0]);   // o filtro ativo ficou vazio: volta para «Todas»
      }
    }
    barra.hidden = itens.length <= 3 && !itens.some(x => Number(x.erros) > 0);
  };
  recontar();
  campoBusca.addEventListener("input", ui.debounce(() => { termo = campoBusca.value; desenhar(); }, 150));
  selOrdem.addEventListener("change", () => {
    ordem = selOrdem.value;
    try { localStorage.setItem(chaveOrdem, ordem); } catch { /* sem storage: vale só nesta tela */ }
    desenhar();
  });
  const el = h("section", { class: "au-sec", "aria-labelledby": "au-suas" },
    h("div", { class: "au-sec-cab" },
      h("h2", { class: "titulo-sec", id: "au-suas" }, "Suas automações"),
      contaCab),
    ferramentas, barra, lista, vazio);
  return { el, recontar };
}

/** plano 1000 · AS-226: «Com erro, 2 automações» para o leitor de tela (o «·» do chip era lido de um jeito estranho). */
const rotuloChipLista = (rot, n) => `${rot}, ${n} ${n === 1 ? "automação" : "automações"}`;

function itemLista(ctx, dados, it, metas, P, posicao = 0, aoMudarEstado = () => {}, ops = null) {
  const { ui } = ctx;
  const h = ui.h;
  const vv = ctx.vocab;
  const podeEditar = !!dados.pode_editar;
  const lim = dados.limite || {};
  const noLimite = lim.limite != null && lim.usadas >= lim.limite;
  const g = L.GATILHO[it.gatilho];
  const frase = L.descrever(it, dados.base, vv);
  const exec = h("span", { class: "au-item-num" });
  const errs = h("span", { class: "au-item-num au-com-erro" });
  const ultima = h("span", { class: "au-item-ult" });
  const espera = h("span", { class: "au-item-num au-item-espera" });
  const taxa = h("span", { class: "au-item-taxa" });
  const estadoTxt = h("span", { class: "au-item-estado" });
  const ponto = h("span", { class: "au-item-ponto" });
  const li = h("li", { class: ["au-item", !it.ativo && "au-desligada"], style: { "--i": String(posicao) }, dataset: { id: String(it.id) } });
  const pintar = x => {
    const t = L.taxaSucesso(x);
    exec.textContent = t.total === 1 ? "1 execução" : `${ui.num(t.total)} execuções`;
    errs.textContent = t.erros === 1 ? "1 erro" : `${t.erros} erros`;
    errs.hidden = !t.erros;
    const w = Number(x.em_espera) || 0;
    espera.textContent = w === 1 ? "1 em espera" : `${w} em espera`;
    espera.hidden = !w;
    ultima.textContent = x.ultima_execucao_em ? `última ${ui.relativo(x.ultima_execucao_em)}` : "ainda não rodou";
    ultima.title = x.ultima_execucao_em ? ui.dataHoraBR(x.ultima_execucao_em) : "";
    ui.limpar(taxa); taxa.appendChild(P.barraTaxa({ pct: t.pct, total: t.total }));
    estadoTxt.textContent = x.ativo ? "Ligada" : "Desligada";
    ui.limpar(ponto); ponto.appendChild(P.pontoEstado(!!x.ativo, { erro: t.erros > 0 }));
  };
  pintar(it);
  const sw = P.interruptor({
    ligado: it.ativo, rotulo: it.nome, desabilitado: !podeEditar,      // plano 1000 · AS-281: «Lembrete, alternador, ligado» (antes «Ligar a automação…» soava como ordem)
    aoMudar: async (v, b) => {
      // ligar algo que manda mensagem ao cliente merece uma confirmação (item 52): a partir dali sai WhatsApp de verdade
      if (v && L.enviaMensagem(it)) {
        const ok = await ui.confirmar({ titulo: `Ligar «${it.nome}»?`, rotulo: "Ligar",
          texto: "Esta automação envia mensagens de WhatsApp para clientes. Assim que ligar, quem se encaixar no gatilho começa a receber. Dá para desligar a qualquer momento." });
        if (!ok) { b.definir(false); b.focus({ preventScroll: true }); return; }
      }
      // plano 1000 · AS-277: desligar cancela as esperas em andamento (gatilho nx_tg_auto_desligada) — quem está no meio perde os próximos passos
      const avisoEspera = !v ? L.avisoDesligarEspera(it) : null;
      if (avisoEspera) {
        const ok = await ui.confirmar({ titulo: `Desligar «${it.nome}»?`, rotulo: "Desligar", perigo: true,
          texto: `${avisoEspera} As esperas desta automação são canceladas ao desligar.` });
        if (!ok) { b.definir(true); b.focus({ preventScroll: true }); return; }
      }
      const devolverFoco = ui.manterFoco(b);
      b.disabled = true;
      let deuCerto = false;
      try {
        const novo = await ctx.api.rpcC("nx_automacao_ativar", { p_id: it.id, p_ativo: v });
        // o servidor devolve o item atualizado (nx_auto_item); sem «ativo» na resposta, vale o que foi pedido e aceito
        if (novo && typeof novo === "object") Object.assign(it, novo);
        if (!novo || typeof novo.ativo !== "boolean") it.ativo = v;
        if (!v && avisoEspera && !(novo && "em_espera" in novo)) it.em_espera = 0;   // as esperas foram canceladas junto
        li.classList.toggle("au-desligada", !it.ativo);
        pintar(it);
        deuCerto = true;
        ui.toast(v ? `«${it.nome}» ligada.` : `«${it.nome}» desligada.`, { tipo: "ok" });
        // G9: ligou de verdade (o servidor aceitou) → o ✓ de sucesso no lugar do interruptor; desligar não comemora
        if (v && it.ativo && typeof ui.checkSucesso === "function") { try { ui.checkSucesso(caixaSw); } catch { /* sem o ✓, o toast basta */ } }
      } catch (e) {
        b.definir(!v);
        ui.toast(L.erroAutomacao(e, ctx.api.mensagemErro(e)), { tipo: "erro" });
      } finally {
        b.disabled = !podeEditar; devolverFoco();   // desabilitado o botão perde o foco: o 2º Space precisa achá-lo de novo
        aoMudarEstado();                            // «Ligadas de N», os chips e o cabeçalho da seção acompanham o cartão (no erro, voltam junto)
        if (deuCerto && ops) ops.aoMudarItem(it, li);
      }
    },
  });
  const caixaSw = h("div", { class: "au-item-sw" }, sw);
  metas.set(it.id, x => { Object.assign(it, x); pintar(it); sw.definir(it.ativo); li.classList.toggle("au-desligada", !it.ativo); });

  const btMais = h("button", { type: "button", class: "bt-icone au-item-mais", "aria-label": `Opções de ${it.nome}`, "aria-haspopup": "menu" }, ui.icone("opcoes"));
  btMais.addEventListener("click", () => ui.menu(btMais, [
    { rotulo: podeEditar ? "Editar" : "Ver", icone: "editar", fn: () => ctx.navegar(`#/automacoes/${it.id}`) },
    podeEditar ? { rotulo: "Testar (sem enviar nada)", icone: "olho", fn: () => ctx.navegar(`#/automacoes/${it.id}?testar=1`) } : null,
    { rotulo: "Ver execuções", icone: "relogio", fn: () => ctx.navegar(`#/automacoes/${it.id}?aba=execucoes`) },
    // AS-005: no limite do plano a cópia seria recusada pelo servidor — o item já aparece desabilitado com o motivo
    podeEditar ? { rotulo: noLimite ? `Duplicar (o plano permite até ${lim.limite})` : "Duplicar", icone: "copiar", desabilitado: noLimite || duplicando.has(it.id),
      fn: () => duplicar(ctx, it, dados.base) } : null,
    podeEditar ? { rotulo: "Excluir", icone: "lixeira", perigo: true, fn: () => (ops ? ops.excluirItem(it, li, btMais) : excluir(ctx, it, li, {})) } : null,
  ].filter(Boolean)));

  const etiquetas = [];
  if (L.temSequencia(it)) etiquetas.push(ui.pilula("Sequência", "info", { icone: "relogio" }));
  if (L.temIA(it)) etiquetas.push(ui.pilula("Usa IA", "prim", { icone: "ia" }));
  // plano 1000 · AS-020: etiqueta de TIPO não é verde (verde é estado bom: «Ligada», «Deu certo»)
  if (L.enviaMensagem(it)) etiquetas.push(ui.pilula("WhatsApp", "neutra", { icone: "whatsapp", class: "au-pil-tipo" }));

  // plano 1000 · AS-012: o link é só o NOME (o ::after cobre o cartão para o clique); a frase, os números e a barra de taxa ficam fora
  // do <a> — o leitor de tela lê o nome como link e a frase como descrição, e o meter não fica aninhado num link
  const idFrase = `au-item-fr-${String(it.id).replace(/[^\w-]/g, "")}-${posicao}`;
  li.append(
    caixaSw,
    h("div", { class: "au-item-corpo" },
      h("span", { class: "au-item-topo" }, ponto,
        h("a", { class: "au-item-nome au-item-link", href: `#/automacoes/${it.id}`, "aria-describedby": idFrase }, it.nome), estadoTxt),
      h("span", { class: "au-item-frase", id: idFrase }, frase),
      h("span", { class: "au-item-meta" },
        h("span", { class: "pilula pilula-neutra au-item-gat" }, ui.icone(g ? g.icone : "raio"), L.rotuloGatilho(it.gatilho, vv)),
        etiquetas, exec, errs, espera, ultima),
      h("span", { class: "au-item-rodape" }, taxa)),
    btMais);
  return li;
}

/** Cria uma cópia DESLIGADA (de uma salva ou do que está aberto no editor). `botao` (do editor) mostra o carregando. */
async function duplicar(ctx, origem, base, botao = null) {
  const chave = origem.id || "editor";
  if (duplicando.has(chave)) return;                // AS-005: o 2º toque enquanto o 1º ainda grava não cria outra cópia
  const a = L.limpar(origem);
  delete a.id;
  a.nome = `${origem.nome || "Automação"} (cópia)`.slice(0, 80);
  a.ativo = false;
  const r = L.validar(a, { base, ligar: false });
  if (!r.ok) { ctx.ui.toast(`Complete a automação antes de duplicar: falta ${r.motivo}.`, { tipo: "info" }); return; }
  duplicando.add(chave);
  try {
    const p = ctx.api.rpcC("nx_automacao_salvar", { p_auto: a });
    const novo = await (botao && typeof ctx.ui.carregando === "function" ? ctx.ui.carregando(botao, p) : p);
    ctx.ui.toast("Cópia criada (desligada). Revise e ligue quando quiser.", { tipo: "ok" });
    ctx.navegar(`#/automacoes/${novo.id}`);
  } catch (e) { ctx.ui.toast(L.erroAutomacao(e, ctx.api.mensagemErro(e)), { tipo: "erro" }); } finally { duplicando.delete(chave); }
}

/**
 * Excluir com «Desfazer» (AS-011): o cartão some na hora (sem redesenhar a tela — AS-010), o aviso fica 7 s e só quando ele fecha
 * a exclusão vai ao servidor (firmar). Desfazer devolve o cartão no mesmo lugar sem chamada nenhuma.
 */
async function excluir(ctx, it, li, { itens = null, metas = null, aoMudarEstado = () => {}, pintarVazio = () => {}, aoEsvaziar = () => {}, foco = null } = {}) {
  const { ui } = ctx;
  const pai = li && li.parentNode;
  let posLista = -1, posItens = -1, depoisDe = null;
  const r = await ui.acaoComDesfazer({
    texto: `«${it.nome}» excluída. O histórico de execuções dela é apagado quando este aviso fechar.`,
    aplicar: () => {
      if (pai) {
        const irmaos = [...pai.childNodes];
        posLista = irmaos.indexOf(li);
        depoisDe = irmaos[posLista + 1] || null;
        const tinhaFoco = li.contains(document.activeElement) || document.activeElement === foco || !document.activeElement || document.activeElement === document.body;
        const prox = depoisDe || irmaos[posLista - 1] || null;
        li.remove();
        if (metas) metas.delete(it.id);
        pintarVazio();
        if (tinhaFoco) {
          const alvo = prox && prox.querySelector ? prox.querySelector(".au-item-link") : null;
          if (alvo) alvo.focus({ preventScroll: true });
        }
      }
      if (itens) { posItens = itens.indexOf(it); if (posItens >= 0) itens.splice(posItens, 1); }
      aoMudarEstado();
    },
    reverter: () => {
      if (itens && posItens >= 0 && !itens.includes(it)) itens.splice(Math.min(posItens, itens.length), 0, it);
      if (pai && pai.isConnected !== false) {
        pai.insertBefore(li, depoisDe && depoisDe.parentNode === pai ? depoisDe : null);
        const lnk = li.querySelector(".au-item-link");
        if (lnk) lnk.focus({ preventScroll: true });
      }
      pintarVazio();
      aoMudarEstado();
    },
    // a página saindo antes dos 7 s do «Desfazer»: o pedido vai com keepalive (senão o navegador o cancela e a automação «volta»)
    firmar: o => ctx.api.rpcC("nx_automacao_excluir", { p_id: it.id }, o && o.saindo ? { keepalive: true } : {}),
  });
  if (r && r.estado === "mantida") { if (itens && !itens.length) aoEsvaziar(); return true; }
  if (r && r.estado === "falhou" && r.erro) ui.toast(L.erroAutomacao(r.erro, ctx.api.mensagemErro(r.erro)), { tipo: "erro" });
  return false;
}

/**
 * plano 1000 · AS-016: «Pausar envios agora» — desliga, em série, as automações ligadas que mandam WhatsApp (uma confirmação só);
 * o aviso oferece «Religar as mesmas». Cada uma que falhar continua ligada e é dita no fim.
 */
async function pausarEnvios(ctx, itens, metas, botao, aoMudarEstado) {
  const { ui } = ctx;
  const alvo = L.ligadasQueEnviam(itens);
  if (!alvo.length) return;
  const nomes = alvo.slice(0, 5).map(x => `«${x.nome}»`).join(", ") + (alvo.length > 5 ? ` e mais ${alvo.length - 5}` : "");
  const ok = await ui.confirmar({ titulo: alvo.length === 1 ? "Pausar a automação que envia WhatsApp?" : `Pausar as ${alvo.length} automações que enviam WhatsApp?`,
    rotulo: "Pausar agora", perigo: true,
    texto: `Desliga ${nomes}. Nada mais sai por elas até religar; quem estava no meio de uma sequência não recebe os próximos passos.` });
  if (!ok) return;
  const mudar = async (lista, v) => {
    const feitas = [], falhas = [];
    for (const it of lista) {
      try {
        const novo = await ctx.api.rpcC("nx_automacao_ativar", { p_id: it.id, p_ativo: v });
        const m = metas.get(it.id);
        const dado = novo && typeof novo === "object" && typeof novo.ativo === "boolean" ? novo : { ativo: v };
        if (m) m(dado); else Object.assign(it, dado);
        feitas.push(it);
      } catch { falhas.push(it); }
    }
    aoMudarEstado();
    return { feitas, falhas };
  };
  const r = await ui.carregando(botao, mudar(alvo, false));
  if (r.falhas.length) ui.toast(`Não consegui desligar ${r.falhas.map(x => `«${x.nome}»`).join(", ")}. Tente de novo ou desligue pelo interruptor.`, { tipo: "erro" });
  if (!r.feitas.length) return;
  const pausadas = r.feitas;
  ui.toast(pausadas.length === 1 ? "1 automação pausada." : `${pausadas.length} automações pausadas.`, { tipo: "ok", ms: 10000,
    acao: { rotulo: "Religar as mesmas", fn: async () => {
      const v = await mudar(pausadas, true);
      ui.toast(v.falhas.length ? `Religadas ${v.feitas.length}; ${v.falhas.length} não voltaram (confira o interruptor).` : "Religadas.", { tipo: v.falhas.length ? "erro" : "ok" });
    } } });
}

/* ------------------------------------------------------------------ Receitas prontas */

function secaoReceitas(ctx, dados, vertical, vv, noLimite, qtdItens, P) {
  const { ui } = ctx;
  const h = ui.h;
  const grade = h("div", { class: "au-modelos" });
  const temModeloAprovado = (dados.base.templates || []).some(t => String(t.status || "").toUpperCase() === "APPROVED");
  const exemplo = L.exemploVariaveis({ empresa: ctx.cliente ? ctx.cliente.nome : "", atendente: ctx.sessao && ctx.sessao.conta ? ctx.sessao.conta.nome : "Ana" });
  const todas = L.modelosDaVertical(vertical);
  const iaOff = L.iaDesligada(dados);
  let categoria = "todas";
  let termo = "";
  const lim = dados.limite || {};
  const motivoLimite = `Seu plano permite até ${lim.limite} automações (desligadas também contam). Exclua uma para usar outra receita.`;
  const iaInfo = dados.ia || (dados.base && dados.base.ia) || null;
  const cotaIA = iaInfo && (iaInfo.cota || (iaInfo.limite !== undefined ? { usadas: iaInfo.usadas, limite: iaInfo.limite } : null));
  const cotaTxt = cotaIA && cotaIA.limite != null ? `${ui.num(Number(cotaIA.usadas) || 0)} de ${ui.num(cotaIA.limite)} já usadas` : "";

  const cartao = (m, primeiro) => {
    const selo = L.seloModelo(m, vertical);
    const acTpl = m.auto.acoes.find(a => a.tipo === "enviar_template");
    const acMsg = m.auto.acoes.find(a => a.tipo === "enviar_mensagem");
    const canal = L.canalDaReceita(m);
    // «o que faz», em uma frase, já com as etapas e etiquetas desta empresa (item 55)
    let fraz = "";
    try { fraz = L.descrever(L.aplicarModelo(m, dados.base, vv), dados.base, vv); } catch { fraz = ""; }
    // no cartão em destaque que manda mensagem: como o cliente vai receber (texto com um exemplo)
    const bolhaTxt = () => (acTpl ? L.previaModelo(L.textoModeloLembrete(vertical), acTpl.parametros, exemplo)
      : L.aplicarVariaveis(L.aplicarModelo(m, dados.base, vv).acoes.find(a => a.tipo === "enviar_mensagem").texto, exemplo));
    const emDestaque = primeiro && selo && (acTpl || acMsg);
    const previaId = `au-mod-prev-${m.id}`;
    const previa = acTpl || acMsg ? h("figure", { class: "au-modelo-previa", id: previaId, hidden: !emDestaque },
      h("figcaption", { class: "rotulo" }, "Como chega no WhatsApp"),
      h("div", { class: "au-bolha" }, bolhaTxt())) : null;
    // plano 1000 · AS-075: as outras receitas que mandam mensagem também mostram a bolha, a pedido («Ver mensagem»)
    const btVer = previa && !emDestaque ? h("button", { type: "button", class: "bt bt-fant bt-p au-modelo-ver", "aria-expanded": "false", "aria-controls": previaId },
      ui.icone("olho"), h("span", null, "Ver mensagem")) : null;
    if (btVer) btVer.addEventListener("click", () => {
      const abrir = previa.hidden;
      previa.hidden = !abrir;
      btVer.setAttribute("aria-expanded", String(abrir));
      btVer.lastChild.textContent = abrir ? "Esconder mensagem" : "Ver mensagem";
    });
    const tempo = L.ehSequencia(m) ? miniTempo(ui, m) : null;
    return h("article", { class: ["au-modelo", selo && "au-modelo-destaque", `au-modelo-${m.categoria}`], dataset: { categoria: m.categoria } },
      h("div", { class: "au-modelo-topo" },
        h("span", { class: "au-modelo-ic", "aria-hidden": "true" }, ui.icone(m.icone)),
        h("div", { class: "au-modelo-selos" },
          selo ? h("span", { class: "pilula pilula-prim" }, selo) : null,
          canal === "codewords" ? h("span", { class: "pilula pilula-neutra au-pil-tipo", title: "As mensagens saem pelo CodeWords (WhatsApp conectado por aparelho). Receita pronta e testada." }, ui.icone("whatsapp"), "sai pelo CodeWords") : null,
          canal === "meta" ? h("span", { class: "pilula pilula-info", title: "Usa um modelo aprovado pela Meta (WhatsApp oficial)." }, ui.icone("whatsapp"), "modelo oficial da Meta") : null,
          L.usaIA(m) ? h("span", { class: "pilula pilula-prim", title: "Usa uma sugestão da cota de IA do mês a cada execução." }, ui.icone("ia"), "usa IA") : null)),
      h("h3", null, L.tituloModelo(m, vv)),
      h("p", { class: "sub" }, L.textoModelo(m, vv)),
      fraz ? h("p", { class: "au-modelo-frase" }, ui.icone("raio"), h("span", null, fraz)) : null,
      tempo,
      previa,
      acTpl && !temModeloAprovado ? h("p", { class: "au-modelo-nota" }, ui.icone("info"), "Precisa de um modelo aprovado na Meta; dá para deixar pronta e ligar depois.") : null,
      m.aviso && !acTpl ? h("p", { class: "au-modelo-nota" }, ui.icone("info"), m.aviso) : null,
      iaOff && L.usaIA(m) ? h("p", { class: "au-modelo-nota au-modelo-nota-ia" }, ui.icone("ia"), "A IA ainda não está ligada nesta plataforma: dá para deixar pronta, mas o passo de IA só funciona depois que a equipe da Nexus ativar.") : null,
      // plano 1000 · AS-076: cada execução de uma receita com IA gasta 1 da cota do mês (200 contatos/mês = 200 da cota)
      !iaOff && L.usaIA(m) ? h("p", { class: "au-modelo-nota au-modelo-custo" }, ui.icone("ia"),
        `Cada vez que roda, usa 1 da cota de IA do mês${cotaTxt ? ` (${cotaTxt})` : ""}.`) : null,
      h("div", { class: "au-modelo-rod" },
        btVer,
        // plano 1000 · AS-013: no limite, o botão apagado diz o porquê
        h("button", { type: "button", class: ["bt", selo ? "bt-prim" : "bt-sec", "bt-p"], disabled: noLimite,
          title: noLimite ? motivoLimite : null, "aria-describedby": noLimite ? "au-mod-limite" : null,
          on: { click: () => ctx.navegar(`#/automacoes/nova?modelo=${encodeURIComponent(m.id)}`) } }, "Usar receita")));
  };

  const vazioBusca = h("div", { class: "au-modelos-vazio", hidden: true });
  const statusBusca = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });
  const desenhar = () => {
    ui.limpar(grade);
    const vis = L.filtrarModelos(todas.filter(m => categoria === "todas" || m.categoria === categoria), termo, vv);
    vis.forEach((m, i) => grade.appendChild(cartao(m, i === 0 && categoria === "todas" && !termo)));
    grade.classList.toggle("au-modelos-filtrada", categoria !== "todas" || !!termo);
    vazioBusca.hidden = vis.length > 0;
    ui.limpar(vazioBusca);
    if (!vis.length) vazioBusca.appendChild(ui.vazio({ tipo: "sem_resultado", tema: "busca", titulo: "Nenhuma receita com essas palavras.", texto: "Tente «mensagem», «tarefa», «IA» ou «orçamento».",
      acao: { rotulo: "Limpar busca", fn: () => { campoBusca.value = ""; termo = ""; desenhar(); campoBusca.focus(); } } }));
    statusBusca.textContent = termo ? `${vis.length} ${vis.length === 1 ? "receita encontrada" : "receitas encontradas"}.` : "";
  };
  // busca nas receitas (item 55): título, texto, tipo de passo e gatilho, sem acento
  const campoBusca = h("input", { type: "search", placeholder: "Buscar receita: mensagem, tarefa, orçamento…", "aria-label": "Buscar receita", autocomplete: "off" });
  campoBusca.addEventListener("input", ui.debounce(() => { termo = campoBusca.value; desenhar(); }, 150));
  const busca = h("label", { class: "busca au-modelos-busca" }, ui.icone("busca"), campoBusca);
  const barra = h("div", { class: "au-chips au-modelos-filtro", role: "radiogroup", "aria-label": "Tipo de receita" });
  for (const [k, rot] of L.CATEGORIAS_MODELO) {
    const n = todas.filter(m => k === "todas" || m.categoria === k).length;
    if (!n) continue;
    const b = P.chip({ rotulo: `${rot} · ${n}`, ligado: k === categoria, modo: "radio", aoClicar: () => {
      categoria = k; barra.querySelectorAll(".au-chip").forEach(c => c.setAttribute("aria-checked", String(c === b))); desenhar(); } });
    barra.appendChild(b);
  }
  P.setas(barra);
  desenhar();
  return h("section", { class: "au-sec", "aria-labelledby": "au-mod" },
    h("div", { class: "au-sec-cab" },
      h("h2", { class: "titulo-sec", id: "au-mod" }, qtdItens ? "Receitas prontas" : "Comece por uma receita"),
      h("span", { class: "rotulo" }, `${todas.length} receitas · revise e salve em 1 minuto`)),
    noLimite ? h("p", { class: "aviso aviso-aten au-mod-limite", id: "au-mod-limite" }, ui.icone("alerta"),
      h("span", null, `${motivoLimite} `, h("a", { href: "#/config/plano" }, "Ver Plano e uso"), ".")) : null,
    h("div", { class: "au-modelos-ferramentas" }, busca, barra),
    grade, vazioBusca, statusBusca);
}

/** Mini linha do tempo de uma receita com esperas: «Na hora · Esperar 1 dia · Mensagem · …». */
function miniTempo(ui, m) {
  const h = ui.h;
  const tl = L.linhaDoTempo(m.auto.acoes);
  return h("ol", { class: "au-mini-tempo", role: "list", "aria-label": "Sequência da receita" }, m.auto.acoes.map((ac, i) => {
    const esp = ac.tipo === "esperar";
    const rot = esp ? `Esperar ${L.formatarDuracao(ac.minutos)}` : L.rotuloAcao(ac.tipo, {});
    return h("li", { class: ["au-mini-passo", esp && "au-mini-espera"], title: esp ? rot : `${tl[i].quando}: ${rot}` }, esp ? ui.icone("relogio") : null, rot);
  }));
}
