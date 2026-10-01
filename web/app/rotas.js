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
});

/** Módulo lógico (ctx.carregar) → arquivo de entrada. */
export const ARQUIVOS = Object.freeze({
  inicio: "inicio.js", conversas: "conversas.js", crm: "crm.js", agenda: "agenda.js", anuncios: "anuncios.js", ads: "anuncios.js",
  automacoes: "automacoes.js", relatorios: "relatorios.js", config: "config.js", admin: "admin.js", login: "login.js",
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
  { id: "admin", rota: "admin/clientes", rotulo: "Admin", icone: "usuario", fixo: true },
]);

/** Áreas com entrada própria e sessão compartilhada. A filtragem é só navegação;
    autorização, plano e módulos continuam sendo verificados em acessoRota(). */
export const PRODUTOS = Object.freeze({
  crm: Object.freeze({ nome: "CRM", resumo: "Contatos, oportunidades, vendas e automações.", titulo: "Órbita CRM", rota: "crm", manifesto: "manifest-crm.webmanifest", itens: Object.freeze(["crm", "agenda", "empresas", "tarefas", "automacoes"]) }),
  ads: Object.freeze({ nome: "Nexus Ads", resumo: "Campanhas, origem dos leads e retorno.", titulo: "Nexus Ads · Órbita", rota: "anuncios", manifesto: "manifest-ads.webmanifest", itens: Object.freeze(["inicio", "anuncios", "relatorios"]) }),
  atendimento: Object.freeze({ nome: "Atendimento", resumo: "Conversas, equipe, agenda e automações.", titulo: "Órbita Atendimento", rota: "conversas", manifesto: "manifest-atendimento.webmanifest", itens: Object.freeze(["inicio", "conversas", "agenda", "automacoes"]) }),
});

/** Produto solicitado na query string. Somente os três ids conhecidos são aceitos. */
export function produtoDe(busca = "") {
  const q = new URLSearchParams(String(busca).replace(/^\?/, ""));
  const id = q.get("produto");
  return Object.hasOwn(PRODUTOS, id) ? id : null;
}

export function produtoInicial(id) { return PRODUTOS[id]?.rota || null; }
export function urlProduto(id) { return Object.hasOwn(PRODUTOS, id) ? `/${id}/` : null; }
export function manifestoProduto(id) { return PRODUTOS[id]?.manifesto || "manifest.webmanifest"; }

/** Uma entrada de produto também é uma fronteira de navegação visual. As rotas
    públicas e as áreas administrativas comuns mantêm os próprios gates de acesso. */
export function rotaNoProduto(id, modulo) {
  if (!id) return true;
  const produto = PRODUTOS[id];
  if (!produto || !modulo) return false;
  if (ROTAS[modulo]?.publica || modulo === "config" || modulo === "admin") return true;
  if (produto.itens.includes(modulo)) return true;
  return id === "crm" && modulo === "contatos";
}

/** Produto padrão para abrir um deep link quando ele veio de outro espaço. */
export function produtoDaRota(modulo) {
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

/** Tipo de esqueleto (ui.esqueleto) com a forma de cada tela enquanto o módulo e os dados chegam. */
const ESQUELETO_DA_ROTA = Object.freeze({
  inicio: "inicio", conversas: "chat", crm: "kanban", contatos: "lista", empresas: "lista", tarefas: "lista", agenda: "agenda",
  anuncios: "ads", relatorios: "ads", automacoes: "lista", config: "lista", admin: "tabela",
});
export function esqueletoDaRota(modulo, partes = []) {
  if (modulo === "crm" && partes && partes[0] === "negocio") return "lista";
  return Object.hasOwn(ESQUELETO_DA_ROTA, modulo) ? ESQUELETO_DA_ROTA[modulo] : "lista";
}

/** Barra inferior do celular: até 4 itens + "Mais". */
export const BARRA = Object.freeze(["inicio", "conversas", "crm", "agenda"]);

export const PAPEIS = Object.freeze(["leitura", "atendente", "supervisor", "admin", "gestor", "super"]);
export function rank(p) { const i = PAPEIS.indexOf(p); return i < 0 ? -1 : i; }
export function podePapel(papel, min) { return !min || rank(papel) >= rank(min); }

function dec(s) { try { return decodeURIComponent(s); } catch { return s; } }

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
    const k = dec((j < 0 ? par : par.slice(0, j)).replace(/\+/g, " "));
    const v = j < 0 ? "" : dec(par.slice(j + 1).replace(/\+/g, " "));
    if (k) query[k] = v;
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
  const ordem = ["inicio", "conversas", "crm", "contatos", "tarefas", "anuncios", "relatorios", "automacoes"];
  const produto = PRODUTOS[opcoes.produto];
  const preferida = produto ? [produto.rota, ...produto.itens.flatMap(id => id === "crm" ? ["crm", "contatos"] : [id])].filter((id, i, a) => a.indexOf(id) === i) : ordem;
  if (opcoes.temCliente) for (const m of preferida) if (acessoRota(m, opcoes) === "ok") return m;
  if (opcoes.gestorConta) return "admin";
  return "config";
}
