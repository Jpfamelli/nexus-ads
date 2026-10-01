/* ============================================================
   ÓRBITA — admin.js · frente F3 · ESPEC T15 (§7.7), §5.2
   #/admin/clientes (lista, criar), #/admin/clientes/<id> (plano,
   status, teste, módulos, limites extras, uso, usuários, convite do
   administrador, Entrar). P0-B: #/admin/revendas, #/admin/planos,
   #/admin/dominios (super / gestor), atrás de pronto('admin_revendas').
   Só gestor (revenda) e super (plataforma) chegam aqui (rotas.js).
   ============================================================ */

const STATUS = [
  { valor: "ativo", rotulo: "Ativo", cor: "ok" },
  { valor: "teste", rotulo: "Em teste", cor: "info" },
  { valor: "suspenso", rotulo: "Suspenso", cor: "aten" },
  { valor: "cancelado", rotulo: "Cancelado", cor: "ruim" },
];
const MODULOS = [
  { valor: "crm", rotulo: "CRM" }, { valor: "conversas", rotulo: "Conversas" }, { valor: "relatorios", rotulo: "Relatórios" },
  { valor: "ads", rotulo: "Anúncios" }, { valor: "automacoes", rotulo: "Automações" }, { valor: "marca", rotulo: "Marca própria" },
];
const CHAVES_LIMITE = [
  { chave: "usuarios", rotulo: "Usuários" }, { chave: "canais", rotulo: "Números de WhatsApp" }, { chave: "funis", rotulo: "Funis" },
  { chave: "automacoes", rotulo: "Automações" }, { chave: "contatos", rotulo: "Contatos" }, { chave: "ia_mes", rotulo: "Sugestões de IA por mês", curto: "IA no mês" },
];
const VERTICAIS = [
  { valor: "odonto", rotulo: "Clínica odontológica" }, { valor: "oficina", rotulo: "Oficina mecânica" },
  { valor: "loja", rotulo: "Loja" }, { valor: "generico", rotulo: "Outro negócio" },
];

/** Pacotes comerciais Nexus. O plano de acesso ao Órbita continua sendo uma decisão técnica separada. */
export const PACOTES_COMERCIAIS = Object.freeze([
  Object.freeze({ id: "essencial", nome: "PLANO ESSENCIAL", mensalCentavos: 129478, integracaoCentavos: 88945,
    acesso: "essencial", itens: Object.freeze(["Site profissional", "5 a 10 posts por mês", "1 diária de gravação por mês", "Edição de vídeo", "Sistema de atendimento"]) }),
  Object.freeze({ id: "profissional", nome: "PLANO PROFISSIONAL", mensalCentavos: 187253, integracaoCentavos: 119289,
    acesso: "profissional", itens: Object.freeze(["Tudo do Essencial", "IA no atendimento", "10 a 15 posts por mês", "Sistema de atendimento e CRM", "Gestão de tráfego pago"]) }),
  Object.freeze({ id: "ultra", nome: "PLANO ULTRA", mensalCentavos: 228734, integracaoCentavos: 134457,
    acesso: "completo", itens: Object.freeze(["Tudo do Profissional", "15 a 20 posts por mês", "Edição completa de conteúdos", "CRM e IA no atendimento", "Sistema de atendimento", "Gestão de tráfego pago e sistema de gestão", "Mais 1 sistema completo à sua escolha"]) }),
]);

/** O formulário aceita qualquer segmento; só os modelos já existentes são reconhecidos automaticamente. */
export function verticalPorSegmento(segmento) {
  const s = String(segmento || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/odont|dentist|dent[aá]ria/.test(s)) return "odonto";
  if (/oficina|mecanic|autopeca|automot/.test(s)) return "oficina";
  if (/\bloja\b|varejo|comercio|e-commerce/.test(s)) return "loja";
  return "generico";
}

function campoPacoteComercial(ui, selecionado = null, { obrigatorio = false, comercial = null } = {}) {
  const h = ui.h;
  const radios = PACOTES_COMERCIAIS.map(p => {
    const salvo = comercial && comercial.pacote === p.id ? comercial : null;
    const mensal = Number.isInteger(salvo && salvo.mensal_centavos) ? salvo.mensal_centavos : p.mensalCentavos;
    const integracao = Number.isInteger(salvo && salvo.integracao_centavos) ? salvo.integracao_centavos : p.integracaoCentavos;
    const radio = h("input", { type: "radio", name: "pacote_comercial", value: p.id, checked: selecionado === p.id, required: !!obrigatorio });
    return h("label", { class: "oferta-card" }, radio,
      h("span", { class: "oferta-conteudo" },
        h("span", { class: "oferta-cab" }, h("b", null, p.nome), h("span", { class: "oferta-preco" }, `${ui.brl(mensal / 100)}/mês`)),
        h("span", { class: "oferta-integracao" }, `${ui.brl(integracao / 100)} de integração · valor único`),
        h("span", { class: "oferta-inclusoes-tit" }, "Inclui"),
        h("span", { class: "oferta-inclusoes" }, p.itens.map(item => h("span", null, item)))));
  });
  const erro = h("small", { class: "campo-erro", hidden: true });
  return h("fieldset", { class: "campo campo-ofertas", dataset: { campo: "pacote_comercial" } },
    h("legend", null, "Plano comercial", obrigatorio ? h("span", { class: "obrig", "aria-hidden": "true" }, " *") : null),
    h("div", { class: "ofertas-grade", role: "radiogroup", "aria-label": "Escolha um plano comercial" }, radios),
    h("small", { class: "campo-ajuda" }, "O pacote registra o escopo contratado. O acesso aos recursos do Órbita segue a configuração técnica da empresa."), erro);
}

function rotuloPacote(id) { return PACOTES_COMERCIAIS.find(p => p.id === id)?.nome || "Sem pacote comercial"; }

let _planos = null;
let _orgs = null;
let _limpeza = [];

export function desmontar() { for (const f of _limpeza) try { f(); } catch { /* ok */ } _limpeza = []; }

function statusDe(v) { return STATUS.find(s => s.valor === v) || { rotulo: v, cor: "neutra" }; }
export function sugerirSlug(nome) {
  return String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
}

async function planos(ctx) { if (!_planos) _planos = await ctx.api.rpc("nx_planos_listar"); return _planos; }
async function orgs(ctx) { if (!_orgs) _orgs = await ctx.api.rpc("nx_orgs_listar"); return _orgs; }

export async function montar(ctx) {
  desmontar();
  _planos = null; _orgs = null;
  const aba = ctx.rota.partes[0] || "clientes";
  const id = ctx.rota.partes[1] || null;
  const { ui } = ctx;
  const h = ui.h;
  const superConta = !!ctx.sessao.conta.super;
  const extras = ctx.pronto("admin_revendas");
  const abas = [
    { id: "clientes", rotulo: "Clientes", icone: "empresa" },
    ...(extras && superConta ? [{ id: "revendas", rotulo: "Revendas", icone: "camadas" }, { id: "planos", rotulo: "Planos", icone: "cartao" }] : []),
    ...(extras ? [{ id: "dominios", rotulo: "Domínios", icone: "globo" }] : []),
  ];
  if (!abas.some(a => a.id === aba)) { ctx.navegar("#/admin/clientes", { substituir: true }); return; }

  const nav = ui.abas({ itens: abas, ativo: aba, rotulo: "Áreas do Admin", aoMudar: a => ctx.navegar(`#/admin/${a}`) });
  const corpo = h("div", { class: "pilha" });
  ui.limpar(ctx.alvo);
  if (id) {
    // detalhe: só o caminho de volta; o cartão do cliente faz o papel de título
    ctx.alvo.append(h("a", { class: "voltar-link", href: "#/admin/clientes" }, ui.icone("seta-esq"), "Clientes"), corpo);
    return telaCliente(ctx, corpo, id);
  }
  ctx.alvo.append(
    h("header", { class: "cab-pag" }, h("div", null,
      h("p", { class: "rotulo" }, `Admin · ${ctx.sessao.org ? ctx.sessao.org.nome : ""}${superConta ? " · plataforma" : ""}`),
      h("h1", { class: "titulo-pag" }, { clientes: "Clientes", revendas: "Revendas", planos: "Planos", dominios: "Domínios" }[aba]),
      h("p", { class: "sub" }, {
        clientes: "Crie clientes, acompanhe o uso de cada um e entre no ambiente deles como suporte.",
        revendas: "Agências que revendem com a própria marca, com limites somados de todos os clientes delas.",
        planos: "Preço, limites e módulos de cada plano. Mudar aqui vale na hora, sem publicar nada.",
        dominios: "Endereços próprios das revendas e dos clientes. Depois do CNAME, a plataforma ativa o domínio.",
      }[aba])),
    abas.length > 1 ? nav.el : null),
    corpo);

  if (aba === "clientes") return telaClientes(ctx, corpo);
  if (typeof EXTRAS[aba] === "function") return EXTRAS[aba](ctx, corpo);
}

/* ============================================================
   LISTA DE CLIENTES
   ============================================================ */
async function telaClientes(ctx, corpo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Clientes");
  const superConta = !!ctx.sessao.conta.super;
  const filtro = { busca: ctx.rota.query.busca || "", status: ctx.rota.query.status || "", org_id: ctx.rota.query.org || "" };

  const busca = h("input", { type: "search", value: filtro.busca, placeholder: "Buscar por nome ou endereço", "aria-label": "Buscar cliente" });
  const status = h("select", { class: "sel", "aria-label": "Filtrar por situação" },
    h("option", { value: "" }, "Todas as situações"), STATUS.map(s => h("option", { value: s.valor, selected: s.valor === filtro.status }, s.rotulo)));
  const selOrg = superConta ? h("select", { class: "sel", "aria-label": "Filtrar por revenda" }, h("option", { value: "" }, "Todas as orgs")) : null;
  const novo = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("mais"), "Cliente");
  novo.setAttribute("aria-label", "Novo cliente");
  const lista = h("div");
  corpo.append(h("div", { class: "adm-filtros" }, h("label", { class: "busca" }, ui.icone("busca"), busca), status, selOrg, novo), lista);

  if (superConta) {
    orgs(ctx).then(os => { for (const o of os) selOrg.appendChild(h("option", { value: o.id, selected: o.id === filtro.org_id }, o.nome)); }).catch(() => { /* filtro some */ });
  }

  let seq = 0;
  async function carregar() {
    const n = ++seq;
    ui.limpar(lista);
    lista.appendChild(ui.esqueleto("tabela", 6));
    try {
      const itens = await api.rpc("nx_clientes_admin", { p_filtro: { busca: filtro.busca || null, status: filtro.status || null, org_id: filtro.org_id || null } });
      if (n !== seq) return;
      ui.limpar(lista);
      if (!itens.length && !filtro.busca && !filtro.status && !filtro.org_id) {
        lista.appendChild(ui.vazio({ titulo: "Nenhum cliente ainda.", texto: "Crie o primeiro — o funil, as etiquetas e as respostas rápidas da área dele entram prontos.",
          icone: "empresa", acao: { rotulo: "Criar o primeiro cliente", fn: () => criarCliente(ctx) } }));
        return;
      }
      const uso = (it, k) => {
        const u = it.uso ? it.uso[k] : null, l = it.limites ? it.limites[k] : null;
        return h("span", { class: "mono", title: l == null ? "Sem limite" : `Limite ${l}` }, `${ui.num(u ?? 0)}${l == null ? "" : ` / ${ui.num(l)}`}`);
      };
      const tab = ui.tabela({
        rotulo: "Clientes",
        colunas: [
          { chave: "nome", rotulo: "Cliente", ordenavel: true, principal: true, render: it => h("div", { class: "cel-nome" }, ui.avatar(it.nome, it.id),
            h("div", null, h("b", null, it.nome), h("small", null, it.slug))) },
          ...(superConta ? [{ chave: "org_nome", rotulo: "Org", ordenavel: true, render: it => it.org ? it.org.nome : "—" }] : []),
          { chave: "plano", rotulo: "Plano", ordenavel: true, render: it => ui.pilula(nomePlano(it.plano), it.plano === "interno" ? "sec" : "prim") },
          { chave: "status", rotulo: "Situação", ordenavel: true, render: it => ui.pilula(statusDe(it.status).rotulo, statusDe(it.status).cor) },
          { chave: "teste_ate", rotulo: "Fim do teste", ordenavel: true, render: it => it.status === "teste" && it.teste_ate ? ui.dataBR(it.teste_ate) : "—" },
          { chave: "u_usuarios", rotulo: "Usuários", alinhar: "dir", render: it => uso(it, "usuarios") },
          { chave: "u_canais", rotulo: "Números", alinhar: "dir", render: it => uso(it, "canais") },
          { chave: "u_contatos", rotulo: "Contatos", alinhar: "dir", render: it => uso(it, "contatos") },
          { chave: "criado_em", rotulo: "Criado em", ordenavel: true, render: it => ui.dataBR(it.criado_em) },
        ],
        linhas: itens.map(it => ({ ...it, org_nome: it.org ? it.org.nome : "", u_usuarios: it.uso && it.uso.usuarios })),
        aoClicar: it => ctx.navegar(`#/admin/clientes/${it.id}`),
        vazio: "Nenhum cliente com esse filtro.",
      });
      lista.appendChild(tab.el);
    } catch (e) {
      if (n !== seq) return;
      ui.limpar(lista);
      lista.appendChild(ui.erroCartao(e, carregar));
    }
  }
  const aoBuscar = ui.debounce(() => { filtro.busca = busca.value.trim(); carregar(); }, 300);
  busca.addEventListener("input", aoBuscar);
  status.addEventListener("change", () => { filtro.status = status.value; carregar(); });
  if (selOrg) selOrg.addEventListener("change", () => { filtro.org_id = selOrg.value; carregar(); });
  novo.addEventListener("click", () => criarCliente(ctx));
  _limpeza.push(() => aoBuscar.cancelar());
  try { await planos(ctx); } catch { /* nomes de plano caem no id */ }
  await carregar();
}

function nomePlano(id) {
  const p = (_planos || []).find(x => x.id === id);
  return p ? p.nome : id || "—";
}

/* ============================================================
   NOVO CLIENTE
   ============================================================ */
async function criarCliente(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const superConta = !!ctx.sessao.conta.super;
  let ps = [], os = [];
  try { ps = await planos(ctx); } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); return; }
  try { os = await orgs(ctx); } catch { os = []; }
  const orgPadrao = ctx.sessao.org ? ctx.sessao.org.id : null;
  const minhaOrg = os.find(o => o.id === orgPadrao);
  const padraoOrg = minhaOrg && minhaOrg.limites && minhaOrg.limites.plano_padrao;
  const planoPadrao = superConta ? "interno"
    : (ps.some(p => p.id === padraoOrg) ? padraoOrg : ps.some(p => p.id === "essencial") ? "essencial" : (ps[0] && ps[0].id));
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome do cliente", nome: "nome", obrigatorio: true, max: 80, placeholder: "Ex.: Clínica Sorriso", autocomplete: "off" }),
      ui.campo({ rotulo: "Endereço (slug)", nome: "slug", obrigatorio: true, max: 40, ajuda: "Letras minúsculas, números e hífen.", autocomplete: "off" }),
      ui.campo({ rotulo: "Segmento do cliente", nome: "segmento", max: 120, placeholder: "Escreva livremente, por exemplo: clínica odontológica, loja de roupas, consultoria…",
        ajuda: "Sem opções predefinidas. Clínicas odontológicas, oficinas e lojas reconhecidas recebem o modelo correspondente; os demais usam o modelo genérico." }),
      ui.campo({ rotulo: "Situação", nome: "status", tipo: "select", valor: "teste", opcoes: STATUS.slice(0, 2) }),
      ui.campo({ rotulo: "Dias de teste", nome: "dias", tipo: "numero", valor: 14, min: 1, max: 90 }),
      superConta && os.length ? ui.campo({ rotulo: "Revenda / plataforma", nome: "org_id", tipo: "select", valor: orgPadrao, opcoes: os.map(o => ({ valor: o.id, rotulo: `${o.nome}${o.tipo === "plataforma" ? " (plataforma)" : ""}` })) }) : null),
    campoPacoteComercial(ui, "essencial", { obrigatorio: true }),
    ui.campo({ rotulo: "Especificações do cliente", nome: "especificacoes", tipo: "textarea", max: 5000, linhas: 4,
      placeholder: "Escreva necessidades, objetivos, entregas combinadas e observações…", ajuda: "Campo livre, sem modelos ou respostas predefinidas." }));
  const nome = form.querySelector("input[name=nome]"), slug = form.querySelector("input[name=slug]");
  let slugMexido = false;
  nome.addEventListener("input", () => { if (!slugMexido) slug.value = sugerirSlug(nome.value); });
  slug.addEventListener("input", () => { slugMexido = true; });
  const selStatus = form.querySelector("select[name=status]");
  const campoDias = form.querySelector("[data-campo=dias]");
  let pacoteCriado = "essencial";
  const ajustarDias = () => { campoDias.hidden = selStatus.value !== "teste"; };
  selStatus.addEventListener("change", ajustarDias); ajustarDias();

  const r = await ui.modal({
    titulo: "Novo cliente", corpo: form, largura: "g",
    descricao: "Registre o segmento e as necessidades com suas próprias palavras e escolha uma das três ofertas comerciais.",
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Criar cliente", tipo: "primario", fn: async () => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        if (!d.nome || d.nome.length < 2) { ui.marcarErro(form, "nome", "Informe o nome."); return false; }
        if (!/^[a-z0-9-]{2,40}$/.test(d.slug || "")) { ui.marcarErro(form, "slug", "Use de 2 a 40 letras minúsculas, números ou hífen."); return false; }
        const oferta = PACOTES_COMERCIAIS.find(p => p.id === d.pacote_comercial);
        if (!oferta) { ui.marcarErro(form, "pacote_comercial", "Escolha um dos três planos comerciais."); return false; }
        pacoteCriado = oferta.id;
        const planoAcesso = superConta ? planoPadrao : oferta.acesso;
        if (!ps.some(p => p.id === planoAcesso && (superConta || p.ativo !== false))) {
          ui.marcarErro(form, "pacote_comercial", "O plano de acesso correspondente não está disponível para esta revenda. Fale com a plataforma."); return false;
        }
        const dias = Math.max(1, Math.min(90, Number(d.dias) || 14));
        const teste = d.status === "teste" ? isoMais(ui.hojeSP(), dias) : null;
        const p = { nome: d.nome, slug: d.slug, vertical: verticalPorSegmento(d.segmento), plano: planoAcesso, status: d.status, teste_ate: teste,
          comercial: { pacote: oferta.id, segmento: d.segmento || "", especificacoes: d.especificacoes || "" } };
        if (superConta && d.org_id) p.org_id = d.org_id;
        try {
          return await api.rpc("nx_cliente_admin_salvar", { p_cliente: p });
        } catch (e) {
          if (e.codigo === "slug_em_uso") { ui.marcarErro(form, "slug", "Esse endereço já está em uso."); return false; }
          if (e.codigo === "dados_invalidos" && e.hint === "comercial") { ui.marcarErro(form, "especificacoes", "Revise as especificações informadas."); return false; }
          throw e;
        }
      } },
    ],
  });
  if (r && r.id) {
    ui.toast(`Cliente criado com ${rotuloPacote(r.comercial?.pacote || pacoteCriado)}.`, { tipo: "ok" });
    try { await ctx.shell.recarregarSessao(); } catch { /* o seletor atualiza na próxima entrada */ }
    ctx.navegar(`#/admin/clientes/${r.id}`);
  }
}

function isoMais(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/* ============================================================
   DETALHE DO CLIENTE
   ============================================================ */
async function telaCliente(ctx, corpo, id) {
  const { ui, api } = ctx;
  const h = ui.h;
  const superConta = !!ctx.sessao.conta.super;
  corpo.appendChild(ui.esqueleto("cartoes", 3));
  let cli, ps;
  try {
    const [lista, planosLista] = await Promise.all([api.rpc("nx_clientes_admin", { p_filtro: { id } }), planos(ctx)]);
    cli = lista && lista[0];
    ps = planosLista;
    if (!cli) throw Object.assign(new Error("cliente_nao_encontrado"), { codigo: "cliente_nao_encontrado" });
  } catch (e) {
    ui.limpar(corpo);
    corpo.append(ui.erroCartao(e, () => telaCliente(ctx, (ui.limpar(corpo), corpo), id)));
    return;
  }
  ctx.titulo(cli.nome);
  ui.limpar(corpo);
  const st = statusDe(cli.status);

  // ---- ações de topo
  const btEntrar = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("seta-dir"), "Entrar");
  btEntrar.addEventListener("click", async () => {
    await ui.carregando(btEntrar, async () => {
      if (!ctx.shell.clientes().some(c => c.id === cli.id)) await ctx.shell.recarregarSessao();
      await ctx.shell.escolherCliente(cli.id, { remontar: false });
    });
    ctx.navegar("#/");
  });
  const btConvite = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("convidar"), "Gerar convite do administrador");
  btConvite.addEventListener("click", async () => {
    try {
      const r = await ui.carregando(btConvite, api.rpc("nx_convite_criar", { p_cliente: cli.id, p_dados: { papel: "admin", dias: 7 }, p_org: null }));
      const link = String(r.link).startsWith("#") ? new URL("./", location.href).href.split("#")[0] + r.link : r.link;
      await ui.modal({
        titulo: "Convite do administrador", largura: "m",
        corpo: h("div", { class: "pilha" },
          h("p", null, `Envie para quem vai administrar a ${cli.nome}. O link cria a conta de administrador (ou acrescenta o acesso, se a pessoa já usa o sistema).`),
          ui.blocoLink(link, { rotulo: "Link do convite", textoWhats: `Olá! Aqui está o acesso de administrador da ${cli.nome} no ${ctx.shell.marcaEfetiva().produto}. Crie sua conta por este link:` }),
          h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(r.expira_em)} e só uma vez.`)),
        acoes: [{ rotulo: "Concluir", tipo: "primario", valor: true }],
      });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  });

  // ---- formulário: acesso ao Órbita, pacote comercial, segmento e especificações
  const planoAtual = () => ps.find(p => p.id === form.querySelector("select[name=plano]").value) || ps.find(p => p.id === cli.plano) || { modulos: [], limites: {} };
  const opcoesPlano = ps.some(p => p.id === cli.plano) ? ps : [{ id: cli.plano, nome: cli.plano, modulos: cli.modulos, limites: {} }, ...ps];
  const comercial = cli.comercial || {};
  const segmentoInicial = comercial.segmento || (VERTICAIS.find(v => v.valor === cli.vertical) || {}).rotulo || "";
  const segmento = ui.campo({ rotulo: "Segmento do cliente", nome: "segmento", valor: segmentoInicial, max: 120,
    placeholder: "Escreva livremente o ramo de atividade…",
    ajuda: "Sem opções predefinidas. Clínicas odontológicas, oficinas e lojas reconhecidas recebem o modelo correspondente; os demais usam o genérico." });
  const especificacoes = ui.campo({ rotulo: "Especificações do cliente", nome: "especificacoes", tipo: "textarea", valor: comercial.especificacoes || "", max: 5000, linhas: 4,
    placeholder: "Necessidades, objetivos, entregas combinadas e observações…", ajuda: "Texto livre. Até 5.000 caracteres." });
  segmento.classList.add("inteiro"); especificacoes.classList.add("inteiro");
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome", nome: "nome", valor: cli.nome, obrigatorio: true, max: 80 }),
      ui.campo({ rotulo: "Endereço (slug)", nome: "slug", valor: cli.slug, obrigatorio: true, max: 40 }),
      ui.campo({ rotulo: "Plano de acesso ao Órbita", nome: "plano", tipo: "select", valor: cli.plano, opcoes: opcoesPlano.map(p => ({ valor: p.id, rotulo: `${p.nome}${p.preco_mensal != null ? ` — ${ui.brl(p.preco_mensal, { centavos: false })}/mês` : ""}` })) }),
      ui.campo({ rotulo: "Situação", nome: "status", tipo: "select", valor: cli.status, opcoes: STATUS }),
      ui.campo({ rotulo: "Fim do teste", nome: "teste_ate", tipo: "data", valor: cli.teste_ate || "" }),
      segmento, especificacoes),
    campoPacoteComercial(ui, comercial.pacote || null, { comercial }),
    h("div", { class: "campo-modulos" }),
    superConta ? h("fieldset", { class: "campo" }, h("legend", null, "Limites extras (só a plataforma)"),
      h("p", { class: "campo-ajuda" }, "Em branco = o limite do plano."),
      h("div", { class: "form-grade" }, CHAVES_LIMITE.map(k => ui.campo({ rotulo: k.rotulo, nome: `lim_${k.chave}`, tipo: "numero", min: 0,
        valor: cli.limites_extra && cli.limites_extra[k.chave] != null ? cli.limites_extra[k.chave] : "" })))) : null,
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Salvar alterações")));

  const caixaMod = form.querySelector(".campo-modulos");
  function desenharModulos(marcados) {
    ui.limpar(caixaMod);
    const doPlano = planoAtual().modulos || [];
    const opcoes = MODULOS.map(m => ({ ...m, desabilitado: !superConta && !doPlano.includes(m.valor), rotulo: m.rotulo + (!doPlano.includes(m.valor) ? " (fora do plano)" : "") }));
    caixaMod.appendChild(ui.campo({ rotulo: "Módulos ligados", nome: "modulos", tipo: "multipla", valor: marcados, opcoes,
      ajuda: superConta ? "A plataforma pode ligar módulo fora do plano. CRM e Conversas andam juntos." : "Só os módulos do plano. CRM e Conversas andam juntos." }));
    // CRM e Conversas juntos
    const cbs = caixaMod.querySelectorAll("input[type=checkbox]");
    const par = { crm: "conversas", conversas: "crm" };
    for (const cb of cbs) cb.addEventListener("change", () => {
      const outro = [...cbs].find(x => x.value === par[cb.value]);
      if (outro && !outro.disabled) outro.checked = cb.checked;
    });
  }
  desenharModulos(cli.modulos);
  form.querySelector("select[name=plano]").addEventListener("change", () => desenharModulos(planoAtual().modulos || []));
  const selSt = form.querySelector("select[name=status]");
  const campoTeste = form.querySelector("[data-campo=teste_ate]");
  const ajustarTeste = () => { campoTeste.hidden = selSt.value !== "teste"; };
  selSt.addEventListener("change", ajustarTeste); ajustarTeste();

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (!d.nome || d.nome.length < 2) return ui.marcarErro(form, "nome", "Informe o nome.");
    if (!/^[a-z0-9-]{2,40}$/.test(d.slug || "")) return ui.marcarErro(form, "slug", "Use de 2 a 40 letras minúsculas, números ou hífen.");
    const p = { id: cli.id, nome: d.nome, slug: d.slug, plano: d.plano, status: d.status,
      vertical: d.segmento ? verticalPorSegmento(d.segmento) : cli.vertical,
      teste_ate: d.status === "teste" ? (d.teste_ate || null) : cli.teste_ate, modulos: d.modulos || [],
      comercial: { pacote: d.pacote_comercial || null, segmento: d.segmento || "", especificacoes: d.especificacoes || "" } };
    if (superConta) {
      const lim = {};
      for (const k of CHAVES_LIMITE) { const v = d[`lim_${k.chave}`]; if (v !== null && v !== undefined && v !== "" && Number.isFinite(v)) lim[k.chave] = Math.max(0, Math.floor(v)); }
      p.limites = lim;
    }
    if ((d.status === "suspenso" || d.status === "cancelado") && d.status !== cli.status) {
      const ok = await ui.confirmar({ titulo: d.status === "suspenso" ? "Suspender o cliente?" : "Cancelar o cliente?",
        texto: "A equipe do cliente deixa de acessar na hora. Os dados continuam guardados e a situação pode voltar a Ativo.", rotulo: d.status === "suspenso" ? "Suspender" : "Cancelar cliente", perigo: true });
      if (!ok) return;
    }
    try {
      const r = await ui.carregando(form.querySelector("[type=submit]"), api.rpc("nx_cliente_admin_salvar", { p_cliente: p }));
      cli = r;
      ui.toast("Cliente atualizado.", { tipo: "ok" });
      try { await ctx.shell.recarregarSessao(); } catch { /* ok */ }
      ctx.navegar(`#/admin/clientes/${cli.id}`, { substituir: true });
    } catch (e) {
      if (e.codigo === "slug_em_uso") return ui.marcarErro(form, "slug", "Esse endereço já está em uso.");
      if (e.codigo === "dados_invalidos" && e.hint === "comercial") return ui.marcarErro(form, "especificacoes", "Revise as especificações informadas.");
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });

  // ---- uso × limite
  const usoEl = h("div", { class: "adm-uso" }, CHAVES_LIMITE.map(k => barraUso(ui, k.curto || k.rotulo, cli.uso ? cli.uso[k.chave] : 0, cli.limites ? cli.limites[k.chave] : null)));

  // ---- usuários com acesso
  const usuariosEl = h("div", { class: "pilha-p" }, ui.esqueleto("lista", 2));
  api.rpc("nx_usuarios_listar", { p_cliente: cli.id }).then(r => {
    ui.limpar(usuariosEl);
    const us = r.usuarios || [];
    if (!us.length) usuariosEl.appendChild(h("p", { class: "fraco" }, "Ninguém com acesso ainda. Gere o convite do administrador."));
    for (const u of us) usuariosEl.appendChild(h("div", { class: "cel-nome" }, ui.avatar(u.nome, u.conta_id),
      h("div", null, h("b", null, u.nome), h("small", null, `${({ admin: "Administrador", supervisor: "Supervisor", atendente: "Atendente", leitura: "Somente leitura" })[u.papel] || u.papel} · ${u.email}`))));
    if ((r.convites || []).length) usuariosEl.appendChild(h("p", { class: "fraco" }, `${r.convites.length} convite(s) aguardando.`));
  }).catch(e => { ui.limpar(usuariosEl); usuariosEl.appendChild(h("p", { class: "fraco" }, ui.mensagemErro(e))); });

  corpo.append(
    h("div", { class: "cartao" },
      h("div", { class: "cartao-cab" },
        h("div", { class: "cel-nome" }, ui.avatar(cli.nome, cli.id), h("div", null,
          h("h1", { class: "titulo-sec" }, cli.nome),
          h("div", { class: "linha" }, ui.pilula(st.rotulo, st.cor), ui.pilula(nomePlano(cli.plano), cli.plano === "interno" ? "sec" : "prim"),
            cli.comercial && cli.comercial.pacote ? ui.pilula(rotuloPacote(cli.comercial.pacote), "info") : null,
            h("span", { class: "fraco" }, `${cli.org ? cli.org.nome : ""} · desde ${ui.dataBR(cli.criado_em)}`)))),
        h("div", { class: "linha" }, btConvite, btEntrar))),
    h("div", { class: "adm-det" },
      h("div", { class: "pilha" },
        h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Plano e situação"),
          h("p", { class: "sub" }, superConta ? "Como plataforma, você também define limites extras." : "O plano Interno e os limites extras são só da plataforma."))), form)),
      h("div", { class: "pilha" },
        h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Uso do plano"), h("p", { class: "sub" }, "Contagem de agora; sugestões de IA no mês corrente."))), usoEl),
        h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Usuários com acesso"))), usuariosEl),
        EXTRAS.dominiosCliente ? EXTRAS.dominiosCliente(ctx, cli) : null)));
}

export function barraUso(ui, rotulo, uso, limite) { return ui.barraUso(rotulo, uso, limite); }

/* ============================================================
   P0-B: revendas, planos, domínios
   ============================================================ */
const EXTRAS = { revendas: telaRevendas, planos: telaPlanos, dominios: telaDominios, dominiosCliente: cartaoDominiosCliente };

/** config.js tem o editor de marca e o cartão de domínio: carregado com o MESMO ?v= do roteador. */
function modConfig(ctx) { return import(`./config.js?v=${encodeURIComponent(ctx.versao)}`); }
function linkAbsoluto(link) { return String(link || "").startsWith("#") ? new URL("./", location.href).href.split("#")[0] + link : link; }
const LIMITES_ORG = [{ chave: "empresas", rotulo: "Clientes" }, { chave: "usuarios", rotulo: "Usuários (soma)" }, { chave: "canais", rotulo: "Números de WhatsApp (soma)" }];

/* ---------------- REVENDAS (super) ---------------- */
async function telaRevendas(ctx, corpo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Revendas");
  const novo = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("mais"), "Revenda");
  novo.setAttribute("aria-label", "Nova revenda");
  const lista = h("div", { class: "pilha" }, ui.esqueleto("cartoes", 3));
  corpo.append(h("div", { class: "adm-filtros adm-filtros-fim" }, novo), lista);
  novo.addEventListener("click", () => formRevenda(ctx, null, carregar));

  async function carregar() {
    ui.limpar(lista);
    lista.append(ui.esqueleto("cartoes", 3));
    let os;
    try { _orgs = null; os = await orgs(ctx); await planos(ctx); }
    catch (e) { ui.limpar(lista); lista.append(ui.erroCartao(e, carregar)); return; }
    ui.limpar(lista);
    const plat = os.find(o => o.tipo === "plataforma");
    const revs = os.filter(o => o.tipo === "revenda").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (plat) {
      lista.append(h("div", { class: "cartao rev-plat" },
        h("div", { class: "rev-cab" }, marcaMini(ctx, plat),
          h("div", { class: "rev-tit" }, h("b", null, plat.nome), h("small", { class: "mono" }, `plataforma · ${plat.empresas} clientes · ${plat.usuarios} usuários`))),
        h("div", { class: "linha" },
          h("a", { class: "bt bt-sec bt-p", href: "#/config/marca?de=org" }, ui.icone("pincel"), "Marca da plataforma"),
          h("a", { class: "bt bt-fant bt-p", href: `#/admin/clientes?org=${encodeURIComponent(plat.id)}` }, "Ver clientes"))));
    }
    if (!revs.length) {
      lista.append(ui.vazio({ titulo: "Nenhuma revenda ainda.", icone: "camadas",
        texto: "Uma revenda é uma agência que vende o sistema com a própria marca, dentro dos limites que você define.",
        acao: { rotulo: "Criar a primeira revenda", fn: () => formRevenda(ctx, null, carregar) } }));
      return;
    }
    lista.append(h("div", { class: "rev-grade" }, revs.map(o => cartaoRevenda(ctx, o, carregar))));
  }
  await carregar();
}

function marcaMini(ctx, o) {
  const { ui } = ctx;
  const h = ui.h;
  const T = ctx.shell.tema;
  const ef = T.marcaEfetiva(o.marca || {}, {});
  const logo = ef.logo || ef.logo_claro;
  const el = h("span", { class: "rev-logo", style: { "--cor": ui.corOk(ef.cores.fundo) } },
    logo ? h("img", { src: logo, alt: "" }) : h("svg", { viewBox: "0 0 48 48", "aria-hidden": "true" }, h("use", { href: "#marca-orbita" })));
  return el;
}

function cartaoRevenda(ctx, o, recarregar) {
  const { ui, api } = ctx;
  const h = ui.h;
  const T = ctx.shell.tema;
  const ef = T.marcaEfetiva(o.marca || {}, {});
  const lim = o.limites || {};
  const pp = (_planos || []).find(p => p.id === lim.plano_padrao);
  const btEditar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("editar"), "Editar");
  const btConvite = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("convidar"), "Convidar gestor");
  const btMarca = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("pincel"), "Marca");
  btEditar.addEventListener("click", () => formRevenda(ctx, o, recarregar));
  btConvite.addEventListener("click", () => convidarGestor(ctx, o, btConvite));
  btMarca.addEventListener("click", () => editarMarcaOrg(ctx, o, recarregar));
  return h("article", { class: "cartao rev-cartao" },
    h("div", { class: "rev-cab" }, marcaMini(ctx, o),
      h("div", { class: "rev-tit" }, h("b", null, o.nome), h("small", { class: "mono" }, `${ef.produto} · ?org=${o.slug}`)),
      ui.pilula(o.status === "ativo" ? "Ativa" : "Suspensa", o.status === "ativo" ? "ok" : "aten")),
    h("div", { class: "rev-cores", "aria-label": "Cores da marca" }, ["primaria", "secundaria", "fundo"].map(k =>
      h("span", { class: "rev-cor", style: { "--cor": ui.corOk(ef.cores[k]) }, title: `${{ primaria: "Primária", secundaria: "Secundária", fundo: "Fundo" }[k]} ${ef.cores[k]}` }))),
    h("div", { class: "adm-uso" },
      ui.barraUso("Clientes", o.empresas, lim.empresas ?? null),
      ui.barraUso("Usuários", o.usuarios, lim.usuarios ?? null),
      ui.barraUso("Números de WhatsApp", o.canais, lim.canais ?? null)),
    h("p", { class: "fraco rev-pp" }, `Plano padrão dos clientes novos: ${pp ? pp.nome : lim.plano_padrao || "Essencial"}`),
    h("div", { class: "linha" }, btEditar, btConvite, btMarca,
      h("a", { class: "bt bt-fant bt-p", href: `#/admin/clientes?org=${encodeURIComponent(o.id)}` }, "Clientes")));
}

async function formRevenda(ctx, o, aoSalvar) {
  const { ui, api } = ctx;
  const h = ui.h;
  const T = ctx.shell.tema;
  let ps = [];
  try { ps = (await planos(ctx)).filter(p => p.ativo && p.id !== "interno"); } catch { ps = []; }
  const lim = (o && o.limites) || { empresas: 10, usuarios: 50, canais: 10, plano_padrao: "essencial" };
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome da agência", nome: "nome", valor: o ? o.nome : "", obrigatorio: true, max: 80, autocomplete: "off", placeholder: "Ex.: Agência Conecta" }),
      ui.campo({ rotulo: "Endereço (slug)", nome: "slug", valor: o ? o.slug : "", obrigatorio: true, max: 40, autocomplete: "off",
        ajuda: "Vira o link de entrada: /app/?org=slug (até ter domínio próprio)." }),
      o ? ui.campo({ rotulo: "Situação", nome: "status", tipo: "select", valor: o.status, opcoes: [{ valor: "ativo", rotulo: "Ativa" }, { valor: "suspenso", rotulo: "Suspensa (os clientes da agência não entram)" }],
        ajuda: "Suspensa: as equipes dos clientes da agência deixam de entrar. O gestor continua entrando para organizar e exportar." }) : null,
      ui.campo({ rotulo: "Plano padrão dos clientes novos", nome: "plano_padrao", tipo: "select", valor: lim.plano_padrao || "essencial",
        opcoes: ps.map(p => ({ valor: p.id, rotulo: p.nome })) })),
    h("fieldset", { class: "campo" }, h("legend", null, "Limites da agência (somados em todos os clientes)"),
      h("p", { class: "campo-ajuda" }, "Em branco = sem limite."),
      h("div", { class: "form-grade form-grade-3" }, LIMITES_ORG.map(k => ui.campo({ rotulo: k.rotulo, nome: `lim_${k.chave}`, tipo: "numero", min: 0, valor: lim[k.chave] ?? "" })))),
    o ? null : h("fieldset", { class: "campo" }, h("legend", null, "Marca inicial"),
      h("p", { class: "campo-ajuda" }, "A agência completa (logo, textos do login, WhatsApp) depois, em Configurações → Marca e tema."),
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Nome do produto", nome: "produto", max: 40, placeholder: "Ex.: Conecta CRM", autocomplete: "off" }),
        ui.campo({ rotulo: "Cor primária", nome: "cor_primaria", tipo: "cor", valor: T.PADRAO.cores.primaria, paleta: ctx.paleta }),
        ui.campo({ rotulo: "Cor secundária", nome: "cor_secundaria", tipo: "cor", valor: T.PADRAO.cores.secundaria, paleta: ctx.paleta }),
        ui.campo({ rotulo: "Cor de fundo", nome: "cor_fundo", tipo: "cor", valor: T.PADRAO.cores.fundo, paleta: T.FUNDOS }))));
  const nome = form.querySelector("input[name=nome]"), slug = form.querySelector("input[name=slug]");
  let slugMexido = !!o;
  nome.addEventListener("input", () => { if (!slugMexido) slug.value = sugerirSlug(nome.value); });
  slug.addEventListener("input", () => { slugMexido = true; });

  const r = await ui.modal({
    titulo: o ? `Editar ${o.nome}` : "Nova revenda", corpo: form, largura: "g",
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: o ? "Salvar" : "Criar revenda", tipo: "primario", fn: async () => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        if (!d.nome || d.nome.length < 2) { ui.marcarErro(form, "nome", "Informe o nome."); return false; }
        if (!/^[a-z0-9-]{2,40}$/.test(d.slug || "")) { ui.marcarErro(form, "slug", "Use de 2 a 40 letras minúsculas, números ou hífen."); return false; }
        const limites = {};
        for (const k of LIMITES_ORG) { const v = d[`lim_${k.chave}`]; if (v !== null && v !== undefined && v !== "" && Number.isFinite(v)) limites[k.chave] = Math.max(0, Math.floor(v)); }
        if (d.plano_padrao) limites.plano_padrao = d.plano_padrao;
        const p = { nome: d.nome, slug: d.slug, limites };
        if (o) { p.id = o.id; p.status = d.status; }
        else {
          const marca = { cores: {} };
          if (d.produto) marca.produto = d.produto;
          for (const k of ["primaria", "secundaria", "fundo"]) { const c = T.normalizarHex(d[`cor_${k}`]); if (c) marca.cores[k] = c; }
          p.marca = marca;
        }
        if (o && o.status === "ativo" && d.status === "suspenso"
          && !(await ui.confirmar({ titulo: `Suspender ${o.nome}?`, texto: "As equipes de TODOS os clientes da agência deixam de acessar na hora. O gestor da agência continua entrando. Os dados ficam guardados.", rotulo: "Suspender", perigo: true }))) return false;
        try { return await api.rpc("nx_org_salvar", { p_org: p }); }
        catch (e) {
          if (e.codigo === "slug_em_uso") { ui.marcarErro(form, "slug", "Esse endereço já está em uso."); return false; }
          if (e.codigo === "dados_invalidos" && /^limites\./.test(e.hint || "")) { ui.marcarErro(form, `lim_${e.hint.slice(8)}`, "Use um número inteiro (ou deixe em branco)."); return false; }
          if (e.codigo === "marca_invalida") throw e;
          throw e;
        }
      } },
    ],
  });
  if (r && r.id) {
    ui.toast(o ? "Revenda atualizada." : `Revenda criada. Convide o gestor para ${r.nome} começar.`, { tipo: "ok" });
    if (aoSalvar) await aoSalvar();
    if (!o) convidarGestor(ctx, r, null);
  }
}

async function convidarGestor(ctx, o, botao) {
  const { ui, api } = ctx;
  const h = ui.h;
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "aviso" }, ui.icone("info"), h("p", null, "O link cria uma conta NOVA de gestor desta agência. Quem já tem conta no sistema precisa usar outro e-mail.")),
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome (opcional)", nome: "nome", max: 80, autocomplete: "off" }),
      ui.campo({ rotulo: "E-mail (opcional)", nome: "email", tipo: "email", autocomplete: "off" })));
  let feito = null;
  await ui.modal({
    titulo: `Convidar gestor · ${o.nome}`, corpo: form, largura: "m",
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Gerar link", tipo: "primario", fn: async m => {
        if (feito) return true;
        const d = ui.lerForm(form);
        if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) { ui.marcarErro(form, "email", "Esse e-mail não parece válido."); return false; }
        const r = await (botao ? ui.carregando(botao, api.rpc("nx_convite_criar", { p_cliente: null, p_dados: { papel: "gestor", dias: 7, nome: d.nome || null, email: d.email || null }, p_org: o.id }))
          : api.rpc("nx_convite_criar", { p_cliente: null, p_dados: { papel: "gestor", dias: 7, nome: d.nome || null, email: d.email || null }, p_org: o.id }));
        feito = r;
        const link = linkAbsoluto(r.link);
        ui.limpar(m.corpo);
        m.corpo.append(
          h("div", { class: "aviso aviso-ok" }, ui.icone("check"), h("p", null, "Convite de gestor criado. Envie o link — ele não chega por e-mail.")),
          ui.blocoLink(link, { rotulo: "Link do convite de gestor", textoWhats: `Olá${d.nome ? `, ${d.nome.split(" ")[0]}` : ""}! Aqui está o seu acesso de gestor da ${o.nome}. Crie sua conta por este link:` }),
          h("p", { class: "fraco" }, `Vale até ${ui.dataHoraBR(r.expira_em)}, uma vez só, e apenas para conta nova.`));
        const bt = m.el.querySelector(".modal-rod [data-tipo=primario]"); if (bt) bt.textContent = "Concluir";
        const cancelar = m.el.querySelector(".modal-rod [data-tipo=neutro]"); if (cancelar) cancelar.hidden = true;
        return false;
      } },
    ],
  });
}

async function editarMarcaOrg(ctx, o, aoFechar) {
  const { ui } = ctx;
  const h = ui.h;
  let limpar = null;
  const corpo = h("div", { class: "pilha" });
  const g = ui.gaveta({ titulo: `Marca · ${o.nome}`, corpo, largura: "g",
    aoFechar: () => { if (limpar) try { limpar(); } catch { /* ok */ } if (aoFechar) aoFechar(); } });
  try {
    const cfg = await modConfig(ctx);
    limpar = await cfg.editorMarca(ctx, corpo, { tipo: "org", org: o });
  } catch (e) {
    ui.limpar(corpo);
    corpo.append(ui.erroCartao(e, null));
  }
  return g;
}

/* ---------------- PLANOS (super) ---------------- */
async function telaPlanos(ctx, corpo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Planos");
  const novo = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("mais"), "Plano");
  novo.setAttribute("aria-label", "Novo plano");
  const grade = h("div", { class: "plano-grade" }, ui.esqueleto("cartoes", 3));
  corpo.append(h("div", { class: "adm-filtros adm-filtros-fim" },
    h("p", { class: "fraco adm-dica" }, "Limite em branco = sem limite. Mudanças valem na hora para todos os clientes do plano (exceto limites extras de cada cliente)."), novo), grade);

  async function carregar() {
    ui.limpar(grade); grade.append(ui.esqueleto("cartoes", 3));
    let ps;
    try { _planos = null; ps = await planos(ctx); }
    catch (e) { ui.limpar(grade); grade.append(ui.erroCartao(e, carregar)); return; }
    ui.limpar(grade);
    for (const p of ps) grade.append(cartaoPlano(ctx, p, carregar));
  }
  novo.addEventListener("click", async () => {
    const form = h("form", { class: "pilha", novalidate: true },
      h("div", { class: "form-grade" },
        ui.campo({ rotulo: "Nome", nome: "nome", obrigatorio: true, max: 40, autocomplete: "off", placeholder: "Ex.: Premium" }),
        ui.campo({ rotulo: "Código", nome: "id", obrigatorio: true, max: 30, autocomplete: "off", ajuda: "Minúsculas, números e _ (não muda depois)." })));
    const nome = form.querySelector("input[name=nome]"), id = form.querySelector("input[name=id]");
    let mexido = false;
    nome.addEventListener("input", () => { if (!mexido) id.value = sugerirSlug(nome.value).replace(/-/g, "_").slice(0, 30); });
    id.addEventListener("input", () => { mexido = true; });
    const r = await ui.modal({ titulo: "Novo plano", corpo: form, largura: "m", acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Criar plano", tipo: "primario", fn: async () => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        if (!d.nome || d.nome.length < 2) { ui.marcarErro(form, "nome", "Informe o nome."); return false; }
        if (!/^[a-z0-9_]{2,30}$/.test(d.id || "")) { ui.marcarErro(form, "id", "Use de 2 a 30 letras minúsculas, números ou _."); return false; }
        if ((_planos || []).some(p => p.id === d.id)) { ui.marcarErro(form, "id", "Já existe um plano com esse código."); return false; }
        return api.rpc("nx_plano_salvar", { p_plano: { id: d.id, nome: d.nome, ativo: false, modulos: ["crm", "conversas", "relatorios"],
          ordem: ((_planos || []).reduce((mx, p) => Math.max(mx, p.ordem || 0), 0) + 1) } });
      } },
    ] });
    if (r && r.id) { ui.toast("Plano criado desligado. Ajuste preço, limites e módulos e ligue quando estiver pronto.", { tipo: "ok" }); await carregar(); }
  });
  await carregar();
}

function cartaoPlano(ctx, p, recarregar) {
  const { ui, api } = ctx;
  const h = ui.h;
  const lim = p.limites || {};
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ rotulo: "Nome", nome: "nome", valor: p.nome, max: 40 }),
      ui.campo({ rotulo: "Preço por mês (R$)", nome: "preco_mensal", tipo: "moeda", valor: p.preco_mensal != null ? Number(p.preco_mensal) : "", ajuda: "Em branco = sob consulta." }),
      ui.campo({ rotulo: "Ordem", nome: "ordem", tipo: "numero", valor: p.ordem ?? 0, min: 0 }),
      ui.campo({ tipo: "interruptor", nome: "ativo", rotulo: "Disponível para novos clientes", valor: !!p.ativo })),
    h("fieldset", { class: "campo" }, h("legend", null, "Limites"),
      h("div", { class: "form-grade form-grade-3" }, CHAVES_LIMITE.map(k => ui.campo({ rotulo: k.curto || k.rotulo, nome: `lim_${k.chave}`, tipo: "numero", min: 0, valor: lim[k.chave] ?? "", placeholder: "sem limite" })))),
    ui.campo({ rotulo: "Módulos", nome: "modulos", tipo: "multipla", valor: p.modulos || [], opcoes: MODULOS, ajuda: "CRM e Conversas andam juntos." }),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Salvar plano")));
  const cbs = form.querySelectorAll("[data-multi=modulos] input[type=checkbox]");
  for (const cb of cbs) cb.addEventListener("change", () => {
    const par = { crm: "conversas", conversas: "crm" }[cb.value];
    const outro = [...cbs].find(x => x.value === par);
    if (outro) outro.checked = cb.checked;
  });
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (!d.nome || d.nome.length < 2) return ui.marcarErro(form, "nome", "Informe o nome.");
    const limites = {};
    for (const k of CHAVES_LIMITE) { const v = d[`lim_${k.chave}`]; if (v !== null && v !== undefined && v !== "" && Number.isFinite(v)) limites[k.chave] = Math.max(0, Math.floor(v)); }
    if (p.id === "interno" && d.ativo === false && !(await ui.confirmar({ titulo: "Desligar o plano Interno?", texto: "Os clientes da plataforma continuam nele; ele só deixa de aparecer para novos clientes.", rotulo: "Desligar" }))) return;
    try {
      const r = await ui.carregando(form.querySelector("[type=submit]"), api.rpc("nx_plano_salvar", { p_plano: {
        id: p.id, nome: d.nome, preco_mensal: d.preco_mensal, ordem: Number.isFinite(d.ordem) ? Math.max(0, Math.floor(d.ordem)) : 0,
        ativo: !!d.ativo, limites, modulos: d.modulos || [] } }));
      Object.assign(p, r);
      _planos = null;
      ui.toast(`Plano ${r.nome} salvo. Vale na hora para os clientes dele.`, { tipo: "ok" });
      if (recarregar) await recarregar();
    } catch (e) {
      if (e.codigo === "dados_invalidos" && /^limites\./.test(e.hint || "")) return ui.marcarErro(form, `lim_${e.hint.slice(8)}`, "Use um número inteiro (ou deixe em branco).");
      if (e.codigo === "nome_invalido") return ui.marcarErro(form, "nome", "Use de 2 a 40 caracteres.");
      ui.toast(api.mensagemErro(e), { tipo: "erro" });
    }
  });
  return h("article", { class: ["cartao", "plano-cartao", !p.ativo && "inativo"] },
    h("div", { class: "cartao-cab" },
      h("div", null, h("h2", { class: "titulo-sec" }, p.nome),
        h("p", { class: "mono fraco" }, `${p.id}${p.preco_mensal != null ? ` · ${ui.brl(p.preco_mensal, { centavos: false })}/mês` : ""}`)),
      ui.pilula(p.id === "interno" ? "Só plataforma" : p.ativo ? "Disponível" : "Desligado", p.id === "interno" ? "sec" : p.ativo ? "ok" : "neutra")),
    form);
}

/* ---------------- DOMÍNIOS (super: todos, com ativação · gestor: os da org) ---------------- */
async function telaDominios(ctx, corpo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Domínios");
  const superConta = !!ctx.sessao.conta.super;
  const filtro = h("select", { class: "sel", "aria-label": "Filtrar por situação" },
    h("option", { value: "" }, "Todos"), h("option", { value: "pendente" }, "Pendentes"), h("option", { value: "ativo" }, "Ativos"));
  const novo = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("mais"), "Domínio");
  novo.setAttribute("aria-label", "Novo domínio");
  const lista = h("div", { class: "dom-grade" }, ui.esqueleto("cartoes", 2));
  corpo.append(...[
    superConta ? h("div", { class: "aviso" }, ui.icone("info"), h("p", null, "Para ativar: no Netlify, em Domain management → Add a domain alias, adicione o endereço; espere o certificado HTTPS sair e só então clique em Marcar ativo.")) : null,
    h("div", { class: "adm-filtros" }, filtro, h("span", { class: "marca-espaco" }), novo), lista].filter(Boolean));
  let dados = [], cfg = null;
  async function carregar() {
    ui.limpar(lista); lista.append(ui.esqueleto("cartoes", 2));
    try {
      const [resposta, modulo] = await Promise.all([api.rpc("nx_dominios_listar"), cfg || modConfig(ctx)]);
      cfg = modulo;
      dados = cfg.validarListaDominios(resposta);
    }
    catch (e) { ui.limpar(lista); lista.append(ui.erroCartao(e, carregar)); return; }
    desenhar();
  }
  function desenhar() {
    ui.limpar(lista);
    const itens = dados.filter(d => !filtro.value || d.status === filtro.value);
    if (!itens.length) {
      lista.append(ui.vazio({ titulo: dados.length ? "Nenhum domínio com esse filtro." : "Nenhum domínio ainda.", icone: "globo",
        texto: dados.length ? "" : "Revendas e clientes podem usar o próprio endereço (ex.: crm.agencia.com.br) com a marca deles." }));
      return;
    }
    for (const d of itens) lista.append(cfg.cartaoDominio(ctx, d, {
      mostrarOrg: superConta,
      aoRemover: carregar,
      aoStatus: superConta ? async ativo => { dados = cfg.validarListaDominios(await api.rpc("nx_dominio_status", { p_host: d.host, p_ativo: ativo })); ui.toast(ativo ? `${d.host} ativo.` : `${d.host} voltou a pendente.`, { tipo: "ok" }); desenhar(); } : null,
    }));
  }
  filtro.addEventListener("change", desenhar);
  novo.addEventListener("click", async () => {
    const clientes = ctx.shell.clientes();
    const form = h("form", { class: "pilha", novalidate: true },
      ui.campo({ rotulo: "Endereço", nome: "host", placeholder: "crm.agencia.com.br", autocomplete: "off", ajuda: "Subdomínio (domínio raiz não aceita CNAME)." }),
      ui.campo({ rotulo: "Para quem", nome: "cliente", tipo: "select", valor: "",
        opcoes: [{ valor: "", rotulo: superConta ? "Plataforma (sem cliente)" : "Toda a agência" }, ...clientes.map(c => ({ valor: c.id, rotulo: `${c.nome}${c.org_nome ? ` (${c.org_nome})` : ""}` }))] }));
    const r = await ui.modal({ titulo: "Novo domínio", corpo: form, largura: "m", acoes: [
      { rotulo: "Cancelar", tipo: "neutro" },
      { rotulo: "Cadastrar", tipo: "primario", fn: async () => {
        ui.marcarErro(form, null);
        const d = ui.lerForm(form);
        try { return await api.rpc("nx_dominio_salvar", { p_host: d.host || "", p_cliente: d.cliente || null }); }
        catch (e) {
          if (e.codigo === "dominio_invalido" || e.codigo === "dominio_em_uso") { ui.marcarErro(form, "host", api.mensagemErro(e)); return false; }
          throw e;
        }
      } },
    ] });
    if (r !== null && r !== undefined) {
      try { dados = cfg.validarListaDominios(r); desenhar(); ui.toast("Domínio cadastrado como pendente.", { tipo: "ok" }); }
      catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); await carregar(); }
    }
  });
  await carregar();
}

/** Cartão "Domínios" no detalhe do cliente (P0-B, atrás de admin_revendas). */
function cartaoDominiosCliente(ctx, cli) {
  if (!ctx.pronto("admin_revendas")) return null;
  const { ui, api } = ctx;
  const h = ui.h;
  const lista = h("div", { class: "pilha-p" }, ui.esqueleto("lista", 1));
  const host = h("input", { type: "text", placeholder: `crm.${cli.slug}.com.br`, "aria-label": `Novo domínio para ${cli.nome}`, autocomplete: "off" });
  const bt = h("button", { type: "submit", class: "bt bt-sec bt-p" }, ui.icone("mais"), "Adicionar");
  const erro = h("small", { class: "campo-erro", role: "alert", hidden: true });
  const form = h("form", { class: "dom-add", novalidate: true }, host, bt);
  async function carregar() {
    try {
      const modulo = await modConfig(ctx);
      const todos = modulo.validarListaDominios(await api.rpc("nx_dominios_listar"));
      const meus = todos.filter(d => d.cliente && d.cliente.id === cli.id);
      ui.limpar(lista);
      if (!meus.length) lista.append(h("p", { class: "fraco" }, "Sem domínio próprio. Os links usam o endereço da agência."));
      for (const d of meus) lista.append(h("div", { class: "dom-linha" }, ui.icone("globo"), h("span", { class: "mono" }, d.host),
        ui.pilula(d.status === "ativo" ? "Ativo" : "Pendente", d.status === "ativo" ? "ok" : "aten")));
    } catch (e) {
      ui.limpar(lista);
      const tentar = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Tentar novamente");
      tentar.addEventListener("click", carregar);
      lista.append(h("p", { class: "fraco", role: "alert" }, api.mensagemErro(e)), tentar);
    }
  }
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    erro.hidden = true;
    try { await ui.carregando(bt, api.rpc("nx_dominio_salvar", { p_host: host.value, p_cliente: cli.id })); host.value = ""; ui.toast("Domínio cadastrado. Veja a instrução de DNS em Admin → Domínios.", { tipo: "ok" }); carregar(); }
    catch (e) { erro.textContent = api.mensagemErro(e); erro.hidden = false; }
  });
  carregar();
  return h("div", { class: "cartao" }, h("div", { class: "cartao-cab" }, h("div", null, h("h2", null, "Domínios do cliente"),
    h("p", { class: "sub" }, "Quem entra por esse endereço já cai nesta empresa, com a marca dela."))),
    lista, form, erro, h("a", { class: "voltar-link", href: "#/admin/dominios" }, "Instruções de DNS e ativação", ui.icone("seta-dir")));
}
