/* ============================================================
   ÓRBITA — config.js · frente F3 · ESPEC T14 (§7.7), §2.8
   Hub #/config e #/config/<secao>. Seções da F3: perfil, usuarios
   (P0-A); marca, dominio, plano (P0-B). As outras frentes entram por secoesConfig de
   crm-config.js (F4), cv-config.js (F5), ads-config.js (F6),
   agenda-config.js e rastreio-config.js (F8),
   carregados por import() com ?v= e catch. Só aparece o que está
   em CONFIG_PRONTAS (ou ?dev=1 do super).
   ============================================================ */

const GRUPOS = ["Você", "Equipe", "Atendimento", "CRM", "Anúncios", "Marca", "Plano"];
const EXTERNOS = ["crm-config.js", "cv-config.js", "ads-config.js", "agenda-config.js", "rastreio-config.js"];
let _externas = null;      // cache das seções das outras frentes (por versão)
let _versaoExt = null;
let _limpeza = [];
let _montagemCfg = 0;

/**
 * Aviso para um logo muito estreito/alto (largura < metade da altura): no menu (caixa de 36 px) e no login (44 px) o logo é desenhado
 * «contido», então um 90 × 500 sobra com ~7 px de largura. Devolve o texto do aviso ou "" quando a proporção serve.
 */
export function avisoProporcaoLogo(largura, altura) {
  const w = Number(largura), h = Number(altura);
  if (!(w > 0) || !(h > 0) || w / h >= 0.5) return "";
  return "Este logo é muito estreito e alto: no menu e na tela de entrada ele aparece bem pequeno e pode ficar ilegível. Prefira um logo quadrado ou mais largo.";
}

/** Valida o contrato da RPC antes de a tela tratar uma resposta inválida como lista vazia. */
export function validarListaDominios(valor) {
  if (!Array.isArray(valor) || valor.some(d => !d || typeof d !== "object" || typeof d.host !== "string" || !["pendente", "ativo"].includes(d.status))) {
    const erro = new Error("O servidor devolveu uma lista de domínios inválida. Tente atualizar a tela.");
    erro.codigo = "resposta_invalida";
    throw erro;
  }
  return valor;
}

export function desmontar() { for (const f of _limpeza) try { f(); } catch { /* ok */ } _limpeza = []; }

async function secoesExternas(ctx) {
  if (_externas && _versaoExt === ctx.versao) return _externas;
  const lista = [];
  await Promise.all(EXTERNOS.map(async arq => {
    try {
      const m = await import(`./${arq}?v=${encodeURIComponent(ctx.versao)}`);
      if (Array.isArray(m.secoesConfig)) for (const s of m.secoesConfig) if (s && s.id && typeof s.montar === "function") lista.push(s);
    } catch { /* frente ainda não publicou: a seção não aparece */ }
  }));
  _externas = lista; _versaoExt = ctx.versao;
  return lista;
}

function secoesProprias() {
  return [
    { id: "perfil", titulo: "Perfil", grupo: "Você", papelMin: null, icone: "usuario", semCliente: true, montar: secaoPerfil },
    { id: "usuarios", titulo: "Usuários e convites", grupo: "Equipe", papelMin: "admin", icone: "convidar", montar: secaoUsuarios },
    ...secoesMarcaPlano(),
  ];
}

function visivel(ctx, s) {
  if (!ctx.configPronta(s.id)) return false;
  if (s.conta === "gestor") return ctx.sessao.conta.papel === "gestor";
  if (s.semCliente && typeof s.visivel === "function") try { return !!s.visivel(ctx); } catch { return false; }
  if (s.semCliente) return true;
  if (!ctx.cliente) return false;
  if (s.modulo && !ctx.temModulo(s.modulo)) return false;
  if (s.papelMin && !ctx.pode(s.papelMin)) return false;
  if (typeof s.visivel === "function") try { return !!s.visivel(ctx); } catch { return false; }
  return true;
}

export async function montar(ctx) {
  desmontar();
  const { ui } = ctx;
  const h = ui.h;
  ctx.titulo("Configurações");
  const todas = [...secoesProprias(), ...(await secoesExternas(ctx))];
  const vistas = todas.filter(s => visivel(ctx, s));
  vistas.sort((a, b) => (GRUPOS.indexOf(a.grupo) + 1 || 99) - (GRUPOS.indexOf(b.grupo) + 1 || 99));
  const pedida = ctx.rota.partes[0] || null;
  const atual = vistas.find(s => s.id === pedida) || (pedida ? null : vistas[0]);

  const lista = h("nav", { class: "cfg-lista", "aria-label": "Seções das configurações" });
  let grupo = null;
  for (const s of vistas) {
    if (s.grupo !== grupo) { grupo = s.grupo; lista.appendChild(h("p", { class: "rotulo cfg-grupo" }, grupo || "Outros")); }
    const emObra = !ctx.shell.prontos.CONFIG_PRONTAS.includes(s.id);
    lista.appendChild(h("a", { class: "cfg-nav-item", href: `#/config/${s.id}`, "aria-current": atual && atual.id === s.id ? "page" : null },
      ui.icone(s.icone || "engrenagem"), h("span", null, s.titulo), emObra ? h("span", { class: "nav-selo" }, "obra") : null));
  }
  // M32: o mesmo estado do checklist do Início vira um ponto com o número de passos pendentes ao lado de cada seção (só admin; é um complemento)
  const minhaMontagem = ++_montagemCfg;
  if (ctx.cliente && ctx.pode("admin") && vistas.some(s => ["numeros", "departamentos", "agenda", "rastreio", "usuarios", "funis"].includes(s.id))) {
    Promise.all([import(`./rel-logica.js?v=${encodeURIComponent(ctx.versao)}`), ctx.api.rpcC("nx_onboarding_estado", {})]).then(([L, est]) => {
      if (minhaMontagem !== _montagemCfg || !lista.isConnected) return;
      let pulados = [];
      try { pulados = (JSON.parse(localStorage.getItem(`nx-onb:${ctx.cliente.id}:${(ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id) || "-"}`) || "{}").pulados) || []; } catch { /* sem storage */ }
      const pend = L.pendenciasConfig(est, { pulados });
      for (const a of lista.querySelectorAll(".cfg-nav-item")) {
        const id = String(a.getAttribute("href") || "").replace("#/config/", "");
        const n = pend[id];
        if (!n) continue;
        // só o título da seção, lido ANTES de pôr o selo: senão o leitor de tela ouve o número duas vezes («Números3, 3 passos»)
        const nome = (a.querySelector("span:not(.nav-selo)") || a).textContent.trim();
        a.appendChild(h("span", { class: "nav-selo cfg-pend", title: `${n} ${n === 1 ? "passo pendente" : "passos pendentes"} no checklist` }, String(n)));
        a.setAttribute("aria-label", `${nome}, ${n} ${n === 1 ? "passo pendente" : "passos pendentes"}`);
      }
    }).catch(() => { /* sem o checklist o menu fica como estava */ });
  }
  const sec = h("section", { class: "cfg-sec", "aria-live": "polite" });
  const raiz = h("div", { class: ["cfg", pedida && "na-secao"] }, lista, sec);
  ui.limpar(ctx.alvo);
  ctx.alvo.append(
    h("header", { class: "cab-pag" }, h("div", null,
      h("p", { class: "rotulo" }, ctx.cliente ? ctx.cliente.nome : ctx.sessao.org ? ctx.sessao.org.nome : ""),
      h("h1", { class: "titulo-pag" }, "Configurações"))),
    raiz);

  if (!atual) {
    sec.appendChild(ui.vazio({ titulo: pedida ? "Esta seção não está disponível." : "Nada para configurar por aqui.",
      texto: pedida ? "Ela pode não fazer parte do seu plano ou do seu acesso." : "", icone: "engrenagem",
      acao: pedida ? { rotulo: "Ver as configurações", fn: () => ctx.navegar("#/config") } : null }));
    return;
  }
  ctx.titulo(atual.titulo);
  const voltar = h("a", { class: "voltar-link cfg-voltar", href: "#/config" }, ui.icone("seta-esq"), "Configurações");
  const alvo = h("div", { class: "pilha" });
  sec.append(voltar, alvo);
  try {
    const r = await atual.montar(ctx, alvo);
    if (typeof r === "function") _limpeza.push(r);
  } catch (e) {
    console.error(`config ${atual.id}`, e);
    ui.limpar(alvo);
    alvo.appendChild(ui.erroCartao(e, () => montar(ctx)));
  }
}

/* ============================================================
   PERFIL
   ============================================================ */
async function secaoPerfil(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  const c = ctx.sessao.conta;
  const formDados = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome", nome: "nome", valor: c.nome, obrigatorio: true, autocomplete: "name", max: 80 }),
      ui.campo({ rotulo: "Celular (WhatsApp)", nome: "telefone", tipo: "tel", valor: c.telefone ? ui.telBR(c.telefone) : "", autocomplete: "tel", ajuda: "Opcional. Usado para avisos." }),
      ui.campo({ rotulo: "E-mail", nome: "email_ro", valor: c.email, desabilitado: true, ajuda: "O e-mail é o seu login e não muda por aqui." })),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Salvar dados")));
  formDados.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(formDados, null);
    const d = ui.lerForm(formDados);
    if (!d.nome || d.nome.length < 2) return ui.marcarErro(formDados, "nome", "Informe o seu nome.");
    try {
      await ui.carregando(formDados.querySelector("[type=submit]"), api.rpc("nx_perfil_salvar", { p_dados: { nome: d.nome, telefone: d.telefone || "" } }));
      ui.toast("Dados salvos.", { tipo: "ok" });
      await ctx.shell.recarregarSessao();
    } catch (e) {
      if (e.codigo === "telefone_invalido") return ui.marcarErro(formDados, "telefone", "Use DDD + número, ex.: (12) 99830-3030.");
      if (e.codigo === "nome_invalido") return ui.marcarErro(formDados, "nome", "Informe o seu nome (2 a 80 letras).");
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });

  const formSenha = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Senha atual", nome: "atual", tipo: "senha", autocomplete: "current-password", obrigatorio: true }),
      h("span", { "aria-hidden": "true" }),
      ui.campo({ rotulo: "Senha nova", nome: "nova", tipo: "senha", autocomplete: "new-password", obrigatorio: true, ajuda: "Pelo menos 8 caracteres." }),
      ui.campo({ rotulo: "Repita a senha nova", nome: "nova2", tipo: "senha", autocomplete: "new-password", obrigatorio: true })),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Trocar senha")));
  formSenha.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(formSenha, null);
    const d = ui.lerForm(formSenha);
    if (!d.atual) return ui.marcarErro(formSenha, "atual", "Informe a senha atual.");
    if (!d.nova || d.nova.length < 8) return ui.marcarErro(formSenha, "nova", "A senha precisa ter pelo menos 8 caracteres.");
    if (d.nova !== d.nova2) return ui.marcarErro(formSenha, "nova2", "As duas senhas não são iguais.");
    try {
      await ui.carregando(formSenha.querySelector("[type=submit]"), api.rpc("nx_senha_trocar", { p_atual: d.atual, p_nova: d.nova }));
      formSenha.reset();
      ui.toast("Senha trocada. As outras sessões foram encerradas.", { tipo: "ok" });
    } catch (e) {
      if (e.codigo === "credenciais_invalidas") return ui.marcarErro(formSenha, "atual", "A senha atual não confere.");
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });

  const btTodas = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("sair"), "Sair de todos os aparelhos");
  btTodas.addEventListener("click", async () => {
    const ok = await ui.confirmar({ titulo: "Sair de todos os aparelhos?", texto: "Você e qualquer outro aparelho conectado com a sua conta vão precisar entrar de novo.", rotulo: "Sair de todos" });
    if (!ok) return;
    try { await ui.carregando(btTodas, api.rpc("nx_sair_todas")); } catch { /* sai do mesmo jeito */ }
    await ctx.shell.sair();
  });

  alvo.append(
    h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Seus dados"),
      h("p", { class: "sub" }, `Você entra como ${ctx.sessao.conta.super ? "equipe da plataforma" : ctx.sessao.conta.papel === "gestor" ? "gestor" : "usuário da empresa"}.`))), formDados),
    h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Senha"),
      h("p", { class: "sub" }, "Ao trocar, as sessões abertas em outros aparelhos são encerradas."))), formSenha),
    h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Aparelhos conectados"),
      h("p", { class: "sub" }, "Esqueceu a conta aberta num computador da recepção? Encerre todas as sessões de uma vez."))), btTodas));
}

/* ============================================================
   USUÁRIOS E CONVITES
   ============================================================ */
const PAPEIS_EMPRESA = [
  { valor: "admin", rotulo: "Administrador", ajuda: "Tudo da empresa, inclusive usuários e configurações." },
  { valor: "supervisor", rotulo: "Supervisor", ajuda: "Conversas dos seus departamentos, respostas rápidas e importação." },
  { valor: "atendente", rotulo: "Atendente", ajuda: "Atende as conversas e cuida do CRM." },
  { valor: "leitura", rotulo: "Somente leitura", ajuda: "Só consulta; não altera nada." },
];
const ROT_PAPEL = Object.fromEntries(PAPEIS_EMPRESA.map(p => [p.valor, p.rotulo]));

function linkCompleto(ctx, link) { return String(link || "").startsWith("#") ? ctx.linkPublico(link) : link; }

async function secaoUsuarios(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  let dados = null;

  async function carregar() {
    ui.limpar(alvo);
    alvo.appendChild(ui.esqueleto("tabela", 4));
    try {
      dados = await api.rpcC("nx_usuarios_listar");
      desenhar();
    } catch (e) {
      ui.limpar(alvo);
      alvo.appendChild(ui.erroCartao(e, carregar));
    }
  }

  async function salvar(conta_id, mudanca) {
    try {
      dados = await api.rpcC("nx_usuario_salvar", { p_usuario: { conta_id, ...mudanca } });
      ui.toast("Acesso atualizado.", { tipo: "ok" });
    } catch (e) {
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
    desenhar();
  }

  function seletorDeps(u) {
    const deps = dados.departamentos || [];
    const sel = new Set(u.departamentos || []);
    const txt = () => sel.size === 0 ? "Todos" : deps.filter(d => sel.has(d.id)).map(d => d.nome).join(", ") || "Todos";
    if (!u.editavel || !deps.length) return h("span", { class: "fraco" }, txt());
    const b = h("button", { type: "button", class: "bt bt-fant bt-p", "aria-label": `Departamentos de ${u.nome}: ${txt()}` }, txt(), ui.icone("seta-baixo"));
    b.addEventListener("click", () => {
      const lista = h("div", { class: "flut-lista" }, deps.map(d => h("label", { class: "flut-op" },
        h("input", { type: "checkbox", checked: sel.has(d.id), on: { change: ev => { ev.target.checked ? sel.add(d.id) : sel.delete(d.id); } } }),
        ui.etiqueta({ nome: d.nome, cor: d.cor }))));
      const ok = h("button", { type: "button", class: "bt bt-prim bt-p" }, "Aplicar");
      const f = ui.flutuante(b, h("div", { class: "pilha-p" }, h("p", { class: "rotulo" }, "Departamentos"),
        h("p", { class: "fraco" }, "Nenhum marcado = todos."), lista, ok), { largura: 260 });
      ok.addEventListener("click", () => { f.fechar(); salvar(u.conta_id, { departamentos: [...sel] }); });
    });
    return b;
  }

  function interruptor(u, chave, rotulo) {
    const id = `sw-${chave}-${u.conta_id}`;
    const inp = h("input", { type: "checkbox", id, role: "switch", checked: !!u[chave], disabled: !u.editavel });
    inp.addEventListener("change", () => salvar(u.conta_id, { [chave]: inp.checked }));
    return h("div", { class: "campo campo-check campo-switch" }, h("label", { for: id }, inp, h("span", { class: "check-marca", "aria-hidden": "true" }), h("span", { class: "sr-only" }, `${rotulo}: ${u.nome}`)));
  }

  function desenhar() {
    ui.limpar(alvo);
    const us = dados.usuarios || [];
    const lim = dados.limite;
    const usoTxt = lim ? `${dados.uso} de ${lim} usuários do plano (convites pendentes contam).` : `${us.length} ${us.length === 1 ? "pessoa" : "pessoas"} com acesso.`;
    const btConvidar = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("convidar"), "Convidar");
    btConvidar.addEventListener("click", () => abrirConvite());
    if (lim && dados.uso >= lim) btConvidar.title = "O plano chegou ao limite de usuários.";

    const tab = ui.tabela({
      rotulo: "Usuários com acesso",
      chave: "conta_id",
      colunas: [
        { chave: "nome", rotulo: "Pessoa", ordenavel: true, principal: true, render: u => h("div", { class: "cel-nome" }, ui.avatar(u.nome, u.conta_id),
          h("div", null, h("b", null, u.nome, u.eu ? " (você)" : ""), h("small", null, u.email))) },
        { chave: "papel", rotulo: "Papel", ordenavel: true, render: u => {
          if (!u.editavel) return ui.pilula(u.gestor ? "Gestor" : ROT_PAPEL[u.papel] || u.papel, u.papel === "admin" ? "prim" : "neutra");
          const s = h("select", { class: "sel papel-sel", "aria-label": `Papel de ${u.nome}` },
            PAPEIS_EMPRESA.map(p => h("option", { value: p.valor, selected: p.valor === u.papel }, p.rotulo)));
          s.addEventListener("change", () => salvar(u.conta_id, { papel: s.value }));
          return s;
        } },
        { chave: "departamentos", rotulo: "Departamento", render: seletorDeps },
        { chave: "ver_todas", rotulo: "Vê colegas", render: u => interruptor(u, "ver_todas", "Vê as conversas dos colegas") },
        { chave: "recebe_conversas", rotulo: "Rodízio", render: u => interruptor(u, "recebe_conversas", "Recebe conversas novas no rodízio") },
        { chave: "ultimo_acesso", rotulo: "Acesso", ordenavel: true, render: u => u.ultimo_acesso ? h("span", { title: ui.dataHoraBR(u.ultimo_acesso) }, ui.relativo(u.ultimo_acesso)) : h("span", { class: "fraco" }, "Nunca entrou") },
        { chave: "acoes", rotulo: "Ações", alinhar: "dir", render: u => {
          if (!u.editavel) return h("span", { class: "sr-only" }, "Sem ações");
          const b = h("button", { type: "button", class: "bt-icone", "aria-label": `Ações para ${u.nome}` }, ui.icone("opcoes"));
          b.addEventListener("click", () => ui.menu(b, [
            { rotulo: "Gerar link de nova senha", icone: "cadeado", fn: () => linkSenha(u) },
            "-",
            { rotulo: "Remover acesso", icone: "lixeira", perigo: true, fn: () => remover(u) },
          ]));
          return b;
        } },
      ],
      linhas: us,
      vazio: "Ninguém com acesso ainda. Convide a equipe.",
    });

    const convites = dados.convites || [];
    const listaConv = convites.length ? h("div", { class: "lista-convites" }, convites.map(cv => {
      const b = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Revogar");
      b.addEventListener("click", async () => {
        if (!(await ui.confirmar({ titulo: "Revogar convite?", texto: "O link deixa de funcionar na hora.", rotulo: "Revogar", perigo: true }))) return;
        try { await ui.carregando(b, api.rpcC("nx_convite_revogar", { p_convite: cv.id })); ui.toast("Convite revogado.", { tipo: "ok" }); await carregar(); }
        catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      });
      return h("div", { class: "convite-item" }, ui.icone("link"),
        h("div", null, h("b", null, cv.nome || cv.email || "Convite sem nome"),
          h("small", null, [ROT_PAPEL[cv.papel] || cv.papel, cv.email && cv.nome ? cv.email : null, `vence ${ui.relativo(cv.expira_em)}`].filter(Boolean).join(" · "))),
        b);
    })) : h("p", { class: "fraco" }, "Nenhum convite aguardando.");

    alvo.append(
      h("div", { class: "cartao" },
        h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Usuários e convites"), h("p", { class: "sub" }, usoTxt),
          h("p", { class: "fraco" }, "Vê colegas: enxerga as conversas atribuídas a outras pessoas. Rodízio: recebe conversas novas automaticamente.")), btConvidar),
        tab.el),
      h("div", { class: "cartao" },
        h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Convites pendentes"),
          h("p", { class: "sub" }, "Links gerados que ainda não foram usados. Quem abrir cria a conta; se já usar o sistema, entra com a senha atual."))),
        listaConv));
  }

  async function abrirConvite() {
    const deps = dados.departamentos || [];
    const form = h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: "Papel", nome: "papel", tipo: "select", valor: "atendente", opcoes: PAPEIS_EMPRESA.map(p => ({ valor: p.valor, rotulo: p.rotulo })) }),
      h("p", { class: "campo-ajuda", id: "ajuda-papel" }, PAPEIS_EMPRESA[2].ajuda),
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Nome (opcional)", nome: "nome", max: 80, autocomplete: "off" }),
        ui.campo({ rotulo: "E-mail (opcional)", nome: "email", tipo: "email", autocomplete: "off", ajuda: "Já vem preenchido no convite." })),
      deps.length ? ui.campo({ rotulo: "Departamentos", nome: "departamentos", tipo: "multipla", opcoes: deps.map(d => ({ valor: d.id, rotulo: d.nome })), ajuda: "Nenhum marcado = todos." }) : null,
      ui.campo({ rotulo: "O link vale por", nome: "dias", tipo: "select", valor: "7", opcoes: [["1", "1 dia"], ["3", "3 dias"], ["7", "7 dias"], ["14", "14 dias"], ["30", "30 dias"]].map(([v, r]) => ({ valor: v, rotulo: r })) }));
    const selPapel = form.querySelector("select[name=papel]");
    selPapel.addEventListener("change", () => { const p = PAPEIS_EMPRESA.find(x => x.valor === selPapel.value); form.querySelector("#ajuda-papel").textContent = p ? p.ajuda : ""; });
    let criado = null;
    await ui.modal({
      titulo: "Convidar para a equipe", corpo: form, largura: "m",
      acoes: [
        { rotulo: "Cancelar", tipo: "neutro" },
        { rotulo: "Gerar link", tipo: "primario", fn: async m => {
          if (criado) return true;
          ui.marcarErro(form, null);
          const d = ui.lerForm(form);
          if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) { ui.marcarErro(form, "email", "Esse e-mail não parece válido."); return false; }
          const r = await api.rpcC("nx_convite_criar", { p_dados: { papel: d.papel, nome: d.nome || null, email: d.email || null, departamentos: d.departamentos || [], dias: Number(d.dias) || 7 }, p_org: null });
          criado = r;
          const link = linkCompleto(ctx, r.link);
          const saud = d.nome ? `Olá, ${d.nome.split(" ")[0]}!` : "Olá!";
          ui.limpar(m.corpo);
          m.corpo.append(
            h("div", { class: "aviso aviso-ok" }, ui.icone("check"), h("p", null, "Convite criado. Envie o link para a pessoa — ele não chega por e-mail.")),
            ui.blocoLink(link, { rotulo: "Link do convite", textoWhats: `${saud} Você foi convidado para acessar a ${ctx.cliente.nome} no ${ctx.shell.marcaEfetiva().produto}. Crie seu acesso por este link:` }),
            h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(r.expira_em)} e só uma vez.`));
          const bt = m.el.querySelector(".modal-rod [data-tipo=primario]");
          if (bt) bt.textContent = "Concluir";
          const cancelar = m.el.querySelector(".modal-rod [data-tipo=neutro]");
          if (cancelar) cancelar.hidden = true;
          return false;
        } },
      ],
    });
    if (criado) await carregar();
  }

  async function linkSenha(u) {
    try {
      const r = await api.rpcC("nx_senha_link_criar", { p_conta: u.conta_id });
      const link = linkCompleto(ctx, r.link);
      await ui.modal({
        titulo: "Link de nova senha", largura: "m",
        corpo: h("div", { class: "pilha" },
          h("p", null, `Envie para ${u.nome}. Quem abrir cria uma senha nova e todas as sessões abertas dessa conta são encerradas.`),
          ui.blocoLink(link, { rotulo: "Link de nova senha", textoWhats: `Olá, ${String(u.nome).split(" ")[0]}! Crie sua senha nova por este link:` }),
          h("p", { class: "fraco" }, `Vale por 24 horas (até ${ui.dataHoraBR(r.expira_em)}) e só uma vez.`)),
        acoes: [{ rotulo: "Concluir", tipo: "primario", valor: true }],
      });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }

  async function remover(u) {
    const ok = await ui.confirmar({ titulo: `Remover o acesso de ${u.nome}?`, texto: "A conta continua existindo; ela só deixa de entrar nesta empresa. Conversas e registros dela ficam.", rotulo: "Remover acesso", perigo: true });
    if (!ok) return;
    try { dados = await api.rpcC("nx_usuario_remover", { p_conta: u.conta_id }); ui.toast("Acesso removido.", { tipo: "ok" }); desenhar(); }
    catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }

  await carregar();
}

/* ============================================================
   MARCA, DOMÍNIO, PLANO E USO (P0-B)
   ============================================================ */
function secoesMarcaPlano() {
  return [
    { id: "marca", titulo: "Marca e tema", grupo: "Marca", icone: "pincel", semCliente: true, visivel: podeMarca, montar: secaoMarca },
    { id: "dominio", titulo: "Domínio próprio", grupo: "Marca", icone: "globo", conta: "gestor", montar: secaoDominio },
    { id: "plano", titulo: "Plano e uso", grupo: "Plano", icone: "cartao", papelMin: "admin", montar: secaoPlano },
  ];
}

const EQUIPE = ["gestor", "super"];
/** Tema da empresa: admin com o módulo `marca` no plano, ou a equipe (gestor/super) — §3.4. */
function podeTema(ctx) { return !!ctx.cliente && ctx.pode("admin") && (ctx.temModulo("marca") || EQUIPE.includes(ctx.cliente.papel)); }
/** Marca da org: conta de gestor (revenda) ou super (plataforma). */
function podeOrg(ctx) { return ctx.sessao.conta.papel === "gestor" && !!ctx.sessao.org; }
function podeMarca(ctx) { return podeTema(ctx) || podeOrg(ctx); }

function erroCod(codigo) { return Object.assign(new Error(codigo), { codigo }); }

/* ---------------- imagens (reimplementa a lógica do web/marca.js: canvas, WebP, ≤ 60 KB) ---------------- */
const LIMITE_LOGO = 60 * 1024;
const LIMITE_FAVICON = 28000;

function paraDataUrl(blob) {
  return new Promise((ok, falha) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result));
    fr.onerror = () => falha(erroCod("leitura"));
    fr.readAsDataURL(blob);
  });
}
async function desenharReduzido(bmp, W, H, { quadrado = false, png = false, q = .9 } = {}) {
  const esc = Math.min(1, W / bmp.width, H / bmp.height);
  const w = quadrado ? W : Math.max(1, Math.round(bmp.width * esc));
  const hh = quadrado ? H : Math.max(1, Math.round(bmp.height * esc));
  const c = document.createElement("canvas");
  c.width = w; c.height = hh;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  if (quadrado) {
    const e = Math.min(W / bmp.width, H / bmp.height), dw = bmp.width * e, dh = bmp.height * e;
    g.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else g.drawImage(bmp, 0, 0, w, hh);
  let blob = png ? null : await new Promise(r => c.toBlob(r, "image/webp", q));
  if (!blob || blob.type !== "image/webp") blob = await new Promise(r => c.toBlob(r, "image/png"));
  if (!blob) throw erroCod("canvas");
  return paraDataUrl(blob);
}
function amostraPx(bmp) {
  try {
    const c = document.createElement("canvas");
    c.width = 48; c.height = 48;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, 48, 48);
    return g.getImageData(0, 0, 48, 48).data;
  } catch { return null; }
}
/** Arquivo PNG/JPEG/WebP → { url: data URL dentro do limite, px: amostra para cores sugeridas }. */
async function processarImagem(arquivo, { W = 320, H = 160, limite = LIMITE_LOGO, quadrado = false, png = false } = {}) {
  if (!arquivo || !/^image\/(png|jpeg|webp)$/.test(arquivo.type)) throw erroCod("formato");
  if (arquivo.size > 8 * 1024 * 1024) throw erroCod("arquivo_grande");
  const bmp = await createImageBitmap(arquivo);
  try {
    let url = await desenharReduzido(bmp, W, H, { quadrado, png, q: .9 });
    if (url.length > limite) url = await desenharReduzido(bmp, Math.round(W * .6), Math.round(H * .6), { quadrado, png, q: .75 });
    if (url.length > limite) throw erroCod("arquivo_grande");
    return { url, px: amostraPx(bmp) };
  } finally { if (bmp.close) bmp.close(); }
}
/** Cores sugeridas de uma imagem já salva (data: ou https com CORS); falha em silêncio. */
async function pxDeUrl(url) {
  try {
    const img = new Image();
    img.decoding = "async";
    if (!url.startsWith("data:")) img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const bmp = await createImageBitmap(img);
    const px = amostraPx(bmp);
    if (bmp.close) bmp.close();
    return px;
  } catch { return null; }
}
function textoErroImagem(e) {
  const c = e && e.codigo;
  if (c === "formato") return "Use uma imagem PNG, JPEG ou WebP (SVG não é aceito).";
  if (c === "arquivo_grande") return "A imagem ficou grande demais mesmo reduzida. Tente um arquivo mais simples.";
  return "Não foi possível ler essa imagem. Tente outro arquivo.";
}

/* ---------------- seção: Marca e tema ---------------- */
async function secaoMarca(ctx, alvo) {
  const { ui } = ctx;
  const h = ui.h;
  const temTema = podeTema(ctx), temOrg = podeOrg(ctx);
  const org = ctx.sessao.org;
  const nomeOrg = ctx.sessao.conta.super ? "plataforma" : (org ? org.nome : "agência");
  const itens = [
    temTema ? { id: "tema", rotulo: `Tema da ${ctx.cliente.nome}`, icone: "empresa" } : null,
    temOrg ? { id: "org", rotulo: ctx.sessao.conta.super ? "Marca da plataforma" : `Marca da ${nomeOrg}`, icone: "pincel" } : null,
  ].filter(Boolean);
  let ativa = itens.some(i => i.id === ctx.rota.query.de) ? ctx.rota.query.de : itens[0].id;
  let limpar = null;
  const corpo = h("div", { class: "pilha" });
  const explica = h("p", { class: "sub" });
  function abrir(id) {
    ativa = id;
    if (limpar) try { limpar(); } catch { /* ok */ }
    explica.textContent = id === "tema"
      ? `Logo e cores só desta empresa. Quem entra na ${ctx.cliente.nome} vê o app com elas; o resto segue a marca da ${nomeOrg}.`
      : (ctx.sessao.conta.super
        ? "A marca padrão do produto: nome, logo, cores e a tela de entrada. Vale para os clientes da plataforma sem tema próprio."
        : "O app com a SUA marca para todos os seus clientes: nome do produto, logo, cores, tela de entrada e WhatsApp de suporte.");
    editorMarca(ctx, corpo, { tipo: id, org }).then(f => { limpar = f; });
  }
  if (itens.length > 1) {
    const ab = ui.abas({ itens, ativo: ativa, rotulo: "O que editar", aoMudar: abrir });
    alvo.append(ab.el);
  }
  alvo.append(explica, corpo);
  abrir(ativa);
  return () => { if (limpar) limpar(); };
}

/**
 * Editor de marca com pré-visualização ao vivo (T14 → Marca; também usado pelo Admin → Revendas).
 * tipo 'tema' = tema da empresa ativa (logo, logo claro, cores) · 'org' = marca de uma org (tudo de §4.2.1).
 * Devolve uma função de limpeza (desfaz o "Ver no app inteiro").
 */
export async function editorMarca(ctx, alvo, { tipo = "tema", org = null, aoSalvar = null } = {}) {
  const { ui, api } = ctx;
  const h = ui.h;
  const T = ctx.shell.tema;
  const soTema = tipo === "tema";
  ui.limpar(alvo);
  alvo.appendChild(ui.esqueleto("cartoes", 2));

  let base = {}, reserva = {}, orgMarca = {}, orgInfo = null;
  try {
    if (soTema) {
      const r = await api.rpcC("nx_cliente_tema");
      base = (r && r.tema) || {};
      reserva = (r && r.marca_cliente) || {};
      orgMarca = ctx.shell.marcaOrg() || {};
    } else {
      const lista = await api.rpc("nx_orgs_listar");
      orgInfo = (lista || []).find(o => org && o.id === org.id) || null;
      if (!orgInfo) throw erroCod("sem_permissao");
      base = orgInfo.marca || {};
    }
  } catch (e) {
    ui.limpar(alvo);
    alvo.appendChild(ui.erroCartao(e, () => editorMarca(ctx, alvo, { tipo, org, aoSalvar })));
    return () => {};
  }

  // ---- estado de trabalho
  const coresOrg = T.marcaEfetiva(soTema ? orgMarca : base, {}).cores;
  const m = soTema
    ? { logo: base.logo || "", logo_claro: base.logo_claro || "", cores: { ...coresOrg, ...(reserva.corMarca && T.corValida(reserva.corMarca) ? { primaria: reserva.corMarca.toUpperCase() } : {}), ...(base.cores || {}) } }
    : { produto: base.produto || "", assinatura: base.assinatura || "", logo: base.logo || "", logo_claro: base.logo_claro || "", favicon: base.favicon || "",
        cores: { ...coresOrg, ...(base.cores || {}) }, login_titulo: base.login_titulo || "", login_texto: base.login_texto || "", suporte_wa: base.suporte_wa || "" };
  let coresProprias = soTema ? !!(base.cores && Object.keys(base.cores).length) : true;
  let appInteiro = false;
  let salvo = JSON.stringify(payload());

  function payload() {
    const r = {};
    const chaves = soTema ? ["logo", "logo_claro"] : ["produto", "assinatura", "logo", "logo_claro", "favicon", "login_titulo", "login_texto", "suporte_wa"];
    for (const k of chaves) {
      let v = typeof m[k] === "string" ? m[k].trim() : "";
      if (k === "suporte_wa") v = v.replace(/\D/g, "");
      if (v) r[k] = v;
    }
    if (!soTema || coresProprias) {
      const c = {};
      for (const k of ["primaria", "secundaria", "fundo"]) { const x = T.normalizarHex(m.cores[k]); if (x) c[k] = x; }
      if (Object.keys(c).length) r.cores = c;
    }
    return r;
  }
  function efetiva() {
    const p = payload();
    // a reserva do painel clássico (cfg.corMarca/logoUrl) vale como no shell: só onde o tema não tem valor
    if (soTema) return T.marcaEfetiva(orgMarca, p, reserva);
    return T.marcaEfetiva(p, {});
  }
  const sujo = () => JSON.stringify(payload()) !== salvo;

  // ---- formulário de textos (org)
  const form = h("form", { class: "pilha", novalidate: true });
  form.addEventListener("submit", ev => ev.preventDefault());
  if (!soTema) {
    form.append(
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Nome do produto", nome: "produto", valor: m.produto, max: T.LIMITES_MARCA.produto, placeholder: T.PADRAO.produto, ajuda: "Aparece no menu, na aba do navegador e na tela de entrada." }),
        ui.campo({ rotulo: "Assinatura", nome: "assinatura", valor: m.assinatura, max: T.LIMITES_MARCA.assinatura, placeholder: "Ex.: Equipe Conecta", ajuda: "Usada pela IA e nos textos automáticos." })));
  }
  const formEntrada = h("form", { class: "pilha", novalidate: true });
  formEntrada.addEventListener("submit", ev => ev.preventDefault());
  if (!soTema) {
    formEntrada.append(
      ui.campo({ rotulo: "Título da tela de entrada", nome: "login_titulo", valor: m.login_titulo, max: T.LIMITES_MARCA.login_titulo, placeholder: "Anúncio, conversa e venda na mesma órbita." }),
      ui.campo({ rotulo: "Texto de apoio", nome: "login_texto", tipo: "textarea", linhas: 2, valor: m.login_texto, max: T.LIMITES_MARCA.login_texto, placeholder: "Entre com o e-mail e a senha que você recebeu." }),
      ui.campo({ rotulo: "WhatsApp de suporte", nome: "suporte_wa", tipo: "tel", valor: m.suporte_wa, placeholder: "5512999998888", ajuda: "Só números, com 55 e DDD. Aparece em \"Esqueci a senha\" e nos avisos de teste e suspensão." }));
  }
  for (const f of [form, formEntrada]) {
    f.addEventListener("input", ev => {
      const n = ev.target && ev.target.name;
      if (!n || !(n in m) || n === "cores") return;
      m[n] = ev.target.value;
      ui.marcarErro(f, n, null);
      atualizar();
    });
  }

  // ---- imagens
  const sugestoes = h("div", { class: "cores-sug", "aria-live": "polite" });
  function mostrarSugestoes(px) {
    ui.limpar(sugestoes);
    const cores = px ? T.coresSugeridas(px, 5) : [];
    if (!cores.length) return;
    sugestoes.append(h("span", { class: "rotulo" }, "Cores do logo"));
    for (const c of cores) {
      const b = h("button", { type: "button", class: "cor-op", style: { "--cor": ui.corOk(c) }, "aria-label": `Usar a cor ${c} do logo`, title: c });
      b.addEventListener("click", () => ui.menu(b, [
        { rotulo: "Usar como primária", icone: "pincel", fn: () => usarCor("primaria", c) },
        { rotulo: "Usar como secundária", icone: "pincel", fn: () => usarCor("secundaria", c) },
        { rotulo: "Usar como fundo", icone: "pincel", fn: () => usarCor("fundo", c) },
      ]));
      sugestoes.append(b);
    }
  }
  function controleImagem({ chave, rotulo, ajuda, claro = false, favicon = false }) {
    const amostra = h("div", { class: ["logo-amostra", claro && "claro", favicon && "favicon"] });
    const arquivo = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
    const btEnviar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("clipe"), "Enviar imagem");
    const btRemover = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("lixeira"), "Remover");
    const extra = favicon ? h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("copiar"), "Gerar do logo") : null;
    const erro = h("small", { class: "campo-erro", role: "alert", hidden: true });
    const avisoProp = h("p", { class: "aviso aviso-aten img-aviso", role: "status", hidden: true });
    function desenhar() {
      ui.limpar(amostra);
      avisoProp.hidden = true;
      const u = T.imagemSegura(m[chave]);
      if (u) {
        const im = h("img", { src: u, alt: `${rotulo} atual` });
        // logo estreito/alto demais: avisa na prévia (o ícone da aba é sempre quadrado e fica de fora)
        if (!favicon) im.addEventListener("load", () => {
          const txt = avisoProporcaoLogo(im.naturalWidth, im.naturalHeight);
          ui.limpar(avisoProp);
          if (txt) avisoProp.append(ui.icone("alerta"), h("span", null, txt));
          avisoProp.hidden = !txt;
        });
        amostra.append(im);
      } else amostra.append(h("span", { class: "fraco" }, "Sem imagem"));
      btRemover.hidden = !u;
    }
    btEnviar.addEventListener("click", () => arquivo.click());
    btRemover.addEventListener("click", () => { m[chave] = ""; desenhar(); if (chave === "logo") mostrarSugestoes(null); atualizar(); });
    arquivo.addEventListener("change", async () => {
      const f = arquivo.files && arquivo.files[0];
      arquivo.value = "";
      if (!f) return;
      erro.hidden = true;
      try {
        const r = await ui.carregando(btEnviar, processarImagem(f, favicon ? { W: 64, H: 64, limite: LIMITE_FAVICON, quadrado: true, png: true } : {}));
        m[chave] = r.url;
        if (chave === "logo") mostrarSugestoes(r.px);
        desenhar(); atualizar();
        ui.anunciar(`${rotulo} atualizado na pré-visualização.`);
      } catch (e) { erro.textContent = textoErroImagem(e); erro.hidden = false; }
    });
    if (extra) extra.addEventListener("click", async () => {
      const u = T.imagemSegura(m.logo);
      if (!u) { erro.textContent = "Envie o logo primeiro."; erro.hidden = false; return; }
      try {
        const img = new Image(); img.src = u; await img.decode();
        const bmp = await createImageBitmap(img);
        m.favicon = await desenharReduzido(bmp, 64, 64, { quadrado: true, png: true });
        if (bmp.close) bmp.close();
        erro.hidden = true; desenhar(); atualizar();
      } catch { erro.textContent = "Não foi possível gerar o ícone a partir do logo."; erro.hidden = false; }
    });
    desenhar();
    return h("div", { class: "img-campo" },
      h("div", { class: "img-campo-txt" }, h("b", null, rotulo), ajuda ? h("small", { class: "campo-ajuda" }, ajuda) : null),
      h("div", { class: "logo-caixa" }, amostra, h("div", { class: "linha" }, btEnviar, extra, btRemover), arquivo), erro, avisoProp);
  }

  // ---- cores
  const seletores = {};
  const caixaCores = h("fieldset", { class: "pilha cores-caixa" });
  const ROT = { primaria: "Cor primária", secundaria: "Cor secundária", fundo: "Cor de fundo" };
  const AJ = {
    primaria: "Botões, destaques e links. O texto sobre ela é escolhido sozinho para ficar legível.",
    secundaria: "Detalhes, gráficos e o segundo brilho do fundo.",
    fundo: "Escuro vira o palco noturno; claro vira o tema claro. O contraste do texto é garantido.",
  };
  for (const k of ["primaria", "secundaria", "fundo"]) {
    const sc = ui.seletorCor({ valor: m.cores[k], paleta: k === "fundo" ? T.FUNDOS : ctx.paleta, rotulo: ROT[k],
      aoMudar: c => { m.cores[k] = c; atualizar(); } });
    seletores[k] = sc;
    caixaCores.append(h("div", { class: "cor-campo" }, h("div", { class: "img-campo-txt" }, h("b", null, ROT[k]), h("small", { class: "campo-ajuda" }, AJ[k])), sc));
  }
  function usarCor(k, c) {
    m.cores[k] = T.normalizarHex(c);
    if (soTema && !coresProprias) { coresProprias = true; if (swProprias) swProprias.checked = true; caixaCores.disabled = false; }
    seletores[k].definir(m.cores[k]);
    atualizar();
  }
  let swProprias = null;
  const blocoProprias = soTema ? (() => {
    const c = ui.campo({ tipo: "interruptor", nome: "cores_proprias", rotulo: "Usar cores próprias nesta empresa", valor: coresProprias,
      ajuda: reserva.corMarca ? `Desligado, vale a cor do painel clássico (${reserva.corMarca}) e as cores da ${ctx.sessao.org ? ctx.sessao.org.nome : "agência"}.` : `Desligado, vale a marca da ${ctx.sessao.org ? ctx.sessao.org.nome : "agência"}.` });
    swProprias = c.querySelector("input");
    swProprias.addEventListener("change", () => { coresProprias = swProprias.checked; caixaCores.disabled = !coresProprias; atualizar(); });
    caixaCores.disabled = !coresProprias;
    return c;
  })() : null;

  // ---- pré-visualização ao vivo (mini-app com as variáveis aplicadas SÓ nele)
  const pvLogo = h("span", { class: "pv-logo" });
  const pvProduto = h("b", null);
  const pvEsquema = h("span", { class: "pilula pilula-neutra" });
  const previa = h("div", { class: "previa", role: "img", "aria-label": "Pré-visualização do app com a marca" },
    h("div", { class: "pv-lat", "aria-hidden": "true" }, pvLogo,
      h("span", { class: "pv-ic on" }, ui.icone("inicio")), h("span", { class: "pv-ic" }, ui.icone("chat")),
      h("span", { class: "pv-ic" }, ui.icone("funil")), h("span", { class: "pv-ic" }, ui.icone("grafico"))),
    h("div", { class: "pv-main", "aria-hidden": "true" },
      h("div", { class: "pv-topo" }, pvProduto, h("span", { class: "linha" }, h("span", { class: "pilula pilula-prim" }, "3 novas"), h("span", { class: "pv-av" }, "JP"))),
      h("div", { class: "pv-corpo" },
        h("div", { class: "pv-kpis" },
          h("div", { class: "pv-kpi" }, h("small", null, "Conversas"), h("b", null, "128")),
          h("div", { class: "pv-kpi" }, h("small", null, "Fechados"), h("b", { class: "luz" }, "21")),
          h("div", { class: "pv-kpi" }, h("small", null, "Receita"), h("b", null, "18,4 mil"))),
        h("div", { class: "pv-dupla" },
          h("div", { class: "pv-kanban" },
            h("div", { class: "pv-col" }, h("div", { class: "pv-col-h", style: { "--cor": "var(--pal-0)" } }, h("i"), "Nova conversa"),
              h("div", { class: "pv-card" }, "Marina Alves", h("small", null, "Anúncio · há 5 min")),
              h("div", { class: "pv-card" }, "Carlos Dias", h("small", null, "Indicação"))),
            h("div", { class: "pv-col" }, h("div", { class: "pv-col-h", style: { "--cor": "var(--pal-4)" } }, h("i"), "Fechou"),
              h("div", { class: "pv-card" }, "Ana Souza", h("small", null, "R$ 2.400")))),
          h("div", { class: "pv-chat" },
            h("div", { class: "pv-bolha pv-in" }, "Oi! Vi o anúncio, ainda tem horário amanhã?"),
            h("div", { class: "pv-bolha pv-out" }, "Tem sim! Às 14h ou às 16h?"),
            h("div", { class: "pv-bolha pv-nota" }, "Nota interna: paciente indicou a amiga."))),
        h("div", { class: "pv-botoes" },
          h("span", { class: "bt bt-prim" }, "Agendar"), h("span", { class: "bt bt-sec" }, "Transferir"),
          h("span", { class: "pv-link" }, "Ver histórico"), h("span", { class: "pilula pilula-ok" }, "Fechou"), h("span", { class: "pilula pilula-sec" }, "Meta")))));
  const avisos = h("div", { class: "avisos-marca", "aria-live": "polite" });
  const estado = h("small", { class: "fraco marca-estado", "aria-live": "polite" });

  const btApp = h("button", { type: "button", class: "bt bt-sec", "aria-pressed": "false" }, ui.icone("olho"), "Ver no app inteiro");
  const btPadrao = h("button", { type: "button", class: "bt bt-fant" }, soTema ? "Usar as cores da " + (ctx.sessao.org ? ctx.sessao.org.nome : "agência") : "Cores padrão");
  const btSalvar = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("check"), "Salvar marca");

  function logoPrevia(ef) {
    const escuro = previa.dataset.esquema !== "claro";
    return soTema ? ((escuro ? ef.logo_cliente : (ef.logo_cliente_claro || ef.logo_cliente)) || (escuro ? ef.logo : (ef.logo_claro || ef.logo)))
      : (escuro ? ef.logo : (ef.logo_claro || ef.logo));
  }
  function atualizar() {
    const ef = efetiva();
    const t = T.derivarTema(ef.cores);
    T.aplicarTema(t.vars, previa);
    ui.limpar(pvLogo);
    const lg = logoPrevia(ef);
    pvLogo.append(lg ? h("img", { src: lg, alt: "" }) : h("svg", { class: "pv-marca", viewBox: "0 0 48 48", "aria-hidden": "true" }, h("use", { href: "#marca-orbita" })));
    pvProduto.textContent = ef.produto;
    pvEsquema.textContent = t.escuro ? "Palco escuro" : "Tema claro";
    ui.limpar(avisos);
    if (t.avisos.length) for (const a of t.avisos) avisos.append(h("div", { class: "aviso aviso-aten" }, ui.icone("alerta"), h("p", null, a.texto)));
    else avisos.append(h("div", { class: "aviso aviso-ok" }, ui.icone("check"), h("p", null, "Contraste conferido: textos, links e botões legíveis.")));
    const s = sujo();
    estado.textContent = s ? "Alterações ainda não salvas." : "Tudo salvo.";
    btSalvar.disabled = false;
    if (appInteiro) ctx.shell.pintarMarca(ef);
  }
  btApp.addEventListener("click", () => {
    appInteiro = !appInteiro;
    btApp.setAttribute("aria-pressed", String(appInteiro));
    btApp.lastChild.textContent = appInteiro ? "Voltar ao tema salvo" : "Ver no app inteiro";
    if (appInteiro) { ctx.shell.pintarMarca(efetiva()); ui.toast("Mostrando o app inteiro com a marca nova (só para você, até salvar).", { tipo: "info" }); }
    else ctx.shell.aplicarMarcaCliente();
  });
  btPadrao.addEventListener("click", () => {
    if (soTema) { coresProprias = false; if (swProprias) swProprias.checked = false; caixaCores.disabled = true; }
    else for (const k of ["primaria", "secundaria", "fundo"]) { m.cores[k] = T.PADRAO.cores[k]; seletores[k].definir(m.cores[k]); }
    atualizar();
  });
  btSalvar.addEventListener("click", async () => {
    ui.marcarErro(form, null); ui.marcarErro(formEntrada, null);
    const p = payload();
    const erros = T.validarMarca(p, soTema);
    if (!soTema && !p.produto) erros.push({ campo: "produto", texto: "Informe o nome do produto." });
    if (erros.length) {
      for (const e of erros) {
        if (form.querySelector(`[name="${e.campo}"]`)) ui.marcarErro(form, e.campo, e.texto);
        else if (formEntrada.querySelector(`[name="${e.campo}"]`)) ui.marcarErro(formEntrada, e.campo, e.texto);
      }
      ui.toast(erros[0].texto, { tipo: "erro" });
      return;
    }
    try {
      if (soTema) await ui.carregando(btSalvar, api.rpcC("nx_tema_salvar", { p_tema: p }));
      else {
        const r = await ui.carregando(btSalvar, api.rpc("nx_org_salvar", { p_org: { id: orgInfo.id, marca: p } }));
        if (r && r.marca) orgInfo.marca = r.marca;
      }
      salvo = JSON.stringify(p);
      if (appInteiro) { appInteiro = false; btApp.setAttribute("aria-pressed", "false"); btApp.lastChild.textContent = "Ver no app inteiro"; }
      ui.toast(soTema ? "Tema salvo. Quem entrar nesta empresa já vê a marca nova." : "Marca salva. A tela de entrada e o app já usam a marca nova.", { tipo: "ok" });
      try { await ctx.shell.recarregarMarca(); } catch { /* aparece na próxima entrada */ }
      atualizar();
      if (aoSalvar) try { aoSalvar(p); } catch { /* ok */ }
    } catch (e) {
      const campo = e && e.codigo === "marca_invalida" && e.hint;
      if (campo && form.querySelector(`[name="${campo}"]`)) ui.marcarErro(form, campo, api.mensagemErro(e));
      else if (campo && formEntrada.querySelector(`[name="${campo}"]`)) ui.marcarErro(formEntrada, campo, api.mensagemErro(e));
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });

  // ---- montagem
  const cartao = (titulo, sub, ...filhos) => h("div", { class: "cartao" },
    h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, titulo), sub ? h("p", { class: "sub" }, sub) : null)), ...filhos);
  const imagens = [
    controleImagem({ chave: "logo", rotulo: "Logo", ajuda: "PNG, JPEG ou WebP. Reduzimos no navegador para até 60 KB. Fica sobre o fundo da marca." }),
    controleImagem({ chave: "logo_claro", rotulo: "Logo para fundo claro", ajuda: "Opcional: usado quando o fundo é claro.", claro: true }),
    soTema ? null : controleImagem({ chave: "favicon", rotulo: "Ícone da aba", ajuda: "Quadrado, 64 × 64. Pode gerar a partir do logo.", favicon: true }),
  ];
  const esquerda = h("div", { class: "pilha" },
    soTema ? null : cartao("Identidade", "Como o produto se chama para os seus clientes.", form),
    cartao("Logo", null, h("div", { class: "pilha" }, imagens, sugestoes)),
    cartao("Cores", "Três cores bastam: o app deriva todo o resto e garante o contraste.", h("div", { class: "pilha" }, blocoProprias, caixaCores)),
    soTema ? null : cartao("Tela de entrada", h("span", null, "O que aparece antes do login, no seu domínio ou pelo link ", h("span", { class: "mono nowrap" }, "/app/?org=" + (orgInfo ? orgInfo.slug : "")), "."), formEntrada));
  const direita = h("div", { class: "marca-previa-env" },
    h("div", { class: "linha linha-entre" }, h("p", { class: "rotulo" }, "Pré-visualização ao vivo"), pvEsquema),
    previa, avisos,
    h("div", { class: "linha marca-acoes" }, btApp, btPadrao, h("span", { class: "marca-espaco" }), btSalvar),
    estado);
  ui.limpar(alvo);
  alvo.append(h("div", { class: "marca-ed" }, esquerda, direita));
  atualizar();
  const lg = T.imagemSegura(m.logo) || (soTema ? T.imagemSegura(reserva.logoUrl) : null);
  if (lg) pxDeUrl(lg).then(px => { if (px && alvo.isConnected) mostrarSugestoes(px); });

  return () => { if (appInteiro) { appInteiro = false; ctx.shell.aplicarMarcaCliente(); } };
}

/* ---------------- seção: Domínio próprio ---------------- */
async function secaoDominio(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  let lista = [];
  const caixa = h("div", { class: "pilha" });
  const clientes = ctx.shell.clientes();
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Endereço", nome: "host", placeholder: "crm.suaagencia.com.br", autocomplete: "off", inputmode: "url",
        ajuda: "Use um subdomínio: domínio raiz (suaagencia.com.br) não aceita CNAME." }),
      ui.campo({ rotulo: "Para quem", nome: "cliente", tipo: "select", valor: "",
        opcoes: [{ valor: "", rotulo: "Toda a agência (login com a sua marca)" }, ...clientes.map(c => ({ valor: c.id, rotulo: `Só a ${c.nome}` }))],
        ajuda: "Com um cliente escolhido, quem entra por esse endereço já cai na empresa dele." })),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, ui.icone("mais"), "Adicionar domínio")));
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    const host = String(d.host || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return ui.marcarErro(form, "host", "Use algo como crm.suaempresa.com.br.");
    try {
      lista = validarListaDominios(await ui.carregando(form.querySelector("[type=submit]"), api.rpc("nx_dominio_salvar", { p_host: host, p_cliente: d.cliente || null })));
      form.reset();
      ui.toast("Domínio cadastrado. Agora crie o registro CNAME no seu provedor.", { tipo: "ok" });
      desenhar();
    } catch (e) {
      if (e.codigo === "dominio_invalido" || e.codigo === "dominio_em_uso") return ui.marcarErro(form, "host", api.mensagemErro(e));
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });

  function desenhar() {
    ui.limpar(caixa);
    if (!lista.length) {
      caixa.append(ui.vazio({ titulo: "Nenhum domínio ainda.", icone: "globo",
        texto: "Com um domínio próprio, a tela de entrada, os convites e os links de senha saem com o seu endereço e a sua marca." }));
      return;
    }
    for (const d of lista) caixa.append(cartaoDominio(ctx, d, { aoRemover: async () => { lista = validarListaDominios(await api.rpc("nx_dominios_listar")); desenhar(); } }));
  }
  alvo.append(
    h("div", { class: "cartao" },
      h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Novo domínio"),
        h("p", { class: "sub" }, "Cadastre o endereço, crie o registro CNAME no seu provedor de DNS e aguarde a ativação."))),
      form),
    caixa);
  caixa.append(ui.esqueleto("lista", 2));
  try { lista = validarListaDominios(await api.rpc("nx_dominios_listar")); desenhar(); }
  catch (e) { ui.limpar(caixa); caixa.append(ui.erroCartao(e, () => secaoDominio(ctx, (ui.limpar(alvo), alvo)))); }
}

/** Cartão de um domínio com a instrução de DNS (usado também pelo Admin). */
export function cartaoDominio(ctx, d, { aoRemover, aoStatus, mostrarOrg = false } = {}) {
  const { ui, api } = ctx;
  const h = ui.h;
  const ativo = d.status === "ativo";
  // sem nx_config.saas_url, o destino só vale se o app estiver aberto no próprio servidor (Netlify ou domínio
  // já ligado). No espelho do GitHub Pages ou em localhost o CNAME sairia ERRADO: aí a tela diz a verdade.
  const hostAtual = location.hostname;
  const hostServe = /\.netlify\.app$/i.test(hostAtual)
    || (hostAtual.includes(".") && !/(^|\.)github\.io$/i.test(hostAtual) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostAtual)
        && !/\.(localhost|test)$/i.test(hostAtual));
  const semAlvo = !(d.dns && d.dns.valor);
  const alvoDns = semAlvo ? (hostServe ? hostAtual : null) : d.dns.valor;
  const copiavel = (txt, rot) => h("span", { class: "dns-val" }, h("span", { class: "mono" }, txt),
    h("button", { type: "button", class: "bt-icone bt-icone-p", "aria-label": `Copiar ${rot}`, on: { click: () => ui.copiar(txt, { aviso: `${rot} copiado.` }) } }, ui.icone("copiar")));
  const acoes = h("div", { class: "linha" });
  if (aoStatus) {
    const b = h("button", { type: "button", class: ativo ? "bt bt-sec bt-p" : "bt bt-prim bt-p" }, ui.icone(ativo ? "relogio" : "check"), ativo ? "Voltar a pendente" : "Marcar ativo");
    b.addEventListener("click", async () => {
      if (!ativo && !(await ui.confirmar({ titulo: `Ativar ${d.host}?`, texto: "Confirme que o alias já foi adicionado no Netlify e o certificado saiu. A partir daqui, os links desse cliente/agência usam este endereço.", rotulo: "Marcar ativo" }))) return;
      try { await ui.carregando(b, aoStatus(!ativo)); } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    acoes.append(b);
  }
  if (aoRemover) {
    const b = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("lixeira"), "Remover");
    b.addEventListener("click", async () => {
      if (!(await ui.confirmar({ titulo: `Remover ${d.host}?`, texto: ativo ? "O endereço deixa de abrir o app com a sua marca e os links passam a usar o endereço padrão." : "O cadastro pendente é apagado.", rotulo: "Remover", perigo: true }))) return;
      try { await ui.carregando(b, api.rpc("nx_dominio_remover", { p_host: d.host })); ui.toast("Domínio removido.", { tipo: "ok" }); await aoRemover(); }
      catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    acoes.append(b);
  }
  return h("article", { class: "cartao dom-item" },
    h("div", { class: "cartao-cab" },
      h("div", { class: "dom-tit" }, ui.icone("globo"),
        h("div", null, h("b", { class: "mono" }, d.host),
          h("small", null, [mostrarOrg && d.org ? d.org.nome : null, d.cliente ? `Só a ${d.cliente.nome}` : "Agência toda"].filter(Boolean).join(" · ")))),
      ui.pilula(ativo ? "Ativo" : "Pendente", ativo ? "ok" : "aten")),
    ativo ? null : h("dl", { class: "dns" },
      h("dt", null, "Tipo"), h("dd", null, "CNAME"),
      h("dt", null, "Nome"), h("dd", null, copiavel(d.host, "Nome")),
      h("dt", null, "Valor"), h("dd", null, alvoDns ? copiavel(alvoDns, "Valor") : h("span", { class: "fraco" }, "a Nexus informa"))),
    h("p", { class: "fraco dom-nota" }, ativo
      ? `No ar${d.ativado_em ? ` desde ${ui.dataBR(d.ativado_em)}` : ""}. Convites e links de senha já saem com este endereço.`
      : alvoDns
        ? `Crie o registro CNAME: ${d.host} → ${alvoDns}${semAlvo ? " (o endereço atual do app)" : ""}. A Nexus ativa o domínio em até 1 dia útil.`
        : `Peça à Nexus o destino do registro CNAME de ${d.host} antes de mexer no DNS. A Nexus ativa o domínio em até 1 dia útil.`),
    acoes.childNodes.length ? acoes : null);
}

/* ---------------- seção: Plano e uso ---------------- */
const USO_ROT = [
  ["usuarios", "Usuários (convites pendentes contam)", "usuários"], ["canais", "Números de WhatsApp", "números de WhatsApp"],
  ["funis", "Funis ativos", "funis"], ["automacoes", "Automações", "automações"], ["contatos", "Contatos", "contatos"],
  ["ia_mes", "Sugestões de IA neste mês", "sugestões de IA do mês"],
];
const ROT_STATUS = { ativo: ["Ativo", "ok"], teste: ["Em teste", "info"], suspenso: ["Suspenso", "aten"], cancelado: ["Cancelado", "ruim"] };
const ROT_MOD = { crm: "CRM", conversas: "Conversas", relatorios: "Relatórios", ads: "Anúncios", automacoes: "Automações", marca: "Marca própria" };

async function secaoPlano(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  alvo.append(ui.esqueleto("cartoes", 3));
  let r;
  try { r = await api.rpcC("nx_uso_plano"); }
  catch (e) { ui.limpar(alvo); alvo.append(ui.erroCartao(e, () => { ui.limpar(alvo); secaoPlano(ctx, alvo); })); return; }
  ui.limpar(alvo);
  const p = r.plano || {};
  const [stTxt, stCor] = ROT_STATUS[r.status] || [r.status || "—", "neutra"];
  const wa = ctx.shell.marcaEfetiva() && ctx.shell.marcaEfetiva().suporte_wa;
  const hoje = ui.hojeSP();
  const fracao = k => (r.limites && r.limites[k] != null ? (r.limites[k] > 0 ? (r.uso[k] || 0) / r.limites[k] : 1) : 0);
  const cheios = USO_ROT.filter(([k]) => fracao(k) >= 1), perto = USO_ROT.filter(([k]) => fracao(k) >= .8 && fracao(k) < 1);
  const lista = xs => xs.map(x => x[2]).join(", ").replace(/, ([^,]*)$/, " e $1");
  const cab = h("div", { class: "cartao plano-cab" },
    h("div", { class: "plano-tit" },
      h("p", { class: "rotulo" }, "Seu plano"),
      h("h2", { class: "num-grande" }, p.nome || "—"),
      h("p", { class: "sub" }, p.preco_mensal != null ? `${ui.brl(p.preco_mensal, { centavos: false })} por mês` : "Condição combinada com a equipe.")),
    h("div", { class: "pilha-p plano-lado" },
      h("div", { class: "linha" }, ui.pilula(stTxt, stCor),
        r.status === "teste" && r.teste_ate ? ui.pilula(r.teste_ate >= hoje ? `Teste até ${ui.dataBR(r.teste_ate)}` : `Teste terminou em ${ui.dataBR(r.teste_ate)}`, r.teste_ate >= hoje ? "info" : "ruim") : null),
      h("div", { class: "linha" }, (r.modulos || []).map(m => ui.pilula(ROT_MOD[m] || m, "neutra"))),
      wa ? h("a", { class: "bt bt-sec", href: ui.linkWhatsApp(`Olá! Quero falar sobre o plano da ${ctx.cliente.nome}.`, wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Falar com o suporte") : null));
  const usos = h("div", { class: "adm-uso" }, USO_ROT.map(([k, rot]) => ui.barraUso(rot, r.uso ? r.uso[k] : 0, r.limites ? r.limites[k] : null)));
  // Element.append() transforma null em texto: só entram os blocos que existem
  alvo.append(...[cab,
    cheios.length || perto.length ? h("div", { class: ["aviso", cheios.length ? "aviso-ruim" : "aviso-aten"] }, ui.icone("alerta"), h("p", null,
      [cheios.length ? `No limite do plano: ${lista(cheios)}.` : null, perto.length ? `Perto do limite: ${lista(perto)}.` : null, "Para aumentar, fale com o suporte."].filter(Boolean).join(" "))) : null,
    h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Uso do plano"),
      h("p", { class: "sub" }, "Contagem de agora. Sugestões de IA contam no mês corrente."))), usos,
      h("p", { class: "fraco plano-storage" }, ui.icone("clipe"), `Mídia guardada: ${String(r.storage_mb ?? 0).replace(".", ",")} MB`)),
    r.org ? h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Sua agência"),
      h("p", { class: "sub" }, "Soma de todos os clientes da revenda."))),
      h("div", { class: "adm-uso" },
        ui.barraUso("Clientes", r.org.uso.empresas, r.org.limites ? r.org.limites.empresas : null),
        ui.barraUso("Usuários", r.org.uso.usuarios, r.org.limites ? r.org.limites.usuarios : null),
        ui.barraUso("Números de WhatsApp", r.org.uso.canais, r.org.limites ? r.org.limites.canais : null))) : null].filter(Boolean));
}
