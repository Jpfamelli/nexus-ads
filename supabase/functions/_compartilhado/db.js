/* ============================================================
   NEXUS ADS — db.js
   Cliente PostgREST mínimo com a service_role (ignora RLS).
   Sem SDK: fetch puro, roda igual no Deno e no Node (testes).
   ============================================================ */

const PAGINA = 1000;   // teto padrão de linhas por resposta do PostgREST no Supabase
const PRAZO_PADRAO_MS = 10_000;

export function criarDb({ url, chave } = {}, f = globalThis.fetch, { prazoMs = PRAZO_PADRAO_MS } = {}) {
  if (!url || !chave) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes");
  const base = `${String(url).replace(/\/+$/, "")}/rest/v1`;
  const cab = { apikey: chave, "Content-Type": "application/json", Accept: "application/json" };
  const prazo = Number.isFinite(Number(prazoMs)) && Number(prazoMs) > 0 ? Math.min(120_000, Number(prazoMs)) : PRAZO_PADRAO_MS;
  // Chave nova (sb_secret_…) não é JWT: o gateway recusa se vier no Authorization.
  if (!String(chave).startsWith("sb_")) cab.Authorization = `Bearer ${chave}`;

  async function pedir(metodo, caminho, { params, corpo, prefer } = {}) {
    const qs = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer, expirou = false;
    const rede = (async () => {
      const r = await f(`${base}/${caminho}${qs}`, {
        method: metodo,
        headers: prefer ? { ...cab, Prefer: prefer } : cab,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        ...(controller ? { signal: controller.signal } : {}),
      });
      return { r, txt: await r.text() };
    })();
    const limite = new Promise((_, reject) => {
      timer = setTimeout(() => {
        expirou = true;
        controller?.abort();
        const e = new Error(`tempo esgotado no banco (${metodo} ${caminho.split("?")[0]})`);
        e.codigo = "tempo_esgotado"; e.banco = true;
        reject(e);
      }, prazo);
    });
    let r, txt;
    try {
      ({ r, txt } = await Promise.race([rede.catch(e => {
        if (expirou) {
          const t = new Error(`tempo esgotado no banco (${metodo} ${caminho.split("?")[0]})`);
          t.codigo = "tempo_esgotado"; t.banco = true; throw t;
        }
        e.banco = true; e.codigo ||= "sem_conexao"; throw e;
      }), limite]));
    } finally { clearTimeout(timer); }
    let dados = null;
    if (txt) { try { dados = JSON.parse(txt); } catch { dados = txt; } }
    if (!r.ok) {
      const msg = dados && typeof dados === "object" ? (dados.message || dados.details || dados.hint || dados.code) : dados;
      const e = new Error(`banco ${r.status} em ${caminho.split("?")[0]}: ${msg || "erro"}`);
      e.status = r.status;
      // Webhooks só pedem retry para falhas transitórias. Um 4xx permanente (por
      // exemplo, dados inválidos ou RPC inexistente) não pode abrir um ciclo de retries.
      e.banco = r.status === 408 || r.status === 425 || r.status === 429 || r.status >= 500;
      throw e;
    }
    return dados;
  }

  /** GET com filtros no formato do PostgREST ({ coluna: "eq.valor", order, select }).
      Sem `limit`, pagina até o fim — passe `order` para a paginação ser estável. */
  async function select(tabela, params = {}) {
    if (params.limit != null) return (await pedir("GET", tabela, { params })) || [];
    const out = [];
    for (let offset = 0; ; offset += PAGINA) {
      const pag = (await pedir("GET", tabela, { params: { ...params, limit: PAGINA, offset } })) || [];
      out.push(...pag);
      if (pag.length < PAGINA) return out;
    }
  }

  async function insert(tabela, linhas, { retornar = true } = {}) {
    const d = await pedir("POST", tabela, { corpo: linhas, prefer: retornar ? "return=representation" : "return=minimal" });
    return Array.isArray(d) ? d : [];
  }

  /** INSERT … ON CONFLICT DO UPDATE só nas colunas enviadas. Em lotes de 500. */
  async function upsert(tabela, linhas, onConflict, { retornar = false } = {}) {
    const lista = Array.isArray(linhas) ? linhas : [linhas];
    const out = [];
    for (let i = 0; i < lista.length; i += 500) {
      const d = await pedir("POST", tabela, {
        params: { on_conflict: onConflict },
        corpo: lista.slice(i, i + 500),
        prefer: `resolution=merge-duplicates,return=${retornar ? "representation" : "minimal"}`,
      });
      if (Array.isArray(d)) out.push(...d);
    }
    return out;
  }

  async function update(tabela, filtros, dados, { retornar = false } = {}) {
    if (!filtros || !Object.keys(filtros).length) throw new Error("update sem filtro recusado");
    const d = await pedir("PATCH", tabela, { params: filtros, corpo: dados, prefer: retornar ? "return=representation" : "return=minimal" });
    return Array.isArray(d) ? d : [];
  }

  const rpc = (nome, params = {}) => pedir("POST", `rpc/${nome}`, { corpo: params });

  return { select, insert, upsert, update, rpc };
}
