/* ============================================================
   ÓRBITA — plano «100+ melhorias» (08/10/2026) · frente P
   Painel clássico, web/nucleo.js e CI. Node puro (node --test), sem rede.
   (a) núcleo: receita só com valor real, balde «sem campanha», nome mais recente,
       mensal 0÷0, melhor/pior com uma campanha, conversões do Google, vocabulário por vertical
   (b) dados.js: dicionário de erros do Órbita (+ hint)
   (c) painel.js, bloco PURO: estados do Órbita, saas_url, nota de receita, retorno do «Fazer agora»
   (d) estática: CSP, Ajustes só do super, remover segredo, campos limpáveis, estados de tela
   (e) escape: todo `${…}` em HTML montado por string passa por esc()/formatador — snapshot revisado
   (f) workflows: Pages só com o clássico (+ redirecionador e sw que se desinstala), CI com deno check
   (g) contrato clássico × Órbita: as RPCs que o clássico chama existem no SQL com esses parâmetros;
       as mudanças prometidas pela frente S-B são conferidas quando a migração aparece
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const ler = f => readFileSync(join(RAIZ, f), "utf8").replace(/\r\n/g, "\n");

const N = await import("../web/nucleo.js");
const { gerarDemo, CFG_DEMO } = await import("../web/demo.js");
const api = await import("../web/dados.js");

const HOJE = "2026-09-27";
const cli = (extra = {}) => ({ id: "c1", slug: "x", nome: "Clínica Teste", cfg: {}, ...extra });
const montarDe = (o = {}) => N.montar(N.datasetDeLinhas({ metricas: [], leads: [], cliente: cli(), hoje: HOJE, dias: 130, ...o }));
const dia = n => { const d = N.meioDia(HOJE); d.setDate(d.getDate() - n); return N.isoDe(d); };   // n dias antes de hoje
const metrica = (d, o = {}) => ({ p: "meta", d, n: "anuncio", c: "C1", cn: "Campanha teste", a: "A1", an: "Anúncio teste",
  imp: 1000, alc: 800, freq: 1.2, cli: 30, g: 30, conv: 2, ...o });
const leadFechado = (o = {}) => ({ id: 1, nome: "Ana", origem: "anuncio", plataforma: "meta", campanha_ext: "C1", anuncio_ext: "A1",
  etapa: "fechou", data_conversa: dia(8), data_agenda: dia(7), data_consulta: dia(3), valor: null, servico: null, ...o });
const semanaDeMetricas = (o = {}) => Array.from({ length: 10 }, (_, k) => metrica(dia(k + 1), o));

/* ============================================================
   (a) NÚCLEO
   ============================================================ */
test("P1 · receita: fechou sem valor e sem tabela NÃO vale R$ 420 — vira «sem valor informado»; estimativa só com cfg.ticket", () => {
  assert.equal(N.CFG_PADRAO.fee, 0, "fee de gestão padrão é 0");
  assert.deepEqual(N.CFG_PADRAO.ticket, {}, "sem tabela odontológica embutida");
  assert.deepEqual(N.cfgCom({}).ticket, {}, "cfgCom não herda tabela nenhuma");
  const M0 = montarDe({ metricas: semanaDeMetricas(), leads: [leadFechado()] });
  const c0 = M0.crmTot(M0.R - 29, M0.R);
  assert.equal(c0.fecharam, 1);
  assert.equal(c0.receita, 0, "antes: 420 inventado pela tabela padrão");
  assert.equal(c0.semValor, 1);
  assert.equal(c0.receitaEstimada, 0);
  assert.deepEqual(M0.valorDe(M0.LEADS[0]), { valor: 0, estimado: false, semValor: true });
  // o cliente configurou a tabela: entra como ESTIMATIVA, separada da real
  const M1 = montarDe({ metricas: semanaDeMetricas(), leads: [leadFechado()], cliente: cli({ cfg: { ticket: { "Clínica geral": 420 } } }) });
  const c1 = M1.crmTot(M1.R - 29, M1.R);
  assert.deepEqual([c1.receita, c1.receitaEstimada, c1.receitaReal, c1.semValor], [420, 420, 0, 0]);
  assert.equal(M1.valorDe(M1.LEADS[0]).estimado, true);
  // valor real sempre vence a tabela
  const M2 = montarDe({ metricas: semanaDeMetricas(), leads: [leadFechado({ valor: 3000 })], cliente: cli({ cfg: { ticket: { "Clínica geral": 420 } } }) });
  const c2 = M2.crmTot(M2.R - 29, M2.R);
  assert.deepEqual([c2.receita, c2.receitaReal, c2.receitaEstimada, c2.semValor], [3000, 3000, 0, 0]);
  // serviço fora da tabela: também sem valor (antes dava R$ 0 somado como se fosse receita)
  const M3 = montarDe({ metricas: semanaDeMetricas(), leads: [leadFechado({ servico: "Botox" })], cliente: cli({ cfg: { ticket: { "Clínica geral": 420 } } }) });
  assert.equal(M3.crmTot(M3.R - 29, M3.R).semValor, 1);
});

test("P1 · textos do WhatsApp: mensal e diário não escrevem dinheiro inventado e marcam a estimativa", () => {
  const mes = M => M.mesesDados().find(m => m.completo && m.mes === 7);   // agosto/2026
  const leadAgo = (o = {}) => leadFechado({ data_conversa: "2026-08-05", data_agenda: "2026-08-07", data_consulta: "2026-08-12", ...o });
  const metAgo = Array.from({ length: 31 }, (_, k) => metrica(`2026-08-${String(k + 1).padStart(2, "0")}`));
  const semValor = montarDe({ metricas: metAgo, leads: [leadAgo({ servico: "Botox" })] });
  const t0 = semValor.relMensal(mes(semValor));
  assert.doesNotMatch(t0, /do resultado do mês/, "0 ÷ 0 não vira «— do resultado do mês»");
  assert.doesNotMatch(t0, /Tratamentos fechados: R\$\s?0/, "não escreve R$ 0 como se fosse receita");
  assert.doesNotMatch(t0, /R\$\s?420/);
  assert.match(t0, /1 fechamento sem valor informado/);
  assert.match(t0, /1 paciente fechou tratamento/, "o fechamento continua contado");
  // com a tabela do cliente: estimativa dita como estimativa
  const est = montarDe({ metricas: metAgo, leads: [leadAgo()], cliente: cli({ cfg: { ticket: { "Clínica geral": 420 } } }) });
  const t1 = est.relMensal(mes(est));
  assert.match(t1, /Tratamentos fechados: R\$\s?420 _\(estimativa pelo valor de cada tratamento\)_/);
  assert.match(t1, /virou \*R\$ [\d,]+\* em tratamentos _\(estimativa\)_/);
  // valor real: nada de «estimativa»
  const real = montarDe({ metricas: metAgo, leads: [leadAgo({ valor: 3000 })] });
  const t2 = real.relMensal(mes(real));
  assert.match(t2, /Tratamentos fechados: R\$\s?3\.000\n/);
  assert.doesNotMatch(t2, /estimativa/);
  assert.match(t2, /1 paciente de clínica geral — 100% do resultado do mês/);
  // diário: «No consultório (7 dias)» segue a mesma regra
  const d0 = montarDe({ metricas: semanaDeMetricas(), leads: [leadFechado()] }).relDiario(semValor.R);
  assert.match(d0, /1 fechou · 1 fechamento sem valor informado/);
  assert.doesNotMatch(d0, /R\$\s?0 em tratamentos/);
  const d1 = montarDe({ metricas: semanaDeMetricas(), leads: [leadFechado({ valor: 900 })] }).relDiario(semValor.R);
  assert.match(d1, /1 fechou · R\$\s?900 em tratamentos$/m);
  const d2 = montarDe({ metricas: semanaDeMetricas(), leads: [leadFechado()], cliente: cli({ cfg: { ticket: { "Clínica geral": 420 } } }) }).relDiario(semValor.R);
  assert.match(d2, /R\$\s?420 em tratamentos \(estimativa\)/);
  // contexto da IA diz o que é estimado e o que falta
  const ctx = montarDe({ metricas: semanaDeMetricas(), leads: [leadFechado()] }).contextoIA(semValor.R);
  assert.deepEqual([ctx.consultorio_7d.receita, ctx.consultorio_7d.receita_estimada, ctx.consultorio_7d.fechamentos_sem_valor], [0, false, 1]);
});

test("P1 · a demo odontológica continua a mesma (tabela, fee 997 e vertical vêm dela, não do núcleo)", () => {
  const ds = gerarDemo({ nome: "Clínica Demonstração", hoje: HOJE }), M = N.montar(ds);
  assert.equal(ds.vertical, "odonto");
  assert.equal(M.CFG.fee, 997);
  assert.equal(CFG_DEMO.ticket["Clínica geral"], 420);
  const c = M.crmTot(M.R - 29, M.R);
  assert.deepEqual([c.conversas, c.fecharam, c.receita], [106, 13, 13550]);
  assert.equal(c.receitaEstimada, 13550, "na demo tudo é estimativa pela tabela dela");
  assert.match(M.relMensal(M.mesesDados().find(m => m.completo && m.mes === 7)), /_\(estimativa pelo valor de cada tratamento\)_/);
});

test("P2 · lead de anúncio sem campanha/anúncio reconhecido entra no funil (balde «sem campanha identificada»)", () => {
  const leads = [
    { id: 1, nome: "Sem ids", origem: "anuncio", plataforma: "meta", etapa: "nova", data_conversa: dia(2) },
    { id: 2, nome: "Anúncio ainda não sincronizado", origem: "anuncio", plataforma: "meta", anuncio_ext: "A_NOVO", etapa: "nova", data_conversa: dia(2) },
    { id: 3, nome: "Reconhecido", origem: "anuncio", plataforma: "meta", campanha_ext: "C1", anuncio_ext: "A1", etapa: "nova", data_conversa: dia(2) },
    { id: 4, nome: "Só origem", origem: "anuncio", plataforma: null, etapa: "nova", data_conversa: dia(2) },
    { id: 5, nome: "Indicação", origem: "indicacao", etapa: "nova", data_conversa: dia(2) },
  ];
  const M = montarDe({ metricas: semanaDeMetricas(), leads });
  const c = M.crmTot(M.R - 6, M.R);
  assert.equal(c.conversas, 4, "antes: só 1 (os outros 3 caíam fora do funil como org:anuncio)");
  assert.equal(M.crmTot(M.R - 6, M.R, { organicos: true }).conversas, 5);
  const b = M.CAMP["meta:nao_identificada"];
  assert.ok(b && b.semCampanha && b.plat === "meta", "balde do Meta");
  assert.equal(b.nome, "Anúncio sem campanha identificada");
  assert.deepEqual(M.LEADS.filter(L => L.camp === "meta:nao_identificada").map(L => L.id), [1, 2]);
  assert.equal(M.LEADS.find(L => L.id === 3).camp, "meta:C1");
  const so = M.LEADS.find(L => L.id === 4);
  assert.equal(so.plat, "anuncio", "origem anúncio sem plataforma: ainda é anúncio");
  assert.equal(so.camp, "anuncio:nao_identificada");
  assert.equal(N.nomePlat("anuncio"), "Anúncio");
  assert.equal(N.nomePlat(null), "Sem anúncio");
  assert.equal(M.LEADS.find(L => L.id === 5).plat, null, "indicação continua fora do funil de anúncios");
  assert.ok(!M.CAMP["org:anuncio"], "a «campanha» fantasma org:anuncio sumiu");
  // o balde não concorre a «anúncio que mais trouxe resultado» nem a melhor/pior (não tem gasto)
  assert.doesNotMatch(M.relDiario(M.R), /sem campanha identificada/);
});

test("P2 · campanha e anúncio renomeados: vale o nome da linha mais RECENTE (em qualquer ordem), inclusive no alerta r2", () => {
  const antigas = Array.from({ length: 26 }, (_, k) => metrica(dia(k + 4), { cn: "Nome ANTIGO", an: "Criativo ANTIGO" }));
  const novas = [1, 2, 3].map(k => metrica(dia(k), { cn: "Nome NOVO", an: "Criativo NOVO", conv: 0, g: 30 }));
  for (const metricas of [[...antigas, ...novas], [...novas, ...antigas]]) {
    const M = montarDe({ metricas });
    assert.equal(M.CAMP["meta:C1"].nome, "Nome NOVO");
    assert.equal(M.CRI["meta:A1"].nome, "Criativo NOVO");
    const r2 = M.avaliar(M.R).find(a => a.regra.id === "r2");
    assert.ok(r2, "3 dias com gasto e sem conversa disparam a r2");
    assert.match(r2.msg, /^Nome NOVO gastou/);
    assert.doesNotMatch(M.textoAlerta([r2]), /ANTIGO/);
  }
  // sem nome na linha nova (lead com campanha_ext que o sync ainda não trouxe) o nome conhecido fica
  const M = montarDe({ metricas: antigas, leads: [{ id: 9, origem: "anuncio", plataforma: "meta", campanha_ext: "C1", etapa: "nova", data_conversa: dia(1) }] });
  assert.equal(M.CAMP["meta:C1"].nome, "Nome ANTIGO");
  assert.equal(montarDe({ leads: [{ id: 9, origem: "anuncio", plataforma: "meta", campanha_ext: "C9", etapa: "nova", data_conversa: dia(1) }] }).CAMP["meta:C9"].nome, "Campanha C9");
});

test("P3 · diário com UMA campanha elegível destaca o custo dela; com duas, melhor e pior", () => {
  const uma = montarDe({ metricas: semanaDeMetricas() }).relDiario(129);
  assert.match(uma, /• Campanha teste — R\$\s15,00 por conversa \(única campanha com conversa na semana\)/);
  assert.doesNotMatch(uma, /Melhor:|Pior:/);
  const duas = montarDe({ metricas: [...semanaDeMetricas(), ...semanaDeMetricas({ c: "C2", cn: "Outra", a: "A2", g: 60 })] }).relDiario(129);
  assert.match(duas, /🟢 Melhor: Campanha teste — R\$\s15,00/);
  assert.match(duas, /🔴 Pior: Outra — R\$\s30,00/);
});

test("P3 · conversões do Google são «conversões» (com fração), nunca «conversas no WhatsApp»", () => {
  const soMeta = montarDe({ metricas: semanaDeMetricas() }).relDiario(129);
  assert.match(soMeta, /• Conversas no WhatsApp: 2 /);
  assert.match(soMeta, /• Meta: R\$\s30,00 → 2 conversas · CTR/);
  const soGoogle = montarDe({ metricas: semanaDeMetricas({ p: "google", conv: 1.5 }) });
  const dg = soGoogle.relDiario(129);
  assert.match(dg, /• Conversões \(Google\): 1,5 /);
  assert.match(dg, /• Google: R\$\s30,00 → 1,5 conversões · CTR/);
  assert.match(dg, /investidos · 10,5 conversões · R\$/);
  assert.doesNotMatch(dg, /Conversas no WhatsApp/);
  const ambos = montarDe({ metricas: [...semanaDeMetricas(), ...semanaDeMetricas({ p: "google", c: "G1", a: "GA1", conv: 1 })] }).relDiario(129);
  assert.match(ambos, /• Conversas e conversões: 3 /);
  assert.match(ambos, /investidos · 21 conversas e conversões · /, "7 dias × (2 do Meta + 1 do Google)");
  assert.equal(N.pluralDec(1.5, "conversão", "conversões"), "1,5 conversões");
  assert.equal(N.pluralDec(1, "conversão", "conversões"), "1 conversão");
  // mensal com Google diz a mesma coisa
  const metAgo = Array.from({ length: 31 }, (_, k) => metrica(`2026-08-${String(k + 1).padStart(2, "0")}`, { p: "google", conv: 0.5 }));
  const Mg = montarDe({ metricas: metAgo });
  assert.match(Mg.relMensal(Mg.mesesDados().find(m => m.completo && m.mes === 7)), /💬 15,5 conversões \(custo médio/);
});

test("P3 · vocabulário por vertical nos textos: loja/oficina/genérico sem 🦷 nem «paciente»; sem vertical fica odonto", () => {
  const metAgo = Array.from({ length: 31 }, (_, k) => metrica(`2026-08-${String(k + 1).padStart(2, "0")}`));
  const leadAgo = leadFechado({ data_conversa: "2026-08-05", data_agenda: "2026-08-07", data_consulta: "2026-08-12", valor: 1200, servico: "Tênis" });
  const mensal = vertical => { const M = montarDe({ metricas: metAgo, leads: [leadAgo], cliente: cli({ vertical }) }); return M.relMensal(M.mesesDados().find(m => m.completo && m.mes === 7)); };
  const loja = mensal("loja");
  assert.match(loja, /^🛍️ \*Clínica Teste · Resultados de agosto\*/);
  assert.match(loja, /🛍️ \*1 cliente comprou\*/);
  assert.match(loja, /📅 1 visita agendada/);
  assert.match(loja, /Vendas fechadas: R\$\s?1\.200/);
  assert.match(loja, /aos clientes satisfeitos/);
  assert.doesNotMatch(loja, /🦷|paciente|tratamento|consultório/i);
  assert.match(mensal("oficina"), /🔧 \*1 cliente aprovou o orçamento\*/);
  assert.match(mensal("generico"), /📈 \*1 cliente fechou\*/);
  assert.match(mensal(undefined), /🦷 \*1 paciente fechou tratamento\*/, "sem vertical: o de sempre (default da coluna no banco)");
  assert.match(mensal("coisa-nova"), /🦷/, "vertical desconhecida cai no padrão, não quebra");
  const diario = montarDe({ metricas: semanaDeMetricas(), leads: [leadFechado({ valor: 500 })], cliente: cli({ vertical: "loja" }) }).relDiario(129);
  assert.match(diario, /\*Na loja \(7 dias\)\*/);
  assert.match(diario, /1 visita agendada · 1 veio · 1 fechou · R\$\s?500 em vendas/);
  assert.equal(montarDe({ cliente: cli({ vertical: "loja" }) }).VOC.servicoPadrao, "Não informado");
  assert.equal(montarDe({ leads: [{ id: 1, origem: "anuncio", plataforma: "meta", etapa: "nova", data_conversa: dia(1) }], cliente: cli({ vertical: "oficina" }) }).LEADS[0].servico, "Não informado");
  assert.equal(montarDe({ leads: [{ id: 1, origem: "anuncio", plataforma: "meta", etapa: "nova", data_conversa: dia(1) }] }).LEADS[0].servico, "Clínica geral");
  assert.deepEqual(Object.keys(N.VOCABULARIO).sort(), ["generico", "loja", "odonto", "oficina"]);
  // radar (avaliar/textoAlerta): sem vocabulário odontológico; a r2 do Google fala em conversão, a do Meta em conversa no WhatsApp
  const tresDias = (o = {}) => [1, 2, 3].map(k => metrica(dia(k), { conv: 0, g: 30, ...o }));
  // (a conta registra conversão em outro dia: com acompanhamento desligado a r2 do Google não sai — teste da revisão abaixo)
  const Mg = montarDe({ metricas: [...tresDias({ p: "google", c: "G1", cn: "Pesquisa", a: "GA1" }), metrica(dia(20), { p: "google", c: "G1", cn: "Pesquisa", a: "GA1", conv: 1, g: 10 })],
    cliente: cli({ vertical: "loja" }) });
  const r2g = Mg.avaliar(Mg.R).find(a => a.regra.id === "r2");
  assert.ok(r2g, "3 dias com gasto e 0 conversões disparam a r2");
  assert.match(r2g.msg, /^Pesquisa gastou R\$\s90,00 em 3 dias sem nenhuma conversão registrada\.$/);
  assert.match(r2g.acao, /sem registrar conversão/);
  assert.doesNotMatch(r2g.msg + r2g.acao, /conversa no WhatsApp|sem trazer conversa/);
  assert.doesNotMatch(Mg.textoAlerta(Mg.avaliar(Mg.R, true)), /🦷|paciente|tratamento|consultório/i);
  const Mm = montarDe({ metricas: tresDias() });
  const r2m = Mm.avaliar(Mm.R).find(a => a.regra.id === "r2");
  assert.match(r2m.msg, /sem nenhuma conversa no WhatsApp\.$/);
  assert.match(r2m.acao, /gastou sem trazer conversa/);
});

/* ============================================================
   (b) dados.js
   ============================================================ */
test("P4 · códigos do Órbita viram frases (não «(modulo_desligado)»); hint completa bloqueio e limite", () => {
  for (const c of ["modulo_desligado", "so_plataforma", "teste_expirado", "conta_suspensa", "sem_permissao", "slug_em_uso", "numero_em_uso", "limite_atingido", "cliente_pausado", "muitas_tentativas", "funcao_invalida", "dados_invalidos"]) {
    const t = api.mensagemErro({ codigo: c });
    assert.ok(api.MENSAGENS[c], c);
    assert.doesNotMatch(t, new RegExp(c), `${c} saiu cru`);
    assert.doesNotMatch(t, /Não deu certo agora/, c);
  }
  assert.match(api.mensagemErro({ codigo: "modulo_desligado" }), /não faz parte do seu plano/);
  assert.match(api.mensagemErro({ codigo: "so_plataforma" }), /equipe da plataforma/);
  assert.equal(api.mensagemErro({ codigo: "muitas_tentativas", detalhe: { hint: "12" } }), "Muitas tentativas de entrada. Tente de novo em 12 min.");
  assert.match(api.mensagemErro({ codigo: "muitas_tentativas", detalhe: { hint: "tente em 10 minutos" } }), /tente em 10 minutos$/);
  assert.match(api.mensagemErro({ codigo: "muitas_tentativas" }), /Aguarde alguns minutos/);
  assert.equal(api.mensagemErro({ codigo: "limite_plano", detalhe: { hint: "contatos:500" } }), "Seu plano permite até 500 contatos. Para aumentar, fale com o suporte.");
  assert.match(api.mensagemErro({ codigo: "limite_plano", detalhe: { hint: "org_usuarios:3" } }), /até 3 usuarios/);
  assert.match(api.mensagemErro({ codigo: "coisa_nova" }), /coisa_nova/, "código desconhecido continua aparecendo para o suporte");
});

test("P4 · a rpc() entrega o hint do PostgREST em e.detalhe (é dele que a mensagem sai)", async () => {
  api.usarFetch(async () => new Response(JSON.stringify({ code: "P0001", message: "muitas_tentativas", hint: "7", details: null }), { status: 429, headers: { "Content-Type": "application/json" } }));
  await assert.rejects(api.entrar("a@b.c", "x"), e => { assert.equal(e.codigo, "muitas_tentativas"); assert.equal(api.mensagemErro(e), "Muitas tentativas de entrada. Tente de novo em 7 min."); return true; });
  api.usarFetch(null);
});

/* ============================================================
   (c) painel.js — bloco PURO
   ============================================================ */
const JS = ler("web/painel.js"), HTML = ler("web/index.html"), CSS = ler("web/painel.css");
const trechoPuro = (() => { const i = JS.indexOf("/* ==== PURO: início"), f = JS.indexOf("/* ==== PURO: fim ==== */"); assert.ok(i > 0 && f > i); return JS.slice(i, f); })();
const P = runInNewContext(`${trechoPuro};({ estadoDeErro, normalizarSaasUrl, notaReceita, execucaoDoPedido, ORBITA_URL, ESTADOS_ORBITA })`,
  { horaSP: iso => new Date(iso).toISOString().slice(11, 16), quandoSP: () => "", Date, Math, JSON, String, Number, URL });

test("P4 · estadoDeErro: módulo desligado / teste vencido / sem permissão levam ao Órbita; suspenso e sem acesso são erro", () => {
  const md = P.estadoDeErro("modulo_desligado", "x");
  assert.deepEqual([md.orbita, md.erro], [true, false]);
  assert.match(md.titulo, /não fazem parte do seu plano/);
  assert.equal(P.estadoDeErro("teste_expirado").orbita, true);
  assert.equal(P.estadoDeErro("sem_permissao").orbita, true);
  const cs = P.estadoDeErro("conta_suspensa");
  assert.deepEqual([cs.orbita, cs.erro], [false, true]);
  assert.equal(P.estadoDeErro("cliente_pausado").erro, false);
  const sa = P.estadoDeErro("sem_acesso", "Sua conta não tem acesso a esta clínica.");
  assert.equal(sa.titulo, "Sem acesso a esta clínica");
  assert.equal(sa.texto, "Sua conta não tem acesso a esta clínica.", "sem texto próprio, usa a mensagem do dicionário");
  const g = P.estadoDeErro("http_502", "Não deu certo agora (http_502).");
  assert.deepEqual([g.titulo, g.texto, g.orbita, g.erro], ["Não deu para carregar os números", "Não deu certo agora (http_502).", false, true]);
  assert.equal(P.ORBITA_URL, "https://orbita-nexus-ads.netlify.app/app/");
});

test("P5 · normalizarSaasUrl: https obrigatório, termina em /, só host vira /app/, nada de ?query/#rota", () => {
  const n = v => { const r = P.normalizarSaasUrl(v); return [r.ok, r.valor]; };   // (objeto vem de outro contexto do vm)
  assert.deepEqual(n("https://orbita-nexus-ads.netlify.app"), [true, "https://orbita-nexus-ads.netlify.app/app/"]);
  assert.deepEqual(n("https://orbita-nexus-ads.netlify.app/app"), [true, "https://orbita-nexus-ads.netlify.app/app/"]);
  assert.deepEqual(n(" https://crm.clinica.com.br/app/ "), [true, "https://crm.clinica.com.br/app/"]);
  assert.deepEqual(n(""), [true, ""]);
  assert.match(P.normalizarSaasUrl("http://orbita.com/app/").erro, /https/);
  for (const ruim of ["http://orbita.com/app/", "orbita.com", "https://localhost/app/", "https://x.com/app/?a=1", "https://x.com/app/#/inicio", "javascript:alert(1)"]) {
    assert.equal(P.normalizarSaasUrl(ruim).ok, false, ruim);
  }
});

test("P1 · notaReceita diz o que é real, o que é estimado e o que falta", () => {
  assert.equal(P.notaReceita({ receita: 0, receitaEstimada: 0, receitaReal: 0, semValor: 0 }), "");
  assert.equal(P.notaReceita({ receita: 0, receitaEstimada: 0, receitaReal: 0, semValor: 2 }), "2 fechamentos sem valor informado");
  assert.equal(P.notaReceita({ receita: 900, receitaEstimada: 0, receitaReal: 900, semValor: 0 }), "valores informados na ficha");
  assert.equal(P.notaReceita({ receita: 420, receitaEstimada: 420, receitaReal: 0, semValor: 0 }), "estimativa pelo valor de cada tratamento");
  assert.equal(P.notaReceita({ receita: 1320, receitaEstimada: 420, receitaReal: 900, semValor: 1 }), "parte estimada pelo valor de cada tratamento · 1 fechamento sem valor informado");
  assert.equal(P.notaReceita({ receita: 900, receitaEstimada: 0, receitaReal: 900, semValor: 2 }), "valores informados na ficha · 2 fechamentos sem valor informado", "quem ficou de fora da soma aparece mesmo com receita");
  assert.equal(P.notaReceita({ receita: 420, receitaEstimada: 420, receitaReal: 0, semValor: 0 }, "serviço"), "estimativa pelo valor de cada serviço");
});

test("H307 · execucaoDoPedido: acha a execução do pedido nas últimas do servidor e diz ok / erro / rodando / nada", () => {
  const t0 = Date.parse("2026-09-27T15:00:00Z");
  const ex = [
    { tarefa: "nx-ciclo", inicio: "2026-09-27T15:00:20Z", fim: "2026-09-27T15:00:40Z", ok: true, resumo: { clientes: 1 } },
    { tarefa: "nx-ciclo", inicio: "2026-09-27T14:00:05Z", fim: "2026-09-27T14:00:30Z", ok: true, resumo: "velha" },
    { tarefa: "nx-relatorio", inicio: "2026-09-27T15:00:25Z", fim: null, ok: null, resumo: null },
  ];
  assert.equal(P.execucaoDoPedido(ex, "nx-ciclo", t0).k, "ok");
  assert.match(P.execucaoDoPedido(ex, "nx-ciclo", t0).rotulo, /Rodou no servidor às 15:00 ✓/);
  assert.equal(P.execucaoDoPedido(ex, "nx-relatorio", t0).k, "rodando");
  assert.equal(P.execucaoDoPedido(ex, "nx-ciclo", t0 + 3600e3).k, "nada", "execução de antes do pedido não conta");
  assert.match(P.execucaoDoPedido([], "nx-ciclo", t0).rotulo, /ainda não registrou o pedido/);
  const erro = P.execucaoDoPedido([{ tarefa: "nx-ciclo", inicio: "2026-09-27T15:00:20Z", ok: false, resumo: "cron_token inválido" }], "nx-ciclo", t0);
  assert.equal(erro.k, "erro");
  assert.match(erro.rotulo, /cron_token inválido/);
});

/* ============================================================
   (d) ESTÁTICA — index.html, painel.js
   ============================================================ */
test("P7 · CSP do clássico: script só daqui, rede só o Supabase, sem object; nenhum handler inline", () => {
  const m = HTML.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(m, "meta CSP no index.html");
  const d = Object.fromEntries(m[1].split(";").map(s => s.trim()).filter(Boolean).map(s => { const [k, ...v] = s.split(/\s+/); return [k, v]; }));
  assert.deepEqual(d["default-src"], ["'self'"]);
  assert.deepEqual(d["script-src"], ["'self'"]);
  assert.deepEqual(d["connect-src"], ["'self'", "https://dtjznipitihnwmcgpzqh.supabase.co"]);
  assert.deepEqual(d["object-src"], ["'none'"]);
  assert.deepEqual(d["base-uri"], ["'self'"]);
  assert.deepEqual(d["form-action"], ["'self'"]);
  assert.ok(d["img-src"].includes("data:") && d["img-src"].includes("https:"), "logo da clínica (data:/https) continua entrando");
  // as fontes de reserva (Fontshare/Google) e os estilos inline (atributos style) que o painel usa
  assert.ok(d["style-src"].includes("'unsafe-inline'") && d["style-src"].includes("https://api.fontshare.com") && d["style-src"].includes("https://fonts.googleapis.com"));
  assert.deepEqual(d["font-src"], ["'self'", "https://cdn.fontshare.com", "https://fonts.gstatic.com"]);
  assert.ok(!/'unsafe-eval'/.test(m[1]) && !/script-src[^;]*'unsafe-inline'/.test(m[1]));
  for (const f of ["web/index.html", "web/painel.js", "web/curta.js", "web/folha.js", "web/paleta.js", "web/arrastar.js", "web/efeitos.js", "web/cinema.js", "web/marca.js"]) {
    const t = ler(f);
    assert.ok(!/\son[a-z]+="/i.test(t) && !/javascript:/i.test(t.replace(/logoValido\("javascript:alert\(1\)"\)/, "")), `${f}: handler inline`);
  }
  assert.ok(!/<script(?![^>]*\ssrc=)/.test(HTML), "nenhum <script> inline");
  assert.match(HTML, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
});

test("P4/P5/P8 · Ajustes: cartões do super com id, estados do Órbita com «Abrir no Órbita», saas_url, remover segredo, campos limpáveis, contas do Órbita", () => {
  for (const id of ["card-exec", "card-config", "card-contas", "contas-orbita"]) assert.ok(HTML.includes(`id="${id}"`), id);
  assert.match(HTML, /href="https:\/\/orbita-nexus-ads\.netlify\.app\/app\/#\/admin\/clientes" rel="noopener">Admin → Clientes → Usuários<\/a>/);
  // super: pelo campo `super` do nx_sessao ou pelo so_plataforma do nx_config_ver; os dois cartões somem juntos
  assert.match(JS, /const vedadoSuper = \(\) => !!\(S\.conta && S\.conta\.super === false\) \|\| !!\(S\.aj\.config && S\.aj\.config\.erro && S\.aj\.config\.erro\.codigo === "so_plataforma"\);/);
  assert.match(JS, /\$\("#card-config"\)\.hidden = v;\s*\$\("#card-exec"\)\.hidden = v;/);
  assert.match(JS, /function renderConfig\(\) \{\n  const c = S\.aj\.config[^\n]*\n  aplicarVedados\(\);/, "renderConfig aplica a visibilidade antes de desenhar");
  // estados de tela
  assert.match(JS, /const est = estadoDeErro\(e\.codigo, api\.mensagemErro\(e\)\);/);
  assert.match(JS, /est\.orbita \? `<a class="pill pill-bronze" href="\$\{ORBITA_URL\}" rel="noopener">Abrir no Órbita<\/a>` : ""/);
  // saas_url editável e validado; limpáveis com confirmação; remover segredo com null explícito e checagem da flag
  assert.match(JS, /txt\("saas_url", "Endereço do Órbita \(link base\)"/);
  assert.match(JS, /const n = normalizarSaasUrl\(cfg\.saas_url\);\s*if \(!n\.ok\)/);
  assert.match(JS, /const LIMPAVEIS = new Set\(\["wa_template", "google_api_versao", "painel_url", "wa_phone_number_id", "saas_url"\]\);/);
  assert.match(JS, /const apagando = \["painel_url", "wa_phone_number_id", "saas_url"\]\.filter\(k => k in cfg && !cfg\[k\] && String\(atual\[k\] \|\| ""\)\.trim\(\)\);/);
  assert.match(JS, /if \(apagando\.length && !confirm\(/);
  assert.match(JS, /data-rm-segredo="\$\{k\}"/);
  assert.match(JS, /await api\.configSalvar\(S\.token, \{ \[k\]: null \}\);/);
  assert.match(JS, /const ainda = S\.aj\.config && S\.aj\.config\[flag\];/, "se o servidor antigo manteve o segredo, a tela diz que nada mudou");
  assert.match(JS, /const SEGREDOS = \{ wa_access_token: "tem_wa_token", meta_app_secret: "tem_app_secret", anthropic_api_key: "tem_ia" \};/);
  // «Fazer agora» confere o servidor 30 s depois, e a conferência cai com a sessão e na troca de cliente
  assert.match(JS, /S\.aj\.tConfere = setTimeout\(\(\) => conferirPedido\(tarefa, desde, r && r\.pedido\), 30000\);/);
  assert.equal((JS.match(/clearTimeout\(S\.aj\.tConfere\)/g) || []).length, 3);
  assert.match(JS, /const r = execucaoDoPedido\(c && c\.ultimas_execucoes, tarefa, desde\);/);
  // contas do Órbita (origem: 'orbita', quando o servidor marcar) ficam fora da lista e do badge
  assert.match(JS, /const contaDaPlataforma = c => !c \|\| !c\.origem \|\| c\.origem !== "orbita";/);
  assert.match(JS, /const lista = L\.filter\(contaDaPlataforma\), orbita = L\.length - lista\.length;/);
  assert.match(JS, /S\.aj\.contas\.filter\(c => !c\.aprovado && contaDaPlataforma\(c\)\)\.length/);
});

test("P1/P2 · painel: herói e régua com a nota honesta; ficha «sem valor»; balde travado na gaveta e fora da paleta; tabela de origem com «sem campanha»", () => {
  assert.match(JS, /<small>\$\{esc\(notaReceita\(c\)\)\}<\/small><\/div>/);
  assert.ok(!/<small>estimativa pelo valor de cada tratamento<\/small>/.test(JS), "a frase fixa de estimativa saiu do herói");
  assert.match(JS, /extra: !gestor\(\) \? esc\(notaReceita\(c\)\)/);
  assert.match(JS, /const vd = e === "fechou" \? M\.valorDe\(L\) : null;\s*const val = vd \? `<span class="val">\$\{vd\.semValor \? "sem valor" : brl0\(vd\.valor\)\}<\/span>` : "";/);
  assert.match(JS, /const travado = !!\(L && L\.plat && \(S\.demo \|\| b\.anuncio_ext \|\| \(M\.CAMP\[L\.camp\] && M\.CAMP\[L\.camp\]\.semCampanha\)\)\);/);
  assert.match(JS, /filter\(c => c\.plat && !c\.semCampanha\)\.sort\(\(a, b\) => a\.nome\.localeCompare/, "opções de origem sem o balde");
  assert.match(JS, /campanhas: M \? Object\.values\(M\.CAMP\)\.filter\(c => c\.plat && !c\.semCampanha\)/, "paleta sem o balde");
  assert.match(JS, /const semGasto = campanhas\(\)\.filter\(c => !comRow\.has\(c\.id\)\)/);
  assert.match(JS, /title="o anúncio ainda não apareceu na leitura do Meta\/Google \(ou chegou sem identificação\)">sem campanha<\/span>/);
  assert.match(JS, /const servs = Object\.keys\(M\.CFG\.ticket\), padrao = M\.VOC\.servicoPadrao;/);
  assert.match(JS, /fee: num\("#cl-fee", CFG_PADRAO\.fee\)/, "fee novo nasce 0 (CFG_PADRAO)");
  // herói: sem fee configurado, o retorno é «sobre anúncios» e a conta diz «÷ investimento em anúncios» (nada de «+ gestão» fictícia)
  assert.match(JS, /const \{ de, t, ta, c, ca, roas, retorno, fee \} = numerosPeriodo\(\);/);
  assert.match(JS, /rotT\(S\.plat \|\| !fee \? "hero\.retornoPlat" : "hero\.retorno"\)/);
  assert.match(JS, /<small>\$\{S\.plat \|\| !fee \? "tratamentos ÷ investimento em anúncios" : "tratamentos ÷ \(anúncios \+ gestão\)"\}<\/small>/);
  assert.ok(CSS.includes("[hidden]"), "CSS continua escondendo [hidden]");
});

/* ============================================================
   (e) ESCAPE — snapshot revisado de todo `${…}` em HTML montado por string
   ============================================================ */
/** Lê um template literal a partir da crase; devolve { fim, partes:[{tipo:'txt'|'expr', v, ini}] } (templates aninhados ficam na expr). */
function lerTemplate(s, i) {
  const partes = []; let txt = ""; i++;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\") { txt += ch + s[i + 1]; i += 2; continue; }
    if (ch === "`") { partes.push({ tipo: "txt", v: txt }); return { fim: i + 1, partes }; }
    if (ch === "$" && s[i + 1] === "{") {
      partes.push({ tipo: "txt", v: txt }); txt = "";
      const fim = lerExpr(s, i + 2);
      partes.push({ tipo: "expr", v: s.slice(i + 2, fim - 1), ini: i + 2 });
      i = fim; continue;
    }
    txt += ch; i++;
  }
  throw new Error("template sem fim");
}
function lerString(s, i) { const q = s[i]; i++; while (i < s.length) { if (s[i] === "\\") { i += 2; continue; } if (s[i] === q) return i + 1; i++; } return i; }
function lerExpr(s, i) {
  let prof = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'" || ch === '"') { i = lerString(s, i); continue; }
    if (ch === "`") { i = lerTemplate(s, i).fim; continue; }
    if (ch === "{") prof++;
    else if (ch === "}") { if (prof === 0) return i + 1; prof--; }
    i++;
  }
  throw new Error("expr sem fim");
}
function fechaEm(s, i) {
  let prof = 0;
  for (let k = i; k < s.length; k++) {
    const ch = s[k];
    if (ch === "'" || ch === '"') { k = lerString(s, k) - 1; continue; }
    if (ch === "`") { k = lerTemplate(s, k).fim - 1; continue; }
    if ("([{".includes(ch)) prof++;
    else if (")]}".includes(ch)) { prof--; if (prof === 0) return k; }
  }
  return -1;
}
function opTopo(s, ops) {
  let prof = 0;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === "'" || ch === '"') { k = lerString(s, k) - 1; continue; }
    if (ch === "`") { k = lerTemplate(s, k).fim - 1; continue; }
    if ("([{".includes(ch)) { prof++; continue; }
    if (")]}".includes(ch)) { prof--; continue; }
    if (prof) continue;
    for (const op of ops) {
      if (!s.startsWith(op, k)) continue;
      if (op === "?" && (s[k + 1] === "?" || s[k + 1] === ".")) continue;
      return { i: k, op };
    }
  }
  return null;
}
// funções e formatadores que devolvem texto seguro (escapado, numérico ou HTML montado por quem já escapou)
const SEGURAS = /^(?:(?:M|N|api)\.)?(?:esc|waHtml|int|brl|brl0|pc|dec|fmtN|plural|pluralDec|nomePlat|classePlat|varTxt|p2|quandoSP|horaSP|dataTs|dataIso|ddmmHora|dataLonga|ddmm|dataBR|dMes|rot|rotT|tiqueHtml|chipExemplo|cartaoVazio|carregandoHtml|esqueletoHtml|foneHtml|telaBloqueada|htmlConta|htmlCanal|linhaTicket|cardLead|fitaHtml|spark|passo|td|th|opcoesOrigem|simuladorHtml|itemEnvio|envLinha|linhaTempo|chipVar|semMarcas|notaReceita|traducaoCTR|condLeiga|condR|sit|origem|etq|val|txt|sec|FIO_VAZIO|String|Math\.\w+|Number|JSON\.stringify|encodeURIComponent|isoI|FMT_\w+\.format|nomeTarefa|resumoTxt|traco|quando|dia|entre|chip|chips|cadaCem|taxa|cls|st|hr|rotulo|k|i|n|j|tot|ver|resto|w|h|hp|mo|wp|acc|p|v|x|y|de|ate)\b/;
function folhas(expr) {
  const out = [];
  const partir = e => {
    e = e.trim();
    if (!e) return;
    if (e.startsWith("`")) { for (const p of lerTemplate(e, 0).partes) if (p.tipo === "expr") partir(p.v); return; }
    if (e.startsWith("(") && fechaEm(e, 0) === e.length - 1) return partir(e.slice(1, -1));
    const op = opTopo(e, ["??", "||", "&&", "?", ":"]);
    if (op) { partir(e.slice(0, op.i)); partir(e.slice(op.i + op.op.length)); return; }
    if (/^["'].*["']$/.test(e) || /^-?[\d.]+$/.test(e) || ["null", "undefined", "true", "false"].includes(e)) return;
    if (SEGURAS.test(e)) return;
    if (/\.map\(/.test(e) && /\.join\(/.test(e)) { const m = e.indexOf("`"); if (m >= 0) { for (const p of lerTemplate(e, m).partes) if (p.tipo === "expr") partir(p.v); return; } }
    out.push(e);
  };
  partir(expr);
  return out;
}
/** Todo template literal que parece HTML (tem "<x") no arquivo, com as folhas de expressão não cobertas. */
function folhasHtml(src) {
  const achados = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "`") {
      const t = lerTemplate(src, i);
      if (/<[a-z!/]/i.test(t.partes.filter(p => p.tipo === "txt").map(p => p.v).join(""))) {
        for (const p of t.partes) if (p.tipo === "expr") for (const f of folhas(p.v)) achados.push({ linha: src.slice(0, p.ini).split("\n").length, expr: f });
      }
      i = t.fim - 1;
    } else if (ch === "'" || ch === '"') i = lerString(src, i) - 1;
    else if (ch === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; }
    else if (ch === "/" && src[i + 1] === "*") i = src.indexOf("*/", i) + 1;
  }
  return achados;
}
// folhas benignas pela forma: números, booleanos/comparações, tamanhos, Math/String
const benignaPelaForma = e => /^[\d\s()+\-*/%.,]+$/.test(e) || /===|!==|>=|<=|[<>]|^!/.test(e)
  || /\.(toFixed|length|has|test|includes|repeat|getDay|toLowerCase|toUpperCase|charAt|slice)\b/.test(e)
  || /^(fin|gestor|Math\.|String\(|res\(|horaCheia\(|proximaLeitura\(|pontoCpa\()/.test(e);
// identificadores revisados (constantes, números, HTML já escapado na origem, cores validadas por hexValido)
const IDENT_OK = new Set(["ys", "dAnt", "d", "tilt", "tela", "erro", "titulo", "texto", "botoes", "tocos", "notaParada", "W", "H", "ih", "rx", "base", "dl", "fx", "fora", "tend",
  "dentro", "vt", "a", "b", "acima", "msg", "tt", "l", "col", "cor", "q", "arcs", "t", "antes", "id", "sub", "depois", "linhas", "qtd", "u", "ativo", "env", "desde", "nomeR",
  "pode", "radarChega", "ANIM", "sev", "ic", "REDUCE", "selo", "c", "novo", "canal", "secreto", "pend", "eu", "tem", "dica", "curto", "inv", "tk", "m", "ORBITA_URL"]);
// expressões revisadas (constantes de tabela, números, enums do núcleo/estadoIntegracao/statusEnvio, booleanos usados em condição)
const EXPR_OK = new Set(["30 + ((i * 37) % 55)", "c.receita", "S.plat", "S.dias", "P.l", "W - P.r", "P.l - 8", "W - P.r + 8", "maxC * k / 4", "P.t", "d.i", "mk.exemplo", "P.t + 15", "P.t - 7", "H - 9",
  "e.l", "e.s", "e.v", "r != null", "MES3[ult.m.mes]", "d.parcial", "d.proj", "d.m.ano", "d.m.mes", "d.c.fecharam", "MES3[d.m.mes]", "serv[1].n", "c.fecharam", "m.gasto", "ROT_CEL[k]",
  "\" no \" + nomePlat(S.plat)", "a4.regra.janela", "NOME_ETAPA[e]", "vd.semValor", "M.valorDe(L).semValor","q.atraso", "r.k.conversas", "r.k.agendadas", "r.k.compareceram", "r.k.fecharam", "c.semCampanha",
  "s.cor", "s.n", "f.on", "f.marcado", "f.falta", "f.t", "f.q", "f.v", "f.d", "s.k", "s.tique", "c.estado", "c.sync", "ESTADO[c.estado]", "S.demo", "S.varridoEm", "a.sev",
  "SEV_NOME[a.sev]", "M.ICONE[a.sev]", "LEIGO_LINHA[id]", "SEV_NOME[r.sev]", "r.ativa", "r.id", "SEV_NOME[sev]", "d.nome", "d.curto", "e.ok"]);

test("P7 · escape: nenhuma interpolação nova sem esc()/formatador em HTML montado por string (painel.js)", () => {
  const achados = folhasHtml(JS);
  assert.ok(achados.length > 200, `o scanner achou só ${achados.length} interpolações — quebrou?`);
  const suspeitas = achados.filter(({ expr }) => !benignaPelaForma(expr) && !IDENT_OK.has(expr) && !EXPR_OK.has(expr));
  assert.deepEqual(suspeitas, [], "interpolação fora do snapshot revisado: envolva com esc()/waHtml() ou, se for constante/número, acrescente à lista com a justificativa");
  // nenhum dado do banco (nome, texto, status, e-mail, observação) vai cru
  const dados = achados.filter(({ expr }) => /\.(nome|email|texto|status|resumo|obs|servico|mensagem|msg|acao|erro|slug|telefone|leitura_ia|chave)\b/.test(expr) && !benignaPelaForma(expr) && !EXPR_OK.has(expr));
  assert.deepEqual(dados.map(d => `${d.linha}: ${d.expr}`), []);
  // o próprio scanner pega um esquecimento
  assert.deepEqual(folhasHtml("const x = `<p>${L.nome} ${esc(L.obs)} ${n}</p>`;").map(a => a.expr), ["L.nome"]);
  assert.deepEqual(folhasHtml("el.innerHTML = `<b>${ok ? esc(a.nome) : a.email}</b>`;").map(a => a.expr), ["ok", "a.email"], "a condição também é folha (identificador revisado); o ramo cru aparece");
});

/* ============================================================
   (f) WORKFLOWS
   ============================================================ */
test("P6 · pages.yml publica só o clássico: monta a pasta sem app/crm/ads/atendimento/workspace.js, com redirecionador e sw que se desinstala; actions por SHA", () => {
  const y = ler(".github/workflows/pages.yml");
  const sem = y.split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  assert.doesNotMatch(sem, /path: web\n/, "nada de mandar web/ inteira");
  assert.match(sem, /cp -R web\/\. "\$\{pub\}\/"/);
  assert.match(sem, /rm -rf "\$\{pub\}\/app" "\$\{pub\}\/crm" "\$\{pub\}\/ads" "\$\{pub\}\/atendimento" "\$\{pub\}\/workspace\.js"/);
  assert.match(sem, /for proibido in app crm ads atendimento workspace\.js; do/);
  assert.match(sem, /for exigido in index\.html painel\.js painel\.css dados\.js nucleo\.js rastreio\.js fonts; do/, "o clássico e o rastreio.js têm de estar lá");
  assert.match(sem, /ORBITA_URL: https:\/\/orbita-nexus-ads\.netlify\.app\/app\/\n/);
  assert.match(sem, /<meta http-equiv="refresh" content="0; url=\$\{ORBITA_URL\}">/, "app/index.html redireciona");
  assert.match(sem, /<a href="\$\{ORBITA_URL\}">\$\{ORBITA_URL\}<\/a>/, "e tem o link para quem não segue meta refresh");
  const sw = sem.match(/cat > "\$\{pub\}\/app\/sw\.js" <<SW\n([\s\S]*?)\n\s*SW\n/);
  assert.ok(sw, "sw.js gerado por heredoc");
  for (const t of ["self.registration.unregister()", "caches.keys()", "caches.delete(n)", 'c.navigate("${ORBITA_URL}")', "self.skipWaiting()"]) assert.ok(sw[1].includes(t), `sw.js: ${t}`);
  assert.doesNotMatch(sw[1], /fetch\(|caches\.open|addEventListener\("fetch"/, "o sw de saída não serve nada");
  assert.match(sem, /path: \$\{\{ env\.pub \}\}/);
  const usos = [...sem.matchAll(/^\s*(?:-\s+)?uses:\s*(.+)$/gm)].map(x => x[1].trim());
  assert.deepEqual(usos.map(u => u.split("@")[0]), ["actions/checkout", "actions/configure-pages", "actions/upload-pages-artifact", "actions/deploy-pages"]);
  for (const u of usos) assert.match(u, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, `action sem SHA de 40 hex + versão: ${u}`);
  assert.match(sem, /persist-credentials: false/);
  assert.match(sem, /^permissions:\n {2}contents: read\n {2}pages: write\n {2}id-token: write\n/m);
  assert.match(sem, /branches: \[main\]/);
  assert.doesNotMatch(sem, /pull_request/);
  // mudança só no Órbita não republica o clássico (os mesmos nomes que o script remove)
  assert.match(sem, /paths: \["web\/\*\*", "!web\/app\/\*\*", "!web\/crm\/\*\*", "!web\/ads\/\*\*", "!web\/atendimento\/\*\*", "!web\/workspace\.js", "\.github\/workflows\/pages\.yml"\]/);
});

/** O corpo de um passo `run: |` do yml (sem a indentação do bloco) — para executar o script de verdade. */
function passoRun(yml, nomePasso) {
  const L = yml.split("\n");
  const i = L.findIndex(l => l.includes(`- name: ${nomePasso}`));
  assert.ok(i >= 0, `passo «${nomePasso}» no yml`);
  const j = L.findIndex((l, k) => k > i && /^\s*run: \|\s*$/.test(l));
  assert.ok(j > i, "run: | do passo");
  const base = L[j].match(/^\s*/)[0].length, corpo = [];
  for (let k = j + 1; k < L.length; k++) {
    if (L[k].trim() === "") { corpo.push(""); continue; }
    if (L[k].match(/^\s*/)[0].length <= base) break;
    corpo.push(L[k]);
  }
  const min = Math.min(...corpo.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
  return corpo.map(l => l.slice(min)).join("\n").trimEnd() + "\n";
}
const temBash = (() => { try { const r = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" }); return r.status === 0 && r.stdout.trim() === "ok"; } catch { return false; } })();
const arquivosDe = (dir, pre = "") => readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? arquivosDe(join(dir, d.name), `${pre}${d.name}/`) : [`${pre}${d.name}`]));

test("P6 · o script do pages.yml, executado de verdade (bash): a pasta sai sem o Órbita, com o clássico inteiro, o redirecionador e o sw de saída", { skip: !temBash && "bash não disponível nesta máquina" }, () => {
  const y = ler(".github/workflows/pages.yml");
  const script = passoRun(y, "Montar a pasta de publicação");
  const orbita = (y.match(/^\s*ORBITA_URL:\s*(\S+)\s*$/m) || [])[1];
  assert.equal(orbita, "https://orbita-nexus-ads.netlify.app/app/");
  const tmp = mkdtempSync(join(tmpdir(), "nx-pages-")).replace(/\\/g, "/"), envFile = `${tmp}/github_env`;
  writeFileSync(envFile, "");
  try {
    const r = spawnSync("bash", ["-c", script], { cwd: RAIZ, encoding: "utf8", env: { ...process.env, RUNNER_TEMP: tmp, GITHUB_ENV: envFile, ORBITA_URL: orbita } });
    assert.equal(r.status, 0, `o script falhou:\n${r.stdout}\n${r.stderr}`);
    const pub = `${tmp}/pages`, web = join(RAIZ, "web"), fora = new Set(["app", "crm", "ads", "atendimento", "workspace.js"]);
    for (const p of ["app/index.html", "app/sw.js", "index.html", "painel.js", "painel.css", "recursos.css", "dados.js", "nucleo.js", "demo.js", "rastreio.js", "marca.js", "fonts"]) assert.ok(existsSync(join(pub, p)), `falta ${p}`);
    for (const p of ["crm", "ads", "atendimento", "workspace.js", "app/app.js", "app/index.html.bak"]) assert.ok(!existsSync(join(pub, p)), `${p} não podia estar na publicação`);
    // tudo que não é do Órbita vai byte a byte; em app/ só os dois arquivos gerados
    const esperados = arquivosDe(web).filter(f => !fora.has(f.split("/")[0])).sort();
    const publicados = arquivosDe(pub).filter(f => !f.startsWith("app/")).sort();
    assert.deepEqual(publicados, esperados);
    for (const f of esperados) assert.ok(readFileSync(join(pub, f)).equals(readFileSync(join(web, f))), `${f} diferente do web/`);
    assert.deepEqual(readdirSync(join(pub, "app")).sort(), ["index.html", "sw.js"]);
    const html = readFileSync(join(pub, "app/index.html"), "utf8"), sw = readFileSync(join(pub, "app/sw.js"), "utf8");
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(html.includes(`<meta http-equiv="refresh" content="0; url=${orbita}">`), "meta refresh com o endereço expandido");
    assert.ok(html.includes(`<a href="${orbita}">${orbita}</a>`), "link para quem não segue meta refresh");
    assert.ok(html.includes(`<meta name="robots" content="noindex, nofollow">`));
    assert.doesNotMatch(html + sw, /\$\{|\$ORBITA/, "nenhuma variável ficou sem expandir");
    assert.ok(sw.includes("self.registration.unregister()") && sw.includes("caches.delete(n)") && sw.includes(`c.navigate("${orbita}")`));
    assert.match(readFileSync(envFile, "utf8"), /^pub=.*\/pages$/m, "o passo do upload recebe a pasta pelo GITHUB_ENV");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("P7 · CI das funções roda deno check e git diff --check antes de instalar a CLI e publicar", () => {
  const y = ler(".github/workflows/funcoes-supabase.yml");
  const sem = y.split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  // --node-modules-dir=none: o package.json da raiz (PGlite dos smokes) faria o Deno procurar npm:@anthropic-ai/sdk em node_modules
  const ordem = ["node testes/rodar-tudo.mjs", "node scripts/montar-funcoes.mjs", "npx --yes deno@2.6.0 check --node-modules-dir=none supabase/dist/*/index.ts",
    'git diff --check "$(git hash-object -t tree /dev/null)" HEAD -- supabase/functions web/nucleo.js web/app/auto-catalogo.js scripts supabase/deploy-lista.txt .github',
    "supabase/setup-cli@", "supabase functions deploy"];
  const pos = ordem.map(t => sem.indexOf(t));
  assert.ok(pos.every(p => p >= 0), `passos: ${ordem.filter((_, i) => pos[i] < 0).join(" | ")}`);
  assert.deepEqual([...pos].sort((a, b) => a - b), pos, "deno check e git diff --check vêm depois de montar e antes do deploy");
  const usos = [...sem.matchAll(/^\s*(?:-\s+)?uses:\s*(.+)$/gm)].map(x => x[1].trim());
  assert.deepEqual(usos.map(u => u.split("@")[0]), ["actions/checkout", "actions/setup-node", "supabase/setup-cli"], "o Deno vem do npm: nenhuma action nova");
});

/* ============================================================
   (g) CONTRATO clássico × Órbita (RPCs compartilhadas)
   ============================================================ */
const MIG = join(RAIZ, "supabase", "migrations");
const migracoes = readdirSync(MIG).filter(f => f.endsWith(".sql")).sort();
/** Última definição de uma função nas migrações (ordem de aplicação) → { arquivo, assinatura, corpo }. */
function ultimaDef(nome) {
  let achado = null;
  for (const f of migracoes) {
    const sql = readFileSync(join(MIG, f), "utf8");
    const re = new RegExp(`create or replace function public\\.${nome}\\(([^)]*)\\)[\\s\\S]*?\\$(?:function|\\w*)\\$;`, "gi");
    for (const m of sql.matchAll(re)) achado = { arquivo: f, assinatura: m[1], corpo: m[0] };
  }
  return achado;
}
const paramsDe = ass => ass.split(",").map(s => s.trim()).filter(Boolean).map(s => ({ nome: s.split(/\s+/)[0], opcional: /\bdefault\b/i.test(s) }));

test("P8 · toda RPC que o clássico chama existe no SQL, com os mesmos nomes de parâmetro e nada obrigatório faltando", async () => {
  const chamadas = [];
  api.usarFetch(async (url, init) => { chamadas.push({ nome: url.split("/rpc/")[1], corpo: JSON.parse(init.body) }); return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }); });
  await api.criarConta({ email: "e", senha: "s", nome: "n", codigo: "c" }); await api.entrar("e", "s"); await api.sair("t"); await api.sessao("t");
  await api.dados("t", "c", 60); await api.leadSalvar("t", "c", {}); await api.clienteSalvar("t", {}); await api.integracaoSalvar("t", "c", "meta", {}, true);
  await api.integracoesStatus("t", "c"); await api.contasListar("t"); await api.contaDefinir("t", "k", true, "clinica", []); await api.configVer("t");
  await api.configSalvar("t", {}); await api.executar("t", "nx-ciclo", {});
  api.usarFetch(null);
  assert.equal(chamadas.length, 14);
  for (const { nome, corpo } of chamadas) {
    const def = ultimaDef(nome);
    assert.ok(def, `${nome} não existe nas migrações`);
    const ps = paramsDe(def.assinatura), nomes = new Set(ps.map(p => p.nome));
    for (const k of Object.keys(corpo)) assert.ok(nomes.has(k), `${nome}: o clássico manda ${k}, que o SQL (${def.arquivo}) não tem`);
    for (const p of ps.filter(p => !p.opcional)) assert.ok(p.nome in corpo, `${nome}: ${p.nome} é obrigatório no SQL e o clássico não manda`);
  }
  // só chave pública: nenhuma dessas é concedida a authenticated (grant explícito) nem lida nx_config fora do super
  for (const n of ["nx_config_ver", "nx_config_salvar"]) assert.match(ultimaDef(n).corpo, /if not public\.nx_super\(c\) then raise exception 'so_plataforma'/, n);
  assert.match(ultimaDef("nx_executar").corpo, /p_tarefa not in \('nx-ciclo', 'nx-relatorio'\)/, "lista própria do nx_executar");
  assert.match(ultimaDef("nx_executar").corpo, /return json_build_object\('ok', true, 'pedido', v_id\)/, "o clássico usa `pedido` no retorno real do «Fazer agora»");
  assert.match(ultimaDef("nx_config_ver").corpo, /'saas_url', cfg\.saas_url/, "nx_config_ver devolve saas_url (campo novo do clássico)");
  assert.match(ultimaDef("nx_config_salvar").corpo, /saas_url\s*=\s*case when p_cfg \? 'saas_url' then nullif\(p_cfg->>'saas_url', ''\) else saas_url end/, "nx_config_salvar aceita (e limpa) saas_url");
  for (const k of ["painel_url", "wa_phone_number_id"]) assert.match(ultimaDef("nx_config_salvar").corpo, new RegExp(`${k}\\s*=\\s*case when p_cfg \\? '${k}' then nullif`), `${k} limpável no SQL`);
  assert.match(ultimaDef("nx_dados").corpo, /perform public\.nx_exigir_modulo\(p_cliente, 'ads'\)/, "nx_dados levanta modulo_desligado abaixo de gestor (o clássico trata)");
});

// o que a frente S-B promete para estas RPCs (plano 100, contratos 9–11): conferido assim que a migração redefinir a função
const redefinida = nome => { const d = ultimaDef(nome); return d && /^20261008/.test(d.arquivo) ? d : null; };
test("P8 · S-B9: nx_sessao renova a sessão como nx_app_sessao e diz se a conta é super", { skip: !redefinida("nx_sessao") && "nx_sessao ainda não foi redefinida pela migração 20261008*" }, () => {
  const d = redefinida("nx_sessao");
  assert.match(d.corpo, /update public\.nx_sessoes\s+set expira_em/, "renovação");
  assert.match(d.corpo, /'super'/, "flag super no JSON (o clássico esconde Configuração/«Fazer agora» por ela)");
});
test("P8 · S-B7: nx_conta_definir só apaga acessos dentro do escopo do chamador", { skip: !redefinida("nx_conta_definir") && "nx_conta_definir ainda não foi redefinida pela migração 20261008*" }, () => {
  const d = redefinida("nx_conta_definir");
  const del = d.corpo.match(/delete from public\.nx_acessos[\s\S]*?;/);
  assert.ok(del, "delete dos acessos");
  assert.match(del[0], /nx_pode|org_id|nx_conta_no_escopo/, "o delete é limitado ao escopo (antes apagava acessos de outras orgs)");
});
test("P8 · S-B8: nx_config_salvar apaga segredo com null explícito (o botão «Remover» do clássico)", { skip: !redefinida("nx_config_salvar") && "nx_config_salvar ainda não foi redefinida pela migração 20261008*" }, () => {
  const d = redefinida("nx_config_salvar");
  for (const k of ["anthropic_api_key", "wa_access_token", "meta_app_secret"]) assert.match(d.corpo, new RegExp(`jsonb_typeof\\(p_cfg->'${k}'\\) = 'null'|p_cfg->'${k}' = 'null'::jsonb`), `${k}: null explícito apaga`);
});
test("P8 · S-B9: nx_entrar bloqueia por tentativas (muitas_tentativas com hint em minutos)", { skip: !redefinida("nx_entrar") && "nx_entrar ainda não foi redefinida pela migração 20261008*" }, () => {
  const d = redefinida("nx_entrar");
  assert.match(d.corpo, /muitas_tentativas/);
  assert.match(d.corpo, /hint/);
  assert.ok(existsSync(MIG), "migrações presentes");
});

test("revisão · orgânico com plataforma (link da bio do Instagram, «vi no Instagram») NÃO entra no funil de anúncios nem na receita dele", () => {
  const leads = [
    { id: 1, nome: "Bio do Instagram", origem: "organico", plataforma: "meta", etapa: "fechou", valor: 5000, data_conversa: dia(2) },
    { id: 2, nome: "Anúncio sem ids", origem: "anuncio", plataforma: "meta", etapa: "nova", data_conversa: dia(2) },
  ];
  const M = montarDe({ metricas: semanaDeMetricas(), leads });
  const org = M.LEADS.find(L => L.id === 1);
  assert.equal(org.camp, "org:organico");
  assert.equal(org.plat, null, "fora do funil de anúncios");
  const c = M.crmTot(M.R - 6, M.R);
  assert.equal(c.conversas, 1, "só o lead de anúncio conta no funil");
  assert.equal(c.receita, 0, "os R$ 5.000 do orgânico não viram «retorno do anúncio»");
  assert.equal(M.crmTot(M.R - 6, M.R, { organicos: true }).receita, 5000, "com orgânicos a receita aparece");
});

test("revisão · conta Google sem NENHUMA conversão registrada (acompanhamento desligado): sem «Campanha sem conversa» por campanha; Meta continua avisando", () => {
  const google = Array.from({ length: 5 }, (_, k) => metrica(dia(k + 1), { p: "google", c: "G1", cn: "Pesquisa Implante", a: "GA1", g: 40, conv: 0 }));
  const metaSem = Array.from({ length: 5 }, (_, k) => metrica(dia(k + 1), { c: "M9", cn: "Meta parada", a: "MA9", g: 40, conv: 0 }));
  const M = montarDe({ metricas: [...google, ...metaSem] });
  const r2 = M.avaliar(M.R).filter(a => a.regra.id === "r2").map(a => a.chave);
  assert.ok(!r2.some(c => c.includes("google")), "antes: a campanha Google alertava todo dia (r2|google:G1)");
  assert.ok(r2.some(c => c.includes("M9")), "a campanha Meta sem conversa continua no radar");
  const comConv = montarDe({ metricas: [...google, metrica(dia(20), { p: "google", c: "G2", cn: "Outra", a: "GA2", g: 10, conv: 1 })] });
  assert.ok(comConv.avaliar(comConv.R).some(a => a.chave.includes("google") && a.regra.id === "r2"), "conta que registra conversão: campanha sem conversa volta a alertar");
});

test("revisão · orgânico com utm_campaign (link da bio: campanha_ext «bio») também fica fora do funil — sem campanha fantasma nem receita de anúncio", () => {
  const leads = [{ id: 1, nome: "Bio", origem: "organico", plataforma: "meta", campanha_ext: "bio", anuncio_ext: "A1", etapa: "fechou", valor: 1000, data_conversa: dia(2) }];
  const M = montarDe({ metricas: semanaDeMetricas(), leads });
  const L = M.LEADS[0];
  assert.equal(L.camp, "org:organico"); assert.equal(L.cri, null); assert.equal(L.plat, null);
  assert.ok(!M.CAMP["meta:bio"], "antes: nascia a campanha meta:bio «sem investimento»");
  assert.equal(M.crmTot(M.R - 6, M.R).receita, 0, "antes: R$ 1.000 orgânicos viravam receita de anúncio");
});
