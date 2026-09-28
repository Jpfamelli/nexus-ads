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
  inicio: "inicio.js", conversas: "conversas.js", crm: "crm.js", anuncios: "anuncios.js", ads: "anuncios.js",
  automacoes: "automacoes.js", relatorios: "relatorios.js", config: "config.js", admin: "admin.js", login: "login.js",
});

/** Itens do menu, na ordem. `rotulo` com {chave} usa o vocabulário da vertical.
    O CRM tem UMA entrada (#/crm, rótulo vocab.crm: "Pacientes" no odonto); Kanban × lista de contatos
    é navegação interna do crm.js (F4) — #/contatos acende a mesma entrada. */
export const MENU = Object.freeze([
  { id: "inicio", rota: "inicio", rotulo: "Início", icone: "inicio" },
  { id: "conversas", rota: "conversas", rotulo: "Conversas", icone: "chat" },
  { id: "crm", rota: "crm", rotulo: "{crm}", icone: "funil" },
  { id: "empresas", rota: "empresas", rotulo: "Empresas", icone: "empresa" },
  { id: "tarefas", rota: "tarefas", rotulo: "Tarefas", icone: "tarefa" },
  { id: "anuncios", rota: "anuncios", rotulo: "Anúncios", icone: "anuncio" },
  { id: "automacoes", rota: "automacoes", rotulo: "Automações", icone: "raio" },
  { id: "relatorios", rota: "relatorios/vendas", rotulo: "Relatórios", icone: "grafico" },
  { id: "config", rota: "config", rotulo: "Configurações", icone: "engrenagem", fixo: true },
  { id: "admin", rota: "admin/clientes", rotulo: "Admin", icone: "usuario", fixo: true },
]);

/** Barra inferior do celular: até 4 itens + "Mais". */
export const BARRA = Object.freeze(["inicio", "conversas", "crm", "tarefas"]);

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
  if (opcoes.temCliente) for (const m of ordem) if (acessoRota(m, opcoes) === "ok") return m;
  if (opcoes.gestorConta) return "admin";
  return "config";
}
