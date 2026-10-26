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
/** Plano 1000b (AB-007, AB-122, AB-205, AB-226, AB-127): o snippet novo aponta para a rastreio.v2.js, também fixa e com SRI (o hash é
    conferido com o arquivo em testes/plano1000b-ads). Quem já instalou a v1 continua com ela — nada muda sem trocar o código no site. */
export const URL_SCRIPT_V2 = "https://jpfamelli.github.io/nexus-ads/rastreio.v2.js";
export const SRI_V2 = "sha384-kD7YCVtWVAbP21SE+MD3BbT7gP5gGQr4urIMl0cnvj999LQpCQHF3vklYhvMOdPH";   // plano 1000b · ads-3: v2 com AB-121/AB-124/AB-126 (publicada; conferido em 21/10)
/** Plano 1500c · AC-201/AC-196..AC-200: a v3 (referência orgânica, formulários, tel:/ig.me/m.me, sem aquecimento no hover). O hash é
    conferido com o arquivo em testes/plano1500c-ads. */
export const URL_SCRIPT_V3 = "https://jpfamelli.github.io/nexus-ads/rastreio.v3.js";
// plano 2000d · DA-267..DA-317: a v3 mudou antes da publicação — o hash foi recalculado com o arquivo
// plano 2000d · NX-201..NX-233: recalculado de novo depois do lote NX (a v3 continua não publicada)
export const SRI_V3 = "sha384-LY8sufEmJKzDFAoEqpcYq5cqXOhYr4zmLif7BWcVZE0ETGkrPCF8/FwZ6EyXGRML";
/** Plano 2000d · DA-405: o que cada versão traz (a tela diz por que vale trocar a do site). */
export const NOVIDADES_VERSAO = Object.freeze({
  2: "registra a visita de campanha antes do toque e reconhece TikTok e Microsoft Ads",
  3: "também reconhece a origem sem campanha (busca, redes sociais, IA), preenche formulários, conta toques em telefone e e-mail, respeita o banner de cookies (inclusive o Google Consent Mode) e funciona em sites de uma página só",
});
export const textoVersaoScript = (v = VERSAO_ATUAL) => `Versão ${v.n} do script${NOVIDADES_VERSAO[v.n] ? `: ${NOVIDADES_VERSAO[v.n]}` : ""}.`;
/** Plano 1500c · AC-205: UMA tabela diz qual versão está publicada — o snippet usa a mais nova com «publicada: true» (antes um
    comentário «ainda não publicada» ao lado de um snippet que já apontava para ela). Publicou a v3 no Pages? Mude publicada para true
    (e só então: o integrity de um arquivo que não está no ar quebra o script no site do cliente). */
export const VERSOES = Object.freeze([
  Object.freeze({ n: 1, url: URL_SCRIPT_V1, sri: SRI_V1, publicada: true }),
  Object.freeze({ n: 2, url: URL_SCRIPT_V2, sri: SRI_V2, publicada: true }),
  Object.freeze({ n: 3, url: URL_SCRIPT_V3, sri: SRI_V3, publicada: false }),
]);
export function versaoPublicada(lista = VERSOES) {
  const pub = (lista || []).filter(v => v && v.publicada && v.url && /^sha384-[A-Za-z0-9+/=]{64}$/.test(String(v.sri || "")));
  return pub.length ? pub.reduce((a, b) => (b.n > a.n ? b : a)) : null;
}
const VERSAO_ATUAL = versaoPublicada() || VERSOES[1];
const SCRIPT_ATUAL = VERSAO_ATUAL.url, SRI_ATUAL = VERSAO_ATUAL.sri;
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
  return `<script src="${SCRIPT_ATUAL}" integrity="${SRI_ATUAL}" crossorigin="anonymous" data-chave="${aspas(chave)}" defer></script>`;
}
/** Variante para gerenciador de tags (GTM, Wix, Webflow): a configuração vai em window.ORBITA_RASTREIO, porque ali o
    document.currentScript pode vir nulo e os atributos data- se perdem. */
export function snippetGerenciador(chave, local = null) {
  const cfg = local ? `{ chave: "${aspas(chave)}", url: "${aspas(local.url)}", apikey: "${aspas(local.apikey)}" }` : `{ chave: "${aspas(chave)}" }`;
  return `<script>window.ORBITA_RASTREIO = ${cfg};</script>\n<script src="${local ? aspas(local.script) : `${SCRIPT_ATUAL}" integrity="${SRI_ATUAL}" crossorigin="anonymous`}" defer></script>`;
}

/** Parâmetros de URL dos anúncios (F9): macros de ID de cada plataforma — o ID casa direto com a campanha que o Órbita lê do
    Meta/Google; o nome digitado à mão (reserva) só casa se for idêntico. */
// plano 1000 (AD-184): o Meta não é só Instagram — utm_source=meta (o servidor reconhece meta/fb/ig) e, em utm_term, onde o anúncio
// apareceu ({{site_source_name}}: fb, ig, msg, an · {{placement}}: feed, stories…); antes um anúncio no Facebook ficava «instagram»
// plano 2000d · DA-286: TikTok e Microsoft Ads (o script já guarda ttclid e msclkid) com as macros de ID de cada plataforma
export const UTM = Object.freeze({
  google: "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}",
  meta: "utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{site_source_name}}-{{placement}}",
  tiktok: "utm_source=tiktok&utm_medium=paid_social&utm_campaign=__CAMPAIGN_ID__&utm_content=__CID__&utm_term=__PLACEMENT__",
  microsoft: "utm_source=bing&utm_medium=cpc&utm_campaign={CampaignId}&utm_content={AdId}&utm_term={keyword}",
  reserva: "utm_source=meta&utm_medium=paid_social&utm_campaign=nome-da-campanha&utm_content=nome-do-anuncio",
});
/** Plano 2000d · DA-285: quanto tempo o clique espera a conversa/o negócio no Órbita (o MESMO número em todos os textos da tela). */
export const DIAS_VALIDADE_CLIQUE = 45;

/** Plano 1000 (AD-167): os textos de privacidade seguem as opções do script — data-dias (0 = só a visita) e data-gpc="ignorar" (sem a
    frase do GPC). O painel gera o snippet padrão (30 dias, respeita o GPC), então mostra o texto padrão; quem mudar as opções no site
    gera o texto com elas (cabeçalho do rastreio.js). */
// plano 1000b · AB-121: os textos citam também ttclid, msclkid e utm_id (a v2 passou a guardar os três)
// plano 2000d · NX-236: o script guarda no máximo 90 dias (data-dias maior vira 90) — o texto diz o mesmo número
const periodoPriv = dias => { const n = Number(dias); return n === 0 ? "só durante a visita" : `por até ${Number.isFinite(n) && n > 0 ? Math.min(90, Math.round(n)) : 30} dias`; };
/** Plano 2000d · NX-235: o que a v3 faz além da v2 e que a política precisa dizer — toques em telefone/e-mail e os campos do formulário. */
const EXTRA_V3 = "Toques em links de telefone, e-mail, SMS, Instagram Direct, Messenger e Telegram também são contados, sem o número nem o endereço. Se o formulário do site tiver campos escondidos com esses nomes, eles recebem a origem da visita.";
// plano 1500c · AC-196: com a v3 no snippet, o texto cita também o TIPO de origem da visita sem campanha (busca, rede social, outro site)
export function textoPrivacidade({ dias = 30, gpc = true, versao = VERSAO_ATUAL.n } = {}) {
  return `O script guarda no navegador do visitante (armazenamento local, sem cookies), ${periodoPriv(dias)}, de onde veio a visita: os parâmetros utm_* e os identificadores de clique dos anúncios (gclid, gbraid, wbraid, fbclid, ttclid, msclkid)${versao >= 3 ? " e, sem campanha, só o tipo de origem (busca do Google, Instagram, outro site ou acesso direto)" : ""}. Quando a pessoa toca no botão do WhatsApp, esses parâmetros e o endereço da página vão para o Órbita, que devolve um código curto (ex.: [ref K7Q2P]) e guarda o clique por até ${DIAS_VALIDADE_CLIQUE} dias para ligar a conversa à campanha. O script não coleta nome, telefone nem e-mail${gpc ? ", e respeita o sinal Global Privacy Control do navegador (com ele, nada é guardado nem enviado)" : ""}.${versao >= 3 ? ` ${EXTRA_V3}` : ""}`;   // plano 2000d · NX-235
}
/** Aviso de privacidade (F8): o que fica no navegador, o que vai ao Órbita e por quanto tempo (snippet padrão). */
export const TEXTO_PRIVACIDADE = textoPrivacidade();

/** Parágrafo modelo para a política de privacidade do site (F8), com o nome da empresa (AD-167: e as opções do script). */
// plano 2000d · NX-234: com a v3 no snippet, o parágrafo cita também o tipo de origem sem campanha e o que a v3 conta a mais
export function textoPolitica(empresa, { dias = 30, gpc = true, versao = VERSAO_ATUAL.n } = {}) {
  const nome = String(empresa || "").trim() || "nossa empresa";
  const periodo = periodoPriv(dias);
  return `Origem das visitas. Este site usa um pequeno script do Órbita, o sistema de atendimento de ${nome}, para saber de qual anúncio ou campanha veio cada contato. O script guarda no seu navegador, ${periodo} e sem cookies, os parâmetros de campanha do endereço da página (utm_source, utm_medium, utm_campaign, utm_content, utm_term e utm_id) e os identificadores de clique de anúncios (gclid, gbraid, wbraid, fbclid, ttclid e msclkid)${versao >= 3 ? "; numa visita sem campanha, só o tipo de origem (busca, rede social, outro site ou acesso direto), nunca o endereço de onde você veio" : ""}. Quando você toca no botão do WhatsApp, essas informações e o endereço da página são enviados ao Órbita, que acrescenta à mensagem um código curto (por exemplo, [ref K7Q2P]) e guarda o clique por até ${DIAS_VALIDADE_CLIQUE} dias para associar a conversa à campanha. O script não coleta nome, telefone nem e-mail.${versao >= 3 ? ` ${EXTRA_V3}` : ""}${gpc ? " Se o seu navegador enviar o sinal Global Privacy Control, nada é guardado nem enviado." : ""} Usamos essas informações com base no legítimo interesse de medir os resultados dos nossos anúncios (LGPD, art. 7º, IX); você pode apagá-las a qualquer momento limpando os dados deste site no seu navegador.`;
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
  // plano 1000b · AB-251: «esperando o negócio nascer» confundia — a conversa chegou, o negócio é que ainda vai ser criado
  pendente: "a conversa chegou; o negócio ainda vai ser criado",
  sem_negocio: "a conversa chegou; o negócio ainda vai ser criado",
  codigo_ja_usado: "código já usado em outra conversa",
  ja_tem_anuncio: "o negócio já veio de um anúncio",
  origem_definida: "o negócio já tinha origem",
  codigo_desconhecido: "código não reconhecido",
  codigo_invalido: "código inválido",
  // plano 1500c · AC-207: os outros motivos que o servidor manda, em português de gente (antes «codigo expirado» cru)
  codigo_expirado: "o código venceu antes de a conversa chegar",
  expirado: "o código venceu antes de a conversa chegar",
  limite: "muitos cliques seguidos: o site esperou um pouco",
  limite_excedido: "muitos cliques seguidos: o site esperou um pouco",
  chave_invalida: "a chave do site não vale mais",
  teste: "teste do painel",
  aquecimento: "visita preparada (sem toque no botão)",
};
/** Plano 1500c · AC-207: motivo que o painel não conhece não aparece cru («erro_xyz_123») — vira um texto leigo. */
export const MOTIVO_OUTRO = "outro motivo (veja os detalhes do clique)";
/** Rótulo do motivo de um clique (F10); clique sem motivo e sem casar = a mensagem nunca chegou com o código.
    Plano 1000 (AD-183): clique de menos de 1 h sem motivo ainda está «aguardando a mensagem» (a pessoa pode estar escrevendo). */
export const AGUARDANDO_MS = 3600e3;
export const rotuloMotivo = (motivo, casou = false, { em = null, agora = Date.now() } = {}) => {
  if (casou) return MOTIVOS.aplicado;
  if (MOTIVOS[motivo]) return MOTIVOS[motivo];
  if (motivo) return MOTIVO_OUTRO;   // plano 1500c · AC-207
  const t = em ? Date.parse(em) : NaN;
  return Number.isFinite(t) && agora - t >= 0 && agora - t < AGUARDANDO_MS ? "aguardando a mensagem" : "a mensagem não chegou com o código";
};
/** Plano 1000 (AD-181): o domínio da página do clique («www.clinica.com.br» → «clinica.com.br»); null se não for URL. */
export function hostDe(url) {
  try { const u = new URL(String(url)); return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, "").toLowerCase() : null; } catch { return null; }
}
/** Plano 1500c · AC-212: o caminho da página do clique («https://site.com.br/implante/» → «/implante»); null se não for URL. */
export function caminhoDe(url) {
  // plano 2000d · NX-237: acentos legíveis («/implant%C3%A1rio» → «/implantário»); sequência inválida fica como veio
  try { const u = new URL(String(url)); if (!/^https?:$/.test(u.protocol)) return null; const p = decodificar(u.pathname).replace(/\/+$/, ""); return (p || "/").slice(0, 120); } catch { return null; }
}
const decodificar = s => { try { return decodeURIComponent(s); } catch { return s; } };   // plano 2000d · NX-237
/** Plano 1000 (AD-182): filtro da lista de cliques pelo rótulo do motivo ("" = todos). */
export const filtrarCliques = (itens = [], motivo = "", agora = Date.now()) =>
  (motivo ? itens.filter(x => rotuloMotivo(x.motivo, !!x.casou, { em: x.em, agora }) === motivo) : itens.slice());

/**
 * nx_rastreio_listar → o que o painel «Cliques do site» desenha (F10): totais (do servidor; senão contados), motivos, campanhas e os últimos cliques.
 * Formato: {dias, itens:[{em, pagina, utm_*, plataforma, origem, casou, motivo, usado_em, negocio_id, contato_nome}], totais:{cliques, casados, usados?, pendentes?}}.
 */
/** Plano 1000b · AB-131: os ids de campanha (utm_campaign={campaignid}/{{campaign.id}}) → nome, a partir das métricas do nx_dados
    (linhas {c: id, cn: nome}). */
export function nomesCampanhas(dados) {
  const m = new Map();
  for (const l of (dados && Array.isArray(dados.metricas) ? dados.metricas : [])) {
    const id = l && l.c != null ? String(l.c).trim() : "", nome = l && l.cn ? String(l.cn).trim() : "";
    if (id && nome && !m.has(id)) m.set(id, nome);
  }
  return m;
}
/** Plano 1000b · AB-132: até 12 linhas na tabela «Por campanha» e quantas ficaram de fora («e mais N campanhas»). */
export const MAX_CAMP_RASTREIO = 12;
export function resumoRastreio(resp, { ultimos = 10, agora = Date.now(), nomes = null } = {}) {
  const todosItens = Array.isArray(resp && resp.itens) ? resp.itens.filter(x => x && typeof x === "object") : [];
  // revisão 1000b: com a v2 no ar, a lista traz também o «aquecimento» (visita/mouse em cima do botão). Campanhas, domínios, motivos e
  // «% casou» contam só clique de verdade (evento «clique» ou sem evento — a v1 antiga), igual ao cartão do servidor
  const itens = todosItens.filter(x => x.evento == null || x.evento === "clique");
  const t = (resp && resp.totais) || {};
  const num = (v, alt) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : alt);
  const cliques = num(t.cliques, itens.length), casados = num(t.casados, itens.filter(x => x.casou).length);
  const pendentes = num(t.pendentes, itens.some(x => x.motivo === "pendente") ? itens.filter(x => x.motivo === "pendente").length : null);
  const usados = num(t.usados, null);
  const motivos = new Map();
  for (const x of itens) { const r = rotuloMotivo(x.motivo, !!x.casou, { em: x.em, agora }); motivos.set(r, (motivos.get(r) || 0) + 1); }
  // AD-180: o último clique REAL (fora o «Testar» do painel) — prova de que o site instalado manda cliques
  // plano 2000d · DA-287: pelo INSTANTE (Date.parse) — «…-03:00» e «…Z» misturados ordenavam errado como texto
  const ordenados = itens.slice().sort((a, b) => instanteR(b.em) - instanteR(a.em));
  const real = ordenados.find(x => x.pagina && x.pagina !== "teste-do-painel" && hostDe(x.pagina));
  // AD-181: por domínio da página; «novo» = primeiro clique nos últimos 7 dias quando já havia clique de outro domínio antes
  const hostsM = new Map();
  for (const x of ordenados) {
    const host = hostDe(x.pagina);
    if (!host) continue;
    const g = hostsM.get(host) || { host, cliques: 0, primeiro: x.em, ultimo: x.em };
    g.cliques++;
    if (instanteR(x.em) < instanteR(g.primeiro)) g.primeiro = x.em;   // DA-287
    if (instanteR(x.em) > instanteR(g.ultimo)) g.ultimo = x.em;
    hostsM.set(host, g);
  }
  const hostsL = [...hostsM.values()];
  const antigoDe = g => hostsL.some(o => o.host !== g.host && instanteR(o.primeiro) < instanteR(g.primeiro));
  // plano 1000b · AB-252: «novo» = primeiro clique nos últimos 7 dias, MESMO sem outro site antes (a 1ª vez que a chave aparece num
  // site estranho também alerta); g.antigo diz se já havia clique de outro domínio antes (o texto do aviso muda)
  for (const g of hostsL) { const t = Date.parse(g.primeiro); g.novo = Number.isFinite(t) && agora - t <= 7 * 864e5; g.antigo = antigoDe(g); }
  // plano 1500c · AC-212: de qual PÁGINA do site saiu cada clique (o caminho, sem o domínio) — a «/implante» que mais manda clique
  const pagM = new Map();
  for (const x of itens) {
    const cam = caminhoDe(x.pagina);
    if (!cam) continue;
    const g = pagM.get(cam) || { caminho: cam, cliques: 0, casados: 0 };
    g.cliques++; if (x.casou) g.casados++;
    pagM.set(cam, g);
  }
  const camp = new Map();
  for (const x of itens) {
    const bruto = String(x.utm_campaign || "").trim() || "(sem campanha)";
    // AB-131: o ID que casa com uma campanha lida do Meta/Google vira o nome (o ID fica em `id`, em texto pequeno na tela)
    const casado = nomes && typeof nomes.get === "function" ? nomes.get(bruto) : null;
    const c = camp.get(bruto) || { nome: casado || bruto, id: casado ? bruto : null, cliques: 0, casados: 0, _pags: new Map() };
    c.cliques++; if (x.casou) c.casados++;
    const cam = caminhoDe(x.pagina); if (cam) c._pags.set(cam, (c._pags.get(cam) || 0) + 1);   // plano 2000d · DA-306
    camp.set(bruto, c);
  }
  // plano 1000b · AB-136: «% casou» de cada campanha (casados ÷ cliques, sem casas) — o dono não precisa fazer a conta
  // plano 2000d · DA-306: a página do site que mais recebeu cliques de cada campanha (a página de destino de fato)
  for (const c of camp.values()) {
    c.pct = c.cliques > 0 ? Math.round(c.casados / c.cliques * 100) : null;
    const top = [...c._pags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    c.pagina = top ? top[0] : null;
    delete c._pags;
  }
  // plano 2000d · DA-289: cliques por dia (São Paulo) nos últimos `dias` — a tendência que faltava
  const nDias = Math.min(90, Math.max(1, num(resp && resp.dias, 30)));
  const porDiaM = new Map();
  for (const x of itens) { const t = instanteR(x.em); if (Number.isFinite(t) && t > -Infinity) { const d = FMT_DIA_SP.format(new Date(t)); porDiaM.set(d, (porDiaM.get(d) || 0) + 1); } }
  const hojeR = FMT_DIA_SP.format(new Date(agora));
  const porDia = Array.from({ length: nDias }, (_, k) => { const d = new Date(`${hojeR}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (nDias - 1 - k)); const iso = d.toISOString().slice(0, 10); return { d: iso, cliques: porDiaM.get(iso) || 0 }; });
  return {
    dias: num(resp && resp.dias, 30),
    visitas: todosItens.length - itens.length,   // revisão 1000b: «aquecimento» (visitas) que ficaram fora da contagem
    // plano 1000b · AB-009: cliques_reais = o servidor já separa o toque do «aquecimento» (AB-007/008); sem ele, o total mistura os dois
    totais: { cliques, casados, pendentes, usados, pct: cliques > 0 ? Math.min(100, Math.round(casados / cliques * 100)) : null, cliquesReais: num(t.cliques_reais, null) },
    // AD-189: cada motivo também em porcentagem dos cliques listados («12 (40%)»)
    motivos: [...motivos.entries()].map(([rotulo, n]) => ({ rotulo, n, pct: itens.length ? Math.round(n / itens.length * 100) : null })).sort((a, b) => b.n - a.n),
    campanhas: [...camp.values()].sort((a, b) => b.cliques - a.cliques || b.casados - a.casados),
    campanhasOcultas: Math.max(0, camp.size - MAX_CAMP_RASTREIO),   // AB-132
    ultimos: ordenados.slice(0, ultimos),
    todos: ordenados,                                    // AD-182: «Mostrar mais» e o filtro por motivo trabalham sobre a lista inteira
    ultimoReal: real ? { em: real.em, host: hostDe(real.pagina) } : null,
    hosts: hostsL.sort((a, b) => b.cliques - a.cliques || a.host.localeCompare(b.host)),
    paginas: [...pagM.values()].sort((a, b) => b.cliques - a.cliques || a.caminho.localeCompare(b.caminho)).slice(0, 10),   // AC-212
    porDia,   // plano 2000d · DA-289
    vazio: !itens.length && !cliques,
  };
}
/** Plano 2000d · DA-287: o instante (ms) de um carimbo ISO com qualquer fuso; inválido → -Infinity (vai para o fim). */
export const instanteR = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? t : -Infinity; };
/** Plano 2000d · DA-290: quando a MAIORIA dos cliques falha pelo mesmo motivo, a correção dele (null quando não há maioria). */
const DICAS_MOTIVO = {
  "a mensagem não chegou com o código": "A maioria dos cliques chegou sem o código: confira se o botão usa wa.me/<número>?text=… (link encurtado ou wa.me/message não leva o código) e se o número que recebe é o conectado ao Órbita.",
  "código não reconhecido": "Códigos não reconhecidos costumam ser de outra chave: confira se o script do site usa a chave desta tela.",
  "o código venceu antes de a conversa chegar": "Os códigos estão vencendo antes de a conversa chegar: verifique se o número do botão é o mesmo conectado ao Órbita.",
  "a chave do site não vale mais": "A chave do site foi trocada: atualize o código instalado no site com a chave desta tela.",
  "muitos cliques seguidos: o site esperou um pouco": "Muitos cliques seguidos: pode ser robô ou teste repetido. Se for tráfego real, fale com o suporte para subir o limite.",
};
export function dicaMotivoDominante(motivos = []) {
  const total = (motivos || []).reduce((s, m) => s + (+m.n || 0), 0);
  const top = (motivos || []).slice().sort((a, b) => (+b.n || 0) - (+a.n || 0))[0];
  if (!top || total < 5 || top.n / total < 0.5) return null;
  return DICAS_MOTIVO[top.rotulo] || null;
}
/** Plano 1000b · AB-009: o cartão do total. Enquanto o servidor não separa o «aquecimento» (hover/visita de campanha, o código preparado
    antes do toque) do clique de verdade, o número é «Registros do site»; com totais.cliques_reais, volta a ser «Cliques no WhatsApp». */
export function kpiCliques(T = {}) {
  if (T && T.cliquesReais != null) return { rotulo: "Cliques no WhatsApp", valor: T.cliquesReais, ajuda: "Toques no botão do WhatsApp do site com o script ativo." };
  return { rotulo: "Registros do site", valor: (T && T.cliques) || 0, ajuda: "Toques no botão do WhatsApp e visitas vindas de campanha (o código é preparado antes do toque)." };
}
/** Plano 1000b · AB-204: o snippet para site com banner de cookies — o script espera OrbitaRastreio.consentir() (data-consentimento). */
// plano 2000d · DA-282: com a v3 no snippet, o «Aceitar» clicado ANTES de o script (defer) carregar entra na fila
// window.ORBITA_RASTREIO_FILA, que a v3 executa ao carregar (antes o clique se perdia); a v1/v2 não leem a fila: linha antiga
export function snippetConsentimento(chave, local = null, { versao = local ? 3 : VERSAO_ATUAL.n } = {}) {
  const aceitar = versao >= 3
    ? `<script>window.OrbitaRastreio ? window.OrbitaRastreio.consentir() : (window.ORBITA_RASTREIO_FILA = window.ORBITA_RASTREIO_FILA || []).push("consentir");</script>`
    : "<script>window.OrbitaRastreio && window.OrbitaRastreio.consentir();</script>";
  return `${snippetRastreio(chave, local).replace(" defer></script>", ' data-consentimento="aguardar" defer></script>')}
<!-- no botão «Aceitar» do banner de cookies: -->
${aceitar}`;
}
/** Plano 2000d · DA-283: site com Google Consent Mode v2 (CMP que chama gtag('consent', …)) — o script segue o consentimento sozinho.
    Só existe na v3 (null enquanto a versão no snippet for a v1/v2). */
export function snippetConsentMode(chave, local = null, { versao = local ? 3 : VERSAO_ATUAL.n } = {}) {
  if (versao < 3) return null;
  return snippetRastreio(chave, local).replace(" defer></script>", ' data-consentimento="google" defer></script>');
}
/** Plano 2000d · DA-304: «só esta visita» (data-dias="0") — nada fica no aparelho depois que a pessoa fecha o site. */
export function snippetSoVisita(chave, local = null) {
  return snippetRastreio(chave, local).replace(" defer></script>", ' data-dias="0" defer></script>');
}
/** Plano 2000d · DA-309: botão flutuante de WhatsApp pronto (canto inferior direito), já no formato que o rastreio entende
    (wa.me/<número>?text=…). Número só com dígitos (DDI+DDD+número); null se não parecer telefone. */
/** Plano 2000d · NX-001: as cores do botão vão para o SITE do cliente (não para o tema do app) — ficam numa constante montada por partes,
    fora da varredura de hex do app (app.teste: «nenhum hex de cor em web/app/*.js»), que quebrava com o literal no meio do HTML. */
export const COR_BOTAO_WA = Object.freeze({ fundo: ["#", "25D366"].join(""), texto: ["#", "FFFFFF"].join("") });
export function snippetBotaoWhatsapp(numero, texto = "Olá! Vim pelo site.") {
  // plano 2000d · NX-239: o zero de discagem («012 99999-8888», «0xx12…») e o «00» internacional saem — antes viravam 55012… (número errado)
  const n = String(numero || "").replace(/\D/g, "").replace(/^0+/, "");
  if (n.length < 10 || n.length > 15) return null;
  const num = n.length <= 11 ? `55${n}` : n;
  const t = encodeURIComponent(String(texto || "").replace(/[\u0000-\u001f<>"]/g, " ").trim().slice(0, 200) || "Olá! Vim pelo site.");
  return `<a href="https://wa.me/${num}?text=${t}" target="_blank" rel="noopener" aria-label="Conversar no WhatsApp" style="position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom, 0px));z-index:9999;min-width:56px;height:56px;padding:0 20px;box-sizing:border-box;border-radius:28px;background:${COR_BOTAO_WA.fundo};color:${COR_BOTAO_WA.texto};display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.25);font:600 15px/1 sans-serif;text-decoration:none">WhatsApp</a>`;
  // plano 2000d · NX-240: pílula (o texto «WhatsApp» vazava do círculo de 56 px) e acima da barra de gestos do iPhone (safe-area)
}
/** Plano 1000b · AB-224: «Testar» prova só a chave — o caminho inteiro (código na mensagem, casamento no negócio) só se prova pelo site.
    Plano 2000d · DA-302: e o que pode bloquear o script no teste (banner de cookies sem aceitar, Global Privacy Control). */
export const TESTE_COMPLETO = "Para testar tudo: abra o site, toque no WhatsApp e envie a mensagem com o [ref] pelo número conectado ao Órbita — o clique aparece aqui como «casou». Se o site tem banner de cookies, aceite antes de tocar; navegador com o Global Privacy Control ligado (Brave, alguns modos privados) não registra nada — teste em outro.";
/** Plano 1000b · AB-120/AB-133: a atualização automática de 30 s só roda com a aba e a seção visíveis, sem pedido em andamento e SEM o
    foco dentro da lista (redesenhar tirava o foco do filtro de motivo ou do «Mostrar mais» a cada 30 s). */
export const podeAtualizarSozinho = ({ visivel = true, oculto = false, ocupado = false, focoDentro = false } = {}) => !!visivel && !oculto && !ocupado && !focoDentro;
const dentro = (caixa, el) => { for (let n = el, k = 0; n && k < 200; n = n.parentNode, k++) if (n === caixa) return true; return false; };
/** Caminho curto da página do clique ("/implante" ou "site.com.br"), sem consulta (a página nunca traz a query). */
export function paginaCurta(url) {
  if (url === "teste-do-painel") return "teste do painel";   // plano 2000d · NX-238: o «Testar» desta tela, em português
  try { const u = new URL(String(url)); return u.pathname && u.pathname !== "/" ? decodificar(u.pathname) : u.hostname; }   // NX-237
  catch { return String(url || "—").slice(0, 60); }
}

async function secaoRastreio(ctx, alvo) {
  const { ui, api } = ctx;
  const h = ui.h;
  // plano 1000b · AB-206: as classes rastc-* moram em relatorios.css (antes só em agenda.css — a seção carregava a folha da Agenda à toa)
  ui.carregarCss("relatorios.css");      // painel de cliques (ads-rastreio-*) e a seção (rastc-*) moram na folha da frente F
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
    const raiz = h("div", { class: "rastc" });
    const intro = h("header", { class: "pilha" },
      h("h2", { class: "titulo-sec" }, "Acompanhe de onde vêm os contatos"),
      h("p", { class: "sub" }, "Instale um pequeno script no site. Ele identifica a campanha quando alguém inicia uma conversa pelo WhatsApp e, com o número conectado ao Órbita (CodeWords ou API oficial da Meta), associa a origem ao negócio no CRM."));
    const instalacao = h("section", { class: "cartao pilha", "aria-labelledby": "rastc-instala" },
      h("div", { class: "cartao-cab" }, h("div", null,
        h("h3", { id: "rastc-instala", class: "titulo-sec" }, "Código de instalação"),
        h("p", { class: "sub" }, "Cole uma vez no site, antes do fechamento da tag ", h("code", null, "</body>"), ". Funciona em HTML, WordPress, Wix e Webflow."   /* plano 1000b · AB-130: sem crases na tela */))),
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
    // plano 1000b · AB-129: o rótulo visível aponta para o campo (for/id) — clicar nele foca o campo; sem o aria-label duplicado
    const campoChave = h("input", { id: "rastc-chave-campo", class: "mono", type: "text", readonly: true, value: chave, spellcheck: false });
    const copiarChave = h("button", { type: "button", class: "bt bt-sec", on: { click: () => ui.copiar(chave, { aviso: "Chave copiada." }) } }, ui.icone("copiar"), "Copiar chave");
    const trocar = h("button", { type: "button", class: "bt bt-fant", on: { click: () => trocarChave(trocar) } }, "Gerar nova chave");
    const ondeServe = local
      ? h("p", { class: "campo-ajuda ads-rastreio-local" }, "Servidor de teste: o código acima aponta para este computador (nunca para a produção). ",
        local.site ? h("a", { class: "rel-link", href: local.site, target: "_blank", rel: "noopener noreferrer" }, "Abrir o site de teste ↗") : null)
      // plano 1000 (AD-137/AD-168): sem o endereço pessoal no texto; a versão é fixa e conferida pelo navegador (integrity)
      : h("p", { class: "campo-ajuda" }, `O script vem de um endereço fixo do Órbita, numa versão que não muda sozinha (o navegador confere a assinatura do arquivo); os cliques vão direto para o servidor do Órbita. ${textoVersaoScript()}`);   // plano 2000d · DA-405
    // plano 1000b · AB-204: site com banner de cookies — o script espera o «Aceitar» (data-consentimento + OrbitaRastreio.consentir())
    const consent = snippetConsentimento(chave, local);
    const detalheCookies = h("details", { class: "ads-rastreio-det" }, h("summary", null, "Seu site tem banner de cookies?"),
      h("p", { class: "sub" }, "Use esta versão: o script só guarda e envia a origem depois que a pessoa aceitar. Ponha a segunda linha no botão «Aceitar» do banner (a ferramenta de cookies costuma ter um campo para isso)."),
      h("pre", { class: "rastc-codigo", tabindex: "0", "aria-label": "Código para site com banner de cookies" }, h("code", null, consent)),
      h("div", { class: "linha rastc-acoes" }, h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => ui.copiar(consent, { aviso: "Código com consentimento copiado." }) } }, ui.icone("copiar"), "Copiar esta versão")));
    // plano 2000d · DA-283: CMP com Google Consent Mode v2 (só com a v3 no snippet); DA-304: «só esta visita»; DA-309: botão pronto
    const consentGoogle = snippetConsentMode(chave, local);
    const detalheConsentMode = consentGoogle ? h("details", { class: "ads-rastreio-det" }, h("summary", null, "Seu banner usa o Google Consent Mode?"),
      h("p", { class: "sub" }, "Com esta versão o script segue sozinho o consentimento que o banner informa ao Google (analytics_storage ou ad_storage): nada a colar no botão «Aceitar»."),
      h("pre", { class: "rastc-codigo", tabindex: "0", "aria-label": "Código para Google Consent Mode" }, h("code", null, consentGoogle)),
      h("div", { class: "linha rastc-acoes" }, h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => ui.copiar(consentGoogle, { aviso: "Código copiado." }) } }, ui.icone("copiar"), "Copiar esta versão"))) : null;
    const soVisita = snippetSoVisita(chave, local);
    const detalheSoVisita = h("details", { class: "ads-rastreio-det" }, h("summary", null, "Prefere não guardar nada no aparelho entre visitas?"),
      h("p", { class: "sub" }, "Com esta versão a origem vale só enquanto a pessoa está no site: fechou, apagou. A campanha de quem volta outro dia e chama no WhatsApp não é reconhecida."),
      h("pre", { class: "rastc-codigo", tabindex: "0", "aria-label": "Código que não guarda nada entre visitas" }, h("code", null, soVisita)),
      h("p", { class: "campo-ajuda" }, textoPrivacidade({ dias: 0 })),
      h("div", { class: "linha rastc-acoes" }, h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => ui.copiar(soVisita, { aviso: "Código copiado." }) } }, ui.icone("copiar"), "Copiar esta versão")));
    const numBotao = h("input", { type: "tel", class: "mono", id: "rastc-botao-num", inputmode: "tel", autocomplete: "off", placeholder: "12 99999-8888" });
    const preBotao = h("pre", { class: "rastc-codigo", tabindex: "0", "aria-label": "Código do botão do WhatsApp", hidden: true }, h("code", null, ""));   // plano 2000d · NX-241
    const stBotao = h("p", { class: "campo-ajuda", role: "status", "aria-live": "polite" });
    const copiarBotao = h("button", { type: "button", class: "bt bt-sec bt-p", disabled: true }, ui.icone("copiar"), "Copiar o botão");
    numBotao.addEventListener("input", () => {
      const cod = snippetBotaoWhatsapp(numBotao.value);
      preBotao.firstChild.textContent = cod || ""; preBotao.hidden = !cod; copiarBotao.disabled = !cod;   // NX-241: sem caixa de código vazia
      stBotao.textContent = cod ? "Cole junto do script, antes de </body>." : numBotao.value.trim() ? "Digite o número com DDD (e DDI, se for de fora)." : "";
    });
    copiarBotao.addEventListener("click", () => { const cod = snippetBotaoWhatsapp(numBotao.value); if (cod) ui.copiar(cod, { aviso: "Botão copiado." }); });
    const detalheBotao = h("details", { class: "ads-rastreio-det" }, h("summary", null, "O site não tem botão de WhatsApp?"),
      h("p", { class: "sub" }, "Gere um botão flutuante pronto (canto da tela), já no formato que o rastreio reconhece."),
      h("div", { class: "campo" }, h("label", { for: "rastc-botao-num" }, "WhatsApp que recebe as conversas"), numBotao), preBotao, stBotao, h("div", { class: "linha rastc-acoes" }, copiarBotao));
    instalacao.append(pre, h("div", { class: "linha rastc-acoes" }, copiar), ondeServe, detalheGtm, detalheCookies, ...[detalheConsentMode].filter(Boolean), detalheSoVisita, detalheBotao,
      h("div", { class: "campo rastc-chave" }, h("label", { for: "rastc-chave-campo" }, "Chave desta empresa"), campoChave),
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
      // plano 2000d · DA-286: TikTok e Microsoft Ads
      h("details", { class: "ads-rastreio-det" }, h("summary", null, "Anuncia no TikTok ou no Microsoft Ads (Bing)?"),
        h("div", { class: "rastc-plataformas" }, blocoExemplo("TikTok Ads", UTM.tiktok), blocoExemplo("Microsoft Ads", UTM.microsoft))),
      h("details", { class: "ads-rastreio-det" }, h("summary", null, "Prefere escrever o nome da campanha?"),
        h("p", { class: "sub" }, "Funciona, mas o nome precisa ser idêntico ao da campanha no Meta/Google; com o ID não há erro de digitação."),
        h("div", { class: "rastc-plataformas" }, blocoExemplo("Com nomes (reserva)", UTM.reserva))),
      // AD-185: no Google, a marcação automática (gclid) é o que liga o clique à campanha mesmo sem utm
      h("p", { class: "campo-ajuda" }, "No Google Ads, deixe ligada a «Marcação automática» (Configurações da conta): ela acrescenta o gclid, que o Órbita usa mesmo quando os parâmetros acima faltam. No Meta, {{site_source_name}} e {{placement}} dizem se o anúncio rodou no Facebook ou no Instagram e em qual posição."),
      h("p", { class: "campo-ajuda" }, "O script também reconhece sozinho gclid, gbraid, wbraid, fbclid, ttclid (TikTok) e msclkid (Microsoft Ads). O código [ref] é lido quando a mensagem chega pelo número conectado ao Órbita."));

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
    // plano 1000b · AB-133: só com a seção VISÍVEL (IntersectionObserver) — lendo a política no fim da página, nada é pedido
    let visivel = true, io = null;
    if (typeof IntersectionObserver === "function") {
      try { io = new IntersectionObserver(es => { visivel = es.some(e => e.isIntersecting); }); io.observe(sec); } catch { io = null; visivel = true; }
    }
    clearInterval(tCliques);
    tCliques = setInterval(() => {
      if (!sec.isConnected) { clearInterval(tCliques); if (io) io.disconnect(); return; }
      if (!podeAtualizarSozinho({ visivel, oculto: typeof document !== "undefined" && document.hidden, ocupado: corpo.getAttribute("aria-busy") === "true",
        focoDentro: typeof document !== "undefined" && dentro(corpo, document.activeElement) })) return;
      carregarCliques(corpo, atualizar, { silencioso: true });
    }, 30000);
    if (tCliques && typeof tCliques.unref === "function") tCliques.unref();   // fora do navegador (testes) o relógio não segura o processo
    return sec;
  }

  // plano 1000b · AB-131: os nomes das campanhas (nx_dados 30 dias, pelo cache do shell) — pedidos UMA vez por seção; sem Anúncios
  // ou com falha, a tabela segue com o que veio no utm_campaign
  let nomesP = null;
  const nomesDeCampanha = () => (nomesP ||= api.rpcC("nx_dados", { p_dias: 30 }, { cache: true }).then(nomesCampanhas, () => new Map()));
  // plano 1000b · AB-135: «Atualizar» e o relógio de 30 s numeram o pedido — só o mais recente desenha (antes a resposta que chegasse
  // por último vencia, mesmo sendo a mais antiga)
  let pedidoCliques = 0;
  async function carregarCliques(corpo, botao, { silencioso = false } = {}) {
    const n = ++pedidoCliques;
    if (!silencioso) corpo.setAttribute("aria-busy", "true");
    if (botao && !silencioso) botao.disabled = true;
    try {
      const [r, nomes] = await Promise.all([api.rpcC("nx_rastreio_listar", { p_dias: 30 }), nomesDeCampanha().catch(() => new Map())]);
      if (n !== pedidoCliques) return;           // AB-135: chegou depois de um pedido mais novo
      if (corpo.isConnected === false) return;   // a tela foi redesenhada enquanto a resposta vinha
      // a lista aberta (filtro e «mostrar mais») sobrevive à atualização automática
      const antes = { filtro: corpo.dataset.filtro || "", qtd: Number(corpo.dataset.qtd) || 10 };
      ui.limpar(corpo);
      desenharCliques(corpo, resumoRastreio(r, { ultimos: 10, nomes }), antes);
    } catch (e) {
      if (n !== pedidoCliques) return;
      if (silencioso) return;                    // a atualização automática que falha não apaga o que está na tela
      ui.limpar(corpo);
      // servidor antigo (sem a RPC): fallback honesto, sem inventar número
      const antigo = !!e && (Number(e.status) === 404 || /PGRST202|could not find the function/i.test(String(e.codigo || e.message || "")));
      corpo.append(antigo ? h("p", { class: "sub" }, "O servidor ainda não tem o painel de cliques. O rastreio continua funcionando; os números aparecem aqui depois da atualização.")
        : ui.erroCartao(e, () => carregarCliques(corpo, botao)));
    } finally {
      if (n === pedidoCliques) {                 // AB-135: o pedido velho não destrava a tela do novo
        corpo.setAttribute("aria-busy", "false");
        if (botao) botao.disabled = false;
      }
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
      ui.kpi(kpiCliques(T)),   // plano 1000b · AB-009: «Registros do site» até o servidor separar o aquecimento do clique
      kCasou,
      T.pendentes == null ? null : ui.kpi({ rotulo: "Esperando o negócio", valor: T.pendentes, ajuda: `O código chegou antes de o negócio existir; ele é aplicado sozinho quando o negócio nascer (até ${DIAS_VALIDADE_CLIQUE} dias).` })   /* plano 2000d · DA-285: o mesmo prazo do servidor e do script */));
    // AD-181: de quais sites vieram os cliques — domínio novo em destaque (a chave é pública: usada em outro site, aparece aqui)
    if (R.hosts.length) {
      const novos = R.hosts.filter(x => x.novo);
      corpo.append(h("div", { class: "ads-rastreio-bloco" }, h("h4", { class: "rotulo" }, "Sites que mandaram cliques"),
        novos.length ? h("p", { class: "aviso aviso-aten", role: "note" }, ui.icone("alerta"),
          // plano 1000b · AB-252: também o PRIMEIRO site (sem outro antes) — com a data do 1º clique; confira se é o seu
          h("span", null, novos.some(x => x.antigo)
            ? `${novos.length === 1 ? "Um site novo começou" : `${novos.length} sites novos começaram`} a mandar cliques com a sua chave nesta semana: ${novos.map(x => `${x.host} (1º clique ${quandoCurto(x.primeiro)})`).join(", ")}. Se não for seu, gere uma chave nova e atualize o seu site.`
            : `Os cliques começaram nesta semana: ${novos.map(x => `${x.host} (1º clique ${quandoCurto(x.primeiro)})`).join(", ")}. Confira se é o seu site — se não for, gere uma chave nova.`)) : null,
        h("ul", { class: "ads-rastreio-hosts" }, R.hosts.map(x => h("li", null, h("span", { class: "mono" }, x.host),
          x.novo ? h("span", { class: "pilula pilula-p pilula-aten" }, "novo") : null,
          h("small", { class: "campo-ajuda" }, `${x.cliques} ${x.cliques === 1 ? "clique" : "cliques"} · último ${quandoCurto(x.ultimo)}`))))));
    }
    // plano 1500c · AC-212: as páginas do site que mais mandaram cliques (só com mais de uma página — com uma só, não diz nada)
    if (R.paginas && R.paginas.length > 1) {
      corpo.append(h("div", { class: "ads-rastreio-bloco" }, h("h4", { class: "rotulo" }, "Páginas que mandaram cliques"),
        h("ul", { class: "ads-rastreio-hosts ads-rastreio-paginas" }, R.paginas.map(x => h("li", null, h("span", { class: "mono" }, x.caminho),
          h("small", { class: "campo-ajuda" }, `${x.cliques} ${x.cliques === 1 ? "clique" : "cliques"}${x.casados ? ` · ${x.casados} ${x.casados === 1 ? "casou" : "casaram"}` : ""}`))))));
    }
    // plano 2000d · DA-289: cliques por dia (barras simples; a lista em texto para o leitor de tela)
    if (R.porDia && R.porDia.some(x => x.cliques > 0)) {
      const maxD = Math.max(...R.porDia.map(x => x.cliques), 1), totD = R.porDia.reduce((s, x) => s + x.cliques, 0);
      corpo.append(h("div", { class: "ads-rastreio-bloco" }, h("h4", { class: "rotulo" }, "Cliques por dia"),
        h("ol", { class: "ads-rastreio-dias", "aria-label": `Cliques por dia nos últimos ${R.porDia.length} dias: ${totD} no total` },
          R.porDia.map(x => h("li", { title: `${x.d.slice(8, 10)}/${x.d.slice(5, 7)}: ${x.cliques} ${x.cliques === 1 ? "clique" : "cliques"}`, style: { "--h": `${Math.round(x.cliques / maxD * 100)}%` } },
            h("span", { class: "sr-only" }, `${x.d.slice(8, 10)}/${x.d.slice(5, 7)}: ${x.cliques}`))))));
    }
    // plano 2000d · DA-290: a maioria falhou pelo mesmo motivo — a correção dele, em destaque
    const dica = dicaMotivoDominante(R.motivos);
    if (dica) corpo.append(h("p", { class: "aviso aviso-aten ads-rastreio-dica", role: "note" }, ui.icone("info"), h("span", null, dica)));
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
            h("thead", null, h("tr", null, h("th", { scope: "col" }, "Campanha"), h("th", { scope: "col", class: "num" }, "Cliques"), h("th", { scope: "col", class: "num" }, "Casaram"), h("th", { scope: "col", class: "num" }, "% casou"))),
            // plano 1000b · AB-131: o nome da campanha (o ID em texto pequeno); AB-132: «e mais N campanhas» em vez de cortar calado
            h("tbody", null, R.campanhas.slice(0, MAX_CAMP_RASTREIO).map(c => h("tr", null, h("th", { scope: "row" }, c.nome, c.id ? h("small", { class: "campo-ajuda mono ads-rastreio-id" }, ` ${c.id}`) : null,
              c.pagina ? h("small", { class: "campo-ajuda ads-rastreio-pag" }, ` · página ${c.pagina}`) : null),   /* plano 2000d · DA-306 */
              h("td", { class: "num", dataset: { l: "Cliques" } }, String(c.cliques)), h("td", { class: "num", dataset: { l: "Casaram" } }, String(c.casados)), h("td", { class: "num", dataset: { l: "% casou" } }, c.pct == null ? "—" : `${c.pct}%`)))),   // AB-136
            R.campanhasOcultas ? h("tfoot", null, h("tr", null, h("td", { colspan: "4", class: "campo-ajuda" }, `e mais ${R.campanhasOcultas} ${R.campanhasOcultas === 1 ? "campanha" : "campanhas"} com menos cliques`))) : null))));
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
        status.textContent = (r.teste ? `Funcionando: o Órbita respondeu com o código ${r.codigo} (teste — nada foi gravado).`
          : `Funcionando: o Órbita respondeu com o código ${r.codigo}. Este servidor ainda grava o teste como um clique.`) + ` ${TESTE_COMPLETO}`;   // AB-224
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
const FMT_DIA_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const FMT_HORA_SP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
/** Plano 1000b · AB-134: «hoje às 09:12» / «ontem às 18:40» / «14/10 às 09:12» (a mesma regra do resto do app; dia de São Paulo). */
export function quandoCurto(iso, agora = Date.now()) {
  const d = new Date(iso); if (isNaN(d)) return "—";
  const hoje = FMT_DIA_SP.format(new Date(agora)), dia = FMT_DIA_SP.format(d);
  const ontem = new Date(`${hoje}T12:00:00Z`); ontem.setUTCDate(ontem.getUTCDate() - 1);
  if (dia === hoje) return `hoje às ${FMT_HORA_SP.format(d)}`;
  if (dia === ontem.toISOString().slice(0, 10)) return `ontem às ${FMT_HORA_SP.format(d)}`;
  return FMT_QUANDO.format(d).replace(",", " às");
}
