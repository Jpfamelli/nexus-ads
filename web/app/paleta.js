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
  // plano 1000 (CR-190): no toque (sem teclado físico) a dica fica só com os prefixos «> ações · # protocolo» — setas, Enter e Esc não existem lá
  const toque = (() => { try { return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches; } catch { return false; } })();
  const dica = h("p", { class: ["busca-dica", toque && "busca-dica-toque"] }, ...(toque ? [] : [h("kbd", null, "↑"), h("kbd", null, "↓"), " navegar  ", h("kbd", null, "Enter"), " abrir  ", h("kbd", null, "Esc"), " fechar  "]),
    h("kbd", null, ">"), " ações  ", h("kbd", null, "#"), " protocolo");
  let itensLocais = [], itensDados = [], itens = [], sel = -1, seq = 0, api = null, contaSecao = 0, tStatus = 0;

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
    // plano 1000 (CR-259): «Continuar: mar» só devolve o texto ao campo (a paleta fica aberta)
    if (it.manter && typeof it.fazer === "function") { it.fazer(); return; }
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
    const it = { el, hash: d.hash || null, fazer: d.fazer || null, titulo: d.l1, sub: d.l2 || "", tipo: d.tipo || null, id: d.id || null, manter: !!d.manter };
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

  /* plano 50 · 59: «>» sem texto mostra as ações por grupo (Nesta tela · Criar · Ir e ver · …) em vez de uma lista corrida;
     a tela vazia começa pelos comandos usados por último neste aparelho (quando houver). Com texto, a busca continua uma lista só. */
  const ultimos = () => { try { return typeof amb.ultimos === "function" ? amb.ultimos() : []; } catch { return []; } };
  function desenharLocais(modo, termo) {
    ui.limpar(locais); itensLocais = [];
    const todas = [...amb.daTela, ...amb.acoes];
    const grupos = [];
    if (modo === "acoes") {
      if (!termo && typeof C.agruparAcoes === "function") {
        for (const g of C.agruparAcoes(todas)) grupos.push([g.grupo, g.itens.map(aAcao)]);
      } else {
        const f = typeof C.ordenarPorUso === "function" ? C.ordenarPorUso(C.filtrar(todas, termo), ultimos()) : C.filtrar(todas, termo);
        if (f.length) grupos.push(["Ações", f.map(aAcao)]);
      }
    } else if (modo === "tudo" && !termo) {
      // plano 1000 (CR-259): fechou e reabriu em até 2 min → «Continuar: mar» devolve a última busca (só na memória desta aba: nomes de pessoas não vão para o aparelho)
      const ult = ultimaBusca();
      if (ult) grupos.push(["Continuar", [{ icone: "busca", l1: `Continuar: ${ult}`, manter: true, fazer: () => { campo.value = ult; aoDigitar(); try { campo.focus(); } catch { /* ok */ } } }]]);
      const rec = amb.recentes();
      if (rec.length) grupos.push(["Recentes", rec.map(aRecente)]);
      const usados = typeof C.ultimosUsados === "function" ? C.ultimosUsados(todas, ultimos(), 4) : [];
      if (usados.length) grupos.push(["Usados por último", usados.map(aAcao)]);
      // a mesma ação não aparece duas vezes (as setas passariam por ela de novo): o que já está em «Usados por último» sai de «Nesta tela»
      const jaMostradas = new Set(usados), idsMostrados = new Set(usados.map(c => c.id).filter(Boolean));
      const daTela = amb.daTela.filter(c => !jaMostradas.has(c) && !(c.id && idsMostrados.has(c.id))).slice(0, 4);
      if (daTela.length) grupos.push(["Nesta tela", daTela.map(aAcao)]);
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
    let incerta = false;   // plano 1000: sem rede ou com aviso a busca não é conclusiva — não oferece «Cadastrar «x»…» (duplicaria o contato)
    try {
      const r = await amb.buscarDados(termo, modo);
      if (n !== seq) return;
      ui.limpar(dados); itensDados = [];
      for (const g of (r && r.grupos) || []) {
        if (!g.itens || !g.itens.length) continue;
        const ls = g.itens.map(x => linha({ icone: g.icone, l1: x.l1, l2: x.l2, hash: x.hash, tipo: x.tipo }, termo));
        // plano 1000 (CR-185): cada grupo mostra só os primeiros — «Ver todos» abre a lista (ou o quadro) já com a busca preenchida
        const todos = verTodosDaBusca(g, termo);
        if (todos) ls.push(linha({ icone: "busca", l1: todos.l1, hash: todos.hash, id: `ver-todos-${todos.tipo}` }, ""));
        itensDados.push(...ls);
        secao(g.titulo, ls, dados);
      }
      if (r && r.aviso) { incerta = true; dados.appendChild(h("p", { class: "busca-vazio" }, r.aviso)); }
    } catch (e) {
      if (n !== seq) return;
      ui.limpar(dados); itensDados = []; incerta = true;
      dados.appendChild(h("p", { class: "busca-vazio" }, amb.mensagemErro ? amb.mensagemErro(e) : "Não consegui buscar agora."));
    } finally { if (n === seq) res.removeAttribute("aria-busy"); }
    fim(modo, termo, { dosDados: true, semCriar: incerta });
  }
  /** plano 1000 (CR-187): nada encontrado para «Mariana» → o comando da tela que sabe criar com o texto («Cadastrar «Mariana» como paciente»). */
  function ofertarCriar(modo, termo) {
    if (modo !== "tudo" || String(termo || "").trim().length < 2 || itensLocais.length || itensDados.length) return;
    const criadores = [...(amb.daTela || []), ...(amb.acoes || [])].filter(c => c && typeof c.comTermo === "function");
    const vistos = new Set();
    const ls = criadores.filter(c => !vistos.has(c.id) && vistos.add(c.id)).slice(0, 2).map(c => linha({ icone: "mais", id: c.id,
      l1: typeof c.rotuloTermo === "function" ? c.rotuloTermo(termo.trim()) : `${c.rotulo}: ${termo.trim()}`, fazer: () => c.comTermo(termo.trim()) }, ""));
    if (!ls.length) return;
    itensDados.push(...ls);
    secao("Criar", ls, dados);
  }
  /** plano 1000 (CR-192): o status do leitor de tela muda UMA vez por busca — o redesenho local espera 600 ms (a busca de dados, que vem depois, anuncia na hora). */
  function anunciarStatus(txt, imediato) {
    clearTimeout(tStatus);
    if (imediato) { status.textContent = txt; return; }
    tStatus = setTimeout(() => { status.textContent = txt; }, 600);
  }
  function fim(modo, termo, { dosDados = false, semCriar = false } = {}) {
    if (!semCriar) ofertarCriar(modo, termo);
    vazio.textContent = itensLocais.length || itensDados.length || dados.textContent ? "" : (termo || modo !== "tudo" ? mensagemVazia(modo, termo) : "");
    reindexar({ manter: true });
    anunciarStatus(itens.length ? `${itens.length} resultado${itens.length === 1 ? "" : "s"}.` : vazio.textContent, dosDados);
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
  }).finally(() => { buscar.cancelar(); seq++; clearTimeout(tStatus); guardarBusca(campo.value); });
  return { fechar: () => fecharFora(), fim: fimP };
}

/* plano 1000 (CR-259): a última busca vale por 2 min, só na memória desta aba (nunca no aparelho: são nomes e telefones de pessoas) */
const VALIDADE_BUSCA_MS = 2 * 60000;
let buscaGuardada = null;
function guardarBusca(txt) {
  const t = String(txt || "").trim();
  buscaGuardada = t.length >= 2 && !/^[>#]/.test(t) ? { t: t.slice(0, 80), em: Date.now() } : null;
}
/** O texto da última busca (fechada há menos de 2 min) ou null. */
export function ultimaBusca(agora = Date.now()) {
  return buscaGuardada && agora - buscaGuardada.em < VALIDADE_BUSCA_MS ? buscaGuardada.t : null;
}

/**
 * plano 1000 (CR-185): a linha «Ver tudo em Pacientes com “mar”» de um grupo de dados da paleta → {tipo, l1, hash} | null.
 * Contatos → #/contatos?busca=…; negócios → #/crm?busca=… (as duas telas leem ?busca só nesta visita, sem gravar no aparelho).
 */
export function verTodosDaBusca(g, termo) {
  const t = String(termo || "").trim();
  if (!g || !Array.isArray(g.itens) || !g.itens.length || t.length < 2) return null;
  const tipo = (g.itens.find(x => x && x.tipo) || {}).tipo;
  const rota = tipo === "contato" ? "#/contatos" : tipo === "negocio" ? "#/crm" : null;
  if (!rota) return null;
  return { tipo, l1: `Ver tudo em ${g.titulo || "resultados"} com “${t}”`, hash: `${rota}?busca=${encodeURIComponent(t)}` };
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
