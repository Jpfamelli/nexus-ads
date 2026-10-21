/* ============================================================
   ÓRBITA — cv-chat.js · frente F5 · ESPEC §7.7 T4 (coluna do chat)
   Cabeçalho (contato, número, protocolo, janela de 24 h, dono e
   ações: assumir, transferir, resolver/reabrir, pendente, ⋮),
   mensagens agrupadas por dia com separador de atendimento, bolhas
   in/out, nota interna amarela, sistema em Plex, mídia (miniatura,
   player, documento; "baixando" = esqueleto; indisponível = aviso),
   citação, reação, status honesto (◷ ✓ ✓✓ "lida" !) — nunca azul.
   Rolagem infinita para cima e pílula "Novas mensagens ↓".
   ============================================================ */

export function criarChat(A) {
  const { ui, L } = A;
  const h = ui.h;

  const cab = h("header", { class: "cvc-cab" });
  const faixa = h("div", { class: "cvc-selos", "aria-label": "Situação do atendimento" });
  const topoHist = h("div", { class: "cvc-topo-hist" });
  const trilho = h("div", { class: "cvc-trilho" });
  const msgs = h("div", { class: "cvc-msgs", role: "log", "aria-live": "polite", "aria-relevant": "additions", "aria-label": "Mensagens", tabindex: "-1" }, topoHist, trilho);
  const novasTxt = h("span", null, "Novas mensagens");
  const novas = h("button", { type: "button", class: "bt bt-prim bt-p cvc-novas", hidden: true }, novasTxt, ui.icone("seta-baixo"));
  const semCssEscape = s => String(s).replace(/["\\]/g, "");
  const escaparSel = s => (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function" ? CSS.escape(String(s)) : semCssEscape(s));
  const arrastar = h("div", { class: "cvc-arrastar", hidden: true }, "Solte para anexar");
  // plano 1000 · CA-025: a atualização da conversa falhou várias vezes seguidas — «Sem atualizar desde 14:02 · Tentar agora»
  const atrasoTxt = h("span", null, "");
  const btAtraso = h("button", { type: "button", class: "bt bt-fant bt-p cvc-atraso-bt" }, "Tentar agora");
  const atraso = h("div", { class: "cvc-atraso", role: "status", hidden: true }, ui.icone("alerta"), atrasoTxt, btAtraso);
  let tentarAtraso = null;
  btAtraso.addEventListener("click", () => { if (typeof tentarAtraso === "function") tentarAtraso(); });
  // plano 1000b · CB-073: um aviso só (fora do log) quando muitas mídias carregam ao mesmo tempo — as bolhas não têm mais role=status
  const avisoMidias = h("span", { class: "sr-only cvc-aviso-midias", role: "status" }, "");
  const esqueletos = new Set();
  const esqueleto = el => { esqueletos.add(el); return el; };
  const corpo = h("div", { class: "cvc-corpo" }, msgs, novas, arrastar, avisoMidias);
  const vazio = h("div", { class: "cvc-vazio" });
  const el = h("div", { class: "cvc" }, vazio, cab, faixa, atraso, corpo);

  novas.addEventListener("click", () => {
    rolarFim(true); novas.hidden = true; pararDeVigiar();
    // plano 1000b · CB-127: a pílula focada some — o foco vai para a região das mensagens (não cai no body)
    try { msgs.focus({ preventScroll: true }); } catch { /* ok */ }
  });

  /* ---------------- rolagem */
  let grudarFimAte = 0;      // até quando uma mídia que termina de carregar deve manter a conversa no fim (a imagem só ganha altura ao carregar)
  const aposMidiaCarregar = () => { if (Date.now() < grudarFimAte) msgs.scrollTop = msgs.scrollHeight; };
  function noFim() { return msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80; }
  function rolarFim(suave) {
    if (suave && !matchMedia("(prefers-reduced-motion: reduce)").matches) msgs.scrollTo({ top: msgs.scrollHeight, behavior: "smooth" });
    else msgs.scrollTop = msgs.scrollHeight;
  }
  // CA-137: a página anterior só é pedida quando a PESSOA rola para cima (o topo baixo de uma conversa curta, ou o ajuste da rolagem
  // depois de carregar, não dispara outra página) e no mínimo 150 ms depois da última carga
  let topoAnterior = 0, ultimaCargaEm = 0;
  msgs.addEventListener("scroll", () => {
    const subindo = msgs.scrollTop < topoAnterior;
    topoAnterior = msgs.scrollTop;
    if (subindo && msgs.scrollTop < 140 && A.temMaisAntes && !A.carregandoAntes && Date.now() - ultimaCargaEm >= 150) {
      ultimaCargaEm = Date.now();
      A.acoes.carregarAntes();
    }
    // (revisão 13/10: a bolha vigiada pode ter sido recriada — mídia «buscando» → «ok» — e o observador ficaria olhando um nó fora da
    // página; no fim da rolagem com o nó perdido, a pílula sai do mesmo jeito)
    if (noFim() && (!vigiando || !(vigiado && vigiado.isConnected))) { if (vigiando) pararDeVigiar(); novas.hidden = true; }
  }, { passive: true });
  /* plano 1000 · CA-138: a pílula «Novas mensagens» só some quando a última mensagem nova ENTRA na tela (IntersectionObserver) — chegar
     perto do fim (80 px) já não a fecha sem a pessoa ter visto as novas. Sem o observador, vale a regra antiga do fim da rolagem. */
  let obsNovas = null, vigiando = false, vigiado = null;
  function vigiarUltima() {
    if (typeof IntersectionObserver !== "function") return;
    try {
      if (!obsNovas) obsNovas = new IntersectionObserver(ents => {
        if (!ents.some(e => e.isIntersecting)) return;
        novas.hidden = true; novasDesde = null; vigiando = false; obsNovas.disconnect();
      }, { root: msgs, threshold: 0.5 });
      obsNovas.disconnect();
      const ult = trilho.lastElementChild;
      if (ult) { obsNovas.observe(ult); vigiando = true; vigiado = ult; }
    } catch { vigiando = false; }
  }
  function pararDeVigiar() { vigiando = false; if (obsNovas) try { obsNovas.disconnect(); } catch { /* ok */ } }

  /* ---------------- arrastar arquivo para o chat */
  let contaDrag = 0;
  const temArquivo = ev => ev.dataTransfer && [...(ev.dataTransfer.types || [])].includes("Files");
  /* plano 1000b · CB-006: arrasto com arquivo SEMPRE tem preventDefault (senão o navegador abre o PDF na aba e a central some); quando o
     anexo não vale (resolvida, janela, nota, leitura…) a faixa diz «Não dá para anexar aqui: motivo» e o soltar é ignorado */
  const motivoSemAnexo = () => (A.composer.aceitaAnexo() ? ""
    : (typeof A.composer.motivoSemAnexo === "function" && A.composer.motivoSemAnexo()) || "o atendimento não aceita arquivo agora.");
  const pintarArrastar = motivo => {
    const t = motivo ? `Não dá para anexar aqui: ${motivo.charAt(0).toLocaleLowerCase("pt-BR")}${motivo.slice(1)}` : "Solte para anexar";
    if (arrastar.textContent !== t) arrastar.textContent = t;
    arrastar.dataset.recusa = motivo ? "1" : "0";
  };
  corpo.addEventListener("dragenter", ev => { if (!temArquivo(ev)) return; ev.preventDefault(); contaDrag++; pintarArrastar(motivoSemAnexo()); arrastar.hidden = false; });
  corpo.addEventListener("dragover", ev => {
    if (!temArquivo(ev)) return;
    ev.preventDefault();
    try { ev.dataTransfer.dropEffect = A.composer.aceitaAnexo() ? "copy" : "none"; } catch { /* ok */ }
  });
  corpo.addEventListener("dragleave", () => { contaDrag = Math.max(0, contaDrag - 1); if (!contaDrag) arrastar.hidden = true; });
  corpo.addEventListener("drop", ev => {
    if (!temArquivo(ev)) return;
    ev.preventDefault(); contaDrag = 0; arrastar.hidden = true;
    const recusa = motivoSemAnexo();
    if (recusa) { ui.toast(recusa, { tipo: "info" }); return; }
    const arquivos = ev.dataTransfer.files ? [...ev.dataTransfer.files] : [];
    const f = arquivos[0];
    // CA-012: vários arquivos soltos de uma vez — um envio por vez (cada um com a sua prévia); a pessoa sabe que os outros ficaram
    if (arquivos.length > 1) ui.toast(`${arquivos.length} arquivos soltos: enviando o primeiro (${f.name}). Solte os outros depois, um por vez.`, { tipo: "info", ms: 8000 });
    if (f) A.composer.anexar(f);
  });

  /* ---------------- estados */
  function modo(m) {
    vazio.hidden = m !== "vazio";
    cab.hidden = m === "vazio";
    faixa.hidden = m !== "conversa";
    corpo.hidden = m === "vazio";
    if (m !== "conversa") atraso.hidden = true;
    if (A.composer && A.composer.el) A.composer.el.hidden = m !== "conversa";
  }

  function orbita() {
    const s = h("svg", { class: "orbita", viewBox: "0 0 120 120", "aria-hidden": "true", focusable: "false" },
      h("circle", { cx: "60", cy: "60", r: "52", fill: "none", style: { stroke: "var(--c-borda-2)" }, "stroke-width": "1", "stroke-dasharray": "2 6" }),
      h("circle", { cx: "60", cy: "60", r: "34", fill: "none", style: { stroke: "var(--c-borda-2)" }, "stroke-width": "1" }),
      h("circle", { cx: "60", cy: "60", r: "15", style: { fill: "var(--c-prim)" } }),
      h("circle", { cx: "97", cy: "34", r: "6", style: { fill: "var(--c-sec)" } }),
      h("circle", { cx: "27", cy: "77", r: "4", style: { fill: "var(--c-texto-3)" } }),
      h("path", { d: "M52 55h16M52 62h10", fill: "none", style: { stroke: "var(--c-prim-txt)" }, "stroke-width": "3", "stroke-linecap": "round" }));
    return s;
  }

  function mostrarVazio() {
    ui.limpar(vazio);
    const c = A.contagens || {};
    const ag = Number(c.aguardando) || 0;
    const semCanal = A.base && !(A.base.canais || []).length;
    // plano 1000b · CB-136: «Tudo em dia» só com as contagens lidas (e sem a lista em erro) — antes disso, um título neutro
    const lidas = !!Object.keys(c).length && !A.erroLista;
    const tit = semCanal
      ? h("h2", null, "Conecte o ", h("em", null, "WhatsApp"), " da empresa.")
      : ag ? h("h2", null, h("em", null, String(ag)), ag === 1 ? " cliente espera resposta." : " clientes esperam resposta.")
        : !lidas ? h("h2", null, "Escolha uma ", h("em", null, "conversa"), ".")
        : h("h2", null, "Tudo ", h("em", null, "em dia"), ".");
    const txt = semCanal
      ? (A.acoes.pode("admin") ? "As conversas chegam aqui assim que um número estiver conectado." : "Peça ao administrador para conectar o WhatsApp.")
      : "Escolha uma conversa à esquerda ou comece uma nova.";
    const num = (id, rot, v, alerta) => h("button", { type: "button", class: "cvc-num", dataset: { alerta: alerta ? "1" : "0" },
      on: { click: () => A.acoes.mudarLista({ aba: id, busca: "" }) } }, h("b", null, String(v ?? 0)), h("span", null, rot));
    // M35: quem tem fila ganha o botão que abre e assume a que espera há mais tempo (também por Alt+Shift+P)
    const atender = !semCanal && A.podeEscrever && ag > 0
      ? h("button", { type: "button", class: "bt bt-prim cvc-atender", title: "Abre e assume a conversa que espera resposta há mais tempo (Alt+Shift+P)",
        on: { click: ev => A.acoes.atenderProximo(ev.currentTarget) } }, ui.icone("seta-dir"), "Atender o próximo")
      : null;
    vazio.appendChild(h("div", { class: "cvc-vazio-in" }, orbita(), tit, h("p", null, txt), atender,
      semCanal ? (A.acoes.pode("admin") ? h("a", { class: "bt bt-prim", href: "#/config/numeros" }, "Conectar número") : null)
        : h("div", { class: "cvc-numeros" },
          num("aguardando", "Aguardando", c.aguardando, ag > 0),
          num("sem_dono", "Sem dono", c.sem_dono, false),
          A.podeEscrever ? num("minhas", "Minhas", c.minhas, false) : null),
      !semCanal && A.podeEscrever ? h("button", { type: "button", class: "bt bt-sec", on: { click: () => A.acoes.novaConversa() } }, ui.icone("mais"), "Nova conversa") : null));
    modo("vazio");
  }

  function mostrarCarregando() {
    ui.limpar(cab);
    cab.appendChild(h("div", { class: "esqueleto cvc-cab-sk", "aria-busy": "true" },
      h("div", { class: "sk-item" }, h("span", { class: "sk sk-av" }), h("div", { class: "sk-txt" }, h("span", { class: "sk sk-l1" }), h("span", { class: "sk sk-l2" })))));
    ui.limpar(trilho);
    ui.limpar(topoHist);
    // CA-006: enquanto a conversa abre, o registro de mensagens não fala (senão o leitor de tela lê o histórico inteiro a cada troca)
    msgs.setAttribute("aria-busy", "true");
    // plano 1000 · CA-139: o esqueleto tem a forma de uma conversa (bolhas alternadas), não de lista com avatar
    trilho.appendChild(h("div", { class: "cvc-sk-bolhas", "aria-hidden": "true" },
      ["in", "out", "in", "out"].map((d, i) => h("span", { class: "sk cvc-sk-bolha", dataset: { dir: d, i: String(i) } }))));
    cache.clear();
    players.clear();                    // D9: os áudios da conversa anterior não ficam presos na memória
    sigCab = null;
    esconderAtraso();
    modo("carregando");
  }

  /** plano 1000 · CA-105: a conversa demora a abrir (rede lenta) — o esqueleto ganha «A conexão está lenta… ainda tentando» + «Tentar de novo». */
  function mostrarLento(tentar) {
    if (trilho.querySelector(".cvc-lento")) return;
    trilho.appendChild(h("div", { class: "cvc-lento", role: "status" }, ui.icone("relogio"), h("span", null, "A conexão está lenta… ainda tentando."),
      h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { if (typeof tentar === "function") tentar(); } } }, "Tentar de novo")));
  }

  /** CA-025: faixa «Sem atualizar desde 14:02 · Tentar agora» (desde = quando deu certo pela última vez); null esconde. */
  function mostrarAtraso(desde, tentar) {
    tentarAtraso = tentar || null;
    atrasoTxt.textContent = `Sem atualizar ${L.desdeTexto(desde || Date.now())}. Confira a internet.`;
    atraso.hidden = false;
  }
  function esconderAtraso() { atraso.hidden = true; tentarAtraso = null; }

  function mostrarErro(e, tentar) {
    ui.limpar(vazio);
    // plano 1000b · CB-091: conversa fora do alcance (link antigo, transferida para outro departamento) não é «erro» com «Tentar de novo»
    if (e && e.codigo === "conversa_nao_encontrada") {
      vazio.appendChild(h("div", { class: "cvc-vazio-in cvc-fora" }, ui.vazio({ titulo: "Esta conversa não está mais com você.", texto: "Ela foi transferida para outra pessoa ou departamento, ou foi removida.", icone: "chat", tema: "conversas" }),
        h("button", { type: "button", class: "bt bt-sec cvc-fora-voltar", on: { click: () => A.acoes.voltar() } }, "Voltar à lista")));
      modo("vazio");
      return;
    }
    vazio.appendChild(h("div", { class: "cvc-vazio-in" }, ui.erroCartao(e, tentar),
      matchMedia("(max-width: 760px)").matches ? h("button", { type: "button", class: "bt bt-sec", on: { click: () => A.acoes.voltar() } }, "Voltar à lista") : null));
    modo("vazio");
  }

  /* ---------------- cabeçalho
     Plano 100 · D4: o pulso chama isto a cada mudança na empresa; só redesenha quando o que ele mostra muda (assinatura), e quem
     estava num botão do cabeçalho (Tab, leitor de tela) volta para o botão da MESMA ação (data-acao). */
  let sigCab = null, acertarCab = null;
  const naZonaCab = n => !!n && (cab.contains(n) || faixa.contains(n));
  function renderCabecalho() {
    if (!A.ver || !A.ver.conversa) return;
    const conv = A.ver.conversa, ct = A.ver.contato || conv.contato || {};
    const nome = A.acoes.nomeContato(ct);
    const eu = A.eu && A.eu.id;
    const jan = L.janela(conv);
    const provedorCanal = (conv.canal && conv.canal.provedor) || ((A.base && A.base.canais) || []).find(k => k.id === conv.canal_id)?.provedor || "meta";
    const codeWords = provedorCanal === "codewords";
    const ia = codeWords ? A.iaEstado : null;
    const flash = Date.now() < iaFlashAte;
    const caido = typeof A.acoes.canalCaido === "function" ? A.acoes.canalCaido(conv.canal_id) : null;
    const s = JSON.stringify([conv.id, conv.status, conv.atribuida_a, conv.atribuida && conv.atribuida.nome, conv.atribuida_nome, conv.departamento && conv.departamento.nome,
      conv.oculta, conv.protocolo, conv.canal && conv.canal.nome, conv.canal_id, ((A.base && A.base.canais) || []).find(k => k.id === conv.canal_id)?.nome, provedorCanal, jan.texto, jan.nivel, L.janelaCurta(jan), Math.round(L.fracaoJanela(jan) * 1000), jan.ate,
      ct.id, nome, ct.telefone, ct.optin_marketing, ia && [ia.disponivel, ia.ia_ligada, ia.pausada, ia.pausada_ate, ia.so_manual, ia.pausada_por, ia.pausada_por_nome, ia.respondendo, ia.erro],
      flash, A.podeEscrever, eu, A.raiz && A.raiz.dataset.lateral, caido && [caido.nome, caido.desde], (() => { try { return matchMedia("(max-width: 760px)").matches; } catch { return false; } })(),
      conv.ultima_entrada_em ? 1 : 0]);
    const ativo = typeof document !== "undefined" ? document.activeElement : null;
    if (s === sigCab && cab.firstChild) {
      // nada mudou: o cabeçalho e o foco ficam; sem ninguém na barra, o ponto de Tab volta ao 1º botão visível (o CSS pode ter escondido botões)
      if (acertarCab && !naZonaCab(ativo)) acertarCab(true);
      return;
    }
    const comFoco = naZonaCab(ativo) && ativo.closest ? ativo.closest("[data-acao]") : null;
    const focoAcao = comFoco ? comFoco.dataset.acao : null;
    sigCab = s;
    ui.limpar(cab);
    const voltar = h("button", { type: "button", class: "bt-icone cvc-voltar", "aria-label": "Voltar à lista", dataset: { acao: "voltar" }, on: { click: () => A.acoes.voltar() } }, ui.icone("seta-esq"));
    // plano 1000b · CB-075: o ver veio sem o objeto do canal, mas a base conhece o canal_id — «via Recepção», não «número removido»
    const canalBase = !conv.canal && conv.canal_id ? ((A.base && A.base.canais) || []).find(k => k.id === conv.canal_id) : null;
    const canal = conv.canal ? `via ${conv.canal.nome}` : canalBase && canalBase.nome ? `via ${canalBase.nome}` : "número removido";
    // CA-239: contato removido (sem id) — a ficha não abre uma gaveta de erro: o botão fica desligado e diz por quê
    const semFicha = !ct.id;
    // CA-015: com a coluna estreita o protocolo some do cabeçalho (está na lateral e no atalho «Protocolo»); o title tem a linha inteira
    const subTitulo = [ct.telefone ? ui.telBR(ct.telefone) : null, canal, conv.protocolo ? `protocolo ${conv.protocolo}` : null].filter(Boolean).join(" · ");
    // plano 1000 · CA-112: no celular, tocar no nome abre a gaveta de Detalhes (com «Abrir ficha» lá dentro) — antes ia para outra tela
    const celular = (() => { try { return matchMedia("(max-width: 760px)").matches; } catch { return false; } })();
    const pelaGaveta = celular && A.raiz && A.raiz.dataset.lateral === "gaveta";
    const quem = h("button", { type: "button", class: "cvc-quem", title: pelaGaveta ? `Detalhes do contato · ${subTitulo}` : semFicha ? "Contato removido: não há ficha para abrir" : `Abrir a ficha · ${subTitulo}`,
      disabled: semFicha && !pelaGaveta, "aria-disabled": semFicha && !pelaGaveta ? "true" : null, dataset: { acao: "quem" }, "aria-haspopup": pelaGaveta ? "dialog" : null,
      on: { click: () => { if (pelaGaveta) A.acoes.abrirDetalhes(); else if (!semFicha) A.ctx.abrirContato(ct.id, { aoMudar: () => A.acoes.recarregarVer() }); } } },
      ui.avatar(nome, ct.id),
      h("span", { class: "cvc-quem-txt" },
        h("span", { class: "cvc-nome" }, nome),
        // plano 1000b · CB-012: separador só ENTRE itens — sem telefone não começa com «·», sem protocolo não termina com «·»
        // (sem telefone, o «·» do protocolo some junto com o «via» quando a coluna estreita esconde o canal)
        h("span", { class: "cvc-sub" },
          ct.telefone ? h("span", null, ui.telBR(ct.telefone)) : null,
          ct.telefone ? h("i", { class: "cvc-via-sep" }, "·") : null, h("span", { class: "cvc-via" }, canal),
          conv.protocolo ? h("i", { class: ct.telefone ? "cvc-proto-sep" : "cvc-proto-sep cvc-via-sep" }, "·") : null,
          conv.protocolo ? h("span", { class: "mono" }, conv.protocolo) : null)));

    // faixa de situação: UMA pílula com dono + departamento; janela e IA ao lado; avisos só quando existem
    ui.limpar(faixa);
    const dono =conv.atribuida ? `Com ${conv.atribuida.nome}` : conv.atribuida_nome ? `Com ${conv.atribuida_nome}` : "Sem dono";
    const semDono = dono === "Sem dono";
    faixa.appendChild(ui.pilula(conv.departamento ? `${dono} · ${conv.departamento.nome}` : dono, semDono && conv.status !== "resolvida" ? "aten" : "neutra",
      { icone: "usuario", class: "cv-pil-status", title: conv.departamento ? `${dono} · departamento ${conv.departamento.nome}` : dono }));
    // o aparelho do CodeWords não tem janela de 24 h: nada de «Janela aberta/fechada» nesse canal
    if (conv.status !== "resolvida" && L.canalTemJanela(provedorCanal)) {
      const pj = ui.pilula("", jan.nivel === "aberta" ? "ok" : jan.nivel === "acabando" ? "aten" : "ruim",
        // plano 1000 · CA-089: fechada, o title explica sem jargão (a pílula continua curta)
        { icone: "relogio", class: "cv-janela", title: !jan.aberta ? (conv.ultima_entrada_em ? L.JANELA_FECHADA_LONGO : L.JANELA_NUNCA_LONGO)
          : jan.ate ? `${jan.texto}. Até ${ui.dataHoraBR(jan.ate)}` : "O cliente ainda não mandou mensagem neste número" });
      pj.append(h("span", { class: "so-largo-txt" }, jan.texto), h("span", { class: "so-curto-txt" }, L.janelaCurta(jan)));
      // plano 50: barrinha com o que resta das 24 h (a cor acompanha a pílula)
      pj.appendChild(h("i", { class: "cv-janela-barra", "aria-hidden": "true", style: { "--pct": String(Math.round(L.fracaoJanela(jan) * 1000) / 1000) } }));
      faixa.appendChild(pj);
    } else if (conv.status === "resolvida") faixa.appendChild(ui.pilula("Resolvida", "neutra", { icone: "check", class: "cv-pil-resolvida" }));
    if (conv.status === "pendente") faixa.appendChild(ui.pilula("Pendente", "aten"));
    if (conv.oculta) faixa.appendChild(ui.pilula("Oculta · contato bloqueado", "ruim", { icone: "alerta" }));
    if (ct.optin_marketing === false) faixa.appendChild(ui.pilula("Não quer marketing", "aten", { title: "Pediu para não receber mensagens de marketing" }));
    // D18: o número desta conversa caiu — nada chega nem sai por ele até reconectar
    if (caido) faixa.appendChild(ui.pilula("Número desconectado", "ruim", { icone: "alerta", class: "cv-pil-caido",
      title: `${caido.nome || "O número"} está desconectado${caido.desde ? ` desde ${ui.dataHoraBR(caido.desde)}` : ""}: as mensagens não chegam nem saem até reconectar.` }));
    if (codeWords) {
      let rotuloIA = "Verificando IA…", curtoIA = "", corIA = "neutra", dicaIA = "";
      if (ia && !ia.ia_ligada) {
        rotuloIA = "IA desligada no canal"; corIA = "neutra";
      } else if (ia?.disponivel === false) {
        rotuloIA = "IA indisponível"; corIA = "aten"; dicaIA = ia.erro || "Confira a configuração do canal CodeWords.";
      } else if (ia) {
        if (ia.pausada) {
          const autor = ia.pausada_por === "celular" ? "mensagem pelo celular" : `${ia.pausada_por_nome || "você"} assumiu`;
          // plano 1000b · CB-076: o formatador de hora do módulo (L.horaMsg, fuso de SP) — nada de Intl.DateTimeFormat novo a cada desenho
          // plano 1000b · CB-013: com o dia quando não é hoje («até amanhã 08:00», «até sex. 08:00») — L.ateTexto, mesmo formatador de SP
          const hora = !ia.so_manual && ia.pausada_ate ? L.ateTexto(ia.pausada_ate) : "";
          // plano 1000b · CB-014: sem hora (pausada_ate ausente ou inválido) não diz «até em breve»: «IA pausada (volta sozinha)»
          rotuloIA = ia.so_manual ? `IA pausada — retorno manual` : hora ? `IA pausada até ${hora} — ${autor}` : `IA pausada (volta sozinha) — ${autor}`;
          curtoIA = ia.so_manual ? "IA pausada" : hora ? `IA pausada até ${hora}` : "IA pausada (volta sozinha)";
          corIA = "aten";
        } else { rotuloIA = "IA atendendo"; corIA = "ok"; dicaIA = ia.respondendo ? "O CodeWords está respondendo a esta conversa." : "O agente do CodeWords pode responder automaticamente."; }
      }
      // plano 50 · 37: com a IA viva e permissão para escrever, a pílula vira o interruptor «pausar / retomar» em um toque
      const iaViva = !!(ia && ia.disponivel !== false && ia.ia_ligada);
      const alternavel = iaViva && A.podeEscrever && conv.status !== "resolvida";
      const pia = alternavel
        ? h("button", { type: "button", class: ["pilula", `pilula-${corIA}`, "cv-pil-ia", "cv-pil-ia-bt"], "aria-pressed": String(!ia.pausada), dataset: { acao: "ia" },
          title: `${[rotuloIA, dicaIA].filter(Boolean).join(". ")}. Toque para ${ia.pausada ? "retomar a IA" : "pausar a IA e assumir"}`,
          "aria-label": `${rotuloIA}. ${ia.pausada ? "Retomar a IA" : "Pausar a IA e assumir"}` }, ui.icone("ia"))
        : ui.pilula("", corIA, { icone: "ia", title: [rotuloIA, dicaIA].filter(Boolean).join(". "), class: "cv-pil-ia" });
      if (iaViva && !ia.pausada && ia.respondendo) pia.appendChild(h("i", { class: "cv-ia-ponto", "aria-hidden": "true" }));   // «respondendo agora»: ponto que pulsa
      pia.append(h("span", { class: "so-largo-txt" }, rotuloIA), h("span", { class: "so-curto-txt" }, curtoIA || rotuloIA));
      if (alternavel) {
        pia.appendChild(h("span", { class: "cv-pil-ia-acao", "aria-hidden": "true" }, ia.pausada ? "retomar" : "pausar"));
        pia.addEventListener("click", () => {
          iaFlashAte = Date.now() + 1400;          // confirmação visual: a pílula nova «pisca» verde/âmbar por 1,4 s
          if (ia.pausada) A.acoes.devolverIA(pia); else A.acoes.assumirIA(pia);
        });
        if (flash) pia.classList.add("cv-pil-ia-feito");
      }
      faixa.appendChild(pia);
    }

    // ações: no máximo UM primário por estado (ver L.estadoCabecalho)
    const pode = A.podeEscrever;
    const minha = !!(conv.atribuida_a && conv.atribuida_a === eu);
    const est = L.estadoCabecalho({ conv, eu, pode, codeWords, ia });
    // plano 50 · 38: barra de ferramentas de verdade (setas andam entre os botões) com o atalho de cada ação visível no hover
    const acoes = h("div", { class: "cvc-acoes", role: "toolbar", "aria-label": "Ações do atendimento" });
    // o botão entra na barra ANTES de ganhar o atalho: a descrição da dica (sr-only) fica como irmã, não dentro do nome do botão
    if (est.primaria === "assumir_ia") {
      // CA-042: a conversa já é minha — «Assumir» de si mesmo confunde: o botão diz o que faz (pausa a IA para eu responder)
      const b = h("button", { type: "button", class: "bt bt-prim bt-p cvc-ia-acao", title: minha ? "A conversa já é sua: pausa a IA para você responder" : "Pausar a IA e assumir esta conversa", dataset: { acao: "assumir" } },
        ui.icone("usuario"), h("span", { class: "so-largo-txt" }, minha ? "Pausar IA e responder" : "Assumir (pausa a IA)"),
        h("span", { class: "so-curto-txt" }, minha ? "Pausar IA" : "Assumir"));
      b.setAttribute("aria-label", minha ? "Pausar a IA e responder" : "Assumir (pausa a IA)");
      b.addEventListener("click", () => A.acoes.assumirIA(b));
      acoes.appendChild(b); comAtalho(b, "assumir");
    } else if (est.primaria === "assumir") {
      const b = h("button", { type: "button", class: "bt bt-prim bt-p", dataset: { acao: "assumir" } }, ui.icone("usuario"), "Assumir");
      b.addEventListener("click", () => A.acoes.assumir(b));
      acoes.appendChild(b); comAtalho(b, "assumir");
    } else if (est.primaria === "resolver") {
      const b = h("button", { type: "button", class: "bt bt-p bt-resolver", "aria-label": "Resolver atendimento", dataset: { acao: "resolver" } }, ui.icone("check"), h("span", { class: "rot-longo" }, "Resolver"));
      b.addEventListener("click", () => A.acoes.resolver(b));
      acoes.appendChild(b); comAtalho(b, "resolver");
    } else if (est.primaria === "reabrir") {
      const b = h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { acao: "reabrir" } }, A.icone("reabrir"), "Reabrir");
      b.addEventListener("click", () => A.acoes.status("aberta", b));
      acoes.appendChild(b);
    }
    if (pode && est.primaria !== "assumir_ia") {
      const b = h("button", { type: "button", class: "bt-icone so-largo cvc-transferir", "aria-label": "Transferir", title: "Transferir", dataset: { acao: "transferir" },
        on: { click: () => A.acoes.transferir() } }, A.icone("transferir"));
      acoes.appendChild(b); comAtalho(b, "transferir");
    }
    if (est.resolverIcone) {
      const b = h("button", { type: "button", class: "bt-icone so-largo cvc-resolver-ic", "aria-label": "Resolver atendimento", title: "Resolver", dataset: { acao: "resolver" } }, ui.icone("check"));
      b.addEventListener("click", () => A.acoes.resolver(b));
      acoes.appendChild(b); comAtalho(b, "resolver");
    }
    if (A.raiz && A.raiz.dataset.lateral === "gaveta") {
      acoes.appendChild(h("button", { type: "button", class: "bt-icone so-largo", "aria-label": "Detalhes do contato", title: "Detalhes", dataset: { acao: "detalhes" },
        on: { click: () => A.acoes.abrirDetalhes() } }, A.icone("lateral")));
    }
    const mais = h("button", { type: "button", class: "bt-icone cvc-mais", "aria-label": "Mais ações", title: "Mais ações", dataset: { acao: "mais" } }, ui.icone("opcoes"));
    mais.addEventListener("click", () => {
      const itens = [];
      if (pode && conv.status !== "resolvida" && est.primaria !== "resolver") itens.push({ rotulo: "Resolver atendimento", icone: "check", fn: () => A.acoes.resolver() });
      if (pode && conv.status !== "resolvida" && !minha && est.primaria === "assumir_ia") itens.push({ rotulo: "Atribuir a mim (sem pausar a IA)", icone: "usuario", fn: () => A.acoes.assumir() });
      // CA-227: pausar a IA por um tempo escolhido (o nx_cv_ia_pausar aceita p_horas; 0 = até alguém devolver)
      if (pode && conv.status !== "resolvida" && est.primaria === "assumir_ia") {
        itens.push({ rotulo: "Pausar a IA por 1 hora", icone: "relogio", fn: () => A.acoes.assumirIA(null, { horas: 1 }) });
        itens.push({ rotulo: L.rotuloPausa8(), icone: "relogio",   // plano 1000b · CB-086: de madrugada, «até as 8h»
 fn: () => A.acoes.assumirIA(null, { horas: L.horasAteAmanha8() }) });
        itens.push({ rotulo: "Pausar a IA até eu devolver", icone: "relogio", fn: () => A.acoes.assumirIA(null, { horas: 0 }) });
      }
      if (pode && est.devolverIA) itens.push({ rotulo: "Devolver para a IA", icone: "ia", fn: () => A.acoes.devolverIA() });
      if (pode) itens.push({ rotulo: "Transferir…", icone: "seta-dir", fn: () => A.acoes.transferir() });
      if (pode && conv.status === "aberta") itens.push({ rotulo: "Marcar como pendente", icone: "relogio", fn: () => A.acoes.status("pendente") });
      if (pode && conv.status === "pendente") itens.push({ rotulo: "Retomar (aberta)", icone: "chat", fn: () => A.acoes.status("aberta") });
      // CA-008: «Devolver para a fila» tem Desfazer (como Transferir e Resolver): nada vai ao servidor antes de o aviso fechar
      if (pode && conv.atribuida_a) itens.push({ rotulo: "Devolver para a fila", icone: "seta-esq", fn: () => A.acoes.devolverFila(conv) });
      if (pode) itens.push({ rotulo: "Etiquetas…", icone: "etiqueta", fn: () => abrirEtiquetas() });
      itens.push("-");
      // plano 1000 · CA-080: o telefone vai no formato internacional (+55…), pronto para colar no discador ou no WhatsApp
      if (ct.telefone) itens.push({ rotulo: "Copiar telefone", icone: "copiar", fn: () => ui.copiar(L.telefoneInternacional(ct.telefone), { aviso: `Telefone copiado: ${L.telefoneInternacional(ct.telefone)}` }) });
      // CA-082: «Abrir ficha» saiu do ⋮ (o nome no cabeçalho e o botão do cartão já abrem) — fica «Detalhes» no modo gaveta
      if (A.raiz && A.raiz.dataset.lateral === "gaveta") itens.push({ rotulo: "Detalhes e negócios", icone: "info", fn: () => A.acoes.abrirDetalhes() });
      // CA-231: os eventos do sistema (IA, transferências) podem virar um traço fino com a contagem
      itens.push({ rotulo: mostrarSistema() ? "Eventos do sistema: à vista" : "Eventos do sistema: recolhidos", icone: "info", fn: () => definirSistema(!mostrarSistema()) });
      // CA-232: a conversa inteira em texto (prontuário, registro) — sem notas internas
      if (typeof A.acoes.exportar === "function") itens.push({ rotulo: "Exportar conversa (.txt)", icone: "baixar", fn: () => A.acoes.exportar() });
      if (pode) itens.push({ rotulo: A.acoes.avancarAoResolver() ? "Ao resolver, abrir a próxima: ligado" : "Ao resolver, abrir a próxima: desligado",
        icone: A.acoes.avancarAoResolver() ? "check" : "seta-dir", fn: () => A.acoes.definirAvancar(!A.acoes.avancarAoResolver()) });
      // CA-018: no aparelho de toque não há teclado: a folha de atalhos não entra no menu
      if (!L.aparelhoDeToque()) itens.push({ rotulo: "Atalhos de teclado", icone: "info", fn: () => A.acoes.abrirAjudaTeclado() });
      if (A.acoes.pode("supervisor")) {
        itens.push("-");
        itens.push(conv.oculta
          ? { rotulo: "Desfazer bloqueio", icone: "check", fn: () => A.acoes.ocultar(false) }
          : { rotulo: "Ocultar e bloquear (spam)", icone: "alerta", perigo: true, fn: () => A.acoes.ocultar(true) });
      }
      // plano 1000 · CA-111: no toque, folha de baixo em grupos («Atendimento» · «Contato») no lugar do popover de 13 itens que encostava no campo
      if (L.aparelhoDeToque()) abrirFolha(mais, itens, ["Atendimento", "Contato", "Bloqueio"]);
      else ui.menu(mais, itens);
    });
    acoes.appendChild(mais);
    const acertarBarra = ligarBarra(acoes);
    acertarCab = acertarBarra;
    cab.append(voltar, quem, acoes);
    acertarBarra();                     // só com a barra na tela dá para saber quais botões o CSS escondeu (.so-largo no celular)
    // D4: o foco volta ao botão da mesma ação (a ação pode ter mudado — Assumir virou Resolver: aí vai para «Mais ações»)
    if (focoAcao) {
      const alvoF = (cab.querySelector(`[data-acao="${focoAcao}"]`) || faixa.querySelector(`[data-acao="${focoAcao}"]`) || cab.querySelector(".cvc-mais"));
      if (alvoF) try { alvoF.focus({ preventScroll: true }); } catch { try { alvoF.focus(); } catch { /* ok */ } }
    }
  }

  /** CA-111: folha de baixo (celular) com os itens do ⋮ em grupos; "-" separa os grupos. Esc, tocar fora e Voltar fecham; o foco volta ao ⋮. */
  let folhaAberta = null;
  let seqFolha = 0;
  function abrirFolha(ancora, itens, nomes = []) {
    if (folhaAberta) { try { folhaAberta.fechar(); } catch { /* ok */ } }
    const grupos = [[]];
    for (const it of itens.filter(Boolean)) { if (it === "-") grupos.push([]); else grupos[grupos.length - 1].push(it); }
    let fechado = false, camada = null;
    const folhaSeq = ++seqFolha;   // plano 1000b · CB-088: ids únicos dos títulos dos grupos
    const dlg = h("dialog", { class: "cv-folha", "aria-label": "Mais ações" });
    const fechar = (voltarFoco = true) => {
      if (fechado) return; fechado = true;
      if (camada) try { camada.liberar(); } catch { /* ok */ }
      try { dlg.close(); } catch { /* ok */ }
      dlg.remove();
      if (folhaAberta && folhaAberta.el === dlg) folhaAberta = null;
      if (voltarFoco && ancora && ancora.isConnected) try { ancora.focus({ preventScroll: true }); } catch { /* ok */ }
    };
    const corpoF = h("div", { class: "cv-folha-corpo" },
      // plano 1000b · CB-088: o grupo é nomeado pelo próprio h3 (aria-labelledby) — antes aria-label + h3 liam o nome duas vezes
      grupos.filter(g => g.length).map((g, i) => h("section", { class: "cv-folha-grupo", "aria-labelledby": `cv-folha-g${folhaSeq}-${i}` },
        h("h3", { class: "rotulo", id: `cv-folha-g${folhaSeq}-${i}` }, nomes[i] || "Mais"),
        g.map(it => {
          const b = h("button", { type: "button", class: ["cv-folha-item", it.perigo && "perigo"], disabled: !!it.desabilitado }, it.icone ? ui.icone(it.icone) : null, h("span", null, it.rotulo));
          b.addEventListener("click", () => { fechar(false); if (it.fn) it.fn(); });
          return b;
        }))));
    dlg.append(h("div", { class: "cv-folha-pega", "aria-hidden": "true" }), corpoF,
      h("button", { type: "button", class: "bt bt-sec cv-folha-x", on: { click: () => fechar() } }, "Fechar"));
    dlg.addEventListener("cancel", ev => { ev.preventDefault(); fechar(); });
    dlg.addEventListener("click", ev => { if (ev.target === dlg) fechar(); });
    document.body.appendChild(dlg);
    try { dlg.showModal(); } catch { dlg.setAttribute("open", ""); }
    if (ui.camadas && typeof ui.camadas.abrir === "function") { try { camada = ui.camadas.abrir(() => fechar()); } catch { camada = null; } }
    const primeiro = dlg.querySelector(".cv-folha-item:not([disabled])");
    if (primeiro) try { primeiro.focus({ preventScroll: true }); } catch { /* ok */ }
    folhaAberta = { el: dlg, fechar };
    return folhaAberta;
  }

  /** Atalho da ação na barra (38): aria-keyshortcuts + etiqueta <kbd> que aparece no hover/foco (ui.dica quando a frente A oferecer). */
  function comAtalho(b, comando) {
    const teclas = L.atalhoDe(comando);
    if (!teclas) return b;
    b.setAttribute("aria-keyshortcuts", L.ariaKeyshortcuts(teclas));
    const rot = b.getAttribute("aria-label") || b.title || b.textContent.trim();
    const texto = `${rot} (${teclas})`;
    // com a dica da frente A o atalho já aparece no tooltip (hover + foco); sem ela, a etiqueta <kbd> sob o botão faz esse papel.
    // CA-017: no toque a dica ficava presa por cima do que abria — lá não há teclado nem hover: nada de tooltip nem <kbd>
    if (L.aparelhoDeToque()) return b;
    let comDica = false;
    if (typeof ui.dica === "function") { try { ui.dica(b, texto); comDica = true; } catch { comDica = false; } }
    if (!comDica) { b.title = texto; b.appendChild(h("kbd", { class: "cv-kbd", "aria-hidden": "true" }, teclas.replace("Shift", "⇧"))); }
    return b;
  }
  /**
   * Barra de ferramentas: um só botão na ordem do Tab (o primeiro VISÍVEL e habilitado); ← → Home End andam só entre os visíveis.
   * No celular o CSS esconde os .so-largo (display:none): o ponto de Tab nunca pode cair num deles, senão a barra some do Tab.
   * Devolve acertar(), que quem monta chama depois de pôr a barra na tela (o cabeçalho é redesenhado a cada resize).
   */
  function ligarBarra(barra) {
    const todos = () => [...barra.querySelectorAll("button")].filter(b => !b.disabled && !b.hidden);
    // fora da tela não há layout: aí vale o que não está disabled/hidden (acertar() refaz quando a barra entra)
    const naTela = b => !barra.isConnected || typeof b.getClientRects !== "function" || b.getClientRects().length > 0;
    const botoes = () => todos().filter(naTela);
    const marcar = ativo => { for (const b of todos()) b.tabIndex = b === ativo ? 0 : -1; };
    let adiado = false;
    /** inicio: o ponto de Tab volta ao 1º botão visível (cabeçalho sem mudança e ninguém na barra). */
    const acertar = (inicio = false) => {
      if (!barra.isConnected) {           // o cabeçalho ainda não entrou na página: confere no próximo quadro
        if (!adiado && typeof requestAnimationFrame === "function") { adiado = true; requestAnimationFrame(() => { if (barra.isConnected) acertar(); }); }
        return;
      }
      const vis = botoes();
      marcar((inicio ? null : vis.find(b => b.tabIndex === 0)) || vis[0] || null);
    };
    marcar(botoes()[0] || null);
    barra.addEventListener("focusin", ev => { const b = ev.target && ev.target.closest ? ev.target.closest("button") : null; if (b && barra.contains(b)) marcar(b); });
    barra.addEventListener("keydown", ev => {
      const lista = botoes();
      if (!lista.length) return;
      const atual = ev.target && ev.target.closest ? ev.target.closest("button") : null;
      let i = lista.indexOf(atual);
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") i = (i + 1) % lista.length;
      else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") i = (i - 1 + lista.length) % lista.length;
      else if (ev.key === "Home") i = 0;
      else if (ev.key === "End") i = lista.length - 1;
      else return;
      ev.preventDefault();
      marcar(lista[i]);
      try { lista[i].focus(); } catch { /* ok */ }
    });
    return acertar;
  }
  let iaFlashAte = 0;

  /** O mesmo estado que decide o botão principal do cabeçalho (assumir / assumir IA / resolver / reabrir): o teclado usa a mesma regra. */
  function estadoAcoes() {
    const conv = A.ver && A.ver.conversa;
    if (!conv) return null;
    const prov = (conv.canal && conv.canal.provedor) || ((A.base && A.base.canais) || []).find(k => k.id === conv.canal_id)?.provedor || "meta";
    const codeWords = prov === "codewords";
    return L.estadoCabecalho({ conv, eu: A.eu && A.eu.id, pode: A.podeEscrever, codeWords, ia: codeWords ? A.iaEstado : null });
  }

  function abrirEtiquetas() {
    const conv = A.ver && A.ver.conversa;
    if (!conv) return;
    // D20: debounce e sequência do seletor (frente A): a resposta de um pedido antigo nunca desfaz a marcação mais nova
    const sel = ui.seletorEtiquetas({ todas: A.base.etiquetas || [], marcadas: conv.etiquetas || [], rotulo: "Etiquetas da conversa",
      aoMudar: async (ids, info) => {
        const seq = info && info.seq;
        const atual = () => seq === undefined || typeof sel.seqAtual !== "function" || seq === sel.seqAtual();
        const r = await A.acoes.etiquetas(ids, { atual });
        if (r && atual() && typeof sel.definir === "function") sel.definir(r.etiquetas || ids);
      },
      podeCriar: A.acoes.pode("atendente") ? nome => A.acoes.criarEtiqueta(nome) : false });
    const r = ui.modal({ titulo: "Etiquetas da conversa", corpo: h("div", { class: "pilha" }, h("p", { class: "sub" }, "Marque para organizar e filtrar a lista."), sel),
      largura: "p", acoes: [{ rotulo: "Pronto", tipo: "primario", valor: true }] });
    // «Pronto» (ou fechar) com a mudança ainda no debounce: ela sai na hora
    if (r && typeof r.then === "function") r.then(() => { if (typeof sel.emitirAgora === "function") sel.emitirAgora(); }, () => {});
  }

  /* ---------------- mensagens */
  const cache = new Map();   // chave → {el, sig}
  let ultimoRenderId = null;
  const falhasVistas = new Set();   // plano 1000b · CB-021: falhas gravadas já desenhadas nesta conversa (as do 1º desenho são antigas)

  /** Segmentos do formatarWhats viram nós (nunca HTML); CA-022: negrito/itálico/riscado com link dentro desenham o link aninhado. */
  function nosFormatados(segs) {
    const frag = document.createDocumentFragment();
    for (const seg of segs) {
      const dentro = () => (seg.partes ? nosFormatados(seg.partes) : seg.v);
      if (seg.tipo === "texto") frag.appendChild(document.createTextNode(seg.v));
      else if (seg.tipo === "link") frag.appendChild(linkSeguro(seg.v, seg.texto));
      else if (seg.tipo === "negrito") frag.appendChild(h("strong", null, dentro()));
      else if (seg.tipo === "italico") frag.appendChild(h("em", null, dentro()));
      else if (seg.tipo === "riscado") frag.appendChild(h("s", null, dentro()));
      else if (seg.tipo === "mono") frag.appendChild(h("code", { class: seg.linha ? "mono cv-code" : "mono" }, seg.v));
    }
    return frag;
  }
  /** plano 1000 · CA-121: o link mostra para onde vai de verdade (o host como o navegador lê — domínio internacional em punycode) e
      avisa encurtador; o ↗ diz que abre fora do Órbita. */
  function linkSeguro(url, texto = url) {   // plano 1000b · CB-026: «www.…» mostra o que foi escrito; o href leva o https://
    const d = L.destinoLink(url);
    const title = !d ? "Abre fora do Órbita" : d.encurtador ? `Link encurtado (${d.host}): o destino real só aparece depois de abrir. Abra só se confia no remetente.`
      : d.idn ? `Vai para ${d.host} — endereço com letras de outro alfabeto: confira antes de abrir.` : `Vai para ${d.host}`;
    return h("a", { href: url, target: "_blank", rel: "noopener noreferrer nofollow", title, class: d && (d.encurtador || d.idn) ? "cv-link-aten" : null, dataset: d ? { host: d.host } : null },
      texto || url, h("span", { class: "cv-link-ext", "aria-hidden": "true" }, "↗"), d && (d.encurtador || d.idn) ? h("span", { class: "sr-only" }, ` (${title})`) : null);
  }
  /** CA-023: blocos de linha do WhatsApp (citação «> », listas «- » e «1. »); texto sem blocos fica como sempre foi. */
  function textoFormatado(s) {
    const blocos = L.blocosWhats(s);
    if (blocos.length === 1 && blocos[0].tipo === "p") return nosFormatados(L.formatarWhats(s));
    const frag = document.createDocumentFragment();
    for (const b of blocos) {
      if (b.tipo === "p") frag.appendChild(h("span", { class: "cv-par" }, nosFormatados(L.formatarWhats(b.texto))));
      else if (b.tipo === "citacao") frag.appendChild(h("blockquote", { class: "cv-citacao" }, nosFormatados(L.formatarWhats(b.texto))));
      else if (b.tipo === "lista") frag.appendChild(h(b.ordenada ? "ol" : "ul", { class: "cv-lista" }, b.itens.map(t => h("li", null, nosFormatados(L.formatarWhats(t))))));
    }
    return frag;
  }

  /** plano 1000b · CB-034: <a download> com a URL assinada do Storage (outra origem) é ignorado pelo navegador, que abre o arquivo numa
      aba (no celular a pessoa sai do Órbita). No clique: fetch → blob → link temporário com download=nome; se o fetch falhar, abre a aba. */
  function baixarDeVerdade(a) {
    a.addEventListener("click", async ev => {
      const url = a.getAttribute("href") || "";
      if (!url || url === "#" || /^(blob|data):/i.test(url) || typeof globalThis.fetch !== "function") return;
      ev.preventDefault();
      const nome = a.getAttribute("download") || "arquivo";
      try {
        const r = await globalThis.fetch(url);
        if (!r || !r.ok) throw new Error("download");
        const blob = await r.blob();
        const obj = URL.createObjectURL(blob);
        const tmp = h("a", { href: obj, download: nome, hidden: true });
        document.body.appendChild(tmp);
        tmp.click();
        tmp.remove();
        setTimeout(() => { try { URL.revokeObjectURL(obj); } catch { /* ok */ } }, 1000);
      } catch {
        // revisão 1000b · CB-034: window.open depois de um await perde o gesto do toque e o bloqueador de pop-up engolia em silêncio —
        // o aviso traz um link de verdade (o toque nele abre o arquivo)
        const t = ui.toast("Não deu para baixar aqui: toque no link para abrir o arquivo.", { tipo: "erro" });
        if (t && t.el && !t.suprimido) {
          const link = h("a", { href: url, target: "_blank", rel: "noopener noreferrer", class: "toast-acao cvc-baixar-link" }, `Abrir ${nome}`);
          const p = t.el.querySelector("p");
          if (p && p.after) p.after(link); else t.el.appendChild(link);
        }
      }
    });
    return a;
  }
  // plano 1000b · CB-109: a mesma sigla do composer (L.siglaArquivo) — sem pedaço do mime («PLAI») nem do nome
  function extensao(nome, mime) { return L.siglaArquivo(nome, mime); }

  /** URL de uma mídia gravada ou local: {url, estado:"ok"|"buscando"|"erro"} (a mesma regra para bolha, grade e visualizador). */
  /* CA-245: mídia de conversa oculta (contato bloqueado) só é pedida depois do toque em «Mostrar» */
  const midiaLiberada = new Set();
  function bloqueada(path) { return !!(A.ver && A.ver.conversa && A.ver.conversa.oculta) && !!path && !midiaLiberada.has(path); }
  function liberarMidia(path) { if (path) midiaLiberada.add(path); renderMensagens({ rolar: "manter" }); }
  function resolverUrl(md) {
    const local = md && md.local_url && /^blob:/.test(md.local_url) ? md.local_url : null;
    if (local) return { url: local, estado: "ok" };
    if (!md || !md.path) return { url: null, estado: "erro" };
    if (bloqueada(md.path)) return { url: null, estado: "oculta" };
    const c = A.midia.get(md.path);
    if (c && c.local) return { url: c.local, estado: "ok" };
    const url = A.acoes.urlMidia(md.path);
    if (url) return { url, estado: "ok" };
    return { url: null, estado: A.acoes.estadoMidia(md.path) === "erro" ? "erro" : "buscando" };
  }

  /* ---------------- visualizador de fotos (33): <dialog> próprio — Esc fecha, ← → trocam, deslize no celular, foco preso e devolvido à bolha */
  let visualizador = null;
  function abrirVisualizador(msgInicial) {
    const itens = L.imagensDaConversa(A.msgs);
    if (!itens.length) return;
    if (visualizador) { try { visualizador.fechar(); } catch { /* ok */ } }
    let i = Math.max(0, itens.findIndex(x => String(x.id) === String(msgInicial && msgInicial.id)));
    const origem = document.activeElement;
    const img = h("img", { alt: "" });
    const leg = h("figcaption", { class: "cv-lb-leg" });
    const fig = h("figure", { class: "cv-lb-fig" }, img, leg);
    const contador = h("span", { class: "cv-lb-n dado", role: "status", "aria-live": "polite" });
    const nome = h("span", { class: "cv-lb-nome" });
    const btAnt = h("button", { type: "button", class: "bt-icone cv-lb-ant", "aria-label": "Foto anterior (seta para a esquerda)" }, ui.icone("seta-esq"));
    const btProx = h("button", { type: "button", class: "bt-icone cv-lb-prox", "aria-label": "Próxima foto (seta para a direita)" }, ui.icone("seta-dir"));
    const btBaixar = baixarDeVerdade(h("a", { class: "bt bt-sec bt-p cv-lb-baixar", href: "#", target: "_blank", rel: "noopener noreferrer" }, A.icone("baixar"), h("span", { class: "so-largo-txt" }, "Baixar")));   // plano 1000b · CB-034
    const btZoom = h("button", { type: "button", class: "bt-icone cv-lb-zoom", "aria-label": "Ampliar a foto", "aria-pressed": "false" }, A.icone("ampliar"));
    const btFechar = h("button", { type: "button", class: "bt-icone cv-lb-x", "aria-label": "Fechar (Esc)" }, ui.icone("fechar"));
    const kbd = t => h("kbd", null, t);
    // plano 1000b · CB-031: aviso quando a URL da foto não vem
    const btTentar = h("button", { type: "button", class: "bt bt-sec bt-p cv-lb-tentar" }, "Tentar de novo");
    const falha = h("p", { class: "cv-lb-falha", role: "status", hidden: true }, "Não deu para abrir a foto agora. ", btTentar);
    const dlg = h("dialog", { class: "cv-lb", "aria-label": "Visualizador de fotos", dataset: { carregando: "0", zoom: "0" } },
      h("header", { class: "cv-lb-cab" }, contador, nome, h("div", { class: "cv-lb-acoes" }, btZoom, btBaixar, btFechar)),
      h("div", { class: "cv-lb-palco" }, btAnt, fig, btProx), falha,
      // plano 1000b · CB-074: no toque só «Deslize para trocar»; com teclado, só as teclas
      L.aparelhoDeToque() ? h("p", { class: "cv-lb-dica" }, "Deslize para trocar")
        : h("p", { class: "cv-lb-dica" }, kbd("←"), " ", kbd("→"), " trocam · ", kbd("Esc"), " fecha"));
    let fechado = false, timer = null, camada = null, desligarSwipe = null;
    // plano 1000b · CB-031: no máximo ~20 tentativas (7 s) esperando a URL; depois o aviso com «Tentar de novo» (antes: para sempre)
    const MAX_TENT = 20;
    let tentativas = 0, tentIdx = -1;
    btTentar.addEventListener("click", () => {
      tentativas = 0; falha.hidden = true;
      // plano 1000b · CB-032: com a mídia gravada como erro, esquece o erro guardado (A.midia) para a URL ser pedida de novo
      const it = itens[i];
      if (it && it.path && A.midia && typeof A.midia.delete === "function") A.midia.delete(it.path);
      mostrar();
    });
    function mostrar() {
      clearTimeout(timer);
      if (tentIdx !== i) { tentIdx = i; tentativas = 0; falha.hidden = true; }
      const it = itens[i];
      contador.textContent = `${i + 1} de ${itens.length}`;
      nome.textContent = it.nome || (it.direcao === "in" ? "Foto recebida" : "Foto enviada");
      leg.textContent = [it.legenda, L.horaMsg(it.criado_em)].filter(Boolean).join(" · ");
      btAnt.disabled = i === 0; btProx.disabled = i === itens.length - 1;
      dlg.dataset.zoom = "0"; btZoom.setAttribute("aria-pressed", "false");
      const r = resolverUrl(it);
      if (r.url) {
        falha.hidden = true;
        img.src = r.url; img.alt = it.legenda || it.nome || (it.direcao === "in" ? "Foto recebida" : "Foto enviada");
        btBaixar.href = r.url; btBaixar.setAttribute("download", it.nome || ""); btBaixar.hidden = false;
        dlg.dataset.carregando = "0";
      } else {
        img.removeAttribute("src"); img.alt = r.estado === "erro" ? "Não foi possível abrir esta foto agora." : "Carregando a foto…";
        btBaixar.hidden = true;
        dlg.dataset.carregando = r.estado === "erro" ? "erro" : "1";
        if (r.estado !== "erro" && tentativas < MAX_TENT) { tentativas++; timer = setTimeout(() => { if (!fechado) mostrar(); }, 350); }   // a URL assinada ainda está vindo
        else { dlg.dataset.carregando = "erro"; img.alt = "Não foi possível abrir esta foto agora."; falha.hidden = false; }   // plano 1000b · CB-032: erro também oferece «Tentar de novo»
      }
    }
    const ir = d => { const j = i + d; if (j < 0 || j >= itens.length) return; i = j; mostrar(); };
    const fechar = () => {
      if (fechado) return; fechado = true;
      clearTimeout(timer);
      if (camada) try { camada.liberar(); } catch { /* ok */ }
      if (desligarSwipe) try { desligarSwipe(); } catch { /* ok */ }
      try { dlg.close(); } catch { /* ok */ }
      dlg.remove();
      if (visualizador && visualizador.el === dlg) visualizador = null;
      // o foco volta para a foto que estava na tela (pode ser outra que não a aberta): bolha simples ou célula da grade
      const id = escaparSel(itens[i].id);
      const alvo = trilho.querySelector(`.cv-msg[data-id="${id}"] .cv-img-bt`) || trilho.querySelector(`.cv-grade-bt[data-id="${id}"]`) || origem;
      if (alvo && alvo.isConnected) try { alvo.focus({ preventScroll: true }); } catch { try { alvo.focus(); } catch { /* ok */ } }
    };
    btAnt.addEventListener("click", () => ir(-1));
    btProx.addEventListener("click", () => ir(1));
    btFechar.addEventListener("click", fechar);
    btZoom.addEventListener("click", () => { const z = dlg.dataset.zoom !== "1"; dlg.dataset.zoom = z ? "1" : "0"; btZoom.setAttribute("aria-pressed", String(z)); });
    img.addEventListener("dblclick", () => btZoom.click());
    dlg.addEventListener("cancel", ev => { ev.preventDefault(); fechar(); });
    dlg.addEventListener("click", ev => { if (ev.target === dlg) fechar(); });
    dlg.addEventListener("keydown", ev => {
      if (ev.key === "ArrowLeft") { ev.preventDefault(); ir(-1); }
      else if (ev.key === "ArrowRight") { ev.preventDefault(); ir(1); }
      else if (ev.key === "Home") { ev.preventDefault(); i = 0; mostrar(); }
      else if (ev.key === "End") { ev.preventDefault(); i = itens.length - 1; mostrar(); }
      else if (ev.key === "Escape") { ev.preventDefault(); fechar(); }
      else if (ev.key === "Tab") {       // foco preso dentro do visualizador (o <dialog> modal já isola o resto; isto fecha o ciclo nos extremos)
        const focaveis = [...dlg.querySelectorAll("button, a[href]")].filter(x => !x.disabled && !x.hidden);
        if (!focaveis.length) return;
        const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
        if (ev.shiftKey && (document.activeElement === primeiro || document.activeElement === dlg)) { ev.preventDefault(); ultimo.focus(); }
        else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
      }
    });
    if (typeof ui.deslizar === "function") {                       // celular: deslizar troca a foto
      try { desligarSwipe = ui.deslizar(fig, { esquerda: () => ir(1), direita: () => ir(-1) }); } catch { desligarSwipe = null; }
    }
    document.body.appendChild(dlg);
    try { dlg.showModal(); } catch { dlg.setAttribute("open", ""); }
    if (ui.camadas && typeof ui.camadas.abrir === "function") { try { camada = ui.camadas.abrir(() => fechar()); } catch { camada = null; } }   // Voltar do navegador fecha
    mostrar();
    const toque = (() => { try { return matchMedia("(pointer: coarse)").matches; } catch { return false; } })();
    if (toque) { dlg.setAttribute("tabindex", "-1"); try { dlg.focus({ preventScroll: true }); } catch { /* ok */ } }
    else try { (btProx.disabled ? btFechar : btProx).focus({ preventScroll: true }); } catch { /* ok */ }
    visualizador = { el: dlg, fechar, ir, get indice() { return i; }, total: itens.length };
    return visualizador;
  }

  /* ---------------- áudio (32): o <audio> continua sendo a fonte; a bolha ganha play/pausa, progresso, duração e velocidade */
  let audioTocando = null;            // só um áudio toca por vez (como no WhatsApp)
  const players = new Set();          // para a velocidade escolhida valer em todos os áudios da conversa
  function blocoAudio(m, url, md) {
    const audio = h("audio", { src: url, preload: "none" });   // plano 1000b · CB-134: metadados só quando entra na tela
    aoFalharMidia(audio, md.path);
    let vel = A.acoes.velocidadeAudio ? A.acoes.velocidadeAudio() : 1;
    try { audio.playbackRate = vel; } catch { /* navegador sem suporte: toca a 1× */ }
    const btPlay = h("button", { type: "button", class: "bt-icone cv-au-play", "aria-label": "Tocar áudio" }, A.icone("play"));
    const barraPos = h("i", { class: "cv-au-pos" });
    const trilhoAu = h("div", { class: "cv-au-trilho", role: "slider", tabindex: "0", "aria-label": "Posição do áudio", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0", "aria-valuetext": "0:00" },
      h("i", { class: "cv-au-buf" }), barraPos);
    const tempo = h("span", { class: "cv-au-tempo dado" }, "0:00");
    const dur = h("span", { class: "cv-au-dur dado" }, L.formatarDuracao(md.duracao));
    const btVel = h("button", { type: "button", class: "cv-au-vel dado", "aria-label": `Velocidade ${L.rotuloVelocidade(vel)}. Toque para mudar` }, L.rotuloVelocidade(vel));
    // plano 1000b · CB-089: «Baixar áudio» (prontuário, encaminhar ao profissional) — o mesmo download do CB-034 (fetch → blob → arquivo)
    const nomeAudio = md.nome || `audio-${m.id}.${/mp4|m4a|aac/i.test(String(md.mime || "")) ? "m4a" : /mpeg|mp3/i.test(String(md.mime || "")) ? "mp3" : /wav/i.test(String(md.mime || "")) ? "wav" : "ogg"}`;
    const btBaixarAu = /^blob:/i.test(String(url || "")) ? null
      : baixarDeVerdade(h("a", { class: "bt-icone cv-au-baixar", href: url, download: nomeAudio, target: "_blank", rel: "noopener noreferrer", "aria-label": "Baixar áudio", title: "Baixar áudio" }, A.icone("baixar")));
    const caixa = h("div", { class: "cv-midia cv-audio", dataset: { estado: "parado" } }, audio, btPlay, h("div", { class: "cv-au-meio" }, trilhoAu, h("div", { class: "cv-au-tempos" }, tempo, dur)), btVel, btBaixarAu);
    preloadPreguicoso(audio, caixa);   // plano 1000b · CB-134
    const duracao = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (Number(md.duracao) > 0 ? Number(md.duracao) : 0));
    const pintar = () => {
      const d = duracao(), t = Number(audio.currentTime) || 0;
      const pct = d ? Math.max(0, Math.min(100, (t / d) * 100)) : 0;
      caixa.style.setProperty("--pct", `${pct.toFixed(2)}%`);
      trilhoAu.setAttribute("aria-valuenow", String(Math.round(pct)));
      trilhoAu.setAttribute("aria-valuetext", d ? `${L.formatarDuracao(t)} de ${L.formatarDuracao(d)}` : L.formatarDuracao(t));
      tempo.textContent = L.formatarDuracao(t);
      if (d) dur.textContent = L.formatarDuracao(d);
    };
    const estado = tocando => {
      caixa.dataset.estado = tocando ? "tocando" : "parado";
      btPlay.setAttribute("aria-label", tocando ? "Pausar áudio" : "Tocar áudio");
      ui.limpar(btPlay); btPlay.appendChild(A.icone(tocando ? "pausa" : "play"));
    };
    const aplicarVel = v => { vel = v; try { audio.playbackRate = v; } catch { /* ok */ } btVel.textContent = L.rotuloVelocidade(v); btVel.setAttribute("aria-label", `Velocidade ${L.rotuloVelocidade(v)}. Toque para mudar`); };
    // plano 1000b · CB-030: formato que o navegador não toca (OGG/Opus no Safari antigo) — diz por quê e oferece baixar (antes: calado)
    const naoToca = () => {
      if (caixa.querySelector(".cv-au-naotoca")) return;
      caixa.dataset.estado = "naotoca";
      const baixar = /^blob:/i.test(String(url || "")) ? null
        : baixarDeVerdade(h("a", { class: "link", href: url, download: nomeAudio, target: "_blank", rel: "noopener noreferrer" }, "Baixar"));
      caixa.appendChild(h("p", { class: "cv-au-naotoca sub", role: "status" }, "Este navegador não toca este áudio. ", baixar));
    };
    btPlay.addEventListener("click", () => {
      if (audio.paused) { const p = audio.play(); if (p && typeof p.catch === "function") p.catch(e => { estado(false); if (e && e.name === "NotSupportedError") naoToca(); }); }
      else audio.pause();
    });
    audio.addEventListener("error", () => {
      const mime = String(md.mime || "").split(";")[0].trim();
      try { if (mime && typeof audio.canPlayType === "function" && audio.canPlayType(mime) === "") naoToca(); } catch { /* ok */ }
    });
    audio.addEventListener("play", () => { if (audioTocando && audioTocando !== audio) { try { audioTocando.pause(); } catch { /* ok */ } } audioTocando = audio; estado(true); });
    audio.addEventListener("pause", () => { if (audioTocando === audio) audioTocando = null; estado(false); });
    audio.addEventListener("ended", () => { estado(false); try { audio.currentTime = 0; } catch { /* ok */ } pintar(); });
    audio.addEventListener("timeupdate", pintar);
    audio.addEventListener("loadedmetadata", pintar);
    audio.addEventListener("durationchange", pintar);
    audio.addEventListener("progress", () => {
      try { const d = duracao(); const b = audio.buffered; if (d && b && b.length) caixa.style.setProperty("--buf", `${Math.min(100, (b.end(b.length - 1) / d) * 100).toFixed(2)}%`); } catch { /* ok */ }
    });
    const irPara = fr => { const d = duracao(); if (!d) return; try { audio.currentTime = Math.max(0, Math.min(d, fr * d)); } catch { /* ok */ } pintar(); };
    const fracaoDoEvento = ev => { const r = trilhoAu.getBoundingClientRect ? trilhoAu.getBoundingClientRect() : null; if (!r || !r.width) return null; return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)); };
    // plano 1000b · CB-090: arrastar o dedo/mouse no trilho acompanha (captura do ponteiro enquanto pressionado), não só o toque
    let arrastando = null;
    trilhoAu.addEventListener("pointerdown", ev => {
      const f = fracaoDoEvento(ev); if (f === null) return;
      ev.preventDefault(); irPara(f);
      arrastando = ev.pointerId ?? 1;
      try { if (typeof trilhoAu.setPointerCapture === "function" && ev.pointerId != null) trilhoAu.setPointerCapture(ev.pointerId); } catch { /* ok */ }
    });
    trilhoAu.addEventListener("pointermove", ev => {
      if (arrastando === null || (ev.pointerId != null && ev.pointerId !== arrastando)) return;
      const f = fracaoDoEvento(ev); if (f !== null) { ev.preventDefault(); irPara(f); }
    });
    const soltar = () => { arrastando = null; };
    trilhoAu.addEventListener("pointerup", soltar);
    trilhoAu.addEventListener("pointercancel", soltar);
    trilhoAu.addEventListener("lostpointercapture", soltar);
    trilhoAu.addEventListener("keydown", ev => {
      const d = duracao(); if (!d) return;
      const t = Number(audio.currentTime) || 0;
      if (ev.key === "ArrowRight" || ev.key === "ArrowUp") { ev.preventDefault(); irPara(Math.min(1, (t + 5) / d)); }
      else if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") { ev.preventDefault(); irPara(Math.max(0, (t - 5) / d)); }
      else if (ev.key === "Home") { ev.preventDefault(); irPara(0); }
      else if (ev.key === "End") { ev.preventDefault(); irPara(1); }
      else if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); btPlay.click(); }
    });
    btVel.addEventListener("click", () => {
      const nova = A.acoes.definirVelocidadeAudio ? A.acoes.definirVelocidadeAudio(L.proximaVelocidade(vel)) : L.proximaVelocidade(vel);
      for (const p of players) { if (p.caixa.isConnected) p.aplicarVel(nova); else players.delete(p); }
      ui.anunciar(`Velocidade ${L.rotuloVelocidade(nova)} para todos os áudios.`);
    });
    players.add({ caixa, aplicarVel });
    pintar();
    return caixa;
  }

  /** URL assinada vencida (1 h) ou quebrada → esquece e mostra "tentar de novo" (no máximo uma vez por minuto). */
  /** plano 1000b · CB-134: áudio e vídeo nascem com preload="none" e só pedem os metadados ao Storage quando a bolha entra na tela
      (uma conversa com 50 áudios fazia 50 pedidos ao abrir). Sem IntersectionObserver: «metadata», como antes. */
  let obsPreload = null;
  // revisão 1000b · CB-134: as caixas observadas — as que saem do DOM no renderMensagens são «unobserve» (o observador não segura
  // bolhas mortas nem a mídia delas)
  const observadasPreload = new Set();
  function soltarPreloadForaDaTela() {
    if (!obsPreload) return;
    for (const c of observadasPreload) {
      if (c.isConnected) continue;
      try { obsPreload.unobserve(c); } catch { /* ok */ }
      c._media = null;
      observadasPreload.delete(c);
    }
  }
  function preloadPreguicoso(media, caixa) {
    if (typeof IntersectionObserver !== "function") { media.preload = "metadata"; media.setAttribute("preload", "metadata"); return; }
    if (!obsPreload) obsPreload = new IntersectionObserver(ents => {
      for (const e of ents) {
        if (!e.isIntersecting) continue;
        const md = e.target._media;
        if (md && md.getAttribute("preload") === "none") { md.preload = "metadata"; md.setAttribute("preload", "metadata"); }
        try { obsPreload.unobserve(e.target); } catch { /* ok */ }
        observadasPreload.delete(e.target);
      }
    }, { root: null, rootMargin: "200px 0px" });
    caixa._media = media;
    try { obsPreload.observe(caixa); observadasPreload.add(caixa); } catch { /* ok */ }
  }
  function aoFalharMidia(el, path) {
    if (!path) return;
    el.addEventListener("error", () => {
      if (A.destruido) return;
      const c = A.midia.get(path);
      if (c && c.url && Date.now() - (c.falhouEm || 0) > 60000) {
        A.midia.set(path, { erro: true, em: Date.now(), falhouEm: Date.now() });
        renderMensagens({ rolar: "manter" });
      }
    }, { once: true });
  }

  function blocoMidia(m) {
    const md = m.midia || {};
    const nome = md.nome || null;
    const local = md.local_url && /^blob:/.test(md.local_url) ? md.local_url : null;
    const estado = md.estado || (md.path ? "ok" : local ? "ok" : "indisponivel");
    // plano 1000b · CB-073: sem role=status em cada mídia (30 fotos = 30 «Carregando…» no leitor de tela); o resumo vai num aviso só (avisoMidias)
    if (!local && (estado === "baixando")) return esqueleto(h("div", { class: "cv-midia-sk" }, "Baixando mídia…"));
    // plano 1000 · SV-057: o arquivo foi apagado pelo painel (nx_midia_apagada tira o path) — não é falha do WhatsApp
    if (!local && estado === "apagada") {
      return h("div", { class: "cv-midia-off" }, ui.icone("alerta"),
        h("span", null, h("b", null, "Arquivo apagado. "), "Esta mídia foi apagada do armazenamento da empresa; a mensagem continua no histórico."));
    }
    if (!local && (estado === "falhou" || estado === "indisponivel" || (!md.path && estado === "ok"))) {
      return h("div", { class: "cv-midia-off" }, ui.icone("alerta"),
        h("span", null, h("b", null, "Mídia indisponível. "),
          estado === "indisponivel" ? "O número ainda não tem acesso para baixar arquivos do WhatsApp." : "O WhatsApp não entregou o arquivo — peça para o cliente reenviar, se precisar."));
    }
    // plano 1000 · CA-245: conversa oculta (contato bloqueado, spam): a mídia só é pedida ao servidor quando a pessoa toca em «Mostrar»
    if (!local && md.path && bloqueada(md.path)) {
      return h("div", { class: "cv-midia-off cv-midia-oculta" }, ui.icone("alerta"),
        h("span", null, "Mídia de contato bloqueado: não abre sozinha. ",
          h("button", { type: "button", class: "link cv-midia-mostrar", on: { click: () => liberarMidia(md.path) } }, "Mostrar mídia de contato bloqueado")));
    }
    let url = local;
    if (!url && md.path) {
      const c = A.midia.get(md.path);
      if (c && c.local) url = c.local;
      else url = A.acoes.urlMidia(md.path);
      if (!url) {
        if (A.acoes.estadoMidia(md.path) === "erro") {
          return h("div", { class: "cv-midia-off" }, ui.icone("alerta"), h("span", null, "Não foi possível abrir a mídia agora. ",
            h("button", { type: "button", class: "link", on: { click: () => { A.midia.delete(md.path); renderMensagens({ rolar: "manter" }); focarBolha(m.id); } } }, "Tentar de novo")));   // CB-128
        }
        return esqueleto(h("div", { class: "cv-midia-sk" }, "Carregando mídia…"));   // plano 1000b · CB-073
      }
    }
    if (m.tipo === "imagem" || m.tipo === "sticker") {
      // CA-086: espaço reservado enquanto a foto carrega (as dimensões do servidor quando vierem; senão 4:3) — a conversa não pula
      const w = Number(md.largura), a = Number(md.altura);
      const dims = w > 0 && a > 0 ? { width: String(w), height: String(a), style: { "aspect-ratio": `${w} / ${a}` } } : {};
      const img = h("img", { on: { load: ev => { if (ev && ev.currentTarget && ev.currentTarget.dataset) ev.currentTarget.dataset.ok = "1"; aposMidiaCarregar(); } }, src: url,
        alt: m.tipo === "sticker" ? "Figurinha" : (m.direcao === "in" ? "Foto recebida" : "Foto enviada"), loading: "lazy", decoding: "async", ...dims, dataset: dims.width ? { dims: "1" } : null });
      aoFalharMidia(img, md.path);
      if (m.tipo === "sticker") return h("div", { class: "cv-midia cv-sticker" }, img);
      return h("div", { class: "cv-midia" }, h("button", { type: "button", class: "cv-img-bt", "aria-label": "Ampliar foto", on: { click: () => abrirVisualizador(m) } }, img));
    }
    if (m.tipo === "video") {
      // CA-140: o vídeo não aparece mais preto e mudo — ▶ e a duração (quando o servidor manda) por cima, até a pessoa tocar
      const dur = Number(md.duracao) > 0 ? L.formatarDuracao(md.duracao) : "";
      const v = h("video", { src: url, controls: true, preload: "none", playsinline: true, "aria-label": dur ? `Vídeo de ${dur}` : "Vídeo" });   // plano 1000b · CB-134
      aoFalharMidia(v, md.path);
      const selo = h("span", { class: "cv-video-selo dado", "aria-hidden": "true" }, "▶ ", dur || "Vídeo");
      v.addEventListener("play", () => { selo.hidden = true; });
      const cxVideo = h("div", { class: "cv-midia cv-video" }, v, selo);
      preloadPreguicoso(v, cxVideo);
      return cxVideo;
    }
    if (m.tipo === "audio") return blocoAudio(m, url, md);
    // CA-119: documento recebido de tipo incomum (.apk, .exe, .html, .svg…) nunca abre direto numa aba: aviso e download forçado
    const incomum = !local && m.direcao === "in" && L.documentoIncomum(nome, md.mime);
    // CA-141: PDF abre para ver (nova aba, sem baixar) e o «Baixar» fica ao lado
    const pdf = !local && !incomum && (String(md.mime || "").toLowerCase() === "application/pdf" || /[.]pdf$/i.test(String(nome || "")));
    const doc = h(local ? "div" : "a", local ? { class: "cv-doc" }
      : incomum ? { class: "cv-doc cv-doc-incomum", href: url, rel: "noopener noreferrer", download: nome || "arquivo", title: "Arquivo de tipo incomum: baixe só se confia no remetente" }
        : pdf ? { class: "cv-doc", href: url, target: "_blank", rel: "noopener noreferrer", title: "Ver o PDF numa nova aba" }
          : { class: "cv-doc", href: url, target: "_blank", rel: "noopener noreferrer", download: nome || "" },
      h("span", { class: "cv-doc-ic", "aria-hidden": "true", dataset: { doc: L.grupoDocumento(nome, md.mime) } }, extensao(nome, md.mime)),
      h("span", { class: "cv-doc-txt" }, h("b", null, nome || "Documento"), h("small", null, [L.tamanhoLegivel(md.tamanho), local ? "enviando…" : pdf ? "Ver" : "Baixar"].filter(Boolean).join(" · "))));
    if (pdf) {
      return h("div", { class: "cv-doc-cx" }, doc, h("div", { class: "cv-doc-acoes" },
        h("a", { class: "bt bt-fant bt-p cv-doc-ver", href: url, target: "_blank", rel: "noopener noreferrer", "aria-label": `Ver ${nome || "o PDF"}` }, ui.icone("olho"), "Ver"),
        baixarDeVerdade(h("a", { class: "bt bt-fant bt-p cv-doc-baixar", href: url, rel: "noopener noreferrer", download: nome || "documento.pdf", "aria-label": `Baixar ${nome || "o PDF"}` }, A.icone("baixar"), "Baixar"))));   // plano 1000b · CB-034
    }
    if (!incomum) return doc;
    return h("div", { class: "cv-doc-cx" }, doc, h("p", { class: "cv-doc-aviso", role: "note" }, ui.icone("alerta"), "Arquivo de tipo incomum — baixe só se confia no remetente."));
  }

  /* ---------------- grade de fotos (32): várias fotos seguidas do mesmo remetente viram UMA bolha com miniaturas */
  function construirGrade(ln) {
    const lista = ln.msgs;
    const dir = lista[0].direcao === "in" ? "in" : "out";
    const celulas = lista.map((m, k) => {
      const r = resolverUrl(m.midia || {});
      const rot = `Ampliar foto ${k + 1} de ${lista.length}`;
      if (r.estado === "oculta") {
        return h("button", { type: "button", class: "cv-grade-cel cv-midia-sk cv-midia-mostrar", dataset: { id: m.id }, on: { click: () => liberarMidia(m.midia && m.midia.path) } }, "Mostrar");
      }
      if (!r.url) {
        // plano 1000b · CB-033: a foto que não abriu vira botão «Tentar de novo» (como a bolha simples), não um «Sem acesso» sem saída
        if (r.estado === "erro") {
          const path = m.midia && m.midia.path;
          return h("button", { type: "button", class: "cv-grade-cel cv-midia-sk cv-grade-erro", dataset: { id: m.id }, "aria-label": `Foto ${k + 1} de ${lista.length} não abriu. Tentar de novo`,
            on: { click: () => { if (path) A.midia.delete(path); renderMensagens({ rolar: "manter" }); focarBolha(m.id); } } }, ui.icone("alerta"), "Tentar de novo");
        }
        return esqueleto(h("div", { class: "cv-grade-cel cv-midia-sk", dataset: { id: m.id } }, "Carregando…"));   // plano 1000b · CB-073
      }
      const img = h("img", { src: r.url, alt: "", loading: "lazy", decoding: "async", on: { load: aposMidiaCarregar } });
      aoFalharMidia(img, m.midia && m.midia.path);
      return h("button", { type: "button", class: "cv-grade-bt cv-grade-cel", "aria-label": rot, dataset: { id: m.id }, on: { click: () => abrirVisualizador(m) } }, img);
    });
    const ult = lista[lista.length - 1];
    const bolha = h("div", { class: "cv-bolha cv-bolha-grade" }, h("div", { class: "cv-grade", dataset: { n: String(Math.min(lista.length, 6)) } }, celulas), rodape(ult));
    const quem = !ln.junta ? quemEnviou(lista[0]) : null;
    return h("div", { class: "cv-msg cv-msg-grade", dataset: { id: lista[0].id, dir, tipo: "grade", junta: ln.junta ? "1" : "0", cauda: ln.cauda ? "1" : "0", n: String(lista.length) } },
      quem ? h("div", { class: "cv-quem" }, quem) : null, bolha);
  }

  /* ---------------- linha do tempo do sistema (37): eventos seguidos (IA, transferências, atribuições) num bloco recolhível */
  const gruposAbertos = new Set();
  /* CA-231: «Eventos do sistema» à vista (padrão) ou recolhidos num traço fino com a contagem — preferência por navegador */
  function mostrarSistema() { return !(typeof A.acoes.mostrarSistema === "function" && A.acoes.mostrarSistema() === false); }
  function definirSistema(sim) {
    if (typeof A.acoes.definirMostrarSistema === "function") A.acoes.definirMostrarSistema(!!sim);
    renderMensagens({ rolar: "manter" });
    ui.anunciar(sim ? "Eventos do sistema à vista." : "Eventos do sistema recolhidos.");
  }
  /** O traço fino no lugar dos eventos (preferência desligada): tocar mostra de novo. */
  function linhaSistemaFina(msgsSis) {
    const n = msgsSis.length;
    return h("div", { class: "cv-sis-fino", dataset: { id: msgsSis[0].id, n: String(n) } },
      h("button", { type: "button", class: "cv-sis-fino-bt", title: L.rotuloGrupoSistema(msgsSis), on: { click: () => definirSistema(true) } },
        `${n} ${n === 1 ? "evento" : "eventos"} do sistema · mostrar`));
  }
  function construirGrupoSistema(ln) {
    const lista = ln.msgs, ult = lista[lista.length - 1];
    if (!mostrarSistema()) return linhaSistemaFina(lista);
    const det = h("details", { class: "cv-sis-grupo", dataset: { id: lista[0].id, n: String(lista.length) } });
    if (gruposAbertos.has(ln.chave)) det.open = true;
    det.addEventListener("toggle", () => { if (det.open) gruposAbertos.add(ln.chave); else gruposAbertos.delete(ln.chave); });
    det.append(
      // CA-115: o leitor de tela ouve «4 eventos do sistema, último: IA pausada às 14:02» (antes os dois spans colados, sem pausa)
      h("summary", { class: "cv-sis-sum", "aria-label": L.rotuloGrupoSistema(lista) },
        h("span", { class: "cv-sis-resumo" }, A.icone(L.iconeSistema(ult.corpo)), L.resumoGrupoSistema(lista)),
        h("span", { class: "cv-sis-ult" }, ult.corpo || "", h("time", { datetime: ult.criado_em }, ` · ${L.horaMsg(ult.criado_em)}`))),
      h("ol", { class: "cv-sis-lista", "aria-label": "Eventos do sistema" }, lista.map(m => h("li", { dataset: { id: m.id, icone: L.iconeSistema(m.corpo) } },
        A.icone(L.iconeSistema(m.corpo)), h("span", null, m.corpo || ""), h("time", { datetime: m.criado_em }, L.horaMsg(m.criado_em))))));
    return det;
  }

  /** Barra de progresso do envio de arquivo (bolha local): "62 %", Cancelar enquanto sobe e "Entregando…" quando já subiu. */
  function blocoProgresso(m) {
    const md = m.midia || {};
    const pct = Math.max(0, Math.min(100, Number(md.progresso) || 0));
    const entregando = md.fase === "entregando";
    const cancelavel = !entregando && A.acoes.podeCancelarEnvio(m);
    // plano 1000 · CA-116: a fase vai em aria-valuetext («62 %» / «Entregando ao WhatsApp»)
    return h("div", { class: "cv-prog", role: "progressbar", "aria-label": "Enviando arquivo", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct),
      "aria-valuetext": entregando ? "Entregando ao WhatsApp" : `${pct} %` },
      h("span", { class: "cv-prog-barra", "aria-hidden": "true" }, h("i", { style: { width: `${pct}%` } })),
      h("span", { class: "cv-prog-txt dado" }, entregando ? "Entregando…" : `${pct} %`),
      cancelavel ? h("button", { type: "button", class: "bt bt-fant bt-p cv-prog-cancel", on: { click: () => A.acoes.cancelarEnvio(m) } }, "Cancelar") : null);
  }

  function rodape(m) {
    // CA-033: a hora curta tem a data por extenso no title (conversas longas, de vários dias)
    const r = h("div", { class: "cv-rodape" }, h("time", { datetime: m.criado_em, title: L.dataLonga(m.criado_em) || null }, L.horaMsg(m.criado_em)));
    if (m.direcao === "out" && m.tipo !== "nota") { r.append(h("span", { class: "cv-st" }), h("span", { class: "cv-st-txt" })); pintarStatus(r, m); }
    return r;
  }
  /** D9: o status (◷ ✓ ✓✓ lida) muda NO LUGAR — atributos e texto do selo, sem trocar a bolha: a região de mensagens (role=log, só
      adições) não relê a bolha inteira a cada recibo. false = esta bolha não tem o selo (quem chama redesenha). */
  function pintarStatus(r, m) {
    const sp = r && r.querySelector(".cv-st"), tx = r && r.querySelector(".cv-st-txt");
    if (!sp || !tx) return false;
    const st = L.iconeStatus(m.status);
    sp.setAttribute("class", st ? `cv-st ${st.classe}` : "cv-st");
    sp.hidden = !st;
    if (st) { sp.title = st.rotulo; sp.setAttribute("aria-label", st.rotulo); } else { sp.removeAttribute("title"); sp.removeAttribute("aria-label"); }
    if (sp.textContent !== (st ? st.simbolo : "")) sp.textContent = st ? st.simbolo : "";
    const t = st && st.texto ? st.texto : "";
    if (tx.textContent !== t) tx.textContent = t;
    tx.hidden = !t;
    return true;
  }

  /** CA-143: mensagem que a API não entrega — no CodeWords dá para ver no aparelho; na Meta não há celular: pedir em texto. */
  function textoNaoSuportada(corpo) {
    const cw = A.ver && A.ver.conversa && A.ver.conversa.canal && A.ver.conversa.canal.provedor === "codewords";
    const padrao = !corpo || /veja no celular/i.test(String(corpo));
    if (cw) return corpo || "Mensagem não suportada pela API do WhatsApp — veja no celular";
    return padrao ? "O WhatsApp não entrega este tipo de mensagem (enquete, evento…). Peça ao cliente para mandar em texto." : corpo;
  }
  /** CA-142: «Abrir no mapa» (Google Maps com as coordenadas) — sem coordenadas, só o texto que já está na bolha. */
  function blocoLocalizacao(m) {
    const loc = L.localizacaoDe(m.corpo);
    if (!loc) return null;
    const url = `https://maps.google.com/?q=${encodeURIComponent(`${loc.lat},${loc.lng}`)}`;
    return h("div", { class: "cv-msg-extra" }, h("a", { class: "bt bt-sec bt-p cv-mapa", href: url, target: "_blank", rel: "noopener noreferrer", "aria-label": `Abrir no mapa${loc.nome ? `: ${loc.nome}` : ""}` }, ui.icone("globo"), "Abrir no mapa"));
  }
  function blocoContatos(m) {
    const lista = L.contatosDe(m.corpo);
    if (!lista.length) return null;
    return h("div", { class: "cv-msg-extra" }, lista.slice(0, 3).map(c => h("div", { class: "cv-contato-rec" },
      h("span", { class: "cv-contato-rec-nome" }, c.nome || ui.telBR(c.telefone)),
      h("button", { type: "button", class: "bt bt-fant bt-p", "aria-label": `Copiar o telefone de ${c.nome || "contato"}`, on: { click: () => ui.copiar(L.telefoneInternacional(c.telefone), { aviso: `Telefone copiado: ${L.telefoneInternacional(c.telefone)}` }) } }, ui.icone("copiar"), "Copiar telefone"),
      A.podeEscrever ? h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => A.acoes.novaConversa({ telefone: c.telefone, nome: c.nome }) } }, ui.icone("chat"), "Nova conversa") : null)));
  }

  function quemEnviou(m) {
    if (m.direcao !== "out" || m.tipo === "nota") return null;
    const cw = A.ver?.conversa?.canal?.provedor === "codewords";
    if (cw && m.origem === "ia") return `${A.base?.config?.ia?.assistente_nome || "Assistente"} · IA`;
    if (cw && !m.origem && !m.enviado_por) return "Pelo celular";
    if (m.origem === "automacao") return "Automação";
    if (m.origem === "fora_horario") return "Mensagem automática (fora do horário)";
    if (m.origem === "agendada") return "Mensagem agendada";
    if (m.enviado_por && A.eu && m.enviado_por.id === A.eu.id) return null;
    return m.enviado_por ? m.enviado_por.nome : null;
  }

  /** plano 1000b · CB-009: quem escreveu a mensagem citada (saída) — a IA, a automação ou a colega, não «Você» para tudo. A citada é
      procurada em A.msgs pelo id; não carregada, vale o que o responde_a trouxer (origem/enviado_por) e, sem isso, «Equipe». */
  function autorCitada(ra) {
    const orig = (A.msgs || []).find(x => String(x.id) === String(ra.id)) || (ra.origem || ra.enviado_por ? { direcao: "out", ...ra } : null);
    if (!orig) return "Equipe";
    const q = quemEnviou(orig);
    if (q) return q;
    if (orig.origem === "ia") return "IA";
    if (orig.enviado_por && A.eu && orig.enviado_por.id === A.eu.id) return "Você";
    return "Equipe";
  }

  function construirMsg(ln) {
    const m = ln.msg;
    if (m.tipo === "sistema") {
      if (!mostrarSistema()) return linhaSistemaFina([m]);
      const ic = L.iconeSistema(m.corpo);
      return h("div", { class: "cv-sis", dataset: { id: m.id, icone: ic } }, h("span", null, A.icone(ic, "cv-sis-ic"), m.corpo || "", h("time", { datetime: m.criado_em }, ` · ${L.horaMsg(m.criado_em)}`)));
    }
    const dir = m.direcao === "in" ? "in" : "out";
    const bolha = h("div", { class: "cv-bolha" });
    if (m.tipo === "nota") {
      // plano 1000 · CA-153: cadeado e «Só a equipe» à vista (no tema escuro a cor sozinha não bastava para saber que não foi ao cliente)
      bolha.appendChild(h("div", { class: "cv-nota-rot" }, ui.icone("cadeado"), `Nota interna · ${(m.enviado_por && m.enviado_por.nome) || "equipe"}`,
        h("span", { class: "cv-nota-so" }, "Só a equipe")));
    }
    if (m.referral && dir === "in") {
      const ref = m.referral;
      bolha.appendChild(h("div", { class: "cv-nota-rot cv-rot-anuncio" }, ui.icone("anuncio"),
        `Veio do anúncio${ref.headline ? ` «${ref.headline}»` : ""}`));
    }
    if (m.tipo === "template") {
      bolha.appendChild(h("div", { class: "cv-nota-rot cv-rot-modelo" }, A.icone("modelo"), `Modelo${m.template && m.template.nome ? ` «${m.template.nome}»` : ""}`));
    }
    if (m.responde_a) {
      const ra = m.responde_a;
      // CA-009: citação de mensagem que não está carregada vai buscá-la (páginas anteriores) e só então destaca
      const cita = h("button", { type: "button", class: "cv-cita", dataset: { dir: ra.direcao === "in" ? "in" : "out" }, on: { click: () => irParaCitada(ra.id) } },
        h("b", null, ra.direcao === "in" ? A.acoes.nomeContato(A.ver && A.ver.contato) || "Cliente" : autorCitada(ra)), ra.resumo || "Mensagem");
      bolha.appendChild(cita);
    }
    if (["imagem", "video", "audio", "documento", "sticker"].includes(m.tipo)) bolha.appendChild(blocoMidia(m));
    if (m.local && m.status === "pendente" && m.midia && m.midia.estado === "enviando") bolha.appendChild(blocoProgresso(m));
    // CA-143: «veja no celular» só vale no CodeWords (aparelho); na Meta não há celular — o texto diz o que fazer
    const texto = m.tipo === "desconhecido" ? textoNaoSuportada(m.corpo) : m.corpo;
    if (texto) {
      const t = h("div", { class: ["cv-texto", m.tipo === "desconhecido" && "cv-texto-fraco"] }, textoFormatado(texto));
      bolha.appendChild(t);
    }
    // CA-142: localização com «Abrir no mapa»; contato com «Copiar telefone» e «Nova conversa»
    if (m.tipo === "localizacao") { const x = blocoLocalizacao(m); if (x) bolha.appendChild(x); }
    if (m.tipo === "contato") { const x = blocoContatos(m); if (x) bolha.appendChild(x); }
    bolha.appendChild(rodape(m));
    // CA-034: a reação tem nome para o leitor de tela (não só o emoji solto)
    if (m.reacao) bolha.appendChild(h("span", { class: "cv-reacao", role: "img", title: "Reação do cliente", "aria-label": `Reação do cliente: ${m.reacao}` }, m.reacao));

    const quem = !ln.junta ? quemEnviou(m) : null;
    const box = h("div", { class: ["cv-msg", m.local && "cv-local-env"], dataset: { id: m.id, dir, tipo: m.tipo, junta: ln.junta ? "1" : "0", cauda: ln.cauda === false ? "0" : "1" } },
      quem ? h("div", { class: "cv-quem" }, quem) : null, bolha);
    // ações da bolha (hover/foco no desktop, toque longo no celular): responder e copiar o texto
    const acoesMsg = h("div", { class: "cv-msg-acoes" });
    const itensMenu = [];
    if (A.podeEscrever && !m.local && m.tipo !== "nota" && m.wamid) {
      acoesMsg.appendChild(h("button", { type: "button", class: "bt-icone cv-responder", "aria-label": "Responder a esta mensagem", title: "Responder",
        on: { click: () => A.composer.responder(m) } }, A.icone("responder")));
      itensMenu.push({ rotulo: "Responder", icone: "responder", fn: () => A.composer.responder(m) });
    }
    // CA-144: no número do CodeWords (aparelho) não existe responder citando — o menu de toque diz isso em vez de a opção sumir sem explicação
    const semCitacao = A.podeEscrever && !m.local && m.tipo !== "nota" && !m.wamid && m.tipo !== "sistema" && A.ver && A.ver.conversa && A.ver.conversa.canal && A.ver.conversa.canal.provedor === "codewords";
    if (semCitacao) itensMenu.push({ rotulo: "Responder citando (este número não envia citação)", icone: "responder", desabilitado: true });
    if (m.corpo && m.tipo !== "desconhecido" && A.acoes.copiarTexto) {
      acoesMsg.appendChild(h("button", { type: "button", class: "bt-icone cv-copiar", "aria-label": "Copiar o texto da mensagem", title: "Copiar texto",
        on: { click: () => A.acoes.copiarTexto(m) } }, ui.icone("copiar")));
      itensMenu.push({ rotulo: "Copiar texto", icone: "copiar", fn: () => A.acoes.copiarTexto(m) });
    }
    let toque = false;
    try { toque = matchMedia("(pointer: coarse)").matches; } catch { toque = false; }
    if (acoesMsg.childNodes.length) {
      box.appendChild(acoesMsg);
      if (toque && typeof ui.toqueLongo === "function" && typeof ui.menu === "function") {
        try { ui.toqueLongo(bolha, () => ui.menu(bolha, itensMenu)); } catch { /* sem toque longo a barra lateral continua valendo */ }
      }
    } else if (semCitacao && toque && typeof ui.toqueLongo === "function" && typeof ui.menu === "function") {
      try { ui.toqueLongo(bolha, () => ui.menu(bolha, itensMenu)); } catch { /* ok */ }
    }
    // CA-110: no toque as setas somem (CSS) e deslizar a bolha para a direita responde citando, como no WhatsApp
    if (toque && A.podeEscrever && !m.local && m.tipo !== "nota" && m.wamid && typeof ui.deslizar === "function") {
      try { ui.deslizar(bolha, { direita: () => A.composer.responder(m) }); } catch { /* sem gesto: o toque longo responde */ }
    }
    // M36: a fila de saída — "Na fila", "tentando de novo" (prazo estourado: o servidor não deixa sair em dobro) e a falha definitiva logo abaixo
    if (m.local && (m.filaEstado === "fila" || m.filaEstado === "incerto")) {
      // o texto diz o motivo REAL (internet, servidor ocupado, sessão) e a hora da próxima tentativa: a pessoa não procura problema no próprio wifi
      const fila = h("div", { class: "cv-fila", role: "status" },
        h("span", { class: "cv-fila-t" }, ui.icone("relogio"), h("span", { class: "cv-fila-txt" }, L.textoFila({ estado: m.filaEstado, motivo: m.erro, proxima: m.filaProxima }))));
      if (m.filaEstado === "fila" && A.podeEscrever) {
        // D10: sem internet ou dentro dos 90 s do último pedido, «Enviar agora» fica desligado e diz por quê (antes o clique não fazia nada)
        const est = typeof A.acoes.estadoEnviarAgora === "function" ? A.acoes.estadoEnviarAgora(m) : { motivo: "", espera: 0 };
        const idMot = `cv-fila-mot-${String(m.id).replace(/[^\w-]/g, "")}`;
        fila.append(...[h("button", { type: "button", class: "bt bt-fant bt-p cv-fila-agora", disabled: !!est.motivo, "aria-describedby": est.motivo ? idMot : null, title: est.motivo || null,
          on: { click: () => A.acoes.enviarAgora(m) } }, "Enviar agora"),
          h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => A.acoes.cancelarFila(m) } }, "Cancelar"),
          est.motivo ? h("span", { class: "cv-fila-motivo", id: idMot }, est.motivo) : null].filter(Boolean));
        if (est.espera > 0) agendarLiberacao(est.espera);
      }
      box.appendChild(fila);
    }
    const ambigua = m.ambigua === true || (m.status === "pendente" && /^status incerto:/i.test(String(m.erro || "")));
    if (m.status === "falhou" || (m.status === "pendente" && ambigua)) {
      const erro = ambigua
        ? "Pode ter saído — confira no WhatsApp antes de reenviar."
        : m.erro || "O canal não aceitou a mensagem.";
      // plano 1000b · CB-021: role=alert só para a falha NOVA nesta sessão (bolha local ou falha que surgiu depois de a conversa abrir);
      // as antigas, desenhadas ao abrir, não disparam 3 alertas seguidos no leitor
      const nova = m.local || (ultimoRenderId !== null && !falhasVistas.has(String(m.id)));
      if (!m.local) falhasVistas.add(String(m.id));
      const falha = h("div", { class: "cv-falha", role: nova ? "alert" : null }, h("span", null,
        h("b", null, ambigua ? "Status incerto: " : "Não enviada: "), erro));
      if (ambigua) {
        falha.classList.add("cv-falha-ambigua");
        // item da fila em dúvida (o servidor não tem a mensagem gravada): nunca sai sozinho; depois de conferir no WhatsApp, a pessoa decide
        if (m.local && m.ref && m.filaEstado === "ambigua" && A.podeEscrever) {
          falha.append(h("button", { type: "button", class: "bt bt-sec", on: { click: () => A.acoes.reenviarLocal(m) } }, "Enviar de novo"),
            h("button", { type: "button", class: "bt bt-fant", on: { click: () => A.acoes.descartarLocal(m) } }, "Descartar"));
        } else if (m.local && m.pedido && m.pedido.client_ref && A.podeEscrever) {
          // D8: modelo ou arquivo com client_ref — repetir usa o MESMO ref: se o primeiro saiu, o servidor devolve o que gravou (nada sai em dobro)
          falha.append(h("button", { type: "button", class: "bt bt-sec", title: "Se a primeira tentativa saiu, nada é enviado de novo", on: { click: () => A.acoes.reenviarLocal(m) } }, "Enviar de novo"),
            h("button", { type: "button", class: "bt bt-fant", on: { click: () => A.acoes.descartarLocal(m) } }, "Descartar"));
        }
      } else if (m.falhaLocal && m.pedido) {
        falha.append(h("button", { type: "button", class: "bt bt-sec", on: { click: () => A.acoes.reenviarLocal(m) } }, "Tentar de novo"),
          h("button", { type: "button", class: "bt bt-fant", on: { click: () => A.acoes.descartarLocal(m) } }, "Descartar"));
      } else if (A.podeEscrever && m.tipo === "texto" && m.corpo && !A.acoes.foiReenviada(m)) {
        // falha gravada pelo servidor: pede o reenvio da PRÓPRIA mensagem (o texto gravado já tem a assinatura; como texto novo ela sairia em dobro)
        falha.append(h("button", { type: "button", class: "bt bt-sec", on: { click: () => A.acoes.reenviarGravada(m) } }, "Tentar de novo"));
      } else if (A.podeEscrever && !m.local && ["imagem", "video", "audio", "documento", "sticker"].includes(m.tipo)) {
        // plano 1000b · CB-078: foto/arquivo que o servidor gravou como falha não tem reenvio pronto (o arquivo não está mais aqui) —
        // diz o caminho e abre o clipe do composer
        falha.append(h("span", { class: "cv-falha-dica" }, " Anexe o arquivo de novo."),
          h("button", { type: "button", class: "bt bt-sec cv-anexar-de-novo", on: { click: () => { if (A.composer && typeof A.composer.escolherArquivo === "function") A.composer.escolherArquivo(); } } }, "Anexar de novo"));
      }
      box.appendChild(falha);
    }
    return box;
  }

  function assinatura(ln) {
    const m = ln.msg;
    const md = m.midia || {};
    const urlOk = md.path ? A.acoes.estadoMidia(md.path) : "";
    const fila = m.local && m.filaEstado === "fila" && typeof A.acoes.estadoEnviarAgora === "function" ? A.acoes.estadoEnviarAgora(m).motivo : "";
    return [m.status === "falhou" ? "falhou" : "-", m.erro, m.ambigua, fila, m.local && m.pedido && m.pedido.client_ref ? 1 : 0, m.filaEstado, /* plano 1000b · CB-022: filaProxima fora — o texto muda no lugar */ !m.local && m.status === "falhou" && A.acoes.foiReenviada(m) ? 1 : 0, m.origem, m.reacao, ln.junta, md.estado, /* plano 1000b · CB-140: progresso fora — muda no lugar (pintarProgresso) */ md.fase, m.local && A.acoes.podeCancelarEnvio(m) ? 1 : 0, urlOk, m.corpo && m.corpo.length, m.local ? 1 : 0,
      m.responde_a && m.responde_a.id, m.enviado_por && m.enviado_por.nome, md.path && bloqueada(md.path) ? 1 : 0, m.tipo === "sistema" && !mostrarSistema() ? "fino" : ""].join("|");
  }

  function construirLinha(ln) {
    // plano 1000b · CB-020: separator tem filhos apresentacionais (o texto do span não é lido) — o rótulo vai no aria-label, como o «Mensagens novas»
    if (ln.tipo === "dia") return h("div", { class: "cv-dia", role: "separator", "aria-label": ln.rotulo, dataset: { hoje: ln.rotulo === "Hoje" ? "1" : "0" } }, h("span", null, ln.rotulo));
    if (ln.tipo === "atendimento") {
      const c = ln.conversa;
      const quando = c.aberta_em ? `aberto em ${ui.dataHoraBR(c.aberta_em)}` : "";
      // plano 1000b · CB-077: sem protocolo, «Atendimento de 08/10 14:02» (antes: «Atendimento  · aberto em…», com espaço duplo)
      if (!c.protocolo) {
        const rot = c.aberta_em ? `Atendimento de ${ui.dataHoraBR(c.aberta_em)}` : "Atendimento";
        return h("div", { class: "cv-atend", role: "separator", "aria-label": rot }, h("span", null, rot));
      }
      return h("div", { class: "cv-atend", role: "separator", "aria-label": [`Atendimento ${c.protocolo}`, quando].filter(Boolean).join(", ") },
        h("span", null, "Atendimento ", h("b", null, c.protocolo), quando ? ` · ${quando}` : ""));
    }
    if (ln.tipo === "novas") return h("div", { class: "cv-novas-sep", role: "separator", "aria-label": "Mensagens novas" }, h("span", null, "Mensagens novas"));
    if (ln.tipo === "grade") return construirGrade(ln);
    if (ln.tipo === "sistema_grupo") return construirGrupoSistema(ln);
    return construirMsg(ln);
  }

  /** Assinatura de qualquer linha: muda → a linha é redesenhada. */
  function assinaturaLinha(ln) {
    if (ln.tipo === "msg") return `${assinatura(ln)}|${ln.cauda === false ? 0 : 1}`;
    if (ln.tipo === "dia") return ln.rotulo;
    if (ln.tipo === "atendimento") return `${ln.conversa.protocolo}|${ln.conversa.aberta_em}`;
    if (ln.tipo === "grade") return `g|${ln.junta ? 1 : 0}|${ln.cauda ? 1 : 0}|${ln.msgs.map(m => `${m.id}:${m.status}:${m.midia && m.midia.path ? `${A.acoes.estadoMidia(m.midia.path)}${bloqueada(m.midia.path) ? "!" : ""}` : "l"}`).join(",")}`;
    if (ln.tipo === "sistema_grupo") return `s|${mostrarSistema() ? 1 : 0}|${ln.msgs.map(m => `${m.id}:${m.corpo}`).join("|")}`;
    return ln.tipo;
  }

  function renderTopo() {
    // plano 1000b · CB-128: o foco que estava no topo (clicou em «Ver mensagens anteriores») continua no topo depois de carregar — antes o
    // botão virava um status e o foco caía no body
    const tinhaFoco = topoHist.contains(document.activeElement);
    ui.limpar(topoHist);
    if (A.carregandoAntes) topoHist.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p", "aria-busy": "true", "aria-disabled": "true" }, "Carregando mensagens anteriores…"));
    // plano 1000b · CB-051: a página anterior falhou — o topo diz e oferece tentar de novo (a rolagem espera 10 s)
    else if (A.temMaisAntes && A.falhaAntes && A.ver && A.ver.conversa && A.falhaAntes.id === A.ver.conversa.id) topoHist.appendChild(h("span", { class: "cvc-antes-falhou" },
      h("span", { class: "sub" }, "Não carregou · "), h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => A.acoes.carregarAntes({ forcar: true }) } }, "Tentar de novo")));
    else if (A.temMaisAntes) topoHist.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => A.acoes.carregarAntes() } }, "Ver mensagens anteriores"));
    else if (A.msgs.length) topoHist.appendChild(h("span", { class: "rotulo" }, "Início do histórico"));
    if (tinhaFoco) {
      const alvo = topoHist.querySelector("button");
      if (!alvo) topoHist.setAttribute("tabindex", "-1");
      try { (alvo || topoHist).focus({ preventScroll: true }); } catch { /* ok */ }
    }
  }

  /** rolar: 'fim' (abrir/enviar) · 'novas' (delta: só desce se já estava no fim) · 'manter' · 'anterior' (mantém a âncora ao inserir acima) */
  function renderMensagens({ rolar = "manter" } = {}) {
    if (A.destruido || !A.ver) return;
    const estavaNoFim = noFim();
    const alturaAntes = msgs.scrollHeight, topoAntes = msgs.scrollTop;
    // plano 50: cauda só na última bolha do grupo, fotos seguidas em grade, eventos do sistema agrupados e o separador «Mensagens novas»
    let linhas = L.marcarCaudas(L.montarLinhas(A.msgs, A.conversasContato));
    // o separador entra ANTES de agrupar: ele fecha a grade de fotos (e o bloco do sistema), então lidas e não lidas nunca dividem a mesma grade
    if (A.marcaNovas !== null && A.marcaNovas !== undefined) linhas = L.inserirNovas(linhas, A.marcaNovas);
    linhas = L.agruparSistema(L.agruparMidia(linhas));
    const vivos = new Set();
    const ordem = [];
    for (const ln of linhas) {
      const chave = ln.tipo === "msg" ? `m-${ln.msg.id}` : ln.chave;
      const sig = assinaturaLinha(ln);
      const est = ln.tipo === "msg" ? `${ln.msg.status}|${ln.msg.atualizado_em}` : "";
      let x = cache.get(chave);
      // D9: só o status mudou (◷ → ✓ → ✓✓): o selo muda no lugar e a bolha continua a mesma
      if (x && x.sig === sig && x.est !== est && pintarStatus(x.el.querySelector(".cv-rodape"), ln.msg)) x.est = est;
      else if (!x || x.sig !== sig || x.est !== est) {
        const novo = construirLinha(ln);
        if (!x && ultimoRenderId !== null && (ln.tipo === "msg" || ln.tipo === "grade")) novo.classList.add("entra");
        if (x && x.el.isConnected) x.el.replaceWith(novo);
        x = { el: novo, sig, est };
        cache.set(chave, x);
      }
      // plano 1000b · CB-022: «Na fila · nova tentativa às…» muda no MESMO nó (role=status não é recriado nem relido a cada backoff)
      if (ln.tipo === "msg" && ln.msg.local) {
        const ft = x.el.querySelector(".cv-fila-txt");
        if (ft) { const t = L.textoFila({ estado: ln.msg.filaEstado, motivo: ln.msg.erro, proxima: ln.msg.filaProxima }); if (ft.textContent !== t) ft.textContent = t; }
      }
      vivos.add(chave);
      ordem.push(x.el);
    }
    for (const [k, x] of cache) if (!vivos.has(k)) { x.el.remove(); cache.delete(k); }
    // CA-095: com 2.000 mensagens a checagem era quadrática (ordem.includes); com o Set é linear, e só reposiciona do 1º nó fora do lugar
    const naOrdem = new Set(ordem);
    for (const n of [...trilho.children]) if (!naOrdem.has(n)) n.remove();
    const filhos = trilho.children;
    let i0 = 0;
    while (i0 < ordem.length && filhos[i0] === ordem[i0]) i0++;
    for (let i = i0; i < ordem.length; i++) { const node = ordem[i]; if (trilho.children[i] !== node) trilho.insertBefore(node, trilho.children[i] || null); }
    if (!linhas.length) {
      ui.limpar(trilho);
      trilho.appendChild(h("div", { class: "cvc-trilho-vazio" }, ui.vazio({ titulo: "Nenhuma mensagem ainda neste atendimento.", texto: "O que o cliente mandar e o que a equipe responder aparece aqui.", icone: "chat", tema: "conversas" })));
    }
    // plano 1000b · CB-073: quantas mídias ainda carregam (o conjunto guarda as que nasceram «carregando»; as que saíram da tela caem)
    { let nSk = 0; for (const e of esqueletos) { if (e.isConnected) nSk++; else esqueletos.delete(e); }
      const t = nSk >= 3 ? `Carregando ${nSk} mídias…` : "";
      if (avisoMidias.textContent !== t) avisoMidias.textContent = t; }
    soltarPreloadForaDaTela();   // revisão 1000b · CB-134
    renderTopo();
    const ult = A.L.ultimoId(A.msgs);
    if (rolar === "fim" || (rolar === "novas" && estavaNoFim)) grudarFimAte = Date.now() + 2500;
    if (rolar === "fim") requestAnimationFrame(() => rolarFim(false));
    else if (rolar === "separador") {
      // CA-087: muitas não lidas — a conversa abre no separador «Mensagens novas» (lendo de cima) e a pílula leva ao fim
      grudarFimAte = 0;
      requestAnimationFrame(() => {
        const sep = trilho.querySelector(".cv-novas-sep");
        if (!sep) { rolarFim(false); return; }
        try { sep.scrollIntoView({ block: "start" }); } catch { /* ok */ }
        novasTxt.textContent = "Ir para o fim";
        novas.hidden = false;
        vigiarUltima();
      });
    }
    else if (rolar === "anterior") msgs.scrollTop = topoAntes + (msgs.scrollHeight - alturaAntes);
    else if (rolar === "novas") {
      if (estavaNoFim) requestAnimationFrame(() => rolarFim(true));
      else if (ult !== null && ultimoRenderId !== null && ult > ultimoRenderId) {
        // a pílula diz QUANTAS mensagens do cliente chegaram desde que a pessoa parou de olhar o fim
        novasDesde = novasDesde === null ? ultimoRenderId : novasDesde;
        const n = L.contarNovasEntradas(A.msgs, novasDesde);
        novasTxt.textContent = n > 0 ? `${n} ${n === 1 ? "nova mensagem" : "novas mensagens"}` : "Novas mensagens";
        novas.hidden = false;
        vigiarUltima();
      }
    }
    if (novas.hidden) { novasDesde = null; if (vigiando) pararDeVigiar(); }
    ultimoRenderId = ult;
  }
  let novasDesde = null;

  /* D10: «Enviar agora» que esperava os 90 s volta a valer sozinho (um redesenho quando o prazo vence) */
  let tLiberarEnvio = null, liberarEm = 0;
  function agendarLiberacao(espera) {
    const em = Date.now() + Math.max(0, Number(espera) || 0) + 150;
    if (tLiberarEnvio && liberarEm <= em) return;
    clearTimeout(tLiberarEnvio); tLiberarEnvio = null; liberarEm = 0;
    liberarEm = em;
    tLiberarEnvio = setTimeout(() => { tLiberarEnvio = null; liberarEm = 0; if (!A.destruido) renderMensagens({ rolar: "manter" }); }, em - Date.now());
  }
  /** D20: ✓ de sucesso na pílula «Resolvida» (ui.checkSucesso da frente A, por detecção). */
  function sucesso(texto) {
    const alvoOk = faixa.querySelector(".cv-pil-resolvida") || faixa.querySelector(".cv-pil-status");
    if (alvoOk && typeof ui.checkSucesso === "function") { try { ui.checkSucesso(alvoOk, { texto }); } catch { /* sem o ✓, o aviso continua */ } }
  }

  /** plano 1000b · CB-140: o progresso do envio muda NO LUGAR (largura, texto e aria) — antes cada tique (até 8/s) redesenhava a conversa
      inteira (montarLinhas). false = a bolha não tem a barra (quem chama redesenha). */
  function pintarProgresso(id, pct) {
    const b = bolhaDe(id);
    const pr = b && b.querySelector(".cv-prog");
    if (!pr || pr.getAttribute("aria-valuetext") === "Entregando ao WhatsApp") return false;
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    pr.setAttribute("aria-valuenow", String(p));
    pr.setAttribute("aria-valuetext", `${p} %`);
    const i = pr.querySelector(".cv-prog-barra i");
    if (i) i.style.setProperty("width", `${p}%`);
    const t = pr.querySelector(".cv-prog-txt");
    if (t) t.textContent = `${p} %`;
    return true;
  }
  /** plano 1000b · CB-128: «Tentar de novo» da mídia recria a bolha — o foco vai para a bolha nova (o botão dela, ou ela mesma), não ao body. */
  function focarBolha(id) {
    const b = bolhaDe(id);
    if (!b) return;
    const alvo = b.querySelector(`.cv-grade-erro[data-id="${escaparSel(id)}"], .cv-midia-off button`) || null;
    if (!alvo) b.setAttribute("tabindex", "-1");
    try { (alvo || b).focus({ preventScroll: true }); } catch { /* ok */ }
  }
  function bolhaDe(id) {
    const direto = trilho.querySelector(`.cv-msg[data-id="${escaparSel(id)}"]`);
    const naGrade = !direto && trilho.querySelector(`.cv-grade-bt[data-id="${escaparSel(id)}"]`);
    return direto || (naGrade && naGrade.closest ? naGrade.closest(".cv-msg") : null);
  }
  /** CA-009: a citação aponta para uma mensagem já na tela (destaca) ou mais antiga (a central carrega as páginas anteriores até achar). */
  function irParaCitada(id) {
    if (bolhaDe(id) || typeof A.acoes.irParaMensagem !== "function") { destacar(id); return; }
    ui.anunciar("Procurando a mensagem citada…");
    topoHist.dataset.procurando = "1";
    Promise.resolve(A.acoes.irParaMensagem(id)).finally(() => { delete topoHist.dataset.procurando; });
  }
  function destacar(id) {
    const alvo = bolhaDe(id);
    if (!alvo) { ui.toast("Não achamos essa mensagem nas mais recentes. Ela pode ser de um atendimento antigo deste contato.", { tipo: "info" }); return; }
    alvo.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    alvo.dataset.destaque = "1";
    setTimeout(() => { delete alvo.dataset.destaque; }, 1600);
  }

  function renderTudo({ rolar = "fim" } = {}) {
    cache.clear();
    players.clear();
    clearTimeout(tLiberarEnvio); tLiberarEnvio = null; liberarEm = 0;
    sigCab = null;
    // CA-006: o desenho inicial não é «adição» para o leitor de tela — a região fica ocupada e só volta a falar no próximo quadro;
    // no lugar do histórico inteiro, uma frase curta diz qual conversa abriu
    msgs.setAttribute("aria-busy", "true");
    ui.limpar(trilho);
    ultimoRenderId = null;
    falhasVistas.clear();   // plano 1000b · CB-021
    novas.hidden = true; novasDesde = null; pararDeVigiar();
    gruposAbertos.clear();
    if (visualizador) { try { visualizador.fechar(); } catch { /* ok */ } }
    renderCabecalho();
    if (A.composer.el.parentNode !== el) el.appendChild(A.composer.el);
    modo("conversa");
    renderMensagens({ rolar });
    requestAnimationFrame(() => { if (!A.destruido) msgs.setAttribute("aria-busy", "false"); });
    const conv = A.ver && A.ver.conversa;
    if (conv) {
      const nome = A.acoes.nomeContato(A.ver.contato || conv.contato) || "contato";
      const n = Number(conv.nao_lidas) || 0;
      ui.anunciar(`Conversa com ${nome}${n ? `, ${n} ${n === 1 ? "mensagem nova" : "mensagens novas"}` : ""}.`);
    }
  }

  if (A.composer && A.composer.el) el.appendChild(A.composer.el);

  return {
    el, mostrarVazio, mostrarCarregando, mostrarErro, renderCabecalho, renderMensagens, renderTudo, renderTopo, destacar, pintarProgresso,   // CB-140
    noFim, rolarFim, estadoAcoes, abrirVisualizador, sucesso, mostrarAtraso, esconderAtraso, temBolha: id => !!bolhaDe(id),
    abrirEtiquetas, mostrarLento, // plano 1000 · CA-158 (Alt+Shift+E) e CA-105 (rede lenta ao abrir)
    /** D9: quantos players de áudio a tela segura (testes: a troca de conversa solta os da anterior). */
    contarPlayers: () => players.size,
    desmontar() { if (obsPreload) { try { obsPreload.disconnect(); } catch { /* ok */ } obsPreload = null; } clearTimeout(tLiberarEnvio); tLiberarEnvio = null; liberarEm = 0; players.clear(); if (visualizador) { try { visualizador.fechar(); } catch { /* ok */ } } },
    get visualizador() { return visualizador; },
    focarMensagens() { try { msgs.focus({ preventScroll: true }); } catch { /* ok */ } },
  };
}
