/* ============================================================
   ÓRBITA — plano 1500c (21/10/2026), frente classico (painel clássico + nucleo.js)
   node --test testes/plano1500c-classico.teste.mjs      (Node puro, sem rede e sem navegador)
   (a) nucleo.js — a matemática e os textos do WhatsApp (também rodam nas Edge Functions)
   (b) painel.js — bloco PURO num contexto vm + peças de tela conferidas pela fonte
   (c) folha.js, dados.js, demo.js, painel.css, index.html
   Datas das fixtures relativas ao relógio (hojeSP); quando o teste precisa de um dia do mês certo (ritmo do dia 10),
   o «hoje» do dataset é fixo. Cada teste falharia no código anterior ao lote.
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ler = f => readFileSync(join(RAIZ, f), "utf8").replace(/\r\n/g, "\n");
const PJS = ler("web/painel.js"), CSS = ler("web/painel.css"), HTML = ler("web/index.html"), FJS = ler("web/folha.js");

const N = await import("../web/nucleo.js");
const F = await import("../web/folha.js");
const api = await import("../web/dados.js");
const { gerarDemo } = await import("../web/demo.js");

/* ---------- fixtures ---------- */
const HOJE = N.hojeSP();
const dia = n => { const d = N.meioDia(HOJE); d.setDate(d.getDate() - n); return N.isoDe(d); };
const cli = (cfg = {}, extra = {}) => ({ id: "c1", slug: "x", nome: "Clínica Teste", cfg, ...extra });
const montarDe = (o = {}, cfg = {}) => N.montar(N.datasetDeLinhas({ metricas: [], leads: [], cliente: cli(cfg), hoje: HOJE, dias: 130, ...o }));
const metrica = (d, o = {}) => ({ p: "meta", d, n: "anuncio", c: "C1", cn: "Campanha teste", a: "A1", an: "Anúncio teste",
  imp: 1000, alc: 800, freq: 1.2, cli: 30, g: 30, conv: 2, ...o });
const serie = (de, ate, o = {}) => Array.from({ length: ate - de + 1 }, (_, k) => metrica(dia(de + k), typeof o === "function" ? o(de + k) : o));
const ultimoMes = M => M.mesesDados().filter(m => m.completo).pop();
const leadF = (d, o = {}) => ({ id: Math.random(), nome: "Ana", origem: "anuncio", plataforma: "meta", campanha_ext: "C1", anuncio_ext: "A1",
  etapa: "fechou", data_conversa: d, data_agenda: d, data_consulta: d, valor: null, servico: null, ...o });
const iDe = n => 130 - n;   // índice no dataset de 130 dias (dia(1) = ontem = 129)
/** Confere um trecho da fonte sem despejar o arquivo inteiro na falha. */
const fonte = (src, re, msg) => assert.ok(re.test(src), msg || String(re));

/* ================= (a) nucleo.js ================= */
test("AC-001 · varTxt: variação que arredonda a 0 é «estável» (nada de «-0%» nem «+0% →»)", () => {
  assert.equal(N.varTxt(99.7, 100), "estável", "antes: «-0% →»");
  assert.equal(N.varTxt(100.4, 100), "estável", "antes: «+0% →»");
  assert.equal(N.varTxt(110, 100), "+10% ↑");
  assert.equal(N.varTxt(80, 100), "-20% ↓");
  assert.equal(N.varPct(-0.3), "estável");
  assert.doesNotMatch(N.varParen(99.7, 100, " vs. dia anterior"), /-0%/);
});

test("AC-002 · mensal: investimento quase igual ao do mês anterior sai «estável», não «-0%»", () => {
  const M0 = montarDe({ metricas: serie(1, 125) });
  const lista = M0.mesesDados(), m = ultimoMes(M0), prev = lista[lista.findIndex(x => x.de === m.de) - 1];
  const fator = (m.ate - m.de + 1) / (prev.ate - prev.de + 1) * 1.003;
  const M = montarDe({ metricas: serie(1, 125, n => (iDe(n) >= prev.de && iDe(n) <= prev.ate ? { g: 30 * fator } : {})) });
  const t = M.relMensal(ultimoMes(M));
  assert.match(t, /Investido em anúncios: R\$\s[\d.]+ \(estável vs\./, t);
  assert.doesNotMatch(t, /[-+]0%/);
});

test("AC-003 · pc com separador de milhar e sem «-0,0%»", () => {
  assert.equal(N.pc(1234.5, 0), "1.235%", "antes: «1235%» (ou «1234%»)");
  assert.equal(N.pc(5, 1), "5,0%");
  assert.equal(N.pc(-0.01, 1), "0,0%");
  assert.equal(N.pc(-12.34, 1), "-12,3%");
  assert.equal(N.pc(null), "—");
});

test("AC-004 · resíduo de 0,5 conversão do Google (gasto zero) não é jogado fora", () => {
  const M = montarDe({ metricas: [{ p: "google", d: dia(2), n: "campanha", c: "G1", cn: "Pesquisa", g: 0, imp: 0, cli: 0, conv: 0.5 }] });
  assert.equal(M.consolidar(M.linhasDe(0, M.R)).conversoes, 0.5, "antes: 0 (linha descartada)");
});

test("AC-006 · alcance não soma entre dias: 2 dias de 100 pessoas → piso 100, marcado como estimado", () => {
  const M = montarDe({ metricas: [metrica(dia(2), { alc: 100 }), metrica(dia(1), { alc: 100 })] });
  const t = M.consolidar(M.linhasDe(0, M.R));
  assert.ok(t.alcance <= 200);
  assert.equal(t.alcance, 100, "antes: 200 (a mesma gente contada 2 vezes)");
  assert.equal(t.alcanceEstimado, true);
  assert.equal(t.alcanceSoma, 200);
  assert.equal(M.consolidar(M.linhasDe(M.R, M.R)).alcanceEstimado, false, "uma linha só: alcance da API, não estimado");
});

test("AC-007 · valor estimado sem arredondar para a dezena: ticket R$ 25 × 3 = R$ 75", () => {
  const leads = [1, 2, 3].map(k => leadF(dia(k + 1), { servico: "Limpeza" }));
  const M = montarDe({ metricas: serie(1, 10), leads }, { ticket: { Limpeza: 25 } });
  assert.equal(M.crmTot(0, M.R).receita, 75, "antes: 90 (25 virava 30)");
});

test("AC-008 · consulta com data e etapa que voltou para «perdida» não some: conta como sem presença", () => {
  const M = montarDe({ metricas: serie(1, 10), leads: [leadF(dia(5), { etapa: "perdida" })] });
  const c = M.crmTot(0, M.R);
  assert.equal(c.semPresenca, 1, "antes: 0 (não entrava em coluna nenhuma)");
  assert.equal(c.compareceram, 0);
});

test("AC-009 · porDia: a soma do gráfico inclui as plataformas «outras» (TikTok)", () => {
  const M = montarDe({ metricas: [...serie(1, 5), ...serie(1, 5, { p: "tiktok", c: "T1", a: "TA1", g: 12 })] });
  const sd = M.porDia();
  let soma = 0;
  for (let i = 0; i <= M.R; i++) soma += sd.meta[i] + sd.google[i] + sd.outras[i];
  assert.equal(Math.round(soma * 100) / 100, Math.round(M.consolidar(M.linhasDe(0, M.R)).gasto * 100) / 100);
  fonte(PJS, /sd\.meta\[i\] \+ sd\.google\[i\] \+ sd\.outras\[i\]/, "painel: a célula «Investido» soma «outras»");
  fonte(PJS, /outras: sd\.outras\[i\]/, "painel: serieDia traz «outras» para o gráfico e a tabela");
  fonte(PJS, /<rect class="bo"/, "AC-246: a barra das outras plataformas no gráfico");
  fonte(CSS, /\.chart \.bo \{/);
});

const comHoje = (hoje, o = {}, cfg = {}) => N.montar(N.datasetDeLinhas({ metricas: [], leads: [], cliente: cli(cfg), hoje, dias: 60, ...o }));
const serieAbs = (hoje, n, o = {}) => Array.from({ length: n }, (_, k) => { const d = N.meioDia(hoje); d.setDate(d.getDate() - 1 - k); return metrica(N.isoDe(d), o); });

test("AC-010 · ritmo avisa verba sobrando no dia 10 (com quanto dá para subir); fora dos dias 10/20 fica quieto", () => {
  const M = comHoje("2026-03-11", { metricas: serieAbs("2026-03-11", 40, { g: 10 }) }, { orcamento: 3000 });
  // plano 2000d: REV-05 — a sobra tem chave própria («ritmo:abaixo»): silenciar o «acima» não a cala
  const r = M.avaliar(M.R, true).find(a => a.chave === "ritmo:abaixo");
  assert.ok(r, "antes: nenhum aviso abaixo do orçamento");
  assert.equal(r.tipo, "abaixo");
  assert.match(r.acao, /Dá para subir R\$\s[\d.,]+ por dia/);
  const M2 = comHoje("2026-03-13", { metricas: serieAbs("2026-03-13", 40, { g: 10 }) }, { orcamento: 3000 });
  assert.equal(M2.avaliar(M2.R, true).find(a => a.regra.id === "ritmo"), undefined, "dia 12: sem aviso diário de sobra");   // plano 2000d: pela regra (REV-05)
});

test("AC-011 · orçamento já gasto: nada de «Segurar R$ X por dia» — o aviso diz que acabou", () => {
  // plano 2000d: REV-05 — orçamento que cruza ONTEM (110 < 115 ≤ 120); com 100 o aviso saiu no dia 10 e ontem cai no intervalo de 3 dias
  const M = comHoje("2026-03-13", { metricas: serieAbs("2026-03-13", 40, { g: 10 }) }, { orcamento: 115 });
  // plano 2000d: o «esgotado» tem chave própria («ritmo:esgotado», DA-006) — procura pela regra
  const r = M.avaliar(M.R, true).find(a => a.regra.id === "ritmo");
  assert.ok(r);
  assert.equal(r.tipo, "esgotado");
  assert.doesNotMatch(r.acao, /Segurar/, "antes: «Segurar R$ … por dia … para fechar dentro do orçamento»");
  assert.match(r.acao, /orçamento do mês acabou/);
});

test("AC-012 · aviso do radar no WhatsApp diz de que dia são os números (dd/mm)", () => {
  const M = montarDe({ metricas: serie(1, 20) });
  assert.match(M.textoAlerta([]), new RegExp(`Radar de tráfego\\* · ${M.ddmm(M.R).replace("/", "\\/")}`));
  assert.match(M.textoAlerta([{ sev: "critico", msg: "x", acao: "y" }]), /Radar de tráfego\* — 1 item crítico · \d{2}\/\d{2}/);
});

test("AC-013 · diário: a média é dos 7 dias ANTERIORES — dia com o dobro mostra a média de antes", () => {
  const M = montarDe({ metricas: serie(1, 20, n => (n === 1 ? { g: 20 } : { g: 10 })) });
  const t = M.relDiario(M.R);
  assert.match(t, /média dos 7 dias anteriores: R\$\s10,00/, "antes: média com o próprio dia (R$ 11,43)");
});

test("AC-014 · diário: TikTok aparece na lista por plataforma", () => {
  const M = montarDe({ metricas: [...serie(1, 3), metrica(dia(1), { p: "tiktok", c: "T1", a: "TA1", g: 12, conv: 1 })] });
  assert.match(M.relDiario(M.R), /• TikTok: R\$\s12,00 → 1 conversão/);
  assert.equal(N.nomePlat("tiktok"), "TikTok");
  assert.equal(N.nomePlat("algo"), "Anúncio");
});

test("AC-015 · melhor/pior: cada campanha contra a meta da SUA plataforma (Google não é sempre o «pior»)", () => {
  const ms = [...serie(1, 7, { g: 10, conv: 1 }), ...serie(1, 7, { p: "google", c: "G1", cn: "Pesquisa Google", a: "GA", g: 40, conv: 1 })];
  const M = montarDe({ metricas: ms }, { cpaAlvo: 12, cpaAlvoGoogle: 50 });
  const t = M.relDiario(M.R);
  // plano 2000d: as duas dentro da meta — a última do ranking é «Mais cara (dentro da meta)», sem «🔴 Pior» (DA-016)
  const pior = t.split("\n").find(l => l.includes("Mais cara (dentro da meta):"));
  assert.ok(pior && !/Pesquisa Google/.test(pior), `antes: o Google (R$ 40 contra meta de R$ 50) era o pior — ${pior}`);
  assert.doesNotMatch(t, /Pior:/);
  assert.match(t.split("\n").find(l => l.includes("Melhor:")), /Pesquisa Google/);
});

test("AC-016/AC-070 · «Cada R$ 1 virou»: mensal com a gestão = folha = retornoInvestimento", () => {
  const M0 = montarDe({ metricas: serie(1, 120) }, { fee: 500 });
  const m0 = ultimoMes(M0), iso = N.isoDe(M0.dataDe(m0.de + 3));
  const M = montarDe({ metricas: serie(1, 120), leads: [leadF(iso, { valor: 9000 })] }, { fee: 500 });
  const m = ultimoMes(M), t = M.relMensal(m), d = F.dadosFolha(M, m);
  const ret = N.retornoInvestimento({ receita: 9000, gasto: d.t.gasto, fee: 500 });
  assert.equal(d.retorno, ret);
  assert.ok(t.includes(`Cada R$ 1 investido virou *${N.brl(ret)}*`), `antes: só anúncio (${t})`);
  assert.match(t, /considerando anúncios e gestão/);
  assert.match(t, /\(R\$\s[\d.]+ com a gestão\)/, "AC-070: o custo por fechamento com a gestão");
  // o herói do painel (numerosPeriodo, rodado no vm como no AD-207) dá o MESMO número num período de 30 dias inteiro do mês
  const src = PJS.slice(PJS.indexOf("function numerosPeriodo() {"), PJS.indexOf("\nfunction renderGeral"));
  const S = { dias: m.ate - m.de + 1, plat: "" }, janela = () => ({ de: m.de, ate: m.ate, deA: m.de - S.dias, ateA: m.de - 1 });
  const Mj = { ...M, CFG: { ...M.CFG, fee: 500 * 30 / S.dias } };   // o painel rateia a gestão por 30 dias: no mês inteiro = a gestão do mês
  const P = vm.runInNewContext(`${src}; numerosPeriodo()`, { M: Mj, S, janela });
  assert.ok(Math.abs(P.retorno - ret) < 1e-9, `painel ${P.retorno} × mensal ${ret}`);
});

test("AC-017 · mês anterior sem fechamento: «de 0 para 3» (antes a linha sumia)", () => {
  const M0 = montarDe({ metricas: serie(1, 120) });
  const m = ultimoMes(M0);
  const leads = [2, 3, 4].map(k => leadF(N.isoDe(M0.dataDe(m.de + k))));
  const M = montarDe({ metricas: serie(1, 120), leads });
  assert.match(M.relMensal(ultimoMes(M)), /: de 0 para 3 /);
});

test("AC-018 · mensal: «Campanha que mais trouxe resultado» (era «Anúncio»)", () => {
  const M0 = montarDe({ metricas: serie(1, 120) });
  const m = ultimoMes(M0);
  const M = montarDe({ metricas: serie(1, 120), leads: [leadF(N.isoDe(M0.dataDe(m.de + 2)), { valor: 1000 })] });
  const t = M.relMensal(ultimoMes(M));
  assert.match(t, /• Campanha que mais trouxe resultado: _/);
  assert.doesNotMatch(t, /Anúncio que mais trouxe/);
});

test("AC-019/AC-020/AC-021 · contexto da IA: por plataforma, gestão, CRM semana a semana e a meta do Google", () => {
  const M = montarDe({ metricas: [...serie(1, 20), ...serie(1, 20, { p: "google", c: "G1", a: "GA", g: 20, conv: 1 })], leads: [leadF(dia(3)), leadF(dia(9))] },
    { cpaAlvo: 15, cpaAlvoGoogle: 40, fee: 800 });
  const c = M.contextoIA(M.R);
  assert.deepEqual(Object.keys(c.porPlataforma).sort(), ["google", "meta"]);
  assert.equal(c.porPlataforma.google.meta, 40);
  assert.equal(c.porPlataforma.meta.cpa, 15);
  assert.equal(c.gestao_mes, 800);
  assert.equal(c.metas_por_plataforma.google, 40);
  assert.equal(c.crm.estaSemana.fecharam, 1);
  assert.equal(c.crm.semanaPassada.fecharam, 1);
});

test("AC-022 · mensal: melhor dia da semana (só com 3 semanas de número)", () => {
  const dow = n => N.meioDia(dia(n)).getDay();
  const M = montarDe({ metricas: serie(1, 125, n => (dow(n) === 2 ? { conv: 6 } : { conv: 1 })) });
  assert.match(M.relMensal(ultimoMes(M)), /Melhor dia da semana para conversas: terça-feira \(média de 6 por dia, contra 1 nos outros dias\)/);
  const plano = montarDe({ metricas: serie(1, 125) });
  assert.doesNotMatch(plano.relMensal(ultimoMes(plano)), /Melhor dia da semana/, "sem diferença: sem linha");
});

test("AC-023 · diário lista a campanha que vinha investindo e zerou nos 2 últimos dias", () => {
  const M = montarDe({ metricas: [...serie(1, 15), ...serie(3, 9, { c: "C2", cn: "Campanha dois", a: "A2" })] });
  const t = M.relDiario(M.R);
  assert.match(t, new RegExp(`Parou de investir: Campanha dois \\(sem investimento desde ${M.ddmm(iDe(2)).replace("/", "\\/")}\\)`), t);
  assert.equal(M.campanhasParadas(M.R).length, 1);
});

test("AC-024 · «Campanha sem conversa»: o piso de gasto acompanha a meta (meta R$ 80 → R$ 120 em 3 dias)", () => {
  const ms = [...serie(4, 20, { g: 30, conv: 2 }), ...serie(1, 3, { g: 10, conv: 0 })];
  const M = montarDe({ metricas: ms }, { cpaAlvo: 80 });
  assert.equal(M.avaliar(M.R).filter(a => a.regra.id === "r2").length, 0, "antes: R$ 30 em 3 dias já era crítico");
  const P = montarDe({ metricas: ms }, { cpaAlvo: 80, radar: { r2MinGasto: 25 } });
  assert.equal(P.avaliar(P.R).filter(a => a.regra.id === "r2").length, 1, "limite escolhido pelo cliente vale como está");
});

test("AC-025 · CTR baixo não acusa campanha de alcance/vídeo", () => {
  const ms = serie(1, 5, { cn: "Alcance · bairro", cli: 4, imp: 1000 });
  assert.equal(montarDe({ metricas: ms }).avaliar(iDe(1)).filter(a => a.regra.id === "r3").length, 0, "antes: r3 com CTR 0,4%");
  const normal = serie(1, 5, { cli: 4, imp: 1000 });
  assert.equal(montarDe({ metricas: normal }).avaliar(iDe(1)).filter(a => a.regra.id === "r3").length, 1);
});

test("AC-036/AC-065 · meta própria da campanha vence a da plataforma; campanha com menos de 5 dias não entra no r1", () => {
  const M = montarDe({ metricas: serie(1, 14) }, { cpaAlvo: 100, metasCampanha: { C1: 5 } });
  const r1 = M.avaliar(M.R).find(a => a.regra.id === "r1");
  assert.ok(r1, "antes: meta global de R$ 100 → sem alerta");
  assert.match(r1.acao, /perto de R\$\s5,00/);
  assert.equal(M.metaDaCampanha(M.CAMP["meta:C1"]), 5);
  const nova = montarDe({ metricas: serie(1, 3, { g: 100, conv: 1 }) }, { cpaAlvo: 15 });
  assert.equal(nova.avaliar(nova.R).filter(a => a.regra.id === "r1").length, 0, "3 dias no ar: cedo para julgar");
});

test("AC-039 · diário: Google sem investimento no dia não vira «—» solto", () => {
  const M = montarDe({ metricas: [...serie(1, 5), metrica(dia(1), { p: "google", c: "G1", a: "GA", g: 0, conv: 0, imp: 10, cli: 0 })] });
  const t = M.relDiario(M.R);
  assert.doesNotMatch(t, /\(Google\): —/);
  assert.match(t, /Custo por conversão \(Google\): sem investimento no dia/);
});

test("AC-042/AC-043 · mês anterior com poucos dias de número não entra na comparação; mesesDados conta os dias com dado", () => {
  const M0 = montarDe({ metricas: serie(1, 125) });
  const lista = M0.mesesDados(), m = ultimoMes(M0), prev = lista[lista.findIndex(x => x.de === m.de) - 1];
  const M = montarDe({ metricas: serie(1, 125, n => (iDe(n) < prev.ate - 4 ? { g: 0, imp: 0 } : {})) });
  const t = M.relMensal(ultimoMes(M));
  assert.doesNotMatch(t, /% vs\./, "antes: «+500% vs. …» com o cliente que começou no fim do mês anterior");
  assert.match(t, /Primeiro mês completo de anúncios/);
  const mp = M.mesesDados().find(x => x.de === prev.de);
  assert.equal(mp.diasComDado, 5);
  assert.equal(M.mesesDados().find(x => x.de === m.de).diasComDado, m.ate - m.de + 1);
});

test("AC-044 · funilCampanha: a soma das campanhas bate com o funil total", () => {
  const ms = [...serie(1, 20), ...serie(1, 20, { c: "C2", cn: "Dois", a: "A2", g: 10, conv: 1 })];
  const leads = [leadF(dia(3)), leadF(dia(4), { campanha_ext: "C2", anuncio_ext: "A2" })];
  const M = montarDe({ metricas: ms, leads });
  const f = ["meta:C1", "meta:C2"].map(id => M.funilCampanha(id, 0, M.R));
  const t = M.consolidar(M.linhasDe(0, M.R)), c = M.crmTot(0, M.R);
  assert.equal(f[0].impressoes + f[1].impressoes, t.impressoes);
  assert.equal(f[0].conversoesPlataforma + f[1].conversoesPlataforma, t.conversoes);
  assert.equal(f[0].fecharam + f[1].fecharam, c.fecharam);
});

test("AC-046 · campanha sem id nem nome vira «Campanha sem nome» (não «Campanha undefined»)", () => {
  const M = montarDe({ metricas: [metrica(dia(1), { c: undefined, cn: "   " })] });
  const nomes = Object.values(M.CAMP).map(c => c.nome);
  assert.ok(nomes.includes("Campanha sem nome"), nomes.join(","));
  assert.ok(!nomes.some(n => /undefined/.test(n)));
});

test("AC-047 · estorno (gasto negativo) entra na soma, mas a barra do dia não fica negativa", () => {
  const M = montarDe({ metricas: [...serie(2, 5), metrica(dia(1), { g: -20, conv: 0 })] });
  assert.equal(M.porDia().meta[M.R], 0);
  assert.equal(M.consolidar(M.linhasDe(0, M.R)).gasto, 30 * 4 - 20);
});

// plano 2000d: REV-07 — escolhidos pelo custo (DA-023), o rótulo virou «Criativos com melhor custo por conversa»
test("AC-048 · mensal com os criativos que mais trouxeram conversa", () => {
  const M = montarDe({ metricas: [...serie(1, 120), ...serie(1, 120, { a: "A2", an: "Vídeo da doutora", conv: 1 })] });
  assert.match(M.relMensal(ultimoMes(M)), /Criativos com melhor custo por conversa: _Anúncio teste_ \(\d+ · R\$\s[\d,]+ cada\), _Vídeo da doutora_ \(\d+ · R\$\s[\d,]+ cada\)/);
});

test("AC-055 · resumo semanal (segunda-feira): 7 dias contra os 7 anteriores", () => {
  const M = montarDe({ metricas: serie(1, 20) });
  const t = M.relSemanal(M.R);
  assert.match(t, new RegExp(`Semana de ${M.ddmm(M.R - 6).replace("/", "\\/")} a ${M.ddmm(M.R).replace("/", "\\/")}`));
  assert.match(t, /• Investido: R\$\s210 \(estável vs\. semana anterior\)/);
});

test("AC-058 · mensal lista os marcos do mês («O que mudamos no mês»)", () => {
  const M0 = montarDe({ metricas: serie(1, 120) });
  const m = ultimoMes(M0), d = N.isoDe(M0.dataDe(m.de + 4));
  const M = montarDe({ metricas: serie(1, 120) }, { marcos: [{ d, t: "Troca de criativo" }, { d: N.isoDe(M0.dataDe(m.de - 3)), t: "fora do mês" }] });   // dia(1) caía DENTRO do mês no dia 1º (CI dia1T03:05Z)
  const t = M.relMensal(ultimoMes(M));
  assert.match(t, new RegExp(`\\*O que mudamos no mês\\*\\n• ${M.ddmm(m.de + 4).replace("/", "\\/")} — Troca de criativo`));
  assert.doesNotMatch(t, /fora do mês/);
});

test("AC-075 · pausa marcada no dia não dispara «Investimento parou de repente»", () => {
  const ms = [...serie(2, 12, { g: 50 }), metrica(dia(1), { g: 0, conv: 0 })];
  assert.equal(montarDe({ metricas: ms }).avaliar(iDe(1)).filter(a => a.regra.id === "r5").length, 1);
  const M = montarDe({ metricas: ms }, { marcos: [{ d: dia(1), t: "Pausa programada (feriado)" }] });
  assert.equal(M.avaliar(M.R).filter(a => a.regra.id === "r5").length, 0, "antes: alarme crítico para a pausa combinada");
});

test("AC-063 · cfg.diasFechados: dia sem atendimento não dispara «Investimento parou de repente»", () => {
  const ms = [...serie(2, 12, { g: 50 }), metrica(dia(1), { g: 0, conv: 0 })];
  const sem = montarDe({ metricas: ms });
  const dow = sem.dataDe(sem.R).getDay();
  assert.equal(sem.diaFechado(sem.R), false, "sem o campo, nenhum dia é fechado");
  const M = montarDe({ metricas: ms }, { diasFechados: [dow] });
  assert.equal(M.diaFechado(M.R), true); assert.equal(M.diaFechado(M.R - 1), false);
  assert.equal(M.avaliar(M.R).filter(a => a.regra.id === "r5").length, 0, "antes: alarme crítico no dia em que a clínica não abre");
  const outro = montarDe({ metricas: ms }, { diasFechados: [(dow + 3) % 7, "x", 9] });
  assert.equal(outro.avaliar(outro.R).filter(a => a.regra.id === "r5").length, 1, "outro dia fechado não esconde a queda de hoje");
});

test("AC-306 · diaSemNada: domingo sem investimento nem conversa (quem envia pode pular)", () => {
  const M = montarDe({ metricas: serie(2, 10) });
  assert.equal(M.diaSemNada(M.R), true);
  assert.equal(M.diaSemNada(M.R - 1), false);
});

/* ================= (b) painel.js — bloco PURO e peças de tela ================= */
const trechoPuro = (() => { const i = PJS.indexOf("/* ==== PURO: início"), f = PJS.indexOf("/* ==== PURO: fim ==== */"); assert.ok(i > 0 && f > i); return PJS.slice(i, f); })();
const P = vm.runInNewContext(`${trechoPuro};({ nivelCpa, amostraEficiente, fraseCustoPlat, ctrLeigo, vezesLeigo, msgRitmo, comparaMeses, ticketsSemNome, csvDe,
  nomeExibido, explicarStatusInteg, numCampo, valorMeta, diaVirou, diarioSugerido })`,
  { horaSP: () => "", quandoSP: () => "", int: N.int, dec: N.dec, brl: N.brl, brl0: N.brl0, plural: N.plural, pluralDec: N.pluralDec, Date, Math, JSON, String, Number, URL });
const pl = x => JSON.parse(JSON.stringify(x));

test("AC-224 · cor do custo pela meta da campanha/plataforma: Google sem meta própria fica neutro (não vermelho pela meta do Meta)", () => {
  assert.equal(P.nivelCpa(40, null), "dot-neutro");
  assert.equal(P.nivelCpa(10, 15), "dot-ok"); assert.equal(P.nivelCpa(18, 15), "dot-warn"); assert.equal(P.nivelCpa(30, 15), "dot-bad");
  const M = montarDe({ metricas: [...serie(1, 5), ...serie(1, 5, { p: "google", c: "G1", a: "GA", g: 40, conv: 1 })] }, { cpaAlvo: 15 });
  assert.equal(M.metaDaCampanha(M.CAMP["google:G1"]), null, "o Google não herda a meta de conversa do Meta");
  assert.equal(M.metaDaCampanha(M.CAMP["meta:C1"]), 15);
  fonte(PJS, /const pontoCpa = \(cpa, camp\) => nivelCpa\(cpa, metaDe\(camp\)\);/);
  fonte(PJS, /pontoCpa\(r\.t\.cpa, r\.c\)/);
});

test("AC-225/AC-226/AC-271 · ritmo: cedo sem projeção; orçamento esgotado sem «Segurar»; «investido»", () => {
  const base = { gasto: 300, proj: 2000, restam: 20, pass: 3, diasMes: 31, cedo: true };
  assert.match(P.msgRitmo(base, 1500, 60).msg, /^Cedo para projetar \(dia 3 do mês\)/);
  assert.doesNotMatch(P.msgRitmo(base, 1500, 60).msg, /fecha|projeção/);
  const esg = P.msgRitmo({ gasto: 1600, proj: 2400, restam: 10, pass: 21, diasMes: 31, cedo: false }, 1500, P.diarioSugerido(1500, 1600, 10));
  assert.equal(esg.aten, true);
  assert.doesNotMatch(esg.msg, /Segurar/, "antes: «Segurar R$ … por dia fecha dentro. O orçamento do mês já foi todo usado.»");
  assert.match(esg.msg, /já foi todo usado \(R\$\s1\.600 de R\$\s1\.500\) e faltam 10 dias/);
  assert.match(P.msgRitmo({ gasto: 1000, proj: 1800, restam: 10, pass: 21, cedo: false }, 1500, 50).msg, /Segurar R\$\s30,00 por dia/);
  fonte(PJS, /<span>investido até ontem<\/span>/);
  fonte(PJS, /const cedo = m\.cedo \|\| m\.pass < DIAS_MIN_PROJECAO;/);
});

test("AC-227/AC-228/AC-229 · Meta × Google só compara custo com as duas bases; «contato»; eficiente com amostra", () => {
  assert.equal(P.fraseCustoPlat(NaN, 12), "", "antes: «E ainda sai mais barata.» com o Google sem conversão");
  assert.equal(P.fraseCustoPlat(20, null), "");
  assert.match(P.fraseCustoPlat(20, 12), /Cada contato custa mais ali \(R\$\s20,00 × R\$\s12,00\)/);
  assert.match(P.fraseCustoPlat(10, 12), /cada contato ainda sai mais barato/);
  assert.equal(P.amostraEficiente({ fecharam: 1, conversas: 4 }), false, "antes: 1 fechamento elegia a «mais eficiente»");
  assert.equal(P.amostraEficiente({ fecharam: 3, conversas: 4 }), true);
  assert.equal(P.amostraEficiente({ fecharam: 1, conversas: 12 }), true);
  fonte(PJS, /rows\.filter\(r => amostraEficiente\(r\.k\) && !comAlerta\.has\(r\.c\.id\)\)/);
});

test("AC-230/AC-231/AC-232 · funil com nota acima de 100%; mês a mês só entre meses fechados; agendou/fechou com int()", () => {
  fonte(PJS, /e\.r > 100\) \? "" : `<small class="fun-nota">\$\{esc\(NOTA_FUNIL\)\}<\/small>`/);
  assert.deepEqual(pl(P.comparaMeses([{ fecharam: 4, parcial: false }, { fecharam: 9, parcial: false }, { fecharam: 2, parcial: true }])), { de: 4, para: 9, parcial: 2 },
    "antes: «De 4 para 2» comparando com o mês corrente pela metade");
  assert.deepEqual(pl(P.comparaMeses([{ fecharam: 5, parcial: true }])), { de: null, para: null, parcial: 5 });
  fonte(PJS, /td\("ag", int\(r\.k\.agendadas\)\)\}\$\{td\("fe", int\(r\.k\.fecharam\)\)\}/);
});

test("AC-233/AC-234 · criativos: rótulo por plataforma e «dentro dos limites» no lugar de «ok»", () => {
  fonte(PJS, /\["Conversões", "Custo\/conversão"\] : gCri \? \["Conversas e conversões", "Custo\/contato"\]/);
  fonte(PJS, /<span class="chip chip-ok">dentro dos limites<\/span>/);
  assert.ok(!/<span class="chip chip-ok">ok<\/span>/.test(PJS));
});

test("AC-235/AC-236/AC-237/AC-238 · radar leigo: 0,9% é 9 em 1.000; 2,5 vezes; hora de SP; badge sem informativo", () => {
  assert.equal(P.ctrLeigo(0.9), "menos de 9 em cada 1.000", "antes: «menos de 1 em cada 100»");
  assert.equal(P.ctrLeigo(1.5), "menos de 15 em cada 1.000");
  assert.equal(P.ctrLeigo(2), "menos de 2 em cada 100");
  assert.equal(P.vezesLeigo(2.5), "2,5", "antes: «3»"); assert.equal(P.vezesLeigo(3), "3");
  fonte(PJS, /const horaCheia = \(\) => `\$\{FMT_HORA\.format\(new Date\(\)\)\.slice\(0, 2\)\}:00`;/);
  assert.ok(!/new Date\(\)\.getHours\(\)/.test(PJS), "nada de hora do aparelho");
  fonte(PJS, /atualizarBadge\(atuais\.filter\(a => a\.sev !== "info"\)\.length \+ conexoesCaidas\(\)\);/);
  fonte(PJS, /M\.avaliar\(M\.R, true\)\.filter\(a => a\.sev !== "info"\)\.length/);
});

test("AC-239/AC-240/AC-275 · Ajustes: valor sem nome avisa; meta do Google; vírgula e milhar nos números", () => {
  assert.equal(P.ticketsSemNome([["Implante", "3500"], ["", "250"], ["", ""]]), 1);
  fonte(PJS, /Dê um nome ao \$\{M \? M\.VOC\.servico : "serviço"\} que tem valor/);
  fonte(PJS, /id="cl-cpag"/); fonte(PJS, /cpaAlvoGoogle: num\("#cl-cpag", null\)/);
  fonte(PJS, /#\/config\/anuncios" target="_blank" rel="noopener">ajustar no Órbita/);
  assert.equal(P.valorMeta("1.500").valor, 1500, "antes: 1,5");
  assert.equal(P.valorMeta("1.234,50").valor, 1234.5);
  assert.equal(P.valorMeta("R$ 12,5").valor, 12.5);
  assert.equal(P.valorMeta("12.5").valor, 12.5);
  assert.equal(P.numCampo(12.5), "12,5"); assert.equal(P.numCampo(null), "");
  assert.ok(!/<input type="number" id="cl-(cpa|orc|fee)"/.test(PJS), "os campos de valor aceitam vírgula (texto + inputmode decimal)");
});

test("AC-241 · status da integração em português (o técnico fica no title)", () => {
  const e = P.explicarStatusInteg("erro — invalid_grant (Token has been expired or revoked.)");
  assert.match(e.texto, /o acesso expirou ou foi revogado/);
  assert.match(e.tecnico, /invalid_grant/);
  assert.deepEqual(pl(P.explicarStatusInteg("ok — 120 linhas")), { texto: "ok — 120 linhas", tecnico: "" });
  fonte(PJS, /const ex = explicarStatusInteg\(st\.status\);/);
});

test("AC-242 · confirmação no diálogo do próprio painel (sem confirm() nativo)", () => {
  assert.ok(!/[^.]\bconfirm\([^)]/.test(PJS), "nenhum confirm() solto (só o window.confirm de reserva sem <dialog>)");
  assert.equal((PJS.match(/await confirmar\(/g) || []).length, 3);
  fonte(HTML, /<dialog class="dlg-confirmar" id="dlg-confirmar" aria-labelledby="dlg-confirmar-t">/);
  fonte(PJS, /d\.showModal\(\);/); fonte(CSS, /\.dlg-confirmar::backdrop/);
});

test("AC-243 · mês do período com os limites dele (não o início da janela de 30 dias)", () => {
  fonte(PJS, /const m = M\.mesesDados\(\)\.find\(x => x\.de <= M\.R && x\.ate >= M\.R\);/);
});

test("AC-245/AC-273 · modo apresentação: iniciais em toda lista de pacientes", () => {
  assert.equal(P.nomeExibido("Ana Paula Souza", true), "A. P. S.");
  assert.equal(P.nomeExibido("Ana Paula", false), "Ana Paula");
  fonte(PJS, /const nomeTela = nome => \(OCULTAR_NOMES \? nomeExibido\(nome, true\) : nomeCurto\(nome\)\);/);
  assert.ok(!/nomeCurto\(L\.nome\)/.test(PJS), "toda lista usa nomeTela");
});

test("AC-248 · CSV de campanhas (separador ;, vírgula decimal, BOM, aspas quando precisa)", () => {
  const csv = P.csvDe([["Campanha", "Investido"], ["Sorriso; promo", 1234.567], ['Diz "oi"', null]]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.equal(csv.slice(1), 'Campanha;Investido\r\n"Sorriso; promo";1234,57\r\n"Diz ""oi""";');
  fonte(HTML, /id="btn-csv-camp"/); fonte(PJS, /csvDe\(\[cab, \.\.\.rows\.map/);
});

test("AC-250/AC-252/AC-253/AC-255/AC-266 · CSS: alvos de 44 px no toque e número de página na folha", () => {
  fonte(CSS, /@media \(pointer: coarse\), \(max-width: 480px\) \{\n  th button, \.sel-cli-m select, \.filtros-m, \.ribbon-chip \{ min-height: 44px; \}/);
  fonte(CSS, /@page \{ @bottom-right \{ content: "página " counter\(page\) " de " counter\(pages\);/);
});

test("AC-068/AC-270/AC-272/AC-282/AC-287 · virada do dia, tentar de novo, lista de marcos, sair da demo, foco no erro de abertura", () => {
  assert.equal(P.diaVirou("2026-10-20", "2026-10-21"), true);
  assert.equal(P.diaVirou("2026-10-21", "2026-10-21"), false);
  assert.equal(P.diaVirou(undefined, "2026-10-21"), false);
  fonte(PJS, /document\.addEventListener\("visibilitychange", \(\) => \{[\s\S]{0,320}diaVirou\(S\.dados\.hoje, hojeSP\(\)\)/);   // plano 2000d: o comentário do KX-010 entrou no meio
  fonte(PJS, /toast\(api\.mensagemErro\(e\), "erro", \{ rotulo: "Tentar de novo", fn: \(\) => carregarDados\(\) \}\)/);
  fonte(HTML, /<details class="marcos-lista" id="marcos-lista" hidden>/); fonte(PJS, /data-marco-rm="\$\{esc\(m\.d\)\}"/);
  fonte(HTML, /<a class="ribbon-sair" id="ribbon-sair" href="\.\/">Sair da demonstração<\/a>/);
  fonte(PJS, /if \(comAcoes\) requestAnimationFrame\(\(\) => \{ const b = \$\("#boot-tentar"\);/);
});

/* ================= (c) folha.js, dados.js, demo.js ================= */
test("AC-258/AC-259/AC-260/AC-261 · folha: conversa ≠ conversão do Google, plural certo, sem «— cada», nome da plataforma", () => {
  const M = montarDe({ metricas: [...serie(1, 120, { conv: 0 }), ...serie(1, 120, { p: "google", c: "G1", a: "GA", conv: 0.5 })] });
  const m = ultimoMes(M), k = F.contatosFolha(M, m);
  assert.equal(k.conversas, 0); assert.ok(k.google > 0);
  assert.match(k.frase, /<b>0 conversas<\/b> no WhatsApp e <b>[\d,]+ contatos<\/b> pelo Google/, "antes: tudo virava «conversas no WhatsApp»");
  const M1 = montarDe({ metricas: [metrica(dia(40), { conv: 1 })] });
  assert.equal(F.contatosFolha(M1, { de: iDe(40), ate: iDe(40) }).frase, "<b>1 conversa</b> no WhatsApp", "antes: «1 conversas»");
  fonte(FJS, /\$\{fin\(t\.cpa\) \? ` · \$\{brl\(t\.cpa\)\} cada` : ""\}/);
  assert.equal(F.platFolha("tiktok"), "TikTok", "antes: «Instagram e Facebook»"); assert.equal(F.platFolha("meta"), "Instagram e Facebook");
});

test("AC-262 · rodapé da folha com a marca da agência; Nexus só sem marca", () => {
  assert.deepEqual(F.assinaturaFolha({}), { nome: "Nexus", cidade: "Taubaté-SP", nexus: true });
  const r = F.assinaturaFolha({ agenciaNome: "Agência Alfa", agenciaCidade: "Campinas-SP" });
  assert.equal(r.nome, "Agência Alfa"); assert.equal(r.cidade, "Campinas-SP"); assert.equal(r.nexus, false);
  assert.equal(F.assinaturaFolha({}, { nome: "Beta Mídia" }).nome, "Beta Mídia");
  assert.ok(!/Preparado pela <b>Nexus<\/b>/.test(FJS), "nada de «Nexus» fixo no rodapé");
  fonte(FJS, /Preparado pela <b>\$\{esc\(ass\.nome\)\}<\/b>/);
});

test("AC-263/AC-264/AC-265 · folha: mês anterior ao lado, marcos do mês e «Para o próximo mês» editável", () => {
  fonte(FJS, /vs\. \$\{MESES\[ant\.mes\]\}: \$\{int\(ant\.fecharam\)\} → \$\{int\(c\.fecharam\)\}/);   // plano 2000d: com int() (KX-028)
  fonte(FJS, /M\.marcosEntre\(m\.de, m\.ate\)/); fonte(FJS, /O que mudamos no mês/);
  fonte(FJS, /contenteditable="true" spellcheck="true"/); fonte(PJS, /editavel: S\.demo \|\| gestor\(\),/);
  fonte(CSS, /@media print \{ \.fl-dica \{ display: none !important; \}/);
});

test("AC-284 · tempo-limite do navegador tem texto próprio (não «operação grande demais»)", () => {
  assert.match(api.mensagemErro({ codigo: "tempo_esgotado", local: true }), /demorou demais/);
  assert.match(api.mensagemErro({ codigo: "tempo_esgotado" }), /grande demais/, "o do banco segue como era");
  fonte(ler("web/dados.js"), /rej\(erro\("tempo_esgotado", \{ local: true \}\)\)/);
});

test("AC-285 · leitura repete 1 vez numa queda de rede; escrita nunca repete sozinha", async () => {
  let n = 0;
  api.usarFetch(async () => { n++; if (n === 1) throw new TypeError("fetch failed"); return { ok: true, status: 200, text: async () => JSON.stringify({ ok: 1 }) }; });
  try {
    assert.deepEqual(await api.dados("tk", "c1"), { ok: 1 }, "antes: a 1ª queda derrubava a tela");
    assert.equal(n, 2);
    n = 0;
    api.usarFetch(async () => { n++; throw new TypeError("fetch failed"); });
    await assert.rejects(api.leadSalvar("tk", "c1", {}), e => e.codigo === "sem_conexao");
    assert.equal(n, 1, "salvar não repete");
  } finally { api.usarFetch(null); }
  assert.ok(api.RPC_LEITURA.has("nx_dados") && !api.RPC_LEITURA.has("nx_lead_salvar"));
});

test("AC-007 (demo) · a demonstração segue com valores redondos depois do fim do arredondamento na dezena", () => {
  const M = N.montar(gerarDemo({ hoje: HOJE }));
  for (const L of M.LEADS.filter(x => x.fechou)) { const v = M.valorDe(L); if (v.estimado) assert.equal(v.valor % 10, 0, `${L.servico}: ${v.valor}`); }
  fonte(ler("web/demo.js"), /fator: fatorRedondo\(servico, \.85 \+ r\(\) \* \.3\)/);
});
