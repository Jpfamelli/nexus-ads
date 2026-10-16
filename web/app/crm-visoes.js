/* Visões locais do CRM. São preferências por conta/empresa/tela, não dados do servidor.
   plano 1000 (CR-136): na tela chamam-se «Filtros salvos» («visão» é termo técnico); o código e a chave no aparelho continuam «visões». */

export function controlesVisoes(k, { tipo, obterDados, aplicar } = {}) {
  if (!["kanban", "contatos"].includes(tipo) || typeof obterDados !== "function" || typeof aplicar !== "function") {
    throw new TypeError("configuração de visões inválida");
  }
  const { ui, h, L } = k;
  const chave = L.chaveVisoesCRM(k.ctx.cliente.id, k.eu(), tipo);
  let visoes = [];
  try { visoes = L.normalizarVisoesCRM(JSON.parse(localStorage.getItem(chave) || "[]"), tipo); } catch { visoes = []; }
  let selecionada = "";

  const seletor = h("select", { class: "sel crm-visoes-select", "aria-label": "Aplicar um filtro salvo", title: "Filtros salvos neste dispositivo" });
  const salvar = h("button", { type: "button", class: "bt bt-sec bt-p crm-visoes-salvar", on: { click: abrirSalvar } }, "Salvar filtro");
  // plano 1000 (CR-209): sem filtro escolhido o «Excluir» some (desligado, parecia texto solto ao lado do seletor)
  const excluir = h("button", { type: "button", class: "bt bt-fant bt-p crm-visoes-excluir", hidden: true, disabled: true, on: { click: removerSelecionada } }, "Excluir filtro");
  const raiz = h("div", { class: "crm-visoes", "aria-label": "Filtros salvos do CRM" }, seletor, salvar, excluir);

  function dadosAtuais() {
    try { return obterDados(); } catch { return null; }
  }
  function render() {
    selecionada = L.visaoCorrespondenteCRM(visoes, tipo, dadosAtuais());
    ui.limpar(seletor);
    seletor.appendChild(h("option", { value: "", selected: !selecionada }, "Filtros salvos…"));
    for (const v of visoes) seletor.appendChild(h("option", { value: v.id, selected: v.id === selecionada }, v.nome));
    excluir.disabled = !selecionada;
    excluir.hidden = !selecionada;
    excluir.setAttribute("aria-label", selecionada ? `Excluir o filtro salvo ${visoes.find(v => v.id === selecionada)?.nome || ""}`.trim() : "Nenhum filtro salvo selecionado");
  }
  function persistir(novas) {
    try { localStorage.setItem(chave, JSON.stringify(novas)); visoes = novas; render(); return true; }
    catch { ui.toast("O navegador não conseguiu guardar o filtro. Verifique o espaço ou a permissão de armazenamento.", { tipo: "erro" }); return false; }
  }

  seletor.addEventListener("change", async () => {
    const v = L.aplicarVisaoCRM(visoes, tipo, seletor.value);
    if (!v) { render(); return; }
    selecionada = v.id;
    try { await aplicar(v.dados); render(); }
    catch (e) { ui.toast(k.erro ? k.erro(e) : "Não foi possível aplicar o filtro salvo.", { tipo: "erro" }); render(); }
  });

  async function abrirSalvar() {
    const atual = L.visaoCorrespondenteCRM(visoes, tipo, dadosAtuais());
    const existente = visoes.find(v => v.id === atual);
    // plano 1000b · RB-199: sem filtro nenhum (nem período/ordem/funil fora do padrão) não há o que salvar
    const padrao = typeof k.funilPadrao === "function" ? k.funilPadrao() : null;
    if (!existente && L.visaoSemFiltroCRM(dadosAtuais(), tipo, { funilPadrao: padrao && padrao.id })) {
      ui.toast("Escolha algum filtro antes de salvar.", { tipo: "aviso" });
      return;
    }
    const form = h("form", { class: "crm-form", novalidate: true },
      ui.campo({ rotulo: "Nome do filtro", nome: "nome", valor: existente?.nome || "", max: 32, autocomplete: "off", placeholder: tipo === "kanban" ? "Ex.: Retornos desta semana" : "Ex.: Leads sem oportunidade" }),
      h("p", { class: "campo-ajuda" }, "Fica salvo somente neste dispositivo, para esta empresa e sua conta."));
    await ui.modal({ titulo: existente ? "Atualizar filtro salvo" : "Salvar os filtros atuais", corpo: form, largura: "p", acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: existente ? "Atualizar" : "Salvar filtro", tipo: "primario", fn: api => {
        const nome = ui.lerForm(form).nome;
        const r = L.salvarVisaoCRM(visoes, tipo, { id: existente?.id || null, nome, dados: dadosAtuais() });
        if (!r.ok) {
          const txt = r.codigo === "nome_invalido" ? "Use um nome de 2 a 32 caracteres."
            : r.codigo === "nome_duplicado" ? "Já existe um filtro salvo com esse nome."
              : r.codigo === "limite" ? "Você já tem 12 filtros salvos nesta tela. Exclua um antes de criar outro."   // plano 1000b · RB-196: «filtro» é masculino
                :"Não foi possível salvar esse estado da tela.";
          api.erro(txt); return false;
        }
        if (!persistir(r.visoes)) return false;
        ui.toast(r.codigo === "atualizada" ? "Filtro atualizado neste dispositivo." : "Filtro salvo neste dispositivo.", { tipo: "ok" });
        return true;
      } },
    ] });
  }

  async function removerSelecionada() {
    const atual = L.visaoCorrespondenteCRM(visoes, tipo, dadosAtuais());
    const item = visoes.find(v => v.id === atual);
    if (!item) return;
    if (!(await ui.confirmar({ titulo: `Excluir o filtro salvo «${item.nome}»?`, perigo: true,
      texto: "Isso remove apenas o atalho salvo neste dispositivo. Contatos, negócios e filtros do servidor não são alterados." }))) return;
    if (persistir(L.excluirVisaoCRM(visoes, tipo, item.id))) ui.toast("Filtro salvo removido deste dispositivo.", { tipo: "ok" });
  }

  render();
  return { el: raiz, atualizar: render };
}

/**
 * plano 1000 (CR-013): grupo «Campo» dos filtros (Kanban e Pacientes) — o servidor já filtra por campo personalizado (nx_crm_filtro_campo:
 * vazio, preenchido, igual, contém, maior, menor). grupoFiltroCampo(k, {entidade, funilId, atual}) → null (sem campos) | {el, ler(), mudou()}.
 * ler() → {campo: {chave, op, valor?} | null, erro: texto | null}.
 */
export function grupoFiltroCampo(k, { entidade, funilId = null, atual = null } = {}) {
  const { h, L, ui } = k;
  const campos = L.camposDe((k.base && k.base.campos) || [], entidade, funilId);
  if (!campos.length) return null;
  const inicial = JSON.stringify(atual || null);
  const selCampo = h("select", { class: "sel crm-fc-campo", "aria-label": "Campo personalizado" }, h("option", { value: "" }, "Nenhum campo"),
    campos.map(c => h("option", { value: c.chave, selected: !!atual && atual.chave === c.chave }, c.rotulo)));
  const selOp = h("select", { class: "sel crm-fc-op", "aria-label": "Condição do campo" });
  const caixaValor = h("div", { class: "crm-fc-valor" });
  let ctlValor = null;
  const def = () => campos.find(c => c.chave === selCampo.value) || null;
  function desenhar(primeira) {
    const c = def();
    selOp.hidden = caixaValor.hidden = !c;
    ui.limpar(selOp); ui.limpar(caixaValor); ctlValor = null;
    if (!c) return;
    const ops = L.opsDoCampo(c.tipo);
    const opAtual = primeira && atual && ops.includes(atual.op) ? atual.op : ops[0];
    for (const op of ops) selOp.appendChild(h("option", { value: op, selected: op === opAtual }, L.rotuloOpCampo(op, c.tipo)));      // plano 1000b · RB-197: «inclui» no campo multi
    const v0 = primeira && atual && atual.valor != null ? String(atual.valor) : "";
    if (c.tipo === "opcao" || c.tipo === "multi") ctlValor = h("select", { class: "sel", "aria-label": `Valor de ${c.rotulo}` }, (c.opcoes || []).map(o => h("option", { value: o, selected: o === v0 }, o)));
    else if (c.tipo === "sim_nao") ctlValor = h("select", { class: "sel", "aria-label": `Valor de ${c.rotulo}` }, h("option", { value: "true", selected: v0 !== "false" }, "Sim"), h("option", { value: "false", selected: v0 === "false" }, "Não"));
    else ctlValor = h("input", { type: c.tipo === "data" ? "date" : "text", inputmode: ["numero", "moeda"].includes(c.tipo) ? "decimal" : null, "aria-label": `Valor de ${c.rotulo}`, placeholder: "Valor", value: v0 });
    caixaValor.appendChild(ctlValor);
    mostrarValor();
  }
  function mostrarValor() { caixaValor.hidden = !def() || ["vazio", "preenchido"].includes(selOp.value); }
  selCampo.addEventListener("change", () => desenhar(false));
  selOp.addEventListener("change", mostrarValor);
  desenhar(true);
  const el = h("fieldset", { class: "crm-filtros-grupo crm-fc" }, h("legend", { class: "rotulo" }, "Campo personalizado")   /* plano 1000b · RB-198: a legenda diz que é campo personalizado */, h("div", { class: "crm-filtros-linha" }, selCampo, selOp), caixaValor);
  function ler() {
    const c = def();
    if (!c) return { campo: null, erro: null };
    const bruto = { chave: c.chave, op: selOp.value, valor: ctlValor ? ctlValor.value : "" };
    const campo = L.filtroCampoLimpo(bruto, campos);
    return campo ? { campo, erro: null } : { campo: null, erro: `Informe um valor válido para «${c.rotulo}».` };
  }
  return { el, ler, mudou: () => JSON.stringify(ler().campo) !== inicial };
}

/**
 * plano 1000b · RB-021: com catálogo grande (mais de 12 etiquetas) os Filtros ganham «Buscar etiqueta» acima das caixas — filtra pelo nome
 * (sem acento/maiúscula) e NUNCA esconde as marcadas. buscaEtiquetas(k, opsEt) → o campo (ou null com até 12).
 */
export function buscaEtiquetas(k, opsEt, { limite = 12 } = {}) {
  const { h, L } = k;
  const itens = opsEt ? opsEt.querySelectorAll(".crm-op") : [];
  if (itens.length <= limite) return null;
  const norm = s => (L && L.semAcento ? L.semAcento(String(s || "")) : String(s || "").toLowerCase()).trim();
  const campo = h("input", { type: "search", class: "crm-fe-busca", placeholder: "Buscar etiqueta", "aria-label": "Buscar etiqueta", autocomplete: "off" });
  const nada = h("small", { class: "crm-fe-nada", hidden: true }, "Nenhuma etiqueta com esse nome.");
  campo.addEventListener("input", () => {
    const q = norm(campo.value);
    let vis = 0;
    for (const it of itens) {
      const marcada = !!(it.querySelector("input") || {}).checked;
      const mostra = !q || marcada || norm(it.textContent).includes(q);
      it.hidden = !mostra;
      if (mostra) vis++;
    }
    nada.hidden = vis > 0;
  });
  return h("div", { class: "crm-fe-buscar" }, campo, nada);
}
