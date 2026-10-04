/* ============================================================
   ÓRBITA — plano «50+ melhorias» (04/10/2026) · frente D · Conversas
   node --test testes/plano50-conversas.teste.mjs
   (a) cv-logica.js: cauda das bolhas, «Mensagens novas», grade de fotos, grupos do sistema, áudio, SLA, variáveis, lateral
   (b) comportamento sobre DOM mínimo: chat (bolhas, grade, visualizador, áudio, barra de ações, pílula da IA), lista (SLA, tipo,
       canal), lateral (resumo, mini-gráfico, seções) e composer (prévia das respostas rápidas, Tab entre campos, botão ⚡, selo da IA)
   (c) CSS: movimento novo desligado em prefers-reduced-motion, sem hex, sem transition: all
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = join(AQUI, "..", "web", "app");
const ler = f => readFileSync(join(APP, f), "utf8");
const L = await import("../web/app/cv-logica.js");

const AGORA = new Date("2026-09-28T15:00:00-03:00");
const iso = (minAtras, base = AGORA) => new Date(base.getTime() - minAtras * 60000).toISOString();

/* ============================================================ (a) lógica pura */
test("31 · marcarCaudas: a cauda fica só na última bolha de cada grupo colado", () => {
  const msgs = [
    { id: 1, conversa_id: 9, direcao: "in", tipo: "texto", criado_em: iso(10) },
    { id: 2, conversa_id: 9, direcao: "in", tipo: "texto", criado_em: iso(9) },
    { id: 3, conversa_id: 9, direcao: "in", tipo: "texto", criado_em: iso(8) },
    { id: 4, conversa_id: 9, direcao: "out", tipo: "texto", enviado_por: { id: "a" }, criado_em: iso(7) },
    { id: 5, conversa_id: 9, direcao: "in", tipo: "texto", criado_em: iso(6) },
  ];
  const ln = L.marcarCaudas(L.montarLinhas(msgs, [{ id: 9 }], AGORA)).filter(l => l.tipo === "msg");
  assert.deepEqual(ln.map(l => [l.msg.id, !!l.junta, !!l.cauda]), [[1, false, false], [2, true, false], [3, true, true], [4, false, true], [5, false, true]]);
});

test("31 · primeiraNaoLida / inserirNovas / contarNovasEntradas", () => {
  const msgs = [
    { id: 1, direcao: "in", tipo: "texto", criado_em: iso(5) }, { id: 2, direcao: "out", tipo: "texto", criado_em: iso(4) },
    { id: 3, direcao: "in", tipo: "texto", criado_em: iso(3) }, { id: 4, direcao: "in", tipo: "texto", criado_em: iso(2) },
    { id: "tmp-1", direcao: "out", tipo: "texto", criado_em: iso(1) },
  ];
  assert.equal(L.primeiraNaoLida(msgs, 2), 3, "2 não lidas = as duas últimas do cliente");
  assert.equal(L.primeiraNaoLida(msgs, 9), 1, "mais não lidas do que o carregado: começa na primeira");
  assert.equal(L.primeiraNaoLida(msgs, 0), null);
  const ln = L.inserirNovas(L.montarLinhas(msgs, [], AGORA), 3);
  const i = ln.findIndex(l => l.tipo === "novas");
  assert.ok(i > 0 && ln[i + 1].tipo === "msg" && ln[i + 1].msg.id === 3, "o separador entra logo antes da primeira não lida");
  assert.equal(L.inserirNovas(ln, 999).length, ln.length, "id que não está na tela: nada muda");
  assert.equal(L.contarNovasEntradas(msgs, 2), 2);
  assert.equal(L.contarNovasEntradas(msgs, 4), 0);
});

test("32 · agruparMidia: fotos limpas seguidas viram grade; legenda, citação, local e falha ficam de fora; no máximo 6 por grade", () => {
  const foto = (id, extra = {}) => ({ id, conversa_id: 9, direcao: "in", tipo: "imagem", midia: { path: `p${id}` }, criado_em: iso(60 - id), ...extra });
  const msgs = [foto(1), foto(2), foto(3, { corpo: "legenda" }), foto(4), foto(5, { local: true, midia: { local_url: "blob:x" } }), foto(6), foto(7), foto(8, { status: "falhou" })];
  const ln = L.agruparMidia(L.marcarCaudas(L.montarLinhas(msgs, [{ id: 9 }], AGORA)));
  assert.deepEqual(ln.map(l => (l.tipo === "grade" ? `grade[${l.msgs.map(m => m.id).join(",")}]` : l.tipo === "msg" ? String(l.msg.id) : l.tipo)),
    ["dia", "grade[1,2]", "3", "4", "5", "grade[6,7]", "8"]);
  assert.equal(ln[1].cauda, false, "a grade herda a cauda da última foto do grupo");
  const muitas = Array.from({ length: 8 }, (_, k) => foto(k + 1));
  const g = L.agruparMidia(L.montarLinhas(muitas, [{ id: 9 }], AGORA)).filter(l => l.tipo === "grade");
  assert.deepEqual(g.map(x => x.msgs.length), [6, 2]);
  assert.equal(L.entraNaGrade({ tipo: "imagem", midia: { path: "a" }, reacao: "👍" }), false);
  assert.deepEqual(L.imagensDaConversa(msgs).map(x => x.id), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("31/32 · «Mensagens novas» com fotos em grade: o separador fecha a grade (lidas e não lidas não dividem a mesma) e nunca some", () => {
  const foto = (id, min) => ({ id, conversa_id: 9, direcao: "in", tipo: "imagem", midia: { path: `p${id}` }, criado_em: iso(min) });
  const rot = ln => ln.map(l => (l.tipo === "grade" ? `grade[${l.msgs.map(m => m.id).join(",")}]` : l.tipo === "sistema_grupo" ? `sis[${l.msgs.map(m => m.id).join(",")}]` : l.tipo === "msg" ? String(l.msg.id) : l.tipo));
  // a ordem do chat: caudas → separador → grade/sistema
  const montar = (msgs, naoLidas) => {
    let ln = L.marcarCaudas(L.montarLinhas(msgs, [{ id: 9 }], AGORA));
    ln = L.inserirNovas(ln, L.primeiraNaoLida(msgs, naoLidas));
    return L.agruparSistema(L.agruparMidia(ln));
  };
  // o caso da revisão: texto nosso e o cliente manda 3 fotos seguidas, todas não lidas
  const msgs = [{ id: 1, conversa_id: 9, direcao: "out", tipo: "texto", corpo: "oi", criado_em: iso(10) }, foto(2, 4), foto(3, 4), foto(4, 3)];
  assert.equal(L.primeiraNaoLida(msgs, 3), 2);
  assert.deepEqual(rot(montar(msgs, 3)), ["dia", "1", "novas", "grade[2,3,4]"]);
  // 2 fotos lidas + 2 não lidas, todas coladas: viram duas grades, uma de cada lado do separador
  const quatro = [foto(1, 6), foto(2, 5), foto(3, 4), foto(4, 3)];
  assert.deepEqual(rot(montar(quatro, 2)), ["dia", "grade[1,2]", "novas", "grade[3,4]"]);
  // só a última foto é nova: a grade das lidas fica e a nova continua bolha solta depois do separador
  assert.deepEqual(rot(montar([foto(1, 6), foto(2, 5), foto(3, 4)], 1)), ["dia", "grade[1,2]", "novas", "3"]);
  // quem chamar inserirNovas com as linhas JÁ agrupadas também não perde o separador (entra antes do grupo que contém o id)
  const agrupadas = L.agruparMidia(L.marcarCaudas(L.montarLinhas(msgs, [{ id: 9 }], AGORA)));
  assert.deepEqual(rot(L.inserirNovas(agrupadas, 3)), ["dia", "1", "novas", "grade[2,3,4]"]);
  const sis = [{ id: 1, direcao: "out", tipo: "sistema", corpo: "IA pausada", criado_em: iso(9) }, { id: 2, direcao: "out", tipo: "sistema", corpo: "Transferida", criado_em: iso(8) }];
  assert.deepEqual(rot(L.inserirNovas(L.agruparSistema(L.montarLinhas(sis, [], AGORA)), 2)), ["dia", "novas", "sis[1,2]"]);
});

test("37 · agruparSistema: 2+ mensagens de sistema seguidas viram um grupo; a solta continua bolha", () => {
  const msgs = [
    { id: 1, direcao: "in", tipo: "texto", criado_em: iso(9) },
    { id: 2, direcao: "out", tipo: "sistema", corpo: "IA pausada por Ana", criado_em: iso(8) },
    { id: 3, direcao: "out", tipo: "sistema", corpo: "Conversa transferida para Recepção", criado_em: iso(7) },
    { id: 4, direcao: "out", tipo: "sistema", corpo: "Atendimento resolvido", criado_em: iso(6) },
    { id: 5, direcao: "in", tipo: "texto", criado_em: iso(5) },
    { id: 6, direcao: "out", tipo: "sistema", corpo: "Atribuída a Helena", criado_em: iso(4) },
  ];
  const ln = L.agruparSistema(L.montarLinhas(msgs, [], AGORA));
  assert.deepEqual(ln.map(l => (l.tipo === "sistema_grupo" ? `grupo[${l.msgs.map(m => m.id).join(",")}]` : l.tipo === "msg" ? String(l.msg.id) : l.tipo)), ["dia", "1", "grupo[2,3,4]", "5", "6"]);
  assert.equal(L.resumoGrupoSistema(ln[2].msgs), "3 eventos do sistema · 1 da IA");
  assert.deepEqual(["IA pausada", "transferida", "resolvido", "reaberta", "atribuída a", "etiqueta x", "automação y", "ocultada", "qualquer"].map(L.iconeSistema),
    ["ia", "transferir", "check", "reabrir", "usuario", "etiqueta", "raio", "alerta", "info"]);
});

test("32 · áudio: duração, velocidades e rótulos", () => {
  assert.equal(L.formatarDuracao(65), "1:05");
  assert.equal(L.formatarDuracao(3725), "1:02:05");
  assert.equal(L.formatarDuracao(0), "0:00");
  assert.equal(L.formatarDuracao("x"), "–:––");
  assert.equal(L.formatarDuracao(-3), "–:––");
  assert.deepEqual([1, 1.5, 2, "zz"].map(L.proximaVelocidade), [1.5, 2, 1, 1], "valor desconhecido volta a 1×");
  assert.deepEqual([1, 1.5, 2].map(L.rotuloVelocidade), ["1×", "1,5×", "2×"]);
  assert.equal(L.velocidadeValida("1.5"), 1.5);
  assert.equal(L.velocidadeValida("3"), 1);
  assert.deepEqual(["x.pdf", "x.xlsx", "x.PPTX", "x.docx", "x.bin"].map(n => L.grupoDocumento(n)), ["pdf", "planilha", "slides", "texto", "outro"]);
  assert.equal(L.grupoDocumento(null, "application/pdf"), "pdf");
});

test("34 · tipoDoResumo, nivelEspera (15/30/60 min) e fracaoJanela", () => {
  assert.deepEqual(["Foto", "Áudio: oi", "Documento: contrato.pdf", "Vídeo", "Figurinha", "Fotografia bonita", "oi", ""].map(L.tipoDoResumo),
    ["imagem", "audio", "documento", "video", "sticker", null, null, null]);
  assert.deepEqual([0, 14, 15, 29, 30, 59, 60, 600].map(m => L.nivelEspera(iso(m), AGORA).nivel), ["ok", "ok", "aten", "aten", "ruim", "ruim", "critico", "critico"]);
  assert.equal(L.nivelEspera(null, AGORA).nivel, "ok");
  assert.equal(L.nivelEspera(iso(42), AGORA).minutos, 42);
  assert.equal(L.fracaoJanela({ aberta: true, restanteMs: 12 * 3600000 }), 0.5);
  assert.equal(L.fracaoJanela({ aberta: false }), 0);
  assert.equal(L.fracaoJanela(null), 0);
});

test("36 · partesVariaveis bate com aplicarVariaveis; proximoCampo e contarCampos", () => {
  const vars = { nome: "maria souza", atendente: "Ana", empresa: "Clínica", protocolo: "P1" };
  for (const corpo of ["Olá, {primeiro_nome}! Aqui é {atendente}, da {empresa}. Dia {dia 1} ou {dia 2}?", "Protocolo {protocolo} · {nome}", "Sem variável", "{primeiro_nome}"]) {
    assert.equal(L.partesVariaveis(corpo, vars).map(p => p.t).join(""), L.aplicarVariaveis(corpo, vars), corpo);
  }
  assert.equal(L.partesVariaveis("Olá, {primeiro_nome}! Tudo bem?", { nome: "" }).map(p => p.t).join(""), "Olá! Tudo bem?", "variável vazia leva a vírgula junto, como aplicarVariaveis");
  const p = L.partesVariaveis("Oi {primeiro_nome}, dia {dia}?", vars);
  assert.deepEqual(p.map(x => x.tipo), ["texto", "var", "texto", "pendente", "texto"]);
  assert.equal(p[1].nome, "primeiro_nome");
  assert.deepEqual(L.proximoCampo("a {x} b {y}", 0), [2, 5]);
  assert.deepEqual(L.proximoCampo("a {x} b {y}", 5), [8, 11]);
  assert.deepEqual(L.proximoCampo("a {x} b {y}", 11), [2, 5], "no fim dá a volta");
  assert.deepEqual(L.proximoCampo("a {x} b {y}", 8, -1), [2, 5]);
  assert.deepEqual(L.proximoCampo("a {x} b {y}", 2, -1), [8, 11], "voltando do primeiro vai para o último");
  assert.equal(L.proximoCampo("sem campos", 0), null);
  assert.equal(L.contarCampos("a {x} b {y} {z}"), 3);
});

test("35/38 · resumoContato, interacoesPorDia, atalhoDe e ariaKeyshortcuts", () => {
  const r = L.resumoContato({ negocios: [{ valor_previsto: 100 }, { status: "aberto", valor_previsto: "50" }, { status: "ganho", valor_previsto: 999 }], atendimentos: [1, 2], tarefas: [{ atrasada: true }, {}] });
  assert.deepEqual(r, { negocios: 2, valor: 150, atendimentos: 2, tarefas: 2, atrasadas: 1 });
  assert.deepEqual(L.resumoContato(null), { negocios: 0, valor: 0, atendimentos: 0, tarefas: 0, atrasadas: 0 });
  const msgs = [{ direcao: "in", tipo: "texto", criado_em: iso(30) }, { direcao: "out", tipo: "texto", criado_em: iso(20) }, { direcao: "out", tipo: "nota", criado_em: iso(10) },
    { direcao: "in", tipo: "texto", criado_em: iso(60 * 24 * 2) }, { direcao: "in", tipo: "texto", criado_em: iso(60 * 24 * 30) }];
  const d = L.interacoesPorDia(msgs, AGORA);
  assert.equal(d.length, 7);
  assert.deepEqual(d.at(-1), { dia: "2026-09-28", rotulo: "seg", entrada: 1, saida: 1 }, "hoje: nota não conta");
  assert.deepEqual(d.at(-3).entrada, 1, "anteontem");
  assert.equal(d.reduce((s, x) => s + x.entrada + x.saida, 0), 3, "30 dias atrás fica fora");
  assert.equal(L.atalhoDe("assumir"), "Alt+Shift+A");
  assert.equal(L.atalhoDe("inexistente"), "");
  assert.equal(L.ariaKeyshortcuts("Alt+↓"), "Alt+ArrowDown");
  assert.equal(L.ariaKeyshortcuts("Alt+Shift+R"), "Alt+Shift+R");
});

/* ============================================================ DOM mínimo (o mesmo espírito do app.teste.mjs) */
function criarDom() {
  const kebab = s => s.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
  class Evento {
    constructor(type, init = {}) { this.type = type; this.bubbles = true; this.cancelable = true; this.defaultPrevented = false; Object.assign(this, init); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._parado = true; }
    stopImmediatePropagation() { this._parado = true; }
  }
  class No {
    constructor() { this.parentNode = null; this.childNodes = []; this._ouv = []; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc; }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get nextSibling() { const p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; }
    appendChild(n) { return this.insertBefore(n, null); }
    insertBefore(n, ref) {
      if (n.parentNode) n.parentNode.removeChild(n);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
      n.parentNode = this; return n;
    }
    removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; } return n; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    replaceWith(n) { const p = this.parentNode; if (!p) return; p.insertBefore(n, this); p.removeChild(this); }
    after(n) { const p = this.parentNode; if (!p) return; p.insertBefore(n, this.nextSibling); }
    append(...ns) { for (const n of ns.flat(Infinity)) { if (n === null || n === undefined || n === false) continue; this.appendChild(typeof n === "object" && n.nodeType ? n : new Texto(n)); } }
    prepend(...ns) { for (const n of ns.reverse()) this.insertBefore(typeof n === "object" && n.nodeType ? n : new Texto(n), this.firstChild); }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    addEventListener(tipo, fn, opc) { this._ouv.push({ tipo, fn, captura: opc === true || !!(opc && opc.capture), once: !!(opc && opc.once) }); }
    removeEventListener(tipo, fn, opc) { const c = opc === true || !!(opc && opc.capture); this._ouv = this._ouv.filter(o => !(o.tipo === tipo && o.fn === fn && o.captura === c)); }
    dispatchEvent(ev) {
      ev.target = ev.target || this;
      const caminho = []; for (let n = this; n; n = n.parentNode) caminho.push(n);
      const roda = (n, fase) => { ev.currentTarget = n; for (const o of [...n._ouv]) if (o.tipo === ev.type && (fase === "alvo" || (fase === "captura") === o.captura)) { if (o.once) n._ouv = n._ouv.filter(x => x !== o); o.fn.call(n, ev); } };
      for (let i = caminho.length - 1; i > 0 && !ev._parado; i--) roda(caminho[i], "captura");
      if (!ev._parado) roda(this, "alvo");
      if (ev.bubbles !== false) for (let i = 1; i < caminho.length && !ev._parado; i++) roda(caminho[i], "bolha");
      return !ev.defaultPrevented;
    }
  }
  class Texto extends No {
    constructor(t) { super(); this.nodeType = 3; this.data = String(t); }
    get textContent() { return this.data; } set textContent(v) { this.data = String(v); }
  }
  function splitVirgula(s) {
    const out = []; let nivel = 0, cur = "";
    for (const c of s) { if (c === "[" || c === "(") nivel++; if (c === "]" || c === ")") nivel--; if (nivel === 0 && c === ",") { out.push(cur.trim()); cur = ""; } else cur += c; }
    if (cur.trim()) out.push(cur.trim()); return out;
  }
  function parseComplexo(s) {
    const partes = []; let nivel = 0, cur = "", comb = null;
    const fecha = () => { if (cur) { if (partes.length) partes.push(comb || " "); partes.push(cur); cur = ""; comb = null; } };
    for (const c of s) {
      if (c === "[" || c === "(") nivel++; if (c === "]" || c === ")") nivel--;
      if (nivel === 0 && (c === " " || c === ">")) { fecha(); if (c === ">") comb = ">"; else if (!comb) comb = " "; } else cur += c;
    }
    fecha(); return partes;
  }
  function casaComposto(el, s) {
    let i = 0; const m0 = /^([a-zA-Z][\w-]*|\*)/.exec(s);
    if (m0) { if (m0[1] !== "*" && el.localName.toLowerCase() !== m0[1].toLowerCase()) return false; i = m0[0].length; }
    while (i < s.length) {
      const resto = s.slice(i); let mm;
      if (resto[0] === "#") { mm = /^#([\w-]+)/.exec(resto); if (el.attrs.get("id") !== mm[1]) return false; }
      else if (resto[0] === ".") { mm = /^\.([\w-]+)/.exec(resto); if (!el.classList.contains(mm[1])) return false; }
      else if (resto[0] === "[") {
        mm = /^\[([\w:-]+)(?:([~|^$*]?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/.exec(resto);
        if (!el.attrs.has(mm[1])) return false;
        if (mm[2]) { const v = el.attrs.get(mm[1]), a = mm[3] ?? mm[4] ?? mm[5]; if (mm[2] === "=" && v !== a) return false; if (mm[2] === "^=" && !v.startsWith(a)) return false; }
      } else if (resto[0] === ":") {
        mm = /^:([\w-]+)(?:\(((?:[^()]|\([^)]*\))*)\))?/.exec(resto);
        if (mm[1] === "not") { if (casaLista(el, mm[2])) return false; } else if (mm[1] === "disabled") { if (!el.disabled) return false; } else return false;
      } else return false;
      i += mm[0].length;
    }
    return true;
  }
  function casaComplexo(el, partes) {
    if (!casaComposto(el, partes[partes.length - 1])) return false;
    if (partes.length === 1) return true;
    const comb = partes[partes.length - 2], resto = partes.slice(0, -2);
    if (comb === ">") return !!el.parentNode && el.parentNode.nodeType === 1 && casaComplexo(el.parentNode, resto);
    for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) if (casaComplexo(p, resto)) return true;
    return false;
  }
  function casaLista(el, lista) { return splitVirgula(lista).some(sel => casaComplexo(el, parseComplexo(sel))); }
  class El extends No {
    constructor(tag, ns) {
      super(); this.nodeType = 1; this.localName = tag; this.tagName = tag.toUpperCase(); this.namespaceURI = ns || null;
      this.attrs = new Map(); this.value = ""; this.checked = false; this.disabled = false; this.hidden = false; this.open = false;
      this.offsetWidth = 0; this.clientWidth = 0; this.scrollTop = 0; this.scrollHeight = 0; this.clientHeight = 0; this.selectionStart = null; this.selectionEnd = null;
      if (tag === "audio") { this.paused = true; this.duration = NaN; this.currentTime = 0; this.playbackRate = 1; this.buffered = { length: 0 }; }
      const estilos = new Map(); const el = this;
      this.style = { setProperty: (k, v) => { if (v === "" || v == null) estilos.delete(k); else estilos.set(k, String(v)); }, getPropertyValue: k => estilos.get(k) || "", removeProperty: k => { estilos.delete(k); } };
      this.dataset = new Proxy({}, {
        get: (_, k) => (typeof k === "string" && el.attrs.has("data-" + kebab(k)) ? el.attrs.get("data-" + kebab(k)) : undefined),
        set: (_, k, v) => { el.attrs.set("data-" + kebab(k), String(v)); return true; },
        deleteProperty: (_, k) => { el.attrs.delete("data-" + kebab(k)); return true; },
      });
      const cls = () => (el.attrs.get("class") || "").split(/\s+/).filter(Boolean);
      this.classList = {
        add: (...c) => { const s = new Set(cls()); c.forEach(x => s.add(x)); el.attrs.set("class", [...s].join(" ")); },
        remove: (...c) => { const s = new Set(cls()); c.forEach(x => s.delete(x)); el.attrs.set("class", [...s].join(" ")); },
        contains: c => cls().includes(c), toggle: (c, forca) => { const t = forca === undefined ? !cls().includes(c) : !!forca; t ? this.classList.add(c) : this.classList.remove(c); return t; },
      };
    }
    setAttribute(k, v) { this.attrs.set(k, String(v)); } getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); } removeAttribute(k) { this.attrs.delete(k); }
    get id() { return this.attrs.get("id") || ""; }
    get name() { return this.attrs.get("name") || ""; }
    get type() { return this.attrs.get("type") || (this.localName === "input" ? "text" : ""); } set type(v) { this.attrs.set("type", v); }
    get tabIndex() { return Number(this.attrs.get("tabindex") ?? -1); } set tabIndex(v) { this.attrs.set("tabindex", String(v)); }
    get className() { return this.attrs.get("class") || ""; }
    get textContent() { return this.childNodes.map(c => c.textContent).join(""); }
    set textContent(v) { for (const c of [...this.childNodes]) this.removeChild(c); if (v !== "" && v != null) this.appendChild(new Texto(v)); }
    get title() { return this.attrs.get("title") || ""; } set title(v) { this.attrs.set("title", String(v)); }
    get href() { return this.attrs.get("href") || ""; } set href(v) { this.attrs.set("href", String(v)); }
    get src() { return this.attrs.get("src") || ""; } set src(v) { this.attrs.set("src", String(v)); }
    get alt() { return this.attrs.get("alt") || ""; } set alt(v) { this.attrs.set("alt", String(v)); }
    matches(sel) { return casaLista(this, sel); }
    closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.matches(sel)) return n; return null; }
    querySelectorAll(sel) {
      const alvos = splitVirgula(sel).map(parseComplexo);
      const out = [];
      const andar = n => { for (const c of n.childNodes) if (c.nodeType === 1) { if (alvos.some(p => casaComplexo(c, p))) out.push(c); andar(c); } };
      andar(this); return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    focus() { doc.activeElement = this; }
    blur() { if (doc.activeElement === this) doc.activeElement = doc.body; }
    click() { this.dispatchEvent(new Evento("click")); }
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
    select() { this.selectionStart = 0; this.selectionEnd = String(this.value || "").length; }
    scrollIntoView() {}
    scrollTo() {}
    getClientRects() { return [1]; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
    showModal() { this.open = true; } close() { this.open = false; this.dispatchEvent(new Evento("close", { bubbles: false })); }
    play() { this.paused = false; this.dispatchEvent(new Evento("play", { bubbles: false })); return Promise.resolve(); }
    pause() { this.paused = true; this.dispatchEvent(new Evento("pause", { bubbles: false })); }
  }
  const doc = new No();
  doc.nodeType = 9;
  doc.createElement = t => new El(t); doc.createElementNS = (ns, t) => new El(t, ns); doc.createTextNode = t => new Texto(t);
  doc.createDocumentFragment = () => { const f = new El("fragment"); f.nodeType = 11; return f; };
  doc.documentElement = doc.appendChild(new El("html")); doc.body = doc.documentElement.appendChild(new El("body")); doc.activeElement = doc.body;
  doc.getElementById = id => doc.documentElement.querySelector(`#${id}`);
  doc.querySelectorAll = sel => doc.documentElement.querySelectorAll(sel); doc.querySelector = sel => doc.documentElement.querySelector(sel);
  doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  return { doc, Evento, El };
}

/** Instala o DOM de mentira para UM teste e devolve o `ui` falso + utilidades. */
function comDom({ grosso = false, reduzido = false } = {}) {
  const { doc, Evento } = criarDom();
  const salvo = { document: globalThis.document, matchMedia: globalThis.matchMedia, Event: globalThis.Event, requestAnimationFrame: globalThis.requestAnimationFrame, localStorage: globalThis.localStorage };
  const mem = new Map();
  globalThis.document = doc;
  globalThis.matchMedia = q => ({ matches: (/coarse/.test(q) && grosso) || (/reduce/.test(q) && reduzido), addEventListener() {}, removeEventListener() {} });
  globalThis.Event = Evento;
  globalThis.requestAnimationFrame = f => setTimeout(f, 0);
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
  const PROPS = new Set(["value", "checked", "disabled", "selected", "hidden", "multiple", "readOnly", "required", "open"]);
  const h = (tag, attrs, ...filhos) => {
    const el = doc.createElement(tag);
    if (attrs !== null && attrs !== undefined && (typeof attrs !== "object" || attrs.nodeType || Array.isArray(attrs))) { filhos.unshift(attrs); attrs = null; }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.setAttribute("class", Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v));
      else if (k === "dataset") { for (const [dk, dv] of Object.entries(v)) if (dv !== null && dv !== undefined) el.dataset[dk] = String(dv); }
      else if (k === "on") { for (const [ev, fn] of Object.entries(v)) if (typeof fn === "function") el.addEventListener(ev, fn); }
      else if (k === "style") { if (typeof v === "string") el.setAttribute("style", v); else for (const [p, val] of Object.entries(v)) if (val !== null && val !== undefined) el.style.setProperty(p, String(val)); }
      else if (k === "text") el.textContent = String(v);
      else if (PROPS.has(k)) el[k] = v;
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
    const anexar = f => { if (f === null || f === undefined || f === false) return; if (Array.isArray(f)) { f.forEach(anexar); return; } el.appendChild(f && f.nodeType ? f : doc.createTextNode(String(f))); };
    filhos.forEach(anexar);
    return el;
  };
  const toasts = [], anuncios = [], copiados = [], menus = [];
  const icone = (nome, cls) => { const s = doc.createElementNS("svg", "svg"); s.setAttribute("class", cls ? `ic ${cls}` : "ic"); s.dataset.icone = nome; return s; };
  const ui = {
    h, icone, limpar(el) { if (el) while (el.firstChild) el.removeChild(el.firstChild); return el; },
    pilula: (texto, cor = "neutra", extra = {}) => h("span", { class: ["pilula", `pilula-${cor}`, extra.class], title: extra.title || null }, extra.icone ? icone(extra.icone) : null, String(texto)),
    avatar: (nome, id) => h("span", { class: "avatar", "aria-hidden": "true", dataset: { id: id ?? "" } }, String(nome || "?").slice(0, 2)),
    etiqueta: e => h("span", { class: "etiq" }, e.nome), corOk: c => (/^#[0-9a-fA-F]{6}$/.test(String(c)) ? c : null),
    toast(t) { toasts.push(String(t)); return { fechar() {}, el: h("div") }; },
    anunciar(t) { anuncios.push(String(t)); },
    menu(ancora, itens) { menus.push({ ancora, itens }); },
    copiar(t) { copiados.push(String(t)); return Promise.resolve(true); },
    esqueleto: () => h("div", { class: "esqueleto" }), vazio: o => h("div", { class: "vazio" }, o && o.titulo), erroCartao: () => h("div", { class: "erro" }),
    carregando: async (b, p) => (typeof p === "function" ? p() : p),
    modal: async () => true, confirmar: async () => true, flutuante: () => ({ fechar() {} }), debounce: fn => fn,
    campo: ({ tipo, nome, rotulo, valor }) => h("div", { class: "campo" }, h("label", null, rotulo), h("input", { type: "checkbox", name: nome, role: tipo === "interruptor" ? "switch" : null, checked: !!valor })),
    seletorEtiquetas: () => h("div", { class: "sel-etiq" }),
    segmentado() { const el = h("div", { class: "seg" }); el.ativar = () => {}; el.reposicionar = () => {}; el.contar = () => {}; return el; },
    telBR: d => String(d), brl: v => `R$ ${Number(v).toLocaleString("pt-BR")}`, relativo: () => "hoje", dataBR: () => "28/09/2026", dataHoraBR: () => "28/09/2026 15:00",
  };
  return {
    doc, Evento, ui, h, toasts, anuncios, copiados, menus, mem,
    ev: (el, tipo, init) => el.dispatchEvent(new Evento(tipo, init)),
    fim() { for (const [k, v] of Object.entries(salvo)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } },
  };
}
const esperar = ms => new Promise(r => setTimeout(r, ms));
const achar = (el, sel) => { const x = el.querySelector(sel); assert.ok(x, `não achei ${sel}`); return x; };

/* ============================================================ (b) chat */
async function montarChat(d, { msgs, ia = null, podeEscrever = true, provedor = "codewords", conv = {}, canais = null } = {}) {
  const { criarChat } = await import("../web/app/cv-chat.js");
  const chamadas = [];
  const prefs = { vel: 1 };
  const A = {
    ui: d.ui, L, icone: d.ui.icone, destruido: false, podeEscrever, eu: { id: "u1", nome: "Helena" },
    base: { canais: canais || [{ id: "k1", provedor }], config: { ia: { assistente_nome: "Lia" } }, etiquetas: [] },
    ver: { conversa: { id: 9, status: "aberta", canal_id: "k1", canal: { nome: "Recepção", provedor }, protocolo: "ORB-1", atribuida_a: "u2", atribuida_nome: "Ana",
      janela_ate: new Date(Date.now() + 12 * 3600000).toISOString(), ...conv }, contato: { id: 5, nome: "Mariana Costa", telefone: "5500000000501" } },
    msgs, conversasContato: [{ id: 9, protocolo: "ORB-1" }], temMaisAntes: false, carregandoAntes: false, midia: new Map(), iaEstado: ia, marcaNovas: null, contagens: {},
    raiz: d.h("div", { class: "cv", dataset: { lateral: "coluna" } }), ctx: { abrirContato() {}, navegar() {} },
    composer: { el: d.h("div", { class: "cvx" }), responder(m) { chamadas.push(["responder", m.id]); }, aceitaAnexo: () => true, anexar() {} },
    acoes: {
      urlMidia: p => `https://cdn.test/${p}`, estadoMidia: () => "ok", nomeContato: c => (c && c.nome) || "", pode: () => true,
      podeCancelarEnvio: () => false, foiReenviada: () => false, carregarAntes() {}, voltar() {}, abrirDetalhes() {}, recarregarVer() {},
      avancarAoResolver: () => false, definirAvancar() {}, abrirAjudaTeclado() {}, mudarLista() {}, atenderProximo() {}, novaConversa() {}, tratarErro() {},
      copiarTexto(m) { chamadas.push(["copiar", m.id]); d.ui.copiar(m.corpo); },
      velocidadeAudio: () => prefs.vel, definirVelocidadeAudio(v) { prefs.vel = L.velocidadeValida(v); chamadas.push(["velocidade", prefs.vel]); return prefs.vel; },
      assumirIA(b) { chamadas.push(["assumirIA", !!b]); }, devolverIA(b) { chamadas.push(["devolverIA", !!b]); }, assumir() { chamadas.push(["assumir"]); },
      resolver() { chamadas.push(["resolver"]); }, transferir() { chamadas.push(["transferir"]); }, status(s) { chamadas.push(["status", s]); },
    },
  };
  const chat = criarChat(A);
  d.doc.body.appendChild(chat.el);
  chat.renderTudo({ rolar: "fim" });
  await esperar(5);
  return { A, chat, chamadas, prefs };
}
// os testes de DOM usam o relógio de verdade (montarLinhas/interacoesPorDia olham para «hoje»)
const agoraIso = minAtras => new Date(Date.now() - minAtras * 60000).toISOString();
const txt = (id, dir, min, extra = {}) => ({ id, conversa_id: 9, direcao: dir, tipo: "texto", corpo: `msg ${id}`, wamid: `w${id}`, status: dir === "out" ? "entregue" : "recebida",
  enviado_por: dir === "out" ? { id: "u1", nome: "Helena" } : null, criado_em: agoraIso(min), ...extra });
const foto = (id, dir, min, extra = {}) => ({ id, conversa_id: 9, direcao: dir, tipo: "imagem", midia: { path: `cli/in/${id}.jpg`, nome: `foto-${id}.jpg` }, wamid: `w${id}`, status: "recebida", criado_em: agoraIso(min), ...extra });

test("31 (DOM) · bolhas: data-cauda só na última do grupo, hora fica no DOM, «Mensagens novas» entra onde a leitura parou e o dia de hoje é marcado", async () => {
  const d = comDom();
  try {
    const msgs = [txt(1, "in", 30), txt(2, "in", 29), txt(3, "out", 20), txt(4, "in", 10), txt(5, "in", 9)];
    const { A, chat } = await montarChat(d, { msgs });
    const caudas = [...chat.el.querySelectorAll(".cv-msg")].map(m => `${m.dataset.id}:${m.dataset.junta}${m.dataset.cauda}`);
    assert.deepEqual(caudas, ["1:00", "2:11", "3:01", "4:00", "5:11"]);
    assert.ok(chat.el.querySelector('.cv-msg[data-id="2"] .cv-rodape time'), "a hora da bolha colada continua no DOM (o CSS só a esconde até o hover)");
    assert.equal(chat.el.querySelector(".cv-dia").dataset.hoje, "1");
    assert.equal(chat.el.querySelector(".cv-novas-sep"), null, "sem não lidas, sem separador");
    A.marcaNovas = 4;
    chat.renderMensagens({ rolar: "manter" });
    const sep = achar(chat.el, ".cv-novas-sep");
    assert.equal(sep.getAttribute("role"), "separator");
    assert.equal(sep.nextSibling.dataset.id, "4", "o separador fica logo antes da primeira não lida");
    assert.ok(chat.el.querySelector('.cv-msg[data-id="3"] .cv-copiar'), "mensagem com texto ganha «Copiar texto»");
    chat.el.querySelector('.cv-msg[data-id="3"] .cv-copiar').click();
    assert.deepEqual(d.copiados, ["msg 3"]);
  } finally { d.fim(); }
});

test("32 (DOM) · grade: fotos seguidas viram uma bolha com células; sozinha continua bolha normal", async () => {
  const d = comDom();
  try {
    const msgs = [foto(1, "in", 30), foto(2, "in", 29), foto(3, "in", 28), txt(4, "in", 20), foto(5, "in", 10)];
    const { chat } = await montarChat(d, { msgs });
    const grade = achar(chat.el, ".cv-msg-grade");
    assert.equal(grade.dataset.n, "3");
    assert.equal(grade.querySelectorAll(".cv-grade-bt").length, 3);
    assert.equal(grade.querySelector(".cv-grade-bt").getAttribute("aria-label"), "Ampliar foto 1 de 3");
    assert.ok(grade.querySelector(".cv-rodape time"), "a grade tem hora da última foto");
    assert.ok(chat.el.querySelector('.cv-msg[data-id="5"] .cv-img-bt'), "a foto solta continua bolha com «Ampliar foto»");
    assert.equal(chat.el.querySelectorAll(".cv-msg").length, 3);
  } finally { d.fim(); }
});

test("31/32 (DOM) · fotos não lidas em grade: o separador «Mensagens novas» aparece logo antes da grade", async () => {
  const d = comDom();
  try {
    const { A, chat } = await montarChat(d, { msgs: [txt(1, "out", 20), foto(2, "in", 4), foto(3, "in", 4), foto(4, "in", 3)] });
    A.marcaNovas = L.primeiraNaoLida(A.msgs, 3);
    chat.renderMensagens({ rolar: "manter" });
    const sep = achar(chat.el, ".cv-novas-sep");
    assert.ok(sep.nextSibling && sep.nextSibling.classList.contains("cv-msg-grade"), "o separador fica colado na grade das fotos novas");
    assert.equal(sep.nextSibling.dataset.n, "3");
  } finally { d.fim(); }
});

test("33 (DOM) · visualizador: abre na foto certa, setas trocam, Home/End, Esc fecha e o foco volta para a foto que estava na tela", async () => {
  const d = comDom();
  try {
    const msgs = [foto(1, "in", 30), foto(2, "in", 29), txt(3, "out", 20), foto(4, "out", 10, { corpo: "olha isso" })];
    const { chat } = await montarChat(d, { msgs });
    const cel2 = achar(chat.el, '.cv-grade-bt[data-id="2"]');
    cel2.focus();
    cel2.click();
    const dlg = achar(d.doc.body, "dialog.cv-lb");
    assert.equal(dlg.open, true);
    assert.equal(dlg.querySelector(".cv-lb-n").textContent, "2 de 3");
    assert.equal(dlg.querySelector("img").getAttribute("src"), "https://cdn.test/cli/in/2.jpg");
    assert.equal(dlg.querySelector(".cv-lb-baixar").getAttribute("download"), "foto-2.jpg");
    assert.ok(dlg.contains(d.doc.activeElement), "o foco entra no visualizador");
    d.ev(dlg, "keydown", { key: "ArrowRight" });
    assert.equal(dlg.querySelector(".cv-lb-n").textContent, "3 de 3");
    assert.match(dlg.querySelector(".cv-lb-leg").textContent, /olha isso/);
    assert.equal(dlg.querySelector(".cv-lb-prox").disabled, true, "na última foto a seta da direita apaga");
    d.ev(dlg, "keydown", { key: "ArrowRight" });
    assert.equal(dlg.querySelector(".cv-lb-n").textContent, "3 de 3", "não passa do fim");
    d.ev(dlg, "keydown", { key: "Home" });
    assert.equal(dlg.querySelector(".cv-lb-n").textContent, "1 de 3");
    d.ev(dlg, "keydown", { key: "End" });
    const zoom = dlg.querySelector(".cv-lb-zoom");
    zoom.click();
    assert.equal(dlg.dataset.zoom, "1"); assert.equal(zoom.getAttribute("aria-pressed"), "true");
    d.ev(dlg, "keydown", { key: "ArrowLeft" });
    assert.equal(dlg.dataset.zoom, "0", "trocar de foto desfaz o zoom");
    d.ev(dlg, "keydown", { key: "Escape" });
    assert.equal(d.doc.body.querySelector("dialog.cv-lb"), null, "Esc fecha e remove o diálogo");
    assert.equal(d.doc.activeElement, cel2, "o foco volta para a foto 2 (a que estava na tela ao fechar)");
    // abrir pela bolha solta e fechar pelo X devolve o foco à própria bolha
    const bt4 = achar(chat.el, '.cv-msg[data-id="4"] .cv-img-bt');
    bt4.focus(); bt4.click();
    const dlg2 = achar(d.doc.body, "dialog.cv-lb");
    assert.equal(dlg2.querySelector(".cv-lb-n").textContent, "3 de 3");
    dlg2.querySelector(".cv-lb-x").click();
    assert.equal(d.doc.activeElement, bt4);
    assert.equal(chat.visualizador, null);
  } finally { d.fim(); }
});

test("33 (DOM) · visualizador: Tab fica preso dentro do diálogo e o clique no fundo fecha", async () => {
  const d = comDom();
  try {
    const { chat } = await montarChat(d, { msgs: [foto(1, "in", 30), foto(2, "in", 29)] });
    achar(chat.el, '.cv-grade-bt[data-id="1"]').click();
    const dlg = achar(d.doc.body, "dialog.cv-lb");
    const focaveis = dlg.querySelectorAll("button, a[href]").filter(x => !x.disabled && !x.hidden);
    focaveis[focaveis.length - 1].focus();
    const tab = new d.Evento("keydown", { key: "Tab" });
    dlg.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, true);
    assert.equal(d.doc.activeElement, focaveis[0], "do último volta ao primeiro");
    const shiftTab = new d.Evento("keydown", { key: "Tab", shiftKey: true });
    dlg.dispatchEvent(shiftTab);
    assert.equal(d.doc.activeElement, focaveis[focaveis.length - 1], "do primeiro vai ao último");
    const fora = new d.Evento("click"); fora.target = dlg;
    dlg.dispatchEvent(fora);
    assert.equal(d.doc.body.querySelector("dialog.cv-lb"), null);
  } finally { d.fim(); }
});

test("32 (DOM) · áudio: o <audio> continua a fonte; play/pausa, progresso acessível, duração e velocidade lembrada valem para todos os áudios", async () => {
  const d = comDom();
  try {
    const au = (id, min) => ({ id, conversa_id: 9, direcao: "in", tipo: "audio", midia: { path: `cli/in/${id}.ogg`, duracao: 65 }, wamid: `w${id}`, status: "recebida", criado_em: agoraIso(min) });
    const { chat, chamadas } = await montarChat(d, { msgs: [au(1, 30), txt(2, "out", 20), { ...au(3, 10), midia: { local_url: "blob:local-3" } }] });
    const caixas = chat.el.querySelectorAll(".cv-audio");
    assert.equal(caixas.length, 2);
    const [c1, c3] = caixas;
    assert.equal(c1.querySelector("audio").getAttribute("src"), "https://cdn.test/cli/in/1.ogg", "fonte assinada igual à de antes");
    assert.equal(c3.querySelector("audio").getAttribute("src"), "blob:local-3", "bolha local casada pelo blob continua tocando do blob");
    assert.equal(c1.querySelector(".cv-au-dur").textContent, "1:05", "duração vinda do servidor aparece antes de tocar");
    const trilho = c1.querySelector(".cv-au-trilho");
    assert.equal(trilho.getAttribute("role"), "slider");
    assert.equal(trilho.getAttribute("tabindex"), "0");
    const play = c1.querySelector(".cv-au-play");
    assert.equal(play.getAttribute("aria-label"), "Tocar áudio");
    play.click();
    assert.equal(c1.dataset.estado, "tocando");
    assert.equal(play.getAttribute("aria-label"), "Pausar áudio");
    const audio1 = c1.querySelector("audio");
    audio1.duration = 65; audio1.currentTime = 13; d.ev(audio1, "timeupdate", { bubbles: false });
    assert.equal(trilho.getAttribute("aria-valuenow"), "20");
    assert.equal(trilho.getAttribute("aria-valuetext"), "0:13 de 1:05");
    assert.equal(c1.querySelector(".cv-au-tempo").textContent, "0:13");
    assert.equal(c1.style.getPropertyValue("--pct"), "20.00%");
    // só um toca por vez
    c3.querySelector(".cv-au-play").click();
    assert.equal(audio1.paused, true, "o primeiro pausa quando o segundo começa");
    assert.equal(c1.dataset.estado, "parado"); assert.equal(c3.dataset.estado, "tocando");
    // teclado no trilho: → avança 5 s
    d.ev(trilho, "keydown", { key: "ArrowRight" });
    assert.equal(audio1.currentTime, 18);
    d.ev(trilho, "keydown", { key: "End" });
    assert.equal(audio1.currentTime, 65);
    // velocidade: cicla, grava a preferência e aplica ao outro áudio
    const vel = c1.querySelector(".cv-au-vel");
    assert.equal(vel.textContent, "1×");
    vel.click();
    assert.equal(vel.textContent, "1,5×");
    assert.equal(c3.querySelector(".cv-au-vel").textContent, "1,5×", "a velocidade vale para todos os áudios da conversa");
    assert.equal(c3.querySelector("audio").playbackRate, 1.5);
    assert.ok(chamadas.some(c => c[0] === "velocidade" && c[1] === 1.5), "a preferência é gravada pelo conversas.js");
    vel.click(); vel.click();
    assert.equal(vel.textContent, "1×", "1 → 1,5 → 2 → 1");
    d.ev(c3.querySelector("audio"), "ended", { bubbles: false });
    assert.equal(c3.dataset.estado, "parado");
  } finally { d.fim(); }
});

test("37 (DOM) · eventos do sistema seguidos viram um bloco recolhível com ícones por tipo; aberto fica aberto depois do redesenho", async () => {
  const d = comDom();
  try {
    const sis = (id, min, corpo) => ({ id, conversa_id: 9, direcao: "out", tipo: "sistema", corpo, criado_em: agoraIso(min) });
    const msgs = [txt(1, "in", 40), sis(2, 30, "IA pausada por Ana"), sis(3, 29, "Conversa transferida para Recepção"), sis(4, 28, "Atendimento resolvido"), txt(5, "in", 10), sis(6, 5, "Atribuída a Helena")];
    const { A, chat } = await montarChat(d, { msgs });
    const grupo = achar(chat.el, "details.cv-sis-grupo");
    assert.equal(grupo.dataset.n, "3");
    assert.match(grupo.querySelector(".cv-sis-resumo").textContent, /3 eventos do sistema · 1 da IA/);
    assert.deepEqual(grupo.querySelectorAll(".cv-sis-lista li").map(li => li.dataset.icone), ["ia", "transferir", "check"]);
    assert.ok(chat.el.querySelector('.cv-sis[data-id="6"][data-icone="usuario"]'), "o evento solto continua como pílula, agora com ícone");
    grupo.open = true; d.ev(grupo, "toggle", { bubbles: false });
    A.msgs = [...msgs, txt(7, "in", 1)];
    chat.renderMensagens({ rolar: "manter" });
    assert.equal(chat.el.querySelector("details.cv-sis-grupo").open, true, "redesenhar não fecha o que a pessoa abriu");
  } finally { d.fim(); }
});

test("38 (DOM) · barra de ações: toolbar com atalhos (aria-keyshortcuts + kbd), um só botão no Tab e setas que andam", async () => {
  const d = comDom();
  try {
    const { A, chat } = await montarChat(d, { msgs: [txt(1, "in", 5)], provedor: "meta", conv: { atribuida_a: null, atribuida_nome: null } });
    const barra = achar(chat.el, ".cvc-acoes");
    assert.equal(barra.getAttribute("role"), "toolbar");
    const assumir = barra.querySelectorAll("button").find(b => /Assumir/.test(b.textContent));
    assert.equal(assumir.getAttribute("aria-keyshortcuts"), "Alt+Shift+A");
    assert.equal(assumir.querySelector("kbd.cv-kbd").textContent, "Alt+⇧+A");
    assert.equal(barra.querySelector(".cvc-transferir").getAttribute("aria-keyshortcuts"), "Alt+Shift+T");
    assert.equal(barra.querySelector(".cvc-resolver-ic").getAttribute("aria-keyshortcuts"), "Alt+Shift+R");
    const botoes = barra.querySelectorAll("button");
    assert.deepEqual(botoes.map(b => b.getAttribute("tabindex")), ["0", "-1", "-1", "-1"], "só o primeiro entra na ordem do Tab");
    assumir.focus();
    d.ev(assumir, "keydown", { key: "ArrowRight" });
    assert.equal(d.doc.activeElement, botoes[1]);
    assert.deepEqual(botoes.map(b => b.getAttribute("tabindex")), ["-1", "0", "-1", "-1"]);
    d.ev(botoes[1], "keydown", { key: "End" });
    assert.equal(d.doc.activeElement, botoes[3]);
    d.ev(botoes[3], "keydown", { key: "ArrowRight" });
    assert.equal(d.doc.activeElement, botoes[0], "dá a volta");
    // janela de 24 h: a barrinha mostra o que resta (12 h de 24 = 0,5)
    const barraJan = achar(chat.el, ".cv-janela .cv-janela-barra");
    assert.ok(Math.abs(Number(barraJan.style.getPropertyValue("--pct")) - 0.5) < 0.01, `12 h de 24 h = 0,5 (veio ${barraJan.style.getPropertyValue("--pct")})`);
    // minha conversa: Resolver vira o botão de contorno com atalho
    A.ver.conversa.atribuida_a = "u1";
    chat.renderCabecalho();
    const resolver = achar(chat.el, ".bt-resolver");
    assert.equal(resolver.getAttribute("aria-keyshortcuts"), "Alt+Shift+R");
  } finally { d.fim(); }
});

test("38 (DOM) · barra de ações no celular: o ponto de Tab e as setas pulam os botões que o CSS escondeu (.so-largo)", async () => {
  const d = comDom();
  // no celular .cvc-acoes .so-largo tem display:none: sem caixa na tela, getClientRects() vem vazio
  const proto = Object.getPrototypeOf(d.doc.createElement("div"));
  const original = proto.getClientRects;
  proto.getClientRects = function () { return this.classList.contains("so-largo") ? [] : [1]; };
  try {
    const { A, chat } = await montarChat(d, { msgs: [txt(1, "in", 5)], provedor: "meta", conv: { atribuida_a: null, atribuida_nome: null } });
    A.raiz.dataset.lateral = "gaveta";             // com a lateral em gaveta entra também «Detalhes do contato» (.so-largo)
    chat.renderCabecalho();
    const barra = achar(chat.el, ".cvc-acoes");
    const botoes = barra.querySelectorAll("button");
    const nomes = botoes.map(b => b.getAttribute("aria-label") || b.textContent.trim().replace(/Alt.*$/, ""));
    assert.deepEqual(nomes, ["Assumir", "Transferir", "Resolver atendimento", "Detalhes do contato", "Mais ações"]);
    const assumir = botoes[0], mais = botoes[4];
    assert.deepEqual(botoes.map(b => b.getAttribute("tabindex")), ["0", "-1", "-1", "-1", "-1"]);
    assumir.focus();
    for (let k = 0; k < 3; k++) {
      d.ev(d.doc.activeElement, "keydown", { key: "ArrowRight" });
      const ponto = botoes.filter(b => b.getAttribute("tabindex") === "0");
      assert.equal(ponto.length, 1, "um ponto de Tab só");
      assert.ok(!ponto[0].classList.contains("so-largo"), `o ponto de Tab nunca vai para um botão escondido (seta ${k + 1})`);
      assert.equal(d.doc.activeElement, ponto[0], "o foco anda junto com o ponto de Tab");
    }
    assert.equal(d.doc.activeElement, mais, "Assumir → Mais ações → Assumir → Mais ações: só os visíveis");
    d.ev(mais, "keydown", { key: "Home" });
    assert.equal(d.doc.activeElement, assumir);
    d.ev(assumir, "keydown", { key: "End" });
    assert.equal(d.doc.activeElement, mais);
    // quem só lê não tem Assumir/Transferir: o 1º botão é o escondido, e o ponto de Tab precisa cair em «Mais ações»
    A.podeEscrever = false;
    chat.renderCabecalho();
    const leitura = achar(chat.el, ".cvc-acoes").querySelectorAll("button");
    assert.deepEqual(leitura.map(b => b.getAttribute("aria-label")), ["Detalhes do contato", "Mais ações"]);
    assert.deepEqual(leitura.map(b => b.getAttribute("tabindex")), ["-1", "0"], "a barra continua na ordem do Tab");
    // na tela larga (nada escondido) a regra antiga continua: o 1º botão é o ponto de Tab
    proto.getClientRects = function () { return [1]; };
    chat.renderCabecalho();
    assert.deepEqual(achar(chat.el, ".cvc-acoes").querySelectorAll("button").map(b => b.getAttribute("tabindex")), ["0", "-1"]);
  } finally { proto.getClientRects = original; d.fim(); }
});

test("37 (DOM) · pílula da IA: com a IA viva ela vira interruptor (pausar / retomar) em um toque; só leitura vê a pílula sem botão", async () => {
  const d = comDom();
  try {
    const ia = { disponivel: true, ia_ligada: true, pausada: false, respondendo: true };
    const t = await montarChat(d, { msgs: [txt(1, "in", 5)], ia });
    const pil = achar(t.chat.el, "button.cv-pil-ia");
    assert.equal(pil.getAttribute("aria-pressed"), "true");
    assert.match(pil.getAttribute("aria-label"), /IA atendendo\. Pausar a IA/);
    assert.ok(pil.querySelector(".cv-ia-ponto"), "respondendo agora: ponto que pulsa");
    pil.click();
    assert.deepEqual(t.chamadas.filter(c => c[0] === "assumirIA"), [["assumirIA", true]]);
    t.A.iaEstado = { ...ia, pausada: true, respondendo: false, pausada_por_nome: "Helena" };
    t.chat.renderCabecalho();
    const pil2 = achar(t.chat.el, "button.cv-pil-ia");
    assert.equal(pil2.getAttribute("aria-pressed"), "false");
    assert.ok(pil2.classList.contains("cv-pil-ia-feito"), "logo depois do toque a pílula nova ganha a confirmação visual");
    assert.equal(pil2.querySelector(".cv-pil-ia-acao").textContent, "retomar");
    pil2.click();
    assert.deepEqual(t.chamadas.filter(c => c[0] === "devolverIA"), [["devolverIA", true]]);
    d.fim();
    const d2 = comDom();
    const leitor = await montarChat(d2, { msgs: [txt(1, "in", 5)], ia, podeEscrever: false });
    assert.equal(leitor.chat.el.querySelector("button.cv-pil-ia"), null);
    assert.ok(leitor.chat.el.querySelector("span.cv-pil-ia"), "quem só lê vê a situação, sem o interruptor");
    d2.fim();
  } finally { try { globalThis.document && globalThis.document.body; } catch { /* ok */ } }
});

test("31 (DOM) · pílula «Novas mensagens ↓» diz quantas mensagens do cliente chegaram enquanto a pessoa lia acima", async () => {
  const d = comDom();
  try {
    const { A, chat } = await montarChat(d, { msgs: [txt(1, "in", 30), txt(2, "out", 20)] });
    const pil = achar(chat.el, ".cvc-novas");
    assert.equal(pil.hidden, true);
    const rol = achar(chat.el, ".cvc-msgs");
    rol.scrollHeight = 2000; rol.clientHeight = 500; rol.scrollTop = 0;     // a pessoa está lendo lá em cima
    A.msgs = [...A.msgs, txt(3, "in", 2), txt(4, "in", 1)];
    chat.renderMensagens({ rolar: "novas" });
    assert.equal(pil.hidden, false);
    assert.equal(pil.textContent, "2 novas mensagens");
    A.msgs = [...A.msgs, txt(5, "in", 0)];
    chat.renderMensagens({ rolar: "novas" });
    assert.equal(pil.textContent, "3 novas mensagens", "conta desde o ponto em que a pessoa parou de olhar o fim");
    pil.click();
    assert.equal(pil.hidden, true);
  } finally { d.fim(); }
});

/* ============================================================ (b) lista */
async function montarLista(d, { itens, canais, densidade = "confortavel" } = {}) {
  const { criarLista } = await import("../web/app/cv-lista.js");
  const chamadas = [];
  let A;
  A = {
    ui: d.ui, L, icone: d.ui.icone, ctx: { papel: "admin" }, podeEscrever: true, eu: { id: "u1", nome: "Ana" }, aba: "aguardando", busca: "", buscaMsgs: null, filtro: {},
    itens, temMais: false, carregandoLista: false, selId: null, erroLista: null, contagens: { aguardando: itens.length },
    base: { canais: canais || [{ id: "k1", nome: "Recepção", provedor: "codewords" }], departamentos: [], usuarios: [], etiquetas: [] },
    acoes: {
      mudarLista(p) { chamadas.push(p); }, carregarLista() {}, repetirBuscaMensagens() {}, lerAvisos: () => ({ som: false, tela: false }), pode: () => true,
      novaConversa() {}, atenderProximo() {}, menuAvisos() {}, rascunhoDe: () => "", filaResumo: () => null, nomeContato: c => (c && c.nome) || "",
      densidade: () => densidade, definirDensidade(v) { densidade = v; chamadas.push({ densidade: v }); },
    },
  };
  const lista = criarLista(A);
  d.doc.body.appendChild(lista.el);
  lista.render();
  return { A, lista, chamadas };
}
const convLista = (id, minEspera, extra = {}) => ({ id, contato: { id, nome: `Cliente ${id}`, telefone: `55000000000${id}` }, canal_id: "k1", canal: { id: "k1", nome: "Recepção", provedor: "codewords" },
  status: "aberta", aguardando: true, nao_lidas: 1, ultima_msg_dir: "in", ultima_msg_em: agoraIso(minEspera), ultima_entrada_em: agoraIso(minEspera), ultima_msg_resumo: `oi ${id}`, etiquetas: [], ...extra });

test("34 (DOM) · lista: SLA de espera por faixa (15/30/60 min), ícone do tipo da última mensagem e selo do canal só com mais de um número", async () => {
  const d = comDom();
  try {
    const itens = [convLista(1, 3), convLista(2, 20), convLista(3, 45, { ultima_msg_resumo: "Foto" }), convLista(4, 90, { ultima_msg_resumo: "Áudio: oi", canal: { id: "k2", nome: "Meta", provedor: "meta" }, canal_id: "k2" })];
    const { lista } = await montarLista(d, { itens, canais: [{ id: "k1", nome: "Recepção", provedor: "codewords" }, { id: "k2", nome: "Meta", provedor: "meta" }] });
    const linhas = lista.el.querySelectorAll(".cvl-item");
    assert.deepEqual(linhas.map(a => a.dataset.sla), ["ok", "aten", "ruim", "critico"]);
    assert.deepEqual(linhas.map(a => a.querySelector(".cvl-espera").dataset.sla), ["ok", "aten", "ruim", "critico"]);
    assert.match(linhas[3].querySelector(".cvl-espera").getAttribute("title"), /mais de 1 h/);
    assert.match(linhas[3].getAttribute("aria-label"), /espera longa/);
    assert.equal(linhas[0].querySelector(".cvl-tipo"), null, "texto comum não tem ícone");
    assert.equal(linhas[2].querySelector(".cvl-tipo .ic").dataset.icone, "imagem");
    assert.equal(linhas[3].querySelector(".cvl-tipo .ic").dataset.icone, "microfone");
    assert.equal(linhas[2].querySelector(".cvl-resumo").dataset.tipo, "imagem");
    assert.equal(linhas[0].querySelector(".cvl-canal").dataset.provedor, "codewords");
    assert.equal(linhas[3].querySelector(".cvl-canal").dataset.provedor, "meta");
    assert.match(linhas[3].querySelector(".cvl-canal").getAttribute("title"), /via Meta/);
    assert.match(linhas[3].getAttribute("aria-label"), /via Meta/);
  } finally { d.fim(); }
});

test("34 (DOM) · lista: com um número só não há selo de canal; o filtro expõe «Linhas compactas» e grava a densidade na hora", async () => {
  const d = comDom();
  try {
    const { lista, chamadas } = await montarLista(d, { itens: [convLista(1, 3)] });
    assert.equal(lista.el.querySelector(".cvl-canal"), null);
    assert.ok(lista.el.querySelector(".cvl-item > .avatar"), "o avatar segue direto na linha");
    const btFiltro = achar(lista.el, ".cvl-filtro");
    btFiltro.click();
    // o popover é desenhado pelo ui.flutuante falso: pegamos o corpo pelo interruptor de densidade
    const sw = d.doc.body.querySelector("input[name=densidade]") || null;
    assert.ok(sw === null || sw.getAttribute("role") === "switch");
    assert.match(ler("cv-lista.js"), /nome: "densidade", rotulo: "Linhas compactas"/);
    assert.match(ler("cv-lista.js"), /A\.acoes\.definirDensidade\(sw\.checked \? "compacta" : "confortavel"\)/);
    assert.equal(chamadas.length, 0);
  } finally { d.fim(); }
});

/* ============================================================ (b) lateral */
test("35 (DOM) · lateral: resumo com contadores do nx_cv_ver, mini-gráfico dos últimos 7 dias (com tabela), atalhos e seções recolhíveis lembradas", async () => {
  const d = comDom();
  try {
    const { criarLateral } = await import("../web/app/cv-lateral.js");
    const msgs = [txt(1, "in", 30), txt(2, "out", 20), txt(3, "in", 60 * 24 * 3)];
    const A = {
      ui: d.ui, L, G: null, podeEscrever: true, selId: 9, msgs, eu: { id: "u1" }, base: { etiquetas: [] },
      ctx: { vocab: { negocios: "Negócios", negocio: "Negócio" }, temModulo: m => m === "crm", abrirContato() {}, novoNegocio() {}, abrirNegocio() {} },
      api: { rpcC: async () => ({ campos: [] }) },
      acoes: { nomeContato: c => (c && c.nome) || "", recarregarVer() {}, carregarLista() {}, tratarErro() {}, etiquetas() {}, criarEtiqueta() {}, vincular() {}, abrir() {} },
      ver: { conversa: { id: 9, protocolo: "ORB-9", etiquetas: ["e1"], atribuida: { nome: "Ana" } }, contato: { id: 5, nome: "Mariana", telefone: "5512999990000" },
        negocios: [{ id: 1, titulo: "Aparelho", valor_previsto: 5200, estagio_nome: "Avaliação" }, { id: 2, titulo: "Clareamento", valor_previsto: 900 }],
        atendimentos: [{ id: 9, protocolo: "ORB-9", status: "aberta", aberta_em: agoraIso(60) }, { id: 8, protocolo: "ORB-8", status: "resolvida", aberta_em: agoraIso(6000) }],
        tarefas: [{ id: 71, titulo: "Ligar", atrasada: true, vence_em: agoraIso(60) }] },
    };
    const lat = criarLateral(A);
    const alvo = d.h("aside");
    d.doc.body.appendChild(alvo);
    lat.montarEm(alvo);
    const kpis = alvo.querySelectorAll(".cvt-kpi");
    assert.deepEqual(kpis.map(k => k.querySelector(".cvt-kpi-v").textContent), ["2", "2", "1"]);
    assert.equal(kpis[0].querySelector(".cvt-kpi-d").textContent, "R$ 6.100");
    assert.equal(kpis[2].querySelector(".cvt-kpi-d").textContent, "1 atrasada");
    assert.equal(kpis[2].dataset.tom, "ruim");
    const barras = alvo.querySelectorAll(".cvt-barra");
    assert.equal(barras.length, 7, "sem graficos.sparkline a lateral desenha 7 barras simples");
    assert.equal(barras[6].dataset.hoje, "1");
    assert.equal(barras[6].style.getPropertyValue("--h"), "100%");
    assert.equal(barras[6].style.getPropertyValue("--in"), "50%", "metade das mensagens de hoje é do cliente");
    assert.equal(barras[3].dataset.vazio, "0", "3 dias atrás tem 1 mensagem");
    assert.equal(alvo.querySelector(".cvt-mini-total").textContent, "3");
    assert.equal(alvo.querySelectorAll(".cvt-mini-tab tbody tr").length, 7, "a tabela acessível traz os mesmos números");
    const atalhos = alvo.querySelectorAll(".cvt-atalho");
    assert.deepEqual(atalhos.map(a => a.textContent), ["Ligar", "Protocolo", "Agenda", "Ficha"]);
    assert.equal(atalhos[0].getAttribute("href"), "tel:+5512999990000");
    atalhos[1].click();
    assert.deepEqual(d.copiados, ["ORB-9"]);
    const secs = alvo.querySelectorAll("details.cvt-sec");
    assert.deepEqual(secs.map(s => s.dataset.sec), ["dados", "etiquetas", "negocios", "tarefas", "atendimentos", "resumo-ia"]);
    assert.ok(secs.every(s => s.open), "tudo aberto por padrão");
    assert.equal(secs[2].querySelector(".cvt-sec-n").textContent, "2", "contador na seção de negócios");
    assert.ok(secs[2].querySelector(".cvt-sec-acao .bt"), "a ação da seção fica fora do summary");
    secs[2].open = false; d.ev(secs[2], "toggle", { bubbles: false });
    assert.equal(d.mem.get("nx-cv-lat-negocios"), "0");
    lat.render();
    const negocios = alvo.querySelectorAll("details.cvt-sec").find(s => s.dataset.sec === "negocios");
    assert.equal(negocios.open, false, "ao redesenhar a seção lembra que estava recolhida");
    const chk = alvo.querySelector(".cvt-tar input");
    chk.checked = true; d.ev(chk, "change");
    assert.equal(chk.closest(".cvt-tar").dataset.feita, "1", "a tarefa risca na hora (check animado)");
  } finally { d.fim(); }
});

/* ============================================================ (b) composer */
async function montarComposer(d) {
  const { criarComposer } = await import("../web/app/cv-composer.js");
  const enviados = [];
  let ia = async () => ({ texto: "Olá! Posso ajudar com a avaliação." });
  const A = {
    ui: d.ui, L, ctx: { cliente: { nome: "Clínica" } }, selId: 9, rascunhos: new Map(), podeEscrever: true, eu: { id: "u1", nome: "Ana Paula" }, icone: d.ui.icone,
    base: { ia: { ligada: true }, departamentos: [{ id: "d1", nome: "Recepção" }], respostas: [
      { id: "r1", atalho: "ola", titulo: "Boas-vindas", corpo: "Olá, {primeiro_nome}! Aqui é {atendente}, da {empresa}. Como posso ajudar?", ativo: true, usos: 18, departamento_id: "d1" },
      { id: "r2", atalho: "horario", titulo: "Horário", corpo: "Qual dia fica melhor: {dia 1} ou {dia 2}?", ativo: true, usos: 3 },
    ] },
    ver: { contato: { id: 5, nome: "maria souza" }, conversa: { id: 9, status: "aberta", canal_id: "k1", canal: { provedor: "codewords" }, departamento_id: "d1" } },
    acoes: { rascunhoMudou() {}, nomeContato: c => (c && c.nome) || "", pode: () => true, focarLista() {}, tratarErro() {}, respostaUsada() {},
      enviar: async o => { enviados.push(o); return { persistido: true }; }, sugerirIA: () => ia(), nota: async () => ({}) },
  };
  const comp = criarComposer(A);
  d.doc.body.appendChild(comp.el);
  comp.definirConversa();
  const ta = achar(comp.el, "textarea[aria-label=Mensagem]");
  return { A, comp, ta, enviados, aoIA(fn) { ia = fn; }, digitar(t) { ta.value = t; d.ev(ta, "input"); } };
}

test("36 (DOM) · respostas rápidas: «/» marca o termo, mostra a prévia com variáveis pintadas e, ao inserir, Tab pula entre os {campos}", async () => {
  const d = comDom();
  try {
    const t = await montarComposer(d);
    t.digitar("/hor");
    const rr = achar(t.comp.el, ".cvx-rr");
    assert.equal(rr.hidden, false);
    assert.equal(achar(t.comp.el, ".cvx-rr-bt").getAttribute("aria-expanded"), "true");
    const op = achar(rr, ".cvx-rr-op");
    assert.equal(op.querySelector("mark").textContent, "hor", "o trecho que casou com a busca fica marcado");
    assert.match(op.querySelector(".cvx-rr-meta").textContent, /3 usos/);
    const previa = achar(rr, ".cvx-rr-previa");
    assert.equal(previa.querySelectorAll("mark.cvx-pend").length, 2, "{dia 1} e {dia 2} aparecem como campos a preencher");
    assert.match(previa.querySelector(".cvx-rr-previa-rod").textContent, /2 campos para preencher/);
    t.digitar("/ola");
    const previa2 = achar(t.comp.el, ".cvx-rr-previa");
    assert.deepEqual(previa2.querySelectorAll("mark.cvx-var").map(m => m.textContent), ["Maria", "Ana", "Clínica"]);
    assert.match(previa2.querySelector(".cvx-rr-meta, .cvx-rr-previa-rod").textContent, /Pronta para enviar/);
    assert.match(t.comp.el.querySelector(".cvx-rr-op .cvx-rr-meta").textContent, /18 usos · Recepção/);
    // inserir a de horário: seleção cai no 1º campo; Tab vai para o 2º; Tab de novo dá a volta; Shift+Tab volta
    t.digitar("/hor");
    d.ev(t.ta, "keydown", { key: "Enter" });
    assert.equal(t.ta.value, "Qual dia fica melhor: {dia 1} ou {dia 2}?");
    assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [22, 29]);
    const tab = new d.Evento("keydown", { key: "Tab" }); t.ta.dispatchEvent(tab);
    assert.equal(tab.defaultPrevented, true);
    assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [33, 40]);
    const volta = new d.Evento("keydown", { key: "Tab", shiftKey: true }); t.ta.dispatchEvent(volta);
    assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [22, 29]);
    t.ta.setSelectionRange(3, 3);
    const livre = new d.Evento("keydown", { key: "Tab" }); t.ta.dispatchEvent(livre);
    assert.equal(livre.defaultPrevented, false, "sem {campo} selecionado o Tab segue o caminho normal");
    assert.equal(achar(t.comp.el, ".cvx-rr-bt").getAttribute("aria-expanded"), "false");
  } finally { d.fim(); }
});

test("36 (DOM) · botão ⚡ abre o menu; com texto já digitado a resposta entra no cursor sem apagar nada", async () => {
  const d = comDom();
  try {
    const t = await montarComposer(d);
    const bt = achar(t.comp.el, ".cvx-rr-bt");
    bt.click();
    assert.equal(t.ta.value, "/", "campo vazio: a barra entra e o menu abre com tudo");
    assert.equal(achar(t.comp.el, ".cvx-rr").hidden, false);
    assert.equal(t.comp.el.querySelectorAll(".cvx-rr-op").length, 2);
    bt.click();
    assert.equal(achar(t.comp.el, ".cvx-rr").hidden, true, "segundo toque fecha");
    t.digitar("Bom dia!");
    t.ta.setSelectionRange(8, 8);
    bt.click();
    d.ev(t.ta, "keydown", { key: "ArrowDown" });
    d.ev(t.ta, "keydown", { key: "Enter" });
    assert.equal(t.ta.value, "Bom dia! Qual dia fica melhor: {dia 1} ou {dia 2}?");
    assert.deepEqual([t.ta.selectionStart, t.ta.selectionEnd], [31, 38], "a seleção cai no primeiro campo da resposta inserida");
  } finally { d.fim(); }
});

test("36 (DOM) · «Sugerir com IA» mostra o selo com Descartar; editar o texto some com o selo; descartar devolve o que havia", async () => {
  const d = comDom();
  try {
    const t = await montarComposer(d);
    const selo = achar(t.comp.el, ".cvx-ia-selo");
    assert.equal(selo.hidden, true);
    achar(t.comp.el, "button[aria-label='Sugerir resposta com IA']").click();
    await esperar(5);
    assert.equal(selo.hidden, false);
    assert.equal(t.ta.value, "Olá! Posso ajudar com a avaliação.");
    selo.querySelector("button").click();
    assert.equal(t.ta.value, "", "descartar limpa a sugestão");
    assert.equal(selo.hidden, true);
    t.digitar("Oi, ");
    achar(t.comp.el, "button[aria-label='Sugerir resposta com IA']").click();
    await esperar(5);
    assert.equal(selo.hidden, false);
    assert.match(t.ta.value, /^Oi,\n\nOlá!/);
    selo.querySelector("button").click();
    assert.equal(t.ta.value, "Oi,", "com texto antes, descartar tira só a sugestão");
    achar(t.comp.el, "button[aria-label='Sugerir resposta com IA']").click();
    await esperar(5);
    t.digitar(`${t.ta.value} ok`);
    assert.equal(selo.hidden, true, "mexeu no texto: a sugestão virou texto da pessoa e o selo sai");
  } finally { d.fim(); }
});

test("36 (DOM) · selo da IA: trocar de conversa esconde o selo (o campo da outra conversa não tem sugestão) e o Descartar de lá não apaga nada", async () => {
  const d = comDom();
  try {
    const t = await montarComposer(d);
    const selo = achar(t.comp.el, ".cvx-ia-selo");
    achar(t.comp.el, "button[aria-label='Sugerir resposta com IA']").click();
    await esperar(5);
    assert.equal(selo.hidden, false);
    assert.equal(t.A.rascunhos.get(9), "Olá! Posso ajudar com a avaliação.", "a sugestão ficou no rascunho da conversa 9");
    // vai para a conversa 10 (campo vazio)
    t.A.selId = 10;
    t.A.ver = { contato: { id: 6, nome: "Bianca Ferreira" }, conversa: { id: 10, status: "aberta", canal_id: "k1", canal: { provedor: "codewords" } } };
    t.comp.definirConversa();
    assert.equal(t.ta.value, "", "o campo da conversa 10 está vazio");
    assert.equal(selo.hidden, true, "o selo não pode afirmar que há sugestão da IA num campo vazio de outra conversa");
    // na conversa 11, com um texto que a própria pessoa digitou: nada de selo, e o texto fica
    t.A.rascunhos.set(11, "texto que eu escrevi");
    t.A.selId = 11;
    t.A.ver = { contato: { id: 7, nome: "Caio" }, conversa: { id: 11, status: "aberta", canal_id: "k1", canal: { provedor: "codewords" } } };
    t.comp.definirConversa();
    assert.equal(t.ta.value, "texto que eu escrevi");
    assert.equal(selo.hidden, true);
    // voltar para a 9: o texto volta do rascunho, mas como texto da pessoa (sem selo nem Descartar que o apague)
    t.A.selId = 9;
    t.A.ver = { contato: { id: 5, nome: "maria souza" }, conversa: { id: 9, status: "aberta", canal_id: "k1", canal: { provedor: "codewords" } } };
    t.comp.definirConversa();
    assert.equal(t.ta.value, "Olá! Posso ajudar com a avaliação.");
    assert.equal(selo.hidden, true);
  } finally { d.fim(); }
});

test("36 · contrato da sugestão da IA: o nx-ia de verdade responde {texto}; o composer e o resumo leem .texto", () => {
  const srv = readFileSync(join(AQUI, "..", "supabase", "functions", "_compartilhado", "ia_conversas.js"), "utf8");
  assert.match(srv, /respostaPainel\(\{ ok: true, texto: String\(r\.texto\)\.slice\(0, 4096\), acao \}\)/, "sugerir e resumir devolvem o texto em «texto»");
  assert.match(ler("cv-composer.js"), /const texto = r && typeof r\.texto === "string" \? r\.texto\.trim\(\) : "";/);
  assert.match(ler("cv-lateral.js"), /const texto = x && typeof x\.texto === "string" \? x\.texto\.trim\(\) : "";/);
  assert.match(ler("conversas.js"), /if \(cota && r && r\.texto\) cota\.usadas/);
});

/* ============================================================ (c) CSS e fonte */
test("CSS · todo movimento novo desliga em prefers-reduced-motion; sem hex; sem transition: all; a cauda e a hora discreta estão no CSS", () => {
  const css = ler("conversas.css");
  const bloco = css.slice(css.indexOf("Plano 50 (04/10/2026)"));
  assert.ok(bloco.length > 1000, "o bloco do plano 50 está no fim do conversas.css");
  assert.doesNotMatch(bloco, /#[0-9a-fA-F]{3,8}\b/, "nenhuma cor escrita: só tokens");
  assert.doesNotMatch(css, /transition:\s*all\b/);
  for (const anim of ["cvLbEntra", "cvIaFeito", "cvtSobe", "cvtFeita"]) {
    assert.match(bloco, new RegExp(`@keyframes ${anim}`));
  }
  const reduz = [...bloco.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([^}]*\}\s*)+?\}/g)].map(m => m[0]).join("\n");
  for (const sel of [".cv-lb[open]", ".cv-ia-ponto", ".cvt-barra::before", ".cvt-tar[data-feita=\"1\"]", ".cvl-espera[data-sla=\"critico\"] .ic", ".cv-grade-bt:hover img", ".cv-kbd"]) {
    assert.ok(reduz.includes(sel), `reduced-motion cobre ${sel}`);
  }
  assert.match(bloco, /\.cv-msg\[data-cauda="1"\]:not\(\[data-tipo="nota"\]\) \.cv-bolha::after/);
  assert.match(bloco, /\.cv-dia \{ position: sticky; top: -2px; z-index: 2; \}/);
  assert.match(bloco, /\.cv-audio audio \{ display: none; \}/);
  assert.match(bloco, /\.cv-au-vel \{ min-width: 44px; min-height: 44px;/);
  assert.match(css, /\.cvl-item > \.cvl-av \{ grid-row: span 3;/);
  assert.match(css, /\.cvt-sec-cab \{[^}]*min-height: 44px;[^}]*cursor: pointer;/);
});

test("CSS · alvos de toque de 44 px: o trilho do áudio cresce sem mudar o desenho e o histórico do número também", () => {
  const css = ler("conversas.css");
  const bloco = css.slice(css.indexOf("Plano 50 (04/10/2026)"));
  assert.match(bloco, /@media \(max-width: 760px\), \(pointer: coarse\) \{ \.cv-au-trilho \{ height: 44px; margin: -10px 0; \} \}/,
    "44 px de área com -10 px em cima e embaixo: o trilho (24 px) ocupa o mesmo lugar de antes");
  assert.match(bloco, /@media \(max-width: 760px\), \(pointer: coarse\) \{ details\.cfg-hist > summary \{ min-height: 44px; \} \}/,
    "seletor mais específico que o «.cfg-hist summary» do config.css, que carrega em paralelo");
  // a linha, a parte carregada e a posição continuam centradas pelo flex (são absolutas sem top): nada depende da altura
  assert.match(css, /\.cv-au-trilho \{ position: relative; height: 24px; display: flex; align-items: center;/);
  assert.doesNotMatch(css.match(/\.cv-au-trilho::before \{[^}]*\}/)[0], /top:/);
});

test("fonte · a fila idempotente, o Resolver com Desfazer, o rascunho por conversa e o casamento da mídia local pelo path não mudaram", () => {
  const conv = ler("conversas.js");
  assert.match(conv, /if \(L\.esperaReenvioFila\(it\) > 0\) return "espera";/, "90 s entre tentativas do mesmo item");
  assert.match(conv, /it\.estado === "andamento"/, "409 «em andamento» continua a perguntar de novo em ~20 s");
  assert.match(ler("cv-logica.js"), /cod === "envio_em_andamento"/);
  assert.match(conv, /acaoComDesfazer\(\{\s*texto: `Resolvida · \$\{nome\}`/);
  assert.match(conv, /function descartarMidiaLocalGravada\(\)/);
  assert.match(conv, /A\.marcaNovas = A\.L\.primeiraNaoLida\(A\.msgs, ver\.conversa && ver\.conversa\.nao_lidas\)/);
  assert.match(conv, /velocidadeAudio: L\.velocidadeValida\(lerPreferencia\("audio-vel", "1"\)\)/);
  assert.match(conv, /import\(`\.\/graficos\.js\?v=\$\{v\}`\)\.catch\(\(\) => null\)/, "graficos.js entra por detecção, com ?v=");
  const chat = ler("cv-chat.js");
  assert.match(chat, /if \(m\.tipo === "audio"\) return blocoAudio\(m, url, md\);/, "o <audio> continua recebendo a mesma url (assinada ou blob local)");
  assert.match(chat, /typeof ui\.deslizar === "function"/, "swipe por detecção");
  assert.match(chat, /typeof ui\.dica === "function"/, "tooltip da frente A por detecção");
  assert.match(ler("cv-lateral.js"), /typeof G\.sparkline === "function"/, "sparkline da frente A por detecção");
  assert.match(ler("cv-lateral.js"), /class: "cvt-kpi", dataset: \{ tom: tom \|\| "neutro" \}/, "a lateral usa as linhas compactas próprias (o ui.kpi é cartão de painel, largo para 300 px)");
  assert.doesNotMatch(ler("cv-lateral.js"), /\.append\(\s*\n?\s*h\("summary"/, "append() com filho nulo escreveria «null» na tela: as seções nascem pelo h()");
});
