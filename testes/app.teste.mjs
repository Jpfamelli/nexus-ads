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
   (h) correções de 01/10/2026: achados da rodada de testes do front (CRM, Conversas/CodeWords, Agenda, Relatórios, white-label, a11y, API)
   (i) contratos da linguagem visual (frente A, plano de 01/10/2026): tokens, classes, tema por esquema, ui.cabecalho/segmentado/toqueLongo/deslizar/
       esqueleto/trocarEsqueleto/erroCartao/acaoComDesfazer/modal+gaveta(protegerTexto)/campo(validar)/vazio e G.destacar — com um DOM de mentira mínimo
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
const PRONTOS = await imp("prontos.js");
await teste("prontos.js (aceite F8): com a lista REAL todas as rotas abrem; o portão segue fechando o que não está na lista (lista injetada)", () => {
  const abre = lista => ({ pronto: k => lista.includes(k), temModulo: () => true, pode: () => true, gestorConta: true, temCliente: true });
  const real = abre(PRONTOS.MODULOS_PRONTOS);
  for (const m of Object.keys(R.ROTAS)) assert.equal(R.acessoRota(m, real), "ok", `${m} abre com a lista do prontos.js`);
  assert.equal(R.rotaPadrao(real), "inicio", "com tudo pronto o app abre no Início");
  // o portão em si, com lista INJETADA (independe do que o arquivo liberou): fora da lista = 'em_breve'
  const parcial = abre(["conversas", "crm"]);
  assert.equal(R.acessoRota("conversas", parcial), "ok");
  assert.equal(R.acessoRota("contatos", parcial), "ok", "contatos e agenda usam a chave crm");
  assert.equal(R.acessoRota("agenda", parcial), "ok");
  for (const m of ["inicio", "empresas", "tarefas", "anuncios", "automacoes", "relatorios"]) assert.equal(R.acessoRota(m, parcial), "em_breve", `${m} fora da lista`);
  assert.equal(R.acessoRota("config", abre([])), "ok", "config e admin não dependem de MODULOS_PRONTOS");
  // cada chave é necessária: tirar só ela da lista REAL fecha exatamente as rotas dela
  const chaves = new Set(Object.values(R.ROTAS).map(r => r.pronto).filter(Boolean));
  for (const k of chaves) {
    const sem = abre(PRONTOS.MODULOS_PRONTOS.filter(x => x !== k));
    const dela = Object.entries(R.ROTAS).filter(([, r]) => r.pronto === k).map(([m]) => m);
    assert.ok(dela.length, `a chave ${k} tem rota`);
    for (const m of Object.keys(R.ROTAS)) assert.equal(R.acessoRota(m, sem), dela.includes(m) ? "em_breve" : "ok", `${m} sem a chave ${k}`);
  }
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
  // Automações aparece no menu do CRM e do Atendimento (não no Nexus Ads), e o deep link não atravessa produtos
  assert.deepEqual(R.itensDoProduto("crm", [{ id: "crm" }, { id: "automacoes" }, { id: "anuncios" }, ...fixos]).map(x => x.id), ["crm", "automacoes", "config", "admin"]);
  assert.deepEqual(R.itensDoProduto("atendimento", [{ id: "conversas" }, { id: "automacoes" }, { id: "anuncios" }, ...fixos]).map(x => x.id), ["conversas", "automacoes", "config", "admin"]);
  assert.deepEqual(R.itensDoProduto("ads", [{ id: "anuncios" }, { id: "automacoes" }, ...fixos]).map(x => x.id), ["anuncios", "config", "admin"]);
  assert.equal(R.rotaNoProduto("crm", "automacoes"), true);
  assert.equal(R.rotaNoProduto("atendimento", "automacoes"), true);
  assert.equal(R.rotaNoProduto("ads", "automacoes"), false);
  assert.equal(R.produtoDaRota("automacoes"), "crm", "rota compartilhada com o Atendimento: CRM é o destino padrão");
  assert.equal(R.acessoRota("automacoes", { pronto: () => true, temModulo: m => m === "automacoes", pode: p => p === "supervisor" || p === "leitura", gestorConta: false, temCliente: true }), "ok");
  assert.equal(R.acessoRota("automacoes", { pronto: () => true, temModulo: () => true, pode: p => p === "leitura", gestorConta: false, temCliente: true }), "sem_acesso", "atendente não vê Automações (precisa ser supervisor)");
  assert.equal(R.rotaPadrao({ produto: "atendimento", temCliente: true, pronto: m => m === "automacoes", temModulo: () => true, pode: () => true, gestorConta: false }), "automacoes", "só Automações liberada no Atendimento: abre nela");
  assert.match(R.PRODUTOS.crm.resumo, /automações/);
  assert.match(R.PRODUTOS.atendimento.resumo, /automações/);
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
await teste("mensagemErro: erros da IA e das automações novas têm texto com orientação (ia_cota, sem_chave, automacao_invalida, campo_invalido, etapa_invalida…)", () => {
  for (const c of ["ia_cota", "sem_chave", "ia_desligada", "ia_resposta_invalida", "ia_invalida", "descricao_invalida", "descricao_curta", "descricao_longa", "automacao_invalida", "campo_invalido",
    "etapa_invalida", "etiqueta_invalida", "pessoa_invalida", "departamento_invalido", "gatilho_invalido", "acao_invalida", "condicao_invalida", "tempo_invalido", "passo_invalido",
    "simulacao_indisponivel", "automacao_nao_encontrada", "muitos_pedidos", "ia_indisponivel"]) assert.ok(A.MENSAGENS[c] && A.MENSAGENS[c].length > 15, `texto para ${c}`);
  assert.match(A.mensagemErro({ codigo: "ia_cota" }), /próximo mês/);
  assert.match(A.mensagemErro({ codigo: "sem_chave" }), /chave da Anthropic/);
  // o nx-ia manda {ok:false, erro:"ia_indisponivel", detalhe:"sem_chave"}: o texto diz o que falta, e não só "indisponível"
  assert.match(A.mensagemErro({ codigo: "ia_indisponivel", detalhe_texto: "sem_chave", detalhe: "sem_chave" }), /chave da Anthropic/);
  assert.match(A.mensagemErro({ codigo: "ia_indisponivel", detalhe_texto: "conversa_vazia" }), /não há mensagens|Ainda não há mensagens/i);
  assert.equal(A.mensagemErro({ codigo: "ia_indisponivel" }), "A IA não está disponível agora.");
  assert.equal(A.mensagemErro({ codigo: "automacao_invalida", hint: "ação 2: escolha a etapa" }), "A automação tem um problema: ação 2: escolha a etapa.");
  for (const c of Object.keys(A.MENSAGENS)) assert.ok(!/undefined|null|{}/.test(A.MENSAGENS[c]), c);
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
await teste("fn: opcoes.prazoMs amplia a espera só daquela chamada (até o teto); o prazo fixo de criarApi vence", async () => {
  const vistos = [];
  const original = globalThis.setTimeout;
  globalThis.setTimeout = (cb, ms, ...r) => { vistos.push(ms); return original(cb, ms, ...r); };
  try {
    const f = fetchFalso(() => ({ status: 200, corpo: { ok: true } }));
    const api = A.criarApi({ url: URLS, chave: "pub", token: () => "t", cliente: () => "c", fetch: f });
    await api.fn("nx-ia", { acao: "x" });                              // padrão: 75 s
    await api.fn("nx-ia", { acao: "x" }, { prazoMs: 130_000 });        // a IA que monta a automação
    await api.fn("nx-ia", { acao: "x" }, { prazoMs: 9_999_999 });      // nunca passa do teto das Edge Functions
    await api.fn("nx-ia", { acao: "x" }, { prazoMs: 1_000 });          // opção menor que o padrão não encurta nada
    await api.fn("nx-ia", { acao: "x" }, { prazoMs: "abc" });
    await api.rpc("nx_pulso", {});                                     // RPC continua com 20 s
    assert.deepEqual(vistos, [75_000, 130_000, A.TETO_PRAZO_FN_MS, 75_000, 75_000, 20_000]);
    assert.ok(A.TETO_PRAZO_FN_MS < 150_000, "abaixo do teto de ~150 s da Edge Function");
    assert.equal(f.chamadas[1].corpo.prazoMs, undefined, "a opção não vai no corpo da requisição");
    vistos.length = 0;
    const fixo = A.criarApi({ url: URLS, chave: "pub", fetch: f, prazoMs: 9_000 });
    await fixo.fn("nx-ia", {}, { prazoMs: 130_000 });
    assert.deepEqual(vistos, [9_000]);
  } finally { globalThis.setTimeout = original; }
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
  F7: ["automacoes.js", "auto-logica.js", "auto-catalogo.js", "auto-pecas.js", "auto-editor.js", "automacoes.css"],
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
await teste("prontos.js: MODULOS_PRONTOS e CONFIG_PRONTAS = exatamente o que o código tem (nada esquecido, nada que não exista, sem repetição)", () => {
  const { MODULOS_PRONTOS, CONFIG_PRONTAS } = PRONTOS;
  assert.equal(new Set(MODULOS_PRONTOS).size, MODULOS_PRONTOS.length, "MODULOS_PRONTOS sem repetição");
  assert.equal(new Set(CONFIG_PRONTAS).size, CONFIG_PRONTAS.length, "CONFIG_PRONTAS sem repetição");
  // módulos: chave `pronto` de cada rota + qualquer ctx.pronto("...") chamado no código (ex.: admin_revendas)
  const modulos = new Set(Object.values(R.ROTAS).map(r => r.pronto).filter(Boolean));
  for (const f of js) for (const m of ler(f).matchAll(/\bpronto\(\s*["']([a-z_]+)["']\s*\)/g)) modulos.add(m[1]);
  assert.deepEqual([...MODULOS_PRONTOS].sort(), [...modulos].sort(), "MODULOS_PRONTOS × chaves usadas no código");
  // configuração: toda seção `{ id: "...", titulo: ...` do hub e dos *-config.js
  const secoes = new Set();
  for (const f of ["config.js", ...js.filter(x => x.endsWith("-config.js"))]) {
    for (const m of ler(f).matchAll(/^\s*\{\s*id:\s*"([a-z_]+)",\s*titulo:/gm)) secoes.add(m[1]);
  }
  assert.ok(secoes.size >= 18, `seções de configuração encontradas: ${[...secoes].join(", ")}`);
  assert.deepEqual([...CONFIG_PRONTAS].sort(), [...secoes].sort(), "CONFIG_PRONTAS × seções do hub de configurações");
});
await teste("app.js: se o prontos.js não carregar, o padrão continua FECHADO (nenhum módulo, só perfil)", () => {
  const app = ler("app.js");
  assert.match(app, /const PRONTOS_PADRAO = \{ MODULOS_PRONTOS: \[\], CONFIG_PRONTAS: \["perfil"\] \};/);
  assert.match(app, /catch \{ E\.prontos = PRONTOS_PADRAO; \}/);
  assert.match(app, /Array\.isArray\(p\.MODULOS_PRONTOS\) \? p\.MODULOS_PRONTOS : \[\]/, "lista inválida não abre nada");
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
  assert.match(ui, /const abrirCamada = \(\) => camadas\.abrir\(\(\) => \{[\s\S]*?else api\.fechar\(null\);/, "modal() abre a camada (Voltar fecha o modal, ou pergunta se há texto digitado)");
  assert.match(ui, /camada = abrirCamada\(\);/, "modal() liga a camada ao abrir");
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
  // aceite F8 (01/10/2026): nenhuma regra [build].ignore pula o build da main; a main publica
  assert.doesNotMatch(t.replace(/^\s*#.*$/gm, ""), /^\s*ignore\s*=/m, "sem a regra ignore do build da main");
  assert.doesNotMatch(t.replace(/^\s*#.*$/gm, ""), /\$BRANCH/, "nenhum filtro por branch no build");
  assert.match(t, /from = "\/"\s*\n\s*to = "\/app\/"\s*\n\s*status = 302\s*\n\s*force = true/);
  assert.match(t, /from = "\/index\.html"\s*\n\s*to = "\/app\/"\s*\n\s*status = 302\s*\n\s*force = true/);
  assert.match(t, /Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:\/\/dtjznipitihnwmcgpzqh\.supabase\.co; connect-src 'self' https:\/\/dtjznipitihnwmcgpzqh\.supabase\.co; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"/);
  for (const k of ["Referrer-Policy", "X-Content-Type-Options", "Permissions-Policy"]) assert.match(t, new RegExp(k));
});

/* ============================================================ (h) correções de 01/10/2026 (rodada de testes: achados do front) */
console.log("\n(h) correções de 01/10/2026");
const CRMLOG = await imp("crm-logica.js");
const RELLOG = await imp("rel-logica.js");
const GRAF = await imp("graficos.js");
const CVLOG = await imp("cv-logica.js");
const NUCLEO = await import(pathToFileURL(join(RAIZ, "web", "nucleo.js")).href);

await teste("T03: soltar no fim de uma coluna com «Ver mais» não pula os cartões não carregados (ordemDoSoltar)", () => {
  const itens = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, ordem: 100 + i * 0.1 }));     // 30 carregados: 100,0 … 102,9
  // o próximo do servidor tem ordem 102,95: o cartão solto vai ENTRE o 30º e o 31º (antes: última + 1 = 103,9, depois dos não carregados)
  const o = CRMLOG.ordemDoSoltar(itens, 30, 102.95);
  assert.ok(o > 102.9 && o < 102.95, `ordem ${o}`);
  assert.equal(CRMLOG.ordemDoSoltar(itens, 30, undefined), itens[29].ordem + 1, "sem vizinho de baixo: fim de lista, como antes");
  assert.equal(CRMLOG.ordemDoSoltar(itens, 30, null), itens[29].ordem + 1, "o próximo sem ordem (nulo) fica depois de todos: última + 1 serve");
  assert.equal(CRMLOG.ordemDoSoltar(itens, 5, 999), CRMLOG.ordemEntre(itens[4].ordem, itens[5].ordem), "no meio da lista vale o vizinho carregado");
  assert.equal(CRMLOG.ordemDoSoltar([], 0, undefined, 5000), -5, "coluna vazia: topo (ordem negativa pelo relógio)");
  const k = ler("crm-kanban.js");
  assert.match(k, /nx_negocios_coluna", \{ p_estagio: estagioId, p_filtro: filtroServidor\(\), p_offset: destCol\.itens\.length \}/, "busca o próximo cartão do servidor");
  assert.match(k, /L\.ordemDoSoltar\(itens, pos, proxima\)/);
});
await teste("T03: a pontuação do lead (campos.score, score_motivo, score_em) aparece no cartão e na gaveta (pontuacao)", () => {
  assert.deepEqual(CRMLOG.pontuacao({ campos: { score: 85, score_motivo: "pediu orçamento", score_em: "2026-10-01T09:30" } }),
    { score: 85, faixa: "alta", motivo: "pediu orçamento", em: "2026-10-01T09:30" });
  assert.equal(CRMLOG.pontuacao({ score: 40 }).faixa, "media", "o cartão pode trazer score solto");
  assert.equal(CRMLOG.pontuacao({ campos: { score: "12" } }).faixa, "baixa", "texto numérico também");
  assert.equal(CRMLOG.pontuacao({ campos: { score: 0 } }).score, 0, "zero é nota válida");
  for (const ruim of [null, {}, { campos: {} }, { campos: { score: "abc" } }, { campos: { score: 101 } }, { campos: { score: -1 } }, { campos: { score: "" } }, "x"])
    assert.equal(CRMLOG.pontuacao(ruim), null, JSON.stringify(ruim));
  const cartao = ler("crm-kanban.js"), gaveta = ler("crm-negocio.js");
  assert.match(cartao, /L\.pontuacao\(c\)/); assert.match(cartao, /`Lead \$\{pont\.score\}`/);
  assert.match(gaveta, /k\.L\.pontuacao\(n\)/); assert.match(gaveta, /"Pontuação do lead"/);
});
await teste("T03: «Valor previsto» com texto que não é número não apaga o valor (dinheiroInvalido + validar da linha editável)", () => {
  assert.equal(CRMLOG.dinheiroInvalido("abc"), true);
  assert.equal(CRMLOG.dinheiroInvalido("12abc"), true);
  for (const bom of ["", "   ", "1.500,50", "R$ 2.000", "2.000", "0", "1500.5"]) assert.equal(CRMLOG.dinheiroInvalido(bom), false, JSON.stringify(bom));
  assert.equal(CRMLOG.lerNumero("1.500,50"), 1500.5);
  const g = ler("crm-negocio.js");
  assert.match(g, /validar: c => k\.L\.dinheiroInvalido\(c\.value\)[^\n]*\n\s*salvar: v => salvar\(\{ valor_previsto: v \}\)/, "Valor previsto valida antes de gravar");
  assert.match(g, /validar: c => k\.L\.dinheiroInvalido\(c\.value\)[^\n]*\n\s*salvar: v => salvar\(\{ valor: v \}\)/, "Valor final também");
  assert.match(g, /if \(invalido\) \{ mostrarInvalido\(invalido\); return; \}/, "inválido mostra o erro e NÃO chama salvar");
});
await teste("T03: aviso «Ao salvar» do funil concorda no singular (1 negócio vai, 2 vão)", () => {
  const c = ler("crm-config.js");
  assert.match(c, /\$\{r\.e\._n === 1 \? "vai" : "vão"\} para «/);
  assert.doesNotMatch(c, /"negocios"\)\} vão para «/, "nunca mais «vão» fixo depois da contagem");
});

await teste("T04: o aparelho do CodeWords não tem janela de 24 h — a tela não trava o que o servidor aceita (canalTemJanela)", () => {
  assert.equal(CVLOG.canalTemJanela("codewords"), false);
  assert.equal(CVLOG.canalTemJanela("meta"), true);
  assert.equal(CVLOG.canalTemJanela(undefined), true, "canal desconhecido segue a regra da Meta");
  const comp = ler("cv-composer.js"), chat = ler("cv-chat.js"), conv = ler("conversas.js");
  assert.match(comp, /L\.canalTemJanela\(provedorCanal\(\)\) && !L\.janela\(c\)\.aberta\) return "janela"/);
  assert.match(chat, /L\.canalTemJanela\(provedorCanal\)/, "o selo «Janela aberta/fechada» some no CodeWords");
  assert.match(conv, /L\.canalTemJanela\(provedorItem\) && !L\.janela\(item\)\.aberta/, "«Nova conversa» no CodeWords não abre os modelos da Meta");
  // o servidor (enviar.js) é a fonte: texto livre sem janela só no CodeWords
  const env = readFileSync(join(RAIZ, "supabase", "functions", "_compartilhado", "enviar.js"), "utf8");
  assert.match(env, /exigeJanela: cx\.canal\?\.provedor !== "codewords"/);
});

await teste("T06: bloqueio de dia(s) inteiro(s) mostra «Dia inteiro · 06/10/2026», não «06/10 00:00 — 07/10 00:00» (periodoBR)", () => {
  assert.equal(U.periodoBR("2026-10-06T03:00:00Z", "2026-10-07T03:00:00Z"), "Dia inteiro · 06/10/2026");
  assert.equal(U.periodoBR("2026-10-06T03:00:00Z", "2026-10-09T03:00:00Z"), "Dias inteiros · 06/10/2026 a 08/10/2026");
  assert.equal(U.periodoBR("2026-10-06T12:00:00Z", "2026-10-06T15:00:00Z", " · "), "06/10/2026 09:00 · 06/10/2026 12:00", "faixa de horário continua com as horas");
  assert.equal(U.periodoBR("2026-10-06T12:00:00Z", "2026-10-07T15:00:00Z"), "06/10/2026 09:00 — 07/10/2026 12:00");
  assert.match(ler("agenda.js"), /ui\.periodoBR\(b\.inicio, b\.fim, " · "\)/);
  assert.match(ler("agenda-config.js"), /ui\.periodoBR\(b\.inicio, b\.fim, " — "\)/);
});

await teste("T07: KPI sem valor mostra «sem base» neutro, não um ▼ 100% falso; «agora» só em «Abertas agora»", () => {
  assert.equal(RELLOG.chipVar(null, 593.33, "cima").txt, "sem base");
  assert.equal(RELLOG.chipVar(null, 593.33, "cima").cls, "neutro");
  assert.equal(RELLOG.chipVar(0, 593.33, "cima").cls, "ruim", "zero de verdade continua caindo");
  const k = RELLOG.kpisVendas({ kpis: { ticket_medio: null, ciclo_medio_dias: null }, kpis_anterior: { ticket_medio: 593.33, ciclo_medio_dias: 7 } });
  for (const id of ["ticket_medio", "ciclo_medio_dias"]) assert.equal(k.find(x => x.id === id).v, null);
  assert.equal(k.filter(x => x.agora).length, 0, "nenhum KPI de vendas é «agora»");
  const at = RELLOG.kpisAtendimento({ kpis: { abertas_agora: 3 }, kpis_anterior: {} });
  assert.deepEqual(at.filter(x => x.agora).map(x => x.id), ["abertas_agora"]);
  const r = ler("relatorios.js");
  assert.match(r, /const c = L\.chipVar\(vv, k\.a == null \? null : \+k\.a, k\.sentido\)/, "nunca +null (virava 0)");
  assert.match(r, /k\.agora \? h\("span", \{ class: "rel-kpi-linha" \}/);
});
await teste("T07: campanhas — o que o CRM atribuiu a anúncios fora das linhas com gasto aparece como «Sem investimento no período» (herói = Total + sobra)", () => {
  const hoje = "2026-10-01";
  const metricas = [{ n: "campanha", d: "2026-09-30", p: "meta", c: "A", cn: "Com gasto", g: 50, imp: 1000, cli: 20, conv: 5 }];
  const leads = [
    { id: 1, data_conversa: "2026-09-29", plataforma: "meta", campanha_ext: "A", etapa: "agendada", data_agenda: "2026-09-30", servico: "Implante" },
    { id: 2, data_conversa: "2026-09-29", plataforma: "meta", campanha_ext: "PAUSADA", etapa: "agendada", data_agenda: "2026-09-30", servico: "Implante" },
    { id: 3, data_conversa: "2026-09-29", plataforma: "meta", campanha_ext: "PAUSADA", etapa: "agendada", data_agenda: "2026-09-30", servico: "Implante" },
  ];
  const M = NUCLEO.montar(NUCLEO.datasetDeLinhas({ metricas, leads, hoje, dias: 60, cliente: { nome: "T" } }));
  const heroi = RELLOG.numerosPeriodo(M, { dias: 30 }).c.agendadas;
  const { linhas, total, outras } = RELLOG.linhasCampanhas(M, { dias: 30 });
  assert.equal(linhas.length, 1, "só a campanha com gasto vira linha");
  assert.equal(total.ag, 1);
  assert.equal(outras.ag, 2, "as 2 agendadas da campanha sem gasto");
  assert.equal(total.ag + outras.ag, heroi, "Total + sobra = o que a Visão geral mostra");
  assert.match(ler("anuncios.js"), /Sem investimento no período/);
});
await teste("T07: texto do ranking de criativos concorda no singular (O criativo com… / Os 3 criativos com…)", () => {
  const a = ler("anuncios.js");
  assert.match(a, /R\.lista\.length === 1 \? "O criativo com" : `Os \$\{R\.lista\.length\} criativos com`/);
  assert.match(a, /R\.lista\.length === 1 \? "O criativo com menor custo por conversa" : `Os \$\{R\.lista\.length\} criativos com menor custo por conversa`/);
});
await teste("T07: rótulos do eixo X nunca se sobrepõem (indicesRotulo) — 30 dias a 390 px derrubava o penúltimo", () => {
  const n = 30, iw = 390 - 40 - 16 - 32, x = k => 40 + k / (n - 1) * iw;
  const rot = Array.from({ length: n }, (_, i) => `${String(i + 1).padStart(2, "0")}/10`);
  const idx = GRAF.indicesRotulo(n, GRAF.passoRotulo(n, 4), x, rot);
  assert.equal(idx[0], 0); assert.equal(idx[idx.length - 1], n - 1, "o último dia sempre aparece");
  for (let i = 1; i < idx.length; i++) assert.ok(x(idx[i]) - x(idx[i - 1]) >= 5 * 6.6 * 1.5 + 6 - 0.001, `rótulos ${idx[i - 1]} e ${idx[i]} colados`);
  // largo: 90 dias a 1440 px mantém os intervalos normais
  const xG = k => 52 + k / 89 * 900;
  const idxG = GRAF.indicesRotulo(90, GRAF.passoRotulo(90, 7), xG, Array.from({ length: 90 }, (_, i) => `${i}/09`));
  assert.ok(idxG.length >= 7 && idxG.includes(89));
  assert.deepEqual(GRAF.indicesRotulo(1, 1, () => 0, ["a"]), [0]);
});
await teste("T07: o alerta «gasto mínimo» compara em centavos — 1,16 + 14,87 + 5,97 = R$ 22,00 dispara a regra r2", () => {
  const hoje = "2026-10-01";
  const dia = (d, g) => ({ n: "campanha", d, p: "meta", c: "X", cn: "Camp X", g, imp: 500, cli: 5, conv: 0 });
  const M = NUCLEO.montar(NUCLEO.datasetDeLinhas({ metricas: [dia("2026-09-28", 1.16), dia("2026-09-29", 14.87), dia("2026-09-30", 5.97)], hoje, dias: 30, cliente: { nome: "T" } }));
  const t = M.consolidar(M.linhasDe(M.R - 2, M.R));
  assert.notEqual(t.gasto, 22, "a soma em ponto flutuante não dá exatamente 22");
  assert.ok(M.avaliar(M.R).some(a => a.regra.id === "r2"), "R$ 22,00 sem conversa: alerta");
  const M2 = NUCLEO.montar(NUCLEO.datasetDeLinhas({ metricas: [dia("2026-09-28", 1.16), dia("2026-09-29", 14.86), dia("2026-09-30", 5.97)], hoje, dias: 30, cliente: { nome: "T" } }));
  assert.ok(!M2.avaliar(M2.R).some(a => a.regra.id === "r2"), "R$ 21,99 continua sem alertar");
});
await teste("T07: resumo mensal omite «Em relação a…» quando nenhum dos dois meses fechou paciente", () => {
  const hoje = "2026-10-01";
  const metricas = [{ n: "campanha", d: "2026-08-15", p: "meta", c: "A", cn: "A", g: 40, imp: 900, cli: 9, conv: 3 }, { n: "campanha", d: "2026-09-15", p: "meta", c: "A", cn: "A", g: 40, imp: 900, cli: 9, conv: 3 }];
  const M = NUCLEO.montar(NUCLEO.datasetDeLinhas({ metricas, hoje, dias: 130, cliente: { nome: "Clínica" } }));
  const set = M.mesesDados().find(m => m.mes === 8 && m.completo);
  assert.ok(set, "setembro completo");
  const txt = M.relMensal(set);
  assert.doesNotMatch(txt, /Em relação a/, "0 → 0 é ruído");
  assert.match(txt, /Resultados de setembro/);
  // com fechamento nos dois meses a comparação volta
  const leads = [{ id: 1, data_conversa: "2026-09-10", plataforma: "meta", campanha_ext: "A", etapa: "fechou", data_agenda: "2026-09-12", servico: "Implante", valor: 3000 },
    { id: 2, data_conversa: "2026-08-10", plataforma: "meta", campanha_ext: "A", etapa: "fechou", data_agenda: "2026-08-12", servico: "Implante", valor: 3000 }];
  const M2 = NUCLEO.montar(NUCLEO.datasetDeLinhas({ metricas, leads, hoje, dias: 130, cliente: { nome: "Clínica" } }));
  assert.match(M2.relMensal(M2.mesesDados().find(m => m.mes === 8 && m.completo)), /Em relação a agosto/);
});

await teste("T08: pílulas de status e texto secundário legíveis em fundos de marca médios (derivarTema, 4.000 combinações)", () => {
  const sorteio = rng(20261001);
  const cor = () => "#" + Array.from({ length: 3 }, () => Math.floor(sorteio() * 256).toString(16).padStart(2, "0")).join("").toUpperCase();
  const casos = [{ primaria: "#B0761F", secundaria: "#6FA3CF", fundo: "#C8B79A" }, { primaria: "#B0761F", secundaria: "#6FA3CF", fundo: "#E8D5C4" },
    { primaria: "#B0761F", secundaria: "#6FA3CF", fundo: "#F4F1EA" }, { primaria: "#B0761F", secundaria: "#6FA3CF", fundo: "#210AFD" },
    { primaria: "#FF00FF", secundaria: "#6FA3CF", fundo: "#00FF00" }];
  for (let i = 0; i < 4000; i++) casos.push({ primaria: cor(), secundaria: cor(), fundo: cor() });
  for (const m of casos) {
    const v = T.derivarTema(m).vars;
    for (const k of ["ok", "ruim", "aten", "info"]) assert.ok(T.contraste(v[`--c-${k}`], v[`--c-${k}-suave`]) >= 4.5 - 1e-9, `pílula ${k} ${JSON.stringify(m)}`);
    assert.ok(T.contraste(v["--c-texto-2"], v["--c-sup-3"]) >= 4.5 - 1e-9, `texto-2 ${JSON.stringify(m)}`);
    assert.ok(T.contraste(v["--c-meta"], v["--c-meta-suave"]) >= 4.5 - 1e-9, `meta ${JSON.stringify(m)}`);   // M04: Meta e Google têm fundo suave próprio (antes: o da secundária e o do aviso)
    assert.ok(T.contraste(v["--c-google"], v["--c-google-suave"]) >= 4.5 - 1e-9, `google ${JSON.stringify(m)}`);
    for (const [luz, suave] of [["--c-prim-luz", "--c-prim-suave"], ["--c-sec-luz", "--c-sec-suave"]])
      assert.ok(T.contraste(T.misturar(v[luz], v["--c-texto"], 0.22), v[suave]) >= 4.5 - 1e-9, `pílula ${luz} ${JSON.stringify(m)}`);
    assert.ok(T.contraste(v["--c-prim-luz"], v["--c-fundo"]) >= 4.5 - 1e-9 && T.contraste(v["--c-sec-luz"], v["--c-fundo"]) >= 4.5 - 1e-9);
  }
  // os fundos que já passavam NÃO mudam de cor (o #FAFAF8 era o fundo claro padrão até o M01; hoje é só um fundo de marca)
  const antigo = T.derivarTema({ ...T.PADRAO.cores, fundo: "#FAFAF8" }).vars;
  assert.deepEqual([antigo["--c-ok"], antigo["--c-prim-luz"], antigo["--c-texto-2"]], ["#1A6E44", "#8D5F19", "#54595D"]);
  // …exceto o âmbar de atenção: o bronze da marca (36°) estava a 3° dele; o M04 gira o ESTADO (nunca a marca) para ≥ 30° de distância
  assert.notEqual(antigo["--c-aten"], "#8A5A00");
  assert.ok(T.distMatiz(T.matiz(antigo["--c-aten"]), T.matiz("#B0761F")) >= 30, "atenção a ≥ 30° do bronze");
  const semConflito = T.derivarTema({ primaria: "#7B3FA2", secundaria: "#6FA3CF", fundo: "#FAFAF8" }).vars;
  assert.deepEqual([semConflito["--c-ok"], semConflito["--c-aten"]], ["#1A6E44", "#8A5A00"], "sem conflito de matiz as cores de estado são as de sempre");
  // o novo padrão (M01: papel #F3F0E9) tem a mesma primária e só ajusta o que o papel mais escuro exige
  const padrao = T.derivarTema(T.PADRAO.cores).vars;
  assert.equal(padrao["--c-fundo"], "#F3F0E9"); assert.equal(padrao["--c-prim-luz"], "#8D5F19");
  assert.deepEqual([padrao["--c-ok"], padrao["--c-aten"], padrao["--c-texto-2"]], ["#165E3A", "#546100", "#525659"], "o papel pede verde e texto-2 um pouco mais escuros; a atenção gira para longe do bronze");
  assert.equal(T.garantirContraste("#1A6E44", ["#FFFFFF"]), "#1A6E44", "já passa: devolve a mesma cor");
});
await teste("T08: logo estreito/alto demais ganha aviso na prévia (avisoProporcaoLogo); largo e quadrado não", () => {
  assert.match(CFG.avisoProporcaoLogo(90, 500), /muito estreito e alto/);
  assert.match(CFG.avisoProporcaoLogo(29, 160), /ilegível/);
  for (const [w, h] of [[1200, 240], [200, 200], [100, 200], [300, 450], [0, 0], [null, 10]]) assert.equal(CFG.avisoProporcaoLogo(w, h), "", `${w}x${h}`);
  assert.match(ler("config.js"), /avisoProporcaoLogo\(im\.naturalWidth, im\.naturalHeight\)/);
});
await teste("T08: tela de entrada não alarga com nome do produto/título de uma palavra só (overflow-wrap + min-width:0)", () => {
  const css = ler("app.css");
  assert.match(css, /\.entrar-marca \{[^}]*min-width: 0/);
  assert.match(css, /\.entrar-marca span \{[^}]*overflow-wrap: anywhere/);
  assert.match(css, /\.entrar-titulo \{[\s\S]*?overflow-wrap: anywhere/);
  assert.match(css, /\.entrar-sub \{[^}]*overflow-wrap: anywhere/);
  assert.match(css, /\.entrar-cartao h1, \.entrar-cartao \.sub \{ overflow-wrap: anywhere/);
});

await teste("T09: «Pular para o conteúdo» não vira rota (#vista → Página não encontrada): o clique só move o foco", () => {
  const app = ler("app.js");
  assert.match(app, /document\.querySelector\("\.pular"\)/);
  assert.match(app, /pular\.addEventListener\("click", ev => \{\s*ev\.preventDefault\(\);/);
  assert.match(app, /\$\("app"\) && !\$\("app"\)\.hidden \? \$\("vista"\) : \$\("publico"\)/);
  assert.match(readFileSync(join(APP, "index.html"), "utf8"), /<a class="pular" href="#vista">/);
});
await teste("T09: ui.carregando devolve o foco do teclado ao botão (desabilitar o derruba no <body>)", async () => {
  const corpo = { nome: "body" };
  const botao = { disabled: false, isConnected: true, chamadasFoco: 0, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    focus() { this.chamadasFoco++; globalThis.document.activeElement = this; } };
  const anterior = globalThis.document;
  try {
    globalThis.document = { activeElement: botao, body: corpo, documentElement: {} };
    const r = await U.carregando(botao, async () => { globalThis.document.activeElement = corpo; /* o navegador soltou o foco do botão desabilitado */ return 42; });
    assert.equal(r, 42);
    assert.equal(botao.disabled, false); assert.equal(botao.attrs["aria-busy"], undefined);
    assert.equal(botao.chamadasFoco, 1, "o foco voltou ao botão");
    assert.equal(globalThis.document.activeElement, botao);
    // quem NÃO tinha o foco não ganha foco; quem já foi para outro campo não perde para o botão
    const outro = { id: "outro" }; botao.chamadasFoco = 0;
    globalThis.document.activeElement = corpo;
    await U.carregando(botao, Promise.resolve());
    assert.equal(botao.chamadasFoco, 0, "sem foco antes, sem foco depois");
    globalThis.document.activeElement = botao;
    await U.carregando(botao, async () => { globalThis.document.activeElement = outro; });
    assert.equal(botao.chamadasFoco, 0); assert.equal(globalThis.document.activeElement, outro);
    // erro da promessa: ainda reabilita e devolve o foco
    globalThis.document.activeElement = botao;
    await assert.rejects(U.carregando(botao, async () => { globalThis.document.activeElement = corpo; throw new Error("x"); }));
    assert.equal(botao.disabled, false); assert.equal(botao.chamadasFoco, 1);
  } finally { if (anterior === undefined) delete globalThis.document; else globalThis.document = anterior; }
});
await teste("T09: rolagem suave respeita prefers-reduced-motion (comportamentoRolagem) e o editor não fixa «smooth»", () => {
  const tinha = Object.hasOwn(globalThis, "matchMedia"), anterior = globalThis.matchMedia;
  try {
    globalThis.matchMedia = q => ({ matches: /reduce/.test(q) });
    assert.equal(U.comportamentoRolagem(), "auto");
    globalThis.matchMedia = () => ({ matches: false });
    assert.equal(U.comportamentoRolagem(), "smooth");
    delete globalThis.matchMedia;
    assert.equal(U.comportamentoRolagem(), "smooth", "sem matchMedia não há preferência a respeitar");
  } finally { if (tinha) globalThis.matchMedia = anterior; else delete globalThis.matchMedia; }
  assert.doesNotMatch(ler("auto-editor.js"), /behavior: "smooth"/);
  assert.doesNotMatch(ler("crm-kanban.js"), /behavior: "smooth"/);
});
await teste("T09: editor de Automações — Esc fecha a paleta, foco segue ao remover passo/condição, abas ARIA, frase sem aria-live", () => {
  const ed = ler("auto-editor.js");
  assert.match(ed, /ev\.key !== "Escape" \|\| !paletaAberta/);
  assert.match(ed, /xs\[Math\.min\(i, xs\.length - 1\)\] \|\| blocoEntao\.querySelector\("\.au-mais"\)/);
  assert.match(ed, /xs\[Math\.min\(i, xs\.length - 1\)\] \|\| blocoSe\.querySelector\("\.au-mais"\)/);
  assert.match(ed, /painel: painelRegra/); assert.match(ed, /painel: painelExec/);
  assert.match(ed, /const frase = h\("p", \{ class: "au-frase" \}\);/);
  assert.match(ed, /refoco/, "«Atualizar» das execuções devolve o foco");
  assert.match(ed, /--au-cab-h/); assert.match(ed, /amb\.aoSair/);
  const ap = ler("automacoes.js");
  assert.match(ap, /area\.readOnly = true/, "Criar com IA: só-leitura (não disabled) durante a chamada");
  assert.match(ap, /ui\.manterFoco\(b\)/, "interruptor da lista devolve o foco");
  const u = ler("ui.js");
  assert.match(u, /it\.painel\.setAttribute\("role", "tabpanel"\)/); assert.match(u, /"aria-controls", it\.painel\.id/);
});
await teste("T09: chips «radio» são UMA parada de Tab (roving tabindex) em auto-pecas.js", () => {
  const p = ler("auto-pecas.js");
  assert.match(p, /b\.tabIndex = b === marcado \? 0 : -1/);
  assert.match(p, /new MutationObserver\(sincronizar\)\.observe\(grupo, \{ attributes: true, attributeFilter: \["aria-checked", "disabled"\]/);
});
await teste("T09: CSS — cabeçalho do passo quebra no celular, contraste dos 4 textos pequenos, forced-colors, scroll-padding, placeholder", () => {
  const css = ler("automacoes.css"), app = ler("app.css");
  assert.match(css, /\.au-acao-cab \{\s*display: flex; flex-wrap: wrap;/);
  assert.match(css, /\.au-acao-tit \{ flex: 1 1 8rem;/); assert.match(css, /\.au-acao-bts \{[^}]*margin-left: auto/);
  for (const sel of [".au-var", ".au-acao-resumo", ".au-mini-espera", ".au-sim-link"]) {
    const i = css.indexOf(`${sel} {`); assert.ok(i >= 0, sel);
    assert.match(css.slice(i, i + 400), /color: color-mix\(in srgb, var\(--c-(sec|prim)-luz\) 72%, var\(--c-texto\)\)/, `${sel} puxa a cor para o texto (≥ 4,5:1)`);
  }
  assert.match(css, /@media \(forced-colors: active\) \{[\s\S]*\.au-sw\[aria-checked="true"\] \.au-sw-trilho \{ background: Highlight/);
  assert.match(app, /@media \(forced-colors: active\) \{[\s\S]*\.aba\[aria-selected="true"\] \{ forced-color-adjust: none; background: Highlight/);
  assert.match(css, /html:has\(\.au-pag-editor\) \{ scroll-padding-top: calc\(var\(--topo\) \+ var\(--au-cab-h, 0px\) \+ 1rem\)/);
  assert.match(app, /html \{ scroll-padding-bottom: calc\(var\(--barra\) \+ env\(safe-area-inset-bottom\) \+ 1rem\)/);
  assert.match(css, /\.au-nome-inp::placeholder \{[^}]*text-overflow: ellipsis/);
  assert.match(css, /\.au-tpl-aviso \.bt \{ white-space: normal/);
});

await teste("T10: chamadas de servidor que passam dos 75 s esperam MAIS que o pior caso do servidor (sugerir/resumir/parear/envio)", async () => {
  const vistos = [];
  const original = globalThis.setTimeout;
  globalThis.setTimeout = (cb, ms, ...r) => { vistos.push(ms); return original(cb, ms, ...r); };
  try {
    const f = fetchFalso(() => ({ status: 200, corpo: { ok: true } }));
    const api = A.criarApi({ url: URLS, chave: "pub", token: () => "t", cliente: () => "c", fetch: f });
    for (const [fn, acao] of [["nx-ia", "sugerir"], ["nx-ia", "resumir"], ["nx-codewords", "parear"], ["nx-codewords", "inscrever"], ["nx-enviar", "texto"], ["nx-enviar", "midia"], ["nx-enviar", "template"]])
      await api.fn(fn, { acao });
    await api.fn("nx-enviar", { acao: "lido" });                    // chamadas rápidas seguem em 75 s
    await api.fn("nx-ia", { acao: "automacao_montar" }, { prazoMs: 130_000 });
    assert.deepEqual(vistos, [100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 100_000, 75_000, 130_000]);
    assert.ok(A.PRAZO_FN_LENTA_MS > 91_000 && A.PRAZO_FN_LENTA_MS < A.TETO_PRAZO_FN_MS, "acima de 2 × 45 s da Anthropic e abaixo do teto da Edge Function");
    vistos.length = 0;
    const fixo = A.criarApi({ url: URLS, chave: "pub", fetch: f, prazoMs: 9_000 });
    await fixo.fn("nx-ia", { acao: "sugerir" });
    assert.deepEqual(vistos, [9_000], "o prazo geral fixado nos testes continua valendo");
  } finally { globalThis.setTimeout = original; }
});


/* ============================================================ (i) CONTRATOS DA LINGUAGEM VISUAL (frente A, plano de 01/10/2026) */
console.log("\n(i) contratos da linguagem visual (tokens, classes e componentes base)");
const CSS_APP = ler("app.css");
const BLOCO_A = CSS_APP.slice(CSS_APP.indexOf("LINGUAGEM VISUAL — contratos da frente A"));
const luz = (T0, hex) => T0.luminancia(hex);

/* ---------- tokens e classes ---------- */
await teste("app.css :root traz os tokens do contrato (escala --fs-*, --f-narr, superfícies, gravidade, acento do produto)", () => {
  const raiz = CSS_APP.slice(CSS_APP.indexOf(":root {"), CSS_APP.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (const t of ["--fs-display", "--fs-h1", "--fs-h2", "--fs-h3", "--fs-num-xl", "--fs-num-l", "--fs-num-m", "--fs-corpo", "--fs-peq",
    "--f-narr", "--c-sup", "--c-poco", "--c-sup-3", "--c-sev-info", "--c-sev-aten", "--c-sev-crit", "--c-prod"]) {
    assert.match(raiz, new RegExp(`${t}:`), `falta ${t} no :root`);
  }
  assert.match(raiz, /--fs-display: clamp\(2\.5rem,/, "display fluido de 40 px…");
  assert.match(raiz, /--fs-h1: clamp\(1\.75rem,/, "h1 fluido de 28 px…");
  assert.match(raiz, /--fs-h2: 1\.25rem; --fs-h3: 1rem;/);
  assert.match(raiz, /--fs-num-xl: 2\.75rem; --fs-num-l: 2rem; --fs-num-m: 1\.5rem;/, "números 44/32/24");
  assert.match(raiz, /--fs-corpo: \.9375rem; --fs-peq: \.8125rem;/);
});
await teste("Zodiak itálica: arquivo em web/fonts, @font-face com swap em app.css, --f-narr só em .narr (nada de requisição no login)", () => {
  assert.ok(existsSync(join(RAIZ, "web", "fonts", "zodiak-variable-italic.woff2")), "arquivo da fonte");
  assert.match(CSS_APP, /@font-face \{ font-family: "Nx Zodiak"; src: url\("\.\.\/fonts\/zodiak-variable-italic\.woff2"\)[^}]*font-style: italic; font-display: swap;/);
  const usos = [...CSS_APP.matchAll(/([^{}]+)\{[^}]*font-family:\s*var\(--f-narr\)[^}]*\}/g)].map(m => m[1].trim());
  assert.ok(usos.length >= 1 && usos.every(s => /^\.narr$/.test(s)), `--f-narr só pode estar em .narr: ${usos.join(" | ")}`);
  const html = ler("index.html");
  assert.doesNotMatch(html, /zodiak/i, "sem preload da Zodiak no HTML (só baixa quando aparece um .narr)");
  assert.doesNotMatch(ler("login.js"), /\bnarr\b/, "a tela de login não usa .narr");
});
await teste("classes do contrato: .rotulo (Satoshi 600 13 px), .dado (Plex), .selo-caps, .narr, .num-moeda, .entra, .destaque", () => {
  const regra = sel => { const m = CSS_APP.match(new RegExp(`(?:^|\\n)${sel.replace(/[.\\]/g, "\\$&")} \\{([^}]*)\\}`)); assert.ok(m, `regra ${sel}`); return m[1]; };
  const r = regra(".rotulo");
  assert.match(r, /font-family: var\(--f-corpo\)/); assert.match(r, /font-weight: 600/); assert.match(r, /font-size: var\(--fs-peq\)/);
  assert.doesNotMatch(r, /uppercase|letter-spacing/, ".rotulo: minúscula e sem tracking");
  assert.match(regra(".dado"), /font-family: var\(--f-mono\)/);
  assert.match(regra(".selo-caps"), /text-transform: uppercase/);
  assert.match(regra(".narr"), /font-family: var\(--f-narr\)/);
  assert.match(CSS_APP, /\.num-moeda small, \.num-moeda \.nm-rs, \.num-moeda \.nm-cent \{ font-size: max\(\.6em, var\(--fs-12\)\);/, "R$ e centavos a 60 % (nunca abaixo do piso de 12 px)");
  assert.match(regra(".entra"), /animation: entra 160ms/);
  assert.match(regra(".destaque"), /animation: destaqueFlash 600ms/);
  assert.match(CSS_APP, /@keyframes destaqueFlash \{ from \{ background-color: var\(--c-prim-suave\); \}/);
});
await teste("bloco da frente A em app.css: sem hex, sem tamanho de letra em px/rem fora de tokens, caixa-alta só em .selo-caps, grades com minmax", () => {
  assert.ok(BLOCO_A.length > 2000, "bloco encontrado");
  assert.doesNotMatch(BLOCO_A.replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-fA-F]{3,8}\b/, "hex no bloco");
  for (const m of BLOCO_A.matchAll(/font-size:\s*([^;}]+)/g)) {
    assert.doesNotMatch(m[1], /^[\d.]+(px|rem)\b/, `font-size literal: ${m[0]}`);
  }
  const caixaAlta = [...BLOCO_A.matchAll(/([^{}]+)\{[^}]*text-transform:\s*uppercase[^}]*\}/g)].map(m => m[1].trim().split("\n").pop().trim());
  assert.deepEqual(caixaAlta, [".selo-caps"], "caixa-alta só em .selo-caps");
  assert.doesNotMatch(semMinmax(BLOCO_A.replace(/\/\*[\s\S]*?\*\//g, "")), /[\s(:,]\d*\.?\d+fr\b/, "1fr solto");
});
await teste("M01/M10 (parte do contrato): .cartao sem backdrop-filter; esqueleto com faixa clara e pulso de opacidade com movimento reduzido", () => {
  const cartoes = [...CSS_APP.matchAll(/(^|\n)\.cartao \{([^}]*)\}/g)].map(m => m[2]);
  assert.ok(cartoes.length >= 1);
  for (const c of cartoes) assert.doesNotMatch(c, /backdrop-filter/, ".cartao é opaco: sem backdrop-filter");
  assert.match(CSS_APP, /\.sk::after \{[^}]*linear-gradient\(100deg, transparent 20%, var\(--c-sk-luz\) 50%, transparent 80%\)[^}]*animation: skVarre 1\.4s linear infinite/);
  assert.match(CSS_APP, /@media \(prefers-reduced-motion: reduce\) \{\s*\.sk::after \{ animation: none !important; display: none; \}\s*\.sk \{ animation: skPulso 1\.4s ease-in-out infinite alternate !important; \}/);
});
/** Bloco do :root (até o comentário de tipografia) como mapa { token: valor }. */
function tokensRaiz() {
  const raiz = CSS_APP.slice(CSS_APP.indexOf(":root {"), CSS_APP.indexOf("/* ---- tipografia ---- */"));
  return Object.fromEntries([...raiz.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}
await teste("app.css :root = o tema padrão claro (todo token em hex que o tema.js escreve tem o MESMO valor no :root: sem defasagem antes da 1ª pintura)", () => {
  const { vars } = T.derivarTema(T.coresNoEsquema(T.PADRAO.cores, "claro"));
  const raiz = tokensRaiz();
  let conferidos = 0;
  for (const [k, v] of Object.entries(vars)) {
    if (!/^#[0-9A-F]{6}$/.test(v)) continue;
    assert.ok(k in raiz, `falta ${k} no :root`);
    assert.equal(raiz[k].toUpperCase(), v, `${k}: :root ${raiz[k]} × tema ${v}`);
    conferidos++;
  }
  assert.ok(conferidos > 40, `tokens conferidos: ${conferidos}`);
});
await teste("[data-produto] escolhe --c-prod entre os três acentos; o tema.js não escreve --c-prod (inline venceria a regra do CSS)", () => {
  assert.match(CSS_APP, /html\[data-produto="crm"\] \{ --c-prod: var\(--c-prod-crm\); \}/);
  assert.match(CSS_APP, /html\[data-produto="ads"\] \{ --c-prod: var\(--c-prod-ads\); \}/);
  assert.match(CSS_APP, /html\[data-produto="atendimento"\] \{ --c-prod: var\(--c-prod-atend\); \}/);
  const { vars } = T.derivarTema(T.PADRAO.cores);
  assert.ok(!("--c-prod" in vars));
  for (const k of ["--c-prod-crm", "--c-prod-ads", "--c-prod-atend"]) assert.ok(k in vars, k);
});

/* ---------- tema.js: superfícies por esquema, gravidade e acento do produto ---------- */
const CLARO_4 = { padrao: T.coresNoEsquema(T.PADRAO.cores, "claro"), vermelha: { primaria: "#C62828", secundaria: "#E57373", fundo: "#F3F0E9" },
  verde: { primaria: "#1E8E3E", secundaria: "#81C995", fundo: "#F3F0E9" }, azul: { primaria: "#1A56DB", secundaria: "#7AA7F7", fundo: "#F3F0E9" } };
const ESCURO_4 = { padrao: T.coresNoEsquema(T.PADRAO.cores, "escuro"), vermelha: T.coresNoEsquema({ primaria: "#C62828", secundaria: "#E57373", fundo: "#0B1416" }, "escuro"),
  verde: { primaria: "#1E8E3E", secundaria: "#81C995", fundo: "#0E1116" }, azul: { primaria: "#1A56DB", secundaria: "#7AA7F7", fundo: "#0A0F1A" } };
await teste("tema claro (M01): o cartão é mais claro que a página, o poço é mais escuro, --c-sup-3 é o mais escuro (pressionado); 4 marcas", () => {
  for (const [nome, m] of Object.entries(CLARO_4)) {
    const { vars, escuro } = T.derivarTema(m);
    assert.equal(escuro, false, nome);
    assert.ok(luz(T, vars["--c-sup"]) > luz(T, vars["--c-fundo"]), `${nome}: cartão ${vars["--c-sup"]} deve ser mais claro que a página ${vars["--c-fundo"]}`);
    assert.ok(luz(T, vars["--c-poco"]) < luz(T, vars["--c-fundo"]), `${nome}: poço mais escuro que a página`);
    assert.ok(luz(T, vars["--c-sup-3"]) < luz(T, vars["--c-poco"]), `${nome}: pressionado é o mais escuro`);
  }
});
await teste("derivarTema: texto, texto-2 e texto-3 chegam a 4,5:1 sobre --c-sup e --c-poco nas 4 marcas × claro e escuro (e em 34 marcas)", () => {
  const todas = [...Object.values(CLARO_4), ...Object.values(ESCURO_4), ...marcas];
  for (const m of todas) {
    const { vars } = T.derivarTema(m);
    for (const sup of ["--c-sup", "--c-poco"]) for (const t of ["--c-texto", "--c-texto-2", "--c-texto-3"]) {
      assert.ok(T.contraste(vars[t], vars[sup]) >= 4.5 - 1e-9, `${t} ${vars[t]} sobre ${sup} ${vars[sup]} = ${T.contraste(vars[t], vars[sup]).toFixed(2)} (${JSON.stringify(m)})`);
    }
  }
});
await teste("derivarTema: --c-sev-* (gravidade) e --c-prod-* (acento do produto) ≥ 4,5:1 sobre fundo, cartão, poço e pressionado, nas 4 marcas e nos dois esquemas", () => {
  for (const m of [...Object.values(CLARO_4), ...Object.values(ESCURO_4), ...marcas]) {
    const { vars } = T.derivarTema(m);
    for (const k of ["--c-sev-info", "--c-sev-aten", "--c-sev-crit", "--c-prod-crm", "--c-prod-ads", "--c-prod-atend"]) {
      assert.match(vars[k], /^#[0-9A-F]{6}$/, k);
      for (const s of ["--c-fundo", "--c-sup", "--c-poco", "--c-sup-3"]) {
        assert.ok(T.contraste(vars[k], vars[s]) >= 4.5 - 1e-9, `${k} ${vars[k]} sobre ${s} ${vars[s]} = ${T.contraste(vars[k], vars[s]).toFixed(2)} (${JSON.stringify(m)})`);
      }
    }
  }
});
await teste("tema escuro (M01/M04): tudo que não é cor de estado sai IGUAL ao de antes (hash do conjunto, 4 marcas escuras); marca sem conflito de matiz mantém as cores de estado de sempre", () => {
  // Golden gerado com o derivarTema anterior ao contrato. Fora do conjunto ficam só as cores de estado (ok, ruim, aten, info, meta, google, nota, sev-*, prod-*)
  // e o poço: o M04 gira essas cores quando a marca cai a menos de 30° delas e dá tom próprio a Meta e Google. O resto do escuro não pode mudar.
  const ESTADO = k => /^--c-(ok|ruim|aten|info|meta|google|nota|sev-|prod-|poco)/.test(k);
  const ouro = { padrao: "ffrom8", vermelha: "kyq0od", azul: "y8mwxh", verde: "m6elem" };
  for (const [nome, m] of Object.entries(ESCURO_4)) {
    const { vars, escuro } = T.derivarTema(m);
    assert.equal(escuro, true, nome);
    const resto = Object.fromEntries(Object.entries(vars).filter(([k]) => !ESTADO(k)));
    assert.equal(T.hashCurto(resto), ouro[nome], `${nome}: o escuro mudou`);
  }
  const roxa = T.derivarTema({ primaria: "#7B3FA2", secundaria: "#9E9E9E", fundo: "#0E1116" });
  assert.equal(roxa.avisos.filter(a => a.campo === "estados").length, 0, "sem conflito: sem aviso");
  const v = roxa.vars;
  assert.deepEqual(["ok", "ruim", "aten", "info"].map(k => v[`--c-${k}`]), ["#7FD1A5", "#F08A74", "#E5B35C", "#8FB8DD"]);
  assert.deepEqual(["ok", "ruim", "aten", "info"].map(k => v[`--c-${k}-suave`]), ["#20302D", "#322425", "#302B21", "#232C36"]);
});
await teste("tema escuro: o poço fica abaixo do fundo e o cartão acima (escada que clareia)", () => {
  for (const m of Object.values(ESCURO_4)) {
    const { vars } = T.derivarTema(m);
    assert.ok(luz(T, vars["--c-poco"]) < luz(T, vars["--c-fundo"]));
    assert.ok(luz(T, vars["--c-sup"]) > luz(T, vars["--c-fundo"]));
  }
});
await teste("M01: papel quente no claro (#F3F0E9); cartão com borda e sombra de duas camadas; campos no poço; popover no degrau do cartão; o escuro mantém a sombra de antes", () => {
  assert.equal(T.FUNDOS_ESQUEMA.claro, "#F3F0E9"); assert.equal(T.PADRAO.cores.fundo, "#F3F0E9");
  assert.equal(T.derivarTema(T.coresNoEsquema({}, "claro")).vars["--c-fundo"], "#F3F0E9");
  for (const [nome, m] of Object.entries(CLARO_4)) {
    const { vars } = T.derivarTema(m);
    assert.ok(T.contraste(vars["--c-sup"], vars["--c-fundo"]) >= 1.05, `${nome}: o cartão se separa do papel (${T.contraste(vars["--c-sup"], vars["--c-fundo"]).toFixed(3)}:1)`);
    assert.ok(luz(T, vars["--c-sup-2"]) > luz(T, vars["--c-poco"]) && luz(T, vars["--c-sup-2"]) < luz(T, vars["--c-sup"]), `${nome}: sup-2 entre o poço e o cartão (bloco dentro do cartão não vira cinza pesado)`);
  }
  const cartao = (CSS_APP.match(/(?:^|\n)\.cartao \{([^}]*)\}/) || [])[1] || "";
  assert.match(cartao, /border: 1px solid var\(--c-borda\)/);
  assert.match(cartao, /box-shadow: 0 1px 2px color-mix\(in srgb, var\(--c-sombra\) 42%, transparent\), 0 14px 28px -22px var\(--c-sombra\);/, "duas camadas: contato curto + queda longa");
  assert.match(CSS_APP, /html\[data-esquema="escuro"\] \.cartao \{ box-shadow: 0 24px 48px -36px var\(--c-sombra\), inset 0 1px 0 var\(--c-luz-borda\); \}/, "o escuro continua com a sombra de antes");
  assert.match(CSS_APP, /\.campo textarea, \.sel, \.busca input, \.cor-hex \{\s*width: 100%;[^}]*background: var\(--c-poco\)/, "campos no poço");
  assert.match(CSS_APP, /--c-pop: var\(--c-sup\); --c-hover: var\(--c-sup-2\);/); assert.match(CSS_APP, /html\[data-esquema="escuro"\] \{[^}]*--c-pop: var\(--c-sup-2\); --c-hover: var\(--c-sup-3\);/);
  for (const sel of [".menu-pop, .flut", ".toast"]) assert.match(CSS_APP, new RegExp(`${sel.replace(/[.]/g, "\\.")} \\{[^}]*background: var\\(--c-pop\\)`), `${sel} flutua em --c-pop`);
  // antes.js (cache do tema) e shells de outras frentes só entendem tokens; nenhum hex novo fora do :root
  assert.doesNotMatch(semRaiz(CSS_APP), /#[0-9a-fA-F]{3,8}\b/);
});


/* ---------- DOM de mentira (sem dependências): o bastante para h(), eventos, seletores simples, foco e diálogo ---------- */
function criarDom() {
  const kebab = s => s.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
  class Evento {
    constructor(type, init = {}) { this.type = type; this.bubbles = true; this.cancelable = true; this.isTrusted = true; this.defaultPrevented = false; Object.assign(this, init); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._parado = true; }
  }
  class No {
    constructor() { this.parentNode = null; this.childNodes = []; this._ouv = []; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc; }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get firstElementChild() { return this.children[0] || null; }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get nextSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; }
    appendChild(n) { return this.insertBefore(n, null); }
    insertBefore(n, ref) {
      if (n.parentNode) n.parentNode.removeChild(n);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
      n.parentNode = this; return n;
    }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; } return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    append(...ns) { for (const n of ns) this.appendChild(typeof n === "object" && n && n.nodeType ? n : new Texto(n)); }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    addEventListener(tipo, fn, opc) { this._ouv.push({ tipo, fn, captura: opc === true || !!(opc && opc.capture) }); }
    removeEventListener(tipo, fn, opc) { const c = opc === true || !!(opc && opc.capture); this._ouv = this._ouv.filter(o => !(o.tipo === tipo && o.fn === fn && o.captura === c)); }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      const caminho = []; for (let n = this; n; n = n.parentNode) caminho.push(n);
      const roda = (n, fase) => { ev.currentTarget = n; for (const o of [...n._ouv]) if (o.tipo === ev.type && (fase === "alvo" || (fase === "captura") === o.captura)) { o.fn(ev); } };
      for (let i = caminho.length - 1; i > 0 && !ev._parado; i--) roda(caminho[i], "captura");
      if (!ev._parado) roda(this, "alvo");
      if (ev.bubbles) for (let i = 1; i < caminho.length && !ev._parado; i++) roda(caminho[i], "bolha");
      return !ev.defaultPrevented;
    }
  }
  class Texto extends No {
    constructor(t) { super(); this.nodeType = 3; this.data = String(t); }
    get textContent() { return this.data; } set textContent(v) { this.data = String(v); }
  }
  /* seletores: tag, #id, .classe, [attr], [attr=v], [attr^=v], :not(...), :disabled, lista com vírgula, descendente e filho (>) */
  function splitVirgula(s) {
    const out = []; let nivel = 0, cur = "";
    for (const c of s) { if (c === "[" || c === "(") nivel++; if (c === "]" || c === ")") nivel--; if (nivel === 0 && c === ",") { out.push(cur.trim()); cur = ""; } else cur += c; }
    if (cur.trim()) out.push(cur.trim()); return out;
  }
  function parseComplexo(s) {
    const partes = []; let nivel = 0, cur = "", comb = null;
    const fecha = () => { if (cur) { if (partes.length) partes.push(comb || " "); partes.push(cur); cur = ""; comb = null; } };
    for (const c of s) {
      if (c === "[" || c === "(") nivel++; if (c === "]" || c === ")") nivel--;
      if (nivel === 0 && (c === " " || c === ">")) { fecha(); if (c === ">") comb = ">"; else if (!comb) comb = " "; } else cur += c;
    }
    fecha(); return partes;
  }
  function casaComposto(el, s) {
    let i = 0; const m0 = /^([a-zA-Z][\w-]*|\*)/.exec(s);
    if (m0) { if (m0[1] !== "*" && el.localName.toLowerCase() !== m0[1].toLowerCase()) return false; i = m0[0].length; }
    while (i < s.length) {
      const resto = s.slice(i); let mm;
      if (resto[0] === "#") { mm = /^#([\w-]+)/.exec(resto); if (el.attrs.get("id") !== mm[1]) return false; }
      else if (resto[0] === ".") { mm = /^\.([\w-]+)/.exec(resto); if (!el.classList.contains(mm[1])) return false; }
      else if (resto[0] === "[") {
        mm = /^\[([\w:-]+)(?:([~|^$*]?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/.exec(resto);
        if (!el.attrs.has(mm[1])) return false;
        if (mm[2]) { const v = el.attrs.get(mm[1]), a = mm[3] ?? mm[4] ?? mm[5]; if (mm[2] === "=" && v !== a) return false; if (mm[2] === "^=" && !v.startsWith(a)) return false; }
      } else if (resto[0] === ":") {
        mm = /^:([\w-]+)(?:\(((?:[^()]|\([^)]*\))*)\))?/.exec(resto);
        if (mm[1] === "not") { if (casaLista(el, mm[2])) return false; } else if (mm[1] === "disabled") { if (!el.disabled) return false; } else return false;
      } else return false;
      i += mm[0].length;
    }
    return true;
  }
  function casaComplexo(el, partes) {
    if (!casaComposto(el, partes[partes.length - 1])) return false;
    if (partes.length === 1) return true;
    const comb = partes[partes.length - 2], resto = partes.slice(0, -2);
    if (comb === ">") return !!el.parentNode && el.parentNode.nodeType === 1 && casaComplexo(el.parentNode, resto);
    for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) if (casaComplexo(p, resto)) return true;
    return false;
  }
  function casaLista(el, lista) { return splitVirgula(lista).some(sel => casaComplexo(el, parseComplexo(sel))); }
  class El extends No {
    constructor(tag, ns) {
      super(); this.nodeType = 1; this.localName = tag; this.tagName = tag.toUpperCase(); this.namespaceURI = ns || null;
      this.attrs = new Map(); this.value = ""; this.checked = false; this.disabled = false; this.hidden = false; this.open = false;
      this.offsetWidth = 0; this.offsetLeft = 0; this.selectionStart = null;
      const estilos = new Map(); const el = this;
      this.style = { setProperty: (k, v) => { if (v === "" || v == null) estilos.delete(k); else estilos.set(k, String(v)); }, getPropertyValue: k => estilos.get(k) || "", removeProperty: k => { estilos.delete(k); } };
      this.dataset = new Proxy({}, {
        get: (_, k) => (typeof k === "string" && el.attrs.has("data-" + kebab(k)) ? el.attrs.get("data-" + kebab(k)) : undefined),
        set: (_, k, v) => { el.attrs.set("data-" + kebab(k), String(v)); return true; },
        deleteProperty: (_, k) => { el.attrs.delete("data-" + kebab(k)); return true; },
      });
      const cls = () => (el.attrs.get("class") || "").split(/\s+/).filter(Boolean);
      this.classList = {
        add: (...c) => { const s = new Set(cls()); c.forEach(x => s.add(x)); el.attrs.set("class", [...s].join(" ")); },
        remove: (...c) => { const s = new Set(cls()); c.forEach(x => s.delete(x)); el.attrs.set("class", [...s].join(" ")); },
        contains: c => cls().includes(c), toggle: c => { const t = !cls().includes(c); t ? this.classList.add(c) : this.classList.remove(c); return t; },
      };
    }
    setAttribute(k, v) { this.attrs.set(k, String(v)); } getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); } removeAttribute(k) { this.attrs.delete(k); }
    get id() { return this.attrs.get("id") || ""; }
    get name() { return this.attrs.get("name") || ""; }
    get type() { return this.attrs.get("type") || (this.localName === "input" ? "text" : ""); }
    set type(v) { this.attrs.set("type", v); }
    get tabIndex() { return Number(this.attrs.get("tabindex") ?? -1); } set tabIndex(v) { this.attrs.set("tabindex", String(v)); }
    get className() { return this.attrs.get("class") || ""; }
    get textContent() { return this.childNodes.map(c => c.textContent).join(""); }
    set textContent(v) { for (const c of [...this.childNodes]) this.removeChild(c); if (v !== "" && v != null) this.appendChild(new Texto(v)); }
    matches(sel) { return casaLista(this, sel); }
    get multiple() { return this.attrs.has("multiple"); }
    querySelectorAll(sel) {
      const alvos = splitVirgula(sel).map(parseComplexo);
      const out = [];
      const andar = n => { for (const c of n.childNodes) if (c.nodeType === 1) { if (alvos.some(p => casaComplexo(c, p))) out.push(c); andar(c); } };
      andar(this); return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    focus() { doc.activeElement = this; }
    blur() { if (doc.activeElement === this) doc.activeElement = doc.body; }
    click() { this.dispatchEvent(new Evento("click")); }
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
    scrollIntoView() {}
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
    showModal() { this.open = true; } close() { this.open = false; this.dispatchEvent(new Evento("close", { bubbles: false })); }
  }
  const doc = new No();
  doc.nodeType = 9;
  doc.createElement = t => new El(t); doc.createElementNS = (ns, t) => new El(t, ns); doc.createTextNode = t => new Texto(t);
  doc.documentElement = doc.appendChild(new El("html")); doc.body = doc.documentElement.appendChild(new El("body")); doc.activeElement = doc.body;
  doc.getElementById = id => { const f = n => { for (const c of n.childNodes) if (c.nodeType === 1) { if (c.attrs.get("id") === id) return c; const r = f(c); if (r) return r; } return null; }; return f(doc.documentElement); };
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel); doc.querySelector = sel => doc.documentElement.querySelector(sel);
  return { doc, Evento, El };
}
/** Instala o DOM de mentira (e matchMedia/addEventListener globais) para UM teste; devolve utilidades e `fim()`. */
function comDom({ grosso = false, reduzido = false } = {}) {
  const { doc, Evento } = criarDom();
  const salvo = { document: globalThis.document, matchMedia: globalThis.matchMedia, addEventListener: globalThis.addEventListener, Event: globalThis.Event };
  const janela = [];
  globalThis.document = doc;
  globalThis.matchMedia = q => ({ matches: (/coarse/.test(q) && grosso) || (/reduce/.test(q) && reduzido) });
  globalThis.addEventListener = (t, f) => janela.push([t, f]);
  globalThis.Event = Evento;
  return {
    doc, Evento, janela,
    disparar: (t, ...a) => { for (const [tipo, f] of janela.slice()) if (tipo === t) f(...a); },
    ev: (el, tipo, init) => el.dispatchEvent(new Evento(tipo, init)),
    fim() { for (const [k, v] of Object.entries(salvo)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } },
  };
}
const esperar = ms => new Promise(r => setTimeout(r, ms));
const lista = el => el.querySelectorAll("*");
const achar = (el, sel) => { const x = el.querySelector(sel); assert.ok(x, `não achei ${sel}`); return x; };


/* ---------- componentes (DOM de mentira) ---------- */
await teste("contratos existem: ui.cabecalho/segmentado/toqueLongo/deslizar/esqueleto/trocarEsqueleto/erroCartao/acaoComDesfazer/modal/gaveta/campo/vazio e G.destacar; assinaturas antigas continuam", () => {
  for (const f of ["cabecalho", "segmentado", "toqueLongo", "deslizar", "esqueleto", "trocarEsqueleto", "erroCartao", "acaoComDesfazer", "modal", "gaveta", "campo", "vazio",
    "toast", "anunciar", "confirmar", "abas", "lerForm", "marcarErro", "carregando", "tabela", "pilula", "numMoeda", "validarCampo", "validarForm", "mascarar", "fraseDeErro"]) {
    assert.equal(typeof U[f], "function", `ui.${f}`);
  }
  assert.equal(typeof GRAF.destacar, "function", "G.destacar");
  assert.equal(U.esqueleto.length, 0, "esqueleto(tipo = 'lista', opcoes = {}) tem parâmetros com padrão (compatível com esqueleto('lista', 6))");
});

await teste("ui.cabecalho: nível 1 gera <h1> (tabindex -1), nível 2 gera <h2>; rótulo, subtítulo e ações opcionais", () => {
  const d = comDom();
  try {
    const a = U.cabecalho({ rotulo: "Clínica Sorriso", titulo: "Pacientes", sub: "12 ativos", acoes: [U.h("button", null, "Novo"), null, U.h("button", null, "Importar")], nivel: 1 });
    assert.equal(a.tagName, "HEADER");
    const h1 = achar(a, "h1");
    assert.equal(h1.textContent, "Pacientes"); assert.equal(h1.getAttribute("tabindex"), "-1");
    assert.equal(a.querySelectorAll("h2").length, 0);
    assert.equal(achar(a, ".cab-rotulo").textContent, "Clínica Sorriso"); assert.ok(achar(a, ".cab-rotulo").classList.contains("rotulo"));
    assert.equal(achar(a, ".cab-sub").textContent, "12 ativos");
    assert.equal(a.querySelectorAll(".cab-acoes button").length, 2, "ações nulas são ignoradas");
    const b = U.cabecalho({ titulo: "Marca e tema", nivel: 2 });
    assert.equal(b.querySelectorAll("h2").length, 1); assert.equal(b.querySelectorAll("h1").length, 0);
    assert.equal(b.querySelector(".cab-rotulo"), null); assert.equal(b.querySelector(".cab-acoes"), null); assert.ok(b.classList.contains("cab-n2"));
    assert.equal(achar(b, "h2").getAttribute("tabindex"), null);
    assert.equal(U.cabecalho({ titulo: "X" }).querySelectorAll("h1").length, 1, "nível padrão = 1");
    const so = U.cabecalho({ titulo: "Um botão", acoes: U.h("button", null, "Ok") });
    assert.equal(so.querySelectorAll(".cab-acoes button").length, 1, "uma ação solta (não lista)");
  } finally { d.fim(); }
});

await teste("ui.segmentado (M05): abas/filtro, aria-selected único, setas/Home/End/Enter/Espaço, aoMudar, contador em .dado, indicador que desliza e movimento reduzido", async () => {
  const d = comDom();
  try {
    const mudou = [];
    const s = U.segmentado({ opcoes: [{ valor: "a", rotulo: "Abertas", contador: 3 }, { valor: "b", rotulo: "Pendentes" }, { valor: "c", rotulo: "Resolvidas", contador: 0 }],
      valor: "a", tipo: "abas", aoMudar: v => mudou.push(v), rotulo: "Situação" });
    d.doc.body.appendChild(s);
    assert.equal(s.getAttribute("role"), "tablist"); assert.ok(s.classList.contains("seg-abas")); assert.equal(s.getAttribute("aria-label"), "Situação");
    const tabs = s.querySelectorAll("[role=tab]");
    assert.equal(tabs.length, 3);
    const marcadas = () => tabs.filter(t => t.getAttribute("aria-selected") === "true");
    assert.equal(marcadas().length, 1); assert.equal(marcadas()[0].dataset.valor, "a");
    assert.deepEqual(tabs.map(t => t.tabIndex), [0, -1, -1], "roving tabindex");
    assert.equal(tabs[0].querySelector(".seg-n").textContent, "3"); assert.ok(tabs[0].querySelector(".seg-n").classList.contains("dado"), "contador em .dado");
    assert.equal(tabs[1].querySelector(".seg-n").hidden, true); assert.equal(tabs[2].querySelector(".seg-n").hidden, false, "contador 0 aparece");
    assert.match(tabs[0].textContent, /Abertas 3/, "espaço entre rótulo e contador (leitor de tela)");
    // setas
    tabs[0].focus();
    d.ev(tabs[0], "keydown", { key: "ArrowRight" });
    assert.equal(s.valor, "b"); assert.deepEqual(mudou, ["b"]); assert.equal(d.doc.activeElement, tabs[1]); assert.equal(marcadas().length, 1);
    assert.deepEqual(tabs.map(t => t.tabIndex), [-1, 0, -1]);
    d.ev(tabs[1], "keydown", { key: "ArrowRight" }); assert.equal(s.valor, "c");
    d.ev(tabs[2], "keydown", { key: "ArrowRight" }); assert.equal(s.valor, "a", "dá a volta");
    d.ev(tabs[0], "keydown", { key: "ArrowLeft" }); assert.equal(s.valor, "c", "volta pelo outro lado");
    d.ev(tabs[2], "keydown", { key: "Home" }); assert.equal(s.valor, "a");
    d.ev(tabs[0], "keydown", { key: "End" }); assert.equal(s.valor, "c");
    assert.deepEqual(mudou, ["b", "c", "a", "c", "a", "c"]);
    assert.equal(marcadas().length, 1, "aria-selected único depois de tudo");
    // Enter e Espaço ativam o item com foco; repetir no ativo não chama aoMudar de novo
    tabs[1].focus();
    const e1 = new d.Evento("keydown", { key: "Enter" }); tabs[1].dispatchEvent(e1);
    assert.equal(s.valor, "b"); assert.equal(e1.defaultPrevented, true); assert.equal(mudou.at(-1), "b");
    tabs[0].focus(); d.ev(tabs[0], "keydown", { key: " " }); assert.equal(s.valor, "a");
    const n = mudou.length; d.ev(tabs[0], "keydown", { key: "Enter" }); assert.equal(mudou.length, n, "mesmo item: sem aoMudar");
    // clique
    tabs[2].click(); assert.equal(s.valor, "c"); assert.equal(mudou.at(-1), "c");
    // programático não chama aoMudar
    const antes = mudou.length; s.ativar("a"); assert.equal(s.valor, "a"); assert.equal(mudou.length, antes);
    s.contar("b", 7); assert.equal(tabs[1].querySelector(".seg-n").textContent, "7"); assert.equal(tabs[1].querySelector(".seg-n").hidden, false);
    s.contar("b", null); assert.equal(tabs[1].querySelector(".seg-n").hidden, true);
    // indicador: medidas viram variáveis; a 1ª colocação não desliza (seg-anima só no quadro seguinte)
    assert.ok(!s.classList.contains("seg-pronto"), "sem layout (largura 0) o indicador espera");
    tabs[1].offsetLeft = 40; tabs[1].offsetWidth = 90;
    s.ativar("b");
    assert.equal(s.style.getPropertyValue("--seg-x"), "40px"); assert.equal(s.style.getPropertyValue("--seg-w"), "90px");
    assert.ok(s.classList.contains("seg-pronto")); assert.ok(!s.classList.contains("seg-anima"));
    await esperar(40); assert.ok(s.classList.contains("seg-anima"), "depois do 1º quadro passa a deslizar");
    tabs[2].offsetLeft = 130; tabs[2].offsetWidth = 110; s.ativar("c");
    assert.equal(s.style.getPropertyValue("--seg-x"), "130px"); assert.equal(s.style.getPropertyValue("--seg-w"), "110px");
    // filtro e valores inválidos
    const f = U.segmentado({ opcoes: [{ valor: 1, rotulo: "Hoje" }, { valor: 2, rotulo: "7 dias" }], valor: 99, tipo: "filtro" });
    assert.ok(f.classList.contains("seg-filtro")); assert.equal(f.valor, 1, "valor desconhecido → primeiro");
    assert.equal(f.querySelectorAll("[aria-selected=true]").length, 1);
    assert.ok(U.segmentado({ opcoes: [{ valor: "x", rotulo: "X" }], tipo: "qualquer" }).classList.contains("seg-abas"), "tipo desconhecido → abas");
    assert.equal(U.segmentado({}).querySelectorAll("[role=tab]").length, 0, "sem opções não quebra");
  } finally { d.fim(); }
  const r = comDom({ reduzido: true });
  try {
    const s = U.segmentado({ opcoes: [{ valor: "a", rotulo: "A" }, { valor: "b", rotulo: "B" }], valor: "a" });
    const [t0, t1] = s.querySelectorAll("[role=tab]");
    t1.offsetLeft = 50; t1.offsetWidth = 60; s.ativar("b");
    assert.ok(s.classList.contains("seg-pronto")); await esperar(40);
    assert.ok(!s.classList.contains("seg-anima"), "com prefers-reduced-motion o indicador não anima");
    void t0;
  } finally { r.fim(); }
  // CSS: o deslize usa os tokens de tempo (que viram 0s sob movimento reduzido) e há fallback sem medida
  assert.match(CSS_APP, /\.seg-anima \.seg-ind \{ transition: transform var\(--t-ui\) var\(--e-out\), width var\(--t-ui\) var\(--e-out\); \}/);
  assert.match(CSS_APP, /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{ --t-micro: 0s; --t-ui: 0s;/);
  assert.match(CSS_APP, /\.seg-filtro \.seg-ind \{ background: var\(--c-prim-suave\);/, "filtro: --c-prim-suave, nunca cheio");
  assert.match(CSS_APP, /\.seg:not\(\.seg-pronto\) \.seg-op\[aria-selected="true"\] \{ background: var\(--c-sup\)/, "sem JS de medida a opção marcada se pinta sozinha");
});

await teste("ui.toqueLongo: dispara depois de ms; soltar cedo, mexer, mouse ou desligar não dispara; engole só o clique seguinte", async () => {
  const d = comDom();
  try {
    const el = U.h("div", null, "cartão"); d.doc.body.appendChild(el);
    let n = 0; const fim = U.toqueLongo(el, () => { n++; }, { ms: 40 });
    assert.ok(el.classList.contains("toque-longo"));
    const toque = (id, x = 10, y = 10) => d.ev(el, "pointerdown", { pointerType: "touch", pointerId: id, clientX: x, clientY: y, button: 0 });
    toque(1); await esperar(70); assert.equal(n, 1, "segurou → dispara");
    const clique = new d.Evento("click"); el.dispatchEvent(clique); assert.equal(clique.defaultPrevented, true, "engole o clique que vem depois");
    d.ev(el, "pointerup", { pointerType: "touch", pointerId: 1 });
    const c2 = new d.Evento("click"); el.dispatchEvent(c2); assert.equal(c2.defaultPrevented, false, "só o primeiro");
    toque(2); await esperar(10); d.ev(el, "pointerup", { pointerType: "touch", pointerId: 2 }); await esperar(60); assert.equal(n, 1, "soltou cedo");
    toque(3, 0, 0); d.ev(el, "pointermove", { pointerType: "touch", pointerId: 3, clientX: 2, clientY: 30 }); await esperar(70); assert.equal(n, 1, "mexeu mais de 10 px (rolagem)");
    toque(4, 0, 0); d.ev(el, "pointermove", { pointerType: "touch", pointerId: 4, clientX: 3, clientY: 4 }); await esperar(70); assert.equal(n, 2, "tremor pequeno não cancela");
    d.ev(el, "pointerdown", { pointerType: "mouse", pointerId: 5, clientX: 0, clientY: 0, button: 0 }); await esperar(70); assert.equal(n, 2, "mouse não");
    const menu = new d.Evento("contextmenu"); toque(6); el.dispatchEvent(menu); assert.equal(menu.defaultPrevented, true, "menu de contexto do toque longo é suprimido"); d.ev(el, "pointerup", { pointerType: "touch", pointerId: 6 });
    fim(); assert.ok(!el.classList.contains("toque-longo")); toque(7); await esperar(70); assert.equal(n, 2, "desligado");
    let m = 0; const el2 = U.h("div"); U.toqueLongo(el2, () => { m++; }, { ms: 30, mouse: true });
    d.ev(el2, "pointerdown", { pointerType: "mouse", pointerId: 1, clientX: 0, clientY: 0, button: 0 }); await esperar(60); assert.equal(m, 1, "mouse:true");
  } finally { d.fim(); }
});

await teste("ui.deslizar: arrasto horizontal além do limiar aciona o lado certo; rolagem vertical, gesto curto, lado sem ação e mouse não acionam; o clique pós-gesto é engolido", async () => {
  const d = comDom();
  try {
    const el = U.h("div", null, "linha"); d.doc.body.appendChild(el);
    const log = []; const fim = U.deslizar(el, { esquerda: () => log.push("E"), direita: { fn: () => log.push("D"), rotulo: "Arquivar" }, limiar: 60 });
    assert.ok(el.classList.contains("deslizavel"));
    const gesto = (tipo, passos, id = 1) => {
      d.ev(el, "pointerdown", { pointerType: tipo, pointerId: id, clientX: 200, clientY: 100, button: 0 });
      for (const [x, y] of passos) d.ev(el, "pointermove", { pointerType: tipo, pointerId: id, clientX: x, clientY: y });
      const [ux, uy] = passos.length ? passos[passos.length - 1] : [200, 100];
      d.ev(el, "pointerup", { pointerType: tipo, pointerId: id, clientX: ux, clientY: uy });
    };
    gesto("touch", [[170, 102], [120, 104], [100, 104]]);
    assert.deepEqual(log, ["E"], "−100 px ≥ 60 → esquerda");
    assert.equal(el.style.getPropertyValue("transform"), "", "volta ao lugar ao soltar");
    gesto("touch", [[230, 101], [290, 101]]); assert.deepEqual(log, ["E", "D"], "+90 px → direita ({fn, rotulo})");
    gesto("touch", [[190, 100], [170, 100]]); assert.equal(log.length, 2, "−30 px < limiar");
    gesto("touch", [[198, 130], [190, 200], [120, 210]]); assert.equal(log.length, 2, "começou vertical: é rolagem, não gesto");
    gesto("touch", [[205, 112], [140, 112]]); assert.equal(log.length, 2, "diagonal (mais vertical que 1:1,5) não trava");
    gesto("mouse", [[100, 100]]); assert.equal(log.length, 2, "mouse não desliza");
    // durante o arrasto o elemento acompanha, com resistência além do limiar
    d.ev(el, "pointerdown", { pointerType: "touch", pointerId: 9, clientX: 200, clientY: 100, button: 0 });
    d.ev(el, "pointermove", { pointerType: "touch", pointerId: 9, clientX: 140, clientY: 100 });
    assert.equal(el.style.getPropertyValue("transform"), "translateX(-60px)"); assert.equal(el.dataset.deslizando, "esquerda");
    d.ev(el, "pointermove", { pointerType: "touch", pointerId: 9, clientX: 40, clientY: 100 });
    assert.equal(el.style.getPropertyValue("transform"), "translateX(-90px)", "60 + (160−60)·0,3");
    d.ev(el, "pointerup", { pointerType: "touch", pointerId: 9, clientX: 40, clientY: 100 });
    assert.equal(log.at(-1), "E");
    const c1 = new d.Evento("click"); el.dispatchEvent(c1); assert.equal(c1.defaultPrevented, true, "engole o clique depois do arrasto");
    const c2 = new d.Evento("click"); el.dispatchEvent(c2); assert.equal(c2.defaultPrevented, false);
    // pointercancel (o navegador assumiu a rolagem) não aciona
    d.ev(el, "pointerdown", { pointerType: "touch", pointerId: 10, clientX: 200, clientY: 100, button: 0 });
    d.ev(el, "pointermove", { pointerType: "touch", pointerId: 10, clientX: 100, clientY: 100 }); d.ev(el, "pointercancel", { pointerType: "touch", pointerId: 10 });
    assert.equal(log.filter(x => x === "E").length, 2, "cancelado não aciona");
    // lado sem ação não se move
    const solo = U.h("div"); const l2 = []; U.deslizar(solo, { esquerda: () => l2.push("E") });
    d.ev(solo, "pointerdown", { pointerType: "touch", pointerId: 1, clientX: 100, clientY: 0, button: 0 });
    d.ev(solo, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 180, clientY: 0 });
    assert.equal(solo.style.getPropertyValue("transform"), "", "direita não tem ação: fica parado"); d.ev(solo, "pointerup", { pointerType: "touch", pointerId: 1, clientX: 180, clientY: 0 });
    assert.deepEqual(l2, []);
    fim(); assert.ok(!el.classList.contains("deslizavel"));
    const antes = log.length; gesto("touch", [[100, 100]]); assert.equal(log.length, antes, "desligado");
  } finally { d.fim(); }
  assert.match(CSS_APP, /\.deslizavel \{ touch-action: pan-y;/, "a rolagem vertical continua com o navegador");
});

await teste("ui.esqueleto: os 7 tipos têm a forma da tela (+ 'cartoes' legado); número como 2º argumento e cabeçalho opcional", () => {
  const d = comDom();
  try {
    for (const tipo of ["inicio", "chat", "lista", "kanban", "ads", "tabela", "agenda", "cartoes"]) {
      const e = U.esqueleto(tipo);
      assert.ok(e.classList.contains("esqueleto") && e.classList.contains(`esqueleto-${tipo}`), tipo);
      assert.equal(e.getAttribute("aria-busy"), "true"); assert.equal(e.dataset.tipo, tipo);
      assert.ok(e.querySelectorAll(".sk").length >= 3, `${tipo}: blocos`);
      assert.ok(e.querySelector(".sr-only"), `${tipo}: texto "Carregando…" para leitor de tela`);
    }
    const ini = U.esqueleto("inicio"); assert.ok(ini.querySelector(".sk-cab") && ini.querySelector(".sk-kpis")); assert.equal(ini.querySelectorAll(".sk-kpis .sk-cartao").length, 4);
    const chat = U.esqueleto("chat");
    assert.ok(chat.querySelector(".sk-cab"), "título"); assert.equal(chat.querySelectorAll(".sk-chip").length, 3, "abas"); assert.ok(chat.querySelector(".sk-chat-lista") && chat.querySelector(".sk-chat-painel"));
    const ads = U.esqueleto("ads"); assert.ok(ads.querySelector(".sk-manchete"), "manchete"); assert.equal(ads.querySelectorAll(".sk-kpis .sk-cartao").length, 8, "8 KPIs");
    assert.equal(U.esqueleto("agenda").querySelectorAll(".sk-agenda-col").length, 7);
    assert.equal(U.esqueleto("lista", 3).querySelectorAll(".sk-item").length, 3);
    assert.equal(U.esqueleto("tabela", 4).querySelectorAll(".sk-tr").length, 5, "cabeçalho + 4 linhas");
    assert.equal(U.esqueleto("kanban", 4).querySelectorAll(".sk-col").length, 4);
    assert.equal(U.esqueleto("cartoes", 2).querySelectorAll(".sk-cartao").length, 2);
    assert.equal(U.esqueleto("lista").querySelector(".sk-cab"), null, "miolo sem cabeçalho (como antes)");
    assert.ok(U.esqueleto("lista", { n: 2, cabecalho: true }).querySelector(".sk-cab"));
    assert.equal(U.esqueleto("inicio", { cabecalho: false }).querySelector(".sk-cab"), null);
    assert.ok(U.esqueleto("tipo-inexistente").querySelector(".sk-item"), "tipo desconhecido cai na lista");
  } finally { d.fim(); }
});

await teste("ui.trocarEsqueleto: o esqueleto some em 120 ms e o conteúdo entra com fade; sem esqueleto só põe o conteúdo; movimento reduzido troca na hora", async () => {
  const d = comDom();
  try {
    const alvo = U.h("div"); d.doc.body.appendChild(alvo);
    alvo.appendChild(U.esqueleto("lista", 2));
    const novo = U.h("p", null, "pronto");
    const t0 = Date.now(); const p = U.trocarEsqueleto(alvo, novo);
    assert.ok(achar(alvo, ".esqueleto").classList.contains("saindo"), "o fade-out começa");
    assert.equal(alvo.querySelector("p"), null, "o conteúdo ainda não entrou");
    await p; assert.ok(Date.now() - t0 >= 100, "esperou ~120 ms");
    assert.equal(alvo.querySelector(".esqueleto"), null); assert.equal(achar(alvo, "p").textContent, "pronto"); assert.ok(novo.classList.contains("troca-entra"));
    await U.trocarEsqueleto(alvo, [U.h("span", null, "a"), U.h("span", null, "b")]);
    assert.equal(alvo.children.length, 2, "sem esqueleto: substitui o conteúdo");
    const sk2 = U.esqueleto("lista", 1); alvo.appendChild(sk2);
    await U.trocarEsqueleto(sk2, U.h("em", null, "x"));
    assert.equal(alvo.querySelector(".esqueleto"), null); assert.equal(achar(alvo, "em").textContent, "x"); assert.equal(alvo.children.length, 3, "o próprio esqueleto é trocado no lugar");
    assert.equal(await U.trocarEsqueleto(null, U.h("i")), false);
  } finally { d.fim(); }
  const r = comDom({ reduzido: true });
  try {
    const alvo = U.h("div"); alvo.appendChild(U.esqueleto("lista", 1));
    const p = U.trocarEsqueleto(alvo, U.h("b", null, "ok"));
    assert.equal(alvo.querySelector(".esqueleto"), null, "reduzido: já trocou, sem espera"); await p;
  } finally { r.fim(); }
  assert.match(CSS_APP, /\.esqueleto\.saindo \{ opacity: 0; transition: opacity 120ms linear; \}/);
});

await teste("ui.fraseDeErro/mensagemErro (M06): erro de transporte e de import() viram frase em português, sem URL nem jargão; frase de produto passa intacta", () => {
  for (const msg of ["Failed to fetch dynamically imported module: http://localhost:8099/app/agenda.js?v=1", "error loading dynamically imported module", "Importing a module script failed.",
    "TypeError: Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."]) {
    const t = U.mensagemErro(new TypeError(msg));
    assert.doesNotMatch(t, /https?:|import|module|fetch|\.js/i, `${msg} → ${t}`);
    assert.match(t, /internet|conexão/i, t);
  }
  assert.equal(U.mensagemErro({ codigo: "sem_acesso" }), "sem_acesso", "código sem tradutor passa (o shell liga api.mensagemErro)");
  assert.equal(U.fraseDeErro("Seu plano permite até 3 usuários."), "Seu plano permite até 3 usuários.");
  assert.doesNotMatch(U.mensagemErro(new Error("falhou em https://x.supabase.co/rest/v1/rpc/nx_x")), /https?:/, "erro cru com endereço");
  assert.equal(U.fraseDeErro("Link: https://exemplo.com/ajuda"), "Link: https://exemplo.com/ajuda", "frase de produto com link não é tocada");
});

await teste("ui.erroCartao: frase sem URL/import; refaz sozinho em orbita:online (uma vez, só se ainda está na tela); sem retentar não registra nada", async () => {
  const d = comDom();
  try {
    const e1 = new TypeError("Failed to fetch dynamically imported module: https://orbita.exemplo.app/app/agenda.js?v=20261001");
    let tentou = 0;
    const cartao = U.erroCartao(e1, () => { tentou++; });
    d.doc.body.appendChild(cartao);
    const texto = cartao.textContent;
    assert.doesNotMatch(texto, /https?:|import|module|\.js/i, texto);
    assert.match(texto, /Não foi possível abrir esta tela agora/); assert.match(texto, /tentamos de novo sozinhos/i);
    assert.equal(cartao.getAttribute("role"), "alert");
    const botao = achar(cartao, "button"); assert.equal(botao.textContent, "Tentar de novo");
    botao.click(); assert.equal(tentou, 1, "o botão chama");
    assert.ok(d.janela.some(([t]) => t === "orbita:online"), "ouve orbita:online");
    d.disparar("orbita:online"); assert.equal(tentou, 2, "reexecuta sozinho");
    d.disparar("orbita:online"); assert.equal(tentou, 2, "uma vez por cartão");
    let t2 = 0; const c2 = U.erroCartao(new TypeError("Failed to fetch"), () => { t2++; });   // não foi para a tela
    d.disparar("orbita:online"); assert.equal(t2, 0, "cartão que não está na tela não reexecuta");
    assert.match(c2.textContent, /Sem conexão com o servidor/);
    const c3 = U.erroCartao({ codigo: "sem_acesso" }); assert.equal(c3.querySelector("button"), null); assert.equal(c3.querySelector(".vazio-auto"), null);
    const c4 = U.erroCartao({ codigo: "sem_conexao" }, () => {}); assert.ok(c4.querySelector(".vazio-auto"), "código de rede do api.js também avisa");
    assert.doesNotMatch(U.erroCartao({ codigo: "tempo_esgotado" }, () => {}).textContent, /https?:/);
  } finally { d.fim(); }
});

await teste("ui.toast: todo toast é anunciado (polido; erro urgente) e aoFechar recebe o motivo", async () => {
  const d = comDom();
  try {
    U.toast("Salvo.", { tipo: "ok" }); await esperar(50);
    assert.equal(d.doc.getElementById("anuncio").textContent, "Salvo."); assert.equal(d.doc.getElementById("anuncio").getAttribute("aria-live"), "polite");
    U.toast("Falhou.", { tipo: "erro" }); await esperar(50);
    assert.equal(d.doc.getElementById("anuncio-urgente").textContent, "Falhou."); assert.equal(d.doc.getElementById("anuncio-urgente").getAttribute("aria-live"), "assertive");
    assert.equal(d.doc.getElementById("toasts").getAttribute("aria-live"), null, "a caixa não fala por conta própria (uma só voz: anunciar)");
    const motivos = [];
    const t = U.toast("x", { desfazer: () => motivos.push("desfez"), aoFechar: m => motivos.push(m), ms: 5000 });
    achar(t.el, ".toast-acao").click(); assert.deepEqual(motivos, ["desfazer", "desfez"]);
    U.toast("y", { ms: 25, aoFechar: m => motivos.push(m) }); await esperar(60); assert.equal(motivos.at(-1), "tempo");
    const t3 = U.toast("z", { ms: 5000, aoFechar: m => motivos.push(m) }); achar(t3.el, ".toast-x").click(); assert.equal(motivos.at(-1), "fechado");
    assert.equal(typeof t3.fechar, "function", "assinatura antiga: { fechar }");
  } finally { d.fim(); }
});

await teste("ui.acaoComDesfazer (M07): aplica na hora, Desfazer reverte, Ctrl/⌘+Z desfaz o mais recente (não dentro de campo), fila de 3, falhas honestas", async () => {
  const d = comDom();
  const vivos = () => d.doc.querySelectorAll(".toast").filter(t => !t.classList.contains("saindo"));
  try {
    const estado = [];
    const mk = (nome, extra = {}) => U.acaoComDesfazer({ texto: `Feito ${nome}`, aplicar: () => { estado.push(`+${nome}`); }, reverter: () => { estado.push(`-${nome}`); }, ms: 5000, ...extra });
    const p1 = mk("a"); await esperar(5);
    assert.deepEqual(estado, ["+a"], "aplicou na hora (UI otimista)");
    assert.match(vivos()[0].textContent, /Feito a/); assert.equal(achar(vivos()[0], ".toast-acao").textContent, "Desfazer");
    achar(vivos()[0], ".toast-acao").click();
    const r1 = await p1; assert.deepEqual(estado, ["+a", "-a"]); assert.equal(r1.estado, "desfeita"); assert.equal(r1.desfeita, true);
    // Ctrl+Z fora de campo desfaz o mais recente
    estado.length = 0;
    const pa = mk("a"), pb = mk("b"); await esperar(5);
    assert.equal(vivos().length, 2);
    const z = new d.Evento("keydown", { key: "z", ctrlKey: true }); d.doc.body.dispatchEvent(z);
    assert.equal(z.defaultPrevented, true);
    const rb = await pb; assert.equal(rb.estado, "desfeita"); assert.deepEqual(estado, ["+a", "+b", "-b"], "desfez só o mais recente");
    assert.equal(vivos().length, 1, "o toast da desfeita fechou");
    // dentro de textarea o Ctrl+Z é do navegador
    const ta = U.h("textarea"); d.doc.body.appendChild(ta);
    const z2 = new d.Evento("keydown", { key: "z", metaKey: true }); ta.dispatchEvent(z2);
    assert.equal(z2.defaultPrevented, false); assert.deepEqual(estado, ["+a", "+b", "-b"], "nada desfeito dentro de campo");
    // Shift+Ctrl+Z (refazer) não conta; ⌘+Z (maiúsculo ou não) conta
    const zs = new d.Evento("keydown", { key: "z", ctrlKey: true, shiftKey: true }); d.doc.body.dispatchEvent(zs); assert.equal(zs.defaultPrevented, false);
    const z3 = new d.Evento("keydown", { key: "Z", metaKey: true }); d.doc.body.dispatchEvent(z3);
    const ra = await pa; assert.equal(ra.estado, "desfeita"); assert.deepEqual(estado, ["+a", "+b", "-b", "-a"]);
    // fila de 3: a 4ª firma a mais antiga
    estado.length = 0;
    const ps = ["a", "b", "c", "d"].map(n => mk(n)); await esperar(10);
    const r0 = await Promise.race([ps[0], esperar(80).then(() => "pendente")]);
    assert.equal(r0.estado, "mantida", "o 4º pedido firma o mais antigo"); assert.equal(vivos().length, 3);
    for (let i = 0; i < 3; i++) d.doc.body.dispatchEvent(new d.Evento("keydown", { key: "z", ctrlKey: true }));
    const rr = await Promise.all(ps.slice(1)); assert.deepEqual(rr.map(x => x.estado), ["desfeita", "desfeita", "desfeita"]);
    assert.deepEqual(estado.filter(x => x.startsWith("-")), ["-d", "-c", "-b"], "do mais recente para o mais antigo");
    // o toast fecha sozinho → mantida
    const rt = await mk("t", { ms: 30 }); assert.equal(rt.estado, "mantida"); assert.equal(rt.desfeita, false);
    // reverter que falha: o estado real é o aplicado, e a pessoa é avisada
    const pf = U.acaoComDesfazer({ texto: "Movido", aplicar() {}, reverter() { throw new Error("rede_caiu"); }, ms: 5000 }); await esperar(5);
    achar(vivos()[0], ".toast-acao").click(); const rf = await pf;
    assert.equal(rf.estado, "falhou"); assert.equal(rf.desfeita, false); assert.ok(rf.erro);
    assert.ok(d.doc.querySelectorAll(".toast-erro").some(t => /Não foi possível desfazer/.test(t.textContent)), "toast de erro com o estado real");
    // aplicar que falha: nada fica pendente
    const rap = await U.acaoComDesfazer({ texto: "x", aplicar() { throw new Error("nao_pode"); }, reverter() { throw new Error("nunca"); } });
    assert.equal(rap.estado, "falhou"); assert.ok(rap.erro);
    const z4 = new d.Evento("keydown", { key: "z", ctrlKey: true }); d.doc.body.dispatchEvent(z4); assert.equal(z4.defaultPrevented, false, "nada pendente");
  } finally { d.fim(); }
  const src = ler("ui.js");
  assert.match(src, /export async function acaoComDesfazer\(\{ texto, aplicar, reverter, firmar, ms = 7000 \} = \{\}\)/, "assinatura do contrato ({texto, aplicar, reverter, ms = 7000}) + o opcional `firmar`");
});

/* ---------- modal e gaveta que protegem o texto digitado ---------- */
await teste("ui.modal (M08): Esc/clique fora/Voltar com texto digitado NÃO fecham e perguntam; sem texto fecham; Continuar/Descartar; X e rodapé fecham direto; busca e carga por script não contam", async () => {
  const d = comDom();
  try {
    const ultimo = () => { const l = d.doc.querySelectorAll("dialog.modal"); return l[l.length - 1]; };
    const abrir = (opts = {}) => {
      const form = U.h("form", null, U.campo({ rotulo: "Título", nome: "titulo" }), U.campo({ rotulo: "Busca", nome: "q", tipo: "busca" }));
      const p = U.modal({ titulo: "Nova oportunidade", corpo: form, acoes: [{ rotulo: "Cancelar", tipo: "neutro", valor: false }, { rotulo: "Salvar", tipo: "primario", fn: () => true }], ...opts });
      const dlg = ultimo();
      return { p, dlg, input: form.querySelector("input[name=titulo]"), busca: form.querySelector("input[name=q]"), faixa: dlg.querySelector(".protege-faixa") };
    };
    const esc = dlg => d.ev(dlg, "cancel");
    const pendente = async p => (await Promise.race([p, esperar(30).then(() => "aberto")])) === "aberto";
    // 1) sem texto: Esc fecha
    let m = abrir(); await esperar(5);
    assert.equal(m.faixa.hidden, true); esc(m.dlg); assert.equal(await m.p, null);
    // 2) com texto: Esc mantém aberto e mostra a faixa
    m = abrir(); await esperar(5);
    m.input.value = "Orçamento"; d.ev(m.input, "input");
    assert.equal(m.faixa.hidden, true); esc(m.dlg);
    assert.equal(m.faixa.hidden, false); assert.match(m.faixa.textContent, /Descartar o que você digitou\?/);
    assert.equal(await pendente(m.p), true, "continua aberto"); assert.equal(m.dlg.open, true);
    assert.equal(d.doc.activeElement.textContent, "Continuar editando", "foco no botão seguro");
    const [continuar, descartar] = m.faixa.querySelectorAll("button");
    assert.equal(continuar.textContent, "Continuar editando"); assert.match(descartar.textContent, /Descartar/); assert.ok(descartar.classList.contains("bt-contorno-perigo"), "destrutivo: contorno, nunca preenchido");
    continuar.click(); assert.equal(m.faixa.hidden, true);
    esc(m.dlg); assert.equal(m.faixa.hidden, false); esc(m.dlg); assert.equal(m.faixa.hidden, true, "2º Esc dispensa o aviso");
    esc(m.dlg); descartar.click(); assert.equal(await m.p, null);
    // 3) clique fora também pergunta
    m = abrir(); await esperar(5); m.input.value = "x"; d.ev(m.input, "input");
    d.ev(m.dlg, "mousedown"); d.ev(m.dlg, "click"); assert.equal(m.faixa.hidden, false); assert.equal(await pendente(m.p), true);
    m.faixa.querySelectorAll("button")[1].click(); assert.equal(await m.p, null);
    // 4) Voltar do navegador: com texto pergunta e recoloca a camada; depois fecha
    m = abrir(); await esperar(5); m.input.value = "x"; d.ev(m.input, "input");
    const abertas = U.camadas.abertas();
    U.camadas._aoPop({ state: null });
    assert.equal(m.faixa.hidden, false); await esperar(10);
    assert.equal(U.camadas.abertas(), abertas, "a camada foi recolocada (o Voltar gastou a entrada do histórico)"); assert.equal(m.dlg.open, true);
    m.faixa.querySelectorAll("button")[1].click(); assert.equal(await m.p, null); assert.equal(U.camadas.abertas(), abertas - 1);
    m = abrir(); await esperar(5); U.camadas._aoPop({ state: null }); assert.equal(await m.p, null, "Voltar sem texto fecha");
    // 5) protegerTexto:false fecha direto mesmo com texto
    m = abrir({ protegerTexto: false }); await esperar(5); m.input.value = "x"; d.ev(m.input, "input"); esc(m.dlg); assert.equal(await m.p, null);
    // 6) campo de busca (type=search) não é "texto digitado"
    m = abrir(); await esperar(5); m.busca.value = "joão"; d.ev(m.busca, "input"); esc(m.dlg); assert.equal(await m.p, null);
    // 7) formulário preenchido por script depois de abrir (a pessoa não mexeu) não conta
    m = abrir(); await esperar(5); m.input.value = "carregado do servidor"; esc(m.dlg); assert.equal(await m.p, null);
    // 7b) …mas se a pessoa depois edita o que foi carregado, conta (a base é o que estava na tela quando ela começou)
    m = abrir(); await esperar(5); m.input.value = "carregado"; d.ev(m.input, "keydown", { key: "a" }); m.input.value = "carregado!"; d.ev(m.input, "input");
    esc(m.dlg); assert.equal(m.faixa.hidden, false); assert.equal(m.dlg.querySelector(".protege-faixa").hidden, false); m.faixa.querySelectorAll("button")[1].click(); assert.equal(await m.p, null);
    // 7c) …e apagar o que digitou, voltando ao original, deixa de ser "sujo"
    m = abrir(); await esperar(5); d.ev(m.input, "keydown", { key: "a" }); m.input.value = "a"; d.ev(m.input, "input"); m.input.value = ""; d.ev(m.input, "input");
    esc(m.dlg); assert.equal(await m.p, null);
    // 8) o X e os botões do rodapé fecham direto, mesmo sujo
    m = abrir(); await esperar(5); m.input.value = "x"; d.ev(m.input, "input"); achar(m.dlg, ".modal-x").click(); assert.equal(await m.p, null);
    m = abrir(); await esperar(5); m.input.value = "x"; d.ev(m.input, "input"); m.dlg.querySelectorAll(".modal-rod button").find(b => b.textContent === "Cancelar").click(); assert.equal(await m.p, false);
    m = abrir(); await esperar(5); m.input.value = "x"; d.ev(m.input, "input"); assert.equal(m.dlg.querySelector(".modal-rod .bt-prim").textContent, "Salvar"); m.dlg.querySelector(".modal-rod .bt-prim").click(); assert.equal(await m.p, true);
    // 9) confirmar() (campo "digitar") nunca pergunta
    const pc = U.confirmar({ titulo: "Excluir?", perigo: true, digitar: "excluir" });
    const dc = ultimo(); const campoDig = achar(dc, "input"); campoDig.value = "exc"; d.ev(campoDig, "input"); esc(dc); assert.equal(await pc, false);
    await esperar(200);
  } finally { d.fim(); }
});

await teste("ui.gaveta (M08): Esc/clique fora com texto pergunta; fechar(), o X e o voltar fecham direto; em toque o foco inicial é o próprio diálogo (modal e gaveta)", async () => {
  let d = comDom();
  try {
    const corpo = U.h("div", null, U.campo({ rotulo: "Título", nome: "titulo" }));
    let fechou = 0;
    const g = U.gaveta({ titulo: "Negócio", corpo, aoFechar: () => { fechou++; } });
    const inp = corpo.querySelector("input[name=titulo]"); await esperar(45);
    assert.equal(d.doc.activeElement, inp, "desktop: foca o 1º campo");
    const faixa = achar(g.el, ".protege-faixa");
    d.ev(g.el, "cancel"); assert.equal(faixa.hidden, true, "sem texto: não pergunta"); await esperar(260); assert.equal(fechou, 1, "sem texto o Esc fecha");
    const corpo2 = U.h("div", null, U.campo({ rotulo: "Título", nome: "titulo" }));
    const g2 = U.gaveta({ titulo: "Negócio", corpo: corpo2, aoFechar: () => { fechou++; } });
    const i2 = corpo2.querySelector("input[name=titulo]"); await esperar(45);
    i2.value = "Reforma"; d.ev(i2, "input");
    d.ev(g2.el, "cancel"); const f2 = achar(g2.el, ".protege-faixa");
    assert.equal(f2.hidden, false); assert.equal(fechou, 1); assert.equal(g2.estaSujo(), true);
    f2.querySelectorAll("button")[0].click(); assert.equal(f2.hidden, true);
    d.ev(g2.el, "mousedown"); d.ev(g2.el, "click"); assert.equal(f2.hidden, false, "clique fora também pergunta"); assert.equal(fechou, 1);
    f2.querySelectorAll("button")[1].click(); await esperar(260); assert.equal(fechou, 2, "Descartar fecha");
    const g3 = U.gaveta({ titulo: "Negócio", corpo: U.h("div", null, U.campo({ rotulo: "Título", nome: "titulo" })), aoFechar: () => { fechou++; } });
    const i3 = g3.corpo.querySelector("input"); await esperar(45); i3.value = "x"; d.ev(i3, "input");
    g3.fechar(); await esperar(260); assert.equal(fechou, 3, "fechar() do código nunca é bloqueado");
    const g4 = U.gaveta({ titulo: "Negócio", corpo: U.h("div", null, U.campo({ rotulo: "Título", nome: "titulo" })), aoFechar: () => { fechou++; } });
    const i4 = g4.corpo.querySelector("input"); await esperar(45); i4.value = "x"; d.ev(i4, "input");
    achar(g4.el, ".gaveta-x").click(); await esperar(260); assert.equal(fechou, 4, "o X fecha direto");
    const g5 = U.gaveta({ titulo: "N", corpo: U.h("div", null, U.campo({ rotulo: "Título", nome: "titulo" })), protegerTexto: false, aoFechar: () => { fechou++; } });
    const i5 = g5.corpo.querySelector("input"); await esperar(45); i5.value = "x"; d.ev(i5, "input"); d.ev(g5.el, "cancel"); await esperar(260); assert.equal(fechou, 5, "protegerTexto:false");
  } finally { d.fim(); }
  d = comDom({ grosso: true });
  try {
    const g = U.gaveta({ titulo: "Negócio", corpo: U.h("div", null, U.campo({ rotulo: "Título", nome: "titulo" })) });
    assert.equal(d.doc.activeElement, g.el, "no celular o foco inicial é o diálogo, não o campo (o teclado não sobe)");
    assert.equal(g.el.getAttribute("tabindex"), "-1"); await esperar(60); assert.equal(d.doc.activeElement, g.el, "nem depois");
    const mp = U.modal({ titulo: "X", corpo: U.campo({ rotulo: "Nome", nome: "n" }) });
    const dlgs = d.doc.querySelectorAll("dialog.modal"); const dlg = dlgs[dlgs.length - 1];
    assert.equal(d.doc.activeElement, dlg, "modal também"); d.ev(dlg, "cancel"); assert.equal(await mp, null);
    await esperar(260);
  } finally { d.fim(); }
  d = comDom();
  try {
    const mp = U.modal({ titulo: "X", corpo: U.campo({ rotulo: "Nome", nome: "n" }) });
    const dlgs = d.doc.querySelectorAll("dialog.modal"); const dlg = dlgs[dlgs.length - 1];
    assert.equal(d.doc.activeElement, achar(dlg, "input"), "mouse/teclado: foca o 1º campo como antes"); d.ev(dlg, "cancel"); await mp;
    await esperar(200);
  } finally { d.fim(); }
});

/* ---------- campo com validação, máscaras e medidor ---------- */
await teste("ui.campo({validar}) (M08): e-mail, telefone (máscara; lerForm só dígitos), moeda, senha com medidor, função, obrigatório, contador, validarForm", () => {
  const d = comDom();
  try {
    const form = U.h("form");
    const email = U.campo({ rotulo: "E-mail", nome: "email", tipo: "email", validar: "email" });
    const tel = U.campo({ rotulo: "Telefone", nome: "tel", tipo: "tel", validar: "telefone" });
    const val = U.campo({ rotulo: "Valor", nome: "valor", tipo: "moeda", validar: "moeda", obrigatorio: true });
    const sen = U.campo({ rotulo: "Senha", nome: "senha", tipo: "senha", validar: "senha" });
    const doc = U.campo({ rotulo: "Documento", nome: "doc", validar: v => (v.length === 3 ? null : "Use 3 letras.") });
    const obs = U.campo({ rotulo: "Obs.", nome: "obs", tipo: "textarea", max: 10 });
    form.append(email, tel, val, sen, doc, obs); d.doc.body.appendChild(form);
    const inp = c => c.querySelector("input, textarea");
    const erro = c => achar(c, ".campo-erro");
    // e-mail: valida ao sair; depois do 1º erro, a cada tecla; ✓ e ! além da cor; aria-invalid
    const e = inp(email); e.value = "joao@"; d.ev(e, "blur", { bubbles: false });
    assert.equal(email.dataset.estado, "erro"); assert.equal(e.getAttribute("aria-invalid"), "true");
    assert.match(erro(email).textContent, /Confira o e-mail/); assert.equal(erro(email).hidden, false);
    assert.ok((e.getAttribute("aria-describedby") || "").includes(erro(email).id), "erro ligado ao campo");
    e.value = "joao@exemplo.com"; d.ev(e, "input");
    assert.equal(email.dataset.estado, "ok"); assert.equal(e.getAttribute("aria-invalid"), null); assert.equal(erro(email).hidden, true);
    assert.match(achar(email, ".campo-estado").textContent, /✓/);
    // antes do 1º erro as teclas não incomodam
    const e2 = inp(U.campo({ rotulo: "x", nome: "x", validar: "email" })); void e2;
    // telefone: máscara e lerForm só dígitos
    const t = inp(tel); t.value = "12998303030"; t.selectionStart = 11; d.ev(t, "input", { inputType: "insertText" });
    assert.equal(t.value, "(12) 99830-3030"); assert.equal(t.getAttribute("inputmode"), "tel");
    assert.equal(U.lerForm(form).tel, "12998303030", "lerForm devolve só os dígitos");
    t.value = "+55 12 99830-3030"; d.ev(t, "input"); assert.equal(t.value, "(12) 99830-3030");
    d.ev(t, "blur"); assert.equal(tel.dataset.estado, "ok");
    t.value = "(12) 9983"; d.ev(t, "input"); d.ev(t, "blur"); assert.equal(tel.dataset.estado, "erro"); assert.match(erro(tel).textContent, /DDD/);
    t.value = ""; d.ev(t, "input"); d.ev(t, "blur"); assert.equal(tel.dataset.estado, "", "opcional e vazio: sem erro nem ✓");
    // moeda
    const v = inp(val); v.value = "1234,5"; v.selectionStart = 6; d.ev(v, "input");
    assert.equal(v.value, "1.234,5"); assert.equal(v.selectionStart, 7, "cursor estável");
    assert.equal(U.lerForm(form).valor, 1234.5);
    d.ev(v, "blur"); assert.equal(val.dataset.estado, "ok");
    v.value = ""; d.ev(v, "blur"); assert.equal(val.dataset.estado, "erro"); assert.match(erro(val).textContent, /Preencha este campo/);
    // senha + medidor
    const s = inp(sen), med = achar(sen, ".medidor");
    assert.equal(med.getAttribute("role"), "meter");
    for (const [txt, nivel] of [["abc", "1"], ["abcdefgh", "2"], ["Abcdefgh12", "3"], ["Abcdefgh12!?", "4"]]) { s.value = txt; d.ev(s, "input"); assert.equal(med.dataset.nivel, nivel, txt); assert.equal(med.getAttribute("aria-valuenow"), nivel); }
    assert.equal(med.getAttribute("aria-valuetext"), "Forte");
    s.value = "abc"; d.ev(s, "blur"); assert.equal(sen.dataset.estado, "erro"); assert.match(erro(sen).textContent, /8 caracteres/);
    assert.equal(U.campo({ rotulo: "Senha atual", nome: "s", tipo: "senha" }).querySelector(".medidor"), null, "sem validar:'senha' não há medidor");
    // função
    const dc = inp(doc); dc.value = "ab"; d.ev(dc, "blur"); assert.equal(doc.dataset.estado, "erro"); assert.match(erro(doc).textContent, /Use 3 letras/);
    dc.value = "abc"; d.ev(dc, "input"); assert.equal(doc.dataset.estado, "ok");
    // contador perto do limite
    const o = inp(obs), cont = achar(obs, ".campo-contador"); assert.equal(cont.hidden, true);
    o.value = "12345678"; d.ev(o, "input"); assert.equal(cont.hidden, false); assert.equal(cont.textContent, "8/10"); assert.equal(cont.dataset.limite, "0");
    o.value = "1234567890"; d.ev(o, "input"); assert.equal(cont.dataset.limite, "1");
    // validarForm: valida tudo e foca o primeiro com erro
    e.value = "x"; t.value = ""; v.value = ""; s.value = ""; dc.value = "";
    assert.equal(U.validarForm(form), false); assert.equal(d.doc.activeElement, e, "foca o primeiro com erro");
    e.value = "ok@ok.com"; v.value = "10"; dc.value = "abc";
    assert.equal(U.validarForm(form), true);
    assert.equal(U.validarCampo(obs), true, "campo sem validar → true");
    assert.equal(U.validarCampo(null), true);
    // campos antigos (sem validar) continuam iguais: nada de ✓, erro escondido, tel sem máscara
    const velho = U.campo({ rotulo: "Tel", nome: "t2", tipo: "tel" }); const iv = inp(velho); iv.value = "12998303030"; d.ev(iv, "input");
    assert.equal(iv.value, "12998303030", "tipo tel sem validar não mascara (não muda o que já existia)"); assert.equal(velho.dataset.estado, undefined);
    // moeda sem validar ganha a máscara (já usava lerMoeda)
    const velhaMoeda = U.campo({ rotulo: "R$", nome: "m2", tipo: "moeda", valor: 1234.5 }); assert.equal(inp(velhaMoeda).value, "1.234,50");
  } finally { d.fim(); }
});

await teste("máscaras com cursor estável (14 casos): telefone e moeda", () => {
  const m = U.mascarar;
  // telefone
  assert.deepEqual(m("telefone", "1", 1), { texto: "(1", cursor: 2 }, "1º dígito");
  assert.deepEqual(m("telefone", "123", 3), { texto: "(12) 3", cursor: 6 }, "3º dígito");
  assert.deepEqual(m("telefone", "(127) 99830-3030", 4), { texto: "(12) 79983-0303", cursor: 6 }, "dígito no meio: o cursor fica depois dele");
  assert.deepEqual(m("telefone", "+55 12 99830-3030", 17), { texto: "(12) 99830-3030", cursor: 15 }, "+55 colado");
  assert.deepEqual(m("telefone", "(12) 998303030", 10, { apagando: true, anterior: "(12) 99830-3030" }), { texto: "(12) 9983-3030", cursor: 9 }, "backspace sobre o '-' apaga o dígito anterior");
  assert.deepEqual(m("telefone", "+44 7911 123456", 15), { texto: "+447911123456", cursor: 13 }, "número de fora: só dígitos");
  assert.deepEqual(m("telefone", "", 0), { texto: "", cursor: 0 });
  assert.equal(m("telefone", "119999988887777", 15).texto, "(11) 99999-8888", "no máximo 11 dígitos");
  // moeda
  assert.deepEqual(m("moeda", "1234", 4), { texto: "1.234", cursor: 5 });
  assert.deepEqual(m("moeda", "1.2345", 6), { texto: "12.345", cursor: 6 }, "5º dígito no fim");
  assert.deepEqual(m("moeda", "129.345", 3), { texto: "129.345", cursor: 3 }, "dígito no meio");
  assert.deepEqual(m("moeda", "1.234,567", 9), { texto: "1.234,56", cursor: 8 }, "só 2 casas");
  assert.deepEqual(m("moeda", "1234.56", 7), { texto: "1.234,56", cursor: 8 }, "ponto decimal colado");
  assert.deepEqual(m("moeda", "007", 3), { texto: "7", cursor: 1 }, "sem zeros à esquerda");
  assert.deepEqual(m("moeda", "1234", 1, { apagando: true, anterior: "1.234" }), { texto: "234", cursor: 0 }, "backspace sobre o '.' apaga o dígito anterior");
  assert.equal(U.formatarMoeda("abc"), ""); assert.equal(U.formatarMoeda(",5"), "0,5"); assert.equal(U.formatarMoeda("1,2,3"), "1,23");
  assert.equal(U.forcaSenha(""), 0); assert.equal(U.forcaSenha("1234567"), 1);
  assert.equal(U.lerMoeda(U.formatarMoeda("1234,5")), 1234.5, "a máscara é compatível com lerMoeda");
});

await teste("ui.vazio por tipo (M09): primeiro_uso (órbita + passos + ação), em_dia (selo + .narr), sem_resultado (1 linha + Limpar filtros); legado igual", () => {
  const d = comDom();
  try {
    let n = 0;
    const p = U.vazio({ tipo: "primeiro_uso", titulo: "Conecte o WhatsApp", texto: "Para começar a atender.", passos: [{ rotulo: "Conectar número", feito: true }, "Ligar a IA", "Marcar agenda"], acao: { rotulo: "Conectar número", fn: () => { n++; } } });
    assert.ok(p.classList.contains("vazio") && p.classList.contains("vazio-primeiro")); assert.equal(p.dataset.tipo, "primeiro_uso");
    const svg = achar(p, "svg.vazio-orbita"); assert.equal(svg.namespaceURI, "http://www.w3.org/2000/svg", "SVG por createElementNS");
    assert.equal(p.querySelectorAll(".vo-sat").length, 3); assert.equal(p.querySelectorAll(".vo-sat-on").length, 1, "1 de 3 passos feito → 1 satélite aceso");
    assert.deepEqual(p.querySelectorAll(".vazio-passos li").map(x => x.dataset.feito), ["1", "0", "0"]);
    assert.equal(achar(p, "h2").textContent, "Conecte o WhatsApp");
    achar(p, "button").click(); assert.equal(n, 1); assert.equal(achar(p, "button").textContent, "Conectar número");
    const e = U.vazio({ tipo: "em_dia", titulo: "Tudo respondido.", texto: "Nenhum cliente esperando." });
    assert.ok(e.classList.contains("vazio-em-dia")); assert.equal(achar(e, "p.narr").textContent, "Tudo respondido.");
    assert.ok(e.querySelector(".vo-selo"), "selo ✓"); assert.equal(e.querySelectorAll(".vo-sat-on").length, 3);
    const s = U.vazio({ tipo: "sem_resultado", titulo: "Nada encontrado.", acao: { fn: () => { n += 10; } } });
    assert.ok(s.classList.contains("vazio-sem")); assert.match(s.textContent, /Nada encontrado\./);
    assert.equal(achar(s, "button").textContent, "Limpar filtros"); achar(s, "button").click(); assert.equal(n, 11);
    assert.equal(U.vazio({ tipo: "sem_resultado" }).querySelector("button"), null, "sem ação: só a linha");
    const l = U.vazio({ titulo: "Sem pacientes", texto: "Crie o primeiro.", icone: "contato", acao: { rotulo: "Novo", fn() {} } });
    assert.ok(l.querySelector(".vazio-ic")); assert.equal(achar(l, "h2").textContent, "Sem pacientes"); assert.equal(achar(l, "button").textContent, "Novo");
    const fonte = ler("ui.js"); const corpoVazio = fonte.slice(fonte.indexOf("function orbitaSvg"), fonte.indexOf("export function esqueleto"));
    assert.doesNotMatch(corpoVazio, /innerHTML/, "vazio e órbita sem innerHTML");
  } finally { d.fim(); }
});

await teste("G.destacar(el) (M10): flash de 600 ms (.destaque), reinicia se chamado de novo, sem flash com movimento reduzido", async () => {
  const d = comDom();
  try {
    const el = U.h("span", null, "R$ 10"); const r = GRAF.destacar(el);
    assert.equal(r, el); assert.ok(el.classList.contains("destaque"));
    GRAF.destacar(el); assert.ok(el.classList.contains("destaque"), "reinicia");
    await esperar(650); assert.ok(!el.classList.contains("destaque"), "some depois de ~600 ms");
    assert.equal(GRAF.destacar(null), null);
  } finally { d.fim(); }
  const d2 = comDom({ reduzido: true });
  try { const el = U.h("span"); GRAF.destacar(el); assert.ok(!el.classList.contains("destaque"), "movimento reduzido: sem flash"); } finally { d2.fim(); }
});

await teste("ui.numMoeda: 'R$' e centavos a 60 % (.num-moeda), centavos opcionais, vazio vira traço", () => {
  const d = comDom();
  try {
    const a = U.numMoeda(1234.5); assert.ok(a.classList.contains("num-moeda")); assert.equal(a.textContent, "R$1.234,50");
    assert.equal(achar(a, ".nm-rs").textContent, "R$"); assert.equal(achar(a, ".nm-cent").textContent, ",50");
    assert.equal(U.numMoeda(1234.5, { centavos: false }).textContent, "R$1.234"); assert.equal(U.numMoeda(1234.5, { centavos: false }).querySelector(".nm-cent"), null);
    assert.equal(U.numMoeda(null).textContent, "—"); assert.equal(U.numMoeda(-5).textContent, "R$−5,00");
  } finally { d.fim(); }
});

/* ---------- M04: cor com intenção ---------- */
const BASE_ESTADOS = { ruim: "#B3261E", ok: "#1A6E44", aten: "#8A5A00", info: "#2B5A80", meta: "#2C3396", google: "#0B645E" };
const BASE_ESTADOS_ESCURO = { ruim: "#F08A74", ok: "#7FD1A5", aten: "#E5B35C", info: "#8FB8DD", meta: "#9298F2", google: "#6ECFC8" };
await teste("M04: a marca nunca é girada — gira o ESTADO; sem matiz (cinza) ou longe, nada muda; o estado vai para o tom livre mais próximo", () => {
  const sem = T.girarEstados(BASE_ESTADOS, { prim: "#7B3FA2", sec: "#9E9E9E" });
  assert.deepEqual(sem.giradas, []); assert.deepEqual(sem.cores, BASE_ESTADOS);
  assert.deepEqual(T.girarEstados(BASE_ESTADOS, { prim: "#777777", sec: "#808080" }).giradas, [], "marca cinza não tem matiz para confundir");
  const verm = T.girarEstados(BASE_ESTADOS, { prim: "#C62828", sec: "#E57373" });
  assert.deepEqual(verm.giradas, ["ruim"], "só o erro estava perto do vermelho");
  const dr = T.distMatiz(T.matiz(verm.cores.ruim), T.matiz("#C62828")); assert.ok(dr >= 30, `erro a ${dr.toFixed(1)}° do vermelho`);
  assert.ok(T.distMatiz(T.matiz(verm.cores.ruim), T.matiz(BASE_ESTADOS.aten)) >= 22, "o erro não vira laranja em cima do aviso");
  const verde = T.girarEstados(BASE_ESTADOS, { prim: "#1E8E3E", sec: "#81C995" });
  assert.deepEqual(verde.giradas, ["ok"]);
  assert.ok(T.distMatiz(T.matiz(verde.cores.ok), T.matiz("#1E8E3E")) >= 30);
  assert.ok(T.distMatiz(T.matiz(verde.cores.ok), T.matiz(BASE_ESTADOS.info)) >= 22, "sucesso não vira ciano ao lado do azul de informação");
  const azul = T.girarEstados(BASE_ESTADOS, { prim: "#1A56DB", sec: "#7AA7F7" });
  assert.deepEqual([...azul.giradas].sort(), ["info", "meta"]);
  const bronze = T.girarEstados(BASE_ESTADOS, { prim: "#B0761F", sec: "#6FA3CF" });
  assert.deepEqual(bronze.giradas, ["aten"], "o bronze (36°) engolia o âmbar (39°); a secundária azul não gira a informação");
  assert.notEqual(bronze.cores.aten, BASE_ESTADOS.aten);
  assert.equal(T.matiz("#808080"), null); assert.equal(T.matiz("#FFFFFF"), null); assert.equal(T.matiz("#000000"), null);
  assert.equal(T.distMatiz(350, 10), 20); assert.equal(T.distMatiz(0, 180), 180);
});
await teste("M04: marcas vermelha, verde, azul e padrão (claro e escuro) e 34 aleatórias: primária a ≥ 30° de CADA estado, secundária a ≥ 30° de sucesso/erro/atenção, contraste ≥ 4,5:1 sobre fundo, cartão, poço e o suave; a marca não muda", () => {
  const todas = [...Object.values(CLARO_4), ...Object.values(ESCURO_4), ...marcas];
  let giradas = 0;
  for (const m of todas) {
    const { vars, avisos } = T.derivarTema(m);
    const hp = T.matiz(m.primaria), hs = T.matiz(m.secundaria);
    assert.equal(vars["--c-prim"], T.normalizarHex(m.primaria), "a marca não é girada");
    for (const k of ["ok", "ruim", "aten", "info", "meta", "google"]) {
      const cor = vars[`--c-${k}`], h = T.matiz(cor);
      if (h !== null) {
        if (hp !== null) assert.ok(T.distMatiz(h, hp) >= T.MARGEM_MATIZ - 1e-9, `${k} ${cor} (${h.toFixed(1)}°) a ${T.distMatiz(h, hp).toFixed(1)}° da primária ${m.primaria} (${hp.toFixed(1)}°)`);
        if (hs !== null && ["ok", "ruim", "aten"].includes(k)) assert.ok(T.distMatiz(h, hs) >= T.MARGEM_MATIZ - 1e-9, `${k} ${cor} a ${T.distMatiz(h, hs).toFixed(1)}° da secundária ${m.secundaria}`);
      }
      for (const fundo of ["--c-fundo", "--c-sup", "--c-poco", `--c-${k}-suave`]) {
        assert.ok(T.contraste(cor, vars[fundo]) >= 4.5 - 1e-9, `${k} ${cor} sobre ${fundo} ${vars[fundo]} = ${T.contraste(cor, vars[fundo]).toFixed(2)} (${JSON.stringify(m)})`);
      }
    }
    const aviso = avisos.find(a => a.campo === "estados");
    const gir = T.girarEstados(vars["--esquema"] === "claro" ? BASE_ESTADOS : BASE_ESTADOS_ESCURO, { prim: T.normalizarHex(m.primaria), sec: T.normalizarHex(m.secundaria) }).giradas;
    assert.equal(!!aviso, gir.length > 0, "o aviso aparece exatamente quando um estado girou");
    if (aviso) { giradas++; assert.match(aviso.texto, /giramos o tom delas/); }
  }
  assert.ok(giradas >= 8, `pelo menos as marcas de conflito giraram (${giradas})`);
  for (const [nome, m] of Object.entries({ vermelha: CLARO_4.vermelha, verde: CLARO_4.verde, azul: CLARO_4.azul, padrao: CLARO_4.padrao })) {
    assert.ok(T.derivarTema(m).avisos.some(a => a.campo === "estados"), `${nome}: registra o giro em avisos`);
  }
});
await teste("M04: Meta e Google têm tom próprio (nunca o hex de aten/info) e fundo suave próprio", () => {
  for (const m of [...Object.values(CLARO_4), ...Object.values(ESCURO_4), ...marcas]) {
    const { vars } = T.derivarTema(m);
    assert.notEqual(vars["--c-google"], vars["--c-aten"], `google = aten em ${JSON.stringify(m)}`);
    assert.notEqual(vars["--c-meta"], vars["--c-info"], `meta = info em ${JSON.stringify(m)}`);
    assert.notEqual(vars["--c-google-suave"], vars["--c-aten-suave"]); assert.notEqual(vars["--c-meta-suave"], vars["--c-sec-suave"]);
  }
  const { vars } = T.derivarTema(T.coresNoEsquema(T.PADRAO.cores, "claro"));
  assert.ok(T.distMatiz(T.matiz(vars["--c-google"]), T.matiz(vars["--c-aten"])) >= 60, "Google longe do aviso (no claro tinham o mesmo hex)");
  assert.match(CSS_APP, /\.pilula-meta \{ background: var\(--c-meta-suave\); color: var\(--c-meta\); \}/);
  assert.match(CSS_APP, /\.pilula-google \{ background: var\(--c-google-suave\); color: var\(--c-google\); \}/);
});
await teste("M04: pílulas de estado ganham glifo por CSS (✓ ▲ ✕ i); ação destrutiva é contorno + ícone; 'Seus produtos' em 1 coluna de cartões de 72 px; acento do produto na navegação", () => {
  for (const [cls, glifo] of [["ok", "✓"], ["aten", "▲"], ["ruim", "✕"], ["info", "i"]]) {
    assert.match(CSS_APP, new RegExp(`\\.pilula-${cls}:not\\(:has\\(\\.ic\\)\\)::before \\{[^}]*content: "${glifo}"`), `glifo de ${cls}`);
  }
  const regra = sel => { const m = CSS_APP.match(new RegExp(`(?:^|\\n)${sel.replace(/[.\[\]"=]/g, "\\$&")} \\{([^}]*)\\}`)); assert.ok(m, `regra ${sel}`); return m[1]; };
  for (const sel of [".bt-perigo", ".bt-contorno-perigo"]) {
    const r = regra(sel);
    assert.match(r, /background: transparent/); assert.match(r, /border-color: var\(--c-ruim\)/); assert.match(r, /color: var\(--c-ruim\)/);
    assert.doesNotMatch(r, /var\(--c-prim/, "nunca a cor da marca");
  }
  assert.match(regra(".produto-grade"), /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(CSS_APP.match(/(?:^|\n)\.produto-op \{([^}]*)\}/)[1], /min-height: 72px/);
  assert.doesNotMatch(CSS_APP, /\.produto-grade \{[^}]*repeat\(3/);
  assert.match(CSS_APP, /\.nav-b\[aria-current="page"\] \.ic \{ color: var\(--c-prod\); \}/); assert.match(CSS_APP, /\.barra-b\[aria-current="page"\] \.ic \{ color: var\(--c-prod\); \}/);
  assert.match(CSS_APP, /\.produto-op\[data-produto="ads"\], \.produto-grade > \.produto-op:nth-child\(2\) \{ --c-prod-op: var\(--c-prod-ads\); \}/, "cada opção com o seu acento");
  // confirmar({perigo}) leva a lixeira; modal aceita `icone` na ação
  const d = comDom();
  try {
    U.confirmar({ titulo: "Excluir?", perigo: true });
    const dlgs = d.doc.querySelectorAll("dialog.modal"); const dlg = dlgs[dlgs.length - 1];
    const perigo = achar(dlg, ".modal-rod .bt-perigo");
    assert.ok(perigo.querySelector("svg"), "botão destrutivo com ícone"); assert.equal(perigo.textContent, "Excluir");
    d.ev(dlg, "cancel");
  } finally { d.fim(); }
});

/* ---------- M02: uma escala tipográfica ---------- */
/** font-size (ou o tamanho do atalho `font:`) em px/rem/pt/clamp literal, fora do :root. Relativos (em, %) e var(--fs-*) são válidos. */
function tamanhosLiterais(texto) {
  const cod = semRaiz(texto).replace(/\/\*[\s\S]*?\*\//g, "").replace(/@font-face\s*\{[^}]*\}/g, "");
  const ruins = [];
  for (const m of cod.matchAll(/(?:^|[;{\s])font-size:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    if (/^(var\(--[a-z0-9-]+\)|inherit|initial|unset|smaller|larger|calc\(var\(--[a-z0-9-]+\)[^;]*\)|max\([\d.]+em, var\(--[a-z0-9-]+\)\)|[\d.]+(em|%))(\s*!important)?$/.test(v)) continue;
    ruins.push(`font-size: ${v}`);
  }
  for (const m of cod.matchAll(/(?:^|[;{\s])font:\s*([^;}]+)/g)) {
    if (/[\d.]+(px|rem|pt)\b/.test(m[1].replace(/var\([^)]*\)/g, ""))) ruins.push(`font: ${m[1].trim()}`);
  }
  return ruins;
}
await teste("M02: app.css traz o marcador '/* escala: tokens */' e nenhum font-size literal (px/rem/clamp) fora do :root; o teste vale para todo CSS que trouxer o marcador", () => {
  assert.match(CSS_APP, /\/\* escala: tokens \*\//, "marcador no app.css");
  assert.deepEqual(tamanhosLiterais(CSS_APP), [], "app.css sem tamanho de letra literal");
  // o detector pega o que deve pegar (e deixa passar o que é token ou relativo)
  assert.deepEqual(tamanhosLiterais(".a { font-size: 13px; } .b { font-size: clamp(1rem, 2vw, 2rem); } .c { font: 600 12px/1.2 x; } .d { font-size: var(--fs-13); } .e { font-size: .6em; } :root { --fs-x: 1rem; font-size: 14px; }"),
    ["font-size: 13px", "font-size: clamp(1rem, 2vw, 2rem)", "font: 600 12px/1.2 x"]);
  // os outros CSS só entram na checagem quando trouxerem o marcador (C e D põem o marcador ao migrar M30/M40)
  for (const f of css.filter(x => x !== "app.css")) {
    const t = ler(f);
    if (!/\/\* escala: tokens \*\//.test(t)) continue;
    assert.deepEqual(tamanhosLiterais(t), [], `${f} traz o marcador mas tem font-size literal`);
  }
});
await teste("M02: escala de 7 degraus nos títulos antigos (.titulo-pag = h1, .titulo-sec = h2, .num-grande = número L) e Clash só no peso 600 em app.css", () => {
  const regra = sel => { const m = CSS_APP.match(new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\$&")} \\{([^}]*)\\}`)); assert.ok(m, sel); return m[1]; };
  assert.match(regra(".titulo-pag"), /font-size: var\(--fs-h1\)/); assert.match(regra(".titulo-sec"), /font-size: var\(--fs-h2\)/); assert.match(regra(".num-grande"), /font-size: var\(--fs-num-l\)/);
  assert.match(regra(".entrar-titulo".replace("{", "")).replace(/\s+/g, " ") || "", /font-size: var\(--fs-display\)/);
  const clash = [...CSS_APP.matchAll(/([^{}]+)\{([^}]*font-family:\s*var\(--f-titulo\)[^}]*)\}/g)].map(m => [m[1].trim().split("\n").pop().trim(), m[2]]).filter(([sel]) => !sel.startsWith(":root"));
  assert.ok(clash.length >= 10, `regras com Clash: ${clash.length}`);
  for (const [sel, corpo] of clash) {
    assert.match(corpo, /font-weight:\s*600/, `${sel}: Clash com peso único 600`);
    assert.doesNotMatch(corpo, /font-weight:\s*(4|5|7|8|9)\d\d/, `${sel}: outro peso`);
  }
});

/* ---------- M03: rótulos legíveis ---------- */
await teste("M03: caixa-alta só em .selo-caps (app.css inteiro); rótulos de tabela, menu e conta em Satoshi, minúsculos, sem tracking; Plex só para dado", () => {
  const cod = CSS_APP.replace(/\/\*[\s\S]*?\*\//g, "");
  const caixaAlta = [...cod.matchAll(/([^{}]+)\{[^{}]*text-transform:\s*uppercase[^{}]*\}/g)].map(m => m[1].trim().split("\n").pop().trim());
  assert.deepEqual(caixaAlta, [".selo-caps"], `caixa-alta fora do selo: ${caixaAlta.join(" | ")}`);
  assert.doesNotMatch(cod, /text-transform:\s*capitalize/);
  const regra = sel => { const m = CSS_APP.match(new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, "\\$&")} \\{([^}]*)\\}`)); assert.ok(m, sel); return m[1]; };
  // o que era "Plex 11 px caixa-alta com tracking" virou texto de rótulo (Satoshi 600, tamanho de token, sem letter-spacing)
  for (const sel of [".nav-selo", ".produto-op-atual", ".entrar-assina", ".adm-kv dt", ".oferta-inclusoes-tit", ".pv-kpi small", ".lat-conta small", ".empresa-bt small"]) {
    const r = regra(sel);
    assert.doesNotMatch(r, /f-mono|letter-spacing|uppercase/, `${sel}: nada de Plex, tracking ou caixa-alta`);
    assert.match(r, /font-size: var\(--fs-(12|peq)\)/, `${sel}: tamanho de token`);
  }
  assert.match(CSS_APP, /\.tabela th \{\s*text-align: left; font-family: var\(--f-corpo\); font-weight: 600; font-size: var\(--fs-peq\);/, "cabeçalho de tabela em Satoshi");
  assert.match(CSS_APP, /\.tabela td::before \{ content: attr\(data-rotulo\); font-weight: 600; font-size: var\(--fs-peq\);/, "rótulo do cartão (celular) em Satoshi");
  assert.doesNotMatch(regra(".cor-hex"), /uppercase/);
  // o que continua em Plex é dado: valor, tecla, DNS, domínio, contagem
  for (const sel of [".mono", ".dado"]) assert.match(regra(sel), /font-family: var\(--f-mono\)/);
  assert.match(regra(".dado"), /font-variant-numeric: tabular-nums/);
});
await teste("M03: piso de 12 px em qualquer texto e de 13 px quando o ponteiro é o dedo (os tokens pequenos sobem juntos)", () => {
  const ini = CSS_APP.indexOf(":root {"), blocoRaiz = CSS_APP.slice(ini, CSS_APP.indexOf("\n}\n", ini));
  const raiz = Object.fromEntries([...blocoRaiz.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  const rem = v => parseFloat(/([\d.]+)rem/.exec(v)[1]) * 16;
  for (const t of ["--fs-11", "--fs-12", "--fs-13", "--fs-peq"]) assert.ok(rem(raiz[t]) >= 12, `${t} = ${raiz[t]} (piso de 12 px)`);
  assert.match(CSS_APP, /@media \(pointer: coarse\) \{ :root \{ --fs-11: \.8125rem; --fs-12: \.8125rem; \} \}/, "toque: 13 px");
  assert.equal(rem("0.8125rem"), 13);
  assert.deepEqual(tamanhosLiterais(CSS_APP), [], "nenhum tamanho literal (nem abaixo do piso) fora do :root");
  // dentro do .rotulo a regra do contrato continua: 13 px
  assert.match((CSS_APP.match(/(?:^|\n)\.rotulo \{([^}]*)\}/) || [])[1], /font-size: var\(--fs-peq\)/);
  // texto de estado e de aviso não cai abaixo do piso: nenhum em/% abaixo de 1em aplicado a texto corrido (só glifos de ::before e o R$ com max())
  const emPequenos = [...CSS_APP.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^{}]*font-size:\s*(0?\.\d+)em[^{}]*\}/g)].map(m => m[1].trim().split("\n").pop().trim());
  assert.ok(emPequenos.every(s => /::before$|::after$/.test(s)), `font-size relativo < 1em fora de glifo: ${emPequenos.filter(s => !/::before$|::after$/.test(s)).join(" | ")}`);
});

/* ---------- M05: um segmentado só, com indicador que desliza, e os gestos de toque ---------- */
await teste("M05: ui.abas é o segmentado 'abas' com a API de antes (re-clique chama aoMudar, setas ativam, contador com espaço, painel ARIA, ícone, ganchos .abas/.aba/.abas-n)", () => {
  const d = comDom();
  try {
    const painelA = U.h("div"), painelB = U.h("div");
    const mudou = [];
    const ab = U.abas({ itens: [{ id: "regra", rotulo: "Regra", icone: "raio", painel: painelA }, { id: "exec", rotulo: "Execuções", n: 3, painel: painelB }, { id: "x", rotulo: "Outra" }],
      ativo: "regra", rotulo: "O que editar", aoMudar: v => mudou.push(v), classe: "au-abas" });
    d.doc.body.appendChild(ab.el);
    const el = ab.el;
    assert.ok(el.classList.contains("seg") && el.classList.contains("seg-abas") && el.classList.contains("abas") && el.classList.contains("au-abas"), "classes: segmentado + gancho legado + classe do módulo");
    assert.equal(el.getAttribute("role"), "tablist"); assert.equal(el.getAttribute("aria-label"), "O que editar");
    const tabs = el.querySelectorAll("[role=tab]");
    assert.equal(tabs.length, 3); assert.ok(tabs.every(t => t.classList.contains("seg-op") && t.classList.contains("aba")), "cada item: .seg-op e .aba");
    assert.equal(tabs.filter(t => t.getAttribute("aria-selected") === "true").length, 1); assert.equal(ab.ativo, "regra");
    assert.deepEqual(tabs.map(t => t.tabIndex), [0, -1, -1], "roving tabindex");
    assert.ok(tabs[0].querySelector("svg"), "ícone antes do rótulo"); assert.equal(tabs[1].querySelector(".seg-n").classList.contains("abas-n"), true);
    assert.match(tabs[1].textContent, /Execuções 3/, "espaço entre o rótulo e o contador (leitor de tela)");
    assert.equal(tabs[0].querySelector(".seg-n").hidden, true);
    // painéis: role=tabpanel, ligados nos dois sentidos
    assert.equal(painelA.getAttribute("role"), "tabpanel"); assert.equal(tabs[0].getAttribute("aria-controls"), painelA.id); assert.equal(painelA.getAttribute("aria-labelledby"), tabs[0].id);
    assert.equal(tabs[1].getAttribute("aria-controls"), painelB.id); assert.equal(tabs[2].getAttribute("aria-controls"), null, "sem painel: sem aria-controls");
    // a API de antes: clique, re-clique, setas, ativar (sem aoMudar), contar
    tabs[1].click(); assert.deepEqual(mudou, ["exec"]); assert.equal(ab.ativo, "exec");
    tabs[1].click(); assert.deepEqual(mudou, ["exec", "exec"], "re-clique no item ativo chama aoMudar (como a ui.abas sempre fez)");
    tabs[1].focus(); d.ev(tabs[1], "keydown", { key: "ArrowRight" }); assert.equal(ab.ativo, "x"); assert.equal(mudou.at(-1), "x"); assert.equal(d.doc.activeElement, tabs[2]);
    d.ev(tabs[2], "keydown", { key: "ArrowRight" }); assert.equal(ab.ativo, "regra", "dá a volta");
    const n = mudou.length; ab.ativar("exec"); assert.equal(ab.ativo, "exec"); assert.equal(mudou.length, n, "ativar() não chama aoMudar");
    ab.contar("exec", 7); assert.equal(tabs[1].querySelector(".seg-n").textContent, "7"); ab.contar("exec", null); assert.equal(tabs[1].querySelector(".seg-n").hidden, true);
    assert.equal(tabs.filter(t => t.getAttribute("aria-selected") === "true").length, 1, "aria-selected único");
    // sem itens e sem aoMudar não quebram
    assert.equal(U.abas({}).el.querySelectorAll("[role=tab]").length, 0); const sem = U.abas({ itens: [{ id: "a", rotulo: "A" }] }); sem.el.querySelector("[role=tab]").click();
    // segmentado puro: tocar no item ativo NÃO chama aoMudar (só `repetir` faz isso)
    const calls = []; const s = U.segmentado({ opcoes: [{ valor: 1, rotulo: "A" }, { valor: 2, rotulo: "B" }], valor: 1, aoMudar: v => calls.push(v) });
    s.querySelectorAll("[role=tab]")[0].click(); assert.deepEqual(calls, []);
    const r = U.segmentado({ opcoes: [{ valor: 1, rotulo: "A" }], valor: 1, aoMudar: v => calls.push(v), repetir: true, classe: "minha" });
    r.querySelectorAll("[role=tab]")[0].click(); assert.deepEqual(calls, [1]); assert.ok(r.classList.contains("minha"));
  } finally { d.fim(); }
  // CSS: as abas antigas não têm mais estilo próprio (valem as do segmentado); só os ganchos de largura e de alto contraste
  assert.doesNotMatch(CSS_APP, /\n\.abas \{/); assert.doesNotMatch(CSS_APP, /\n\.aba \{/); assert.doesNotMatch(CSS_APP, /\n\.abas-n \{/);
  assert.match(CSS_APP, /\.seg-op \.ic \{ width: 15px; height: 15px; \}/);
});
await teste("M05: ui.deslizar com movimento reduzido não anda com o dedo, só marca 'armado' ao passar do limiar; com movimento normal anda e marca; solta e cancela limpam", async () => {
  const gesto = (d, el, passos, id = 1) => {
    d.ev(el, "pointerdown", { pointerType: "touch", pointerId: id, clientX: 200, clientY: 100, button: 0 });
    for (const [x, y] of passos) d.ev(el, "pointermove", { pointerType: "touch", pointerId: id, clientX: x, clientY: y });
  };
  const r = comDom({ reduzido: true });
  try {
    const el = U.h("div", null, "linha"); r.doc.body.appendChild(el); const log = [];
    U.deslizar(el, { esquerda: () => log.push("E"), limiar: 60 });
    gesto(r, el, [[170, 101], [150, 101]]);
    assert.equal(el.style.getPropertyValue("transform"), "", "reduzido: o elemento não anda");
    assert.equal(el.dataset.armado, undefined, "−50 px: ainda não passou do limiar");
    r.ev(el, "pointermove", { pointerType: "touch", pointerId: 1, clientX: 120, clientY: 101 });
    assert.equal(el.dataset.armado, "1"); assert.equal(el.style.getPropertyValue("transform"), ""); assert.equal(el.dataset.deslizando, "esquerda");
    r.ev(el, "pointerup", { pointerType: "touch", pointerId: 1, clientX: 120, clientY: 101 });
    assert.deepEqual(log, ["E"], "mesmo sem andar, soltar depois do limiar aciona"); assert.equal(el.dataset.armado, undefined, "soltou: limpa");
    gesto(r, el, [[140, 100], [100, 100]], 2); r.ev(el, "pointercancel", { pointerType: "touch", pointerId: 2 });
    assert.deepEqual(log, ["E"], "cancelado não aciona"); assert.equal(el.dataset.armado, undefined);
  } finally { r.fim(); }
  const n = comDom();
  try {
    const el = U.h("div", null, "linha"); n.doc.body.appendChild(el); const log = [];
    const fim = U.deslizar(el, { direita: () => log.push("D"), limiar: 60 });
    gesto(n, el, [[230, 101]], 3);
    assert.equal(el.style.getPropertyValue("transform"), "translateX(30px)"); assert.equal(el.dataset.armado, undefined);
    n.ev(el, "pointermove", { pointerType: "touch", pointerId: 3, clientX: 260, clientY: 101 });
    assert.equal(el.style.getPropertyValue("transform"), "translateX(60px)"); assert.equal(el.dataset.armado, "1", "no limiar: armado");
    n.ev(el, "pointerup", { pointerType: "touch", pointerId: 3, clientX: 260, clientY: 101 });
    assert.deepEqual(log, ["D"]); assert.equal(el.style.getPropertyValue("transform"), ""); assert.equal(el.dataset.armado, undefined);
    fim();
  } finally { n.fim(); }
  assert.match(CSS_APP, /\.deslizavel\[data-armado="1"\] \{ box-shadow: inset 0 0 0 2px color-mix\(in srgb, var\(--c-prod\) 55%, transparent\); \}/);
});

/* ---------- M06: carregar, falhar e voltar ---------- */
await teste("M06: esqueleto — cabeçalho com a geometria do ui.cabecalho (sem rótulo por padrão; {rotulo, sub, acao} ligam e desligam), base visível sobre papel e cartão e faixa clara que varre", () => {
  const d = comDom();
  try {
    const a = U.esqueleto("inicio");
    assert.ok(a.querySelector(".sk-cab") && a.querySelector(".sk-titulo") && a.querySelector(".sk-sub-l .sk-sub") && a.querySelector(".sk-acao"));
    assert.equal(a.querySelector(".sk-rotulo-l"), null, "a tela nova não tem eyebrow: o esqueleto também não");
    const b = U.esqueleto("lista", { cabecalho: { rotulo: true, sub: false, acao: false } });
    assert.ok(b.querySelector(".sk-rotulo-l .sk-rotulo")); assert.equal(b.querySelector(".sk-sub-l"), null); assert.equal(b.querySelector(".sk-acao"), null);
    assert.equal(U.esqueleto("kanban").querySelector(".sk-cab"), null, "miolo continua sem cabeçalho");
    assert.equal(U.esqueleto("tabela", { n: 2, cabecalho: false }).querySelector(".sk-cab"), null);
  } finally { d.fim(); }
  assert.match(CSS_APP, /\.sk-rotulo-l \{[^}]*height: calc\(var\(--fs-peq\) \* 1\.35\); margin-bottom: \.3rem;/);
  assert.match(CSS_APP, /\.sk-titulo \{ height: calc\(var\(--fs-h1\) \* 1\.1\);/);
  assert.match(CSS_APP, /\.sk-sub-l \{[^}]*height: calc\(var\(--fs-corpo\) \* 1\.5\); margin-top: \.45rem;/);
  // a cor: o bloco se vê sobre o papel E sobre o cartão (≥ 1,2:1) e a faixa de brilho se distingue do bloco, nas 4 marcas claras; no escuro vale a escada de sempre
  const BRANCO_ = "#FFFFFF";
  for (const [nome, m] of Object.entries(CLARO_4)) {
    const { vars } = T.derivarTema(m);
    const base = T.misturar(vars["--c-fundo"], vars["--c-texto"], 0.11), luz = T.misturar(vars["--c-sup"], BRANCO_, 0.4);
    assert.ok(T.contraste(base, vars["--c-fundo"]) >= 1.2, `${nome}: bloco sobre o papel ${T.contraste(base, vars["--c-fundo"]).toFixed(2)}`);
    assert.ok(T.contraste(base, vars["--c-sup"]) >= 1.2, `${nome}: bloco sobre o cartão ${T.contraste(base, vars["--c-sup"]).toFixed(2)}`);
    assert.ok(T.contraste(luz, base) >= 1.1, `${nome}: a faixa clara se distingue do bloco`);
  }
  assert.match(CSS_APP, /--c-sk-base: color-mix\(in srgb, var\(--c-texto\) 11%, var\(--c-fundo\)\); --c-sk-luz: color-mix\(in srgb, var\(--c-sup\) 60%, white\);/);
  assert.match(CSS_APP, /html\[data-esquema="escuro"\] \{ --c-sk-base: var\(--c-sup-2\); --c-sk-luz: var\(--c-sup-3\);/);
  assert.match(CSS_APP, /\.sk::after \{[^}]*animation: skVarre 1\.4s linear infinite/);
  assert.match(CSS_APP, /\.sk-card \{[^}]*background: var\(--c-poco\)/);
  // a ação do cabeçalho do esqueleto cai para a linha de baixo no celular, como a do .cab real (medido no Chrome: 69,3 px em 1440, 63,6 em 768 e 117,3 em 390, iguais ao ui.cabecalho)
  assert.match(CSS_APP, /\.sk-cab \{[^}]*flex-wrap: wrap;/); assert.match(CSS_APP, /\.sk-cab-txt \{ flex: 1 1 18rem;/);
  assert.match(CSS_APP, /@media \(pointer: coarse\) \{ \.sk-acao \{ height: 44px; \} \}/);
  assert.doesNotMatch(CSS_APP, /\.sk-acao \{ display: none; \}/, "a ação do esqueleto não some no celular");
});
await teste("M06: erro de carregamento nunca mostra código técnico nem URL (http_503, servico_indisponivel, import(), Failed to fetch) e o cartão se refaz ao voltar a rede", async () => {
  for (const cod of ["http_500", "http_502", "http_503", "http_504", "http_429", "http_408", "servico_indisponivel", "sem_conexao", "tempo_esgotado"]) {
    const t = U.mensagemErro({ codigo: cod });
    assert.doesNotMatch(t, /http|_|import|fetch|\.js|https?:/i, `${cod} → ${t}`);
    assert.match(t, /[a-zà-ú]{4,} [a-zà-ú]{2,}/i, "frase em português");
  }
  assert.equal(U.mensagemErro({ codigo: "sem_acesso" }), "sem_acesso", "código de produto sem tradução passa (o shell liga o tradutor)");
  assert.equal(U.fraseDeErro("http_418"), "http_418", "só 5xx, 408 e 429 viram frase");
  const d = comDom();
  try {
    let n = 0;
    const c = U.erroCartao({ codigo: "http_503" }, () => { n++; });
    d.doc.body.appendChild(c);
    assert.doesNotMatch(c.textContent, /http|import|https?:/i); assert.match(c.textContent, /tentamos de novo sozinhos/i, "5xx é transitório: promete tentar de novo");
    d.disparar("orbita:online"); assert.equal(n, 1);
    for (const msg of ["Failed to fetch dynamically imported module: https://orbita.app/app/crm.js?v=1", "TypeError: Failed to fetch", "Load failed"]) {
      const e = U.erroCartao(new TypeError(msg), () => {}); d.doc.body.appendChild(e);
      assert.doesNotMatch(e.textContent, /https?:|import|fetch|\.js|module/i, e.textContent);
    }
  } finally { d.fim(); }
});

/* ---------- M07: desfazer com a escrita real adiada (firmar) ---------- */
await teste("M07: acaoComDesfazer({firmar}) — a escrita real só roda se o toast fechar sem desfazer; desfazer nunca firma; firmar que falha volta a tela; página fechada firma o que está pendente; fila de 3 firma a mais antiga", async () => {
  const d = comDom();
  const vivos = () => d.doc.querySelectorAll(".toast").filter(t => !t.classList.contains("saindo"));
  try {
    const log = [];
    const mk = (nome, extra = {}) => U.acaoComDesfazer({ texto: `Feito ${nome}`, aplicar: () => { log.push(`tela:${nome}`); }, reverter: () => { log.push(`volta:${nome}`); }, firmar: () => { log.push(`servidor:${nome}`); }, ms: 5000, ...extra });
    // 1) desfazer: a tela volta e o servidor nunca é tocado
    const p1 = mk("a"); await esperar(5); assert.deepEqual(log, ["tela:a"], "só a tela mudou (UI otimista)");
    achar(vivos()[0], ".toast-acao").click();
    const r1 = await p1; assert.equal(r1.estado, "desfeita"); assert.deepEqual(log, ["tela:a", "volta:a"], "desfazer não firma");
    assert.equal(achar(d.doc.body, ".toast-acao").getAttribute("title"), "Desfazer (Ctrl ou ⌘ + Z)", "a dica do atalho");
    // 2) o toast fecha por tempo: firma e resolve "mantida" depois da escrita
    log.length = 0;
    const r2 = await mk("b", { ms: 30 }); assert.equal(r2.estado, "mantida"); assert.deepEqual(log, ["tela:b", "servidor:b"], "firmou depois do tempo");
    // 3) Ctrl/⌘+Z antes do tempo = desfazer (não firma)
    log.length = 0;
    const p3 = mk("c"); await esperar(5); d.doc.body.dispatchEvent(new d.Evento("keydown", { key: "z", ctrlKey: true }));
    assert.equal((await p3).estado, "desfeita"); assert.deepEqual(log, ["tela:c", "volta:c"]);
    // 4) firmar que falha: a tela volta ao estado real, o erro é dito e o estado é "falhou"
    log.length = 0;
    const r4 = await mk("d", { ms: 30, firmar: () => { throw new Error("servidor_fora"); } });
    assert.equal(r4.estado, "falhou"); assert.equal(r4.desfeita, false); assert.ok(r4.erro); assert.deepEqual(log, ["tela:d", "volta:d"], "a tela volta ao que o servidor tem");
    assert.ok(d.doc.querySelectorAll(".toast-erro").some(t => /Não foi possível concluir/.test(t.textContent)), "avisa que não foi salvo");
    // 5) fechar o toast no X também firma; sem `firmar` o comportamento de antes não muda
    log.length = 0;
    const p5 = mk("e"); await esperar(5); achar(vivos()[0], ".toast-x").click(); const r5 = await p5;
    assert.equal(r5.estado, "mantida"); assert.deepEqual(log, ["tela:e", "servidor:e"]);
    const sem = await U.acaoComDesfazer({ texto: "x", aplicar() {}, reverter() {}, ms: 30 }); assert.equal(sem.estado, "mantida");
    // 6) a 4ª ação pendente firma a mais antiga (fila de 3)
    log.length = 0;
    const ps = ["f", "g", "h", "i"].map(n => mk(n)); await esperar(15);
    assert.ok(log.includes("servidor:f"), "a mais antiga foi firmada ao entrar a 4ª"); assert.equal(log.filter(x => x.startsWith("servidor")).length, 1);
    // 7) página fechada com ações pendentes: firma o que ficou (melhor esforço) e não repete depois
    const antes = log.filter(x => x.startsWith("servidor")).length;
    d.disparar("pagehide");
    assert.equal(log.filter(x => x.startsWith("servidor")).length, antes + 3, "g, h e i firmados ao sair");
    d.disparar("pagehide"); assert.equal(log.filter(x => x.startsWith("servidor")).length, antes + 3, "uma vez só");
    for (const t of vivos()) t.__fechar("fechado"); await Promise.all(ps.map(p => Promise.race([p, esperar(50)])));
    assert.equal(log.filter(x => x.startsWith("servidor")).length, antes + 3, "fechar os toasts depois não firma de novo");
  } finally { d.fim(); }
  assert.match(ler("ui.js"), /async function manterItem\(item\)/); assert.match(ler("ui.js"), /addEventListener\("pagehide", aoSair\)/);
});

console.log(`\n${ok} ok · ${falhas} falha(s)${avisos ? ` · ${avisos} aviso(s)` : ""}\n`);
process.exit(falhas ? 1 : 0);
