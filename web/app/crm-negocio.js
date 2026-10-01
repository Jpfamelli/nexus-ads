/* ============================================================
   ÓRBITA — crm-negocio.js · frente F4 · T6 Gaveta do negócio
   - abrirNegocio(k, id, {aoMudar, aoFechar}): cabeçalho com título
     editável, valor, fita de etapas clicável, Ganhou/Perdeu/Reabrir,
     "Iniciar pós-venda", ⋮ (mover de funil com a trava do Ads, excluir);
     abas Resumo · Tarefas · Notas · Linha do tempo. Salva por campo.
   - novoNegocio(k, {contato_id, conversa_id, funil_id, estagio_id}, {aoCriar})
   - abrirContato(k, id, {aoMudar}): ficha 360 numa gaveta larga
   - moverComPerguntas(k, card, estagio, ordem): o MESMO fluxo do
     kanban e da fita (valor ao ganhar, motivo ao perder, data e hora
     ao agendar) → nx_negocio_mover
   ============================================================ */

/* ============================================================ campos personalizados */
/** Input de um campo personalizado (ui.campo com o tipo certo). */
export function campoPersonalizado(k, c, valor, { nome } = {}) {
  const { ui, L } = k;
  const n = nome || `campo__${c.chave}`;
  const base = { rotulo: c.rotulo, nome: n, obrigatorio: !!c.obrigatorio };
  switch (c.tipo) {
    case "texto_longo": return ui.campo({ ...base, tipo: "textarea", valor: valor ?? "", max: 5000 });
    case "numero": return ui.campo({ ...base, tipo: "texto", valor: valor ?? "", inputmode: "decimal" });
    case "moeda": return ui.campo({ ...base, tipo: "moeda", valor: typeof valor === "number" ? valor : (valor ?? "") });
    case "data": return ui.campo({ ...base, tipo: "data", valor: valor ?? "" });
    case "opcao": return ui.campo({ ...base, tipo: "select", valor: valor ?? "", opcoes: [{ valor: "", rotulo: "—" }, ...(c.opcoes || []).map(o => ({ valor: o, rotulo: o }))] });
    case "multi": return ui.campo({ ...base, tipo: "multipla", valor: Array.isArray(valor) ? valor : [], opcoes: (c.opcoes || []).map(o => ({ valor: o, rotulo: o })) });
    case "sim_nao": return ui.campo({ ...base, tipo: "select", valor: valor === true ? "sim" : valor === false ? "nao" : "", opcoes: [{ valor: "", rotulo: "—" }, { valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não" }] });
    case "telefone": return ui.campo({ ...base, tipo: "tel", valor: valor ? L.formatarTel(valor) : "" });
    case "email": return ui.campo({ ...base, tipo: "email", valor: valor ?? "" });
    case "url": return ui.campo({ ...base, tipo: "url", valor: valor ?? "", placeholder: "https://" });
    default: return ui.campo({ ...base, tipo: "texto", valor: valor ?? "", max: 500 });
  }
}

/** Lê os campos personalizados de um formulário → {chave: valor normalizado} e erros [{nome, texto}]. */
export function lerCamposPersonalizados(k, form, campos) {
  const { ui, L } = k;
  const d = ui.lerForm(form);
  const valores = {}, erros = [];
  for (const c of campos) {
    const n = `campo__${c.chave}`;
    let v = d[n];
    // moeda: o texto cru (o ui.lerMoeda leria "1.500" como 1,5); normalizarCampo usa L.lerNumero
    if (c.tipo === "moeda") { const el = form.querySelector(`[name="${n}"]`); v = el ? el.value : (typeof v === "number" ? String(v) : v); }
    const er = L.validarCampo(c, v);
    if (er) { erros.push({ nome: n, texto: er }); continue; }
    valores[c.chave] = L.normalizarCampo(c, v);
  }
  return { valores, erros };
}

/* ============================================================ perguntas ao mover */
function nomeCompromisso(k) {
  return { odonto: "consulta", oficina: "visita" }[k.v.vertical] || "compromisso";
}

async function pedirGanho(k, card, estagio, detalhe) {
  const { ui, h, L } = k;
  const funil = k.funilDoEstagio(estagio.id);
  const faltam = L.obrigatoriosVazios(k.base.campos, "negocio", funil && funil.id, (detalhe && detalhe.campos) || card.campos || {});
  const ticket = card.servico && k.base.ticket ? k.base.ticket[card.servico] : null;
  const sug = card.valor ?? card.valor_previsto ?? (Number.isFinite(Number(ticket)) ? Number(ticket) : null);
  const form = h("form", { class: "crm-form", novalidate: true },
    ui.campo({ rotulo: "Valor final", nome: "valor", tipo: "moeda", valor: sug ?? "", obrigatorio: true,
      ajuda: funil && funil.conta_no_ads ? "Entra na receita do retorno do anúncio (Anúncios e relatórios)." : "O valor que foi fechado de verdade." }),
    faltam.length ? h("p", { class: "sub" }, "Preencha também os campos obrigatórios deste funil:") : null,
    ...faltam.map(c => campoPersonalizado(k, c, null)));
  return ui.modal({
    titulo: `Marcar como «${estagio.nome}»`, corpo: form,
    descricao: `${L.tituloCard(card)}`,
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: `Confirmar ${k.v.ganhar.toLowerCase()}`, tipo: "primario", fn: () => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        d.valor = L.lerNumero(form.querySelector('[name="valor"]').value);   // "1.500" = mil e quinhentos
        if (d.valor === null || d.valor === undefined || !(d.valor >= 0)) { ui.marcarErro(form, "valor", "Informe o valor final."); return false; }
        const { valores, erros } = lerCamposPersonalizados(k, form, faltam);
        if (erros.length) { ui.marcarErro(form, erros[0].nome, erros[0].texto); return false; }
        return { valor: d.valor, ...(faltam.length ? { campos: valores } : {}) };
      } },
    ],
  });
}

async function pedirPerda(k, card, estagio) {
  const { ui, h, L } = k;
  const motivos = k.base.motivos || [];
  const nomeRadio = `mot-${Date.now()}`;
  const lista = h("div", { class: "crm-motivos", role: "radiogroup", "aria-label": "Motivo da perda" },
    motivos.map(m => h("label", { class: "crm-motivo" },
      h("input", { type: "radio", name: nomeRadio, value: m.id, dataset: { texto: m.exige_texto ? "1" : "" } }),
      h("span", null, m.nome, m.exige_texto ? h("small", null, "pede justificativa") : null))));
  const texto = ui.campo({ rotulo: motivos.length ? "Justificativa" : "O que aconteceu? (opcional)", nome: "motivo_perda_txt", tipo: "textarea", max: 500, linhas: 3 });
  const form = h("form", { class: "crm-form", novalidate: true },
    motivos.length ? h("div", { class: "pilha-p" }, h("span", { class: "campo-rot" }, "Por que não deu certo?", h("span", { class: "obrig", "aria-hidden": "true" }, " *")), lista) : null,
    texto);
  return ui.modal({
    titulo: `Marcar como «${estagio.nome}»`, corpo: form, descricao: L.tituloCard(card),
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: `Confirmar ${k.v.perder.toLowerCase()}`, tipo: "perigo", fn: api => {
        const sel = form.querySelector(`input[name="${nomeRadio}"]:checked`);
        const t = form.querySelector("textarea").value.trim();
        if (motivos.length && !sel) { api.erro("Escolha o motivo da perda."); return false; }
        if (sel && sel.dataset.texto && !t) { ui.marcarErro(form, "motivo_perda_txt", "Esse motivo pede uma justificativa."); return false; }
        return { ...(sel ? { motivo_perda_id: sel.value } : {}), ...(t ? { motivo_perda_txt: t } : {}) };
      } },
    ],
  });
}

async function pedirAgenda(k, card, estagio) {
  const { ui, h, L } = k;
  const nome = nomeCompromisso(k);
  const amanha = new Date(Date.now() + 24 * 3600000);
  const padrao = card.consulta_em ? L.paraDataHoraLocal(card.consulta_em) : `${ui.hojeSP ? ui.hojeSP(amanha) : amanha.toISOString().slice(0, 10)}T09:00`;
  const form = h("form", { class: "crm-form", novalidate: true },
    ui.campo({ rotulo: `Data e hora da ${nome}`, nome: "consulta_em", tipo: "datahora", valor: padrao,
      ajuda: `É esta data que o lembrete automático usa (24 h antes da ${nome}).` }));
  return ui.modal({
    titulo: `Agendar a ${nome}`, corpo: form, descricao: L.tituloCard(card), largura: "p",
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: "Mover sem data", tipo: "neutro", valor: {} },
      { rotulo: "Agendar", tipo: "primario", fn: () => {
        const d = ui.lerForm(form);
        if (!d.consulta_em) { ui.marcarErro(form, "consulta_em", "Escolha a data e a hora."); return false; }
        return { consulta_em: d.consulta_em };
      } },
    ],
  });
}

/** O que precisa perguntar para mover `card` até `estagio` → extra {} | null (cancelado). */
export async function prepararMovimento(k, card, estagio) {
  const atual = k.estagio(card.estagio_id);
  const pedido = k.L.pedidoAoMover(estagio, atual);
  if (!pedido) return {};
  if (pedido === "ganho") {
    let detalhe = null;
    const funil = k.funilDoEstagio(estagio.id);
    const obrig = k.L.camposDe(k.base.campos, "negocio", funil && funil.id).some(c => c.obrigatorio);
    if (obrig && !card.campos) {
      try { detalhe = (await k.api.rpcC("nx_negocio_ver", { p_id: card.id })).negocio; } catch { detalhe = null; }
    }
    return pedirGanho(k, card, estagio, detalhe);
  }
  if (pedido === "perdido") return pedirPerda(k, card, estagio);
  if (pedido === "agendada") return pedirAgenda(k, card, estagio);
  return {};
}

/** nx_negocio_mover → Card (lança o erro do servidor, com .codigo/.hint). `keepalive`: a página está saindo — o pedido termina mesmo com a aba fechada. */
export function moverNegocio(k, card, estagio, { ordem = null, extra = {}, keepalive = false } = {}) {
  return k.api.rpcC("nx_negocio_mover", { p_id: card.id, p_estagio: estagio.id, p_ordem: ordem, p_extra: extra || {} }, keepalive ? { keepalive: true } : {});
}

/** Pergunta o que for preciso e move. → Card | null (cancelado). Erros sobem. */
export async function moverComPerguntas(k, card, estagio, ordem = null) {
  const extra = await prepararMovimento(k, card, estagio);
  if (extra === null) return null;
  return moverNegocio(k, card, estagio, { ordem, extra });
}

/* ============================================================ edição por campo */
/** Linha dt/dd com input .ed que salva sozinho (change/blur). aoErro(e, erroEl) personaliza a mensagem. */
export function linhaEd(k, { rotulo, controle, salvar, ler, desabilitado, aoErro, validar, largo = false }) {
  const { ui, h } = k;
  const erro = h("small", { class: "ed-erro", role: "alert", hidden: true });
  const id = `ed-${Math.random().toString(36).slice(2, 9)}`;
  controle.id = id;
  controle.classList.add("ed");
  if (desabilitado) controle.disabled = true;
  let ultimo = ler(controle);
  let salvando = false;
  /** validar(controle) → texto do erro ou null: texto que não vira valor (ex.: «abc» num campo de dinheiro) NÃO é gravado como se fosse «vazio». */
  const mostrarInvalido = texto => {
    ui.limpar(erro);
    erro.textContent = texto;
    erro.hidden = false;
    controle.setAttribute("aria-invalid", "true");
    controle.setAttribute("aria-describedby", erro.id = `${id}-er`);
  };
  async function aoMudar() {
    const invalido = validar ? validar(controle) : null;
    if (invalido) { mostrarInvalido(invalido); return; }
    const v = ler(controle);
    if (JSON.stringify(v) === JSON.stringify(ultimo) || salvando) {
      if (!salvando) { erro.hidden = true; controle.removeAttribute("aria-invalid"); }   // voltou ao valor que já estava gravado
      return;
    }
    salvando = true;
    erro.hidden = true; controle.removeAttribute("aria-invalid");
    try {
      await salvar(v);
      ultimo = v;
      ui.toast("Salvo.", { tipo: "ok", ms: 1500 });
    } catch (e) {
      ui.limpar(erro);
      erro.textContent = k.erro(e);
      if (aoErro) try { aoErro(e, erro); } catch { /* ok */ }
      erro.hidden = false;
      controle.setAttribute("aria-invalid", "true");
      controle.setAttribute("aria-describedby", erro.id = `${id}-er`);
    } finally { salvando = false; }
  }
  const evento = controle.tagName === "SELECT" || controle.type === "date" || controle.type === "datetime-local" ? "change" : "blur";
  controle.addEventListener(evento, aoMudar);
  if (controle.tagName === "INPUT" && controle.type !== "date" && controle.type !== "datetime-local") {
    controle.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); controle.blur(); } if (ev.key === "Escape") { controle.value = typeof ultimo === "number" ? String(ultimo) : (ultimo ?? ""); controle.blur(); } });
  }
  // um bloco por campo (M24): no desktop é «rótulo | valor»; no celular os blocos formam uma grade de 2 colunas (`largo` ocupa a linha toda)
  return [h("div", { class: ["ng-campo", largo && "ng-campo-largo"] }, h("dt", null, h("label", { for: id }, rotulo)), h("dd", null, controle), erro)];
}

/* ============================================================ gaveta do negócio */
export async function abrirNegocio(k, id, { aoMudar, aoFechar } = {}) {
  const { ui, h, L } = k;
  let fechada = false;
  const g = ui.gaveta({ titulo: k.v.negocio, largura: "g", aoFechar: () => { fechada = true; if (aoFechar) aoFechar(); } });
  const corpo = g.corpo;
  corpo.appendChild(ui.esqueleto("lista", 5));
  let abaAtual = "resumo";

  async function carregar() {
    try {
      const d = await k.api.rpcC("nx_negocio_ver", { p_id: id });
      if (fechada) return;
      desenhar(d);
    } catch (e) {
      if (fechada) return;
      ui.limpar(corpo);
      corpo.appendChild(ui.erroCartao(e, carregar));
    }
  }

  function avisar(n) { if (aoMudar && n) try { aoMudar(n); } catch (e) { console.error(e); } }

  function desenhar(d) {
    const n = d.negocio;
    const funil = k.funil(n.funil_id) || d.funil;
    const estagio = k.estagio(n.estagio_id) || d.estagio;
    const podeEditar = k.pode("atendente");
    ui.limpar(corpo);
    g.trocarTitulo(`${k.v.negocio}${funil ? ` · ${funil.nome}` : ""}`);

    async function salvar(chaves) {
      const r = await k.api.rpcC("nx_negocio_salvar", { p_negocio: { id: n.id, ...chaves } });
      Object.assign(n, r);
      avisar(r);
      return r;
    }
    async function mover(e) {
      // o que era antes: o «Desfazer» devolve a etapa (e, se for o caso, o valor final, o motivo da perda ou a data da consulta)
      const antes = { estagio: k.estagio(n.estagio_id), ordem: n.ordem ?? null, valor: n.valor, valor_previsto: n.valor_previsto, consulta_em: n.consulta_em ?? null,
        motivo_perda_id: n.motivo_perda_id, motivo_perda_txt: n.motivo_perda_txt };
      try {
        const extra = await prepararMovimento(k, n, e);
        if (extra === null) return;
        const card = await moverNegocio(k, n, e, { extra });
        avisar(card);
        ui.anunciar(`Movido para ${e.nome}.`);
        await carregar();
        const quando = e.tipo === "ganho" ? `${k.v.ganhar}! Registrado.` : e.tipo === "perdido" ? "Registrado como perdido." : `Movido para «${e.nome}».`;
        const aviso = e.tipo !== "aberto" || (antes.estagio && antes.estagio.tipo !== "aberto") ? " Mensagens automáticas já enviadas não voltam." : "";
        if (antes.estagio) ui.acaoComDesfazer({ texto: quando + aviso, reverter: async () => {
          const extraVolta = antes.estagio.tipo === "ganho" ? { valor: antes.valor ?? antes.valor_previsto ?? 0 }
            : antes.estagio.tipo === "perdido" ? { ...(antes.motivo_perda_id ? { motivo_perda_id: antes.motivo_perda_id } : {}), ...(antes.motivo_perda_txt ? { motivo_perda_txt: antes.motivo_perda_txt } : {}) } : {};
          const volta = await moverNegocio(k, { id: n.id }, antes.estagio, { ordem: antes.ordem, extra: extraVolta });
          if (extra && extra.consulta_em && antes.consulta_em !== extra.consulta_em) await k.api.rpcC("nx_negocio_salvar", { p_negocio: { id: n.id, consulta_em: antes.consulta_em } });
          avisar(volta);
          if (!fechada) await carregar();
        } });
      } catch (err) { k.toastErro(err); }
    }

    /* ---------- topo ---------- */
    const statusPil = n.status === "ganho" ? ui.pilula(k.v.ganhar, "ok", { icone: "check" })
      : n.status === "perdido" ? ui.pilula(k.v.perder, "ruim", { icone: "fechar" }) : ui.pilula("Em aberto", "prim");
    const dono = k.usuario(n.dono_id);
    const titulo = h("input", { class: "ng-titulo", value: n.titulo || "", maxlength: 120, "aria-label": "Título",
      placeholder: (d.contato && d.contato.nome) || n.nome || `Sem título`, disabled: !podeEditar });
    let tituloAntes = n.titulo || "";
    titulo.addEventListener("blur", async () => {
      const t = titulo.value.trim();
      if (t === tituloAntes) return;
      try { await salvar({ titulo: t }); tituloAntes = t; tituloTxt.textContent = t || (d.contato && d.contato.nome) || n.nome || "Sem título"; ui.toast("Salvo.", { tipo: "ok", ms: 1500 }); }
      catch (e) { k.toastErro(e); titulo.value = tituloAntes; }
    });
    const tituloTxt = h("h3", { class: "ng-titulo ng-titulo-txt" }, n.titulo || (d.contato && d.contato.nome) || n.nome || "Sem título");
    const caixaTitulo = h("div", { class: "ng-titulo-l" }, tituloTxt);
    const lapis = podeEditar ? h("button", { type: "button", class: "bt-icone ng-lapis", "aria-label": "Editar o título", title: "Editar o título" }, ui.icone("editar")) : null;
    if (lapis) caixaTitulo.appendChild(lapis);
    const mostrarTexto = () => { tituloTxt.textContent = tituloAntes || (d.contato && d.contato.nome) || n.nome || "Sem título"; ui.limpar(caixaTitulo); caixaTitulo.append(...[tituloTxt, lapis].filter(Boolean)); if (lapis) lapis.focus({ preventScroll: true }); };
    if (lapis) lapis.addEventListener("click", () => { ui.limpar(caixaTitulo); caixaTitulo.appendChild(titulo); titulo.focus(); titulo.select(); });
    titulo.addEventListener("blur", () => setTimeout(() => { if (caixaTitulo.contains(titulo)) mostrarTexto(); }, 0));
    // Esc só cancela a edição do título (não fecha a gaveta)
    titulo.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); titulo.blur(); } if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); titulo.value = tituloAntes; titulo.blur(); } });

    const valorFinal = n.status === "ganho";
    const valorEl = h("div", { class: ["ng-valor", valorFinal && "ganho"] },
      h("b", null, (valorFinal ? n.valor : n.valor_previsto) != null ? ui.brl(valorFinal ? n.valor : n.valor_previsto) : "Sem valor"),
      h("small", null, valorFinal ? "valor final" : "previsto"));

    const acoes = h("div", { class: "ng-acoes" });
    const estGanho = (funil ? funil.estagios : []).find(e => e.tipo === "ganho");
    const estPerda = (funil ? funil.estagios : []).find(e => e.tipo === "perdido");
    // M27: marcar a consulta daqui são 2 toques — «Marcar consulta» abre a janela com os horários livres prontos e o primeiro selecionado; «Confirmar» é o 2º
    if (podeEditar && n.status === "aberto" && k.ctx.carregar) {
      const remarcar = n.consulta_em && Date.parse(n.consulta_em) > Date.now();
      acoes.appendChild(h("button", { type: "button", class: "bt bt-sec ng-marcar", on: { click: async () => {
        try {
          const ag = await k.ctx.carregar("agenda");
          await ag.marcarConsulta(k.ctx, { negocio: { id: n.id, titulo: n.titulo || (d.contato && d.contato.nome) || n.nome, servico: n.servico, funil_nome: funil ? funil.nome : "", inicio: n.consulta_em, estagio_id: n.estagio_id, ordem: n.ordem ?? null },
            aoMudar: () => { if (!fechada) carregar(); } });
        } catch (err) { k.toastErro(err); }
      } } }, ui.icone("calendario"), remarcar ? "Remarcar consulta" : "Marcar consulta"));
    }
    if (podeEditar && n.status === "aberto") {
      if (estGanho) acoes.appendChild(h("button", { type: "button", class: "bt bt-sec ng-ganhou", on: { click: () => mover(estGanho) } }, ui.icone("check"), k.v.ganhar));
      if (estPerda) acoes.appendChild(h("button", { type: "button", class: "bt bt-sec ng-perdeu", on: { click: () => mover(estPerda) } }, ui.icone("fechar"), k.v.perder));
    }
    if (podeEditar && n.status !== "aberto" && funil) {
      const primeira = funil.estagios.find(e => e.tipo === "aberto");
      if (primeira) acoes.appendChild(h("button", { type: "button", class: "bt bt-sec", on: { click: () => mover(primeira) } }, ui.icone("relogio"), "Reabrir"));
    }
    if (podeEditar && n.status === "ganho" && d.contato) {
      acoes.appendChild(h("button", { type: "button", class: "bt bt-prim", on: { click: () => iniciarPosVenda(k, n, d.contato, { aoCriar: nv => { avisar({ ...nv, criado: true }); } }) } },
        ui.icone("mais"), "Iniciar pós-venda"));
    }
    const menuBt = h("button", { type: "button", class: "bt-icone", "aria-label": "Mais ações" }, ui.icone("opcoes"));
    menuBt.addEventListener("click", () => {
      const itens = [];
      if (podeEditar) itens.push({ rotulo: "Mover para outro funil…", icone: "funil", fn: () => moverDeFunil(k, n, { aoMover: async card => { avisar(card); await carregar(); } }) });
      if (d.contato) itens.push({ rotulo: `Ver ficha d${k.v.art("contato") === "a" ? "a" : "o"} ${k.v.min("contato")}`, icone: "contato", fn: () => abrirContato(k, d.contato.id, {}) });
      itens.push({ rotulo: "Copiar link", icone: "link", fn: () => ui.copiar(k.ctx.linkPublico ? k.ctx.linkPublico(`#/crm/negocio/${n.id}`) : location.href) });
      if (k.pode("admin")) itens.push("-", { rotulo: "Excluir", icone: "lixeira", perigo: true, fn: async () => {
        const ok = await ui.confirmar({ titulo: `Excluir ${k.v.min("negocio")}?`, texto: "As tarefas e notas dele também serão apagadas. Não dá para desfazer.", perigo: true, digitar: "excluir" });
        if (!ok) return;
        try { await k.api.rpcC("nx_negocio_excluir", { p_id: n.id }); ui.toast("Excluído.", { tipo: "ok" }); avisar({ id: n.id, excluido: true }); g.fechar(); }
        catch (e) { k.toastErro(e); }
      } });
      ui.menu(menuBt, itens);
    });
    acoes.appendChild(menuBt);

    /* fita de etapas */
    const fita = h("div", { class: "ng-fita", role: "list", "aria-label": "Etapas do funil" });
    const ordemAtual = estagio ? estagio.ordem : -1;
    for (const e of (funil ? funil.estagios : [])) {
      const atual = e.id === n.estagio_id;
      const b = h("button", { type: "button", role: "listitem", class: ["ng-etapa", e.tipo === "aberto" && e.ordem < ordemAtual && n.status === "aberto" && "feita"],
        style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null, "aria-current": atual ? "step" : null, disabled: atual || !podeEditar,
        title: atual ? `Etapa atual: ${e.nome}` : `Mover para ${e.nome}` }, h("span", null, e.nome));
      if (!atual && podeEditar) b.addEventListener("click", () => mover(e));
      fita.appendChild(b);
    }

    const topo = h("div", { class: "ng-topo" },
      h("div", { class: "ng-status" }, statusPil,
        n.anuncio ? ui.pilula(n.plataforma === "google" ? "Google Ads" : "Anúncio Meta", n.plataforma === "google" ? "google" : "meta", { icone: "anuncio" }) : null,
        funil && funil.conta_no_ads ? ui.pilula("Conta no retorno do anúncio", "neutra", { title: "Este funil entra nos números de Anúncios" }) : null,
        dono ? ui.pilula(dono.nome, "neutra", { icone: "usuario" }) : null),
      caixaTitulo,
      h("div", { class: "ng-linha1" }, valorEl, acoes),
      fita,
      n.status === "perdido" && (n.motivo_perda_id || n.motivo_perda_txt)
        ? h("p", { class: "aviso aviso-ruim" }, ui.icone("info"), h("span", null, `Motivo: ${k.motivosPorId()[n.motivo_perda_id] || "—"}${n.motivo_perda_txt ? ` — ${n.motivo_perda_txt}` : ""}`)) : null);

    /* ---------- abas ---------- */
    const secoes = { resumo: null, tarefas: null, notas: null, tempo: null };
    const conteudo = h("div", { class: "ng-sec" });
    const abasEl = ui.abas({ itens: [
      { id: "resumo", rotulo: "Resumo" },
      { id: "tarefas", rotulo: "Tarefas", n: (d.tarefas || []).filter(t => !t.concluida_em).length || null },
      { id: "notas", rotulo: "Notas", n: (d.notas || []).length || null },
      { id: "tempo", rotulo: "Linha do tempo" },
    ], ativo: abaAtual, rotulo: "Seções do negócio", aoMudar: idAba => { abaAtual = idAba; mostrar(); } });

    function mostrar() {
      ui.limpar(conteudo);
      if (!secoes[abaAtual]) secoes[abaAtual] = criarSecao(abaAtual);
      conteudo.appendChild(secoes[abaAtual]);
    }

    function criarSecao(qual) {
      const T = k.__tarefas;
      if (qual === "tarefas") return T.blocoTarefas(k, { tarefas: d.tarefas || [], negocio_id: n.id, contato_id: n.contato ? n.contato.id : null,
        aoMudar: lista => { d.tarefas = lista; abasEl.contar("tarefas", lista.filter(t => !t.concluida_em).length || null); avisar({ ...n, _tarefas: true }); secoes.tempo = null; } });
      if (qual === "notas") return T.blocoNotas(k, { notas: d.notas || [], negocio_id: n.id,
        aoMudar: lista => { d.notas = lista; abasEl.contar("notas", lista.length || null); secoes.tempo = null; } });
      if (qual === "tempo") return T.blocoTempo(k, d.tempo || []);
      return resumo();
    }

    function resumo() {
      const el = h("div", { class: "ng-sec" });
      /* contato */
      if (d.contato) {
        const ct = d.contato;
        const conv = (d.conversas || []).find(c => c.status !== "resolvida");
        el.appendChild(h("section", { class: "ng-bloco", "aria-label": k.v.contato },
          h("div", { class: "ng-contato" },
            ui.avatar(ct.nome || ct.telefone, ct.id),
            h("div", null, h("b", null, L.nomeContato(ct)), h("small", null, [ct.telefone ? ui.telBR(ct.telefone) : null, ct.email].filter(Boolean).join(" · ") || "Sem telefone")),
            h("div", { class: "linha" },
              k.ctx.temModulo && k.ctx.temModulo("conversas") ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => {
                g.fechar();
                k.ctx.navegar(conv ? `#/conversas/${conv.id}` : `#/conversas?contato=${ct.id}`);
              } } }, ui.icone("whatsapp"), "Abrir conversa") : null,
              h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => abrirContato(k, ct.id, {}) } }, "Ficha")))));
      } else {
        el.appendChild(h("p", { class: "aviso" }, ui.icone("info"), h("span", null, `Sem ${k.v.min("contato")} ligado (o cadastro foi removido). Os números do negócio continuam no retorno do anúncio.`)));
      }
      /* origem da oportunidade e campanha */
      const rastreio = n.rastreio && typeof n.rastreio === "object" ? n.rastreio : {};
      const an = d.anuncio || {};
      const campanha = an.campanha_nome || n.campanha_nome || n.campanha_ext || rastreio.utm_campaign;
      const anuncio = an.anuncio_nome || n.anuncio_nome || n.anuncio_ext;
      const plataforma = n.plataforma === "google" ? "Google Ads" : n.plataforma === "meta" ? "Meta Ads" : null;
      const origem = n.origem ? (L.ROTULO_ORIGEM[n.origem] || n.origem) : null;
      const tagsUtm = [rastreio.utm_source, rastreio.utm_medium].filter(Boolean).join(" · ");
      if (plataforma || origem || campanha || anuncio || tagsUtm) {
        const detalhesOrigem = h("div", { class: "ng-origem-detalhes" },
          h("b", null, plataforma || origem || "Origem do contato"),
          campanha || anuncio ? h("span", null,
            anuncio ? ["Anúncio ", h("b", null, `«${anuncio}»`)] : null,
            campanha ? [anuncio ? " · campanha " : "Campanha ", h("b", null, `«${campanha}»`)] : null) : null,
          origem && plataforma ? h("small", null, `Origem do cadastro: ${origem}`) : null,
          tagsUtm ? h("small", null, `Parâmetros do site: ${tagsUtm}`) : null,
          rastreio.pagina ? h("small", null, `Página: ${rastreio.pagina}`) : null);
        el.appendChild(h("div", { class: ["ng-anuncio", n.plataforma === "google" && "google"] }, ui.icone("anuncio"), detalhesOrigem));
      }
      /* dados */
      const dl = h("dl", { class: "ng-kv" });
      const sel = (opcoes, valor) => h("select", null, opcoes.map(o => h("option", { value: o.valor, selected: String(o.valor) === String(valor ?? "") }, o.rotulo)));
      dl.append(...linhaEd(k, { rotulo: "Responsável", desabilitado: !podeEditar,
        controle: sel([{ valor: "", rotulo: "Sem responsável" }, ...k.base.usuarios.map(u => ({ valor: u.id, rotulo: u.nome }))], n.dono_id),
        ler: c => c.value || null, salvar: v => salvar({ dono_id: v }) }));
      dl.append(...linhaEd(k, { rotulo: "Valor previsto", desabilitado: !podeEditar,
        controle: h("input", { type: "text", inputmode: "decimal", value: n.valor_previsto != null ? Number(n.valor_previsto).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "", placeholder: "R$ 0,00" }),
        ler: c => k.L.lerNumero(c.value), validar: c => k.L.dinheiroInvalido(c.value) ? "Valor inválido. Use só números, por exemplo 1.500,00." : null,
        salvar: v => salvar({ valor_previsto: v }) }));
      if (n.status === "ganho") dl.append(...linhaEd(k, { rotulo: "Valor final", desabilitado: !podeEditar,
        controle: h("input", { type: "text", inputmode: "decimal", value: n.valor != null ? Number(n.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "" }),
        ler: c => k.L.lerNumero(c.value), validar: c => k.L.dinheiroInvalido(c.value) ? "Valor inválido. Use só números, por exemplo 1.500,00." : null,
        salvar: v => salvar({ valor: v }) }));
      const servicos = Object.keys(k.base.ticket || {});
      const idLista = `srv-${n.id}`;
      const inServ = h("input", { type: "text", value: n.servico || "", list: servicos.length ? idLista : null, maxlength: 120, placeholder: `Ex.: ${servicos[0] || k.v.servico}` });
      dl.append(...linhaEd(k, { rotulo: k.v.servico, desabilitado: !podeEditar, controle: inServ, largo: true,
        ler: c => c.value.trim() || null,
        salvar: async v => {
          const extra = {};
          const t = v && k.base.ticket ? Number(k.base.ticket[v]) : NaN;
          if (n.valor_previsto == null && Number.isFinite(t)) extra.valor_previsto = t;
          await salvar({ servico: v, ...extra });
          if (extra.valor_previsto != null) ui.toast(`Valor previsto sugerido pelo ticket: ${ui.brl(t)}.`, { tipo: "info" });
        } }));
      if (servicos.length) el.appendChild(h("datalist", { id: idLista }, servicos.map(s => h("option", { value: s }))));
      dl.append(...linhaEd(k, { rotulo: `Data e hora da ${nomeCompromisso(k)}`, desabilitado: !podeEditar, largo: true,
        controle: h("input", { type: "datetime-local", value: k.L.paraDataHoraLocal(n.consulta_em) }),
        ler: c => c.value || null, salvar: v => salvar({ consulta_em: v }) }));
      dl.append(...linhaEd(k, { rotulo: "Previsão de fechamento", desabilitado: !podeEditar,
        controle: h("input", { type: "date", value: n.previsao_fechamento || "" }),
        ler: c => c.value || null, salvar: v => salvar({ previsao_fechamento: v }) }));
      dl.append(...linhaEd(k, { rotulo: "Origem", desabilitado: !podeEditar || !!n.plataforma,
        controle: sel(Object.entries(k.L.ROTULO_ORIGEM).map(([valor, rotulo]) => ({ valor, rotulo })), n.origem),
        ler: c => c.value, salvar: v => salvar({ origem: v }) }));
      // pontuação do lead (automação «preencher um campo» = score, ou a IA): só leitura, com o motivo e quando foi atribuída
      const pont = k.L.pontuacao(n);
      if (pont) dl.append(h("div", { class: "ng-campo ng-campo-largo" }, h("dt", null, "Pontuação do lead"), h("dd", { class: "ng-pontuacao" },
        ui.pilula(`${pont.score} de 100`, pont.faixa === "alta" ? "ok" : pont.faixa === "media" ? "aten" : "neutra", { icone: "ia" }),
        pont.motivo ? h("span", { class: "ng-pontuacao-motivo" }, pont.motivo) : null,
        pont.em ? h("small", { class: "ng-pontuacao-em" }, `Atribuída em ${L.quandoPontuacao(pont.em)}`) : null)));
      const ddEtq = h("dd", null);
      const montarEtq = marcadas => {
        const etq = ui.seletorEtiquetas({ todas: k.base.etiquetas, marcadas, rotulo: "Etiquetas do negócio",
          podeCriar: podeEditar ? nome => k.criarEtiqueta(nome) : false, aoMudar: ids => etiquetar(ids) });
        if (!podeEditar) for (const b of etq.querySelectorAll("button")) b.disabled = true;
        ui.limpar(ddEtq); ddEtq.appendChild(etq);
      };
      // M25: etiquetar grava na hora e oferece «Desfazer» — que desfaz só ESTA troca (uma etiqueta posta depois continua)
      async function etiquetar(ids) {
        const antes = (n.etiquetas || []).slice();
        const nomeDe = id => (k.etiqueta(id) || {}).nome || "etiqueta";
        const mais = ids.filter(i => !antes.includes(i)), menos = antes.filter(i => !ids.includes(i));
        const texto = mais.length ? `Etiqueta «${nomeDe(mais[0])}» adicionada` : menos.length ? `Etiqueta «${nomeDe(menos[0])}» removida` : "Etiquetas atualizadas";
        try { await salvar({ etiquetas: ids }); }
        catch (e) { k.toastErro(e); montarEtq(antes); return; }
        ui.acaoComDesfazer({ texto, reverter: async () => {
          const volta = L.desfazerEtiquetas(n.etiquetas || [], mais, menos);
          await salvar({ etiquetas: volta });
          montarEtq(n.etiquetas || volta);
        } });
      }
      montarEtq(n.etiquetas || []);
      dl.append(h("div", { class: "ng-campo ng-campo-largo" }, h("dt", null, "Etiquetas"), ddEtq));
      el.appendChild(h("section", { class: "ng-bloco", "aria-label": "Dados" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, "Dados")), dl));

      /* campos personalizados do funil */
      const campos = k.L.camposDe(k.base.campos, "negocio", n.funil_id);
      if (campos.length) {
        const form = h("form", { class: "crm-form", novalidate: true }, campos.map(c => campoPersonalizado(k, c, (n.campos || {})[c.chave])));
        if (!podeEditar) for (const x of form.querySelectorAll("input,select,textarea")) x.disabled = true;
        form.addEventListener("change", async ev => {
          const cmp = ev.target.closest("[data-campo]");
          if (!cmp) return;
          const c = campos.find(x => `campo__${x.chave}` === cmp.dataset.campo);
          if (!c) return;
          const { valores, erros } = lerCamposPersonalizados(k, form, [c]);
          ui.marcarErro(form, cmp.dataset.campo, "");
          if (erros.length && !(c.obrigatorio && erros[0].texto.startsWith("Preencha"))) { ui.marcarErro(form, erros[0].nome, erros[0].texto); return; }
          try { await salvar({ campos: { [c.chave]: valores[c.chave] ?? null } }); ui.toast("Salvo.", { tipo: "ok", ms: 1500 }); }
          catch (e) { ui.marcarErro(form, cmp.dataset.campo, k.erro(e)); }
        });
        el.appendChild(h("section", { class: "ng-bloco", "aria-label": "Campos" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, "Campos")),
          campos.some(c => c.obrigatorio) ? h("p", { class: "sub" }, `Campos com * precisam estar preenchidos para marcar como ${k.v.ganhar.toLowerCase()}.`) : null, form));
      }

      /* observação */
      const obs = h("textarea", { rows: 3, maxlength: 5000, placeholder: "Observações sobre este negócio" }, n.obs || "");
      const dlObs = h("dl", { class: "ng-kv" }, ...linhaEd(k, { rotulo: "Observação", desabilitado: !podeEditar, controle: obs, largo: true,
        ler: c => c.value.trim() || null, salvar: v => salvar({ obs: v }) }));
      el.appendChild(h("section", { class: "ng-bloco" }, dlObs));

      /* outros negócios e atendimentos */
      if ((d.outros || []).length || (d.conversas || []).length) {
        const blk = h("section", { class: "ng-bloco", "aria-label": "Histórico do contato" }, h("div", { class: "ng-bloco-cab" }, h("h3", null, `Mais d${k.v.art("contato") === "a" ? "a" : "o"} ${k.v.min("contato")}`)));
        const lst = h("div", { class: "ng-outros" });
        for (const o of d.outros || []) {
          const e = k.estagio(o.estagio_id);
          lst.appendChild(h("button", { type: "button", class: "ng-mini", style: e && k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null,
            on: { click: () => { g.fechar(); setTimeout(() => abrirNegocio(k, o.id, { aoMudar }), 240); } } },
            h("i", { "aria-hidden": "true" }), h("span", null, `${k.L.tituloCard(o)} · ${e ? e.nome : ""}`),
            h("b", null, ui.brl(o.status === "ganho" ? o.valor : o.valor_previsto))));
        }
        for (const c of d.conversas || []) {
          lst.appendChild(h("a", { class: "fx-proto", href: `#/conversas/${c.id}` }, ui.icone("chat"),
            h("b", { class: "mono" }, c.protocolo),
            h("span", null, `${c.status === "resolvida" ? "Resolvido" : c.status === "pendente" ? "Pendente" : "Aberto"} · ${ui.dataBR(c.aberta_em)}`)));
        }
        blk.appendChild(lst);
        el.appendChild(blk);
      }
      return el;
    }

    corpo.append(h("div", { class: "ng" }, topo, abasEl.el, conteudo));
    mostrar();
  }

  if (!k.__tarefas) k.__tarefas = await k.mod("tarefas");
  await carregar();
  return g;
}

/* ============================================================ mover de funil */
export async function moverDeFunil(k, n, { aoMover } = {}) {
  const { ui, h, L } = k;
  const permitidos = L.funisPermitidos(k.base.funis, n.funil_id, n.status).filter(f => f.id !== n.funil_id);
  if (!permitidos.length) {
    const f = k.funil(n.funil_id);
    ui.toast(f && f.conta_no_ads && n.status !== "aberto" ? L.textoErro({ codigo: "funil_invalido", hint: "fechado_no_ads" })
      : f && f.conta_no_ads ? L.textoErro({ codigo: "funil_invalido", hint: "sai_do_ads" }) : "Não há outro funil disponível.", { tipo: "info" });
    return;
  }
  const selFunil = ui.campo({ rotulo: "Funil", nome: "funil", tipo: "select", valor: permitidos[0].id, opcoes: permitidos.map(f => ({ valor: f.id, rotulo: f.nome })) });
  const selEtapa = ui.campo({ rotulo: "Etapa", nome: "estagio", tipo: "select", opcoes: [] });
  const preencher = () => {
    const f = k.funil(selFunil.querySelector("select").value);
    const s = selEtapa.querySelector("select");
    ui.limpar(s);
    for (const e of (f ? f.estagios : []).filter(x => x.tipo === "aberto")) s.appendChild(h("option", { value: e.id }, e.nome));
  };
  selFunil.querySelector("select").addEventListener("change", preencher);
  preencher();
  const f = k.funil(n.funil_id);
  const aviso = f && f.conta_no_ads ? h("p", { class: "aviso aviso-aten" }, ui.icone("info"), h("span", null, "Este negócio está no funil de anúncios: ele só pode ir para outro funil de anúncios, para a receita e as conversas do anúncio não sumirem.")) : null;
  const corpo = h("form", { class: "crm-form", novalidate: true }, aviso, selFunil, selEtapa);
  const r = await ui.modal({ titulo: "Mover para outro funil", corpo, largura: "p", acoes: [
    { rotulo: "Cancelar", tipo: "neutro", valor: null },
    { rotulo: "Mover", tipo: "primario", fn: async api => {
      const e = k.estagio(corpo.querySelector("[data-campo=estagio] select").value);
      if (!e) { api.erro("Escolha a etapa."); return false; }
      try { const card = await moverComPerguntas(k, n, e); return card || false; } catch (err) { api.erro(k.erro(err)); return false; }
    } }] });
  if (r) { ui.toast("Movido.", { tipo: "ok" }); if (aoMover) aoMover(r); }
}

/* ============================================================ pós-venda */
/** "Iniciar pós-venda": negócio NOVO do mesmo contato num funil sem Ads (nx_negocio_salvar, origem manual). */
export async function iniciarPosVenda(k, n, contato, { aoCriar } = {}) {
  const { ui, h } = k;
  const funis = k.base.funis.filter(f => !f.conta_no_ads && f.ativo !== false);
  if (!funis.length) { ui.toast("Crie um funil de pós-venda (fora do Ads) em Configurações → Funis e etapas.", { tipo: "info" }); return; }
  const form = h("form", { class: "crm-form", novalidate: true },
    h("p", { class: "sub" }, `Cria ${k.v.art("negocio") === "a" ? "uma nova" : "um novo"} ${k.v.min("negocio")} para ${contato.nome || "este contato"}. ${k.v.art("negocio") === "a" ? "A" : "O"} atual continua ${k.v.ganhar.toLowerCase()} no funil de anúncios — a receita do anúncio não muda.`),
    ui.campo({ rotulo: "Funil", nome: "funil_id", tipo: "select", valor: funis[0].id, opcoes: funis.map(f => ({ valor: f.id, rotulo: f.nome })) }),
    ui.campo({ rotulo: "Título", nome: "titulo", valor: `Pós-venda — ${contato.nome || k.L.tituloCard(n)}`.slice(0, 120), max: 120 }));
  let reqAtual = null, reqConteudo = "";   // M25: uma chave por intenção
  const r = await ui.modal({ titulo: "Iniciar pós-venda", corpo: form, acoes: [
    { rotulo: "Cancelar", tipo: "neutro", valor: null },
    { rotulo: "Criar", tipo: "primario", fn: async api => {
      const d = ui.lerForm(form);
      try {
        const p = { contato_id: contato.id, funil_id: d.funil_id, titulo: d.titulo || null, origem: "manual" };
        const conteudo = JSON.stringify(p);
        if (conteudo !== reqConteudo) { reqAtual = k.novaReq(); reqConteudo = conteudo; }
        return (await k.escrever("nx_negocio_salvar", { p_negocio: p }, { req: reqAtual })).resultado;
      }
      catch (e) { api.erro(e && e.ambigua ? "Não foi possível confirmar se foi salvo. Toque em «Criar» de novo: é seguro, não duplica." : k.erro(e)); return false; }
    } }] });
  if (!r) return;
  ui.toast(`Pós-venda criado em «${(k.funil(r.funil_id) || {}).nome || "pós-venda"}».`, { tipo: "ok", desfazer: null });
  if (aoCriar) aoCriar(r);
  abrirNegocio(k, r.id, {});
}

/* ============================================================ duplicado (M24) */
/**
 * Com 10–13 dígitos no telefone procura o cadastro que já existe e avisa ANTES de criar: «Já existe: Mariana Costa, última conversa há 2 dias · Usar este cadastro».
 * inputTel = o <input> do telefone; aoUsar(contato) = o que fazer ao aceitar; ignorarId = o próprio cadastro (edição). → a caixa (insira no formulário).
 */
export function avisoDuplicado(k, inputTel, { aoUsar, ignorarId = null } = {}) {
  const { ui, h, L } = k;
  const caixa = h("div", { class: "crm-dup", role: "status", "aria-live": "polite", hidden: true });
  let seq = 0;
  const checar = ui.debounce(async () => {
    const minha = ++seq;
    const dig = String(inputTel.value || "").replace(/\D/g, "");
    ui.limpar(caixa); caixa.hidden = true;
    if (dig.length < 10 || dig.length > 13) return;
    try {
      const r = await k.api.rpcC("nx_contatos_listar", { p_filtro: { busca: dig }, p_por_pagina: 5 });
      if (minha !== seq) return;
      const achado = L.acharDuplicado(r && r.itens, dig, { ignorarId });
      if (!achado) return;
      const quando = achado.ultimo_contato_em ? `última conversa ${ui.relativo(achado.ultimo_contato_em)}` : "ainda sem conversa";
      caixa.append(ui.icone("info"),
        h("span", { class: "crm-dup-txt" }, h("b", null, "Já existe: "), `${L.nomeContato(achado)}, ${quando}`),
        h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { if (aoUsar) aoUsar(achado); } } }, "Usar este cadastro"));
      caixa.hidden = false;
    } catch { /* sem a checagem o servidor ainda não duplica: reaproveita o cadastro (nx_negocio_salvar) ou recusa (telefone_em_uso) */ }
  }, 400);
  inputTel.addEventListener("input", checar);
  return caixa;
}

/* ============================================================ novo negócio */
export async function novoNegocio(k, dados = {}, { aoCriar, aoFechar } = {}) {
  const { ui, h, L } = k;
  if (!k.pode("atendente")) { ui.toast("Seu acesso é só de leitura.", { tipo: "info" }); return null; }
  let contato = null;
  if (dados.contato_id) {
    try { contato = (await k.api.rpcC("nx_contato_ver", { p_id: dados.contato_id })).contato; } catch (e) { k.toastErro(e); return null; }
  }
  const g = ui.gaveta({ titulo: k.v.novo ? k.v.novo("negocio") : `Novo ${k.v.min("negocio")}`, largura: "m", aoFechar });
  const funis = k.base.funis.filter(f => f.ativo !== false);
  const funilIni = k.funil(dados.funil_id) || k.funilDoEstagio(dados.estagio_id) || k.funilPadrao();
  const form = h("form", { class: "crm-form", novalidate: true });

  /* contato: escolhido OU busca OU novo */
  const zonaContato = h("div", { class: "pilha-p" });
  let modoNovo = false;
  function desenharContato() {
    ui.limpar(zonaContato);
    zonaContato.appendChild(h("span", { class: "campo-rot" }, k.v.contato, h("span", { class: "obrig", "aria-hidden": "true" }, " *")));
    if (contato) {
      zonaContato.appendChild(h("div", { class: "crm-escolhido" }, ui.avatar(contato.nome || contato.telefone, contato.id),
        h("span", null, h("b", null, L.nomeContato(contato)), h("small", null, contato.telefone ? ui.telBR(contato.telefone) : contato.email || "")),
        dados.contato_id ? null : h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { contato = null; desenharContato(); } } }, "Trocar")));
      return;
    }
    if (modoNovo) {
      const grade = h("div", { class: "crm-form-2" },
        ui.campo({ rotulo: "Nome", nome: "c_nome", max: 160, autocomplete: "off" }),
        ui.campo({ rotulo: "Telefone / WhatsApp", nome: "c_telefone", tipo: "tel", placeholder: "(12) 99830-3030", autocomplete: "off", validar: "telefone" }),
        h("div", { class: "inteiro" }, ui.campo({ rotulo: "E-mail (opcional)", nome: "c_email", tipo: "email", autocomplete: "off" })));
      // M24: o aviso de cadastro já existente aparece enquanto digita o telefone («Já existe: Mariana Costa, última conversa há 2 dias · Usar este cadastro»)
      zonaContato.append(grade,
        avisoDuplicado(k, grade.querySelector("[name=c_telefone]"), { aoUsar: achado => { contato = achado; modoNovo = false; desenharContato(); } }),
        h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => { modoNovo = false; desenharContato(); } } }, "Buscar um cadastro existente"));
      return;
    }
    const busca = h("input", { type: "search", placeholder: "Buscar por nome ou telefone", "aria-label": `Buscar ${k.v.min("contato")}`, autocomplete: "off" });
    const res = h("div", { class: "crm-busca-res", role: "listbox", "aria-label": "Resultados" });
    let seq = 0;
    const buscar = ui.debounce(async () => {
      const q = busca.value.trim();
      const minha = ++seq;
      ui.limpar(res);
      if (q.length < 2) return;
      try {
        const r = await k.api.rpcC("nx_contatos_listar", { p_filtro: { busca: q }, p_por_pagina: 8 });
        if (minha !== seq) return;
        if (!r.itens.length) res.appendChild(h("p", { class: "flut-vazio" }, "Nada encontrado. Cadastre como novo."));
        for (const c of r.itens) res.appendChild(h("button", { type: "button", role: "option", on: { click: () => { contato = c; desenharContato(); } } },
          ui.avatar(c.nome || c.telefone, c.id), h("span", null, h("b", null, L.nomeContato(c)), h("small", null, [c.telefone ? ui.telBR(c.telefone) : null, c.email].filter(Boolean).join(" · ")))));
      } catch (e) { if (minha === seq) res.appendChild(h("p", { class: "flut-vazio" }, k.erro(e))); }
    }, 250);
    busca.addEventListener("input", buscar);
    zonaContato.append(h("div", { class: "busca" }, ui.icone("busca"), busca), res,
      h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => {
        modoNovo = true; desenharContato();
        const q = busca.value.trim();
        const alvo = /^[0-9\s().+-]+$/.test(q) ? zonaContato.querySelector("[name=c_telefone]") : zonaContato.querySelector("[name=c_nome]");
        if (alvo && q) alvo.value = q;
        (alvo || zonaContato.querySelector("input")).focus();
      } } }, ui.icone("mais"), `Cadastrar ${k.v.min("contato")} novo`));
    setTimeout(() => busca.focus(), 60);
  }
  desenharContato();

  /* funil e etapa */
  const selFunil = ui.campo({ rotulo: "Funil", nome: "funil_id", tipo: "select", valor: funilIni && funilIni.id,
    opcoes: (dados.funis || funis).map(f => ({ valor: f.id, rotulo: f.nome })) });
  const selEtapa = ui.campo({ rotulo: "Etapa", nome: "estagio_id", tipo: "select", opcoes: [] });
  const preencherEtapas = () => {
    const f = k.funil(selFunil.querySelector("select").value);
    const s = selEtapa.querySelector("select");
    ui.limpar(s);
    for (const e of (f ? f.estagios : []).filter(x => x.tipo === "aberto")) s.appendChild(h("option", { value: e.id, selected: e.id === dados.estagio_id }, e.nome));
  };
  selFunil.querySelector("select").addEventListener("change", preencherEtapas);
  preencherEtapas();

  const servicos = Object.keys(k.base.ticket || {});
  const inServico = ui.campo({ rotulo: k.v.servico, nome: "servico", max: 120, placeholder: servicos.length ? `Ex.: ${servicos[0]}` : "" });
  if (servicos.length) {
    const lista = h("datalist", { id: "srv-novo" }, servicos.map(s => h("option", { value: s })));
    inServico.querySelector("input").setAttribute("list", "srv-novo");
    inServico.appendChild(lista);
  }
  const inValor = ui.campo({ rotulo: "Valor previsto", nome: "valor_previsto", tipo: "moeda", placeholder: "R$ 0,00", validar: "moeda" });
  inServico.querySelector("input").addEventListener("change", ev => {
    const t = Number(k.base.ticket && k.base.ticket[ev.target.value]);
    const iv = inValor.querySelector("input");
    if (Number.isFinite(t) && !iv.value) iv.value = t.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  });
  const dono = h("div", { class: "campo" }, h("label", null, "Responsável"),
    ui.seletorPessoa({ usuarios: k.base.usuarios, valor: k.eu(), rotulo: "Responsável" }));
  dono.querySelector("select").name = "dono_id";
  let etiquetas = [];
  const etq = ui.seletorEtiquetas({ todas: k.base.etiquetas, marcadas: [], podeCriar: nome => k.criarEtiqueta(nome), aoMudar: ids => { etiquetas = ids; } });
  const erro = h("p", { class: "modal-erro", role: "alert", hidden: true });
  // M25: uma chave por intenção. Erro ambíguo (prazo estourado depois de o servidor aplicar) repete com a MESMA chave; mudou o conteúdo, chave nova.
  const status = h("p", { class: "crm-status", role: "status", "aria-live": "polite", hidden: true });
  let reqAtual = null, reqConteudo = "";

  form.append(zonaContato,
    ui.campo({ rotulo: "Título (opcional)", nome: "titulo", max: 120, placeholder: `Ex.: ${servicos[0] || "Implante superior"}` }),
    h("div", { class: "crm-form-2" }, selFunil, selEtapa, inServico, inValor,
      ui.campo({ rotulo: `Data e hora da ${nomeCompromisso(k)}`, nome: "consulta_em", tipo: "datahora" }), dono),
    h("div", { class: "pilha-p" }, h("span", { class: "campo-rot" }, "Etiquetas"), etq),
    status, erro,
    h("div", { class: "linha linha-fim" },
      h("button", { type: "button", class: "bt bt-sec", on: { click: () => g.fechar() } }, "Cancelar"),
      h("button", { type: "submit", class: "bt bt-prim" }, ui.icone("check"), `Criar ${k.v.min("negocio")}`)));
  // M30: título e procedimento digitados sobrevivem a uma recarga/queda de sessão («Rascunho restaurado · descartar»); só somem quando o servidor confirmar
  const chaveRasc = `negocio:novo:${dados.contato_id ? `contato:${dados.contato_id}` : dados.conversa_id ? `conversa:${dados.conversa_id}` : "avulso"}`;
  const rascunhos = ["titulo", "servico"].map(n => k.rascunho(form.querySelector(`[name=${n}]`), `${chaveRasc}:${n}`));
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    erro.hidden = true;
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    const campoValor = form.querySelector('[name="valor_previsto"]');
    if (campoValor) d.valor_previsto = k.L.lerNumero(campoValor.value);   // "1.500" = mil e quinhentos
    const p = { funil_id: d.funil_id, estagio_id: d.estagio_id, titulo: d.titulo || null, servico: d.servico || null,
      valor_previsto: d.valor_previsto, consulta_em: d.consulta_em || null, dono_id: d.dono_id || null, etiquetas, origem: "manual" };
    if (dados.conversa_id) p.conversa_id = dados.conversa_id;
    if (contato) p.contato_id = contato.id;
    else if (modoNovo) {
      if (!d.c_nome && !d.c_telefone) { ui.marcarErro(form, "c_nome", "Informe o nome ou o telefone."); return; }
      if (d.c_telefone && !L.normalizarTelefone(d.c_telefone)) { ui.marcarErro(form, "c_telefone", "Telefone inválido. Use DDD + número."); return; }
      p.contato = { nome: d.c_nome || null, telefone: d.c_telefone || null, email: d.c_email || null };
    } else { erro.textContent = `Escolha ${k.v.art("contato") === "a" ? "a" : "o"} ${k.v.min("contato")} ou cadastre ${k.v.art("contato") === "a" ? "uma nova" : "um novo"}.`; erro.hidden = false; return; }
    const conteudo = JSON.stringify(p);
    if (conteudo !== reqConteudo) { reqAtual = k.novaReq(); reqConteudo = conteudo; }
    try {
      const { resultado: n } = await ui.carregando(form.querySelector("[type=submit]"),
        k.escrever("nx_negocio_salvar", { p_negocio: p }, { req: reqAtual, aoStatus: t => { status.textContent = t; status.hidden = false; } }));
      status.hidden = true;
      for (const rc of rascunhos) rc.apagar();
      ui.toast(`${k.v.negocio} criad${k.v.art("negocio")}.`, { tipo: "ok" });
      if (aoCriar) try { aoCriar(n); } catch (e2) { console.error(e2); }
      g.fechar();
      setTimeout(() => abrirNegocio(k, n.id, { aoMudar: aoCriar ? c => aoCriar({ ...c, atualizado: true }) : null }), 260);
    } catch (e) {
      status.hidden = true;
      if (e && e.ambigua) { erro.textContent = "Não foi possível confirmar se foi salvo. Toque em «Criar» de novo: é seguro, não duplica."; erro.hidden = false; }
      else if (e && e.codigo === "telefone_invalido") ui.marcarErro(form, "c_telefone", k.erro(e));
      else { erro.textContent = k.erro(e); erro.hidden = false; }
    }
  });
  g.corpo.appendChild(form);
  return g;
}

/* ============================================================ ficha 360 numa gaveta */
export async function abrirContato(k, id, { aoMudar } = {}) {
  const { ui, h } = k;
  const g = ui.gaveta({ titulo: k.v.contato, largura: "g" });
  const alvo = h("div", { class: "crm" });
  g.corpo.appendChild(alvo);
  const Lst = await k.mod("listas");
  await Lst.montarFicha(k, alvo, id, { gaveta: g, aoMudar });
  return g;
}
