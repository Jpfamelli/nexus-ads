/* ============================================================
   NEXUS ADS — testes do painel (Node puro, sem dependências)
   node testes/painel.teste.mjs
   (a) demo → núcleo: os números conhecidos e o caminho "real"
       (linhas no formato de nx_dados) dando os mesmos números
   (b) dados.js com fetch falso: sucesso, erro com código,
       sessão inválida, rede fora, formato de cada RPC
   (c) checagem estática do HTML/CSS/JS do painel
   ============================================================ */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = join(AQUI, "..", "web");
const ler = f => readFileSync(join(WEB, f), "utf8");

let ok = 0, falhas = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log(`  ✓ ${nome}`); }
  catch (e) { falhas++; console.log(`  ✗ ${nome}\n      ${String(e && e.message || e).split("\n").join("\n      ")}`); }
}

const N = await import("../web/nucleo.js");
const { gerarDemo } = await import("../web/demo.js");
const api = await import("../web/dados.js");

/* ============================================================
   (a) DEMO → NÚCLEO
   ============================================================ */
console.log("\n(a) demo → núcleo");
const HOJE = "2026-09-27";
const dsDemo = gerarDemo({ nome: "Clínica Demonstração", hoje: HOJE });
const MD = N.montar(dsDemo);

await teste("30 dias: 106 conversas, 44 agendadas, 13 pacientes, R$ 13.550", () => {
  const c = MD.crmTot(MD.R - 29, MD.R);
  assert.deepEqual(
    { conversas: c.conversas, agendadas: c.agendadas, pacientes: c.fecharam, receita: c.receita },
    { conversas: 106, agendadas: 44, pacientes: 13, receita: 13550 });
});

await teste("demo com o nome do contrato: 'Clínica Demonstração' e relatório com o nome curto", () => {
  assert.equal(dsDemo.nome, "Clínica Demonstração");
  assert.equal(MD.NOME, "Clínica");
  assert.match(MD.relDiario(MD.R), /^📊 \*Clínica · Tráfego pago\* — 26\/09\/2026/);
});

await teste("radar da demo acusa os cenários planejados (r1 no Google urgência, r3/r4 no criativo cansado)", () => {
  const ids = MD.avaliar(MD.R, true).map(a => `${a.regra.id}:${a.chave.split("|")[1]}`).sort();
  assert.deepEqual(ids, ["r1:g3", "r3:m3b", "r4:m3b"]);
});

// O painel real monta o dataset a partir de nx_dados. Converte a demo para esse
// formato de linhas e confere que o caminho real chega aos MESMOS números.
function demoParaLinhas(ds, M) {
  const iso = i => N.isoDe(M.dataDe(i));
  const metricas = ds.LINHAS.map(l => ({
    p: l.plat, d: iso(l.i), n: "anuncio", c: l.camp, cn: ds.CAMP[l.camp].nome, a: l.cri, an: ds.CRI[l.cri].nome,
    imp: l.impressoes, alc: l.alcance, freq: l.freq || 0, cli: l.cliques, g: l.gasto, conv: l.conversoes,
  }));
  const leads = ds.LEADS.filter(L => L.i <= M.R).map(L => ({
    id: L.id, nome: L.nome, telefone: "", origem: "anuncio", plataforma: L.plat, campanha_ext: L.camp, anuncio_ext: L.cri,
    servico: L.servico, etapa: M.etapa(L), data_conversa: iso(L.i),
    data_agenda: L.iAgenda != null ? iso(L.iAgenda) : null, data_consulta: L.iConsulta != null ? iso(L.iConsulta) : null,
    valor: L.fechou ? M.valorLead(L) : null, obs: "",
  }));
  return { metricas, leads };
}

await teste("caminho real (datasetDeLinhas, 130 dias) = mesmos números da demo em 7/30/60 dias", () => {
  const { metricas, leads } = demoParaLinhas(dsDemo, MD);
  const MR = N.montar(N.datasetDeLinhas({ metricas, leads, cliente: { nome: "Clínica Demonstração", cfg: {} }, hoje: HOJE, dias: 130 }));
  for (const dias of [7, 30, 60]) {
    const a = MD.crmTot(MD.R - dias + 1, MD.R), b = MR.crmTot(MR.R - dias + 1, MR.R);
    const ta = MD.consolidar(MD.linhasDe(MD.R - dias + 1, MD.R)), tb = MR.consolidar(MR.linhasDe(MR.R - dias + 1, MR.R));
    assert.deepEqual(
      [b.conversas, b.agendadas, b.compareceram, b.fecharam, b.receita],
      [a.conversas, a.agendadas, a.compareceram, a.fecharam, a.receita], `crm em ${dias} dias`);
    assert.ok(Math.abs(ta.gasto - tb.gasto) < 1e-6 && ta.conversoes === tb.conversoes, `anúncios em ${dias} dias`);
  }
  const ra = MD.avaliar(MD.R, true).map(a => a.regra.id).sort(), rb = MR.avaliar(MR.R, true).map(a => a.regra.id).sort();
  assert.deepEqual(rb, ra, "radar");
});

await teste("cliente sem dados: montar() não quebra e não inventa números", () => {
  const M0 = N.montar(N.datasetDeLinhas({ metricas: [], leads: [], cliente: { nome: "Clínica Nova", cfg: {} }, hoje: HOJE }));
  assert.equal(M0.LINHAS.length, 0);
  const c = M0.crmTot(M0.R - 29, M0.R);
  assert.equal(c.conversas + c.agendadas + c.fecharam + c.receita, 0);
  assert.deepEqual(M0.avaliar(M0.R, true), []);
  assert.ok(Array.isArray(M0.historico()));
});

await teste("paciente manual (sem anúncio) fica no kanban mas fora do funil de anúncios", () => {
  const M1 = N.montar(N.datasetDeLinhas({
    metricas: [], cliente: { nome: "X", cfg: {} }, hoje: HOJE,
    leads: [{ id: 1, nome: "Ana", origem: "indicacao", servico: "Implante", etapa: "fechou", data_conversa: "2026-09-20", data_consulta: "2026-09-25", valor: 4000 }],
  }));
  assert.equal(M1.LEADS.length, 1);
  assert.equal(M1.LEADS[0].camp, "org:indicacao");
  assert.equal(M1.crmTot(M1.R - 29, M1.R).fecharam, 0);
  assert.equal(M1.crmTot(M1.R - 29, M1.R, { organicos: true }).receita, 4000);
});

/* ============================================================
   (b) dados.js COM FETCH FALSO
   ============================================================ */
console.log("\n(b) dados.js com fetch falso");
const chamadas = [];
const resposta = (status, corpo, tipo = "application/json") =>
  new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status, headers: { "Content-Type": tipo } });
const falso = responder => async (url, init) => { chamadas.push({ url, init, corpo: JSON.parse(init.body) }); return responder(url, init); };
const ultima = () => chamadas[chamadas.length - 1];

await teste("sucesso: POST no /rest/v1/rpc/<nome>, apikey pública, JSON, sem Authorization", async () => {
  api.usarFetch(falso(() => resposta(200, { token: "tk-1", nome: "Ana", papel: "gestor" })));
  const r = await api.entrar("ana@clinica.com", "segredo123");
  assert.deepEqual(r, { token: "tk-1", nome: "Ana", papel: "gestor" });
  const c = ultima();
  assert.equal(c.url, "https://dtjznipitihnwmcgpzqh.supabase.co/rest/v1/rpc/nx_entrar");
  assert.equal(c.init.method, "POST");
  assert.equal(c.init.headers.apikey, "sb_publishable_jy1CT7Lwi3gdPUAVSE791w_tOqYLVZr");
  assert.equal(c.init.headers["Content-Type"], "application/json");
  assert.ok(!Object.keys(c.init.headers).some(h => h.toLowerCase() === "authorization"), "não pode mandar Authorization");
  assert.deepEqual(c.corpo, { p_email: "ana@clinica.com", p_senha: "segredo123" });
});

await teste("erro do PostgREST vira Error com .codigo = message (e texto amigável)", async () => {
  api.usarFetch(falso(() => resposta(400, { code: "P0001", details: null, hint: null, message: "email_em_uso" })));
  await assert.rejects(api.criarConta({ email: "a@b.com", senha: "12345678", nome: "A" }), e => {
    assert.equal(e.codigo, "email_em_uso");
    assert.equal(e.message, "email_em_uso");
    assert.equal(e.status, 400);
    assert.match(api.mensagemErro(e), /Já existe uma conta/);
    return true;
  });
  assert.ok(!("p_codigo" in ultima().corpo), "sem código não manda p_codigo");
  api.usarFetch(falso(() => resposta(403, { message: "codigo_invalido" })));
  await assert.rejects(api.criarConta({ email: "a@b.com", senha: "12345678", nome: "A", codigo: "XYZ" }), { codigo: "codigo_invalido" });
  assert.equal(ultima().corpo.p_codigo, "XYZ");
});

await teste("sessão inválida: lança sessao_invalida e avisa o painel (volta pro login)", async () => {
  let avisos = 0, recebido = null;
  api.aoSessaoInvalida(e => { avisos++; recebido = e; });
  api.usarFetch(falso(() => resposta(401, { code: "28000", message: "sessao_invalida" })));
  await assert.rejects(api.dados("tk-velho", "uuid-1"), { codigo: "sessao_invalida" });
  assert.equal(avisos, 1);
  assert.equal(recebido.codigo, "sessao_invalida");
  assert.deepEqual(ultima().corpo, { p_token: "tk-velho", p_cliente: "uuid-1", p_dias: 130 });
  // outro erro qualquer não derruba a sessão
  api.usarFetch(falso(() => resposta(403, { message: "so_gestor" })));
  await assert.rejects(api.contasListar("tk"), { codigo: "so_gestor" });
  assert.equal(avisos, 1);
  api.aoSessaoInvalida(null);
});

await teste("rede fora → sem_conexao; resposta que não é JSON → http_<status>", async () => {
  api.usarFetch(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(api.sessao("tk"), e => e.codigo === "sem_conexao" && /internet/.test(api.mensagemErro(e)));
  api.usarFetch(falso(() => resposta(502, "<html>Bad gateway</html>", "text/html")));
  await assert.rejects(api.sessao("tk"), { codigo: "http_502" });
  assert.match(api.mensagemErro({ codigo: "coisa_nova" }), /coisa_nova/);
});

await teste("cada RPC do contrato §2 com o nome e os parâmetros certos", async () => {
  api.usarFetch(falso(() => resposta(200, { ok: true })));
  const casos = [
    [() => api.criarConta({ email: "e", senha: "s", nome: "n", codigo: "c" }), "nx_criar_conta", ["p_codigo", "p_email", "p_nome", "p_senha"]],
    [() => api.entrar("e", "s"), "nx_entrar", ["p_email", "p_senha"]],
    [() => api.sair("t"), "nx_sair", ["p_token"]],
    [() => api.sessao("t"), "nx_sessao", ["p_token"]],
    [() => api.dados("t", "c", 60), "nx_dados", ["p_cliente", "p_dias", "p_token"]],
    [() => api.leadSalvar("t", "c", { nome: "x" }), "nx_lead_salvar", ["p_cliente", "p_lead", "p_token"]],
    [() => api.clienteSalvar("t", { slug: "s", nome: "n" }), "nx_cliente_salvar", ["p_cliente", "p_token"]],
    [() => api.integracaoSalvar("t", "c", "meta", { meta_access_token: "x" }, true), "nx_integracao_salvar", ["p_ativo", "p_canal", "p_cliente", "p_cred", "p_token"]],
    [() => api.integracoesStatus("t", "c"), "nx_integracoes_status", ["p_cliente", "p_token"]],
    [() => api.contasListar("t"), "nx_contas_listar", ["p_token"]],
    [() => api.contaDefinir("t", "k", true, "clinica", ["c"]), "nx_conta_definir", ["p_aprovado", "p_clientes", "p_conta", "p_papel", "p_token"]],
    [() => api.configVer("t"), "nx_config_ver", ["p_token"]],
    [() => api.configSalvar("t", { modelo_ia: "claude-opus-5" }), "nx_config_salvar", ["p_cfg", "p_token"]],
    [() => api.executar("t", "nx-ciclo", { cliente: "c" }), "nx_executar", ["p_corpo", "p_tarefa", "p_token"]],
  ];
  for (const [chamar, nome, chaves] of casos) {
    await chamar();
    const c = ultima();
    assert.equal(c.url.split("/rpc/")[1], nome);
    assert.deepEqual(Object.keys(c.corpo).sort(), chaves, nome);
  }
  const ig = chamadas.find(c => c.url.endsWith("nx_integracao_salvar")).corpo;
  assert.equal(ig.p_ativo, true);
  assert.deepEqual(ig.p_cred, { meta_access_token: "x" });
  api.usarFetch(null);
});

await teste("token no navegador: guarda em 'nx-token', lê e apaga; sem localStorage não quebra", () => {
  const antes = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const mapa = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: k => (mapa.has(k) ? mapa.get(k) : null), setItem: (k, v) => mapa.set(k, String(v)), removeItem: k => mapa.delete(k) } });
  api.guardarToken("abc");
  assert.equal(mapa.get("nx-token"), "abc");
  assert.equal(api.lerToken(), "abc");
  api.apagarToken();
  assert.equal(api.lerToken(), null);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
  assert.equal(api.lerToken(), null);
  api.guardarToken("x");
  api.apagarToken();
  if (antes) Object.defineProperty(globalThis, "localStorage", antes); else delete globalThis.localStorage;
});

/* ============================================================
   (c) CHECAGEM ESTÁTICA
   ============================================================ */
console.log("\n(c) checagem estática do painel");
const HTML = ler("index.html"), JS = ler("painel.js"), CSS = ler("painel.css"), DADOS = ler("dados.js");
const ids = txt => new Set([...txt.matchAll(/\sid="([A-Za-z][\w-]*)"/g)].map(m => m[1]));
const idsHtml = ids(HTML), idsJs = ids(JS);

await teste("todo id usado em $(\"#…\") no painel.js existe no index.html ou é criado pelo próprio JS", () => {
  // ids montados na hora ("#ph-" + tipo, `#view-${aba}`) ficam para o teste seguinte
  const fixo = String.raw`#([A-Za-z][\w-]*)(?![\w-])(?!["'\x60]\s*\+)(?!\$\{)`;
  const usados = new Set([
    ...[...JS.matchAll(new RegExp(String.raw`\$\$?\(\s*["'\x60]` + fixo, "g"))].map(m => m[1]),
    ...[...JS.matchAll(/getElementById\(\s*["'`]([A-Za-z][\w-]*)["'`]/g)].map(m => m[1]),
    ...[...JS.matchAll(new RegExp(String.raw`closest\(\s*["'\x60]` + fixo, "g"))].map(m => m[1]),
  ]);
  const faltando = [...usados].filter(id => !idsHtml.has(id) && !idsJs.has(id));
  assert.ok(usados.size > 60, `achou só ${usados.size} ids — a expressão regular quebrou?`);
  assert.deepEqual(faltando, [], `ids sem elemento: ${faltando.join(", ")}`);
});

await teste("ids montados com prefixo (#view-, #ph-, #st-, #vazio-, #corpo-) existem para cada aba/tipo", () => {
  const abas = [...new Set([...HTML.matchAll(/data-aba="(\w+)"/g)].map(m => m[1]))];
  assert.deepEqual(abas.sort(), ["ajustes", "campanhas", "geral", "pacientes", "radar", "relatorios"]);
  for (const a of abas) {
    assert.ok(idsHtml.has(`view-${a}`), `view-${a}`);
    assert.ok(new RegExp(`\\n  ${a}: \\[`).test(JS), `ABAS.${a} no painel.js`);
  }
  for (const t of ["diario", "mensal"]) { assert.ok(idsHtml.has(`ph-${t}`) && idsHtml.has(`st-${t}`), t); }
  for (const a of ["geral", "campanhas"]) assert.ok(idsHtml.has(`vazio-${a}`) && idsHtml.has(`corpo-${a}`), a);
  for (const [, t] of HTML.matchAll(/data-copiar="(\w+)"/g)) assert.ok(idsHtml.has(`ph-${t}`), `ph-${t}`);
  for (const [, t] of HTML.matchAll(/data-copiar-el="([\w-]+)"/g)) assert.ok(idsHtml.has(t), t);
  const tour = [...JS.matchAll(/alvo: '\[data-tour="(\w+)"\]'/g)].map(m => m[1]);
  assert.equal(tour.length, 5, "tour de 5 passos");
  for (const t of tour) assert.ok(HTML.includes(`data-tour="${t}"`), `data-tour=${t}`);
});

await teste("ids únicos no index.html", () => {
  const todos = [...HTML.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const rep = todos.filter((x, i) => todos.indexOf(x) !== i);
  assert.deepEqual(rep, []);
});

await teste("aria: rótulos apontam para ids que existem (aria-labelledby/describedby, label for)", () => {
  const refs = [...HTML.matchAll(/aria-(?:labelledby|describedby|controls)="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/));
  const falt = refs.filter(r => !idsHtml.has(r));
  assert.deepEqual(falt, []);
  assert.ok(/id="gaveta"[^>]*role="dialog"[^>]*aria-modal="true"|role="dialog" aria-modal="true" aria-labelledby="gv-titulo"/.test(HTML), "gaveta é dialog modal");
  assert.equal((HTML.match(/role="radiogroup"/g) || []).length, 2);
  assert.ok(/role="switch"/.test(JS) && /aria-checked/.test(JS), "switches com role/aria-checked");
});

await teste("index.html: módulo ESM, CSS, fontes da Nexus", () => {
  assert.match(HTML, /<script type="module" src="painel\.js[^"]*"><\/script>/);
  assert.match(HTML, /<link rel="stylesheet" href="painel\.css/);
  assert.ok(HTML.includes("https://api.fontshare.com/v2/css?f[]=clash-display@600,700&f[]=satoshi@400,500,700&display=swap"));
  assert.match(HTML, /fonts\.googleapis\.com\/css2\?family=IBM\+Plex\+Mono/);
  assert.match(HTML, /<html lang="pt-BR">/);
});

await teste("CSS: [hidden] forte, movimento reduzido, cores da Nexus, sem '1fr' solto em grid", () => {
  assert.match(CSS, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  for (const c of ["#0B1B2B", "#05080C", "#B0761F", "#F5E9D6"]) assert.ok(CSS.includes(c), c);
  const soltos = [...CSS.matchAll(/grid-(?:template|auto)-columns:\s*([^;]+);/g)]
    .map(m => m[1]).filter(v => /\bfr\b|\dfr/.test(v.replace(/minmax\([^)]*\)/g, "")));
  assert.deepEqual(soltos, [], "use minmax(0, 1fr)");
});

await teste("tudo que o painel.js importa existe (nucleo, demo, dados) e M.* é do montar()", () => {
  const nomes = (mod, arq) => {
    const m = JS.match(new RegExp(`import \\{([^}]+)\\} from "\\./${arq}"`));
    return m ? m[1].split(",").map(s => s.trim()).filter(Boolean) : [];
  };
  const faltaN = nomes(N, "nucleo.js").filter(n => !(n in N));
  assert.deepEqual(faltaN, [], "nucleo.js");
  assert.ok(nomes(null, "demo.js").includes("gerarDemo"));
  const usadosApi = [...new Set([...JS.matchAll(/\bapi\.(\w+)/g)].map(m => m[1]))];
  assert.deepEqual(usadosApi.filter(n => !(n in api)), [], "dados.js");
  const usadosM = [...new Set([...JS.matchAll(/\bM\.([A-Za-z_]\w*)/g)].map(m => m[1]))];
  assert.deepEqual(usadosM.filter(n => !(n in MD)), [], "montar()");
});

await teste("plataforma (texto livre gravável pela clínica) nunca vai crua para atributo de classe", () => {
  const crus = [...JS.matchAll(/chip-\$\{(?!classePlat\()[^}]*plat[^}]*\}/g)].map(m => m[0]);
  assert.deepEqual(crus, []);
  assert.match(JS, /const classePlat = p => \(p === "meta" \|\| p === "google" \? p : "neutro"\);/);
});

await teste("sem SDK do Supabase, sem Authorization, sem import absoluto", () => {
  for (const [f, t] of [["painel.js", JS], ["dados.js", DADOS]]) {
    assert.ok(!/supabase-js|@supabase/.test(t), f);
    assert.ok(!/from\s+["'](?:[A-Za-z]:|\/)/.test(t), `${f}: import com caminho absoluto`);
  }
  assert.ok(!/Authorization/i.test(DADOS.replace(/\/\*[\s\S]*?\*\//g, "")), "dados.js não manda Authorization");
});

await teste("modo demo: somente leitura, faixa e tour de 1 minuto falando 'a senhora'", () => {
  assert.match(HTML, /Demonstração<\/b> — números ilustrativos/);
  assert.match(HTML, /Tour de 1 minuto/);
  assert.match(JS, /Clínica Demonstração/);
  assert.match(JS, /if \(S\.demo\) return erro\(/, "gaveta não salva na demo");
  assert.ok((JS.match(/a senhora|da senhora/gi) || []).length >= 1);
});

await teste("sintaxe ESM do painel.js e do dados.js (node --input-type=module --check)", () => {
  // "node --check arquivo.js" devolve 0 até para código quebrado quando o .js tem import
  // (sem package.json "type": "module"); pela entrada padrão o parser ESM é obrigatório.
  const checar = src => execFileSync(process.execPath, ["--input-type=module", "--check"], { input: src, stdio: "pipe" });
  assert.throws(() => checar('import { a } from "./x.js";\nconst b = ;\n'), "a checagem precisa pegar erro de sintaxe");
  for (const f of ["painel.js", "dados.js"]) checar(ler(f));
});

await teste("conversões (fracionadas no Google) nunca saem cruas nem com '=== 1'; 'Varrendo' concorda", () => {
  // Google Ads manda 1.5 conversão: "${p.conv}" mostrava "1.5" e "=== 1" gerava "1 conversas"
  assert.ok(!/\$\{p\.conv\}/.test(JS), "tooltip do gráfico com conversão crua");
  assert.ok(!/conversoes\s*===\s*1/.test(JS), "plural de conversões com === 1");
  assert.match(JS, /Varrendo \$\{plural\(campanhasTodas\(\), "campanha", "campanhas"\)\} e \$\{plural\(/);
  assert.equal(N.plural(1.4, "conversa", "conversas"), "1 conversa");
  assert.equal(N.plural(1, "campanha", "campanhas"), "1 campanha");
});

await teste("sessão expirada: recarga agendada é cancelada e carregarDados não roda sem token", () => {
  assert.match(JS, /function sessaoExpirou\(\) \{[\s\S]{0,300}?clearTimeout\(S\.aj\.tRecarga\)/);
  assert.match(JS, /async function carregarDados\(o = \{\}\) \{\s*const id = S\.clienteId;\s*if \(!id \|\| !S\.token\) return;/);
});

await teste("regra do radar grava com o 'ativo' atual (não reativa cliente pausado)", () => {
  assert.match(JS, /api\.clienteSalvar\(S\.token, \{ id: c\.id, slug: c\.slug, nome: c\.nome, ativo: c\.ativo !== false, cfg: parcial \}\)/);
});

await teste("CSS: chip de campanha dentro do cartão do paciente encolhe com reticências", () => {
  assert.match(CSS, /\.lead \.chip \{[^}]*max-width: 100%;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/);
});

await teste("acentos íntegros (nenhum 'Ã§'/'Ã£' de arquivo salvo no encoding errado)", () => {
  for (const [f, t] of [["index.html", HTML], ["painel.js", JS], ["painel.css", CSS], ["dados.js", DADOS]]) {
    assert.ok(!/Ã[£§¡©³ª­º]|â€/.test(t), f);
  }
});

console.log(`\n${ok} ok · ${falhas} falha${falhas === 1 ? "" : "s"}`);
process.exit(falhas ? 1 : 0);
