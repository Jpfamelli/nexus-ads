/* ============================================================
   ÓRBITA — automacoes.js · frente F7 · T12 (ESPEC §2.6, §5.7, §5.8)
   Rotas: #/automacoes · #/automacoes/nova[?modelo=<id>] · #/automacoes/<id>[?aba=execucoes]
   Lista (do sistema + do cliente + modelos prontos) e editor em página
   (não canvas): Quando → Se → Então, prévia em frase, execuções.
   Dados: nx_automacoes_listar (traz também a base do editor),
   nx_automacao_salvar | _ativar | _excluir | _execucoes.
   Regras do app: sem import estático (auto-logica.js vem por import()
   com ctx.versao), texto de usuário só por textContent (ui.h), nenhuma
   cor escrita aqui (só tokens do CSS / --cor validada).
   ============================================================ */

let L = null;              // auto-logica.js (puro)
let montagem = 0;          // descarta respostas de montagens antigas
let cancelarPulso = null;
let seqId = 0;
const novoId = p => `au-${p}-${++seqId}`;

async function logica(ctx) {
  if (!L) L = await import(`./auto-logica.js?v=${encodeURIComponent(ctx.versao)}`);
  return L;
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
  let dados;
  try {
    const r = await Promise.all([logica(ctx), ctx.api.rpcC("nx_automacoes_listar")]);
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
  if (!parte) return telaLista(ctx, raiz, dados);
  if (parte === "nova") {
    if (!dados.pode_editar) return semEditar(ctx, raiz);
    return telaEditor(ctx, raiz, dados, null);
  }
  const item = dados.itens.find(x => x.id === parte);
  if (!item) {
    ctx.titulo("Automação não encontrada");
    raiz.appendChild(ui.vazio({ titulo: "Não encontramos essa automação", texto: "Ela pode ter sido excluída. Volte para a lista.", icone: "raio",
      acao: { rotulo: "Ver automações", fn: () => ctx.navegar("#/automacoes") } }));
    return;
  }
  return telaEditor(ctx, raiz, dados, item);
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

/* ================================================================== peças comuns */

/** Interruptor acessível (button role=switch). */
function interruptor(ui, { ligado, rotulo, aoMudar, desabilitado, mostrarTexto = false }) {
  const txt = ui.h("span", { class: "au-sw-txt" }, ligado ? "Ligada" : "Desligada");
  const b = ui.h("button", { type: "button", role: "switch", class: "au-sw", "aria-checked": String(!!ligado), "aria-label": rotulo,
    disabled: !!desabilitado }, ui.h("span", { class: "au-sw-trilho", "aria-hidden": "true" }, ui.h("span", { class: "au-sw-bola" })),
    mostrarTexto ? txt : null);
  b.definir = v => { b.setAttribute("aria-checked", String(!!v)); txt.textContent = v ? "Ligada" : "Desligada"; };
  b.ligado = () => b.getAttribute("aria-checked") === "true";
  b.addEventListener("click", () => { if (b.disabled) return; const v = !b.ligado(); b.definir(v); if (aoMudar) aoMudar(v, b); });
  return b;
}

/** <select> com rótulo, opções simples ou em grupos ({grupo, opcoes}). */
function seletor(ui, { rotulo, valor, opcoes, vazio, aoMudar, desabilitado, ajuda, obrigatorio, classe }) {
  const id = novoId("sel");
  const opt = o => ui.h("option", { value: String(o.valor ?? ""), selected: String(o.valor ?? "") === String(valor ?? ""), disabled: !!o.desabilitado }, o.rotulo);
  const filhos = [];
  if (vazio !== undefined && vazio !== null) filhos.push(ui.h("option", { value: "", selected: valor == null || valor === "" }, vazio));
  for (const o of opcoes || []) {
    if (o.grupo) filhos.push(ui.h("optgroup", { label: o.grupo }, (o.opcoes || []).map(opt)));
    else filhos.push(opt(o));
  }
  const sel = ui.h("select", { id, disabled: !!desabilitado, required: !!obrigatorio }, filhos);
  if (aoMudar) sel.addEventListener("change", () => aoMudar(sel.value, sel));
  return ui.h("div", { class: ["campo", "campo-select", classe] },
    rotulo ? ui.h("label", { for: id }, rotulo, obrigatorio ? ui.h("span", { class: "obrig", "aria-hidden": "true" }, " *") : null) : null,
    sel, ajuda ? ui.h("small", { class: "campo-ajuda" }, ajuda) : null);
}

function entrada(ui, { rotulo, valor, tipo = "text", max, min, passo, placeholder, aoMudar, desabilitado, ajuda, sufixo, variaveis, linhas, obrigatorio, rotuloOculto }) {
  const id = novoId("in");
  const attrs = { id, disabled: !!desabilitado, placeholder: placeholder || null, required: !!obrigatorio,
    dataset: variaveis ? { variaveis: "1" } : null };
  let ctl;
  if (tipo === "textarea") ctl = ui.h("textarea", { ...attrs, rows: linhas || 3, maxlength: max || null }, valor ?? "");
  else ctl = ui.h("input", { ...attrs, type: tipo, value: valor ?? "", maxlength: tipo !== "number" && max ? max : null,
    max: tipo === "number" && max != null ? max : null, min: tipo === "number" && min != null ? min : null, step: passo || null,
    inputmode: tipo === "number" ? "decimal" : null });
  if (aoMudar) ctl.addEventListener("input", () => aoMudar(ctl.value, ctl));
  const lab = rotulo ? ui.h("label", { for: id, class: rotuloOculto ? "sr-only" : null }, rotulo,
    obrigatorio ? ui.h("span", { class: "obrig", "aria-hidden": "true" }, " *") : null) : null;
  return ui.h("div", { class: ["campo", tipo === "textarea" ? "campo-textarea" : "campo-texto", sufixo && "au-com-sufixo"] },
    lab, sufixo ? ui.h("div", { class: "au-sufixo" }, ctl, ui.h("span", { class: "au-sufixo-txt", "aria-hidden": "true" }, sufixo)) : ctl,
    ajuda ? ui.h("small", { class: "campo-ajuda" }, ajuda) : null);
}

/** Opções vindas da base do editor. */
function opcoesBase(dados, tipo, { funil } = {}) {
  const b = dados.base || {};
  switch (tipo) {
    case "funil": return (b.funis || []).filter(f => f.ativo !== false).map(f => ({ valor: f.id, rotulo: f.nome + (f.padrao ? " (padrão)" : "") }));
    case "estagio": return (b.funis || []).filter(f => f.ativo !== false && (!funil || f.id === funil))
      .map(f => ({ grupo: f.nome, opcoes: (f.estagios || []).map(e => ({ valor: e.id, rotulo: e.nome })) }));
    case "canal": return (b.canais || []).map(c => ({ valor: c.id, rotulo: c.nome + (c.numero_exibicao ? ` · ${c.numero_exibicao}` : "") }));
    case "departamento": return (b.departamentos || []).map(d => ({ valor: d.id, rotulo: d.nome + (d.padrao ? " (padrão)" : "") }));
    case "etiqueta": return (b.etiquetas || []).map(e => ({ valor: e.id, rotulo: e.nome }));
    case "pessoa": return (b.usuarios || []).map(u => ({ valor: u.id, rotulo: u.nome }));
    default: return [];
  }
}

/* ================================================================== LISTA */

function telaLista(ctx, raiz, dados) {
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
  const btNova = podeEditar ? h("button", { type: "button", class: "bt bt-prim", disabled: noLimite,
    title: noLimite ? `Seu plano permite até ${lim.limite} automações.` : null,
    on: { click: () => ctx.navegar("#/automacoes/nova") } }, ui.icone("mais"), "Nova automação") : null;

  raiz.appendChild(h("header", { class: "cab-pag au-cab" },
    h("div", null,
      h("p", { class: "rotulo" }, "Operação no automático"),
      h("h1", { class: "titulo-pag" }, "Automações"),
      h("p", { class: "sub" }, "Quando algo acontece, o sistema confere as condições e faz o resto — tarefas, avisos, etiquetas e mensagens pelo WhatsApp oficial.")),
    h("div", { class: "linha au-cab-acoes" },
      h("span", { class: ["pilula", noLimite ? "pilula-aten" : "pilula-neutra"] }, usoTxt),
      btNova)));

  if (!podeEditar) raiz.appendChild(h("p", { class: "aviso au-aviso-papel" }, ui.icone("cadeado"),
    h("span", null, "Você pode ver as automações e o histórico. Para criar ou mudar, fale com um administrador.")));
  if (noLimite && podeEditar) raiz.appendChild(h("p", { class: "aviso aviso-aten" }, ui.icone("alerta"),
    h("span", null, `Seu plano chegou ao limite de ${lim.limite} automações. Exclua uma que não usa ou fale com o suporte para aumentar.`)));

  // ------------------------------------------------ as do cliente
  const metas = new Map();
  if (itens.length) {
    const ligadas = itens.filter(x => x.ativo).length;
    const lista = h("ul", { class: "au-lista", role: "list" });
    for (const it of itens) lista.appendChild(itemLista(ctx, dados, it, metas));
    raiz.appendChild(h("section", { class: "au-sec", "aria-labelledby": "au-suas" },
      h("div", { class: "au-sec-cab" },
        h("h2", { class: "titulo-sec", id: "au-suas" }, "Suas automações"),
        h("span", { class: "rotulo" }, `${ligadas} ${ligadas === 1 ? "ligada" : "ligadas"} de ${itens.length}`)),
      lista));
  } else {
    raiz.appendChild(h("div", { class: "au-vazio" }, ui.vazio({
      titulo: "Automações fazem o trabalho repetitivo.", texto: "Comece por um modelo.", icone: "raio",
      acoes: podeEditar && !noLimite ? [{ rotulo: "Criar do zero", icone: "mais", fn: () => ctx.navegar("#/automacoes/nova") }] : [] })));
  }

  // ------------------------------------------------ modelos prontos
  if (podeEditar) {
    const grade = h("div", { class: "au-modelos" });
    const temModeloAprovado = (dados.base.templates || []).some(t => String(t.status || "").toUpperCase() === "APPROVED");
    const exemplo = L.exemploVariaveis({ empresa: ctx.cliente ? ctx.cliente.nome : "", atendente: ctx.sessao && ctx.sessao.conta ? ctx.sessao.conta.nome : "Ana" });
    for (const m of L.modelosDaVertical(vertical)) {
      const selo = L.seloModelo(m, vertical);
      const acTpl = m.auto.acoes.find(a => a.tipo === "enviar_template");
      const precisaMeta = !!acTpl;
      // no modelo em destaque que manda mensagem: como o paciente vai receber (texto sugerido com um exemplo)
      const previa = selo && acTpl ? h("figure", { class: "au-modelo-previa" },
        h("figcaption", { class: "rotulo" }, "Como chega no WhatsApp"),
        h("div", { class: "au-bolha" }, L.previaModelo(L.textoModeloLembrete(vertical), acTpl.parametros, exemplo))) : null;
      grade.appendChild(h("article", { class: ["au-modelo", selo && "au-modelo-destaque"] },
        h("div", { class: "au-modelo-topo" },
          h("span", { class: "au-modelo-ic", "aria-hidden": "true" }, ui.icone(m.icone)),
          selo ? h("span", { class: "pilula pilula-prim" }, selo) : null),
        h("h3", null, L.tituloModelo(m, vv)),
        h("p", { class: "sub" }, L.textoModelo(m, vv)),
        previa,
        precisaMeta && !temModeloAprovado ? h("p", { class: "au-modelo-nota" }, ui.icone("info"), "Precisa de um modelo aprovado na Meta; dá para deixar pronta e ligar depois.") : null,
        h("div", { class: "au-modelo-rod" },
          h("button", { type: "button", class: ["bt", selo ? "bt-prim" : "bt-sec", "bt-p"], disabled: noLimite,
            on: { click: () => ctx.navegar(`#/automacoes/nova?modelo=${encodeURIComponent(m.id)}`) } }, "Usar modelo"))));
    }
    raiz.appendChild(h("section", { class: "au-sec", "aria-labelledby": "au-mod" },
      h("div", { class: "au-sec-cab" },
        h("h2", { class: "titulo-sec", id: "au-mod" }, itens.length ? "Modelos prontos" : "Comece por um modelo"),
        h("span", { class: "rotulo" }, "revise e salve em 1 minuto")),
      grade));
  }

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

function itemLista(ctx, dados, it, metas) {
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
  const sw = interruptor(ui, {
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
    { rotulo: "Ver execuções", icone: "relogio", fn: () => ctx.navegar(`#/automacoes/${it.id}?aba=execucoes`) },
    podeEditar ? { rotulo: "Duplicar", icone: "copiar", fn: () => duplicar(ctx, it) } : null,
    podeEditar ? { rotulo: "Excluir", icone: "lixeira", perigo: true, fn: () => excluir(ctx, it, () => montar(ctx)) } : null,
  ].filter(Boolean)));

  li.append(
    h("div", { class: "au-item-sw" }, sw),
    h("a", { class: "au-item-corpo", href: `#/automacoes/${it.id}` },
      h("span", { class: "au-item-nome" }, it.nome),
      h("span", { class: "au-item-frase" }, frase),
      h("span", { class: "au-item-meta" },
        h("span", { class: "pilula pilula-neutra au-item-gat" }, ui.icone(g ? g.icone : "raio"), L.rotuloGatilho(it.gatilho, vv)),
        exec, errs, ultima)),
    btMais);
  return li;
}

async function duplicar(ctx, it) {
  const a = L.limpar(it);
  delete a.id;
  a.nome = `${it.nome} (cópia)`.slice(0, 80);
  a.ativo = false;
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

/* ================================================================== EDITOR */

function telaEditor(ctx, raiz, dados, item) {
  const { ui } = ctx;
  const h = ui.h;
  const vv = ctx.vocab;
  const vertical = dados.vertical || (ctx.cliente && ctx.cliente.vertical) || "generico";
  const podeEditar = !!dados.pode_editar;
  const q = ctx.rota.query || {};

  // ------------------------------------------------ estado
  let auto;
  if (item) auto = JSON.parse(JSON.stringify(item));
  else if (q.modelo && L.MODELOS.some(m => m.id === q.modelo)) {
    auto = L.aplicarModelo(q.modelo, dados.base, vv);
    auto.ativo = !L.faltaModelo(auto) && L.validar(auto, { base: dados.base, ligar: true }).ok;
  } else auto = L.novaAutomacao("negocio_estagio");
  auto.condicoes = auto.condicoes || [];
  auto.acoes = auto.acoes || [];
  auto.config = auto.config || {};
  const modelo = q.modelo ? L.MODELOS.find(m => m.id === q.modelo) : null;
  let salvoJson = item ? JSON.stringify(L.limpar(auto)) : null;
  const sujo = () => JSON.stringify(L.limpar(auto)) !== salvoJson;
  let ultimoTexto = null;            // último campo com variáveis focado (os chips inserem nele)
  const exemplo = L.exemploVariaveis({ empresa: ctx.cliente ? ctx.cliente.nome : "", atendente: ctx.sessao && ctx.sessao.conta ? ctx.sessao.conta.nome : "Ana" });

  ctx.titulo(item ? item.nome : "Nova automação");

  // ------------------------------------------------ cabeçalho
  const nomeId = novoId("nome");
  const inpNome = h("input", { id: nomeId, class: "au-nome-inp", type: "text", maxlength: 80, value: auto.nome || "",
    placeholder: "Dê um nome (ex.: Lembrete da consulta)", disabled: !podeEditar, autocomplete: "off" });
  inpNome.addEventListener("input", () => { auto.nome = inpNome.value; mudou(); });
  const swAtivo = interruptor(ui, { ligado: !!auto.ativo, rotulo: "Ligada", mostrarTexto: true, desabilitado: !podeEditar,
    aoMudar: v => { auto.ativo = v; mudou(); } });
  const btSalvar = podeEditar ? h("button", { type: "button", class: "bt bt-prim" }, ui.icone("check"), item ? "Salvar" : "Criar automação") : null;
  const btCancelar = h("button", { type: "button", class: "bt bt-sec" }, podeEditar ? "Cancelar" : "Voltar");
  btCancelar.addEventListener("click", async () => {
    if (podeEditar && salvoJson !== null && sujo()) {
      const ok = await ui.confirmar({ titulo: "Sair sem salvar?", texto: "As mudanças desta automação serão perdidas.", rotulo: "Sair sem salvar", perigo: true });
      if (!ok) return;
    } else if (podeEditar && salvoJson === null && (auto.nome || auto.acoes.length)) {
      const ok = await ui.confirmar({ titulo: "Descartar esta automação?", texto: "Ela ainda não foi salva.", rotulo: "Descartar", perigo: true });
      if (!ok) return;
    }
    ctx.navegar("#/automacoes");
  });

  const cab = h("header", { class: "au-ed-cab" },
    // título da página para leitor de tela (o nome visível é um campo editável, não um cabeçalho)
    h("h1", { class: "sr-only" }, item ? `Automação: ${item.nome}` : "Nova automação"),
    h("a", { class: "au-voltar", href: "#/automacoes" }, ui.icone("seta-esq"), "Automações"),
    h("div", { class: "au-ed-linha" },
      h("div", { class: "au-ed-nome" },
        h("label", { class: "rotulo", for: nomeId }, item ? "Automação" : (modelo ? "Nova automação · a partir de um modelo" : "Nova automação")),
        inpNome),
      h("div", { class: "linha au-ed-acoes" }, swAtivo, btCancelar, btSalvar)));
  raiz.appendChild(cab);
  if (!podeEditar) raiz.appendChild(h("p", { class: "aviso au-aviso-papel" }, ui.icone("cadeado"),
    h("span", null, "Somente leitura: administradores editam automações.")));

  // ------------------------------------------------ abas (regra | execuções)
  const painelRegra = h("div", { class: "au-painel", id: novoId("regra") });
  const painelExec = h("div", { class: "au-painel", id: novoId("exec"), hidden: true });
  if (item) {
    const ab = ui.abas({ itens: [{ id: "regra", rotulo: "Regra", icone: "raio" }, { id: "execucoes", rotulo: "Execuções", icone: "relogio", n: item.execucoes + item.erros || null }],
      ativo: q.aba === "execucoes" ? "execucoes" : "regra", rotulo: "Partes da automação", classe: "au-abas",
      aoMudar: id => mostrarAba(id) });
    raiz.appendChild(ab.el);
  }
  raiz.append(painelRegra, painelExec);

  // ------------------------------------------------ regra: fluxo + lateral
  const blocoQuando = h("section", { class: "au-bloco", dataset: { onde: "quando" }, "aria-labelledby": "au-q-t" });
  const blocoSe = h("section", { class: "au-bloco", dataset: { onde: "se" }, "aria-labelledby": "au-s-t" });
  const blocoEntao = h("section", { class: "au-bloco", dataset: { onde: "entao" }, "aria-labelledby": "au-e-t" });
  const fluxo = h("div", { class: "au-fluxo" }, blocoQuando, blocoSe, blocoEntao);

  const frase = h("p", { class: "au-frase", "aria-live": "polite" });
  const estado = h("p", { class: "au-estado" });
  const avisos = h("div", { class: "au-avisos" });
  const chips = h("div", { class: "au-vars-lista" }, L.VARIAVEIS.map(([k, rot]) => {
    const b = h("button", { type: "button", class: "au-var", title: rot, disabled: !podeEditar }, `{${k}}`);
    b.addEventListener("mousedown", ev => ev.preventDefault());       // não rouba o foco do campo
    b.addEventListener("click", () => inserirVariavel(`{${k}}`));
    return b;
  }));
  const lado = h("aside", { class: "au-lado", "aria-label": "Resumo da automação" },
    h("div", { class: "cartao au-previa" },
      h("p", { class: "rotulo" }, "Em uma frase"), frase, estado, avisos),
    h("div", { class: "cartao au-vars" },
      h("p", { class: "rotulo" }, "Variáveis"),
      h("p", { class: "sub" }, "Toque para inserir no texto em edição. Na hora de rodar, viram os dados do contato."),
      chips));
  painelRegra.appendChild(h("div", { class: "au-ed-grade" }, fluxo, lado));

  // ------------------------------------------------ Quando
  function pintarQuando() {
    ui.limpar(blocoQuando);
    const g = L.GATILHO[auto.gatilho];
    const grupos = [];
    for (const gt of L.GATILHOS) {
      let grp = grupos.find(x => x.grupo === gt.grupo);
      if (!grp) grupos.push(grp = { grupo: gt.grupo, opcoes: [] });
      grp.opcoes.push({ valor: gt.id, rotulo: L.rotuloGatilho(gt.id, vv) });
    }
    const sel = seletor(ui, { rotulo: "Gatilho", valor: auto.gatilho, opcoes: grupos, desabilitado: !podeEditar, classe: "au-sel-gat",
      aoMudar: v => { Object.assign(auto, L.trocarGatilho(auto, v)); pintarQuando(); mudou(); } });
    const campos = h("div", { class: "au-campos" }, (g ? g.campos : []).map(f => campoConfig(f)));
    const dica = dicaGatilho(auto.gatilho);
    blocoQuando.append(
      noFluxo("raio", "1"),
      h("div", { class: "cartao au-bloco-corpo" },
        h("div", { class: "au-bloco-cab" },
          h("p", { class: "rotulo" }, "Quando"),
          h("h2", { class: "au-bloco-tit", id: "au-q-t" }, "O que dispara a automação")),
        sel, campos,
        dica ? h("p", { class: "au-dica" }, ui.icone("info"), dica) : null,
        h("p", { class: "au-bloco-erro", role: "alert", hidden: true })));
  }

  function dicaGatilho(id) {
    switch (id) {
      case "antes_da_data": return `Usa a data e a hora marcadas na ${vv.min ? vv.min("negocio") : "oportunidade"} (${L.palavraConsulta(vertical)}). Remarcou? O lembrete sai de novo para a data nova — a mesma data nunca duas vezes.`;
      case "sem_resposta": return "Conta a partir da última mensagem do cliente. Avisa uma vez por espera; se o cliente escrever de novo, conta outra vez.";
      case "tempo_no_estagio": return "Avisa uma vez cada vez que o negócio entra na etapa e passa do tempo.";
      case "tarefa_vencida": return "Olha as tarefas não concluídas que venceram (até 7 dias atrás).";
      case "mensagem_recebida": return "Mensagens do cliente. Notas internas e avisos do sistema não contam.";
      case "negocio_estagio": return "Vale quando o negócio muda para a etapa e também quando já nasce nela.";
      default: return null;
    }
  }

  function campoConfig(f) {
    const v = auto.config[f.nome];
    const set = val => { if (val === "" || val === null || val === undefined) delete auto.config[f.nome]; else auto.config[f.nome] = val; mudou(); };
    const opc = f.opcional ? "Qualquer um" : undefined;
    switch (f.tipo) {
      case "canal": case "departamento": case "funil": case "etiqueta": {
        const vazioTxt = f.opcional ? { canal: "Qualquer número", departamento: "Qualquer departamento", funil: "Qualquer funil", etiqueta: "Escolha" }[f.tipo] : "Escolha…";
        const op = opcoesBase(dados, f.tipo);
        return seletor(ui, { rotulo: f.rotulo, valor: v, opcoes: op, vazio: vazioTxt, desabilitado: !podeEditar, obrigatorio: f.obrigatorio,
          ajuda: !op.length ? semOpcoes(f.tipo) : null, aoMudar: x => set(x || null) });
      }
      case "estagio":
        return seletor(ui, { rotulo: f.rotulo, valor: v, opcoes: opcoesBase(dados, "estagio"), vazio: "Escolha a etapa…", desabilitado: !podeEditar,
          obrigatorio: true, aoMudar: x => set(x || null) });
      case "numero":
        return entrada(ui, { rotulo: f.rotulo, valor: v ?? "", tipo: "number", min: f.min, max: f.max, passo: 1, sufixo: f.sufixo, desabilitado: !podeEditar,
          obrigatorio: f.obrigatorio, ajuda: `De ${f.min} a ${f.max}.`, aoMudar: x => set(x === "" ? null : Number(x)) });
      case "palavras":
        return entrada(ui, { rotulo: f.rotulo, valor: (v || []).join(", "), placeholder: "preço, valor, quanto custa", ajuda: f.ajuda, desabilitado: !podeEditar,
          aoMudar: x => set(x.split(",").map(s => s.trim()).filter(Boolean)) });
      case "sim_nao": {
        const sw = interruptor(ui, { ligado: v === undefined ? !!f.padrao : !!v, rotulo: f.rotulo, desabilitado: !podeEditar, aoMudar: x => set(x) });
        return h("div", { class: "campo au-campo-sw" }, h("span", { class: "au-campo-sw-rot" }, f.rotulo), sw);
      }
      case "campo_data":
        return seletor(ui, { rotulo: f.rotulo, valor: v || "consulta", desabilitado: !podeEditar,
          opcoes: [{ valor: "consulta", rotulo: L.rotuloCampoData("consulta", vertical) }, { valor: "previsao_fechamento", rotulo: L.rotuloCampoData("previsao_fechamento", vertical) }],
          aoMudar: x => set(x) });
      default: void opc; return null;
    }
  }

  function semOpcoes(tipo) {
    return { canal: "Nenhum número de WhatsApp cadastrado ainda.", departamento: "Nenhum departamento cadastrado.", funil: "Nenhum funil cadastrado.",
      etiqueta: "Nenhuma etiqueta criada ainda — crie em Configurações → Etiquetas.", pessoa: "Ninguém da equipe com acesso ainda." }[tipo] || null;
  }

  // ------------------------------------------------ Se (condições)
  function pintarSe() {
    ui.limpar(blocoSe);
    const lista = h("ol", { class: "au-conds", role: "list" });
    auto.condicoes.forEach((cd, i) => lista.appendChild(linhaCondicao(cd, i)));
    const btMais = podeEditar ? h("button", { type: "button", class: "bt bt-sec bt-p au-mais", disabled: auto.condicoes.length >= L.LIMITES.condicoes },
      ui.icone("mais"), "Condição") : null;
    if (btMais) btMais.addEventListener("click", () => {
      auto.condicoes.push({ campo: "origem", op: "igual", valor: "" });
      pintarSe(); mudou();
      const sel = blocoSe.querySelectorAll(".au-cond select");
      if (sel.length) sel[sel.length - 3 >= 0 ? sel.length - 3 : 0].focus();
    });
    blocoSe.append(
      noFluxo("filtro", "2"),
      h("div", { class: "cartao au-bloco-corpo" },
        h("div", { class: "au-bloco-cab" },
          h("p", { class: "rotulo" }, "Se · opcional"),
          h("h2", { class: "au-bloco-tit", id: "au-s-t" }, auto.condicoes.length ? "Só se tudo isto valer" : "Sem condições: roda sempre")),
        auto.condicoes.length ? lista : h("p", { class: "sub au-sem" }, "Acrescente condições para filtrar, por exemplo: só quem veio de anúncio, ou valor acima de R$ 1.000."),
        btMais,
        h("p", { class: "au-bloco-erro", role: "alert", hidden: true })));
  }

  function linhaCondicao(cd, i) {
    const tipo = L.tipoValorCondicao(cd.campo);
    const ops = L.operadoresDe(cd.campo).map(o => ({ valor: o, rotulo: L.rotuloOperador(o) }));
    const selCampo = seletor(ui, { rotulo: "Campo", valor: cd.campo, opcoes: L.camposCondicao(dados.base), desabilitado: !podeEditar, classe: "au-cond-campo",
      aoMudar: v => { cd.campo = v; cd.op = L.operadoresDe(v)[0]; cd.valor = ""; pintarSe(); mudou(); } });
    const selOp = seletor(ui, { rotulo: "Comparação", valor: cd.op, opcoes: ops, desabilitado: !podeEditar, classe: "au-cond-op",
      aoMudar: v => { cd.op = v; if (L.operadorSemValor(v)) delete cd.valor; pintarSe(); mudou(); } });
    let ctlValor = null;
    if (!L.operadorSemValor(cd.op)) {
      const set = v => { cd.valor = v; mudou(); };
      const mapa = { funil: "funil", estagio: "estagio", canal: "canal", departamento: "departamento", etiqueta: "etiqueta", pessoa: "pessoa" };
      if (tipo === "origem") ctlValor = seletor(ui, { rotulo: "Valor", valor: cd.valor, vazio: "Escolha…", opcoes: L.ORIGENS.map(([k, r]) => ({ valor: k, rotulo: r })), desabilitado: !podeEditar, aoMudar: set, classe: "au-cond-val" });
      else if (mapa[tipo]) ctlValor = seletor(ui, { rotulo: "Valor", valor: cd.valor, vazio: "Escolha…", opcoes: opcoesBase(dados, mapa[tipo]), desabilitado: !podeEditar, aoMudar: set, classe: "au-cond-val" });
      else if (tipo === "numero") ctlValor = entrada(ui, { rotulo: "Valor (R$)", valor: cd.valor ?? "", tipo: "number", min: 0, passo: "0.01", desabilitado: !podeEditar, aoMudar: set });
      else ctlValor = entrada(ui, { rotulo: "Valor", valor: cd.valor ?? "", max: 200, desabilitado: !podeEditar, aoMudar: set, placeholder: tipo === "texto" ? "ex.: implante" : "" });
      ctlValor.classList.add("au-cond-val");
    }
    const btX = podeEditar ? h("button", { type: "button", class: "bt-icone au-x", "aria-label": `Tirar a condição ${i + 1}` }, ui.icone("fechar")) : null;
    if (btX) btX.addEventListener("click", () => { auto.condicoes.splice(i, 1); pintarSe(); mudou(); });
    return h("li", { class: "au-cond" },
      h("span", { class: "au-cond-e", "aria-hidden": "true" }, i === 0 ? "se" : "e"),
      selCampo, selOp, ctlValor || h("span", { class: "au-cond-vazio" }), btX);
  }

  // ------------------------------------------------ Então (ações)
  let arrastando = null;
  function pintarEntao() {
    ui.limpar(blocoEntao);
    const lista = h("ol", { class: "au-acoes", role: "list" });
    auto.acoes.forEach((ac, i) => lista.appendChild(cartaoAcao(ac, i)));
    const btMais = podeEditar ? h("button", { type: "button", class: "bt bt-sec bt-p au-mais", "aria-haspopup": "menu",
      disabled: auto.acoes.length >= L.LIMITES.acoes }, ui.icone("mais"), "Ação") : null;
    if (btMais) btMais.addEventListener("click", () => ui.menu(btMais, L.ACOES.filter(a => a.disponivel !== false).map(a => ({
      rotulo: L.rotuloAcao(a.id, vv), icone: a.icone,
      fn: () => {
        auto.acoes.push(L.novaAcao(a.id));
        pintarEntao(); mudou();
        const cards = blocoEntao.querySelectorAll(".au-acao");
        const ult = cards[cards.length - 1];
        if (ult) { ult.scrollIntoView({ block: "nearest", behavior: "smooth" }); const f = ult.querySelector("input,select,textarea"); if (f) f.focus({ preventScroll: true }); }
      },
    }))));
    const temMensagem = L.enviaMensagem(auto);
    const swHorario = interruptor(ui, { ligado: !!auto.respeitar_horario, rotulo: "Respeitar horário de funcionamento", desabilitado: !podeEditar,
      aoMudar: v => { auto.respeitar_horario = v; mudou(); } });
    blocoEntao.append(
      noFluxo("check", "3"),
      h("div", { class: "cartao au-bloco-corpo" },
        h("div", { class: "au-bloco-cab" },
          h("p", { class: "rotulo" }, "Então"),
          h("h2", { class: "au-bloco-tit", id: "au-e-t" }, auto.acoes.length ? "Faça, nesta ordem" : "O que fazer")),
        auto.acoes.length ? lista : h("p", { class: "sub au-sem" }, "Acrescente pelo menos uma ação: criar tarefa, avisar a equipe, pôr etiqueta, enviar mensagem…"),
        btMais,
        h("div", { class: ["au-horario", !temMensagem && "au-apagado"] },
          h("div", null,
            h("p", { class: "au-horario-tit" }, "Respeitar horário de funcionamento"),
            h("p", { class: "sub" }, temMensagem ? "Mensagens fora do horário do departamento esperam a próxima abertura." : "Vale para ações que mandam mensagem.")),
          swHorario),
        h("p", { class: "au-bloco-erro", role: "alert", hidden: true })));
  }

  function cartaoAcao(ac, i) {
    const def = L.ACAO[ac.tipo];
    const n = auto.acoes.length;
    const corpo = h("div", { class: "au-acao-corpo" }, (def ? def.campos : []).filter(f => !f.quando || Object.entries(f.quando).every(([k, v]) => ac[k] === v))
      .filter(f => f.tipo !== "parametros").map(f => campoAcao(ac, f, i)));
    const alca = podeEditar ? h("span", { class: "au-alca", title: "Arraste para reordenar", "aria-hidden": "true" }, ui.icone("arrastar")) : null;
    const btSobe = podeEditar ? h("button", { type: "button", class: "bt-icone", "aria-label": `Subir a ação ${i + 1}`, disabled: i === 0 }, ui.icone("seta-baixo", "au-gira")) : null;
    const btDesce = podeEditar ? h("button", { type: "button", class: "bt-icone", "aria-label": `Descer a ação ${i + 1}`, disabled: i === n - 1 }, ui.icone("seta-baixo")) : null;
    const btX = podeEditar ? h("button", { type: "button", class: "bt-icone au-x", "aria-label": `Tirar a ação ${i + 1}` }, ui.icone("lixeira")) : null;
    const mover = para => { auto.acoes = L.mover(auto.acoes, i, para); pintarEntao(); mudou();
      const b = blocoEntao.querySelectorAll(".au-acao")[para]; if (b) { const alvo = b.querySelector(para < i ? "[aria-label^='Subir']" : "[aria-label^='Descer']"); (alvo && !alvo.disabled ? alvo : b.querySelector("button")).focus(); } };
    if (btSobe) btSobe.addEventListener("click", () => mover(i - 1));
    if (btDesce) btDesce.addEventListener("click", () => mover(i + 1));
    if (btX) btX.addEventListener("click", () => { auto.acoes.splice(i, 1); pintarEntao(); mudou(); });
    const li = h("li", { class: "au-acao", dataset: { i: String(i) } },
      h("div", { class: "au-acao-cab" },
        alca,
        h("span", { class: "au-acao-n", "aria-hidden": "true" }, String(i + 1)),
        h("span", { class: "au-acao-ic", "aria-hidden": "true" }, ui.icone(def ? def.icone : "raio")),
        h("h3", { class: "au-acao-tit" }, h("span", { class: "sr-only" }, `Ação ${i + 1}: `), L.rotuloAcao(ac.tipo, vv)),
        h("span", { class: "au-acao-bts" }, btSobe, btDesce, btX)),
      corpo);
    if (ac.tipo === "enviar_template") corpo.appendChild(editorModelo(ac));
    // arrastar para reordenar (a alça liga o draggable; teclado usa ↑ ↓)
    if (alca) {
      alca.addEventListener("pointerdown", () => { li.draggable = true; });
      li.addEventListener("dragstart", ev => { arrastando = i; li.classList.add("au-arrastando"); try { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", String(i)); } catch { /* ok */ } });
      li.addEventListener("dragend", () => { li.draggable = false; li.classList.remove("au-arrastando"); arrastando = null;
        blocoEntao.querySelectorAll(".au-alvo").forEach(x => x.classList.remove("au-alvo")); });
    }
    li.addEventListener("dragover", ev => { if (arrastando === null || arrastando === i) return; ev.preventDefault(); li.classList.add("au-alvo"); });
    li.addEventListener("dragleave", () => li.classList.remove("au-alvo"));
    li.addEventListener("drop", ev => { ev.preventDefault(); if (arrastando === null || arrastando === i) return;
      auto.acoes = L.mover(auto.acoes, arrastando, i); arrastando = null; pintarEntao(); mudou(); });
    return li;
  }

  function campoAcao(ac, f, i) {
    const v = ac[f.nome];
    const set = val => { if (val === "" || val === null || val === undefined) delete ac[f.nome]; else ac[f.nome] = val; mudou(); };
    const dis = !podeEditar;
    switch (f.tipo) {
      case "texto":
        return entrada(ui, { rotulo: f.rotulo, valor: v ?? "", max: f.max, variaveis: f.variaveis, desabilitado: dis, obrigatorio: f.obrigatorio,
          aoMudar: x => { ac[f.nome] = x; mudou(); } });
      case "texto_longo":
        return entrada(ui, { rotulo: f.rotulo, valor: v ?? "", tipo: "textarea", max: f.max, variaveis: f.variaveis, desabilitado: dis, ajuda: f.ajuda,
          obrigatorio: f.obrigatorio, aoMudar: x => { ac[f.nome] = x; mudou(); } });
      case "numero":
        return entrada(ui, { rotulo: f.rotulo, valor: v ?? "", tipo: "number", min: f.min, max: f.max, passo: 1, sufixo: f.sufixo, desabilitado: dis,
          aoMudar: x => set(x === "" ? null : Number(x)) });
      case "opcoes":
        return seletor(ui, { rotulo: f.rotulo, valor: v ?? f.padrao, opcoes: f.opcoes.map(([k, r]) => ({ valor: k, rotulo: r })), desabilitado: dis, aoMudar: set });
      case "estagio": {
        const funil = ac.tipo === "criar_negocio" ? ac.funil_id : null;
        return seletor(ui, { rotulo: f.rotulo, valor: v, opcoes: opcoesBase(dados, "estagio", { funil }), vazio: f.opcional ? "Primeira etapa do funil" : "Escolha a etapa…",
          desabilitado: dis, obrigatorio: f.obrigatorio, aoMudar: x => set(x || null) });
      }
      case "funil":
        return seletor(ui, { rotulo: f.rotulo, valor: v, opcoes: opcoesBase(dados, "funil"), vazio: "Funil padrão", desabilitado: dis,
          aoMudar: x => { set(x || null); if (ac.tipo === "criar_negocio") { delete ac.estagio_id; pintarEntao(); } } });
      case "etiqueta": {
        const op = opcoesBase(dados, "etiqueta");
        if (!v && ac.etiqueta_nome) op.unshift({ valor: "__nova", rotulo: `Criar a etiqueta «${ac.etiqueta_nome}» ao salvar` });
        return seletor(ui, { rotulo: f.rotulo, valor: v || (ac.etiqueta_nome ? "__nova" : ""), opcoes: op, vazio: "Escolha a etiqueta…", desabilitado: dis,
          obrigatorio: true, ajuda: !op.length ? semOpcoes("etiqueta") : null,
          aoMudar: x => { if (x === "__nova") { delete ac.etiqueta_id; } else { delete ac.etiqueta_nome; set(x || null); } mudou(); } });
      }
      case "pessoa":
        return seletor(ui, { rotulo: f.rotulo, valor: v, opcoes: opcoesBase(dados, "pessoa"), vazio: "Escolha a pessoa…", desabilitado: dis, obrigatorio: true,
          ajuda: !opcoesBase(dados, "pessoa").length ? semOpcoes("pessoa") : null, aoMudar: x => set(x || null) });
      case "dono":
        return seletor(ui, { rotulo: f.rotulo, valor: v ?? "responsavel", desabilitado: dis, aoMudar: set, opcoes: [
          { valor: "responsavel", rotulo: `Responsável pel${vv.art ? vv.art("negocio") : "o"} ${vv.min ? vv.min("negocio") : "negócio"}` },
          { valor: "atendente", rotulo: "Quem atende a conversa" },
          ...(opcoesBase(dados, "pessoa").length ? [{ grupo: "Uma pessoa", opcoes: opcoesBase(dados, "pessoa") }] : [])] });
      case "para":
        return seletor(ui, { rotulo: f.rotulo, valor: v ?? "responsavel", desabilitado: dis, aoMudar: set, opcoes: [
          { valor: "responsavel", rotulo: "O responsável (ou os administradores, se não houver)" },
          { valor: "admins", rotulo: "Administradores e supervisores" },
          ...(opcoesBase(dados, "pessoa").length ? [{ grupo: "Uma pessoa", opcoes: opcoesBase(dados, "pessoa") }] : [])] });
      case "departamento":
        return seletor(ui, { rotulo: f.rotulo, valor: v, opcoes: opcoesBase(dados, "departamento"), vazio: "Manter o departamento", desabilitado: dis, aoMudar: x => set(x || null) });
      case "sim_nao": {
        const sw = interruptor(ui, { ligado: !!v, rotulo: f.rotulo, desabilitado: dis, aoMudar: x => set(x || null) });
        return h("div", { class: "campo au-campo-sw" }, h("span", { class: "au-campo-sw-rot" }, f.rotulo), sw);
      }
      case "alvo_etiqueta":
        return seletor(ui, { rotulo: f.rotulo, valor: v ?? "contato", desabilitado: dis, aoMudar: set,
          opcoes: [{ valor: "contato", rotulo: `No ${vv.min ? vv.min("contato") : "contato"}` }, { valor: "conversa", rotulo: "Na conversa" }] });
      case "modo_atribuir":
        return seletor(ui, { rotulo: f.rotulo, valor: v ?? "rodizio", desabilitado: dis,
          aoMudar: x => { ac.modo = x; if (x !== "conta") delete ac.conta_id; pintarEntao(); mudou(); },
          opcoes: [{ valor: "rodizio", rotulo: "Rodízio do departamento" }, { valor: "conta", rotulo: "Uma pessoa" }] });
      case "template": return null;             // desenhado por editorModelo
      default: return null;
    }
  }

  /** Escolha do modelo aprovado na Meta + parâmetros com variáveis + prévia. */
  function editorModelo(ac) {
    const todos = dados.base.templates || [];
    const aprovados = todos.filter(t => String(t.status || "").toUpperCase() === "APPROVED");
    const box = h("div", { class: "au-tpl" });
    const canal = id => (dados.base.canais || []).find(c => c.id === id);
    if (!aprovados.length) {
      const sugerido = L.textoModeloLembrete(vertical);
      const btCopiar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("copiar"), "Copiar texto sugerido");
      btCopiar.addEventListener("click", () => ui.copiar(sugerido, { aviso: "Texto copiado. Cole no Gerenciador do WhatsApp da Meta." }));
      box.append(h("div", { class: "aviso aviso-aten au-tpl-aviso" }, ui.icone("alerta"),
        h("div", { class: "pilha-p" },
          h("p", null, todos.length ? "Nenhum modelo deste número foi aprovado pela Meta ainda." : "Ainda não há modelos da Meta sincronizados para este cliente."),
          h("p", null, "Crie e aprove na Meta um modelo de categoria Utilidade, por exemplo:"),
          h("blockquote", { class: "au-tpl-sugerido" }, sugerido),
          h("p", { class: "sub" }, "Depois, em Configurações → Números de WhatsApp, use «Sincronizar modelos». Enquanto isso, você pode salvar esta automação desligada."),
          h("div", { class: "linha" }, btCopiar))));
      if (ac.template_nome) box.appendChild(h("p", { class: "sub" }, `Modelo esperado: «${ac.template_nome}».`));
      return box;
    }
    const opcoes = todos.map(t => {
      const ok = String(t.status || "").toUpperCase() === "APPROVED";
      const c = canal(t.canal_id);
      return { valor: t.id, rotulo: `${t.nome} · ${t.idioma}${t.categoria ? ` · ${rotuloCategoria(t.categoria)}` : ""}${c ? ` · ${c.nome}` : ""}${ok ? "" : " · aguardando aprovação"}`, desabilitado: !ok };
    });
    box.appendChild(seletor(ui, { rotulo: "Modelo aprovado na Meta", valor: ac.template_id, opcoes, vazio: ac.template_nome ? `Escolha (sugerido: ${ac.template_nome})` : "Escolha o modelo…",
      desabilitado: !podeEditar, obrigatorio: true,
      aoMudar: x => {
        ac.template_id = x || undefined; if (!x) delete ac.template_id;
        const t = todos.find(y => y.id === x);
        const np = t ? Number(t.num_parametros) || 0 : 0;
        const pars = (ac.parametros || []).slice(0, np); while (pars.length < np) pars.push("");
        ac.parametros = pars;
        pintarEntao(); mudou();
      } }));
    const t = todos.find(y => y.id === ac.template_id);
    if (!t) return box;
    if (String(t.categoria || "").toUpperCase() === "MARKETING") box.appendChild(h("p", { class: "au-dica" }, ui.icone("info"),
      "Modelo de marketing: não sai para quem pediu para não receber (SAIR/PARAR)."));
    const np = Number(t.num_parametros) || 0;
    const pars = ac.parametros || (ac.parametros = []);
    while (pars.length < np) pars.push("");
    const prev = h("p", { class: "au-tpl-prev-txt" });
    const pintarPrev = () => { prev.textContent = L.previaModelo(t.corpo || "", pars, exemplo); };
    if (np) box.appendChild(h("div", { class: "au-tpl-pars" }, Array.from({ length: np }, (_, k) =>
      entrada(ui, { rotulo: `Parâmetro {{${k + 1}}}`, valor: pars[k] ?? "", variaveis: true, max: 200, desabilitado: !podeEditar, obrigatorio: true,
        placeholder: "{primeiro_nome}", aoMudar: x => { pars[k] = x; pintarPrev(); mudou(); } }))));
    pintarPrev();
    box.appendChild(h("div", { class: "au-tpl-prev" },
      h("p", { class: "rotulo" }, "Prévia com um exemplo"),
      h("div", { class: "au-bolha" }, prev)));
    return box;
  }

  function rotuloCategoria(c) {
    return { UTILITY: "Utilidade", MARKETING: "Marketing", AUTHENTICATION: "Autenticação" }[String(c).toUpperCase()] || c;
  }

  function noFluxo(icone, n) {
    return h("div", { class: "au-no", "aria-hidden": "true", dataset: { n } }, h("span", { class: "au-no-bola" }, ui.icone(icone)));
  }

  // ------------------------------------------------ variáveis nos textos
  raiz.addEventListener("focusin", ev => {
    const t = ev.target;
    if (t && t.dataset && t.dataset.variaveis === "1") ultimoTexto = t;
  });
  function inserirVariavel(tok) {
    const t = ultimoTexto && ultimoTexto.isConnected ? ultimoTexto : blocoEntao.querySelector("[data-variaveis='1']");
    if (!t || t.disabled) { ui.toast("Clique num texto de uma ação e depois na variável.", { tipo: "info" }); return; }
    const ini = t.selectionStart ?? t.value.length, fim = t.selectionEnd ?? t.value.length;
    t.value = t.value.slice(0, ini) + tok + t.value.slice(fim);
    try { t.setSelectionRange(ini + tok.length, ini + tok.length); } catch { /* ok */ }
    t.focus();
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ------------------------------------------------ prévia, avisos e validação ao vivo
  function atualizarPrevia() {
    frase.textContent = L.descrever(auto, dados.base, vv);
    const r = L.validar(auto, { base: dados.base, ligar: !!auto.ativo });
    ui.limpar(estado);
    estado.className = ["au-estado", r.ok ? "au-ok" : "au-falta"].join(" ");
    estado.append(ui.icone(r.ok ? "check" : "alerta"), h("span", null, r.ok
      ? (auto.ativo ? "Pronta. Ao salvar, começa a rodar em até 15 segundos." : "Pronta. Vai ficar salva e desligada.")
      : `Falta: ${r.motivo}.`));
    ui.limpar(avisos);
    const bloqs = [];
    if (L.enviaMensagem(auto)) bloqs.push("Mensagens saem pelo WhatsApp oficial: texto livre só dentro de 24 h da última mensagem do cliente; fora disso, só modelo aprovado.");
    if (L.faltaModelo(auto)) bloqs.push("Sem modelo aprovado escolhido: dá para salvar desligada e ligar quando a Meta aprovar.");
    if (auto.gatilho === "antes_da_data" && auto.acoes.some(a => a.tipo === "enviar_template" && (a.parametros || []).some(p => /\{hora_consulta\}/.test(p))))
      bloqs.push(`Quem tiver só a data (sem a hora) da ${L.palavraConsulta(vertical)} aparece nas execuções como erro, para ninguém receber mensagem com buraco.`);
    for (const t of bloqs) avisos.appendChild(h("p", { class: "au-aviso-lat" }, ui.icone("info"), h("span", null, t)));
    // erro marcado num bloco some quando o bloco fica válido
    for (const b of [blocoQuando, blocoSe, blocoEntao]) {
      const e = b.querySelector(".au-bloco-erro");
      if (e && !e.hidden && (r.ok || r.onde !== b.dataset.onde)) { e.hidden = true; b.classList.remove("au-bloco-com-erro"); }
    }
  }
  function mudou() {
    atualizarPrevia();
  }
  function mostrarErro(r) {
    const onde = r.onde === "nome" ? null : { quando: blocoQuando, se: blocoSe, entao: blocoEntao }[r.onde];
    if (!onde) {
      inpNome.setAttribute("aria-invalid", "true");
      inpNome.focus();
      ui.toast(`Falta: ${r.motivo}.`, { tipo: "erro" });
      inpNome.addEventListener("input", () => inpNome.removeAttribute("aria-invalid"), { once: true });
      return;
    }
    const e = onde.querySelector(".au-bloco-erro");
    e.textContent = `Falta: ${r.motivo}.`;
    e.hidden = false;
    onde.classList.add("au-bloco-com-erro");
    onde.scrollIntoView({ block: "center", behavior: "smooth" });
    let alvo = null;
    if (r.onde === "entao" && r.indice != null) alvo = onde.querySelectorAll(".au-acao")[r.indice];
    if (r.onde === "se" && r.indice != null) alvo = onde.querySelectorAll(".au-cond")[r.indice];
    const f = (alvo || onde).querySelector("select:not(:disabled), input:not(:disabled), textarea:not(:disabled)");
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 250);
  }

  // ------------------------------------------------ salvar
  let salvando = false;
  const salvar = botao => {
    if (salvando) return;
    const r = L.validar(auto, { base: dados.base, ligar: !!auto.ativo });
    if (!r.ok) { mostrarErro(r); return; }
    salvando = true;
    const p = (async () => {
      const salvo = await ctx.api.rpcC("nx_automacao_salvar", { p_auto: L.limpar(auto) });
      salvoJson = JSON.stringify(L.limpar(salvo));
      ui.toast(salvo.ativo ? `«${salvo.nome}» salva e ligada.` : `«${salvo.nome}» salva (desligada).`, { tipo: "ok" });
      ctx.navegar("#/automacoes");
    })();
    ui.carregando(botao, p).finally(() => { salvando = false; }).catch(e => {
      const msg = ctx.api.mensagemErro(e);
      if (e && e.codigo === "automacao_invalida" && e.hint) {
        const onde = /«Quando»/.test(e.hint) ? "quando" : /^condiç/.test(e.hint) ? "se" : /^ação|«Então»/.test(e.hint) ? "entao" : "nome";
        const m = /^(?:ação|condição) (\d+)/.exec(e.hint);
        mostrarErro({ motivo: e.hint, onde, indice: m ? Number(m[1]) - 1 : null });
      } else ui.toast(msg, { tipo: "erro" });
    });
  };
  if (btSalvar) {
    btSalvar.addEventListener("click", () => salvar(btSalvar));
    // no celular o cabeçalho não fica preso no topo: o mesmo "Salvar" também no fim da regra
    const btSalvar2 = h("button", { type: "button", class: "bt bt-prim bt-g" }, ui.icone("check"), item ? "Salvar" : "Criar automação");
    btSalvar2.addEventListener("click", () => salvar(btSalvar2));
    painelRegra.appendChild(h("div", { class: "au-rodape-movel" }, btSalvar2));
  }

  // ------------------------------------------------ execuções
  let execCarregadas = false;
  async function pintarExecucoes() {
    ui.limpar(painelExec);
    painelExec.appendChild(ui.esqueleto("lista", 5));
    try {
      const lista = await ctx.api.rpcC("nx_automacao_execucoes", { p_id: item.id, p_limite: 50 });
      ui.limpar(painelExec);
      const btAtualizar = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("relogio"), "Atualizar");
      btAtualizar.addEventListener("click", () => pintarExecucoes());
      painelExec.appendChild(h("div", { class: "au-ex-cab" },
        h("p", { class: "sub" }, "As últimas 50 execuções. Erro numa automação não atrapalha as outras."),
        btAtualizar));
      if (!lista.length) {
        painelExec.appendChild(ui.vazio({ titulo: "Ainda não rodou", icone: "relogio",
          texto: item.ativo ? "Assim que o gatilho acontecer, cada execução aparece aqui, com o que foi feito." : "Ela está desligada. Ligue para começar a rodar." }));
        return;
      }
      const ul = h("ul", { class: "au-exs", role: "list" });
      for (const x of lista) {
        ul.appendChild(h("li", { class: ["au-ex", !x.ok && "au-ex-erro"] },
          h("span", { class: "au-ex-ic", "aria-hidden": "true" }, ui.icone(x.ok ? "check" : "alerta")),
          h("div", { class: "au-ex-txt" },
            h("p", { class: "au-ex-det" }, h("span", { class: "sr-only" }, x.ok ? "Deu certo: " : "Erro: "), x.detalhe || (x.ok ? "Feito." : "Erro.")),
            h("p", { class: "au-ex-quando mono", title: ui.dataHoraBR(x.criado_em) }, `${ui.dataHoraBR(x.criado_em)} · ${ui.relativo(x.criado_em)}`)),
          x.link ? h("a", { class: "bt bt-fant bt-p au-ex-abrir", href: x.link }, "Abrir", ui.icone("seta-dir")) : null));
      }
      painelExec.appendChild(ul);
      execCarregadas = true;
    } catch (e) {
      ui.limpar(painelExec);
      painelExec.appendChild(ui.erroCartao(e, () => pintarExecucoes()));
    }
  }
  function mostrarAba(id) {
    painelRegra.hidden = id !== "regra";
    painelExec.hidden = id !== "execucoes";
    if (id === "execucoes" && !execCarregadas) pintarExecucoes();
  }

  // ------------------------------------------------ primeira pintura
  pintarQuando(); pintarSe(); pintarEntao(); atualizarPrevia();
  if (salvoJson === null && item) salvoJson = JSON.stringify(L.limpar(auto));
  if (item && q.aba === "execucoes") mostrarAba("execucoes");
  if (!item && podeEditar) setTimeout(() => { if (!auto.nome) inpNome.focus({ preventScroll: true }); }, 60);
}
