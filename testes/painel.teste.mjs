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
import { readFileSync, existsSync } from "node:fs";
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

await teste("sintaxe ESM do painel.js, dados.js, efeitos.js e cinema.js (node --input-type=module --check)", () => {
  // "node --check arquivo.js" devolve 0 até para código quebrado quando o .js tem import
  // (sem package.json "type": "module"); pela entrada padrão o parser ESM é obrigatório.
  const checar = src => execFileSync(process.execPath, ["--input-type=module", "--check"], { input: src, stdio: "pipe" });
  assert.throws(() => checar('import { a } from "./x.js";\nconst b = ;\n'), "a checagem precisa pegar erro de sintaxe");
  for (const f of ["painel.js", "dados.js", "efeitos.js", "cinema.js"]) checar(ler(f));
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
  for (const [f, t] of [["index.html", HTML], ["painel.js", JS], ["painel.css", CSS], ["dados.js", DADOS], ["efeitos.js", ler("efeitos.js")], ["cinema.js", ler("cinema.js")]]) {
    assert.ok(!/Ã[£§¡©³ª­º]|â€/.test(t), f);
  }
});

/* ============================================================
   (d) PLANO-SEQUÊNCIA NOTURNO — palco, câmera, marca
   ============================================================ */
console.log("\n(d) palco, câmera e marca");
const FX_SRC = ler("efeitos.js"), CINE_SRC = ler("cinema.js");
const semRoot = CSS.replace(/:root(\.noanim)?\s*\{[\s\S]*?\n\}/g, "").replace(/@supports[^{]*\{\s*:root\s*\{[\s\S]*?\}\s*\}/g, "");

await teste("?aba=<aba> na URL tem precedência sobre o #hash (capturas headless) e ?noanim/reduzido viram a flag ANIM", () => {
  assert.match(JS, /const pedido = Q\.get\("aba"\) \|\| location\.hash\.slice\(1\);/);
  assert.match(JS, /setAba\(ABAS\[pedido\] \? pedido : "geral"/);
  assert.match(JS, /const ANIM = !REDUCE;/);
});

await teste("efeitos em módulos por import() dinâmico com catch (sem eles o painel segue de pé)", () => {
  assert.match(JS, /import\("\.\/efeitos\.js[^"]*"\)\.catch\(\(\) => null\)/);
  assert.match(JS, /import\("\.\/cinema\.js[^"]*"\)[\s\S]{0,160}\.catch\(\(\) => null\)/);
  // import estático continua só de nucleo/demo/dados
  const estaticos = [...JS.matchAll(/^import [^;]*? from "([^"]+)";?$/gm)].map(m => m[1]).sort();
  assert.deepEqual(estaticos, ["./dados.js", "./demo.js", "./nucleo.js"]);
  // sem FX, os blocos nascem prontos (em-cena) e o CSS só esconde com .cena-on (posto pelo efeitos.js)
  assert.match(JS, /\$\$\("\[data-cena\]", view\)\.forEach\(b => b\.classList\.add\("em-cena"\)\)/);
  assert.match(CSS, /\.cena-on \[data-cena\]:not\(\.em-cena\) \{ opacity: 0; \}/);
  assert.match(FX_SRC, /document\.documentElement\.classList\.add\("cena-on"\)/);
});

await teste("fontes da marca locais com nomes próprios na frente da pilha; links externos só como reserva", () => {
  for (const f of ["clash-display-variable", "satoshi-variable", "ibm-plex-mono-500-latin", "ibm-plex-mono-500-latin-ext", "zodiak-variable-italic"]) {
    assert.ok(existsSync(join(WEB, "fonts", f + ".woff2")), f);
  }
  for (const n of ["Nx Clash", "Nx Satoshi", "Nx Plex", "Nx Zodiak"]) assert.match(CSS, new RegExp(`@font-face \\{ font-family: "${n}"; src: url\\("fonts/`), n);
  assert.match(CSS, /--fd: "Nx Clash", "Clash Display"/);
  assert.match(CSS, /--fb: "Nx Satoshi", "Satoshi"/);
  assert.match(CSS, /--fm: "Nx Plex", "IBM Plex Mono"/);
  assert.match(HTML, /<link rel="preload" href="fonts\/satoshi-variable\.woff2" as="font" type="font\/woff2" crossorigin>/);
  assert.match(HTML, /<link rel="preload" href="fonts\/clash-display-variable\.woff2" as="font" type="font\/woff2" crossorigin>/);
  // reserva não bloqueia nem baixa: media=print até o painel.js decidir que precisa
  assert.equal((HTML.match(/rel="stylesheet" media="print" data-reserva>/g) || []).length, 2);
  assert.match(JS, /link\[data-reserva\]/);
});

await teste("monograma N×X de verdade (símbolo inline) no menu, abertura, topo do celular e favicon", () => {
  assert.match(HTML, /<symbol id="nx-mono" viewBox="0 0 96 96">/);
  assert.ok((HTML.match(/<use href="#nx-mono"\/>/g) || []).length >= 4, "usos do monograma");
  assert.match(HTML, /class="boot-mark"[\s\S]*?class="bm-t bm-d"/);
  assert.match(HTML, /rel="icon" href="data:image\/svg\+xml,[^"]*polygon[^"]*%23CF9540/);
  assert.ok(!/<span class="sb-k"[^>]*>N<\/span>/.test(HTML), "o 'N' em quadrado saiu");
});

await teste("uma lente só: nenhuma curva nem duração solta fora do :root, nunca ease-in", () => {
  for (const t of ["--e-out", "--e-io", "--e-gaveta", "--mola", "--mola-suave", "--t-micro", "--t-ui", "--t-move", "--t-dados", "--escada"]) assert.ok(CSS.includes(t + ":"), t);
  assert.ok(!/cubic-bezier\(/.test(semRoot), "cubic-bezier fora do :root");
  const soltas = [...semRoot.matchAll(/(?:transition|animation)[\w-]*\s*:[^;}]*;/g)].map(m => m[0])
    .filter(s => /(^|[\s,(])\d*\.?\d+m?s\b/.test(s.replace(/var\([^)]*\)/g, "")));
  assert.deepEqual(soltas, [], "duração literal em transition/animation");
  const semComentario = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/\bease-in\b/.test(semComentario.replace(/ease-in-out/g, "")), "ease-in");
  assert.ok(!/ease-in-out/.test(semRoot), "ease-in-out solto");
  // ?noanim e reduzido zeram a lente
  assert.match(CSS, /:root\.noanim \{[\s\S]*?--t-dados: 0s;/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?--t-dados: 0s;/);
});

await teste("palco escuro com tokens; objetos de papel; nenhum ✓✓ azul (azul = 'lido' no WhatsApp)", () => {
  for (const t of ["--bg: #07090C", "--surface: rgba(16, 24, 33, .94)", "--vidro: rgba(20, 27, 35, .66)", "--fg: #F2E8D8", "--papel: #F3E9D8", "--papel-txt: #16212C"]) assert.ok(CSS.includes(t), t);
  assert.ok(!/✓✓/.test(CSS) && !/#3E93C4/i.test(CSS), "tique azul");
  // backdrop-filter só no herói, topbar, tabbar, gaveta (e notificação da tela bloqueada)
  const donos = [...CSS.matchAll(/([^{}]+)\{[^}]*backdrop-filter:\s*blur/g)].map(m => m[1].trim().split("\n").pop());
  for (const d of donos) assert.match(d, /card-hero|\.top\.stuck|\.tabbar|\.gaveta|\.notif/, d);
});

await teste("versões furam o cache do GitHub Pages (?v= no CSS, no JS e nos módulos dinâmicos)", () => {
  assert.match(HTML, /href="painel\.css\?v=\d+"/);
  assert.match(HTML, /src="painel\.js\?v=\d+"/);
  assert.match(JS, /import\("\.\/efeitos\.js\?v=\d+"\)/);
  assert.match(JS, /import\("\.\/cinema\.js\?v=\d+"\)/);
});

await teste("odômetro alinha os dígitos pela direita e parte do valor anterior (função pura)", async () => {
  const fx = await import("../web/efeitos.js");
  const c1 = fx.colunasOdo("106", "23").filter(c => c.d);
  assert.deepEqual(c1.map(c => [c.de, c.para]), [[0, 2], [6, 3]]);
  const c2 = fx.colunasOdo("R$ 0", "R$ 1.509");
  assert.deepEqual(c2.filter(c => c.d).map(c => c.de), [0, 0, 0, 0]);
  assert.deepEqual(c2.filter(c => !c.d).map(c => c.ch).join(""), "R$ .");
  assert.equal(c2.map(c => c.ch).join(""), "R$ 1.509", "texto final idêntico ao de fmtN");
  assert.deepEqual(fx.colunasOdo("R$ 14,24", "R$ 15,72").filter(c => c.d).map(c => c.de), [1, 4, 2, 4]);
});

await teste("câmera: blocos da visão geral entram em cena; herói com trilha, fone e conta leiga; régua única", () => {
  const geral = HTML.slice(HTML.indexOf('id="view-geral"'), HTML.indexOf('id="view-campanhas"'));
  assert.ok((geral.match(/data-cena/g) || []).length >= 7, "blocos com data-cena");
  for (const id of ["trilha", "hero-conta", "hero-fone", "kpis", "chart-leg", "chart-vivo", "mam-titulo", "mam-sub"]) assert.ok(idsHtml.has(id), id);
  assert.ok(!idsHtml.has("hero-side") && !idsHtml.has("tip"), "custo por conversa saiu do herói; #tip flutuante saiu");
  assert.match(JS, /Cada R\$ 1 \$\{S\.plat \? "em anúncio" : "investido"\} virou <b>\$\{brl\(retorno\)\}<\/b>/);
  assert.match(JS, /Chamou pelo anúncio «/, "notificação honesta: nunca texto de mensagem inventado");
  assert.match(JS, /function nomeCurto\(nome\)/);
  assert.match(JS, /new CustomEvent\("nx:dia"/);
  assert.match(HTML, /id="chart-dia" tabindex="0"/);
});

await teste("estados vazios sem emoji em destaque; esqueleto com a geometria real", () => {
  assert.ok(!/cartaoVazio\(\{ ic:/.test(JS) && !/\bic: "/.test(JS), "emoji como ícone");
  assert.match(JS, /function esqueletoHtml\(msg\)/);
  assert.match(JS, /tipo === "carregando" \? esqueletoHtml\(/);
});

await teste("palco: rAF só com a aba visível, nada no celular, um quadro com semente fixa sem animação", () => {
  assert.match(CINE_SRC, /if \(!ANIM \|\| MOVEL \|\| document\.hidden \|\| !P\.visivel\) return;/);
  assert.match(CINE_SRC, /document\.addEventListener\("visibilitychange"/);
  assert.match(CINE_SRC, /const ESCALA = \.34;/);
  assert.match(CINE_SRC, /P\.cortou/, "governador");
  assert.match(JS, /m\.semente\(t === "auth" \? 3 : 1\)/);
});

/* ============================================================
   (e) PACOTE DE RECURSOS — envios, conexão, marca, curta, folha,
       celebração, linguagem leiga, paleta, simulador
   ============================================================ */
console.log("\n(e) pacote de recursos");
const REC_CSS = ler("recursos.css");
const MODS_NOVOS = ["curta.js", "folha.js", "paleta.js", "arrastar.js", "marca.js"];
// o trecho PURO do painel.js roda aqui no Node, com horaSP/quandoSP de mentira
const { runInNewContext } = await import("node:vm");
const trechoPuro = (() => {
  const i = JS.indexOf("/* ==== PURO: início"), f = JS.indexOf("/* ==== PURO: fim ==== */");
  assert.ok(i > 0 && f > i, "marcas do trecho PURO no painel.js");
  return JS.slice(i, f);
})();
const P = runInNewContext(`${trechoPuro};({ statusEnvio, corTexto, contraste, hexValido, logoValido, canalDe, nomeRegraSrv, estadoIntegracao, simular, LEIGO, LEIGO_LINHA })`,
  { horaSP: iso => new Date(iso).toISOString().slice(11, 16), quandoSP: iso => "hoje às " + new Date(iso).toISOString().slice(11, 16), Date, Math, JSON, String, Number });

await teste("statusEnvio: ✓ enviado · ✓✓ entregue · ! não saiu — honesto e nunca azul", () => {
  const e = P.statusEnvio({ enviado_em: "2026-09-27T08:01:10Z", entregue_em: "2026-09-27T08:02:00Z" });
  assert.equal(e.k, "entregue"); assert.equal(e.tique, "✓✓"); assert.equal(e.rotulo, "entregue às 08:02");
  const s = P.statusEnvio({ enviado_em: "2026-09-27T08:01:10Z", entregue_em: null });
  assert.equal(s.tique, "✓"); assert.match(s.rotulo, /^enviado às 08:01 · entrega ainda não confirmada$/);
  // campo ausente (servidor antigo, sem entregue_em) = só enviado
  assert.equal(P.statusEnvio({ enviado_em: "2026-09-27T08:01:10Z" }).k, "enviado");
  const x = P.statusEnvio({ enviado_em: null, erro: "whatsapp não configurado" });
  assert.equal(x.k, "erro"); assert.equal(x.tique, "!"); assert.equal(x.rotulo, "não enviado");
  assert.equal(P.statusEnvio({ enviado_em: "2026-09-27T08:01:10Z", erro: "WhatsApp não entregou (código 131047)" }).rotulo, "não entregue");
  assert.equal(P.statusEnvio({ enviado_em: null }).k, "pendente");
  // o tique sai de um span gerado pelo statusEnvio; nada de ::after fixo nem azul em lugar nenhum
  assert.match(JS, /const tiqueHtml = s => \(s \? `<i class="tq tq-\$\{s\.k\}"/);
  for (const [f, t] of [["painel.css", CSS], ["recursos.css", REC_CSS]]) assert.ok(!/#3E93C4|✓✓/i.test(t.replace(/\/\*[\s\S]*?\*\//g, "")), f);
  // a demo mostra exemplos (rotulados) em Relatórios e no Radar; o modo real não inventa nada
  assert.match(JS, /exemplo: true/);
  assert.match(JS, /S\.dados = exemploDemo\(\);/);
  assert.equal((JS.match(/exemploDemo\(\)/g) || []).length, 2, "exemploDemo só é chamado na demo");
});

await teste("conexão com Meta/Google: nome próprio, estado (erro/atrasado/aguardando/ok) e volta ao normal", () => {
  const agora = Date.parse("2026-09-27T15:00:00Z"), h = n => new Date(agora - n * 36e5).toISOString();
  assert.equal(P.nomeRegraSrv({ regra: "integracao", chave: "integracao|meta" }), "Conexão com Meta");
  assert.equal(P.nomeRegraSrv({ regra: "integracao", chave: "x", mensagem: "A conexão com o Google parou" }), "Conexão com Google");
  assert.equal(P.nomeRegraSrv({ regra: "integracao", chave: "x" }), "Conexão com os anúncios");
  assert.equal(P.nomeRegraSrv({ regra: "coisa_nova" }), "Aviso do radar");
  const ok = [{ canal: "meta", ativo: true, ultimo_sync: h(.2), status: "ok — 10 linhas" }];
  assert.equal(P.estadoIntegracao(ok, [], agora).nivel, "ok");
  assert.equal(P.estadoIntegracao([{ ...ok[0], ultimo_sync: h(3) }], [], agora).nivel, "atrasado");
  assert.equal(P.estadoIntegracao([{ ...ok[0], ultimo_sync: null }], [], agora).nivel, "aguardando");
  const e = P.estadoIntegracao([{ ...ok[0], status: "erro — token expirado", ultimo_sync: h(20) }], [], agora);
  assert.equal(e.nivel, "erro"); assert.equal(e.erros[0].canal, "meta");
  const al = [{ regra: "integracao", chave: "integracao|meta", criado_em: h(1) }];
  assert.equal(P.estadoIntegracao([{ ...ok[0], ultimo_sync: h(1.5) }], al, agora).nivel, "erro", "aviso das últimas 24 h sem leitura boa depois");
  assert.equal(P.estadoIntegracao([{ ...ok[0], ultimo_sync: h(.1) }], al, agora).nivel, "ok", "voltou a ler depois do aviso");
  assert.equal(P.estadoIntegracao([], [], agora).nivel, "nenhuma");
  // topo: pílula viva (30 s, parada com a aba oculta), faixa em todas as abas, "Abrir Ajustes" só para o gestor
  for (const id of ["sync-pill", "sync-pop", "faixa-integ"]) assert.ok(idsHtml.has(id), id);
  assert.match(JS, /setInterval\(\(\) => \{ if \(!document\.hidden\) renderIntegracao\(\); \}, 30000\)/);
  assert.match(JS, /gestor\(\) \? `<button class="pill pill-ink pill-sm" type="button" data-ir="ajustes">Abrir Ajustes<\/button>`/);
  assert.match(JS, /const SIMULAR_INTEG = DEMO && Q\.get\("simular"\) === "integracao";/, "?simular só vale na demo");
});

await teste("marca da clínica: contraste pela luminância, só por textContent/img.src, nunca SVG, nunca em menu/status", () => {
  assert.equal(P.corTexto("#FFE600"), "#05080C");
  assert.equal(P.corTexto("#0E7C86"), "#FFFFFF");
  assert.equal(P.corTexto("#B0761F"), "#05080C");
  assert.ok(P.contraste("#FFE600", "#05080C") >= 4.5 && P.contraste("#0E7C86", "#FFFFFF") >= 4.5);
  assert.ok(P.hexValido("#0E7C86") && !P.hexValido("0E7C86") && !P.hexValido("#0E7C8G"));
  assert.ok(P.logoValido("data:image/png;base64,iVBORw0KGgo="));
  assert.ok(P.logoValido("https://clinica.com.br/logo.webp"));
  assert.ok(!P.logoValido("data:image/svg+xml;base64,PHN2Zz4="), "SVG não");
  assert.ok(!P.logoValido("javascript:alert(1)") && !P.logoValido("http://x.com/a.png") && !P.logoValido('https://x.com/a.png" onerror="x'));
  // ?clinica= vira texto (nunca HTML) e ?cor= só hex; gerarDemo recebe SÓ o nome
  assert.match(JS, /const CLINICA_Q = DEMO \? String\(Q\.get\("clinica"\)/);
  assert.match(JS, /\/\^\[0-9a-f\]\{6\}\$\/i\.test\(Q\.get\("cor"\)/);
  assert.match(JS, /montarDe\(gerarDemo\(\{ nome: S\.nomeDemo \}\)\);/);
  assert.ok(!/gerarDemo\(\{[^}]*cfg/.test(JS), "gerarDemo nunca recebe cfg");
  assert.match(JS, /b\.textContent = `Demonstração para \$\{CLINICA_Q\}`;/, "faixa da demo com o nome da clínica, por textContent");
  assert.match(HTML, /Demonstração<\/b> — números ilustrativos/, "o texto estático da faixa continua");
  assert.match(JS, /img\.src = logo;/);
  assert.ok(!/<img[^>]*\$\{/.test(JS), "nenhum <img> montado por string");
  // a cor da clínica só pinta objetos (selo, celular do resumo, curta, folha)
  const regras = [...REC_CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(m => /var\(--marca(-txt|-suave|-escura)?\)/.test(m[2])).map(m => m[1].trim());
  assert.ok(regras.length > 5, "a marca aparece em objetos");
  const proibidos = regras.filter(s => /\.nav-|\.side|\.tabbar|\.chip|\.st-|\.var-|\.badge|\.pill-bronze|\.btn-apresentar|\.sync-/.test(s));
  assert.deepEqual(proibidos, [], "cor da clínica em menu, CTA da Nexus ou status");
  // marca real: salva no cfg (nx_cliente_salvar), logo reduzido para ≤ 60 KB
  assert.match(JS, /await salvarCfgCliente\(\{ corMarca: mk\.cor, logoUrl: mk\.logo \|\| "" \}\);/);
  assert.match(JS, /aplicarMarca\(\{ cor: cfgC\.corMarca, logo: cfgC\.logoUrl \}\);/);
});

await teste("marca.js: cores sugeridas do logo (4 bits por canal, sem branco/preto/cinza) e limite de 60 KB", async () => {
  const mk = await import("../web/marca.js");
  assert.equal(mk.LIMITE, 60 * 1024);
  const px = [];
  const poe = (r, g, b, n, a = 255) => { for (let k = 0; k < n; k++) px.push(r, g, b, a); };
  poe(14, 124, 134, 50); poe(255, 255, 255, 300); poe(3, 3, 3, 200); poe(128, 128, 128, 200); poe(226, 176, 102, 20); poe(14, 124, 134, 99, 0);
  const cores = mk.coresSugeridas(new Uint8ClampedArray(px));
  assert.deepEqual(cores, ["#0E7C86", "#E2B066"]);
});

await teste("módulos novos entram por import() com catch; estático continua só nucleo/demo/dados; ?v= em tudo", () => {
  for (const m of MODS_NOVOS) assert.match(JS, new RegExp(`import\\("\\./${m.replace(".", "\\.")}\\?v=\\d+"\\)`), m);
  assert.match(JS, /MOD_SRC\[nome\]\(\)\.catch\(e => \{/);
  assert.match(HTML, /<link rel="stylesheet" href="recursos\.css\?v=\d+">/);
  const checar = src => execFileSync(process.execPath, ["--input-type=module", "--check"], { input: src, stdio: "pipe" });
  for (const f of MODS_NOVOS) { checar(ler(f)); assert.ok(!/Ã[£§¡©³ª­º]|â€/.test(ler(f)), f + " acentos"); }
  assert.ok(!/Ã[£§¡©³ª­º]|â€/.test(REC_CSS), "recursos.css acentos");
  // os módulos novos só importam o núcleo (nada de CDN, framework ou biblioteca)
  for (const f of MODS_NOVOS) {
    const imps = [...ler(f).matchAll(/^import [^;]*? from "([^"]+)";?$/gm)].map(m => m[1]);
    assert.ok(imps.every(i => i === "./nucleo.js"), f + ": " + imps.join(", "));
  }
});

await teste("recursos.css: uma lente só (sem curva/duração solta), nunca ease-in, grids com minmax, A4 na impressão", () => {
  const sem = REC_CSS.replace(/:root\s*\{[\s\S]*?\n\}/g, "");
  assert.ok(!/cubic-bezier\(|\blinear\(/.test(sem), "curva solta");
  const soltas = [...sem.matchAll(/(?:transition|animation)[\w-]*\s*:[^;}]*;/g)].map(m => m[0])
    .filter(s => /(^|[\s,(])\d*\.?\d+m?s\b/.test(s.replace(/var\([^)]*\)/g, "")));
  assert.deepEqual(soltas, [], "duração literal");
  assert.ok(!/\bease-in\b/.test(REC_CSS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/ease-in-out/g, "")), "ease-in");
  const fr = [...REC_CSS.matchAll(/grid-(?:template|auto)-columns:\s*([^;]+);/g)].map(m => m[1]).filter(v => /\bfr\b|\dfr/.test(v.replace(/minmax\([^)]*\)/g, "")));
  assert.deepEqual(fr, [], "use minmax(0, 1fr)");
  assert.match(REC_CSS, /@page \{ size: A4 portrait; margin: 12mm; \}/);
  assert.match(REC_CSS, /@media print \{[\s\S]*?body > :not\(#folha-modal\) \{ display: none !important; \}[\s\S]*?#folha \{ display: flex !important; width: 186mm;[\s\S]*?print-color-adjust: exact;[\s\S]*?\.bloco \{ break-inside: avoid; \}/);
  assert.ok(!/backdrop-filter/.test(REC_CSS), "backdrop-filter só no herói, topbar, tabbar e gaveta");
});

await teste("o curta: 7 cenas, créditos em ≤ 50 s, mesmos números do herói (106 · 44/29 · 13 · R$ 13.550 · R$ 5,41)", async () => {
  const ct = await import("../web/curta.js");
  assert.deepEqual(ct.CENAS.map(c => c.id), ["abertura", "anuncio", "conversa", "agenda", "cadeira", "conta", "creditos"]);
  assert.ok(ct.ATE_CREDITOS <= 50000 && ct.ATE_CREDITOS >= 35000, `créditos em ${ct.ATE_CREDITOS} ms`);
  // P = a mesma conta do numerosPeriodo() do painel (herói/régua): tratamentos ÷ (anúncios + gestão)
  assert.match(JS, /const custoTotal = t\.gasto \+ fee;\s*const retorno = S\.plat \? roas : \(custoTotal \? c\.receita \/ custoTotal : null\);/);
  assert.match(JS, /const \{ de, t, ta, c, ca, roas, retorno \} = numerosPeriodo\(\);/, "o herói usa numerosPeriodo()");
  const de = MD.R - 29, t = MD.consolidar(MD.linhasDe(de, MD.R)), c = MD.crmTot(de, MD.R);
  const custoTotal = t.gasto + MD.CFG.fee * 30 / 30;
  const P2 = { de, ate: MD.R, t, c, custoTotal, retorno: c.receita / custoTotal, dias: 30, plat: "" };
  const d = ct.dadosCurta({ M: MD, P: P2 });
  assert.deepEqual([d.conversas, d.agendadas, d.vieram, d.fecharam, d.receita], [106, 44, 29, 13, 13550]);
  assert.equal(N.brl(d.retorno).replace(/\s/g, " "), "R$ 5,41");
  assert.equal(d.lista.length, 106, "as conversas da cena 3 são as do período");
  assert.equal(ct.iniciais("Bruno C."), "B. C.");
  // estrutura: diálogo modal fora do #app; tela cheia só com gesto; ?cena=N; teclas
  assert.match(HTML, /<div class="palco-curta" id="palco-curta" role="dialog" aria-modal="true" aria-roledescription="apresentação"[^>]*hidden><\/div>/);
  assert.ok(HTML.indexOf('id="palco-curta"') > HTML.indexOf('<nav class="tabbar"'), "fora do #app");
  const CT = ler("curta.js");
  assert.match(CT, /if \(o\.gesto && \(!navigator\.userActivation \|\| navigator\.userActivation\.isActive\)\) telaCheia\(true\);/);
  assert.match(CT, /document\.getElementById\("app"\)\.inert = true;/);
  for (const k of ['"ArrowRight"', '"ArrowLeft"', '"Escape"', '(k === "f" || k === "F")', '(k === "d" || k === "D")']) assert.ok(CT.includes(k), k);
  assert.match(CT, /Chamou pelo anúncio «/, "modo real: nunca frase de paciente");
  assert.match(JS, /apresentar\(\{ cena: Number\.isFinite\(n\) \? n : 1, titulo: !Q\.has\("cena"\), gesto: false \}\);/);
  assert.match(JS, /if \(k === "p" \|\| k === "P"\)/);
});

await teste("folha do mês: os MESMOS números do resumo mensal do WhatsApp; marca d'água na demo; ?folha só mês completo", async () => {
  const fl = await import("../web/folha.js");
  const ago = MD.mesesDados().find(m => m.mes === 7 && m.completo);
  const d = fl.dadosFolha(MD, ago), txt = MD.relMensal(ago);
  assert.ok(txt.includes(`Investido em anúncios: ${N.brl0(d.t.gasto)}`), "investido");
  assert.ok(txt.includes(`Tratamentos fechados: ${N.brl0(d.c.receita)}`), "tratamentos");
  assert.ok(txt.includes(`${d.c.fecharam} pacientes fecharam`), "pacientes");
  assert.ok(txt.includes(`vistos ${N.int(d.t.impressoes)} vezes`), "vezes na tela");
  const FL = ler("folha.js");
  assert.match(FL, /DEMONSTRAÇÃO · números ilustrativos/);
  assert.match(FL, /document\.title = `Resultados \$\{MESES\[m\.mes\]\} \$\{m\.ano\} — \$\{ctx\.nome\}`;/);
  assert.match(FL, /await document\.fonts\.ready/);
  assert.ok(!/<canvas|getContext/.test(FL), "gráficos em SVG, nunca canvas");
  assert.match(JS, /const meses = M\.mesesDados\(\)\.filter\(m => m\.completo\);/);
  assert.match(HTML, /<article class="folha" id="folha" hidden><\/article>/);
});

await teste("fechou: arrastar/teclado com a mesma gravação; celebração antes da guarda literal da demo (nota neutra)", () => {
  assert.match(JS, /if \(S\.demo\) return erro\("Demonstração: nada foi salvo[^"]*", \{ tom: "nota" \}\);/);
  assert.ok(JS.indexOf("depoisDeMover(L, antes);\n    fecharGaveta();") < JS.indexOf('if (S.demo) return erro("Demonstração'), "celebra ANTES da guarda");
  assert.match(JS, /if \(agora === "fechou" && antes\.etapa !== "fechou"\) celebrar\(L\);/);
  assert.match(JS, /api\.leadSalvar\(S\.token, S\.clienteId, p\)/);
  assert.match(JS, /\{ rotulo: "Desfazer", fn:/);
  for (const id of ["celebra", "menu-parou", "k-dica", "k-vivo"]) assert.ok(idsHtml.has(id), id);
  const CI = ler("cinema.js"), AR = ler("arrastar.js");
  assert.match(CI, /export function faiscas\(r\) \{\s*if \(!ANIM \|\| !r \|\| document\.hidden\) return;/);
  assert.match(CI, /length: 24/);
  assert.match(CI, /if \(vivas && t < 1400 && !document\.hidden\) requestAnimationFrame\(passo\); else cv\.remove\(\);/);
  assert.match(AR, /Math\.max\(-7, Math\.min\(7,/, "inclinação limitada a ±7°");
  assert.match(AR, /if \(!api\.fino \|\| e\.button !== 0 \|\| e\.pointerType === "touch"/, "arrasto só com mouse/caneta");
  assert.match(AR, /Espaço pega/);
});

await teste("linguagem leiga: dicionário LEIGO/rot(); a clínica lê 'Conversa ficando cara'; o gestor vê o técnico com o leigo no title", () => {
  assert.deepEqual([P.LEIGO.r1[1], P.LEIGO.r2[1], P.LEIGO.r3[1], P.LEIGO.r4[1]],
    ["Conversa ficando cara", "Anúncio sem nenhuma conversa", "Anúncio que pouca gente toca", "Anúncio cansado (visto demais)"]);
  assert.equal(P.LEIGO["ritmo.titulo"][1], "Orçamento do mês");
  assert.equal(P.LEIGO.impressoes[1], "vezes na tela");
  for (const [tec, leigo] of Object.values(P.LEIGO)) assert.ok(!/\b(CTR|ROAS|CPA|CPM|impress)/i.test(leigo), leigo);
  for (const l of Object.values(P.LEIGO_LINHA)) assert.ok(!/\b(CTR|ROAS|CPA|CPM|impress)/i.test(l), l);
  assert.match(JS, /const rot = k => \{ const e = LEIGO\[k\]; return !e \? k : gestor\(\) \? e\[0\] : e\[1\]; \};/);
  assert.match(JS, /gestor\(\) \? `<span title="\$\{esc\(e\[1\]\)\}">\$\{esc\(e\[0\]\)\}<\/span>`/);
  // as mensagens do núcleo não mudam: a linha leiga vai ACIMA delas
  assert.match(JS, /<p class="al-leigo">\$\{esc\(LEIGO_LINHA\[id\]\)\}<\/p>`[^`]*: ""\}<p class="al-m">\$\{esc\(a\.msg\)\}<\/p>/);
});

await teste("paleta (Ctrl/⌘+K): começo do texto > início de palavra > contém, sem acento; nunca telefone", async () => {
  const pl = await import("../web/paleta.js");
  const itens = [{ nome: "Gabriela B." }, { nome: "Bruno C." }, { nome: "Ana Bruna" }, { nome: "Otávio Abrunhosa" }, { nome: "60 dias" }, { nome: "Campanha 60" }];
  assert.deepEqual(pl.rankear("bru", itens).map(i => i.nome), ["Bruno C.", "Ana Bruna", "Otávio Abrunhosa"]);
  assert.equal(pl.rankear("60", itens)[0].nome, "60 dias");
  assert.equal(pl.pontuar("ota", "Otávio"), 3);
  assert.equal(pl.pontuar("avi", "Otávio"), 1);
  assert.equal(pl.pontuar("rev", "Remarketing · visitou o site"), 0);
  const PL = ler("paleta.js");
  assert.match(PL, /role", "dialog"/); assert.match(PL, /role="combobox"/); assert.match(PL, /aria-activedescendant/); assert.match(PL, /role="listbox"/);
  assert.match(PL, /localStorage\.getItem\(CHAVE_REC\)/); assert.match(PL, /const CHAVE_REC = "nx-recentes";/);
  assert.ok(!/telefone/.test(JS.slice(JS.indexOf("async function abrirPaleta"), JS.indexOf("let arrastoOk"))), "a paleta não leva telefone");
  // atalhos fora de campo de texto
  assert.match(JS, /emCampo = !!\(t && t\.closest && t\.closest\("input, select, textarea, \[contenteditable\]"\)\)/);
});

await teste("simulador só na demo, em faixa de ±20% com as taxas do período, com a frase fixa", () => {
  const r = JSON.parse(JSON.stringify(P.simular({ cpa: 15, ag: .4, veio: .7, fe: .45 }, 3000, 1000)));
  assert.deepEqual(r.conversas, [160, 240]);
  assert.deepEqual(r.pacientes, [20, 31]);
  assert.deepEqual(r.tratamentos, [20100, 30300]);
  assert.match(JS, /if \(!S\.demo\) \{ const sim = \$\("#card-sim"\); if \(sim\) sim\.remove\(\); \}/, "no modo real o simulador sai do DOM");
  assert.match(JS, /Estimativa com as taxas desta demonstração\. Não é promessa: cada clínica tem o seu ritmo\./);
});

await teste("gaveta: cartão do anúncio de origem e fita de 4 fotogramas; marcos (claquetes) no gráfico; 'desde a última visita'", () => {
  assert.ok(idsHtml.has("gv-fita") && idsHtml.has("gv-origem-info") && idsHtml.has("marco-form") && idsHtml.has("desde-visita"));
  assert.match(JS, /\{ t: "Chamou", q: dia\(L\.i\)/);
  assert.match(JS, /\{ t: "Fechou", q: fechou \? brl0\(M\.valorLead\(L\)\) : null/);
  assert.match(JS, /const MARCOS_DEMO = \[/);
  assert.match(JS, /await salvarCfgCliente\(\{ marcos: lista\.slice\(-40\) \}\);/);
  assert.match(JS, /maxlength="60"/);
  assert.match(JS, /if \(!gestor\(\) \|\| i == null\) \{ f\.hidden = true; return; \}/, "clínica só lê os marcos");
  assert.match(JS, /const chaveVistos = \(\) => `nx-fechados-\$\{S\.clienteId\}`;/);
  assert.match(JS, /if \(S\.demo \|\| gestor\(\) \|\| !S\.clienteId \|\| !M\) \{ box\.hidden = true; return; \}/);
  assert.match(JS, /try \{ const s = localStorage\.getItem\(chaveVistos\(\)\); vistos = s \? JSON\.parse\(s\) : null; \} catch \{ box\.hidden = true; return; \}/);
});

console.log(`\n${ok} ok · ${falhas} falha${falhas === 1 ? "" : "s"}`);
process.exit(falhas ? 1 : 0);
