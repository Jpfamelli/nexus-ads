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

  function secao(titulo, acao, ...filhos) {
    return h("section", { class: "cvt-sec" }, h("div", { class: "cvt-sec-cab" }, h("h3", { class: "rotulo" }, titulo), acao || null), ...filhos);
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

    return [topo, h("section", { class: "cvt-sec" }, anuncio, anuncio ? h("div", { class: "cvt-esp" }) : null, dados),
      secao("Etiquetas", null, etq)];
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
    return secao(A.ctx.vocab.negocios || "Negócios", novo,
      itens.length ? h("div", null, itens) : h("p", { class: "cvt-vazio" }, "Nada em aberto para este contato."));
  }

  function blocoTarefas(ver) {
    const tarefas = ver.tarefas || [];
    const nova = A.podeEscrever ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => novaTarefa(ver) } }, ui.icone("mais"), "Tarefa") : null;
    const itens = tarefas.map(t => {
      const idc = `cvt-t-${t.id}`;
      const chk = h("input", { type: "checkbox", id: idc, disabled: !A.podeEscrever, "aria-label": `Concluir: ${t.titulo}` });
      chk.addEventListener("change", async () => {
        try { await A.api.rpcC("nx_tarefa_concluir", { p_id: t.id, p_concluida: true }); ui.toast("Tarefa concluída.", { tipo: "ok" }); A.acoes.recarregarVer(); }
        catch (e) { chk.checked = false; A.acoes.tratarErro(e); }
      });
      return h("div", { class: "cvt-tar" }, chk, h("label", { for: idc }, h("b", null, t.titulo)),
        h("small", { dataset: { atrasada: t.atrasada ? "1" : "0" } }, t.vence_em ? `${t.atrasada ? "Atrasada · " : ""}${ui.relativo(t.vence_em)}` : "Sem prazo",
          t.dono && t.dono.nome ? ` · ${t.dono.nome}` : ""));
    });
    return secao("Tarefas", nova, itens.length ? h("div", null, itens) : h("p", { class: "cvt-vazio" }, "Nenhuma tarefa aberta."));
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
    return secao("Atendimentos", null, itens.length ? h("div", null, itens) : h("p", { class: "cvt-vazio" }, "Primeiro atendimento."));
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
    return secao("Resumo da conversa", b, saida);
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
