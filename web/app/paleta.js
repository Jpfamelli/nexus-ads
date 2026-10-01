/* ============================================================
   ÓRBITA — paleta.js (M18) · frente B
   A janela da paleta Ctrl/⌘+K e a folha de atalhos («?»). Carregada sob demanda pelo shell (app.js) com o mesmo ?v= dos outros módulos.
   O que ela sabe vem de comandos.js (puro) e do ambiente que o shell monta a cada abertura (papel, plano, produto, empresa):
   - vazio: Recentes (5 últimos abertos nesta empresa), Nesta tela (comandos que a tela aberta registrou) e Ir para;
   - digitando: Ir para e Ações que casam sem acento; depois os grupos de dados (nx_buscar) conforme o produto;
   - prefixos: «>» só ações, «#» protocolo de conversa.
   Teclado completo (↑ ↓ Enter Esc), role="combobox" no campo e "listbox" nos resultados; nenhum texto vira HTML (tudo entra como nó de texto).
   ============================================================ */

/**
 * abrir(amb) → { fechar(), fim: Promise }.
 * amb = { ui, C (comandos.js), placeholder, destinos, acoes, daTela, recentes(), buscarDados(termo, modo) → {grupos}, navegar(hash), aoEscolher(item), mensagemErro(e), inicial? }
 */
export function abrir(amb) {
  const { ui, C } = amb;
  const h = ui.h;
  const idLista = "pal-lista";
  const campo = h("input", { type: "search", class: "busca-campo", placeholder: amb.placeholder, "aria-label": "Buscar ou executar um comando",
    role: "combobox", "aria-expanded": "true", "aria-controls": idLista, "aria-autocomplete": "list", autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "go" });
  const locais = h("div", { class: "pal-bloco" });
  const dados = h("div", { class: "pal-bloco" });
  const res = h("div", { class: "busca-res", id: idLista, role: "listbox", "aria-label": "Resultados" }, locais, dados);
  const vazio = h("p", { class: "busca-vazio", hidden: true });
  const status = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });
  const dica = h("p", { class: "busca-dica" }, h("kbd", null, "↑"), h("kbd", null, "↓"), " navegar  ", h("kbd", null, "Enter"), " abrir  ", h("kbd", null, "Esc"), " fechar  ",
    h("kbd", null, ">"), " ações  ", h("kbd", null, "#"), " protocolo");
  let itensLocais = [], itensDados = [], itens = [], sel = -1, seq = 0, api = null, contaSecao = 0;

  function marcar(i) {
    sel = itens.length ? (i + itens.length) % itens.length : -1;
    itens.forEach((it, j) => it.el.setAttribute("aria-selected", String(j === sel)));
    if (sel >= 0) { campo.setAttribute("aria-activedescendant", itens[sel].el.id); itens[sel].el.scrollIntoView({ block: "nearest" }); }
    else campo.removeAttribute("aria-activedescendant");
  }
  function reindexar({ manter = false } = {}) {
    const anterior = manter && sel >= 0 ? itens[sel] : null;
    itens = [...itensLocais, ...itensDados];
    itens.forEach((it, i) => { it.el.id = `pal-op-${i}`; it.el.onmousemove = () => { if (sel !== i) marcar(i); }; });
    const mantido = anterior ? itens.indexOf(anterior) : -1;
    marcar(mantido >= 0 ? mantido : 0);
    vazio.hidden = itens.length > 0 || !vazio.textContent;
  }
  function escolher(it) {
    if (!it) return;
    if (api) api.fechar(null);
    if (amb.aoEscolher) { try { amb.aoEscolher(it); } catch { /* recentes nunca impedem a ação */ } }
    if (typeof it.fazer === "function") { try { it.fazer(); } catch (e) { console.error("comando falhou", e); } }
    else if (it.hash) amb.navegar(it.hash);
  }

  /** Uma linha selecionável. `d` = { icone, l1, l2?, atalho?, hash?, fazer?, termo? } */
  function linha(d, termo) {
    const partes = (txt) => C.partesDeRealce(txt, termo).map(p => (p.marca ? h("mark", null, p.texto) : p.texto));
    const el = h("button", { type: "button", class: "busca-item pal-item", role: "option", tabindex: "-1", "aria-selected": "false" },
      h("span", { class: "busca-ic" }, ui.icone(d.icone || "busca")),
      h("span", { class: "pal-corpo" }, h("b", null, partes(d.l1)), d.l2 ? h("small", null, partes(d.l2)) : null),
      d.atalho ? h("kbd", { class: "pal-atalho" }, d.atalho) : null);
    const it = { el, hash: d.hash || null, fazer: d.fazer || null, titulo: d.l1, sub: d.l2 || "", tipo: d.tipo || null, id: d.id || null };
    el.addEventListener("click", () => escolher(it));
    return it;
  }
  function secao(titulo, linhas, alvo) {
    const idT = `pal-sec-${++contaSecao}`;
    const caixa = h("div", { class: "pal-secao", role: "group", "aria-labelledby": idT }, h("p", { class: "rotulo busca-grupo", id: idT }, titulo));
    for (const l of linhas) caixa.appendChild(l.el);
    alvo.appendChild(caixa);
  }

  const aAcao = c => ({ icone: c.icone, l1: c.rotulo, atalho: c.atalho, fazer: c.fazer, id: c.id });
  const aDestino = d => ({ icone: d.icone, l1: d.rotulo, l2: d.emConstrucao ? "em obra" : "", hash: d.hash, id: d.id });
  const aRecente = r => ({ icone: C.TIPOS_RECENTE[r.tipo] ? C.TIPOS_RECENTE[r.tipo].icone : "contato", l1: r.titulo, l2: r.sub, hash: r.hash, tipo: r.tipo });

  function desenharLocais(modo, termo) {
    ui.limpar(locais); itensLocais = [];
    const todas = [...amb.daTela, ...amb.acoes];
    const grupos = [];
    if (modo === "acoes") {
      const f = C.filtrar(todas, termo);
      if (f.length) grupos.push(["Ações", f.map(aAcao)]);
    } else if (modo === "tudo" && !termo) {
      const rec = amb.recentes();
      if (rec.length) grupos.push(["Recentes", rec.map(aRecente)]);
      if (amb.daTela.length) grupos.push(["Nesta tela", amb.daTela.slice(0, 4).map(aAcao)]);
      grupos.push(["Ir para", amb.destinos.map(aDestino)]);
    } else if (modo === "tudo") {
      const ir = C.filtrar(amb.destinos, termo, { limite: 4 });
      const ac = C.filtrar(todas, termo, { limite: 5 });
      if (ir.length) grupos.push(["Ir para", ir.map(aDestino)]);
      if (ac.length) grupos.push(["Ações", ac.map(aAcao)]);
    }
    for (const [titulo, lista] of grupos) {
      const ls = lista.map(d => linha(d, termo));
      itensLocais.push(...ls);
      secao(titulo, ls, locais);
    }
  }

  function mensagemVazia(modo, termo) {
    if (modo === "protocolo" && termo.length < 2) return "Digite o protocolo da conversa, por exemplo #2026.";
    if (modo === "acoes") return "Nenhuma ação com esse nome.";
    return `Nada encontrado para “${termo}”.`;
  }

  async function buscarDados(modo, termo, n) {
    const podeBuscar = !!amb.buscarDados && termo.length >= 2 && modo !== "acoes";
    if (!podeBuscar) { itensDados = []; ui.limpar(dados); return fim(modo, termo); }
    res.setAttribute("aria-busy", "true");
    try {
      const r = await amb.buscarDados(termo, modo);
      if (n !== seq) return;
      ui.limpar(dados); itensDados = [];
      for (const g of (r && r.grupos) || []) {
        if (!g.itens || !g.itens.length) continue;
        const ls = g.itens.map(x => linha({ icone: g.icone, l1: x.l1, l2: x.l2, hash: x.hash, tipo: x.tipo }, termo));
        itensDados.push(...ls);
        secao(g.titulo, ls, dados);
      }
      if (r && r.aviso) dados.appendChild(h("p", { class: "busca-vazio" }, r.aviso));
    } catch (e) {
      if (n !== seq) return;
      ui.limpar(dados); itensDados = [];
      dados.appendChild(h("p", { class: "busca-vazio" }, amb.mensagemErro ? amb.mensagemErro(e) : "Não consegui buscar agora."));
    } finally { if (n === seq) res.removeAttribute("aria-busy"); }
    fim(modo, termo);
  }
  function fim(modo, termo) {
    vazio.textContent = itensLocais.length || itensDados.length || dados.textContent ? "" : (termo || modo !== "tudo" ? mensagemVazia(modo, termo) : "");
    reindexar({ manter: true });
    status.textContent = itens.length ? `${itens.length} resultado${itens.length === 1 ? "" : "s"}.` : vazio.textContent;
  }

  const buscar = ui.debounce(() => { const { modo, termo } = C.interpretar(campo.value); buscarDados(modo, termo, seq); }, 180);
  function aoDigitar() {
    const { modo, termo } = C.interpretar(campo.value);
    seq++;
    desenharLocais(modo, termo);
    // os resultados de dados da busca anterior saem: pertencem a outro texto
    ui.limpar(dados); itensDados = [];
    vazio.textContent = "";
    reindexar();
    if (amb.buscarDados && termo.length >= 2 && modo !== "acoes") { buscar(); }
    else { buscar.cancelar(); fim(modo, termo); }
  }
  campo.addEventListener("input", aoDigitar);
  campo.addEventListener("keydown", ev => {
    if (ev.key === "ArrowDown") { ev.preventDefault(); marcar(sel + 1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); marcar(sel - 1); }
    else if (ev.key === "Enter") { ev.preventDefault(); escolher(itens[sel]); }
    else if (ev.key === "Escape") { ev.preventDefault(); if (api) api.fechar(null); }   // um Esc fecha (no campo de busca o navegador só limparia o texto)
  });
  if (amb.inicial) campo.value = amb.inicial;
  aoDigitar();

  let fecharFora = () => {};
  const fimP = ui.modal({
    titulo: "Buscar e comandos", largura: "m",
    corpo: h("div", { class: "pilha-p" }, h("label", { class: "busca-grande" }, ui.icone("busca"), campo), res, vazio, status, dica),
    aoAbrir: a => {
      api = a;
      fecharFora = () => a.fechar(null);
      a.el.classList.add("busca-g");
      const rod = a.el.querySelector(".modal-rod"); if (rod) rod.hidden = true;
      setTimeout(() => { campo.focus(); if (campo.value) campo.setSelectionRange(campo.value.length, campo.value.length); }, 0);
    },
  }).finally(() => { buscar.cancelar(); seq++; });
  return { fechar: () => fecharFora(), fim: fimP };
}

/** A folha de atalhos («?» fora de campo e «Atalhos de teclado» do menu Ajuda): os do shell e os que a tela aberta registrou. */
export function abrirAtalhos(amb) {
  const { ui, C } = amb;
  const h = ui.h;
  const tecla = t => h("kbd", null, t === "{mod}" ? amb.tecla : t);
  const teclas = lista => h("span", { class: "pal-teclas" }, lista.flatMap((t, i) => (i ? ["+", tecla(t)] : [tecla(t)])));
  const grupo = (titulo, linhas) => h("section", { class: "pal-grupo-teclas" }, h("h3", { class: "rotulo" }, titulo),
    h("dl", { class: "pal-lista-teclas" }, linhas.flatMap(l => [h("dt", null, l.teclas), h("dd", null, l.rotulo)])));
  const geral = C.ATALHOS_GERAIS.map(a => ({ teclas: teclas(a.teclas), rotulo: a.rotulo }));
  const daTela = (amb.daTela || []).filter(c => c.atalho && c.atalho !== "?")
    .map(c => ({ teclas: h("span", { class: "pal-teclas" }, tecla(c.atalho)), rotulo: c.rotulo }));
  const corpo = h("div", { class: "pilha" },
    grupo("Em qualquer tela", geral),
    daTela.length ? grupo("Nesta tela", daTela) : null,
    h("p", { class: "sub" }, "As letras soltas só valem fora dos campos de texto. Em Conversas, «?» mostra os atalhos da central."));
  return ui.modal({ titulo: "Atalhos de teclado", corpo, largura: "m", protegerTexto: false, acoes: [{ rotulo: "Fechar", tipo: "primario" }] });
}
