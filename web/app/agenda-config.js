/* ============================================================
   ÓRBITA — Configurações da agenda · F8
   Horário, capacidade, duração e bloqueios por empresa.
   ============================================================ */

const DIAS = [
  ["0", "Domingo"], ["1", "Segunda-feira"], ["2", "Terça-feira"], ["3", "Quarta-feira"],
  ["4", "Quinta-feira"], ["5", "Sexta-feira"], ["6", "Sábado"],
];

export const secoesConfig = [
  { id: "agenda", titulo: "Agenda", grupo: "Atendimento", papelMin: "admin", modulo: "crm", icone: "calendario", montar: secaoAgenda },
];

function listaFaixas(h, ui, dia, faixas, habilitado) {
  const caixa = h("div", { class: "agc-faixas", hidden: !habilitado });
  function adicionar([de = "08:00", ate = "18:00"] = []) {
    const inicio = h("input", { type: "time", value: de, step: 300, "aria-label": `${dia}: início do horário` });
    const fim = h("input", { type: "time", value: ate, step: 300, "aria-label": `${dia}: fim do horário` });
    const remover = h("button", { type: "button", class: "bt-icone agc-remover", "aria-label": `Remover faixa de ${dia}`, on: { click: () => linha.remove() } }, ui.icone("fechar"));
    const linha = h("div", { class: "agc-faixa" }, inicio, h("span", null, "até"), fim, remover);
    caixa.appendChild(linha);
  }
  for (const faixa of faixas) adicionar(faixa);
  const add = h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => adicionar() } }, ui.icone("mais"), "Adicionar horário");
  caixa.appendChild(add);
  return { caixa, ler: () => [...caixa.querySelectorAll(".agc-faixa")].map(l => [l.querySelector("input").value, l.querySelectorAll("input")[1].value]) };
}

function linhaIntervalo(h, ui, de = "12:00", ate = "13:00", rotulo = "Intervalo") {
  const inicio = h("input", { type: "time", value: de, step: 300, "aria-label": `${rotulo}: início` });
  const fim = h("input", { type: "time", value: ate, step: 300, "aria-label": `${rotulo}: fim` });
  const linha = h("div", { class: "agc-faixa" }, inicio, h("span", null, "até"), fim,
    h("button", { type: "button", class: "bt-icone agc-remover", "aria-label": `Remover ${rotulo.toLowerCase()}`, on: { click: () => linha.remove() } }, ui.icone("fechar")));
  return linha;
}

async function secaoAgenda(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ui.carregarCss("agenda");
  ui.limpar(alvo);
  alvo.appendChild(ui.esqueleto("cartoes", 2));
  let estado;
  try { estado = await api.rpcC("nx_agenda_config_ver", {}); }
  catch (e) { ui.limpar(alvo); alvo.appendChild(ui.erroCartao(e, () => secaoAgenda(ctx, alvo))); return; }

  const cfg = estado.config || {};
  const raiz = h("div", { class: "agc" });
  const top = h("header", { class: "pilha" },
    h("h2", { class: "titulo-sec" }, "Agenda e horários"),
    h("p", { class: "sub" }, "Defina quando sua equipe atende, quanto tempo cada serviço ocupa e quando a agenda deve ficar fechada."));
  alvo.replaceChildren(top, raiz);

  const usarAgenda = ui.campo({ tipo: "interruptor", nome: "usar_horario", rotulo: "Definir horários nesta agenda", valor: cfg.horario_fonte === "agenda",
    ajuda: cfg.horario_fonte === "departamento" ? "No momento, os horários vêm do departamento padrão." : cfg.horario_fonte === "padrao" ? "No momento, vale o padrão de segunda a sexta, das 8h às 18h." : "Desligado, a agenda usa o horário do departamento padrão." });
  const gradeDias = h("div", { class: "agc-dias" });
  const controlesDia = [];
  for (const [id, nome] of DIAS) {
    const atual = cfg.horario && cfg.horario[id];
    const faixas = Array.isArray(atual) ? atual : [];
    const ligada = ui.campo({ tipo: "interruptor", nome: `dia_${id}`, rotulo: nome, valor: faixas.length > 0 });
    const linhas = listaFaixas(h, ui, nome, faixas, faixas.length > 0);
    ligada.querySelector("input").addEventListener("change", ev => {
      linhas.caixa.hidden = !ev.target.checked;
      if (ev.target.checked && !linhas.caixa.querySelector(".agc-faixa")) linhas.caixa.querySelector("button").click();
    });
    gradeDias.appendChild(h("div", { class: "agc-dia" }, ligada, linhas.caixa));
    controlesDia.push({ id, ligada: ligada.querySelector("input"), linhas });
  }

  const intervalos = h("div", { class: "agc-intervalos" });
  const pausas = Array.isArray(cfg.intervalos) ? cfg.intervalos : [];
  for (const faixa of pausas) intervalos.appendChild(linhaIntervalo(h, ui, faixa[0], faixa[1]));
  const addIntervalo = h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => intervalos.appendChild(linhaIntervalo(h, ui)) } }, ui.icone("mais"), "Adicionar intervalo");

  const duracoes = h("div", { class: "agc-duracoes" });
  function adicionarDuracao(nome = "", minutos = cfg.duracao_min || 30) {
    const servico = h("input", { type: "text", value: nome, maxlength: 60, placeholder: "Nome do serviço", "aria-label": "Nome do serviço" });
    const tempo = h("input", { type: "number", min: 5, max: 480, step: 5, value: String(minutos), "aria-label": `Duração em minutos para ${nome || "o serviço"}` });
    const linha = h("div", { class: "agc-duracao" }, servico, h("label", null, "min", tempo),
      h("button", { type: "button", class: "bt-icone agc-remover", "aria-label": `Remover duração de ${nome || "serviço"}`, on: { click: () => linha.remove() } }, ui.icone("fechar")));
    duracoes.appendChild(linha);
  }
  for (const [nome, minutos] of Object.entries(cfg.duracoes || {})) adicionarDuracao(nome, minutos);
  const addDuracao = h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => adicionarDuracao() } }, ui.icone("mais"), "Adicionar serviço");

  const form = h("form", { class: "pilha agc-form", novalidate: true },
    h("section", { class: "cartao pilha" },
      h("div", { class: "cartao-cab" }, h("div", null, h("h3", { class: "titulo-sec" }, "Disponibilidade"), h("p", { class: "sub" }, "Os horários livres são calculados no fuso de São Paulo."))),
      usarAgenda, gradeDias,
      h("div", { class: "pilha-p" }, h("div", null, h("h4", null, "Pausas e almoço"), h("p", { class: "sub" }, "Intervalos aplicados a todos os dias de atendimento.")), intervalos, addIntervalo)),
    h("section", { class: "cartao pilha" },
      h("div", { class: "cartao-cab" }, h("div", null, h("h3", { class: "titulo-sec" }, "Duração e capacidade"), h("p", { class: "sub" }, "Ajuste o tempo por serviço. O padrão é usado quando um serviço não tem duração própria."))),
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Duração padrão (minutos)", nome: "duracao_min", tipo: "numero", valor: cfg.duracao_min || 30, min: 5, max: 480, passo: 5 }),
        ui.campo({ rotulo: "Atendimentos no mesmo horário", nome: "capacidade", tipo: "numero", valor: cfg.capacidade || 1, min: 1, max: 50 }),
        ui.campo({ rotulo: "Antecedência mínima (horas)", nome: "antecedencia_horas", tipo: "numero", valor: cfg.antecedencia_horas ?? 2, min: 0, max: 720 }),
        ui.campo({ rotulo: "Agendamento até (dias à frente)", nome: "dias_a_frente", tipo: "numero", valor: cfg.dias_a_frente || 30, min: 1, max: 180 }),
        ui.campo({ rotulo: "Intervalo entre horários (minutos)", nome: "passo_min", tipo: "numero", valor: cfg.passo_min || "", min: 5, max: 480, passo: 5, placeholder: "Igual à duração" })),
      h("div", { class: "pilha-p" }, h("div", null, h("h4", null, "Duração por serviço"), h("p", { class: "sub" }, "Ex.: avaliação 30 min, limpeza 45 min. Até 30 serviços.")), duracoes, addDuracao),
      h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, ui.icone("check"), "Salvar agenda"))));

  const fonteAgenda = usarAgenda.querySelector("input");
  const fonteToggle = () => { gradeDias.hidden = !fonteAgenda.checked; };
  fonteAgenda.addEventListener("change", fonteToggle);
  fonteToggle();
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const dados = ui.lerForm(form);
    const numero = nome => Number(dados[nome]);
    const duracao = numero("duracao_min");
    const capacidade = numero("capacidade");
    const antecedencia = numero("antecedencia_horas");
    const dias = numero("dias_a_frente");
    const passoTxt = dados.passo_min == null || dados.passo_min === "" ? null : Number(dados.passo_min);
    if (!Number.isInteger(duracao) || duracao < 5 || duracao > 480) return ui.toast("A duração padrão deve ficar entre 5 e 480 minutos.", { tipo: "erro" });
    if (!Number.isInteger(capacidade) || capacidade < 1 || capacidade > 50) return ui.toast("A capacidade deve ficar entre 1 e 50 atendimentos.", { tipo: "erro" });
    if (![antecedencia, dias].every(Number.isInteger) || antecedencia < 0 || antecedencia > 720 || dias < 1 || dias > 180) return ui.toast("Confira a antecedência e o limite de dias da agenda.", { tipo: "erro" });
    if (passoTxt !== null && (!Number.isInteger(passoTxt) || passoTxt < 5 || passoTxt > 480)) return ui.toast("O intervalo entre horários deve ficar entre 5 e 480 minutos.", { tipo: "erro" });

    const horario = Object.fromEntries(controlesDia.map(d => [d.id, d.ligada.checked ? d.linhas.ler() : []]));
    for (const d of controlesDia) if (d.ligada.checked && (!horario[d.id].length || horario[d.id].some(([a, b]) => !a || !b || a >= b))) {
      return ui.toast(`Confira os horários de ${DIAS[Number(d.id)][1]}.`, { tipo: "erro" });
    }
    const pausasSalvas = [...intervalos.querySelectorAll(".agc-faixa")].map(l => [...l.querySelectorAll("input")].map(x => x.value));
    if (pausasSalvas.some(([a, b]) => !a || !b || a >= b)) return ui.toast("Confira os horários dos intervalos.", { tipo: "erro" });
    const duracoesSalvas = {};
    for (const linha of duracoes.querySelectorAll(".agc-duracao")) {
      const [campoNome, campoTempo] = linha.querySelectorAll("input");
      const nome = campoNome.value.trim();
      if (!nome) { if (campoTempo.value) return ui.toast("Informe o nome de cada serviço com duração própria.", { tipo: "erro" }); continue; }
      const chave = nome.toLocaleLowerCase("pt-BR");
      const minutos = Number(campoTempo.value);
      if (!Number.isInteger(minutos) || minutos < 5 || minutos > 480) return ui.toast(`A duração de “${nome}” deve ficar entre 5 e 480 minutos.`, { tipo: "erro" });
      if (Object.keys(duracoesSalvas).some(s => s.toLocaleLowerCase("pt-BR") === chave)) return ui.toast(`O serviço “${nome}” aparece mais de uma vez.`, { tipo: "erro" });
      duracoesSalvas[nome] = minutos;
    }
    if (Object.keys(duracoesSalvas).length > 30) return ui.toast("A agenda aceita até 30 durações por serviço.", { tipo: "erro" });
    const cfgNova = {
      duracao_min: duracao, capacidade, antecedencia_horas: antecedencia, dias_a_frente: dias,
      passo_min: passoTxt, horario: fonteAgenda.checked ? horario : null,
      intervalos: pausasSalvas, duracoes: duracoesSalvas,
    };
    try {
      const salvo = await ui.carregando(form.querySelector('[type="submit"]'), api.rpcC("nx_agenda_config_salvar", { p_cfg: cfgNova }));
      estado = salvo;
      ui.toast("Agenda salva.", { tipo: "ok" });
      await secaoAgenda(ctx, alvo);
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  });

  const listaBloqueios = h("div", { class: "agc-bloqueios", role: "list" });
  function desenharBloqueios() {
    ui.limpar(listaBloqueios);
    const futuros = (estado.bloqueios || []).filter(b => b.fim && new Date(b.fim) > new Date()).slice(0, 30);
    if (!futuros.length) listaBloqueios.appendChild(h("p", { class: "sub" }, "Nenhum bloqueio futuro."));
    for (const b of futuros) {
      const excluir = h("button", { type: "button", class: "bt bt-fant bt-p", "aria-label": `Remover bloqueio de ${ui.dataHoraBR(b.inicio)}`, on: { click: async () => {
        if (!(await ui.confirmar({ titulo: "Remover bloqueio?", texto: "Os horários deste período voltarão a aparecer como disponíveis.", perigo: true, rotulo: "Remover bloqueio" }))) return;
        try {
          estado = await ui.carregando(excluir, api.rpcC("nx_agenda_bloqueio_excluir", { p_id: b.id }));
          desenharBloqueios(); ui.toast("Bloqueio removido.", { tipo: "ok" });
        } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      } } }, ui.icone("lixeira"), "Remover");
      listaBloqueios.appendChild(h("article", { class: "agc-bloqueio", role: "listitem" },
        h("div", null, h("b", null, b.motivo || "Indisponível"), h("small", null, `${ui.dataHoraBR(b.inicio)} — ${ui.dataHoraBR(b.fim)}`)), excluir));
    }
    if ((estado.bloqueios || []).length > 30) listaBloqueios.appendChild(h("p", { class: "campo-ajuda" }, "Mostrando os próximos 30 bloqueios."));
  }
  desenharBloqueios();

  const btBloqueio = h("button", { type: "button", class: "bt bt-sec", on: { click: criarBloqueio } }, ui.icone("mais"), "Bloquear período");
  raiz.append(form, h("section", { class: "cartao pilha" },
    h("div", { class: "cartao-cab" }, h("div", null, h("h3", { class: "titulo-sec" }, "Datas indisponíveis"), h("p", { class: "sub" }, "Feche um dia inteiro ou somente uma faixa de horário.")), btBloqueio),
    listaBloqueios));

  async function criarBloqueio() {
    const corpo = h("div", { class: "pilha agc-form" },
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Data inicial", nome: "data", tipo: "data", valor: ui.hojeSP() }),
        ui.campo({ rotulo: "Data final (opcional)", nome: "data_fim", tipo: "data" })),
      h("p", { class: "campo-ajuda" }, "Deixe os horários vazios para bloquear o dia inteiro. Para bloquear algumas horas, preencha início e fim."),
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Das", nome: "das", tipo: "hora" }),
        ui.campo({ rotulo: "Até", nome: "ate", tipo: "hora" })),
      ui.campo({ rotulo: "Motivo (opcional)", nome: "motivo", max: 120, placeholder: "Ex.: feriado, manutenção" }));
    const r = await ui.modal({ titulo: "Bloquear horário", corpo, largura: "p", acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: "Salvar bloqueio", tipo: "primario", fn: async m => {
        const d = ui.lerForm(corpo);
        if (!d.data) { m.erro("Escolha uma data inicial."); return false; }
        if (d.data_fim && d.data_fim < d.data) { m.erro("A data final precisa ser igual ou posterior à data inicial."); return false; }
        if (!!d.das !== !!d.ate) { m.erro("Preencha os dois horários ou deixe os dois vazios."); return false; }
        if (d.das && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.das) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.ate) || d.das >= d.ate)) { m.erro("Confira o intervalo. O horário final precisa ser posterior ao inicial."); return false; }
        try {
          const dados = { data: d.data, ...(d.data_fim ? { data_fim: d.data_fim } : {}), ...(d.das ? { das: d.das, ate: d.ate } : {}), motivo: d.motivo || null };
          return await api.rpcC("nx_agenda_bloqueio_salvar", { p_bloqueio: dados });
        } catch (e) { m.erro(api.mensagemErro(e)); return false; }
      } },
    ] });
    if (r && r.ok) { estado = r; desenharBloqueios(); ui.toast("Bloqueio salvo.", { tipo: "ok" }); }
  }
}
