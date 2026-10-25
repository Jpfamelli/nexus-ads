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
/** plano 1000b · UB-021: os avisos da lateral («Em uma frase») esperam este tempo sem tecla antes de serem refeitos. */
export const AVISOS_MS = 120;
/** plano 1000b · UB-024: aviso lateral quando o horário do departamento padrão não abre nunca (a mensagem não sairia). */
export const AVISO_SEM_HORARIO = "«Respeitar horário» está ligado, mas o departamento padrão não tem horário de atendimento: as mensagens não sairiam. Cadastre o horário em Configurações → Departamentos ou desligue o «Respeitar horário».";
/** plano 1000b · UB-037: a série de 14 dias (gráfico) só é relida pela recarga automática depois deste tempo — ou quando a lista mudou. */
export const SERIE_MS = 5 * 60 * 1000;
/** plano 1000b · UB-078: onde fica lembrado se a pessoa abriu ou recolheu o «Ver o fluxo» (por aparelho). */
export const CHAVE_FLUXO = "nx-au-fluxo";
/** plano 1500c · UCA-086: o rascunho da aba é gravado este tempo depois da última tecla (sair/esconder a página grava na hora). */
export const RASCUNHO_MS = 400;
/** plano 1500c · UCA-092: o estado vai para a pilha do Desfazer este tempo depois da última mudança (uma palavra digitada = um passo). */
export const HISTORICO_MS = 600;

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
    auto = L.aplicarModelo(q.modelo, base, vv, { tom: q.tom === "formal" ? "formal" : undefined });   // plano 2000d · DU-419: o tom escolhido na galeria
    // plano 1500c · UCA-037: toda receita nasce desligada (como diz a lista e a novaAutomacao): «Pós-venda» não cria tarefa para todos
    // os ganhos ao primeiro Salvar sem a pessoa ter escolhido ligar
    auto.ativo = false;
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
  // plano 1000b · UB-073: a etapa do exemplo vem do funil padrão desta empresa
  const exemplo = L.exemploVariaveis({ empresa: ctx.cliente ? ctx.cliente.nome : "", atendente: ctx.sessao && ctx.sessao.conta ? ctx.sessao.conta.nome : "Ana", base: dados.base, vertical });   // plano 2000d · DU-038
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
  // plano 1000b · UB-056: o nome tem teto de 80 — a partir de 64 letras aparece «70/80» (antes o campo só parava de aceitar)
  const contNome = h("small", { class: "au-nome-cont mono", id: novoId("nomecont"), hidden: true });
  function pintarContNome() {
    const n = String(inpNome.value || "").length;
    const mostra = n >= 64;
    if (contNome.hidden !== !mostra) contNome.hidden = !mostra;
    const txt = mostra ? `${n}/80` : "";
    if (contNome.textContent !== txt) contNome.textContent = txt;
    contNome.dataset.tom = n >= 80 ? "ruim" : n >= 72 ? "aten" : "neutra";
  }
  function pintarNome() {
    pintarContNome();
    const s = L.sugestaoNome(auto, base, vv);
    inpNome.placeholder = s ? `Ex.: ${s}` : "Nome da automação";
    if (btSugestao) {
      btSugestao.hidden = !s || !!String(auto.nome || "").trim();
      btSugestao.textContent = s ? `Usar sugestão: «${s}»` : "";
    }
    const rep = L.nomeRepetido(auto.nome, dados.itens || [], item ? item.id : (auto.id || null));
    avisoNome.hidden = !rep;
    avisoNome.textContent = rep ? `Já existe uma automação chamada «${rep.nome}». Dá para salvar, mas um nome diferente ajuda a achar cada uma na lista e nas execuções.` : "";
    const descr = [rep ? avisoNome.id : null, !contNome.hidden ? contNome.id : null].filter(Boolean).join(" ");
    if (descr) inpNome.setAttribute("aria-describedby", descr); else inpNome.removeAttribute("aria-describedby");
  }
  // plano 1000 · AS-268: mexer no interruptor do topo não liga nada na hora — o texto ao lado diz que vale ao salvar
  let ativoSalvo = !!(item && item.ativo);
  const notaAtivo = h("span", { class: "au-sw-nota", id: novoId("swnota"), role: "status", hidden: true });
  const pintarNotaAtivo = () => {
    const dif = !!auto.ativo !== ativoSalvo;
    notaAtivo.hidden = !dif;
    notaAtivo.textContent = dif ? (auto.ativo ? "Liga ao salvar" : "Desliga ao salvar") : "";
  };
  // plano 1500c · UCA-011: nome acessível neutro (antes: «Ligada, interruptor, desligado»)
  const swAtivo = interruptor({ ligado: !!auto.ativo, rotulo: "Automação ativa", mostrarTexto: true, desabilitado: !podeEditar,
    aoMudar: v => { auto.ativo = v; pintarNotaAtivo(); mudou(); } });
  swAtivo.setAttribute("aria-describedby", notaAtivo.id);
  // revisão 1000b · UB-122: data-escrita — sem internet o shell (app.js SEL_ESCRITA) marca este botão aria-disabled com a dica antes do clique
  const btSalvar = podeEditar ? h("button", { type: "button", class: "bt bt-prim", "data-escrita": "" }, ui.icone("check"), item ? "Salvar" : "Criar automação") : null;
  const btCancelar = h("button", { type: "button", class: "bt bt-sec" }, podeEditar ? "Cancelar" : "Voltar");
  const btTestar = podeEditar ? h("button", { type: "button", class: "bt bt-sec au-ed-largo", title: "Veja o que aconteceria agora, sem enviar nada" }, ui.icone("olho"), "Testar") : null;
  // plano 1000 · AS-005: no limite do plano a cópia seria recusada — o botão já nasce desabilitado com o motivo
  const lim = dados.limite || {};
  const noLimite = lim.limite != null && lim.usadas >= lim.limite;
  // plano 1000b · UB-007: criado também depois do 1º «Salvar e continuar» de uma nova (sem recarregar a página)
  const criarBtDuplicar = () => {
    const b = h("button", { type: "button", class: "bt bt-fant au-ed-largo au-ed-duplicar", disabled: noLimite,
      title: noLimite ? `Seu plano permite até ${lim.limite} automações.` : "Cria uma cópia desligada" }, ui.icone("copiar"), h("span", null, "Duplicar"));
    b.addEventListener("click", () => amb.duplicar(ctx, auto, b));
    return b;
  };
  let btDuplicar = podeEditar && item ? criarBtDuplicar() : null;
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
  function apagarRascunho() { clearTimeout(tRascunho); tRascunho = null; if (rasc && (gravouRascunho || !oferta)) rasc.apagar(idRasc); }
  // plano 1500c · UCA-086: o rascunho é gravado 400 ms depois da última tecla (com 10 mensagens longas eram ~40 KB a cada letra);
  // sair da aba ou esconder a página grava na hora
  let tRascunho = null;
  function agendarRascunho() { if (!rasc) return; clearTimeout(tRascunho); tRascunho = setTimeout(() => { tRascunho = null; guardarRascunho(); }, RASCUNHO_MS); }
  function gravarRascunhoJa() { if (tRascunho) { clearTimeout(tRascunho); tRascunho = null; guardarRascunho(); } }
  if (rasc && typeof addEventListener === "function" && amb.aoSair) {
    const aoEsconder = () => { if (typeof document === "undefined" || document.visibilityState !== "visible") gravarRascunhoJa(); };
    addEventListener("pagehide", gravarRascunhoJa);
    if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("visibilitychange", aoEsconder);
    amb.aoSair(() => { gravarRascunhoJa(); removeEventListener("pagehide", gravarRascunhoJa); if (typeof document !== "undefined" && document.removeEventListener) document.removeEventListener("visibilitychange", aoEsconder); });
  }

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
    saindoPeloEditor = true;          // UB-008: a pessoa já respondeu aqui
    ctx.navegar("#/automacoes");
  }
  btCancelar.addEventListener("click", sair);
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
  // plano 1000b · UB-008: menu lateral, paleta, Voltar do navegador e troca de empresa também perguntam (guarda de rota do shell)
  let saindoPeloEditor = false;      // «Cancelar»/«‹ Automações» já perguntaram: o shell não pergunta de novo
  if (typeof ctx.aoSairDaRota === "function" && amb.aoSair) {
    try {
      amb.aoSair(ctx.aoSairDaRota(() => {
        if (saindoPeloEditor || !raiz.isConnected || !temPendencia()) return true;
        return ui.confirmar(salvoJson !== null
          ? { titulo: "Sair sem salvar?", texto: "As mudanças desta automação serão perdidas.", rotulo: "Sair sem salvar", perigo: true }
          : { titulo: "Descartar esta automação?", texto: "Ela ainda não foi salva.", rotulo: "Descartar", perigo: true });
      }) || (() => {}));
    } catch { /* sem a guarda do shell, o rascunho da aba continua protegendo */ }
  }

  // plano 1000 · AS-031: no celular Testar/Duplicar/Cancelar moram num menu «⋯» e o Salvar só no rodapé (o cabeçalho cabe numa linha)
  const btMaisEd = h("button", { type: "button", class: "bt-icone au-ed-mais", "aria-label": "Mais ações da automação", "aria-haspopup": "menu" }, ui.icone("opcoes"));
  btMaisEd.addEventListener("click", () => ui.menu(btMaisEd, [
    btTestar ? { rotulo: "Testar (sem enviar nada)", icone: "olho", fn: () => testar(btMaisEd) } : null,
    btSalvarSeguir ? { rotulo: "Salvar e continuar aqui", icone: "check", fn: () => salvar(btSalvarSeguir, { continuar: true }) } : null,
    btDuplicar ? { rotulo: rotuloDuplicar(), icone: "copiar", desabilitado: noLimite, fn: () => amb.duplicar(ctx, auto, btDuplicar) } : null,
    // plano 1500c · UCA-103: leva a automação para outro cliente pelos NOMES (etapa, etiqueta, modelo); lá, «Colar automação» na lista
    { rotulo: "Copiar para outro cliente (texto)", icone: "copiar", fn: () => ui.copiar(JSON.stringify(L.exportarAutomacao(auto, base, vv)),   /* plano 2000d · DU-056: leva a vertical */ { aviso: "Automação copiada. No outro cliente, use «Colar automação» na lista de automações." }) },
    // plano 2000d · DU-107: volta ao texto da receita de origem (mantém nome e ligado/desligado)
    podeEditar && L.restaurarReceita(auto, base, vv) ? { rotulo: "Voltar ao texto da receita", icone: "reabrir", fn: () => voltarAReceita() } : null,
    { rotulo: podeEditar ? "Cancelar" : "Voltar", icone: "fechar", fn: sair },
  ].filter(Boolean)));
  async function voltarAReceita() {
    const r = L.restaurarReceita(auto, base, vv);
    if (!r) return;
    const ok = await ui.confirmar({ titulo: "Voltar ao texto da receita?", rotulo: "Voltar à receita",
      texto: "Gatilho, condições e passos voltam a ser os da receita. O nome e o ligado/desligado ficam como estão. Nada é salvo até você salvar." });
    if (!ok) return;
    auto = Object.assign(r, { condicoes: r.condicoes || [], acoes: r.acoes || [], config: r.config || {} });
    pintarQuando(); pintarSe(); pintarEntao(); mudou();
    ui.toast("Texto da receita de volta. Confira e salve.", { tipo: "ok" });
  }
  /** plano 1000b · UB-212: «Alterada por Ana, há 2 dias» — só quando o servidor mandar atualizado_em (e o autor, se vier); sem isso, nada. */
  // plano 1500c · UCA-091: recebe o item (o salvo depois de «Salvar e continuar» também) e mora numa caixa que é repintada em gravar()
  function linhaAutor(it = item) {
    if (!it || !it.atualizado_em) return null;
    const quem = String(it.atualizado_por_nome || it.atualizado_por || "").trim();
    const meuId = ctx.sessao && ctx.sessao.conta ? ctx.sessao.conta.id : null;
    const nomeQuem = meuId && it.atualizado_por === meuId ? "você" : quem && !/^[0-9a-f-]{36}$/i.test(quem) ? quem.split(/\s+/)[0] : "";
    const rel = typeof ui.relativo === "function" ? ui.relativo(it.atualizado_em) : "";
    if (!rel) return null;
    return h("p", { class: "sub au-ed-autor", title: typeof ui.dataHoraBR === "function" ? ui.dataHoraBR(it.atualizado_em) : null },
      nomeQuem ? `Alterada por ${nomeQuem}, ${rel}` : `Alterada ${rel}`);
  }
  const caixaAutor = h("div", { class: "au-ed-autor-caixa" }, linhaAutor());
  const repintarAutor = it => { ui.limpar(caixaAutor); const l = linhaAutor(it); if (l) caixaAutor.appendChild(l); };
  // plano 1500c · UCA-103: a colada de outro cliente diz de onde veio (não «montada pela IA»)
  const colada = !!(rascunho && rascunho.colada);
  const rotuloOrigem = item ? "Automação" : colada ? "Nova automação · colada de outro cliente" : origem === "ia" ? "Nova automação · montada pela IA" : modelo ? "Nova automação · a partir de uma receita" : "Nova automação";
  // título da página para leitor de tela (o nome visível é um campo editável, não um cabeçalho)
  const h1Pag = h("h1", { class: "sr-only" }, item ? `Automação: ${item.nome}` : "Nova automação");
  raiz.appendChild(h("header", { class: "au-ed-cab" },
    h1Pag,
    linkVoltar,
    h("div", { class: "au-ed-linha" },
      h("div", { class: "au-ed-nome" }, h("label", { class: "rotulo", for: nomeId }, rotuloOrigem), inpNome, contNome, avisoNome, btSugestao, caixaAutor),
      h("div", { class: "linha au-ed-acoes" }, h("span", { class: "au-sw-caixa" }, swAtivo, notaAtivo), btTestar, btDuplicar, btCancelar, btSalvarSeguir, btSalvar, btMaisEd))));
  if (!podeEditar) raiz.appendChild(h("p", { class: "aviso au-aviso-papel" }, ui.icone("cadeado"),
    h("span", null, `Somente leitura: administradores editam automações. ${L.frasePedirAdmin(base.usuarios)}`.trim())));   // plano 2000d · DU-080: diz quem é admin
  // plano 1000 · AS-269: o erro do servidor ao salvar (limite do plano, sem permissão…) fica aqui até a próxima tentativa — o toast sumia
  const erroSalvar = h("div", { class: "aviso aviso-ruim au-erro-salvar", role: "alert", tabindex: "-1", hidden: true });
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
    // plano 1000b · UB-248: só a frase é região viva; os botões ficam fora dela (o leitor não lê «Recuperar… Descartar…» como anúncio)
    oferta = h("div", { class: "aviso aviso-aten au-rasc" }, ui.icone("relogio"),
      h("div", { class: "pilha-p" },
        h("p", { role: "status" }, item ? `Há mudanças desta automação que ficaram sem salvar${quandoTxt}.` : `Você deixou uma automação sem salvar${quandoTxt}: ${L.resumoRascunhoNova(guardado.auto, vv)}.`,   // plano 2000d · DU-106
          // plano 1000b · UB-249: o que mudou em relação ao que está salvo («o nome, 2 passos e 1 condição mudaram»)
          item && L.resumoDiferencas(guardado.auto, auto) ? ` ${L.resumoDiferencas(guardado.auto, auto).replace(/^./, c => c.toUpperCase())}.` : ""),
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
          h("p", { class: "rotulo" }, colada ? "Colada de outro cliente" : "Montada pela IA"),
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
      h("p", { class: "sub" }, colada ? "Nada foi salvo ainda. Escolha o que ficou faltando e toque em «Criar automação»."
        : "Nada foi salvo ainda. Ajuste o que quiser abaixo e toque em «Criar automação». A IA só escolhe entre as etapas, etiquetas e pessoas que já existem no seu sistema."));
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
  // plano 1000b · UB-007: as abas também nascem na hora quando uma nova é salva com «continuar» (antes só depois de recarregar)
  function montarAbas(ativo) {
    if (raiz.querySelector(".au-abas")) return;
    // plano 1000b · UB-003: os erros já fazem parte de `execucoes` (taxaSucesso) — o número é o mesmo do cartão da lista, sem somar em dobro
    const ab = ui.abas({ itens: [{ id: "regra", rotulo: "Regra", icone: "raio", painel: painelRegra }, { id: "execucoes", rotulo: "Execuções", icone: "relogio", n: Number(item.execucoes) || null, painel: painelExec }],
      ativo, rotulo: "Partes da automação", classe: "au-abas",
      aoMudar: id => mostrarAba(id) });
    raiz.insertBefore(ab.el, painelRegra);
  }
  raiz.append(painelRegra, painelExec);
  if (item) montarAbas(q.aba === "execucoes" ? "execucoes" : "regra");

  // ------------------------------------------------ regra: fluxo + lateral
  const blocoQuando = h("section", { class: "au-bloco", dataset: { onde: "quando" }, "aria-labelledby": "au-q-t" });
  const blocoSe = h("section", { class: "au-bloco", dataset: { onde: "se" }, "aria-labelledby": "au-s-t" });
  const blocoEntao = h("section", { class: "au-bloco", dataset: { onde: "entao" }, "aria-labelledby": "au-e-t" });
  const fluxo = h("div", { class: "au-fluxo" }, blocoQuando, blocoSe, blocoEntao);

  const frase = h("p", { class: "au-frase" });   // sem aria-live: é reescrita a cada tecla e o leitor de tela repetiria a frase inteira
  const estado = h("p", { class: "au-estado" });
  const avisos = h("div", { class: "au-avisos" });
  // plano 2000d · DU-034/DU-035: as variáveis que o servidor anuncia e os {campo:chave} dos campos da empresa também viram chips
  const chips = h("div", { class: "au-vars-lista" }, L.variaveisAceitas(dados.base).concat(L.variaveisDeCampo(dados.base)).map(([k, rot]) => {
    // plano 1000b · UB-013: «Inserir Primeiro nome» em vez de «chave primeiro_nome chave» (o texto visível continua {chave})
    // plano 2000d · DU-037: o chip mostra o valor de exemplo numa segunda linha («→ Alex») e o diz no aria-label
    const ch = L.rotuloChipVariavel(k, rot, exemplo);
    const b = h("button", { type: "button", class: "au-var", title: rot, "aria-label": ch.aria, disabled: !podeEditar }, h("span", { class: "au-var-chave" }, ch.chave),
      ch.exemplo ? h("span", { class: "au-var-ex", "aria-hidden": "true" }, ch.exemplo) : null);
    b.addEventListener("mousedown", ev => ev.preventDefault());       // não rouba o foco do campo
    b.addEventListener("click", () => inserirVariavel(`{${k}}`));
    return b;
  }));
  // plano 1500c · UCA-081: sem aria-live (o leitor despejava a lista inteira); um status curto anuncia o resumo
  const areaSim = h("div", { class: "au-sim" });
  const statusSim = h("p", { class: "sr-only au-sim-status", role: "status" });
  const areaSimOriginal = areaSim;
  const btTestarLado = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("olho"), "Testar agora");
  // plano 1000 · AS-044: «Testar com…» um registro específico (nx_auto_simular aceita p_negocio): «por que não rodou para a Maria?»
  let negocioTeste = null;
  const idBuscaTeste = novoId("tbusca");
  // plano 1000b · UB-057: o placeholder fala a língua da vertical («Busque o paciente ou tratamento»)
  const vmin = k => (vv && typeof vv.min === "function" ? vv.min(k) : null);
  const phTeste = vmin("contato") && vmin("negocio") ? `Busque o ${vmin("contato")} ou ${vmin("negocio")}` : "Busque pelo nome ou título";
  // plano 1000b · UB-034: padrão de combobox — aria-controls/aria-expanded no campo, setas ↓↑ entre os resultados, Esc fecha a lista
  const idResTeste = novoId("tres");
  const buscaTeste = h("input", { id: idBuscaTeste, type: "search", class: "au-teste-busca", autocomplete: "off", placeholder: phTeste,
    "aria-controls": idResTeste, "aria-expanded": "false", "aria-autocomplete": "list" });
  const resTeste = h("ul", { class: "au-teste-res", id: idResTeste, role: "list", hidden: true });
  const mostrarResTeste = v => { resTeste.hidden = !v; buscaTeste.setAttribute("aria-expanded", String(!!v)); };
  const opsTeste = () => [...resTeste.querySelectorAll(".au-teste-op")];
  buscaTeste.addEventListener("keydown", ev => {
    if (ev.key === "Escape" && !resTeste.hidden) { ev.preventDefault(); ev.stopPropagation(); mostrarResTeste(false); return; }
    if (ev.key === "ArrowDown" && !resTeste.hidden) { const o = opsTeste()[0]; if (o) { ev.preventDefault(); o.focus(); } }
  });
  resTeste.addEventListener("keydown", ev => {
    const os = opsTeste(), i = os.indexOf(document.activeElement);
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); mostrarResTeste(false); buscaTeste.focus(); return; }
    if (i < 0) return;
    if (ev.key === "ArrowDown") { ev.preventDefault(); os[Math.min(i + 1, os.length - 1)].focus(); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); if (i === 0) buscaTeste.focus(); else os[i - 1].focus(); }
  });
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
  // plano 1000b · UB-192: enquanto a busca não volta (os 300 ms + a chamada), a lista diz «Buscando…» em vez de ficar vazia
  buscaTeste.addEventListener("input", () => {
    if (buscaTeste.value.trim().length < 2) return;
    if (resTeste.querySelector(".au-teste-buscando")) return;
    ui.limpar(resTeste);
    resTeste.appendChild(h("li", { class: "sub au-teste-buscando", role: "status" }, "Buscando…"));
    mostrarResTeste(true);
  });
  buscaTeste.addEventListener("input", ui.debounce(async () => {
    const q = buscaTeste.value.trim();
    const eu = ++seqBuscaTeste;
    if (q.length < 2) { ui.limpar(resTeste); mostrarResTeste(false); return; }
    let lista = [];
    try { const r = await ctx.api.rpcC("nx_buscar", { p_q: q }); lista = (r && Array.isArray(r.negocios) ? r.negocios : []).slice(0, 5); }
    catch { if (eu === seqBuscaTeste) { ui.limpar(resTeste); mostrarResTeste(true); resTeste.appendChild(h("li", { class: "sub" }, "A busca não respondeu agora. Teste pelo gatilho.")); } return; }
    if (eu !== seqBuscaTeste) return;
    ui.limpar(resTeste);
    mostrarResTeste(true);
    if (!lista.length) { resTeste.appendChild(h("li", { class: "sub" }, "Nada encontrado com esse nome.")); return; }
    for (const n of lista) {
      const titulo = String(n.titulo || n.contato_nome || `#${n.id}`);
      const b = h("button", { type: "button", class: "bt bt-fant bt-p au-teste-op" }, h("strong", null, titulo),
        h("small", null, [n.contato_nome && n.contato_nome !== titulo ? n.contato_nome : null, n.estagio_nome].filter(Boolean).join(" · ")));
      b.addEventListener("click", () => { negocioTeste = { id: n.id, titulo }; buscaTeste.value = ""; ui.limpar(resTeste); mostrarResTeste(false); pintarEscolhido(); testar(btTestarLado); });
      resTeste.appendChild(h("li", null, b));
    }
  }, 300));
  // plano 1000b · UB-035: nos gatilhos de Conversas o registro do funil não faz sentido — o campo some e a nota explica
  const campoTesteCom = h("div", { class: "campo au-teste-com" }, h("label", { for: idBuscaTeste }, "Testar com um registro (opcional)"), buscaTeste, resTeste);
  const notaTesteConversa = h("p", { class: "sub au-teste-conversa", hidden: true }, "Para gatilhos de conversa, o teste usa exemplos recentes de conversas.");
  function pintarTesteCom() {
    const conversa = ((L.GATILHO[auto.gatilho] || {}).grupo) === "Conversas";
    if (campoTesteCom.hidden !== conversa) campoTesteCom.hidden = conversa;
    if (notaTesteConversa.hidden !== !conversa) notaTesteConversa.hidden = !conversa;
    if (conversa && negocioTeste) { negocioTeste = null; pintarEscolhido(); }
  }
  const cartaoTeste = podeEditar ? h("div", { class: "cartao au-teste", id: novoId("teste") },
    h("p", { class: "rotulo" }, "Testar sem risco"),
    h("p", { class: "sub" }, "Veja o que aconteceria agora com o que está na tela. Nada é enviado nem salvo."),
    h("div", { class: "linha" }, btTestarLado),
    campoTesteCom, notaTesteConversa,
    escolhidoTeste,
    areaSim, statusSim) : null;
  // diagrama ao vivo do fluxo (item 53): SVG gerado de gatilho/condições/passos, redesenhado a cada mudança; cada nó leva ao bloco
  const caixaDiagrama = h("div", { class: "au-dg-caixa", id: novoId("dg") });
  // no celular a lateral vem depois do formulário: o diagrama sobe para o topo (CSS) e nasce recolhido, para não empurrar os campos
  const estreito = () => { try { return typeof matchMedia === "function" && matchMedia("(max-width: 1080px)").matches; } catch { return false; } };
  // plano 1000b · UB-078: a escolha da pessoa (abrir/recolher) fica lembrada no aparelho; sem escolha, acompanha a largura (girar o tablet)
  // (a preferência passa pelo amb.preferencia da tela — o editor não toca no armazenamento do aparelho)
  const prefFluxo = typeof amb.preferencia === "function" ? amb.preferencia(CHAVE_FLUXO) : null;
  const lerFluxo = () => { const v = prefFluxo ? prefFluxo.ler() : null; return v === "aberto" ? true : v === "fechado" ? false : null; };
  const escolhaFluxo = lerFluxo();
  let diagramaAberto = escolhaFluxo !== null ? escolhaFluxo : !estreito();
  // plano 1000b · UB-077: texto fixo «Ver o fluxo»; o estado é o aria-expanded (e a seta gira pelo CSS)
  const btFluxo = h("button", { type: "button", class: "bt bt-fant bt-p au-dg-toggle", "aria-expanded": String(diagramaAberto), "aria-controls": caixaDiagrama.id },
    h("span", null, "Ver o fluxo"), ui.icone("seta-baixo"));
  const definirFluxo = v => { diagramaAberto = v; caixaDiagrama.hidden = !v; btFluxo.setAttribute("aria-expanded", String(v)); };
  btFluxo.addEventListener("click", () => {
    definirFluxo(!diagramaAberto);
    if (prefFluxo) prefFluxo.gravar(diagramaAberto ? "aberto" : "fechado");
  });
  if (escolhaFluxo === null && amb.aoSair) {
    try {
      const mq = typeof matchMedia === "function" ? matchMedia("(max-width: 1080px)") : null;
      const aoGirar = ev => { if (lerFluxo() === null) definirFluxo(!ev.matches); };
      if (mq && typeof mq.addEventListener === "function") { mq.addEventListener("change", aoGirar); amb.aoSair(() => mq.removeEventListener("change", aoGirar)); }
    } catch { /* sem matchMedia: fica como nasceu */ }
  }
  caixaDiagrama.hidden = !diagramaAberto;
  const cartaoDiagrama = h("div", { class: "cartao au-dg" },
    h("div", { class: "au-dg-cab" }, h("div", null, h("p", { class: "rotulo" }, "Fluxo"), h("span", { class: "sub au-dg-dica" }, "Toque num bloco para ir até ele.")), btFluxo),
    caixaDiagrama);
  const resumoNos = h("span", { class: "au-dg-resumo mono", id: novoId("dgres") });
  cartaoDiagrama.querySelector(".au-dg-cab > div").appendChild(resumoNos);
  const avisoDiagrama = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });   // plano 2000d · DU-094
  // plano 2000d · DU-061: as outras automações neste gatilho (ligadas e desligadas) — a pessoa vê o que mais roda junto
  const caixaOutras = h("div", { class: "au-outras", hidden: true });
  cartaoDiagrama.append(avisoDiagrama, caixaOutras);
  let ultimasOutras = null;
  function pintarOutras() {
    const l = L.outrasNoGatilho(auto, dados.itens, base, vv);
    const chave = JSON.stringify(l);
    if (chave === ultimasOutras) return;
    ultimasOutras = chave;
    ui.limpar(caixaOutras);
    caixaOutras.hidden = !l.length;
    if (!l.length) return;
    caixaOutras.append(h("p", { class: "rotulo" }, "Outras automações neste gatilho"),
      h("ul", { class: "au-outras-lista", role: "list" }, l.slice(0, 6).map(o => h("li", null,
        h("a", { href: `#/automacoes/${encodeURIComponent(o.id)}` }, o.nome), " ",
        ui.pilula(o.ativo ? "Ligada" : "Desligada", o.ativo ? "ok" : "neutra"),
        o.frase ? h("small", { class: "sub" }, o.frase) : null))),
      ...[l.length > 6 ? h("p", { class: "sub" }, `e mais ${l.length - 6}`) : null].filter(Boolean),   // plano 2000d · AX-001: sem null no append
      h("p", { class: "sub" }, "Todas rodam quando o gatilho acontece; uma não espera a outra."));
  }
  let ultimoDiagrama = null, tDiagrama = null;
  /** plano 1000 · AS-028: o SVG não é refeito a cada tecla — espera 150 ms parado e pula quando os nós são os mesmos. */
  function agendarDiagrama() { clearTimeout(tDiagrama); tDiagrama = setTimeout(() => { tDiagrama = null; pintarDiagrama(); }, DIAGRAMA_MS); }
  function pintarDiagrama() {
    const nos = L.nosDoDiagrama(auto, base, vv, { podeEditar });
    const chave = JSON.stringify(nos);
    if (chave === ultimoDiagrama && caixaDiagrama.firstChild) return;
    ultimoDiagrama = chave;
    const svg = P.diagrama({ nos, aoFocar: focarNo, largura: 300, tl: L.linhaDoTempo(auto.acoes) });   // plano 2000d · DU-317
    ui.limpar(caixaDiagrama);
    caixaDiagrama.appendChild(svg);
    // plano 2000d · DU-094: a figura aponta para o texto do fluxo; a mudança é anunciada (sem repetir na primeira pintura)
    svg.setAttribute("aria-describedby", resumoNos.id);
    const novoResumo = L.resumoFluxo(auto, base, vv);
    if (avisoDiagrama.dataset.pintado && resumoNos.textContent !== novoResumo) avisoDiagrama.textContent = `Fluxo atualizado: ${novoResumo}`;
    avisoDiagrama.dataset.pintado = "1";
    pintarOutras();
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

  // plano 1500c · UCA-106: a frase + o passo a passo em texto simples, para mandar ao cliente aprovar
  const btCopiarFrase = h("button", { type: "button", class: "bt bt-fant bt-p au-previa-copiar", "aria-label": "Copiar a frase e o passo a passo" }, ui.icone("copiar"), "Copiar");
  btCopiarFrase.addEventListener("click", () => ui.copiar(L.textoParaCompartilhar(auto, base, vv), { aviso: "Frase e passo a passo copiados. Cole na conversa com o cliente." }));
  // plano 2000d · DU-432: atalho para pular o diagrama (o Tab não precisa atravessar o fluxo para chegar ao resumo)
  const idPrevia = novoId("previa");
  const btPularFluxo = h("button", { type: "button", class: "pular au-dg-pular" }, "Pular o fluxo");
  btPularFluxo.addEventListener("click", () => { const p = raiz.querySelector(`#${idPrevia}`); if (p) p.focus({ preventScroll: false }); });
  cartaoDiagrama.insertBefore(btPularFluxo, cartaoDiagrama.firstChild);
  const lado = h("aside", { class: "au-lado", "aria-label": "Resumo da automação" },
    cartaoDiagrama,
    h("div", { class: "cartao au-previa", id: idPrevia, tabindex: "-1" },
      h("div", { class: "au-previa-cab" }, h("p", { class: "rotulo" }, "Em uma frase"), btCopiarFrase), frase, estado, avisos),
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
      ajuda: g && g.descricao ? L.descricaoGatilho(auto.gatilho, vv) : null,   // plano 2000d · DU-355: no vocabulário do segmento
      // plano 1500c · UCA-082: o select é recriado — o foco volta para ele (no Windows cada seta dispara change)
      aoMudar: v => { Object.assign(auto, L.trocarGatilho(auto, v, memoriaGatilho)); pintarQuando(); mudou("quando");
        const s = blocoQuando.querySelector(".au-sel-gat select"); if (s) s.focus({ preventScroll: true }); } });
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
        // plano 1000b · UB-029: o rótulo fala em «tempo» (o campo deixa escolher horas ou dias)
        if (f.sufixo === "h") return P.campoHoras({ rotulo: L.rotuloCampoTempo(f.rotulo), valor: v, min: f.min, max: f.max, desabilitado: !podeEditar,
          obrigatorio: f.obrigatorio, aoMudar: x => set(x) });
        // plano 1000 · AS-039: «sem resposta há» em minutos ou horas (4 horas sem fazer a conta de 240), gravado em minutos
        if (f.sufixo === "min" && typeof P.campoMinutos === "function") return P.campoMinutos({ rotulo: f.rotulo.replace(/^Minutos sem resposta$/, "Tempo sem resposta"),
          valor: v, min: f.min, max: f.max, desabilitado: !podeEditar, obrigatorio: f.obrigatorio, aoMudar: x => set(x) });
        return entrada({ rotulo: f.rotulo, valor: v ?? "", tipo: "number", min: f.min, max: f.max, passo: 1, sufixo: f.sufixo, desabilitado: !podeEditar,
          obrigatorio: f.obrigatorio, ajuda:`De ${f.min} a ${f.max}.`, aoMudar: x => set(x === "" ? null : Number(x)) });
      case "palavras": {
        // plano 1000 · AS-284: «Testar uma frase» aplica a mesma regra do servidor (sem acento, trecho contido) e diz qual palavra casou
        // plano 1000b · UB-033: o resultado fica ligado ao campo (voltar ao campo relê «Dispara: casou com…»)
        const resFrase = h("small", { class: "au-frase-res", role: "status", id: novoId("frres") });
        const inpFrase = h("input", { type: "text", class: "au-frase-inp", placeholder: "Ex.: Qual o preço do clareamento?", autocomplete: "off", "aria-label": "Testar uma frase do cliente",
          "aria-describedby": resFrase.id });
        // plano 1000b · UB-064: «oi», «a»… casam com quase toda mensagem (trecho contido) — o campo avisa
        const avisoCurtas = h("small", { class: "campo-ajuda au-palavras-curtas", id: novoId("pcurtas"), hidden: true });
        const pintarCurtas = () => {
          const c = L.palavrasCurtas(auto.config[f.nome] || []);
          avisoCurtas.hidden = !c.length;
          avisoCurtas.textContent = c.length ? `${c.map(w => `«${w}»`).join(", ")}: palavra${c.length > 1 ? "s" : ""} muito curta${c.length > 1 ? "s" : ""} — dispara em quase toda mensagem. Use 3 letras ou mais.` : "";
        };
        const testarFrase = () => {
          const fr = inpFrase.value.trim();
          const ws = auto.config[f.nome] || [];
          const casou = fr ? L.casaPalavras(fr, ws) : null;
          resFrase.dataset.tom = !fr ? "" : casou || !ws.length ? "ok" : "ruim";
          resFrase.textContent = !fr ? "" : !ws.length ? "Sem palavras: toda mensagem recebida dispara." : casou ? `Dispara: casou com «${casou}».` : "Não dispara: nenhuma palavra aparece nessa frase.";
        };
        inpFrase.addEventListener("input", testarFrase);
        const campoP = entrada({ rotulo: f.rotulo, valor: (v || []).join(", "), placeholder: "preço, valor, quanto custa", ajuda: f.ajuda, desabilitado: !podeEditar,
          // plano 1000b · UB-032: «preço, Preço, preco» conta UMA do limite (sem acento/caixa; fica a 1ª grafia)
          aoMudar: x => { const vistas = new Set(); set(x.split(",").map(s => s.trim()).filter(s => { const k = L.normalizar(s); if (!s || vistas.has(k)) return false; vistas.add(k); return true; })); testarFrase(); pintarCurtas(); } });
        const inpP = campoP.querySelector("input");
        if (inpP) inpP.setAttribute("aria-describedby", [inpP.getAttribute("aria-describedby"), avisoCurtas.id].filter(Boolean).join(" "));
        campoP.appendChild(avisoCurtas);
        pintarCurtas();
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
          ajuda: "Horário de Brasília." /* plano 1000b · UB-058: quem é de outra cidade entende que é o fuso oficial */, aoMudar: x => set(x || null) });
      case "dias_semana":
        return P.campoDias({ rotulo: f.rotulo, valor: v, desabilitado: !podeEditar, aoMudar: dias => { auto.config[f.nome] = dias; mudou("quando"); } });
      // plano 1500c · UCA-002: os filtros opcionais do «Tarefa venceu» (tipo e pessoa) — antes não havia campo e Salvar apagava os dois
      case "opcoes":
        return seletor({ rotulo: f.rotulo, valor: v, vazio: f.opcional ? (f.vazioRotulo || "Qualquer um") : "Escolha…", desabilitado: !podeEditar,
          opcoes: (f.opcoes || []).map(([k, r]) => ({ valor: k, rotulo: r })), aoMudar: x => set(x || null) });
      case "pessoa": {
        const op = opcoesBase(dados, "pessoa");
        // a pessoa que saiu da empresa continua visível (rotulada) — senão a tela mentiria «Qualquer pessoa»
        if (v && !op.some(o => o.valor === v)) op.push({ valor: v, rotulo: "(pessoa sem acesso)" });
        return seletor({ rotulo: f.rotulo, valor: v, vazio: f.opcional ? (f.vazioRotulo || "Qualquer pessoa") : "Escolha…", opcoes: op, desabilitado: !podeEditar,
          ajuda: !op.length ? semOpcoes("pessoa") : null, aoMudar: x => set(x || null) });
      }
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
      ui.icone("mais"), "Acrescentar condição") : null;     // plano 1000b · UB-188: com verbo
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
      // plano 1500c · UCA-020: «Texto da mensagem» só nos gatilhos de mensagem
      btMais.addEventListener("click", () => ui.menu(btMais, L.camposCondicao(base, vv, auto.gatilho).map(c => ({ rotulo: c.rotulo, fn: () => novaCondicao(c.valor) }))));
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
    const selCampo = seletor({ rotulo: "Campo", valor: cd.campo, opcoes: L.camposCondicao(base, vv, auto.gatilho, cd.campo), desabilitado: !podeEditar, classe: "au-cond-campo",   // plano 1500c · UCA-020
      aoMudar: v => {
        // plano 1000b · UB-252: trocar o campo zera comparação e valor — se havia valor, o aviso oferece «Desfazer» (volta o campo e o valor)
        const antes = { campo: cd.campo, op: cd.op, valor: cd.valor };
        const tinhaValor = !(cd.valor === "" || cd.valor == null);
        cd.campo = v; cd.op = L.operadoresDe(v)[0]; cd.valor = ""; pintarSe(); mudou("se");
        const s = blocoSe.querySelectorAll(".au-cond")[i]; const sc = s && s.querySelector(".au-cond-campo select"); if (sc) sc.focus({ preventScroll: true });
        if (tinhaValor) ui.toast(`Campo trocado: o valor «${String(antes.valor).slice(0, 40)}» foi limpo.`, { tipo: "info", desfazer: () => {
          if (!auto.condicoes.includes(cd)) return;
          Object.assign(cd, antes); pintarSe(); mudou("se");
        } });
      } });
    const selOp = seletor({ rotulo: "Comparação", valor: cd.op, opcoes: ops, desabilitado: !podeEditar, classe: "au-cond-op",
      aoMudar: v => {
        // plano 1500c · UCA-125: «está vazio» apaga o valor — com valor, o aviso oferece «Desfazer» (como a troca de campo)
        const antes = { op: cd.op, valor: cd.valor };
        const perdeu = L.operadorSemValor(v) && !(cd.valor === "" || cd.valor == null);
        cd.op = v; if (L.operadorSemValor(v)) delete cd.valor; pintarSe(); mudou("se");
        // plano 1500c · UCA-083: o select foi recriado — o foco volta para a mesma comparação
        const s = blocoSe.querySelectorAll(".au-cond")[i]; const so = s && s.querySelector(".au-cond-op select"); if (so) so.focus({ preventScroll: true });
        if (perdeu) ui.toast(`Comparação trocada: o valor «${String(antes.valor).slice(0, 40)}» foi limpo.`, { tipo: "info", desfazer: () => {
          if (!auto.condicoes.includes(cd)) return;
          Object.assign(cd, antes); pintarSe(); mudou("se");
        } });
      } });
    let ctlValor = null;
    if (!L.operadorSemValor(cd.op)) {
      const set = v => { cd.valor = v; mudou("se"); };
      const mapa = { funil: "funil", estagio: "estagio", canal: "canal", departamento: "departamento", etiqueta: "etiqueta", pessoa: "pessoa" };
      if (tipo === "origem") ctlValor = seletor({ rotulo: "Valor", valor: cd.valor, vazio: "Escolha…", opcoes: L.ORIGENS.map(([k, r]) => ({ valor: k, rotulo: r })), desabilitado: !podeEditar, aoMudar: set, classe: "au-cond-val" });
      // plano 1500c · UCA-001: plataforma do anúncio (Meta ou Google); a campanha cai no campo de texto («contém black»)
      else if (tipo === "plataforma") ctlValor = seletor({ rotulo: "Valor", valor: cd.valor, vazio: "Escolha…", opcoes: L.PLATAFORMAS.map(([k, r]) => ({ valor: k, rotulo: r })), desabilitado: !podeEditar, aoMudar: set, classe: "au-cond-val" });
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
      // plano 1000b · UB-023: tirar a condição oferece «Desfazer» (o mesmo objeto volta para o mesmo lugar)
      ui.toast(`Condição ${i + 1} tirada.`, { tipo: "info", desfazer: () => {
        if (auto.condicoes.includes(cd) || auto.condicoes.length >= L.LIMITES.condicoes) return;
        auto.condicoes.splice(Math.min(i, auto.condicoes.length), 0, cd); pintarSe(); mudou("se");
        const x = blocoSe.querySelectorAll(".au-cond")[Math.min(i, auto.condicoes.length - 1)];
        const f = x && x.querySelector("select"); if (f) f.focus({ preventScroll: true });
      } });
      // igual aos passos: o foco vai para o «Tirar a condição» que ocupou o lugar (ou o anterior; sem condições, «Condição»)
      if (tinhaFoco) {
        const xs = blocoSe.querySelectorAll(".au-cond .au-x");
        const alvo = xs[Math.min(i, xs.length - 1)] || blocoSe.querySelector(".au-mais");
        if (alvo) alvo.focus({ preventScroll: true });
      }
    });
    // plano 1000b · UB-020: cada condição é um grupo com número e o «e» (os três «Campo» deixam de ser iguais para o leitor de tela)
    return h("li", { class: "au-cond", role: "group", "aria-label": i === 0 ? `Condição ${i + 1}` : `Condição ${i + 1} (e)` },
      h("span", { class: "au-cond-e", "aria-hidden": "true" }, i === 0 ? "se" : "e"),
      selCampo, selOp, ctlValor || h("span", { class: "au-cond-vazio" }), btX,
      h("p", { class: "au-item-erro", role: "alert", hidden: true }));
  }

  // ------------------------------------------------ Então (linha do tempo de passos)
  // plano 1500c · UCA-118/119: o que mudou nos passos (mover, arrastar, acrescentar, duplicar) é anunciado ao leitor de tela
  const statusPassos = h("p", { class: "sr-only au-passos-status", role: "status" });
  raiz.appendChild(statusPassos);
  const anunciar = t => { statusPassos.textContent = ""; setTimeout(() => { statusPassos.textContent = t; }, 30); };
  /** plano 1500c · UCA-084: depois de redesenhar o «Então», o foco volta ao mesmo controle do mesmo passo (não cai no <body>). */
  const refocarNoPasso = (i, seletorCtl) => {
    const li = i >= 0 ? blocoEntao.querySelectorAll(".au-passo")[i] : null;
    const ctl = li && (li.querySelector(seletorCtl) || li.querySelector("select, input, textarea"));
    if (ctl) ctl.focus({ preventScroll: true });
  };
  let arrastando = null;
  let paletaAberta = false;

  /** plano 1000 · AS-224: com «só no horário de atendimento» e o horário do departamento padrão (quando a base traz), a linha do tempo calcula o envio real. */
  const horarioPadrao = (() => { const d = ((base && base.departamentos) || []).find(x => x && x.padrao) || null; return d && d.horario !== undefined ? d.horario : undefined; })();
  const opcoesTempo = () => (auto.respeitar_horario && horarioPadrao !== undefined ? { inicio: Date.now(), horario: horarioPadrao } : {});
  const textoQuando = t => (t.inalcancavel ? "Nunca roda (depois de «Parar»)"
    // plano 1000b · UB-024: sem horário de atendimento nenhum no departamento padrão a mensagem não sai — nada de «Na hora»
    : t.semHorario ? "Não sai: o departamento padrão está sem horário de atendimento"
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
    // plano 1000b · UB-055: o botão aponta para a paleta que ele abre
    if (paleta && btMais) { paleta.id = novoId("paleta"); btMais.setAttribute("aria-controls", paleta.id); }
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
    // plano 1000b · UB-054: sem passo de mensagem o interruptor não vale nada — fica desabilitado (o valor salvo não muda) e diz por quê
    const swHorario = interruptor({ ligado: !!auto.respeitar_horario, rotulo: "Respeitar horário de funcionamento", desabilitado: !podeEditar || !temMensagem,
      aoMudar: v => { auto.respeitar_horario = v; mudou("entao"); } });
    const idHorarioSub = novoId("hrsub");
    swHorario.setAttribute("aria-describedby", idHorarioSub);
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
            h("p", { class: "sub", id: idHorarioSub }, temMensagem ? "Mensagens fora do horário do departamento esperam a próxima abertura."
              : "Só vale para passos que mandam mensagem — acrescente um «Enviar mensagem» para usar."),
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
    // plano 2000d · DU-093: os mais usados com este gatilho, no topo (os mesmos passos continuam no grupo deles)
    const sugeridas = L.acoesSugeridas(auto.gatilho);
    if (sugeridas.length) pal.appendChild(h("section", { class: "au-paleta-grupo au-paleta-sug" },
      h("h3", { class: "rotulo" }, "Mais usados com este gatilho"),
      h("div", { class: "au-paleta-grade" }, sugeridas.map(id => {
        const a = L.ACAO[id];
        const b = h("button", { type: "button", class: ["au-tile", a.ia && "au-tile-ia"], dataset: { acao: a.id } },
          h("span", { class: "au-tile-ic", "aria-hidden": "true" }, ui.icone(a.icone)),
          h("span", { class: "au-tile-txt" }, h("strong", null, L.rotuloAcao(a.id, vv)),
            h("small", null, a.id === "enviar_mensagem" && L.viaTextoLivre(base.canais) ? `${a.descricao || ""} ${L.viaTextoLivre(base.canais)}`.trim() : a.descricao || ""),
            iaOff && a.ia ? h("small", { class: "au-tile-off" }, "IA ainda desligada: o passo seria pulado") : null));
        b.addEventListener("click", () => adicionar(a.id));
        return b;
      }))));
    for (const grupo of L.GRUPOS_ACAO) {
      const itens = L.ACOES.filter(a => a.grupo === grupo && a.disponivel !== false && a.menu !== false);
      if (!itens.length) continue;
      pal.appendChild(h("section", { class: "au-paleta-grupo" },
        h("h3", { class: "rotulo" }, grupo),
        h("div", { class: "au-paleta-grade" }, itens.map(a => {
          const b = h("button", { type: "button", class: ["au-tile", a.sequencia && "au-tile-seq", a.ia && "au-tile-ia"], dataset: { acao: a.id } },
            h("span", { class: "au-tile-ic", "aria-hidden": "true" }, ui.icone(a.icone)),
            // plano 1000b · UB-031: «Enviar mensagem» diz por onde sai pelos números DESTA empresa (sem prometer CodeWords a quem só tem Meta)
            h("span", { class: "au-tile-txt" }, h("strong", null, L.rotuloAcao(a.id, vv)),
              h("small", null, a.id === "enviar_mensagem" && L.viaTextoLivre(base.canais) ? `${a.descricao || ""} ${L.viaTextoLivre(base.canais)}`.trim() : a.descricao || ""),
              iaOff && a.ia ? h("small", { class: "au-tile-off" }, "IA ainda desligada: o passo seria pulado") : null));
          b.addEventListener("click", () => adicionar(a.id));
          return b;
        }))));
    }
    pal.append(semNada, status);
    // plano 2000d · AX-074: no limite de esperas, o «Esperar» da paleta já aparece desabilitado com o motivo (antes entrava e só depois dava erro)
    if (auto.acoes.filter(x => x && x.tipo === "esperar").length >= L.LIMITES.esperas)
      for (const t of pal.querySelectorAll('.au-tile[data-acao="esperar"]')) {
        t.disabled = true;
        const txt = t.querySelector(".au-tile-txt");
        if (txt) txt.appendChild(h("small", { class: "au-tile-off" }, `Limite de ${L.LIMITES.esperas} esperas por automação`));
      }
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
      const primeiro = [...pal.querySelectorAll(".au-tile")].find(t => !t.hidden && !t.disabled && !(t.closest(".au-paleta-grupo") || {}).hidden);   // plano 2000d · AX-074
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
    anunciar(`Passo «${L.rotuloAcao(tipo, vv)}» acrescentado como ${auto.acoes.length}º.`);     // plano 1500c · UCA-119
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
      .filter(f => f.tipo !== "parametros").map(f => { const el = campoAcao(ac, f, i); if (el && el.dataset) el.dataset.campo = f.nome; return el; }));   // plano 1500c · UCA-084: data-campo para devolver o foco
    if (def && !def.campos.length && def.descricao) corpo.appendChild(h("p", { class: "sub au-passo-desc" }, def.descricao));
    const alca = podeEditar ? h("span", { class: "au-alca", title: "Arraste para reordenar", "aria-hidden": "true" }, ui.icone("arrastar")) : null;
    const btSobe = podeEditar ? h("button", { type: "button", class: "bt-icone", "aria-label": `Subir o passo ${i + 1}`, disabled: i === 0 }, ui.icone("seta-baixo", "au-gira")) : null;
    const btDesce = podeEditar ? h("button", { type: "button", class: "bt-icone", "aria-label": `Descer o passo ${i + 1}`, disabled: i === n - 1 }, ui.icone("seta-baixo")) : null;
    const btX = podeEditar ? h("button", { type: "button", class: "bt-icone au-x", "aria-label": `Tirar o passo ${i + 1}` }, ui.icone("lixeira")) : null;
    // plano 1500c · UCA-041: duplicar o passo logo abaixo (no limite de passos/esperas o botão fica desabilitado)
    const podeDuplicar = L.duplicarPasso(auto.acoes, i).length > n;
    const btDup = podeEditar ? h("button", { type: "button", class: "bt-icone au-dup", "aria-label": `Duplicar o passo ${i + 1}`, title: "Duplicar passo", disabled: !podeDuplicar }, ui.icone("copiar")) : null;
    if (btDup) btDup.addEventListener("click", () => {
      auto.acoes = L.duplicarPasso(auto.acoes, i); pintarEntao(); mudou("entao");
      anunciar(`Passo «${L.rotuloAcao(ac.tipo, vv)}» duplicado: a cópia é o ${i + 2}º.`);
      const b = blocoEntao.querySelectorAll(".au-passo")[i + 1]; const f = b && b.querySelector("input,select,textarea"); if (f) f.focus({ preventScroll: true });
    });
    const mover = para => { auto.acoes = L.mover(auto.acoes, i, para); pintarEntao(); mudou("entao");
      anunciar(`Passo «${L.rotuloAcao(ac.tipo, vv)}» agora é o ${para + 1}º.`);     // plano 1500c · UCA-118
      const b = blocoEntao.querySelectorAll(".au-passo")[para]; if (b) { const alvo = b.querySelector(para < i ? "[aria-label^='Subir']" : "[aria-label^='Descer']"); (alvo && !alvo.disabled ? alvo : b.querySelector("button")).focus(); } };
    if (btSobe) btSobe.addEventListener("click", () => mover(i - 1));
    if (btDesce) btDesce.addEventListener("click", () => mover(i + 1));
    if (btX) btX.addEventListener("click", () => {
      const tinhaFoco = document.activeElement === btX;
      auto.acoes.splice(i, 1); pintarEntao(); mudou("entao");
      // plano 1000b · UB-022: um toque errado na lixeira não perde a mensagem longa — «Desfazer» devolve o mesmo passo no mesmo lugar
      ui.toast(`Passo ${i + 1} («${L.rotuloAcao(ac.tipo, vv)}») tirado.`, { tipo: "info", desfazer: () => {
        if (auto.acoes.includes(ac) || auto.acoes.length >= L.LIMITES.acoes) return;
        auto.acoes.splice(Math.min(i, auto.acoes.length), 0, ac); pintarEntao(); mudou("entao", { tempo: true });
        const x = blocoEntao.querySelectorAll(".au-passo")[Math.min(i, auto.acoes.length - 1)];
        const f = x && x.querySelector("input,select,textarea,button"); if (f) f.focus({ preventScroll: true });
      } });
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
        h("span", { class: "au-acao-bts" }, btSobe, btDesce, btDup, btX)),
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
      const tipoMovido = (auto.acoes[arrastando] || {}).tipo;
      auto.acoes = L.mover(auto.acoes, arrastando, i); arrastando = null; pintarEntao(); mudou("entao");
      anunciar(`Passo «${L.rotuloAcao(tipoMovido, vv)}» agora é o ${i + 1}º.`); });     // plano 1500c · UCA-118
    // plano 2000d · DU-433: Alt+↑/↓ (fora de campo de texto) move o passo, como os botões Subir/Descer
    if (podeEditar) li.addEventListener("keydown", ev => {
      if (!ev.altKey || (ev.key !== "ArrowUp" && ev.key !== "ArrowDown")) return;
      const tg = ev.target && ev.target.tagName;
      if (tg === "TEXTAREA" || (tg === "INPUT" && !/^(checkbox|radio|button)$/.test(ev.target.type || ""))) return;
      const para = ev.key === "ArrowUp" ? i - 1 : i + 1;
      if (para < 0 || para >= auto.acoes.length) return;
      ev.preventDefault();
      mover(para);
    });
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
        const previa = bolha ? h("figure", { class: "au-msg-previa" }, h("figcaption", { class: "rotulo" }, "Como chega no WhatsApp (exemplo)")) : null;
        // plano 2000d · DU-039: no «Enviar mensagem», a assinatura da empresa (quando o servidor mandar base.assinatura) entra na conta
        const assinatura = ac.tipo === "enviar_mensagem" && base && typeof base.assinatura === "string" ? base.assinatura : "";
        const pintarCont = val => { if (!cont) return; const c = L.contadorTexto(val, f.max, { assinatura }); cont.textContent = c.texto; cont.dataset.tom = c.tom; };
        // plano 1000b · UB-253: sem texto, a instrução fica FORA da bolha (a bolha verde não finge ser uma mensagem)
        const vazioPrevia = bolha ? h("p", { class: "sub au-bolha-vazia" }, "Escreva a mensagem para ver a prévia.") : null;
        const pintarBolha = val => {
          if (!bolha) return;
          const tem = !!String(val || "").trim();
          // plano 1500c · UCA-099: *negrito*, _itálico_, ~riscado~ e ```mono``` como o cliente vê (spans por textContent, sem HTML)
          ui.limpar(bolha);
          if (tem) for (const p of L.partesWhatsApp(L.aplicarVariaveis(val, exemplo))) bolha.appendChild(p.estilo ? h("span", { class: `au-wa-${p.estilo}` }, p.t) : document.createTextNode(p.t));
          bolha.hidden = !tem; vazioPrevia.hidden = tem;
        };
        const bolhaDepois = ui.debounce(pintarBolha, 150);
        // plano 2000d · DU-088: a ajuda do «Enviar mensagem» vem dos números desta empresa (só aparelho: nada de janela da Meta)
        const ajudaCampo = ac.tipo === "enviar_mensagem" ? L.ajudaMensagem(base && base.canais) : f.ajuda;
        const el = entrada({ rotulo: f.rotulo, valor: v ?? "", tipo: "textarea", max: f.max, variaveis: f.variaveis, desabilitado: dis, ajuda: ajudaCampo,
          obrigatorio: f.obrigatorio, aoMudar: x => { ac[f.nome] = x; pintarCont(x); bolhaDepois(x); mudou("entao"); } });
        if (cont) el.appendChild(cont);
        if (previa) { previa.append(vazioPrevia, bolha); el.appendChild(previa); }
        pintarCont(v ?? ""); pintarBolha(v ?? "");
        return el;
      }
      case "numero":
        // plano 1000b · UB-030: prazo da tarefa em horas OU dias (7 dias sem digitar 168), «0 = para já»
        if (f.sufixo === "h" && typeof P.campoHoras === "function") return P.campoHoras({ rotulo: f.rotulo, valor: v, min: f.min ?? 1, max: f.max, desabilitado: dis,
          ajuda: f.ajuda || null, aoMudar: x => set(x) });
        return entrada({ rotulo: f.rotulo, valor: v ?? "", tipo: "number", min: f.min, max: f.max, passo: 1, sufixo: f.sufixo, desabilitado: dis,
          aoMudar: x => set(x === "" ? null : Number(x)) });
      case "duracao":
        return P.campoDuracao({ rotulo: f.rotulo, valor: v, desabilitado: dis, min: f.min, max: f.max,
          aoMudar: m => { if (m == null) delete ac[f.nome]; else ac[f.nome] = m; mudou("entao", { tempo: true }); } });
      case "opcoes":
        return seletor({ rotulo: f.rotulo, valor: v ?? f.padrao, opcoes: f.opcoes.map(([k, r]) => ({ valor: k, rotulo: r })), desabilitado: dis, aoMudar: set });
      case "estagio": {
        // plano 1500c · UCA-087: «Mover de etapa» é do mesmo funil — com o funil definido pelo gatilho, só as etapas dele (a já escolhida de
        // outro funil continua visível, com o aviso de usar «Mover de funil»)
        const funilGat = ac.tipo === "mover_estagio" ? L.funilDoGatilho(auto, base) : null;
        const funil = f.filtraPor ? ac[f.filtraPor] : funilGat;
        const op = opcoesBase(dados, "estagio", { funil, atual: v });
        if (funilGat && v && !op.some(g => (g.opcoes || [g]).some(o => o.valor === v))) {
          const e = L.indexarBase(base).estagios.get(v);
          if (e) op.push({ grupo: `${e.funil_nome} (outro funil)`, opcoes: [{ valor: v, rotulo: e.nome }] });
        }
        const avisoFunil = L.avisoEtapaOutroFunil(auto, ac, base);
        return seletor({ rotulo: f.rotulo, valor: v, opcoes: op, vazio: f.opcional ? "Primeira etapa do funil" : "Escolha a etapa…",
          desabilitado: dis, obrigatorio: f.obrigatorio, ajuda: avisoFunil, aoMudar: x => { set(x || null); if (ac.tipo === "mover_estagio") { pintarEntao(); refocarNoPasso(i, ".au-acao-corpo select"); } } });
      }
      case "funil":
        return seletor({ rotulo: f.rotulo, valor: v, opcoes: opcoesBase(dados, "funil"), vazio: f.semPadrao ? "Escolha o funil…" : "Funil padrão", desabilitado: dis, obrigatorio: f.obrigatorio,
          aoMudar: x => {
            // plano 1000b · UB-251: a etapa marcada era do funil de antes — sai, mas com aviso (antes sumia em silêncio)
            const tinhaEtapa = !!ac.estagio_id;
            set(x || null);
            if (L.ACAO[ac.tipo].campos.some(c => c.filtraPor === f.nome)) {
              delete ac.estagio_id; pintarEntao();
              if (tinhaEtapa) ui.toast("A etapa escolhida era de outro funil e foi limpa. Escolha a etapa deste funil.", { tipo: "info" });
              const s = blocoEntao.querySelectorAll(".au-passo")[i]; const sf = s && s.querySelectorAll("select")[0]; if (sf) sf.focus({ preventScroll: true });
            }
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
          aoMudar: x => { ac.para = x; if (x !== "departamento") delete ac.departamento_id; pintarEntao(); mudou("entao"); refocarNoPasso(i, "[data-campo=para] select"); },   // plano 1500c · UCA-084
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
          aoMudar: x => { ac.dono = x; delete ac.modo; if (x !== "conta") delete ac.conta_id; pintarEntao(); mudou("entao"); refocarNoPasso(i, "[data-campo=dono] select"); },   // plano 1500c · UCA-084
          opcoes: [{ valor: "rodizio", rotulo: "Rodízio (quem tem menos atendimentos)" }, { valor: "conta", rotulo: "Uma pessoa" },
            ...(opcoesBase(dados, "departamento").length ? [{ valor: "departamento", rotulo: "Um departamento" }] : [])] });
      case "tarefa_ia":
        return P.escolhaCartoes({ rotulo: f.rotulo, valor: v ?? f.padrao, desabilitado: dis,
          // plano 1000b · UB-066: «Pontuar o interesse do paciente» (vocabulário da vertical), não «Pontuar o lead»
          opcoes: (typeof L.tarefasIA === "function" ? L.tarefasIA(vv) : L.TAREFAS_IA).map(([k, nome, texto]) => ({ valor: k, titulo: nome, texto })), aoMudar: x => { ac[f.nome] = x; mudou("entao"); } });
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
          h("p", { class: "sub" }, "Depois da aprovação, toque em «Sincronizar agora» aqui mesmo (ou em Configurações → Números de WhatsApp). Enquanto isso, você pode salvar esta automação desligada. Ou use «Enviar mensagem» (texto livre, pelo número conectado por aparelho)."),
          h("div", { class: "linha" }, btCopiar, botaoSincronizar(ac)))));
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
        refocarNoPasso(auto.acoes.indexOf(ac), ".au-tpl select");     // plano 1500c · UCA-084
      } }));
    const t = todos.find(y => y.id === ac.template_id);
    box.appendChild(h("div", { class: "linha au-tpl-sinc" }, botaoSincronizar(ac)));
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
    // plano 2000d · DU-416: o que cada {{n}} parece pedir (pelo texto em volta) vira sugestão e um botão preenche os vazios
    const sugestoes = L.montarParametrosTemplate(t.corpo || "");
    const sugDe = k => (sugestoes.find(x => x.n === k + 1) || {}).sugestao || "";
    const vaziosComSug = () => pars.slice(0, np).some((v, k) => !String(v || "").trim() && sugDe(k));
    if (np && podeEditar && vaziosComSug()) {
      const btSug = h("button", { type: "button", class: "bt bt-sec bt-p au-tpl-sugerir" }, ui.icone("raio"), "Preencher com o sugerido");
      btSug.addEventListener("click", () => {
        for (let k = 0; k < np; k++) if (!String(pars[k] || "").trim() && sugDe(k)) pars[k] = sugDe(k);
        pintarEntao(); mudou("entao");
        refocarNoPasso(auto.acoes.indexOf(ac), ".au-tpl-pars input");
      });
      box.appendChild(h("div", { class: "linha" }, btSug));
    }
    if (np) box.appendChild(h("div", { class: "au-tpl-pars" }, Array.from({ length: np }, (_, k) =>
      // plano 1000b · UB-059: «1º espaço do modelo» + o trecho do corpo em volta de {{1}} («Olá, ___!») em vez do jargão «Parâmetro {{1}}»
      entrada({ rotulo: `${k + 1}º espaço do modelo`, ajuda: L.trechoParametro(t.corpo, k + 1) ? `No texto: «${L.trechoParametro(t.corpo, k + 1)}»` : null,
        valor: pars[k] ?? "", variaveis: true, max: 200, desabilitado: !podeEditar, obrigatorio: true,
        placeholder: sugDe(k) || "{primeiro_nome}", aoMudar: x => { pars[k] = x; pintarPrev(); mudou("entao"); } }))));
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
  function botaoSincronizar(acDoBotao = null) {
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
        // plano 1000b · UB-075: o foco volta ao passo do botão clicado (não ao 1º passo de modelo)
        const idx = acDoBotao ? auto.acoes.indexOf(acDoBotao) : -1;
        const passoLi = idx >= 0 ? blocoEntao.querySelector(`.au-passo[data-i="${idx}"]`) : null;
        const novo = (passoLi && passoLi.querySelector("select, .au-tpl-sincronizar")) || blocoEntao.querySelector(".au-passo-enviar_template select, .au-tpl-sincronizar");
        if (novo) novo.focus({ preventScroll: true });
      } catch (e) { ui.toast(L.erroAutomacao(e, ctx.api.mensagemErro(e), base.usuarios), { tipo: "erro" }); }
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
    if (!t || t.disabled) { ui.toast("Toque num texto de um passo e depois na variável.", { tipo: "info" }); return; }   // plano 1000b · UB-060: vale no celular
    const ini = t.selectionStart ?? t.value.length, fim = t.selectionEnd ?? t.value.length;
    // plano 1500c · UCA-040: mudar o value direto ignora o maxlength — confere antes (o parâmetro do modelo vai até 200, o título até 160)
    const teto = Number(t.maxLength);
    if (teto > 0 && t.value.length - (fim - ini) + tok.length > teto) { ui.toast(`Não cabe: o campo vai até ${teto} caracteres.`, { tipo: "info" }); t.focus(); return; }
    t.value = t.value.slice(0, ini) + tok + t.value.slice(fim);
    try { t.setSelectionRange(ini + tok.length, ini + tok.length); } catch { /* ok */ }
    t.focus();
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ------------------------------------------------ prévia, avisos e validação ao vivo
  /**
   * plano 1000b · UB-021: o que custa indexar a base (problemas, variáveis, cadeias) é calculado UMA vez por mudança e repassado —
   * antes cada tecla validava duas vezes e refazia as cadeias e as variáveis em três lugares.
   */
  function analisar() {
    const ps = L.problemas(auto, { base, ligar: !!auto.ativo });
    return { ps, r: ps[0] ? { ok: false, motivo: ps[0].motivo, onde: ps[0].onde, indice: ps[0].indice } : { ok: true },
      vars: L.variaveisDosPassos(auto, base), cads: L.cadeiasDeAutomacao(auto, dados.itens || [], base),
      // plano 2000d · AX-095: os avisos de estrutura UMA vez por mudança (antes: duas, na lateral e nos passos); com a base (AX-016/AX-091)
      est: L.avisosEstruturaDetalhados(auto, vv, { iaAtendimentoLigada: L.iaAtendimentoLigada(dados), base }) };
  }
  /** Os avisos da lateral esperam a pessoa parar de digitar (120 ms); dentro do passo, na hora. */
  let tAvisos = null;
  function agendarAvisos() { clearTimeout(tAvisos); tAvisos = setTimeout(() => { tAvisos = null; if (raiz.isConnected) pintarAvisosLaterais(analisar()); }, AVISOS_MS); }
  if (amb.aoSair) amb.aoSair(() => clearTimeout(tAvisos));
  function atualizarPrevia(imediato = false, an = analisar()) {
    frase.textContent = L.descrever(auto, base, vv);
    if (imediato) pintarDiagrama(); else agendarDiagrama();
    const r = an.r;
    ui.limpar(estado);
    estado.className = ["au-estado", r.ok ? "au-ok" : "au-falta"].join(" ");
    estado.append(ui.icone(r.ok ? "check" : "alerta"), h("span", null, r.ok
      // plano 1000 · AS-030: a promessa depende do gatilho (evento: 15 s; tempo: quando o tempo passar; agendado: no horário)
      ? (auto.ativo ? L.textoProntaLigada(auto.gatilho) : "Pronta. Vai ficar salva e desligada.")
      : `Falta: ${r.motivo}.`));
    pintarAvisosPassos(an);
    if (imediato) pintarAvisosLaterais(an); else agendarAvisos();
  }
  function pintarAvisosLaterais(an) {
    ui.limpar(avisos);
    const bloqs = [];
    // plano 1000 · AS-232: o trecho das 24 h da Meta só quando há número da Meta (sem saber o provedor dos números, continua o texto completo)
    if (L.enviaMensagem(auto)) {
      const meta = L.temCanalMeta(base);
      // plano 2000d · DU-024: sem o nome do fornecedor
      bloqs.push(meta === false ? "Mensagens de WhatsApp saem pelo número conectado por aparelho (texto livre a qualquer hora)."
        : "Mensagens de WhatsApp saem pelo número conectado por aparelho. No WhatsApp oficial (Meta), texto livre só dentro de 24 h da última mensagem do cliente; fora disso, só modelo aprovado.");
    }
    if (L.faltaModelo(auto)) bloqs.push("Sem modelo aprovado escolhido: dá para salvar desligada e ligar quando a Meta aprovar.");
    if (auto.gatilho === "antes_da_data" && auto.acoes.some(a => a.tipo === "enviar_template" && (a.parametros || []).some(p => /\{hora_consulta\}/.test(p))))
      bloqs.push(`Quem tiver só a data (sem a hora) da ${L.palavraConsulta(vertical)} aparece nas execuções como erro, para ninguém receber mensagem com buraco.`);
    // plano 1000b · UB-189: o mesmo cuidado para «Depois da data» e para «Enviar mensagem» com {hora_consulta} / {data_consulta}
    else { const av = L.avisoDataHoraConsulta(auto, vertical); if (av) bloqs.push(av); }
    if (iaOff && L.temIA(auto)) bloqs.push(L.AVISO_IA_DESLIGADA);
    // plano 1500c · UCA-017/018/019/020/022/111/112: os avisos de estrutura falam a língua da vertical
    for (const t of (an.est || []).map(x => x.texto)) bloqs.push(t);   // plano 2000d · DU-018 · AX-095
    // plano 1000 · AS-035: variável escrita errada chega crua ao cliente — avisa (e não deixa LIGAR; salvar desligada pode)
    for (const v of an.vars) bloqs.push(`Passo ${v.indice + 1}: ${L.fraseVariaveis(v)}. Assim o cliente receberia o texto entre chaves.`);
    // plano 1000 · AS-278: um passo daqui dispara outra automação ligada (e, no pior caso, ela devolve: laço)
    // plano 1500c · UCA-015/016: laço de 3+ automações com o caminho, e a que dispara a si mesma
    for (const c of an.cads)
      bloqs.push(c.laco ? `Passo ${c.indice + 1} (usa ${c.por}): ${L.fraseLaco(c)} As execuções vão se encher de erro.`
        : `O passo ${c.indice + 1} usa ${c.por}, que dispara «${c.outra.nome}» (ligada). Confira se é isso mesmo.`);
    // plano 1500c · UCA-088: outra automação ligada com o mesmo gatilho também manda mensagem — o cliente receberia duas seguidas
    for (const o of L.automacoesConcorrentes(auto, dados.itens || []))
      bloqs.push(`«${o.nome}» (ligada) tem o mesmo gatilho e também manda mensagem: o cliente pode receber as duas, uma atrás da outra.`);
    // plano 1000b · UB-024: com «respeitar horário» e um departamento padrão sem horário nenhum, a mensagem nunca sairia
    if (L.linhaDoTempo(auto.acoes, opcoesTempo()).some(t => t.semHorario)) bloqs.push(AVISO_SEM_HORARIO);
    for (const t of bloqs) avisos.appendChild(h("p", { class: "au-aviso-lat" }, ui.icone("info"), h("span", null, t)));
  }
  /** Os mesmos avisos de variável e de laço, também DENTRO do passo (quem está digitando vê ali). */
  function pintarAvisosPassos(an = analisar()) {
    const vars = new Map(an.vars.map(v => [v.indice, v]));
    const cads = an.cads;
    // plano 1500c · UCA-111: os avisos de estrutura com passo (esperas seguidas, passo sem conversa…) também aparecem no próprio passo
    const est = (an.est || []).filter(x => x.indice != null && x.tipo !== "parar");   // plano 2000d · AX-095
    blocoEntao.querySelectorAll(".au-passo").forEach((li, i) => {
      let el = li.querySelector(".au-passo-aviso");
      const v = vars.get(i), c = cads.find(x => x.indice === i && x.laco) || cads.find(x => x.indice === i), e = est.find(x => x.indice === i);
      const txt = v ? `Atenção: ${L.fraseVariaveis(v)}.` : c ? (c.laco ? L.fraseLaco(c) : `Dispara também «${c.outra.nome}».`) : e ? e.texto : "";
      if (!txt) { if (el) el.remove(); return; }
      if (!el) { el = h("p", { class: "aviso aviso-aten au-passo-aviso" }); const cart = li.querySelector(".au-acao"); (cart || li).appendChild(el); }
      ui.limpar(el); el.append(ui.icone("alerta"), h("span", null, txt));
    });
  }

  /** Mostra os problemas onde eles estão (bloco, condição, passo) — só nas partes que a pessoa já mexeu. */
  /**
   * plano 1000b · UB-014: as caixas role=alert só são reescritas quando o texto MUDA (o NVDA repetia «Falta: …» a cada tecla
   * digitada em outro campo); o hidden também só alterna quando muda.
   */
  const escreverAlerta = (e, txt) => {
    if (e.textContent !== txt) e.textContent = txt;
    if (e.hidden !== !txt) e.hidden = !txt;
  };
  function pintarValidacao(todos = null) {
    const ps = (todos || L.problemas(auto, { base, ligar: !!auto.ativo }))
      .filter(p => !(p.onde === "entao" && p.indice != null && frescos.has(auto.acoes[p.indice])));
    for (const [onde, bloco] of [["quando", blocoQuando], ["se", blocoSe], ["entao", blocoEntao]]) {
      const e = bloco.querySelector(".au-bloco-erro");
      if (!e) continue;
      const meus = tocado.has(onde) ? ps.filter(p => p.onde === onde && p.indice == null) : [];
      escreverAlerta(e, meus.length ? `Falta: ${meus[0].motivo}.` : "");
      const itens = tocado.has(onde) ? ps.some(p => p.onde === onde) : false;
      bloco.classList.toggle("au-bloco-com-erro", itens);
    }
    const marca = (lista, onde) => lista.forEach((li, i) => {
      const e = li.querySelector(".au-item-erro");
      if (!e) return;
      const p = tocado.has(onde) ? ps.find(x => x.onde === onde && x.indice === i) : null;
      escreverAlerta(e, p ? `Falta: ${L.semPrefixo(p.motivo)}.` : "");
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
    const an = analisar();             // plano 1000b · UB-021: uma análise por mudança
    atualizarPrevia(false, an);
    if (opcoes && opcoes.tempo) atualizarTempos();
    pintarValidacao(an.ps);
    pintarTesteCom();
    agendarRascunho();       // plano 1500c · UCA-086
    agendarHistorico();      // plano 1500c · UCA-092
  }

  // ------------------------------------------------ plano 1500c · UCA-092: desfazer / refazer (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z) fora dos campos de texto
  const hist = L.historicoEdicao(30);
  let tHist = null, restaurando = false;
  function agendarHistorico() {
    if (restaurando || !podeEditar) return;
    clearTimeout(tHist);
    tHist = setTimeout(() => { tHist = null; hist.empilhar(copia(auto)); }, HISTORICO_MS);
  }
  function restaurar(estado, rotulo) {
    if (!estado) { ui.toast(rotulo === "desfazer" ? "Nada para desfazer." : "Nada para refazer.", { tipo: "info" }); return; }
    restaurando = true;
    const id = auto.id;
    auto = estado;
    if (id != null) auto.id = id; else delete auto.id;
    auto.condicoes = auto.condicoes || []; auto.acoes = auto.acoes || []; auto.config = auto.config || {};
    inpNome.value = auto.nome || "";
    swAtivo.definir(!!auto.ativo); pintarNotaAtivo();
    pintarQuando(); pintarSe(); pintarEntao();
    mudou();
    restaurando = false;
    anunciar(rotulo === "desfazer" ? "Mudança desfeita." : "Mudança refeita.");
  }
  if (podeEditar && typeof ui.atalho === "function" && amb.aoSair) {
    const emTexto = () => { const a = document.activeElement; return !!a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !["checkbox", "radio", "button"].includes(a.type)) || a.isContentEditable); };
    const podeAtalho = ev => raiz.isConnected && !emTexto() && !(() => { try { return document.querySelector("dialog[open]"); } catch { return null; } })();
    try {
      amb.aoSair(ui.atalho("mod+z", ev => { if ((ev && ev.shiftKey) || !podeAtalho(ev)) return; if (ev && ev.preventDefault) ev.preventDefault(); if (tHist) { clearTimeout(tHist); tHist = null; hist.empilhar(copia(auto)); } restaurar(hist.desfazer(), "desfazer"); }) || (() => {}));
      amb.aoSair(ui.atalho("mod+shift+z", ev => { if (!podeAtalho(ev)) return; if (ev && ev.preventDefault) ev.preventDefault(); restaurar(hist.refazer(), "refazer"); }) || (() => {}));
    } catch { /* sem atalhos, os «Desfazer» dos avisos continuam */ }
  }
  if (amb.aoSair) amb.aoSair(() => clearTimeout(tHist));

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
    // plano 1000b · UB-053: as confirmações vêm ANTES do «carregando» — o botão não fica ocupado (aria-busy) enquanto a pessoa lê o diálogo
    const confirmacoes = (async () => {
      // plano 1000 · AS-025: ligar no editor algo que manda WhatsApp (ou gasta IA) pede a MESMA confirmação da lista — só quando estava desligada/nova
      const estavaLigada = !!(salvoItem && salvoItem.ativo);
      if (auto.ativo && !estavaLigada && (L.enviaMensagem(auto) || L.temIA(auto))) {
        // plano 1500c · UCA-017/018: disparo em massa (todo dia para todos, ou resposta a toda mensagem) ganha uma confirmação reforçada
        // plano 2000d · DU-018: o conflito com a IA de atendimento também reforça a confirmação
        const massa = L.avisosEstruturaDetalhados(auto, vv, { iaAtendimentoLigada: L.iaAtendimentoLigada(dados) }).find(x => x.tipo === "massa_diaria" || x.tipo === "toda_mensagem" || x.tipo === "conflito_ia");
        // plano 2000d · DU-040: automação de tempo/diária com mensagem: quantos recebem AGORA (acima de 50, digitar o número)
        let quem = null;
        if (L.contarAoLigar(auto)) {
          try { const resp = await ctx.api.rpcC("nx_auto_simular", { p_automacao: L.limpar(auto) }); quem = L.fraseQuemRecebe(L.normalizarSimulacao(resp, auto, base, vv).total, { auto }); /* plano 2000d · AX-057 */ } catch { quem = null; }
        }
        const reforco = !!massa || !!(quem && quem.massa);
        const ok = await ui.confirmar({ titulo: `Ligar «${auto.nome}»?`, rotulo: reforco ? "Ligar mesmo assim" : "Salvar e ligar", perigo: reforco,
          digitar: quem && quem.digitar ? quem.digitar : null,
          texto: [massa ? `Atenção: ${massa.texto} Assim que salvar ligada, as mensagens começam a sair. Dá para desligar a qualquer momento.`
            : L.enviaMensagem(auto) ? "Esta automação envia mensagens de WhatsApp para clientes. Assim que salvar ligada, quem se encaixar no gatilho começa a receber. Dá para desligar a qualquer momento."
            : "Esta automação usa a IA a cada execução (gasta a cota do mês). Assim que salvar ligada, ela começa a rodar.", quem ? quem.texto : ""].filter(Boolean).join(" ") });
        if (!ok) return false;
      }
      // plano 2000d · DU-108: salvar uma LIGADA que manda mensagem mostra o que muda antes (o cliente sente a mudança na hora)
      if (auto.ativo && estavaLigada && L.enviaMensagem(auto) && salvoJson) {
        let antes = null; try { antes = JSON.parse(salvoJson); } catch { antes = null; }
        const dif = antes ? L.resumoDiferencas({ ...antes, nome: auto.nome }, L.limpar(auto)) : "";   // só o nome mudou: não pergunta
        if (dif) {
          // plano 2000d · DU-442: quem já está no meio da sequência (em espera) também é dito — os passos que faltam para eles seguem o texto salvo
          const esp = item ? Number(item.em_espera) || 0 : 0;
          const ok = await ui.confirmar({ titulo: `Salvar «${auto.nome}» ligada?`, rotulo: "Salvar", texto: `O que muda: ${dif}. Ela continua ligada e a mudança vale já para os próximos envios.${esp ? ` ${esp === 1 ? "1 pessoa está" : `${esp} pessoas estão`} no meio da sequência: o que ainda falta para ${esp === 1 ? "ela" : "elas"} sai com o texto novo.` : ""}` });
          if (!ok) return false;
        }
      }
      // plano 1000 · AS-277: salvar DESLIGADA o que estava ligado cancela as esperas em andamento — avisa quem perde os próximos passos
      const avisoEspera = !auto.ativo && estavaLigada ? L.avisoDesligarEspera(salvoItem) : null;
      if (avisoEspera) {
        const ok = await ui.confirmar({ titulo: `Desligar «${auto.nome}»?`, rotulo: "Salvar desligada", perigo: true,
          texto: `${avisoEspera} As esperas desta automação são canceladas ao desligar.` });
        if (!ok) return false;
      }
      return true;
    })();
    confirmacoes.then(ok => { if (ok) gravar(botao, { continuar }); else salvando = false; }, () => { salvando = false; });
  };
  const gravar = (botao, { continuar }) => {
    const p = (async () => {
      // revisão 1000b · UB-211: manda a versão que estava na tela; se outra pessoa salvou depois, o servidor recusa
      // (edicao_desatualizada) em vez de apagar o que ela fez. Nova automação não manda nada.
      const versao = auto.id != null ? ((salvoItem && salvoItem.atualizado_em) || (item && item.atualizado_em) || null) : null;
      const salvo = await ctx.api.rpcC("nx_automacao_salvar", versao ? { p_auto: L.limpar(auto), p_atualizado_em: versao } : { p_auto: L.limpar(auto) });
      salvoJson = JSON.stringify(L.limpar(salvo));
      if (rasc) rasc.apagar(idRasc);            // salvo: o rascunho (inclusive um antigo ainda oferecido) perde o sentido
      if (amb.limparRascunho) amb.limparRascunho();
      ui.toast(salvo.ativo ? `«${salvo.nome}» salva e ligada.` : `«${salvo.nome}» salva (desligada).`, { tipo: "ok" });
      if (continuar) {
        // AS-051: fica no editor — o que está na tela passa a ser o salvo; a nova ganha o id (o próximo «Salvar» atualiza a mesma)
        if (salvo && salvo.id != null) auto.id = salvo.id;
        salvoItem = { ...(salvoItem || {}), ...salvo };
        repintarAutor(salvoItem);       // plano 1500c · UCA-091: «Alterada por você, agora»
        salvoJson = JSON.stringify(L.limpar(auto));
        ativoSalvo = !!auto.ativo; pintarNotaAtivo();
        if (salvo && salvo.id != null && !item) {
          dados.itens = Array.isArray(dados.itens) ? dados.itens : [];
          if (!dados.itens.some(x => x.id === salvo.id)) dados.itens.push(salvoItem);   // AS-023: o nome dela não conta como «repetido»
          // o rascunho passa a ser o da automação salva (senão o próximo fica como «nova» e, recuperado, criaria uma duplicata)
          if (rasc) rasc.apagar(idRasc);
          idRasc = String(salvo.id);
          try { if (typeof history !== "undefined" && history.replaceState) history.replaceState(history.state, "", `#/automacoes/${encodeURIComponent(salvo.id)}`); } catch { /* o endereço só não muda */ }
          // plano 1000b · UB-007: a partir daqui ela é uma automação salva — aba «Execuções» e «Duplicar» aparecem sem recarregar
          item = salvoItem;
          montarAbas("regra");
          if (podeEditar && !btDuplicar) {
            btDuplicar = criarBtDuplicar();
            const acoesCab = raiz.querySelector(".au-ed-acoes");
            if (acoesCab) acoesCab.insertBefore(btDuplicar, btCancelar.parentNode === acoesCab ? btCancelar : null);
          }
          pintarRotulosSalvar(salvo.nome || auto.nome);
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
      const msg = e && e.codigo === "edicao_desatualizada"
        ? "Outra pessoa salvou esta automação enquanto você editava. Para não apagar o que ela fez, nada foi gravado: copie o que precisar, recarregue a página e refaça a sua mudança."
        : L.erroAutomacao(e, ctx.api.mensagemErro(e), base.usuarios);
      const lugar = e && e.codigo === "automacao_invalida" && e.hint ? L.ondeDoHint(e.hint) : null;
      if (lugar && lugar.onde) mostrarErro({ motivo: e.hint, onde: lugar.onde, indice: lugar.indice });
      else {
        mostrarErroSalvar(msg);
        try { erroSalvar.scrollIntoView({ block: "nearest", behavior: ui.comportamentoRolagem() }); } catch { /* ok */ }
        // plano 1000b · UB-247: sem bloco a apontar, o foco vai à caixa do erro (o teclado e o leitor chegam ao motivo)
        try { erroSalvar.focus({ preventScroll: true }); } catch { /* ok */ }
      }
    });
  };
  if (btSalvarSeguir) btSalvarSeguir.addEventListener("click", () => salvar(btSalvarSeguir, { continuar: true }));
  // plano 1000 · AS-047: Ctrl/⌘+S salva (e não abre o «Salvar página» do navegador) enquanto o editor está na tela
  if (btSalvar && typeof ui.atalho === "function" && amb.aoSair) {
    try {
      amb.aoSair(ui.atalho("mod+s", ev => {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (!raiz.isConnected) return;
        // plano 1000b · UB-250: com um diálogo (confirmar) ou gaveta aberta, o atalho não salva por baixo dele
        try { if (document.querySelector("dialog[open]")) return; } catch { /* sem querySelector: segue */ }
        salvar(btSalvar);
      }));
    } catch { /* sem o atalho, o botão basta */ }
  }
  if (btSalvar) {
    btSalvar.addEventListener("click", () => salvar(btSalvar));
    // no celular o cabeçalho não fica preso no topo: o mesmo "Salvar" também no fim da regra
    const btSalvar2 = h("button", { type: "button", class: "bt bt-prim bt-g", "data-escrita": "" }, ui.icone("check"), item ? "Salvar" : "Criar automação");   // revisão 1000b · UB-122
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
      destino = h("div", { class: "au-sim au-sim-gaveta" });     // plano 1500c · UCA-081: sem aria-live (o status curto anuncia)
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
      // plano 1500c · UCA-123: com «Respeitar horário», a mensagem diz quando sai de verdade (próxima abertura do horário)
      sim = L.normalizarSimulacao(resp, auto, base, vv, auto.respeitar_horario && horarioPadrao !== undefined ? { horario: horarioPadrao, agora: Date.now() } : {});
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
          : L.erroAutomacao(erro, ctx.api.mensagemErro(erro), base.usuarios))));
      const plano = L.passosEmFrases(auto, base, vv);
      if (plano.length) areaSim.appendChild(blocoPlano(plano));
      return;
    }
    const n = sim.alvos.length;
    const rotuloTopo = sim.ehAmostra
      ? (n === 0 ? "Nenhum exemplo agora" : n === 1 ? "1 exemplo agora" : `${n} exemplos agora`)
      : (sim.total === 0 ? "Nenhum alvo agora" : sim.total === 1 ? "1 alvo agora" : `${sim.total} alvos agora`);
    // plano 1500c · UCA-081: o título do resultado recebe o foco e o status curto diz o resumo (a lista não é lida inteira)
    const tituloRes = h("p", { class: "au-sim-titulo", tabindex: "-1" }, sim.ehExemplo ? "Resultado com exemplo fictício" : "Resultado do teste");
    areaSim.appendChild(tituloRes);
    areaSim.appendChild(h("div", { class: "au-sim-topo" },
      // plano 1500c · UCA-057: o exemplo de demonstração vem marcado
      sim.ehExemplo ? ui.pilula("Exemplo fictício", "aten", { icone: "info" }) : ui.pilula(rotuloTopo, n === 0 && sim.total === 0 ? "neutra" : "prim", { icone: "olho" }),
      h("span", { class: "sub" }, "Nada foi enviado nem salvo."),
      // plano 2000d · DU-063: o resultado em texto (primeiro nome e telefone mascarado) para mandar a quem ajuda
      !sim.ehExemplo && sim.alvos.length ? (() => { const b = h("button", { type: "button", class: "bt bt-fant bt-p au-sim-copiar" }, ui.icone("copiar"), "Copiar resultado");
        b.addEventListener("click", () => ui.copiar(L.textoDoTeste(sim, auto), { aviso: "Resultado copiado (só o primeiro nome, telefones escondidos)." })); return b; })() : null));
    // plano 1000 · AS-270: quantas mensagens (e o que mais) sairiam agora, antes da lista
    const saidas = L.resumoSaidasSimulacao(sim);
    if (saidas.texto && !sim.ehExemplo) areaSim.appendChild(h("p", { class: "au-sim-saidas" }, ui.icone(saidas.mensagens ? "whatsapp" : "raio"), h("span", null, saidas.texto)));
    statusSim.textContent = `${sim.ehExemplo ? "Exemplo fictício" : rotuloTopo}.${saidas.texto && !sim.ehExemplo ? ` ${saidas.texto}` : ""}`;
    if (raiz.contains(document.activeElement) || areaSim !== areaSimOriginal) setTimeout(() => { try { tituloRes.focus({ preventScroll: true }); } catch { /* ok */ } }, 30);
    // plano 1500c · UCA-057: empresa sem registros (ninguém para mostrar) — dá para ver com 2 pessoas de exemplo
    if (n === 0 && !sim.total && !sim.ehExemplo && auto.acoes.length) {
      const btEx = h("button", { type: "button", class: "bt bt-sec bt-p au-sim-exemplo" }, ui.icone("olho"), "Ver com exemplo");
      btEx.addEventListener("click", () => { ui.limpar(areaSim); pintarSimulacao(L.simulacaoDemonstracao(auto, base, vv), null); });
      areaSim.appendChild(h("div", { class: "linha" }, btEx));
    }
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
            // plano 1000b · UB-019: cada «Abrir» diz o quê (os links eram todos iguais para o leitor de tela)
            a.link ? h("a", { class: "au-sim-link", href: a.link, "aria-label": `Abrir ${a.titulo}` }, "Abrir") : null),
          a.ignorado ? h("p", { class: "au-sim-nota" }, ui.icone("info"), a.motivoIgnorado) : null,
          a.passos.length ? h("ol", { class: "au-sim-passos", role: "list" }, a.passos.map(p => h("li", { class: ["au-sim-passo", `au-sim-${p.estado}`] },
            // plano 2000d · DU-062: ícone por estado (não só a cor)
            (pe => ui.pilula(pe.texto, { faria: "ok", pularia: "aten", espera: "info", erro: "ruim" }[p.estado] || "neutra", { icone: pe.icone }))(L.pilulaEstadoPasso(p.estado)),
            h("span", { class: "au-sim-passo-txt" }, p.rotulo, p.quando ? h("small", null, ` · ${p.quando}`) : null, p.motivo ? h("small", null, ` — ${p.motivo}`) : null)))) : null,
          // plano 1000b · UB-074: o resultado mostra até 12 passos — o que passou disso é dito
          a.passosOcultos > 0 ? h("p", { class: "sub au-sim-mais-passos" }, `e mais ${a.passosOcultos} ${a.passosOcultos === 1 ? "passo" : "passos"}`) : null,
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
  let serieGuardada = null;     // plano 1000b · UB-037: {em, valor, assinatura} da última série de 14 dias lida
  let conferindoNovas = false;  // plano 1000b · UB-076: a conferência silenciosa (foco na lista) em andamento
  // plano 1500c · UCA-004/005/054: busca por pessoa (p_busca), «quem não passou nas condições» (p_filtradas) e o passo em que pararam
  let execBusca = "";
  let execFiltradas = false;
  let execPasso = "";
  let execExtrasOk = true;      // banco sem a 20261015a: cai na chamada antiga (sem busca nem filtradas) sem quebrar
  /** A lista de execuções com os filtros do servidor que existirem. */
  async function lerExecucoes() {
    const p = { p_id: item.id, p_limite: execLimite };
    const extras = execExtrasOk && (execBusca || execFiltradas);
    if (extras) { if (execBusca) p.p_busca = execBusca; if (execFiltradas) p.p_filtradas = true; }
    try { return await ctx.api.rpcC("nx_automacao_execucoes", p); }
    catch (e) {
      const c = String((e && (e.codigo || e.message)) || "");
      if (!extras || !/could not find the function|pgrst202|http_404|funcao_invalida/i.test(c)) throw e;
      execExtrasOk = false;
      return ctx.api.rpcC("nx_automacao_execucoes", { p_id: item.id, p_limite: execLimite });
    }
  }
  /** Muda quando chega execução nova ou alguma muda de situação (id + estado das primeiras). */
  const assinaturaExec = l => { const a = Array.isArray(l) ? l : (l && Array.isArray(l.itens) ? l.itens : []); return `${a.length}|${a.slice(0, 20).map(x => `${x.id}:${x.status || x.estado || ""}`).join(",")}`; };
  async function pintarExecucoes(opc = {}) {
    const eu = ++execSeq;
    // a lista é redesenhada (o botão antigo sai da tela): quem usa o teclado continua no mesmo botão
    // plano 1000b · UB-190: o botão é achado pelo data-acao (trocar o rótulo não quebra o foco depois da recarga)
    const ativo = document.activeElement;
    const refoco = opc.foco || (painelExec.contains(ativo) ? (ativo.classList.contains("au-mais") ? "mais" : ativo.dataset && ativo.dataset.acao ? ativo.dataset.acao : null) : null);
    // AS-056: a recarga automática é suave — sem esqueleto, a lista antiga fica até a nova chegar
    if (!opc.suave) { ui.limpar(painelExec); painelExec.appendChild(ui.esqueleto("lista", 5)); }
    try {
      // série por dia do servidor (contrato 7) junto com a lista; banco antigo (sem a RPC) ou resposta estranha → o gráfico é calculado aqui
      const pedirSerie = () => ctx.api.rpcC("nx_automacao_execucoes_dia", { p_automacao: item.id, p_dias: 14 }).then(r => L.serieExecucoesServidor(r), () => null);
      let lista, porDiaServidor;
      if (opc.automatica && serieGuardada && Date.now() - serieGuardada.em < SERIE_MS) {
        // plano 1000b · UB-037: a recarga automática (20 s) relê só a lista; a série de 14 dias, a cada 5 min ou quando a lista mudou
        lista = await lerExecucoes();
        porDiaServidor = assinaturaExec(lista) === serieGuardada.assinatura ? serieGuardada.valor : await pedirSerie();
      } else {
        [lista, porDiaServidor] = await Promise.all([lerExecucoes(), pedirSerie()]);
      }
      // plano 1500c · UCA-004: com busca, o gráfico é o da lista achada (a série do servidor é de todas)
      if (execBusca && execExtrasOk) porDiaServidor = null;
      if (eu !== execSeq) return;           // chegou depois de uma carga mais nova: descarta
      serieGuardada = { em: serieGuardada && serieGuardada.valor === porDiaServidor ? serieGuardada.em : Date.now(), valor: porDiaServidor, assinatura: assinaturaExec(lista) };
      ui.limpar(painelExec);
      const arr = Array.isArray(lista) ? lista : (lista && Array.isArray(lista.itens) ? lista.itens : []);
      const contagem = { todas: arr.length, ok: 0, erro: 0, pulado: 0, espera: 0 };
      for (const x of arr) contagem[L.situacaoExecucao(x)]++;
      contagem.envio = arr.filter(L.ehFalhaDeEnvio).length;   // plano 2000d · DU-066
      const btAtualizar = h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { acao: "atualizar" } }, ui.icone("relogio"), "Atualizar");
      // plano 1000b · UB-191: «Atualizar» gira no próprio botão (aria-busy) e a lista antiga fica até a nova chegar
      btAtualizar.addEventListener("click", () => { ui.carregando(btAtualizar, pintarExecucoes({ foco: "atualizar", suave: true })).catch(() => {}); });
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
      const chipsSit = [];
      let grafico = null;     // plano 1000b · UB-039: a barra do dia escolhido fica marcada (aria-pressed) a cada filtro
      const desenhar = () => {
        ui.limpar(corpoLista);
        if (grafico && typeof grafico.marcarDia === "function") grafico.marcarDia(execDia);
        // plano 1500c · UCA-054: situação, dia e passo combinados
        const vis = L.filtrarExecucoes(arr, { situacao: execFiltro, dia: execDia, passo: execPasso || null });
        pintarChipDia();
        // plano 1000b · UB-038: com um dia escolhido no gráfico, as contagens dos chips são as DESSE dia (rótulo e aria-label juntos)
        const doDia = execDia ? arr.filter(x => L.diaDaExecucao(x) === execDia) : arr;
        const cont = { todas: doDia.length, ok: 0, erro: 0, pulado: 0, espera: 0 };
        for (const x of doDia) cont[L.situacaoExecucao(x)]++;
        cont.envio = doDia.filter(L.ehFalhaDeEnvio).length;   // plano 2000d · DU-066
        for (const [k, rot, b] of chipsSit) {
          b.textContent = `${rot} · ${cont[k]}`;
          b.setAttribute("aria-label", `${rot}, ${cont[k]} ${cont[k] === 1 ? "execução" : "execuções"}${execDia ? ` em ${L.rotuloDia(execDia)}` : ""}`);
        }
        if (!vis.length) {
          // plano 1500c · UCA-004: com busca, o vazio diz o que foi buscado
          corpoLista.appendChild(ui.vazio({ titulo: execBusca && !arr.length ? `Nenhuma execução para «${execBusca}»` : arr.length ? "Nada nesta situação" : "Ainda não rodou", icone: "relogio", tema: "automacoes",
            texto: execBusca && !arr.length ? "Confira o nome ou busque por parte dele." : arr.length ? "Tente outro filtro." : item.ativo ? "Assim que o gatilho acontecer, cada execução aparece aqui, com o que foi feito." : "Ela está desligada. Ligue para começar a rodar." }));
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
      // plano 2000d · DU-066: «Falha de envio» só aparece quando há alguma
      for (const [k, rot] of [...L.SITUACOES_EXECUCAO, ...(contagem.envio || execFiltro === "envio" ? [["envio", "Falha de envio"]] : [])]) {
        const b = P.chip({ rotulo: `${rot} · ${contagem[k]}`, ligado: execFiltro === k, modo: "radio", aoClicar: () => {
          execFiltro = k; filtro.querySelectorAll(".au-chip").forEach(c => c.setAttribute("aria-checked", String(c === b))); desenhar(); } });
        // plano 1000 · AS-226: o leitor de tela ouve «Com erro, 2 execuções» (o «·» era lido de um jeito estranho)
        b.setAttribute("aria-label", `${rot}, ${contagem[k]} ${contagem[k] === 1 ? "execução" : "execuções"}`);
        chipsSit.push([k, rot, b]);
        filtro.appendChild(b);
      }
      // quem edita pode impedir o que ainda ia sair (antes a única saída era desligar a automação inteira)
      // plano 1000b · UB-004: item.em_espera é abatido a cada cancelamento (cancelarEspera), então o número do diálogo não fica velho
      esperasNaTela = Number(item.em_espera) > 0 ? Number(item.em_espera) : contagem.espera;
      // plano 1500c · UCA-056: as esperas podem estar fora das carregadas — vale o maior entre o item e a lista
      const btCancelarTodas = podeEditar && Math.max(Number(item.em_espera) || 0, contagem.espera) > 0 ? h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("parar"), "Cancelar todas as esperas") : null;
      if (btCancelarTodas) btCancelarTodas.addEventListener("click", () => cancelarEspera(null, btCancelarTodas));
      // plano 1500c · UCA-034: o histórico em CSV (Excel brasileiro) — guardar ou mandar antes de excluir
      const btCsv = arr.length ? h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { acao: "csv" } }, ui.icone("baixar"), "Baixar CSV") : null;
      if (btCsv) btCsv.addEventListener("click", () => baixarCsvExecucoes(arr));
      // plano 1500c · UCA-004: busca por pessoa ou registro (p_busca), com espera de 300 ms
      const idBuscaEx = novoId("exbusca");
      const buscaEx = h("input", { id: idBuscaEx, type: "search", class: "au-ex-busca-inp", value: execBusca, placeholder: "Buscar por nome", autocomplete: "off", maxlength: 80, dataset: { acao: "busca" } });
      buscaEx.addEventListener("input", ui.debounce(() => { const v = buscaEx.value.trim(); if (v === execBusca) return; execBusca = v; execDia = null; pintarExecucoes({ suave: true, foco: "busca" }); }, 300));
      // plano 1500c · UCA-005: «quem não passou nas condições» (p_filtradas) explica «por que não rodou para a Maria»
      const swFiltradas = P.interruptor({ ligado: execFiltradas, rotulo: "Incluir quem não passou nas condições",
        aoMudar: v => { execFiltradas = v; pintarExecucoes({ suave: true, foco: "filtradas" }); } });
      swFiltradas.dataset.acao = "filtradas";
      // plano 1500c · UCA-054: filtrar pelo passo em que pararam
      const passosEx = L.passosDasExecucoes(arr, auto, vv);
      if (execPasso && !passosEx.some(p => p.valor === execPasso)) execPasso = "";
      const selPasso = passosEx.length > 1 ? seletor({ rotulo: "Passo", valor: execPasso, vazio: "Todos os passos", opcoes: passosEx, classe: "au-ex-passo-sel",
        aoMudar: v => { execPasso = v || ""; desenhar(); } }) : null;
      painelExec.appendChild(h("div", { class: "au-ex-cab" },
        // plano 1000b · UB-005: sem execução nenhuma, nada de «As últimas 0 execuções» (o vazio abaixo já explica)
        h("p", { class: "sub" }, arr.length ? `${arr.length === 1 ? "A última execução" : `As últimas ${Math.min(arr.length, execLimite)} execuções`}${execBusca ? ` com «${execBusca}»` : ""}. Erro numa automação não atrapalha as outras.`
          : "Erro numa automação não atrapalha as outras."),
        h("div", { class: "linha" }, btCancelarTodas, btCsv, btAtualizar)));
      painelExec.appendChild(h("div", { class: "au-ex-ferr" },
        h("div", { class: "campo au-ex-busca" }, h("label", { for: idBuscaEx, class: "sr-only" }, "Buscar execuções por nome"), h("span", { class: "busca" }, ui.icone("busca"), buscaEx)),
        execExtrasOk ? h("div", { class: "campo au-campo-sw au-ex-filtradas" }, h("span", { class: "au-campo-sw-rot" }, "Incluir quem não passou nas condições"), swFiltradas) : null,
        selPasso));
      // gráfico de execuções por dia (item 54): calculado aqui a partir da lista, com estado vazio e versão em tabela.
      // A lista é só as últimas `execLimite`: cheia, pode faltar execução dentro dos 14 dias — a janela recorta no dia da mais
      // antiga carregada e o subtítulo avisa «nas últimas N execuções carregadas» (sem série do servidor, é o honesto).
      // Com a série do servidor (contrato 7) a janela de 14 dias é inteira e conta tudo, não só as carregadas.
      if (porDiaServidor && porDiaServidor.n > 0) {
        painelExec.appendChild(h("div", { class: "cartao au-ex-graf" }, (grafico = P.graficoDias({ serie: porDiaServidor.serie, dias: porDiaServidor.dias, n: porDiaServidor.n, servidor: true, aoEscolherDia: escolherDia, diaAtivo: execDia }))));
        // plano 2000d · DU-068: esta semana × a anterior (só com a série completa do servidor)
        const tend = L.tendencia(porDiaServidor.serie);
        if (tend && tend.texto) painelExec.appendChild(h("p", { class: "sub au-ex-tendencia" }, ui.icone("info"), h("span", null, tend.texto)));
      } else if (arr.length) {
        const truncada = arr.length >= execLimite;
        const porDia = L.execucoesPorDia(arr, { dias: 14, recortar: truncada });
        painelExec.appendChild(h("div", { class: "cartao au-ex-graf" }, (grafico = P.graficoDias({ serie: porDia.serie, dias: porDia.dias, n: porDia.n,
          carregadas: porDia.recortado ? arr.length : null, aoEscolherDia: escolherDia, diaAtivo: execDia }))));
      }
      P.setas(filtro);
      painelExec.appendChild(filtro);
      painelExec.appendChild(chipDia);
      painelExec.appendChild(corpoLista);
      desenhar();
      if (arr.length >= execLimite && execLimite < 200) {
        const mais = h("button", { type: "button", class: "bt bt-sec bt-p au-mais" }, "Carregar mais");
        // plano 1000b · UB-036: «Carregar mais» é suave (sem esqueleto) e volta à mesma rolagem; o dia e o filtro escolhidos continuam
        mais.addEventListener("click", () => {
          execLimite = Math.min(200, execLimite + 50);
          const y = typeof scrollY === "number" ? scrollY : null;
          ui.carregando(mais, pintarExecucoes({ foco: "mais", suave: true }).then(() => { if (y != null && typeof scrollTo === "function") try { scrollTo({ top: y }); } catch { /* ok */ } })).catch(() => {});
        });
        painelExec.appendChild(mais);
      } else if (arr.length >= execLimite && execLimite >= 200) {
        // plano 1000 · AS-060: no teto o botão some — a frase diz que há mais antigas que não aparecem aqui
        painelExec.appendChild(h("p", { class: "sub au-ex-teto" }, ui.icone("info"),
          h("span", null, `Mostrando as ${execLimite} execuções mais recentes. As mais antigas não aparecem nesta lista.`)));
      }
      execCarregadas = true;
      if (refoco) {
        // plano 1500c · UCA-004/005: a busca e o interruptor continuam com o foco depois de recarregar
        const alvo = (refoco === "mais" && painelExec.querySelector(".au-mais")) || (refoco !== "atualizar" && refoco !== "mais" && painelExec.querySelector(`[data-acao="${refoco}"]`)) || btAtualizar;
        if (alvo) alvo.focus({ preventScroll: true });
        if (alvo && refoco === "busca") try { alvo.setSelectionRange(alvo.value.length, alvo.value.length); } catch { /* ok */ }
      }
    } catch (e) {
      if (eu !== execSeq) return;
      ui.limpar(painelExec);
      painelExec.appendChild(ui.erroCartao(e, () => pintarExecucoes()));
    }
  }

  /** plano 1500c · UCA-034: baixa as execuções carregadas em CSV («execucoes-<nome>-AAAA-MM-DD.csv»). */
  function baixarCsvExecucoes(lista) {
    const nome = String(auto.nome || "automacao").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40) || "automacao";
    const ok = P.baixarTexto(`execucoes-${nome}-${new Date().toISOString().slice(0, 10)}.csv`, L.execucoesParaCSV(lista, { vocab: vv }));
    ui.toast(ok ? `${lista.length} ${lista.length === 1 ? "execução baixada" : "execuções baixadas"} em CSV.` : "O navegador não deixou baixar o arquivo.", { tipo: ok ? "ok" : "erro" });
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
      // plano 1000b · UB-004: o próximo diálogo não repete o número velho
      item.em_espera = Math.max(0, (Number(item.em_espera) || 0) - n);
      ui.toast(n === 0 ? "Não havia espera para cancelar: ela pode ter acabado de rodar." : n === 1 ? "1 espera cancelada." : `${n} esperas canceladas.`, { tipo: n ? "ok" : "info" });
      pintarExecucoes({ foco: "atualizar" });
    } catch (e) { ui.toast(L.erroAutomacao(e, ctx.api.mensagemErro(e), base.usuarios), { tipo: "erro" }); }
  }

  function linhaExecucao(x) {
    const sit = L.situacaoExecucao(x);
    const detalhe = L.detalheLegivel(x.detalhe, c => ctx.api.mensagemErro({ codigo: c })) || (sit === "ok" ? "Feito." : sit === "espera" ? "Esperando para continuar." : sit === "pulado" ? "Pulada." : "Erro.");
    const passoTxt = L.passoDaExecucao(x);
    // plano 1500c · UCA-005: quem não passou nas condições tem ícone e rótulo próprios, e a frase das condições da automação
    const filtrada = String(x.estado || "") === "filtrada";
    const icone = filtrada ? "filtro" : sit === "ok" ? "check" : sit === "espera" ? "relogio" : sit === "pulado" ? "info" : "alerta";
    const rotuloSit = filtrada ? "Não passou nas condições: " : sit === "ok" ? "Deu certo: " : sit === "espera" ? "Em espera: " : sit === "pulado" ? "Pulada ou parada: " : "Erro: ";
    // plano 2000d · DU-104: com condicao_falhou do servidor, diz QUAL condição barrou (e o valor encontrado)
    const barrada = filtrada ? L.fraseBarrada(x, auto, base) : "";
    const fraseConds = barrada || (filtrada && auto.condicoes.length ? `Só roda se ${L.fraseCondicoes(auto.condicoes, base)}.` : "");
    const falhaEnvio = L.ehFalhaDeEnvio(x);   // plano 2000d · DU-066
    const estadoTxt = L.estadoExecucaoTexto(x);
    // plano 1500c · UCA-055: da execução com erro direto ao passo no editor
    const nPassoErro = Number(x.passo ?? x.acao_indice);
    const btCorrigir = podeEditar && sit === "erro" && Number.isInteger(nPassoErro) && nPassoErro >= 1 && nPassoErro <= auto.acoes.length
      ? h("button", { type: "button", class: "bt bt-fant bt-p au-ex-corrigir" }, ui.icone("editar"), `Corrigir o passo ${nPassoErro}`) : null;
    if (btCorrigir) btCorrigir.addEventListener("click", () => {
      const aba = raiz.querySelector(".au-abas [role=tab]"); if (aba) aba.click(); else mostrarAba("regra");
      focarNo({ onde: "entao", indice: nPassoErro - 1, tipo: "passo" });
    });
    const retoma = sit === "espera" && x.continua_em ? ` · continua ${ui.dataHoraBR(x.continua_em)}` : "";
    const abrir = x.link && /^#\//.test(String(x.link)) ? h("a", { class: "bt bt-fant bt-p au-ex-abrir", href: x.link }, L.rotuloLinkExecucao(x.link, vv), ui.icone("seta-dir")) : null;
    // o que a IA decidiu (etapa, nota, resumo, ou por que não rodou), em destaque e com o motivo dela — antes ficava só no detalhe em texto
    const ia = L.decisaoIA(x.detalhe);
    const blocoIA = ia ? h("div", { class: ["au-ex-ia", `au-ex-ia-${ia.tipo}`], dataset: { tipo: ia.tipo } },
      ui.pilula("IA", ia.tipo === "erro" ? "ruim" : ia.tipo === "pulado" ? "aten" : ia.tipo === "pedida" ? "info" : "prim", { icone: "ia" }),
      h("div", { class: "au-ex-ia-txt" },
        h("p", { class: "au-ex-ia-frase" }, ia.tipo === "nota" ? h("span", { class: "au-ex-ia-nota mono" }, String(ia.score)) : null, ia.frase),
        ia.motivo && ia.tipo !== "pulado" && ia.tipo !== "erro" && ia.tipo !== "pedida" ? h("p", { class: "au-ex-ia-motivo" }, h("span", { class: "sr-only" }, "Motivo da IA: "), `«${ia.motivo}»`) : null)) : null;
    // plano 1000b · UB-018: «Cancelar a espera de Maria (continua 15/10 10:00)» — duas esperas na lista não têm o mesmo nome
    const nomeEspera = String(x.contato_nome || x.negocio_titulo || "").trim().slice(0, 60);
    const quemEspera = nomeEspera || (L.passoDaExecucao(x) ? `«${L.passoDaExecucao(x)}»` : "");
    const btParar = podeEditar && sit === "espera" && x.chave ? h("button", { type: "button", class: "bt bt-sec bt-p",
      "aria-label": `Cancelar a espera${quemEspera ? ` de ${quemEspera}` : ""}${x.continua_em ? ` (continua ${ui.dataHoraBR(x.continua_em)})` : ` (de ${ui.horaBR(x.criado_em)})`}` }, "Cancelar") : null;
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
    // plano 1000b · UB-017: «Detalhes da execução de 14:32 (com erro)» — cada botão com o seu contexto
    const rotSitCurta = { ok: "deu certo", espera: "em espera", pulado: "pulada ou parada", erro: "com erro" }[sit] || "";
    const btDet = h("button", { type: "button", class: "bt bt-fant bt-p au-ex-det-bt", "aria-expanded": "false", "aria-controls": idDet,
      "aria-label": `Detalhes da execução de ${ui.horaBR(x.criado_em)}${rotSitCurta ? ` (${rotSitCurta})` : ""}` }, "Detalhes", ui.icone("seta-baixo"));
    btDet.addEventListener("click", () => { const abre = det.hidden; det.hidden = !abre; btDet.setAttribute("aria-expanded", String(abre)); });
    return h("li", { class: ["au-ex", sit === "erro" && "au-ex-erro", sit === "pulado" && "au-ex-pulado", sit === "espera" && "au-ex-espera", filtrada && "au-ex-filtrada"] },
      h("span", { class: "au-ex-ic", "aria-hidden": "true" }, ui.icone(icone)),
      h("div", { class: "au-ex-txt" },
        passoTxt ? h("p", { class: "au-ex-passo mono" }, passoTxt) : null,
        estadoTxt ? h("p", { class: "au-ex-estado" }, `${estadoTxt}${retoma}`) : null,
        h("p", { class: "au-ex-det" }, h("span", { class: "sr-only" }, rotuloSit), detalhe),
        fraseConds ? h("p", { class: "sub au-ex-conds" }, fraseConds) : null,
        falhaEnvio ? h("p", { class: "au-dica-erro sub au-ex-envio" }, ui.icone("whatsapp"), h("span", null, L.DICA_FALHA_ENVIO)) : sit === "erro" ? dicaErro(`${detalhe} ${x.detalhe || ""}`) : null,
        blocoIA,
        h("p", { class: "au-ex-quando mono", title: ui.dataHoraBR(x.criado_em) }, `${ui.horaBR(x.criado_em)} · ${ui.relativo(x.criado_em)}`),
        det),
      h("div", { class: "au-ex-acoes" }, btParar, btCorrigir, abrir, btDet));
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
  let cancelarCmdSalvar = null;
  /** plano 1000b · UB-006: o comando «Salvar/Criar» da paleta acompanha o estado (re-registrado depois do 1º «Salvar e continuar»). */
  function registrarCmdSalvar() {
    if (!btSalvar || !ctx.comandos || typeof ctx.comandos.registrar !== "function" || !amb.aoSair) return;
    if (cancelarCmdSalvar) { try { cancelarCmdSalvar(); } catch { /* ok */ } cancelarCmdSalvar = null; }
    try {
      const c = ctx.comandos.registrar({ id: "automacoes.salvar", rotulo: item ? "Salvar automação" : "Criar automação", palavras: "salvar gravar criar", icone: "check", fazer: () => salvar(btSalvar) });
      if (typeof c === "function") { cancelarCmdSalvar = c; amb.aoSair(() => { if (cancelarCmdSalvar === c) { cancelarCmdSalvar = null; c(); } }); }
    } catch { /* a paleta é um extra */ }
  }
  /**
   * plano 1000b · UB-006: a nova salva com «Salvar e continuar» passa a ser uma automação salva — os dois botões dizem «Salvar»,
   * o título da página (leitor de tela) diz «Automação: <nome>» e o comando da paleta deixa de ser «Criar automação».
   */
  function pintarRotulosSalvar(nome) {
    for (const b of [btSalvar, raiz.querySelector(".au-rodape-movel .bt-prim")]) if (b && b.lastChild && b.lastChild.nodeType === 3) b.lastChild.textContent = "Salvar";
    h1Pag.textContent = `Automação: ${String(nome || "").trim() || "sem nome"}`;
    registrarCmdSalvar();
  }
  if (ctx.comandos && typeof ctx.comandos.registrar === "function" && amb.aoSair) {
    const reg = c => { try { const cancelar = ctx.comandos.registrar(c); if (typeof cancelar === "function") amb.aoSair(cancelar); } catch { /* a paleta é um extra */ } };
    registrarCmdSalvar();
    if (btTestar) reg({ id: "automacoes.testar", rotulo: "Testar automação (sem enviar nada)", palavras: "testar simular conferir", icone: "olho", fazer: () => testar(btTestarLado) });
    if (item) reg({ id: "automacoes.execucoes", rotulo: "Ver execuções desta automação", palavras: "execucoes historico rodou", icone: "relogio",
      fazer: () => { const aba = raiz.querySelectorAll(".au-abas [role=tab]")[1]; if (aba) aba.click(); else mostrarAba("execucoes"); } });
  }

  // ------------------------------------------------ plano 1000 · AS-056: execuções se atualizam sozinhas enquanto a aba está à vista
  // (no máx. 1 recarga suave a cada 20 s, pelo pulso do app; sem esqueleto e sem tirar o filtro escolhido)
  // plano 1500c · UCA-029: assinado sempre — a nova salva com «Salvar e continuar» ganha a aba sem recarregar e o pulso já está lá
  if (ctx.pulso && typeof ctx.pulso.assinar === "function" && amb.aoSair) {
    let ultimoExec = Date.now();
    try {
      amb.aoSair(ctx.pulso.assinar(() => {
        if (!item || painelExec.hidden || !execCarregadas || !raiz.isConnected || Date.now() - ultimoExec < 20000) return;
        ultimoExec = Date.now();
        // quem está lendo um «Detalhes» aberto ou com o foco dentro da lista não tem a lista trocada embaixo
        if ([...painelExec.querySelectorAll(".au-ex-mais")].some(d => !d.hidden) || painelExec.contains(document.activeElement)) {
          // plano 1000b · UB-076: mas confere em silêncio — se chegou execução nova, a faixa «Há execuções novas · Atualizar» avisa
          if (painelExec.querySelector(".au-ex-novas") || conferindoNovas) return;
          conferindoNovas = true;
          lerExecucoes().then(l => {
            if (!raiz.isConnected || painelExec.querySelector(".au-ex-novas") || !serieGuardada || assinaturaExec(l) === serieGuardada.assinatura) return;
            const bt = h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { acao: "atualizar" } }, ui.icone("reabrir"), "Atualizar");
            bt.addEventListener("click", () => { ui.carregando(bt, pintarExecucoes({ foco: "atualizar", suave: true })).catch(() => {}); });
            const faixa = h("div", { class: "aviso au-ex-novas" }, ui.icone("info"), h("span", { role: "status" }, "Há execuções novas."), bt);
            const cab = painelExec.querySelector(".au-ex-cab");
            painelExec.insertBefore(faixa, cab ? cab.nextSibling : painelExec.firstChild);
          }, () => {}).finally(() => { conferindoNovas = false; });
          return;
        }
        pintarExecucoes({ suave: true, automatica: true });
      }) || (() => {}));
    } catch { /* sem pulso, o «Atualizar» continua */ }
  }

  // ------------------------------------------------ primeira pintura
  pintarQuando(); pintarSe(); pintarEntao(); atualizarPrevia(true); pintarNome(); pintarTesteCom();
  if (podeEditar) hist.empilhar(copia(auto));      // plano 1500c · UCA-092: o ponto de partida do Desfazer
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
