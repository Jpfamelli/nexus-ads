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

console.log(`\n${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
