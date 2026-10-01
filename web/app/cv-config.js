/* ============================================================
   ÓRBITA — cv-config.js · frente F5 · ESPEC §7.7 T14 (seções de atendimento)
   secoesConfig (o hub config.js da F3 carrega por import() com ?v=):
     numeros   — Números de WhatsApp: lista + assistente em 5 passos
                 (o que é preciso · dados · webhook · inscrever app · testar)
     respostas — Respostas rápidas (/atalho) com variáveis e prévia
   Nada de segredo volta do servidor: token e app secret só são
   escritos ("✓ preenchido" quando já existem).
   ============================================================ */

async function logica(ctx) { return import(`./cv-logica.js?v=${encodeURIComponent(ctx.versao || "dev")}`); }

const STATUS_CANAL = { ativo: ["Ativo", "ok"], pendente: ["Pendente", "aten"], erro: ["Com erro", "ruim"] };

/* ============================================================ NÚMEROS */
async function montarNumeros(ctx, alvo) {
  const { ui } = ctx;
  const h = ui.h;
  await ui.carregarCss("conversas");
  let canais = [], base = null;

  const lista = h("div", { class: "cfg-canais" });
  const novo = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("mais"), "Conectar número");
  novo.addEventListener("click", () => assistente(null));
  const novoCodeWords = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("chat"), "Adicionar WhatsApp pelo CodeWords");
  novoCodeWords.addEventListener("click", () => assistenteCodeWords(null));
  ui.limpar(alvo);
  alvo.append(
    h("header", { class: "cab-pag" },
      h("div", null, h("p", { class: "rotulo" }, "Atendimento"), h("h1", { class: "titulo-pag" }, "Números de WhatsApp"),
        h("p", { class: "sub" }, "Conecte pela API oficial da Meta ou pelo CodeWords. As conversas, respostas e confirmações aparecem nesta central.")),
      h("div", { class: "linha" }, novo, novoCodeWords)),
    lista);

  async function carregar() {
    ui.limpar(lista);
    lista.appendChild(ui.esqueleto("cartoes", 2));
    try {
      [canais, base] = await Promise.all([ctx.api.rpcC("nx_canais_listar"), ctx.api.rpcC("nx_cv_base")]);
      desenhar();
    } catch (e) {
      ui.limpar(lista);
      lista.appendChild(ui.erroCartao(e, carregar));
    }
  }

  function depNome(id) { const d = ((base && base.departamentos) || []).find(x => x.id === id); return d ? d.nome : "—"; }

  function desenhar() {
    ui.limpar(lista);
    if (!canais || !canais.length) {
      lista.appendChild(ui.vazio({ titulo: "Nenhum número conectado.", icone: "whatsapp",
        texto: "Conecte o WhatsApp da empresa para receber e responder as conversas aqui. Leva uns 10 minutos com o acesso ao Meta Business em mãos.",
        acao: { rotulo: "Conectar número", fn: () => assistente(null) } }));
      return;
    }
    for (const c of canais) {
      const [rot, cor] = STATUS_CANAL[c.status] || [c.status, "neutra"];
      if (c.provedor === "codewords") {
        lista.appendChild(cartaoCodeWords(c));
        continue;
      }
      const ok = (v, sim, nao, nulo) => ui.pilula(v === true ? sim : v === false ? nao : nulo, v === true ? "ok" : v === false ? "ruim" : "neutra",
        { icone: v === true ? "check" : v === false ? "alerta" : "relogio" });
      const bTestar = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Testar conexão");
      bTestar.addEventListener("click", () => testar(c, bTestar));
      const bInscr = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Inscrever app");
      bInscr.addEventListener("click", () => inscrever(c, bInscr));
      const bSync = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Sincronizar modelos");
      bSync.addEventListener("click", () => sincronizar(c, bSync));
      const bMais = h("button", { type: "button", class: "bt-icone", "aria-label": `Mais opções de ${c.nome}` }, ui.icone("opcoes"));
      bMais.addEventListener("click", () => ui.menu(bMais, [
        { rotulo: "Editar dados", icone: "editar", fn: () => assistente(c, 2) },
        { rotulo: "Webhook (URL e token)", icone: "link", fn: () => assistente(c, 3) },
        "-",
        { rotulo: "Excluir número", icone: "lixeira", perigo: true, fn: () => excluir(c) },
      ]));
      lista.appendChild(h("article", { class: "cartao cfg-canal" },
        h("div", null,
          h("h3", { class: "titulo-sec" }, c.nome, ui.pilula(rot, cor)),
          h("div", { class: "cfg-canal-kv" },
            h("span", null, "Número ", h("b", null, c.numero_exibicao || "—")),
            h("span", null, "Phone number ID ", h("b", null, c.phone_number_id || "—")),
            h("span", null, "WABA ", h("b", null, c.waba_id || "—")),
            h("span", null, "Departamento ", h("b", null, depNome(c.departamento_id))),
            c.qualidade ? h("span", null, "Qualidade ", h("b", null, c.qualidade)) : null,
            c.verificado_em ? h("span", null, "Testado ", h("b", null, ui.relativo(c.verificado_em))) : null),
          h("div", { class: "cfg-checks" },
            ok(c.tem_token, "Token", "Sem token", "Sem token"),
            c.tem_app_secret ? ui.pilula("Webhook próprio", "info") : ui.pilula("Webhook do app da plataforma", "neutra"),
            ok(c.app_inscrito, "App inscrito", "App NÃO inscrito", "Inscrição não testada")),
          c.ultimo_erro ? h("div", { class: "aviso aviso-ruim cfg-erro" }, ui.icone("alerta"), h("p", null, c.ultimo_erro)) : null),
        h("div", { class: "cfg-canal-acoes" }, bTestar, bInscr, bSync, bMais)));
    }
  }

  function erroFuncao(e) {
    const c = e && e.codigo;
    if (c === "http_404" || c === "sem_conexao" || /^http_5/.test(String(c))) return "A função de WhatsApp não respondeu agora. Tente de novo em alguns minutos.";
    return ui.mensagemErro(e);
  }

  async function testar(c, botao) {
    try {
      const r = await ui.carregando(botao, ctx.api.fn("nx-enviar", { acao: "testar_canal", canal: c.id }));
      ui.toast(`Número ${r && r.numero ? r.numero : ""} ✓ · App inscrito ${r && r.app_inscrito ? "✓" : "✗"}`, { tipo: r && r.app_inscrito ? "ok" : "info" });
    } catch (e) { ui.toast(erroFuncao(e), { tipo: "erro" }); }
    carregar();
  }
  async function inscrever(c, botao) {
    try {
      const r = await ui.carregando(botao, ctx.api.fn("nx-enviar", { acao: "inscrever_app", canal: c.id }));
      ui.toast(r && r.app_inscrito ? "App inscrito na WABA. As mensagens já podem chegar." : "A Meta não confirmou a inscrição. Confira as permissões do token.", { tipo: r && r.app_inscrito ? "ok" : "erro" });
    } catch (e) { ui.toast(erroFuncao(e), { tipo: "erro" }); }
    carregar();
  }
  async function sincronizar(c, botao) {
    try {
      const r = await ui.carregando(botao, ctx.api.fn("nx-enviar", { acao: "sincronizar_templates", canal: c.id }));
      ui.toast(`${(r && r.total) || 0} modelo(s) sincronizado(s).`, { tipo: "ok" });
    } catch (e) { ui.toast(erroFuncao(e), { tipo: "erro" }); }
  }
  async function excluir(c) {
    const ok = await ui.confirmar({ titulo: `Excluir o número ${c.nome}?`, perigo: true, digitar: "excluir",
      texto: "As conversas e mensagens continuam guardadas, mas deixam de receber e enviar por este número. O token e o app secret são apagados do cofre." });
    if (!ok) return;
    try {
      await ctx.api.rpcC("nx_canal_excluir", { p_id: c.id, p_confirmacao: "excluir" });
      ui.toast("Número excluído.", { tipo: "ok" });
      carregar();
    } catch (e) { ui.toast(ui.mensagemErro(e), { tipo: "erro" }); }
  }

  const estadosCodeWords = new Map();

  function estadoVisualCodeWords(c) {
    const s = estadosCodeWords.get(c.id), cw = c.codewords || {};
    if (s) {
      if (s.inscrito_certo) return ["Conectado", "ok"];
      if (!s.pareado || s.conectado === false) return ["Desconectado", "ruim"];
      if (s.pareado && s.conectado && (s.numero_confere !== true || s.rota_atual !== s.rota_esperada)) return ["Conectado mas sem receber", "aten"];
    }
    if (cw.conectado === false && cw.phone_id) return ["Desconectado", "ruim"];
    if (cw.conectado === true) {
      if (cw.numero_conferido === false) return ["Conectado mas sem receber", "aten"];
      if (cw.numero_conferido === true) {
        const rotaOk = cw.rota === "direta"
          ? String(cw.inscricao || "").includes("URL deste canal")
          : !!cw.service_id && String(cw.inscricao || "").startsWith(cw.service_id);
        return rotaOk ? ["Conectado", "ok"] : ["Conectado mas sem receber", "aten"];
      }
    }
    return ["Não sei", "neutra"];
  }

  async function consultarEstadoCodeWords(c, botao) {
    try {
      const r = await ui.carregando(botao, ctx.api.fn("nx-codewords", { acao: "estado", canal: c.id }));
      estadosCodeWords.set(c.id, r || {});
      if (r?.ok && r.inscrito_certo) ui.toast("WhatsApp conectado e recebendo pelo destino configurado.", { tipo: "ok" });
      else ui.toast(r?.motivo || r?.detalhe || "Situação atualizada. Confira o estado do número.", { tipo: r?.ok ? "info" : "erro" });
      await carregar();
    } catch (e) { ui.toast(erroFuncao(e), { tipo: "erro" }); }
  }

  function cartaoCodeWords(c) {
    const cw = c.codewords || {};
    const [rotulo, cor] = estadoVisualCodeWords(c);
    const atualizar = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Atualizar");
    atualizar.addEventListener("click", () => consultarEstadoCodeWords(c, atualizar));
    const conectar = h("button", { type: "button", class: "bt bt-prim bt-p" }, ui.icone("whatsapp"), "Conectar WhatsApp");
    conectar.addEventListener("click", () => assistenteCodeWords(c));
    const configurar = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Configurar");
    configurar.addEventListener("click", () => assistenteCodeWords(c));
    const mais = h("button", { type: "button", class: "bt-icone", "aria-label": `Mais opções de ${c.nome}` }, ui.icone("opcoes"));
    mais.addEventListener("click", () => ui.menu(mais, [
      { rotulo: "Configurar CodeWords", icone: "editar", fn: () => assistenteCodeWords(c) }, "-",
      { rotulo: "Excluir número", icone: "lixeira", perigo: true, fn: () => excluir(c) },
    ]));
    const ultimo = estadosCodeWords.get(c.id);
    const resumoRota = cw.rota === "direta"
      ? ui.pilula("Recebimento direto no Órbita", "info")
      : cw.ia_ligada && rotulo === "Conectado" ? ui.pilula("IA 24h ativa", "ok", { icone: "ia" })
        : cw.ia_ligada ? ui.pilula("IA ainda não validada", "aten", { icone: "ia" }) : ui.pilula("IA desligada", "neutra", { icone: "ia" });
    const explicacao = ultimo?.motivo || (cw.sync?.erro ? `Última sincronização: ${cw.sync.erro}` :
      rotulo === "Não sei" ? "Atualize para conferir se o aparelho está pareado e recebendo mensagens." :
      rotulo === "Conectado mas sem receber" ? "O aparelho está ligado, mas o destino das mensagens precisa ser corrigido." :
      rotulo === "Desconectado" ? "Pareie ou reconecte este número pelo WhatsApp no celular." : "O aparelho e o destino foram conferidos.");
    return h("article", { class: "cartao cfg-canal cfg-cw-card" },
      h("div", { class: "cfg-cw-main" },
        h("div", { class: "cfg-cw-titulo" }, h("h3", { class: "titulo-sec" }, c.nome), ui.pilula(rotulo, cor, { icone: cor === "ok" ? "check" : cor === "ruim" ? "alerta" : "relogio" }), ui.pilula("CodeWords", "info")),
        h("div", { class: "cfg-canal-kv" },
          h("span", null, "Número ", h("b", null, c.numero_exibicao || cw.numero || "—")),
          h("span", null, "Fluxo de IA ", h("b", { class: "mono" }, cw.service_id || "Ainda não configurado")),
          h("span", null, "Departamento ", h("b", null, depNome(c.departamento_id)))),
        h("div", { class: "cfg-checks" },
          cw.tem_api_key ? ui.pilula("Chave salva", "ok", { icone: "cadeado" }) : ui.pilula("Chave ausente", "ruim"),
          resumoRota,
          cw.sync?.em ? ui.pilula(`Sincronizado ${ui.relativo(cw.sync.em)}`, cw.sync.erro ? "aten" : "neutra") : null),
        h("p", { class: "sub cfg-cw-status-text", role: "status" }, explicacao),
        c.ultimo_erro ? h("div", { class: "aviso aviso-aten cfg-erro" }, ui.icone("info"), h("p", null, c.ultimo_erro)) : null),
      h("div", { class: "cfg-canal-acoes cfg-cw-card-actions" }, atualizar, conectar, configurar, mais));
  }

  async function assistenteCodeWords(canal) {
    let atual = canal ? { ...canal, codewords: { ...(canal.codewords || {}) } } : null;
    const cw = atual?.codewords || {};
    const corpo = h("div", { class: "pilha cfg-cw-config" });
    const form = h("form", { class: "pilha", novalidate: true });
    const chaveWrap = ui.campo({ rotulo: "Chave da API CodeWords", nome: "codewords_api_key", tipo: "senha", autocomplete: "new-password",
      placeholder: "cwk-…", ajuda: "Chave reutilizável do plano pago. Ela é enviada ao servidor e nunca volta para esta tela." });
    const chave = chaveWrap.querySelector('input[name="codewords_api_key"]');
    const chaveSalva = h("div", { class: "cfg-cw-key-state" },
      atual?.codewords?.tem_api_key ? ui.pilula("Chave salva com segurança", "ok", { icone: "cadeado" }) : ui.pilula("Adicione sua chave para começar", "aten"));
    const trocarChave = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Trocar chave");
    if (atual?.codewords?.tem_api_key) chaveWrap.hidden = true;
    trocarChave.hidden = !atual?.codewords?.tem_api_key;
    trocarChave.addEventListener("click", () => { chaveWrap.hidden = false; trocarChave.hidden = true; chave.focus(); });
    const campos = h("div", { class: "grade-2 cfg-cw-grid" },
      ui.campo({ rotulo: "Nome do canal", nome: "nome", valor: atual?.nome || "WhatsApp via CodeWords", max: 40, obrigatorio: true }),
      ui.campo({ rotulo: "Número do WhatsApp", nome: "numero_exibicao", tipo: "tel", valor: atual?.numero_exibicao || cw.numero || "", max: 30, placeholder: "+55 12 99999-9999", obrigatorio: true }));
    form.append(...[h("p", { class: "sub" }, "Conecte o aparelho do WhatsApp e receba as conversas nesta caixa. A chave fica protegida no servidor."),
      campos, chaveSalva, h("div", { class: "linha cfg-cw-key-row" }, trocarChave), chaveWrap,
      ui.campo({ rotulo: "Service ID do fluxo de IA", nome: "codewords_service_id", valor: cw.service_id || "", max: 120, autocomplete: "off",
        ajuda: "Opcional para conectar. Necessário somente para encaminhar as mensagens ao agente do CodeWords." }),
      (base?.departamentos || []).length ? ui.campo({ rotulo: "Conversas novas caem em", nome: "departamento_id", tipo: "select",
        valor: atual?.departamento_id || (base.departamentos.find(d => d.padrao) || base.departamentos[0]).id,
        opcoes: base.departamentos.map(d => ({ valor: d.id, rotulo: d.nome })) }) : null,
      h("section", { class: "cartao cfg-cw-ia" },
        h("div", { class: "cfg-cw-ia-head" }, ui.icone("ia"), h("div", null, h("h3", { class: "titulo-sec" }, "IA no WhatsApp"), h("p", { class: "sub" }, "O CodeWords responde pelo celular conectado; a equipe pode assumir uma conversa a qualquer momento."))),
        ui.campo({ rotulo: "IA atendendo 24h", nome: "ia_ligada", tipo: "interruptor",
          valor: cw.rota === "direta" ? false : (cw.ia_ligada ?? atual?.ia_ligada ?? true),
          ajuda: "Quando desligada, o fluxo não responde automaticamente por este número. Só vale quando o destino estiver ligado ao fluxo de IA." }),
        ui.campo({ rotulo: "A IA volta automaticamente após", nome: "ia_volta_horas", tipo: "select", valor: String(cw.ia_volta_horas ?? 6),
          opcoes: [{ valor: "1", rotulo: "1 hora" }, { valor: "2", rotulo: "2 horas" }, { valor: "4", rotulo: "4 horas" }, { valor: "6", rotulo: "6 horas" }, { valor: "8", rotulo: "8 horas" }, { valor: "12", rotulo: "12 horas" }, { valor: "24", rotulo: "24 horas" }, { valor: "48", rotulo: "48 horas" }, { valor: "72", rotulo: "72 horas" }, { valor: "168", rotulo: "7 dias" }, { valor: "0", rotulo: "Somente quando a equipe devolver" }] }),
        h("p", { class: "sub" }, "Esse prazo começa quando alguém da equipe assume uma conversa."))].filter(Boolean));
    const operacoes = h("section", { class: "cfg-cw-ops pilha", hidden: !atual?.id },
      h("div", { class: "cfg-cw-ops-head" }, h("h3", { class: "titulo-sec" }, "Conectar e validar"),
        h("p", { class: "sub" }, "Confira o estado do aparelho antes de encaminhar mensagens.")));
    const statusAtual = h("div", { class: "cfg-cw-resultado", role: "status", "aria-live": "polite" });
    const codigoPareamento = h("section", { class: "cfg-cw-pair", hidden: true });
    const receitaBox = h("section", { class: "cfg-cw-receita", hidden: true });
    const bEstado = h("button", { type: "button", class: "bt bt-sec" }, "Atualizar situação");
    const bParear = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("whatsapp"), "Conectar WhatsApp");
    const bFluxo = h("button", { type: "button", class: "bt bt-sec" }, "Ligar o número na IA");
    const bDireto = h("button", { type: "button", class: "bt bt-sec" }, "Receber direto no Órbita, sem IA");
    const bTeste = h("button", { type: "button", class: "bt bt-sec" }, "Enviar mensagem de teste");
    const bPrompt = h("button", { type: "button", class: "bt bt-fant" }, ui.icone("copiar"), "Copiar prompt para o CodeWords");
    const gradeAcoes = h("div", { class: "cfg-cw-ops-actions" }, bEstado, bParear, bFluxo, bDireto, bTeste, bPrompt);
    operacoes.append(gradeAcoes, statusAtual, codigoPareamento, receitaBox);
    corpo.append(form, operacoes);

    async function salvarConfiguracao({ silencioso = false } = {}) {
      const d = ui.lerForm(form); ui.marcarErro(form, null);
      if (!d.nome) { ui.marcarErro(form, "nome", "Informe o nome do canal."); return false; }
      if (!/^\+?[0-9 ()-]{8,30}$/.test(String(d.numero_exibicao || ""))) { ui.marcarErro(form, "numero_exibicao", "Informe o número com DDI e DDD."); return false; }
      const apiKey = String(d.codewords_api_key || "").trim();
      if (!atual?.id && !apiKey) { ui.marcarErro(form, "codewords_api_key", "Cole a chave reutilizável do plano pago."); return false; }
      if (apiKey && (apiKey.length < 20 || !apiKey.startsWith("cwk-") || /\s/.test(apiKey))) {
        ui.marcarErro(form, "codewords_api_key", "Use uma chave reutilizável cwk- com pelo menos 20 caracteres."); return false;
      }
      const payload = { nome: d.nome, numero_exibicao: d.numero_exibicao,
        departamento_id: d.departamento_id || null, ia_ligada: !!d.ia_ligada, ia_volta_horas: Number(d.ia_volta_horas ?? 6) };
      if (atual?.id) payload.id = atual.id;
      if (d.codewords_service_id) payload.codewords_service_id = d.codewords_service_id;
      if (apiKey) payload.codewords_api_key = apiKey;
      try {
        const r = await ctx.api.rpcC("nx_codewords_canal_salvar", { p_canal: payload });
        const id = r?.canal?.id || r?.canal?.canal_id || atual?.id;
        chave.value = "";
        const listaNova = await ctx.api.rpcC("nx_canais_listar");
        canais = Array.isArray(listaNova) ? listaNova : listaNova?.canais || canais;
        atual = canais.find(x => x.id === id) || { ...(atual || {}), id, nome: d.nome,
          numero_exibicao: d.numero_exibicao, departamento_id: d.departamento_id || null,
          codewords: { ...(atual?.codewords || {}), tem_api_key: !!apiKey || !!atual?.codewords?.tem_api_key,
            service_id: d.codewords_service_id || atual?.codewords?.service_id || null, ia_ligada: !!d.ia_ligada,
            ia_volta_horas: Number(d.ia_volta_horas ?? 6) } };
        if (apiKey) { chaveSalva.replaceChildren(ui.pilula("Chave salva com segurança", "ok", { icone: "cadeado" })); chaveWrap.hidden = true; trocarChave.hidden = false; }
        operacoes.hidden = false;
        ui.limpar(codigoPareamento); codigoPareamento.hidden = true;
        ui.limpar(receitaBox); receitaBox.hidden = true;
        carregar();
        if (!silencioso) ui.toast("Número e preferências salvos.", { tipo: "ok" });
        return true;
      } catch (e) {
        const hint = e?.hint;
        if (e?.codigo === "dados_invalidos" && hint && form.querySelector(`[data-campo="${hint}"]`)) {
          ui.marcarErro(form, hint, "Confira este campo."); return false;
        }
        ui.toast(ui.mensagemErro(e), { tipo: "erro" });
        return false;
      }
    }

    async function guardarAntesDaAcao() {
      if (!await salvarConfiguracao({ silencioso: true })) return false;
      return true;
    }
    async function acaoCodeWords(acao, payload = {}) {
      if (!atual?.id) { ui.toast("Salve o número antes de continuar.", { tipo: "info" }); return null; }
      try {
        const r = await ctx.api.fn("nx-codewords", { acao, canal: atual.id, ...payload });
        if (!r?.ok) throw Object.assign(new Error(r?.detalhe || r?.erro || "A ação não foi concluída."), { detalhe_texto: r?.detalhe || r?.erro });
        return r;
      } catch (e) { ui.toast(erroFuncao(e), { tipo: "erro" }); return null; }
    }
    bEstado.addEventListener("click", async () => {
      const r = await acaoCodeWords("estado"); if (!r) return;
      estadosCodeWords.set(atual.id, r);
      statusAtual.textContent = r.inscrito_certo ? "Conectado e recebendo mensagens." : r.motivo || "Situação consultada.";
      carregar();
    });
    bParear.addEventListener("click", async () => {
      if (!await guardarAntesDaAcao()) return;
      const r = await acaoCodeWords("parear"); if (!r) return;
      const copiarCodigo = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("copiar"), "Copiar código");
      copiarCodigo.addEventListener("click", () => ui.copiar(r.codigo, { aviso: "Código copiado. Digite-o no WhatsApp do número cadastrado." }));
      ui.limpar(codigoPareamento); codigoPareamento.hidden = false;
      codigoPareamento.append(h("p", { class: "rotulo" }, "Pareamento do WhatsApp"),
        h("p", { class: "cfg-cw-code", "aria-label": `Código de pareamento ${r.codigo}` }, r.codigo),
        h("p", { class: "sub" }, r.instrucoes || "No WhatsApp do celular, abra Aparelhos conectados, escolha Conectar aparelho e depois Conectar com número de telefone."), copiarCodigo,
        h("p", { class: "sub" }, "Depois de concluir no celular, volte aqui e toque em «Atualizar situação»."));
    });
    bFluxo.addEventListener("click", async () => {
      const service = form.querySelector('[name="codewords_service_id"]')?.value.trim();
      if (!service) { ui.toast("Informe e salve o Service ID do fluxo de IA primeiro.", { tipo: "info" }); form.querySelector('[name="codewords_service_id"]')?.focus(); return; }
      const confirmado = await ui.confirmar({ titulo: "Ligar o número na IA?", rotulo: "Ligar na IA",
        texto: "O CodeWords encaminhará as mensagens deste WhatsApp ao fluxo de IA. Confirme que o aparelho pareado mostra o mesmo número e que o fluxo está publicado." });
      if (!confirmado) return;
      form.querySelector('[name="ia_ligada"]').checked = true;
      if (!await guardarAntesDaAcao()) return;
      const r = await acaoCodeWords("ligar_fluxo"); if (!r) return;
      estadosCodeWords.set(atual.id, { ...r, inscrito_certo: true, pareado: true, conectado: true, numero_confere: true, rota_atual: "fluxo", rota_esperada: "fluxo" });
      statusAtual.textContent = "Número ligado ao fluxo de IA. Toque em Atualizar situação para confirmar a conexão no aparelho.";
      ui.toast("Fluxo de IA conectado. Confirme o estado do aparelho.", { tipo: "ok" }); carregar();
    });
    bDireto.addEventListener("click", async () => {
      const confirmado = await ui.confirmar({ titulo: "Receber mensagens direto no Órbita?", rotulo: "Receber no Órbita",
        texto: "O aparelho deixará de encaminhar mensagens ao fluxo externo de IA e passará a enviá-las diretamente para a caixa Conversas do Órbita." });
      if (!confirmado) return;
      form.querySelector('[name="ia_ligada"]').checked = false;
      if (!await guardarAntesDaAcao()) return;
      const r = await acaoCodeWords("receber_aqui"); if (!r) return;
      estadosCodeWords.set(atual.id, { ...r, inscrito_certo: true, pareado: true, conectado: true, numero_confere: true, rota_atual: "direta", rota_esperada: "direta" });
      statusAtual.textContent = "O aparelho agora envia mensagens diretamente para o Órbita.";
      ui.toast("Recebimento direto ativado.", { tipo: "ok" }); carregar();
    });
    bTeste.addEventListener("click", async () => {
      const confirmado = await ui.confirmar({ titulo: "Enviar uma mensagem de teste?", rotulo: "Enviar teste",
        texto: `Será enviada uma mensagem real pelo CodeWords para o número conectado (${atual?.numero_exibicao || cw.numero || "este canal"}).` });
      if (!confirmado || !await guardarAntesDaAcao()) return;
      const r = await acaoCodeWords("enviar_teste"); if (!r) return;
      ui.toast("O CodeWords aceitou o teste. Confira o WhatsApp do número conectado.", { tipo: "ok" });
    });
    bPrompt.addEventListener("click", async () => {
      if (!await guardarAntesDaAcao()) return;
      const r = await acaoCodeWords("receita"); if (!r) return;
      const pre = h("pre", { class: "cfg-codigo cfg-cw-prompt", tabindex: "0", "aria-label": "Prompt de configuração do CodeWords" }, h("code", {}, r.prompt || ""));
      const copiar = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("copiar"), "Copiar prompt para o CodeWords");
      copiar.addEventListener("click", () => ui.copiar(r.prompt || "", { aviso: "Prompt copiado. Cole no CodeWords e mantenha a URL secreta privada." }));
      ui.limpar(receitaBox); receitaBox.hidden = false;
      receitaBox.append(h("div", { class: "aviso aviso-aten" }, ui.icone("cadeado"), h("p", null, "O prompt contém a URL secreta deste canal. Cole somente no CodeWords e não compartilhe o texto.")), pre, copiar);
    });

    await ui.modal({
      titulo: atual ? `WhatsApp CodeWords · ${atual.nome}` : "Adicionar WhatsApp pelo CodeWords",
      corpo, largura: "g", fecharFora: false,
      acoes: [
        { rotulo: "Fechar", tipo: "neutro" },
        { rotulo: "Salvar configuração", tipo: "primario", fn: async () => {
          const ok = await salvarConfiguracao();
          return ok ? false : false;
        } },
      ],
    });
  }

  /* ---------------- assistente em 5 passos */
  async function assistente(canal, passoInicial = 1) {
    let passo = passoInicial;
    let atual = canal;             // canal salvo (depois do passo 2)
    let webhook = canal ? canal.webhook : null;
    const corpo = h("div", { class: "pilha" });
    const trilha = h("div", { class: "cfg-passos", "aria-hidden": "true" }, [1, 2, 3, 4, 5].map(() => h("span", { class: "cfg-passo" })));
    const conteudo = h("div", { class: "pilha" });
    corpo.append(trilha, conteudo);
    let form = null;

    function marcarTrilha() { [...trilha.children].forEach((s, i) => { s.dataset.feito = i < passo ? "1" : "0"; }); }

    function copia(rot, valor, id) {
      const inp = h("input", { id, type: "text", readonly: true, value: valor || "", class: "mono" });
      inp.addEventListener("focus", () => inp.select());
      return h("div", { class: "campo" }, h("label", { for: id }, rot),
        h("div", { class: "cfg-copia" }, inp, h("button", { type: "button", class: "bt bt-sec", on: { click: () => ui.copiar(valor, { aviso: `${rot} copiado.` }) } }, ui.icone("copiar"), "Copiar")));
    }

    function desenharPasso(api) {
      marcarTrilha();
      ui.limpar(conteudo);
      const prim = api && api.el.querySelector(".modal-rod [data-tipo=primario]");
      const volta = api && api.el.querySelector(".modal-rod [data-tipo=neutro]");
      if (prim) prim.textContent = passo === 2 ? (canal && passoInicial === 2 ? "Salvar" : "Salvar e continuar") : passo === 5 || (canal && passoInicial === 3 && passo === 3) ? "Concluir" : "Continuar";
      if (volta) volta.textContent = passo > 1 && !(canal && passo === passoInicial) ? "Voltar" : "Fechar";
      if (passo === 1) {
        conteudo.append(h("h3", { class: "titulo-sec" }, "1. O que é preciso"),
          h("ol", { class: "cfg-lista-req" },
            h("li", null, "Acesso ao Meta Business da empresa, com um app que tenha o produto WhatsApp."),
            h("li", null, "Um número dedicado (ou migrado) para a API oficial."),
            h("li", null, "Um token permanente de usuário do sistema com as permissões whatsapp_business_messaging e whatsapp_business_management."),
            h("li", null, "O Phone number ID e o WhatsApp Business Account ID (WABA), que aparecem em WhatsApp → Configuração da API.")),
          h("div", { class: "aviso aviso-aten" }, ui.icone("alerta"),
            h("p", null, h("b", null, "Atenção: "), "o número conectado por este caminho deixa de funcionar no aplicativo WhatsApp do celular. Para usar os dois ao mesmo tempo (coexistência) é preciso outro tipo de conexão — fale com o suporte.")));
      } else if (passo === 2) {
        const deps = (base && base.departamentos) || [];
        form = h("form", { class: "pilha", novalidate: true },
          h("h3", { class: "titulo-sec" }, "2. Dados do número"),
          h("div", { class: "grade-2" },
            ui.campo({ rotulo: "Nome na central", nome: "nome", valor: atual ? atual.nome : "WhatsApp", obrigatorio: true, max: 40, ajuda: "Ex.: Recepção, Comercial" }),
            ui.campo({ rotulo: "Número (como aparece)", nome: "numero_exibicao", valor: atual ? atual.numero_exibicao : "", max: 30, placeholder: "(12) 99999-9999" }),
            ui.campo({ rotulo: "Phone number ID", nome: "phone_number_id", valor: atual ? atual.phone_number_id : "", obrigatorio: true, inputmode: "numeric", autocomplete: "off" }),
            ui.campo({ rotulo: "WhatsApp Business Account ID (WABA)", nome: "waba_id", valor: atual ? atual.waba_id : "", obrigatorio: true, inputmode: "numeric", autocomplete: "off" })),
          ui.campo({ rotulo: "Token permanente", nome: "token", tipo: "senha", autocomplete: "new-password",
            placeholder: atual && atual.tem_token ? "✓ preenchido — deixe em branco para manter" : "EAAG…",
            ajuda: "Fica guardado no cofre criptografado. Nunca é mostrado de novo." }),
          ui.campo({ rotulo: "App secret (opcional)", nome: "app_secret", tipo: "senha", autocomplete: "new-password",
            placeholder: atual && atual.tem_app_secret ? "✓ preenchido — deixe em branco para manter" : "Só se o app da Meta for da sua empresa",
            ajuda: "Sem ele, o número usa o app da plataforma e o suporte cuida do webhook." }),
          deps.length ? ui.campo({ rotulo: "Conversas novas caem em", nome: "departamento_id", tipo: "select", valor: atual ? atual.departamento_id : (deps.find(d => d.padrao) || deps[0]).id,
            opcoes: deps.map(d => ({ valor: d.id, rotulo: d.nome })) }) : null);
        conteudo.appendChild(form);
      } else if (passo === 3) {
        const w = webhook || {};
        conteudo.append(h("h3", { class: "titulo-sec" }, "3. Webhook"));
        if (w.modo === "proprio") {
          conteudo.append(h("p", { class: "sub" }, "No Meta Developers, abra o app → WhatsApp → Configuração → Webhook. Cole a URL e o token abaixo, clique em Verificar e salvar e assine o campo «messages»."),
            h("div", { class: "cfg-webhook" }, copia("URL de retorno", w.url, "cfg-wh-url"), copia("Token de verificação", w.verify_token, "cfg-wh-tok")));
        } else {
          conteudo.append(h("div", { class: "aviso" }, ui.icone("info"),
            h("p", null, w.texto || "O webhook deste número é o do aplicativo da plataforma. Peça ao suporte para inscrever o app na WABA.")),
            h("p", { class: "sub" }, "Se preferir usar o app da sua empresa, volte e preencha o app secret."));
        }
      } else if (passo === 4) {
        const res = h("div", { class: "cfg-resultado", "aria-live": "polite" });
        const b = h("button", { type: "button", class: "bt bt-prim" }, "Inscrever o app na WABA");
        b.addEventListener("click", async () => {
          ui.limpar(res);
          try {
            const r = await ui.carregando(b, ctx.api.fn("nx-enviar", { acao: "inscrever_app", canal: atual.id }));
            res.appendChild(r && r.app_inscrito ? ui.pilula("App inscrito ✓", "ok") : ui.pilula("A Meta não confirmou a inscrição", "ruim"));
          } catch (e) { res.appendChild(h("p", { class: "sub" }, erroFuncao(e))); }
        });
        conteudo.append(h("h3", { class: "titulo-sec" }, "4. Inscrever o app"),
          h("p", { class: "sub" }, "Sem a inscrição do app na conta do WhatsApp (WABA), a Meta não manda nenhuma mensagem para cá. Um clique resolve."),
          h("div", { class: "linha" }, b), res);
      } else if (passo === 5) {
        const res = h("div", { class: "cfg-resultado", "aria-live": "polite" });
        const bT = h("button", { type: "button", class: "bt bt-prim" }, "Testar conexão");
        const bS = h("button", { type: "button", class: "bt bt-sec" }, "Sincronizar modelos");
        bT.addEventListener("click", async () => {
          ui.limpar(res);
          try {
            const r = await ui.carregando(bT, ctx.api.fn("nx-enviar", { acao: "testar_canal", canal: atual.id }));
            res.append(...[ui.pilula(`Número ${r && r.numero ? r.numero : ""} ✓`, "ok"), ui.pilula(r && r.app_inscrito ? "App inscrito ✓" : "App inscrito ✗", r && r.app_inscrito ? "ok" : "ruim"),
              r && r.qualidade ? ui.pilula(`Qualidade ${r.qualidade}`, "neutra") : null].filter(Boolean));
          } catch (e) { res.appendChild(h("p", { class: "sub" }, erroFuncao(e))); }
        });
        bS.addEventListener("click", async () => {
          try { const r = await ui.carregando(bS, ctx.api.fn("nx-enviar", { acao: "sincronizar_templates", canal: atual.id })); res.appendChild(ui.pilula(`${(r && r.total) || 0} modelo(s)`, "info")); }
          catch (e) { res.appendChild(h("p", { class: "sub" }, erroFuncao(e))); }
        });
        conteudo.append(h("h3", { class: "titulo-sec" }, "5. Testar"),
          h("p", { class: "sub" }, "O número só fica «Ativo» quando responde à Meta E o app está inscrito. Depois, mande um «oi» de outro celular para ver a conversa chegar."),
          h("div", { class: "linha" }, bT, bS), res);
      }
      if (passo !== 2) setTimeout(() => { const f = conteudo.querySelector("button, input"); if (f) f.focus(); }, 30);
    }

    let apiModal = null;
    await ui.modal({
      titulo: canal ? `Número ${canal.nome}` : "Conectar número de WhatsApp", corpo, largura: "m", fecharFora: false,
      aoAbrir: api => { apiModal = api; desenharPasso(api); },
      acoes: [
        { rotulo: "Fechar", tipo: "neutro", fn: () => {
          if (passo > 1 && !(canal && passo === passoInicial)) { passo--; if (passo === 2 && !atual) passo = 2; desenharPasso(apiModal); return false; }
          return null;
        } },
        { rotulo: "Continuar", tipo: "primario", fn: async api => {
          if (passo === 2) {
            const d = ui.lerForm(form);
            ui.marcarErro(form, null);
            if (!d.nome) { ui.marcarErro(form, "nome", "Dê um nome (ex.: Recepção)."); return false; }
            if (!/^\d{5,30}$/.test(String(d.phone_number_id || "").replace(/\s/g, ""))) { ui.marcarErro(form, "phone_number_id", "Só números, como aparece na Meta."); return false; }
            if (!/^\d{5,30}$/.test(String(d.waba_id || "").replace(/\s/g, ""))) { ui.marcarErro(form, "waba_id", "Só números, como aparece na Meta."); return false; }
            if (!atual && !d.token) { ui.marcarErro(form, "token", "Cole o token permanente."); return false; }
            const payload = { nome: d.nome, phone_number_id: d.phone_number_id, waba_id: d.waba_id, numero_exibicao: d.numero_exibicao || null };
            if (atual) payload.id = atual.id;
            if (d.token) payload.token = d.token;
            if (d.app_secret) payload.app_secret = d.app_secret;
            if (d.departamento_id) payload.departamento_id = d.departamento_id;
            try {
              const r = await ctx.api.rpcC("nx_canal_salvar", { p_canal: payload });
              atual = { ...(r.canal || {}), webhook: r.webhook };
              webhook = r.webhook;
            } catch (e) {
              const cod = e && e.codigo, hint = e && e.hint;
              if (cod === "numero_em_uso") { ui.marcarErro(form, "phone_number_id", "Esse número já está conectado em outra empresa ou canal."); return false; }
              if (cod === "dados_invalidos" && hint && form.querySelector(`[data-campo="${hint}"]`)) { ui.marcarErro(form, hint, "Confira este campo."); return false; }
              throw e;
            }
            carregar();
            if (canal && passoInicial === 2) { ui.toast("Dados salvos.", { tipo: "ok" }); return true; }
          }
          if (passo === 5 || (canal && passoInicial === 3 && passo === 3)) return true;
          passo++;
          desenharPasso(api);
          return false;
        } },
      ],
    });
    carregar();
  }

  await carregar();
}

/* ============================================================ RESPOSTAS RÁPIDAS */
async function montarRespostas(ctx, alvo) {
  const { ui } = ctx;
  const h = ui.h;
  const [L] = await Promise.all([logica(ctx), ui.carregarCss("conversas")]);
  let base = null, respostas = [], filtro = "";
  const podeEditar = ctx.pode("supervisor");

  const busca = h("input", { type: "search", placeholder: "Buscar resposta", "aria-label": "Buscar resposta" });
  const caixa = h("div", { class: "pilha" });
  const nova = podeEditar ? h("button", { type: "button", class: "bt bt-prim", on: { click: () => editar(null) } }, ui.icone("mais"), "Nova resposta") : null;
  ui.limpar(alvo);
  alvo.append(
    h("header", { class: "cab-pag" },
      h("div", null, h("p", { class: "rotulo" }, "Atendimento"), h("h1", { class: "titulo-pag" }, "Respostas rápidas"),
        h("p", { class: "sub" }, "No chat, digite / e o atalho. As variáveis {primeiro_nome}, {nome}, {atendente}, {empresa} e {protocolo} são trocadas sozinhas.")),
      nova),
    h("div", { class: "fita" }, h("label", { class: "busca cresce" }, ui.icone("busca"), busca)),
    caixa);
  busca.addEventListener("input", ui.debounce(() => { filtro = busca.value; desenhar(); }, 150));

  const exemplo = () => ({ nome: "Maria Souza", primeiro_nome: "Maria", atendente: L.primeiroNome(ctx.sessao.conta.nome) || "Ana",
    empresa: (ctx.cliente && ctx.cliente.nome) || "Sua empresa", protocolo: "2026-000123" });

  async function carregar() {
    ui.limpar(caixa);
    caixa.appendChild(ui.esqueleto("tabela", 5));
    try {
      base = await ctx.api.rpcC("nx_cv_base");
      respostas = (base.respostas || []).slice();
      desenhar();
    } catch (e) { ui.limpar(caixa); caixa.appendChild(ui.erroCartao(e, carregar)); }
  }

  function depNome(id) { const d = ((base && base.departamentos) || []).find(x => x.id === id); return d ? d.nome : "Todos"; }

  function desenhar() {
    ui.limpar(caixa);
    const q = L.semAcento(filtro.trim());
    const linhas = respostas.filter(r => !q || L.semAcento(`${r.atalho} ${r.titulo} ${r.corpo}`).includes(q));
    if (!respostas.length) {
      caixa.appendChild(ui.vazio({ titulo: "Nenhuma resposta ainda.", icone: "chat", texto: "Cadastre as frases que a equipe repete todo dia: saudação, endereço, horários, confirmação.",
        acao: podeEditar ? { rotulo: "Nova resposta", fn: () => editar(null) } : null }));
      return;
    }
    const t = ui.tabela({
      rotulo: "Respostas rápidas",
      colunas: [
        { chave: "atalho", rotulo: "Atalho", render: r => h("span", { class: "mono" }, `/${r.atalho}`), largura: "9rem" },
        { chave: "titulo", rotulo: "Título", render: r => h("b", null, r.titulo) },
        { chave: "corpo", rotulo: "Prévia", render: r => h("span", { class: "cfg-resp-corpo", title: r.corpo }, L.aplicarVariaveis(r.corpo, exemplo())) },
        { chave: "departamento_id", rotulo: "Departamento", render: r => depNome(r.departamento_id) },
        { chave: "usos", rotulo: "Usos", render: r => h("span", { class: "mono" }, String(r.usos || 0)), alinhar: "dir" },
        { chave: "ativo", rotulo: "Situação", render: r => ui.pilula(r.ativo === false ? "Desligada" : "Ativa", r.ativo === false ? "neutra" : "ok") },
      ],
      linhas, vazio: "Nenhuma resposta com essa busca.",
      aoClicar: podeEditar ? r => editar(r) : null,
    });
    caixa.appendChild(t.el);
  }

  async function editar(r) {
    const deps = (base && base.departamentos) || [];
    const f = h("form", { class: "pilha", novalidate: true });
    const cAtalho = ui.campo({ rotulo: "Atalho", nome: "atalho", valor: r ? r.atalho : "", obrigatorio: true, max: 31, placeholder: "ola", ajuda: "Letras minúsculas, números, - e _. No chat: /atalho" });
    const cTitulo = ui.campo({ rotulo: "Título", nome: "titulo", valor: r ? r.titulo : "", obrigatorio: true, max: 60 });
    const cCorpo = ui.campo({ rotulo: "Texto", nome: "corpo", tipo: "textarea", valor: r ? r.corpo : "", obrigatorio: true, max: 4096, linhas: 5 });
    const ta = cCorpo.querySelector("textarea");
    const vars = h("div", { class: "cfg-vars", role: "group", "aria-label": "Inserir variável" },
      L.VARIAVEIS.map(v => h("button", { type: "button", on: { click: () => {
        const ini = ta.selectionStart ?? ta.value.length, fim = ta.selectionEnd ?? ini;
        ta.value = ta.value.slice(0, ini) + `{${v}}` + ta.value.slice(fim);
        ta.focus(); ta.setSelectionRange(ini + v.length + 2, ini + v.length + 2); previa();
      } } }, `{${v}}`)));
    const cont = h("div", { class: "cfg-cont" });
    const prev = h("div", { class: "cv-previa", "aria-live": "polite" });
    function previa() {
      prev.textContent = L.aplicarVariaveis(ta.value || "…", exemplo());
      cont.textContent = `${ta.value.length} / 4096`;
      cont.dataset.alerta = ta.value.length > 4096 ? "1" : "0";
    }
    ta.addEventListener("input", previa);
    const cDep = deps.length ? ui.campo({ rotulo: "Departamento", nome: "departamento_id", tipo: "select", valor: r ? r.departamento_id || "" : "",
      opcoes: [{ valor: "", rotulo: "Todos" }, ...deps.map(d => ({ valor: d.id, rotulo: d.nome }))], ajuda: "Aparece primeiro para quem atende esse departamento." }) : null;
    const cAtivo = ui.campo({ rotulo: "Ativa (aparece no /)", nome: "ativo", tipo: "interruptor", valor: r ? r.ativo !== false : true });
    f.append(h("div", { class: "grade-2" }, cAtalho, cTitulo), cCorpo, vars, cont, h("p", { class: "rotulo" }, "Prévia"), prev, cDep, cAtivo);
    previa();
    const acoes = [{ rotulo: "Cancelar", tipo: "neutro" }];
    if (r) acoes.unshift({ rotulo: "Excluir", tipo: "perigo", fn: async () => {
      if (!(await ui.confirmar({ titulo: `Excluir /${r.atalho}?`, texto: "A resposta some do / para toda a equipe.", perigo: true }))) return false;
      await ctx.api.rpcC("nx_resposta_excluir", { p_id: r.id });
      ui.toast("Resposta excluída.", { tipo: "ok" });
      return "excluida";
    } });
    acoes.push({ rotulo: "Salvar", tipo: "primario", fn: async () => {
      const d = ui.lerForm(f);
      ui.marcarErro(f, null);
      const atalho = String(d.atalho || "").replace(/^\/+/, "").trim().toLowerCase();
      if (!/^[a-z0-9_-]{1,30}$/.test(atalho)) { ui.marcarErro(f, "atalho", "Use só letras minúsculas sem acento, números, - e _ (até 30)."); return false; }
      if (!d.titulo) { ui.marcarErro(f, "titulo", "Dê um título."); return false; }
      if (!d.corpo) { ui.marcarErro(f, "corpo", "Escreva o texto."); return false; }
      try {
        await ctx.api.rpcC("nx_resposta_salvar", { p_resposta: { id: r ? r.id : undefined, atalho, titulo: d.titulo, corpo: d.corpo,
          departamento_id: d.departamento_id || null, ativo: d.ativo !== false } });
      } catch (e) {
        if (e && e.codigo === "atalho_em_uso") { ui.marcarErro(f, "atalho", "Esse atalho já existe."); return false; }
        if (e && e.codigo === "dados_invalidos" && e.hint && f.querySelector(`[data-campo="${e.hint}"]`)) { ui.marcarErro(f, e.hint, "Confira este campo."); return false; }
        throw e;
      }
      ui.toast("Resposta salva.", { tipo: "ok" });
      return true;
    } });
    const res = await ui.modal({ titulo: r ? `Editar /${r.atalho}` : "Nova resposta rápida", corpo: f, largura: "m", acoes });
    if (res) carregar();
  }

  await carregar();
}

/* ============================================================ DEPARTAMENTOS E HORÁRIOS (P0-B) */
const HINT_DEP = {
  nome: ["nome", "Dê um nome de até 40 letras."],
  nome_repetido: ["nome", "Já existe um departamento com esse nome."],
  cor: ["cor", "Escolha uma cor da paleta (ou digite o código de 6 dígitos)."],
  horario: ["horario", "Confira o horário: início antes do fim e faixas sem sobrepor."],
  msg_fora_horario: ["msg_fora_horario", "A mensagem pode ter até 1.000 caracteres."],
  padrao: ["padrao", "Sempre existe um departamento padrão. Para trocar, marque outro como padrão."],
  padrao_inativo: ["ativo", "O departamento padrão não pode ficar desligado."],
  maximo: [null, "Limite de 30 departamentos."],
};

async function montarDepartamentos(ctx, alvo) {
  const { ui } = ctx;
  const h = ui.h;
  const [L] = await Promise.all([logica(ctx), ui.carregarCss("conversas")]);
  let base = null, deps = [];
  const novo = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("mais"), "Novo departamento");
  novo.addEventListener("click", () => editar(null));
  const caixa = h("div", { class: "cfg-deps" });
  ui.limpar(alvo);
  alvo.append(
    h("header", { class: "cab-pag" },
      h("div", null, h("p", { class: "rotulo" }, "Equipe"), h("h1", { class: "titulo-pag" }, "Departamentos e horários"),
        h("p", { class: "sub" }, "Conversa nova cai no departamento do número (ou no padrão). No rodízio, vai para quem está com menos conversas abertas; fora do horário, o cliente recebe a mensagem automática.")),
      novo),
    caixa);

  async function carregar() {
    ui.limpar(caixa);
    caixa.appendChild(ui.esqueleto("cartoes", 2));
    try {
      base = await ctx.api.rpcC("nx_cv_base");
      deps = (base.config && base.config.departamentos) || [];
      desenhar();
    } catch (e) { ui.limpar(caixa); caixa.appendChild(ui.erroCartao(e, carregar)); }
  }

  const padrao = () => deps.find(d => d.padrao) || null;

  function desenhar() {
    ui.limpar(caixa);
    if (!base.config) {
      caixa.appendChild(ui.vazio({ titulo: "Só administradores configuram departamentos.", icone: "cadeado", texto: "Peça ao administrador da sua empresa." }));
      return;
    }
    if (!deps.length) {
      caixa.appendChild(ui.vazio({ titulo: "Nenhum departamento ainda.", icone: "usuario",
        texto: "Crie a Recepção (padrão) para as conversas novas caírem nela.", acao: { rotulo: "Novo departamento", fn: () => editar(null) } }));
      return;
    }
    const agora = new Date();
    for (const d of deps) {
      const cor = ui.corOk(d.cor);
      const aberto = L.horarioAberto(d.horario, agora);
      const bEditar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("editar"), "Editar");
      bEditar.addEventListener("click", () => editar(d));
      const bMais = h("button", { type: "button", class: "bt-icone", "aria-label": `Mais opções de ${d.nome}` }, ui.icone("opcoes"));
      bMais.addEventListener("click", () => ui.menu(bMais, [
        { rotulo: "Tornar padrão", icone: "check", fn: () => salvarRapido(d, { padrao: true }, `${d.nome} agora recebe as conversas novas.`), desabilitado: d.padrao || !d.ativo },
        { rotulo: d.ativo ? "Desligar" : "Religar", icone: d.ativo ? "relogio" : "raio", fn: () => salvarRapido(d, { ativo: !d.ativo }, d.ativo ? "Departamento desligado." : "Departamento religado."), desabilitado: d.padrao },
        "-",
        { rotulo: "Excluir", icone: "lixeira", perigo: true, fn: () => excluir(d), desabilitado: d.padrao },
      ]));
      const msgInfo = !d.horario ? null
        : d.msg_fora_horario ? h("span", { class: "cfg-dep-msg" }, ui.icone("chat"), "Mensagem fora do horário ligada")
        : h("span", { class: "cfg-dep-msg", dataset: { alerta: "1" } }, ui.icone("alerta"), "Sem mensagem fora do horário");
      caixa.appendChild(h("article", { class: "cartao cfg-dep", style: cor ? { "--cor": cor } : null, dataset: { inativo: d.ativo ? "0" : "1" } },
        h("div", { class: "cfg-dep-cab" },
          h("span", { class: "cfg-dep-cor", "aria-hidden": "true" }),
          h("h3", { class: "titulo-sec" }, d.nome),
          d.padrao ? ui.pilula("Padrão", "info") : null,
          d.ativo ? null : ui.pilula("Desligado", "neutra"),
          h("span", { class: "cfg-dep-acoes" }, bEditar, bMais)),
        h("p", { class: "cfg-dep-dist" },
          d.distribuicao === "rodizio" ? h("b", null, "Rodízio automático") : h("b", null, "Distribuição manual"),
          d.distribuicao === "rodizio" ? " — vai para quem está com menos conversas abertas." : " — fica na fila até alguém assumir.",
          d.manter_atendente ? " Cliente que volta fica com quem atendeu antes." : ""),
        h("div", { class: "cfg-dep-hor" }, ui.icone("relogio"), h("span", null, L.resumoHorario(d.horario)),
          d.horario ? ui.pilula(aberto ? "Aberto agora" : "Fechado agora", aberto ? "ok" : "neutra") : null),
        h("div", { class: "cfg-dep-rod" },
          msgInfo,
          h("span", { class: "mono" }, `${d.conversas_abertas || 0} em aberto · ${d.canais || 0} ${d.canais === 1 ? "número" : "números"} · ${d.pessoas || 0} ${d.pessoas === 1 ? "pessoa" : "pessoas"}`))));
    }
  }

  async function salvarRapido(d, mudanca, ok) {
    try {
      await ctx.api.rpcC("nx_departamento_salvar", { p_departamento: { id: d.id, ...mudanca } });
      ui.toast(ok, { tipo: "ok" });
      carregar();
    } catch (e) {
      const x = e && e.codigo === "dados_invalidos" && HINT_DEP[e.hint];
      ui.toast(x ? x[1] : ui.mensagemErro(e), { tipo: "erro" });
    }
  }

  async function excluir(d) {
    const p = padrao();
    const n = d.conversas_abertas || 0;
    const ok = await ui.confirmar({ titulo: `Excluir o departamento ${d.nome}?`, perigo: true, rotulo: "Excluir",
      texto: `${n ? `${n === 1 ? "A conversa em aberto" : `As ${n} conversas em aberto`}, os` : "Os"} números e as pessoas dele passam para «${p ? p.nome : "o padrão"}». As respostas rápidas dele ficam para todos.` });
    if (!ok) return;
    try {
      const r = await ctx.api.rpcC("nx_departamento_excluir", { p_id: d.id });
      ui.toast(r && r.movidas ? `Departamento excluído. ${r.movidas} ${r.movidas === 1 ? "conversa foi" : "conversas foram"} para ${p ? p.nome : "o padrão"}.` : "Departamento excluído.", { tipo: "ok" });
      carregar();
    } catch (e) {
      const x = e && e.codigo === "dados_invalidos" && HINT_DEP[e.hint];
      ui.toast(x ? x[1] : ui.mensagemErro(e), { tipo: "erro" });
    }
  }

  /* ---------------- editor */
  async function editar(d) {
    const f = h("form", { class: "pilha", novalidate: true });
    const cNome = ui.campo({ rotulo: "Nome", nome: "nome", valor: d ? d.nome : "", obrigatorio: true, max: 40, placeholder: "Ex.: Recepção, Comercial, Financeiro" });
    const cCor = ui.campo({ rotulo: "Cor", nome: "cor", tipo: "cor", valor: d ? d.cor : (ctx.paleta || [])[deps.length % Math.max(1, (ctx.paleta || []).length)] || null, paleta: ctx.paleta });

    // distribuição (dois cartões de escolha)
    const opDist = (valor, titulo, texto) => {
      const id = `cfg-dist-${valor}`;
      return h("label", { class: "cfg-opcao", for: id },
        h("input", { type: "radio", name: "distribuicao", id, value: valor, checked: (d ? d.distribuicao : "rodizio") === valor }),
        h("span", null, h("b", null, titulo), h("small", null, texto)));
    };
    const cDist = h("fieldset", { class: "campo", dataset: { campo: "distribuicao" } }, h("legend", null, "Quem recebe as conversas novas"),
      h("div", { class: "cfg-opcoes" },
        opDist("rodizio", "Rodízio automático", "Vai para quem está com menos conversas abertas (e recebe no rodízio)."),
        opDist("manual", "Manual", "Fica sem dono na fila; alguém da equipe assume.")));
    const cManter = ui.campo({ rotulo: "Cliente que volta fica com quem atendeu antes", nome: "manter_atendente", tipo: "interruptor", valor: d ? d.manter_atendente !== false : true });
    const ehPadrao = !!(d && d.padrao);
    const cPadrao = ui.campo({ rotulo: "Departamento padrão (recebe as conversas dos números sem departamento)", nome: "padrao", tipo: "interruptor", valor: ehPadrao || (!d && !padrao()),
      desabilitado: ehPadrao, ajuda: ehPadrao ? "Para trocar, marque outro departamento como padrão." : null });
    const cAtivo = ui.campo({ rotulo: "Ligado", nome: "ativo", tipo: "interruptor", valor: d ? d.ativo !== false : true, desabilitado: ehPadrao,
      ajuda: "Desligado some da transferência e dos filtros; as conversas dele continuam." });

    // horário
    let grade = d && d.horario ? clonar(d.horario) : null;
    let ultimaGrade = grade || L.horarioPadrao();
    const b24 = h("button", { type: "button", "aria-pressed": String(!grade) }, "24 horas");
    const bDef = h("button", { type: "button", "aria-pressed": String(!!grade) }, "Horário definido");
    const alterna = h("div", { class: "cv-alterna", role: "group", "aria-label": "Tipo de horário" }, b24, bDef);
    const gradeEl = h("div", { class: "cfg-grade-horario", role: "group", "aria-label": "Horário por dia" });
    const resumo = h("p", { class: "cfg-hor-resumo", "aria-live": "polite" });
    const erroHor = h("small", { class: "campo-erro", hidden: true });
    const bCopiar = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("copiar"), "Copiar segunda para terça a sexta");
    const blocoGrade = h("div", { class: "pilha-p" }, gradeEl, h("div", { class: "linha" }, bCopiar));
    const cHorario = h("fieldset", { class: "campo", dataset: { campo: "horario" } }, h("legend", null, "Horário de atendimento"), alterna, blocoGrade, resumo, erroHor);

    function clonar(x) { const r = {}; for (let i = 0; i < 7; i++) r[i] = ((x[i] ?? x[String(i)]) || []).map(fx => [fx[0], fx[1] === "24:00" ? "23:59" : fx[1]]); return r; }
    function lerGrade() {
      if (!grade) return null;
      const r = {};
      for (const linha of gradeEl.querySelectorAll("[data-dia]")) {
        const dia = Number(linha.dataset.dia);
        const aberto = linha.querySelector("input[type=checkbox]").checked;
        const faixas = [];
        if (aberto) for (const fx of linha.querySelectorAll(".cfg-faixa")) {
          const [a, b] = fx.querySelectorAll("input[type=time]");
          faixas.push([a.value, b.value]);
        }
        r[dia] = faixas;
      }
      return r;
    }
    function atualizarResumo() {
      const g = lerGrade();
      const v = L.validarHorario(g);
      erroHor.hidden = v.ok; erroHor.textContent = v.ok ? "" : v.erro.texto;
      resumo.textContent = v.ok ? L.resumoHorario(v.horario) : "";
      atualizarPrevia();
    }
    function faixaEl(dia, fx, podeRemover) {
      const a = h("input", { type: "time", value: fx[0] || "08:00", step: 300, "aria-label": `${L.DIAS_LONGOS[dia]}: início` });
      const b = h("input", { type: "time", value: fx[1] || "18:00", step: 300, "aria-label": `${L.DIAS_LONGOS[dia]}: fim` });
      a.addEventListener("change", atualizarResumo); b.addEventListener("change", atualizarResumo);
      const x = podeRemover ? h("button", { type: "button", class: "bt-icone", "aria-label": `Tirar o intervalo de ${L.DIAS_LONGOS[dia]}` }, ui.icone("fechar")) : null;
      const el = h("span", { class: "cfg-faixa" }, a, h("span", { "aria-hidden": "true" }, "às"), b, x);
      if (x) x.addEventListener("click", () => { el.remove(); desenharLinha(dia); atualizarResumo(); });
      return el;
    }
    function desenharLinha(dia) {
      const linha = gradeEl.querySelector(`[data-dia="${dia}"]`);
      const faixas = [...linha.querySelectorAll(".cfg-faixa")];
      const caixaF = linha.querySelector(".cfg-faixas");
      const mais = caixaF.querySelector(".cfg-mais-faixa");
      if (mais) mais.remove();
      if (faixas.length < 2 && linha.querySelector("input[type=checkbox]").checked) {
        const bm = h("button", { type: "button", class: "bt bt-fant bt-p cfg-mais-faixa" }, ui.icone("mais"), "Intervalo");
        bm.addEventListener("click", () => {
          // intervalo de almoço: 08:00–18:00 vira 08:00–12:00 e 13:00–18:00; senão abre uma faixa depois da última
          const ult = faixas[faixas.length - 1];
          const [ci, cf] = ult ? ult.querySelectorAll("input[type=time]") : [];
          let nova;
          if (ci && cf && ci.value < "12:00" && cf.value > "13:00") { nova = ["13:00", cf.value]; cf.value = "12:00"; }
          else {
            const ini = cf && cf.value ? cf.value : "13:00";
            const [hh, mm] = ini.split(":").map(Number);
            const fim = hh >= 21 ? "23:59" : `${String(hh + 2).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
            nova = [ini, fim];
          }
          bm.before(faixaEl(dia, nova, true));
          desenharLinha(dia); atualizarResumo();
        });
        caixaF.appendChild(bm);
      }
    }
    function montarGrade() {
      ui.limpar(gradeEl);
      for (const dia of [1, 2, 3, 4, 5, 6, 0]) {
        const faixas = (grade && grade[dia]) || [];
        const idc = `cfg-dia-${dia}`;
        const chk = h("input", { type: "checkbox", id: idc, checked: faixas.length > 0 });
        const caixaF = h("div", { class: "cfg-faixas" });
        const fechado = h("span", { class: "sub cfg-fechado", hidden: faixas.length > 0 }, "Fechado");
        faixas.forEach((fx, i) => caixaF.appendChild(faixaEl(dia, fx, i > 0)));
        caixaF.appendChild(fechado);
        chk.addEventListener("change", () => {
          if (chk.checked && !caixaF.querySelector(".cfg-faixa")) fechado.before(faixaEl(dia, dia === 6 ? ["08:00", "12:00"] : ["08:00", "18:00"], false));
          if (!chk.checked) for (const x of caixaF.querySelectorAll(".cfg-faixa")) x.remove();
          fechado.hidden = chk.checked;
          desenharLinha(dia); atualizarResumo();
        });
        const linha = h("div", { class: "cfg-dia", dataset: { dia } },
          h("label", { class: "cfg-dia-nome", for: idc }, chk, h("span", null, L.DIAS_LONGOS[dia])), caixaF);
        gradeEl.appendChild(linha);
        desenharLinha(dia);
      }
    }
    function modoHorario(definido) {
      if (definido && !grade) grade = clonar(ultimaGrade);
      if (!definido && grade) { ultimaGrade = lerGrade() || ultimaGrade; grade = null; }
      b24.setAttribute("aria-pressed", String(!definido));
      bDef.setAttribute("aria-pressed", String(definido));
      blocoGrade.hidden = !definido;
      if (definido) montarGrade();
      atualizarResumo();
    }
    b24.addEventListener("click", () => modoHorario(false));
    bDef.addEventListener("click", () => modoHorario(true));
    bCopiar.addEventListener("click", () => {
      const g = lerGrade(); if (!g) return;
      for (const dia of [2, 3, 4, 5]) g[dia] = g[1].map(x => [...x]);
      grade = g; montarGrade(); atualizarResumo();
      ui.anunciar("Horário de segunda copiado para terça a sexta.");
    });

    // mensagem fora do horário
    const cMsg = ui.campo({ rotulo: "Mensagem fora do horário", nome: "msg_fora_horario", tipo: "textarea", linhas: 3, max: 1000, valor: d ? d.msg_fora_horario || "" : "",
      placeholder: "Olá, {primeiro_nome}! Recebemos sua mensagem. Respondemos assim que abrirmos." });
    const taMsg = cMsg.querySelector("textarea");
    const contMsg = h("div", { class: "cfg-cont" });
    const prevMsg = h("div", { class: "cv-previa cfg-previa-in", "aria-live": "polite" });
    const notaMsg = h("p", { class: "sub" });
    const varsMsg = h("div", { class: "cfg-vars", role: "group", "aria-label": "Inserir variável" },
      ["primeiro_nome", "nome", "empresa", "protocolo"].map(v => h("button", { type: "button", on: { click: () => {
        const ini = taMsg.selectionStart ?? taMsg.value.length, fim = taMsg.selectionEnd ?? ini;
        taMsg.value = taMsg.value.slice(0, ini) + `{${v}}` + taMsg.value.slice(fim);
        taMsg.focus(); taMsg.setSelectionRange(ini + v.length + 2, ini + v.length + 2); atualizarPrevia();
      } } }, `{${v}}`)));
    function atualizarPrevia() {
      const txt = taMsg.value.trim();
      prevMsg.hidden = !txt;
      prevMsg.textContent = L.aplicarVariaveis(txt, { nome: "Maria Souza", primeiro_nome: "Maria", atendente: "", empresa: (ctx.cliente && ctx.cliente.nome) || "Sua empresa", protocolo: "2026-000123" });
      contMsg.textContent = `${taMsg.value.length} / 1000`;
      contMsg.dataset.alerta = taMsg.value.length > 1000 ? "1" : "0";
      notaMsg.textContent = !grade ? "Com atendimento 24 horas esta mensagem nunca é enviada."
        : txt ? "Enviada uma vez a cada 12 h para quem começa uma conversa fora do horário."
        : "Sem mensagem, quem chamar fora do horário não recebe resposta automática.";
    }
    taMsg.addEventListener("input", atualizarPrevia);

    f.append(h("div", { class: "grade-2" }, cNome, cCor), cDist, cManter, cHorario,
      h("div", { class: "pilha-p" }, cMsg, varsMsg, contMsg, prevMsg, notaMsg), cPadrao, cAtivo);
    modoHorario(!!grade);

    const acoes = [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: d ? "Salvar" : "Criar departamento", tipo: "primario", fn: async () => {
      const dados = ui.lerForm(f);
      ui.marcarErro(f, null);
      if (!dados.nome) { ui.marcarErro(f, "nome", HINT_DEP.nome[1]); return false; }
      const v = L.validarHorario(lerGrade());
      if (!v.ok) { erroHor.hidden = false; erroHor.textContent = v.erro.texto; gradeEl.querySelector(`[data-dia="${v.erro.dia ?? 1}"] input`)?.focus(); return false; }
      if (String(dados.msg_fora_horario || "").length > 1000) { ui.marcarErro(f, "msg_fora_horario", HINT_DEP.msg_fora_horario[1]); return false; }
      const payload = { nome: dados.nome, cor: dados.cor || null, distribuicao: dados.distribuicao || "rodizio", manter_atendente: !!dados.manter_atendente,
        horario: v.horario, msg_fora_horario: dados.msg_fora_horario || null };
      if (d) payload.id = d.id;
      if (!ehPadrao) { payload.padrao = !!dados.padrao; payload.ativo = dados.ativo !== false; }
      try {
        return await ctx.api.rpcC("nx_departamento_salvar", { p_departamento: payload });
      } catch (e) {
        const x = e && e.codigo === "dados_invalidos" && HINT_DEP[e.hint];
        if (x && x[0] === "horario") { erroHor.hidden = false; erroHor.textContent = x[1]; return false; }
        if (x && x[0]) { ui.marcarErro(f, x[0], x[1]); return false; }
        if (x) { ui.toast(x[1], { tipo: "erro" }); return false; }
        throw e;
      }
    } }];
    const r = await ui.modal({ titulo: d ? `Departamento ${d.nome}` : "Novo departamento", corpo: f, largura: "g", acoes });
    if (r) { ui.toast(d ? "Departamento salvo." : "Departamento criado.", { tipo: "ok" }); carregar(); }
  }

  await carregar();
}

/* ============================================================ PREFERÊNCIAS DO ATENDIMENTO (P0-B) */
async function montarAtendimento(ctx, alvo) {
  const { ui } = ctx;
  const h = ui.h;
  await ui.carregarCss("conversas");
  const caixa = h("div", { class: "pilha" });
  ui.limpar(alvo);
  alvo.append(
    h("header", { class: "cab-pag" },
      h("div", null, h("p", { class: "rotulo" }, "Atendimento"), h("h1", { class: "titulo-pag" }, "Preferências do atendimento"),
        h("p", { class: "sub" }, "Valem para toda a equipe desta empresa, em todos os números."))),
    caixa);
  let cfg = null;

  async function carregar() {
    ui.limpar(caixa);
    caixa.appendChild(ui.esqueleto("cartoes", 2));
    try { cfg = (await ctx.api.rpcC("nx_cv_base")).cfg || { recibo_leitura: true, assinatura: false }; desenhar(); }
    catch (e) { ui.limpar(caixa); caixa.appendChild(ui.erroCartao(e, carregar)); }
  }

  function opcao(chave, titulo, texto, extra) {
    const c = ui.campo({ rotulo: titulo, nome: chave, tipo: "interruptor", valor: !!cfg[chave] });
    const inp = c.querySelector("input");
    inp.addEventListener("change", async () => {
      const valor = inp.checked;
      inp.disabled = true;
      try {
        const r = await ctx.api.rpcC("nx_cv_config_salvar", { p_cfg: { [chave]: valor } });
        cfg = { ...cfg, ...(r || {}) };
        ui.toast("Preferência salva.", { tipo: "ok" });
        if (extra) extra.atualizar();
      } catch (e) {
        inp.checked = !valor;
        ui.toast(ui.mensagemErro(e), { tipo: "erro" });
      } finally { inp.disabled = false; }
    });
    return h("section", { class: "cartao cfg-pref" }, c, h("p", { class: "sub" }, texto), extra ? extra.el : null);
  }

  function previaAssinatura() {
    const nome = String((ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.nome) || "Ana").trim().split(/\s+/)[0];
    const el = h("div", { class: "cv-previa cfg-previa-ass" });
    return { el, atualizar() {
      ui.limpar(el);
      if (cfg.assinatura) el.append(h("b", null, `${nome}:`), "\n");
      el.append("Olá! Sua avaliação ficou para quinta às 9h. Até lá!");
    } };
  }

  function desenhar() {
    ui.limpar(caixa);
    const ass = previaAssinatura();
    ass.atualizar();
    caixa.append(
      opcao("recibo_leitura", "Confirmação de leitura",
        "Quando alguém da equipe abre a conversa, o cliente vê no WhatsApp dele que a mensagem foi lida. Desligado, a leitura fica só aqui na central."),
      opcao("assinatura", "Assinar com o nome de quem atende",
        "Cada mensagem sai com o primeiro nome de quem respondeu na primeira linha, em negrito — o cliente sabe com quem está falando.", ass));
  }

  await carregar();
}

/* ============================================================ ASSISTENTE DE IA (P0-B) */
const IA_TEXTOS = [
  ["sobre", "Sobre a empresa", "Quem somos, diferenciais e para quem atendemos."],
  ["servicos", "Serviços e informações", "O que oferecemos, faixas de preço que podem ser informadas, pagamentos e convênios."],
  ["horarios", "Horários de atendimento", "Dias e horários de funcionamento e disponibilidade da equipe."],
  ["regras", "Regras de atendimento", "Ex.: confirmar nome e serviço; nunca marcar sem confirmar o horário."],
  ["proibido", "O que nunca dizer", "Ex.: diagnóstico por mensagem, promessa de resultado ou preço fechado sem avaliação."],
  ["memoria_aprovada", "Memória operacional aprovada", "Registre somente aprendizados confirmados pela equipe: respostas frequentes, preferências de atendimento e procedimentos internos. Não inclua dados pessoais ou de saúde."],
];

const IA_CAMPOS_EXTRA = [
  ["assistente_nome", "Nome do assistente", "Como o agente se apresenta no WhatsApp."],
  ["endereco", "Endereço", "Endereço, referência, estacionamento e como chegar."],
  ["boas_vindas", "Mensagem de boas-vindas", "Primeira mensagem que o agente deve usar ao iniciar o atendimento."],
];

async function montarIA(ctx, alvo) {
  const { ui } = ctx;
  const h = ui.h;
  const [L] = await Promise.all([logica(ctx), ui.carregarCss("conversas")]);
  const caixa = h("div", { class: "pilha" });
  ui.limpar(alvo);
  alvo.append(
    h("header", { class: "cab-pag" },
      h("div", null, h("p", { class: "rotulo" }, "Atendimento"), h("h1", { class: "titulo-pag" }, "Assistente de IA"),
        h("p", { class: "sub" }, "Defina a personalidade e as informações usadas pelo agente do CodeWords. A equipe pode revisar aprendizados e assumir qualquer conversa. As alterações só valem no fluxo após atualizar o prompt do CodeWords."))),
    caixa);

  async function carregar() {
    ui.limpar(caixa);
    caixa.appendChild(ui.esqueleto("cartoes", 2));
    try { desenhar(await ctx.api.rpcC("nx_cv_base")); }
    catch (e) { ui.limpar(caixa); caixa.appendChild(ui.erroCartao(e, carregar)); }
  }

  function desenhar(base) {
    ui.limpar(caixa);
    const ia = base.ia || {};
    const cfg = (base.config && base.config.ia) || null;
    if (!cfg) {
      caixa.appendChild(ui.vazio({ titulo: "Só administradores configuram o assistente.", icone: "cadeado", texto: "Peça ao administrador da sua empresa." }));
      return;
    }
    const cota = ia.cota || {};
    caixa.appendChild(ia.ligada
      ? h("section", { class: "cartao cfg-ia-status" },
          h("div", { class: "linha" }, ui.pilula("Sugestões do Órbita disponíveis", "ok", { icone: "ia" })),
          ui.barraUso("Sugestões da equipe usadas neste mês", cota.usadas || 0, cota.limite ?? null),
          h("p", { class: "sub" }, "Este limite é das sugestões feitas no chat do Órbita. O agente CodeWords e sua ativação são configurados em cada número de WhatsApp."))
      : h("div", { class: "aviso aviso-aten" }, ui.icone("ia"),
          h("p", null, h("b", null, "Sugestões de IA do Órbita indisponíveis. "), "Estas informações ainda podem ser preparadas para o agente CodeWords; a ativação depende do canal.")));

    const f = h("form", { class: "pilha cartao cfg-ia", novalidate: true });
    const cont = h("div", { class: "cfg-ia-cont", "aria-live": "polite" });
    const barra = h("div", { class: "uso-barra" }, h("i"));
    const salvar = h("button", { type: "submit", class: "bt bt-prim" }, "Salvar assistente");
    const sujo = h("span", { class: "sub", hidden: true }, "Alterações não salvas");
    const tas = {};
    for (const [k, rot, ph] of IA_CAMPOS_EXTRA) {
      const c = ui.campo({ rotulo: rot, nome: k, tipo: k === "assistente_nome" ? "texto" : "textarea",
        linhas: k === "boas_vindas" ? 3 : 2, max: k === "assistente_nome" ? 40 : k === "endereco" ? 300 : 500,
        valor: cfg[k] || "", placeholder: ph });
      const ctl = c.querySelector(`[name="${k}"]`);
      ctl.addEventListener("input", () => { sujo.hidden = false; atualizarPrevia(); });
      f.appendChild(c);
    }
    for (const [k, rot, ph] of IA_TEXTOS) {
      const c = ui.campo({ rotulo: rot, nome: k, tipo: "textarea", linhas: k === "sobre" || k === "servicos" || k === "memoria_aprovada" ? 4 : 3,
        max: k === "memoria_aprovada" ? 3000 : L.IA_MAX, valor: cfg[k] || "", placeholder: ph });
      tas[k] = c.querySelector("textarea");
      tas[k].addEventListener("input", () => { contar(); atualizarPrevia(); });
      f.appendChild(c);
    }
    const opTom = (valor, titulo, texto) => {
      const id = `cfg-tom-${valor}`;
      return h("label", { class: "cfg-opcao", for: id },
        h("input", { type: "radio", name: "tom", id, value: valor, checked: (cfg.tom || "proximo") === valor }),
        h("span", null, h("b", null, titulo), h("small", null, texto)));
    };
    const cTom = h("fieldset", { class: "campo", dataset: { campo: "tom" } }, h("legend", null, "Tom das respostas"),
      h("div", { class: "cfg-opcoes" }, opTom("proximo", "Próximo", "«Oi, Maria! Tudo bem?» — leve, com você."), opTom("formal", "Formal", "«Olá, Sra. Maria.» — sóbrio, com senhor/senhora.")));
    cTom.addEventListener("change", () => { sujo.hidden = false; atualizarPrevia(); });
    const previa = h("pre", { class: "cfg-codigo cfg-ia-previa", tabindex: "0", "aria-label": "Prévia das instruções do assistente" });
    const blocoPrevia = h("section", { class: "cartao cfg-ia-preview" },
      h("div", { class: "cfg-ia-preview-head" }, h("div", null, h("p", { class: "rotulo" }, "PRÉVIA"), h("h2", { class: "titulo-sec" }, "Prévia das instruções")),
        ui.pilula("Atualiza enquanto você digita", "neutra")),
      h("p", { class: "sub" }, "A prévia reúne suas informações e as regras principais. Salve e depois copie o prompt em Configurações → Números para atualizar o agente no CodeWords."), previa);
    f.append(cTom, blocoPrevia,
      h("div", { class: "cfg-ia-rod" }, h("div", { class: "cfg-ia-medidor" }, cont, barra), h("div", { class: "linha" }, sujo, salvar)));

    function atualizarPrevia() {
      const d = ui.lerForm(f);
      const empresa = String(ctx.cliente?.nome || ctx.cliente?.razao_social || "sua empresa").trim();
      const nome = d.assistente_nome || "Assistente";
      const partes = [
        `Você é ${nome}, assistente de atendimento de ${empresa}.`,
        `Tom de voz: ${d.tom === "formal" ? "formal, respeitoso e objetivo" : "próximo, acolhedor e claro"}.`,
        d.boas_vindas ? `Boas-vindas: ${d.boas_vindas}` : "Cumprimente a pessoa com naturalidade e pergunte como pode ajudar.",
        d.sobre ? `Sobre a empresa:\n${d.sobre}` : "",
        d.servicos ? `Serviços e informações:\n${d.servicos}` : "",
        d.horarios ? `Horários:\n${d.horarios}` : "",
        d.endereco ? `Endereço:\n${d.endereco}` : "",
        d.regras ? `Regras de atendimento:\n${d.regras}` : "",
        d.proibido ? `Nunca faça ou diga:\n${d.proibido}` : "",
        d.memoria_aprovada ? `Memória operacional aprovada pela equipe (contexto revisado, não é treinamento automático):\n${d.memoria_aprovada}` : "",
        "Regras de segurança: não invente preços, horários ou políticas. Quando faltar uma informação, diga que vai confirmar com a equipe. Não faça diagnóstico nem prometa resultados. Se a pessoa pedir ajuda humana, encaminhe para a equipe.",
      ].filter(Boolean);
      previa.textContent = partes.join("\n\n");
    }

    function contar() {
      const obj = {}; for (const k in tas) obj[k] = tas[k].value;
      const n = L.contarIA(obj);
      cont.textContent = `${n.toLocaleString("pt-BR")} / ${L.IA_MAX.toLocaleString("pt-BR")} caracteres`;
      const p = Math.min(100, Math.round((n / L.IA_MAX) * 100));
      barra.firstChild.style.setProperty("--p", `${p}%`);
      barra.classList.toggle("alta", p >= 80 && p < 100);
      barra.classList.toggle("cheia", n > L.IA_MAX);
      cont.dataset.alerta = n > L.IA_MAX ? "1" : "0";
      salvar.disabled = n > L.IA_MAX;
      sujo.hidden = false;
      return n;
    }
    contar();
    sujo.hidden = true;

    f.addEventListener("submit", async ev => {
      ev.preventDefault();
      if (contar() > L.IA_MAX) { ui.toast("Passou de 15.000 caracteres. Resuma algum texto.", { tipo: "erro" }); return; }
      const d = ui.lerForm(f);
      const payload = { tom: d.tom === "formal" ? "formal" : "proximo",
        assistente_nome: d.assistente_nome || "", endereco: d.endereco || "", boas_vindas: d.boas_vindas || "" };
      for (const [k] of IA_TEXTOS) payload[k] = d[k] || "";
      try {
        await ui.carregando(salvar, ctx.api.rpcC("nx_ia_config_salvar", { p_ia: payload }));
        sujo.hidden = true;
        ui.toast("Assistente salvo.", { tipo: "ok" });
      } catch (e) {
        if (e && e.codigo === "dados_invalidos" && e.hint === "tamanho") ui.toast("Passou de 15.000 caracteres. Resuma algum texto.", { tipo: "erro" });
        else ui.toast(ui.mensagemErro(e), { tipo: "erro" });
      }
    });
    atualizarPrevia();
    caixa.appendChild(f);
  }

  await carregar();
}

export const secoesConfig = [
  { id: "numeros", titulo: "Números de WhatsApp", grupo: "Atendimento", papelMin: "admin", modulo: "conversas", icone: "whatsapp", montar: montarNumeros },
  { id: "respostas", titulo: "Respostas rápidas", grupo: "Atendimento", papelMin: "supervisor", modulo: "conversas", icone: "chat", montar: montarRespostas },
  { id: "atendimento", titulo: "Preferências do atendimento", grupo: "Atendimento", papelMin: "admin", modulo: "conversas", icone: "engrenagem", montar: montarAtendimento },
  { id: "ia", titulo: "Assistente de IA", grupo: "Atendimento", papelMin: "admin", modulo: "conversas", icone: "ia", montar: montarIA },
  { id: "departamentos", titulo: "Departamentos e horários", grupo: "Equipe", papelMin: "admin", modulo: "conversas", icone: "usuario", montar: montarDepartamentos },
];
