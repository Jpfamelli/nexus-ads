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
  const novas = h("button", { type: "button", class: "bt bt-prim bt-p cvc-novas", hidden: true }, "Novas mensagens", ui.icone("seta-baixo"));
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
    vazio.appendChild(h("div", { class: "cvc-vazio-in" }, orbita(), tit, h("p", null, txt),
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
      const pia = ui.pilula("", corIA, { icone: "ia", title: [rotuloIA, dicaIA].filter(Boolean).join(". "), class: "cv-pil-ia" });
      pia.append(h("span", { class: "so-largo-txt" }, rotuloIA), h("span", { class: "so-curto-txt" }, curtoIA || rotuloIA));
      faixa.appendChild(pia);
    }

    // ações: no máximo UM primário por estado (ver L.estadoCabecalho)
    const pode = A.podeEscrever;
    const minha = !!(conv.atribuida_a && conv.atribuida_a === eu);
    const est = L.estadoCabecalho({ conv, eu, pode, codeWords, ia });
    const acoes = h("div", { class: "cvc-acoes" });
    if (est.primaria === "assumir_ia") {
      const b = h("button", { type: "button", class: "bt bt-prim bt-p cvc-ia-acao", title: "Pausar a IA e assumir esta conversa" }, ui.icone("usuario"), "Assumir");
      b.addEventListener("click", () => A.acoes.assumirIA(b));
      acoes.appendChild(b);
    } else if (est.primaria === "assumir") {
      const b = h("button", { type: "button", class: "bt bt-prim bt-p" }, ui.icone("usuario"), "Assumir");
      b.addEventListener("click", () => A.acoes.assumir(b));
      acoes.appendChild(b);
    } else if (est.primaria === "resolver") {
      const b = h("button", { type: "button", class: "bt bt-p bt-resolver", "aria-label": "Resolver atendimento" }, ui.icone("check"), h("span", { class: "rot-longo" }, "Resolver"));
      b.addEventListener("click", () => A.acoes.status("resolvida", b));
      acoes.appendChild(b);
    } else if (est.primaria === "reabrir") {
      const b = h("button", { type: "button", class: "bt bt-sec bt-p" }, A.icone("reabrir"), "Reabrir");
      b.addEventListener("click", () => A.acoes.status("aberta", b));
      acoes.appendChild(b);
    }
    if (pode && est.primaria !== "assumir_ia") acoes.appendChild(h("button", { type: "button", class: "bt-icone so-largo", "aria-label": "Transferir", title: "Transferir",
      on: { click: () => A.acoes.transferir() } }, A.icone("transferir")));
    if (est.resolverIcone) {
      const b = h("button", { type: "button", class: "bt-icone so-largo cvc-resolver-ic", "aria-label": "Resolver atendimento", title: "Resolver" }, ui.icone("check"));
      b.addEventListener("click", () => A.acoes.status("resolvida", b));
      acoes.appendChild(b);
    }
    if (A.raiz && A.raiz.dataset.lateral === "gaveta") {
      acoes.appendChild(h("button", { type: "button", class: "bt-icone so-largo", "aria-label": "Detalhes do contato", title: "Detalhes",
        on: { click: () => A.acoes.abrirDetalhes() } }, A.icone("lateral")));
    }
    const mais = h("button", { type: "button", class: "bt-icone cvc-mais", "aria-label": "Mais ações", title: "Mais ações" }, ui.icone("opcoes"));
    mais.addEventListener("click", () => {
      const itens = [];
      if (pode && conv.status !== "resolvida" && est.primaria !== "resolver") itens.push({ rotulo: "Resolver atendimento", icone: "check", fn: () => A.acoes.status("resolvida") });
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
      if (A.acoes.pode("supervisor")) {
        itens.push("-");
        itens.push(conv.oculta
          ? { rotulo: "Desfazer bloqueio", icone: "check", fn: () => A.acoes.ocultar(false) }
          : { rotulo: "Ocultar e bloquear (spam)", icone: "alerta", perigo: true, fn: () => A.acoes.ocultar(true) });
      }
      ui.menu(mais, itens);
    });
    acoes.appendChild(mais);
    cab.append(voltar, quem, acoes);
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

  function lupa(url, nome) {
    ui.modal({ titulo: nome || "Foto", largura: "g",
      corpo: h("div", { class: "cv-lupa" }, h("img", { src: url, alt: nome || "Foto da conversa" })),
      acoes: [{ rotulo: "Fechar", tipo: "neutro" }],
      aoAbrir: api => { api.el.querySelector(".modal-rod").prepend(h("a", { class: "bt bt-sec", href: url, target: "_blank", rel: "noopener noreferrer", download: nome || "" }, A.icone("baixar"), "Baixar")); } });
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
      return h("div", { class: "cv-midia" }, h("button", { type: "button", class: "cv-img-bt", "aria-label": "Ampliar foto", on: { click: () => lupa(url, nome) } }, img));
    }
    if (m.tipo === "video") { const v = h("video", { src: url, controls: true, preload: "metadata", playsinline: true }); aoFalharMidia(v, md.path); return h("div", { class: "cv-midia" }, v); }
    if (m.tipo === "audio") { const a = h("audio", { src: url, controls: true, preload: "none" }); aoFalharMidia(a, md.path); return h("div", { class: "cv-midia" }, a); }
    const doc = h(local ? "div" : "a", local ? { class: "cv-doc" } : { class: "cv-doc", href: url, target: "_blank", rel: "noopener noreferrer", download: nome || "" },
      h("span", { class: "cv-doc-ic", "aria-hidden": "true" }, extensao(nome, md.mime)),
      h("span", { class: "cv-doc-txt" }, h("b", null, nome || "Documento"), h("small", null, [L.tamanhoLegivel(md.tamanho), local ? "enviando…" : "Baixar"].filter(Boolean).join(" · "))));
    return doc;
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
      return h("div", { class: "cv-sis", dataset: { id: m.id } }, h("span", null, m.corpo || "", h("time", { datetime: m.criado_em }, ` · ${L.horaMsg(m.criado_em)}`)));
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
    const box = h("div", { class: ["cv-msg", m.local && "cv-local-env"], dataset: { id: m.id, dir, tipo: m.tipo, junta: ln.junta ? "1" : "0" } },
      quem ? h("div", { class: "cv-quem" }, quem) : null, bolha);
    if (A.podeEscrever && !m.local && m.tipo !== "nota" && m.wamid) {
      box.appendChild(h("button", { type: "button", class: "bt-icone cv-responder", "aria-label": "Responder a esta mensagem", title: "Responder",
        on: { click: () => A.composer.responder(m) } }, A.icone("responder")));
    }
    // M36: a fila de saída — "Na fila", "tentando de novo" (prazo estourado: o servidor não deixa sair em dobro) e a falha definitiva logo abaixo
    if (m.local && (m.filaEstado === "fila" || m.filaEstado === "incerto")) {
      const fila = h("div", { class: "cv-fila", role: "status" },
        h("span", { class: "cv-fila-t" }, ui.icone("relogio"), m.filaEstado === "incerto"
          ? "Sem resposta do servidor · tentando de novo (nada sai em dobro)" : m.erro && /sessão/i.test(m.erro) ? m.erro : "Na fila · envia quando a internet voltar"));
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
      } else if (m.falhaLocal && m.pedido) {
        falha.append(h("button", { type: "button", class: "bt bt-sec", on: { click: () => A.acoes.reenviarLocal(m) } }, "Tentar de novo"),
          h("button", { type: "button", class: "bt bt-fant", on: { click: () => A.acoes.descartarLocal(m) } }, "Descartar"));
      } else if (A.podeEscrever && m.tipo === "texto" && m.corpo) {
        falha.append(h("button", { type: "button", class: "bt bt-sec", on: { click: () => A.acoes.enviar({ tipo: "texto", texto: m.corpo }) } }, "Tentar de novo"));
      }
      box.appendChild(falha);
    }
    return box;
  }

  function assinatura(ln) {
    const m = ln.msg;
    const md = m.midia || {};
    const urlOk = md.path ? A.acoes.estadoMidia(md.path) : "";
    return [m.atualizado_em, m.status, m.erro, m.ambigua, m.filaEstado, m.origem, m.reacao, ln.junta, md.estado, md.progresso, md.fase, m.local && A.acoes.podeCancelarEnvio(m) ? 1 : 0, urlOk, m.corpo && m.corpo.length, m.local ? 1 : 0,
      m.responde_a && m.responde_a.id, m.enviado_por && m.enviado_por.nome].join("|");
  }

  function construirLinha(ln) {
    if (ln.tipo === "dia") return h("div", { class: "cv-dia", role: "separator" }, h("span", null, ln.rotulo));
    if (ln.tipo === "atendimento") {
      const c = ln.conversa;
      return h("div", { class: "cv-atend", role: "separator" }, h("span", null, "Atendimento ", h("b", null, c.protocolo || ""),
        c.aberta_em ? ` · aberto em ${ui.dataHoraBR(c.aberta_em)}` : ""));
    }
    return construirMsg(ln);
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
    const linhas = L.montarLinhas(A.msgs, A.conversasContato);
    const vivos = new Set();
    const ordem = [];
    for (const ln of linhas) {
      const chave = ln.tipo === "msg" ? `m-${ln.msg.id}` : ln.chave;
      const sig = ln.tipo === "msg" ? assinatura(ln) : ln.tipo === "dia" ? ln.rotulo : `${ln.conversa.protocolo}|${ln.conversa.aberta_em}`;
      let x = cache.get(chave);
      if (!x || x.sig !== sig) {
        const novo = construirLinha(ln);
        if (!x && ultimoRenderId !== null && ln.tipo === "msg") novo.classList.add("entra");
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
      else if (ult !== null && ultimoRenderId !== null && ult > ultimoRenderId) novas.hidden = false;
    }
    ultimoRenderId = ult;
  }

  function destacar(id) {
    const alvo = trilho.querySelector(`.cv-msg[data-id="${CSS.escape(String(id))}"]`);
    if (!alvo) { ui.toast("Essa mensagem é mais antiga — role para cima para carregar.", { tipo: "info" }); return; }
    alvo.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    alvo.dataset.destaque = "1";
    setTimeout(() => { delete alvo.dataset.destaque; }, 1600);
  }

  function renderTudo({ rolar = "fim" } = {}) {
    cache.clear();
    ui.limpar(trilho);
    ultimoRenderId = null;
    novas.hidden = true;
    renderCabecalho();
    if (A.composer.el.parentNode !== el) el.appendChild(A.composer.el);
    modo("conversa");
    renderMensagens({ rolar });
  }

  if (A.composer && A.composer.el) el.appendChild(A.composer.el);

  return {
    el, mostrarVazio, mostrarCarregando, mostrarErro, renderCabecalho, renderMensagens, renderTudo, renderTopo, destacar,
    noFim, rolarFim,
    focarMensagens() { try { msgs.focus({ preventScroll: true }); } catch { /* ok */ } },
  };
}
