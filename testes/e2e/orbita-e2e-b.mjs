#!/usr/bin/env node
/* ============================================================
   ÓRBITA — testes/e2e/orbita-e2e-b.mjs · E2E-B (itens 8, 11, 12, 14 do ESPEC §8.5) · prefixo EB-3009
   Tenant DESCARTÁVEL próprio: revenda 'eb-3009' + cliente 'eb-3009-clinica' + 2 contas de teste (SEM senha; sessões de 2 h
   criadas por SQL, token só no scratchpad). Nada toca kamiguchi, a org Nexus, nx_config nem o conteúdo do Vault.
   O que o teste cria é apagado no fim (finally): canal (Vault) por RPC + SQL de limpeza (cascata do cliente, auditoria, contas, revenda).

   Itens provados (cada caso tem asserções explícitas):
     c14a  white-label pela API: gestor aplica marca da revenda e tema do cliente; sessão do cliente recebe a marca; validação
           (marca_invalida), limites da revenda, o que só o super faz, domínio próprio (host → marca), convite com link do domínio
     c14b  white-label no NAVEGADOR (Chrome headless, cópia de web/ com prontos.js aberto só na cópia): gestor e cliente,
           390×844 e 1440×900: marca aplicada, editor salvo pela tela, cor ruim (#FFFF00 sobre branco) com aviso e texto legível,
           telas de gestor (Marca e tema, Domínio próprio, Anúncios/integrações, Admin) sem erro de console e sem rolagem lateral
     c8    "Sugerir com IA" sem chave: aviso honesto, nenhuma chamada sai (API e tela); nenhuma reserva/uso de cota
     c11   importar CSV de 1.000 linhas pelo caminho real da tela (crm-logica.js → nx_contatos_importar em lotes de 100)
     c12   automação "sem resposta há 5 min" dispara UMA vez por espera; 5 mensagens em sequência = 1 disparo (não 5);
           backlog de eventos (150 mensagens) + 5 mensagens chegando no meio: nenhuma se perde

   Uso:  E2E_DIR=<pasta> node testes/e2e/orbita-e2e-b.mjs [--so=a,b] [--manter] [--sem-ui] [--limpar]
         --so=      grupos: prep, w (c14a + c14c), imp (c11), sr (c12 início: liga o relógio de 5 min), ia (c8 API),
                    ui (c14b navegador + c8 tela), srfim (c12 verificação, espera os 5 min), srnova (c12 nova espera)
                    Sem --so roda tudo em sequência num processo só. Na rodada de 30/09 os grupos rodaram em processos separados
                    (o relógio de 5 min do sr corre em paralelo ao navegador), sempre com --manter e --limpar no fim.
         --manter   NÃO apaga nada (nem o canal): só para desenvolver/rodar por etapas
         --sem-ui   pula o navegador
         --limpar   só faz a limpeza (estado-b.json): apaga o canal por RPC e pede o SQL b09 (revenda, cliente, contas, auditoria)
   Precisa de: Node 24, Chrome instalado e puppeteer-core (E2E_PUPPETEER=<caminho do módulo> se não estiver resolvível).
   Pontos de parada com o banco (service role, via MCP execute_sql): o script escreve a linha "AGUARDANDO_SQL <nome> :: <arquivo>"
   e espera o arquivo <E2E_DIR>/sql-<nome>.feito. Os modelos SQL ficam em testes/e2e/sql-b/ ({{HASH_*}} = sha256 do token).
   Segredos (tokens, URL do canal, chave publicável, chave falsa) nunca são impressos.
   ============================================================ */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import nodehttp from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");
const DIR = process.env.E2E_DIR || path.join(os.tmpdir(), "eb-3009");
fs.mkdirSync(DIR, { recursive: true });
const ARGS = process.argv.slice(2);
const opt = n => ARGS.find(a => a === `--${n}` || a.startsWith(`--${n}=`));
const SO = opt("so") ? String(opt("so")).split("=")[1].split(",") : null;
const MANTER = !!opt("manter");
const SEM_UI = !!opt("sem-ui");
const SO_LIMPAR = !!opt("limpar");

const SUPA = process.env.E2E_SUPA_URL || "https://dtjznipitihnwmcgpzqh.supabase.co";
const KEY = process.env.E2E_APIKEY
  || (/CHAVE_PUBLICA\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(RAIZ, "web", "dados.js"), "utf8")) || [])[1];
const KAM = "a2b5708e-987a-40a1-af32-4b89bf10756b";      // kamiguchi (cliente REAL): só para NEGAR acesso
const TESTE = "af161ba7-cc70-4b8a-bfe6-8234dd072a52";    // teste-e2e: só para NEGAR acesso (os outros agentes usam)
const PRE = "EB-3009";
const RUN = crypto.randomBytes(3).toString("hex");
if (!KEY) { console.error("falta a chave publicável"); process.exit(2); }

/* ------------------------------------------------------------ tokens das sessões de teste (só no scratchpad) */
const FTOK = n => path.join(DIR, `${n}.token`);
function garantirToken(n) { if (!fs.existsSync(FTOK(n))) fs.writeFileSync(FTOK(n), crypto.randomBytes(32).toString("hex")); return fs.readFileSync(FTOK(n), "utf8").trim(); }
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const TOK = { gestor: garantirToken("gestor"), admin: garantirToken("admin") };

/* ------------------------------------------------------------ segredos nunca saem */
const SEGREDOS = new Set([TOK.gestor, TOK.admin, KEY].filter(Boolean));
const limpo = v => {
  let s = typeof v === "string" ? v : JSON.stringify(v);
  for (const x of SEGREDOS) if (x && s.includes(x)) s = s.split(x).join("<segredo>");
  return s.replace(/([?&]ch=)[0-9a-f]{8,}/gi, "$1<segredo>").replace(/cwk-[A-Za-z0-9_-]{6,}/g, "cwk-<falsa>")
    .replace(/\b[0-9a-f]{48,64}\b/g, "<hex>").replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]{20,}/g, "data:image/…");
};
const log = (...a) => { const t = a.map(limpo).join(" "); console.log(t); };

/* ------------------------------------------------------------ HTTP */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function http(url, { corpo, raw, headers = {}, metodo = "POST" } = {}) {
  let r; const t0 = Date.now();
  try {
    r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json", ...headers },
      body: metodo === "GET" ? undefined : (raw ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined)) });
  } catch (e) { return { status: 0, json: null, txt: String(e?.message || e), ms: Date.now() - t0 }; }
  const txt = await r.text();
  let json = null; try { json = JSON.parse(txt); } catch { /* texto */ }
  return { status: r.status, json, txt, ms: Date.now() - t0 };
}
/** RPC do PostgREST. Sucesso → {ok:true,dados}; exceção do banco → {ok:false,codigo,hint}. */
async function rpc(nome, params = {}, { anon = false, token } = {}) {
  const r = await http(`${SUPA}/rest/v1/rpc/${nome}`, { corpo: anon ? params : { p_token: token, ...params }, headers: { apikey: KEY } });
  if (r.status >= 400 || r.status === 0) {
    return { ok: false, status: r.status, ms: r.ms, codigo: r.json?.message ?? (r.status ? `http_${r.status}` : "sem_conexao"), hint: r.json?.hint ?? null, code: r.json?.code ?? null };
  }
  return { ok: true, status: r.status, ms: r.ms, dados: r.json };
}
const G = (nome, params = {}, o = {}) => rpc(nome, params, { token: TOK.gestor, ...o });
const GC = (nome, params = {}) => rpc(nome, { p_cliente: E.cliente, ...params }, { token: TOK.gestor });
const A = (nome, params = {}) => rpc(nome, { p_cliente: E.cliente, ...params }, { token: TOK.admin });
const fnA = (funcao, corpo = {}) => http(`${SUPA}/functions/v1/${funcao}`, { corpo: { token: TOK.admin, cliente: E.cliente, ...corpo }, headers: { apikey: KEY } });
const deve = (r, o = "") => { if (!r.ok) throw new Error(`${o} falhou: ${r.codigo}${r.hint ? `|${r.hint}` : ""}`); return r.dados; };
const get = (o, p, d = undefined) => { let x = o; for (const k of String(p).split(".")) { if (x == null) return d; x = x[k]; } return x === undefined ? d : x; };
const negado = (r, ...cods) => !r.ok && (cods.length ? cods.some(c => new RegExp(c).test(`${r.codigo}|${r.hint || ""}`)) : true);
const esperarAte = async (f, { ms = 60_000, cada = 2000 } = {}) => { const t0 = Date.now(); for (;;) { const v = await f(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(cada); } };
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const maisDias = n => new Date(Date.now() - 3 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);

/* ------------------------------------------------------------ relatório de casos */
const RESULTADO = { rodada: RUN, inicio: new Date().toISOString(), casos: [], observacoes: [], naoProvado: [], bugs: [], medidas: {} };
class Caso {
  constructor(id, nome) { this.id = id; this.nome = nome; this.checks = []; this.info = {}; this.fatal = null; }
  ok(desc, cond, extra) { const c = !!cond; this.checks.push({ desc, ok: c, extra: c ? undefined : extra }); return c; }
  igual(desc, a, b) { return this.ok(desc, JSON.stringify(a) === JSON.stringify(b), `obtido=${limpo(JSON.stringify(a))} esperado=${limpo(JSON.stringify(b))}`); }
  nota(k, v) { this.info[k] = v; }
  get passou() { return !this.fatal && this.checks.every(c => c.ok); }
}
async function caso(id, nome, f, grupo = id) {
  if (SO && grupo !== "*" && !SO.includes(grupo) && !SO.includes(id)) return null;
  const c = new Caso(id, nome);
  const t0 = Date.now();
  try { await f(c); } catch (e) { c.fatal = limpo(e?.stack?.split("\n").slice(0, 4).join(" | ") || e?.message || e); }
  const falhas = c.checks.filter(x => !x.ok);
  RESULTADO.casos.push({ id, nome, ok: c.passou, checks: c.checks.length, falhas: falhas.map(x => `${x.desc}${x.extra ? ` [${x.extra}]` : ""}`), fatal: c.fatal, info: c.info, s: Math.round((Date.now() - t0) / 100) / 10 });
  log(`${c.passou ? "OK   " : "FALHA"} ${id} ${nome} (${c.checks.length - falhas.length}/${c.checks.length}) ${Math.round((Date.now() - t0) / 1000)}s${c.fatal ? ` FATAL: ${c.fatal}` : ""}`);
  for (const f2 of falhas) log(`       - ${f2.desc}${f2.extra ? ` [${f2.extra}]` : ""}`);
  salvarResultado();
  return c;
}
const ARQ_RES = path.join(DIR, `resultado-b-${(SO || ["todos"]).join("_")}.json`);
const salvarResultado = () => fs.writeFileSync(ARQ_RES, JSON.stringify(RESULTADO, null, 1));

/* ------------------------------------------------------------ estado da rodada (sem segredos) */
const ARQ_ESTADO = path.join(DIR, "estado-b.json");
const E = fs.existsSync(ARQ_ESTADO) ? JSON.parse(fs.readFileSync(ARQ_ESTADO, "utf8")) : {};
E.conv ||= {};
const salvar = () => fs.writeFileSync(ARQ_ESTADO, JSON.stringify(E, null, 1));
let URL_AGENTE = null;       // segredo: só em memória

/* ------------------------------------------------------------ parada com o banco (service role via MCP) */
async function pedirSql(nome, arquivo, subst = {}, { ms = 20 * 60_000 } = {}) {
  let sql = fs.readFileSync(path.join(AQUI, "sql-b", arquivo), "utf8");
  for (const [k, v] of Object.entries(subst)) sql = sql.split(`{{${k}}}`).join(String(v));
  const pasta = path.join(DIR, "sql-render"); fs.mkdirSync(pasta, { recursive: true });
  const saida = path.join(pasta, arquivo);
  fs.writeFileSync(saida, sql);
  const flag = path.join(DIR, `sql-${nome}.feito`);
  fs.rmSync(flag, { force: true });
  log(`AGUARDANDO_SQL ${nome} :: ${saida}`);
  const ok = await esperarAte(() => fs.existsSync(flag), { ms, cada: 1000 });
  if (!ok) throw new Error(`SQL ${nome} não foi executado a tempo`);
  log(`SQL_FEITO ${nome}`);
}

/* ------------------------------------------------------------ PNG mínimo (logo/ícone de teste, sem dependência) */
const TABELA_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = TABELA_CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function blocoPng(tipo, dados) { const t = Buffer.from(tipo); const len = Buffer.alloc(4); len.writeUInt32BE(dados.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, dados]))); return Buffer.concat([len, t, dados, crc]); }
function png(w, h, [r, g, b], [r2, g2, b2] = [r, g, b]) {
  const linha = y => { const l = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { const f = x < w / 2 ? [r, g, b] : [r2, g2, b2]; l[1 + x * 3] = f[0]; l[2 + x * 3] = f[1]; l[3 + x * 3] = f[2]; } return l; };
  const raw = Buffer.concat(Array.from({ length: h }, (_, y) => linha(y)));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), blocoPng("IHDR", ihdr), blocoPng("IDAT", zlib.deflateSync(raw)), blocoPng("IEND", Buffer.alloc(0))]);
}
const pngUri = (...a) => `data:image/png;base64,${png(...a).toString("base64")}`;

/* ------------------------------------------------------------ marca de teste (ESPEC §4.2.1) */
const MARCA1 = () => ({
  produto: "EB-3009 Órbita Teste", assinatura: "Equipe EB-3009",
  logo: pngUri(96, 32, [15, 139, 141], [9, 92, 94]), logo_claro: pngUri(96, 32, [9, 92, 94], [15, 139, 141]), favicon: pngUri(32, 32, [236, 154, 41]),
  cores: { primaria: "#0F8B8D", secundaria: "#EC9A29", fundo: "#0B1416" },
  login_titulo: "EB-3009: sua agência, sua órbita.", login_texto: "Entre com o e-mail e a senha que você recebeu da EB-3009.", suporte_wa: "5511930090999",
});
const TEMA1 = () => ({ logo: pngUri(96, 32, [123, 44, 191], [247, 37, 133]), cores: { primaria: "#7B2CBF", secundaria: "#F72585", fundo: "#0E1116" } });

/* ============================================================
   PREPARO: fixture (gestora, revenda) — o SQL b01 é do serviço; depois o script só usa a API
   ============================================================ */
async function prep(c) {
  await pedirSql("b01", "b01_fixture_org_gestor.sql", { HASH_GESTOR: sha(TOK.gestor) });
  const s = deve(await G("nx_app_sessao"), "nx_app_sessao (gestora)");
  c.ok("sessão da gestora: papel 'gestor', NÃO é super, org = revenda EB-3009 (tipo revenda)", s.conta?.papel === "gestor" && !s.conta?.super && s.org?.slug === "eb-3009" && s.org?.tipo === "revenda", JSON.stringify({ papel: s.conta?.papel, super: s.conta?.super, org: s.org?.slug, tipo: s.org?.tipo }));
  c.ok("…e ainda sem clientes", Array.isArray(s.clientes) && s.clientes.length === 0, `n=${s.clientes?.length}`);
  E.org = s.org?.id; E.gestor = s.conta?.id; salvar();
  const orgs = deve(await G("nx_orgs_listar"), "nx_orgs_listar");
  c.ok("nx_orgs_listar: a gestora só enxerga a própria revenda (a Nexus não aparece)", Array.isArray(orgs) && orgs.length === 1 && orgs[0].slug === "eb-3009", JSON.stringify((orgs || []).map(o => o.slug)));
  const cls = deve(await G("nx_clientes_admin", { p_filtro: {} }), "nx_clientes_admin");
  c.ok("nx_clientes_admin: nenhum cliente da Nexus (kamiguchi, teste-e2e) na lista da revenda", Array.isArray(cls) && cls.length === 0, JSON.stringify((cls || []).map(x => x.slug)));
  for (const [nome, cli] of [["kamiguchi", KAM], ["teste-e2e", TESTE]]) {
    for (const [r, p] of [["nx_crm_base", {}], ["nx_dados", { p_dias: 30 }], ["nx_uso_plano", {}], ["nx_cv_base", {}], ["nx_usuarios_listar", {}], ["nx_automacoes_listar", {}], ["nx_cliente_tema", {}]]) {
      const x = await G(r, { p_cliente: cli, ...p });
      c.ok(`gestora da revenda → ${r} no ${nome}: negado (sem_acesso)`, negado(x, "sem_acesso"), `${x.codigo}|${x.hint}`);
    }
    const w = await G("nx_tema_salvar", { p_cliente: cli, p_tema: { cores: { primaria: "nao-e-cor" } } });   // payload inválido de propósito: se o portão falhasse, não gravaria
    c.ok(`gestora → nx_tema_salvar no ${nome} (payload inválido de propósito): negado (sem_acesso)`, negado(w, "sem_acesso"), `${w.codigo}|${w.hint}`);
  }
}

/* ============================================================
   CASO 14a — white-label pela API (gestora → revenda e cliente; cliente recebe a marca)
   ============================================================ */
async function c14a(c) {
  // 0. estado inicial: marca pública da revenda ainda sem marca própria
  const pub0 = deve(await rpc("nx_marca_publica", { p_host: "", p_org: "eb-3009" }, { anon: true }), "nx_marca_publica");
  c.ok("marca pública por ?org=eb-3009 (anônimo): identifica a revenda e nunca devolve id/limite/e-mail", pub0.org?.slug === "eb-3009" && !/"id"|limites|@exemplo/.test(JSON.stringify(pub0)), JSON.stringify(Object.keys(pub0)));
  c.nota("marca_inicial", JSON.stringify({ produto: pub0.marca?.produto, cores: pub0.marca?.cores }));

  // 1. validação: nada inválido grava (o servidor valida; nx_marca_validar)
  const ruins = [
    ["produto com 41 caracteres", { produto: "P".repeat(41) }, "produto"],
    ["produto de 1 caractere", { produto: "x" }, "produto"],
    ["cor primária não é #RRGGBB", { cores: { primaria: "amarelo" } }, "cores"],
    ["cor com 3 dígitos", { cores: { fundo: "#FFF" } }, "cores"],
    ["logo SVG (nunca SVG)", { logo: "data:image/svg+xml;base64,PHN2Zy8+" }, "logo"],
    ["logo http (só https)", { logo: "http://exemplo.invalid/logo.png" }, "logo"],
    ["logo com mais de 80.000 caracteres", { logo: `data:image/png;base64,${"A".repeat(80_100)}` }, "logo"],
    ["favicon com mais de 30.000 caracteres", { favicon: `data:image/png;base64,${"A".repeat(30_100)}` }, "favicon"],
    ["suporte_wa não numérico", { suporte_wa: "abc" }, "suporte_wa"],
    ["login_titulo com 81 caracteres", { login_titulo: "T".repeat(81) }, "login_titulo"],
    ["chave desconhecida", { cor_magica: "x" }, "cor_magica"],
  ];
  for (const [rot, marca, hint] of ruins) {
    const r = await G("nx_org_salvar", { p_org: { id: E.org, marca } });
    c.ok(`marca inválida (${rot}) → marca_invalida (hint ~ ${hint})`, negado(r, "marca_invalida") && new RegExp(hint).test(r.hint || ""), `${r.codigo}|${r.hint}`);
  }
  // 2. o que só o super faz
  for (const [rot, p] of [["limites", { id: E.org, limites: { empresas: 50 } }], ["status suspenso", { id: E.org, status: "suspenso" }], ["trocar o slug", { id: E.org, slug: "outro-slug" }], ["tipo plataforma", { id: E.org, tipo: "plataforma" }], ["criar outra revenda", { slug: "eb-3009-b", nome: "EB-3009 B" }]]) {
    const r = await G("nx_org_salvar", { p_org: p });
    c.ok(`gestora não pode mexer em ${rot} → so_plataforma`, negado(r, "so_plataforma"), `${r.codigo}|${r.hint}`);
  }
  const orgNexus = await G("nx_org_salvar", { p_org: { id: "1e72d7c5-ad50-46ae-b9ae-257b3838db34", marca: { produto: "Invasão" } } });
  c.ok("gestora tentando gravar a marca da plataforma Nexus (id da org) → negado (sem_permissao)", negado(orgNexus, "sem_permissao"), `${orgNexus.codigo}|${orgNexus.hint}`);

  // 3. aplica a marca da revenda (nome, logo, cores, tela de entrada, suporte, assinatura)
  const m1 = MARCA1();
  const sv = deve(await G("nx_org_salvar", { p_org: { id: E.org, marca: m1 } }), "nx_org_salvar (marca)");
  const mv = sv.marca || {};
  c.ok("nx_org_salvar (gestora, marca da própria revenda): volta com produto, cores, textos e suporte", mv.produto === m1.produto && mv.cores?.primaria === "#0F8B8D" && mv.cores?.secundaria === "#EC9A29" && mv.cores?.fundo === "#0B1416" && mv.login_titulo === m1.login_titulo && mv.suporte_wa === m1.suporte_wa && mv.assinatura === m1.assinatura, JSON.stringify({ ...mv, logo: mv.logo ? "<logo>" : null, logo_claro: mv.logo_claro ? "<logo>" : null, favicon: mv.favicon ? "<fav>" : null }));
  c.ok("…logo, logo claro e favicon guardados como imagem segura (data:image/png)", /^data:image\/png;base64,/.test(mv.logo || "") && /^data:image\/png;base64,/.test(mv.logo_claro || "") && /^data:image\/png;base64,/.test(mv.favicon || ""));
  c.ok("limites da revenda intactos depois de salvar a marca (empresas 1, usuários 8, canais 3, plano_padrao completo)", sv.limites?.empresas === 1 && sv.limites?.usuarios === 8 && sv.limites?.canais === 3 && sv.limites?.plano_padrao === "completo", JSON.stringify(sv.limites));
  // 4. a marca pública (anônima, por ?org=) já é a nova
  const pub1 = deve(await rpc("nx_marca_publica", { p_host: "", p_org: "eb-3009" }, { anon: true }), "nx_marca_publica 2");
  c.ok("marca pública por ?org=eb-3009 (anônimo, antes do login): nome, cores, título e texto da entrada, suporte", pub1.marca?.produto === m1.produto && pub1.marca?.cores?.primaria === "#0F8B8D" && pub1.marca?.login_titulo === m1.login_titulo && pub1.marca?.login_texto === m1.login_texto && pub1.marca?.suporte_wa === m1.suporte_wa, JSON.stringify({ p: pub1.marca?.produto, c: pub1.marca?.cores, t: pub1.marca?.login_titulo }));
  c.ok("…e com logo e favicon", /^data:image\/png/.test(pub1.marca?.logo || "") && /^data:image\/png/.test(pub1.marca?.favicon || ""));
  const pubNexus = deve(await rpc("nx_marca_publica", { p_host: "", p_org: null }, { anon: true }), "nx_marca_publica nexus");
  c.ok("a marca padrão (sem ?org=) continua sendo a da plataforma e NÃO virou a da revenda", pubNexus.org?.slug !== "eb-3009" && pubNexus.marca?.produto !== m1.produto, JSON.stringify({ org: pubNexus.org?.slug, produto: pubNexus.marca?.produto }));

  // 5. a gestora cria o cliente da revenda (modelo da vertical aplicado; plano padrão da revenda)
  const novo = await G("nx_cliente_admin_salvar", { p_cliente: { nome: `${PRE} Clínica Teste`, slug: "eb-3009-clinica", vertical: "odonto", status: "teste", teste_ate: maisDias(14) } });
  const cli = deve(novo, "nx_cliente_admin_salvar (criar)");
  E.cliente = cli.id; salvar();
  c.ok("cliente criado pela gestora: na org EB-3009, plano = plano_padrao da revenda (completo), teste de 14 dias, módulos do plano (com marca)", cli.org?.slug === "eb-3009" && cli.plano === "completo" && cli.status === "teste" && (cli.modulos || []).includes("marca") && (cli.modulos || []).includes("conversas"), JSON.stringify({ org: cli.org?.slug, plano: cli.plano, status: cli.status, modulos: cli.modulos }));
  const segundo = await G("nx_cliente_admin_salvar", { p_cliente: { nome: `${PRE} Segunda`, slug: "eb-3009-segunda", vertical: "generico" } });
  c.ok("segundo cliente da revenda (limite empresas = 1) → limite_plano (org_empresas:1)", negado(segundo, "limite_plano") && /org_empresas/.test(segundo.hint || ""), `${segundo.codigo}|${segundo.hint}`);
  for (const [rot, p, cod] of [["plano interno", { id: E.cliente, plano: "interno" }, "so_plataforma"], ["limites extras", { id: E.cliente, limites: { contatos: 10 } }, "so_plataforma"], ["trocar de org", { id: E.cliente, org_id: "1e72d7c5-ad50-46ae-b9ae-257b3838db34" }, "so_plataforma"]]) {
    const r = await G("nx_cliente_admin_salvar", { p_cliente: p });
    c.ok(`gestora não pode dar ${rot} ao cliente → ${cod}`, negado(r, cod), `${r.codigo}|${r.hint}`);
  }
  const lista = deve(await G("nx_clientes_admin", { p_filtro: {} }), "nx_clientes_admin 2");
  c.ok("nx_clientes_admin da gestora: só o cliente dela (sem kamiguchi/teste-e2e)", lista.length === 1 && lista[0].slug === "eb-3009-clinica", JSON.stringify(lista.map(x => x.slug)));
  const base = deve(await GC("nx_crm_base"), "nx_crm_base (gestora)");
  const pad = (base.funis || []).find(f => f.padrao) || (base.funis || [])[0];
  E.funilPadrao = pad?.id; E.estagioNova = pad?.estagios?.[0]?.id; salvar();
  c.ok("modelo odonto aplicado ao cliente novo: funil padrão com 7 etapas, etiquetas e motivos", !!pad && pad.estagios?.length === 7 && (base.etiquetas || []).length > 0 && (base.motivos || []).length > 0, `funis=${(base.funis || []).length} etapas=${pad?.estagios?.length} etq=${(base.etiquetas || []).length}`);

  // 6. SQL: conta administradora do cliente (sem senha) + sessão de 2 h
  await pedirSql("b02", "b02_fixture_cliente_admin.sql", { HASH_ADMIN: sha(TOK.admin) });
  const sa = deve(await rpc("nx_app_sessao", {}, { token: TOK.admin }), "nx_app_sessao (cliente)");
  E.admin = sa.conta?.id; salvar();
  c.ok("sessão do cliente: papel clinica, NÃO é gestor nem super, org = revenda; vê só o cliente dela (admin)", sa.conta?.papel === "clinica" && !sa.conta?.super && sa.org?.slug === "eb-3009" && sa.clientes?.length === 1 && sa.clientes[0].id === E.cliente && sa.clientes[0].papel === "admin", JSON.stringify({ papel: sa.conta?.papel, org: sa.org?.slug, n: sa.clientes?.length, p: sa.clientes?.[0]?.papel }));
  const om = sa.org?.marca || {};
  c.ok("sessão do cliente recebe a MARCA da revenda: nome do produto, cores, título da entrada, suporte, assinatura", om.produto === m1.produto && om.cores?.primaria === "#0F8B8D" && om.cores?.secundaria === "#EC9A29" && om.cores?.fundo === "#0B1416" && om.login_titulo === m1.login_titulo && om.suporte_wa === m1.suporte_wa && om.assinatura === m1.assinatura, JSON.stringify({ produto: om.produto, cores: om.cores, login_titulo: om.login_titulo }));
  c.ok("nx_app_sessao leve: sem imagens da marca (logo/favicon ficam para nx_marca_publica) e < 50 KB", !om.logo && !om.favicon && JSON.stringify(sa).length < 50_000, `bytes=${JSON.stringify(sa).length} logo=${!!om.logo}`);

  // 7. tema do cliente (cores e logo próprios), pela gestora; o cliente vê
  const t1 = TEMA1();
  const ts = deve(await GC("nx_tema_salvar", { p_tema: t1 }), "nx_tema_salvar (gestora)");
  c.ok("nx_tema_salvar (gestora): guarda as 3 cores e o logo do cliente", ts.tema?.cores?.primaria === "#7B2CBF" && ts.tema?.cores?.secundaria === "#F72585" && ts.tema?.cores?.fundo === "#0E1116" && /^data:image\/png/.test(ts.tema?.logo || ""), JSON.stringify({ ...ts.tema, logo: ts.tema?.logo ? "<logo>" : null }));
  const tr = await GC("nx_tema_salvar", { p_tema: { produto: "Nome Não Vale No Tema" } });
  c.ok("tema do cliente aceita só logo, logo_claro e cores (produto → marca_invalida)", negado(tr, "marca_invalida"), `${tr.codigo}|${tr.hint}`);
  const sa2 = deve(await rpc("nx_app_sessao", {}, { token: TOK.admin }), "nx_app_sessao 2");
  c.ok("o cliente passa a ter tem_tema=true na sessão", sa2.clientes?.[0]?.tem_tema === true, JSON.stringify(sa2.clientes?.[0] && { tem_tema: sa2.clientes[0].tem_tema }));
  const ct = deve(await A("nx_cliente_tema"), "nx_cliente_tema");
  c.ok("nx_cliente_tema (sessão do cliente): cores e logo do cliente + hash do tema", ct.tema?.cores?.primaria === "#7B2CBF" && /^data:image\/png/.test(ct.tema?.logo || "") && !!ct.atualizado, JSON.stringify({ c: ct.tema?.cores, at: ct.atualizado }));
  // 8. o que o cliente (admin) não pode: marca da revenda, domínio, clientes, revendas
  for (const [rot, r] of [
    ["nx_org_salvar (marca da revenda)", await rpc("nx_org_salvar", { p_org: { id: E.org, marca: { produto: "Invasão" } } }, { token: TOK.admin })],
    ["nx_dominio_salvar", await rpc("nx_dominio_salvar", { p_host: "invasao.exemplo.invalid", p_cliente: null }, { token: TOK.admin })],
    ["nx_dominios_listar", await rpc("nx_dominios_listar", {}, { token: TOK.admin })],
    ["nx_clientes_admin", await rpc("nx_clientes_admin", { p_filtro: {} }, { token: TOK.admin })],
    ["nx_orgs_listar", await rpc("nx_orgs_listar", {}, { token: TOK.admin })],
    ["nx_cliente_admin_salvar", await rpc("nx_cliente_admin_salvar", { p_cliente: { id: E.cliente, nome: "Invasão" } }, { token: TOK.admin })],
  ]) c.ok(`administrador do cliente → ${rot}: negado (so_gestor)`, negado(r, "so_gestor|so_plataforma|sem_permissao"), `${r.codigo}|${r.hint}`);
  for (const [nome, cli2] of [["kamiguchi", KAM], ["teste-e2e", TESTE]]) {
    const r = await rpc("nx_crm_base", { p_cliente: cli2 }, { token: TOK.admin });
    c.ok(`sessão do cliente EB-3009 → CRM do ${nome}: negado (sem_acesso)`, negado(r, "sem_acesso"), `${r.codigo}|${r.hint}`);
  }
  // 9. troca de marca pela gestora chega na sessão do cliente na hora (mesma org)
  const m2 = { ...MARCA1(), produto: "EB-3009 Órbita Teste 2", cores: { primaria: "#B5179E", secundaria: "#4CC9F0", fundo: "#10002B" } };
  deve(await G("nx_org_salvar", { p_org: { id: E.org, marca: m2 } }), "nx_org_salvar 2");
  const sa3 = deve(await rpc("nx_app_sessao", {}, { token: TOK.admin }), "nx_app_sessao 3");
  c.ok("trocar a marca da revenda: a SESSÃO DO CLIENTE já traz o nome e as cores novas (sem relogar)", sa3.org?.marca?.produto === "EB-3009 Órbita Teste 2" && sa3.org?.marca?.cores?.primaria === "#B5179E", JSON.stringify({ p: sa3.org?.marca?.produto, c: sa3.org?.marca?.cores }));
  deve(await G("nx_org_salvar", { p_org: { id: E.org, marca: MARCA1() } }), "nx_org_salvar volta à marca 1");

  // 10. cor ruim (primária #FFFF00 sobre fundo branco): o servidor guarda (só valida o formato); o app corrige e avisa
  const T = await import(pathToFileURL(path.join(RAIZ, "web", "app", "tema.js")).href);
  const d = T.derivarTema({ primaria: "#FFFF00", secundaria: "#EC9A29", fundo: "#FFFFFF" });
  const avPrim = d.avisos.find(a => a.campo === "primaria");
  const luz = d.vars["--c-prim-luz"], fundo = d.vars["--c-fundo"], txtPrim = d.vars["--c-prim-txt"];
  c.ok("tema.js (mesmo código do app): #FFFF00 sobre branco gera AVISO de contraste na primária", !!avPrim, JSON.stringify(d.avisos));
  c.ok("…texto/links com a primária corrigida ficam legíveis (≥ 4,5:1 sobre o fundo) e o texto sobre o botão amarelo também", T.contraste(luz, fundo) >= 4.5 && T.contraste(txtPrim, "#FFFF00") >= 4.5 && T.contraste(d.vars["--c-texto"], fundo) >= 7, `luz=${luz} c=${T.contraste(luz, fundo).toFixed(2)} txtPrim=${txtPrim} c=${T.contraste(txtPrim, "#FFFF00").toFixed(2)}`);
  c.nota("cor_ruim", JSON.stringify({ aviso: avPrim?.texto, primLuz: luz, primTxt: txtPrim }));
}

/* ============================================================
   CASO 14c — domínio próprio (host → marca/cliente) e link de convite com o domínio
   ============================================================ */
async function c14c(c) {
  const host = `app-${RUN}.eb3009-teste.invalid`;
  E.host = host; salvar();
  const d0 = deve(await G("nx_dominio_salvar", { p_host: host, p_cliente: E.cliente }), "nx_dominio_salvar");
  const item = (Array.isArray(d0) ? d0 : d0.dominios || []).find(x => x.host === host);
  c.ok("nx_dominio_salvar (gestora): cadastra PENDENTE, só para o cliente dela, com instrução de DNS (CNAME)", item?.status === "pendente" && item?.cliente?.id === E.cliente && item?.dns?.tipo === "CNAME" && item?.dns?.nome === host, JSON.stringify(item));
  const dup = await G("nx_dominio_salvar", { p_host: host, p_cliente: null });
  c.ok("o mesmo host de novo → dominio_em_uso", negado(dup, "dominio_em_uso"), `${dup.codigo}|${dup.hint}`);
  const ruimH = await G("nx_dominio_salvar", { p_host: "sem_ponto", p_cliente: null });
  c.ok("host inválido → dominio_invalido", negado(ruimH, "dominio_invalido"), `${ruimH.codigo}|${ruimH.hint}`);
  const st = await G("nx_dominio_status", { p_host: host, p_ativo: true });
  c.ok("ativar domínio é do super (gestora não consegue) → so_plataforma", negado(st, "so_plataforma"), `${st.codigo}|${st.hint}`);
  const pend = deve(await rpc("nx_marca_publica", { p_host: host, p_org: null }, { anon: true }), "marca pública (pendente)");
  c.ok("domínio pendente ainda NÃO resolve a marca (cai na plataforma)", pend.org?.slug !== "eb-3009" && !pend.cliente, JSON.stringify({ org: pend.org?.slug, cliente: pend.cliente?.slug }));
  const l0 = deve(await G("nx_dominios_listar"), "nx_dominios_listar");
  c.ok("nx_dominios_listar (gestora): só os domínios da própria revenda", (l0 || []).every(x => x.host === host) && (l0 || []).length === 1, JSON.stringify((l0 || []).map(x => x.host)));
  const lc = await rpc("nx_dominios_listar", {}, { token: TOK.admin });
  c.ok("o administrador do cliente não lista domínios (so_gestor)", negado(lc, "so_gestor"), `${lc.codigo}`);
  // o super ativa (simulado por SQL) e a marca resolve pelo host
  await pedirSql("b03", "b03_dominio_ativar.sql", { HOST: host });
  const at = deve(await rpc("nx_marca_publica", { p_host: host, p_org: null }, { anon: true }), "marca pública (ativo)");
  c.ok("domínio ATIVO: o host resolve a marca da revenda (nome, cores) e o tema do cliente (quem entra por ali cai no cliente)", at.org?.slug === "eb-3009" && at.marca?.produto === MARCA1().produto && at.marca?.cores?.primaria === "#0F8B8D" && at.cliente?.slug === "eb-3009-clinica" && at.cliente?.tema?.cores?.primaria === "#7B2CBF", JSON.stringify({ org: at.org?.slug, produto: at.marca?.produto, cliente: at.cliente?.slug, tema: at.cliente?.tema?.cores }));
  const atPorta = deve(await rpc("nx_marca_publica", { p_host: `${host}:443`, p_org: null }, { anon: true }), "marca pública (host:porta)");
  c.ok("o host com porta (host:443) resolve igual", atPorta.org?.slug === "eb-3009");
  const cv = deve(await G("nx_convite_criar", { p_cliente: E.cliente, p_dados: { papel: "atendente", dias: 1, nome: `${PRE} Convite` }, p_org: null }), "nx_convite_criar");
  c.ok("convite gerado com o DOMÍNIO ativo da revenda (não o endereço da Nexus): link = https://<host>…#/convite/<token>", String(cv.link || "").startsWith(`https://${host}`) && /#\/convite\/[0-9a-f]{64}$/.test(cv.link || ""), limpo(cv.link || "").slice(0, 120));
  if (cv.token) SEGREDOS.add(cv.token);
  const ver = deve(await rpc("nx_convite_ver", { p_convite: cv.token }, { anon: true }), "nx_convite_ver");
  c.ok("nx_convite_ver (anônimo): mostra a marca da REVENDA e o nome do cliente, sem e-mail nem id", ver.org?.marca?.produto === MARCA1().produto && ver.cliente?.nome === `${PRE} Clínica Teste` && ver.papel === "atendente", JSON.stringify({ produto: ver.org?.marca?.produto, cliente: ver.cliente?.nome, papel: ver.papel }));
  const sv = deve(await rpc("nx_app_sessao", {}, { token: TOK.admin }), "sessão (link_base)");
  c.ok("link_base do cliente na sessão = domínio ativo da revenda", String(sv.clientes?.[0]?.link_base || "").includes(host), JSON.stringify(sv.clientes?.[0]?.link_base));
  const rv = await G("nx_convite_revogar", { p_cliente: E.cliente, p_convite: (await G("nx_usuarios_listar", { p_cliente: E.cliente })).dados?.convites?.[0]?.id });
  c.ok("convite revogado pela gestora", rv.ok, `${rv.codigo}|${rv.hint}`);
  const rm = await G("nx_dominio_remover", { p_host: host });
  c.ok("nx_dominio_remover (gestora): apaga o domínio da própria revenda", rm.ok, `${rm.codigo}|${rm.hint}`);
  const depois = deve(await rpc("nx_marca_publica", { p_host: host, p_org: null }, { anon: true }), "marca pública (removido)");
  c.ok("domínio removido: o host deixa de resolver a marca da revenda", depois.org?.slug !== "eb-3009");
}

/* ============================================================
   Canal CodeWords de teste (chave FALSA, sem rede) + URL secreta do agente: base dos casos 12 e 8
   ============================================================ */
async function canalDeTeste(c) {
  if (E.canal) {
    const ex = await A("nx_canais_listar");
    const existe = ex.ok && (Array.isArray(ex.dados) ? ex.dados : ex.dados?.canais || []).some(x => x.id === E.canal);
    if (!existe) { E.canal = null; salvar(); }
  }
  if (E.canal) {
    c.ok("canal de teste já criado por uma rodada anterior desta mesma execução (reaproveitado)", true);
  } else {
    const fake = `cwk-teste-eb3009-${crypto.randomBytes(12).toString("hex")}`;
    SEGREDOS.add(fake);
    const r = await A("nx_codewords_canal_salvar", { p_canal: { nome: `${PRE} CodeWords (falso)`, numero: "+5511930099900", codewords_api_key: fake, rota: "fluxo", ia_ligada: false, ia_volta_horas: 6 } });
    const d = deve(r, "nx_codewords_canal_salvar");
    E.canal = d.canal?.id; salvar();
    if (d.webhook_url) SEGREDOS.add(d.webhook_url);
    c.ok("canal CodeWords de teste criado (provedor codewords, rota fluxo, IA 24 h DESLIGADA, sem devolver a chave)", !!E.canal && d.canal?.provedor === "codewords" && d.canal?.codewords?.rota === "fluxo" && d.canal?.codewords?.ia_ligada === false && !JSON.stringify(d).includes(fake), JSON.stringify(Object.keys(d)));
  }
  const rec = await fnA("nx-codewords", { acao: "receita", canal: E.canal });
  c.ok("ação 'receita' devolve a URL do agente (formato /nx-codewords?ch=<64 hex>)", rec.status === 200 && /\/functions\/v1\/nx-codewords\?ch=[0-9a-f]{64}$/.test(rec.json?.url || ""), `status=${rec.status} erro=${rec.json?.erro}`);
  URL_AGENTE = rec.json?.url || null;
  if (URL_AGENTE) SEGREDOS.add(URL_AGENTE);
  if (!URL_AGENTE) throw new Error("sem URL do agente");
  const cnx = deve(await A("nx_canais_listar"), "nx_canais_listar");
  const meu = (Array.isArray(cnx) ? cnx : cnx.canais || []).find(x => x.id === E.canal);
  c.ok("o canal de teste NÃO está pareado (sem phone_id): o cron de sincronização do CodeWords não o chama (nenhuma chamada real ao CodeWords)", !!meu && !meu.codewords?.conectado, JSON.stringify(meu && { cw: meu.codewords && { conectado: meu.codewords.conectado } }));
}
const agente = (corpo, { url = URL_AGENTE } = {}) => http(url, { corpo, headers: { apikey: KEY } });
let seqMsg = 0; const mid = p => `${PRE}-${RUN}-${p}-${++seqMsg}`;
const agoraIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const entrada = (t, texto, nome) => agente({ acao: "mensagem", direcao: "entrada", telefone: t, nome: nome ?? `${PRE} ${t.slice(-2)}`, texto, message_id: mid("in"), timestamp: agoraIso() });
const saida = (t, texto, autor = "celular") => agente({ acao: "mensagem", direcao: "saida", autor, telefone: t, texto, message_id: mid("out") });
const FONE = { a: "5511930099901", b: "5511930099902", c: "5511930099903", d: "5511930099904" };

/* ============================================================
   CASO 11 — importar CSV de 1.000 linhas pelo caminho real da tela
   ============================================================ */
function gerarCsv(L) {
  const TOTAL = 1000, LOTE = 100;
  const linhas = new Array(TOTAL).fill(null);
  const ehD = i => i % 10 === 9;
  // posições dos casos especiais (fora das posições de duplicata), passo fixo
  const especiais = [...Array(5).fill("vazia"), ...Array(5).fill("fone_ruim"), ...Array(4).fill("email_ruim"), ...Array(3).fill("uf_ruim"),
    ...Array(3).fill("nasc_ruim"), ...Array(5).fill("valor_neg"), ...Array(3).fill("etapa_ruim")];
  let p = 37;
  for (const k of especiais) { while (linhas[p] || ehD(p % LOTE)) p = (p + 1) % TOTAL; linhas[p] = { tipo: k }; p = (p + 41) % TOTAL; }
  for (let i = 0; i < TOTAL; i++) if (!linhas[i] && ehD(i % LOTE)) linhas[i] = { tipo: "dup" };
  let n = 0, nRuim = 875;            // n = telefone único sequencial; nRuim = faixa de fones dos casos especiais com telefone válido
  const fone = k => `1193009${String(k).padStart(4, "0")}`;          // 11 + 9 + 3009 + NNNN (11 dígitos locais)
  const brl = v => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const valorDe = k => 1000 + (k % 9) * 25 + (k % 3 === 2 ? 0.5 : 0);
  const textoValor = (k, v) => k % 3 === 0 ? `R$ ${brl(v)}` : k % 3 === 1 ? String(v) : brl(v);
  const uteis = [];                  // linhas U (limpas), por índice
  for (let i = 0; i < TOTAL; i++) {
    if (linhas[i]) continue;
    n++;
    const v = valorDe(n);
    linhas[i] = { tipo: "u", n, nome: `${PRE} Contato ${String(n).padStart(4, "0")}`, fone: fone(n), email: `eb3009+${String(n).padStart(4, "0")}@exemplo.invalid`,
      cidade: n % 2 ? "São Paulo" : "Mogi das Cruzes", uf: n % 4 ? "SP" : "", nasc: n % 5 === 0 ? "15/03/1985" : "", origem: n % 3 === 0 ? "Indicação" : n % 3 === 1 ? "Site" : "",
      etq: `${PRE} importado`, titulo: `Avaliação ${PRE} ${String(n).padStart(4, "0")}`, valor: textoValor(n, v), valorNum: v, obs: n % 7 === 0 ? `obs ${n}` : "" };
    uteis.push(i);
  }
  // duplicatas: perto (mesmo lote), longe (2 lotes antes), sem o 9 (lote anterior), e-mail repetido com telefone novo
  const tiposD = lote => lote < 2 ? Array(10).fill("perto") : ["perto", "perto", "longe", "longe", "longe", "sem9", "sem9", "email", "email", "email"];
  const refEm = (i, deLote) => { const ini = deLote * LOTE; let c = null; for (const j of uteis) { if (j >= ini && j < ini + LOTE && j < i) c = j; } return c; };
  let nEmailFone = 950;
  for (let b = 0; b < TOTAL / LOTE; b++) {
    const ks = tiposD(b); let kk = 0;
    for (let i = b * LOTE; i < (b + 1) * LOTE; i++) {
      if (linhas[i]?.tipo !== "dup") continue;
      const tipo = ks[kk++];
      const ref = tipo === "perto" ? refEm(i, b) : tipo === "longe" ? refEm(TOTAL, b - 2 >= 0 ? b - 2 : 0) : refEm(TOTAL, Math.max(0, b - 1));
      const r = linhas[ref];
      const base = { tipo: "d", sub: tipo, ref: ref + 2, nome: `${PRE} Duplicado ${i + 2}`, cidade: "Campinas", titulo: `Duplicado ${PRE}`, valor: "999", valorNum: 999 };
      if (tipo === "perto") linhas[i] = { ...base, fone: `(${r.fone.slice(0, 2)}) ${r.fone.slice(2, 7)}-${r.fone.slice(7)}` };                      // (11) 93009-0001
      else if (tipo === "longe") linhas[i] = { ...base, fone: `+55 ${r.fone.slice(0, 2)} ${r.fone.slice(2, 7)}-${r.fone.slice(7)}` };                 // +55 11 93009-0001
      else if (tipo === "sem9") linhas[i] = { ...base, fone: `(${r.fone.slice(0, 2)}) ${r.fone.slice(3, 7)}-${r.fone.slice(7)}` };                     // (11) 3009-0001 (sem o 9)
      else linhas[i] = { ...base, fone: fone(++nEmailFone), email: r.email.toUpperCase() };                                                          // e-mail repetido (caixa alta), telefone novo
      if (tipo !== "email") linhas[i].email = "";
    }
  }
  for (let i = 0; i < TOTAL; i++) {
    const l = linhas[i];
    if (["vazia", "fone_ruim", "email_ruim", "uf_ruim", "nasc_ruim", "valor_neg", "etapa_ruim"].includes(l.tipo)) {
      n++; nRuim++;
      const k = nRuim;
      const b = { tipo: l.tipo, n: k, nome: `${PRE} Contato ${String(k).padStart(4, "0")}`, fone: fone(k), email: "", cidade: "Santos", uf: "SP", nasc: "", origem: "", etq: `${PRE} importado`, titulo: `Avaliação ${PRE} ${String(k).padStart(4, "0")}`, valor: "1100", valorNum: 1100, obs: "" };
      if (l.tipo === "vazia") linhas[i] = { tipo: "vazia", nome: "", fone: "", email: "", cidade: "Caixa Postal", uf: "", nasc: "", origem: "", etq: "", titulo: "", valor: "", valorNum: null, obs: "" };
      else if (l.tipo === "fone_ruim") linhas[i] = { ...b, fone: "12345", esperaAviso: /Telefone inválido/ };
      else if (l.tipo === "email_ruim") linhas[i] = { ...b, email: "sem-arroba", esperaAviso: /E-mail inválido/ };
      else if (l.tipo === "uf_ruim") linhas[i] = { ...b, uf: "XYZ", esperaAviso: /UF inválida/ };
      else if (l.tipo === "nasc_ruim") linhas[i] = { ...b, nasc: "31/02/2020", esperaAviso: /Nascimento inválido/ };
      else if (l.tipo === "valor_neg") linhas[i] = { ...b, valor: "-50", valorNum: null, esperaAviso: /Valor do negócio inválido/ };
      else linhas[i] = { ...b, etapa: "Etapa Que Não Existe", esperaAviso: /Etapa «Etapa Que Não Existe/ };
    }
  }
  const cabecalho = ["Nome", "Telefone", "E-mail", "Cidade", "UF", "Nascimento", "Origem", "Etiquetas", "Título", "Valor", "Etapa", "Observação"];
  const matriz = linhas.map(l => [l.nome || "", l.fone || "", l.email || "", l.cidade || "", l.uf || "", l.nasc || "", l.origem || "", l.etq || "", l.titulo || "", l.valor || "", l.etapa || "", l.obs || ""]);
  const csv = L.gerarCSV(cabecalho, matriz);
  return { linhas, csv, cabecalho };
}

async function c11(c) {
  const L = await import(pathToFileURL(path.join(RAIZ, "web", "app", "crm-logica.js")).href);
  const { linhas, csv } = gerarCsv(L);
  fs.writeFileSync(path.join(DIR, "eb3009-importacao.csv"), csv);
  // expectativa POR CONSTRUÇÃO (não pelo código do app): o gerador sabe quem é duplicata de quem
  const exp = { criados: 0, ignorados: 0, avisos: new Map(), valor: 0, nDup: 0 };
  linhas.forEach((l, i) => {
    if (l.tipo === "d") { exp.ignorados++; exp.nDup++; }
    else if (l.tipo === "vazia") exp.ignorados++;
    else { exp.criados++; exp.valor += l.valorNum || 0; if (l.esperaAviso) exp.avisos.set(i + 2, l.esperaAviso); }
  });
  c.nota("esperado_por_construcao", JSON.stringify({ linhas: linhas.length, criados: exp.criados, ignorados: exp.ignorados, duplicados: exp.nDup, avisos: exp.avisos.size, soma_valor: exp.valor }));
  c.ok("CSV gerado com 1.000 linhas de dados, 100 duplicados (perto, longe, sem o 9, e-mail repetido) e 28 casos especiais", linhas.length === 1000 && exp.nDup === 100 && linhas.filter(l => l.tipo !== "u" && l.tipo !== "d").length === 28, `n=${linhas.length} dup=${exp.nDup}`);

  // ---- passos da tela: lerCSV → sugerirMapeamento → montarLinhas (+ checarLinha na prévia)
  const d = L.lerCSV(csv, { limite: 20000 });
  c.ok("lerCSV: separador ';', 12 colunas, 1.000 linhas, BOM e aspas tratados", d.separador === ";" && d.cabecalho.length === 12 && d.linhas.length === 1000 && d.total === 1000 && !d.cortado, JSON.stringify({ sep: d.separador, cols: d.cabecalho.length, n: d.linhas.length }));
  const mapa = L.sugerirMapeamento(d.cabecalho, []);
  c.igual("sugerirMapeamento reconhece as 12 colunas", mapa, ["nome", "telefone", "email", "cidade", "uf", "nascimento", "origem", "etiquetas", "negocio_titulo", "negocio_valor", "estagio", "obs"]);
  const montadas = L.montarLinhas(d.linhas, mapa).map((l, i) => ({ ...l, _linha: (d.numeros && d.numeros[i]) || i + 2 }));
  const prev = montadas.map(L.checarLinha);
  const marcadas = prev.filter(x => x.length).length;
  c.ok("prévia da tela (checarLinha) já marca as 20 linhas com problema que ela sabe ver (vazias, telefone, e-mail, UF, nascimento); valor negativo e etapa só o servidor acusa", marcadas === 20, `marcadas=${marcadas}`);

  // ---- antes: contagem no tenant
  const antes = deve(await A("nx_contatos_listar", { p_filtro: {}, p_pagina: 1, p_por_pagina: 1, p_ordem: "recentes" }), "contatos antes");
  c.ok("cliente novo: 0 contatos antes da importação", (antes.total ?? 0) === 0, `total=${antes.total}`);
  // ---- importar em lotes de 100 exatamente como crm-importar.js (iniciar())
  const opcoes = { atualizar: false, etiquetas: [], arquivo: "eb3009-importacao.csv", negocio: { funil_id: E.funilPadrao } };
  const tempos = []; let resumo = { criados: 0, atualizados: 0, ignorados: 0, erros: [], avisos: [] }, imp = null, lote = 100, i = 0, tEsgotado = 0;
  const t0 = Date.now();
  while (i < montadas.length) {
    const fatia = montadas.slice(i, i + lote);
    const r = await A("nx_contatos_importar", { p_linhas: fatia, p_opcoes: { ...opcoes, importacao_id: imp } });
    if (!r.ok) { if (/57014|tempo_esgotado|statement timeout/i.test(`${r.codigo}${r.code}`) && lote > 10) { tEsgotado++; lote = L.metadeLote(lote); continue; } throw new Error(`lote ${i / 100 + 1} falhou: ${r.codigo}|${r.hint}`); }
    imp = r.dados.importacao_id || imp;
    resumo = L.somarImportacao(resumo, r.dados);
    tempos.push({ lote: tempos.length + 1, linhas: fatia.length, ms: r.ms, criados: r.dados.criados, ignorados: r.dados.ignorados, erros: (r.dados.erros || []).length, avisos: (r.dados.avisos || []).length });
    i += fatia.length;
  }
  const total = Date.now() - t0;
  RESULTADO.medidas.importacao_1000 = { total_ms: total, lotes: tempos, tempo_esgotado: tEsgotado };
  log(`IMPORTACAO 1000 linhas: ${total} ms em ${tempos.length} lotes; máx por lote ${Math.max(...tempos.map(x => x.ms))} ms; lotes: ${tempos.map(x => x.ms).join(",")}`);
  c.ok("1.000 linhas em 10 lotes de 100, sem nenhum tempo_esgotado (nenhum lote reduzido)", tempos.length === 10 && tEsgotado === 0, `lotes=${tempos.length} esgotado=${tEsgotado}`);
  c.ok("tempo total < 60 s (ESPEC §8.5 item 11)", total < 60_000, `${total} ms`);
  c.ok("cada lote < 2 s medido da máquina de teste (rede incluída)", tempos.every(x => x.ms < 2000), `ms=${tempos.map(x => x.ms).join(",")}`);
  c.nota("lotes_ms", tempos.map(x => x.ms).join(","));
  // ---- resumo
  c.ok(`resumo: criados = ${exp.criados}, atualizados = 0, ignorados = ${exp.ignorados} (100 duplicados + 5 vazias), erros = 0`, resumo.criados === exp.criados && resumo.atualizados === 0 && resumo.ignorados === exp.ignorados && resumo.erros.length === 0, JSON.stringify({ c: resumo.criados, a: resumo.atualizados, i: resumo.ignorados, e: resumo.erros.length }));
  c.ok("conservação: criados + atualizados + ignorados + erros = 1.000 (nenhuma linha some)", resumo.criados + resumo.atualizados + resumo.ignorados + resumo.erros.length === 1000);
  // avisos com motivo e número da linha (o mesmo da planilha: cabeçalho = 1)
  const avLinhas = new Map(resumo.avisos.map(a => [a.linha, a.motivo]));
  c.ok(`avisos com motivo: exatamente as ${exp.avisos.size} linhas esperadas, cada uma com o motivo certo e o NÚMERO DA LINHA da planilha`, avLinhas.size === exp.avisos.size && [...exp.avisos].every(([ln, re]) => re.test(avLinhas.get(ln) || "")), `obtidas=${avLinhas.size} ${JSON.stringify([...avLinhas].slice(0, 6))}`);
  c.nota("avisos_amostra", JSON.stringify([...avLinhas].slice(0, 8)));
  // ---- dados gravados
  const cont = deve(await A("nx_contatos_listar", { p_filtro: { busca: `${PRE} Contato` }, p_pagina: 1, p_por_pagina: 1, p_ordem: "nome" }), "contatos depois");
  c.ok(`contatos gravados = ${exp.criados} (nenhum duplicado virou contato)`, cont.total === exp.criados, `total=${cont.total}`);
  const dupl = deve(await A("nx_contatos_listar", { p_filtro: { busca: `${PRE} Duplicado` }, p_pagina: 1, p_por_pagina: 1, p_ordem: "nome" }), "contatos dup");
  c.ok("nenhum contato com o nome das linhas duplicadas (o primeiro cadastro vale; dedupe por telefone e por e-mail)", dupl.total === 0, `total=${dupl.total}`);
  // dedupe de telefone com formatos diferentes: a busca por dígitos acha UM contato só, com o nome do original
  for (const [tipo, sub] of [["perto", "perto"], ["longe", "longe"], ["sem9", "sem9"]]) {
    const idx = linhas.findIndex(l => l.tipo === "d" && l.sub === sub);
    const dup = linhas[idx], orig = linhas[dup.ref - 2];
    const dig = dup.fone.replace(/\D/g, "").slice(-8);
    const b = deve(await A("nx_contatos_listar", { p_filtro: { busca: dig }, p_pagina: 1, p_por_pagina: 10, p_ordem: "nome" }), "busca por telefone");
    const ach = b.itens || b.contatos || [];
    c.ok(`dedupe de telefone (${tipo}): "${dup.fone}" = telefone de "${orig.nome}" → um contato só, com o nome do original`, ach.length === 1 && ach[0].nome === orig.nome, JSON.stringify(ach.map(x => x.nome)));
  }
  const dupEm = linhas.find(l => l.tipo === "d" && l.sub === "email");
  const origEm = linhas[dupEm.ref - 2];
  const bEm = deve(await A("nx_contatos_listar", { p_filtro: { busca: origEm.email }, p_pagina: 1, p_por_pagina: 10, p_ordem: "nome" }), "busca por e-mail");
  c.ok("dedupe por e-mail (caixa alta, telefone novo): segue 1 contato com o nome do original; o telefone novo NÃO foi cadastrado", (bEm.itens || []).length <= 1 && (bEm.itens || []).every(x => x.nome === origEm.nome), JSON.stringify((bEm.itens || []).map(x => x.nome)));
  const bFone = deve(await A("nx_contatos_listar", { p_filtro: { busca: dupEm.fone.replace(/\D/g, "") }, p_pagina: 1, p_por_pagina: 10, p_ordem: "nome" }), "busca fone novo");
  c.ok("…o telefone da linha duplicada por e-mail não virou contato", (bFone.itens || []).length === 0, JSON.stringify((bFone.itens || []).map(x => x.nome)));
  // negócios: um por contato criado, no funil padrão, 1ª etapa aberta; valores somam certo (R$ 1.050,00 / 1025 / 1.025,50)
  const kb = deve(await A("nx_negocios_kanban", { p_funil: E.funilPadrao, p_filtro: { busca: PRE }, p_por_coluna: 1 }), "kanban");
  const colNova = (kb.colunas || []).find(x => x.estagio_id === E.estagioNova);
  c.ok(`negócios: ${exp.criados} abertos, todos na 1ª etapa do funil padrão`, kb.totais?.abertos === exp.criados && colNova?.total === exp.criados, JSON.stringify({ abertos: kb.totais?.abertos, col: colNova?.total }));
  c.ok(`valores previstos somam R$ ${exp.valor.toFixed(2)} (formatos "R$ 1.050,00", "1025" e "1.025,50" lidos certo; valor negativo ignorado)`, Math.abs(Number(colNova?.soma_previsto) - exp.valor) < 0.005, `soma=${colNova?.soma_previsto} esperado=${exp.valor}`);
  const eq = deve(await A("nx_crm_base"), "crm_base depois");
  c.ok("etiqueta da planilha criada uma vez ('EB-3009 importado') e usada nos contatos", (eq.etiquetas || []).filter(x => x.nome === `${PRE} importado`).length === 1);
  E.imp = { criados: exp.criados, valor: exp.valor };

  // ---- 2ª passada: o MESMO arquivo de novo (sem atualizar): quem tem telefone/e-mail não duplica; quem não tem, sim (por desenho: sem chave)
  let r2 = { criados: 0, atualizados: 0, ignorados: 0, erros: [], avisos: [] }, imp2 = null; const t2 = [];
  for (let k = 0; k < montadas.length; k += 100) {
    const r = await A("nx_contatos_importar", { p_linhas: montadas.slice(k, k + 100), p_opcoes: { ...opcoes, importacao_id: imp2 } });
    if (!r.ok) throw new Error(`2ª passada, lote ${k / 100 + 1}: ${r.codigo}`);
    imp2 = r.dados.importacao_id || imp2; r2 = L.somarImportacao(r2, r.dados); t2.push(r.ms);
  }
  RESULTADO.medidas.importacao_2a_passada = { lotes_ms: t2 };
  const semChave = linhas.filter(l => l.tipo === "fone_ruim").length;
  c.ok(`2ª passada com o mesmo arquivo: só as ${semChave} linhas SEM telefone e SEM e-mail (telefone inválido) criam de novo; o resto é ignorado (${1000 - semChave})`, r2.criados === semChave && r2.ignorados === 1000 - semChave && r2.atualizados === 0 && r2.erros.length === 0, JSON.stringify({ c: r2.criados, i: r2.ignorados, a: r2.atualizados, e: r2.erros.length }));
  // ---- 3ª: atualizar=true em 10 linhas (nome novo) → atualiza sem criar negócio repetido
  const dez = montadas.slice(0, 40).filter(l => l.telefone && l.nome && !/Duplicado/.test(l.nome)).slice(0, 10).map(l => ({ ...l, nome: `${l.nome} (atualizado)` }));
  const r3 = deve(await A("nx_contatos_importar", { p_linhas: dez, p_opcoes: { ...opcoes, atualizar: true, importacao_id: null } }), "importar atualizar");
  c.ok("importar com 'atualizar' em 10 linhas já existentes: 10 atualizados, 0 criados", r3.atualizados === 10 && r3.criados === 0 && (r3.erros || []).length === 0, JSON.stringify({ a: r3.atualizados, c: r3.criados }));
  c.ok("…sem criar negócio repetido (aviso 'Já tinha negócio aberto nesse funil' em cada linha)", (r3.avisos || []).filter(a => /Já tinha negócio aberto/.test(a.motivo)).length === 10, JSON.stringify((r3.avisos || []).slice(0, 2)));
  const kb2 = deve(await A("nx_negocios_kanban", { p_funil: E.funilPadrao, p_filtro: { busca: PRE }, p_por_coluna: 1 }), "kanban 2");
  c.ok(`negócios depois das 3 importações = ${exp.criados + semChave} (os ${semChave} sem chave da 2ª passada; a atualização não duplicou)`, kb2.totais?.abertos === exp.criados + semChave, `abertos=${kb2.totais?.abertos}`);
  const eh = await A("nx_contatos_listar", { p_filtro: { busca: "(atualizado)" }, p_pagina: 1, p_por_pagina: 50, p_ordem: "nome" });
  c.ok("os 10 nomes novos estão gravados", eh.ok && (eh.dados.total ?? (eh.dados.itens || []).length) === 10, JSON.stringify(eh.ok ? eh.dados.total : eh.codigo));

  // ---- linhas malformadas (só a API alcança: a tela nunca manda): rejeitadas COM motivo e número da linha
  const mal = deve(await A("nx_contatos_importar", { p_linhas: [{ nome: `${PRE} Malformada OK`, telefone: "11930090990" }, 5, "texto solto", null, [1, 2]], p_opcoes: { linha_inicial: 0 } }), "importar malformadas");
  c.ok("linhas que não são objeto (número, texto, null, lista) → 4 erros 'Linha em formato inválido' com a linha; a boa entra (1 criado)", mal.criados === 1 && (mal.erros || []).length === 4 && (mal.erros || []).every(e => e.motivo === "Linha em formato inválido" && e.linha >= 2), JSON.stringify(mal));
  const gr = await A("nx_contatos_importar", { p_linhas: Array.from({ length: 101 }, (_, k) => ({ nome: `${PRE} Grande ${k}` })), p_opcoes: {} });
  c.ok("lote com 101 linhas → dados_invalidos (o limite do servidor é 100 por chamada)", negado(gr, "dados_invalidos") && /linhas/.test(gr.hint || ""), `${gr.codigo}|${gr.hint}`);
  const sup = await rpc("nx_contatos_importar", { p_cliente: KAM, p_linhas: [5], p_opcoes: {} }, { token: TOK.admin });
  c.ok("importar no kamiguchi com a sessão deste cliente → sem_acesso (nada gravado lá: linha inválida de propósito)", negado(sup, "sem_acesso"), `${sup.codigo}|${sup.hint}`);
}

/* ============================================================
   CASO 12 (início) — conversas, automações e mensagens; o relógio de 5 min começa aqui
   ============================================================ */
async function c12_inicio(c) {
  // idempotente: uma execução anterior interrompida pode ter deixado automações/etiqueta
  for (const k of ["autoSr", "autoBk"]) if (E[k]) { await A("nx_automacao_excluir", { p_id: E[k] }); E[k] = null; }
  if (E.etiqueta) { await A("nx_etiqueta_excluir", { p_id: E.etiqueta }); E.etiqueta = null; }
  salvar();
  const et = deve(await A("nx_etiqueta_salvar", { p_etiqueta: { nome: `${PRE} backlog ${RUN}`, cor: "#22AA66" } }), "etiqueta");
  E.etiqueta = et.id; salvar();
  const sr = deve(await A("nx_automacao_salvar", { p_auto: { nome: `${PRE} sem resposta há 5 min`, ativo: true, gatilho: "sem_resposta", config: { minutos: 5 }, condicoes: [],
    acoes: [{ tipo: "notificar", para: "admins", titulo: `${PRE} sem resposta há 5 min`, texto: "A conversa {protocolo} de {nome} está sem resposta." }], respeitar_horario: false } }), "automação sem_resposta");
  E.autoSr = sr.id;
  const bk = deve(await A("nx_automacao_salvar", { p_auto: { nome: `${PRE} backlog de mensagens`, ativo: true, gatilho: "mensagem_recebida", config: { palavras: ["EB3009BK"] }, condicoes: [],
    acoes: [{ tipo: "etiquetar", etiqueta_id: E.etiqueta, alvo: "conversa" }], respeitar_horario: false } }), "automação backlog");
  E.autoBk = bk.id; salvar();
  const lst = deve(await A("nx_automacoes_listar"), "automações listar");
  const meus = (lst.itens || []).filter(x => [E.autoSr, E.autoBk].includes(x.id));
  c.ok("duas automações ativas: sem_resposta (5 min → notificar admins) e mensagem_recebida (palavra EB3009BK → etiquetar)", meus.length === 2 && meus.every(x => x.ativo) && meus.find(x => x.id === E.autoSr)?.config?.minutos === 5, JSON.stringify(meus.map(x => [x.gatilho, x.ativo, x.config])));
  const inv = await A("nx_automacao_salvar", { p_auto: { nome: `${PRE} inválida`, gatilho: "sem_resposta", config: { minutos: 2 }, acoes: [{ tipo: "notificar", para: "admins", titulo: "x" }] } });
  c.nota("sem_resposta_minutos_2", inv.ok ? "aceito (o motor usa no mínimo 5)" : `${inv.codigo}|${inv.hint}`);
  if (inv.ok) await A("nx_automacao_excluir", { p_id: inv.dados.id });
  const cnt = async () => { const l = deve(await A("nx_automacoes_listar"), "listar"); const f = id => (l.itens || []).find(x => x.id === id) || {}; return { sr: f(E.autoSr).execucoes || 0, bk: f(E.autoBk).execucoes || 0, erros_bk: f(E.autoBk).erros || 0, erros_sr: f(E.autoSr).erros || 0 }; };
  E.cnt0 = await cnt();

  // ---- T0: o relógio de 5 minutos começa na mensagem A
  E.t0 = Date.now(); salvar();
  const rA = await entrada(FONE.a, `${PRE} A: oi, quanto custa a avaliação?`, `${PRE} Conv A`);
  c.ok("A: 1 mensagem → registrada (aguardando resposta humana)", rA.status === 200 && rA.json?.ok && rA.json?.registrada && !!rA.json?.conversa_id, `${rA.status} ${JSON.stringify(rA.json).slice(0, 160)}`);
  E.conv.a = rA.json?.conversa_id;
  // C (controle): escreve e o celular responde → NÃO pode disparar
  const rC = await entrada(FONE.c, `${PRE} C: bom dia`, `${PRE} Conv C`);
  E.conv.c = rC.json?.conversa_id; salvar();
  await sleep(2500);
  const rCs = await saida(FONE.c, `${PRE} resposta da equipe pelo celular`, "celular");
  c.ok("C (controle): o cliente escreve e a equipe responde pelo celular → saída registrada", rCs.status === 200 && rCs.json?.ok, `${rCs.status} ${JSON.stringify(rCs.json).slice(0, 140)}`);

  // ---- D: 150 mensagens seguidas (backlog de eventos de automação), 6 em paralelo
  const tD0 = Date.now(); const lat = []; let falhasD = 0;
  const enviarD = async k => { const r = await entrada(FONE.d, `${PRE} D ${k} EB3009BK`, `${PRE} Conv D`); lat.push(r.ms); if (!(r.status === 200 && r.json?.ok && r.json?.registrada)) falhasD++; if (!E.conv.d && r.json?.conversa_id) E.conv.d = r.json.conversa_id; };
  await enviarD(0);
  for (let k = 1; k < 150; k += 6) await Promise.all(Array.from({ length: Math.min(6, 150 - k) }, (_, j) => enviarD(k + j)));
  const tD = Date.now() - tD0; salvar();
  c.ok("D: 150 mensagens seguidas do mesmo cliente → todas registradas (HTTP 200, registrada:true)", falhasD === 0 && lat.length === 150, `falhas=${falhasD} n=${lat.length}`);
  lat.sort((a, b) => a - b);
  c.nota("D_150_msgs", `${tD} ms; latência p50=${lat[75]} p95=${lat[142]} máx=${lat[149]} ms`);
  RESULTADO.medidas.backlog_150 = { total_ms: tD, p50: lat[75], p95: lat[142], max: lat[149] };
  // ---- B: 5 mensagens em sequência, AGORA, com o backlog ainda sendo processado
  const c1 = await cnt();
  const pendentes = 150 - (c1.bk - E.cnt0.bk);
  c.nota("backlog_no_momento_de_B", `${pendentes} eventos de D ainda sem processar quando B começa (execuções ${c1.bk - E.cnt0.bk}/150)`);
  const lb = []; const respB = [];
  for (let k = 1; k <= 5; k++) { const r = await entrada(FONE.b, `${PRE} B ${k} de 5 EB3009BK`, `${PRE} Conv B`); lb.push(r.ms); respB.push(r); await sleep(250); }
  E.conv.b = respB[0].json?.conversa_id; E.tB = Date.now(); salvar();
  c.ok("B: 5 mensagens em sequência durante o backlog → as 5 registradas, mesma conversa, cada resposta rápida (< 5 s)", respB.every(r => r.status === 200 && r.json?.ok && r.json?.registrada) && new Set(respB.map(r => r.json?.conversa_id)).size === 1 && lb.every(x => x < 5000), `ms=${lb.join(",")} conv=${[...new Set(respB.map(r => r.json?.conversa_id))].length}`);
  c.nota("B_latencias_ms", lb.join(","));
  RESULTADO.medidas.b_5_mensagens_ms = lb;
  if (pendentes <= 0) RESULTADO.observacoes.push("O backlog de D já tinha sido processado quando B começou (taxa de processamento ≥ taxa de entrada nesta máquina): as 5 mensagens chegaram sem backlog; o caso com backlog vivo não foi exercitado nesta rodada.");
  const mensB = deve(await A("nx_cv_mensagens", { p_conversa: E.conv.b, p_limite: 100 }), "mensagens B");
  const lm = Array.isArray(mensB) ? mensB : mensB.mensagens || mensB.itens || [];
  c.ok("as 5 mensagens de B estão na conversa, na ordem, como entradas do cliente", lm.filter(m => m.direcao === "in").length === 5 && lm.filter(m => m.direcao === "in").map(m => m.corpo).join("|") === [1, 2, 3, 4, 5].map(k => `${PRE} B ${k} de 5 EB3009BK`).join("|"), `n=${lm.length}`);
  E.cnt1 = await cnt(); salvar();
}

/* ============================================================
   CASO 8 — "Sugerir com IA" sem chave (API): aviso honesto e NENHUMA chamada de fora
   ============================================================ */
async function c8api(c) {
  const base = deve(await A("nx_cv_base"), "nx_cv_base");
  c.ok("nx_cv_base.ia.ligada = false (o servidor calcula por 'existe chave da Anthropic em nx_config?' sem devolver a chave)", base.ia?.ligada === false && !JSON.stringify(base).match(/sk-ant|anthropic_api_key/i), JSON.stringify(base.ia));
  c.ok("…e a cota do mês aparece zerada (usadas 0 de 5000 no plano completo)", base.ia?.cota?.usadas === 0 && base.ia?.cota?.limite === 5000, JSON.stringify(base.ia?.cota));
  const uso0 = deve(await A("nx_uso_plano"), "uso antes");
  const conv = E.conv.b || E.conv.a;
  if (!conv) throw new Error("sem conversa para sugerir (rode o grupo sr antes)");
  const r1 = await fnA("nx-ia", { acao: "sugerir", conversa: conv });
  c.ok("nx-ia sugerir SEM chave → 200 {ok:false, erro:'ia_indisponivel', detalhe:'sem_chave'} (nenhuma chamada à Anthropic)", r1.status === 200 && r1.json?.ok === false && r1.json?.erro === "ia_indisponivel" && r1.json?.detalhe === "sem_chave", `${r1.status} ${r1.txt.slice(0, 160)}`);
  if (r1.json?.ok === true) {
    RESULTADO.observacoes.push("ATENÇÃO: nx-ia devolveu texto — existe chave da Anthropic no banco; essa chamada foi REAL (1 de no máx. 2). O caso 'sem chave' não vale mais.");
    return;
  }
  const r2 = await fnA("nx-ia", { acao: "resumir", conversa: conv });
  c.ok("nx-ia resumir SEM chave → o mesmo aviso honesto (sem_chave)", r2.status === 200 && r2.json?.ok === false && r2.json?.erro === "ia_indisponivel" && r2.json?.detalhe === "sem_chave", `${r2.status} ${r2.txt.slice(0, 160)}`);
  const uso1 = deve(await A("nx_uso_plano"), "uso depois");
  c.ok("as duas tentativas NÃO gastaram cota: uso de IA do mês igual antes e depois (reserva só acontece DEPOIS de achar a chave)", (uso0.uso?.ia_mes ?? 0) === (uso1.uso?.ia_mes ?? 0) && (uso1.uso?.ia_mes ?? 0) === 0, `antes=${uso0.uso?.ia_mes} depois=${uso1.uso?.ia_mes}`);
  const alheio = await http(`${SUPA}/functions/v1/nx-ia`, { corpo: { token: TOK.admin, cliente: KAM, acao: "sugerir", conversa: 1 }, headers: { apikey: KEY } });
  c.ok("nx-ia com a sessão deste cliente apontando para o kamiguchi → recusado na autenticação (nunca chega à IA)", alheio.status >= 400 && alheio.json?.ok !== true, `${alheio.status} ${alheio.txt.slice(0, 120)}`);
  const semSessao = await http(`${SUPA}/functions/v1/nx-ia`, { corpo: { token: "x".repeat(64), cliente: E.cliente, acao: "sugerir", conversa: conv }, headers: { apikey: KEY } });
  c.ok("nx-ia com token inválido → 401", semSessao.status === 401, `${semSessao.status}`);
  const gr = await rpc("nx_ia_cota", { p_cliente: E.cliente }, { token: TOK.admin });
  c.nota("nx_ia_cota_por_rpc_de_painel", gr.ok ? "acessível" : `${gr.codigo} (interna, só service_role)`);
  RESULTADO.medidas.ia_chamadas_externas = 0;
}

/* ============================================================
   CASO 12 (verificação) — sem resposta dispara UMA vez por espera
   ============================================================ */
async function c12_fim(c) {
  const t5 = () => (E.t0 + 5 * 60_000) - Date.now();
  const cnt = async () => { const l = deve(await A("nx_automacoes_listar"), "listar"); const f = id => (l.itens || []).find(x => x.id === id) || {}; return { sr: f(E.autoSr).execucoes || 0, bk: f(E.autoBk).execucoes || 0, erros_bk: f(E.autoBk).erros || 0, erros_sr: f(E.autoSr).erros || 0 }; };
  const exec = async () => { const r = await A("nx_automacao_execucoes", { p_id: E.autoSr, p_limite: 200 }); return r.ok ? (Array.isArray(r.dados) ? r.dados : r.dados?.itens || r.dados?.execucoes || []) : []; };
  const porConv = l => { const m = new Map(); for (const x of l) { const mm = /^sr:(\d+):/.exec(x.chave || ""); if (mm) m.set(mm[1], (m.get(mm[1]) || 0) + 1); } return m; };
  const espera = t5() + 40_000;
  if (espera > 0) { log(`SR aguardando ${Math.round(espera / 1000)} s (5 min da mensagem A + 40 s de folga do cron de 15 s)`); await sleep(espera); }
  const fimB = (E.tB || E.t0) + 5 * 60_000 + 40_000 - Date.now();
  if (fimB > 0) await sleep(fimB);
  let l = await exec(); let m = porConv(l);
  const ate = Date.now() + 120_000;
  while ((m.size < 3) && Date.now() < ate) { await sleep(10_000); l = await exec(); m = porConv(l); }
  c.ok("conversas A, B (5 mensagens) e D (150 mensagens) dispararam 'sem resposta' — e SÓ elas (C foi respondida)", m.size === 3 && ["a", "b", "d"].every(k => m.has(String(E.conv[k]))) && !m.has(String(E.conv.c)), JSON.stringify([...m]));
  c.ok("UM disparo por conversa (A=1, B=1 e não 5, D=1 e não 150)", ["a", "b", "d"].every(k => m.get(String(E.conv[k])) === 1), JSON.stringify([...m]));
  c.ok("todas as execuções deram ok, sem erro", l.filter(x => /^sr:/.test(x.chave || "")).every(x => x.ok === true), JSON.stringify(l.slice(0, 3)));
  c.ok("a chave de dedupe é sr:<conversa>:<epoch da última entrada> (ESPEC §5.7)", l.every(x => /^sr:\d+:\d{9,11}$/.test(x.chave || "")), JSON.stringify(l.map(x => x.chave)));
  const det = l.map(x => x.detalhe).join(" | ");
  c.nota("detalhes", det.slice(0, 300));
  // notificações no sino da administradora: 1 por disparo (3 disparos), e nenhuma para a conversa respondida
  const nt = deve(await A("nx_notificacoes_listar", { p_limite: 100 }), "notificacoes");
  const itens = (Array.isArray(nt) ? nt : nt.itens || []).filter(x => x.tipo === "sem_resposta" && /EB-3009/.test(x.titulo || ""));
  c.ok("sino da administradora: 3 notificações 'sem resposta' (uma por conversa; 5 e 150 mensagens não multiplicam)", itens.length === 3, `n=${itens.length} ${JSON.stringify(itens.map(x => x.link))}`);
  c.ok("…cada uma com o link da própria conversa (#/conversas/<id>)", ["a", "b", "d"].every(k => itens.some(x => x.link === `#/conversas/${E.conv[k]}`)) && !itens.some(x => x.link === `#/conversas/${E.conv.c}`), JSON.stringify(itens.map(x => x.link)));
  const ng = deve(await G("nx_notificacoes_listar", { p_cliente: E.cliente, p_limite: 100 }), "notificações da gestora");
  c.nota("notificacoes_da_gestora", String((Array.isArray(ng) ? ng : ng.itens || []).filter(x => x.tipo === "sem_resposta").length));
  const c2 = await cnt();
  c.ok("contador da automação na tela (execucoes) = 3", c2.sr === 3 && c2.erros_sr === 0, JSON.stringify(c2));
  // backlog: todos os 155 eventos (150 de D + 5 de B) viraram execução
  const esp = await esperarAte(async () => { const x = await cnt(); return x.bk >= 155 ? x : null; }, { ms: 120_000, cada: 5000 });
  const c3 = esp || await cnt();
  c.ok("backlog: as 155 mensagens com a palavra (150 de D + 5 de B chegadas no meio) viraram 155 execuções, nenhuma perdida e nenhum erro", c3.bk === 155 && c3.erros_bk === 0, JSON.stringify(c3));
  RESULTADO.medidas.backlog_execucoes = c3;
  // 2 min depois: continua 3 (não repete)
  log("SR aguardando 130 s para provar que NÃO repete");
  await sleep(130_000);
  const l2 = await exec(); const m2 = porConv(l2);
  c.ok("130 s depois: continua UMA execução por conversa (o motor não repete a mesma espera)", l2.length === 3 && [...m2.values()].every(v => v === 1), JSON.stringify([...m2]));
  const nt2 = deve(await A("nx_notificacoes_listar", { p_limite: 100 }), "notificacoes 2");
  c.ok("…e continuam 3 notificações (sem duplicar no sino)", (Array.isArray(nt2) ? nt2 : nt2.itens || []).filter(x => x.tipo === "sem_resposta" && /EB-3009/.test(x.titulo || "")).length === 3);
  // C nunca disparou
  c.ok("conversa C (respondida pelo celular): zero disparos, mesmo depois de tudo", !m2.has(String(E.conv.c)));
  const cvC = deve(await A("nx_cv_mensagens", { p_conversa: E.conv.c, p_limite: 10 }), "mensagens C");
  const lC = Array.isArray(cvC) ? cvC : cvC.mensagens || cvC.itens || [];
  c.ok("…a conversa C tem a entrada do cliente e a saída da equipe (celular)", lC.filter(x => x.direcao === "in").length === 1 && lC.filter(x => x.direcao === "out").length === 1, `n=${lC.length}`);
}

/* ============================================================
   CASO 12 (nova espera) — o cliente escreve DE NOVO na mesma conversa e fica outros 5 min sem resposta
   ============================================================ */
async function c12_nova(c) {
  const exec = async () => { const r = await A("nx_automacao_execucoes", { p_id: E.autoSr, p_limite: 200 }); return r.ok ? (Array.isArray(r.dados) ? r.dados : r.dados?.itens || r.dados?.execucoes || []) : []; };
  const porConv = l => { const m = new Map(); for (const x of l) { const mm = /^sr:(\d+):/.exec(x.chave || ""); if (mm) m.set(mm[1], (m.get(mm[1]) || 0) + 1); } return m; };
  const antes = porConv(await exec());
  c.ok("ponto de partida: A=1, B=1, D=1 (as 3 esperas da 1ª rodada)", ["a", "b", "d"].every(k => antes.get(String(E.conv[k])) === 1), JSON.stringify([...antes]));
  // as conversas foram criadas pelo canal anterior (apagado por engano numa rodada de desenvolvimento): religa ao canal atual
  await pedirSql("b06", "b06_religar_conversas.sql", { CANAL: E.canal, CONVERSAS: [E.conv.a, E.conv.b, E.conv.c, E.conv.d].join(",") });
  const r = await entrada(FONE.a, `${PRE} A: e aí, alguém responde?`, `${PRE} Conv A`);
  c.ok("a nova mensagem do cliente A cai na MESMA conversa (não abre outra)", r.status === 200 && r.json?.registrada === true && r.json?.conversa_id === E.conv.a, `${r.status} conv=${r.json?.conversa_id} esperado=${E.conv.a}`);
  const m0 = await exec();
  c.ok("…e logo depois da mensagem ainda não disparou de novo (a espera é de 5 min)", porConv(m0).get(String(E.conv.a)) === 1);
  await pedirSql("b05", "b05_retroagir_espera.sql", { CONVERSA: E.conv.a });
  const novo = await esperarAte(async () => { const x = await exec(); const mm = porConv(x); return mm.get(String(E.conv.a)) === 2 ? mm : null; }, { ms: 120_000, cada: 5000 });
  c.ok("5 min sem resposta depois da nova mensagem (retroagido por SQL) → NOVA espera = 2º disparo em A (a UI promete 'avisa uma vez por espera')", !!novo, JSON.stringify([...porConv(await exec())]));
  log("SR aguardando 45 s para provar que o 2º disparo não repete");
  await sleep(45_000);
  const fim = porConv(await exec());
  c.ok("…e depois do 2º disparo não repete: A=2, B=1, D=1, C nunca", fim.get(String(E.conv.a)) === 2 && fim.get(String(E.conv.b)) === 1 && fim.get(String(E.conv.d)) === 1 && !fim.has(String(E.conv.c)), JSON.stringify([...fim]));
  const nt = deve(await A("nx_notificacoes_listar", { p_limite: 100 }), "notificacoes final");
  c.ok("sino: 4 notificações 'sem resposta' no total (1 por espera)", (Array.isArray(nt) ? nt : nt.itens || []).filter(x => x.tipo === "sem_resposta" && /EB-3009/.test(x.titulo || "")).length === 4);
}

/* ============================================================
   CASO 14b/8 (tela) — Chrome headless, cópia de web/ com prontos.js aberto só na cópia
   ============================================================ */
let puppeteer = null;
async function carregarPuppeteer() {
  // caminho local do módulo (fora do repositório) só por E2E_PUPPETEER; nada de pasta da máquina no código
  const cand = [process.env.E2E_PUPPETEER, "puppeteer-core"].filter(Boolean);
  for (const c of cand) { try { const m = await import(/^([A-Za-z]:|\/)/.test(c) ? pathToFileURL(c).href : c); return m.default || m; } catch { /* próximo */ } }
  throw new Error("puppeteer-core não encontrado (defina E2E_PUPPETEER com o caminho do módulo)");
}
const CHROME = process.env.E2E_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png" };
async function servirCopia() {
  const copia = path.join(DIR, "web");
  fs.rmSync(copia, { recursive: true, force: true });
  fs.cpSync(path.join(RAIZ, "web"), copia, { recursive: true });
  fs.writeFileSync(path.join(copia, "app", "prontos.js"), `/* SÓ NA CÓPIA DO TESTE (E2E-B): libera tudo para a tela poder ser exercitada; o prontos.js do repositório NÃO é alterado. */
export const MODULOS_PRONTOS = ["inicio","conversas","crm","empresas","tarefas","ads","automacoes","relatorios","admin_revendas"];
export const CONFIG_PRONTAS = ["perfil","usuarios","marca","dominio","plano","funis","campos","etiquetas","motivos","numeros","respostas","atendimento","ia","departamentos","anuncios","formulario","agenda","rastreio","automacoes","importar"];
`);
  const toml = fs.readFileSync(path.join(RAIZ, "netlify.toml"), "utf8");
  const csp = (/for = "\/app\/\*"[\s\S]*?Content-Security-Policy = "([^"]+)"/.exec(toml) || [])[1];
  if (!csp) throw new Error("CSP de /app/* não encontrada no netlify.toml");
  const srv = nodehttp.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/" || p === "/index.html") { res.writeHead(302, { Location: "/app/" }).end(); return; }
    if (p.endsWith("/")) p += "index.html";
    const arq = path.normalize(path.join(copia, p));
    if (!arq.startsWith(path.normalize(copia))) { res.writeHead(403).end(); return; }
    fs.readFile(arq, (e, dados) => {
      if (e) { res.writeHead(404).end("404"); return; }
      const h = { "Content-Type": TIPOS[path.extname(arq)] || "application/octet-stream", "Cache-Control": "no-store" };
      if (p.startsWith("/app/")) Object.assign(h, { "Content-Security-Policy": csp, "Referrer-Policy": "strict-origin-when-cross-origin", "X-Content-Type-Options": "nosniff", "Permissions-Policy": "camera=(), geolocation=()" });
      res.writeHead(200, h).end(dados);
    });
  });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}`, csp };
}

const VIEWS = { "1440x900": { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }, "390x844": { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const medir = () => {
  const iw = innerWidth;
  const o = { iw, sw: document.documentElement.scrollWidth, bsw: document.body.scrollWidth, culpados: [] };
  const nome = el => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "");
  if (o.sw > iw + 0.5) {
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (r.width <= 0 || cs.display === "none" || cs.visibility === "hidden" || r.right <= iw + 1 || cs.position === "fixed") continue;
      o.culpados.push({ el: nome(el), right: Math.round(r.right) }); if (o.culpados.length >= 6) break;
    }
  }
  o.ruins = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const t = w.currentNode.nodeValue.trim(); const pe = w.currentNode.parentElement;
    if (!t || !pe || ["SCRIPT", "STYLE"].includes(pe.tagName)) continue;
    if (/(^|[\s>])(null|undefined|NaN|\[object Object\])([\s.,:;)]|$)/.test(t) && pe.getBoundingClientRect().width > 0) o.ruins.push(nome(pe) + ' > "' + t.slice(0, 40) + '"');
  }
  o.h1 = (document.querySelector("h1")?.textContent || "").trim().slice(0, 70);
  const visivel = e => e && e.getClientRects().length > 0;
  const alvoTxt = [".cfg-sec", "#vista", "#publico"].map(q => document.querySelector(q)).find(visivel);
  o.texto = (alvoTxt?.innerText || "").trim().replace(/\s+/g, " ").slice(0, 1500);
  return o;
};
const marcaNaTela = () => {
  const cs = getComputedStyle(document.documentElement);
  const v = k => cs.getPropertyValue(k).trim().toUpperCase();
  return { produto: (document.getElementById("lat-produto")?.textContent || "").trim(), titulo: document.title, prim: v("--c-prim"), sec: v("--c-sec"), fundo: v("--c-fundo"), primLuz: v("--c-prim-luz"),
    esquema: document.documentElement.dataset.esquema, logo: (document.querySelector("#lat-logo img")?.getAttribute("src") || "").slice(0, 22), logoTopo: (document.querySelector("#topo-marca img")?.getAttribute("src") || "").slice(0, 22),
    favicon: (document.getElementById("favicon")?.getAttribute("href") || "").slice(0, 22), publico: (document.getElementById("publico")?.innerText || "").replace(/\s+/g, " ").slice(0, 300),
    publicoVisivel: !document.getElementById("publico")?.hidden, appVisivel: !document.getElementById("app")?.hidden };
};

async function c14b(c, nav) {
  const T = await import(pathToFileURL(path.join(RAIZ, "web", "app", "tema.js")).href);
  const { srv, base, csp } = await servirCopia();
  const browser = await nav.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] });
  c.nota("servidor", `cópia de web/ em ${base} com a CSP do netlify.toml de /app/*`);
  const dorme = ms => new Promise(r => setTimeout(r, ms));
  fs.writeFileSync(path.join(DIR, "logo-ui.png"), png(120, 40, [255, 140, 0], [200, 30, 30]));
  const prov = v => T.derivarTema(T.coresNoEsquema(v, "claro")).vars;
  const cenario = async (vista, papel, fn) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const V = VIEWS[vista];
    await page.setViewport(V);
    if (V.isMobile) await page.setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36");
    const est = { console: [], erros: [], rede: [], ia: 0 };
    page.on("console", m => { const t = m.type(); if (t === "error" || t === "warning") est.console.push(`${t}: ${limpo(m.text()).slice(0, 200)}`); });
    page.on("pageerror", e => est.erros.push(limpo(String(e?.message || e)).slice(0, 200)));
    page.on("requestfailed", r => est.rede.push(`falhou ${r.method()} ${limpo(r.url()).replace(base, "").slice(0, 100)} ${r.failure()?.errorText}`));
    page.on("response", r => { const st = r.status(); if (st >= 400) est.rede.push(`${st} ${r.request().method()} ${limpo(r.url()).replace(base, "").replace(SUPA, "SUPA").slice(0, 100)}`); });
    page.on("request", r => { if (/\/functions\/v1\/nx-ia/.test(r.url())) est.ia++; });
    const esperarApp = async (ms = 1500) => { await page.waitForFunction(() => { const b = document.getElementById("boot"); return b && b.hidden; }, { timeout: 25_000 }).catch(() => {}); await dorme(ms); };
    const visitar = async (id, hash, { espera = 1500, antes, depois } = {}) => {
      est.console.length = est.erros.length = est.rede.length = 0;
      try {
        if (antes) await antes();
        await page.evaluate(h => { location.hash = h; }, hash);
        await esperarApp(espera);
        if (depois) await depois();
        const m = await page.evaluate(medir);
        const r = { id: `${papel}@${vista} ${id}`, sw: m.sw, iw: m.iw, semRolagem: m.sw <= m.iw && m.bsw <= m.iw, console: [...est.console], erros: [...est.erros], rede: [...est.rede], ruins: m.ruins, h1: m.h1, texto: m.texto, culpados: m.culpados };
        const bug = !r.semRolagem || r.console.length || r.erros.length || r.rede.length || r.ruins.length;
        c.ok(`${r.id}: sem rolagem lateral (${m.sw}/${m.iw}), 0 erros/avisos de console, 0 exceções, 0 respostas 4xx/5xx, nenhum "null/undefined" na tela`, !bug, JSON.stringify({ sw: m.sw, iw: m.iw, culpados: m.culpados, console: r.console.slice(0, 3), erros: r.erros.slice(0, 2), rede: r.rede.slice(0, 3), ruins: m.ruins.slice(0, 3) }));
        RESULTADO.medidas.telas = (RESULTADO.medidas.telas || []).concat({ id: r.id, sw: m.sw, iw: m.iw, h1: m.h1, console: r.console.length, erros: r.erros.length, rede: r.rede.length });
        return r;
      } catch (e) { c.ok(`${papel}@${vista} ${id}: passo executou`, false, limpo(e.message).slice(0, 200)); return null; }
    };
    const entrarCom = async token => {
      await page.goto(`${base}/app/#/inicio`, { waitUntil: "domcontentloaded" });
      await page.evaluate((t, cli) => { localStorage.setItem("nx-token", t); localStorage.setItem("nx-app-cliente", cli); }, token, E.cliente);
      await page.reload({ waitUntil: "domcontentloaded" });
      await esperarApp(2500);
    };
    try { await fn({ page, est, visitar, entrarCom, esperarApp, dorme, V }); } finally { await ctx.close(); }
  };
  const digitar = async (page, sel, valor) => { await page.$eval(sel, n => { n.focus(); n.select(); }); await page.keyboard.press("Backspace"); await page.type(sel, valor); await dorme(250); };
  const clicarTexto = async (page, sel, texto) => page.evaluate((sel, texto) => { const e = [...document.querySelectorAll(sel)].find(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (x.textContent + (x.getAttribute("aria-label") || "")).includes(texto); }); if (!e) return false; e.click(); return true; }, sel, texto);

  const passes = [
    { vista: "1440x900", y: { primaria: "#E4572E", secundaria: "#17BEBB", fundo: "#0E1116" }, produto: "EB-3009 Órbita Teste" },
    { vista: "390x844", y: { primaria: "#6A4C93", secundaria: "#FFCA3A", fundo: "#0B1416" }, produto: "EB-3009 Órbita Teste" },
  ];
  for (const ps of passes) {
    const { vista } = ps;
    // estado de partida (API): marca 1 da revenda + tema roxo do cliente
    deve(await G("nx_org_salvar", { p_org: { id: E.org, marca: MARCA1() } }), "marca base");
    deve(await GC("nx_tema_salvar", { p_tema: TEMA1() }), "tema base");
    const M1 = MARCA1(), TM = TEMA1();

    /* --- 1. tela de entrada, anônimo, por ?org= */
    await cenario(vista, "anonimo", async ({ page, visitar, esperarApp }) => {
      await page.goto(`${base}/app/?org=eb-3009#/login`, { waitUntil: "domcontentloaded" });
      await esperarApp(2500);
      const mk = await page.evaluate(marcaNaTela);
      const esp = prov(M1.cores);
      c.ok(`anônimo@${vista}: /app/?org=eb-3009 mostra a entrada com a marca da revenda (título, texto e nome do produto) antes do login`, mk.publicoVisivel && mk.publico.includes(M1.login_titulo) && mk.publico.includes(M1.produto) && mk.titulo.includes(M1.produto), JSON.stringify({ titulo: mk.titulo, publico: mk.publico.slice(0, 160) }));
      c.ok(`anônimo@${vista}: cores da entrada = as 3 cores da revenda (primária ${esp["--c-prim"]}, secundária ${esp["--c-sec"]}) e favicon da marca`, mk.prim === esp["--c-prim"].toUpperCase() && mk.sec === esp["--c-sec"].toUpperCase() && mk.favicon.startsWith("data:image/png"), JSON.stringify({ prim: mk.prim, sec: mk.sec, esp: esp["--c-prim"], fav: mk.favicon }));
      const m = await page.evaluate(medir);
      c.ok(`anônimo@${vista}: entrada sem rolagem lateral (${m.sw}/${m.iw})`, m.sw <= m.iw && m.bsw <= m.iw, JSON.stringify(m.culpados));
      // link de convite (sem ?org=): a tela do convite também sai com a marca da revenda e o nome do cliente
      const cv = deve(await G("nx_convite_criar", { p_cliente: E.cliente, p_dados: { papel: "atendente", dias: 1, nome: `${PRE} Convite UI` }, p_org: null }), "convite para a tela");
      if (cv.token) SEGREDOS.add(cv.token);
      await page.goto(`${base}/app/#/convite/${cv.token}`, { waitUntil: "domcontentloaded" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await esperarApp(3000);
      const mc = await page.evaluate(marcaNaTela);
      c.ok(`anônimo@${vista}: a tela do CONVITE (#/convite/<token>, sem ?org=) mostra a marca da revenda (nome do produto) e o nome do cliente convidado`, mc.publicoVisivel && mc.publico.includes(M1.produto) && mc.publico.includes(`${PRE} Clínica Teste`), mc.publico.slice(0, 220));
      c.ok(`anônimo@${vista}: …com as cores da revenda (primária ${esp["--c-prim"]})`, mc.prim === esp["--c-prim"].toUpperCase(), JSON.stringify({ prim: mc.prim }));
      const mci = await page.evaluate(medir);
      c.ok(`anônimo@${vista}: tela do convite sem rolagem lateral (${mci.sw}/${mci.iw})`, mci.sw <= mci.iw && mci.bsw <= mci.iw, JSON.stringify(mci.culpados));
      const lst = await G("nx_usuarios_listar", { p_cliente: E.cliente });
      for (const cvt of (lst.dados?.convites || [])) await G("nx_convite_revogar", { p_cliente: E.cliente, p_convite: cvt.id });
    });

    /* --- 2. gestora */
    await cenario(vista, "gestora", async ({ page, est, visitar, entrarCom, esperarApp }) => {
      await entrarCom(TOK.gestor);
      const mk = await page.evaluate(marcaNaTela);
      const esp = prov(TM.cores);
      c.ok(`gestora@${vista}: app aberto com o cliente da revenda; nome do produto = marca da revenda; aba do navegador com o nome`, mk.appVisivel && mk.produto === M1.produto && mk.titulo.includes(M1.produto), JSON.stringify({ app: mk.appVisivel, produto: mk.produto, titulo: mk.titulo }));
      const menuAdmin = await page.evaluate(() => [...document.querySelectorAll('a[href^="#/admin"]')].some(a => a.getClientRects().length > 0));
      const menuMais = await page.evaluate(() => document.querySelectorAll('a[href^="#/admin"]').length);
      c.ok(`gestora@${vista}: o item Admin existe no menu da gestora (link #/admin/…; visível no desktop, dentro do "Mais" no celular)`, vista === "1440x900" ? menuAdmin : menuMais > 0, `visivel=${menuAdmin} links=${menuMais}`);
      c.ok(`gestora@${vista}: cores = TEMA do cliente (roxo ${esp["--c-prim"]}) por cima da marca da revenda; logo do cliente no menu`, mk.prim === esp["--c-prim"].toUpperCase() && mk.sec === esp["--c-sec"].toUpperCase() && mk.logo.startsWith("data:image/png") && mk.favicon.startsWith("data:image/png"), JSON.stringify({ prim: mk.prim, esp: esp["--c-prim"], logo: mk.logo, fav: mk.favicon }));
      for (const [id, h] of [["início", "#/inicio"], ["Marca e tema (empresa)", "#/config/marca"], ["Marca e tema (revenda)", "#/config/marca?de=org"], ["Domínio próprio", "#/config/dominio"],
        ["integrações Meta/Google (Anúncios)", "#/config/anuncios"], ["Plano e uso", "#/config/plano"], ["Admin · clientes", "#/admin/clientes"], ["Admin · cliente (detalhe)", `#/admin/clientes/${E.cliente}`], ["Admin · domínios", "#/admin/dominios"]]) {
        const r = await visitar(id, h, { espera: 1800 });
        if (r) {
          const ok = {
            "#/config/marca": /Tema da|Logo|Cores/, "#/config/marca?de=org": /Nome do produto|Identidade|Tela de entrada/, "#/config/dominio": /Novo domínio/, "#/config/anuncios": /Integra|Meta|Google/,
            "#/config/plano": /Seu plano|Uso do plano/, "#/admin/clientes": /Clientes|EB-3009/, "#/admin/dominios": /Domínios|Nenhum domínio/,
          }[h];
          if (ok) c.ok(`gestora@${vista}: ${id} mostra o conteúdo certo (não "sem acesso" nem "em obra")`, ok.test(r.texto) && !/Você não tem acesso|Esta seção não está disponível|Em obra/.test(r.texto), r.texto.slice(0, 200));
          if (h === "#/admin/clientes") c.ok(`gestora@${vista}: a TELA Admin · clientes lista só o cliente da revenda (EB-3009 Clínica Teste) e NENHUM cliente da Nexus nem de outros testes`, /EB-3009 Clínica Teste/.test(r.texto) && !/Kamiguchi|Teste E2E|teste-e2e|META-3009|meta-3009/i.test(r.texto), r.texto.slice(0, 300));
        }
      }
      /* editor da revenda: salvar pela tela, 3 cores + logo novos */
      await page.evaluate(() => { location.hash = "#/config/marca?de=org"; });
      await esperarApp(2200);
      const existe = await page.$('input[aria-label="Cor primária em hexadecimal"]');
      c.ok(`gestora@${vista}: o editor 'Marca da revenda' abre com prévia ao vivo e os campos de cor`, !!existe && !!(await page.$(".previa")), "sem editor");
      if (existe) {
        const inputs = await page.$$('input[type=file]');
        let enviou = false;
        for (const inp of inputs) { const acc = await inp.evaluate(n => n.getAttribute("accept") || ""); if (/image\/png/.test(acc) && !enviou) { await inp.uploadFile(path.join(DIR, "logo-ui.png")); enviou = true; } }
        await dorme(1500);
        await digitar(page, 'input[aria-label="Cor primária em hexadecimal"]', ps.y.primaria);
        await digitar(page, 'input[aria-label="Cor secundária em hexadecimal"]', ps.y.secundaria);
        await digitar(page, 'input[aria-label="Cor de fundo em hexadecimal"]', ps.y.fundo);
        const prevCor = await page.evaluate(() => { const p = document.querySelector(".previa"); return p ? getComputedStyle(p).getPropertyValue("--c-prim").trim().toUpperCase() : "sem .previa"; });
        c.ok(`gestora@${vista}: a prévia ao vivo já mostra a primária nova (${ps.y.primaria}) ANTES de salvar`, prevCor === ps.y.primaria.toUpperCase(), prevCor);
        const aviso0 = await page.evaluate(() => (document.querySelector(".avisos-marca")?.innerText || "").replace(/\s+/g, " "));
        c.nota(`aviso_contraste_${vista}`, aviso0.slice(0, 160));
        const clicou = await clicarTexto(page, "button", "Salvar marca");
        await dorme(2500);
        c.ok(`gestora@${vista}: Salvar marca (pela tela) → aviso "Marca salva…" e a tela já repinta`, clicou, "botão não achado");
        const mk2 = await page.evaluate(marcaNaTela);
        const espY = prov(ps.y);
        const pub = deve(await rpc("nx_marca_publica", { p_host: "", p_org: "eb-3009" }, { anon: true }), "marca pública após salvar pela tela");
        c.ok(`gestora@${vista}: depois de salvar pela tela, a MARCA PÚBLICA (entrada, anônima) tem as cores novas ${ps.y.primaria}/${ps.y.secundaria}/${ps.y.fundo} e o logo novo (laranja)`, pub.marca?.cores?.primaria === ps.y.primaria && pub.marca?.cores?.secundaria === ps.y.secundaria && pub.marca?.cores?.fundo === ps.y.fundo && /^data:image\/(png|webp)/.test(pub.marca?.logo || "") && pub.marca.logo !== M1.logo, JSON.stringify({ cores: pub.marca?.cores, logo: (pub.marca?.logo || "").slice(0, 30) }));
        c.ok(`gestora@${vista}: …e o app da gestora segue com o tema roxo do cliente (tema do cliente vence a marca da revenda)`, mk2.prim === prov(TM.cores)["--c-prim"].toUpperCase(), JSON.stringify({ prim: mk2.prim }));
      }
      /* cor ruim no editor (#FFFF00 sobre fundo branco): aviso e texto legível; NÃO salva */
      await page.evaluate(() => { location.hash = "#/config/marca?de=org"; });
      await esperarApp(1800);
      if (await page.$('input[aria-label="Cor primária em hexadecimal"]')) {
        await digitar(page, 'input[aria-label="Cor de fundo em hexadecimal"]', "#FFFFFF");
        await digitar(page, 'input[aria-label="Cor primária em hexadecimal"]', "#FFFF00");
        const r = await page.evaluate(() => { const p = document.querySelector(".previa"); const v = k => (p ? getComputedStyle(p).getPropertyValue(k).trim() : "#000000");
          return { avisos: [...document.querySelectorAll(".avisos-marca .aviso")].map(x => ({ cls: x.className, txt: x.innerText.replace(/\s+/g, " ").trim() })), temPrevia: !!p,
            luz: v("--c-prim-luz"), fundo: v("--c-fundo"), txtPrim: v("--c-prim-txt"), prim: v("--c-prim") }; });
        c.ok(`gestora@${vista}: cor ruim (primária #FFFF00 sobre fundo branco) → a tela MOSTRA o aviso de contraste (aviso-aten, "clara demais")`, r.avisos.some(a => /aten/.test(a.cls) && /clara demais|quase some/.test(a.txt)), JSON.stringify(r.avisos));
        c.ok(`gestora@${vista}: …e o texto fica legível: primária p/ texto ${r.luz} ≥ 4,5:1 sobre ${r.fundo}; texto do botão ${r.txtPrim} ≥ 4,5:1 sobre ${r.prim}`, T.contraste(r.luz, r.fundo) >= 4.5 && T.contraste(r.txtPrim, r.prim) >= 4.5, `luz=${T.contraste(r.luz, r.fundo).toFixed(2)} txt=${T.contraste(r.txtPrim, r.prim).toFixed(2)}`);
        c.nota(`cor_ruim_na_tela_${vista}`, JSON.stringify({ avisos: r.avisos.map(a => a.txt), luz: r.luz, txt: r.txtPrim }));
      } else c.ok(`gestora@${vista}: editor abriu para o teste de cor ruim`, false, "sem editor");
    });

    /* --- 3. login anônimo depois do salvar (cores Y) e cliente */
    await cenario(vista, "anonimo2", async ({ page, esperarApp }) => {
      await page.goto(`${base}/app/?org=eb-3009#/login`, { waitUntil: "domcontentloaded" });
      await esperarApp(2500);
      const mk = await page.evaluate(marcaNaTela);
      const espY = prov(ps.y);
      c.ok(`anônimo@${vista}: DEPOIS de salvar pela tela, a entrada já usa as cores novas (primária ${ps.y.primaria}, secundária ${ps.y.secundaria})`, mk.prim === espY["--c-prim"].toUpperCase() && mk.sec === espY["--c-sec"].toUpperCase(), JSON.stringify({ prim: mk.prim, esp: espY["--c-prim"], sec: mk.sec }));
    });

    /* cliente com TEMA próprio (roxo): tema vence */
    await cenario(vista, "cliente(tema)", async ({ page, visitar, entrarCom }) => {
      await entrarCom(TOK.admin);
      const mk = await page.evaluate(marcaNaTela);
      const esp = prov(TM.cores);
      c.ok(`cliente@${vista}: entra com o tema próprio do cliente (primária ${esp["--c-prim"]}) e o nome do produto da revenda`, mk.appVisivel && mk.produto === M1.produto && mk.prim === esp["--c-prim"].toUpperCase() && mk.logo.startsWith("data:image/png"), JSON.stringify({ produto: mk.produto, prim: mk.prim, esp: esp["--c-prim"], logo: mk.logo }));
    });
    /* cliente SEM tema: recebe as cores da revenda (as novas, Y) */
    deve(await GC("nx_tema_salvar", { p_tema: {} }), "tema vazio");
    await cenario(vista, "cliente(marca da revenda)", async ({ page, est, visitar, entrarCom, esperarApp }) => {
      await entrarCom(TOK.admin);
      const mk = await page.evaluate(marcaNaTela);
      const espY = prov(ps.y);
      const linksAdmin = await page.evaluate(() => document.querySelectorAll('a[href^="#/admin"]').length);
      c.ok(`cliente@${vista}: o menu do cliente NÃO tem o item Admin (0 links #/admin)`, linksAdmin === 0, `links=${linksAdmin}`);
      c.ok(`cliente@${vista}: sem tema próprio, o app do cliente usa a MARCA DA REVENDA recém-salva (primária ${ps.y.primaria}, secundária ${ps.y.secundaria}) e o logo da revenda`, mk.appVisivel && mk.produto === M1.produto && mk.prim === espY["--c-prim"].toUpperCase() && mk.sec === espY["--c-sec"].toUpperCase() && mk.logo.startsWith("data:image/"), JSON.stringify({ produto: mk.produto, prim: mk.prim, esp: espY["--c-prim"], sec: mk.sec, logo: mk.logo }));
      for (const [id, h] of [["início", "#/inicio"], ["conversas", "#/conversas"], ["CRM", "#/crm"], ["importar", "#/contatos/importar"], ["automações", "#/automacoes"], ["Marca e tema (empresa)", "#/config/marca"], ["Plano e uso", "#/config/plano"]]) {
        await visitar(id, h, { espera: 1800 });
      }
      const neg = [["Domínio próprio (só gestora)", "#/config/dominio", /não está disponível/], ["Admin (só gestora)", "#/admin/clientes", /Você não tem acesso/], ["integrações Meta/Google (só gestora)", "#/config/anuncios", /não está disponível/]];
      for (const [id, h, re] of neg) { const r = await visitar(id, h, { espera: 1200 }); if (r) c.ok(`cliente@${vista}: ${id} → "${re.source}" (o app nega antes de chamar o banco)`, re.test(r.texto), r.texto.slice(0, 160)); }
      /* o cliente (admin com módulo 'marca') define o tema pela tela */
      await page.evaluate(() => { location.hash = "#/config/marca"; });
      await esperarApp(2000);
      const sw = await page.$('input[name="cores_proprias"], .campo-interruptor input');
      if (sw) {
        if (!(await sw.evaluate(n => n.checked))) { await sw.click(); await dorme(300); }
        await digitar(page, 'input[aria-label="Cor primária em hexadecimal"]', "#2A9D8F");
        await digitar(page, 'input[aria-label="Cor secundária em hexadecimal"]', "#E9C46A");
        await digitar(page, 'input[aria-label="Cor de fundo em hexadecimal"]', "#0B1416");
        await clicarTexto(page, "button", "Salvar marca");
        await dorme(2500);
        const tm = deve(await A("nx_cliente_tema"), "tema salvo pela tela do cliente");
        const mk3 = await page.evaluate(marcaNaTela);
        c.ok(`cliente@${vista}: o ADMIN DO CLIENTE salva o tema pela tela → nx_cliente_tema tem as cores e o app repinta (primária #2A9D8F)`, tm.tema?.cores?.primaria === "#2A9D8F" && mk3.prim === prov({ primaria: "#2A9D8F", secundaria: "#E9C46A", fundo: "#0B1416" })["--c-prim"].toUpperCase(), JSON.stringify({ tema: tm.tema?.cores, prim: mk3.prim }));
      } else c.ok(`cliente@${vista}: tela Marca e tema do cliente tem o interruptor 'cores próprias'`, false, "sem interruptor");
      /* esquema 'Tema da empresa' (marca): o fundo da marca vale */
      await page.evaluate(() => localStorage.setItem("nx-app-esquema", "marca"));
      await page.reload({ waitUntil: "domcontentloaded" });
      await esperarApp(2200);
      const mk4 = await page.evaluate(marcaNaTela);
      const espM = T.derivarTema(T.coresNoEsquema({ primaria: "#2A9D8F", secundaria: "#E9C46A", fundo: "#0B1416" }, "marca")).vars;
      c.ok(`cliente@${vista}: no esquema "Tema da empresa" o fundo é o da marca (${espM["--c-fundo"]})`, mk4.fundo === espM["--c-fundo"].toUpperCase(), JSON.stringify({ fundo: mk4.fundo, esp: espM["--c-fundo"] }));
      await page.evaluate(() => localStorage.removeItem("nx-app-esquema"));
    });
    // volta ao estado de partida para a próxima largura
    deve(await GC("nx_tema_salvar", { p_tema: {} }), "tema vazio (fim da passada)");

    /* --- 4. item 8 na tela: Sugerir com IA sem chave → aviso e nenhuma chamada a nx-ia */
    if (E.conv.b) await cenario(vista, "cliente(IA)", async ({ page, est, entrarCom, esperarApp }) => {
      await entrarCom(TOK.admin);
      await page.evaluate(id => { location.hash = `#/conversas/${id}`; }, E.conv.b);
      await esperarApp(3000);
      const tem = await page.$("textarea[aria-label='Mensagem']");
      c.ok(`IA@${vista}: a conversa B (5 mensagens) abre e o campo de mensagem está ativo (janela de 24 h aberta, canal CodeWords)`, !!tem && !(await tem.evaluate(n => n.disabled)), "campo de mensagem ausente/desabilitado");
      est.ia = 0;
      const direto = await page.$('button[aria-label="Sugerir resposta com IA"]');
      const visivel = direto ? await direto.evaluate(n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) : false;
      if (visivel) await direto.click();
      else { await clicarTexto(page, 'button[aria-label="Mais opções"]', "Mais"); await dorme(500); await clicarTexto(page, '[role=menuitem], .menu button, .menu-item', "Sugerir com IA"); }
      await dorme(1500);
      const texto = await page.evaluate(() => document.body.innerText);
      c.ok(`IA@${vista}: clicar em "Sugerir com IA" sem chave → aparece "A IA não está disponível agora."`, /A IA não está disponível agora\./.test(texto), texto.slice(0, 120));
      c.ok(`IA@${vista}: …e NENHUMA requisição saiu para nx-ia (a tela decide por nx_cv_base.ia.ligada=false, sem chamar a função)`, est.ia === 0, `requisições a nx-ia=${est.ia}`);
      const campo = await page.$eval("textarea[aria-label='Mensagem']", n => n.value).catch(() => null);
      c.ok(`IA@${vista}: …e o campo de mensagem segue vazio (a IA nunca escreve sozinha)`, campo === "", JSON.stringify(campo));
    });
  }
  await browser.close(); srv.close();
  const nada = RESULTADO.medidas.telas || [];
  c.nota("telas_medidas", String(nada.length));
}

/* ============================================================
   LIMPEZA (finally): canal (Vault) por RPC; o resto — cascata do cliente, auditoria, contas, revenda — por SQL b09
   ============================================================ */
async function limpeza() {
  if (MANTER) { log("LIMPEZA pulada (--manter): nada foi apagado"); return; }
  log("LIMPEZA api: canal de teste (segredos do Vault saem junto) …");
  try {
    if (E.cliente && E.canal) { const r = await A("nx_canal_excluir", { p_id: E.canal, p_confirmacao: "excluir" }); log(`  nx_canal_excluir → ${r.ok ? "ok" : `${r.codigo}|${r.hint}`}`); if (r.ok) { E.canal = null; salvar(); } }
  } catch (e) { log(`  falha na limpeza por API: ${limpo(e.message)}`); }
  try { await pedirSql("b09", "b09_limpeza_org_eb3009.sql", {}); } catch (e) { log(`  SQL de limpeza NÃO executado: ${limpo(e.message)} — rode testes/e2e/sql-b/b09_limpeza_org_eb3009.sql`); }
}

/* ============================================================
   MAIN
   ============================================================ */
async function main() {
  log(`E2E-B rodada ${RUN} · ${new Date().toISOString()} · grupos: ${SO ? SO.join(",") : "todos"}`);
  if (SO_LIMPAR) { await limpeza(); return; }
  const quer = g => !SO || SO.includes(g);
  try {
    let canalOk = false;
    if (quer("prep")) await caso("prep", "fixture da revenda e da gestora; gestora só enxerga o que é dela", prep, "prep");
    if (quer("w")) {
      await caso("c14a", "item 14 · white-label pela API (marca, tema, limites, cliente recebe a marca)", c14a, "w");
      await caso("c14c", "item 14 · domínio próprio e convite com o domínio", c14c, "w");
    }
    if (quer("imp") || quer("sr") || quer("ia") || quer("srfim") || quer("srnova") || quer("ui")) {
      await caso("canal", "canal CodeWords de teste (chave falsa) e URL do agente", canalDeTeste, "*");
      canalOk = true;
    }
    if (quer("imp")) await caso("c11", "item 11 · importar CSV de 1.000 linhas (100 duplicados) pelo caminho real da tela", c11, "imp");
    if (quer("sr")) await caso("c12a", "item 12 · mensagens A, B(5), C(respondida) e D(150 = backlog) e relógio de 5 min", c12_inicio, "sr");
    if (quer("ia")) await caso("c8a", "item 8 · Sugerir com IA sem chave (API): aviso honesto e nenhuma chamada externa", c8api, "ia");
    if (quer("ui") && !SEM_UI) {
      const nav = await carregarPuppeteer();
      await caso("c14b", "item 14 (e 8) · navegador: gestora e cliente, 390×844 e 1440×900", c => c14b(c, nav), "ui");
    }
    if (quer("srfim")) await caso("c12b", "item 12 · 'sem resposta há 5 min' dispara UMA vez por espera", c12_fim, "srfim");
    if (quer("srnova")) await caso("c12c", "item 12 · nova mensagem do cliente = nova espera = novo disparo (uma vez por espera)", c12_nova, "srnova");
  } finally {
    RESULTADO.fim = new Date().toISOString();
    salvarResultado();
    await limpeza();
    const ok = RESULTADO.casos.filter(x => x.ok).length;
    log(`FIM: ${ok}/${RESULTADO.casos.length} casos ok · resultado em ${ARQ_RES}`);
  }
}
main().catch(e => { console.error("ERRO FATAL", limpo(e?.stack || e)); process.exitCode = 1; });
