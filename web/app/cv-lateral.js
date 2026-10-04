/* ============================================================
   ÓRBITA — cv-lateral.js · frente F5 · ESPEC §7.7 T4 (painel lateral)
   Cartão do contato (nome editável, telefone, e-mail, origem / "Veio
   do anúncio «…»", opt-out, etiquetas da conversa, campos), negócios
   abertos (abre a gaveta do CRM; "+ Novo" cria já ligado à conversa;
   "Ligar a este atendimento"), tarefas abertas (+ nova, concluir) e
   atendimentos anteriores (protocolos). Em telas ≤ 1280 px o mesmo
   conteúdo vai para uma gaveta ("Detalhes").
   ============================================================ */

export function criarLateral(A) {
  const { ui, L } = A;
  const h = ui.h;
  let alvo = null;

  const ORIGEM = { anuncio: "Anúncio", whatsapp: "WhatsApp", indicacao: "Indicação", organico: "Orgânico", manual: "Cadastro manual", site: "Site", importacao: "Importação" };

  function montarEm(container) { alvo = container; render(); }

  // rótulos dos campos personalizados (do CRM); sem o CRM, a chave vira rótulo legível
  let rotulos = null, pedindoRotulos = false;
  function rotuloCampo(k) {
    if (!rotulos && !pedindoRotulos && A.ctx.temModulo && A.ctx.temModulo("crm")) {
      pedindoRotulos = true;
      A.api.rpcC("nx_crm_base").then(b => { rotulos = {}; for (const c of (b && b.campos) || []) if (c.entidade === "contato") rotulos[c.chave] = c.rotulo; render(); }).catch(() => { rotulos = {}; });
    }
    return (rotulos && rotulos[k]) || k.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
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
    return h("div", { class: "cvt-mini" },
      h("div", { class: "cvt-mini-cab" }, h("span", { class: "rotulo" }, "Mensagens · 7 dias"), h("span", { class: "cvt-mini-total dado" }, String(total))),
      caixa,
      h("p", { class: "sr-only" }, resumo),
      h("details", { class: "cvt-mini-det" }, h("summary", null, "Ver números"), tabela));
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
  /** Atalhos: ligar, copiar o protocolo, agenda (quando a empresa tem o módulo) e a ficha completa. */
  function blocoAtalhos(ver) {
    const ct = ver.contato || {}, conv = ver.conversa || {};
    const atalho = (icone, rotulo, props) => h(props.href ? "a" : "button", { class: "cvt-atalho", ...(props.href ? {} : { type: "button" }), ...props }, ui.icone(icone), h("span", null, rotulo));
    const temCrm = !!(A.ctx.temModulo && A.ctx.temModulo("crm"));
    return h("div", { class: "cvt-atalhos", role: "group", "aria-label": "Atalhos" },
      ct.telefone ? atalho("telefone", "Ligar", { href: `tel:+${String(ct.telefone).replace(/\D/g, "")}`, title: `Ligar para ${ui.telBR(ct.telefone)}` }) : null,
      conv.protocolo ? atalho("copiar", "Protocolo", { title: `Copiar o protocolo ${conv.protocolo}`, on: { click: () => ui.copiar(conv.protocolo, { aviso: "Protocolo copiado." }) } }) : null,
      temCrm ? atalho("calendario", "Agenda", { href: "#/agenda", title: "Abrir a agenda" }) : null,
      ct.id ? atalho("contato", "Ficha", { title: "Abrir a ficha completa", on: { click: () => A.ctx.abrirContato(ct.id, { aoMudar: () => A.acoes.recarregarVer() }) } }) : null);
  }

  function editarNome(ct, caixa) {
    if (!A.podeEscrever) return;
    const inp = h("input", { type: "text", value: ct.nome || "", maxlength: 160, "aria-label": "Nome do contato" });
    ui.limpar(caixa);
    caixa.appendChild(inp);
    inp.focus(); inp.select();
    let feito = false;
    const salvar = async () => {
      if (feito) return; feito = true;
      const novo = inp.value.trim();
      if (!novo || novo === (ct.nome || "")) { render(); return; }
      try {
        await A.api.rpcC("nx_contato_salvar", { p_contato: { id: ct.id, nome: novo } });
        ui.toast("Nome atualizado.", { tipo: "ok" });
        A.acoes.recarregarVer();
        A.acoes.carregarLista({});
      } catch (e) { A.acoes.tratarErro(e); render(); }
    };
    inp.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); salvar(); } else if (ev.key === "Escape") { feito = true; render(); } });
    inp.addEventListener("blur", salvar);
  }

  function blocoContato(ver) {
    const ct = ver.contato || {};
    const conv = ver.conversa || {};
    const nome = A.acoes.nomeContato(ct);
    const caixaNome = h("div", { class: "cvt-nome" }, h("h2", null, nome),
      A.podeEscrever ? h("button", { type: "button", class: "bt-icone", "aria-label": "Editar nome", title: "Editar nome", on: { click: () => editarNome(ct, caixaNome) } }, ui.icone("editar")) : null);
    const selos = h("div", { class: "cvt-selos" });
    if (ct.optin_marketing === false) selos.appendChild(ui.pilula("Não quer marketing", "aten", { title: ct.optin_origem || "Pediu para não receber marketing" }));
    if (ct.bloqueado) selos.appendChild(ui.pilula("Bloqueado", "ruim"));
    const origem = ORIGEM[ct.origem] || ct.origem;
    if (origem && ct.origem !== "anuncio") selos.appendChild(ui.pilula(origem, "neutra"));
    const topo = h("div", { class: "cvt-contato" }, ui.avatar(nome, ct.id), caixaNome,
      ct.telefone ? h("div", { class: "cvt-tel" }, ui.telBR(ct.telefone)) : null,
      selos.childNodes.length ? selos : null,
      h("div", { class: "linha" },
        ct.telefone ? h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => ui.copiar(ct.telefone, { aviso: "Telefone copiado." }) } }, ui.icone("copiar"), "Copiar") : null,
        h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => A.ctx.abrirContato(ct.id, { aoMudar: () => A.acoes.recarregarVer() }) } }, ui.icone("contato"), "Abrir ficha")));

    const an = ver.anuncio;
    const anuncio = an || ct.origem === "anuncio" ? h("div", { class: "cvt-anuncio" }, ui.icone("anuncio"),
      h("div", null, h("b", null, "Veio do anúncio"), an && (an.anuncio_nome || an.campanha_nome)
        ? h("div", null, [an.anuncio_nome ? `«${an.anuncio_nome}»` : null, an.campanha_nome ? `campanha «${an.campanha_nome}»` : null].filter(Boolean).join(" · "))
        : h("div", { class: "fraco" }, an && an.plataforma === "google" ? "Google Ads" : "Meta (Facebook/Instagram)"))) : null;

    const dados = h("dl", { class: "cvt-dl" });
    const add = (k, v) => { if (v !== null && v !== undefined && v !== "") dados.append(h("dt", null, k), h("dd", null, v)); };
    add("E-mail", ct.email);
    add("Cidade", [ct.cidade, ct.uf].filter(Boolean).join(" · "));
    const campos = ct.campos && typeof ct.campos === "object" ? Object.entries(ct.campos).filter(([, v]) => v !== null && v !== "" && (typeof v !== "object" || Array.isArray(v))).slice(0, 4) : [];
    for (const [k, v] of campos) add(rotuloCampo(k), Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v));
    add("Atendimento", h("span", { class: "mono" }, conv.protocolo || ""));
    add("Departamento", conv.departamento ? conv.departamento.nome : null);
    add("Com", conv.atribuida ? conv.atribuida.nome : "Sem dono");
    if (conv.primeira_resposta_em && conv.aberta_em) {
      const min = Math.max(0, Math.round((Date.parse(conv.primeira_resposta_em) - Date.parse(conv.aberta_em)) / 60000));
      add("1ª resposta", min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);
    }

    const etq = A.podeEscrever
      ? ui.seletorEtiquetas({ todas: (A.base && A.base.etiquetas) || [], marcadas: conv.etiquetas || [], rotulo: "Etiquetas da conversa",
          aoMudar: ids => A.acoes.etiquetas(ids), podeCriar: nome => A.acoes.criarEtiqueta(nome) })
      : h("div", { class: "linha" }, (conv.etiquetas || []).map(id => ((A.base && A.base.etiquetas) || []).find(e => e.id === id)).filter(Boolean).map(e => ui.etiqueta(e)));

    return [topo, blocoResumoContato(ver), secao({ id: "dados", titulo: "Dados" }, anuncio, anuncio ? h("div", { class: "cvt-esp" }) : null, dados),
      secao({ id: "etiquetas", titulo: "Etiquetas", contador: (conv.etiquetas || []).length || null }, etq)];
  }

  function blocoNegocios(ver) {
    const conv = ver.conversa || {};
    const lista = ver.negocios || [];
    const neg = A.ctx.vocab.negocio || "Negócio";
    const novo = A.podeEscrever
      ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: async () => {
          await A.ctx.novoNegocio({ contato_id: ver.contato && ver.contato.id, conversa_id: conv.id }, {
            aoCriar: n => { if (n && n.id && !conv.negocio) A.acoes.vincular(n.id); else A.acoes.recarregarVer(); } });
        } } }, ui.icone("mais"), `Novo`)
      : null;
    const itens = lista.map(n => {
      const cor = ui.corOk(n.estagio_cor);
      const ligado = conv.negocio && conv.negocio.id === n.id;
      const b = h("button", { type: "button", class: "cvt-neg", dataset: { ligado: ligado ? "1" : "0" },
        on: { click: () => A.ctx.abrirNegocio(n.id, { aoMudar: () => A.acoes.recarregarVer() }) } },
        h("span", { class: "cvt-neg-l1" }, h("b", null, n.titulo || (n.contato && n.contato.nome) || neg),
          h("span", { class: "mono" }, n.valor_previsto != null ? ui.brl(n.valor_previsto, { centavos: false }) : "")),
        h("span", { class: "cvt-neg-l2" },
          n.estagio_nome ? h("span", { class: "cv-etapa", style: cor ? { "--cor": cor } : null, title: n.estagio_nome }, h("span", null, n.estagio_nome)) : null,
          n.anuncio ? ui.pilula("Anúncio", "meta") : null,
          ligado ? h("span", { class: "cvt-ligado" }, "Este atendimento") : null,
          n.tarefa && n.tarefa.atrasada ? ui.pilula("Tarefa atrasada", "ruim") : null));
      const wrap = h("div", null, b);
      if (A.podeEscrever && !ligado) {
        wrap.appendChild(h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => A.acoes.vincular(n.id) } }, ui.icone("link"), "Ligar a este atendimento"));
      }
      return wrap;
    });
    return secao({ id: "negocios", titulo: A.ctx.vocab.negocios || "Negócios", acao: novo, contador: itens.length || null },
      itens.length ? h("div", null, itens) : h("p", { class: "cvt-vazio" }, "Nada em aberto para este contato."));
  }

  function blocoTarefas(ver) {
    const tarefas = ver.tarefas || [];
    const nova = A.podeEscrever ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => novaTarefa(ver) } }, ui.icone("mais"), "Tarefa") : null;
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
      return h("button", { type: "button", class: "cvt-at", "aria-current": atual ? "true" : null, disabled: atual,
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
    const b = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("ia"), r ? "Refazer" : "Resumir");
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

  function render() {
    if (!alvo) return;
    ui.limpar(alvo);
    const ver = A.ver;
    if (!ver) {
      if (A.selId) alvo.appendChild(h("div", { class: "cvt-sec" }, ui.esqueleto("lista", 3)));
      return;
    }
    const cont = h("div", { class: "cv-lat" }, ...blocoContato(ver), blocoNegocios(ver), blocoTarefas(ver), blocoAtendimentos(ver), blocoResumo(ver));
    alvo.appendChild(cont);
  }

  return { montarEm, render };
}
