/* ============================================================
   ÓRBITA — rotas.js (PURO, sem imports) · frente F3 · ESPEC §7.2
   rotear("#/crm/negocio/42?c=clinica-x")
     → { modulo:'crm', partes:['negocio','42'], query:{c:'clinica-x'} }
   ============================================================ */

/** Rotas do app: primeiro segmento do hash → arquivo, papel mínimo, módulo do plano e chave de prontos.js. */
export const ROTAS = Object.freeze({
  login:      { arquivo: "login.js", publica: true },
  convite:    { arquivo: "login.js", publica: true },
  senha:      { arquivo: "login.js", publica: true },
  testar:     { arquivo: "login.js", publica: true },        // plano 1500c · UC-001: o formulário só aparece quando a marca liga teste_aberto
  inicio:     { arquivo: "inicio.js", papel: "leitura", pronto: "inicio" },
  conversas:  { arquivo: "conversas.js", papel: "leitura", plano: "conversas", pronto: "conversas" },
  crm:        { arquivo: "crm.js", papel: "leitura", plano: "crm", pronto: "crm" },
  agenda:     { arquivo: "agenda.js", papel: "leitura", plano: "crm", pronto: "crm" },
  contatos:   { arquivo: "crm.js", papel: "leitura", plano: "crm", pronto: "crm" },
  empresas:   { arquivo: "crm.js", papel: "leitura", plano: "crm", pronto: "empresas" },
  tarefas:    { arquivo: "crm.js", papel: "leitura", plano: "crm", pronto: "tarefas" },
  anuncios:   { arquivo: "anuncios.js", papel: "admin", plano: "ads", pronto: "ads" },
  automacoes: { arquivo: "automacoes.js", papel: "supervisor", plano: "automacoes", pronto: "automacoes" },
  relatorios: { arquivo: "relatorios.js", papel: "leitura", plano: "relatorios", pronto: "relatorios" },
  config:     { arquivo: "config.js", papel: "leitura", semCliente: true },
  admin:      { arquivo: "admin.js", papel: "gestor", conta: true, semCliente: true },
  ajuda:      { arquivo: "ajuda.js", semCliente: true },      // plano 1500c · UCC-038/UC-013: Central de ajuda, aberta a todos
});

/** plano 2000d · DU-110: o papel «marketing» (agência de tráfego, quem cuida do Instagram) vê só Anúncios, Relatórios e a leitura do CRM —
    sem virar administrador de tudo. O servidor precisa aceitar o papel (pendência); sem ele, ninguém tem esse papel e nada muda. */
export const PAPEL_MARKETING = "marketing";
export const ROTAS_DO_MARKETING = Object.freeze(["inicio", "anuncios", "relatorios", "crm", "contatos", "config", "ajuda"]);

/** Módulo lógico (ctx.carregar) → arquivo de entrada. */
export const ARQUIVOS = Object.freeze({
  inicio: "inicio.js", conversas: "conversas.js", crm: "crm.js", agenda: "agenda.js", anuncios: "anuncios.js", ads: "anuncios.js",
  automacoes: "automacoes.js", relatorios: "relatorios.js", config: "config.js", admin: "admin.js", login: "login.js",
  ajuda: "ajuda.js",   // plano 1500c · UC-013
});

/** Itens do menu, na ordem. `rotulo` com {chave} usa o vocabulário da vertical.
    O CRM tem UMA entrada (#/crm, rótulo vocab.crm: "Pacientes" no odonto); Kanban × lista de contatos
    é navegação interna do crm.js (F4) — #/contatos acende a mesma entrada. */
export const MENU = Object.freeze([
  { id: "inicio", rota: "inicio", rotulo: "Início", icone: "inicio" },
  { id: "conversas", rota: "conversas", rotulo: "Conversas", icone: "chat" },
  { id: "crm", rota: "crm", rotulo: "{crm}", icone: "funil" },
  { id: "agenda", rota: "agenda", rotulo: "Agenda", icone: "calendario" },
  { id: "empresas", rota: "empresas", rotulo: "Empresas", icone: "empresa" },
  { id: "tarefas", rota: "tarefas", rotulo: "Tarefas", icone: "tarefa" },
  { id: "anuncios", rota: "anuncios", rotulo: "Anúncios", icone: "anuncio" },
  { id: "automacoes", rota: "automacoes", rotulo: "Automações", icone: "raio" },
  { id: "relatorios", rota: "relatorios/vendas", rotulo: "Relatórios", icone: "grafico" },
  { id: "config", rota: "config", rotulo: "Configurações", icone: "engrenagem", fixo: true },
  { id: "admin", rota: "admin/clientes", rotulo: "Admin", icone: "escudo", fixo: true },   // plano 1000 (AS-172): «usuario» já é Usuários/Pacientes
]);

/** Áreas com entrada própria e sessão compartilhada. A filtragem é só navegação;
    autorização, plano e módulos continuam sendo verificados em acessoRota(). */
export const PRODUTOS = Object.freeze({
  crm: Object.freeze({ nome: "CRM", resumo: "Contatos, oportunidades, vendas e automações.", titulo: "Órbita CRM", rota: "crm", manifesto: "manifest-crm.webmanifest", itens: Object.freeze(["crm", "agenda", "empresas", "tarefas", "automacoes"]) }),
  ads: Object.freeze({ nome: "Nexus Ads", resumo: "Campanhas, origem dos leads e retorno.", titulo: "Nexus Ads · Órbita", rota: "anuncios", manifesto: "manifest-ads.webmanifest", itens: Object.freeze(["inicio", "anuncios", "relatorios"]) }),
  atendimento: Object.freeze({ nome: "Atendimento", resumo: "Conversas, equipe, agenda e automações.", titulo: "Órbita Atendimento", rota: "conversas", manifesto: "manifest-atendimento.webmanifest", itens: Object.freeze(["inicio", "conversas", "agenda", "automacoes"]) }),
});

/** plano 2000d · DU-276: sem a marca carregada o nome é neutro («Painel») — «Órbita» só quando a marca padrão foi confirmada. */
export const NOME_NEUTRO = "Painel";
/** plano 2000d · DU-154/DU-436: um nome por produto nos textos visíveis. Na marca padrão o Ads mantém «Nexus Ads»; numa revenda, «Anúncios». */
export function nomesProdutos({ padrao = true } = {}) {
  return { crm: "CRM", ads: padrao ? PRODUTOS.ads.nome : "Anúncios", atendimento: "Atendimento" };
}
/** plano 2000d · DU-154: «Trocar entre CRM, Anúncios e Atendimento» com os nomes calculados (title/aria-label do botão de produtos). */
export function textoTrocarProdutos({ padrao = true } = {}) {
  const n = nomesProdutos({ padrao });
  return `Trocar entre ${n.crm}, ${n.ads} e ${n.atendimento}`;
}
/** plano 2000d · DU-197: o resumo do produto só promete o que o plano tem (Atendimento sem o CRM não fala em agenda). */
export function resumoDoProduto(id, modulos = null) {
  const p = PRODUTOS[id];
  if (!p) return "";
  if (id === "atendimento" && Array.isArray(modulos) && !modulos.includes("crm")) return "Conversas, equipe e automações.";
  return p.resumo;
}

/** Nome do app para o manifesto, o login e a pílula do topo: o produto da org (white-label) + a área aberta. Org padrão ("Órbita") usa os títulos fixos.
    plano 2000d · DU-276: sem produto, nome neutro; DU-153: revenda sem área usa o próprio texto (login_texto) ou «<produto> — atendimento e vendas»,
    nunca o slogan da plataforma; DU-445: `curto` (até 12, escolhido pela revenda) vence o nome curto calculado. */
export function nomeDoApp({ produto = NOME_NEUTRO, workspace = null, texto = "", curto: curtoMarca = "" } = {}) {
  const p = String(produto || NOME_NEUTRO).trim().slice(0, 40) || NOME_NEUTRO;
  const w = workspace && PRODUTOS[workspace];
  const padrao = p === "Órbita";
  const curtoProprio = String(curtoMarca || "").trim().slice(0, 12);
  const descricaoMarca = String(texto || "").trim().slice(0, 160) || `${p} — atendimento e vendas`;
  if (!w) return { name: p, short_name: curtoProprio || nomeCurto(p, ""), description: padrao ? "Anúncio, conversa e venda na mesma órbita." : descricaoMarca };
  const sufixo = { crm: "CRM", ads: "Anúncios", atendimento: "Atendimento" }[workspace] || w.nome;
  const curto = { crm: "CRM", ads: "Ads", atendimento: "Atend." }[workspace] || w.nome;
  return {
    name: padrao ? w.titulo : `${p} ${sufixo}`,
    short_name: padrao ? (workspace === "atendimento" ? "Atendimento" : curto) : (curtoProprio || nomeCurto(p, curto)),
    description: w.resumo,
  };
}
/** plano 1500c · UCC-037: nome curto (≤ 12) sem cortar palavra no meio — «Órbita Conve» virava rótulo do ícone. Cabe tudo → tudo; senão o
    produto sozinho (cortado na última palavra inteira); uma palavra só e longa → o curto da área. */
export function nomeCurto(produto, curto, max = 12) {
  const p = String(produto || "").trim(), c = String(curto || "").trim();
  const junto = `${p} ${c}`.trim();
  if (junto.length <= max) return junto;
  if (p.length <= max) return p;
  const corte = p.slice(0, max + 1).lastIndexOf(" ");
  if (corte > 0) return p.slice(0, corte).trim();
  return c && c.length <= max ? c : p.slice(0, max);
}
/** Ícone do sprite de cada produto (o CRM acompanha a vertical da empresa: dente, chave, sacola ou funil). */
export function iconeDoProduto(workspace, iconeCrm = "funil") { return workspace === "crm" ? iconeCrm : workspace === "ads" ? "anuncio" : workspace === "atendimento" ? "chat" : "camadas"; }

/** Produto solicitado na query string. Somente os três ids conhecidos são aceitos. */
export function produtoDe(busca = "") {
  const q = new URLSearchParams(String(busca).replace(/^\?/, ""));
  const id = q.get("produto");
  return Object.hasOwn(PRODUTOS, id) ? id : null;
}

export function produtoInicial(id) { return PRODUTOS[id]?.rota || null; }
/** plano 1500c · UCC-035: o endereço da entrada do produto é RELATIVO ao app (web/app/ → web/<id>/): no espelho do GitHub Pages
    (/nexus-ads/app/) «/crm/» ia para a raiz do domínio (404). `base` = a URL (ou o caminho) da página do app; sem base, o caminho do Netlify. */
export function urlProduto(id, { base = null } = {}) {
  if (!Object.hasOwn(PRODUTOS, id)) return null;
  if (!base) return `/${id}/`;
  try { return new URL(`../${id}/`, new URL(String(base), "http://x.invalid")).pathname; } catch { return `/${id}/`; }
}
export function manifestoProduto(id) { return PRODUTOS[id]?.manifesto || "manifest.webmanifest"; }

/** Uma entrada de produto também é uma fronteira de navegação visual. As rotas
    públicas e as áreas administrativas comuns mantêm os próprios gates de acesso. */
export function rotaNoProduto(id, modulo) {
  if (!id) return true;
  const produto = PRODUTOS[id];
  if (!produto || !modulo) return false;
  if (ROTAS[modulo]?.publica || modulo === "config" || modulo === "admin" || modulo === "ajuda") return true;   // plano 1500c · UCC-038: ajuda em todo produto
  if (produto.itens.includes(modulo)) return true;
  return id === "crm" && modulo === "contatos";
}

/** Produto padrão para abrir um deep link quando ele veio de outro espaço. */
export function produtoDaRota(modulo, atual = null) {
  // plano 1500c · UCC-036: «Início» é de cada produto — um link #/inicio dentro do CRM não atravessa para o Nexus Ads (fica no produto aberto)
  if (modulo === "inicio" && atual && Object.hasOwn(PRODUTOS, atual)) return atual;
  if (modulo === "contatos") return "crm";
  for (const [id, produto] of Object.entries(PRODUTOS)) {
    if (produto.itens.includes(modulo)) return id;
  }
  return null;
}

/** Mantém as áreas de conta e filtra o restante da lista já autorizada pelo shell. */
export function itensDoProduto(id, disponiveis = []) {
  const regra = PRODUTOS[id];
  if (!regra) return disponiveis.slice();
  const permitidos = new Set(regra.itens);
  return disponiveis.filter(it => it.fixo || permitidos.has(it.id));
}

/**
 * Itens do menu que ESTA pessoa vê neste produto: papel, plano, prontos.js e produto aberto (o menu lateral, a barra de baixo e o «Ir para» da
 * paleta Ctrl/⌘+K leem a mesma lista). `op` é o que o shell dá a acessoRota (pronto, temModulo, pode, gestorConta, temCliente, produto);
 * `prontos` = MODULOS_PRONTOS; `dev` marca como «obra» o que ainda não está pronto (só superadmin com ?dev=1).
 */
export function itensDoMenu({ op, vocab = {}, workspace = null, prontos = [], dev = false } = {}) {
  const itens = [];
  for (const it of MENU) {
    if (it.id === "admin") { if (op.gestorConta) itens.push({ ...it, rotulo: "Admin" }); continue; }
    if (it.id === "config") { itens.push(it); continue; }
    const acesso = acessoRota(it.id, op);
    const emConstrucao = !!dev && !prontos.includes(ROTAS[it.id].pronto);
    if (acesso === "ok") itens.push({ ...it, rotulo: it.rotulo.replace(/\{(\w+)\}/g, (_, k) => vocab[k] || k), icone: it.id === "crm" ? (vocab.icone_crm || it.icone) : it.icone, emConstrucao });
  }
  return itensDoProduto(workspace, itens);
}

/** Tipo de esqueleto (ui.esqueleto) com a forma de cada tela enquanto o módulo e os dados chegam. */
const ESQUELETO_DA_ROTA = Object.freeze({
  inicio: "inicio", conversas: "chat", crm: "kanban", contatos: "lista", empresas: "lista", tarefas: "lista", agenda: "agenda",
  anuncios: "ads", relatorios: "ads", automacoes: "lista", config: "lista", admin: "tabela",
});
/** plano 2000d · DU-360: o que a tela está carregando, para a linha «Ainda carregando as automações…» depois de 5 s. */
export const O_QUE_CARREGA = Object.freeze({ inicio: "o início", conversas: "as conversas", crm: "os negócios", contatos: "os contatos", empresas: "as empresas",
  tarefas: "as tarefas", agenda: "a agenda", automacoes: "as automações", relatorios: "os relatórios", anuncios: "os anúncios", config: "as configurações", ajuda: "a ajuda" });
export function textoCarregandoDemorou(modulo) {
  const o = Object.hasOwn(O_QUE_CARREGA, modulo) ? O_QUE_CARREGA[modulo] : "esta tela";
  return `Ainda carregando ${o}… Pode ser a conexão; a tela aparece assim que chegar.`;
}
/** plano 2000d · DU-452: o nome da empresa que cabe no topo do celular — a 1ª palavra que não é genérica («Clínica», «Oficina»…), até 12 letras. */
const PALAVRAS_GENERICAS_EMPRESA = new Set(["clinica", "clínica", "oficina", "loja", "auto", "centro", "consultorio", "consultório", "studio", "estudio", "estúdio", "a", "o", "os", "as", "de", "da", "do"]);
export function nomeCurtoEmpresa(nome) {
  const ps = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!ps.length) return "";
  const p = ps.find(x => !PALAVRAS_GENERICAS_EMPRESA.has(x.toLowerCase())) || ps[0];
  return p.length > 12 ? `${p.slice(0, 11)}…` : p;
}
export function esqueletoDaRota(modulo, partes = []) {
  if (modulo === "crm" && partes && partes[0] === "negocio") return "lista";
  return Object.hasOwn(ESQUELETO_DA_ROTA, modulo) ? ESQUELETO_DA_ROTA[modulo] : "lista";
}

/**
 * Regiões de cada tela para os atalhos de teclado «Ir para…» (M22). Cada item é [rótulo do atalho, seletor do alvo]. O seletor usa o RÓTULO
 * ACESSÍVEL da região (aria-label), que é o contrato com o leitor de tela — não uma classe de CSS. Alvo que não existe naquele momento
 * (conversa ainda não aberta, outra visão do CRM) simplesmente não ganha atalho. O módulo pode registrar os seus por ctx.atalhosDeRegiao(…).
 * A ORDEM é a do Tab: lista → conversa → campo de mensagem (o campo fica a 3 Tabs do topo).
 */
export const REGIOES_DA_ROTA = Object.freeze({
  conversas: Object.freeze([
    Object.freeze(["Ir para a lista de conversas", "[aria-label='Lista de conversas']"]),
    Object.freeze(["Ir para a conversa", "[role='log'][aria-label='Mensagens']"]),
    Object.freeze(["Ir para o campo de mensagem", "textarea[aria-label='Mensagem']"]),
  ]),
  crm: Object.freeze([Object.freeze(["Ir para o quadro", "[role='region'][aria-label^='Quadro de']"])]),
  // plano 1000b · UB-176: Automações (as duas seções nomeadas pelo título) e Configurações (o menu de seções e a seção aberta;
  // a seção ainda não tem nome acessível próprio — pendência da frente config — então o alvo é a classe dela)
  automacoes: Object.freeze([
    Object.freeze(["Ir para Suas automações", "section[aria-labelledby='au-suas']"]),
    Object.freeze(["Ir para Receitas", "section[aria-labelledby='au-mod']"]),
  ]),
  config: Object.freeze([
    Object.freeze(["Ir para o menu de seções", "nav[aria-label='Seções das configurações']"]),
    Object.freeze(["Ir para a seção", "section.cfg-sec"]),
  ]),
});
export function regioesDaRota(modulo) {
  return (Object.hasOwn(REGIOES_DA_ROTA, modulo) ? REGIOES_DA_ROTA[modulo] : []).map(([rotulo, alvo]) => ({ rotulo, alvo }));
}

/** Barra inferior do celular: até 4 itens + "Mais". */
export const BARRA = Object.freeze(["inicio", "conversas", "crm", "agenda"]);
/** plano 1000b · UB-278: quantas aberturas pelo «Mais» fazem um item ganhar o 4º lugar da barra. */
export const USOS_PARA_BARRA = 3;
/** itensDaBarra(itens, usos, base) → até 4 itens da barra inferior. Os da BARRA que a pessoa vê, completados pela ordem do menu (sem os fixos);
    o item que mais vezes foi aberto pelo «Mais» (`usos[id]` ≥ USOS_PARA_BARRA) entra no 4º lugar. */
/** plano 2000d · DU-277: `escolha` = ids que a pessoa escolheu em «Editar barra» (até 4 + «Mais»); só valem os que estão na lista dela agora —
    item que saiu do plano some, e com menos de 1 válido volta ao automático. */
export const MAX_ITENS_BARRA = 4;
export function escolhaDaBarra(itens, escolha) {
  const lista = Array.isArray(itens) ? itens : [];
  if (!Array.isArray(escolha)) return null;
  const vistos = new Set();
  const r = [];
  for (const id of escolha) {
    const it = lista.find(i => i.id === id && !i.fixo);
    if (it && !vistos.has(id) && r.length < MAX_ITENS_BARRA) { vistos.add(id); r.push(it); }
  }
  return r.length ? r : null;
}
export function itensDaBarra(itens, usos = {}, base = BARRA, escolha = null) {
  const lista = Array.isArray(itens) ? itens : [];
  const escolhidos = escolhaDaBarra(lista, escolha);   // plano 2000d · DU-277
  if (escolhidos) return escolhidos;
  const prefer = base.map(id => lista.find(i => i.id === id)).filter(Boolean);
  for (const it of lista) if (prefer.length < 4 && !prefer.includes(it) && !it.fixo) prefer.push(it);
  let fav = null, max = USOS_PARA_BARRA - 1;
  for (const it of lista) {
    if (it.fixo || prefer.includes(it)) continue;
    const n = Number(usos && Object.hasOwn(usos, it.id) ? usos[it.id] : 0) || 0;
    if (n > max) { max = n; fav = it; }
  }
  if (fav) { if (prefer.length >= 4) prefer[3] = fav; else prefer.push(fav); }
  return prefer;
}

/** plano 2000d · DU-218: o rótulo do papel num lugar puro e já carregado no boot (o convite não baixa mais o config.js de 171 KB para isso). */
export const ROTULOS_PAPEL = Object.freeze({ admin: "Administrador", supervisor: "Supervisor", atendente: "Atendente", leitura: "Somente leitura", gestor: "Gestor", marketing: "Marketing" });
export function rotuloPapel(p, { minusculo = false } = {}) {
  const r = ROTULOS_PAPEL[p] || (p ? String(p) : "usuário");
  return minusculo ? r.toLowerCase() : r;
}
export const PAPEIS = Object.freeze(["leitura", "atendente", "supervisor", "admin", "gestor", "super"]);
export function rank(p) { const i = PAPEIS.indexOf(p); return i < 0 ? -1 : i; }
export function podePapel(papel, min) { return !min || rank(papel) >= rank(min); }

function dec(s) { try { return decodeURIComponent(s); } catch { return s; } }
const CHAVES_PROIBIDAS = new Set(["__proto__", "constructor", "prototype"]);   // plano 1500c · UCC-034

/** Hash → { modulo, partes, query }. Hash vazio → modulo null. */
export function rotear(hash) {
  let s = String(hash ?? "");
  if (s.startsWith("#")) s = s.slice(1);
  if (s.startsWith("/")) s = s.slice(1);
  let q = "";
  const i = s.indexOf("?");
  if (i >= 0) { q = s.slice(i + 1); s = s.slice(0, i); }
  const segs = s.split("/").filter(Boolean).map(dec);
  const query = {};
  for (const par of q.split("&")) {
    if (!par) continue;
    const j = par.indexOf("=");
    // plano 1500c · UCC-033: o «+» do hash é sinal de verdade (#/conversas?tel=+5512…): só %2B/%20 são decodificados, nada vira espaço
    const k = dec(j < 0 ? par : par.slice(0, j));
    const v = j < 0 ? "" : dec(par.slice(j + 1));
    // plano 1500c · UCC-034: «?__proto__=x» (ou constructor/prototype) não mexe no protótipo do objeto da query
    if (k && !CHAVES_PROIBIDAS.has(k)) query[k] = v;
  }
  return { modulo: segs[0] || null, partes: segs.slice(1), query };
}

/** { modulo, partes, query } → "#/modulo/p1/p2?k=v". */
export function montarHash(modulo, partes = [], query = {}) {
  const caminho = [modulo, ...partes].filter(x => x !== null && x !== undefined && x !== "").map(x => encodeURIComponent(String(x))).join("/");
  const qs = Object.entries(query || {}).filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
  return "#/" + caminho + (qs ? "?" + qs : "");
}

/** Definição da rota (ou null se não existe). */
export function rotaDe(modulo) { return Object.prototype.hasOwnProperty.call(ROTAS, modulo) ? ROTAS[modulo] : null; }

/**
 * Estado de acesso a uma rota: 'ok' | 'inexistente' | 'em_breve' | 'fora_do_plano' | 'sem_acesso' | 'sem_cliente'.
 * `pronto(chave)`, `temModulo(m)`, `pode(min)` vêm do shell; `gestorConta` = conta com papel 'gestor' (revenda ou super).
 */
export function acessoRota(modulo, { pronto, temModulo, pode, gestorConta, temCliente, papel = null }) {
  const r = rotaDe(modulo);
  if (!r) return "inexistente";
  if (r.publica) return "ok";
  if (r.conta) return gestorConta ? "ok" : "sem_acesso";
  if (!temCliente && !r.semCliente) return "sem_cliente";
  if (r.pronto && !pronto(r.pronto)) return "em_breve";
  if (r.plano && !temModulo(r.plano)) return "fora_do_plano";
  // plano 2000d · DU-110: o marketing entra pelo módulo (Anúncios exige admin para os outros papéis), não pelo degrau do papel
  if (papel === PAPEL_MARKETING && temCliente) return ROTAS_DO_MARKETING.includes(modulo) ? "ok" : "sem_acesso";
  if (r.papel && temCliente && !pode(r.papel)) return "sem_acesso";
  return "ok";
}
/** plano 2000d · DU-110: o marketing só LÊ o CRM (o shell e as telas perguntam antes de mostrar botões de alterar). */
export function soLeitura(papel, modulo) { return papel === PAPEL_MARKETING && (modulo === "crm" || modulo === "contatos"); }

/** Rota padrão depois do login: inicio se pronto; senão o 1º módulo pronto e permitido; senão admin (gestor) ou config. */
export function rotaPadrao(opcoes) {
  // plano 1500c · UCC-039: plano só com a agenda também tem para onde ir (antes caía na tela bloqueada)
  const ordem = ["inicio", "conversas", "crm", "contatos", "agenda", "tarefas", "anuncios", "relatorios", "automacoes"];
  const produto = PRODUTOS[opcoes.produto];
  const preferida = produto ? [produto.rota, ...produto.itens.flatMap(id => id === "crm" ? ["crm", "contatos"] : [id])].filter((id, i, a) => a.indexOf(id) === i) : ordem;
  if (opcoes.temCliente) for (const m of preferida) if (acessoRota(m, opcoes) === "ok") return m;
  if (opcoes.gestorConta) return "admin";
  return "config";
}

/** plano 1500c · UCC-043: o hash de entrada de uma rota padrão (antes calculado em dois lugares do app.js). */
export function hashDaRota(modulo) {
  if (modulo === "relatorios") return "#/relatorios/vendas";
  if (modulo === "admin") return "#/admin/clientes";
  return `#/${modulo || ""}`;
}

/** plano 1500c · UC-004: dias inteiros de hoje (dia de São Paulo, 'AAAA-MM-DD') até o fim do teste. Aceita 'AAAA-MM-DD' ou timestamp (o dia dele
    em São Paulo). 0 = termina hoje; negativo = já venceu; sem data válida = null. Uma conta só para o shell e o Admin. */
export function diasAteFimTeste(testeAte, hojeISO) {
  const dia = v => {
    const s = String(v ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const t = Date.parse(s);
    if (!s || !Number.isFinite(t)) return null;
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t)); } catch { return null; }
  };
  const a = dia(testeAte), h = dia(hojeISO);
  if (!a || !h) return null;
  const d = Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${h}T12:00:00Z`)) / 86400000);
  return Number.isFinite(d) ? d : null;
}

/** plano 1500c · UC-027: o texto da pílula de teste — com até 7 dias, a contagem («Teste: 3 dias» / «Teste: termina hoje»); antes disso, a data. */
export function textoPilulaTeste(dias, dataCurta) {
  if (dias === null || dias === undefined || !Number.isFinite(Number(dias))) return { curto: "Em teste", longo: "Empresa em período de teste." };
  const d = Number(dias);
  if (d <= 0) return { curto: "Teste: termina hoje", longo: "O teste grátis termina hoje." };
  if (d <= 7) return { curto: `Teste: ${d} dia${d === 1 ? "" : "s"}`, longo: `O teste grátis termina em ${d} dia${d === 1 ? "" : "s"}${dataCurta ? `, em ${dataCurta}` : ""}.` };
  return { curto: `Teste até ${dataCurta || ""}`.trim(), longo: `Teste grátis até ${dataCurta || ""}.` };
}

/** plano 1500c · UCC-031: a sessão vence em menos de `margemMs` (padrão 10 min)? `expiraEm` é o que o servidor mandar (ISO ou ms); sem ele, false. */
export function sessaoPertoDeVencer(expiraEm, agoraMs = Date.now(), margemMs = 10 * 60000) {
  const t = typeof expiraEm === "number" ? expiraEm : Date.parse(String(expiraEm || ""));
  if (!Number.isFinite(t)) return false;
  return t > agoraMs && t - agoraMs <= margemMs;
}

/** plano 1500c · UCC-094: o módulo do plano que liga cada produto (o seletor marca «Não incluso» quando a empresa não tem). */
export const PLANO_DO_PRODUTO = Object.freeze({ crm: "crm", ads: "ads", atendimento: "conversas" });
export function produtoIncluso(id, modulos = []) {
  const m = PLANO_DO_PRODUTO[id];
  return !m || (Array.isArray(modulos) && modulos.includes(m));
}
/** plano 1500c · UCC-095/UCC-094: três frases do que o módulo resolve — o «fora do plano» e o «Conhecer» mostram isso em vez de só bloquear. */
export const BENEFICIOS_DO_MODULO = Object.freeze({
  crm: Object.freeze(["Funil de vendas com cada oportunidade e o valor previsto.", "Ficha de cada cliente com conversas, tarefas e histórico.", "Agenda com lembrete e confirmação pelo WhatsApp."]),
  ads: Object.freeze(["Gasto, conversas e vendas de cada campanha num lugar só.", "A origem de cada lead (qual anúncio trouxe).", "Alertas quando o custo por resultado dispara."]),
  conversas: Object.freeze(["WhatsApp da empresa com a equipe inteira atendendo.", "Respostas rápidas, etiquetas e transferência entre pessoas.", "Mensagens fora do horário respondidas sozinhas."]),
  automacoes: Object.freeze(["Lembretes e retornos que saem sozinhos.", "Mover a oportunidade de etapa sem ninguém precisar lembrar.", "Receitas prontas para começar em minutos."]),
  relatorios: Object.freeze(["Vendas e atendimento por período e por pessoa.", "Taxa de conversão do funil e tempo de resposta.", "Exportar para planilha quando precisar."]),
});
export function beneficiosDe(modulo) {
  const r = ROTAS[modulo];
  const chave = r && r.plano ? r.plano : (PLANO_DO_PRODUTO[modulo] || modulo);
  return Object.hasOwn(BENEFICIOS_DO_MODULO, chave) ? BENEFICIOS_DO_MODULO[chave].slice() : [];
}

/* ---------------- plano 1500c · lote sis-a3: venda e primeira semana ---------------- */
/** UC-005: a janela «Seu teste acaba em N dias» — só para o administrador da empresa (nunca no suporte da plataforma), quando faltam
    exatamente 3 ou 1 dia(s), uma vez por dia (chaveAvisoTeste). */
// plano 2000d · DU-233: também na metade de um teste de 14 dias (7) e na manhã do último dia (0)
export const DIAS_AVISO_TESTE = Object.freeze([7, 3, 1, 0]);
export const chaveAvisoTeste = (cliId, dia) => `nx-teste-aviso:${cliId || "-"}:${dia || "-"}`;
export function deveAvisarFimTeste({ cli, dias, papel, visto = false } = {}) {
  if (!cli || cli.suporte || cli.status !== "teste" || visto) return false;
  if (!podePapel(papel, "admin") || papel === "gestor" || papel === "super") return false;
  return DIAS_AVISO_TESTE.includes(dias);
}
/** plano 2000d · DU-233: o tom muda com a proximidade — lembrança (7), aviso (3), urgência (1 e 0). Sempre com «Ver planos». */
export function avisoFimTeste(dias) {
  const d = Number(dias);
  if (d <= 0) return { tom: "urgente", titulo: "Seu teste acaba hoje", texto: "Hoje é o último dia do teste grátis. Escolha um plano para não parar o atendimento amanhã." };
  if (d === 1) return { tom: "urgente", titulo: "Seu teste acaba amanhã", texto: "Falta 1 dia para o teste grátis terminar." };
  if (d <= 3) return { tom: "aviso", titulo: `Seu teste acaba em ${d} dias`, texto: `Faltam ${d} dias para o teste grátis terminar.` };
  return { tom: "lembrete", titulo: `Metade do teste: faltam ${d} dias`, texto: `Você ainda tem ${d} dias de teste grátis. Um bom momento para conectar o que falta e ver os planos.` };
}
/** UC-006: o que acontece quando o teste acaba — o que para e (com marca.retencao_dias) por quanto tempo os dados ficam guardados. */
export function textoTesteVencido({ equipe = false, retencaoDias = null } = {}) {
  if (equipe) return "O teste deste cliente terminou. Só a equipe consegue alterar dados.";
  const n = Number(retencaoDias);
  const guarda = Number.isInteger(n) && n > 0 ? ` Seus contatos, conversas e negócios continuam guardados por ${n} dia${n === 1 ? "" : "s"}.` : "";
  // plano 2000d · DU-240: o próximo passo vem junto (a faixa ganha o botão «Ver planos»)
  return `O período de teste terminou: você pode consultar, mas não alterar nada. As automações, lembretes e envios automáticos ficam parados.${guarda} Para voltar a usar, escolha um plano.`;
}
/** UC-003: o pedido de contratação, pronto para copiar ou mandar no WhatsApp (sem dado pessoal além do nome da empresa). */
export function textoPedidoContratacao({ produto = "", empresa = "", plano = "", revenda = "" } = {}) {
  const app = String(produto || "").trim() || "o sistema";
  return [`Olá${revenda ? `, ${revenda}` : ""}! Quero continuar usando ${app}${empresa ? ` na ${empresa}` : ""}.`,
    plano ? `Plano atual: ${plano}.` : "", "Pode me passar os valores e como assinar?"].filter(Boolean).join(" ");
}
/** UC-018: a janela de boas-vindas — uma vez por conta+empresa, nunca no suporte, na demonstração ou por cima de outra janela. */
export const chaveBoasVindas = (conta, cliId) => `nx-boas-vindas:${conta || "-"}:${cliId || "-"}`;
export function deveMostrarBoasVindas({ cli, papel, visto = false, dialogoAberto = false, demo = false } = {}) {
  if (!cli || cli.suporte || visto || dialogoAberto || demo) return false;
  return podePapel(papel, "admin") && papel !== "gestor" && papel !== "super";
}
/** UC-020: «Conecte o WhatsApp para começar a atender» — admin, empresa com Conversas no plano e nenhum número; dispensa vale 7 dias.
    plano 2000d · DU-244: em teste, a dispensa vale 2 dias (metade de um teste de 14 não passa sem lembrar). */
export const DISPENSA_SEM_WHATSAPP_MS = 7 * 24 * 3600000;
export const DISPENSA_SEM_WHATSAPP_TESTE_MS = 2 * 24 * 3600000;
export const chaveSemWhatsapp = cliId => `nx-sem-whatsapp:${cliId || "-"}`;
export function faltaWhatsapp({ cli, papel, dispensadoEm = 0, agora = Date.now() } = {}) {
  if (!cli || cli.suporte || !Array.isArray(cli.modulos) || !cli.modulos.includes("conversas")) return false;
  if (!Array.isArray(cli.canais) || cli.canais.length) return false;   // sem a lista (servidor antigo) não conclui nada
  if (!podePapel(papel, "admin") || papel === "gestor" || papel === "super") return false;
  const prazo = cli.status === "teste" ? DISPENSA_SEM_WHATSAPP_TESTE_MS : DISPENSA_SEM_WHATSAPP_MS;   // plano 2000d · DU-244
  return !(Number(dispensadoEm) > 0 && agora - Number(dispensadoEm) < prazo);
}
/** UC-034: «3/9» do checklist de primeiros passos (nx_onboarding_estado); null quando não há o que mostrar (completo, dispensado ou sem dados).
    UC-011: onboardingCompleto(estado) diz se está 100 % (o menu responde «Tudo pronto» em vez de abrir o Início). */
export function onboardingCompleto(estado) {
  const l = estado && (Array.isArray(estado.itens) ? estado.itens : Array.isArray(estado.passos) ? estado.passos : null);
  return !!(l && l.length && l.every(p => p && (p.feito === true || p.ok === true)));
}
export function seloPrimeirosPassos(estado) {
  if (!estado || typeof estado !== "object" || estado.dispensado) return null;
  const passos = Array.isArray(estado.itens) ? estado.itens : Array.isArray(estado.passos) ? estado.passos : null;   // nx_onboarding_estado devolve {itens:[{id, feito}]}
  const total = passos ? passos.length : Number(estado.total);
  const feitos = passos ? passos.filter(p => p && (p.feito === true || p.ok === true)).length : Number(estado.feitos);
  if (!(Number.isInteger(total) && total > 0) || !Number.isInteger(feitos) || feitos >= total) return null;
  return { feitos, total, texto: `${feitos}/${total}`, rotulo: `Primeiros passos: ${feitos} de ${total} feitos` };
}

/* ---------------- plano 2000d · primeira semana ---------------- */
/** DU-236: quanto tempo cada passo leva (o servidor manda os ids; o que não está aqui fica sem estimativa) e a rota que o resolve. */
export const PASSOS_INFO = Object.freeze({
  whatsapp: Object.freeze({ min: 3, hash: "#/config/numeros?assistente=novo" }), conectar_whatsapp: Object.freeze({ min: 3, hash: "#/config/numeros?assistente=novo" }),
  equipe: Object.freeze({ min: 2, hash: "#/config/equipe?convidar=1" }), convidar: Object.freeze({ min: 2, hash: "#/config/equipe?convidar=1" }),
  contatos: Object.freeze({ min: 3, hash: "#/crm?importar=1" }), importar: Object.freeze({ min: 3, hash: "#/crm?importar=1" }),
  automacao: Object.freeze({ min: 2, hash: "#/automacoes" }), agenda: Object.freeze({ min: 4, hash: "#/config/agenda" }),
  marca: Object.freeze({ min: 2, hash: "#/config/marca" }), perfil: Object.freeze({ min: 1, hash: "#/config/perfil" }),
  respostas: Object.freeze({ min: 3, hash: "#/config/respostas" }), funil: Object.freeze({ min: 3, hash: "#/config/funil" }),
});
const passosDe = estado => (estado && (Array.isArray(estado.itens) ? estado.itens : Array.isArray(estado.passos) ? estado.passos : null)) || [];
/** DU-236: o primeiro passo ainda não feito (na ordem do servidor), com «~N min» e o destino; null se tudo feito/sem dados. */
export function proximoPasso(estado) {
  const p = passosDe(estado).find(x => x && !(x.feito === true || x.ok === true));
  if (!p) return null;
  const info = PASSOS_INFO[p.id] || {};
  return { id: p.id || null, titulo: p.titulo || p.rotulo || null, minutos: info.min || null, tempo: info.min ? `~${info.min} min` : "", hash: p.hash || info.hash || "#/inicio?passos=1" };
}
/** DU-449: «Ver como (1 min)» — o vídeo do passo vem da marca (marca.videos_passos[id]) ou do próprio passo; sem vídeo, null. */
export function videoDoPasso(passo, marca = null) {
  const id = passo && passo.id;
  const m = marca && marca.videos_passos && typeof marca.videos_passos === "object" && id && Object.hasOwn(marca.videos_passos, id) ? marca.videos_passos[id] : null;
  const url = String(m || (passo && passo.video) || "").trim();
  return /^https:\/\/[^\s]+$/i.test(url) ? { url, rotulo: "Ver como (1 min)" } : null;
}
/** DU-239: ao dispensar os primeiros passos, onde reabrir. */
export const TEXTO_REABRIR_PASSOS = "Você pode reabrir em Ajuda › Primeiros passos.";
/** DU-238: marcos de ativação (1º, 10º, 100º) — só na virada de um contador; devolve o marco atingido ou null. */
export const MARCOS = Object.freeze([1, 10, 100]);
export function marcoAtingido(antes, depois) {
  const a = Number(antes) || 0, d = Number(depois) || 0;
  if (!(d > a)) return null;
  let achou = null;
  for (const m of MARCOS) if (a < m && d >= m) achou = m;
  return achou;
}
/** DU-238: a frase do marco por tipo de contador (ia_respostas, automacoes_execucoes, conversas_respondidas). */
export function textoMarco(tipo, n) {
  const q = Number(n) || 0;
  if (tipo === "ia_respostas") return q === 1 ? "A IA respondeu a primeira conversa por você." : `A IA já respondeu ${q} conversas por você.`;
  if (tipo === "automacoes_execucoes") return q === 1 ? "Sua primeira automação rodou sozinha." : `Suas automações já rodaram ${q} vezes sozinhas.`;
  if (tipo === "conversas_respondidas") return q === 1 ? "Primeira conversa respondida pelo sistema." : `${q} conversas respondidas pelo sistema.`;
  return null;
}
/** DU-242: o objetivo principal (pergunta das boas-vindas) ordena o Início e os primeiros passos. */
export const OBJETIVOS = Object.freeze([
  Object.freeze({ id: "responder", rotulo: "Responder mais rápido no WhatsApp" }),
  Object.freeze({ id: "organizar", rotulo: "Organizar clientes e vendas" }),
  Object.freeze({ id: "anunciar", rotulo: "Vender mais com anúncios" }),
]);
export const chaveObjetivo = cliId => `nx-objetivo:${cliId || "-"}`;
const ORDEM_DO_OBJETIVO = Object.freeze({
  responder: Object.freeze(["conversas", "automacoes", "agenda", "crm", "anuncios", "relatorios"]),
  organizar: Object.freeze(["crm", "agenda", "tarefas", "conversas", "automacoes", "relatorios"]),
  anunciar: Object.freeze(["anuncios", "relatorios", "crm", "conversas", "automacoes"]),
});
/** DU-242: os blocos do Início na ordem do objetivo (os que não estão na lista do objetivo vêm depois, na ordem dada). */
export function ordemDoInicio(objetivo, blocos = []) {
  const ordem = ORDEM_DO_OBJETIVO[objetivo];
  const lista = Array.isArray(blocos) ? blocos.slice() : [];
  if (!ordem) return lista;
  const pos = id => { const i = ordem.indexOf(id); return i < 0 ? ordem.length + lista.indexOf(id) : i; };
  return lista.sort((a, b) => pos(a) - pos(b));
}
/** DU-242: passos ordenados pelo objetivo (os ligados ao objetivo primeiro, o resto na ordem do servidor). */
const PASSOS_DO_OBJETIVO = Object.freeze({ responder: ["whatsapp", "conectar_whatsapp", "respostas", "automacao"], organizar: ["contatos", "importar", "funil", "agenda"], anunciar: ["marca", "contatos", "funil"] });
export function passosPorObjetivo(itens = [], objetivo = null) {
  const pref = PASSOS_DO_OBJETIVO[objetivo] || [];
  const l = Array.isArray(itens) ? itens.slice() : [];
  const pos = it => { const i = pref.indexOf(it && it.id); return i < 0 ? pref.length + l.indexOf(it) : i; };
  return l.sort((a, b) => pos(a) - pos(b));
}
/** DU-249: convite pela função da pessoa (o dono não precisa saber o nome do papel). */
export const FUNCOES_EQUIPE = Object.freeze([
  Object.freeze({ id: "recepcao", rotulo: "Recepção: atende e agenda", papel: "atendente" }),
  Object.freeze({ id: "vendas", rotulo: "Vendas: atende e cuida do funil", papel: "atendente" }),
  Object.freeze({ id: "gerente", rotulo: "Gerente: acompanha a equipe e as automações", papel: "supervisor" }),
  Object.freeze({ id: "socio", rotulo: "Sócio ou dono: tudo, inclusive configurações", papel: "admin" }),
  Object.freeze({ id: "consulta", rotulo: "Contador ou consultor: só consulta", papel: "leitura" }),
]);
export function papelDaFuncao(id) { const f = FUNCOES_EQUIPE.find(x => x.id === id); return f ? f.papel : null; }
/** DU-246: o tour de cada tela, na primeira visita (as paradas apontam pelo rótulo acessível, como os atalhos de região). */
export const TOUR_POR_ROTA = Object.freeze({
  conversas: Object.freeze([
    Object.freeze({ alvo: "[aria-label='Lista de conversas']", titulo: "Suas conversas", texto: "Cada cliente que escreve aparece aqui. Toque para abrir e responder." }),
    Object.freeze({ alvo: "textarea[aria-label='Mensagem']", titulo: "Responder", texto: "Escreva e envie. As respostas rápidas aparecem digitando «/»." }),
  ]),
  crm: Object.freeze([Object.freeze({ alvo: "[role='region'][aria-label^='Quadro de']", titulo: "Seu funil", texto: "Arraste um cartão para a próxima etapa quando o cliente avançar." })]),
  automacoes: Object.freeze([Object.freeze({ alvo: "section[aria-labelledby='au-mod']", titulo: "Receitas prontas", texto: "Escolha uma receita e ligue: lembretes e retornos saem sozinhos." })]),
});
export const chaveTourRota = (conta, rota) => `nx-tour-rota:${conta || "-"}:${rota || "-"}`;
export function paradasDoTour(rota) { return Object.hasOwn(TOUR_POR_ROTA, rota) ? TOUR_POR_ROTA[rota].map(p => ({ ...p })) : []; }
/** DU-451: ao trocar de empresa a tela continua a mesma; um item aberto (id na rota) é da empresa anterior e volta à lista. → hash ou null (fica). */
export function rotaAoTrocarEmpresa(r) {
  if (!r || !r.modulo || !Array.isArray(r.partes) || !r.partes.length) return null;
  if (r.modulo === "config" || r.modulo === "relatorios" || r.modulo === "admin" || r.modulo === "ajuda") return null;   // seções, não itens
  if (r.modulo === "crm" && r.partes[0] !== "negocio") return null;   // visões do CRM (kanban/lista) ficam
  return r.modulo === "crm" ? "#/crm" : `#/${r.modulo}`;
}
/** DU-353: datas e números no formato brasileiro, num lugar só (dd/mm, «hoje», «ontem», «há 5 min», R$ com centavos). */
export function dataBR(v, { agora = Date.now(), relativa = false } = {}) {
  const t = typeof v === "number" ? v : Date.parse(String(v ?? ""));
  if (!Number.isFinite(t)) return "";
  if (relativa) {
    const s = Math.round((agora - t) / 1000);
    if (s >= 0 && s < 60) return "agora";
    if (s >= 0 && s < 3600) return `há ${Math.floor(s / 60)} min`;
    const dia = x => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(x));
    const hoje = dia(agora), d = dia(t), ontem = dia(agora - 86400000);
    const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
    if (d === hoje) return `hoje, ${hora}`;
    if (d === ontem) return `ontem, ${hora}`;
  }
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(t));
}
export function dinheiroBR(n) {
  const v = Number(n);
  return Number.isFinite(v) ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v) : "";
}
export function numeroBR(n) { const v = Number(n); return Number.isFinite(v) ? new Intl.NumberFormat("pt-BR").format(v) : ""; }
