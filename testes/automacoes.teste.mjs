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
      { id: U(15), nome: "Faltou", marco: "faltou", tipo: "aberto" },
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

test("modelosDaVertical: lembrete em destaque para odonto/oficina, acompanhamento e pós-venda para loja", () => {
  assert.equal(L.modelosDaVertical("odonto")[0].id, "lembrete_consulta_texto");
  assert.equal(L.modelosDaVertical("oficina")[0].id, "lembrete_consulta_texto");
  assert.deepEqual(L.modelosDaVertical("loja").slice(0, 3).map(m => m.id), ["followup_orcamento", "lead_anuncio", "pos_venda"]);
  assert.equal(L.modelosDaVertical("generico").length, L.MODELOS.length);
  assert.equal(L.modelosDaVertical("loja").length, L.MODELOS.length - 1, "«faltou» não existe na loja");
  assert.ok(!L.modelosDaVertical("loja").some(m => m.id === "faltou_remarcar"));
});

test("modelos de texto do CodeWords: lembrete 24 h e confirmação ao agendar — desligados, texto livre, sem modelo da Meta nem janela", () => {
  const v = L.modelosDaVertical("odonto").map(m => m.id);
  assert.deepEqual(v.slice(0, 3), ["lembrete_consulta_texto", "confirmacao_agendamento", "followup_orcamento"]);
  const lem = L.aplicarModelo("lembrete_consulta_texto", BASE);
  assert.equal(lem.ativo, false, "nasce desligado");
  assert.equal(lem.gatilho, "antes_da_data");
  assert.deepEqual(lem.config, { campo: "consulta", horas: 24 });
  assert.equal(lem.acoes.length, 1);
  assert.equal(lem.acoes[0].tipo, "enviar_mensagem", "texto livre (sem enviar_template)");
  assert.equal(lem.acoes[0].template_id, undefined);
  assert.match(lem.acoes[0].texto, /{primeiro_nome}.*{data_consulta}.*{hora_consulta}/);
  assert.equal(L.faltaModelo(lem), false, "não exige modelo aprovado");
  assert.equal(L.validar(Object.assign({}, lem, { ativo: true }), { base: BASE }).ok, true, "pronto para ligar sem modelo da Meta");
  const conf = L.aplicarModelo("confirmacao_agendamento", BASE);
  assert.equal(conf.ativo, false);
  assert.equal(conf.nome, "Confirmação ao agendar");
  assert.equal(conf.gatilho, "negocio_estagio");
  const padrao = BASE.funis.find(f => f.padrao) || BASE.funis[0];
  const agendada = padrao.estagios.find(e => e.marco === "agendada");
  assert.equal(conf.config.estagio_id, agendada && agendada.id, "a etapa Agendada do funil padrão");
  assert.equal(conf.acoes[0].tipo, "enviar_mensagem");
  assert.ok(agendada, "o funil padrão de teste tem a etapa Agendada");
  assert.equal(L.validar(Object.assign({}, conf, { ativo: true }), { base: BASE }).ok, true, "pronta para ligar");
  // vocabulário da vertical: oficina fala em visita
  const of = L.aplicarModelo("lembrete_consulta_texto", BASE, VOCAB_OFICINA);
  assert.match(of.acoes[0].texto, /sua visita amanhã/);
  assert.equal(of.nome, "Lembrete 24 h antes da visita (texto)");
  const confOf = L.aplicarModelo("confirmacao_agendamento", BASE, VOCAB_OFICINA).acoes[0].texto;
  assert.doesNotMatch(confOf.replace(/{[a-z_]+}/g, ""), /consulta/, "a palavra muda por vertical");
  // as VARIÁVEIS não mudam: o servidor só conhece {data_consulta} e {hora_consulta} (bug antigo: virava {data_visita})
  assert.match(confOf, /{data_consulta}.*{hora_consulta}/);
  assert.match(of.acoes[0].texto, /{data_consulta}.*{hora_consulta}/);
  assert.deepEqual(L.variaveisDesconhecidas(of.acoes[0].texto + confOf), []);
  // o catálogo original não é alterado
  assert.match(L.MODELOS.find(m => m.id === "lembrete_consulta_texto").auto.acoes[0].texto, /consulta/);
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

test("editor: abrir uma automação antiga não troca «modo» por «dono» em silêncio", () => {
  const editor = lerApp("auto-editor.js");
  assert.doesNotMatch(editor, /ac\.dono\s*=\s*ac\.modo/, "a conversão antiga ao abrir mudava o comportamento no servidor");
  assert.match(editor, /L\.valorCampo\(ac, f\.nome\)/, "o seletor mostra o «modo» antigo");
  assert.match(editor, /ac\.dono = x; delete ac\.modo;/, "só ao escolher outro jeito passa para o contrato novo");
  assert.match(editor, /L\.ehAtribuirAntigo\(ac\)/, "o editor avisa que o jeito antigo se comporta diferente");
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

/* ================================================================== PLANO-NOITE-20261001: catálogo, sequência, IA, receitas, simulação */

const CAT = await import("../web/app/auto-catalogo.js?v=dev");   // a mesma instância que o auto-logica carrega em Node
const campos = d => d.campos.map(f => f.nome);

test("catálogo compartilhado: auto-logica reexporta exatamente o auto-catalogo (uma fonte só)", () => {
  assert.equal(L.GATILHOS, CAT.GATILHOS);
  assert.equal(L.ACOES, CAT.ACOES);
  assert.equal(L.LIMITES, CAT.LIMITES);
  assert.equal(L.VARIAVEIS, CAT.VARIAVEIS);
});

test("catálogo: gatilhos e ações do contrato do PLANO, com os nomes exatos dos campos", () => {
  const g = id => L.GATILHO[id];
  assert.deepEqual(campos(g("agendado")), ["horario", "dias_semana", "funil_id", "estagio_id"]);
  assert.deepEqual(campos(g("apos_data")), ["campo", "horas", "funil_id"]);
  assert.deepEqual(campos(g("conversa_resolvida")), ["canal_id", "departamento_id"]);
  const a = id => L.ACAO[id];
  assert.deepEqual(campos(a("mover_funil")), ["funil_id", "estagio_id"]);
  assert.deepEqual(campos(a("etiqueta_adicionar")), ["etiqueta_id"]);
  assert.deepEqual(campos(a("etiqueta_remover")), ["etiqueta_id"]);
  assert.deepEqual(campos(a("campo_atualizar")), ["campo", "valor"]);
  assert.deepEqual(campos(a("nota")), ["texto"]);
  assert.deepEqual(campos(a("notificar")), ["para", "departamento_id", "titulo", "texto"]);
  assert.deepEqual(campos(a("esperar")), ["minutos", "cancelar_se_cliente_responder"]);
  assert.deepEqual(campos(a("parar")), []);
  assert.deepEqual(campos(a("ia_decidir")), ["tarefa", "instrucao"]);
  assert.deepEqual(L.TAREFAS_IA.map(t => t[0]), ["classificar_etapa", "resumir_nota", "pontuar_lead"]);
  assert.deepEqual(L.LIMITES.esperar, [1, 43200]);
  assert.deepEqual(L.LIMITES.apos_data, [1, 720]);
  // os já existentes continuam com os mesmos nomes (o servidor já os grava)
  assert.deepEqual(campos(a("atribuir")), ["dono", "conta_id", "departamento_id"]);
  assert.deepEqual(campos(a("etiquetar")), ["etiqueta_id", "alvo", "remover"]);
  assert.deepEqual(campos(g("antes_da_data")), ["campo", "horas", "funil_id"]);
});

test("catálogo ↔ editor: todo tipo de campo do catálogo tem desenho no editor; todo grupo de ação está na paleta", () => {
  const editor = lerApp("auto-editor.js");
  const tipos = new Set();
  for (const d of [...L.GATILHOS, ...L.ACOES]) for (const f of d.campos) tipos.add(f.tipo);
  tipos.delete("parametros");   // desenhado por editorModelo (junto com «template»)
  const casos = new Set([...editor.matchAll(/case "([a-z_]+)"/g)].map(m => m[1]));
  for (const t of tipos) assert.ok(casos.has(t), `o editor não desenha o tipo de campo «${t}»`);
  const grupos = new Set(L.ACOES.map(a => a.grupo));
  for (const gr of grupos) assert.ok(L.GRUPOS_ACAO.includes(gr), `grupo «${gr}» fora da paleta`);
  for (const d of [...L.GATILHOS, ...L.ACOES]) assert.ok(d.descricao && d.descricao.length > 10, `${d.id} sem descricao para o usuário`);
  // a paleta só mostra o que existe e tem rótulo; etiquetar legado e alerta_whatsapp ficam fora
  const naPaleta = L.ACOES.filter(a => a.disponivel !== false && a.menu !== false).map(a => a.id);
  assert.ok(!naPaleta.includes("etiquetar") && !naPaleta.includes("alerta_whatsapp"));
  for (const id of ["esperar", "parar", "ia_decidir", "mover_funil", "etiqueta_adicionar", "etiqueta_remover", "campo_atualizar", "nota"]) assert.ok(naPaleta.includes(id), id);
  for (const id of naPaleta) assert.ok(L.rotuloAcao(id, VOCAB_ODONTO).length > 3, id);
  // todo gatilho aparece no seletor com um rótulo
  for (const g of L.GATILHOS) assert.ok(L.rotuloGatilho(g.id, VOCAB_ODONTO).length > 3, g.id);
});

test("validar: gatilho «agendado» (horário, dias, funil/etapa)", () => {
  const a = c => valida(auto({ gatilho: "agendado", config: c }), { base: BASE });
  assert.equal(a({ horario: "09:00", dias_semana: [1, 2, 3] }).ok, true);
  assert.equal(a({ horario: "09:00", dias_semana: ["1", "5"] }).ok, true, "dias como texto vindo de formulário");
  assert.equal(a({ horario: "9h", dias_semana: [1] }).motivo, "escolha o horário em «Quando» (de 00:00 a 23:59)");
  assert.match(a({ horario: "24:00", dias_semana: [1] }).motivo, /horário/);
  assert.equal(a({ horario: "09:00", dias_semana: [] }).motivo, "escolha pelo menos um dia da semana");
  assert.equal(a({ horario: "09:00" }).motivo, "escolha pelo menos um dia da semana");
  assert.equal(a({ horario: "09:00", dias_semana: [7] }).motivo, "os dias da semana vão de 0 (domingo) a 6 (sábado)");
  assert.equal(a({ horario: "09:00", dias_semana: "1" }).motivo, "os dias da semana estão em formato inválido");
  assert.equal(a({ horario: "09:00", dias_semana: [1, 1] }).ok, true, "dia repetido é só limpo ao salvar (como no servidor)");
  assert.equal(a({ horario: "09:00", dias_semana: [1], funil_id: U(1), estagio_id: U(13) }).ok, true);
  assert.equal(a({ horario: "09:00", dias_semana: [1], funil_id: U(2), estagio_id: U(13) }).motivo, "a etapa escolhida em «Quando» não é desse funil");
  assert.equal(a({ horario: "09:00", dias_semana: [1], estagio_id: U(99) }).motivo, "a etapa escolhida em «Quando» não existe mais");
});

test("validar: «apos_data» (1..720 h) e «conversa_resolvida»", () => {
  const a = c => valida(auto({ gatilho: "apos_data", config: c }));
  assert.equal(a({ campo: "consulta", horas: 2 }).ok, true);
  assert.equal(a({ campo: "consulta", horas: 720 }).ok, true);
  for (const h of [0, 721, 1.5, "x", null]) assert.equal(a({ campo: "consulta", horas: h }).motivo, "o tempo depois da data vai de 1 a 720 horas", String(h));
  assert.equal(a({ horas: 2 }).motivo, "escolha a data em «Quando»");
  assert.equal(valida(auto({ gatilho: "conversa_resolvida", config: {} })).ok, true);
  assert.equal(valida(auto({ gatilho: "conversa_resolvida", config: { departamento_id: U(51), canal_id: U(61) } }), { base: BASE }).ok, true);
  assert.equal(valida(auto({ gatilho: "conversa_resolvida", config: { departamento_id: U(52) } }), { base: BASE }).motivo, "o departamento escolhido em «Quando» não existe mais");
});

test("validar: passos novos (mover_funil, etiquetas, campo, nota, notificar departamento, esperar, parar, ia_decidir)", () => {
  const m = (ac, o) => valida(auto({ acoes: [tarefa(), ac] }), o).motivo;
  const ok = (ac, o) => valida(auto({ acoes: [tarefa(), ac] }), o).ok;
  // mover_funil
  assert.equal(m({ tipo: "mover_funil" }), "ação 2: escolha o funil");
  assert.equal(m({ tipo: "mover_funil", funil_id: U(99) }, { base: BASE }), "ação 2: o funil escolhido não existe mais");
  assert.equal(ok({ tipo: "mover_funil", funil_id: U(2) }, { base: BASE }), true);
  assert.equal(ok({ tipo: "mover_funil", funil_id: U(2), estagio_id: U(21) }, { base: BASE }), true);
  assert.equal(m({ tipo: "mover_funil", funil_id: U(2), estagio_id: U(13) }, { base: BASE }), "ação 2: a etapa não é desse funil");
  // etiquetas
  assert.equal(m({ tipo: "etiqueta_adicionar" }), "ação 2: escolha a etiqueta");
  assert.equal(m({ tipo: "etiqueta_remover" }), "ação 2: escolha a etiqueta");
  assert.equal(m({ tipo: "etiqueta_remover", etiqueta_id: U(99) }, { base: BASE }), "ação 2: a etiqueta escolhida não existe mais");
  assert.equal(ok({ tipo: "etiqueta_adicionar", etiqueta_id: U(31) }, { base: BASE }), true);
  // só pelo nome não vale aqui: o banco (nx_auto_normalizar) exige a etiqueta escolhida em «Pôr etiqueta»; criar pelo nome é só do «etiquetar»
  assert.equal(m({ tipo: "etiqueta_adicionar", etiqueta_nome: "Orçamento" }, { base: BASE }), "ação 2: escolha a etiqueta");
  assert.equal(L.limpar(auto({ acoes: [{ tipo: "etiqueta_adicionar", etiqueta_nome: "Orçamento" }] })).acoes[0].etiqueta_nome, undefined);
  // campo_atualizar
  assert.equal(m({ tipo: "campo_atualizar", valor: "x" }), "ação 2: escolha o campo");
  assert.equal(m({ tipo: "campo_atualizar", campo: "convenio", valor: " " }, { base: BASE }), "ação 2: escreva o valor");
  assert.equal(ok({ tipo: "campo_atualizar", campo: "score", valor: "80" }, { base: BASE }), true, "pontuação sempre existe");
  assert.equal(ok({ tipo: "campo_atualizar", campo: "origem_detalhe", valor: "x" }, { base: { ...BASE, campos_negocio: [{ chave: "origem_detalhe", rotulo: "Detalhe", tipo: "texto" }] } }), true, "campo da oportunidade");
  assert.equal(m({ tipo: "campo_atualizar", campo: "origem_detalhe", valor: "x" }, { base: BASE }), "ação 2: o campo escolhido não existe mais");
  assert.equal(m({ tipo: "campo_atualizar", campo: "nao_existe", valor: "x" }, { base: BASE }), "ação 2: o campo escolhido não existe mais");
  assert.equal(ok({ tipo: "campo_atualizar", campo: "convenio", valor: "Unimed" }, { base: BASE }), true);
  assert.equal(m({ tipo: "campo_atualizar", campo: "convenio", valor: "x".repeat(201) }), "ação 2: o valor pode ter até 200 caracteres");
  // nota
  assert.equal(m({ tipo: "nota", texto: "" }), "ação 2: escreva a nota");
  assert.equal(m({ tipo: "nota", texto: "x".repeat(1001) }), "ação 2: a nota pode ter até 1000 caracteres");
  assert.equal(ok({ tipo: "nota", texto: "Cliente pediu retorno" }), true);
  // notificar para departamento
  assert.equal(m({ tipo: "notificar", para: "departamento", titulo: "x" }), "ação 2: escolha o departamento");
  assert.equal(m({ tipo: "notificar", para: "departamento", departamento_id: U(52), titulo: "x" }, { base: BASE }), "ação 2: o departamento escolhido não existe mais");
  assert.equal(ok({ tipo: "notificar", para: "departamento", departamento_id: U(51), titulo: "x" }, { base: BASE }), true);
  // esperar / parar
  const com = (ac, ...resto) => valida(auto({ acoes: [tarefa(), ac, tarefa(), ...resto] }));
  for (const mi of [0, 43201, 1.5, "x", null, undefined]) assert.equal(com({ tipo: "esperar", minutos: mi }).motivo, "ação 2: a espera vai de 1 minuto a 30 dias (43200 minutos)", String(mi));
  for (const mi of [1, 90, 43200, "1440"]) assert.equal(com({ tipo: "esperar", minutos: mi, cancelar_se_cliente_responder: true }).ok, true, String(mi));
  assert.equal(m({ tipo: "esperar", minutos: 60 }), "ação 2: depois de esperar, acrescente outra ação", "esperar no último passo não faz nada");
  assert.equal(valida(auto({ acoes: [tarefa(), { tipo: "esperar", minutos: 60 }, { tipo: "parar" }] })).ok, true, "esperar antes de parar é válido");
  const seis = Array.from({ length: 6 }, () => [{ tipo: "esperar", minutos: 60 }, tarefa()]).flat();
  assert.equal(valida(auto({ acoes: seis.slice(0, 10) })).ok, true, "5 esperas");
  const muitas = L.problemas(auto({ acoes: [{ tipo: "esperar", minutos: 1 }, { tipo: "esperar", minutos: 1 }, { tipo: "esperar", minutos: 1 }, { tipo: "esperar", minutos: 1 }, { tipo: "esperar", minutos: 1 }, { tipo: "esperar", minutos: 1 }, tarefa()] }));
  assert.deepEqual(muitas.map(p => p.motivo), ["ação 6: use até 5 esperas"]);
  assert.equal(ok({ tipo: "parar" }), true);
  // ia_decidir
  assert.equal(m({ tipo: "ia_decidir" }), "ação 2: escolha o que a IA faz");
  assert.equal(m({ tipo: "ia_decidir", tarefa: "adivinhar" }), "ação 2: escolha o que a IA faz");
  assert.equal(m({ tipo: "ia_decidir", tarefa: "pontuar_lead", instrucao: "x".repeat(501) }), "ação 2: a instrução pode ter até 500 caracteres");
  for (const t of L.TAREFAS_IA) assert.equal(ok({ tipo: "ia_decidir", tarefa: t[0], instrucao: "Seja objetivo" }), true, t[0]);
  // atribuir: «dono» novo (com departamento) e «modo» antigo
  assert.equal(m({ tipo: "atribuir", dono: "departamento" }), "ação 2: escolha o departamento");
  assert.equal(ok({ tipo: "atribuir", dono: "departamento", departamento_id: U(51) }, { base: BASE }), true);
  assert.equal(m({ tipo: "atribuir", modo: "departamento", departamento_id: U(51) }), "ação 2: escolha como atribuir", "«modo» antigo não tinha departamento");
  assert.equal(ok({ tipo: "atribuir", modo: "rodizio" }), true, "automações antigas continuam válidas");
  assert.equal(ok({ tipo: "atribuir", dono: "conta", conta_id: U(41) }, { base: BASE }), true);
  assert.equal(m({ tipo: "atribuir", dono: "conta" }), "ação 2: escolha a pessoa");
  // notificar: título OU detalhe (como no servidor)
  assert.equal(ok({ tipo: "notificar", para: "admins", titulo: "", texto: "Só o detalhe" }), true);
  // funil desativado
  assert.equal(m({ tipo: "mover_funil", funil_id: U(3) }, { base: { ...BASE, funis: [...BASE.funis, { id: U(3), nome: "Velho", ativo: false, estagios: [] }] } }), "ação 2: o funil escolhido está desativado");
  // só esperar/parar não é uma automação
  assert.equal(valida(auto({ acoes: [{ tipo: "esperar", minutos: 60 }, { tipo: "parar" }] })).motivo, "acrescente pelo menos um passo que faça algo, além de esperar ou parar");
});

test("problemas(): lista TODOS os problemas na ordem da tela; validar() devolve só o primeiro", () => {
  const ruim = { nome: "", gatilho: "negocio_estagio", config: {}, condicoes: [{ campo: "origem", op: "igual" }], acoes: [{ tipo: "mover_estagio" }, { tipo: "criar_tarefa", titulo: "" }] };
  const ps = L.problemas(ruim);
  assert.deepEqual(ps.map(p => [p.onde, p.indice ?? null]), [["nome", null], ["quando", null], ["se", 0], ["entao", 0], ["entao", 1]]);
  assert.deepEqual(L.validar(ruim), { ok: false, motivo: "dê um nome à automação", onde: "nome", indice: undefined });
  assert.deepEqual(L.problemas(auto()), []);
  assert.equal(L.semPrefixo("ação 2: escolha a etapa"), "escolha a etapa");
  assert.equal(L.semPrefixo("condição 10: preencha o valor"), "preencha o valor");
  assert.equal(L.semPrefixo("escolha o gatilho em «Quando»"), "escolha o gatilho em «Quando»");
});

test("limpar: campos novos (hora, dias, duração, notificar departamento, nota, ia_decidir, parar)", () => {
  const x = L.limpar({
    nome: "Seq", gatilho: "agendado", config: { horario: "09:00", dias_semana: ["5", 1, 1, 9], funil_id: "", estagio_id: U(13), lixo: 1 },
    acoes: [
      { tipo: "esperar", minutos: "90", x: 1 },
      { tipo: "esperar", minutos: 1440, cancelar_se_cliente_responder: false },
      { tipo: "notificar", para: "departamento", departamento_id: U(51), titulo: " T ", texto: "" },
      { tipo: "notificar", para: "admins", departamento_id: U(51), titulo: "T2" },
      { tipo: "nota", texto: " anotar " },
      { tipo: "ia_decidir", tarefa: "resumir_nota", instrucao: "  " },
      { tipo: "campo_atualizar", campo: "convenio", valor: " Unimed " },
      { tipo: "mover_funil", funil_id: U(2), estagio_id: "" },
      { tipo: "parar", lixo: 1 },
    ],
  });
  assert.deepEqual(x.config, { horario: "09:00", dias_semana: [1, 5], estagio_id: U(13) });
  assert.deepEqual(x.acoes, [
    { tipo: "esperar", minutos: 90, cancelar_se_cliente_responder: true },
    { tipo: "esperar", minutos: 1440, cancelar_se_cliente_responder: false },
    { tipo: "notificar", para: "departamento", departamento_id: U(51), titulo: "T" },
    { tipo: "notificar", para: "admins", titulo: "T2" },
    { tipo: "nota", texto: "anotar" },
    { tipo: "ia_decidir", tarefa: "resumir_nota" },
    { tipo: "campo_atualizar", campo: "convenio", valor: "Unimed" },
    { tipo: "mover_funil", funil_id: U(2) },
    { tipo: "parar" },
  ]);
  // cancelar_se_cliente_responder vira SEMPRE booleano (o contrato do motor); o padrão é ligado
  assert.equal(L.limpar({ nome: "a", gatilho: "tarefa_vencida", acoes: [L.novaAcao("esperar")] }).acoes[0].cancelar_se_cliente_responder, true);
  // «modo» antigo de atribuir CONTINUA «modo» (no servidor os dois jeitos fazem coisas diferentes: o antigo só mexe na conversa
  // e usa a regra de distribuição do departamento; o novo «dono» também troca o responsável do negócio e usa o rodízio da equipe)
  assert.deepEqual(L.limpar({ nome: "a", gatilho: "tarefa_vencida", acoes: [{ tipo: "atribuir", modo: "conta", conta_id: U(41), departamento_id: U(51) }, { tipo: "atribuir", dono: "departamento", departamento_id: U(51), conta_id: U(41) }] }).acoes,
    [{ tipo: "atribuir", modo: "conta", conta_id: U(41), departamento_id: U(51) }, { tipo: "atribuir", dono: "departamento", departamento_id: U(51) }]);
  assert.deepEqual(L.limpar({ nome: "a", gatilho: "conversa_nova", acoes: [{ tipo: "atribuir", modo: "rodizio", conta_id: U(41) }] }).acoes,
    [{ tipo: "atribuir", modo: "rodizio" }], "o antigo em rodízio não carrega a pessoa de antes");
  // abrir → salvar sem mexer não muda o jeito (e salvar duas vezes dá o mesmo resultado)
  const antiga = { nome: "Conversa nova: rodízio", gatilho: "conversa_nova", ativo: true, acoes: [{ tipo: "atribuir", modo: "rodizio" }] };
  const salva = L.limpar(antiga);
  assert.equal(salva.acoes[0].modo, "rodizio");
  assert.equal("dono" in salva.acoes[0], false, "sem «dono»: o servidor continua no comportamento antigo");
  assert.deepEqual(L.limpar(salva), salva);
  // escolher outro jeito no editor passa ao contrato novo (o editor grava «dono» e apaga «modo»)
  assert.deepEqual(L.limpar({ nome: "a", gatilho: "conversa_nova", acoes: [{ tipo: "atribuir", dono: "rodizio" }] }).acoes, [{ tipo: "atribuir", dono: "rodizio" }]);
  assert.equal(L.ehAtribuirAntigo({ tipo: "atribuir", modo: "conta" }), true);
  assert.equal(L.ehAtribuirAntigo({ tipo: "atribuir", dono: "conta", modo: "conta" }), false);
  assert.equal(L.ehAtribuirAntigo({ tipo: "nota", modo: "x" }), false);
  assert.equal(L.valorCampo({ tipo: "atribuir", modo: "conta" }, "dono"), "conta", "o editor lê «dono» do «modo» antigo (a pessoa aparece)");
  assert.equal(L.valorCampo({ tipo: "atribuir", dono: "rodizio", modo: "conta" }, "dono"), "rodizio");
  assert.equal(L.valorCampo({ tipo: "atribuir", modo: "conta", conta_id: "x" }, "conta_id"), "x");
});

test("novaAutomacao/novaAcao: padrões do catálogo sem compartilhar referência", () => {
  const a = L.novaAutomacao("agendado"), b = L.novaAutomacao("agendado");
  assert.deepEqual(a.config, { horario: "09:00", dias_semana: [1, 2, 3, 4, 5] });
  a.config.dias_semana.push(6);
  assert.deepEqual(b.config.dias_semana, [1, 2, 3, 4, 5], "o padrão não é compartilhado");
  assert.deepEqual(L.novaAcao("esperar"), { tipo: "esperar", minutos: 1440, cancelar_se_cliente_responder: true });
  assert.deepEqual(L.novaAcao("ia_decidir"), { tipo: "ia_decidir", tarefa: "classificar_etapa" });
  assert.deepEqual(L.novaAcao("parar"), { tipo: "parar" });
  assert.deepEqual(L.novaAcao("notificar"), { tipo: "notificar", para: "responsavel" });
  assert.deepEqual(L.trocarGatilho({ gatilho: "negocio_estagio", config: { estagio_id: U(13) } }, "agendado").config, { horario: "09:00", dias_semana: [1, 2, 3, 4, 5], estagio_id: U(13) });
  assert.deepEqual(L.novaAutomacao("apos_data").config, { campo: "consulta", horas: 2 });
});

test("sequência: linhaDoTempo soma as esperas, marca o que vem depois de «parar» e avisa o que não faz sentido", () => {
  const acoes = [tarefa(), { tipo: "esperar", minutos: 1440 }, tarefa(), { tipo: "esperar", minutos: 2880 }, tarefa(), { tipo: "parar" }, tarefa()];
  const tl = L.linhaDoTempo(acoes);
  assert.deepEqual(tl.map(x => x.quando), ["Na hora", "Na hora", "Depois de 1 dia", "Depois de 1 dia", "Depois de 3 dias", "Depois de 3 dias", "Depois de 3 dias"]);
  assert.deepEqual(tl.map(x => x.inalcancavel), [false, false, false, false, false, false, true]);
  assert.equal(L.duracaoTotal(acoes), 4320);
  assert.equal(L.temSequencia({ acoes }), true);
  assert.equal(L.temSequencia({ acoes: [tarefa()] }), false);
  const av = L.avisosEstrutura({ gatilho: "tarefa_vencida", acoes });
  assert.ok(av.some(t => /depois de «Parar por aqui» nunca rodam/.test(t)), av.join("|"));
  assert.ok(L.avisosEstrutura({ acoes: [tarefa(), { tipo: "esperar", minutos: 60 }, { tipo: "esperar", minutos: 60 }, tarefa()] }).some(t => /duas esperas/.test(t)));
  assert.ok(L.avisosEstrutura({ gatilho: "tarefa_vencida", acoes: [{ tipo: "esperar", minutos: 60, cancelar_se_cliente_responder: true }, tarefa()] }).some(t => /existe uma conversa/.test(t)));
  assert.ok(L.avisosEstrutura({ acoes: [{ tipo: "ia_decidir", tarefa: "pontuar_lead" }] }).some(t => /cota de IA/.test(t)));
  assert.deepEqual(L.avisosEstrutura({ gatilho: "negocio_criado", acoes: [tarefa(), { tipo: "esperar", minutos: 60 }, tarefa()] }), []);
  // reordenar mantém a conta
  assert.deepEqual(L.linhaDoTempo(L.mover(acoes, 1, 0)).slice(0, 2).map(x => x.quando), ["Na hora", "Depois de 1 dia"]);
});

test("durações: formatar, decompor e compor (chips e campo «Outro»)", () => {
  assert.equal(L.formatarDuracao(5), "5 min");
  assert.equal(L.formatarDuracao(60), "1 h");
  assert.equal(L.formatarDuracao(90), "1 h 30 min");
  assert.equal(L.formatarDuracao(1440), "1 dia");
  assert.equal(L.formatarDuracao(4320), "3 dias");
  assert.equal(L.formatarDuracao(1500), "25 h");
  assert.equal(L.formatarDuracao(1530), "25 h 30 min");
  assert.equal(L.formatarDuracao(43200), "30 dias");
  assert.deepEqual(L.decomporDuracao(2880), { n: 2, un: "dias" });
  assert.deepEqual(L.decomporDuracao(180), { n: 3, un: "horas" });
  assert.deepEqual(L.decomporDuracao(90), { n: 90, un: "min" });
  assert.equal(L.comporDuracao(2, "dias"), 2880);
  assert.equal(L.comporDuracao("3", "horas"), 180);
  assert.equal(L.comporDuracao(45, "min"), 45);
  assert.equal(L.comporDuracao("", "min"), null);
  assert.equal(L.comporDuracao(-1, "min"), null);
  for (const [m] of L.PRESETS_ESPERA) assert.equal(L.comporDuracao(L.decomporDuracao(m).n, L.decomporDuracao(m).un), m, `${m} ida e volta`);
  assert.ok(L.PRESETS_ESPERA.every(([m]) => m >= L.LIMITES.esperar[0] && m <= L.LIMITES.esperar[1]));
});

test("frasePeriodo: dias da semana em português", () => {
  assert.equal(L.frasePeriodo([0, 1, 2, 3, 4, 5, 6]), "todos os dias");
  assert.equal(L.frasePeriodo([1, 2, 3, 4, 5]), "de segunda a sexta");
  assert.equal(L.frasePeriodo([1, 2, 3, 4, 5, 6]), "de segunda a sábado");
  assert.equal(L.frasePeriodo([1]), "toda segunda");
  assert.equal(L.frasePeriodo([6]), "todo sábado");
  assert.equal(L.frasePeriodo([1, 3, 5]), "às segundas, quartas e sextas");
  assert.equal(L.frasePeriodo([0, 6]), "aos domingos e sábados");
  assert.equal(L.frasePeriodo([2, 6]), "às terças e aos sábados");
  assert.equal(L.frasePeriodo([]), "(escolha os dias)");
  assert.deepEqual(L.normalizarDias(["3", 1, 3, 8, "x", -1]), [1, 3]);
});

test("descrever: gatilhos novos, passos novos e sequência com «e depois»", () => {
  const f = (a, v = VOCAB_ODONTO) => L.descrever(a, BASE, v);
  assert.equal(f({ gatilho: "agendado", config: { horario: "09:00", dias_semana: [1, 2, 3, 4, 5], estagio_id: U(13) }, acoes: [{ tipo: "criar_tarefa", titulo: "Retomar", dono: "responsavel", vence_em_horas: 4 }] }),
    "De segunda a sexta, às 09:00, para cada oportunidade aberta na etapa «Avaliou / orçamento», criar tarefa «Retomar» para o responsável em 4 h.");
  assert.equal(f({ gatilho: "apos_data", config: { campo: "consulta", horas: 2 }, acoes: [{ tipo: "resolver_conversa" }] }), "2 h depois da consulta, resolver a conversa.");
  assert.equal(f({ gatilho: "apos_data", config: { campo: "consulta", horas: 48 }, acoes: [{ tipo: "resolver_conversa" }] }, VOCAB_OFICINA), "2 dias depois da visita, resolver a conversa.");
  assert.equal(f({ gatilho: "conversa_resolvida", config: { departamento_id: U(51) }, acoes: [{ tipo: "ia_decidir", tarefa: "resumir_nota" }] }),
    "Quando uma conversa for resolvida em «Recepção», pedir à IA para resumir a conversa numa nota.");
  assert.equal(f({ gatilho: "negocio_criado", config: {}, acoes: [{ tipo: "mover_funil", funil_id: U(2), estagio_id: U(21) }, { tipo: "etiqueta_adicionar", etiqueta_id: U(31) }, { tipo: "etiqueta_remover", etiqueta_id: U(32) },
    { tipo: "campo_atualizar", campo: "convenio", valor: "Unimed" }, { tipo: "nota", texto: "Entrou por anúncio" }, { tipo: "notificar", para: "departamento", departamento_id: U(51), titulo: "x" }] }),
  "Quando uma oportunidade for criada, mover para o funil «Pós-tratamento» (etapa «Em tratamento»), pôr a etiqueta «Orçamento», tirar a etiqueta «Implante», preencher o campo «Convênio» com «Unimed», anotar «Entrou por anúncio» e avisar o departamento «Recepção».");
  assert.equal(f({ gatilho: "negocio_estagio", config: { estagio_id: U(13) }, acoes: [
    { tipo: "enviar_mensagem", texto: "A" }, { tipo: "esperar", minutos: 1440, cancelar_se_cliente_responder: true }, { tipo: "enviar_mensagem", texto: "B" },
    { tipo: "criar_tarefa", titulo: "C", dono: "responsavel", vence_em_horas: 0 }, { tipo: "esperar", minutos: 90 }, { tipo: "parar" }] }),
  "Quando a oportunidade entrar em «Avaliou / orçamento», enviar a mensagem «A», esperar 1 dia (parando se o cliente responder) e depois enviar a mensagem «B» e criar tarefa «C» para o responsável para já, esperar 1 h 30 min e depois parar por aqui.");
});

test("deFormatoIA: converte {gatilho:{tipo,campos}, acoes:[{tipo,campos}]} para o editor e volta (ida e volta sem perda)", () => {
  const daIA = {
    nome: "Orçamento sem resposta em 2 dias",
    gatilho: { tipo: "negocio_estagio", campos: { estagio_id: U(13) } },
    condicoes: [{ campo: "origem", op: "igual", valor: "anuncio" }],
    acoes: [
      { tipo: "esperar", campos: { minutos: 2880, cancelar_se_cliente_responder: true } },
      { tipo: "enviar_mensagem", campos: { texto: "Oi, {primeiro_nome}! Ficou alguma dúvida?" } },
      { tipo: "notificar", campos: { para: "responsavel", titulo: "{nome} não respondeu" } },
    ],
  };
  const { auto: a, avisos } = L.deFormatoIA(daIA, BASE);
  assert.deepEqual(avisos, []);
  assert.equal(a.gatilho, "negocio_estagio");
  assert.deepEqual(a.config, { estagio_id: U(13) });
  assert.deepEqual(a.acoes[0], { tipo: "esperar", minutos: 2880, cancelar_se_cliente_responder: true });
  assert.equal(a.ativo, false, "a IA nunca liga nada sozinha");
  assert.equal(L.validar(a, { base: BASE }).ok, true);
  assert.deepEqual(L.paraFormatoIA(a), { ...daIA, respeitar_horario: false });
  // formato do editor também é aceito (já achatado)
  const x = L.deFormatoIA({ nome: "n", gatilho: "tarefa_vencida", config: {}, acoes: [{ tipo: "nota", texto: "t" }] }, BASE);
  assert.equal(x.auto.gatilho, "tarefa_vencida");
  assert.deepEqual(x.auto.acoes, [{ tipo: "nota", texto: "t" }]);
});

test("deFormatoIA: lixo da IA não quebra — gatilho/passos inexistentes viram avisos e o editor abre para consertar", () => {
  const r = L.deFormatoIA({ nome: "x".repeat(200), gatilho: { tipo: "aniversario", campos: { a: 1 } }, acoes: [{ tipo: "chamar_http", campos: { url: "x" } }, null, 7, { tipo: "nota", campos: { texto: "ok" } }] }, BASE);
  assert.equal(r.auto.nome.length, 80);
  assert.equal(r.auto.gatilho, "negocio_estagio", "gatilho padrão do editor");
  assert.deepEqual(r.auto.config, {}, "config do gatilho inexistente é descartada");
  assert.deepEqual(r.auto.acoes, [{ tipo: "nota", texto: "ok" }]);
  assert.equal(r.avisos.length, 2);
  assert.match(r.avisos[0], /gatilho/);
  assert.match(r.avisos[1], /passo que não existe/);
  for (const nada of [null, undefined, "texto", 5, []]) {
    const v = L.deFormatoIA(nada, BASE);
    assert.equal(v.auto.ativo, false);
    assert.ok(Array.isArray(v.auto.acoes) && Array.isArray(v.auto.condicoes));
  }
  // modelo de mensagem inexistente não vira id fantasma
  const t = L.deFormatoIA({ nome: "t", gatilho: { tipo: "tarefa_vencida", campos: {} }, acoes: [{ tipo: "enviar_template", campos: { template_id: U(99), parametros: [] } }] }, BASE);
  assert.equal(t.auto.acoes[0].template_id, undefined);
});

test("receitas: as 9 do PLANO existem, são válidas no catálogo e nascem desligadas", () => {
  const ids = ["lembrete_consulta_texto", "confirmacao_agendamento", "followup_orcamento", "faltou_remarcar", "pos_atendimento", "reativar_30_dias", "lead_anuncio", "ia_classificar_etapa", "ia_resumo_conversa"];
  for (const id of ids) assert.ok(L.MODELOS.some(m => m.id === id), id);
  assert.equal(new Set(L.MODELOS.map(m => m.id)).size, L.MODELOS.length, "ids únicos");
  for (const vertical of ["odonto", "oficina", "loja", "generico"]) {
    const voc = { ...VOCAB_ODONTO, vertical };
    for (const m of L.modelosDaVertical(vertical)) {
      const a = L.aplicarModelo(m.id, BASE, voc);
      assert.equal(a.ativo, false, `${vertical}/${m.id} nasce desligada`);
      const r = L.validar(a, { base: BASE, ligar: false });
      assert.ok(r.ok, `${vertical}/${m.id}: ${r.motivo}`);
      assert.ok(!L.problemas(a, { base: BASE, ligar: false }).length, `${vertical}/${m.id}`);
      assert.ok(["whatsapp", "equipe", "ia"].includes(m.categoria), m.id);
      assert.ok(L.tituloModelo(m, voc).length > 10 && L.textoModelo(m, voc).length > 20, m.id);
      // nenhuma variável fora do catálogo nos textos
      for (const ac of a.acoes) for (const campo of ["texto", "titulo"]) assert.deepEqual(L.variaveisDesconhecidas(ac[campo]), [], `${m.id}.${campo}`);
      // a frase nunca sai com buraco
      assert.ok(!/undefined|null|NaN|\(escolha/.test(L.descrever(a, BASE, voc)), `${vertical}/${m.id}: ${L.descrever(a, BASE, voc)}`);
      // pode ligar? só os que dependem de modelo da Meta não podem sem ele
      const ligavel = L.validar({ ...a, ativo: true }, { base: BASE, ligar: true });
      assert.ok(ligavel.ok, `${vertical}/${m.id} ligável: ${ligavel.motivo}`);
    }
  }
});

test("receitas: sequência do follow-up (24 h e 72 h, para se responder), faltou, lead de anúncio e IA", () => {
  const f = L.aplicarModelo("followup_orcamento", BASE, VOCAB_ODONTO);
  assert.equal(f.gatilho, "negocio_estagio");
  assert.equal(f.config.estagio_id, U(13), "etapa de orçamento do funil padrão");
  assert.deepEqual(f.acoes.map(a => a.tipo), ["esperar", "enviar_mensagem", "esperar", "enviar_mensagem", "criar_tarefa"]);
  assert.deepEqual(f.acoes.filter(a => a.tipo === "esperar").map(a => [a.minutos, a.cancelar_se_cliente_responder]), [[1440, true], [2880, true]]);
  assert.equal(L.duracaoTotal(f.acoes), 4320, "a segunda mensagem sai no 3º dia");
  assert.equal(f.respeitar_horario, true);
  assert.equal(L.canalDaReceita(L.MODELOS.find(m => m.id === "followup_orcamento")), "codewords");
  const loja = L.aplicarModelo("followup_orcamento", BASE, { ...VOCAB_ODONTO, vertical: "loja" });
  assert.match(loja.acoes[1].texto, /sobre a proposta/);
  assert.doesNotMatch(loja.acoes[3].texto, /horário reservado/);
  assert.match(loja.nome, /proposta/);
  const fal = L.aplicarModelo("faltou_remarcar", BASE, VOCAB_ODONTO);
  assert.equal(fal.gatilho, "apos_data");
  assert.deepEqual(fal.config, { campo: "consulta", horas: 2 });
  assert.deepEqual(fal.condicoes, [{ campo: "estagio_id", op: "igual", valor: U(15) }], "etapa Faltou pelo marco");
  assert.deepEqual(L.aplicarModelo("faltou_remarcar", { funis: [{ id: U(1), padrao: true, estagios: [] }] }).condicoes, [{ campo: "estagio_id", op: "igual", valor: "" }], "sem a etapa: a pessoa escolhe");
  assert.equal(L.validar(L.aplicarModelo("faltou_remarcar", { funis: [{ id: U(1), padrao: true, estagios: [] }] })).ok, false);
  assert.match(L.aplicarModelo("faltou_remarcar", BASE, { ...VOCAB_ODONTO, vertical: "oficina" }).acoes[0].texto, /visita de hoje/);
  const pos = L.aplicarModelo("pos_atendimento", BASE, VOCAB_ODONTO);
  assert.equal(pos.gatilho, "apos_data");
  assert.equal(pos.config.horas, 24);
  assert.deepEqual(pos.condicoes, [{ campo: "estagio_id", op: "diferente", valor: U(15) }]);
  assert.deepEqual(L.aplicarModelo("pos_atendimento", { funis: [{ id: U(1), padrao: true, estagios: [] }] }).condicoes, [], "condição opcional some se a etapa não existe");
  const lead = L.aplicarModelo("lead_anuncio", BASE, VOCAB_ODONTO);
  assert.deepEqual(lead.condicoes, [{ campo: "origem", op: "igual", valor: "anuncio" }]);
  assert.deepEqual(lead.acoes.map(a => a.tipo), ["notificar", "esperar", "criar_tarefa"]);
  assert.equal(lead.acoes[1].minutos, 15);
  assert.equal(lead.acoes[1].cancelar_se_cliente_responder, false);
  const rea = L.aplicarModelo("reativar_30_dias", BASE, VOCAB_ODONTO);
  assert.equal(rea.gatilho, "tempo_no_estagio");
  assert.equal(rea.config.horas, 720);
  const cl = L.aplicarModelo("ia_classificar_etapa", BASE, VOCAB_ODONTO);
  assert.deepEqual(cl.acoes, [{ tipo: "ia_decidir", tarefa: "classificar_etapa" }]);
  assert.deepEqual(cl.condicoes, [{ campo: "estagio_id", op: "igual", valor: U(11) }], "só na primeira etapa (poupa a cota)");
  const res = L.aplicarModelo("ia_resumo_conversa", BASE, VOCAB_ODONTO);
  assert.equal(res.gatilho, "conversa_resolvida");
  assert.deepEqual(res.acoes, [{ tipo: "ia_decidir", tarefa: "resumir_nota" }]);
  assert.ok(L.usaIA(L.MODELOS.find(m => m.id === "ia_resumo_conversa")) && L.temIA(res));
  assert.ok(L.ehSequencia(L.MODELOS.find(m => m.id === "lead_anuncio")) && !L.ehSequencia(L.MODELOS.find(m => m.id === "preco")));
});

test("receitas: selo do canal (CodeWords × Meta), verticais e categorias", () => {
  const canal = id => L.canalDaReceita(L.MODELOS.find(m => m.id === id));
  assert.equal(canal("lembrete_consulta_texto"), "codewords");
  assert.equal(canal("confirmacao_agendamento"), "codewords");
  assert.equal(canal("lembrete_consulta"), "meta");
  assert.equal(canal("sem_resposta"), null);
  assert.equal(canal("ia_classificar_etapa"), null);
  // toda receita que manda texto livre é WhatsApp; as de IA são «ia»; sem_resposta/tarefas são «equipe»
  for (const m of L.MODELOS) {
    if (L.canalDaReceita(m)) assert.equal(m.categoria, "whatsapp", m.id);
    if (L.usaIA(m)) assert.equal(m.categoria, "ia", m.id);
  }
  assert.deepEqual(L.CATEGORIAS_MODELO.map(c => c[0]), ["todas", "whatsapp", "equipe", "ia"]);
  // odonto: faltou aparece; loja: não
  assert.ok(L.modelosDaVertical("odonto").some(m => m.id === "faltou_remarcar"));
  assert.ok(!L.modelosDaVertical("loja").some(m => m.id === "faltou_remarcar"));
  // «Recomendado para…» só em destaque; nunca mais de 4 por vertical
  for (const v of ["odonto", "oficina", "loja"]) {
    const sel = L.modelosDaVertical(v).filter(m => L.seloModelo(m, v));
    assert.ok(sel.length >= 2 && sel.length <= 4, `${v}: ${sel.length} destaques`);
  }
});

test("normalizarSimulacao: lê o formato do servidor de forma tolerante e nunca derruba a tela", () => {
  const a = L.aplicarModelo("followup_orcamento", BASE, VOCAB_ODONTO);
  const s = L.normalizarSimulacao({ total: 2, alvos: [
    { id: 801, titulo: "Mariana", detalhe: "Aparelho", link: "#/crm/negocio/801", acoes: [{ tipo: "enviar_mensagem", descricao: "Enviaria a mensagem", resultado: "faria" }, { descricao: "Esperaria 1 dia", resultado: "espera" }, "texto solto"] },
    { titulo: "Bianca", acoes: [{ tipo: "enviar_mensagem", resultado: "pulado", motivo: "contato pediu para não receber" }, { tipo: "criar_tarefa", status: "erro", detalhe: "sem dono" }] },
  ], avisos: ["simulação"] }, a, BASE, VOCAB_ODONTO);
  assert.equal(s.total, 2);
  assert.equal(s.alvos.length, 2);
  assert.equal(s.alvos[0].link, "#/crm/negocio/801");
  assert.deepEqual(s.alvos[0].passos.map(p => p.estado), ["faria", "espera", "faria"]);
  assert.deepEqual(s.alvos[1].passos.map(p => [p.estado, p.motivo]), [["pularia", "contato pediu para não receber"], ["erro", "sem dono"]]);
  assert.equal(s.alvos[1].passos[0].rotulo, "Enviar mensagem");
  assert.deepEqual(s.avisos, ["simulação"]);
  assert.equal(s.plano.length, a.acoes.length);
  assert.equal(s.plano[1].quando, "Depois de 1 dia");
  // link de fora nunca vira href
  assert.equal(L.normalizarSimulacao({ alvos: [{ titulo: "x", link: "https://ruim.example" }, { titulo: "y", link: "javascript:alert(1)" }] }, a, BASE).alvos.map(x => x.link).join(""), "");
  // formatos alternativos e vazios
  assert.equal(L.normalizarSimulacao({ itens: [{ nome: "n", passos: ["a"] }] }, a, BASE).alvos[0].passos[0].rotulo, "a");
  assert.equal(L.normalizarSimulacao({}, a, BASE).total, 0);
  assert.equal(L.normalizarSimulacao(null, a, BASE).alvos.length, 0);
  assert.equal(L.normalizarSimulacao({ total: 0, motivo: "Ninguém na etapa agora.", por_evento: true }, a, BASE).motivo, "Ninguém na etapa agora.");
  assert.equal(L.normalizarSimulacao({ total: 500, alvos: Array.from({ length: 80 }, (_, i) => ({ titulo: `a${i}` })) }, a, BASE).alvos.length, 25, "no máximo 25 alvos na tela");
});

test("normalizarSimulacao: formato REAL do servidor (amostra com passos, casa_gatilho, passa_condicoes, erro, parou, aviso)", () => {
  const a = L.aplicarModelo("followup_orcamento", BASE, VOCAB_ODONTO);
  const s = L.normalizarSimulacao({ ok: true, automacao: {}, tamanho_amostra: 5, aviso: "Só 1 exemplo.", amostra: [
    { rotulo: "Mariana Costa", negocio_id: 801, contato_id: 501, link: "#/crm/negocio/801", casa_gatilho: true, passa_condicoes: true, erro: null, parou: false, passos: [
      { n: 0, tipo: "esperar", texto: "esperaria 1 dia", pulado: false, depois_min: 0 },
      { n: 1, tipo: "enviar_mensagem", texto: "mensagem na fila para Mariana", pulado: false, depois_min: 1440 },
      { n: 2, tipo: "enviar_mensagem", texto: "mensagem pulada: contato pediu para não receber", pulado: true, depois_min: 1440 }] },
    { rotulo: "Lucas", negocio_id: 804, link: "#/crm/negocio/804", casa_gatilho: true, passa_condicoes: false, passos: [] },
    { rotulo: "Ana", conversa_id: 9, link: "#/conversas/9", casa_gatilho: false, passa_condicoes: true, passos: [] },
    { rotulo: "Beto", negocio_id: 5, casa_gatilho: true, passa_condicoes: true, erro: "o modelo não existe", parou: true, passos: [{ n: 0, tipo: "parar", texto: "sequência parada", pulado: false, depois_min: 0 }] },
  ] }, a, BASE, VOCAB_ODONTO);
  assert.equal(s.ehAmostra, true);
  assert.equal(s.alvos.length, 4);
  assert.equal(s.total, 4);
  assert.deepEqual(s.avisos, ["Só 1 exemplo."]);
  assert.equal(s.alvos[0].titulo, "Mariana Costa");
  assert.equal(s.alvos[0].link, "#/crm/negocio/801");
  assert.deepEqual(s.alvos[0].passos.map(p => p.estado), ["espera", "faria", "pularia"], "«esperar» vira «esperaria»; pulado vira «pularia»");
  assert.deepEqual(s.alvos[0].passos.map(p => p.quando), ["", "depois de 1 dia", "depois de 1 dia"]);
  assert.equal(s.alvos[0].passos[1].rotulo, "mensagem na fila para Mariana");
  assert.equal(s.alvos[0].ignorado, false);
  assert.equal(s.alvos[1].ignorado, true);
  assert.match(s.alvos[1].motivoIgnorado, /não passa nas condições/);
  assert.match(s.alvos[2].motivoIgnorado, /não bate com o gatilho/);
  assert.equal(s.alvos[3].erro, "o modelo não existe");
  assert.equal(s.alvos[3].parou, true);
  assert.equal(s.plano.length, a.acoes.length);
  // vazio: só o aviso do servidor
  const v = L.normalizarSimulacao({ ok: true, amostra: [], tamanho_amostra: 5, aviso: "Nenhum exemplo encontrado agora para testar: não há registro que o gatilho pegaria." }, a, BASE);
  assert.equal(v.ehAmostra, true);
  assert.equal(v.alvos.length, 0);
  assert.equal(v.avisos.length, 1);
});

test("ondeDoHint: o hint do servidor aponta o bloco e o item certos na tela", () => {
  const o = (h, onde, indice = null) => assert.deepEqual(L.ondeDoHint(h), { onde, indice }, h);
  o("dê um nome à automação", "nome");
  o("o nome pode ter até 80 caracteres", "nome");
  o("escolha o gatilho em «Quando»", "quando");
  o("escolha o horário em «Quando» (de 00:00 a 23:59)", "quando");
  o("escolha pelo menos um dia da semana", "quando");
  o("os dias da semana vão de 0 (domingo) a 6 (sábado)", "quando");
  o("o tempo depois da data vai de 1 a 720 horas", "quando");
  o("a antecedência vai de 1 a 72 horas", "quando");
  o("o tempo sem resposta vai de 5 a 1440 minutos", "quando");
  o("use até 20 palavras", "quando");
  o("condição 3: preencha o valor", "se", 2);
  o("use até 10 condições", "se");
  o("as condições estão em formato inválido", "se");
  o("ação 1: escolha a etapa", "entao", 0);
  o("ação 6: use até 5 esperas", "entao", 5);
  o("ação 2: depois de esperar, acrescente outra ação", "entao", 1);
  o("use até 10 ações", "entao");
  o("acrescente pelo menos uma ação em «Então»", "entao");
  o("dados da automação inválidos", null);
  o("", null);
  o(null, null);
});

test("IA desligada (sem chave): iaDesligada lê as duas formas do servidor e os avisos aparecem nas receitas, no passo e na paleta", () => {
  assert.equal(L.iaDesligada({ ia: { disponivel: false } }), true, "nx_automacoes_listar → ia.disponivel");
  assert.equal(L.iaDesligada({ base: { ia: { ligada: false } } }), true, "base de Conversas → ia.ligada");
  assert.equal(L.iaDesligada({ ia: { disponivel: true, usadas: 3, limite: 50 } }), false);
  assert.equal(L.iaDesligada({ ia: { ligada: true } }), false);
  assert.equal(L.iaDesligada({}), false, "sem a informação: nenhum aviso falso");
  assert.equal(L.iaDesligada(null), false);
  assert.match(L.AVISO_IA_DESLIGADA, /pulado/);
  const ed = lerApp("auto-editor.js"), lista = lerApp("automacoes.js");
  assert.match(ed, /const iaOff = L\.iaDesligada\(dados\)/);
  assert.match(ed, /if \(iaOff && L\.temIA\(auto\)\) bloqs\.push\(L\.AVISO_IA_DESLIGADA\)/, "aviso lateral do editor");
  assert.match(ed, /iaOff && def && def\.ia \? h\("p", \{ class: "aviso aviso-aten au-passo-ia-off" \}/, "aviso no próprio passo de IA");
  assert.match(ed, /IA ainda desligada: o passo seria pulado/, "tile da paleta");
  assert.match(lista, /iaOff && L\.usaIA\(m\)/, "receitas de IA avisam");
  assert.match(lista, /const desligada = L\.iaDesligada\(dados\)/, "o cartão «Criar com IA» usa a mesma regra");
});

test("erroAutomacao: o timeout do banco (57014) em Testar/salvar não fala de «período» nem «itens»", () => {
  assert.equal(L.erroAutomacao({ codigo: "tempo_esgotado" }, "Operação grande demais; tente um período menor ou menos itens de uma vez."),
    "O servidor demorou a responder. Tente de novo em instantes.");
  assert.equal(L.erroAutomacao({ codigo: "sem_permissao" }, "padrão"), "padrão");
  assert.equal(L.erroAutomacao(null, "padrão"), "padrão");
  assert.match(lerApp("auto-editor.js"), /L\.erroAutomacao\(erro, ctx\.api\.mensagemErro\(erro\)\)/, "Testar");
  assert.match(lerApp("auto-editor.js"), /const msg = L\.erroAutomacao\(e, ctx\.api\.mensagemErro\(e\)\)/, "salvar");
});

test("Criar com IA: o texto digitado e a montagem da IA não passam para outro cliente nem outra pessoa (esquecerIA / conferirDonoIA)", () => {
  const a = lerApp("automacoes.js");
  assert.match(a, /function esquecerIA\(\) \{ textoIA = ""; rascunhoIA = null; donoIA = ""; \}/);
  assert.match(a, /const dono = `\$\{ctx\.cliente \? ctx\.cliente\.id : "-"\}\|\$\{ctx\.sessao && ctx\.sessao\.conta/, "o dono é cliente + conta");
  assert.match(a, /if \(donoIA !== dono\) \{ esquecerIA\(\); donoIA = dono; \}/);
  assert.match(a, /export async function montar\(ctx\) \{[\s\S]*?conferirDonoIA\(ctx\);/, "montar confere o dono antes de usar o texto");
  assert.match(a, /export function desmontar\(\) \{[\s\S]*?esquecerIA\(\);/, "sair do módulo / trocar de empresa / sair da conta zera");
});

test("execuções: situação, passo, e códigos técnicos viram português", () => {
  assert.equal(L.situacaoExecucao({ ok: true, detalhe: "Tarefa criada" }), "ok");
  assert.equal(L.situacaoExecucao({ ok: false, detalhe: "x" }), "erro");
  assert.equal(L.situacaoExecucao({ ok: true, detalhe: "Pulada: contato pediu para não receber" }), "pulado");
  assert.equal(L.situacaoExecucao({ ok: true, detalhe: "mensagem não enviada (fora da janela)" }), "pulado");
  assert.equal(L.situacaoExecucao({ ok: false, status: "pulado" }), "pulado", "o status do servidor manda");
  assert.equal(L.situacaoExecucao(null), "erro");
  assert.equal(L.passoDaExecucao({ acao: "enviar_mensagem", passo: 2 }), "Passo 2 · Enviar mensagem");
  assert.equal(L.passoDaExecucao({ acao: "esperar" }), "Esperar um tempo");
  assert.equal(L.passoDaExecucao({ passo: 3 }), "Passo 3");   // sem total_passos
  assert.equal(L.passoDaExecucao({}), "");
  const traduz = c => ({ fora_da_janela: "Mais de 24 h desde a última mensagem do cliente.", codewords_sem_aparelho: "Este número ainda não foi pareado." })[c] || `Não deu certo agora (${c})`;
  assert.equal(L.detalheLegivel("fora_da_janela", traduz), "Mais de 24 h desde a última mensagem do cliente");
  assert.equal(L.detalheLegivel("erro: codewords_sem_aparelho", traduz), "erro: Este número ainda não foi pareado");
  assert.equal(L.detalheLegivel("codigo_desconhecido_xyz", traduz), "codigo_desconhecido_xyz");
  assert.equal(L.detalheLegivel("Tarefa criada para Ana", traduz), "Tarefa criada para Ana");
  assert.equal(L.detalheLegivel("", traduz), "");
  assert.equal(L.detalheLegivel("fora_da_janela"), "fora_da_janela");
  assert.deepEqual(L.SITUACOES_EXECUCAO.map(s => s[0]), ["todas", "ok", "espera", "pulado", "erro"]);
  // estado do servidor (nx_automacao_execucoes): concluida | esperando | aguardando_ia | cancelada | parada | erro
  assert.equal(L.situacaoExecucao({ ok: true, estado: "concluida", detalhe: "Tarefa criada" }), "ok");
  assert.equal(L.situacaoExecucao({ ok: true, estado: "esperando" }), "espera");
  assert.equal(L.situacaoExecucao({ ok: true, estado: "aguardando_ia" }), "espera");
  assert.equal(L.situacaoExecucao({ ok: true, estado: "cancelada" }), "pulado");
  assert.equal(L.situacaoExecucao({ ok: true, estado: "parada" }), "pulado");
  assert.equal(L.situacaoExecucao({ ok: false, estado: "erro" }), "erro");
  assert.equal(L.estadoExecucaoTexto({ estado: "esperando" }), "Esperando para continuar");
  assert.equal(L.estadoExecucaoTexto({ estado: "aguardando_ia" }), "Aguardando a IA decidir");
  // achado T09: «cancelada» não é sempre «o cliente respondeu»; a frase segue o motivo que o servidor grava no detalhe
  assert.match(L.estadoExecucaoTexto({ estado: "cancelada", detalhe: "Nota criada · cancelada: o cliente respondeu" }), /cliente respondeu/);
  assert.equal(L.estadoExecucaoTexto({ estado: "cancelada", detalhe: "Nota criada · cancelada: a automação foi desligada" }), "Cancelada: a automação foi desligada");
  assert.equal(L.estadoExecucaoTexto({ estado: "cancelada", detalhe: "x · cancelada: o negócio mudou de etapa" }), "Cancelada: o negócio mudou de etapa");
  assert.equal(L.estadoExecucaoTexto({ estado: "cancelada", detalhe: "x · cancelada pela equipe" }), "Cancelada pela equipe");
  assert.equal(L.estadoExecucaoTexto({ estado: "cancelada", detalhe: "a · cancelada: o cliente respondeu · cancelada pela equipe" }), "Cancelada pela equipe", "vale o último motivo gravado");
  assert.equal(L.estadoExecucaoTexto({ estado: "cancelada" }), "Cancelada", "sem motivo no detalhe: frase neutra, nunca «o cliente respondeu»");
  assert.doesNotMatch(L.estadoExecucaoTexto({ estado: "cancelada", detalhe: "texto longo cortado pelo servidor" }), /respondeu/);
  assert.equal(L.estadoExecucaoTexto({ estado: "concluida" }), "");
  assert.equal(L.estadoExecucaoTexto({}), "");
  assert.equal(L.passoDaExecucao({ passo: 2, total_passos: 5 }), "2 de 5 passos feitos");
  assert.equal(L.passoDaExecucao({ passo: 9, total_passos: 5 }), "5 de 5 passos feitos");
  assert.equal(L.passoDaExecucao({ passo: 1, total_passos: 1 }), "", "execução de um passo só não precisa de progresso");
});

test("erroDaIA: cota, chave, IA desligada, pedidos, rede e formato inválido → texto com orientação", () => {
  assert.equal(L.erroDaIA({ codigo: "ia_cota" }).tipo, "cota");
  assert.match(L.erroDaIA({ codigo: "ia_cota" }).texto, /receitas prontas/);
  assert.equal(L.erroDaIA({ codigo: "sem_chave" }).tipo, "chave");
  // o nx-ia manda {erro:"ia_indisponivel", detalhe:"sem_chave"}
  const k = L.erroDaIA({ codigo: "ia_indisponivel", detalhe: "sem_chave", detalhe_texto: "sem_chave" });
  assert.equal(k.tipo, "chave");
  assert.match(k.texto, /chave da Anthropic/);
  assert.match(k.texto, /equipe da Nexus/);
  assert.equal(L.erroDaIA({ codigo: "ia_indisponivel", detalhe_texto: "sem_sdk" }).tipo, "indisponivel");
  assert.equal(L.erroDaIA({ codigo: "ia_desligada" }).tipo, "desligada");
  assert.equal(L.erroDaIA({ codigo: "muitos_pedidos" }).tipo, "pedidos");
  assert.equal(L.erroDaIA({ codigo: "sem_conexao" }).tipo, "rede");
  assert.equal(L.erroDaIA({ codigo: "tempo_rede" }).tipo, "rede");
  assert.match(L.erroDaIA({ codigo: "tempo_rede" }).texto, /Nada foi salvo.*divida em duas/, "a espera esgotou: orienta sem culpar a internet");
  assert.equal(L.erroDaIA({ codigo: "sem_conexao" }).titulo, "A conexão falhou");
  assert.equal(L.PRAZO_MONTAR_IA_MS, 130_000);
  assert.equal(L.erroDaIA({ codigo: "ia_resposta_invalida" }).tipo, "indisponivel");
  assert.match(L.erroDaIA({ codigo: "automacao_invalida", hint: "ação 2: escolha a etapa" }).texto, /ação 2: escolha a etapa/);
  // o nx-ia manda o motivo em .detalhe e uma mensagem pronta em português em .resposta.mensagem
  const conf = L.erroDaIA({ codigo: "automacao_invalida", detalhe_texto: "ação 2: escolha a etapa", detalhe: "ação 2: escolha a etapa", resposta: { mensagem: "A IA montou uma automação que não passou na conferência (ação 2: escolha a etapa)." } });
  assert.equal(conf.tipo, "invalida");
  assert.match(conf.texto, /não passou na conferência/);
  assert.match(L.erroDaIA({ codigo: "automacao_invalida", detalhe_texto: "ação 2: escolha a etapa" }).texto, /Problema: ação 2: escolha a etapa/);
  assert.equal(L.erroDaIA({ codigo: "ia_indisponivel", detalhe_texto: "recusa", resposta: { mensagem: "A IA recusou este pedido. Escreva de outro jeito e tente de novo." } }).texto, "A IA recusou este pedido. Escreva de outro jeito e tente de novo.");
  assert.equal(L.erroDaIA({ codigo: "dados_invalidos", detalhe_texto: "descricao" }).tipo, "invalida");
  assert.match(L.erroDaIA({ codigo: "dados_invalidos", detalhe_texto: "descricao" }).texto, /1500/);
  assert.equal(L.erroDaIA({ codigo: "qualquer", resposta: { mensagem: "Texto do servidor." } }, "padrão").texto, "Texto do servidor.");
  assert.equal(L.erroDaIA({ codigo: "qualquer" }, "Texto padrão").texto, "Texto padrão");
  assert.equal(L.erroDaIA(null).tipo, "outro");
});

/* ------------------------------------------------------------------ arquivos novos: regras do app e CSS */

test("arquivos novos da F7: sem import estático, sem innerHTML, sem hex, import() com ?v=, ordem do catálogo", () => {
  for (const f of ["auto-catalogo.js", "auto-logica.js", "auto-pecas.js", "auto-editor.js", "automacoes.js"]) {
    const t = lerApp(f);
    assert.ok(!/^\s*import\s[^(]/m.test(t), `${f}: import estático`);
    assert.ok(!/^\s*export\s+[^;]*\sfrom\s/m.test(t), `${f}: reexport estático`);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(t), `${f}: HTML cru`);
    assert.ok(!/#[0-9a-fA-F]{6}\b/.test(t), `${f}: hex de cor`);
    assert.ok(!/\beval\(|new Function\(/.test(t), `${f}: eval`);
    for (const m of t.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\bimport\(\s*(`[^`]*`|[^)]*)/g)) assert.match(m[1].trim(), /^`[^`]*\?v=\$\{[^`]*`$/, `${f}: import(${m[1]}) sem ?v=`);
  }
  assert.ok(!/ui\.js|api\.js|tema\.js|rotas\.js|pulso\.js|vocab\.js/.test(lerApp("auto-editor.js") + lerApp("auto-pecas.js")), "editor e peças usam o ctx, não o shell");
  assert.match(lerApp("automacoes.js"), /import\(`\.\/auto-editor\.js\?v=\$\{v\}`\)/, "o editor entra por import() com versão");
  assert.match(lerApp("auto-logica.js"), /await import\(`\.\/auto-catalogo\.js\?v=\$\{encodeURIComponent\(_v\)\}`\)/, "o catálogo entra com a MESMA versão do auto-logica");
  assert.ok(!/\bDeno\b|document\.|window\./.test(lerApp("auto-catalogo.js")), "o catálogo é puro (o servidor também o usa)");
});

test("CSS das automações: sem hex, [hidden] forte, minmax(0,1fr), regras mobile e alvos de toque", () => {
  const css = lerApp("automacoes.css");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/:root[^{]*\{[^}]*\}/g, "")), "sem hex de cor");
  assert.ok(!/(^|[^(,\s])\s*\b1fr\b/.test(css.replace(/minmax\(0,\s*1fr\)/g, "")), "sem 1fr solto");
  assert.ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css));
  for (const sel of [".au-ia", ".au-chips", ".au-chip", ".au-tempo", ".au-passo", ".au-paleta", ".au-tile", ".au-teste", ".au-sim", ".au-esc", ".au-dur-outro", ".au-ex-filtro", ".au-modelo-selos", ".au-mini-tempo"])
    assert.ok(css.includes(sel + " ") || css.includes(sel + ",") || css.includes(sel + "{") || css.includes(sel + ":") || css.includes(sel + "."), `faltou CSS de ${sel}`);
  const movel = css.slice(css.indexOf("@media (max-width: 760px) {", css.indexOf("responsivo da nova versão")));
  assert.match(movel, /\.au-paleta-grade \{ grid-template-columns: minmax\(0, 1fr\); \}/, "paleta em 1 coluna no celular");
  assert.match(movel, /\.au-passo \{ grid-template-columns: 26px minmax\(0, 1fr\)/, "linha do tempo estreita no celular");
  assert.match(css, /@media \(max-width: 760px\), \(pointer: coarse\) \{\s*\.au-chip \{ min-height: 44px; \}/, "chips com 44 px no toque");
  assert.match(css, /\.au-esc \{ grid-template-columns: minmax\(0, 1fr\); \}/, "cartões da IA em 1 coluna");
  // nenhum texto de classe usada pelo editor ficou sem estilo (as que mais importam)
  const ed = lerApp("auto-editor.js") + lerApp("automacoes.js");
  for (const cls of ["au-passo", "au-passo-quando", "au-paleta", "au-tile", "au-sim", "au-sim-alvo", "au-ia", "au-ia-res", "au-ia-ped", "au-chip", "au-ex-filtro", "au-item-erro", "au-mini-tempo", "au-modelo-selos", "au-ex-acoes"])
    assert.ok(ed.includes(cls) && css.includes("." + cls), `classe ${cls} usada e estilizada`);
});

/* ------------------------------------------------------------------ rascunho do editor (revisão R119) */

test("rascunho: chave por empresa + conta + automação; guardar e ler devolve a automação como estava na tela", () => {
  assert.equal(L.chaveRascunho("cli-1", "conta-9", U(7)), `nx-au-rasc:cli-1:conta-9:${U(7)}`);
  assert.equal(L.chaveRascunho("cli-1", "conta-9"), "nx-au-rasc:cli-1:conta-9:nova", "sem id = a automação ainda não salva");
  assert.notEqual(L.chaveRascunho("cli-1", "conta-9", "nova"), L.chaveRascunho("cli-2", "conta-9", "nova"), "outra empresa não lê");
  assert.notEqual(L.chaveRascunho("cli-1", "conta-9", "nova"), L.chaveRascunho("cli-1", "conta-8", "nova"), "outra pessoa não lê");
  // o que está na tela pode estar incompleto (passo sem título, condição sem valor): volta igual, sem «limpar»
  const naTela = { nome: "Lembrete", gatilho: "antes_da_data", config: { campo: "consulta", horas: 24 }, condicoes: [{ campo: "origem", op: "igual", valor: "" }],
    acoes: [{ tipo: "criar_tarefa", titulo: "" }, { tipo: "esperar", minutos: 60 }], respeitar_horario: true, ativo: false };
  const txt = L.empacotarRascunho(naTela, null, 1_700_000_000_000);
  const r = L.lerRascunho(txt);
  assert.deepEqual(r.auto, naTela);
  assert.equal(r.em, 1_700_000_000_000);
  assert.deepEqual([r.explicacao, r.avisos], ["", []]);
  r.auto.acoes.push({ tipo: "parar" });
  assert.equal(L.lerRascunho(txt).auto.acoes.length, 2, "cada leitura devolve uma cópia");
  // a montagem da IA leva a explicação e os avisos junto
  const ia = L.lerRascunho(L.empacotarRascunho(naTela, { explicacao: "Montei um lembrete.", avisos: ["Confira o horário", 7] }));
  assert.equal(ia.explicacao, "Montei um lembrete."); assert.deepEqual(ia.avisos, ["Confira o horário", "7"]);
});

test("rascunho: texto vazio, corrompido ou de um gatilho que não existe mais não é oferecido", () => {
  for (const ruim of [null, undefined, "", "{", "null", "[]", "42", JSON.stringify({ auto: null }), JSON.stringify({ auto: [] }),
    JSON.stringify({ auto: { gatilho: "gatilho_que_sumiu", acoes: [] } }),
    JSON.stringify({ auto: { gatilho: "tarefa_vencida", acoes: "x" } }),
    JSON.stringify({ auto: { gatilho: "tarefa_vencida", acoes: [null] } }),
    JSON.stringify({ auto: { gatilho: "tarefa_vencida", acoes: [{ titulo: "sem tipo" }] } }),
    JSON.stringify({ auto: { gatilho: "tarefa_vencida", condicoes: {}, acoes: [] } }),
    JSON.stringify({ auto: { gatilho: "tarefa_vencida", config: [], acoes: [] } })])
    assert.equal(L.lerRascunho(ruim), null, `deveria recusar: ${String(ruim).slice(0, 60)}`);
  assert.ok(L.lerRascunho(JSON.stringify({ auto: { gatilho: "tarefa_vencida" } })), "sem listas ainda é um rascunho válido (o editor completa)");
});

test("editor: edição pendente segura a atualização automática, o link do topo pergunta como o «Cancelar» e o rascunho é guardado a cada mudança", () => {
  const ed = lerApp("auto-editor.js"), tela = lerApp("automacoes.js");
  // uma régua só para «tem coisa sem salvar»
  assert.match(ed, /const temPendencia = \(\) => podeEditar && \(salvoJson !== null \? sujo\(\) : !!\(auto\.nome \|\| auto\.acoes\.length\)\);/);
  assert.match(ed, /if \(typeof ctx\.naoAtualizar === "function" && amb\.aoSair\) amb\.aoSair\(ctx\.naoAtualizar\(temPendencia\)\);/, "registra no shell e cancela ao sair da tela");
  // «Cancelar» e «‹ Automações» saem pelo mesmo caminho, com a mesma pergunta
  assert.match(ed, /async function sair\(\) \{[\s\S]*?titulo: "Sair sem salvar\?"[\s\S]*?titulo: "Descartar esta automação\?"[\s\S]*?apagarRascunho\(\);[\s\S]*?ctx\.navegar\("#\/automacoes"\);\s*\}/);
  assert.match(ed, /btCancelar\.addEventListener\("click", sair\);/);
  assert.match(ed, /linkVoltar\.addEventListener\("click", ev => \{\s*if \(ev\.defaultPrevented \|\| ev\.button !== 0 \|\| ev\.metaKey \|\| ev\.ctrlKey \|\| ev\.shiftKey \|\| ev\.altKey\) return;\s*ev\.preventDefault\(\);\s*sair\(\);/,
    "clique simples pergunta; Ctrl/⌘+clique segue abrindo outra aba");
  assert.doesNotMatch(ed, /h\("a", \{ class: "au-voltar", href: "#\/automacoes" \}, ui\.icone\("seta-esq"\), "Automações"\),\s*h\("div", \{ class: "au-ed-linha" \}/, "o link puro, sem guarda, saiu");
  // rascunho: grava em toda mudança, some ao salvar e ao descartar, e é oferecido ao abrir
  assert.match(ed, /pintarValidacao\(\);\s*guardarRascunho\(\);\s*\}/, "mudou() guarda o rascunho");
  assert.match(ed, /if \(temPendencia\(\)\) \{ rasc\.guardar\(idRasc, auto\); gravouRascunho = true; \}/);
  assert.match(ed, /salvoJson = JSON\.stringify\(L\.limpar\(salvo\)\);\s*if \(rasc\) rasc\.apagar\(idRasc\);/, "salvou: o rascunho some");
  assert.match(ed, /const idRasc = item \? item\.id : "nova";/);
  assert.match(ed, /"Recuperar rascunho"/); assert.match(ed, /"Descartar rascunho"/);
  assert.match(ed, /JSON\.stringify\(L\.limpar\(guardado\.auto\)\) !== JSON\.stringify\(L\.limpar\(auto\)\)/, "só oferece quando o rascunho difere do que está na tela");
  // o armazenamento fica no módulo da tela, por empresa + conta, sempre em try/catch
  assert.match(tela, /const chave = id => L\.chaveRascunho\(cli, conta, id\);/);
  assert.match(tela, /ler\(id\) \{ try \{ return L\.lerRascunho\(sessionStorage\.getItem\(chave\(id\)\)\); \} catch \{ return null; \} \}/);
  assert.match(tela, /guardar\(id, auto, extra\) \{ try \{ sessionStorage\.setItem\(chave\(id\), L\.empacotarRascunho\(auto, extra\)\); return true; \} catch \{ return false; \} \}/);
  assert.match(tela, /apagar\(id\) \{ try \{ sessionStorage\.removeItem\(chave\(id\)\); \} catch/);
  assert.doesNotMatch(ed + tela, /localStorage/, "rascunho de automação vive só na aba (sessionStorage)");
});

test("Criar com IA: a montagem fica guardada na aba e volta em #/automacoes/nova?ia=1 depois de recarregar; some ao salvar ou descartar", () => {
  const tela = lerApp("automacoes.js");
  assert.match(tela, /rascunhoIA = m;\s*rascunhosDe\(ctx\)\.guardar\("ia", m\.auto, \{ explicacao: m\.explicacao, avisos: m\.avisos \}\);[^\n]*\s*ctx\.navegar\("#\/automacoes\/nova\?ia=1"\);/);
  assert.match(tela, /if \(!rascunhoIA\) \{ const g = rascunhos\.ler\("ia"\); if \(g\) rascunhoIA = \{ auto: g\.auto, explicacao: g\.explicacao, avisos: g\.avisos \}; \}/);
  assert.match(tela, /limparRascunho: \(\) => \{ rascunhoIA = null; rascunhos\.apagar\("ia"\); \}/);
  assert.doesNotMatch(tela, /a página foi recarregada/, "recarregar não perde mais a montagem");
});

test("editor: trocar o funil no gatilho refaz a lista de etapas; «criar etiqueta ao salvar» só no passo «etiquetar»", () => {
  const ed = lerApp("auto-editor.js");
  assert.match(ed, /if \(f\.tipo === "funil" && \(\(L\.GATILHO\[auto\.gatilho\] \|\| \{\}\)\.campos \|\| \[\]\)\.some\(c => c\.filtraPor === f\.nome\)\) \{\s*pintarQuando\(\);/, "funil com etapa dependente: sempre redesenha");
  assert.ok(L.GATILHO.agendado.campos.some(c => c.filtraPor === "funil_id"), "o gatilho «Todo dia, num horário» é o caso");
  assert.match(ed, /const criaPeloNome = ac\.tipo === "etiquetar" && !v && !!ac\.etiqueta_nome;/);
});

test("execuções: «Cancelar» na linha em espera e «Cancelar todas as esperas» chamam nx_automacao_cancelar_espera depois de confirmar", () => {
  const ed = lerApp("auto-editor.js");
  assert.match(ed, /podeEditar && contagem\.espera > 0 \? h\("button", \{ type: "button", class: "bt bt-sec bt-p" \}, ui\.icone\("parar"\), "Cancelar todas as esperas"\)/, "só quem edita e só com espera");
  assert.match(ed, /podeEditar && sit === "espera" && x\.chave \? h\("button"/, "o botão da linha só nas que estão em espera");
  assert.match(ed, /async function cancelarEspera\(x, botao\) \{\s*const ok = await ui\.confirmar\([\s\S]*?if \(!ok\) return;[\s\S]*?ctx\.api\.rpcC\("nx_automacao_cancelar_espera", \{ p_id: item\.id, p_chave: x \? x\.chave : null \}\)/, "confirma antes; p_chave nulo = todas");
  // a RPC existe no banco com esses parâmetros e devolve quantas cancelou
  const sql = readFileSync(resolve(RAIZ, "supabase/migrations/20261001a_automacoes_ia.sql"), "utf8");
  assert.match(sql, /create or replace function public\.nx_automacao_cancelar_espera\(p_token text, p_cliente uuid, p_id uuid, p_chave text default null\)/);
  assert.match(sql, /return json_build_object\('ok', true, 'canceladas', v_n\);/);
});
