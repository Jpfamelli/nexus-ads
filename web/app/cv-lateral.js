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

  const pendentesTarefa = new Set();             // CA-035: tarefas marcadas com o «Desfazer» ainda na tela (o redesenho mantém o risco)

  /* ---------------- estado do desenho por seção (D1) */
  let cont = null, contConversa = null;          // .cv-lat da conversa à vista e de qual conversa ela é
  const secoes = new Map();                      // chave → {el, sig}
  let editandoNome = null;                       // {ctId, valor, salvando, erro} enquanto o campo do nome está aberto
  let seletor = null;                            // seletor de etiquetas da conversa aberta (o mesmo nó enquanto ela estiver à vista)
  let miniAberto = false;                        // «Ver números» do mini-gráfico aberto

  function montarEm(container) { alvo = container; cont = null; contConversa = null; secoes.clear(); seletor = null; render(); }

  // rótulos dos campos personalizados (do CRM); sem o CRM, a chave vira rótulo legível
  let rotulos = null, pedindoRotulos = false, crmBase = null, crmDeNovoEm = 0;
  /** A base do CRM (uma vez por montagem): rótulos dos campos e — plano 1000 · CA-083 — os funis com as etapas para mover o negócio daqui. */
  function carregarCrm() {
    // plano 1000b · CB-064: a base que falhou é relida — 60 s depois, no próximo desenho (antes: rótulos crus e sem seletor de etapa até recarregar)
    if (crmBase || pedindoRotulos || Date.now() < crmDeNovoEm || !(A.ctx.temModulo && A.ctx.temModulo("crm"))) return;
    pedindoRotulos = true;
    A.api.rpcC("nx_crm_base").then(b => { pedindoRotulos = false; crmBase = b || {}; rotulos = {}; for (const c of (b && b.campos) || []) if (c.entidade === "contato") rotulos[c.chave] = c.rotulo; render(); })
      .catch(() => { pedindoRotulos = false; rotulos = rotulos || {}; crmDeNovoEm = Date.now() + 60000; });
  }
  function rotuloCampo(k) {
    carregarCrm();
    return (rotulos && rotulos[k]) || k.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
  }
  /** CA-083: as etapas «abertas» do funil do negócio (a agendada pede data e as de fechamento perguntam valor/motivo: essas ficam na ficha). */
  function etapasDe(n) {
    const funil = crmBase && Array.isArray(crmBase.funis) ? crmBase.funis.find(f => f && f.id === n.funil_id) : null;
    if (!funil || !Array.isArray(funil.estagios)) return [];
    return funil.estagios.filter(e => e && e.ativo !== false && ((e.tipo === "aberto" && e.marco !== "agendada") || e.id === n.estagio_id))
      .slice().sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
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
  /* plano 1000 · CA-102: a série dos 7 dias só é recalculada quando as mensagens carregadas mudam (quantas, a 1ª e a última) ou o dia
     vira — antes, todo pulso (3 s) refazia a série e o JSON da assinatura */
  let memoSerie = null;
  function serieDias() {
    const msgs = A.msgs || [];
    const chave = `${msgs.length}|${msgs.length ? msgs[0].id : ""}|${msgs.length ? msgs[msgs.length - 1].id : ""}|${L.diaSP(Date.now())}`;
    if (!memoSerie || memoSerie.chave !== chave) { const v = L.interacoesPorDia(msgs); memoSerie = { chave, v, sig: JSON.stringify(v) }; }
    return memoSerie;
  }
  /** Mensagens por dia (últimos 7) a partir do que já está carregado — honesto: o servidor não devolve essa série. */
  function blocoInteracoes() {
    const dias = serieDias().v;
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
      // CA-236: o rótulo diz que a conta é das mensagens CARREGADAS na tela (não o total do contato)
      h("div", { class: "cvt-mini-cab" }, h("span", { class: "rotulo" }, "Mensagens carregadas · 7 dias"), h("span", { class: "cvt-mini-total dado" }, String(total))),
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
        on: { click: () => { if (typeof A.acoes.agendar === "function") A.acoes.agendar(negAgenda); else A.ctx.navegar("#/agenda"); } } }) : null);
    // plano 1000 · CA-040: «Ficha» saiu dos atalhos (ficava sozinha na 2ª linha): o «Abrir ficha» do topo do cartão já faz isso
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

  /* ---------------- plano 1000 · CA-081: e-mail e cidade editáveis na lateral (mesma regra do nome: Enter/«Salvar» gravam, Esc/«Cancelar» desistem) */
  let editandoCampo = null;                      // {campo: "email"|"cidade", ctId, valor, salvando, erro}
  const RE_EMAIL = /^[^@\s]+@[^@\s]+[.][^@\s]+$/;
  function abrirEdicaoCampo(ct, campo) {
    if (!A.podeEscrever || !ct || !ct.id) return;
    editandoCampo = { campo, ctId: ct.id, valor: String((campo === "email" ? ct.email : ct.cidade) || ""), salvando: false, erro: "" };
    redesenhar("dados");
    const inp = cont && cont.querySelector(".cvt-campo-caixa input");
    if (inp) { try { inp.focus(); inp.select(); } catch { /* ok */ } }
  }
  function fecharEdicaoCampo({ foco = true } = {}) {
    const campo = editandoCampo && editandoCampo.campo;
    editandoCampo = null;
    redesenhar("dados");                         // na marra: o campo que fecha ainda tem o foco (o render() acharia que está em edição)
    render();
    if (foco && campo) { const b = cont && cont.querySelector(`[data-foco="editar-${campo}"]`); if (b) try { b.focus({ preventScroll: true }); } catch { /* ok */ } }
  }
  async function salvarCampo(ct) {
    const ed = editandoCampo;
    if (!ed || ed.salvando || ed.ctId !== ct.id) return;
    const novo = String(ed.valor || "").trim();
    if (ed.campo === "email" && novo && !RE_EMAIL.test(novo)) { ed.erro = "Confira o e-mail: algo como nome@exemplo.com."; redesenhar("dados"); focarCampo(); return; }
    const atual = String((ed.campo === "email" ? ct.email : ct.cidade) || "").trim();
    if (novo === atual) { fecharEdicaoCampo(); return; }
    ed.salvando = true; ed.erro = "";
    redesenhar("dados");
    try {
      await A.api.rpcC("nx_contato_salvar", { p_contato: { id: ct.id, [ed.campo]: novo || null } });
      if (editandoCampo !== ed) return;
      if (A.ver && A.ver.contato && A.ver.contato.id === ct.id) A.ver.contato = { ...A.ver.contato, [ed.campo]: novo || null };
      ui.toast(ed.campo === "email" ? "E-mail atualizado." : "Cidade atualizada.", { tipo: "ok" });
      fecharEdicaoCampo();
      A.acoes.recarregarVer();
    } catch (e) {
      if (editandoCampo !== ed) return;
      ed.salvando = false;
      ed.erro = e && e.codigo === "dados_invalidos" && ed.campo === "email" ? "O servidor não aceitou este e-mail. Confira e tente de novo." : "";
      if (!ed.erro) A.acoes.tratarErro(e);
      redesenhar("dados");
      focarCampo();
    }
  }
  function focarCampo() { const inp = cont && cont.querySelector(".cvt-campo-caixa input"); if (inp) try { inp.focus(); } catch { /* ok */ } }
  function caixaCampo(ct, campo, rotulo) {
    const ed = editandoCampo;
    const idErro = `cvt-${campo}-erro-${ct.id}`;
    const inp = h("input", { type: campo === "email" ? "email" : "text", value: ed.valor, maxlength: campo === "email" ? 160 : 80, "aria-label": `${rotulo} do contato`, disabled: ed.salvando,
      autocomplete: "off", inputmode: campo === "email" ? "email" : null, "aria-invalid": ed.erro ? "true" : null, "aria-describedby": ed.erro ? idErro : null, dataset: { foco: `${campo}-campo` } });
    inp.addEventListener("input", () => { if (editandoCampo === ed) ed.valor = inp.value; });
    inp.addEventListener("keydown", ev => {
      if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); salvarCampo(ct); }
      else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); fecharEdicaoCampo(); }
    });
    return h("div", { class: "cvt-nome-ed cvt-campo-caixa", role: "group", "aria-label": `Editar ${rotulo.toLowerCase()}` }, inp,
      ed.erro ? h("p", { class: "cvt-nome-erro", id: idErro, role: "alert" }, ed.erro) : null,
      h("div", { class: "cvt-nome-bts" },
        h("button", { type: "button", class: "bt bt-fant bt-p", disabled: ed.salvando, dataset: { foco: `${campo}-cancelar` }, on: { click: () => fecharEdicaoCampo() } }, "Cancelar"),
        h("button", { type: "button", class: "bt bt-prim bt-p", disabled: ed.salvando, dataset: { foco: `${campo}-salvar` }, on: { click: () => salvarCampo(ct) } }, ui.icone("check"), ed.salvando ? "Salvando…" : "Salvar")));
  }
  /** CA-124: o horário de atendimento que vale para a conversa (departamento dela ou o padrão), quando a tela o conhece (admin). */
  function horarioDe(conv) {
    const deps = (A.base && A.base.config && A.base.config.departamentos) || [];
    const d = deps.find(x => x && x.id === conv.departamento_id) || deps.find(x => x && x.padrao);
    return d && Object.prototype.hasOwnProperty.call(d, "horario") ? d.horario : undefined;
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
        // plano 1000 · CA-080: o formato internacional (+55…), pronto para o discador e o WhatsApp; o aviso diz qual foi
        ct.telefone ? h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { foco: "copiar-tel" }, title: `Copiar ${L.telefoneInternacional(ct.telefone)}`,
          on: { click: () => ui.copiar(L.telefoneInternacional(ct.telefone), { aviso: `Telefone copiado: ${L.telefoneInternacional(ct.telefone)}` }) } }, ui.icone("copiar"), "Copiar") : null,
        // CA-239: contato removido (sem id) — o botão fica desligado e diz por quê (antes abria uma gaveta de erro)
        h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { foco: "abrir-ficha" }, disabled: !ct.id, title: ct.id ? null : "Contato removido: não há ficha para abrir",
          on: { click: () => { if (ct.id) A.ctx.abrirContato(ct.id, { aoMudar: () => A.acoes.recarregarVer() }); } } }, ui.icone("contato"), ct.id ? "Abrir ficha" : "Contato removido")));
  }

  function rotuloPlataforma(p) {
    const v = String(p || "").toLowerCase();
    return v === "google" ? "Google Ads" : v === "meta" || v === "facebook" || v === "instagram" ? "Meta (Facebook/Instagram)" : "Anúncio";
  }
  function blocoDados(ver, rastreio) {
    const ct = ver.contato || {};
    const conv = ver.conversa || {};
    const an = ver.anuncio;
    const detalheRastreio = rastreio && rastreio.detalhe ? h("div", { class: "cvt-rastreio-det" }, rastreio.detalhe) : null;
    const anuncio = an || ct.origem === "anuncio" ? h("div", { class: "cvt-anuncio" }, ui.icone("anuncio"),
      h("div", null, h("b", null, "Veio do anúncio"), an && (an.anuncio_nome || an.campanha_nome)
        ? h("div", null, [an.anuncio_nome ? `«${an.anuncio_nome}»` : null, an.campanha_nome ? `campanha «${an.campanha_nome}»` : null].filter(Boolean).join(" · "))
        // plano 1000b · CB-057: sem ver.anuncio vale a plataforma do contato; sem nenhuma, só «Anúncio» (antes caía em Meta)
        : h("div", { class: "fraco" }, rotuloPlataforma((an && an.plataforma) || ct.plataforma)),
        detalheRastreio)) : null;
    // D17: veio pelo site (rastreio): «Veio do site · campanha «x» · página /y · clique em 08/10 14:02»
    const site = !anuncio && rastreio ? h("div", { class: "cvt-anuncio cvt-rastreio" }, ui.icone("globo"),
      h("div", null, h("b", null, rastreio.titulo), detalheRastreio)) : null;
    const origem = anuncio || site;

    const dados = h("dl", { class: "cvt-dl" });
    const add = (k, v) => { if (v !== null && v !== undefined && v !== "") dados.append(h("dt", null, k), h("dd", null, v)); };
    // CA-038: e-mail clicável (abre o programa de e-mail) e com «copiar» ao lado
    // plano 1000 · CA-081: e-mail e cidade se corrigem aqui mesmo (Enter ou «Salvar», como o nome) — sem abrir a ficha
    const edCampo = editandoCampo && editandoCampo.ctId === ct.id ? editandoCampo : null;
    const btEditar = (campo, rotulo) => A.podeEscrever && ct.id ? h("button", { type: "button", class: "bt-icone cvt-campo-ed", "aria-label": `Editar ${rotulo.toLowerCase()}`, title: `Editar ${rotulo.toLowerCase()}`,
      dataset: { foco: `editar-${campo}` }, on: { click: () => abrirEdicaoCampo(ct, campo) } }, ui.icone("editar")) : null;
    if (edCampo && edCampo.campo === "email") add("E-mail", caixaCampo(ct, "email", "E-mail"));
    else if (ct.email) add("E-mail", h("span", { class: "cvt-email" }, h("a", { href: `mailto:${String(ct.email).trim()}`, class: "link" }, ct.email),
      h("button", { type: "button", class: "bt-icone cvt-email-copiar", "aria-label": "Copiar e-mail", title: "Copiar e-mail", dataset: { foco: "copiar-email" },
        on: { click: () => ui.copiar(String(ct.email).trim(), { aviso: "E-mail copiado." }) } }, ui.icone("copiar")), btEditar("email", "E-mail")));
    else if (A.podeEscrever && ct.id) add("E-mail", h("button", { type: "button", class: "link cvt-campo-add", dataset: { foco: "editar-email" }, on: { click: () => abrirEdicaoCampo(ct, "email") } }, "Adicionar e-mail"));
    const cidadeTxt = [ct.cidade, ct.uf].filter(Boolean).join(" · ");
    if (edCampo && edCampo.campo === "cidade") add("Cidade", caixaCampo(ct, "cidade", "Cidade"));
    else if (cidadeTxt) add("Cidade", h("span", { class: "cvt-email" }, h("span", null, cidadeTxt), btEditar("cidade", "Cidade")));
    else if (A.podeEscrever && ct.id) add("Cidade", h("button", { type: "button", class: "link cvt-campo-add", dataset: { foco: "editar-cidade" }, on: { click: () => abrirEdicaoCampo(ct, "cidade") } }, "Adicionar cidade"));
    const todosCampos = ct.campos && typeof ct.campos === "object" ? Object.entries(ct.campos).filter(([, v]) => v !== null && v !== "" && (typeof v !== "object" || Array.isArray(v))) : [];
    const campos = todosCampos.slice(0, 4);
    for (const [k, v] of campos) add(rotuloCampo(k), Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v));
    // plano 1000b · CB-058: os campos além de 4 não somem calados — «+2 campos na ficha» abre a ficha
    const sobra = todosCampos.length - campos.length;
    if (sobra > 0) dados.append(h("dt", { class: "sr-only" }, "Outros campos"), h("dd", { class: "cvt-mais-campos" }, ct.id
      ? h("button", { type: "button", class: "link", dataset: { foco: "mais-campos" }, on: { click: () => A.ctx.abrirContato(ct.id, { aoMudar: () => A.acoes.recarregarVer() }) } }, `+${sobra} ${sobra === 1 ? "campo" : "campos"} na ficha`)
      : `+${sobra} ${sobra === 1 ? "campo" : "campos"} na ficha`));
    if (conv.protocolo) add("Atendimento", h("span", { class: "mono" }, conv.protocolo));   // plano 1000b · CB-059: sem protocolo, sem a linha vazia
    add("Departamento", conv.departamento ? conv.departamento.nome : null);
    add("Com", conv.atribuida ? conv.atribuida.nome : conv.atribuida_nome || "Sem dono");
    if (conv.primeira_resposta_em && conv.aberta_em) {
      // plano 1000 · CA-124: o tempo é corrido (sexta 20h → segunda 9h = 61 h) — o rótulo diz isso; quando a conversa chegou fora do horário
      // e a tela conhece o horário de atendimento, mostra também o tempo útil (a mesma regra do SLA da lista)
      const min = Math.max(0, Math.round((Date.parse(conv.primeira_resposta_em) - Date.parse(conv.aberta_em)) / 60000));
      const corrido = L.textoMinutos(min);
      const hor = horarioDe(conv);
      const fora = hor !== undefined && hor !== null && !L.horarioAberto(hor, conv.aberta_em);
      const util = fora ? L.minutosUteis(conv.aberta_em, conv.primeira_resposta_em, hor) : null;
      add(fora ? "1ª resposta" : "1ª resposta (tempo corrido)", fora
        ? h("span", { class: "cvt-resp1" }, `${L.textoMinutos(util)} no horário de atendimento`, h("small", { class: "fraco" }, ` · ${corrido} corridos (chegou fora do horário)`))
        : corrido);
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

  /** CA-083: muda a etapa na tela na hora e só grava (nx_negocio_mover) quando o aviso com Desfazer fecha — o mesmo movimento adiado do Kanban. */
  async function moverEtapa(n, destino, sel = null) {
    const antes = { estagio_id: n.estagio_id, estagio_nome: n.estagio_nome, estagio_cor: n.estagio_cor };
    const depois = { estagio_id: destino.id, estagio_nome: destino.nome, estagio_cor: destino.cor || null };
    const aplicarNoVer = patch => {
      if (!A.ver) return;
      A.ver = { ...A.ver, negocios: (A.ver.negocios || []).map(x => (x && x.id === n.id ? { ...x, ...patch } : x)) };
      render();
    };
    // plano 1000b · CB-023: o select focado não é redesenhado (emEdicao) — ao voltar (Desfazer ou erro) ele mesmo mostra a etapa anterior
    const voltar = () => {
      aplicarNoVer(antes);
      if (sel && String(sel.value) !== String(antes.estagio_id)) { sel.value = antes.estagio_id ?? ""; if (antes.estagio_nome) ui.anunciar(`Etapa voltou para «${antes.estagio_nome}».`); }
    };
    const api = A.api;
    const titulo = n.titulo || (A.ctx.vocab && A.ctx.vocab.negocio) || "Negócio";
    if (typeof ui.acaoComDesfazer !== "function") {
      try { await api.rpcC("nx_negocio_mover", { p_id: n.id, p_estagio: destino.id, p_ordem: null, p_extra: {} }); aplicarNoVer(depois); A.acoes.recarregarVer(); }
      catch (e) { voltar(); A.acoes.tratarErro(e); }
      return;
    }
    const r = await ui.acaoComDesfazer({
      texto: `«${titulo}» foi para «${destino.nome}»`,
      aplicar: () => aplicarNoVer(depois),
      firmar: async ({ saindo = false } = {}) => {
        try { await api.rpcC("nx_negocio_mover", { p_id: n.id, p_estagio: destino.id, p_ordem: null, p_extra: {} }, saindo ? { keepalive: true } : {}); }
        catch (e) { voltar(); throw e; }
        A.acoes.recarregarVer();
        A.acoes.carregarLista({});
      },
      reverter: () => voltar(),
    });
    if (r && r.estado === "falhou" && r.erro) A.acoes.tratarErro(r.erro);
  }

  function blocoNegocios(ver) {
    const conv = ver.conversa || {};
    const lista = ver.negocios || [];
    if (lista.length) carregarCrm();
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
      const aberto = (n.status || "aberto") === "aberto" && (!n.estagio_tipo || n.estagio_tipo === "aberto");
      // plano 1000 · CA-083: a etapa muda aqui mesmo (com Desfazer, como no Kanban); as que pedem data/valor/motivo continuam na ficha
      const etapas = A.podeEscrever && aberto && n.funil_id ? etapasDe(n) : [];
      if (etapas.length > 1) {
        const idSel = `cvt-etapa-${n.id}`;
        const sel = h("select", { class: "sel cvt-etapa-sel", id: idSel, dataset: { foco: `etapa-${n.id}` } },
          etapas.map(e => h("option", { value: e.id, selected: e.id === n.estagio_id }, e.nome)));
        sel.addEventListener("change", () => { const e = etapas.find(x => String(x.id) === String(sel.value)); if (e && e.id !== n.estagio_id) moverEtapa(n, e, sel); });
        wrap.appendChild(h("div", { class: "cvt-etapa" }, h("label", { for: idSel, class: "rotulo" }, "Etapa"), sel));
      }
      // CA-242: «Ganhou» / «Perdeu» no cartão — pelo mesmo caminho do CRM (valor, motivo e campos obrigatórios), quando o shell oferece a ponte
      if (A.podeEscrever && aberto && typeof A.ctx.moverNegocio === "function") {
        const fechar = tipo => A.ctx.moverNegocio(n.id, { tipo }, { aoMudar: () => A.acoes.recarregarVer() });
        wrap.appendChild(h("div", { class: "linha cvt-neg-fechar" },
          h("button", { type: "button", class: "bt bt-sec bt-p cvt-ganhou", dataset: { foco: `ganhou-${n.id}` }, on: { click: () => fechar("ganho") } }, ui.icone("check"), "Ganhou"),
          h("button", { type: "button", class: "bt bt-fant bt-p cvt-perdeu", dataset: { foco: `perdeu-${n.id}` }, on: { click: () => fechar("perdido") } }, ui.icone("fechar"), "Perdeu")));
      }
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
      // plano 1000 · CA-035: concluir tem Desfazer (como Resolver): risca na hora e só grava quando o aviso fecha; Desfazer desmarca
      chk.addEventListener("change", () => {
        if (!chk.checked || pendentesTarefa.has(t.id)) return;
        linha.dataset.feita = "1";
        pendentesTarefa.add(t.id);
        const voltar = () => { pendentesTarefa.delete(t.id); chk.checked = false; delete linha.dataset.feita; };
        const api = A.api;
        if (typeof ui.acaoComDesfazer !== "function") {      // shell sem o aviso com Desfazer: grava na hora, como antes
          api.rpcC("nx_tarefa_concluir", { p_id: t.id, p_concluida: true })
            .then(() => { pendentesTarefa.delete(t.id); ui.toast("Tarefa concluída.", { tipo: "ok" }); A.acoes.recarregarVer(); }, e => { voltar(); A.acoes.tratarErro(e); });
          return;
        }
        Promise.resolve(ui.acaoComDesfazer({
          texto: `Tarefa concluída · ${t.titulo}`,
          aplicar: () => {},
          firmar: async ({ saindo = false } = {}) => {
            try { await api.rpcC("nx_tarefa_concluir", { p_id: t.id, p_concluida: true }, saindo ? { keepalive: true } : {}); }
            catch (e) { voltar(); throw e; }
            pendentesTarefa.delete(t.id);
            A.acoes.recarregarVer();
          },
          reverter: voltar,
        })).then(r => { if (r && r.estado === "falhou" && r.erro) A.acoes.tratarErro(r.erro); }, e => A.acoes.tratarErro(e));
      });
      if (pendentesTarefa.has(t.id)) { chk.checked = true; linha.dataset.feita = "1"; }
      linha.append(chk, h("label", { for: idc }, h("b", null, t.titulo)),
        h("small", { dataset: { atrasada: t.atrasada ? "1" : "0" } }, t.vence_em ? `${t.atrasada ? "Atrasada · " : ""}${ui.relativo(t.vence_em)}` : "Sem prazo",
          t.dono && t.dono.nome ? ` · ${t.dono.nome}` : ""));
      // plano 1000 · CA-084: adiar em um toque (amanhã às 9h, mais 1 hora ou escolher) — antes só dava para concluir
      if (A.podeEscrever) {
        const bAdiar = h("button", { type: "button", class: "bt-icone cvt-tar-adiar", "aria-label": `Adiar: ${t.titulo}`, title: "Adiar", dataset: { foco: `adiar-${t.id}` } }, ui.icone("relogio"));
        bAdiar.addEventListener("click", () => ui.menu(bAdiar, [
          { rotulo: "Amanhã às 9h", icone: "calendario", fn: () => adiarTarefa(t, L.adiarTarefa("amanha9")) },
          { rotulo: "Mais 1 hora", icone: "relogio", fn: () => adiarTarefa(t, L.adiarTarefa("1h", t.vence_em && Date.parse(t.vence_em) > Date.now() ? new Date(t.vence_em) : new Date())) },
          { rotulo: "Escolher…", icone: "editar", fn: () => escolherPrazo(t) },
        ]));
        linha.appendChild(bAdiar);
      }
      return linha;
    });
    return secao({ id: "tarefas", titulo: "Tarefas", acao: nova, contador: itens.length || null }, itens.length ? h("div", null, itens) : h("p", { class: "cvt-vazio" }, "Nenhuma tarefa aberta."));
  }

  /** CA-084: novo prazo da tarefa (nx_tarefa_salvar com {id, vence_em} — só o prazo muda). */
  async function adiarTarefa(t, iso) {
    if (!iso) return;
    try {
      await A.api.rpcC("nx_tarefa_salvar", { p_tarefa: { id: t.id, vence_em: iso } });
      ui.toast(`Tarefa adiada para ${ui.dataHoraBR(iso)}.`, { tipo: "ok" });
      A.acoes.recarregarVer();
    } catch (e) { A.acoes.tratarErro(e); }
  }
  async function escolherPrazo(t) {
    const f = h("form", { class: "pilha", novalidate: true }, ui.campo({ rotulo: "Novo prazo (horário de Brasília)", nome: "vence_em", tipo: "datahora", valor: L.datahoraSP(t.vence_em) || undefined }));   // plano 1000b · CB-060: começa no prazo atual
    const iso = await ui.modal({ titulo: `Adiar: ${t.titulo}`, corpo: f, largura: "p",
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Adiar", tipo: "primario", fn: () => {
        const d = ui.lerForm(f);
        const v = d.vence_em ? L.isoDeSP(d.vence_em) : null;
        if (!v) { ui.marcarErro(f, "vence_em", "Escolha a data e a hora."); return false; }
        return v;
      } }] });
    if (iso) adiarTarefa(t, iso);
  }

  async function novaTarefa(ver) {
    const ct = ver.contato || {};
    const conv = ver.conversa || {};
    // CA-037: «Para quem» — a tarefa pode ficar com outra pessoa da equipe (padrão: quem cria)
    const pessoas = ((A.base && A.base.usuarios) || []).filter(u => u && u.papel !== "leitura" && u.aprovado !== false);
    const eu = A.eu && A.eu.id;
    const f = h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: "O que fazer", nome: "titulo", obrigatorio: true, max: 160, placeholder: "Ex.: Ligar para confirmar a avaliação" }),
      ui.campo({ rotulo: "Tipo", nome: "tipo", tipo: "select", valor: "tarefa", opcoes: [
        { valor: "tarefa", rotulo: "Tarefa" }, { valor: "ligacao", rotulo: "Ligação" }, { valor: "whatsapp", rotulo: "WhatsApp" },
        { valor: "reuniao", rotulo: "Reunião" }, { valor: "visita", rotulo: "Visita" }, { valor: "email", rotulo: "E-mail" }] }),
      pessoas.length > 1 ? ui.campo({ rotulo: "Para quem", nome: "dono_id", tipo: "select", valor: eu || "",
        opcoes: pessoas.map(u => ({ valor: u.id, rotulo: u.id === eu ? `${u.nome} (você)` : u.nome })) }) : null,
      ui.campo({ rotulo: "Vence em (horário de Brasília)", nome: "vence_em", tipo: "datahora" }));
    let passadoConfirmado = null;   // CB-061
    const r = await ui.modal({ titulo: "Nova tarefa", corpo: f, largura: "p",
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Criar tarefa", tipo: "primario", fn: async () => {
        const d = ui.lerForm(f);
        if (!d.titulo) { ui.marcarErro(f, "titulo", "Escreva o que precisa ser feito."); return false; }
        // CA-036: o horário digitado é de São Paulo (como o resto do Órbita), nunca o fuso do aparelho
        const vence = d.vence_em ? L.isoDeSP(d.vence_em) : null;
        // plano 1000b · CB-061: prazo no passado nasce atrasado — avisa no 1º toque; o 2º (com o mesmo horário) cria assim mesmo
        if (vence && Date.parse(vence) < Date.now() && passadoConfirmado !== vence) { passadoConfirmado = vence; ui.marcarErro(f, "vence_em", "Esse horário já passou. Toque em «Criar tarefa» de novo para criar assim mesmo."); return false; }
        // plano 1000b · CB-135: a mesma regra do atalho da Agenda — o negócio ligado ou, sem ele, o único aberto do contato
        const negT = L.negocioParaAgenda(ver);
        const tarefa = { titulo: d.titulo, tipo: d.tipo, vence_em: vence, contato_id: ct.id, negocio_id: conv.negocio ? conv.negocio.id : negT ? negT.id : null };
        if (d.dono_id && d.dono_id !== eu) tarefa.dono_id = d.dono_id;
        return A.api.rpcC("nx_tarefa_salvar", { p_tarefa: tarefa });
      } }] });
    if (r) { ui.toast("Tarefa criada.", { tipo: "ok" }); A.acoes.recarregarVer(); }
  }

  function blocoAtendimentos(ver) {
    const lista = ver.atendimentos || [];
    const itens = lista.map(a => {
      const atual = a.id === A.selId;
      // plano 1000b · CB-096: o atual fica alcançável pelo Tab e pelo leitor (aria-current + aria-disabled, sem `disabled`)
      return h("button", { type: "button", class: "cvt-at", "aria-current": atual ? "true" : null, "aria-disabled": atual ? "true" : null, dataset: { foco: `at-${a.id}` },
        title: atual ? "Este é o atendimento aberto" : null, on: { click: () => { if (!atual) A.acoes.abrir(a.id); } } },
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
    // CA-004: sem IA configurada a seção diz isso (sem botão que só dá erro); com a cota gasta o botão fica desligado com o motivo
    const ia0 = A.base && A.base.ia;
    const semIA = !ia0 || ia0.ligada === false;
    const cota0 = ia0 && ia0.cota;
    const semCota = !semIA && !!(cota0 && cota0.limite != null && Number(cota0.usadas) >= Number(cota0.limite));
    if (r && r.texto) {
      // CA-039: o resumo vive só na memória desta aba — «Guardar como nota interna» deixa para a equipe (e não paga de novo)
      const guardar = A.podeEscrever && A.acoes.nota ? h("button", { type: "button", class: "bt bt-fant bt-p cvt-resumo-nota", dataset: { foco: "resumo-nota" }, disabled: !!r.guardado },
        ui.icone("nota"), r.guardado ? "Guardado como nota" : "Guardar como nota interna") : null;
      if (guardar && !r.guardado) guardar.addEventListener("click", async () => {
        try {
          await ui.carregando(guardar, A.acoes.nota(`Resumo da IA: ${r.texto}`, { req: r.req || (r.req = L.novoUuid()), conversa: conv.id }));
          r.guardado = true;
          ui.toast("Resumo guardado como nota interna.", { tipo: "ok" });
          render();
        } catch (e) { A.acoes.tratarErro(e); }
      });
      saida.append(h("p", null, r.texto), h("small", null, `Gerado ${ui.relativo(r.em)} pela IA — confira antes de usar.`), guardar);
    }
    else saida.appendChild(h("p", { class: "cvt-vazio" }, semIA ? "A IA ainda não foi configurada para esta empresa." : "Um parágrafo com o que o cliente quer, o que já foi combinado e o próximo passo."));
    // plano 1000b · CB-062: cada resumo gasta 1 da cota — o botão diz; com menos de 10% da cota sobrando, «Refazer» pergunta antes
    const restaCota = cota0 && cota0.limite != null ? Number(cota0.limite) - (Number(cota0.usadas) || 0) : null;
    const tituloB = semCota ? "A cota de IA do mês acabou" : restaCota !== null ? `${r ? "Refazer" : "Resumir"} usa 1 da cota de IA (restam ${restaCota})` : `${r ? "Refazer" : "Resumir"} usa 1 da cota de IA`;
    const b = semIA ? null : h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { foco: "resumir" }, disabled: semCota, title: tituloB, "aria-label": r && !semCota ? "Refazer o resumo (usa 1 da cota)" : null }, ui.icone("ia"), r ? "Refazer" : "Resumir");
    if (b) b.addEventListener("click", async () => {
      const ia = A.base && A.base.ia;
      if (ia && ia.ligada === false) { ui.toast("A IA ainda não foi configurada para esta empresa.", { tipo: "info" }); return; }
      const ct = ia && ia.cota;
      const resta = ct && ct.limite != null && Number(ct.limite) > 0 ? Number(ct.limite) - (Number(ct.usadas) || 0) : null;
      if (r && resta !== null && resta < Number(ct.limite) * 0.1) {
        const seguir = await ui.confirmar({ titulo: "Refazer o resumo?", rotulo: "Refazer", texto: `Restam ${resta} usos da cota de IA neste mês e o resumo gasta 1. O resumo atual continua aqui se você não refizer.` });
        if (!seguir) return;
      }
      try {
        const x = await ui.carregando(b, A.api.fn("nx-ia", { acao: "resumir", conversa: conv.id }));
        const texto = x && typeof x.texto === "string" ? x.texto.trim() : "";
        if (!texto) throw Object.assign(new Error("ia_indisponivel"), { codigo: "ia_indisponivel" });
        // plano 1000 · CA-241: o resumo também gasta a cota — a tela soma (como no «Sugerir»), para não liberar pedidos que o servidor recusa
        const cota = A.base && A.base.ia && A.base.ia.cota;
        if (cota) cota.usadas = (Number(cota.usadas) || 0) + 1;
        resumos.set(conv.id, { texto, em: new Date().toISOString() });
        if (A.ver && A.ver.conversa && A.ver.conversa.id === conv.id) render();
      } catch (e) {
        // CA-088: o motivo de verdade (sem chave, demorou, conversa sem mensagens…)
        const er = L.erroIA(e);
        ui.toast(er.texto, { tipo: er.tipo });
      }
    });
    return secao({ id: "resumo-ia", titulo: "Resumo da conversa", acao: b }, saida);
  }

  /* ---------------- desenho por seção (D1) */
  const sig = v => JSON.stringify(v);
  /** As seções da conversa, cada uma com a assinatura do que ela mostra: só a que mudou é refeita. */
  function definicoes(ver) {
    const ct = ver.contato || {}, conv = ver.conversa || {};
    const rastreio = rastreioDe(ver);
    const temCrm = !!(A.ctx.temModulo && A.ctx.temModulo("crm"));
    const negAgenda = L.negocioParaAgenda(ver);
    return [
      { chave: "contato", sig: sig([ct.id, ct.nome, ct.telefone, ct.optin_marketing, ct.optin_origem, ct.bloqueado, ct.origem, ct.plataforma, A.podeEscrever, editandoNome && editandoNome.ctId === ct.id ? [editandoNome.salvando, editandoNome.erro] : 0]),
        criar: () => blocoTopo(ver) },
      { chave: "resumo", sig: sig([L.resumoContato(ver), serieDias().sig, ct.id, ct.telefone, conv.protocolo, temCrm, negAgenda && negAgenda.id, !!A.G]),
        criar: () => blocoResumoContato(ver) },
      { chave: "dados", sig: sig([ver.anuncio, ct.origem, ct.email, ct.cidade, ct.uf, ct.campos, conv.protocolo, conv.departamento && conv.departamento.nome, conv.atribuida && conv.atribuida.nome, conv.atribuida_nome,
        conv.primeira_resposta_em, conv.aberta_em, !!rotulos, !!crmBase /* CB-064: relida depois de falhar */, rastreio, A.podeEscrever, conv.departamento_id, horarioDe(conv) === undefined ? "-" : horarioDe(conv),
        editandoCampo && editandoCampo.ctId === ct.id ? [editandoCampo.campo, editandoCampo.salvando, editandoCampo.erro] : 0]),
        criar: () => blocoDados(ver, rastreio) },
      { chave: "etiquetas", sig: sig([conv.id, A.podeEscrever, ((A.base && A.base.etiquetas) || []).map(e => [e.id, e.nome, e.cor]), A.podeEscrever ? 0 : conv.etiquetas]),
        criar: () => blocoEtiquetas(ver), atualizar: el => atualizarEtiquetas(el, ver) },
      { chave: "negocios", sig: sig([(ver.negocios || []).map(n => [n.id, n.titulo, n.valor_previsto, n.estagio_nome, n.estagio_cor, n.origem, n.anuncio, n.tarefa && n.tarefa.atrasada,
        n.estagio_id, n.funil_id, n.status, n.estagio_tipo]), conv.negocio && conv.negocio.id, A.podeEscrever, !!crmBase, typeof A.ctx.moverNegocio === "function"]),
        criar: () => blocoNegocios(ver) },
      // plano 1000b · CB-063: o texto relativo já calculado (ui.relativo) no lugar do minuto — a seção (e o menu «Adiar» aberto) só é refeita
      // quando «em 5 min» vira «em 4 min», não a cada minuto; + negAgenda: a tarefa nova leva o único negócio aberto (CB-135)
      { chave: "tarefas", sig: sig([(ver.tarefas || []).map(t => [t.id, t.titulo, t.vence_em, t.atrasada, t.dono && t.dono.nome, t.vence_em ? ui.relativo(t.vence_em) : ""]), A.podeEscrever, conv.id, conv.negocio && conv.negocio.id, negAgenda && negAgenda.id]),   // + negócio: a tarefa nova leva o negócio recém-ligado
        criar: () => blocoTarefas(ver) },
      { chave: "atendimentos", sig: sig([(ver.atendimentos || []).map(a => [a.id, a.protocolo, a.status, a.aberta_em, a.atribuida_nome]), A.selId]),
        criar: () => blocoAtendimentos(ver) },
      { chave: "resumo-ia", sig: sig([conv.id, (resumos.get(conv.id) || {}).em || null, !!(resumos.get(conv.id) || {}).guardado, A.base && A.base.ia ? [A.base.ia.ligada, A.base.ia.cota] : null, A.podeEscrever]), criar: () => blocoResumo(ver) },
    ];
  }
  /** A pessoa está mexendo nesta seção: nome aberto, campo de texto com o foco ou etiqueta a caminho do servidor. */
  function emEdicao(chave, el) {
    if (chave === "contato") return !!editandoNome;      // o único campo de texto do cartão é o do nome
    if (chave === "dados" && editandoCampo) return true; // CA-081: e-mail/cidade abertos: o pulso não refaz a seção no meio da digitação
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
    carregarCrm();   // plano 1000b · CB-064: a cada desenho (o guarda decide): a base que falhou volta depois de 60 s mesmo sem a seção mudar
    const ver = A.ver;
    if (!ver) {
      cont = null; contConversa = null; secoes.clear(); seletor = null; editandoNome = null; editandoCampo = null;
      ui.limpar(alvo);
      // plano 1000b · CB-131: a conversa não abriu (erro) — vazio com o motivo, não o esqueleto para sempre
      if (A.selId && A.erroVer === A.selId) alvo.appendChild(h("div", { class: "cvt-sec cvt-sem-detalhes" }, h("p", { class: "sub" }, "Sem detalhes: a conversa não abriu.")));
      else if (A.selId) alvo.appendChild(h("div", { class: "cvt-sec" }, ui.esqueleto("lista", 3)));
      return;
    }
    const convId = ver.conversa ? ver.conversa.id : null;
    if (!cont || contConversa !== convId || cont.parentNode !== alvo) {
      // outra conversa (ou outro lugar): desenha do zero — a edição de nome da anterior é abandonada SEM gravar
      secoes.clear(); seletor = null; editandoNome = null; editandoCampo = null;
      ui.limpar(alvo);
      cont = h("div", { class: "cv-lat", dataset: { conversa: convId ?? "" } });
      contConversa = convId;
      alvo.appendChild(cont);
    }
    let anterior = null;
    const vivas = new Set();
    // plano 1000 · CA-237: com um resumo da IA pronto, a seção sobe para logo depois do cartão do contato (é o que quem pega a conversa no meio lê primeiro)
    const defs = definicoes(ver);
    const comResumo = !!(resumos.get(convId) || {}).texto;
    if (comResumo) { const i = defs.findIndex(x => x.chave === "resumo-ia"); if (i > 1) defs.splice(1, 0, ...defs.splice(i, 1)); }
    for (const d of defs) {
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
