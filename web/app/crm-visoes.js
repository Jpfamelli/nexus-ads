/* Visões locais do CRM. São preferências por conta/empresa/tela, não dados do servidor. */

export function controlesVisoes(k, { tipo, obterDados, aplicar } = {}) {
  if (!["kanban", "contatos"].includes(tipo) || typeof obterDados !== "function" || typeof aplicar !== "function") {
    throw new TypeError("configuração de visões inválida");
  }
  const { ui, h, L } = k;
  const chave = L.chaveVisoesCRM(k.ctx.cliente.id, k.eu(), tipo);
  let visoes = [];
  try { visoes = L.normalizarVisoesCRM(JSON.parse(localStorage.getItem(chave) || "[]"), tipo); } catch { visoes = []; }
  let selecionada = "";

  const seletor = h("select", { class: "sel crm-visoes-select", "aria-label": "Aplicar uma visão salva", title: "Visões salvas neste dispositivo" });
  const salvar = h("button", { type: "button", class: "bt bt-sec bt-p crm-visoes-salvar", on: { click: abrirSalvar } }, "Salvar visão");
  const excluir = h("button", { type: "button", class: "bt bt-fant bt-p crm-visoes-excluir", disabled: true, on: { click: removerSelecionada } }, "Excluir visão");
  const raiz = h("div", { class: "crm-visoes", "aria-label": "Visões salvas do CRM" }, seletor, salvar, excluir);

  function dadosAtuais() {
    try { return obterDados(); } catch { return null; }
  }
  function render() {
    selecionada = L.visaoCorrespondenteCRM(visoes, tipo, dadosAtuais());
    ui.limpar(seletor);
    seletor.appendChild(h("option", { value: "", selected: !selecionada }, "Visões salvas…"));
    for (const v of visoes) seletor.appendChild(h("option", { value: v.id, selected: v.id === selecionada }, v.nome));
    excluir.disabled = !selecionada;
    excluir.setAttribute("aria-label", selecionada ? `Excluir visão ${visoes.find(v => v.id === selecionada)?.nome || "salva"}` : "Nenhuma visão salva selecionada");
  }
  function persistir(novas) {
    try { localStorage.setItem(chave, JSON.stringify(novas)); visoes = novas; render(); return true; }
    catch { ui.toast("O navegador não conseguiu guardar a visão. Verifique o espaço ou a permissão de armazenamento.", { tipo: "erro" }); return false; }
  }

  seletor.addEventListener("change", async () => {
    const v = L.aplicarVisaoCRM(visoes, tipo, seletor.value);
    if (!v) { render(); return; }
    selecionada = v.id;
    try { await aplicar(v.dados); render(); }
    catch (e) { ui.toast(k.erro ? k.erro(e) : "Não foi possível aplicar a visão.", { tipo: "erro" }); render(); }
  });

  async function abrirSalvar() {
    const atual = L.visaoCorrespondenteCRM(visoes, tipo, dadosAtuais());
    const existente = visoes.find(v => v.id === atual);
    const form = h("form", { class: "crm-form", novalidate: true },
      ui.campo({ rotulo: "Nome da visão", nome: "nome", valor: existente?.nome || "", max: 32, autocomplete: "off", placeholder: tipo === "kanban" ? "Ex.: Retornos desta semana" : "Ex.: Leads sem oportunidade" }),
      h("p", { class: "campo-ajuda" }, "Fica salva somente neste dispositivo, para esta empresa e sua conta."));
    await ui.modal({ titulo: existente ? "Atualizar visão salva" : "Salvar visão atual", corpo: form, largura: "p", acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: existente ? "Atualizar" : "Salvar visão", tipo: "primario", fn: api => {
        const nome = ui.lerForm(form).nome;
        const r = L.salvarVisaoCRM(visoes, tipo, { id: existente?.id || null, nome, dados: dadosAtuais() });
        if (!r.ok) {
          const txt = r.codigo === "nome_invalido" ? "Use um nome de 2 a 32 caracteres."
            : r.codigo === "nome_duplicado" ? "Já existe uma visão com esse nome."
              : r.codigo === "limite" ? "Você já tem 12 visões salvas nesta tela. Exclua uma antes de criar outra."
                : "Não foi possível salvar esse estado da tela.";
          api.erro(txt); return false;
        }
        if (!persistir(r.visoes)) return false;
        ui.toast(r.codigo === "atualizada" ? "Visão atualizada neste dispositivo." : "Visão salva neste dispositivo.", { tipo: "ok" });
        return true;
      } },
    ] });
  }

  async function removerSelecionada() {
    const atual = L.visaoCorrespondenteCRM(visoes, tipo, dadosAtuais());
    const item = visoes.find(v => v.id === atual);
    if (!item) return;
    if (!(await ui.confirmar({ titulo: `Excluir a visão «${item.nome}»?`, perigo: true,
      texto: "Isso remove apenas o atalho salvo neste dispositivo. Contatos, negócios e filtros do servidor não são alterados." }))) return;
    if (persistir(L.excluirVisaoCRM(visoes, tipo, item.id))) ui.toast("Visão removida deste dispositivo.", { tipo: "ok" });
  }

  render();
  return { el: raiz, atualizar: render };
}
