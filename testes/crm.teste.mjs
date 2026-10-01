/* ============================================================
   ÓRBITA — testes do CRM (Node puro, sem dependências) · frente F4
   node testes/crm.teste.mjs
   (a) crm-logica.js: telefone (mesma regra do banco), CSV, mapeamento,
       lotes, ordemEntre, previsao, filtrar, moverLocal, campos, textos
   (b) estáticos dos arquivos do CRM: sem import estático, sem innerHTML
       com dado, sem hex de cor fora de :root, [hidden] forte, sem 1fr solto,
       node --check em todos
   ============================================================ */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = join(AQUI, "..", "web", "app");
const ler = f => readFileSync(join(APP, f), "utf8");

let ok = 0, falhas = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log(`  ✓ ${nome}`); }
  catch (e) { falhas++; console.log(`  ✗ ${nome}\n      ${String(e && e.stack || e).split("\n").slice(0, 4).join("\n      ")}`); }
}

const L = await import("../web/app/crm-logica.js");

/* ============================================================ (a) lógica */
console.log("\n(a) crm-logica.js");

await teste("normalizarTelefone = nx_tel_normalizar (digitado ganha 55; WhatsApp fica como veio)", () => {
  assert.equal(L.normalizarTelefone("(12) 99830-3030"), "5512998303030");
  assert.equal(L.normalizarTelefone("12 3456-7890"), "551234567890");
  assert.equal(L.normalizarTelefone("+55 12 99830-3030"), "5512998303030");
  assert.equal(L.normalizarTelefone("447911123456"), "447911123456");
  assert.equal(L.normalizarTelefone("123"), null);
  assert.equal(L.normalizarTelefone("1234567890123456"), null);
  assert.equal(L.normalizarTelefone(""), null);
  assert.equal(L.normalizarTelefone(null), null);
  assert.equal(L.normalizarTelefone("5512998303030", true), "5512998303030");
  assert.equal(L.normalizarTelefone("12345678", true), "12345678");
  assert.equal(L.normalizarTelefone("1234567", true), null);
});

await teste("telChave = nx_tel_chave (com e sem 55/9 viram a mesma pessoa)", () => {
  assert.equal(L.telChave("5512998303030"), "1298303030");
  assert.equal(L.telChave("551298303030"), "1298303030");
  assert.equal(L.telChave("551234567890"), "1234567890");
  assert.equal(L.telChave("447911123456"), "447911123456");
  assert.equal(L.telChave(null), null);
  assert.ok(L.mesmoTelefone("(12) 99830-3030", "12 9830-3030"));
  assert.ok(L.mesmoTelefone("5512998303030", "551298303030"));
  assert.ok(!L.mesmoTelefone("12998303030", "12998303031"));
});

await teste("lerCSV: ponto e vírgula, BOM e CRLF", () => {
  const r = L.lerCSV("﻿Nome;Telefone;E-mail\r\nAna;(12) 99830-3030;ana@x.com\r\nBeto;12 3456-7890;\r\n");
  assert.equal(r.separador, ";");
  assert.deepEqual(r.cabecalho, ["Nome", "Telefone", "E-mail"]);
  assert.deepEqual(r.linhas, [["Ana", "(12) 99830-3030", "ana@x.com"], ["Beto", "12 3456-7890", ""]]);
  assert.equal(r.total, 2);
});

await teste("lerCSV: vírgula com aspas contendo vírgula, aspas escapadas e quebra de linha", () => {
  const txt = 'nome,obs,valor\n"Silva, Ana","disse ""oi""\nna recepção",1.500\nBeto,,20\n';
  const r = L.lerCSV(txt);
  assert.equal(r.separador, ",");
  assert.deepEqual(r.linhas[0], ["Silva, Ana", 'disse "oi"\nna recepção', "1.500"]);
  assert.deepEqual(r.linhas[1], ["Beto", "", "20"]);
});

await teste("lerCSV: tab (colado do Excel), CR sozinho, linhas vazias e colunas faltando", () => {
  const r = L.lerCSV("nome\ttelefone\tcidade\rAna\t12998303030\r\r\nBeto\t1234567890\n");
  assert.equal(r.separador, "\t");
  assert.deepEqual(r.linhas, [["Ana", "12998303030", ""], ["Beto", "1234567890", ""]]);
});

await teste("lerCSV: separador detectado com ; ganhando empate e limite de linhas", () => {
  assert.equal(L.detectarSeparador("a;b,c\n1;2,3"), ";");
  assert.equal(L.detectarSeparador("a,b,c\n1,2,3"), ",");
  const muitas = "n\n" + Array.from({ length: 30 }, (_, i) => `x${i}`).join("\n");
  const r = L.lerCSV(muitas, { limite: 20 });
  assert.equal(r.linhas.length, 20);
  assert.equal(r.total, 30);
  assert.ok(r.cortado);
});

await teste("sugerirMapeamento: nomes comuns, acentos, campos personalizados e sem repetir destino", () => {
  const cab = ["Nome completo", "Celular", "WhatsApp", "E-mail", "Cidade", "UF", "Data de Nascimento", "CPF", "Observações", "Tags", "Valor", "Etapa", "Convênio médico", "Coluna X"];
  const campos = [{ entidade: "contato", chave: "convenio_medico", rotulo: "Convênio médico" }];
  const m = L.sugerirMapeamento(cab, campos);
  assert.deepEqual(m, ["nome", "telefone", null, "email", "cidade", "uf", "nascimento", "documento", "obs", "etiquetas", "negocio_valor", "estagio", "campo:convenio_medico", null]);
});

await teste("montarLinhas + checarLinha", () => {
  const linhas = L.montarLinhas([["Ana", "12998303030", "Plano X"], ["", "", ""], ["Beto", "123", ""]],
    ["nome", "telefone", "campo:convenio"]);
  assert.deepEqual(linhas[0], { nome: "Ana", telefone: "12998303030", campos: { convenio: "Plano X" } });
  assert.deepEqual(linhas[1], {});
  assert.deepEqual(L.checarLinha(linhas[0]), []);
  assert.equal(L.checarLinha(linhas[1]).length, 1);
  assert.deepEqual(L.checarLinha(linhas[2]), ["Telefone inválido"]);
  assert.deepEqual(L.checarLinha({ nome: "x", nascimento: "31/02/1990" }), ["Nascimento: use DD/MM/AAAA"]);
});

await teste("lotes de 100 e metade no tempo_esgotado (mínimo 10)", () => {
  const l = L.lotes(Array.from({ length: 250 }, (_, i) => i));
  assert.deepEqual(l.map(x => x.length), [100, 100, 50]);
  assert.equal(L.metadeLote(100), 50);
  assert.equal(L.metadeLote(15), 10);
  assert.equal(L.metadeLote(10), 10);
});

await teste("lerNumero e lerData", () => {
  assert.equal(L.lerNumero("1.234,56"), 1234.56);
  assert.equal(L.lerNumero("R$ 3.500"), 3500);
  assert.equal(L.lerNumero("1234.5"), 1234.5);
  assert.equal(L.lerNumero("abc"), null);
  assert.equal(L.lerNumero(""), null);
  assert.equal(L.lerData("31/12/1990"), "1990-12-31");
  assert.equal(L.lerData("1990-12-31"), "1990-12-31");
  assert.equal(L.lerData("30/02/2020"), null);
  assert.equal(L.lerData("12/1990"), null);
});

await teste("ordemEntre: topo, fim, meio, empate e coluna vazia", () => {
  assert.equal(L.ordemEntre(null, 10), 9);
  assert.equal(L.ordemEntre(10, null), 11);
  assert.equal(L.ordemEntre(10, 20), 15);
  assert.equal(L.ordemEntre(-1759000000, -1758999000), -1758999500);
  assert.equal(L.ordemEntre(5, 5), 5);
  assert.equal(L.ordemEntre(null, null, 1759000000000), -1759000000);
  const a = L.ordemEntre(1, 2), b = L.ordemEntre(1, a);
  assert.ok(1 < b && b < a && a < 2);
});

await teste("previsao: soma só etapas abertas, ponderada pela probabilidade", () => {
  const estagios = [{ id: "a", tipo: "aberto", probabilidade: 10 }, { id: "b", tipo: "aberto", probabilidade: 50 },
    { id: "g", tipo: "ganho", probabilidade: 100 }, { id: "p", tipo: "perdido", probabilidade: 0 }];
  const colunas = [{ estagio_id: "a", total: 3, soma_previsto: 3500 }, { estagio_id: "b", total: 2, soma_previsto: 1000 },
    { estagio_id: "g", total: 5, soma_previsto: 9000, soma_valor: 8000 }, { estagio_id: "p", total: 1, soma_previsto: 200 }];
  assert.deepEqual(L.previsao(colunas, estagios), { abertos: 5, soma_aberto: 4500, previsao_ponderada: 850 });
  assert.deepEqual(L.previsao([], estagios), { abertos: 0, soma_aberto: 0, previsao_ponderada: 0 });
});

await teste("moverLocal: tira de uma coluna, põe na outra e ajusta contagens e somas", () => {
  const cols = [
    { estagio_id: "a", total: 2, soma_previsto: 300, soma_valor: 0, itens: [{ id: 1, valor_previsto: 100, ordem: 1 }, { id: 2, valor_previsto: 200, ordem: 2 }] },
    { estagio_id: "g", total: 0, soma_previsto: 0, soma_valor: 0, itens: [] },
  ];
  const n = L.moverLocal(cols, 2, "g", 0, 5, { valor: 250, status: "ganho" });
  assert.equal(n[0].total, 1); assert.equal(n[0].soma_previsto, 100); assert.deepEqual(n[0].itens.map(x => x.id), [1]);
  assert.equal(n[1].total, 1); assert.equal(n[1].soma_valor, 250); assert.equal(n[1].itens[0].estagio_id, "g");
  assert.equal(n[1].itens[0].ordem, 5);
  assert.equal(cols[0].itens.length, 2, "não muda o original");
  const r = L.moverLocal(cols, 1, "a", 1, 3);
  assert.deepEqual(r[0].itens.map(x => x.id), [2, 1]);
  assert.equal(r[0].total, 2);
});

await teste("gesto de toque no Kanban (M23): toque curto abre, rolagem nunca arrasta, toque longo levanta, arrasta e solta", () => {
  // toque curto: soltar antes dos 350 ms = o click normal abre o cartão
  let g = L.novoGesto(100, 200, 1000);
  assert.equal(L.gestoSoltar(g, 1120).acao, "toque");
  // rolagem (mexeu > 10 px antes dos 350 ms): vira «rolando» e NUNCA arrasto, mesmo que o dedo pare depois dos 350 ms
  let r = L.gestoMover(g, 100, 230, 1080);
  assert.equal(r.estado, "rolando"); assert.equal(r.acao, "rolar");
  r = L.gestoMover(r, 100, 232, 1600);
  assert.equal(r.estado, "rolando"); assert.equal(r.acao, null);
  assert.equal(L.gestoSoltar(r, 1700).acao, "nada");
  // tremor de até 10 px antes dos 350 ms não é rolagem
  r = L.gestoMover(g, 104, 205, 1100);
  assert.equal(r.estado, "espera"); assert.equal(r.acao, null);
  // toque longo: levanta aos 350 ms (não antes); soltar sem mexer abre «Mover para…»
  g = L.novoGesto(100, 200, 0);
  assert.deepEqual([L.gestoTempo(g, 349).estado, L.gestoTempo(g, 349).acao], ["espera", null]);
  const lev = L.gestoTempo(g, 350);
  assert.deepEqual([lev.estado, lev.acao], ["levantado", "levantar"]);
  assert.equal(L.gestoSoltar(lev, 900).acao, "mover_para");
  // levantado: mexer menos que o limiar de arrasto (6 px) segue levantado; a partir dele arrasta; depois só «mover»; soltar = soltar no destino
  let a = L.gestoMover(lev, 103, 202, 500);
  assert.equal(a.estado, "levantado"); assert.equal(a.acao, null);
  a = L.gestoMover(a, 100, 212, 520);
  assert.equal(a.estado, "arrastando"); assert.equal(a.acao, "arrastar");
  a = L.gestoMover(a, 100, 300, 540);
  assert.equal(a.estado, "arrastando"); assert.equal(a.acao, "mover");
  assert.equal(L.gestoSoltar(a, 600).acao, "soltar");
  // o timer atrasou: parado 400 ms e depois 40 px = levantou e arrastou (não é rolagem)
  a = L.gestoMover(L.novoGesto(0, 0, 0), 40, 0, 400);
  assert.equal(a.estado, "arrastando"); assert.equal(a.acao, "arrastar"); assert.equal(a.levantou, true);
  // soltar depois dos 350 ms sem o timer ter rodado = «Mover para…»
  assert.equal(L.gestoSoltar(L.novoGesto(0, 0, 0), 360).acao, "mover_para");
  // o sistema tomou o gesto (pointercancel): nunca solta nem move
  assert.equal(L.gestoCancelar(a).acao, "nada");
  assert.deepEqual(L.TOQUE, { MS_LONGO: 350, LIMIAR_ROLAGEM: 10, LIMIAR_ARRASTO: 6 });
});

await teste("destino do arrasto: posição na coluna pelo meio dos cartões, coluna/etapa pelo ponto e resumo dos totais", () => {
  const cartoes = [{ top: 0, bottom: 100 }, { top: 110, bottom: 210 }];
  assert.equal(L.indiceDoPonto(cartoes, 40), 0);
  assert.equal(L.indiceDoPonto(cartoes, 60), 1);
  assert.equal(L.indiceDoPonto(cartoes, 170), 2);
  assert.equal(L.indiceDoPonto([], 50), 0);
  const alvos = [{ id: "a", left: 0, right: 100, top: 0, bottom: 50 }, { id: "b", left: 110, right: 210, top: 0, bottom: 50 }];
  assert.equal(L.alvoDoPonto(alvos, 150, 20), "b");
  assert.equal(L.alvoDoPonto(alvos, 105, 20), null);
  assert.equal(L.alvoDoPonto(alvos, 50, 80), null);
  assert.equal(L.resumoDoFunil({ abertos: 3, soma: "R$ 12.950", previsao: "R$ 4.735" }, "a"), "3 abertas · R$ 12.950 · previsão R$ 4.735");
  assert.equal(L.resumoDoFunil({ abertos: 1, soma: "R$ 900", previsao: "R$ 90" }, "a"), "1 aberta · R$ 900 · previsão R$ 90");
  assert.equal(L.resumoDoFunil({ abertos: 2, soma: "R$ 5", previsao: "" }, "o"), "2 abertos · R$ 5");
  assert.equal(L.resumoDoFunil({}, "o"), "0 abertos");
});

await teste("escrita segura (M25): chave p_req, erro ambíguo e repetição com a MESMA chave (nunca duplica)", async () => {
  // chave: uuid v4 (com e sem crypto.randomUUID)
  const RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(L.novaReq(), RE);
  assert.match(L.novaReq(null), RE);
  assert.match(L.novaReq({ getRandomValues: a => a.fill(7) }), RE);
  assert.notEqual(L.novaReq(), L.novaReq());
  // quais erros deixam dúvida
  for (const c of ["tempo_rede", "tempo_esgotado", "sem_conexao", "resposta_invalida", "servico_indisponivel", "http_502", "http_503", "http_504"]) assert.ok(L.erroAmbiguo({ codigo: c }), c);
  assert.ok(L.erroAmbiguo({ codigo: "xyz", status: 503 }));
  for (const c of ["horario_ocupado", "dados_invalidos", "http_500", "http_429", "sem_permissao", "negocio_nao_encontrado"]) assert.ok(!L.erroAmbiguo({ codigo: c }), c);
  assert.ok(!L.erroAmbiguo(null));
  // servidor FALSO: aplica e guarda por p_req (como a migração 20261002c)
  const mk = (falhas = []) => {
    const guardado = new Map(), criados = [], chamadas = [];
    return { criados, chamadas, api: { async rpcC(nome, p) {
      chamadas.push({ nome, p_req: p.p_req });
      const f = falhas.shift();
      if (f && f.antes) throw Object.assign(new Error(f.antes), { codigo: f.antes });
      let r;
      if (guardado.has(p.p_req)) r = guardado.get(p.p_req);
      else { r = { id: criados.length + 1, titulo: p.p_negocio.titulo }; criados.push(r); guardado.set(p.p_req, r); }
      if (f && f.depois) throw Object.assign(new Error(f.depois), { codigo: f.depois });     // aplicou, mas a resposta se perdeu
      return r;
    } } };
  };
  const sem = async () => {};
  // 1) sem falha: uma chamada, uma criação, com p_req
  let s = mk();
  let r = await L.escreverComReq(s.api, "nx_negocio_salvar", { p_negocio: { titulo: "A" } }, { dormir: sem });
  assert.deepEqual([s.criados.length, s.chamadas.length, r.repetiu], [1, 1, false]);
  assert.match(s.chamadas[0].p_req, RE);
  // 2) PRAZO ESTOURADO DEPOIS de o servidor aplicar: repete com a mesma chave e continua sendo 1 registro
  s = mk([{ depois: "tempo_rede" }]);
  const status = [];
  r = await L.escreverComReq(s.api, "nx_negocio_salvar", { p_negocio: { titulo: "B" } }, { dormir: sem, aoStatus: t => status.push(t) });
  assert.equal(s.criados.length, 1, "1 registro, não 2");
  assert.equal(s.chamadas.length, 2);
  assert.equal(s.chamadas[0].p_req, s.chamadas[1].p_req, "a repetição leva a MESMA chave");
  assert.deepEqual([r.repetiu, r.resultado.id], [true, 1]);
  assert.deepEqual(status, ["Conferindo se foi salvo…"]);
  // 3) caiu ANTES de chegar: a repetição aplica agora (1 registro)
  s = mk([{ antes: "sem_conexao" }, { antes: "sem_conexao" }]);
  r = await L.escreverComReq(s.api, "nx_negocio_salvar", { p_negocio: { titulo: "C" } }, { dormir: sem });
  assert.deepEqual([s.criados.length, s.chamadas.length], [1, 3]);
  // 4) sem sucesso depois das tentativas: erro marcado como ambíguo e com a chave para «Salvar de novo»
  s = mk([{ antes: "sem_conexao" }, { antes: "sem_conexao" }, { antes: "sem_conexao" }]);
  await assert.rejects(() => L.escreverComReq(s.api, "nx_negocio_salvar", { p_negocio: { titulo: "D" } }, { dormir: sem }), e => e.ambigua === true && RE.test(e.req) && e.codigo === "sem_conexao");
  // …e o «Salvar de novo» com a MESMA chave grava uma vez só (mesmo que o 1º já tivesse gravado)
  s = mk([{ depois: "sem_conexao" }, { antes: "sem_conexao" }, { antes: "sem_conexao" }, null]);
  let chave = null;
  await assert.rejects(() => L.escreverComReq(s.api, "nx_negocio_salvar", { p_negocio: { titulo: "E" } }, { dormir: sem }), e => { chave = e.req; return e.ambigua; });
  assert.equal(s.criados.length, 1, "o 1º pedido tinha sido gravado");
  r = await L.escreverComReq(s.api, "nx_negocio_salvar", { p_negocio: { titulo: "E" } }, { req: chave, dormir: sem });
  assert.equal(s.criados.length, 1, "salvar de novo com a mesma chave NÃO duplica");
  assert.equal(r.resultado.id, 1);
  // 5) recusa do servidor não repete e leva a chave
  s = mk([{ antes: "dados_invalidos" }]);
  await assert.rejects(() => L.escreverComReq(s.api, "nx_negocio_salvar", { p_negocio: { titulo: "F" } }, { dormir: sem }), e => e.codigo === "dados_invalidos" && !e.ambigua && RE.test(e.req));
  assert.equal(s.chamadas.length, 1);
  // 6) mover entre tipos de etapa fica adiado pelos 7 s do Desfazer (automações)
  assert.ok(L.movimentoAdiado("aberto", "ganho") && L.movimentoAdiado("aberto", "perdido") && L.movimentoAdiado("ganho", "aberto") && L.movimentoAdiado("perdido", "ganho"));
  assert.ok(!L.movimentoAdiado("aberto", "aberto") && !L.movimentoAdiado(null, "ganho"));
});

await teste("filtrar local: busca sem acento, telefone, dono, etiquetas alguma/todas/nenhuma, origem, valor", () => {
  const cards = [
    { id: 1, titulo: "Implante", nome: "João da Silva", telefone: "5512998303030", dono_id: "u1", etiquetas: ["e1"], origem: "anuncio", valor_previsto: 3500 },
    { id: 2, titulo: "Clareamento", nome: "João da Silva", telefone: "5512998303030", dono_id: "u1", etiquetas: ["e1", "e2"], origem: "manual", valor_previsto: null },
    { id: 3, titulo: "Ortodontia", nome: "Márcia Araújo", telefone: "5512981112222", dono_id: null, etiquetas: ["e3"], origem: "whatsapp", valor_previsto: 800 },
  ];
  const ids = f => L.filtrar(cards, f, { eu: "u1" }).map(c => c.id);
  assert.deepEqual(ids({ busca: "joao" }), [1, 2]);
  assert.deepEqual(ids({ busca: "ARAUJO" }), [3]);
  assert.deepEqual(ids({ busca: "98111" }), [3]);
  assert.deepEqual(ids({ busca: "(12) 99830" }), [1, 2]);
  assert.deepEqual(ids({ dono: "eu" }), [1, 2]);
  assert.deepEqual(ids({ dono: "sem" }), [3]);
  assert.deepEqual(ids({ etiquetas: { op: "alguma", ids: ["e1", "e3"] } }), [1, 2, 3]);
  assert.deepEqual(ids({ etiquetas: { op: "todas", ids: ["e1", "e2"] } }), [2]);
  assert.deepEqual(ids({ etiquetas: { op: "nenhuma", ids: ["e1"] } }), [3]);
  assert.deepEqual(ids({ origem: ["anuncio", "whatsapp"] }), [1, 3]);
  assert.deepEqual(ids({ valor_min: 1000 }), [1]);
  assert.deepEqual(ids({ valor_max: 1000 }), [2, 3]);
  assert.ok(L.filtroVazio({ fechados_dias: 30, busca: "", etiquetas: { op: "alguma", ids: [] }, origem: [] }));
  assert.ok(!L.filtroVazio({ dono: "eu" }));
});

await teste("pedidoAoMover e funisPermitidos (trava do Ads)", () => {
  const e = { id: "x", tipo: "aberto", marco: "nova" };
  assert.equal(L.pedidoAoMover({ id: "g", tipo: "ganho" }, e), "ganho");
  assert.equal(L.pedidoAoMover({ id: "p", tipo: "perdido" }, e), "perdido");
  assert.equal(L.pedidoAoMover({ id: "a", tipo: "aberto", marco: "agendada" }, e), "agendada");
  assert.equal(L.pedidoAoMover({ id: "o", tipo: "aberto", marco: "orcamento" }, e), null);
  assert.equal(L.pedidoAoMover(e, e), null, "mesma etapa (reordenar) não pede nada");
  const funis = [{ id: "ads", conta_no_ads: true }, { id: "ads2", conta_no_ads: true }, { id: "pos", conta_no_ads: false }];
  assert.deepEqual(L.funisPermitidos(funis, "ads", "ganho").map(f => f.id), ["ads"]);
  assert.deepEqual(L.funisPermitidos(funis, "ads", "aberto").map(f => f.id), ["ads", "ads2"]);
  assert.deepEqual(L.funisPermitidos(funis, "pos", "aberto").map(f => f.id), ["ads", "ads2", "pos"]);
});

await teste("validarCampo por tipo e obrigatório", () => {
  const v = (tipo, valor, extra = {}) => L.validarCampo({ tipo, rotulo: "X", ...extra }, valor);
  assert.equal(v("texto", ""), null);
  assert.match(v("texto", "", { obrigatorio: true }), /Preencha/);
  assert.equal(v("numero", "12,5"), null);
  assert.ok(v("numero", "doze"));
  assert.equal(v("moeda", "R$ 1.200,00"), null);
  assert.ok(v("moeda", "-3"));
  assert.equal(v("data", "31/12/2026"), null);
  assert.ok(v("data", "31/13/2026"));
  assert.equal(v("email", "a@b.co"), null);
  assert.ok(v("email", "a@b"));
  assert.equal(v("url", "https://kamiguchi.com.br"), null);
  assert.ok(v("url", "kamiguchi"));
  assert.equal(v("telefone", "(12) 99830-3030"), null);
  assert.ok(v("telefone", "123"));
  assert.equal(v("opcao", "Unimed", { opcoes: ["Unimed", "Bradesco"] }), null);
  assert.ok(v("opcao", "Outro", { opcoes: ["Unimed"] }));
  assert.equal(v("multi", ["A", "B"], { opcoes: ["A", "B", "C"] }), null);
  assert.ok(v("multi", "A; Z", { opcoes: ["A", "B"] }));
  assert.equal(v("sim_nao", true), null);
  assert.match(v("multi", [], { obrigatorio: true, opcoes: ["A"] }), /Preencha/);
  assert.equal(L.normalizarCampo({ tipo: "moeda" }, "1.200,50"), 1200.5);
  assert.equal(L.normalizarCampo({ tipo: "data" }, "01/02/2026"), "2026-02-01");
  assert.deepEqual(L.normalizarCampo({ tipo: "multi" }, "A; B"), ["A", "B"]);
  const campos = [{ entidade: "negocio", chave: "proc", obrigatorio: true, funil_id: "f1", ordem: 1 },
    { entidade: "negocio", chave: "conv", obrigatorio: true, funil_id: null, ordem: 2 },
    { entidade: "negocio", chave: "outro", obrigatorio: true, funil_id: "f2", ordem: 3 },
    { entidade: "contato", chave: "c", obrigatorio: true }];
  assert.deepEqual(L.obrigatoriosVazios(campos, "negocio", "f1", { conv: "x" }).map(c => c.chave), ["proc"]);
  assert.deepEqual(L.camposDe(campos, "negocio", "f2").map(c => c.chave), ["conv", "outro"]);
});

await teste("tempo na etapa e SLA", () => {
  const agora = new Date("2026-09-28T12:00:00Z");
  assert.equal(L.textoDiasEtapa("2026-09-28T09:00:00Z", agora), "hoje na etapa");
  assert.equal(L.textoDiasEtapa("2026-09-27T09:00:00Z", agora), "há 1 dia na etapa");
  assert.equal(L.textoDiasEtapa("2026-09-18T12:00:00Z", agora), "há 10 dias na etapa");
  assert.ok(L.slaEstourado("2026-09-26T11:00:00Z", 48, agora));
  assert.ok(!L.slaEstourado("2026-09-26T13:00:00Z", 48, agora));
  assert.ok(!L.slaEstourado("2026-09-01T13:00:00Z", null, agora));
  assert.equal(L.paraDataHoraLocal("2026-10-05T17:30:00Z"), "2026-10-05T14:30");
  assert.equal(L.paraDataHoraLocal(null), "");
});

await teste("tituloCard, formatarTel e textoErro (rótulo do campo, trava do Ads, códigos do CRM)", () => {
  assert.equal(L.tituloCard({ titulo: "Implante" }), "Implante");
  assert.equal(L.tituloCard({ titulo: "", contato: { nome: "Ana" } }), "Ana");
  assert.equal(L.tituloCard({ nome: "Removido" }), "Removido");
  assert.equal(L.tituloCard({ telefone: "5512998303030" }), "(12) 99830-3030");
  assert.equal(L.tituloCard({}), "Sem nome");
  const campos = [{ chave: "procedimento", rotulo: "Procedimento realizado" }];
  assert.equal(L.textoErro({ codigo: "campo_obrigatorio", hint: "procedimento" }, { campos }), 'Preencha o campo "Procedimento realizado" antes de continuar.');
  assert.match(L.textoErro({ codigo: "funil_invalido", hint: "fechado_no_ads" }), /Iniciar pós-venda/);
  assert.match(L.textoErro({ codigo: "funil_invalido", hint: "sai_do_ads" }), /outro funil de anúncios/);
  assert.equal(L.textoErro({ codigo: "motivo_obrigatorio", hint: "texto" }), "Escolha o motivo da perda e escreva a justificativa.");
  assert.match(L.textoErro({ codigo: "tarefa_nao_encontrada" }), /tarefa/);
  assert.match(L.textoErro({ codigo: "dados_invalidos", hint: "optin_origem" }), /autorização/);
  assert.equal(L.textoErro({ codigo: "xyz" }, { padrao: () => "padrão" }), "padrão");
});

await teste("textoTempo e iconeTempo", () => {
  const vocab = { min: () => "oportunidade", art: () => "a", ganhar: "Fechou", perder: "Não fechou" };
  assert.equal(L.textoTempo({ fonte: "historico", tipo: "estagio", dados: { de_nome: "Nova conversa", para_nome: "Avaliou" } }), "Moveu de «Nova conversa» para «Avaliou»");
  assert.equal(L.textoTempo({ fonte: "historico", tipo: "ganho", dados: { valor: 3200 } }, { vocab, brl: v => `R$ ${v}` }), "Marcou como fechou · R$ 3200");
  assert.equal(L.textoTempo({ fonte: "historico", tipo: "negocio_criado", dados: { titulo: "Implante" } }, { vocab }), "Criou a oportunidade «Implante»");
  assert.equal(L.textoTempo({ fonte: "historico", tipo: "dono", dados: { para: "u1" } }, { nomes: { u1: "Ana" } }), "Responsável: Ana");
  assert.equal(L.textoTempo({ fonte: "nota", tipo: "nota", dados: { texto: "oi" } }), "Nota: oi");
  assert.equal(L.textoTempo({ fonte: "tarefa", tipo: "tarefa_concluida", dados: { titulo: "Ligar" } }), "Concluiu a tarefa «Ligar»");
  assert.equal(L.iconeTempo({ fonte: "historico", tipo: "ganho" }), "check");
  assert.equal(L.iconeTempo({ fonte: "nota" }), "nota");
});

await teste("gerarCSV com ; e BOM (erros da importação)", () => {
  const t = L.gerarCSV(["linha", "motivo"], [[2, 'Telefone "ruim"; e mais'], [5, "ok"]]);
  assert.ok(t.startsWith("﻿"));
  assert.equal(t.slice(1), 'linha;motivo\r\n2;"Telefone ""ruim""; e mais"\r\n5;ok');
});

await teste("CSV: fórmula (=, +, -, @) do nome do WhatsApp não vira fórmula no Excel e volta igual na importação", () => {
  const maus = ['=HYPERLINK("https://x.test/?"&A2;"Clique")', "+cmd|' /C calc'!A0", "-2+3", "@SUM(A1:A9)", "\t=1+1"];
  for (const m of maus) {
    const c = L.csvCampo(m);
    assert.ok(!/^"?[=+\-@\t\r]/.test(c), `continua fórmula: ${c}`);
  }
  assert.equal(L.csvCampo("=1+1"), "'=1+1");
  // número puro, telefone de fora e texto comum ficam como estão
  for (const ok of ["-5", "-1.234,56", "+5512998303030", "12", "Ana", "(12) 99830-3030", ""]) assert.equal(L.csvCampo(ok), ok);
  // exportar → importar: o ' de proteção sai e o valor volta como era
  const csv = L.gerarCSV(["Nome", "Telefone"], [["=HYPERLINK(1)", "(12) 99830-3030"], ["@Ana", "+447911123456"]]);
  const d = L.lerCSV(csv);
  assert.deepEqual(L.montarLinhas(d.linhas, ["nome", "telefone"]), [{ nome: "=HYPERLINK(1)", telefone: "(12) 99830-3030" }, { nome: "@Ana", telefone: "+447911123456" }]);
  assert.deepEqual(L.montarLinhas([["'Ana"]], ["nome"]), [{ nome: "'Ana" }], "apóstrofo comum não é tirado");
});

await teste("lerCSV devolve o número da linha da planilha (cabeçalho = 1, contando linhas vazias)", () => {
  const r = L.lerCSV('nome;obs\r\nAna;"duas\nlinhas"\r\n\r\n;\r\nBeto;x\n');
  assert.deepEqual(r.linhas.map(l => l[0]), ["Ana", "Beto"]);
  assert.deepEqual(r.numeros, [2, 5]);
});

await teste("decodificarArquivo: UTF-8 e planilha ANSI do Excel (Windows-1252)", () => {
  assert.deepEqual(L.decodificarArquivo(new TextEncoder().encode("João;Conceição")), { texto: "João;Conceição", codificacao: "utf-8" });
  const ansi = new Uint8Array([0x4a, 0x6f, 0xe3, 0x6f, 0x3b, 0x41, 0xe7, 0xfa, 0x63, 0x61, 0x72]); // "João;Açúcar"
  assert.deepEqual(L.decodificarArquivo(ansi), { texto: "João;Açúcar", codificacao: "windows-1252" });
});

await teste("importação: destinos, mapa válido, negócio no mapa, soma dos lotes e resumo", () => {
  const d = L.destinosImportacao([{ entidade: "contato", chave: "convenio", rotulo: "Convênio" }, { entidade: "negocio", chave: "x", rotulo: "X" }]);
  assert.ok(d.some(x => x.valor === "campo:convenio" && x.rotulo === "Campo: Convênio"));
  assert.ok(!d.some(x => x.valor === "campo:x"));
  assert.ok(L.mapaValido([null, "telefone"]) && L.mapaValido(["email"]) && !L.mapaValido(["cidade", null]));
  assert.ok(L.mapaTemNegocio(["nome", "negocio_valor"]) && !L.mapaTemNegocio(["nome"]));
  let s = L.somarImportacao(null, { criados: 90, ignorados: 10, erros: [], avisos: [{ linha: 3, motivo: "x" }] });
  s = L.somarImportacao(s, { criados: 1, atualizados: 2, erros: [{ linha: 150, motivo: "y" }] });
  assert.deepEqual([s.criados, s.atualizados, s.ignorados, s.erros.length, s.avisos.length], [91, 2, 10, 1, 1]);
  assert.equal(L.textoResumoImportacao(s), "91 criados · 2 atualizados · 10 ignorados · 1 erro");
});

await teste("validarFunil: mesmas regras do nx_funil_salvar", () => {
  const ok = { nome: "Pós", conta_no_ads: false, estagios: [{ nome: "A", tipo: "aberto" }, { nome: "G", tipo: "ganho" }, { nome: "P", tipo: "perdido" }] };
  assert.deepEqual(L.validarFunil(ok), []);
  const hints = f => L.validarFunil(f).map(e => e.hint);
  assert.deepEqual(hints({ ...ok, nome: " " }), ["nome"]);
  assert.deepEqual(hints({ ...ok, estagios: ok.estagios.slice(0, 2) }), ["tipos"]);
  assert.deepEqual(hints({ ...ok, estagios: [...ok.estagios, { nome: "a", tipo: "aberto" }] }), ["etapa_repetida"]);
  assert.deepEqual(hints({ ...ok, estagios: [...ok.estagios, { nome: "", tipo: "aberto" }] }), ["etapa_nome"]);
  assert.deepEqual(hints({ ...ok, conta_no_ads: true }), ["marco_obrigatorio", "marco_obrigatorio", "marco_obrigatorio"]);
  const ads = { nome: "Ads", conta_no_ads: true, estagios: [{ nome: "A", tipo: "aberto", marco: "agendada" }, { nome: "G", tipo: "ganho", marco: "fechou" }, { nome: "P", tipo: "perdido", marco: "perdida" }] };
  assert.deepEqual(hints(ads), ["marcos"]);
  assert.deepEqual(hints({ ...ads, estagios: [{ ...ads.estagios[0], marco: "nova" }, ads.estagios[1], ads.estagios[2]] }), []);
  assert.deepEqual(hints({ ...ads, estagios: [{ ...ads.estagios[0], marco: "fechou" }, ads.estagios[1], ads.estagios[2]] }), ["marco_tipo"]);
  assert.deepEqual(hints({ ...ok, estagios: [{ nome: "A", tipo: "aberto", probabilidade: 120, sla_horas: 0 }, ok.estagios[1], ok.estagios[2]] }), ["probabilidade", "sla"]);
  assert.equal(L.validarFunil({ nome: "x", estagios: [] })[0].hint, "etapas");
  assert.deepEqual(L.marcosDoTipo("perdido").map(m => m.id), ["nao_fechou", "perdida"]);
  assert.equal(L.probPadrao("ganho"), 100);
});

await teste("editor de funis: etapas removidas, destinos do mesmo tipo, payload e moverItem", () => {
  const orig = [{ id: "a", nome: "A", tipo: "aberto" }, { id: "b", nome: "B", tipo: "aberto" }, { id: "g", nome: "G", tipo: "ganho" }, { id: "p", nome: "P", tipo: "perdido" }];
  const edit = [orig[1], { nome: "Nova", tipo: "aberto" }, orig[2], orig[3]];
  assert.deepEqual(L.etapasRemovidas(orig, edit).map(e => e.id), ["a"]);
  assert.deepEqual(L.destinosPara(orig[0], edit).map(e => e.id), ["b"], "só etapas salvas (com id) do mesmo tipo");
  const p = L.payloadFunil({ id: "f1", nome: " Pós ", conta_no_ads: false }, [{ ...edit[0], marco: "nova", probabilidade: "40", sla_horas: "" }, edit[1], edit[2], edit[3]], { a: "b", x: null });
  assert.equal(p.nome, "Pós"); assert.equal(p.id, "f1");
  assert.deepEqual(p.estagios[0], { id: "b", nome: "B", tipo: "aberto", cor: null, marco: null, probabilidade: 40, sla_horas: null });
  assert.equal(p.estagios[1].id, undefined);
  assert.deepEqual(p.mover, { a: "b" });
  assert.equal(L.payloadFunil({ nome: "x", conta_no_ads: true }, [{ nome: "A", tipo: "aberto", marco: "nova" }]).estagios[0].marco, "nova");
  assert.deepEqual(L.moverItem([1, 2, 3, 4], 3, 0), [4, 1, 2, 3]);
  assert.deepEqual(L.moverItem([1, 2, 3], 0, 5), [1, 2, 3]);
});

await teste("editor de funis: remover a etapa que era DESTINO de outra repassa o destino (sem «?» nem estagio_invalido/destino)", () => {
  // A (com negócios) → B; depois B sai também, com destino C: A passa a ir para C
  const mover = { a: "b" };
  assert.deepEqual(L.quemVaiPara(mover, "b"), ["a"]);
  assert.deepEqual(L.repontarMover(mover, "b", "c", true), { a: "c", b: "c" });
  assert.deepEqual(L.repontarMover(mover, "b", "c", false), { a: "c" }, "B sem negócios próprios não entra no mover");
  assert.deepEqual(mover, { a: "b" }, "não altera o original");
  // o payload final só aponta para etapas que ficam
  const ficam = [{ id: "c", nome: "C", tipo: "aberto" }, { id: "g", nome: "G", tipo: "ganho" }, { id: "p", nome: "P", tipo: "perdido" }];
  const p = L.payloadFunil({ id: "f", nome: "F" }, ficam, L.repontarMover(mover, "b", "c", true));
  const ids = new Set(p.estagios.map(e => e.id));
  assert.ok(Object.values(p.mover).every(d => ids.has(d)));
});

await teste("textoErro dos hints de funil, etapa com negócios e campos", () => {
  assert.match(L.textoErro({ codigo: "funil_invalido", hint: "marcos" }), /Nova conversa.*Fechou/);
  assert.match(L.textoErro({ codigo: "funil_invalido", hint: "tem_fechados" }), /Desative/);
  assert.match(L.textoErro({ codigo: "funil_invalido", hint: "padrao_sem_ads" }), /funil padrão/);
  assert.match(L.textoErro({ codigo: "estagio_invalido", hint: "destino_tipo" }), /mesmo tipo/);
  assert.equal(L.textoErro({ codigo: "estagio_com_negocios", hint: "1" }), "Essa etapa tem 1 negócio. Escolha para onde ele vai.");
  assert.equal(L.textoErro({ codigo: "estagio_com_negocios", hint: "12" }), "Essa etapa tem 12 negócios. Escolha para onde eles vão.");
  assert.match(L.textoErro({ codigo: "dados_invalidos", hint: "max_campos" }), /50 campos/);
  assert.match(L.textoErro({ codigo: "empresa_nao_encontrada" }), /empresa/);
  assert.match(L.textoErro({ codigo: "funil_invalido", hint: "fechado_no_ads" }), /Iniciar pós-venda/, "trava do Ads continua igual");
});

await teste("exportar: linhas do CSV com colunas que a importação reconhece e campos personalizados", () => {
  const campos = [{ entidade: "contato", chave: "convenio", rotulo: "Convênio", tipo: "opcao", ordem: 2 },
    { entidade: "contato", chave: "retorno", rotulo: "Retorno em", tipo: "data", ordem: 1 },
    { entidade: "negocio", chave: "x", rotulo: "X" }];
  const { cabecalho, linhas } = L.linhasExportacao([
    { nome: "Ana", telefone: "5512998303030", email: "ana@x.com", empresa_nome: "Frota", cidade: "Taubaté", uf: "SP", nascimento: "1990-12-31",
      documento: "123", origem: "indicacao", etiquetas_nomes: ["VIP", "Implante"], dono_nome: "Beto", optin_marketing: false,
      criado_em: "2026-09-28T02:00:00Z", obs: "x", campos: { convenio: "Unimed", retorno: "2026-10-05" } }], campos);
  assert.deepEqual(cabecalho.slice(-2), ["Retorno em", "Convênio"]);
  assert.deepEqual(linhas[0], ["Ana", "(12) 99830-3030", "ana@x.com", "Frota", "Taubaté", "SP", "31/12/1990", "123", "Indicação", "VIP; Implante",
    "Beto", "Não", "27/09/2026", "x", "05/10/2026", "Unimed"]);
  // o cabeçalho volta certinho pela sugestão de mapeamento da importação
  assert.deepEqual(L.sugerirMapeamento(cabecalho.slice(0, 10)), ["nome", "telefone", "email", "empresa", "cidade", "uf", "nascimento", "documento", "origem", "etiquetas"]);
  assert.equal(L.dataCurtaCSV(null), "");
});

/* ============================================================ (a2) agenda (M26) */
console.log("\n(a2) agenda.js — grade de horário");
const AG = await import("../web/app/agenda.js");

await teste("agenda: semana de segunda a domingo, dia civil e instantes em São Paulo", () => {
  assert.equal(AG.diaISO("2026-10-31", 1), "2026-11-01");
  assert.equal(AG.diaISO("2026-03-01", -1), "2026-02-28");
  assert.equal(AG.diaDaSemana("2026-10-01"), 4);                 // quinta
  assert.equal(AG.segundaDe("2026-10-01"), "2026-09-28");        // quinta → segunda
  assert.equal(AG.segundaDe("2026-09-28"), "2026-09-28");        // segunda → ela mesma
  assert.equal(AG.segundaDe("2026-10-04"), "2026-09-28");        // domingo fecha a semana
  assert.deepEqual(AG.partesSP("2026-10-01T10:30:00-03:00"), { dia: "2026-10-01", min: 630 });
  assert.deepEqual(AG.partesSP("2026-10-01T02:30:00Z"), { dia: "2026-09-30", min: 23 * 60 + 30 });   // 02:30Z = 23:30 do dia anterior em SP
  assert.equal(AG.partesSP("não é data"), null);
  assert.equal(AG.horaTxt(630), "10:30");
});

await teste("agenda: horário de atendimento — faixas, intervalos, horário aberto e janelas fechadas", () => {
  const cfg = { horario: { 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 6: [["08:00", "12:00"]] }, intervalos: [["12:00", "13:00"]], duracao_min: 30 };
  const seg = "2026-09-28", dom = "2026-10-04", sab = "2026-10-03";
  assert.deepEqual(AG.faixasDoDia(cfg, seg), [[480, 1080]]);
  assert.deepEqual(AG.faixasDoDia(cfg, dom), []);                 // sem faixa = dia fechado
  assert.equal(AG.faixasDoDia({}, seg), null);                    // sem horário na configuração = não sabe (nada é sombreado)
  assert.equal(AG.horarioAberto(cfg, seg, 10 * 60), true);
  assert.equal(AG.horarioAberto(cfg, seg, 12 * 60 + 30), false);  // almoço
  assert.equal(AG.horarioAberto(cfg, seg, 7 * 60), false);
  assert.equal(AG.horarioAberto(cfg, dom, 10 * 60), false);
  assert.equal(AG.horarioAberto({}, seg, 10 * 60), null);
  const eixo = { ini: 7, fim: 19 };
  assert.deepEqual(AG.janelasFechadas(cfg, seg, eixo), [[420, 480], [720, 780], [1080, 1140]]);
  assert.deepEqual(AG.janelasFechadas(cfg, dom, eixo), [[420, 1140]]);
  assert.deepEqual(AG.janelasFechadas(cfg, sab, eixo), [[420, 480], [720, 1140]]);
  assert.deepEqual(AG.janelasFechadas({}, seg, eixo), []);
});

await teste("agenda: eixo de horas — expediente dos dias mostrados, esticado para caber toda consulta (mínimo 4 h)", () => {
  const cfg = { horario: { 1: [["08:00", "18:00"]], 2: [["08:00", "18:00"]], 6: [["08:00", "12:00"]] }, duracao_min: 30 };
  const dias = ["2026-09-28", "2026-09-29"];
  assert.deepEqual(AG.eixoDaGrade({}), { ini: 8, fim: 18 });                                         // sem nada: 08–18
  assert.deepEqual(AG.eixoDaGrade({ dias, config: cfg }), { ini: 8, fim: 18 });
  assert.deepEqual(AG.eixoDaGrade({ dias: ["2026-10-03"], config: cfg }), { ini: 8, fim: 12 });
  const cedo = { inicio: "2026-09-28T07:30:00-03:00", fim: "2026-09-28T08:15:00-03:00" };
  const tarde = { inicio: "2026-09-29T18:30:00-03:00", fim: "2026-09-29T19:15:00-03:00" };
  assert.deepEqual(AG.eixoDaGrade({ dias, config: cfg, consultas: [cedo, tarde] }), { ini: 7, fim: 20 });
  const outroDia = { inicio: "2026-10-09T06:00:00-03:00", fim: "2026-10-09T07:00:00-03:00" };
  assert.deepEqual(AG.eixoDaGrade({ dias, config: cfg, consultas: [outroDia] }), { ini: 8, fim: 18 });   // consulta de outro dia não estica o eixo
  assert.deepEqual(AG.eixoDaGrade({ dias: ["2026-09-28"], config: { horario: { 1: [["09:00", "10:00"]] } } }), { ini: 9, fim: 13 });
  assert.deepEqual(AG.eixoDaGrade({ dias: ["2026-10-04"], config: cfg }), { ini: 8, fim: 18 });          // semana toda fechada: volta a 08–18
});

await teste("agenda: posição do bloco — a altura é a duração (60 min = o dobro de 30 min)", () => {
  const eixo = { ini: 8, fim: 18 };
  const um = AG.posicaoNoDia({ inicio: "2026-09-28T10:00:00-03:00", fim: "2026-09-28T10:30:00-03:00" }, "2026-09-28", eixo);
  const dois = AG.posicaoNoDia({ inicio: "2026-09-28T11:00:00-03:00", fim: "2026-09-28T12:00:00-03:00" }, "2026-09-28", eixo);
  assert.deepEqual(um, { topo: 2, altura: 0.5 });
  assert.deepEqual(dois, { topo: 3, altura: 1 });
  assert.equal(dois.altura, 2 * um.altura);
  // sem `fim`: duração padrão; fim antes do início: duração padrão
  assert.deepEqual(AG.posicaoNoDia({ inicio: "2026-09-28T09:00:00-03:00" }, "2026-09-28", eixo, 45), { topo: 1, altura: 0.75 });
  assert.deepEqual(AG.posicaoNoDia({ inicio: "2026-09-28T09:00:00-03:00", fim: "2026-09-28T08:00:00-03:00" }, "2026-09-28", eixo, 30), { topo: 1, altura: 0.5 });
  // começa antes do eixo: corta no topo; fora do eixo: null
  assert.deepEqual(AG.posicaoNoDia({ inicio: "2026-09-28T07:00:00-03:00", fim: "2026-09-28T09:00:00-03:00" }, "2026-09-28", eixo), { topo: 0, altura: 1 });
  assert.equal(AG.posicaoNoDia({ inicio: "2026-09-28T19:00:00-03:00", fim: "2026-09-28T20:00:00-03:00" }, "2026-09-28", eixo), null);
  // bloqueio de dia inteiro (00:00 → 00:00 do dia seguinte) ocupa o eixo todo
  assert.deepEqual(AG.posicaoNoDia({ inicio: "2026-10-04T00:00:00-03:00", fim: "2026-10-05T00:00:00-03:00" }, "2026-10-04", eixo), { topo: 0, altura: 10 });
});

await teste("agenda: consultas no mesmo horário ficam LADO A LADO (colunas dentro da faixa)", () => {
  const b = (topo, altura, nome) => ({ topo, altura, nome });
  // duas no mesmo horário
  const duas = AG.colocarEmFaixas([b(1, 0.5, "A"), b(1, 0.5, "B")]);
  assert.deepEqual(duas.map(x => [x.nome, x.col, x.cols]), [["A", 0, 2], ["B", 1, 2]]);
  // em sequência: cada uma ocupa a largura toda
  assert.deepEqual(AG.colocarEmFaixas([b(1, 0.5, "A"), b(1.5, 0.5, "B"), b(3, 1, "C")]).map(x => [x.col, x.cols]), [[0, 1], [0, 1], [0, 1]]);
  // três ao mesmo tempo
  assert.deepEqual(AG.colocarEmFaixas([b(2, 1, "A"), b(2, 1, "B"), b(2, 1, "C")]).map(x => [x.col, x.cols]), [[0, 3], [1, 3], [2, 3]]);
  // cadeia: A 9–10, B 9:30–10:30, C 10–11 → A e C dividem a mesma faixa (A termina quando C começa), B a outra; ordem de entrada preservada
  const cad = AG.colocarEmFaixas([b(1, 1, "A"), b(1.5, 1, "B"), b(2, 1, "C")]);
  assert.deepEqual(cad.map(x => [x.nome, x.col, x.cols]), [["A", 0, 2], ["B", 1, 2], ["C", 0, 2]]);
  // grupos independentes não se afetam: o 1º tem 2 colunas, o 2º só 1
  const g = AG.colocarEmFaixas([b(1, 1, "A"), b(1, 1, "B"), b(5, 1, "C")]);
  assert.deepEqual(g.map(x => x.cols), [2, 2, 1]);
  // um bloco que contém outro
  assert.deepEqual(AG.colocarEmFaixas([b(1, 3, "grande"), b(2, 0.5, "pequeno")]).map(x => [x.col, x.cols]), [[0, 2], [1, 2]]);
  assert.deepEqual(AG.colocarEmFaixas([]), []);
});

await teste("agenda: cor do procedimento (sempre a mesma), consultas e bloqueios do dia, hora do clique", () => {
  const c = AG.corDoProcedimento("Limpeza");
  assert.ok(Number.isInteger(c) && c >= 0 && c <= 11);
  assert.equal(AG.corDoProcedimento("  LIMPEZA "), c);
  assert.equal(AG.corDoProcedimento("Limpeza"), c);
  assert.equal(AG.corDoProcedimento("Avaliação"), AG.corDoProcedimento("avaliacao"));
  assert.equal(AG.corDoProcedimento(""), 3);
  assert.equal(AG.corDoProcedimento(null), 3);
  const todas = new Set(["Limpeza", "Clareamento", "Implante", "Ortodontia", "Avaliação", "Canal", "Faceta", "Lente", "Extração", "Revisão"].map(AG.corDoProcedimento));
  assert.ok(todas.size >= 6, "as cores se espalham pela paleta");
  const consultas = [{ inicio: "2026-09-28T14:00:00-03:00", n: 2 }, { inicio: "2026-09-28T09:00:00-03:00", n: 1 }, { inicio: "2026-09-29T09:00:00-03:00", n: 3 }, { n: 4 }];
  assert.deepEqual(AG.consultasDoDia(consultas, "2026-09-28").map(x => x.n), [1, 2]);
  const bloqueios = [{ id: 1, inicio: "2026-10-04T00:00:00-03:00", fim: "2026-10-05T00:00:00-03:00" }, { id: 2, inicio: "2026-10-02T12:00:00-03:00", fim: "2026-10-02T13:00:00-03:00" }];
  assert.deepEqual(AG.bloqueiosDoDia(bloqueios, "2026-10-04").map(x => x.id), [1]);
  assert.deepEqual(AG.bloqueiosDoDia(bloqueios, "2026-10-05"), [], "o bloqueio que termina à meia-noite não vaza para o dia seguinte");
  assert.deepEqual(AG.bloqueiosDoDia(bloqueios, "2026-10-02").map(x => x.id), [2]);
  const eixo = { ini: 8, fim: 18 };
  assert.equal(AG.horaDoClique(0.5, eixo, 30), "13:00");
  assert.equal(AG.horaDoClique(0.32, eixo, 30), "11:00");        // 11:12 → arredonda PARA BAIXO ao passo
  assert.equal(AG.horaDoClique(0, eixo, 30), "08:00");
  assert.equal(AG.horaDoClique(1, eixo, 30), "17:30");           // a borda de baixo não vira 18:00
  assert.equal(AG.horaDoClique(0.5, eixo, 60), "13:00");
  assert.equal(AG.horaDoClique(0.54, eixo, 15), "13:15");   // 13:24 → 13:15
  assert.equal(AG.horaDoClique(0.55, eixo, 15), "13:30");
});

await teste("agenda (M27): horários livres por dia, rótulos «Hoje/Amanhã/Sex 03/10», primeiro livre, amanhã de manhã e o mais perto do clique", () => {
  const sl = (iso, livre = true) => ({ inicio: iso, livre, ocupados: livre ? 0 : 1, capacidade: 1 });
  const horarios = [
    sl("2026-10-01T14:30:00.000Z"),            // 11:30 de quinta (hoje)
    sl("2026-10-01T16:00:00.000Z", false),     // ocupado: fora
    sl("2026-10-02T11:30:00.000Z"),            // 08:30 de sexta (amanhã)
    sl("2026-10-02T12:00:00.000Z"),            // 09:00 de sexta
    sl("2026-10-02T19:30:00.000Z"),            // 16:30 de sexta
    sl("2026-10-03T12:00:00.000Z"),            // 09:00 de sábado
    { inicio: "lixo", livre: true },
    null,
  ];
  const g = AG.agruparLivres(horarios);
  assert.deepEqual(g.map(x => [x.dia, x.itens.length]), [["2026-10-01", 1], ["2026-10-02", 3], ["2026-10-03", 1]], "só os livres, agrupados por dia de São Paulo");
  assert.deepEqual(g[1].itens.map(s => s.min), [510, 540, 990], "em ordem de horário");
  assert.deepEqual(AG.agruparLivres([]), []);
  assert.deepEqual(AG.agruparLivres(null), []);
  // rótulos
  assert.equal(AG.rotuloDoDia("2026-10-01", "2026-10-01"), "Hoje");
  assert.equal(AG.rotuloDoDia("2026-10-02", "2026-10-01"), "Amanhã");
  assert.equal(AG.rotuloDoDia("2026-10-03", "2026-10-01"), "Sáb 03/10");
  assert.equal(AG.rotuloDoDia("2026-10-05", "2026-10-01"), "Seg 05/10");
  assert.equal(AG.rotuloDoDia("2026-11-01", "2026-10-31"), "Amanhã", "virada de mês");
  // atalhos
  assert.equal(AG.primeiroLivre(g).inicio, "2026-10-01T14:30:00.000Z");
  assert.equal(AG.primeiroLivre([]), null);
  assert.equal(AG.amanhaDeManha(g, "2026-10-01").inicio, "2026-10-02T11:30:00.000Z", "amanhã antes do meio-dia");
  const tarde = AG.agruparLivres([sl("2026-10-02T19:30:00.000Z")]);
  assert.equal(AG.amanhaDeManha(tarde, "2026-10-01"), null, "amanhã só tem tarde → sem atalho");
  assert.equal(AG.amanhaDeManha(g, "2026-10-02").inicio, "2026-10-03T12:00:00.000Z", "o «amanhã» acompanha o «hoje» informado");
  // o horário livre mais perto do clique, no mesmo dia
  assert.equal(AG.slotMaisPerto(g, "2026-10-02", "09:10").min, 540);
  assert.equal(AG.slotMaisPerto(g, "2026-10-02", "15:00").min, 990);
  assert.equal(AG.slotMaisPerto(g, "2026-10-02", "08:00").min, 510);
  assert.equal(AG.slotMaisPerto(g, "2026-10-09", "09:00"), null, "dia sem horário livre");
  assert.equal(AG.slotMaisPerto(g, "2026-10-02", "xx"), null);
});

await teste("marcar consulta (M27): 2 toques, busca ao digitar, atalhos, desfazer — estático de agenda.js e do botão na gaveta", () => {
  const js = ler("agenda.js"), neg = ler("crm-negocio.js"), css = ler("agenda.css");
  assert.ok(/export async function marcarConsulta\(ctx,/.test(js) && /export async function desmarcarConsulta\(ctx,/.test(js), "as janelas são exportadas (o CRM abre a mesma pela gaveta)");
  assert.ok(/ui\.debounce\(buscarAgora, 300\)/.test(js) && !/Buscar negócios/.test(js), "a busca roda enquanto digita; sem o botão «Buscar negócios»");
  assert.ok(/api\.rpcC\("nx_buscar", \{ p_q: q \}\)/.test(js), "busca por uma chamada só (nx_buscar)");
  assert.ok(/api\.rpcC\("nx_agenda_livres"/.test(js) && /carregarHorarios\(\{ inicial: true \}\)/.test(js), "escolher a oportunidade já carrega os horários livres");
  assert.ok(/Primeiro livre/.test(js) && /Amanhã de manhã/.test(js), "atalhos");
  assert.ok(/role: "radio"/.test(js) && /radiosComSetas/.test(js), "chips e pílulas como radios, com setas");
  assert.ok(/\[data-tipo="primario"\]/.test(js) && /\.focus\(/.test(js), "com a oportunidade escolhida o foco vai para «Confirmar consulta» (Enter = 2º toque)");
  assert.ok(/ui\.acaoComDesfazer\(/.test(js) && /nx_agenda_desmarcar/.test(js) && /anterior/.test(js), "aviso «Marcada para … · Desfazer» (desmarca, ou volta ao horário anterior)");
  assert.ok(/ui\.carregarCss\("agenda"\)/.test(js.slice(js.indexOf("export async function marcarConsulta"))), "o CSS da agenda carrega também quando a janela abre pelo CRM");
  assert.ok(/ctx\.comandos\.registrar\(\{ id: "agenda\.marcar"/.test(js), "ação «Marcar consulta» registrada na paleta (M18)");
  assert.ok(/class: "bt bt-sec ng-marcar"/.test(neg) && /marcarConsulta\(k\.ctx/.test(neg), "gaveta do negócio: botão «Marcar consulta»");
  assert.ok(/\.ag-hora-pill\[aria-checked="true"\]/.test(css) && /\.ag-dia-chip\[aria-checked="true"\]/.test(css), "estilo do selecionado");
});

await teste("cadastro (M24): aviso de duplicado pelo telefone digitado e a origem do cartão em uma linha", () => {
  const itens = [{ id: 501, telefone: "5512998303030", nome: "Mariana Costa", ultimo_contato_em: "2026-09-29T12:00:00Z" }, { id: 502, telefone: "5512981112222", nome: "Rafael" }, { id: 503, telefone: null, nome: "Sem telefone" }];
  // a mesma pessoa em qualquer formato (máscara, +55, sem o 9º dígito, só dígitos)
  for (const dig of ["(12) 99830-3030", "12998303030", "+55 12 99830-3030", "5512998303030", "1298303030", "(12) 9830-3030"]) assert.equal(L.acharDuplicado(itens, dig).id, 501, dig);
  // só vale com 10–13 dígitos; outra pessoa, a própria (edição) ou lista vazia não avisam
  assert.equal(L.acharDuplicado(itens, "(12) 99830-30"), null, "ainda incompleto");
  assert.equal(L.acharDuplicado(itens, "12998303031"), null, "outro número");
  assert.equal(L.acharDuplicado(itens, "12998303030", { ignorarId: 501 }), null, "o próprio cadastro não é duplicado dele mesmo");
  assert.equal(L.acharDuplicado([], "12998303030"), null);
  assert.equal(L.acharDuplicado(null, "12998303030"), null);
  assert.equal(L.acharDuplicado(itens, "55129983030301234"), null, "mais de 13 dígitos");
  // origem do cartão (tooltip do glifo)
  assert.equal(L.descricaoOrigem({ plataforma: "google", campanha_nome: "Aparelho invisível", anuncio_nome: "Vídeo 1", origem: "anuncio" }), "Google Ads · Campanha Aparelho invisível · Anúncio Vídeo 1");
  assert.equal(L.descricaoOrigem({ plataforma: "meta" }), "Meta Ads");
  assert.equal(L.descricaoOrigem({ origem: "whatsapp" }), "WhatsApp");
  assert.equal(L.descricaoOrigem({ origem: "indicacao", rastreio: { utm_campaign: "x" } }), "Indicação · Campanha x");
  assert.equal(L.descricaoOrigem({}), "");
  assert.equal(L.descricaoOrigem(null), "");
});

await teste("cartão e gaveta (M24): 3 linhas, nenhum tamanho abaixo de 12 px, glifo da origem, pontos de etiqueta, campos em blocos e aviso de duplicado — estático", () => {
  const k = ler("crm-kanban.js"), css = ler("crm.css"), neg = ler("crm-negocio.js"), listas = ler("crm-listas.js");
  assert.ok(/class: "kc-l2"/.test(k) && /class: "kc-rod"/.test(k) && /class: "kc-pontos"/.test(k) && /L\.descricaoOrigem\(c\)/.test(k), "cartão: título, valor + contato/procedimento, rodapé");
  assert.ok(!/kc-selos|kc-etiqs/.test(k) && !/kc-selos|kc-etiqs/.test(css), "as pílulas e etiquetas por extenso saíram do cartão");
  assert.ok(/simbolo\(c\.plataforma === "google" \? "google" : "meta", "anuncio"\)/.test(k), "glifo i-meta/i-google (megafone se o símbolo ainda não existe)");
  assert.ok(/etqs\.slice\(0, 3\)/.test(k), "até 3 pontos de etiqueta");
  // nenhum font-size literal abaixo de 12 px nas regras do cartão (--fs-11 = 11 px e px soltos < 12)
  const cartao = css.split("\n").filter(l => /^\.kc(-[a-z-]+)?\b/.test(l.trim()));
  for (const l of cartao) { assert.ok(!/--fs-11\b/.test(l), "11 px no cartão: " + l.slice(0, 60)); const m = l.match(/font-size:\s*(\d+(?:\.\d+)?)px/); assert.ok(!m || Number(m[1]) >= 12, "tamanho < 12 px: " + l.slice(0, 60)); }
  assert.ok(/\.kc-t \{[^}]*font-size: var\(--fs-15\)/.test(css) && /\.kc-valor \{[^}]*font-family: var\(--f-titulo\)[^}]*font-size: var\(--fs-h3\)/.test(css), "título 15 px / valor em Clash 16 px");
  // gaveta: campos em blocos (2 colunas no celular) e título com lápis
  assert.ok(/class: \["ng-campo", largo && "ng-campo-largo"\]/.test(neg) && /\.ng-campo-largo \{ grid-column: 1 \/ -1; \}/.test(css), "campos em blocos .ng-campo (largo ocupa a linha toda)");
  assert.ok(/@media \(max-width: 760px\) \{[\s\S]*?\.ng-kv \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(css), "Dados em grade de 2 colunas no celular");
  assert.ok(/ng-lapis/.test(neg) && /Editar o título/.test(neg), "título editável pelo lápis");
  // duplicado e validação ao digitar
  assert.ok(/export function avisoDuplicado\(/.test(neg) && /L\.acharDuplicado\(/.test(neg) && /nx_contatos_listar/.test(neg), "aviso de duplicado (nx_contatos_listar)");
  assert.ok(/avisoDuplicado\(k, grade\.querySelector\("\[name=c_telefone\]"\)/.test(neg) && /N\.avisoDuplicado\(k, form\.querySelector\("\[name=telefone\]"\)/.test(listas), "Nova oportunidade e Novo paciente");
  assert.ok(!/Se o telefone já estiver cadastrado, usamos o mesmo cadastro/.test(neg), "a frase fixa saiu");
  assert.ok(/validar: "telefone"/.test(neg) && /validar: "moeda"/.test(neg) && /validar: "telefone"/.test(listas), "telefone e valor com ui.campo({validar})");
});

/* ============================================================ (b) estáticos */
console.log("\n(b) estáticos dos arquivos do CRM");
const ARQS_JS = ["crm.js", "crm-kanban.js", "crm-listas.js", "crm-negocio.js", "crm-tarefas.js", "crm-importar.js", "crm-config.js", "crm-logica.js", "agenda.js", "agenda-config.js"];
const existentes = ARQS_JS.filter(f => existsSync(join(APP, f)));

await teste("arquivos do CRM existem e passam em node --check", () => {
  for (const f of ARQS_JS) assert.ok(existsSync(join(APP, f)), `falta web/app/${f}`);
  assert.ok(existsSync(join(APP, "crm.css")), "falta web/app/crm.css");
  for (const f of existentes) execFileSync(process.execPath, ["--check", join(APP, f)]);
});

await teste("nenhum import estático; todo import() com ?v=", () => {
  for (const f of existentes) {
    const s = ler(f);
    assert.ok(!/^\s*import\s[^(]/m.test(s), `${f}: import estático`);
    for (const m of s.matchAll(/import\(([^)]*)\)/g)) {
      assert.ok(/\?v=/.test(m[1]) || /versao/.test(m[1]), `${f}: import() sem ?v=: ${m[1]}`);
      assert.ok(!/(ui|api|app|tema)\.js/.test(m[1]), `${f}: não pode carregar ui/api/app/tema`);
    }
  }
});

await teste("sem innerHTML/outerHTML/insertAdjacentHTML e sem on*= inline", () => {
  for (const f of existentes) {
    const s = ler(f);
    assert.ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/.test(s), `${f}: HTML cru`);
    assert.ok(!/["']on[a-z]+=/.test(s), `${f}: handler inline`);
  }
});

await teste("nenhum hex de cor nos JS do CRM", () => {
  for (const f of existentes) {
    const s = ler(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/.test(s.replace(/["'`]#\/[^"'`]*["'`]/g, "")), `${f}: hex de cor no JS`);
  }
});

await teste("crm.css: só tokens (nenhum hex/rgb fixo), [hidden] forte, sem 1fr solto, sem ease-in", () => {
  const css = ler("crm.css");
  const semRoot = css.replace(/:root\s*\{[^}]*\}/g, "");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(semRoot), "hex fora de :root");
  assert.ok(!/\brgba?\(/.test(semRoot), "rgb/rgba fixo");
  assert.ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css), "[hidden]{display:none!important}");
  assert.ok(!/(^|[\s(,])1fr/.test(css.replace(/minmax\(0,\s*1fr\)/g, "")), "1fr solto (use minmax(0,1fr))");
  assert.ok(!/ease-in(?!-out)/.test(css), "ease-in");
  assert.ok(/prefers-reduced-motion/.test(css) || !/animation:/.test(css), "reduced-motion");
});

await teste("kanban no toque (M23): touchmove não passivo, sem snap ao arrastar, touch-action nos dois eixos, «Mover para…» sempre à mão", () => {
  const js = ler("crm-kanban.js"), css = ler("crm.css");
  assert.ok(/addEventListener\("touchmove",\s*aoToqueMover,\s*\{\s*passive:\s*false\s*\}\)/.test(js), "touchmove não passivo (cancelar a rolagem só com o cartão levantado)");
  assert.ok(/ev\.cancelable/.test(js), "só cancela touchmove cancelável");
  assert.ok(/\.kb\.arrastando\s*\{[^}]*scroll-snap-type:\s*none/.test(css), "snap desligado durante o arrasto (a rolagem de borda é por scrollLeft)");
  assert.ok(/\.kc \{[\s\S]*?touch-action:\s*pan-x pan-y/.test(css), ".kc rola nos dois eixos (nunca touch-action: none)");
  assert.ok(!/\.kc[^{]*\{[^}]*touch-action:\s*none/.test(css), "touch-action: none em cartão roubaria a rolagem");
  assert.ok(/\.vista > \.crm\s*\{\s*animation-fill-mode:\s*backwards/.test(css), "sem transform residual no .crm (prenderia o position: fixed do botão flutuante)");
  assert.ok(/L\.gestoMover\(/.test(js) && /L\.gestoSoltar\(/.test(js) && /L\.TOQUE\.MS_LONGO/.test(js), "o arrasto por toque segue a máquina de estados do crm-logica");
  assert.ok(/abrirMoverPara/.test(js) && /class:\s*"bt-icone kc-mover"/.test(js) && /ev\.key === "m"/.test(js), "«Mover para…»: botão no cartão, tecla M e toque longo sem arrastar");
  assert.ok(/class:\s*"kb-fita"/.test(js) && /class:\s*"crm-fab"/.test(js) && /crm-resumo/.test(js), "fita de etapas, totais numa linha e botão flutuante");
  assert.ok(/\.kb-zonas\s*\{[^}]*animation-name:\s*zonasEntramM/.test(css), "zonas Ganhou/Perdeu valem no celular");
  assert.ok(!/\.kb-zonas\s*\{\s*display:\s*none/.test(css), "zonas não somem mais no celular");
});

await teste("agenda.css (M26): só tokens, paleta --pal-*, hachura do bloqueio, altura da hora pela tela, celular sem Dia/Semana", () => {
  const css = ler("agenda.css");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/:root\s*\{[^}]*\}/g, "")), "hex fora de :root");
  assert.ok(!/\brgba?\(/.test(css), "rgb/rgba fixo");
  assert.ok(!/(^|[\s(,])1fr/.test(css.replace(/minmax\(0,\s*1fr\)/g, "")), "1fr solto (use minmax(0,1fr))");
  assert.ok(!/ease-in(?!-out)/.test(css), "ease-in");
  assert.ok(/--h-hora:\s*clamp\(/.test(css), "a altura da hora acompanha a tela");
  assert.ok(/repeating-linear-gradient\(135deg/.test(css), "bloqueio hachurado");
  assert.ok(/\.ag-item\s*\{[\s\S]*?height:\s*calc\(var\(--d\) \* var\(--h-hora\)\)/.test(css), "altura do bloco = duração × altura da hora");
  assert.ok(/--pal-\$\{cor\}/.test(ler("agenda.js")), "cor do bloco pelo token da paleta");
  assert.ok(!/\.agenda-dia\b|agenda-consulta\b/.test(css), "os cartões de dia antigos saíram");
  assert.ok(/\.agenda-abas \{ display: none; \}/.test(css), "celular: sem Dia/Semana (a visão é o dia com a faixa da semana)");
});

/* ============================================================ (a3) listas do celular (M28) */
console.log("\n(a3) listas do celular — Ligar/Conversa, deslizar e botão");

await teste("M28: tel: do cadastro, ações da linha (o deslizar aponta para ações que o ⋮/botão já têm) e adiar para amanhã", () => {
  // hrefTel: só dígitos; DDD + número ganha o 55; fora de 10–13 dígitos não dá para ligar
  assert.equal(L.hrefTel("5512998303030"), "tel:+5512998303030");
  assert.equal(L.hrefTel("(12) 99830-3030"), "tel:+5512998303030");
  assert.equal(L.hrefTel("1230303030"), "tel:+551230303030");
  assert.equal(L.hrefTel("447911123456"), "tel:+447911123456");
  assert.equal(L.hrefTel("123"), null); assert.equal(L.hrefTel(""), null); assert.equal(L.hrefTel(null), null); assert.equal(L.hrefTel("55129983030301234"), null);
  // contato: quem pode escrever tem Tarefa (direita) e Oportunidade (esquerda); todo lado do gesto existe no ⋮
  for (const pode of [true, false]) for (const conversas of [true, false]) for (const telefone of [true, false]) {
    const A = L.acoesDoContato({ pode, conversas, telefone });
    for (const lado of [A.direita, A.esquerda]) if (lado) assert.ok(A.menu.includes(lado) || A.botoes.includes(lado), `o gesto «${lado}» precisa de botão equivalente`);
    assert.ok(A.menu.includes("abrir"), "abrir a ficha sempre existe");
    assert.deepEqual(A.botoes, [telefone && "ligar", conversas && "conversa"].filter(Boolean));
    if (!pode) { assert.equal(A.direita, null); assert.equal(A.esquerda, null); assert.deepEqual(A.menu, ["abrir"]); }
  }
  assert.deepEqual(L.acoesDoContato({ pode: true }), { botoes: [], menu: ["abrir", "tarefa", "negocio"], direita: "tarefa", esquerda: "negocio" });
  // tarefa: direita = concluir (o círculo é o botão), esquerda = adiar (no ⋮); concluída reabre e não adia; excluir só no ⋮
  const T = L.acoesDaTarefa({ pode: true });
  assert.deepEqual(T, { botoes: ["concluir"], menu: ["editar", "adiar", "excluir"], direita: "concluir", esquerda: "adiar" });
  for (const lado of [T.direita, T.esquerda]) assert.ok(T.menu.includes(lado) || T.botoes.includes(lado));
  assert.deepEqual(L.acoesDaTarefa({ pode: true, concluida: true }), { botoes: ["concluir"], menu: ["editar", "excluir"], direita: "concluir", esquerda: null });
  assert.deepEqual(L.acoesDaTarefa({ pode: false }), { botoes: [], menu: [], direita: null, esquerda: null });
  assert.ok(T.menu.includes("excluir") && T.direita !== "excluir" && T.esquerda !== "excluir", "excluir só no ⋮: deslizar nunca exclui, só conclui e adia");
  // adiar: amanhã (dia de SP) na mesma hora; sem data = 09:00; já à frente = só +1 dia
  const agora = new Date("2026-10-01T15:00:00Z");                                          // 12:00 em SP
  assert.equal(L.adiarParaAmanha("2026-10-01T12:33:00Z", agora), "2026-10-02T12:33:00.000Z");   // hoje 09:33 → amanhã 09:33
  assert.equal(L.adiarParaAmanha("2026-09-28T17:00:00Z", agora), "2026-10-02T17:00:00.000Z");   // atrasada há dias → amanhã, não «ontem + 1»
  assert.equal(L.adiarParaAmanha(null, agora), "2026-10-02T12:00:00.000Z");                     // sem prazo → amanhã 09:00
  assert.equal(L.adiarParaAmanha("2026-10-02T12:00:00Z", agora), "2026-10-03T12:00:00.000Z");   // já era amanhã → depois de amanhã
  assert.equal(L.adiarParaAmanha("2026-10-05T20:15:00Z", agora), "2026-10-06T20:15:00.000Z");   // dias à frente → +1 dia
  // virada de dia: 23:40 de 30/09 em SP (= 02:40Z de 01/10) — «amanhã» é 01/10, não 02/10
  assert.equal(L.adiarParaAmanha("2026-10-01T02:30:00Z", new Date("2026-10-01T02:40:00Z")), "2026-10-02T02:30:00.000Z");
});

/* DOM falso mínimo: o suficiente para montar a lista de contatos e a linha de tarefa e chamar, como o dedo ou o mouse chamariam, o gesto e o botão */
function criarFalso() {
  const classe = el => [].concat(el.attrs.class || []).filter(Boolean).join(" ");
  const h = (tag, attrs, ...filhos) => {
    const el = { tag, attrs: attrs || {}, filhos: filhos.flat(Infinity).filter(x => x !== null && x !== undefined && x !== false), ouvintes: {},
      checked: !!(attrs && attrs.checked), classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
      addEventListener(t, f) { this.ouvintes[t] = f; }, appendChild(x) { this.filhos.push(x); return x; } };
    if (attrs && attrs.on) for (const [t, f] of Object.entries(attrs.on)) el.ouvintes[t] = f;
    return el;
  };
  const achar = (raiz, pred, todos = false) => {
    const out = [];
    (function ir(x) { if (!x || typeof x !== "object") return; if (x.tag && pred(x)) out.push(x); for (const f of x.filhos || []) ir(f); })(raiz);
    return todos ? out : out[0];
  };
  const dormir = () => new Promise(r => setTimeout(r, 0));
  return { h, achar, classe, dormir };
}

await teste("M28: deslizar e botão chamam a MESMA ação — contatos (Tarefa/Oportunidade) e tarefas (concluir/adiar/excluir)", async () => {
  const { h, achar, classe, dormir } = criarFalso();
  const { listaCompacta } = await import("../web/app/crm-listas.js");
  const { itemTarefa } = await import("../web/app/crm-tarefas.js");
  const chamadas = [], gestos = [], menus = [], desfazeres = [];
  const ui = {
    icone: n => ({ tag: "ic", attrs: { n }, filhos: [] }), avatar: () => h("span"), pilula: t => h("span", { class: "pilula" }, t), etiqueta: e => h("span", { class: "etiq" }, e.nome),
    vazio: o => h("div", { class: "vazio" }, o.titulo), telBR: t => String(t), limpar: el => { el.filhos = []; return el; }, anunciar() {}, toast() {}, horaBR: () => "09:00", dataCurtaBR: () => "02/10", relativo: () => "ontem", hojeSP: () => "2026-10-01",
    deslizar: (el, o) => { gestos.push({ el, o }); return () => {}; },
    menu: (ancora, itens) => { menus.push({ ancora, itens }); return { fechar() {} }; },
    acaoComDesfazer: async o => { desfazeres.push(o); return { estado: "mantida" }; },
  };
  const mods = { tarefas: { formTarefa: async (k_, t, o) => { chamadas.push(["formTarefa", t, o]); return null; } }, negocio: { novoNegocio: async (k_, d) => { chamadas.push(["novoNegocio", d]); } } };
  const mk = (pode = true) => ({
    ui, h, L, ctx: { temModulo: () => true, navegar: h_ => chamadas.push(["navegar", h_]) }, pode: () => pode, etiqueta: () => null, mod: async n => mods[n], toastErro() {}, escrever: async () => ({}),
    v: { contatos: "Pacientes", contato: "Paciente", negocio: "Oportunidade", negocios: "Oportunidades", novo: x => `Nova ${x === "negocio" ? "oportunidade" : x}` },
    api: { rpcC: async (nome, p) => { chamadas.push([nome, p]); return { id: 71, concluida_em: p && p.p_concluida ? "2026-10-01T15:00:00Z" : null }; } },
  });
  const limpa = () => { chamadas.length = 0; gestos.length = 0; menus.length = 0; desfazeres.length = 0; };

  /* ---- contatos ---- */
  const c = { id: 501, nome: "Mariana Costa", telefone: "5512998303030", cidade: "Taubaté", plataforma: "google", etiquetas: [] };
  let k = mk(true);
  const lista = listaCompacta(k, { aoMudar: () => chamadas.push(["aoMudar"]) });
  lista.atualizar([c]);
  const li = achar(lista.el, x => classe(x) === "ct-li");
  assert.ok(li, "uma linha por paciente");
  const tel = achar(li, x => x.tag === "a" && /^tel:/.test(x.attrs.href || ""));
  assert.equal(tel.attrs.href, "tel:+5512998303030"); assert.match(tel.attrs["aria-label"], /Ligar para Mariana Costa/);
  const conv = achar(li, x => x.tag === "a" && /conversas\?contato=501/.test(x.attrs.href || ""));
  assert.ok(conv && /Abrir conversa/.test(conv.attrs["aria-label"]), "Abrir conversa");
  assert.equal(achar(li, x => classe(x) === "ct-abrir").attrs.href, "#/contatos/501", "tocar na linha abre a ficha");
  assert.equal(achar(li, x => classe(x) === "pilula").filhos[0], "Google", "uma pílula só: a origem do anúncio");
  assert.equal(gestos.length, 1, "a linha desliza");
  const g = gestos[0].o;
  assert.equal(typeof g.direita, "function"); assert.equal(typeof g.esquerda, "function");
  achar(li, x => /Mais ações para/.test(x.attrs["aria-label"] || "")).ouvintes.click();
  const itens = menus.at(-1).itens;
  assert.deepEqual(itens.map(i => i.rotulo), ["Abrir ficha", "Nova tarefa", "Nova oportunidade"]);
  // direita = Nova tarefa; esquerda = Nova oportunidade — e o ⋮ faz exatamente o mesmo
  limpa(); await g.direita(); await dormir(); const viaGestoT = JSON.stringify(chamadas);
  limpa(); await itens[1].fn(); await dormir(); const viaMenuT = JSON.stringify(chamadas);
  assert.equal(viaGestoT, viaMenuT, "Tarefa: gesto = ⋮"); assert.equal(viaGestoT, JSON.stringify([["formTarefa", null, { contato_id: 501 }]]));
  limpa(); await g.esquerda(); await dormir(); const viaGestoN = JSON.stringify(chamadas.map(x => x.slice(0, 2)));
  limpa(); await itens[2].fn(); await dormir(); const viaMenuN = JSON.stringify(chamadas.map(x => x.slice(0, 2)));
  assert.equal(viaGestoN, viaMenuN, "Oportunidade: gesto = ⋮"); assert.equal(viaGestoN, JSON.stringify([["novoNegocio", { contato_id: 501 }]]));
  // sem permissão de escrita: sem gesto e só «Abrir ficha»; sem telefone não há Ligar
  limpa(); k = mk(false);
  const l2 = listaCompacta(k, { aoMudar() {} }); l2.atualizar([{ id: 9, nome: "Sem fone", telefone: null }]);
  assert.equal(gestos[0].o.direita, undefined); assert.equal(gestos[0].o.esquerda, undefined);
  const li2 = achar(l2.el, x => classe(x) === "ct-li");
  assert.ok(!achar(li2, x => x.tag === "a" && /^tel:/.test(x.attrs.href || "")), "sem telefone, sem Ligar");
  achar(li2, x => /Mais ações para/.test(x.attrs["aria-label"] || "")).ouvintes.click();
  assert.deepEqual(menus.at(-1).itens.map(i => i.rotulo), ["Abrir ficha"]);
  limpa(); l2.atualizar([]);
  assert.match(String(achar(l2.el, x => classe(x) === "vazio").filhos[0]), /Nada encontrado/, "lista vazia: ui.vazio sem_resultado");

  /* ---- tarefas ---- */
  const t = { id: 71, titulo: "Confirmar avaliação", tipo: "ligacao", vence_em: "2099-01-10T15:00:00Z", concluida_em: null, contato: { id: 501, nome: "Mariana Costa" } };
  limpa(); k = mk(true);
  const eventos = [];
  const li3 = itemTarefa(k, t, { aoMudar: ev => eventos.push(ev), mostrarVinculo: true });
  const mais = achar(li3, x => /Mais ações da tarefa/.test(x.attrs["aria-label"] || ""));
  assert.equal(gestos[0].el.attrs.class[0], "tf", "o que desliza é a linha .tf (a moldura .tf-li fica parada, com o fundo do gesto)");
  mais.ouvintes.click();
  const mi = menus.at(-1).itens;
  assert.deepEqual(mi.map(i => i.rotulo), ["Editar", "Adiar para amanhã", "Excluir"]);
  assert.equal(mi[2].perigo, true);
  // concluir: o círculo e o deslizar para a direita
  limpa(); k.api.rpcC = async (n, p) => { chamadas.push([n, p]); return { ...t, concluida_em: p.p_concluida ? "2026-10-01T15:00:00Z" : null }; };
  const liA = itemTarefa(k, t, { aoMudar() {} }); const ckA = achar(liA, x => x.tag === "input");
  ckA.checked = true; await ckA.ouvintes.change(); await dormir();
  const viaCirculo = JSON.stringify(chamadas); const desfCirculo = desfazeres.length;
  limpa(); k.api.rpcC = async (n, p) => { chamadas.push([n, p]); return { ...t, concluida_em: p.p_concluida ? "2026-10-01T15:00:00Z" : null }; };
  const liB = itemTarefa(k, t, { aoMudar() {} }); const swB = gestos[0].o;
  await swB.direita(); await dormir();
  assert.equal(JSON.stringify(chamadas), viaCirculo, "concluir: gesto = círculo"); assert.equal(viaCirculo, JSON.stringify([["nx_tarefa_concluir", { p_id: 71, p_concluida: true }]]));
  assert.equal(desfazeres.length, desfCirculo, "e os dois oferecem o Desfazer");
  await desfazeres[0].reverter(); assert.deepEqual(chamadas.at(-1), ["nx_tarefa_concluir", { p_id: 71, p_concluida: false }], "Desfazer reabre");
  // adiar: ⋮ e deslizar para a esquerda gravam o mesmo vencimento; Desfazer devolve o de antes
  limpa(); k.api.rpcC = async (n, p) => { chamadas.push([n, p]); return { ...t, vence_em: p.p_tarefa.vence_em }; };
  const liC = itemTarefa(k, t, { aoMudar: ev => eventos.push(ev) });
  achar(liC, x => /Mais ações da tarefa/.test(x.attrs["aria-label"] || "")).ouvintes.click();
  await menus.at(-1).itens[1].fn(); await dormir(); const viaMenuAdiar = JSON.stringify(chamadas); const txtMenu = desfazeres.at(-1).texto;
  limpa(); k.api.rpcC = async (n, p) => { chamadas.push([n, p]); return { ...t, vence_em: p.p_tarefa.vence_em }; };
  itemTarefa(k, t, { aoMudar() {} }); await gestos[0].o.esquerda(); await dormir();
  assert.equal(JSON.stringify(chamadas), viaMenuAdiar, "adiar: gesto = ⋮");
  assert.equal(viaMenuAdiar, JSON.stringify([["nx_tarefa_salvar", { p_tarefa: { id: 71, vence_em: "2099-01-11T15:00:00.000Z" } }]]));
  assert.match(txtMenu, /adiada para 02\/10/);
  await desfazeres.at(-1).reverter(); assert.deepEqual(chamadas.at(-1), ["nx_tarefa_salvar", { p_tarefa: { id: 71, vence_em: "2099-01-10T15:00:00Z" } }], "Desfazer devolve o vencimento anterior");
  // excluir: a lixeira (desktop) e o ⋮ (celular) — a mesma ação com Desfazer; deslizar NÃO exclui
  limpa(); const ev3 = []; k.api.rpcC = async (n, p) => { chamadas.push([n, p]); return {}; };
  const liD = itemTarefa(k, t, { aoMudar: e => ev3.push(e) });
  achar(liD, x => /Excluir a tarefa/.test(x.attrs["aria-label"] || "")).ouvintes.click();
  const viaLixeira = desfazeres.at(-1); limpa();
  achar(liD, x => /Mais ações da tarefa/.test(x.attrs["aria-label"] || "")).ouvintes.click();
  await menus.at(-1).itens[2].fn(); const viaMais = desfazeres.at(-1);
  assert.equal(viaLixeira.texto, viaMais.texto); assert.match(viaMais.texto, /excluída/);
  viaMais.aplicar(); assert.equal(ev3.at(-1).tipo, "excluida");
  await viaMais.firmar(); assert.deepEqual(chamadas.at(-1), ["nx_tarefa_excluir", { p_id: 71 }], "a exclusão de verdade só no firmar");
  viaMais.reverter(); assert.equal(ev3.at(-1).tipo, "salva", "Desfazer devolve a tarefa");
  // concluída: reabre ao deslizar para a direita; não adia
  limpa(); itemTarefa(k, { ...t, concluida_em: "2026-10-01T10:00:00Z" }, { aoMudar() {} });
  assert.equal(typeof gestos[0].o.direita, "function"); assert.equal(gestos[0].o.esquerda, undefined);
  // sem permissão: nada desliza, sem ⋮
  limpa(); const semPode = mk(false); const liE = itemTarefa(semPode, t, { aoMudar() {} });
  assert.equal(gestos.length, 0, "sem permissão não há gesto"); assert.ok(!achar(liE, x => /Mais ações da tarefa/.test(x.attrs["aria-label"] || "")));
});

await teste("M28 (estático): lista compacta só no celular, Exportar/Importar no ⋮, «Novo» flutuante, busca fixa, ⋮ e deslizar nas tarefas", () => {
  const js = ler("crm-listas.js"), tj = ler("crm-tarefas.js"), css = ler("crm.css");
  // contatos
  assert.ok(/L\.acoesDoContato\(/.test(js) && /ui\.deslizar\(frente,\s*\{\s*direita:\s*A\.direita \? \(\) => executar\(A\.direita, c\)/.test(js) && /fn:\s*\(\) => executar\(id, c\)/.test(js), "gesto e ⋮ chamam executar()");
  assert.ok(js.includes("href: L.hrefTel(c.telefone)"), "Ligar usa tel:");
  assert.ok(/class:\s*"bt-icone crm-cab-mais"/.test(js) && /Exportar planilha/.test(js) && /Importar planilha/.test(js), "Exportar/Importar no ⋮ do cabeçalho");
  assert.ok(/class:\s*"crm-fab"/.test(js) && /class:\s*"pilha-p crm-fixa"/.test(js), "«Novo» flutuante e busca fixa");
  assert.ok(/listaM\.atualizar\(r\.itens\)/.test(js) && /tab\.atualizar\(r\.itens\)/.test(js), "a tabela continua (desktop) e a lista compacta é desenhada junto");
  assert.ok(!/innerHTML/.test(js), "sem innerHTML");
  // tarefas
  assert.ok(/L\.acoesDaTarefa\(/.test(tj) && /ui\.deslizar\(el,\s*\{\s*direita:\s*A\.direita \? \(\) => executar\(A\.direita\)/.test(tj), "o deslizar da tarefa usa executar()");
  assert.ok(/check\.addEventListener\("change",\s*\(\) => alternar\(check\.checked\)\)/.test(tj) && /return alternar\(!check\.checked\)/.test(tj), "círculo e gesto chamam alternar()");
  assert.ok(/ui\.menu\(mais,\s*A\.menu\.map\(id => \(\{[^}]*fn:\s*\(\) => executar\(id\)/.test(tj), "o ⋮ chama executar()");
  assert.ok(/ocultas\.add\(t\.id\)/.test(tj) && /carregar\(true\)/.test(tj), "recarga quieta e exclusão pendente não volta na recarga");
  // CSS
  assert.ok(/\.ct-lista-env,\s*\.crm-cab-mais,\s*\.tf-mais\s*\{\s*display:\s*none;\s*\}/.test(css), "a lista compacta, o ⋮ do cabeçalho e o ⋮ da tarefa começam escondidos (desktop)");
  const m760 = css.slice(css.indexOf("/* M28: Pacientes e Tarefas"));
  assert.ok(/\.crm\[data-tela="contatos"\] \.tabela-env\s*\{\s*display:\s*none;\s*\}/.test(m760) && /\.ct-lista-env\s*\{\s*display:\s*block;\s*\}/.test(m760), "≤ 760 px: tabela some, lista compacta aparece");
  assert.ok(/\.crm\[data-tela="contatos"\] \.crm-fixa\s*\{[^}]*position:\s*sticky;[^}]*top:\s*var\(--topo\)/.test(m760), "busca fixa ao rolar");
  assert.ok(/\.tf-acoes \.bt-icone:not\(\.tf-mais\)\s*\{\s*display:\s*none;/.test(m760) && /\.tf-acoes \.tf-mais\s*\{\s*display:\s*inline-grid;/.test(m760), "lápis e lixeira viram um ⋮ no celular");
  assert.ok(/\.ct-linha\s*\{[^}]*min-height:\s*68px/.test(css) && /\.ct-bt\s*\{\s*width:\s*44px;\s*height:\s*44px;/.test(css), "linha de ~72 px com alvos de 44 px");
  assert.ok(/\.ct-fundo, \.tf-fundo\s*\{[^}]*width:\s*50%/.test(css) && /\.ct-fundo-d, \.tf-fundo-d \{ left: 0; \}/.test(css), "cada fundo do gesto ocupa só a sua metade (um não cobre o outro)");
  assert.ok(!/(^|\n)\s*\.ct-[a-z-]+[^{]*\{[^}]*font-size:\s*(?:1[01]|[0-9])px/.test(css), "nada abaixo de 12 px na lista compacta");
});

console.log(`\n${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
