/* ============================================================
   ÓRBITA — instalação do rastreio do site · F8
   A chave identifica a empresa e é publicada no próprio site.
   ============================================================ */

export const secoesConfig = [
  { id: "rastreio", titulo: "Site e anúncios", desc: "Script que diz de qual campanha veio o contato", grupo: "Anúncios", papelMin: "admin", modulo: "crm", icone: "anuncio", montar: secaoRastreio },
];

async function secaoRastreio(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ui.carregarCss("agenda");
  ui.limpar(alvo);
  alvo.appendChild(ui.esqueleto("cartoes", 2));

  let chave;
  try {
    const resultado = await api.rpcC("nx_entrada_chave", { p_gerar: false });
    chave = resultado && resultado.chave || null;
  } catch (e) {
    ui.limpar(alvo);
    alvo.appendChild(ui.erroCartao(e, () => secaoRastreio(ctx, alvo)));
    return;
  }

  const raiz = h("div", { class: "agc rastc" });
  function pintar() {
    ui.limpar(alvo);
    const intro = h("header", { class: "pilha" },
      h("h2", { class: "titulo-sec" }, "Acompanhe de onde vêm os contatos"),
      h("p", { class: "sub" }, "Instale um pequeno script no site. Ele identifica a campanha quando alguém inicia uma conversa pelo WhatsApp e, com o canal CodeWords conectado, associa a origem ao negócio no CRM."));
    const instalacao = h("section", { class: "cartao pilha", "aria-labelledby": "rastc-instala" },
      h("div", { class: "cartao-cab" }, h("div", null,
        h("h3", { id: "rastc-instala", class: "titulo-sec" }, "Código de instalação"),
        h("p", { class: "sub" }, "Cole uma vez no site, antes do fechamento da tag `</body>`. Funciona em HTML, WordPress, Wix e Webflow."))));

    if (!chave) {
      const gerar = h("button", { type: "button", class: "bt bt-prim", on: { click: async () => {
        try {
          chave = (await ui.carregando(gerar, api.rpcC("nx_entrada_chave", { p_gerar: true }))).chave;
          pintar(); ui.toast("Chave criada. Copie o código para instalar no site.", { tipo: "ok" });
        } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
      } } }, ui.icone("mais"), "Gerar chave de instalação");
      instalacao.append(h("p", { class: "sub" }, "Esta empresa ainda não tem uma chave de entrada. Gere uma para identificar os cliques do site."), gerar);
    } else {
      const codigo = `<script src="https://jpfamelli.github.io/nexus-ads/rastreio.js" data-chave="${chave}" defer></script>`;
      const pre = h("pre", { class: "rastc-codigo", tabindex: "0", "aria-label": "Código de instalação do rastreio" }, h("code", null, codigo));
      const copiar = h("button", { type: "button", class: "bt bt-prim", on: { click: () => ui.copiar(codigo, { aviso: "Código de instalação copiado." }) } }, ui.icone("copiar"), "Copiar código");
      const campoChave = h("input", { class: "mono", type: "text", readonly: true, value: chave, "aria-label": "Chave pública de instalação", spellcheck: false });
      const copiarChave = h("button", { type: "button", class: "bt bt-sec", on: { click: () => ui.copiar(chave, { aviso: "Chave copiada." }) } }, ui.icone("copiar"), "Copiar chave");
      const trocar = h("button", { type: "button", class: "bt bt-fant", on: { click: () => trocarChave(trocar) } }, "Gerar nova chave");
      instalacao.append(pre, h("div", { class: "linha rastc-acoes" }, copiar),
        h("div", { class: "campo rastc-chave" }, h("label", null, "Chave desta empresa"), campoChave),
        h("div", { class: "linha rastc-acoes" }, copiarChave, trocar),
        h("p", { class: "campo-ajuda" }, "A chave aparece no código instalado no site. Se alguém a usar fora do esperado, gere outra e atualize o script."));

      const urlGoogle = "utm_source=google&utm_medium=cpc&utm_campaign=nome-da-campanha&utm_content=nome-do-anuncio&utm_term=palavra-chave";
      const urlMeta = "utm_source=instagram&utm_medium=paid_social&utm_campaign=nome-da-campanha&utm_content=nome-do-anuncio";
      const parametros = h("section", { class: "cartao pilha", "aria-labelledby": "rastc-parametros" },
        h("h3", { id: "rastc-parametros", class: "titulo-sec" }, "Parâmetros para os anúncios"),
        h("p", { class: "sub" }, "Adicione os parâmetros abaixo ao campo de parâmetros de URL dos anúncios. Troque os nomes de exemplo pelos usados em cada campanha."),
        h("div", { class: "rastc-plataformas" },
          blocoExemplo("Google Ads", urlGoogle), blocoExemplo("Meta Ads", urlMeta)),
        h("p", { class: "campo-ajuda" }, "O script também reconhece automaticamente gclid, gbraid, wbraid e fbclid. A atribuição do código [ref] à conversa é feita quando a mensagem chega pelo canal CodeWords conectado ao Órbita."));
      const privacidade = h("div", { class: "aviso aviso-aten rastc-privacidade" }, ui.icone("info"),
        h("span", null, "O script guarda parâmetros de campanha por até 30 dias no armazenamento local do navegador, sem cookies nem serviços de terceiros. Inclua essa informação na política de privacidade do site. O sinal Global Privacy Control do navegador é respeitado."));
      raiz.append(instalacao, parametros, privacidade);
    }
    if (!chave) raiz.append(instalacao, h("div", { class: "aviso aviso-aten rastc-privacidade" }, ui.icone("info"),
      h("span", null, "Quando a chave for criada, o código de instalação incluirá essa chave pública. O rastreio funciona com a conversa recebida pelo canal CodeWords conectado.")));
    alvo.append(intro, raiz);
  }

  function blocoExemplo(titulo, valor) {
    const texto = h("code", { class: "mono" }, valor);
    const copiar = h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => ui.copiar(valor, { aviso: `Parâmetros de ${titulo} copiados.` }) } }, ui.icone("copiar"), "Copiar");
    return h("article", { class: "rastc-plataforma" }, h("div", { class: "linha" }, h("b", null, titulo), copiar), texto);
  }

  async function trocarChave(botao) {
    const confirmado = await ui.confirmar({
      titulo: "Gerar uma chave nova?", perigo: true, rotulo: "Gerar nova chave",
      texto: "A chave atual deixa de funcionar. O rastreio só volta depois que o código no site for atualizado.",
    });
    if (!confirmado) return;
    try {
      chave = (await ui.carregando(botao, api.rpcC("nx_entrada_chave", { p_gerar: true }))).chave;
      pintar(); ui.toast("Chave nova criada. Atualize o código no site.", { tipo: "ok" });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }

  pintar();
}
