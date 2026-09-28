/* ============================================================
   ÓRBITA — cv-lista.js · frente F5 · ESPEC §7.7 T4 (coluna da lista)
   Abas com contadores, busca (nome / telefone / protocolo), filtros
   (departamento, número, atendente, etiquetas, só não lidas),
   "Nova conversa" e os itens (avatar, resumo, hora, não lidas,
   etapa do negócio, etiquetas, dono, espera na aba Aguardando).
   Itens são links (#/conversas/<id>) reaproveitados por id para não
   piscar a cada pulso.
   ============================================================ */

export function criarLista(A) {
  const { ui, L } = A;
  const h = ui.h;

  /* ---------------- cabeçalho */
  const sub = h("small", null, "");
  const titulo = h("h1", { class: "cvl-titulo" }, "Conversas", sub);
  const btNova = A.podeEscrever
    ? h("button", { type: "button", class: "bt bt-prim bt-p", title: "Nova conversa", "aria-label": "Nova conversa", on: { click: () => A.acoes.novaConversa() } }, ui.icone("mais"), "Nova")
    : null;

  /* ---------------- busca e filtros */
  const busca = h("input", { type: "search", placeholder: "Nome, telefone, protocolo", "aria-label": "Buscar conversas", autocomplete: "off", value: A.busca || "" });
  const aoBuscar = ui.debounce(() => A.acoes.mudarLista({ busca: busca.value }), 320);
  busca.addEventListener("input", () => { if (busca.value.trim().length === 1) return; aoBuscar(); });
  busca.addEventListener("keydown", ev => { if (ev.key === "Escape" && busca.value) { ev.preventDefault(); busca.value = ""; aoBuscar.cancelar(); A.acoes.mudarLista({ busca: "" }); } });
  const ponto = h("span", { class: "cvl-ponto", hidden: true });
  const btFiltro = h("button", { type: "button", class: "bt-icone cvl-filtro", "aria-label": "Filtros", title: "Filtros" }, ui.icone("filtro"), ponto);
  btFiltro.addEventListener("click", () => abrirFiltros());
  const btAvisos = h("button", { type: "button", class: "bt-icone cvl-avisos", "aria-label": "Avisos de mensagem nova", title: "Avisos de mensagem nova" }, ui.icone("sino"));
  btAvisos.addEventListener("click", () => A.acoes.menuAvisos(btAvisos));

  /* ---------------- abas */
  const abasEl = h("div", { class: "cvl-abas", role: "tablist", "aria-label": "Situação das conversas" });
  const botoesAba = new Map();
  function montarAbas() {
    ui.limpar(abasEl); botoesAba.clear();
    for (const a of L.ABAS) {
      if (a.min && !A.acoes.pode(a.min)) continue;
      if (a.id === "minhas" && !A.podeEscrever) continue;
      const n = h("span", { class: "n" });
      const b = h("button", { type: "button", role: "tab", class: "cvl-aba", id: `cvl-aba-${a.id}`, "aria-controls": "cvl-lista", dataset: { aba: a.id } }, a.rotulo, n);
      b.addEventListener("click", () => { if (A.aba !== a.id || A.busca) { busca.value = ""; A.acoes.mudarLista({ aba: a.id, busca: "" }); } });
      botoesAba.set(a.id, { b, n });
      abasEl.appendChild(b);
    }
    abasEl.addEventListener("keydown", ev => {
      const arr = [...botoesAba.values()].map(x => x.b);
      const i = arr.indexOf(document.activeElement);
      if (i < 0) return;
      let j = null;
      if (ev.key === "ArrowRight") j = (i + 1) % arr.length; else if (ev.key === "ArrowLeft") j = (i - 1 + arr.length) % arr.length;
      else if (ev.key === "Home") j = 0; else if (ev.key === "End") j = arr.length - 1;
      if (j !== null) { ev.preventDefault(); arr[j].focus(); arr[j].click(); }
    });
  }
  montarAbas();

  const avisoCanal = h("div", { class: "cvl-aviso", hidden: true });
  const infoBusca = h("div", { class: "cvl-busca-info", hidden: true });
  const lista = h("div", { class: "cvl-lista", id: "cvl-lista", role: "tabpanel" });
  const maisBox = h("div", { class: "cvl-mais", hidden: true });
  const btMais = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Carregar mais");
  btMais.addEventListener("click", () => ui.carregando(btMais, A.acoes.carregarLista({ mais: true })));
  maisBox.appendChild(btMais);

  const el = h("div", { class: "cvl" },
    h("header", { class: "cvl-cab" }, titulo, btNova),
    h("div", { class: "cvl-busca" }, h("label", { class: "busca" }, ui.icone("busca"), busca), btFiltro, btAvisos),
    abasEl, avisoCanal, infoBusca, lista);

  /* ---------------- filtros (popover) */
  function filtrosAtivos() {
    const f = A.filtro || {};
    return !!(f.departamento_id || f.canal_id || f.atendente || (f.etiquetas && f.etiquetas.length) || f.nao_lidas);
  }
  function abrirFiltros() {
    const f = { ...(A.filtro || {}) };
    const deps = (A.base && A.base.departamentos) || [];
    const canais = (A.base && A.base.canais) || [];
    const pessoas = ((A.base && A.base.usuarios) || []).filter(u => u.papel !== "leitura");
    const etqs = (A.base && A.base.etiquetas) || [];
    const sel = (id, rot, ops, valor) => h("div", { class: "campo" }, h("label", { for: id }, rot),
      h("select", { id, class: "sel cvf-sel" }, ops.map(o => h("option", { value: o.v, selected: String(o.v) === String(valor || "") }, o.r))));
    const cDep = deps.length > 1 ? sel("cvf-dep", "Departamento", [{ v: "", r: "Todos" }, ...deps.map(d => ({ v: d.id, r: d.nome }))], f.departamento_id) : null;
    const cCanal = canais.length > 1 ? sel("cvf-canal", "Número", [{ v: "", r: "Todos" }, ...canais.map(c => ({ v: c.id, r: c.nome }))], f.canal_id) : null;
    const cAt = sel("cvf-at", "Atendente", [{ v: "", r: "Qualquer um" }, { v: "eu", r: "Comigo" }, { v: "sem", r: "Sem dono" },
      ...pessoas.filter(p => !A.eu || p.id !== A.eu.id).map(p => ({ v: p.id, r: p.nome }))], f.atendente);
    const marcadas = new Set(f.etiquetas || []);
    const cEtq = etqs.length ? h("fieldset", { class: "campo" }, h("legend", null, "Etiquetas (qualquer uma)"),
      h("div", { class: "multi-opcoes cvf-etqs" }, etqs.map(e => {
        const idc = `cvf-e-${e.id}`;
        return h("label", { class: "chip-check", for: idc }, h("input", { type: "checkbox", id: idc, value: e.id, checked: marcadas.has(e.id) }), ui.etiqueta(e));
      }))) : null;
    const cNl = ui.campo({ tipo: "interruptor", nome: "nao_lidas", rotulo: "Só não lidas", valor: !!f.nao_lidas });
    const aplicar = h("button", { type: "button", class: "bt bt-prim bt-p" }, "Aplicar");
    const limparB = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Limpar");
    const corpo = h("div", { class: "pilha cvf" },
      h("p", { class: "rotulo" }, "Filtrar a lista"), cDep, cCanal, cAt, cEtq, cNl, h("div", { class: "linha linha-fim" }, limparB, aplicar));
    const pop = ui.flutuante(btFiltro, corpo, { largura: 300 });
    const ler = () => {
      const r = {};
      const v = id => { const x = corpo.querySelector(`#${id}`); return x ? x.value : ""; };
      if (v("cvf-dep")) r.departamento_id = v("cvf-dep");
      if (v("cvf-canal")) r.canal_id = v("cvf-canal");
      if (v("cvf-at")) r.atendente = v("cvf-at");
      const ids = [...corpo.querySelectorAll("fieldset input[type=checkbox]:checked")].map(x => x.value);
      if (ids.length) r.etiquetas = ids;
      const nl = corpo.querySelector("input[name=nao_lidas]");
      if (nl && nl.checked) r.nao_lidas = true;
      return r;
    };
    aplicar.addEventListener("click", () => { pop.fechar(); A.acoes.mudarLista({ filtro: ler() }); });
    limparB.addEventListener("click", () => { pop.fechar(); A.acoes.mudarLista({ filtro: {} }); });
  }

  /* ---------------- itens */
  const cache = new Map();   // id → {el, sig}
  function etiquetaDe(id) { return ((A.base && A.base.etiquetas) || []).find(e => e.id === id); }

  function assinatura(c, sel, minuto) {
    return JSON.stringify([c.contato && c.contato.nome, c.contato && c.contato.telefone, c.ultima_msg_em, c.ultima_msg_resumo, c.ultima_msg_dir,
      c.nao_lidas, c.status, c.atribuida_a, c.atribuida_nome, c.aguardando, c.ultima_entrada_em, c.etiquetas, c.negocio, sel, minuto, A.aba, !!A.busca,
      (A.base && A.base.etiquetas || []).length]);
  }

  function criarItem(c, sel) {
    const nome = A.acoes.nomeContato(c.contato);
    const nl = Number(c.nao_lidas) || 0;
    const resumo = c.ultima_msg_resumo ? String(c.ultima_msg_resumo) : (c.status === "aberta" && !c.ultima_msg_dir ? "Conversa iniciada — sem mensagens ainda" : "");
    const meta = [];
    if (c.negocio && c.negocio.estagio_nome) {
      const cor = ui.corOk(c.negocio.estagio_cor);
      meta.push(h("span", { class: "cv-etapa cvl-etapa", style: cor ? { "--cor": cor } : null, title: `Etapa: ${c.negocio.estagio_nome}` }, h("span", null, c.negocio.estagio_nome)));
    }
    if (c.status === "aberta" && c.aguardando && c.ultima_entrada_em) {
      meta.push(h("span", { class: "cvl-espera", title: "Esperando resposta há" }, ui.icone("relogio"), L.tempoEspera(c.ultima_entrada_em)));
    }
    if (A.busca && c.status !== "aberta") meta.push(ui.pilula(c.status === "resolvida" ? "Resolvida" : "Pendente", c.status === "resolvida" ? "neutra" : "aten"));
    const etqs = (c.etiquetas || []).map(etiquetaDe).filter(Boolean);
    const cabem = meta.length ? 1 : 2;
    for (const e of etqs.slice(0, cabem)) meta.push(ui.etiqueta(e));
    if (etqs.length > cabem) meta.push(h("span", { class: "cvl-mais-etq", title: etqs.slice(cabem).map(e => e.nome).join(", ") }, `+${etqs.length - cabem}`));
    if (c.atribuida_a) {
      const av = ui.avatar(c.atribuida_nome || "?", c.atribuida_a);
      av.classList.add("cvl-dono");
      av.setAttribute("title", `Com ${c.atribuida_nome || "atendente"}`);
      meta.push(av);
    }
    const rotuloA11y = [nome, nl ? `${nl} não ${nl === 1 ? "lida" : "lidas"}` : null,
      resumo ? `${c.ultima_msg_dir === "out" ? "Você: " : ""}${resumo}` : null, L.horaLista(c.ultima_msg_em),
      c.aguardando && c.status === "aberta" ? `esperando há ${L.tempoEspera(c.ultima_entrada_em)}` : null,
      c.atribuida_nome ? `com ${c.atribuida_nome}` : "sem dono"].filter(Boolean).join(", ");
    const a = h("a", { class: "cvl-item", href: `#/conversas/${c.id}`, "aria-current": sel ? "true" : null, "aria-label": rotuloA11y,
      dataset: { id: c.id, naoLida: nl ? "1" : "0" } },
      ui.avatar(nome, c.contato && c.contato.id),
      h("span", { class: "cvl-nome" }, nome),
      h("span", { class: "cvl-hora" }, L.horaLista(c.ultima_msg_em)),
      h("span", { class: "cvl-resumo" }, c.ultima_msg_dir === "out" && resumo ? h("b", null, "Você: ") : null, resumo),
      nl ? h("span", { class: "cvl-badge", "aria-hidden": "true" }, nl > 99 ? "99+" : String(nl)) : h("span", { "aria-hidden": "true" }),
      meta.length ? h("span", { class: "cvl-meta", "aria-hidden": "true" }, meta) : null);
    return a;
  }

  /* ---------------- busca nas mensagens (P0-B) */
  const blocoMsgs = h("section", { class: "cvl-msgs", "aria-label": "Mensagens encontradas", hidden: true });
  /** Desenha o bloco "Nas mensagens"; devolve true quando há algo para mostrar (itens, carregando ou erro). */
  function renderBlocoMsgs() {
    ui.limpar(blocoMsgs);
    const b = A.buscaMsgs;
    const q = (A.busca || "").trim();
    if (!b || q.length < 3 || b.q !== q) { blocoMsgs.hidden = true; return false; }
    blocoMsgs.hidden = false;
    blocoMsgs.appendChild(h("h2", { class: "rotulo cvl-msgs-tit" }, "Nas mensagens"));
    if (b.carregando) { blocoMsgs.appendChild(h("p", { class: "sub cvl-msgs-info", role: "status" }, "Procurando nas mensagens…")); return true; }
    if (b.erro) { blocoMsgs.appendChild(h("p", { class: "sub cvl-msgs-info" }, "Não deu para procurar nas mensagens agora.")); return true; }
    if (!b.itens.length) { blocoMsgs.appendChild(h("p", { class: "sub cvl-msgs-info" }, `Nenhuma mensagem com «${q}».`)); return false; }
    for (const r of b.itens) {
      const partes = L.partesDestaque(r.trecho || "", q).map(p => (p.marca ? h("mark", null, p.t) : p.t));
      const nota = r.tipo === "nota";
      blocoMsgs.appendChild(h("a", { class: "cvl-msg", href: `#/conversas/${r.conversa_id}?msg=${r.mensagem_id}`,
        "aria-label": `${r.contato_nome || "Contato"}${nota ? ", nota interna" : ""}: ${r.trecho || ""}` },
        h("span", { class: "cvl-msg-l1", "aria-hidden": "true" }, h("b", null, r.contato_nome || "Contato"),
          nota ? ui.pilula("Nota", "aten") : null,
          h("time", { class: "cvl-hora", datetime: r.criado_em }, L.horaLista(r.criado_em))),
        h("span", { class: "cvl-msg-trecho", "aria-hidden": "true" }, r.direcao === "out" && !nota ? h("b", null, "Você: ") : null, ...partes)));
    }
    return true;
  }

  let ultimoVazio = null;
  function renderItens({ reset } = {}) {
    if (A.erroLista && !A.itens.length) {
      cache.clear();
      ui.limpar(lista);
      lista.appendChild(ui.erroCartao(A.erroLista, () => A.acoes.carregarLista({ reset: true })));
      return;
    }
    if (A.carregandoLista && reset) { cache.clear(); ui.limpar(lista); lista.appendChild(ui.esqueleto("lista", 8)); return; }
    if (!A.itens.length) {
      cache.clear();
      const aba = L.ABAS.find(x => x.id === A.aba);
      const semCanal = A.base && !(A.base.canais || []).length;
      const bm = A.buscaMsgs;
      const chave = `${A.aba}|${A.busca}|${semCanal}|${filtrosAtivos()}|${bm ? `${bm.q}:${bm.carregando}:${bm.itens.length}:${!!bm.erro}` : "-"}`;
      if (ultimoVazio === chave && (lista.querySelector(".vazio") || lista.contains(blocoMsgs))) return;
      ultimoVazio = chave;
      ui.limpar(lista);
      if (A.busca) {
        const temMsgs = renderBlocoMsgs();
        if (temMsgs) lista.appendChild(h("p", { class: "sub cvl-msgs-info" }, "Nenhum contato ou protocolo com esse termo."));
        else lista.appendChild(ui.vazio({ titulo: "Nada encontrado.", texto: "Confira o nome, o telefone, o protocolo ou um trecho da mensagem.", icone: "busca" }));
        if (!blocoMsgs.hidden) lista.appendChild(blocoMsgs);
      }
      else if (filtrosAtivos()) lista.appendChild(ui.vazio({ titulo: "Nenhuma conversa com esses filtros.", icone: "filtro", acao: { rotulo: "Limpar filtros", fn: () => A.acoes.mudarLista({ filtro: {} }) } }));
      else lista.appendChild(ui.vazio({ titulo: aba ? aba.vazio : "Nada por aqui.", icone: "chat" }));
      maisBox.hidden = true;
      return;
    }
    ultimoVazio = null;
    const minuto = Math.floor(Date.now() / 60000);
    const vivos = new Set();
    const ordem = [];
    for (const c of A.itens) {
      const sel = c.id === A.selId;
      const sig = assinatura(c, sel, minuto);
      let x = cache.get(c.id);
      if (!x || x.sig !== sig) {
        const novo = criarItem(c, sel);
        if (x && x.el.isConnected) x.el.replaceWith(novo);
        x = { el: novo, sig };
        cache.set(c.id, x);
      }
      vivos.add(c.id);
      ordem.push(x.el);
    }
    for (const [id, x] of cache) if (!vivos.has(id)) { x.el.remove(); cache.delete(id); }
    for (const n of [...lista.children]) if (!n.classList.contains("cvl-item") && n !== maisBox && n !== blocoMsgs) n.remove();
    ordem.forEach((node, i) => { if (lista.children[i] !== node) lista.insertBefore(node, lista.children[i] || null); });
    maisBox.hidden = !A.temMais;
    if (!A.temMais) maisBox.remove(); else lista.appendChild(maisBox);
    renderBlocoMsgs();
    if (blocoMsgs.hidden) blocoMsgs.remove(); else lista.appendChild(blocoMsgs);
    if (reset) lista.scrollTop = 0;
  }

  function renderCabecalho() {
    const cont = A.contagens || {};
    for (const [id, { b, n }] of botoesAba) {
      const on = id === A.aba && !A.busca;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on || (!!A.busca && id === A.aba) ? 0 : -1;
      const v = id === "resolvidas" || id === "ocultas" ? null : cont[id];
      n.textContent = v === undefined || v === null ? "" : (v > 999 ? "999+" : String(v));
      n.hidden = v === undefined || v === null;
      n.dataset.alerta = id === "aguardando" && v > 0 ? "1" : "0";
    }
    const ag = Number(cont.aguardando) || 0, nl = Number(cont.nao_lidas) || 0;
    sub.textContent = ag ? `${ag} esperando resposta` : nl ? `${nl} com mensagens novas` : "Tudo respondido";
    ponto.hidden = !filtrosAtivos();
    { const p = A.acoes.lerAvisos(); btAvisos.dataset.ligado = p.som || p.tela ? "1" : "0";
      btAvisos.setAttribute("aria-label", `Avisos de mensagem nova (${p.som ? "som ligado" : "som desligado"}${p.tela ? ", área de trabalho ligada" : ""})`); }
    btFiltro.setAttribute("aria-label", filtrosAtivos() ? "Filtros (ativos)" : "Filtros");
    // sem número conectado
    const semCanal = A.base && !(A.base.canais || []).length;
    avisoCanal.hidden = !semCanal;
    if (semCanal && !avisoCanal.firstChild) {
      const admin = A.acoes.pode("admin");
      avisoCanal.appendChild(h("div", { class: "aviso aviso-aten" }, ui.icone("whatsapp"),
        h("div", { class: "pilha-p" },
          h("p", null, admin ? "Conecte o WhatsApp da empresa para receber conversas aqui." : "Peça ao administrador para conectar o WhatsApp."),
          admin ? h("div", null, h("a", { class: "bt bt-prim bt-p", href: "#/config/numeros" }, "Conectar número")) : null)));
    }
    // busca ativa
    const q = (A.busca || "").trim();
    infoBusca.hidden = q.length < 2;
    if (q.length >= 2) {
      ui.limpar(infoBusca);
      infoBusca.append(h("span", null, `Resultados para «${q}» em todas as abas`),
        h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { busca.value = ""; A.acoes.mudarLista({ busca: "" }); } } }, "Limpar"));
    }
  }

  function render(o = {}) {
    renderCabecalho();
    renderItens(o);
  }

  return {
    el,
    render,
    mostrarCarregando() { cache.clear(); ui.limpar(lista); lista.appendChild(ui.esqueleto("lista", 8)); renderCabecalho(); },
    focarBusca() { busca.focus(); },
  };
}
