/* ============================================================
   ÓRBITA — plano 2000d (25/10/2026), frente classico (painel clássico + nucleo.js)
   node --test testes/plano2000d-classico.teste.mjs      (Node puro, sem rede e sem navegador)
   (a) nucleo.js — a matemática e os textos do WhatsApp (também rodam nas Edge Functions)
   (b) painel.js — bloco PURO num contexto vm + peças de tela conferidas pela fonte
   (c) folha.js, dados.js, demo.js, painel.css, index.html
   Datas relativas ao relógio (hojeSP); quando o teste precisa de um dia do mês certo, o «hoje» do dataset é fixo.
   Cada teste falharia no código anterior ao lote.
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ler = f => readFileSync(join(RAIZ, f), "utf8").replace(/\r\n/g, "\n");
const PJS = ler("web/painel.js"), CSS = ler("web/painel.css"), HTML = ler("web/index.html"), FJS = ler("web/folha.js"), DJS = ler("web/dados.js"), DEMO = ler("web/demo.js");

const N = await import("../web/nucleo.js");

/* ---------- fixtures ---------- */
const NBSP = String.fromCharCode(160);
const HOJE = N.hojeSP();
const dia = n => { const d = N.meioDia(HOJE); d.setDate(d.getDate() - n); return N.isoDe(d); };
const cli = (cfg = {}, extra = {}) => ({ id: "c1", slug: "x", nome: "Clínica Teste", cfg, ...extra });
const montarDe = (o = {}, cfg = {}, extra = {}) => N.montar(N.datasetDeLinhas({ metricas: [], leads: [], cliente: cli(cfg, extra), hoje: HOJE, dias: 130, ...o }));
const metrica = (d, o = {}) => ({ p: "meta", d, n: "anuncio", c: "C1", cn: "Campanha teste", a: "A1", an: "Anúncio teste",
  imp: 1000, alc: 800, freq: 1.2, cli: 30, g: 30, conv: 2, ...o });
const serie = (de, ate, o = {}) => Array.from({ length: ate - de + 1 }, (_, k) => metrica(dia(de + k), typeof o === "function" ? o(de + k) : o));
const leadF = (d, o = {}) => ({ id: Math.random(), nome: "Ana", origem: "anuncio", plataforma: "meta", campanha_ext: "C1", anuncio_ext: "A1",
  etapa: "fechou", data_conversa: d, data_agenda: d, data_consulta: d, valor: null, servico: null, ...o });
/** dataset com «hoje» fixo (para dia do mês certo) */
const diaDe = (hoje, n) => { const d = N.meioDia(hoje); d.setDate(d.getDate() - n); return N.isoDe(d); };
const comHoje = (hoje, o = {}, cfg = {}) => N.montar(N.datasetDeLinhas({ metricas: [], leads: [], cliente: cli(cfg), hoje, dias: 70, ...o }));
const serieAbs = (hoje, de, ate, o = {}) => Array.from({ length: ate - de + 1 }, (_, k) => metrica(diaDe(hoje, de + k), typeof o === "function" ? o(de + k) : o));
const fonte = (src, re, msg) => assert.ok(re.test(src), msg || String(re));
const ultimoMes = M => M.mesesDados().filter(m => m.completo).pop();

/* ================= (a) nucleo.js ================= */
test("DS-104/DA-076/DA-027 · moeda sem Intl: igual em qualquer runtime, sem espaço fino e sem «-R$ 0,00»", () => {
  assert.equal(N.formatarReais(1234.5), `R$${NBSP}1.234,50`);
  assert.equal(N.brl(1234.5), (1234.5).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "mesmo texto do Intl do Node");
  assert.equal(N.brl0(1234567.4), `R$${NBSP}1.234.567`);
  assert.equal(N.brl(-1234.5), `-R$${NBSP}1.234,50`);
  assert.equal(N.brl(-0.001), `R$${NBSP}0,00`, "antes: «-R$ 0,00»");
  assert.equal(N.brl0(-0.4), `R$${NBSP}0`);
  assert.doesNotMatch(N.brl(999999.99), new RegExp(String.fromCharCode(0x202f)));
  assert.equal(N.brl(null), "—");
  fonte(ler("web/nucleo.js"), /export const brl = v => formatarReais\(v, 2\);/, "brl sem toLocaleString");
});

test("DA-001/DA-377 · valor de negócio em texto: «1.200,50» vira 1200,5; «abc» é descartado e contado", () => {
  assert.equal(N.numeroSeguro("1.200,50"), 1200.5);
  assert.equal(N.numeroSeguro("R$ 1.200"), 1200);
  assert.equal(N.numeroSeguro("1200.5"), 1200.5);
  assert.equal(N.numeroSeguro("abc"), null);
  assert.equal(N.numeroSeguro(""), null);
  const M = montarDe({ metricas: serie(1, 3), leads: [leadF(dia(1), { valor: "abc" }), leadF(dia(1), { valor: "1.200,50" })] });
  const c = M.crmTot(M.R - 6, M.R);
  assert.ok(Number.isFinite(c.receita), "antes: NaN");
  assert.equal(c.receita, 1200.5);
  assert.equal(M.avisos.valorInvalido, 1);
});

test("DA-002 · valor negativo é estorno: fora da receita, em «estornos», e o mensal mostra a receita líquida", () => {
  const M = montarDe({ metricas: serie(1, 3), leads: [leadF(dia(1), { valor: 1000 }), leadF(dia(1), { valor: -300 })] });
  const c = M.crmTot(M.R - 6, M.R);
  assert.equal(c.receita, 1000, "antes: 700");
  assert.equal(c.estornos, 300);
  const M2 = montarDe({ metricas: serie(1, 3), leads: [leadF(dia(1), { valor: -300 })] });
  assert.ok(M2.crmTot(M2.R - 6, M2.R).receita >= 0);
});

test("DA-003 · valor 0 é «sem valor»: usa o ticket configurado ou conta como fechamento sem valor", () => {
  const sem = montarDe({ metricas: serie(1, 3), leads: [leadF(dia(1), { valor: 0 })] });
  assert.equal(sem.crmTot(sem.R - 6, sem.R).semValor, 1, "antes: venda de R$ 0 com «valor conhecido»");
  const com = montarDe({ metricas: serie(1, 3), leads: [leadF(dia(1), { valor: 0, servico: "Implante" })] }, { ticket: { implante: 3000 } });
  const c = com.crmTot(com.R - 6, com.R);
  assert.equal(c.receitaEstimada, 3000);
});

test("DA-004 · divergência campanha × anúncios exposta por campanha", () => {
  const M = montarDe({ metricas: [metrica(dia(1), { g: 50 }), { p: "meta", d: dia(1), n: "campanha", c: "C1", cn: "Campanha teste", g: 30, imp: 0, cli: 0, conv: 0 }] });
  const d = M.divergenciasPorCampanha();
  assert.equal(d["meta:C1"].dias, 1);
  assert.equal(Math.round(d["meta:C1"].diferenca), 20);
});

test("DA-005 · a dica «para o próximo mês» casa o serviço sem acento/caixa/espaço", () => {
  const hoje = "2026-10-03";
  const mets = serieAbs(hoje, 1, 60);
  const M = comHoje(hoje, { metricas: mets, leads: [leadF("2026-09-10", { valor: 900, servico: "Clareamento " })] }, { proximos: { clareamento: "• Dica do clareamento." } });
  const t = M.relMensal(M.mesesDados().find(m => m.mes === 8));
  assert.match(t, /• Dica do clareamento\./, "antes: a chave crua «Clareamento » não achava a dica");
});

test("DA-006/DA-375 · silenciar o «ritmo acima» não cala o «orçamento esgotado»", () => {
  const hoje = "2026-03-13";
  const M = comHoje(hoje, { metricas: serieAbs(hoje, 1, 40, { g: 10 }) }, { orcamento: 100, silenciados: { ritmo: { desde: "2026-03-01", ate: "2026-03-30" } } });
  const r = M.avaliar(M.R, true).find(a => a.regra.id === "ritmo");
  assert.ok(r, "antes: a chave «ritmo» silenciada escondia também o esgotado");
  assert.equal(r.tipo, "esgotado");
  assert.equal(r.chave, "ritmo:esgotado");
});

test("DA-007 · «orçamento acabou» só no dia em que cruza (e a cada 10% a mais), não todo dia", () => {
  const hoje = "2026-03-13";   // ontem = 12/03, gasto 1.200 até 11/03 = 1.100
  // cruzou ontem: 1.200 / 1.050 = 114% (degrau 1) e anteontem 1.100 / 1.050 = 104,8% (degrau 0) → avisa
  const M = comHoje(hoje, { metricas: serieAbs(hoje, 1, 40, { g: 100 }) }, { orcamento: 1050 });
  assert.ok(M.avaliar(M.R, true).some(a => a.tipo === "esgotado"));
  // já esgotado e ontem quase sem gasto: 1.101 e 1.100 sobre 1.000 ficam no mesmo degrau (110%) → quieto
  const quieto = comHoje(hoje, { metricas: serieAbs(hoje, 1, 40, n => ({ g: n === 1 ? 1 : 100 })) }, { orcamento: 1000 });
  assert.equal(quieto.avaliar(quieto.R, true).filter(a => a.tipo === "esgotado").length, 0, "antes: repetia todo dia");
  const parado = comHoje(hoje, { metricas: serieAbs(hoje, 2, 40, { g: 100 }) }, { orcamento: 500 });
  assert.equal(parado.avaliar(parado.R, true).filter(a => a.tipo === "esgotado").length, 0, "antes: repetia todo dia até o fim do mês");
});

test("DA-008 · cliente que começou no dia 15: projeção pelos dias com anúncio e «desde 15/mm»", () => {
  const hoje = "2026-03-25";   // ontem = 24/03; anúncios desde 15/03 (10 dias) a R$ 100
  const M = comHoje(hoje, { metricas: serieAbs(hoje, 1, 10, { g: 100 }) }, { orcamento: 3000 });
  const m = M.ritmoMes(M.R);
  assert.equal(m.desde, 15);
  assert.equal(Math.round(m.proj), 1000 + 100 * 7, "antes: 1.000 ÷ 24 × 31 ≈ 1.292");
  assert.match(M.relDiario(M.R), /Projeção contada desde 15\/03/);
});

test("DA-009 · com pausa nos dias fechados, a projeção só soma os dias abertos que faltam", () => {
  const hoje = "2026-03-25";
  const ms = serieAbs(hoje, 1, 30, n => ({ g: N.meioDia(diaDe(hoje, n)).getDay() === 0 ? 0 : 100 }));   // domingo pausado
  const sem = comHoje(hoje, { metricas: ms }, { diasFechados: [0] });
  const com = comHoje(hoje, { metricas: ms }, { diasFechados: [0], pausaDiasFechados: true });
  assert.ok(com.ritmoMes(com.R).proj < sem.ritmoMes(sem.R).proj, "antes: domingos parados entravam na projeção");
  assert.equal(com.ritmoMes(com.R).diasAbertosRestantes, 6);   // 25–31/03/2026: um domingo (29)
});

test("DA-010/DA-011/DA-376 · r5 por plataforma: Google zerou com a Meta firme → alerta dizendo «Google»", () => {
  const ms = [...serie(1, 10, { g: 200, conv: 5 }), ...serie(2, 10, { p: "google", c: "G1", cn: "Busca", a: "GA", g: 40, conv: 1 })];
  const M = montarDe({ metricas: ms });
  const a = M.avaliar(M.R).find(x => x.regra.id === "r5");
  assert.ok(a, "antes: a soma da conta caía só 17% e nada disparava");
  assert.equal(a.chave, "r5|google");
  assert.match(a.msg, /Google caiu de R\$\s40,00 por dia/);
});

test("DA-014 · média do diário divide pelos dias com número e some com menos de 4 dias", () => {
  const M = montarDe({ metricas: serie(1, 3) });
  assert.doesNotMatch(M.relDiario(M.R), /média dos 7 dias anteriores/, "antes: (30+30)/7 = R$ 8,57");
  const M2 = montarDe({ metricas: serie(1, 6) });
  assert.match(M2.relDiario(M2.R), /média dos 7 dias anteriores: R\$\s30,00/, "antes: 150 ÷ 7");
});

test("DA-015/DA-374 · diário de dia fechado explica o zero", () => {
  const ontem = N.meioDia(dia(1)).getDay();
  const M = montarDe({ metricas: serie(2, 10) }, { diasFechados: [ontem] });
  assert.match(M.relDiario(M.R).split("\n")[1], /Dia sem atendimento \(empresa fechada\)/);
});

test("DA-016 · «🔴 Pior» só acima da meta; dentro da meta é «Mais cara (dentro da meta)»", () => {
  const ms = [...serie(1, 7, { g: 10, conv: 1 }), ...serie(1, 7, { c: "C2", cn: "Outra", a: "A2", g: 14, conv: 1 })];
  const t = montarDe({ metricas: ms }, { cpaAlvo: 15 }).relDiario(N.montar ? 129 : 0);
  assert.doesNotMatch(t, /🔴 Pior/, "antes: a última era sempre «Pior»");
  assert.match(t, /Mais cara \(dentro da meta\): Outra/);
  const t2 = montarDe({ metricas: ms }, { cpaAlvo: 12 }).relDiario(129);
  assert.match(t2, /🔴 Pior: Outra/);
});

test("DA-017 · fechado no fim de semana: segunda não traz «parou de investir»", () => {
  // o sábado e o domingo antes de «hoje» ficam sem gasto e marcados como fechados
  const hoje = "2026-10-19";   // segunda; ontem = domingo 18, sábado 17
  const ms = serieAbs(hoje, 3, 20, { g: 30 });
  const M = comHoje(hoje, { metricas: ms }, { diasFechados: [0, 6] });
  assert.equal(M.campanhasParadas(M.R).length, 0, "antes: «Parou de investir» toda segunda");
  const M2 = comHoje(hoje, { metricas: ms });
  assert.equal(M2.campanhasParadas(M2.R).length, 1);
  const M3 = comHoje(hoje, { metricas: ms }, { marcos: [{ d: "2026-10-17", t: "Pausamos a Campanha teste" }] });
  assert.equal(M3.campanhasParadas(M3.R).length, 0, "pausa anotada");
});

test("DA-018/DA-019/DA-020/DA-021 · semanal: linha por plataforma, «cada R$ 1 virou», melhor/pior e assinatura", () => {
  const ms = [...serie(1, 14, { g: 10, conv: 1 }), ...serie(1, 14, { p: "google", c: "G1", cn: "Busca", a: "GA", g: 40, conv: 1 }),
    ...serie(1, 14, { c: "C2", cn: "Outra", a: "A2", g: 30, conv: 1 })];
  const M = montarDe({ metricas: ms, leads: [leadF(dia(1), { valor: 2000 })] });
  const t = M.relSemanal(M.R);
  assert.match(t, /• Meta: R\$\s280 → 14 conversas \(R\$\s20,00 cada\)/);
  assert.match(t, /• Google: R\$\s280 → 7 conversões \(R\$\s40,00 cada\)/);
  assert.match(t, /Cada R\$ 1 em anúncio virou \*R\$\s3,57\*/);
  assert.match(t, /🟢 Melhor: Campanha teste/);
  assert.match(t, /Equipe Nexus · gestão de tráfego/, "assinatura padrão para cliente Nexus");
  assert.doesNotMatch(montarDe({ metricas: ms }, { assinatura: "" }).relSemanal(129), /Equipe Nexus/, "vazio = sem assinatura");
  assert.doesNotMatch(t, /dia anterior zerado/);
});

test("DA-022 · mensal com Meta e Google: custo de cada plataforma e custo por contato do CRM", () => {
  const hoje = "2026-10-03";
  const ms = [...serieAbs(hoje, 1, 60, { g: 10, conv: 1 }), ...serieAbs(hoje, 1, 60, { p: "google", c: "G1", cn: "Busca", a: "GA", g: 40, conv: 1 })];
  const M = comHoje(hoje, { metricas: ms, leads: [leadF("2026-09-10", { etapa: "nova" })] });
  const t = M.relMensal(M.mesesDados().find(m => m.mes === 8));
  assert.match(t, /\(Meta: R\$\s10,00 por conversa · Google: R\$\s40,00 por conversão\)/, "antes: custo médio R$ 25 misturando os dois");
  assert.match(t, /🧲 1 contato no CRM vindos de anúncio · R\$\s1\.500,00 por contato/);
});

test("DA-023 · top criativos: o resultado barato com volume vence o que só gastou mais (e mostra o custo)", () => {
  const hoje = "2026-10-03";
  const ms = [...serieAbs(hoje, 1, 60, { a: "A1", an: "Caro", g: 80, conv: 1 }), ...serieAbs(hoje, 1, 60, { a: "A2", an: "Barato", g: 5, conv: 0.5 })];
  const M = comHoje(hoje, { metricas: ms });
  const top = M.topCriativos(M.mesesDados().find(m => m.mes === 8));
  assert.equal(top[0].k.nome, "Barato", "antes: «Caro» (mais conversões porque gastou 16×)");
});

test("DA-024/DA-383/DA-384 · contexto da IA: marcos, dias fechados, top 15 campanhas e números já formatados", () => {
  const ms = Array.from({ length: 20 }, (_, k) => metrica(dia(1), { c: `C${k}`, cn: `Camp ${k}`, a: `A${k}`, g: 10 + k }));
  const M = montarDe({ metricas: ms }, { diasFechados: [0], marcos: [{ d: dia(3), t: "Troca de criativo" }] });
  const ctx = M.contextoIA(M.R);
  assert.equal(ctx.campanhas_7d.length, 15);
  assert.equal(ctx.campanhas_7d[0].nome, "Camp 19");
  assert.equal(ctx.outras_campanhas_7d.quantidade, 5);
  assert.deepEqual(ctx.dias_fechados, ["domingo"]);
  assert.equal(ctx.marcos_30d[0].o_que, "Troca de criativo");
  assert.match(ctx.textos.investido_7d, /^R\$\s/);
});

test("DA-025 · tolerância do r1 configurável (padrão 35%)", () => {
  assert.equal(N.toleranciaR1({}), 35);
  assert.equal(N.toleranciaR1({ radar: { toleranciaR1: 60 } }), 60);
  assert.equal(N.toleranciaR1({ radar: { toleranciaR1: 500 } }), 35, "fora da faixa vale o padrão");
  const ms = serie(1, 14, { g: 36, conv: 2 });   // R$ 18 por conversa, meta 12: +50%
  assert.ok(montarDe({ metricas: ms }, { cpaAlvo: 12 }).avaliar(129).some(a => a.regra.id === "r1"));
  assert.ok(!montarDe({ metricas: ms }, { cpaAlvo: 12, radar: { toleranciaR1: 60 } }).avaliar(129).some(a => a.regra.id === "r1"), "antes: 35% fixo");
});

test("DA-028/DA-029 · prévia do WhatsApp: ~tachado~, ```mono``` e link clicável", () => {
  const h = N.waHtml("~velho~ e ```R$ 10``` em https://exemplo.com/x?a=1.");
  assert.match(h, /<s>velho<\/s>/);
  assert.match(h, /<code>R\$ 10<\/code>/);
  assert.match(h, /<a href="https:\/\/exemplo\.com\/x\?a=1" target="_blank" rel="noopener noreferrer">/);
  assert.doesNotMatch(N.waHtml("<script>x</script>"), /<script>/);
});

test("DA-030/DA-032 · alertas: nome da campanha com teto e alertas da mesma campanha num item só", () => {
  const nomeLongo = "[ABC] Campanha de conversão no WhatsApp para implantes e próteses região norte 2026";
  const ms = serie(1, 14, { cn: nomeLongo, g: 60, conv: 1, cli: 1, imp: 1000 });
  const M = montarDe({ metricas: ms }, { cpaAlvo: 15 });
  const al = M.avaliar(M.R);
  const r1 = al.find(a => a.regra.id === "r1");
  assert.ok(r1 && r1.msg.length < nomeLongo.length + 60, "antes: o nome inteiro na mensagem");
  const t = M.textoAlerta(al);
  const camp = al.filter(a => a.camp === "meta:C1");
  if (camp.length > 1) assert.match(t, /avisos:\n {3}– /);
  assert.ok(al.every(a => a.regra.nivel !== "campanha" || a.camp), "o alerta leva a campanha");
});

test("DA-031 · texto do radar nunca passa do limite do WhatsApp", () => {
  const M = montarDe({ metricas: serie(1, 3) });
  const muitos = Array.from({ length: 3 }, (_, k) => ({ sev: "alerta", msg: "x".repeat(2000) + k, acao: "faça" }));
  const t = M.textoAlerta(muitos);
  assert.ok(t.length <= N.LIMITE_WA, `antes: ${t.length}`);
  assert.match(t, /e mais \d+ ite/);
});

test("DA-037 · fevereiro de ano bissexto: 29 dias no ritmo", () => {
  const M = comHoje("2028-03-01", { metricas: serieAbs("2028-03-01", 1, 30) });
  const m = M.ritmoMes(M.R);
  assert.equal(m.diasMes, 29);
  assert.equal(m.pass, 29);
  assert.equal(m.restam, 0);
});

test("DA-038 · diário diz quanto falta do orçamento e quanto dá por dia", () => {
  const hoje = "2026-03-21";
  const M = comHoje(hoje, { metricas: serieAbs(hoje, 1, 40, { g: 50 }) }, { orcamento: 3000 });
  assert.match(M.relDiario(M.R), /• Restam R\$\s2\.000 para 11 dias \(≈ R\$\s182\/dia\)/);
});

test("DA-039/DA-040 · mensal: «Foram N conversas, X a mais que em …» e aviso de mês mais curto", () => {
  const hoje = "2026-04-03";   // março (31) × fevereiro (28)
  const ms = serieAbs(hoje, 1, 70, n => (N.meioDia(diaDe(hoje, n)).getMonth() === 2 ? { conv: 3 } : { conv: 2 }));
  const M = comHoje(hoje, { metricas: ms });
  const t = M.relMensal(M.mesesDados().find(m => m.mes === 2));
  assert.match(t, /Foram 93 conversas, 37 a mais que em fevereiro\. _\(março teve 3 dias a mais\)_/);
});

test("DA-043 · funil da campanha com a coorte (contatos do período e as vendas deles até hoje)", () => {
  const M = montarDe({ metricas: serie(1, 40), leads: [leadF(dia(35), { data_agenda: dia(20), data_consulta: dia(5), valor: 500 })] });
  const f = M.funilCampanha("meta:C1", M.R - 29 - 10, M.R - 25);
  assert.equal(f.fecharam, 0, "pela data do evento: fechou fora da janela");
  assert.equal(f.coorte.fecharam, 1);
  assert.equal(f.coorte.receita, 500);
});

test("DA-045/DA-046 · encurtar não parte emoji; sufixo societário sai do nome da empresa", () => {
  const FAM = String.fromCodePoint(0x1F468, 0x200D, 0x1F469, 0x200D, 0x1F467);   // família (emoji com junções)
  const s = N.encurtar(`Promo ${FAM} família feliz`, 8);
  assert.ok(!/[\uD800-\uDBFF]$/.test(s.replace("…", "")), "antes: metade de um emoji no fim");
  assert.equal(N.encurtar(FAM + FAM + FAM, 2), `${FAM}…`);
  assert.equal(N.nomeCurtoEmpresa("Sorriso ME"), "Sorriso");
  assert.equal(N.nomeCurtoEmpresa("Auto Center Silva Ltda"), "Auto Center Silva");
  assert.equal(N.nomeCurtoEmpresa("Loja Bela S.A."), "Loja Bela");
  assert.equal(N.nomeCurtoEmpresa("Oficina EIRELI"), "Oficina");
});

test("DA-049 · silêncio com hora no «ate» vale até o fim daquele dia", () => {
  assert.deepEqual(N.silencioDe({ silenciados: { r1: { ate: "2026-10-25T00:00:00Z" } } }, "r1"), { desde: null, ate: "2026-10-25" });
  assert.ok(N.silenciado({ silenciados: { r1: { ate: "2026-10-25T00:00:00" } } }, "r1", "2026-10-25"));
});

test("DA-051 · crmTot guardado: a mesma janela não recalcula, e mexer no resultado não estraga o guardado", () => {
  const M = montarDe({ metricas: serie(1, 3), leads: [leadF(dia(1), { valor: 100 })] });
  const a = M.crmTot(M.R - 6, M.R); a.receita = 9; a.serv.x = 1;
  const n = M.CONTAGEM.crmTot;
  const b = M.crmTot(M.R - 6, M.R);
  assert.equal(M.CONTAGEM.crmTot, n, "antes: sem contagem / recalculava");
  assert.equal(b.receita, 100);
  assert.equal(b.serv.x, undefined);
});

test("DA-052 · cliente sem nenhuma métrica: relatórios e radar sem NaN/undefined", () => {
  const M = montarDe();
  const textos = [M.relDiario(M.R), M.relSemanal(M.R), M.relMensal(M.mesesDados().slice(-2)[0]), M.textoAlerta(M.avaliar(M.R, true)), M.relParcial(M.R)];
  for (const t of textos) assert.doesNotMatch(t, /NaN|undefined|Infinity/);
  assert.equal(M.avaliar(M.R, true).length, 0);
});

test("DA-053 · no dia 1º o ritmo é do mês de ontem", () => {
  const M = comHoje("2026-11-01", { metricas: serieAbs("2026-11-01", 1, 40) }, { orcamento: 1000 });
  const m = M.ritmoMes(M.R);
  assert.equal(m.mes, 9);
  assert.equal(m.pass, 31);
  assert.equal(m.restam, 0);
});

test("DA-054 · hojeSP em 2018 com horário de verão (04/11/2018 03:00Z = 01:00 de SP)", () => {
  assert.equal(N.hojeSP(new Date("2018-11-04T03:00:00Z")), "2018-11-04");
  assert.equal(N.hojeSP(new Date("2018-11-04T01:59:00Z")), "2018-11-03");
});

test("DA-055 · gasto do mês fechado em centavos: 0,1 + 0,2 = orçamento de 0,30 esgota", () => {
  const hoje = "2026-03-11";
  const ms = serieAbs(hoje, 1, 10, n => ({ g: n === 1 ? 0.2 : n === 2 ? 0.1 : 0, conv: 0, imp: 10 }));
  const M = comHoje(hoje, { metricas: ms }, { orcamento: 0.3 });
  assert.equal(M.ritmoMes(M.R).gasto, 0.3, "antes: 0.30000000000000004");
});

test("DA-058 · feriados nacionais (fixos e pela Páscoa) e a leitura do dia avisa", () => {
  assert.equal(N.feriadoNacional("2026-12-25"), "Natal");
  assert.equal(N.feriadoNacional("2026-04-03"), "Sexta-feira Santa");
  assert.equal(N.feriadoNacional("2026-02-17"), "Carnaval");
  assert.equal(N.feriadoNacional("2026-06-04"), "Corpus Christi");
  assert.equal(N.feriadoNacional("2026-10-21"), null);
  const M = comHoje("2026-12-26", { metricas: serieAbs("2026-12-26", 1, 20) });
  assert.match(M.relDiario(M.R), /Foi feriado \(Natal\)/);
});

test("DA-059/DA-060 · r2: espera 3 dias com gasto (salvo gasto alto) e ignora campanha de alcance", () => {
  const dois = montarDe({ metricas: serie(1, 2, { g: 20, conv: 0 }) });
  assert.ok(!dois.avaliar(dois.R).some(a => a.regra.id === "r2"), "antes: 2 dias bastavam");
  const alto = montarDe({ metricas: serie(1, 2, { g: 40, conv: 0 }) });
  assert.ok(alto.avaliar(alto.R).some(a => a.regra.id === "r2"), "gasto acima de 3× o piso");
  const alc = montarDe({ metricas: serie(1, 5, { cn: "Alcance · marca", g: 20, conv: 0 }) });
  assert.ok(!alc.avaliar(alc.R).some(a => a.regra.id === "r2"), "antes: alcance gerava «sem conversa» eterno");
});

test("DA-061/DA-347 · histórico: episódio que parou é «resolvido»; buraco só de silêncio não abre episódio novo", () => {
  const ms = serie(1, 20, n => (n >= 6 ? { g: 30, conv: 0 } : { g: 30, conv: 3 }));
  const M = montarDe({ metricas: ms });
  const ep = M.historico().find(e => e.a.regra.id === "r2");
  assert.ok(ep);
  assert.equal(ep.resolvido, true);
  assert.equal(typeof ep.resolvidoEm, "number");
  // silencia 4 dias no meio: o r2 segue o mesmo episódio
  const ms2 = serie(1, 20, { g: 30, conv: 0 });
  const M2 = montarDe({ metricas: ms2 }, { silenciados: { "r2|meta:C1": { desde: dia(9), ate: dia(6) } } });
  assert.equal(M2.historico().filter(e => e.a.chave === "r2|meta:C1").length, 1, "antes: dois episódios");
});

test("DA-062 · primeiro mensal explica o que é «conversa»", () => {
  const hoje = "2026-10-03";
  const M = comHoje(hoje, { metricas: serieAbs(hoje, 1, 32) });
  assert.match(M.relMensal(M.mesesDados().find(m => m.mes === 8)), /conversa = alguém que viu o anúncio e chamou a empresa no WhatsApp/);
  const M2 = comHoje(hoje, { metricas: serieAbs(hoje, 1, 65) });
  assert.doesNotMatch(M2.relMensal(M2.mesesDados().find(m => m.mes === 8)), /conversa = alguém/);
});

test("DA-063/DA-066 · métricas no futuro contadas; venda sem data usa atualizado_em (aproximada)", () => {
  const M = montarDe({ metricas: [metrica(N.isoDe(new Date(N.meioDia(HOJE).getTime() + 2 * 864e5)))] });
  assert.equal(M.avisos.metricasFuturas, 1);
  const L = leadF(dia(40), { data_agenda: null, data_consulta: null, valor: 100, atualizado_em: `${dia(2)}T15:00:00Z` });
  const M2 = montarDe({ metricas: serie(1, 3), leads: [L] });
  assert.equal(M2.crmTot(M2.R - 6, M2.R).fecharam, 1, "antes: a venda caía no dia da conversa (40 dias atrás)");
  assert.equal(M2.avisos.dataFechamentoAproximada, 1);
});

test("DA-067 · mesmo telefone duas vezes na janela conta uma pessoa", () => {
  const M = montarDe({ metricas: serie(1, 3), leads: [leadF(dia(1), { etapa: "nova", telefone: "(11) 99999-8888" }), leadF(dia(2), { etapa: "nova", telefone: "5511999998888" })] });
  const c = M.crmTot(M.R - 6, M.R);
  assert.equal(c.conversas, 1, "antes: 2");
  assert.equal(c.conversasDuplicadas, 1);
});

test("DA-070 · ritmo diz o dia do mês", () => {
  const hoje = "2026-03-13";
  const M = comHoje(hoje, { metricas: serieAbs(hoje, 1, 40, { g: 200 }) }, { orcamento: 4000 });
  const r = M.avaliar(M.R, true).find(a => a.tipo === "acima");
  assert.match(r.msg, /\(dia 12 de 31\)/);
});

test("DA-072 · receita com parte confirmada e parte estimada diz quanto é cada uma", () => {
  const M = montarDe({ metricas: serie(1, 3), leads: [leadF(dia(1), { valor: 1000 }), leadF(dia(1), { servico: "Implante" })] }, { ticket: { Implante: 500 } });
  assert.match(M.receitaTxt(M.crmTot(M.R - 6, M.R)), /R\$\s1\.500 em tratamentos \(R\$\s1\.000 confirmados \+ R\$\s500 estimados\)/);
});

test("DA-074 · soma por plataforma do porDia = total consolidado (dados aleatórios, semente fixa)", () => {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const ms = Array.from({ length: 200 }, () => metrica(dia(1 + Math.floor(rnd() * 60)), { p: rnd() < 0.5 ? "meta" : "google", c: `C${Math.floor(rnd() * 5)}`, a: `A${Math.floor(rnd() * 9)}`, g: Math.round(rnd() * 10000) / 100 }));
  const M = montarDe({ metricas: ms });
  const pd = M.porDia(), tot = M.consolidar(M.linhasDe(0, M.R)).gasto;
  const soma = [...pd.meta, ...pd.google, ...pd.outras].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(soma - tot) < 0.005);
});

test("DA-075 · avaliar duas vezes no mesmo dia não duplica alerta nem recalcula", () => {
  const M = montarDe({ metricas: serie(1, 5, { g: 30, conv: 0 }) });
  const a = M.avaliar(M.R), b = M.avaliar(M.R);
  assert.deepEqual(a.map(x => x.chave), b.map(x => x.chave));
  assert.equal(new Set(a.map(x => x.chave)).size, a.length);
  assert.equal(M.CONTAGEM.avaliar, 1);
});

test("DA-078/DA-079 · resumo parcial do mês e semana fechada seg–dom", () => {
  const hoje = "2026-10-16";   // ontem = quinta 15/10
  const M = comHoje(hoje, { metricas: serieAbs(hoje, 1, 40) });
  assert.match(M.relParcial(M.R), /Parcial de outubro até 15\/10/);
  assert.match(M.relSemanal(M.R, { fechada: true }), /Semana de 05\/10 a 11\/10/, "antes: sempre os 7 dias corridos");
});

test("DA-337 · nenhum texto enviado traz «Nexus» com a assinatura de outra agência", () => {
  const ms = [...serie(1, 70, { g: 60, conv: 1 }), ...serie(1, 70, { p: "google", c: "G1", cn: "Busca", a: "GA", g: 40, conv: 0 })];
  const M = montarDe({ metricas: ms, leads: [leadF(dia(1), { valor: 100 })] }, { cpaAlvo: 15, orcamento: 500, assinatura: "Equipe Alfa", fee: 300 });
  const textos = [M.relDiario(M.R), M.relSemanal(M.R), M.relMensal(ultimoMes(M)), M.textoAlerta(M.avaliar(M.R, true)), M.relParcial(M.R), JSON.stringify(M.contextoIA(M.R))];
  for (const t of textos) assert.doesNotMatch(t, /Nexus/i);
});

test("DA-339/DA-340 · diário abre com o veredito e fecha com «Para hoje»", () => {
  const M = montarDe({ metricas: serie(1, 10, { g: 30, conv: 3 }), leads: [leadF(dia(1), { etapa: "nova" }), leadF(dia(1), { etapa: "nova" })] }, { cpaAlvo: 15 });
  const ls = M.relDiario(M.R).split("\n");
  assert.equal(ls[1], "Dia bom: 3 conversas, custo dentro da meta.");
  assert.ok(ls.includes("👉 *Para hoje:* dar retorno às 2 pessoas que chamaram pelo anúncio — quem responde rápido fecha mais."));
});

test("DA-406 · r1 não conta os dias fechados (feriadão de pouco volume)", () => {
  const fech = N.meioDia(dia(3)).getDay();
  const ms = serie(1, 14, n => (N.meioDia(dia(n)).getDay() === fech ? { g: 200, conv: 1 } : { g: 15, conv: 1 }));
  assert.ok(montarDe({ metricas: ms }, { cpaAlvo: 15 }).avaliar(129).some(a => a.regra.id === "r1"));
  assert.ok(!montarDe({ metricas: ms }, { cpaAlvo: 15, diasFechados: [fech] }).avaliar(129).some(a => a.regra.id === "r1"));
});

test("DA-407 · mensal diz em quantos dias os anúncios rodaram", () => {
  const hoje = "2026-10-03";
  const ms = serieAbs(hoje, 1, 65).filter(m => m.d < "2026-09-01" || m.d >= "2026-09-21");
  const M = comHoje(hoje, { metricas: ms });
  assert.match(M.relMensal(M.mesesDados().find(m => m.mes === 8)), /🗓 Anúncios rodaram em 10 dos 30 dias do mês/);
});

/* ================= (b) painel.js — bloco PURO e peças de tela ================= */
const trechoPuro = (() => { const i = PJS.indexOf("/* ==== PURO: início"), f = PJS.indexOf("/* ==== PURO: fim ==== */"); assert.ok(i > 0 && f > i); return PJS.slice(i, f); })();
const P = vm.runInNewContext(`${trechoPuro};({ statusEnvio, maisNovoPrimeiro, estadoIntegracao, leigoLinhaDe, ctrFrase, ctrLeigo, condLeigaR2, csvDe, agenciaDe, produtoDe, horaRelatorioDe,
  textoVar, brlCurto, mesclarMarcosDia, ordenarCriativos, CRI_PASSO, dataComSemana, linkOrbita })`,
  { horaSP: () => "", quandoSP: () => "", int: N.int, dec: N.dec, brl: N.brl, brl0: N.brl0, plural: N.plural, pluralDec: N.pluralDec, Date, Math, JSON, String, Number, URL });
const pl = x => JSON.parse(JSON.stringify(x));

test("DA-080/DA-081/DA-082/DA-117 · alertas e leituras ordenados pelo instante (fusos misturados), não pelo texto", () => {
  const velho = { id: 1, criado_em: "2026-10-24T23:00:00-03:00" };    // = 25/10 02:00Z
  const novo = { id: 2, criado_em: "2026-10-25T01:00:00Z" };          // mais VELHO que o de cima
  const l = [novo, velho].sort(P.maisNovoPrimeiro);
  assert.equal(l[0].id, 1, "antes: o texto «2026-10-25…» vinha primeiro");
  assert.deepEqual(pl([{ id: 3, criado_em: "x" }, { id: 4, criado_em: "2026-10-25T00:00:00Z" }].sort(P.maisNovoPrimeiro)).map(a => a.id), [4, 3], "data inválida no fim");
  assert.equal([{ id: 5, criado_em: "2026-10-25T00:00:00Z" }, { id: 6, criado_em: "2026-10-25T00:00:00Z" }].sort(P.maisNovoPrimeiro)[0].id, 6, "desempate pelo id");
  const agora = Date.parse("2026-10-25T03:00:00Z");
  const e = P.estadoIntegracao([{ canal: "meta", ativo: true, ultimo_sync: "2026-10-25T02:30:00Z", status: "ok" }],
    [{ regra: "integracao", chave: "integracao|meta|parou", criado_em: "2026-10-24T23:00:00-03:00", mensagem: "parou" },
      { regra: "integracao", chave: "integracao|meta|instavel", criado_em: "2026-10-25T01:00:00Z", mensagem: "instável" }], agora);
  assert.equal(e.canais[0].estado, "ok", "a leitura boa (02:30Z) é mais nova que o aviso mais recente (02:00Z)");
  fonte(PJS, /if \(!e \|\| maisNovoPrimeiro\(a, e\) < 0\) m\.set\(a\.chave, a\);/);
  fonte(PJS, /\.filter\(a => a\.regra === "integracao"\)\.sort\(maisNovoPrimeiro\)/);
  fonte(PJS, /\.slice\(\)\.sort\(maisNovoPrimeiro\)\.slice\(0, 10\)/);
});

test("DA-083 · linha leiga do ritmo pelo tipo (abaixo e esgotado não dizem «passa do orçamento»)", () => {
  assert.match(P.leigoLinhaDe({ regra: { id: "ritmo" }, tipo: "abaixo" }), /sobrar verba/);
  assert.match(P.leigoLinhaDe({ regra: { id: "ritmo" }, tipo: "esgotado" }), /já acabou/);
  assert.match(P.leigoLinhaDe({ regra: { id: "ritmo" }, tipo: "acima" }), /passa do orçamento/);
  assert.match(P.leigoLinhaDe({ regra: { id: "r2" } }), /ninguém chamou/);
});

test("DA-084 · tradução do CTR com a mesma régua do ctrLeigo (por 1.000 abaixo de 1%)", () => {
  assert.equal(P.ctrFrase(0.83), "(de cada 1.000 que viram, 8 tocaram)", "antes: «menos de 1 tocou»");
  assert.equal(P.ctrFrase(2.4), "(de cada 100 que viram, 2 tocaram)");
  assert.match(P.ctrLeigo(0.9), /9 em cada 1\.000/);
  fonte(PJS, /const t = ctrFrase\(v\);/);
});

test("DA-085/DA-378 · condição leiga do r2 com o piso que a regra usa e «campanha»", () => {
  const M = montarDe({ metricas: serie(1, 3) }, { cpaAlvo: 40 });
  const r2 = M.REGRAS.find(r => r.id === "r2");
  const t = P.condLeigaR2(r2.minGastoDe(null), r2.janela, false);
  assert.match(t, /uma campanha gasta R\$\s60 ou mais em 3 dias/, "piso = 1,5 × meta de R$ 40");
  assert.doesNotMatch(t, /anúncio gasta/);
  fonte(PJS, /condLeigaR2\(r\.minGastoDe \? r\.minGastoDe\(null\)/);
});

test("DA-086/DA-116 · CSV: fórmula neutralizada, aspas e quebra de linha", () => {
  const csv = P.csvDe([["=HYPERLINK(\"x\")", "+1", "-2", "@soma", "a;b", "linha\nnova", -5, 1234.5]]);
  const cel = csv.slice(1).split(";");
  assert.equal(cel[0], "\"'=HYPERLINK(\"\"x\"\")\"", "antes: a fórmula ia crua para o Excel");
  assert.equal(cel[1], "'+1");
  assert.equal(cel[2], "'-2");
  assert.equal(cel[3], "'@soma");
  assert.ok(csv.includes("\"a;b\""));
  assert.ok(csv.includes("\"linha\nnova\""));
  assert.ok(csv.endsWith(";-5;1234,5"), "número negativo continua número");
});

test("DA-087/DA-088/DA-089/DA-090/DA-092/DA-115 · white-label: a agência do cliente no lugar de «Nexus»", () => {
  assert.equal(P.agenciaDe({}), "Nexus");
  assert.equal(P.agenciaDe({ agenciaNome: "Alfa Digital" }), "Alfa Digital");
  assert.equal(P.agenciaDe({ agencia: { nome: "Beta" } }), "Beta");
  assert.equal(P.produtoDe("Nexus"), "Nexus Ads");
  assert.equal(P.produtoDe("Alfa Digital"), "Alfa Digital");
  assert.doesNotMatch(PJS, /titulo: "Nexus · Tráfego"/, "antes: prévia fixa «Nexus · Tráfego»");
  assert.doesNotMatch(PJS, /tipo === "diario" \? "Nexus · Tráfego"/);
  assert.doesNotMatch(PJS, /· Nexus Ads\$\{S\.demo/, "título da aba");
  assert.doesNotMatch(PJS, /sem a gestão da Nexus/);
  assert.doesNotMatch(PJS, /"Só a equipe da Nexus liga ou desliga regras\."/);
  fonte(PJS, /id="cl-agencia"/);
});

test("DA-091 · mensagens de erro com o nome da agência do cliente", async () => {
  const api = await import("../web/dados.js");
  try {
    assert.match(api.mensagemErro({ codigo: "so_gestor" }), /Nexus/);
    api.definirAgencia("Alfa Digital");
    assert.equal(api.mensagemErro({ codigo: "so_gestor" }), "Só a equipe da Alfa Digital pode fazer essa alteração.");
    assert.doesNotMatch(api.mensagemErro({ codigo: "cliente_pausado" }), /Nexus/);
  } finally { api.definirAgencia(""); }
});

test("DA-093/DA-408 · hora do diário configurável e «próximo relatório»", () => {
  assert.equal(P.horaRelatorioDe({}), "08:00");
  assert.equal(P.horaRelatorioDe({ horaRelatorio: "07:30" }), "07:30");
  assert.equal(P.horaRelatorioDe({ horaRelatorio: "25:00" }), "08:00");
  fonte(PJS, /quando: horaRel\(\) \}\]/);
  fonte(PJS, /Próximo relatório diário: amanhã às \$\{horaRel\(\)\}/);
  fonte(HTML, /id="rel-proximo"/);
});

test("DA-094/DA-386 · tabela de origem com int() e «Contatos no CRM»", () => {
  fonte(PJS, /<td>\$\{int\(r\.k\.conversas\)\}<\/td><td>\$\{int\(r\.k\.agendadas\)\}<\/td>/);
  fonte(PJS, />Contatos no CRM<\/th>/);
  assert.doesNotMatch(PJS, /<td>\$\{k\.conversas\}<\/td>/, "antes: 1234 sem separador");
});

test("DA-095/DA-096/DA-409 · criativos ordenáveis (aria-sort) e paginados de 25 em 25", () => {
  const lista = Array.from({ length: 60 }, (_, n) => ({ k: { nome: `C${n}` }, t: { gasto: n, cpa: n % 7 ? 60 - n : NaN, conversoes: n } }));
  assert.equal(P.ordenarCriativos(lista, "gasto", -1)[0].k.nome, "C59");
  assert.equal(P.ordenarCriativos(lista, "cpa", 1)[0].k.nome, "C59", "menor custo primeiro");
  assert.ok(!Number.isFinite(P.ordenarCriativos(lista, "cpa", 1).pop().t.cpa), "sem número no fim");
  assert.equal(P.CRI_PASSO, 25);
  fonte(PJS, /data-cri-sort=/);
  fonte(PJS, /data-cri-mais/);
  fonte(PJS, /cris = crisTodos\.slice\(0, criMax\)/);
  fonte(PJS, /gestor\(\) \? "Impressões" : "Vezes na tela"/);
});

test("DA-097/DA-390 · comemoração com o vocabulário da vertical e vibração opcional", () => {
  assert.doesNotMatch(PJS, /<p class="cb-t">Paciente novo!<\/p>/);
  fonte(PJS, /<p class="cb-t">\$\{esc\(capt\(M\.VOC\.novo\[0\]\)\)\}!<\/p>/);
  fonte(PJS, /lerLocal\("nx-vibrar"\) === "1" && navigator\.vibrate/);
  fonte(HTML, /id="op-vibrar"/);
});

test("DA-098 · vários marcos no mesmo dia", () => {
  const d = "2026-10-10";
  let l = P.mesclarMarcosDia([{ d, t: "Troca de criativo" }], d, "Orçamento +20%");
  assert.equal(l.length, 2, "antes: o segundo apagava o primeiro");
  l = P.mesclarMarcosDia(l, d, "", "Troca de criativo");
  assert.deepEqual(pl(l), [{ d, t: "Orçamento +20%" }]);
  assert.equal(P.mesclarMarcosDia(l, d, "").length, 0, "sem texto: tira os do dia");
  fonte(PJS, /const marcosDoDia = i =>/);
});

test("DA-099 · prévia do resumo semanal no celular de relatórios", () => {
  fonte(PJS, /sd\.add\(new Option\(`Resumo da semana · /);
  fonte(PJS, /isoD === "semana" && typeof M\.relSemanal === "function"/);
});

test("DA-101 · leitura repete em 502/503/504 (até 2 vezes); escrita nunca", async () => {
  const api = await import("../web/dados.js");
  let n = 0;
  api.usarFetch(async () => { n++; return n < 3 ? { ok: false, status: 503, text: async () => "" } : { ok: true, status: 200, text: async () => "{\"ok\":1}" }; });
  try {
    const r = await api.rpc("nx_dados", {});
    assert.deepEqual(r, { ok: 1 });
    assert.equal(n, 3, "antes: o 503 ia direto para a tela");
    n = 0;
    await assert.rejects(api.rpc("nx_lead_salvar", {}), e => e.codigo === "http_503");
    assert.equal(n, 1, "escrita não repete");
  } finally { api.usarFetch(null); }
});

test("DA-111 · base pequena mostra a diferença, não a porcentagem", () => {
  assert.deepEqual(pl(P.textoVar(20, 10, "int")), { abs: true, v: 10, txt: "+10" });
  assert.equal(P.textoVar(200, 100, "int"), null);
  assert.equal(P.textoVar(20, 10, "brl0"), null);
  fonte(PJS, /const ab = textoVar\(k\.v, k\.a, k\.f\);/);
});

test("DA-113 · data com dia da semana", () => {
  assert.equal(P.dataComSemana("2026-10-23"), "sex, 23/10/2026");
  fonte(PJS, /`Diário de \$\{dataComSemana\(ref\)\}`/);
});

test("DA-118 · reais abreviados em cartão estreito", () => {
  assert.equal(P.brlCurto(1234567), `R$${NBSP}1,2 mi`);
  assert.equal(P.brlCurto(35400), `R$${NBSP}35 mil`);
  assert.equal(P.brlCurto(9000), N.brl0(9000));
  fonte(PJS, /const fmtCartao = \(v, f\) =>/);
});

test("DA-004 · selo «dados parciais» na tabela de campanhas", () => {
  fonte(PJS, /M\.divergenciasPorCampanha\(de, M\.R\)/);
  fonte(PJS, />dados parciais<\/span>/);
});

test("DA-387 · link «Ver no Órbita» com a rota da aba", () => {
  assert.equal(P.linkOrbita("https://o/app/", "radar"), "https://o/app/#/anuncios/radar");
  assert.equal(P.linkOrbita("https://o/app/", "pacientes"), "https://o/app/#/crm");
  fonte(HTML, /id="link-orbita"/);
  fonte(CSS, /\.link-orbita \{[^}]*min-height: 44px/);
});

/* ================= (c) folha.js, demo.js ================= */
const F = await import("../web/folha.js");
const { gerarDemo, VERTICAIS_DEMO } = await import("../web/demo.js");

test("DA-102 · «Gerado em» no fuso de São Paulo", () => {
  assert.equal(F.geradoEmSP(new Date("2026-10-25T02:00:00Z")), "24/10/2026", "23h de SP ainda é dia 24");
  fonte(FJS, /Gerado em \$\{geradoEmSP\(\)\}/);
});

test("DA-103 · folha com gestão mostra anúncios + gestão = total", () => {
  assert.match(F.linhaInvestimento({ t: { gasto: 1500 }, fee: 997 }), /anúncios R\$\s1\.500 \+ gestão R\$\s997 = <b>R\$\s2\.497<\/b> no total/);
  assert.equal(F.linhaInvestimento({ t: { gasto: 1500 }, fee: 0 }), "");
});

test("DA-104 · TikTok não vira «conversa no WhatsApp» na folha", () => {
  const M = montarDe({ metricas: [...serie(1, 3), metrica(dia(1), { p: "tiktok", c: "T1", a: "TA", conv: 4 })] });
  const m = { de: M.R - 5, ate: M.R };
  const k = F.contatosFolha(M, m);
  assert.equal(k.conversas, 6, "antes: 10 (TikTok somado)");
  assert.equal(k.outras.tiktok, 4);
  assert.match(k.frase, /<b>4 contatos<\/b> pelo TikTok/);
});

test("DA-122/DA-123/DA-124 · folha: ocultar valores, mês vazio e a tabela do gráfico", () => {
  fonte(HTML, /id="folha-ocultar" type="button" aria-pressed="false"/);
  fonte(FJS, /ocultarValores \? `<div class="bloco">/);
  const vazio = montarDe({ metricas: serie(40, 45) });
  assert.equal(F.folhaVazia(vazio, { de: vazio.R - 5, ate: vazio.R }), true);
  assert.equal(F.folhaVazia(vazio, { de: vazio.R - 45, ate: vazio.R - 38 }), false);
  fonte(FJS, /btnImp\.disabled = true/);
  const tab = F.tabelaMeses([{ mes: 8, fecharam: 1234, completo: true }, { mes: 9, fecharam: 3, completo: false }]);
  assert.match(tab, /<table class="fl-tab">/);
  assert.match(tab, /<td>1\.234<\/td>/);
});

test("DA-389 · demo com ?vertical=oficina: serviços, campanhas e vocabulário da oficina", () => {
  const ds = gerarDemo({ vertical: "oficina", hoje: "2026-10-25" });
  assert.equal(ds.vertical, "oficina");
  assert.equal(ds.nome, "Oficina Demonstração");
  assert.ok(ds.LEADS.every(L => !/Aparelho|Implante|Clareamento|Canal/.test(L.servico)), "antes: serviços de dentista");
  assert.ok(Object.keys(ds.CFG.ticket).includes("Retífica de motor"));
  assert.equal(ds.CAMP.m1.nome, VERTICAIS_DEMO.oficina.campanhas.m1[0]);
  const odonto = gerarDemo({ hoje: "2026-10-25" });
  assert.equal(odonto.vertical, "odonto");
  assert.equal(ds.LINHAS.length, odonto.LINHAS.length, "os números são os mesmos");
  fonte(PJS, /gerarDemo\(\{ nome: S\.nomeDemo, vertical: VERTICAL_Q \}\)/);
});

/* ================= (d) pendências que a frente ads deixou (feito-ads.json) ================= */
test("DA-143 · a campanha guarda o status da linha mais recente (rel-logica.situacaoCampanha lê c.status)", () => {
  const M = montarDe({ metricas: [metrica(dia(3), { st: "ACTIVE" }), metrica(dia(1), { st: "PAUSED" }), metrica(dia(2), { st: "ACTIVE" })] });
  assert.equal(M.CAMP["meta:C1"].status, "PAUSED", "antes: CAMP não tinha status nenhum");
  const M2 = montarDe({ metricas: [metrica(dia(1))] });
  assert.equal(M2.CAMP["meta:C1"].status, undefined, "sem status na linha: nada inventado");
});

test("DA-258 · «enviado» velho ganha rotuloData com o dia", () => {
  const s = P.statusEnvio({ enviado_em: "2026-10-20T11:00:00Z" }, Date.parse("2026-10-25T12:00:00Z"));
  assert.equal(s.rotuloData, "enviado em 20/10 · sem confirmação de entrega");
  assert.equal(P.statusEnvio({ enviado_em: "2026-10-25T11:50:00Z" }, Date.parse("2026-10-25T12:00:00Z")).rotuloData, undefined);
  fonte(PJS, /esc\(s\.rotuloData \|\| s\.rotulo\)/);
});
