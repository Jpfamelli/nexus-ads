/* ============================================================
   NEXUS ADS / ÓRBITA — testes/apoio/postgrest-falso.mjs
   PostgREST em memória para os testes das Edge Functions (Node 24,
   sem dependências). Extraído de testes/funcoes.teste.mjs: o motor é o
   mesmo; o esquema (colunas, únicas, defaults, checks, NOT NULL) e as
   RPCs vêm de quem cria o banco.

   criarBanco(inicial, relogio, {
     esquema: { colunas: {tabela: Set}, unicas, padroes, checks, naoNulos },
     rpcs: api => ({ nome: { args:[…], opcionais:[…], fn(params) } }),
     chave,                 // Authorization: Bearer <chave> exigido
     seq,                   // primeiro id gerado (padrão 1000)
   }) → { t, tab, responder, api }

   Filtros suportados: eq neq is in gte gt lte lt cs, e as árvores lógicas
   or=(…) / and=(…) com or(…)/and(…) aninhados (como o PostgREST), onde a
   vírgula dentro de (), {} ou "" não separa.
   Erro de RPC: a fn lança Error com .message = código (e .hint opcional)
   → resposta {code, message, hint} com o status HTTP do PostgREST.
   ============================================================ */

/** Literal de array do Postgres ({a,"b.c"}) → lista. */
export function arrayPg(lit) {
  const s = String(lit).trim();
  if (!s.startsWith("{") || !s.endsWith("}")) throw new Error(`malformed array literal: ${s}`);
  const corpo = s.slice(1, -1);
  if (!corpo) return [];
  const out = [];
  let cur = "", aspas = false, escape = false;
  for (const ch of corpo) {
    if (escape) { cur += ch; escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { aspas = !aspas; continue; }
    if (ch === "," && !aspas) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** "a.eq.1,or(b.is.null,c.in.(1,2))" → partes do nível de cima (vírgula dentro de (), {} ou "" não separa). */
export function partes(expr) {
  const out = [];
  let cur = "", par = 0, chaves = 0, aspas = false;
  for (const ch of expr) {
    if (ch === '"') aspas = !aspas;
    else if (!aspas && ch === "(") par++;
    else if (!aspas && ch === ")") par--;
    else if (!aspas && ch === "{") chaves++;
    else if (!aspas && ch === "}") chaves--;
    if (ch === "," && !aspas && par === 0 && chaves === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.filter(p => p !== "");
}

const semParenteses = s => (s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s);

/** Árvore lógica do PostgREST: {op:'or'|'and', itens:[…]} ou {col, expr}. */
export function arvore(op, expr) {
  return {
    op,
    itens: partes(semParenteses(expr)).map(p => {
      const m = p.match(/^(not\.)?(or|and)\((.*)\)$/s);
      if (m) return { ...arvore(m[2], `(${m[3]})`), nao: !!m[1] };
      const i = p.indexOf(".");
      return { col: p.slice(0, i), expr: p.slice(i + 1) };
    }),
  };
}

function colunasDaArvore(no, out = []) {
  if (no.itens) for (const x of no.itens) colunasDaArvore(x, out);
  else out.push(no.col);
  return out;
}

export const RESERVADOS = new Set(["select", "order", "limit", "offset", "on_conflict", "or", "and"]);

const STATUS_ERRO = { "42501": 403, "22023": 400, "P0001": 400, "23505": 409, "57014": 500 };

export function criarBanco(inicial, relogio, { esquema, rpcs, chave, seq: seqInicial = 1000 } = {}) {
  const { colunas: COLUNAS, unicas: UNICAS = {}, padroes: PADROES = {}, checks: CHECKS = {}, naoNulos: NAO_NULOS = {} } = esquema;
  const t = structuredClone(inicial);
  // linhas semeadas pelo teste também ganham os defaults (como as antigas ganharam na migração)
  for (const [n, pad] of Object.entries(PADROES)) for (const r of t[n] || []) for (const [c, v] of Object.entries(pad)) if (r[c] == null) r[c] = structuredClone(v);
  let seq = seqInicial;
  const tab = n => (t[n] ||= []);
  const erro = (status, message, code = "PGRST", hint = null) => new Response(JSON.stringify({ code, message, hint, details: null }), { status, headers: { "content-type": "application/json" } });
  const ok = dados => new Response(JSON.stringify(dados === undefined ? null : dados), { status: 200, headers: { "content-type": "application/json" } });

  function casa(row, col, expr) {
    const nao = expr.startsWith("not.");
    if (nao) return !casa(row, col, expr.slice(4));
    const i = expr.indexOf(".");
    const op = expr.slice(0, i), val = expr.slice(i + 1), a = row[col];
    const cmp = () => (typeof a === "number" ? a - Number(val) : String(a) < val ? -1 : String(a) > val ? 1 : 0);
    switch (op) {
      case "eq": return a != null && String(a) === val;
      case "neq": return a == null || String(a) !== val;
      case "is": return val === "null" ? a == null : val === "true" ? a === true : val === "false" ? a === false : String(a) === val;
      case "in": return a != null && partes(semParenteses(val)).map(x => x.replace(/^"|"$/g, "")).includes(String(a));
      case "gte": return a != null && cmp() >= 0;
      case "gt": return a != null && cmp() > 0;
      case "lte": return a != null && cmp() <= 0;
      case "lt": return a != null && cmp() < 0;
      case "cs": return Array.isArray(a) && arrayPg(val).every(x => a.includes(x));   // @> (contém)
      default: throw new Error(`operador não suportado no banco falso: ${op}`);
    }
  }
  function avaliar(row, no) {
    let r;
    if (!no.itens) r = casa(row, no.col, no.expr);
    else r = no.op === "or" ? no.itens.some(x => avaliar(row, x)) : no.itens.every(x => avaliar(row, x));
    return no.nao ? !r : r;
  }
  function colunasFiltro(nome, sp) {
    const cols = [...sp.keys()].filter(k => !RESERVADOS.has(k));
    for (const op of ["or", "and"]) if (sp.get(op)) cols.push(...colunasDaArvore(arvore(op, sp.get(op))));
    if (sp.get("order")) cols.push(...sp.get("order").split(",").map(o => o.split(".")[0]));
    if (sp.get("select") && sp.get("select") !== "*") cols.push(...sp.get("select").split(","));
    return cols.filter(c => !COLUNAS[nome].has(c));
  }
  function filtrar(nome, sp) {
    const logicas = ["or", "and"].filter(op => sp.get(op)).map(op => arvore(op, sp.get(op)));
    return tab(nome).filter(r => {
      for (const [k, v] of sp) if (!RESERVADOS.has(k) && !casa(r, k, v)) return false;
      return logicas.every(no => avaliar(r, no));
    });
  }
  function validar(nome, obj) {
    for (const k of Object.keys(obj)) if (!COLUNAS[nome].has(k)) return `Could not find the '${k}' column of '${nome}'`;
    for (const [c, okv] of Object.entries(CHECKS[nome] || {})) if (c in obj && !okv.includes(obj[c])) return `violates check constraint ${nome}_${c}: ${obj[c]}`;
    return null;
  }

  // pg_advisory_xact_lock: uma fila por chave; solta no fim da "transação"
  const filasXact = new Map();
  async function travaXact(chaveTrava, fn) {
    const antes = filasXact.get(chaveTrava) || Promise.resolve();
    let soltar;
    const minha = antes.then(() => new Promise(r => { soltar = r; }));
    filasXact.set(chaveTrava, minha);
    await antes;
    try { return await fn(); }
    finally { soltar(); if (filasXact.get(chaveTrava) === minha) filasXact.delete(chaveTrava); }
  }
  const pausa = () => new Promise(r => setImmediate(r));   // a transação leva tempo: sem trava, duas chamadas se cruzariam aqui
  const api = { t, tab, relogio, agoraMs: () => relogio().getTime(), travaXact, pausa, novoId: () => ++seq, chamadas: [] };
  const RPCS = rpcs ? rpcs(api) : {};

  async function rpc(nome, req) {
    const def = RPCS[nome];
    const corpo = req.method === "POST" ? JSON.parse((await req.text()) || "{}") : null;
    const chaves = corpo ? Object.keys(corpo) : [];
    // PostgREST acha a função pelos NOMES dos parâmetros: faltando ou sobrando, é 404
    if (!def || def.args.some(a => !chaves.includes(a)) || chaves.some(k => !def.args.includes(k) && !(def.opcionais || []).includes(k))) {
      return erro(404, `Could not find the function public.${nome}(${chaves.join(", ")}) in the schema cache`, "PGRST202");
    }
    api.chamadas.push({ nome, params: structuredClone(corpo) });
    try { return ok(await def.fn(structuredClone(corpo))); }
    catch (e) {
      const code = e.code || "P0001";
      return erro(STATUS_ERRO[code] || 400, e.message, code, e.hint ?? null);
    }
  }

  async function responder(req) {
    // ida e volta ao banco é rede (macrotarefa): sem isso, duas requisições "paralelas" nunca se cruzam aqui
    await new Promise(r => setImmediate(r));
    if (!req.headers.get("apikey")) return erro(401, "sem apikey");
    if (chave && req.headers.get("authorization") !== `Bearer ${chave}`) return erro(401, "sem Authorization");
    const u = new URL(req.url), sp = u.searchParams;
    const nome = u.pathname.replace(/^\/rest\/v1\//, "");
    if (nome.startsWith("rpc/")) return rpc(nome.slice(4), req);
    if (!COLUNAS[nome]) return erro(404, `relation ${nome} does not exist`);
    const ruins = colunasFiltro(nome, sp);
    if (ruins.length) return erro(400, `column ${nome}.${ruins[0]} does not exist`);
    const prefer = req.headers.get("prefer") || "";
    const devolve = linhas => prefer.includes("return=representation")
      ? new Response(JSON.stringify(structuredClone(linhas)), { status: 201, headers: { "content-type": "application/json" } })
      : new Response(null, { status: 201 });

    if (req.method === "GET") {
      let rows = filtrar(nome, sp);
      const ordem = sp.get("order");
      if (ordem) {
        const regras = ordem.split(",").map(o => { const [c, d] = o.split("."); return { c, s: d === "desc" ? -1 : 1 }; });
        rows = [...rows].sort((x, y) => { for (const { c, s } of regras) { if (x[c] < y[c]) return -s; if (x[c] > y[c]) return s; } return 0; });
      }
      const off = +(sp.get("offset") || 0), lim = sp.get("limit") != null ? +sp.get("limit") : Infinity;
      rows = rows.slice(off, off + lim);
      const sel = sp.get("select");
      if (sel && sel !== "*") { const cs = sel.split(","); rows = rows.map(r => Object.fromEntries(cs.map(c => [c, r[c] ?? null]))); }
      return new Response(JSON.stringify(structuredClone(rows)), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (req.method === "POST") {
      const corpo = JSON.parse(await req.text());
      const lista = Array.isArray(corpo) ? corpo : [corpo];
      const conflito = sp.get("on_conflict");
      const merge = conflito && prefer.includes("resolution=merge-duplicates");
      if (conflito && !merge) return erro(400, "on_conflict sem merge-duplicates");
      const chaves = conflito ? conflito.split(",") : UNICAS[nome];
      const vistos = new Set(), out = [];
      for (const obj of lista) {
        const ruim = validar(nome, obj);
        if (ruim) return erro(400, ruim);
        const ex = chaves ? tab(nome).find(r => chaves.every(c => String(r[c]) === String(obj[c]))) : null;
        // NOT NULL: coluna enviada vale; ausente fica com o valor da linha (upsert) ou o default (insert)
        const base = ex && merge ? ex : (PADROES[nome] || {});
        for (const c of NAO_NULOS[nome] || []) if ((c in obj ? obj[c] : base[c]) == null) return erro(400, `null value in column "${c}" of ${nome}`);
        if (chaves) {
          const k = chaves.map(c => String(obj[c])).join("|");
          if (merge && vistos.has(k)) return erro(500, "ON CONFLICT DO UPDATE command cannot affect row a second time");
          vistos.add(k);
          if (ex && merge) { Object.assign(ex, obj); out.push(ex); continue; }
          if (ex) return erro(409, `duplicate key value violates unique constraint on ${nome}`);
        }
        const novo = { ...structuredClone(PADROES[nome] || {}), ...obj };
        if (COLUNAS[nome].has("id") && novo.id == null) novo.id = ++seq;
        if (COLUNAS[nome].has("criado_em") && novo.criado_em == null) novo.criado_em = relogio().toISOString();
        for (const c of COLUNAS[nome]) if (!(c in novo)) novo[c] = null;
        tab(nome).push(novo);
        out.push(novo);
      }
      return devolve(out);
    }

    if (req.method === "PATCH") {
      const dados = JSON.parse(await req.text());
      const ruim = validar(nome, dados);
      if (ruim) return erro(400, ruim);
      for (const c of NAO_NULOS[nome] || []) if (c in dados && dados[c] == null) return erro(400, `null value in column "${c}" of ${nome}`);
      const rows = filtrar(nome, sp);
      for (const r of rows) Object.assign(r, dados);
      return prefer.includes("return=representation")
        ? new Response(JSON.stringify(structuredClone(rows)), { status: 200, headers: { "content-type": "application/json" } })
        : new Response(null, { status: 204 });
    }
    return erro(405, "método");
  }
  return { t, tab, responder, api };
}

/** Erro de RPC no formato do Postgres (message = código do Apêndice B). */
export function erroPg(codigo, { hint = null, errcode = "22023" } = {}) {
  const e = new Error(codigo);
  e.code = errcode;
  if (hint != null) e.hint = hint;
  return e;
}

export const jsonResp = (dados, status = 200, cab = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json", ...cab } });
