/* ============================================================
   ÓRBITA — plano 1500c, frente ads (Anúncios, Relatórios, Rastreio) · lotes ads-a1 e ads-a2
   node --test testes/plano1500c-ads.teste.mjs      (Node puro, sem rede e sem navegador)
   Peças puras de anuncios.js / ads-config.js / relatorios.js / rel-logica.js / rastreio-config.js; peças de tela num DOM mínimo;
   o script do site (web/rastreio.v3.js, NOVO — v1 e v2 continuam congeladas) roda num contexto vm com janela falsa. O que só existe
   dentro do montar() das telas é conferido pela fonte, como nos planos anteriores. Cada teste falharia no código anterior ao lote.
   Datas relativas ao relógio (hojeSP / Date.now) — nada preso à hora em que a suíte roda.
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ler = f => readFileSync(join(RAIZ, f), "utf8").replace(/\r\n/g, "\n");

/* ---------- DOM mínimo (o mesmo do plano 1000b) ---------- */
class No {
  constructor(tag, ns = null) { this.tagName = String(tag).toUpperCase(); this.tag = String(tag).toLowerCase(); this.ns = ns; this.nodeType = 1; this.attrs = {}; this.childNodes = []; this.parentNode = null; this.eventos = {}; this.hidden = false; this.isConnected = true;
    const self = this; this.style = { _p: {}, setProperty(k, v) { this._p[k] = String(v); }, getPropertyValue(k) { return this._p[k] || ""; } };
    this.dataset = new Proxy({}, { set(o, k, v) { o[k] = String(v); self.attrs[`data-${String(k).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`] = String(v); return true; } });
    this.classList = { add: (...c) => { const s = new Set(self._cls()); c.forEach(x => s.add(x)); self.attrs.class = [...s].join(" "); }, remove: (...c) => { self.attrs.class = self._cls().filter(x => !c.includes(x)).join(" "); },
      toggle: (c, f) => { const tem = self._cls().includes(c); const on = f === undefined ? !tem : !!f; on ? self.classList.add(c) : self.classList.remove(c); return on; }, contains: c => self._cls().includes(c) }; }
  _cls() { return String(this.attrs.class || "").split(/\s+/).filter(Boolean); }
  get className() { return this.attrs.class || ""; } set className(v) { this.attrs.class = String(v); }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get childElementCount() { return this.children.length; }
  get textContent() { return this.nodeType === 3 ? this._t : this.childNodes.map(c => c.textContent).join(""); }
  set textContent(v) { this.childNodes = []; if (v !== "") this.append(txt(v)); }
  get clientWidth() { return 600; } get offsetWidth() { return 120; }
  getBoundingClientRect() { return { width: 600, height: 260, left: 0, top: 0, right: 600, bottom: 260 }; }
  append(...xs) { for (const x of xs.flat(Infinity)) { if (x == null || x === false) continue; const n = typeof x === "string" ? txt(x) : x; n.parentNode = this; this.childNodes.push(n); } }
  prepend(...xs) { for (const x of xs.reverse()) { const n = typeof x === "string" ? txt(x) : x; n.parentNode = this; this.childNodes.unshift(n); } }
  remove() { if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter(c => c !== this); this.parentNode = null; }
  replaceChildren(...xs) { this.childNodes = []; this.append(...xs); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } removeAttribute(k) { delete this.attrs[k]; } hasAttribute(k) { return k in this.attrs; }
  addEventListener(t, fn) { (this.eventos[t] ||= []).push(fn); }
  emitir(t, ev = {}) { const e = { type: t, target: this, currentTarget: this, preventDefault() {}, ...ev }; for (const fn of this.eventos[t] || []) fn(e); return e; }
  click() { this.emitir("click"); } focus() { document.activeElement = this; } blur() {}
  querySelectorAll(sel) { const partes = sel.split(/\s+/); const out = []; const anda = (n, i) => { for (const c of n.children) { if (casa(c, partes[i])) { if (i === partes.length - 1) out.push(c); else anda(c, i + 1); } anda(c, i); } }; anda(this, 0); return [...new Set(out)]; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
const txt = v => { const n = new No("#text"); n.nodeType = 3; n._t = String(v); return n; };
function casa(n, simples) {
  if (!simples || n.nodeType !== 1) return false;
  const m = simples.match(/^([a-z0-9]+)?((?:[.#\[][^.#\[]+)*)$/i); if (!m) return false;
  if (m[1] && n.tag !== m[1].toLowerCase()) return false;
  for (const parte of (m[2] || "").match(/[.#\[][^.#\[]+/g) || []) {
    if (parte[0] === ".") { if (!n._cls().includes(parte.slice(1))) return false; }
    else if (parte[0] === "#") { if (n.attrs.id !== parte.slice(1)) return false; }
    else { const a = parte.slice(1, -1).match(/^([\w-]+)(?:=["']?([^"'\]]*)["']?)?$/); if (!a) return false; if (!(a[1] in n.attrs)) return false; if (a[2] !== undefined && n.attrs[a[1]] !== a[2]) return false; }
  }
  return true;
}
const document = { activeElement: null, documentElement: new No("html"), body: new No("body"), hidden: false,
  createElement: t => new No(t), createElementNS: (ns, t) => new No(t, ns), createTextNode: txt };
globalThis.document = document;

const N = await import("../web/nucleo.js");
const L = await import("../web/app/rel-logica.js");
const G = await import("../web/app/graficos.js");
const A = await import("../web/app/anuncios.js");
const RL = await import("../web/app/relatorios.js");
const AC = await import("../web/app/ads-config.js");
const RC = await import("../web/app/rastreio-config.js");

const ADS = ler("web/app/anuncios.js"), REL = ler("web/app/relatorios.js"), CSS = ler("web/app/relatorios.css"), ADSCFG = ler("web/app/ads-config.js");
const RCFG = ler("web/app/rastreio-config.js"), V3 = ler("web/rastreio.v3.js"), V2 = ler("web/rastreio.v2.js"), RLOG = ler("web/app/rel-logica.js");
const ADS_ANTES_1500 = /plano 1500c/;   // marca de cada mudança (REGRAS)

/* ---------- fixtures (relativas a hoje em SP) ---------- */
const HOJE = N.hojeSP();
const dia = n => { const d = N.meioDia(HOJE); d.setDate(d.getDate() - n); return N.isoDe(d); };
const met = (d, o = {}) => ({ p: "meta", d, n: "anuncio", c: "C1", cn: "Campanha Meta", a: "A1", an: "Vídeo", g: 30, imp: 1000, alc: 800, cli: 20, conv: 2, freq: 1.2, ...o });
const montarDe = ({ metricas = [], leads = [], cliente = {} } = {}) =>
  N.montar(N.datasetDeLinhas({ metricas, leads, hoje: HOJE, dias: 130, cliente: { nome: "Clínica Teste", cfg: {}, ...cliente } }));
const esperar = ms => new Promise(r => setTimeout(r, ms));
const serie = (de, ate, o = {}) => Array.from({ length: ate - de + 1 }, (_, k) => met(dia(de + k), o));
const lead = (o = {}) => ({ id: `l${Math.random()}`, plataforma: "meta", campanha_ext: "C1", anuncio_ext: "A1", etapa: "conversa", data_conversa: dia(3), ...o });

test("marca · cada arquivo da frente ads traz o comentário «plano 1500c»", () => {
  for (const src of [ADS, REL, ADSCFG, RCFG, RLOG, CSS, V3]) assert.match(src, ADS_ANTES_1500);
});

/* ============================================================ CSV e exportação */
test("AC-077 · nome do CSV com as datas ISO reais e a plataforma depois das datas", () => {
  assert.equal(L.nomeArquivoExport("anuncios", "2026-09-21", "2026-10-20", "csv", "", "meta"), "orbita-anuncios-2026-09-21-a-2026-10-20-meta.csv");
  assert.equal(L.nomeArquivoExport("anuncios", "2026-09-21", "2026-10-20", "csv"), "orbita-anuncios-2026-09-21-a-2026-10-20.csv");
  // plano 2000d: DA-336 — a agência configurada vai junto (marcaAgencia())
  assert.match(ADS, /L\.nomeArquivoExport\("campanhas", N\.isoDe\(M\.dataDe\(P\.de\)\), N\.isoDe\(M\.dataDe\(P\.ate\)\), "csv", ctx\.cliente\.nome, S\.plat, marcaAgencia\(\)\)/);
});
test("AC-078/AC-163 · CSV sem casas infinitas nem notação científica", () => {
  const s = L.csv(["v"], [[0.1 + 0.2], [1e-7], [12.499999], [-0.004], [3]]).slice(1).split("\r\n");
  assert.deepEqual(s.slice(1), ["0,3", "0", "12,5", "0", "3"]);
  assert.equal(L.numeroCsv(1.5), "1,5"); assert.equal(L.numeroCsv(NaN), "");
  assert.match(ADS, /Math\.round\(d\.convAds \* 100\) \/ 100/);
});
test("AC-164 · telefone e número negativo não ganham apóstrofo; fórmula continua protegida", () => {
  const s = L.csv(["t"], [["+5511999990000"], ["+55 (11) 99999-0000"], ["-5"], ["=1+1"], ["+cmd|x"], ["@SOMA"], ["-2+3+cmd|' /C calc'!A0"]]).slice(1).split("\r\n");
  assert.deepEqual(s.slice(1, 4), ["+5511999990000", "+55 (11) 99999-0000", "-5"]);
  for (const l of s.slice(4)) assert.match(l, /^"?'/, `protegido: ${l}`);
});
test("AC-085 · CSV de campanhas com impressões, cliques, CTR, CPM e custo por agendamento/fechamento (no fim)", () => {
  const rows = [{ c: { nome: "C", plat: "meta" }, t: { gasto: 100, conversoes: 4, cpa: 25, impressoes: 2000, cliques: 40, ctr: 2, cpm: 50 }, k: { conversas: 4, agendadas: 2, fecharam: 1, receita: 500, receitaEstimada: 0 }, roas: 5 }];
  const out = A.csvCampanhas(rows, { periodo: "x", csv: L.csv }).slice(1).split("\r\n");
  const cab = out[0].split(";");
  assert.deepEqual(cab.slice(-6), ["Impressões", "Cliques", "CTR %", "CPM", "Custo por agendamento CRM", "Custo por fechamento CRM"]);
  assert.equal(cab[0], "Período", "as colunas antigas não mudam de lugar");
  assert.deepEqual(out[1].split(";").slice(-6), ["2000", "40", "2", "50", "50", "100"]);
});
test("AC-116 · CSV do ranking de criativos", () => {
  const lista = [{ pos: 1, k: { nome: "Vídeo", plat: "meta" }, camp: { nome: "C1" }, t: { gasto: 90.456, conversoes: 3, cpa: 30.152 }, c: { agendadas: 2, fecharam: 1, receita: 700 }, cpag: 45.228, roas: 7.7 }];
  const r = A.csvRanking(lista, L.nomePlat);
  assert.equal(r.colunas[0], "Posição"); assert.equal(r.colunas.length, r.linhas[0].length);
  assert.deepEqual(r.linhas[0].slice(0, 5), [1, "Vídeo", "Meta", "C1", 90.46]);
  assert.match(ADS, /botaoCsv\("ranking-criativos", csvR\.colunas/);
});
test("AC-087 · PNG com 1080 px de largura também no celular", () => {
  assert.equal(A.escalaExport(360), 3); assert.equal(A.escalaExport(1200), 2, "nunca abaixo de 2");
  assert.equal(A.LARGURA_PNG, 1080);
  assert.match(ADS, /escalaExport\(/);
});

/* ============================================================ ritmo, metas e tabela */
test("AC-080 · orçamento já todo usado: só o aviso e o que fazer (sem «segurar R$ X por dia»)", () => {
  const t = A.textoRitmo({ restam: 10, cedo: false, gasto: 3100, proj: 4500, pass: 20 }, 3000, { brl0: v => `R$ ${Math.round(v)}`, brl: v => `R$ ${v}` });
  assert.match(t, /^O orçamento do mês \(R\$ 3000\) já foi todo usado: R\$ 3100 até ontem\./);
  assert.doesNotMatch(t, /diário sugerido|segurar/);
  assert.match(A.textoRitmo({ restam: 10, cedo: false, gasto: 1000, proj: 3600, pass: 20 }, 3000), /Orçamento diário sugerido: R\$ 200/);
  assert.match(A.textoRitmo({ restam: 10, cedo: false, gasto: 1000, proj: 2000, pass: 20 }, 3000), /^Dentro do orçamento/);
});
test("AC-081 · a meta de custo é a da plataforma da campanha", () => {
  const cfg = { cpaAlvo: 20, cpaAlvoGoogle: 60 };
  assert.equal(A.metaDaPlataforma("google", cfg), 60); assert.equal(A.metaDaPlataforma("meta", cfg), 20);
  assert.equal(A.metaDaPlataforma("google", { cpaAlvo: 20 }), 0, "Google sem meta própria: sem cor (antes ficava vermelho contra a meta do Meta)");
  assert.match(ADS, /const metaDe = plat => metaDaPlataforma\(plat, M\.CFG\);/);
});
test("AC-082/AC-083/AC-135 · colunas extras atrás de «Mais colunas» (guardado por cliente) e Δ CPA contra o período anterior", () => {
  assert.deepEqual(A.COLS_EXTRA.map(c => c[0]), ["cpag", "cpp", "imp", "cpm", "dcpa"]);
  assert.equal(A.chaveColsExtra("c1"), "nx-app-ads-cols:c1");
  const M = montarDe({ metricas: [...serie(8, 14, { g: 30, conv: 1 }), ...serie(1, 7, { g: 30, conv: 2 })] });
  const r = L.linhasCampanhas(M, { dias: 7 }).linhas[0];
  assert.ok(r.ta, "linha com o período anterior"); assert.equal(Math.round(r.dcpa), -50, "CPA caiu pela metade");
  assert.match(CSS, /@media \(max-width: 760px\) \{ \.ads-tabela \.c-extra \{ display: none; \} \}/);
});
test("AC-084 · total do rodapé recalculado com as linhas visíveis", () => {
  const rows = [{ t: { gasto: 100, conversoes: 2, impressoes: 1000, cliques: 10 }, k: { agendadas: 1, fecharam: 1, receita: 300 } }, { t: { gasto: 50, conversoes: 3, impressoes: 500, cliques: 5 }, k: { agendadas: 2, fecharam: 0, receita: 0 } }];
  const tt = A.totaisCampanhas(rows);
  assert.deepEqual([tt.t.gasto, tt.t.conversoes, tt.t.cpa, tt.ag, tt.fe, tt.rec, tt.n], [150, 5, 30, 3, 1, 300, 2]);
  assert.equal(A.totaisCampanhas(rows.slice(1)).t.gasto, 50);
  assert.match(ADS, /Total filtrado/);
});
test("AC-086/AC-134 · comparação com CTR, CPM e custo por agendamento; o vencedor de cada linha marcado; «até 3»", () => {
  assert.equal(A.melhorDaLinha([30, 20, 25], "baixo"), 1); assert.equal(A.melhorDaLinha([1, 4], "cima"), 1);
  assert.equal(A.melhorDaLinha([5, 5], "baixo"), -1, "empate: ninguém"); assert.equal(A.melhorDaLinha([5], "cima"), -1);
  assert.match(ADS, /ads-comp-melhor/); assert.match(ADS, /em até 3 campanhas da tabela/);
});
test("AC-112 · CPA/CTR/CPM com <abbr> e glossário", () => {
  assert.match(A.GLOSSARIO.CTR, /quantas clicaram/);   // plano 2000d: DA-162 — frase do dono no lugar de «cliques ÷ impressões»
  assert.match(ADS, /h\("abbr", \{ title: GLOSSARIO\[m\[1\]\] \}, m\[1\]\)/);
});
test("AC-110 · campanhas vazias: o botão amplia o período ou volta para todas as plataformas", () => {
  assert.match(ADS, /rotulo: "Ver todas as plataformas"/); assert.match(ADS, /rotulo: `Ampliar para \$\{maior\} dias`/);
});
test("AC-106/AC-096 · gaveta da campanha com CTR e o funil próprio (conversas → agendaram → vieram → fecharam)", () => {
  const f = A.funilCampanha({ k: { conversas: 10, agendadas: 5, compareceram: 4, fecharam: 2 } });
  assert.deepEqual(f.map(e => [e.id, e.v, e.taxa]), [["conversas", 10, null], ["agendadas", 5, 50], ["compareceram", 4, 80], ["fecharam", 2, 50]]);
  assert.match(ADS, /class: "ads-cri-funil", "aria-label": "Funil desta campanha no CRM"/);
  assert.match(ADS, /AC-106: o CTR da campanha também aqui/);
});

/* ============================================================ tendência */
const serieT = Array.from({ length: 20 }, (_, k) => ({ i: k, gasto: 10 + k, conversas: k % 3, agendadas: k % 2, fecharam: k % 4 === 0 ? 1 : 0, receita: k * 10 }));
const opcT = (o = {}) => ({ G, serie: serieT, rotuloDia: i => `d${i}`, diaLongo: i => `dia ${i}`, fmtMoeda: v => `R$ ${v}`, fmtMoedaCurto: v => `R$ ${Math.round(v)}`, fmtNum: v => String(v), resumo: "resumo", ...o });
test("AC-088/AC-089 · séries de fechamentos, receita e do período anterior (tracejada), todas começando desligadas", () => {
  const alvo = new No("div");
  const g = A.criarGraficoTendencia(alvo, opcT({ seriesExtras: true, anterior: serieT.map(d => ({ gasto: d.gasto / 2 })) }));
  const ids = alvo.querySelectorAll(".g-leg-b").map(b => b.getAttribute("data-serie"));
  for (const id of ["fecharam", "receita", "anterior"]) assert.ok(ids.includes(id), `legenda com ${id}`);
  assert.equal(alvo.querySelector('.g-leg-b[data-serie="anterior"]').getAttribute("aria-pressed"), "false");
  g.alternar("anterior");
  assert.ok(alvo.querySelector(".g-tracejada"), "a série do período anterior é tracejada");
  g.destruir();
});
test("AC-090/AC-126 · marcos: gravar/trocar/remover, os de campanha e a linha no gráfico", () => {
  const l1 = A.mesclarMarcos([], "2026-10-01", "Troca de criativo");
  assert.deepEqual(l1, [{ d: "2026-10-01", t: "Troca de criativo" }]);
  const l2 = A.mesclarMarcos(l1, "2026-10-03", "Verba +20%", "C9");
  assert.deepEqual(A.mesclarMarcos(l2, "2026-10-01", ""), [{ d: "2026-10-03", t: "Verba +20%", c: "C9" }], "texto vazio remove o do dia");
  const s = [{ i: 5 }, { i: 6 }, { i: 7 }];
  const iso = i => `2026-10-0${i - 4}`;
  assert.deepEqual(A.marcosNaSerie(l2, s, iso).map(m => m.k), [0, 2]);
  assert.deepEqual(A.marcosNaSerie(l2, s, iso, { campanha: "C1" }).map(m => m.t), ["Troca de criativo"], "marco de outra campanha não aparece");
  const alvo = new No("div");
  const g = A.criarGraficoTendencia(alvo, opcT({ marcos: [{ k: 3, t: "Troca" }] }));
  assert.equal(alvo.querySelectorAll(".g-marco").length, 1);
  g.destruir();
  assert.match(ADS, /ctx\.api\.rpc\("nx_cliente_salvar", \{ p_cliente: \{[^\n]*cfg: \{ marcos: /);
});
test("AC-098 · o resumo do gráfico diz o maior e o menor dia e a direção", () => {
  const t = A.extremosTendencia(serieT, i => `d${i}`, v => `R$ ${v}`);
  assert.match(t, /Maior investimento: d19 \(R\$ 29\); menor: d0 \(R\$ 10\); tendência subindo/);
  assert.equal(A.extremosTendencia([{ i: 0, gasto: 1 }]), "");
  const alvo = new No("div"); const g = A.criarGraficoTendencia(alvo, opcT({ resumo: `x.${t}` }));
  assert.match(alvo.querySelector("svg").getAttribute("aria-label"), /Maior investimento/); assert.equal(alvo.querySelector("svg").getAttribute("role"), "img");
  g.destruir();
});
test("AC-108 · o redesenho do resize vai para o próximo quadro (no máximo um por quadro)", () => {
  assert.match(ADS, /ro = new ResizeObserver\(\(\) => \{ if \(quadro\) return; quadro = raf\(/);
});
test("AC-079 · tabela da tendência com a receita do CRM", () => {
  // plano 2000d: NX-021 — as colunas de agendamento/fechamento levam a palavra da vertical (WvT); a receita do CRM continua
  assert.match(ADS, /colunas: \["Dia", "Investimento", "Conversas CRM", `\$\{capT\(WvT\.ag\[1\]\)\} CRM`, `\$\{capT\(WvT\.fe\[1\]\)\} CRM`, "Receita CRM"\]/);
});

/* ============================================================ ranking de criativos */
test("AC-113/AC-114/AC-115 · selo de amostra pequena, custo por agendamento e régua por plataforma", () => {
  const metricas = [...serie(1, 10, { a: "A1", an: "Vídeo", g: 30, conv: 1 }), ...serie(1, 10, { a: "A2", an: "Foto", g: 10, conv: 3 }),
    ...serie(1, 10, { p: "google", c: "G1", cn: "Google", a: "G1", an: "Busca", g: 60, conv: 1 })];
  const leads = [lead({ anuncio_ext: "A1", etapa: "agendou", data_agenda: dia(2) }), lead({ anuncio_ext: "A1", etapa: "agendou", data_agenda: dia(2) })];
  const M = montarDe({ metricas, leads, cliente: { cfg: { cpaAlvo: 10, cpaAlvoGoogle: 60 } } });
  const r = L.rankingCriativos(M, { dias: 30, por: "cpa" });
  assert.equal(r.normalizado, true, "Meta e Google juntos: régua de cada plataforma");
  assert.ok(r.lista.every((x, i, a) => i === 0 || a[i - 1].cpaRel <= x.cpaRel));
  const g = r.lista.find(x => x.k.plat === "google"); assert.equal(Math.round(g.cpaRel * 100) / 100, 1, "Google no alvo dele = 1");
  assert.equal(L.rankingCriativos(M, { dias: 30, por: "cpa", plat: "meta" }).normalizado, false);
  assert.ok(r.lista.every(x => typeof x.amostraPequena === "boolean"));
  assert.equal(r.lista.find(x => x.k.id === "meta:A1").amostraPequena, false);
  const ag = L.rankingCriativos(M, { dias: 30, por: "cpag" });
  assert.equal(ag.por, "cpag"); assert.equal(ag.lista[0].k.id, "meta:A1"); assert.equal(ag.lista[0].cpag, 150);
  assert.deepEqual(L.reguaCustoPlat([], { cpaAlvo: 12 }), { meta: 12, google: null });
  assert.match(ADS, /ads-rank-amostra/);
});
test("AC-293 · busca no ranking por nome (sem acento e sem caixa)", () => {
  const lista = [{ k: { nome: "Vídeo Implante" } }, { k: { nome: "Foto clareamento" } }];
  assert.deepEqual(A.filtrarRanking(lista, "video").map(x => x.k.nome), ["Vídeo Implante"]);
  assert.equal(A.filtrarRanking(lista, "").length, 2);
  assert.match(ADS, /class: "ads-camp-busca-input ads-rank-busca"/);
});
test("AC-093 · miniatura do anúncio (só https) pela chave do criativo", () => {
  const m = A.miniaturasDeMetricas([{ p: "meta", a: "A1", th: "https://cdn.x/a.jpg" }, { p: "meta", a: "A2", th: "http://inseguro/a.jpg" }, { p: "google", a: "G1", thumbnail_url: "https://g/x.png" }]);
  assert.deepEqual([...m.entries()], [["meta:A1", "https://cdn.x/a.jpg"], ["google:G1", "https://g/x.png"]]);
  assert.match(ADS, /h\("img", \{ class: "ads-rank-mini", src: mini, alt: "", width: "48", height: "48"/);
});

/* ============================================================ funil, calor e radar */
test("AC-097 · funil por plataforma com a etapa «compareceram»", () => {
  const M = montarDe({ metricas: serie(1, 10), leads: [lead({ etapa: "compareceu", data_agenda: dia(3), data_consulta: dia(2) })] });
  const fp = L.funilPorPlataforma(M, { dias: 30 });
  assert.deepEqual(fp[0].etapas.map(e => e.id), ["convAds", "conversas", "agendadas", "compareceram", "fecharam"]);
});
test("AC-143 · calor semanal: empate no topo não elege o domingo", () => {
  const M = montarDe({ metricas: serie(1, 7), leads: [lead({ data_conversa: dia(1) }), lead({ data_conversa: dia(2) })] });
  const c = L.calorSemanal(M, { dias: 7 });
  assert.equal(c.melhorDow, null, "antes: o 1º índice empatado (domingo ou o primeiro da lista)");
  assert.equal(c.empate.length, 2);
  const um = L.calorSemanal(montarDe({ metricas: serie(1, 7), leads: [lead({ data_conversa: dia(1) })] }), { dias: 7 });
  assert.equal(um.empate, null); assert.ok(um.melhorDow >= 0);
});
test("AC-145 · explicação da regra desligada diz que está desligada", () => {
  const e = L.explicarRegra("r1", { ativa: false });
  assert.match(e.oQue, /\(desligada: o radar não avisa disso agora\)$/); assert.equal(e.desligada, true);
  assert.doesNotMatch(L.explicarRegra("r1").oQue, /desligada/);
  assert.match(ADS, /L\.explicarRegra\(r\.id, \{ ativa: r\.ativa \}\)/);
});
test("AC-091 · silenciar por 1, 7, 30 dias ou até reativar", () => {
  assert.deepEqual(A.OPCOES_SILENCIO.map(o => o[0]), [1, 7, 30, 0]);
  assert.deepEqual(A.periodoSilencio("2026-10-20", 1), { desde: "2026-10-20", ate: "2026-10-21" });
  assert.deepEqual(A.periodoSilencio("2026-12-28", 7), { desde: "2026-12-28", ate: "2027-01-04" });
  assert.equal(A.periodoSilencio("2026-10-20", 0).ate, "2099-12-31");
  assert.equal(A.periodoSilencio("x", 7), null);
  assert.match(ADS, /ui\.menu\(bt, OPCOES_SILENCIO\.map/);
});

/* ============================================================ período, resumo, apresentação, impressão */
test("AC-117/AC-156 · os atalhos de período terminam ontem; «incluir hoje» é opção", () => {
  const ontem = L.somarDias(HOJE, -1);
  assert.deepEqual(L.periodoPreset(7, HOJE), { de: L.somarDias(ontem, -6), ate: ontem });
  assert.equal(L.periodoPreset(7, HOJE, { incluirHoje: true }).ate, HOJE);
  assert.deepEqual(RL.periodoDoCliente({ periodo: { c1: { preset: 30, hoje: true } } }, "c1"), { preset: 30, de: null, ate: null, hoje: true });
  assert.match(REL, /L\.periodoPreset\(P\.preset === "per" \? 30 : P\.preset, L\.hojeSP\(\), \{ incluirHoje: !!P\.hoje \}\)/);
  assert.match(REL, /"Incluir hoje \(dia ainda aberto\)"/);
});
test("AC-119 · resumo do período pronto para o WhatsApp", () => {
  const M = montarDe({ metricas: serie(1, 30), leads: [lead({ etapa: "fechou", valor: 900, data_agenda: dia(3), data_consulta: dia(2), data_fechou: dia(2) })] });
  const P = L.numerosPeriodo(M, { dias: 30 });
  const t = A.textoResumoPeriodo(P, { cliente: "Clínica", brl0: N.brl0, brl: N.brl, int: N.int, dec: N.dec });
  assert.match(t, /^\*Clínica · Anúncios — Últimos 30 dias\*/); assert.match(t, /Investido: \*R\$/); assert.match(t, /No CRM: 1 conversa/);
  assert.equal(A.textoResumoPeriodo(null), "");
  assert.match(ADS, /copiarTexto\(textoRes\(\), \{ ui, aviso: /);
});
test("AC-094 · «Apresentar»: slides números → funil → criativos → próximos passos, com teclado", () => {
  const P = { t: { gasto: 1000 }, c: { conversas: 10, agendadas: 4, receita: 3000 }, rotulo: { titulo: "Últimos 30 dias" } };
  const s = A.slidesApresentacao({ P, funil: [{ rot: "Conversas", v: 10, taxa: null }], criativos: [{ pos: 1, k: { nome: "V" }, c: { receita: 900, fecharam: 1 } }], proximos: ["Subir verba"] });
  // plano 2000d: DA-355 — o criativo que vendeu ganha o slide «Anúncio campeão» antes do ranking
  assert.deepEqual(s.map(x => x.titulo), ["Últimos 30 dias", "Do anúncio à venda", "Anúncio campeão", "Criativos que mais trouxeram resultado", "Próximos passos"]);
  assert.deepEqual(s[4].linhas, ["Subir verba"]);
  assert.deepEqual(A.slidesApresentacao({}), []);
  assert.match(ADS, /\["ArrowRight", "PageDown", " "\]\.includes\(e\.key\)/); assert.match(ADS, /role: "dialog", "aria-modal": "true"/);
  assert.match(CSS, /\.ads-apr \{ position: fixed; inset: 0;/);
});
test("AC-120 · ritmo do mês por plataforma", () => {
  const m = { cedo: false, pass: 10, diasMes: 30 };
  const r = A.ritmoPlataformas({ meta: 3000, google: 0 }, m, p => (p === "meta" ? 1500 : 0));
  assert.deepEqual(r, [{ plat: "meta", orc: 3000, gasto: 1500, proj: 4500, acima: true, usado: false }]);
  assert.deepEqual(A.ritmoPlataformas(null, m), []);
  assert.match(ADS, /ritmoPlataformas\(M\.CFG\.orcamentoPlat, m,/);
});
test("AC-137 · conta em outra moeda avisa", () => {
  assert.match(A.avisoMoeda([{ canal: "meta", moeda: "usd" }]), /a conta do Meta está em USD/);
  assert.equal(A.avisoMoeda([{ canal: "meta", moeda: "BRL" }, { canal: "google" }]), "");
});
test("AC-111 · erro de leitura diz de quando são os números na tela", () => {
  assert.equal(A.notaUltimaLeituraOk("2026-10-20T17:02:00Z", () => "ontem às 14:02"), "Última leitura boa dos anúncios: ontem às 14:02.");
  assert.equal(A.notaUltimaLeituraOk(null), "");
  assert.match(ADS, /const okEm = notaUltimaLeituraOk\(/);
});
test("AC-140/AC-128/AC-129/AC-092 · cabeçalho da impressão com a hora da leitura, logo https e agência", () => {
  assert.equal(A.cabecalhoImpressaoAds({ cliente: "Clínica", aba: "Visão geral", periodo: "Últimos 30 dias", lidoEm: "hoje às 08:00", geradoEm: "em 21/10", agencia: "Nexus" }),
    "Clínica · Anúncios · Visão geral · Últimos 30 dias · números lidos hoje às 08:00 · gerado em 21/10 · por Nexus");
  assert.equal(A.logoValido("https://x.com/l.png"), "https://x.com/l.png"); assert.equal(A.logoValido("http://x.com/l.png"), ""); assert.equal(A.logoValido("javascript:alert(1)"), "");
  assert.match(CSS, /\.rel-impressao-logo \{ display: inline-block; max-height: 40px;/);
});
test("AC-132 · a pílula do período leva o texto completo no title", () => {
  assert.match(ADS, /pilula\.title = `\$\{pilulaTxt\.textContent\} — toque para ver o detalhe por plataforma`;/);
});
test("AC-141 · trocar de aba leva o foco ao título da seção", () => {
  assert.match(ADS, /if \(focarTituloAba\) \{ focarTituloAba = false; const t = raiz\.querySelector\("#ads-h"\);/);
});
test("AC-104/AC-105 · pílula e «ver mais» do onboarding com 44 px no toque", () => {
  assert.match(CSS, /\.ads-pilula, \.ini-onb-mais summary, \.ini-onb-feitos summary \{ min-height: 44px; \}/);
});

/* ============================================================ Ajustes de anúncios (ads-config.js) */
test("AC-146 · abrir e salvar sem mexer mantém a assinatura indefinida (a padrão continua); vazio de propósito = «Sem assinatura»", () => {
  assert.equal(AC.ASSINATURA_PADRAO, N.CFG_PADRAO.assinatura, "a mesma do núcleo");
  const ini = AC.assinaturaInicial({});
  assert.deepEqual(ini, { valor: AC.ASSINATURA_PADRAO, sem: false }, "antes o campo abria vazio");
  assert.equal(AC.assinaturaParaSalvar({ cfg: {}, valor: ini.valor, sem: ini.sem }), undefined, "não vai no pacote: cfg.assinatura segue indefinida");
  assert.equal(AC.assinaturaParaSalvar({ cfg: {}, valor: "Equipe X", sem: false }), "Equipe X");
  assert.equal(AC.assinaturaParaSalvar({ cfg: {}, valor: "Equipe X", sem: true }), "", "sem assinatura = vazio (sem linha, AB-021)");
  assert.deepEqual(AC.assinaturaInicial({ assinatura: "" }), { valor: AC.ASSINATURA_PADRAO, sem: true });
  assert.equal(AC.assinaturaParaSalvar({ cfg: { assinatura: "" }, valor: AC.ASSINATURA_PADRAO, sem: true }), "");
  assert.equal(AC.assinaturaParaSalvar({ cfg: { assinatura: "Velha" }, valor: AC.ASSINATURA_PADRAO, sem: false }), AC.ASSINATURA_PADRAO);
  assert.match(ADSCFG, /if \(assin !== undefined\) novo\.assinatura = assin;/);
  assert.doesNotMatch(ADSCFG, /assinatura: v\.assinatura \|\| ""/);
});
test("AC-147 · as opções de serviço do código de exemplo saem dos serviços do cliente", () => {
  const c = AC.codigoExemplo({ url: "u", apikey: "k", chave: "c", servicos: ["Implante", "Lente <b>"] });
  assert.match(c, /<option>Implante<\/option>\n {6}<option>Lente &lt;b&gt;<\/option>\n {6}<option>Outro<\/option>/);
  assert.doesNotMatch(c, /Avaliação/);
  assert.match(AC.codigoExemplo({ url: "u", apikey: "k", chave: "c" }), /<option>Avaliação<\/option>/, "sem serviços: como antes");
});
test("AC-148/AC-128/AC-129/AC-120 · campos de remarketing, link do painel, logo, agência e orçamento por plataforma", () => {
  assert.deepEqual(AC.urlHttpsOuVazio(""), { ok: true, valor: "" });
  assert.equal(AC.urlHttpsOuVazio("https://painel.x.com/a").ok, true); assert.equal(AC.urlHttpsOuVazio("http://x.com").ok, false); assert.equal(AC.urlHttpsOuVazio("x").ok, false);
  assert.deepEqual(AC.remarketingSalvo(["c1"], ["c9", "c2"], ["c1", "c2"]), ["c1", "c9"], "desmarcada sai; a salva que não está na semana fica");
  assert.deepEqual(AC.lerOrcPlat({ meta: "1.500,00", google: "" }), { orcamentoPlat: { meta: 1500, google: null } });
  assert.deepEqual(AC.lerOrcPlat({}), { orcamentoPlat: null });
  assert.equal(AC.lerOrcPlat({ meta: "-3" }).erro.campo, "orcMeta");
  for (const n of ["orcMeta", "orcGoogle", "logoUrl", "agenciaNome", "painelUrl"]) assert.match(ADSCFG, new RegExp(`nome: "${n}"`));
  assert.match(ADSCFG, /novo\.remarketing = remarketingSalvo\(/);
});
test("AC-149 · metas que não fecham com o orçamento param o salvamento", () => {
  assert.equal(AC.validarAjustes({ cpa: 5000, orc: 3000 }).campo, "cpaAlvo");
  assert.equal(AC.validarAjustes({ cpaG: 4000, orc: 3000 }).campo, "cpaAlvoGoogle");
  assert.equal(AC.validarAjustes({ orc: 3000, orcPlat: { meta: 2000, google: 1500 } }).campo, "orcMeta");
  assert.equal(AC.validarAjustes({ cpa: 20, orc: 3000, orcPlat: { meta: 2000, google: 1000 } }), null);
  assert.equal(AC.validarAjustes({ cpa: 5000 }), null, "sem orçamento: nada a comparar");
});
test("AC-150 · prévia dos limites do radar com os dados da semana", () => {
  const metricas = Array.from({ length: 7 }, (_, k) => met(dia(k + 1), { freq: 3.5 }));
  const montarCom = radar => N.montar(N.datasetDeLinhas({ metricas, leads: [], hoje: HOJE, dias: 7, cliente: { nome: "X", cfg: { radar } } }));
  const padrao = AC.previaLimitesRadar(montarCom, {}, 7);
  const solto = AC.previaLimitesRadar(montarCom, { freqMax: 4 }, 7);
  assert.ok(padrao.n > solto.n, `frequência 3,5: avisa com o padrão (3) e não com 4 (${padrao.n} × ${solto.n})`);
  assert.match(padrao.texto, /^Com esses limites, o radar daria \d+ avisos? /);
  assert.equal(AC.previaLimitesRadar(() => { throw new Error("x"); }), null);
});
test("AC-152 · «Descartar alterações» só com mudança pendente e volta ao salvo", () => {
  assert.match(ADSCFG, /"Descartar alterações"/);
  assert.match(ADSCFG, /form\.addEventListener\("input", \(\) => \{ sujo = true; btDescartar\.hidden = false; \}\);/);
  assert.match(ADSCFG, /secaoAnuncios\(ctx, alvo\);\n {2}\}\);/);
});
test("AC-153 · erro na linha de serviço: aria-invalid + aria-describedby para a mensagem", () => {
  const i = new No("input");
  AC.marcarInvalido(i, "cfga-tk-erro");
  assert.equal(i.getAttribute("aria-invalid"), "true"); assert.equal(i.getAttribute("aria-describedby"), "cfga-tk-erro");
  AC.marcarInvalido(i, null, false);
  assert.equal(i.getAttribute("aria-invalid"), null); assert.equal(i.getAttribute("aria-describedby"), null);
  assert.match(ADSCFG, /h\("p", \{ id: "cfga-tk-erro", class: "campo-erro", role: "alert" \}\)/);
});

/* ============================================================ Relatórios (relatorios.js) */
test("AC-155 · a legenda diz a janela que o servidor comparou (r.anterior)", () => {
  const t = RL.textoLegenda({ de: "2026-09-01", ate: "2026-09-30", anterior: { de: "2026-08-01", ate: "2026-08-31" }, dataBR: L.dataIsoBR });
  assert.equal(t, "01/09/2026 a 30/09/2026 · comparado com 01/08/2026 a 31/08/2026 (31 dias)");
  assert.match(RL.textoLegenda({ de: "2026-09-01", ate: "2026-09-30", dataBR: L.dataIsoBR }), /comparado com 02\/08\/2026 a 31\/08\/2026 \(30 dias\)$/, "sem r.anterior: a de mesmo tamanho");
  assert.deepEqual(RL.mesAnteriorDe("2026-10-01", "2026-10-31"), { de: "2026-09-01", ate: "2026-09-30" });
  assert.deepEqual(RL.mesAnteriorDe("2026-03-01", "2026-03-31"), { de: "2026-02-01", ate: "2026-02-28" });
  assert.equal(RL.mesAnteriorDe("2026-10-02", "2026-10-31"), null);
  assert.match(REL, /if \(r && r\.anterior\) \{ const t = textoLeg\(r\.anterior\);/);
});
test("AC-158 · resumo do gráfico com milhar", () => {
  // plano 2000d: NX-304 — a soma vai para somaC e a palavra concorda pelo vocabulário (flexao)
  assert.ok(REL.includes("somaC = serie.reduce((s, d) => s + (+d.criados || 0), 0)"));
  assert.ok(REL.includes("${int(somaC)} ${flexao(\"criado\", somaC, fem)}"));
  assert.match(REL, /\$\{int\(serie\.reduce\(\(s, d\) => s \+ \(\+d\.novas \|\| 0\), 0\)\)\} novas/);
});
test("AC-159 · por responsável: ordem por fechamentos e a conversão", () => {
  const l = RL.linhasDono([{ nome: "Ana", criados: 10, ganhos: 2, receita: 9000 }, { nome: "Bia", criados: 8, ganhos: 4, receita: 3000 }, { nome: "Caio", criados: 0, ganhos: 0, receita: 0 }]);
  assert.deepEqual(l.map(d => [d.nome, d.conversao_pct]), [["Bia", 50], ["Ana", 20], ["Caio", null]]);
});
test("AC-160 · parados com valor (quando o servidor manda) e a soma", () => {
  assert.deepEqual(RL.resumoParados([{ qtd: 2, valor: 100 }, { qtd: 1, valor: null }]), { temValor: true, qtd: 3, valor: 100, diasMax: null });   // plano 2000d: DA-245 — diasMax (null sem o campo)
  assert.deepEqual(RL.resumoParados([{ qtd: 2 }]), { temValor: false, qtd: 2, valor: null, diasMax: null });   // plano 2000d: DA-245
});
test("AC-161/AC-191 · 1ª resposta no CSV com 1 casa e em horas", () => {
  assert.equal(RL.minCsv(4.23333), 4.2); assert.equal(RL.minCsv(null), "");
  assert.equal(RL.horasCsv(4320), 72); assert.equal(RL.horasCsv(90), 1.5);
  assert.match(REL, /"1ª resposta \(min\)", "1ª resposta \(h\)", "Mensagens enviadas"/);
});
test("AC-167 · sem dados nos 7/30 dias, o vazio oferece o período maior", () => {
  assert.equal(RL.periodoMaior(7), 30); assert.equal(RL.periodoMaior(30), 90); assert.equal(RL.periodoMaior(90), null); assert.equal(RL.periodoMaior("per"), null);
  assert.match(REL, /rotulo: `Ver \$\{maior\} dias`/);
});
test("AC-171 · a mesma resposta vale 60 s (Vendas ↔ Atendimento não refaz o pedido)", () => {
  const memo = new Map([["k", { t: 1000, r: { ok: 1 } }]]);
  assert.deepEqual(RL.memoFresco(memo, "k", 1000 + 59000), { ok: 1 });
  assert.equal(RL.memoFresco(memo, "k", 1000 + RL.MEMO_MS + 1000), null); assert.equal(RL.memoFresco(memo, "x", 1000), null);   // plano 2000d: DA-239 — a validade passou a 5 min
  assert.match(REL, /const fresco = doBotao \? null : memoFresco\(memo, chaveMemo\);/);
});
test("AC-172 · no celular a hora da carga desce (antes sumia)", () => {
  assert.match(CSS, /@media \(max-width: 760px\) \{ \.rel-topo-acoes \.relat-hora \{ display: block;/);
});
test("AC-179 · de zero para algo o chip diz «novo»", () => {
  const c = L.chipVar(5, 0);
  assert.equal(c.txt, "novo"); assert.equal(c.novo, true);
});
test("AC-181 · «Copiar resumo» de vendas", () => {
  const t = RL.textoResumoVendas({ kpis: { criados: 40, ganhos: 1, receita: 1500, conversao_pct: 50, ticket_medio: 1500, abertos: 3, valor_aberto: 900, perdidos: 1, valor_perdido: 200 } },
    { de: "2026-09-01", ate: "2026-09-30", cliente: "Clínica", negocios: "orçamentos", dataBR: L.dataIsoBR });
  assert.equal(t.split("\n")[0], "*Vendas · Clínica* — 01/09/2026 a 30/09/2026");
  assert.match(t, /• 40 orçamentos novos/); assert.match(t, /• 1 fechado · R\$ 1500 de receita/); assert.match(t, /Perdidos: 1/);
  assert.match(REL, /X\.copiarTexto\(texto, \{ ui, aviso: "Resumo copiado\. Cole no WhatsApp\." \}\)/);
});
test("AC-190 · o leitor de tela ouve «queda/alta» e se melhorou", () => {
  assert.equal(RL.textoSrVar(L.chipVar(8, 10, "cima")), "queda de 20% em relação ao período anterior, piorou");
  assert.equal(RL.textoSrVar(L.chipVar(8, 10, "baixo")), "queda de 20% em relação ao período anterior, melhorou");
  assert.equal(RL.textoSrVar(L.chipVar(5, 0)), "novo: antes era zero");
  assert.match(REL, /h\("span", \{ class: "sr-only" \}, textoSrVar\(c\)\)/);
});
test("AC-193 · impressão não quebra linha de tabela e repete o cabeçalho", () => {
  assert.match(CSS, /\.rel-tabela thead \{ display: table-header-group; \}/);
  assert.match(CSS, /\.rel-tabela tr, \.relat-parados li, \.ads-rank-item \{ break-inside: avoid;/);
});
test("AC-295/AC-296/AC-299 · rosca pelo teclado, calor nos 360 px e movimento reduzido fora de .rel", () => {
  assert.match(CSS, /\.g-rosca:focus-within \.g-fatia:not\(:focus\) \{ opacity: \.55; \}/);
  assert.match(CSS, /@media \(max-width: 420px\) \{\n {2}\.g-calor \{ min-width: 0;/);
  assert.match(CSS, /\.ini-tf-marca, \.ads-apr, \.ads-apr \* \{ transition: none !important;/);
});

/* ============================================================ Rastreio — painel (rastreio-config.js) */
test("AC-205 · uma tabela de versões: o snippet usa a mais nova PUBLICADA (v2 hoje; v3 criada, ainda não publicada)", () => {
  assert.deepEqual(RC.VERSOES.map(v => [v.n, v.publicada]), [[1, true], [2, true], [3, false]]);
  assert.equal(RC.versaoPublicada().n, 2);
  assert.equal(RC.versaoPublicada([...RC.VERSOES.slice(0, 2), { ...RC.VERSOES[2], publicada: true }]).n, 3, "virar a chave da v3 troca o snippet");
  assert.equal(RC.versaoPublicada([{ n: 9, url: "x", sri: "sem-hash", publicada: true }]), null, "sem hash válido não vale");
  assert.match(RC.snippetRastreio("a".repeat(48)), /rastreio\.v2\.js" integrity="sha384-/);
  assert.equal(RC.SRI_V3, `sha384-${createHash("sha384").update(Buffer.from(V3, "utf8")).digest("base64")}`, "o hash da v3 confere com o arquivo");
  assert.doesNotMatch(RCFG, /ainda não publicada\)/);
});
test("AC-207 · motivo desconhecido não aparece cru", () => {
  assert.equal(RC.rotuloMotivo("erro_xyz_123"), RC.MOTIVO_OUTRO);
  assert.equal(RC.rotuloMotivo("codigo_expirado"), "o código venceu antes de a conversa chegar");
  assert.equal(RC.rotuloMotivo("aplicado", true), "casou com o negócio");
});
test("AC-212 · cliques por página do site", () => {
  const em = new Date().toISOString();
  const R = RC.resumoRastreio({ itens: [{ em, pagina: "https://s.com/implante/", casou: true }, { em, pagina: "https://s.com/implante" }, { em, pagina: "https://s.com/" }, { em, pagina: "https://s.com/x", evento: "aquecimento" }] });
  assert.deepEqual(R.paginas.map(p => [p.caminho, p.cliques, p.casados]), [["/implante", 2, 1], ["/", 1, 0]]);
  assert.equal(RC.caminhoDe("nada"), null);
  assert.match(RCFG, /"Páginas que mandaram cliques"/);
});
test("AC-196 (painel) · o texto de privacidade cita o tipo de origem só quando a v3 é a do snippet", () => {
  assert.doesNotMatch(RC.textoPrivacidade(), /tipo de origem/);
  assert.match(RC.textoPrivacidade({ versao: 3 }), /só o tipo de origem/);
});

/* ============================================================ Rastreio — script do site (rastreio.v3.js) */
const CHAVE_SITE = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";
const WA = "https://wa.me/5512999990000?text=Ol%C3%A1";
function el(tag, attrs = {}, pai = null) {
  const a = { ...attrs };
  return { nodeType: 1, tagName: tag.toUpperCase(), parentNode: pai, getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); }, _a: a };
}
function montarV3({ search = "", referrer = "", guardado = null, guardadoV1 = null, resposta = null, inputs = [], ready = "complete" } = {}) {
  const ouvintes = {}, loja = new Map(), chamadas = [], navegacao = [];
  if (guardado) loja.set("orbita:rastreio:v3", JSON.stringify(guardado));
  if (guardadoV1) loja.set("orbita:rastreio:v1", JSON.stringify(guardadoV1));
  const script = el("script", { "data-chave": CHAVE_SITE });
  const janela = {
    document: { currentScript: script, referrer, readyState: ready, addEventListener: (t, f) => { (ouvintes[t] ||= []).push(f); },
      querySelectorAll: sel => { const m = /name="([^"]+)"/.exec(sel); return inputs.filter(i => m && i.name === m[1]); } },
    addEventListener() {},
    localStorage: { getItem: k => (loja.has(k) ? loja.get(k) : null), setItem: (k, v) => loja.set(k, String(v)), removeItem: k => loja.delete(k) },
    location: { search, hostname: "site.com", origin: "https://site.com", pathname: "/implante", href: "https://site.com/implante" + search, assign: u => navegacao.push(u) },
    navigator: {}, history: { pushState() {}, replaceState() {} },
    fetch: (url, init) => { chamadas.push({ url, corpo: JSON.parse(init.body) }); return Promise.resolve({ ok: true, status: 200, json: async () => (resposta ? resposta(chamadas.length) : { ok: true, codigo: "K7Q2P" }) }); },
    AbortController, Promise, setTimeout, clearTimeout, JSON, Date, encodeURIComponent, decodeURIComponent, String, Object, Number, Array, RegExp,
    console: { warn() {}, info() {} },
  };
  janela.window = janela;
  vm.runInContext(V3, vm.createContext(janela), { filename: "rastreio.v3.js" });
  const disparar = (tipo, alvo, extra = {}) => { const ev = { target: alvo, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; for (const f of ouvintes[tipo] || []) f(ev); return ev; };
  return { janela, ouvintes, disparar, chamadas, navegacao, loja, guardadoAgora: () => JSON.parse(loja.get("orbita:rastreio:v3") || "null"), api: janela.OrbitaRastreio };
}
const inp = (name, type = "hidden", value = "") => ({ name, type, value, getAttribute: k => (k === "type" ? type : null) });

test("AC-195/AC-201 · v3: cabeçalho certo, versão 3, armazenamento próprio e migração da v1/v2 sem perder a campanha", async () => {
  assert.match(V3.split("\n")[1], /rastreio\.v3\.js/); assert.doesNotMatch(V3.slice(0, 400), /nexus-ads\/rastreio\.js"/);
  const m = montarV3({ guardadoV1: { v: 1, t: Date.now() - 1000, d: { utm_source: "meta", utm_campaign: "123" }, c: null } });
  assert.equal(m.api.versao, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(m.api.dados())), { utm_source: "meta", utm_campaign: "123" }, "a origem da v2 vem junto");
  assert.equal(m.guardadoAgora().v, 3); assert.ok(m.loja.has("orbita:rastreio:v1"), "a chave antiga fica (voltar para a v2 não perde)");
  m.api.revogar(); assert.ok(!m.loja.has("orbita:rastreio:v1") && !m.loja.has("orbita:rastreio:v3"), "revogar apaga as duas");
  assert.match(V2, /var CHAVE_LS = "orbita:rastreio:v1";/, "v2 intocada");
});
test("AC-196 · visita sem campanha guarda só o tipo de origem e o clique o envia", async () => {
  const cr0 = montarV3().api.classificarReferencia, cr = (a, b) => JSON.parse(JSON.stringify(cr0(a, b)));   // objeto de outro contexto (vm)
  assert.deepEqual(cr("https://www.google.com.br/search?q=x", "site.com"), { src: "google", tipo: "busca" });
  assert.deepEqual(cr("https://l.instagram.com/?u=x", "site.com"), { src: "instagram", tipo: "social" });
  assert.deepEqual(cr("https://t.co/abc", "site.com"), { src: "x", tipo: "social" });
  assert.deepEqual(cr("https://x.minhaloja.com.br/p", "site.com"), { src: "x.minhaloja.com.br", tipo: "site" });
  assert.deepEqual(cr("", "site.com"), { src: "direto", tipo: "direto" });
  assert.equal(cr("https://www.site.com/outra", "site.com"), null, "navegação interna não conta");
  const m = montarV3({ referrer: "https://www.google.com/" });
  assert.deepEqual(m.guardadoAgora().r, { src: "google", tipo: "busca" });
  assert.equal(JSON.stringify(m.guardadoAgora()).includes("google.com/"), false, "nunca o endereço completo");
  m.disparar("click", el("a", { href: WA }));
  await esperar(10);
  assert.equal(m.chamadas[0].corpo.p_dados.referencia, "google"); assert.equal(m.chamadas[0].corpo.p_dados.referencia_tipo, "busca");
  const c = montarV3({ search: "?utm_source=meta&utm_campaign=9", referrer: "https://www.google.com/" });
  assert.equal(c.guardadoAgora().r, null, "com campanha, a referência não entra");
});
test("AC-197 · campos escondidos do formulário recebem a origem (o visível não é tocado)", () => {
  const inputs = [inp("utm_source"), inp("utm_campaign"), inp("utm_source", "text"), inp("gclid", "hidden", "ja")];
  montarV3({ search: "?utm_source=google&utm_campaign=55&gclid=Z", inputs });
  assert.deepEqual(inputs.map(i => i.value), ["google", "55", "", "ja"]);
  const org = [inp("orbita_origem")];
  montarV3({ referrer: "https://www.instagram.com/", inputs: org });
  assert.equal(org[0].value, "instagram (social)");
});
test("AC-198 · tel:, ig.me e m.me viram «contato» só com servidor que entende eventos; o link nunca é segurado", async () => {
  const cc = montarV3().api.canalContato;
  assert.equal(cc("tel:+5512999990000"), "telefone"); assert.equal(cc("https://ig.me/m/clinica"), "instagram"); assert.equal(cc("https://m.me/clinica"), "messenger"); assert.equal(cc(WA), null);
  const antigo = montarV3({ search: "?utm_source=meta&utm_campaign=1" });
  await esperar(10);
  const n0 = antigo.chamadas.length;
  const ev0 = antigo.disparar("click", el("a", { href: "tel:+5512999990000" }));
  await esperar(5);
  assert.equal(antigo.chamadas.length, n0, "servidor sem {eventos: true}: nada (contaria como clique)"); assert.equal(ev0.defaultPrevented, false);
  const novo = montarV3({ search: "?utm_source=meta&utm_campaign=1", resposta: () => ({ ok: true, codigo: "K7Q2P", eventos: true }) });
  await esperar(10);
  const ev = novo.disparar("click", el("a", { href: "https://ig.me/m/clinica" }));
  await esperar(5);
  const ult = novo.chamadas[novo.chamadas.length - 1].corpo.p_dados;
  assert.equal(ult.evento, "contato"); assert.equal(ult.canal, "instagram"); assert.equal(ult.utm_campaign, "1");
  assert.equal(ev.defaultPrevented, false, "o link segue sozinho");
});
test("AC-199 · passar o mouse não cria código; o toque/pointerdown/foco aquecem", async () => {
  const m = montarV3();
  assert.equal((m.ouvintes.pointerover || []).length, 0, "antes: pointerover registrado (v2)");
  m.disparar("focusin", el("a", { href: WA }));
  await esperar(10);
  assert.equal(m.chamadas.length, 1); assert.equal(m.chamadas[0].corpo.p_dados.evento, "aquecimento");
  assert.match(V2, /doc\.addEventListener\("pointerover", aoInteragir, true\);/, "a v2 congelada continua como estava");
});
test("AC-200 · páginas de links e mais encurtadores reconhecidos", () => {
  const api = montarV3().api;
  for (const u of ["https://linktr.ee/clinica", "https://beacons.ai/x", "https://bitly.com/x", "https://bit.do/x", "https://lnk.bio/x"]) assert.equal(api.ehEncurtador(u), true, u);
  assert.equal(api.ehEncurtador(WA), false);
});
