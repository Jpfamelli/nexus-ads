/* ============================================================
   ÓRBITA — instalação do rastreio do site · F8 + plano 100 (frente F: F7–F10)
   A chave identifica a empresa e é publicada no próprio site. É a MESMA chave do formulário do site
   (nx_entrada_chave): trocar aqui desliga o script instalado E o formulário até os dois serem atualizados.
   Painel «Cliques do site» (nx_rastreio_listar) com «Testar» (nx_rastreio_registrar com teste:"1", nada gravado).
   No servidor falso (?dev-falso=1) o snippet aponta para ele (window.ORBITA_DEV_FALSO.rastreio) — nunca para a produção.
   ============================================================ */

export const secoesConfig = [
  { id: "rastreio", titulo: "Site e anúncios", desc: "Script que diz de qual campanha veio o contato", grupo: "Anúncios", papelMin: "admin", modulo: "crm", icone: "anuncio", montar: secaoRastreio },
];

/** Onde o script é servido em produção (GitHub Pages do Nexus Ads: endereço estável, sem depender do domínio do painel). */
export const URL_SCRIPT = "https://jpfamelli.github.io/nexus-ads/rastreio.js";
const HOSTS_LOCAIS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** O servidor falso anuncia para onde o snippet deve apontar (window.ORBITA_DEV_FALSO.rastreio); só vale se for local. */
export function rastreioLocal(janela = typeof window !== "undefined" ? window : null) {
  const r = janela && janela.ORBITA_DEV_FALSO && janela.ORBITA_DEV_FALSO.rastreio;
  if (!r || typeof r.script !== "string" || typeof r.url !== "string") return null;
  try {
    if (![r.script, r.url].every(u => HOSTS_LOCAIS.has(new URL(u).hostname))) return null;
    if (r.site && !HOSTS_LOCAIS.has(new URL(r.site).hostname)) return null;
  } catch { return null; }
  return { script: r.script, url: r.url, apikey: String(r.apikey || "dev-falso"), site: r.site || null };
}

const aspas = v => String(v ?? "").replace(/[<>"&]/g, "");   // a chave é hex; nada de fechar o atributo
/** Snippet de instalação (F9): produção → script do Pages sem data-url (o padrão do script é o Órbita); servidor falso → o local, com data-url e data-apikey. */
export function snippetRastreio(chave, local = null) {
  if (local) return `<script src="${aspas(local.script)}" data-chave="${aspas(chave)}" data-url="${aspas(local.url)}" data-apikey="${aspas(local.apikey)}" defer></script>`;
  return `<script src="${URL_SCRIPT}" data-chave="${aspas(chave)}" defer></script>`;
}
/** Variante para gerenciador de tags (GTM, Wix, Webflow): a configuração vai em window.ORBITA_RASTREIO, porque ali o
    document.currentScript pode vir nulo e os atributos data- se perdem. */
export function snippetGerenciador(chave, local = null) {
  const cfg = local ? `{ chave: "${aspas(chave)}", url: "${aspas(local.url)}", apikey: "${aspas(local.apikey)}" }` : `{ chave: "${aspas(chave)}" }`;
  return `<script>window.ORBITA_RASTREIO = ${cfg};</script>\n<script src="${aspas(local ? local.script : URL_SCRIPT)}" defer></script>`;
}

/** Parâmetros de URL dos anúncios (F9): macros de ID de cada plataforma — o ID casa direto com a campanha que o Órbita lê do
    Meta/Google; o nome digitado à mão (reserva) só casa se for idêntico. */
export const UTM = Object.freeze({
  google: "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}",
  meta: "utm_source=instagram&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}",
  reserva: "utm_source=instagram&utm_medium=paid_social&utm_campaign=nome-da-campanha&utm_content=nome-do-anuncio",
});

/** Aviso de privacidade (F8): o que fica no navegador, o que vai ao Órbita e por quanto tempo. */
export const TEXTO_PRIVACIDADE = "O script guarda no navegador do visitante (armazenamento local, sem cookies), por até 30 dias, de onde veio a visita: os parâmetros utm_* e os identificadores de clique dos anúncios (gclid, gbraid, wbraid, fbclid). Quando a pessoa toca no botão do WhatsApp, esses parâmetros e o endereço da página vão para o Órbita, que devolve um código curto (ex.: [ref K7Q2P]) e guarda o clique por até 45 dias para ligar a conversa à campanha. O script não coleta nome, telefone nem e-mail, e respeita o sinal Global Privacy Control do navegador (com ele, nada é guardado nem enviado).";

/** Parágrafo modelo para a política de privacidade do site (F8), com o nome da empresa. */
export function textoPolitica(empresa) {
  const nome = String(empresa || "").trim() || "nossa empresa";
  return `Origem das visitas. Este site usa um pequeno script do Órbita, o sistema de atendimento de ${nome}, para saber de qual anúncio ou campanha veio cada contato. O script guarda no seu navegador, por até 30 dias e sem cookies, os parâmetros de campanha do endereço da página (utm_source, utm_medium, utm_campaign, utm_content e utm_term) e os identificadores de clique de anúncios (gclid, gbraid, wbraid e fbclid). Quando você toca no botão do WhatsApp, essas informações e o endereço da página são enviados ao Órbita, que acrescenta à mensagem um código curto (por exemplo, [ref K7Q2P]) e guarda o clique por até 45 dias para associar a conversa à campanha. O script não coleta nome, telefone nem e-mail. Se o seu navegador enviar o sinal Global Privacy Control, nada é guardado nem enviado. Usamos essas informações com base no legítimo interesse de medir os resultados dos nossos anúncios (LGPD, art. 7º, IX); você pode apagá-las a qualquer momento limpando os dados deste site no seu navegador.`;
}

/** O que a troca de chave desliga (F7): os DOIS lugares que usam a chave. */
export const AVISO_TROCA = Object.freeze({
  titulo: "Gerar uma chave nova?",
  intro: "A chave atual para de funcionar na hora, em dois lugares:",
  lugares: [
    "o script de rastreio instalado no site — os links do WhatsApp deixam de ganhar o código da campanha;",
    "o formulário do site (Configurações › Formulário do site) — os contatos param de entrar no CRM, sem nenhum erro para quem preenche.",
  ],
  fim: "Os dois só voltam quando o código do site for atualizado com a chave nova.",
});

const MOTIVOS = {
  aplicado: "casou com o negócio",
  pendente: "esperando o negócio nascer",
  sem_negocio: "esperando o negócio nascer",
  codigo_ja_usado: "código já usado em outra conversa",
  ja_tem_anuncio: "o negócio já veio de um anúncio",
  origem_definida: "o negócio já tinha origem",
  codigo_desconhecido: "código não reconhecido",
  codigo_invalido: "código inválido",
};
/** Rótulo do motivo de um clique (F10); clique sem motivo e sem casar = a mensagem nunca chegou com o código. */
export const rotuloMotivo = (motivo, casou = false) => (casou ? MOTIVOS.aplicado : MOTIVOS[motivo] || (motivo ? String(motivo).replace(/_/g, " ") : "a mensagem não chegou com o código"));

/**
 * nx_rastreio_listar → o que o painel «Cliques do site» desenha (F10): totais (do servidor; senão contados), motivos, campanhas e os últimos cliques.
 * Formato: {dias, itens:[{em, pagina, utm_*, plataforma, origem, casou, motivo, usado_em, negocio_id, contato_nome}], totais:{cliques, casados, usados?, pendentes?}}.
 */
export function resumoRastreio(resp, { ultimos = 10 } = {}) {
  const itens = Array.isArray(resp && resp.itens) ? resp.itens.filter(x => x && typeof x === "object") : [];
  const t = (resp && resp.totais) || {};
  const num = (v, alt) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : alt);
  const cliques = num(t.cliques, itens.length), casados = num(t.casados, itens.filter(x => x.casou).length);
  const pendentes = num(t.pendentes, itens.some(x => x.motivo === "pendente") ? itens.filter(x => x.motivo === "pendente").length : null);
  const usados = num(t.usados, null);
  const motivos = new Map();
  for (const x of itens) { const r = rotuloMotivo(x.motivo, !!x.casou); motivos.set(r, (motivos.get(r) || 0) + 1); }
  const camp = new Map();
  for (const x of itens) {
    const nome = String(x.utm_campaign || "").trim() || "(sem campanha)";
    const c = camp.get(nome) || { nome, cliques: 0, casados: 0 };
    c.cliques++; if (x.casou) c.casados++;
    camp.set(nome, c);
  }
  return {
    dias: num(resp && resp.dias, 30),
    totais: { cliques, casados, pendentes, usados, pct: cliques > 0 ? Math.round(casados / cliques * 100) : null },
    motivos: [...motivos.entries()].map(([rotulo, n]) => ({ rotulo, n })).sort((a, b) => b.n - a.n),
    campanhas: [...camp.values()].sort((a, b) => b.cliques - a.cliques || b.casados - a.casados),
    ultimos: itens.slice().sort((a, b) => String(b.em || "").localeCompare(String(a.em || ""))).slice(0, ultimos),
    vazio: !itens.length && !cliques,
  };
}
/** Caminho curto da página do clique ("/implante" ou "site.com.br"), sem consulta (a página nunca traz a query). */
export function paginaCurta(url) {
  try { const u = new URL(String(url)); return u.pathname && u.pathname !== "/" ? u.pathname : u.hostname; }
  catch { return String(url || "—").slice(0, 60); }
}

async function secaoRastreio(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  ui.carregarCss("agenda");
  ui.carregarCss("relatorios.css");      // painel de cliques (ads-rastreio-*) mora na folha da frente F
  ui.limpar(alvo);
  alvo.appendChild(ui.esqueleto("cartoes", 2));

  let chave, trocouAgora = false;
  try {
    const resultado = await api.rpcC("nx_entrada_chave", { p_gerar: false });
    chave = resultado && resultado.chave || null;
  } catch (e) {
    ui.limpar(alvo);
    alvo.appendChild(ui.erroCartao(e, () => secaoRastreio(ctx, alvo)));
    return;
  }
  const local = rastreioLocal();
  let painel = null;     // a seção «Cliques do site» do desenho atual (o comando da paleta rola até ela)

  // repintar recria TUDO (nada sobra do desenho anterior: a chave revogada nunca fica copiável na tela)
  function pintar() {
    ui.limpar(alvo);
    painel = null;
    const raiz = h("div", { class: "agc rastc" });
    const intro = h("header", { class: "pilha" },
      h("h2", { class: "titulo-sec" }, "Acompanhe de onde vêm os contatos"),
      h("p", { class: "sub" }, "Instale um pequeno script no site. Ele identifica a campanha quando alguém inicia uma conversa pelo WhatsApp e, com o número conectado ao Órbita (CodeWords ou API oficial da Meta), associa a origem ao negócio no CRM."));
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
      raiz.append(instalacao, h("div", { class: "aviso aviso-aten rastc-privacidade" }, ui.icone("info"),
        h("span", null, "Quando a chave for criada, o código de instalação incluirá essa chave pública. É a mesma chave do formulário do site.")));
      alvo.append(intro, raiz);
      return;
    }

    const codigo = snippetRastreio(chave, local);
    const pre = h("pre", { class: "rastc-codigo", tabindex: "0", "aria-label": "Código de instalação do rastreio" }, h("code", null, codigo));
    const copiar = h("button", { type: "button", class: "bt bt-prim", on: { click: () => ui.copiar(codigo, { aviso: "Código de instalação copiado." }) } }, ui.icone("copiar"), "Copiar código");
    const alternativo = snippetGerenciador(chave, local);
    const detalheGtm = h("details", { class: "ads-rastreio-det" }, h("summary", null, "Usa Google Tag Manager, Wix ou Webflow?"),
      h("p", { class: "sub" }, "Nesses editores o script às vezes perde os atributos. Use esta versão, com a configuração antes do script:"),
      h("pre", { class: "rastc-codigo", tabindex: "0", "aria-label": "Código alternativo para gerenciador de tags" }, h("code", null, alternativo)),
      h("div", { class: "linha rastc-acoes" }, h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => ui.copiar(alternativo, { aviso: "Código alternativo copiado." }) } }, ui.icone("copiar"), "Copiar esta versão")));
    const campoChave = h("input", { class: "mono", type: "text", readonly: true, value: chave, "aria-label": "Chave pública de instalação", spellcheck: false });
    const copiarChave = h("button", { type: "button", class: "bt bt-sec", on: { click: () => ui.copiar(chave, { aviso: "Chave copiada." }) } }, ui.icone("copiar"), "Copiar chave");
    const trocar = h("button", { type: "button", class: "bt bt-fant", on: { click: () => trocarChave(trocar) } }, "Gerar nova chave");
    const ondeServe = local
      ? h("p", { class: "campo-ajuda ads-rastreio-local" }, "Servidor de teste: o código acima aponta para este computador (nunca para a produção). ",
        local.site ? h("a", { class: "rel-link", href: local.site, target: "_blank", rel: "noopener noreferrer" }, "Abrir o site de teste ↗") : null)
      : h("p", { class: "campo-ajuda" }, "O script é servido por jpfamelli.github.io (endereço fixo); os cliques vão direto para o servidor do Órbita.");
    instalacao.append(pre, h("div", { class: "linha rastc-acoes" }, copiar), ondeServe, detalheGtm,
      h("div", { class: "campo rastc-chave" }, h("label", null, "Chave desta empresa"), campoChave),
      h("div", { class: "linha rastc-acoes" }, copiarChave, trocar),
      h("p", { class: "campo-ajuda" }, "A chave aparece no código instalado no site e é a mesma do formulário do site. Se alguém a usar fora do esperado, gere outra e atualize o script e o formulário."));
    if (trocouAgora) instalacao.append(h("div", { class: "aviso aviso-aten", role: "status" }, ui.icone("alerta"),
      h("span", null, "Chave nova gerada. Atualize o código no site e o formulário do site — até lá, os dois ficam sem funcionar. "),
      h("a", { class: "rel-link", href: "#/config/formulario" }, "Abrir o formulário do site")));

    const parametros = h("section", { class: "cartao pilha", "aria-labelledby": "rastc-parametros" },
      h("h3", { id: "rastc-parametros", class: "titulo-sec" }, "Parâmetros para os anúncios"),
      h("p", { class: "sub" }, "Cole no campo «Parâmetros de URL» de cada anúncio. As chaves entre { } são preenchidas pela própria plataforma com o ID da campanha e do anúncio — o Órbita casa o ID direto com a campanha que ele já lê do Meta e do Google."),
      h("div", { class: "rastc-plataformas" },
        blocoExemplo("Google Ads", UTM.google), blocoExemplo("Meta Ads", UTM.meta)),
      h("details", { class: "ads-rastreio-det" }, h("summary", null, "Prefere escrever o nome da campanha?"),
        h("p", { class: "sub" }, "Funciona, mas o nome precisa ser idêntico ao da campanha no Meta/Google; com o ID não há erro de digitação."),
        h("div", { class: "rastc-plataformas" }, blocoExemplo("Com nomes (reserva)", UTM.reserva))),
      h("p", { class: "campo-ajuda" }, "O script também reconhece sozinho gclid, gbraid, wbraid e fbclid. O código [ref] é lido quando a mensagem chega pelo número conectado ao Órbita."));

    const politica = textoPolitica(ctx.cliente && ctx.cliente.nome);
    const privacidade = h("section", { class: "cartao pilha", "aria-labelledby": "rastc-priv" },
      h("h3", { id: "rastc-priv", class: "titulo-sec" }, "Privacidade"),
      h("div", { class: "aviso aviso-aten rastc-privacidade" }, ui.icone("info"), h("span", null, TEXTO_PRIVACIDADE)),
      h("p", { class: "sub" }, "Inclua na política de privacidade do site. Parágrafo modelo (revise com quem cuida do jurídico):"),
      h("blockquote", { class: "ads-rastreio-politica" }, politica),
      h("div", { class: "linha rastc-acoes" }, h("button", { type: "button", class: "bt bt-sec", on: { click: () => ui.copiar(politica, { aviso: "Parágrafo da política copiado." }) } }, ui.icone("copiar"), "Copiar parágrafo")));

    painel = painelCliques();
    raiz.append(instalacao, painel, parametros, privacidade);
    alvo.append(intro, raiz);
  }

  function blocoExemplo(titulo, valor) {
    const texto = h("code", { class: "mono" }, valor);
    const copiar = h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => ui.copiar(valor, { aviso: `Parâmetros de ${titulo} copiados.` }) } }, ui.icone("copiar"), "Copiar");
    return h("article", { class: "rastc-plataforma" }, h("div", { class: "linha" }, h("b", null, titulo), copiar), texto);
  }

  /* ---------- F10: «Cliques do site» — o que o script registrou, quantos casaram e por quê ---------- */
  function painelCliques() {
    const corpo = h("div", { class: "ads-rastreio-corpo", "aria-busy": "true" }, ui.esqueleto("kpi", { n: 3 }));
    const status = h("p", { class: "sub ads-rastreio-st", role: "status", "aria-live": "polite" });
    const testar = h("button", { type: "button", class: "bt bt-sec", on: { click: () => testarScript(testar, status) } }, ui.icone("raio"), "Testar");
    const atualizar = h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => carregarCliques(corpo, atualizar) } }, ui.icone("reabrir"), "Atualizar");
    const sec = h("section", { class: "cartao pilha ads-rastreio", id: "rastc-painel", "aria-labelledby": "rastc-painel-h" },
      h("div", { class: "cartao-cab" }, h("div", null,
        h("h3", { id: "rastc-painel-h", class: "titulo-sec", tabindex: "-1" }, "Cliques do site"),
        h("p", { class: "sub" }, "Cada toque no botão do WhatsApp do site, nos últimos 30 dias: quantos viraram negócio com a campanha certa e, quando não, por quê."))),
      corpo, h("div", { class: "linha rastc-acoes" }, testar, atualizar), status);
    carregarCliques(corpo, atualizar);
    return sec;
  }

  async function carregarCliques(corpo, botao) {
    corpo.setAttribute("aria-busy", "true");
    if (botao) botao.disabled = true;
    try {
      const r = await api.rpcC("nx_rastreio_listar", { p_dias: 30 });
      if (corpo.isConnected === false) return;   // a tela foi redesenhada enquanto a resposta vinha
      ui.limpar(corpo);
      desenharCliques(corpo, resumoRastreio(r));
    } catch (e) {
      ui.limpar(corpo);
      // servidor antigo (sem a RPC): fallback honesto, sem inventar número
      const antigo = !!e && (Number(e.status) === 404 || /PGRST202|could not find the function/i.test(String(e.codigo || e.message || "")));
      corpo.append(antigo ? h("p", { class: "sub" }, "O servidor ainda não tem o painel de cliques. O rastreio continua funcionando; os números aparecem aqui depois da atualização.")
        : ui.erroCartao(e, () => carregarCliques(corpo, botao)));
    } finally {
      corpo.setAttribute("aria-busy", "false");
      if (botao) botao.disabled = false;
    }
  }

  function desenharCliques(corpo, R) {
    if (R.vazio) {
      corpo.append(ui.vazio({ tema: "ads", titulo: "Nenhum clique nos últimos 30 dias", texto: "Depois de instalar o script, toque no botão do WhatsApp do site (ou use «Testar») para conferir." }));
      return;
    }
    const T = R.totais;
    corpo.append(h("div", { class: "rel-kpis ads-rastreio-kpis" },
      ui.kpi({ rotulo: "Cliques no WhatsApp", valor: T.cliques, ajuda: "Toques no botão do WhatsApp do site com o script ativo." }),
      ui.kpi({ rotulo: "Casaram com um negócio", valor: T.casados, ajuda: T.pct == null ? "Cliques cujo código chegou na conversa e foi aplicado ao negócio." : `${T.pct}% dos cliques: o código chegou na conversa e foi aplicado ao negócio.` }),
      T.pendentes == null ? null : ui.kpi({ rotulo: "Esperando o negócio", valor: T.pendentes, ajuda: "O código chegou antes de o negócio existir; ele é aplicado sozinho quando o negócio nascer (até 30 dias)." })));
    if (R.motivos.length) {
      const max = Math.max(...R.motivos.map(m => m.n));
      corpo.append(h("div", { class: "ads-rastreio-bloco" }, h("h4", { class: "rotulo" }, "O que aconteceu com cada clique"),
        h("ul", { class: "ads-rastreio-motivos" }, R.motivos.map(m => h("li", null, h("span", null, m.rotulo),
          h("span", { class: "ads-rastreio-barra", "aria-hidden": "true" }, h("i", { style: { "--w": `${Math.round(m.n / max * 100)}%` } })), h("b", { class: "rel-num" }, String(m.n)))))));
    }
    if (R.campanhas.length) {
      corpo.append(h("div", { class: "ads-rastreio-bloco" }, h("h4", { class: "rotulo" }, "Por campanha"),
        h("div", { class: "rel-tabela-rolagem", role: "region", tabindex: "0", "aria-label": "Cliques por campanha" },
          h("table", { class: "rel-tabela" }, h("caption", { class: "sr-only" }, "Cliques do site por campanha nos últimos 30 dias"),
            h("thead", null, h("tr", null, h("th", { scope: "col" }, "Campanha"), h("th", { scope: "col", class: "num" }, "Cliques"), h("th", { scope: "col", class: "num" }, "Casaram"))),
            h("tbody", null, R.campanhas.slice(0, 12).map(c => h("tr", null, h("th", { scope: "row" }, c.nome), h("td", { class: "num", dataset: { l: "Cliques" } }, String(c.cliques)), h("td", { class: "num", dataset: { l: "Casaram" } }, String(c.casados)))))))));
    }
    if (R.ultimos.length) {
      corpo.append(h("div", { class: "ads-rastreio-bloco" }, h("h4", { class: "rotulo" }, "Últimos cliques"),
        h("ul", { class: "ads-rastreio-lista" }, R.ultimos.map(x => h("li", { class: x.casou ? "ok" : "" },
          h("div", { class: "ads-rastreio-l1" },
            ui.pilula(null, x.origem || (x.plataforma ? "anuncio" : "site"), { variante: "origem", plataforma: x.plataforma || undefined, tamanho: "p" }),
            h("span", { class: "ads-rastreio-camp" }, x.utm_campaign || "sem campanha"),
            h("span", { class: `pilula pilula-p ${x.casou ? "pilula-ok" : x.motivo === "pendente" ? "pilula-aten" : "pilula-neutra"}` }, rotuloMotivo(x.motivo, !!x.casou))),
          h("p", { class: "campo-ajuda" }, `${quandoCurto(x.em)} · ${paginaCurta(x.pagina)}${x.contato_nome ? ` · ${x.contato_nome}` : ""}`))))));
    }
  }

  async function testarScript(botao, status) {
    status.textContent = "";
    try {
      // o mesmo caminho do script do site (RPC pública com a chave); teste:"1" → o servidor responde sem gravar
      const r = await ui.carregando(botao, api.publica("nx_rastreio_registrar", { p_chave: chave, p_dados: { teste: "1", pagina: "teste-do-painel" } }));
      if (r && r.ok && r.codigo) {
        status.textContent = r.teste ? `Funcionando: o Órbita respondeu com o código ${r.codigo} (teste — nada foi gravado).`
          : `Funcionando: o Órbita respondeu com o código ${r.codigo}. Este servidor ainda grava o teste como um clique.`;
        if (typeof ui.checkSucesso === "function") ui.checkSucesso(botao);
      } else status.textContent = "O Órbita respondeu, mas sem código: confira se a chave do site é a desta tela.";
    } catch (e) {
      status.textContent = e && /limite_taxa/.test(String(e.codigo || e.message || "")) ? "Muitos cliques em pouco tempo: o limite do rastreio foi atingido. Tente de novo em alguns minutos." : api.mensagemErro(e);
    }
  }

  async function trocarChave(botao) {
    const corpo = h("div", { class: "pilha" }, h("p", null, AVISO_TROCA.intro), h("ul", { class: "ads-rastreio-troca" }, AVISO_TROCA.lugares.map(l => h("li", null, l))), h("p", null, AVISO_TROCA.fim));
    const r = await ui.modal({ titulo: AVISO_TROCA.titulo, corpo, largura: "p", protegerTexto: false,
      acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: false }, { rotulo: "Gerar nova chave", tipo: "perigo", fn: () => true }] });
    if (r !== true) return;
    try {
      chave = (await ui.carregando(botao, api.rpcC("nx_entrada_chave", { p_gerar: true }))).chave;
      trocouAgora = true;
      pintar();
      ui.toast("Chave nova criada. Atualize o código no site e o formulário do site.", { tipo: "ok", ms: 8000, acao: { rotulo: "Formulário", fn: () => ctx.navegar("#/config/formulario") } });
    } catch (e) { ui.toast(api.mensagemErro(e), { tipo: "erro" }); }
  }

  // Ctrl/⌘+K «Rastreio do site» (grupo «Ir e ver»): rola até o painel de cliques e põe o foco no título
  if (ctx.comandos && typeof ctx.comandos.registrar === "function") {
    ctx.comandos.registrar({ id: "rastreio.painel", fazer: () => {
      const alvoH = painel && painel.isConnected ? painel.querySelector("#rastc-painel-h") : null;
      if (!alvoH) return;
      try { painel.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); } catch { /* sem layout */ }
      alvoH.focus({ preventScroll: true });
    } });
  }

  pintar();
}

const FMT_QUANDO = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
function quandoCurto(iso) { const d = new Date(iso); return isNaN(d) ? "—" : FMT_QUANDO.format(d).replace(",", " às"); }
