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

  /* M35: «Atender o próximo» — abre e assume a que espera há mais tempo; só aparece com fila e para quem pode escrever */
  const nAtender = h("b", { class: "cvl-atender-n", "aria-hidden": "true" }, "");
  const btAtender = A.podeEscrever
    ? h("button", { type: "button", class: "bt bt-sec bt-p cvl-atender", hidden: true, title: "Abre e assume a conversa que espera resposta há mais tempo (Alt+Shift+P)" },
      ui.icone("seta-dir"), h("span", null, "Atender o próximo"), nAtender)
    : null;
  if (btAtender) btAtender.addEventListener("click", () => A.acoes.atenderProximo(btAtender));
  /* M35: a lista anuncia a conversa nova a leitor de tela («Nova mensagem de Mariana, aguardando há 3 min»), no máximo 1 a cada 10 s */
  const leitor = h("div", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  let ultimoAnuncio = 0, textoPendente = null, tAnuncio = null, ultimoTexto = "";
  function dizer(texto) {
    ultimoAnuncio = Date.now();
    leitor.textContent = "";
    setTimeout(() => { ultimoTexto = ultimoTexto === texto ? `${texto}\u200b` : texto; leitor.textContent = ultimoTexto; }, 30);   // esvaziar e repor: o leitor repete até o mesmo texto
  }
  function anunciar(texto) {
    if (!texto) return;
    const falta = L.esperaAnuncio(ultimoAnuncio, Date.now());
    if (falta <= 0) { dizer(texto); return; }
    textoPendente = texto;                                // dentro dos 10 s: o texto mais novo espera a vez
    if (!tAnuncio) tAnuncio = setTimeout(() => { tAnuncio = null; const t = textoPendente; textoPendente = null; if (t && leitor.isConnected) dizer(t); }, falta);
  }

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

  /* ---------------- abas: uma linha só — Minhas · Sem dono · Aguardando (ui.segmentado) + botão "Mais situações ▾" */
  const abasEl = h("div", { class: "cvl-abas" });
  let seg = null, btVisoes = null, abasMais = [];
  const contadoresAba = new Map();   // id → número já conhecido (para o menu "Mais")
  function escolherAba(id) { if (A.aba !== id || A.busca) { busca.value = ""; A.acoes.mudarLista({ aba: id, busca: "" }); } }
  function montarAbas() {
    ui.limpar(abasEl);
    const { fixas, mais } = L.abasVisiveis(A.ctx.papel, A.podeEscrever);
    abasMais = mais;
    seg = ui.segmentado({ opcoes: fixas.map(x => ({ valor: x.id, rotulo: x.rotulo, contador: null })), valor: abaDestaque(), tipo: "abas",
      rotulo: "Situação das conversas", aoMudar: escolherAba });
    // a aba marcada pode ser a mesma que o segmentado "lembra" (quando a atual mora no menu ou há busca): clique e Enter/Espaço escolhem sempre
    seg.addEventListener("click", ev => { const op = ev.target.closest && ev.target.closest(".seg-op"); if (op) escolherAba(op.dataset.valor); });
    seg.addEventListener("keydown", ev => {
      if ((ev.key === "Enter" || ev.key === " ") && abasEl.dataset.semsel === "1") {
        const op = document.activeElement && document.activeElement.closest && document.activeElement.closest(".seg-op");
        if (op) { ev.preventDefault(); ev.stopImmediatePropagation(); escolherAba(op.dataset.valor); }
      }
    }, true);
    abasEl.appendChild(seg);
    if (mais.length) {
      btVisoes = h("button", { type: "button", class: "cvl-visoes", "aria-label": "Mais situações", title: "Mais situações: Todas abertas, Pendentes, Resolvidas" }, ui.icone("seta-baixo"));
      btVisoes.addEventListener("click", () => {
        ui.menu(btVisoes, abasMais.map(x => {
          const n = contadoresAba.get(x.id);
          return { rotulo: n ? `${x.rotulo} · ${n}` : x.rotulo, icone: A.aba === x.id && !A.busca ? "check" : undefined, fn: () => escolherAba(x.id) };
        }));
      });
      abasEl.appendChild(btVisoes);
    }
  }
  /** A aba fixa que fica marcada (ou a 1ª quando a atual mora no menu "Mais"). */
  function abaDestaque() { return L.ABAS_FIXAS.includes(A.aba) ? A.aba : L.ABAS_FIXAS.find(x => !(x === "minhas" && !A.podeEscrever)) || "sem_dono"; }
  montarAbas();

  const avisoCanal = h("div", { class: "cvl-aviso", hidden: true });
  const infoBusca = h("div", { class: "cvl-busca-info", hidden: true });
  const filtrosEl = h("div", { class: "cvl-filtros-ativos", role: "group", hidden: true, "aria-label": "Filtros aplicados" });
  const lista = h("div", { class: "cvl-lista", id: "cvl-lista", role: "tabpanel" });
  const maisBox = h("div", { class: "cvl-mais", hidden: true });
  const btMais = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Carregar mais");
  btMais.addEventListener("click", () => ui.carregando(btMais, A.acoes.carregarLista({ mais: true })));
  maisBox.appendChild(btMais);

  const el = h("div", { class: "cvl" },
    h("header", { class: "cvl-cab" }, titulo, btNova, btAtender),
    leitor,
    h("div", { class: "cvl-busca" }, h("label", { class: "busca" }, ui.icone("busca"), busca), btFiltro, btAvisos),
    infoBusca, filtrosEl, abasEl, avisoCanal, lista);

  /* ---------------- filtros (popover) */
  function filtrosAtivos() {
    const f = A.filtro || {};
    return !!(f.departamento_id || f.canal_id || f.atendente || (f.etiquetas && f.etiquetas.length) || f.nao_lidas);
  }
  function desenharFiltrosAtivos() {
    const f = A.filtro || {};
    const deps = (A.base && A.base.departamentos) || [];
    const canais = (A.base && A.base.canais) || [];
    const pessoas = (A.base && A.base.usuarios) || [];
    const etqs = (A.base && A.base.etiquetas) || [];
    const rotulo = (lista, id, fallback) => lista.find(x => x.id === id)?.nome || fallback;
    const ativos = [];
    if (f.departamento_id) ativos.push({ chave: "departamento_id", rotulo: `Depto.: ${rotulo(deps, f.departamento_id, "selecionado")}` });
    if (f.canal_id) ativos.push({ chave: "canal_id", rotulo: `Número: ${rotulo(canais, f.canal_id, "selecionado")}` });
    if (f.atendente) {
      const nome = f.atendente === "eu" ? "Comigo" : f.atendente === "sem" ? "Sem dono" : rotulo(pessoas, f.atendente, "selecionado");
      ativos.push({ chave: "atendente", rotulo: `Atendente: ${nome}` });
    }
    for (const id of f.etiquetas || []) ativos.push({ chave: "etiquetas", id, rotulo: `Etiqueta: ${rotulo(etqs, id, "selecionada")}` });
    if (f.nao_lidas) ativos.push({ chave: "nao_lidas", rotulo: "Só não lidas" });

    ui.limpar(filtrosEl);
    filtrosEl.hidden = ativos.length === 0;
    for (const item of ativos) {
      const b = h("button", { type: "button", class: "cvl-filtro-chip", "aria-label": `Remover filtro ${item.rotulo}` }, h("span", null, item.rotulo), h("b", { "aria-hidden": "true" }, "×"));
      b.addEventListener("click", () => {
        const novo = { ...f };
        if (item.chave === "etiquetas") {
          novo.etiquetas = (f.etiquetas || []).filter(id => id !== item.id);
          if (!novo.etiquetas.length) delete novo.etiquetas;
        } else delete novo[item.chave];
        A.acoes.mudarLista({ filtro: novo });
      });
      filtrosEl.appendChild(b);
    }
    if (ativos.length > 1) {
      const limpar = h("button", { type: "button", class: "bt bt-fant bt-p cvl-filtros-limpar" }, "Limpar filtros");
      limpar.addEventListener("click", () => A.acoes.mudarLista({ filtro: {} }));
      filtrosEl.appendChild(limpar);
    }
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
    return JSON.stringify([A.acoes.rascunhoDe(c.id), c.contato && c.contato.nome, c.contato && c.contato.telefone, c.ultima_msg_em, c.ultima_msg_resumo, c.ultima_msg_dir,
      c.nao_lidas, c.status, c.atribuida_a, c.atribuida_nome, c.aguardando, c.ultima_entrada_em, c.etiquetas, c.negocio, sel, minuto, A.aba, !!A.busca,
      (A.base && A.base.etiquetas || []).length]);
  }

  function criarItem(c, sel) {
    const nome = A.acoes.nomeContato(c.contato);
    const nl = Number(c.nao_lidas) || 0;
    const resumo = c.ultima_msg_resumo ? String(c.ultima_msg_resumo) : (c.status === "aberta" && !c.ultima_msg_dir ? "Conversa iniciada — sem mensagens ainda" : "");
    const rascunho = L.textoRascunhoLista(A.acoes.rascunhoDe(c.id));       // M36: o que foi digitado e não enviado aparece na linha, em itálico
    const meta = [];
    // etapa e etiquetas viram pontos de cor (o nome fica no tooltip e no rótulo do item): nenhum selo é cortado com reticências
    if (c.negocio && c.negocio.estagio_nome) {
      const cor = ui.corOk(c.negocio.estagio_cor);
      meta.push(h("span", { class: "cvl-dot cvl-dot-etapa", style: cor ? { "--cor": cor } : null, title: `Etapa: ${c.negocio.estagio_nome}`, role: "img", "aria-label": `Etapa: ${c.negocio.estagio_nome}` }));
    }
    if (c.status === "aberta" && c.aguardando && c.ultima_entrada_em) {
      meta.push(h("span", { class: "cvl-espera", title: "Esperando resposta há" }, ui.icone("relogio"), L.tempoEspera(c.ultima_entrada_em)));
    }
    if (A.busca && c.status !== "aberta") meta.push(ui.pilula(c.status === "resolvida" ? "Resolvida" : "Pendente", c.status === "resolvida" ? "neutra" : "aten"));
    const etqs = (c.etiquetas || []).map(etiquetaDe).filter(Boolean);
    for (const e of etqs.slice(0, 3)) {
      const cor = ui.corOk(e.cor);
      meta.push(h("span", { class: "cvl-dot", style: cor ? { "--cor": cor } : null, title: `Etiqueta: ${e.nome}`, role: "img", "aria-label": `Etiqueta: ${e.nome}` }));
    }
    if (etqs.length > 3) meta.push(h("span", { class: "cvl-mais-etq", title: etqs.slice(3).map(e => e.nome).join(", ") }, `+${etqs.length - 3}`));
    if (c.atribuida_a) {
      const av = ui.avatar(c.atribuida_nome || "?", c.atribuida_a);
      av.classList.add("cvl-dono");
      av.setAttribute("title", `Com ${c.atribuida_nome || "atendente"}`);
      meta.push(av);
    }
    const rotuloA11y = [nome, c.negocio && c.negocio.estagio_nome ? `etapa ${c.negocio.estagio_nome}` : null, etqs.length ? `etiquetas ${etqs.map(e => e.nome).join(", ")}` : null, nl ? `${nl} não ${nl === 1 ? "lida" : "lidas"}` : null,
      rascunho ? `Rascunho: ${rascunho}` : resumo ? `${c.ultima_msg_dir === "out" ? "Você: " : ""}${resumo}` : null, L.horaLista(c.ultima_msg_em),
      c.aguardando && c.status === "aberta" ? `esperando há ${L.tempoEspera(c.ultima_entrada_em)}` : null,
      c.atribuida_nome ? `com ${c.atribuida_nome}` : "sem dono"].filter(Boolean).join(", ");
    const a = h("a", { class: "cvl-item", href: `#/conversas/${c.id}`, "aria-current": sel ? "true" : null, "aria-label": rotuloA11y,
      dataset: { id: c.id, naoLida: nl ? "1" : "0" } },
      ui.avatar(nome, c.contato && c.contato.id),
      h("span", { class: "cvl-nome" }, nome),
      h("span", { class: "cvl-hora" }, L.horaLista(c.ultima_msg_em)),
      rascunho ? h("span", { class: "cvl-resumo cvl-rascunho" }, h("em", null, "Rascunho: "), rascunho)
        : h("span", { class: "cvl-resumo" }, c.ultima_msg_dir === "out" && resumo ? h("b", null, "Você: ") : null, resumo),
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
    for (const a of L.ABAS) {
      const v = a.id === "resolvidas" || a.id === "ocultas" ? null : cont[a.id];
      contadoresAba.set(a.id, v === undefined || v === null ? 0 : v);
      if (L.ABAS_FIXAS.includes(a.id) && seg) seg.contar(a.id, v === undefined || v === null ? null : (v > 999 ? "999+" : String(v)));
      const x = seg && seg.querySelector(`[data-valor="${a.id}"] .seg-n`);
      if (x) x.dataset.alerta = a.id === "aguardando" && v > 0 ? "1" : "0";
    }
    const extra = A.aba && !L.ABAS_FIXAS.includes(A.aba) ? L.ABAS.find(x => x.id === A.aba) : null;
    // sem aba marcada quando há busca (a lista mostra todas as abas) ou quando a aba atual mora no menu "Mais situações"
    const semSel = !!A.busca || !!extra;
    abasEl.dataset.semsel = semSel ? "1" : "0";
    if (seg) {
      for (const x of L.ABAS_FIXAS) { const op = seg.querySelector(`[data-valor="${x}"]`); if (op) op.title = `${op.querySelector(".seg-rot").textContent}: ${contadoresAba.get(x) || 0}`; }
      if (!semSel) seg.ativar(abaDestaque());
      for (const b of seg.querySelectorAll(".seg-op")) {
        if (A.busca) { b.removeAttribute("role"); b.removeAttribute("aria-selected"); b.tabIndex = 0; }
        else { b.setAttribute("role", "tab"); if (semSel) { b.setAttribute("aria-selected", "false"); b.tabIndex = 0; } }
      }
      seg.setAttribute("role", A.busca ? "none" : "tablist");
      seg.reposicionar();
    }
    // a lista é o painel da aba marcada; durante a busca ela mostra todas as abas e as abas viram um grupo de filtros
    const abaAtiva = seg && seg.querySelector('.seg-op[aria-selected="true"]');
    if (A.busca) {
      abasEl.setAttribute("role", "group");
      abasEl.setAttribute("aria-label", "Filtrar conversas por situação");
      lista.removeAttribute("role");
      lista.removeAttribute("aria-labelledby");
    } else {
      abasEl.removeAttribute("role");
      abasEl.removeAttribute("aria-label");
      lista.setAttribute("role", "tabpanel");
      if (abaAtiva) lista.setAttribute("aria-labelledby", abaAtiva.id);
      else lista.removeAttribute("aria-labelledby");
    }
    if (btVisoes) {
      btVisoes.dataset.ativo = extra && !A.busca ? "1" : "0";
      btVisoes.setAttribute("aria-label", extra && !A.busca ? `Mais situações (agora: ${extra.rotulo})` : "Mais situações");
    }
    const ag = Number(cont.aguardando) || 0, nl = Number(cont.nao_lidas) || 0;
    sub.textContent = extra && !A.busca ? `${extra.rotulo}${contadoresAba.get(extra.id) ? ` · ${contadoresAba.get(extra.id)}` : ""}`
      : ag ? `${ag} esperando resposta` : nl ? `${nl} com mensagens novas` : "Tudo respondido";
    if (btAtender) { btAtender.hidden = !(ag > 0); nAtender.textContent = ag > 99 ? "99+" : String(ag); btAtender.setAttribute("aria-label", `Atender o próximo (${ag} esperando)`); }
    ponto.hidden = !filtrosAtivos();
    { const p = A.acoes.lerAvisos(); btAvisos.dataset.ligado = p.som || p.tela ? "1" : "0";
      btAvisos.setAttribute("aria-label", `Avisos de mensagem nova (${p.som ? "som ligado" : "som desligado"}${p.tela ? ", área de trabalho ligada" : ""})`); }
    btFiltro.setAttribute("aria-label", filtrosAtivos() ? "Filtros (ativos)" : "Filtros");
    desenharFiltrosAtivos();
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
    focarBusca() { busca.focus(); busca.select(); },
    anunciar,
    /** Rola a lista até a conversa aberta (Alt+↓/↑ abrem vizinhas que podem estar fora da tela). */
    mostrarSelecionada() { const x = lista.querySelector('.cvl-item[aria-current="true"]'); if (x && x.getClientRects().length) x.scrollIntoView({ block: "nearest" }); },
    /** Devolve o foco do teclado à lista: a conversa aberta ou, sem ela, a primeira. false se a lista está escondida (celular com o chat aberto) ou vazia. */
    focarItem() {
      const alvo = lista.querySelector('.cvl-item[aria-current="true"]') || lista.querySelector(".cvl-item");
      if (!alvo || !alvo.getClientRects().length) return false;
      try { alvo.focus({ preventScroll: false }); } catch { alvo.focus(); }
      return document.activeElement === alvo;
    },
    /** j / k: move o foco entre as conversas (Enter abre). Sem foco numa conversa, parte da aberta ou da primeira. */
    moverFoco(dir) {
      const itens = [...lista.querySelectorAll(".cvl-item")].filter(x => x.getClientRects().length);
      if (!itens.length) return false;
      const atual = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".cvl-item") : null;
      let i = atual ? itens.indexOf(atual) : itens.findIndex(x => x.getAttribute("aria-current") === "true");
      if (i < 0) i = dir > 0 ? -1 : itens.length;
      const j = Math.min(itens.length - 1, Math.max(0, i + (dir > 0 ? 1 : -1)));
      itens[j].focus();
      return true;
    },
  };
}
