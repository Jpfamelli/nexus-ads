/* Plano «50+ melhorias» (04/10/2026) — frente G: Automações, Configurações e Admin.
   Rodar: node --test testes/plano50-automacoes.teste.mjs
   Testes de COMPORTAMENTO com um DOM mínimo (o mesmo espírito do app.teste.mjs): a lista de automações monta de verdade
   (automacoes.js + auto-logica + auto-pecas + ui.js reais), o diagrama responde a clique/teclado, o gráfico por dia tem
   tabela, a confirmação ao ligar aparece. A lógica pura (taxa, execuções por dia, nós do diagrama, busca, comandos,
   histórico de conexão, resumo do admin) é conferida direto. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import * as L from "../web/app/auto-logica.js";
import * as C from "../web/app/comandos.js";
import { atualizarHistorico, chaveHistorico, secoesConfig as secoesCv } from "../web/app/cv-config.js";
import { resumoClientes } from "../web/app/admin.js";
import { agruparSecoes } from "../web/app/config.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ler = f => readFileSync(resolve(RAIZ, f), "utf8");

/* ------------------------------------------------------------------ dados de apoio */
const U = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BASE = {
  funis: [{ id: U(1), nome: "Pacientes", padrao: true, estagios: [
    { id: U(11), nome: "Nova conversa", marco: "nova", tipo: "aberto" }, { id: U(13), nome: "Avaliou / orçamento", marco: "orcamento", tipo: "aberto" },
    { id: U(15), nome: "Faltou", marco: "faltou", tipo: "aberto" }, { id: U(12), nome: "Avaliação agendada", marco: "agendada", tipo: "aberto" }] }],
  etiquetas: [{ id: U(31), nome: "Orçamento", cor: "#E5B35C" }],
  usuarios: [{ id: U(41), nome: "Ana Lima", papel: "atendente" }],
  departamentos: [{ id: U(51), nome: "Recepção" }], canais: [], templates: [], campos: [],
};
const VOCAB = { contato: "Paciente", negocio: "Oportunidade", g_negocio: "a", ganhar: "Fechou", perder: "Não fechou", vertical: "odonto" };
const iso = (minAtras, agora = Date.now()) => new Date(agora - minAtras * 60000).toISOString();

/* ================================================================== lógica pura — item 52 */

test("taxaSucesso e nivelTaxa: ok/erros/pct e null sem execuções", () => {
  assert.deepEqual(L.taxaSucesso({ execucoes: 10, erros: 1 }), { total: 10, ok: 9, erros: 1, pct: 90 });
  assert.deepEqual(L.taxaSucesso({ execucoes: 0, erros: 0 }), { total: 0, ok: 0, erros: 0, pct: null });
  assert.deepEqual(L.taxaSucesso({ execucoes: "7", erros: "9" }), { total: 7, ok: 0, erros: 7, pct: 0 }, "erros nunca passam do total");
  assert.equal(L.nivelTaxa(null), "vazia"); assert.equal(L.nivelTaxa(95), "ok"); assert.equal(L.nivelTaxa(70), "aten"); assert.equal(L.nivelTaxa(10), "ruim");
});

test("resumoAutomacoes soma ligadas, execuções, erros, em espera e a taxa geral", () => {
  const r = L.resumoAutomacoes([{ ativo: true, execucoes: 7, erros: 1, em_espera: 3 }, { ativo: false, execucoes: 11, erros: 0 }, { ativo: true, execucoes: 0 }]);
  assert.deepEqual(r, { total: 3, ligadas: 2, execucoes: 18, erros: 1, em_espera: 3, com_erro: 1, pct: 94 });
  assert.equal(L.resumoAutomacoes([]).pct, null);
  assert.equal(L.resumoAutomacoes(null).total, 0);
});

/* ================================================================== lógica pura — item 54 */

test("execucoesPorDia: janela de N dias até hoje, contagem por situação, fora da janela e sem data ficam de fora", () => {
  const agora = new Date("2026-10-04T15:00:00-03:00");
  const lista = [
    { criado_em: "2026-10-04T10:00:00-03:00", estado: "concluida", ok: true },
    { criado_em: "2026-10-04T11:00:00-03:00", estado: "erro", ok: false },
    { criado_em: "2026-10-03T23:30:00-03:00", estado: "esperando", ok: true },
    { criado_em: "2026-10-03T08:00:00-03:00", estado: "cancelada", ok: true },
    { criado_em: "2026-09-01T08:00:00-03:00", estado: "concluida", ok: true },    // fora dos 14 dias
    { criado_em: "data inválida", estado: "concluida", ok: true },
    { criado_em: null },
  ];
  const r = L.execucoesPorDia(lista, { dias: 14, agora });
  assert.equal(r.serie.length, 14);
  assert.equal(r.dias, 14);
  assert.equal(r.serie[13].dia, "2026-10-04", "o último dia é hoje");
  assert.equal(r.serie[0].dia, "2026-09-21");
  assert.deepEqual([r.serie[13].ok, r.serie[13].erro, r.serie[13].total], [1, 1, 2]);
  assert.deepEqual([r.serie[12].espera, r.serie[12].pulado, r.serie[12].total], [1, 1, 2]);
  assert.equal(r.n, 4, "só as 4 dentro da janela e com data válida");
  assert.equal(r.maximo, 2);
  assert.equal(r.serie[13].rotulo, "04/10");
  assert.equal(r.serie[13].semana, "dom", "4/10/2026 é domingo");
  assert.equal(L.execucoesPorDia(null, { dias: 7, agora }).serie.length, 7);
});

test("execucoesPorDia com recortar: lista cheia (só as N mais recentes) começa no dia da mais antiga carregada e avisa", () => {
  const agora = new Date("2026-10-04T15:00:00-03:00");
  // 6 execuções carregadas (o limite), a mais antiga de 02/10: antes disso o gráfico não sabe nada — não pode desenhar zero
  const cheia = ["2026-10-04T10:00:00-03:00", "2026-10-04T09:00:00-03:00", "2026-10-03T12:00:00-03:00", "2026-10-03T08:00:00-03:00", "2026-10-02T20:00:00-03:00", "2026-10-02T19:00:00-03:00"]
    .map(c => ({ criado_em: c, estado: "concluida", ok: true }));
  const r = L.execucoesPorDia(cheia, { dias: 14, agora, recortar: true });
  assert.equal(r.recortado, true);
  assert.equal(r.dias, 3, "02/10 a 04/10");
  assert.deepEqual(r.serie.map(p => p.dia), ["2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.equal(r.n, 6);
  // sem recortar (a lista é tudo o que existe): a janela de 14 dias continua inteira
  const t = L.execucoesPorDia(cheia, { dias: 14, agora });
  assert.equal(t.recortado, false); assert.equal(t.dias, 14);
  // a mais antiga carregada já é de antes da janela: tudo o que caiu nos 14 dias veio, nada a recortar
  const velha = [...cheia, { criado_em: "2026-09-01T08:00:00-03:00", estado: "concluida" }];
  const v = L.execucoesPorDia(velha, { dias: 14, agora, recortar: true });
  assert.equal(v.recortado, false); assert.equal(v.dias, 14); assert.equal(v.n, 6);
  // a mais antiga caiu bem no 1º dia da janela: esse dia pode estar pela metade, então avisa (janela continua com 14)
  const noInicio = L.execucoesPorDia([...cheia, { criado_em: "2026-09-21T08:00:00-03:00", estado: "erro" }], { dias: 14, agora, recortar: true });
  assert.equal(noInicio.recortado, true); assert.equal(noInicio.dias, 14);
  // tudo hoje: um dia só
  const hoje = L.execucoesPorDia(cheia.slice(0, 2), { dias: 14, agora, recortar: true });
  assert.equal(hoje.dias, 1); assert.equal(hoje.serie[0].dia, "2026-10-04");
  // sem data válida nenhuma: não recorta (não há referência)
  assert.equal(L.execucoesPorDia([{ criado_em: null }], { dias: 14, agora, recortar: true }).dias, 14);
});

test("agruparExecucoesPorDia: mais recente primeiro, «Hoje»/«Ontem», sem data no fim", () => {
  const agora = new Date("2026-10-04T15:00:00-03:00");
  const g = L.agruparExecucoesPorDia([
    { criado_em: "2026-10-03T08:00:00-03:00", chave: "b" }, { criado_em: "2026-10-04T10:00:00-03:00", chave: "a" },
    { criado_em: "2026-09-28T10:00:00-03:00", chave: "c" }, { criado_em: null, chave: "d" }], agora);
  assert.deepEqual(g.map(x => x.rotulo), ["Hoje", "Ontem", "seg, 28/09", "Sem data"]);
  assert.deepEqual(g.map(x => x.itens.map(i => i.chave)), [["a"], ["b"], ["c"], ["d"]]);
  assert.equal(L.rotuloDia("2026-10-04", agora), "Hoje");
  assert.equal(L.rotuloDia("2026-10-03", agora), "Ontem");
});

/* ================================================================== lógica pura — item 53 */

test("nosDoDiagrama: gatilho → condições → passos (+ «Adicionar passo»), tom por tipo, inalcançável depois de «Parar»", () => {
  const auto = { nome: "x", gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [{ campo: "origem", op: "igual", valor: "anuncio" }],
    acoes: [{ tipo: "esperar", minutos: 1440, cancelar_se_cliente_responder: true }, { tipo: "enviar_mensagem", texto: "Oi {primeiro_nome}" }, { tipo: "parar" }, { tipo: "criar_tarefa", titulo: "Ligar", dono: "responsavel" }] };
  const nos = L.nosDoDiagrama(auto, BASE, VOCAB, { podeEditar: true });
  assert.deepEqual(nos.map(n => n.tipo), ["gatilho", "condicao", "passo", "passo", "passo", "passo", "mais"]);
  assert.equal(nos[0].onde, "quando"); assert.equal(nos[0].rotulo, "Oportunidade entrou numa etapa");
  assert.match(nos[0].sub, /Avaliou \/ orçamento/);
  assert.equal(nos[1].onde, "se"); assert.equal(nos[1].indice, 0); assert.match(nos[1].rotulo, /^Só se a origem/);
  assert.equal(nos[2].rotulo, "Esperar 1 dia"); assert.equal(nos[2].tom, "espera"); assert.equal(nos[2].sub, "para se o cliente responder");
  assert.equal(nos[3].tom, "msg"); assert.equal(nos[3].n, 2); assert.equal(nos[3].onde, "entao"); assert.equal(nos[3].indice, 1);
  assert.equal(nos[4].tom, "parar");
  assert.equal(nos[5].inalcancavel, true, "depois de «Parar» nunca roda");
  assert.match(nos[5].sub, /nunca roda/);
  assert.equal(nos[6].onde, "entao"); assert.equal(nos[6].indice, null);
  const txt = L.textoDiagrama(nos);
  assert.match(txt, /^Fluxo: quando a oportunidade entrar/);
  assert.match(txt, /só se a origem/);
  assert.match(txt, /então 1\. Esperar 1 dia, 2\. Enviar mensagem, 3\. Parar por aqui, 4\. Criar tarefa \(nunca roda\)\./);
  // sem passos: nó «vazio» no lugar do «mais»; sem permissão de editar não há «mais»
  const vazio = L.nosDoDiagrama({ gatilho: "tarefa_vencida", acoes: [] }, BASE, VOCAB, { podeEditar: true });
  assert.deepEqual(vazio.map(n => n.id), ["gatilho", "vazio"]);
  assert.match(L.textoDiagrama(vazio), /nenhum passo ainda/);
  const leitura = L.nosDoDiagrama(auto, BASE, VOCAB, { podeEditar: false });
  assert.equal(leitura.some(n => n.tipo === "mais"), false);
});

test("tomDaAcao classifica os passos", () => {
  assert.equal(L.tomDaAcao("esperar"), "espera"); assert.equal(L.tomDaAcao("parar"), "parar"); assert.equal(L.tomDaAcao("ia_decidir"), "ia");
  assert.equal(L.tomDaAcao("enviar_mensagem"), "msg"); assert.equal(L.tomDaAcao("notificar"), "equipe"); assert.equal(L.tomDaAcao("mover_estagio"), "crm");
  assert.equal(L.tomDaAcao("inventado"), "crm");
});

/* ================================================================== lógica pura — item 55 */

test("filtrarModelos: sem acento, por título/texto/tipo de passo; vazio devolve tudo", () => {
  const todas = L.modelosDaVertical("odonto");
  assert.equal(L.filtrarModelos(todas, "", VOCAB).length, todas.length);
  const msg = L.filtrarModelos(todas, "mensagem", VOCAB);
  assert.ok(msg.length > 0 && msg.length < todas.length);
  assert.ok(msg.some(m => m.id === "followup_orcamento"), "receita que manda mensagem entra");
  assert.ok(!msg.some(m => m.id === "pos_venda"), "receita só de tarefa (pós-venda) fica de fora");
  // o que casou tem «mensagem» no título, no texto, no passo ou no gatilho («Mensagem recebida»)
  assert.ok(msg.every(m => /mensagem/i.test([L.tituloModelo(m, VOCAB), L.textoModelo(m, VOCAB), L.rotuloGatilho(m.auto.gatilho, VOCAB), ...m.auto.acoes.map(a => L.rotuloAcao(a.tipo, VOCAB))].join(" "))));
  assert.ok(L.filtrarModelos(todas, "ORCAMENTO", VOCAB).some(m => m.id === "followup_orcamento"), "sem acento e sem caixa");
  assert.ok(L.filtrarModelos(todas, "ia etapa", VOCAB).some(m => m.id === "ia_classificar_etapa"), "todas as palavras precisam casar");
  assert.equal(L.filtrarModelos(todas, "xyzqw", VOCAB).length, 0);
});

test("exemplosIA: 5 pedidos, no vocabulário da vertical", () => {
  const od = L.exemplosIA(VOCAB), of = L.exemplosIA({ vertical: "oficina" });
  assert.equal(od.length, 5);
  assert.ok(od.some(t => /consulta/.test(t)) && of.some(t => /visita/.test(t)));
  assert.ok(od.every(t => t.length >= 12 && t.length <= L.LIMITES.descricao_ia));
});

/* ================================================================== lógica pura — item 59 (comandos) */

test("comandos: todo item do catálogo tem grupo conhecido; agruparAcoes segue a ordem e põe os da tela em «Nesta tela»", () => {
  for (const c of C.CATALOGO) assert.ok(C.GRUPOS_ACAO.includes(c.grupo), `${c.id} sem grupo`);
  const amb = { vocab: { novo: () => "Nova oportunidade", vertical: "odonto" }, rotaOk: () => true, pode: () => true, empresas: 2, instalar: true, suporte: true, temCliente: true };
  const fazer = Object.fromEntries(C.CATALOGO.map(c => [c.id, () => {}]));
  const acoes = C.acoesPadrao(amb, fazer);
  const reg = C.criarComandos();
  reg.registrar({ id: "tela.x", rotulo: "Da tela", fazer() {} });
  reg.registrar({ id: "tela.y", rotulo: "Criar algo", grupo: "Criar", fazer() {} });
  const g = C.agruparAcoes([...reg.listar(), ...acoes]);
  assert.deepEqual(g.map(x => x.grupo), ["Nesta tela", "Criar", "Ir e ver", "Aparência e app", "Ajuda", "Conta"]);
  assert.deepEqual(g[0].itens.map(x => x.id), ["tela.x"]);
  assert.ok(g[1].itens.some(x => x.id === "tela.y") && g[1].itens.some(x => x.id === "nova-conversa"));
  assert.deepEqual(g[5].itens.map(x => x.id), ["sair"]);
});

test("comandos: últimos usados por conta — registra sem repetir, respeita o máximo, ordena e nunca lança erro", () => {
  const mem = new Map();
  const armazenamento = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  const u = C.criarUltimosComandos({ armazenamento, chave: C.chaveUltimos("conta-1"), max: 3 });
  assert.deepEqual(u.ler(), []);
  u.registrar("a", 1); u.registrar("b", 2); u.registrar("a", 3); u.registrar("c", 4); u.registrar("d", 5);
  assert.deepEqual(u.ler().map(x => x.id), ["d", "c", "a"], "sem repetir, máximo 3, mais recente primeiro");
  assert.equal(C.chaveUltimos("conta-1"), "nx-cmd:conta-1");
  const acoes = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
  assert.deepEqual(C.ultimosUsados(acoes, u.ler(), 2).map(x => x.id), ["d", "c"]);
  assert.deepEqual(C.ordenarPorUso(acoes, u.ler()).map(x => x.id), ["d", "c", "a", "b", "e"]);
  mem.set(C.chaveUltimos("conta-1"), "{lixo");
  assert.deepEqual(u.ler(), [], "json quebrado vira lista vazia");
  const quebrado = C.criarUltimosComandos({ armazenamento: { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } }, chave: "k" });
  // instante fixo: com Date.now() as duas chamadas podiam cair em milissegundos diferentes (teste intermitente)
  assert.deepEqual(quebrado.registrar("a", 7), [{ id: "a", em: 7 }], "sem storage não derruba");
  quebrado.limpar();
});

/* ================================================================== lógica pura — itens 56, 57, 58 */

test("agruparSecoes: ordem dos grupos do hub e descrições presentes nas seções desta frente", () => {
  const g = agruparSecoes([{ id: "b", grupo: "CRM" }, { id: "a", grupo: "Você" }, { id: "c", grupo: "Zzz" }, { id: "d", grupo: "CRM" }]);
  assert.deepEqual(g.map(x => x.grupo), ["Você", "CRM", "Zzz"]);
  assert.deepEqual(g[1].itens.map(x => x.id), ["b", "d"]);
  for (const s of secoesCv) assert.ok(s.desc && s.desc.length > 8, `${s.id} sem descrição`);
});

test("atualizarHistorico (conexão do número): só grava quando muda, mais recente primeiro, até 8, tom conhecido", () => {
  let l = atualizarHistorico([], { rotulo: "Desconectado", tom: "ruim", em: 1 });
  l = atualizarHistorico(l, { rotulo: "Desconectado", tom: "ruim", em: 2 });
  assert.equal(l.length, 1, "a mesma situação não repete");
  l = atualizarHistorico(l, { rotulo: "Conectado", tom: "ok", em: 3 });
  assert.deepEqual(l.map(x => x.rotulo), ["Conectado", "Desconectado"]);
  for (let i = 0; i < 20; i++) l = atualizarHistorico(l, { rotulo: `S${i}`, tom: "x", em: 10 + i });
  assert.equal(l.length, 8); assert.equal(l[0].tom, "neutra", "tom desconhecido vira neutra");
  assert.deepEqual(atualizarHistorico("lixo", {}), []);
  assert.equal(chaveHistorico("c1", "k1"), "nx-canal-hist:c1:k1");
});

test("resumoClientes: por situação e perto do limite (≥ 80 %)", () => {
  const r = resumoClientes([
    { status: "ativo", uso: { usuarios: 8 }, limites: { usuarios: 10 } }, { status: "teste", uso: { usuarios: 1 }, limites: { usuarios: 10 } },
    { status: "suspenso" }, { status: "ativo", uso: { contatos: 100 }, limites: { contatos: null } }, { status: "estranho" }]);
  assert.deepEqual(r, { total: 5, ativo: 2, teste: 1, suspenso: 1, cancelado: 0, perto_limite: 1 });
});

/* ================================================================== DOM mínimo (o mesmo espírito do app.teste.mjs) */

function criarDom() {
  const kebab = s => s.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
  class Evento {
    constructor(type, init = {}) { this.type = type; this.bubbles = true; this.cancelable = true; this.defaultPrevented = false; Object.assign(this, init); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._parado = true; }
  }
  class No {
    constructor() { this.parentNode = null; this.childNodes = []; this._ouv = []; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc; }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get firstElementChild() { return this.children[0] || null; }
    appendChild(n) { return this.insertBefore(n, null); }
    insertBefore(n, ref) { if (n.parentNode) n.parentNode.removeChild(n); const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n); n.parentNode = this; return n; }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; } return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    append(...ns) { for (const n of ns.flat(Infinity)) if (n !== null && n !== undefined && n !== false) this.appendChild(typeof n === "object" && n.nodeType ? n : new Texto(n)); }
    prepend(...ns) { const ref = this.firstChild; for (const n of ns) this.insertBefore(typeof n === "object" && n.nodeType ? n : new Texto(n), ref); }
    after(...ns) { const p = this.parentNode; const ref = this.nextSibling; for (const n of ns) p.insertBefore(n, ref); }
    get nextSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    addEventListener(tipo, fn, opc) { this._ouv.push({ tipo, fn, once: !!(opc && opc.once) }); }
    removeEventListener(tipo, fn) { this._ouv = this._ouv.filter(o => !(o.tipo === tipo && o.fn === fn)); }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      for (let n = this; n && !ev._parado; n = n.parentNode) {
        ev.currentTarget = n;
        for (const o of [...n._ouv]) if (o.tipo === ev.type) { if (o.once) n.removeEventListener(o.tipo, o.fn); o.fn(ev); }
        if (!ev.bubbles) break;
      }
      return !ev.defaultPrevented;
    }
  }
  class Texto extends No { constructor(t) { super(); this.nodeType = 3; this.data = String(t); } get textContent() { return this.data; } set textContent(v) { this.data = String(v); } }
  function splitVirgula(s) { const out = []; let nivel = 0, cur = ""; for (const c of s) { if (c === "[" || c === "(") nivel++; if (c === "]" || c === ")") nivel--; if (nivel === 0 && c === ",") { out.push(cur.trim()); cur = ""; } else cur += c; } if (cur.trim()) out.push(cur.trim()); return out; }
  function parseComplexo(s) { const partes = []; let nivel = 0, cur = "", comb = null; const fecha = () => { if (cur) { if (partes.length) partes.push(comb || " "); partes.push(cur); cur = ""; comb = null; } }; for (const c of s) { if (c === "[" || c === "(") nivel++; if (c === "]" || c === ")") nivel--; if (nivel === 0 && (c === " " || c === ">")) { fecha(); if (c === ">") comb = ">"; else if (!comb) comb = " "; } else cur += c; } fecha(); return partes; }
  function casaComposto(el, s) {
    let i = 0; const m0 = /^([a-zA-Z][\w-]*|\*)/.exec(s);
    if (m0) { if (m0[1] !== "*" && el.localName.toLowerCase() !== m0[1].toLowerCase()) return false; i = m0[0].length; }
    while (i < s.length) {
      const resto = s.slice(i); let mm;
      if (resto[0] === "#") { mm = /^#([\w-]+)/.exec(resto); if (el.attrs.get("id") !== mm[1]) return false; }
      else if (resto[0] === ".") { mm = /^\.([\w-]+)/.exec(resto); if (!el.classList.contains(mm[1])) return false; }
      else if (resto[0] === "[") { mm = /^\[([\w:-]+)(?:([~|^$*]?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/.exec(resto); if (!el.attrs.has(mm[1])) return false; if (mm[2]) { const v = el.attrs.get(mm[1]), a = mm[3] ?? mm[4] ?? mm[5]; if (mm[2] === "=" && v !== a) return false; if (mm[2] === "^=" && !v.startsWith(a)) return false; } }
      else if (resto[0] === ":") { mm = /^:([\w-]+)(?:\(((?:[^()]|\([^)]*\))*)\))?/.exec(resto); if (mm[1] === "not") { if (casaLista(el, mm[2])) return false; } else if (mm[1] === "disabled") { if (!el.disabled) return false; } else return false; }
      else return false;
      i += mm[0].length;
    }
    return true;
  }
  function casaComplexo(el, partes) { if (!casaComposto(el, partes[partes.length - 1])) return false; if (partes.length === 1) return true; const comb = partes[partes.length - 2], resto = partes.slice(0, -2); if (comb === ">") return !!el.parentNode && el.parentNode.nodeType === 1 && casaComplexo(el.parentNode, resto); for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) if (casaComplexo(p, resto)) return true; return false; }
  function casaLista(el, lista) { return splitVirgula(lista).some(sel => casaComplexo(el, parseComplexo(sel))); }
  class El extends No {
    constructor(tag, ns) {
      super(); this.nodeType = 1; this.localName = tag; this.tagName = tag.toUpperCase(); this.namespaceURI = ns || null;
      this.attrs = new Map(); this.value = ""; this.checked = false; this.disabled = false; this.hidden = false; this.open = false; this.offsetWidth = 0; this.selectionStart = null;
      const estilos = new Map(); const el = this;
      this.style = { setProperty: (k, v) => { if (v === "" || v == null) estilos.delete(k); else estilos.set(k, String(v)); }, getPropertyValue: k => estilos.get(k) || "", removeProperty: k => { estilos.delete(k); } };
      this.dataset = new Proxy({}, { get: (_, k) => (typeof k === "string" && el.attrs.has("data-" + kebab(k)) ? el.attrs.get("data-" + kebab(k)) : undefined), set: (_, k, v) => { el.attrs.set("data-" + kebab(k), String(v)); return true; }, deleteProperty: (_, k) => { el.attrs.delete("data-" + kebab(k)); return true; } });
      const cls = () => (el.attrs.get("class") || "").split(/\s+/).filter(Boolean);
      this.classList = { add: (...c) => { const s = new Set(cls()); c.forEach(x => s.add(x)); el.attrs.set("class", [...s].join(" ")); }, remove: (...c) => { const s = new Set(cls()); c.forEach(x => s.delete(x)); el.attrs.set("class", [...s].join(" ")); }, contains: c => cls().includes(c), toggle: (c, f) => { const t = f === undefined ? !cls().includes(c) : !!f; t ? this.classList.add(c) : this.classList.remove(c); return t; } };
    }
    setAttribute(k, v) { this.attrs.set(k, String(v)); } getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); } removeAttribute(k) { this.attrs.delete(k); }
    get id() { return this.attrs.get("id") || ""; } set id(v) { this.attrs.set("id", String(v)); }
    get name() { return this.attrs.get("name") || ""; }
    get type() { return this.attrs.get("type") || (this.localName === "input" ? "text" : ""); } set type(v) { this.attrs.set("type", v); }
    get tabIndex() { return Number(this.attrs.get("tabindex") ?? -1); } set tabIndex(v) { this.attrs.set("tabindex", String(v)); }
    get className() { return this.attrs.get("class") || ""; }
    get textContent() { return this.childNodes.map(c => c.textContent).join(""); }
    set textContent(v) { for (const c of [...this.childNodes]) this.removeChild(c); if (v !== "" && v != null) this.appendChild(new Texto(v)); }
    get innerText() { return this.textContent; }
    matches(sel) { return casaLista(this, sel); }
    closest(sel) { for (let p = this; p && p.nodeType === 1; p = p.parentNode) if (p.matches(sel)) return p; return null; }
    querySelectorAll(sel) { const alvos = splitVirgula(sel).map(parseComplexo); const out = []; const andar = n => { for (const c of n.childNodes) if (c.nodeType === 1) { if (alvos.some(p => casaComplexo(c, p))) out.push(c); andar(c); } }; andar(this); return out; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    focus() { doc.activeElement = this; } blur() { if (doc.activeElement === this) doc.activeElement = doc.body; }
    click() { this.dispatchEvent(new Evento("click")); }
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
    scrollIntoView() {} getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
    showModal() { this.open = true; } close() { this.open = false; }
  }
  const doc = new No();
  doc.nodeType = 9;
  doc.createElement = t => new El(t); doc.createElementNS = (ns, t) => new El(t, ns); doc.createTextNode = t => new Texto(t);
  doc.documentElement = doc.appendChild(new El("html")); doc.head = doc.documentElement.appendChild(new El("head")); doc.body = doc.documentElement.appendChild(new El("body")); doc.activeElement = doc.body;
  doc.getElementById = id => doc.documentElement.querySelector(`#${id}`);
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel); doc.querySelector = sel => doc.documentElement.querySelector(sel);
  doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  return { doc, Evento, El };
}
/** Instala o DOM de mentira para UM teste e devolve `fim()`. */
function comDom() {
  const { doc, Evento } = criarDom();
  const salvo = { document: globalThis.document, Event: globalThis.Event, MouseEvent: globalThis.MouseEvent, KeyboardEvent: globalThis.KeyboardEvent, window: globalThis.window, matchMedia: globalThis.matchMedia, localStorage: globalThis.localStorage };
  globalThis.document = doc; globalThis.Event = Evento; globalThis.KeyboardEvent = Evento; globalThis.MouseEvent = Evento;
  globalThis.window = globalThis;
  const mem = new Map();
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  return { doc, Evento, fim() { for (const [k, v] of Object.entries(salvo)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } } };
}
const tique = (n = 3) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : setTimeout(f, 0)); setTimeout(f, 0); });
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function uiReal() { return import("../web/app/ui.js"); }
async function pecasReais(ui) { const PE = await import("../web/app/auto-pecas.js"); return PE.pecas(ui, L); }

/* ================================================================== DOM — peças (itens 52, 53, 54) */

test("barraTaxa: role=meter com texto legível e nível pela faixa", async () => {
  const d = comDom();
  try {
    const P = await pecasReais(await uiReal());
    const b = P.barraTaxa({ pct: 87, total: 23 });
    assert.equal(b.getAttribute("role"), "meter");
    assert.equal(b.getAttribute("aria-valuenow"), "87");
    assert.match(b.getAttribute("aria-valuetext"), /87% deram certo \(23 execuções\)/);
    assert.ok(b.classList.contains("au-taxa-aten"));
    const v = P.barraTaxa({ pct: null, total: 0 });
    assert.ok(v.classList.contains("au-taxa-vazia"));
    assert.match(v.getAttribute("aria-valuetext"), /ainda sem execuções/);
  } finally { d.fim(); }
});

test("diagrama: um nó por item, botões com nome, clique e Enter chamam aoFocar com o nó certo", async () => {
  const d = comDom();
  try {
    const P = await pecasReais(await uiReal());
    const auto = { gatilho: "negocio_estagio", config: { estagio_id: U(13) }, condicoes: [{ campo: "origem", op: "igual", valor: "anuncio" }],
      acoes: [{ tipo: "esperar", minutos: 60 }, { tipo: "criar_tarefa", titulo: "Ligar", dono: "responsavel" }] };
    const nos = L.nosDoDiagrama(auto, BASE, VOCAB, { podeEditar: true });
    const focados = [];
    const svg = P.diagrama({ nos, aoFocar: no => focados.push(no.id), largura: 300 });
    assert.equal(svg.localName, "svg");
    assert.match(svg.getAttribute("aria-label"), /^Diagrama do fluxo\. Fluxo: /);
    const botoes = svg.querySelectorAll("[role=button]");
    assert.equal(botoes.length, nos.length);
    assert.ok(botoes.every(b => b.getAttribute("tabindex") === "0" && b.getAttribute("aria-label").includes("Ir até este bloco")));
    assert.match(botoes[1].getAttribute("aria-label"), /^Condição 1: Só se a origem/);
    assert.match(botoes[3].getAttribute("aria-label"), /^Passo 2: Criar tarefa/);
    botoes[3].dispatchEvent(new d.Evento("click"));
    botoes[0].dispatchEvent(new d.Evento("keydown", { key: "Enter" }));
    botoes[4].dispatchEvent(new d.Evento("keydown", { key: " " }));
    botoes[2].dispatchEvent(new d.Evento("keydown", { key: "a" }));
    assert.deepEqual(focados, ["passo-1", "gatilho", "mais"]);
    assert.equal(svg.querySelector("title").textContent, L.textoDiagrama(nos));
  } finally { d.fim(); }
});

test("graficoDias: estado vazio sem execuções; com dados há uma coluna por dia, segmentos empilhados e «Ver como tabela»", async () => {
  const d = comDom();
  try {
    const P = await pecasReais(await uiReal());
    const agora = new Date("2026-10-04T15:00:00-03:00");
    const vazio = P.graficoDias({ ...L.execucoesPorDia([], { dias: 7, agora }), titulo: "Execuções por dia" });
    assert.ok(vazio.querySelector(".au-gd-vazio"), "estado vazio");
    assert.equal(vazio.querySelector(".au-gd-barras"), null);
    const lista = [{ criado_em: "2026-10-04T10:00:00-03:00", estado: "concluida", ok: true }, { criado_em: "2026-10-04T11:00:00-03:00", estado: "erro" }, { criado_em: "2026-10-02T11:00:00-03:00", estado: "esperando" }];
    const g = P.graficoDias({ ...L.execucoesPorDia(lista, { dias: 7, agora }) });
    const barras = g.querySelector(".au-gd-barras");
    assert.equal(barras.getAttribute("role"), "img");
    assert.match(barras.getAttribute("aria-label"), /3 execuções em 7 dias; pico de 2/);
    assert.equal(barras.querySelectorAll(".au-gd-col").length, 7);
    const hoje = barras.querySelectorAll(".au-gd-col")[6];
    assert.deepEqual(hoje.querySelectorAll(".au-gd-seg").map(s => s.className), ["au-gd-seg au-gd-ok", "au-gd-seg au-gd-erro"]);
    assert.equal(hoje.querySelector(".au-gd-seg").style.getPropertyValue("--h"), "50.00%");
    const bt = g.querySelector(".au-gd-alt"), tab = g.querySelector(".au-gd-tabela"), caixa = g.querySelector(".au-gd-caixa");
    assert.equal(bt.getAttribute("aria-pressed"), "false"); assert.equal(tab.hidden, true);
    bt.dispatchEvent(new d.Evento("click"));
    assert.equal(bt.getAttribute("aria-pressed"), "true"); assert.equal(tab.hidden, false); assert.equal(caixa.hidden, true); assert.equal(bt.textContent, "Ver como gráfico");
    assert.equal(tab.querySelectorAll("tbody tr").length, 2, "só os dias com execução entram na tabela");
    assert.equal(tab.querySelectorAll("thead th").length, 6);
    assert.equal(g.querySelector(".au-gd-sub").textContent, "Últimos 7 dias · 3 execuções registradas");
  } finally { d.fim(); }
});

test("graficoDias com a lista recortada: o subtítulo diz «nas últimas N execuções carregadas» e a janela é a recortada", async () => {
  const d = comDom();
  try {
    const P = await pecasReais(await uiReal());
    const agora = new Date("2026-10-04T15:00:00-03:00");
    const lista = Array.from({ length: 50 }, (_, i) => ({ criado_em: new Date(agora.getTime() - i * 90 * 60000).toISOString(), estado: "concluida", ok: true }));
    const porDia = L.execucoesPorDia(lista, { dias: 14, agora, recortar: true });
    assert.equal(porDia.recortado, true);
    const g = P.graficoDias({ serie: porDia.serie, dias: porDia.dias, n: porDia.n, carregadas: 50 });
    assert.equal(g.querySelector(".au-gd-sub").textContent, `Últimos ${porDia.dias} dias · nas últimas 50 execuções carregadas`);
    assert.equal(g.querySelectorAll(".au-gd-col").length, porDia.dias, "nenhuma coluna de dia que não foi carregado");
    assert.match(g.querySelector(".au-gd-barras").getAttribute("aria-label"), /contando só as últimas 50 carregadas/);
    // tudo num dia só
    const um = L.execucoesPorDia(lista.slice(0, 3), { dias: 14, agora, recortar: true });
    assert.equal(P.graficoDias({ serie: um.serie, dias: um.dias, n: um.n, carregadas: 3 }).querySelector(".au-gd-sub").textContent, "Hoje · nas últimas 3 execuções carregadas");
  } finally { d.fim(); }
});

/* ================================================================== DOM — a lista de automações de verdade (item 52 + 55 + 59) */

function dadosLista() {
  return {
    vertical: "odonto", pode_editar: true, limite: { usadas: 2, limite: 8 }, base: BASE, ia: { disponivel: true, usadas: 2, limite: 300 }, sistema: [],
    itens: [
      { id: "a1", nome: "Lembrete por mensagem", gatilho: "antes_da_data", ativo: false, execucoes: 11, erros: 0, ultima_execucao_em: null, condicoes: [], config: { campo: "consulta", horas: 24 },
        acoes: [{ tipo: "enviar_mensagem", texto: "Olá, {primeiro_nome}!" }] },
      { id: "a2", nome: "Tarefa de orçamento", gatilho: "negocio_estagio", ativo: true, execucoes: 8, erros: 2, em_espera: 1, ultima_execucao_em: iso(30), condicoes: [], config: { estagio_id: U(13) },
        acoes: [{ tipo: "criar_tarefa", titulo: "Enviar orçamento", dono: "responsavel" }] },
    ],
  };
}
function ctxFalso(ui, { confirmar, rpc, comandos }) {
  const d = globalThis.document;
  const alvo = d.body.appendChild(d.createElement("main"));
  return {
    ui: { ...ui, confirmar, toast() {}, menu() {} },
    api: { rpcC: rpc, mensagemErro: e => String(e && e.message || e) },
    rota: { partes: [], query: {} }, alvo, versao: "dev", titulo() {}, navegar() {}, pulso: null,
    cliente: { id: "cli-1", nome: "Clínica Teste", vertical: "odonto" }, sessao: { conta: { id: "conta-1", nome: "Ana Lima" } }, vocab: VOCAB,
    comandos: { registrar: comandos },
  };
}

test("lista: resumo em números, cartões com taxa e estado, busca nas receitas, comandos na paleta", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const registrados = [];
    const chamadas = [];
    const ctx = ctxFalso(ui, {
      confirmar: async () => true,
      rpc: async (nome, p) => { chamadas.push([nome, p]); if (nome === "nx_automacoes_listar") return dadosLista(); return { ok: true }; },
      comandos: c => { registrados.push(c); return () => { registrados.splice(registrados.indexOf(c), 1); }; },
    });
    await A.montar(ctx);
    await tique();
    const raiz = ctx.alvo;
    // resumo: 4 KPIs (ui.kpi da frente A quando existe, senão a peça local)
    const kpis = raiz.querySelectorAll(".au-resumo > *");
    assert.equal(kpis.length, 4);
    assert.match(raiz.querySelector(".au-resumo").textContent, /Ligadas/);
    // cartões: estado em palavra, ponto, taxa de sucesso com números honestos
    const itens = raiz.querySelectorAll(".au-item");
    assert.equal(itens.length, 2);
    assert.equal(itens[0].querySelector(".au-item-estado").textContent, "Desligada");
    assert.equal(itens[1].querySelector(".au-item-estado").textContent, "Ligada");
    assert.match(itens[0].querySelector(".au-taxa").getAttribute("aria-valuetext"), /100% deram certo \(11 execuções\)/);
    assert.match(itens[1].querySelector(".au-taxa").getAttribute("aria-valuetext"), /75% deram certo/);
    assert.ok(itens[1].querySelector(".au-ponto-erro"), "ponto vermelho quando há erro");
    assert.equal(itens[1].querySelector(".au-item-espera").hidden, false);
    // receitas: busca filtra sem acento e mostra o estado vazio com «Limpar busca»
    const total = raiz.querySelectorAll(".au-modelo").length;
    assert.ok(total > 3);
    assert.ok(raiz.querySelector(".au-modelo-frase"), "frase «o que faz» nos cartões");
    const busca = raiz.querySelector(".au-modelos-busca input");
    busca.value = "mensagem"; busca.dispatchEvent(new d.Evento("input"));
    await esperar(220);
    const comMsg = raiz.querySelectorAll(".au-modelo").length;
    assert.ok(comMsg > 0 && comMsg < total, `filtrou (${comMsg} de ${total})`);
    busca.value = "zzzzqq"; busca.dispatchEvent(new d.Evento("input"));
    await esperar(220);
    assert.equal(raiz.querySelectorAll(".au-modelo").length, 0);
    assert.equal(raiz.querySelector(".au-modelos-vazio").hidden, false);
    raiz.querySelector(".au-modelos-vazio button").dispatchEvent(new d.Evento("click"));
    assert.equal(raiz.querySelectorAll(".au-modelo").length, total, "«Limpar busca» devolve todas");
    // exemplos da IA: 5 fichas que preenchem a caixa
    const ex = raiz.querySelectorAll(".au-ia-ex .au-chip-ex");
    assert.equal(ex.length, 5);
    ex[2].dispatchEvent(new d.Evento("click"));
    assert.match(raiz.querySelector(".au-ia-txt").value, /consulta/);
    // comandos desta tela na paleta, cancelados ao desmontar
    assert.deepEqual(registrados.map(c => c.id), ["automacoes.nova", "automacoes.ia", "automacoes.receitas"]);
    A.desmontar();
    assert.equal(registrados.length, 0);
  } finally { d.fim(); }
});

test("lista: ligar uma automação que manda mensagem pede confirmação; «não» volta o interruptor sem chamar o servidor", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const chamadas = [];
    let resposta = false, pedidos = 0;
    const ctx = ctxFalso(ui, {
      confirmar: async o => { pedidos++; assert.match(o.titulo, /^Ligar «Lembrete por mensagem»\?/); return resposta; },
      rpc: async (nome, p) => { chamadas.push(nome); if (nome === "nx_automacoes_listar") return dadosLista(); if (nome === "nx_automacao_ativar") return { ...dadosLista().itens[0], ativo: p.p_ativo }; return {}; },
      comandos: () => () => {},
    });
    await A.montar(ctx);
    await tique();
    const sw = ctx.alvo.querySelectorAll(".au-item .au-sw")[0];
    assert.equal(sw.getAttribute("aria-checked"), "false");
    sw.dispatchEvent(new d.Evento("click"));
    await tique(4);
    assert.equal(pedidos, 1, "perguntou antes de ligar");
    assert.equal(sw.getAttribute("aria-checked"), "false", "«não» desfaz o interruptor");
    assert.equal(chamadas.filter(n => n === "nx_automacao_ativar").length, 0);
    resposta = true;
    sw.dispatchEvent(new d.Evento("click"));
    await tique(6);
    assert.equal(chamadas.filter(n => n === "nx_automacao_ativar").length, 1, "«sim» chama o servidor");
    assert.equal(sw.getAttribute("aria-checked"), "true");
    assert.equal(ctx.alvo.querySelectorAll(".au-item")[0].querySelector(".au-item-estado").textContent, "Ligada");
    // a 2ª (só cria tarefa) desliga e liga sem perguntar
    const sw2 = ctx.alvo.querySelectorAll(".au-item .au-sw")[1];
    assert.equal(sw2.getAttribute("aria-checked"), "true");
    sw2.dispatchEvent(new d.Evento("click"));
    await tique(4);
    assert.equal(pedidos, 2, "desligar nunca pergunta");
    assert.equal(chamadas.filter(n => n === "nx_automacao_ativar").length, 2);
    A.desmontar();
  } finally { d.fim(); }
});

test("lista: ligar/desligar atualiza na hora o «Ligadas de N», os chips do filtro e o cabeçalho da seção (e volta junto se o servidor recusar)", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const dados = dadosLista();
    // 4 automações: com mais de 3 os chips «Todas / Ligadas / Desligadas / Com erro» aparecem
    dados.itens.push(
      { id: "a3", nome: "Etiqueta de retorno", gatilho: "negocio_estagio", ativo: true, execucoes: 3, erros: 0, condicoes: [], config: { estagio_id: U(13) }, acoes: [{ tipo: "criar_tarefa", titulo: "Retorno", dono: "responsavel" }] },
      { id: "a4", nome: "Aviso à equipe", gatilho: "negocio_estagio", ativo: true, execucoes: 0, erros: 0, condicoes: [], config: { estagio_id: U(13) }, acoes: [{ tipo: "criar_tarefa", titulo: "Avisar", dono: "responsavel" }] });
    let recusar = false;
    const ctx = ctxFalso(ui, {
      confirmar: async () => true,
      rpc: async (nome, p) => {
        if (nome === "nx_automacoes_listar") return dados;
        if (nome === "nx_automacao_ativar") {
          if (recusar) throw Object.assign(new Error("automacao_invalida"), { codigo: "automacao_invalida" });
          return { id: p.p_id, ativo: p.p_ativo };      // como o nx_auto_item: o item com o estado novo
        }
        return {};
      },
      comandos: () => () => {},
    });
    await A.montar(ctx);
    await tique();
    const raiz = ctx.alvo;
    const kpiLigadas = () => raiz.querySelectorAll(".au-resumo > *")[0];
    const chips = () => raiz.querySelectorAll(".au-lista-filtro .au-chip").map(c => c.textContent);
    const cab = () => raiz.querySelector("#au-suas").parentNode.querySelector(".rotulo").textContent;
    assert.match(kpiLigadas().textContent, /Ligadas de 4/);
    assert.match(kpiLigadas().textContent, /3/);
    assert.deepEqual(chips(), ["Todas · 4", "Ligadas · 3", "Desligadas · 1", "Com erro · 1"]);
    assert.equal(cab(), "3 ligadas de 4");
    // desliga «Tarefa de orçamento» (a2): sem esperar o pulso, tudo bate com o cartão
    const sw2 = raiz.querySelectorAll(".au-item .au-sw")[1];
    sw2.dispatchEvent(new d.Evento("click"));
    await tique(6);
    assert.equal(raiz.querySelectorAll(".au-item")[1].querySelector(".au-item-estado").textContent, "Desligada");
    assert.match(kpiLigadas().textContent, /Ligadas de 4/);
    assert.doesNotMatch(kpiLigadas().textContent, /3/, "o KPI não pode continuar dizendo 3 ligadas");
    assert.match(kpiLigadas().textContent, /2/);
    assert.deepEqual(chips(), ["Todas · 4", "Ligadas · 2", "Desligadas · 2", "Com erro · 1"]);
    assert.equal(cab(), "2 ligadas de 4");
    // o servidor recusa ligar de novo: o interruptor volta e os números continuam os do cartão
    recusar = true;
    sw2.dispatchEvent(new d.Evento("click"));
    await tique(6);
    assert.equal(sw2.getAttribute("aria-checked"), "false");
    assert.deepEqual(chips(), ["Todas · 4", "Ligadas · 2", "Desligadas · 2", "Com erro · 1"]);
    assert.equal(cab(), "2 ligadas de 4");
    // resposta sem «ativo» (ex.: {ok:true}): vale o que foi pedido e aceito, e o cartão não fica com o estado velho
    recusar = false;
    ctx.api.rpcC = async nome => (nome === "nx_automacao_ativar" ? { ok: true } : dados);
    sw2.dispatchEvent(new d.Evento("click"));
    await tique(6);
    assert.equal(raiz.querySelectorAll(".au-item")[1].querySelector(".au-item-estado").textContent, "Ligada");
    assert.equal(cab(), "3 ligadas de 4");
    A.desmontar();
  } finally { d.fim(); }
});

test("lista: o pulso atualiza também as automações fora do filtro escolhido, e o resumo conta todas", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const dados = dadosLista();
    dados.itens.push(
      { id: "a3", nome: "Etiqueta de retorno", gatilho: "negocio_estagio", ativo: true, execucoes: 3, erros: 0, condicoes: [], config: { estagio_id: U(13) }, acoes: [{ tipo: "criar_tarefa", titulo: "Retorno", dono: "responsavel" }] },
      { id: "a4", nome: "Aviso à equipe", gatilho: "negocio_estagio", ativo: true, execucoes: 0, erros: 0, condicoes: [], config: { estagio_id: U(13) }, acoes: [{ tipo: "criar_tarefa", titulo: "Avisar", dono: "responsavel" }] });
    let pulso = null;
    const ctx = ctxFalso(ui, { confirmar: async () => true, rpc: async () => dados, comandos: () => () => {} });
    ctx.pulso = { assinar(fn) { pulso = fn; return () => { pulso = null; }; } };
    await A.montar(ctx);
    await tique();
    const raiz = ctx.alvo;
    // filtra «Desligadas»: só a1 tem cartão
    raiz.querySelectorAll(".au-lista-filtro .au-chip").find(c => /^Desligadas/.test(c.textContent)).dispatchEvent(new d.Evento("click"));
    assert.equal(raiz.querySelectorAll(".au-item").length, 1);
    // no servidor a a3 (fora do filtro) foi desligada
    const novo = JSON.parse(JSON.stringify(dados));
    novo.itens.find(x => x.id === "a3").ativo = false;
    ctx.api.rpcC = async () => novo;
    const agoraReal = Date.now;
    Date.now = () => agoraReal() + 25000;            // passa a janela de 20 s do pulso
    try { await pulso(); } finally { Date.now = agoraReal; }
    await tique();
    assert.deepEqual(raiz.querySelectorAll(".au-lista-filtro .au-chip").map(c => c.textContent), ["Todas · 4", "Ligadas · 2", "Desligadas · 2", "Com erro · 1"]);
    assert.match(raiz.querySelectorAll(".au-resumo > *")[0].textContent, /2/);
    A.desmontar();
  } finally { d.fim(); }
});

/* ================================================================== DOM — Configurações e Admin (itens 56, 58) */

test("montarPreviaLogin: prévia da tela de entrada com os textos da marca e os padrões quando faltam", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const pv = cfg.montarPreviaLogin(ui);
    assert.equal(pv.el.getAttribute("role"), "img");
    assert.match(pv.el.getAttribute("aria-label"), /tela de entrada/);
    pv.atualizar({ produto: "Conecta CRM", login_titulo: "Bem-vindo", login_texto: "", suporte_wa: "5512999998888" }, { logo: null });
    assert.equal(pv.el.querySelector(".pv-login-prod").textContent, "Conecta CRM");
    assert.equal(pv.el.querySelector(".pv-login-tit").textContent, "Bem-vindo");
    assert.match(pv.el.querySelector(".pv-login-txt").textContent, /Entre com o e-mail/);
    assert.equal(pv.el.querySelector(".pv-login-rodape").hidden, false);
    pv.atualizar({ produto: "Órbita" }, { logo: "data:image/png;base64,AAAA" });
    assert.ok(pv.el.querySelector(".pv-login-logo img"));
    assert.equal(pv.el.querySelector(".pv-login-rodape").hidden, true);
    assert.match(pv.el.querySelector(".pv-login-tit").textContent, /mesma órbita/);
  } finally { d.fim(); }
});

test("anelUso: medidor com porcentagem e cor por faixa; sem limite mostra só o número", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const a = adm.anelUso(ui, { uso: 240, limite: 300, rotulo: "Sugestões de IA" });
    const svg = a.querySelector("svg");
    assert.equal(svg.getAttribute("role"), "meter");
    assert.equal(svg.getAttribute("aria-valuenow"), "240");
    assert.match(svg.getAttribute("aria-valuetext"), /240 de 300 \(80%\)/);
    assert.ok(svg.getAttribute("class").includes("adm-anel-aten"));
    assert.equal(svg.querySelector(".adm-anel-num").textContent, "80%");
    const s = adm.anelUso(ui, { uso: 12, limite: null, rotulo: "IA" }).querySelector("svg");
    assert.ok(s.getAttribute("class").includes("adm-anel-neutra"));
    assert.match(s.getAttribute("aria-valuetext"), /sem limite/);
    assert.equal(adm.anelUso(ui, { uso: 301, limite: 300 }).querySelector("svg").getAttribute("class").includes("adm-anel-ruim"), true);
  } finally { d.fim(); }
});

/* ================================================================== DOM — Admin: resumo com filtro na URL (item 58) */

async function montarAdmin({ query = {}, superConta = false, clientes }) {
  const ui = await uiReal();
  const adm = await import("../web/app/admin.js");
  const d = globalThis.document;
  const alvo = d.body.appendChild(d.createElement("main"));
  const pedidos = [];
  const ctx = {
    ui: { ...ui, tabela: ({ linhas }) => ({ el: ui.h("div", { class: "tab-falsa", dataset: { n: String(linhas.length) } }) }), carregarCss: () => Promise.resolve(true) },
    api: {
      rpc: async (nome, p) => {
        pedidos.push([nome, p]);
        if (nome === "nx_planos_listar") return [];
        if (nome === "nx_orgs_listar") return [{ id: "org-b", nome: "Revenda B" }];
        if (nome !== "nx_clientes_admin") return [];
        const f = p.p_filtro || {};
        return clientes.filter(c => (!f.status || c.status === f.status) && (!f.org_id || c.org_id === f.org_id) && (!f.busca || c.nome.includes(f.busca)));
      },
      mensagemErro: e => String(e && e.message || e),
    },
    rota: { partes: ["clientes"], query }, alvo, titulo() {}, navegar() {}, pronto: () => false,
    sessao: { conta: { super: superConta }, org: { id: "org-a", nome: "Revenda A" } },
  };
  await adm.montar(ctx);
  await tique(4);
  adm.desmontar();
  return { ctx, pedidos, alvo };
}
/** O texto de ajuda de um KPI, onde quer que o ui.kpi o ponha (title, dica do ⓘ ou dica do cartão). */
const ajudaDoKpi = k => k.getAttribute("title") || (k.querySelector(".kpi-ajuda") && k.querySelector(".kpi-ajuda").dataset.dica) || k.dataset.dica || "";

test("admin: aberto com ?status=teste, os KPIs e as contagens do segmentado aparecem (resumo pedido sem o filtro de situação)", async () => {
  const d = comDom();
  try {
    const clientes = [
      { id: "c1", nome: "Alfa", status: "ativo", org_id: "org-a" }, { id: "c2", nome: "Beta", status: "teste", org_id: "org-a" },
      { id: "c3", nome: "Gama", status: "ativo", org_id: "org-b", uso: { usuarios: 9 }, limites: { usuarios: 10 } }, { id: "c4", nome: "Delta", status: "suspenso", org_id: "org-b" }];
    const { pedidos, alvo } = await montarAdmin({ query: { status: "teste" }, clientes });
    const listas = pedidos.filter(p => p[0] === "nx_clientes_admin").map(p => p[1].p_filtro);
    assert.deepEqual(listas, [{ busca: null, status: "teste", org_id: null }, { busca: null, status: null, org_id: null }], "a lista com o filtro e, à parte, o resumo sem ele");
    assert.equal(alvo.querySelector(".tab-falsa").dataset.n, "1", "a lista continua só com os «Em teste»");
    const faixa = alvo.querySelector(".adm-kpis");
    assert.equal(faixa.hidden, false, "a faixa de KPIs aparece mesmo com o filtro na URL");
    assert.equal(faixa.querySelectorAll(".kpi").map(k => k.querySelector(".kpi-valor").textContent).join("|"), "4|2|1|1");
    const n = valor => alvo.querySelector(`.adm-seg-status [data-valor="${valor}"] .seg-n`);
    assert.equal(n("").textContent, "4"); assert.equal(n("teste").textContent, "1"); assert.equal(n("suspenso").textContent, "1");
    assert.equal(n("ativo").hidden, false);
    assert.match(ajudaDoKpi(faixa.querySelector(".kpi")), /desta revenda/);
  } finally { d.fim(); }
});

test("admin: com ?busca= também; sem filtro, uma chamada só; com a revenda escolhida, a ajuda do KPI fala dela", async () => {
  const d = comDom();
  try {
    const clientes = [{ id: "c1", nome: "Alfa", status: "ativo", org_id: "org-a" }, { id: "c2", nome: "Beta", status: "teste", org_id: "org-b" }];
    const b = await montarAdmin({ query: { busca: "Alf" }, clientes });
    assert.equal(b.pedidos.filter(p => p[0] === "nx_clientes_admin").length, 2);
    assert.equal(b.alvo.querySelector(".adm-kpis").hidden, false);
    d.doc.body.removeChild(b.alvo);
    const s = await montarAdmin({ clientes });
    assert.equal(s.pedidos.filter(p => p[0] === "nx_clientes_admin").length, 1, "sem filtro a própria lista vira o resumo");
    d.doc.body.removeChild(s.alvo);
    const o = await montarAdmin({ query: { org: "org-b", status: "ativo" }, superConta: true, clientes });
    const resumo = o.pedidos.filter(p => p[0] === "nx_clientes_admin").map(p => p[1].p_filtro)[1];
    assert.deepEqual(resumo, { busca: null, status: null, org_id: "org-b" }, "o resumo respeita a revenda escolhida");
    const kpi = o.alvo.querySelector(".adm-kpis .kpi");
    assert.equal(kpi.querySelector(".kpi-valor").textContent, "1");
    assert.match(ajudaDoKpi(kpi), /revenda escolhida no filtro/);
  } finally { d.fim(); }
});

/* ================================================================== complementos (texto-fonte) */

test("CSS: toda animação nova é desligada em prefers-reduced-motion e nada usa transition: all", () => {
  const css = ler("web/app/automacoes.css") + ler("web/app/config.css");
  assert.doesNotMatch(css, /transition:\s*all/);
  for (const k of ["au-entra", "au-pulso", "au-sobe", "au-brilho", "cfg-pulso"]) assert.ok(css.includes(`@keyframes ${k}`), k);
  const reduzido = css.split("prefers-reduced-motion: reduce").slice(1).join("\n");
  for (const cls of [".au-item", ".au-ex", ".au-dg-anim .au-dg-no", ".au-gd-anim .au-gd-pilha", ".au-foco-brilho", ".au-ponto-on::after", ".cfg-status-dot::after"]) assert.ok(reduzido.includes(cls), `${cls} fora do bloco reduced-motion`);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, "nenhuma cor escrita: só tokens");
});

test("telas carregam o CSS novo pelo mecanismo do app (ui.carregarCss) e não editam arquivos de outras frentes", () => {
  assert.match(ler("web/app/config.js"), /ui\.carregarCss\("config"\)/);
  assert.match(ler("web/app/admin.js"), /ui\.carregarCss\("config"\)/);
  assert.match(ler("web/app/cv-config.js"), /ui\.carregarCss\("config"\)/);
  assert.match(ler("web/app/auto-editor.js"), /pintarDiagrama\(\)/);
});
