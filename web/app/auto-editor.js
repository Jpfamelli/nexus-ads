/* ============================================================
   ÓRBITA — auto-editor.js · frente F7 · editor das Automações (PLANO-NOITE-20261001)
   Carregado por automacoes.js via import() com ?v=. Entrega telaEditor(ctx, raiz, dados, item, amb):
     Quando → Se → Então, com o «Então» como LINHA DO TEMPO (passos, esperas e parar), validação ao vivo,
     «Testar» (nx_auto_simular, sem gravar), «Duplicar» e o histórico de execuções com filtro.
   amb = { L: auto-logica, P: auto-pecas (já com ui), rascunho: {auto, explicacao, avisos}|null,
           duplicar(ctx, auto), limparRascunho(), testarAoAbrir }.
   Regras do app: sem import estático, texto de usuário só por textContent (ui.h), nenhuma cor aqui.
   ============================================================ */

/** plano 1000 · AS-028: o diagrama espera a pessoa parar de digitar por este tempo antes de ser redesenhado. */
export const DIAGRAMA_MS = 150;

export function telaEditor(ctx, raiz, dados, item, amb) {
  const { ui } = ctx;
  const h = ui.h;
  const { L, P } = amb;
  const vv = ctx.vocab;
  const vertical = dados.vertical || (ctx.cliente && ctx.cliente.vertical) || "generico";
  const podeEditar = !!dados.pode_editar;
  const q = ctx.rota.query || {};
  const base = dados.base || {};
  const seletor = P.seletor, entrada = P.entrada, interruptor = P.interruptor, opcoesBase = P.opcoesBase, novoId = P.novoId;
  const iaOff = L.iaDesligada(dados);     // sem a chave da Anthropic: os passos de IA são pulados (avisa, em vez de ligar em silêncio)
  const copia = x => JSON.parse(JSON.stringify(x));

  // ------------------------------------------------ estado
  let auto;
  let origem = "branco";
  let rascunho = null;
  if (item) { auto = copia(item); origem = "salva"; }
  else if (amb.rascunho && amb.rascunho.auto) { rascunho = amb.rascunho; auto = copia(rascunho.auto); origem = "ia"; }
  else if (q.modelo && L.MODELOS.some(m => m.id === q.modelo)) {
    auto = L.aplicarModelo(q.modelo, base, vv);
    // receitas que mandam mensagem ao cliente ou gastam cota de IA nascem desligadas: a pessoa confere e liga
    auto.ativo = !L.faltaModelo(auto) && !L.enviaMensagem(auto) && !L.temIA(auto) && L.validar(auto, { base, ligar: true }).ok;
    origem = "modelo";
  } else auto = L.novaAutomacao("negocio_estagio");
  auto.condicoes = auto.condicoes || [];
  auto.acoes = auto.acoes || [];
  auto.config = auto.config || {};
  // automações antigas gravaram «modo» em «atribuir» (só a conversa, regra de distribuição do departamento): o editor mostra esse jeito
  // e só passa ao «dono» do contrato novo (que também troca o responsável do negócio) quando a pessoa escolhe outro em «Como»
  const modelo = origem === "modelo" ? L.MODELOS.find(m => m.id === q.modelo) : null;
  let salvoJson = item ? JSON.stringify(L.limpar(auto)) : null;
  const sujo = () => JSON.stringify(L.limpar(auto)) !== salvoJson;
  let ultimoTexto = null;            // último campo com variáveis focado (os chips inserem nele)
  const exemplo = L.exemploVariaveis({ empresa: ctx.cliente ? ctx.cliente.nome : "", atendente: ctx.sessao && ctx.sessao.conta ? ctx.sessao.conta.nome : "Ana" });
  // blocos que já "contam" para a validação ao vivo (um rascunho pronto — receita, IA, automação salva — mostra tudo desde o início)
  const tocado = new Set(origem === "branco" ? [] : ["nome", "quando", "se", "entao"]);
  const frescos = new Set();   // passos recém-adicionados, ainda sem a pessoa ter tido chance de preencher

  ctx.titulo(item ? item.nome : "Nova automação");

  // ------------------------------------------------ cabeçalho
  const nomeId = novoId("nome");
  const inpNome = h("input", { id: nomeId, class: "au-nome-inp", type: "text", maxlength: 80, value: auto.nome || "",
    placeholder: "Nome da automação", disabled: !podeEditar, autocomplete: "off" });
  inpNome.addEventListener("input", () => { auto.nome = inpNome.value; mudou("nome"); });
  // plano 1000 · AS-023: nome igual ao de outra automação avisa (não bloqueia) — na lista e nas execuções as duas ficariam iguais
  const avisoNome = h("p", { class: "au-nome-aviso", id: novoId("nomeav"), role: "status", hidden: true });
  // plano 1000 · AS-052: sem nome, uma sugestão a partir do gatilho e do 1º passo (placeholder + «Usar sugestão»)
  const btSugestao = podeEditar ? h("button", { type: "button", class: "bt bt-fant bt-p au-nome-sug", hidden: true }) : null;
  if (btSugestao) btSugestao.addEventListener("click", () => {
    const s = L.sugestaoNome(auto, base, vv);
    if (!s) return;
    inpNome.value = s; auto.nome = s; mudou("nome");
    inpNome.focus({ preventScroll: true });
  });
  function pintarNome() {
    const s = L.sugestaoNome(auto, base, vv);
    inpNome.placeholder = s ? `Ex.: ${s}` : "Nome da automação";
    if (btSugestao) {
      btSugestao.hidden = !s || !!String(auto.nome || "").trim();
      btSugestao.textContent = s ? `Usar sugestão: «${s}»` : "";
    }
    const rep = L.nomeRepetido(auto.nome, dados.itens || [], item ? item.id : (auto.id || null));
    avisoNome.hidden = !rep;
    avisoNome.textContent = rep ? `Já existe uma automação chamada «${rep.nome}». Dá para salvar, mas um nome diferente ajuda a achar cada uma na lista e nas execuções.` : "";
    if (rep) inpNome.setAttribute("aria-describedby", avisoNome.id); else inpNome.removeAttribute("aria-describedby");
  }
  // plano 1000 · AS-268: mexer no interruptor do topo não liga nada na hora — o texto ao lado diz que vale ao salvar
  let ativoSalvo = !!(item && item.ativo);
  const notaAtivo = h("span", { class: "au-sw-nota", id: novoId("swnota"), role: "status", hidden: true });
  const pintarNotaAtivo = () => {
    const dif = !!auto.ativo !== ativoSalvo;
    notaAtivo.hidden = !dif;
    notaAtivo.textContent = dif ? (auto.ativo ? "Liga ao salvar" : "Desliga ao salvar") : "";
  };
  const swAtivo = interruptor({ ligado: !!auto.ativo, rotulo: "Ligada", mostrarTexto: true, desabilitado: !podeEditar,
    aoMudar: v => { auto.ativo = v; pintarNotaAtivo(); mudou(); } });
  swAtivo.setAttribute("aria-describedby", notaAtivo.id);
  const btSalvar = podeEditar ? h("button", { type: "button", class: "bt bt-prim" }, ui.icone("check"), item ? "Salvar" : "Criar automação") : null;
  const btCancelar = h("button", { type: "button", class: "bt bt-sec" }, podeEditar ? "Cancelar" : "Voltar");
  const btTestar = podeEditar ? h("button", { type: "button", class: "bt bt-sec au-ed-largo", title: "Veja o que aconteceria agora, sem enviar nada" }, ui.icone("olho"), "Testar") : null;
  // plano 1000 · AS-005: no limite do plano a cópia seria recusada — o botão já nasce desabilitado com o motivo
  const lim = dados.limite || {};
  const noLimite = lim.limite != null && lim.usadas >= lim.limite;
  const btDuplicar = podeEditar && item ? h("button", { type: "button", class: "bt bt-fant au-ed-largo", disabled: noLimite,
    title: noLimite ? `Seu plano permite até ${lim.limite} automações.` : "Cria uma cópia desligada" }, ui.icone("copiar"), h("span", null, "Duplicar")) : null;
  /** plano 1000 · AS-049: com edição não salva, a cópia sai do que está NA TELA — o rótulo diz isso. */
  const rotuloDuplicar = () => (noLimite ? `Duplicar (o plano permite até ${lim.limite})` : salvoJson !== null && sujo() ? "Duplicar como está na tela" : "Duplicar");
  function pintarDuplicar() {
    if (!btDuplicar || noLimite) return;
    const editado = salvoJson !== null && sujo();
    btDuplicar.lastChild.textContent = editado ? "Duplicar como está na tela" : "Duplicar";
    btDuplicar.title = editado ? "Cria uma cópia desligada com as mudanças que ainda não foram salvas" : "Cria uma cópia desligada";
  }
  btCancelar.classList.add("au-ed-largo");
  if (btSalvar) btSalvar.classList.add("au-ed-largo");
  // plano 1000 · AS-051: salvar sem sair do editor (para testar de novo); a automação nova ganha o id no endereço
  const btSalvarSeguir = podeEditar ? h("button", { type: "button", class: "bt bt-sec au-ed-largo au-salvar-seguir", title: "Salva e continua neste editor" },
    "Salvar e continuar") : null;
  /** Há edição que ainda não foi salva (a mesma régua do «Cancelar», da atualização automática e do rascunho). */
  // plano 1000 · AS-050: receita aberta e não mexida não é «pendência» (voltar não pergunta); a montagem da IA é (a cota já foi gasta)
  const inicialJson = JSON.stringify(L.limpar(auto));
  const novaPendente = () => !!(auto.nome || auto.acoes.length) && (origem === "ia" || JSON.stringify(L.limpar(auto)) !== inicialJson);
  const temPendencia = () => podeEditar && (salvoJson !== null ? sujo() : novaPendente());

  // ------------------------------------------------ rascunho: o que não foi salvo fica guardado na aba (recarregar, Voltar, menu e paleta não perdem)
  const rasc = podeEditar && amb.rascunhos ? amb.rascunhos : null;
  let idRasc = L.idRascunho({ item, origem, modelo: modelo ? modelo.id : null });     // plano 1000 · AS-267: por origem (a nova salva com «continuar» passa ao id)
  let oferta = null;                 // o aviso «Recuperar rascunho», enquanto a pessoa não escolheu
  let gravouRascunho = false;        // esta tela já escreveu por cima do rascunho guardado
  function guardarRascunho() {
    if (!rasc) return;
    if (temPendencia()) { rasc.guardar(idRasc, auto); gravouRascunho = true; }
    else if (!oferta) rasc.apagar(idRasc);          // voltou ao que estava salvo: nada a recuperar (um rascunho ainda oferecido não é apagado)
  }
  /** Ao salvar ou descartar: o rascunho some. Um rascunho antigo ainda oferecido (e não tocado) continua guardado. */
  function apagarRascunho() { if (rasc && (gravouRascunho || !oferta)) rasc.apagar(idRasc); }

  /** Sair do editor («Cancelar» e o link «‹ Automações»): pergunta antes de perder o que não foi salvo. */
  async function sair() {
    if (podeEditar && salvoJson !== null && sujo()) {
      const ok = await ui.confirmar({ titulo: "Sair sem salvar?", texto: "As mudanças desta automação serão perdidas.", rotulo: "Sair sem salvar", perigo: true });
      if (!ok) return;
    } else if (podeEditar && salvoJson === null && novaPendente()) {
      const ok = await ui.confirmar({ titulo: "Descartar esta automação?", texto: "Ela ainda não foi salva.", rotulo: "Descartar", perigo: true });
      if (!ok) return;
    }
    apagarRascunho();
    if (amb.limparRascunho) amb.limparRascunho();
    ctx.navegar("#/automacoes");
  }
  btCancelar.addEventListener("click", sair);
  if (btDuplicar) btDuplicar.addEventListener("click", () => amb.duplicar(ctx, auto, btDuplicar));
  // plano 1000 · AS-032: fechar a aba/o navegador com edição pendente pergunta (o rascunho da aba não sobrevive a fechar)
  const antesDeSair = ev => { if (!temPendencia()) return; ev.preventDefault(); ev.returnValue = ""; return ""; };
  if (typeof addEventListener === "function" && amb.aoSair) { addEventListener("beforeunload", antesDeSair); amb.aoSair(() => removeEventListener("beforeunload", antesDeSair)); }
  // o link do topo sai pelo mesmo caminho do «Cancelar» (Ctrl/⌘+clique e botão do meio continuam abrindo outra aba)
  const linkVoltar = h("a", { class: "au-voltar", href: "#/automacoes" }, ui.icone("seta-esq"), "Automações");
  linkVoltar.addEventListener("click", ev => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    sair();
  });
  // a atualização automática do app não recarrega a página com edição pendente
  if (typeof ctx.naoAtualizar === "function" && amb.aoSair) amb.aoSair(ctx.naoAtualizar(temPendencia));

  // plano 1000 · AS-031: no celular Testar/Duplicar/Cancelar moram num menu «⋯» e o Salvar só no rodapé (o cabeçalho cabe numa linha)
  const btMaisEd = h("button", { type: "button", class: "bt-icone au-ed-mais", "aria-label": "Mais ações da automação", "aria-haspopup": "menu" }, ui.icone("opcoes"));
  btMaisEd.addEventListener("click", () => ui.menu(btMaisEd, [
    btTestar ? { rotulo: "Testar (sem enviar nada)", icone: "olho", fn: () => testar(btMaisEd) } : null,
    btSalvarSeguir ? { rotulo: "Salvar e continuar aqui", icone: "check", fn: () => salvar(btSalvarSeguir, { continuar: true }) } : null,
    btDuplicar ? { rotulo: rotuloDuplicar(), icone: "copiar", desabilitado: noLimite, fn: () => amb.duplicar(ctx, auto, btDuplicar) } : null,
    { rotulo: podeEditar ? "Cancelar" : "Voltar", icone: "fechar", fn: sair },
  ].filter(Boolean)));
  const rotuloOrigem = item ? "Automação" : origem === "ia" ? "Nova automação · montada pela IA" : modelo ? "Nova automação · a partir de uma receita" : "Nova automação";
  raiz.appendChild(h("header", { class: "au-ed-cab" },
    // título da página para leitor de tela (o nome visível é um campo editável, não um cabeçalho)
    h("h1", { class: "sr-only" }, item ? `Automação: ${item.nome}` : "Nova automação"),
    linkVoltar,
    h("div", { class: "au-ed-linha" },
      h("div", { class: "au-ed-nome" }, h("label", { class: "rotulo", for: nomeId }, rotuloOrigem), inpNome, avisoNome, btSugestao),
      h("div", { class: "linha au-ed-acoes" }, h("span", { class: "au-sw-caixa" }, swAtivo, notaAtivo), btTestar, btDuplicar, btCancelar, btSalvarSeguir, btSalvar, btMaisEd))));
  if (!podeEditar) raiz.appendChild(h("p", { class: "aviso au-aviso-papel" }, ui.icone("cadeado"),
    h("span", null, "Somente leitura: administradores editam automações.")));
  // plano 1000 · AS-269: o erro do servidor ao salvar (limite do plano, sem permissão…) fica aqui até a próxima tentativa — o toast sumia
  const erroSalvar = h("div", { class: "aviso aviso-ruim au-erro-salvar", role: "alert", hidden: true });
  raiz.appendChild(erroSalvar);
  const mostrarErroSalvar = msg => {
    ui.limpar(erroSalvar);
    erroSalvar.hidden = !msg;
    if (!msg) return;
    const d = L.dicaDoErro(msg);
    erroSalvar.append(ui.icone("alerta"), h("div", { class: "pilha-p" }, h("p", null, h("b", null, "Não foi salva. "), msg),
      d ? h("p", { class: "sub" }, d.dica, d.href ? [" ", h("a", { href: d.href }, d.rotulo)] : null) : null));
  };

  // ------------------------------------------------ «Recuperar rascunho»: há edição desta automação que ficou sem salvar nesta aba
  const guardado = rasc ? rasc.ler(idRasc) : null;
  if (guardado && JSON.stringify(L.limpar(guardado.auto)) !== JSON.stringify(L.limpar(auto))) {
    const quandoTxt = guardado.em ? ` (${ui.relativo(new Date(guardado.em).toISOString())})` : "";
    const nomeTxt = !item && guardado.auto.nome ? `: «${String(guardado.auto.nome).slice(0, 80)}»` : "";
    const btRecuperar = h("button", { type: "button", class: "bt bt-prim bt-p" }, ui.icone("reabrir"), "Recuperar rascunho");
    const btDescartar = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Descartar rascunho");
    const fecharOferta = () => {
      const tinhaFoco = oferta && oferta.contains(document.activeElement);
      if (oferta) oferta.remove();
      oferta = null;
      if (tinhaFoco) inpNome.focus({ preventScroll: true });     // o foco não pode cair no <body>
    };
    btRecuperar.addEventListener("click", () => {
      auto = copia(guardado.auto);
      if (item) auto.id = item.id; else delete auto.id;
      auto.condicoes = auto.condicoes || []; auto.acoes = auto.acoes || []; auto.config = auto.config || {};
      inpNome.value = auto.nome || "";
      swAtivo.definir(!!auto.ativo);
      ["nome", "quando", "se", "entao"].forEach(x => tocado.add(x));
      fecharOferta();
      pintarQuando(); pintarSe(); pintarEntao();
      mudou();                                                    // prévia, validação e o rascunho (agora é o que está na tela)
      ui.toast("Rascunho recuperado. Confira e salve.", { tipo: "ok" });
    });
    btDescartar.addEventListener("click", () => { fecharOferta(); if (!gravouRascunho) rasc.apagar(idRasc); });
    oferta = h("div", { class: "aviso aviso-aten au-rasc", role: "status" }, ui.icone("relogio"),
      h("div", { class: "pilha-p" },
        h("p", null, item ? `Há mudanças desta automação que ficaram sem salvar${quandoTxt}.` : `Você deixou uma automação sem salvar${nomeTxt}${quandoTxt}.`),
        h("div", { class: "linha" }, btRecuperar, btDescartar)));
    raiz.appendChild(oferta);
  } else if (guardado && salvoJson !== null) rasc.apagar(idRasc);   // igual ao que está salvo: não é mais rascunho

  // ------------------------------------------------ aviso de "montada pela IA"
  if (rascunho) {
    const avisosIA = [...(rascunho.avisos || [])].filter(Boolean);
    const caixa = h("section", { class: "cartao au-ia-ped", "aria-label": "Sobre a montagem da IA" },
      h("div", { class: "au-ia-ped-cab" },
        h("span", { class: "au-ia-ped-ic", "aria-hidden": "true" }, ui.icone("ia")),
        h("div", { class: "au-ia-ped-tit" },
          h("p", { class: "rotulo" }, "Montada pela IA"),
          h("h2", { class: "titulo-sec" }, "Confira antes de salvar")),
        h("button", { type: "button", class: "bt-icone", "aria-label": "Fechar este aviso", on: { click: () => {
          const tinhaFoco = caixa.contains(document.activeElement);
          caixa.remove();
          btVerIA.hidden = false;
          // o foco não pode cair no <body>: segue para o primeiro controle do que vem depois da caixa
          if (tinhaFoco) { const prox = raiz.querySelector(".au-abas [role=tab][aria-selected=true], .au-nome-inp:not(:disabled), .au-painel select:not(:disabled)"); if (prox) prox.focus({ preventScroll: true }); }
        } } }, ui.icone("fechar"))),
      // plano 100 · G4 [E167]: a conferência do servidor reprovou, mas a montagem (cota já gasta) abre aqui para completar
      rascunho.reprovada ? h("p", { class: "aviso aviso-ruim au-ia-reprovada", role: "alert" }, ui.icone("alerta"),
        h("span", null, `A conferência reprovou esta montagem: ${rascunho.reprovada.motivo}. Complete o que falta abaixo antes de salvar.`)) : null,
      rascunho.explicacao ? h("p", { class: "au-ia-ped-txt" }, rascunho.explicacao) : null,
      avisosIA.length ? h("ul", { class: "au-ia-ped-avisos", role: "list" }, avisosIA.map(t => h("li", null, ui.icone("alerta"), h("span", null, t)))) : null,
      h("p", { class: "sub" }, "Nada foi salvo ainda. Ajuste o que quiser abaixo e toque em «Criar automação». A IA só escolhe entre as etapas, etiquetas e pessoas que já existem no seu sistema."));
    raiz.appendChild(caixa);
    // plano 1000 · AS-231: fechou a caixa? um botão discreto no cabeçalho traz a explicação e os avisos de volta
    const btVerIA = h("button", { type: "button", class: "bt bt-fant bt-p au-ver-ia", hidden: true }, ui.icone("ia"), "Ver o que a IA explicou");
    btVerIA.addEventListener("click", () => {
      const cab = raiz.querySelector(".au-ed-cab");
      raiz.insertBefore(caixa, cab ? cab.nextSibling : raiz.firstChild);
      btVerIA.hidden = true;
      const f = caixa.querySelector("button"); if (f) f.focus({ preventScroll: true });
    });
    const nomeCx = raiz.querySelector(".au-ed-nome");
    if (nomeCx) nomeCx.appendChild(btVerIA);
  }

  // ------------------------------------------------ abas (regra | execuções)
  const painelRegra = h("div", { class: "au-painel", id: novoId("regra") });
  const painelExec = h("div", { class: "au-painel", id: novoId("exec"), hidden: true });
  if (item) {
    const ab = ui.abas({ itens: [{ id: "regra", rotulo: "Regra", icone: "raio", painel: painelRegra }, { id: "execucoes", rotulo: "Execuções", icone: "relogio", n: item.execucoes + item.erros || null, painel: painelExec }],
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

  const frase = h("p", { class: "au-frase" });   // sem aria-live: é reescrita a cada tecla e o leitor de tela repetiria a frase inteira
  const estado = h("p", { class: "au-estado" });
  const avisos = h("div", { class: "au-avisos" });
  const chips = h("div", { class: "au-vars-lista" }, L.VARIAVEIS.map(([k, rot]) => {
    const b = h("button", { type: "button", class: "au-var", title: rot, disabled: !podeEditar }, `{${k}}`);
    b.addEventListener("mousedown", ev => ev.preventDefault());       // não rouba o foco do campo
    b.addEventListener("click", () => inserirVariavel(`{${k}}`));
    return b;
  }));
  const areaSim = h("div", { class: "au-sim", "aria-live": "polite" });
  const btTestarLado = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("olho"), "Testar agora");
  // plano 1000 · AS-044: «Testar com…» um registro específico (nx_auto_simular aceita p_negocio): «por que não rodou para a Maria?»
  let negocioTeste = null;
  const idBuscaTeste = novoId("tbusca");
  const buscaTeste = h("input", { id: idBuscaTeste, type: "search", class: "au-teste-busca", autocomplete: "off", placeholder: "Busque pelo nome ou título" });
  const resTeste = h("ul", { class: "au-teste-res", role: "list", hidden: true });
  const escolhidoTeste = h("p", { class: "au-teste-escolhido", hidden: true });
  let seqBuscaTeste = 0;
  const pintarEscolhido = () => {
    ui.limpar(escolhidoTeste);
    escolhidoTeste.hidden = !negocioTeste;
    if (!negocioTeste) return;
    const tirar = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Usar o gatilho");
    tirar.addEventListener("click", () => { negocioTeste = null; pintarEscolhido(); buscaTeste.focus({ preventScroll: true }); });
    escolhidoTeste.append(ui.icone("olho"), h("span", null, `Testando só com «${negocioTeste.titulo}».`), tirar);
  };
  buscaTeste.addEventListener("input", ui.debounce(async () => {
    const q = buscaTeste.value.trim();
    const eu = ++seqBuscaTeste;
    ui.limpar(resTeste);
    if (q.length < 2) { resTeste.hidden = true; return; }
    let lista = [];
    try { const r = await ctx.api.rpcC("nx_buscar", { p_q: q }); lista = (r && Array.isArray(r.negocios) ? r.negocios : []).slice(0, 5); }
    catch { if (eu === seqBuscaTeste) { resTeste.hidden = false; resTeste.appendChild(h("li", { class: "sub" }, "A busca não respondeu agora. Teste pelo gatilho.")); } return; }
    if (eu !== seqBuscaTeste) return;
    resTeste.hidden = false;
    if (!lista.length) { resTeste.appendChild(h("li", { class: "sub" }, "Nada encontrado com esse nome.")); return; }
    for (const n of lista) {
      const titulo = String(n.titulo || n.contato_nome || `#${n.id}`);
      const b = h("button", { type: "button", class: "bt bt-fant bt-p au-teste-op" }, h("strong", null, titulo),
        h("small", null, [n.contato_nome && n.contato_nome !== titulo ? n.contato_nome : null, n.estagio_nome].filter(Boolean).join(" · ")));
      b.addEventListener("click", () => { negocioTeste = { id: n.id, titulo }; buscaTeste.value = ""; ui.limpar(resTeste); resTeste.hidden = true; pintarEscolhido(); testar(btTestarLado); });
      resTeste.appendChild(h("li", null, b));
    }
  }, 300));
  const cartaoTeste = podeEditar ? h("div", { class: "cartao au-teste", id: novoId("teste") },
    h("p", { class: "rotulo" }, "Testar sem risco"),
    h("p", { class: "sub" }, "Veja o que aconteceria agora com o que está na tela. Nada é enviado nem salvo."),
    h("div", { class: "linha" }, btTestarLado),
    h("div", { class: "campo au-teste-com" }, h("label", { for: idBuscaTeste }, "Testar com um registro (opcional)"), buscaTeste, resTeste),
    escolhidoTeste,
    areaSim) : null;
  // diagrama ao vivo do fluxo (item 53): SVG gerado de gatilho/condições/passos, redesenhado a cada mudança; cada nó leva ao bloco
  const caixaDiagrama = h("div", { class: "au-dg-caixa", id: novoId("dg") });
  // no celular a lateral vem depois do formulário: o diagrama sobe para o topo (CSS) e nasce recolhido, para não empurrar os campos
  const estreito = () => { try { return typeof matchMedia === "function" && matchMedia("(max-width: 1080px)").matches; } catch { return false; } };
  let diagramaAberto = !estreito();
  const btFluxo = h("button", { type: "button", class: "bt bt-fant bt-p au-dg-toggle", "aria-expanded": String(diagramaAberto), "aria-controls": caixaDiagrama.id },
    h("span", null, diagramaAberto ? "Esconder" : "Ver o fluxo"), ui.icone("seta-baixo"));
  btFluxo.addEventListener("click", () => {
    diagramaAberto = !diagramaAberto;
    caixaDiagrama.hidden = !diagramaAberto;
    btFluxo.setAttribute("aria-expanded", String(diagramaAberto));
    btFluxo.firstChild.textContent = diagramaAberto ? "Esconder" : "Ver o fluxo";
  });
  caixaDiagrama.hidden = !diagramaAberto;
  const cartaoDiagrama = h("div", { class: "cartao au-dg" },
    h("div", { class: "au-dg-cab" }, h("div", null, h("p", { class: "rotulo" }, "Fluxo"), h("span", { class: "sub au-dg-dica" }, "Toque num bloco para ir até ele.")), btFluxo),
    caixaDiagrama);
  const resumoNos = h("span", { class: "au-dg-resumo mono" });
  cartaoDiagrama.querySelector(".au-dg-cab > div").appendChild(resumoNos);
  let ultimoDiagrama = null, tDiagrama = null;
  /** plano 1000 · AS-028: o SVG não é refeito a cada tecla — espera 150 ms parado e pula quando os nós são os mesmos. */
  function agendarDiagrama() { clearTimeout(tDiagrama); tDiagrama = setTimeout(() => { tDiagrama = null; pintarDiagrama(); }, DIAGRAMA_MS); }
  function pintarDiagrama() {
    const nos = L.nosDoDiagrama(auto, base, vv, { podeEditar });
    const chave = JSON.stringify(nos);
    if (chave === ultimoDiagrama && caixaDiagrama.firstChild) return;
    ultimoDiagrama = chave;
    const svg = P.diagrama({ nos, aoFocar: focarNo, largura: 300 });
    ui.limpar(caixaDiagrama);
    caixaDiagrama.appendChild(svg);
    // plano 1000 · AS-230: recolhido (celular), o resumo diz o gatilho e os passos («Etapa X → 3 passos (1 espera)»), não só «0 passos»
    resumoNos.textContent = L.resumoFluxo(auto, base, vv);
  }
  /** Leva a pessoa ao bloco/passo do nó clicado no diagrama: rola até lá, foca o 1º controle e dá um brilho curto no cartão. */
  function focarNo(no) {
    if (!no) return;
    let bloco = { quando: blocoQuando, se: blocoSe, entao: blocoEntao }[no.onde] || blocoQuando;
    let alvo = bloco;
    if (no.onde === "se" && no.indice != null) alvo = blocoSe.querySelectorAll(".au-cond")[no.indice] || bloco;
    if (no.onde === "entao" && no.indice != null) alvo = blocoEntao.querySelectorAll(".au-passo")[no.indice] || bloco;
    if (painelRegra.hidden && item) { const aba = raiz.querySelector(".au-abas [role=tab]"); if (aba) aba.click(); }
    alvo.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem() });
    const ctl = no.tipo === "mais" || (no.onde === "entao" && no.indice == null)
      ? blocoEntao.querySelector(".au-mais")
      : alvo.querySelector("select:not(:disabled), input:not(:disabled), textarea:not(:disabled), .au-chip:not(:disabled), button:not(:disabled)");
    if (ctl) setTimeout(() => ctl.focus({ preventScroll: true }), 60);
    const cartaoAlvo = alvo.querySelector(".au-acao, .au-bloco-corpo") || alvo;
    cartaoAlvo.classList.remove("au-foco-brilho");
    void cartaoAlvo.offsetWidth;    // reinicia a animação quando se clica duas vezes no mesmo nó
    cartaoAlvo.classList.add("au-foco-brilho");
    setTimeout(() => cartaoAlvo.classList.remove("au-foco-brilho"), 1200);
  }

  const lado = h("aside", { class: "au-lado", "aria-label": "Resumo da automação" },
    cartaoDiagrama,
    h("div", { class: "cartao au-previa" },
      h("p", { class: "rotulo" }, "Em uma frase"), frase, estado, avisos),
    cartaoTeste,
    h("div", { class: "cartao au-vars" },
      h("p", { class: "rotulo" }, "Variáveis"),
      h("p", { class: "sub" }, "Toque para inserir no texto em edição. Na hora de rodar, viram os dados do contato."),
      chips));
  painelRegra.appendChild(h("div", { class: "au-ed-grade" }, fluxo, lado));

  // ------------------------------------------------ Quando
  const memoriaGatilho = {};       // plano 1000 · AS-219: o config de cada gatilho visitado nesta edição (trocar e voltar não perde as horas)
  function pintarQuando() {
    ui.limpar(blocoQuando);
    const g = L.GATILHO[auto.gatilho];
    const grupos = [];
    for (const gt of L.GATILHOS) {
      let grp = grupos.find(x => x.grupo === gt.grupo);
      if (!grp) grupos.push(grp = { grupo: gt.grupo, opcoes: [] });
      grp.opcoes.push({ valor: gt.id, rotulo: L.rotuloGatilho(gt.id, vv) });
    }
    const sel = seletor({ rotulo: "Gatilho", valor: auto.gatilho, opcoes: grupos, desabilitado: !podeEditar, classe: "au-sel-gat",
      ajuda: g && g.descricao ? g.descricao : null,
      aoMudar: v => { Object.assign(auto, L.trocarGatilho(auto, v, memoriaGatilho)); pintarQuando(); mudou("quando"); } });
    const campos = h("div", { class: "au-campos" }, (g ? g.campos : []).map(f => { const el = campoConfig(f); if (el) el.dataset.cfg = f.nome; return el; }));
    const dica = L.dicaGatilho(auto.gatilho, vv);
    blocoQuando.append(
      noFluxo("raio"),
      h("div", { class: "cartao au-bloco-corpo" },
        h("div", { class: "au-bloco-cab" },
          h("p", { class: "rotulo" }, "Quando"),
          h("h2", { class: "au-bloco-tit", id: "au-q-t" }, "O que dispara a automação")),
        sel, campos,
        dica ? h("p", { class: "au-dica" }, ui.icone("info"), dica) : null,
        h("p", { class: "au-bloco-erro", role: "alert", hidden: true })));
  }

  function campoConfig(f) {
    const v = auto.config[f.nome];
    const set = val => {
      if (val === "" || val === null || val === undefined) delete auto.config[f.nome]; else auto.config[f.nome] = val;
      mudou("quando");
    };
    switch (f.tipo) {
      case "canal": case "departamento": case "funil": case "etiqueta": {
        const vazioTxt = f.opcional ? { canal: "Qualquer número", departamento: "Qualquer departamento", funil: "Qualquer funil", etiqueta: "Escolha" }[f.tipo] : "Escolha…";
        const op = opcoesBase(dados, f.tipo);
        return seletor({ rotulo: f.rotulo, valor: v, opcoes: op, vazio: vazioTxt, desabilitado: !podeEditar, obrigatorio: f.obrigatorio,
          ajuda: !op.length ? semOpcoes(f.tipo) : null,
          aoMudar: x => {
            // etapa que não pertence ao funil escolhido sai (antes de avisar a mudança: a prévia e o rascunho já saem certos)
            if (f.tipo === "funil" && auto.config.estagio_id && x && !(((base.funis || []).find(fn => fn.id === x) || {}).estagios || []).some(e => e.id === auto.config.estagio_id)) {
              delete auto.config.estagio_id;
            }
            set(x || null);
            // a lista de etapas («Só nesta etapa») é a do funil escolhido: refaz sempre que o funil muda, mesmo sem etapa marcada
            if (f.tipo === "funil" && ((L.GATILHO[auto.gatilho] || {}).campos || []).some(c => c.filtraPor === f.nome)) {
              pintarQuando();
              const s = blocoQuando.querySelector(`[data-cfg="${f.nome}"] select`);
              if (s) s.focus({ preventScroll: true });       // o seletor foi redesenhado: o teclado continua nele
            }
          } });
      }
      case "estagio": {
        const funil = f.filtraPor ? auto.config[f.filtraPor] : null;
        return seletor({ rotulo: f.rotulo, valor: v, opcoes: opcoesBase(dados, "estagio", { funil, atual: v }), vazio: f.opcional ? "Qualquer etapa" : "Escolha a etapa…",
          desabilitado: !podeEditar, obrigatorio: !f.opcional, aoMudar: x => set(x || null) });
      }
      case "numero":
        // plano 1000 · AS-038: «7 dias parado» sem fazer conta de 168 horas — horas ou dias, gravado em horas
        if (f.sufixo === "h") return P.campoHoras({ rotulo: f.rotulo, valor: v, min: f.min, max: f.max, desabilitado: !podeEditar,
          obrigatorio: f.obrigatorio, aoMudar: x => set(x) });
        // plano 1000 · AS-039: «sem resposta há» em minutos ou horas (4 horas sem fazer a conta de 240), gravado em minutos
        if (f.sufixo === "min" && typeof P.campoMinutos === "function") return P.campoMinutos({ rotulo: f.rotulo.replace(/^Minutos sem resposta$/, "Tempo sem resposta"),
          valor: v, min: f.min, max: f.max, desabilitado: !podeEditar, obrigatorio: f.obrigatorio, aoMudar: x => set(x) });
        return entrada({ rotulo: f.rotulo, valor: v ?? "", tipo: "number", min: f.min, max: f.max, passo: 1, sufixo: f.sufixo, desabilitado: !podeEditar,
          obrigatorio: f.obrigatorio, ajuda:`De ${f.min} a ${f.max}.`, aoMudar: x => set(x === "" ? null : Number(x)) });
      case "palavras": {
        // plano 1000 · AS-284: «Testar uma frase» aplica a mesma regra do servidor (sem acento, trecho contido) e diz qual palavra casou
        const resFrase = h("small", { class: "au-frase-res", role: "status" });
        const inpFrase = h("input", { type: "text", class: "au-frase-inp", placeholder: "Ex.: Qual o preço do clareamento?", autocomplete: "off", "aria-label": "Testar uma frase do cliente" });
        const testarFrase = () => {
          const fr = inpFrase.value.trim();
          const ws = auto.config[f.nome] || [];
          const casou = fr ? L.casaPalavras(fr, ws) : null;
          resFrase.dataset.tom = !fr ? "" : casou || !ws.length ? "ok" : "ruim";
          resFrase.textContent = !fr ? "" : !ws.length ? "Sem palavras: toda mensagem recebida dispara." : casou ? `Dispara: casou com «${casou}».` : "Não dispara: nenhuma palavra aparece nessa frase.";
        };
        inpFrase.addEventListener("input", testarFrase);
        const campoP = entrada({ rotulo: f.rotulo, valor: (v || []).join(", "), placeholder: "preço, valor, quanto custa", ajuda: f.ajuda, desabilitado: !podeEditar,
          aoMudar: x => { set(x.split(",").map(s => s.trim()).filter(Boolean)); testarFrase(); } });
        campoP.appendChild(h("div", { class: "au-frase-teste" }, h("span", { class: "rotulo" }, "Testar uma frase"), inpFrase, resFrase));
        return campoP;
      }
      case "sim_nao": {
        const sw = interruptor({ ligado: v === undefined ? !!f.padrao : !!v, rotulo: f.rotulo, desabilitado: !podeEditar, aoMudar: x => set(x) });
        return h("div", { class: "campo au-campo-sw" }, h("span", { class: "au-campo-sw-rot" }, f.rotulo), sw);
      }
      case "campo_data":
        return seletor({ rotulo: f.rotulo, valor: v || "consulta", desabilitado: !podeEditar,
          opcoes: [{ valor: "consulta", rotulo: L.rotuloCampoData("consulta", vertical) }, { valor: "previsao_fechamento", rotulo: L.rotuloCampoData("previsao_fechamento", vertical) }],
          aoMudar: x => set(x) });
      case "hora":
        return entrada({ rotulo: f.rotulo, valor: v ?? "", tipo: "time", desabilitado: !podeEditar, obrigatorio: f.obrigatorio, classe: "au-campo-hora",
          ajuda: "Horário de São Paulo.", aoMudar: x => set(x || null) });
      case "dias_semana":
        return P.campoDias({ rotulo: f.rotulo, valor: v, desabilitado: !podeEditar, aoMudar: dias => { auto.config[f.nome] = dias; mudou("quando"); } });
      default: return null;
    }
  }

  function semOpcoes(tipo) {
    return { canal: "Nenhum número de WhatsApp cadastrado ainda.", departamento: "Nenhum departamento cadastrado.", funil: "Nenhum funil cadastrado.",
      etiqueta: "Nenhuma etiqueta criada ainda — crie em Configurações → Etiquetas.", pessoa: "Ninguém da equipe com acesso ainda.",
      campo_contato: "Só a pontuação está disponível. Para preencher outros campos, crie-os em Configurações → Campos." }[tipo] || null;
  }

  // ------------------------------------------------ Se (condições)
  function pintarSe() {
    ui.limpar(blocoSe);
    const lista = h("ol", { class: "au-conds", role: "list" });
    auto.condicoes.forEach((cd, i) => lista.appendChild(linhaCondicao(cd, i)));
    const btMais = podeEditar ? h("button", { type: "button", class: "bt bt-sec bt-p au-mais", disabled: auto.condicoes.length >= L.LIMITES.condicoes },
      ui.icone("mais"), "Condição") : null;
    // plano 1000 · AS-220: «+ Condição» abre a lista de campos e a condição já nasce no campo escolhido (antes sempre «Origem»)
    const novaCondicao = campo => {
      auto.condicoes.push({ campo, op: L.operadoresDe(campo)[0] || "igual", valor: "" });
      pintarSe(); mudou("se");
      const sel = blocoSe.querySelectorAll(".au-cond");
      const ult = sel[sel.length - 1];
      if (ult) { const f = ult.querySelector(".au-cond-op select, .au-cond-val select, .au-cond-val input") || ult.querySelector("select"); if (f) f.focus(); }
    };
    if (btMais) {
      btMais.setAttribute("aria-haspopup", "menu");
      btMais.addEventListener("click", () => ui.menu(btMais, L.camposCondicao(base, vv).map(c => ({ rotulo: c.rotulo, fn: () => novaCondicao(c.valor) }))));
    }
    blocoSe.append(
      noFluxo("filtro"),
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
    const selCampo = seletor({ rotulo: "Campo", valor: cd.campo, opcoes: L.camposCondicao(base, vv), desabilitado: !podeEditar, classe: "au-cond-campo",
      aoMudar: v => { cd.campo = v; cd.op = L.operadoresDe(v)[0]; cd.valor = ""; pintarSe(); mudou("se"); } });
    const selOp = seletor({ rotulo: "Comparação", valor: cd.op, opcoes: ops, desabilitado: !podeEditar, classe: "au-cond-op",
      aoMudar: v => { cd.op = v; if (L.operadorSemValor(v)) delete cd.valor; pintarSe(); mudou("se"); } });
    let ctlValor = null;
    if (!L.operadorSemValor(cd.op)) {
      const set = v => { cd.valor = v; mudou("se"); };
      const mapa = { funil: "funil", estagio: "estagio", canal: "canal", departamento: "departamento", etiqueta: "etiqueta", pessoa: "pessoa" };
      if (tipo === "origem") ctlValor = seletor({ rotulo: "Valor", valor: cd.valor, vazio: "Escolha…", opcoes: L.ORIGENS.map(([k, r]) => ({ valor: k, rotulo: r })), desabilitado: !podeEditar, aoMudar: set, classe: "au-cond-val" });
      else if (mapa[tipo]) ctlValor = seletor({ rotulo: "Valor", valor: cd.valor, vazio: "Escolha…", opcoes: opcoesBase(dados, mapa[tipo]), desabilitado: !podeEditar, aoMudar: set, classe: "au-cond-val" });
      else if (tipo === "numero") {
        // plano 1000 · AS-221 / AS-222: moeda brasileira («1.500,00») e o rótulo diz de quê é o valor
        ctlValor = ui.campo({ rotulo: L.rotuloValorNegocio(vv), nome: `cond-valor-${i}`, tipo: "moeda", valor: cd.valor === "" || cd.valor == null ? "" : Number(cd.valor), desabilitado: !podeEditar });
        const inpV = ctlValor.querySelector("input");
        if (inpV) inpV.addEventListener("input", () => { const n = ui.lerMoeda(inpV.value); set(n == null ? "" : n); });
      }
      else ctlValor = entrada({ rotulo: "Valor", valor: cd.valor ?? "", max: 200, desabilitado: !podeEditar, aoMudar: set, placeholder: tipo === "texto" ? "ex.: implante" : "" });
      ctlValor.classList.add("au-cond-val");
    }
    const btX = podeEditar ? h("button", { type: "button", class: "bt-icone au-x", "aria-label": `Tirar a condição ${i + 1}` }, ui.icone("fechar")) : null;
    if (btX) btX.addEventListener("click", () => {
      const tinhaFoco = document.activeElement === btX;
      auto.condicoes.splice(i, 1); pintarSe(); mudou("se");
      // igual aos passos: o foco vai para o «Tirar a condição» que ocupou o lugar (ou o anterior; sem condições, «Condição»)
      if (tinhaFoco) {
        const xs = blocoSe.querySelectorAll(".au-cond .au-x");
        const alvo = xs[Math.min(i, xs.length - 1)] || blocoSe.querySelector(".au-mais");
        if (alvo) alvo.focus({ preventScroll: true });
      }
    });
    return h("li", { class: "au-cond" },
      h("span", { class: "au-cond-e", "aria-hidden": "true" }, i === 0 ? "se" : "e"),
      selCampo, selOp, ctlValor || h("span", { class: "au-cond-vazio" }), btX,
      h("p", { class: "au-item-erro", role: "alert", hidden: true }));
  }

  // ------------------------------------------------ Então (linha do tempo de passos)
  let arrastando = null;
  let paletaAberta = false;

  /** plano 1000 · AS-224: com «só no horário de atendimento» e o horário do departamento padrão (quando a base traz), a linha do tempo calcula o envio real. */
  const horarioPadrao = (() => { const d = ((base && base.departamentos) || []).find(x => x && x.padrao) || null; return d && d.horario !== undefined ? d.horario : undefined; })();
  const opcoesTempo = () => (auto.respeitar_horario && horarioPadrao !== undefined ? { inicio: Date.now(), horario: horarioPadrao } : {});
  const textoQuando = t => (t.inalcancavel ? "Nunca roda (depois de «Parar»)"
    : t.adiada && t.envio ? `${t.quando} · se começar agora, sai ${L.dataHoraCurtaSP(t.envio)} (horário de atendimento)` : t.quando);
  function pintarEntao() {
    ui.limpar(blocoEntao);
    const tl = L.linhaDoTempo(auto.acoes, opcoesTempo());
    const lista = h("ol", { class: ["au-tempo", L.temSequencia(auto) && "au-tempo-seq"], role: "list" });
    auto.acoes.forEach((ac, i) => lista.appendChild(passo(ac, i, tl[i])));
    const cheio = auto.acoes.length >= L.LIMITES.acoes;
    const btMais = podeEditar ? h("button", { type: "button", class: "bt bt-sec bt-p au-mais", "aria-expanded": String(paletaAberta), disabled: cheio },
      ui.icone("mais"), "Adicionar passo") : null;
    const paleta = podeEditar ? montarPaleta() : null;
    if (paleta) paleta.hidden = !paletaAberta;
    if (btMais) btMais.addEventListener("click", () => {
      paletaAberta = !paletaAberta;
      btMais.setAttribute("aria-expanded", String(paletaAberta));
      paleta.hidden = !paletaAberta;
      if (paletaAberta) { const b = paleta.querySelector(".au-paleta-busca-inp") || paleta.querySelector("button"); if (b) b.focus({ preventScroll: true }); }
    });
    // Esc fecha a paleta e devolve o foco ao botão que a abriu
    if (btMais && paleta) paleta.addEventListener("keydown", ev => {
      if (ev.key !== "Escape" || !paletaAberta) return;
      ev.preventDefault(); ev.stopPropagation();
      paletaAberta = false; btMais.setAttribute("aria-expanded", "false"); paleta.hidden = true;
      btMais.focus({ preventScroll: true });
    });
    const temMensagem = L.enviaMensagem(auto);
    const swHorario = interruptor({ ligado: !!auto.respeitar_horario, rotulo: "Respeitar horário de funcionamento", desabilitado: !podeEditar,
      aoMudar: v => { auto.respeitar_horario = v; mudou("entao"); } });
    blocoEntao.append(
      noFluxo("check"),
      h("div", { class: "cartao au-bloco-corpo" },
        h("div", { class: "au-bloco-cab" },
          h("p", { class: "rotulo" }, L.temSequencia(auto) ? "Então · sequência" : "Então"),
          h("h2", { class: "au-bloco-tit", id: "au-e-t" }, auto.acoes.length ? "Faça, nesta ordem" : "O que fazer")),
        auto.acoes.length ? lista : h("p", { class: "sub au-sem" }, "Acrescente pelo menos um passo: criar tarefa, avisar a equipe, enviar mensagem, esperar um tempo…"),
        btMais, paleta,
        cheio ? h("p", { class: "sub" }, `Limite de ${L.LIMITES.acoes} passos por automação.`) : null,
        h("div", { class: ["au-horario", !temMensagem && "au-apagado"] },
          h("div", null,
            h("p", { class: "au-horario-tit" }, "Respeitar horário de funcionamento"),
            h("p", { class: "sub" }, temMensagem ? "Mensagens fora do horário do departamento esperam a próxima abertura." : "Vale para passos que mandam mensagem."),
            // plano 1000 · AS-063: qual horário vale (o servidor usa o departamento da conversa; sem conversa, o departamento padrão)
            h("p", { class: "sub au-horario-qual" }, textoHorarioQual())),
          swHorario),
        h("p", { class: "au-bloco-erro", role: "alert", hidden: true })));
    pintarValidacao();
  }

  function textoHorarioQual() {
    const deps = base.departamentos || [];
    const padrao = deps.find(d => d && d.padrao) || null;
    return `Vale o horário do departamento da conversa; sem conversa (gatilhos do CRM), o do departamento padrão${padrao ? ` («${padrao.nome}»)` : ""}.`;
  }

  /** Paleta de passos por grupo (Mensagens, CRM, Equipe, Sequência, IA). */
  function montarPaleta() {
    const pal = h("div", { class: "au-paleta", role: "group", "aria-label": "Escolha o passo" });
    // plano 1000 · AS-042: «Buscar passo» no topo (sem acento, por rótulo e descrição); o foco cai nele ao abrir
    const idBusca = novoId("palbusca");
    const busca = h("input", { id: idBusca, type: "search", class: "au-paleta-busca-inp", placeholder: "Buscar passo: etiqueta, tarefa, mensagem…", autocomplete: "off" });
    const semNada = h("p", { class: "sub au-paleta-vazio", hidden: true }, "Nenhum passo com essas palavras.");
    const status = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });
    pal.appendChild(h("div", { class: "au-paleta-busca" }, h("label", { class: "sr-only", for: idBusca }, "Buscar passo"),
      h("span", { class: "busca" }, ui.icone("busca"), busca)));
    for (const grupo of L.GRUPOS_ACAO) {
      const itens = L.ACOES.filter(a => a.grupo === grupo && a.disponivel !== false && a.menu !== false);
      if (!itens.length) continue;
      pal.appendChild(h("section", { class: "au-paleta-grupo" },
        h("h3", { class: "rotulo" }, grupo),
        h("div", { class: "au-paleta-grade" }, itens.map(a => {
          const b = h("button", { type: "button", class: ["au-tile", a.sequencia && "au-tile-seq", a.ia && "au-tile-ia"], dataset: { acao: a.id } },
            h("span", { class: "au-tile-ic", "aria-hidden": "true" }, ui.icone(a.icone)),
            h("span", { class: "au-tile-txt" }, h("strong", null, L.rotuloAcao(a.id, vv)), h("small", null, a.descricao || ""),
              iaOff && a.ia ? h("small", { class: "au-tile-off" }, "IA ainda desligada: o passo seria pulado") : null));
          b.addEventListener("click", () => adicionar(a.id));
          return b;
        }))));
    }
    pal.append(semNada, status);
    busca.addEventListener("input", () => {
      const ok = new Set(L.acoesDaBusca(busca.value, vv));
      let n = 0;
      for (const sec of pal.querySelectorAll(".au-paleta-grupo")) {
        let vis = 0;
        for (const t of sec.querySelectorAll(".au-tile")) { const mostra = ok.has(t.dataset.acao); t.hidden = !mostra; if (mostra) vis++; }
        sec.hidden = !vis; n += vis;
      }
      semNada.hidden = n > 0;
      status.textContent = busca.value.trim() ? `${n} ${n === 1 ? "passo encontrado" : "passos encontrados"}.` : "";
    });
    busca.addEventListener("keydown", ev => {
      if (ev.key !== "Enter") return;
      const primeiro = [...pal.querySelectorAll(".au-tile")].find(t => !t.hidden && !(t.closest(".au-paleta-grupo") || {}).hidden);
      if (primeiro) { ev.preventDefault(); primeiro.click(); }
    });
    return pal;
  }

  function adicionar(tipo) {
    const ac = L.novaAcao(tipo);
    frescos.add(ac);   // não nasce em vermelho: o «Falta…» só aparece quando a pessoa sai do passo ou tenta salvar/testar
    auto.acoes.push(ac);
    paletaAberta = false;
    pintarEntao(); mudou("entao");
    const cards = blocoEntao.querySelectorAll(".au-passo");
    const ult = cards[cards.length - 1];
    // plano 1000 · AS-043: logo abaixo do passo novo, «Outro passo» reabre a paleta (montar 5 passos não exige voltar ao fim do bloco)
    const btMaisPasso = blocoEntao.querySelector(".au-mais");
    if (ult && btMaisPasso && !btMaisPasso.disabled) {
      const outro = h("button", { type: "button", class: "bt bt-fant bt-p au-outro-passo" }, ui.icone("mais"), "Outro passo");
      outro.addEventListener("click", () => {
        outro.remove();
        if (!paletaAberta) btMaisPasso.click();
        const pal = blocoEntao.querySelector(".au-paleta");
        if (pal) pal.scrollIntoView({ block: "nearest", behavior: ui.comportamentoRolagem() });
      });
      (ult.querySelector(".au-passo-corpo") || ult).appendChild(outro);
    }
    if (ult) ult.addEventListener("focusout", ev => { if (ult.contains(ev.relatedTarget)) return; if (frescos.delete(ac)) pintarValidacao(); });
    if (ult) { ult.scrollIntoView({ block: "nearest", behavior: ui.comportamentoRolagem() }); const f = ult.querySelector("input,select,textarea,.au-chip"); if (f) f.focus({ preventScroll: true }); }
  }

  function passo(ac, i, t) {
    const def = L.ACAO[ac.tipo];
    const n = auto.acoes.length;
    const seq = !!(def && def.sequencia);
    const corpo = h("div", { class: "au-acao-corpo" }, (def ? def.campos : []).filter(f => !f.quando || Object.entries(f.quando).every(([k, v]) => L.valorCampo(ac, k) === v))
      .filter(f => f.tipo !== "parametros").map(f => campoAcao(ac, f, i)));
    if (def && !def.campos.length && def.descricao) corpo.appendChild(h("p", { class: "sub au-passo-desc" }, def.descricao));
    const alca = podeEditar ? h("span", { class: "au-alca", title: "Arraste para reordenar", "aria-hidden": "true" }, ui.icone("arrastar")) : null;
    const btSobe = podeEditar ? h("button", { type: "button", class: "bt-icone", "aria-label": `Subir o passo ${i + 1}`, disabled: i === 0 }, ui.icone("seta-baixo", "au-gira")) : null;
    const btDesce = podeEditar ? h("button", { type: "button", class: "bt-icone", "aria-label": `Descer o passo ${i + 1}`, disabled: i === n - 1 }, ui.icone("seta-baixo")) : null;
    const btX = podeEditar ? h("button", { type: "button", class: "bt-icone au-x", "aria-label": `Tirar o passo ${i + 1}` }, ui.icone("lixeira")) : null;
    const mover = para => { auto.acoes = L.mover(auto.acoes, i, para); pintarEntao(); mudou("entao");
      const b = blocoEntao.querySelectorAll(".au-passo")[para]; if (b) { const alvo = b.querySelector(para < i ? "[aria-label^='Subir']" : "[aria-label^='Descer']"); (alvo && !alvo.disabled ? alvo : b.querySelector("button")).focus(); } };
    if (btSobe) btSobe.addEventListener("click", () => mover(i - 1));
    if (btDesce) btDesce.addEventListener("click", () => mover(i + 1));
    if (btX) btX.addEventListener("click", () => {
      const tinhaFoco = document.activeElement === btX;
      auto.acoes.splice(i, 1); pintarEntao(); mudou("entao");
      // o botão saiu da tela com o passo: o foco vai para o «Tirar» do passo que ocupou o lugar (ou o anterior; sem passos, «Adicionar passo»)
      if (tinhaFoco) {
        const xs = blocoEntao.querySelectorAll(".au-passo .au-x");
        const alvo = xs[Math.min(i, xs.length - 1)] || blocoEntao.querySelector(".au-mais");
        if (alvo) alvo.focus({ preventScroll: true });
      }
    });
    const resumo = ac.tipo === "esperar" ? h("span", { class: "au-acao-resumo mono" }, Number(ac.minutos) > 0 ? L.formatarDuracao(ac.minutos) : "—") : null;
    const cartao = h("div", { class: ["au-acao", seq && "au-acao-seq", ac.tipo === "parar" && "au-acao-parar", ac.tipo === "esperar" && "au-acao-espera", def && def.ia && "au-acao-ia"] },
      h("div", { class: "au-acao-cab" },
        alca,
        h("span", { class: "au-acao-n", "aria-hidden": "true" }, String(i + 1)),
        h("h3", { class: "au-acao-tit" }, h("span", { class: "sr-only" }, `Passo ${i + 1}: `), L.rotuloAcao(ac.tipo, vv)),
        resumo,
        h("span", { class: "au-acao-bts" }, btSobe, btDesce, btX)),
      iaOff && def && def.ia ? h("p", { class: "aviso aviso-aten au-passo-ia-off" }, ui.icone("ia"), h("span", null, L.AVISO_IA_DESLIGADA)) : null,
      corpo,
      h("p", { class: "au-item-erro", role: "alert", hidden: true }));
    if (ac.tipo === "enviar_template") corpo.appendChild(editorModelo(ac));
    pintarNunca(cartao, t.inalcancavel);
    const li = h("li", { class: ["au-passo", `au-passo-${ac.tipo}`, t.inalcancavel && "au-passo-inalcancavel"], dataset: { i: String(i), tipo: ac.tipo } },
      h("div", { class: "au-passo-trilho", "aria-hidden": "true" }, h("span", { class: "au-passo-no" }, ui.icone(def ? def.icone : "raio"))),
      h("div", { class: "au-passo-corpo" },
        h("p", { class: "au-passo-quando mono" }, textoQuando(t)),
        cartao));
    // arrastar para reordenar (a alça liga o draggable; teclado usa os botões subir/descer)
    if (alca) {
      alca.addEventListener("pointerdown", () => { li.draggable = true; });
      // plano 1000 · AS-026: tocar a alça sem arrastar não deixa o passo arrastável (selecionar texto no campo arrastaria o cartão)
      const soltar = () => { if (arrastando === null) li.draggable = false; };
      for (const ev of ["pointerup", "pointercancel", "blur"]) alca.addEventListener(ev, soltar);
      li.addEventListener("pointerup", soltar);
      li.addEventListener("dragstart", ev => { arrastando = i; li.classList.add("au-arrastando"); try { ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", String(i)); } catch { /* ok */ } });
      li.addEventListener("dragend", () => { li.draggable = false; li.classList.remove("au-arrastando"); arrastando = null;
        blocoEntao.querySelectorAll(".au-alvo").forEach(x => x.classList.remove("au-alvo")); });
    }
    li.addEventListener("dragover", ev => { if (arrastando === null || arrastando === i) return; ev.preventDefault(); li.classList.add("au-alvo"); });
    li.addEventListener("dragleave", () => li.classList.remove("au-alvo"));
    li.addEventListener("drop", ev => { ev.preventDefault(); if (arrastando === null || arrastando === i) return;
      auto.acoes = L.mover(auto.acoes, arrastando, i); arrastando = null; pintarEntao(); mudou("entao"); });
    return li;
  }

  /**
   * plano 1000 · AS-067: passo depois de «Parar» não fica só esmaecido — ícone de alerta + aviso escrito, ligado ao cartão por aria-describedby.
   */
  function pintarNunca(cartao, nunca) {
    let av = cartao.querySelector(".au-passo-nunca");
    if (!nunca) {
      if (av) { av.remove(); cartao.removeAttribute("aria-describedby"); }
      return;
    }
    if (av) return;
    av = h("p", { class: "aviso aviso-aten au-passo-nunca", id: novoId("nunca") }, ui.icone("alerta"),
      h("span", null, "Este passo nunca roda porque vem depois de «Parar». Mova-o para antes ou tire o «Parar»."));
    const cab = cartao.querySelector(".au-acao-cab");
    if (cab && cab.nextSibling) cartao.insertBefore(av, cab.nextSibling); else cartao.appendChild(av);
    cartao.setAttribute("aria-describedby", av.id);
  }

  /** Atualiza só os textos de tempo (sem redesenhar os campos que a pessoa está digitando). */
  function atualizarTempos() {
    const tl = L.linhaDoTempo(auto.acoes, opcoesTempo());
    blocoEntao.querySelectorAll(".au-passo").forEach((li, i) => {
      const t = tl[i]; if (!t) return;
      const q2 = li.querySelector(".au-passo-quando");
      if (q2) q2.textContent = textoQuando(t);
      li.classList.toggle("au-passo-inalcancavel", !!t.inalcancavel);
      const cart = li.querySelector(".au-acao");
      if (cart) pintarNunca(cart, !!t.inalcancavel);
      const r = li.querySelector(".au-acao-resumo");
      if (r && auto.acoes[i]) r.textContent = Number(auto.acoes[i].minutos) > 0 ? L.formatarDuracao(auto.acoes[i].minutos) : "—";
    });
  }

  function campoAcao(ac, f, i) {
    const v = ac[f.nome];
    const set = val => { if (val === "" || val === null || val === undefined) delete ac[f.nome]; else ac[f.nome] = val; mudou("entao"); };
    const dis = !podeEditar;
    switch (f.tipo) {
      case "texto":
        return entrada({ rotulo: f.rotulo, valor: v ?? "", max: f.max, variaveis: f.variaveis, desabilitado: dis, obrigatorio: f.obrigatorio,
          aoMudar: x => { ac[f.nome] = x; mudou("entao"); } });
      case "texto_longo": {
        // plano 1000 · AS-037: contador «x / teto» (amarelo a 90 %); AS-036: «Enviar mensagem» mostra como chega, com um exemplo
        const cont = f.max ? h("small", { class: "au-cont mono" }) : null;
        const bolha = ac.tipo === "enviar_mensagem" ? h("div", { class: "au-bolha" }) : null;
        const previa = bolha ? h("figure", { class: "au-msg-previa" }, h("figcaption", { class: "rotulo" }, "Como chega no WhatsApp (exemplo)"), bolha) : null;
        const pintarCont = val => { if (!cont) return; const c = L.contadorTexto(val, f.max); cont.textContent = c.texto; cont.dataset.tom = c.tom; };
        const pintarBolha = val => { if (bolha) bolha.textContent = String(val || "").trim() ? L.aplicarVariaveis(val, exemplo) : "Escreva a mensagem para ver a prévia."; };
        const bolhaDepois = ui.debounce(pintarBolha, 150);
        const el = entrada({ rotulo: f.rotulo, valor: v ?? "", tipo: "textarea", max: f.max, variaveis: f.variaveis, desabilitado: dis, ajuda: f.ajuda,
          obrigatorio: f.obrigatorio, aoMudar: x => { ac[f.nome] = x; pintarCont(x); bolhaDepois(x); mudou("entao"); } });
        if (cont) el.appendChild(cont);
        if (previa) el.appendChild(previa);
        pintarCont(v ?? ""); pintarBolha(v ?? "");
        return el;
      }
      case "numero":
        return entrada({ rotulo: f.rotulo, valor: v ?? "", tipo: "number", min: f.min, max: f.max, passo: 1, sufixo: f.sufixo, desabilitado: dis,
          aoMudar: x => set(x === "" ? null : Number(x)) });
      case "duracao":
        return P.campoDuracao({ rotulo: f.rotulo, valor: v, desabilitado: dis, min: f.min, max: f.max,
          aoMudar: m => { if (m == null) delete ac[f.nome]; else ac[f.nome] = m; mudou("entao", { tempo: true }); } });
      case "opcoes":
        return seletor({ rotulo: f.rotulo, valor: v ?? f.padrao, opcoes: f.opcoes.map(([k, r]) => ({ valor: k, rotulo: r })), desabilitado: dis, aoMudar: set });
      case "estagio": {
        const funil = f.filtraPor ? ac[f.filtraPor] : null;
        return seletor({ rotulo: f.rotulo, valor: v, opcoes: opcoesBase(dados, "estagio", { funil, atual: v }), vazio: f.opcional ? "Primeira etapa do funil" : "Escolha a etapa…",
          desabilitado: dis, obrigatorio: f.obrigatorio, aoMudar: x => set(x || null) });
      }
      case "funil":
        return seletor({ rotulo: f.rotulo, valor: v, opcoes: opcoesBase(dados, "funil"), vazio: f.semPadrao ? "Escolha o funil…" : "Funil padrão", desabilitado: dis, obrigatorio: f.obrigatorio,
          aoMudar: x => {
            set(x || null);
            if (L.ACAO[ac.tipo].campos.some(c => c.filtraPor === f.nome)) { delete ac.estagio_id; pintarEntao(); }
          } });
      case "etiqueta": {
        const op = opcoesBase(dados, "etiqueta");
        // «criar ao salvar» só existe no passo «etiquetar» (o banco cria pelo nome); em «Pôr etiqueta» é preciso escolher uma que já existe
        const criaPeloNome = ac.tipo === "etiquetar" && !v && !!ac.etiqueta_nome;
        if (criaPeloNome) op.unshift({ valor: "__nova", rotulo: `Criar a etiqueta «${ac.etiqueta_nome}» ao salvar` });
        return seletor({ rotulo: f.rotulo, valor: v || (criaPeloNome ? "__nova" : ""), opcoes: op, vazio: "Escolha a etiqueta…", desabilitado: dis,
          obrigatorio: true, ajuda: !op.length ? semOpcoes("etiqueta") : null,
          aoMudar: x => { if (x === "__nova") { delete ac.etiqueta_id; } else { delete ac.etiqueta_nome; set(x || null); } mudou("entao"); } });
      }
      case "pessoa":
        return seletor({ rotulo: f.rotulo, valor: v, opcoes: opcoesBase(dados, "pessoa"), vazio: "Escolha a pessoa…", desabilitado: dis, obrigatorio: true,
          ajuda: !opcoesBase(dados, "pessoa").length ? semOpcoes("pessoa") : null, aoMudar: x => set(x || null) });
      case "campo_contato": {
        const op = opcoesBase(dados, "campo_contato");
        const soScore = !(base.campos || []).length && !(base.campos_negocio || []).length;
        return seletor({ rotulo: f.rotulo, valor: v, opcoes: op, vazio: "Escolha o campo…", desabilitado: dis, obrigatorio: true,
          ajuda: soScore ? semOpcoes("campo_contato") : null, aoMudar: x => set(x || null) });
      }
      case "dono":
        return seletor({ rotulo: f.rotulo, valor: v ?? "responsavel", desabilitado: dis, aoMudar: set, opcoes: [
          { valor: "responsavel", rotulo: `Responsável pel${vv.art ? vv.art("negocio") : "o"} ${vv.min ? vv.min("negocio") : "negócio"}` },
          { valor: "atendente", rotulo: "Quem atende a conversa" },
          ...(opcoesBase(dados, "pessoa").length ? [{ grupo: "Uma pessoa", opcoes: opcoesBase(dados, "pessoa") }] : [])] });
      case "para":
        return seletor({ rotulo: f.rotulo, valor: v ?? "responsavel", desabilitado: dis,
          aoMudar: x => { ac.para = x; if (x !== "departamento") delete ac.departamento_id; pintarEntao(); mudou("entao"); },
          opcoes: [
            { valor: "responsavel", rotulo: "O responsável (ou os administradores, se não houver)" },
            { valor: "admins", rotulo: "Administradores e supervisores" },
            ...(opcoesBase(dados, "departamento").length ? [{ valor: "departamento", rotulo: "Um departamento" }] : []),
            ...(opcoesBase(dados, "pessoa").length ? [{ grupo: "Uma pessoa", opcoes: opcoesBase(dados, "pessoa") }] : [])] });
      case "departamento": {
        const ehDep = ac.tipo === "atribuir" && ac.dono === "departamento";       // «atribuir a um departamento» exige escolher
        return seletor({ rotulo: ehDep ? "Departamento" : f.rotulo, valor: v, opcoes: opcoesBase(dados, "departamento"),
          vazio: ehDep ? "Escolha o departamento…" : (f.vazioRotulo || "Manter o departamento"), desabilitado: dis,
          obrigatorio: ehDep || !!f.obrigatorio, aoMudar: x => set(x || null) });
      }
      case "sim_nao": {
        const sw = interruptor({ ligado: v === undefined ? !!f.padrao : !!v, rotulo: f.rotulo, desabilitado: dis,
          aoMudar: x => { if (f.gravaSempre) { ac[f.nome] = !!x; mudou("entao"); } else set(x || null); } });
        return h("div", { class: "campo au-campo-sw" }, h("span", { class: "au-campo-sw-rot" }, f.rotulo), sw);
      }
      case "alvo_etiqueta":
        return seletor({ rotulo: f.rotulo, valor: v ?? "contato", desabilitado: dis, aoMudar: set,
          opcoes: [{ valor: "contato", rotulo: `No ${vv.min ? vv.min("contato") : "contato"}` }, { valor: "conversa", rotulo: "Na conversa" }] });
      case "modo_atribuir":
        return seletor({ rotulo: f.rotulo, valor: L.valorCampo(ac, f.nome) ?? "rodizio", desabilitado: dis,
          ajuda: L.ehAtribuirAntigo(ac) ? "Automação criada antes: só a conversa muda e vale a regra de distribuição do departamento. Ao escolher outra opção, passa a trocar também o responsável do negócio." : null,
          aoMudar: x => { ac.dono = x; delete ac.modo; if (x !== "conta") delete ac.conta_id; pintarEntao(); mudou("entao"); },
          opcoes: [{ valor: "rodizio", rotulo: "Rodízio (quem tem menos atendimentos)" }, { valor: "conta", rotulo: "Uma pessoa" },
            ...(opcoesBase(dados, "departamento").length ? [{ valor: "departamento", rotulo: "Um departamento" }] : [])] });
      case "tarefa_ia":
        return P.escolhaCartoes({ rotulo: f.rotulo, valor: v ?? f.padrao, desabilitado: dis,
          opcoes: L.TAREFAS_IA.map(([k, nome, texto]) => ({ valor: k, titulo: nome, texto })), aoMudar: x => { ac[f.nome] = x; mudou("entao"); } });
      case "template": return null;             // desenhado por editorModelo
      default: return null;
    }
  }

  /** Escolha do modelo aprovado na Meta + parâmetros com variáveis + prévia. */
  function editorModelo(ac) {
    const todos = base.templates || [];
    const aprovados = todos.filter(t => String(t.status || "").toUpperCase() === "APPROVED");
    const box = h("div", { class: "au-tpl" });
    const canal = id => (base.canais || []).find(c => c.id === id);
    if (!aprovados.length) {
      const sugerido = L.textoModeloLembrete(vertical);
      const btCopiar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("copiar"), "Copiar texto sugerido");
      btCopiar.addEventListener("click", () => ui.copiar(sugerido, { aviso: "Texto copiado. Cole no Gerenciador do WhatsApp da Meta." }));
      box.append(h("div", { class: "aviso aviso-aten au-tpl-aviso" }, ui.icone("alerta"),
        h("div", { class: "pilha-p" },
          h("p", null, todos.length ? "Nenhum modelo deste número foi aprovado pela Meta ainda." : "Ainda não há modelos da Meta sincronizados para este cliente."),
          h("p", null, "Crie e aprove na Meta um modelo de categoria Utilidade, por exemplo:"),
          h("blockquote", { class: "au-tpl-sugerido" }, sugerido),
          h("p", { class: "sub" }, "Depois da aprovação, toque em «Sincronizar agora» aqui mesmo (ou em Configurações → Números de WhatsApp). Enquanto isso, você pode salvar esta automação desligada. Ou use «Enviar mensagem» (texto livre, pelo CodeWords)."),
          h("div", { class: "linha" }, btCopiar, botaoSincronizar()))));
      if (ac.template_nome) box.appendChild(h("p", { class: "sub" }, `Modelo esperado: «${ac.template_nome}».`));
      return box;
    }
    // plano 1000 · AS-053: o gatilho filtra um número → os modelos de OUTRO número vêm marcados (o servidor manda pelo número do modelo e abre
    // outra conversa lá — o cliente receberia de um número diferente daquele em que estava falando)
    const canalGatilho = auto.config && auto.config.canal_id ? auto.config.canal_id : null;
    const opcoes = todos.map(t => {
      const ok = String(t.status || "").toUpperCase() === "APPROVED";
      const c = canal(t.canal_id);
      const outroNumero = !!(canalGatilho && t.canal_id && t.canal_id !== canalGatilho);
      return { valor: t.id, rotulo: `${t.nome} · ${t.idioma}${t.categoria ? ` · ${rotuloCategoria(t.categoria)}` : ""}${c ? ` · ${c.nome}` : ""}${ok ? "" : " · aguardando aprovação"}${outroNumero ? " · de outro número" : ""}`,
        desabilitado: !ok };
    });
    box.appendChild(seletor({ rotulo: "Modelo aprovado na Meta", valor: ac.template_id, opcoes, vazio: ac.template_nome ? `Escolha (sugerido: ${ac.template_nome})` : "Escolha o modelo…",
      desabilitado: !podeEditar, obrigatorio: true,
      aoMudar: x => {
        ac.template_id = x || undefined; if (!x) delete ac.template_id;
        const t = todos.find(y => y.id === x);
        const np = t ? Number(t.num_parametros) || 0 : 0;
        const pars = (ac.parametros || []).slice(0, np); while (pars.length < np) pars.push("");
        ac.parametros = pars;
        pintarEntao(); mudou("entao");
      } }));
    const t = todos.find(y => y.id === ac.template_id);
    box.appendChild(h("div", { class: "linha au-tpl-sinc" }, botaoSincronizar()));
    if (!t) return box;
    // AS-053: modelo de um número + gatilho de outro → avisa; sem filtro e com vários números, diz por onde sai
    const cT = canal(t.canal_id), cG = canalGatilho ? canal(canalGatilho) : null;
    if (canalGatilho && t.canal_id && t.canal_id !== canalGatilho) box.appendChild(h("p", { class: "aviso aviso-aten au-tpl-canal" }, ui.icone("alerta"),
      h("span", null, `Este modelo é do número «${cT ? cT.nome : "outro"}», mas o gatilho é do número «${cG ? cG.nome : "escolhido"}»: a mensagem sai pelo «${cT ? cT.nome : "outro"}» e abre outra conversa lá. Para responder no mesmo número, escolha um modelo de «${cG ? cG.nome : "escolhido"}».`)));
    else if (!canalGatilho && cT && new Set(todos.map(x => x.canal_id).filter(Boolean)).size > 1) box.appendChild(h("p", { class: "au-dica au-tpl-canal" }, ui.icone("info"),
      `A mensagem sai pelo número do modelo («${cT.nome}»), seja qual for a conversa que disparou.`));
    if (String(t.categoria || "").toUpperCase() === "MARKETING") box.appendChild(h("p", { class: "au-dica" }, ui.icone("info"),
      "Modelo de marketing: não sai para quem pediu para não receber (SAIR/PARAR)."));
    const np = Number(t.num_parametros) || 0;
    const pars = ac.parametros || (ac.parametros = []);
    while (pars.length < np) pars.push("");
    const prev = h("p", { class: "au-tpl-prev-txt" });
    const pintarPrev = () => { prev.textContent = L.previaModelo(t.corpo || "", pars, exemplo); };
    if (np) box.appendChild(h("div", { class: "au-tpl-pars" }, Array.from({ length: np }, (_, k) =>
      entrada({ rotulo: `Parâmetro {{${k + 1}}}`, valor: pars[k] ?? "", variaveis: true, max: 200, desabilitado: !podeEditar, obrigatorio: true,
        placeholder: "{primeiro_nome}", aoMudar: x => { pars[k] = x; pintarPrev(); mudou("entao"); } }))));
    pintarPrev();
    box.appendChild(h("div", { class: "au-tpl-prev" },
      h("p", { class: "rotulo" }, "Prévia com um exemplo"),
      h("div", { class: "au-bolha" }, prev)));
    return box;
  }

  /**
   * plano 1000 · AS-054: «Sincronizar agora» sem sair do editor — busca os modelos da Meta de cada número (nx-enviar sincronizar_templates)
   * e recarrega a lista de modelos daqui (nx_automacoes_listar), mantendo tudo o que já foi preenchido.
   */
  let sincronizando = false;
  function botaoSincronizar() {
    if (!podeEditar) return null;
    const b = h("button", { type: "button", class: "bt bt-sec bt-p au-tpl-sincronizar" }, ui.icone("relogio"), "Sincronizar agora");
    b.addEventListener("click", async () => {
      if (sincronizando) return;
      const canais = (base.canais || []).filter(c => c && c.id && (!c.provedor || c.provedor === "meta"));
      if (!canais.length) { ui.toast("Nenhum número da Meta cadastrado: modelos aprovados só existem na API oficial.", { tipo: "info" }); return; }
      sincronizando = true;
      try {
        const r = await ui.carregando(b, (async () => {
          let total = 0, falhas = 0;
          for (const c of canais) {
            try { const x = await ctx.api.fn("nx-enviar", { acao: "sincronizar_templates", canal: c.id }); total += Number(x && x.total) || 0; } catch { falhas++; }
          }
          const lista = await ctx.api.rpcC("nx_automacoes_listar");
          return { total, falhas, templates: lista && lista.base && Array.isArray(lista.base.templates) ? lista.base.templates : null };
        })());
        if (r.templates) base.templates = r.templates;
        const aprov = (base.templates || []).filter(t => String(t.status || "").toUpperCase() === "APPROVED").length;
        ui.toast(r.falhas && r.falhas === canais.length ? "Não consegui falar com a Meta agora. Tente de novo em instantes."
          : `Modelos sincronizados: ${aprov} ${aprov === 1 ? "aprovado" : "aprovados"}.${r.falhas ? ` ${r.falhas} ${r.falhas === 1 ? "número não respondeu" : "números não responderam"}.` : ""}`,
        { tipo: r.falhas === canais.length ? "erro" : "ok" });
        pintarEntao(); mudou("entao");
        const novo = blocoEntao.querySelector(".au-passo-enviar_template select, .au-tpl-sincronizar");
        if (novo) novo.focus({ preventScroll: true });
      } catch (e) { ui.toast(L.erroAutomacao(e, ctx.api.mensagemErro(e)), { tipo: "erro" }); }
      finally { sincronizando = false; }
    });
    return b;
  }

  function rotuloCategoria(c) {
    return { UTILITY: "Utilidade", MARKETING: "Marketing", AUTHENTICATION: "Autenticação" }[String(c).toUpperCase()] || c;
  }

  function noFluxo(icone) {
    return h("div", { class: "au-no", "aria-hidden": "true" }, h("span", { class: "au-no-bola" }, ui.icone(icone)));
  }

  // ------------------------------------------------ variáveis nos textos
  raiz.addEventListener("focusin", ev => {
    const t = ev.target;
    if (t && t.dataset && t.dataset.variaveis === "1") ultimoTexto = t;
  });
  function inserirVariavel(tok) {
    const t = ultimoTexto && ultimoTexto.isConnected ? ultimoTexto : blocoEntao.querySelector("[data-variaveis='1']");
    if (!t || t.disabled) { ui.toast("Clique num texto de um passo e depois na variável.", { tipo: "info" }); return; }
    const ini = t.selectionStart ?? t.value.length, fim = t.selectionEnd ?? t.value.length;
    t.value = t.value.slice(0, ini) + tok + t.value.slice(fim);
    try { t.setSelectionRange(ini + tok.length, ini + tok.length); } catch { /* ok */ }
    t.focus();
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ------------------------------------------------ prévia, avisos e validação ao vivo
  function atualizarPrevia(imediato = false) {
    frase.textContent = L.descrever(auto, base, vv);
    if (imediato) pintarDiagrama(); else agendarDiagrama();
    const r = L.validar(auto, { base, ligar: !!auto.ativo });
    ui.limpar(estado);
    estado.className = ["au-estado", r.ok ? "au-ok" : "au-falta"].join(" ");
    estado.append(ui.icone(r.ok ? "check" : "alerta"), h("span", null, r.ok
      // plano 1000 · AS-030: a promessa depende do gatilho (evento: 15 s; tempo: quando o tempo passar; agendado: no horário)
      ? (auto.ativo ? L.textoProntaLigada(auto.gatilho) : "Pronta. Vai ficar salva e desligada.")
      : `Falta: ${r.motivo}.`));
    ui.limpar(avisos);
    const bloqs = [];
    // plano 1000 · AS-232: o trecho das 24 h da Meta só quando há número da Meta (sem saber o provedor dos números, continua o texto completo)
    if (L.enviaMensagem(auto)) {
      const meta = L.temCanalMeta(base);
      bloqs.push(meta === false ? "Mensagens de WhatsApp saem pelo número conectado pelo CodeWords (texto livre a qualquer hora)."
        : "Mensagens de WhatsApp saem pelo CodeWords (número por aparelho). No WhatsApp oficial (Meta), texto livre só dentro de 24 h da última mensagem do cliente; fora disso, só modelo aprovado.");
    }
    if (L.faltaModelo(auto)) bloqs.push("Sem modelo aprovado escolhido: dá para salvar desligada e ligar quando a Meta aprovar.");
    if (auto.gatilho === "antes_da_data" && auto.acoes.some(a => a.tipo === "enviar_template" && (a.parametros || []).some(p => /\{hora_consulta\}/.test(p))))
      bloqs.push(`Quem tiver só a data (sem a hora) da ${L.palavraConsulta(vertical)} aparece nas execuções como erro, para ninguém receber mensagem com buraco.`);
    if (iaOff && L.temIA(auto)) bloqs.push(L.AVISO_IA_DESLIGADA);
    for (const t of L.avisosEstrutura(auto)) bloqs.push(t);
    // plano 1000 · AS-035: variável escrita errada chega crua ao cliente — avisa (e não deixa LIGAR; salvar desligada pode)
    for (const v of L.variaveisDosPassos(auto)) bloqs.push(`Passo ${v.indice + 1}: ${L.fraseVariaveis(v)}. Assim o cliente receberia o texto entre chaves.`);
    // plano 1000 · AS-278: um passo daqui dispara outra automação ligada (e, no pior caso, ela devolve: laço)
    for (const c of L.cadeiasDeAutomacao(auto, dados.itens || [], base))
      bloqs.push(c.laco ? `Laço: o passo ${c.indice + 1} usa ${c.por}, que dispara «${c.outra.nome}» — e ela dispara esta de volta. As duas vão se repetir até o limite e encher as execuções de erro.`
        : `O passo ${c.indice + 1} usa ${c.por}, que dispara «${c.outra.nome}» (ligada). Confira se é isso mesmo.`);
    for (const t of bloqs) avisos.appendChild(h("p", { class: "au-aviso-lat" }, ui.icone("info"), h("span", null, t)));
    pintarAvisosPassos();
  }
  /** Os mesmos avisos de variável e de laço, também DENTRO do passo (quem está digitando vê ali). */
  function pintarAvisosPassos() {
    const vars = new Map(L.variaveisDosPassos(auto).map(v => [v.indice, v]));
    const cads = L.cadeiasDeAutomacao(auto, dados.itens || [], base);
    blocoEntao.querySelectorAll(".au-passo").forEach((li, i) => {
      let el = li.querySelector(".au-passo-aviso");
      const v = vars.get(i), c = cads.find(x => x.indice === i && x.laco) || cads.find(x => x.indice === i);
      const txt = v ? `Atenção: ${L.fraseVariaveis(v)}.` : c ? (c.laco ? `Laço com «${c.outra.nome}»: uma dispara a outra.` : `Dispara também «${c.outra.nome}».`) : "";
      if (!txt) { if (el) el.remove(); return; }
      if (!el) { el = h("p", { class: "aviso aviso-aten au-passo-aviso" }); const cart = li.querySelector(".au-acao"); (cart || li).appendChild(el); }
      ui.limpar(el); el.append(ui.icone("alerta"), h("span", null, txt));
    });
  }

  /** Mostra os problemas onde eles estão (bloco, condição, passo) — só nas partes que a pessoa já mexeu. */
  function pintarValidacao() {
    const ps = L.problemas(auto, { base, ligar: !!auto.ativo })
      .filter(p => !(p.onde === "entao" && p.indice != null && frescos.has(auto.acoes[p.indice])));
    for (const [onde, bloco] of [["quando", blocoQuando], ["se", blocoSe], ["entao", blocoEntao]]) {
      const e = bloco.querySelector(".au-bloco-erro");
      if (!e) continue;
      const meus = tocado.has(onde) ? ps.filter(p => p.onde === onde && p.indice == null) : [];
      e.textContent = meus.length ? `Falta: ${meus[0].motivo}.` : "";
      e.hidden = !meus.length;
      const itens = tocado.has(onde) ? ps.some(p => p.onde === onde) : false;
      bloco.classList.toggle("au-bloco-com-erro", itens);
    }
    const marca = (lista, onde) => lista.forEach((li, i) => {
      const e = li.querySelector(".au-item-erro");
      if (!e) return;
      const p = tocado.has(onde) ? ps.find(x => x.onde === onde && x.indice === i) : null;
      e.textContent = p ? `Falta: ${L.semPrefixo(p.motivo)}.` : "";
      e.hidden = !p;
      li.classList.toggle("au-tem-erro", !!p);
    });
    marca([...blocoSe.querySelectorAll(".au-cond")], "se");
    marca([...blocoEntao.querySelectorAll(".au-passo")], "entao");
    const pn = tocado.has("nome") ? ps.find(p => p.onde === "nome") : null;
    if (pn) inpNome.setAttribute("aria-invalid", "true"); else inpNome.removeAttribute("aria-invalid");
  }

  function mudou(onde, opcoes) {
    if (onde) tocado.add(onde);
    pintarNome(); pintarDuplicar();
    atualizarPrevia();
    if (opcoes && opcoes.tempo) atualizarTempos();
    pintarValidacao();
    guardarRascunho();
  }

  function mostrarErro(r) {
    frescos.clear();
    tocado.add(r.onde === "nome" ? "nome" : r.onde);
    pintarValidacao();
    const onde = r.onde === "nome" ? null : { quando: blocoQuando, se: blocoSe, entao: blocoEntao }[r.onde];
    if (!onde) {
      inpNome.setAttribute("aria-invalid", "true");
      inpNome.focus();
      ui.toast(`Falta: ${r.motivo}.`, { tipo: "erro" });
      inpNome.addEventListener("input", () => inpNome.removeAttribute("aria-invalid"), { once: true });
      return;
    }
    const e = onde.querySelector(".au-bloco-erro");
    if (r.indice == null || !e.hidden) { e.textContent = `Falta: ${r.motivo}.`; e.hidden = false; }
    onde.classList.add("au-bloco-com-erro");
    onde.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem() });
    let alvo = null;
    if (r.onde === "entao" && r.indice != null) alvo = onde.querySelectorAll(".au-passo")[r.indice];
    if (r.onde === "se" && r.indice != null) alvo = onde.querySelectorAll(".au-cond")[r.indice];
    if (alvo) { const ei = alvo.querySelector(".au-item-erro"); if (ei) { ei.textContent = `Falta: ${L.semPrefixo(r.motivo)}.`; ei.hidden = false; } }
    const f = (alvo || onde).querySelector("select:not(:disabled), input:not(:disabled), textarea:not(:disabled), .au-chip:not(:disabled)");
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 250);
  }

  // ------------------------------------------------ salvar
  let salvando = false;
  let salvoItem = item;          // AS-051: depois de «Salvar e continuar», o que está gravado é a referência (ligada? quantos em espera?)
  const salvar = (botao, { continuar = false } = {}) => {
    if (salvando) return;
    ["nome", "quando", "se", "entao"].forEach(x => tocado.add(x));
    const r = L.validar(auto, { base, ligar: !!auto.ativo });
    mostrarErroSalvar(null);
    if (!r.ok) { mostrarErro(r); return; }
    salvando = true;
    const p = (async () => {
      // plano 1000 · AS-025: ligar no editor algo que manda WhatsApp (ou gasta IA) pede a MESMA confirmação da lista — só quando estava desligada/nova
      const estavaLigada = !!(salvoItem && salvoItem.ativo);
      if (auto.ativo && !estavaLigada && (L.enviaMensagem(auto) || L.temIA(auto))) {
        const ok = await ui.confirmar({ titulo: `Ligar «${auto.nome}»?`, rotulo: "Salvar e ligar",
          texto: L.enviaMensagem(auto) ? "Esta automação envia mensagens de WhatsApp para clientes. Assim que salvar ligada, quem se encaixar no gatilho começa a receber. Dá para desligar a qualquer momento."
            : "Esta automação usa a IA a cada execução (gasta a cota do mês). Assim que salvar ligada, ela começa a rodar." });
        if (!ok) throw Object.assign(new Error("cancelado"), { cancelado: true });
      }
      // plano 1000 · AS-277: salvar DESLIGADA o que estava ligado cancela as esperas em andamento — avisa quem perde os próximos passos
      const avisoEspera = !auto.ativo && estavaLigada ? L.avisoDesligarEspera(salvoItem) : null;
      if (avisoEspera) {
        const ok = await ui.confirmar({ titulo: `Desligar «${auto.nome}»?`, rotulo: "Salvar desligada", perigo: true,
          texto: `${avisoEspera} As esperas desta automação são canceladas ao desligar.` });
        if (!ok) throw Object.assign(new Error("cancelado"), { cancelado: true });
      }
      const salvo = await ctx.api.rpcC("nx_automacao_salvar", { p_auto: L.limpar(auto) });
      salvoJson = JSON.stringify(L.limpar(salvo));
      if (rasc) rasc.apagar(idRasc);            // salvo: o rascunho (inclusive um antigo ainda oferecido) perde o sentido
      if (amb.limparRascunho) amb.limparRascunho();
      ui.toast(salvo.ativo ? `«${salvo.nome}» salva e ligada.` : `«${salvo.nome}» salva (desligada).`, { tipo: "ok" });
      if (continuar) {
        // AS-051: fica no editor — o que está na tela passa a ser o salvo; a nova ganha o id (o próximo «Salvar» atualiza a mesma)
        if (salvo && salvo.id != null) auto.id = salvo.id;
        salvoItem = { ...(salvoItem || {}), ...salvo };
        salvoJson = JSON.stringify(L.limpar(auto));
        ativoSalvo = !!auto.ativo; pintarNotaAtivo();
        if (salvo && salvo.id != null && !item) {
          dados.itens = Array.isArray(dados.itens) ? dados.itens : [];
          if (!dados.itens.some(x => x.id === salvo.id)) dados.itens.push(salvoItem);   // AS-023: o nome dela não conta como «repetido»
          // o rascunho passa a ser o da automação salva (senão o próximo fica como «nova» e, recuperado, criaria uma duplicata)
          if (rasc) rasc.apagar(idRasc);
          idRasc = String(salvo.id);
          try { if (typeof history !== "undefined" && history.replaceState) history.replaceState(history.state, "", `#/automacoes/${encodeURIComponent(salvo.id)}`); } catch { /* o endereço só não muda */ }
        }
        ctx.titulo(salvo.nome || auto.nome || "Automação");
        mudou();
        if (typeof ui.checkSucesso === "function") { try { await ui.checkSucesso(botao, { ms: 500 }); } catch { /* ok */ } }
        return;
      }
      // G9: o ✓ de sucesso no próprio botão antes de voltar à lista (o toast já anuncia; sem texto para não falar duas vezes)
      if (typeof ui.checkSucesso === "function") { try { await ui.checkSucesso(botao, { ms: 500 }); } catch { /* sem o ✓, segue */ } }
      ctx.navegar("#/automacoes");
    })();
    ui.carregando(botao, p).finally(() => { salvando = false; }).catch(e => {
      if (e && e.cancelado) return;          // a pessoa desistiu na confirmação: nada foi gravado
      const msg = L.erroAutomacao(e, ctx.api.mensagemErro(e));
      const lugar = e && e.codigo === "automacao_invalida" && e.hint ? L.ondeDoHint(e.hint) : null;
      if (lugar && lugar.onde) mostrarErro({ motivo: e.hint, onde: lugar.onde, indice: lugar.indice });
      else { mostrarErroSalvar(msg); try { erroSalvar.scrollIntoView({ block: "nearest", behavior: ui.comportamentoRolagem() }); } catch { /* ok */ } }
    });
  };
  if (btSalvarSeguir) btSalvarSeguir.addEventListener("click", () => salvar(btSalvarSeguir, { continuar: true }));
  // plano 1000 · AS-047: Ctrl/⌘+S salva (e não abre o «Salvar página» do navegador) enquanto o editor está na tela
  if (btSalvar && typeof ui.atalho === "function" && amb.aoSair) {
    try {
      amb.aoSair(ui.atalho("mod+s", ev => {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (!raiz.isConnected) return;
        salvar(btSalvar);
      }));
    } catch { /* sem o atalho, o botão basta */ }
  }
  if (btSalvar) {
    btSalvar.addEventListener("click", () => salvar(btSalvar));
    // no celular o cabeçalho não fica preso no topo: o mesmo "Salvar" também no fim da regra
    const btSalvar2 = h("button", { type: "button", class: "bt bt-prim bt-g" }, ui.icone("check"), item ? "Salvar" : "Criar automação");
    btSalvar2.addEventListener("click", () => salvar(btSalvar2));
    painelRegra.appendChild(h("div", { class: "au-rodape-movel" }, btSalvar2));
  }

  // ------------------------------------------------ testar (nx_auto_simular, sem gravar)
  let testando = false;
  let areaSimAtual = areaSim;        // onde o resultado do teste é pintado (o cartão da lateral ou a gaveta do celular)
  async function testar(botao) {
    if (testando) return;
    // plano 1000 · AS-046: no celular (≤ 1080 px), testar pelo topo/menu abre o resultado numa gaveta — rolar até o fim da página tirava a pessoa do lugar
    const naGaveta = botao !== btTestarLado && estreito() && typeof ui.gaveta === "function";
    let destino = areaSim;
    if (naGaveta) {
      destino = h("div", { class: "au-sim au-sim-gaveta", "aria-live": "polite" });
      try { ui.gaveta({ titulo: "Teste da automação", corpo: destino, protegerTexto: false, aoFechar: () => { if (areaSimAtual === destino) areaSimAtual = areaSim; } }); }
      catch { destino = areaSim; }
    }
    areaSimAtual = destino;
    const rolar = () => { if (destino === areaSim) cartaoTeste.scrollIntoView({ block: "nearest", behavior: ui.comportamentoRolagem() }); };
    ui.limpar(destino);
    const r = L.validar(auto, { base, ligar: false });
    // plano 1000 · AS-062: só o gatilho (sem passos ainda) já dá para testar — mostra quem ele pegaria
    const soGatilho = !r.ok && !auto.acoes.length && (r.onde === "entao" || r.onde === "nome")
      && L.problemas({ ...auto, nome: String(auto.nome || "").trim() || "Teste" }, { base, ligar: false }).every(p => p.onde === "entao");
    if (!r.ok && !soGatilho) {
      tocado.add(r.onde === "nome" ? "nome" : r.onde); pintarValidacao();
      destino.appendChild(h("p", { class: "aviso aviso-aten au-sim-aviso" }, ui.icone("alerta"), h("span", null, `Para testar, falta: ${r.motivo}.`)));
      rolar();
      return;
    }
    testando = true;
    destino.appendChild(h("p", { class: "au-sim-carregando" }, h("span", { class: "au-giro", "aria-hidden": "true" }), "Conferindo o que aconteceria agora…"));
    rolar();
    let sim = null, erro = null;
    // plano 1000 · AS-045: o giro aparece no botão clicado (topo, menu ou lateral) e os dois «Testar» ficam ocupados juntos
    const outros = [btTestar, btTestarLado].filter(b => b && b !== botao);
    outros.forEach(b => { b.setAttribute("aria-busy", "true"); b.disabled = true; });
    try {
      const paraTeste = L.limpar(soGatilho ? { ...auto, nome: String(auto.nome || "").trim() || "Teste do gatilho" } : auto);
      const resp = await ui.carregando(botao, ctx.api.rpcC("nx_auto_simular", negocioTeste ? { p_automacao: paraTeste, p_negocio: negocioTeste.id } : { p_automacao: paraTeste }));
      sim = L.normalizarSimulacao(resp, auto, base, vv);
    } catch (e) { erro = e; } finally {
      testando = false;
      outros.forEach(b => { b.removeAttribute("aria-busy"); b.disabled = false; });
    }
    ui.limpar(destino);
    if (soGatilho) destino.appendChild(h("p", { class: "aviso au-sim-aviso au-sim-so-gatilho" }, ui.icone("info"),
      h("span", null, "Ainda sem passos: o teste mostra só quem o gatilho pegaria agora. Acrescente o que fazer em «Então».")));
    pintarSimulacao(sim, erro);
  }

  function pintarSimulacao(sim, erro) {
    const areaSim = areaSimAtual;
    if (erro) {
      const c = String((erro && (erro.codigo || erro.message)) || "");
      const indisponivel = /could not find the function|pgrst202|http_404|funcao_invalida/i.test(c);
      areaSim.appendChild(h("p", { class: "aviso aviso-aten au-sim-aviso" }, ui.icone("alerta"),
        h("span", null, indisponivel ? "O teste ainda não está disponível neste ambiente. Abaixo está o passo a passo do que a automação faz."
          : L.erroAutomacao(erro, ctx.api.mensagemErro(erro)))));
      const plano = L.passosEmFrases(auto, base, vv);
      if (plano.length) areaSim.appendChild(blocoPlano(plano));
      return;
    }
    const n = sim.alvos.length;
    const rotuloTopo = sim.ehAmostra
      ? (n === 0 ? "Nenhum exemplo agora" : n === 1 ? "1 exemplo agora" : `${n} exemplos agora`)
      : (sim.total === 0 ? "Nenhum alvo agora" : sim.total === 1 ? "1 alvo agora" : `${sim.total} alvos agora`);
    areaSim.appendChild(h("div", { class: "au-sim-topo" },
      ui.pilula(rotuloTopo, n === 0 && sim.total === 0 ? "neutra" : "prim", { icone: "olho" }),
      h("span", { class: "sub" }, "Nada foi enviado nem salvo.")));
    // plano 1000 · AS-270: quantas mensagens (e o que mais) sairiam agora, antes da lista
    const saidas = L.resumoSaidasSimulacao(sim);
    if (saidas.texto) areaSim.appendChild(h("p", { class: "au-sim-saidas" }, ui.icone(saidas.mensagens ? "whatsapp" : "raio"), h("span", null, saidas.texto)));
    if (sim.motivo) areaSim.appendChild(h("p", { class: "sub au-sim-motivo" }, sim.motivo));
    else if (n === 0) areaSim.appendChild(h("p", { class: "sub au-sim-motivo" }, sim.porEvento || sim.ehAmostra
      ? "Não há ninguém que esse gatilho pegaria agora. Quando acontecer, é isto que será feito:"
      : "Ninguém se encaixa nesse gatilho e nas condições agora. Quando alguém se encaixar, é isto que será feito:"));
    for (const t of sim.avisos) areaSim.appendChild(h("p", { class: "au-aviso-lat" }, ui.icone("info"), h("span", null, t)));
    if (n) {
      if (sim.ehAmostra) areaSim.appendChild(h("p", { class: "sub au-sim-motivo" }, "Exemplos reais de quem o gatilho pegaria agora e o que seria feito com cada um:"));
      const ul = h("ul", { class: "au-sim-alvos", role: "list" });
      for (const a of sim.alvos) {
        ul.appendChild(h("li", { class: ["au-sim-alvo", a.ignorado && "au-sim-ignorado"] },
          h("div", { class: "au-sim-alvo-cab" },
            h("strong", null, a.titulo),
            a.detalhe ? h("span", { class: "sub" }, a.detalhe) : null,
            a.link ? h("a", { class: "au-sim-link", href: a.link }, "Abrir") : null),
          a.ignorado ? h("p", { class: "au-sim-nota" }, ui.icone("info"), a.motivoIgnorado) : null,
          a.passos.length ? h("ol", { class: "au-sim-passos", role: "list" }, a.passos.map(p => h("li", { class: ["au-sim-passo", `au-sim-${p.estado}`] },
            ui.pilula({ faria: "Faria", pularia: "Pularia", espera: "Esperaria", erro: "Daria erro" }[p.estado] || "Faria",
              { faria: "ok", pularia: "aten", espera: "info", erro: "ruim" }[p.estado] || "neutra"),
            h("span", { class: "au-sim-passo-txt" }, p.rotulo, p.quando ? h("small", null, ` · ${p.quando}`) : null, p.motivo ? h("small", null, ` — ${p.motivo}`) : null)))) : null,
          a.erro ? h("p", { class: "au-sim-erro" }, ui.icone("alerta"), `Com este registro daria erro: ${a.erro}`) : null,
          // AS-298: o erro conhecido vem com o que fazer
          dicaErro(a.erro || (a.passos.find(p => p.estado === "erro") || {}).motivo),
          a.parou ? h("p", { class: "au-sim-nota" }, ui.icone("parar"), "A sequência pararia aqui para este registro.") : null));
      }
      areaSim.appendChild(ul);
      if (!sim.ehAmostra && sim.total > n) areaSim.appendChild(h("p", { class: "sub" }, `Mostrando ${n} de ${sim.total}.`));
    }
    if (sim.plano.length) areaSim.appendChild(blocoPlano(sim.plano));
  }

  /** plano 1000 · AS-298: dica de como resolver um erro comum (com o atalho para onde se resolve). */
  function dicaErro(txt) {
    const d = L.dicaDoErro(txt);
    return d ? h("p", { class: "au-dica-erro sub" }, ui.icone("info"), h("span", null, d.dica, d.href ? [" ", h("a", { href: d.href }, d.rotulo)] : null)) : null;
  }

  function blocoPlano(plano) {
    return h("div", { class: "au-sim-plano" },
      h("p", { class: "rotulo" }, "Passo a passo"),
      h("ol", { class: "au-sim-plano-lista", role: "list" }, plano.map(p => h("li", { class: p.inalcancavel ? "au-sim-nunca" : null },
        h("span", { class: "au-sim-quando mono" }, p.inalcancavel ? "nunca" : p.quando),
        h("span", null, p.frase)))));
  }

  if (btTestar) btTestar.addEventListener("click", () => testar(btTestar));
  btTestarLado.addEventListener("click", () => testar(btTestarLado));

  // ------------------------------------------------ execuções
  let execCarregadas = false;
  let execLimite = 50;
  let execFiltro = "todas";
  let execDia = null;
  let esperasNaTela = 0;        // AS-227: AAAA-MM-DD escolhido no gráfico (null = todos)
  let execSeq = 0;      // plano 1000 · AS-055: só a carga mais nova pinta (Atualizar 2× ou «Carregar mais» + «Atualizar»)
  async function pintarExecucoes(opc = {}) {
    const eu = ++execSeq;
    // a lista é redesenhada (o botão antigo sai da tela): quem usa o teclado continua no mesmo botão
    const refoco = opc.foco || (painelExec.contains(document.activeElement) ? (document.activeElement.classList.contains("au-mais") ? "mais" : document.activeElement.textContent.trim() === "Atualizar" ? "atualizar" : null) : null);
    // AS-056: a recarga automática é suave — sem esqueleto, a lista antiga fica até a nova chegar
    if (!opc.suave) { ui.limpar(painelExec); painelExec.appendChild(ui.esqueleto("lista", 5)); }
    try {
      // série por dia do servidor (contrato 7) junto com a lista; banco antigo (sem a RPC) ou resposta estranha → o gráfico é calculado aqui
      const [lista, porDiaServidor] = await Promise.all([
        ctx.api.rpcC("nx_automacao_execucoes", { p_id: item.id, p_limite: execLimite }),
        ctx.api.rpcC("nx_automacao_execucoes_dia", { p_automacao: item.id, p_dias: 14 }).then(r => L.serieExecucoesServidor(r), () => null),
      ]);
      if (eu !== execSeq) return;           // chegou depois de uma carga mais nova: descarta
      ui.limpar(painelExec);
      const arr = Array.isArray(lista) ? lista : (lista && Array.isArray(lista.itens) ? lista.itens : []);
      const contagem = { todas: arr.length, ok: 0, erro: 0, pulado: 0, espera: 0 };
      for (const x of arr) contagem[L.situacaoExecucao(x)]++;
      const btAtualizar = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("relogio"), "Atualizar");
      btAtualizar.addEventListener("click", () => pintarExecucoes({ foco: "atualizar" }));
      const filtro = h("div", { class: "au-chips au-ex-filtro", role: "radiogroup", "aria-label": "Filtrar por situação" });
      const corpoLista = h("div", { class: "au-ex-corpo" });
      // plano 1000 · AS-227: tocar numa barra do gráfico filtra a lista naquele dia (chip removível)
      const chipDia = h("p", { class: "linha au-ex-dia-filtro", hidden: true });
      const pintarChipDia = () => {
        ui.limpar(chipDia);
        chipDia.hidden = !execDia;
        if (!execDia) return;
        const tirar = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("fechar"), "Ver todos os dias");
        tirar.addEventListener("click", () => { execDia = null; desenhar(); });
        chipDia.append(ui.pilula(`Só ${L.rotuloDia(execDia)}`, "info"), tirar);
      };
      const escolherDia = dia => { execDia = execDia === dia ? null : dia; desenhar(); corpoLista.scrollIntoView && corpoLista.scrollIntoView({ block: "nearest", behavior: ui.comportamentoRolagem() }); };
      const desenhar = () => {
        ui.limpar(corpoLista);
        const vis = arr.filter(x => (execFiltro === "todas" || L.situacaoExecucao(x) === execFiltro) && (!execDia || L.diaDaExecucao(x) === execDia));
        pintarChipDia();
        if (!vis.length) {
          corpoLista.appendChild(ui.vazio({ titulo: arr.length ? "Nada nesta situação" : "Ainda não rodou", icone: "relogio", tema: "automacoes",
            texto: arr.length ? "Tente outro filtro." : item.ativo ? "Assim que o gatilho acontecer, cada execução aparece aqui, com o que foi feito." : "Ela está desligada. Ligue para começar a rodar." }));
          return;
        }
        // linha do tempo agrupada por dia («Hoje», «Ontem», «seg, 02/10»), com entrada escalonada
        let k = 0;
        for (const grupo of L.agruparExecucoesPorDia(vis)) {
          const ul = h("ul", { class: "au-exs", role: "list", "aria-label": `Execuções: ${grupo.rotulo}` });
          for (const x of grupo.itens) { const li = linhaExecucao(x); li.style.setProperty("--i", String(Math.min(k++, 12))); ul.appendChild(li); }
          corpoLista.appendChild(h("section", { class: "au-ex-dia" },
            h("h3", { class: "au-ex-dia-tit" }, h("span", null, grupo.rotulo), h("span", { class: "au-ex-dia-n mono" }, `${grupo.itens.length}`)), ul));
        }
      };
      for (const [k, rot] of L.SITUACOES_EXECUCAO) {
        const b = P.chip({ rotulo: `${rot} · ${contagem[k]}`, ligado: execFiltro === k, modo: "radio", aoClicar: () => {
          execFiltro = k; filtro.querySelectorAll(".au-chip").forEach(c => c.setAttribute("aria-checked", String(c === b))); desenhar(); } });
        // plano 1000 · AS-226: o leitor de tela ouve «Com erro, 2 execuções» (o «·» era lido de um jeito estranho)
        b.setAttribute("aria-label", `${rot}, ${contagem[k]} ${contagem[k] === 1 ? "execução" : "execuções"}`);
        filtro.appendChild(b);
      }
      // quem edita pode impedir o que ainda ia sair (antes a única saída era desligar a automação inteira)
      esperasNaTela = Number(item.em_espera) > 0 ? Number(item.em_espera) : contagem.espera;
      const btCancelarTodas = podeEditar && contagem.espera > 0 ? h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("parar"), "Cancelar todas as esperas") : null;
      if (btCancelarTodas) btCancelarTodas.addEventListener("click", () => cancelarEspera(null, btCancelarTodas));
      painelExec.appendChild(h("div", { class: "au-ex-cab" },
        h("p", { class: "sub" }, `As últimas ${Math.min(arr.length, execLimite)} execuções. Erro numa automação não atrapalha as outras.`),
        h("div", { class: "linha" }, btCancelarTodas, btAtualizar)));
      // gráfico de execuções por dia (item 54): calculado aqui a partir da lista, com estado vazio e versão em tabela.
      // A lista é só as últimas `execLimite`: cheia, pode faltar execução dentro dos 14 dias — a janela recorta no dia da mais
      // antiga carregada e o subtítulo avisa «nas últimas N execuções carregadas» (sem série do servidor, é o honesto).
      // Com a série do servidor (contrato 7) a janela de 14 dias é inteira e conta tudo, não só as carregadas.
      if (porDiaServidor && porDiaServidor.n > 0) {
        painelExec.appendChild(h("div", { class: "cartao au-ex-graf" }, P.graficoDias({ serie: porDiaServidor.serie, dias: porDiaServidor.dias, n: porDiaServidor.n, servidor: true, aoEscolherDia: escolherDia })));
      } else if (arr.length) {
        const truncada = arr.length >= execLimite;
        const porDia = L.execucoesPorDia(arr, { dias: 14, recortar: truncada });
        painelExec.appendChild(h("div", { class: "cartao au-ex-graf" }, P.graficoDias({ serie: porDia.serie, dias: porDia.dias, n: porDia.n,
          carregadas: porDia.recortado ? arr.length : null, aoEscolherDia: escolherDia })));
      }
      P.setas(filtro);
      painelExec.appendChild(filtro);
      painelExec.appendChild(chipDia);
      painelExec.appendChild(corpoLista);
      desenhar();
      if (arr.length >= execLimite && execLimite < 200) {
        const mais = h("button", { type: "button", class: "bt bt-sec bt-p au-mais" }, "Carregar mais");
        mais.addEventListener("click", () => { execLimite = Math.min(200, execLimite + 50); pintarExecucoes({ foco: "mais" }); });
        painelExec.appendChild(mais);
      } else if (arr.length >= execLimite && execLimite >= 200) {
        // plano 1000 · AS-060: no teto o botão some — a frase diz que há mais antigas que não aparecem aqui
        painelExec.appendChild(h("p", { class: "sub au-ex-teto" }, ui.icone("info"),
          h("span", null, `Mostrando as ${execLimite} execuções mais recentes. As mais antigas não aparecem nesta lista.`)));
      }
      execCarregadas = true;
      if (refoco) { const alvo = (refoco === "mais" && painelExec.querySelector(".au-mais")) || btAtualizar; if (alvo) alvo.focus({ preventScroll: true }); }
    } catch (e) {
      if (eu !== execSeq) return;
      ui.limpar(painelExec);
      painelExec.appendChild(ui.erroCartao(e, () => pintarExecucoes()));
    }
  }

  /** Cancela a espera de um registro (x) ou todas as desta automação (x = null): os passos que ainda iam rodar não saem mais. */
  async function cancelarEspera(x, botao) {
    const ok = await ui.confirmar(x
      ? { titulo: "Cancelar esta espera?", rotulo: "Sim, cancelar a espera", perigo: true,
        texto: "Os passos que ainda iam rodar para este registro (mensagem, tarefa, aviso) não saem mais. O que já foi feito continua, e a automação segue ligada para os próximos." }
      // plano 1000 · AS-225: o diálogo diz quantas esperas saem
      : { titulo: esperasNaTela > 1 ? `Cancelar as ${esperasNaTela} esperas desta automação?` : esperasNaTela === 1 ? "Cancelar a espera desta automação?" : "Cancelar todas as esperas?",
        rotulo: esperasNaTela === 1 ? "Sim, cancelar a espera" : "Sim, cancelar as esperas", perigo: true,
        texto: "Ninguém que está em espera nesta automação recebe os passos que faltavam (mensagem, tarefa, aviso). O que já foi feito continua, e a automação segue ligada para os próximos." });
    if (!ok) return;
    try {
      const r = await ui.carregando(botao, ctx.api.rpcC("nx_automacao_cancelar_espera", { p_id: item.id, p_chave: x ? x.chave : null }));
      const n = Number(r && r.canceladas) || 0;
      ui.toast(n === 0 ? "Não havia espera para cancelar: ela pode ter acabado de rodar." : n === 1 ? "1 espera cancelada." : `${n} esperas canceladas.`, { tipo: n ? "ok" : "info" });
      pintarExecucoes({ foco: "atualizar" });
    } catch (e) { ui.toast(L.erroAutomacao(e, ctx.api.mensagemErro(e)), { tipo: "erro" }); }
  }

  function linhaExecucao(x) {
    const sit = L.situacaoExecucao(x);
    const detalhe = L.detalheLegivel(x.detalhe, c => ctx.api.mensagemErro({ codigo: c })) || (sit === "ok" ? "Feito." : sit === "espera" ? "Esperando para continuar." : sit === "pulado" ? "Pulada." : "Erro.");
    const passoTxt = L.passoDaExecucao(x);
    const icone = sit === "ok" ? "check" : sit === "espera" ? "relogio" : sit === "pulado" ? "info" : "alerta";
    const rotuloSit = sit === "ok" ? "Deu certo: " : sit === "espera" ? "Em espera: " : sit === "pulado" ? "Pulada ou parada: " : "Erro: ";
    const estadoTxt = L.estadoExecucaoTexto(x);
    const retoma = sit === "espera" && x.continua_em ? ` · continua ${ui.dataHoraBR(x.continua_em)}` : "";
    const abrir = x.link && /^#\//.test(String(x.link)) ? h("a", { class: "bt bt-fant bt-p au-ex-abrir", href: x.link }, L.rotuloLinkExecucao(x.link, vv), ui.icone("seta-dir")) : null;
    // o que a IA decidiu (etapa, nota, resumo, ou por que não rodou), em destaque e com o motivo dela — antes ficava só no detalhe em texto
    const ia = L.decisaoIA(x.detalhe);
    const blocoIA = ia ? h("div", { class: ["au-ex-ia", `au-ex-ia-${ia.tipo}`], dataset: { tipo: ia.tipo } },
      ui.pilula("IA", ia.tipo === "erro" ? "ruim" : ia.tipo === "pulado" ? "aten" : ia.tipo === "pedida" ? "info" : "prim", { icone: "ia" }),
      h("div", { class: "au-ex-ia-txt" },
        h("p", { class: "au-ex-ia-frase" }, ia.tipo === "nota" ? h("span", { class: "au-ex-ia-nota mono" }, String(ia.score)) : null, ia.frase),
        ia.motivo && ia.tipo !== "pulado" && ia.tipo !== "erro" && ia.tipo !== "pedida" ? h("p", { class: "au-ex-ia-motivo" }, h("span", { class: "sr-only" }, "Motivo da IA: "), `«${ia.motivo}»`) : null)) : null;
    const btParar = podeEditar && sit === "espera" && x.chave ? h("button", { type: "button", class: "bt bt-sec bt-p", "aria-label": "Cancelar esta espera" }, "Cancelar") : null;
    if (btParar) btParar.addEventListener("click", () => cancelarEspera(x, btParar));
    // detalhe expansível (item 54): tudo o que o servidor mandou sobre esta execução, em palavras
    const idDet = novoId("exdet");
    const n = Number(x.passo), tot = Number(x.total_passos);
    // plano 1000 · AS-061: para o cliente, o registro é o link (contato/negócio) e o que aconteceu em palavras; a chave técnica e o texto cru
    // do servidor ficam só para a equipe da plataforma, em «Detalhe técnico»
    const superConta = !!(ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.super);
    const linkReg = x.link && /^#\//.test(String(x.link)) ? h("a", { href: x.link }, L.rotuloLinkExecucao(x.link, vv)) : null;
    const linhasDet = [
      ["Situação", { ok: "Deu certo", espera: "Em espera", pulado: "Pulada ou parada", erro: "Com erro" }[sit] + (estadoTxt ? ` · ${estadoTxt}` : "")],
      Number.isFinite(n) && n > 0 ? ["Passo", Number.isFinite(tot) && tot > 0 ? `${Math.min(n, tot)} de ${tot}` : String(n)] : null,
      ["Registrada em", ui.dataHoraBR(x.criado_em)],
      x.continua_em ? ["Continua em", ui.dataHoraBR(x.continua_em)] : null,
      linkReg ? ["Registro", linkReg] : null,
      ["O que aconteceu", detalhe || "—"],
      superConta && x.chave ? ["Detalhe técnico · chave", String(x.chave)] : null,
      superConta && x.detalhe && String(x.detalhe) !== detalhe ? ["Detalhe técnico · servidor", String(x.detalhe)] : null,
    ].filter(Boolean);
    const det = h("dl", { class: "au-ex-mais", id: idDet, hidden: true }, linhasDet.flatMap(([k, v]) => [h("dt", null, k), h("dd", { class: /^Detalhe técnico/.test(k) ? "mono" : null }, v)]));
    const btDet = h("button", { type: "button", class: "bt bt-fant bt-p au-ex-det-bt", "aria-expanded": "false", "aria-controls": idDet }, "Detalhes", ui.icone("seta-baixo"));
    btDet.addEventListener("click", () => { const abre = det.hidden; det.hidden = !abre; btDet.setAttribute("aria-expanded", String(abre)); });
    return h("li", { class: ["au-ex", sit === "erro" && "au-ex-erro", sit === "pulado" && "au-ex-pulado", sit === "espera" && "au-ex-espera"] },
      h("span", { class: "au-ex-ic", "aria-hidden": "true" }, ui.icone(icone)),
      h("div", { class: "au-ex-txt" },
        passoTxt ? h("p", { class: "au-ex-passo mono" }, passoTxt) : null,
        estadoTxt ? h("p", { class: "au-ex-estado" }, `${estadoTxt}${retoma}`) : null,
        h("p", { class: "au-ex-det" }, h("span", { class: "sr-only" }, rotuloSit), detalhe),
        sit === "erro" ? dicaErro(`${detalhe} ${x.detalhe || ""}`) : null,
        blocoIA,
        h("p", { class: "au-ex-quando mono", title: ui.dataHoraBR(x.criado_em) }, `${ui.horaBR(x.criado_em)} · ${ui.relativo(x.criado_em)}`),
        det),
      h("div", { class: "au-ex-acoes" }, btParar, abrir, btDet));
  }

  function mostrarAba(id) {
    painelRegra.hidden = id !== "regra";
    painelExec.hidden = id !== "execucoes";
    if (id === "execucoes" && !execCarregadas) pintarExecucoes();
    // plano 1000 · AS-048: a aba fica no endereço (F5 e link compartilhado voltam nela) — replaceState não remonta a tela
    if (item) {
      try {
        if (typeof history !== "undefined" && history.replaceState) {
          const alvo = `#/automacoes/${encodeURIComponent(item.id)}${id === "execucoes" ? "?aba=execucoes" : ""}`;
          if (typeof location === "undefined" || location.hash !== alvo) history.replaceState(history.state, "", alvo);
        }
      } catch { /* o endereço só não acompanha */ }
    }
  }

  // ------------------------------------------------ cabeçalho fixo × foco do teclado (WCAG 2.4.11)
  // enquanto o cabeçalho está fixo (≥ 761 px), o scroll-padding do documento acompanha a altura dele: Tab/Shift+Tab não deixam o controle atrás dele
  const cabEd = raiz.querySelector(".au-ed-cab");
  if (cabEd && typeof ResizeObserver === "function" && amb.aoSair) {
    const raizDoc = document.documentElement;
    const medir = () => { const fixo = getComputedStyle(cabEd).position === "sticky"; raizDoc.style.setProperty("--au-cab-h", fixo ? `${cabEd.offsetHeight}px` : "0px"); };
    const ro = new ResizeObserver(medir);
    ro.observe(cabEd);
    window.addEventListener("resize", medir);
    medir();
    amb.aoSair(() => { ro.disconnect(); window.removeEventListener("resize", medir); raizDoc.style.removeProperty("--au-cab-h"); });
  }

  // ------------------------------------------------ paleta Ctrl/⌘+K (item 59): salvar, testar e ver execuções desta automação
  if (ctx.comandos && typeof ctx.comandos.registrar === "function" && amb.aoSair) {
    const reg = c => { try { const cancelar = ctx.comandos.registrar(c); if (typeof cancelar === "function") amb.aoSair(cancelar); } catch { /* a paleta é um extra */ } };
    if (btSalvar) reg({ id: "automacoes.salvar", rotulo: item ? "Salvar automação" : "Criar automação", palavras: "salvar gravar criar", icone: "check", fazer: () => salvar(btSalvar) });
    if (btTestar) reg({ id: "automacoes.testar", rotulo: "Testar automação (sem enviar nada)", palavras: "testar simular conferir", icone: "olho", fazer: () => testar(btTestarLado) });
    if (item) reg({ id: "automacoes.execucoes", rotulo: "Ver execuções desta automação", palavras: "execucoes historico rodou", icone: "relogio",
      fazer: () => { const aba = raiz.querySelectorAll(".au-abas [role=tab]")[1]; if (aba) aba.click(); else mostrarAba("execucoes"); } });
  }

  // ------------------------------------------------ plano 1000 · AS-056: execuções se atualizam sozinhas enquanto a aba está à vista
  // (no máx. 1 recarga suave a cada 20 s, pelo pulso do app; sem esqueleto e sem tirar o filtro escolhido)
  if (item && ctx.pulso && typeof ctx.pulso.assinar === "function" && amb.aoSair) {
    let ultimoExec = Date.now();
    try {
      amb.aoSair(ctx.pulso.assinar(() => {
        if (painelExec.hidden || !execCarregadas || !raiz.isConnected || Date.now() - ultimoExec < 20000) return;
        // quem está lendo um «Detalhes» aberto ou com o foco dentro da lista não tem a lista trocada embaixo
        if ([...painelExec.querySelectorAll(".au-ex-mais")].some(d => !d.hidden) || painelExec.contains(document.activeElement)) return;
        ultimoExec = Date.now();
        pintarExecucoes({ suave: true });
      }) || (() => {}));
    } catch { /* sem pulso, o «Atualizar» continua */ }
  }

  // ------------------------------------------------ primeira pintura
  pintarQuando(); pintarSe(); pintarEntao(); atualizarPrevia(true); pintarNome();
  if (amb.aoSair) amb.aoSair(() => clearTimeout(tDiagrama));
  if (salvoJson === null && item) salvoJson = JSON.stringify(L.limpar(auto));
  if (item && q.aba === "execucoes") mostrarAba("execucoes");
  // montagem reprovada: o problema já aparece no lugar dele (o da conferência local; se só o servidor viu, o motivo dele no bloco apontado)
  if (rascunho && rascunho.reprovada && podeEditar) {
    const r = L.validar(auto, { base, ligar: false });
    const rv = rascunho.reprovada;
    if (!r.ok) setTimeout(() => mostrarErro(r), 80);
    else if (["nome", "quando", "se", "entao"].includes(rv.onde)) setTimeout(() => mostrarErro({ motivo: rv.motivo, onde: rv.onde, indice: rv.indice }), 80);
  }
  if (!item && podeEditar && origem === "branco") setTimeout(() => { if (!auto.nome) inpNome.focus({ preventScroll: true }); }, 60);
  if (podeEditar && (amb.testarAoAbrir || q.testar === "1")) setTimeout(() => testar(btTestarLado), 120);
}
