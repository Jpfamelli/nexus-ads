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
let rascunhoIA = null;     // {auto, explicacao, avisos} — a montagem da IA que o editor abre (só na memória)
let textoIA = "";          // o que a pessoa já digitou na caixa «Criar com IA» (sobrevive a voltar da lista)

async function modulos(ctx, editor) {
  const v = encodeURIComponent(ctx.versao);
  if (!L) L = await import(`./auto-logica.js?v=${v}`);
  if (!PE) PE = await import(`./auto-pecas.js?v=${v}`);
  if (editor && !ED) ED = await import(`./auto-editor.js?v=${v}`);
  return { L, P: PE.pecas(ctx.ui, L), ED };
}

function pararPulso() {
  if (cancelarPulso) { try { cancelarPulso(); } catch { /* ok */ } cancelarPulso = null; }
}

/* ================================================================== entrada do módulo */

export async function montar(ctx) {
  const eu = ++montagem;
  const { ui } = ctx;
  pararPulso();
  ui.carregarCss("automacoes");
  ui.limpar(ctx.alvo);
  const parte = ctx.rota.partes[0] || null;
  const raiz = ui.h("div", { class: ["au", parte ? "au-pag-editor" : "au-pag-lista"] });
  ctx.alvo.appendChild(raiz);
  raiz.appendChild(ui.esqueleto(parte ? "lista" : "cartoes", parte ? 5 : 4));
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
  const amb = {
    L, P: pecas.P,
    rascunho: null,
    duplicar: (c, a) => duplicar(c, a, dados.base),
    limparRascunho: () => { rascunhoIA = null; },
    testarAoAbrir: false,
  };
  if (!parte) return telaLista(ctx, raiz, dados, pecas.P);
  if (parte === "nova") {
    if (!dados.pode_editar) return semEditar(ctx, raiz);
    if (ctx.rota.query && ctx.rota.query.ia === "1") {
      if (rascunhoIA) amb.rascunho = rascunhoIA;
      else ui.toast("A montagem da IA não foi guardada (a página foi recarregada). Descreva de novo na caixa «Criar com IA».", { tipo: "info" });
    }
    return ED.telaEditor(ctx, raiz, dados, null, amb);
  }
  const item = dados.itens.find(x => x.id === parte);
  if (!item) {
    ctx.titulo("Automação não encontrada");
    raiz.appendChild(ui.vazio({ titulo: "Não encontramos essa automação", texto: "Ela pode ter sido excluída. Volte para a lista.", icone: "raio",
      acao: { rotulo: "Ver automações", fn: () => ctx.navegar("#/automacoes") } }));
    return;
  }
  return ED.telaEditor(ctx, raiz, dados, item, amb);
}

export function desmontar() {
  montagem++;
  pararPulso();
}

function semEditar(ctx, raiz) {
  ctx.titulo("Automações");
  raiz.appendChild(ctx.ui.vazio({ titulo: "Somente administradores criam automações", texto: "Você pode ver as automações e o histórico de execuções.", icone: "cadeado",
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
    on: { click: () => ctx.navegar("#/automacoes/nova") } }, ui.icone("mais"), "Do zero") : null;

  raiz.appendChild(h("header", { class: "cab-pag au-cab" },
    h("div", null,
      h("p", { class: "rotulo" }, "Operação no automático"),
      h("h1", { class: "titulo-pag" }, "Automações"),
      h("p", { class: "sub" }, "Quando algo acontece, o sistema confere as condições e faz o resto: move no funil, cria tarefas, avisa a equipe, etiqueta, espera um tempo e manda mensagem pelo WhatsApp (pelo CodeWords).")),
    h("div", { class: "linha au-cab-acoes" },
      h("span", { class: ["pilula", noLimite ? "pilula-aten" : "pilula-neutra"] }, usoTxt),
      btNova)));

  if (!podeEditar) raiz.appendChild(h("p", { class: "aviso au-aviso-papel" }, ui.icone("cadeado"),
    h("span", null, "Você pode ver as automações e o histórico. Para criar ou mudar, fale com um administrador.")));
  if (noLimite && podeEditar) raiz.appendChild(h("p", { class: "aviso aviso-aten" }, ui.icone("alerta"),
    h("span", null, `Seu plano chegou ao limite de ${lim.limite} automações. Exclua uma que não usa ou fale com o suporte para aumentar.`)));

  // ------------------------------------------------ criar com IA
  if (podeEditar) raiz.appendChild(cartaoIA(ctx, dados, noLimite));

  // ------------------------------------------------ as do cliente
  const metas = new Map();
  if (itens.length) raiz.appendChild(secaoSuas(ctx, dados, itens, metas, P));
  else raiz.appendChild(h("div", { class: "au-vazio" }, ui.vazio({
    titulo: "Automações fazem o trabalho repetitivo.", texto: podeEditar ? "Descreva o que você quer na caixa acima, ou comece por uma receita pronta." : "Ainda não há automações criadas.", icone: "raio" })));

  // ------------------------------------------------ receitas prontas
  if (podeEditar) raiz.appendChild(secaoReceitas(ctx, dados, vertical, vv, noLimite, itens.length, P));

  // ------------------------------------------------ do sistema
  const sis = h("ul", { class: "au-sis", role: "list" });
  for (const r of dados.sistema || []) {
    sis.appendChild(h("li", { class: "au-sis-item" },
      h("span", { class: "au-sis-ic", "aria-hidden": "true" }, ui.icone("escudo")),
      h("div", null, h("p", { class: "au-sis-nome" }, r.nome), h("p", { class: "au-sis-desc" }, r.descricao)),
      h("span", { class: "pilula pilula-ok au-sis-selo" }, ui.icone("check"), "Sempre ligada")));
  }
  raiz.appendChild(h("section", { class: "au-sec au-sec-sistema", "aria-labelledby": "au-sis" },
    h("div", { class: "au-sec-cab" },
      h("h2", { class: "titulo-sec", id: "au-sis" }, "Do sistema"),
      h("span", { class: "rotulo" }, "já vêm prontas · não dá para desligar")),
    sis));

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
        for (const it of novo.itens || []) { const m = metas.get(it.id); if (m) m(it); }
      } catch { /* silencioso: o próximo pulso tenta de novo */ } finally { pedindo = false; }
    });
  }
}

/* ------------------------------------------------------------------ Criar com IA */

const EXEMPLOS_IA = Object.freeze([
  "Quando um orçamento ficar 2 dias sem resposta, manda uma mensagem e avisa o responsável",
  "Todo dia às 9h, cria uma tarefa para ligar para quem está parado há 3 dias na etapa de orçamento",
  "Quando o cliente faltar, pede para remarcar e avisa a recepção",
]);

function cartaoIA(ctx, dados, noLimite) {
  const { ui } = ctx;
  const h = ui.h;
  const ia = dados.ia || (dados.base && dados.base.ia) || null;
  // nx_automacoes_listar → ia:{disponivel, usadas, limite}; a base de Conversas usa ia:{ligada, cota:{usadas, limite}} (aceitamos as duas)
  const desligada = !!ia && (ia.disponivel === false || ia.ligada === false);
  const cota = ia && (ia.cota || (ia.limite !== undefined ? { usadas: ia.usadas, limite: ia.limite } : null));
  const semCota = !!cota && cota.limite != null && Number(cota.usadas) >= Number(cota.limite);
  const MAX = L.LIMITES.descricao_ia;
  const MIN = 12;

  const id = `au-ia-${Math.random().toString(36).slice(2, 7)}`;
  const area = h("textarea", { id, class: "au-ia-txt", rows: 3, maxlength: MAX, disabled: desligada,
    placeholder: `Ex.: ${EXEMPLOS_IA[0]}`, "aria-describedby": `${id}-aj` }, textoIA);
  const contador = h("span", { class: "au-ia-cont mono", "aria-hidden": "true" }, `${textoIA.length}/${MAX}`);
  const btCriar = h("button", { type: "button", class: "bt bt-prim bt-g au-ia-bt", disabled: true }, ui.icone("ia"), "Criar com IA");
  const estado = h("div", { class: "au-ia-estado", "aria-live": "polite" });
  const exemplos = h("div", { class: "au-chips au-ia-ex", role: "group", "aria-label": "Exemplos de pedido" }, EXEMPLOS_IA.map(t => {
    const b = h("button", { type: "button", class: "au-chip au-chip-ex", disabled: desligada, title: t }, t.length > 56 ? `${t.slice(0, 55)}…` : t);
    b.addEventListener("click", () => { area.value = t; area.dispatchEvent(new Event("input", { bubbles: true })); area.focus(); });
    return b;
  }));

  const pintarBotao = () => {
    const n = area.value.trim().length;
    contador.textContent = `${area.value.length}/${MAX}`;
    btCriar.disabled = desligada || noLimite || n < MIN;
    textoIA = area.value;
  };
  area.addEventListener("input", pintarBotao);
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
      h("small", { class: "campo-ajuda au-ia-ajuda", id: `${id}-aj` }, "Conte o gatilho (quando), o que checar e o que fazer. Use as palavras do seu dia a dia.")),
    exemplos,
    h("div", { class: "au-ia-rodape" }, contador, btCriar),
    estado);

  if (desligada) estado.appendChild(h("p", { class: "aviso aviso-aten" }, ui.icone("ia"),
    h("span", null, "A IA está desligada para esta empresa. Use as receitas prontas abaixo ou crie do zero. Para ligar, abra ", h("a", { href: "#/config/ia" }, "Configurações → Assistente de IA"), ".")));
  else if (semCota) estado.appendChild(h("p", { class: "aviso aviso-aten" }, ui.icone("alerta"),
    h("span", null, "A cota de IA deste mês acabou. As receitas prontas e o editor continuam funcionando; a cota volta no começo do próximo mês.")));

  let pedindo = false;
  btCriar.addEventListener("click", async () => {
    if (pedindo || btCriar.disabled) return;
    const descricao = area.value.trim();
    pedindo = true;
    ui.limpar(estado);
    estado.appendChild(h("p", { class: "au-ia-carregando" }, h("span", { class: "au-giro", "aria-hidden": "true" }),
      "A IA está montando a automação… isso leva alguns segundos."));
    area.disabled = true;
    try {
      const r = await ui.carregando(btCriar, ctx.api.fn("nx-ia", { acao: "automacao_montar", descricao }));
      if (!r || !r.automacao || typeof r.automacao !== "object") throw Object.assign(new Error("ia_resposta_invalida"), { codigo: "ia_resposta_invalida" });
      const conv = L.deFormatoIA(r.automacao, dados.base);
      const avisos = [...(Array.isArray(r.avisos) ? r.avisos : []).map(String), ...conv.avisos].filter(Boolean).slice(0, 12);
      const montagemIA = { auto: conv.auto, explicacao: typeof r.explicacao === "string" ? r.explicacao.trim().slice(0, 1500) : "", avisos };
      ui.limpar(estado);
      estado.appendChild(resultadoIA(ctx, dados, montagemIA, () => { area.focus(); }));
    } catch (e) {
      ui.limpar(estado);
      const x = L.erroDaIA(e, ctx.api.mensagemErro(e));
      estado.appendChild(h("div", { class: ["aviso", x.tipo === "cota" || x.tipo === "chave" || x.tipo === "desligada" ? "aviso-aten" : "aviso-ruim", "au-ia-erro"], role: "alert" },
        ui.icone(x.tipo === "rede" ? "alerta" : "ia"),
        h("div", { class: "pilha-p" }, h("p", null, h("b", null, x.titulo)), h("p", null, x.texto),
          x.tipo === "cota" || x.tipo === "chave" || x.tipo === "desligada"
            ? h("div", { class: "linha" }, h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => ctx.navegar("#/automacoes/nova") } }, ui.icone("mais"), "Criar do zero"))
            : null)));
    } finally {
      pedindo = false;
      area.disabled = desligada;
      pintarBotao();
    }
  });
  return cartao;
}

/** A montagem da IA: explicação, avisos, a frase da automação e o botão que abre o editor. */
function resultadoIA(ctx, dados, m, tentarOutra) {
  const { ui } = ctx;
  const h = ui.h;
  const frase = L.descrever(m.auto, dados.base, ctx.vocab);
  const problema = L.validar(m.auto, { base: dados.base, ligar: false });
  const abrir = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("seta-dir"), "Conferir e ajustar no editor");
  abrir.addEventListener("click", () => { rascunhoIA = m; ctx.navegar("#/automacoes/nova?ia=1"); });
  const outra = h("button", { type: "button", class: "bt bt-fant" }, "Pedir de outro jeito");
  outra.addEventListener("click", tentarOutra);
  return h("div", { class: "au-ia-res", role: "status" },
    h("p", { class: "rotulo" }, "A IA montou"),
    h("p", { class: "au-ia-res-nome" }, m.auto.nome || "Automação sem nome"),
    h("p", { class: "au-ia-res-frase" }, frase),
    m.explicacao ? h("p", { class: "au-ia-res-exp" }, m.explicacao) : null,
    m.avisos.length ? h("ul", { class: "au-ia-ped-avisos", role: "list" }, m.avisos.map(t => h("li", null, ui.icone("alerta"), h("span", null, t)))) : null,
    !problema.ok ? h("p", { class: "aviso aviso-aten" }, ui.icone("info"), h("span", null, `Falta completar no editor: ${problema.motivo}.`)) : null,
    h("div", { class: "linha au-ia-res-acoes" }, abrir, outra),
    h("p", { class: "sub" }, "Nada foi salvo ainda. No editor você confere cada passo e decide se liga."));
}

/* ------------------------------------------------------------------ Suas automações */

function secaoSuas(ctx, dados, itens, metas, P) {
  const { ui } = ctx;
  const h = ui.h;
  const ligadas = itens.filter(x => x.ativo).length;
  let filtro = "todas";
  const lista = h("ul", { class: "au-lista", role: "list" });
  const vazio = h("div", { class: "au-lista-vazio", hidden: true });
  const filtros = [["todas", "Todas", () => true], ["ligadas", "Ligadas", x => !!x.ativo], ["desligadas", "Desligadas", x => !x.ativo],
    ["erros", "Com erro", x => Number(x.erros) > 0]];
  const barra = h("div", { class: "au-chips au-lista-filtro", role: "radiogroup", "aria-label": "Mostrar automações" });
  const desenhar = () => {
    ui.limpar(lista);
    const f = filtros.find(x => x[0] === filtro)[2];
    const vis = itens.filter(f);
    metas.clear();
    for (const it of vis) lista.appendChild(itemLista(ctx, dados, it, metas, P));
    // os itens fora do filtro continuam recebendo o pulso (o contador do cabeçalho não depende da lista)
    vazio.hidden = vis.length > 0;
    ui.limpar(vazio);
    if (!vis.length) vazio.appendChild(h("p", { class: "sub" }, "Nenhuma automação nesta situação."));
  };
  for (const [k, rot, fn] of filtros) {
    const n = itens.filter(fn).length;
    if (k === "erros" && !n) continue;
    const b = P.chip({ rotulo: `${rot} · ${n}`, ligado: k === filtro, modo: "radio", aoClicar: () => {
      filtro = k; barra.querySelectorAll(".au-chip").forEach(c => c.setAttribute("aria-checked", String(c === b))); desenhar(); } });
    barra.appendChild(b);
  }
  desenhar();
  return h("section", { class: "au-sec", "aria-labelledby": "au-suas" },
    h("div", { class: "au-sec-cab" },
      h("h2", { class: "titulo-sec", id: "au-suas" }, "Suas automações"),
      h("span", { class: "rotulo" }, `${ligadas} ${ligadas === 1 ? "ligada" : "ligadas"} de ${itens.length}`)),
    itens.length > 3 ? barra : null,
    lista, vazio);
}

function itemLista(ctx, dados, it, metas, P) {
  const { ui } = ctx;
  const h = ui.h;
  const vv = ctx.vocab;
  const podeEditar = !!dados.pode_editar;
  const g = L.GATILHO[it.gatilho];
  const frase = L.descrever(it, dados.base, vv);
  const exec = h("span", { class: "au-item-num" });
  const errs = h("span", { class: "au-item-num au-com-erro" });
  const ultima = h("span", { class: "au-item-ult" });
  const li = h("li", { class: ["au-item", !it.ativo && "au-desligada"] });
  const pintar = x => {
    const e = Number(x.execucoes) || 0, r = Number(x.erros) || 0;
    exec.textContent = e === 1 ? "1 execução" : `${e} execuções`;
    errs.textContent = r === 1 ? "1 erro" : `${r} erros`;
    errs.hidden = !r;
    ultima.textContent = x.ultima_execucao_em ? `última ${ui.relativo(x.ultima_execucao_em)}` : "ainda não rodou";
    ultima.title = x.ultima_execucao_em ? ui.dataHoraBR(x.ultima_execucao_em) : "";
  };
  pintar(it);
  const sw = P.interruptor({
    ligado: it.ativo, rotulo: `Ligar a automação ${it.nome}`, desabilitado: !podeEditar,
    aoMudar: async (v, b) => {
      b.disabled = true;
      try {
        const novo = await ctx.api.rpcC("nx_automacao_ativar", { p_id: it.id, p_ativo: v });
        Object.assign(it, novo);
        li.classList.toggle("au-desligada", !it.ativo);
        ui.toast(v ? `«${it.nome}» ligada.` : `«${it.nome}» desligada.`, { tipo: "ok" });
      } catch (e) {
        b.definir(!v);
        ui.toast(ctx.api.mensagemErro(e), { tipo: "erro" });
      } finally { b.disabled = !podeEditar; }
    },
  });
  metas.set(it.id, x => { Object.assign(it, x); pintar(it); sw.definir(it.ativo); li.classList.toggle("au-desligada", !it.ativo); });

  const btMais = h("button", { type: "button", class: "bt-icone au-item-mais", "aria-label": `Opções de ${it.nome}`, "aria-haspopup": "menu" }, ui.icone("opcoes"));
  btMais.addEventListener("click", () => ui.menu(btMais, [
    { rotulo: podeEditar ? "Editar" : "Ver", icone: "editar", fn: () => ctx.navegar(`#/automacoes/${it.id}`) },
    { rotulo: "Testar (sem enviar nada)", icone: "olho", fn: () => ctx.navegar(`#/automacoes/${it.id}?testar=1`) },
    { rotulo: "Ver execuções", icone: "relogio", fn: () => ctx.navegar(`#/automacoes/${it.id}?aba=execucoes`) },
    podeEditar ? { rotulo: "Duplicar", icone: "copiar", fn: () => duplicar(ctx, it, dados.base) } : null,
    podeEditar ? { rotulo: "Excluir", icone: "lixeira", perigo: true, fn: () => excluir(ctx, it, () => montar(ctx)) } : null,
  ].filter(Boolean)));

  const etiquetas = [];
  if (L.temSequencia(it)) etiquetas.push(ui.pilula("Sequência", "info", { icone: "relogio" }));
  if (L.temIA(it)) etiquetas.push(ui.pilula("Usa IA", "prim", { icone: "ia" }));
  if (L.enviaMensagem(it)) etiquetas.push(ui.pilula("WhatsApp", "ok", { icone: "whatsapp" }));

  li.append(
    h("div", { class: "au-item-sw" }, sw),
    h("a", { class: "au-item-corpo", href: `#/automacoes/${it.id}` },
      h("span", { class: "au-item-nome" }, it.nome),
      h("span", { class: "au-item-frase" }, frase),
      h("span", { class: "au-item-meta" },
        h("span", { class: "pilula pilula-neutra au-item-gat" }, ui.icone(g ? g.icone : "raio"), L.rotuloGatilho(it.gatilho, vv)),
        etiquetas, exec, errs, ultima)),
    btMais);
  return li;
}

/** Cria uma cópia DESLIGADA (de uma salva ou do que está aberto no editor). */
async function duplicar(ctx, origem, base) {
  const a = L.limpar(origem);
  delete a.id;
  a.nome = `${origem.nome || "Automação"} (cópia)`.slice(0, 80);
  a.ativo = false;
  const r = L.validar(a, { base, ligar: false });
  if (!r.ok) { ctx.ui.toast(`Complete a automação antes de duplicar: falta ${r.motivo}.`, { tipo: "info" }); return; }
  try {
    const novo = await ctx.api.rpcC("nx_automacao_salvar", { p_auto: a });
    ctx.ui.toast("Cópia criada (desligada). Revise e ligue quando quiser.", { tipo: "ok" });
    ctx.navegar(`#/automacoes/${novo.id}`);
  } catch (e) { ctx.ui.toast(ctx.api.mensagemErro(e), { tipo: "erro" }); }
}

async function excluir(ctx, it, depois) {
  const ok = await ctx.ui.confirmar({ titulo: "Excluir automação?", perigo: true, rotulo: "Excluir",
    texto: `«${it.nome}» para de rodar e o histórico de execuções dela é apagado. As tarefas e mensagens que ela já criou continuam.` });
  if (!ok) return false;
  try {
    await ctx.api.rpcC("nx_automacao_excluir", { p_id: it.id });
    ctx.ui.toast("Automação excluída.", { tipo: "ok" });
    if (depois) depois();
    return true;
  } catch (e) { ctx.ui.toast(ctx.api.mensagemErro(e), { tipo: "erro" }); return false; }
}

/* ------------------------------------------------------------------ Receitas prontas */

function secaoReceitas(ctx, dados, vertical, vv, noLimite, qtdItens, P) {
  const { ui } = ctx;
  const h = ui.h;
  const grade = h("div", { class: "au-modelos" });
  const temModeloAprovado = (dados.base.templates || []).some(t => String(t.status || "").toUpperCase() === "APPROVED");
  const exemplo = L.exemploVariaveis({ empresa: ctx.cliente ? ctx.cliente.nome : "", atendente: ctx.sessao && ctx.sessao.conta ? ctx.sessao.conta.nome : "Ana" });
  const todas = L.modelosDaVertical(vertical);
  let categoria = "todas";

  const cartao = (m, primeiro) => {
    const selo = L.seloModelo(m, vertical);
    const acTpl = m.auto.acoes.find(a => a.tipo === "enviar_template");
    const acMsg = m.auto.acoes.find(a => a.tipo === "enviar_mensagem");
    const canal = L.canalDaReceita(m);
    // no cartão em destaque que manda mensagem: como o cliente vai receber (texto com um exemplo)
    const previa = primeiro && selo && (acTpl || acMsg) ? h("figure", { class: "au-modelo-previa" },
      h("figcaption", { class: "rotulo" }, "Como chega no WhatsApp"),
      h("div", { class: "au-bolha" }, acTpl ? L.previaModelo(L.textoModeloLembrete(vertical), acTpl.parametros, exemplo)
        : L.aplicarVariaveis(L.aplicarModelo(m, dados.base, vv).acoes.find(a => a.tipo === "enviar_mensagem").texto, exemplo))) : null;
    const tempo = L.ehSequencia(m) ? miniTempo(ui, m) : null;
    return h("article", { class: ["au-modelo", selo && "au-modelo-destaque", `au-modelo-${m.categoria}`], dataset: { categoria: m.categoria } },
      h("div", { class: "au-modelo-topo" },
        h("span", { class: "au-modelo-ic", "aria-hidden": "true" }, ui.icone(m.icone)),
        h("div", { class: "au-modelo-selos" },
          selo ? h("span", { class: "pilula pilula-prim" }, selo) : null,
          canal === "codewords" ? h("span", { class: "pilula pilula-ok", title: "As mensagens saem pelo CodeWords (WhatsApp conectado por aparelho). Receita pronta e testada." }, ui.icone("whatsapp"), "sai pelo CodeWords") : null,
          canal === "meta" ? h("span", { class: "pilula pilula-info", title: "Usa um modelo aprovado pela Meta (WhatsApp oficial)." }, ui.icone("whatsapp"), "modelo oficial da Meta") : null,
          L.usaIA(m) ? h("span", { class: "pilula pilula-prim", title: "Usa uma sugestão da cota de IA do mês a cada execução." }, ui.icone("ia"), "usa IA") : null)),
      h("h3", null, L.tituloModelo(m, vv)),
      h("p", { class: "sub" }, L.textoModelo(m, vv)),
      tempo,
      previa,
      acTpl && !temModeloAprovado ? h("p", { class: "au-modelo-nota" }, ui.icone("info"), "Precisa de um modelo aprovado na Meta; dá para deixar pronta e ligar depois.") : null,
      m.aviso && !acTpl ? h("p", { class: "au-modelo-nota" }, ui.icone("info"), m.aviso) : null,
      h("div", { class: "au-modelo-rod" },
        h("button", { type: "button", class: ["bt", selo ? "bt-prim" : "bt-sec", "bt-p"], disabled: noLimite,
          on: { click: () => ctx.navegar(`#/automacoes/nova?modelo=${encodeURIComponent(m.id)}`) } }, "Usar receita")));
  };

  const desenhar = () => {
    ui.limpar(grade);
    const vis = todas.filter(m => categoria === "todas" || m.categoria === categoria);
    vis.forEach((m, i) => grade.appendChild(cartao(m, i === 0 && categoria === "todas")));
    grade.classList.toggle("au-modelos-filtrada", categoria !== "todas");
  };
  const barra = h("div", { class: "au-chips au-modelos-filtro", role: "radiogroup", "aria-label": "Tipo de receita" });
  for (const [k, rot] of L.CATEGORIAS_MODELO) {
    const n = todas.filter(m => k === "todas" || m.categoria === k).length;
    if (!n) continue;
    const b = P.chip({ rotulo: `${rot} · ${n}`, ligado: k === categoria, modo: "radio", aoClicar: () => {
      categoria = k; barra.querySelectorAll(".au-chip").forEach(c => c.setAttribute("aria-checked", String(c === b))); desenhar(); } });
    barra.appendChild(b);
  }
  desenhar();
  return h("section", { class: "au-sec", "aria-labelledby": "au-mod" },
    h("div", { class: "au-sec-cab" },
      h("h2", { class: "titulo-sec", id: "au-mod" }, qtdItens ? "Receitas prontas" : "Comece por uma receita"),
      h("span", { class: "rotulo" }, "revise e salve em 1 minuto")),
    barra, grade);
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
