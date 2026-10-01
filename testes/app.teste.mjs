/* ============================================================
   ÓRBITA — testes do app novo (web/app), Node puro, sem dependências
   node testes/app.teste.mjs
   (a) tema.js: derivarTema com 30 marcas aleatórias (contraste), marca efetiva, validação
   (b) rotas.js: rotear todas as rotas do §7.2, acesso (em breve, plano, papel), rota padrão
   (c) vocab.js: vocabulário completo nas 4 verticais
   (d) api.js com fetch falso: p_token/p_cliente, .codigo/.hint, sessao_invalida, fn, 57014, {ok:false}
   (e) pulso.js com relógio falso: intervalos, só avisa quando muda, para sem sessão
   (f) ui.js (funções puras): moeda, telefone, datas no fuso de SP
   (g) estáticos: CSP (sem <script> inline nem on*=), nenhum hex fora de :root/tema.js, [hidden] forte,
       nenhum 1fr solto, innerHTML só constante, nenhum import estático, import() sempre com ?v=,
       módulos não carregam ui/api/app/tema, arquivos do §7.1 existem e passam em node --check
   Os arquivos de OUTRAS frentes que ainda não existem só geram aviso; com ORBITA_COMPLETO=1
   (a F8 usa no rodar-tudo, depois de todas as frentes) a falta vira falha.
   ============================================================ */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const APP = join(RAIZ, "web", "app");
const ler = f => readFileSync(join(APP, f), "utf8");
const COMPLETO = process.env.ORBITA_COMPLETO === "1";

let ok = 0, falhas = 0, avisos = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log(`  ✓ ${nome}`); }
  catch (e) { falhas++; console.log(`  ✗ ${nome}\n      ${String(e && e.message || e).split("\n").join("\n      ")}`); }
}
function aviso(txt) { avisos++; console.log(`  ! ${txt}`); }
const imp = f => import(pathToFileURL(join(APP, f)).href);

const T = await imp("tema.js");
const R = await imp("rotas.js");
const V = await imp("vocab.js");
const A = await imp("api.js");
const P = await imp("pulso.js");
const U = await imp("ui.js");
const CFG = await imp("config.js");

/* ============================================================ (a) TEMA */
console.log("\n(a) tema.js");

await teste("Admin: a RPC de domínios precisa devolver array com host/status válidos", () => {
  assert.deepEqual(CFG.validarListaDominios([]), []);
  const linhas = [{ host: "crm.exemplo.com.br", status: "pendente" }, { host: "app.exemplo.com.br", status: "ativo" }];
  assert.deepEqual(CFG.validarListaDominios(linhas), linhas);
  for (const invalido of [null, {}, [{ host: "crm.exemplo.com.br" }], [null], [{ host: 7, status: "ativo" }], [{ host: "a.com", status: "removido" }]]) {
    assert.throws(() => CFG.validarListaDominios(invalido), e => e.codigo === "resposta_invalida" && /lista de domínios inválida/.test(e.message));
  }
});
// gerador determinístico (mulberry32) para as 30 marcas "aleatórias"
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const sorte = rng(20260928);
const corAleatoria = () => "#" + Array.from({ length: 3 }, () => Math.floor(sorte() * 256).toString(16).padStart(2, "0")).join("").toUpperCase();
const marcas = Array.from({ length: 30 }, () => ({ primaria: corAleatoria(), secundaria: corAleatoria(), fundo: corAleatoria() }));
// casos difíceis de propósito
marcas.push({ primaria: "#FFFF00", secundaria: "#FFFFFF", fundo: "#FFFFFF" }, { primaria: "#777777", secundaria: "#808080", fundo: "#7A7A7A" },
  { primaria: "#000000", secundaria: "#050505", fundo: "#000000" }, { primaria: "#145C66", secundaria: "#6FA3CF", fundo: "#07090C" });

await teste("derivarTema: --c-prim-txt e --c-prim-luz ≥ 4,5:1 em 34 marcas (30 aleatórias + 4 difíceis)", () => {
  for (const m of marcas) {
    const { vars } = T.derivarTema(m);
    const ct = T.contraste(vars["--c-prim-txt"], vars["--c-prim"]);
    const cl = T.contraste(vars["--c-prim-luz"], vars["--c-fundo"]);
    assert.ok(ct >= 4.5, `prim-txt ${vars["--c-prim-txt"]} sobre ${vars["--c-prim"]} = ${ct.toFixed(2)} (${JSON.stringify(m)})`);
    assert.ok(cl >= 4.5, `prim-luz ${vars["--c-prim-luz"]} sobre ${vars["--c-fundo"]} = ${cl.toFixed(2)} (${JSON.stringify(m)})`);
  }
});
await teste("derivarTema: texto ≥ 7:1 sobre o fundo, sec-luz ≥ 4,5:1, status legíveis (ruim/ok-txt)", () => {
  for (const m of marcas) {
    const { vars } = T.derivarTema(m);
    assert.ok(T.contraste(vars["--c-texto"], vars["--c-fundo"]) >= 7, `texto ${JSON.stringify(m)}`);
    for (const fundo of ["--c-fundo", "--c-sup", "--c-sup-2", "--c-sup-3"]) {
      assert.ok(T.contraste(vars["--c-texto-3"], vars[fundo]) >= 4.5,
        `texto auxiliar ${vars["--c-texto-3"]} sobre ${fundo}=${vars[fundo]} (${JSON.stringify(m)})`);
    }
    assert.ok(T.contraste(vars["--c-sec-luz"], vars["--c-fundo"]) >= 4.5, `sec-luz ${JSON.stringify(m)}`);
    assert.ok(T.contraste(vars["--c-ruim-txt"], vars["--c-ruim"]) >= 4.5, "ruim-txt");
    for (const [k, v] of Object.entries(vars)) if (k !== "--esquema") assert.match(v, /^(#[0-9A-F]{6}|rgba\(\d+, \d+, \d+, [\d.]+\))$/, `${k} = ${v}`);
  }
});
await teste("tema claro padrão: pílulas de status (texto sobre o próprio fundo suave) chegam a 4,5:1", () => {
  // QA mobile autenticado 30/09: ok sobre ok-suave dava 4,12:1 e a pílula primária 4,44:1
  const { vars } = T.derivarTema(T.PADRAO.cores);
  for (const k of ["ok", "ruim", "aten", "info"]) {
    const c = T.contraste(vars[`--c-${k}`], vars[`--c-${k}-suave`]);
    assert.ok(c >= 4.5, `--c-${k} sobre --c-${k}-suave = ${c.toFixed(2)}`);
  }
  for (const [nome, luz, suave] of [["primária", "--c-prim-luz", "--c-prim-suave"], ["secundária", "--c-sec-luz", "--c-sec-suave"]]) {
    const texto = T.misturar(vars[luz], vars["--c-texto"], 0.22);   // o mesmo color-mix(… 78%, var(--c-texto)) do app.css
    const c = T.contraste(texto, vars[suave]);
    assert.ok(c >= 4.5, `pílula ${nome}: ${c.toFixed(2)}`);
  }
});
await teste("derivarTema: padrão claro, preferência visual preserva a marca e fundo claro/escuro é coerente", () => {
  assert.equal(T.derivarTema(T.PADRAO.cores).vars["--esquema"], "claro");
  const padrao = T.derivarTema(T.PADRAO.cores);
  assert.ok(padrao.avisos.some(a => a.campo === "primaria"), "o bronze preserva a marca e usa tom acessível em links");
  assert.ok(T.contraste(padrao.vars["--c-prim-luz"], padrao.vars["--c-fundo"]) >= 4.5);
  assert.deepEqual(T.coresNoEsquema({ primaria: "#123456", secundaria: "#654321", fundo: "#121212" }, "claro"),
    { primaria: "#123456", secundaria: "#654321", fundo: T.FUNDOS_ESQUEMA.claro });
  assert.equal(T.coresNoEsquema({ fundo: "#121212" }, "escuro").fundo, T.FUNDOS_ESQUEMA.escuro);
  assert.equal(T.coresNoEsquema({ fundo: "#F4F1EA" }, "marca").fundo, "#F4F1EA");
  const claro = T.derivarTema({ primaria: "#FFFF00", secundaria: "#6FA3CF", fundo: "#FFFFFF" });
  assert.equal(claro.vars["--esquema"], "claro");
  assert.ok(claro.avisos.some(a => a.campo === "primaria"), "aviso da primária amarela");
  assert.equal(claro.vars["--c-texto"], "#141A21");
  const inval = T.derivarTema({ primaria: "vermelho", secundaria: "#6FA3CF", fundo: "#07090C" });
  assert.equal(inval.vars["--c-prim"], T.PADRAO.cores.primaria);
  assert.ok(inval.avisos.some(a => a.campo === "primaria"));
});
await teste("antes.js aplica a preferência salva antes da primeira pintura e ignora cache incompatível", () => {
  function inicializar(pref, vars) {
    const estilos = {};
    const raiz = {
      style: { colorScheme: "", setProperty: (k, v) => { estilos[k] = v; } },
      dataset: {}, setAttribute(k, v) { this.dataset[k.replace(/^data-/, "")] = v; },
      classList: { add() {} },
    };
    const itens = new Map([["nx-app-esquema", pref]]);
    if (vars) itens.set("nx-app-marca", JSON.stringify({ host: "local", vars }));
    const storage = { getItem: k => itens.get(k) || null };
    const sandbox = { document: { documentElement: raiz, title: "Órbita", getElementById: () => null },
      window: { localStorage: storage }, localStorage: storage, location: { host: "local", search: "", hash: "#/crm" }, URLSearchParams };
    runInNewContext(ler("antes.js"), sandbox);
    return { esquema: raiz.dataset.esquema, colorScheme: raiz.style.colorScheme, estilos };
  }
  const escuro = inicializar("escuro", { "--esquema": "claro", "--c-fundo": "#FAFAF8" });
  assert.equal(escuro.esquema, "escuro");
  assert.equal(escuro.colorScheme, "dark");
  assert.equal(escuro.estilos["--c-fundo"], undefined, "cache claro não substitui a preferência escura");
  const claro = inicializar("claro", { "--esquema": "claro", "--c-fundo": "#FAFAF8" });
  assert.equal(claro.esquema, "claro");
  assert.equal(claro.estilos["--c-fundo"], "#FAFAF8", "cache correspondente evita flash");
});
await teste("PALETA: 12 cores #RRGGBB, as 7 do Apêndice A + 5", () => {
  assert.equal(T.PALETA.length, 12);
  for (const c of T.PALETA) assert.match(c, /^#[0-9A-F]{6}$/);
  for (const c of ["#6FA3CF", "#8FB8DD", "#E5B35C", "#C9BFAF", "#7FD1A5", "#F08A74", "#9D9486", "#B0761F", "#CF9540", "#A98BD6", "#5FB3A8", "#D67FA3"]) assert.ok(T.PALETA.includes(c), c);
  assert.equal(new Set(T.PALETA).size, 12);
});
await teste("marcaEfetiva: cores do tema do cliente → reserva do painel → org → padrão (chave a chave)", () => {
  const org = { produto: "Conecta", cores: { primaria: "#2255CC", secundaria: "#22AA88", fundo: "#0A0F1A" }, logo: "data:image/svg+xml;base64,AAAA" };
  const m1 = T.marcaEfetiva(org, { cores: { primaria: "#AA3300" } });
  assert.deepEqual(m1.cores, { primaria: "#AA3300", secundaria: "#22AA88", fundo: "#0A0F1A" });
  assert.equal(m1.produto, "Conecta");
  assert.equal(m1.logo, null, "SVG nunca vira logo");
  const m2 = T.marcaEfetiva(org, {}, { corMarca: "#145C66" });
  assert.equal(m2.cores.primaria, "#145C66");
  const m3 = T.marcaEfetiva({}, {});
  assert.deepEqual(m3.cores, { ...T.PADRAO.cores });
  assert.equal(m3.produto, "Órbita");
});
await teste("imagemSegura / validarMarca (espelha marca_invalida do servidor)", () => {
  assert.equal(T.imagemSegura("data:image/png;base64,iVBORw0KGgo="), "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(T.imagemSegura("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(T.imagemSegura("javascript:alert(1)"), null);
  assert.equal(T.imagemSegura("https://x.com/logo.svg"), null);
  assert.equal(T.imagemSegura("https://x.com/logo.webp"), "https://x.com/logo.webp");
  assert.deepEqual(T.validarMarca({ produto: "Órbita", cores: { primaria: "#B0761F" }, suporte_wa: "5512999998888" }), []);
  const e = T.validarMarca({ cores: { primaria: "B0761F" }, suporte_wa: "(12) 9999", produto: "x".repeat(41), qualquer: 1 });
  for (const c of ["cores.primaria", "suporte_wa", "produto", "qualquer"]) assert.ok(e.some(x => x.campo === c), c);
  assert.ok(T.validarMarca({ produto: "X" }, true).some(x => x.campo === "produto"), "tema só aceita logo e cores");
});
await teste("coresSugeridas: descarta transparente/cinza e ordena por frequência", () => {
  const px = [];
  const pinta = (r, g, b, a, n) => { for (let i = 0; i < n; i++) px.push(r, g, b, a); };
  pinta(200, 40, 40, 255, 30); pinta(40, 40, 200, 255, 10); pinta(128, 128, 128, 255, 50); pinta(255, 0, 0, 0, 50);
  const c = T.coresSugeridas(px);
  assert.equal(c.length, 2);
  assert.equal(c[0], "#C82828");
});

/* ============================================================ (b) ROTAS */
console.log("\n(b) rotas.js");
await teste("rotear: exemplo do §7.2 e todas as rotas", () => {
  assert.deepEqual(R.rotear("#/crm/negocio/42?c=clinica-x"), { modulo: "crm", partes: ["negocio", "42"], query: { c: "clinica-x" } });
  const casos = {
    "#/login": ["login", []], "#/convite/abc": ["convite", ["abc"]], "#/senha/xyz": ["senha", ["xyz"]], "#/inicio": ["inicio", []],
    "#/conversas": ["conversas", []], "#/conversas/7": ["conversas", ["7"]], "#/crm": ["crm", []], "#/contatos": ["contatos", []],
    "#/contatos/9": ["contatos", ["9"]], "#/contatos/importar": ["contatos", ["importar"]], "#/empresas/3": ["empresas", ["3"]],
    "#/tarefas": ["tarefas", []], "#/anuncios/campanhas": ["anuncios", ["campanhas"]], "#/anuncios/radar": ["anuncios", ["radar"]],
    "#/anuncios/relatorios": ["anuncios", ["relatorios"]], "#/automacoes/nova": ["automacoes", ["nova"]], "#/automacoes/5": ["automacoes", ["5"]],
    "#/relatorios/vendas": ["relatorios", ["vendas"]], "#/relatorios/atendimento": ["relatorios", ["atendimento"]], "#/config": ["config", []],
    "#/config/usuarios": ["config", ["usuarios"]], "#/admin": ["admin", []], "#/admin/clientes/uuid-1": ["admin", ["clientes", "uuid-1"]],
    "#/admin/revendas": ["admin", ["revendas"]], "#/admin/planos": ["admin", ["planos"]], "#/admin/dominios": ["admin", ["dominios"]],
  };
  for (const [h, [m, p]] of Object.entries(casos)) {
    const r = R.rotear(h);
    assert.equal(r.modulo, m, h); assert.deepEqual(r.partes, p, h);
    assert.ok(R.rotaDe(m), `rota ${m} existe`);
  }
  assert.deepEqual(R.rotear("#/conversas?contato=12").query, { contato: "12" });
  assert.deepEqual(R.rotear("#/crm?funil=abc&c=x").query, { funil: "abc", c: "x" });
  assert.equal(R.rotear("").modulo, null);
  assert.equal(R.rotear("#/").modulo, null);
  assert.deepEqual(R.rotear("#/contatos/Jo%C3%A3o").partes, ["João"]);
});
await teste("montarHash é o inverso de rotear", () => {
  const h = R.montarHash("crm", ["negocio", 42], { c: "clinica x", vazio: "" });
  assert.equal(h, "#/crm/negocio/42?c=clinica%20x");
  assert.deepEqual(R.rotear(h), { modulo: "crm", partes: ["negocio", "42"], query: { c: "clinica x" } });
});
await teste("acessoRota: fora de MODULOS_PRONTOS → 'em_breve'; plano; papel; admin só gestor", () => {
  const base = { pronto: () => false, temModulo: () => true, pode: () => true, gestorConta: false, temCliente: true };
  for (const m of ["inicio", "conversas", "crm", "contatos", "empresas", "tarefas", "anuncios", "automacoes", "relatorios"]) assert.equal(R.acessoRota(m, base), "em_breve", m);
  assert.equal(R.acessoRota("config", base), "ok");
  assert.equal(R.acessoRota("login", base), "ok");
  assert.equal(R.acessoRota("admin", base), "sem_acesso");
  assert.equal(R.acessoRota("admin", { ...base, gestorConta: true }), "ok");
  assert.equal(R.acessoRota("nada", base), "inexistente");
  const pronto = { ...base, pronto: () => true };
  assert.equal(R.acessoRota("anuncios", { ...pronto, temModulo: m => m !== "ads" }), "fora_do_plano");
  assert.equal(R.acessoRota("anuncios", { ...pronto, pode: min => R.rank(min) <= R.rank("atendente") }), "sem_acesso");
  assert.equal(R.acessoRota("crm", { ...pronto, temCliente: false }), "sem_cliente");
  assert.equal(R.acessoRota("config", { ...pronto, temCliente: false }), "ok");
});
await teste("rotaPadrao: início se pronto; senão o 1º módulo pronto (P0-A: conversas); sem cliente → admin/config", () => {
  const base = { pronto: k => ["conversas", "crm", "ads"].includes(k), temModulo: () => true, pode: () => true, gestorConta: false, temCliente: true };
  assert.equal(R.rotaPadrao(base), "conversas");
  assert.equal(R.rotaPadrao({ ...base, pronto: () => true }), "inicio");
  assert.equal(R.rotaPadrao({ ...base, temCliente: false, gestorConta: true }), "admin");
  assert.equal(R.rotaPadrao({ ...base, pronto: () => false }), "config");
  assert.ok(R.podePapel("super", "gestor") && !R.podePapel("atendente", "supervisor") && R.podePapel("leitura", null));
});
await teste("produtos separados: CRM, Nexus Ads e Atendimento compartilham o shell sem furar os gates", () => {
  assert.deepEqual(Object.keys(R.PRODUTOS), ["crm", "ads", "atendimento"]);
  for (const id of ["crm", "ads", "atendimento"]) assert.equal(R.produtoDe(`?produto=${id}`), id);
  assert.equal(R.produtoDe("?produto=admin"), null, "query inválida não cria app nem concede acesso");
  assert.equal(R.produtoInicial("crm"), "crm");
  assert.equal(R.produtoInicial("ads"), "anuncios");
  assert.equal(R.produtoInicial("atendimento"), "conversas");
  assert.equal(R.urlProduto("crm"), "/crm/");
  assert.equal(R.urlProduto("ads"), "/ads/");
  assert.equal(R.urlProduto("atendimento"), "/atendimento/");
  const fixos = [{ id: "config", fixo: true }, { id: "admin", fixo: true }];
  assert.deepEqual(R.itensDoProduto("crm", [{ id: "crm" }, { id: "conversas" }, ...fixos]).map(x => x.id), ["crm", "config", "admin"]);
  assert.deepEqual(R.itensDoProduto("ads", [{ id: "anuncios" }, { id: "crm" }, ...fixos]).map(x => x.id), ["anuncios", "config", "admin"]);
  assert.deepEqual(R.itensDoProduto("atendimento", [{ id: "conversas" }, { id: "crm" }, ...fixos]).map(x => x.id), ["conversas", "config", "admin"]);
  assert.equal(R.itensDoProduto(null, [{ id: "crm" }, { id: "conversas" }]).length, 2);
  assert.equal(R.rotaNoProduto("crm", "contatos"), true, "contatos é uma rota interna do CRM");
  assert.equal(R.rotaNoProduto("crm", "conversas"), false, "URL direta não atravessa para Atendimento");
  assert.equal(R.rotaNoProduto("ads", "crm"), false, "URL direta não atravessa para CRM");
  assert.equal(R.rotaNoProduto("atendimento", "conversas"), true);
  assert.equal(R.rotaNoProduto("atendimento", "config"), true, "configuração da empresa continua comum");
  assert.equal(R.rotaNoProduto("atendimento", "login"), true, "rotas públicas continuam disponíveis");
  assert.equal(R.rotaNoProduto("atendimento", "admin"), true, "Admin continua sujeito ao seu próprio gate de papel");
  assert.equal(R.rotaNoProduto(null, "automacoes"), true, "Órbita completo não ganha filtro de produto");
  assert.equal(R.produtoDaRota("crm"), "crm");
  assert.equal(R.produtoDaRota("contatos"), "crm", "contatos também abre no espaço CRM");
  assert.equal(R.produtoDaRota("conversas"), "atendimento");
  assert.equal(R.produtoDaRota("anuncios"), "ads");
  assert.equal(R.produtoDaRota("agenda"), "crm", "rota compartilhada usa CRM como destino padrão");
  assert.equal(R.produtoDaRota("config"), null, "rotas comuns não provocam troca de produto");
  assert.equal(R.produtoDaRota("inexistente"), null);
  const prontoTudo = { pronto: () => true, temModulo: () => true, pode: () => true, gestorConta: false, temCliente: true };
  assert.equal(R.rotaPadrao({ ...prontoTudo, produto: "crm" }), "crm");
  assert.equal(R.rotaPadrao({ ...prontoTudo, produto: "ads" }), "anuncios");
  assert.equal(R.rotaPadrao({ ...prontoTudo, produto: "atendimento" }), "conversas");
});
await teste("primeira conta: código de ativação e trava transacional antes de virar gestor aprovado", () => {
  const sql = readFileSync(join(RAIZ, "supabase/migrations/20260926_base_exportada.sql"), "utf8");
  const inicio = sql.indexOf("CREATE OR REPLACE FUNCTION public.nx_criar_conta(");
  const fim = sql.indexOf("$function$;", inicio);
  assert.ok(inicio >= 0 && fim > inicio, "RPC de cadastro inicial existe");
  const fn = sql.slice(inicio, fim);
  assert.match(fn, /pg_advisory_xact_lock\(hashtext\('nx_criar_conta'\)\)/, "duas primeiras contas não passam juntas");
  assert.match(fn, /select not exists \(select 1 from public\.nx_contas\) into v_primeira/i);
  assert.match(fn, /if v_primeira then[\s\S]*?codigo_gestor[\s\S]*?p_codigo[\s\S]*?codigo_invalido/i);
  assert.match(fn, /case when v_primeira then 'gestor' else 'clinica' end, v_primeira/i);
});

/* ============================================================ (c) VOCAB */
console.log("\n(c) vocab.js");
await teste("vocab completo nas 4 verticais (§7.6)", () => {
  const esperado = {
    odonto: ["Paciente", "Pacientes", "Oportunidade", "Oportunidades", "Procedimento", "Fechou", "Não fechou", "Pacientes"],
    oficina: ["Cliente", "Clientes", "Orçamento", "Orçamentos", "Serviço", "Aprovado", "Recusado", "Orçamentos"],
    loja: ["Cliente", "Clientes", "Venda", "Vendas", "Produto", "Vendido", "Não comprou", "Vendas"],
    generico: ["Contato", "Contatos", "Negócio", "Negócios", "Serviço", "Ganho", "Perdido", "CRM"],
  };
  for (const [vert, [c, cs, n, ns, s, g, p, crm]] of Object.entries(esperado)) {
    const v = V.vocab(vert);
    assert.deepEqual([v.contato, v.contatos, v.negocio, v.negocios, v.servico, v.ganhar, v.perder, v.crm], [c, cs, n, ns, s, g, p, crm], vert);
    for (const k of V.CHAVES) assert.ok(typeof v[k] === "string" && v[k].length > 1, `${vert}.${k}`);
  }
  assert.equal(V.vocab("xpto").vertical, "generico");
  assert.equal(V.vocab("odonto").nenhum("negocio"), "Nenhuma oportunidade");
  assert.equal(V.vocab("odonto").nenhum("contatos"), "Nenhum paciente");
  assert.equal(V.vocab("oficina").nenhum("negocio"), "Nenhum orçamento");
  assert.equal(V.vocab("loja").novo("negocio"), "Nova venda");
  assert.equal(V.vocab("odonto").min("contatos"), "pacientes");
});

/* ============================================================ (d) API */
console.log("\n(d) api.js com fetch falso");
function fetchFalso(respostas) {
  const chamadas = [];
  const f = async (url, init) => {
    chamadas.push({ url, init, corpo: JSON.parse(init.body) });
    const r = typeof respostas === "function" ? respostas(url, JSON.parse(init.body)) : respostas.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => (r.corpo === undefined ? "" : typeof r.corpo === "string" ? r.corpo : JSON.stringify(r.corpo)) };
  };
  f.chamadas = chamadas;
  return f;
}
const URLS = "https://exemplo.supabase.co";
await teste("rpc acrescenta p_token; rpcC acrescenta p_token e p_cliente; só apikey (nunca Authorization)", async () => {
  const f = fetchFalso([{ status: 200, corpo: { a: 1 } }, { status: 200, corpo: [1] }]);
  const api = A.criarApi({ url: URLS, chave: "pub", token: () => "tok", cliente: () => "cli-1", fetch: f });
  assert.deepEqual(await api.rpc("nx_app_sessao"), { a: 1 });
  assert.deepEqual(await api.rpcC("nx_pulso", { p_x: 2 }), [1]);
  assert.equal(f.chamadas[0].url, `${URLS}/rest/v1/rpc/nx_app_sessao`);
  assert.deepEqual(f.chamadas[0].corpo, { p_token: "tok" });
  assert.deepEqual(f.chamadas[1].corpo, { p_token: "tok", p_cliente: "cli-1", p_x: 2 });
  assert.equal(f.chamadas[0].init.headers.apikey, "pub");
  assert.equal(f.chamadas[0].init.headers.Authorization, undefined);
  assert.equal(f.chamadas[0].init.method, "POST");
});
await teste("erro do PostgREST → Error com .codigo e .hint; mensagemErro do Apêndice B", async () => {
  const f = fetchFalso([{ status: 400, corpo: { code: "P0001", message: "limite_plano", hint: "usuarios:3", details: null } }]);
  const api = A.criarApi({ url: URLS, chave: "pub", token: () => "t", cliente: () => "c", fetch: f });
  const e = await api.rpcC("nx_convite_criar").catch(x => x);
  assert.ok(e instanceof Error);
  assert.equal(e.codigo, "limite_plano"); assert.equal(e.hint, "usuarios:3"); assert.equal(e.status, 400);
  assert.equal(A.mensagemErro(e), "Seu plano permite até 3 usuários. Para aumentar, fale com o suporte.");
  assert.equal(A.mensagemErro({ codigo: "limite_plano", hint: "org_usuarios:3" }), "A sua agência chegou ao limite de 3 usuários somando todos os clientes.");
  assert.equal(A.mensagemErro({ codigo: "convite_invalido", hint: "conta_existente" }), "Este convite é só para uma conta nova. Peça outro convite ou use outro e-mail.");
  assert.equal(A.mensagemErro({ codigo: "funil_invalido", hint: "fechado_no_ads" }), "Negócio fechado no funil de anúncios não muda de funil. Use Iniciar pós-venda.");
  assert.equal(A.mensagemErro({ codigo: "motivo_obrigatorio", hint: "texto" }), "Escolha o motivo da perda e escreva a justificativa.");
  assert.equal(A.mensagemErro({ codigo: "marca_invalida", hint: "cores.primaria" }), "Confira o campo cor primária da marca.");
  assert.equal(A.mensagemErro({ codigo: "credenciais_invalidas" }), "E-mail ou senha não conferem.");
  assert.equal(A.mensagemErro({ codigo: "resposta_invalida" }), "O servidor respondeu em formato inesperado. Atualize os dados; se tentou salvar ou enviar, confira o resultado antes de repetir.");
  assert.match(A.mensagemErro({ codigo: "codigo_que_nao_existe" }), /^Não deu certo agora \(codigo_que_nao_existe\)/);
  for (const c of ["sem_permissao", "conta_suspensa", "teste_expirado", "modulo_desligado", "tempo_esgotado", "periodo_grande", "funcao_invalida",
    "so_plataforma", "link_invalido", "ultimo_admin", "nao_pode_alterar_a_si", "slug_em_uso", "dominio_em_uso", "numero_em_uso", "atalho_em_uso",
    "dominio_invalido", "telefone_em_uso", "dados_invalidos", "contato_nao_encontrado", "valor_obrigatorio", "conversa_resolvida", "ja_existe_aberta",
    "fora_da_janela", "canal_sem_token", "template_invalido", "midia_grande", "midia_tipo", "ia_indisponivel", "ia_cota", "muitos_pedidos", "limite_taxa", "resposta_invalida"]) {
    assert.ok(A.MENSAGENS[c], `texto para ${c}`);
  }
});
await teste("mensagemErro: TODO código de erro do painel devolvido por nx-enviar/nx-codewords/nx-midia/nx-ia tem texto em português (varredura do backend)", () => {
  const dir = join(RAIZ, "supabase/functions/_compartilhado");
  const so_agente = new Set(["payload_desconhecido", "acao_desconhecida", "agenda_indisponivel", "canal_invalido", "corpo_grande", "json_invalido", "falha_temporaria"]);   // só a API do fluxo de IA (não tem tela)
  const codigos = new Set();
  for (const f of ["enviar.js", "codewords.js", "midia.js", "ia_conversas.js", "comum.js"]) {
    const t = readFileSync(join(dir, f), "utf8");
    for (const m of t.matchAll(/(?:ErroApi|respostaErro)\(\s*"([a-z][a-z0-9_]{2,60})"/g)) codigos.add(m[1]);
    for (const m of t.matchAll(/\berro:\s*"([a-z][a-z0-9_]{2,60})"/g)) codigos.add(m[1]);
  }
  for (const c of so_agente) codigos.delete(c);
  codigos.delete("limite_taxa");
  assert.ok(codigos.size > 20, `varredura achou códigos (${codigos.size})`);
  assert.ok(codigos.has("codewords_sem_aparelho") && codigos.has("aparelho_desconectado") && codigos.has("erro_interno"), "a varredura enxerga os códigos novos");
  const sem = [...codigos].filter(c => !A.MENSAGENS[c] && !/_nao_encontrad[oa]$/.test(c));
  assert.deepEqual(sem, [], "códigos do backend sem mensagem em MENSAGENS");
  for (const c of ["codewords_sem_aparelho", "aparelho_nao_encontrado", "numero_diferente", "aparelho_desconectado", "metodo_invalido", "erro_interno"]) {
    assert.doesNotMatch(A.mensagemErro({ codigo: c }), /Não deu certo agora/, c);
  }
  assert.match(A.mensagemErro({ codigo: "codewords_sem_aparelho" }), /pareado no CodeWords/);
  // codewords_falhou mostra o motivo que o servidor já escreveu em português, sem o código técnico
  assert.equal(A.mensagemErro({ codigo: "codewords_falhou", detalhe_texto: "O CodeWords recusou a chave (cwk-) deste número." }), "O CodeWords recusou a chave (cwk-) deste número.");
  assert.equal(A.mensagemErro({ codigo: "codewords_falhou" }), "O CodeWords não concluiu o pedido. Tente de novo em instantes.");
});
await teste("sessao_invalida chama o callback do shell", async () => {
  let chamou = 0;
  const f = fetchFalso([{ status: 401, corpo: { code: "28000", message: "sessao_invalida" } }]);
  const api = A.criarApi({ url: URLS, chave: "pub", token: () => "t", cliente: () => "c", fetch: f, aoSessaoInvalida: () => chamou++ });
  const e = await api.rpc("nx_app_sessao").catch(x => x);
  assert.equal(e.codigo, "sessao_invalida"); assert.equal(chamou, 1);
});
await teste("57014 (statement timeout) → tempo_esgotado; rede fora → sem_conexao", async () => {
  const f = fetchFalso([{ status: 500, corpo: { code: "57014", message: "canceling statement due to statement timeout" } }, new TypeError("Failed to fetch")]);
  const api = A.criarApi({ url: URLS, chave: "pub", token: () => "t", cliente: () => "c", fetch: f });
  const e1 = await api.rpcC("nx_contatos_importar").catch(x => x);
  assert.equal(e1.codigo, "tempo_esgotado");
  assert.equal(A.mensagemErro(e1), "Operação grande demais; tente um período menor ou menos itens de uma vez.");
  const e2 = await api.rpc("nx_app_sessao").catch(x => x);
  assert.equal(e2.codigo, "sem_conexao");
  assert.equal(A.mensagemErro(e2), "A comunicação foi interrompida. Atualize os dados; se tentou salvar ou enviar, confira o resultado antes de repetir.");
  assert.equal(A.mensagemErro({ codigo: "tempo_rede" }), "O servidor demorou a responder. Atualize os dados; se tentou salvar ou enviar, confira o resultado antes de repetir.");
});
await teste("API encerra fetch pendente no prazo, aborta o transporte e devolve erro recuperável", async () => {
  let sinal;
  const api = A.criarApi({ url: URLS, chave: "pub", fetch: (_url, init) => { sinal = init.signal; return new Promise(() => {}); }, prazoMs: 12 });
  const e = await Promise.race([api.rpc("nx_pulso").catch(x => x), new Promise(r => setTimeout(() => r(null), 40))]);
  assert.ok(e, "a chamada deve terminar em prazo limitado");
  assert.equal(e.codigo, "tempo_rede");
  assert.equal(sinal.aborted, true);
});
await teste("API inclui a leitura do corpo da resposta no prazo de rede", async () => {
  const api = A.criarApi({ url: URLS, chave: "pub", fetch: () => Promise.resolve({ ok: true, text: () => new Promise(() => {}) }), prazoMs: 10 });
  const e = await Promise.race([api.rpc("nx_pulso").catch(x => x), new Promise(r => setTimeout(() => r(null), 50))]);
  assert.equal(e?.codigo, "tempo_rede");
});
await teste("{ok:false, erro} (nx_convite_aceitar com HTTP 200) → Error", async () => {
  const f = fetchFalso([{ status: 200, corpo: { ok: false, erro: "credenciais_invalidas" } }, { status: 200, corpo: { ok: true, token: "x" } }]);
  const api = A.criarApi({ url: URLS, chave: "pub", token: () => null, cliente: () => null, fetch: f });
  const e = await api.publica("nx_convite_aceitar", { p_convite: "a" }).catch(x => x);
  assert.equal(e.codigo, "credenciais_invalidas");
  assert.deepEqual(f.chamadas[0].corpo, { p_convite: "a" }, "publica não manda token");
  assert.deepEqual(await api.publica("nx_convite_aceitar", {}), { ok: true, token: "x" });
});
await teste("fn: POST /functions/v1/<fn> com {token, cliente, ...corpo}; erro {ok:false} com status 403/404", async () => {
  const f = fetchFalso([{ status: 200, corpo: { ok: true, id: 9 } }, { status: 404, corpo: { ok: false, erro: "conversa_nao_encontrada" } },
    { status: 403, corpo: { ok: false, erro: "envio_falhou", detalhe: "token vencido ou revogado" } }]);
  const api = A.criarApi({ url: URLS, chave: "pub", token: () => "tok", cliente: () => "cli", fetch: f });
  assert.deepEqual(await api.fn("nx-enviar", { modo: "texto", conversa: 1, texto: "oi" }), { ok: true, id: 9 });
  assert.equal(f.chamadas[0].url, `${URLS}/functions/v1/nx-enviar`);
  assert.deepEqual(f.chamadas[0].corpo, { token: "tok", cliente: "cli", modo: "texto", conversa: 1, texto: "oi" });
  const e = await api.fn("nx-enviar", {}).catch(x => x);
  assert.equal(e.codigo, "conversa_nao_encontrada"); assert.equal(e.status, 404);
  const e2 = await api.fn("nx-enviar", {}).catch(x => x);
  assert.equal(A.mensagemErro(e2), "O canal não aceitou a mensagem: token vencido ou revogado.");
});
await teste("(revisão, pedido da F5) o Error leva o corpo inteiro em .resposta (ex.: a mensagem gravada como falhou)", async () => {
  const msg = { id: 77, status: "falhou" };
  const f = fetchFalso([{ status: 502, corpo: { ok: false, erro: "envio_falhou", detalhe: "x", mensagem: msg } },
    { status: 200, corpo: { ok: false, erro: "envio_falhou", mensagem: msg } }]);
  const api = A.criarApi({ url: URLS, chave: "pub", token: () => "tok", cliente: () => "cli", fetch: f });
  const e1 = await api.fn("nx-enviar", {}).catch(x => x);
  assert.equal(e1.codigo, "envio_falhou"); assert.deepEqual(e1.resposta.mensagem, msg);
  const e2 = await api.fn("nx-enviar", {}).catch(x => x);
  assert.deepEqual(e2.resposta.mensagem, msg);
});
await teste("nomes inválidos de RPC/função são recusados sem rede", async () => {
  const f = fetchFalso([]);
  const api = A.criarApi({ url: URLS, chave: "pub", token: () => "t", cliente: () => "c", fetch: f });
  assert.equal((await api.rpc("../x").catch(x => x)).codigo, "funcao_invalida");
  assert.equal((await api.fn("http://mal").catch(x => x)).codigo, "funcao_invalida");
  assert.equal(f.chamadas.length, 0);
});

/* ============================================================ (e) PULSO */
console.log("\n(e) pulso.js com relógio falso");
function relogio() {
  let t = 0, fila = [];
  return {
    agendar(fn, ms) { const id = Symbol(); fila.push({ id, fn, em: t + ms }); return id; },
    cancelar(id) { fila = fila.filter(x => x.id !== id); },
    async andar(ms) {
      const fim = t + ms;
      for (;;) {
        fila.sort((a, b) => a.em - b.em);
        const prox = fila[0];
        if (!prox || prox.em > fim) break;
        fila.shift(); t = prox.em; await prox.fn(); await new Promise(r => setImmediate(r));
      }
      t = fim;
    },
    proximo() { fila.sort((a, b) => a.em - b.em); return fila[0] ? fila[0].em - t : null; },
  };
}
await teste("intervalos: 10 s normal, 3 s em Conversas, 60 s com a aba escondida; avisa só quando v muda", async () => {
  const rel = relogio();
  const doc = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  let v = 1, leituras = 0, notif = null;
  const p = P.criarPulso({ ler: async () => { leituras++; return { v, notif: 2, agora: "x" }; }, aoNotif: n => { notif = n; },
    agendar: rel.agendar, cancelar: rel.cancelar, doc, nav: { onLine: true }, janela: { addEventListener() {}, removeEventListener() {} } });
  const vistos = [];
  p.assinar(x => vistos.push(x));
  p.iniciar();
  await rel.andar(0);
  assert.equal(leituras, 1); assert.deepEqual(vistos, [], "a 1ª leitura só fixa a referência"); assert.equal(notif, 2);
  assert.equal(rel.proximo(), 10000);
  await rel.andar(10000);
  assert.equal(leituras, 2); assert.deepEqual(vistos, []);
  v = 2;
  await rel.andar(10000);
  assert.deepEqual(vistos, [2]);
  p.modo("conversas");
  assert.equal(rel.proximo(), 3000);
  doc.visibilityState = "hidden";
  await rel.andar(3000);
  assert.equal(rel.proximo(), 60000);
  p.parar();
  assert.equal(rel.proximo(), null);
});
await teste("erro de rede espera dobrando; sessao_invalida para o pulso", async () => {
  const rel = relogio();
  let modoErro = "rede";
  const p = P.criarPulso({ ler: async () => { const e = new Error(modoErro); e.codigo = modoErro === "rede" ? "sem_conexao" : "sessao_invalida"; throw e; },
    agendar: rel.agendar, cancelar: rel.cancelar, doc: { visibilityState: "visible", addEventListener() {} }, nav: { onLine: true }, janela: { addEventListener() {} } });
  p.iniciar();
  await rel.andar(0);
  assert.equal(rel.proximo(), 10000);
  await rel.andar(10000);
  assert.equal(rel.proximo(), 20000);
  modoErro = "sessao";
  await rel.andar(20000);
  assert.equal(rel.proximo(), null);
  assert.equal(p.estado.rodando, false);
});
await teste("timeout do fetch libera o pulso e agenda nova tentativa com backoff", async () => {
  const rel = relogio();
  const api = A.criarApi({ url: URLS, chave: "pub", fetch: () => new Promise(() => {}), prazoMs: 8 });
  const p = P.criarPulso({ ler: () => api.rpc("nx_pulso"), agendar: rel.agendar, cancelar: rel.cancelar,
    doc: { visibilityState: "visible", addEventListener() {} }, nav: { onLine: true }, janela: { addEventListener() {} } });
  p.iniciar();
  await Promise.race([rel.andar(0), new Promise(r => setTimeout(r, 40))]);
  assert.equal(p.estado.falhas, 1);
  assert.equal(rel.proximo(), 10000, "a primeira falha aplica o primeiro intervalo de backoff");
  p.parar();
});

/* ============================================================ (f) UI puras */
console.log("\n(f) ui.js (funções puras)");
await teste("brl, num, pct, telBR", () => {
  assert.equal(U.brl(1234.5).replace(/\s/g, " "), "R$ 1.234,50");
  assert.equal(U.brl(597, { centavos: false }).replace(/\s/g, " "), "R$ 597");
  assert.equal(U.brl(null), "—");
  assert.equal(U.num(12000), "12.000");
  assert.equal(U.pct(0.234), "23%");
  assert.equal(U.telBR("5512998303030"), "(12) 99830-3030");
  assert.equal(U.telBR("551298303030"), "(12) 9830-3030");
  assert.equal(U.telBR("447911123456"), "+447911123456");
  assert.equal(U.lerMoeda("1.234,56"), 1234.56);
  assert.equal(U.lerMoeda("R$ 99"), 99);
  assert.equal(U.lerMoeda(""), null);
  // (revisão, pedido da F6) ponto de milhar sem vírgula é milhar, não decimal: "2.000" = dois mil
  assert.equal(U.lerMoeda("2.000"), 2000);
  assert.equal(U.lerMoeda("1.500"), 1500);
  assert.equal(U.lerMoeda("R$ 1.297.000"), 1297000);
  assert.equal(U.lerMoeda("297.5"), 297.5);
  assert.equal(U.lerMoeda("1.297,00"), 1297);
  assert.equal(U.lerMoeda("abc"), null);
});
await teste("datas no fuso de São Paulo (dataBR, horaBR, hojeSP, relativo)", () => {
  assert.equal(U.dataBR("2026-09-28"), "28/09/2026");
  assert.equal(U.dataBR("2026-09-28T02:30:00Z"), "27/09/2026", "23h30 de SP ainda é o dia 27");
  assert.equal(U.horaBR("2026-09-28T15:05:00Z"), "12:05");
  assert.equal(U.hojeSP(new Date("2026-09-28T02:00:00Z")), "2026-09-27");
  const agora = new Date("2026-09-28T15:00:00Z");
  assert.equal(U.relativo("2026-09-28T14:55:00Z", agora), "há 5 min");
  assert.equal(U.relativo("2026-09-28T12:00:00Z", agora), "há 3 h");
  assert.equal(U.relativo("2026-09-27T15:00:00Z", agora), "ontem");
  assert.equal(U.relativo("2026-09-29T15:00:00Z", agora), "amanhã");
  assert.equal(U.relativo("2026-09-24T15:00:00Z", agora), "há 4 dias");
  assert.equal(U.relativo("2026-08-01T15:00:00Z", agora), "01/08/2026");
});
await teste("admin.sugerirSlug", async () => {
  const Ad = await imp("admin.js");
  assert.equal(Ad.sugerirSlug("Clínica Sorriso & Cia."), "clinica-sorriso-cia");
  assert.equal(Ad.sugerirSlug("  Ótica São João  "), "otica-sao-joao");
  assert.ok(Ad.sugerirSlug("x".repeat(60)).length <= 40);
});
await teste("admin: três ofertas comerciais exatas e segmento livre sem quebrar o modelo técnico", async () => {
  const Ad = await imp("admin.js");
  assert.deepEqual(Ad.PACOTES_COMERCIAIS.map(p => [p.id, p.nome, p.mensalCentavos, p.integracaoCentavos]), [
    ["essencial", "PLANO ESSENCIAL", 129478, 88945],
    ["profissional", "PLANO PROFISSIONAL", 187253, 119289],
    ["ultra", "PLANO ULTRA", 228734, 134457],
  ]);
  assert.ok(Ad.PACOTES_COMERCIAIS[0].itens.includes("1 diária de gravação por mês"));
  assert.ok(Ad.PACOTES_COMERCIAIS[1].itens.includes("IA no atendimento"));
  assert.ok(Ad.PACOTES_COMERCIAIS[2].itens.includes("Mais 1 sistema completo à sua escolha"));
  assert.equal(Ad.verticalPorSegmento("Clínica odontológica Kamiguchi"), "odonto");
  assert.equal(Ad.verticalPorSegmento("Oficina de mecânica"), "oficina");
  assert.equal(Ad.verticalPorSegmento("Consultoria contábil"), "generico");
  const src = ler("admin.js");
  assert.ok(/nome: "segmento"/.test(src) && /nome: "especificacoes"/.test(src), "campos livres presentes no cadastro/edição");
  assert.ok(/comercial: \{ pacote: oferta\.id, segmento: d\.segmento/.test(src), "cadastro envia oferta e especificações à RPC" );
  assert.ok(src.includes("Plano de acesso ao Órbita"), "acesso técnico é diferenciado da oferta comercial");
});

await teste("migração dos pacotes: aditiva, valores fixos no servidor e retorno comercial limitado ao Admin", () => {
  const sql = readFileSync(join(RAIZ, "supabase/migrations/20260930b_pacotes_comerciais.sql"), "utf8");
  assert.match(sql, /add column if not exists comercial jsonb/i);
  assert.match(sql, /check \(jsonb_typeof\(comercial\) = 'object'/i);
  for (const n of [129478, 88945, 187253, 119289, 228734, 134457]) assert.ok(sql.includes(String(n)), `valor ${n} deve ser escolhido no servidor`);
  assert.match(sql, /public\.nx_cliente_admin_salvar\(text,jsonb\)\s+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.nx_cliente_admin_salvar\(text,jsonb\) to anon, authenticated, service_role/i);
  assert.match(sql, /nx_cliente_admin_item\(uuid\)\s+from public, anon, authenticated/i);
});

/* ---- P0-B: editor de marca, domínio, plano (partes testáveis sem DOM) ---- */
await teste("P0-B: FUNDOS do editor (8 cores válidas, escuras viram palco e claras tema claro, sempre com texto ≥ 7:1)", () => {
  assert.equal(T.FUNDOS.length, 8);
  for (const f of T.FUNDOS) {
    assert.ok(/^#[0-9A-F]{6}$/.test(f), f);
    const { vars, escuro } = T.derivarTema({ primaria: "#B0761F", secundaria: "#6FA3CF", fundo: f });
    assert.ok(T.contraste(vars["--c-texto"], vars["--c-fundo"]) >= 7, `texto sobre ${f}`);
    assert.equal(escuro, T.luminancia(f) < .2, `esquema de ${f}`);
  }
  assert.ok(T.FUNDOS.filter(f => T.luminancia(f) < .2).length >= 5, "pelo menos 5 fundos noturnos");
});
await teste("P0-B: validarMarca da org × do tema (logo SVG/http recusado, favicon grande, chave de org no tema, WhatsApp)", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert.deepEqual(T.validarMarca({ produto: "Conecta", logo: png, favicon: png, cores: { primaria: "#2255CC" }, suporte_wa: "5512999990000" }), []);
  assert.ok(T.validarMarca({ logo: "https://cdn.x.com/logo.svg" }).some(e => e.campo === "logo"));
  assert.ok(T.validarMarca({ logo: "http://x.com/a.png" }).some(e => e.campo === "logo"));
  assert.ok(T.validarMarca({ favicon: "data:image/png;base64," + "A".repeat(30001) }).some(e => e.campo === "favicon"));
  assert.ok(T.validarMarca({ produto: "Órbita" }, true).some(e => e.campo === "produto"), "tema aceita só logo/logo_claro/cores");
  assert.deepEqual(T.validarMarca({ logo: png, cores: { fundo: "#0B1416" } }, true), []);
  assert.ok(T.validarMarca({ cores: { primaria: "#FFF" } }).some(e => e.campo === "cores.primaria"));
  assert.ok(T.validarMarca({ suporte_wa: "(12) 9999" }).some(e => e.campo === "suporte_wa"));
});
await teste("P0-B: primária #FFFF00 sobre fundo branco (aceite 14) → esquema claro, aviso e texto legível", () => {
  const { vars, escuro, avisos: av } = T.derivarTema({ primaria: "#FFFF00", secundaria: "#6FA3CF", fundo: "#FFFFFF" });
  assert.equal(escuro, false);
  assert.ok(av.some(a => a.campo === "primaria"), "aviso da primária");
  assert.ok(T.contraste(vars["--c-prim-luz"], vars["--c-fundo"]) >= 4.5);
  assert.ok(T.contraste(vars["--c-prim-txt"], vars["--c-prim"]) >= 4.5);
});
await teste("P0-B: config.js exporta editorMarca e cartaoDominio; seções marca/dominio/plano com os ids fixos do §7.2", async () => {
  const C = await imp("config.js");
  assert.equal(typeof C.editorMarca, "function");
  assert.equal(typeof C.cartaoDominio, "function");
  const src = ler("config.js");
  for (const id of ["perfil", "usuarios", "marca", "dominio", "plano"]) assert.ok(new RegExp(`id: "${id}"`).test(src), `seção ${id}`);
  for (const rpc of ["nx_tema_salvar", "nx_org_salvar", "nx_dominio_salvar", "nx_dominios_listar", "nx_uso_plano", "nx_cliente_tema"]) assert.ok(src.includes(`"${rpc}"`), rpc);
});
await teste("P0-B: admin.js usa as RPCs de revenda/plano/domínio; shell com sino e Ctrl/⌘+K", () => {
  const ad = ler("admin.js"), sh = ler("app.js");
  for (const rpc of ["nx_org_salvar", "nx_plano_salvar", "nx_dominio_status", "nx_convite_criar", "nx_orgs_listar"]) assert.ok(ad.includes(`"${rpc}"`), rpc);
  assert.ok(ler("config.js").includes('"nx_dominio_remover"'), "remover domínio (cartaoDominio)");
  assert.ok(/p_cliente: null, p_dados: \{ papel: "gestor"/.test(ad), "convite de gestor com p_cliente nulo e p_org");
  for (const rpc of ["nx_notificacoes_listar", "nx_notificacoes_marcar", "nx_buscar"]) assert.ok(sh.includes(`"${rpc}"`), rpc);
  assert.ok(sh.includes('atalho("mod+k"'), "atalho Ctrl/⌘+K");
});
await teste("P0-B: ui.barraUso existe (Plano e uso, Admin)", () => {
  assert.equal(typeof U.barraUso, "function");
});
await teste("(revisão) cartaoDominio sem saas_url: no GitHub Pages/localhost NÃO inventa o destino do CNAME; no Netlify usa o host atual", async () => {
  const C = await imp("config.js");
  // DOM de mentira: h() vira árvore simples; só o texto importa aqui
  const h = (tag, attrs, ...f) => { const filhos = f.flat(Infinity).filter(x => x != null && x !== false);
    return { tag, attrs: attrs || {}, f: filhos, childNodes: filhos, append(...x) { filhos.push(...x); }, addEventListener() {} }; };
  const txt = n => n == null ? "" : typeof n === "string" ? n : (n.f || []).map(txt).join(" ");
  const ui = { h, icone: n => h("svg", null), pilula: t => h("span", null, t), copiar() {}, dataBR: s => s, confirmar: async () => false, carregando: p => p, toast() {} };
  const ctx = { ui, api: { rpc: async () => ({}), mensagemErro: e => String(e) } };
  const d = { host: "crm.agencia.com.br", status: "pendente", cliente: null, dns: { tipo: "CNAME", nome: "crm.agencia.com.br", valor: null } };
  const antes = globalThis.location;
  try {
    for (const host of ["jpfamelli.github.io", "localhost", "127.0.0.1"]) {
      globalThis.location = { hostname: host };
      const t = txt(C.cartaoDominio(ctx, d));
      assert.ok(!t.includes(host), `${host} não pode virar destino de CNAME`);
      assert.ok(/Peça à Nexus o destino/.test(t) && /a Nexus informa/.test(t), `texto honesto em ${host}`);
    }
    globalThis.location = { hostname: "orbita-nexus.netlify.app" };
    assert.ok(txt(C.cartaoDominio(ctx, d)).includes("crm.agencia.com.br → orbita-nexus.netlify.app"), "Netlify: host atual");
    globalThis.location = { hostname: "jpfamelli.github.io" };
    assert.ok(txt(C.cartaoDominio(ctx, { ...d, dns: { ...d.dns, valor: "orbita-nexus.netlify.app" } })).includes("→ orbita-nexus.netlify.app"), "com saas_url: sempre o valor do servidor");
  } finally { globalThis.location = antes; }
});
await teste("(revisão) textos honestos da revenda suspensa (o gestor continua entrando — nx_ctx §4.10 passo 5)", () => {
  const ad = ler("admin.js");
  assert.ok(!/ninguém da agência entra/i.test(ad) && !/O gestor e TODOS/.test(ad), "não promete bloquear o gestor");
  assert.ok(/O gestor da agência continua entrando/.test(ad));
});
await teste("(revisão) shell: cache das imagens da org leva o img_hash da sessão (troca de logo aparece sem esperar 1 h)", () => {
  assert.ok(/org\.img_hash/.test(ler("app.js")));
});

/* ============================================================ (g) ESTÁTICOS */
console.log("\n(g) estáticos");
const ARQ_F3 = ["index.html", "antes.js", "app.css", "app.js", "api.js", "ui.js", "tema.js", "vocab.js", "rotas.js", "pulso.js", "login.js", "admin.js", "config.js"];
const ARQ_OUTRAS = {
  F4: ["crm.js", "crm-kanban.js", "crm-listas.js", "crm-negocio.js", "crm-tarefas.js", "crm-importar.js", "crm-config.js", "crm-logica.js", "crm.css"],
  F5: ["conversas.js", "cv-lista.js", "cv-chat.js", "cv-composer.js", "cv-lateral.js", "cv-config.js", "cv-logica.js", "conversas.css"],
  F6: ["inicio.js", "anuncios.js", "relatorios.js", "graficos.js", "ads-config.js", "rel-logica.js", "relatorios.css"],
  F7: ["automacoes.js", "auto-logica.js", "automacoes.css"],
  F8: ["prontos.js"],
};
const arquivosApp = readdirSync(APP);
const js = arquivosApp.filter(f => f.endsWith(".js"));
const css = arquivosApp.filter(f => f.endsWith(".css"));

await teste("todos os arquivos do §7.1 existem (F3 obrigatório; outras frentes: aviso, ou falha com ORBITA_COMPLETO=1)", () => {
  for (const f of ARQ_F3) assert.ok(existsSync(join(APP, f)), `falta ${f}`);
  const faltando = [];
  for (const [fr, lista] of Object.entries(ARQ_OUTRAS)) for (const f of lista) if (!existsSync(join(APP, f))) faltando.push(`${fr}:${f}`);
  if (faltando.length) {
    if (COMPLETO) assert.fail(`faltam: ${faltando.join(", ")}`);
    aviso(`ainda não existem (outras frentes): ${faltando.join(", ")}`);
  }
});
await teste("todo .js de web/app passa em node --check", () => {
  for (const f of js) {
    try { execFileSync(process.execPath, ["--check", join(APP, f)], { stdio: "pipe" }); }
    catch (e) { assert.fail(`${f}: ${String(e.stderr || e.message).split("\n").slice(0, 4).join(" ")}`); }
  }
});
await teste("index.html: nenhum <script> inline nem atributo on*= (CSP §3.9); um só ?v=", () => {
  const html = ler("index.html");
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert.match(m[1], /\ssrc=/, "script sem src");
    assert.equal(m[2].trim(), "", "script com conteúdo");
  }
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, "atributo on*=");
  assert.doesNotMatch(html, /javascript:/i);
  const vs = [...html.matchAll(/\?v=([A-Za-z0-9._-]+)/g)].map(m => m[1]);
  assert.ok(vs.length >= 2 && new Set(vs).size === 1, `versões: ${vs.join(", ")}`);
  assert.match(html, /<script type="module" src="app\.js\?v=/);
  assert.match(html, /<script src="antes\.js\?v=[^"]+"><\/script>/, "antes.js síncrono no head");
  for (const ic of "inicio chat funil contato empresa tarefa anuncio raio grafico engrenagem sino busca mais fechar clipe enviar nota usuario sair check checks relogio alerta lixeira editar filtro seta-esq seta-dir ia etiqueta telefone whatsapp arrastar olho copiar".split(" ")) {
    assert.match(html, new RegExp(`<symbol id="i-${ic}"`), `ícone i-${ic}`);
  }
});
await teste("apps independentes: atalhos CRM/Ads/Atendimento, query de produto e manifestos instaláveis separados", () => {
  for (const [id, rota, manifesto] of [
    ["crm", "crm", "manifest-crm.webmanifest"], ["ads", "anuncios", "manifest-ads.webmanifest"],
    ["atendimento", "conversas", "manifest-atendimento.webmanifest"],
  ]) {
    const html = readFileSync(join(RAIZ, "web", id, "index.html"), "utf8");
    assert.match(html, new RegExp(`data-produto="${id}"`));
    assert.match(html, /<script src="\/workspace\.js\?v=[^"]+"><\/script>/);
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      assert.match(m[1], /\ssrc=/, `${id}: script deve ser externo`);
      assert.equal(m[2].trim(), "", `${id}: sem script inline`);
    }
    assert.match(html, new RegExp(`/app/\\?produto=${id}#/${rota}`));
    const m = JSON.parse(readFileSync(join(APP, manifesto), "utf8"));
    assert.equal(m.start_url, `/app/?produto=${id}#/${rota}`);
    assert.equal(m.scope, "/app/");
    assert.equal(m.icons.length, 1);
    assert.equal(new URL(m.icons[0].src, `https://orbita.local/app/${manifesto}`).pathname, "/app/orbita-icon.svg");
  }
  const jsWorkspace = readFileSync(join(RAIZ, "web", "workspace.js"), "utf8");
  assert.match(jsWorkspace, /location\.replace\(url\)/);
  assert.match(jsWorkspace, /\["org", "dev", "dev-falso"\]/);
  assert.match(jsWorkspace, /origem\.hash\.startsWith\("#\/"\) \? origem\.hash : `#\/\$\{atual\.rota\}`/, "entrada de produto preserva deep link interno validado pelo shell");
  const shell = ler("app.js");
  assert.match(shell, /rotaNoProduto\(E\.workspace, r\.modulo\)/, "shell identifica navegação fora do produto atual");
  assert.match(shell, /produtoDaRota\(r\.modulo\)[\s\S]*?urlWorkspace\(destino, rotas\.montarHash\(r\.modulo, r\.partes, r\.query\)\)/, "rotas cruzadas preservam o destino e alternam para o produto correspondente");
  assert.match(shell, /E\.workspace === null \|\| E\.workspace === "crm"/, "busca global só existe no Órbita completo ou no CRM");
  assert.match(shell, /document\.title = E\.workspace \? rotas\.PRODUTOS\[E\.workspace\]\.titulo/, "cada atalho tem título próprio");
  assert.match(shell, /const nomeApp = E\.workspace \? E\.M\?\.rotas\?\.PRODUTOS\?\.\[E\.workspace\]\?\.nome : "";/, "título mantém o produto mesmo quando muda a rota interna");
  const seletor = shell.match(/function abrirSeletorProduto\(ancora\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(seletor, /const rotas = E\.M\.rotas;/, "seletor usa o módulo de rotas carregado no contexto");
  assert.match(seletor, /Object\.entries\(rotas\.PRODUTOS\)/, "seletor lista os três produtos configurados");
  assert.match(readFileSync(join(RAIZ, "netlify.toml"), "utf8"), /for = "\/workspace\.js"[\s\S]*?Content-Security-Policy/);
});
await teste("acessibilidade: painel de inbox ligado à aba atual, orientação móvel e prévia Ads sem live announcement extenso", () => {
  const lista = ler("cv-lista.js"), kanban = ler("crm-kanban.js"), ads = ler("anuncios.js");
  assert.match(lista, /lista\.setAttribute\("aria-labelledby", abaAtiva\.id\)/);
  assert.match(lista, /if \(A\.busca\)\s*\{[\s\S]*?abasEl\.setAttribute\("role", "group"\)/);
  assert.match(lista, /abasEl\.setAttribute\("aria-label", "Filtrar conversas por situação"\)/);
  assert.match(lista, /b\.removeAttribute\("aria-selected"\)/);
  assert.match(kanban, /Abra um cartão e escolha ‘Mover para…’/);
  assert.match(kanban, /\(pointer: coarse\)/, "tablet/touch também recebe instrução sem arrastar");
  assert.match(ads, /class: "sr-only", role: "status", "aria-live": "polite"/);
  assert.doesNotMatch(ads, /class: "ads-fone", "aria-live"/);
  const envio = ler("conversas.js");
  assert.match(envio, /e\?\.resposta\?\.ambigua === true/);
  assert.match(envio, /Number\(e\?\.status\) === 504/);
  assert.doesNotMatch(envio, /\/\^http_5\/|status\)\s*>=\s*500/, "erro interno 5xx explícito não fica preso como envio ambíguo");
});
await teste("migration da cota IA: reserva atômica protegida e limitada ao service_role", () => {
  const sql = readFileSync(join(RAIZ, "supabase/migrations/20260930c_ia_reservas_atomicas.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.nx_ia_reservas/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.nx_ia_reservas from public, anon, authenticated/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /p_acao is null or p_acao not in/);
  const usoMes = sql.match(/when 'ia_mes' then([\s\S]*?)when 'empresas' then/i)?.[1] || "";
  assert.ok(usoMes, "nx_uso substituída para contar todas as tentativas de IA no mês");
  assert.doesNotMatch(usoMes, /u\.ok/i);
  assert.match(sql, /on conflict \(reserva_id\) where reserva_id is not null do nothing/);
  assert.match(sql, /grant execute on function public\.nx_ia_reservar\(uuid, uuid, text\) to service_role/);
  assert.match(sql, /grant execute on function public\.nx_ia_registrar_reserva\(uuid, text, int, int, boolean\) to service_role/);
  assert.match(readFileSync(join(RAIZ, "supabase/functions/_compartilhado/ia_conversas.js"), "utf8"), /nx_ia_reservar[\s\S]*nx_ia_registrar_reserva/);
});
await teste("fila: envio interrompido vira status incerto e nunca é reenviado automaticamente", () => {
  const sql = readFileSync(join(RAIZ, "supabase/migrations/20260930d_fila_status_incerto.sql"), "utf8");
  const fn = sql.match(/create or replace function public\.nx_fila_chamar\(\)[\s\S]*?end \$\$;/i)?.[0] || "";
  assert.ok(fn, "função da fila substituída aditivamente");
  assert.match(fn, /status = 'falhou'/i);
  assert.match(fn, /STATUS INCERTO/i);
  assert.match(fn, /where f\.status = 'enviando'/i);
  assert.doesNotMatch(fn, /case when f\.tentativas >= 3 then 'falhou' else 'pendente'/i);
  assert.match(fn, /nx_disparar\('nx-enviar'/i, "a chamada normal da fila continua ativa");
});

function semRaiz(texto) {
  // remove os blocos cujo seletor começa com :root (é onde as cores podem estar)
  let s = texto, saida = "", i = 0;
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");
  while (i < s.length) {
    const j = s.indexOf(":root", i);
    if (j < 0) { saida += s.slice(i); break; }
    const k = s.indexOf("{", j);
    const antes = s.slice(i, j);
    // só conta como bloco :root se ":root" abre o seletor (início de regra)
    const inicioRegra = /(^|[}{;]\s*)$/.test(antes.replace(/\s+$/, "") + " ") || /[}{]\s*$/.test(antes) || antes.trim() === "";
    if (k < 0) { saida += s.slice(i); break; }
    let nivel = 1, p = k + 1;
    while (p < s.length && nivel > 0) { if (s[p] === "{") nivel++; else if (s[p] === "}") nivel--; p++; }
    saida += antes + (inicioRegra ? "" : s.slice(j, p));
    i = p;
  }
  return saida;
}
await teste("nenhum hex de cor em web/app/*.css fora de :root", () => {
  for (const f of css) {
    const resto = semRaiz(readFileSync(join(APP, f), "utf8"));
    const achados = resto.match(/#[0-9a-fA-F]{3,8}\b/g);
    assert.equal(achados, null, `${f}: ${achados && achados.slice(0, 5).join(" ")}`);
  }
});
await teste("nenhum hex de cor em web/app/*.js fora de tema.js", () => {
  for (const f of js.filter(f => f !== "tema.js")) {
    const t = readFileSync(join(APP, f), "utf8");
    const achados = t.match(/["'`(\s:,]#[0-9a-fA-F]{6}\b|["'`(\s:,]#[0-9a-fA-F]{3}\b(?![-\w])/g);
    assert.equal(achados, null, `${f}: ${achados && achados.slice(0, 5).join(" ")}`);
  }
});
await teste("[hidden]{display:none!important} no app.css", () => {
  assert.match(ler("app.css"), /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});
function semMinmax(t) {
  let s = t, i;
  while ((i = s.search(/minmax\(/)) >= 0) {
    let nivel = 0, p = i + 6;
    for (; p < s.length; p++) { if (s[p] === "(") nivel++; else if (s[p] === ")") { nivel--; if (nivel === 0) break; } }
    s = s.slice(0, i) + s.slice(p + 1);
  }
  return s;
}
await teste("nenhum 1fr solto nos CSS do app (sempre minmax(0,1fr))", () => {
  for (const f of css) {
    const t = semMinmax(readFileSync(join(APP, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""));
    const achados = t.match(/[\s(:,]\d*\.?\d+fr\b/g);
    assert.equal(achados, null, `${f}: ${achados && achados.join(" ")}`);
  }
});
await teste("innerHTML só com texto constante (nunca dado de usuário)", () => {
  for (const f of js) {
    const t = readFileSync(join(APP, f), "utf8");
    for (const m of t.matchAll(/(innerHTML|outerHTML)\s*[+]?=\s*([^;\n]+)/g)) {
      assert.match(m[2].trim(), /^(['"])[^'"$]*\1$/, `${f}: ${m[0].slice(0, 80)}`);
    }
    assert.doesNotMatch(t, /insertAdjacentHTML|document\.write\(/, `${f}: HTML cru`);
  }
});
await teste("nenhum import estático em web/app/*.js; todo import( com template e ?v=", () => {
  for (const f of js) {
    const t = readFileSync(join(APP, f), "utf8");
    const linhas = t.split("\n");
    linhas.forEach((l, n) => assert.doesNotMatch(l, /^\s*import\s[^(]/, `${f}:${n + 1} import estático`));
    assert.doesNotMatch(t, /^\s*export\s+[^;]*\sfrom\s/m, `${f}: reexport estático`);
    const codigo = t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
    for (const m of codigo.matchAll(/\bimport\(\s*(`[^`]*`|[^)]*)/g)) {
      const arg = m[1].trim();
      assert.match(arg, /^`[^`]*\?v=\$\{[^`]*`$/, `${f}: import(${arg}) sem ?v=`);
    }
  }
});
await teste("módulos não carregam ui.js/api.js/app.js/tema.js/rotas.js/pulso.js/vocab.js (vêm pelo ctx)", () => {
  const base = ["app.js"];
  for (const f of js.filter(f => !base.includes(f))) {
    const t = readFileSync(join(APP, f), "utf8");
    assert.doesNotMatch(t, /import\(\s*`\.\/(ui|api|app|tema|rotas|pulso|vocab)\.js/, `${f} importa um arquivo do shell`);
  }
});
await teste("sem on*= inline e sem eval nos .js do app", () => {
  for (const f of js) {
    const t = readFileSync(join(APP, f), "utf8");
    assert.doesNotMatch(t, /setAttribute\(\s*["']on[a-z]+["']/i, `${f}: setAttribute('on…')`);
    assert.doesNotMatch(t, /\beval\(|new Function\(/, `${f}: eval`);
  }
});
await teste("Element.append/prepend nunca recebe argumento que pode ser null (escreveria a palavra \"null\" na tela)", () => {
  // QA mobile autenticado 30/09: "Plano e uso" e outras telas mostravam "null" solto. Em h() o null é ignorado; no DOM nativo não.
  const suspeitos = [];
  for (const f of js) {
    const t = readFileSync(join(APP, f), "utf8");
    const re = /\.(append|prepend)\(/g;
    let m;
    while ((m = re.exec(t))) {
      let i = m.index + m[0].length, prof = 1, cur = "", asp = null, esc = false;
      const args = [];
      for (; i < t.length && prof > 0; i++) {
        const c = t[i];
        if (asp) { cur += c; if (esc) esc = false; else if (c === "\\") esc = true; else if (c === asp) asp = null; continue; }
        if (c === '"' || c === "'" || c === "`") { asp = c; cur += c; continue; }
        if (c === "(" || c === "[" || c === "{") prof++;
        if (c === ")" || c === "]" || c === "}") { prof--; if (prof === 0) break; }
        if (c === "," && prof === 1) { args.push(cur.trim()); cur = ""; continue; }
        cur += c;
      }
      args.push(cur.trim());
      for (const a of args) {
        const linha = a.replace(/\s+/g, " ");
        if (!a.startsWith("...") && /\?.*:\s*(null|undefined)$/.test(linha)) {
          suspeitos.push(`${f}:${t.slice(0, m.index).split("\n").length} ${m[1]}(… ${linha.slice(0, 70)} …)`);
        }
      }
    }
  }
  assert.deepEqual(suspeitos, [], "use .append(...[a, b].filter(Boolean))");
});
await teste("CSS mobile: botões em linhas que quebram não usam flex:1 (basis 0 cortava o texto); compositor, cabeçalho do chat e filtros do CRM", () => {
  const crm = ler("crm.css"), app = ler("app.css"), cv = ler("conversas.css");
  assert.doesNotMatch(crm, /\.crm-cab-acoes \.bt-prim \{ flex: 1; \}/);
  assert.doesNotMatch(crm, /\.fx-acoes \.bt \{ flex: 1; \}/);
  assert.doesNotMatch(app, /\.modal-rod \.bt \{ flex: 1; \}/);
  assert.match(cv, /\.cvx-linha \{ display: grid;[^}]*grid-template-areas: "campo campo" "ferr enviar"/, "compositor em duas linhas no celular");
  assert.match(cv, /\.cvc-acoes \.rot-longo \{ display: inline; \}/, "botão Resolver com rótulo no celular");
  assert.match(cv, /\.cvc-sub \.cvc-via \{[^}]*text-overflow: ellipsis/, "nome do número com reticências");
  assert.match(crm, /\.crm-filtros \{[^}]*width: min\(360px, calc\(100vw - 42px\)\)/, "painel de filtros cabe no popover de 320 px");
  assert.doesNotMatch(ler("agenda.css"), /text-transform: capitalize/, "datas da agenda: só a 1ª letra maiúscula");
  for (const f of ["agenda.js", "agenda-config.js"]) assert.doesNotMatch(ler(f), /class: "bt bt-icone/, `${f}: bt + bt-icone espremia o ícone para 7 px`);
});
await teste("CSS (QA final 30/09): prévia das respostas é bloco com reticências; rótulo da tabela de campanhas quebra no celular; instruções do formulário quebram linha; campos terminam em reticências", () => {
  const cv = ler("conversas.css"), rel = ler("relatorios.css"), app = ler("app.css");
  // <span> em célula de tabela é inline: overflow/text-overflow não valem e a linha da tabela empurrava Departamento/Usos/Situação para fora do cartão
  assert.match(cv, /\.cfg-resp-corpo \{ display: block;[^}]*text-overflow: ellipsis/, "prévia da resposta rápida: bloco com reticências");
  assert.match(cv, /@media \(min-width: 761px\) \{ \.tabela td:has\(> \.cfg-resp-corpo\) \{ width: 100%; max-width: 0; \}/, "coluna Prévia flexível em tabela: Departamento/Usos/Situação ficam visíveis");
  // "CUSTO POR CONVERSA" (nowrap herdado de .num) passava da coluna de 95 px e o cartão rolava na horizontal
  assert.match(rel, /\.ads-tabela td\.num::before \{[^}]*white-space: normal/, "rótulo do cartão de campanha quebra de linha");
  assert.match(rel, /\.ads-tabela tr \{ display: grid;[^}]*align-items: end/, "valores alinhados pela base quando o rótulo quebra");
  assert.match(rel, /\.ads-tabela thead \{[^}]*visibility: hidden/, "cabeçalho oculto do cartão não recebe foco do teclado");
  // o prompt do CodeWords tem parágrafos longos: rolar na horizontal para ler não serve
  assert.match(rel, /\.cfgf-codigo \{[^}]*white-space: pre-wrap/, "instruções do formulário quebram linha");
  assert.match(app, /\.campo input:not\(\[type=checkbox\]\):not\(\[type=radio\]\)[^{]*\{[^}]*text-overflow: ellipsis/, "campos: placeholder comprido com reticências");
  assert.match(app, /\.busca-grande \.busca-campo \{[^}]*text-overflow: ellipsis/, "busca global: placeholder comprido com reticências");
  assert.match(rel, /@media \(max-width: 400px\) \{\s*\.rel-aba \{ padding-inline: \.5rem;/, "abas de Anúncios cabem em 375 px");
  assert.match(app, /@media \(max-width: 400px\) \{ \.aba \{ padding-inline: \.7rem; \} \}/, "abas de Tarefas cabem em 375 px");
  // a ficha 360 na gaveta de 820 px (Conversas › ficha do contato) tinha 2 colunas: "Dados" com ~320 px cortava nome, telefone e responsável
  assert.match(ler("crm.css"), /\.gaveta \.fx-grade \{ grid-template-columns: minmax\(0, 1fr\); \}/, "ficha na gaveta: uma coluna");
});
/** Histórico do navegador em memória: pushState, back() ASSÍNCRONO (como no navegador) e popstate. */
function historicoFalso() {
  const entradas = [{ state: null }]; let i = 0; const ouvintes = []; let backs = 0;
  const emitir = () => { for (const f of ouvintes) f({ state: entradas[i].state }); };
  const h = {
    get state() { return entradas[i].state; },
    get length() { return entradas.length; },
    pushState(st) { entradas.splice(i + 1); entradas.push({ state: st }); i++; },
    replaceState(st) { entradas[i].state = st; },
    back() { backs++; setTimeout(() => { if (i > 0) { i--; emitir(); } }, 0); },
  };
  return { h, ouvir: (ev, f) => { if (ev === "popstate") ouvintes.push(f); }, indice: () => i, backs: () => backs,
    usuarioVolta() { if (i > 0) { i--; emitir(); } }, entradas };
}
const tick = () => new Promise(r => setTimeout(r, 15));

await teste("modal × botão Voltar: abrir empurra UMA entrada; Voltar fecha o modal sem trocar a rota; fechar por botão desfaz a entrada", async () => {
  const f = historicoFalso();
  const C = U.criarCamadas({ history: f.h, addEventListener: f.ouvir });
  let fechou = 0;
  const cam = C.abrir(() => { fechou++; cam.liberar(); });
  assert.equal(f.entradas.length, 2, "uma entrada nova"); assert.match(f.h.state.nxCamada, /^camada-/); assert.equal(C.abertas(), 1);
  // Voltar do navegador: fecha o modal, a entrada já foi desfeita (nada de history.back() extra)
  f.usuarioVolta();
  assert.equal(fechou, 1); assert.equal(C.abertas(), 0); assert.equal(f.backs(), 0, "o Voltar do usuário não chama back() de novo"); assert.equal(f.h.state, null);
  // fechar por botão/Esc: a entrada é desfeita por history.back() (assíncrono) e quem navega logo depois espera
  const c2 = C.abrir(() => {});
  assert.equal(f.entradas.length, 2); // a antiga foi cortada pelo pushState
  c2.liberar();
  assert.equal(f.backs(), 1); assert.equal(C.voltaPendente(), true);
  let navegou = false; C.aposVolta(() => { navegou = true; });
  assert.equal(navegou, false, "a navegação espera o history.back() assentar");
  await tick();
  assert.equal(navegou, true); assert.equal(C.voltaPendente(), false); assert.equal(f.indice(), 0); assert.equal(f.h.state, null);
  assert.equal(C.aposVolta(() => { navegou = "agora"; }), undefined); assert.equal(navegou, "agora", "sem volta pendente roda na hora");
});
await teste("modal × Voltar: fechar um modal e abrir outro no mesmo instante não deixa entrada sobrando nem fecha o novo", async () => {
  const f = historicoFalso();
  const C = U.criarCamadas({ history: f.h, addEventListener: f.ouvir });
  let fechouB = 0;
  const a = C.abrir(() => {});
  a.liberar();
  const b = C.abrir(() => { fechouB++; b.liberar(); });   // mesmo tick: o history.back() do A ainda está no ar
  assert.equal(f.entradas.length, 2, "o push do B espera o back() do A");
  await tick();
  assert.equal(f.indice(), 1, "depois de assentar: exatamente uma entrada (a do B)"); assert.equal(f.entradas.length, 2);
  assert.match(f.h.state.nxCamada, /^camada-/); assert.equal(fechouB, 0, "o back() do A não fecha o B");
  f.usuarioVolta(); assert.equal(fechouB, 1); assert.equal(f.indice(), 0);
  // dois modais empilhados: Voltar fecha só o de cima; fechar os dois no mesmo instante desfaz as duas entradas
  const c1 = C.abrir(() => { c1.liberar(); }), c2 = C.abrir(() => { c2.liberar(); });
  assert.equal(f.entradas.length, 3); assert.equal(C.abertas(), 2);
  f.usuarioVolta(); assert.equal(C.abertas(), 1, "só o de cima fechou"); assert.equal(f.indice(), 1);
  const c3 = C.abrir(() => {});
  c3.liberar(); c1.liberar();   // mesmo tick
  await tick(); await tick();
  assert.equal(f.indice(), 0, "todas as entradas de modal foram desfeitas"); assert.equal(f.h.state, null); assert.equal(C.abertas(), 0);
});
await teste("modal × Voltar: navegar com modal aberto reaproveita a entrada do modal (Voltar não precisa de 2 toques); sem histórico vira no-op", async () => {
  const f = historicoFalso();
  const C = U.criarCamadas({ history: f.h, addEventListener: f.ouvir });
  const cam = C.abrir(() => {});
  assert.equal(C.consumirEntrada(), true, "a entrada atual é a do modal"); assert.equal(C.consumirEntrada(), false, "só uma navegação reaproveita a entrada");
  f.h.replaceState(null);   // o que o navegar() faz em seguida
  cam.liberar(); assert.equal(f.backs(), 0, "a entrada já foi reaproveitada: nada de back()");
  assert.equal(C.consumirEntrada(), false, "sem modal aberto a navegação empurra normalmente");
  // se o popstate nunca chegar, ninguém fica esperando para sempre
  const timers = []; const g = historicoFalso(); g.h.back = () => {};
  const D = U.criarCamadas({ history: g.h, addEventListener: g.ouvir, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {} });
  D.abrir(() => {}).liberar(); let rodou = false; D.aposVolta(() => { rodou = true; });
  assert.equal(rodou, false); timers[0](); assert.equal(rodou, true); assert.equal(D.voltaPendente(), false);
  // sem history (testes em Node / navegador sem API): nada quebra
  const N = U.criarCamadas({ history: null, addEventListener: null });
  const x = N.abrir(() => {}); x.liberar(); assert.equal(N.consumirEntrada(), false); assert.equal(N.voltaPendente(), false);
  assert.ok(U.camadas && typeof U.camadas.abrir === "function", "ui.camadas é o singleton que o app.js usa");
});
await teste("modal: a camada nasce/morre com o modal(), e o navegar() do app espera o histórico assentar e reaproveita a entrada do modal", () => {
  const ui = ler("ui.js"), app = ler("app.js");
  assert.match(ui, /camada = camadas\.abrir\(\(\) => api\.fechar\(null\)\)/, "modal() abre a camada (Voltar fecha o modal)");
  assert.match(ui, /if \(camada\) camada\.liberar\(\);/, "fechar() libera a camada");
  assert.match(app, /camadas\.voltaPendente\(\)\) \{ E\.ui\.camadas\.aposVolta\(\(\) => navegar\(hash, \{ substituir \}\)\); return; \}/);
  assert.match(app, /camadas\.consumirEntrada\(\)\) \{\s*history\.replaceState\(null,/);
});
await teste("CSS mobile: cabeçalho das tabelas-cartão sai do foco (visibility) e o rodapé do modal nunca sobrepõe o corpo que rola", () => {
  const css = ler("app.css");
  assert.match(css, /\.tabela thead \{[^}]*clip: rect\(0 0 0 0\);[^}]*visibility: hidden;/, "botões de ordenação escondidos não recebem Tab");
  assert.match(css, /\.modal-corpo \{[^}]*overflow-y: auto;[^}]*min-height: 0;/, "o corpo do modal rola sozinho");
  const rod = /\.modal-rod \{([^}]*)\}/.exec(css)[1];
  assert.doesNotMatch(rod, /position:\s*(sticky|fixed|absolute)/, "rodapé do modal fica fora do corpo que rola: um campo no fim do corpo nunca fica atrás do botão primário");
});
await teste("menu lateral: logo LARGO não fica por cima do nome do produto — o nome vira sr-only (como na entrada) e volta ao trocar de logo", () => {
  const app = ler("app.js"), css = ler("app.css");
  const fonte = /function pintarLogoShell\(\) \{[\s\S]*?\r?\n\}\r?\n/.exec(app);
  assert.ok(fonte, "pintarLogoShell existe no app.js");
  class Classes { constructor() { this.s = new Set(); } add(c) { this.s.add(c); } remove(c) { this.s.delete(c); } contains(c) { return this.s.has(c); } }
  const el = id => ({ id, classList: new Classes(), filhos: [], textContent: "", attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(f) { this.filhos.push(f); f.isConnected = true; } });
  const dom = Object.fromEntries(["lat-logo", "topo-marca", "lat-produto", "lat-home"].map(id => [id, el(id)]));
  const ui = {
    limpar(a) { for (const f of a.filhos) f.isConnected = false; a.filhos = []; },
    h(tag, attrs) { return { tag, attrs, classList: new Classes(), isConnected: false, ouvintes: {}, addEventListener(ev, fn) { this.ouvintes[ev] = fn; } }; },
  };
  const E = { ui, cliente: null, marca: { produto: "Revenda Teste", logo: "data:image/png;base64,TGFyZ28=" } };
  const ctx = { E, $: id => dom[id] || null, document: { documentElement: { dataset: { esquema: "escuro" } } } };
  runInNewContext(`${fonte[0]}\nthis.pintar = pintarLogoShell;`, ctx);
  const carregar = (alvo, w, h) => { const img = dom[alvo].filhos[0]; img.naturalWidth = w; img.naturalHeight = h; img.ouvintes.load(); return img; };
  const produto = dom["lat-produto"];

  ctx.pintar();
  assert.equal(produto.textContent, "Revenda Teste");
  assert.equal(produto.classList.contains("sr-only"), false, "antes de a imagem carregar o nome aparece");
  // o logo do topo (celular) não mexe no nome do menu
  carregar("topo-marca", 300, 60);
  assert.equal(produto.classList.contains("sr-only"), false);
  const largo = carregar("lat-logo", 300, 60);   // 5:1
  assert.ok(largo.classList.contains("largo") && dom["lat-logo"].classList.contains("largo"), "imagem e caixa marcadas como largas");
  assert.equal(produto.classList.contains("sr-only"), true, "logo largo: o nome sai da vista (sem sobrepor)");
  assert.equal(produto.textContent, "Revenda Teste", "…e continua no DOM para leitor de tela");
  assert.equal(dom["lat-home"].attrs["aria-label"], "Revenda Teste — início");

  // troca para um logo quadrado: o nome volta na hora; o load atrasado do logo antigo não reaplica nada
  E.marca = { produto: "Clínica Teste", logo: "data:image/png;base64,UXVhZHJhZG8=" };
  ctx.pintar();
  assert.equal(produto.classList.contains("sr-only"), false);
  assert.equal(dom["lat-logo"].classList.contains("largo"), false);
  largo.ouvintes.load();
  assert.equal(produto.classList.contains("sr-only"), false, "imagem de uma pintura anterior é ignorada");
  const quadrado = carregar("lat-logo", 64, 64);
  assert.equal(quadrado.classList.contains("largo"), false);
  assert.equal(produto.classList.contains("sr-only"), false, "logo quadrado: logo + nome lado a lado");
  // sem logo (símbolo do Órbita): nome visível
  E.marca = { produto: "Órbita" };
  ctx.pintar();
  assert.equal(dom["lat-logo"].filhos[0].tag, "svg");
  assert.equal(produto.classList.contains("sr-only"), false);

  // CSS: a caixa cresce com o logo largo (sem vazar sobre o nome) e encolhe no menu só de ícones
  assert.match(css, /\.lat-logo\.largo \{ width: auto; max-width: 150px; \}/);
  assert.match(css, /html\.menu-recolhido \.lat-logo\.largo, html\.menu-recolhido \.lat-logo img\.largo \{ width: 36px; max-width: 36px; \}/);
  assert.match(css, /@media \(max-width: 1100px\) \{[^@]*\.lat-logo\.largo, \.lat-logo img\.largo \{ width: 36px; max-width: 36px; \}/);
  assert.match(css, /\.sr-only \{ position: absolute !important;/);
});
await teste("CSP sem cabeçalho (GitHub Pages): <meta> no <head> do app e das entradas = política do netlify.toml (menos frame-ancestors/report-uri/sandbox), antes de qualquer script", () => {
  const toml = readFileSync(join(RAIZ, "netlify.toml"), "utf8");
  const politica = caminho => {
    const bloco = toml.split("[[headers]]").find(b => b.includes(`for = "${caminho}"`));
    assert.ok(bloco, `netlify.toml sem [[headers]] para ${caminho}`);
    const m = /Content-Security-Policy = "([^"]+)"/.exec(bloco);
    assert.ok(m, `netlify.toml: ${caminho} sem Content-Security-Policy`);
    return m[1];
  };
  const diretivas = p => p.split(";").map(d => d.trim().replace(/\s+/g, " ")).filter(Boolean);
  // diretivas que o navegador IGNORA em <meta> (só valem em cabeçalho)
  const SO_CABECALHO = new Set(["frame-ancestors", "report-uri", "sandbox"]);
  for (const [arquivo, caminho] of [["app/index.html", "/app/*"], ["crm/index.html", "/crm/*"], ["ads/index.html", "/ads/*"], ["atendimento/index.html", "/atendimento/*"]]) {
    const html = readFileSync(join(RAIZ, "web", arquivo), "utf8");
    const metas = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/gi)];
    assert.equal(metas.length, 1, `${arquivo}: exatamente uma <meta> de CSP`);
    const esperado = diretivas(politica(caminho)).filter(d => !SO_CABECALHO.has(d.split(" ")[0]));
    assert.deepEqual(diretivas(metas[0][1]), esperado, `${arquivo}: a mesma política do netlify.toml (${caminho})`);
    assert.doesNotMatch(metas[0][1], /frame-ancestors|report-uri|sandbox/);
    assert.ok(diretivas(metas[0][1]).includes("script-src 'self'"), `${arquivo}: script-src só 'self'`);
    assert.doesNotMatch(metas[0][1], /script-src[^;]*'unsafe-(inline|eval)'/);
    // dentro do <head> e antes de qualquer script/link/style (a meta não protege o que vem antes dela)
    const head = /<head>([\s\S]*?)<\/head>/i.exec(html);
    assert.ok(head && head[1].includes(metas[0][0]), `${arquivo}: <meta> dentro do <head>`);
    const pos = html.indexOf(metas[0][0]);
    for (const tag of ["<script", "<link", "<style"]) {
      const i = html.indexOf(tag);
      if (i >= 0) assert.ok(pos < i, `${arquivo}: a <meta> de CSP vem antes do primeiro ${tag}`);
    }
    // e a política não quebra nada: todo script é arquivo do próprio site
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      assert.match(m[1], /\ssrc="(?!https?:|\/\/)[^"]+"/, `${arquivo}: script externo do próprio site`);
      assert.equal(m[2].trim(), "", `${arquivo}: sem script inline`);
    }
  }
  // o servidor fictício local injeta o boot como ARQUIVO (a CSP da <meta> bloquearia um <script> inline)
  const dev = readFileSync(join(RAIZ, "scripts", "dev-falso.mjs"), "utf8");
  assert.match(dev, /const boot = `<script src="\/__dev_falso\/boot\.js"><\/script>`;/);
  assert.doesNotMatch(dev, /<script>\(function/);
});
await teste("netlify.toml: publish web, / e /index.html → /app/ (302 forçado), CSP do §3.9", () => {
  const t = readFileSync(join(RAIZ, "netlify.toml"), "utf8");
  assert.match(t, /publish\s*=\s*"web"/);
  assert.match(t, /from = "\/"\s*\n\s*to = "\/app\/"\s*\n\s*status = 302\s*\n\s*force = true/);
  assert.match(t, /from = "\/index\.html"\s*\n\s*to = "\/app\/"\s*\n\s*status = 302\s*\n\s*force = true/);
  assert.match(t, /Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:\/\/dtjznipitihnwmcgpzqh\.supabase\.co; connect-src 'self' https:\/\/dtjznipitihnwmcgpzqh\.supabase\.co; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"/);
  for (const k of ["Referrer-Policy", "X-Content-Type-Options", "Permissions-Policy"]) assert.match(t, new RegExp(k));
});

console.log(`\n${ok} ok · ${falhas} falha(s)${avisos ? ` · ${avisos} aviso(s)` : ""}\n`);
process.exit(falhas ? 1 : 0);
