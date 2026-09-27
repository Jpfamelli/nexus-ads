/* ============================================================
   NEXUS ADS — comum.js
   Peças usadas pelos três handlers: resposta JSON, relógio,
   autenticação do cron, leitura do banco no formato do nx_dados.
   ============================================================ */
import { datasetDeLinhas, montar } from "./nucleo.js";

export class ErroHttp extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

export const json = (dados, status = 200) => new Response(JSON.stringify(dados), {
  status, headers: { "content-type": "application/json; charset=utf-8" },
});

export function agoraDe(deps) {
  const a = deps && deps.agora;
  const d = typeof a === "function" ? a() : a != null ? new Date(a) : new Date();
  return d instanceof Date ? d : new Date(d);
}

export function somaDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const soDigitos = v => String(v ?? "").replace(/\D/g, "");

/** Comparação em tempo constante (não para no primeiro byte diferente). */
export function iguaisSeguro(a, b) {
  const x = new TextEncoder().encode(String(a ?? "")), y = new TextEncoder().encode(String(b ?? ""));
  let dif = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0 && x.length > 0;
}

/** Mensagem de erro segura para gravar no banco: sem token e curta.
    O fetch do Deno põe a URL inteira no erro de rede — e a URL do Meta leva access_token. */
export function limparErro(msg) {
  return String(msg ?? "erro desconhecido")
    .replace(/(access_token=)[^&\s)"']+/gi, "$1***")
    .replace(/(Bearer\s+)[\w.~+/=-]+/gi, "$1***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export const PRAZO_REDE_MS = 30_000;

/** fetch com prazo para Meta/Google/WhatsApp. Sem isso, uma conexão presa segura a
    execução até a Edge Function ser cortada (150 s) e nenhum cliente é processado. */
export function comPrazo(f, ms = PRAZO_REDE_MS) {
  return async (url, init = {}) => {
    try {
      return await f(url, { ...init, signal: AbortSignal.timeout(ms) });
    } catch (e) {
      if (e?.name !== "TimeoutError" && e?.name !== "AbortError") throw e;
      let host = "servidor";
      try { host = new URL(typeof url === "string" ? url : url.url).host; } catch { /* fica o genérico */ }
      throw new Error(`${host} não respondeu em ${Math.round(ms / 1000)} s`);
    }
  };
}

export async function lerCorpo(req) {
  try { const c = await req.json(); return c && typeof c === "object" ? c : {}; } catch { return {}; }
}

export async function lerConfig(db) {
  return (await db.select("nx_config", { id: "eq.1", select: "*", limit: 1 }))[0] || null;
}

/** Lê nx_config e confere o header x-nx-cron. Devolve a config ou lança 401. */
export async function autenticarCron(req, db) {
  const recebido = req.headers.get("x-nx-cron");
  if (!recebido) throw new ErroHttp(401, "não autorizado");
  const cfg = await lerConfig(db);
  if (!cfg || !cfg.cron_token || !iguaisSeguro(recebido, cfg.cron_token)) throw new ErroHttp(401, "não autorizado");
  return cfg;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Clientes ativos; com id explícito (botão do painel), aquele cliente mesmo se inativo. */
export async function listarClientes(db, clienteId) {
  const cols = "id,slug,nome,ativo,cfg";
  if (clienteId != null && clienteId !== "") {
    if (!UUID.test(String(clienteId))) throw new ErroHttp(400, "cliente inválido");
    const r = await db.select("nx_clientes", { id: `eq.${clienteId}`, select: cols, limit: 1 });
    if (!r.length) throw new ErroHttp(404, "cliente_nao_encontrado");
    return r;
  }
  return db.select("nx_clientes", { ativo: "eq.true", select: cols, order: "nome.asc" });
}

const COLS_METRICAS = "plataforma,nivel,data,campanha_ext,campanha_nome,anuncio_ext,anuncio_nome,impressoes,alcance,frequencia,cliques,gasto,conversoes";
const COLS_LEADS = "id,nome,telefone,origem,plataforma,campanha_ext,anuncio_ext,servico,etapa,data_conversa,data_agenda,data_consulta,valor,obs";

/** Linha de nx_metricas_dia → formato curto de nx_dados.metricas (contrato §3). */
export const metricaCurta = r => ({
  p: r.plataforma, d: String(r.data).slice(0, 10), n: r.nivel,
  c: r.campanha_ext, cn: r.campanha_nome, a: r.anuncio_ext, an: r.anuncio_nome,
  imp: +r.impressoes || 0, alc: +r.alcance || 0, freq: +r.frequencia || 0,
  cli: +r.cliques || 0, g: +r.gasto || 0, conv: +r.conversoes || 0,
});

/** Mesmo dataset que o painel monta a partir do nx_dados. */
export async function carregarModelo(db, cliente, hoje, dias) {
  const de = somaDias(hoje, -dias);
  const [metricas, leads] = await Promise.all([
    db.select("nx_metricas_dia", {
      cliente_id: `eq.${cliente.id}`, data: `gte.${de}`, select: COLS_METRICAS,
      order: "data.asc,plataforma.asc,nivel.asc,campanha_ext.asc,anuncio_ext.asc",
    }),
    // lead que conversou antes da janela mas agendou/veio dentro dela ainda conta no funil
    db.select("nx_leads", {
      cliente_id: `eq.${cliente.id}`, select: COLS_LEADS, order: "id.asc",
      or: `(data_conversa.gte.${de},data_agenda.gte.${de},data_consulta.gte.${de})`,
    }),
  ]);
  const ds = datasetDeLinhas({
    metricas: metricas.map(metricaCurta), leads,
    cliente: { id: cliente.id, slug: cliente.slug, nome: cliente.nome, cfg: cliente.cfg || {} },
    hoje, dias,
  });
  return montar(ds);
}

/** Roda fn sobre os itens com no máximo n ao mesmo tempo, mantendo a ordem. */
export async function emLotes(itens, n, fn) {
  const out = new Array(itens.length);
  let prox = 0;
  const trabalhador = async () => { while (prox < itens.length) { const i = prox++; out[i] = await fn(itens[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  return out;
}

/** cfg.waGestor / cfg.waCliente como lista — aceita também uma string "5512…, 5512…". */
export const listaDestinos = v => (Array.isArray(v) ? v : v ? String(v).split(/[,;\n]+/) : [])
  .map(x => String(x ?? "").trim()).filter(Boolean);

/** Texto único do que deu errado no envio (null se ao menos um destino recebeu e nenhum falhou). */
export function erroDeEnvio(destinos, envio) {
  if (!destinos || !destinos.length) return "nenhum número de destino cadastrado";
  if (!envio.length) return "nenhum número de destino válido";
  const falhas = envio.filter(e => !e.ok);
  if (!falhas.length) return null;
  const msgs = [...new Set(falhas.map(e => e.erro))];
  if (msgs.length === 1 && falhas.length === envio.length) return msgs[0];
  return falhas.map(e => `${e.destino}: ${e.erro}`).join("; ");
}

/** @param ms duração medida no relógio real (o `inicio` pode vir do relógio injetado nos testes) */
export async function registrarExecucao(db, { tarefa, inicio, ms, ok, resumo }) {
  try {
    const fim = new Date(inicio.getTime() + ms);
    await db.insert("nx_execucoes", { tarefa, inicio: inicio.toISOString(), fim: fim.toISOString(), ok, resumo }, { retornar: false });
  } catch (e) {
    console.error(`nx_execucoes (${tarefa}):`, limparErro(e.message));
  }
}
