#!/usr/bin/env node
/* ============================================================
   ÓRBITA — testes/e2e/orbita-e2e-meta.mjs · E2E-A do caminho META (WhatsApp Cloud API) PELA API
   ESPEC §8.5 itens 5, 6 e 7: webhook assinado, recibos, janela de 24 h, modelos, /ola, assumir,
   transferir, resolver/reabrir e SAIR. Sem navegador.

   Tudo roda num cliente de TESTE próprio ('meta-3009', org da plataforma) criado por SQL
   (testes/e2e/sql/meta-00-fixture.sql) com duas contas de teste (admin e atendente) e sessões
   curtas (2 h) cujo hash foi gravado por SQL; os tokens ficam só em arquivos do scratchpad.
   Dois canais Meta de TESTE (nome "META-3009 A" e "META-3009 B") são criados pela RPC do painel
   (nx_canal_salvar) com phone_number_id/waba_id INVENTADOS e token + app secret FALSOS gerados
   aqui. O webhook é assinado com HMAC-SHA256(app secret falso, corpo cru) e posto na URL ?c=<chave>
   do canal, então NADA de nx_config é lido.

   Limite de rede real: no máximo 3 chamadas à Graph da Meta, TODAS com o token falso e só na fase
   "graph" (texto dentro da janela, download de mídia do canal A e modelo fora da janela). As demais
   recusas (fora_da_janela, conversa_resolvida, canal_sem_token, template_invalido…) acontecem
   ANTES da Graph. Um contador persistido no estado.json impede passar de 3. Nenhuma chamada à IA
   nem ao CodeWords.

   Fases (cada uma é uma execução; o SQL entre elas está em testes/e2e/sql/meta-*.sql):
     --fase=1      canais, GET de verificação, assinatura, entrada, anúncio (CTWA), divergência, mídia sem token,
                   SAIR, /ola, assumir/transferir/resolver/reabrir, nota, bloqueado, fora do horário
     (SQL meta-02)  modelos, saídas com wamid para os recibos, conversa com janela vencida
     --fase=2      recibos, janela de 24 h, erros que não chegam à Graph, modelos inválidos, SAIR sem marketing
     --fase=graph  as 3 chamadas à Graph (token falso)
     --fase=limpar nx_canal_excluir nos dois canais (o resto sai com o SQL meta-04)
   Uso: E2E_DIR=<pasta com ids.json + sessao-*.token> node testes/e2e/orbita-e2e-meta.mjs --fase=1
   Segredos (token de sessão, token/segredo falsos, chave ?c=, verify token) nunca são impressos.
   ============================================================ */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const DIR = process.env.E2E_DIR || path.join(os.tmpdir(), "meta-3009");
fs.mkdirSync(DIR, { recursive: true });
const ARGS = process.argv.slice(2);
const FASE = (ARGS.find(a => a.startsWith("--fase=")) || "--fase=1").split("=")[1];

const SUPA = process.env.E2E_SUPA_URL || "https://dtjznipitihnwmcgpzqh.supabase.co";
const KEY = process.env.E2E_APIKEY
  || (/CHAVE_PUBLICA\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(RAIZ, "web", "dados.js"), "utf8")) || [])[1];
const lerArq = n => (fs.existsSync(path.join(DIR, n)) ? fs.readFileSync(path.join(DIR, n), "utf8").trim() : "");
const TOK_ADM = process.env.E2E_TOKEN || lerArq("sessao-admin.token");
const TOK_AT = process.env.E2E_TOKEN_ATENDENTE || lerArq("sessao-atendente.token");
const IDS = JSON.parse(lerArq("ids.json") || "{}");
const CLI = IDS.cliente;
if (!KEY || !TOK_ADM || !TOK_AT || !CLI) { console.error("faltam chave publicável, tokens das sessões de teste e/ou ids.json"); process.exit(2); }

/* ------------------------------------------------------------ estado da rodada (scratchpad, nunca no repositório) */
const ARQ_ESTADO = path.join(DIR, "estado.json");
const E = fs.existsSync(ARQ_ESTADO) ? JSON.parse(fs.readFileSync(ARQ_ESTADO, "utf8")) : {};
E.run ||= crypto.randomBytes(3).toString("hex");
E.canais ||= {}; E.conv ||= {}; E.graph ||= { chamadas: 0, feitas: [] }; E.seq ||= 0; E.resultados ||= {};
const salvar = () => fs.writeFileSync(ARQ_ESTADO, JSON.stringify(E, null, 1));
salvar();

/* ------------------------------------------------------------ segredos nunca saem */
const segredos = () => {
  const s = new Set([TOK_ADM, TOK_AT, KEY]);
  for (const c of Object.values(E.canais)) for (const k of ["token", "secret", "chave", "vt"]) if (c[k]) s.add(c[k]);
  return [...s].filter(x => x && x.length >= 8);
};
const limpo = v => {
  let s = typeof v === "string" ? v : JSON.stringify(v);
  if (s === undefined) s = String(v);
  for (const x of segredos()) if (s.includes(x)) s = s.split(x).join("<segredo>");
  return s.replace(/([?&]c=)[0-9a-f]{16,}/gi, "$1<segredo>").replace(/EAAG3009FAKE[0-9a-f]+/g, "<token-falso>");
};
const log = (...a) => console.log(a.map(limpo).join(" "));

/* ------------------------------------------------------------ HTTP */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function http(url, { corpo, raw, headers = {}, metodo = "POST", espera = 120_000 } = {}) {
  const t0 = Date.now();
  let r, txt;
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), espera);
  try {
    r = await fetch(url, { method: metodo, headers, signal: ac.signal,
      body: metodo === "GET" || metodo === "HEAD" ? undefined : (raw ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined)) });
    txt = await r.text();
  } catch (e) { return { status: 0, json: null, txt: e?.name === "AbortError" ? `sem resposta em ${espera / 1000} s` : String(e?.message || e), ms: Date.now() - t0, semResposta: e?.name === "AbortError" }; }
  finally { clearTimeout(to); }
  let json = null; try { json = JSON.parse(txt); } catch { /* texto puro */ }
  return { status: r.status, json, txt, ms: Date.now() - t0 };
}
/** RPC do PostgREST com a chave publicável + p_token (a porta pública do painel). */
async function rpc(nome, params = {}, { tok = TOK_ADM, semToken = false } = {}) {
  const r = await http(`${SUPA}/rest/v1/rpc/${nome}`, { corpo: semToken ? params : { p_token: tok, ...params },
    headers: { apikey: KEY, "content-type": "application/json" } });
  if (r.status >= 400 || r.status === 0) {
    return { ok: false, status: r.status, codigo: r.json?.message ?? (r.status ? `http_${r.status}` : "sem_conexao"), hint: r.json?.hint ?? null, code: r.json?.code ?? null };
  }
  return { ok: true, status: r.status, dados: r.json };
}
const rc = (nome, params = {}, o) => rpc(nome, { p_cliente: CLI, ...params }, o);            // admin
const ra = (nome, params = {}) => rc(nome, params, { tok: TOK_AT });                            // atendente
const deve = (r, o = "") => { if (!r.ok) throw new Error(`${o} falhou: ${r.codigo}${r.hint ? `|${r.hint}` : ""}`); return r.dados; };
/** Função de borda do painel (nx-enviar): corpo leva token + cliente. */
const fn = (funcao, corpo = {}, tok = TOK_ADM) => http(`${SUPA}/functions/v1/${funcao}`,
  { corpo: { token: tok, cliente: CLI, ...corpo }, headers: { apikey: KEY, "content-type": "application/json" } });

/* ------------------------------------------------------------ relatório de casos */
const RES = { fase: FASE, inicio: new Date().toISOString(), casos: [], bugs: [], observacoes: [], semProva: [] };
class Caso {
  constructor(id, nome) { this.id = id; this.nome = nome; this.checks = []; this.info = {}; this.fatal = null; }
  ok(desc, cond, extra) { const c = !!cond; this.checks.push({ desc, ok: c, extra: c ? undefined : extra }); return c; }
  igual(desc, a, b) { return this.ok(desc, JSON.stringify(a) === JSON.stringify(b), `obtido=${limpo(JSON.stringify(a))} esperado=${limpo(JSON.stringify(b))}`); }
  nota(k, v) { this.info[k] = v; }
  get passou() { return !this.fatal && this.checks.every(c => c.ok); }
}
const SO = (ARGS.find(a => a.startsWith("--so=")) || "").split("=")[1]?.split(",") || null;
async function caso(id, nome, f) {
  if (SO && !SO.includes(id)) return null;
  const c = new Caso(id, nome);
  const t0 = Date.now();
  try { await f(c); } catch (e) { c.fatal = limpo(e?.stack?.split("\n").slice(0, 3).join(" | ") || e?.message || e); }
  const falhas = c.checks.filter(x => !x.ok);
  RES.casos.push({ id, nome, ok: c.passou, asserts: c.checks.length, falhas: falhas.map(x => `${x.desc}${x.extra ? ` [${x.extra}]` : ""}`), fatal: c.fatal, info: c.info, ms: Date.now() - t0 });
  log(`${c.passou ? "OK   " : "FALHA"} ${id} ${nome} (${c.checks.length - falhas.length}/${c.checks.length})${c.fatal ? ` FATAL: ${c.fatal}` : ""}`);
  for (const f2 of falhas) log(`       - ${f2.desc}${f2.extra ? ` [${f2.extra}]` : ""}`);
  return c;
}
const semProva = (id, motivo) => { RES.semProva.push({ id, motivo }); log(`SEM_PROVA ${id}: ${motivo}`); };

/* ------------------------------------------------------------ dados de teste */
const PRE = "META-3009";
const tel = n => `5512993008${String(n).padStart(3, "0")}`;
const NOME = n => (n === 1 ? "Maria META-3009" : `${PRE} Paciente ${String(n).padStart(3, "0")}`);
const agoraS = () => String(Math.floor(Date.now() / 1000));
const wamid = (p = "in") => `wamid.META3009-${E.run}-${p}-${++E.seq}-${crypto.randomBytes(3).toString("hex")}`;
const aleatDig = n => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join("");

/* ------------------------------------------------------------ webhook (Cloud API) */
const URL_WA = `${SUPA}/functions/v1/nx-whatsapp`;
const assinar = (raw, seg) => `sha256=${crypto.createHmac("sha256", seg).update(raw).digest("hex")}`;
/** POST assinado na URL do canal. Opções: segredo, chave, semC, assinatura (null = sem cabeçalho), assinarCorpo, raw, url, metodo. */
async function hook(canal, payload, o = {}) {
  const raw = o.raw ?? JSON.stringify(payload);
  const url = o.url ?? (o.semC ? URL_WA : `${URL_WA}?c=${o.chave ?? canal.chave}`);
  const headers = { "content-type": "application/json" };
  const sig = o.assinatura === undefined ? assinar(o.assinarCorpo ?? raw, o.segredo ?? canal.secret) : o.assinatura;
  if (sig !== null) headers["x-hub-signature-256"] = sig;
  return http(url, { raw, headers, metodo: o.metodo ?? "POST" });
}
const valor = ({ pid, nome, wa, messages, statuses }) => ({
  messaging_product: "whatsapp", metadata: { display_phone_number: "5512993008900", phone_number_id: pid },
  ...(messages ? { contacts: nome === null ? [] : [{ profile: { name: nome ?? "Teste" }, wa_id: wa }], messages } : {}),
  ...(statuses ? { statuses } : {}),
});
const envelope = (...values) => ({ object: "whatsapp_business_account", entry: [{ id: "META3009-WABA", changes: values.map(value => ({ field: "messages", value })) }] });
const mTexto = (from, body, extra = {}) => ({ from, id: extra.id ?? wamid(), timestamp: agoraS(), type: "text", text: { body }, ...(extra.campos || {}) });
const refAd = (id, clid) => ({ source_url: "https://fb.me/meta3009", source_id: id, source_type: "ad", headline: "Clareamento", body: "Sorriso novo", media_type: "image", ctwa_clid: clid });
/** Mensagem de texto de um contato: devolve {r, wamid}. */
async function entrada(canal, n, texto, o = {}) {
  const wa = o.wa ?? tel(n);
  const m = mTexto(wa, texto, { id: o.id, campos: { ...(o.referral ? { referral: o.referral } : {}), ...(o.context ? { context: { id: o.context } } : {}) } });
  const r = await hook(canal, envelope(valor({ pid: o.pid ?? canal.pid, nome: o.nome === undefined ? NOME(n) : o.nome, wa, messages: [m] })), o.hook);
  return { r, wamid: m.id, j: r.json };
}
const recibo = (canal, statuses, o = {}) => hook(canal, envelope(valor({ pid: o.pid ?? canal.pid, statuses })), o.hook);
const stat = (id, status, extra = {}) => ({ id, status, timestamp: agoraS(), recipient_id: "5512993008001", ...extra });

/* ------------------------------------------------------------ leitura do painel */
const A = () => E.canais.A, B = () => E.canais.B;
const listar = (aba, extra = {}, who = rc) => who("nx_cv_listar", { p_filtro: { aba, ...extra }, p_limite: 100 });
const contagens = async (who = rc) => deve(await listar("abertas", {}, who), "nx_cv_listar").contagens;
const ver = async (id, who = rc) => deve(await who("nx_cv_ver", { p_id: id }), "nx_cv_ver");
const mensagens = async (id, o = {}, who = rc) => deve(await who("nx_cv_mensagens", { p_conversa: id, p_limite: 100, ...o }), "nx_cv_mensagens");
const itens = async (id, who = rc) => (await mensagens(id, {}, who)).itens;
const msgDe = async (id, w) => (await itens(id)).find(m => m.wamid === w);
const contatoVer = async cid => deve(await rc("nx_contato_ver", { p_id: cid }), "nx_contato_ver");
async function convDeTel(n, { aba } = {}) {
  const r = deve(await rc("nx_cv_listar", { p_filtro: { busca: tel(n).slice(-7), ...(aba ? { aba } : {}) }, p_limite: 20 }), "nx_cv_listar(busca)");
  return r.itens.sort((x, y) => y.id - x.id)[0] || null;
}
async function convs(n) {
  const r = deve(await rc("nx_cv_listar", { p_filtro: { busca: tel(n).slice(-7) }, p_limite: 50 }), "nx_cv_listar(busca)");
  return r.itens.sort((x, y) => x.id - y.id);
}
const notifs = async who => { const n = deve(await who("nx_notificacoes_listar", { p_limite: 100 }), "nx_notificacoes_listar"); return n.itens || []; };
const erroDe = r => (r.ok ? null : r.codigo);

/* ============================================================
   FASE 1
   ============================================================ */
let BASE = null;   // nx_crm_base
async function crmBase() { return (BASE ||= deve(await rc("nx_crm_base"), "nx_crm_base")); }
const etapaNova = async () => (await crmBase()).funis.find(f => f.padrao).estagios.find(e => e.marco === "nova");

async function prep(c) {
  const s = deve(await rpc("nx_sessao"), "nx_sessao");
  c.ok("sessão do admin de teste: conta META-3009 Admin e só o cliente meta-3009", s.conta?.nome === `${PRE} Admin` && s.clientes?.length === 1 && s.clientes[0].id === CLI, `conta=${s.conta?.nome} clientes=${s.clientes?.length}`);
  const sa = deve(await rpc("nx_sessao", {}, { tok: TOK_AT }), "nx_sessao(atendente)");
  c.ok("sessão do atendente de teste enxerga só o meta-3009", sa.conta?.nome === `${PRE} Atendente` && sa.clientes?.length === 1 && sa.clientes[0].id === CLI);
  const base = deve(await rc("nx_cv_base"), "nx_cv_base");
  c.ok("nx_cv_base do cliente novo: admin, 0 canais, 2 departamentos (Recepção padrão + Comercial)",
    base.eu?.papel === "admin" && base.canais.length === 0 && base.departamentos.length === 2, `papel=${base.eu?.papel} canais=${base.canais.length} deps=${base.departamentos.length}`);
  const cont0 = await contagens();
  c.igual("cliente novo sem nenhuma conversa (contagens zeradas)", Object.values(cont0).reduce((a, b) => a + b, 0), 0);
  const nova = await etapaNova();
  c.ok("funil Pacientes tem a etapa 'Nova conversa' com marco 'nova'", nova?.nome === "Nova conversa", JSON.stringify(nova));
}

async function canais(c) {
  const dep = IDS.dep_comercial;
  // 1. só admin cria canal
  const neg = await ra("nx_canal_salvar", { p_canal: { nome: `${PRE} X`, phone_number_id: "30090" + aleatDig(9), waba_id: "30090" + aleatDig(9) } });
  c.igual("atendente NÃO cria canal (sem_permissao)", erroDe(neg), "sem_permissao");
  // 2. canal A (com token e app secret falsos, departamento Comercial: sem horário, sem aviso de fora do horário)
  if (!E.canais.A) {
    const a = { pid: "30090" + aleatDig(9), waba: "30090" + aleatDig(9), token: `EAAG3009FAKE${crypto.randomBytes(30).toString("hex")}`, secret: crypto.randomBytes(16).toString("hex") };
    const r = deve(await rc("nx_canal_salvar", { p_canal: { nome: `${PRE} A`, phone_number_id: a.pid, waba_id: a.waba, numero_exibicao: "+55 12 99300-8900", token: a.token, app_secret: a.secret, departamento_id: dep } }), "salvar A");
    a.id = r.canal.id; a.chave = /[?&]c=([0-9a-f]+)/.exec(r.webhook.url)?.[1]; a.vt = r.webhook.verify_token;
    E.canais.A = a; salvar();
    c.ok("canal A criado: modo 'proprio', URL …/nx-whatsapp?c=<24 hex>, status pendente, app_inscrito null, tem_token e tem_app_secret",
      r.webhook.modo === "proprio" && /\/functions\/v1\/nx-whatsapp\?c=[0-9a-f]{24}$/.test(r.webhook.url) && r.canal.status === "pendente" && r.canal.app_inscrito === null && r.canal.tem_token === true && r.canal.tem_app_secret === true, JSON.stringify(Object.keys(r.canal)));
    c.ok("a resposta de salvar não devolve o token nem o app secret", !JSON.stringify(r).includes(a.token) && !JSON.stringify(r).includes(a.secret));
    c.ok("canal A no departamento Comercial", r.canal.departamento_id === dep);
  } else c.nota("canal A", "reaproveitado do estado.json");
  // 3. canal B (SEM token, app secret próprio, departamento Recepção)
  if (!E.canais.B) {
    const b = { pid: "30090" + aleatDig(9), waba: "30090" + aleatDig(9), secret: crypto.randomBytes(16).toString("hex") };
    const r = deve(await rc("nx_canal_salvar", { p_canal: { nome: `${PRE} B`, phone_number_id: b.pid, waba_id: b.waba, numero_exibicao: "+55 12 99300-8901", app_secret: b.secret, departamento_id: IDS.dep_recepcao } }), "salvar B");
    b.id = r.canal.id; b.chave = /[?&]c=([0-9a-f]+)/.exec(r.webhook.url)?.[1]; b.vt = r.webhook.verify_token;
    E.canais.B = b; salvar();
    c.ok("canal B criado SEM token (tem_token=false) e com app secret próprio", r.canal.tem_token === false && r.canal.tem_app_secret === true && r.webhook.modo === "proprio");
  }
  // 4. regras de cadastro
  const dup = await rc("nx_canal_salvar", { p_canal: { nome: `${PRE} dup`, phone_number_id: A().pid, waba_id: "30090" + aleatDig(9) } });
  c.igual("mesmo phone_number_id em outro canal → numero_em_uso", erroDe(dup), "numero_em_uso");
  const lim = await rc("nx_canal_salvar", { p_canal: { nome: `${PRE} 3o`, phone_number_id: "30090" + aleatDig(9), waba_id: "30090" + aleatDig(9) } });
  c.ok("3º canal no plano profissional (limite 2) → limite_plano com hint canais:2", erroDe(lim) === "limite_plano" && lim.hint === "canais:2", `${erroDe(lim)}|${lim.hint}`);
  const bad1 = await rc("nx_canal_salvar", { p_canal: { id: B().id, phone_number_id: "abc" } });
  c.ok("phone_number_id inválido → dados_invalidos (phone_number_id)", erroDe(bad1) === "dados_invalidos" && bad1.hint === "phone_number_id", `${erroDe(bad1)}|${bad1.hint}`);
  const bad2 = await rc("nx_canal_salvar", { p_canal: { id: B().id, app_secret: "curto" } });
  c.ok("app_secret curto → dados_invalidos (app_secret)", erroDe(bad2) === "dados_invalidos" && bad2.hint === "app_secret");
  const bad3 = await rc("nx_canal_salvar", { p_canal: { id: B().id, token: "tem espaco no meio do token falso" } });
  c.ok("token com espaço → dados_invalidos (token)", erroDe(bad3) === "dados_invalidos" && bad3.hint === "token");
  // 5. listagem: admin vê webhook; atendente não lista canais e o nx_cv_base dele não traz chave nenhuma
  const lista = deve(await rc("nx_canais_listar"), "nx_canais_listar");
  c.ok("nx_canais_listar (admin): os 2 canais com webhook; nenhum segredo no JSON", lista.length === 2 && lista.every(k => k.webhook?.url) && !JSON.stringify(lista).includes(A().token) && !JSON.stringify(lista).includes(A().secret) && !JSON.stringify(lista).includes(B().secret));
  const listaAt = await ra("nx_canais_listar");
  c.igual("atendente NÃO lista canais (sem_permissao)", erroDe(listaAt), "sem_permissao");
  const baseAt = deve(await ra("nx_cv_base"), "nx_cv_base(atendente)");
  const txtAt = JSON.stringify(baseAt);
  c.ok("nx_cv_base do atendente lista os 2 canais mas sem URL, chave ?c=, verify token, token nem segredo",
    baseAt.canais.length === 2 && !txtAt.includes(A().chave) && !txtAt.includes(A().vt) && !txtAt.includes(B().vt) && !txtAt.includes(A().token) && !txtAt.includes(A().secret) && !/nx-whatsapp/.test(txtAt), `canais=${baseAt.canais.length}`);
  // 6. Recepção sempre fechada (horário vazio) + texto de fora do horário: o canal B (sem token) gera a fila 'fora_horario'
  const dsal = deve(await rc("nx_departamento_salvar", { p_departamento: { id: IDS.dep_recepcao, horario: {} } }), "departamento_salvar");
  c.ok("Recepção passa a ficar sempre fechada (horario {} → 7 dias vazios) e mantém a mensagem de fora do horário", Object.values(dsal.horario || {}).every(d => Array.isArray(d) && d.length === 0) && !!dsal.msg_fora_horario, JSON.stringify(dsal).slice(0, 300));
}

async function verificacaoGet(c) {
  const g = (canal, q, semC = false) => http(`${URL_WA}${semC ? "" : `?c=${canal.chave}`}${semC ? "?" : "&"}${q}`, { metodo: "GET" });
  const ok = await g(A(), `hub.mode=subscribe&hub.verify_token=${A().vt}&hub.challenge=desafio3009`);
  c.ok("GET com o verify token do canal A → 200 e devolve o hub.challenge", ok.status === 200 && ok.txt === "desafio3009", `status=${ok.status} corpo=${ok.txt}`);
  const errado = await g(A(), "hub.mode=subscribe&hub.verify_token=errado&hub.challenge=x");
  c.ok("verify token errado → 403", errado.status === 403);
  const cruz = await g(B(), `hub.mode=subscribe&hub.verify_token=${A().vt}&hub.challenge=x`);
  c.ok("verify token do canal A na URL do canal B → 403 (cada canal tem o seu)", cruz.status === 403);
  const semModo = await g(A(), `hub.verify_token=${A().vt}&hub.challenge=x`);
  c.ok("sem hub.mode=subscribe → 403", semModo.status === 403);
  const desconhecido = await http(`${URL_WA}?c=${"a".repeat(24)}&hub.mode=subscribe&hub.verify_token=${A().vt}&hub.challenge=x`, { metodo: "GET" });
  c.ok("?c= inexistente → 403", desconhecido.status === 403);
  const global = await g(A(), `hub.mode=subscribe&hub.verify_token=${A().vt}&hub.challenge=x`, true);
  c.ok("verify token de canal no endpoint global (sem ?c=) → 403", global.status === 403);
  const put = await http(`${URL_WA}?c=${A().chave}`, { metodo: "PUT", raw: "{}" });
  c.ok("PUT → 405", put.status === 405, `status=${put.status}`);
}

async function assinatura(c) {
  const ja = async n => (await convs(n)).length;
  const w = wamid("assin");
  const pay = envelope(valor({ pid: A().pid, nome: NOME(1), wa: tel(1), messages: [mTexto(tel(1), "Olá, quero agendar uma avaliação", { id: w })] }));
  const raw = JSON.stringify(pay);
  const t = async (desc, r, statusEsperado, corpoEsperado) => c.ok(desc, r.status === statusEsperado && (corpoEsperado == null || r.txt.includes(corpoEsperado)), `status=${r.status} corpo=${r.txt.slice(0, 80)}`);
  await t("sem cabeçalho X-Hub-Signature-256 → 401", await hook(A(), null, { raw, assinatura: null }), 401, "assinatura inválida");
  await t("segredo errado → 401", await hook(A(), null, { raw, segredo: crypto.randomBytes(16).toString("hex") }), 401);
  await t("cabeçalho só com o hex (sem 'sha256=') → 401", await hook(A(), null, { raw, assinatura: assinar(raw, A().secret).slice(7) }), 401);
  await t("corpo adulterado depois de assinado → 401", await hook(A(), null, { raw: raw.replace("avaliação", "avaliaçao"), assinarCorpo: raw }), 401);
  await t("assinatura do canal B (segredo diferente) na URL do canal A → 401", await hook(A(), null, { raw, segredo: B().secret }), 401);
  await t("?c= bem formado mas inexistente → 401 'canal desconhecido'", await hook(A(), null, { raw, chave: "b".repeat(24) }), 401, "canal desconhecido");
  await t("?c= malformado → 401 'canal desconhecido'", await hook(A(), null, { raw, chave: "zz-invalido" }), 401, "canal desconhecido");
  await t("sem ?c=, assinada com o segredo do canal (o global é outro) → 401", await hook(A(), null, { raw, semC: true }), 401);
  const grande = await http(`${URL_WA}?c=${A().chave}`, { raw: JSON.stringify({ x: "a".repeat(2_150_000) }), headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=00" }, espera: 20_000 });
  await t("corpo > 2 MiB → 413 'corpo grande demais' antes de qualquer conta (MAX_CORPO_WEBHOOK)", grande, 413, null);
  if (grande.status !== 413) RES.bugs.push(`nx-whatsapp: corpo de 2,15 MB (> MAX_CORPO_WEBHOOK = 2 MiB) não recebe 413: ${grande.semResposta ? "a requisição fica sem resposta (>=25 s; numa sondagem separada, 503 do gateway 'base/server' após ~160 s)" : `HTTP ${grande.status}`}; 2.000.008 bytes respondem 401 em 0,4 s`);
  const normal2 = await http(`${URL_WA}?c=${A().chave}`, { raw: JSON.stringify({ x: "a".repeat(2_000_000) }), headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=00" }, espera: 20_000 });
  c.ok("(controle) corpo de 2,0 MB (abaixo do limite) → 401 normal em poucos segundos", normal2.status === 401 && normal2.ms < 10_000, `${normal2.status} ${normal2.ms}ms`);
  // nada foi gravado: o mesmo texto, agora assinado certo, é CRIADO (a mensagem nunca existiu)
  c.igual("depois das 9 recusas não existe conversa nenhuma do telefone de teste", await ja(1), 0);
  const cont = await contagens();
  c.igual("nem conversa aberta em nenhuma aba", cont.abertas + cont.aguardando + cont.sem_dono, 0);
  const naoJson = "isto não é json";
  const nj = await hook(A(), null, { raw: naoJson });
  c.ok("assinatura válida + corpo que não é JSON → 200 {ok:true, ignorado}", nj.status === 200 && nj.json?.ok === true && /JSON/.test(nj.json?.ignorado || ""), `status=${nj.status} ${nj.txt.slice(0, 80)}`);
  E.assin = { wamid: w, raw };   // o caso 'entrada' manda este corpo com a assinatura certa
  salvar();
}

async function caso_entrada(c) {
  // 1) o MESMO corpo das recusas, agora com a assinatura certa → cria contato + conversa + negócio
  const r = await hook(A(), null, { raw: E.assin.raw });
  c.ok("entrada de texto assinada → 200 {ok, mensagens:1, criado:1, duplicadas:0, canal_divergente:0}",
    r.status === 200 && r.json?.ok === true && r.json.mensagens === 1 && r.json.criado === 1 && r.json.duplicadas === 0 && r.json.canal_divergente === 0 && !r.json.erros, `${r.status} ${r.txt.slice(0, 200)}`);
  c.nota("ms_webhook", r.ms);
  const t0 = Date.now();
  const it = await convDeTel(1);
  c.nota("ms_ate_aparecer_na_lista", r.ms + (Date.now() - t0));
  c.ok("a conversa aparece na aba Aguardando (visível logo após o 200, < 5 s)", !!it && r.ms + (Date.now() - t0) < 5000, `ms=${r.ms + (Date.now() - t0)}`);
  E.conv[1] = it.id; salvar();
  const ag = deve(await listar("aguardando"), "listar aguardando");
  const x = ag.itens.find(i => i.id === it.id);
  c.ok("item: aberta, aguardando, 1 não lida, canal A, departamento Comercial, sem dono, última mensagem 'in' com o resumo", !!x && x.status === "aberta" && x.aguardando === true && x.nao_lidas === 1 && x.canal_id === A().id
    && x.departamento_id === IDS.dep_comercial && x.atribuida_a === null && x.ultima_msg_dir === "in" && x.ultima_msg_resumo === "Olá, quero agendar uma avaliação", JSON.stringify(x).slice(0, 300));
  c.ok("contato da conversa tem o nome do perfil do WhatsApp e o telefone exato (55 + DDD + número)", x?.contato?.nome === NOME(1) && x?.contato?.telefone === tel(1), JSON.stringify(x?.contato));
  c.ok("janela_ate = entrada + 24 h", Math.abs(Date.parse(x.janela_ate) - (Date.parse(x.ultima_entrada_em) + 86400_000)) < 2000);
  c.igual("contagens das abas: minhas 0, sem_dono 1, aguardando 1, abertas 1, pendentes 0, não lidas 1", ag.contagens, { minhas: 0, sem_dono: 1, aguardando: 1, abertas: 1, pendentes: 0, nao_lidas: 1 });
  const v = await ver(it.id);
  const nova = await etapaNova();
  c.ok("negócio criado e LIGADO à conversa, etapa 'Nova conversa', aberto", v.conversa.negocio?.estagio_nome === "Nova conversa" && v.conversa.negocio?.status === "aberto" && v.negocios.length === 1 && v.negocios[0].estagio_id === nova.id, JSON.stringify(v.conversa.negocio));
  c.ok("negócio de entrada orgânica: SEM selo de anúncio (anuncio=false, origem whatsapp, sem plataforma)", v.negocios[0].anuncio === false && v.negocios[0].origem === "whatsapp" && !v.anuncio, JSON.stringify(v.negocios[0]).slice(0, 200));
  c.ok("contato: origem whatsapp, telefone = wa_id, sem plataforma, optin nulo", v.contato.origem === "whatsapp" && v.contato.telefone === tel(1) && v.contato.wa_id === tel(1) && !v.contato.plataforma && v.contato.optin_marketing === null);
  c.ok("protocolo no formato AAAA-NNNNNN", /^\d{4}-\d{6}$/.test(v.conversa.protocolo), v.conversa.protocolo);
  const ms = await itens(it.id);
  c.ok("mensagem gravada: in, texto, 'recebida', wamid exato, sem referral", ms.length === 1 && ms[0].direcao === "in" && ms[0].tipo === "texto" && ms[0].status === "recebida" && ms[0].wamid === E.assin.wamid && ms[0].referral === null && ms[0].corpo === "Olá, quero agendar uma avaliação");
  const nt = await notifs(rc);
  c.ok("entrada orgânica NÃO gera notificação de anúncio", !nt.some(n => n.tipo === "lead_anuncio"));

  // 2) reentrega da Meta (mesmo wamid): nada muda
  const re = await hook(A(), null, { raw: E.assin.raw });
  c.ok("reentrega do mesmo wamid → duplicadas:1, mensagens:0, criado:0", re.json?.duplicadas === 1 && !re.json?.mensagens && re.json?.criado === 0, re.txt.slice(0, 200));
  c.igual("continua 1 mensagem e 1 não lida", [(await itens(it.id)).length, (await convDeTel(1)).nao_lidas], [1, 1]);

  // 3) 2ª mensagem (wamid novo): mesma conversa, mesmo negócio
  const m2 = await entrada(A(), 1, "Pode ser na quinta à tarde?");
  c.ok("2ª mensagem → existente:1 (mesmo negócio), criado:0, mensagens:1", m2.j?.existente === 1 && m2.j?.criado === 0 && m2.j?.mensagens === 1, m2.r.txt.slice(0, 200));
  const cs = await convs(1);
  c.ok("continua UMA conversa, 2 não lidas, resumo da última", cs.length === 1 && cs[0].id === it.id && cs[0].nao_lidas === 2 && cs[0].ultima_msg_resumo === "Pode ser na quinta à tarde?");
  c.igual("continua UM negócio para o contato", (await ver(it.id)).negocios.length, 1);

  // 4) lote: uma mensagem sem remetente não derruba as outras
  const lote = envelope(valor({ pid: A().pid, nome: NOME(1), wa: tel(1), messages: [{ from: "", id: wamid(), timestamp: agoraS(), type: "text", text: { body: "sem remetente" } }, mTexto(tel(1), "lote 1"), mTexto(tel(1), "lote 2"), { from: tel(1), id: wamid(), timestamp: agoraS(), type: "system", system: { body: "trocou de número" } }] }));
  const rl = await hook(A(), lote);
  c.ok("lote de 4 (1 sem remetente, 1 system, 2 válidas) → mensagens:2, sem erro", rl.json?.mensagens === 2 && !rl.json?.erros, rl.txt.slice(0, 200));
  c.igual("a conversa ficou com 4 mensagens recebidas", (await itens(it.id)).filter(m => m.direcao === "in").length, 4);

  // 5) marcar como lida
  const lida = deve(await rc("nx_cv_marcar_lida", { p_conversa: it.id }), "marcar_lida");
  c.ok("marcar lida → não lidas 0 e devolve o último wamid recebido", (await convDeTel(1)).nao_lidas === 0 && typeof lida.ultimo_wamid_in === "string" && lida.ultimo_wamid_in.startsWith(`wamid.META3009-${E.run}-in-`), JSON.stringify(lida));
  c.ok("marcar lida NÃO tira da aba Aguardando (só a resposta tira)", (await convDeTel(1)).aguardando === true);

  // 6) resposta a uma mensagem (context.id) e reação
  const rp = await entrada(A(), 1, "Sobre a primeira mensagem…", { context: E.assin.wamid });
  const mrp = await msgDe(it.id, rp.wamid);
  c.ok("mensagem com context.id → guarda responde_a com o resumo da mensagem citada", mrp?.responde_a?.direcao === "in" && /avaliação/.test(mrp.responde_a?.resumo || ""), JSON.stringify(mrp?.responde_a));
  const antes = (await itens(it.id)).length;
  const reac = await hook(A(), envelope(valor({ pid: A().pid, nome: NOME(1), wa: tel(1), messages: [{ from: tel(1), id: wamid(), timestamp: agoraS(), type: "reaction", reaction: { message_id: E.assin.wamid, emoji: "👍" } }] })));
  const m1 = await msgDe(it.id, E.assin.wamid);
  c.ok("reação 👍 → grava o emoji na mensagem citada, NÃO cria mensagem e NÃO sobe não lidas", reac.json?.reacoes === 1 && m1?.reacao === "👍" && (await itens(it.id)).length === antes && (await convDeTel(1)).nao_lidas === 1 /* só a do context */, `${reac.txt.slice(0, 160)} reacao=${m1?.reacao}`);
  await hook(A(), envelope(valor({ pid: A().pid, nome: NOME(1), wa: tel(1), messages: [{ from: tel(1), id: wamid(), timestamp: agoraS(), type: "reaction", reaction: { message_id: E.assin.wamid, emoji: "" } }] })));
  c.ok("reação com emoji vazio remove o emoji", (await msgDe(it.id, E.assin.wamid))?.reacao === null);
  c.igual("reação não criou conversa nem negócio", [(await convs(1)).length, (await ver(it.id)).negocios.length], [1, 1]);

  // 7) número estrangeiro: telefone = wa_id, sem 55
  const est = await entrada(A(), 19, "Hello, I saw your ad", { wa: "14155553008", nome: "Foreign META-3009" });
  const ce = deve(await rc("nx_cv_listar", { p_filtro: { busca: "4155553008" } }), "busca estrangeiro").itens[0];
  c.ok("remetente dos EUA (14155553008) → contato com telefone = wa_id exatos, SEM o 55", est.j?.criado === 1 && ce?.contato?.telefone === "14155553008", JSON.stringify(ce?.contato));
  // 8) texto gigante + nome gigante: cortados, sem erro
  const g = await entrada(A(), 20, "x".repeat(5000), { nome: "N".repeat(300) });
  const cg = await convDeTel(20);
  const mg = cg ? (await itens(cg.id))[0] : null;
  const vg = cg ? await ver(cg.id) : null;
  c.ok("texto de 5.000 caracteres e nome de 300 → 200 sem erro; corpo cortado em 4.096 e nome em 160", g.r.status === 200 && !g.j?.erros && mg?.corpo?.length === 4096 && vg?.contato?.nome?.length === 160, `status=${g.r.status} corpo=${mg?.corpo?.length} nome=${vg?.contato?.nome?.length}`);
  // 9) tipos de mensagem (sem mídia com media_id no canal A: isso chamaria a Graph)
  const tipos = [
    { from: tel(22), id: wamid(), timestamp: agoraS(), type: "location", location: { latitude: -23.5, longitude: -46.6, name: "Clínica", address: "Rua A, 10" } },
    { from: tel(22), id: wamid(), timestamp: agoraS(), type: "contacts", contacts: [{ name: { formatted_name: "Ana Lima" }, phones: [{ phone: "+55 12 98888-7777" }] }] },
    { from: tel(22), id: wamid(), timestamp: agoraS(), type: "interactive", interactive: { type: "button_reply", button_reply: { id: "b1", title: "Sim, confirmo" } } },
    { from: tel(22), id: wamid(), timestamp: agoraS(), type: "button", button: { text: "Quero remarcar", payload: "x" } },
    { from: tel(22), id: wamid(), timestamp: agoraS(), type: "unsupported", errors: [{ code: 131051 }] },
  ];
  const rt = await hook(A(), envelope(valor({ pid: A().pid, nome: NOME(22), wa: tel(22), messages: tipos })));
  const ct = await convDeTel(22);
  const mt = ct ? await itens(ct.id) : [];
  c.ok("5 tipos no mesmo lote → mensagens:5", rt.json?.mensagens === 5, rt.txt.slice(0, 200));
  c.igual("tipos normalizados: localizacao, contato, interativo, interativo, desconhecido", mt.map(m => m.tipo), ["localizacao", "contato", "interativo", "interativo", "desconhecido"]);
  c.ok("corpos: 'Localização: Clínica — Rua A, 10 (-23.5, -46.6)', 'Contato: Ana Lima +55 12 98888-7777', título do botão, e o aviso da API para 'unsupported'",
    mt[0]?.corpo === "Localização: Clínica — Rua A, 10 (-23.5, -46.6)" && mt[1]?.corpo === "Contato: Ana Lima +55 12 98888-7777" && mt[2]?.corpo === "Sim, confirmo" && mt[3]?.corpo === "Quero remarcar" && /não suportada/.test(mt[4]?.corpo || ""), JSON.stringify(mt.map(m => m.corpo)));
  // 10) sem ?c= nada entra com o segredo do canal (provado em 'assinatura'); aqui o resumo
  const ultimo = await convDeTel(22);
  c.ok("resumo da conversa = última mensagem (desconhecida)", /Mensagem|não suportada/.test(ultimo?.ultima_msg_resumo || ""), ultimo?.ultima_msg_resumo);
}

async function caso_anuncio(c) {
  const nova = await etapaNova();
  // T2 — CTWA com anúncio que TEM métricas (semeadas por SQL: campanha/anúncio META-3009)
  const r2 = await entrada(A(), 2, "Oi, vi o anúncio do clareamento. Quanto custa?", { referral: refAd("META-3009-AD-1", "META3009CLID2") });
  c.ok("entrada com referral de anúncio (CTWA) → criado:1, mensagens:1", r2.j?.criado === 1 && r2.j?.mensagens === 1, r2.r.txt.slice(0, 200));
  const i2 = await convDeTel(2); E.conv[2] = i2.id; salvar();
  const v2 = await ver(i2.id);
  const cv2 = await contatoVer(v2.contato.id);
  const neg = cv2.negocios[0];
  c.ok("negócio criado na etapa 'Nova conversa' com SELO DE ANÚNCIO (anuncio, origem anuncio, plataforma meta)", neg?.anuncio === true && neg.origem === "anuncio" && neg.plataforma === "meta" && neg.estagio_id === nova.id && v2.negocios[0].anuncio === true, JSON.stringify(neg).slice(0, 300));
  c.ok("campanha e anúncio pelas métricas: campanha_ext/anuncio_ext e os NOMES (campanha_nome, anuncio_nome)", neg.campanha_ext === "META-3009-CAMP-1" && neg.anuncio_ext === "META-3009-AD-1" && neg.campanha_nome === "META-3009 Campanha Clareamento" && neg.anuncio_nome === "META-3009 Anúncio Sorriso", JSON.stringify({ c: neg.campanha_nome, a: neg.anuncio_nome }));
  c.ok("lateral da conversa (nx_cv_ver.anuncio): plataforma meta + nomes da campanha e do anúncio", v2.anuncio?.plataforma === "meta" && v2.anuncio?.campanha_nome === "META-3009 Campanha Clareamento" && v2.anuncio?.anuncio_nome === "META-3009 Anúncio Sorriso", JSON.stringify(v2.anuncio));
  c.ok("contato guarda a atribuição (origem anuncio, plataforma meta, campanha, anúncio, ctwa_clid)", v2.contato.origem === "anuncio" && v2.contato.plataforma === "meta" && v2.contato.campanha_ext === "META-3009-CAMP-1" && v2.contato.anuncio_ext === "META-3009-AD-1" && v2.contato.ctwa_clid === "META3009CLID2");
  const m2 = (await itens(i2.id))[0];
  c.ok("a mensagem guarda o referral (source_id, source_type, ctwa_clid, headline)", m2?.referral?.source_id === "META-3009-AD-1" && m2.referral.source_type === "ad" && m2.referral.ctwa_clid === "META3009CLID2" && m2.referral.headline === "Clareamento", JSON.stringify(m2?.referral));
  const n2 = await notifs(rc);
  const la = n2.filter(n => n.tipo === "lead_anuncio" && /Paciente 002/.test(n.titulo));
  c.ok("conversa nova de anúncio → 1 notificação 'lead_anuncio' para o admin (link #/conversas/<id>)", la.length === 1 && la[0].link === `#/conversas/${i2.id}` && la[0].lida_em === null, JSON.stringify(la));
  const kb = deve(await rc("nx_negocios_kanban", { p_funil: null, p_filtro: { busca: tel(2).slice(-7) } }), "kanban");
  const col = kb.colunas.find(k => k.estagio_id === nova.id);
  const card = col?.itens?.find(i => String(i.telefone || i.contato?.telefone).endsWith(tel(2).slice(-7)));
  c.ok("no kanban (funil Pacientes, coluna 'Nova conversa') o card traz selo e nomes de campanha/anúncio", !!card && card.anuncio === true && card.campanha_nome === "META-3009 Campanha Clareamento" && card.anuncio_nome === "META-3009 Anúncio Sorriso", JSON.stringify(card).slice(0, 200));
  // 2ª mensagem do mesmo contato: sem novo negócio, sem nova notificação
  const r2b = await entrada(A(), 2, "Tem horário amanhã?");
  c.ok("2ª mensagem (sem referral) → existente:1; continua 1 negócio de anúncio e 1 notificação", r2b.j?.existente === 1 && (await contatoVer(v2.contato.id)).negocios.length === 1 && (await notifs(rc)).filter(n => n.tipo === "lead_anuncio" && /Paciente 002/.test(n.titulo)).length === 1);
  // T3 — referral de POST (não é anúncio pago)
  const r3 = await entrada(A(), 3, "Vi a publicação de vocês", { referral: { source_type: "post", source_id: "POST-META-3009", source_url: "https://fb.me/post", headline: "Post" } });
  const i3 = await convDeTel(3); const v3 = await ver(i3.id);
  c.ok("referral de tipo 'post' NÃO é anúncio: origem whatsapp, sem plataforma, sem selo, sem notificação de anúncio", r3.j?.criado === 1 && v3.negocios[0].anuncio === false && v3.negocios[0].origem === "whatsapp" && !v3.contato.plataforma && !(await notifs(rc)).some(n => n.tipo === "lead_anuncio" && /Paciente 003/.test(n.titulo)), JSON.stringify(v3.negocios[0]).slice(0, 200));
  // T4 — anúncio sem métricas: selo sim, nomes não
  const r4 = await entrada(A(), 4, "Clicou no anúncio novo", { referral: refAd("META-3009-AD-DESCONHECIDO", "META3009CLID4") });
  const i4 = await convDeTel(4); const cv4 = await contatoVer((await ver(i4.id)).contato.id); const n4 = cv4.negocios[0];
  c.ok("anúncio sem métricas cadastradas → selo e anuncio_ext gravados, campanha_ext/nomes vazios (sem quebrar)", r4.j?.criado === 1 && n4.anuncio === true && n4.plataforma === "meta" && n4.anuncio_ext === "META-3009-AD-DESCONHECIDO" && !n4.campanha_ext && !n4.campanha_nome && !n4.anuncio_nome, JSON.stringify(n4).slice(0, 300));
  // T5 — atribuição tardia: 1ª mensagem orgânica, 2ª com referral
  await entrada(A(), 5, "Bom dia");
  const i5 = await convDeTel(5); const v5a = await ver(i5.id);
  const r5 = await entrada(A(), 5, "Na verdade cheguei pelo anúncio", { referral: refAd("META-3009-AD-1", "META3009CLID5") });
  const v5b = await ver(i5.id); const n5 = (await contatoVer(v5b.contato.id)).negocios[0];
  c.ok("referral que chega na 2ª mensagem completa a atribuição do negócio existente (atribuido:1, ganha o selo e a campanha), sem novo negócio",
    v5a.negocios[0].anuncio === false && r5.j?.atribuido === 1 && r5.j?.criado === 0 && n5.anuncio === true && n5.campanha_nome === "META-3009 Campanha Clareamento" && (await contatoVer(v5b.contato.id)).negocios.length === 1, r5.r.txt.slice(0, 200));
  c.ok("...e como a conversa não é nova não gera outra notificação de anúncio", !(await notifs(rc)).some(n => n.tipo === "lead_anuncio" && /Paciente 005/.test(n.titulo)));
}

async function caso_anuncio_fecha(c) {
  const base = await crmBase();
  const pad = base.funis.find(f => f.padrao), fech = pad.estagios.find(e => e.marco === "fechou");
  const pos = base.funis.find(f => !f.conta_no_ads), posEst = pos.estagios[0];
  const neg = (await ver(E.conv[2])).negocios[0].id;
  const sv = await rc("nx_negocio_mover", { p_id: neg, p_estagio: fech.id });
  c.igual("arrastar o negócio do anúncio para 'Fechou tratamento' SEM valor → valor_obrigatorio (o modal pede o valor)", erroDe(sv), "valor_obrigatorio");
  const ok = deve(await rc("nx_negocio_mover", { p_id: neg, p_estagio: fech.id, p_extra: { valor: 1800 } }), "fechar");
  c.ok("com o valor (R$ 1.800) → status 'ganho', valor gravado e fechado_em carimbado", ok.status === "ganho" && Number(ok.valor) === 1800 && !!ok.fechado_em, JSON.stringify(ok).slice(0, 250));
  const dados = deve(await rc("nx_dados", { p_dias: 30 }), "nx_dados");
  const lead = (dados.leads || []).find(l => String(l.telefone || "").endsWith(tel(2).slice(-7)));
  c.ok("Anúncios (nx_dados): o negócio que o WEBHOOK criou entra com plataforma meta, a campanha e o anúncio das métricas, etapa 'fechou' e o valor", !!lead && lead.plataforma === "meta" && lead.campanha_ext === "META-3009-CAMP-1" && lead.anuncio_ext === "META-3009-AD-1" && /fech/i.test(lead.etapa || "") && Number(lead.valor) === 1800, JSON.stringify(lead));
  c.ok("...e as métricas fictícias da campanha (plataforma meta, 3 dias × campanha/anúncio) estão no mesmo retorno", (dados.metricas || []).filter(m => m.c === "META-3009-CAMP-1").length === 6, String((dados.metricas || []).length));
  const trava = await rc("nx_negocio_mover", { p_id: neg, p_estagio: posEst.id });
  c.ok("mover esse negócio GANHO para o funil Pós-tratamento → bloqueado (funil_invalido / fechado_no_ads)", erroDe(trava) === "funil_invalido" && trava.hint === "fechado_no_ads", `${erroDe(trava)}|${trava.hint}`);
}

async function caso_divergente(c) {
  const antes = await contagens();
  const pidB = B().pid;
  // a) A na URL do canal A, segredo do A, mas metadata.phone_number_id = pid do B
  const a = await entrada(A(), 6, "Mensagem com o pid de outro número", { pid: pidB });
  c.ok("URL do canal A + phone_number_id do canal B → 200 com canal_divergente:1 e NADA gravado (sem mensagens/criado)", a.r.status === 200 && a.j?.canal_divergente === 1 && !a.j?.mensagens && !a.j?.criado, a.r.txt.slice(0, 200));
  // b) pid inventado
  const b = await entrada(A(), 6, "Mensagem com pid inventado", { pid: "999" + aleatDig(10) });
  c.ok("phone_number_id inventado → canal_divergente:1", b.j?.canal_divergente === 1 && !b.j?.mensagens, b.r.txt.slice(0, 200));
  c.igual("o contato da mensagem divergente NÃO existe em lugar nenhum (conversas 0) e as contagens não mudaram", [(await convs(6)).length, await contagens()], [0, antes]);
  // b2) phone_number_id do canal de OUTRO CLIENTE (o teste-e2e): nada é lido nem gravado lá, só descartado
  const outro = await entrada(A(), 6, "Mensagem com o pid de outro CLIENTE", { pid: process.env.E2E_PID_OUTRO_CLIENTE || "5550000000001" });
  c.ok("phone_number_id do canal de OUTRO CLIENTE na URL do canal A → canal_divergente:1 (aceite 5 da ESPEC), nada criado", outro.j?.canal_divergente === 1 && !outro.j?.mensagens && (await convs(6)).length === 0, outro.r.txt.slice(0, 200));
  // c) dois changes no mesmo POST: um do A (vale) e um do B (descartado)
  const dois = envelope(
    valor({ pid: A().pid, nome: NOME(23), wa: tel(23), messages: [mTexto(tel(23), "do número certo")] }),
    valor({ pid: pidB, nome: NOME(24), wa: tel(24), messages: [mTexto(tel(24), "do número errado")] }));
  const d = await hook(A(), dois);
  c.ok("2 changes no mesmo POST → processa o do A (mensagens:1) e descarta o do B (canal_divergente:1)", d.json?.mensagens === 1 && d.json?.canal_divergente === 1 && (await convs(23)).length === 1 && (await convs(24)).length === 0, d.txt.slice(0, 200));
  // d) URL do B assinada com o segredo do A → 401
  const cruz = await hook(B(), envelope(valor({ pid: A().pid, nome: NOME(6), wa: tel(6), messages: [mTexto(tel(6), "cruzado")] })), { segredo: A().secret });
  c.ok("URL do canal B assinada com o segredo do canal A → 401", cruz.status === 401);
  // e) URL do B + segredo do B + pid do A → descartado
  const e = await entrada(B(), 6, "na URL do B com pid do A", { pid: A().pid });
  c.ok("URL do canal B + pid do canal A → canal_divergente:1", e.j?.canal_divergente === 1 && !e.j?.mensagens && (await convs(6)).length === 0);
  // f) canal B funcionando de verdade: conversa no canal B, departamento Recepção
  const f = await entrada(B(), 7, "Olá, pelo segundo número");
  const i7 = await convDeTel(7); E.conv[7] = i7.id; E.rod7 = i7.atribuida_a; salvar();
  c.ok("2º número do cliente (canal B, URL e segredo dele) → conversa e negócio criados NO CANAL B e no departamento Recepção", f.j?.criado === 1 && i7.canal_id === B().id && i7.departamento_id === IDS.dep_recepcao && !!i7.negocio, JSON.stringify(i7).slice(0, 250));
  const soB = deve(await rc("nx_cv_listar", { p_filtro: { aba: "abertas", canal_id: B().id } }), "listar por canal");
  const soA = deve(await rc("nx_cv_listar", { p_filtro: { aba: "abertas", canal_id: A().id } }), "listar por canal");
  c.ok("filtro por canal separa as conversas dos dois números", soB.itens.some(i => i.id === i7.id) && !soA.itens.some(i => i.id === i7.id) && soA.itens.length > 0);
}

async function caso_midia_b(c) {
  // canal B não tem token: a mídia é gravada como 'indisponivel' e NADA é baixado (sem Graph)
  const mk = (tipo, extra) => ({ from: tel(10), id: wamid(), timestamp: agoraS(), type: tipo, [tipo]: extra });
  const msgs = [
    mk("image", { id: `MID-IMG-${E.run}`, mime_type: "image/jpeg", sha256: "abc", caption: "Foto do sorriso" }),
    mk("audio", { id: `MID-AUD-${E.run}`, mime_type: "audio/ogg; codecs=opus", sha256: "def", voice: true }),
    mk("document", { id: `MID-DOC-${E.run}`, mime_type: "application/pdf", sha256: "ghi", filename: "exame.pdf", caption: "Meu exame" }),
    mk("video", { id: `MID-VID-${E.run}`, mime_type: "video/mp4", sha256: "jkl" }),
    mk("sticker", { id: `MID-STK-${E.run}`, mime_type: "image/webp", sha256: "mno" }),
  ];
  const r = await hook(B(), envelope(valor({ pid: B().pid, nome: NOME(10), wa: tel(10), messages: msgs })));
  c.ok("mídia de entrada no canal SEM token (imagem, áudio, documento, vídeo, figurinha) → 200, mensagens:5, sem erro", r.json?.mensagens === 5 && !r.json?.erros, r.txt.slice(0, 200));
  await sleep(3000);
  const conv = await convDeTel(10);
  const todas = await itens(conv.id);
  const ms = todas.filter(m => m.tipo !== "sistema");
  c.ok("canal B é do departamento Recepção (rodízio): a conversa nova é atribuída sozinha a quem recebe conversas ('Atribuída a … (rodízio de Recepção)')", [IDS.admin, IDS.atendente].includes(conv.atribuida_a) && todas.some(m => m.tipo === "sistema" && /^Atribuída a .* \(rodízio de Recepção\)$/.test(m.corpo || "")), JSON.stringify([conv.atribuida_nome, todas.filter(m => m.tipo === "sistema").map(m => m.corpo)]));
  c.ok("rodízio: o 2º contato novo do canal B vai para OUTRA pessoa (quem tem menos conversas e a atribuição mais antiga)", !!E.rod7 && !!conv.atribuida_a && conv.atribuida_a !== E.rod7, JSON.stringify([E.rod7, conv.atribuida_a]));
  c.igual("tipos: imagem, audio, documento, video, sticker", ms.map(m => m.tipo), ["imagem", "audio", "documento", "video", "sticker"]);
  c.ok("todas ficam com midia.estado 'indisponivel' (canal sem token) e sem path nem erro de download", ms.every(m => m.midia?.estado === "indisponivel" && !m.midia?.path && !m.midia?.erro), JSON.stringify(ms.map(m => m.midia?.estado)));
  c.ok("o registro guarda media_id e mime (imagem) e o nome do arquivo (documento)", ms[0].midia?.media_id === `MID-IMG-${E.run}` && ms[0].midia?.mime === "image/jpeg" && ms[2].midia?.nome === "exame.pdf" && ms[2].midia?.mime === "application/pdf");
  c.ok("legenda vira o corpo (imagem 'Foto do sorriso', documento 'Meu exame') e o mime do áudio vem sem parâmetros extras quebrados", ms[0].corpo === "Foto do sorriso" && ms[2].corpo === "Meu exame" && /audio\/ogg/.test(ms[1].midia?.mime || ""), JSON.stringify(ms[1].midia));
  c.ok("resumo da lista mostra o tipo ('Figurinha' para a última)", (await convDeTel(10)).ultima_msg_resumo === "Figurinha", (await convDeTel(10)).ultima_msg_resumo);
  c.nota("estados", ms.map(m => m.midia?.estado));
  // imagem com legenda "SAIR": NÃO é descadastro (só texto puro conta)
  const s = await hook(B(), envelope(valor({ pid: B().pid, nome: NOME(30), wa: tel(30), messages: [mk("image", { id: `MID-SAIR-${E.run}`, mime_type: "image/jpeg", sha256: "zzz", caption: "SAIR" })].map(m => ({ ...m, from: tel(30) })) })));
  const c30 = await convDeTel(30);
  c.ok("imagem com legenda 'SAIR' NÃO descadastra (optin continua nulo e sem aviso de sistema)", s.json?.mensagens === 1 && !s.json?.optout && (await ver(c30.id)).contato.optin_marketing === null && !(await itens(c30.id)).some(m => m.tipo === "sistema" && /marketing/i.test(m.corpo || "")));
}

async function caso_exoticos(c) {
  const z = j => j && j.ok === true && !j.mensagens && !j.criado && !j.erros;
  const a = await hook(A(), { object: "whatsapp_business_account", entry: [] });
  c.ok("assinado, entry vazio → 200 ok sem nada", a.status === 200 && z(a.json), a.txt.slice(0, 160));
  const b = await hook(A(), { object: "whatsapp_business_account", entry: [{ id: "x", changes: [{ field: "account_update", value: { event: "PHONE_NUMBER_NAME_UPDATE", metadata: { phone_number_id: A().pid } } }] }] });
  c.ok("change de outro campo (account_update) → 200, ignorado", b.status === 200 && z(b.json), b.txt.slice(0, 160));
  const d = await hook(A(), { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { messaging_product: "whatsapp", messages: [mTexto(tel(38), "sem metadata")] } }] }] });
  c.ok("mensagem sem metadata.phone_number_id → 200, descartada, contato não criado", d.status === 200 && z(d.json) && (await convs(38)).length === 0, d.txt.slice(0, 160));
  const e = await hook(A(), []);
  const f2 = await hook(A(), {});
  c.ok("corpo JSON que é array ou objeto vazio (assinado) → 200 sem erro", e.status === 200 && f2.status === 200 && e.json?.ok === true && f2.json?.ok === true, `${e.txt.slice(0, 80)} | ${f2.txt.slice(0, 80)}`);
  const g = await hook(A(), envelope(valor({ pid: A().pid, nome: "Sem texto", wa: tel(38), messages: [{ from: tel(38), id: wamid(), timestamp: agoraS(), type: "text" }] })));
  c.ok("mensagem de texto sem o objeto text → não derruba: 200 sem erro", g.status === 200 && !g.json?.erros, g.txt.slice(0, 200));
  const fut = await hook(A(), envelope(valor({ pid: A().pid, nome: NOME(45), wa: tel(45), messages: [{ ...mTexto(tel(45), "relógio adiantado"), timestamp: String(Math.floor(Date.now() / 1000) + 86400) }] })));
  const i45 = await convDeTel(45);
  c.ok("timestamp da Meta no FUTURO (+24 h) é limitado ao agora: a janela não passa de 24 h a partir de agora", fut.json?.mensagens === 1 && Date.parse(i45.ultima_entrada_em) <= Date.now() + 5000 && Date.parse(i45.janela_ate) <= Date.now() + 86400_000 + 5000, JSON.stringify([i45.ultima_entrada_em, i45.janela_ate]));
  const velha = await hook(A(), envelope(valor({ pid: A().pid, nome: NOME(46), wa: tel(46), messages: [{ ...mTexto(tel(46), "entrega atrasada"), timestamp: String(Math.floor(Date.now() / 1000) - 30 * 3600) }] })));
  const i46 = await convDeTel(46);
  c.ok("mensagem entregue com 30 h de atraso (timestamp antigo) em contato novo: a conversa nasce e a janela já está VENCIDA (vale a hora da mensagem, não a da entrega)", velha.json?.mensagens === 1 && Date.parse(i46.janela_ate) < Date.now(), JSON.stringify([i46.ultima_entrada_em, i46.janela_ate]));
  c.ok("a Meta não manda apikey nem Authorization: todas as chamadas acima foram feitas só com X-Hub-Signature-256 (verify_jwt=false)", true);
}

async function caso_simulador(c) {
  const Sim = await import(pathToFileURL(path.join(RAIZ, "scripts", "simular-webhook.mjs")).href);
  const url = `${URL_WA}?c=${B().chave}`;
  const base = { url, segredo: B().secret, pid: B().pid };
  const m = await Sim.simular({ ...base, tipo: "texto", from: tel(35), mostrar: true });
  c.ok("simular --mostrar só monta o corpo (não envia) e a assinatura = HMAC-SHA256(segredo, corpo cru)", m.mostrado === true && m.assinatura === assinar(JSON.stringify(m.corpo), B().secret));
  const t = await Sim.simular({ ...base, tipo: "texto", from: tel(35), nome: "Simulador META-3009" });
  c.ok("scripts/simular-webhook.mjs tipo texto (anúncio) contra a função publicada → 200, criado:1", t.status === 200 && t.resposta?.criado === 1 && t.resposta?.mensagens === 1, JSON.stringify(t).slice(0, 200));
  const i35 = await convDeTel(35);
  const n35 = (await contatoVer((await ver(i35.id)).contato.id)).negocios[0];
  c.ok("...o negócio nasce com selo de anúncio (source_id 'TESTE-ANUNCIO', sem métricas: sem nome de campanha) na etapa Nova conversa", n35?.anuncio === true && n35.anuncio_ext === "TESTE-ANUNCIO" && n35.plataforma === "meta" && !n35.campanha_nome && i35.canal_id === B().id, JSON.stringify(n35).slice(0, 220));
  const im = await Sim.simular({ ...base, tipo: "imagem", from: tel(36) });
  const i36 = await convDeTel(36); const m36 = (await itens(i36.id)).find(x => x.tipo === "imagem");
  c.ok("simulador tipo imagem no canal sem token → 'mídia indisponível' (honesto, sem baixar nada)", im.status === 200 && im.resposta?.mensagens === 1 && m36?.midia?.estado === "indisponivel" && m36.corpo === "Foto de teste", JSON.stringify(m36?.midia));
  const sr = await Sim.simular({ ...base, tipo: "sair", from: tel(37) });
  const i37 = await convDeTel(37);
  c.ok("simulador tipo sair → optout:1 e o contato fica 'Não quer marketing' (aceite 7 da ESPEC)", sr.status === 200 && sr.resposta?.optout === 1 && (await ver(i37.id)).contato.optin_marketing === false, JSON.stringify(sr).slice(0, 200));
  const rb = await Sim.simular({ ...base, tipo: "recibo", from: tel(35), wamid: t.wamid, status: "delivered" });
  c.ok("recibo (simulador) para o wamid de uma mensagem RECEBIDA → ignorado (recibo só vale para saída); a mensagem continua 'recebida'", rb.status === 200 && rb.resposta?.recibos_ignorados === 1 && (await msgDe(i35.id, t.wamid))?.status === "recebida", JSON.stringify(rb).slice(0, 200));
  const ruim = await Sim.simular({ ...base, segredo: "segredo-errado-3009", tipo: "texto", from: tel(35) });
  c.ok("simulador com o segredo errado → 401 (o mesmo que a Meta com segredo vencido)", ruim.status === 401, JSON.stringify(ruim).slice(0, 120));
}

async function caso_sair(c) {
  // T11: conversa normal e depois SAIR
  await entrada(A(), 11, "Oi, quero informações sobre implante");
  const i11 = await convDeTel(11); E.conv[11] = i11.id; salvar();
  c.ok("antes do SAIR: optin_marketing nulo", (await ver(i11.id)).contato.optin_marketing === null);
  const s1 = await entrada(A(), 11, "SAIR");
  const v11 = await ver(i11.id);
  c.ok("'SAIR' → resposta optout:1", s1.j?.optout === 1 && s1.j?.mensagens === 1, s1.r.txt.slice(0, 200));
  c.ok("contato fica 'Não quer marketing': optin_marketing=false, optin_origem 'whatsapp: pediu para sair', optin_em preenchido", v11.contato.optin_marketing === false && v11.contato.optin_origem === "whatsapp: pediu para sair" && !!v11.contato.optin_em && Math.abs(Date.now() - Date.parse(v11.contato.optin_em)) < 120_000, JSON.stringify({ o: v11.contato.optin_marketing, og: v11.contato.optin_origem }));
  c.ok("a conversa mostra optin_marketing=false no contato (selo na lista)", (await convDeTel(11)).contato.optin_marketing === false);
  const m11 = await itens(i11.id);
  const sis = m11.filter(m => m.tipo === "sistema");
  c.ok("mensagem de sistema 'Contato pediu para não receber mensagens de marketing' (saída, enviada, sem wamid)", sis.length === 1 && sis[0].corpo === "Contato pediu para não receber mensagens de marketing" && sis[0].direcao === "out" && sis[0].status === "enviada" && !sis[0].wamid, JSON.stringify(sis));
  c.ok("o texto 'SAIR' fica no histórico como mensagem recebida (a conversa continua atendível)", m11.some(m => m.tipo === "texto" && m.corpo === "SAIR" && m.direcao === "in") && (await convDeTel(11)).status === "aberta");
  const s2 = await entrada(A(), 11, "sair");
  c.ok("SAIR repetido: optout:1 de novo mas NÃO duplica o aviso de sistema nem troca optin_em", s2.j?.optout === 1 && (await itens(i11.id)).filter(m => m.tipo === "sistema").length === 1 && (await ver(i11.id)).contato.optin_em === v11.contato.optin_em);
  // variações (cada uma num contato novo: a própria 1ª mensagem já é o pedido)
  const vars = ["Sair!", "PARAR", "stop", "  Cancelar  ", "descadastrar", "Pare.", "SAÍR"];
  const res = [];
  for (let k = 0; k < vars.length; k++) {
    const n = 12 + k;
    const r = await entrada(A(), n, vars[k]);
    const cc = await convDeTel(n);
    res.push({ v: vars[k], optout: r.j?.optout === 1, optin: cc ? (await ver(cc.id)).contato.optin_marketing : "sem conversa" });
  }
  c.ok(`variações de SAIR descadastram: ${vars.map(v => JSON.stringify(v)).join(", ")}`, res.every(x => x.optout && x.optin === false), JSON.stringify(res));
  // negativos (contêm a palavra, mas não SÃO o pedido)
  const neg = ["Posso sair mais cedo?", "Não quero parar o tratamento", "sair da lista", "saiba mais", "pare de ligar pra mim, por favor"];
  const rn = [];
  for (const t of neg) { const r = await entrada(A(), 34, t); rn.push(r.j?.optout || 0); }
  const i18 = await convDeTel(34);
  c.ok(`frases que só CONTÊM a palavra não descadastram (${neg.length} frases): optin continua nulo e nenhum aviso de sistema`, rn.every(x => x === 0) && (await ver(i18.id)).contato.optin_marketing === null && !(await itens(i18.id)).some(m => m.tipo === "sistema"), JSON.stringify(rn));
}

async function caso_ola(c) {
  const neg = await ra("nx_resposta_salvar", { p_resposta: { atalho: "ola", titulo: `${PRE} Olá`, corpo: "Olá" } });
  c.igual("atendente NÃO cria resposta rápida (supervisor+)", erroDe(neg), "sem_permissao");
  const corpo = "Olá, {primeiro_nome}! Aqui é a {empresa}. Como posso ajudar?";
  const r = deve(await rc("nx_resposta_salvar", { p_resposta: { atalho: "/OLA", titulo: `${PRE} Olá`, corpo } }), "resposta_salvar");
  E.ola = { id: r.id, corpo }; salvar();
  c.ok("resposta '/OLA' é gravada como atalho 'ola' (sem a barra, minúsculo), 0 usos", r.atalho === "ola" && r.usos === 0 && r.corpo === corpo, JSON.stringify(r));
  const dup = await rc("nx_resposta_salvar", { p_resposta: { atalho: "Ola", titulo: "dup", corpo: "x" } });
  c.igual("atalho repetido → atalho_em_uso", erroDe(dup), "atalho_em_uso");
  const inv = await rc("nx_resposta_salvar", { p_resposta: { atalho: "ol á", titulo: "x", corpo: "x" } });
  c.ok("atalho com espaço/acento → dados_invalidos (atalho)", erroDe(inv) === "dados_invalidos" && inv.hint === "atalho");
  const baseAt = deve(await ra("nx_cv_base"), "nx_cv_base(atendente)");
  const resp = baseAt.respostas.find(x => x.atalho === "ola");
  c.ok("o atendente vê a resposta /ola no nx_cv_base (é o que o compositor usa)", !!resp && resp.corpo === corpo && resp.id === r.id);
  // expande como o compositor faz (web/app/cv-logica.js → aplicarVariaveis)
  let L = null;
  try { L = await import(pathToFileURL(path.join(RAIZ, "web", "app", "cv-logica.js")).href); } catch (e) { c.ok("carrega web/app/cv-logica.js", false, String(e?.message || e)); }
  const base = deve(await rc("nx_cv_base"), "nx_cv_base");
  const cli = (deve(await rpc("nx_sessao"), "nx_sessao").clientes || []).find(x => x.id === CLI);
  const empresa = cli?.nome || base.empresa || "";
  if (L) {
    const conv = await ver(E.conv[1]);
    const txt = L.aplicarVariaveis(corpo, { nome: conv.contato.nome, atendente: "META-3009 Admin", empresa, protocolo: conv.conversa.protocolo });
    E.ola.texto = txt; salvar();
    c.ok("/ola com o contato 'Maria META-3009' → 'Olá, Maria! Aqui é a <empresa>. …' (só o primeiro nome)", txt.startsWith("Olá, Maria! Aqui é a ") && !/\{/.test(txt), txt);
    const semNome = L.aplicarVariaveis(corpo, { nome: "", empresa });
    c.ok("contato sem nome → 'Olá! Aqui é…' (a variável some junto com a vírgula)", semNome.startsWith("Olá! Aqui é a "), semNome);
  }
  const u1 = deve(await ra("nx_resposta_usada", { p_id: r.id }), "usada");
  const u2 = deve(await ra("nx_resposta_usada", { p_id: r.id }), "usada");
  c.ok("usar a resposta conta os usos (atendente): 1 e depois 2", u1.usos === 1 && u2.usos === 2, JSON.stringify([u1, u2]));
  const u3 = deve(await ra("nx_resposta_usada", { p_id: "00000000-0000-4000-8000-000000000000" }), "usada");
  c.ok("id inexistente → {ok:false}", u3.ok === false);
}

async function caso_fluxo(c) {
  const nomeAdm = `${PRE} Admin`, nomeAt = `${PRE} Atendente`;
  await entrada(A(), 26, "Preciso remarcar minha consulta");
  const i = await convDeTel(26); E.conv[26] = i.id; salvar();
  const cont0 = await contagens();
  const msgsSis = async () => (await itens(i.id)).filter(m => m.tipo === "sistema").map(m => m.corpo);
  // assumir
  const a1 = deve(await rc("nx_cv_atribuir", { p_conversa: i.id, p_conta: IDS.admin }), "assumir");
  const cont1 = await contagens();
  c.ok("ASSUMIR: atribuída ao admin, 'minhas' +1 e 'sem_dono' -1", a1.atribuida_a === IDS.admin && a1.atribuida_nome === nomeAdm && cont1.minhas === cont0.minhas + 1 && cont1.sem_dono === cont0.sem_dono - 1, JSON.stringify([cont0, cont1]));
  c.ok("...com mensagem de sistema 'META-3009 Admin assumiu'", (await msgsSis()).includes(`${nomeAdm} assumiu`), JSON.stringify(await msgsSis()));
  const a1b = deve(await rc("nx_cv_atribuir", { p_conversa: i.id, p_conta: IDS.admin }), "assumir de novo");
  c.ok("assumir de novo não muda nada (sem nova mensagem de sistema)", a1b.atribuida_a === IDS.admin && (await msgsSis()).length === 1);
  // nota interna
  const cvAntes = await convDeTel(26);
  const nota = deve(await rc("nx_cv_nota", { p_conversa: i.id, p_texto: "Paciente prefere manhã — nota interna" }), "nota");
  const cvDepois = await convDeTel(26);
  c.ok("NOTA interna: tipo 'nota', saída, enviada, sem wamid, do admin (nunca vai ao WhatsApp)", nota.tipo === "nota" && nota.direcao === "out" && nota.status === "enviada" && !nota.wamid && nota.enviado_por?.id === IDS.admin, JSON.stringify(nota).slice(0, 250));
  c.ok("...e não mexe na conversa: resumo, direção, aguardando, não lidas e 1ª resposta iguais", cvDepois.ultima_msg_resumo === cvAntes.ultima_msg_resumo && cvDepois.ultima_msg_dir === "in" && cvDepois.aguardando === true && cvDepois.nao_lidas === cvAntes.nao_lidas && (await ver(i.id)).conversa.primeira_resposta_em === null);
  c.igual("nota vazia e nota de 4.097 caracteres → dados_invalidos", [erroDe(await rc("nx_cv_nota", { p_conversa: i.id, p_texto: "   " })), erroDe(await rc("nx_cv_nota", { p_conversa: i.id, p_texto: "n".repeat(4097) }))], ["dados_invalidos", "dados_invalidos"]);
  // transferir para o atendente
  const t1 = deve(await rc("nx_cv_atribuir", { p_conversa: i.id, p_conta: IDS.atendente }), "transferir");
  c.ok("TRANSFERIR para o atendente: nova dona, mensagem 'Transferida de META-3009 Admin para META-3009 Atendente'", t1.atribuida_a === IDS.atendente && (await msgsSis()).includes(`Transferida de ${nomeAdm} para ${nomeAt}`), JSON.stringify(await msgsSis()));
  const nt = await notifs(ra);
  const n1 = nt.find(n => n.tipo === "atribuida" && n.link === `#/conversas/${i.id}`);
  c.ok("o atendente recebe notificação 'atribuida' (link #/conversas/<id>, 'passou a conversa com … para você')", !!n1 && /passou a conversa com .* para você/.test(n1.titulo), JSON.stringify(nt).slice(0, 300));
  const minhasAt = deve(await listar("minhas", {}, ra), "minhas(atendente)");
  c.ok("aba 'Minhas' do atendente traz a conversa; e ele consegue abri-la", minhasAt.itens.some(x => x.id === i.id) && (await ver(i.id, ra)).conversa.id === i.id);
  // transferir para pessoa sem acesso
  const semAcesso = await ra("nx_cv_atribuir", { p_conversa: i.id, p_conta: "00000000-0000-4000-8000-00000000c0de" });
  c.ok("transferir para conta sem acesso ao cliente → dados_invalidos (conta)", erroDe(semAcesso) === "dados_invalidos" && semAcesso.hint === "conta", `${erroDe(semAcesso)}|${semAcesso.hint}`);
  // mudar de departamento mantendo a dona
  const d1 = deve(await rc("nx_cv_atribuir", { p_conversa: i.id, p_conta: IDS.atendente, p_departamento: IDS.dep_recepcao }), "departamento");
  c.ok("TRANSFERIR de departamento (Comercial → Recepção) mantendo a dona: 'Movida para Recepção'", d1.departamento_id === IDS.dep_recepcao && d1.atribuida_a === IDS.atendente && (await msgsSis()).includes("Movida para Recepção"), JSON.stringify(await msgsSis()));
  // departamento sem dono
  const d2 = deve(await rc("nx_cv_atribuir", { p_conversa: i.id, p_departamento: IDS.dep_comercial }), "para o departamento");
  c.ok("para o departamento Comercial SEM dono: atribuida_a nula, 'Movida para Comercial'", d2.atribuida_a === null && d2.departamento_id === IDS.dep_comercial && (await msgsSis()).includes("Movida para Comercial"));
  // devolver à fila
  deve(await rc("nx_cv_atribuir", { p_conversa: i.id, p_conta: IDS.admin }), "reassumir");
  const dv = deve(await rc("nx_cv_atribuir", { p_conversa: i.id }), "devolver");
  c.ok("DEVOLVER à fila (conta e departamento nulos): sem dona, 'META-3009 Admin devolveu para a fila'", dv.atribuida_a === null && (await msgsSis()).includes(`${nomeAdm} devolveu para a fila`), JSON.stringify(await msgsSis()));
  c.igual("conversa inexistente → conversa_nao_encontrada", erroDe(await rc("nx_cv_atribuir", { p_conversa: 999999999, p_conta: IDS.admin })), "conversa_nao_encontrada");
  // visibilidade do atendente (ver_todas=false): conversa de colega não aparece nem abre
  deve(await rc("nx_cv_atribuir", { p_conversa: i.id, p_conta: IDS.admin }), "assumir p/ visibilidade");
  const vis = await ra("nx_cv_ver", { p_id: i.id });
  const listAt = deve(await listar("abertas", {}, ra), "abertas(atendente)");
  c.ok("VISIBILIDADE: conversa atribuída ao admin → o atendente (ver_todas=false) NÃO a abre (conversa_nao_encontrada) nem a vê na lista", erroDe(vis) === "conversa_nao_encontrada" && !listAt.itens.some(x => x.id === i.id), `${erroDe(vis)} itens=${listAt.itens.length}`);
  // pendente ↔ aberta
  const p = deve(await rc("nx_cv_status", { p_conversa: i.id, p_status: "pendente" }), "pendente");
  const cp = await contagens();
  c.ok("PENDENTE: status pendente, sai de 'abertas' (contagens.pendentes 1) e fica registrado", p.status === "pendente" && cp.pendentes === 1 && (await msgsSis()).some(t => /marcou como pendente/.test(t)), JSON.stringify(cp));
  const re1 = deve(await rc("nx_cv_status", { p_conversa: i.id, p_status: "aberta" }), "retomar");
  c.ok("retomar: volta a 'aberta' ('retomou o atendimento')", re1.status === "aberta" && (await msgsSis()).some(t => /retomou o atendimento/.test(t)));
  // resolver
  const abertasAntes = (await contagens()).abertas;
  const rs = deve(await rc("nx_cv_status", { p_conversa: i.id, p_status: "resolvida" }), "resolver");
  const vr = await ver(i.id);
  const cr = await contagens();
  c.ok("RESOLVER: status resolvida, aguardando=false, não lidas 0, resolvida_em e resolvida_por (admin)", rs.status === "resolvida" && rs.aguardando === false && rs.nao_lidas === 0 && !!vr.conversa.resolvida_em && vr.conversa.resolvida_por?.id === IDS.admin, JSON.stringify(rs).slice(0, 250));
  c.ok(`...mensagem 'Atendimento ${vr.conversa.protocolo} resolvido por META-3009 Admin' e as abas batem (abertas -1; aba Resolvidas traz a conversa)`,
    (await msgsSis()).includes(`Atendimento ${vr.conversa.protocolo} resolvido por ${nomeAdm}`) && cr.abertas === abertasAntes - 1 && (await listar("resolvidas")).dados.itens.some(x => x.id === i.id), JSON.stringify([abertasAntes, cr.abertas]));
  // reabrir
  const ab = deve(await rc("nx_cv_status", { p_conversa: i.id, p_status: "aberta" }), "reabrir");
  c.ok("REABRIR: volta a 'aberta', resolvida_em/por limpos, 'reaberto por META-3009 Admin'", ab.status === "aberta" && (await ver(i.id)).conversa.resolvida_em === null && (await msgsSis()).includes(`Atendimento ${vr.conversa.protocolo} reaberto por ${nomeAdm}`));
  // resolver de novo + cliente volta a escrever => NOVA conversa; reabrir a velha → ja_existe_aberta
  deve(await rc("nx_cv_status", { p_conversa: i.id, p_status: "resolvida" }), "resolver 2");
  const volta = await entrada(A(), 26, "Oi, voltei");
  const todas = await convs(26);
  const nova = todas.find(x => x.id !== i.id);
  c.ok("cliente escreve de novo depois de resolvida → NOVA conversa (nova_conversa), outro protocolo, a antiga continua resolvida", volta.j?.mensagens === 1 && todas.length === 2 && nova?.status === "aberta" && nova.protocolo !== vr.conversa.protocolo && todas.find(x => x.id === i.id).status === "resolvida", JSON.stringify(todas.map(x => [x.id, x.status, x.protocolo])));
  const ja = await rc("nx_cv_status", { p_conversa: i.id, p_status: "aberta" });
  c.ok("reabrir a antiga com outra aberta do mesmo contato/número → ja_existe_aberta (hint = id da aberta)", erroDe(ja) === "ja_existe_aberta" && ja.hint === String(nova.id), `${erroDe(ja)}|${ja.hint}`);
  E.conv["26b"] = nova.id; salvar();
  c.igual("status inválido → dados_invalidos", erroDe(await rc("nx_cv_status", { p_conversa: nova.id, p_status: "arquivada" })), "dados_invalidos");
  // nx_cv_nova: contato com conversa aberta devolve a mesma
  const cn1 = deve(await rc("nx_cv_nova", { p_canal: A().id, p_contato: nova.contato.id }), "nx_cv_nova (aberta)");
  c.ok("Nova conversa para contato que já tem conversa aberta no número → devolve ESSA (não cria outra)", cn1.id === nova.id);
  // nx_cv_nova por telefone digitado (sem histórico): sem janela
  const cn2 = deve(await rc("nx_cv_nova", { p_canal: A().id, p_telefone: "(12) 99300-8027", p_nome: NOME(27) }), "nx_cv_nova (telefone)");
  E.conv[27] = cn2.id; salvar();
  const v27 = await ver(cn2.id);
  c.ok("Nova conversa por telefone digitado: contato novo 'manual' com 55 + DDD + número, aberta, atribuída a quem abriu, SEM janela (janela_ate nulo)", v27.contato.telefone === tel(27) && v27.contato.origem === "manual" && cn2.status === "aberta" && cn2.atribuida_a === IDS.admin && cn2.ultima_entrada_em === null && cn2.janela_ate === null && cn2.aguardando === false, JSON.stringify(cn2).slice(0, 300));
  c.ok("...com a mensagem de sistema 'Conversa iniciada por META-3009 Admin'", (await itens(cn2.id)).some(m => m.tipo === "sistema" && m.corpo === `Conversa iniciada por ${nomeAdm}`));
  c.igual("Nova conversa: canal inexistente → canal_nao_encontrado; contato inexistente → contato_nao_encontrado; sem contato nem telefone → dados_invalidos",
    [erroDe(await rc("nx_cv_nova", { p_canal: "00000000-0000-4000-8000-000000000001", p_telefone: tel(27) })), erroDe(await rc("nx_cv_nova", { p_canal: A().id, p_contato: 999999999 })), erroDe(await rc("nx_cv_nova", { p_canal: A().id }))],
    ["canal_nao_encontrado", "contato_nao_encontrado", "dados_invalidos"]);
  // contagens batem com as listas
  const fim = deve(await listar("abertas"), "abertas");
  const aguard = deve(await listar("aguardando"), "aguardando");
  const semDono = deve(await listar("sem_dono"), "sem_dono");
  const minhas = deve(await listar("minhas"), "minhas");
  const pend = deve(await listar("pendentes"), "pendentes");
  c.ok("contagens das abas = tamanho das listas (abertas, aguardando, sem_dono, minhas, pendentes)", fim.contagens.abertas === fim.itens.length && fim.contagens.aguardando === aguard.itens.length && fim.contagens.sem_dono === semDono.itens.filter(x => x.status !== "resolvida").length && fim.contagens.minhas === minhas.itens.length && fim.contagens.pendentes === pend.itens.length, JSON.stringify([fim.contagens, fim.itens.length, aguard.itens.length, semDono.itens.length, minhas.itens.length, pend.itens.length]));
}

async function caso_bloqueado(c) {
  await entrada(A(), 33, "Oi, tudo bem?");
  const i = await convDeTel(33);
  const antes = await contagens();
  c.igual("atendente NÃO oculta/bloqueia conversa (supervisor+)", erroDe(await ra("nx_cv_ocultar", { p_conversa: i.id, p_ocultar: true })), "sem_permissao");
  const oc = deve(await rc("nx_cv_ocultar", { p_conversa: i.id, p_ocultar: true }), "ocultar");
  c.ok("ocultar (supervisor+): conversa oculta e resolvida e contato bloqueado", oc.oculta === true && oc.status === "resolvida" && (await ver(i.id)).contato.bloqueado === true, JSON.stringify(oc).slice(0, 200));
  const n0 = (await contatoVer((await ver(i.id)).contato.id)).negocios.length;
  const nt0 = (await notifs(rc)).length;
  const r = await entrada(A(), 33, "Por que me bloquearam?");
  c.ok("contato bloqueado escreve → 200 com bloqueados:1 (mensagem gravada, nada mais)", r.j?.mensagens === 1 && r.j?.bloqueados === 1, r.r.txt.slice(0, 200));
  const cid = (await ver(i.id)).contato.id;
  const cvs = (await contatoVer(cid)).conversas;
  const ms = await itens(i.id);
  c.ok("...grava na MESMA conversa oculta (sem conversa nova), sem não lida, sem aguardando, sem notificação e sem novo negócio",
    cvs.length === 1 && ms.some(m => m.corpo === "Por que me bloquearam?") && (await ver(i.id)).conversa.nao_lidas === 0 && (await ver(i.id)).conversa.aguardando === false
    && (await contagens()).abertas === antes.abertas - 1 && (await notifs(rc)).length === nt0 && (await contatoVer(cid)).negocios.length === n0, JSON.stringify([cvs.length, await contagens(), antes]));
  deve(await rc("nx_cv_ocultar", { p_conversa: i.id, p_ocultar: false }), "desocultar");
}

async function caso_fora_horario(c) {
  // Recepção está sempre fechada e tem mensagem de fora do horário; o canal B não tem token: o aviso entra na fila e falha SEM rede
  const r1 = await entrada(B(), 28, "Oi, vocês atendem hoje?");
  c.ok("conversa nova no canal B (Recepção fechada) → 200 sem erro", r1.r.status === 200 && r1.j?.criado === 1 && !r1.j?.erros, r1.r.txt.slice(0, 200));
  const i = await convDeTel(28); E.conv[28] = i.id; salvar();
  await sleep(3000);
  deve(await rc("nx_cv_status", { p_conversa: i.id, p_status: "resolvida" }), "resolver");
  const r2 = await entrada(B(), 28, "E agora, já abriram?");
  const todas = await convs(28);
  c.ok("resolvida e escrevendo de novo dentro de 12 h → OUTRA conversa nova (a verificação de 1 aviso por contato a cada 12 h é do SQL meta-03)", r2.j?.mensagens === 1 && todas.length === 2 && todas[1].status === "aberta");
  c.ok("manter_atendente (Recepção): a conversa nova volta para quem atendeu a anterior, sem novo rodízio", !!todas[0].atribuida_a && todas[1].atribuida_a === todas[0].atribuida_a, JSON.stringify([todas[0].atribuida_nome, todas[1].atribuida_nome]));
  await sleep(2500);
  c.nota("conversas_28", todas.map(x => x.id));
}

async function caso_variantes9(c) {
  // manual COM o 9 → a Meta manda SEM o 9 (números antigos)
  const cn = deve(await rc("nx_cv_nova", { p_canal: A().id, p_telefone: "(12) 99300-8041", p_nome: "Com nove META-3009" }), "nx_cv_nova");
  const r = await entrada(A(), 41, "Oi, cheguei sem o nono dígito", { wa: "551293008041" });
  const lista = deve(await rc("nx_contatos_listar", { p_filtro: { busca: "3008041" } }), "contatos");
  const cs = await convs(41);
  c.ok("contato digitado com o 9 (5512993008041) e mensagem da Meta SEM o 9 (551293008041) → MESMO contato (1 só), sem duplicar", lista.total === 1 && lista.itens[0].id === cn.contato.id, JSON.stringify(lista.itens.map(x => [x.id, x.telefone])));
  c.ok("...e a mesma conversa (a aberta por 'Nova conversa' recebe a mensagem; nada de conversa nova)", r.j?.mensagens === 1 && cs.length === 1 && cs[0].id === cn.id && cs[0].nao_lidas === 1, JSON.stringify(cs.map(x => [x.id, x.nao_lidas])));
  const v = await ver(cn.id);
  c.ok("o wa_id passa a ser o que a Meta mandou (551293008041: é para ele que o envio vai) e o telefone cadastrado é mantido", v.contato.wa_id === "551293008041" && v.contato.telefone === "5512993008041", JSON.stringify([v.contato.wa_id, v.contato.telefone]));
  // webhook SEM o 9 cria o contato → digitação manual COM o 9 acha o mesmo
  const r2 = await entrada(A(), 42, "Oi, sem o nono dígito (2)", { wa: "551293008042" });
  const i42 = await convDeTel(42);
  const cn2 = deve(await rc("nx_cv_nova", { p_canal: A().id, p_telefone: "(12) 99300-8042" }), "nx_cv_nova 2");
  const lista2 = deve(await rc("nx_contatos_listar", { p_filtro: { busca: "3008042" } }), "contatos 2");
  c.ok("contato criado pelo webhook SEM o 9 e 'Nova conversa' digitada COM o 9 → devolve a MESMA conversa aberta, 1 contato só", r2.j?.criado === 1 && cn2.id === i42.id && lista2.total === 1, JSON.stringify([i42.id, cn2.id, lista2.total]));
}

async function caso_concorrencia(c) {
  const n = 39, wa = tel(n);
  const posts = Array.from({ length: 6 }, (_, k) => hook(A(), envelope(valor({ pid: A().pid, nome: NOME(n), wa, messages: [mTexto(wa, `paralela ${k + 1}`)] }))));
  const rs = await Promise.all(posts);
  c.ok("6 POSTs SIMULTÂNEOS do mesmo contato novo → todos 200, sem erro", rs.every(r => r.status === 200 && r.json?.ok === true && !r.json?.erros), rs.map(r => r.status).join(","));
  const lista = deve(await rc("nx_contatos_listar", { p_filtro: { busca: wa.slice(-7) } }), "contatos");
  const cs = await convs(n);
  const v = cs[0] ? await ver(cs[0].id) : null;
  c.ok("...1 contato, 1 conversa, 1 negócio e as 6 mensagens (a trava por cliente+telefone serializa a criação)", lista.total === 1 && cs.length === 1 && v?.negocios.length === 1 && (await itens(cs[0].id)).filter(m => m.direcao === "in").length === 6, JSON.stringify([lista.total, cs.length, v?.negocios.length]));
  c.ok("...e a soma das respostas: criado 1 e existente 5", rs.reduce((a, r) => a + (r.json?.criado || 0), 0) === 1 && rs.reduce((a, r) => a + (r.json?.existente || 0), 0) === 5, JSON.stringify(rs.map(r => [r.json?.criado, r.json?.existente])));
  // a Meta reentrega o MESMO wamid em paralelo
  const m = mTexto(wa, "reentregue em paralelo");
  const rep5 = await Promise.all(Array.from({ length: 5 }, () => hook(A(), envelope(valor({ pid: A().pid, nome: NOME(n), wa, messages: [m] })))));
  const tot = rep5.reduce((a, r) => a + (r.json?.mensagens || 0), 0), dup = rep5.reduce((a, r) => a + (r.json?.duplicadas || 0), 0);
  c.ok("5 entregas simultâneas do MESMO wamid → 1 gravada (mensagens:1) e 4 duplicadas; 1 só mensagem no histórico", rep5.every(r => r.status === 200) && tot === 1 && dup === 4 && (await itens(cs[0].id)).filter(x => x.wamid === m.id).length === 1, JSON.stringify([tot, dup]));
  c.igual("não lidas = 7 (6 + 1) e continua 1 negócio", [(await convs(n))[0].nao_lidas, (await ver(cs[0].id)).negocios.length], [7, 1]);
}

async function caso_rotacao(c) {
  const velho = B().secret, novo = crypto.randomBytes(16).toString("hex");
  const r = deve(await rc("nx_canal_salvar", { p_canal: { id: B().id, app_secret: novo } }), "rotacionar segredo");
  E.canais.B.secret = novo; salvar();
  c.ok("rotacionar o app secret do canal B: continua com segredo próprio, status pendente e app_inscrito nulo", r.canal.tem_app_secret === true && r.canal.status === "pendente" && r.canal.app_inscrito === null && r.webhook.modo === "proprio", JSON.stringify(r.canal).slice(0, 200));
  const a = await hook(B(), envelope(valor({ pid: B().pid, nome: NOME(43), wa: tel(43), messages: [mTexto(tel(43), "assinada com o segredo antigo")] })), { segredo: velho });
  c.ok("o segredo ANTIGO deixa de valer na hora → 401 e nada criado", a.status === 401 && (await convs(43)).length === 0, `${a.status}`);
  const b = await entrada(B(), 43, "assinada com o segredo novo");
  c.ok("o segredo NOVO vale → 200 e a conversa é criada no canal B", b.j?.criado === 1 && (await convDeTel(43))?.canal_id === B().id, b.r.txt.slice(0, 160));
  const antigo = B().pid, pidNovo = "30090" + aleatDig(9);
  const r2 = deve(await rc("nx_canal_salvar", { p_canal: { id: B().id, phone_number_id: pidNovo } }), "trocar pid");
  E.canais.B.pid = pidNovo; salvar();
  c.ok("trocar o phone_number_id do canal B: grava o novo, status pendente e mantém o segredo", r2.canal.phone_number_id === pidNovo && r2.canal.status === "pendente" && r2.canal.tem_app_secret === true, JSON.stringify(r2.canal).slice(0, 200));
  const d = await entrada(B(), 44, "com o phone_number_id antigo", { pid: antigo });
  c.ok("evento com o phone_number_id ANTIGO na URL do canal B → canal_divergente:1 (nada criado)", d.j?.canal_divergente === 1 && !d.j?.mensagens && (await convs(44)).length === 0, d.r.txt.slice(0, 160));
  const e = await entrada(B(), 44, "com o phone_number_id novo");
  c.ok("com o phone_number_id NOVO → aceito no canal B", e.j?.criado === 1 && (await convDeTel(44))?.canal_id === B().id);
}

async function fase1() {
  await caso("prep", "Sessões de teste, cliente novo, funil", prep);
  await caso("canais", "Cadastro dos canais Meta de teste (token/segredo falsos), regras e segredos", canais);
  await caso("get", "GET de verificação do webhook (hub.challenge)", verificacaoGet);
  await caso("assinatura", "POST com assinatura inválida/ausente/adulterada → 401 e nada gravado", assinatura);
  await caso("entrada", "Entrada de texto assinada: contato + conversa + negócio, idempotência, tipos, reação, cortes", caso_entrada);
  await caso("exoticos", "Payloads exóticos assinados (entry vazio, outro campo, sem metadata, array…)", caso_exoticos);
  await caso("anuncio", "Entrada com referral de anúncio (CTWA): negócio com selo e campanha", caso_anuncio);
  await caso("anuncio_fecha", "Fechar o negócio do anúncio: valor obrigatório, Ads conta, trava do funil", caso_anuncio_fecha);
  await caso("divergente", "phone_number_id de outro número → canal_divergente; 2º canal funciona", caso_divergente);
  await caso("midia_b", "Mídia de entrada em canal sem token → indisponível, sem baixar", caso_midia_b);
  await caso("simulador", "scripts/simular-webhook.mjs contra a função publicada (texto de anúncio, imagem, sair, recibo)", caso_simulador);
  await caso("variantes9", "Telefone com/sem o 9: mesmo contato", caso_variantes9);
  await caso("concorrencia", "Entregas simultâneas: 1 contato/conversa/negócio e wamid repetido gravado uma vez", caso_concorrencia);
  await caso("sair", "SAIR e variações → descadastrado", caso_sair);
  await caso("ola", "Resposta rápida /ola com o primeiro nome", caso_ola);
  await caso("fluxo", "Assumir, transferir, nota, pendente, resolver, reabrir, nova conversa", caso_fluxo);
  await caso("bloqueado", "Contato bloqueado escreve → mensagem na conversa oculta", caso_bloqueado);
  await caso("fora_horario", "Conversa nova fora do horário no canal sem token", caso_fora_horario);
  await caso("rotacao", "Rotação do app secret e troca do phone_number_id", caso_rotacao);
  // a janela de 24 h do contato 8 (conversa a ser envelhecida por SQL) e o recibo que chega ANTES da mensagem
  await caso("prep2", "Conversas para a fase 2 (janela vencida e recibo antes da mensagem)", async c => {
    await entrada(A(), 8, "Oi, é sobre o orçamento"); await entrada(A(), 32, "Oi, preciso de ajuda");
    const i8 = await convDeTel(8), i32 = await convDeTel(32);
    E.conv[8] = i8.id; E.conv[32] = i32.id; salvar();
    deve(await rc("nx_cv_status", { p_conversa: i32.id, p_status: "resolvida" }), "resolver 32");
    c.ok("contato 8 (vai ter a janela vencida por SQL) e contato 32 (resolvida) criados", !!i8 && !!i32);
    // recibo de um wamid que ainda NÃO existe (o SQL meta-02 cria a saída DEPOIS)
    E.wamidTardio = `wamid.META3009-${E.run}-SAIDA-TARDIA`; salvar();
    const r = await recibo(A(), [stat(E.wamidTardio, "delivered")]);
    const m = await (async () => (await itens(E.conv[1])).find(x => x.wamid === E.wamidTardio))();
    c.ok("RECIBO ANTES DA MENSAGEM EXISTIR (canal Meta): descartado — resposta 200 com recibos_ignorados:1 e nada gravado (comportamento: a Meta não reenvia)", r.status === 200 && r.json?.recibos_ignorados === 1 && !r.json?.recibos_canal && !m, r.txt.slice(0, 200));
  });
}

/* ============================================================
   FASE 2 (depois do SQL meta-02)
   ============================================================ */
async function caso_recibos(c) {
  const conv1 = E.conv[1];
  const S = k => `wamid.META3009-${E.run}-SAIDA-${k}`;
  const st = async w => (await itens(conv1)).find(m => m.wamid === w)?.status;
  const before = await mensagens(conv1);
  c.ok("o SQL criou as saídas de teste (S1, S2, S3/tardia, S4) em 'enviada'/'pendente'", ["1", "2", "TARDIA", "4"].every(k => (before.itens || []).some(m => m.wamid === S(k))), JSON.stringify(before.itens.map(m => m.wamid?.slice(-12))));
  c.igual("estado inicial: S1 enviada, S2 enviada, S4 pendente", [await st(S("1")), await st(S("2")), await st(S("4"))], ["enviada", "enviada", "pendente"]);
  // 1) sent em mensagem já enviada: ignorado
  const r0 = await recibo(A(), [stat(S("1"), "sent")]);
  c.ok("'sent' em mensagem já 'enviada' → nada muda (recibos_ignorados:1)", r0.json?.recibos_ignorados === 1 && !r0.json?.recibos_canal && (await st(S("1"))) === "enviada", r0.txt.slice(0, 200));
  // 2) delivered
  const cur0 = before.ultimo_id, agora0 = before.agora;
  const r1 = await recibo(A(), [stat(S("1"), "delivered")]);
  c.ok("'delivered' → status 'entregue' (✓✓) e recibos_canal:1", r1.json?.recibos_canal === 1 && (await st(S("1"))) === "entregue", r1.txt.slice(0, 200));
  // o delta do painel (cursor duplo) traz a mensagem com o status novo, sem recarregar a conversa
  const dl = deve(await rc("nx_cv_mensagens", { p_conversa: conv1, p_desde: agora0, p_depois_id: cur0, p_limite: 100 }), "delta");
  c.ok("delta do painel (nx_cv_mensagens com p_desde/p_depois_id) devolve a mensagem COM o status novo 'entregue'", dl.itens.some(m => m.wamid === S("1") && m.status === "entregue"), JSON.stringify(dl.itens.map(m => [m.wamid?.slice(-8), m.status])));
  // 3) read
  const r2 = await recibo(A(), [stat(S("1"), "read")]);
  c.ok("'read' → 'lida' (recibos_canal:1)", r2.json?.recibos_canal === 1 && (await st(S("1"))) === "lida");
  // 4) sem regressão
  const r3 = await recibo(A(), [stat(S("1"), "delivered")]);
  c.ok("'delivered' DEPOIS de 'read' → continua 'lida' (sem regressão)", r3.json?.recibos_ignorados === 1 && !r3.json?.recibos_canal && (await st(S("1"))) === "lida");
  const r4 = await recibo(A(), [stat(S("1"), "failed", { errors: [{ code: 131026, title: "Message undeliverable" }] })]);
  c.ok("'failed' DEPOIS de 'read' → continua 'lida' (falha tardia ignorada)", r4.json?.recibos_ignorados === 1 && (await st(S("1"))) === "lida");
  // 5) failed com código conhecido
  const r5 = await recibo(A(), [stat(S("2"), "failed", { errors: [{ code: 131026, title: "Message undeliverable" }] })]);
  const s2 = (await itens(conv1)).find(m => m.wamid === S("2"));
  c.ok("'failed' 131026 em mensagem 'enviada' → 'falhou' com o motivo legível (código + dica em português)", r5.json?.recibos_canal === 1 && s2.status === "falhou" && /131026/.test(s2.erro || "") && /não pode receber/.test(s2.erro || ""), s2.erro);
  const r6 = await recibo(A(), [stat(S("2"), "read")]);
  const s2b = (await itens(conv1)).find(m => m.wamid === S("2"));
  c.ok("recibo 'read' depois de 'falhou' (a Meta entregou mesmo assim) → vira 'lida' e o erro é limpo", r6.json?.recibos_canal === 1 && s2b.status === "lida" && s2b.erro === null, JSON.stringify([s2b.status, s2b.erro]));
  // 5b) falha 131047 (fora da janela): o motivo diz para usar modelo; o canal NÃO reenvia sozinho (só o número da Nexus faz isso)
  const r5b = await recibo(A(), [stat(S("5"), "failed", { errors: [{ code: 131047, title: "Re-engagement message" }] })]);
  const s5 = (await itens(conv1)).find(m => m.wamid === S("5"));
  c.ok("'failed' 131047 (mais de 24 h) → 'falhou' com a dica 'use um modelo aprovado' (sem reenvio automático no canal de cliente)", r5b.json?.recibos_canal === 1 && s5?.status === "falhou" && /131047/.test(s5.erro || "") && /modelo/.test(s5.erro || ""), s5?.erro);
  // 6) lote misto + id desconhecido + status inválido + sem id
  const lote = await recibo(A(), [stat(S("4"), "delivered"), stat(S("TARDIA"), "read"), stat(`wamid.META3009-${E.run}-NAO-EXISTE`, "delivered"), stat(S("1"), "deleted"), { status: "read", timestamp: agoraS() }]);
  c.ok("lote de 5 recibos → 2 aplicados (recibos_canal:2) e 3 ignorados (inexistente, status desconhecido, sem id)", lote.json?.recibos_canal === 2 && lote.json?.recibos_ignorados === 3, lote.txt.slice(0, 200));
  c.ok("o recibo que tinha sido descartado por chegar cedo demais, reenviado agora que a mensagem existe → 'lida'", (await st(S("TARDIA"))) === "lida" && (await st(S("4"))) === "entregue");
  // 7) isolamento entre canais
  const convB = E.conv[7];
  const wB = `wamid.META3009-${E.run}-SAIDA-B`;
  const stB = async () => (await itens(convB)).find(m => m.wamid === wB)?.status;
  c.ok("(pré) a saída de teste do canal B existe e está 'enviada'", (await stB()) === "enviada");
  const x1 = await recibo(A(), [stat(wB, "delivered")]);
  c.ok("recibo de mensagem do canal B chegando pela URL do canal A (pid do A) → ignorado; a mensagem do B não muda", x1.json?.recibos_ignorados === 1 && !x1.json?.recibos_canal && (await stB()) === "enviada", x1.txt.slice(0, 200));
  const x2 = await recibo(A(), [stat(wB, "read")], { pid: B().pid });
  c.ok("recibo na URL do canal A com o phone_number_id do canal B → canal_divergente:1, nada aplicado", x2.json?.canal_divergente === 1 && (await stB()) === "enviada", x2.txt.slice(0, 200));
  const x3 = await recibo(B(), [stat(wB, "delivered")]);
  c.ok("o mesmo recibo na URL CERTA (canal B) → 'entregue'", x3.json?.recibos_canal === 1 && (await stB()) === "entregue");
  const x4 = await hook(B(), envelope(valor({ pid: B().pid, statuses: [stat(wB, "read")] })), { segredo: A().secret });
  c.ok("recibo assinado com o segredo do canal A na URL do canal B → 401 e continua 'entregue'", x4.status === 401 && (await stB()) === "entregue");
}

async function caso_aba_aguardando(c) {
  const ag = deve(await listar("aguardando"), "aguardando");
  const ts = ag.itens.map(i => Date.parse(i.ultima_entrada_em));
  c.ok("aba Aguardando: ordem por quem espera há mais tempo (ultima_entrada_em crescente)", ts.length > 3 && ts.every((t, k) => k === 0 || ts[k - 1] <= t), JSON.stringify(ag.itens.slice(0, 5).map(i => i.ultima_entrada_em)));
  const conv8 = await convDeTel(8);
  c.ok("a conversa com a janela vencida (25 h) continua na aba Aguardando (janela vencida não tira da fila)", ag.itens.some(i => i.id === conv8.id), String(conv8.id));
}

async function caso_janela(c) {
  const conv1 = E.conv[1], conv8 = E.conv[8], conv32 = E.conv[32], conv7 = E.conv[7], conv27 = E.conv[27];
  // janela vencida (SQL pôs ultima_entrada_em = agora - 25 h)
  const v8 = await ver(conv8);
  const janela8 = Date.parse(v8.conversa.janela_ate);
  c.ok("contato 8: janela_ate no passado (entrada há 25 h)", janela8 < Date.now() && Date.now() - janela8 > 30 * 60_000, v8.conversa.janela_ate);
  const n8 = (await itens(conv8)).length;
  const t = await fn("nx-enviar", { acao: "texto", conversa: conv8, texto: "Olá! Posso ajudar?" });
  c.ok("TEXTO fora da janela de 24 h → HTTP 400 {ok:false, erro:'fora_da_janela'} (sem chamar a Graph)", t.status === 400 && t.json?.ok === false && t.json?.erro === "fora_da_janela" && !t.json?.mensagem, `${t.status} ${t.txt.slice(0, 200)}`);
  c.ok("...e NADA é gravado (nem mensagem 'falhou'): se a Graph tivesse sido chamada viria 'envio_falhou' com mensagem gravada", (await itens(conv8)).length === n8 && t.ms < 5000, `n=${(await itens(conv8)).length}/${n8} ms=${t.ms}`);
  const v1 = await ver(conv1);
  c.ok("contato 1 (dentro da janela): janela_ate no futuro", Date.parse(v1.conversa.janela_ate) > Date.now());
  // contato sem histórico (Nova conversa por telefone): também sem janela
  const tn = await fn("nx-enviar", { acao: "texto", conversa: conv27, texto: "Olá, tudo bem?" });
  c.ok("'Nova conversa' para número novo (sem janela) → texto livre barrado com fora_da_janela (precisa de modelo)", tn.status === 400 && tn.json?.erro === "fora_da_janela", `${tn.status} ${tn.txt.slice(0, 150)}`);
  // resolvida
  const tr = await fn("nx-enviar", { acao: "texto", conversa: conv32, texto: "oi" });
  c.ok("conversa resolvida → 400 conversa_resolvida (sem Graph)", tr.status === 400 && tr.json?.erro === "conversa_resolvida", `${tr.status} ${tr.txt.slice(0, 150)}`);
  // canal sem token
  const tb = await fn("nx-enviar", { acao: "texto", conversa: conv7, texto: "oi pelo canal B" });
  c.ok("canal SEM token (B) dentro da janela → 400 canal_sem_token (sem Graph) e nada gravado", tb.status === 400 && tb.json?.erro === "canal_sem_token" && !tb.json?.mensagem, `${tb.status} ${tb.txt.slice(0, 150)}`);
  // validações do corpo
  const v = async texto => (await fn("nx-enviar", { acao: "texto", conversa: conv1, texto })).json?.erro;
  c.igual("texto vazio, só espaços e 4.097 caracteres → dados_invalidos", [await v(""), await v("    "), await v("a".repeat(4097))], ["dados_invalidos", "dados_invalidos", "dados_invalidos"]);
  const ni = await fn("nx-enviar", { acao: "texto", conversa: 999999999, texto: "oi" });
  c.ok("conversa inexistente → 404 conversa_nao_encontrada", ni.status === 404 && ni.json?.erro === "conversa_nao_encontrada", `${ni.status} ${ni.txt.slice(0, 120)}`);
  const conv26 = E.conv["26b"];
  // (a conversa 26b está sem dono: visível ao atendente e com janela aberta — chamar o envio nela iria até a Graph; só depois de atribuída ao admin)
  const ass = deve(await rc("nx_cv_atribuir", { p_conversa: conv26, p_conta: IDS.admin }), "atribuir ao admin");
  const invis = await fn("nx-enviar", { acao: "texto", conversa: conv26, texto: "oi" }, TOK_AT);
  c.ok("conversa atribuída a colega, pedida pelo atendente (ver_todas=false) → 404 conversa_nao_encontrada, sem Graph", invis.status === 404 && invis.json?.erro === "conversa_nao_encontrada", `${invis.status} ${invis.txt.slice(0, 120)}`);
  const sem = await fn("nx-enviar", { acao: "texto", conversa: conv1, texto: "oi" }, "token-que-nao-existe");
  c.ok("token de sessão inválido → 401 sessao_invalida", sem.status === 401 && sem.json?.erro === "sessao_invalida", `${sem.status} ${sem.txt.slice(0, 120)}`);
  const ac = await fn("nx-enviar", { acao: "constructor", conversa: conv1 });
  c.ok("ação desconhecida → 400 dados_invalidos", ac.status === 400 && ac.json?.erro === "dados_invalidos");
  const cronSem = await http(`${SUPA}/functions/v1/nx-enviar`, { corpo: { fila: true }, headers: { apikey: KEY, "content-type": "application/json", "x-nx-cron": "token-falso" } });
  c.ok("modo cron do nx-enviar com token falso → 401 (o painel não alcança a fila)", cronSem.status === 401, `${cronSem.status}`);
}

async function caso_modelos(c) {
  const base = deve(await ra("nx_cv_base"), "nx_cv_base(atendente)");
  const T = base.templates || [];
  const por = (canal, nome) => T.find(t => t.canal_id === canal && t.nome === nome);
  const lembrete = por(A().id, "meta3009_lembrete"), promo = por(A().id, "meta3009_promo"), pend = por(A().id, "meta3009_pendente"), tb = por(B().id, "meta3009_b");
  E.tpl = { lembrete: lembrete?.id, promo: promo?.id, pend: pend?.id, b: tb?.id }; salvar();
  c.ok("o painel (nx_cv_base) lista os modelos por canal com status, categoria, corpo e nº de parâmetros", !!lembrete && !!promo && !!pend && !!tb && lembrete.status === "APPROVED" && lembrete.categoria === "UTILITY" && lembrete.num_parametros === 2 && promo.categoria === "MARKETING" && promo.num_parametros === 1 && pend.status === "PENDING" && /Olá \{\{1\}\}/.test(lembrete.corpo), JSON.stringify(T.map(t => [t.nome, t.status, t.categoria, t.num_parametros])));
  const conv8 = E.conv[8], conv1 = E.conv[1], conv11 = E.conv[11];
  const n8 = (await itens(conv8)).length;
  const tp = async (conversa, template_id, parametros) => fn("nx-enviar", { acao: "template", conversa, template_id, parametros });
  const r1 = await tp(conv8, lembrete.id, ["Maria"]);
  c.ok("modelo com MENOS parâmetros que o necessário ({{1}} e {{2}}; veio 1) → template_invalido, sem Graph", r1.json?.erro === "template_invalido" && r1.status === 400, `${r1.status} ${r1.txt.slice(0, 150)}`);
  const r2 = await tp(conv8, lembrete.id, ["Maria", ""]);
  c.ok("parâmetro vazio → template_invalido", r2.json?.erro === "template_invalido");
  const r3 = await tp(conv8, lembrete.id, ["Maria", "amanhã", "sobrando"]);
  c.ok("parâmetro a mais → template_invalido", r3.json?.erro === "template_invalido");
  const r4 = await tp(conv8, pend.id, []);
  c.ok("modelo PENDING (não aprovado) → template_invalido", r4.json?.erro === "template_invalido", r4.txt.slice(0, 120));
  const r5 = await tp(conv8, tb.id, []);
  c.ok("modelo do OUTRO canal (B) numa conversa do canal A → template_invalido", r5.json?.erro === "template_invalido", r5.txt.slice(0, 120));
  const r6 = await tp(conv8, "nao-e-uuid", []);
  c.ok("template_id que não é UUID → template_invalido", r6.json?.erro === "template_invalido");
  const r7 = await tp(conv8, "00000000-0000-4000-8000-000000000000", []);
  c.ok("template_id inexistente → template_invalido", r7.json?.erro === "template_invalido");
  c.ok("...nenhuma dessas tentativas gravou mensagem", (await itens(conv8)).length === n8);
  // SAIR → sem marketing automático
  const n11 = (await itens(conv11)).length;
  const r8 = await tp(conv11, promo.id, ["Maria"]);
  c.ok("contato que disse SAIR + modelo de MARKETING → template_invalido com o motivo 'pediu para não receber … marketing' (sem Graph)", r8.json?.erro === "template_invalido" && /marketing/i.test(r8.json?.detalhe || ""), `${r8.status} ${r8.txt.slice(0, 200)}`);
  c.ok("...e nada foi gravado na conversa dele", (await itens(conv11)).length === n11);
  const r9 = await fn("nx-enviar", { acao: "template", conversa: E.conv[26], template_id: E.tpl.lembrete, parametros: ["a", "b"] }, TOK_AT);
  c.ok("atendente sem acesso à conversa (resolvida/atribuída a outro) não usa modelo nela (conversa_nao_encontrada ou conversa_resolvida)", ["conversa_nao_encontrada", "conversa_resolvida"].includes(r9.json?.erro), r9.txt.slice(0, 160));
  c.nota("fila_marketing", "o pulo do item de fila de MARKETING para contato descadastrado só passa pelo modo cron do nx-enviar: provado em testes/e2e/sql/meta-03-fila-e-banco.sql (nx_disparar, sem ler o cron_token)");
}

/* ============================================================
   FASE GRAPH — no máximo 3 chamadas reais, token FALSO
   ============================================================ */
const MAX_GRAPH = 3;
function guardaGraph(nome) {
  if (E.graph.feitas.includes(nome)) throw new Error(`chamada '${nome}' já feita (limite de ${MAX_GRAPH} chamadas reais)`);
  if (E.graph.chamadas >= MAX_GRAPH) throw new Error(`limite de ${MAX_GRAPH} chamadas reais à Graph atingido`);
  E.graph.chamadas++; E.graph.feitas.push(nome); salvar();
}
async function graph1_texto(c) {
  guardaGraph("texto_dentro_da_janela");
  const conv1 = E.conv[1];
  const antes = await convDeTel(1);
  const texto = E.ola?.texto || "Olá! Aqui é a clínica.";
  const r = await fn("nx-enviar", { acao: "texto", conversa: conv1, texto });
  c.nota("resposta", limpo(r.txt).slice(0, 700));
  c.ok("envio dentro da janela chega ATÉ a Graph (token falso): HTTP 200 {ok:false, erro:'envio_falhou'} com mensagem legível", r.status === 200 && r.json?.ok === false && r.json?.erro === "envio_falhou" && !!r.json?.mensagem, `${r.status} ${limpo(r.txt).slice(0, 250)}`);
  const d = r.json?.detalhe || "";
  c.ok("o motivo é legível: 'WhatsApp não aceitou (código 190): … token vencido ou revogado — refaça em Números de WhatsApp'", /código 190/.test(d) && /token vencido ou revogado/.test(d), d);
  c.ok("o token falso NÃO aparece na resposta", !r.txt.includes(A().token) && !/EAAG3009FAKE/.test(r.txt));
  const m = r.json?.mensagem;
  c.ok("mensagem gravada como SAÍDA do painel: texto /ola expandido, status 'falhou' com o erro (o '!' na tela), enviada pelo admin, sem wamid", m?.direcao === "out" && m.tipo === "texto" && m.status === "falhou" && m.corpo === texto && m.erro === d && m.enviado_por?.id === IDS.admin && !m.wamid && m.origem === "painel", JSON.stringify(m).slice(0, 300));
  const depois = await convDeTel(1);
  c.ok("falha de envio NÃO tira a conversa de 'Aguardando' nem marca 1ª resposta (o cliente continua esperando)", depois.aguardando === true && (await ver(conv1)).conversa.primeira_resposta_em === null && depois.ultima_msg_dir === "out" && depois.ultima_msg_resumo === texto.slice(0, 140), JSON.stringify([depois.aguardando, depois.ultima_msg_dir]));
  c.ok("a mensagem com erro aparece no histórico da conversa (status falhou, erro visível)", (await itens(conv1)).some(x => x.id === m?.id && x.status === "falhou" && x.erro === d));
}
async function graph2_midia(c) {
  guardaGraph("midia_entrada_canal_com_token");
  const mid = `MID-GRAPH-${E.run}`;
  const t0 = Date.now();
  const r = await hook(A(), envelope(valor({ pid: A().pid, nome: NOME(9), wa: tel(9), messages: [{ from: tel(9), id: wamid("img"), timestamp: agoraS(), type: "image", image: { id: mid, mime_type: "image/jpeg", sha256: "abc123", caption: "Foto do dente" } }] })));
  c.ok("imagem de entrada no canal COM token → 200, mensagens:1, sem erro de gravação", r.status === 200 && r.json?.mensagens === 1 && !r.json?.erros, r.txt.slice(0, 200));
  const conv = await convDeTel(9); E.conv[9] = conv.id; salvar();
  const vis = [];
  const fim = await (async () => { for (let k = 0; k < 20; k++) { const m = (await itens(conv.id))[0]; vis.push(m.midia?.estado); if (!["baixando"].includes(m.midia?.estado)) return m; await sleep(1500); } return (await itens(conv.id))[0]; })();
  c.nota("estados_vistos", [...new Set(vis)]);
  c.nota("tempo_ate_resolver_ms", Date.now() - t0);
  c.ok("a mensagem (imagem + legenda) é gravada na hora e o registro de mídia nasce com media_id, mime e estado", fim.tipo === "imagem" && fim.corpo === "Foto do dente" && fim.midia?.media_id === mid && fim.midia?.mime === "image/jpeg" && fim.direcao === "in" && fim.status === "recebida", JSON.stringify(fim.midia));
  c.ok("o download em segundo plano chama a Graph (token falso) e termina em estado 'falhou' COM motivo legível (código 190, token vencido ou revogado), sem path", fim.midia?.estado === "falhou" && /190/.test(fim.midia?.erro || "") && /token vencido/.test(fim.midia?.erro || "") && !fim.midia?.path, JSON.stringify(fim.midia));
  c.ok("o token falso não vaza no registro da mídia", !JSON.stringify(fim).includes(A().token));
  c.ok("a conversa já está na lista (resumo 'Foto: Foto do dente'), com 1 não lida", conv.ultima_msg_resumo === "Foto: Foto do dente" && conv.nao_lidas === 1, `${conv.ultima_msg_resumo} ${conv.nao_lidas}`);
}
async function graph3_modelo(c) {
  guardaGraph("modelo_fora_da_janela");
  const conv8 = E.conv[8];
  const r = await fn("nx-enviar", { acao: "template", conversa: conv8, template_id: E.tpl.lembrete, parametros: ["Maria", "amanhã às 10h"] });
  c.nota("resposta", limpo(r.txt).slice(0, 700));
  c.ok("MODELO aprovado fora da janela segue o caminho de template até a Graph (token falso): 200 {ok:false, erro:'envio_falhou'} com a mensagem gravada", r.status === 200 && r.json?.erro === "envio_falhou" && !!r.json?.mensagem, `${r.status} ${limpo(r.txt).slice(0, 250)}`);
  const m = r.json?.mensagem;
  c.ok("mensagem gravada: tipo 'template', corpo com os parâmetros aplicados, status 'falhou' e o erro 190 legível", m?.tipo === "template" && m.corpo === "Olá Maria, sua consulta é amanhã às 10h." && m.status === "falhou" && /código 190/.test(m.erro || "") && /token vencido/.test(m.erro || ""), JSON.stringify(m).slice(0, 300));
  c.ok("...guardando o modelo usado (nome, idioma, categoria, parâmetros)", m?.template?.nome === "meta3009_lembrete" && m.template.idioma === "pt_BR" && m.template.categoria === "UTILITY" && JSON.stringify(m.template.parametros) === JSON.stringify(["Maria", "amanhã às 10h"]), JSON.stringify(m?.template));
  c.ok("o token falso não vaza na resposta", !r.txt.includes(A().token));
  const cv = await convDeTel(8);
  c.ok("falha do modelo não tira a conversa de 'Aguardando'", cv.aguardando === true);
}
async function fase_graph() {
  await caso("graph1", "Texto dentro da janela (Graph com token falso) com a resposta /ola", graph1_texto);
  await caso("graph2", "Mídia de entrada no canal com token (download na Graph com token falso)", graph2_midia);
  await caso("graph3", "Modelo aprovado fora da janela (Graph com token falso)", graph3_modelo);
  log(`chamadas reais à Graph nesta rodada: ${E.graph.chamadas} (limite ${MAX_GRAPH}): ${E.graph.feitas.join(", ")}`);
}

/* ============================================================
   LIMPAR (API): os canais e os segredos do Vault. O resto sai com meta-04-limpeza.sql
   ============================================================ */
async function limpar() {
  for (const k of ["A", "B"]) {
    const ca = E.canais[k];
    if (!ca?.id) continue;
    const r = await rc("nx_canal_excluir", { p_id: ca.id, p_confirmacao: "excluir" });
    log(`canal ${k}: ${r.ok ? "excluído (segredos do Vault apagados)" : `erro ${r.codigo}`}`);
    if (r.ok || r.codigo === "canal_nao_encontrado") { ca.excluido = true; salvar(); }
  }
  const l = await rc("nx_canais_listar");
  log(`canais restantes do cliente de teste: ${l.ok ? l.dados.length : l.codigo}`);
  // a URL e o verify token dos canais excluídos não valem mais
  for (const k of ["A", "B"]) {
    const ca = E.canais[k];
    if (!ca?.chave) continue;
    const raw = JSON.stringify(envelope(valor({ pid: ca.pid, nome: "x", wa: tel(99), messages: [mTexto(tel(99), "depois de excluir")] })));
    const p = await http(`${URL_WA}?c=${ca.chave}`, { raw, headers: { "content-type": "application/json", "x-hub-signature-256": assinar(raw, ca.secret) } });
    const g = await http(`${URL_WA}?c=${ca.chave}&hub.mode=subscribe&hub.verify_token=${ca.vt}&hub.challenge=x`, { metodo: "GET" });
    log(`canal ${k} excluído: POST assinado na URL antiga → ${p.status} (${p.txt.slice(0, 40)}) · GET de verificação → ${g.status}`);
    RES.casos.push({ id: `pos-exclusao-${k}`, nome: "URL do canal excluído deixa de valer", ok: p.status === 401 && g.status === 403, asserts: 2, falhas: [], info: { post: p.status, get: g.status } });
  }
}

/* ------------------------------------------------------------ principal */
async function main() {
  log(`META-3009 E2E · fase=${FASE} · run=${E.run} · cliente=${CLI.slice(0, 8)}…`);
  try {
    if (FASE === "1") await fase1();
    else if (FASE === "2") {
      await caso("recibos", "Recibos sent/delivered/read/failed do canal Meta", caso_recibos);
      await caso("aba", "Aba Aguardando ordenada pela espera", caso_aba_aguardando);
      await caso("janela", "Janela de 24 h e recusas que não chegam à Graph", caso_janela);
      await caso("modelos", "Modelos (template): validações e SAIR sem marketing", caso_modelos);
    } else if (FASE === "graph") await fase_graph();
    else if (FASE === "limpar") { /* no finally */ }
    else throw new Error(`fase desconhecida: ${FASE}`);
  } finally {
    if (FASE === "limpar") await limpar();
    RES.fim = new Date().toISOString();
    RES.graph = E.graph;
    E.resultados[FASE] = { casos: RES.casos.map(x => ({ id: x.id, ok: x.ok, asserts: x.asserts, falhas: x.falhas, fatal: x.fatal })), semProva: RES.semProva };
    salvar();
    fs.writeFileSync(path.join(DIR, `resultado-${FASE}.json`), limpo(JSON.stringify(RES, null, 1)));
    const tot = RES.casos.reduce((a, x) => a + x.asserts, 0), ruins = RES.casos.filter(x => !x.ok);
    log(`--- fase ${FASE}: ${RES.casos.length - ruins.length}/${RES.casos.length} casos ok · ${tot} asserções · falhas em: ${ruins.map(x => x.id).join(", ") || "nenhuma"}`);
    process.exitCode = ruins.length ? 1 : 0;
  }
}
main().catch(e => { console.error(limpo(e?.stack || e)); process.exitCode = 2; });
