/* ============================================================
   ÓRBITA — cache.js · frente B · M16 (telas que abrem com o último dado)
   Guarda no aparelho (IndexedDB «orbita-cache») a ÚLTIMA resposta de leituras seguras, para a tela abrir na hora com o que havia
   e revalidar em seguida (stale-while-revalidate). O api.js usa assim: rpcC(nome, params, {cache: true, aoCache(dados, em)}).
   Privacidade (LGPD):
   - LISTA BRANCA: só entram as leituras de `CACHEAVEIS`; nunca corpo de mensagem, configurações, Admin, segredos, convites, domínios;
   - a lista de conversas só leva o que a lista mostra (nome, prévia de até 80 caracteres e contadores);
   - chave = conta:empresa:rpc:hash(parâmetros): outra conta ou empresa nunca lê o que não é dela;
   - TTL de 12 h e versão do formato; tudo apagado em nx_sair, queda de sessão e troca de conta (limpar());
   - todo acesso ao IndexedDB em try/catch (janela anônima, Safari, cota cheia): sem IndexedDB o cache fica só na memória desta aba.
   Nada aqui importa outro arquivo (testes em Node com um armazém de mentira).
   ============================================================ */

export const NOME_BANCO = "orbita-cache";
export const VERSAO_FORMATO = 1;
export const TTL_MS = 12 * 3600 * 1000;
export const TETO_ENTRADA_BYTES = 1024 * 1024;     // resposta maior que 1 MB não fica

/** O que PODE ficar no aparelho (lista branca). Qualquer RPC fora daqui nunca é guardada, mesmo que a tela peça. */
export const CACHEAVEIS = Object.freeze(new Set([
  "nx_app_sessao", "nx_marca_publica",
  "nx_inicio", "nx_crm_base", "nx_negocios_kanban", "nx_negocios_coluna", "nx_contatos_listar", "nx_empresas_listar", "nx_tarefas_listar",
  "nx_agenda_dia", "nx_rel_vendas", "nx_rel_atendimento", "nx_dados", "nx_cv_listar",
]));

/** Mesmo na lista branca, nada com cara de segredo, configuração ou conteúdo de mensagem (defesa em profundidade: um nome novo descuidado não entra). */
export const PROIBIDO = /config|admin|senha|chave|token|convite|dominio|plano|usuario|mensagens|msgs|canais|integracao|entrada|segredo|notificacoes|cv_ver|cv_base|buscar/i;

export function cacheavel(nome) { return CACHEAVEIS.has(String(nome || "")) && !PROIBIDO.test(String(nome)); }

/** JSON com chaves em ordem: o mesmo parâmetro, na ordem que vier, dá a mesma chave. */
export function estavel(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return `[${v.map(estavel).join(",")}]`;
  return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${estavel(v[k])}`).join(",")}}`;
}
/** FNV-1a de 32 bits em hexadecimal (não é segurança, só uma chave curta e estável). */
export function hashCurto(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
const IGNORADOS = new Set(["p_token", "p_cliente", "p_req"]);
/** conta:empresa:rpc:hash(parâmetros sem token/cliente/req). */
export function chaveDe(nome, params, { conta = null, cliente = null } = {}) {
  const p = {};
  for (const [k, v] of Object.entries(params || {})) if (!IGNORADOS.has(k)) p[k] = v;
  return `${conta || "-"}:${cliente || "-"}:${nome}:${hashCurto(estavel(p))}`;
}

/** O que entra no cache de cada RPC (o resto é guardado como veio). A lista de conversas perde tudo além do que a lista mostra. */
const REDUTORES = {
  nx_cv_listar(dados) {
    if (!dados || typeof dados !== "object" || !Array.isArray(dados.itens)) return dados;
    const corta = s => (typeof s === "string" ? (s.length > 80 ? `${s.slice(0, 79)}…` : s) : s);
    return { ...dados, itens: dados.itens.map(c => ({ ...c, ultima_msg_resumo: corta(c && c.ultima_msg_resumo), mensagens: undefined, ultimas_mensagens: undefined })) };
  },
};
export function reduzir(nome, dados) { const f = REDUTORES[nome]; return f ? f(dados) : dados; }

/** Armazém sobre IndexedDB (uma loja «rpc» com chave `k`). Devolve null se o navegador não deixar abrir. */
export function criarArmazemIDB(idb = globalThis.indexedDB) {
  if (!idb || typeof idb.open !== "function") return null;
  let dbP = null;
  const abrir = () => {
    if (dbP) return dbP;
    dbP = new Promise(resolve => {
      let req;
      try { req = idb.open(NOME_BANCO, VERSAO_FORMATO); } catch { resolve(null); return; }
      req.onupgradeneeded = () => { try { if (!req.result.objectStoreNames.contains("rpc")) req.result.createObjectStore("rpc", { keyPath: "k" }); } catch { /* ok */ } };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return dbP;
  };
  const operar = async (modo, fn) => {
    const db = await abrir();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const tx = db.transaction("rpc", modo);
        const loja = tx.objectStore("rpc");
        let resultado = null;
        const r = fn(loja);
        if (r) { r.onsuccess = () => { resultado = r.result; }; r.onerror = () => { resultado = null; }; }
        tx.oncomplete = () => resolve(resultado);
        tx.onerror = tx.onabort = () => resolve(null);
      } catch { resolve(null); }
    });
  };
  return {
    ler: k => operar("readonly", l => l.get(k)).then(v => (v && v.k === k ? v : null)),
    gravar: (k, valor) => operar("readwrite", l => l.put({ k, ...valor })).then(() => true),
    apagar: k => operar("readwrite", l => l.delete(k)).then(() => true),
    limpar: () => operar("readwrite", l => l.clear()).then(() => true),
  };
}

/**
 * @param {object} o
 *   armazem — {ler(k), gravar(k, v), apagar(k), limpar()} assíncrono (padrão: IndexedDB; testes passam um de mentira)
 *   agora()
 * → {ativo, ler(chave), gravar(chave, nome, dados), apagar(chave), limpar(), cacheavel, chaveDe}
 */
export function criarCache(o = {}) {
  const armazem = o.armazem !== undefined ? o.armazem : criarArmazemIDB();
  const agora = o.agora || (() => Date.now());
  const memoria = new Map();            // o que foi lido/gravado nesta aba (e o único cache se o IndexedDB não abrir)
  const valido = v => v && v.v === VERSAO_FORMATO && Number.isFinite(v.em) && agora() - v.em <= TTL_MS && v.dados !== undefined;
  const api = {
    get ativo() { return true; },
    cacheavel, chaveDe,
    /** → {dados, em} ou null (vencido, de outra versão ou inexistente). */
    async ler(chave) {
      let v = memoria.get(chave) || null;
      if (!v && armazem) { try { v = await armazem.ler(chave); } catch { v = null; } }
      if (!valido(v)) { if (v) { memoria.delete(chave); if (armazem) try { await armazem.apagar(chave); } catch { /* ok */ } } return null; }
      memoria.set(chave, v);
      return { dados: v.dados, em: v.em };
    },
    /** Guarda a resposta de `nome` (só se for cacheável e couber); devolve se guardou. */
    async gravar(chave, nome, dados) {
      if (!cacheavel(nome)) return false;
      let texto;
      try { texto = JSON.stringify(reduzir(nome, dados)); } catch { return false; }
      if (!texto || texto.length * 2 > TETO_ENTRADA_BYTES) return false;
      const v = { v: VERSAO_FORMATO, em: agora(), nome, dados: JSON.parse(texto) };
      memoria.set(chave, v);
      if (armazem) { try { await armazem.gravar(chave, v); } catch { /* sem IndexedDB: fica na memória */ } }
      return true;
    },
    async apagar(chave) { memoria.delete(chave); if (armazem) try { await armazem.apagar(chave); } catch { /* ok */ } },
    /** nx_sair, queda de sessão e troca de conta: não sobra nada. */
    async limpar() { memoria.clear(); if (armazem) try { await armazem.limpar(); } catch { /* ok */ } return true; },
  };
  return api;
}
