/* Testes da lógica das automações (F7). Rodar: node --test testes/automacoes.teste.mjs
   Sem dependências: importa web/app/auto-logica.js direto do disco (arquivo puro). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import * as L from "../web/app/auto-logica.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lerApp = f => readFileSync(resolve(RAIZ, "web/app", f), "utf8");

/* ------------------------------------------------------------------ dados de apoio */
const U = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BASE = {
  funis: [
    { id: U(1), nome: "Pacientes", padrao: true, estagios: [
      { id: U(11), nome: "Nova conversa", marco: "nova", tipo: "aberto" },
      { id: U(12), nome: "Avaliação agendada", marco: "agendada", tipo: "aberto" },
      { id: U(13), nome: "Avaliou / orçamento", marco: "orcamento", tipo: "aberto" },
      { id: U(14), nome: "Fechou tratamento", marco: "fechou", tipo: "ganho" },
    ] },
    { id: U(2), nome: "Pós-tratamento", padrao: false, estagios: [{ id: U(21), nome: "Em tratamento", marco: null, tipo: "aberto" }] },
  ],
  etiquetas: [{ id: U(31), nome: "Orçamento", cor: "#E5B35C" }, { id: U(32), nome: "Implante", cor: "#6FA3CF" }],
  usuarios: [{ id: U(41), nome: "Ana Lima", papel: "atendente" }],
  departamentos: [{ id: U(51), nome: "Recepção" }],
  canais: [{ id: U(61), nome: "WhatsApp principal", numero_exibicao: "+55 12 99830-3030" }],
  templates: [
    { id: U(71), canal_id: U(61), nome: "confirmacao_consulta", idioma: "pt_BR", categoria: "UTILITY", status: "APPROVED", corpo: "Olá, {{1}}! Confirmando sua consulta em {{2}} às {{3}}.", num_parametros: 3 },
    { id: U(72), canal_id: U(61), nome: "promo_clareamento", idioma: "pt_BR", categoria: "MARKETING", status: "PENDING", corpo: "Oi {{1}}", num_parametros: 1 },
  ],
  campos: [{ chave: "convenio", rotulo: "Convênio", tipo: "texto" }],
};
const VOCAB_ODONTO = { contato: "Paciente", negocio: "Oportunidade", g_negocio: "a", ganhar: "Fechou", perder: "Não fechou", vertical: "odonto" };
const VOCAB_OFICINA = { contato: "Cliente", negocio: "Orçamento", g_negocio: "o", ganhar: "Aprovado", perder: "Recusado", vertical: "oficina" };

const valida = (a, o) => L.validar(a, o);
const tarefa = (x = {}) => Object.assign({ tipo: "criar_tarefa", titulo: "Ligar", dono: "responsavel" }, x);
const auto = (x = {}) => Object.assign({ nome: "Teste", gatilho: "tarefa_vencida", config: {}, condicoes: [], acoes: [tarefa()] }, x);

/* ------------------------------------------------------------------ validar */

test("validar: automação mínima válida", () => {
  assert.deepEqual(valida(auto()), { ok: true });
});

test("validar: nome obrigatório e até 80 caracteres", () => {
  assert.equal(valida(auto({ nome: "  " })).motivo, "dê um nome à automação");
  assert.equal(valida(auto({ nome: "x".repeat(81) })).motivo, "o nome pode ter até 80 caracteres");
  assert.equal(valida(auto({ nome: "x".repeat(80) })).ok, true);
});

test("validar: gatilho desconhecido", () => {
  const r = valida(auto({ gatilho: "aniversario" }));
  assert.equal(r.ok, false);
  assert.equal(r.onde, "quando");
  assert.equal(r.motivo, "escolha o gatilho em «Quando»");
});

test("validar: gatilho sem config obrigatória", () => {
  assert.equal(valida(auto({ gatilho: "negocio_estagio", config: {} })).motivo, "escolha a etapa em «Quando»");
  assert.equal(valida(auto({ gatilho: "tempo_no_estagio", config: { horas: 4 } })).motivo, "escolha a etapa em «Quando»");
  assert.equal(valida(auto({ gatilho: "tempo_no_estagio", config: { estagio_id: U(13) } })).motivo, "o tempo na etapa vai de 1 a 2160 horas");
  assert.equal(valida(auto({ gatilho: "etiqueta_adicionada", config: {} })).motivo, "escolha a etiqueta em «Quando»");
  assert.equal(valida(auto({ gatilho: "sem_resposta", config: {} })).motivo, "o tempo sem resposta vai de 5 a 1440 minutos");
  assert.equal(valida(auto({ gatilho: "sem_resposta", config: { minutos: 4 } })).ok, false);
  assert.equal(valida(auto({ gatilho: "sem_resposta", config: { minutos: 1441 } })).ok, false);
  assert.equal(valida(auto({ gatilho: "sem_resposta", config: { minutos: "15" } })).ok, true);
  assert.equal(valida(auto({ gatilho: "antes_da_data", config: { horas: 24 } })).motivo, "escolha a data em «Quando»");
  assert.equal(valida(auto({ gatilho: "negocio_estagio", config: { estagio_id: "abc" } })).motivo, "a etapa escolhida em «Quando» não existe mais");
});

test("validar: antes_da_data com horas fora de 1..72", () => {
  const a = h => auto({ gatilho: "antes_da_data", config: { campo: "consulta", horas: h } });
  for (const h of [0, 73, -1, 1.5, "abc", null, undefined]) {
    const r = valida(a(h));
    assert.equal(r.ok, false, `horas ${h}`);
    assert.equal(r.motivo, "a antecedência vai de 1 a 72 horas");
  }
  for (const h of [1, 24, 72, "48"]) assert.equal(valida(a(h)).ok, true, `horas ${h}`);
  assert.equal(valida(auto({ gatilho: "antes_da_data", config: { campo: "previsao_fechamento", horas: 72 } })).ok, true);
});

test("validar: mais de 10 ações e nenhuma ação", () => {
  const r = valida(auto({ acoes: Array.from({ length: 11 }, () => tarefa()) }));
  assert.equal(r.ok, false);
  assert.equal(r.onde, "entao");
  assert.equal(r.motivo, "use até 10 ações");
  assert.equal(valida(auto({ acoes: Array.from({ length: 10 }, () => tarefa()) })).ok, true);
  assert.equal(valida(auto({ acoes: [] })).motivo, "acrescente pelo menos uma ação em «Então»");
});

test("validar: ação desconhecida (com o número da ação)", () => {
  const r = valida(auto({ acoes: [tarefa(), { tipo: "chamar_http", url: "x" }] }));
  assert.equal(r.ok, false);
  assert.equal(r.indice, 1);
  assert.equal(r.motivo, "ação 2: tipo de ação desconhecido");
  assert.equal(valida(auto({ acoes: [null] })).motivo, "ação 1: tipo de ação desconhecido");
});

test("validar: campos obrigatórios de cada ação", () => {
  const m = ac => valida(auto({ acoes: [ac] })).motivo;
  assert.equal(m({ tipo: "mover_estagio" }), "ação 1: escolha a etapa");
  assert.equal(m(tarefa({ titulo: "" })), "ação 1: escreva o título da tarefa");
  assert.equal(m(tarefa({ titulo: "x".repeat(161) })), "ação 1: o título pode ter até 160 caracteres");
  assert.equal(m(tarefa({ vence_em_horas: 2161 })), "ação 1: o prazo vai de 0 a 2160 horas");
  assert.equal(m(tarefa({ dono: "chefe" })), "ação 1: escolha para quem é a tarefa");
  assert.equal(m(tarefa({ tipo_tarefa: "fax" })), "ação 1: tipo de tarefa inválido");
  assert.equal(m({ tipo: "enviar_mensagem", texto: " " }), "ação 1: escreva a mensagem");
  assert.equal(m({ tipo: "enviar_mensagem", texto: "x".repeat(4097) }), "ação 1: a mensagem pode ter até 4096 caracteres");
  assert.equal(m({ tipo: "atribuir" }), "ação 1: escolha como atribuir");
  assert.equal(m({ tipo: "atribuir", modo: "conta" }), "ação 1: escolha a pessoa");
  assert.equal(m({ tipo: "etiquetar", alvo: "contato" }), "ação 1: escolha a etiqueta");
  assert.equal(m({ tipo: "etiquetar", etiqueta_id: U(31), alvo: "negocio" }), "ação 1: escolha onde pôr a etiqueta");
  assert.equal(m({ tipo: "notificar", para: "todos", titulo: "x" }), "ação 1: escolha quem recebe o aviso");
  assert.equal(m({ tipo: "notificar", para: "admins", titulo: "" }), "ação 1: escreva o título do aviso");
  assert.equal(m({ tipo: "alerta_whatsapp", texto: "x".repeat(1001) }), "ação 1: escreva o alerta (até 1000 caracteres)");
  assert.equal(m({ tipo: "resolver_conversa" }), undefined);
  assert.equal(m({ tipo: "etiquetar", etiqueta_nome: "Orçamento", alvo: "contato" }), undefined, "etiqueta por nome (criada no servidor)");
});

test("validar: modelo de mensagem só é exigido para LIGAR; parâmetros conferidos com a base", () => {
  const lemb = (x = {}, ativo = false) => ({ nome: "Lembrete", ativo, gatilho: "antes_da_data", config: { campo: "consulta", horas: 24 },
    acoes: [Object.assign({ tipo: "enviar_template", parametros: ["{primeiro_nome}", "{data_consulta}", "{hora_consulta}"] }, x)] });
  assert.equal(valida(lemb()).ok, true, "desligada sem modelo = rascunho aceito");
  assert.equal(valida(lemb({}, true)).motivo, "ação 1: escolha o modelo aprovado");
  assert.equal(valida(lemb({ template_id: U(71) }, true), { base: BASE }).ok, true);
  assert.equal(valida(lemb({ template_id: U(71), parametros: ["{nome}"] }, true), { base: BASE }).motivo, "ação 1: o modelo pede 3 parâmetros");
  assert.equal(valida(lemb({ template_id: U(71), parametros: ["a", "", "c"] }, true), { base: BASE }).motivo, "ação 1: preencha todos os parâmetros");
  assert.equal(valida(lemb({ template_id: U(72), parametros: ["a"] }, true), { base: BASE }).motivo, "ação 1: o modelo ainda não foi aprovado pela Meta");
  assert.equal(valida(lemb({ template_id: U(99) }, true), { base: BASE }).motivo, "ação 1: o modelo escolhido não existe mais");
});

test("validar: condições (campo, comparação, valor, até 10)", () => {
  const c = cd => valida(auto({ condicoes: [cd] }));
  assert.equal(c({ campo: "origem", op: "igual", valor: "anuncio" }).ok, true);
  assert.equal(c({ campo: "cor", op: "igual", valor: "x" }).motivo, "condição 1: escolha o campo");
  assert.equal(c({ campo: "origem", op: "parecido", valor: "x" }).motivo, "condição 1: escolha a comparação");
  assert.equal(c({ campo: "origem", op: "igual" }).motivo, "condição 1: preencha o valor");
  assert.equal(c({ campo: "origem", op: "igual", valor: "tv" }).motivo, "condição 1: escolha a origem");
  assert.equal(c({ campo: "texto", op: "maior", valor: "x" }).motivo, "condição 1: «maior» e «menor» valem só para valor e campos");
  assert.equal(c({ campo: "valor", op: "maior", valor: "abc" }).motivo, "condição 1: o valor precisa ser um número");
  assert.equal(c({ campo: "valor", op: "maior", valor: "1500,50" }).ok, true);
  assert.equal(c({ campo: "etiqueta", op: "vazio" }).ok, true);
  assert.equal(c({ campo: "contato.convenio", op: "contem", valor: "uni" }).ok, true);
  assert.equal(c({ campo: "contato.Convênio", op: "contem", valor: "uni" }).motivo, "condição 1: escolha o campo");
  assert.equal(c({ campo: "estagio_id", op: "igual", valor: U(99) }).ok, true, "sem base não confere existência");
  assert.equal(valida(auto({ condicoes: [{ campo: "estagio_id", op: "igual", valor: U(99) }] }), { base: BASE }).motivo, "condição 1: o item escolhido não existe mais");
  const onze = Array.from({ length: 11 }, () => ({ campo: "texto", op: "contem", valor: "a" }));
  assert.equal(valida(auto({ condicoes: onze })).motivo, "use até 10 condições");
});

test("validar: palavras da mensagem recebida", () => {
  const a = p => valida(auto({ gatilho: "mensagem_recebida", config: { palavras: p } }));
  assert.equal(a(["preço"]).ok, true);
  assert.equal(a([]).ok, true);
  assert.equal(a(Array.from({ length: 21 }, (_, i) => `p${i}`)).motivo, "use até 20 palavras");
  assert.equal(a(["x".repeat(61)]).motivo, "cada palavra pode ter até 60 caracteres");
});

/* ------------------------------------------------------------------ descrever */

test("descrever: as 5 automações-modelo", () => {
  const f = id => L.descrever(L.aplicarModelo(id, BASE, VOCAB_ODONTO), BASE, VOCAB_ODONTO);
  const lembrete = f("lembrete_consulta");
  assert.ok(lembrete.includes("24 h antes da consulta, enviar o modelo «confirmacao_consulta»"), lembrete);
  assert.equal(lembrete, "24 h antes da consulta, enviar o modelo «confirmacao_consulta».");
  assert.equal(f("sem_resposta"), "Quando uma conversa ficar sem resposta há 15 min (contando só no horário de atendimento), avisar o responsável.");
  assert.equal(f("orcamento"), "Quando a oportunidade entrar em «Avaliou / orçamento», criar tarefa «Enviar orçamento para {primeiro_nome}» para o responsável em 24 h.");
  assert.equal(f("pos_venda"), "Quando a oportunidade for marcada como «Fechou», criar tarefa «Pós-venda: falar com {primeiro_nome}» para o responsável em 7 dias.");
  assert.equal(f("preco"), "Quando chegar mensagem com «preço», «valor» ou «quanto custa», pôr a etiqueta «Orçamento» no paciente.");
  // sem vocabulário (genérico) fala em contato; etiqueta na conversa
  assert.equal(L.descrever({ gatilho: "tarefa_vencida", acoes: [{ tipo: "etiquetar", etiqueta_nome: "X", alvo: "contato" },
    { tipo: "etiquetar", etiqueta_nome: "Y", alvo: "conversa", remover: true }] }),
  "Quando uma tarefa vencer sem ser concluída, pôr a etiqueta «X» no contato e tirar a etiqueta «Y» da conversa.");
});

test("descrever: lembrete sem modelo escolhido usa o nome sugerido; oficina fala em visita", () => {
  const semBase = L.aplicarModelo("lembrete_consulta", {}, VOCAB_OFICINA);
  assert.equal(L.descrever(semBase, {}, VOCAB_OFICINA), "24 h antes da visita, enviar o modelo «confirmacao_consulta».");
  assert.equal(semBase.nome, "Lembrete 24 h antes da visita");
});

test("descrever: vocabulário masculino, condições, horário e ações em lista", () => {
  const a = {
    gatilho: "negocio_criado", config: { funil_id: U(1) }, respeitar_horario: true,
    condicoes: [{ campo: "origem", op: "igual", valor: "anuncio" }, { campo: "valor", op: "maior", valor: 1500 }, { campo: "etiqueta", op: "igual", valor: U(32) }],
    acoes: [{ tipo: "enviar_mensagem", texto: "Oi {primeiro_nome}!" }, { tipo: "atribuir", modo: "rodizio" }, { tipo: "notificar", para: U(41), titulo: "x" }],
  };
  assert.equal(L.descrever(a, BASE, VOCAB_OFICINA),
    "Quando um orçamento for criado no funil «Pacientes», se a origem for «Anúncio», o valor for maior que «R$ 1.500,00» e tiver a etiqueta «Implante», " +
    "enviar a mensagem «Oi {primeiro_nome}!», distribuir no rodízio e avisar «Ana Lima» (mensagens só no horário de atendimento).");
});

test("descrever: todos os gatilhos geram frase sem 'undefined'", () => {
  for (const g of L.GATILHOS) {
    const a = L.novaAutomacao(g.id);
    a.acoes = [L.novaAcao("resolver_conversa")];
    const f = L.descrever(a, BASE, VOCAB_ODONTO);
    assert.ok(!/undefined|null|NaN/.test(f), `${g.id}: ${f}`);
    assert.ok(f.endsWith("resolver a conversa."), f);
  }
  for (const ac of L.ACOES) {
    const f = L.descrever({ gatilho: "tarefa_vencida", config: {}, acoes: [L.novaAcao(ac.id)] }, BASE, VOCAB_ODONTO);
    assert.ok(!/undefined|null|NaN/.test(f), `${ac.id}: ${f}`);
  }
});

/* ------------------------------------------------------------------ modelos, limpar e variáveis */

test("aplicarModelo: resolve etapa pelo marco, etiqueta e modelo da WABA pelo nome; nasce desligada", () => {
  const o = L.aplicarModelo("orcamento", BASE);
  assert.equal(o.config.estagio_id, U(13));
  assert.equal(o.config.estagio_marco, undefined);
  assert.equal(o.ativo, false);
  const p = L.aplicarModelo("preco", BASE);
  assert.equal(p.acoes[0].etiqueta_id, U(31));
  assert.equal(p.acoes[0].etiqueta_nome, undefined);
  const semEtq = L.aplicarModelo("preco", { etiquetas: [] });
  assert.equal(semEtq.acoes[0].etiqueta_nome, "Orçamento", "sem a etiqueta, vai o nome (o servidor cria)");
  const l = L.aplicarModelo("lembrete_consulta", BASE);
  assert.equal(l.acoes[0].template_id, U(71));
  assert.deepEqual(l.acoes[0].parametros, ["{primeiro_nome}", "{data_consulta}", "{hora_consulta}"]);
  assert.equal(L.validar(Object.assign({}, l, { ativo: true }), { base: BASE }).ok, true, "lembrete pronto para ligar");
  for (const m of L.MODELOS) assert.equal(L.validar(L.aplicarModelo(m.id, BASE), { base: BASE }).ok, true, m.id);
  // o original não é alterado
  assert.equal(L.MODELOS.find(m => m.id === "orcamento").auto.config.estagio_marco, "orcamento");
});

test("modelosDaVertical: lembrete em destaque para odonto/oficina, pós-venda para loja", () => {
  assert.equal(L.modelosDaVertical("odonto")[0].id, "lembrete_consulta");
  assert.equal(L.modelosDaVertical("oficina")[0].id, "lembrete_consulta");
  assert.equal(L.modelosDaVertical("loja")[0].id, "pos_venda");
  assert.equal(L.modelosDaVertical("generico").length, 5);
});

test("limpar: só chaves conhecidas, números como número, sem opcionais vazios", () => {
  const x = L.limpar({
    id: U(90), nome: "  Teste  ", gatilho: "sem_resposta", config: { minutos: "30", departamento_id: "", lixo: 1 },
    condicoes: [{ campo: "valor", op: "maior", valor: "1500,5", x: 1 }, { campo: "etiqueta", op: "vazio", valor: "sobra" }],
    acoes: [{ tipo: "criar_tarefa", titulo: " Ligar ", vence_em_horas: "12", dono: "responsavel", extra: "x" },
            { tipo: "atribuir", modo: "rodizio", conta_id: U(41) },
            { tipo: "etiquetar", etiqueta_nome: "Nova", alvo: "contato", remover: false }],
    ativo: 1,
  });
  assert.deepEqual(x, {
    id: U(90), nome: "Teste", gatilho: "sem_resposta", config: { minutos: 30, so_no_horario: true },
    condicoes: [{ campo: "valor", op: "maior", valor: 1500.5 }, { campo: "etiqueta", op: "vazio" }],
    acoes: [{ tipo: "criar_tarefa", titulo: "Ligar", vence_em_horas: 12, dono: "responsavel" },
            { tipo: "atribuir", modo: "rodizio" },
            { tipo: "etiquetar", alvo: "contato", etiqueta_nome: "Nova" }],
    respeitar_horario: false, ativo: true,
  });
  const p = L.limpar({ nome: "a", gatilho: "mensagem_recebida", config: { palavras: "preço, valor ,, quanto custa" }, acoes: [] });
  assert.deepEqual(p.config.palavras, ["preço", "valor", "quanto custa"]);
});

test("aplicarVariaveis: nomes, valor em reais e data/hora no fuso de São Paulo", () => {
  const d = { nome: "Maria  Souza", empresa: "Kamiguchi Odontologia", protocolo: "2026-000123", etapa: "Avaliou", valor: 1234.5,
    atendente: "Ana", consulta_em: "2026-09-29T17:30:00Z" };
  assert.equal(L.aplicarVariaveis("Olá, {primeiro_nome}! {nome} · {empresa} · {protocolo} · {etapa} · {valor} · {atendente}", d),
    "Olá, Maria! Maria  Souza · Kamiguchi Odontologia · 2026-000123 · Avaliou · R$ 1.234,50 · Ana");
  assert.equal(L.aplicarVariaveis("{data_consulta} às {hora_consulta}", d), "29/09 às 14:30");
  assert.equal(L.aplicarVariaveis("{desconhecida} {hora_consulta}", {}), "{desconhecida} ");
  assert.deepEqual(L.variaveisDesconhecidas("{nome} {cpf} {cpf} {valor}"), ["cpf"]);
});

test("formatação de tempo e dinheiro", () => {
  assert.equal(L.formatarHoras(24), "24 h");
  assert.equal(L.formatarHoras(168), "7 dias");
  assert.equal(L.formatarHoras(48), "2 dias");
  assert.equal(L.formatarHoras(36), "36 h");
  assert.equal(L.formatarHoras(0), "na hora");
  assert.equal(L.formatarMinutos(15), "15 min");
  assert.equal(L.formatarMinutos(120), "2 h");
  assert.equal(L.brl(1500), "R$ 1.500,00");
  assert.equal(L.brl(1234567.891), "R$ 1.234.567,89");
});

test("utilidades do editor: mover, trocarGatilho, novaAcao, operadores", () => {
  assert.deepEqual(L.mover([1, 2, 3], 0, 2), [2, 3, 1]);
  assert.deepEqual(L.mover([1, 2, 3], 2, 0), [3, 1, 2]);
  assert.deepEqual(L.mover([1, 2, 3], 5, 0), [1, 2, 3]);
  const t = L.trocarGatilho({ gatilho: "negocio_estagio", config: { estagio_id: U(13) } }, "tempo_no_estagio");
  assert.deepEqual(t.config, { estagio_id: U(13), horas: 48 });
  assert.deepEqual(L.novaAcao("criar_tarefa"), { tipo: "criar_tarefa", tipo_tarefa: "tarefa", vence_em_horas: 24, dono: "responsavel" });
  assert.deepEqual(L.novaAcao("enviar_template"), { tipo: "enviar_template", parametros: [] });
  assert.ok(L.operadoresDe("valor").includes("maior"));
  assert.ok(!L.operadoresDe("texto").includes("maior"));
  assert.ok(L.operadoresDe("contato.convenio").includes("contem"));
  assert.equal(L.resumoExecucoes({ execucoes: 12, erros: 1 }), "12 execuções · 1 erro");
  assert.equal(L.resumoExecucoes({ execucoes: 1, erros: 0 }), "1 execução");
  assert.equal(L.faltaModelo(L.aplicarModelo("lembrete_consulta", {})), true);
  assert.equal(L.enviaMensagem(L.aplicarModelo("lembrete_consulta", {})), true);
});

test("vocab da F3 (se existir) funciona com descrever", async () => {
  let V;
  try { V = await import("../web/app/vocab.js"); } catch { return; }
  const f = L.descrever(L.aplicarModelo("pos_venda", BASE, V.vocab("loja")), BASE, V.vocab("loja"));
  assert.equal(f, "Quando a venda for marcada como «Vendido», criar tarefa «Pós-venda: falar com {primeiro_nome}» para o responsável em 7 dias.");
  const g = L.descrever({ gatilho: "negocio_estagio", config: { estagio_id: U(13) }, acoes: [{ tipo: "criar_negocio" }] }, BASE, V.vocab("oficina"));
  assert.equal(g, "Quando o orçamento entrar em «Avaliou / orçamento», criar um orçamento.");
});

test("modelos prontos: títulos com concordância e etapa certa em cada vertical (revisão)", async () => {
  let V;
  try { V = await import("../web/app/vocab.js"); } catch { return; }
  const tit = (id, vert) => L.tituloModelo(L.MODELOS.find(m => m.id === id), V.vocab(vert));
  assert.equal(tit("pos_venda", "loja"), "Venda marcada como «Vendido» → tarefa de pós-venda em 7 dias", "nada de 'Venda vendido'");
  assert.equal(tit("pos_venda", "odonto"), "Oportunidade marcada como «Fechou» → tarefa de pós-venda em 7 dias");
  assert.equal(tit("pos_venda", "oficina"), "Orçamento marcado como «Aprovado» → tarefa de pós-venda em 7 dias");
  assert.equal(tit("orcamento", "odonto"), "Entrou em Avaliou → tarefa de orçamento em 24 h");
  assert.equal(tit("orcamento", "oficina"), "Orçamento enviado → cobrar resposta em 24 h");
  assert.equal(tit("orcamento", "loja"), "Proposta enviada → cobrar resposta em 24 h");
  for (const vert of V.VERTICAIS) for (const m of L.MODELOS) {
    const t = L.tituloModelo(m, V.vocab(vert)) + " " + L.textoModelo(m, V.vocab(vert));
    assert.ok(!/undefined|null|Venda vendid/.test(t), `${vert}/${m.id}: ${t}`);
    if (vert !== "odonto") assert.ok(!/Avaliou/.test(t), `etapa da clínica fora da clínica: ${vert}/${m.id}: ${t}`);
  }
  // a tarefa acompanha o sentido da etapa: na oficina o orçamento já foi enviado → cobrar resposta
  const of = L.aplicarModelo("orcamento", BASE, V.vocab("oficina"));
  assert.equal(of.acoes[0].titulo, "Cobrar resposta do orçamento: {primeiro_nome}");
  assert.equal(of.nome, "Cobrar orçamento em 24 h");
  assert.equal(L.aplicarModelo("orcamento", BASE, V.vocab("odonto")).acoes[0].titulo, "Enviar orçamento para {primeiro_nome}");
  assert.equal(L.validar(of, { base: BASE }).ok, true);
});

/* ------------------------------------------------------------------ regras estáticas dos arquivos da F7 */

test("arquivos da F7: sem import estático, sem innerHTML, sem hex fora de :root, [hidden] e minmax", () => {
  const logica = lerApp("auto-logica.js");
  assert.ok(!/^\s*import\s[^(]/m.test(logica), "auto-logica.js não tem import");
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(logica), "auto-logica.js sem hex de cor");
  let tela = null, css = null;
  try { tela = lerApp("automacoes.js"); } catch { /* ainda não existe */ }
  try { css = lerApp("automacoes.css"); } catch { /* ainda não existe */ }
  if (tela) {
    assert.ok(!/^\s*import\s[^(]/m.test(tela), "automacoes.js sem import estático");
    assert.ok(!/innerHTML/.test(tela), "automacoes.js sem innerHTML");
    assert.ok(!/#[0-9a-fA-F]{6}\b/.test(tela), "automacoes.js sem hex de cor");
    for (const m of tela.matchAll(/import\(\s*(`[^`]*`|"[^"]*"|'[^']*')/g)) assert.ok(/\?v=/.test(m[1]), `import com ?v=: ${m[1]}`);
    assert.ok(/export async function montar\(/.test(tela), "exporta montar(ctx)");
  }
  if (css) {
    const semRoot = css.replace(/:root[^{]*\{[^}]*\}/g, "");
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(semRoot), "automacoes.css sem hex fora de :root");
    assert.ok(!/(^|[^(,\s])\s*\b1fr\b/.test(css.replace(/minmax\(0,\s*1fr\)/g, "")), "sem 1fr solto");
    assert.ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css), "[hidden] forte");
  }
});
