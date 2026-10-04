/* ============================================================
   ÓRBITA — crm-tarefas.js · frente F4
   Atividades usadas pela gaveta do negócio e pela ficha 360:
   blocoTarefas, blocoNotas, blocoTempo, formTarefa.
   Tela T9 Tarefas (#/tarefas): montarTarefas (abas Hoje, Atrasadas,
   Próximas, Concluídas; Minhas/Todas) sobre nx_tarefas_listar.
   Plano 50 (04/10): painel do dia com contagens, lista agrupada por dia,
   check que desenha ao concluir (CSS) e linha do tempo agrupada por dia
   com ícone colorido por tipo de evento.
   ============================================================ */

const TIPOS = ["tarefa", "ligacao", "whatsapp", "reuniao", "visita", "email"];

/* Exclusões à espera dos 7 s do «Desfazer» (M25). A tarefa/nota ainda existe no servidor, então uma recarga da ficha ou da gaveta a traria de volta
   (e, depois de excluída de verdade, ela ficaria na tela como fantasma). id → Set das funções «voltar» das listas que a esconderam ao recarregar
   (o «Desfazer» devolve o item a elas); depois de excluída de verdade o id fica com null: uma resposta atrasada do servidor não a ressuscita. */
const pendentes = { tarefa: new Map(), nota: new Map() };

/** Tira de `itens` o que está em exclusão pendente. `voltar(item)` fica guardada: é como o «Desfazer» devolve o item a esta lista. */
function semPendentes(tipo, itens, voltar) {
  const m = pendentes[tipo];
  return (itens || []).filter(x => {
    if (!m.has(x.id)) return true;
    const vs = m.get(x.id);
    if (vs) vs.add(voltar);
    return false;
  });
}

/**
 * Excluir sem «tem certeza?» (M25): o item some na hora (`sumir`) e a exclusão de verdade (`firmar`) só vai ao servidor depois dos 7 s do «Desfazer».
 * Se a página sair ou ficar oculta antes disso, o aviso chama firmar({ saindo: true }) e o pedido vai com keepalive (senão o navegador o cancela junto
 * com a aba e o item «volta a existir»). `voltar` desfaz na lista de origem; as listas que recarregaram no meio recebem o item de volta também.
 */
function excluirComDesfazer(k, tipo, item, { texto, rpc, sumir, voltar }) {
  const m = pendentes[tipo];
  return k.ui.acaoComDesfazer({ texto,
    aplicar: () => { m.set(item.id, new Set()); sumir(); },
    firmar: async o => { await k.api.rpcC(rpc, { p_id: item.id }, o && o.saindo ? { keepalive: true } : {}); m.set(item.id, null); },
    reverter: () => {
      const vs = m.get(item.id);
      m.delete(item.id);
      voltar();
      for (const v of vs || []) { try { v(item); } catch (e) { console.error(e); } }
    } });
}

function hojeISO(ui) { return ui.hojeSP ? ui.hojeSP() : new Date().toISOString().slice(0, 10); }
/** Dia civil de São Paulo de um instante ("" se a data for inválida — o Intl lançaria erro). */
function diaSP(ui, iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return ui.hojeSP ? ui.hojeSP(d) : d.toISOString().slice(0, 10);
}

/** Rótulo do vencimento: "Atrasada · ontem 14:00", "Hoje 15:30", "amanhã", "05/10 09:00". */
function textoVence(k, t) {
  const { ui } = k;
  if (!t.vence_em) return { txt: "Sem prazo", cls: "" };
  const d = new Date(t.vence_em);
  const dia = ui.hojeSP ? ui.hojeSP(d) : d.toISOString().slice(0, 10);
  const hoje = hojeISO(ui);
  const hora = ui.horaBR(t.vence_em);
  if (!t.concluida_em && t.atrasada) return { txt: `Atrasada · ${ui.relativo(t.vence_em)}`, cls: "atrasada" };
  if (dia === hoje) return { txt: `Hoje ${hora}`, cls: t.concluida_em ? "" : "hoje" };
  return { txt: `${ui.dataCurtaBR ? ui.dataCurtaBR(t.vence_em) : ui.dataBR(t.vence_em)} ${hora}`, cls: "" };
}

/* ------------------------------------------------------------ formulário de tarefa */
/**
 * formTarefa(k, tarefa|null, {contato_id, negocio_id}) → Promise<tarefa salva | null>
 * Título, tipo, vencimento (data + hora, SP), responsável, descrição.
 */
export async function formTarefa(k, tarefa, { contato_id = null, negocio_id = null, titulo: tituloSug } = {}) {
  const { ui, h, L } = k;
  const t = tarefa || {};
  const amanha = new Date(Date.now() + 24 * 3600000);
  const venceLocal = t.vence_em ? L.paraDataHoraLocal(t.vence_em) : `${ui.hojeSP ? ui.hojeSP(amanha) : amanha.toISOString().slice(0, 10)}T09:00`;
  const form = h("form", { class: "crm-form", novalidate: true },
    ui.campo({ rotulo: "O que precisa ser feito", nome: "titulo", valor: t.titulo || tituloSug || "", obrigatorio: true, max: 160,
      placeholder: "Ex.: Ligar para confirmar a avaliação" }),
    h("div", { class: "crm-form-2" },
      ui.campo({ rotulo: "Tipo", nome: "tipo", tipo: "select", valor: t.tipo || "tarefa",
        opcoes: TIPOS.map(x => ({ valor: x, rotulo: L.ROTULO_TAREFA[x] })) }),
      ui.campo({ rotulo: "Vence em", nome: "vence_em", tipo: "datahora", valor: venceLocal }),
      h("div", { class: "campo inteiro" },
        h("label", null, "Responsável"),
        ui.seletorPessoa({ usuarios: k.base.usuarios, valor: t.dono ? t.dono.id : (tarefa ? null : k.eu()), rotulo: "Responsável", vazio: "Sem responsável" }))),
    ui.campo({ rotulo: "Detalhes (opcional)", nome: "descricao", tipo: "textarea", valor: t.descricao || "", max: 5000, linhas: 3 }),
    h("p", { class: "crm-status", role: "status", "aria-live": "polite", hidden: true }));
  form.querySelector(".campo.inteiro select").name = "dono_id";
  const status = form.querySelector(".crm-status");
  // M30: tarefa NOVA guarda título e detalhes enquanto a pessoa digita (volta com «Rascunho restaurado · descartar» se a tela recarregar)
  const rascunhos = tarefa ? [] : ["titulo", "descricao"].map(n => k.rascunho(form.querySelector(`[name=${n}]`), `tarefa:nova:${negocio_id ? `negocio:${negocio_id}` : contato_id ? `contato:${contato_id}` : "avulsa"}:${n}`));
  let reqAtual = null, reqConteudo = "";   // M25: uma chave por intenção; erro ambíguo repete com a MESMA chave
  return ui.modal({
    titulo: tarefa ? "Editar tarefa" : "Nova tarefa", corpo: form,
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: tarefa ? "Salvar" : "Criar tarefa", tipo: "primario", fn: async api => {
        const d = ui.lerForm(form);
        ui.marcarErro(form, null);
        if (!d.titulo) { ui.marcarErro(form, "titulo", "Escreva o que precisa ser feito."); return false; }
        const p = { titulo: d.titulo, tipo: d.tipo, vence_em: d.vence_em || null, dono_id: d.dono_id || null, descricao: d.descricao || null };
        if (tarefa) p.id = tarefa.id;
        else { if (contato_id) p.contato_id = contato_id; if (negocio_id) p.negocio_id = negocio_id; }
        try {
          if (tarefa) return await k.api.rpcC("nx_tarefa_salvar", { p_tarefa: p });
          const conteudo = JSON.stringify(p);
          if (conteudo !== reqConteudo) { reqAtual = k.novaReq(); reqConteudo = conteudo; }
          const { resultado } = await k.escrever("nx_tarefa_salvar", { p_tarefa: p }, { req: reqAtual, aoStatus: txt => { status.textContent = txt; status.hidden = false; } });
          status.hidden = true;
          for (const rc of rascunhos) rc.apagar();      // o servidor confirmou: o rascunho some
          return resultado;
        } catch (e) {
          status.hidden = true;
          api.erro(e && e.ambigua ? "Não foi possível confirmar se foi salvo. Toque em «Criar tarefa» de novo: é seguro, não duplica." : k.erro(e));
          return false;
        }
      } },
    ],
  });
}

/* ------------------------------------------------------------ lista de tarefas */
/**
 * itemTarefa → <div.tf-li>: a linha (.tf) dentro de uma moldura que mostra, ao deslizar, o que o gesto faz.
 * M28: no celular lápis + lixeira viram o ⋮ (Editar, Adiar para amanhã, Excluir) e a linha desliza — direita = concluir (ou reabrir), esquerda = adiar.
 * Gesto, botão e ⋮ chamam as MESMAS funções (`executar`); L.acoesDaTarefa diz o que existe e que lado leva a quê. Tudo com Desfazer.
 */
export function itemTarefa(k, t, { aoMudar, mostrarVinculo = false } = {}) {
  const { ui, h, L } = k;
  const pode = k.pode("atendente");
  const v = textoVence(k, t);
  const A = L.acoesDaTarefa({ pode, concluida: !!t.concluida_em });
  const ROT = { editar: ["Editar", "editar"], adiar: ["Adiar para amanhã", "relogio"], excluir: ["Excluir", "lixeira"] };
  const check = h("input", { type: "checkbox", checked: !!t.concluida_em, disabled: !pode,
    "aria-label": t.concluida_em ? `Reabrir a tarefa ${t.titulo}` : `Concluir a tarefa ${t.titulo}` });
  const mais = pode ? h("button", { type: "button", class: "bt-icone tf-mais", "aria-label": `Mais ações da tarefa ${t.titulo}`, title: "Mais ações" }, ui.icone("opcoes")) : null;
  const el = h("div", { class: ["tf", t.concluida_em && "feita"], dataset: { id: t.id } },
    h("label", { class: "tf-check" }, check, h("span", { "aria-hidden": "true" })),
    h("div", { class: "tf-corpo" },
      h("span", { class: "tf-t" }, t.titulo),
      h("div", { class: "tf-meta" },
        h("span", null, ui.icone(L.ICONE_TAREFA[t.tipo] || "tarefa"), L.ROTULO_TAREFA[t.tipo] || "Tarefa"),
        h("span", { class: v.cls }, ui.icone("relogio"), v.txt),
        t.dono ? h("span", null, ui.icone("usuario"), t.dono.nome) : null,
        mostrarVinculo && t.contato ? h("a", { href: `#/contatos/${t.contato.id}`, "aria-label": `${k.v.contato}: ${t.contato.nome || ""}` }, ui.icone("contato"), t.contato.nome || k.v.contato) : null,
        mostrarVinculo && t.negocio ? h("a", { href: `#/crm/negocio/${t.negocio.id}`, "aria-label": `${k.v.negocio}: ${t.negocio.titulo || ""}` }, ui.icone("funil"),
          t.negocio.titulo && !(t.contato && t.negocio.titulo === t.contato.nome) ? t.negocio.titulo : k.v.negocio) : null,
        t.automacao ? h("span", null, ui.icone("raio"), "Automação") : null),
      t.descricao ? h("span", { class: "fraco", style: { "font-size": "var(--fs-13)" } }, t.descricao) : null),
    pode ? h("div", { class: "tf-acoes" },
      h("button", { type: "button", class: "bt-icone", "aria-label": `Editar a tarefa ${t.titulo}`, on: { click: () => executar("editar") } }, ui.icone("editar")),
      h("button", { type: "button", class: "bt-icone", "aria-label": `Excluir a tarefa ${t.titulo}`, on: { click: () => executar("excluir") } }, ui.icone("lixeira")),
      mais) : h("span"));

  /** Concluir/reabrir: o círculo e o deslizar chamam esta. Concluiu → Desfazer reabre. */
  async function alternar(quer) {
    check.checked = quer;
    el.classList.toggle("feita", quer);
    try {
      const nova = await k.api.rpcC("nx_tarefa_concluir", { p_id: t.id, p_concluida: quer });
      ui.anunciar(quer ? "Tarefa concluída." : "Tarefa reaberta.");
      aoMudar && aoMudar({ tipo: "salva", tarefa: nova });
      if (quer) ui.acaoComDesfazer({ texto: "Tarefa concluída", reverter: async () => {
        const r = await k.api.rpcC("nx_tarefa_concluir", { p_id: t.id, p_concluida: false });
        aoMudar && aoMudar({ tipo: "salva", tarefa: r });
      } });
    } catch (e) {
      check.checked = !quer; el.classList.toggle("feita", !quer);
      k.toastErro(e);
    }
  }
  /** Adiar para amanhã (mesma hora; L.adiarParaAmanha): grava já e o Desfazer devolve o vencimento de antes. */
  async function adiar() {
    const antes = t.vence_em || null;
    const novo = L.adiarParaAmanha(antes);
    try {
      const nova = await k.api.rpcC("nx_tarefa_salvar", { p_tarefa: { id: t.id, vence_em: novo } });
      ui.anunciar("Tarefa adiada.");
      aoMudar && aoMudar({ tipo: "salva", tarefa: nova });
      ui.acaoComDesfazer({ texto: `Tarefa adiada para ${ui.dataCurtaBR(novo)}, ${ui.horaBR(novo)}`, reverter: async () => {
        const r = await k.api.rpcC("nx_tarefa_salvar", { p_tarefa: { id: t.id, vence_em: antes } });
        aoMudar && aoMudar({ tipo: "salva", tarefa: r });
      } });
    } catch (e) { k.toastErro(e); }
  }
  async function executar(id) {
    if (id === "concluir") return alternar(!check.checked);
    if (id === "adiar") return adiar();
    if (id === "editar") {
      const nova = await formTarefa(k, t);
      if (nova) { ui.toast("Tarefa salva.", { tipo: "ok", ms: 1800 }); aoMudar && aoMudar({ tipo: "salva", tarefa: nova }); }
      return;
    }
    if (id === "excluir") {
      // M25: sem «tem certeza?». A tarefa some na hora e a exclusão de verdade (firmar) só vai ao servidor depois dos 7 s do «Desfazer»
      excluirComDesfazer(k, "tarefa", t, { texto: `Tarefa «${t.titulo}» excluída`, rpc: "nx_tarefa_excluir",
        sumir: () => { aoMudar && aoMudar({ tipo: "excluida", tarefa: t }); },
        voltar: () => { aoMudar && aoMudar({ tipo: "salva", tarefa: t }); } });
    }
  }
  check.addEventListener("change", () => alternar(check.checked));
  if (mais) mais.addEventListener("click", () => ui.menu(mais, A.menu.map(id => ({ rotulo: ROT[id][0], icone: ROT[id][1], perigo: id === "excluir", fn: () => executar(id) }))));

  const fundo = (lado, icone, texto) => h("div", { class: `tf-fundo tf-fundo-${lado}`, "aria-hidden": "true" }, ui.icone(icone), h("span", null, texto));
  const li = h("div", { class: "tf-li" },
    A.direita ? fundo("d", t.concluida_em ? "reabrir" : "check", t.concluida_em ? "Reabrir" : "Concluir") : null,
    A.esquerda ? fundo("e", "relogio", "Adiar") : null,
    el);
  if (A.direita || A.esquerda) ui.deslizar(el, { direita: A.direita ? () => executar(A.direita) : undefined, esquerda: A.esquerda ? () => executar(A.esquerda) : undefined });
  return li;
}

/**
 * blocoTarefas(k, {tarefas, contato_id, negocio_id, aoMudar, titulo, vazio}) → Node
 * Abertas primeiro (por vencimento), concluídas depois; "+ Tarefa".
 */
export function blocoTarefas(k, { tarefas = [], contato_id = null, negocio_id = null, aoMudar, titulo = "Tarefas", vazio = "Nenhuma tarefa por aqui." } = {}) {
  const { ui, h } = k;
  // tarefa em exclusão pendente não reaparece quando a ficha recarrega; o «Desfazer» a devolve por `voltou`
  const voltou = t => mudou({ tipo: "salva", tarefa: t });
  let lista = semPendentes("tarefa", tarefas, voltou);
  const corpo = h("div", { class: "at-lista" });
  const cont = h("span", { class: "abas-n" });
  function desenhar() {
    ui.limpar(corpo);
    const abertas = lista.filter(t => !t.concluida_em).sort((a, b) => (a.vence_em ? Date.parse(a.vence_em) : Infinity) - (b.vence_em ? Date.parse(b.vence_em) : Infinity));
    const feitas = lista.filter(t => t.concluida_em);
    cont.textContent = abertas.length ? String(abertas.length) : "";
    if (!lista.length) corpo.appendChild(h("p", { class: "fraco", style: { "font-size": "var(--fs-14)" } }, vazio));
    for (const t of [...abertas, ...feitas]) corpo.appendChild(itemTarefa(k, t, { aoMudar: mudou }));
  }
  function mudou(ev) {
    if (ev.tipo === "excluida") lista = lista.filter(x => x.id !== ev.tarefa.id);
    else if (ev.tarefa) { const i = lista.findIndex(x => x.id === ev.tarefa.id); if (i >= 0) lista[i] = ev.tarefa; else lista.unshift(ev.tarefa); }
    desenhar();
    aoMudar && aoMudar(lista);
  }
  const novo = k.pode("atendente") ? h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: async () => {
    const t = await formTarefa(k, null, { contato_id, negocio_id });
    if (t) { ui.toast("Tarefa criada.", { tipo: "ok", ms: 2200 }); mudou({ tipo: "salva", tarefa: t }); }
  } } }, ui.icone("mais"), "Tarefa") : null;
  desenhar();
  const el = h("section", { class: "ng-bloco", "aria-label": titulo },
    h("div", { class: "ng-bloco-cab" }, h("h3", null, titulo, " ", cont), novo), corpo);
  el.atualizar = novas => { lista = semPendentes("tarefa", novas, voltou); desenhar(); };
  el.lista = () => lista.slice();
  return el;
}

/* ------------------------------------------------------------ notas */
function itemNota(k, n, { aoMudar }) {
  const { ui, h } = k;
  const pode = n.pode_editar && k.pode("atendente");
  const texto = h("p", null, n.texto);
  const el = h("article", { class: ["nota", n.fixada && "fixada"], dataset: { id: n.id } },
    texto,
    h("div", { class: "nota-meta" },
      n.fixada ? h("span", { class: "pilula pilula-aten" }, "Fixada") : null,
      h("span", { class: "cresce" }, `${n.autor ? n.autor.nome : "Sistema"} · ${ui.dataHoraBR(n.criado_em)}${n.editado_em ? " · editada" : ""}`),
      pode ? h("button", { type: "button", class: "bt-icone", "aria-pressed": String(!!n.fixada),
        "aria-label": n.fixada ? "Desafixar nota" : "Fixar nota no topo", title: n.fixada ? "Desafixar" : "Fixar no topo",
        on: { click: async () => {
          try { const r = await k.api.rpcC("nx_nota_salvar", { p_nota: { id: n.id, fixada: !n.fixada } }); aoMudar({ tipo: "salva", nota: r }); }
          catch (e) { k.toastErro(e); }
        } } }, ui.icone("check")) : null,
      pode ? h("button", { type: "button", class: "bt-icone", "aria-label": "Editar nota", on: { click: async () => {
        const campoTxt = ui.campo({ rotulo: "Nota", nome: "texto", tipo: "textarea", valor: n.texto, max: 5000, linhas: 5 });
        const r = await ui.modal({ titulo: "Editar nota", corpo: campoTxt, acoes: [
          { rotulo: "Cancelar", tipo: "neutro", valor: null },
          { rotulo: "Salvar", tipo: "primario", fn: async api => {
            const t = campoTxt.querySelector("textarea").value.trim();
            if (!t) { api.erro("Escreva a nota."); return false; }
            try { return await k.api.rpcC("nx_nota_salvar", { p_nota: { id: n.id, texto: t } }); } catch (e) { api.erro(k.erro(e)); return false; }
          } }] });
        if (r) aoMudar({ tipo: "salva", nota: r });
      } } }, ui.icone("editar")) : null,
      pode ? h("button", { type: "button", class: "bt-icone", "aria-label": "Excluir nota", on: { click: () => {
        // M25: some na hora; a exclusão de verdade (firmar) só depois dos 7 s do «Desfazer»
        excluirComDesfazer(k, "nota", n, { texto: "Nota excluída", rpc: "nx_nota_excluir",
          sumir: () => { aoMudar({ tipo: "excluida", nota: n }); },
          voltar: () => { aoMudar({ tipo: "salva", nota: n }); } });
      } } }, ui.icone("lixeira")) : null));
  return el;
}

/** blocoNotas(k, {notas, contato_id, negocio_id, aoMudar}) → Node — nova nota no topo, fixadas primeiro. */
export function blocoNotas(k, { notas = [], contato_id = null, negocio_id = null, aoMudar } = {}) {
  const { ui, h } = k;
  // nota em exclusão pendente não reaparece quando a ficha recarrega; o «Desfazer» a devolve por `voltou`
  const voltou = n => mudou({ tipo: "salva", nota: n });
  let lista = semPendentes("nota", notas, voltou);
  const corpo = h("div", { class: "at-lista" });
  const cont = h("span", { class: "abas-n" });
  function desenhar() {
    ui.limpar(corpo);
    lista.sort((a, b) => (b.fixada - a.fixada) || (Date.parse(b.criado_em) - Date.parse(a.criado_em)));
    cont.textContent = lista.length ? String(lista.length) : "";
    if (!lista.length) corpo.appendChild(h("p", { class: "fraco", style: { "font-size": "var(--fs-14)" } }, "Nenhuma nota ainda. Anote combinados, preferências e objeções — a equipe toda vê."));
    for (const n of lista) corpo.appendChild(itemNota(k, n, { aoMudar: mudou }));
  }
  function mudou(ev) {
    if (ev.tipo === "excluida") lista = lista.filter(x => x.id !== ev.nota.id);
    else if (ev.nota) { const i = lista.findIndex(x => x.id === ev.nota.id); if (i >= 0) lista[i] = ev.nota; else lista.unshift(ev.nota); }
    desenhar();
    aoMudar && aoMudar(lista);
  }
  let nova = null, rascunhoNota = null;
  if (k.pode("atendente")) {
    const ta = h("textarea", { "aria-label": "Nova nota", placeholder: "Escreva uma nota… (Ctrl+Enter salva)", maxlength: 5000, rows: 3 });
    const bt = h("button", { type: "button", class: "bt bt-prim bt-p" }, ui.icone("nota"), "Salvar nota");
    const salvar = async () => {
      const t = ta.value.trim();
      if (!t) { ta.focus(); return; }
      try {
        const n = await ui.carregando(bt, k.api.rpcC("nx_nota_salvar", { p_nota: { texto: t, ...(negocio_id ? { negocio_id } : {}), ...(contato_id ? { contato_id } : {}) } }));
        ta.value = "";
        if (rascunhoNota) rascunhoNota.apagar();      // o servidor confirmou
        mudou({ tipo: "salva", nota: n });
        ui.anunciar("Nota salva.");
      } catch (e) { k.toastErro(e); }
    };
    bt.addEventListener("click", salvar);
    ta.addEventListener("keydown", ev => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); salvar(); } });
    nova = h("div", { class: "nota-nova" }, ta, h("div", { class: "linha linha-fim" }, bt));
    rascunhoNota = k.rascunho(ta, negocio_id ? `negocio:${negocio_id}:nota` : contato_id ? `contato:${contato_id}:nota` : "nota");   // M30: a nota digitada sobrevive a recarga/queda de sessão
  }
  desenhar();
  const el = h("section", { class: "ng-bloco", "aria-label": "Notas" },
    h("div", { class: "ng-bloco-cab" }, h("h3", null, "Notas ", cont)), nova, corpo);
  el.atualizar = novas => { lista = semPendentes("nota", novas, voltou); desenhar(); };
  return el;
}

/* ------------------------------------------------------------ linha do tempo */
/** Família do evento para o ícone colorido (plano 50, item 26): ganho, perdido, nota, tarefa, estagio, conversa, automacao ou "". */
export function familiaTempo(it) {
  if (!it) return "";
  if (it.fonte === "nota") return "nota";
  if (it.fonte === "tarefa") return "tarefa";
  if (it.tipo === "ganho" || it.tipo === "perdido") return it.tipo;
  if (it.tipo === "estagio" || it.tipo === "reaberto" || it.tipo === "negocio_criado") return "estagio";
  if (/^conversa_|^atribuida$/.test(String(it.tipo || ""))) return "conversa";
  if (it.tipo === "automacao") return "automacao";
  return "";
}

/** blocoTempo(k, itens, {titulo}) → Node — agrupada por dia («Hoje», «Ontem», «Seg, 29/09»), ícone colorido por tipo de evento, hora de cada item. */
export function blocoTempo(k, itens = [], { titulo = "Linha do tempo" } = {}) {
  const { ui, h, L } = k;
  const nomes = k.nomes();
  const motivos = k.motivosPorId();
  const corpo = h("div", { class: "tempo-dias" });
  if (!itens.length) corpo.appendChild(h("p", { class: "fraco", style: { "font-size": "var(--fs-14)" } }, "Ainda não há registros."));
  const grupos = L.agruparPorDia(itens, { instanteDe: it => it.em, diaDe: iso => diaSP(ui, iso), hoje: hojeISO(ui), ordem: "desc" });
  for (const g of grupos) {
    const ol = h("ol", { class: "tempo" });
    for (const it of g.itens) {
      const cls = familiaTempo(it);
      const txt = L.textoTempo(it, { nomes, vocab: k.v, brl: v => ui.brl(v), motivos });
      const link = it.conversa_id ? h("a", { href: `#/conversas/${it.conversa_id}` }, " Abrir conversa") : null;
      ol.appendChild(h("li", { class: ["tempo-it", cls] },
        h("span", { class: "tempo-ic", "aria-hidden": "true" }, ui.icone(L.iconeTempo(it))),
        h("div", { class: "tempo-txt" }, txt, link,
          h("small", null, h("time", { datetime: it.em || null, title: ui.dataHoraBR(it.em) }, g.dia ? ui.horaBR(it.em) : ui.dataHoraBR(it.em)), `${it.autor ? ` · ${it.autor.nome}` : " · sistema"}`))));
    }
    corpo.appendChild(h("section", { class: "tempo-dia", "aria-label": g.rotulo },
      h("h4", { class: "tempo-dia-t" }, h("span", null, g.rotulo), h("span", { class: "tempo-dia-n dado" }, String(g.itens.length))), ol));
  }
  return h("section", { class: "ng-bloco", "aria-label": titulo }, h("div", { class: "ng-bloco-cab" }, h("h3", null, titulo)), corpo);
}

/* ============================================================ T9 — Tarefas (#/tarefas) */
const ABAS_T9 = [
  { id: "hoje", rotulo: "Hoje" }, { id: "atrasadas", rotulo: "Atrasadas" },
  { id: "proximas", rotulo: "Próximas" }, { id: "concluidas", rotulo: "Concluídas" },
];
const VAZIO_T9 = {
  hoje: "Nada para hoje.", atrasadas: "Nenhuma tarefa atrasada. Tudo em dia.",
  proximas: "Nenhuma tarefa marcada para os próximos dias.", concluidas: "Nenhuma tarefa concluída ainda.",
};

export async function montarTarefas(k, el, rota) {
  const { ui, h, ctx, L } = k;
  ctx.titulo("Tarefas");
  const lerLocal = (c, p) => { try { return localStorage.getItem(c) || p; } catch { return p; } };
  const gravar = (c, v) => { try { localStorage.setItem(c, v); } catch { /* ok */ } };
  let aba = ABAS_T9.some(a => a.id === rota.query.aba) ? rota.query.aba : lerLocal("nx-app-tarefas-aba", "hoje");
  const podeTodas = k.pode("supervisor");
  let dono = podeTodas ? lerLocal("nx-app-tarefas-dono", "eu") : "eu";
  let seq = 0;

  const abasEl = ui.segmentado({ opcoes: ABAS_T9.map(a => ({ valor: a.id, rotulo: a.rotulo })), valor: aba, rotulo: "Situação das tarefas",
    aoMudar: id => { aba = id; gravar("nx-app-tarefas-aba", id); carregar(); } });
  const seg = ui.segmentado({ opcoes: [{ valor: "eu", rotulo: "Minhas" }, { valor: "todos", rotulo: "Todas" }], valor: dono, tipo: "filtro", rotulo: "De quem",
    aoMudar: x => { dono = x; gravar("nx-app-tarefas-dono", x); carregar(); } });
  seg.hidden = !podeTodas;
  const corpo = h("div", { class: "pilha" });
  const novaTarefa = async () => {
    const t = await formTarefa(k, null, {});
    if (t) { ui.toast("Tarefa criada.", { tipo: "ok", ms: 2200 }); carregar(true); }
  };
  // plano 50 (item 28): painel do dia — Hoje / Atrasadas / Próximas com contagem e cor; tocar leva à aba
  const painelNums = { hoje: h("b", { class: "dado" }, "—"), atrasadas: h("b", { class: "dado" }, "—"), proximas: h("b", { class: "dado" }, "—") };
  const painelItem = (id, rotulo) => h("button", { type: "button", class: ["tfp-pn", `tfp-pn-${id}`], "aria-pressed": String(aba === id), dataset: { aba: id },
    on: { click: () => { if (aba === id) return; aba = id; gravar("nx-app-tarefas-aba", id); if (typeof abasEl.ativar === "function") abasEl.ativar(id); carregar(); } } },
    painelNums[id], h("span", null, rotulo));
  const painel = h("div", { class: "tfp-painel", role: "group", "aria-label": "Resumo das tarefas" },
    painelItem("hoje", "para hoje"), painelItem("atrasadas", "atrasadas"), painelItem("proximas", "nos próximos dias"));
  function desenharPainel(c) {
    for (const id of ["hoje", "atrasadas", "proximas"]) {
      const n = Number(c[id]) || 0;
      painelNums[id].textContent = String(n);
      const bt = painelNums[id].parentElement;
      if (bt) { bt.setAttribute("aria-pressed", String(aba === id)); bt.classList.toggle("zero", n === 0); bt.classList.toggle("alerta", id === "atrasadas" && n > 0); }
    }
  }
  el.append(
    ui.cabecalho({ titulo: "Tarefas", acoes: k.pode("atendente") ? h("button", { type: "button", class: "bt bt-prim", on: { click: novaTarefa } }, ui.icone("mais"), "Tarefa") : null }),
    painel,
    h("div", { class: "tfp-fita" }, abasEl, seg),
    corpo);
  // M28: no celular «+ Tarefa» sai do cabeçalho e vira o botão flutuante
  if (k.pode("atendente")) el.appendChild(h("button", { type: "button", class: "crm-fab", "aria-label": "Nova tarefa", title: "Nova tarefa", on: { click: novaTarefa } },
    ui.icone("mais"), h("span", { class: "crm-fab-txt" }, "Nova tarefa")));
  const ocultas = new Set();   // excluídas esperando os 7 s do Desfazer: uma recarga no meio não pode trazê-las de volta

  /** quieto = refaz a lista sem trocar tudo pelo esqueleto (depois de concluir/adiar/desfazer a tela não pisca) */
  async function carregar(quieto = false) {
    const minha = ++seq;
    if (quieto && corpo.firstChild) corpo.setAttribute("aria-busy", "true");
    else { ui.limpar(corpo); corpo.appendChild(ui.esqueleto("lista", 5)); }
    try {
      const r = await k.api.rpcC("nx_tarefas_listar", { p_filtro: { dono, situacao: aba } });
      if (minha !== seq) return;
      // as contagens vêm em r.contagens (banco) ou soltas no topo da resposta (servidor fictício): o painel e as abas leem as duas formas
      const c = r.contagens || r || {};
      abasEl.contar("hoje", c.hoje || null); abasEl.contar("atrasadas", c.atrasadas || null); abasEl.contar("proximas", c.proximas || null);
      desenharPainel(c);
      corpo.removeAttribute("aria-busy");
      ui.limpar(corpo);
      const itens = r.itens.filter(t => !ocultas.has(t.id));
      if (!itens.length) { corpo.appendChild(ui.vazio({ titulo: VAZIO_T9[aba], icone: "tarefa" })); return; }
      // agrupadas por dia de vencimento («Hoje», «Amanhã», «Qui, 09/10»…; concluídas do mais recente para o mais antigo)
      const hoje = hojeISO(ui);
      const grupos = L.agruparPorDia(itens, { instanteDe: t => t.vence_em, diaDe: iso => diaSP(ui, iso), hoje, ordem: aba === "concluidas" ? "desc" : "asc" });
      const lista = h("div", { class: "at-lista tfp-lista" });
      let restantes = itens.length;
      for (const g of grupos) {
        const grupo = h("section", { class: ["tfp-grupo", g.dia && g.dia < hoje && aba !== "concluidas" && "passado"], "aria-label": g.rotulo },
          h("h3", { class: "tfp-grupo-t" }, h("span", null, g.rotulo), h("span", { class: "tfp-grupo-n dado" }, String(g.itens.length))));
        for (const t of g.itens) {
          const item = itemTarefa(k, t, { mostrarVinculo: true, aoMudar: ev => {
            if (ev && ev.tipo === "excluida") {
              ocultas.add(t.id); item.remove(); restantes--;
              if (!grupo.querySelector(".tf-li")) grupo.remove();
              if (restantes <= 0) { ui.limpar(corpo); corpo.appendChild(ui.vazio({ titulo: VAZIO_T9[aba], icone: "tarefa" })); }
            } else { if (ev && ev.tarefa) ocultas.delete(ev.tarefa.id); carregar(true); }
          } });
          grupo.appendChild(item);
        }
        lista.appendChild(grupo);
      }
      corpo.appendChild(lista);
      // o servidor devolve no máximo 200: sem isso a lista parecia completa
      if (r.tem_mais) corpo.appendChild(h("p", { class: "sub" }, `Mostrando as ${r.itens.length} primeiras. Conclua algumas${podeTodas && dono === "todos" ? " ou veja só as suas" : ""} para ver as outras.`));
    } catch (e) {
      if (minha !== seq) return;
      corpo.removeAttribute("aria-busy");
      ui.limpar(corpo);
      corpo.appendChild(ui.erroCartao(e, () => carregar()));
    }
  }
  await carregar();
  const cancelar = ctx.pulso ? ctx.pulso.assinar(() => { /* tarefas de automação chegam sem pulso próprio; recarrega ao voltar */ }) : null;
  return { desmontar() { seq++; if (cancelar) cancelar(); } };
}
