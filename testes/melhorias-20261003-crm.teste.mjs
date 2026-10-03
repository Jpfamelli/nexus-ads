/* Follow-up CRM/Agenda de 03/10/2026. Sem dependências, DOM ou serviços reais. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = nome => readFileSync(join(raiz, "..", "web", "app", nome), "utf8");
const L = await import("../web/app/crm-logica.js");
const A = await import("../web/app/agenda.js");
test("chaves de visões isolam empresa, conta e tela", () => {
  const a = L.chaveVisoesCRM("empresa 1", "conta 1", "kanban");
  assert.ok(a);
  assert.notEqual(a, L.chaveVisoesCRM("empresa 2", "conta 1", "kanban"));
  assert.notEqual(a, L.chaveVisoesCRM("empresa 1", "conta 2", "kanban"));
  assert.notEqual(a, L.chaveVisoesCRM("empresa 1", "conta 1", "contatos"));
  assert.equal(L.chaveVisoesCRM("", "conta 1", "kanban"), null);
  assert.equal(L.chaveVisoesCRM("empresa 1", "conta 1", "ads"), null);
});

test("nome da visão é normalizado, limitado e duplicata ignora acento/caixa", () => {
  const atual = [{ id: "v1", nome: "Minha visão" }];
  assert.deepEqual(L.validarNomeVisaoCRM("  Retornos   da semana ", atual), { ok: true, nome: "Retornos da semana" });
  assert.equal(L.validarNomeVisaoCRM("minha VISAO", atual).codigo, "nome_duplicado");
  assert.equal(L.validarNomeVisaoCRM("x", atual).codigo, "nome_invalido");
  assert.equal(L.validarNomeVisaoCRM("x".repeat(33), atual).codigo, "nome_invalido");
  assert.equal(L.validarNomeVisaoCRM("MINHA VISAO", atual, "v1").ok, true);
});

test("leitura de visões descarta estrutura não permitida e intervalos inválidos", () => {
  const visoes = L.normalizarVisoesCRM([
    { id: "visao-1", nome: "  Parados ", atualizado_em: "ontem", dados: { funil: "f-1", todosFechados: true, segredo: "x", filtro: {
      busca: "  Ana  ", dono: "eu", etiquetas: { op: "desconhecida", ids: ["tag-1", "tag-1", "id ruim"] },
      origem: ["whatsapp", "nao-existe"], valor_min: "900", valor_max: "50", parado_dias: 7,
      criado_de: "2026-10-20", criado_ate: "2026-10-02", campo_injetado: "x",
    } } },
    { id: "visao-2", nome: "parados", dados: { funil: "f-1", filtro: {} } },
    { id: "id inválido", nome: "Inválida", dados: { funil: "f-1", filtro: {} } },
    { id: "visao-3", nome: "Sem funil", dados: { funil: "", filtro: {} } },
  ], "kanban");
  assert.equal(visoes.length, 1);
  assert.equal(visoes[0].nome, "Parados");
  assert.equal(visoes[0].atualizado_em, 0);
  assert.deepEqual(visoes[0].dados, { funil: "f-1", todosFechados: true, filtro: {
    busca: "Ana", dono: "eu", etiquetas: { op: "alguma", ids: ["tag-1"] }, origem: ["whatsapp"], parado_dias: 7,
  } });
});

test("visão de contatos mantém ordenação válida e recusa ordenação desconhecida", () => {
  const base = [{ id: "v1", nome: "Contato", dados: { ordem: "ultimo_contato", filtro: { tem_negocio_aberto: false, optin_marketing: false } } }];
  assert.equal(L.normalizarVisoesCRM(base, "contatos")[0].dados.ordem, "ultimo_contato");
  const adulterada = [{ ...base[0], dados: { ...base[0].dados, ordem: "campo_sql" } }];
  assert.equal(L.normalizarVisoesCRM(adulterada, "contatos")[0].dados.ordem, "recentes");
  assert.deepEqual(L.normalizarVisoesCRM(base, "kanban"), []);
});

test("salvar cria com id determinístico e atualizar conserva o id", () => {
  const dados = { funil: "f1", filtro: { busca: " retorno " } };
  const criada = L.salvarVisaoCRM([], "kanban", { nome: "Retornos", dados }, { agora: 42, idNovo: "view-1" });
  assert.equal(criada.codigo, "criada");
  assert.equal(criada.visao.id, "view-1");
  assert.equal(criada.visao.atualizado_em, 42);
  const atualizada = L.salvarVisaoCRM(criada.visoes, "kanban", { id: "view-1", nome: "Retornos da manhã", dados: { funil: "f2", filtro: {} } }, { agora: 43 });
  assert.equal(atualizada.codigo, "atualizada");
  assert.equal(atualizada.visao.id, "view-1");
  assert.equal(atualizada.visao.dados.funil, "f2");
});

test("duplicatas, conteúdo inválido, id inseguro e limite de 12 bloqueiam gravação", () => {
  const primeira = L.salvarVisaoCRM([], "kanban", { nome: "Minha visão", dados: { funil: "f1", filtro: {} } }, { idNovo: "v1" });
  assert.equal(L.salvarVisaoCRM(primeira.visoes, "kanban", { nome: "MINHA VISAO", dados: { funil: "f1", filtro: {} } }, { idNovo: "v2" }).codigo, "nome_duplicado");
  assert.equal(L.salvarVisaoCRM([], "kanban", { nome: "Inválida", dados: { filtro: {} } }).codigo, "dados_invalidos");
  assert.equal(L.salvarVisaoCRM([], "kanban", { nome: "ID ruim", dados: { funil: "f1", filtro: {} } }, { idNovo: "<img>" }).codigo, "id_invalido");
  const doze = Array.from({ length: 12 }, (_, i) => ({ id: `v${i}`, nome: `Visão ${i}`, dados: { funil: "f1", filtro: {} } }));
  assert.equal(L.normalizarVisoesCRM([...doze, { id: "v12", nome: "13", dados: { funil: "f1", filtro: {} } }], "kanban").length, 12);
  assert.equal(L.salvarVisaoCRM(doze, "kanban", { nome: "Décima terceira", dados: { funil: "f1", filtro: {} } }).codigo, "limite");
  assert.equal(L.salvarVisaoCRM(doze, "kanban", { id: "v0", nome: "Renovada", dados: { funil: "f1", filtro: {} } }).codigo, "atualizada");
});

test("aplicar visão devolve cópia independente; excluir não altera as demais", () => {
  const originais = [
    { id: "v1", nome: "Um", dados: { funil: "f1", filtro: { etiquetas: { ids: ["e1"] } } } },
    { id: "v2", nome: "Dois", dados: { funil: "f2", filtro: {} } },
  ];
  const aplicada = L.aplicarVisaoCRM(originais, "kanban", "v1");
  aplicada.dados.filtro.etiquetas.ids.push("e2");
  assert.deepEqual(originais[0].dados.filtro.etiquetas.ids, ["e1"]);
  const restantes = L.excluirVisaoCRM(originais, "kanban", "v1");
  assert.deepEqual(restantes.map(v => v.id), ["v2"]);
  assert.equal(L.aplicarVisaoCRM(restantes, "kanban", "v1"), null);
  assert.deepEqual(originais.map(v => v.id), ["v1", "v2"]);
});

test("indicador de visão salva some quando o estado filtrado mudou", () => {
  const salvo = L.salvarVisaoCRM([], "contatos", { nome: "Ativos", dados: { ordem: "nome", filtro: { busca: "mar" } } }, { idNovo: "v1" });
  assert.equal(L.visaoCorrespondenteCRM(salvo.visoes, "contatos", { ordem: "nome", filtro: { busca: "mar" } }), "v1");
  assert.equal(L.visaoCorrespondenteCRM(salvo.visoes, "contatos", { ordem: "nome", filtro: { busca: "ana" } }), "");
});

test("preferências da Agenda isolam cliente/conta e corrigem valores locais inválidos", () => {
  const chave = A.chavePreferenciasAgenda("clinica A", "conta 1");
  assert.ok(chave);
  assert.notEqual(chave, A.chavePreferenciasAgenda("clinica B", "conta 1"));
  assert.notEqual(chave, A.chavePreferenciasAgenda("clinica A", "conta 2"));
  assert.equal(A.chavePreferenciasAgenda("", "conta 1"), null);
  assert.deepEqual(A.normalizarPreferenciasAgenda({ data: "2026-02-30", modo: "mês", agrupar: "qualquer" }, "2026-10-03"),
    { data: "2026-10-03", modo: "semana", agrupar: "responsavel" });
  assert.deepEqual(A.normalizarPreferenciasAgenda({ data: "2026-10-02", modo: "dia", agrupar: "juntos" }),
    { data: "2026-10-02", modo: "dia", agrupar: "juntos" });
});

test("atalhos explícitos da Agenda navegam sem capturar Ctrl/Meta/Shift", () => {
  assert.equal(A.acaoTeclaAgenda({ key: "ArrowLeft", altKey: true }), "anterior");
  assert.equal(A.acaoTeclaAgenda({ key: "ArrowRight", altKey: true }), "proximo");
  assert.equal(A.acaoTeclaAgenda({ key: "t", altKey: true }), "hoje");
  for (const ev of [
    { key: "ArrowLeft" }, { key: "x", altKey: true }, { key: "t", altKey: true, ctrlKey: true },
    { key: "t", altKey: true, metaKey: true }, { key: "t", altKey: true, shiftKey: true },
  ]) assert.equal(A.acaoTeclaAgenda(ev), null);
  assert.equal(A.acaoTeclaAgenda(null), null);
});

test("abas dos dias na Agenda têm navegação por setas/Home/End com retorno circular", () => {
  assert.equal(A.indiceAbaAgendaTecla("ArrowRight", 6, 7), 0);
  assert.equal(A.indiceAbaAgendaTecla("ArrowLeft", 0, 7), 6);
  assert.equal(A.indiceAbaAgendaTecla("ArrowDown", 2, 7), 3);
  assert.equal(A.indiceAbaAgendaTecla("ArrowUp", 2, 7), 1);
  assert.equal(A.indiceAbaAgendaTecla("Home", 4, 7), 0);
  assert.equal(A.indiceAbaAgendaTecla("End", 1, 7), 6);
  assert.equal(A.indiceAbaAgendaTecla("Tab", 1, 7), null);
  assert.equal(A.indiceAbaAgendaTecla("ArrowRight", 0, 0), null);
});

test("CRM liga visões salvas às duas telas e apresenta filtro rápido com estado anunciado", () => {
  const board = ler("crm-kanban.js"), contatos = ler("crm-listas.js"), vistas = ler("crm-visoes.js");
  assert.match(board, /k\.mod\("visoes"\)/);
  assert.match(contatos, /k\.mod\("visoes"\)/);
  assert.match(vistas, /Fica salva somente neste dispositivo, para esta empresa e sua conta/i);
  assert.match(vistas, /12 visões salvas/);
  assert.match(vistas, /Isso remove apenas o atalho salvo neste dispositivo/);
  assert.match(board, /Meus negócios/);
  assert.match(board, /Parados · 7 dias\+/);
  assert.match(board, /aria-pressed/);
});

test("filtros recusam intervalos contraditórios e permitem limpar qualquer quantidade ativa", () => {
  const board = ler("crm-kanban.js"), contatos = ler("crm-listas.js");
  assert.match(board, /mn > mx/);
  assert.match(board, /de\.value > ate\.value/);
  assert.match(board, /if \(n > 0\).*?Limpar filtros/s);
  assert.match(contatos, /de\.value > ate\.value/);
  assert.match(contatos, /if \(n\).*?Limpar filtros/s);
});

test("busca de contatos oferece atalhos / e Escape e remove o listener ao sair", () => {
  const contatos = ler("crm-listas.js");
  assert.match(contatos, /ev\.key === "\/"[\s\S]*?busca\.focus\(\)/);
  assert.match(contatos, /ev\.key === "Escape"[\s\S]*?busca\.value = ""/);
  assert.match(contatos, /document\.removeEventListener\("keydown", aoTeclaBusca\)/);
});

test("Agenda persiste preferências, oferece atualização manual honesta e preserva quadro em falha", () => {
  const agenda = ler("agenda.js"), css = ler("agenda.css");
  assert.match(agenda, /localStorage\.getItem\(chavePreferencias\)/);
  assert.match(agenda, /localStorage\.setItem\(chavePreferencias/);
  assert.match(agenda, /agenda-atualizar/);
  assert.match(agenda, /Sem conexão · mostrando a última agenda guardada/);
  assert.match(agenda, /a agenda exibida foi mantida/);
  assert.match(agenda, /document\.removeEventListener\("keydown", aoTeclaAgenda\)/);
  assert.match(agenda, /indiceAbaAgendaTecla\(ev\.key, i, abas\.length\)/);
  assert.match(css, /\.agenda-faixa \[role="tab"\]:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

