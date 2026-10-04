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
  const corpo = h("div", { class: "cvc-corpo" }, msgs, novas, arrastar);
  const vazio = h("div", { class: "cvc-vazio" });
  const el = h("div", { class: "cvc" }, vazio, cab, faixa, corpo);

  novas.addEventListener("click", () => { rolarFim(true); novas.hidden = true; });

  /* ---------------- rolagem */
  let grudarFimAte = 0;      // até quando uma mídia que termina de carregar deve manter a conversa no fim (a imagem só ganha altura ao carregar)
  const aposMidiaCarregar = () => { if (Date.now() < grudarFimAte) msgs.scrollTop = msgs.scrollHeight; };
  function noFim() { return msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80; }
  function rolarFim(suave) {
    if (suave && !matchMedia("(prefers-reduced-motion: reduce)").matches) msgs.scrollTo({ top: msgs.scrollHeight, behavior: "smooth" });
    else msgs.scrollTop = msgs.scrollHeight;
  }
  msgs.addEventListener("scroll", () => {
    if (msgs.scrollTop < 140 && A.temMaisAntes && !A.carregandoAntes) A.acoes.carregarAntes();
    if (noFim()) novas.hidden = true;
  }, { passive: true });

  /* ---------------- arrastar arquivo para o chat */
  let contaDrag = 0;
  const temArquivo = ev => ev.dataTransfer && [...(ev.dataTransfer.types || [])].includes("Files");
  corpo.addEventListener("dragenter", ev => { if (!temArquivo(ev) || !A.composer.aceitaAnexo()) return; ev.preventDefault(); contaDrag++; arrastar.hidden = false; });
  corpo.addEventListener("dragover", ev => { if (!temArquivo(ev) || !A.composer.aceitaAnexo()) return; ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; });
  corpo.addEventListener("dragleave", () => { contaDrag = Math.max(0, contaDrag - 1); if (!contaDrag) arrastar.hidden = true; });
  corpo.addEventListener("drop", ev => {
    if (!temArquivo(ev)) return;
    ev.preventDefault(); contaDrag = 0; arrastar.hidden = true;
    const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) A.composer.anexar(f);
  });

  /* ---------------- estados */
  function modo(m) {
    vazio.hidden = m !== "vazio";
    cab.hidden = m === "vazio";
    faixa.hidden = m !== "conversa";
    corpo.hidden = m === "vazio";
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
    const tit = semCanal
      ? h("h2", null, "Conecte o ", h("em", null, "WhatsApp"), " da empresa.")
      : ag ? h("h2", null, h("em", null, String(ag)), ag === 1 ? " cliente espera resposta." : " clientes esperam resposta.")
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
    trilho.appendChild(ui.esqueleto("lista", 5));
    cache.clear();
    modo("carregando");
  }

  function mostrarErro(e, tentar) {
    ui.limpar(vazio);
    vazio.appendChild(h("div", { class: "cvc-vazio-in" }, ui.erroCartao(e, tentar),
      matchMedia("(max-width: 760px)").matches ? h("button", { type: "button", class: "bt bt-sec", on: { click: () => A.acoes.voltar() } }, "Voltar à lista") : null));
    modo("vazio");
  }

  /* ---------------- cabeçalho */
  function renderCabecalho() {
    if (!A.ver || !A.ver.conversa) return;
    const conv = A.ver.conversa, ct = A.ver.contato || conv.contato || {};
    const nome = A.acoes.nomeContato(ct);
    const eu = A.eu && A.eu.id;
    const jan = L.janela(conv);
    ui.limpar(cab);
    const voltar = h("button", { type: "button", class: "bt-icone cvc-voltar", "aria-label": "Voltar à lista", on: { click: () => A.acoes.voltar() } }, ui.icone("seta-esq"));
    const canal = conv.canal ? `via ${conv.canal.nome}` : "número removido";
    const quem = h("button", { type: "button", class: "cvc-quem", title: "Abrir a ficha", on: { click: () => A.ctx.abrirContato(ct.id, { aoMudar: () => A.acoes.recarregarVer() }) } },
      ui.avatar(nome, ct.id),
      h("span", { class: "cvc-quem-txt" },
        h("span", { class: "cvc-nome" }, nome),
        h("span", { class: "cvc-sub" },
          ct.telefone ? h("span", null, ui.telBR(ct.telefone)) : null,
          h("i", { class: "cvc-via-sep" }, "·"), h("span", { class: "cvc-via" }, canal),
          h("i", { class: "cvc-proto-sep" }, "·"), h("span", { class: "mono" }, conv.protocolo || ""))));

    // faixa de situação: UMA pílula com dono + departamento; janela e IA ao lado; avisos só quando existem
    ui.limpar(faixa);
    const provedorCanal = (conv.canal && conv.canal.provedor) || ((A.base && A.base.canais) || []).find(k => k.id === conv.canal_id)?.provedor || "meta";
    const codeWords = provedorCanal === "codewords";
    const ia = codeWords ? A.iaEstado : null;
    const dono = conv.atribuida ? `Com ${conv.atribuida.nome}` : conv.atribuida_nome ? `Com ${conv.atribuida_nome}` : "Sem dono";
    const semDono = dono === "Sem dono";
    faixa.appendChild(ui.pilula(conv.departamento ? `${dono} · ${conv.departamento.nome}` : dono, semDono && conv.status !== "resolvida" ? "aten" : "neutra",
      { icone: "usuario", class: "cv-pil-status", title: conv.departamento ? `${dono} · departamento ${conv.departamento.nome}` : dono }));
    // o aparelho do CodeWords não tem janela de 24 h: nada de «Janela aberta/fechada» nesse canal
    if (conv.status !== "resolvida" && L.canalTemJanela(provedorCanal)) {
      const pj = ui.pilula("", jan.nivel === "aberta" ? "ok" : jan.nivel === "acabando" ? "aten" : "ruim",
        { icone: "relogio", class: "cv-janela", title: jan.ate ? `${jan.texto}. Até ${ui.dataHoraBR(jan.ate)}` : "O cliente ainda não mandou mensagem neste número" });
      pj.append(h("span", { class: "so-largo-txt" }, jan.texto), h("span", { class: "so-curto-txt" }, L.janelaCurta(jan)));
      // plano 50: barrinha com o que resta das 24 h (a cor acompanha a pílula)
      pj.appendChild(h("i", { class: "cv-janela-barra", "aria-hidden": "true", style: { "--pct": String(Math.round(L.fracaoJanela(jan) * 1000) / 1000) } }));
      faixa.appendChild(pj);
    } else if (conv.status === "resolvida") faixa.appendChild(ui.pilula("Resolvida", "neutra", { icone: "check" }));
    if (conv.status === "pendente") faixa.appendChild(ui.pilula("Pendente", "aten"));
    if (conv.oculta) faixa.appendChild(ui.pilula("Oculta · contato bloqueado", "ruim", { icone: "alerta" }));
    if (ct.optin_marketing === false) faixa.appendChild(ui.pilula("Não quer marketing", "aten", { title: "Pediu para não receber mensagens de marketing" }));
    if (codeWords) {
      let rotuloIA = "Verificando IA…", curtoIA = "", corIA = "neutra", dicaIA = "";
      if (ia && !ia.ia_ligada) {
        rotuloIA = "IA desligada no canal"; corIA = "neutra";
      } else if (ia?.disponivel === false) {
        rotuloIA = "IA indisponível"; corIA = "aten"; dicaIA = ia.erro || "Confira a configuração do canal CodeWords.";
      } else if (ia) {
        if (ia.pausada) {
          const autor = ia.pausada_por === "celular" ? "mensagem pelo celular" : `${ia.pausada_por_nome || "você"} assumiu`;
          let hora = "";
          if (!ia.so_manual && ia.pausada_ate) {
            try { hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(ia.pausada_ate)); } catch { /* estado continua legível */ }
          }
          rotuloIA = ia.so_manual ? `IA pausada — retorno manual` : `IA pausada até ${hora || "em breve"} — ${autor}`;
          curtoIA = ia.so_manual ? "IA pausada" : `IA pausada até ${hora || "em breve"}`;
          corIA = "aten";
        } else { rotuloIA = "IA atendendo"; corIA = "ok"; dicaIA = ia.respondendo ? "O CodeWords está respondendo a esta conversa." : "O agente do CodeWords pode responder automaticamente."; }
      }
      // plano 50 · 37: com a IA viva e permissão para escrever, a pílula vira o interruptor «pausar / retomar» em um toque
      const iaViva = !!(ia && ia.disponivel !== false && ia.ia_ligada);
      const alternavel = iaViva && A.podeEscrever && conv.status !== "resolvida";
      const pia = alternavel
        ? h("button", { type: "button", class: ["pilula", `pilula-${corIA}`, "cv-pil-ia", "cv-pil-ia-bt"], "aria-pressed": String(!ia.pausada),
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
        if (Date.now() < iaFlashAte) pia.classList.add("cv-pil-ia-feito");
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
      const b = h("button", { type: "button", class: "bt bt-prim bt-p cvc-ia-acao", title: "Pausar a IA e assumir esta conversa" }, ui.icone("usuario"), "Assumir");
      b.addEventListener("click", () => A.acoes.assumirIA(b));
      acoes.appendChild(b); comAtalho(b, "assumir");
    } else if (est.primaria === "assumir") {
      const b = h("button", { type: "button", class: "bt bt-prim bt-p" }, ui.icone("usuario"), "Assumir");
      b.addEventListener("click", () => A.acoes.assumir(b));
      acoes.appendChild(b); comAtalho(b, "assumir");
    } else if (est.primaria === "resolver") {
      const b = h("button", { type: "button", class: "bt bt-p bt-resolver", "aria-label": "Resolver atendimento" }, ui.icone("check"), h("span", { class: "rot-longo" }, "Resolver"));
      b.addEventListener("click", () => A.acoes.resolver(b));
      acoes.appendChild(b); comAtalho(b, "resolver");
    } else if (est.primaria === "reabrir") {
      const b = h("button", { type: "button", class: "bt bt-sec bt-p" }, A.icone("reabrir"), "Reabrir");
      b.addEventListener("click", () => A.acoes.status("aberta", b));
      acoes.appendChild(b);
    }
    if (pode && est.primaria !== "assumir_ia") {
      const b = h("button", { type: "button", class: "bt-icone so-largo cvc-transferir", "aria-label": "Transferir", title: "Transferir",
        on: { click: () => A.acoes.transferir() } }, A.icone("transferir"));
      acoes.appendChild(b); comAtalho(b, "transferir");
    }
    if (est.resolverIcone) {
      const b = h("button", { type: "button", class: "bt-icone so-largo cvc-resolver-ic", "aria-label": "Resolver atendimento", title: "Resolver" }, ui.icone("check"));
      b.addEventListener("click", () => A.acoes.resolver(b));
      acoes.appendChild(b); comAtalho(b, "resolver");
    }
    if (A.raiz && A.raiz.dataset.lateral === "gaveta") {
      acoes.appendChild(h("button", { type: "button", class: "bt-icone so-largo", "aria-label": "Detalhes do contato", title: "Detalhes",
        on: { click: () => A.acoes.abrirDetalhes() } }, A.icone("lateral")));
    }
    const mais = h("button", { type: "button", class: "bt-icone cvc-mais", "aria-label": "Mais ações", title: "Mais ações" }, ui.icone("opcoes"));
    mais.addEventListener("click", () => {
      const itens = [];
      if (pode && conv.status !== "resolvida" && est.primaria !== "resolver") itens.push({ rotulo: "Resolver atendimento", icone: "check", fn: () => A.acoes.resolver() });
      if (pode && conv.status !== "resolvida" && !minha && est.primaria === "assumir_ia") itens.push({ rotulo: "Atribuir a mim (sem pausar a IA)", icone: "usuario", fn: () => A.acoes.assumir() });
      if (pode && est.devolverIA) itens.push({ rotulo: "Devolver para a IA", icone: "ia", fn: () => A.acoes.devolverIA() });
      if (pode) itens.push({ rotulo: "Transferir…", icone: "seta-dir", fn: () => A.acoes.transferir() });
      if (pode && conv.status === "aberta") itens.push({ rotulo: "Marcar como pendente", icone: "relogio", fn: () => A.acoes.status("pendente") });
      if (pode && conv.status === "pendente") itens.push({ rotulo: "Retomar (aberta)", icone: "chat", fn: () => A.acoes.status("aberta") });
      if (pode && conv.atribuida_a) itens.push({ rotulo: "Devolver para a fila", icone: "seta-esq", fn: async () => {
        try { const r = await A.api.rpcC("nx_cv_atribuir", { p_conversa: conv.id, p_conta: null, p_departamento: null }); if (r) { A.acoes.recarregarVer(); A.acoes.carregarLista({}); ui.toast("Conversa devolvida para a fila.", { tipo: "ok" }); } }
        catch (e) { A.acoes.tratarErro(e); }
      } });
      if (pode) itens.push({ rotulo: "Etiquetas…", icone: "etiqueta", fn: () => abrirEtiquetas() });
      itens.push("-");
      if (ct.telefone) itens.push({ rotulo: "Copiar telefone", icone: "copiar", fn: () => ui.copiar(ct.telefone, { aviso: "Telefone copiado." }) });
      itens.push({ rotulo: "Abrir ficha", icone: "contato", fn: () => A.ctx.abrirContato(ct.id, { aoMudar: () => A.acoes.recarregarVer() }) });
      if (A.raiz && A.raiz.dataset.lateral === "gaveta") itens.push({ rotulo: "Detalhes e negócios", icone: "info", fn: () => A.acoes.abrirDetalhes() });
      if (pode) itens.push({ rotulo: A.acoes.avancarAoResolver() ? "Ao resolver, abrir a próxima: ligado" : "Ao resolver, abrir a próxima: desligado",
        icone: A.acoes.avancarAoResolver() ? "check" : "seta-dir", fn: () => A.acoes.definirAvancar(!A.acoes.avancarAoResolver()) });
      itens.push({ rotulo: "Atalhos de teclado", icone: "info", fn: () => A.acoes.abrirAjudaTeclado() });
      if (A.acoes.pode("supervisor")) {
        itens.push("-");
        itens.push(conv.oculta
          ? { rotulo: "Desfazer bloqueio", icone: "check", fn: () => A.acoes.ocultar(false) }
          : { rotulo: "Ocultar e bloquear (spam)", icone: "alerta", perigo: true, fn: () => A.acoes.ocultar(true) });
      }
      ui.menu(mais, itens);
    });
    acoes.appendChild(mais);
    const acertarBarra = ligarBarra(acoes);
    cab.append(voltar, quem, acoes);
    acertarBarra();                     // só com a barra na tela dá para saber quais botões o CSS escondeu (.so-largo no celular)
  }

  /** Atalho da ação na barra (38): aria-keyshortcuts + etiqueta <kbd> que aparece no hover/foco (ui.dica quando a frente A oferecer). */
  function comAtalho(b, comando) {
    const teclas = L.atalhoDe(comando);
    if (!teclas) return b;
    b.setAttribute("aria-keyshortcuts", L.ariaKeyshortcuts(teclas));
    const rot = b.getAttribute("aria-label") || b.title || b.textContent.trim();
    const texto = `${rot} (${teclas})`;
    // com a dica da frente A o atalho já aparece no tooltip (hover + foco); sem ela, a etiqueta <kbd> sob o botão faz esse papel
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
    const acertar = () => {
      if (!barra.isConnected) {           // o cabeçalho ainda não entrou na página: confere no próximo quadro
        if (!adiado && typeof requestAnimationFrame === "function") { adiado = true; requestAnimationFrame(() => { if (barra.isConnected) acertar(); }); }
        return;
      }
      const vis = botoes();
      marcar(vis.find(b => b.tabIndex === 0) || vis[0] || null);
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
    let atuais = conv.etiquetas || [];
    const sel = ui.seletorEtiquetas({ todas: A.base.etiquetas || [], marcadas: atuais, rotulo: "Etiquetas da conversa",
      aoMudar: ids => { atuais = ids; A.acoes.etiquetas(ids); },
      podeCriar: A.acoes.pode("atendente") ? nome => A.acoes.criarEtiqueta(nome) : false });
    ui.modal({ titulo: "Etiquetas da conversa", corpo: h("div", { class: "pilha" }, h("p", { class: "sub" }, "Marque para organizar e filtrar a lista."), sel),
      largura: "p", acoes: [{ rotulo: "Pronto", tipo: "primario", valor: true }] });
  }

  /* ---------------- mensagens */
  const cache = new Map();   // chave → {el, sig}
  let ultimoRenderId = null;

  function textoFormatado(s) {
    const frag = document.createDocumentFragment();
    for (const seg of L.formatarWhats(s)) {
      if (seg.tipo === "texto") frag.appendChild(document.createTextNode(seg.v));
      else if (seg.tipo === "link") frag.appendChild(h("a", { href: seg.v, target: "_blank", rel: "noopener noreferrer nofollow" }, seg.v));
      else if (seg.tipo === "negrito") frag.appendChild(h("strong", null, seg.v));
      else if (seg.tipo === "italico") frag.appendChild(h("em", null, seg.v));
      else if (seg.tipo === "riscado") frag.appendChild(h("s", null, seg.v));
      else if (seg.tipo === "mono") frag.appendChild(h("code", { class: "mono" }, seg.v));
    }
    return frag;
  }

  function extensao(nome, mime) {
    const e = String(nome || "").split(".").pop();
    if (e && e.length <= 4 && e !== nome) return e.toUpperCase();
    return String(mime || "").split("/").pop().slice(0, 4).toUpperCase() || "ARQ";
  }

  /** URL de uma mídia gravada ou local: {url, estado:"ok"|"buscando"|"erro"} (a mesma regra para bolha, grade e visualizador). */
  function resolverUrl(md) {
    const local = md && md.local_url && /^blob:/.test(md.local_url) ? md.local_url : null;
    if (local) return { url: local, estado: "ok" };
    if (!md || !md.path) return { url: null, estado: "erro" };
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
    const btBaixar = h("a", { class: "bt bt-sec bt-p cv-lb-baixar", href: "#", target: "_blank", rel: "noopener noreferrer" }, A.icone("baixar"), h("span", { class: "so-largo-txt" }, "Baixar"));
    const btZoom = h("button", { type: "button", class: "bt-icone cv-lb-zoom", "aria-label": "Ampliar a foto", "aria-pressed": "false" }, A.icone("ampliar"));
    const btFechar = h("button", { type: "button", class: "bt-icone cv-lb-x", "aria-label": "Fechar (Esc)" }, ui.icone("fechar"));
    const kbd = t => h("kbd", null, t);
    const dlg = h("dialog", { class: "cv-lb", "aria-label": "Visualizador de fotos", dataset: { carregando: "0", zoom: "0" } },
      h("header", { class: "cv-lb-cab" }, contador, nome, h("div", { class: "cv-lb-acoes" }, btZoom, btBaixar, btFechar)),
      h("div", { class: "cv-lb-palco" }, btAnt, fig, btProx),
      h("p", { class: "cv-lb-dica" }, kbd("←"), " ", kbd("→"), " trocam · ", kbd("Esc"), " fecha · no celular, deslize"));
    let fechado = false, timer = null, camada = null, desligarSwipe = null;
    function mostrar() {
      clearTimeout(timer);
      const it = itens[i];
      contador.textContent = `${i + 1} de ${itens.length}`;
      nome.textContent = it.nome || (it.direcao === "in" ? "Foto recebida" : "Foto enviada");
      leg.textContent = [it.legenda, L.horaMsg(it.criado_em)].filter(Boolean).join(" · ");
      btAnt.disabled = i === 0; btProx.disabled = i === itens.length - 1;
      dlg.dataset.zoom = "0"; btZoom.setAttribute("aria-pressed", "false");
      const r = resolverUrl(it);
      if (r.url) {
        img.src = r.url; img.alt = it.legenda || it.nome || (it.direcao === "in" ? "Foto recebida" : "Foto enviada");
        btBaixar.href = r.url; btBaixar.setAttribute("download", it.nome || ""); btBaixar.hidden = false;
        dlg.dataset.carregando = "0";
      } else {
        img.removeAttribute("src"); img.alt = r.estado === "erro" ? "Não foi possível abrir esta foto agora." : "Carregando a foto…";
        btBaixar.hidden = true;
        dlg.dataset.carregando = r.estado === "erro" ? "erro" : "1";
        if (r.estado !== "erro") timer = setTimeout(() => { if (!fechado) mostrar(); }, 350);   // a URL assinada ainda está vindo
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
    const audio = h("audio", { src: url, preload: "metadata" });
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
    const caixa = h("div", { class: "cv-midia cv-audio", dataset: { estado: "parado" } }, audio, btPlay, h("div", { class: "cv-au-meio" }, trilhoAu, h("div", { class: "cv-au-tempos" }, tempo, dur)), btVel);
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
    btPlay.addEventListener("click", () => {
      if (audio.paused) { const p = audio.play(); if (p && typeof p.catch === "function") p.catch(() => { estado(false); }); }
      else audio.pause();
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
    trilhoAu.addEventListener("pointerdown", ev => { const f = fracaoDoEvento(ev); if (f !== null) { ev.preventDefault(); irPara(f); } });
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
    if (!local && (estado === "baixando")) return h("div", { class: "cv-midia-sk", role: "status" }, "Baixando mídia…");
    if (!local && (estado === "falhou" || estado === "indisponivel" || (!md.path && estado === "ok"))) {
      return h("div", { class: "cv-midia-off" }, ui.icone("alerta"),
        h("span", null, h("b", null, "Mídia indisponível. "),
          estado === "indisponivel" ? "O número ainda não tem acesso para baixar arquivos do WhatsApp." : "O WhatsApp não entregou o arquivo — peça para o cliente reenviar, se precisar."));
    }
    let url = local;
    if (!url && md.path) {
      const c = A.midia.get(md.path);
      if (c && c.local) url = c.local;
      else url = A.acoes.urlMidia(md.path);
      if (!url) {
        if (A.acoes.estadoMidia(md.path) === "erro") {
          return h("div", { class: "cv-midia-off" }, ui.icone("alerta"), h("span", null, "Não foi possível abrir a mídia agora. ",
            h("button", { type: "button", class: "link", on: { click: () => { A.midia.delete(md.path); renderMensagens({ rolar: "manter" }); } } }, "Tentar de novo")));
        }
        return h("div", { class: "cv-midia-sk", role: "status" }, "Carregando mídia…");
      }
    }
    if (m.tipo === "imagem" || m.tipo === "sticker") {
      const img = h("img", { on: { load: aposMidiaCarregar }, src: url, alt: m.tipo === "sticker" ? "Figurinha" : (m.direcao === "in" ? "Foto recebida" : "Foto enviada"), loading: "lazy", decoding: "async" });
      aoFalharMidia(img, md.path);
      if (m.tipo === "sticker") return h("div", { class: "cv-midia cv-sticker" }, img);
      return h("div", { class: "cv-midia" }, h("button", { type: "button", class: "cv-img-bt", "aria-label": "Ampliar foto", on: { click: () => abrirVisualizador(m) } }, img));
    }
    if (m.tipo === "video") { const v = h("video", { src: url, controls: true, preload: "metadata", playsinline: true }); aoFalharMidia(v, md.path); return h("div", { class: "cv-midia" }, v); }
    if (m.tipo === "audio") return blocoAudio(m, url, md);
    const doc = h(local ? "div" : "a", local ? { class: "cv-doc" } : { class: "cv-doc", href: url, target: "_blank", rel: "noopener noreferrer", download: nome || "" },
      h("span", { class: "cv-doc-ic", "aria-hidden": "true", dataset: { doc: L.grupoDocumento(nome, md.mime) } }, extensao(nome, md.mime)),
      h("span", { class: "cv-doc-txt" }, h("b", null, nome || "Documento"), h("small", null, [L.tamanhoLegivel(md.tamanho), local ? "enviando…" : "Baixar"].filter(Boolean).join(" · "))));
    return doc;
  }

  /* ---------------- grade de fotos (32): várias fotos seguidas do mesmo remetente viram UMA bolha com miniaturas */
  function construirGrade(ln) {
    const lista = ln.msgs;
    const dir = lista[0].direcao === "in" ? "in" : "out";
    const celulas = lista.map((m, k) => {
      const r = resolverUrl(m.midia || {});
      const rot = `Ampliar foto ${k + 1} de ${lista.length}`;
      if (!r.url) {
        return h("div", { class: "cv-grade-cel cv-midia-sk", role: "status", dataset: { id: m.id } }, r.estado === "erro" ? "Sem acesso" : "Carregando…");
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
  function construirGrupoSistema(ln) {
    const lista = ln.msgs, ult = lista[lista.length - 1];
    const det = h("details", { class: "cv-sis-grupo", dataset: { id: lista[0].id, n: String(lista.length) } });
    if (gruposAbertos.has(ln.chave)) det.open = true;
    det.addEventListener("toggle", () => { if (det.open) gruposAbertos.add(ln.chave); else gruposAbertos.delete(ln.chave); });
    det.append(
      h("summary", { class: "cv-sis-sum" },
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
    return h("div", { class: "cv-prog", role: "progressbar", "aria-label": "Enviando arquivo", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct) },
      h("span", { class: "cv-prog-barra", "aria-hidden": "true" }, h("i", { style: { width: `${pct}%` } })),
      h("span", { class: "cv-prog-txt dado" }, entregando ? "Entregando…" : `${pct} %`),
      cancelavel ? h("button", { type: "button", class: "bt bt-fant bt-p cv-prog-cancel", on: { click: () => A.acoes.cancelarEnvio(m) } }, "Cancelar") : null);
  }

  function rodape(m) {
    const st = m.direcao === "out" && m.tipo !== "nota" ? L.iconeStatus(m.status) : null;
    return h("div", { class: "cv-rodape" },
      h("time", { datetime: m.criado_em }, L.horaMsg(m.criado_em)),
      st ? h("span", { class: `cv-st ${st.classe}`, title: st.rotulo, "aria-label": st.rotulo }, st.simbolo) : null,
      st && st.texto ? h("span", { class: "cv-st-txt" }, st.texto) : null);
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

  function construirMsg(ln) {
    const m = ln.msg;
    if (m.tipo === "sistema") {
      const ic = L.iconeSistema(m.corpo);
      return h("div", { class: "cv-sis", dataset: { id: m.id, icone: ic } }, h("span", null, A.icone(ic, "cv-sis-ic"), m.corpo || "", h("time", { datetime: m.criado_em }, ` · ${L.horaMsg(m.criado_em)}`)));
    }
    const dir = m.direcao === "in" ? "in" : "out";
    const bolha = h("div", { class: "cv-bolha" });
    if (m.tipo === "nota") {
      bolha.appendChild(h("div", { class: "cv-nota-rot" }, ui.icone("nota"), `Nota interna · ${(m.enviado_por && m.enviado_por.nome) || "equipe"}`));
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
      const cita = h("button", { type: "button", class: "cv-cita", dataset: { dir: ra.direcao === "in" ? "in" : "out" }, on: { click: () => destacar(ra.id) } },
        h("b", null, ra.direcao === "in" ? A.acoes.nomeContato(A.ver && A.ver.contato) || "Cliente" : "Você"), ra.resumo || "Mensagem");
      bolha.appendChild(cita);
    }
    if (["imagem", "video", "audio", "documento", "sticker"].includes(m.tipo)) bolha.appendChild(blocoMidia(m));
    if (m.local && m.status === "pendente" && m.midia && m.midia.estado === "enviando") bolha.appendChild(blocoProgresso(m));
    const texto = m.tipo === "desconhecido" ? (m.corpo || "Mensagem não suportada pela API do WhatsApp — veja no celular") : m.corpo;
    if (texto) {
      const t = h("div", { class: ["cv-texto", m.tipo === "desconhecido" && "cv-texto-fraco"] }, textoFormatado(texto));
      bolha.appendChild(t);
    }
    bolha.appendChild(rodape(m));
    if (m.reacao) bolha.appendChild(h("span", { class: "cv-reacao", title: "Reação do cliente" }, m.reacao));

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
    if (m.corpo && m.tipo !== "desconhecido" && A.acoes.copiarTexto) {
      acoesMsg.appendChild(h("button", { type: "button", class: "bt-icone cv-copiar", "aria-label": "Copiar o texto da mensagem", title: "Copiar texto",
        on: { click: () => A.acoes.copiarTexto(m) } }, ui.icone("copiar")));
      itensMenu.push({ rotulo: "Copiar texto", icone: "copiar", fn: () => A.acoes.copiarTexto(m) });
    }
    if (acoesMsg.childNodes.length) {
      box.appendChild(acoesMsg);
      let toque = false;
      try { toque = matchMedia("(pointer: coarse)").matches; } catch { toque = false; }
      if (toque && typeof ui.toqueLongo === "function" && typeof ui.menu === "function") {
        try { ui.toqueLongo(bolha, () => ui.menu(bolha, itensMenu)); } catch { /* sem toque longo a barra lateral continua valendo */ }
      }
    }
    // M36: a fila de saída — "Na fila", "tentando de novo" (prazo estourado: o servidor não deixa sair em dobro) e a falha definitiva logo abaixo
    if (m.local && (m.filaEstado === "fila" || m.filaEstado === "incerto")) {
      // o texto diz o motivo REAL (internet, servidor ocupado, sessão) e a hora da próxima tentativa: a pessoa não procura problema no próprio wifi
      const fila = h("div", { class: "cv-fila", role: "status" },
        h("span", { class: "cv-fila-t" }, ui.icone("relogio"), L.textoFila({ estado: m.filaEstado, motivo: m.erro, proxima: m.filaProxima })));
      if (m.filaEstado === "fila" && A.podeEscrever) {
        fila.append(h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => A.acoes.enviarAgora(m) } }, "Enviar agora"),
          h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => A.acoes.cancelarFila(m) } }, "Cancelar"));
      }
      box.appendChild(fila);
    }
    const ambigua = m.ambigua === true || (m.status === "pendente" && /^status incerto:/i.test(String(m.erro || "")));
    if (m.status === "falhou" || (m.status === "pendente" && ambigua)) {
      const erro = ambigua
        ? "Pode ter saído — confira no WhatsApp antes de reenviar."
        : m.erro || "O canal não aceitou a mensagem.";
      const falha = h("div", { class: "cv-falha", role: "alert" }, h("span", null,
        h("b", null, ambigua ? "Status incerto: " : "Não enviada: "), erro));
      if (ambigua) {
        falha.classList.add("cv-falha-ambigua");
        // item da fila em dúvida (o servidor não tem a mensagem gravada): nunca sai sozinho; depois de conferir no WhatsApp, a pessoa decide
        if (m.local && m.ref && m.filaEstado === "ambigua" && A.podeEscrever) {
          falha.append(h("button", { type: "button", class: "bt bt-sec", on: { click: () => A.acoes.reenviarLocal(m) } }, "Enviar de novo"),
            h("button", { type: "button", class: "bt bt-fant", on: { click: () => A.acoes.descartarLocal(m) } }, "Descartar"));
        }
      } else if (m.falhaLocal && m.pedido) {
        falha.append(h("button", { type: "button", class: "bt bt-sec", on: { click: () => A.acoes.reenviarLocal(m) } }, "Tentar de novo"),
          h("button", { type: "button", class: "bt bt-fant", on: { click: () => A.acoes.descartarLocal(m) } }, "Descartar"));
      } else if (A.podeEscrever && m.tipo === "texto" && m.corpo && !A.acoes.foiReenviada(m)) {
        // falha gravada pelo servidor: pede o reenvio da PRÓPRIA mensagem (o texto gravado já tem a assinatura; como texto novo ela sairia em dobro)
        falha.append(h("button", { type: "button", class: "bt bt-sec", on: { click: () => A.acoes.reenviarGravada(m) } }, "Tentar de novo"));
      }
      box.appendChild(falha);
    }
    return box;
  }

  function assinatura(ln) {
    const m = ln.msg;
    const md = m.midia || {};
    const urlOk = md.path ? A.acoes.estadoMidia(md.path) : "";
    return [m.atualizado_em, m.status, m.erro, m.ambigua, m.filaEstado, m.filaProxima, !m.local && m.status === "falhou" && A.acoes.foiReenviada(m) ? 1 : 0, m.origem, m.reacao, ln.junta, md.estado, md.progresso, md.fase, m.local && A.acoes.podeCancelarEnvio(m) ? 1 : 0, urlOk, m.corpo && m.corpo.length, m.local ? 1 : 0,
      m.responde_a && m.responde_a.id, m.enviado_por && m.enviado_por.nome].join("|");
  }

  function construirLinha(ln) {
    if (ln.tipo === "dia") return h("div", { class: "cv-dia", role: "separator", dataset: { hoje: ln.rotulo === "Hoje" ? "1" : "0" } }, h("span", null, ln.rotulo));
    if (ln.tipo === "atendimento") {
      const c = ln.conversa;
      return h("div", { class: "cv-atend", role: "separator" }, h("span", null, "Atendimento ", h("b", null, c.protocolo || ""),
        c.aberta_em ? ` · aberto em ${ui.dataHoraBR(c.aberta_em)}` : ""));
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
    if (ln.tipo === "grade") return `g|${ln.junta ? 1 : 0}|${ln.cauda ? 1 : 0}|${ln.msgs.map(m => `${m.id}:${m.status}:${m.midia && m.midia.path ? A.acoes.estadoMidia(m.midia.path) : "l"}`).join(",")}`;
    if (ln.tipo === "sistema_grupo") return `s|${ln.msgs.map(m => `${m.id}:${m.corpo}`).join("|")}`;
    return ln.tipo;
  }

  function renderTopo() {
    ui.limpar(topoHist);
    if (A.carregandoAntes) topoHist.appendChild(h("span", { class: "sub", role: "status" }, "Carregando mensagens anteriores…"));
    else if (A.temMaisAntes) topoHist.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => A.acoes.carregarAntes() } }, "Ver mensagens anteriores"));
    else if (A.msgs.length) topoHist.appendChild(h("span", { class: "rotulo" }, "Início do histórico"));
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
      let x = cache.get(chave);
      if (!x || x.sig !== sig) {
        const novo = construirLinha(ln);
        if (!x && ultimoRenderId !== null && (ln.tipo === "msg" || ln.tipo === "grade")) novo.classList.add("entra");
        if (x && x.el.isConnected) x.el.replaceWith(novo);
        x = { el: novo, sig };
        cache.set(chave, x);
      }
      vivos.add(chave);
      ordem.push(x.el);
    }
    for (const [k, x] of cache) if (!vivos.has(k)) { x.el.remove(); cache.delete(k); }
    for (const n of [...trilho.children]) if (!ordem.includes(n)) n.remove();
    ordem.forEach((node, i) => { if (trilho.children[i] !== node) trilho.insertBefore(node, trilho.children[i] || null); });
    if (!linhas.length) {
      ui.limpar(trilho);
      trilho.appendChild(h("div", { class: "cv-sis" }, h("span", null, "Nenhuma mensagem ainda neste atendimento.")));
    }
    renderTopo();
    const ult = A.L.ultimoId(A.msgs);
    if (rolar === "fim" || (rolar === "novas" && estavaNoFim)) grudarFimAte = Date.now() + 2500;
    if (rolar === "fim") requestAnimationFrame(() => rolarFim(false));
    else if (rolar === "anterior") msgs.scrollTop = topoAntes + (msgs.scrollHeight - alturaAntes);
    else if (rolar === "novas") {
      if (estavaNoFim) requestAnimationFrame(() => rolarFim(true));
      else if (ult !== null && ultimoRenderId !== null && ult > ultimoRenderId) {
        // a pílula diz QUANTAS mensagens do cliente chegaram desde que a pessoa parou de olhar o fim
        novasDesde = novasDesde === null ? ultimoRenderId : novasDesde;
        const n = L.contarNovasEntradas(A.msgs, novasDesde);
        novasTxt.textContent = n > 0 ? `${n} ${n === 1 ? "nova mensagem" : "novas mensagens"}` : "Novas mensagens";
        novas.hidden = false;
      }
    }
    if (novas.hidden) novasDesde = null;
    ultimoRenderId = ult;
  }
  let novasDesde = null;

  function destacar(id) {
    const direto = trilho.querySelector(`.cv-msg[data-id="${escaparSel(id)}"]`);
    const naGrade = !direto && trilho.querySelector(`.cv-grade-bt[data-id="${escaparSel(id)}"]`);
    const alvo = direto || (naGrade && naGrade.closest ? naGrade.closest(".cv-msg") : null);
    if (!alvo) { ui.toast("Essa mensagem é mais antiga — role para cima para carregar.", { tipo: "info" }); return; }
    alvo.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    alvo.dataset.destaque = "1";
    setTimeout(() => { delete alvo.dataset.destaque; }, 1600);
  }

  function renderTudo({ rolar = "fim" } = {}) {
    cache.clear();
    ui.limpar(trilho);
    ultimoRenderId = null;
    novas.hidden = true; novasDesde = null;
    gruposAbertos.clear();
    if (visualizador) { try { visualizador.fechar(); } catch { /* ok */ } }
    renderCabecalho();
    if (A.composer.el.parentNode !== el) el.appendChild(A.composer.el);
    modo("conversa");
    renderMensagens({ rolar });
  }

  if (A.composer && A.composer.el) el.appendChild(A.composer.el);

  return {
    el, mostrarVazio, mostrarCarregando, mostrarErro, renderCabecalho, renderMensagens, renderTudo, renderTopo, destacar,
    noFim, rolarFim, estadoAcoes, abrirVisualizador,
    get visualizador() { return visualizador; },
    focarMensagens() { try { msgs.focus({ preventScroll: true }); } catch { /* ok */ } },
  };
}
