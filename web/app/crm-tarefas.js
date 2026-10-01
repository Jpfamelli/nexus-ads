/* ============================================================
   ÓRBITA — crm-tarefas.js · frente F4
   Atividades usadas pela gaveta do negócio e pela ficha 360:
   blocoTarefas, blocoNotas, blocoTempo, formTarefa.
   Tela T9 Tarefas (#/tarefas): montarTarefas (abas Hoje, Atrasadas,
   Próximas, Concluídas; Minhas/Todas) sobre nx_tarefas_listar.
   ============================================================ */

const TIPOS = ["tarefa", "ligacao", "whatsapp", "reuniao", "visita", "email"];

function hojeISO(ui) { return ui.hojeSP ? ui.hojeSP() : new Date().toISOString().slice(0, 10); }

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
function itemTarefa(k, t, { aoMudar, mostrarVinculo = false } = {}) {
  const { ui, h, L } = k;
  const pode = k.pode("atendente");
  const v = textoVence(k, t);
  const check = h("input", { type: "checkbox", checked: !!t.concluida_em, disabled: !pode,
    "aria-label": t.concluida_em ? `Reabrir a tarefa ${t.titulo}` : `Concluir a tarefa ${t.titulo}` });
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
      h("button", { type: "button", class: "bt-icone", "aria-label": `Editar a tarefa ${t.titulo}`, on: { click: async () => {
        const nova = await formTarefa(k, t);
        if (nova) { ui.toast("Tarefa salva.", { tipo: "ok", ms: 1800 }); aoMudar && aoMudar({ tipo: "salva", tarefa: nova }); }
      } } }, ui.icone("editar")),
      h("button", { type: "button", class: "bt-icone", "aria-label": `Excluir a tarefa ${t.titulo}`, on: { click: () => {
        // M25: sem «tem certeza?». A tarefa some na hora e a exclusão de verdade só vai ao servidor depois dos 7 s do «Desfazer»
        aoMudar && aoMudar({ tipo: "excluida", tarefa: t });
        ui.acaoComDesfazer({ texto: `Tarefa «${t.titulo}» excluída`, reverter: () => { aoMudar && aoMudar({ tipo: "salva", tarefa: t }); } }).then(async res => {
          if (res.estado !== "mantida") return;
          try { await k.api.rpcC("nx_tarefa_excluir", { p_id: t.id }); }
          catch (e) { k.toastErro(e); aoMudar && aoMudar({ tipo: "salva", tarefa: t }); }
        });
      } } }, ui.icone("lixeira"))) : h("span"));
  check.addEventListener("change", async () => {
    const quer = check.checked;
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
  });
  return el;
}

/**
 * blocoTarefas(k, {tarefas, contato_id, negocio_id, aoMudar, titulo, vazio}) → Node
 * Abertas primeiro (por vencimento), concluídas depois; "+ Tarefa".
 */
export function blocoTarefas(k, { tarefas = [], contato_id = null, negocio_id = null, aoMudar, titulo = "Tarefas", vazio = "Nenhuma tarefa por aqui." } = {}) {
  const { ui, h } = k;
  let lista = tarefas.slice();
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
  el.atualizar = novas => { lista = (novas || []).slice(); desenhar(); };
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
        // M25: some na hora; a exclusão de verdade só depois dos 7 s do «Desfazer»
        aoMudar({ tipo: "excluida", nota: n });
        ui.acaoComDesfazer({ texto: "Nota excluída", reverter: () => { aoMudar({ tipo: "salva", nota: n }); } }).then(async res => {
          if (res.estado !== "mantida") return;
          try { await k.api.rpcC("nx_nota_excluir", { p_id: n.id }); }
          catch (e) { k.toastErro(e); aoMudar({ tipo: "salva", nota: n }); }
        });
      } } }, ui.icone("lixeira")) : null));
  return el;
}

/** blocoNotas(k, {notas, contato_id, negocio_id, aoMudar}) → Node — nova nota no topo, fixadas primeiro. */
export function blocoNotas(k, { notas = [], contato_id = null, negocio_id = null, aoMudar } = {}) {
  const { ui, h } = k;
  let lista = notas.slice();
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
  let nova = null;
  if (k.pode("atendente")) {
    const ta = h("textarea", { "aria-label": "Nova nota", placeholder: "Escreva uma nota… (Ctrl+Enter salva)", maxlength: 5000, rows: 3 });
    const bt = h("button", { type: "button", class: "bt bt-prim bt-p" }, ui.icone("nota"), "Salvar nota");
    const salvar = async () => {
      const t = ta.value.trim();
      if (!t) { ta.focus(); return; }
      try {
        const n = await ui.carregando(bt, k.api.rpcC("nx_nota_salvar", { p_nota: { texto: t, ...(negocio_id ? { negocio_id } : {}), ...(contato_id ? { contato_id } : {}) } }));
        ta.value = "";
        mudou({ tipo: "salva", nota: n });
        ui.anunciar("Nota salva.");
      } catch (e) { k.toastErro(e); }
    };
    bt.addEventListener("click", salvar);
    ta.addEventListener("keydown", ev => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); salvar(); } });
    nova = h("div", { class: "nota-nova" }, ta, h("div", { class: "linha linha-fim" }, bt));
  }
  desenhar();
  const el = h("section", { class: "ng-bloco", "aria-label": "Notas" },
    h("div", { class: "ng-bloco-cab" }, h("h3", null, "Notas ", cont)), nova, corpo);
  el.atualizar = novas => { lista = (novas || []).slice(); desenhar(); };
  return el;
}

/* ------------------------------------------------------------ linha do tempo */
/** blocoTempo(k, itens, {titulo}) → Node */
export function blocoTempo(k, itens = [], { titulo = "Linha do tempo" } = {}) {
  const { ui, h, L } = k;
  const nomes = k.nomes();
  const motivos = k.motivosPorId();
  const corpo = h("ol", { class: "tempo" });
  if (!itens.length) corpo.appendChild(h("li", { class: "fraco", style: { "font-size": "var(--fs-14)", "list-style": "none" } }, "Ainda não há registros."));
  for (const it of itens) {
    const cls = it.fonte === "nota" ? "nota" : it.tipo === "ganho" ? "ganho" : it.tipo === "perdido" ? "perdido" : "";
    const txt = L.textoTempo(it, { nomes, vocab: k.v, brl: v => ui.brl(v), motivos });
    const link = it.conversa_id ? h("a", { href: `#/conversas/${it.conversa_id}` }, " Abrir conversa") : null;
    corpo.appendChild(h("li", { class: ["tempo-it", cls] },
      h("span", { class: "tempo-ic", "aria-hidden": "true" }, ui.icone(L.iconeTempo(it))),
      h("div", { class: "tempo-txt" }, txt, link,
        h("small", null, `${ui.dataHoraBR(it.em)}${it.autor ? ` · ${it.autor.nome}` : " · sistema"}`))));
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
  const { ui, h, ctx } = k;
  ctx.titulo("Tarefas");
  const lerLocal = (c, p) => { try { return localStorage.getItem(c) || p; } catch { return p; } };
  const gravar = (c, v) => { try { localStorage.setItem(c, v); } catch { /* ok */ } };
  let aba = ABAS_T9.some(a => a.id === rota.query.aba) ? rota.query.aba : lerLocal("nx-app-tarefas-aba", "hoje");
  const podeTodas = k.pode("supervisor");
  let dono = podeTodas ? lerLocal("nx-app-tarefas-dono", "eu") : "eu";
  let seq = 0;

  const abasEl = ui.abas({ itens: ABAS_T9, ativo: aba, rotulo: "Situação das tarefas", aoMudar: id => { aba = id; gravar("nx-app-tarefas-aba", id); carregar(); } });
  const seg = h("div", { class: "crm-seg", role: "group", "aria-label": "De quem" },
    ...["eu", "todos"].map(x => h("button", { type: "button", "aria-pressed": String(dono === x), dataset: { v: x },
      on: { click: ev => { dono = x; gravar("nx-app-tarefas-dono", x); for (const b of seg.children) b.setAttribute("aria-pressed", String(b.dataset.v === x)); carregar(); } } },
      x === "eu" ? "Minhas" : "Todas")));
  seg.hidden = !podeTodas;
  const corpo = h("div", { class: "pilha" });
  el.append(
    h("header", { class: "crm-cab" },
      h("div", null, h("p", { class: "rotulo" }, ctx.cliente.nome), h("h1", { class: "titulo-pag" }, "Tarefas")),
      h("div", { class: "crm-cab-acoes" },
        k.pode("atendente") ? h("button", { type: "button", class: "bt bt-prim", on: { click: async () => {
          const t = await formTarefa(k, null, {});
          if (t) { ui.toast("Tarefa criada.", { tipo: "ok", ms: 2200 }); carregar(); }
        } } }, ui.icone("mais"), "Tarefa") : null)),
    h("div", { class: "tfp-fita" }, abasEl.el, seg),
    corpo);

  async function carregar() {
    const minha = ++seq;
    ui.limpar(corpo);
    corpo.appendChild(ui.esqueleto("lista", 5));
    try {
      const r = await k.api.rpcC("nx_tarefas_listar", { p_filtro: { dono, situacao: aba } });
      if (minha !== seq) return;
      const c = r.contagens || {};
      abasEl.contar("hoje", c.hoje || null); abasEl.contar("atrasadas", c.atrasadas || null); abasEl.contar("proximas", c.proximas || null);
      ui.limpar(corpo);
      if (!r.itens.length) { corpo.appendChild(ui.vazio({ titulo: VAZIO_T9[aba], icone: "tarefa" })); return; }
      const lista = h("div", { class: "at-lista" });
      for (const t of r.itens) {
        const item = itemTarefa(k, t, { mostrarVinculo: true, aoMudar: ev => { if (ev && ev.tipo === "excluida") item.remove(); else carregar(); } });
        lista.appendChild(item);
      }
      corpo.appendChild(lista);
      // o servidor devolve no máximo 200: sem isso a lista parecia completa
      if (r.tem_mais) corpo.appendChild(h("p", { class: "sub" }, `Mostrando as ${r.itens.length} primeiras. Conclua algumas${podeTodas && dono === "todos" ? " ou veja só as suas" : ""} para ver as outras.`));
    } catch (e) {
      if (minha !== seq) return;
      ui.limpar(corpo);
      corpo.appendChild(ui.erroCartao(e, carregar));
    }
  }
  await carregar();
  const cancelar = ctx.pulso ? ctx.pulso.assinar(() => { /* tarefas de automação chegam sem pulso próprio; recarrega ao voltar */ }) : null;
  return { desmontar() { seq++; if (cancelar) cancelar(); } };
}
