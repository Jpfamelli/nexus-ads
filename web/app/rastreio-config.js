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
/** Plano 1000 (AD-168): o snippet novo aponta para a versão FIXA (rastreio.v1.js) com Subresource Integrity — um push no repositório
    não muda o JS que roda no site dos clientes; o navegador recusa um arquivo diferente do conferido. NUNCA editar o rastreio.v1.js
    depois de publicado: correção = rastreio.v2.js + hash novo aqui (testes/plano1000-ads confere o hash com o arquivo).
    O rastreio.js sem versão continua no ar para os sites que já o instalaram. */
export const URL_SCRIPT_V1 = "https://jpfamelli.github.io/nexus-ads/rastreio.v1.js";
export const SRI_V1 = "sha384-5seekIDmBnVMEmAI/uZoEKAyr41xbFHY+KxEYM2sHNNVw/ef9D4mvmaNjOnDCkpv";
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
  return `<script src="${URL_SCRIPT_V1}" integrity="${SRI_V1}" crossorigin="anonymous" data-chave="${aspas(chave)}" defer></script>`;
}
/** Variante para gerenciador de tags (GTM, Wix, Webflow): a configuração vai em window.ORBITA_RASTREIO, porque ali o
    document.currentScript pode vir nulo e os atributos data- se perdem. */
export function snippetGerenciador(chave, local = null) {
  const cfg = local ? `{ chave: "${aspas(chave)}", url: "${aspas(local.url)}", apikey: "${aspas(local.apikey)}" }` : `{ chave: "${aspas(chave)}" }`;
  return `<script>window.ORBITA_RASTREIO = ${cfg};</script>\n<script src="${local ? aspas(local.script) : `${URL_SCRIPT_V1}" integrity="${SRI_V1}" crossorigin="anonymous`}" defer></script>`;
}

/** Parâmetros de URL dos anúncios (F9): macros de ID de cada plataforma — o ID casa direto com a campanha que o Órbita lê do
    Meta/Google; o nome digitado à mão (reserva) só casa se for idêntico. */
// plano 1000 (AD-184): o Meta não é só Instagram — utm_source=meta (o servidor reconhece meta/fb/ig) e, em utm_term, onde o anúncio
// apareceu ({{site_source_name}}: fb, ig, msg, an · {{placement}}: feed, stories…); antes um anúncio no Facebook ficava «instagram»
export const UTM = Object.freeze({
  google: "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}",
  meta: "utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{site_source_name}}-{{placement}}",
  reserva: "utm_source=meta&utm_medium=paid_social&utm_campaign=nome-da-campanha&utm_content=nome-do-anuncio",
});

/** Plano 1000 (AD-167): os textos de privacidade seguem as opções do script — data-dias (0 = só a visita) e data-gpc="ignorar" (sem a
    frase do GPC). O painel gera o snippet padrão (30 dias, respeita o GPC), então mostra o texto padrão; quem mudar as opções no site
    gera o texto com elas (cabeçalho do rastreio.js). */
const periodoPriv = dias => { const n = Number(dias); return n === 0 ? "só durante a visita" : `por até ${Number.isFinite(n) && n > 0 ? Math.round(n) : 30} dias`; };
export function textoPrivacidade({ dias = 30, gpc = true } = {}) {
  return `O script guarda no navegador do visitante (armazenamento local, sem cookies), ${periodoPriv(dias)}, de onde veio a visita: os parâmetros utm_* e os identificadores de clique dos anúncios (gclid, gbraid, wbraid, fbclid). Quando a pessoa toca no botão do WhatsApp, esses parâmetros e o endereço da página vão para o Órbita, que devolve um código curto (ex.: [ref K7Q2P]) e guarda o clique por até 45 dias para ligar a conversa à campanha. O script não coleta nome, telefone nem e-mail${gpc ? ", e respeita o sinal Global Privacy Control do navegador (com ele, nada é guardado nem enviado)" : ""}.`;
}
/** Aviso de privacidade (F8): o que fica no navegador, o que vai ao Órbita e por quanto tempo (snippet padrão). */
export const TEXTO_PRIVACIDADE = textoPrivacidade();

/** Parágrafo modelo para a política de privacidade do site (F8), com o nome da empresa (AD-167: e as opções do script). */
export function textoPolitica(empresa, { dias = 30, gpc = true } = {}) {
  const nome = String(empresa || "").trim() || "nossa empresa";
  const periodo = periodoPriv(dias);
  return `Origem das visitas. Este site usa um pequeno script do Órbita, o sistema de atendimento de ${nome}, para saber de qual anúncio ou campanha veio cada contato. O script guarda no seu navegador, ${periodo} e sem cookies, os parâmetros de campanha do endereço da página (utm_source, utm_medium, utm_campaign, utm_content e utm_term) e os identificadores de clique de anúncios (gclid, gbraid, wbraid e fbclid). Quando você toca no botão do WhatsApp, essas informações e o endereço da página são enviados ao Órbita, que acrescenta à mensagem um código curto (por exemplo, [ref K7Q2P]) e guarda o clique por até 45 dias para associar a conversa à campanha. O script não coleta nome, telefone nem e-mail.${gpc ? " Se o seu navegador enviar o sinal Global Privacy Control, nada é guardado nem enviado." : ""} Usamos essas informações com base no legítimo interesse de medir os resultados dos nossos anúncios (LGPD, art. 7º, IX); você pode apagá-las a qualquer momento limpando os dados deste site no seu navegador.`;
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
/** Rótulo do motivo de um clique (F10); clique sem motivo e sem casar = a mensagem nunca chegou com o código.
    Plano 1000 (AD-183): clique de menos de 1 h sem motivo ainda está «aguardando a mensagem» (a pessoa pode estar escrevendo). */
export const AGUARDANDO_MS = 3600e3;
export const rotuloMotivo = (motivo, casou = false, { em = null, agora = Date.now() } = {}) => {
  if (casou) return MOTIVOS.aplicado;
  if (MOTIVOS[motivo]) return MOTIVOS[motivo];
  if (motivo) return String(motivo).replace(/_/g, " ");
  const t = em ? Date.parse(em) : NaN;
  return Number.isFinite(t) && agora - t >= 0 && agora - t < AGUARDANDO_MS ? "aguardando a mensagem" : "a mensagem não chegou com o código";
};
/** Plano 1000 (AD-181): o domínio da página do clique («www.clinica.com.br» → «clinica.com.br»); null se não for URL. */
export function hostDe(url) {
  try { const u = new URL(String(url)); return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, "").toLowerCase() : null; } catch { return null; }
}
/** Plano 1000 (AD-182): filtro da lista de cliques pelo rótulo do motivo ("" = todos). */
export const filtrarCliques = (itens = [], motivo = "", agora = Date.now()) =>
  (motivo ? itens.filter(x => rotuloMotivo(x.motivo, !!x.casou, { em: x.em, agora }) === motivo) : itens.slice());

/**
 * nx_rastreio_listar → o que o painel «Cliques do site» desenha (F10): totais (do servidor; senão contados), motivos, campanhas e os últimos cliques.
 * Formato: {dias, itens:[{em, pagina, utm_*, plataforma, origem, casou, motivo, usado_em, negocio_id, contato_nome}], totais:{cliques, casados, usados?, pendentes?}}.
 */
export function resumoRastreio(resp, { ultimos = 10, agora = Date.now() } = {}) {
  const itens = Array.isArray(resp && resp.itens) ? resp.itens.filter(x => x && typeof x === "object") : [];
  const t = (resp && resp.totais) || {};
  const num = (v, alt) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : alt);
  const cliques = num(t.cliques, itens.length), casados = num(t.casados, itens.filter(x => x.casou).length);
  const pendentes = num(t.pendentes, itens.some(x => x.motivo === "pendente") ? itens.filter(x => x.motivo === "pendente").length : null);
  const usados = num(t.usados, null);
  const motivos = new Map();
  for (const x of itens) { const r = rotuloMotivo(x.motivo, !!x.casou, { em: x.em, agora }); motivos.set(r, (motivos.get(r) || 0) + 1); }
  // AD-180: o último clique REAL (fora o «Testar» do painel) — prova de que o site instalado manda cliques
  const ordenados = itens.slice().sort((a, b) => String(b.em || "").localeCompare(String(a.em || "")));
  const real = ordenados.find(x => x.pagina && x.pagina !== "teste-do-painel" && hostDe(x.pagina));
  // AD-181: por domínio da página; «novo» = primeiro clique nos últimos 7 dias quando já havia clique de outro domínio antes
  const hostsM = new Map();
  for (const x of ordenados) {
    const host = hostDe(x.pagina);
    if (!host) continue;
    const g = hostsM.get(host) || { host, cliques: 0, primeiro: x.em, ultimo: x.em };
    g.cliques++;
    if (String(x.em || "") < String(g.primeiro || "")) g.primeiro = x.em;
    if (String(x.em || "") > String(g.ultimo || "")) g.ultimo = x.em;
    hostsM.set(host, g);
  }
  const hostsL = [...hostsM.values()];
  const antigoDe = g => hostsL.some(o => o.host !== g.host && String(o.primeiro || "") < String(g.primeiro || ""));
  for (const g of hostsL) { const t = Date.parse(g.primeiro); g.novo = Number.isFinite(t) && agora - t <= 7 * 864e5 && antigoDe(g); }
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
    // AD-189: cada motivo também em porcentagem dos cliques listados («12 (40%)»)
    motivos: [...motivos.entries()].map(([rotulo, n]) => ({ rotulo, n, pct: itens.length ? Math.round(n / itens.length * 100) : null })).sort((a, b) => b.n - a.n),
    campanhas: [...camp.values()].sort((a, b) => b.cliques - a.cliques || b.casados - a.casados),
    ultimos: ordenados.slice(0, ultimos),
    todos: ordenados,                                    // AD-182: «Mostrar mais» e o filtro por motivo trabalham sobre a lista inteira
    ultimoReal: real ? { em: real.em, host: hostDe(real.pagina) } : null,
    hosts: hostsL.sort((a, b) => b.cliques - a.cliques || a.host.localeCompare(b.host)),
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
        h("p", { class: "sub" }, "Cole uma vez no site, antes do fechamento da tag `</body>`. Funciona em HTML, WordPress, Wix e Webflow."))),
      // plano 1000 (AD-179): onde colar em cada plataforma (antes só «antes de </body>», que não ajuda quem usa um construtor de site)
      h("details", { class: "ads-rastreio-det" }, h("summary", null, "Onde colar em cada plataforma"),
        h("ul", { class: "ads-rastreio-onde" },
          h("li", null, h("b", null, "WordPress: "), "plugin «WPCode» (ou «Insert Headers and Footers») › Rodapé (Footer) › cole e salve. Tema com campo de scripts no rodapé também serve."),
          h("li", null, h("b", null, "Wix: "), "Configurações do site › Avançado › Código personalizado › Adicionar código › «Corpo — fim», em todas as páginas. Use a versão para gerenciador de tags (abaixo)."),
          h("li", null, h("b", null, "Webflow: "), "Project settings › Custom code › Footer code › cole e publique o site de novo."),
          h("li", null, h("b", null, "Shopify: "), "Loja virtual › Temas › Editar código › theme.liquid › cole logo antes de </body>."),
          h("li", null, h("b", null, "Google Tag Manager: "), "nova tag «HTML personalizado» com a versão para gerenciador, acionador «All Pages»."),
          h("li", null, h("b", null, "HTML próprio: "), "em cada página, logo antes de </body> (ou no rodapé comum do site)."))),
      // AD-172: www × sem www — a origem guardada é por endereço; redirecionar sem levar a consulta (?utm_…) perde a campanha
      h("p", { class: "campo-ajuda ads-rastreio-www" }, "Atenção ao endereço: o navegador guarda a origem separada para «www.seusite.com.br» e «seusite.com.br». Se o site redireciona de um para o outro, o redirecionamento precisa manter a parte depois do «?» (utm_…, gclid, fbclid) — senão a campanha se perde. Use nos anúncios o endereço final, o mesmo que aparece no navegador."));

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
      // plano 1000 (AD-137/AD-168): sem o endereço pessoal no texto; a versão é fixa e conferida pelo navegador (integrity)
      : h("p", { class: "campo-ajuda" }, "O script vem de um endereço fixo do Órbita, numa versão que não muda sozinha (o navegador confere a assinatura do arquivo); os cliques vão direto para o servidor do Órbita.");
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
      // AD-185: no Google, a marcação automática (gclid) é o que liga o clique à campanha mesmo sem utm
      h("p", { class: "campo-ajuda" }, "No Google Ads, deixe ligada a «Marcação automática» (Configurações da conta): ela acrescenta o gclid, que o Órbita usa mesmo quando os parâmetros acima faltam. No Meta, {{site_source_name}} e {{placement}} dizem se o anúncio rodou no Facebook ou no Instagram e em qual posição."),
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
  let tCliques = 0;
  function painelCliques() {
    const corpo = h("div", { class: "ads-rastreio-corpo", "aria-busy": "true" }, ui.esqueleto("kpi", { n: 3 }));
    const status = h("p", { class: "sub ads-rastreio-st", role: "status", "aria-live": "polite" });
    const testar = h("button", { type: "button", class: "bt bt-sec", on: { click: () => testarScript(testar, status) } }, ui.icone("raio"), "Testar");
    const atualizar = h("button", { type: "button", class: "bt bt-fant bt-p", on: { click: () => carregarCliques(corpo, atualizar) } }, ui.icone("reabrir"), "Atualizar");
    const sec = h("section", { class: "cartao pilha ads-rastreio", id: "rastc-painel", "aria-labelledby": "rastc-painel-h" },
      h("div", { class: "cartao-cab" }, h("div", null,
        h("h3", { id: "rastc-painel-h", class: "titulo-sec", tabindex: "-1" }, "Cliques do site"),
        h("p", { class: "sub" }, "Cada toque no botão do WhatsApp do site, nos últimos 30 dias: quantos viraram negócio com a campanha certa e, quando não, por quê. Atualiza sozinho a cada 30 segundos enquanto esta tela está aberta."))),
      corpo, h("div", { class: "linha rastc-acoes" }, testar, atualizar), status);
    carregarCliques(corpo, atualizar);
    // plano 1000 (AD-249): durante o teste no site, o clique aparece sem precisar de «Atualizar» — a cada 30 s, só com a aba visível
    // e a seção na tela; para sozinho quando a seção sai do DOM (troca de seção, repintura)
    clearInterval(tCliques);
    tCliques = setInterval(() => {
      if (!sec.isConnected) { clearInterval(tCliques); return; }
      if (typeof document !== "undefined" && document.hidden) return;
      if (corpo.getAttribute("aria-busy") === "true") return;
      carregarCliques(corpo, atualizar, { silencioso: true });
    }, 30000);
    if (tCliques && typeof tCliques.unref === "function") tCliques.unref();   // fora do navegador (testes) o relógio não segura o processo
    return sec;
  }

  async function carregarCliques(corpo, botao, { silencioso = false } = {}) {
    if (!silencioso) corpo.setAttribute("aria-busy", "true");
    if (botao && !silencioso) botao.disabled = true;
    try {
      const r = await api.rpcC("nx_rastreio_listar", { p_dias: 30 });
      if (corpo.isConnected === false) return;   // a tela foi redesenhada enquanto a resposta vinha
      // a lista aberta (filtro e «mostrar mais») sobrevive à atualização automática
      const antes = { filtro: corpo.dataset.filtro || "", qtd: Number(corpo.dataset.qtd) || 10 };
      ui.limpar(corpo);
      desenharCliques(corpo, resumoRastreio(r, { ultimos: 10 }), antes);
    } catch (e) {
      if (silencioso) return;                    // a atualização automática que falha não apaga o que está na tela
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

  function desenharCliques(corpo, R, { filtro = "", qtd = 10 } = {}) {
    if (R.vazio) {
      corpo.append(ui.vazio({ tema: "ads", titulo: "Nenhum clique nos últimos 30 dias", texto: "Depois de instalar o script, toque no botão do WhatsApp do site (ou use «Testar») para conferir." }));
      return;
    }
    const T = R.totais;
    // plano 1000 (AD-180): a prova da instalação — quando e de qual site veio o último clique de verdade (o «Testar» só prova a chave)
    corpo.append(R.ultimoReal
      ? h("p", { class: "aviso aviso-ok ads-rastreio-ultimo", role: "note" }, ui.icone("check"),
        h("span", null, "O site está mandando cliques: o último foi ", h("b", null, quandoCurto(R.ultimoReal.em)), " em ", h("b", null, R.ultimoReal.host), "."))
      : h("p", { class: "aviso aviso-aten ads-rastreio-ultimo", role: "note" }, ui.icone("info"),
        h("span", null, "Ainda não chegou nenhum clique de um site de verdade (só testes). Abra o site, toque no botão do WhatsApp e volte aqui.")));
    // AD-250: a porcentagem que casou fica no próprio cartão (antes só na ajuda)
    const kCasou = ui.kpi({ rotulo: "Casaram com um negócio", valor: T.casados, ajuda: "Cliques cujo código chegou na conversa e foi aplicado ao negócio." });
    if (T.pct != null) kCasou.append(h("small", { class: "kpi-sub ads-rastreio-pct" }, `${T.pct}% dos cliques`));
    corpo.append(h("div", { class: "rel-kpis ads-rastreio-kpis" },
      ui.kpi({ rotulo: "Cliques no WhatsApp", valor: T.cliques, ajuda: "Toques no botão do WhatsApp do site com o script ativo." }),
      kCasou,
      T.pendentes == null ? null : ui.kpi({ rotulo: "Esperando o negócio", valor: T.pendentes, ajuda: "O código chegou antes de o negócio existir; ele é aplicado sozinho quando o negócio nascer (até 30 dias)." })));
    // AD-181: de quais sites vieram os cliques — domínio novo em destaque (a chave é pública: usada em outro site, aparece aqui)
    if (R.hosts.length) {
      const novos = R.hosts.filter(x => x.novo);
      corpo.append(h("div", { class: "ads-rastreio-bloco" }, h("h4", { class: "rotulo" }, "Sites que mandaram cliques"),
        novos.length ? h("p", { class: "aviso aviso-aten", role: "note" }, ui.icone("alerta"),
          h("span", null, `${novos.length === 1 ? "Um site novo começou" : `${novos.length} sites novos começaram`} a mandar cliques com a sua chave nesta semana: ${novos.map(x => x.host).join(", ")}. Se não for seu, gere uma chave nova e atualize o seu site.`)) : null,
        h("ul", { class: "ads-rastreio-hosts" }, R.hosts.map(x => h("li", null, h("span", { class: "mono" }, x.host),
          x.novo ? h("span", { class: "pilula pilula-p pilula-aten" }, "novo") : null,
          h("small", { class: "campo-ajuda" }, `${x.cliques} ${x.cliques === 1 ? "clique" : "cliques"} · último ${quandoCurto(x.ultimo)}`))))));
    }
    if (R.motivos.length) {
      const max = Math.max(...R.motivos.map(m => m.n));
      corpo.append(h("div", { class: "ads-rastreio-bloco" }, h("h4", { class: "rotulo" }, "O que aconteceu com cada clique"),
        // AD-189: o número e a porcentagem («12 (40%)») — a barra sozinha não diz a proporção
        h("ul", { class: "ads-rastreio-motivos" }, R.motivos.map(m => h("li", null, h("span", null, m.rotulo),
          h("span", { class: "ads-rastreio-barra", "aria-hidden": "true" }, h("i", { style: { "--w": `${Math.round(m.n / max * 100)}%` } })),
          h("b", { class: "rel-num" }, m.pct == null ? String(m.n) : `${m.n} (${m.pct}%)`))))));
    }
    if (R.campanhas.length) {
      corpo.append(h("div", { class: "ads-rastreio-bloco" }, h("h4", { class: "rotulo" }, "Por campanha"),
        h("div", { class: "rel-tabela-rolagem", role: "region", tabindex: "0", "aria-label": "Cliques por campanha" },
          h("table", { class: "rel-tabela" }, h("caption", { class: "sr-only" }, "Cliques do site por campanha nos últimos 30 dias"),
            h("thead", null, h("tr", null, h("th", { scope: "col" }, "Campanha"), h("th", { scope: "col", class: "num" }, "Cliques"), h("th", { scope: "col", class: "num" }, "Casaram"))),
            h("tbody", null, R.campanhas.slice(0, 12).map(c => h("tr", null, h("th", { scope: "row" }, c.nome), h("td", { class: "num", dataset: { l: "Cliques" } }, String(c.cliques)), h("td", { class: "num", dataset: { l: "Casaram" } }, String(c.casados)))))))));
    }
    if (R.todos.length) {
      // AD-182: filtro por motivo e «Mostrar mais» (antes 10 fixos) — o estado fica no corpo e sobrevive à atualização automática
      const agora = Date.now();
      const lista = h("ul", { class: "ads-rastreio-lista" });
      const mais = h("button", { type: "button", class: "bt bt-fant bt-p ads-rastreio-mais" });
      const sel = h("select", { class: "ads-rastreio-filtro", "aria-label": "Filtrar os últimos cliques pelo que aconteceu" },
        h("option", { value: "" }, "Todos os cliques"), R.motivos.map(m => h("option", { value: m.rotulo, selected: m.rotulo === filtro }, `${m.rotulo} (${m.n})`)));
      const pintarLista = () => {
        const f = sel.value, base = filtrarCliques(R.todos, f, agora), n = Math.max(10, Number(corpo.dataset.qtd) || 10);
        corpo.dataset.filtro = f;
        ui.limpar(lista);
        for (const x of base.slice(0, n)) {
          const rot = rotuloMotivo(x.motivo, !!x.casou, { em: x.em, agora });
          lista.append(h("li", { class: x.casou ? "ok" : "" },
            h("div", { class: "ads-rastreio-l1" },
              ui.pilula(null, x.origem || (x.plataforma ? "anuncio" : "site"), { variante: "origem", plataforma: x.plataforma || undefined, tamanho: "p" }),
              h("span", { class: "ads-rastreio-camp" }, x.utm_campaign || "sem campanha"),
              h("span", { class: `pilula pilula-p ${x.casou ? "pilula-ok" : x.motivo === "pendente" || rot === "aguardando a mensagem" ? "pilula-aten" : "pilula-neutra"}` }, rot)),
            h("p", { class: "campo-ajuda" }, `${quandoCurto(x.em)} · ${paginaCurta(x.pagina)}${x.contato_nome ? ` · ${x.contato_nome}` : ""}`)));
        }
        if (!base.length) lista.append(h("li", { class: "campo-ajuda" }, "Nenhum clique com esse resultado."));
        mais.hidden = base.length <= n;
        mais.textContent = `Mostrar mais (${base.length - Math.min(n, base.length)})`;
      };
      corpo.dataset.qtd = String(Math.max(10, qtd));
      sel.addEventListener("change", () => { corpo.dataset.qtd = "10"; pintarLista(); });
      mais.addEventListener("click", () => { corpo.dataset.qtd = String((Number(corpo.dataset.qtd) || 10) + 20); pintarLista(); });
      corpo.append(h("div", { class: "ads-rastreio-bloco" }, h("div", { class: "linha ads-rastreio-cab" }, h("h4", { class: "rotulo" }, "Últimos cliques"), sel), lista, mais));
      pintarLista();
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
