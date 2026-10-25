/* ============================================================
   ÓRBITA — plano 2000d, frente ads (Anúncios, Relatórios, Rastreio) · lotes ads-d1..ads-d4
   node --test testes/plano2000d-ads.teste.mjs      (Node puro, sem rede e sem navegador)
   Peças puras de anuncios.js / ads-config.js / relatorios.js / rel-logica.js / rastreio-config.js; peças de tela num DOM mínimo (o
   mesmo do plano 1500c); o script do site (web/rastreio.v3.js, ainda não publicado) roda num contexto vm com janela falsa. O que só
   existe dentro do montar() das telas é conferido pela fonte. Cada teste falharia no código anterior ao lote.
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
/** o criador de elementos da tela (mesmo contrato do G.criarH), sobre o DOM mínimo */
function hh(tag, attrs = {}, ...filhos) {
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
const RCFG = ler("web/app/rastreio-config.js"), V3 = ler("web/rastreio.v3.js"), V2 = ler("web/rastreio.v2.js"), RLOG = ler("web/app/rel-logica.js");
const MARCA = /plano 2000d · D[AR]-\d+/;   // marca de cada mudança (REGRAS)

/* ---------- fixtures (relativas a hoje em SP) ---------- */
const HOJE = N.hojeSP();
const dia = n => { const d = N.meioDia(HOJE); d.setDate(d.getDate() - n); return N.isoDe(d); };
const met = (d, o = {}) => ({ p: "meta", d, n: "anuncio", c: "C1", cn: "Campanha Meta", a: "A1", an: "Vídeo", g: 30, imp: 1000, alc: 800, cli: 20, conv: 2, freq: 1.2, ...o });
const montarDe = ({ metricas = [], leads = [], cliente = {} } = {}) =>
  N.montar(N.datasetDeLinhas({ metricas, leads, hoje: HOJE, dias: 130, cliente: { nome: "Clínica Teste", cfg: {}, ...cliente } }));
const esperar = ms => new Promise(r => setTimeout(r, ms));
const serie = (de, ate, o = {}) => Array.from({ length: ate - de + 1 }, (_, k) => met(dia(de + k), o));
const lead = (o = {}) => ({ id: `l${Math.random()}`, plataforma: "meta", campanha_ext: "C1", anuncio_ext: "A1", etapa: "conversa", data_conversa: dia(3), ...o });
const brl0 = v => `R$ ${Math.round(v)}`, brl = v => `R$ ${(Math.round(v * 100) / 100).toFixed(2).replace(".", ",")}`, int = v => String(Math.round(v));
const isoMenos = ms => new Date(Date.now() - ms).toISOString();
const textoDe = n => (n ? n.textContent : "");

test("marca · cada arquivo da frente ads traz o comentário «plano 2000d · DA-…»", () => {
  for (const [nome, src] of Object.entries({ ADS, REL, ADSCFG, RCFG, RLOG, CSS, V3 })) assert.ok(MARCA.test(src), `${nome} sem a marca`);
});

/* ============================================================ LOTE ads-d1 */
test("DR-259 · palavraAgenda usa o vocabulário da empresa e cai no fixo só sem ele", () => {
  assert.deepEqual({ ...L.palavraAgenda("odonto", { compromisso: "Sessão", compromissos: "Sessões" }) }, { um: "sessão", varios: "sessões" });
  assert.deepEqual({ ...L.palavraAgenda("oficina", { compromisso: "Revisão" }) }, { um: "revisão", varios: "revisões" });
  assert.deepEqual({ ...L.palavraAgenda("loja") }, { um: "entrega", varios: "entregas" }, "sem vocabulário: o fixo de antes");
});
test("DA-125/DA-180 · orçamento esgotado no dia 3 diz que acabou (antes «cedo para projetar»)", () => {
  const t = A.textoRitmo({ restam: 28, cedo: true, gasto: 1100, proj: 11000, pass: 3, diasMes: 31 }, 1000, { brl0, brl });
  assert.match(t, /já foi todo usado/); assert.doesNotMatch(t, /Cedo para projetar/);
  assert.match(A.textoRitmo({ restam: 28, cedo: true, gasto: 100, proj: 1000, pass: 3 }, 1000, { brl0, brl }), /^Cedo para projetar/);
});
test("DA-126/DA-181 · equipe avisada pelo campo da plataforma — «meta de custo» num alerta do Google não é Meta", () => {
  const al = o => ({ regra: "integracao", enviado_em: isoMenos(60e3), criado_em: isoMenos(60e3), ...o });
  const google = al({ chave: "integracao|google", mensagem: "Google acima da meta de custo" });
  assert.equal(A.equipeAvisada([google], [{ canal: "meta" }]), false, "antes: a regex achava «meta» na mensagem");
  assert.equal(A.equipeAvisada([google], [{ canal: "google" }]), true);
  assert.equal(A.equipeAvisada([al({ plataforma: "google", chave: "integracao", mensagem: "meta de custo" })], [{ canal: "meta" }]), false);
  assert.equal(A.canalDoAlerta({ chave: "x", mensagem: "meta" }), null, "sem campo nem chave: vale o texto, como antes");
});
test("DA-127/DA-182/DA-153/DA-152/DA-355/DA-334/DA-151 · slides: plural, vertical, retorno na abertura, antes × agora, campeão e capa", () => {
  const P = { t: { gasto: 1000 }, c: { conversas: 1, agendadas: 1, fecharam: 2, receita: 5000 }, ta: { gasto: 800 }, ca: { conversas: 3, agendadas: 2, receita: 2000 },
    retorno: 5, rotulo: { titulo: "Últimos 30 dias", antes: "os 30 dias antes" } };
  const cri = [{ pos: 1, k: { nome: "Vídeo", id: "meta:A1" }, t: { gasto: 300 }, c: { receita: 3000, fecharam: 1 } }];
  const s = A.slidesApresentacao({ P, criativos: cri, brl0, brl, int, vertical: "loja", agencia: "Agência Alfa", logo: "https://alfa.com/logo.png", miniatura: () => "https://cdn/x.jpg" });
  assert.equal(s[0].titulo, "O resultado do período"); assert.match(s[0].destaque, /Cada R\$ 1 investido virou R\$ 5,00/);
  assert.deepEqual(s[0].capa, { logo: "https://alfa.com/logo.png", agencia: "Agência Alfa" });
  const num = s[1].linhas.join(" | ");
  assert.match(num, /1 conversa no CRM/); assert.match(num, /1 pedido\b/); assert.doesNotMatch(num, /agendamentos/);
  assert.ok(s.some(x => /Antes × agora/.test(x.titulo) && x.linhas.some(l => /R\$ 800 → R\$ 1000/.test(l))));
  const camp = s.find(x => x.titulo === "Anúncio campeão"); assert.equal(camp.imagem, "https://cdn/x.jpg");
  assert.equal(s[s.length - 1].editavel, true);
  const semRec = A.slidesApresentacao({ P: { ...P, c: { ...P.c, receita: 0 } }, brl0, int });
  assert.notEqual(semRec[0].titulo, "O resultado do período", "sem receita não abre com o retorno");
  assert.match(ADS, /ads-apr-editar/); assert.match(ADS, /destaque\.textContent = s\.destaque/);
});
test("DA-128/DA-366 · barras de campanha: palavra da vertical e valor no aria-label", () => {
  const h = hh;
  const r = { c: { id: "1", nome: "Revisão", plat: "meta" }, t: { gasto: 500, conversoes: 4 }, k: { agendadas: 1 } };
  const b = A.criarBarrasCampanhas({ h, linhas: [r], fmtMoeda: brl0, fmtInt: int, nomePlat: L.nomePlat, palavraAg: A.palavrasFunil("oficina").ag });
  const bt = b.elemento.querySelector("button");
  assert.match(bt.getAttribute("title"), /1 orçamento —/); assert.doesNotMatch(bt.getAttribute("title"), /agendamentos/);
  assert.match(bt.getAttribute("aria-label"), /Revisão \(Meta\): R\$ 500 investidos/);
});
test("DA-129/DA-379 · comparação: sem coroa entre Meta e Google nem com amostra pequena", () => {
  const meta = { c: { plat: "meta" }, t: { conversoes: 2 }, k: { conversas: 2, agendadas: 1 } }, google = { c: { plat: "google" }, t: { conversoes: 1 }, k: { conversas: 1, agendadas: 0 } };
  assert.equal(A.coroaPermitida([meta, google], "CPA da plataforma"), false);
  assert.equal(A.coroaPermitida([meta, { ...meta }], "CPA da plataforma"), false, "2 conversões: amostra pequena");
  const grande = { c: { plat: "meta" }, t: { conversoes: 10 }, k: { conversas: 10, agendadas: 5 } };
  assert.equal(A.coroaPermitida([grande, { ...grande }], "CPA da plataforma"), true);
  assert.equal(A.coroaPermitida([grande, { ...grande, c: { plat: "google" } }], "Conversas CRM"), true, "contagem do CRM: mesma régua");
  assert.match(ADS, /coroaPermitida\(selecionadas, rot\)/);
});
test("DA-130 · ritmo por plataforma também com TikTok", () => {
  const m = { cedo: false, pass: 10, diasMes: 30 };
  const l = A.ritmoPlataformas({ meta: 1000, tiktok: 300 }, m, p => (p === "tiktok" ? 200 : 100));
  assert.deepEqual(l.map(x => x.plat), ["meta", "tiktok"]); assert.equal(l[1].proj, 600); assert.equal(l[1].acima, true);
});
test("DA-133/DA-338 · painel de apresentação com o domínio da agência (cfg.urlPainel)", () => {
  assert.equal(A.enderecoPainel({ urlPainel: "https://painel.alfa.com.br/x" }, () => ""), "https://painel.alfa.com.br/x");
  assert.equal(A.enderecoPainel({ urlPainel: "http://inseguro" }, () => ""), "https://jpfamelli.github.io/nexus-ads/");
  assert.doesNotMatch(ADS, /href: URL_PAINEL/, "o link não nasce mais fixo no github da Nexus");
});
test("DA-134/DA-135/DA-136 · resumo copiado com orçamento, sem jargão e com link", () => {
  const P = { t: { gasto: 500, conversoes: 10, cpa: 50 }, c: { conversas: 3, agendadas: 1, fecharam: 1, receita: 900 }, retorno: 1.8, rotulo: { titulo: "Este mês" }, plat: "google" };
  const t = A.textoResumoPeriodo(P, { brl0, brl, int, orcamento: 2000, ritmo: A.ritmoCurto({ gasto: 500, pass: 10, diasMes: 30 }, 2000), link: "https://painel.alfa.com/c" });
  assert.match(t, /Orçamento do mês: R\$ 2000 · usado 25% com 33% do mês/);
  assert.match(t, /Contatos registrados pelo Google: 10/); assert.doesNotMatch(t, /Conversões da plataforma/);
  assert.match(t, /\nDetalhes: https:\/\/painel\.alfa\.com\/c$/);
});
test("DA-138 · calor dia × hora sugere a janela forte de 4 h", () => {
  const m = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (let d = 0; d < 7; d++) { m[d][19] = 4; m[d][20] = 3; m[d][9] = 1; }
  assert.match(A.sugestaoHorarios(m), /^Das (1[6-9])h às (2[0-3])h chegam \d+% das conversas/);
  assert.equal(A.sugestaoHorarios(Array.from({ length: 7 }, () => Array(24).fill(0))), "", "sem dados suficientes");
});
test("DA-139/DA-336/DA-218 · PNG e arquivo com a agência; dia único sem «a»", () => {
  assert.deepEqual(L.cabecalhoPng({ titulo: "T", cliente: "C", periodo: "P", agencia: "Agência Alfa" }), ["T", "C · P · por Agência Alfa"]);
  assert.equal(L.nomeArquivoExport("funil", "2026-10-01", "2026-10-30", "csv", "Clínica X", "", "Agência Alfa"), "agencia-alfa-clinica-x-funil-2026-10-01-a-2026-10-30.csv");
  assert.equal(L.nomeArquivoExport("funil", "2026-10-24", "2026-10-24", "csv"), "orbita-funil-2026-10-24.csv");
  assert.match(ADS, /agencia: marcaAgencia\(\)/);
});
test("DA-140 · o erro cru da API só no title de quem gere", () => {
  const st = L.statusEnvio({ erro: "(#131047) Re-engagement message" });
  assert.match(st.erro, /janela de 24 h/);
  assert.match(A.tituloEnvio(st, false), /janela de 24 h/); assert.match(A.tituloEnvio(st, true), /131047/);
  assert.match(ADS, /title: tituloEnvio\(st, eGestor\(ctx\)\)/);
});
test("DA-141/DA-142 · nomes do seletor do marco ≤ 40 e contador do texto", () => {
  assert.equal(A.encurtarNome("x".repeat(80)).length, 40); assert.equal(A.encurtarNome("curto"), "curto");
  assert.equal(A.contadorTexto("Troca de criativo"), "17/60");
  assert.match(ADS, /ads-marco-cont/);
});
test("DA-143/DA-204 · campanha ATIVA sem gasto há 3 dias é «sem entrega», não «pausada»", () => {
  assert.deepEqual(L.situacaoCampanha({ status: "ACTIVE" }, 10, 14), { pausada: false, semEntrega: true });
  assert.deepEqual(L.situacaoCampanha({ status: "PAUSED" }, 14, 14), { pausada: true, semEntrega: false });
  assert.deepEqual(L.situacaoCampanha({}, 10, 14), { pausada: true, semEntrega: false }, "sem status: a heurística de antes");
});
test("DA-144 · o balde sem campanha leva aos contatos de anúncio no CRM", () => {
  assert.equal(A.LINK_CONTATOS_ANUNCIO, "#/contatos?origem=anuncio");
  assert.match(ADS, /Ver esses contatos no CRM/);
});
test("DA-145 · funil por plataforma com a frase das taxas para o leitor de tela", () => {
  const p = { plat: "meta", nome: "Meta", gasto: 1, receita: 1, max: 40, etapas: [{ id: "convAds", v: 50, rotulo: "Conversões do anúncio" }, { id: "conversas", v: 40, rotulo: "Conversas no CRM" }, { id: "fecharam", v: 6, rotulo: "Fecharam" }], taxas: [{ pct: 80 }, { pct: 15 }] };
  assert.equal(A.resumoFunilPlataforma(p, int), "Meta: de 40 conversas no crm, 6 fecharam (15%).");
  const h = hh;
  assert.ok(A.criarFunilPlataformas({ h, dados: [p] }).querySelector(".ads-fp-resumo"));
});
test("DA-146 · cada célula do calor diz o valor; a faixa alta mostra o número", () => {
  const h = hh;
  const calor = { semanas: [{ rotulo: "a" }], matriz: Array.from({ length: 7 }, (_, d) => [d === 1 ? 9 : 0]), max: 9, pico: null };
  const c = A.criarCalorSemanal({ h, calor, fmt: v => `${v} conversas` });
  const cel = c.querySelectorAll("span").filter(s => s.getAttribute("role") === "img");
  assert.equal(cel.length, 7); assert.ok(cel.some(s => /9 conversas/.test(s.getAttribute("aria-label")) && s.querySelector(".ads-cal-num")));
});
test("DA-147 · sparkline diz a direção", () => {
  assert.equal(A.descreverTendencia([10, 10, 10, 12, 12, 12]), "subiu 20% em 6 dias");
  assert.equal(A.descreverTendencia([10, 10, 10]), "estável em 3 dias");
  assert.match(ADS, /descreverTendencia\(v\)/);
});
test("DA-154 · apresentação com «Salvar PDF» (um slide por página)", () => {
  assert.match(ADS, /ads-apr-pdf/); assert.match(CSS, /\.ads-apr-pagina \{ break-after: page/);
});
test("DA-162 · glossário em frases do dono", () => {
  assert.match(A.GLOSSARIO.ROAS, /para cada R\$ 1/); assert.match(A.GLOSSARIO.CPM, /mil vezes/);
});
test("DA-165 · marco de dia futuro descartado", () => {
  const ontem = dia(1), amanha = dia(-1);
  assert.deepEqual(A.marcosValidos([{ d: ontem, t: "a" }, { d: amanha, t: "b" }], ontem).map(m => m.t), ["a"]);
});
test("DA-166 · o fuso diz a que horas de Brasília o dia fecha", () => {
  assert.match(A.textoFechamentoFuso("America/Los_Angeles"), /fecham às [45]h de Brasília/);
  assert.match(A.descricaoPeriodoAds({ de: 0, ate: 1, plat: "", rotulo: { titulo: "x" } }, String, L.nomePlat, { fusos: [{ canal: "meta", fuso: "America/Los_Angeles" }] }), /de Brasília/);
});
test("DA-167 · diferença entre total e soma dos dias acima de 1% vira selo", () => {
  const rec = A.reconciliarSerieAds({ t: { gasto: 1000, conversoes: 0 } }, [{ gasto: 400 }, { gasto: 580 }]);
  assert.equal(rec.relevante, true); assert.equal(rec.diferenca, 20);
  assert.match(A.seloAjusteSerie(rec, brl0), /ajuste de R\$ 20/);
  assert.equal(A.seloAjusteSerie(A.reconciliarSerieAds({ t: { gasto: 1000 } }, [{ gasto: 999 }])), "");
});
test("DA-168 · orçamento do mês diz quantos dias faltam", () => {
  const m = { ano: 2026, mes: 9, pass: 20, diasMes: 31, cedo: false, gasto: 100, proj: 155, restam: 11 };
  assert.match(A.descricaoOrcamentoMensal(m, String, brl0), /faltam 11 dias para o mês fechar/);
});
test("DA-169 · legenda das cores do custo", () => {
  assert.deepEqual(A.legendaNivelCpa().map(x => x.nivel), ["bom", "aten", "ruim", "neutro"]);
  assert.match(ADS, /ads-legenda-cpa/);
});
test("DA-171/DA-392 · funil da campanha com custo por etapa, receita e rótulos da vertical", () => {
  const f = A.funilCampanha({ k: { conversas: 10, agendadas: 5, compareceram: 4, fecharam: 2, receita: 3000 }, t: { gasto: 500 } }, "loja");
  assert.deepEqual(f.map(e => e.custo), [50, 100, 125, 250]); assert.equal(f[3].receita, 3000);
  assert.ok(!f.some(e => e.rot === "Compareceram"), "loja não tem «Compareceram»");
});
test("DA-173 · criativo cansado sugere o que fazer", () => {
  assert.match(A.dicaCriativo({ fadiga: { valor: 4 } }), /troque a imagem/);
  assert.equal(A.dicaCriativo({}), "");
});
test("DA-174 · amostra mínima escala com o volume da conta", () => {
  assert.equal(L.amostraMinima(30, 10), 10); assert.equal(L.amostraMinima(1000, 10), 30); assert.equal(L.amostraMinima(1e5, 2), 50);
});
test("DA-175 · aviso de moeda com o caminho para resolver", () => {
  assert.deepEqual({ ...A.linkAvisoMoeda(true) }, { rotulo: "Ajustar a moeda em Ajustes de anúncios", href: "#/config/anuncios" });
  assert.equal(A.linkAvisoMoeda(false), null);
});
test("DA-176 · logo SVG recusado", () => {
  assert.equal(A.logoValido("https://x.com/logo.svg"), ""); assert.equal(A.logoValido("https://x.com/logo.svg?v=2"), "");
  assert.equal(A.logoValido("https://x.com/logo.png"), "https://x.com/logo.png");
});
test("DA-177 · plataforma que sumiu volta para «Tudo» com aviso", () => {
  assert.match(A.textoPlatSumiu("Google"), /^Google não tem números/);
  assert.match(ADS, /ui\.toast\(textoPlatSumiu\(era\)/);
});
test("DA-184 · com agência configurada a assinatura padrão é a dela (sem «Nexus»)", () => {
  assert.equal(AC.assinaturaInicial({ agenciaNome: "Alfa" }).valor, "Equipe Alfa · gestão de tráfego");
  assert.equal(AC.assinaturaParaSalvar({ cfg: {}, valor: AC.ASSINATURA_PADRAO, agencia: "Alfa" }), "Equipe Alfa · gestão de tráfego");
  assert.equal(AC.assinaturaInicial({}).valor, AC.ASSINATURA_PADRAO, "sem agência: a de sempre");
});
test("DA-185 · orçamento por plataforma lido em pt-BR («15.5» não vira 155)", () => {
  assert.deepEqual({ ...AC.lerOrcPlat({ meta: "1.500", google: "15.5" }).orcamentoPlat }, { meta: 1500, google: 15.5 });
});

/* ============================================================ LOTE ads-d2 */
test("DA-198/DA-254 · o resumo semanal entra no histórico, com título da semana e reenvio próprio", () => {
  const ref = dia(9);
  const lst = L.listaRelatorios([{ tipo: "semanal", referencia: ref, status: "enviado" }, { tipo: "diario", referencia: ref }, { tipo: "anual", referencia: ref }]);
  assert.deepEqual(lst.map(x => x.tipo), ["semanal", "diario"], "antes o semanal era descartado");
  assert.equal(L.tituloSemana("2026-10-12"), "Semana de 12/10 a 18/10");
  assert.equal(L.tituloSemana("x"), "Resumo da semana");
  assert.match(lst[0].titulo, /^Semana de \d\d\/\d\d a \d\d\/\d\d$/);
  const it = { tipo: "semanal", ref, envio: { k: "erro" } };
  assert.equal(A.podeReenviarRelatorio(it, { gestor: true, ultimaSemana: ref }), true);
  assert.equal(A.podeReenviarRelatorio(it, { gestor: true, ultimoDiario: ref, ultimoMes: ref }), false, "sem ser a semana mais recente, não");
  assert.equal(A.NOME_TIPO_REL.semanal, "Resumo da semana");
  assert.equal(AC.confirmacaoEnvio({ tipo: "semanal", cfg: { waGestor: ["12999998888"] } }).titulo, "Enviar o resumo da semana?");
});
test("DA-199/DA-200/DA-255 · mês de 31 × mês de 30: comparação pela média por dia", () => {
  const P = { t: { gasto: 3100, cpa: 10, conversoes: 310 }, ta: { gasto: 3000, cpa: 10, conversoes: 300 }, c: { receita: 6200 }, ca: { receita: 6000 },
    dias: 31, nA: 30, normalizado: true, escalaA: 31 / 30 };
  const k = Object.fromEntries(L.kpisAnuncios(P).map(x => [x.id, x]));
  assert.equal(Math.round(k.gasto.a), 3100, "3000 em 30 dias = 3100 na régua de 31 (antes: +3,3% só pelo tamanho do mês)");
  assert.equal(Math.round(k.receita.a), 6200); assert.equal(k.cpa.a, 10, "custo (razão) não muda");
  assert.equal(L.textoNormalizado(P), "Comparação pela média por dia: 31 dias agora × 30 dias antes.");
  assert.equal(L.textoNormalizado({ ...P, normalizado: false }), "");
  assert.equal(L.anteriorNaRegua({}, 7), 7);
  const M = montarDe({ metricas: serie(1, 80) });
  for (const d of ["mes", "mes_ant", 30]) {
    const Q = L.numerosPeriodo(M, { dias: d });
    assert.equal(Q.nA, Math.max(0, Q.ateA - Q.deA + 1));
    assert.equal(Q.normalizado, d !== 30 && Q.nA > 0 && Q.nA !== Q.dias);
  }
  assert.match(ADS, /a: L\.anteriorNaRegua\(P, ca\.conversas\)/);
});
test("DA-201/DA-202/DA-257 · alerta e registro pelo instante (Z × -03:00)", () => {
  assert.equal(L.alertasPorChave([{ chave: "k", criado_em: "2026-10-20T23:30:00-03:00", id: "a" }, { chave: "k", criado_em: "2026-10-21T01:00:00Z", id: "b" }]).get("k").id, "a",
    "23:30 de SP = 02:30Z, depois de 01:00Z (como texto, «2026-10-21…» vencia)");
  assert.match(RLOG, /sort\(\(a, b\) => instante\(b\.criado_em\) - instante\(a\.criado_em\)\)/);
});
test("DA-203 · Google com ação de conversão ativa não perde o alerta de gasto sem resultado", () => {
  assert.equal(L.googleTemAcaoConversao([{ canal: "google", acoes_conversao: 2 }]), true);
  assert.equal(L.googleTemAcaoConversao([{ canal: "meta", conversoes_ativas: true }]), false);
  const M = { LINHAS: [{ plat: "google", i: 10, gasto: 100, conversoes: 0 }], R: 10 };
  assert.equal(L.googleSemConversao(M), true);
  assert.equal(L.googleSemConversao(M, { integracoes: [{ canal: "google", conversoes_ativas: true }] }), false);
});
test("DA-205 · o piso da cor acompanha o tamanho da conta", () => {
  assert.equal(L.gastoMinCor(10), 10); assert.equal(L.gastoMinCor(5000), 500); assert.equal(L.gastoMinCor(1), 5); assert.equal(L.gastoMinCor(0), 20);
  assert.equal(L.nivelCpa(30, 10, 15), "neutro", "sem mínimo: R$ 20 como antes");
  assert.equal(L.nivelCpa(30, 10, 15, L.gastoMinCor(10)), "ruim", "conta de R$ 10/dia passa a ver a cor");
  assert.equal(L.nivelCpa(30, 10, 300, L.gastoMinCor(5000)), "neutro");
  assert.match(ADS, /L\.nivelCpa\(r\.t\.cpa, meta, r\.t\.gasto, minCor\)/);
});
test("DA-191 · meta de custo com exemplo de conta", () => {
  assert.match(AC.EXEMPLO_META_CUSTO, /Ex\.: meta de R\$ 20/); assert.match(ADSCFG, /\$\{EXEMPLO_META_CUSTO\}/);
});
test("DA-194 · simulador: quanto investir para N fechamentos", () => {
  const r = A.simularOrcamento({ gasto: 3000, fechamentos: 10, meta: 20, brl0, palavra: ["venda", "vendas"] });
  assert.equal(r.ok, true); assert.equal(r.valor, 6000);
  assert.match(r.texto, /^Para 20 vendas no mês: cerca de R\$ 6000 em anúncios \(R\$ 300 por venda/);
  assert.equal(A.simularOrcamento({ gasto: 3000, fechamentos: 2, meta: 20 }).ok, false);
  assert.match(A.simularOrcamento({ gasto: 3000, fechamentos: 1, meta: 5, palavra: ["venda", "vendas"] }).texto, /1 venda nos últimos 90 dias/);
  assert.match(ADS, /class: "rel-cartao rel-entra ads-sim"/);
});
test("DA-195 · cópia que falha avisa (antes silêncio) e ui.copiar com erro cai no navegador", async () => {
  const toasts = [];
  assert.equal(await A.copiarTexto("x", { ui: { toast: (t, o) => toasts.push([t, o.tipo]) }, nav: {} }), false);
  assert.deepEqual(toasts, [[A.AVISO_COPIA_FALHOU, "erro"]]);
  let escrito = "";
  assert.equal(await A.copiarTexto("y", { ui: { copiar: async () => { throw new Error("x"); } }, nav: { clipboard: { writeText: async t => { escrito = t; } } } }), "clipboard");
  assert.equal(escrito, "y");
});
test("DA-197 · id numérico vira seletor válido", () => {
  assert.equal(A.seletorFoco(hh("button", { id: "123" })), '[id="123"]');
  assert.equal(A.seletorFoco(hh("button", { id: "ok-1" })), "#ok-1");
});
test("DA-207 · links https na prévia do WhatsApp viram token de link", () => {
  assert.deepEqual(L.tokensWa("Veja: https://painel.alfa.com/x."), [{ t: "txt", v: "Veja: " }, { t: "a", v: "https://painel.alfa.com/x" }, { t: "txt", v: "." }]);
  assert.deepEqual(L.tokensWa("http://x.com"), [{ t: "txt", v: "http://x.com" }], "só https");
  assert.match(ADS, /tk\.t === "a"\) bolha\.append\(h\("a", \{ class: "rel-link ads-bolha-link", href: tk\.v, target: "_blank", rel: "noopener noreferrer" \}/);
});
test("DA-208/DA-209/DA-212/DA-213/DA-214/DA-256 · resumo de vendas: gênero, zero e retorno dos anúncios", () => {
  const r = { kpis: { criados: 4, ganhos: 1, receita: 3000, perdidos: 0 } };
  const t = RL.textoResumoVendas(r, { de: "2026-09-01", ate: "2026-09-30", negocios: "consultas", fem: true, ads: { investido: 1000, vendas: 2, receita: 4000 }, brl0, brl });
  assert.match(t, /• 4 consultas novas/); assert.match(t, /• 1 fechada · R\$ 3000/); assert.match(t, /• Perdidas: 0/);
  assert.match(t, /• Investido em anúncios: R\$ 1000 · R\$ 500,00 de anúncio por venda/);
  assert.match(t, /• Cada R\$ 1 investido em anúncios virou R\$ 4,00 em vendas/);
  const m = RL.textoResumoVendas(r, { de: "a", ate: "b" });
  assert.match(m, /4 negócios novos/); assert.match(m, /Perdidos: 0/); assert.doesNotMatch(m, /Investido/);
  const M = montarDe({ metricas: serie(1, 10) });
  assert.equal(RL.investimentoAdsPeriodo(M, dia(5), dia(3)), 90);
  assert.equal(RL.investimentoAdsPeriodo(M, "1990-01-01", dia(3)), null, "fora dos dias do Anúncios: nada pela metade");
  assert.match(REL, /investimentoAdsPeriodo\(ca\.M, de, ate\)/);
});
test("DA-210/DA-211/DA-247 · «Este mês» termina ontem; no dia 1º é o mês de ontem", () => {
  assert.deepEqual(RL.periodoMes("2026-10-14", 0), { de: "2026-10-01", ate: "2026-10-13" });
  assert.deepEqual(RL.periodoMes("2026-10-01", 0), { de: "2026-09-01", ate: "2026-09-30" }, "antes: só o dia 1º pela metade");
  assert.deepEqual(RL.periodoMes("2026-10-14", 0, { incluirHoje: true }), { de: "2026-10-01", ate: "2026-10-14" });
  assert.equal(RL.atalhoMesAtivo({ preset: "per", de: "2026-10-01", ate: "2026-10-13" }, "2026-10-14"), "mes");
  assert.equal(RL.atalhoMesAtivo({ preset: "per", de: "2026-10-01", ate: "2026-10-14" }, "2026-10-14"), "mes", "a preferência antiga continua reconhecida");
});
test("DA-215 · variação do mês sem base não é comparável", () => {
  assert.equal(L.mesVsAnterior({ receita_mes: 10, receita_mes_anterior: 0 }).comparavel, false);
  assert.equal(L.mesVsAnterior({ receita_mes: 10, receita_mes_anterior: 7 }).comparavel, true);
  assert.equal(L.mesVsAnterior({ receita_mes: 10, receita_mes_anterior: 7, desde: "2026-09-15" }, { hoje: "2026-10-20" }).comparavel, false);
});
test("DA-222 · lead sem hora (00:00:00) não cria pico às 0h", () => {
  assert.equal(L.semHoraReal({ criado_em: "2026-10-01" }), true);
  assert.equal(L.semHoraReal({ data_conversa: "2026-10-01T00:00:00-03:00" }), true);
  assert.equal(L.semHoraReal({ data_conversa: "2026-10-01T00:13:00-03:00" }), false);
  const M = { R: 40, LEADS: [{ plat: "meta", i: 38, bruto: { hora_conversa: 0, data_conversa: "2026-10-01T00:00:00-03:00" } }, { plat: "meta", i: 38, bruto: { hora_conversa: 9 } }],
    dataDe: i => new Date(2026, 9, i), CFG: {} };
  const c = L.calorHora(M, { dias: 30 });
  assert.equal(c.total, 1); assert.equal(c.semHora, 1);
});
test("DA-223 · pico do calor diz quando há empate", () => {
  const m = Array.from({ length: 7 }, () => new Array(24).fill(0)); m[1][9] = 5; m[2][10] = 5; m[3][11] = 2;
  assert.deepEqual(L.picoCalor(m), { dow: 1, hora: 9, qtd: 5, empates: 1 });
  assert.match(REL, /empatado com \$\{pico\.empates === 1 \? "outro horário"/);
});
test("DA-225/DA-226 · leitura atrasada não acende verde; leitura com erro não promete minutos", () => {
  const s = L.semaforoRadar([], { atrasado: true });
  assert.equal(s.nivel, "cinza"); assert.equal(s.cor, "neutro"); assert.match(s.frase, /não são de agora/);
  assert.equal(L.semaforoRadar([]).nivel, "verde");
  assert.match(L.proximaLeitura(Date.now() - 6e4, Date.now(), { erro: true }), /falhou/);
  assert.match(L.proximaLeitura(Date.now() - 6e4, Date.now()), /próxima leitura em ~59 min/);
});
test("DA-231 · os marcos do período viram «O que fizemos»", () => {
  const P = { t: { gasto: 100 }, c: { conversas: 1, agendadas: 0, receita: 0 }, rotulo: { titulo: "x", antes: "y" } };
  const s = A.slidesApresentacao({ P, brl0, int, feito: [{ d: "2026-10-05", t: "Troca do criativo" }, { d: "2026-10-02", t: "Verba +20%" }, { d: "x", t: "lixo" }] });
  const f = s.find(x => x.titulo === "O que fizemos no período");
  assert.deepEqual(f.linhas, ["02/10 · Verba +20%", "05/10 · Troca do criativo"]);
  assert.match(ADS, /feito: marcosValidos\(M\.CFG\.marcos\)/);
});
test("DA-233 · capa do papel com o resultado principal", () => {
  assert.deepEqual(RL.linhasCapa("vendas", { kpis: { ganhos: 3, receita: 900, conversao_pct: 10 } }, { brl0, fem: true }), ["3 fechadas · R$ 900 de receita", "Conversão: 10%"]);
  assert.deepEqual(RL.linhasCapa("atendimento", { kpis: { novas: 1, resolvidas: 1 } }), ["1 conversa nova · 1 resolvidas"]);
  assert.deepEqual(RL.linhasCapa("vendas", {}), []);
  assert.match(CSS, /\.relat-capa-impressao \{ display: block; break-after: page/);
});
test("DA-236/DA-237 · tema escuro impresso vira claro", () => {
  assert.match(CSS, /@media print \{\n  html\[data-esquema="escuro"\] \{ color-scheme: light; --c-fundo: Canvas;/);
  assert.match(CSS, /\.rel svg text, \.rel \.g-eixo text \{ fill: CanvasText !important; \}/);
});
test("DA-239 · memo de 5 min e LRU (o usado volta ao fim)", () => {
  assert.equal(RL.MEMO_MS, 5 * 60 * 1000);
  const memo = new Map([["a", { t: 0, r: 1 }], ["b", { t: 0, r: 2 }]]);
  assert.equal(RL.memoFresco(memo, "a", 120000), 1, "2 min depois ainda vale (antes 60 s)");
  assert.deepEqual([...memo.keys()], ["b", "a"]);
});
test("DA-240 · sugestão de período maior diz o porquê", () => {
  assert.match(RL.textoPeriodoMaior(7, 30), /^Nada nos últimos 7 dias\. Em 30 dias entram também/);
  assert.equal(RL.textoPeriodoMaior(90, null), "");
});
test("DA-244/DA-245/DA-246 · ex-equipe marcado, tempo parado e anúncio × orgânico", () => {
  assert.equal(RL.linhasDono([{ nome: "Rui", ativo: false, ganhos: 1 }])[0].nome, "Rui (fora da equipe)");
  assert.equal(RL.linhasDono([{ nome: "Ana" }])[0].nome, "Ana");
  assert.equal(RL.resumoParados([{ qtd: 1, dias_max: 12 }, { qtd: 1, dias: 30 }]).diasMax, 30);
  assert.match(RL.resumoOrigens([{ rotulo: "Meta", anuncio: true, criados: 2, ganhos: 1 }, { rotulo: "Indicação", criados: 1, ganhos: 0 }]),
    /De anúncio: 2 criados e 1 ganho; sem anúncio: 1 criado e 0 ganhos$/);
});

/* ============================================================ LOTE ads-d3 (+ rastreio do ads-d4) */
const CHAVE_SITE = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";
const WA = "https://wa.me/5512999990000?text=Ol%C3%A1";
/** A v3 num contexto vm com janela falsa (o mesmo desenho do plano 1500c, com as peças novas: hash, UA, sessionStorage, dataLayer,
    fila, MutationObserver, iframes e seletores de documento). */
function montarV3({ search = "", hash = "", referrer = "", ua = "", guardado = null, resposta = null, inputs = [], attrs = {}, cfgJanela = null, antes = {},
  semScript = false, lsCheio = false, mo = null, iframes = [], reescritos = [], pendurar = false } = {}) {
  const ouvintes = {}, loja = new Map(), sessao = new Map(), chamadas = [], navegacao = [];
  if (guardado) loja.set("orbita:rastreio:v3", JSON.stringify(guardado));
  const script = hh("script", { "data-chave": CHAVE_SITE, ...attrs });
  const document = { currentScript: semScript ? null : script, referrer, readyState: "complete", documentElement: mo ? {} : undefined,
    addEventListener: (t, f) => { (ouvintes[t] ||= []).push(f); },
    querySelectorAll: sel => {
      if (sel === "iframe") return iframes;
      if (sel === "[data-orbita-original]") return reescritos;
      if (/^script\[src\*="rastreio\.v3"\]/.test(sel)) return semScript ? [script] : [];
      const m = /name="([^"]+)"/.exec(sel); return inputs.filter(i => m && i.name === m[1]);
    } };
  const janela = {
    document, addEventListener() {},
    localStorage: { getItem: k => (loja.has(k) ? loja.get(k) : null), setItem: (k, v) => { if (lsCheio) throw new Error("QuotaExceededError"); loja.set(k, String(v)); }, removeItem: k => loja.delete(k) },
    sessionStorage: { getItem: k => (sessao.has(k) ? sessao.get(k) : null), setItem: (k, v) => sessao.set(k, String(v)), removeItem: k => sessao.delete(k) },
    location: { search, hash, hostname: "site.com", origin: "https://site.com", pathname: "/implante", href: "https://site.com/implante" + search + hash, assign: u => navegacao.push(u) },
    navigator: { userAgent: ua }, history: { pushState() {}, replaceState() {} },
    fetch: (url, init) => { chamadas.push({ url, corpo: JSON.parse(init.body) }); if (pendurar) return new Promise(() => {});
      return Promise.resolve({ ok: true, status: 200, json: async () => (resposta ? resposta(chamadas.length) : { ok: true, codigo: "K7Q2P" }) }); },
    AbortController, Promise, setTimeout, clearTimeout, JSON, Date, encodeURIComponent, decodeURIComponent, String, Object, Number, Array, RegExp, Math,
    console: { warn() {}, info() {} }, ...antes,
  };
  if (mo) janela.MutationObserver = mo;
  if (cfgJanela) janela.ORBITA_RASTREIO = cfgJanela;
  janela.window = janela;
  vm.runInContext(V3, vm.createContext(janela), { filename: "rastreio.v3.js" });
  const disparar = (tipo, alvo, extra = {}) => { const ev = { target: alvo, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; for (const f of ouvintes[tipo] || []) f(ev); return ev; };
  return { janela, ouvintes, disparar, chamadas, navegacao, loja, sessao, guardadoAgora: () => JSON.parse(loja.get("orbita:rastreio:v3") || sessao.get("orbita:rastreio:v3") || "null"), api: janela.OrbitaRastreio };
}
const simples = o => JSON.parse(JSON.stringify(o));   // objeto de outro contexto (vm)

test("DA-258/DA-259 · «sem confirmação» com a data; erro cortado na palavra", () => {
  const velho = { enviado_em: isoMenos(3 * 864e5) };
  assert.match(L.statusEnvio(velho, Date.now()).rotuloData, /^enviado em \d\d\/\d\d · sem confirmação de entrega$/);
  const longo = "palavra ".repeat(40);
  const st = L.statusEnvio({ erro: longo }, Date.now());
  assert.ok(st.erro.length <= 160); assert.match(st.erro, /palavra…$/, "antes: slice(0,160) cortava no meio da palavra");
  assert.equal(L.cortarEmPalavra("curto"), "curto");
});
test("DA-262 · resumo copiável também no atendimento", () => {
  const t = L.textoResumoAtendimento({ kpis: { novas: 12, resolvidas: 1, tpr_mediana_min: 9, sem_resposta: 0 } }, { de: "2026-10-01", ate: "2026-10-07", cliente: "Clínica", int, dataBR: L.dataIsoBR });
  assert.equal(t.split("\n")[0], "*Atendimento · Clínica* — 01/10/2026 a 07/10/2026");
  assert.match(t, /• 12 conversas novas/); assert.match(t, /• 1 resolvida/); assert.match(t, /• 1ª resposta \(mediana\): 9 min \(bom: até 15 min\)/); assert.match(t, /• Sem resposta: 0/);
  assert.match(REL, /L\.textoResumoAtendimento\(ultimoVendas,/); assert.match(REL, /aba === "vendas" \? L\.vendasVazio\(r\) : L\.atendimentoVazio\(r\)/);
});
test("DA-263 · 1ª resposta com a régua ao lado", () => {
  assert.equal(L.referenciaResposta(10), "bom: até 15 min"); assert.match(L.referenciaResposta(40), /^dá para melhorar/); assert.match(L.referenciaResposta(90), /^lento/);
  assert.equal(L.referenciaResposta(null), "");
  const k = L.kpisAtendimento({ kpis: { tpr_mediana_min: 90, tpr_media_min: 100 } }).find(x => x.id === "tpr_mediana_min");
  assert.match(k.extra, /média .* · lento/);
});
test("DA-264 · conversão acima de 100% explicada", () => {
  assert.equal(L.textoConversao({ tipo: "aberto", passaram: 5, conversao_proxima_pct: 120 }), "5 entraram · seguiram mais do que entraram (inclui quem entrou antes do período)");
  assert.equal(L.textoConversao({ tipo: "aberto", passaram: 10, conversao_proxima_pct: 42.5 }), "10 entraram · 42,5% seguiram");
});
test("DA-267/DA-311 · link dentro de Shadow DOM é achado pelo caminho do evento", async () => {
  const m = montarV3({ search: "?utm_source=meta&utm_campaign=1" });
  await esperar(10);
  const host = hh("div"), a = hh("a", { href: WA });
  const ev = m.disparar("click", host, { composedPath: () => [a, { nodeType: 11 }, host] });
  assert.match(a.getAttribute("href"), /%5Bref%20K7Q2P%5D$/, "antes: o alvo era o host e o clique saía sem código");
  assert.equal(ev.defaultPrevented, false);
  const ign = hh("div", { "data-orbita-ignorar": "" }), a2 = hh("a", { href: WA });
  m.disparar("click", ign, { composedPath: () => [a2, ign] });
  assert.equal(a2.getAttribute("href"), WA, "data-orbita-ignorar num pai também vale no caminho");
});
test("DA-268/DA-311 · iframe do mesmo site recebe o tratamento do clique", () => {
  const ouv = {}, ifr = { contentDocument: { addEventListener: (t, f) => { (ouv[t] ||= []).push(f); } } }, outro = { get contentDocument() { throw new Error("cross-origin"); } };
  montarV3({ iframes: [ifr, outro] });
  assert.equal((ouv.click || []).length, 1); assert.equal((ouv.pointerdown || []).length, 1);
});
test("DA-269/DA-296/DA-297/DA-313 · utm depois do #, utm repetida e codificada duas vezes", () => {
  const api = montarV3().api;
  assert.deepEqual(simples(api.capturarUrl({ search: "", hash: "#/landing?utm_source=meta&utm_campaign=99" })), { utm_source: "meta", utm_campaign: "99" });
  assert.deepEqual(simples(api.capturarUrl({ search: "?utm_source=google", hash: "#/x?utm_source=meta" })), { utm_source: "google" }, "a consulta normal vence");
  assert.equal(simples(api.capturar("?utm_source=a&utm_source=b")).utm_source, "a");
  assert.equal(simples(api.capturar("?utm_campaign=promo%25C3%25A9")).utm_campaign, "promoé");
  const m = montarV3({ hash: "#/l?utm_source=meta&utm_campaign=7" });
  assert.equal(m.guardadoAgora().d.utm_campaign, "7");
});
test("DA-270/DA-271/DA-272/DA-273/DA-316 · origem: navegador dos apps, android-app, Google pago, IA e «direto» que não trava", () => {
  const cr0 = montarV3().api.classificarReferencia, cr = (...a) => simples(cr0(...a));
  assert.deepEqual(cr("", "site.com", "Mozilla/5.0 (iPhone) Instagram 300.0"), { src: "instagram", tipo: "social" });
  assert.deepEqual(cr("", "site.com", "Mozilla/5.0 [FBAN/FBIOS;FBAV/400]"), { src: "facebook", tipo: "social" });
  assert.deepEqual(cr("", "site.com", "Mozilla/5.0 Chrome"), { src: "direto", tipo: "direto" });
  assert.deepEqual(cr("android-app://com.instagram.android", "site.com"), { src: "instagram", tipo: "social" });
  assert.deepEqual(cr("android-app://com.google.android.gm", "site.com"), { src: "gmail", tipo: "email" });
  assert.deepEqual(cr("android-app://com.exemplo.app", "site.com"), { src: "com.exemplo.app", tipo: "app" });
  assert.deepEqual(cr("https://www.googleadservices.com/pagead/aclk?x", "site.com"), { src: "google", tipo: "pago" });
  assert.deepEqual(cr("https://tpc.googlesyndication.com/x", "site.com"), { src: "google", tipo: "pago" });
  assert.deepEqual(cr("https://chatgpt.com/", "site.com"), { src: "chatgpt", tipo: "ia" });
  assert.deepEqual(cr("https://gemini.google.com/app", "site.com"), { src: "gemini", tipo: "ia" }, "antes: «google» busca");
  assert.deepEqual(cr("https://www.perplexity.ai/search", "site.com"), { src: "perplexity", tipo: "ia" });
  const m = montarV3({ referrer: "https://www.google.com.br/", guardado: { v: 3, t: Date.now() - 1000, d: {}, c: null, r: { src: "direto", tipo: "direto" } } });
  assert.deepEqual(m.guardadoAgora().r, { src: "google", tipo: "busca" }, "antes: a 1ª visita direta travava a origem");
  const m2 = montarV3({ referrer: "", guardado: { v: 3, t: Date.now() - 1000, d: {}, c: null, r: { src: "google", tipo: "busca" } } });
  assert.deepEqual(m2.guardadoAgora().r, { src: "google", tipo: "busca" }, "visita direta depois não apaga a busca");
});
test("DA-275 · rolar com o dedo não aquece; toque parado aquece", async () => {
  const m = montarV3(), a = hh("a", { href: WA });
  m.disparar("touchstart", a, { touches: [{ clientX: 10, clientY: 10 }] }); m.disparar("touchend", a, { changedTouches: [{ clientX: 10, clientY: 80 }] });
  await esperar(5);
  assert.equal(m.chamadas.length, 0, "antes: touchstart aquecia em toda rolagem");
  m.disparar("touchstart", a, { touches: [{ clientX: 10, clientY: 10 }] }); m.disparar("touchend", a, { changedTouches: [{ clientX: 12, clientY: 13 }] });
  await esperar(5);
  assert.equal(m.chamadas.length, 1); assert.equal(m.chamadas[0].corpo.p_dados.evento, "aquecimento");
});
test("DA-277/DA-278/DA-314 · telefone na 1ª visita é registrado; mailto é contato", async () => {
  const m = montarV3({ resposta: () => ({ ok: true, codigo: "K7Q2P", eventos: true }) });
  const ev = m.disparar("click", hh("a", { href: "tel:+5512999990000" }));
  await esperar(10);
  assert.equal(ev.defaultPrevented, false, "o link segue sozinho");
  assert.deepEqual(m.chamadas.map(c => c.corpo.p_dados.evento), ["aquecimento", "contato"], "antes: sem código guardado o toque sumia");
  assert.equal(m.chamadas[1].corpo.p_dados.canal, "telefone");
  const velho = montarV3();   // servidor sem {eventos: true}: só o aquecimento, nunca o contato
  velho.disparar("click", hh("a", { href: "tel:+5512999990000" })); await esperar(10);
  assert.deepEqual(velho.chamadas.map(c => c.corpo.p_dados.evento), ["aquecimento"]);
  assert.equal(m.api.canalContato("mailto:oi@clinica.com"), "email");
});
test("DA-279 · formulário que aparece depois recebe a origem na hora", async () => {
  let cb = null;
  const MO = function (f) { cb = f; this.observe = () => {}; };
  const inp = { name: "utm_campaign", type: "hidden", value: "", getAttribute: k => (k === "type" ? "hidden" : null) };
  const m = montarV3({ search: "?utm_source=meta&utm_campaign=55", mo: MO });
  assert.ok(cb, "o observador foi ligado");
  m.janela.document.querySelectorAll = sel => (/name="utm_campaign"/.test(sel) ? [inp] : []);
  cb([{ addedNodes: [{ nodeType: 1, tagName: "INPUT" }] }]);
  await esperar(5);
  assert.equal(inp.value, "55");
});
test("DA-280 · revogar devolve os links ao original", () => {
  const a = hh("a", { href: `${WA}%20%5Bref%20K7Q2P%5D`, "data-orbita-original": WA });
  const m = montarV3({ reescritos: [a] });
  m.api.revogar();
  assert.equal(a.getAttribute("href"), WA); assert.equal(a.getAttribute("data-orbita-original"), null);
});
test("DA-281 · dois scripts do Órbita na página: o segundo não instala", () => {
  const v2 = { versao: 2 };
  const m = montarV3({ antes: { OrbitaRastreio: v2 } });
  assert.equal(m.janela.OrbitaRastreio, v2); assert.equal(Object.keys(m.ouvintes).length, 0, "nenhum ouvinte novo (antes: dois códigos por clique)");
});
test("DA-282/DA-312 · «Aceitar» antes de o script carregar entra na fila", async () => {
  const m = montarV3({ search: "?utm_source=meta&utm_campaign=1", attrs: { "data-consentimento": "aguardar" }, antes: { ORBITA_RASTREIO_FILA: ["consentir"] } });
  assert.equal(m.guardadoAgora().d.utm_campaign, "1", "antes: o clique no banner se perdia e nada era guardado");
  const s = montarV3({ search: "?utm_source=meta&utm_campaign=2", attrs: { "data-consentimento": "aguardar" } });
  assert.equal(s.guardadoAgora(), null);
  s.janela.ORBITA_RASTREIO_FILA.push("consentir");
  assert.equal(s.guardadoAgora().d.utm_campaign, "2", "depois de carregar, o push executa na hora");
  const sn = RC.snippetConsentimento(CHAVE_SITE, null, { versao: 3 });
  assert.match(sn, /\(window\.ORBITA_RASTREIO_FILA = window\.ORBITA_RASTREIO_FILA \|\| \[\]\)\.push\("consentir"\)/);
  assert.match(RC.snippetConsentimento(CHAVE_SITE, null, { versao: 2 }), /window\.OrbitaRastreio && window\.OrbitaRastreio\.consentir\(\);/, "v1/v2 não leem a fila");
});
test("DA-283 · Google Consent Mode v2 decide o consentimento", () => {
  const dl = [{ 0: "consent", 1: "default", 2: { analytics_storage: "denied", ad_storage: "denied" } }];
  const m = montarV3({ search: "?utm_source=meta&utm_campaign=3", attrs: { "data-consentimento": "google" }, antes: { dataLayer: dl } });
  assert.equal(m.guardadoAgora(), null);
  m.janela.dataLayer.push({ 0: "consent", 1: "update", 2: { analytics_storage: "granted" } });
  assert.equal(m.guardadoAgora().d.utm_campaign, "3");
  m.janela.dataLayer.push({ 0: "consent", 1: "update", 2: { analytics_storage: "denied" } });
  assert.equal(m.guardadoAgora(), null, "negou depois: revoga e apaga");
  assert.match(RC.snippetConsentMode(CHAVE_SITE, null, { versao: 3 }), /data-consentimento="google"/);
  assert.equal(RC.snippetConsentMode(CHAVE_SITE, null, { versao: 2 }), null);
});
test("DA-300 · 2º toque enquanto o 1º espera não abre outra conversa", async () => {
  const m = montarV3({ pendurar: true, cfgJanela: { chave: CHAVE_SITE, espera: 20 } });
  const a = hh("a", { href: WA });
  const e1 = m.disparar("click", a), e2 = m.disparar("click", a);
  assert.equal(e1.defaultPrevented, true); assert.equal(e2.defaultPrevented, true);
  await esperar(60);
  assert.equal(m.navegacao.length, 1, "antes: duas navegações (duas conversas)");
});
test("DA-307 · caminho da página sem dado pessoal", () => {
  const api = montarV3().api;
  assert.equal(api.caminhoSeguro("/obrigado/maria@email.com"), "/obrigado/-");
  assert.equal(api.caminhoSeguro("/cpf/123.456.789-09/x"), "/cpf/-/x");
  assert.equal(api.caminhoSeguro("/tel/(12) 99999-8888"), "/tel/-");
  assert.equal(api.caminhoSeguro("/produto-12345/implante"), "/produto-12345/implante");
});
test("DA-315 · fbclid novo do mesmo anúncio não troca a origem", () => {
  const g = { v: 3, t: Date.now() - 1000, d: { utm_source: "meta", utm_campaign: "9", fbclid: "AAA" }, c: null, r: null };
  const m = montarV3({ search: "?fbclid=BBB", guardado: g });
  assert.equal(m.guardadoAgora().d.utm_campaign, "9", "antes: a campanha era trocada por {fbclid: BBB}");
  assert.equal(m.guardadoAgora().d.fbclid, "AAA");
  const n = montarV3({ search: "?gclid=G2", guardado: { ...g, d: { gclid: "G1" } } });
  assert.equal(n.guardadoAgora().d.gclid, "G2", "o gclid continua trocando (é outro clique de anúncio)");
});
test("DA-317 · localStorage cheio: a origem vai para o sessionStorage", () => {
  const m = montarV3({ search: "?utm_source=meta&utm_campaign=8", lsCheio: true });
  assert.equal(JSON.parse(m.sessao.get("orbita:rastreio:v3")).d.utm_campaign, "8");
});
test("DA-321/DA-322 · por gerenciador de tags (currentScript nulo) a chave ainda é lida", () => {
  const m = montarV3({ semScript: true });
  assert.equal(m.api.ativo(), true, "antes: sem currentScript o rastreio desligava");
});
test("DA-285/DA-286/DA-302/DA-304/DA-309/DA-405 · textos e snippets da instalação", () => {
  assert.equal(RC.DIAS_VALIDADE_CLIQUE, 45); assert.doesNotMatch(RCFG, /até 30 dias\)/);
  assert.match(RC.UTM.tiktok, /__CAMPAIGN_ID__/); assert.match(RC.UTM.microsoft, /\{CampaignId\}/);
  assert.match(RC.TESTE_COMPLETO, /banner de cookies/); assert.match(RC.TESTE_COMPLETO, /Global Privacy Control/);
  assert.match(RC.snippetSoVisita(CHAVE_SITE), /data-dias="0" defer><\/script>$/);
  assert.match(RC.snippetBotaoWhatsapp("(12) 99999-8888"), /href="https:\/\/wa\.me\/5512999998888\?text=Ol%C3%A1!%20Vim%20pelo%20site\."/);
  assert.equal(RC.snippetBotaoWhatsapp("123"), null);
  assert.match(RC.textoVersaoScript({ n: 3 }), /^Versão 3 do script: também reconhece/);
});
test("DA-287/DA-289/DA-290/DA-306 · rastreio: ordem pelo instante, cliques por dia, dica e página da campanha", () => {
  const agora = Date.now();
  const itens = [
    { em: new Date(agora - 3 * 36e5).toISOString().replace("Z", "+00:00"), pagina: "https://site.com/a", utm_campaign: "c1", motivo: null },
    { em: new Date(agora - 2 * 36e5 - 3 * 36e5).toISOString().slice(0, 19) + "-03:00", pagina: "https://site.com/b", utm_campaign: "c1", motivo: null },
  ];
  // o 2º, em -03:00, é 2 h atrás no instante (mais novo), mas como texto «…T…-03:00» vinha antes
  const R = RC.resumoRastreio({ itens, dias: 7 }, { agora });
  assert.equal(R.ultimos[0].pagina, "https://site.com/b");
  assert.equal(R.porDia.length, 7); assert.equal(R.porDia.reduce((s, x) => s + x.cliques, 0), 2);
  assert.ok(["/a", "/b"].includes(R.campanhas[0].pagina));
  assert.match(RC.dicaMotivoDominante([{ rotulo: "a mensagem não chegou com o código", n: 8 }, { rotulo: "casou com o negócio", n: 2 }]), /wa\.me\/<número>\?text=/);
  assert.equal(RC.dicaMotivoDominante([{ rotulo: "a mensagem não chegou com o código", n: 2 }]), null, "com poucos cliques, sem dica");
  assert.equal(RC.SRI_V3, `sha384-${createHash("sha384").update(Buffer.from(V3, "utf8")).digest("base64")}`, "o hash da v3 confere com o arquivo");
});

/* ============================================================ LOTE ads-d4 */
test("DA-333/DA-335 · logo e cor da agência validados e aplicados", () => {
  assert.deepEqual(AC.lerCorAgencia("1f6feb"), { ok: true, valor: "#1F6FEB" });
  assert.equal(AC.lerCorAgencia("red").ok, false); assert.deepEqual(AC.lerCorAgencia(""), { ok: true, valor: "" });
  assert.equal(A.corAgencia("#1f6feb"), "#1F6FEB"); assert.equal(A.corAgencia("url(x)"), "");
  assert.match(ADS, /logoValido\(M\.CFG\.agenciaLogoUrl\)/); assert.match(ADS, /raiz\.style\.setProperty\("--ads-marca", corAg\)/);
  assert.match(ADSCFG, /\["agenciaLogoUrl", "O endereço do logo da agência"\]/);
  assert.match(CSS, /\.ads-apr-destaque \{ color: var\(--ads-marca, var\(--c-prim\)\); \}/);
});
test("DA-349/DA-350/DA-379 · Meta × Google pela régua do CRM; sem amostra, sem «mais barato»", () => {
  const pl = [{ p: "meta", t: { gasto: 1000 }, c: { conversas: 50, fecharam: 5 } }, { p: "google", t: { gasto: 1000 }, c: { conversas: 20, fecharam: 4 } }];
  const r = A.comparacaoCrmPlataformas(pl, { brl0, vertical: "loja" });
  assert.deepEqual(r.linhas.map(x => x.texto), ["Meta: R$ 20 por contato no CRM · R$ 200 por venda", "Google: R$ 50 por contato no CRM · R$ 250 por venda"]);
  assert.equal(r.destaque, "Pelo CRM, o Meta trouxe venda mais barato no período.");
  const pouco = A.comparacaoCrmPlataformas([{ ...pl[0], c: { conversas: 5, fecharam: 1 } }, pl[1]], { brl0 });
  assert.equal(pouco.destaque, "", "1 fechamento não é amostra (AMOSTRA_COROA)");
  assert.match(A.POR_QUE_PLATAFORMAS, /Google conta «conversões»/);
  assert.equal(A.coroaPermitida([{ c: { fecharam: 1 } }, { c: { fecharam: 5 } }], "Fechamentos CRM"), false);
});
test("DA-356/DA-357/DA-358 · tempo do funil, perdas por motivo e o caminho para os contatos", () => {
  const M = { R: 40, LEADS: [
    { plat: "meta", i: 30, iAgenda: 32, agendaEstimada: false, fechou: true, iConsulta: 39, etapaReal: "fechou" },
    { plat: "meta", i: 31, iAgenda: 33, agendaEstimada: false, fechou: true, iConsulta: 40, etapaReal: "fechou" },
    { plat: "meta", i: 32, iAgenda: 34, agendaEstimada: false, fechou: true, iConsulta: 41, etapaReal: "fechou" },
    { plat: "meta", i: 33, iAgenda: 33, agendaEstimada: true, etapaReal: "perdida", bruto: { motivo_perda: "Preço" } },
    { plat: "meta", i: 34, etapaReal: "perdida", bruto: {} },
    { plat: null, i: 35, etapaReal: "perdida", bruto: { motivo_perda: "Preço" } } ], dataDe: i => new Date(2026, 9, i) };
  const t = L.temposFunil(M, { dias: 30 });
  assert.equal(t.conversaAgenda, 2); assert.equal(t.conversaFechamento, 9); assert.equal(t.nAgenda, 3, "agendamento estimado fica fora");
  assert.equal(L.textoTemposFunil(t, { ag: "pedido", fe: "venda" }), "Tempo típico (mediana) — da conversa ao pedido: ~2 dias · da conversa ao venda: ~9 dias.");
  assert.equal(L.textoTemposFunil({ ...t, nAgenda: 2, nFechamento: 1 }), "", "poucos casos: nada");
  assert.deepEqual(simples(L.perdasPorMotivo(M, { dias: 30 })), [{ motivo: "Preço", n: 1 }, { motivo: "sem motivo informado", n: 1 }]);
  assert.deepEqual(L.perdasPorMotivo({ ...M, LEADS: M.LEADS.map(l => ({ ...l, bruto: {} })) }, { dias: 30 }), [], "sem motivo nenhum: nada inventado");
  assert.equal(A.linkContatosPeriodo("2026-10-01", "2026-10-24"), "#/contatos?origem=anuncio&criado_de=2026-10-01&criado_ate=2026-10-24");
  assert.match(ADS, /class: "rel-link ads-passo-ver"/);
});
test("DA-360 · texto de renovação pronto", () => {
  const P = { t: { gasto: 2000 }, c: { conversas: 40, agendadas: 10, fecharam: 4, receita: 8000 }, ca: { conversas: 30 }, retorno: 4, rotulo: { titulo: "Setembro", antes: "o mês anterior" } };
  const t = A.textoRenovacao(P, { cliente: "Clínica", agencia: "Agência Alfa", brl0, brl, int, vertical: "odonto" });
  assert.equal(t.split("\n")[0], "*Clínica · Setembro*");
  assert.match(t, /Investimos R\$ 2000 em anúncios e chegaram 40 contatos novos no CRM, com 10 agendamentos\./);
  assert.match(t, /Foram 4 fechamentos, somando R\$ 8000\./); assert.match(t, /Cada R\$ 1 investido virou R\$ 4,00\./);
  assert.match(t, /São 10 contatos a mais que o mês anterior\./); assert.match(t, /— Agência Alfa$/);
  assert.match(ADS, /class: "rel-btn rel-btn-sec ads-copiar-renovacao"/);
});
test("DA-361 · meta de fechamentos do mês com barra", () => {
  assert.deepEqual(A.progressoMetaFechamentos(5, 20, { vertical: "loja", restam: 10 }), { pct: 25, texto: "5 de 20 vendas da meta do mês · faltam 15 em 10 dias" });
  assert.equal(A.progressoMetaFechamentos(25, 20).texto, "25 de 20 fechamentos da meta do mês · meta batida");
  assert.equal(A.progressoMetaFechamentos(3, 0), null);
  assert.deepEqual(AC.lerMetaFechamentos("20"), { ok: true, valor: 20 }); assert.equal(AC.lerMetaFechamentos("2,5").ok, false);
  assert.match(ADS, /role: "progressbar"/);
});
test("DA-365 · «aguardando a 1ª leitura» diz quanto esperar", () => {
  assert.equal(L.textoPilula({ nivel: "aguardando" }), "Aguardando a 1ª leitura (costuma levar até 1 hora)");
});
test("DA-369 · período anterior tracejado sem a opacidade que apagava no claro", () => {
  assert.match(CSS, /\.g-ant \{ opacity: 1; stroke-width: 1\.75; \}/);
});
test("DA-381 · impressão do relatório: fundo branco, sem cortes, capa", () => {
  assert.match(CSS, /\.rel-cartao, \.relat-bloco, \.ads-al \{ break-inside: avoid; page-break-inside: avoid;[^}]*background: Canvas !important/);
  assert.match(CSS, /\.relat-capa-impressao \{ display: block; break-after: page/);
  assert.doesNotMatch(CSS.replace(/:root[^{]*\{[^}]*\}/g, ""), /#[0-9a-f]{3,6}\b(?![\w-])/i, "sem cor fixa fora do :root");
});
test("DA-359/DA-363/DA-364/DA-391/DA-393/DA-394/DA-395/DA-396/DA-397/DA-398/DA-399/DA-400/DA-401 · peças do lote 1 que também fecham itens do ads-d4", () => {
  assert.match(A.textoRetornoSemReceita(0), /aparece com a primeira/);   // DA-359
  assert.match(ADS, /"Investido nos anúncios"/);                         // DA-363
  assert.match(A.textoDadosAtualizados([{ canal: "meta", ultimo_sync: isoMenos(6e5) }, { canal: "google", ultimo_sync: isoMenos(2 * 864e5) }], x => "X"), /Google sem atualizar desde X/);   // DA-364/DA-401
  const mm = A.miniaturasDeMetricas([{ p: "meta", d: "2026-10-01", a: "A1", th: "https://velha" }, { p: "meta", d: "2026-10-05", a: "A1", th: "https://nova" }]);   // DA-391
  assert.equal(mm.get("meta:A1"), "https://nova");
  assert.equal(A.notaLimiteWa("😀".repeat(4000)), "", "DA-397: 4000 emojis = 4000 caracteres");
  assert.equal(A.diasPreviaDiario(100).length, 45);                     // DA-398
  assert.match(A.fatiaOutras(150, 100, brl0, ["tiktok"]).rotulo, /Outras \(TikTok\)/);   // DA-399
  assert.equal(A.destinosRelatorio("diario", { waGestor: ["+351 912 345 678", "00351912345678"] }).length, 1);   // DA-400
  assert.match(A.textoBalde({ fecharam: 2 }, String, "loja"), /2 vendas/);   // DA-396
  assert.match(A.resumoTendencia("Últimos 30 dias", { g: 1, c: 1, ag: 2 }, { vertical: "loja" }), /2 pedidos/);   // DA-395
  const tres = [{ i: 1, gasto: 10 }, { i: 2, gasto: 50 }, { i: 3, gasto: 90 }];   // DA-394: 3 dias não fazem tendência
  assert.doesNotMatch(A.extremosTendencia(tres), /subindo/);
  assert.match(A.extremosTendencia([...tres, { i: 4, gasto: 90 }, { i: 5, gasto: 95 }, { i: 6, gasto: 99 }]), /tendência subindo/);
});
