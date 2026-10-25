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

/** plano 1000b · RB-121: a plataforma do aparelho (Mac/iPhone mostram ⌘). */
function plataformaAparelho() {
  try { return (typeof navigator !== "undefined" && navigator && ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform)) || ""; } catch { return ""; }
}
function hojeISO(ui) { return ui.hojeSP ? ui.hojeSP() : new Date().toISOString().slice(0, 10); }
/** Dia civil de São Paulo de um instante ("" se a data for inválida — o Intl lançaria erro). */
function diaSP(ui, iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return ui.hojeSP ? ui.hojeSP(d) : d.toISOString().slice(0, 10);
}

/** Rótulo do vencimento: "Atrasada · ontem 14:00", "Hoje 15:30", "amanhã", "05/10 09:00". */
/** plano 1000b · RB-238: o texto do vencimento (textoVence) dito por extenso para o rótulo do círculo de concluir. */
function prazoParaLeitor(v) {
  const txt = String((v && v.txt) || "");
  if (!txt || txt === "Sem prazo") return "sem prazo";
  if (v.cls === "atrasada") return txt.replace(/^Atrasada · /, "atrasada, ");
  const m = /^(Hoje|Amanhã|Ontem|\d{2}\/\d{2}(?:\/\d{4})?) (\d{2}:\d{2})$/.exec(txt);
  if (m) return /^(Hoje|Amanhã|Ontem)$/.test(m[1]) ? `${m[1] === "Ontem" ? "venceu" : "vence"} ${m[1].toLowerCase()} às ${m[2]}` : `vence em ${m[1]} às ${m[2]}`;
  return txt.charAt(0).toLowerCase() + txt.slice(1);
}
function textoVence(k, t) {
  const { ui } = k;
  // plano 1000 (CR-247): concluída diz QUANDO foi feita («feita hoje às 14:10», «feita 09/10 às 14:10») — o prazo já não importa
  if (t.concluida_em && !Number.isNaN(Date.parse(t.concluida_em))) {
    const dC = diaSP(ui, t.concluida_em), hC = ui.horaBR(t.concluida_em);
    return { txt: dC === hojeISO(ui) ? `feita hoje às ${hC}` : `feita ${ui.dataCurtaBR ? ui.dataCurtaBR(t.concluida_em) : ui.dataBR(t.concluida_em)} às ${hC}`, cls: "feita" };
  }
  if (!t.vence_em) return { txt: "Sem prazo", cls: "" };
  const d = new Date(t.vence_em);
  const dia = ui.hojeSP ? ui.hojeSP(d) : d.toISOString().slice(0, 10);
  const hoje = hojeISO(ui);
  const hora = ui.horaBR(t.vence_em);
  // plano 1000b · RB-117: venceu com a tela aberta também é atrasada (antes dependia só do t.atrasada da última leitura do servidor)
  if (k.L.tarefaAtrasada(t)) return { txt: `Atrasada · ${ui.relativo(t.vence_em)}`, cls: "atrasada" };
  if (dia === hoje) return { txt: `Hoje ${hora}`, cls: t.concluida_em ? "" : "hoje" };
  // plano 1000b · RB-116: «Amanhã 09:00» / «Ontem 14:00» (o comentário prometia; antes saía «15/10 09:00»)
  const rot = k.L && k.L.rotuloDia ? k.L.rotuloDia(dia, hoje) : "";
  if (rot === "Amanhã" || rot === "Ontem") return { txt: `${rot} ${hora}`, cls: "" };
  return { txt: `${ui.dataCurtaBR ? ui.dataCurtaBR(t.vence_em) : ui.dataBR(t.vence_em)} ${hora}`, cls: "" };
}

/* ------------------------------------------------------------ formulário de tarefa */
/**
 * formTarefa(k, tarefa|null, {contato_id, negocio_id}) → Promise<tarefa salva | null>
 * Título, tipo, vencimento (data + hora, SP), responsável, descrição.
 */
export async function formTarefa(k, tarefa, { contato_id = null, negocio_id = null, titulo: tituloSug, dono_id: donoSug = null } = {}) {
  const { ui, h, L } = k;
  const t = tarefa || {};
  const amanha = new Date(Date.now() + 24 * 3600000);
  const venceLocal = t.vence_em ? L.paraDataHoraLocal(t.vence_em) : `${ui.hojeSP ? ui.hojeSP(amanha) : amanha.toISOString().slice(0, 10)}T09:00`;
  // plano 1000 (CR-144): atalhos de prazo (fuso de São Paulo) que preenchem o campo; (CR-052) prazo no passado avisa sem bloquear
  const avisoPrazo = h("small", { class: "ed-aviso", role: "status", hidden: true });
  const campoPrazo = () => form.querySelector("[name=vence_em]");
  const pintarPrazo = () => { const c = campoPrazo(); const passou = !!c && L.dataPassou(c.value); avisoPrazo.hidden = !passou; avisoPrazo.textContent = passou ? `${L.TEXTO_DATA_PASSOU} A tarefa já nasce atrasada.` : ""; };
  const hojeSPIso = ui.hojeSP ? ui.hojeSP() : new Date().toISOString().slice(0, 10);
  const atalhosPrazo = h("div", { class: "tf-atalhos", role: "group", "aria-label": "Atalhos de prazo" }, L.atalhosPrazo(hojeSPIso, { agora: Date.now() }).map(a =>      // plano 1500c · RC-025/026: sem «Hoje 18h» à noite; fim de semana pula para segunda
    h("button", { type: "button", class: "bt bt-fant bt-p tf-atalho", dataset: { valor: a.valor }, on: { click: () => {
      const c = campoPrazo(); if (!c) return;
      c.value = a.valor; pintarPrazo();
      ui.anunciar(`Prazo: ${a.rotulo}.`);
    } } }, a.rotulo)));
  // plano 1500c · RC-136: horas comuns trocam só a hora (o seletor nativo de hora é ruim no Android)
  const horasComuns = h("div", { class: "tf-atalhos tf-horas", role: "group", "aria-label": "Hora do prazo" }, ["09:00", "11:00", "14:00", "16:00", "18:00"].map(hh =>
    h("button", { type: "button", class: "bt bt-fant bt-p tf-hora", dataset: { hora: hh }, on: { click: () => {
      const c = campoPrazo(); if (!c) return;
      c.value = L.trocarHora(c.value, hh, hojeSPIso); pintarPrazo();
      ui.anunciar(`Hora: ${hh.replace(":00", "h")}.`);
    } } }, hh.replace(":00", "h"))));
  // plano 1000 (CR-245): tarefa nova sem vínculo (#/tarefas, paleta) pode ser ligada a um contato — busca pelo nome ou telefone
  let ligado = null;
  const vv = k.v || {};
  const blocoLigar = !tarefa && !contato_id && !negocio_id ? (() => {
    const busca = h("input", { type: "search", class: "tf-ligar-busca", placeholder: "Nome ou telefone", "aria-label": `Ligar a tarefa a ${vv.art && vv.art("contato") === "a" ? "uma" : "um"} ${vv.min ? vv.min("contato") : "contato"}`, autocomplete: "off" });
    const res = h("div", { class: "crm-busca-res", role: "group", "aria-label": "Resultados" });   // plano 1000b · RB-052: grupo de botões comuns (Tab entre eles) — era listbox sem setas nem aria-selected
    const escolhido = h("div", { class: "crm-escolhido", hidden: true });
    // plano 1000b · RB-237: escolhido o contato, os negócios ABERTOS dele (nx_contato_ver) aparecem para ligar a tarefa também ao negócio (opcional)
    const zonaNeg = h("div", { class: "tf-ligar-neg", hidden: true });
    let seqN = 0;
    const pintarNegocios = async () => {
      const minha = ++seqN;
      ui.limpar(zonaNeg); zonaNeg.hidden = true;
      if (!ligado) return;
      try {
        const d = await k.api.rpcC("nx_contato_ver", { p_id: ligado.id });
        if (minha !== seqN || !ligado) return;
        const abertos = ((d && d.negocios) || []).filter(n => n && n.id != null && (n.status || "aberto") === "aberto");
        if (!abertos.length) return;
        const termo = vv.min ? vv.min("negocio") : "negócio";
        const sel = h("select", { class: "sel tf-ligar-neg-sel", name: "ligar_negocio", "aria-label": `Ligar também a ${vv.art && vv.art("negocio") === "a" ? "uma" : "um"} ${termo}` },
          h("option", { value: "" }, `Só ${vv.art && vv.art("contato") === "a" ? "à" : "ao"} ${vv.min ? vv.min("contato") : "contato"}`),
          abertos.map(n => h("option", { value: String(n.id) }, L.tituloCard(n))));
        zonaNeg.append(h("span", { class: "campo-rot" }, `${vv.negocio || "Negócio"} (opcional)`), sel);
        zonaNeg.hidden = false;
      } catch { /* sem a lista: liga só ao contato */ }
    };
    const pintar = () => {
      ui.limpar(escolhido); escolhido.hidden = !ligado; busca.hidden = !!ligado;
      if (ligado) escolhido.append(ui.icone("contato"), h("span", null, h("b", null, ligado.nome)),
        h("button", { type: "button", class: "bt-icone", "aria-label": "Tirar o vínculo", on: { click: () => { ligado = null; pintar(); busca.focus(); } } }, ui.icone("fechar")));
      pintarNegocios();
    };
    let seqB = 0;
    busca.addEventListener("input", ui.debounce(async () => {
      const q = busca.value.trim(), minha = ++seqB;
      ui.limpar(res);
      if (q.length < 2) return;
      try {
        const r = await k.api.rpcC("nx_contatos_listar", { p_filtro: { busca: q }, p_por_pagina: 6 });
        if (minha !== seqB) return;
        const itens = (r && r.itens) || [];
        if (!itens.length) { res.appendChild(h("p", { class: "fraco" }, "Nada encontrado.")); return; }
        for (const c of itens) res.appendChild(h("button", { type: "button", dataset: { id: c.id }, on: { click: () => { ligado = { id: c.id, nome: L.nomeContato(c) }; busca.value = ""; ui.limpar(res); pintar(); } } },
          ui.icone("contato"), h("span", null, h("b", null, L.nomeContato(c)), c.telefone ? h("small", null, ui.telBR(c.telefone)) : null)));
      } catch (e) { if (minha === seqB) res.appendChild(h("p", { class: "fraco" }, k.erro(e))); }
    }, 250));
    pintar();
    return h("div", { class: "campo inteiro tf-ligar" }, h("span", { class: "campo-rot" }, "Ligada a (opcional)"), escolhido, busca, res, zonaNeg);
  })() : null;
  // plano 1500c · RC-240: tarefa nova do negócio/contato de outra pessoa nasce com o DONO dele (quem está na equipe); sem dono, «eu»
  const donoNovo = L.donoSugeridoTarefa(donoSug, k.base.usuarios, k.eu());
  const selDono = ui.seletorPessoa({ usuarios: k.base.usuarios, valor: t.dono ? t.dono.id : (tarefa ? null : donoNovo), rotulo: "Responsável", vazio: "Sem responsável" });
  const idDonoTf = L.idUnico("tf-dono");      // plano 1000b · RB-207
  (selDono.tagName === "SELECT" ? selDono : selDono.querySelector("select") || selDono).id = idDonoTf;
  const form = h("form", { class: "crm-form", novalidate: true },
    // plano 1500c · RC-127/237: o exemplo é da vertical (oficina: «orçamento») e acompanha o tipo escolhido (e-mail, visita…)
    ui.campo({ rotulo: "O que precisa ser feito", nome: "titulo", valor: t.titulo || tituloSug || "", obrigatorio: true, max: 160,
      placeholder: `Ex.: ${L.exemploTarefa ? L.exemploTarefa(vv.vertical, t.tipo || "tarefa") : "Ligar para confirmar a avaliação"}` }),
    blocoLigar,
    h("div", { class: "crm-form-2" },
      ui.campo({ rotulo: "Tipo", nome: "tipo", tipo: "select", valor: t.tipo || "tarefa",
        opcoes: TIPOS.map(x => ({ valor: x, rotulo: L.ROTULO_TAREFA[x] })) }),
      h("div", { class: "pilha-p tf-prazo" }, ui.campo({ rotulo: "Vence em", nome: "vence_em", tipo: "datahora", valor: venceLocal }), atalhosPrazo, horasComuns, avisoPrazo),
      h("div", { class: "campo inteiro" },
        h("label", { for: idDonoTf }, "Responsável"),      // plano 1000b · RB-207: o rótulo aponta para o seletor
        selDono)),
    ui.campo({ rotulo: "Detalhes (opcional)", nome: "descricao", tipo: "textarea", valor: t.descricao || "", max: 5000, linhas: 3 }),
    h("p", { class: "crm-status", role: "status", "aria-live": "polite", hidden: true }));
  // plano 1000b · RB-124: o name vai na referência guardada do seletor (antes: o 1º select de qualquer .campo.inteiro do formulário)
  const selDonoCampo = selDono.tagName === "SELECT" ? selDono : selDono.querySelector("select");
  if (selDonoCampo) selDonoCampo.name = "dono_id";
  // plano 1500c · RC-237: trocar o tipo troca o exemplo do título
  const selTipo = form.querySelector("[name=tipo]"), inTit = form.querySelector("[name=titulo]");
  if (selTipo && inTit && L.exemploTarefa) selTipo.addEventListener("change", () => inTit.setAttribute("placeholder", `Ex.: ${L.exemploTarefa(vv.vertical, selTipo.value)}`));
  if (campoPrazo()) campoPrazo().addEventListener("change", pintarPrazo);
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
        else {
          if (contato_id) p.contato_id = contato_id; else if (ligado) p.contato_id = ligado.id;
          if (negocio_id) p.negocio_id = negocio_id;
          else if (ligado) { const sn = form.querySelector(".tf-ligar-neg-sel"); if (sn && /^\d+$/.test(sn.value)) p.negocio_id = Number(sn.value); }    // plano 1000b · RB-237
        }
        try {
          // plano 1000b · RB-257: a edição também vai com chave de idempotência (k.escrever) — erro ambíguo não mostra falha do que já foi gravado
          const conteudo = JSON.stringify(p);
          if (conteudo !== reqConteudo) { reqAtual = k.novaReq(); reqConteudo = conteudo; }
          const { resultado } = await k.escrever("nx_tarefa_salvar", { p_tarefa: p }, { req: reqAtual, aoStatus: txt => { status.textContent = txt; status.hidden = false; } });
          status.hidden = true;
          for (const rc of rascunhos) rc.apagar();      // o servidor confirmou: o rascunho some
          return resultado;
        } catch (e) {
          status.hidden = true;
          api.erro(e && e.ambigua ? `Não foi possível confirmar se foi salvo. Toque em «${tarefa ? "Salvar" : "Criar tarefa"}» de novo: é seguro, não duplica.` : k.erro(e));
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
  const ROT = { editar: ["Editar", "editar"], adiar: ["Adiar para amanhã", "relogio"], excluir: ["Excluir", "lixeira"],
    adiar_hora: ["Adiar 1 hora", "relogio"], adiar_semana: ["Adiar para a próxima semana", "relogio"], adiar_escolher: ["Adiar para… (escolher)", "calendario"] };
  // plano 1000 (CR-150): no ⋮, «Adiar» tem 4 opções (+1 h · amanhã · próxima semana · escolher); o deslizar continua «amanhã»
  const menuIds = A.menu.flatMap(id => (id === "adiar" ? ["adiar_hora", "adiar", "adiar_semana", "adiar_escolher"] : [id]));
  // plano 1000 (CR-156): sem internet o círculo fica desligado com a dica (antes ia e voltava com o erro do servidor)
  const offline = typeof navigator !== "undefined" && navigator && navigator.onLine === false;
  ligarRedeGlobal();       // plano 1000b · RB-115: a gaveta e a ficha também religam o círculo quando a internet volta
  const check = h("input", { type: "checkbox", checked: !!t.concluida_em, disabled: !pode || offline, title: offline ? "Sem internet: conclua quando a conexão voltar" : null,
    dataset: offline && pode ? { semRede: "1" } : null,
    // plano 1000b · RB-238: o leitor ouve o prazo junto («…, sem prazo», «…, atrasada, há 2 dias») sem precisar navegar até o texto
    "aria-label": t.concluida_em ? `Reabrir a tarefa ${t.titulo}` : `Concluir a tarefa ${t.titulo}, ${prazoParaLeitor(v)}` });
  const mais = pode ? h("button", { type: "button", class: "bt-icone tf-mais", "aria-label": `Mais ações da tarefa ${t.titulo}`, title: "Mais ações" }, ui.icone("opcoes")) : null;
  const el = h("div", { class: ["tf", t.concluida_em && "feita"], dataset: { id: t.id } },
    h("label", { class: "tf-check" }, check, h("span", { "aria-hidden": "true" })),
    h("div", { class: "tf-corpo" },
      h("span", { class: "tf-t" }, t.titulo),
      h("div", { class: "tf-meta" },
        h("span", null, ui.icone(L.ICONE_TAREFA[t.tipo] || "tarefa"), L.ROTULO_TAREFA[t.tipo] || "Tarefa"),
        // plano 1500c · RC-137: sem prazo vira selo neutro («nunca atrasa»), não some no meio das datas
        !t.concluida_em && !t.vence_em ? h("span", { class: "tf-sem-prazo", title: "Sem prazo: nunca fica atrasada" }, ui.icone("relogio"), "sem prazo") : h("span", { class: v.cls }, ui.icone("relogio"), v.txt),
        t.dono ? h("span", null, ui.icone("usuario"), t.dono.nome) : null,
        mostrarVinculo && t.contato ? h("a", { href: `#/contatos/${t.contato.id}`, "aria-label": `${k.v.contato}: ${t.contato.nome || ""}` }, ui.icone("contato"), t.contato.nome || k.v.contato) : null,
        mostrarVinculo && t.negocio ? h("a", { href: `#/crm/negocio/${t.negocio.id}`, "aria-label": `${k.v.negocio}: ${t.negocio.titulo || ""}` }, ui.icone("funil"),
          t.negocio.titulo && !(t.contato && t.negocio.titulo === t.contato.nome) ? t.negocio.titulo : k.v.negocio) : null,
        // plano 1500c · RC-238: qual automação criou a tarefa (o nome, quando o servidor manda)
        t.automacao ? h("span", { class: "tf-auto", title: t.automacao && t.automacao.nome ? `Criada pela automação «${t.automacao.nome}»` : "Criada por uma automação" },
          ui.icone("raio"), t.automacao && t.automacao.nome ? `Automação: ${t.automacao.nome}` : "Automação") : null),
      t.descricao ? h("span", { class: "fraco tf-desc" }, t.descricao) : null),     // plano 1000 (CR-149): as quebras de linha da descrição continuam (CSS)
    pode ? h("div", { class: "tf-acoes" },
      // plano 1500c · RC-239: dica visual no lápis e na lixeira (no desktop o ícone sozinho não explica)
      h("button", { type: "button", class: "bt-icone", "aria-label": `Editar a tarefa ${t.titulo}`, title: "Editar", on: { click: () => executar("editar") } }, ui.icone("editar")),
      h("button", { type: "button", class: "bt-icone", "aria-label": `Excluir a tarefa ${t.titulo}`, title: "Excluir", on: { click: () => executar("excluir") } }, ui.icone("lixeira")),
      mais) : h("span"));

  let ocupada = false;         // um toque por vez (o ✓ de sucesso segura a linha por ~1 s antes de ela mudar de lugar)
  /** Concluir/reabrir: o círculo e o deslizar chamam esta. Concluiu → Desfazer reabre. */
  async function alternar(quer) {
    if (ocupada) { check.checked = !quer; return; }
    if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) {
      check.checked = !quer;
      ui.toast("Sem internet: a tarefa não foi alterada. Tente de novo quando a conexão voltar.", { tipo: "erro" });
      return;
    }
    ocupada = true;
    check.checked = quer;
    el.classList.toggle("feita", quer);
    try {
      // plano 1500c · RC-128: concluir é idempotente — erro ambíguo (rede caiu no meio) repete 1× a MESMA chamada antes de desmarcar
      let nova;
      try { nova = await k.api.rpcC("nx_tarefa_concluir", { p_id: t.id, p_concluida: quer }); }
      catch (e1) {
        if (!L.erroAmbiguo(e1)) throw e1;
        ui.anunciar("Não deu para confirmar — tentando de novo.");
        nova = await k.api.rpcC("nx_tarefa_concluir", { p_id: t.id, p_concluida: quer });
      }
      // C5: concluiu → o ✓ de sucesso (ui.checkSucesso) cobre a linha e só então ela desce para as concluídas; reabrir não comemora
      if (quer && typeof ui.checkSucesso === "function") await ui.checkSucesso(el, { texto: "Tarefa concluída." });
      else ui.anunciar(quer ? "Tarefa concluída." : "Tarefa reaberta.");
      aoMudar && aoMudar({ tipo: "salva", tarefa: nova });
      // plano 1500c · RC-344: «+ Próxima tarefa» no mesmo aviso — abre o formulário já ligado ao mesmo contato/negócio (o passo seguinte quase sempre é outra tarefa)
      const vinc = {
        contato_id: t.contato_id ?? (t.contato && t.contato.id != null ? t.contato.id : null),
        negocio_id: t.negocio_id ?? (t.negocio && t.negocio.id != null ? t.negocio.id : null),
      };
      const proxima = vinc.contato_id != null || vinc.negocio_id != null ? { rotulo: "+ Próxima tarefa", fn: async () => {
        const nt = await formTarefa(k, null, { contato_id: vinc.contato_id, negocio_id: vinc.negocio_id, ...(t.dono_id != null ? { dono_id: t.dono_id } : {}) });
        if (nt) aoMudar && aoMudar({ tipo: "salva", tarefa: nt });
      } } : null;
      if (quer) ui.acaoComDesfazer({ texto: "Tarefa concluída", acao: proxima, reverter: async () => {
        const r = await k.api.rpcC("nx_tarefa_concluir", { p_id: t.id, p_concluida: false });
        aoMudar && aoMudar({ tipo: "salva", tarefa: r });
      } });
    } catch (e) {
      check.checked = !quer; el.classList.toggle("feita", !quer);
      k.toastErro(e);
    } finally { ocupada = false; }
  }
  /** Adiar para amanhã (mesma hora; L.adiarParaAmanha): grava já e o Desfazer devolve o vencimento de antes. */
  async function adiar(modo = "amanha") {
    const antes = t.vence_em || null;
    const novo = L.adiarTarefa(antes, modo);
    try {
      const nova = await k.api.rpcC("nx_tarefa_salvar", { p_tarefa: { id: t.id, vence_em: novo } });
      ui.anunciar("Tarefa adiada.");
      aoMudar && aoMudar({ tipo: "salva", tarefa: nova });
      // plano 1000b · RB-218: «para amanhã, 09:00» (Hoje/Amanhã/Seg, 20/10) em vez de só a data
      const rotNovo = k.L && k.L.rotuloDia ? k.L.rotuloDia(diaSP(ui, novo), hojeISO(ui)) : "";
      const quando = rotNovo && rotNovo !== "Sem data" ? rotNovo.charAt(0).toLowerCase() + rotNovo.slice(1) : ui.dataCurtaBR(novo);
      ui.acaoComDesfazer({ texto: `Tarefa adiada para ${quando}, ${ui.horaBR(novo)}`, reverter: async () => {
        const r = await k.api.rpcC("nx_tarefa_salvar", { p_tarefa: { id: t.id, vence_em: antes } });
        aoMudar && aoMudar({ tipo: "salva", tarefa: r });
      } });
    } catch (e) { k.toastErro(e); }
  }
  async function executar(id) {
    if (id === "concluir") return alternar(!check.checked);
    if (id === "adiar") return adiar();
    if (id === "adiar_hora") return adiar("hora");
    if (id === "adiar_semana") return adiar("semana");
    if (id === "adiar_escolher") id = "editar";
    if (id === "editar") {
      const nova = await formTarefa(k, t);
      if (nova) { ui.toast("Tarefa salva.", { tipo: "ok", ms: 1800 }); aoMudar && aoMudar({ tipo: "salva", tarefa: nova }); }
      return;
    }
    if (id === "excluir") {
      // M25: sem «tem certeza?». A tarefa some na hora e a exclusão de verdade (firmar) só vai ao servidor depois dos 7 s do «Desfazer»
      // plano 1000 (CR-151): tarefa de automação pode voltar — o aviso diz isso (a regra continua ligada)
      const nomeAuto = t.automacao && typeof t.automacao === "object" && t.automacao.nome ? `«${t.automacao.nome}»` : null;
      const txtAuto = t.automacao ? `. Criada pela automação${nomeAuto ? ` ${nomeAuto}` : ""}: se a regra continuar valendo, ela cria a tarefa de novo (Automações)` : "";
      excluirComDesfazer(k, "tarefa", t, { texto: `Tarefa «${t.titulo}» excluída${txtAuto}`, rpc: "nx_tarefa_excluir",
        sumir: () => { aoMudar && aoMudar({ tipo: "excluida", tarefa: t }); },
        voltar: () => { aoMudar && aoMudar({ tipo: "salva", tarefa: t }); } });
    }
  }
  check.addEventListener("change", () => alternar(check.checked));
  if (mais) mais.addEventListener("click", () => ui.menu(mais, menuIds.map(id => ({ rotulo: ROT[id][0], icone: ROT[id][1], perigo: id === "excluir", fn: () => executar(id) }))));

  const fundo = (lado, icone, texto) => h("div", { class: `tf-fundo tf-fundo-${lado}`, "aria-hidden": "true" }, ui.icone(icone), h("span", null, texto));
  // plano 1000 (CR-248): o leitor de tela fica sabendo que a linha desliza — e que o menu ⋮ faz o mesmo
  const li = h("div", { class: "tf-li", "aria-description": A.direita || A.esquerda ? `Deslize para ${A.direita ? (t.concluida_em ? "reabrir" : "concluir") : ""}${A.direita && A.esquerda ? " ou " : ""}${A.esquerda ? "adiar" : ""}; ou use o menu Mais ações.` : null },
    A.direita ? fundo("d", t.concluida_em ? "reabrir" : "check", t.concluida_em ? "Reabrir" : "Concluir") : null,
    A.esquerda ? fundo("e", "relogio", "Adiar") : null,
    el);
  if (A.direita || A.esquerda) ui.deslizar(el, { direita: A.direita ? () => executar(A.direita) : undefined, esquerda: A.esquerda ? () => executar(A.esquerda) : undefined });
  return li;
}

/**
 * plano 1000b · RB-115: caiu/voltou a internet → os círculos de concluir desligam/religam em QUALQUER lugar (gaveta, ficha, #/tarefas) —
 * antes só a tela de Tarefas ouvia. Um ouvinte por janela; `data-sem-rede` só marca quem podia concluir (quem não pode continua desligado).
 */
export function varrerChecksRede(raiz) {
  if (!raiz || typeof raiz.querySelectorAll !== "function") return;
  const off = typeof navigator !== "undefined" && navigator && navigator.onLine === false;
  for (const x of raiz.querySelectorAll(".tf-check input")) {
    if (off) { if (!x.disabled) { x.disabled = true; x.dataset.semRede = "1"; x.setAttribute("title", "Sem internet: conclua quando a conexão voltar"); } }
    else if (x.dataset.semRede) { x.disabled = false; delete x.dataset.semRede; x.removeAttribute("title"); }
  }
}
let redeLigadaEm = null;
function ligarRedeGlobal() {
  if (typeof addEventListener !== "function" || redeLigadaEm === addEventListener) return;
  redeLigadaEm = addEventListener;
  const f = () => { if (typeof document !== "undefined" && document && document.body) varrerChecksRede(document.body); };
  addEventListener("online", f); addEventListener("offline", f);
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
    const feitas = k.L.ordenarConcluidas(lista.filter(t => t.concluida_em));      // plano 1500c · RC-129: a concluída por último vem primeiro
    cont.textContent = abertas.length ? String(abertas.length) : "";
    if (!lista.length) corpo.appendChild(h("p", { class: "fraco crm-vazio-txt" }, vazio));
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
  } } }, ui.icone("mais"), "Nova tarefa") : null;      // plano 1000b · RB-123: com verbo, como o FAB
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
  // plano 1500c · RC-130: nota longa nasce recolhida (6 linhas) com «Ver mais/Ver menos» (aria-expanded)
  const longa = k.L.notaLonga(n.texto);
  // plano 1500c · RC-131: links e telefones da nota viram <a> (sem innerHTML — cada pedaço com textContent)
  const pedacos = (k.L.partesNota ? k.L.partesNota(n.texto) : [{ tipo: "texto", texto: n.texto }]).map(p => (p.tipo === "url"
    ? h("a", { href: p.href, target: "_blank", rel: "noopener noreferrer" }, p.texto)
    : p.tipo === "tel" ? h("a", { href: p.href, "aria-label": `Ligar para ${p.texto}` }, p.texto) : p.texto));
  const texto = h("p", { class: longa ? "nota-txt nota-recolhida" : "nota-txt", id: longa ? k.L.idUnico("nota-txt") : null }, ...pedacos);
  const verMais = longa ? h("button", { type: "button", class: "link nota-ver-mais", "aria-expanded": "false", "aria-controls": texto.id, on: { click: () => {
    const abrir = verMais.getAttribute("aria-expanded") !== "true";
    verMais.setAttribute("aria-expanded", abrir ? "true" : "false");
    texto.classList.toggle("nota-recolhida", !abrir);
    verMais.textContent = abrir ? "Ver menos" : "Ver mais";
  } } }, "Ver mais") : null;
  const el = h("article", { class: ["nota", n.fixada && "fixada"], dataset: { id: n.id } },
    texto, verMais,
    h("div", { class: "nota-meta" },
      n.fixada ? h("span", { class: "pilula pilula-aten" }, "Fixada") : null,
      // plano 1000b · RB-120: «Automático» aqui e na linha do tempo (antes «Sistema» numa e «sistema» na outra)
      h("span", { class: "cresce" }, `${n.autor ? n.autor.nome : k.L.AUTOR_AUTOMATICO} · ${ui.dataHoraBR(n.criado_em)}${n.editado_em ? " · editada" : ""}`),
      pode ? h("button", { type: "button", "aria-pressed": String(!!n.fixada),
        "aria-label": n.fixada ? "Desafixar nota" : "Fixar nota no topo", title: n.fixada ? "Desafixar" : "Fixar no topo",
        // plano 1000 (CR-065): o ✓ parecia «concluir» — agora o botão diz «Fixar»/«Desafixar» (o sprite não tem alfinete)
        class: "bt bt-fant bt-p nota-fixar",
        on: { click: async () => {
          try { const r = await k.api.rpcC("nx_nota_salvar", { p_nota: { id: n.id, fixada: !n.fixada } }); aoMudar({ tipo: "salva", nota: r }); }
          catch (e) { k.toastErro(e); }
        } } }, n.fixada ? "Desafixar" : "Fixar") : null,
      pode ? h("button", { type: "button", class: "bt-icone", "aria-label": `Editar a nota «${k.L.resumoTexto(n.texto)}»`, on: {      /* plano 1000b · RB-122: diz QUAL nota */ click: async () => {
        const campoTxt = ui.campo({ rotulo: "Nota", nome: "texto", tipo: "textarea", valor: n.texto, max: 5000, linhas: 5 });
        // plano 1000b · RB-258: a edição também guarda rascunho (queda de sessão não perde o texto); some quando o servidor confirma ou ao cancelar
        const rasc = k.rascunho ? k.rascunho(campoTxt.querySelector("textarea"), `nota:${n.id}:editar`) : null;
        const r = await ui.modal({ titulo: "Editar nota", corpo: campoTxt, acoes: [
          { rotulo: "Cancelar", tipo: "neutro", valor: null },
          { rotulo: "Salvar", tipo: "primario", fn: async api => {
            const t = campoTxt.querySelector("textarea").value.trim();
            if (!t) { api.erro("Escreva a nota."); return false; }
            try { return await k.api.rpcC("nx_nota_salvar", { p_nota: { id: n.id, texto: t } }); } catch (e) { api.erro(k.erro(e)); return false; }
          } }] });
        if (rasc && typeof rasc.apagar === "function") rasc.apagar();
        if (r) aoMudar({ tipo: "salva", nota: r });
      } } }, ui.icone("editar")) : null,
      pode ? h("button", { type: "button", class: "bt-icone", "aria-label": `Excluir a nota «${k.L.resumoTexto(n.texto)}»`, on: {      /* plano 1000b · RB-122 */ click: () => {
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
    if (!lista.length) corpo.appendChild(h("p", { class: "fraco crm-vazio-txt" }, "Nenhuma nota ainda. Anote combinados, preferências e objeções — a equipe toda vê."));
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
    // plano 1000b · RB-121: no Mac o atalho é ⌘+Enter (o metaKey já era aceito)
    const ta = h("textarea", { "aria-label": "Nova nota", placeholder: `Escreva uma nota… (${k.L.atalhoSalvar(plataformaAparelho())} salva)`, maxlength: 5000, rows: 3 });
    const bt = h("button", { type: "button", class: "bt bt-prim bt-p" }, ui.icone("nota"), "Salvar nota");
    // plano 1000b · RB-114: trava — Ctrl+Enter repetido durante a gravação não cria a mesma nota duas vezes (o ui.carregando só desliga o botão)
    let salvando = false;
    const salvar = async () => {
      if (salvando) return;
      const t = ta.value.trim();
      if (!t) { ta.focus(); return; }
      salvando = true;
      try {
        const n = await ui.carregando(bt, k.api.rpcC("nx_nota_salvar", { p_nota: { texto: t, ...(negocio_id ? { negocio_id } : {}), ...(contato_id ? { contato_id } : {}) } }));
        ta.value = "";
        if (rascunhoNota) rascunhoNota.apagar();      // o servidor confirmou
        mudou({ tipo: "salva", nota: n });
        ui.anunciar("Nota salva.");
      } catch (e) { k.toastErro(e); }
      finally { salvando = false; }
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

/** blocoTempo(k, itens, {titulo, pagina}) → Node — agrupada por dia («Hoje», «Ontem», «Seg, 29/09»), ícone colorido por tipo de evento, hora de cada item.
 *  plano 1000 (SV-135, contrato 20261013b): `pagina` = {p_negocio} ou {p_contato}: com a 1ª página cheia (80), «Ver registros mais antigos» chama
 *  nx_crm_tempo_pagina(p_antes) → {itens, tem_mais}. Servidor sem a RPC: o botão some e fica o comportamento de antes (só os 80). */
const TEMPO_PAGINA = 80;
let tempoPaginaAusente = false;
export function blocoTempo(k, itens = [], { titulo = "Linha do tempo", pagina = null, filtro: filtroInicial = "tudo", aoFiltrar = null } = {}) {
  const { ui, h, L } = k;
  const nomes = k.nomes();
  const motivos = k.motivosPorId();
  const temConversas = !!(k.ctx && typeof k.ctx.temModulo === "function" && k.ctx.temModulo("conversas"));      // plano 1000b · RB-051
  const corpo = h("div", { class: "tempo-dias" });
  let todos = (itens || []).slice();
  const chave = it => `${it.fonte || it.tipo || ""}:${it.id ?? ""}:${it.em || ""}`;
  // plano 1000 (CR-063): chips «Tudo · Notas · Etapas · Conversas · Automações» — a nota importante não se perde entre dezenas de eventos
  let filtro = "tudo";
  const FILTROS = [["tudo", "Tudo"], ["nota", "Notas"], ["etapas", "Etapas"], ["conversa", "Conversas"], ["automacao", "Automações"]];
  const daFamilia = (it, v) => { const f = familiaTempo(it); return v === "etapas" ? ["estagio", "ganho", "perdido"].includes(f) : f === v; };
  const passa = it => filtro === "tudo" || daFamilia(it, filtro);
  const contar = v => (v === "tudo" ? todos.length : todos.filter(it => daFamilia(it, v)).length);
  // plano 1000b · RB-112: a ficha redesenhada pelo pulso volta com o MESMO filtro (antes voltava para «Tudo»)
  if (filtroInicial !== "tudo" && FILTROS.some(([v]) => v === filtroInicial) && contar(filtroInicial) > 0) filtro = filtroInicial;
  const chips = todos.length > 1 ? h("div", { class: "tempo-filtros crm-seg", role: "group", "aria-label": "Mostrar na linha do tempo" }, FILTROS.map(([v, t]) => {
    const n = contar(v);
    return h("button", { type: "button", class: "tempo-filtro", dataset: { filtro: v }, "aria-pressed": String(v === filtro), disabled: !n && v !== "tudo",
      on: { click: () => { const nn = contar(v); filtro = v; if (aoFiltrar) try { aoFiltrar(v); } catch { /* ok */ } for (const b of chips.querySelectorAll(".tempo-filtro")) b.setAttribute("aria-pressed", String(b.dataset.filtro === v)); desenharDias(); if (ui.anunciar) ui.anunciar(`${t}: ${nn} ${nn === 1 ? "registro" : "registros"}.`); } } },
      t, h("span", { class: "tempo-filtro-n dado" }, String(n)));
  })) : null;
  function contarChips() {
    if (!chips) return;
    for (const b of chips.querySelectorAll(".tempo-filtro")) {
      const n = contar(b.dataset.filtro);
      b.disabled = !n && b.dataset.filtro !== "tudo";
      const sp = b.querySelector(".tempo-filtro-n"); if (sp) sp.textContent = String(n);
    }
  }
  function desenharDias() {
    ui.limpar(corpo);
    const vis = todos.filter(passa);
    if (!vis.length) corpo.appendChild(h("p", { class: "fraco crm-vazio-txt" }, todos.length ? "Nada desse tipo ainda." : "Ainda não há registros."));
    const grupos = L.agruparPorDia(vis, { instanteDe: it => it.em, diaDe: iso => diaSP(ui, iso), hoje: hojeISO(ui), ordem: "desc" });
    for (const g of grupos) {
      const ol = h("ol", { class: "tempo" });
      for (const it of g.itens) {
        const cls = familiaTempo(it);
        const txt = L.textoTempo(it, { nomes, vocab: k.v, brl: v => ui.brl(v), motivos });
        // plano 1000b · RB-051: sem o módulo Conversas não há link para #/conversas
        const link = it.conversa_id && temConversas ? h("a", { href: `#/conversas/${it.conversa_id}` }, " Abrir conversa") : null;
        ol.appendChild(h("li", { class: ["tempo-it", cls] },
          h("span", { class: "tempo-ic", "aria-hidden": "true" }, ui.icone(L.iconeTempo(it))),
          h("div", { class: "tempo-txt" }, txt, link,
            h("small", null, h("time", { datetime: it.em || null, title: ui.dataHoraBR(it.em) }, g.dia ? ui.horaBR(it.em) : ui.dataHoraBR(it.em)), `${it.autor ? ` · ${it.autor.nome}` : ` · ${L.AUTOR_AUTOMATICO}`}`))));
      }
      corpo.appendChild(h("section", { class: "tempo-dia", "aria-label": g.rotulo },
        h("h4", { class: "tempo-dia-t" }, h("span", null, g.rotulo), h("span", { class: "tempo-dia-n dado" }, String(g.itens.length))), ol));
    }
  }
  desenharDias();

  // a página seguinte começa ANTES do registro mais antigo que não seja nota fixada (a fixada vem no topo da 1ª página, mesmo sendo antiga)
  const maisAntigo = () => todos.filter(it => !(it.fonte === "nota" && it.dados && it.dados.fixada === true) && it.em)
    .reduce((m, it) => (m === null || Date.parse(it.em) < Date.parse(m) ? it.em : m), null);
  const alvoPagina = pagina && (pagina.p_negocio != null || pagina.p_contato != null) ? pagina : null;
  let maisBt = null;
  if (alvoPagina && !tempoPaginaAusente && todos.length >= TEMPO_PAGINA) {
    maisBt = h("button", { type: "button", class: "bt bt-fant bt-p tempo-mais" }, "Ver registros mais antigos");
    maisBt.addEventListener("click", async () => {
      const antes = maisAntigo();
      if (!antes || maisBt.disabled) return;
      maisBt.disabled = true; maisBt.setAttribute("aria-busy", "true");
      try {
        const r = await k.api.rpcC("nx_crm_tempo_pagina", { p_negocio: alvoPagina.p_negocio ?? null, p_contato: alvoPagina.p_contato ?? null, p_antes: antes });
        const vistos = new Set(todos.map(chave));
        const novos = ((r && r.itens) || []).filter(it => it && !vistos.has(chave(it)));
        todos = todos.concat(novos);
        contarChips();
        desenharDias();
        if (ui.anunciar) ui.anunciar(novos.length ? `${novos.length} ${novos.length === 1 ? "registro mais antigo" : "registros mais antigos"} na linha do tempo.` : "Não há registros mais antigos.");
        if (!(r && r.tem_mais) || !novos.length) maisBt.remove();
      } catch (e) {
        if (L.rpcAusente && L.rpcAusente(e)) { tempoPaginaAusente = true; maisBt.remove(); return; }
        if (k.toastErro) k.toastErro(e); else ui.toast(k.erro ? k.erro(e) : "Não consegui carregar agora.", { tipo: "erro" });
      } finally { maisBt.disabled = false; maisBt.removeAttribute("aria-busy"); }
    });
  }
  return h("section", { class: "ng-bloco", "aria-label": titulo }, h("div", { class: "ng-bloco-cab" }, h("h3", null, titulo)), chips, corpo, maisBt);
}

/* ============================================================ T9 — Tarefas (#/tarefas) */
const ABAS_T9 = [
  { id: "hoje", rotulo: "Hoje" }, { id: "atrasadas", rotulo: "Atrasadas" },
  { id: "proximas", rotulo: "Próximas" }, { id: "concluidas", rotulo: "Concluídas" },
];
/** plano 1000b · RB-233: o aviso do limite (o servidor manda no máximo 200) com um conselho que serve para a aba. */
export function textoTarefasDeMais(aba, n, todas = false) {
  const minhas = todas ? "«Minhas»" : null;
  if (aba === "atrasadas") return `Mostrando as ${n} primeiras. Conclua ou adie algumas${minhas ? `, ou veja só as suas em ${minhas},` : ""} para ver as outras.`;
  if (aba === "concluidas") return `Mostrando as ${n} primeiras.${minhas ? ` Use ${minhas} para ver menos de cada vez.` : ""}`;
  return `Mostrando as ${n} primeiras. Use ${minhas ? `${minhas} ou ` : ""}a visão Semana para ver menos de cada vez.`;
}

const VAZIO_T9 = {
  hoje: "Nada para hoje. Que tal revisar as oportunidades paradas?", atrasadas: "Nenhuma tarefa atrasada. Tudo em dia.",
  proximas: "Nenhuma tarefa marcada para os próximos dias.", concluidas: "Nenhuma tarefa concluída ainda.",
};

export async function montarTarefas(k, el, rota) {
  const { ui, h, ctx, L } = k;
  ctx.titulo("Tarefas");
  // plano 1000b · RB-119: aba, «Minhas/Todas» e «Lista/Semana» lembradas por empresa E conta (aparelho compartilhado); a chave antiga migra uma vez
  const sufixo = `${(ctx.cliente && ctx.cliente.id) || "-"}-${(typeof k.eu === "function" && k.eu()) || "-"}`;
  const ch = nome => `nx-app-tarefas-${nome}-${sufixo}`;
  const lerLocal = (nome, p) => {
    try {
      let v = localStorage.getItem(ch(nome));
      if (v === null && (v = localStorage.getItem(`nx-app-tarefas-${nome}`)) !== null) { localStorage.setItem(ch(nome), v); localStorage.removeItem(`nx-app-tarefas-${nome}`); }
      return v || p;
    } catch { return p; }
  };
  const gravar = (nome, v) => { try { localStorage.setItem(ch(nome), v); } catch { /* ok */ } };
  const q = (rota && rota.query) || {};     // plano 1000b · RB-235: rota sem query não derruba a tela
  let aba = ABAS_T9.some(a => a.id === q.aba) ? q.aba : lerLocal("aba", "hoje");
  const podeTodas = k.pode("supervisor");
  let dono = podeTodas ? lerLocal("dono", "eu") : "eu";
  let seq = 0;

  // plano 1000 (CR-146): o painel do dia É a navegação (antes painel e abas faziam a mesma coisa, uma embaixo da outra); «Concluídas» vira o 4º botão
  const irAba = id => { if (aba === id) return; aba = id; gravar("aba", id); marcarAbas(); carregar(); };
  const seg = ui.segmentado({ opcoes: [{ valor: "eu", rotulo: "Minhas" }, { valor: "todos", rotulo: "Todas" }], valor: dono, tipo: "filtro", rotulo: "De quem",
    aoMudar: x => { dono = x; gravar("dono", x); carregar(); } });
  seg.hidden = !podeTodas;
  // plano 1000 (CR-244): «Lista · Semana» — a semana mostra hoje e os próximos 6 dias em 7 colunas (Hoje + Próximas juntas); Atrasadas e Concluídas seguem em lista
  let vista = lerLocal("vista", "lista") === "semana" ? "semana" : "lista";
  const segVista = ui.segmentado({ opcoes: [{ valor: "lista", rotulo: "Lista" }, { valor: "semana", rotulo: "Semana" }], valor: vista, tipo: "filtro", rotulo: "Como ver as tarefas", classe: "tfp-vista",
    aoMudar: x => { vista = x === "semana" ? "semana" : "lista"; gravar("vista", vista); if (vista === "semana" && !["hoje", "proximas"].includes(aba)) { aba = "hoje"; gravar("aba", aba); marcarAbas(); } carregar(); } });
  // plano 1500c · RC-307: «Baixar CSV» — as tarefas da aba/visão de agora (com «Minhas/Todas») numa planilha que o Excel abre com acentos
  let ultimos = [];
  const btCsv = h("button", { type: "button", class: "bt bt-fant bt-p tfp-csv", disabled: true, title: "Baixar as tarefas desta lista em planilha (CSV)", on: { click: () => {
    const { cabecalho, linhas } = L.csvTarefas(ultimos, { nomeDono: id => (k.usuario && k.usuario(id) || {}).nome || "", agora: Date.now(), rotNegocio: k.v.negocio || "Negócio",
      prazo: iso => `${ui.dataBR ? ui.dataBR(iso) : String(iso).slice(0, 10)}${ui.horaBR ? ` ${ui.horaBR(iso)}` : ""}` });
    try {
      const url = URL.createObjectURL(new Blob([L.gerarCSV(cabecalho, linhas)], { type: "text/csv;charset=utf-8" }));
      const a = h("a", { href: url, download: `tarefas-${aba}-${ui.hojeSP ? ui.hojeSP() : "hoje"}.csv`, hidden: true });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      ui.anunciar(`${linhas.length} ${linhas.length === 1 ? "tarefa baixada" : "tarefas baixadas"} em planilha.`);
    } catch (e) { k.toastErro ? k.toastErro(e) : ui.toast("Não deu para gerar a planilha.", { tipo: "erro" }); }
  } } }, ui.icone("baixar"), h("span", null, "Baixar CSV"));
  const corpo = h("div", { class: "pilha" });
  const novaTarefa = async () => {
    const t = await formTarefa(k, null, {});
    if (t) { ui.toast("Tarefa criada.", { tipo: "ok", ms: 2200 }); carregar(true); }
  };
  // plano 50 (item 28): painel do dia — Hoje / Atrasadas / Próximas com contagem e cor; tocar leva à aba
  const painelNums = { hoje: h("b", { class: "dado" }, "—"), atrasadas: h("b", { class: "dado" }, "—"), proximas: h("b", { class: "dado" }, "—") };
  const painelItem = (id, rotulo) => h("button", { type: "button", class: ["tfp-pn", `tfp-pn-${id}`], "aria-pressed": String(aba === id), dataset: { aba: id },
    on: { click: () => irAba(id) } }, painelNums[id], h("span", null, rotulo));
  const btConcl = h("button", { type: "button", class: "tfp-concl", "aria-pressed": String(aba === "concluidas"), dataset: { aba: "concluidas" }, on: { click: () => irAba("concluidas") } },
    ui.icone("check"), h("span", null, "Concluídas"));
  const painel = h("div", { class: "tfp-painel", role: "group", "aria-label": "Tarefas por situação" },
    painelItem("hoje", "para hoje"), painelItem("atrasadas", "atrasadas"), painelItem("proximas", "nos próximos dias"), btConcl);
  function marcarAbas() {
    for (const b of painel.querySelectorAll("[data-aba]")) b.setAttribute("aria-pressed", String(b.dataset.aba === aba));
  }
  function desenharPainel(c) {
    for (const id of ["hoje", "atrasadas", "proximas"]) {
      const n = Number(c[id]) || 0;
      painelNums[id].textContent = String(n);
      const bt = painelNums[id].parentElement;
      if (bt) { bt.setAttribute("aria-pressed", String(aba === id)); bt.classList.toggle("zero", n === 0); bt.classList.toggle("alerta", id === "atrasadas" && n > 0); }
    }
  }
  el.append(
    ui.cabecalho({ titulo: "Tarefas", acoes: k.pode("atendente") ? h("button", { type: "button", class: "bt bt-prim", on: { click: novaTarefa } }, ui.icone("mais"), "Nova tarefa") : null }),     // plano 1000b · RB-123
    painel,
    h("div", { class: "tfp-fita" }, seg, segVista, btCsv),
    corpo);
  // M28: no celular «+ Tarefa» sai do cabeçalho e vira o botão flutuante
  if (k.pode("atendente")) el.appendChild(h("button", { type: "button", class: "crm-fab", "aria-label": "Nova tarefa", title: "Nova tarefa", on: { click: novaTarefa } },
    ui.icone("mais"), h("span", { class: "crm-fab-txt" }, "Nova tarefa")));
  const ocultas = new Set();   // excluídas esperando os 7 s do Desfazer: uma recarga no meio não pode trazê-las de volta
  /** plano 1000 (CR-246): «Nada para hoje» puxa o próximo trabalho — o atalho «Parados há 7+ dias» do quadro. */
  const vazioDaAba = () => {
    const ng = k.v.min ? k.v.min("negocios") : "oportunidades";
    const fem = !k.v.art || k.v.art("negocio") === "a";
    const paradas = `${fem ? "as" : "os"} ${ng} ${fem ? "paradas" : "parados"}`;
    const titulo = aba === "hoje" ? `Nada para hoje. Que tal revisar ${paradas}?` : VAZIO_T9[aba];
    return ui.vazio({ titulo, tema: "crm", acao: aba === "hoje" && (!ctx.temModulo || ctx.temModulo("crm")) ? { rotulo: `Ver ${paradas.replace(/^(as|os) /, "")}`, fn: () => ctx.navegar("#/crm?parados=7") } : null });
  };

  /** quieto = refaz a lista sem trocar tudo pelo esqueleto (depois de concluir/adiar/desfazer a tela não pisca) */
  async function carregar(quieto = false) {
    const minha = ++seq;
    if (quieto && corpo.firstChild) corpo.setAttribute("aria-busy", "true");
    else { ui.limpar(corpo); corpo.appendChild(ui.esqueleto("lista", 5)); }
    try {
      const semana = vista === "semana" && (aba === "hoje" || aba === "proximas");
      const [r, r2] = await Promise.all([k.api.rpcC("nx_tarefas_listar", { p_filtro: { dono, situacao: semana ? "hoje" : aba } }),
        semana ? k.api.rpcC("nx_tarefas_listar", { p_filtro: { dono, situacao: "proximas" } }) : null]);
      if (minha !== seq) return;
      ultimos = [...((r && r.itens) || []), ...((r2 && r2.itens) || [])].filter(x => !ocultas.has(x.id));      // plano 1500c · RC-307: o que está na tela vai para o CSV
      btCsv.disabled = !ultimos.length;
      if (semana) { desenharSemana(r, r2); return; }
      // as contagens vêm em r.contagens (banco) ou soltas no topo da resposta (servidor fictício): o painel e as abas leem as duas formas
      const c = r.contagens || r || {};
      desenharPainel(c);
      corpo.removeAttribute("aria-busy");
      ui.limpar(corpo);
      const itens = r.itens.filter(t => !ocultas.has(t.id));
      if (!itens.length) { corpo.appendChild(vazioDaAba()); return; }
      // agrupadas por dia de vencimento («Hoje», «Amanhã», «Qui, 09/10»…; concluídas do mais recente para o mais antigo)
      const hoje = hojeISO(ui);
      // plano 1000 (CR-247): «Concluídas» agrupa pelo dia em que foi FEITA (antes pelo vencimento); as outras abas, pelo vencimento
      const grupos = L.agruparPorDia(itens, { instanteDe: t => (aba === "concluidas" ? t.concluida_em || t.vence_em : t.vence_em), diaDe: iso => diaSP(ui, iso), hoje, ordem: aba === "concluidas" ? "desc" : "asc", semData: "Sem prazo" });   // plano 1000 (CR-138)
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
              if (restantes <= 0) { ui.limpar(corpo); corpo.appendChild(vazioDaAba()); }
            } else { if (ev && ev.tarefa) ocultas.delete(ev.tarefa.id); carregar(true); }
          } });
          grupo.appendChild(item);
        }
        lista.appendChild(grupo);
      }
      corpo.appendChild(lista);
      // o servidor devolve no máximo 200: sem isso a lista parecia completa
      // plano 1000b · RB-233: o conselho depende da aba («conclua algumas» não faz sentido em Próximas/Concluídas)
      if (r.tem_mais) corpo.appendChild(h("p", { class: "sub" }, textoTarefasDeMais(aba, r.itens.length, podeTodas && dono === "todos")));
    } catch (e) {
      if (minha !== seq) return;
      corpo.removeAttribute("aria-busy");
      ui.limpar(corpo);
      corpo.appendChild(ui.erroCartao(e, () => carregar()));
    }
  }
  /** CR-244: as 7 colunas da semana (as mesmas linhas de tarefa da lista: concluir, adiar, deslizar e ⋮ continuam). */
  function desenharSemana(r, r2) {
    const c = r.contagens || r || {};
    desenharPainel(c);
    corpo.removeAttribute("aria-busy");
    ui.limpar(corpo);
    const vistos = new Set();
    const itens = [...(r.itens || []), ...((r2 && r2.itens) || [])].filter(t => !ocultas.has(t.id) && !vistos.has(t.id) && vistos.add(t.id));
    const hoje = hojeISO(ui);
    const sem = L.colunasDaSemana(itens, { instanteDe: t => t.vence_em, diaDe: iso => diaSP(ui, iso), hoje });
    // plano 1000b · RB-125: no celular os dias livres viram UMA linha («Livres: qua, qui, sáb») em vez de 7 caixas empilhadas (o CSS esconde as vazias)
    const livres = sem.colunas.filter(col => !col.itens.length && col.dia !== hoje).map(col => L.diaSemanaCurto(col.dia)).filter(Boolean);
    const grade = h("div", { class: "tfp-semana", role: "list", "aria-label": "Tarefas da semana" }, sem.colunas.map(col =>
      h("section", { class: ["tfp-dia", col.dia === hoje && "hoje", !col.itens.length && col.dia !== hoje && "tfp-dia-livre"], role: "listitem", "aria-label": `${col.rotulo}: ${col.itens.length} ${col.itens.length === 1 ? "tarefa" : "tarefas"}` },
        h("h3", { class: "tfp-dia-t" }, h("span", null, col.rotulo), h("span", { class: "tfp-grupo-n dado" }, String(col.itens.length))),
        col.itens.length ? h("div", { class: "at-lista" }, col.itens.map(t => itemTarefa(k, t, { mostrarVinculo: true, aoMudar: ev => {
          // plano 1000: como na Lista — a excluída sai da grade já (e fica fora até o «Desfazer» acabar); o «Desfazer» devolve e recarrega
          if (ev && ev.tipo === "excluida") { ocultas.add(t.id); desenharSemana(r, r2); return; }
          if (ev && ev.tarefa) ocultas.delete(ev.tarefa.id);
          carregar(true);
        } })))
          : h("p", { class: "fraco tfp-dia-vazio" }, "Livre"))));
    if (livres.length) corpo.appendChild(h("p", { class: "sub tfp-livres", "aria-hidden": "true" }, `Livre${livres.length === 1 ? "" : "s"}: ${livres.join(", ")}`));
    corpo.appendChild(grade);
    const notas = [sem.depois ? `+${sem.depois} depois desta semana (em «Próximas», na lista)` : null, sem.semPrazo ? `${sem.semPrazo} sem prazo (na lista)` : null].filter(Boolean);
    // plano 1000b · RB-118: a semana não mostra as atrasadas — a nota diz quantas são, com um atalho para a aba «Atrasadas» (na lista)
    const nAtr = Number(c.atrasadas) || 0;
    const linkAtr = nAtr > 0 ? h("button", { type: "button", class: "link tfp-ver-atrasadas", on: { click: () => {
      vista = "lista"; gravar("vista", vista); segVista.ativar("lista");
      aba = "atrasadas"; gravar("aba", aba); marcarAbas(); carregar();
    } } }, `${nAtr} ${nAtr === 1 ? "atrasada" : "atrasadas"} (na lista)`) : null;
    if (notas.length || linkAtr) corpo.appendChild(h("p", { class: "sub tfp-semana-nota" }, linkAtr, linkAtr && notas.length ? " · " : null, notas.join(" · ") || null));
  }

  await carregar();
  // plano 1000 (CR-140): tarefas criadas por automação ou por um colega aparecem sozinhas — no pulso (no máximo 1× a cada 30 s) e ao voltar
  // para a aba; nunca com um formulário/menu aberto ou um campo em edição
  let ultimaT = Date.now();
  const recarregarQuieto = () => {
    if (document.hidden || Date.now() - ultimaT < 30000) return;
    if (document.querySelector("dialog[open]")) return;
    const a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || "") || (a !== document.body && corpo.contains(a)))) return;   // o foco não pode sumir no meio
    ultimaT = Date.now();
    carregar(true);
  };
  const cancelar = ctx.pulso && typeof ctx.pulso.assinar === "function" ? ctx.pulso.assinar(recarregarQuieto) : null;
  const aoVoltar = () => { if (!document.hidden) recarregarQuieto(); };
  document.addEventListener("visibilitychange", aoVoltar);
  // plano 1000 (CR-156): caiu a internet → os círculos desligam com a dica; voltou → religam (sem recarregar a lista)
  const aoRede = () => varrerChecksRede(corpo);      // plano 1000b · RB-115: a mesma varredura do ouvinte global
  if (typeof addEventListener === "function") { addEventListener("offline", aoRede); addEventListener("online", aoRede); }
  return { desmontar() { seq++; if (cancelar) cancelar(); document.removeEventListener("visibilitychange", aoVoltar);
    if (typeof removeEventListener === "function") { removeEventListener("offline", aoRede); removeEventListener("online", aoRede); } } };
}
