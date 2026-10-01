/* ============================================================
   ÓRBITA — inicio.js (frente F6 · M31) · tela T3 Início
   A manchete diz o que importa agora ("2 pacientes esperam resposta há
   15 min. Hoje tem 1 consulta e R$ 5.200 em oportunidades abertas."),
   cada trecho é um link; abaixo ficam só os blocos que pedem ação, em
   ordem de urgência, e o resto recolhido em "Mais detalhes". Sem
   pendência: "Tudo em dia.". Uma chamada (nx_inicio) + a agenda do dia
   (nx_agenda_dia, opcional); atualiza no pulso, no máximo a cada 30 s.
   A lógica da frase e da ordem dos blocos mora em rel-logica.js (pura).
   ============================================================ */

const INTERVALO_PULSO = 30000;
let L = null, G = null;
let montagem = 0, cancelarPulso = null, cancelarOcupado = null, tPulso = 0, ultimaCarga = 0, ultimoJson = "";
let ultimoDado = null, maisAberto = false;

export function desmontar() {
  montagem++;
  if (cancelarPulso) { try { cancelarPulso(); } catch { /* ok */ } }
  cancelarPulso = null;
  if (cancelarOcupado) { try { cancelarOcupado(); } catch { /* ok */ } }
  cancelarOcupado = null;
  clearTimeout(tPulso); tPulso = 0;
}

export async function montar(ctx) {
  desmontar();
  const minha = montagem;
  const { ui } = ctx;
  ui.carregarCss("relatorios.css");
  ctx.titulo("Início");
  ui.limpar(ctx.alvo);
  const raiz = ui.h("section", { class: "rel ini", "aria-labelledby": "ini-h" });
  ctx.alvo.append(raiz);
  raiz.append(ui.esqueleto("inicio"));          // a tela nunca fica em branco: o esqueleto só sai quando há dado
  if (!L) {
    try {
      [L, G] = await Promise.all([import(`./rel-logica.js?v=${ctx.versao}`), import(`./graficos.js?v=${ctx.versao}`)]);
    } catch (e) { ui.limpar(raiz); raiz.append(ui.erroCartao(e, () => montar(ctx))); return; }
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
  const podeAgenda = ctx.temModulo("crm") && ctx.pronto("crm");
  const podeRel = ctx.temModulo("relatorios") && ctx.pronto("relatorios");
  const escreve = ctx.pode("atendente");
  const primeiro = String((ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.nome) || "").trim().split(/\s+/)[0] || "";
  const int = v => Math.round(v).toLocaleString("pt-BR");
  const brl0 = v => ui.brl(v, { centavos: false });

  // cabeçalho: saudação pequena em cima, manchete no degrau display, hora da leitura + Atualizar
  const quando = h("p", { class: "rel-nota", "aria-live": "polite" });
  const btn = h("button", { type: "button", class: "rel-btn rel-btn-sec" }, "Atualizar");
  const cab = ui.cabecalho({ rotulo: primeiro ? `${L.saudacao()}, ${primeiro} · ${ctx.cliente.nome}` : `${L.saudacao()} · ${ctx.cliente.nome}`,
    titulo: "", acoes: [quando, btn], nivel: 1 });
  cab.classList.add("ini-cab");
  const titulo = cab.querySelector("h1");
  titulo.id = "ini-h";
  const corpo = h("div", { class: "rel-corpo" });
  btn.addEventListener("click", () => carregar({ forcar: true }));
  let desenhou = false;      // já houve algum dado na tela (cache ou rede)
  let colocado = false;      // o esqueleto já foi trocado pelo cabeçalho + corpo

  async function buscarAgenda() {
    if (!podeAgenda) return null;
    try { return await ctx.api.rpcC("nx_agenda_dia", { p_data: L.hojeSP(), p_dias: 1 }, { cache: true }); }
    catch { return null; }          // a agenda é um complemento: sem ela a frase só não fala de consulta
  }

  async function carregar({ forcar = false, primeira = false } = {}) {
    if (minha !== montagem) return;
    btn.disabled = true;
    try {
      // 1ª abertura: pinta o último dado guardado (se o shell tiver cache) e confere na rede em seguida
      const aoCache = dados => { if (minha === montagem && !desenhou && dados && typeof dados === "object") { desenhou = true; desenhar(dados, null, false); } };
      const [d, agenda] = await Promise.all([ctx.api.rpcC("nx_inicio", {}, { cache: true, aoCache }), buscarAgenda()]);
      if (minha !== montagem) return;
      ultimaCarga = Date.now();
      quando.textContent = `Atualizado às ${L.horaSP(new Date())}`;
      const js = JSON.stringify({ ...d, agora: null, agenda: agenda && agenda.consultas ? agenda.consultas.length : null });
      if (!forcar && !primeira && js === ultimoJson) return;      // nada mudou: não mexe na tela
      ultimoJson = js;
      const antes = ultimoDado;
      desenhar(d, agenda, primeira && !desenhou, antes);
      desenhou = true;
    } catch (e) {
      if (minha !== montagem || (e && e.codigo === "sessao_invalida")) return;
      if (primeira && !desenhou) { ui.trocarEsqueleto(raiz, ui.erroCartao(e, () => { ui.limpar(raiz); raiz.append(ui.esqueleto("inicio")); carregar({ primeira: true }); })); }
      else ui.toast(ctx.api.mensagemErro ? ctx.api.mensagemErro(e) : "Não foi possível atualizar agora.", { tipo: "erro" });
    } finally { btn.disabled = false; }
  }

  /** Um trecho da manchete: link (ou texto) com o número no acento e o verbo em Zodiak. */
  function noManchete(no, k) {
    if (no.t === "txt") return no.v;
    const partes = no.partes.map(p => {
      if (p.t === "n") return h("span", { class: "ini-m-n" }, p.v);
      if (p.t === "moeda") return L.preencherMoeda(ui, h("span", { class: "ini-m-n" }), p.v, { centavos: false });
      if (p.t === "narr") return h("em", { class: "narr" }, p.v);
      return p.v;
    });
    const cls = ["ini-m-trecho", no.tom ? `ini-m-${no.tom}` : null];
    return no.href ? h("a", { class: cls, href: no.href, dataset: { k } }, partes) : h("span", { class: cls }, partes);
  }
  function pintarManchete(m) {
    ui.limpar(titulo);
    let i = 0;
    m.frases.forEach((f, fi) => {
      if (fi) titulo.append(" ");
      for (const no of f) titulo.append(noManchete(no, `m-${i++}`));
    });
    titulo.setAttribute("aria-label", m.texto);       // o leitor de tela lê a frase inteira, sem picotar por link
  }

  function desenhar(d, agenda, animar, antes = null) {
    // preserva o foco (checkbox de tarefa, links) entre redesenhos do pulso
    const foco = document.activeElement && (corpo.contains(document.activeElement) || titulo.contains(document.activeElement)) ? document.activeElement.dataset.k : null;
    ultimoDado = d;
    const contarDepois = [];     // animações de "contar até o valor": começam quando o esqueleto sai (o elemento precisa estar na página)
    const num = (v, fmt, cls = "", chave = null) => {
      const b = h("b", { class: `rel-num ${cls}` });
      if (chave) b.dataset.n = chave;
      const valor = +v || 0;
      if (fmt === brl0) L.preencherMoeda(ui, b, valor, { centavos: false });      // "R$" a 60 %, colado ao valor
      else b.textContent = fmt(valor);
      if (animar && valor !== 0) contarDepois.push(() => (fmt === brl0 ? L.contarMoeda(ui, G, b, valor, { centavos: false }) : G.contar(b, valor, fmt)));
      return b;
    };
    const c = d.conversas || {}, t = d.tarefas || {}, n = d.negocios || {}, l = d.leads || {};
    const links = { conversas: podeConversas ? "#/conversas?aba=aguardando" : null, tarefas: podeTarefas ? "#/tarefas?aba=atrasadas" : null,
      agenda: podeAgenda ? "#/agenda" : null, crm: podeCrm ? "#/crm" : null };
    const m = L.manchete(d, { agenda, links, voc: { contato: vmin("contato", "cliente"), contatos: vmin("contatos", "clientes"),
      negocio: vmin("negocio", "negócio"), negocios: vmin("negocios", "negócios"), feminino: fem } });
    pintarManchete(m);
    titulo.dataset.tam = m.texto.length > 70 ? "longa" : "curta";     // frase curta ganha o degrau display; a longa cabe em 2-3 linhas no degrau h1
    ui.limpar(corpo);

    if (L.inicioVazio(d)) {
      const passo = (num_, tx, rot, hash, pode) => h("li", { class: "ini-passo" },
        h("span", { class: "ini-passo-n", "aria-hidden": "true" }, String(num_)),
        h("div", {}, h("p", { class: "ini-passo-t" }, tx),
          pode ? h("a", { class: "rel-btn rel-btn-sec", href: hash }, rot) : h("p", { class: "rel-nota" }, "Peça ao administrador da sua empresa.")));
      corpo.append(h("div", { class: "rel-cartao ini-comecar rel-entra" },
        h("p", { class: "rel-olho" }, "Primeiros passos"),
        h("h2", { class: "ini-comecar-t" }, "Tudo pronto para começar."),
        h("ol", { class: "ini-passos" },
          passo(1, "Conecte um número de WhatsApp em Configurações → Números.", "Conectar número", "#/config/numeros", ctx.pode("admin")),
          passo(2, "Convide sua equipe.", "Convidar equipe", "#/config/usuarios", ctx.pode("admin")),
          passo(3, "Ajuste o funil.", "Ajustar o funil", "#/config/funis", ctx.pode("admin")))));
      trocar();
      return;
    }

    // ---- blocos (cada um é uma função: a ordem e o que fica recolhido vêm de L.blocosInicio)
    const numLink = (valor, rot, hash, k, destaque, chave) => {
      const conteudo = [num(valor, int, `ini-n${destaque ? " ini-n-destaque" : ""}`, chave), h("span", { class: "ini-n-l" }, rot)];
      return podeConversas
        ? h("a", { class: "ini-numero", href: hash, dataset: { k } }, conteudo)
        : h("div", { class: "ini-numero" }, conteudo);
    };
    const espera = +c.espera_mais_antiga_min;
    const construtores = {
      atendimento: () => h("section", { class: "rel-cartao ini-atend rel-entra", "aria-labelledby": "ini-at", style: "--i:0" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-at", class: "rel-h2" }, "Atendimento agora"),
          +c.aguardando > 0 && Number.isFinite(espera)
            ? h("p", { class: `ini-espera${espera >= 30 ? " rel-txt-aten" : ""}` }, ui.icone("relogio"), ` cliente esperando há ${L.duracaoMin(espera)}`)
            : h("p", { class: "rel-nota" }, "ninguém esperando resposta")),
        h("div", { class: "ini-numeros ini-numeros-4" },
          numLink(c.aguardando, "aguardando resposta", "#/conversas?aba=aguardando", "c-ag", +c.aguardando > 0, "conversas.aguardando"),
          numLink(c.sem_dono, "sem responsável", "#/conversas?aba=sem_dono", "c-sd", false, "conversas.sem_dono"),
          numLink(c.minhas, "com você", "#/conversas?aba=minhas", "c-mi", false, "conversas.minhas"),
          numLink(c.abertas, "abertas no total", "#/conversas?aba=abertas", "c-ab", false, "conversas.abertas"))),

      leads: () => h("section", { class: "rel-cartao ini-leads rel-entra", "aria-labelledby": "ini-ld", style: "--i:1" },
        h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-ld", class: "rel-h2" }, "Leads")),
        h("div", { class: "ini-numeros ini-numeros-3" },
          h("div", { class: "ini-numero" }, num(l.hoje, int, "ini-n", "leads.hoje"), h("span", { class: "ini-n-l" }, "hoje")),
          h("div", { class: "ini-numero" }, num(l.hoje_anuncio, int, "ini-n", "leads.hoje_anuncio"), h("span", { class: "ini-n-l" }, "de anúncio hoje")),
          h("div", { class: "ini-numero" }, num(l.semana, int, "ini-n", "leads.semana"), h("span", { class: "ini-n-l" }, "nos últimos 7 dias"))),
        +l.semana ? h("p", { class: "rel-nota" }, `${l.semana_anuncio || 0} dos ${l.semana} da semana vieram de anúncio.`) : null),

      vendas: () => {
        const mv = L.mesVsAnterior(n);
        const chipMes = L.chipVar(mv.atual, mv.anterior, "cima");
        const ganhos = +n.ganhos_mes || 0, abertos = +n.abertos || 0;
        const txtAbertos = `${abertos === 1 ? vmin("negocio", "negócio") : vmin("negocios", "negócios")} ${adj("aberto", abertos)} · ${brl0(n.valor_aberto)}`;
        // este mês × o mesmo pedaço do mês passado, em duas barras na mesma régua
        const topoMes = Math.max(mv.atual, mv.anterior) || 1;
        const barraMes = (rot, v, cls) => h("div", { class: "ini-barra" },
          h("span", { class: "ini-barra-r" }, rot),
          h("span", { class: "ini-barra-t", "aria-hidden": "true" }, h("i", { class: cls, style: { "--w": `${v > 0 ? Math.max(2, v / topoMes * 100) : 0}%` } })),
          L.preencherMoeda(ui, h("b", { class: "ini-barra-v rel-num" }), v, { centavos: false }));
        const ateDia = mv.dia ? ` (até o dia ${mv.dia})` : "";
        return h("section", { class: "rel-cartao ini-vendas rel-entra", "aria-labelledby": "ini-vd", style: "--i:2" },
          h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-vd", class: "rel-h2" }, "Vendas"),
            podeRel ? h("a", { class: "rel-link", href: "#/relatorios/vendas" }, "Ver relatório") : null),
          h("div", { class: "ini-mes" },
            h("p", { class: "rel-olho" }, "Receita do mês"),
            num(mv.atual, brl0, "ini-receita", "negocios.receita_mes"),
            h("p", { class: "ini-mes-l" },
              h("span", { class: `rel-var rel-var-${chipMes.cls}` }, chipMes.v == null ? chipMes.txt : `${chipMes.seta} ${chipMes.txt}`),
              h("span", { class: "rel-nota" }, ` vs. ${brl0(mv.anterior)} no mesmo período do mês passado`)),
            h("p", { class: "rel-nota" }, `${ganhos} ${ganhos === 1 ? vmin("negocio", "negócio") : vmin("negocios", "negócios")} ${adj("ganho", ganhos)} no mês · mês passado inteiro: ${brl0(mv.anteriorInteiro)}`)),
          h("div", { class: "ini-barras", role: "img", "aria-label": `Receita deste mês${ateDia}: ${brl0(mv.atual)}; mesmo período do mês passado: ${brl0(mv.anterior)}` },
            barraMes("Este mês", mv.atual, "ini-b-atual"), barraMes(`Mês passado${ateDia}`, mv.anterior, "ini-b-antes")),
          h("div", { class: "ini-numeros ini-numeros-2" },
            (podeCrm ? h("a", { class: "ini-numero", href: "#/crm", dataset: { k: "n-ab" } }, num(n.abertos, int, "ini-n", "negocios.abertos"), h("span", { class: "ini-n-l" }, txtAbertos))
              : h("div", { class: "ini-numero" }, num(n.abertos, int, "ini-n", "negocios.abertos"), h("span", { class: "ini-n-l" }, txtAbertos))),
            h("div", { class: "ini-numero", title: "soma do valor previsto × a probabilidade de cada etapa" }, num(n.previsao_ponderada, brl0, "ini-n", "negocios.previsao_ponderada"), h("span", { class: "ini-n-l" }, "previsão ponderada"))));
      },

      tarefas: () => {
        const lista = h("ul", { class: "ini-tarefas" });
        (t.proximas || []).forEach(tf => lista.append(itemTarefa(tf)));
        if (!lista.childElementCount) lista.append(h("li", { class: "rel-vazio-txt" }, "Nenhuma tarefa aberta com você."));
        const numT = (v, rot, hash, k, cls, chave) => podeTarefas
          ? h("a", { class: "ini-numero", href: hash, dataset: { k } }, num(v, int, cls, chave), h("span", { class: "ini-n-l" }, rot))
          : h("div", { class: "ini-numero" }, num(v, int, cls, chave), h("span", { class: "ini-n-l" }, rot));
        return h("section", { class: "rel-cartao ini-tf rel-entra", "aria-labelledby": "ini-tf", style: "--i:3" },
          h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-tf", class: "rel-h2" }, "Tarefas"),
            podeTarefas ? h("a", { class: "rel-link", href: "#/tarefas" }, "Ver todas") : null),
          h("div", { class: "ini-numeros ini-numeros-2" },
            numT(t.hoje, "para hoje", "#/tarefas?aba=hoje", "t-hj", "ini-n", "tarefas.hoje"),
            numT(t.atrasadas, "atrasadas", "#/tarefas?aba=atrasadas", "t-at", `ini-n${+t.atrasadas ? " ini-n-ruim" : ""}`, "tarefas.atrasadas")),
          h("p", { class: "rel-olho ini-sub" }, "Próximas"), lista);
      },

      numeros: () => {
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
        return h("section", { class: "rel-cartao ini-num rel-entra", "aria-labelledby": "ini-nm", style: "--i:4" },
          h("div", { class: "rel-cartao-topo" }, h("h2", { id: "ini-nm", class: "rel-h2" }, "Números de WhatsApp"),
            ctx.pode("admin") ? h("a", { class: "rel-link", href: "#/config/numeros" }, canais.length ? "Gerenciar" : "Conectar") : null),
          lc);
      },
    };
    const NOMES = { atendimento: "Atendimento", tarefas: "Tarefas", numeros: "Números de WhatsApp", vendas: "Vendas", leads: "Leads" };
    const { abertos, recolhidos } = L.blocosInicio(d);

    // sem pendência (e com algo a dizer na manchete): o selo "Tudo em dia."
    if (!m.pendencia && m.contexto) {
      corpo.append(h("div", { class: "ini-em-dia rel-entra" }, ui.vazio({ tipo: "em_dia", titulo: "Tudo em dia.", texto: "Ninguém esperando resposta e nenhuma tarefa para hoje." })));
    }
    if (abertos.length) corpo.append(h("div", { class: "ini-grade" }, abertos.map(id => construtores[id]())));
    if (recolhidos.length) {
      const det = h("details", { class: "ini-mais", open: maisAberto },
        h("summary", {}, h("span", { class: "ini-mais-t" }, "Mais detalhes"), h("span", { class: "rel-nota" }, recolhidos.map(id => NOMES[id]).join(" · "))),
        h("div", { class: "ini-grade" }, recolhidos.map(id => construtores[id]())));
      det.addEventListener("toggle", () => { maisAberto = det.open; });
      corpo.append(det);
    }

    // o número que mudou desde a última leitura acende (resposta ao dado)
    if (antes) for (const chave of L.numerosMudaram(antes, d)) { const el = corpo.querySelector(`[data-n="${chave}"]`); if (el) G.destacar(el); }
    trocar().then(() => { for (const f of contarDepois) f(); });
    if (foco) { const alvo = raiz.querySelector(`[data-k="${CSS.escape(foco)}"]`); if (alvo) alvo.focus({ preventScroll: true }); }
  }

  /** 1ª pintura: o esqueleto sai e o cabeçalho + o corpo entram com um fade curto (a troca não desloca nada). */
  function trocar() { if (colocado) return Promise.resolve(); colocado = true; return ui.trocarEsqueleto(raiz, [cab, corpo]); }

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
  // o shell não troca de versão no meio de uma tarefa marcada como concluída
  if (typeof ctx.naoAtualizar === "function") cancelarOcupado = ctx.naoAtualizar(() => !!document.querySelector(".ini-tf-item.feita"));
  // tempo real: o pulso avisa que algo mudou; recarrega no máximo a cada 30 s
  cancelarPulso = ctx.pulso.assinar(() => {
    if (tPulso) return;
    const falta = Math.max(0, INTERVALO_PULSO - (Date.now() - ultimaCarga));
    tPulso = setTimeout(() => { tPulso = 0; if (!document.hidden) carregar(); }, falta);
  });
}
