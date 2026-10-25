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

/** Nome do app para o manifesto, o login e a pílula do topo: o produto da org (white-label) + a área aberta. Org padrão ("Órbita") usa os títulos fixos. */
export function nomeDoApp({ produto = "Órbita", workspace = null } = {}) {
  const p = String(produto || "Órbita").trim().slice(0, 40) || "Órbita";
  const w = workspace && PRODUTOS[workspace];
  const padrao = p === "Órbita";
  if (!w) return { name: p, short_name: nomeCurto(p, ""), description: "Anúncio, conversa e venda na mesma órbita." };
  const sufixo = { crm: "CRM", ads: "Anúncios", atendimento: "Atendimento" }[workspace] || w.nome;
  const curto = { crm: "CRM", ads: "Ads", atendimento: "Atend." }[workspace] || w.nome;
  return {
    name: padrao ? w.titulo : `${p} ${sufixo}`,
    short_name: padrao ? (workspace === "atendimento" ? "Atendimento" : curto) : nomeCurto(p, curto),
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
export function itensDaBarra(itens, usos = {}, base = BARRA) {
  const lista = Array.isArray(itens) ? itens : [];
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
export function acessoRota(modulo, { pronto, temModulo, pode, gestorConta, temCliente }) {
  const r = rotaDe(modulo);
  if (!r) return "inexistente";
  if (r.publica) return "ok";
  if (r.conta) return gestorConta ? "ok" : "sem_acesso";
  if (!temCliente && !r.semCliente) return "sem_cliente";
  if (r.pronto && !pronto(r.pronto)) return "em_breve";
  if (r.plano && !temModulo(r.plano)) return "fora_do_plano";
  if (r.papel && temCliente && !pode(r.papel)) return "sem_acesso";
  return "ok";
}

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
export const DIAS_AVISO_TESTE = Object.freeze([3, 1]);
export const chaveAvisoTeste = (cliId, dia) => `nx-teste-aviso:${cliId || "-"}:${dia || "-"}`;
export function deveAvisarFimTeste({ cli, dias, papel, visto = false } = {}) {
  if (!cli || cli.suporte || cli.status !== "teste" || visto) return false;
  if (!podePapel(papel, "admin") || papel === "gestor" || papel === "super") return false;
  return DIAS_AVISO_TESTE.includes(dias);
}
/** UC-006: o que acontece quando o teste acaba — o que para e (com marca.retencao_dias) por quanto tempo os dados ficam guardados. */
export function textoTesteVencido({ equipe = false, retencaoDias = null } = {}) {
  if (equipe) return "O teste deste cliente terminou. Só a equipe consegue alterar dados.";
  const n = Number(retencaoDias);
  const guarda = Number.isInteger(n) && n > 0 ? ` Seus contatos, conversas e negócios continuam guardados por ${n} dia${n === 1 ? "" : "s"}.` : "";
  return `O período de teste terminou: você pode consultar, mas não alterar nada. As automações, lembretes e envios automáticos ficam parados.${guarda}`;
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
/** UC-020: «Conecte o WhatsApp para começar a atender» — admin, empresa com Conversas no plano e nenhum número; dispensa vale 7 dias. */
export const DISPENSA_SEM_WHATSAPP_MS = 7 * 24 * 3600000;
export const chaveSemWhatsapp = cliId => `nx-sem-whatsapp:${cliId || "-"}`;
export function faltaWhatsapp({ cli, papel, dispensadoEm = 0, agora = Date.now() } = {}) {
  if (!cli || cli.suporte || !Array.isArray(cli.modulos) || !cli.modulos.includes("conversas")) return false;
  if (!Array.isArray(cli.canais) || cli.canais.length) return false;   // sem a lista (servidor antigo) não conclui nada
  if (!podePapel(papel, "admin") || papel === "gestor" || papel === "super") return false;
  return !(Number(dispensadoEm) > 0 && agora - Number(dispensadoEm) < DISPENSA_SEM_WHATSAPP_MS);
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
