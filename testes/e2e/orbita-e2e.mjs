#!/usr/bin/env node
/* ============================================================
   ÓRBITA — testes/e2e/orbita-e2e.mjs · E2E-A/B PELA API (sem navegador)
   Tenant descartável 'teste-e2e'. Tudo que o teste cria leva o prefixo "E2E-3009"
   (nome/texto) ou o telefone 5512993009xxx, e é apagado no fim (finally).

   Fala só com as portas públicas: https://<projeto>.supabase.co/rest/v1/rpc/<nx_*> (chave
   publicável + p_token) e /functions/v1/nx-codewords | nx-enviar. O token é da sessão curta
   do "Conta E2E Órbita" (admin do teste-e2e); vem de E2E_TOKEN ou do arquivo
   ${E2E_DIR}/sessao.token. Nada de service_role aqui: o que exige banco (semear métricas
   fictícias, marcar aparelho do canal, SQL de cota/isolamento, conferência final) está em
   testes/e2e/sql/*.sql e roda pelo SQL Editor / execute_sql, e o roteiro é descrito em
   docs/orbita/estado/E2E.md.

   NADA sai para a internet além do Supabase: o canal CodeWords é de teste com chave FALSA
   (cwk-teste-…). As duas únicas chamadas ao CodeWords (envio pelo painel e item da fila da
   automação) só acontecem depois do "flag" de envio (ver fase ENVIO) e falham por chave
   recusada (definitivo). Nenhuma chamada à IA.

   Uso:  E2E_DIR=<pasta> node testes/e2e/orbita-e2e.mjs [--so=a,b,c] [--manter] [--sem-envio]
         --so=         roda só esses casos (prep,c1,c2,c3,c4,c5,c6,c7,c9,envio)
         --manter      não apaga (só para desenvolver o teste)
         --sem-envio   pula a fase ENVIO (casos 2b e 7b), que precisa do flag
         --limpar      só apaga o que o estado.json registra e sai
   Segredos (token, URL do canal, chave publicável do formulário, chave falsa) nunca são impressos.
   ============================================================ */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const DIR = process.env.E2E_DIR || path.join(os.tmpdir(), "e2e-3009");
fs.mkdirSync(DIR, { recursive: true });
const ARGS = process.argv.slice(2);
const opt = n => ARGS.find(a => a === `--${n}` || a.startsWith(`--${n}=`));
const SO = opt("so") ? String(opt("so")).split("=")[1].split(",") : null;
const MANTER = !!opt("manter");
const SEM_ENVIO = !!opt("sem-envio");

const SUPA = process.env.E2E_SUPA_URL || "https://dtjznipitihnwmcgpzqh.supabase.co";
const KEY = process.env.E2E_APIKEY
  || (/CHAVE_PUBLICA\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(RAIZ, "web", "dados.js"), "utf8")) || [])[1];
const TOKEN = (process.env.E2E_TOKEN || (fs.existsSync(path.join(DIR, "sessao.token")) ? fs.readFileSync(path.join(DIR, "sessao.token"), "utf8") : "")).trim();
const CLI = process.env.E2E_CLIENTE || "af161ba7-cc70-4b8a-bfe6-8234dd072a52";          // teste-e2e
const KAM = JSON.parse(fs.readFileSync(path.join(DIR, "kam-ids.json"), "utf8"));           // ids do cliente real (só para NEGAR)
if (!KEY || !TOKEN) { console.error("faltam a chave publicável e/ou o token da sessão de teste"); process.exit(2); }

const RUN = crypto.randomBytes(3).toString("hex");
const P = "5512993009";                                   // prefixo dos telefones de teste
const tel = n => `${P}${String(n).padStart(3, "0")}`;
const T = { google: tel(1), organico: tel(2), humano: tel(3), celular: tel(4), meta: tel(5), limite: tel(6), raw: tel(7), crm: tel(9) };
const NUM_CANAL = "+5512993009900";
const PRE = "E2E-3009";
const FLAG_PRONTO = path.join(DIR, "flag-envio-pronto");
const FLAG_FEITO = path.join(DIR, "flag-envio-feito");

/* ------------------------------------------------------------ segredos nunca saem */
const SEGREDOS = new Set([TOKEN, KEY].filter(Boolean));
const limpo = v => {
  let s = typeof v === "string" ? v : JSON.stringify(v);
  for (const x of SEGREDOS) if (x && s.includes(x)) s = s.split(x).join("<segredo>");
  return s.replace(/([?&]ch=)[0-9a-f]{8,}/gi, "$1<segredo>").replace(/cwk-[A-Za-z0-9_-]{6,}/g, "cwk-<falsa>").replace(/\b[0-9a-f]{48,64}\b/g, "<hex>");
};
const log = (...a) => console.log(a.map(limpo).join(" "));

/* ------------------------------------------------------------ HTTP */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function http(url, { corpo, raw, headers = {}, metodo = "POST" } = {}) {
  let r;
  try {
    r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json", ...headers },
      body: metodo === "GET" ? undefined : (raw ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined)) });
  } catch (e) { return { status: 0, json: null, txt: String(e?.message || e) }; }
  const txt = await r.text();
  let json = null; try { json = JSON.parse(txt); } catch { /* texto */ }
  return { status: r.status, json, txt, cab: r.headers };
}
/** RPC do PostgREST. Sucesso → {ok:true,dados}; exceção do banco → {ok:false,codigo,hint}. */
async function rpc(nome, params = {}, { anon = false, token = TOKEN } = {}) {
  const r = await http(`${SUPA}/rest/v1/rpc/${nome}`, { corpo: anon ? params : { p_token: token, ...params }, headers: { apikey: KEY } });
  if (r.status >= 400 || r.status === 0) {
    return { ok: false, status: r.status, codigo: r.json?.message ?? (r.status ? `http_${r.status}` : "sem_conexao"), hint: r.json?.hint ?? null, code: r.json?.code ?? null };
  }
  return { ok: true, status: r.status, dados: r.json };
}
const rpcC = (nome, params = {}, o) => rpc(nome, { p_cliente: CLI, ...params }, o);
const fn = (funcao, corpo = {}) => http(`${SUPA}/functions/v1/${funcao}`, { corpo: { token: TOKEN, cliente: CLI, ...corpo }, headers: { apikey: KEY } });
const deve = (r, o = "") => { if (!r.ok) throw new Error(`${o} falhou: ${r.codigo}${r.hint ? `|${r.hint}` : ""}`); return r.dados; };
const get = (o, p, d = undefined) => { let x = o; for (const k of String(p).split(".")) { if (x == null) return d; x = x[k]; } return x === undefined ? d : x; };

/* ------------------------------------------------------------ relatório de casos */
const RESULTADO = { rodada: RUN, inicio: new Date().toISOString(), casos: [], bugs: [], observacoes: [], naoProvado: [] };
class Caso {
  constructor(id, nome) { this.id = id; this.nome = nome; this.checks = []; this.info = {}; this.fatal = null; }
  ok(desc, cond, extra) { const c = !!cond; this.checks.push({ desc, ok: c, extra: c ? undefined : extra }); return c; }
  igual(desc, a, b) { return this.ok(desc, JSON.stringify(a) === JSON.stringify(b), `obtido=${limpo(JSON.stringify(a))} esperado=${limpo(JSON.stringify(b))}`); }
  nota(k, v) { this.info[k] = v; }
  get passou() { return !this.fatal && this.checks.every(c => c.ok); }
}
async function caso(id, nome, f, grupo = id) {
  if (SO && id !== "prep" && !SO.includes(grupo) && !SO.includes(id)) return null;
  const c = new Caso(id, nome);
  try { await f(c); } catch (e) { c.fatal = limpo(e?.stack?.split("\n").slice(0, 3).join(" | ") || e?.message || e); }
  const falhas = c.checks.filter(x => !x.ok);
  RESULTADO.casos.push({ id, nome, ok: c.passou, checks: c.checks.length, falhas: falhas.map(x => `${x.desc}${x.extra ? ` [${x.extra}]` : ""}`), fatal: c.fatal, info: c.info });
  log(`${c.passou ? "OK   " : "FALHA"} ${id} ${nome} (${c.checks.length - falhas.length}/${c.checks.length})${c.fatal ? ` FATAL: ${c.fatal}` : ""}`);
  for (const f of falhas) log(`       - ${f.desc}${f.extra ? ` [${f.extra}]` : ""}`);
  return c;
}

/* ------------------------------------------------------------ estado da rodada (sem segredos) */
const ARQ_ESTADO = path.join(DIR, "estado.json");
const E = fs.existsSync(ARQ_ESTADO) ? JSON.parse(fs.readFileSync(ARQ_ESTADO, "utf8")) : {};
E.contatos ||= {}; E.negocios ||= {}; E.conversas ||= {}; E.etiquetas ||= []; E.automacoes ||= []; E.tarefas ||= []; E.notas ||= [];
const salvar = () => fs.writeFileSync(ARQ_ESTADO, JSON.stringify({ ...E, url: undefined }, null, 1));
let URL_AGENTE = null;       // segredo: só em memória
let CHAVE_FORM = null;       // chave pública do formulário (rastreio): só em memória

const id = s => `${PRE}-${RUN}-${s}`;
let seq = 0; const mid = p => id(`${p}-${++seq}`);
const agoraIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const dataSP = iso => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function agente(corpo, { url = URL_AGENTE, raw, metodo = "POST", headers } = {}) {
  return http(url, { corpo, raw, metodo, headers: { apikey: KEY, ...headers } });
}
const entrada = (t, texto, extra = {}) => agente({ acao: "mensagem", direcao: "entrada", telefone: t, nome: extra.nome ?? `${PRE} ${t.slice(-3)}`,
  texto, message_id: extra.message_id ?? mid("in"), timestamp: agoraIso(), ...(extra.referral ? { referral: extra.referral } : {}) });
const saida = (t, texto, autor, message_id) => agente({ acao: "mensagem", direcao: "saida", autor, telefone: t, texto, message_id: message_id ?? mid("out") });

async function funilPadrao() {
  const base = deve(await rpcC("nx_crm_base"), "nx_crm_base");
  const pad = base.funis.find(f => f.padrao) || base.funis[0];
  const pos = base.funis.find(f => !f.conta_no_ads) || null;
  const est = {}; for (const e of pad.estagios) est[e.marco || e.nome] = e;
  return { base, pad, pos, est };
}
/** Card do negócio no kanban (funil padrão) pelo telefone. */
async function cardDoTelefone(telefone, funilId = null, fechados = true) {
  const k = deve(await rpcC("nx_negocios_kanban", { p_funil: funilId, p_filtro: { busca: telefone.slice(-8), ...(fechados ? { fechados_dias: 0 } : {}) } }), "kanban");
  for (const col of k.colunas || []) for (const it of col.itens || []) if (String(it.telefone || it.contato?.telefone || "").endsWith(telefone.slice(-8))) return { ...it, _coluna: col };
  return null;
}
async function iaEstado(conv) { return deve(await rpcC("nx_cv_ia_estado", { p_conversa: conv }), "nx_cv_ia_estado"); }
async function mensagens(conv) { return deve(await rpcC("nx_cv_mensagens", { p_conversa: conv, p_limite: 100 }), "nx_cv_mensagens"); }
const listaMsgs = m => (Array.isArray(m) ? m : m?.mensagens || m?.itens || []);
async function notificacoes() { const n = deve(await rpcC("nx_notificacoes_listar", { p_limite: 50 }), "nx_notificacoes_listar"); return Array.isArray(n) ? n : n?.itens || n?.notificacoes || []; }
const esperarAte = async (f, { ms = 60_000, cada = 2000 } = {}) => { const t0 = Date.now(); for (;;) { const v = await f(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(cada); } };

/* ============================================================
   PREPARO: sessão, canal de teste (chave FALSA), URL secreta pela ação 'receita'
   ============================================================ */
async function prep(c) {
  const s = deve(await rpc("nx_sessao"), "nx_sessao");
  c.ok("sessão é da conta de teste (papel clinica) e enxerga só o teste-e2e", s.conta?.papel === "clinica" && s.clientes?.length === 1 && s.clientes[0].id === CLI, `papel=${s.conta?.papel} clientes=${s.clientes?.length}`);
  const uso = deve(await rpcC("nx_uso_plano"), "nx_uso_plano");
  c.nota("plano", `${uso.plano?.id} (limite canais ${uso.limites?.canais}, automações ${uso.limites?.automacoes}, IA/mês ${uso.limites?.ia_mes})`);

  const k = await rpcC("nx_entrada_chave", { p_gerar: false });
  CHAVE_FORM = k.ok ? k.dados?.chave : null;
  c.ok("chave pública do formulário existe (não foi gerada/trocada)", /^[0-9a-f]{48}$/.test(CHAVE_FORM || ""));
  if (CHAVE_FORM) SEGREDOS.add(CHAVE_FORM);

  if (!E.canal) {
    const fake = `cwk-teste-e2e3009-${crypto.randomBytes(12).toString("hex")}`;
    SEGREDOS.add(fake);
    const r = await rpcC("nx_codewords_canal_salvar", { p_canal: { nome: `${PRE} CodeWords (falso)`, numero: NUM_CANAL, codewords_api_key: fake, rota: "fluxo", ia_ligada: true, ia_volta_horas: 6 } });
    const d = deve(r, "nx_codewords_canal_salvar");
    E.canal = d.canal?.id;
    if (d.webhook_url) SEGREDOS.add(d.webhook_url);
    E.canal_tem_url_no_salvar = /\/nx-codewords\?ch=[0-9a-f]{64}$/.test(d.webhook_url || "");
    c.ok("canal CodeWords de teste criado (provedor codewords, rota fluxo, IA ligada, sem devolver a chave)",
      !!E.canal && d.canal?.provedor === "codewords" && d.canal?.codewords?.rota === "fluxo" && d.canal?.codewords?.ia_ligada === true && d.canal?.codewords?.tem_api_key === true
      && !JSON.stringify(d).includes(fake), JSON.stringify(Object.keys(d)));
    c.ok("a resposta de salvar traz a URL secreta só para o admin (formato /nx-codewords?ch=<64 hex>)", E.canal_tem_url_no_salvar);
    salvar();
  }
  const rec = await fn("nx-codewords", { acao: "receita", canal: E.canal });
  c.ok("ação 'receita' responde 200 ok:true com url + cabeçalhos + prompt", rec.status === 200 && rec.json?.ok === true && !!rec.json?.url && !!rec.json?.prompt, `status=${rec.status} erro=${rec.json?.erro}`);
  URL_AGENTE = rec.json?.url || null;
  if (URL_AGENTE) SEGREDOS.add(URL_AGENTE);
  c.ok("URL do canal tem o formato esperado e o prompt a leva (o dono cola no CodeWords)", /\/functions\/v1\/nx-codewords\?ch=[0-9a-f]{64}$/.test(URL_AGENTE || "") && String(rec.json?.prompt).includes(URL_AGENTE), "formato da url");
  c.ok("receita não devolve a chave cwk- nem token", !/cwk-[A-Za-z0-9_-]{10,}/.test(JSON.stringify(rec.json)) && !JSON.stringify(rec.json).includes(TOKEN));
  c.nota("receita_cabecalhos", Object.keys(rec.json?.cabecalhos || {}));
  c.nota("prompt_tamanho", String(rec.json?.prompt || "").length);
  if (!URL_AGENTE) throw new Error("sem URL do canal: não dá para seguir");
  // a API do agente exige POST, segredo de 64 hex e JSON
  const ruim = await agente({ acao: "contexto", telefone: T.google }, { url: URL_AGENTE.replace(/ch=[0-9a-f]{64}/, `ch=${"0".repeat(64)}`) });
  c.ok("segredo trocado (64 zeros) → 401 canal_invalido", ruim.status === 401 && ruim.json?.erro === "canal_invalido", `status=${ruim.status}`);
}

/* ============================================================
   CASO 1 — CodeWords simulado ponta a ponta (API do agente)
   ============================================================ */
async function c1_rastreio_e_google(c) {
  const f = await funilPadrao();
  E.estagios = Object.fromEntries(Object.entries(f.est).map(([m, e]) => [m, e.id])); E.funilPad = f.pad.id; E.funilPos = f.pos?.id || null; salvar();
  c.nota("marcos_do_funil", Object.keys(f.est));
  // 1. código de rastreio pelo endpoint PÚBLICO (chave do formulário) com utm_source=google e a campanha fictícia
  const reg = await rpc("nx_rastreio_registrar", { p_chave: CHAVE_FORM, p_dados: { utm_source: "google", utm_medium: "cpc", utm_campaign: "E2E-3009-CAMP-G1", utm_content: "E2E-3009-AD-G1", utm_term: "implante", gclid: "E2E3009gclidTESTE", pagina: "https://exemplo-teste.invalid/implante?x=1#topo" } }, { anon: true });
  const codigo = reg.dados?.codigo;
  c.ok("rastreio público devolve código de 5 caracteres", reg.ok && /^[A-HJKMNP-Z2-9]{5}$/.test(codigo || ""), `ok=${reg.ok} ${reg.codigo}`);
  // 2. mensagem com [ref CODIGO]
  const r = await entrada(T.google, `Oi, quero marcar uma avaliação de implante [ref ${codigo}]`, { nome: `${PRE} Paciente Google` });
  const j = r.json || {};
  c.ok("mensagem com [ref] → 200 ok registrada:true responder:true", r.status === 200 && j.ok === true && j.registrada === true && j.responder === true && !!j.conversa_id, `status=${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  E.conversas.google = j.conversa_id; salvar();
  const x = j.contexto || {};
  c.ok("contexto completo {agora,empresa,contato,negocio,historico,instrucoes}", ["agora", "empresa", "contato", "negocio", "historico", "instrucoes"].every(k => k in x) && typeof x.instrucoes === "string" && x.instrucoes.length > 200, Object.keys(x).join(","));
  c.ok("contexto.contato: telefone do cliente, primeira vez", x.contato?.telefone === T.google && x.contato?.primeira_vez === true);
  c.ok("contexto.historico traz a mensagem do cliente (de:'cliente') com o código do site no texto", (x.historico || []).some(h => h.de === "cliente" && /\[ref /.test(h.texto || "")));
  c.ok("contexto.empresa tem assistente, vertical odonto, horários", x.empresa?.vertical === "odonto" && !!x.empresa?.assistente?.nome && typeof x.empresa?.horarios === "string");
  const o = x.negocio?.origem || {};
  c.ok("negócio criado com origem Google (tipo anuncio, plataforma google)", o.tipo === "anuncio" && o.plataforma === "google", JSON.stringify(o));
  c.ok("contexto mostra o NOME da campanha (não só o id) e o nome do anúncio", o.campanha === "E2E-3009 Campanha Implante" && o.anuncio === "E2E-3009 Video Sorriso", JSON.stringify(o));
  c.ok("contexto traz UTMs seguras e NÃO traz gclid/código/fbclid", o.rastreio?.utm_source === "google" && o.rastreio?.utm_campaign === "E2E-3009-CAMP-G1" && !/gclid|E2E3009gclid|fbclid/i.test(JSON.stringify(x)), JSON.stringify(o.rastreio));
  c.ok("instruções mandam ignorar o código do site (não repetir ao cliente)", /ref|código/i.test(x.instrucoes || ""));
  // mesmo negócio pela interface do CRM (RPC do painel)
  const card = await cardDoTelefone(T.google);
  c.ok("negócio aparece no CRM (funil Pacientes) com origem anúncio/google", !!card && card.origem === "anuncio" && card.plataforma === "google", JSON.stringify(card && { o: card.origem, p: card.plataforma }));
  if (card) { E.negocios.google = card.id; E.contatos.google = card.contato?.id; salvar(); }
  // repetir o código num 2º telefone não atribui (um código vale para um telefone)
  const r2 = await entrada(T.organico, `Olá, também vi o site [ref ${codigo}]`, { nome: `${PRE} Paciente Orgânico` });
  c.ok("outro telefone com o mesmo código: atendido normalmente (responder:true)", r2.json?.responder === true, JSON.stringify(r2.json).slice(0, 160));
  E.conversas.organico = r2.json?.conversa_id; salvar();
  const o2 = r2.json?.contexto?.negocio?.origem || {};
  c.ok("…mas sem atribuição de anúncio (código já é de outro telefone)", o2.plataforma == null && o2.tipo !== "anuncio", JSON.stringify(o2));
  const card2 = await cardDoTelefone(T.organico);
  if (card2) { E.negocios.organico = card2.id; E.contatos.organico = card2.contato?.id; salvar(); }
  // Meta CTWA (referral do anúncio): campanha descoberta pela métrica do anúncio
  const r5 = await entrada(T.meta, "Oi, vi o anúncio", { nome: `${PRE} Paciente Meta`, referral: { source_type: "ad", source_id: "E2E-3009-AD-M1", ctwa_clid: "E2E3009clid" } });
  const o5 = r5.json?.contexto?.negocio?.origem || {};
  c.ok("CTWA com referral → negócio de anúncio Meta com nome da campanha/anúncio", r5.json?.responder === true && o5.plataforma === "meta" && o5.campanha === "E2E-3009 Campanha Facial" && o5.anuncio === "E2E-3009 Reel Facial", JSON.stringify(o5));
  E.conversas.meta = r5.json?.conversa_id;
  const card5 = await cardDoTelefone(T.meta);
  if (card5) { E.negocios.meta = card5.id; E.contatos.meta = card5.contato?.id; }
  salvar();
  E.codigoRastreio = codigo; // só o código curto (não é segredo)
}

async function c1_agenda(c) {
  const hor = await agente({ acao: "horarios", telefone: T.google, servico: "Avaliação", dias: 7 });
  const h = hor.json || {};
  c.ok("horarios → lista (≤12) com {inicio,rotulo} em America/Sao_Paulo", hor.status === 200 && h.ok === true && h.fuso === "America/Sao_Paulo" && Array.isArray(h.horarios) && h.horarios.length > 2 && h.horarios.length <= 12 && h.horarios.every(x => x.inicio && x.rotulo), JSON.stringify(h).slice(0, 200));
  const slots = h.horarios || [];
  c.nota("slots", slots.slice(0, 3).map(s => s.rotulo));
  if (slots.length < 3) throw new Error("sem horários livres suficientes");
  const ag = await agente({ acao: "agendar", telefone: T.google, inicio: slots[0].inicio, servico: "Avaliação", nome: `${PRE} Paciente Google`, observacao: PRE });
  const a = ag.json || {};
  c.ok("agendar → ok, negocio_id e consulta {inicio,rotulo,servico,duracao_min}", ag.status === 200 && a.ok === true && a.negocio_id && a.consulta?.inicio === slots[0].inicio && a.consulta?.servico === "Avaliação" && a.consulta?.duracao_min > 0, JSON.stringify(a).slice(0, 220));
  if (a.negocio_id && !E.negocios.google) E.negocios.google = a.negocio_id;
  const ver = deve(await rpcC("nx_negocio_ver", { p_id: E.negocios.google }), "nx_negocio_ver");
  c.ok("negócio: marco 'agendada' e consulta_em = horário marcado", get(ver, "estagio.marco") === "agendada" && new Date(get(ver, "negocio.consulta_em")).getTime() === new Date(slots[0].inicio).getTime(), JSON.stringify({ est: get(ver, "estagio"), ce: get(ver, "negocio.consulta_em") }).slice(0, 220));
  const dia = deve(await rpcC("nx_agenda_dia", { p_data: dataSP(slots[0].inicio), p_dias: 1 }), "nx_agenda_dia");
  const cons = (dia.consultas || []).find(x => x.negocio_id === E.negocios.google);
  c.ok("nx_agenda_dia mostra a consulta com a campanha (29c): plataforma google + NOME da campanha + UTMs sem código de clique", !!cons && cons.plataforma === "google" && cons.campanha_nome === "E2E-3009 Campanha Implante" && cons.anuncio_nome === "E2E-3009 Video Sorriso" && !/gclid|codigo/i.test(JSON.stringify(cons.rastreio || {})), JSON.stringify(cons || null).slice(0, 300));
  // outro contato, mesmo horário (capacidade padrão 1) → horario_ocupado
  const oc = await agente({ acao: "agendar", telefone: T.organico, inicio: slots[0].inicio, servico: "Avaliação", nome: `${PRE} Paciente Orgânico` });
  c.ok("mesmo horário por outro contato → ok:false horario_ocupado com sugestões", oc.json?.ok === false && oc.json?.erro === "horario_ocupado" && Array.isArray(oc.json?.sugestoes) && oc.json.sugestoes.length > 0 && !oc.json.sugestoes.some(s => s.inicio === slots[0].inicio), JSON.stringify(oc.json).slice(0, 220));
  // remarcar
  const re = await agente({ acao: "remarcar", telefone: T.google, inicio: slots[1].inicio, servico: "Avaliação", observacao: "cliente pediu outro horário" });
  c.ok("remarcar → ok, remarcada:true, anterior = 1º horário, consulta = 2º", re.json?.ok === true && re.json?.remarcada === true && re.json?.anterior?.inicio === slots[0].inicio && re.json?.consulta?.inicio === slots[1].inicio, JSON.stringify(re.json).slice(0, 240));
  // o horário liberado volta a caber o outro contato (mesmo pedido que antes falhou)
  const ag2 = await agente({ acao: "agendar", telefone: T.organico, inicio: slots[2].inicio, servico: "Avaliação", nome: `${PRE} Paciente Orgânico` });
  c.ok("outro contato agenda um horário livre (será o alvo do lembrete do caso 7)", ag2.json?.ok === true, JSON.stringify(ag2.json).slice(0, 200));
  E.consultaOrganico = slots[2].inicio; salvar();
  // agendar de novo quem já tem consulta → ja_agendada
  const ja = await agente({ acao: "agendar", telefone: T.google, inicio: slots[2].inicio, servico: "Avaliação" });
  c.ok("agendar quem já tem consulta → ja_agendada (usar remarcar)", ja.json?.ok === false && ja.json?.erro === "ja_agendada", JSON.stringify(ja.json).slice(0, 160));
  // cancelar
  const ca = await agente({ acao: "cancelar", telefone: T.google, motivo: `${PRE} cliente desistiu do horário` });
  c.ok("cancelar → ok com cancelada {inicio,rotulo}", ca.json?.ok === true && ca.json?.cancelada?.inicio === slots[1].inicio, JSON.stringify(ca.json).slice(0, 200));
  const ver2 = deve(await rpcC("nx_negocio_ver", { p_id: E.negocios.google }), "nx_negocio_ver");
  c.ok("negócio sem consulta e de volta para 'nova', segue aberto", get(ver2, "negocio.consulta_em") == null && get(ver2, "estagio.marco") === "nova" && get(ver2, "negocio.status") === "aberto", JSON.stringify({ e: get(ver2, "estagio.marco"), s: get(ver2, "negocio.status") }));
  // passado (agora o contato não tem consulta, então o erro de horário aparece)
  const pas = await agente({ acao: "agendar", telefone: T.google, inicio: "2026-01-05T12:00:00Z" });
  c.ok("horário no passado → passado", pas.json?.ok === false && pas.json?.erro === "passado", JSON.stringify(pas.json).slice(0, 160));
  const ca2 = await agente({ acao: "cancelar", telefone: T.google });
  c.ok("cancelar sem consulta → consulta_nao_encontrada (404)", ca2.status === 404 && ca2.json?.erro === "consulta_nao_encontrada" || (ca2.json?.ok === false && ca2.json?.erro === "consulta_nao_encontrada"), `status=${ca2.status} ${JSON.stringify(ca2.json)}`);
}

async function c1_origem_etapa(c) {
  const og = await agente({ acao: "origem", telefone: T.google, origem: "instagram", detalhe: `${PRE} disse que viu no insta` });
  c.ok("ação origem não sobrescreve a atribuição do Google (aplicado:false, ja_tem_anuncio)", og.json?.ok === true && og.json?.aplicado === false && og.json?.motivo === "ja_tem_anuncio", JSON.stringify(og.json));
  const ver = deve(await rpcC("nx_negocio_ver", { p_id: E.negocios.google }), "nx_negocio_ver");
  c.ok("…e o negócio continua com plataforma google e a campanha", get(ver, "negocio.plataforma") === "google" && get(ver, "negocio.campanha_ext") === "E2E-3009-CAMP-G1" && get(ver, "negocio.origem") === "anuncio", JSON.stringify({ p: get(ver, "negocio.plataforma"), c: get(ver, "negocio.campanha_ext"), o: get(ver, "negocio.origem") }));
  const og2 = await agente({ acao: "origem", telefone: T.organico, origem: "indicacao", detalhe: `${PRE}` });
  c.ok("origem num contato SEM anúncio é aplicada (indicacao)", og2.json?.ok === true && og2.json?.aplicado === true, JSON.stringify(og2.json));
  const et = await agente({ acao: "etapa", telefone: T.google, etapa: "orcamento", motivo: `${PRE} pediu orçamento de implante` });
  c.ok("etapa orcamento → ok mudou:true", et.json?.ok === true && et.json?.mudou === true, JSON.stringify(et.json));
  const ver2 = deve(await rpcC("nx_negocio_ver", { p_id: E.negocios.google }), "nx_negocio_ver");
  c.ok("negócio foi para o marco 'orcamento'", get(ver2, "estagio.marco") === "orcamento", get(ver2, "estagio.marco"));
  const ef = await agente({ acao: "etapa", telefone: T.google, etapa: "fechou" });
  c.ok("a IA nunca fecha negócio: etapa 'fechou' → etapa_invalida", ef.json?.ok === false && ef.json?.erro === "etapa_invalida", JSON.stringify(ef.json));
  const nt = await agente({ acao: "nota", telefone: T.google, texto: `${PRE} resumo: quer implante, prefere manhã` });
  c.ok("nota da IA gravada no negócio", nt.json?.ok === true && nt.json?.nota_id > 0, JSON.stringify(nt.json));
  if (nt.json?.nota_id) { E.notas.push(nt.json.nota_id); salvar(); }
  const ctx = await agente({ acao: "contexto", telefone: T.google });
  c.ok("ação contexto recarrega o contexto (etapa Avaliou/orçamento, campanha por nome)", ctx.json?.ok === true && ctx.json?.contexto?.negocio?.origem?.campanha === "E2E-3009 Campanha Implante" && /or[çc]amento/i.test(ctx.json?.contexto?.negocio?.etapa || ""), JSON.stringify(ctx.json?.contexto?.negocio).slice(0, 240));
}

async function c1_humano_celular_limite(c) {
  // --- humano
  const e3 = await entrada(T.humano, "Quero falar com uma pessoa", { nome: `${PRE} Paciente Humano` });
  const conv3 = e3.json?.conversa_id; E.conversas.humano = conv3; salvar();
  c.ok("contato novo → responder:true", e3.json?.responder === true);
  const antes = (await notificacoes()).length;
  const hu = await agente({ acao: "humano", telefone: T.humano, motivo: `${PRE} cliente pediu uma pessoa` });
  c.ok("humano → ok, conversa, pausada_ate preenchido", hu.json?.ok === true && hu.json?.conversa_id === conv3, JSON.stringify(hu.json));
  const st = await iaEstado(conv3);
  c.ok("IA pausada na conversa (por 'humano') e conversa em Aguardando", st.pausada === true && st.pausada_por === "humano" && st.respondendo === false, JSON.stringify(st));
  const ns = await notificacoes();
  c.ok("notificação 'A IA pediu ajuda' criada para a equipe", ns.length > antes && ns.some(n => /IA pediu ajuda/i.test(n.titulo || "") ), `antes=${antes} depois=${ns.length}`);
  const ms = listaMsgs(await mensagens(conv3));
  c.ok("aviso de sistema 'A IA chamou a equipe' no chat", ms.some(m => /IA chamou a equipe/i.test(m.corpo || m.texto || "")), `msgs=${ms.length}`);
  const e3b = await entrada(T.humano, "Alguém aí?", { nome: `${PRE} Paciente Humano` });
  c.ok("nova mensagem com a IA pausada → responder:false motivo 'pausada' (mas registrada)", e3b.json?.registrada === true && e3b.json?.responder === false && e3b.json?.motivo === "pausada", JSON.stringify(e3b.json));

  // --- saída pelo celular pausa a IA; devolver → responde
  const e4 = await entrada(T.celular, "Bom dia", { nome: `${PRE} Paciente Celular` });
  const conv4 = e4.json?.conversa_id; E.conversas.celular = conv4; salvar();
  c.ok("contato novo (celular) → responder:true", e4.json?.responder === true);
  const s4 = await saida(T.celular, `${PRE} resposta digitada no celular`, "celular");
  c.ok("saída autor 'celular' registrada", s4.json?.ok === true && s4.json?.registrada === true, JSON.stringify(s4.json));
  const st4 = await iaEstado(conv4);
  c.ok("IA pausada por 'celular'", st4.pausada === true && st4.pausada_por === "celular", JSON.stringify(st4));
  const e4b = await entrada(T.celular, "Pode ser às 9h?", { nome: `${PRE} Paciente Celular` });
  c.ok("cliente responde com a IA pausada → responder:false 'pausada'", e4b.json?.responder === false && e4b.json?.motivo === "pausada", JSON.stringify(e4b.json));
  const dev = await rpcC("nx_cv_ia_devolver", { p_conversa: conv4 });
  c.ok("painel 'devolver para a IA' → pausada:false", dev.ok && dev.dados?.pausada === false, JSON.stringify(dev.dados || dev));
  const e4c = await entrada(T.celular, "Voltei", { nome: `${PRE} Paciente Celular` });
  c.ok("depois de devolver → responder:true", e4c.json?.responder === true, JSON.stringify(e4c.json).slice(0, 160));

  // --- limite anti-loop: 8 respostas da IA em 10 min → a próxima entrada é segurada
  const e6 = await entrada(T.limite, "Oi", { nome: `${PRE} Paciente Limite` });
  const conv6 = e6.json?.conversa_id; E.conversas.limite = conv6; salvar();
  const ids = [];
  for (let i = 1; i <= 8; i++) { const m = mid("ia"); ids.push(m); const s = await saida(T.limite, `${PRE} resposta da IA ${i}`, "ia", m); if (!(s.json?.registrada === true)) c.ok(`saída da IA ${i} registrada`, false, JSON.stringify(s.json)); }
  const e6b = await entrada(T.limite, "Mais uma pergunta", { nome: `${PRE} Paciente Limite` });
  c.ok("IA respondeu 8× em 10 min → próxima entrada: responder:false motivo 'limite' (registrada)", e6b.json?.registrada === true && e6b.json?.responder === false && e6b.json?.motivo === "limite", JSON.stringify(e6b.json));
  const nl = (await notificacoes()).filter(n => /IA segurada/i.test(n.titulo || ""));
  c.ok("equipe avisada (notificação 'IA segurada')", nl.length >= 1, `notificações=${nl.length}`);
  const e6c = await entrada(T.limite, "E agora?", { nome: `${PRE} Paciente Limite` });
  const nl2 = (await notificacoes()).filter(n => /IA segurada/i.test(n.titulo || ""));
  c.ok("2ª entrada dentro dos 10 min continua 'limite' e NÃO repete o aviso", e6c.json?.motivo === "limite" && nl2.length === nl.length, `avisos ${nl.length}→${nl2.length}`);
  // outra conversa não é afetada
  const e1 = await entrada(T.google, "Bom dia de novo", { nome: `${PRE} Paciente Google` });
  c.ok("o limite é por conversa: outra conversa segue respondendo", e1.json?.responder === true, JSON.stringify(e1.json).slice(0, 140));
  // recibo: status de mensagem que o fluxo enviou
  const rc = await agente({ acao: "status", message_id: ids[0], status: "delivered" });
  c.ok("recibo 'delivered' de uma saída conhecida → ok, pendente:false", rc.json?.ok === true && rc.json?.pendente === false, JSON.stringify(rc.json));
  const rc2 = await agente({ acao: "status", message_id: id("desconhecida"), status: "read" });
  c.ok("recibo de id ainda desconhecido → ok, pendente:true (aplica quando o eco chegar)", rc2.json?.ok === true && rc2.json?.pendente === true, JSON.stringify(rc2.json));
}

async function c1_robustez(c) {
  // duplicada
  const m = mid("dup");
  const a = await entrada(T.organico, "mensagem repetida", { message_id: m, nome: `${PRE} Paciente Orgânico` });
  const b = await entrada(T.organico, "mensagem repetida", { message_id: m, nome: `${PRE} Paciente Orgânico` });
  c.ok("1ª vez registrada", a.json?.registrada === true);
  c.ok("mesmo message_id 2× → registrada:false, responder:false, motivo 'duplicada'", b.json?.registrada === false && b.json?.responder === false && b.json?.motivo === "duplicada", JSON.stringify(b.json));
  // grupo
  const g = await agente({ acao: "mensagem", direcao: "entrada", telefone: "120363025246125486@g.us", texto: `${PRE} mensagem de grupo`, message_id: mid("grp"), nome: `${PRE} Grupo` });
  c.ok("jid de grupo (@g.us) → ignorado (registrada:false, motivo 'grupo')", g.json?.ok === true && g.json?.registrada === false && g.json?.responder === false && g.json?.motivo === "grupo", JSON.stringify(g.json));
  const gl = deve(await rpcC("nx_contatos_listar", { p_filtro: { busca: "120363025246125486" }, p_pagina: 1, p_por_pagina: 20, p_ordem: null }), "nx_contatos_listar");
  c.ok("…e nenhum contato foi criado para o grupo", (gl.itens || gl.contatos || []).length === 0 && !(gl.total > 0), JSON.stringify(gl).slice(0, 160));
  // payload inválido / métodos / tamanho / ação
  const bad = await agente(undefined, { raw: "{isso nao e json" });
  c.ok("JSON inválido → 400 json_invalido", bad.status === 400 && bad.json?.erro === "json_invalido", `status=${bad.status}`);
  const ac = await agente({ acao: "apagar_tudo", telefone: T.google });
  c.ok("ação desconhecida → 400 acao_desconhecida", ac.status === 400 && ac.json?.erro === "acao_desconhecida", JSON.stringify(ac.json));
  const tl = await agente({ acao: "horarios", telefone: "123" });
  c.ok("telefone inválido → 400 dados_invalidos", tl.status === 400 && tl.json?.erro === "dados_invalidos", JSON.stringify(tl.json));
  const gg = await agente(undefined, { metodo: "GET" });
  c.ok("GET → 405 metodo_invalido", gg.status === 405, `status=${gg.status}`);
  const big = await agente(undefined, { raw: JSON.stringify({ acao: "nota", telefone: T.google, texto: "x".repeat(70_000) }) });
  c.ok("corpo > 64 KB → 413 corpo_grande", big.status === 413 && big.json?.erro === "corpo_grande", `status=${big.status}`);
  const vz = await agente({ acao: "mensagem", direcao: "entrada", telefone: T.google });
  c.ok("entrada sem texto nem mídia → 422 payload_desconhecido", vz.status === 422 && vz.json?.erro === "payload_desconhecido", JSON.stringify(vz.json));
  const own = await agente({ acao: "mensagem", direcao: "entrada", telefone: NUM_CANAL.replace(/\D/g, ""), texto: "eco do próprio número", message_id: mid("own") });
  c.ok("mensagem do próprio número do aparelho → ignorada (motivo 'eco')", own.json?.registrada === false && own.json?.motivo === "eco", JSON.stringify(own.json));
  // @lid: registra o comportamento atual (não deve virar telefone falso)
  const lid = "178190287962245";
  const l1 = await agente({ acao: "mensagem", direcao: "entrada", telefone: `${lid}@lid`, texto: `${PRE} mensagem com jid @lid`, message_id: mid("lid"), nome: `${PRE} Lid` });
  const lc = deve(await rpcC("nx_contatos_listar", { p_filtro: { busca: lid }, p_pagina: 1, p_por_pagina: 20, p_ordem: null }), "nx_contatos_listar");
  const criouContato = (lc.itens || lc.contatos || []).length > 0 || lc.total > 0;
  c.nota("lid_resposta", JSON.stringify(l1.json).slice(0, 200)); c.nota("lid_criou_contato_com_telefone_falso", criouContato);
  c.ok("jid '@lid' NÃO vira telefone falso (esperado: ignorado/recusado; sem contato novo)", !criouContato && l1.json?.registrada !== true, `registrada=${l1.json?.registrada} contato_criado=${criouContato}`);
  if (criouContato) RESULTADO.bugs.push("API do agente (codewords.js lerPayload/digitosDoJid): jid '<15 dígitos>@lid' (id interno do WhatsApp, não é telefone) é aceito como telefone: mensagem entrada com telefone '178190287962245@lid' grava contato/conversa/negócio com telefone falso '178190287962245' e devolve responder:true. Só @g.us, @broadcast, @newsletter e status@ são filtrados (GRUPO_TXT). Esperado: ignorar @lid (ou resolver o número real) em vez de criar contato.");
}

async function c1_raw_direta(c) {
  // rota 'direta': o aparelho entrega o payload CRU (sem "acao"); não há IA no caminho
  deve(await rpcC("nx_codewords_canal_salvar", { p_canal: { id: E.canal, rota: "direta" } }), "trocar para rota direta");
  try {
    const t = T.raw;
    const cru = await agente({ event: "message", payload: { chat_id: `${t}@s.whatsapp.net`, from: `${t}@s.whatsapp.net`, id: mid("raw"), body: `${PRE} payload cru sem acao`, pushname: `${PRE} Cru`, is_from_me: false, timestamp: Math.floor(Date.now() / 1000) } });
    c.ok("payload cru sem 'acao' (modo direta) → grava (registrada:true) e NÃO pede resposta da IA (ia_desligada)", cru.status === 200 && cru.json?.ok === true && cru.json?.registrada === true && cru.json?.responder === false && cru.json?.motivo === "ia_desligada", JSON.stringify(cru.json));
    const cv = cru.json?.conversa_id; E.conversas.raw = cv; salvar();
    const card = await cardDoTelefone(t);
    c.ok("contato e negócio criados a partir do payload cru (telefone sem @dominio, nome do perfil)", !!card && String(card.contato?.nome || card.nome).includes(PRE), JSON.stringify(card && { n: card.nome, t: card.telefone }));
    const cru2 = await agente({ event: "message", payload: { chat_id: `${t}@s.whatsapp.net`, id: mid("raw"), body: `${PRE} resposta pelo celular (cru)`, is_from_me: true, timestamp: Math.floor(Date.now() / 1000) } });
    c.ok("payload cru de SAÍDA (is_from_me) → registrada como saída (na rota direta é gente no celular)", cru2.json?.ok === true && cru2.json?.registrada === true && cru2.json?.motivo === "saida", JSON.stringify(cru2.json));
    const ms = listaMsgs(await mensagens(cv));
    c.ok("a conversa tem a entrada e a saída crua", ms.filter(m => /payload cru|resposta pelo celular/.test(m.corpo || m.texto || "")).length === 2, `n=${ms.length}`);
    const grp = await agente({ event: "message", payload: { chat_id: "120363025246125486@g.us", id: mid("rawg"), body: `${PRE} grupo cru`, is_group: true } });
    c.ok("payload cru de grupo → ignorado", grp.json?.registrada === false && grp.json?.motivo === "grupo", JSON.stringify(grp.json));
    const rec = await agente({ event: "ack", payload: { ids: [id("raw-desconhecido")], receipt_type: "read" } });
    c.ok("recibo cru (ack) sem mensagem conhecida → 200 sem erro (recibos:n)", rec.status === 200 && rec.json?.ok === true, JSON.stringify(rec.json));
  } finally {
    deve(await rpcC("nx_codewords_canal_salvar", { p_canal: { id: E.canal, rota: "fluxo" } }), "voltar para rota fluxo");
  }
  const s = deve(await rpcC("nx_cv_base"), "nx_cv_base");
  const k = (s.canais || []).find(x => x.id === E.canal);
  c.ok("canal voltou para rota fluxo com IA ligada", k?.ia_rota === "fluxo" && k?.ia_ligada === true, JSON.stringify(k));
}

/* ============================================================
   CASO 2a — envio pelo painel SEM aparelho pareado (não chega na rede)
   ============================================================ */
async function c2a(c) {
  const conv = E.conversas.organico;
  const r = await fn("nx-enviar", { acao: "texto", conversa: conv, texto: `${PRE} envio pelo painel (sem aparelho)` });
  c.ok("canal sem aparelho pareado → 400 codewords_sem_aparelho (erro controlado, sem rede)", r.status === 400 && r.json?.erro === "codewords_sem_aparelho", `status=${r.status} ${JSON.stringify(r.json)}`);
  const ms = listaMsgs(await mensagens(conv));
  c.ok("nenhuma mensagem de saída do painel foi gravada/enviada", !ms.some(m => /envio pelo painel \(sem aparelho\)/.test(m.corpo || m.texto || "")), `msgs=${ms.length}`);
  RESULTADO.observacoes.push("UX: o código 'codewords_sem_aparelho' (nx-enviar sem aparelho pareado) não está em web/app/api.js MENSAGENS: a tela mostraria 'Não deu certo agora (codewords_sem_aparelho)' em vez de texto claro (há 'codewords_sem_credencial', mas não este).");
}

/* ============================================================
   CASO 3 — memória aprovada da IA (30a/30e)
   ============================================================ */
async function c3(c) {
  const antes = deve(await rpcC("nx_cv_base"), "nx_cv_base");
  c.ok("base: memoria_aprovada existe e começa vazia", get(antes, "config.ia.memoria_aprovada") === "", JSON.stringify(get(antes, "config.ia")).slice(0, 200));
  const M = `${PRE} A clínica NÃO atende convênio X; limpeza custa a partir de R$ 180 (combinado ${RUN}).`;
  const s1 = await rpcC("nx_ia_config_salvar", { p_ia: { memoria_aprovada: M } });
  c.ok("salvar memória aprovada (ação do painel) → devolve o campo e 'caracteres'", s1.ok && s1.dados?.memoria_aprovada === M && s1.dados?.caracteres >= M.length, JSON.stringify(s1.dados || s1).slice(0, 200));
  const b = deve(await rpcC("nx_cv_base"), "nx_cv_base");
  c.ok("nx_cv_base devolve o campo em config.ia.memoria_aprovada (30e)", get(b, "config.ia.memoria_aprovada") === M, String(get(b, "config.ia.memoria_aprovada")).slice(0, 80));
  const ctx = await agente({ acao: "contexto", telefone: T.google });
  c.ok("API do agente: contexto.empresa.memoria_aprovada traz o texto", ctx.json?.contexto?.empresa?.memoria_aprovada === M, String(ctx.json?.contexto?.empresa?.memoria_aprovada).slice(0, 80));
  const ins = ctx.json?.contexto?.instrucoes || "";
  c.ok("instruções do agente incluem a memória (dentro do bloco de memória aprovada, como dado)", ins.includes(M) && /MEMÓRIA OPERACIONAL APROVADA/.test(ins), `tem_bloco=${/MEMÓRIA OPERACIONAL APROVADA/.test(ins)} tem_texto=${ins.includes(M)}`);
  // salvar de novo SEM o campo → não apaga
  const s2 = await rpcC("nx_ia_config_salvar", { p_ia: { sobre: `${PRE} Clínica de teste do Órbita.` } });
  c.ok("salvar outro campo SEM memoria_aprovada não apaga a memória", s2.ok && s2.dados?.memoria_aprovada === M && s2.dados?.sobre === `${PRE} Clínica de teste do Órbita.`, JSON.stringify(s2.dados || s2).slice(0, 200));
  const ctx2 = await agente({ acao: "contexto", telefone: T.google });
  c.ok("…e o agente continua vendo a memória", ctx2.json?.contexto?.empresa?.memoria_aprovada === M);
  // comportamento exato do campo vazio (a tela reenvia o campo inteiro): apaga
  const s3 = await rpcC("nx_ia_config_salvar", { p_ia: { memoria_aprovada: "" } });
  const ctx3 = await agente({ acao: "contexto", telefone: T.google });
  c.nota("campo vazio", `enviar memoria_aprovada:"" ${s3.ok && s3.dados?.memoria_aprovada === "" ? "APAGA a memória" : "não apagou"} (comportamento esperado: a tela envia o valor atual)`);
  c.ok("enviar memoria_aprovada:\"\" apaga de fato (registrado: é assim que a tela limpa o campo)", s3.ok && s3.dados?.memoria_aprovada === "" && ctx3.json?.contexto?.empresa?.memoria_aprovada === "" && !(ctx3.json?.contexto?.instrucoes || "").includes("MEMÓRIA OPERACIONAL APROVADA"), JSON.stringify(s3.dados || s3).slice(0, 160));
  // limites
  const gr = await rpcC("nx_ia_config_salvar", { p_ia: { memoria_aprovada: "x".repeat(3001) } });
  c.ok("memória > 3000 caracteres → dados_invalidos|memoria_aprovada", !gr.ok && gr.codigo === "dados_invalidos" && gr.hint === "memoria_aprovada", `${gr.codigo}|${gr.hint}`);
  const tp = await rpcC("nx_ia_config_salvar", { p_ia: { memoria_aprovada: { a: 1 } } });
  c.ok("memória que não é texto → dados_invalidos", !tp.ok && tp.codigo === "dados_invalidos", `${tp.codigo}`);
  // restaura um valor com o prefixo (a limpeza final tira tudo por SQL)
  await rpcC("nx_ia_config_salvar", { p_ia: { memoria_aprovada: "", sobre: "" } });
  // atendente/leitura: só admin salva (a sessão de teste é admin; verifica a recusa sem token)
  const sem = await rpcC("nx_ia_config_salvar", { p_ia: { memoria_aprovada: "x" } }, { token: "token-invalido-e2e" });
  c.ok("sem sessão válida → sessao_invalida", !sem.ok && sem.codigo === "sessao_invalida", `${sem.codigo}`);
}

/* ============================================================
   CASO 4 — pacotes comerciais (30b): o admin do cliente NÃO altera oferta/plano
   ============================================================ */
async function c4(c) {
  const exigir = (r, desc, esperados = ["so_gestor", "so_plataforma", "sem_permissao", "sem_acesso"]) => c.ok(desc, !r.ok && esperados.includes(r.codigo), `ok=${r.ok} codigo=${r.codigo}`);
  exigir(await rpc("nx_cliente_admin_salvar", { p_cliente: { id: CLI, comercial: { pacote: "ultra", especificacoes: `${PRE} tentativa` } } }), "admin do teste-e2e NÃO altera a oferta comercial (pacote ultra) do próprio cliente");
  exigir(await rpc("nx_cliente_admin_salvar", { p_cliente: { id: CLI, plano: "interno" } }), "…nem troca o plano para 'interno'");
  exigir(await rpc("nx_cliente_admin_salvar", { p_cliente: { id: CLI, limites: { ia_mes: 999999 } } }), "…nem muda limites");
  exigir(await rpc("nx_cliente_admin_salvar", { p_cliente: { id: CLI, modulos: ["crm", "conversas", "relatorios", "ads", "automacoes", "marca"] } }), "…nem liga módulos");
  exigir(await rpc("nx_cliente_admin_salvar", { p_cliente: { id: KAM.cliente } }), "…nem mexe (payload neutro) no cliente real kamiguchi");
  exigir(await rpc("nx_cliente_admin_salvar", { p_cliente: { nome: `${PRE} cliente novo`, slug: "e2e-3009-x", plano: "plano-inexistente" } }), "…nem cria cliente");
  exigir(await rpc("nx_clientes_admin", { p_filtro: {} }), "lista administrativa de clientes (com oferta comercial) é só da plataforma");
  exigir(await rpc("nx_plano_salvar", { p_plano: { id: "e2e3009", nome: `${PRE}` } }), "não cria/edita plano");
  exigir(await rpc("nx_org_salvar", { p_org: { nome: `${PRE} org` } }), "não cria/edita organização");
  exigir(await rpc("nx_config_salvar", { p_cfg: { anthropic_api_key: "x" } }), "não escreve configuração global");
  exigir(await rpc("nx_config_ver"), "não lê configuração global");
  exigir(await rpc("nx_contas_listar"), "não lista contas da plataforma");
  exigir(await rpc("nx_dominios_listar"), "não lista domínios");
  exigir(await rpc("nx_conta_definir", { p_conta: "3d052dbe-64ca-4ec0-9e98-ce3f936338c7", p_aprovado: true, p_papel: "clinica", p_clientes: [CLI] }), "não gerencia contas da plataforma (nem a própria)");
  exigir(await rpc("nx_executar", { p_tarefa: "nx-relatorio", p_corpo: { cliente: CLI } }), "não dispara nx-relatorio/nx-ciclo (gestor)");
  // leitura só do que é dele
  const uso = deve(await rpcC("nx_uso_plano"), "nx_uso_plano");
  c.ok("leitura do próprio plano/uso permitida (sem expor a oferta comercial)", !!uso.plano?.id && !("comercial" in uso) && !JSON.stringify(uso).includes("mensal_centavos"), JSON.stringify(Object.keys(uso)));
  const sess = deve(await rpc("nx_sessao"), "nx_sessao");
  const app = deve(await rpc("nx_app_sessao"), "nx_app_sessao");
  c.ok("sessão/app-sessão não trazem 'comercial' nem preços em centavos", !/comercial|mensal_centavos|integracao_centavos/.test(JSON.stringify(sess) + JSON.stringify(app)));
  c.ok("só o próprio cliente aparece para a conta", sess.clientes.length === 1 && app.clientes.length === 1 && sess.clientes[0].id === CLI);
  const outro = await rpc("nx_uso_plano", { p_cliente: KAM.cliente });
  c.ok("uso do plano de OUTRO cliente → sem_acesso", !outro.ok && outro.codigo === "sem_acesso", outro.codigo);
  const pl = await rpc("nx_planos_listar");
  c.nota("nx_planos_listar para admin de cliente", pl.ok ? `permitido (${JSON.stringify(pl.dados).slice(0, 120)}...)` : `negado: ${pl.codigo}`);
}

/* ============================================================
   CASO 5 — CRM: funil, criar/mover/ganhar/perder, tarefa/nota, cards com campanha
   ============================================================ */
async function c5(c) {
  const f = await funilPadrao();
  const e = f.est;
  c.ok("funil padrão Pacientes com 7 etapas e marcos nova…perdida", f.pad.estagios.length === 7 && ["nova", "agendada", "orcamento", "faltou", "fechou", "nao_fechou", "perdida"].every(m => e[m]), Object.keys(e).join(","));
  c.ok("2 funis: Pacientes (conta no Ads) e Pós-tratamento (fora do Ads)", f.base.funis.length === 2 && f.pos && f.pos.conta_no_ads === false);
  // criar negócio com contato novo por telefone digitado
  const n1 = deve(await rpcC("nx_negocio_salvar", { p_negocio: { contato: { nome: `${PRE} Paciente CRM`, telefone: T.crm }, titulo: `${PRE} Implante CRM`, servico: "Implante" } }), "criar negócio");
  E.negocios.crm = n1.id; E.contatos.crm = get(n1, "contato.id"); salvar();
  c.ok("criar: funil padrão, 1ª etapa, aberto, origem manual, dono = quem cria", n1.funil_id === f.pad.id && n1.estagio_id === e.nova.id && n1.status === "aberto" && n1.origem === "manual" && !!n1.dono_id, JSON.stringify({ f: n1.funil_id, s: n1.status, o: n1.origem }));
  const n1b = await rpcC("nx_negocio_salvar", { p_negocio: { contato: { nome: "Outro nome", telefone: T.crm.slice(0, 4) + T.crm.slice(5) } } });   // sem o 9 → mesmo contato (ou inválido)
  c.nota("mesmo contato com telefone sem o 9", n1b.ok ? (get(n1b.dados, "contato.id") === E.contatos.crm ? "reaproveitou o contato" : "criou outro contato") : `erro ${n1b.codigo}`);
  if (n1b.ok && n1b.dados?.id) await rpcC("nx_negocio_excluir", { p_id: n1b.dados.id });
  // mover: agendada (com consulta) → orçamento
  const cons = new Date(Date.now() + 3 * 24 * 3600 * 1000); cons.setUTCHours(13, 0, 0, 0);
  const m1 = await rpcC("nx_negocio_mover", { p_id: n1.id, p_estagio: e.agendada.id, p_ordem: null, p_extra: { consulta_em: cons.toISOString() } });
  c.ok("mover para 'Avaliação agendada' com consulta_em", m1.ok && get(m1.dados, "estagio_id") === e.agendada.id, JSON.stringify(m1.dados || m1).slice(0, 160));
  const m2 = await rpcC("nx_negocio_mover", { p_id: n1.id, p_estagio: e.orcamento.id });
  c.ok("mover para 'Avaliou / orçamento'", m2.ok && get(m2.dados, "estagio_id") === e.orcamento.id, JSON.stringify(m2.dados || m2).slice(0, 120));
  // ganhar
  const g0 = await rpcC("nx_negocio_mover", { p_id: n1.id, p_estagio: e.fechou.id });
  c.ok("ganhar sem valor → valor_obrigatorio", !g0.ok && g0.codigo === "valor_obrigatorio", `${g0.codigo}|${g0.hint}`);
  const g1 = await rpcC("nx_negocio_mover", { p_id: n1.id, p_estagio: e.fechou.id, p_extra: { valor: 1500 } });
  c.ok("ganhar com valor → status ganho, valor 1500, fechado_em carimbado", g1.ok && g1.dados?.status === "ganho" && Number(g1.dados?.valor) === 1500 && !!g1.dados?.fechado_em, JSON.stringify(g1.dados || g1).slice(0, 200));
  // trava de funil do Ads
  if (f.pos) {
    const tp = await rpcC("nx_negocio_mover", { p_id: n1.id, p_estagio: f.pos.estagios[0].id });
    c.ok("negócio ganho no funil de anúncios não vai para o Pós-tratamento (trava fechado_no_ads)", !tp.ok && tp.codigo === "funil_invalido" && tp.hint === "fechado_no_ads", `${tp.codigo}|${tp.hint}`);
  }
  // perder
  const n2 = deve(await rpcC("nx_negocio_salvar", { p_negocio: { contato_id: E.contatos.crm, titulo: `${PRE} Ortodontia CRM` } }), "criar negócio 2");
  E.negocios.crm2 = n2.id; salvar();
  const p0 = await rpcC("nx_negocio_mover", { p_id: n2.id, p_estagio: e.nao_fechou.id });
  c.ok("perder sem motivo → motivo_obrigatorio", !p0.ok && p0.codigo === "motivo_obrigatorio", `${p0.codigo}|${p0.hint}`);
  const motivo = f.base.motivos.find(m => !m.exige_texto) || f.base.motivos[0];
  const p1 = await rpcC("nx_negocio_mover", { p_id: n2.id, p_estagio: e.nao_fechou.id, p_extra: { motivo_perda_id: motivo.id } });
  c.ok("perder com motivo → status perdido", p1.ok && p1.dados?.status === "perdido", JSON.stringify(p1.dados || p1).slice(0, 160));
  const p2 = await rpcC("nx_negocio_mover", { p_id: n2.id, p_estagio: e.nova.id });
  c.ok("reabrir (perdido → Nova conversa) volta a aberto", p2.ok && p2.dados?.status === "aberto", JSON.stringify(p2.dados || p2).slice(0, 120));
  // tarefa / nota
  const venc = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  const t1 = deve(await rpcC("nx_tarefa_salvar", { p_tarefa: { titulo: `${PRE} Ligar para confirmar`, tipo: "ligacao", negocio_id: n2.id, vence_em: venc } }), "tarefa");
  E.tarefas.push(t1.id); salvar();
  c.ok("tarefa herda o contato do negócio e nasce aberta", get(t1, "contato.id") === E.contatos.crm && !t1.concluida_em, JSON.stringify({ c: get(t1, "contato.id") }));
  const t2 = await rpcC("nx_tarefa_concluir", { p_id: t1.id, p_concluida: true });
  c.ok("concluir tarefa", t2.ok && !!t2.dados?.concluida_em);
  const nt = deve(await rpcC("nx_nota_salvar", { p_nota: { negocio_id: n2.id, texto: `${PRE} prefere horário da manhã` } }), "nota");
  E.notas.push(nt.id); salvar();
  c.ok("nota criada no negócio", !!nt.id);
  const ver = deve(await rpcC("nx_negocio_ver", { p_id: n2.id }), "nx_negocio_ver");
  c.ok("ficha do negócio: tarefas, notas e linha do tempo", (ver.tarefas || []).some(t => t.id === t1.id) && (ver.notas || []).some(n => n.id === nt.id) && (ver.tempo || []).length > 0, Object.keys(ver).join(","));
  // cards com campanha (29c): o negócio do Google e o da Meta
  const g = await cardDoTelefone(T.google);
  c.ok("nx_crm_cards (29c) — negócio do Google: campanha_ext + campanha_nome + anuncio_nome", !!g && g.campanha_ext === "E2E-3009-CAMP-G1" && g.campanha_nome === "E2E-3009 Campanha Implante" && g.anuncio_ext === "E2E-3009-AD-G1" && g.anuncio_nome === "E2E-3009 Video Sorriso", JSON.stringify(g && { ce: g.campanha_ext, cn: g.campanha_nome, an: g.anuncio_nome }));
  c.ok("…UTMs seguras no card, sem gclid/código/fbclid", !!g && g.rastreio?.utm_source === "google" && !/gclid|fbclid|gbraid|wbraid|"codigo"/i.test(JSON.stringify(g.rastreio || {})), JSON.stringify(g?.rastreio));
  const mt = await cardDoTelefone(T.meta);
  c.ok("nx_crm_cards — negócio CTWA da Meta: campanha_nome e anuncio_nome vindos das métricas", !!mt && mt.plataforma === "meta" && mt.campanha_nome === "E2E-3009 Campanha Facial" && mt.anuncio_nome === "E2E-3009 Reel Facial", JSON.stringify(mt && { p: mt.plataforma, cn: mt.campanha_nome, an: mt.anuncio_nome }));
  const og = await cardDoTelefone(T.organico);
  c.ok("negócio sem anúncio não ganha campanha", !!og && og.campanha_ext == null && og.campanha_nome == null, JSON.stringify(og && { ce: og.campanha_ext, cn: og.campanha_nome }));
  // contato: ver/listar
  const lc = deve(await rpcC("nx_contatos_listar", { p_filtro: { busca: PRE }, p_pagina: 1, p_por_pagina: 50, p_ordem: null }), "nx_contatos_listar");
  c.ok("lista de contatos filtra pelo prefixo de teste e traz os criados", (lc.itens || lc.contatos || []).length >= 6, JSON.stringify(Object.keys(lc)));
}

/* ============================================================
   CASO 6 — Ads: números do módulo (nx_dados) = matemática do painel (web/nucleo.js)
   ============================================================ */
function esperadoSemeado() {
  const linha = (p, nivel, i) => p === "google"
    ? { p, n: nivel, g: 50 + 5 * i - (nivel === "anuncio" && i === 4 ? 10 : 0), imp: 1000 + 100 * i - (nivel === "anuncio" && i === 4 ? 100 : 0), cli: 40 + 4 * i - (nivel === "anuncio" && i === 4 ? 5 : 0), conv: 2 + (i % 2) - (nivel === "anuncio" && i === 4 ? 1 : 0) }
    : { p, n: nivel, g: 30 + 3 * i, imp: 2000 + 50 * i, cli: 60 + 2 * i, conv: 1 + (i % 3 === 0 ? 1 : 0) };
  const L = [];
  for (const p of ["google", "meta"]) for (const n of ["campanha", "anuncio"]) for (let i = 1; i <= 7; i++) L.push({ ...linha(p, n, i), i });
  return L;
}
const soma = (L, k) => L.reduce((s, x) => s + x[k], 0);
async function c6(c) {
  const N = await import(pathToFileURL(path.join(RAIZ, "web", "nucleo.js")).href);
  // fecha os dois negócios de anúncio (Google R$ 2.000 e Meta R$ 1.200) pelo CRM, como o atendente faria
  const f = await funilPadrao();
  for (const [quem, valor] of [["google", 2000], ["meta", 1200]]) {
    const r = await rpcC("nx_negocio_mover", { p_id: E.negocios[quem], p_estagio: f.est.fechou.id, p_extra: { valor } });
    c.ok(`ganhar o negócio de ${quem} (R$ ${valor})`, r.ok && r.dados?.status === "ganho", JSON.stringify(r.dados || r).slice(0, 140));
  }
  // um negócio no Pós-tratamento (fora do Ads) NÃO pode entrar no nx_dados
  if (f.pos && E.contatos.organico) {
    const pv = await rpcC("nx_negocio_salvar", { p_negocio: { contato_id: E.contatos.organico, funil_id: f.pos.id, titulo: `${PRE} pós-venda (fora do Ads)` } });
    if (pv.ok) E.negocios.pos = pv.dados.id; salvar();
    c.ok("negócio criado no funil Pós-tratamento", pv.ok, pv.codigo);
  }
  const d = deve(await rpcC("nx_dados", { p_dias: 130 }), "nx_dados");
  const mets = (d.metricas || []).filter(m => String(m.c || "").startsWith("E2E-3009-"));
  const exp = esperadoSemeado();
  c.ok("nx_dados devolve as 28 linhas de métrica semeadas (2 plataformas × 2 níveis × 7 dias) e só elas", mets.length === 28 && (d.metricas || []).length === 28, `semeadas=${mets.length} total=${(d.metricas || []).length}`);
  for (const p of ["google", "meta"]) for (const n of ["campanha", "anuncio"]) {
    const a = mets.filter(m => m.p === p && m.n === n), e = exp.filter(x => x.p === p && x.n === n);
    c.ok(`${p}/${n}: soma de gasto, impressões, cliques e conversões = semeado`, Math.abs(soma(a.map(m => ({ g: +m.g })), "g") - soma(e, "g")) < 1e-9 && soma(a.map(m => ({ v: +m.imp })), "v") === soma(e, "imp") && soma(a.map(m => ({ v: +m.cli })), "v") === soma(e, "cli") && soma(a.map(m => ({ v: +m.conv })), "v") === soma(e, "conv"),
      `nx_dados g=${soma(a.map(m => ({ g: +m.g })), "g")} esperado g=${soma(e, "g")}`);
  }
  const leads = d.leads || [];
  const meus = leads.filter(l => [T.google, T.meta, T.organico, T.crm].some(t => String(l.telefone || "").endsWith(t.slice(-8))));
  c.ok("leads do funil Pacientes (Google, Meta, orgânico, CRM) estão no nx_dados", meus.length >= 4, `meus=${meus.length}`);
  c.ok("negócio do Pós-tratamento (conta_no_ads=false) NÃO aparece no nx_dados", !leads.some(l => /pós-venda \(fora do Ads\)/.test(l.obs || l.titulo || l.servico || "")) && (E.negocios.pos ? !leads.some(l => l.id === E.negocios.pos) : true), `pos=${E.negocios.pos}`);
  const lg = leads.find(l => l.id === E.negocios.google), lm = leads.find(l => l.id === E.negocios.meta);
  c.ok("lead Google: plataforma google, campanha E2E-3009-CAMP-G1, etapa fechou, valor 2000", lg?.plataforma === "google" && lg?.campanha_ext === "E2E-3009-CAMP-G1" && lg?.etapa === "fechou" && Number(lg?.valor) === 2000, JSON.stringify(lg && { p: lg.plataforma, c: lg.campanha_ext, e: lg.etapa, v: lg.valor }));
  c.ok("lead Meta: plataforma meta, campanha E2E-3009-CAMP-M1, anúncio E2E-3009-AD-M1, etapa fechou, valor 1200", lm?.plataforma === "meta" && lm?.campanha_ext === "E2E-3009-CAMP-M1" && lm?.anuncio_ext === "E2E-3009-AD-M1" && lm?.etapa === "fechou" && Number(lm?.valor) === 1200, JSON.stringify(lm && { p: lm.plataforma, c: lm.campanha_ext, a: lm.anuncio_ext, e: lm.etapa, v: lm.valor }));

  // a mesma montagem do app (anuncios.js): datasetDeLinhas + montar — hoje = dia do servidor
  const mont = hoje => { const ds = N.datasetDeLinhas({ metricas: d.metricas, leads: d.leads, cliente: d.cliente || { nome: "teste" }, hoje, dias: 130 }); return N.montar(ds); };
  const M = mont(d.hoje);
  const tot = M.consolidar(M.linhasDe(0, M.R));
  const gT = soma(exp.filter(x => x.n === "campanha"), "g"), cvT = soma(exp.filter(x => x.n === "campanha"), "conv"), imT = soma(exp.filter(x => x.n === "campanha"), "imp"), clT = soma(exp.filter(x => x.n === "campanha"), "cli");
  const perto = (a, b) => Math.abs(a - b) < 1e-6;
  c.ok("painel (nucleo.js): gasto total = 784 (Google 490 + Meta 294), incluindo o resíduo de campanha sem anúncio", perto(tot.gasto, gT) && gT === 784, `nucleo=${tot.gasto} esperado=${gT}`);
  c.ok("painel: conversas = 27, impressões = 25.200, cliques = 868", tot.conversoes === cvT && tot.impressoes === imT && tot.cliques === clT && cvT === 27 && imT === 25200 && clT === 868, `conv=${tot.conversoes} imp=${tot.impressoes} cli=${tot.cliques}`);
  c.ok("painel: custo por conversa = 784/27, CTR = 868/25200, CPC = 784/868, CPM = 784/25200×1000", perto(tot.cpa, 784 / 27) && perto(tot.ctr, 868 / 25200 * 100) && perto(tot.cpc, 784 / 868) && perto(tot.cpm, 784 / 25200 * 1000), `cpa=${tot.cpa} ctr=${tot.ctr} cpc=${tot.cpc} cpm=${tot.cpm}`);
  const tg = M.consolidar(M.linhasDe(0, M.R, { plat: "google" })), tm = M.consolidar(M.linhasDe(0, M.R, { plat: "meta" }));
  c.ok("painel por plataforma: Google gasto 490 / 18 conversas; Meta gasto 294 / 9 conversas (frequência média ponderada 1,8)", perto(tg.gasto, 490) && tg.conversoes === 18 && perto(tm.gasto, 294) && tm.conversoes === 9 && perto(tm.freq, 1.8) && tg.freq == null, `g=${tg.gasto}/${tg.conversoes} m=${tm.gasto}/${tm.conversoes} f=${tm.freq}`);
  c.ok("campanhas do painel vêm com NOME (não id)", Object.values(M.CAMP).some(x => x.nome === "E2E-3009 Campanha Implante") && Object.values(M.CAMP).some(x => x.nome === "E2E-3009 Campanha Facial"), Object.values(M.CAMP).map(x => x.nome).join("|"));
  // a última janela de 7 dias (relatório diário): soma dos últimos 7 dias semeados = tudo (semeado hoje-7..hoje-1)
  const s7 = M.consolidar(M.linhasDe(M.R - 6, M.R));
  c.ok("últimos 7 dias do painel = todo o semeado (hoje-7…hoje-1 → 7 dias terminando ontem)", perto(s7.gasto, 784), `s7=${s7.gasto}`);
  // funil CRM no painel. Hoje o painel conta até ONTEM: negócio criado/fechado hoje só entra amanhã (desenho do painel)
  const cH = M.crmTot(0, M.R);
  c.nota("crm_hoje_(ate_ontem)", JSON.stringify({ conversas: cH.conversas, fecharam: cH.fecharam, receita: cH.receita }));
  c.ok("regra do painel: negócios de HOJE ainda não entram em 'até ontem' (conversas 0, fecharam 0)", cH.conversas === 0 && cH.fecharam === 0 && cH.receita === 0, JSON.stringify({ conversas: cH.conversas, fecharam: cH.fecharam }));
  const amanha = new Date(new Date(`${d.hoje}T12:00:00`).getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const M2 = mont(amanha);
  const cA = M2.crmTot(0, M2.R);
  // o tenant é compartilhado com outros testes (há negócios de anúncio de terceiros): a expectativa sai das LINHAS de nx_dados, não de um número fixo
  const dosAnuncios = leads.filter(l => l.plataforma);
  const fechAnuncios = dosAnuncios.filter(l => l.etapa === "fechou");
  const recAnuncios = fechAnuncios.reduce((s, l) => s + (l.valor != null ? Number(l.valor) : NaN), 0);
  c.nota("leads_de_anuncio_no_tenant", `${dosAnuncios.length} (meus: ${dosAnuncios.filter(l => (l.campanha_ext || "").startsWith("E2E-3009-")).length})`);
  c.ok("painel (como se fosse amanhã): conversas/fecharam/receita de anúncio = contagem independente das linhas de nx_dados", cA.conversas === dosAnuncios.length && cA.fecharam === fechAnuncios.length && cA.receita === recAnuncios, JSON.stringify({ conv: cA.conversas, fech: cA.fecharam, rec: cA.receita, esperado: [dosAnuncios.length, fechAnuncios.length, recAnuncios] }));
  c.ok("…e os meus dois negócios de anúncio fecharam R$ 3.200 (Google 2.000 + Meta 1.200)", fechAnuncios.filter(l => (l.campanha_ext || "").startsWith("E2E-3009-")).reduce((s, l) => s + Number(l.valor), 0) === 3200, "soma dos meus ganhos");
  const cg = M2.crmTot(0, M2.R, { plat: "google" }), cm = M2.crmTot(0, M2.R, { plat: "meta" });
  const porPlat = pl => fechAnuncios.filter(l => l.plataforma === pl);
  c.ok("…por plataforma: fechamentos e receita do painel = contagem das linhas (Google inclui meus R$ 2.000; Meta inclui meus R$ 1.200)", cg.fecharam === porPlat("google").length && cg.receita === porPlat("google").reduce((t, l) => t + Number(l.valor), 0) && cm.fecharam === porPlat("meta").length && cm.receita === porPlat("meta").reduce((t, l) => t + Number(l.valor), 0), JSON.stringify({ g: [cg.fecharam, cg.receita], m: [cm.fecharam, cm.receita] }));
  const campG = Object.values(M2.CAMP).find(x => x.nome === "E2E-3009 Campanha Implante");
  const campTop = campG ? M2.crmTot(0, M2.R, { camp: campG.id }) : null;
  c.ok("…por campanha: a campanha Google tem 1 conversa de CRM, 1 fechamento e R$ 2.000", !!campTop && campTop.conversas === 1 && campTop.fecharam === 1 && campTop.receita === 2000, JSON.stringify(campTop && { c: campTop.conversas, f: campTop.fecharam, r: campTop.receita }));
  const roas = cA.receita / tot.gasto;
  c.nota("retorno_sobre_gasto_(amanha)", `R$ ${cA.receita} / R$ ${tot.gasto} = ${roas.toFixed(3)}x`);
  // relatórios: texto do WhatsApp gerado pelo MESMO núcleo que o nx-relatorio usa (sem enviar nada) + relatórios do app
  let rd = null, rm = null, errRel = null;
  try { rd = M2.relDiario(M2.R); const mes = M2.mesesDados().pop(); rm = M2.relMensal(mes); } catch (e) { errRel = String(e?.message || e); }
  c.ok("relatório diário e mensal (texto do WhatsApp) geram sem erro com os dados do teste", !errRel && typeof rd === "string" && rd.length > 100 && typeof rm === "string" && rm.length > 100, errRel || "");
  c.ok("relatório diário traz o gasto e o nome da campanha líder", /784/.test(rd || "") , String(rd).slice(0, 200));
  const ctxIA = M2.contextoIA(M2.R);
  c.ok("contexto para a IA de relatório (números crus) traz as duas campanhas", (ctxIA.campanhas_7d || []).length === 2, JSON.stringify((ctxIA.campanhas_7d || []).map(x => x.nome)));
  const hoje = d.hoje, de = new Date(new Date(`${hoje}T12:00:00`).getTime() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const rv = await rpcC("nx_rel_vendas", { p_de: de, p_ate: hoje, p_funil: null });
  c.ok("RPC de relatório de vendas (app) gera sem erro", rv.ok, `${rv.codigo}|${rv.hint}`);
  c.nota("nx_rel_vendas", rv.ok ? JSON.stringify(Object.keys(rv.dados)).slice(0, 160) : rv.codigo);
  const ra = await rpcC("nx_rel_atendimento", { p_de: de, p_ate: hoje, p_departamento: null });
  c.ok("RPC de relatório de atendimento (app) gera sem erro", ra.ok, `${ra.codigo}|${ra.hint}`);
  if (rv.ok) { const ser = JSON.stringify(rv.dados); c.ok("relatório de vendas enxerga os ganhos do teste (R$ 3.200 de anúncios + R$ 1.500 do CRM = R$ 4.700 em ganhos)", /4700|4\.700/.test(ser) || /3200/.test(ser), ser.slice(0, 240)); }
  RESULTADO.naoProvado.push("nx-relatorio (Edge Function) NÃO foi executada: exige o cron_token (nx_config) que não pode ser lido e o nx_executar é só de gestor; provado o mesmo texto pelo núcleo web/nucleo.js (usado pela função) e os RPCs de relatório do app. Sem WhatsApp real, sem IA (nx_cv_base.ia.ligada=false).");
}

/* ============================================================
   CASO 7 — Automações
   ============================================================ */
async function c7(c) {
  const f = await funilPadrao();
  // etiqueta de teste para restringir as automações aos MEUS negócios (o tenant é compartilhado com outros testes)
  const et = deve(await rpcC("nx_etiqueta_salvar", { p_etiqueta: { nome: `${PRE} auto ${RUN}`, cor: "#22AA66" } }), "etiqueta");
  E.etiquetas.push(et.id); salvar();
  const marcar = async ids => { for (const n of ids) { const r = await rpcC("nx_negocio_salvar", { p_negocio: { id: n, etiquetas: [et.id] } }); if (!r.ok) throw new Error(`etiquetar negócio ${n}: ${r.codigo}`); } };
  await marcar([E.negocios.crm2, E.negocios.organico].filter(Boolean));
  // (a) simples: negócio entra em 'Faltou' → cria tarefa. Só para negócios com a etiqueta de teste
  const aut = await rpcC("nx_automacao_salvar", { p_auto: { nome: `${PRE} entrou em Faltou → tarefa`, gatilho: "negocio_estagio", config: { estagio_id: f.est.faltou.id },
    condicoes: [{ campo: "etiqueta", op: "igual", valor: et.id }], acoes: [{ tipo: "criar_tarefa", titulo: `${PRE} reagendar quem faltou`, tipo_tarefa: "ligacao", vence_em_horas: 24, dono: "responsavel" }, { tipo: "notificar", para: "admins", titulo: `${PRE} automação rodou`, texto: "teste E2E" }] } });
  c.ok("automação simples criada (desligada)", aut.ok && !!aut.dados?.id, `${aut.codigo}|${aut.hint}`);
  if (!aut.ok) return;
  E.automacoes.push(aut.dados.id); salvar();
  const at = await rpcC("nx_automacao_ativar", { p_id: aut.dados.id, p_ativo: true });
  c.ok("ativar automação", at.ok, `${at.codigo}|${at.hint}`);
  // dispara o evento: move meu negócio etiquetado para Faltou
  const mv = await rpcC("nx_negocio_mover", { p_id: E.negocios.crm2, p_estagio: f.est.faltou.id });
  c.ok("evento: mover negócio etiquetado para 'Faltou'", mv.ok, `${mv.codigo}`);
  const exec = await esperarAte(async () => { const r = await rpcC("nx_automacao_execucoes", { p_id: aut.dados.id, p_limite: 10 }); const l = r.ok ? (Array.isArray(r.dados) ? r.dados : r.dados?.itens || r.dados?.execucoes || []) : []; return l.length ? l : null; }, { ms: 75_000, cada: 3000 });
  c.ok("a automação dispara no evento (cron de 15 s) e grava a execução", !!exec && exec.length >= 1, `execuções=${exec?.length ?? 0}`);
  c.ok("execução gravada com resultado 'ok' e detalhe das ações", !!exec && exec.some(x => x.ok === true), JSON.stringify(exec && exec[0]).slice(0, 240));
  const tr = deve(await rpcC("nx_tarefas_listar", { p_filtro: { busca: PRE } }), "nx_tarefas_listar");
  const lt = Array.isArray(tr) ? tr : tr.itens || tr.tarefas || [];
  const tauto = lt.find(t => /reagendar quem faltou/.test(t.titulo || ""));
  c.ok("a ação 'criar tarefa' deixou a tarefa no CRM (vinculada ao negócio)", !!tauto, `tarefas=${lt.length}`);
  if (tauto) { E.tarefas.push(tauto.id); salvar(); }
  // o evento de OUTRO negócio (sem a etiqueta) não dispara (condição)
  const n0 = E.negocios.crm;
  const antes = (exec || []).length;
  if (n0) { await rpcC("nx_negocio_mover", { p_id: n0, p_estagio: f.est.faltou.id }); await sleep(20_000); }
  const r2 = await rpcC("nx_automacao_execucoes", { p_id: aut.dados.id, p_limite: 20 }); const l2 = r2.ok ? (Array.isArray(r2.dados) ? r2.dados : r2.dados?.itens || r2.dados?.execucoes || []) : [];
  c.ok("negócio SEM a etiqueta não gera execução ok (condição respeitada)", l2.filter(x => x.ok === true).length === (exec || []).filter(x => x.ok === true).length, `ok antes=${(exec || []).filter(x => x.ok === true).length} depois=${l2.filter(x => x.ok === true).length} (${antes}→${l2.length})`);
  await rpcC("nx_automacao_ativar", { p_id: aut.dados.id, p_ativo: false });   // desliga: o tenant é compartilhado
  // limites de validação
  const inv = await rpcC("nx_automacao_salvar", { p_auto: { nome: `${PRE} inválida`, gatilho: "antes_da_data", config: { campo: "consulta", horas: 200 }, acoes: [{ tipo: "notificar", para: "admins", titulo: "x" }] } });
  c.ok("antes_da_data com horas fora de 1..72 → automacao_invalida", !inv.ok && inv.codigo === "automacao_invalida", `${inv.codigo}|${inv.hint}`);
}

/* ============================================================
   FASE ENVIO (casos 2b e 7b) — só depois do flag: o aparelho do canal de teste recebe um phone_id
   falso por SQL (service role) e a chave FALSA faz o CodeWords recusar (HTTP 401 → definitivo).
   ============================================================ */
async function esperarFlag(arq, ms = 10 * 60_000) {
  log(`AGUARDANDO_FLAG ${path.basename(arq)}`);
  const ok = await esperarAte(async () => fs.existsSync(arq), { ms, cada: 2000 });
  if (!ok) throw new Error(`flag ${path.basename(arq)} não apareceu em ${ms / 1000}s`);
}
async function c2b_e_7b(c2, c7b) {
  const conv = E.conversas.organico;
  if (fs.existsSync(FLAG_FEITO)) fs.unlinkSync(FLAG_FEITO);
  await esperarFlag(FLAG_PRONTO);
  // ---- 2b: painel → nx-enviar → CodeWords (chave falsa)
  const antes = await iaEstado(conv);
  const nAntes = listaMsgs(await mensagens(conv)).length;
  const r = await fn("nx-enviar", { acao: "texto", conversa: conv, texto: `${PRE} envio pelo painel (chave falsa)` });
  c2.nota("http_status", r.status); c2.nota("resposta", limpo(r.json).slice(0, 300));
  c2.ok("erro legível e controlado: ok:false, erro 'envio_falhou', detalhe em português sobre a chave recusada", r.json?.ok === false && r.json?.erro === "envio_falhou" && /recus|chave|CodeWords/i.test(r.json?.detalhe || ""), limpo(r.json).slice(0, 240));
  c2.ok("a resposta traz a mensagem gravada com status 'falhou' e o motivo (o atendente vê o '!')", r.json?.mensagem?.status === "falhou" && /CodeWords/.test(r.json?.mensagem?.erro || ""), limpo(r.json?.mensagem).slice(0, 240));
  c2.ok("falha por chave recusada NÃO é 'incerta' (ambigua ≠ true) e não promete reenvio", r.json?.ambigua !== true && !/STATUS INCERTO/i.test(r.json?.detalhe || ""), limpo(r.json).slice(0, 200));
  const depois = await iaEstado(conv);
  c2.nota("ia_pausada_antes_depois", `${antes.pausada} → ${depois.pausada}`);
  c2.ok("IA NÃO ficou pausada por um envio que falhou de vez (registrado)", depois.pausada === antes.pausada, JSON.stringify({ antes: antes.pausada, depois: depois.pausada, por: depois.pausada_por }));
  const ms1 = listaMsgs(await mensagens(conv));
  c2.ok("exatamente 1 mensagem nova de saída, com erro", ms1.length === nAntes + 1 && ms1.filter(m => /envio pelo painel \(chave falsa\)/.test(m.corpo || m.texto || "")).length === 1, `antes=${nAntes} depois=${ms1.length}`);
  log("aguardando 75 s para provar que nada é reenviado sozinho…");
  await sleep(75_000);
  const ms2 = listaMsgs(await mensagens(conv));
  const falhada = ms2.find(m => /envio pelo painel \(chave falsa\)/.test(m.corpo || m.texto || ""));
  c2.ok("75 s depois: continua 1 só mensagem 'falhou' (sem reenvio automático, sem loop)", ms2.length === ms1.length && falhada?.status === "falhou", `msgs ${ms1.length}→${ms2.length} status=${falhada?.status}`);

  // ---- 7b: lembrete antes_da_data → fila → nx-enviar cron → CodeWords (falha definitiva)
  const f = await funilPadrao();
  const et = E.etiquetas[0];
  const aut = await rpcC("nx_automacao_salvar", { p_auto: { nome: `${PRE} lembrete 72 h antes da consulta`, gatilho: "antes_da_data", config: { campo: "consulta", horas: 72 },
    condicoes: [{ campo: "etiqueta", op: "igual", valor: et }], acoes: [{ tipo: "enviar_mensagem", texto: `${PRE} Olá {primeiro_nome}, lembrete da sua consulta.` }] } });
  c7b.ok("automação de lembrete (antes_da_data, consulta, 72 h, texto livre CodeWords) criada", aut.ok && !!aut.dados?.id, `${aut.codigo}|${aut.hint}`);
  if (!aut.ok) return;
  E.automacoes.push(aut.dados.id); salvar();
  const at = await rpcC("nx_automacao_ativar", { p_id: aut.dados.id, p_ativo: true });
  c7b.ok("lembrete ativado", at.ok, `${at.codigo}`);
  const exec = await esperarAte(async () => { const x = await rpcC("nx_automacao_execucoes", { p_id: aut.dados.id, p_limite: 20 }); const l = x.ok ? (Array.isArray(x.dados) ? x.dados : x.dados?.itens || x.dados?.execucoes || []) : []; return l.find(e => typeof e.ok === "boolean") || null; }, { ms: 90_000, cada: 3000 });
  c7b.nota("execucao", limpo(exec).slice(0, 300));
  c7b.ok("o lembrete disparou para a consulta (≤ 72 h) e registrou a execução", !!exec, "sem execução");
  c7b.ok("ação 'enviar_mensagem' deixou o item na fila do canal CodeWords ('mensagem na fila')", !!exec && /fila/i.test(JSON.stringify(exec)), limpo(exec).slice(0, 240));
  await rpcC("nx_automacao_ativar", { p_id: aut.dados.id, p_ativo: false });   // uma rodada basta; desliga para não tocar em mais nada
  // a fila (cron de 1 min) entrega ao CodeWords e falha como definitivo; o resultado aparece na conversa do contato
  const falha = await esperarAte(async () => { const m = listaMsgs(await mensagens(conv)); return m.find(x => /lembrete da sua consulta/.test(x.corpo || x.texto || "") && x.status && x.status !== "pendente"); }, { ms: 150_000, cada: 5000 });
  c7b.ok("a fila processou o item e a mensagem do lembrete ficou 'falhou' com motivo legível (chave recusada)", !!falha && falha.status === "falhou" && /CodeWords/.test(falha.erro || ""), limpo(falha).slice(0, 240));
  c7b.ok("falha definitiva: sem 'STATUS INCERTO' (não é ambígua) — nada de reenvio", !!falha && !/INCERTO/i.test(falha.erro || ""), limpo(falha?.erro));
  fs.writeFileSync(FLAG_FEITO, "ok");
  log("aguardando 130 s para provar que a fila não reenvia (2 rodadas do cron)…");
  await sleep(130_000);
  const m3 = listaMsgs(await mensagens(conv));
  c7b.ok("130 s depois: 1 única mensagem de lembrete (sem duplicata/loop)", m3.filter(x => /lembrete da sua consulta/.test(x.corpo || x.texto || "")).length === 1, `n=${m3.filter(x => /lembrete da sua consulta/.test(x.corpo || x.texto || "")).length}`);
}

/* ============================================================
   CASO 9 — ISOLAMENTO pela API (sessão do teste-e2e)
   ============================================================ */
async function c9(c) {
  const naoAchou = r => !r.ok && (/(_nao_encontrad[oa]|sem_acesso|sem_permissao|dados_invalidos|estagio_invalido|funil_invalido|so_gestor|so_plataforma)$/.test(r.codigo) || /^http_4/.test(r.codigo));
  const k = KAM.cliente;
  // 1) RPCs de painel com p_cliente = kamiguchi → sem_acesso ANTES de qualquer outra coisa (porta da frente).
  //    Leituras: payload normal. Escritas: payload INVÁLIDO de propósito ("e2e-3009-invalido"): se o portão de acesso
  //    falhasse, o pedido morreria em dados_invalidos e NADA seria gravado no cliente real (a prova de que o portão
  //    vem primeiro é justamente o erro ser sem_acesso, não dados_invalidos).
  const INV = "e2e-3009-invalido";
  const leituras = [["nx_crm_base", {}], ["nx_negocios_kanban", { p_funil: KAM.funis[0], p_filtro: {}, p_por_coluna: 20 }], ["nx_negocios_coluna", { p_estagio: KAM.estagios[0], p_filtro: {}, p_offset: 0 }],
    ["nx_contatos_listar", { p_filtro: {}, p_pagina: 1, p_por_pagina: 20, p_ordem: null }], ["nx_contatos_exportar", { p_filtro: {}, p_pagina: 1 }], ["nx_empresas_listar", { p_filtro: {}, p_pagina: 1, p_por_pagina: 20 }],
    ["nx_tarefas_listar", { p_filtro: {} }], ["nx_buscar", { p_q: "a" }], ["nx_cv_base", {}], ["nx_cv_listar", { p_filtro: {}, p_limite: 20, p_antes: null }],
    ["nx_canais_listar", {}], ["nx_notificacoes_listar", { p_limite: 20 }], ["nx_agenda_dia", { p_data: null, p_dias: 7 }], ["nx_agenda_config_ver", {}], ["nx_agenda_livres", { p_a_partir: null, p_dias: 7, p_servico: null, p_negocio: null }],
    ["nx_dados", { p_dias: 130 }], ["nx_integracoes_status", {}], ["nx_inicio", {}], ["nx_pulso", {}], ["nx_rel_vendas", { p_de: "2026-09-01", p_ate: "2026-09-30", p_funil: null }],
    ["nx_rel_atendimento", { p_de: "2026-09-01", p_ate: "2026-09-30", p_departamento: null }], ["nx_automacoes_listar", {}], ["nx_usuarios_listar", {}], ["nx_uso_plano", {}], ["nx_entrada_chave", { p_gerar: false }],
    ["nx_cv_ia_estado", { p_conversa: 1 }], ["nx_negocio_ver", { p_id: 1 }], ["nx_contato_ver", { p_id: 1 }], ["nx_cv_ver", { p_id: 1 }], ["nx_empresa_ver", { p_id: 1 }]];
  const escritas = [["nx_funil_salvar", "p_funil"], ["nx_etiqueta_salvar", "p_etiqueta"], ["nx_resposta_salvar", "p_resposta"], ["nx_departamento_salvar", "p_departamento"], ["nx_motivo_salvar", "p_motivo"],
    ["nx_campo_salvar", "p_campo"], ["nx_negocio_salvar", "p_negocio"], ["nx_contato_salvar", "p_contato"], ["nx_tarefa_salvar", "p_tarefa"], ["nx_nota_salvar", "p_nota"], ["nx_automacao_salvar", "p_auto"],
    ["nx_agenda_config_salvar", "p_cfg"], ["nx_agenda_bloqueio_salvar", "p_bloqueio"], ["nx_ia_config_salvar", "p_ia"], ["nx_cv_config_salvar", "p_cfg"], ["nx_codewords_canal_salvar", "p_canal"], ["nx_canal_salvar", "p_canal"],
    ["nx_usuario_salvar", "p_usuario"], ["nx_empresa_salvar", "p_empresa"], ["nx_contatos_importar", "p_linhas"]];
  let negados = 0; const furos = [];
  const veredito = (nome, r2) => { if (!r2.ok && /sem_acesso|sem_permissao|so_gestor|so_plataforma|funcao_invalida/.test(r2.codigo)) negados++; else furos.push(`${nome}: ${r2.ok ? "PASSOU (dados devolvidos)" : r2.codigo}`); };
  for (const [nome, par] of leituras) veredito(nome, await rpc(nome, { p_cliente: k, ...par }));
  for (const [nome, pj] of escritas) veredito(nome, await rpc(nome, { p_cliente: k, [pj]: INV }));
  veredito("nx_agenda_marcar", await rpc("nx_agenda_marcar", { p_cliente: k, p_negocio: 2147483000, p_inicio: INV }));
  veredito("nx_agenda_desmarcar", await rpc("nx_agenda_desmarcar", { p_cliente: k, p_negocio: 2147483000, p_motivo: null }));
  veredito("nx_negocio_mover", await rpc("nx_negocio_mover", { p_cliente: k, p_id: 2147483000, p_estagio: KAM.estagios[0] }));
  veredito("nx_negocio_excluir", await rpc("nx_negocio_excluir", { p_cliente: k, p_id: 2147483000 }));
  veredito("nx_tarefa_concluir", await rpc("nx_tarefa_concluir", { p_cliente: k, p_id: 2147483000, p_concluida: true }));
  veredito("nx_cv_nota", await rpc("nx_cv_nota", { p_cliente: k, p_conversa: 2147483000, p_texto: INV }));
  veredito("nx_cv_ia_pausar", await rpc("nx_cv_ia_pausar", { p_cliente: k, p_conversa: 2147483000, p_horas: 1 }));
  veredito("nx_cv_ia_devolver", await rpc("nx_cv_ia_devolver", { p_cliente: k, p_conversa: 2147483000 }));
  veredito("nx_cv_status", await rpc("nx_cv_status", { p_cliente: k, p_conversa: 2147483000, p_status: "resolvida" }));
  veredito("nx_cv_atribuir", await rpc("nx_cv_atribuir", { p_cliente: k, p_conversa: 2147483000, p_conta: null, p_departamento: null }));
  veredito("nx_canal_excluir", await rpc("nx_canal_excluir", { p_cliente: k, p_id: "00000000-0000-4000-8000-000000000e2e", p_confirmacao: "nao" }));
  veredito("nx_automacao_ativar", await rpc("nx_automacao_ativar", { p_cliente: k, p_id: "00000000-0000-4000-8000-000000000e2e", p_ativo: false }));
  veredito("nx_automacao_excluir", await rpc("nx_automacao_excluir", { p_cliente: k, p_id: "00000000-0000-4000-8000-000000000e2e" }));
  veredito("nx_contato_excluir", await rpc("nx_contato_excluir", { p_cliente: k, p_id: 2147483000, p_confirmacao: "nao" }));
  const total = leituras.length + escritas.length + 14;
  c.ok(`${total} RPCs de painel (CRM, agenda, conversas, canais, automações, IA, rastreio/entrada) chamadas com p_cliente = kamiguchi → todas negadas com sem_acesso`, furos.length === 0 && negados === total, `negadas=${negados}/${total} furos=${furos.join(" ; ").slice(0, 600)}`);
  c.nota("rpcs_testadas_com_cliente_alheio", total);
  // 2) cliente PRÓPRIO + objetos de outro cliente (porta dos fundos). Só operações que não podem machucar o kamiguchi:
  //    leituras com ids dele, mover/alterar NEGÓCIO MEU para algo dele, e ids que não existem em lugar nenhum.
  //    As escritas sobre linhas reais do kamiguchi (funil/etiqueta/resposta/departamento/motivo) ficam no SQL em ROLLBACK.
  const os = [];
  const tenta = async (desc, nome, par, esperado = naoAchou) => { const r = await rpcC(nome, par); os.push([desc, !!esperado(r), `${r.ok ? "OK-devolveu " + limpo(r.dados).slice(0, 80) : r.codigo + (r.hint ? "|" + r.hint : "")}`]); };
  const meuNeg = E.negocios.crm;
  await tenta("kanban com funil do kamiguchi", "nx_negocios_kanban", { p_funil: KAM.funis[0], p_filtro: {}, p_por_coluna: 20 });
  await tenta("coluna com etapa do kamiguchi", "nx_negocios_coluna", { p_estagio: KAM.estagios[0], p_filtro: {}, p_offset: 0 });
  await tenta("mover MEU negócio para etapa do kamiguchi", "nx_negocio_mover", { p_id: meuNeg, p_estagio: KAM.estagios[0] });
  await tenta("criar negócio MEU no funil do kamiguchi", "nx_negocio_salvar", { p_negocio: { contato_id: E.contatos.crm, funil_id: KAM.funis[0], titulo: `${PRE} x` } });
  await tenta("negócio MEU com etiqueta do kamiguchi (descartada, não grava)", "nx_negocio_salvar", { p_negocio: { id: meuNeg, etiquetas: [KAM.etiquetas[0]] } }, r => r.ok ? !JSON.stringify(r.dados?.etiquetas || []).includes(KAM.etiquetas[0]) : naoAchou(r));
  await tenta("automação MINHA com etapa do kamiguchi", "nx_automacao_salvar", { p_auto: { nome: `${PRE} x`, gatilho: "negocio_estagio", config: { estagio_id: KAM.estagios[0] }, acoes: [{ tipo: "notificar", para: "admins", titulo: "x" }] } }, r => !r.ok);
  await tenta("canal MEU com departamento do kamiguchi", "nx_codewords_canal_salvar", { p_canal: { id: E.canal, departamento_id: KAM.departamentos[0] } }, r => !r.ok);
  await tenta("agenda: marcar negócio inexistente/alheio", "nx_agenda_marcar", { p_negocio: 2147483000, p_inicio: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString() });
  await tenta("agenda: desmarcar negócio alheio", "nx_agenda_desmarcar", { p_negocio: 2147483000, p_motivo: null });
  await tenta("tarefa alheia", "nx_tarefa_concluir", { p_id: 2147483000, p_concluida: true });
  await tenta("nota alheia", "nx_nota_excluir", { p_id: 2147483000 });
  await tenta("contato alheio: excluir", "nx_contato_excluir", { p_id: 2147483000, p_confirmacao: "excluir" });
  await tenta("contato alheio: ver", "nx_contato_ver", { p_id: 2147483000 });
  await tenta("negócio alheio: ver", "nx_negocio_ver", { p_id: 2147483000 });
  await tenta("negócio alheio: excluir", "nx_negocio_excluir", { p_id: 2147483000 });
  await tenta("conversa alheia: ver", "nx_cv_ver", { p_id: 2147483000 });
  await tenta("conversa alheia: mensagens", "nx_cv_mensagens", { p_conversa: 2147483000, p_limite: 20 });
  await tenta("conversa alheia: devolver IA", "nx_cv_ia_devolver", { p_conversa: 2147483000 });
  await tenta("conversa alheia: atribuir", "nx_cv_atribuir", { p_conversa: 2147483000, p_conta: null, p_departamento: null });
  await tenta("conversa MINHA + negócio alheio: vincular", "nx_cv_vincular_negocio", { p_conversa: E.conversas.google, p_negocio: 2147483000 });
  await tenta("automação alheia: excluir", "nx_automacao_excluir", { p_id: "00000000-0000-4000-8000-000000000e2e" });
  await tenta("canal alheio: excluir", "nx_canal_excluir", { p_id: "00000000-0000-4000-8000-000000000e2e", p_confirmacao: "excluir" });
  await tenta("usuário alheio (conta do gestor): remover acesso", "nx_usuario_remover", { p_conta: "ff6c6444-081c-4cf9-adf0-516d10ccedb9" });
  c.ok(`${os.length} operações com cliente próprio e objetos/ids de outro cliente → negadas ou vazias`, os.every(x => x[1]), os.filter(x => !x[1]).map(x => `${x[0]} => ${x[2]}`).join(" ; ").slice(0, 700));
  c.nota("sondas_com_id_alheio", os.map(x => `${x[1] ? "neg" : "FURO"}:${x[0]}=${x[2]}`.slice(0, 120)));
  // 3) o segredo do canal de teste não serve para outro cliente
  const corpoMisto = { acao: "mensagem", direcao: "entrada", telefone: tel(803), texto: `${PRE} tentativa de falar como outro cliente`, message_id: mid("x"), nome: `${PRE} Cross`, cliente_id: k, cliente: k, canal_id: "00000000-0000-4000-8000-000000000e2e", p_cliente: k };
  const x = await agente(corpoMisto);
  c.ok("API do agente ignora cliente_id/canal_id do corpo: o canal/cliente vêm SÓ do segredo (grava no teste-e2e)", x.json?.ok === true && x.json?.registrada === true, limpo(x.json).slice(0, 160));
  const cx = await cardDoTelefone(tel(803));
  c.ok("…o contato apareceu no CRM do teste-e2e", !!cx, "sem card");
  if (cx) { E.negocios.cross = cx.id; E.contatos.cross = cx.contato?.id; salvar(); }
  const rk = await fn("nx-codewords", { acao: "receita", canal: E.canal, cliente: k });
  c.ok("painel: 'receita' do canal de teste com cliente = kamiguchi → 403 sem_acesso", rk.status === 403 && rk.json?.erro === "sem_acesso", `status=${rk.status} ${limpo(rk.json).slice(0, 100)}`);
  const rk2 = await fn("nx-codewords", { acao: "estado", canal: E.canal, cliente: k });
  c.ok("painel: 'estado' (chamaria o CodeWords) com cliente alheio é barrado ANTES de qualquer rede (403)", rk2.status === 403, `status=${rk2.status}`);
  const rk3 = await fn("nx-enviar", { acao: "texto", conversa: 2147483000, texto: "x", cliente: k });
  c.ok("nx-enviar com cliente alheio → 403 sem_acesso (sem tocar em rede)", rk3.status === 403, `status=${rk3.status} ${limpo(rk3.json).slice(0, 100)}`);
  const rk4 = await fn("nx-enviar", { acao: "texto", conversa: 2147483000, texto: "x" });
  c.ok("nx-enviar com conversa inexistente → 404 conversa_nao_encontrada", rk4.status === 404, `status=${rk4.status}`);
  const rk5 = await fn("nx-codewords", { acao: "receita", canal: "00000000-0000-4000-8000-000000000e2e" });
  c.ok("painel: 'receita' de canal inexistente/alheio → 404 canal_nao_encontrado", rk5.status === 404 && rk5.json?.erro === "canal_nao_encontrado", `status=${rk5.status}`);
  const rk6 = await fn("nx-codewords", { acao: "receita", canal: E.canal, token: "token-invalido" });
  c.ok("painel com token inválido → 401 sessao_invalida", rk6.status === 401, `status=${rk6.status}`);
  // 4) anônimo: tabelas fechadas e RPCs sem token
  for (const t of ["nx_contatos", "nx_leads", "nx_conversas", "nx_mensagens", "nx_canais", "nx_sessoes", "nx_contas", "nx_funis"]) {
    const r = await http(`${SUPA}/rest/v1/${t}?select=*&limit=1`, { metodo: "GET", headers: { apikey: KEY } });
    c.ok(`GET /rest/v1/${t} só com a chave pública → negado (sem linhas)`, r.status === 401 || r.status === 403 || (r.status === 200 && Array.isArray(r.json) && r.json.length === 0), `status=${r.status}`);
  }
  const an = await rpc("nx_crm_base", { p_cliente: CLI }, { anon: true });
  c.ok("RPC de painel sem token → erro, sem dados", !an.ok, an.codigo);
  const fx = await fn("nx-enviar", { acao: "texto", conversa: E.conversas.google, texto: "x", token: "" });
  c.ok("nx-enviar sem token → 401", fx.status === 401, `status=${fx.status}`);
  const nn = await http(`${SUPA}/functions/v1/nx-enviar`, { corpo: { fila: true }, headers: { apikey: KEY, "x-nx-cron": "falso" } });
  c.ok("nx-enviar em modo cron com cabeçalho falso → 401", nn.status === 401, `status=${nn.status}`);
  const nc = await http(`${SUPA}/functions/v1/nx-codewords`, { corpo: { sincronizar: true }, headers: { apikey: KEY, "x-nx-cron": "falso" } });
  c.ok("nx-codewords em modo cron com cabeçalho falso → 401", nc.status === 401, `status=${nc.status}`);
  const nw = await http(`${SUPA}/functions/v1/nx-relatorio`, { corpo: { tipo: "diario", cliente: KAM.cliente, forcar: true }, headers: { apikey: KEY, "x-nx-cron": "falso" } });
  c.ok("nx-relatorio (quem mandaria WhatsApp) com cron falso e cliente kamiguchi → 401", nw.status === 401, `status=${nw.status}`);
}

/* ============================================================
   LIMPEZA — apaga pela API tudo que criou (o SQL final confere e varre o que sobrar)
   ============================================================ */
async function limpar() {
  const log1 = [];
  const tenta = async (desc, p) => { try { const r = await p; log1.push(`${desc}:${r.ok ? "ok" : r.codigo}`); } catch (e) { log1.push(`${desc}:ERRO ${e?.message}`); } };
  for (const a of E.automacoes) await tenta(`automacao ${a}`, rpcC("nx_automacao_excluir", { p_id: a }));
  for (const t of E.tarefas) await tenta(`tarefa ${t}`, rpcC("nx_tarefa_excluir", { p_id: t }));
  for (const n of E.notas) await tenta(`nota ${n}`, rpcC("nx_nota_excluir", { p_id: n }));
  // negócios: os rastreados + os que a busca pelo prefixo/telefone achar (primeiro negócios, depois contatos)
  const ids = new Set(Object.values(E.negocios).filter(Boolean));
  for (const n of ids) await tenta(`negocio ${n}`, rpcC("nx_negocio_excluir", { p_id: n }));
  for (const busca of [PRE, P]) {
    for (let pg = 1; pg <= 5; pg++) {
      const lc = await rpcC("nx_contatos_listar", { p_filtro: { busca }, p_pagina: pg, p_por_pagina: 100, p_ordem: null });
      const lista = lc.ok ? (lc.dados.itens || lc.dados.contatos || []) : [];
      if (!lista.length) break;
      for (const ct of lista) {
        if (!(String(ct.telefone || "").startsWith(P) || String(ct.nome || "").startsWith(PRE) || String(ct.telefone || "") === "178190287962245")) continue;
        const cv = await rpcC("nx_contato_ver", { p_id: ct.id });
        for (const n of (cv.ok ? (cv.dados.negocios || cv.dados.outros || []) : [])) await tenta(`negocio ${n.id}`, rpcC("nx_negocio_excluir", { p_id: n.id }));
        await tenta(`contato ${ct.id}`, rpcC("nx_contato_excluir", { p_id: ct.id, p_confirmacao: "excluir" }));
      }
      if (lista.length < 100) break;
    }
  }
  for (const e of E.etiquetas) await tenta(`etiqueta ${e}`, rpcC("nx_etiqueta_excluir", { p_id: e }));
  if (E.canal) await tenta(`canal ${E.canal} (e segredos no Vault)`, rpcC("nx_canal_excluir", { p_id: E.canal, p_confirmacao: "excluir" }));
  log("LIMPEZA(API):", log1.join(" | "));
  RESULTADO.limpezaApi = log1;
  if (!log1.some(x => /ERRO/.test(x))) { for (const k of ["canal", "codigoRastreio"]) delete E[k]; E.contatos = {}; E.negocios = {}; E.conversas = {}; E.etiquetas = []; E.automacoes = []; E.tarefas = []; E.notas = []; salvar(); }
}

/* ============================================================
   MAIN
   ============================================================ */
async function main() {
  if (opt("limpar")) { await limpar(); return; }
  try {
    await caso("prep", "Preparo: sessão de teste, canal CodeWords falso, URL secreta pela ação 'receita'", prep);
    await caso("1.1", "CodeWords: rastreio (utm Google) + mensagem com [ref] → contexto, negócio Google com NOME da campanha", c1_rastreio_e_google, "c1");
    await caso("1.2", "CodeWords: horarios/agendar/horario_ocupado/remarcar/cancelar + agenda com campanha", c1_agenda, "c1");
    await caso("1.3", "CodeWords: origem não sobrescreve Google, etapa orcamento, nota, contexto", c1_origem_etapa, "c1");
    await caso("1.4", "CodeWords: humano (IA pausa + notificação), saída do celular pausa, devolver, limite 8/10 min, recibos", c1_humano_celular_limite, "c1");
    await caso("1.5", "CodeWords: duplicada, grupo, @lid, erros de protocolo, eco do próprio número", c1_robustez, "c1");
    await caso("1.6", "CodeWords: payload cru sem 'acao' (modo direta)", c1_raw_direta, "c1");
    await caso("2a", "Envio pelo painel sem aparelho pareado: erro controlado, sem rede", c2a, "c2");
    await caso("3", "Memória aprovada da IA (30a/30e): salvar → nx_cv_base → contexto/instruções; não apaga sem o campo", c3);
    await caso("4", "Pacotes comerciais (30b): admin do cliente não altera oferta/plano; leitura só do que é dele", c4);
    await caso("5", "CRM: funil, criar/mover/ganhar/perder, tarefa/nota, cards com campanha (29c)", c5);
    await caso("6", "Ads: nx_dados = matemática do painel (nucleo.js); relatórios sem erro", c6);
    await caso("7a", "Automação simples dispara no evento e grava o resultado", c7, "c7");
    await caso("9", "Isolamento pela API: kamiguchi/outro cliente, segredo do canal, anônimo", c9);
    if (!SEM_ENVIO && (!SO || SO.includes("envio"))) {
      const c2 = new Caso("2b", "Envio pelo painel com aparelho falso e chave FALSA: erro legível, sem reenvio, IA não pausa");
      const c7b = new Caso("7b", "Lembrete antes_da_data → item da fila do canal CodeWords → falha definitiva, sem reenvio");
      try { await c2b_e_7b(c2, c7b); } catch (e) { const fat = limpo(e?.stack?.split("\n").slice(0, 3).join(" | ") || e?.message); (c2.checks.length ? c7b : c2).fatal = fat; if (!c2.checks.length) c7b.fatal = fat; }
      for (const cc of [c2, c7b]) {
        const fa = cc.checks.filter(x => !x.ok);
        RESULTADO.casos.push({ id: cc.id, nome: cc.nome, ok: cc.passou, checks: cc.checks.length, falhas: fa.map(x => `${x.desc}${x.extra ? ` [${x.extra}]` : ""}`), fatal: cc.fatal, info: cc.info });
        log(`${cc.passou ? "OK   " : "FALHA"} ${cc.id} ${cc.nome} (${cc.checks.length - fa.length}/${cc.checks.length})${cc.fatal ? ` FATAL: ${cc.fatal}` : ""}`);
        for (const f of fa) log(`       - ${f.desc}${f.extra ? ` [${f.extra}]` : ""}`);
      }
    }
  } finally {
    RESULTADO.fim = new Date().toISOString();
    if (!MANTER) { try { await limpar(); } catch (e) { log("LIMPEZA(API) falhou:", e?.message); RESULTADO.limpezaFalhou = String(e?.message); } }
    fs.writeFileSync(path.join(DIR, "resultado.json"), limpo(JSON.stringify(RESULTADO, null, 1)));
    const ok = RESULTADO.casos.filter(x => x.ok).length;
    log(`\nRESUMO: ${ok}/${RESULTADO.casos.length} casos ok · bugs: ${RESULTADO.bugs.length} · observações: ${RESULTADO.observacoes.length}`);
    for (const b of RESULTADO.bugs) log(`BUG: ${b}`);
  }
}
await main();
