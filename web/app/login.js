/* ============================================================
   ÓRBITA — login.js · frente F3 · ESPEC T1 (§7.7), §5.2
   #/login · #/convite/<token> · #/senha/<token> · troca obrigatória
   Sem cadastro aberto. A tela nunca pergunta ao servidor se um
   e-mail existe. Marca da org (nx_marca_publica / nx_convite_ver).
   ============================================================ */

let _ctx = null;

export async function montar(ctx) {
  _ctx = ctx;
  const { rota } = ctx;
  if (rota.modulo === "convite") return telaConvite(ctx, rota.partes[0] || "");
  if (rota.modulo === "senha") return telaSenha(ctx, rota.partes[0] || "");
  if (rota.modulo === "trocar") return telaTrocar(ctx);
  return telaEntrar(ctx);
}

export function desmontar() { _ctx = null; }

/* ---------------- moldura: arte editorial + cartão ---------------- */
function moldura(ctx, { titulo, sub, cartao, marca }) {
  const { ui } = ctx;
  const h = ui.h;
  const m = marca || ctx.marca || {};
  const escuro = document.documentElement.dataset.esquema !== "claro";
  const logo = escuro ? m.logo : (m.logo_claro || m.logo);
  const nomeProd = h("span", null, m.produto || "Órbita");
  const marcaEl = h("div", { class: "entrar-marca" },
    logo ? (() => {
      const i = h("img", { src: logo, alt: "" });
      // logo largo (já traz o nome escrito): não repete o nome do produto ao lado
      i.addEventListener("load", () => { if (i.naturalWidth > i.naturalHeight * 1.6) { i.classList.add("largo"); nomeProd.classList.add("sr-only"); } });
      return i;
    })() : h("svg", { viewBox: "0 0 48 48", "aria-hidden": "true" }, h("use", { href: "#marca-orbita" })),
    nomeProd);
  const t = String(titulo || "").trim();
  const i = t.lastIndexOf(" ");
  const tituloEl = h("p", { class: "entrar-titulo" }, i > 0 ? [t.slice(0, i + 1), h("em", null, t.slice(i + 1))] : t);
  const arte = h("section", { class: "entrar-arte", "aria-label": m.produto || "Órbita" },
    marcaEl, tituloEl,
    sub ? h("p", { class: "entrar-sub" }, sub) : null,
    h("div", { class: "entrar-orbita", "aria-hidden": "true" }, h("i", { class: "o1" }), h("i", { class: "o2" }), h("i", { class: "p" }), h("i", { class: "l l1" }), h("i", { class: "l l2" }), h("i", { class: "l l3" })),
    h("div", { class: "entrar-pontos", "aria-hidden": "true" },
      ui.pilula("WhatsApp oficial", "prim", { icone: "whatsapp" }), ui.pilula("Funil de vendas", "sec", { icone: "funil" }), ui.pilula("Retorno do anúncio", "neutra", { icone: "anuncio" })));
  return h("main", { class: "entrar", id: "vista-publica" }, arte, cartao);
}

function caixaMsg(ui) { return ui.h("p", { class: "entrar-erro", role: "alert", hidden: true }); }
function mostrar(el, texto) { el.textContent = texto || ""; el.hidden = !texto; }

/* ---------------- #/login ---------------- */
function telaEntrar(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const m = ctx.marca || {};
  ctx.titulo("Entrar");
  const erro = caixaMsg(ui);
  const form = h("form", { class: "entrar-form", novalidate: true },
    ui.campo({ rotulo: "E-mail", nome: "email", tipo: "email", autocomplete: "username", obrigatorio: true, inputmode: "email" }),
    ui.campo({ rotulo: "Senha", nome: "senha", tipo: "senha", autocomplete: "current-password", obrigatorio: true }),
    erro,
    h("button", { type: "submit", class: "bt bt-prim bt-g bt-bloco" }, "Entrar"));
  const esqueci = h("button", { type: "button", class: "link", "aria-expanded": "false" }, "Esqueci a senha");
  const ajuda = h("div", { class: "aviso", hidden: true, role: "status" }, ui.icone("info"),
    h("div", { class: "pilha-p" },
      h("p", null, "Peça ao administrador da sua empresa um link para criar uma senha nova."),
      m.suporte_wa ? h("a", { class: "bt bt-sec bt-p", href: ui.linkWhatsApp("Olá! Preciso de ajuda para entrar no sistema.", m.suporte_wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Falar com o suporte") : null));
  esqueci.addEventListener("click", () => { ajuda.hidden = !ajuda.hidden; esqueci.setAttribute("aria-expanded", String(!ajuda.hidden)); });

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    mostrar(erro, "");
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (!d.email) return ui.marcarErro(form, "email", "Informe o e-mail.");
    if (!d.senha) return ui.marcarErro(form, "senha", "Informe a senha.");
    const bt = form.querySelector("button[type=submit]");
    try {
      const r = await ui.carregando(bt, api.publica("nx_entrar", { p_email: d.email, p_senha: d.senha }));
      if (!r || !r.token) throw Object.assign(new Error("credenciais_invalidas"), { codigo: "credenciais_invalidas" });
      await ctx.aoEntrar(r.token);
    } catch (e) {
      mostrar(erro, api.mensagemErro(e));
      const s = form.querySelector("input[name=senha]"); if (s) { s.value = ""; s.focus(); }
    }
  });

  const prod = ctx.produtoAberto;
  const cartao = h("section", { class: "entrar-cartao", "aria-labelledby": "t-entrar" },
    prod ? h("p", { class: "entrar-produto" }, ui.icone(prod.icone), h("span", null, h("b", null, prod.titulo), " · ", prod.resumo)) : null,
    h("h1", { id: "t-entrar" }, "Entrar"),
    h("p", { class: "sub" }, m.login_texto || "Entre com o e-mail e a senha que você recebeu."),
    form,
    h("div", { class: "entrar-rodape" }, esqueci),
    ajuda);
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(moldura(ctx, { titulo: m.login_titulo, sub: null, cartao }));
  setTimeout(() => { const i = ctx.alvo.querySelector("input[name=email]"); if (i) i.focus(); }, 60);
}

/* ---------------- #/convite/<token> ---------------- */
async function telaConvite(ctx, token) {
  const { ui, api } = ctx;
  const h = ui.h;
  ctx.titulo("Convite");
  ui.limpar(ctx.alvo);
  const carregandoEl = h("main", { class: "entrar" }, h("div", null), h("section", { class: "entrar-cartao" }, ui.esqueleto("lista", 3)));
  ctx.alvo.appendChild(carregandoEl);

  let cv;
  try {
    if (!/^[0-9a-f]{64}$/i.test(token)) throw Object.assign(new Error("convite_invalido"), { codigo: "convite_invalido" });
    cv = await api.publica("nx_convite_ver", { p_convite: token });
  } catch (e) {
    ui.limpar(ctx.alvo);
    const ir = h("a", { class: "bt bt-prim", href: "#/login" }, "Ir para a entrada");
    ctx.alvo.appendChild(moldura(ctx, {
      titulo: (ctx.marca && ctx.marca.login_titulo) || "", cartao: h("section", { class: "entrar-cartao" },
        h("h1", null, "Convite indisponível"), h("p", { class: "sub" }, api.mensagemErro(e)), h("div", { class: "entrar-form" }, ir)),
    }));
    return;
  }

  // a marca do convite é a da org que convidou
  if (cv.org && cv.org.marca) ctx.pintarMarcaOrg(cv.org.marca);
  const marca = ctx.tema.marcaEfetiva((cv.org && cv.org.marca) || {}, {});
  const PAPEL = { gestor: "gestor", admin: "administrador", supervisor: "supervisor", atendente: "atendente", leitura: "somente leitura" };
  const papelTxt = PAPEL[cv.papel] || cv.papel;
  const destinoTxt = cv.cliente ? cv.cliente.nome : (cv.org ? cv.org.nome : marca.produto);
  const erro = caixaMsg(ui);
  const form = h("form", { class: "entrar-form", novalidate: true },
    ui.campo({ rotulo: "Seu nome", nome: "nome", valor: cv.nome || "", autocomplete: "name", obrigatorio: true, max: 80 }),
    ui.campo({ rotulo: "E-mail", nome: "email", tipo: "email", valor: cv.email || "", autocomplete: "username", obrigatorio: true }),
    ui.campo({ rotulo: "Senha", nome: "senha", tipo: "senha", autocomplete: "new-password", obrigatorio: true, ajuda: "Pelo menos 8 caracteres." }),
    erro,
    h("button", { type: "submit", class: "bt bt-prim bt-g bt-bloco" }, "Criar acesso"),
    cv.papel === "gestor"
      ? h("p", { class: "entrar-nota" }, "Este convite cria uma conta nova de gestor. Use um e-mail que ainda não tenha conta.")
      : h("p", { class: "entrar-nota" }, "Já usa o sistema em outra empresa? Use o mesmo e-mail e a sua senha atual — o novo acesso é acrescentado à sua conta."));

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    mostrar(erro, "");
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (!d.nome || d.nome.length < 2) return ui.marcarErro(form, "nome", "Informe o seu nome.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email || "")) return ui.marcarErro(form, "email", "Esse e-mail não parece válido.");
    if (!d.senha || d.senha.length < 8) return ui.marcarErro(form, "senha", "A senha precisa ter pelo menos 8 caracteres.");
    const bt = form.querySelector("button[type=submit]");
    try {
      const r = await ui.carregando(bt, api.publica("nx_convite_aceitar", { p_convite: token, p_nome: d.nome, p_email: d.email, p_senha: d.senha }));
      await ctx.aoEntrar(r.token, { cliente_id: r.cliente_id || null });
    } catch (e) {
      mostrar(erro, api.mensagemErro(e));
      if (e.codigo === "credenciais_invalidas") { const s = form.querySelector("input[name=senha]"); if (s) { s.value = ""; s.focus(); } }
      if (e.codigo === "convite_invalido" && e.hint !== "conta_existente") bt.disabled = true;
    }
  });

  const cartao = h("section", { class: "entrar-cartao", "aria-labelledby": "t-convite" },
    h("h1", { id: "t-convite" }, "Você foi convidado"),
    h("div", { class: "entrar-convite" }, ui.icone("convidar"),
      h("p", null, cv.papel === "gestor" ? "Para gerenciar " : "Para ", h("b", null, destinoTxt), " como ", h("b", null, papelTxt), ".")),
    form);
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(moldura(ctx, { titulo: marca.login_titulo, cartao, marca }));
  setTimeout(() => { const i = ctx.alvo.querySelector(cv.nome ? "input[name=senha]" : "input[name=nome]"); if (i) i.focus(); }, 60);
}

/* ---------------- #/senha/<token> ---------------- */
function telaSenha(ctx, token) {
  const { ui, api } = ctx;
  const h = ui.h;
  const m = ctx.marca || {};
  ctx.titulo("Nova senha");
  const erro = caixaMsg(ui);
  const form = h("form", { class: "entrar-form", novalidate: true },
    ui.campo({ rotulo: "Senha nova", nome: "senha", tipo: "senha", autocomplete: "new-password", obrigatorio: true, ajuda: "Pelo menos 8 caracteres." }),
    ui.campo({ rotulo: "Repita a senha nova", nome: "senha2", tipo: "senha", autocomplete: "new-password", obrigatorio: true }),
    erro,
    h("button", { type: "submit", class: "bt bt-prim bt-g bt-bloco" }, "Salvar senha"));
  const cartao = h("section", { class: "entrar-cartao", "aria-labelledby": "t-senha" },
    h("h1", { id: "t-senha" }, "Crie uma senha nova"),
    h("p", { class: "sub" }, "Depois de salvar, todas as sessões abertas com a senha antiga são encerradas."),
    form);
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    mostrar(erro, "");
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (!d.senha || d.senha.length < 8) return ui.marcarErro(form, "senha", "A senha precisa ter pelo menos 8 caracteres.");
    if (d.senha !== d.senha2) return ui.marcarErro(form, "senha2", "As duas senhas não são iguais.");
    const bt = form.querySelector("button[type=submit]");
    try {
      if (!/^[0-9a-f]{64}$/i.test(token)) throw Object.assign(new Error("link_invalido"), { codigo: "link_invalido" });
      await ui.carregando(bt, api.publica("nx_senha_redefinir", { p_link: token, p_senha: d.senha }));
      ui.limpar(cartao);
      cartao.append(
        h("h1", null, "Senha criada"),
        h("p", { class: "entrar-ok", role: "status" }, "Pronto. Entre com o seu e-mail e a senha nova."),
        h("div", { class: "entrar-form" }, h("a", { class: "bt bt-prim bt-g bt-bloco", href: "#/login" }, "Entrar")));
    } catch (e) {
      mostrar(erro, api.mensagemErro(e));
    }
  });
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(moldura(ctx, { titulo: m.login_titulo, cartao }));
  setTimeout(() => { const i = ctx.alvo.querySelector("input[name=senha]"); if (i) i.focus(); }, 60);
}

/* ---------------- troca obrigatória (conta.trocar_senha) ---------------- */
function telaTrocar(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const m = ctx.marca || {};
  ctx.titulo("Nova senha");
  const erro = caixaMsg(ui);
  const form = h("form", { class: "entrar-form", novalidate: true },
    ui.campo({ rotulo: "Senha atual", nome: "atual", tipo: "senha", autocomplete: "current-password", obrigatorio: true }),
    ui.campo({ rotulo: "Senha nova", nome: "nova", tipo: "senha", autocomplete: "new-password", obrigatorio: true, ajuda: "Pelo menos 8 caracteres." }),
    ui.campo({ rotulo: "Repita a senha nova", nome: "nova2", tipo: "senha", autocomplete: "new-password", obrigatorio: true }),
    erro,
    h("button", { type: "submit", class: "bt bt-prim bt-g bt-bloco" }, "Salvar e entrar"));
  const sair = h("button", { type: "button", class: "link" }, "Sair");
  sair.addEventListener("click", () => ctx.sair());
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    mostrar(erro, "");
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    if (!d.atual) return ui.marcarErro(form, "atual", "Informe a senha atual.");
    if (!d.nova || d.nova.length < 8) return ui.marcarErro(form, "nova", "A senha precisa ter pelo menos 8 caracteres.");
    if (d.nova !== d.nova2) return ui.marcarErro(form, "nova2", "As duas senhas não são iguais.");
    const bt = form.querySelector("button[type=submit]");
    try {
      await ui.carregando(bt, api.rpc("nx_senha_trocar", { p_atual: d.atual, p_nova: d.nova }));
      await ctx.aoTrocarSenha();
    } catch (e) { mostrar(erro, api.mensagemErro(e)); }
  });
  const cartao = h("section", { class: "entrar-cartao", "aria-labelledby": "t-trocar" },
    h("h1", { id: "t-trocar" }, "Troque a sua senha"),
    h("p", { class: "sub" }, "Por segurança, crie uma senha só sua antes de continuar."),
    form, h("div", { class: "entrar-rodape" }, sair));
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(moldura(ctx, { titulo: m.login_titulo, cartao }));
  setTimeout(() => { const i = ctx.alvo.querySelector("input[name=atual]"); if (i) i.focus(); }, 60);
}
