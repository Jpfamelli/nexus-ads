/* ============================================================
   ÓRBITA — agenda.js · consultas ligadas ao CRM
   Consulta e gravação usam as RPCs da agenda; o servidor é a
   autoridade para horários, capacidade e conflitos.
   ============================================================ */

const ORIGENS = {
  anuncio: "Anúncio", whatsapp: "WhatsApp", indicacao: "Indicação",
  organico: "Orgânico", manual: "Manual", site: "Site", importacao: "Importação",
};

function diaISO(iso, delta = 0) {
  const [a, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + delta, 12));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function nomeDia(iso, longo = false) {
  const t = new Intl.DateTimeFormat("pt-BR", {
    weekday: longo ? "long" : "short", day: "2-digit", month: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(`${iso}T12:00:00-03:00`));
  return t.charAt(0).toUpperCase() + t.slice(1); // só a 1ª letra ("Qui., 01 de out."); o CSS capitalize gerava "De Out."
}

function origemDo(item) {
  const nome = item.plataforma === "google" ? "Google Ads"
    : item.plataforma === "meta" ? "Meta Ads"
      : ORIGENS[item.origem] || "Origem não informada";
  const rastreio = item.rastreio && typeof item.rastreio === "object" ? item.rastreio : {};
  const campanha = item.campanha_nome || item.campanha || rastreio.utm_campaign || item.campanha_ext;
  const anuncio = item.anuncio_nome || item.anuncio_titulo || rastreio.utm_content || item.anuncio_ext;
  return [nome, campanha, anuncio].filter(Boolean).join(" · ");
}

function erroResposta(r) {
  if (r && r.ok === false) throw Object.assign(new Error(r.erro || "dados_invalidos"), { codigo: r.erro || "dados_invalidos" });
  return r;
}

export function desmontar() {}

export async function montar(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  ui.carregarCss("agenda");
  ctx.titulo("Agenda");

  let data = ui.hojeSP();
  let modo = "semana";
  let atual = null;
  let sequencia = 0;
  let vivo = true;

  const cabecalho = h("header", { class: "agenda-cab" });
  const conteudo = h("div", { class: "agenda-conteudo", "aria-live": "polite" });
  ui.limpar(ctx.alvo);
  ctx.alvo.append(cabecalho, conteudo);

  function montarCabecalho() {
    ui.limpar(cabecalho);
    const anterior = h("button", { type: "button", class: "bt-icone", "aria-label": "Período anterior", on: { click: () => mover(-1) } }, ui.icone("seta-esq"));
    const proximo = h("button", { type: "button", class: "bt-icone", "aria-label": "Próximo período", on: { click: () => mover(1) } }, ui.icone("seta-dir"));
    const hoje = h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => { data = ui.hojeSP(); carregar(); } } }, "Hoje");
    const seletor = h("input", { class: "agenda-data", type: "date", value: data, "aria-label": "Escolher data" });
    seletor.addEventListener("change", () => { if (seletor.value) { data = seletor.value; carregar(); } });
    const periodo = h("div", { class: "agenda-periodo" }, anterior, seletor, proximo, hoje);
    const alternador = h("div", { class: "agenda-abas", role: "group", "aria-label": "Visualização da agenda" },
      ...[["dia", "Dia"], ["semana", "Semana"]].map(([id, rotulo]) => h("button", {
        type: "button", class: ["bt", modo === id ? "bt-prim" : "bt-fant", "bt-p"],
        "aria-pressed": String(modo === id), on: { click: () => { modo = id; montarCabecalho(); carregar(); } },
      }, rotulo)));
    const acoes = h("div", { class: "agenda-acoes" }, alternador,
      ctx.pode("atendente") ? h("button", { type: "button", class: "bt bt-prim", on: { click: () => abrirAgendamento() } }, ui.icone("mais"), "Marcar consulta") : null);
    cabecalho.append(
      h("div", { class: "agenda-cab-titulo" },
        h("p", { class: "rotulo" }, ctx.cliente && ctx.cliente.nome || ""),
        h("h1", { class: "titulo-pag" }, "Agenda")),
      h("div", { class: "agenda-cab-controles" }, periodo, acoes));
  }

  function mover(delta) {
    data = diaISO(data, delta * (modo === "semana" ? 7 : 1));
    montarCabecalho();
    carregar();
  }

  async function carregar({ silencioso = false } = {}) {
    const minha = ++sequencia;
    montarCabecalho();
    if (!silencioso || !atual) {
      ui.limpar(conteudo);
      conteudo.appendChild(ui.esqueleto("cartoes", modo === "semana" ? 4 : 2));
    }
    try {
      const r = await api.rpcC("nx_agenda_dia", { p_data: data, p_dias: modo === "semana" ? 7 : 1 });
      if (!vivo || minha !== sequencia) return;
      atual = r || { consultas: [], bloqueios: [] };
      desenhar();
    } catch (e) {
      if (!vivo || minha !== sequencia) return;
      ui.limpar(conteudo);
      conteudo.appendChild(ui.erroCartao(e, () => carregar()));
    }
  }

  function desenhar() {
    ui.limpar(conteudo);
    const consultas = Array.isArray(atual.consultas) ? atual.consultas : [];
    const bloqueios = Array.isArray(atual.bloqueios) ? atual.bloqueios : [];
    const dias = Array.from({ length: modo === "semana" ? 7 : 1 }, (_, i) => diaISO(data, i));
    const periodo = modo === "dia" ? nomeDia(data, true) : `${ui.dataCurtaBR(data)} — ${ui.dataCurtaBR(diaISO(data, 6))}`;
    const fonte = atual.config && atual.config.horario_fonte;
    const legendaFonte = fonte === "agenda" ? "Horário da agenda"
      : fonte === "departamento" ? "Horário herdado do departamento"
        : fonte === "padrao" ? "Horário padrão · seg a sex, 8h–18h" : null;
    const resumo = h("section", { class: "agenda-resumo", "aria-label": "Resumo do período" },
      h("div", { class: "agenda-resumo-data" },
        h("span", { class: "rotulo" }, modo === "dia" ? "Dia selecionado" : "Semana selecionada"),
        h("b", null, periodo), legendaFonte ? h("small", null, legendaFonte) : null),
      h("div", { class: "agenda-resumo-num" }, h("b", null, ui.num(consultas.length)), h("span", null, consultas.length === 1 ? "consulta" : "consultas")),
      h("div", { class: "agenda-resumo-num" }, h("b", null, ui.num(bloqueios.length)), h("span", null, bloqueios.length === 1 ? "bloqueio" : "bloqueios")));
    const grade = h("div", { class: ["agenda-dias", modo === "dia" && "agenda-um-dia"], "aria-label": modo === "dia" ? "Agenda do dia" : "Agenda da semana" });

    for (const iso of dias) {
      const itens = consultas.filter(c => c.inicio && ui.hojeSP(new Date(c.inicio)) === iso)
        .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
      const inicioDia = new Date(`${iso}T00:00:00-03:00`);
      const fimDia = new Date(`${diaISO(iso, 1)}T00:00:00-03:00`);
      const travas = bloqueios.filter(b => b.inicio && b.fim && new Date(b.inicio) < fimDia && new Date(b.fim) > inicioDia);
      const lista = h("div", { class: "agenda-dia-lista" });
      if (!itens.length && !travas.length) lista.appendChild(h("p", { class: "agenda-vazio" }, "Sem consultas ou bloqueios."));
      for (const b of travas) lista.appendChild(h("div", { class: "agenda-bloqueio" }, ui.icone("fechar"),
        h("span", null, h("b", null, "Horário bloqueado"), h("small", null,
          [b.motivo, ui.dataHoraBR(b.inicio), ui.dataHoraBR(b.fim)].filter(Boolean).join(" · ") || "Dia indisponível"))));
      for (const c of itens) lista.appendChild(cartaoConsulta(c));
      const cabDia = h("header", { class: "agenda-dia-cab" },
        h("span", { class: "agenda-dia-nome" }, modo === "dia" ? nomeDia(iso, true) : nomeDia(iso)),
        h("span", { class: "agenda-dia-data" }, ui.dataCurtaBR(iso)),
        h("span", { class: "agenda-dia-total", "aria-label": `${itens.length} consultas` }, ui.num(itens.length)));
      grade.appendChild(h("section", { class: "agenda-dia", "aria-label": `${nomeDia(iso, true)} ${ui.dataBR(iso)}` }, cabDia, lista));
    }
    conteudo.append(resumo, grade, h("p", { class: "agenda-fuso" }, "Horários no fuso de São Paulo."));
  }

  function cartaoConsulta(c) {
    const nome = c.nome || c.titulo || "Consulta sem nome";
    const origem = origemDo(c);
    const etapa = c.etapa || (c.marco === "agendada" ? "Agendada" : null);
    const detalhes = [c.servico, origem, etapa].filter(Boolean);
    const acoes = h("div", { class: "agenda-consulta-acoes" },
      h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => ctx.navegar(`#/crm/negocio/${encodeURIComponent(c.negocio_id)}`) } }, "Abrir negócio"),
      ctx.pode("atendente") ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => abrirAgendamento(c) } }, "Remarcar") : null,
      ctx.pode("atendente") ? h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => desmarcar(c) } }, "Desmarcar") : null);
    return h("article", { class: "agenda-consulta" },
      h("div", { class: "agenda-hora" }, h("b", null, ui.horaBR(c.inicio)), h("span", null, c.fim ? ui.horaBR(c.fim) : "")),
      h("div", { class: "agenda-consulta-info" }, h("b", { class: "agenda-nome" }, nome),
        h("span", { class: "agenda-detalhe" }, detalhes.join(" · ") || "Sem detalhes adicionais"),
        c.telefone ? h("small", null, ui.telBR(c.telefone)) : null), acoes);
  }

  async function procurarNegocios(q) {
    const crm = await ctx.carregar("crm");
    if (!crm || typeof crm.kit !== "function") throw new Error("CRM indisponível.");
    const k = await crm.kit(ctx);
    const funis = (k.base.funis || []).filter(f => f.ativo !== false);
    const mapa = new Map();
    for (const funil of funis) {
      const r = await api.rpcC("nx_negocios_kanban", {
        p_funil: funil.id, p_filtro: { busca: q, status: "aberto" }, p_por_coluna: 100,
      });
      for (const coluna of r.colunas || []) for (const item of coluna.itens || []) {
        if (item.status === "aberto" && !item.consulta_em && !mapa.has(String(item.id))) mapa.set(String(item.id), { ...item, funil_nome: funil.nome });
      }
    }
    return [...mapa.values()].slice(0, 30);
  }

  async function abrirAgendamento(preselecionado = null) {
    if (!ctx.pode("atendente")) return;
    let selecionado = preselecionado ? {
      ...preselecionado,
      id: preselecionado.id || preselecionado.negocio_id,
      titulo: preselecionado.titulo || preselecionado.nome,
    } : null;
    let horarios = [];
    const busca = ui.campo({ rotulo: "Buscar oportunidade aberta", nome: "busca", tipo: "busca", placeholder: "Nome, serviço ou telefone", ajuda: "A consulta fica vinculada ao negócio escolhido." });
    const campoBusca = busca.querySelector("input");
    const lista = h("div", { class: "agenda-resultados", role: "listbox", "aria-label": "Oportunidades encontradas" });
    const escolhido = h("p", { class: "agenda-escolhido", role: "status" });
    const btBuscar = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Buscar negócios");
    const dataEl = ui.campo({ rotulo: "A partir de", nome: "data", tipo: "data", valor: data });
    const servicoEl = ui.campo({ rotulo: "Serviço", nome: "servico", valor: selecionado && selecionado.servico || "", max: 80, placeholder: "Ex.: avaliação, limpeza" });
    const btHorarios = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Ver horários livres");
    const slots = h("div", { class: "agenda-slots", role: "status", "aria-live": "polite" });
    const formulario = h("div", { class: "agenda-form" },
      selecionado ? null : h("section", { class: "agenda-busca" }, busca, btBuscar, lista),
      escolhido, h("div", { class: "agenda-form-grade" }, dataEl, servicoEl), btHorarios, slots);

    function pintarEscolhido() {
      escolhido.textContent = selecionado
        ? `${selecionado.titulo || selecionado.nome || "Negócio"}${selecionado.funil_nome ? ` · ${selecionado.funil_nome}` : ""}`
        : "Selecione um negócio para continuar.";
      if (selecionado && servicoEl.querySelector("input")) servicoEl.querySelector("input").value = selecionado.servico || "";
    }

    const modal = ui.modal({
      titulo: selecionado ? "Remarcar consulta" : "Marcar consulta", corpo: formulario, largura: "m",
      descricao: "Escolha um horário livre. A disponibilidade é validada novamente ao salvar.",
      acoes: [
        { rotulo: "Cancelar", tipo: "neutro", valor: false },
        { rotulo: "Confirmar consulta", tipo: "primario", fn: async m => {
          if (!selecionado) { m.erro("Escolha um negócio aberto para continuar."); return false; }
          const radio = slots.querySelector('input[name="agenda-slot"]:checked');
          const slot = radio && horarios[Number(radio.value)];
          if (!slot) { m.erro("Busque e selecione um horário livre."); return false; }
          try {
            const r = erroResposta(await api.rpcC("nx_agenda_marcar", {
              p_negocio: selecionado.id, p_inicio: slot.inicio,
              p_servico: servicoEl.querySelector("input").value.trim() || null,
            }));
            return r;
          } catch (e) {
            const codigo = e && e.codigo;
            const texto = codigo === "horario_ocupado" ? "Esse horário acabou de ser ocupado. Busque os horários livres novamente."
              : codigo === "ja_agendada" ? "Este negócio já tem uma consulta futura. Atualize a agenda antes de tentar novamente."
                : api.mensagemErro(e);
            m.erro(texto);
            horarios = [];
            ui.limpar(slots);
            return false;
          }
        } },
      ],
    });

    pintarEscolhido();
    btBuscar.addEventListener("click", async () => {
      const q = campoBusca.value.trim();
      ui.limpar(lista);
      if (q.length < 2) { lista.appendChild(h("p", { class: "campo-ajuda" }, "Digite pelo menos duas letras ou quatro números.")); return; }
      lista.appendChild(h("p", { class: "campo-ajuda" }, "Buscando oportunidades…"));
      try {
        const itens = await ui.carregando(btBuscar, procurarNegocios(q));
        ui.limpar(lista);
        if (!itens.length) { lista.appendChild(h("p", { class: "campo-ajuda" }, "Nenhum negócio aberto sem consulta marcada. Crie ou atualize a oportunidade pelo CRM.")); return; }
        for (const item of itens) {
          const botao = h("button", { type: "button", class: "agenda-resultado", role: "option", "aria-selected": "false" },
            h("b", null, item.titulo || item.nome || "Negócio"),
            h("small", null, [item.contato && item.contato.nome, item.servico, item.funil_nome].filter(Boolean).join(" · ")));
          botao.addEventListener("click", () => {
            selecionado = item;
            for (const op of lista.querySelectorAll("[aria-selected]")) op.setAttribute("aria-selected", "false");
            botao.setAttribute("aria-selected", "true");
            pintarEscolhido();
            horarios = [];
            ui.limpar(slots);
          });
          lista.appendChild(botao);
        }
      } catch (e) { ui.limpar(lista); lista.appendChild(h("p", { class: "agenda-erro" }, api.mensagemErro(e))); }
    });

    btHorarios.addEventListener("click", async () => {
      ui.limpar(slots);
      if (!selecionado) { slots.appendChild(h("p", { class: "agenda-erro" }, "Escolha um negócio primeiro.")); return; }
      const dia = dataEl.querySelector("input").value || data;
      if (!dia) { slots.appendChild(h("p", { class: "agenda-erro" }, "Escolha uma data.")); return; }
      try {
        const r = await ui.carregando(btHorarios, api.rpcC("nx_agenda_livres", {
          p_a_partir: dia, p_dias: 14, p_servico: servicoEl.querySelector("input").value.trim() || null,
          p_negocio: selecionado.id,
        }));
        horarios = (r.horarios || []).filter(x => x.livre);
        if (!horarios.length) { slots.appendChild(h("p", { class: "agenda-vazio" }, "Não há horários livres nos próximos 14 dias. Tente outra data ou confira as configurações da agenda.")); return; }
        const opcoes = h("div", { class: "agenda-slots-grade", role: "radiogroup", "aria-label": "Horários livres" },
          horarios.map((slot, i) => {
            const id = `ag-slot-${Date.now()}-${i}`;
            const radio = h("input", { type: "radio", name: "agenda-slot", id, value: String(i), checked: i === 0 });
            return h("label", { class: "agenda-slot", for: id }, radio,
              h("span", null, h("b", null, ui.dataHoraBR(slot.inicio)), h("small", null, `${ui.num(slot.capacidade - slot.ocupados)} vaga${slot.capacidade - slot.ocupados === 1 ? "" : "s"}`)));
          }));
        slots.append(opcoes, h("p", { class: "campo-ajuda" }, `Duração prevista: ${ui.num(r.duracao_min)} min. O servidor confirma o horário ao salvar.`));
      } catch (e) { slots.appendChild(h("p", { class: "agenda-erro" }, api.mensagemErro(e))); }
    });

    const resultado = await modal;
    if (resultado && resultado.ok) {
      ui.toast(resultado.remarcada ? "Consulta remarcada." : "Consulta marcada.", { tipo: "ok" });
      carregar({ silencioso: true });
    }
  }

  async function desmarcar(c) {
    const motivo = ui.campo({ rotulo: "Motivo (opcional)", nome: "motivo", tipo: "textarea", max: 200, linhas: 2 });
    const r = await ui.modal({
      titulo: "Desmarcar consulta", largura: "p",
      corpo: h("div", { class: "pilha" }, h("p", null, `${c.nome || c.titulo || "Esta consulta"} · ${ui.dataHoraBR(c.inicio)}`), motivo),
      acoes: [
        { rotulo: "Voltar", tipo: "neutro", valor: false },
        { rotulo: "Desmarcar consulta", tipo: "perigo", fn: async () => erroResposta(await api.rpcC("nx_agenda_desmarcar", {
          p_negocio: c.negocio_id, p_motivo: motivo.querySelector("textarea").value.trim() || null,
        })) },
      ],
    });
    if (r && r.ok) { ui.toast("Consulta desmarcada.", { tipo: "ok" }); carregar({ silencioso: true }); }
  }

  montarCabecalho();
  await carregar();
  return () => { vivo = false; sequencia++; };
}
