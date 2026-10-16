/* ============================================================
   ÓRBITA — crm-config.js · frente F4 · seções CRM da T14 (#/config/<id>)
   secoesConfig (§7.2): funis (Funis e etapas), campos (Campos
   personalizados), etiquetas, motivos (Motivos de perda).
   O hub config.js carrega este arquivo (import dinâmico com ?v=) e chama
   montar(ctx, alvo). A base do CRM vem do MESMO crm.js do roteador
   (ctx.carregar('crm').kit(ctx)) e é recarregada depois de cada mudança,
   para o quadro, a gaveta e as listas verem o catálogo novo.
   ============================================================ */

async function kitDe(ctx) {
  ctx.ui.carregarCss("crm");
  const crm = await ctx.carregar("crm");
  if (!crm || typeof crm.kit !== "function") throw Object.assign(new Error("modulo_indisponivel"), { codigo: "modulo_indisponivel" });
  return crm.kit(ctx);
}

export const secoesConfig = [
  { id: "funis", titulo: "Funis e etapas", desc: "As etapas por onde cada venda passa", grupo: "CRM", papelMin: "admin", modulo: "crm", icone: "funil", montar: secaoFunis },
  { id: "campos", titulo: "Campos personalizados", desc: "Dados extras do cadastro e da venda", grupo: "CRM", papelMin: "admin", modulo: "crm", icone: "editar", montar: secaoCampos },
  { id: "etiquetas", titulo: "Etiquetas", desc: "Marcas coloridas para achar depois", grupo: "CRM", papelMin: "supervisor", modulo: "crm", icone: "etiqueta", montar: secaoEtiquetas },
  { id: "motivos", titulo: "Motivos de perda", desc: "Por que uma venda não fechou", grupo: "CRM", papelMin: "admin", modulo: "crm", icone: "alerta", montar: secaoMotivos },
];

/* ------------------------------------------------------------ peças comuns */
function cartao(k, { titulo, sub, acoes }, ...conteudo) {
  const { h } = k;
  return h("section", { class: "cartao crm-cfg-crm" },
    h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, titulo), sub ? h("p", { class: "sub" }, sub) : null),
      acoes ? h("div", { class: "linha" }, acoes) : null),
    ...conteudo);
}
const btn = (k, rotulo, { tipo = "sec", icone, fn, p = false, rotuloAria, desabilitado } = {}) => k.h("button",
  { type: "button", class: ["bt", tipo === "prim" ? "bt-prim" : tipo === "fant" ? "bt-fant" : tipo === "perigo" ? "bt-perigo" : "bt-sec", p && "bt-p"],
    "aria-label": rotuloAria || null, disabled: !!desabilitado, on: { click: fn } }, icone ? k.ui.icone(icone) : null, rotulo);
const btIcone = (k, icone, rotulo, fn, extra = {}) => k.h("button", { type: "button", class: ["bt-icone", extra.class], "aria-label": rotulo, title: rotulo, disabled: !!extra.desabilitado, on: { click: fn } }, k.ui.icone(icone));

/**
 * plano 1000b · RB-142: enquanto a nova ordem grava, os botões Subir/Descer da lista ficam desligados e cliques em voo são ignorados
 * (dois cliques seguidos gravavam ordens intercaladas). `trava` = {ocupado}; `corpo` = a lista na tela.
 */
async function comOrdemTravada(trava, corpo, fn) {
  if (trava.ocupado) return false;
  trava.ocupado = true;
  // revisão 1000b · RB-142: NodeList não tem .map — com o NodeList do navegador o «antes» saía vazio e o finally religava
  // botões que estavam desligados de propósito (Subir no 1º, Descer no último). Array de verdade.
  const bts = corpo && corpo.querySelectorAll ? [...corpo.querySelectorAll("button.crm-cfg-ordem")] : [];
  const antes = bts.map(b => b.disabled);
  for (const b of bts) b.disabled = true;
  if (corpo && corpo.setAttribute) corpo.setAttribute("aria-busy", "true");
  try { await fn(); return true; }
  finally {
    trava.ocupado = false;
    if (corpo && corpo.removeAttribute) corpo.removeAttribute("aria-busy");
    bts.forEach((b, i) => { if (b.isConnected !== false) b.disabled = antes[i]; });   // a lista redesenhada já nasce com o estado certo
  }
}
/** Reordena uma lista (campos, motivos) gravando ordem = posição só nos itens que mudaram. */
async function gravarOrdem(k, lista, rpc, chaveParam) {
  for (const [i, it] of lista.entries()) {
    if (it.ordem === i + 1) continue;
    await k.api.rpcC(rpc, { [chaveParam]: { id: it.id, ordem: i + 1 } });
    it.ordem = i + 1;
  }
}

/* ============================================================
   FUNIS E ETAPAS
   ============================================================ */
async function secaoFunis(ctx, alvo) {
  const k = await kitDe(ctx);
  const { ui, h, L } = k;
  let vivo = true;

  async function contagens(funilId) {
    try {
      const r = await k.api.rpcC("nx_negocios_kanban", { p_funil: funilId, p_filtro: { fechados_dias: 0 }, p_por_coluna: 1 });
      return Object.fromEntries((r.colunas || []).map(c => [c.estagio_id, c.total || 0]));
    } catch { return null; }
  }

  // plano 1000b · RB-138: «as oportunidades continuam guardadas» — o termo e o gênero da vertical (antes «os negócios» fixo)
  const fem = () => !!(k.v && typeof k.v.art === "function" && k.v.art("negocio") === "a");
  const osNeg = () => `${fem() ? "as" : "os"} ${k.v ? k.v.min("negocios") : "negócios"}`;
  const guardados = () => `${osNeg()} continuam guardad${fem() ? "a" : "o"}s`;
  /** plano 1000b · RB-148: desativar tira o funil do quadro de TODA a equipe — pede confirmação (ativar não precisa). */
  async function ativarOuDesativar(f) {
    if (f.ativo !== false) {
      const ok = await ui.confirmar({ titulo: `Desativar «${f.nome}»?`, texto: `Ele some do quadro de toda a equipe; ${guardados()}.`, rotulo: "Desativar" });
      if (!ok) return;
    }
    return alterar(f, { ativo: f.ativo === false }, f.ativo === false ? "Funil ativado." : `Funil desativado: some do quadro, ${guardados()}.`);
  }

  function lista() {
    if (!vivo) return;
    ui.limpar(alvo);
    const funis = k.base.funis.slice().sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome, "pt-BR"));
    const itens = h("div", { class: "crm-cfg-lista", role: "list" }, funis.map(f => {
      const menuBt = btIcone(k, "opcoes", `Mais ações para ${f.nome}`, () => ui.menu(menuBt, [
        // plano 1000 (CR-133): «Duplicar» abre o editor com as mesmas etapas (sem padrão e fora dos anúncios) — vale também para o funil padrão
        { rotulo: "Duplicar", icone: "copiar", fn: () => editor(null, { copiaDe: f }) },
        !f.padrao ? "-" : null,
        // plano 1000b · RB-147: nos funis que não podem ser padrão o item aparece desligado e diz por quê (antes sumia sem pista)
        !f.padrao ? (f.conta_no_ads && f.ativo !== false
          ? { rotulo: "Tornar padrão", icone: "check", fn: () => alterar(f, { padrao: true }, "Agora as conversas novas entram neste funil.") }
          : { rotulo: "Tornar padrão", icone: "check", desabilitado: true, motivo: f.ativo === false ? "(só funis ativos que contam nos anúncios)" : "(só funis que contam nos anúncios)" }) : null,
        !f.padrao ? { rotulo: f.ativo === false ? "Ativar" : "Desativar", icone: f.ativo === false ? "check" : "relogio",
          fn: () => ativarOuDesativar(f) } : null,      // plano 1000b · RB-148/138
        !f.padrao ? "-" : null,
        !f.padrao ? { rotulo: "Excluir", icone: "lixeira", perigo: true, fn: () => excluir(f) } : null,
      ].filter(Boolean)));
      return h("div", { class: ["crm-cfg-item", "crm-cfg-funil", f.ativo === false && "inativo"], role: "listitem" },
        h("i", { class: "bola", style: k.cor((f.estagios[0] || {}).cor) ? { "--cor": k.cor(f.estagios[0].cor) } : null }),
        h("span", null,
          h("b", null, f.nome),
          h("small", null, `${f.estagios.length} etapa${f.estagios.length === 1 ? "" : "s"}${f.ativo === false ? " · desativado" : ""}`),
          h("span", { class: "crm-cfg-etapas", "aria-hidden": "true" }, f.estagios.map(e => h("span", { class: ["crm-cfg-etapa", e.tipo !== "aberto" && `t-${e.tipo}`], style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null }, e.nome)))),
        h("span", { class: "crm-cfg-selos" },
          f.padrao ? ui.pilula("Padrão", "prim", { title: "Recebe as conversas novas do WhatsApp" }) : null,
          // plano 1000 (CR-071): o mesmo nome e a mesma dica da gaveta do negócio
          f.conta_no_ads ? ui.pilula("Conta nos anúncios", "meta", { title: "Este funil entra nos números de Anúncios" }) : ui.pilula("Fora dos anúncios", "neutra")),
        btn(k, "Editar", { p: true, fn: () => editor(f), rotuloAria: `Editar o funil ${f.nome}` }), menuBt);
    }));
    alvo.append(cartao(k, {
      titulo: "Funis",
      sub: "O funil padrão recebe as conversas novas do WhatsApp. Funis que contam nos anúncios alimentam o retorno do painel de Anúncios; o pós-venda fica fora deles.",
      acoes: btn(k, "Funil", { tipo: "prim", icone: "mais", fn: () => editor(null) }),
    }, itens));
  }

  async function alterar(f, mudanca, ok) {
    try {
      await k.api.rpcC("nx_funil_salvar", { p_funil: { id: f.id, ...mudanca } });
      await k.recarregarBase();
      ui.toast(ok, { tipo: "ok" });
      lista();
    } catch (e) { ui.toast(k.erro(e), { tipo: "erro", ms: 7000 }); }
  }

  async function excluir(f) {
    const cont = await contagens(f.id);
    // plano 1000 (CR-291): sem a contagem (rede/servidor) não dá para saber se há negócios a mover — nada de «excluir» às cegas
    if (cont === null) { ui.toast(`Não consegui contar ${k.v.art("negocio")}s ${k.v.min("negocios")} deste funil agora. Tente excluir de novo em instantes.`, { tipo: "erro", ms: 7000 }); return; }
    const n = Object.values(cont).reduce((s, x) => s + x, 0);
    let destino = null;
    if (n) {
      const outros = k.base.funis.filter(x => x.id !== f.id && x.ativo !== false && !!x.conta_no_ads === !!f.conta_no_ads);
      if (!outros.length) {
        await ui.modal({ titulo: `Excluir «${f.nome}»`, largura: "p", corpo: h("p", null,
          `Este funil tem ${n} ${k.v.min(n === 1 ? "negocio" : "negocios")} e não há outro funil ${f.conta_no_ads ? "que conte nos anúncios" : "fora dos anúncios"} para recebê-${n === 1 ? `l${k.v.art("negocio")}` : `l${k.v.art("negocio")}s`}. Crie um antes, ou desative este funil (${k.v.art("negocio")}s ${k.v.min("negocios")} ficam guardad${k.v.art("negocio")}s).`) });
        return;
      }
      const sel = h("select", { class: "sel", "aria-label": "Etapa de destino" }, outros.map(o => h("optgroup", { label: o.nome },
        o.estagios.filter(e => e.tipo === "aberto").map(e => h("option", { value: e.id }, e.nome)))));
      destino = await ui.modal({ titulo: `Excluir «${f.nome}»`, largura: "p",
        corpo: h("div", { class: "pilha" },
          h("p", null, `Este funil tem ${n} ${k.v.min(n === 1 ? "negocio" : "negocios")}. ${k.v.art("negocio").toUpperCase()}s abert${k.v.art("negocio")}s vão para a etapa escolhida; ${k.v.art("negocio")}s ganh${k.v.art("negocio")}s e perdid${k.v.art("negocio")}s vão para as etapas de ganho e de perda do mesmo funil de destino.`),
          h("label", { class: "pilha-p" }, h("span", { class: "rotulo" }, "Mover para"), sel)),
        acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: null }, { rotulo: "Mover e excluir", tipo: "perigo", fn: () => sel.value || false }] });
      if (!destino) return;
    } else if (!(await ui.confirmar({ titulo: `Excluir «${f.nome}»?`, texto: "O funil e as etapas somem. Automações que usavam este funil deixam de funcionar.", perigo: true }))) return;
    try {
      let r, voltas = 0;
      do {
        r = await k.api.rpcC("nx_funil_excluir", { p_id: f.id, p_mover_para: destino });
        if (!r.excluido && r.restantes) ui.anunciar(`Movendo ${k.v.min("negocios")}… faltam ${r.restantes}.`);
      } while (!r.excluido && ++voltas < 400 && vivo);
      await k.recarregarBase();
      // sem sucesso falso: se parou no meio (saiu da tela), o funil ainda existe
      if (r.excluido) ui.toast("Funil excluído.", { tipo: "ok" });
      else ui.toast(`A exclusão parou no meio: ainda faltam ${r.restantes || "alguns"} ${k.v.min("negocios")} para mover. O funil continua lá — mande excluir de novo para terminar.`, { tipo: "info", ms: 9000 });
      lista();
    } catch (e) {
      ui.toast(k.erro(e), { tipo: "erro", ms: 8000 });
      await k.recarregarBase().catch(() => {});
      lista();
    }
  }

  /* ------------------------------------------------------------ editor */
  async function editor(original, { copiaDe = null } = {}) {
    ui.limpar(alvo);
    alvo.appendChild(ui.esqueleto("lista", 5));
    const cont = original ? await contagens(original.id) : {};
    if (!vivo) return;
    const paleta = ctx.paleta || [];
    const cor = i => k.cor(paleta[i % (paleta.length || 1)]) || null;
    // plano 1000b · RB-135: a contagem falhou (cont = null) → trata como «tem negócios»: tipo, marco e anúncios ficam travados, com aviso no topo
    const semContagem = !!original && cont === null;
    const temNegocios = semContagem || !!(cont && Object.values(cont).some(x => x > 0));
    const travada = e => !!(e.id && (e._n || semContagem));
    const f = original
      ? { id: original.id, nome: original.nome, conta_no_ads: !!original.conta_no_ads, ativo: original.ativo !== false, padrao: !!original.padrao }
      : { nome: copiaDe ? `${copiaDe.nome} (cópia)`.slice(0, 60) : "", conta_no_ads: false, ativo: true };
    let etapas = original
      ? original.estagios.map(e => ({ id: e.id, nome: e.nome, tipo: e.tipo, marco: e.marco, cor: e.cor, probabilidade: e.probabilidade, sla_horas: e.sla_horas, _n: cont ? cont[e.id] || 0 : null }))
      : copiaDe ? (copiaDe.estagios || []).map(e => ({ nome: e.nome, tipo: e.tipo, marco: null, cor: e.cor, probabilidade: e.probabilidade ?? L.probPadrao(e.tipo), sla_horas: e.sla_horas ?? null, _n: 0 }))
      : [["Novo", "aberto"], ["Em andamento", "aberto"], ["Ganho", "ganho"], ["Perdido", "perdido"]].map(([nome, tipo], i) => ({ nome, tipo, marco: null, cor: cor(i), probabilidade: L.probPadrao(tipo), sla_horas: null, _n: 0 }));
    const mover = {};              // etapa removida → destino
    const removidas = [];          // para "desfazer"
    let seq = 0;
    for (const e of etapas) e._k = ++seq;
    // plano 1000b · RB-145: «Voltar»/«Cancelar» com mudanças (etapa renomeada, removida, nome do funil…) perguntam antes de descartar
    const assinatura = () => { try { return JSON.stringify(L.payloadFunil(f, etapas, mover)); } catch { return ""; } };
    const assinaturaInicial = assinatura();
    async function sair() {
      if (assinatura() !== assinaturaInicial
        && !(await ui.confirmar({ titulo: "Sair sem salvar?", texto: "As mudanças neste funil vão ser perdidas.", rotulo: "Sair sem salvar", perigo: true }))) return;
      lista();
    }

    const nome = ui.campo({ rotulo: "Nome do funil", nome: "nome", valor: f.nome, obrigatorio: true, max: 60, placeholder: "Ex.: Pós-tratamento" });
    nome.querySelector("input").addEventListener("input", ev => { f.nome = ev.target.value; });
    const ads = ui.campo({ tipo: "interruptor", nome: "conta_no_ads", rotulo: "Conta nos anúncios", valor: f.conta_no_ads, desabilitado: temNegocios || f.padrao,
      ajuda: f.padrao ? "O funil padrão sempre conta nos anúncios." : temNegocios ? "Só dá para mudar com o funil vazio (os números dos anúncios não podem mudar de lado)."
        : "Liga as etapas ao retorno do painel de Anúncios: cada etapa ganha um marco (Nova conversa, Agendou, Fechou…)." });
    ads.querySelector("input").addEventListener("change", ev => {
      f.conta_no_ads = ev.target.checked;
      if (f.conta_no_ads) for (const e of etapas) if (!e.marco || !L.marcosDoTipo(e.tipo).some(m => m.id === e.marco)) e.marco = sugerirMarco(e);
      desenharEtapas();
    });
    const ativo = ui.campo({ tipo: "interruptor", nome: "ativo", rotulo: "Ativo", valor: f.ativo, desabilitado: f.padrao,
      ajuda: f.padrao ? "O funil padrão fica sempre ativo." : `Desativado, some do quadro; ${guardados()}.` });      // plano 1000b · RB-138
    ativo.querySelector("input").addEventListener("change", ev => { f.ativo = ev.target.checked; });

    const listaEl = h("div", { class: ["fe-etapas", !f.conta_no_ads && "sem-marco"], role: "list", "aria-label": "Etapas do funil" });
    const cab = h("div", { class: ["fe-cab", !f.conta_no_ads && "sem-marco"], "aria-hidden": "true" },
      h("span"), h("span"), h("span", null, "Etapa"), h("span", null, "Tipo"), h("span", { class: "fe-marco-cab" }, "Marco (anúncios)"), h("span", null, "Chance"), h("span", null, "Prazo"), h("span"));
    const notaMover = h("div", { class: "fe-mover", hidden: true });
    // C8: funil dos anúncios sem etapa para um marco que o Órbita usa sozinho (Ganho/Perdido/Faltou/Agendou) — aviso inline, não bloqueia salvar
    const avisoMarcos = h("p", { class: "aviso aviso-aten fe-marcos", role: "status", "aria-live": "polite", hidden: true });
    function atualizarMarcos() {
      const txt = L.textoMarcosFaltando(L.marcosFaltando(f, etapas));
      ui.limpar(avisoMarcos);
      avisoMarcos.hidden = !txt;
      if (txt) avisoMarcos.append(ui.icone("alerta"), h("span", null, txt));
    }
    const erros = h("div", { class: "aviso aviso-ruim", role: "alert", hidden: true });
    const btSalvar = btn(k, "Salvar funil", { tipo: "prim", fn: () => salvar() });

    function sugerirMarco(e) {
      const usados = new Set(etapas.filter(x => x !== e).map(x => x.marco));
      const ops = L.marcosDoTipo(e.tipo);
      return (ops.find(m => !usados.has(m.id)) || ops[0] || {}).id || null;
    }

    function desenharEtapas(focar) {
      ui.limpar(listaEl);
      listaEl.classList.toggle("sem-marco", !f.conta_no_ads);
      cab.classList.toggle("sem-marco", !f.conta_no_ads);
      etapas.forEach((e, i) => listaEl.appendChild(linhaEtapa(e, i)));
      desenharMover();
      atualizarMarcos();
      if (focar) {
        const alvoFoco = listaEl.querySelector(`[data-k="${focar.k}"] ${focar.sel}`);
        if (alvoFoco) try { alvoFoco.focus(); } catch { /* ok */ }
      }
    }

    function linhaEtapa(e, i) {
      const linha = h("div", { class: "fe-etapa", role: "listitem", dataset: { k: e._k }, style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null });
      const alca = h("button", { type: "button", class: "fe-alca", "aria-label": `Mover a etapa ${e.nome || i + 1} (setas para cima e para baixo)`, title: "Arraste ou use as setas" }, ui.icone("arrastar"));
      alca.addEventListener("keydown", ev => {
        const d = ev.key === "ArrowUp" ? -1 : ev.key === "ArrowDown" ? 1 : 0;
        if (!d) return;
        ev.preventDefault();
        const j = i + d;
        if (j < 0 || j >= etapas.length) return;
        etapas = L.moverItem(etapas, i, j);
        desenharEtapas({ k: e._k, sel: ".fe-alca" });
        ui.anunciar(`Etapa ${e.nome || ""} na posição ${j + 1} de ${etapas.length}.`);
      });
      alca.addEventListener("pointerdown", ev => arrastar(ev, linha, e));
      // plano 1000b · RB-144: o rótulo diz a cor escolhida («Cor da etapa Nova:» + o código da cor) e muda junto
      const rotuloCor = () => `Cor da etapa ${e.nome || i + 1}: ${e.cor ? String(e.cor).toUpperCase() : "sem cor"}`;
      const corBt = h("button", { type: "button", class: "fe-cor", "aria-label": rotuloCor() });
      corBt.addEventListener("click", () => {
        const sc = ui.seletorCor({ valor: e.cor, paleta: ctx.paleta, rotulo: `Cor da etapa ${e.nome}`, aoMudar: c => { e.cor = c; linha.style.setProperty("--cor", c); corBt.setAttribute("aria-label", rotuloCor()); } });
        ui.flutuante(corBt, h("div", { class: "pilha-p" }, h("p", { class: "rotulo" }, "Cor da etapa"), sc), { largura: 248 });
      });
      const nomeIn = h("input", { type: "text", value: e.nome || "", maxlength: 40, "aria-label": `Nome da etapa ${i + 1}`, placeholder: "Nome da etapa", class: "fe-nome" });
      nomeIn.addEventListener("input", () => { e.nome = nomeIn.value; });
      const tipoSel = h("select", { class: "fe-tipo", "aria-label": `Tipo da etapa ${e.nome || i + 1}`, disabled: travada(e) },
        Object.entries(L.TIPOS_ETAPA).map(([v, t]) => h("option", { value: v, selected: v === e.tipo }, t)));
      if (travada(e)) tipoSel.title = `Etapa com ${k.v ? k.v.min("negocios") : "negócios"} não muda de tipo`;      // plano 1000b · RB-138
      tipoSel.addEventListener("change", () => {
        const antes = e.tipo;
        e.tipo = tipoSel.value;
        if (e.probabilidade === L.probPadrao(antes) || e.probabilidade === null || e.probabilidade === "") e.probabilidade = L.probPadrao(e.tipo);
        if (f.conta_no_ads && !L.marcosDoTipo(e.tipo).some(m => m.id === e.marco)) e.marco = sugerirMarco(e);
        desenharEtapas({ k: e._k, sel: ".fe-tipo" });
      });
      const marcoSel = h("select", { class: "fe-marco", "aria-label": `Marco da etapa ${e.nome || i + 1}`, disabled: !f.conta_no_ads || travada(e) },
        f.conta_no_ads ? [h("option", { value: "" }, "Escolha…"), ...L.marcosDoTipo(e.tipo).map(m => h("option", { value: m.id, selected: m.id === e.marco }, m.rotulo))]
          : [h("option", { value: "" }, "—")]);
      if (travada(e) && f.conta_no_ads) marcoSel.title = `Etapa com ${k.v ? k.v.min("negocios") : "negócios"} não muda de marco`;      // plano 1000b · RB-138
      marcoSel.addEventListener("change", () => { e.marco = marcoSel.value || null; atualizarMarcos(); });
      const prob = h("input", { type: "number", class: "fe-prob", min: 0, max: 100, step: 1, value: e.probabilidade ?? "", inputmode: "numeric", "aria-label": `Chance de fechar (%) da etapa ${e.nome || i + 1}` });
      prob.addEventListener("input", () => { e.probabilidade = prob.value === "" ? null : Number(prob.value); });
      // plano 1000 (CR-132): prazo em horas OU dias (o dono pensa em dias) — grava sempre sla_horas (3 dias → 72)
      if (!e._slaUn) e._slaUn = L.unidadeSla(e.sla_horas);
      const maxSla = () => (e._slaUn === "d" ? 90 : 2160);
      const slaN = h("input", { type: "number", class: "fe-sla-n", min: 1, max: maxSla(), step: 1, value: L.valorSla(e.sla_horas, e._slaUn), placeholder: "prazo", inputmode: "numeric",
        "aria-label": `Prazo na etapa ${e.nome || i + 1}, em ${e._slaUn === "d" ? "dias" : "horas"} (o cartão fica âmbar depois dele)` });
      const slaUn = h("select", { class: "fe-sla-un", "aria-label": `Unidade do prazo da etapa ${e.nome || i + 1}` },
        h("option", { value: "h", selected: e._slaUn === "h" }, "horas"), h("option", { value: "d", selected: e._slaUn === "d" }, "dias"));
      const lerSla = () => { e.sla_horas = L.horasSla(slaN.value, e._slaUn); };
      slaN.addEventListener("input", lerSla);
      slaUn.addEventListener("change", () => {
        e._slaUn = slaUn.value === "d" ? "d" : "h";
        slaN.setAttribute("max", String(maxSla()));
        slaN.setAttribute("aria-label", `Prazo na etapa ${e.nome || i + 1}, em ${e._slaUn === "d" ? "dias" : "horas"} (o cartão fica âmbar depois dele)`);
        lerSla();
      });
      const sla = h("div", { class: "fe-sla" }, slaN, slaUn);
      const rem = btIcone(k, "lixeira", `Remover a etapa ${e.nome || i + 1}`, () => remover(e), { class: "fe-rem", desabilitado: etapas.length <= 1 });
      linha.append(alca, corBt,
        h("div", { class: "fe-nome-cel" }, nomeIn, e._n ? h("small", { class: "fe-n" }, `${e._n} ${k.v.min(e._n === 1 ? "negocio" : "negocios")}`) : null),
        tipoSel, marcoSel,
        h("div", { class: "fe-num" }, prob, h("span", { "aria-hidden": "true" }, "%")),
        sla, rem);
      return linha;
    }

    function arrastar(ev, linha, e) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      linha.classList.add("arrastando");
      const aoMover = m => {
        const outras = [...listaEl.children].filter(x => x !== linha);
        let antesDe = null;
        for (const o of outras) { const r = o.getBoundingClientRect(); if (m.clientY < r.top + r.height / 2) { antesDe = o; break; } }
        if (antesDe) { if (linha.nextSibling !== antesDe) listaEl.insertBefore(linha, antesDe); }
        else if (listaEl.lastChild !== linha) listaEl.appendChild(linha);
      };
      const fim = () => {
        removeEventListener("pointermove", aoMover);
        removeEventListener("pointerup", fim);
        removeEventListener("pointercancel", fim);
        linha.classList.remove("arrastando");
        const ordem = [...listaEl.children].map(x => Number(x.dataset.k));
        const nova = ordem.map(kk => etapas.find(x => x._k === kk)).filter(Boolean);
        const mudou = nova.some((x, i) => x !== etapas[i]);
        etapas = nova;
        desenharEtapas({ k: e._k, sel: ".fe-alca" });
        if (mudou) ui.anunciar(`Etapa ${e.nome || ""} na posição ${etapas.indexOf(e) + 1} de ${etapas.length}.`);
      };
      addEventListener("pointermove", aoMover);
      addEventListener("pointerup", fim);
      addEventListener("pointercancel", fim);
    }

    async function remover(e) {
      // etapa que já ia RECEBER os negócios de outra removida também precisa de destino (senão o servidor recusa)
      const recebe = e.id ? L.quemVaiPara(mover, e.id) : [];
      const nVem = recebe.reduce((s, id) => s + ((removidas.find(r => r.e.id === id) || { e: {} }).e._n || 0), 0);
      const n = (e._n || 0) + nVem;
      if (e.id && n) {
        const opcoes = L.destinosPara(e, etapas);
        const nomes = recebe.map(id => `«${(removidas.find(r => r.e.id === id) || { e: {} }).e.nome || "?"}»`).join(", ");
        if (!opcoes.length) {
          await ui.modal({ titulo: `Remover «${e.nome}»`, largura: "p", corpo: h("p", null,
            `${nVem ? `Esta etapa vai receber ${k.v.min("negocios")} de ${nomes}` : `Esta etapa tem ${n} ${k.v.min(n === 1 ? "negocio" : "negocios")}`} e não há outra etapa ${L.TIPOS_ETAPA[e.tipo].toLowerCase()} salva para recebê-${n === 1 ? `l${k.v.art("negocio")}` : `l${k.v.art("negocio")}s`}. Crie a etapa, salve o funil e depois remova esta.`) });
          return;
        }
        const sel = h("select", { class: "sel", "aria-label": "Etapa de destino" }, opcoes.map(o => h("option", { value: o.id }, o.nome)));
        const dest = await ui.modal({ titulo: `Remover «${e.nome}»`, largura: "p",
          corpo: h("div", { class: "pilha" }, h("p", null, `Para onde ${n === 1 ? `vai ${k.v.art("negocio")} ${k.v.min("negocio")}` : `vão ${k.v.art("negocio")}s ${n} ${k.v.min("negocios")}`} ${nVem ? `(desta etapa e de ${nomes})` : "desta etapa"}?`),
            h("label", { class: "pilha-p" }, h("span", { class: "rotulo" }, "Mover para"), sel),
            h("p", { class: "sub" }, "A mudança só acontece quando você salvar o funil.")),
          acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: null }, { rotulo: "Remover etapa", tipo: "perigo", fn: () => sel.value || false }] });
        if (!dest) return;
        const novo = L.repontarMover(mover, e.id, dest, !!e._n);
        for (const kk of Object.keys(mover)) delete mover[kk];
        Object.assign(mover, novo);
      }
      const i = etapas.indexOf(e);
      etapas = etapas.filter(x => x !== e);
      removidas.push({ e, i });
      desenharEtapas();
      ui.anunciar(`Etapa ${e.nome || ""} removida. Ela só sai de verdade quando você salvar.`);
    }

    function desenharMover() {
      ui.limpar(notaMover);
      notaMover.hidden = !removidas.length;
      if (!removidas.length) return;
      notaMover.append(h("p", { class: "rotulo" }, "Ao salvar"), h("ul", null, removidas.map((r, n) => {
        const dest = r.e.id && mover[r.e.id] ? etapas.find(x => x.id === mover[r.e.id]) : null;
        return h("li", null,
          h("span", null, r.e.id && r.e._n ? `«${r.e.nome}» sai; ${r.e._n} ${k.v.min(r.e._n === 1 ? "negocio" : "negocios")} ${r.e._n === 1 ? "vai" : "vão"} para «${dest ? dest.nome : "?"}».` : `«${r.e.nome || "Etapa nova"}» sai.`),
          btn(k, "Desfazer", { tipo: "fant", p: true, fn: () => {
            removidas.splice(n, 1);
            if (r.e.id) delete mover[r.e.id];
            etapas.splice(Math.min(r.i, etapas.length), 0, r.e);
            desenharEtapas({ k: r.e._k, sel: ".fe-nome" });
          } }));
      })));
    }

    function novaEtapa() {
      const i = etapas.findIndex(e => e.tipo !== "aberto");
      const pos = i < 0 ? etapas.length : i;
      // plano 1000b · RB-242: a chance sugerida acompanha a posição (entre a aberta anterior e o fechamento), não 10% fixo
      const e = { nome: "", tipo: "aberto", marco: null, cor: cor(etapas.length + removidas.length), probabilidade: L.probNovaEtapa(etapas, pos), sla_horas: null, _n: 0, _k: ++seq };
      if (f.conta_no_ads) e.marco = sugerirMarco(e);
      etapas.splice(pos, 0, e);
      desenharEtapas({ k: e._k, sel: ".fe-nome" });
    }

    function mostrarErros(lista) {
      ui.limpar(erros);
      erros.hidden = !lista.length;
      for (const x of listaEl.querySelectorAll("[aria-invalid]")) x.removeAttribute("aria-invalid");
      if (!lista.length) return;
      const textos = [...new Set(lista.map(x => x.indice !== null && x.indice !== undefined ? `Etapa ${x.indice + 1}: ${x.texto}` : x.texto))];
      erros.append(ui.icone("alerta"), h("div", null, textos.map(t => h("p", null, t))));
      const sel = { nome: ".fe-nome", tipo: ".fe-tipo", marco: ".fe-marco", probabilidade: ".fe-prob", sla_horas: ".fe-sla-n" };
      for (const x of lista) {
        if (x.indice === null || x.indice === undefined) { if (x.campo === "nome") nome.querySelector("input").setAttribute("aria-invalid", "true"); continue; }
        const el = listaEl.children[x.indice] && listaEl.children[x.indice].querySelector(sel[x.campo] || ".fe-nome");
        if (el) el.setAttribute("aria-invalid", "true");
      }
      const primeiro = alvo.querySelector("[aria-invalid='true']");
      if (primeiro) try { primeiro.focus(); } catch { /* ok */ }
    }

    async function salvar() {
      const estado = { ...f, estagios: etapas };
      const errosLocais = L.validarFunil(estado, { outros: (k.base && k.base.funis) || [] });   // plano 1000b · RB-146: nome de outro funil
      mostrarErros(errosLocais);
      if (errosLocais.length) return;
      btSalvar.setAttribute("aria-busy", "true"); btSalvar.disabled = true;
      try {
        let p = L.payloadFunil(f, etapas, mover);
        let r = await k.api.rpcC("nx_funil_salvar", { p_funil: p });
        const saem = new Set(Object.keys(mover));
        let voltas = 0;
        while (r && r.restantes > 0 && vivo && ++voltas < 400) {
          ui.anunciar(`Movendo ${k.v.min("negocios")}… faltam ${r.restantes}.`);
          const etapasSalvas = (r.estagios || []).filter(e => !saem.has(e.id));
          p = L.payloadFunil({ ...f, id: r.id }, etapasSalvas, mover);
          r = await k.api.rpcC("nx_funil_salvar", { p_funil: p });
        }
        await k.recarregarBase();
        if (r && r.restantes > 0) {
          // parou no meio (saiu da tela): as etapas removidas que ainda têm negócios continuam no funil
          ui.toast(`Funil salvo, mas ainda faltam ${r.restantes} ${k.v.min(r.restantes === 1 ? "negocio" : "negocios")} para mover. Abra o funil e remova a etapa de novo para terminar.`, { tipo: "info", ms: 9000 });
        } else ui.toast(original ? "Funil salvo." : "Funil criado.", { tipo: "ok" });
        lista();
      } catch (e) {
        mostrarErros([{ indice: null, campo: null, texto: k.erro(e) }]);
      } finally {
        btSalvar.removeAttribute("aria-busy"); btSalvar.disabled = false;
      }
    }

    ui.limpar(alvo);
    alvo.append(cartao(k, {
      titulo: original ? `Editar «${original.nome}»` : copiaDe ? `Cópia de «${copiaDe.nome}»` : "Novo funil",
            // plano 1000b · RB-138: o termo da vertical («as oportunidades fechadas»)
      sub: `Arraste as etapas pela alça (ou use as setas) para mudar a ordem. As de ganho e perda recebem ${osNeg()} fechad${fem() ? "a" : "o"}s.`,
      acoes: btn(k, "Voltar", { tipo: "fant", icone: "seta-esq", fn: () => sair() }),      // plano 1000b · RB-145
    },
    // plano 1000b · RB-241: a cópia nasce fora dos anúncios e não é o padrão — dito no topo do editor
    copiaDe && !original ? h("p", { class: "aviso aviso-aten fe-nota-copia", role: "note" }, ui.icone("info"),
      h("span", null, "Esta cópia nasce fora dos anúncios e não é o funil padrão. Ligue «Conta nos anúncios» se precisar.")) : null,
    semContagem ? h("p", { class: "aviso aviso-aten fe-sem-contagem", role: "status" }, ui.icone("alerta"),
      h("span", null, `Não deu para contar ${k.v.art("negocio")}s ${k.v.min("negocios")} deste funil agora. Tipo, marco e «Conta nos anúncios» ficam travados; o resto dá para editar.`)) : null,
    h("div", { class: "fe-props" }, nome, h("div", { class: "fe-switches" }, ads, ativo)),
    h("div", { class: "fe-bloco" }, h("div", { class: "fe-tit" }, h("h3", null, "Etapas"), h("small", { class: "sub" }, "De 1 a 25. O cartão fica âmbar depois do prazo.")), cab, listaEl,
      h("div", { class: "linha" }, btn(k, "Etapa", { icone: "mais", fn: novaEtapa })), avisoMarcos),
    notaMover, erros,
    h("div", { class: "fe-rod" }, btn(k, "Cancelar", { tipo: "sec", fn: () => sair() }), btSalvar)));      // plano 1000b · RB-145
    desenharEtapas();
    try { nome.querySelector("input").focus(); } catch { /* ok */ }
  }

  lista();
  return () => { vivo = false; };
}

/* ============================================================
   CAMPOS PERSONALIZADOS
   ============================================================ */
async function secaoCampos(ctx, alvo) {
  const k = await kitDe(ctx);
  const { ui, h, L } = k;
  let ent = "contato";
  let vivo = true;
  const ENTS = [{ id: "contato", rotulo: k.v.contato }, { id: "negocio", rotulo: k.v.negocio }, { id: "empresa", rotulo: "Empresa" }];
  const abas = ui.abas({ itens: ENTS, ativo: ent, rotulo: "Cadastro", aoMudar: id => { ent = id; desenhar(); } });
  const corpo = h("div", { class: "crm-cfg-lista", role: "list" });
  const travaOrdem = { ocupado: false };     // plano 1000b · RB-142

  function desenhar() {
    if (!vivo) return;
    ui.limpar(corpo);
    const lista = k.base.campos.filter(c => c.entidade === ent).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    if (!lista.length) {
      corpo.appendChild(ui.vazio({ icone: "editar", titulo: "Nenhum campo extra aqui.",
        // plano 1000b · RB-136: exemplos da vertical (a oficina não vê exemplo de dentista)
        texto: ent === "negocio" ? `Ex.: ${L.exemplosVertical(k.v.vertical).campos}, forma de pagamento. Obrigatório bloqueia marcar ${k.v.art("negocio") === "a" ? "a" : "o"} ${k.v.min("negocio")} como ganh${k.v.art("negocio")}.`
          : ent === "contato" ? "Ex.: convênio, como conheceu, preferência de horário." : "Ex.: ramo, número de funcionários.",
        acao: { rotulo: "Criar campo", fn: () => form(null) } }));
      return;
    }
    lista.forEach((c, i) => {
      const funil = c.funil_id ? k.funil(c.funil_id) : null;
      // plano 1000b · RB-149: a chave interna sai da lista (termo técnico) e fica só na dica do item
      corpo.appendChild(h("div", { class: "crm-cfg-item", role: "listitem", title: `Chave interna: ${c.chave}` },
        h("span", null, h("b", null, c.rotulo),
          h("small", null, [L.TIPOS_CAMPO[c.tipo] || c.tipo, c.obrigatorio ? "obrigatório" : null,
            ent === "negocio" ? (funil ? `só em «${funil.nome}»` : "todos os funis") : null,
            ["opcao", "multi"].includes(c.tipo) ? `${(c.opcoes || []).length} opç${(c.opcoes || []).length === 1 ? "ão" : "ões"}` : null].filter(Boolean).join(" · "))),
        c.obrigatorio ? ui.pilula("Obrigatório", "aten") : null,
        btIcone(k, "seta-baixo", `Subir ${c.rotulo}`, () => reordenar(lista, i, i - 1), { class: "crm-cfg-sobe crm-cfg-ordem", desabilitado: i === 0 }),
        btIcone(k, "seta-baixo", `Descer ${c.rotulo}`, () => reordenar(lista, i, i + 1), { class: "crm-cfg-ordem", desabilitado: i === lista.length - 1 }),
        btn(k, "Editar", { p: true, fn: () => form(c), rotuloAria: `Editar o campo ${c.rotulo}` }),
        btIcone(k, "lixeira", `Excluir o campo ${c.rotulo}`, () => excluir(c))));
    });
  }

  async function reordenar(lista, i, j) {
    if (j < 0 || j >= lista.length) return;
    const nova = L.moverItem(lista, i, j);
    await comOrdemTravada(travaOrdem, corpo, async () => {
      try { await gravarOrdem(k, nova, "nx_campo_salvar", "p_campo"); await k.recarregarBase(); desenhar(); ui.anunciar(`${lista[i].rotulo} na posição ${j + 1}.`); }
      catch (e) { ui.toast(k.erro(e), { tipo: "erro" }); }
    });
  }

  async function form(c) {
    const tipos = Object.entries(L.TIPOS_CAMPO).map(([valor, rotulo]) => ({ valor, rotulo }));
    const f = h("form", { class: "crm-form", novalidate: true },
      ui.campo({ rotulo: "Nome do campo", nome: "rotulo", valor: c ? c.rotulo : "", obrigatorio: true, max: 60, placeholder: ent === "negocio" ? `Ex.: ${L.exemplosVertical(k.v.vertical).campo}` : "Ex.: Convênio" }),   // plano 1000b · RB-136
      ui.campo({ rotulo: "Tipo", nome: "tipo", tipo: "select", valor: c ? c.tipo : "texto", opcoes: tipos }),
      ui.campo({ rotulo: "Opções (uma por linha)", nome: "opcoes", tipo: "textarea", linhas: 5, valor: c ? (c.opcoes || []).join("\n") : "", ajuda: "De 1 a 50 opções." }),
      ent === "negocio" ? ui.campo({ rotulo: "Vale para", nome: "funil_id", tipo: "select", valor: c ? c.funil_id || "" : "",
        // plano 1000b · RB-140: funil desativado aparece marcado (antes parecia um funil em uso)
        opcoes: [{ valor: "", rotulo: "Todos os funis" }, ...k.base.funis.map(x => ({ valor: x.id, rotulo: x.ativo === false ? `${x.nome} (desativado)` : x.nome }))] }) : null,
      ui.campo({ rotulo: "Obrigatório", nome: "obrigatorio", tipo: "interruptor", valor: c ? c.obrigatorio : false,
        ajuda: ent === "negocio" ? `Sem ele preenchido, ${k.v.art("negocio") === "a" ? "a" : "o"} ${k.v.min("negocio")} não pode ser marcad${k.v.art("negocio")} como ganh${k.v.art("negocio")}.` : "Sem ele preenchido, o cadastro não é salvo." }),
      c ? h("p", { class: "sub" }, "Chave interna: ", h("span", { class: "mono" }, c.chave), " (não muda)") : null);
    const opcoesCampo = f.querySelector('[data-campo="opcoes"]');
    const tipoSel = f.querySelector('select[name="tipo"]');
    const mostrarOpcoes = () => { opcoesCampo.hidden = !["opcao", "multi"].includes(tipoSel.value); };
    tipoSel.addEventListener("change", mostrarOpcoes);
    mostrarOpcoes();
    // plano 1000b · RB-143: campo que já existe trocando de tipo — os valores antigos que não forem do tipo novo vão aparecer como inválidos
    if (c) {
      const avisoTipo = h("p", { class: "aviso aviso-aten crm-aviso-tipo", role: "status", hidden: true }, ui.icone("alerta"),
        h("span", null, "Valores já preenchidos que não forem do tipo novo vão aparecer como inválidos."));
      tipoSel.closest("[data-campo]") ? tipoSel.closest("[data-campo]").after(avisoTipo) : f.appendChild(avisoTipo);
      tipoSel.addEventListener("change", () => { avisoTipo.hidden = tipoSel.value === c.tipo; });
    }
    const r = await ui.modal({ titulo: c ? `Editar «${c.rotulo}»` : "Novo campo", corpo: f, acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: c ? "Salvar" : "Criar campo", tipo: "primario", fn: async api => {
        const d = ui.lerForm(f);
        ui.marcarErro(f, null);
        if (!d.rotulo) { ui.marcarErro(f, "rotulo", "Dê um nome ao campo."); return false; }
        // plano 1000b · RB-139: «Unimed» duas vezes (ou «unimed») vira uma opção só, com aviso
        const { opcoes, unidas } = L.opcoesUnicas(String(d.opcoes || "").split(/\r?\n/));
        if (unidas && ["opcao", "multi"].includes(d.tipo)) ui.toast(`Opções repetidas foram unidas (${unidas}).`, { tipo: "info" });
        if (["opcao", "multi"].includes(d.tipo) && (!opcoes.length || opcoes.length > 50)) { ui.marcarErro(f, "opcoes", "Informe de 1 a 50 opções, uma por linha."); return false; }
        const p = { ...(c ? { id: c.id } : { entidade: ent }), rotulo: d.rotulo, tipo: d.tipo, obrigatorio: !!d.obrigatorio,
          ...(["opcao", "multi"].includes(d.tipo) ? { opcoes } : {}), ...(ent === "negocio" ? { funil_id: d.funil_id || null } : {}) };
        try { return await k.api.rpcC("nx_campo_salvar", { p_campo: p }); }
        catch (e) {
          const t = k.erro(e);
          if (e && (e.hint === "rotulo_em_uso" || e.hint === "rotulo")) ui.marcarErro(f, "rotulo", t);     // plano 1000b · RB-141: erro null não lança no catch
          else if (e && e.hint === "opcoes") ui.marcarErro(f, "opcoes", t);
          else api.erro(t);
          return false;
        }
      } }] });
    if (!r) return;
    await k.recarregarBase();
    ui.toast(c ? "Campo salvo." : "Campo criado.", { tipo: "ok" });
    desenhar();
  }

  async function excluir(c) {
    if (!(await ui.confirmar({ titulo: `Excluir o campo «${c.rotulo}»?`, perigo: true,
      texto: "O campo some das telas. Os valores já preenchidos ficam guardados (não aparecem mais)." }))) return;
    try {
      await k.api.rpcC("nx_campo_excluir", { p_id: c.id });
      await k.recarregarBase();
      ui.toast("Campo excluído.", { tipo: "ok" });
      desenhar();
    } catch (e) { ui.toast(k.erro(e), { tipo: "erro" }); }
  }

  alvo.append(cartao(k, {
    titulo: "Campos personalizados",
    sub: "Informações extras nos cadastros. Aparecem na ficha, na gaveta do negócio e na importação de planilhas.",
    acoes: btn(k, "Campo", { tipo: "prim", icone: "mais", fn: () => form(null) }),
  }, abas.el, corpo));
  desenhar();
  return () => { vivo = false; };
}

/* ============================================================
   ETIQUETAS
   ============================================================ */
async function secaoEtiquetas(ctx, alvo) {
  const k = await kitDe(ctx);
  const { ui, h, L } = k;
  let vivo = true;
  const podeExcluir = k.pode("admin");
  const busca = h("input", { type: "search", placeholder: "Buscar etiqueta", "aria-label": "Buscar etiqueta" });
  const corpo = h("div", { class: "crm-cfg-lista crm-cfg-etqs", role: "list" });
  busca.addEventListener("input", ui.debounce(() => desenhar(), 150));

  function desenhar() {
    if (!vivo) return;
    ui.limpar(corpo);
    const q = k.L.semAcento(busca.value.trim());
    const lista = k.base.etiquetas.filter(e => !q || k.L.semAcento(e.nome).includes(q));
    if (!k.base.etiquetas.length) {
      corpo.appendChild(ui.vazio({ icone: "etiqueta", titulo: "Nenhuma etiqueta ainda.", texto: `Etiquetas organizam ${k.v.min("contatos")}, ${k.v.min("negocios")} e conversas (ex.: ${L.exemplosVertical(k.v.vertical).etiquetas}, Retorno).`,   // plano 1000b · RB-136
        acao: { rotulo: "Criar etiqueta", fn: () => form(null) } }));
      return;
    }
    if (!lista.length) { corpo.appendChild(h("p", { class: "fraco" }, "Nenhuma etiqueta com esse nome.")); return; }
    for (const e of lista) {
      corpo.appendChild(h("div", { class: "crm-cfg-item", role: "listitem" },
        h("i", { class: "bola", style: k.cor(e.cor) ? { "--cor": k.cor(e.cor) } : null }),
        h("span", null, h("b", null, e.nome)),
        ui.etiqueta(e),
        btn(k, "Editar", { p: true, fn: () => form(e), rotuloAria: `Editar a etiqueta ${e.nome}` }),
        podeExcluir ? btIcone(k, "lixeira", `Excluir a etiqueta ${e.nome}`, ev => excluir(e, ev && ev.currentTarget)) : null));
    }
  }

  async function form(e) {
    const f = h("form", { class: "crm-form", novalidate: true },
      ui.campo({ rotulo: "Nome", nome: "nome", valor: e ? e.nome : "", obrigatorio: true, max: 40, placeholder: "Ex.: Urgência" }),
      ui.campo({ rotulo: "Cor", nome: "cor", tipo: "cor", valor: e ? e.cor : (ctx.paleta && ctx.paleta.length ? ctx.paleta[k.base.etiquetas.length % ctx.paleta.length] : null), paleta: ctx.paleta }));     // plano 1000b · RB-137: % tamanho da paleta (não 12)
    const r = await ui.modal({ titulo: e ? `Editar «${e.nome}»` : "Nova etiqueta", largura: "p", corpo: f, acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: e ? "Salvar" : "Criar etiqueta", tipo: "primario", fn: async api => {
        const d = ui.lerForm(f);
        ui.marcarErro(f, null);
        if (!d.nome) { ui.marcarErro(f, "nome", "Dê um nome à etiqueta."); return false; }
        try { return await k.api.rpcC("nx_etiqueta_salvar", { p_etiqueta: { ...(e ? { id: e.id } : {}), nome: d.nome, ...(k.cor(d.cor) ? { cor: d.cor } : {}) } }); }
        catch (err) { if (err && err.hint === "nome_em_uso") ui.marcarErro(f, "nome", "Já existe uma etiqueta com esse nome."); else api.erro(k.erro(err)); return false; }
      } }] });
    if (!r) return;
    if (!e && r && r.nome && r.nome.toLowerCase() !== String(ui.lerForm(f).nome).toLowerCase()) ui.toast(`Já existia a etiqueta «${r.nome}».`, { tipo: "info" });
    await k.recarregarBase();
    ui.toast(e ? "Etiqueta salva." : "Etiqueta criada.", { tipo: "ok" });
    desenhar();
  }

  async function excluir(e, bt = null) {
    if (!(await ui.confirmar({ titulo: `Excluir a etiqueta «${e.nome}»?`, perigo: true,
      texto: "Ela sai do catálogo na hora e é retirada de todos os contatos, negócios e conversas." }))) return;
    // plano 1000b · RB-150: o progresso aparece NO item (antes só o leitor de tela ouvia) e o botão fica desligado até terminar
    const item = bt && bt.closest ? bt.closest(".crm-cfg-item") : null;
    const prog = item ? h("small", { class: "crm-cfg-prog", role: "status" }) : null;
    if (bt) { bt.disabled = true; bt.setAttribute("aria-busy", "true"); }
    if (item && prog) item.appendChild(prog);
    try {
      let r, voltas = 0;
      do {
        r = await k.api.rpcC("nx_etiqueta_excluir", { p_id: e.id });
        if (r.restantes) {
          ui.anunciar(`Tirando a etiqueta… faltam ${r.restantes} registros.`);
          if (prog) prog.textContent = `Tirando de ${r.restantes} ${r.restantes === 1 ? "registro" : "registros"}…`;
        }
      } while (r.restantes > 0 && ++voltas < 500 && vivo);
      await k.recarregarBase();
      ui.toast(`Etiqueta «${e.nome}» excluída.`, { tipo: "ok" });
      desenhar();
    } catch (err) {
      ui.toast(k.erro(err), { tipo: "erro" });
      await k.recarregarBase().catch(() => {});
      desenhar();
    }
  }

  alvo.append(cartao(k, {
    titulo: "Etiquetas",
    sub: `Um catálogo só para ${k.v.min("contatos")}, ${k.v.min("negocios")} e conversas. ${podeExcluir ? "" : "Só o administrador exclui etiquetas."}`,
    acoes: btn(k, "Etiqueta", { tipo: "prim", icone: "mais", fn: () => form(null) }),
  }, h("div", { class: "busca crm-cfg-busca" }, ui.icone("busca"), busca), corpo));
  desenhar();
  return () => { vivo = false; };
}

/* ============================================================
   MOTIVOS DE PERDA
   ============================================================ */
async function secaoMotivos(ctx, alvo) {
  const k = await kitDe(ctx);
  const { ui, h, L } = k;
  let vivo = true;
  const corpo = h("div", { class: "crm-cfg-lista", role: "list" });
  const travaOrdem = { ocupado: false };     // plano 1000b · RB-142

  function desenhar() {
    if (!vivo) return;
    ui.limpar(corpo);
    const lista = k.base.motivos.slice().sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    if (!lista.length) {
      corpo.appendChild(ui.vazio({ icone: "alerta", titulo: "Nenhum motivo cadastrado.",
        texto: `Sem motivos, ${k.v.min("negocios")} podem ser marcad${k.v.art("negocio")}s como perdid${k.v.art("negocio")}s sem explicação — e o relatório de perdas fica vazio.`,
        acao: { rotulo: "Criar motivo", fn: () => form(null) } }));
      return;
    }
    lista.forEach((m, i) => corpo.appendChild(h("div", { class: "crm-cfg-item", role: "listitem" },
      h("span", null, h("b", null, m.nome), h("small", null, m.exige_texto ? "pede uma justificativa por escrito" : "só o motivo")),
      btIcone(k, "seta-baixo", `Subir ${m.nome}`, () => reordenar(lista, i, i - 1), { class: "crm-cfg-sobe crm-cfg-ordem", desabilitado: i === 0 }),
      btIcone(k, "seta-baixo", `Descer ${m.nome}`, () => reordenar(lista, i, i + 1), { class: "crm-cfg-ordem", desabilitado: i === lista.length - 1 }),
      btn(k, "Editar", { p: true, fn: () => form(m), rotuloAria: `Editar o motivo ${m.nome}` }),
      btIcone(k, "lixeira", `Excluir o motivo ${m.nome}`, () => excluir(m)))));
  }

  async function reordenar(lista, i, j) {
    if (j < 0 || j >= lista.length) return;
    await comOrdemTravada(travaOrdem, corpo, async () => {
      try { await gravarOrdem(k, L.moverItem(lista, i, j), "nx_motivo_salvar", "p_motivo"); await k.recarregarBase(); desenhar(); ui.anunciar(`${lista[i].nome} na posição ${j + 1}.`); }
      catch (e) { ui.toast(k.erro(e), { tipo: "erro" }); }
    });
  }

  async function form(m) {
    const f = h("form", { class: "crm-form", novalidate: true },
      ui.campo({ rotulo: "Motivo", nome: "nome", valor: m ? m.nome : "", obrigatorio: true, max: 60, placeholder: "Ex.: Achou caro" }),
      ui.campo({ rotulo: "Pedir justificativa por escrito", nome: "exige_texto", tipo: "interruptor", valor: m ? m.exige_texto : false,
        ajuda: "Útil para motivos genéricos, como «Outro»." }));
    const r = await ui.modal({ titulo: m ? `Editar «${m.nome}»` : "Novo motivo de perda", largura: "p", corpo: f, acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: null },
      { rotulo: m ? "Salvar" : "Criar motivo", tipo: "primario", fn: async api => {
        const d = ui.lerForm(f);
        ui.marcarErro(f, null);
        if (!d.nome) { ui.marcarErro(f, "nome", "Escreva o motivo."); return false; }
        try { return await k.api.rpcC("nx_motivo_salvar", { p_motivo: { ...(m ? { id: m.id } : {}), nome: d.nome, exige_texto: !!d.exige_texto } }); }
        catch (e) { if (e && e.hint === "nome_em_uso") ui.marcarErro(f, "nome", "Já existe um motivo com esse nome."); else api.erro(k.erro(e)); return false; }     // plano 1000b · RB-141
      } }] });
    if (!r) return;
    await k.recarregarBase();
    ui.toast(m ? "Motivo salvo." : "Motivo criado.", { tipo: "ok" });
    desenhar();
  }

  async function excluir(m) {
    if (!(await ui.confirmar({ titulo: `Excluir «${m.nome}»?`, perigo: true,
      texto: `Se ele já foi usado em ${k.v.min("negocios")} perdid${k.v.art("negocio")}s, fica arquivado: some da lista, mas os relatórios continuam mostrando o nome.` }))) return;
    try {
      const r = await k.api.rpcC("nx_motivo_excluir", { p_id: m.id });
      await k.recarregarBase();
      ui.toast(r && r.desativado ? "Motivo arquivado (já tinha sido usado)." : "Motivo excluído.", { tipo: "ok" });
      desenhar();
    } catch (e) { ui.toast(k.erro(e), { tipo: "erro" }); }
  }

  alvo.append(cartao(k, {
    titulo: "Motivos de perda",
    sub: `Aparecem quando alguém marca ${k.v.art("negocio") === "a" ? "uma" : "um"} ${k.v.min("negocio")} como ${k.v.perder.toLowerCase()}. Com motivos cadastrados, escolher um é obrigatório.`,
    acoes: btn(k, "Motivo", { tipo: "prim", icone: "mais", fn: () => form(null) }),
  }, corpo));
  desenhar();
  return () => { vivo = false; };
}
