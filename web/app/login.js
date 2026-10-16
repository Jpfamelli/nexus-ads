/* ============================================================
   ÓRBITA — login.js · frente F3 · ESPEC T1 (§7.7), §5.2
   #/login · #/convite/<token> · #/senha/<token> · troca obrigatória
   Sem cadastro aberto. A tela nunca pergunta ao servidor se um
   e-mail existe. Marca da org (nx_marca_publica / nx_convite_ver).
   ============================================================ */

let _ctx = null;
const _relogios = new Set();   // contagem regressiva do bloqueio (A9): some ao desmontar

export async function montar(ctx) {
  _ctx = ctx;
  const { rota } = ctx;
  if (rota.modulo === "convite") return telaConvite(ctx, rota.partes[0] || "");
  if (rota.modulo === "senha") return telaSenha(ctx, rota.partes[0] || "");
  if (rota.modulo === "trocar") return telaTrocar(ctx);
  return telaEntrar(ctx);
}

export function desmontar() { _ctx = null; for (const t of _relogios) clearInterval(t); _relogios.clear(); }

/** Plano 100 · A9 (contrato 10): `muitas_tentativas` chega com o hint em minutos → segundos de bloqueio (padrão 15 min). */
export function segundosDeBloqueio(e, minutosDoHint) {
  const min = typeof minutosDoHint === "function" ? minutosDoHint(e && e.hint) : null;
  return (min || 15) * 60;
}
/** «14:59» para a contagem regressiva. */
export function formatarContagem(segundos) {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Plano 1000 (AS-202): a marca é a padrão da plataforma (produto «Órbita» ou sem nome próprio)? Revenda com nome próprio → false. */
export function marcaPadrao(m) {
  const p = String((m && m.produto) || "").trim();
  return !p || p === "Órbita";
}
/** Plano 1000 (AS-291): o e-mail como o servidor compara — sem espaços nas pontas (autopreenchimento) e em minúsculas. */
export function normalizarEmail(v) { return String(v ?? "").trim().toLowerCase(); }
/** Plano 1000 (AS-195): formato mínimo de e-mail antes de gastar uma tentativa no servidor («ana@» não sai daqui). */
export function emailValido(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? "")); }
/** Toque (celular/tablet): o foco automático abriria o teclado por cima da marca (AS-203). */
function toque() { try { return typeof matchMedia === "function" && !!matchMedia("(pointer: coarse)").matches; } catch { return false; } }
/** Foca o campo só com mouse/teclado (AS-203). */
function focarDepois(ctx, seletor) {
  if (toque()) return;
  setTimeout(() => { const i = ctx.alvo && ctx.alvo.querySelector(seletor); if (i) i.focus(); }, 60);
}

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
  // plano 1000 (AS-202): a régua «Anúncio · Conversa · Venda» e as pílulas são o discurso da Órbita — numa marca de revenda não aparecem
  const padrao = marcaPadrao(m);
  const arte = h("section", { class: "entrar-arte", "aria-label": m.produto || "Órbita" },
    marcaEl,
    padrao ? h("p", { class: "entrar-regua", "aria-hidden": "true" }, h("i"), h("span", { class: "selo-caps" }, "Anúncio · Conversa · Venda")) : null,   // régua editorial acima da manchete (plano 50 · A14)
    tituloEl,
    sub ? h("p", { class: "entrar-sub" }, sub) : null,
    h("div", { class: "entrar-orbita", "aria-hidden": "true" }, h("i", { class: "o1" }), h("i", { class: "o2" }), h("i", { class: "p" }), h("i", { class: "l l1" }), h("i", { class: "l l2" }), h("i", { class: "l l3" })),
    padrao ? h("div", { class: "entrar-pontos", "aria-hidden": "true" },
      ui.pilula("WhatsApp oficial", "prim", { icone: "whatsapp" }), ui.pilula("Funil de vendas", "sec", { icone: "funil" }), ui.pilula("Retorno do anúncio", "neutra", { icone: "anuncio" })) : null);
  return h("main", { class: "entrar", id: "vista-publica" }, arte, cartao);
}

function caixaMsg(ui) { return ui.h("p", { class: "entrar-erro", role: "alert", hidden: true }); }
function mostrar(el, texto) { el.textContent = texto || ""; el.hidden = !texto; }

/** Plano 1000 (AS-201): o caminho de «Esqueci a senha». Sem WhatsApp de suporte na marca, quem é o único administrador não fica sem saída:
    a frase aponta para quem fornece o sistema (a revenda/plataforma da marca deste endereço). */
export function textosEsqueci(ctx, m) {
  const base = "Peça ao administrador da sua empresa um link para criar uma senha nova.";
  if (m && m.suporte_wa) return [base];
  const org = ctx && ctx.marcaPublica && ctx.marcaPublica.org && ctx.marcaPublica.org.nome;
  const quem = org ? `a equipe da ${String(org).slice(0, 80)}` : `quem fornece o ${(m && m.produto) || "Órbita"} para a sua empresa`;
  return [base, `Se você é o administrador, fale com ${quem}: só a plataforma gera um link novo para o administrador.`];
}

/* ---------------- #/login ---------------- */
function telaEntrar(ctx) {
  const { ui, api } = ctx;
  const h = ui.h;
  const m = ctx.marca || {};
  ctx.titulo("Entrar");
  const erro = caixaMsg(ui);
  // o botão mostra o que está acontecendo («Entrando…» com o giro ao lado) em vez de sumir o texto (plano 50 · A14)
  const rotuloBt = h("span", { class: "bt-rotulo" }, "Entrar");
  const botao = h("button", { type: "submit", class: "bt bt-prim bt-g bt-bloco bt-carrega" }, rotuloBt);
  // plano 1000 (AS-185): «Lembrar neste aparelho» desmarcado = aparelho compartilhado — as respostas guardadas (contatos, telefones) ficam só na
  // memória da aba, nunca no disco do aparelho
  const lembrar = typeof ctx.aparelhoCompartilhado === "function"
    ? ui.campo({ rotulo: "Lembrar neste aparelho", nome: "lembrar", tipo: "checkbox", valor: !ctx.aparelhoCompartilhado(),
      ajuda: "Desmarque em computador compartilhado: os dados da tela não ficam guardados aqui." }) : null;
  const form = h("form", { class: "entrar-form", novalidate: true },
    ui.campo({ rotulo: "E-mail", nome: "email", tipo: "email", autocomplete: "username", obrigatorio: true, inputmode: "email" }),
    ui.campo({ rotulo: "Senha", nome: "senha", tipo: "senha", autocomplete: "current-password", obrigatorio: true }),
    lembrar,
    erro,
    botao);
  const esqueci = h("button", { type: "button", class: "link", "aria-expanded": "false" }, "Esqueci a senha");
  const ajuda = h("div", { class: "aviso", hidden: true, role: "status" }, ui.icone("info"),
    h("div", { class: "pilha-p" }, textosEsqueci(ctx, m).map(t => h("p", null, t)),
      m.suporte_wa ? h("a", { class: "bt bt-sec bt-p", href: ui.linkWhatsApp("Olá! Preciso de ajuda para entrar no sistema.", m.suporte_wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Falar com o suporte") : null));
  esqueci.addEventListener("click", () => { ajuda.hidden = !ajuda.hidden; esqueci.setAttribute("aria-expanded", String(!ajuda.hidden)); });
  // plano 100 · A9: depois da 3ª senha errada o caminho de recuperação fica em destaque e já aberto (quem erra 3 vezes não lembra a senha)
  let falhas = 0;
  const destacarEsqueci = () => {
    esqueci.classList.add("entrar-destaque");
    if (ajuda.hidden) { ajuda.hidden = false; esqueci.setAttribute("aria-expanded", "true"); }
  };
  // bloqueio por tentativas (contrato 10): o botão espera o prazo com a contagem visível; o leitor de tela ouve a frase uma vez (a contagem é aria-hidden)
  const contagem = h("span", { class: "entrar-contagem dado", "aria-hidden": "true" });
  const bloquear = e => {
    let restam = segundosDeBloqueio(e, api.minutosDoHint);
    botao.disabled = true;
    mostrar(erro, api.mensagemErro(e));
    erro.append(" ", contagem);
    const pintar = () => { contagem.textContent = `(${formatarContagem(restam)})`; };
    pintar();
    const t = setInterval(() => {
      restam -= 1;
      if (restam > 0) { pintar(); return; }
      clearInterval(t); _relogios.delete(t);
      botao.disabled = false;
      mostrar(erro, "Pode tentar de novo.");
      // plano 1000 (AS-200): o foco volta ao campo de senha e o leitor de tela ouve que já pode tentar
      const s = form.querySelector("input[name=senha]");
      if (s && s.isConnected) try { s.focus({ preventScroll: true }); } catch { s.focus(); }
      if (typeof ui.anunciar === "function") ui.anunciar("Pode tentar de novo.");
    }, 1000);
    _relogios.add(t);
    destacarEsqueci();
  };

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (botao.disabled) return;
    mostrar(erro, "");
    ui.marcarErro(form, null);
    const d = ui.lerForm(form);
    const email = normalizarEmail(d.email);
    if (!email) return ui.marcarErro(form, "email", "Informe o e-mail.");
    // AS-195: «ana@» não vai ao servidor (não conta tentativa nem aproxima o bloqueio)
    if (!emailValido(email)) return ui.marcarErro(form, "email", "Confira o e-mail (exemplo: nome@empresa.com.br).");
    if (!d.senha) return ui.marcarErro(form, "senha", "Informe a senha.");
    const bt = form.querySelector("button[type=submit]");
    rotuloBt.textContent = "Entrando…";
    try {
      const r = await ui.carregando(bt, api.publica("nx_entrar", { p_email: email, p_senha: d.senha }));
      if (!r || !r.token) throw Object.assign(new Error("credenciais_invalidas"), { codigo: "credenciais_invalidas" });
      rotuloBt.textContent = "Abrindo…";
      await ctx.aoEntrar(r.token, lembrar ? { compartilhado: d.lembrar === false } : {});
    } catch (e) {
      rotuloBt.textContent = "Entrar";
      const msg = api.mensagemErro(e);
      // plano 1000b · UB-157: a senha só é apagada quando o problema é ELA (credenciais/tentativas); sem internet ou servidor lento ela fica no campo
      const s = form.querySelector("input[name=senha]"); if (s && e && (e.codigo === "credenciais_invalidas" || e.codigo === "muitas_tentativas")) s.value = "";
      // senha ou e-mail errados: o erro fica colado no campo de senha (inline) e o foco volta para lá; erro de rede/servidor usa a caixa
      if (e && e.codigo === "credenciais_invalidas") ui.marcarErro(form, "senha", msg);
      else if (e && e.codigo === "muitas_tentativas") bloquear(e);
      else { mostrar(erro, msg); if (s) s.focus(); }
      if (e && e.codigo === "credenciais_invalidas" && ++falhas >= 3) destacarEsqueci();
    }
  });

  const prod = ctx.produtoAberto;
  const cartao = h("section", { class: "entrar-cartao", "aria-labelledby": "t-entrar" },
    prod ? h("p", { class: "entrar-produto" }, ui.icone(prod.icone), h("span", null, h("b", null, prod.titulo), " · ", prod.resumo)) : null,
    h("p", { class: "entrar-kicker selo-caps", "aria-hidden": "true" }, m.produto || "Órbita"),
    h("h1", { id: "t-entrar" }, "Entrar"),
    h("p", { class: "sub" }, m.login_texto || "Entre com o e-mail e a senha que você recebeu."),
    form,
    h("div", { class: "entrar-rodape" }, esqueci),
    ajuda);
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(moldura(ctx, { titulo: m.login_titulo, sub: null, cartao }));
  focarDepois(ctx, "input[name=email]");
}

/** Plano 1000b · UB-162: convite feito para um e-mail → o campo vem somente leitura (o servidor aceita só esse); sem e-mail, campo livre. */
export function campoEmailDoConvite(ui, email) {
  const fixo = !!String(email || "").trim();
  const c = ui.campo({ rotulo: "E-mail", nome: "email", tipo: "email", valor: email || "", autocomplete: "username", obrigatorio: true,
    ajuda: fixo ? "O convite é para este e-mail." : undefined });
  const inp = c.querySelector("input");
  if (fixo && inp) { inp.setAttribute("readonly", ""); inp.readOnly = true; }
  return c;
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
    // plano 1000b · UB-166: com WhatsApp de suporte na marca, um caminho para pedir um convite novo
    const wa = ctx.marca && ctx.marca.suporte_wa;
    const suporte = wa ? h("a", { class: "bt bt-sec", href: ui.linkWhatsApp("Olá! Meu convite para o sistema não abre. Pode me mandar um novo?", wa), target: "_blank", rel: "noopener noreferrer" }, ui.icone("whatsapp"), "Falar com o suporte") : null;
    ctx.alvo.appendChild(moldura(ctx, {
      titulo: (ctx.marca && ctx.marca.login_titulo) || "", cartao: h("section", { class: "entrar-cartao" },
        h("h1", null, "Convite indisponível"), h("p", { class: "sub" }, api.mensagemErro(e)), h("div", { class: "entrar-form" }, ir, suporte)),
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
    campoEmailDoConvite(ui, cv.email),
    // plano 1000 (AS-197): medidor de força e «Repita a senha» — um erro de digitação ao criar a conta deixava a pessoa trancada
    ui.campo({ rotulo: "Senha", nome: "senha", tipo: "senha", autocomplete: "new-password", obrigatorio: true, ajuda: "Pelo menos 8 caracteres.", validar: "senha" }),
    ui.campo({ rotulo: "Repita a senha", nome: "senha2", tipo: "senha", autocomplete: "new-password", obrigatorio: true }),
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
    const email = normalizarEmail(d.email);
    if (!emailValido(email)) return ui.marcarErro(form, "email", "Esse e-mail não parece válido.");
    if (!d.senha || d.senha.length < 8) return ui.marcarErro(form, "senha", "A senha precisa ter pelo menos 8 caracteres.");
    if (d.senha !== d.senha2) return ui.marcarErro(form, "senha2", "As duas senhas não são iguais.");
    const bt = form.querySelector("button[type=submit]");
    try {
      const r = await ui.carregando(bt, api.publica("nx_convite_aceitar", { p_convite: token, p_nome: d.nome, p_email: email, p_senha: d.senha }));
      await ctx.aoEntrar(r.token, { cliente_id: r.cliente_id || null });
    } catch (e) {
      // plano 1000b · UB-165: o convite deixou de valer (vencido, já usado, cancelado) → o formulário morto dá lugar ao motivo e ao caminho
      if (e && e.codigo === "convite_invalido" && e.hint !== "conta_existente") {
        const novo = cartaoLinkMorto(ui, "t-convite", "Este convite não vale mais", `${api.mensagemErro(e)} Peça um convite novo a quem convidou você.`);
        const pai = cartao.parentNode; if (pai) { pai.insertBefore(novo, cartao); cartao.remove(); }
        const ir = novo.querySelector("a.bt-prim"); if (ir) ir.focus();
        return;
      }
      mostrar(erro, api.mensagemErro(e));
      if (e.codigo === "credenciais_invalidas") { const s = form.querySelector("input[name=senha]"); if (s) { s.value = ""; s.focus(); } }
    }
  });

  // plano 1000b · UB-163: o servidor que mandar a validade (expira_em) mostra até quando o convite vale (o atual não manda: nada aparece)
  const expira = cv && typeof cv.expira_em === "string" && !Number.isNaN(Date.parse(cv.expira_em)) ? cv.expira_em : null;
  const cartao = h("section", { class: "entrar-cartao", "aria-labelledby": "t-convite" },
    h("h1", { id: "t-convite" }, "Você foi convidado"),
    h("div", { class: "entrar-convite" }, ui.icone("convidar"),
      h("p", null, cv.papel === "gestor" ? "Para gerenciar " : "Para ", h("b", null, destinoTxt), " como ", h("b", null, papelTxt), "."),
      expira ? h("p", { class: "fraco entrar-validade" }, `Vale até ${ui.dataCurtaBR(expira)} ${ui.horaBR(expira)}.`) : null),
    form);
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(moldura(ctx, { titulo: marca.login_titulo, cartao, marca }));
  focarDepois(ctx, cv.nome ? "input[name=senha]" : "input[name=nome]");
}

/** plano 1000b · UB-159/UB-165: cartão de link/convite que não vale mais — o motivo e o caminho para a entrada (nada de formulário morto). */
function cartaoLinkMorto(ui, idTitulo, titulo, texto, extra = null) {
  const h = ui.h;
  return h("section", { class: "entrar-cartao", "aria-labelledby": idTitulo },
    h("h1", { id: idTitulo }, titulo),
    h("p", { class: "sub" }, texto),
    h("div", { class: "entrar-form" }, h("a", { class: "bt bt-prim bt-g bt-bloco", href: "#/login" }, "Ir para a entrada"), extra));
}

/* ---------------- #/senha/<token> ---------------- */
function telaSenha(ctx, token) {
  const { ui, api } = ctx;
  const h = ui.h;
  const m = ctx.marca || {};
  ctx.titulo("Nova senha");
  // plano 1000b · UB-159: link com formato que nunca valeria (#/senha/abc) não mostra formulário para digitar duas vezes à toa
  if (!/^[0-9a-f]{64}$/i.test(String(token || ""))) {
    ui.limpar(ctx.alvo);
    ctx.alvo.appendChild(moldura(ctx, { titulo: m.login_titulo, cartao: cartaoLinkMorto(ui, "t-senha", "Este link não vale mais",
      "O link de nova senha está incompleto ou já foi usado. Peça outro ao administrador da sua empresa.") }));
    focarDepois(ctx, "a.bt-prim");
    return;
  }
  const erro = caixaMsg(ui);
  const form = h("form", { class: "entrar-form", novalidate: true },
    // plano 1000b · UB-158: o mesmo medidor de força do convite
    ui.campo({ rotulo: "Senha nova", nome: "senha", tipo: "senha", autocomplete: "new-password", obrigatorio: true, ajuda: "Pelo menos 8 caracteres.", validar: "senha" }),
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
      const r = await ui.carregando(bt, api.publica("nx_senha_redefinir", { p_link: token, p_senha: d.senha }));
      // plano 1000b · UB-164: o servidor que devolver uma sessão nova já entra direto (por detecção; o atual não devolve e cai no «Entrar»)
      if (r && typeof r === "object" && typeof r.token === "string" && r.token && typeof ctx.aoEntrar === "function") { await ctx.aoEntrar(r.token, {}); return; }
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
  focarDepois(ctx, "input[name=senha]");
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
    ui.campo({ rotulo: "Senha nova", nome: "nova", tipo: "senha", autocomplete: "new-password", obrigatorio: true, ajuda: "Pelo menos 8 caracteres.", validar: "senha" }),   // plano 1000b · UB-158
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
    // plano 1000b · UB-160: repetir a senha que o administrador criou não protege nada — erro aqui, sem gastar chamada
    if (d.nova === d.atual) return ui.marcarErro(form, "nova", "Use uma senha diferente da que o administrador criou.");
    const bt = form.querySelector("button[type=submit]");
    try {
      await ui.carregando(bt, api.rpc("nx_senha_trocar", { p_atual: d.atual, p_nova: d.nova }));
      await ctx.aoTrocarSenha();
    } catch (e) {
      // plano 1000b · UB-161: senha atual errada fica colada no campo «Senha atual» (como no Perfil), com o foco nele
      if (e && e.codigo === "credenciais_invalidas") {
        ui.marcarErro(form, "atual", "A senha atual não confere.");
        const a = form.querySelector("input[name=atual]"); if (a) { a.value = ""; a.focus(); }
      } else mostrar(erro, api.mensagemErro(e));
    }
  });
  const cartao = h("section", { class: "entrar-cartao", "aria-labelledby": "t-trocar" },
    h("h1", { id: "t-trocar" }, "Troque a sua senha"),
    // plano 1000 (AS-263): diz o motivo — a senha atual foi criada por outra pessoa
    h("p", { class: "sub" }, "Sua senha foi criada por um administrador. Crie uma que só você saiba."),
    form, h("div", { class: "entrar-rodape" }, sair));
  ui.limpar(ctx.alvo);
  ctx.alvo.appendChild(moldura(ctx, { titulo: m.login_titulo, cartao }));
  focarDepois(ctx, "input[name=atual]");
}
