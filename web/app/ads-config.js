/* ============================================================
   ÓRBITA — ads-config.js (frente F6) · T14, grupo "Anúncios"
   Seção #/config/anuncios (só gestor/super — mostra a margem da gestão):
   · Integrações Meta/Google: credenciais tipo senha, nunca devolvidas
     ("✓ preenchido"), campo em branco = mantém (nx_integracao_salvar);
   · Metas e avisos: custo por conversa, orçamento, gestão, valor por
     serviço, destinos de WhatsApp, assinatura e regras do radar
     (nx_cliente_salvar — o servidor MESCLA o cfg);
   · "Atualizar dados agora" e envio manual de relatório (nx_executar).
   Mesmas regras do painel clássico (Ajustes), no visual do app.
   ============================================================ */

const CANAIS = {
  meta: {
    nome: "Meta (Instagram e Facebook)", curto: "Meta",
    campos: [["meta_access_token", "Token de acesso", true], ["meta_ad_account_id", "ID da conta de anúncios", false, "act_1234567890"],
      ["conta_nome", "Nome da conta (opcional)", false]],
  },
  google: {
    nome: "Google Ads", curto: "Google",
    campos: [["google_developer_token", "Developer token", true], ["google_customer_id", "ID do cliente (só números)", false, "1234567890"],
      ["google_login_customer_id", "ID da conta gerente — MCC (opcional)", false], ["google_client_id", "OAuth client ID", false],
      ["google_client_secret", "OAuth client secret", true], ["google_refresh_token", "Refresh token", true]],
  },
};
const REGRAS = [["r1", "Custo por conversa alto"], ["r2", "Campanha sem conversa"], ["r3", "Criativo com CTR baixo"], ["r4", "Fadiga de criativo"]];
const PADRAO = { cpaAlvo: 15, orcamento: 1500, fee: 997, assinatura: "" };
const soDigitos = s => String(s || "").replace(/\D/g, "");
/** Valor em reais digitado do jeito brasileiro: "1.500" → 1500 · "1.500,50" → 1500.5 · "15,5" → 15.5 ·
    "15.5" → 15.5 · "" → null. (O ui.lerMoeda leria "1.500" como 1,5 — orçamento de R$ 2.000 viraria R$ 2.) */
export function lerReais(s) {
  const t = String(s ?? "").replace(/[R$\s ]/g, "");
  if (!t) return null;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", "."))
    : /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, "")) : Number(t);
  return Number.isFinite(n) ? n : null;
}

export const secoesConfig = [
  { id: "anuncios", titulo: "Anúncios", grupo: "Anúncios", papelMin: "gestor", modulo: "ads", icone: "anuncio", montar: secaoAnuncios },
  { id: "formulario", titulo: "Formulário do site", grupo: "Anúncios", papelMin: "admin", modulo: "crm", icone: "contato", montar: secaoFormulario },
];

/* ============================================================
   Formulário do site (P1) — #/config/formulario
   O site do cliente manda o formulário direto para nx_lead_entrada (anon,
   com a chave do cliente): vira contato + negócio no funil padrão
   (origem "site"), a mensagem vira nota e os admins são avisados.
   ============================================================ */
/** Código de exemplo para colar no site (texto puro — a tela mostra por textContent). */
export function codigoExemplo({ url, apikey, chave }) {
  return `<form id="form-contato">
  <input name="nome" placeholder="Seu nome" required>
  <input name="telefone" placeholder="WhatsApp com DDD" required>
  <input name="email" type="email" placeholder="E-mail (opcional)">
  <textarea name="mensagem" placeholder="Como podemos ajudar?"></textarea>
  <button type="submit">Enviar</button>
</form>
<script>
document.getElementById("form-contato").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target, f = new FormData(form), u = new URLSearchParams(location.search);
  form.querySelector("button").disabled = true;
  let ok = false;
  try {
    const r = await fetch("${url}", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: "${apikey}" },
      body: JSON.stringify({ p_chave: "${chave}", p_dados: {
        nome: f.get("nome"), telefone: f.get("telefone"), email: f.get("email"),
        mensagem: f.get("mensagem"), servico: f.get("servico"),
        utm_source: u.get("utm_source"), utm_campaign: u.get("utm_campaign") } })
    });
    ok = r.ok;
  } catch (erro) { ok = false; }
  const aviso = document.createElement("p");
  aviso.textContent = ok ? "Recebemos! Vamos falar com você em breve." : "Não foi possível enviar agora. Tente de novo ou chame no WhatsApp.";
  if (ok) form.replaceWith(aviso); else { form.append(aviso); form.querySelector("button").disabled = false; }
});
</script>`;
}

/** Instruções para ligar um fluxo CodeWords ao endpoint público de entrada de leads do Órbita.
    A chave identifica um cliente; o endpoint não sincroniza o histórico da caixa de conversas. */
export function instrucoesCodeWords({ url, apikey, chave }) {
  const j = v => JSON.stringify(String(v ?? ""));
  return [
    "Crie no CodeWords um fluxo chamado ‘Novo lead qualificado → Órbita’.",
    "Use um gatilho de lead qualificado ou de cadastro concluído. Não envie em cada mensagem do WhatsApp: cada POST cria uma nova oportunidade no CRM.",
    "Antes de ativar, inspecione um evento de exemplo e mapeie os campos reais do gatilho para nome, telefone, e-mail, mensagem e serviço. Se não houver telefone nem e-mail, não envie.",
    "Quando o lead estiver qualificado, faça uma chamada HTTP POST com este destino e formato:",
    `URL: ${url}`,
    "Headers:",
    `  apikey: ${apikey}`,
    "  Content-Type: application/json",
    "Body JSON (troque os textos entre < > pelos campos do evento; não deixe placeholders no fluxo ativo):",
    "{",
    `  \"p_chave\": ${j(chave)},`,
    "  \"p_dados\": {",
    "    \"nome\": \"<nome do contato>\",",
    "    \"telefone\": \"<telefone com DDI e DDD>\",",
    "    \"email\": \"<e-mail, se disponível>\",",
    "    \"mensagem\": \"<resumo ou primeira mensagem, até 2000 caracteres>\",",
    "    \"servico\": \"<serviço de interesse, se disponível>\",",
    "    \"utm_source\": \"codewords-whatsapp\",",
    "    \"utm_campaign\": \"<nome do fluxo ou campanha>\"",
    "  }",
    "}",
    "Faça um teste com um contato fictício e confirme no CRM antes de ativar o fluxo.",
    "Limite conhecido: o lead entra no funil como origem ‘Site’, com codewords-whatsapp registrado na observação; esta integração não importa nem sincroniza mensagens na caixa Conversas do Órbita.",
  ].join("\n");
}

async function secaoFormulario(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ui.carregarCss("relatorios.css");
  ui.limpar(alvo);
  alvo.append(ui.esqueleto("cartoes", 2));
  let chave = null, D;
  try {
    const [mod, r] = await Promise.all([import(`../dados.js?v=${ctx.versao}`), api.rpcC("nx_entrada_chave", { p_gerar: false })]);
    D = mod; chave = (r && r.chave) || null;
  } catch (e) {
    ui.limpar(alvo);
    alvo.append(ui.erroCartao(e, () => secaoFormulario(ctx, alvo)));
    return;
  }
  const url = `${D.SUPA_URL}/rest/v1/rpc/nx_lead_entrada`;
  const V = ctx.vocab || {};
  const negocio = (typeof V.min === "function" ? V.min("negocio") : "negócio");
  const podeTestar = ctx.pode("admin");

  function pintar() {
    ui.limpar(alvo);
    alvo.append(h("header", { class: "pilha" }, h("h2", { class: "titulo-sec" }, "Formulário do site"),
      h("p", { class: "sub" }, `Quem preencher o formulário do seu site entra sozinho no CRM: vira contato e ${negocio} no funil padrão (origem “Site”), a mensagem vira nota e os administradores recebem um aviso.`)));

    // chave
    const cartaoChave = h("section", { class: "cartao pilha", "aria-labelledby": "cfgf-c" }, h("h3", { id: "cfgf-c", class: "titulo-sec" }, "Chave do formulário"));
    if (!chave) {
      const gerar = h("button", { type: "button", class: "bt bt-prim" }, "Gerar chave");
      gerar.addEventListener("click", async () => {
        try { chave = (await ui.carregando(gerar, api.rpcC("nx_entrada_chave", { p_gerar: true }))).chave; pintar(); ui.toast("Chave criada. Agora é só colar o código no site.", { tipo: "ok" }); }
        catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      });
      cartaoChave.append(h("p", { class: "sub" }, "Ainda não existe uma chave. Gere uma para ligar o formulário do site a esta empresa."), h("div", { class: "linha" }, gerar));
      alvo.append(cartaoChave);
      return;
    }
    const idK = "cfgf-chave";
    const inpK = h("input", { id: idK, type: "text", class: "mono cfgf-mono", readonly: true, value: chave, spellcheck: false });
    inpK.addEventListener("focus", () => inpK.select());
    const copiarK = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("copiar"), " Copiar chave");
    copiarK.addEventListener("click", () => ui.copiar(chave, { aviso: "Chave copiada." }));
    const trocar = h("button", { type: "button", class: "bt bt-fant" }, "Gerar nova chave");
    trocar.addEventListener("click", async () => {
      const ok = await ui.confirmar({ titulo: "Gerar uma chave nova?", perigo: true, rotulo: "Gerar nova chave",
        texto: "A chave atual para de funcionar na hora: o formulário do site só volta a mandar contatos quando o código for atualizado com a chave nova." });
      if (!ok) return;
      try { chave = (await ui.carregando(trocar, api.rpcC("nx_entrada_chave", { p_gerar: true }))).chave; pintar(); ui.toast("Chave nova gerada. Atualize o código no site.", { tipo: "ok" }); }
      catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    cartaoChave.append(
      h("p", { class: "sub" }, "Ela identifica esta empresa. Quem tiver a chave consegue mandar contatos para o seu CRM (até 30 por hora) — se ela vazar, gere outra."),
      h("div", { class: "campo" }, h("label", { for: idK }, "Chave"), inpK),
      h("div", { class: "linha cfga-exec" }, copiarK, trocar));
    alvo.append(cartaoChave);

    // CodeWords → CRM: usa a mesma entrada protegida do formulário, sem armazenar uma chave do CodeWords.
    const promptCodeWords = instrucoesCodeWords({ url, apikey: D.CHAVE_PUBLICA, chave });
    const preCodeWords = h("pre", { class: "cfgf-codigo", tabindex: "0", "aria-label": "Instruções para configurar o CodeWords" },
      h("code", {}, promptCodeWords));
    const copiarCodeWords = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("copiar"), " Copiar instruções para o CodeWords");
    copiarCodeWords.addEventListener("click", () => ui.copiar(promptCodeWords, { aviso: "Instruções copiadas. Cole no CodeWords e revise o mapeamento antes de ativar." }));
    alvo.append(h("section", { class: "cartao pilha", "aria-labelledby": "cfgf-cw" },
      h("h3", { id: "cfgf-cw", class: "titulo-sec" }, "Conectar com CodeWords"),
      h("p", { class: "sub" }, "Quando uma automação do CodeWords qualificar um novo contato, ela pode cadastrar esse lead no CRM do Órbita. Para este fluxo de entrada, você não precisa criar uma API key do CodeWords."),
      h("ol", { class: "cfgf-passos" },
        h("li", {}, "Copie as instruções abaixo e cole na conversa do Cody dentro do CodeWords."),
        h("li", {}, "Peça para ele conferir os campos do gatilho com um evento de teste e só então ativar."),
        h("li", {}, "O contato, a oportunidade e a mensagem/resumo aparecem no CRM; confira o resultado com um lead fictício.")),
      preCodeWords,
      h("div", { class: "linha" }, copiarCodeWords),
      h("p", { class: "campo-ajuda" }, "A chave de entrada é secreta e por cliente. Não publique estas instruções em um site ou repositório. Se vazar, gere outra chave nesta tela. O envio cria uma oportunidade por chamada; não configure o gatilho para disparar em cada mensagem.")));

    // instalação
    const codigo = codigoExemplo({ url, apikey: D.CHAVE_PUBLICA, chave });
    const pre = h("pre", { class: "cfgf-codigo", tabindex: "0", "aria-label": "Código de exemplo do formulário" }, h("code", {}, codigo));
    const copiarC = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("copiar"), " Copiar o código");
    copiarC.addEventListener("click", () => ui.copiar(codigo, { aviso: "Código copiado." }));
    const idU = "cfgf-url";
    const inpU = h("input", { id: idU, type: "text", class: "mono cfgf-mono", readonly: true, value: url, spellcheck: false });
    inpU.addEventListener("focus", () => inpU.select());
    const campos = [["nome", "obrigatório"], ["telefone", "WhatsApp com DDD — obrigatório se não houver e-mail"], ["email", "opcional"], ["mensagem", "vira uma nota"],
      [`servico`, `${(V.servico || "Serviço").toLowerCase()} de interesse, opcional`], ["utm_source, utm_campaign", "vão para a observação (de onde veio a visita)"]];
    alvo.append(h("section", { class: "cartao pilha", "aria-labelledby": "cfgf-i" },
      h("h3", { id: "cfgf-i", class: "titulo-sec" }, "Como instalar no site"),
      h("ol", { class: "cfgf-passos" },
        h("li", {}, "Copie o código abaixo e cole na página do site onde o formulário deve aparecer (quem cuida do site faz isso em 2 minutos)."),
        h("li", {}, "Ajuste o visual do formulário como quiser — só mantenha os nomes dos campos."),
        h("li", {}, "Faça um envio de teste e confira o contato novo no CRM.")),
      pre, h("div", { class: "linha" }, copiarC),
      h("div", { class: "campo" }, h("label", { for: idU }, "Endereço que recebe o formulário (POST, JSON)"), inpU),
      h("dl", { class: "cfgf-campos" }, campos.map(([k, t]) => [h("dt", { class: "mono" }, k), h("dd", {}, t)]))));

    // teste
    if (podeTestar) {
      const st = h("p", { class: "sub", role: "status" });
      const bt = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("enviar"), " Enviar um contato de teste");
      bt.addEventListener("click", async () => {
        st.textContent = "";
        try {
          await ui.carregando(bt, api.publica("nx_lead_entrada", { p_chave: chave, p_dados: {
            nome: "Teste do formulário (pode excluir)", email: "teste-formulario@exemplo.com", mensagem: "Envio de teste feito em Configurações → Formulário do site.", utm_source: "teste" } }));
          st.textContent = `Enviado. O ${negocio} “Teste do formulário (pode excluir)” entra no funil padrão e os administradores recebem o aviso.`;
        } catch (e) { st.textContent = api.mensagemErro(e); }
      });
      alvo.append(h("section", { class: "cartao pilha", "aria-labelledby": "cfgf-t" },
        h("h3", { id: "cfgf-t", class: "titulo-sec" }, "Testar"),
        h("p", { class: "sub" }, "Manda um contato de mentira pelo mesmo caminho do site, para conferir que está tudo ligado."),
        h("div", { class: "linha cfga-exec" }, bt, ctx.temModulo("crm") && ctx.pronto("crm") ? h("a", { class: "rel-link", href: "#/crm" }, "Abrir o CRM") : null), st));
    }
  }
  pintar();
}

async function secaoAnuncios(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ui.carregarCss("relatorios.css");
  ui.limpar(alvo);
  alvo.append(ui.esqueleto("cartoes", 3));
  let integ, dados;
  try {
    [integ, dados] = await Promise.all([api.rpcC("nx_integracoes_status", {}), api.rpcC("nx_dados", { p_dias: 7 })]);
  } catch (e) {
    ui.limpar(alvo);
    alvo.append(ui.erroCartao(e, () => secaoAnuncios(ctx, alvo)));
    return;
  }
  ui.limpar(alvo);
  const cliente = (dados && dados.cliente) || { id: ctx.cliente.id, slug: ctx.cliente.slug, nome: ctx.cliente.nome, cfg: {} };
  let cfg = cliente.cfg || {};
  integ = Array.isArray(integ) ? integ : [];

  alvo.append(
    h("header", { class: "pilha" }, h("h2", { class: "titulo-sec" }, "Anúncios"),
      h("p", { class: "sub" }, "Conexão com o Meta e o Google, metas do cliente e avisos no WhatsApp. Só a equipe de gestão vê esta seção.")));

  /* ---------- integrações ---------- */
  const caixaInteg = h("div", { class: "cfga-integ" });
  alvo.append(h("section", { class: "cartao pilha", "aria-labelledby": "cfga-i" },
    h("h3", { id: "cfga-i", class: "titulo-sec" }, "Integrações"),
    h("p", { class: "sub" }, "Cole as credenciais de cada plataforma. O que você digitar nunca volta para a tela: campo em branco mantém o valor salvo."),
    caixaInteg));
  const pintarInteg = () => { ui.limpar(caixaInteg); for (const canal of Object.keys(CANAIS)) caixaInteg.append(formCanal(canal)); };

  function formCanal(canal) {
    const d = CANAIS[canal], st = integ.find(i => i.canal === canal) || {}, pre = new Set(st.preenchidos || []);
    const erro = /^erro/i.test(st.status || ""), ok = /^ok/i.test(st.status || "");
    const status = !st.canal ? "Ainda não configurada."
      : st.ultimo_sync ? `Última leitura ${quandoSP(st.ultimo_sync)}${st.status ? ` · ${st.status}` : ""}` : (st.status || "Ainda não leu os anúncios.");
    const form = h("form", { class: "cfga-canal pilha", novalidate: true, dataset: { canal } },
      h("div", { class: "linha cfga-canal-cab" }, h("h4", { class: "cfga-canal-t" }, d.nome),
        ui.campo({ tipo: "interruptor", nome: "_ativo", rotulo: "Ligada", valor: !!st.ativo })),
      h("p", { class: ["cfga-st", erro && "cfga-st-ruim", ok && "cfga-st-ok"], role: "status" }, status),
      h("div", { class: "form-grade" }, d.campos.map(([k, rot, secreto, ph]) => ui.campo({
        nome: k, rotulo: pre.has(k) ? `${rot} · ✓ preenchido` : rot, tipo: secreto ? "senha" : "texto",
        placeholder: pre.has(k) ? "em branco = mantém o atual" : (ph || ""), autocomplete: secreto ? "new-password" : "off",
      }))),
      h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, `Salvar ${d.curto}`)));
    for (const i of form.querySelectorAll("input:not([type=checkbox])")) { i.spellcheck = false; i.setAttribute("autocapitalize", "off"); }
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const v = ui.lerForm(form), cred = {};
      for (const [k] of d.campos) if (v[k]) cred[k] = v[k];
      if (canal === "google" && cred.google_customer_id) cred.google_customer_id = soDigitos(cred.google_customer_id);
      if (canal === "google" && cred.google_login_customer_id) cred.google_login_customer_id = soDigitos(cred.google_login_customer_id);
      try {
        const r = await ui.carregando(form.querySelector("[type=submit]"),
          api.rpcC("nx_integracao_salvar", { p_canal: canal, p_cred: cred, p_ativo: !!v._ativo }));
        if (Array.isArray(r)) integ = r;
        else if (r && r.canal) integ = [...integ.filter(i => i.canal !== r.canal), r];
        pintarInteg();                                   // redesenha: credencial digitada não fica na tela
        ui.toast(`${d.curto} salvo. A próxima leitura já usa estes dados.`, { tipo: "ok" });
      } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
    });
    return form;
  }
  pintarInteg();

  /* ---------- metas e avisos ---------- */
  const V = ctx.vocab || {};
  const servicoRot = (V.servico || "Serviço");
  const tickets = h("div", { class: "cfga-tickets pilha" });
  const linhaTicket = (s = "", val = "") => {
    const nome = h("input", { type: "text", class: "cfga-tk-s", value: s, placeholder: servicoRot, "aria-label": servicoRot, maxlength: 60 });
    const valor = h("input", { type: "text", class: "cfga-tk-v", value: val === "" ? "" : String(val).replace(".", ","), inputmode: "decimal", placeholder: "R$", "aria-label": `Valor de ${s || servicoRot.toLowerCase()} em reais` });
    const x = h("button", { type: "button", class: "bt-icone", "aria-label": `Remover ${s || servicoRot.toLowerCase()}` }, ui.icone("fechar"));
    const linha = h("div", { class: "cfga-tk" }, nome, valor, x);
    x.addEventListener("click", () => { linha.remove(); (tickets.querySelector("input") || addTk).focus(); });
    return linha;
  };
  const addTk = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("mais"), ` ${servicoRot}`);
  addTk.addEventListener("click", () => { const l = linhaTicket(); tickets.append(l); l.querySelector("input").focus(); });

  const off = new Set(cfg.regrasOff || []);
  const lista = v => [].concat(v || []).join("\n");
  const form = h("form", { class: "pilha", novalidate: true },
    h("div", { class: "form-grade" },
      ui.campo({ nome: "nomeCurto", rotulo: "Nome curto (relatórios)", valor: cfg.nomeCurto || "", placeholder: `ex.: ${String(cliente.nome || "").split(" ")[0]}`, max: 40 }),
      ui.campo({ nome: "assinatura", rotulo: "Assinatura do resumo do mês", valor: cfg.assinatura || PADRAO.assinatura, max: 120 }),
      ui.campo({ nome: "cpaAlvo", rotulo: "Meta de custo por conversa (R$)", tipo: "moeda", valor: +(cfg.cpaAlvo ?? PADRAO.cpaAlvo), ajuda: "O radar avisa quando passa de 35% acima." }),
      ui.campo({ nome: "orcamento", rotulo: "Orçamento de anúncios do mês (R$)", tipo: "moeda", valor: +(cfg.orcamento ?? PADRAO.orcamento) }),
      ui.campo({ nome: "fee", rotulo: "Gestão mensal (R$)", tipo: "moeda", valor: +(cfg.fee ?? PADRAO.fee), ajuda: "Entra no “Cada R$ 1 investido virou”." })),
    h("div", { class: "pilha" }, h("p", { class: "rotulo" }, `Valor de cada ${servicoRot.toLowerCase()}`),
      h("p", { class: "sub" }, "Estima a receita quando o valor fechado não foi informado."), tickets, h("div", {}, addTk)),
    h("div", { class: "form-grade" },
      ui.campo({ nome: "waGestor", rotulo: "WhatsApp da gestão (avisos e diário)", tipo: "textarea", linhas: 2, valor: lista(cfg.waGestor), placeholder: "5512999998888", ajuda: "Um número por linha, com DDD." }),
      ui.campo({ nome: "waCliente", rotulo: "WhatsApp do cliente (resumo do mês)", tipo: "textarea", linhas: 2, valor: lista(cfg.waCliente), placeholder: "5512997552370", ajuda: "Um número por linha, com DDD." })),
    h("fieldset", { class: "pilha cfga-regras" }, h("legend", { class: "rotulo" }, "Regras do radar"),
      REGRAS.map(([id, n]) => ui.campo({ tipo: "interruptor", nome: `rg_${id}`, rotulo: n, valor: !off.has(id) }))),
    h("div", { class: "linha linha-fim" }, h("button", { type: "submit", class: "bt bt-prim" }, "Salvar metas e avisos")));
  const tk = cfg.ticket && typeof cfg.ticket === "object" ? cfg.ticket : {};
  for (const [s, v] of Object.entries(tk)) tickets.append(linhaTicket(s, v));
  if (!Object.keys(tk).length) tickets.append(linhaTicket());
  alvo.append(h("section", { class: "cartao pilha", "aria-labelledby": "cfga-m" }, h("h3", { id: "cfga-m", class: "titulo-sec" }, "Metas e avisos"), form));

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    ui.marcarErro(form, null);
    const v = ui.lerForm(form);
    const reais = n => lerReais((form.querySelector(`[name="${n}"]`) || {}).value);
    const cpa = reais("cpaAlvo"), orc = reais("orcamento"), fee = reais("fee");
    if (!(cpa > 0)) return ui.marcarErro(form, "cpaAlvo", "Informe a meta de custo por conversa (maior que zero).");
    if (!(orc >= 0)) return ui.marcarErro(form, "orcamento", "Informe o orçamento do mês.");
    if (!(fee >= 0)) return ui.marcarErro(form, "fee", "Informe o valor da gestão (pode ser zero).");
    const numeros = s => [...new Set(String(s || "").split(/[\n,;]+/).map(soDigitos).filter(n => n.length >= 10))];
    for (const campo of ["waGestor", "waCliente"]) {
      const brutos = String(v[campo] || "").split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);
      if (brutos.some(b => soDigitos(b).length < 10)) return ui.marcarErro(form, campo, "Cada número precisa de DDD (10 ou mais dígitos).");
    }
    const ticket = {};
    for (const l of tickets.querySelectorAll(".cfga-tk")) {
      const s = l.querySelector(".cfga-tk-s").value.trim(), val = lerReais(l.querySelector(".cfga-tk-v").value);
      if (s && val != null && val >= 0) ticket[s] = val;
    }
    const regrasOff = REGRAS.map(([id]) => id).filter(id => !v[`rg_${id}`]);
    const novo = { nomeCurto: v.nomeCurto || "", assinatura: v.assinatura || "", cpaAlvo: cpa, orcamento: orc, fee,
                   ticket, waGestor: numeros(v.waGestor), waCliente: numeros(v.waCliente), regrasOff };
    try {
      const r = await ui.carregando(form.querySelector("[type=submit]"),
        api.rpc("nx_cliente_salvar", { p_cliente: { id: cliente.id, slug: cliente.slug || ctx.cliente.slug, nome: cliente.nome || ctx.cliente.nome, cfg: novo } }));
      cfg = (r && r.cfg) || { ...cfg, ...novo };
      ui.toast("Metas e avisos salvos. Os números do Anúncios usam as metas novas na próxima abertura.", { tipo: "ok" });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  });

  /* ---------- atualizar agora ---------- */
  const st = h("p", { class: "sub", role: "status" });
  const bCiclo = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("raio"), " Atualizar dados agora");
  const bDia = h("button", { type: "button", class: "bt bt-fant" }, "Enviar o relatório do dia");
  const bMes = h("button", { type: "button", class: "bt bt-fant" }, "Enviar o resumo do mês");
  const executar = async (tipo, btn) => {
    if (tipo !== "ciclo") {
      const dest = (tipo === "mensal" ? [...(cfg.waCliente || []), ...(cfg.waGestor || [])] : (cfg.waGestor || [])).length;
      if (!dest) { st.textContent = "Cadastre um WhatsApp de destino em Metas e avisos antes de enviar."; return; }
      const ok = await ui.confirmar({ titulo: tipo === "mensal" ? "Enviar o resumo do mês?" : "Enviar o relatório do dia?",
        texto: `Ele sai agora no WhatsApp de ${dest} ${dest === 1 ? "destino" : "destinos"}, mesmo que já tenha sido enviado hoje.`, rotulo: "Enviar" });
      if (!ok) return;
    }
    const [tarefa, corpo] = tipo === "ciclo" ? ["nx-ciclo", { cliente: cliente.id }] : ["nx-relatorio", { tipo, cliente: cliente.id, forcar: true }];
    try {
      await ui.carregando(btn, api.rpc("nx_executar", { p_tarefa: tarefa, p_corpo: corpo }));
      const hh = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date());
      st.textContent = tipo === "ciclo"
        ? `Pedido enviado às ${hh}. Os números novos aparecem em 1 ou 2 minutos — depois use "Atualizar" no Anúncios.`
        : `Pedido enviado às ${hh}. O ${tipo === "mensal" ? "resumo do mês" : "relatório do dia"} chega no WhatsApp em instantes.`;
    } catch (e) { st.textContent = api.mensagemErro(e); }
  };
  bCiclo.addEventListener("click", () => executar("ciclo", bCiclo));
  bDia.addEventListener("click", () => executar("diario", bDia));
  bMes.addEventListener("click", () => executar("mensal", bMes));
  alvo.append(h("section", { class: "cartao pilha", "aria-labelledby": "cfga-x" },
    h("h3", { id: "cfga-x", class: "titulo-sec" }, "Atualizar agora"),
    h("p", { class: "sub" }, "O sistema lê os anúncios de hora em hora e manda o relatório do dia às 8h. Use estes botões só quando precisar antes disso."),
    h("div", { class: "linha cfga-exec" }, bCiclo, bDia, bMes), st,
    h("a", { class: "rel-link", href: "#/anuncios" }, "Abrir o Anúncios")));
}

function quandoSP(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  const f = o => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).format(d);
  const dia = f({ day: "2-digit", month: "2-digit", year: "numeric" }), hoje = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
  return `${dia === hoje ? "hoje" : `em ${f({ day: "2-digit", month: "2-digit" })}`} às ${f({ hour: "2-digit", minute: "2-digit" })}`;
}
