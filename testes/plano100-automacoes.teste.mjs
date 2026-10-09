/* ÓRBITA — plano «100+ melhorias» (08/10/2026), frente G (Automações, Configurações, Admin).
   Rodar: node --test testes/plano100-automacoes.teste.mjs
   (a) lógica pura nova (auto-logica, cv-config, admin): séries do servidor, decisão da IA, perguntas da IA, montagem reprovada,
       histórico/contadores/aviso do número, uso de IA por dia, números do cliente, link de convite seguro, receitas novas;
   (b) comportamento das telas num DOM de mentira (o mesmo do plano50-automacoes): lista e «Criar com IA» (G4, G9), execuções no
       editor (G2, G3), Números (G1, G6), Configurações (G7) e Admin (G2, G5, G10); (c) complementos estáticos do CSS.
   Sem rede, sem serviços reais: as RPCs são dublês com o formato das migrações 20261008b/c. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import * as L from "../web/app/auto-logica.js";
import * as CV from "../web/app/cv-config.js";
import * as ADM from "../web/app/admin.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ler = f => readFileSync(resolve(RAIZ, f), "utf8");
const U = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BASE = {
  funis: [{ id: U(1), nome: "Pacientes", padrao: true, estagios: [
    { id: U(11), nome: "Nova conversa", marco: "nova", tipo: "aberto" }, { id: U(13), nome: "Avaliou / orçamento", marco: "orcamento", tipo: "aberto" },
    { id: U(12), nome: "Avaliação agendada", marco: "agendada", tipo: "aberto" }] }],
  etiquetas: [{ id: U(31), nome: "Orçamento", cor: "#E5B35C" }],
  usuarios: [{ id: U(41), nome: "Ana Lima", papel: "atendente" }, { id: U(42), nome: "Bruno Reis", papel: "admin" }],
  departamentos: [{ id: U(51), nome: "Recepção" }], canais: [{ id: U(61), nome: "Recepção WhatsApp" }], templates: [], campos: [],
};
const VOCAB = { contato: "Paciente", negocio: "Oportunidade", g_negocio: "a", ganhar: "Fechou", perder: "Não fechou", vertical: "odonto" };
const ERRO_SEM_RPC = () => Object.assign(new Error("Could not find the function public.nx_x in the schema cache"), { codigo: "PGRST202", status: 404 });

/* ================================================================== (a) lógica pura */

test("G2 serieExecucoesServidor: [{dia, ok, erro}] vira a série do gráfico (14 dias inteiros); resposta que não é série → null", () => {
  const lista = Array.from({ length: 14 }, (_, i) => ({ dia: `2026-10-${String(i + 1).padStart(2, "0")}`, ok: i % 3, erro: i === 13 ? 2 : 0 }));
  const s = L.serieExecucoesServidor([...lista].reverse());            // fora de ordem: a série sai do mais antigo ao mais novo
  assert.equal(s.servidor, true);
  assert.equal(s.dias, 14);
  assert.equal(s.serie[0].dia, "2026-10-01");
  assert.equal(s.serie[13].rotulo, "14/10");
  assert.equal(s.serie[13].semana, "qua", "14/10/2026 é quarta");
  assert.deepEqual([s.serie[13].ok, s.serie[13].erro, s.serie[13].total, s.serie[13].espera, s.serie[13].pulado], [1, 2, 3, 0, 0]);
  assert.equal(s.n, lista.reduce((a, x) => a + x.ok + x.erro, 0));
  assert.equal(s.recortado, false);
  assert.equal(L.serieExecucoesServidor(null), null);
  assert.equal(L.serieExecucoesServidor([]), null);
  assert.equal(L.serieExecucoesServidor({ itens: [] }), null, "objeto (RPC antiga) não é série");
  assert.equal(L.serieExecucoesServidor([{ dia: "ontem", ok: 1 }]), null, "dia inválido: não desenha nada inventado");
  assert.equal(L.serieExecucoesServidor([{ dia: "2026-10-01", ok: "-3", erro: "x" }]).serie[0].total, 0, "contagem negativa/lixo vira 0");
});

test("G3 decisaoIA: etapa/nota/resumo/pulado/pedida/erro lidos do detalhe do servidor, com o motivo da IA", () => {
  const e = L.decisaoIA("Tarefa criada para Ana · IA pedida: a IA escolheria a etapa · IA: movido para «Avaliou / orçamento» (pediu o preço do implante)");
  assert.equal(e.tipo, "etapa"); assert.equal(e.etapa, "Avaliou / orçamento"); assert.equal(e.motivo, "pediu o preço do implante");
  assert.equal(e.jaEstava, false); assert.match(e.frase, /^A IA moveu para «Avaliou \/ orçamento»\.$/);
  const f = L.decisaoIA("IA: movido para «Perdido» no funil «Pacientes» (disse que fechou com outra clínica (mais barata))");
  assert.equal(f.funil, "Pacientes"); assert.equal(f.motivo, "disse que fechou com outra clínica (mais barata)", "parênteses dentro do motivo");
  const j = L.decisaoIA("IA: já estava em «Nova conversa»");
  assert.equal(j.jaEstava, true); assert.equal(j.motivo, ""); assert.match(j.frase, /manteve/);
  const n = L.decisaoIA("IA: lead com nota 72 (quer começar ainda este mês)");
  assert.deepEqual([n.tipo, n.score, n.motivo], ["nota", 72, "quer começar ainda este mês"]);
  assert.equal(L.decisaoIA("IA: resumo da conversa gravado como nota").tipo, "resumo");
  const p = L.decisaoIA("IA: pulado (a cota de IA do mês acabou)");
  assert.deepEqual([p.tipo, p.motivo], ["pulado", "a cota de IA do mês acabou"]);
  const w = L.decisaoIA("Mensagem na fila · IA pedida: a IA daria uma nota de 0 a 100 ao lead");
  assert.equal(w.tipo, "pedida"); assert.match(w.frase, /^Aguardando a decisão da IA/);
  const x = L.decisaoIA("IA: a resposta da IA não pôde ser aplicada (a etapa escolhida não é uma das opções do funil)");
  assert.equal(x.tipo, "erro"); assert.match(x.frase, /não conseguiu decidir: a resposta da IA não pôde ser aplicada/);
  assert.equal(L.decisaoIA("Tarefa criada para Dra. Helena"), null, "sem passo de IA");
  assert.equal(L.decisaoIA(""), null); assert.equal(L.decisaoIA(null), null);
  assert.equal(L.decisaoIA("Cliente IAra respondeu"), null, "«IA» no meio de uma palavra não conta");
});

test("G3 rotuloLinkExecucao: o link diz para onde vai, no vocabulário da vertical", () => {
  assert.equal(L.rotuloLinkExecucao("#/conversas/901", VOCAB), "Abrir a conversa");
  assert.equal(L.rotuloLinkExecucao("#/crm/negocio/801", VOCAB), "Abrir a oportunidade");
  assert.equal(L.rotuloLinkExecucao("#/contatos/501", VOCAB), "Abrir o paciente");
  assert.equal(L.rotuloLinkExecucao("#/tarefas", VOCAB), "Ver tarefas");
  assert.equal(L.rotuloLinkExecucao("#/outra", VOCAB), "Abrir");
});

test("G4 perguntasDosAvisos: chips com o que existe no sistema conforme o assunto; sem assunto, Sim/Não; no máximo 8", () => {
  const ps = L.perguntasDosAvisos(["Não achei a etapa «Retorno»; qual uso?", "Qual pessoa recebe a tarefa?", "Use a etiqueta certa", "Mando também no fim de semana?", "", null], BASE);
  assert.equal(ps.length, 4, "vazios ficam de fora");
  assert.deepEqual(ps[0].opcoes, ["Nova conversa", "Avaliou / orçamento", "Avaliação agendada"]);
  assert.deepEqual(ps[1].opcoes, ["Ana Lima", "Bruno Reis"]);
  assert.deepEqual(ps[2].opcoes, ["Orçamento"]);
  assert.deepEqual(ps[3].opcoes, ["Sim", "Não"]);
  assert.deepEqual(ps.map(p => p.id), ["p0", "p1", "p2", "p3"]);
  assert.deepEqual(L.perguntasDosAvisos(["Qual etapa?"], {}).at(0).opcoes, ["Sim", "Não"], "assunto sem opções no sistema: Sim/Não");
  assert.equal(L.perguntasDosAvisos(Array.from({ length: 12 }, (_, i) => `dúvida ${i}`), BASE).length, 8);
});

test("G4 descricaoComRespostas: pedido + respostas, sem empilhar respostas antigas, dentro do limite", () => {
  const ps = [{ id: "p0", pergunta: "Qual etapa?" }, { id: "p1", pergunta: "Quem recebe?" }];
  const r = L.descricaoComRespostas("Quando o orçamento ficar parado, avisa", ps, { p0: "Avaliou / orçamento", p1: "  " });
  assert.equal(r.usadas, 1); assert.equal(r.cortado, false);
  assert.equal(r.texto, "Quando o orçamento ficar parado, avisa\n\nRespostas às dúvidas da IA:\n- Qual etapa? → Avaliou / orçamento");
  const de_novo = L.descricaoComRespostas(r.texto, ps, { p1: "Ana Lima" });
  // revisão 09/10: um bloco só, mas as respostas da rodada anterior continuam (as novas primeiro) — antes a IA perdia o que já fora respondido
  assert.equal(de_novo.texto, "Quando o orçamento ficar parado, avisa\n\nRespostas às dúvidas da IA:\n- Quem recebe? → Ana Lima\n- Qual etapa? → Avaliou / orçamento", "um bloco, com as respostas das duas rodadas");
  assert.deepEqual(L.descricaoComRespostas("abc", ps, {}), { texto: "abc", usadas: 0, cortado: false });
  const longo = L.descricaoComRespostas("x".repeat(1480), ps, { p0: "y".repeat(50) });
  assert.equal(longo.cortado, true); assert.equal(longo.usadas, 0); assert.ok(longo.texto.length <= L.LIMITES.descricao_ia);
});

test("G4 montagemReprovada: automacao_invalida COM a automação volta para o editor com o motivo; sem ela (servidor antigo) → null", () => {
  const e = Object.assign(new Error("automacao_invalida"), { codigo: "automacao_invalida", resposta: { ok: false, erro: "automacao_invalida",
    detalhe: "ação 1: escolha a etapa", onde: "entao", indice: 0, explicacao: "Move quem pede preço.", avisos: ["Não achei a etapa"],
    automacao: { nome: "Preço → orçamento", gatilho: { tipo: "mensagem_recebida", campos: { palavras: ["preço"] } }, condicoes: [], acoes: [{ tipo: "mover_estagio", campos: {} }] } } });
  const m = L.montagemReprovada(e, BASE);
  assert.equal(m.auto.nome, "Preço → orçamento"); assert.equal(m.auto.ativo, false, "nasce desligada");
  assert.deepEqual(m.reprovada, { motivo: "ação 1: escolha a etapa", onde: "entao", indice: 0 });
  assert.equal(m.explicacao, "Move quem pede preço."); assert.deepEqual(m.avisos, ["Não achei a etapa"]);
  assert.equal(L.montagemReprovada(Object.assign(new Error("x"), { codigo: "automacao_invalida", resposta: { ok: false } }), BASE), null);
  assert.equal(L.montagemReprovada(Object.assign(new Error("x"), { codigo: "ia_cota" }), BASE), null);
  assert.equal(L.montagemReprovada(null, BASE), null);
});

test("G8 receitas novas: lead do site sem resposta em 10 min e lembrete da equipe 24 h antes — válidas, desligadas e honestas", () => {
  const site = L.MODELOS.find(m => m.id === "site_sem_resposta"), eq = L.MODELOS.find(m => m.id === "lembrete_equipe_consulta");
  assert.ok(site && eq);
  for (const v of ["odonto", "oficina", "loja", "generico"]) {
    assert.ok(L.modelosDaVertical(v).some(m => m.id === "site_sem_resposta") && L.modelosDaVertical(v).some(m => m.id === "lembrete_equipe_consulta"), v);
    for (const id of ["site_sem_resposta", "lembrete_equipe_consulta"]) {
      const a = L.aplicarModelo(id, BASE, { vertical: v });
      assert.equal(a.ativo, false, `${id} nasce desligada`);
      assert.equal(L.validar({ ...a, ativo: true }, { base: BASE }).ok, true, `${id}/${v} pronta para ligar`);
      assert.equal(L.enviaMensagem(a), false, `${id} não manda nada ao cliente`);
    }
  }
  const a = L.aplicarModelo("site_sem_resposta", BASE, VOCAB);
  assert.deepEqual([a.gatilho, a.config.minutos, a.condicoes[0].campo, a.condicoes[0].valor], ["sem_resposta", 10, "origem", "site"]);
  assert.match(site.aviso, /Rastreio do site/);
  assert.match(eq.aviso, /modelo aprovado na Meta/, "diz o que o lembrete ao cliente exigiria");
  const loja = L.aplicarModelo("lembrete_equipe_consulta", BASE, { vertical: "loja" });
  assert.match(loja.acoes[0].titulo, /^Confirmar a entrega de \{primeiro_nome\}: \{data_consulta\}/, "palavra da vertical, variáveis intactas");
  assert.match(L.tituloModelo(eq, { vertical: "oficina" }), /^Visita marcada/);
});

test("G1 historicoDoServidor / desdeQuando: estados do servidor em rótulo e tom; lixo e banco antigo", () => {
  const h = CV.historicoDoServidor([
    { id: 2, canal_id: "c", estado: "desconectado", detalhe: "close · sem internet", em: "2026-10-08T14:00:00Z" },
    { id: 1, canal_id: "c", estado: "conectado", detalhe: null, em: "2026-10-07T10:00:00Z" },
    { id: 3, estado: "inventado", em: "2026-10-08T15:00:00Z" }, { id: 4, estado: "conectado", em: "não é data" }, null]);
  assert.deepEqual(h.map(x => [x.rotulo, x.tom]), [["Desconectado", "ruim"], ["Conectado", "ok"]]);
  assert.equal(h[0].detalhe, "close · sem internet");
  assert.equal(h[0].em, Date.parse("2026-10-08T14:00:00Z"));
  assert.equal(CV.historicoDoServidor({ itens: [] }), null, "não é a lista: a tela usa o histórico local");
  assert.deepEqual(CV.historicoDoServidor([]), []);
  assert.equal(CV.desdeQuando(h, "desconectado"), Date.parse("2026-10-08T14:00:00Z"));
  assert.equal(CV.desdeQuando(h, "conectado"), null, "o último registro não é «conectado»: sem «desde» inventado");
  assert.equal(CV.desdeQuando([], "conectado"), null);
  assert.equal(CV.historicoDoServidor(Array.from({ length: 20 }, (_, i) => ({ estado: "conectado", em: new Date(1e12 + i).toISOString() }))).length, 8);
});

test("G1 contadoresDoCanal e avisoAppSecret", () => {
  const r = CV.contadoresDoCanal({ eco: 4, grupo: 0, lid: "2", http_413: 1, desde: "2026-10-01T00:00:00Z", estranho: 9 });
  assert.deepEqual(r.itens.map(x => [x.chave, x.n]), [["eco", 4], ["lid", 2], ["http_413", 1]]);
  assert.equal(r.total, 7); assert.equal(r.desde, "2026-10-01T00:00:00Z");
  assert.ok(r.itens.every(x => x.explicacao.length > 20));
  assert.deepEqual(CV.contadoresDoCanal(null), { itens: [], total: 0, desde: null });
  const meta = { id: "m1", provedor: "meta", tem_app_secret: false };
  assert.match(CV.avisoAppSecret(meta, { app_secret_global: true }), /«\?c=»/);
  assert.equal(CV.avisoAppSecret(meta, { app_secret_global: false }), null);
  assert.equal(CV.avisoAppSecret(meta, null), null, "sem teste, sem aviso (não sabemos)");
  assert.equal(CV.avisoAppSecret({ ...meta, tem_app_secret: true }, { app_secret_global: true }), null);
  assert.equal(CV.avisoAppSecret({ id: "c", provedor: "codewords" }, { app_secret_global: true }), null);
});

test("G6 marcarTesteLocal: o teste do assistente conta como mensagem_teste neste aparelho, sem duplicar e sem derrubar sem storage", () => {
  const mem = new Map();
  const st = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  mem.set("nx-onb:cli:conta", JSON.stringify({ pulados: ["agenda_faixas"] }));
  assert.equal(CV.marcarTesteLocal(st, "cli", "conta"), true);
  assert.equal(CV.marcarTesteLocal(st, "cli", "conta"), true);
  const p = JSON.parse(mem.get("nx-onb:cli:conta"));
  assert.deepEqual(p.pulados, ["agenda_faixas", "mensagem_teste"]);
  assert.ok(Number.isFinite(p.teste_local_em));
  assert.equal(CV.marcarTesteLocal({ getItem() { throw new Error("x"); } }, "cli", "conta"), false);
  CV.marcarTesteLocal(st, "cli", null);
  assert.ok(mem.has("nx-onb:cli:-"));
});

test("G2 resumoUsoIA + dolar: totais, séries, custo incompleto (dias antes do custo gravado) e banco antigo", () => {
  const r = ADM.resumoUsoIA([
    { dia: "2026-10-02", chamadas: 3, tokens_in: 9000, tokens_out: 600, custo_usd: 0 },
    { dia: "2026-10-01", chamadas: 0, tokens_in: 0, tokens_out: 0, custo_usd: 0 },
    { dia: "2026-10-03", chamadas: 2, tokens_in: 6000, tokens_out: 400, custo_usd: 0.0321 }]);
  assert.deepEqual(r.serieChamadas, [0, 3, 2], "do mais antigo ao mais novo");
  assert.deepEqual([r.chamadas, r.tokens_in, r.tokens_out, r.custo_usd, r.dias], [5, 15000, 1000, 0.0321, 3]);
  assert.equal(r.custoIncompleto, true, "dia 02 teve chamadas sem custo");
  assert.equal(ADM.resumoUsoIA([{ dia: "2026-10-03", chamadas: 1, custo_usd: 0.01 }]).custoIncompleto, false);
  assert.equal(ADM.resumoUsoIA(null), null); assert.equal(ADM.resumoUsoIA([{ dia: "x" }]), null); assert.equal(ADM.resumoUsoIA([]), null);
  assert.equal(ADM.dolar(0.0321), "US$ 0,0321"); assert.equal(ADM.dolar(12.5), "US$ 12,50"); assert.equal(ADM.dolar(0), "US$ 0,00");
});

test("G10 estadoNumerosCliente / G5 semPacote / H305 hostServeApp e linkConvite", () => {
  assert.equal(ADM.estadoNumerosCliente(undefined), null, "servidor sem canais: a coluna some");
  assert.deepEqual(ADM.estadoNumerosCliente([]), { total: 0, conectados: 0, caidos: 0, rotulo: "Sem número", tom: "neutra" });
  assert.equal(ADM.estadoNumerosCliente([{ estado: "conectado" }]).rotulo, "Conectado");
  assert.equal(ADM.estadoNumerosCliente([{ estado: "conectado" }, { estado: "conectado" }]).rotulo, "2 conectados");
  assert.deepEqual(ADM.estadoNumerosCliente([{ estado: "conectado" }, { estado: "desconectado" }]).tom, "ruim");
  assert.equal(ADM.estadoNumerosCliente([{ estado: "desconhecido" }]).rotulo, "Sem confirmação");
  assert.equal(ADM.semPacote({ comercial: null }), true); assert.equal(ADM.semPacote({ comercial: {} }), true);
  assert.equal(ADM.semPacote({ comercial: { pacote: "ultra" } }), false);
  for (const h of ["orbita-nexus-ads.netlify.app", "crm.agencia.com.br"]) assert.equal(ADM.hostServeApp(h), true, h);
  for (const h of ["jpfamelli.github.io", "localhost", "127.0.0.1", "app.test", "x.localhost", ""]) assert.equal(ADM.hostServeApp(h), false, h);
  const conv = "#/convite/" + "a".repeat(64);
  assert.deepEqual(ADM.linkConvite("https://crm.x.com.br/app/#/convite/1", { hostname: "localhost", href: "http://localhost/app/" }), { link: "https://crm.x.com.br/app/#/convite/1", motivo: null }, "absoluto: o servidor sabe o endereço");
  assert.equal(ADM.linkConvite(conv, { hostname: "orbita-nexus-ads.netlify.app", href: "https://orbita-nexus-ads.netlify.app/app/#/admin" }).link, `https://orbita-nexus-ads.netlify.app/app/${conv}`);
  const ruim = ADM.linkConvite(conv, { hostname: "jpfamelli.github.io", href: "https://jpfamelli.github.io/nexus-ads/app/#/admin" });
  assert.equal(ruim.link, null); assert.match(ruim.motivo, /jpfamelli\.github\.io.*sairia quebrado/);
  assert.equal(ADM.linkConvite("", { hostname: "orbita-nexus-ads.netlify.app" }).link, null);
});

/* ================================================================== (b) DOM mínimo (cópia do plano50-automacoes) */

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
    append(...ns) { for (const n of ns.flat(Infinity)) if (n !== undefined && n !== false) this.appendChild(typeof n === "object" && n && n.nodeType ? n : new Texto(n)); }
    prepend(...ns) { const ref = this.firstChild; for (const n of ns) this.insertBefore(typeof n === "object" && n.nodeType ? n : new Texto(n), ref); }
    replaceChildren(...ns) { for (const c of [...this.childNodes]) this.removeChild(c); this.append(...ns); }
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
  // o Texto guarda String(n): um null que escapasse viraria «null» na tela (o mesmo que o Element.append real faz) — os testes procuram
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
      this.attrs = new Map(); this.value = ""; this.checked = false; this.disabled = false; this.hidden = false; this.open = false; this.offsetWidth = 0; this.selectionStart = null; this.readOnly = false;
      const estilos = new Map(); const el = this;
      this.style = { setProperty: (k, v) => { if (v === "" || v == null) estilos.delete(k); else estilos.set(k, String(v)); }, getPropertyValue: k => estilos.get(k) || "", removeProperty: k => { estilos.delete(k); } };
      this.dataset = new Proxy({}, { get: (_, k) => (typeof k === "string" && el.attrs.has("data-" + kebab(k)) ? el.attrs.get("data-" + kebab(k)) : undefined), set: (_, k, v) => { el.attrs.set("data-" + kebab(k), String(v)); return true; }, deleteProperty: (_, k) => { el.attrs.delete("data-" + kebab(k)); return true; } });
      const cls = () => (el.attrs.get("class") || "").split(/\s+/).filter(Boolean);
      this.classList = { add: (...c) => { const s = new Set(cls()); c.forEach(x => s.add(x)); el.attrs.set("class", [...s].join(" ")); }, remove: (...c) => { const s = new Set(cls()); c.forEach(x => s.delete(x)); el.attrs.set("class", [...s].join(" ")); }, contains: c => cls().includes(c), toggle: (c, f) => { const t = f === undefined ? !cls().includes(c) : !!f; t ? this.classList.add(c) : this.classList.remove(c); return t; } };
    }
    setAttribute(k, v) { this.attrs.set(k, String(v)); } getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); } removeAttribute(k) { this.attrs.delete(k); }
    get id() { return this.attrs.get("id") || ""; } set id(v) { this.attrs.set("id", String(v)); }
    get name() { return this.attrs.get("name") || ""; } set name(v) { this.attrs.set("name", String(v)); }
    get type() { return this.attrs.get("type") || (this.localName === "input" ? "text" : ""); } set type(v) { this.attrs.set("type", v); }
    get tabIndex() { return Number(this.attrs.get("tabindex") ?? -1); } set tabIndex(v) { this.attrs.set("tabindex", String(v)); }
    get className() { return this.attrs.get("class") || ""; } set className(v) { this.attrs.set("class", String(v)); }
    get href() { return this.attrs.get("href") || ""; } set href(v) { this.attrs.set("href", String(v)); }
    get rel() { return this.attrs.get("rel") || ""; } set rel(v) { this.attrs.set("rel", String(v)); }
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
function comDom() {
  const { doc, Evento } = criarDom();
  const salvo = { document: globalThis.document, Event: globalThis.Event, MouseEvent: globalThis.MouseEvent, KeyboardEvent: globalThis.KeyboardEvent, window: globalThis.window, matchMedia: globalThis.matchMedia, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, location: globalThis.location };
  globalThis.document = doc; globalThis.Event = Evento; globalThis.KeyboardEvent = Evento; globalThis.MouseEvent = Evento;
  globalThis.window = globalThis;
  const mem = new Map(), mem2 = new Map();
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  globalThis.sessionStorage = { getItem: k => (mem2.has(k) ? mem2.get(k) : null), setItem: (k, v) => mem2.set(k, String(v)), removeItem: k => mem2.delete(k) };
  return { doc, Evento, mem, fim() { for (const [k, v] of Object.entries(salvo)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } } };
}
const tique = (n = 3) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : setTimeout(f, 0)); setTimeout(f, 0); });
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function uiReal() { return import("../web/app/ui.js"); }
const textoDe = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
const semNullNaTela = raiz => assert.doesNotMatch(raiz.textContent, /\bnull\b|\bundefined\b/, "nada de «null»/«undefined» escapando para a tela");

function dadosLista() {
  return {
    vertical: "odonto", pode_editar: true, limite: { usadas: 2, limite: 8 }, base: BASE, ia: { disponivel: true, usadas: 2, limite: 300 }, sistema: [],
    itens: [
      { id: "a1", nome: "Lembrete por mensagem", gatilho: "antes_da_data", ativo: false, execucoes: 11, erros: 0, ultima_execucao_em: null, condicoes: [], config: { campo: "consulta", horas: 24 },
        acoes: [{ tipo: "enviar_mensagem", texto: "Olá, {primeiro_nome}!" }] },
      { id: "a2", nome: "IA classifica", gatilho: "mensagem_recebida", ativo: true, execucoes: 8, erros: 2, condicoes: [], config: {},
        acoes: [{ tipo: "ia_decidir", tarefa: "classificar_etapa" }] },
    ],
  };
}
function ctxAuto(ui, { rpc, fn, partes = [], query = {}, extra = {} }) {
  const d = globalThis.document;
  const alvo = d.body.appendChild(d.createElement("main"));
  const navegou = [], toasts = [];
  const ctx = {
    ui: { ...ui, confirmar: async () => true, toast: (t, o) => { toasts.push([t, o && o.tipo]); }, menu() {}, carregarCss: () => Promise.resolve(true) },
    api: { rpcC: rpc, fn: fn || (async () => ({})), mensagemErro: e => String(e && e.message || e) },
    rota: { partes, query }, alvo, versao: "dev", titulo() {}, navegar: h => navegou.push(h), pulso: null,
    cliente: { id: "cli-1", nome: "Clínica Teste", vertical: "odonto" }, sessao: { conta: { id: "conta-1", nome: "Ana Lima" } }, vocab: VOCAB,
    comandos: { registrar: () => () => {} }, ...extra,
  };
  return { ctx, navegou, toasts };
}

/* ---------------------------------------------------------------- Automações: lista, «Criar com IA», execuções */

test("G9 lista: esqueleto de KPIs + cartões enquanto carrega; vazio com a ilustração do tema «automacoes»", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    let soltar;
    const { ctx } = ctxAuto(ui, { rpc: () => new Promise(r => { soltar = r; }) });
    const p = A.montar(ctx);
    await tique();
    assert.ok(ctx.alvo.querySelector(".esqueleto-kpi"), "KPIs no esqueleto");
    assert.equal(ctx.alvo.querySelectorAll(".esqueleto-cartao").length, 2, "cartões no esqueleto");
    soltar({ ...dadosLista(), itens: [] });
    await p; await tique();
    const vz = ctx.alvo.querySelector(".au-vazio .vazio");
    assert.equal(vz.dataset.tema, "automacoes");
    assert.equal(ctx.alvo.querySelector(".esqueleto"), null);
    A.desmontar();
  } finally { d.fim(); }
});

test("G9 lista: ligar com sucesso mostra o ✓ (ui.checkSucesso) no interruptor; desligar e recusa do servidor não comemoram", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const checks = [];
    let recusar = false;
    const { ctx } = ctxAuto(ui, { rpc: async (nome, p) => {
      if (nome === "nx_automacoes_listar") return dadosLista();
      if (nome === "nx_automacao_ativar") { if (recusar) throw Object.assign(new Error("x"), { codigo: "automacao_invalida" }); return { id: p.p_id, ativo: p.p_ativo }; }
      return {};
    } });
    ctx.ui.checkSucesso = el => { checks.push(el); return Promise.resolve(true); };
    await A.montar(ctx); await tique();
    const [sw1, sw2] = ctx.alvo.querySelectorAll(".au-item .au-sw");
    sw2.dispatchEvent(new d.Evento("click")); await tique(6);            // desliga a2
    assert.equal(checks.length, 0, "desligar não comemora");
    sw1.dispatchEvent(new d.Evento("click")); await tique(6);            // liga a1 (confirmar → true)
    assert.equal(checks.length, 1);
    assert.ok(checks[0].classList.contains("au-item-sw"), "o ✓ cobre o interruptor do cartão");
    recusar = true;
    sw2.dispatchEvent(new d.Evento("click")); await tique(6);
    assert.equal(checks.length, 1, "o servidor recusou: sem ✓");
    A.desmontar();
  } finally { d.fim(); }
});

test("G4 «Criar com IA»: avisos viram perguntas com chips; responder e «Montar de novo» reenvia o pedido com as respostas", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const pedidos = [];
    const { ctx } = ctxAuto(ui, {
      rpc: async () => dadosLista(),
      fn: async (nome, corpo) => {
        pedidos.push(corpo.descricao);
        return { ok: true, explicacao: "Avisa quem pede preço.", avisos: pedidos.length === 1 ? ["Não achei a etapa de retorno; qual etapa uso?", "Quer mandar também no fim de semana?"] : [],
          automacao: { nome: "Preço", gatilho: { tipo: "mensagem_recebida", campos: { palavras: ["preço"] } }, condicoes: [], acoes: [{ tipo: "notificar", campos: { para: "responsavel", titulo: "Preço", texto: "Ver" } }] } };
      },
    });
    await A.montar(ctx); await tique();
    const area = ctx.alvo.querySelector(".au-ia-txt");
    area.value = "Quando alguém perguntar o preço, avisa o responsável";
    area.dispatchEvent(new d.Evento("input"));
    ctx.alvo.querySelector(".au-ia-bt").dispatchEvent(new d.Evento("click"));
    await tique(8);
    const itens = ctx.alvo.querySelectorAll(".au-ia-perg-item");
    assert.equal(itens.length, 2, "uma pergunta por aviso");
    assert.deepEqual(itens[0].querySelectorAll(".au-chip").map(c => c.textContent), ["Nova conversa", "Avaliou / orçamento", "Avaliação agendada"], "etapas do funil");
    assert.deepEqual(itens[1].querySelectorAll(".au-chip").map(c => c.textContent), ["Sim", "Não"]);
    const bt = ctx.alvo.querySelector(".au-ia-perg-bt");
    assert.equal(bt.disabled, true, "sem resposta, nada a reenviar");
    itens[0].querySelectorAll(".au-chip")[1].dispatchEvent(new d.Evento("click"));
    assert.equal(itens[0].querySelector(".au-ia-resp").value, "Avaliou / orçamento", "o chip preenche a resposta");
    assert.equal(itens[0].querySelectorAll(".au-chip")[1].getAttribute("aria-pressed"), "true");
    const livre = itens[1].querySelector(".au-ia-resp");
    livre.value = "Só em dias úteis"; livre.dispatchEvent(new d.Evento("input"));
    assert.equal(bt.disabled, false);
    assert.match(textoDe(ctx.alvo.querySelector(".au-ia-perg-nota")), /2 respostas.*cota/);
    bt.dispatchEvent(new d.Evento("click"));
    await tique(8);
    assert.equal(pedidos.length, 2, "a IA foi chamada de novo");
    assert.match(pedidos[1], /^Quando alguém perguntar o preço, avisa o responsável\n\nRespostas às dúvidas da IA:\n- Não achei a etapa de retorno; qual etapa uso\? → Avaliou \/ orçamento\n- Quer mandar também no fim de semana\? → Só em dias úteis$/);
    assert.equal(area.value, pedidos[1], "o pedido novo fica à vista na caixa");
    assert.equal(ctx.alvo.querySelectorAll(".au-ia-perg-item").length, 0, "a 2ª montagem veio sem dúvidas");
    semNullNaTela(ctx.alvo);
    A.desmontar();
  } finally { d.fim(); }
});

test("G4 [E167] «Criar com IA»: reprovada na conferência mas com a automação → mostra o motivo e abre no editor (não joga a cota fora)", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const { ctx, navegou } = ctxAuto(ui, {
      rpc: async () => dadosLista(),
      fn: async () => { throw Object.assign(new Error("automacao_invalida"), { codigo: "automacao_invalida", resposta: { ok: false, erro: "automacao_invalida",
        detalhe: "ação 1: escolha a etapa", onde: "entao", indice: 0, explicacao: "Move quem pede preço.", avisos: [],
        automacao: { nome: "Preço → orçamento", gatilho: { tipo: "mensagem_recebida", campos: {} }, condicoes: [], acoes: [{ tipo: "mover_estagio", campos: {} }] } } }); },
    });
    await A.montar(ctx); await tique();
    const area = ctx.alvo.querySelector(".au-ia-txt");
    area.value = "Quem perguntar preço vai para orçamento"; area.dispatchEvent(new d.Evento("input"));
    ctx.alvo.querySelector(".au-ia-bt").dispatchEvent(new d.Evento("click"));
    await tique(8);
    assert.equal(ctx.alvo.querySelector(".au-ia-erro"), null, "não é mais o erro «reescreva o pedido»");
    assert.match(textoDe(ctx.alvo.querySelector(".au-ia-reprovada")), /A conferência reprovou: ação 1: escolha a etapa\./);
    assert.equal(textoDe(ctx.alvo.querySelector(".au-ia-res-nome")), "Preço → orçamento");
    const abrir = ctx.alvo.querySelectorAll(".au-ia-res-acoes button")[0];
    abrir.dispatchEvent(new d.Evento("click"));
    assert.deepEqual(navegou, ["#/automacoes/nova?ia=1"]);
    // o editor que abre em seguida recebe a montagem reprovada e mostra o aviso
    ctx.rota = { partes: ["nova"], query: { ia: "1" } };
    await A.montar(ctx); await tique(4);
    assert.match(textoDe(ctx.alvo.querySelector(".au-ia-ped .au-ia-reprovada")), /reprovou esta montagem: ação 1: escolha a etapa/);
    await esperar(120);
    assert.ok(ctx.alvo.querySelector(".au-bloco[data-onde=entao]").classList.contains("au-bloco-com-erro"), "o problema aparece no bloco «Então»");
    A.desmontar();
  } finally { d.fim(); }
});

function execucoesFalsas() {
  const agora = Date.now();
  return [
    { criado_em: new Date(agora - 3600e3).toISOString(), ok: true, estado: "concluida", chave: "ev:1", link: "#/conversas/901", passo: 1, total_passos: 1,
      detalhe: "IA pedida: a IA escolheria a etapa · IA: movido para «Avaliou / orçamento» (perguntou o preço do implante)" },
    { criado_em: new Date(agora - 7200e3).toISOString(), ok: true, estado: "concluida", chave: "ev:2", link: "#/crm/negocio/801", detalhe: "IA: pulado (a cota de IA do mês acabou)" },
    { criado_em: new Date(agora - 9000e3).toISOString(), ok: true, estado: "concluida", chave: "ev:3", link: "#/crm/negocio/802", detalhe: "Tarefa criada para Ana" },
  ];
}

test("G2 + G3 execuções: série do servidor (14 dias, «contadas no servidor») e a decisão da IA em destaque com o link certo", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const pedidos = [];
    const serie = Array.from({ length: 14 }, (_, i) => { const x = new Date(Date.now() - (13 - i) * 86400e3); return { dia: x.toISOString().slice(0, 10), ok: i === 13 ? 30 : 1, erro: i === 12 ? 2 : 0 }; });
    const { ctx } = ctxAuto(ui, { partes: ["a2"], query: { aba: "execucoes" }, rpc: async (nome, p) => {
      pedidos.push([nome, p]);
      if (nome === "nx_automacoes_listar") return dadosLista();
      if (nome === "nx_automacao_execucoes") return execucoesFalsas();
      if (nome === "nx_automacao_execucoes_dia") return serie;
      return {};
    } });
    await A.montar(ctx); await tique(8);
    assert.deepEqual(pedidos.find(p => p[0] === "nx_automacao_execucoes_dia")[1], { p_automacao: "a2", p_dias: 14 });
    const g = ctx.alvo.querySelector(".au-gd");
    assert.equal(g.dataset.fonte, "servidor");
    assert.equal(g.querySelectorAll(".au-gd-col").length, 14, "a janela inteira, não só as 3 carregadas");
    assert.equal(textoDe(g.querySelector(".au-gd-sub")), "Últimos 14 dias · 45 execuções, contadas no servidor");
    assert.deepEqual(g.querySelectorAll(".au-gd-tab thead th").map(textoDe), ["Dia", "sem erro", "com erro", "Total"], "o servidor só separa sem erro × com erro");
    // G3: decisão da IA
    const linhas = ctx.alvo.querySelectorAll(".au-ex");
    const ia0 = linhas[0].querySelector(".au-ex-ia");
    assert.equal(ia0.dataset.tipo, "etapa");
    assert.equal(textoDe(ia0.querySelector(".au-ex-ia-frase")), "A IA moveu para «Avaliou / orçamento».");
    assert.match(textoDe(ia0.querySelector(".au-ex-ia-motivo")), /«perguntou o preço do implante»/);
    assert.equal(textoDe(linhas[0].querySelector(".au-ex-abrir")), "Abrir a conversa");
    assert.equal(linhas[1].querySelector(".au-ex-ia").dataset.tipo, "pulado");
    assert.equal(textoDe(linhas[1].querySelector(".au-ex-abrir")), "Abrir a oportunidade");
    assert.equal(linhas[2].querySelector(".au-ex-ia"), null, "execução sem IA não ganha o bloco");
    semNullNaTela(ctx.alvo);
    A.desmontar();
  } finally { d.fim(); }
});

test("G2 execuções: banco sem nx_automacao_execucoes_dia (404) → o gráfico volta a ser calculado no navegador, sem erro na tela", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const { ctx } = ctxAuto(ui, { partes: ["a2"], query: { aba: "execucoes" }, rpc: async nome => {
      if (nome === "nx_automacoes_listar") return dadosLista();
      if (nome === "nx_automacao_execucoes") return execucoesFalsas();
      if (nome === "nx_automacao_execucoes_dia") throw ERRO_SEM_RPC();
      return {};
    } });
    await A.montar(ctx); await tique(8);
    const g = ctx.alvo.querySelector(".au-gd");
    assert.equal(g.dataset.fonte, "local");
    assert.equal(textoDe(g.querySelector(".au-gd-sub")), "Últimos 14 dias · 3 execuções registradas");
    assert.equal(ctx.alvo.querySelectorAll(".au-ex").length, 3, "a lista continua");
    assert.equal(ctx.alvo.querySelector(".erro-cartao"), null);
    A.desmontar();
  } finally { d.fim(); }
});

test("G9 editor: salvar mostra o ✓ no botão antes de voltar à lista", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const A = await import("../web/app/automacoes.js");
    const ordem = [];
    const { ctx } = ctxAuto(ui, { partes: ["a2"], rpc: async (nome, p) => {
      if (nome === "nx_automacoes_listar") return dadosLista();
      if (nome === "nx_automacao_salvar") return { ...p.p_auto };
      return {};
    } });
    ctx.ui.checkSucesso = el => { ordem.push(["check", el.textContent.trim()]); return Promise.resolve(true); };
    ctx.navegar = h => ordem.push(["navegar", h]);
    await A.montar(ctx); await tique(4);
    const salvar = ctx.alvo.querySelectorAll(".au-ed-acoes button").find(b => textoDe(b) === "Salvar");
    salvar.dispatchEvent(new d.Evento("click"));
    await tique(10);
    assert.deepEqual(ordem, [["check", "Salvar"], ["navegar", "#/automacoes"]]);
    A.desmontar();
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- Números de WhatsApp (G1, G6) */

function canaisFalsos() {
  return [
    { id: "cw1", nome: "Recepção", provedor: "codewords", status: "erro", estado: "desconectado", numero_exibicao: "+55 12 99999-0000",
      codewords: { tem_api_key: true, conectado: false, phone_id: "ph1", numero_conferido: true, rota: "fluxo", service_id: "svc",
        contadores: { eco: 3, grupo: 12, http_422: 1, desde: "2026-10-01T12:00:00Z" } } },
    { id: "m1", nome: "Oficial", provedor: "meta", status: "ativo", estado: "conectado", tem_app_secret: false, phone_number_id: "123", waba_id: "456" },
  ];
}
function ctxNumeros(ui, { rpc, fn, canais: cn }) {
  const d = globalThis.document;
  const alvo = d.body.appendChild(d.createElement("div"));
  const toasts = [], comandos = [];
  let aoMudarCanais = null;
  const ctx = {
    ui: { ...ui, toast: (t, o) => { toasts.push([t, o && o.tipo]); }, menu() {}, carregarCss: () => Promise.resolve(true), confirmar: async () => true },
    api: { rpcC: rpc, fn, mensagemErro: e => String(e && e.message || e) },
    rota: { partes: ["numeros"], query: {} }, versao: "dev", cliente: { id: "cli-1", nome: "Clínica Teste" }, sessao: { conta: { id: "conta-1" } },
    pode: () => true, temModulo: () => true, pronto: () => true, navegar() {},
    comandos: { registrar: c => { comandos.push(c); return () => comandos.splice(comandos.indexOf(c), 1); } },
    canais: cn === false ? undefined : { caidos: () => [], assinar: f => { aoMudarCanais = f; return () => { aoMudarCanais = null; }; }, verNumero() {} },
  };
  return { ctx, alvo, toasts, comandos, avisarCanais: l => aoMudarCanais && aoMudarCanais(l), assinado: () => !!aoMudarCanais };
}

test("G1 Números: histórico do SERVIDOR com «desde», contadores explicados, «Reconferir agora» e o comando da paleta", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const montar = CV.secoesConfig.find(s => s.id === "numeros").montar;
    const chamadas = [];
    const canais = canaisFalsos();
    const hist = { cw1: [{ id: 2, canal_id: "cw1", estado: "desconectado", detalhe: "close", em: new Date(Date.now() - 20 * 60e3).toISOString() },
      { id: 1, canal_id: "cw1", estado: "conectado", detalhe: null, em: new Date(Date.now() - 86400e3).toISOString() }], m1: [] };
    const t = ctxNumeros(ui, {
      rpc: async (nome, p) => { chamadas.push([nome, p]); if (nome === "nx_canais_listar") return canais; if (nome === "nx_cv_base") return { departamentos: [], templates: [] };
        if (nome === "nx_canal_historico_listar") return hist[p.p_canal]; return {}; },
      fn: async (nome, corpo) => { chamadas.push([nome, corpo]); return nome === "nx-enviar" ? { ok: true, numero: "+55 12", app_inscrito: true, app_secret_global: true } : { ok: true, conectado: true }; },
    });
    const limpar = await montar(t.ctx, t.alvo);
    await tique(4);
    assert.deepEqual(chamadas.filter(c => c[0] === "nx_canal_historico_listar").map(c => c[1]), [{ p_canal: "cw1", p_limite: 8 }, { p_canal: "m1", p_limite: 8 }]);
    const [cw, meta] = t.alvo.querySelectorAll(".cfg-canal");
    const h = cw.querySelector(".cfg-hist[data-fonte=servidor]");
    assert.ok(h, "histórico do servidor no lugar do local");
    assert.match(textoDe(h.querySelector("summary")), /^Histórico de conexão · 2$/);
    assert.match(textoDe(h.querySelector(".cfg-hist-item")), /Desconectado · close/);
    assert.match(textoDe(cw.querySelector(".cfg-desde")), /^Desconectado desde .*\(há 20 min\)$/);
    const cont = cw.querySelector(".cfg-contadores");
    assert.match(textoDe(cont.querySelector("summary")), /^Mensagens ignoradas · 16 desde 01\/10\/2026$/);
    assert.deepEqual(cont.querySelectorAll("dt").map(x => textoDe(x.firstChild)), ["Ecos das próprias mensagens", "Mensagens de grupo", "Pedidos recusados (422)"]);
    // revisão 09/10: só o aparelho grava histórico no servidor — lista VAZIA (número Meta) não apaga o histórico anotado neste aparelho
    assert.equal(meta.querySelector(".cfg-hist[data-fonte=servidor]"), null, "lista vazia do servidor não vira «histórico do servidor»");
    assert.equal(meta.querySelector(".cfg-aviso-secret"), null, "sem teste ainda, sem aviso");
    // a paleta ganhou o «Reconferir o número»
    assert.deepEqual(t.comandos.map(c => c.id), ["config.reconferir-numero"]);
    // «Reconferir agora»: um pedido por número, na ordem, e a lista refeita com o resultado (aviso do app secret no número da Meta)
    const bt = t.alvo.querySelector(".cfg-reconferir");
    assert.equal(textoDe(bt), "Reconferir agora");
    chamadas.length = 0;
    bt.dispatchEvent(new d.Evento("click"));
    await tique(12);
    assert.deepEqual(chamadas.filter(c => !c[0].startsWith("nx_")).map(c => [c[0], c[1].acao, c[1].canal]), [["nx-codewords", "estado", "cw1"], ["nx-enviar", "testar_canal", "m1"]]);
    assert.ok(chamadas.some(c => c[0] === "nx_canais_listar"), "recarregou a lista");
    assert.match(textoDe(t.alvo.querySelectorAll(".cfg-canal")[1].querySelector(".cfg-aviso-secret")), /app secret próprio.*«\?c=»/);
    assert.deepEqual(t.toasts.at(-1), ["Números reconferidos agora.", "ok"]);
    semNullNaTela(t.alvo);
    // estado ao vivo: o shell avisa que um número caiu → a lista se refaz (sem esqueleto); a mesma lista de novo não refaz
    chamadas.length = 0;
    t.avisarCanais([{ id: "cw1", nome: "Recepção", desde: "2026-10-09T10:00:00Z" }]);
    await tique(8);
    assert.equal(chamadas.filter(c => c[0] === "nx_canais_listar").length, 1);
    assert.equal(t.alvo.querySelector(".esqueleto"), null, "atualização ao vivo não pisca o esqueleto");
    t.avisarCanais([{ id: "cw1", nome: "Recepção", desde: "2026-10-09T10:00:00Z" }]);
    await tique(8);
    assert.equal(chamadas.filter(c => c[0] === "nx_canais_listar").length, 1, "nada mudou: não pede de novo");
    // ao sair da seção, a limpeza devolvida solta a assinatura e o comando
    assert.equal(typeof limpar, "function");
    limpar();
    assert.equal(t.assinado(), false); assert.equal(t.comandos.length, 0);
  } finally { d.fim(); }
});

test("G1 Números: banco sem nx_canal_historico_listar → histórico local (marcado «neste aparelho») e sem «desde» inventado", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const montar = CV.secoesConfig.find(s => s.id === "numeros").montar;
    let pedidosHist = 0;
    const t = ctxNumeros(ui, { canais: false,
      rpc: async nome => { if (nome === "nx_canais_listar") return canaisFalsos(); if (nome === "nx_cv_base") return { departamentos: [], templates: [] };
        if (nome === "nx_canal_historico_listar") { pedidosHist++; throw ERRO_SEM_RPC(); } return {}; },
      fn: async () => ({ ok: true }),
    });
    await montar(t.ctx, t.alvo); await tique(4);
    assert.equal(pedidosHist, 2);
    const h = t.alvo.querySelector(".cfg-canal .cfg-hist[data-fonte=local]");
    assert.match(textoDe(h.querySelector("summary")), /neste aparelho/);
    assert.equal(t.alvo.querySelector(".cfg-desde"), null);
    // segunda carga: a RPC ausente não é pedida de novo
    t.alvo.querySelector(".cfg-reconferir").dispatchEvent(new d.Evento("click"));
    await tique(12);
    assert.equal(pedidosHist, 2, "banco antigo: não insiste");
  } finally { d.fim(); }
});

test("G1 Números ao vivo pelo pulso do cliente: no máximo 1 recarga suave a cada 30 s; para ao sair da seção", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const montar = CV.secoesConfig.find(s => s.id === "numeros").montar;
    let listas = 0, batida = null;
    const t = ctxNumeros(ui, { canais: false,
      rpc: async nome => { if (nome === "nx_canais_listar") { listas++; return canaisFalsos(); } if (nome === "nx_cv_base") return { departamentos: [], templates: [] }; return []; },
      fn: async () => ({ ok: true }) });
    t.ctx.pulso = { assinar: f => { batida = f; return () => { batida = null; }; } };
    const limpar = await montar(t.ctx, t.alvo); await tique(4);
    assert.equal(listas, 1);
    batida(); await tique(6);
    assert.equal(listas, 1, "pulso logo depois de carregar: espera os 30 s");
    const agora = Date.now; Date.now = () => agora() + 31000;
    try { batida(); await tique(6); } finally { Date.now = agora; }
    assert.equal(listas, 2, "passou dos 30 s: recarrega");
    assert.equal(t.alvo.querySelector(".esqueleto"), null, "recarga suave, sem esqueleto");
    limpar();
    assert.equal(batida, null, "a assinatura do pulso sai junto com a seção");
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- Configurações (G7) */

function ctxConfig(ui, { css }) {
  const d = globalThis.document;
  const alvo = d.body.appendChild(d.createElement("main"));
  return {
    ui: { ...ui, carregarCss: () => css }, api: { rpcC: async () => ({}), rpc: async () => ({}), mensagemErro: e => String(e) },
    rota: { partes: ["secao-que-nao-existe"], query: {} }, alvo, versao: "dev", titulo() {}, navegar() {},
    configPronta: () => true, shell: { prontos: { CONFIG_PRONTAS: [] } }, sessao: { conta: { id: "c1", papel: "clinica" }, org: null },
    cliente: null, pode: () => false, temModulo: () => false,
  };
}

test("G7 Configurações: nada é desenhado antes de a folha config.css chegar", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    let soltar;
    const ctx = ctxConfig(ui, { css: new Promise(r => { soltar = r; }) });
    const p = cfg.montar(ctx);
    await esperar(60);
    assert.equal(ctx.alvo.childNodes.length, 0, "esperando a folha");
    soltar(true);
    await p;
    assert.ok(ctx.alvo.querySelector(".cfg"), "desenhou depois da folha");
    assert.match(textoDe(ctx.alvo), /Esta seção não está disponível/);
    cfg.desmontar();
  } finally { d.fim(); }
});

test("G7 Configurações: folha que não chega não prende a tela (desenha depois do teto de espera)", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const cfg = await import("../web/app/config.js");
    const ctx = ctxConfig(ui, { css: new Promise(() => {}) });
    const t0 = Date.now();
    await cfg.montar(ctx);
    assert.ok(Date.now() - t0 >= cfg.ESPERA_CSS_MS - 50, "esperou o teto");
    assert.ok(ctx.alvo.querySelector(".cfg"));
    cfg.desmontar();
  } finally { d.fim(); }
});

/* ---------------------------------------------------------------- Admin (G2, G5, G10) */

const CLIENTES = () => [
  { id: "c1", nome: "Alfa", slug: "alfa", status: "ativo", plano: "essencial", org_id: "org-a", ativo: true, comercial: { pacote: "essencial" },
    canais: [{ id: "k1", nome: "Recepção", provedor: "codewords", estado: "desconectado" }], uso: {}, limites: {} },
  { id: "c2", nome: "Beta", slug: "beta", status: "teste", plano: "essencial", org_id: "org-a", ativo: false, comercial: null,
    canais: [], uso: {}, limites: {} },
];
function ctxAdmin(ui, { partes = ["clientes"], superConta = true, rpc }) {
  const d = globalThis.document;
  const alvo = d.body.appendChild(d.createElement("main"));
  const toasts = [];
  const ctx = {
    ui: { ...ui, tabela: ({ colunas, linhas }) => ({ el: ui.h("div", { class: "tab-falsa" }, linhas.map(l => ui.h("div", { class: "tab-linha", dataset: { id: l.id } },
      colunas.map(c => ui.h("div", { class: "tab-cel", dataset: { col: c.chave } }, c.render ? c.render(l) : String(l[c.chave] ?? "")))))) }),
      carregarCss: () => Promise.resolve(true), toast: (t, o) => toasts.push([t, o && o.tipo]), confirmar: async () => true },
    api: { rpc, mensagemErro: e => String(e && e.message || e) },
    rota: { partes, query: {} }, alvo, titulo() {}, navegar() {}, pronto: () => false, versao: "dev",
    sessao: { conta: { super: superConta }, org: { id: "org-a", nome: "Revenda A" } },
    shell: { recarregarSessao: async () => {}, marcaEfetiva: () => ({ produto: "Órbita" }), clientes: () => [] },
  };
  return { ctx, alvo, toasts };
}

test("G5 + G10 Admin → Clientes: pílulas «Sem pacote» e «Pausado», coluna «Número» só quando o servidor manda canais", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const t = ctxAdmin(ui, { rpc: async nome => (nome === "nx_clientes_admin" ? CLIENTES() : []) });
    await adm.montar(t.ctx); await tique(4);
    const cel = (id, col) => t.alvo.querySelector(`.tab-linha[data-id=${id}] .tab-cel[data-col=${col}]`);
    assert.match(textoDe(cel("c2", "plano")), /Sem pacote/);
    assert.doesNotMatch(textoDe(cel("c1", "plano")), /Sem pacote/);
    assert.match(textoDe(cel("c2", "status")), /Pausado/);
    assert.doesNotMatch(textoDe(cel("c1", "status")), /Pausado/);
    assert.equal(textoDe(cel("c1", "n_numeros")), "1 desconectado");
    assert.equal(cel("c1", "n_numeros").querySelector(".adm-numero").dataset.tom, "ruim");
    assert.equal(textoDe(cel("c2", "n_numeros")), "Sem número");
    adm.desmontar();
    d.doc.body.removeChild(t.alvo);
    // servidor real de hoje (sem canais no nx_clientes_admin): a coluna nem aparece
    const t2 = ctxAdmin(ui, { rpc: async nome => (nome === "nx_clientes_admin" ? CLIENTES().map(({ canais, ...c }) => c) : []) });
    await adm.montar(t2.ctx); await tique(4);
    assert.equal(t2.alvo.querySelector(".tab-cel[data-col=n_numeros]"), null);
    adm.desmontar();
  } finally { d.fim(); }
});

test("G5 Admin → cliente: interruptor «Cliente ativo» (só plataforma), aviso de pacote e servidor que não grava «ativo» é dito com honestidade", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const salvos = [];
    let ecoarAtivo = false;
    const rpc = async (nome, p) => {
      if (nome === "nx_clientes_admin") return [CLIENTES()[1]];
      if (nome === "nx_planos_listar") return [{ id: "essencial", nome: "Essencial", ativo: true, modulos: ["crm", "conversas"] }];
      if (nome === "nx_usuarios_listar") return { usuarios: [] };
      if (nome === "nx_ia_uso_dia") return [{ dia: "2026-10-08", chamadas: 2, tokens_in: 100, tokens_out: 10, custo_usd: 0.01 }];
      if (nome === "nx_cliente_admin_salvar") { salvos.push(p.p_cliente); return { ...CLIENTES()[1], ativo: ecoarAtivo ? p.p_cliente.ativo : false }; }
      return [];
    };
    const t = ctxAdmin(ui, { partes: ["clientes", "c2"], rpc });
    await adm.montar(t.ctx); await tique(6);
    assert.match(textoDe(t.alvo.querySelector(".adm-sem-pacote")), /não tem pacote comercial registrado/);
    assert.match(textoDe(t.alvo.querySelector(".cartao-cab")), /Pausado pela Nexus/);
    const sw = t.alvo.querySelector(".adm-ativo input[name=ativo]");
    assert.ok(sw, "a plataforma vê o interruptor");
    assert.equal(sw.checked, false);
    assert.match(textoDe(t.alvo.querySelector(".adm-ativo")), /o Órbita para de ler os anúncios e de mandar relatórios/);   // revisão: texto fiel ao que o servidor faz
    // religa → o servidor de hoje ignora a chave: a tela não finge
    sw.checked = true;
    const form = t.alvo.querySelector(".adm-det form");
    form.dispatchEvent(new d.Evento("submit"));
    await tique(8);
    assert.equal(salvos[0].ativo, true, "pedido com «ativo»");
    assert.match(t.toasts.at(-1)[0], /ainda não grava a religação/);
    assert.equal(t.toasts.at(-1)[1], "info");
    // servidor que grava: confirma
    ecoarAtivo = true;
    form.dispatchEvent(new d.Evento("submit"));
    await tique(8);
    assert.deepEqual(t.toasts.at(-1), ["Cliente religado.", "ok"]);
    adm.desmontar();
    d.doc.body.removeChild(t.alvo);
    // revenda (não super): sem interruptor; o campo não vai no pedido
    const t2 = ctxAdmin(ui, { partes: ["clientes", "c2"], superConta: false, rpc });
    salvos.length = 0;
    await adm.montar(t2.ctx); await tique(6);
    assert.equal(t2.alvo.querySelector(".adm-ativo"), null);
    t2.alvo.querySelector(".adm-det form").dispatchEvent(new d.Evento("submit"));
    await tique(8);
    assert.equal("ativo" in salvos[0], false);
    adm.desmontar();
  } finally { d.fim(); }
});

test("G2 Admin → cliente: uso de IA por dia com KPIs (custo como ESTIMATIVA) e tabela; banco antigo → nota, nada inventado", async () => {
  const d = comDom();
  try {
    const ui = await uiReal();
    const adm = await import("../web/app/admin.js");
    const pedidos = [];
    const caixa = adm.usoIAPorDia({ ui, api: { rpc: async (n, p) => { pedidos.push([n, p]); return [
      { dia: "2026-10-07", chamadas: 0, tokens_in: 0, tokens_out: 0, custo_usd: 0 },
      { dia: "2026-10-08", chamadas: 4, tokens_in: 20000, tokens_out: 1200, custo_usd: 0.084 }]; }, mensagemErro: String } }, { id: "c9" });
    assert.ok(caixa.querySelector(".esqueleto-kpi"), "esqueleto enquanto carrega");
    assert.equal(await caixa.pronto, true);
    assert.deepEqual(pedidos, [["nx_ia_uso_dia", { p_cliente: "c9", p_dias: 14 }]]);
    const kpis = caixa.querySelectorAll(".kpi");
    assert.equal(kpis.length, 2);
    assert.equal(kpis[1].dataset.estimativa, "1", "o custo é estimado e diz isso");
    assert.match(textoDe(kpis[1]), /estimado/);
    assert.equal(caixa.querySelectorAll(".adm-ia-tab tbody tr").length, 1, "só os dias com chamadas na tabela");
    assert.equal(caixa.querySelector(".adm-ia-dia-nota"), null, "custo completo: sem nota");
    semNullNaTela(caixa);
    const velho = adm.usoIAPorDia({ ui, api: { rpc: async () => { throw ERRO_SEM_RPC(); }, mensagemErro: String } }, { id: "c9" });
    assert.equal(await velho.pronto, false);
    assert.equal(velho.querySelector(".kpi"), null);
    assert.match(textoDe(velho), /ainda não vem deste servidor/);
  } finally { d.fim(); }
});

/* ================================================================== (c) estáticos */

test("CSS da frente G: só tokens (nenhuma cor escrita), alvos de 44 px nas respostas e nada de transition: all", () => {
  const css = ler("web/app/automacoes.css") + ler("web/app/config.css");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /transition:\s*all/);
  for (const sel of [".au-ex-ia", ".au-ia-perg", ".au-ia-resp", ".au-esq", ".cfg-desde", ".cfg-ign-lista", ".adm-ia-dia", ".adm-ia-kpis", ".adm-pilulas"]) assert.ok(css.includes(sel), sel);
  assert.match(css, /\.au-ia-resp \{[^}]*min-height: 44px/);
  assert.match(css, /\.adm-ia-det summary \{[^}]*min-height: 44px/);
});

test("arquivos da frente G sem «localStorage» no rascunho de automação e sem import estático", () => {
  for (const f of ["web/app/automacoes.js", "web/app/auto-editor.js", "web/app/auto-pecas.js", "web/app/admin.js", "web/app/cv-config.js", "web/app/config.js"]) {
    assert.doesNotMatch(ler(f), /^import\s/m, `${f} sem import estático`);
  }
  assert.doesNotMatch(ler("web/app/automacoes.js") + ler("web/app/auto-editor.js"), /localStorage/);
});

test("descrever: condição sem valor (receita cuja etapa não existe no funil) diz «(a escolher)», nunca «null»", () => {
  const a = L.aplicarModelo("faltou_remarcar", BASE, VOCAB);           // BASE não tem a etapa de marco «faltou»
  assert.equal(a.condicoes[0].valor, "");
  const frase = L.descrever(a, BASE, VOCAB);
  assert.match(frase, /se a etapa for «\(a escolher\)»/);
  assert.doesNotMatch(frase, /null|undefined/);
  assert.match(L.descrever({ gatilho: "negocio_criado", config: {}, condicoes: [{ campo: "origem", op: "igual", valor: "" }], acoes: [] }, BASE, VOCAB), /origem for «\(a escolher\)»/);
});

test("revisão · decisaoIA com ações DEPOIS da IA (e motivo com parênteses ou cortado): o motivo continua aparecendo", async () => {
  const A = await import("../web/app/auto-logica.js");
  const e = A.decisaoIA("gatilho ok · IA: movido para «Avaliou / orçamento» (pediu o valor (implante) e quer marcar) · tarefa criada");
  assert.equal(e.tipo, "etapa"); assert.equal(e.etapa, "Avaliou / orçamento");
  assert.equal(e.motivo, "pediu o valor (implante) e quer marcar", "antes: o motivo sumia quando havia ação depois da IA");
  const n = A.decisaoIA("IA: lead com nota 82 (respondeu rápido) · etiqueta adicionada");
  assert.equal(n.score, 82); assert.equal(n.motivo, "respondeu rápido");
  const p = A.decisaoIA("IA: pulado (a cota de IA do mês acabou) · tarefa criada");
  assert.equal(p.motivo, "a cota de IA do mês acabou"); assert.doesNotMatch(p.frase, /tarefa criada/);
  const c = A.decisaoIA("IA: movido para «Nova» (motivo muito longo que o servidor cortou no meio");
  assert.equal(c.motivo, "motivo muito longo que o servidor cortou no meio", "cortado em 280: vale o que veio");
});

test("revisão · «Reconferir agora» não testa número sem token/chave (o teste da Meta gravava «erro» e o número «caía» sem nunca ter conectado)", () => {
  const src = readFileSync(new URL("../web/app/cv-config.js", import.meta.url), "utf8");
  assert.match(src, /if \(c\.tem_token === false\) \{ semConfig\+\+; continue; \}/);
  assert.match(src, /return srv && srv\.length \? \{ lista: srv, servidor: true \} : \{ lista: local, servidor: false \};/);
});

test("revisão · «Montar de novo»: respostas da rodada anterior continuam (a mesma pergunta vale a resposta nova); falha da nova chamada não apaga a montagem anterior", async () => {
  const A = await import("../web/app/auto-logica.js");
  const r1 = A.descricaoComRespostas("Quando o lead do site não for respondido, avise", [{ id: "q1", pergunta: "Em quantos minutos?" }], { q1: "10" });
  const r2 = A.descricaoComRespostas(r1.texto, [{ id: "q2", pergunta: "Avisar quem?" }], { q2: "o responsável" });
  assert.match(r2.texto, /Em quantos minutos\? → 10/, "antes: a resposta da 1ª rodada sumia na 2ª");
  assert.match(r2.texto, /Avisar quem\? → o responsável/);
  assert.equal((r2.texto.match(/Respostas às dúvidas da IA:/g) || []).length, 1, "um bloco só");
  const r3 = A.descricaoComRespostas(r2.texto, [{ id: "q1", pergunta: "Em quantos minutos?" }], { q1: "15" });
  assert.match(r3.texto, /Em quantos minutos\? → 15/); assert.doesNotMatch(r3.texto, /→ 10/, "resposta nova substitui a antiga da mesma pergunta");
  const src = readFileSync(new URL("../web/app/automacoes.js", import.meta.url), "utf8");
  assert.match(src, /if \(anteriores\.length\) estado\.append\(\.\.\.anteriores\);/);
});
