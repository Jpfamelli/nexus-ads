/* ============================================================
   ÓRBITA — inicio.js (frente F6) · tela T3 Início
   A central da operação: atendimento agora, tarefas, vendas, leads e
   a saúde dos números de WhatsApp — tudo de UMA chamada (nx_inicio),
   com as contagens de conversa na visibilidade de quem está vendo.
   Atualiza no pulso, no máximo a cada 30 s.
   ============================================================ */

const INTERVALO_PULSO = 30000;
let L = null, G = null;
let montagem = 0, cancelarPulso = null, tPulso = 0, ultimaCarga = 0, ultimoJson = "";

export function desmontar() {
  montagem++;
  if (cancelarPulso) { try { cancelarPulso(); } catch { /* ok */ } }
  cancelarPulso = null;
  clearTimeout(tPulso); tPulso = 0;
}

export async function montar(ctx) {
  desmontar();
  const minha = montagem;
  const { ui } = ctx;
  ui.carregarCss("relatorios.css");
  ctx.titulo("Início");
  ui.limpar(ctx.alvo);
  const raiz0 = ui.h("section", { class: "rel ini", "aria-labelledby": "ini-h" });
  ctx.alvo.append(raiz0);
  raiz0.append(ui.esqueleto("cartoes", 4));
  if (!L) {
    try {
      [L, G] = await Promise.all([import(`./rel-logica.js?v=${ctx.versao}`), import(`./graficos.js?v=${ctx.versao}`)]);
    } catch (e) { ui.limpar(raiz0); raiz0.append(ui.erroCartao(e, () => montar(ctx))); return; }
  }
  if (minha !== montagem) return;
  const h = G.criarH(ui);
  const V = ctx.vocab || {};
  const vmin = (k, p) => (typeof V.min === "function" ? V.min(k) : (V[k] || p).toLowerCase());
  // concordância: "oportunidades abertas/ganhas" × "orçamentos abertos/ganhos"
  const fem = (typeof V.art === "function" ? V.art("negocio") : V.g_negocio) === "a";
  const adj = (m, n = 2) => (fem ? m.replace(/o$/, "a") : m) + (n === 1 ? "" : "s");
  const podeConversas = ctx.temModulo("conversas") && ctx.pronto("conversas");
  const podeCrm = ctx.temModulo("crm") && ctx.pronto("crm");
  const podeTarefas = ctx.temModulo("crm") && ctx.pronto("tarefas");
  const podeRel = ctx.temModulo("relatorios") && ctx.pronto("relatorios");
  const escreve = ctx.pode("atendente");
  const primeiro = String((ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.nome) || "").trim().split(/\s+/)[0] || "";

  // topo
  ui.limpar(raiz0);
  const quando = h("p", { class: "rel-nota", "aria-live": "polite" });
  const btn = h("button", { type: "button", class: "rel-btn rel-btn-sec" }, "Atualizar");
  raiz0.append(h("header", { class: "rel-topo" },
    h("div", { class: "rel-topo-t" }, h("p", { class: "rel-olho" }, `Início · ${ctx.cliente.nome}`),
      h("h1", { id: "ini-h", class: "rel-h1" }, primeiro ? `${L.saudacao()}, ${primeiro}` : L.saudacao())),
    h("div", { class: "rel-topo-acoes" }, quando, btn)));
  const corpo = h("div", { class: "rel-corpo" });
  raiz0.append(corpo);
  btn.addEventListener("click", () => carregar({ forcar: true }));

  async function carregar({ forcar = false, primeira = false } = {}) {
    if (minha !== montagem) return;
    btn.disabled = true;
    try {
      const d = await ctx.api.rpcC("nx_inicio", {});
      if (minha !== montagem) return;
      ultimaCarga = Date.now();
      quando.textContent = `Atualizado às ${L.horaSP(new Date())}`;
      const js = JSON.stringify({ ...d, agora: null });
      if (!forcar && !primeira && js === ultimoJson) return;      // nada mudou: não mexe na tela
      ultimoJson = js;
      desenhar(d, primeira);
    } catch (e) {
      if (minha !== montagem || (e && e.codigo === "sessao_invalida")) return;
      if (primeira) { ui.limpar(corpo); corpo.append(ui.erroCartao(e, () => carregar({ primeira: true }))); }
      else ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível atualizar agora.", { tipo: "erro" });
    } finally { btn.disabled = false; }
  }

  function desenhar(d, animar) {
    // preserva o foco (checkbox de tarefa, links) entre redesenhos do pulso
    const foco = document.activeElement && corpo.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    ui.limpar(corpo);
    const num = (v, fmt, cls = "") => {
      const b = h("b", { class: `rel-num ${cls}` });
      if (animar) G.contar(b, +v || 0, fmt); else b.textContent = fmt(+v || 0);
      return b;
    };
    const int = v => Math.round(v).toLocaleString("pt-BR");
    const brl0 = v => ui.brl(v, { centavos: false });

    if (L.inicioVazio(d)) {
      const passo = (n, t, rot, hash, pode) => h("li", { class: "ini-passo" },
        h("span", { class: "ini-passo-n", "aria-hidden": "true" }, String(n)),
        h("div", {}, h("p", { class: "ini-passo-t" }, t),
          pode ? h("a", { class: "rel-btn rel-btn-sec", href: hash }, rot) : h("p", { class: "rel-nota" }, "Peça ao administrador da sua empresa.")));
      corpo.append(h("div", { class: "rel-cartao ini-comecar rel-entra" },
        h("p", { class: "rel-olho" }, "Primeiros passos"),
        h("h2", { class: "ini-comecar-t" }, "Tudo pronto para começar."),
        h("ol", { class: "ini-passos" },
          passo(1, "Conecte um número de WhatsApp em Configurações → Números.", "Conectar número", "#/config/numeros", ctx.pode("admin")),
          passo(2, "Convide sua equipe.", "Convidar equipe", "#/config/usuarios", ctx.pode("admin")),
          passo(3, "Ajuste o funil.", "Ajustar o funil", "#/config/funis", ctx.pode("admin")))));
      return;
    }

    const grade = h("div", { class: "ini-grade" });
    corpo.append(grade);
    const c = d.conversas || {}, t = d.tarefas || {}, n = d.negocios || {}, l = d.leads || {};

    // 1) Atendimento agora
    const numLink = (valor, rot, hash, k, destaque) => {
      const conteudo = [num(valor, int, `ini-n${destaque ? " ini-n-destaque" : ""}`), h("span", { class: "ini-n-l" }, rot)];
      return podeConversas
        ? h("a", { class: "ini-numero", href: hash, dataset: { k } }, conteudo)
        : h("div", { class: "ini-numero" }, conteudo);
    };
    const espera = +c.espera_mais_antiga_min;
    grade.append(h("section", { class: "rel-cartao ini-atend rel-entra", "aria-labelledby": "ini-at", style: "--i:0" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-at", class: "rel-h2" }, "Atendimento agora"),
        +c.aguardando > 0 && Number.isFinite(espera)
          ? h("p", { class: `ini-espera${espera >= 30 ? " rel-txt-aten" : ""}` }, ui.icone("relogio"), ` cliente esperando há ${L.duracaoMin(espera)}`)
          : h("p", { class: "rel-nota" }, "ninguém esperando resposta")),
      h("div", { class: "ini-numeros ini-numeros-4" },
        numLink(c.aguardando, "aguardando resposta", "#/conversas?aba=aguardando", "c-ag", +c.aguardando > 0),
        numLink(c.sem_dono, "sem responsável", "#/conversas?aba=sem_dono", "c-sd", false),
        numLink(c.minhas, "com você", "#/conversas?aba=minhas", "c-mi", false),
        numLink(c.abertas, "abertas no total", "#/conversas?aba=abertas", "c-ab", false))));

    // 2) Leads
    grade.append(h("section", { class: "rel-cartao ini-leads rel-entra", "aria-labelledby": "ini-ld", style: "--i:1" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-ld", class: "rel-h2" }, "Leads")),
      h("div", { class: "ini-numeros ini-numeros-3" },
        h("div", { class: "ini-numero" }, num(l.hoje, int, "ini-n"), h("span", { class: "ini-n-l" }, "hoje")),
        h("div", { class: "ini-numero" }, num(l.hoje_anuncio, int, "ini-n"), h("span", { class: "ini-n-l" }, "de anúncio hoje")),
        h("div", { class: "ini-numero" }, num(l.semana, int, "ini-n"), h("span", { class: "ini-n-l" }, "nos últimos 7 dias"))),
      +l.semana ? h("p", { class: "rel-nota" }, `${l.semana_anuncio || 0} dos ${l.semana} da semana vieram de anúncio.`) : null));

    // 3) Vendas
    const mv = L.mesVsAnterior(n);
    const chipMes = L.chipVar(mv.atual, mv.anterior, "cima");
    const ganhos = +n.ganhos_mes || 0, abertos = +n.abertos || 0;
    const txtAbertos = `${abertos === 1 ? vmin("negocio", "negócio") : vmin("negocios", "negócios")} ${adj("aberto", abertos)} · ${brl0(n.valor_aberto)}`;
    // este mês × o mesmo pedaço do mês passado, em duas barras na mesma régua
    const topoMes = Math.max(mv.atual, mv.anterior) || 1;
    const barraMes = (rot, v, cls) => h("div", { class: "ini-barra" },
      h("span", { class: "ini-barra-r" }, rot),
      h("span", { class: "ini-barra-t", "aria-hidden": "true" }, h("i", { class: cls, style: { "--w": `${v > 0 ? Math.max(2, v / topoMes * 100) : 0}%` } })),
      h("b", { class: "ini-barra-v rel-num" }, brl0(v)));
    const ateDia = mv.dia ? ` (até o dia ${mv.dia})` : "";
    const vendas = h("section", { class: "rel-cartao ini-vendas rel-entra", "aria-labelledby": "ini-vd", style: "--i:2" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-vd", class: "rel-h2" }, "Vendas"),
        podeRel ? h("a", { class: "rel-link", href: "#/relatorios/vendas" }, "Ver relatório") : null),
      h("div", { class: "ini-mes" },
        h("p", { class: "rel-olho" }, "Receita do mês"),
        num(mv.atual, brl0, "ini-receita"),
        h("p", { class: "ini-mes-l" },
          h("span", { class: `rel-var rel-var-${chipMes.cls}` }, chipMes.v == null ? chipMes.txt : `${chipMes.seta} ${chipMes.txt}`),
          h("span", { class: "rel-nota" }, ` vs. ${brl0(mv.anterior)} no mesmo período do mês passado`)),
        h("p", { class: "rel-nota" }, `${ganhos} ${ganhos === 1 ? vmin("negocio", "negócio") : vmin("negocios", "negócios")} ${adj("ganho", ganhos)} no mês · mês passado inteiro: ${brl0(mv.anteriorInteiro)}`)),
      h("div", { class: "ini-barras", role: "img", "aria-label": `Receita deste mês${ateDia}: ${brl0(mv.atual)}; mesmo período do mês passado: ${brl0(mv.anterior)}` },
        barraMes("Este mês", mv.atual, "ini-b-atual"), barraMes(`Mês passado${ateDia}`, mv.anterior, "ini-b-antes")),
      h("div", { class: "ini-numeros ini-numeros-2" },
        (podeCrm ? h("a", { class: "ini-numero", href: "#/crm", dataset: { k: "n-ab" } }, num(n.abertos, int, "ini-n"), h("span", { class: "ini-n-l" }, txtAbertos))
          : h("div", { class: "ini-numero" }, num(n.abertos, int, "ini-n"), h("span", { class: "ini-n-l" }, txtAbertos))),
        h("div", { class: "ini-numero", title: "soma do valor previsto × a probabilidade de cada etapa" }, num(n.previsao_ponderada, brl0, "ini-n"), h("span", { class: "ini-n-l" }, "previsão ponderada"))));
    grade.append(vendas);

    // 4) Tarefas
    const lista = h("ul", { class: "ini-tarefas" });
    (t.proximas || []).forEach(tf => lista.append(itemTarefa(tf)));
    if (!lista.childElementCount) lista.append(h("li", { class: "rel-vazio-txt" }, "Nenhuma tarefa aberta com você."));
    grade.append(h("section", { class: "rel-cartao ini-tf rel-entra", "aria-labelledby": "ini-tf", style: "--i:3" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-tf", class: "rel-h2" }, "Tarefas"),
        podeTarefas ? h("a", { class: "rel-link", href: "#/tarefas" }, "Ver todas") : null),
      h("div", { class: "ini-numeros ini-numeros-2" },
        podeTarefas ? h("a", { class: "ini-numero", href: "#/tarefas?aba=hoje", dataset: { k: "t-hj" } }, num(t.hoje, int, "ini-n"), h("span", { class: "ini-n-l" }, "para hoje"))
          : h("div", { class: "ini-numero" }, num(t.hoje, int, "ini-n"), h("span", { class: "ini-n-l" }, "para hoje")),
        podeTarefas ? h("a", { class: "ini-numero", href: "#/tarefas?aba=atrasadas", dataset: { k: "t-at" } }, num(t.atrasadas, int, `ini-n${+t.atrasadas ? " ini-n-ruim" : ""}`), h("span", { class: "ini-n-l" }, "atrasadas"))
          : h("div", { class: "ini-numero" }, num(t.atrasadas, int, `ini-n${+t.atrasadas ? " ini-n-ruim" : ""}`), h("span", { class: "ini-n-l" }, "atrasadas"))),
      h("p", { class: "rel-olho ini-sub" }, "Próximas"), lista));

    // 5) Números de WhatsApp
    const canais = d.canais || [];
    const lc = h("ul", { class: "ini-canais" });
    for (const k of canais) {
      const e = L.estadoCanal(k);
      lc.append(h("li", { class: `ini-canal ini-c-${e.nivel}` },
        h("span", { class: "ini-canal-luz", "aria-hidden": "true" }),
        h("div", { class: "ini-canal-t" },
          h("p", { class: "ini-canal-n" }, k.nome, k.numero_exibicao ? h("span", { class: "rel-nota" }, ` · ${k.numero_exibicao}`) : null),
          h("p", { class: "rel-nota" }, e.texto, k.ultima_entrada_em ? ` · última mensagem recebida ${L.quandoSP(k.ultima_entrada_em)}` : " · nenhuma mensagem recebida ainda"),
          k.status === "erro" && k.ultimo_erro ? h("p", { class: "ini-canal-erro" }, String(k.ultimo_erro).slice(0, 200)) : null)));
    }
    if (!canais.length) lc.append(h("li", { class: "rel-vazio-txt" }, ctx.pode("admin")
      ? "Nenhum número conectado. Conecte o WhatsApp da empresa em Configurações → Números."
      : "Nenhum número conectado. Peça ao administrador para conectar o WhatsApp."));
    grade.append(h("section", { class: "rel-cartao ini-num rel-entra", "aria-labelledby": "ini-nm", style: "--i:4" },
      h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-nm", class: "rel-h2" }, "Números de WhatsApp"),
        ctx.pode("admin") ? h("a", { class: "rel-link", href: "#/config/numeros" }, canais.length ? "Gerenciar" : "Conectar") : null),
      lc));

    if (foco) { const alvo = corpo.querySelector(`[data-k="${CSS.escape(foco)}"]`); if (alvo) alvo.focus({ preventScroll: true }); }
  }

  function itemTarefa(tf) {
    const id = `ini-tf-${tf.id}`;
    const caixa = h("input", { type: "checkbox", id, class: "ini-check", dataset: { k: `tf-${tf.id}` }, disabled: !escreve,
      "aria-label": `Concluir: ${tf.titulo}` });
    const venc = tf.vence_em ? (tf.atrasada ? `atrasada · venceu ${ui.relativo(tf.vence_em)}` : `vence ${L.quandoSP(tf.vence_em)}`) : "sem prazo";
    const alvoNome = tf.contato_nome ? ` · ${tf.contato_nome}` : "";
    const abrir = tf.negocio_id || tf.contato_id
      ? h("button", { type: "button", class: "ini-tf-abrir", dataset: { k: `tfa-${tf.id}` } }, tf.titulo)
      : h("span", { class: "ini-tf-t" }, tf.titulo);
    if (tf.negocio_id) abrir.addEventListener("click", () => ctx.abrirNegocio(tf.negocio_id, { aoMudar: () => carregar({ forcar: true }) }));
    else if (tf.contato_id) abrir.addEventListener("click", () => ctx.abrirContato(tf.contato_id, { aoMudar: () => carregar({ forcar: true }) }));
    const li = h("li", { class: `ini-tf-item${tf.atrasada ? " atrasada" : ""}` },
      h("label", { class: "ini-tf-caixa", for: id }, caixa, h("span", { class: "ini-tf-marca", "aria-hidden": "true" })),
      h("div", { class: "ini-tf-txt" }, abrir, h("p", { class: `rel-nota${tf.atrasada ? " rel-txt-ruim" : ""}` }, venc + alvoNome)));
    caixa.addEventListener("change", async () => {
      if (!caixa.checked) return;
      li.classList.add("feita");
      try {
        await ctx.api.rpcC("nx_tarefa_concluir", { p_id: tf.id, p_concluida: true });
        ui.toast("Tarefa concluída.", { tipo: "ok", desfazer: async () => {
          try { await ctx.api.rpcC("nx_tarefa_concluir", { p_id: tf.id, p_concluida: false }); carregar({ forcar: true }); }
          catch (e) { ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível desfazer.", { tipo: "erro" }); }
        } });
        setTimeout(() => carregar({ forcar: true }), 500);
      } catch (e) {
        li.classList.remove("feita"); caixa.checked = false;
        ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível concluir a tarefa.", { tipo: "erro" });
      }
    });
    return li;
  }

  await carregar({ primeira: true });
  if (minha !== montagem) return;
  // tempo real: o pulso avisa que algo mudou; recarrega no máximo a cada 30 s
  cancelarPulso = ctx.pulso.assinar(() => {
    if (tPulso) return;
    const falta = Math.max(0, INTERVALO_PULSO - (Date.now() - ultimaCarga));
    tPulso = setTimeout(() => { tPulso = 0; if (!document.hidden) carregar(); }, falta);
  });
}
