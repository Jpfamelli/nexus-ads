/* ============================================================
   ÓRBITA — auto-editor.js · frente F7 · editor das Automações (PLANO-NOITE-20261001)
   Carregado por automacoes.js via import() com ?v=. Entrega telaEditor(ctx, raiz, dados, item, amb):
     Quando → Se → Então, com o «Então» como LINHA DO TEMPO (passos, esperas e parar), validação ao vivo,
     «Testar» (nx_auto_simular, sem gravar), «Duplicar» e o histórico de execuções com filtro.
   amb = { L: auto-logica, P: auto-pecas (já com ui), rascunho: {auto, explicacao, avisos}|null,
           duplicar(ctx, auto), limparRascunho(), testarAoAbrir }.
   Regras do app: sem import estático, texto de usuário só por textContent (ui.h), nenhuma cor aqui.
   ============================================================ */

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
  const swAtivo = interruptor({ ligado: !!auto.ativo, rotulo: "Ligada", mostrarTexto: true, desabilitado: !podeEditar,
    aoMudar: v => { auto.ativo = v; mudou(); } });
  const btSalvar = podeEditar ? h("button", { type: "button", class: "bt bt-prim" }, ui.icone("check"), item ? "Salvar" : "Criar automação") : null;
  const btCancelar = h("button", { type: "button", class: "bt bt-sec" }, podeEditar ? "Cancelar" : "Voltar");
  const btTestar = podeEditar ? h("button", { type: "button", class: "bt bt-sec", title: "Veja o que aconteceria agora, sem enviar nada" }, ui.icone("olho"), "Testar") : null;
  const btDuplicar = podeEditar && item ? h("button", { type: "button", class: "bt bt-fant", title: "Cria uma cópia desligada" }, ui.icone("copiar"), "Duplicar") : null;
  /** Há edição que ainda não foi salva (a mesma régua do «Cancelar», da atualização automática e do rascunho). */
  const temPendencia = () => podeEditar && (salvoJson !== null ? sujo() : !!(auto.nome || auto.acoes.length));

  // ------------------------------------------------ rascunho: o que não foi salvo fica guardado na aba (recarregar, Voltar, menu e paleta não perdem)
  const rasc = podeEditar && amb.rascunhos ? amb.rascunhos : null;
  const idRasc = item ? item.id : "nova";
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
    } else if (podeEditar && salvoJson === null && (auto.nome || auto.acoes.length)) {
      const ok = await ui.confirmar({ titulo: "Descartar esta automação?", texto: "Ela ainda não foi salva.", rotulo: "Descartar", perigo: true });
      if (!ok) return;
    }
    apagarRascunho();
    if (amb.limparRascunho) amb.limparRascunho();
    ctx.navegar("#/automacoes");
  }
  btCancelar.addEventListener("click", sair);
  if (btDuplicar) btDuplicar.addEventListener("click", () => amb.duplicar(ctx, auto));
  // o link do topo sai pelo mesmo caminho do «Cancelar» (Ctrl/⌘+clique e botão do meio continuam abrindo outra aba)
  const linkVoltar = h("a", { class: "au-voltar", href: "#/automacoes" }, ui.icone("seta-esq"), "Automações");
  linkVoltar.addEventListener("click", ev => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    sair();
  });
  // a atualização automática do app não recarrega a página com edição pendente
  if (typeof ctx.naoAtualizar === "function" && amb.aoSair) amb.aoSair(ctx.naoAtualizar(temPendencia));

  const rotuloOrigem = item ? "Automação" : origem === "ia" ? "Nova automação · montada pela IA" : modelo ? "Nova automação · a partir de uma receita" : "Nova automação";
  raiz.appendChild(h("header", { class: "au-ed-cab" },
    // título da página para leitor de tela (o nome visível é um campo editável, não um cabeçalho)
    h("h1", { class: "sr-only" }, item ? `Automação: ${item.nome}` : "Nova automação"),
    linkVoltar,
    h("div", { class: "au-ed-linha" },
      h("div", { class: "au-ed-nome" }, h("label", { class: "rotulo", for: nomeId }, rotuloOrigem), inpNome),
      h("div", { class: "linha au-ed-acoes" }, swAtivo, btTestar, btDuplicar, btCancelar, btSalvar))));
  if (!podeEditar) raiz.appendChild(h("p", { class: "aviso au-aviso-papel" }, ui.icone("cadeado"),
    h("span", null, "Somente leitura: administradores editam automações.")));

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
          // o foco não pode cair no <body>: segue para o primeiro controle do que vem depois da caixa
          if (tinhaFoco) { const prox = raiz.querySelector(".au-abas [role=tab][aria-selected=true], .au-nome-inp:not(:disabled), .au-painel select:not(:disabled)"); if (prox) prox.focus({ preventScroll: true }); }
        } } }, ui.icone("fechar"))),
      rascunho.explicacao ? h("p", { class: "au-ia-ped-txt" }, rascunho.explicacao) : null,
      avisosIA.length ? h("ul", { class: "au-ia-ped-avisos", role: "list" }, avisosIA.map(t => h("li", null, ui.icone("alerta"), h("span", null, t)))) : null,
      h("p", { class: "sub" }, "Nada foi salvo ainda. Ajuste o que quiser abaixo e toque em «Criar automação». A IA só escolhe entre as etapas, etiquetas e pessoas que já existem no seu sistema."));
    raiz.appendChild(caixa);
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
  const cartaoTeste = podeEditar ? h("div", { class: "cartao au-teste", id: novoId("teste") },
    h("p", { class: "rotulo" }, "Testar sem risco"),
    h("p", { class: "sub" }, "Veja o que aconteceria agora com o que está na tela. Nada é enviado nem salvo."),
    h("div", { class: "linha" }, btTestarLado),
    areaSim) : null;
  const lado = h("aside", { class: "au-lado", "aria-label": "Resumo da automação" },
    h("div", { class: "cartao au-previa" },
      h("p", { class: "rotulo" }, "Em uma frase"), frase, estado, avisos),
    cartaoTeste,
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
    const sel = seletor({ rotulo: "Gatilho", valor: auto.gatilho, opcoes: grupos, desabilitado: !podeEditar, classe: "au-sel-gat",
      ajuda: g && g.descricao ? g.descricao : null,
      aoMudar: v => { Object.assign(auto, L.trocarGatilho(auto, v)); pintarQuando(); mudou("quando"); } });
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
        return seletor({ rotulo: f.rotulo, valor: v, opcoes: opcoesBase(dados, "estagio", { funil }), vazio: f.opcional ? "Qualquer etapa" : "Escolha a etapa…",
          desabilitado: !podeEditar, obrigatorio: !f.opcional, aoMudar: x => set(x || null) });
      }
      case "numero":
        return entrada({ rotulo: f.rotulo, valor: v ?? "", tipo: "number", min: f.min, max: f.max, passo: 1, sufixo: f.sufixo, desabilitado: !podeEditar,
          obrigatorio: f.obrigatorio, ajuda: `De ${f.min} a ${f.max}.`, aoMudar: x => set(x === "" ? null : Number(x)) });
      case "palavras":
        return entrada({ rotulo: f.rotulo, valor: (v || []).join(", "), placeholder: "preço, valor, quanto custa", ajuda: f.ajuda, desabilitado: !podeEditar,
          aoMudar: x => set(x.split(",").map(s => s.trim()).filter(Boolean)) });
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
    if (btMais) btMais.addEventListener("click", () => {
      auto.condicoes.push({ campo: "origem", op: "igual", valor: "" });
      pintarSe(); mudou("se");
      const sel = blocoSe.querySelectorAll(".au-cond");
      const ult = sel[sel.length - 1];
      if (ult) { const f = ult.querySelector("select"); if (f) f.focus(); }
    });
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
    const selCampo = seletor({ rotulo: "Campo", valor: cd.campo, opcoes: L.camposCondicao(base), desabilitado: !podeEditar, classe: "au-cond-campo",
      aoMudar: v => { cd.campo = v; cd.op = L.operadoresDe(v)[0]; cd.valor = ""; pintarSe(); mudou("se"); } });
    const selOp = seletor({ rotulo: "Comparação", valor: cd.op, opcoes: ops, desabilitado: !podeEditar, classe: "au-cond-op",
      aoMudar: v => { cd.op = v; if (L.operadorSemValor(v)) delete cd.valor; pintarSe(); mudou("se"); } });
    let ctlValor = null;
    if (!L.operadorSemValor(cd.op)) {
      const set = v => { cd.valor = v; mudou("se"); };
      const mapa = { funil: "funil", estagio: "estagio", canal: "canal", departamento: "departamento", etiqueta: "etiqueta", pessoa: "pessoa" };
      if (tipo === "origem") ctlValor = seletor({ rotulo: "Valor", valor: cd.valor, vazio: "Escolha…", opcoes: L.ORIGENS.map(([k, r]) => ({ valor: k, rotulo: r })), desabilitado: !podeEditar, aoMudar: set, classe: "au-cond-val" });
      else if (mapa[tipo]) ctlValor = seletor({ rotulo: "Valor", valor: cd.valor, vazio: "Escolha…", opcoes: opcoesBase(dados, mapa[tipo]), desabilitado: !podeEditar, aoMudar: set, classe: "au-cond-val" });
      else if (tipo === "numero") ctlValor = entrada({ rotulo: "Valor (R$)", valor: cd.valor ?? "", tipo: "number", min: 0, passo: "0.01", desabilitado: !podeEditar, aoMudar: set });
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

  function pintarEntao() {
    ui.limpar(blocoEntao);
    const tl = L.linhaDoTempo(auto.acoes);
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
      if (paletaAberta) { const b = paleta.querySelector("button"); if (b) b.focus({ preventScroll: true }); }
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
            h("p", { class: "sub" }, temMensagem ? "Mensagens fora do horário do departamento esperam a próxima abertura." : "Vale para passos que mandam mensagem.")),
          swHorario),
        h("p", { class: "au-bloco-erro", role: "alert", hidden: true })));
    pintarValidacao();
  }

  /** Paleta de passos por grupo (Mensagens, CRM, Equipe, Sequência, IA). */
  function montarPaleta() {
    const pal = h("div", { class: "au-paleta", role: "group", "aria-label": "Escolha o passo" });
    for (const grupo of L.GRUPOS_ACAO) {
      const itens = L.ACOES.filter(a => a.grupo === grupo && a.disponivel !== false && a.menu !== false);
      if (!itens.length) continue;
      pal.appendChild(h("section", { class: "au-paleta-grupo" },
        h("h3", { class: "rotulo" }, grupo),
        h("div", { class: "au-paleta-grade" }, itens.map(a => {
          const b = h("button", { type: "button", class: ["au-tile", a.sequencia && "au-tile-seq", a.ia && "au-tile-ia"] },
            h("span", { class: "au-tile-ic", "aria-hidden": "true" }, ui.icone(a.icone)),
            h("span", { class: "au-tile-txt" }, h("strong", null, L.rotuloAcao(a.id, vv)), h("small", null, a.descricao || ""),
              iaOff && a.ia ? h("small", { class: "au-tile-off" }, "IA ainda desligada: o passo seria pulado") : null));
          b.addEventListener("click", () => adicionar(a.id));
          return b;
        }))));
    }
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
    const li = h("li", { class: ["au-passo", `au-passo-${ac.tipo}`, t.inalcancavel && "au-passo-inalcancavel"], dataset: { i: String(i), tipo: ac.tipo } },
      h("div", { class: "au-passo-trilho", "aria-hidden": "true" }, h("span", { class: "au-passo-no" }, ui.icone(def ? def.icone : "raio"))),
      h("div", { class: "au-passo-corpo" },
        h("p", { class: "au-passo-quando mono" }, t.inalcancavel ? "Nunca roda (depois de «Parar»)" : t.quando),
        cartao));
    // arrastar para reordenar (a alça liga o draggable; teclado usa os botões subir/descer)
    if (alca) {
      alca.addEventListener("pointerdown", () => { li.draggable = true; });
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

  /** Atualiza só os textos de tempo (sem redesenhar os campos que a pessoa está digitando). */
  function atualizarTempos() {
    const tl = L.linhaDoTempo(auto.acoes);
    blocoEntao.querySelectorAll(".au-passo").forEach((li, i) => {
      const t = tl[i]; if (!t) return;
      const q2 = li.querySelector(".au-passo-quando");
      if (q2) q2.textContent = t.inalcancavel ? "Nunca roda (depois de «Parar»)" : t.quando;
      li.classList.toggle("au-passo-inalcancavel", !!t.inalcancavel);
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
      case "texto_longo":
        return entrada({ rotulo: f.rotulo, valor: v ?? "", tipo: "textarea", max: f.max, variaveis: f.variaveis, desabilitado: dis, ajuda: f.ajuda,
          obrigatorio: f.obrigatorio, aoMudar: x => { ac[f.nome] = x; mudou("entao"); } });
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
        return seletor({ rotulo: f.rotulo, valor: v, opcoes: opcoesBase(dados, "estagio", { funil }), vazio: f.opcional ? "Primeira etapa do funil" : "Escolha a etapa…",
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
          h("p", { class: "sub" }, "Depois, em Configurações → Números de WhatsApp, use «Sincronizar modelos». Enquanto isso, você pode salvar esta automação desligada. Ou use «Enviar mensagem» (texto livre, pelo CodeWords)."),
          h("div", { class: "linha" }, btCopiar))));
      if (ac.template_nome) box.appendChild(h("p", { class: "sub" }, `Modelo esperado: «${ac.template_nome}».`));
      return box;
    }
    const opcoes = todos.map(t => {
      const ok = String(t.status || "").toUpperCase() === "APPROVED";
      const c = canal(t.canal_id);
      return { valor: t.id, rotulo: `${t.nome} · ${t.idioma}${t.categoria ? ` · ${rotuloCategoria(t.categoria)}` : ""}${c ? ` · ${c.nome}` : ""}${ok ? "" : " · aguardando aprovação"}`, desabilitado: !ok };
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
    if (!t) return box;
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
  function atualizarPrevia() {
    frase.textContent = L.descrever(auto, base, vv);
    const r = L.validar(auto, { base, ligar: !!auto.ativo });
    ui.limpar(estado);
    estado.className = ["au-estado", r.ok ? "au-ok" : "au-falta"].join(" ");
    estado.append(ui.icone(r.ok ? "check" : "alerta"), h("span", null, r.ok
      ? (auto.ativo ? "Pronta. Ao salvar, começa a rodar em até 15 segundos." : "Pronta. Vai ficar salva e desligada.")
      : `Falta: ${r.motivo}.`));
    ui.limpar(avisos);
    const bloqs = [];
    if (L.enviaMensagem(auto)) bloqs.push("Mensagens de WhatsApp saem pelo CodeWords (número por aparelho). No WhatsApp oficial (Meta), texto livre só dentro de 24 h da última mensagem do cliente; fora disso, só modelo aprovado.");
    if (L.faltaModelo(auto)) bloqs.push("Sem modelo aprovado escolhido: dá para salvar desligada e ligar quando a Meta aprovar.");
    if (auto.gatilho === "antes_da_data" && auto.acoes.some(a => a.tipo === "enviar_template" && (a.parametros || []).some(p => /\{hora_consulta\}/.test(p))))
      bloqs.push(`Quem tiver só a data (sem a hora) da ${L.palavraConsulta(vertical)} aparece nas execuções como erro, para ninguém receber mensagem com buraco.`);
    if (iaOff && L.temIA(auto)) bloqs.push(L.AVISO_IA_DESLIGADA);
    for (const t of L.avisosEstrutura(auto)) bloqs.push(t);
    for (const t of bloqs) avisos.appendChild(h("p", { class: "au-aviso-lat" }, ui.icone("info"), h("span", null, t)));
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
  const salvar = botao => {
    if (salvando) return;
    ["nome", "quando", "se", "entao"].forEach(x => tocado.add(x));
    const r = L.validar(auto, { base, ligar: !!auto.ativo });
    if (!r.ok) { mostrarErro(r); return; }
    salvando = true;
    const p = (async () => {
      const salvo = await ctx.api.rpcC("nx_automacao_salvar", { p_auto: L.limpar(auto) });
      salvoJson = JSON.stringify(L.limpar(salvo));
      if (rasc) rasc.apagar(idRasc);            // salvo: o rascunho (inclusive um antigo ainda oferecido) perde o sentido
      if (amb.limparRascunho) amb.limparRascunho();
      ui.toast(salvo.ativo ? `«${salvo.nome}» salva e ligada.` : `«${salvo.nome}» salva (desligada).`, { tipo: "ok" });
      ctx.navegar("#/automacoes");
    })();
    ui.carregando(botao, p).finally(() => { salvando = false; }).catch(e => {
      const msg = L.erroAutomacao(e, ctx.api.mensagemErro(e));
      const lugar = e && e.codigo === "automacao_invalida" && e.hint ? L.ondeDoHint(e.hint) : null;
      if (lugar && lugar.onde) mostrarErro({ motivo: e.hint, onde: lugar.onde, indice: lugar.indice });
      else ui.toast(msg, { tipo: "erro" });
    });
  };
  if (btSalvar) {
    btSalvar.addEventListener("click", () => salvar(btSalvar));
    // no celular o cabeçalho não fica preso no topo: o mesmo "Salvar" também no fim da regra
    const btSalvar2 = h("button", { type: "button", class: "bt bt-prim bt-g" }, ui.icone("check"), item ? "Salvar" : "Criar automação");
    btSalvar2.addEventListener("click", () => salvar(btSalvar2));
    painelRegra.appendChild(h("div", { class: "au-rodape-movel" }, btSalvar2));
  }

  // ------------------------------------------------ testar (nx_auto_simular, sem gravar)
  let testando = false;
  async function testar(botao) {
    if (testando) return;
    ui.limpar(areaSim);
    const r = L.validar(auto, { base, ligar: false });
    if (!r.ok) {
      tocado.add(r.onde === "nome" ? "nome" : r.onde); pintarValidacao();
      areaSim.appendChild(h("p", { class: "aviso aviso-aten au-sim-aviso" }, ui.icone("alerta"), h("span", null, `Para testar, falta: ${r.motivo}.`)));
      cartaoTeste.scrollIntoView({ block: "nearest", behavior: ui.comportamentoRolagem() });
      return;
    }
    testando = true;
    areaSim.appendChild(h("p", { class: "au-sim-carregando" }, h("span", { class: "au-giro", "aria-hidden": "true" }), "Conferindo o que aconteceria agora…"));
    cartaoTeste.scrollIntoView({ block: "nearest", behavior: ui.comportamentoRolagem() });
    let sim = null, erro = null;
    try {
      const resp = await ui.carregando(botao, ctx.api.rpcC("nx_auto_simular", { p_automacao: L.limpar(auto) }));
      sim = L.normalizarSimulacao(resp, auto, base, vv);
    } catch (e) { erro = e; } finally { testando = false; }
    ui.limpar(areaSim);
    pintarSimulacao(sim, erro);
  }

  function pintarSimulacao(sim, erro) {
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
          a.parou ? h("p", { class: "au-sim-nota" }, ui.icone("parar"), "A sequência pararia aqui para este registro.") : null));
      }
      areaSim.appendChild(ul);
      if (!sim.ehAmostra && sim.total > n) areaSim.appendChild(h("p", { class: "sub" }, `Mostrando ${n} de ${sim.total}.`));
    }
    if (sim.plano.length) areaSim.appendChild(blocoPlano(sim.plano));
  }

  function blocoPlano(plano) {
    return h("div", { class: "au-sim-plano" },
      h("p", { class: "rotulo" }, "Passo a passo"),
      h("ol", { class: "au-sim-plano-lista", role: "list" }, plano.map(p => h("li", { class: p.inalcancavel ? "au-sim-nunca" : null },
        h("span", { class: "au-sim-quando mono" }, p.inalcancavel ? "nunca" : p.quando),
        h("span", null, p.frase)))));
  }

  if (btTestar) btTestar.addEventListener("click", () => testar(btTestarLado));
  btTestarLado.addEventListener("click", () => testar(btTestarLado));

  // ------------------------------------------------ execuções
  let execCarregadas = false;
  let execLimite = 50;
  let execFiltro = "todas";
  async function pintarExecucoes(opc = {}) {
    // a lista é redesenhada (o botão antigo sai da tela): quem usa o teclado continua no mesmo botão
    const refoco = opc.foco || (painelExec.contains(document.activeElement) ? (document.activeElement.classList.contains("au-mais") ? "mais" : document.activeElement.textContent.trim() === "Atualizar" ? "atualizar" : null) : null);
    ui.limpar(painelExec);
    painelExec.appendChild(ui.esqueleto("lista", 5));
    try {
      const lista = await ctx.api.rpcC("nx_automacao_execucoes", { p_id: item.id, p_limite: execLimite });
      ui.limpar(painelExec);
      const arr = Array.isArray(lista) ? lista : (lista && Array.isArray(lista.itens) ? lista.itens : []);
      const contagem = { todas: arr.length, ok: 0, erro: 0, pulado: 0, espera: 0 };
      for (const x of arr) contagem[L.situacaoExecucao(x)]++;
      const btAtualizar = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("relogio"), "Atualizar");
      btAtualizar.addEventListener("click", () => pintarExecucoes({ foco: "atualizar" }));
      const filtro = h("div", { class: "au-chips au-ex-filtro", role: "radiogroup", "aria-label": "Filtrar por situação" });
      const corpoLista = h("div", { class: "au-ex-corpo" });
      const desenhar = () => {
        ui.limpar(corpoLista);
        const vis = arr.filter(x => execFiltro === "todas" || L.situacaoExecucao(x) === execFiltro);
        if (!vis.length) {
          corpoLista.appendChild(ui.vazio({ titulo: arr.length ? "Nada nesta situação" : "Ainda não rodou", icone: "relogio",
            texto: arr.length ? "Tente outro filtro." : item.ativo ? "Assim que o gatilho acontecer, cada execução aparece aqui, com o que foi feito." : "Ela está desligada. Ligue para começar a rodar." }));
          return;
        }
        const ul = h("ul", { class: "au-exs", role: "list" });
        for (const x of vis) ul.appendChild(linhaExecucao(x));
        corpoLista.appendChild(ul);
      };
      for (const [k, rot] of L.SITUACOES_EXECUCAO) {
        const b = P.chip({ rotulo: `${rot} · ${contagem[k]}`, ligado: execFiltro === k, modo: "radio", aoClicar: () => {
          execFiltro = k; filtro.querySelectorAll(".au-chip").forEach(c => c.setAttribute("aria-checked", String(c === b))); desenhar(); } });
        filtro.appendChild(b);
      }
      // quem edita pode impedir o que ainda ia sair (antes a única saída era desligar a automação inteira)
      const btCancelarTodas = podeEditar && contagem.espera > 0 ? h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("parar"), "Cancelar todas as esperas") : null;
      if (btCancelarTodas) btCancelarTodas.addEventListener("click", () => cancelarEspera(null, btCancelarTodas));
      painelExec.appendChild(h("div", { class: "au-ex-cab" },
        h("p", { class: "sub" }, `As últimas ${Math.min(arr.length, execLimite)} execuções. Erro numa automação não atrapalha as outras.`),
        h("div", { class: "linha" }, btCancelarTodas, btAtualizar)));
      P.setas(filtro);
      painelExec.appendChild(filtro);
      painelExec.appendChild(corpoLista);
      desenhar();
      if (arr.length >= execLimite && execLimite < 200) {
        const mais = h("button", { type: "button", class: "bt bt-sec bt-p au-mais" }, "Carregar mais");
        mais.addEventListener("click", () => { execLimite = Math.min(200, execLimite + 50); pintarExecucoes({ foco: "mais" }); });
        painelExec.appendChild(mais);
      }
      execCarregadas = true;
      if (refoco) { const alvo = (refoco === "mais" && painelExec.querySelector(".au-mais")) || btAtualizar; if (alvo) alvo.focus({ preventScroll: true }); }
    } catch (e) {
      ui.limpar(painelExec);
      painelExec.appendChild(ui.erroCartao(e, () => pintarExecucoes()));
    }
  }

  /** Cancela a espera de um registro (x) ou todas as desta automação (x = null): os passos que ainda iam rodar não saem mais. */
  async function cancelarEspera(x, botao) {
    const ok = await ui.confirmar(x
      ? { titulo: "Cancelar esta espera?", rotulo: "Sim, cancelar a espera", perigo: true,
        texto: "Os passos que ainda iam rodar para este registro (mensagem, tarefa, aviso) não saem mais. O que já foi feito continua, e a automação segue ligada para os próximos." }
      : { titulo: "Cancelar todas as esperas?", rotulo: "Sim, cancelar as esperas", perigo: true,
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
    const abrir = x.link && /^#\//.test(String(x.link)) ? h("a", { class: "bt bt-fant bt-p au-ex-abrir", href: x.link }, "Abrir", ui.icone("seta-dir")) : null;
    const btParar = podeEditar && sit === "espera" && x.chave ? h("button", { type: "button", class: "bt bt-sec bt-p", "aria-label": "Cancelar esta espera" }, "Cancelar") : null;
    if (btParar) btParar.addEventListener("click", () => cancelarEspera(x, btParar));
    return h("li", { class: ["au-ex", sit === "erro" && "au-ex-erro", sit === "pulado" && "au-ex-pulado", sit === "espera" && "au-ex-espera"] },
      h("span", { class: "au-ex-ic", "aria-hidden": "true" }, ui.icone(icone)),
      h("div", { class: "au-ex-txt" },
        passoTxt ? h("p", { class: "au-ex-passo mono" }, passoTxt) : null,
        estadoTxt ? h("p", { class: "au-ex-estado" }, `${estadoTxt}${retoma}`) : null,
        h("p", { class: "au-ex-det" }, h("span", { class: "sr-only" }, rotuloSit), detalhe),
        h("p", { class: "au-ex-quando mono", title: ui.dataHoraBR(x.criado_em) }, `${ui.dataHoraBR(x.criado_em)} · ${ui.relativo(x.criado_em)}`)),
      abrir || btParar ? h("div", { class: "au-ex-acoes" }, btParar, abrir) : null);
  }

  function mostrarAba(id) {
    painelRegra.hidden = id !== "regra";
    painelExec.hidden = id !== "execucoes";
    if (id === "execucoes" && !execCarregadas) pintarExecucoes();
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

  // ------------------------------------------------ primeira pintura
  pintarQuando(); pintarSe(); pintarEntao(); atualizarPrevia();
  if (salvoJson === null && item) salvoJson = JSON.stringify(L.limpar(auto));
  if (item && q.aba === "execucoes") mostrarAba("execucoes");
  if (!item && podeEditar && origem === "branco") setTimeout(() => { if (!auto.nome) inpNome.focus({ preventScroll: true }); }, 60);
  if (podeEditar && (amb.testarAoAbrir || q.testar === "1")) setTimeout(() => testar(btTestarLado), 120);
}
