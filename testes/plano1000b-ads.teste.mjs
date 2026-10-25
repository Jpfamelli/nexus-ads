/* ============================================================
   ÓRBITA — plano «1000+ melhorias, rodada B» (14/10/2026), frente ads · lote ads-1 (e os próximos lotes ads)
   node --test testes/plano1000b-ads.teste.mjs      (Node puro, sem rede e sem navegador)
   Peças puras de anuncios.js / ads-config.js / relatorios.js / rel-logica.js / rastreio-config.js; as peças de tela rodam num DOM
   mínimo; o script do site (web/rastreio.v2.js) roda num contexto vm com janela falsa. Itens que dependem da tela inteira (montar()
   do Anúncios/Relatórios) são conferidos pela fonte, como nos planos anteriores. Cada teste falharia no código anterior ao lote.
   Datas das fixtures relativas ao relógio (hojeSP), nada preso à hora em que a suíte roda.
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

/* ---------- DOM mínimo (o mesmo do plano 50: createElement/NS, classList, atributos, eventos, querySelector simples) ---------- */
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
function h(tag, attrs = {}, ...filhos) {
  const el = new No(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.attrs.class = Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "on") for (const [t, fn] of Object.entries(v)) el.addEventListener(t, fn);
    else if (k === "style") { if (typeof v === "string") for (const par of v.split(";")) { const i = par.indexOf(":"); if (i > 0) el.style.setProperty(par.slice(0, i).trim(), par.slice(i + 1).trim()); } else for (const [p, q] of Object.entries(v)) el.style.setProperty(p, q); }
    else if (k === "hidden") el.hidden = !!v;
    else if (k === "value") el.value = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  el.append(...filhos);
  return el;
}

const N = await import("../web/nucleo.js");
const L = await import("../web/app/rel-logica.js");
const G = await import("../web/app/graficos.js");
const A = await import("../web/app/anuncios.js");
const RL = await import("../web/app/relatorios.js");
const AC = await import("../web/app/ads-config.js");
const RC = await import("../web/app/rastreio-config.js");

const ADS = ler("web/app/anuncios.js"), REL = ler("web/app/relatorios.js"), CSS = ler("web/app/relatorios.css"), ADSCFG = ler("web/app/ads-config.js");
const RCFG = ler("web/app/rastreio-config.js"), V2 = ler("web/rastreio.v2.js"), V1 = ler("web/rastreio.v1.js"), RLOG = ler("web/app/rel-logica.js");

/* ---------- fixtures (relativas a hoje em SP) ---------- */
const HOJE = N.hojeSP();
const dia = n => { const d = N.meioDia(HOJE); d.setDate(d.getDate() - n); return N.isoDe(d); };
const met = (d, o = {}) => ({ p: "meta", d, n: "anuncio", c: "C1", cn: "Campanha Meta", a: "A1", an: "Vídeo", g: 30, imp: 1000, alc: 800, cli: 20, conv: 2, freq: 1.2, ...o });
const montarDe = ({ metricas = [], leads = [], cliente = {} } = {}) =>
  N.montar(N.datasetDeLinhas({ metricas, leads, hoje: HOJE, dias: 130, cliente: { nome: "Clínica Teste", cfg: {}, ...cliente } }));
const esperar = ms => new Promise(r => setTimeout(r, ms));

/* ============================================================ Visão geral */
test("AB-001/AB-227 · nota do balde só com as partes não zeradas e plural certo (nunca «Inclui 0 conversas»)", () => {
  assert.equal(A.textoBalde({ conversas: 0, agendadas: 2, fecharam: 0 }, N.int),
    "Inclui 2 agendamentos de anúncio sem campanha identificada (a métrica ainda não chegou ou o negócio foi marcado como anúncio à mão).");
  assert.match(A.textoBalde({ conversas: 0, agendadas: 2, fecharam: 1 }, N.int), /^Inclui 2 agendamentos e 1 fechamento de anúncio/);
  assert.match(A.textoBalde({ conversas: 1, agendadas: 1, fecharam: 2, utms: ["a", "b", "c", "d"] }, N.int), /^Inclui 1 conversa, 1 agendamento e 2 fechamentos .* — campanha no link: «a», «b», «c» e mais 1\.$/);
  assert.equal(A.textoBalde({ conversas: 0, agendadas: 0, fecharam: 0 }), "");
  assert.doesNotMatch(A.textoBalde({ conversas: 0, agendadas: 3 }, N.int), /0 conversas/);
  assert.match(ADS, /const txtBalde = textoBalde\(balde, N\.int\);/);
});

test("AB-192 · frase do herói sem jargão", () => {
  assert.match(ADS, /"Dos anúncios chegaram ao CRM ", num\(c\.conversas, N\.int\)/);
  assert.ok(!ADS.includes('h("p", { class: "ads-frase" }, "No CRM, com origem'), "antes: «No CRM, com origem atribuída a anúncios, registramos…»");
});

test("AB-034 · numerosPeriodo calculado uma vez por desenho e passado para as abas", () => {
  assert.match(ADS, /const Pdes = \(aba === "" \|\| aba === "campanhas"\) && !L\.semAnuncios\(M\) \? L\.numerosPeriodo\(M/);
  // ads-2: AB-262 põe a faixa do crítico antes da Visão geral e AB-180 passa a descrição do período (com fuso) junto
  assert.match(ADS, /return abaCampanhas\(M, Pdes\);\n[\s\S]{0,600}return abaGeral\(M, Pdes, descP\);/);
  assert.match(ADS, /function abaGeral\(M, P0 = null(, desc0 = null)?\) \{\n\s+const P = P0 \|\| L\.numerosPeriodo/);   // ads-2: AB-180 recebe a descrição pronta
});

test("AB-040/AB-042 · conversões fracionadas do Google: resumo do gráfico diário e 1ª etapa do funil por plataforma", () => {
  assert.match(ADS, /\$\{fmtConv\(tot\.conv\)\} conversões da plataforma no período/);
  const dados = [{ plat: "google", nome: "Google", gasto: 50, receita: 0, max: 3, etapas: [{ id: "convAds", rotulo: "Conversões do anúncio", v: 1.5 }, { id: "conversas", rotulo: "Conversas no CRM", v: 3 }], taxas: [{ de: "convAds", para: "conversas", pct: 200 }] }];
  const el = A.criarFunilPlataformas({ h, dados, fmtInt: N.int, fmtConv: v => (Number.isInteger(v) ? N.int(v) : N.dec(v, 1)), fmtMoeda: N.brl0 });
  assert.match(el.textContent, /1,5 Conversões do anúncio/, "antes: 2 (N.int arredondava)");
  assert.match(el.textContent, /3 Conversas no CRM/);
  assert.match(ADS, /criarFunilPlataformas\(\{ h, dados: fp, fmtInt: N\.int, fmtConv,/);
});

test("AB-220 · o medidor do CPA (aria-hidden) não leva title morto", () => {
  assert.match(ADS, /"aria-hidden": "true" \}, h\("i"\), h\("b"\)\);/);
  assert.doesNotMatch(ADS, /h\("b", \{ title: "meta" \}\)/);
});

test("AB-246 · rosca Meta × Google ganha a fatia «Outras» quando há gasto de outra plataforma", () => {
  assert.deepEqual(A.fatiaOutras(130, 100, N.brl0), { rotulo: "Outras", valor: 30, extra: `${N.brl0(30)} em outras plataformas` });
  assert.equal(A.fatiaOutras(100, 100), null); assert.equal(A.fatiaOutras(100.004, 100), null, "resto de arredondamento não vira fatia");
  assert.match(ADS, /const fOutras = fatiaOutras\(M\.consolidar\(M\.linhasDe\(de, ate\)\)\.gasto/);
});

test("AB-189 · calor por hora só é desenhado quando o modo hora aparece", () => {
  assert.match(ADS, /const garantirHora = \(\) => \{ if \(modo !== "hora" \|\| desenhouHora\) return;/);
  assert.match(ADS, /const pintarModo = \(\) => \{ garantirHora\(\);/);
  assert.doesNotMatch(ADS, /alvo\.append\(caixaFx, caixaHora\);\n\s+graficos\.push\(G\.calor\(caixaHora/, "antes: as 168 células nasciam escondidas no celular");
});

test("AB-176 · título da página cita a aba do Anúncios", () => {
  assert.match(ADS, /ctx\.titulo\(ab\.id \? `Anúncios · \$\{ab\.rotulo\}` : "Anúncios"\)/);
  assert.doesNotMatch(ADS, /ctx\.titulo\("Anúncios"\);\n\s+if \(!N\)/);
});

test("AB-072 · período do Anúncios guardado por cliente (a chave global antiga vale como reserva)", () => {
  const loja = new Map([["nx-app-ads-dias", "7"]]);
  const lerL = (k, p) => (loja.has(k) ? loja.get(k) : p);
  assert.equal(A.chaveDias("cli-A"), "nx-app-ads-dias:cli-A");
  assert.equal(A.periodoGuardado(lerL, "cli-B"), 7, "sem período do cliente: o global de antes");
  loja.set(A.chaveDias("cli-A"), "mes_ant");
  assert.equal(A.periodoGuardado(lerL, "cli-A"), "mes_ant");
  assert.equal(A.periodoGuardado(lerL, "cli-B"), 7, "o «Mês passado» do A não vaza para o B");
  assert.match(ADS, /S\.dias = periodoGuardado\(lerLocal, ctx\.cliente\.id\);/);
  // plano 1500c: o vazio de Campanhas (AC-110) também amplia o período — 3 lugares gravam, todos por cliente
  assert.equal((ADS.match(/gravarLocal\(chaveDias\(ctx\.cliente\.id\)/g) || []).length, 3, "barra, folha e «Ampliar» gravam por cliente");
  assert.doesNotMatch(ADS, /gravarLocal\("nx-app-ads-dias"/);
});

test("AB-063 · ao voltar para a aba, a pílula repinta na hora (um ouvinte só de visibilitychange)", () => {
  let n = 0;
  assert.match(ADS, /repintarPilula = \(\) => \{ if \(!document\.hidden && pilula\.isConnected\) pintarPilula\(\); \};/);
  assert.match(ADS, /document\.addEventListener\("visibilitychange", \(\) => \{ if \(!document\.hidden\) aoVoltarParaAba\(\); \}\);/);
  assert.match(ADS, /repintarPilula = null;/, "desmontar solta a repintura");
  assert.doesNotThrow(() => A.aoVoltarParaAba(), "sem montagem, nada acontece");
  assert.equal(n, 0);
});

/* ============================================================ gráficos */
const serieT = Array.from({ length: 30 }, (_, k) => ({ i: k, gasto: 10 + k, conversas: k % 3, agendadas: k % 2 }));
const opcT = () => ({ G, serie: serieT, rotuloDia: i => `d${i}`, diaLongo: i => `dia ${i}`, fmtMoeda: v => `R$ ${v}`, fmtMoedaCurto: v => `R$ ${Math.round(v)}`, fmtNum: v => String(v), resumo: "resumo" });

test("AB-025 · a dica da tendência não é aria-live; o status do leitor só fala quando a mudança vem do teclado", () => {
  const alvo = new No("div");
  const g = A.criarGraficoTendencia(alvo, opcT());
  const caixa = alvo.querySelector(".g-tendencia"), dica = alvo.querySelector(".g-dica"), vivo = alvo.querySelector(".g-td-vivo");
  assert.equal(dica.getAttribute("aria-live"), null, "antes: role=status aria-live=polite na dica que muda a cada pointermove");
  assert.equal(dica.getAttribute("role"), null);
  assert.equal(vivo.getAttribute("aria-live"), "polite");
  g.mostrar(4);                                      // o mesmo caminho do pointermove
  assert.equal(dica.hidden, false); assert.equal(vivo.textContent, "", "mouse: silêncio");
  caixa.emitir("keydown", { key: "ArrowRight" });
  assert.equal(vivo.textContent, dica.textContent); assert.match(vivo.textContent, /^dia 5 —/);
  g.destruir();
});

test("AB-026 · PageDown/PageUp andam 7 dias na tendência", () => {
  const alvo = new No("div");
  const g = A.criarGraficoTendencia(alvo, opcT());
  const caixa = alvo.querySelector(".g-tendencia");
  caixa.emitir("keydown", { key: "PageDown" }); assert.equal(g.atual, 0);
  caixa.emitir("keydown", { key: "PageDown" }); assert.equal(g.atual, 7);
  caixa.emitir("keydown", { key: "PageDown" }); assert.equal(g.atual, 14, "o 15º dia");
  caixa.emitir("keydown", { key: "PageUp" }); assert.equal(g.atual, 7);
  caixa.emitir("keydown", { key: "End" }); caixa.emitir("keydown", { key: "PageDown" }); assert.equal(g.atual, serieT.length - 1, "com limite");
  g.destruir();
});

test("AB-179 · desligar a última série ligada explica na tela e marca o botão como indisponível", () => {
  const alvo = new No("div");
  const g = A.criarGraficoTendencia(alvo, opcT());
  const nota = alvo.querySelector(".g-td-nota");
  assert.equal(nota.hidden, true);
  g.alternar("gasto"); g.alternar("conversas");
  assert.equal(alvo.querySelector('.g-leg-b[data-serie="agendadas"]').getAttribute("aria-disabled"), "true");
  assert.equal(g.alternar("agendadas"), false);
  assert.equal(nota.hidden, false); assert.equal(nota.textContent, "Pelo menos uma série fica visível.");
  g.alternar("gasto");
  assert.equal(nota.hidden, true); assert.equal(alvo.querySelector('.g-leg-b[data-serie="agendadas"]').getAttribute("aria-disabled"), null);
  g.destruir();
});

test("AB-067 · cabeçalho do PNG encurtado com «…» até caber na largura", () => {
  const medir = s => s.length * 8;                    // 8 px por letra
  const longo = "Investimento diário × conversões da plataforma de anúncios";
  assert.equal(A.encurtarParaLargura("Curto", 236, medir), "Curto");
  const e = A.encurtarParaLargura(longo, 236, medir);
  assert.ok(medir(e) <= 236, e); assert.ok(e.endsWith("…")); assert.ok(longo.startsWith(e.slice(0, -1).trimEnd()));
  assert.doesNotMatch(e, / …$/);
  assert.match(ADS, /encurtarParaLargura\(String\(t\)\.slice\(0, 120\), \(W - 24\) \* escala, s => ctx2d\.measureText\(s\)\.width\)/);
});

/* ============================================================ campanhas */
test("AB-058 · o filtro «resultado no CRM» aplica ao trocar (sem «Aplicar filtros»)", () => {
  const linhas = [{ c: { id: "a", nome: "Implante" }, t: {}, k: { conversas: 2 } }, { c: { id: "b", nome: "Clareamento" }, t: {}, k: {} }];
  const filtros = [];
  const painel = A.criarPainelCampanhas({ h, linhas, estado: {}, aoFiltrar: f => filtros.push(f) });
  const sel = painel.elemento.querySelector("select.ads-camp-resultado");
  sel.value = "sem_crm"; sel.emitir("change");
  assert.deepEqual(filtros, [{ busca: "", resultado: "sem_crm" }], "antes: nada mudava até «Aplicar filtros»");
  assert.equal(painel.elemento.querySelector("select.ads-camp-resultado").value, "sem_crm");
});

test("AB-030 · ponto de cor do CPA com o nível em texto (sr-only)", () => {
  assert.deepEqual(Object.keys(A.TEXTO_NIVEL_CPA).sort(), ["aten", "bom", "neutro", "ruim"]);
  for (const nivel of ["bom", "aten", "ruim", "neutro"]) assert.ok(A.TEXTO_NIVEL_CPA[nivel]);
  assert.equal(A.TEXTO_NIVEL_CPA[L.nivelCpa(30, 20, 100)], "custo acima da meta");
  assert.match(ADS, /h\("span", \{ class: "sr-only" \}, `\$\{TEXTO_NIVEL_CPA\[L\.nivelCpa\(r\.t\.cpa, meta, r\.t\.gasto\)\]/);
});

test("AB-214 · ordenar a tabela anuncia a nova ordem", () => {
  assert.equal(A.textoOrdemCampanhas("CPA Ads", "cpa", -1), "Ordenado por CPA, do maior para o menor.");
  assert.equal(A.textoOrdemCampanhas("Investimento Ads", "gasto", 1), "Ordenado por Investimento Ads, do menor para o maior.");
  assert.equal(A.textoOrdemCampanhas("Campanha", "nome", 1), "Ordenado por campanha, de A a Z.");
  assert.match(ADS, /corpo\.append\(cartao, statusOrdem\);/, "o status mora fora do cartão redesenhado");
  assert.match(ADS, /statusOrdem\.textContent = textoOrdemCampanhas\(l, k, S\.ordem\.dir\);/);
});

test("AB-044 · com o filtro Google, o ranking fala de «conversão»", () => {
  assert.equal(L.rankCriPorPlat("google").find(([k]) => k === "cpa")[1], "Menor custo por conversão");
  assert.equal(L.rankCriPorPlat("meta").find(([k]) => k === "cpa")[1], "Menor custo por conversa");
  assert.deepEqual(L.rankCriPorPlat("").map(([k]) => k), L.RANK_CRI.map(([k]) => k));
  assert.deepEqual(L.unidadeConv("google"), { um: "conversão", varios: "conversões" });
  assert.match(ADS, /segmento\("Ordenar o ranking", RANK, R\.por,/);
  assert.match(ADS, /Nenhum criativo com \$\{L\.MIN_CONV_CPA\} \$\{uc\.varios\} ou mais no período\./);
});

test("AB-075 · criativos da campanha exportam CSV", () => {
  const cc = A.csvCriativos([{ k: { nome: "Vídeo 1", plat: "google" }, t: { gasto: 120.456, impressoes: 3000, ctr: 1.234, freq: null, conversoes: 1.5, cpa: 80.3 } }]);
  assert.deepEqual(cc.colunas, ["Criativo", "Plataforma", "Investido", "Impressões", "CTR %", "Frequência", "Conversões", "Custo por conversão"]);
  assert.deepEqual(cc.linhas, [["Vídeo 1", "google", 120.46, 3000, 1.23, "", 1.5, 80.3]]);
  assert.match(ADS, /botaoCsv\(`criativos-\$\{r\.c\.nome\}`, cc\.colunas, \(\) => cc\.linhas/);
});

test("AB-059 · «Exportar campanhas (CSV)» da paleta usa o filtro da tela e diz quantas foram", () => {
  const linhas = [{ c: { id: "a", nome: "Implante dentário" }, t: {}, k: { conversas: 1 } }, { c: { id: "b", nome: "Clareamento" }, t: {}, k: {} }];
  const r = A.campanhasDaTela(linhas, { busca: "implante", resultado: "todos" });
  assert.deepEqual(r.lista.map(x => x.c.id), ["a"]);
  assert.equal(r.aviso, "1 de 2 campanhas exportadas (o filtro da tela vale aqui também).");
  assert.equal(A.campanhasDaTela(linhas).aviso, "2 campanhas exportadas.");
  assert.match(ADS, /const sel = campanhasDaTela\(linhas, \{ busca: S\.buscaCamp, resultado: S\.resultadoCamp \}\);/);
});

/* ============================================================ radar e relatórios do Anúncios */
function radarGoogleSemConversao() {
  const metricas = Array.from({ length: 20 }, (_, k) => met(dia(k + 1), { p: "google", c: "G1", cn: "Pesquisa", a: "GA1", an: "Anúncio", conv: 0, freq: 0 }));
  const M = montarDe({ metricas });
  return { M, R: L.montarRadar(M, { alertas: [], integracoes: [] }, Date.now()) };
}
test("AB-208 · «Google sem acompanhamento» com a janela da regra (não «desde agora»)", () => {
  const { R } = radarGoogleSemConversao();
  const e = R.episodios.find(x => x.regra === "google_sem_conversao");
  assert.ok(e); assert.equal(e.desde, "nos últimos 30 dias");
});

test("AB-173 · semáforo verde cita os informativos ativos listados abaixo", () => {
  const { R } = radarGoogleSemConversao();
  const s = L.semaforoRadar(R);
  assert.equal(s.nivel, "verde");
  assert.equal(s.frase, "Tudo dentro do combinado: nenhuma campanha precisa de ajuste agora (1 aviso informativo abaixo).");
  assert.equal(L.semaforoRadar({ episodios: [] }).frase, "Tudo dentro do combinado: nenhuma campanha precisa de ajuste agora.");
});

test("AB-195 · status do radar coerente com o selo («1 pede ação · 3 informativos»)", () => {
  assert.equal(A.textoAtivosRadar({ ativos: 4, selo: { n: 1, sev: "critico" } }), "1 pede ação · 3 informativos");
  assert.equal(A.textoAtivosRadar({ ativos: 2, selo: { n: 2 } }), "2 pedem ação");
  assert.equal(A.textoAtivosRadar(radarGoogleSemConversao().R), "1 informativo");
  assert.equal(A.textoAtivosRadar({ ativos: 0, selo: { n: 0 } }), "nenhum alerta ativo");
  assert.match(ADS, /const qtd = textoAtivosRadar\(R\);/);
});

test("AB-080 · erro de envio do WhatsApp em português (o original vai no title)", () => {
  const s = L.statusEnvio({ enviado_em: null, erro: "(#131047) Re-engagement message" });
  assert.equal(s.k, "erro");
  assert.equal(s.erro, "fora da janela de 24 h: só um modelo aprovado pela Meta pode abrir a conversa");
  assert.equal(s.erroOriginal, "(#131047) Re-engagement message");
  assert.match(L.erroEnvioPt("(#131026) Message undeliverable"), /^o número não recebeu a mensagem/);
  assert.equal(L.erroEnvioPt("whatsapp não configurado"), "whatsapp não configurado", "sem padrão conhecido: como veio");
  const p = L.statusEnvio({ enviado_em: new Date().toISOString(), destinos: ["5511", "5512"], erro: "5512: (#131026) Message undeliverable" });
  assert.equal(p.k, "parcial"); assert.match(p.erro, /não recebeu/);
  assert.match(ADS, /title: st\.erroOriginal \|\| st\.erro \|\| st\.rotulo \}, antes, st\.rotulo,/);
});

test("AB-048 · o motivo do aviso que não saiu fica visível na lista de avisos enviados", () => {
  assert.match(ADS, /x\.envio && \(x\.envio\.k === "erro" \|\| x\.envio\.k === "parcial"\) && x\.envio\.erro \? h\("p", \{ class: "rel-nota ads-env-motivo" \}, `Motivo: \$\{x\.envio\.erro\}`\)/);
  assert.match(CSS, /\.ads-env-motivo \{/);
});

test("AB-261 · detalhe da pílula diz «0 linhas lidas» quando a leitura veio vazia", () => {
  const agora = Date.now();
  const e0 = { canais: [{ canal: "meta", estado: "ok", sync: agora - 60e3, parcial: null, status: "ok — 0 linhas" }] };
  assert.match(L.detalhePilula(e0, agora)[0].texto, / · 0 linhas lidas$/);
  const e1 = { canais: [{ canal: "meta", estado: "ok", sync: agora - 60e3, parcial: null, status: "ok — 120 linhas" }] };
  assert.doesNotMatch(L.detalhePilula(e1, agora)[0].texto, /linhas lidas/);
});

test("AB-198 · prévia do WhatsApp entende ~tachado~ e ```mono```", () => {
  assert.deepEqual(L.tokensWa("~x~"), [{ t: "s", v: "x" }]);
  assert.deepEqual(L.tokensWa("valor ```R$ 10``` hoje"), [{ t: "txt", v: "valor " }, { t: "code", v: "R$ 10" }, { t: "txt", v: " hoje" }]);
  assert.deepEqual(L.tokensWa("*a* e _b_ e ~c~"), [{ t: "b", v: "a" }, { t: "txt", v: " e " }, { t: "i", v: "b" }, { t: "txt", v: " e " }, { t: "s", v: "c" }]);
  assert.deepEqual(L.tokensWa("de 10~20 reais"), [{ t: "txt", v: "de 10~20 reais" }], "til no meio de palavra fica como está");
  assert.match(ADS, /else if \(tk\.t === "s"\) bolha\.append\(h\("s", \{\}, tk\.v\)\);/);
  assert.match(ADS, /else if \(tk\.t === "code"\) bolha\.append\(h\("code", \{\}, tk\.v\)\);/);
});

test("AB-054 · relatório aberto com aria-current (não aria-pressed)", () => {
  assert.match(ADS, /if \(b\.dataset\.chave === S\.rel\) b\.setAttribute\("aria-current", "true"\); else b\.removeAttribute\("aria-current"\);/);
  assert.doesNotMatch(ADS, /class: "ads-rel-item", "aria-pressed"/);
});

test("AB-051 · «Enviar de novo» só para o gestor, só com erro/parcial e só no relatório que o servidor reenvia", () => {
  const it = (o = {}) => ({ tipo: "diario", ref: "2026-10-13", envio: { k: "erro" }, ...o });
  const op = { gestor: true, ultimoDiario: "2026-10-13", ultimoMes: "2026-09-01" };
  assert.equal(A.podeReenviarRelatorio(it(), op), true);
  assert.equal(A.podeReenviarRelatorio(it(), { ...op, gestor: false }), false, "só gestor");
  assert.equal(A.podeReenviarRelatorio(it({ envio: { k: "entregue" } }), op), false);
  assert.equal(A.podeReenviarRelatorio(it({ envio: { k: "parcial" } }), op), true);
  assert.equal(A.podeReenviarRelatorio(it({ ref: "2026-10-10" }), op), false, "o servidor só reenvia o mais recente");
  assert.equal(A.podeReenviarRelatorio(it({ tipo: "mensal", ref: "2026-09-01" }), op), true);
  assert.equal(A.podeReenviarRelatorio(it({ previa: true }), op), false);
  assert.match(ADS, /const c = C\.confirmacaoEnvio\(\{ tipo: it\.tipo, cfg, sujo: false, gastoDia, dataDia: M\.dataBR\(M\.R\) \}\);/, "a mesma confirmação de Ajustes");
  assert.match(ADS, /p_tarefa: "nx-relatorio", p_corpo: \{ tipo: it\.tipo, cliente: .*forcar: true \}/);
});

/* ============================================================ CSS */
test("AB-069 · na impressão a faixa de conexão caída sai como nota simples", () => {
  const print = CSS.slice(CSS.indexOf("/* impressão limpa"), CSS.indexOf("/* impressão limpa") + 2000);
  assert.doesNotMatch(print, /\.g-leg-b\.g-leg-off, \.rel-faixa \{ display: none/, "antes: a faixa sumia do PDF");
  assert.match(print, /\.rel-faixa:not\(\[hidden\]\) \{ display: block !important; border: 1px solid CanvasText;/);
  assert.match(print, /\.rel-faixa a, \.rel-faixa button, \.rel-faixa \.rel-btn \{ display: none !important; \}/);
});
test("AB-182 · detalhe da pílula preso à largura do topo no celular", () => {
  const cel = CSS.slice(CSS.indexOf("button.ads-pilula { min-height"), CSS.indexOf("button.ads-pilula { min-height") + 800);
  assert.match(cel, /\.ads-pilula-caixa \{ position: static; \}/);
  assert.match(cel, /\.ads-pilula-pop \{ inset-inline: 0; width: auto; max-width: calc\(100vw - 2rem\); \}/);
});
test("AB-185 · cabeçalhos e rótulos das tabelas em 12 px", () => {
  assert.match(CSS, /\.rel-tabela thead th \{ font: 500 \.75rem\/1\.3 var\(--f-mono\);/);
  assert.match(CSS, /\.ads-tabela td\.num::before \{ content: attr\(data-l\); display: block; font: 500 \.75rem/);
  assert.doesNotMatch(CSS, /\.rel-tabela thead th \{ font: 500 \.6875rem/);
});

/* ============================================================ Relatórios */
test("AB-201 · «Este mês» e «Mês passado» em Relatórios", () => {
  assert.deepEqual(RL.periodoMes("2026-10-14", -1), { de: "2026-09-01", ate: "2026-09-30" });
  assert.deepEqual(RL.periodoMes("2026-10-14", 0), { de: "2026-10-01", ate: "2026-10-14" });
  assert.deepEqual(RL.periodoMes("2026-03-31", -1), { de: "2026-02-01", ate: "2026-02-28" });
  assert.deepEqual(RL.periodoMes("2027-01-05", -1), { de: "2026-12-01", ate: "2026-12-31" });
  assert.equal(RL.atalhoMesAtivo({ preset: "per", de: "2026-09-01", ate: "2026-09-30" }, "2026-10-14"), "mesant");
  assert.equal(RL.atalhoMesAtivo({ preset: 30 }, "2026-10-14"), "");
  assert.match(REL, /for \(const \[id, rot, desloc\] of ATALHOS_MES\)/);
});
test("AB-087 · «Até» não oferece data antes de «De»", () => {
  assert.deepEqual(RL.limitesDatas("2026-10-10", "2026-10-12", "2026-10-14"), { deMax: "2026-10-12", ateMin: "2026-10-10", ateMax: "2026-10-14" });
  assert.deepEqual(RL.limitesDatas("", "", "2026-10-14"), { deMax: "2026-10-14", ateMin: "", ateMax: "2026-10-14" });
  assert.match(REL, /deIn\.addEventListener\("change", ajustarLimites\);/);
  assert.match(REL, /function limites2\(\)/, "também na folha");
});
test("AB-085/AB-098 · «Atualizar» do mesmo recorte mantém os números; falha vira aviso", () => {
  assert.equal(RL.manterNaTela("x", "x", true), true);
  assert.equal(RL.manterNaTela("x", "y", true), false, "outro período: esqueleto");
  assert.equal(RL.manterNaTela("x", "x", false), false);
  assert.equal(RL.manterNaTela("", "", true), false);
  assert.match(REL, /if \(manter\) corpo\.classList\.add\("relat-atualizando"\);/);
  assert.match(REL, /if \(corpo\.dataset\.carga === carga && corpo\.childElementCount > 0\) \{[\s\S]{0,200}ui\.toast\(`Não foi possível atualizar agora/);
  assert.match(CSS, /\.relat-atualizando \{ opacity: \.55;/);
});
test("AB-223 · legenda do período só é reescrita quando muda", () => {
  // plano 1500c: a legenda sai de textoLegenda() (AC-155: a janela que o servidor comparou) — a regra de só reescrever quando muda continua
  assert.match(REL, /if \(legenda\.textContent !== textoLegenda0\) legenda\.textContent = textoLegenda0;/);
  assert.match(REL, /if \(legenda\.textContent !== t\) legenda\.textContent = t;/);
});
test("AB-097 · Relatórios com o cache do shell ao alternar Vendas/Atendimento", () => {
  assert.match(REL, /const opcCache = \{ cache: true, aoCache: rc => \{/);
  assert.match(REL, /"nx_rel_vendas", \{ p_de: de, p_ate: ate, p_funil: P\.funil \|\| null \}, opcCache\)/);
  assert.match(REL, /"nx_rel_atendimento", \{ p_de: de, p_ate: ate, p_departamento: P\.dep \|\| null \}, opcCache\)/);
});
test("AB-091/AB-094/AB-258 · «mensagens» por extenso, CSV com o rótulo da tabela e a previsão ponderada explicada", () => {
  assert.match(REL, /\$\{int\(f\.total\)\} \$\{\+f\.total === 1 \? "mensagem" : "mensagens"\}/);
  assert.doesNotMatch(REL, /msgs ·/);
  // plano 1500c: + «Conversão» (AC-159) — o CSV continua com o mesmo rótulo da tabela
  assert.match(REL, /colunas: \["Responsável", "Criados", "Ganhos", "Conversão %", "Receita", "Ticket médio", "Abertos agora"\],/);
  assert.match(REL, /Previsão ponderada = valor de cada negócio × chance de fechar da etapa em que ele está\./);
});

/* ============================================================ Ajustes de anúncios e formulário */
test("AB-006 · gestão mensal vazia vira 0 (nunca null)", () => {
  assert.deepEqual(AC.lerMetas({ fee: "" }), { cpa: null, cpaG: null, orc: null, fee: 0 });
  assert.equal(AC.lerMetas({ fee: "1.500" }).fee, 1500);
  assert.deepEqual(AC.lerMetas({ fee: "abc" }).erro, { campo: "fee", msg: "Informe o valor da gestão (pode ser zero)." });
  assert.equal(AC.lerMetas({ cpaAlvo: "0" }).erro.campo, "cpaAlvo");
  assert.match(ADSCFG, /const metas = lerMetas\(/);
});
test("AB-103 · serviço sem nome ou com valor inválido para o salvamento com o erro na linha", () => {
  assert.deepEqual(AC.lerTickets([{ s: "", v: "300" }]).erro, { indice: 0, campo: "s", msg: "Dê um nome a este serviço (ou apague o valor)." });
  assert.equal(AC.lerTickets([{ s: "Implante", v: "1.500" }, { s: "Limpeza", v: "abc" }]).erro.indice, 1);
  assert.deepEqual(AC.lerTickets([{ s: "Implante", v: "1.500" }, { s: "", v: "" }]), { ticket: { Implante: 1500 } }, "linha vazia é ignorada");
  // plano 1500c: aria-invalid + aria-describedby pela marcarInvalido (AC-153)
  assert.match(ADSCFG, /if \(alvoErr\) \{ marcarInvalido\(alvoErr, "cfga-tk-erro"\); alvoErr\.focus\(\); \}/);
});
test("AB-109 · sugestões de serviço incluem os já salvos no valor por serviço", () => {
  assert.deepEqual(AC.servicosUsados([{ servico: "Limpeza" }], 40, ["Implante", "limpeza"]), ["Implante", "Limpeza"]);
  assert.match(ADSCFG, /servicosUsados\(\(dados && dados\.leads\) \|\| \[\], 40, Object\.keys\(/);
});
test("AB-217 · limites do radar mostram o padrão e têm «Voltar ao padrão»", () => {
  assert.deepEqual(AC.LIMITES_RADAR_PADRAO, { ctrMin: "0,9%", freqMax: "3 vezes", r2MinGasto: "R$ 22" });
  assert.equal((ADSCFG.match(/ajuda: `Padrão: \$\{LIMITES_RADAR_PADRAO\./g) || []).length, 3);
  assert.match(ADSCFG, /"Voltar ao padrão"/);
});
test("AB-249 · prévia do título do relatório ao lado do nome curto", () => {
  assert.equal(AC.previaTituloRelatorio("Sorriso"), "📊 Sorriso · Tráfego pago — dia e data do relatório");
  assert.equal(AC.previaTituloRelatorio("", "Clínica Odontológica Sorriso Feliz", N.nomeCurtoEmpresa), "📊 Clínica Odontológica · Tráfego pago — dia e data do relatório");
  assert.match(ADSCFG, /inNome\.addEventListener\("input", pintarPrevia\);/);
});
test("AB-105 · data da última leitura com «ontem às» (L.quandoSP)", () => {
  assert.doesNotMatch(ADSCFG, /function quandoSP\(/);
  // ads-3 (AB-106): as duas linhas viraram uma só, situacaoIntegracao(st, iso => L.quandoSP(iso)), usada nos dois lugares
  assert.equal((ADSCFG.match(/situacaoIntegracao\(st, iso => L\.quandoSP\(iso\)\)/g) || []).length, 2);
  const agora = new Date(`${HOJE}T15:00:00-03:00`);
  assert.match(L.quandoSP(new Date(agora.getTime() - 864e5).toISOString(), agora), /^ontem às /);
});

function rodarFormulario({ campos = {}, rastreio = null, comAbort = false, rapido = false } = {}) {
  const codigo = AC.codigoExemplo({ url: "https://x.supabase.co/rest/v1/rpc/nx_lead_entrada", apikey: "pub-123", chave: "k".repeat(48) });
  const js = codigo.slice(codigo.indexOf("<script>") + 8, codigo.lastIndexOf("</script>"));
  const pedidos = [], ouv = {}, timers = [];
  const botao = { disabled: false };
  const form = { addEventListener: (t, fn) => { ouv[t] = fn; }, querySelector: () => botao, append() {}, replaceWith(n) { form.trocado = n; }, valores: campos };
  class FormData { constructor(f) { this.f = f; } get(k) { return k in this.f.valores ? this.f.valores[k] : null; } }
  // ads-3: AB-212 (tempo mínimo de 3 s) — o relógio falso anda 5 s por leitura; `rapido` envia sem esperar
  const ctx = { Date: { now: (() => { let t = 0; return () => (t += rapido ? 1 : 5000); })() }, document: { getElementById: () => form, createElement: () => ({ textContent: "", setAttribute() {} }) }, FormData, URLSearchParams, location: { search: "" },
    window: { OrbitaRastreio: rastreio }, fetch: async (url, init) => { pedidos.push({ url, init, corpo: JSON.parse(init.body) }); return { ok: true }; } };
  if (comAbort) Object.assign(ctx, { AbortController, setTimeout: (fn, ms) => { timers.push(ms); return 1; }, clearTimeout: () => {} });
  vm.runInNewContext(js, ctx);
  return { codigo, pedidos, timers, form, enviar: () => ouv.submit({ preventDefault() {}, target: form }) };
}
test("AB-112/AB-116/AB-115/AB-119 · formulário de exemplo: campo serviço, gbraid/wbraid, tempo-limite e rótulos", async () => {
  const f = rodarFormulario({ campos: { nome: "Ana", telefone: "12 99999-8888", aceite: "on", servico: "Implante" }, comAbort: true,
    rastreio: { dados: () => ({ utm_source: "google", gbraid: "GB1", wbraid: "WB1" }) } });
  await f.enviar();
  const p = f.pedidos[0];
  assert.equal(p.corpo.p_dados.servico, "Implante", "AB-112: antes f.get('servico') era sempre null");
  assert.equal(p.corpo.p_dados.gbraid, "GB1"); assert.equal(p.corpo.p_dados.wbraid, "WB1");
  assert.ok(p.init.signal, "AB-115: o fetch leva o sinal do AbortController"); assert.deepEqual(f.timers, [AC.TEMPO_FORM_MS]);
  assert.match(f.codigo, /<select name="servico">/);
  for (const r of ["Nome", "WhatsApp", "E-mail", "Mensagem"]) assert.match(f.codigo, new RegExp(`<label>${r} <(input|textarea) name=`), `AB-119: rótulo ${r}`);
  const sem = rodarFormulario({ campos: { nome: "Bia", telefone: "1299999", aceite: "on" } });   // navegador sem AbortController
  await sem.enviar();
  assert.equal(sem.pedidos.length, 1); assert.equal(sem.pedidos[0].corpo.p_dados.servico, null);
});

/* ============================================================ rastreio — painel */
test("AB-131 · «Por campanha» mostra o nome da campanha (o ID fica em texto pequeno)", () => {
  const nomes = RC.nomesCampanhas({ metricas: [{ c: "120210345678", cn: "Implante Taubaté" }, { c: "999", cn: "" }] });
  assert.equal(nomes.get("120210345678"), "Implante Taubaté"); assert.equal(nomes.has("999"), false);
  const R = RC.resumoRastreio({ itens: [{ em: new Date().toISOString(), utm_campaign: "120210345678" }, { em: new Date().toISOString(), utm_campaign: "outra" }] }, { nomes });
  assert.deepEqual(R.campanhas.map(c => [c.nome, c.id]).sort(), [["Implante Taubaté", "120210345678"], ["outra", null]]);
  assert.match(RCFG, /api\.rpcC\("nx_dados", \{ p_dias: 30 \}, \{ cache: true \}\)\.then\(nomesCampanhas/);
});
test("AB-132 · tabela «Por campanha» avisa quantas ficaram de fora", () => {
  const itens = Array.from({ length: 15 }, (_, k) => ({ em: new Date().toISOString(), utm_campaign: `camp-${k}` }));
  const R = RC.resumoRastreio({ itens });
  assert.equal(R.campanhasOcultas, 3);
  assert.match(RCFG, /`e mais \$\{R\.campanhasOcultas\} \$\{R\.campanhasOcultas === 1 \? "campanha" : "campanhas"\} com menos cliques`/);
});
test("AB-135 · resposta velha dos cliques não pinta por cima da nova", () => {
  assert.match(RCFG, /const n = \+\+pedidoCliques;/);
  assert.match(RCFG, /if \(n !== pedidoCliques\) return;           \/\/ AB-135/);
  assert.match(RCFG, /if \(n === pedidoCliques\) \{                 \/\/ AB-135/);
});
test("AB-252 · primeiro site a mandar cliques também aparece como «novo»", () => {
  const agora = Date.now();
  const R = RC.resumoRastreio({ itens: [{ em: new Date(agora - 2 * 864e5).toISOString(), pagina: "https://estranho.com/x" }] }, { agora });
  assert.deepEqual(R.hosts.map(x => [x.host, x.novo, x.antigo]), [["estranho.com", true, false]], "antes: sem site anterior, nenhum alerta");
  assert.match(RCFG, /Os cliques começaram nesta semana: /);
});
test("AB-130 · sem crases literais no texto da instalação", () => {
  assert.doesNotMatch(RCFG, /tag `<\/body>`/);
  assert.match(RCFG, /h\("code", null, "<\/body>"\)/);
});
test("AB-007 (painel) · snippet novo aponta para rastreio.v2.js com SRI que confere com o arquivo; v1 intocada", () => {
  const sri = `sha384-${createHash("sha384").update(Buffer.from(V2, "utf8")).digest("base64")}`;
  assert.equal(RC.SRI_V2, sri, "rastreio.v2.js mudou: depois de publicado, crie rastreio.v3.js");
  assert.equal(RC.SRI_V1, `sha384-${createHash("sha384").update(Buffer.from(V1, "utf8")).digest("base64")}`, "a v1 continua congelada");
  assert.equal(RC.snippetRastreio("a".repeat(48)), `<script src="https://jpfamelli.github.io/nexus-ads/rastreio.v2.js" integrity="${sri}" crossorigin="anonymous" data-chave="${"a".repeat(48)}" defer></script>`);
  assert.match(RC.snippetGerenciador("a".repeat(48)), /rastreio\.v2\.js" integrity="sha384-/);
});

/* ============================================================ rastreio.v2.js (script do site) */
const CHAVE_SITE = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";
const WA = "https://wa.me/5512999990000?text=Ol%C3%A1";
function el(tag, attrs = {}, pai = null) {
  const a = { ...attrs };
  return { nodeType: 1, tagName: tag.toUpperCase(), parentNode: pai, getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); }, _a: a };
}
// ads-2: `cfgJanela` (window.ORBITA_RASTREIO), `http` ({ok, status} da resposta: chave revogada) e `sessao` (sessionStorage) — AB-123/125/128
// ads-3: `navegador` (navigator: GPC) e `relogio` ({set, clear} no lugar de setTimeout/clearTimeout) — AB-124/AB-126
function montarV2({ search = "", guardado = null, resposta = null, semFetch = false, cfgJanela = null, http = null, sessao = null, navegador = null, relogio = null } = {}) {
  const ouvintes = {}, ouvJanela = {}, loja = new Map(), chamadas = [], navegacao = [], infos = [];
  if (guardado) loja.set("orbita:rastreio:v1", JSON.stringify(guardado));
  const script = el("script", { "data-chave": CHAVE_SITE });
  const janela = {
    document: { currentScript: script, addEventListener: (t, f) => { (ouvintes[t] ||= []).push(f); } },
    addEventListener: (t, f) => { (ouvJanela[t] ||= []).push(f); },
    localStorage: { getItem: k => (loja.has(k) ? loja.get(k) : null), setItem: (k, v) => loja.set(k, String(v)), removeItem: k => loja.delete(k) },
    location: { search, origin: "https://site.com", pathname: "/implante", href: "https://site.com/implante" + search, assign: u => navegacao.push(u) },
    navigator: navegador || {}, history: { pushState() {}, replaceState() {} },
    fetch: (url, init) => { chamadas.push({ url, corpo: JSON.parse(init.body) }); return Promise.resolve({ ok: http ? http.ok : true, status: http ? http.status : 200, json: async () => (resposta ? resposta(chamadas.length) : { ok: true, codigo: "K7Q2P" }) }); },
    AbortController, Promise, setTimeout, clearTimeout, JSON, Date, encodeURIComponent, decodeURIComponent, String, Object, Number, Array, RegExp,
    console: { warn() {}, info: (...a) => infos.push(a.join(" ")) },
  };
  if (cfgJanela) janela.ORBITA_RASTREIO = cfgJanela;
  if (sessao) janela.sessionStorage = sessao;
  if (relogio) { janela.setTimeout = relogio.set; janela.clearTimeout = relogio.clear; }
  if (semFetch) delete janela.fetch;
  janela.window = janela;
  vm.runInContext(V2, vm.createContext(janela), { filename: "rastreio.v2.js" });
  const disparar = (tipo, alvo, extra = {}) => { const ev = { target: alvo, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; for (const f of ouvintes[tipo] || []) f(ev); return ev; };
  return { janela, ouvJanela, disparar, chamadas, navegacao, loja, infos, guardadoAgora: () => JSON.parse(loja.get("orbita:rastreio:v1") || "null"), api: janela.OrbitaRastreio };
}

test("AB-007 · passar o mouse 5× registra só um «aquecimento»; o clique com código pronto não conta outro clique em servidor antigo", async () => {
  const m = montarV2();
  const a = el("a", { href: WA });
  for (let i = 0; i < 5; i++) m.disparar("pointerover", a);
  await esperar(10);
  assert.equal(m.chamadas.length, 1);
  assert.equal(m.chamadas[0].corpo.p_dados.evento, "aquecimento", "antes: o hover chegava ao servidor igual a um clique");
  m.disparar("click", a);
  await esperar(10);
  assert.equal(m.chamadas.length, 1, "servidor sem {eventos: true}: nenhuma confirmação (criaria um clique a mais)");
  assert.match(decodeURIComponent(a.getAttribute("href")), /\[ref K7Q2P\]$/);
  assert.equal(m.api.versao, 2);
});
test("AB-007 · servidor que entende eventos recebe a confirmação do clique real, uma vez só", async () => {
  const m = montarV2({ resposta: () => ({ ok: true, codigo: "K7Q2P", eventos: true }) });
  const a = el("a", { href: WA });
  m.disparar("pointerover", a);
  await esperar(10);
  m.disparar("click", a); m.disparar("click", a);
  await esperar(10);
  assert.equal(m.chamadas.length, 2);
  assert.deepEqual(m.chamadas[1].corpo.p_dados, { evento: "clique", confirmar: "K7Q2P", pagina: "https://site.com/implante" });
});
test("AB-007 · clique sem aquecimento registra como «clique»", async () => {
  const m = montarV2();
  m.disparar("click", el("a", { href: WA }));
  await esperar(10);
  assert.equal(m.chamadas.length, 1); assert.equal(m.chamadas[0].corpo.p_dados.evento, "clique");
});
test("AB-122 · sem window.fetch o hover não lança e o link segue sem código", async () => {
  const m = montarV2({ semFetch: true });
  const a = el("a", { href: WA });
  assert.doesNotThrow(() => m.disparar("pointerover", a));
  assert.doesNotThrow(() => m.disparar("pointerover", { nodeType: 1, get parentNode() { throw new Error("DOM estranho"); }, getAttribute() { throw new Error("x"); }, tagName: "SPAN" }));
  const ev = m.disparar("click", a);
  await esperar(1600);
  assert.equal(ev.defaultPrevented, true);
  assert.deepEqual(m.navegacao, [WA], "segue para o link original");
  assert.match(V2, /function temFetch\(\) \{ return typeof janela\.fetch === "function"; \}/);
});
test("AB-205 · link a 15 níveis do alvo é achado (com e sem el.closest)", async () => {
  const a = el("a", { href: WA });
  let alvo = a; for (let i = 0; i < 15; i++) alvo = el("span", {}, alvo);
  const m = montarV2();
  m.disparar("click", alvo);
  await esperar(10);
  assert.equal(m.chamadas.length, 1, "antes: 12 níveis no máximo — o clique passava sem código");
  // com closest (navegador): ignorar num PAI do link deixa o clique com o site
  const pai = { ...el("div", { "data-orbita-ignorar": "" }) };
  const a2 = el("a", { href: WA }, pai);
  a2.closest = sel => (sel.includes("a[href]") ? a2 : sel === "[data-orbita-ignorar]" ? pai : null);
  const icone = el("svg", {}, a2); icone.closest = sel => a2.closest(sel);
  const m2 = montarV2();
  const ev = m2.disparar("click", icone);
  await esperar(10);
  assert.equal(m2.chamadas.length, 0); assert.equal(ev.defaultPrevented, false);
});
test("AB-226 · parâmetro solto não apaga a campanha guardada; id de clique novo troca", () => {
  const guardado = { v: 1, t: Date.now() - 864e5, d: { utm_source: "meta", utm_campaign: "Implante", fbclid: "FB1" }, c: null };
  assert.deepEqual(montarV2({ search: "?utm_term=x", guardado }).guardadoAgora().d, guardado.d, "antes: virava {utm_term: x}");
  assert.deepEqual(montarV2({ search: "?utm_source=&fbclid=FB1", guardado }).guardadoAgora().d, guardado.d);
  assert.deepEqual(montarV2({ search: "?gclid=G9", guardado }).guardadoAgora().d, { gclid: "G9" });
  assert.deepEqual(montarV2({ search: "?utm_campaign=Nova", guardado }).guardadoAgora().d, { utm_campaign: "Nova" });
  assert.deepEqual(montarV2({ search: "?utm_term=x" }).guardadoAgora().d, { utm_term: "x" }, "sem nada guardado, vale o que veio");
});
test("AB-127 · hashchange recaptura a campanha", () => {
  const m = montarV2();
  assert.ok((m.ouvJanela.hashchange || []).length, "antes: só popstate");
  m.janela.location.search = "?utm_source=google&utm_campaign=Hash";
  for (const f of m.ouvJanela.hashchange) f({});
  assert.deepEqual(m.guardadoAgora().d, { utm_source: "google", utm_campaign: "Hash" });
});

/* ============================================================ LOTE ads-2 (plano 1000b) ============================================================ */
const ADSb = ler("web/app/anuncios.js"), RELb = ler("web/app/relatorios.js"), CSSb = ler("web/app/relatorios.css"), ADSCFGb = ler("web/app/ads-config.js");
const RCFGb = ler("web/app/rastreio-config.js"), V2b = ler("web/rastreio.v2.js");

/* ---------- Visão geral / Anúncios ---------- */
test("AB-188 · a resposta da rede igual à do cache não redesenha; mudou → o foco volta ao mesmo controle", () => {
  const d = { hoje: HOJE, metricas: [1, 2], leads: [1], alertas: [], relatorios: [], integracoes: [{ canal: "meta", ultimo_sync: "2026-10-14T10:00:00Z", status: "ok" }], cliente: { cfg: { cpaAlvo: 20 } } };
  assert.equal(A.assinaturaDados(d), A.assinaturaDados(JSON.parse(JSON.stringify(d))));
  assert.notEqual(A.assinaturaDados(d), A.assinaturaDados({ ...d, integracoes: [{ canal: "meta", ultimo_sync: "2026-10-14T11:00:00Z", status: "ok" }] }), "nova leitura = redesenha");
  assert.notEqual(A.assinaturaDados(d), A.assinaturaDados({ ...d, leads: [1, 2] }));
  assert.equal(A.assinaturaDados(null), "");
  const b = h("button", { id: "x1" }); assert.equal(A.seletorFoco(b), "#x1");
  assert.equal(A.seletorFoco(h("button", { "data-ord": "cpa" })), 'button[data-ord="cpa"]');
  assert.equal(A.seletorFoco(h("button", { "aria-label": 'Ver "A"' })), 'button[aria-label="Ver \\"A\\""]');
  assert.equal(A.seletorFoco(h("div")), null);
  assert.match(ADSb, /if \(pintouDoCache && assinaturaCache && assinaturaCache === assinaturaDados\(dados\)\) \{/);
  assert.match(ADSb, /const sel = focado && dentroDe\(raiz, focado\) \? seletorFoco\(focado\) : null;\n\s+desenhar\(item\);/);
});

test("AB-004 · comparação de campanhas mostra 1,5 conversão do Google (não «2»)", () => {
  const linhas = [{ c: { id: "a", nome: "Pesquisa" }, t: { gasto: 90, conversoes: 1.5, cpa: 60 }, k: { conversas: 1, agendadas: 0, fecharam: 0, receita: 0 }, roas: null }];
  const p = A.criarPainelCampanhas({ h, linhas, estado: { comparacao: ["a"] }, inteiro: N.int, decimal: n => N.dec(n, 1) });
  const tab = p.elemento.querySelector("table.ads-comparacao-tabela");
  assert.match(tab.textContent, /Conversões da plataforma1,5/, "antes: inteiro(1,5) = 2");
  const p2 = A.criarPainelCampanhas({ h, linhas, estado: { comparacao: ["a"] }, inteiro: N.int, decimal: n => N.dec(n, 1), conv: v => `c${v}` });
  assert.match(p2.elemento.textContent, /Conversões da plataformac1\.5/, "o formatador da tela vale");
  assert.match(ADSb, /decimal: n => N\.dec\(n, 1\), conv: fmtConvG,/);
});

test("AB-215 · sem resultado o status sugere limpar; Esc no campo leva a «Limpar filtros»", () => {
  const linhas = [{ c: { id: "a", nome: "Implante" }, t: {}, k: {} }];
  const p = A.criarPainelCampanhas({ h, linhas, estado: { busca: "zzz" } });
  assert.equal(p.elemento.querySelector("p.ads-camp-resumo").textContent, "Nenhuma campanha corresponde aos filtros — limpe a busca ou troque o filtro.");
  const busca = p.elemento.querySelector("input.ads-camp-busca-input");
  busca.emitir("keydown", { key: "Escape" });
  assert.equal(document.activeElement, p.elemento.querySelector("button.ads-camp-limpar"));
  document.activeElement = null;
  const p2 = A.criarPainelCampanhas({ h, linhas, estado: { busca: "impl" } });
  p2.elemento.querySelector("input.ads-camp-busca-input").emitir("keydown", { key: "Escape" });
  assert.equal(document.activeElement, null, "com resultado, o Esc fica com o campo");
});

test("AB-218 · a coluna «Anúncio» do funil por plataforma diz o que é", () => {
  const dados = [{ plat: "anuncio", nome: "Anúncio", gasto: 0, receita: 0, max: 2, etapas: [{ id: "convAds", rotulo: "Conversões do anúncio", v: 0 }, { id: "conversas", rotulo: "Conversas no CRM", v: 2 }], taxas: [{ pct: null }] }];
  const el = A.criarFunilPlataformas({ h, dados, fmtInt: N.int, fmtMoeda: N.brl0 });
  assert.match(el.querySelector(".ads-fp-sub").textContent, /^anúncio sem plataforma informada$/);
  const meta = A.criarFunilPlataformas({ h, dados: [{ ...dados[0], plat: "meta", nome: "Meta" }], fmtInt: N.int, fmtMoeda: N.brl0 });
  assert.equal(meta.querySelector(".ads-fp-sub"), null);
});

function calorT() {
  const matriz = Array.from({ length: 7 }, (_, d) => [d + 1, d + 10]);
  return A.criarCalorSemanal({ h, calor: { semanas: [{ rotulo: "s1" }, { rotulo: "s2" }], matriz, max: 20, pico: null }, fmt: String });
}
const selCal = c => c.querySelector(".ads-cal-sel").attrs["data-txt"];
test("AB-027 · calor semanal é um grupo interativo ligado à dica (não role=img)", () => {
  const c = calorT();
  const grade = c.querySelector(".ads-cal"), dica = c.querySelector(".ads-cal-dica");
  assert.equal(grade.getAttribute("role"), "group");
  assert.equal(grade.getAttribute("aria-roledescription"), "mapa de calor");
  assert.ok(dica.getAttribute("id")); assert.equal(grade.getAttribute("aria-describedby"), dica.getAttribute("id"));
  assert.notEqual(calorT().querySelector(".ads-cal-dica").getAttribute("id"), dica.getAttribute("id"), "ids únicos com dois mapas na tela");
});
test("AB-028 · ↑/↓ do calor ficam na mesma coluna nas bordas", () => {
  const c = calorT(), grade = c.querySelector(".ads-cal");
  const k = key => grade.emitir("keydown", { key });
  k("Home"); k("ArrowRight"); assert.equal(selCal(c), "seg · semana de s2: 11");
  k("ArrowUp"); assert.equal(selCal(c), "seg · semana de s2: 11", "antes: ia para a célula 0 (outra coluna)");
  k("End"); k("ArrowLeft"); assert.equal(selCal(c), "dom · semana de s1: 1");
  k("ArrowDown"); assert.equal(selCal(c), "dom · semana de s1: 1", "antes: ia para a última célula (outra coluna)");
  k("ArrowUp"); assert.equal(selCal(c), "sáb · semana de s1: 7");
});

test("AB-032 · detalhe da pílula fecha ao tocar fora e quando o foco sai da caixa", () => {
  const ouv = {}, doc = { addEventListener: (t, f) => { ouv[t] = f; }, removeEventListener: (t, f) => { if (ouv[t] === f) delete ouv[t]; } };
  const caixa = new No("div"), dentro = new No("button"), fora = new No("p");
  caixa.append(dentro);
  let aberto = true, fechou = 0;
  const soltar = A.ligarFecharFora({ caixa, aberto: () => aberto, fechar: () => { fechou++; aberto = false; }, doc });
  ouv.pointerdown({ target: dentro }); assert.equal(fechou, 0, "toque dentro não fecha");
  ouv.pointerdown({ target: fora }); assert.equal(fechou, 1);
  aberto = true; caixa.emitir("focusout", { relatedTarget: dentro }); assert.equal(fechou, 1);
  caixa.emitir("focusout", { relatedTarget: fora }); assert.equal(fechou, 2);
  soltar(); assert.equal(ouv.pointerdown, undefined, "desmontar solta o ouvinte do documento");
  assert.match(ADSb, /soltarFora = ligarFecharFora\(\{ caixa: caixaPilula, aberto: \(\) => !pilulaPop\.hidden, fechar: fecharPop \}\);/);
  assert.match(ADSb, /if \(soltarFora\) \{ soltarFora\(\); soltarFora = null; \}/);
});
test("AB-064 · detalhe da pílula só é refeito aberto", () => {
  assert.match(ADSb, /if \(!pilulaPop\.hidden\) pintarDetalhe\(\);/);
  assert.match(ADSb, /if \(abrir && pintarDetalhe\) pintarDetalhe\(\);/);
  assert.doesNotMatch(ADSb, /const det = L\.detalhePilula\(e, agora\), prox = L\.proximaLeitura\(e\.ultimo, agora\);\n\s+ui\.limpar\(pilulaPop\);/);
});

test("AB-036/AB-037/AB-041 · legenda só com plataformas com números; plural por termo; CSV com o custo por conversão", () => {
  assert.match(ADSb, /const naLegenda = p => \(S\.plat \? S\.plat === p : comNumeros\.has\(p\)\);/);
  assert.match(ADSb, /\(naLegenda\("meta"\) \? h\("li"/); assert.match(ADSb, /\(naLegenda\("google"\) \? h\("li"/);
  assert.match(ADSb, /\$\{x\.c\.conversas === 1 \? "conversa registrada" : "conversas registradas"\}/);
  assert.doesNotMatch(ADSb, /\$\{N\.int\(x\.c\.conversas\)\} conversas registradas,/);
  assert.match(ADSb, /\["Dia", "Investimento Meta", "Investimento Google", "Conversões Ads", "Custo por conversão Ads"\],\n\s+\(\) => serie\.atual\.map\(d => \[.*d\.conv \? Math\.round\(d\.gasto \/ d\.conv \* 100\) \/ 100 : ""\]\)/);
});
test("AB-070/AB-247/AB-193/AB-250 · chip com o período em texto; retorno sem gasto; fechamentos sem valor; barra do orçamento", () => {
  assert.match(ADSb, /h\("span", \{ class: "sr-only" \}, ` em relação a \$\{L\.rotuloPeriodo\(S\.dias\)\.antes\}`\)/);
  assert.match(ADSb, /c\.conversas > 0 \? "Sem investimento nestes dias — as conversas vêm de anúncios de antes" : "Sem investimento no período"/);
  assert.match(ADSb, /sem valor informado — não entram na receita até alguém registrar o valor`/);
  assert.doesNotMatch(ADSb, /\(fora da conta\)/);
  assert.match(ADSb, /"aria-describedby": "ads-orc-descr",\n\s+"aria-label": `\$\{N\.brl0\(m\.gasto\)\} de \$\{N\.brl0\(orc\)\}/);
  assert.match(ADSb, /h\("p", \{ id: "ads-orc-descr", class: "rel-nota" \}, descrOrcamento\)/);
});
test("AB-180 · a descrição do período (com o fuso) é a mesma nos filtros e nos cartões", () => {
  assert.match(ADSb, /const descP = Pdes \? descricaoPeriodoAds\(Pdes, M\.dataBR, L\.nomePlat, \{ fusos \}\) : null;/);
  assert.match(ADSb, /const periodoTexto = desc0 \|\| descricaoPeriodoAds\(P, M\.dataBR, L\.nomePlat\);/);
  assert.match(ADSb, /return abaGeral\(M, Pdes, descP\);/);
});
test("AB-262 · crítico ativo ganha faixa no topo da Visão geral com link para o Radar", () => {
  assert.equal(A.textoFaixaCritico(1), "1 alerta crítico no Radar");
  assert.equal(A.textoFaixaCritico(3), "3 alertas críticos no Radar");
  assert.equal(A.textoFaixaCritico(0), "");
  assert.match(ADSb, /const txtCritico = selo\.sev === "critico" \? textoFaixaCritico\(L\.semaforoRadar\(radar\)\.contagens\.critico\) : "";/);
  assert.match(ADSb, /h\("a", \{ class: "rel-link", href: "#\/anuncios\/radar" \}, "Ver no Radar"\)/);
});
test("AB-061 · o modo do calor por hora acompanha a tela enquanto a pessoa não escolheu", () => {
  assert.match(ADSb, /btModo\.addEventListener\("click", \(\) => \{ escolheuModo = true;/);
  assert.match(ADSb, /mq\.addEventListener\("change", aoMudarTela\);\n\s+graficos\.push\(\{ destruir\(\) \{ mq\.removeEventListener\("change", aoMudarTela\); \} \}\);/);
  assert.match(ADSb, /if \(escolheuModo \|\| !alvo\.isConnected\) return;/);
});
test("AB-068 · PNG: «Gerando…» e aria-busy enquanto gera; volta ao normal e avisa", async () => {
  const alvo = new No("div"); alvo.append(new No("svg"));
  const falhas = [];
  const b = A.botaoPng({ h, alvo, nome: "x.png", L, aoFalhar: t => falhas.push(t) });
  b.emitir("click");
  assert.equal(b.textContent, "Gerando…"); assert.equal(b.getAttribute("aria-busy"), "true"); assert.equal(b.disabled, true);
  await esperar(5);
  assert.equal(b.textContent, "PNG"); assert.equal(b.getAttribute("aria-busy"), null); assert.equal(b.disabled, false);
  assert.equal(falhas.length, 1, "sem canvas aqui: cai no aviso de falha");
  assert.match(ADSb, /aoPronto: t => ui\.toast\(t, \{ tipo: "ok", ms: 2000 \}\) \}\)\);   \/\/ AB-068/);
  assert.match(RELb, /aoPronto: t => ui\.toast\(t, \{ tipo: "ok", ms: 2000 \}\) \}\)\);   \/\/ AB-068/);
});
test("AB-209 · download recusado avisa (Anúncios e Relatórios)", () => {
  assert.match(ADSb, /const avisarDownload = r => \{ if \(r === false\) ui\.toast\("Não deu para baixar aqui; use «Ver como tabela» e copie os números\."/);
  assert.equal((ADSb.match(/\.then\(avisarDownload, \(\) => avisarDownload\(false\)\)/g) || []).length, 2, "CSV dos blocos e o «Exportar CSV filtrado»");
  assert.match(ADSb, /\.then\(r => \(r === false \? ui\.toast\("Não deu para baixar aqui;/, "a paleta também");
  assert.match(RELb, /const avisar = r => \{ if \(r === false\) ui\.toast\("Não deu para baixar aqui;/);
});

/* ---------- Campanhas e criativos ---------- */
test("AB-256/AB-073/AB-045 · cartão tocável no celular; sem «— cada» sem conversão; selo que diz o que conferiu", () => {
  assert.match(ADSb, /tr\.addEventListener\("click", ev => \{\n\s+if \(!\(typeof matchMedia === "function" && matchMedia\("\(max-width: 760px\)"\)\.matches\)\) return;/);
  assert.match(ADSb, /if \(t && typeof t\.closest === "function" && t\.closest\("button, input, label, a"\)\) return;\n\s+abrir\.click\(\);/);
  assert.match(CSSb, /@media \(max-width: 760px\) \{ \.ads-tabela tbody tr \{ cursor: pointer; \} \}/);
  assert.match(ADSb, /\$\{Number\.isFinite\(r\.t\.cpa\) \? ` · \$\{N\.brl\(r\.t\.cpa\)\} cada` : ""\}/);
  assert.match(ADSb, /k\.plat === "google" \? "sem alerta" : "sem sinal de cansaço"/);
  assert.doesNotMatch(ADSb, /"rel-chip rel-chip-bom" \}, "ok"\)/);
});

/* ---------- Radar ---------- */
test("AB-076 · última leitura pelo maior instante (fusos diferentes no texto)", () => {
  assert.equal(A.ultimaLeitura([{ ultimo_sync: "2026-10-14T13:30:00Z" }, { ultimo_sync: "2026-10-14T11:00:00-03:00" }, { ultimo_sync: null }]), "2026-10-14T11:00:00-03:00", "antes: o texto «…13:30Z» vencia (14:00Z é maior)");
  assert.equal(A.ultimaLeitura([]), null);
  assert.match(ADSb, /const u = ultimaLeitura\(dados\.integracoes \|\| \[\]\);/);
});
test("AB-177 · filtrar o Radar anuncia quantos ficaram", () => {
  assert.equal(A.textoFiltroRadar(3, "ativos"), "3 alertas ativos.");
  assert.equal(A.textoFiltroRadar(1, "resolvidos"), "1 alerta resolvido.");
  assert.equal(A.textoFiltroRadar(0, "ativos"), "Nenhum alerta ativo.");
  assert.equal(A.textoFiltroRadar(5), "5 alertas nos últimos 14 dias.");
  assert.match(ADSb, /aoFiltrar: f => \{ S\.filtroRadar = f; pintarLista\(f, true\); \}/);
  assert.match(ADSb, /corpo\.append\(semaforo\.elemento, statusFiltro\);/);
});
test("AB-196 · regra parada por falta de meta leva o gestor a definir a meta", () => {
  assert.match(ADSb, /!r\.ativa && r\.semMeta && eGestor\(ctx\) \? h\("a", \{ class: "rel-link ads-regra-meta", href: "#\/config\/anuncios" \}, "Definir a meta"\) : null/);
});
test("AB-046 · cartão do aparelho sem aria-live; só a mudança de nível é anunciada", () => {
  assert.doesNotMatch(ADSb, /"aria-labelledby": "ads-ap-h", "aria-live": "polite"/);
  assert.match(ADSb, /if \(nivelAp !== undefined && nivel !== nivelAp\) vivoAp\.textContent = /);
  assert.match(ADSb, /return h\("div", \{ class: "ads-aparelho-caixa" \}, caixa, vivoAp\);/);
  assert.match(CSSb, /\.ads-aparelho-caixa \{ display: contents; \}/);
});

/* ---------- Relatórios do Anúncios ---------- */
test("AB-049 · «Copiar texto» funciona sem ui.copiar (área de transferência; senão seleciona)", async () => {
  let viaUi = null; assert.equal(await A.copiarTexto("oi", { ui: { copiar: async (t, o) => { viaUi = [t, o.aviso]; } }, aviso: "ok!" }), "ui");
  assert.deepEqual(viaUi, ["oi", "ok!"]);
  let escrito = null; const toasts = [];
  assert.equal(await A.copiarTexto("texto", { ui: { toast: t => toasts.push(t) }, nav: { clipboard: { writeText: async t => { escrito = t; } } }, aviso: "Copiado." }), "clipboard", "antes: sem ui.copiar não fazia nada");
  assert.equal(escrito, "texto"); assert.deepEqual(toasts, ["Copiado."]);
  let falhou = 0;
  assert.equal(await A.copiarTexto("x", { ui: {}, nav: {}, aoFalhar: () => { falhou++; } }), false);
  assert.equal(await A.copiarTexto("x", { ui: {}, nav: { clipboard: { writeText: async () => { throw new Error("negado"); } } }, aoFalhar: () => { falhou++; } }), false);
  assert.equal(falhou, 2);
});
test("AB-052 · sem WhatsApp da gestão, a aba Relatórios diz que o diário não sai (só para gestor)", () => {
  assert.match(A.notaSemDestino({}), /^Sem WhatsApp de destino: o diário não é enviado\./);
  assert.equal(A.notaSemDestino({ waGestor: ["5512999998888"] }), "");
  assert.match(ADSb, /const txtSemDestino = eGestor\(ctx\) \? notaSemDestino\(\(dados\.cliente && dados\.cliente\.cfg\) \|\| \{\}\) : "";/);
});
test("AB-056 · o status do relatório só fala depois da escolha da pessoa", () => {
  assert.match(ADSb, /const mostrar = \(anunciar = false\) => \{/);
  assert.match(ADSb, /if \(anunciar\) statusLeitor\.textContent = it\.previa/);
  assert.match(ADSb, /b\.addEventListener\("click", \(\) => \{ S\.rel = it\.chave; mostrar\(true\); \}\);/);
});

/* ---------- rel-logica ---------- */
test("AB-082 · no dia 1º «Este mês» e «Mês passado» dizem o nome do mês", () => {
  const Md1 = N.montar(N.datasetDeLinhas({ metricas: [], leads: [], hoje: "2026-10-01", dias: 130, cliente: { nome: "X", cfg: {} } }));
  assert.equal(L.rotuloPeriodo("mes", Md1).titulo, "Setembro (até ontem)", "antes: «Este mês» mostrando setembro inteiro");
  assert.equal(L.rotuloPeriodo("mes_ant", Md1).titulo, "Agosto");
  assert.equal(L.rotuloPeriodo("mes", Md1).nos, "em setembro");
  const Md15 = N.montar(N.datasetDeLinhas({ metricas: [], leads: [], hoje: "2026-10-15", dias: 130, cliente: { nome: "X", cfg: {} } }));
  assert.equal(L.rotuloPeriodo("mes", Md15).titulo, "Este mês");
  assert.equal(L.rotuloPeriodo("mes_ant", Md15).titulo, "Mês passado");
  assert.equal(L.rotuloPeriodo("mes").titulo, "Este mês", "sem M: como antes");
  assert.equal(L.numerosPeriodo(Md1, { dias: "mes" }).rotulo.titulo, "Setembro (até ontem)");
  // plano 1500c: o cabeçalho de impressão saiu para cabecalhoImpressaoAds (AC-128) — o período continua com o nome do mês
  assert.match(ADSb, /periodo: L\.rotuloPeriodo\(S\.dias, M\)\.titulo,/);
});
test("AB-199 · «enviado» sem confirmação há mais de 24 h vira «sem confirmação de entrega»", () => {
  const agora = Date.now();
  const velho = { enviado_em: new Date(agora - 30 * 36e5).toISOString() }, novo = { enviado_em: new Date(agora - 36e5).toISOString() };
  assert.equal(L.statusEnvio(velho, agora).rotulo, "enviado · sem confirmação de entrega");
  assert.match(L.statusEnvio(novo, agora).rotulo, /^enviado às \d\d:\d\d · entrega ainda não confirmada$/);
  assert.match(L.statusEnvio(velho).rotulo, /entrega ainda não confirmada$/, "sem agora: o texto do clássico (paridade)");
  const lista = L.listaRelatorios([{ tipo: "diario", referencia: dia(5), texto: "x", ...velho }], 12, agora);
  assert.equal(lista[0].envio.rotulo, "enviado · sem confirmação de entrega");
});
test("AB-081 · canalDe: a chave decide; «meta de custo» na mensagem do Google não vira Meta", () => {
  assert.equal(L.canalDe({ chave: "integracao|google", mensagem: "Google: passou da meta de custo" }), "google");
  assert.equal(L.canalDe({ mensagem: "Google Ads: a meta de custo foi ultrapassada" }), "google", "antes: meta");
  assert.equal(L.canalDe({ chave: "integracao|meta", mensagem: "falha" }), "meta");
  assert.equal(L.canalDe({ mensagem: "Conexão com o Meta" }), "meta");
  assert.equal(L.canalDe({ chave: "r1|x" }), null);
});
test("AB-013 · conversão do funil com 1 casa e milhar", () => {
  assert.equal(L.textoConversao({ tipo: "aberto", passaram: 1500, conversao_proxima_pct: 33.3333 }), "1.500 entraram · 33,3% seguiram", "antes: «1500 entraram · 33,3333% seguiram»");
  assert.equal(L.textoConversao({ tipo: "aberto", passaram: 10, conversao_proxima_pct: 42.5 }), "10 entraram · 42,5% seguiram");
});
test("AB-174 · negócio sem origem é «Sem origem» (não «Cadastro manual»)", () => {
  const o = L.origensVendas([{ origem: null, criados: 2, ganhos: 1, perdidos: 0, receita: 0 }, { origem: "manual", criados: 1, ganhos: 0, perdidos: 0, receita: 0 }]);
  assert.deepEqual(o.map(x => [x.rotulo, x.criados]).sort(), [["Cadastro manual", 1], ["Sem origem", 2]]);
});
test("AB-221 · a explicação do r3 não culpa o Meta como fato", () => {
  assert.doesNotMatch(L.explicarRegra("r3").porque, /Meta cobra/);
  assert.match(L.explicarRegra("r3").porque, /anúncio pouco tocado costuma sair mais caro/);
});

/* ---------- Relatórios (tela) ---------- */
test("AB-002 · tabela do funil: «Seguiram» é o número e a % ganha a coluna «Conversão» (igual ao CSV)", () => {
  assert.match(RELb, /colunas: \["Etapa", "Agora", "Valor", "Entraram", "Seguiram", "Conversão"\],/);
  assert.match(RELb, /int\(e\.passaram\), e\.tipo === "aberto" \? int\(e\.avancaram\) : "—", e\.tipo === "aberto" \? pctTxt\(e\.conversao_proxima_pct\) : "—"\]/);
});
test("AB-086 · data inválida: aria-invalid e aria-describedby no campo culpado", () => {
  assert.equal(RL.campoDataInvalida("periodo_grande", "2026-01-01"), "de");
  assert.equal(RL.campoDataInvalida("dados_invalidos", ""), "de", "falta o «De»");
  assert.equal(RL.campoDataInvalida("dados_invalidos", "2026-10-01"), "ate");
  assert.match(RELb, /const erroPer = h\("p", \{ id: "relat-erro-per", class: "relat-erro", role: "alert" \}\);/);
  assert.match(RELb, /i\.setAttribute\("aria-invalid", "true"\); i\.setAttribute\("aria-describedby", "relat-erro-per"\);/);
  assert.match(RELb, /marcarDataInvalida\(v\.ok \? null : campoDataInvalida\(v\.erro, deIn\.value\) === "de" \? deIn : ateIn\);/);
});
test("AB-202/AB-099 · «Atualizar» confirma com toast; a hora envelhece em 10 min", () => {
  assert.match(RELb, /btnAtualizar\.addEventListener\("click", \(\) => carregar\(\{ doBotao: true \}\)\);/);
  assert.match(RELb, /if \(doBotao\) ui\.toast\("Números atualizados\.", \{ tipo: "ok", ms: 2500 \}\);/);
  assert.equal(RL.HORA_VELHA_MS, 600000);
  assert.match(RELb, /horaCarga\.classList\.add\("relat-hora-velha"\)/);
  assert.match(CSSb, /\.relat-hora-velha \{ color: var\(--c-texto-3\); font-style: italic; \}/);
});
test("AB-089/AB-092/AB-095/AB-259 · perdidos com milhar, «1 aberta agora», resumo semanal e parados com caminho", () => {
  assert.match(RELb, /`\$\{int\(k\.perdidos\)\} \$\{fem/);
  assert.match(RELb, /\$\{int\(d\.abertas_agora\)\} \$\{\+d\.abertas_agora === 1 \? "aberta" : "abertas"\} agora/);
  assert.match(RELb, /resumo: `Criados e ganhos por \$\{semanal \? "semana" : "dia"\}:/);
  assert.match(RELb, /resumo: `Novas e resolvidas por \$\{semanal \? "semana" : "dia"\}:/);
  assert.match(RELb, /: h\("a", \{ class: "rel-link", href: "#\/crm" \}, "Abrir o CRM"\)\);/);
});

/* ---------- CSS ---------- */
test("AB-060/AB-183/AB-186 · métrica presa na comparação; mensal sem rolagem dupla; taxa do funil em 12 px", () => {
  assert.match(CSSb, /\.ads-comparacao-tabela tbody th\[scope="row"\], \.ads-comparacao-tabela thead th:first-child \{ position: sticky; left: 0;/);
  assert.match(CSSb, /@media \(max-width: 760px\) \{ \.ads-fone-corpo \{ max-height: none; overflow-y: visible; \} \}/);
  assert.match(CSSb, /\.ads-fp-taxa \{[^}]*font: 600 \.75rem\/1\.4 var\(--f-mono\);/);
  assert.doesNotMatch(CSSb, /\.ads-fp-taxa \{[^}]*\.6875rem/);
});

/* ---------- Ajustes de anúncios e formulário ---------- */
test("AB-104 · limite do radar com texto inválido para o salvamento", () => {
  assert.deepEqual(AC.lerLimitesRadar({ rd_ctrMin: "abc" }).erro, { campo: "rd_ctrMin", msg: "Use só números (ex.: 0,9) — ou deixe vazio para o padrão." }, "antes: virava «padrão» calado");
  assert.deepEqual(AC.lerLimitesRadar({ rd_ctrMin: "0,9%", rd_freqMax: "", rd_r2MinGasto: "30" }), { radar: { ctrMin: 0.9, r2MinGasto: 30 } });
  assert.equal(AC.lerLimitesRadar({ rd_freqMax: "50" }).erro.msg, "A frequência máxima vai de 1,5 a 20.");
  assert.deepEqual(AC.lerLimitesRadar({}), { radar: {} });
  assert.match(ADSCFGb, /const lim = lerLimitesRadar\(v\);/);
});
test("AB-242 · lerMetas: vazio, negativo e texto", () => {
  assert.deepEqual(AC.lerMetas({}), { cpa: null, cpaG: null, orc: null, fee: 0 });
  assert.equal(AC.lerMetas({ cpaAlvo: "-5" }).erro.campo, "cpaAlvo");
  assert.equal(AC.lerMetas({ cpaAlvoGoogle: "-1" }).erro.campo, "cpaAlvoGoogle");
  assert.equal(AC.lerMetas({ orcamento: "-100" }).erro.campo, "orcamento");
  assert.equal(AC.lerMetas({ fee: "-1" }).erro.campo, "fee");
  assert.deepEqual(AC.lerMetas({ cpaAlvo: "abc" }), { cpa: null, cpaG: null, orc: null, fee: 0 }, "texto na meta = sem meta (o campo moeda só aceita número)");
});
test("AB-100 · «Sincronizar agora» confere sozinho em 90 s", () => {
  const desde = Date.now() - 1000;
  const integ = [{ canal: "meta", ativo: true, ultimo_sync: new Date(desde + 500).toISOString(), status: "ok" },
    { canal: "google", ativo: true, ultimo_sync: new Date(desde - 864e5).toISOString(), status: "ok" }, { canal: "google2", ativo: true }];
  assert.equal(AC.resumoAposSync(integ, desde, () => "agora"), "Resultado da sincronização — Meta: lido agora · Google: ainda lendo.");
  assert.equal(AC.resumoAposSync([{ canal: "google", ativo: true, status: "erro — token expirado" }], desde), "Resultado da sincronização — Google: a leitura falhou (token expirado).");
  assert.equal(AC.resumoAposSync([{ canal: "meta", ativo: false }], desde), "Nenhuma plataforma ligada para sincronizar.");
  assert.equal(AC.CONFERIR_SYNC_MS, 90000);
  assert.match(ADSCFGb, /if \(tipo === "ciclo"\) conferirSync\(Date\.now\(\) - 5000\);/);
  assert.match(ADSCFGb, /if \(!alvo\.isConnected\) return;\n\s+try \{\n\s+const nova = await api\.rpcC\("nx_integracoes_status", \{\}\);/);
});
test("AB-107/AB-110/AB-190 · teste percebe «Ligada» mudada; só o resultado é vivo; desabilitado com descrição", () => {
  assert.match(ADSCFGb, /if \(!!v\._ativo !== !!st\.ativo\) \{ resultado\.classList\.add\("cfga-teste-aten"\);/);
  assert.match(ADSCFGb, /const statusEl = h\("p", \{ class: \["cfga-st", erro && "cfga-st-ruim", ok && "cfga-st-ok"\] \}, statusTxt\);/);
  assert.match(ADSCFGb, /const resultado = h\("p", \{ class: "cfga-teste", role: "status", "aria-live": "polite", hidden: true \}\);/);
  assert.match(ADSCFGb, /const dicaEl = h\("small", \{ id: `cfga-dica-\$\{canal\}`/);
  assert.match(ADSCFGb, /disabled: !st\.canal, "aria-describedby": `cfga-dica-\$\{canal\}`/);
});
test("AB-113/AB-117 · telefone obrigatório na ajuda; endereço da política explicado", () => {
  assert.match(ADSCFGb, /\["telefone", "WhatsApp com DDD — obrigatório"\]/);
  assert.doesNotMatch(ADSCFGb, /obrigatório se não houver e-mail/);
  const cod = AC.codigoExemplo({ url: "u", apikey: "k", chave: "c" });
  assert.match(cod, /<!-- troque \/politica-de-privacidade pelo endereço da política de privacidade do SEU site/);
  assert.match(ADSCFGb, /Troque o endereço «\/politica-de-privacidade» pelo da política de privacidade do seu site\./);
});

/* ---------- Rastreio (painel) ---------- */
test("AB-120/AB-133 · atualização automática pula com foco dentro e com a seção fora da tela", () => {
  assert.equal(RC.podeAtualizarSozinho({}), true);
  assert.equal(RC.podeAtualizarSozinho({ focoDentro: true }), false, "AB-120: quem está no filtro não perde o foco");
  assert.equal(RC.podeAtualizarSozinho({ visivel: false }), false, "AB-133: seção fora da tela");
  assert.equal(RC.podeAtualizarSozinho({ oculto: true }), false);
  assert.equal(RC.podeAtualizarSozinho({ ocupado: true }), false);
  assert.match(RCFGb, /io = new IntersectionObserver\(es => \{ visivel = es\.some\(e => e\.isIntersecting\); \}\); io\.observe\(sec\);/);
  assert.match(RCFGb, /focoDentro: typeof document !== "undefined" && dentro\(corpo, document\.activeElement\) \}\)\) return;/);
});
test("AB-136 · «Por campanha» com a % que casou", () => {
  const em = new Date().toISOString();
  const R = RC.resumoRastreio({ itens: [{ em, utm_campaign: "A", casou: true }, { em, utm_campaign: "A" }, { em, utm_campaign: "A" }, { em, utm_campaign: "B", casou: true }] });
  assert.deepEqual(R.campanhas.map(c => [c.nome, c.pct]), [["A", 33], ["B", 100]]);
  assert.match(RCFGb, /h\("th", \{ scope: "col", class: "num" \}, "% casou"\)/);
  assert.match(RCFGb, /h\("td", \{ colspan: "4", class: "campo-ajuda" \}/);
});
test("AB-206 · a seção do rastreio não carrega a folha da Agenda", () => {
  assert.doesNotMatch(RCFGb, /ui\.carregarCss\("agenda"\)/);
  assert.match(RCFGb, /const raiz = h\("div", \{ class: "rastc" \}\);/);
  for (const c of [".rastc {", ".rastc-codigo {", ".rastc-chave {", ".rastc-plataformas {", ".rastc-plataforma {", ".rastc-privacidade {"]) assert.ok(CSSb.includes(c), c);
});
test("AB-224 · «Testar» ensina o teste completo", () => {
  assert.match(RC.TESTE_COMPLETO, /^Para testar tudo: abra o site, toque no WhatsApp e envie a mensagem com o \[ref\]/);
  assert.match(RCFGb, /\+ ` \$\{TESTE_COMPLETO\}`;   \/\/ AB-224/);
});

/* ---------- rastreio.v2.js ---------- */
test("AB-123 · OrbitaRastreio.revogar() apaga a origem e para o rastreio; consentir() liga de novo", async () => {
  const removidosSessao = [];
  const m = montarV2({ search: "?utm_source=meta&utm_campaign=Implante", sessao: { getItem: () => null, setItem() {}, removeItem: k => removidosSessao.push(k) } });
  await esperar(5);
  assert.ok(m.guardadoAgora(), "a visita com campanha foi guardada");
  const antes = m.chamadas.length;
  assert.equal(m.api.revogar(), true);
  assert.equal(m.guardadoAgora(), null, "origem apagada do localStorage");
  assert.deepEqual(removidosSessao, ["orbita:rastreio:v1"]);
  assert.equal(JSON.stringify(m.api.dados()), "{}", "nem na memória");
  m.disparar("pointerover", el("a", { href: WA }));
  const ev = m.disparar("click", el("a", { href: WA }));
  await esperar(5);
  assert.equal(m.chamadas.length, antes, "nada mais é enviado"); assert.equal(ev.defaultPrevented, false, "o link segue como é");
  m.api.consentir();
  assert.ok(m.guardadoAgora(), "consentir() volta a guardar");
});
test("AB-125 · chave recusada: o motivo aparece no diagnóstico e no console de depuração", async () => {
  const m = montarV2({ search: "?orbita_debug=1", http: { ok: false, status: 401 } });
  assert.equal(await m.api.codigo(), null);
  const d = m.api.diagnostico();
  assert.equal(d.ultimoErro.status, 401); assert.equal(d.ultimoErro.motivo, "http");
  assert.ok(m.infos.some(t => /registro recusado/.test(t)), "antes: o catch engolia o motivo");
  assert.equal(montarV2().api.diagnostico().ultimoErro, null);
});
test("AB-128 · data-texto / ORBITA_RASTREIO.texto passam pela limpeza (controle fora, até 300)", () => {
  const ctrl = String.fromCharCode(7);
  const m = montarV2({ cfgJanela: { texto: `Olá${ctrl}site ${"x".repeat(400)}` } });
  const href = m.api.reescrever("https://wa.me/5512999990000", "K7Q2P");
  const texto = decodeURIComponent(href.split("text=")[1]);
  assert.ok(!texto.includes(ctrl), "antes: o caractere de controle ia cru para a mensagem");
  assert.match(texto, /^Olá site x+ \[ref K7Q2P\]$/);
  assert.ok(texto.length <= 300 + " [ref K7Q2P]".length, `antes: ${texto.length}`);
  assert.match(V2b, /texto: limpar\(cfgJanela\.texto \|\| attr\("texto"\) \|\| "Olá! Vim pelo site\.", 300\)/);
});

/* ============================================================ LOTE ads-3 (plano 1000b) ============================================================ */
const ADSc = ler("web/app/anuncios.js"), RELc = ler("web/app/relatorios.js"), CSSc = ler("web/app/relatorios.css"), ADSCFGc = ler("web/app/ads-config.js");
const RCFGc = ler("web/app/rastreio-config.js"), V2c = ler("web/rastreio.v2.js"), RLOGc = ler("web/app/rel-logica.js");

/* ---------- Ajustes de anúncios e formulário ---------- */
test("AB-003/AB-111 · salvar uma plataforma troca só o formulário dela; o toast oferece «Testar agora»", () => {
  const sub = ADSCFGc.slice(ADSCFGc.indexOf('form.addEventListener("submit", async ev => {'), ADSCFGc.indexOf("return form;"));
  assert.match(sub, /const novoForm = formCanal\(canal\);\n\s+form\.replaceWith\(novoForm\);\n\s+pintarStatusIntegracoes\(\);/);
  assert.doesNotMatch(sub, /pintarInteg\(\);/, "antes: pintarInteg() recriava os dois formulários e apagava o Google digitado");
  assert.match(sub, /acao: btTestar && !!v\._ativo \? \{ rotulo: "Testar agora", fn: \(\) => \{ btTestar\.focus\(\); btTestar\.click\(\); \} \} : null/);
});
test("AB-203 · trocar a chave no Formulário cita também o script de rastreio", () => {
  const t = AC.textoTrocaChave(RC.AVISO_TROCA);
  assert.match(t, /script de rastreio/); assert.match(t, /formulário do site/); assert.match(t, /Os dois só voltam/);
  assert.match(AC.TROCA_CHAVE_FORM, /script de rastreio/, "a reserva (sem o módulo) também cita os dois");
  assert.match(ADSCFGc, /texto = textoTrocaChave\(RC\.AVISO_TROCA\);/);
  assert.doesNotMatch(ADSCFGc, /texto: "A chave atual para de funcionar na hora: o formulário do site só volta/);
});
test("AB-101 · Metas e avisos não salvos: pergunta ao trocar de seção e ao fechar a aba", () => {
  assert.match(ADSCFGc, /addEventListener\("beforeunload", antesDeSair\)/);
  assert.match(ADSCFGc, /pendente: \(\) => sujo,\n\s+podeSair: \(\) => \(!sujo \? true : ui\.confirmar\(\{ titulo: "Sair sem salvar\?"/);
  assert.match(ADSCFGc, /limpar: \(\) => \{ if \(typeof removeEventListener === "function"\) removeEventListener\("beforeunload", antesDeSair\); clearTimeout\(tConferir\); \}/);
});
test("AB-106 · situação da integração em português; o status cru vai para «Detalhes técnicos»", () => {
  const e = AC.explicarStatusIntegracao("erro — invalid_grant (Token has been expired or revoked.)");
  assert.match(e.texto, /^a leitura falhou: o acesso expirou ou foi revogado/); assert.equal(e.tecnico, "invalid_grant (Token has been expired or revoked.)");
  assert.match(AC.explicarStatusIntegracao("erro: PERMISSION_DENIED").texto, /permissão/);
  assert.match(AC.explicarStatusIntegracao("erro — algo estranho").texto, /Testar conexão/);
  assert.deepEqual(AC.explicarStatusIntegracao("ok — 12 linhas"), { texto: "ok — 12 linhas", tecnico: "" });
  const s = AC.situacaoIntegracao({ canal: "meta", ultimo_sync: "2026-10-14T12:00:00Z", status: "erro — invalid_grant" }, () => "hoje às 09:00");
  assert.match(s.texto, /^Última leitura hoje às 09:00 · a leitura falhou: o acesso expirou/); assert.doesNotMatch(s.texto, /invalid_grant/);
  assert.deepEqual(AC.situacaoIntegracao({}), { texto: "Ainda não configurada.", tecnico: "" });
  assert.match(ADSCFGc, /h\("details", \{ class: "cfga-st-tecnico", hidden: !sit\.tecnico \}, h\("summary", \{\}, "Detalhes técnicos"\)/);
});
test("AB-114/AB-212 · formulário de exemplo: aviso anunciado (role=status, foco) e armadilha para robôs", async () => {
  const humano = rodarFormulario({ campos: { nome: "Ana", telefone: "12 99999-8888", aceite: "on" } });
  await humano.enviar();
  assert.equal(humano.pedidos.length, 1, "pessoa (campo escondido vazio, mais de 3 s) envia");
  const robo = rodarFormulario({ campos: { nome: "Bot", telefone: "12 99999-8888", aceite: "on", site: "http://spam" } });
  await robo.enviar();
  assert.equal(robo.pedidos.length, 0, "AB-212: campo escondido preenchido não envia"); assert.ok(robo.form.trocado, "e o robô vê um «Recebemos!»");
  const rapido = rodarFormulario({ campos: { nome: "Bot", telefone: "12 99999-8888", aceite: "on" }, rapido: true });
  await rapido.enviar();
  assert.equal(rapido.pedidos.length, 0, "AB-212: menos de 3 s entre abrir e enviar não envia");
  assert.match(humano.codigo, /<input name="site" tabindex="-1" autocomplete="off">/);
  assert.match(humano.codigo, /aviso\.setAttribute\("role", "status"\); aviso\.tabIndex = -1;/, "AB-114");
  assert.match(humano.codigo, /if \(aviso\.focus\) aviso\.focus\(\);/);
  assert.equal(AC.TEMPO_MIN_FORM_MS, 3000);
});
test("AB-191/AB-260 · confirmação do envio diz os números e não conta o mesmo número duas vezes", () => {
  const cfg = { waGestor: ["5512999998888"], waCliente: ["12999998888"] };
  const c = AC.confirmacaoEnvio({ tipo: "mensal", cfg });
  assert.match(c.texto, /^Ele sai agora no WhatsApp de 1 destino \(\(12\) 99999-8888\)/, "antes: «2 destinos» com o mesmo número");
  assert.match(AC.confirmacaoEnvio({ tipo: "diario", cfg: { waGestor: ["12999998888", "11988887777"] } }).texto, /2 destinos \(\(12\) 99999-8888 e \(11\) 98888-7777\)/);
  assert.deepEqual(AC.waDuplicados(["5512999998888"], ["12999998888", "11988887777"]), ["12999998888"]);
  assert.deepEqual(AC.waDuplicados(["5512999998888"], ["11988887777"]), []);
  assert.match(ADSCFGc, /const dups = waDuplicados\(novo\.waGestor, novo\.waCliente\);/);
});
test("AB-216 · «Atualizar situação» diz se houve leitura nova", () => {
  const antes = [{ canal: "meta", ativo: true, ultimo_sync: "2026-10-14T12:00:00Z", status: "ok" }, { canal: "google", ativo: true, ultimo_sync: "2026-10-14T12:00:00Z", status: "ok" }];
  const depois = [{ canal: "meta", ativo: true, ultimo_sync: "2026-10-14T13:02:00Z", status: "ok" }, { canal: "google", ativo: true, ultimo_sync: "2026-10-14T12:00:00Z", status: "ok" }];
  assert.equal(AC.mudancaSituacao(antes, depois, () => "às 10:02"), "Meta leu às 10:02 (leitura nova) · Google: sem leitura nova.");
  assert.match(AC.mudancaSituacao(antes, [{ ...depois[0], status: "erro — x" }], () => "às 10:02"), /^Meta: a leitura falhou às 10:02\.$/);
  assert.match(ADSCFGc, /statusLeitura\.textContent = `Situação consultada às \$\{hh\}: \$\{mudancaSituacao\(antes, integ/);
});
test("AB-102 · rótulos do valor por serviço acompanham o nome digitado", () => {
  assert.deepEqual(AC.rotulosTicket("Implante"), { valor: "Valor de Implante em reais", remover: "Remover Implante" });
  assert.deepEqual(AC.rotulosTicket("", "Serviço"), { valor: "Valor de serviço em reais", remover: "Remover serviço" });
  assert.match(ADSCFGc, /nome\.addEventListener\("input", \(\) => \{ const r = rotulosTicket\(nome\.value, servicoRot\); valor\.setAttribute\("aria-label", r\.valor\); x\.setAttribute\("aria-label", r\.remover\); \}\);/);
});
test("AB-108 · Ajustes de anúncios solta os leads do nx_dados logo após a carga", () => {
  const i = ADSCFGc.indexOf("const servicosSug = servicosUsados("), j = ADSCFGc.indexOf("  dados = null;\n");
  assert.ok(i > 0 && j > i, "sugestões e gasto de ontem saem ANTES de soltar os dados");
  assert.ok(ADSCFGc.indexOf("gastoOntem = M7.consolidar") < j);
  assert.match(ADSCFGc, /h\("datalist", \{ id: idSug \}, servicosSug\.map\(/);
  assert.equal((ADSCFGc.slice(j).match(/dados && dados\./g) || []).length, 0, "depois de soltar, ninguém lê os dados");
});
test("AB-118 · contato de teste com atalho «Ver no CRM» filtrado pelo nome", () => {
  assert.equal(AC.linkCrmTeste(), `#/crm?busca=${encodeURIComponent("Teste do formulário (pode excluir)")}`);
  assert.match(ADSCFGc, /st\.append\(" ", h\("a", \{ class: "rel-link", href: linkCrmTeste\(\) \}, "Ver no CRM"\)\)/);
  assert.match(ADSCFGc, /nome: NOME_TESTE_FORM, email:/);
});

/* ---------- rastreio (painel) ---------- */
test("AB-009 · o total do painel é «Registros do site» até o servidor separar o clique", () => {
  assert.deepEqual(RC.kpiCliques({ cliques: 7, cliquesReais: null }).rotulo, "Registros do site");
  assert.match(RC.kpiCliques({ cliques: 7 }).ajuda, /visitas vindas de campanha/);
  assert.deepEqual(RC.kpiCliques({ cliques: 7, cliquesReais: 3 }), { rotulo: "Cliques no WhatsApp", valor: 3, ajuda: "Toques no botão do WhatsApp do site com o script ativo." });
  assert.equal(RC.resumoRastreio({ itens: [], totais: { cliques: 5, cliques_reais: 2 } }).totais.cliquesReais, 2);
  assert.match(RCFGc, /ui\.kpi\(kpiCliques\(T\)\)/);
});
test("AB-134 · hora dos cliques com «hoje às» / «ontem às»", () => {
  const agora = Date.parse(`${HOJE}T18:00:00Z`);                        // 15:00 em SP
  assert.equal(RC.quandoCurto(`${HOJE}T12:12:00Z`, agora), "hoje às 09:12");
  assert.equal(RC.quandoCurto(new Date(agora - 864e5).toISOString(), agora), "ontem às 15:00");
  assert.match(RC.quandoCurto(new Date(agora - 5 * 864e5).toISOString(), agora), /^\d\d\/\d\d às 15:00$/);
  assert.equal(RC.quandoCurto("lixo"), "—");
});
test("AB-204/AB-129/AB-251 · banner de cookies explicado; rótulo da chave ligado ao campo; motivo pendente claro", () => {
  const sn = RC.snippetConsentimento("a".repeat(48));
  assert.match(sn, /data-consentimento="aguardar" defer><\/script>/); assert.match(sn, /window\.OrbitaRastreio && window\.OrbitaRastreio\.consentir\(\);/);
  assert.match(RCFGc, /h\("summary", null, "Seu site tem banner de cookies\?"\)/);
  assert.match(RCFGc, /h\("label", \{ for: "rastc-chave-campo" \}, "Chave desta empresa"\)/);
  assert.doesNotMatch(RCFGc, /"aria-label": "Chave pública de instalação"/);
  assert.equal(RC.rotuloMotivo("pendente"), "a conversa chegou; o negócio ainda vai ser criado");
  assert.equal(RC.rotuloMotivo("sem_negocio"), "a conversa chegou; o negócio ainda vai ser criado");
});

/* ---------- rastreio.v2.js ---------- */
test("AB-121 · ttclid, msclkid e utm_id são guardados (e citados na privacidade)", async () => {
  const m = montarV2({ search: "?ttclid=TT1&msclkid=MS1&utm_id=123" });
  assert.equal(JSON.stringify(m.api.capturar("?ttclid=x&MSCLKID=y&utm_id=z")), JSON.stringify({ ttclid: "x", msclkid: "y", utm_id: "z" }), "antes: {}");
  await esperar(5);
  const g = m.guardadoAgora();
  assert.equal(g.d.ttclid, "TT1"); assert.equal(g.d.msclkid, "MS1"); assert.equal(g.d.utm_id, "123");
  assert.match(RC.textoPrivacidade(), /ttclid, msclkid/); assert.match(RC.textoPolitica("X"), /utm_id\) e os identificadores de clique de anúncios \(gclid, gbraid, wbraid, fbclid, ttclid e msclkid\)/);
  assert.match(V2c, /AB-121/);
});
test("AB-124 · com o GPC ligado depois, a origem guardada antes é apagada", () => {
  const removidosSessao = [];
  const m = montarV2({ guardado: { v: 1, t: Date.now(), d: { utm_source: "meta" }, c: null }, navegador: { globalPrivacyControl: true },
    sessao: { getItem: () => null, setItem() {}, removeItem: k => removidosSessao.push(k) } });
  assert.equal(m.guardadoAgora(), null, "antes: ficava no localStorage até 30 dias");
  assert.deepEqual(removidosSessao, ["orbita:rastreio:v1"]);
  assert.equal(m.api.ativo(), false);
  const sem = montarV2({ guardado: { v: 1, t: Date.now(), d: { utm_source: "meta" }, c: null }, navegador: { globalPrivacyControl: true }, cfgJanela: { gpc: "ignorar" } });
  assert.ok(sem.guardadoAgora(), "data-gpc=ignorar mantém");
});
test("AB-126 · OrbitaRastreio.link() desliga o relógio do limite quando o código chega", async () => {
  const pend = new Map(); let seq = 0;
  const relogio = { set: (fn, ms) => { const id = ++seq; pend.set(id, ms); setTimeout(() => { if (pend.has(id)) { pend.delete(id); fn(); } }, 0); return id; }, clear: id => { pend.delete(id); } };
  // o registro responde na hora; o relógio falso adia o limite para depois da corrida
  const m = montarV2({ relogio });
  const href = await m.api.link("https://wa.me/5512999990000");
  assert.match(decodeURIComponent(href), /\[ref K7Q2P\]$/);
  assert.ok(![...pend.values()].includes(1500), "antes: o setTimeout de cfg.espera ficava pendurado");
  assert.match(V2c, /var soltar = function \(\) \{ if \(relogio != null\) \{ janela\.clearTimeout\(relogio\); relogio = null; \} \};/);
});

/* ---------- rel-logica ---------- */
test("AB-015 · extras do Atendimento com milhar e plural", () => {
  const k = L.kpisAtendimento({ kpis: { msgs_in: 1234, msgs_out: 1, aguardando_agora: 2000 } });
  assert.equal(k.find(x => x.id === "novas").extra, "1.234 mensagens recebidas");
  assert.equal(k.find(x => x.id === "resolvidas").extra, "1 mensagem enviada");
  assert.equal(k.find(x => x.id === "abertas_agora").extra, "2.000 aguardando resposta");
  assert.equal(L.kpisAtendimento({ kpis: {} }).find(x => x.id === "novas").extra, "0 mensagens recebidas");
});
test("AB-053/AB-077 · listas cortadas dizem quantos havia", () => {
  const rel = Array.from({ length: 20 }, (_, k) => ({ tipo: "diario", referencia: dia(k + 1), texto: "x" }));
  const l = L.listaRelatorios(rel);
  assert.equal(l.length, 12); assert.equal(l.total, 20);
  assert.equal(L.notaCorte(l.length, l.total), "Mostrando os 12 relatórios mais recentes de 20.");
  assert.equal(L.notaCorte(5, 5), "");
  assert.deepEqual(Object.keys(l).length, 12, "total não enumerável (o resto do código vê só a lista)");
  const alertas = Array.from({ length: 15 }, (_, k) => ({ regra: "r1", chave: `r1|C${k}`, severidade: "alerta", criado_em: new Date(Date.now() - k * 36e5).toISOString() }));
  const R = L.montarRadar(null, { alertas }, Date.now());
  assert.equal(R.registro.length, 10); assert.equal(R.registroTotal, 15);
  assert.equal(L.notaCorte(R.registro.length, R.registroTotal, { um: "aviso", varios: "avisos" }), "Mostrando os 10 avisos mais recentes de 15.");
  assert.match(ADSc, /const corteLog = L\.notaCorte\(R\.registro\.length, R\.registroTotal, \{ um: "aviso", varios: "avisos" \}\);/);
  assert.match(ADSc, /const corteRel = L\.notaCorte\(lista\.length, lista\.total\);/);
});
test("AB-079 · regra que dispara por falta de leitura: ressalva no episódio e fora do selo", () => {
  const M = { CAMP: { C1: { plat: "meta" }, C2: { plat: "google" } } };
  const parados = new Set(["meta"]);
  assert.equal(L.leituraParadaAfeta(M, "r2|C1", parados), "meta");
  assert.equal(L.leituraParadaAfeta(M, "r2|C2", parados), null, "o Google lê normal");
  assert.equal(L.leituraParadaAfeta(M, "r1|C1", parados), null, "custo alto não é falta de leitura");
  assert.equal(L.leituraParadaAfeta(M, "r5|conta", parados), "conta");
  assert.equal(L.leituraParadaAfeta(M, "r6|meta", parados), "meta");
  assert.equal(L.leituraParadaAfeta(M, "r2|C1", new Set()), null);
  assert.match(RLOGc, /selo: seloRadar\(atuaisSelo, est\.erros\.length\)/);
  assert.match(ADSc, /e\.ressalva \? h\("p", \{ class: "rel-nota ads-al-ressalva" \}/);
});
test("AB-083 · ranking com reserva reordena a mesma base (resultado igual ao «cpa» calculado direto)", () => {
  const metricas = [];
  for (let k = 1; k <= 10; k++) metricas.push(met(dia(k), { a: "A1", an: "Vídeo", conv: 4 }), met(dia(k), { a: "A2", an: "Foto", g: 50, conv: 3 }));
  const M = montarDe({ metricas });
  const r = L.rankingCriativos(M, { dias: 30, reserva: true });
  const cpa = L.rankingCriativos(M, { dias: 30, por: "cpa" });
  assert.equal(r.automatico, true); assert.equal(r.por, "cpa");
  assert.deepEqual(r.lista.map(x => [x.k.id, x.pos, x.barra]), cpa.lista.map(x => [x.k.id, x.pos, x.barra]));
  assert.equal(L.rankingCriativos(M, { dias: 30, por: "receita" }).automatico, undefined, "sem reserva, sem troca");
  assert.doesNotMatch(RLOGc, /const r = rankingCriativos\(M, \{ dias, plat, por: "receita", n \}\);/, "antes: dois rankings inteiros");
});
test("AB-155 · leitura atrasada há horas não é «a qualquer momento»", () => {
  const agora = Date.parse(`${HOJE}T20:00:00Z`);                        // 17:00 em SP
  assert.equal(L.proximaLeitura(agora - 5 * 36e5, agora), "leitura atrasada desde 12:00 — o Órbita tenta de novo a cada hora");
  assert.equal(L.proximaLeitura(agora - 70 * 6e4, agora), "próxima leitura a qualquer momento", "até 2 h continua como antes");
  assert.match(L.proximaLeitura(agora - 30 * 36e5, agora), /^leitura atrasada desde \d\d\/\d\d \d\d:\d\d — /);
});
test("AB-175 · origem fora da tabela aparece legível", () => {
  assert.equal(L.nomeOrigem("tiktok_ads"), "Tiktok ads");
  assert.equal(L.nomeOrigem("tiktok_ads", "meta"), "Tiktok ads · Meta");
  assert.equal(L.nomeOrigem("site"), "Site");
});
test("AB-200 · integração pausada aparece no detalhe da pílula (o nível não muda)", () => {
  const agora = Date.parse(`${HOJE}T15:00:00Z`);
  const integ = [{ canal: "google", ativo: true, ultimo_sync: new Date(agora - 20 * 6e4).toISOString(), status: "ok — 3 linhas" },
    { canal: "meta", ativo: false, ultimo_sync: new Date(agora - 864e5).toISOString(), status: "ok" }];
  const e = L.estadoIntegracao(integ, [], agora);
  assert.equal(e.nivel, "ok");
  const d = L.detalhePilula(e, agora);
  assert.equal(d.length, 2, "antes: o Meta pausado sumia");
  assert.equal(d[1].nome, "Meta"); assert.equal(d[1].estado, "pausada"); assert.match(d[1].texto, /^pausada — sem leituras até ligar de novo \(última ontem às /);
  assert.equal(Object.keys(e).includes("pausadas"), false, "o estado segue igual ao do clássico campo a campo");
});
test("AB-194 · custo por agendamento e por fechamento também no período anterior", () => {
  const M = montarDe({ metricas: [met(dia(3)), met(dia(40))] });
  const P = L.numerosPeriodo(M, { dias: 30 });
  assert.ok("custoAgendamentoAnt" in P && "custoFechamentoAnt" in P);
  assert.equal(P.custoAgendamentoAnt, null, "sem agendamento antes: sem base");
  assert.match(ADSc, /P\.custoAgendamentoAnt != null \? chip\(P\.custoAgendamento, P\.custoAgendamentoAnt, "baixo"\) : null/);
});
test("AB-096 · «Por que difere» de Vendas escolhe as frases por id", () => {
  const f = L.porQueDifere("datas", "aparelho");
  assert.equal(f.length, 2); assert.match(f[0], /data em que foram criados/); assert.match(f[1], /Aparelho desconectado/);
  assert.deepEqual(L.POR_QUE_DIFERE, Object.values(L.POR_QUE_DIFERE_ID));
  assert.match(RELc, /L\.porQueDifere\("datas", "aparelho"\)/); assert.doesNotMatch(RELc, /POR_QUE_DIFERE\.slice\(-2\)/);
});

/* ---------- Relatórios ---------- */
test("AB-014/AB-088/AB-090/AB-093 · KPIs com 1 casa, valor anterior visível, rosca com milhar e plural na origem", () => {
  assert.equal(RL.fmtPct(12.345678), "12,3%"); assert.equal(RL.fmtDias(12.345678), "12,3 dias"); assert.equal(RL.fmtDias(1), "1 dia");
  assert.equal(RL.fmtPct(null), "—"); assert.equal(RL.fmtDias(""), "—"); assert.equal(RL.fmtPct(40), "40%");
  assert.equal(RL.notaAnterior(1500, v => `R$ ${v}`), "antes: R$ 1500"); assert.equal(RL.notaAnterior(null), "vs. período anterior");
  assert.doesNotMatch(RELc, /title: `antes: /, "AB-088: antes só no title");
  assert.match(RELc, /centro: \{ valor: int\(tot\), rotulo: fem \? \(tot === 1 \? "perdida"/);
  assert.equal(RL.resumoOrigens([{ rotulo: "WhatsApp", criados: 1, ganhos: 1 }, { rotulo: "Site", criados: 1500, ganhos: 2 }], N.int), "Por origem: WhatsApp 1 criado e 1 ganho; Site 1.500 criados e 2 ganhos");
});
test("AB-084 · clicar no período já escolhido não recarrega", () => {
  assert.match(RELc, /if \(P\.preset === valor\) return;            \/\/ plano 1000b · AB-084/);
});

/* ---------- Anúncios ---------- */
test("AB-029 · a taxa do funil por plataforma diz o que divide fora do title", () => {
  const dados = [{ plat: "meta", nome: "Meta", gasto: 50, receita: 0, max: 10, etapas: [{ id: "conversas", rotulo: "Conversas no CRM", v: 10 }, { id: "agendadas", rotulo: "Agendaram", v: 4 }], taxas: [{ de: "conversas", para: "agendadas", pct: 40 }] }];
  const el = A.criarFunilPlataformas({ h, dados, fmtInt: N.int, fmtMoeda: N.brl0 });
  const taxa = el.querySelectorAll(".ads-fp-taxa")[1];   // a 1ª etapa tem só o espaço vazio
  assert.equal(taxa.querySelector(".sr-only").textContent, " — Agendaram ÷ Conversas no CRM");
  assert.equal(taxa.querySelector(".ads-fp-taxa-de").textContent, "de Conversas no CRM");
  assert.match(CSSc, /@media \(max-width: 760px\) \{ \.ads-fp-taxa \{ flex-wrap: wrap; \} \.ads-fp-taxa-de \{ display: inline; \} \}/);
});
test("AB-033 · o ⋮ do celular aparece para todos com «Imprimir»", () => {
  assert.deepEqual(A.itensMaisAcoes({ gestor: false }).map(i => i.rotulo), ["Imprimir ou salvar PDF"]);
  assert.deepEqual(A.itensMaisAcoes({ gestor: true }).map(i => i.rotulo), ["Imprimir ou salvar PDF", "Ajustes de anúncios", "Painel de apresentação"]);
  const i = ADSc.indexOf('const maisAcoes = h("button"'), j = ADSc.indexOf("if (eGestor(ctx)) {", ADSc.indexOf("let linkPainel = null;"));
  assert.ok(i > j && ADSc.slice(j, i).includes("\n  }\n"), "o ⋮ fica fora do if (eGestor)");
});
test("AB-038 · a trilha do funil não corta em 100% quando a etapa contou mais", () => {
  const pc = v => `${Math.round(v)}%`;
  assert.equal(A.textoTaxaTrilha(150, "das conversas", pc, L.taxaFunilTxt), "150% · mais que a etapa anterior contou");
  assert.equal(A.textoTaxaTrilha(40, "das conversas", pc, L.taxaFunilTxt), "40% das conversas");
  assert.equal(A.textoTaxaTrilha(null, "x", pc), "");
  assert.doesNotMatch(ADSc, /N\.pc\(Math\.min\(p\.taxa, 100\), 0\)/);
});
test("AB-005/AB-047/AB-187 · silenciar: um aviso só, cfg relido antes de gravar e «Desfazer»", () => {
  const f = ADSc.slice(ADSc.indexOf("async function silenciarAlerta("), ADSc.indexOf("function alertaEpisodio("));
  // (revisão 1000b: rpcC — o nx_dados exige p_cliente; com rpc() a releitura falhava calada e o silêncio do outro gestor se perdia)
  assert.match(f, /const fresco = await ctx\.api\.rpcC\("nx_dados", \{ p_dias: 1 \}\); if \(fresco && fresco\.cliente && fresco\.cliente\.cfg\) atual = fresco\.cliente\.cfg\.silenciados;/);
  assert.match(f, /const mapa = mapaSilenciados\(atual, chave, periodo/);
  assert.match(f, /desfazer: periodo && !desfazendo \? \(\) => silenciarAlerta\(M, dados, chave, null, null, \{ desfazendo: true \}\) : null/);
  assert.match(f, /await recarregar\(true, \{ silencioso: true \}\);/);
  assert.match(ADSc, /if \(forcar && !silencioso\) ui\.toast\("Números atualizados\."/);
});
test("AB-050/AB-055/AB-197/AB-248 · prévia: limite do WhatsApp, corpo focável, legenda completa e destinos", () => {
  assert.match(A.notaLimiteWa("x".repeat(5000), N.int), /^Este relatório passa do limite do WhatsApp \(5\.000 caracteres; o limite é 4\.096\)/);
  assert.equal(A.notaLimiteWa("curto"), "");
  assert.match(ADSc, /h\("div", \{ class: "ads-fone-corpo", tabindex: "0", role: "region", "aria-label": "Texto do relatório" \}, bolha\)/);
  for (const t of ["✓ a API aceitou", "✓✓ chegou", "✓! saiu para parte", "◷ gerado, ainda não enviado", "! não saiu"]) assert.ok(A.LEGENDA_TIQUES.includes(t), t);
  assert.match(ADSc, /h\("p", \{ class: "rel-nota" \}, LEGENDA_TIQUES\)\),   \/\/ AB-197/);
  const cfg = { waCliente: ["12999998888"], waGestor: ["5512999998888", "11988887777"] };
  assert.deepEqual(A.destinosRelatorio("mensal", cfg), ["(12) 99999-8888", "(11) 98888-7777"]);
  assert.deepEqual(A.destinosRelatorio("diario", cfg), ["(12) 99999-8888", "(11) 98888-7777"]);
  assert.deepEqual(A.destinosRelatorio("diario", { waCliente: ["12999998888"] }), []);
  assert.match(ADSc, /eGestor\(ctx\) && destinosRelatorio\(it\.tipo/);
});
test("AB-066/AB-065/AB-181 · balde com caminho, um nome só no vazio e «Recarregando…»", () => {
  assert.match(ADSc, /h\("a", \{ class: "rel-link", href: "#\/config\/rastreio" \}, "Ver os parâmetros de URL dos anúncios"\)/);
  assert.doesNotMatch(ADSc, /Configurações → Anúncios/);
  assert.match(ADSc, /if \(rotAtualizar\) rotAtualizar\.textContent = "Recarregando…";/);
  assert.match(ADSc, /btnAtualizar\.disabled = false; btnAtualizar\.removeAttribute\("aria-busy"\);/);
});
test("AB-178 · filtros do radar com a contagem", () => {
  const sem = { contagens: { critico: 1, alerta: 1, info: 0 }, cor: "ruim", frase: "x", acao: "y" };
  const s = A.criarSemaforoRadar({ h, semaforo: sem, contagem: { ativos: 2, resolvidos: 5 } });
  assert.deepEqual(s.elemento.querySelectorAll(".rel-seg-b").map(b => b.textContent), ["Todos", "Ativos (2)", "Resolvidos (5)"]);
  const sem0 = A.criarSemaforoRadar({ h, semaforo: sem });
  assert.deepEqual(sem0.elemento.querySelectorAll(".rel-seg-b").map(b => b.textContent), ["Todos", "Ativos", "Resolvidos"], "sem contagem, como antes");
  assert.match(ADSc, /contagem: \{ ativos: L\.filtrarRadar\(ordenados, "ativos"\)\.length, resolvidos: L\.filtrarRadar\(ordenados, "resolvidos"\)\.length \}/);
});
const linhaCamp = (id, nome, o = {}) => ({ c: { id, nome, plat: "meta" }, t: { gasto: 100, conversoes: 12, cpa: 8 }, k: { conversas: 1, agendadas: 0, fecharam: 0, receita: 0 }, roas: null, ...o });
test("AB-031/AB-057/AB-207 · comparação: botão com aria-pressed, busca sem relógio solto e aviso de quem saiu", () => {
  const avisos = [];
  const p = A.criarPainelCampanhas({ h, linhas: [linhaCamp("C1", "Implante")], estado: { comparacao: ["C9"], nomesComparacao: { C9: "Pausada" } }, aoAviso: t => avisos.push(t) });
  assert.deepEqual(avisos, ["«Pausada» saiu da comparação: sem investimento neste período."], "AB-207: antes saía em silêncio");
  const b = p.botaoComparar(linhaCamp("C1", "Implante"));
  assert.equal(b.getAttribute("aria-pressed"), "false");
  b.click();
  assert.equal(b.getAttribute("aria-pressed"), "true", "AB-031");
  assert.equal(b.getAttribute("title"), "Tirar Implante da comparação");
  b.click(); assert.equal(b.getAttribute("aria-pressed"), "false");
  assert.equal(typeof p.destruir, "function");
  assert.doesNotThrow(() => p.destruir());
  assert.match(ADSc, /function render\(\) \{\n\s+clearTimeout\(tBusca\);/);
  assert.match(ADSc, /graficos\.push\(\{ destruir: \(\) => p\.destruir\(\) \}\);/);
  assert.match(ADSc, /S\.comparacaoCamp = \[\.\.\.estadoCamp\.comparacao\];/);
});
test("AB-039/AB-043 · plural no resumo da tendência; dica da barra com a palavra da plataforma", () => {
  assert.equal(A.resumoTendencia("Últimos 30 dias", { g: 10, c: 1, ag: 1 }, { brl0: v => `R$ ${v}`, int: String }), "Últimos 30 dias. Tendência: R$ 10 investidos, 1 conversa e 1 agendamento registrados no CRM");
  const conv = (plat, n) => `${n} ${plat === "google" ? "conversões" : "conversas"}`;
  const bar = A.criarBarrasCampanhas({ h, linhas: [linhaCamp("C1", "Implante")], fmtMoeda: v => `R$ ${v}`, fmtInt: String, convPlat: conv });
  assert.match(bar.elemento.querySelector(".ads-cb-item").getAttribute("title"), /R\$ 100 · 12 conversas · 0 agendamentos/);
  assert.match(ADSc, /criarBarrasCampanhas\(\{ h, linhas, fmtMoeda: N\.brl0, fmtInt: N\.int, nomePlat: L\.nomePlat, convPlat,/);
});
test("AB-062/AB-071/AB-074 · modo do calor com estado; ordem do ranking por cliente; frequência do Google «não se aplica»", () => {
  assert.match(ADSc, /btModo\.setAttribute\("aria-pressed", String\(modo === "hora"\)\);/);
  assert.match(ADSc, /"aria-controls": alvo\.id/);
  assert.equal(A.chaveRank("cli-A"), "nx-app-ads-rank:cli-A");
  assert.doesNotMatch(ADSc, /lerLocal\("nx-app-ads-rank"|gravarLocal\("nx-app-ads-rank"/);
  assert.match(ADSc, /gravarLocal\(chaveRank\(ctx\.cliente\.id\), v\)/);
  assert.match(ADSc, /k\.plat === "google" \? h\("span", \{ title: "O Google não informa frequência" \}, "não se aplica"\)/);
});
test("AB-219/AB-222/AB-225/AB-245 · prévia de outro dia, link para a regra, diário sugerido e ranking que abre a campanha", () => {
  assert.deepEqual(A.diasPreviaDiario(100), [100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87]);
  assert.deepEqual(A.diasPreviaDiario(2), [2, 1, 0]);
  assert.match(ADSc, /texto: \(\) => M\.relDiario\(i\) \}\);/);
  assert.equal(A.idRegra("r1"), "ads-regra-r1");
  assert.match(ADSc, /h\("li", \{ id: idRegra\(r\.id\), tabindex: "-1" \}/);
  assert.match(ADSc, /on: \{ click: \(\) => irParaRegra\(e\.regra\) \} \}, "Ver a regra"\)/);
  assert.equal(A.diarioSugerido(3000, 2500, 5), 100); assert.equal(A.diarioSugerido(3000, 3100, 5), 0); assert.equal(A.diarioSugerido(3000, 100, 0), null);
  // plano 1500c: a frase do ritmo saiu para textoRitmo (AC-080) — o diário sugerido continua lá
  assert.match(ADSc, /const sug = diarioSugerido\(orc, m\.gasto, m\.restam\);/);
  assert.match(ADSc, /Orçamento diário sugerido: \$\{brl\(sug\)\}/);
  assert.match(ADSc, /h\("button", \{ type: "button", class: "ads-rank-abrir", "aria-haspopup": "dialog"/);
  assert.match(CSSc, /\.ads-rank-abrir \{ all: unset;/);
});
test("AB-257 · o aparelho «ok» tem regra própria", () => {
  assert.match(CSSc, /\.ads-aparelho-ok \{ border-left-color: var\(--c-ok\); \}/);
  assert.match(CSSc, /\.ads-aparelho-ok \.ads-ap-luz \{ background: var\(--c-ok\); \}/);
});

test("revisão 1000b · rastreio: aquecimento (visita) não entra em campanhas, domínios nem motivos; «% casou» nunca passa de 100", () => {
  const em = new Date().toISOString();
  const itens = [
    { em, utm_campaign: "X", pagina: "https://site.com.br/", evento: "clique", casou: true },
    { em, utm_campaign: "X", pagina: "https://site.com.br/", evento: "aquecimento", casou: true },
    { em, utm_campaign: "X", pagina: "https://site.com.br/", evento: "aquecimento" },
    { em, utm_campaign: "X", pagina: "https://site.com.br/" },   // v1 antiga: sem evento = clique
  ];
  const R = RC.resumoRastreio({ itens, totais: { cliques: 2, casados: 3 } });
  const x = R.campanhas.find(c => c.id === "X" || c.nome === "X");
  assert.equal(x.cliques, 2, "antes: 4 (as visitas contavam como clique)");
  assert.equal(R.hosts[0].cliques, 2);
  assert.equal(R.motivos.reduce((s, m) => s + m.n, 0), 2);
  assert.equal(R.visitas, 2);
  assert.equal(R.totais.pct, 100, "casados 3 ÷ cliques 2 ficava 150%");
});
