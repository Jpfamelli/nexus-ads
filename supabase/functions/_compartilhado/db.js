/* ============================================================
   NEXUS ADS — db.js
   Cliente PostgREST mínimo com a service_role (ignora RLS).
   Sem SDK: fetch puro, roda igual no Deno e no Node (testes).
   ============================================================ */

const PAGINA = 1000;   // teto padrão de linhas por resposta do PostgREST no Supabase
const PRAZO_PADRAO_MS = 10_000;
const REPETIR_GET_MS = 300;
// plano 1000 (SV-094): teto de segurança do select sem limit — paginar até o fim acumulava tudo em memória (cliente com 100 mil
// leads num carregarModelo derrubava o isolate). Quem precisa de mais passa {teto} explícito.
export const TETO_SELECT = 50_000;
/** Plano 1000 (SV-105): a partir daqui a chamada ao PostgREST é registrada como lenta. */
export const LENTO_MS = 2_000;

export function criarDb({ url, chave } = {}, f = globalThis.fetch, { prazoMs = PRAZO_PADRAO_MS, repetirMs = REPETIR_GET_MS } = {}) {
  if (!url || !chave) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes");
  const base = `${String(url).replace(/\/+$/, "")}/rest/v1`;
  const cab = { apikey: chave, "Content-Type": "application/json", Accept: "application/json" };
  const prazo = Number.isFinite(Number(prazoMs)) && Number(prazoMs) > 0 ? Math.min(120_000, Number(prazoMs)) : PRAZO_PADRAO_MS;
  // Chave nova (sb_secret_…) não é JWT: o gateway recusa se vier no Authorization.
  if (!String(chave).startsWith("sb_")) cab.Authorization = `Bearer ${chave}`;

  async function pedirUmaVez(metodo, caminho, { params, corpo, prefer, headers } = {}) {
    const qs = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : "";
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer, expirou = false;
    const rede = (async () => {
      const r = await f(`${base}/${caminho}${qs}`, {
        method: metodo,
        headers: prefer || headers ? { ...cab, ...(prefer ? { Prefer: prefer } : {}), ...(headers || {}) } : cab,
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
    const t0 = Date.now();
    try {
      ({ r, txt } = await Promise.race([rede.catch(e => {
        if (expirou) {
          const t = new Error(`tempo esgotado no banco (${metodo} ${caminho.split("?")[0]})`);
          t.codigo = "tempo_esgotado"; t.banco = true; throw t;
        }
        e.banco = true; e.codigo ||= "sem_conexao"; throw e;
      }), limite]));
    } finally { clearTimeout(timer); }
    // plano 1000 (SV-105): consulta lenta vira UMA linha JSON no log (só o caminho — nunca parâmetros ou corpo)
    const ms = Date.now() - t0;
    if (ms >= LENTO_MS) {
      try { console.warn(JSON.stringify({ nivel: "aviso", evento: "banco_lento", lento: true, metodo, caminho: caminho.split("?")[0], ms, status: r?.status ?? null })); }
      catch { /* log nunca derruba */ }
    }
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

  /** plano 1000 (SV-096): GET (idempotente) repete UMA vez depois de 300 ms quando o PostgREST piscou (502/503/504) ou a conexão
      caiu — um 503 momentâneo (reinício, pool cheio) virava erro do cliente inteiro no ciclo/relatório. Escrita e RPC nunca repetem
      (podem ter sido aplicadas); prazo esgotado também não (o prazo já foi gasto). */
  async function pedir(metodo, caminho, opcoes = {}) {
    try { return await pedirUmaVez(metodo, caminho, opcoes); }
    catch (e) {
      const passageiro = e?.status === 502 || e?.status === 503 || e?.status === 504 || (e?.status == null && e?.codigo === "sem_conexao");
      if (metodo !== "GET" || !passageiro) throw e;
      await new Promise(r => setTimeout(r, repetirMs));
      return pedirUmaVez(metodo, caminho, opcoes);
    }
  }

  /** GET com filtros no formato do PostgREST ({ coluna: "eq.valor", order, select }).
      Sem `limit`, pagina até o fim — passe `order` para a paginação ser estável — e até `teto` linhas (padrão TETO_SELECT):
      passou disso, erro claro «consulta grande demais» (codigo consulta_grande) em vez de estourar a memória. */
  async function select(tabela, params = {}, { teto = TETO_SELECT } = {}) {
    // plano 1000b · B-005: select sempre devolve lista — um 200 que não é JSON de lista (proxy/gateway devolvendo HTML) virava
    // centenas de «linhas» letra por letra no out.push(...pag); agora é erro claro (codigo resposta_ilegivel)
    const lista = d => (Array.isArray(d) ? d : d == null ? [] : (() => {
      const e = new Error(`banco: resposta ilegível em ${tabela} (não é lista)`); e.codigo = "resposta_ilegivel"; e.banco = true; throw e;
    })());
    if (params.limit != null) return lista(await pedir("GET", tabela, { params }));
    const out = [];
    for (let offset = 0; ; offset += PAGINA) {
      const pag = lista(await pedir("GET", tabela, { params: { ...params, limit: PAGINA, offset } }));
      out.push(...pag);
      if (pag.length < PAGINA) return out;
      if (out.length > teto) {
        const e = new Error(`consulta grande demais em ${tabela} (mais de ${teto} linhas)`);
        e.codigo = "consulta_grande";
        throw e;
      }
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

  /** opcoes.headers: cabeçalhos extras (o PostgREST os entrega à função em request.headers, ex.: x-fila-lote). */
  const rpc = (nome, params = {}, opcoes = {}) => pedir("POST", `rpc/${nome}`, { corpo: params, headers: opcoes?.headers });

  return { select, insert, upsert, update, rpc };
}
