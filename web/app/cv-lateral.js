/* ============================================================
   ÓRBITA — cv-lateral.js · frente F5 · ESPEC §7.7 T4 (painel lateral)
   Cartão do contato (nome editável, telefone, e-mail, origem / "Veio
   do anúncio «…»" / "Veio do site", opt-out, etiquetas da conversa,
   campos), negócios abertos (abre a gaveta do CRM; "+ Novo" cria já
   ligado à conversa; "Ligar a este atendimento"), tarefas abertas
   (+ nova, concluir) e atendimentos anteriores (protocolos). Em telas
   ≤ 1280 px o mesmo conteúdo vai para uma gaveta ("Detalhes").
   Plano 100 · D1: a lateral é redesenhada POR SEÇÃO (assinatura de
   cada uma) e nunca a seção em edição; o nome do contato só grava por
   Enter ou «Salvar» (sair do campo não grava nada).
   ============================================================ */

export function criarLateral(A) {
  const { ui, L } = A;
  const h = ui.h;
  let alvo = null;

  const ORIGEM = { anuncio: "Anúncio", whatsapp: "WhatsApp", indicacao: "Indicação", organico: "Orgânico", manual: "Cadastro manual", site: "Site", importacao: "Importação", formulario: "Formulário" };
  const PLATAFORMA = { meta: "Meta", instagram: "Instagram", facebook: "Facebook", google: "Google" };

  /* ---------------- estado do desenho por seção (D1) */
  let cont = null, contConversa = null;          // .cv-lat da conversa à vista e de qual conversa ela é
  const secoes = new Map();                      // chave → {el, sig}
  let editandoNome = null;                       // {ctId, valor, salvando, erro} enquanto o campo do nome está aberto
  let seletor = null;                            // seletor de etiquetas da conversa aberta (o mesmo nó enquanto ela estiver à vista)
  let miniAberto = false;                        // «Ver números» do mini-gráfico aberto

  function montarEm(container) { alvo = container; cont = null; contConversa = null; secoes.clear(); seletor = null; render(); }

  // rótulos dos campos personalizados (do CRM); sem o CRM, a chave vira rótulo legível
  let rotulos = null, pedindoRotulos = false;
  function rotuloCampo(k) {
    if (!rotulos && !pedindoRotulos && A.ctx.temModulo && A.ctx.temModulo("crm")) {
      pedindoRotulos = true;
      A.api.rpcC("nx_crm_base").then(b => { rotulos = {}; for (const c of (b && b.campos) || []) if (c.entidade === "contato") rotulos[c.chave] = c.rotulo; render(); }).catch(() => { rotulos = {}; });
    }
    return (rotulos && rotulos[k]) || k.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
  }

  /* D17: de onde a pessoa veio (rastreio do site / anúncio), lido do negócio (nx_negocio_ver) uma vez por negócio, por detecção */
  const rastreios = new Map();     // negócio → {linha} | "buscando"
  function negocioDeOrigem(ver) {
    const negs = (ver.negocios || []).filter(n => n && ["site", "anuncio", "organico"].includes(n.origem));
    const ligado = ver.conversa && ver.conversa.negocio && ver.conversa.negocio.id;
    return negs.find(n => n.id === ligado) || negs[0] || null;
  }
  function rastreioDe(ver) {
    const n = negocioDeOrigem(ver);
    if (!n || !(A.ctx.temModulo && A.ctx.temModulo("crm"))) return null;
    const c = rastreios.get(n.id);
    if (c === "buscando") return null;
    if (c) return c.linha;
    rastreios.set(n.id, "buscando");
    A.api.rpcC("nx_negocio_ver", { p_id: n.id })
      .then(r => { const neg = (r && (r.negocio || r)) || null; rastreios.set(n.id, { linha: L.linhaRastreio(neg ? { ...neg, origem: neg.origem || n.origem } : null) }); render(); })
      .catch(() => { rastreios.set(n.id, { linha: null }); });
    return null;
  }

  /* plano 50 · 35: seções recolhíveis (<details>) com o estado lembrado por navegador; a ação da seção fica fora do <summary> para não recolher ao clicar */
  const lerAberta = id => { try { return localStorage.getItem(`nx-cv-lat-${id}`) !== "0"; } catch { return true; } };
  const gravarAberta = (id, aberta) => { try { localStorage.setItem(`nx-cv-lat-${id}`, aberta ? "1" : "0"); } catch { /* sem storage */ } };
  function secao({ id, titulo, acao = null, contador = null }, ...filhos) {
    // tudo pelo h(): append(null) escreveria «null» na tela
    const det = h("details", { class: "cvt-sec", dataset: { sec: id }, open: lerAberta(id) },
      h("summary", { class: "cvt-sec-cab" }, h("h3", { class: "rotulo" }, titulo, contador !== null && contador !== undefined ? h("span", { class: "cvt-sec-n dado" }, String(contador)) : null),
        ui.icone("seta-baixo", "cvt-sec-chev")),
      acao ? h("div", { class: "cvt-sec-acao" }, acao) : null,
      h("div", { class: "cvt-sec-corpo" }, ...filhos));
    det.addEventListener("toggle", () => gravarAberta(id, det.open));
    return det;
  }

  /* ---------------- resumo do contato (35): contadores do que nx_cv_ver já traz + mini-gráfico das mensagens carregadas
     Linhas compactas (número · rótulo · detalhe): a lateral tem 300 px e o ui.kpi (frente A) é um cartão de painel, largo demais para três lado a lado. */
  function kpi({ rotulo, valor, detalhe, ajuda, tom }) {
    return h("div", { class: "cvt-kpi", dataset: { tom: tom || "neutro" }, title: ajuda || null },
      h("b", { class: "cvt-kpi-v" }, String(valor)), h("span", { class: "cvt-kpi-r" }, rotulo), detalhe ? h("small", { class: "cvt-kpi-d dado" }, detalhe) : null);
  }
  function blocoResumoContato(ver) {
    const r = L.resumoContato(ver);
    const neg = (A.ctx.vocab && A.ctx.vocab.negocios) || "Negócios";
    const kpis = h("div", { class: "cvt-kpis", role: "group", "aria-label": "Resumo do contato" },
      kpi({ rotulo: r.negocios === 1 ? ((A.ctx.vocab && A.ctx.vocab.negocio) || "Negócio") : neg, valor: r.negocios, detalhe: r.valor ? ui.brl(r.valor, { centavos: false }) : null, ajuda: `${neg} em aberto deste contato`, tom: r.negocios ? "prim" : "neutro" }),
      kpi({ rotulo: r.atendimentos === 1 ? "Atendimento" : "Atendimentos", valor: r.atendimentos, ajuda: "Atendimentos deste contato (este incluído)" }),
      kpi({ rotulo: r.tarefas === 1 ? "Tarefa" : "Tarefas", valor: r.tarefas, detalhe: r.atrasadas ? `${r.atrasadas} atrasada${r.atrasadas === 1 ? "" : "s"}` : null, ajuda: "Tarefas abertas ligadas ao contato", tom: r.atrasadas ? "ruim" : "neutro" }));
    return h("section", { class: "cvt-resumo-ct" }, kpis, blocoInteracoes(), blocoAtalhos(ver));
  }
  /** Mensagens por dia (últimos 7) a partir do que já está carregado — honesto: o servidor não devolve essa série. */
  function blocoInteracoes() {
    const dias = L.interacoesPorDia(A.msgs || []);
    const total = dias.reduce((s, d) => s + d.entrada + d.saida, 0);
    const resumo = total ? `${total} ${total === 1 ? "mensagem" : "mensagens"} nos últimos 7 dias (nas mensagens carregadas)` : "Sem mensagens nos últimos 7 dias nas mensagens carregadas";
    const caixa = h("div", { class: "cvt-mini-caixa" });
    const G = A.G;
    if (G && typeof G.sparkline === "function") {
      try { G.sparkline(caixa, { valores: dias.map(d => d.entrada + d.saida), area: true, rotulo: resumo }); }
      catch { ui.limpar(caixa); caixa.appendChild(barrasSimples(dias, resumo)); }
    } else caixa.appendChild(barrasSimples(dias, resumo));
    const tabela = h("table", { class: "cvt-mini-tab" }, h("caption", { class: "sr-only" }, "Mensagens por dia"),
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Dia"), h("th", { scope: "col", class: "num" }, "Cliente"), h("th", { scope: "col", class: "num" }, "Equipe"))),
      h("tbody", null, dias.map(d => h("tr", null, h("th", { scope: "row" }, d.rotulo), h("td", { class: "num" }, String(d.entrada)), h("td", { class: "num" }, String(d.saida))))));
    const det = h("details", { class: "cvt-mini-det", open: miniAberto }, h("summary", { dataset: { foco: "mini" } }, "Ver números"), tabela);
    det.addEventListener("toggle", () => { miniAberto = det.open; });
    return h("div", { class: "cvt-mini" },
      h("div", { class: "cvt-mini-cab" }, h("span", { class: "rotulo" }, "Mensagens · 7 dias"), h("span", { class: "cvt-mini-total dado" }, String(total))),
      caixa,
      h("p", { class: "sr-only" }, resumo),
      det);
  }
  function barrasSimples(dias, resumo) {
    const max = Math.max(1, ...dias.map(d => d.entrada + d.saida));
    return h("div", { class: "cvt-barras", role: "img", "aria-label": resumo }, dias.map((d, i) => {
      const tot = d.entrada + d.saida;
      return h("span", { class: "cvt-barra", style: { "--h": `${Math.round((tot / max) * 100)}%`, "--in": `${tot ? Math.round((d.entrada / tot) * 100) : 0}%`, "--i": String(i) },
        title: `${d.rotulo}: ${d.entrada} do cliente · ${d.saida} da equipe`, dataset: { hoje: i === dias.length - 1 ? "1" : "0", vazio: tot ? "0" : "1" } },
        h("small", null, d.rotulo.slice(0, 1).toUpperCase()));
    }));
  }
  /** Atalhos: ligar, copiar o protocolo, agenda (marca a consulta já com o negócio — D11) e a ficha completa. */
  function blocoAtalhos(ver) {
    const ct = ver.contato || {}, conv = ver.conversa || {};
    const atalho = (icone, rotulo, props) => h(props.href ? "a" : "button", { class: "cvt-atalho", ...(props.href ? {} : { type: "button" }), ...props }, ui.icone(icone), h("span", null, rotulo));
    const temCrm = !!(A.ctx.temModulo && A.ctx.temModulo("crm"));
    const negAgenda = L.negocioParaAgenda(ver);
    return h("div", { class: "cvt-atalhos", role: "group", "aria-label": "Atalhos" },
      ct.telefone ? atalho("telefone", "Ligar", { href: `tel:+${String(ct.telefone).replace(/\D/g, "")}`, title: `Ligar para ${ui.telBR(ct.telefone)}`, dataset: { foco: "ligar" } }) : null,
      conv.protocolo ? atalho("copiar", "Protocolo", { title: `Copiar o protocolo ${conv.protocolo}`, dataset: { foco: "protocolo" }, on: { click: () => ui.copiar(conv.protocolo, { aviso: "Protocolo copiado." }) } }) : null,
      temCrm ? atalho("calendario", "Agenda", { dataset: { foco: "agenda" },
        title: negAgenda ? `Marcar consulta para «${negAgenda.titulo || "este negócio"}»` : "Marcar consulta",
        on: { click: () => { if (typeof A.acoes.agendar === "function") A.acoes.agendar(negAgenda); else A.ctx.navegar("#/agenda"); } } }) : null,
      ct.id ? atalho("contato", "Ficha", { title: "Abrir a ficha completa", dataset: { foco: "ficha" }, on: { click: () => A.ctx.abrirContato(ct.id, { aoMudar: () => A.acoes.recarregarVer() }) } }) : null);
  }

  /* ---------------- nome do contato: só grava por Enter ou «Salvar»; Esc e «Cancelar» desistem; sair do campo não grava (D1) */
  function abrirEdicaoNome(ct) {
    if (!A.podeEscrever || !ct || !ct.id) return;
    editandoNome = { ctId: ct.id, valor: ct.nome || "", salvando: false, erro: "" };
    redesenhar("contato");
    const inp = cont && cont.querySelector(".cvt-nome-ed input");
    if (inp) { try { inp.focus(); inp.select(); } catch { /* ok */ } }
  }
  function fecharEdicaoNome({ foco = true } = {}) {
    editandoNome = null;
    render();                                    // a seção do contato volta ao título (e traz o que mudou durante a edição)
    if (foco) { const b = cont && cont.querySelector('[data-foco="editar-nome"]'); if (b) try { b.focus({ preventScroll: true }); } catch { /* ok */ } }
  }
  async function salvarNome(ct) {
    const ed = editandoNome;
    if (!ed || ed.salvando || ed.ctId !== ct.id) return;
    const novo = String(ed.valor || "").trim();
    if (!novo) { ed.erro = "O nome não pode ficar vazio."; redesenhar("contato"); focarNome(); return; }
    if (novo === String(ct.nome || "").trim()) { fecharEdicaoNome(); return; }
    ed.salvando = true; ed.erro = "";
    redesenhar("contato");
    try {
      await A.api.rpcC("nx_contato_salvar", { p_contato: { id: ct.id, nome: novo } });
      if (editandoNome !== ed) return;
      if (A.ver && A.ver.contato && A.ver.contato.id === ct.id) A.ver.contato = { ...A.ver.contato, nome: novo };
      ui.toast("Nome atualizado.", { tipo: "ok" });
      fecharEdicaoNome();
      A.acoes.recarregarVer();
      A.acoes.carregarLista({});
    } catch (e) {
      if (editandoNome !== ed) return;
      ed.salvando = false;
      A.acoes.tratarErro(e);
      redesenhar("contato");
      focarNome();
    }
  }
  function focarNome() { const inp = cont && cont.querySelector(".cvt-nome-ed input"); if (inp) try { inp.focus(); } catch { /* ok */ } }
  function caixaNome(ct, nome) {
    const ed = editandoNome && editandoNome.ctId === ct.id ? editandoNome : null;
    if (!ed) {
      return h("div", { class: "cvt-nome" }, h("h2", null, nome),
        A.podeEscrever ? h("button", { type: "button", class: "bt-icone", "aria-label": "Editar nome", title: "Editar nome", dataset: { foco: "editar-nome" }, on: { click: () => abrirEdicaoNome(ct) } }, ui.icone("editar")) : null);
    }
    const idErro = `cvt-nome-erro-${ct.id}`;
    const inp = h("input", { type: "text", value: ed.valor, maxlength: 160, "aria-label": "Nome do contato", disabled: ed.salvando,
      "aria-invalid": ed.erro ? "true" : null, "aria-describedby": ed.erro ? idErro : null, autocomplete: "off", dataset: { foco: "nome-campo" } });
    inp.addEventListener("input", () => { if (editandoNome === ed) ed.valor = inp.value; });
    inp.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); salvarNome(ct); }
      else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fecharEdicaoNome(); }
    });
    const salvar = h("button", { type: "button", class: "bt bt-prim bt-p", disabled: ed.salvando, dataset: { foco: "nome-salvar" }, on: { click: () => salvarNome(ct) } }, ui.icone("check"), ed.salvando ? "Salvando…" : "Salvar");
    const cancelar = h("button", { type: "button", class: "bt bt-fant bt-p", disabled: ed.salvando, dataset: { foco: "nome-cancelar" }, on: { click: () => fecharEdicaoNome() } }, "Cancelar");
    return h("div", { class: "cvt-nome cvt-nome-ed", role: "group", "aria-label": "Editar o nome do contato" }, inp,
      ed.erro ? h("p", { class: "cvt-nome-erro", id: idErro, role: "alert" }, ed.erro) : null,
      h("div", { class: "cvt-nome-bts" }, cancelar, salvar));
  }

  function rotuloOrigem(origem, plataforma) {
    const base = ORIGEM[origem] || origem;
    return origem === "anuncio" && PLATAFORMA[plataforma] ? `${base} · ${PLATAFORMA[plataforma]}` : base;
  }

  function blocoTopo(ver) {
    const ct = ver.contato || {};
    const nome = A.acoes.nomeContato(ct);
    const selos = h("div", { class: "cvt-selos" });
    if (ct.optin_marketing === false) selos.appendChild(ui.pilula("Não quer marketing", "aten", { title: ct.optin_origem || "Pediu para não receber marketing" }));
    if (ct.bloqueado) selos.appendChild(ui.pilula("Bloqueado", "ruim"));
    // pílula de origem da frente A (A8); o anúncio ganha o bloco «Veio do anúncio» em Dados
    if (ct.origem && ct.origem !== "anuncio") selos.appendChild(ui.pilula(rotuloOrigem(ct.origem), ct.origem, { variante: "origem", plataforma: ct.plataforma || undefined, tamanho: "p" }));
    return h("div", { class: "cvt-contato" }, ui.avatar(nome, ct.id), caixaNome(ct, nome),
      ct.telefone ? h("div", { class: "cvt-tel" }, ui.telBR(ct.telefone)) : null,
      selos.childNodes.length ? selos : null,
      h("div", { class: "linha" },
        ct.telefone ? h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { foco: "copiar-tel" }, on: { click: () => ui.copiar(ct.telefone, { aviso: "Telefone copiado." }) } }, ui.icone("copiar"), "Copiar") : null,
        h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { foco: "abrir-ficha" }, on: { click: () => A.ctx.abrirContato(ct.id, { aoMudar: () => A.acoes.recarregarVer() }) } }, ui.icone("contato"), "Abrir ficha")));
  }

  function blocoDados(ver, rastreio) {
    const ct = ver.contato || {};
    const conv = ver.conversa || {};
    const an = ver.anuncio;
    const detalheRastreio = rastreio && rastreio.detalhe ? h("div", { class: "cvt-rastreio-det" }, rastreio.detalhe) : null;
    const anuncio = an || ct.origem === "anuncio" ? h("div", { class: "cvt-anuncio" }, ui.icone("anuncio"),
      h("div", null, h("b", null, "Veio do anúncio"), an && (an.anuncio_nome || an.campanha_nome)
        ? h("div", null, [an.anuncio_nome ? `«${an.anuncio_nome}»` : null, an.campanha_nome ? `campanha «${an.campanha_nome}»` : null].filter(Boolean).join(" · "))
        : h("div", { class: "fraco" }, an && an.plataforma === "google" ? "Google Ads" : "Meta (Facebook/Instagram)"),
        detalheRastreio)) : null;
    // D17: veio pelo site (rastreio): «Veio do site · campanha «x» · página /y · clique em 08/10 14:02»
    const site = !anuncio && rastreio ? h("div", { class: "cvt-anuncio cvt-rastreio" }, ui.icone("globo"),
      h("div", null, h("b", null, rastreio.titulo), detalheRastreio)) : null;
    const origem = anuncio || site;

    const dados = h("dl", { class: "cvt-dl" });
    const add = (k, v) => { if (v !== null && v !== undefined && v !== "") dados.append(h("dt", null, k), h("dd", null, v)); };
    add("E-mail", ct.email);
    add("Cidade", [ct.cidade, ct.uf].filter(Boolean).join(" · "));
    const campos = ct.campos && typeof ct.campos === "object" ? Object.entries(ct.campos).filter(([, v]) => v !== null && v !== "" && (typeof v !== "object" || Array.isArray(v))).slice(0, 4) : [];
    for (const [k, v] of campos) add(rotuloCampo(k), Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v));
    add("Atendimento", h("span", { class: "mono" }, conv.protocolo || ""));
    add("Departamento", conv.departamento ? conv.departamento.nome : null);
    add("Com", conv.atribuida ? conv.atribuida.nome : conv.atribuida_nome || "Sem dono");
    if (conv.primeira_resposta_em && conv.aberta_em) {
      const min = Math.max(0, Math.round((Date.parse(conv.primeira_resposta_em) - Date.parse(conv.aberta_em)) / 60000));
      add("1ª resposta", min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);
    }
    return secao({ id: "dados", titulo: "Dados" }, origem, origem ? h("div", { class: "cvt-esp" }) : null, dados);
  }

  /* ---------------- etiquetas (D20): o mesmo seletor enquanto a conversa estiver à vista; a resposta antiga nunca vence a nova (seq) */
  function criarSeletor(conv) {
    const el = ui.seletorEtiquetas({ todas: (A.base && A.base.etiquetas) || [], marcadas: conv.etiquetas || [], rotulo: "Etiquetas da conversa",
      aoMudar: async (ids, info) => {
        const seq = info && info.seq;
        const atual = () => seq === undefined || typeof el.seqAtual !== "function" || seq === el.seqAtual();
        const r = await A.acoes.etiquetas(ids, { atual });
        if (!r || !atual()) return;
        if (typeof el.definir === "function") el.definir(r.etiquetas || ids);
        const n = cont && cont.querySelector('[data-sec="etiquetas"] .cvt-sec-n');
        if (n) n.textContent = String((r.etiquetas || ids).length);
      },
      podeCriar: nome => A.acoes.criarEtiqueta(nome) });
    return el;
  }
  function blocoEtiquetas(ver) {
    const conv = ver.conversa || {};
    let corpo;
    if (A.podeEscrever) { seletor = criarSeletor(conv); corpo = seletor; }
    else corpo = h("div", { class: "linha" }, (conv.etiquetas || []).map(id => ((A.base && A.base.etiquetas) || []).find(e => e.id === id)).filter(Boolean).map(e => ui.etiqueta(e)));
    return secao({ id: "etiquetas", titulo: "Etiquetas", contador: (conv.etiquetas || []).length || null }, corpo);
  }
  /** As etiquetas mudaram no servidor (outra pessoa, automação): o seletor acompanha sem ser trocado — salvo com mudança da pessoa no meio. */
  function atualizarEtiquetas(el, ver) {
    const conv = ver.conversa || {};
    const ids = conv.etiquetas || [];
    const n = el.querySelector(".cvt-sec-n");
    if (!seletor || typeof seletor.definir !== "function") return;
    if ((typeof seletor.pendente === "function" && seletor.pendente()) || A.etiquetasEmVoo > 0) return;
    const marcadas = typeof seletor.marcadas === "function" ? seletor.marcadas() : null;
    if (marcadas && marcadas.length === ids.length && marcadas.every(x => ids.includes(x))) return;
    seletor.definir(ids);
    if (n) n.textContent = String(ids.length);
  }

  function blocoNegocios(ver) {
    const conv = ver.conversa || {};
    const lista = ver.negocios || [];
    const neg = A.ctx.vocab.negocio || "Negócio";
    const novo = A.podeEscrever
      ? h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { foco: "novo-negocio" }, on: { click: async () => {
          await A.ctx.novoNegocio({ contato_id: ver.contato && ver.contato.id, conversa_id: conv.id }, {
            aoCriar: n => { if (n && n.id && !conv.negocio) A.acoes.vincular(n.id); else A.acoes.recarregarVer(); } });
        } } }, ui.icone("mais"), `Novo`)
      : null;
    const itens = lista.map(n => {
      const cor = ui.corOk(n.estagio_cor);
      const ligado = conv.negocio && conv.negocio.id === n.id;
      const origemN = n.origem || (n.anuncio ? "anuncio" : null);
      const b = h("button", { type: "button", class: "cvt-neg", dataset: { ligado: ligado ? "1" : "0", foco: `neg-${n.id}` },
        on: { click: () => A.ctx.abrirNegocio(n.id, { aoMudar: () => A.acoes.recarregarVer() }) } },
        h("span", { class: "cvt-neg-l1" }, h("b", null, n.titulo || (n.contato && n.contato.nome) || neg),
          h("span", { class: "mono" }, n.valor_previsto != null ? ui.brl(n.valor_previsto, { centavos: false }) : "")),
        h("span", { class: "cvt-neg-l2" },
          n.estagio_nome ? h("span", { class: "cv-etapa", style: cor ? { "--cor": cor } : null, title: n.estagio_nome }, h("span", null, n.estagio_nome)) : null,
          origemN && origemN !== "whatsapp" ? ui.pilula(rotuloOrigem(origemN), origemN, { variante: "origem", tamanho: "p" }) : null,
          ligado ? h("span", { class: "cvt-ligado" }, "Este atendimento") : null,
          n.tarefa && n.tarefa.atrasada ? ui.pilula("Tarefa atrasada", "ruim") : null));
      const wrap = h("div", null, b);
      if (A.podeEscrever && !ligado) {
        wrap.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { foco: `ligar-neg-${n.id}` }, on: { click: () => A.acoes.vincular(n.id) } }, ui.icone("link"), "Ligar a este atendimento"));
      }
      return wrap;
    });
    return secao({ id: "negocios", titulo: A.ctx.vocab.negocios || "Negócios", acao: novo, contador: itens.length || null },
      itens.length ? h("div", null, itens) : h("p", { class: "cvt-vazio" }, "Nada em aberto para este contato."));
  }

  function blocoTarefas(ver) {
    const tarefas = ver.tarefas || [];
    const nova = A.podeEscrever ? h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { foco: "nova-tarefa" }, on: { click: () => novaTarefa(ver) } }, ui.icone("mais"), "Tarefa") : null;
    const itens = tarefas.map(t => {
      const idc = `cvt-t-${t.id}`;
      const chk = h("input", { type: "checkbox", id: idc, disabled: !A.podeEscrever, "aria-label": `Concluir: ${t.titulo}` });
      const linha = h("div", { class: "cvt-tar" });
      chk.addEventListener("change", async () => {
        linha.dataset.feita = "1";                     // risca na hora (check animado); o servidor confirma em seguida
        try { await A.api.rpcC("nx_tarefa_concluir", { p_id: t.id, p_concluida: true }); ui.toast("Tarefa concluída.", { tipo: "ok" }); A.acoes.recarregarVer(); }
        catch (e) { chk.checked = false; delete linha.dataset.feita; A.acoes.tratarErro(e); }
      });
      linha.append(chk, h("label", { for: idc }, h("b", null, t.titulo)),
        h("small", { dataset: { atrasada: t.atrasada ? "1" : "0" } }, t.vence_em ? `${t.atrasada ? "Atrasada · " : ""}${ui.relativo(t.vence_em)}` : "Sem prazo",
          t.dono && t.dono.nome ? ` · ${t.dono.nome}` : ""));
      return linha;
    });
    return secao({ id: "tarefas", titulo: "Tarefas", acao: nova, contador: itens.length || null }, itens.length ? h("div", null, itens) : h("p", { class: "cvt-vazio" }, "Nenhuma tarefa aberta."));
  }

  async function novaTarefa(ver) {
    const ct = ver.contato || {};
    const conv = ver.conversa || {};
    const f = h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: "O que fazer", nome: "titulo", obrigatorio: true, max: 160, placeholder: "Ex.: Ligar para confirmar a avaliação" }),
      ui.campo({ rotulo: "Tipo", nome: "tipo", tipo: "select", valor: "tarefa", opcoes: [
        { valor: "tarefa", rotulo: "Tarefa" }, { valor: "ligacao", rotulo: "Ligação" }, { valor: "whatsapp", rotulo: "WhatsApp" },
        { valor: "reuniao", rotulo: "Reunião" }, { valor: "visita", rotulo: "Visita" }, { valor: "email", rotulo: "E-mail" }] }),
      ui.campo({ rotulo: "Vence em", nome: "vence_em", tipo: "datahora" }));
    const r = await ui.modal({ titulo: "Nova tarefa", corpo: f, largura: "p",
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Criar tarefa", tipo: "primario", fn: async () => {
        const d = ui.lerForm(f);
        if (!d.titulo) { ui.marcarErro(f, "titulo", "Escreva o que precisa ser feito."); return false; }
        const vence = d.vence_em ? new Date(d.vence_em).toISOString() : null;
        return A.api.rpcC("nx_tarefa_salvar", { p_tarefa: { titulo: d.titulo, tipo: d.tipo, vence_em: vence, contato_id: ct.id, negocio_id: conv.negocio ? conv.negocio.id : null } });
      } }] });
    if (r) { ui.toast("Tarefa criada.", { tipo: "ok" }); A.acoes.recarregarVer(); }
  }

  function blocoAtendimentos(ver) {
    const lista = ver.atendimentos || [];
    const itens = lista.map(a => {
      const atual = a.id === A.selId;
      return h("button", { type: "button", class: "cvt-at", "aria-current": atual ? "true" : null, disabled: atual, dataset: { foco: `at-${a.id}` },
        on: { click: () => A.acoes.abrir(a.id) } },
        h("span", { class: "mono" }, a.protocolo || ""),
        ui.pilula(a.status === "resolvida" ? "Resolvido" : a.status === "pendente" ? "Pendente" : "Aberto", a.status === "resolvida" ? "neutra" : a.status === "pendente" ? "aten" : "ok"),
        h("small", null, [ui.dataBR(a.aberta_em), a.atribuida_nome ? `com ${a.atribuida_nome}` : "sem dono"].join(" · ")));
    });
    return secao({ id: "atendimentos", titulo: "Atendimentos", contador: itens.length > 1 ? itens.length : null }, itens.length ? h("div", null, itens) : h("p", { class: "cvt-vazio" }, "Primeiro atendimento."));
  }

  /* ---------------- resumo com IA (P1: a IA só lê; nunca envia) */
  const resumos = new Map();   // conversa → {texto, em}
  function blocoResumo(ver) {
    const conv = ver.conversa || {};
    const r = resumos.get(conv.id);
    const saida = h("div", { class: "cvt-resumo", "aria-live": "polite" });
    if (r && r.texto) saida.append(h("p", null, r.texto), h("small", null, `Gerado ${ui.relativo(r.em)} pela IA — confira antes de usar.`));
    else saida.appendChild(h("p", { class: "cvt-vazio" }, "Um parágrafo com o que o cliente quer, o que já foi combinado e o próximo passo."));
    const b = h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { foco: "resumir" } }, ui.icone("ia"), r ? "Refazer" : "Resumir");
    b.addEventListener("click", async () => {
      const ia = A.base && A.base.ia;
      if (ia && ia.ligada === false) { ui.toast("A IA não está disponível agora.", { tipo: "info" }); return; }
      try {
        const x = await ui.carregando(b, A.api.fn("nx-ia", { acao: "resumir", conversa: conv.id }));
        const texto = x && typeof x.texto === "string" ? x.texto.trim() : "";
        if (!texto) throw Object.assign(new Error("ia_indisponivel"), { codigo: "ia_indisponivel" });
        resumos.set(conv.id, { texto, em: new Date().toISOString() });
        if (A.ver && A.ver.conversa && A.ver.conversa.id === conv.id) render();
      } catch (e) {
        const c = e && e.codigo;
        ui.toast(c === "ia_cota" ? "A cota de IA do mês acabou." : c === "muitos_pedidos" ? "Muitos pedidos seguidos; espere um minuto." : "A IA não está disponível agora.",
          { tipo: c === "ia_cota" || c === "muitos_pedidos" ? "info" : "erro" });
      }
    });
    return secao({ id: "resumo-ia", titulo: "Resumo da conversa", acao: b }, saida);
  }

  /* ---------------- desenho por seção (D1) */
  const sig = v => JSON.stringify(v);
  /** As seções da conversa, cada uma com a assinatura do que ela mostra: só a que mudou é refeita. */
  function definicoes(ver) {
    const ct = ver.contato || {}, conv = ver.conversa || {};
    const minuto = Math.floor(Date.now() / 60000);
    const rastreio = rastreioDe(ver);
    const temCrm = !!(A.ctx.temModulo && A.ctx.temModulo("crm"));
    const negAgenda = L.negocioParaAgenda(ver);
    return [
      { chave: "contato", sig: sig([ct.id, ct.nome, ct.telefone, ct.optin_marketing, ct.optin_origem, ct.bloqueado, ct.origem, ct.plataforma, A.podeEscrever, editandoNome && editandoNome.ctId === ct.id ? [editandoNome.salvando, editandoNome.erro] : 0]),
        criar: () => blocoTopo(ver) },
      { chave: "resumo", sig: sig([L.resumoContato(ver), L.interacoesPorDia(A.msgs || []), ct.id, ct.telefone, conv.protocolo, temCrm, negAgenda && negAgenda.id, !!A.G]),
        criar: () => blocoResumoContato(ver) },
      { chave: "dados", sig: sig([ver.anuncio, ct.origem, ct.email, ct.cidade, ct.uf, ct.campos, conv.protocolo, conv.departamento && conv.departamento.nome, conv.atribuida && conv.atribuida.nome, conv.atribuida_nome,
        conv.primeira_resposta_em, conv.aberta_em, !!rotulos, rastreio]),
        criar: () => blocoDados(ver, rastreio) },
      { chave: "etiquetas", sig: sig([conv.id, A.podeEscrever, ((A.base && A.base.etiquetas) || []).map(e => [e.id, e.nome, e.cor]), A.podeEscrever ? 0 : conv.etiquetas]),
        criar: () => blocoEtiquetas(ver), atualizar: el => atualizarEtiquetas(el, ver) },
      { chave: "negocios", sig: sig([(ver.negocios || []).map(n => [n.id, n.titulo, n.valor_previsto, n.estagio_nome, n.estagio_cor, n.origem, n.anuncio, n.tarefa && n.tarefa.atrasada]), conv.negocio && conv.negocio.id, A.podeEscrever]),
        criar: () => blocoNegocios(ver) },
      { chave: "tarefas", sig: sig([(ver.tarefas || []).map(t => [t.id, t.titulo, t.vence_em, t.atrasada, t.dono && t.dono.nome]), A.podeEscrever, minuto, conv.id, conv.negocio && conv.negocio.id]),   // + negócio: a tarefa nova leva o negócio recém-ligado
        criar: () => blocoTarefas(ver) },
      { chave: "atendimentos", sig: sig([(ver.atendimentos || []).map(a => [a.id, a.protocolo, a.status, a.aberta_em, a.atribuida_nome]), A.selId]),
        criar: () => blocoAtendimentos(ver) },
      { chave: "resumo-ia", sig: sig([conv.id, (resumos.get(conv.id) || {}).em || null]), criar: () => blocoResumo(ver) },
    ];
  }
  /** A pessoa está mexendo nesta seção: nome aberto, campo de texto com o foco ou etiqueta a caminho do servidor. */
  function emEdicao(chave, el) {
    if (chave === "contato") return !!editandoNome;      // o único campo de texto do cartão é o do nome
    if (chave === "etiquetas" && seletor && ((typeof seletor.pendente === "function" && seletor.pendente()) || A.etiquetasEmVoo > 0)) return true;
    const ativo = typeof document !== "undefined" ? document.activeElement : null;
    if (!ativo || !el.contains(ativo)) return false;
    const tag = String(ativo.tagName || "").toUpperCase();
    return tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !/^(checkbox|radio|button|submit)$/i.test(ativo.type || ""));
  }
  /** Troca a seção e devolve o foco ao mesmo controle (data-foco ou id) — ou ao título da seção, se ele sumiu. */
  function trocar(velho, novo) {
    const ativo = typeof document !== "undefined" ? document.activeElement : null;
    const tinha = !!ativo && ativo !== velho && velho.contains(ativo);
    const chaveFoco = tinha ? (ativo.dataset && ativo.dataset.foco ? `[data-foco="${ativo.dataset.foco}"]` : ativo.id ? `#${ativo.id}` : null) : null;
    velho.replaceWith(novo);
    if (!tinha) return;
    const destino = (chaveFoco && novo.querySelector(chaveFoco)) || novo.querySelector("summary") || null;
    if (destino) try { destino.focus({ preventScroll: true }); } catch { try { destino.focus(); } catch { /* ok */ } }
  }
  /** Refaz uma seção agora (abrir/fechar a edição do nome). */
  function redesenhar(chave) {
    const x = secoes.get(chave);
    if (!x || !A.ver || !cont) return;
    const d = definicoes(A.ver).find(y => y.chave === chave);
    if (!d) return;
    const novo = d.criar();
    trocar(x.el, novo);
    x.el = novo; x.sig = d.sig;
  }

  function render() {
    if (!alvo) return;
    const ver = A.ver;
    if (!ver) {
      cont = null; contConversa = null; secoes.clear(); seletor = null; editandoNome = null;
      ui.limpar(alvo);
      if (A.selId) alvo.appendChild(h("div", { class: "cvt-sec" }, ui.esqueleto("lista", 3)));
      return;
    }
    const convId = ver.conversa ? ver.conversa.id : null;
    if (!cont || contConversa !== convId || cont.parentNode !== alvo) {
      // outra conversa (ou outro lugar): desenha do zero — a edição de nome da anterior é abandonada SEM gravar
      secoes.clear(); seletor = null; editandoNome = null;
      ui.limpar(alvo);
      cont = h("div", { class: "cv-lat", dataset: { conversa: convId ?? "" } });
      contConversa = convId;
      alvo.appendChild(cont);
    }
    let anterior = null;
    const vivas = new Set();
    for (const d of definicoes(ver)) {
      vivas.add(d.chave);
      let x = secoes.get(d.chave);
      if (!x) { x = { el: d.criar(), sig: d.sig }; secoes.set(d.chave, x); }
      else if (x.sig !== d.sig) {
        if (!emEdicao(d.chave, x.el)) { const novo = d.criar(); trocar(x.el, novo); x.el = novo; x.sig = d.sig; }
        // em edição: fica como está; o próximo desenho depois da edição traz o que mudou
      } else if (d.atualizar) d.atualizar(x.el);
      const ref = anterior ? anterior.nextSibling : cont.firstChild;
      if (ref !== x.el) cont.insertBefore(x.el, ref || null);
      anterior = x.el;
    }
    for (const [k, x] of secoes) if (!vivas.has(k)) { x.el.remove(); secoes.delete(k); }
  }

  return { montarEm, render, get editandoNome() { return !!editandoNome; } };
}
