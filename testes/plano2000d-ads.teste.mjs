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
  assert.equal(A.resumoFunilPlataforma(p, int), "Meta: de 40 conversas no CRM, 6 fecharam (15%).");   // plano 2000d: NX-015 — «CRM» fica em maiúsculas
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
  assert.match(ADS, /L\.nivelCpa\(r\.t\.cpa, meta, r\.t\.gasto, minCor, tolC\)/);   // plano 2000d: NX-070 — com a tolerância do cliente
});
test("DA-191 · meta de custo com exemplo de conta", () => {
  // plano 2000d: NX-050 — o exemplo vem de exemploMetaCusto(tolerância do cliente); com 35% é o mesmo texto de antes
  assert.match(AC.EXEMPLO_META_CUSTO, /Ex\.: meta de R\$ 20/); assert.match(ADSCFG, /\$\{exemploMetaCusto\(tol0\)\}/);
  assert.equal(AC.exemploMetaCusto(35), AC.EXEMPLO_META_CUSTO);
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

/* ============================================================ LOTE ads-x (complemento) · NX-001.. e pendências de outras frentes */
const ADSX = () => ler("web/app/anuncios.js");
test("NX-001 · o botão de WhatsApp do site sem hex literal no código do app (as cores vêm de COR_BOTAO_WA)", () => {
  assert.equal(RC.COR_BOTAO_WA.fundo, "#25D366"); assert.equal(RC.COR_BOTAO_WA.texto, "#FFFFFF");
  assert.match(RC.snippetBotaoWhatsapp("12999998888"), /background:#25D366;color:#FFFFFF/);
  assert.equal(ler("web/app/rastreio-config.js").match(/["'`(\s:,]#[0-9a-fA-F]{6}\b|["'`(\s:,]#[0-9a-fA-F]{3}\b(?![-\w])/g), null);
});
test("NX-002/NX-003/NX-029 · apresentação: impressão sem «null», com a miniatura do campeão; Home/End", () => {
  const S = ADSX();
  assert.match(S, /pg\.append\(\.\.\.\[cp, /); assert.match(S, /s\.imagem \? h\("div", \{ class: "ads-apr-img" \}, h\("img"/);
  assert.match(S, /\.filter\(Boolean\)\); impressao\.append\(pg\);/);
  assert.match(S, /e\.key === "Home" \|\| e\.key === "End"\) \{ e\.preventDefault\(\); ir\(e\.key === "Home" \? 0 : slides\.length - 1\)/);
});
test("NX-004/NX-045 · renovação: «1 contato a mais» e «próximas semanas» fora do mês", () => {
  const P = { t: { gasto: 1000 }, c: { conversas: 11, agendadas: 0, fecharam: 0, receita: 0 }, ca: { conversas: 10 }, rotulo: { titulo: "Últimos 30 dias", antes: "os 30 dias antes" }, periodo: 30 };
  const t = A.textoRenovacao(P, { brl0, brl, int });
  assert.match(t, /É 1 contato a mais que os 30 dias antes\./); assert.doesNotMatch(t, /(^|\s)1 contatos/);
  assert.match(t, /Seguimos nas próximas semanas/);
  assert.match(A.textoRenovacao({ ...P, periodo: "mes_ant" }, { brl0, brl, int }), /Seguimos no próximo mês/);
});
test("NX-005 · marco cortado em 60 caracteres sem partir emoji", () => {
  const l = A.mesclarMarcos([], dia(2), "😀".repeat(70));
  assert.equal(Array.from(l[0].t).length, 60);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(l[0].t), "sem metade de emoji");
});
test("NX-006 · destino de fora do Brasil aparece com «+»", () => {
  assert.deepEqual(A.destinosRelatorio("diario", { waGestor: ["+351 912 345 678", "5512999998888"] }), ["+351912345678", "(12) 99999-8888"]);
});
test("NX-007 · aviso de moeda com o nome certo da plataforma", () => {
  assert.match(A.avisoMoeda([{ canal: "tiktok", moeda: "USD" }]), /a conta do TikTok está em USD/);
  assert.match(A.avisoMoeda([{ canal: "google", currency: "eur" }]), /a conta do Google está em EUR/);
});
test("NX-008/NX-009 · ritmo: começo no meio do mês e dias de atendimento", () => {
  const cedo = A.textoRitmo({ restam: 14, cedo: true, gasto: 100, proj: 0, pass: 17, diasMes: 31, desde: 15 }, 1000, { brl0, brl });
  assert.match(cedo, /começaram no dia 15/); assert.match(cedo, /com 3 dias de anúncio/); assert.match(cedo, /a partir do dia 19/);
  const ab = A.textoRitmo({ restam: 10, cedo: false, gasto: 900, proj: 1500, pass: 21, diasMes: 31, diasAbertosRestantes: 5 }, 1000, { brl0, brl });
  assert.match(ab, /Orçamento diário sugerido: R\$ 20,00 \(somando as plataformas\) por dia de atendimento até o fim do mês/);
  assert.match(A.textoRitmo({ restam: 2, cedo: false, gasto: 900, proj: 1500, pass: 29, diasMes: 31, diasAbertosRestantes: 0 }, 1000, { brl0, brl }), /Não há mais dias de atendimento/);
  assert.match(A.textoRitmo({ restam: 10, cedo: false, gasto: 900, proj: 1500, pass: 21, diasMes: 31 }, 1000, { brl0, brl }), /R\$ 10,00 \(somando as plataformas\) até o fim/);
});
test("NX-010/NX-011 · a descrição do orçamento escreve a conta que o núcleo fez", () => {
  const base = { ano: 2026, mes: 9, gasto: 300, proj: 1000, pass: 17, diasMes: 31, restam: 14 };
  assert.match(A.descricaoOrcamentoMensal({ ...base, desde: 15 }, null, brl0), /÷ 3 dias de anúncio \(desde o dia 15\) × 17 dias até o fim do mês = R\$ 1000/);
  assert.match(A.descricaoOrcamentoMensal({ ...base, diasAbertosRestantes: 9 }, null, brl0), /média dos dias abertos com anúncio × 9 dias abertos que faltam/);
  assert.match(A.descricaoOrcamentoMensal({ ...base, cedo: true, desde: 15, diaMin: 5 }, null, brl0), /a projeção começa no 19º dia do mês \(os anúncios começaram no dia 15\)/);
  assert.match(A.descricaoOrcamentoMensal(base, null, brl0), /÷ 17 dias decorridos × 31 dias do mês/);
  assert.match(ADSX(), /projeção a partir do \$\{\(m\.desde > 1 \? m\.desde : 1\) \+ \(N\.DIAS_MIN_PROJECAO \|\| 5\) - 1\}º dia/);
});
test("NX-012/NX-021 · tendência com as palavras da vertical", () => {
  const serieT = Array.from({ length: 8 }, (_, k) => ({ i: k, gasto: 10 + k, conversas: 1, agendadas: k === 2 ? 1 : 2, fecharam: 0, receita: 0 }));
  const alvo = new No("div");
  const g = A.criarGraficoTendencia(alvo, { G, serie: serieT, rotuloDia: i => `d${i}`, diaLongo: i => `dia ${i}`, fmtMoeda: v => `R$ ${v}`, fmtMoedaCurto: v => `R$ ${v}`, fmtNum: String,
    resumo: "r", seriesExtras: true, palavraAg: ["orçamento", "orçamentos"], palavraFe: ["orçamento aprovado", "orçamentos aprovados"] });
  const nomes = alvo.querySelectorAll(".g-leg-b").map(b => b.textContent);
  assert.ok(nomes.includes("Orçamentos") && nomes.includes("Orçamentos aprovados"), nomes.join("|"));
  g.mostrar(2); assert.match(alvo.querySelector(".g-dica").textContent, /1 orçamento\b/);
  g.destruir();
  assert.match(ADSX(), /tituloTend = `Tendência: investimento × conversas × \$\{WvT\.ag\[1\]\}`/);
});
test("NX-013/NX-014 · janela forte atravessa a meia-noite e não diz «24h»", () => {
  const m = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (let d = 0; d < 7; d++) { m[d][22] = 2; m[d][23] = 2; m[d][0] = 2; m[d][1] = 2; m[d][12] = 1; }
  assert.match(A.sugestaoHorarios(m), /^Das 22h às 2h chegam/);
  const n = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (let d = 0; d < 7; d++) { n[d][20] = 2; n[d][21] = 2; n[d][22] = 2; n[d][23] = 2; n[d][10] = 1; }
  assert.match(A.sugestaoHorarios(n), /^Das 20h à meia-noite chegam/);
});
test("NX-015 · funil por plataforma mantém «CRM»", () => {
  assert.equal(A.resumoFunilPlataforma({ nome: "Google", etapas: [{ id: "convAds", v: 9, rotulo: "Conversões" }, { id: "conversas", v: 10, rotulo: "Conversas no CRM" }, { id: "fe", v: 2, rotulo: "Fecharam" }] }, String),
    "Google: de 10 conversas no CRM, 2 fecharam (20%).");
});
test("NX-016 · a faixa de queda (role=alert) só é refeita quando o texto muda", () => {
  assert.match(ADSX(), /if \(chaveFaixa === faixaFeita\) return;\s+faixaFeita = chaveFaixa;\s+ui\.limpar\(faixa\);/);
});
test("NX-017/NX-018/NX-020/NX-024/NX-026 · visão geral e ranking com as palavras da vertical", () => {
  const S = ADSX();
  assert.match(S, /por \$\{Wv\.ag\[0\]\} ` \/\* plano 2000d · NX-017/);
  assert.match(S, /`1 \$\{Wv\.fe\[0\]\}` : `\$\{N\.int\(c\.semValor\)\} \$\{Wv\.fe\[1\]\}`/);
  assert.match(S, /l: Wv\.agendaram, taxa/); assert.match(S, /l: Wv\.vieram, taxa: L\.razao\(c\.compareceram, c\.agendadas\), tl: `dos \$\{Wv\.ag\[1\]\}`/);
  assert.match(S, /x\.c\.agendadas === 1 \? Wv\.ag\[0\] : Wv\.ag\[1\]\}, \$\{N\.int\(x\.c\.fecharam\)\} \$\{x\.c\.fecharam === 1 \? Wv\.fe\[0\] : Wv\.fe\[1\]\}/);
  assert.match(S, /R\.por === "cpag" \? `\$\{N\.brl\(x\.cpag\)\} por \$\{Wr\.ag\[0\]\}`/);
  assert.doesNotMatch(S, /\$\{N\.int\(x\.c\.agendadas\)\} agendados`/);
});
test("NX-019 · «Ver esses contatos» do balde abre os do período", () => {
  assert.match(ADSX(), /class: "rel-link ads-balde-ver", href: linkContatosPeriodo\(N\.isoDe\(M\.dataDe\(P\.de\)\), N\.isoDe\(M\.dataDe\(P\.ate\)\)\)/);
});
test("DR-306/DR-307 · rosca Meta × Google e calor dia × hora com «Ver como tabela»", () => {
  const S = ADSX();
  assert.match(S, /centro: L\.centroRosca\(fatias\), tabela: true, colunaRotulo: "Plataforma", colunaValor: "Investimento" \}/);
  assert.match(S, /G\.calor\(caixaHora, \{ matriz: ch\.matriz, dias: L\.SEMANA, fmt: fmtC, resumo, tabela: true \}\)/);
});
test("NX-025 · CSV dos criativos com a plataforma legível", () => {
  assert.equal(A.csvCriativos([{ k: { nome: "A", plat: "meta" }, t: {} }]).linhas[0][1], "Meta");
  assert.equal(A.csvCriativos([{ k: { nome: "A", plat: "google" }, t: {} }], p => `<${p}>`).linhas[0][1], "<google>");
});
test("NX-027/NX-046/NX-047 · busca do ranking: contagem certa, relógio solto ao sair e teclado de busca", () => {
  assert.equal(A.textoBuscaRanking(0), "Nenhum anúncio com esse nome no ranking.");
  assert.equal(A.textoBuscaRanking(1), "1 anúncio no ranking."); assert.equal(A.textoBuscaRanking(3), "3 anúncios no ranking.");
  const S = ADSX();
  assert.match(S, /stBusca\.textContent = textoBuscaRanking\(filtrarRanking\(R\.lista, buscaRank\)\.length\)/);
  assert.match(S, /graficos\.push\(\{ destruir: \(\) => clearTimeout\(tB\) \}\)/);
  assert.equal((S.match(/enterkeyhint: "search"/g) || []).length, 2);
});
test("NX-030 · o marco do dia (e da campanha) abre preenchido", () => {
  const ms = [{ d: dia(3), t: "Troca de criativo" }, { d: dia(3), t: "Verba nova", c: "C1" }];
  assert.equal(A.marcoDoDia(ms, dia(3)), "Troca de criativo");
  assert.equal(A.marcoDoDia(ms, dia(3), "C1"), "Verba nova");
  assert.equal(A.marcoDoDia(ms, dia(4)), "");
  assert.match(ADSX(), /dia\.addEventListener\("change", preencher\); sel\.addEventListener\("change", preencher\); preencher\(\);/);
});
test("DA-337 · «Ontem:» na Visão geral com a mesma frase do diário", () => {
  const M = montarDe({ metricas: serie(1, 8) });
  const t = A.leituraOntem(M);
  assert.ok(t.length > 5, t);
  assert.ok(M.relDiario(M.R).split("\n").includes(t), "a mesma linha do diário");
  assert.equal(A.leituraOntem({}), "");
  assert.match(ADSX(), /const txtOntem = S\.plat \? "" : leituraOntem\(M\);/);
});
test("DA-004 · selo «dados parciais» na tabela de campanhas", () => {
  assert.equal(A.tituloDivergencia(null), ""); assert.equal(A.tituloDivergencia({ dias: 0 }), "");
  assert.match(A.tituloDivergencia({ dias: 2, diferenca: 12.5 }, brl), /^Em 2 dias a soma dos anúncios não bateu com o total da campanha \(diferença de R\$ 12,50\)/);
  assert.match(ADSX(), /M\.divergenciasPorCampanha\(P\.de, P\.ate\)/);
  assert.match(ADSX(), /class: "rel-chip rel-chip-aten ads-camp-parcial"/);
});
test("DU-155/NX-048 · a página de atalho tem título neutro e anuncia que está abrindo", () => {
  const html = ler("web/ads/index.html");
  assert.match(html, /<title>Anúncios<\/title>/); assert.match(html, /<p role="status">Abrindo o Nexus Ads…<\/p>/);
});

/* ---------- ads-x · Ajustes de anúncios (ads-config.js) ---------- */
const CFGX = () => ler("web/app/ads-config.js");
test("DA-025/NX-049 · tolerância do aviso de custo no formulário (10–100%) e a prévia conta o custo alto", () => {
  assert.deepEqual(AC.lerLimitesRadar({ rd_toleranciaR1: "20" }), { radar: { toleranciaR1: 20 } });
  assert.equal(AC.lerLimitesRadar({ rd_toleranciaR1: "5" }).erro.msg, "A tolerância do aviso de custo vai de 10% a 100%.");
  assert.equal(AC.toleranciaR1Cfg({ radar: { toleranciaR1: 50 } }), 50); assert.equal(AC.toleranciaR1Cfg({ radar: { toleranciaR1: 500 } }), 35); assert.equal(AC.toleranciaR1Cfg({}), 35);
  assert.match(CFGX(), /ui\.campo\(\{ nome: "rd_toleranciaR1", rotulo: "Tolerância do aviso de custo \(%\)"/);
  // a prévia: custo de R$ 15 por conversa com meta R$ 10 — 50% acima avisa com 35% e não com 60%
  const metricas = Array.from({ length: 7 }, (_, k) => met(dia(k + 1), { g: 30, conv: 2 }));
  const montarCom = radar => N.montar(N.datasetDeLinhas({ metricas, leads: [], hoje: HOJE, dias: 7, cliente: { nome: "X", cfg: { cpaAlvo: 10, radar } } }));
  const p35 = AC.previaLimitesRadar(montarCom, {}, 7), p60 = AC.previaLimitesRadar(montarCom, { toleranciaR1: 60 }, 7);
  assert.ok(p35.n > p60.n, `${p35.n} × ${p60.n}`);
  assert.match(p35.texto, /custo alto, CTR, frequência ou campanha sem conversa/);
});
test("NX-050 · o exemplo da meta segue a tolerância do cliente", () => {
  assert.equal(AC.exemploMetaCusto(), AC.EXEMPLO_META_CUSTO);
  assert.match(AC.exemploMetaCusto(50), /tolerância de 50%, o radar avisa quando o custo por conversa passa de R\$ 30 \(a R\$ 24, 20% acima, ainda sem aviso\)/);
  assert.match(AC.exemploMetaCusto(15), /passa de R\$ 23\.$/);
  assert.match(CFGX(), /O radar avisa quando passa de \$\{tol0\}% acima/);
});
test("AC-063/DA-009 · dias sem atendimento e a pausa nesses dias", () => {
  assert.deepEqual(AC.lerDiasFechados({ fd_0: true, fd_6: true, fd_3: false }), [0, 6]);
  assert.deepEqual(AC.lerDiasFechados({}), []);
  const S = CFGX();
  assert.match(S, /h\("legend", \{ class: "rotulo" \}, "Dias sem atendimento"\)/);
  assert.match(S, /DIAS_SEMANA_CFG\.map\(\(\[d, rot\]\) => ui\.campo\(\{ tipo: "checkbox", nome: `fd_\$\{d\}`/);
  assert.match(S, /diasFechados, pausaDiasFechados: !!v\.pausaDiasFechados && diasFechados\.length > 0/);
  assert.match(ler("web/app/relatorios.css"), /\.cfga-dias \{ display: flex; flex-wrap: wrap;/);
});
test("AC-036 · meta de custo própria por campanha", () => {
  const camps = [{ id: "meta:1", nome: "Implante" }, { id: "google:2", nome: "Busca" }];
  assert.deepEqual(AC.lerMetasCampanha({ "mc_meta:1": "45,50", "mc_google:2": "" }, camps, { "meta:9": 30, "google:2": 80 }), { metas: { "meta:9": 30, "meta:1": 45.5 } });
  assert.deepEqual(AC.lerMetasCampanha({ "mc_meta:1": "0" }, camps).erro, { campo: "mc_meta:1", msg: "A meta de «Implante» precisa ser um valor em reais maior que zero (ou fique vazia)." });
  assert.match(CFGX(), /metasCampanha: mc\.metas \}/);
  // o núcleo usa a meta da campanha (r1 avisa nela e não na da plataforma)
  const M = N.montar(N.datasetDeLinhas({ metricas: serie(1, 7, { g: 40, conv: 2 }), leads: [], hoje: HOJE, dias: 30, cliente: { nome: "X", cfg: { cpaAlvo: 100, metasCampanha: { "meta:C1": 10 } } } }));
  assert.equal(M.metaDaCampanha(M.CAMP["meta:C1"]), 10);
});
test("NX-041/NX-043/NX-044 · cor curta, WhatsApp de fora do Brasil e valor colado em formato americano", () => {
  assert.deepEqual(AC.lerCorAgencia("1af"), { ok: true, valor: "#11AAFF" });
  assert.equal(AC.lerCorAgencia("#12345").ok, false);
  assert.equal(AC.formatarWa("351912345678"), "+351912345678");
  assert.equal(AC.formatarWa("5512999998888"), "+55 (12) 99999-8888");
  assert.equal(AC.lerReais("1,500.50"), 1500.5); assert.equal(AC.lerReais("1.500,50"), 1500.5); assert.equal(AC.lerReais("1,500"), 1.5, "vírgula sozinha continua decimal");
});
test("NX-042 · o mesmo WhatsApp com e sem 55 é gravado uma vez só", () => {
  assert.match(CFGX(), /const numeros = s => destinosUnicos\(String\(s \|\| ""\)\.split/);
  assert.deepEqual(AC.destinosUnicos(["12999998888", "5512999998888"]), ["12999998888"]);
});
test("NX-059 · «Testar conexão» com milhar nas linhas lidas", () => {
  assert.match(AC.textoTesteConexao([{ canal: "meta", ok: true, linhas: 12345 }], "meta", "Meta").texto, /12\.345 linhas lidas/);
});
test("NX-068 · «Sincronizar agora» descansa 1 minuto depois de pedir", () => {
  assert.equal(AC.ESPERA_NOVO_SYNC_MS, 60000);
  const S = CFGX();
  assert.match(S, /bCiclo\.disabled = true; bCiclo\.setAttribute\("aria-describedby", "cfga-x-st"\)/);
  assert.match(S, /tDescanso = setTimeout\(\(\) => \{ bCiclo\.disabled = false;/);
});

/* ---------- ads-x · rel-logica: régua do cliente, vertical e textos ---------- */
test("NX-070 · «perto do limite» do custo segue a tolerância do cliente", () => {
  assert.equal(L.tolCpa({ radar: { toleranciaR1: 60 } }), 60); assert.equal(L.tolCpa({}), 35); assert.equal(L.tolCpa({ radar: { toleranciaR1: 5 } }), 35);
  assert.equal(L.nivelCpa(15, 10, 100, 20), "ruim", "padrão 35%: 50% acima é ruim");
  assert.equal(L.nivelCpa(15, 10, 100, 20, 60), "aten", "com 60%: ainda é atenção");
  assert.match(ADS, /const tolC = L\.tolCpa\(M\.CFG\);/);
});
test("NX-071 · a cor da campanha usa a meta própria dela", () => {
  assert.match(ADS, /const metaCamp = c => \(typeof M\.metaDaCampanha === "function"/);
  assert.match(ADS, /const meta = metaCamp\(r\.c\);/);
});
test("NX-072 · motivos de perda iguais com caixa/acento diferentes somam juntos", () => {
  const M = { R: 40, dataDe: i => new Date(2026, 9, i), LEADS: [
    { plat: "meta", i: 33, etapaReal: "perdida", bruto: { motivo_perda: "Preço" } },
    { plat: "meta", i: 34, etapaReal: "perdida", bruto: { motivo_perda: "preco " } },
    { plat: "meta", i: 35, etapaReal: "perdida", bruto: { motivo_perda: "PREÇO" } },
    { plat: "meta", i: 36, etapaReal: "perdida", bruto: { motivo_perda: "Distância" } } ] };
  assert.deepEqual(L.perdasPorMotivo(M, { dias: 30 }).map(x => ({ ...x })), [{ motivo: "Preço", n: 3 }, { motivo: "Distância", n: 1 }]);
});
test("NX-073 · funil por plataforma com as etapas da vertical", () => {
  const M = montarDe({ metricas: serie(1, 7) });
  const of = L.funilPorPlataforma(M, { dias: 30, vertical: "oficina" });
  assert.deepEqual(of[0].etapas.map(e => e.rotulo).slice(2, 4), ["Pediram orçamento", "Trouxeram o carro"]);
  assert.deepEqual(L.funilPorPlataforma(M, { dias: 30 })[0].etapas.map(e => e.rotulo).slice(2, 4), ["Agendaram", "Compareceram"]);
  assert.match(ADS, /fp\[0\]\.etapas\.map\(e => e\.rotulo\)/);
});
test("NX-074 · «Testar conexão» lê «1.234 linhas» inteiro", () => {
  const r = L.resultadoTesteConexao({ cliente: { integracoes: [{ canal: "meta", ok: true, status: "ok — 1.234 linhas" }, { canal: "google", ok: true, status: "ok — 12 linhas" }] } });
  assert.equal(r[0].linhas, 1234); assert.equal(r[1].linhas, 12);
});
test("NX-075 · chip de Anúncios no dia 1º diz o nome do mês, como os cartões", () => {
  const M = { R: 10, dataDe: i => (i === 11 ? new Date(2026, 9, 1, 12) : new Date(2026, 8, 30, 12)) };
  assert.equal(L.textoChipAnuncios("mes", "", M), "Setembro (até ontem) · Tudo");
  assert.equal(L.textoChipAnuncios("mes", "meta"), "Este mês · Meta");
});
test("NX-076 · centro da rosca com a fatia «Outras» maior", () => {
  assert.deepEqual(L.centroRosca([{ rotulo: "Meta", valor: 10 }, { rotulo: "Outras (TikTok)", valor: 30 }]), { valor: "75%", rotulo: "em outras plataformas" });
  assert.equal(L.centroRosca([{ rotulo: "Meta", valor: 30 }, { rotulo: "Google", valor: 10 }]).rotulo, "no Meta");
});
test("NX-077 · queda da conexão: «hoje às» e «dd/mm às»", () => {
  const agora = Date.now();
  const hoje = L.textoQueda([{ canal: "meta", sync: new Date(agora - 60e3).toISOString() }], agora);
  assert.match(hoje, /^Meta desconectado · dados até (hoje às|\d\d\/\d\d às) \d\d:\d\d\.$/);
  const velho = L.textoQueda([{ canal: "google", sync: new Date(agora - 5 * 864e5).toISOString() }], agora);
  assert.match(velho, /dados até \d\d\/\d\d às \d\d:\d\d\./); assert.doesNotMatch(velho, /hoje/);
});
test("NX-078 · origem de anúncio do TikTok sai com o nome da plataforma", () => {
  assert.equal(L.nomeOrigem("anuncio", "tiktok"), "Anúncio · TikTok");
  assert.equal(L.nomeOrigem("anuncio", "meta"), "Anúncio · Meta");
});

test("NX-079 · status da lista com uma campanha só fica no singular", () => {
  const linha = id => ({ c: { id, nome: id, plat: "meta" }, t: { gasto: 10, conversoes: 1, cpa: 10 }, k: { conversas: 1, agendadas: 0, fecharam: 0, receita: 0 }, roas: null });
  const um = A.criarPainelCampanhas({ h: hh, linhas: [linha("a")], estado: {}, periodo: "7 dias" });
  assert.match(textoDe(um.elemento.querySelector(".ads-camp-resumo")), /^1 de 1 campanha · 7 dias$/);
  const dois = A.criarPainelCampanhas({ h: hh, linhas: [linha("a"), linha("b")], estado: {}, periodo: "7 dias" });
  assert.match(textoDe(dois.elemento.querySelector(".ads-camp-resumo")), /^2 de 2 campanhas/);
});
test("NX-080 · a descrição da regra diz a plataforma dela", () => {
  assert.match(ADS, /\$\{r\.plat \? ` \(\$\{r\.plat === "google" \? "Google" : "Meta"\}\)` : ""\}/);
});

/* ============================================================ ads-x · Rastreio (rastreio-config.js e rastreio.v3.js) — NX-201.. */
{

const NX_CHAVE = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";
const NX_WA = "https://wa.me/5512999990000?text=Ol%C3%A1";
const nxEsperar = ms => new Promise(r => setTimeout(r, ms));
const nxSimples = o => JSON.parse(JSON.stringify(o));   // objeto de outro contexto (vm)
/** elemento mínimo (só atributos, como o script usa) */
function nxEl(tag, attrs = {}) {
  const a = { ...attrs };
  return { nodeType: 1, tagName: tag.toUpperCase(), parentNode: null, attrs: a,
    getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); }, removeAttribute: k => { delete a[k]; } };
}
/** campo de formulário; `eventos` recebe os eventos disparados nele */
function nxCampo(name, { type = "hidden", value = "", attrs = {} } = {}) {
  const eventos = [];
  return { name, type, value, attrs, eventos, getAttribute: k => (k === "type" ? type : k in attrs ? attrs[k] : null), dispatchEvent: e => { eventos.push(e.type); return true; } };
}
/** querySelectorAll dos campos: name="x", name$="[x]" (Elementor) e data-orbita="x" */
function nxCamposQS(inputs) {
  return sel => {
    let m = /^input\[name="([^"]+)"\]$/.exec(sel); if (m) return inputs.filter(i => i.name === m[1]);
    m = /^input\[name\$="\[([^\]]+)\]"\]$/.exec(sel); if (m) return inputs.filter(i => String(i.name).endsWith(`[${m[1]}]`));
    m = /^input\[data-orbita="([^"]+)"\]$/.exec(sel); if (m) return inputs.filter(i => i.attrs && i.attrs["data-orbita"] === m[1]);
    return [];
  };
}

function montarNX({ search = "", hash = "", pathname = "/implante", referrer = "", ua = "", webdriver = false, guardado = null, resposta = null, status = 200, corpoErro = null,
  inputs = [], attrs = {}, cfgJanela = null, antes = {}, mo = null, iframes = [], botoes = [], pendurar = false, prerendering = false } = {}) {
  const ouvintes = {}, loja = new Map(), sessao = new Map(), chamadas = [], navegacao = [], avisos = [], infos = [], atrasos = [];
  if (guardado) loja.set("orbita:rastreio:v3", JSON.stringify(guardado));
  const script = nxEl("script", { "data-chave": NX_CHAVE, ...attrs });
  const qsCampos = nxCamposQS(inputs);
  const document = { currentScript: script, referrer, readyState: "complete", documentElement: mo ? {} : undefined, prerendering,
    addEventListener: (t, f) => { (ouvintes[t] ||= []).push(f); },
    querySelectorAll: sel => {
      if (sel === "iframe") return iframes;
      if (sel === "[data-orbita-wa]") return botoes;
      if (sel === "[data-orbita-original]") return [];
      return qsCampos(sel);
    } };
  const janela = {
    document, addEventListener() {},
    localStorage: { getItem: k => (loja.has(k) ? loja.get(k) : null), setItem: (k, v) => loja.set(k, String(v)), removeItem: k => loja.delete(k) },
    sessionStorage: { getItem: k => (sessao.has(k) ? sessao.get(k) : null), setItem: (k, v) => sessao.set(k, String(v)), removeItem: k => sessao.delete(k) },
    location: { search, hash, hostname: "site.com", origin: "https://site.com", pathname, href: "https://site.com" + pathname + search + hash, assign: u => navegacao.push(u) },
    navigator: { userAgent: ua, webdriver }, history: { pushState() {}, replaceState() {} },
    fetch: (url, init) => {
      chamadas.push({ url, corpo: JSON.parse(init.body) });
      if (pendurar) return new Promise(() => {});
      if (status !== 200) return Promise.resolve({ ok: false, status, json: async () => corpoErro || {} });
      return Promise.resolve({ ok: true, status: 200, json: async () => (resposta ? resposta(chamadas.length) : { ok: true, codigo: "K7Q2P", eventos: true }) });
    },
    AbortController, Promise, setTimeout: (f, ms) => { atrasos.push(ms); return setTimeout(f, ms); }, clearTimeout, JSON, Date, encodeURIComponent, decodeURIComponent,
    String, Object, Number, Array, RegExp, Math,
    console: { warn: (...a) => avisos.push(a.join(" ")), info: (...a) => infos.push(a.join(" ")) }, ...antes,
  };
  if (mo) janela.MutationObserver = mo;
  if (cfgJanela) janela.ORBITA_RASTREIO = cfgJanela;
  janela.window = janela;
  vm.runInContext(V3, vm.createContext(janela), { filename: "rastreio.v3.js" });
  const disparar = (tipo, alvo, extra = {}) => { const ev = { type: tipo, target: alvo, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; for (const f of ouvintes[tipo] || []) f(ev); return ev; };
  return { janela, document, ouvintes, disparar, chamadas, navegacao, avisos, infos, atrasos, loja, sessao,
    guardadoAgora: () => JSON.parse(loja.get("orbita:rastreio:v3") || sessao.get("orbita:rastreio:v3") || "null"), api: janela.OrbitaRastreio };
}
const nxCr = (...a) => { const r = montarNX().api.classificarReferencia(...a); return r == null ? r : nxSimples(r); };

/* ---------------- origem da visita ---------------- */
test("NX-201 · subdomínio do próprio site é navegação interna, não «outro site»", () => {
  assert.equal(nxCr("https://blog.site.com/post", "site.com"), null, "antes: {src: blog.site.com, tipo: site}");
  assert.equal(nxCr("https://site.com/", "loja.site.com"), null);
  assert.equal(nxCr("https://www.clinica.com.br/x", "agenda.clinica.com.br"), null);
  assert.deepEqual(nxCr("https://outra.com.br/x", "loja.clinica.com.br"), { src: "outra.com.br", tipo: "site" }, "«com.br» sozinho nunca casa");
});
test("NX-202 · Telegram, Reddit, Bluesky e o atalho do WhatsApp são redes sociais", () => {
  assert.deepEqual(nxCr("https://t.me/canal", "site.com"), { src: "telegram", tipo: "social" });
  assert.deepEqual(nxCr("https://www.reddit.com/r/x", "site.com"), { src: "reddit", tipo: "social" });
  assert.deepEqual(nxCr("https://bsky.app/profile/x", "site.com"), { src: "bluesky", tipo: "social" });
  assert.deepEqual(nxCr("https://l.wl.co/l?u=x", "site.com"), { src: "whatsapp", tipo: "social" });
});
test("NX-203 · mais buscadores (Qwant, Startpage, Baidu, Naver, AOL)", () => {
  assert.deepEqual(nxCr("https://www.qwant.com/?q=x", "site.com"), { src: "qwant", tipo: "busca" });
  assert.deepEqual(nxCr("https://www.startpage.com/sp/search", "site.com"), { src: "startpage", tipo: "busca" });
  assert.deepEqual(nxCr("https://search.aol.com/x", "site.com"), { src: "aol", tipo: "busca" });
});
test("NX-204 · webmail é «email» (o Gmail no navegador virava «busca do Google»)", () => {
  assert.deepEqual(nxCr("https://mail.google.com/", "site.com"), { src: "gmail", tipo: "email" });
  assert.deepEqual(nxCr("https://outlook.live.com/mail/0/", "site.com"), { src: "outlook", tipo: "email" });
  assert.deepEqual(nxCr("https://mail.yahoo.com/d/folders/1", "site.com"), { src: "yahoo-mail", tipo: "email" });
  assert.deepEqual(nxCr("https://www.google.com/", "site.com"), { src: "google", tipo: "busca" }, "a busca continua busca");
});
test("NX-205 · DeepSeek, Grok e Mistral são assistentes de IA", () => {
  assert.deepEqual(nxCr("https://chat.deepseek.com/a", "site.com"), { src: "deepseek", tipo: "ia" });
  assert.deepEqual(nxCr("https://grok.com/chat/1", "site.com"), { src: "grok", tipo: "ia" });
  assert.deepEqual(nxCr("https://chat.mistral.ai/chat", "site.com"), { src: "mistral", tipo: "ia" });
});
test("NX-216 · Threads e X no navegador interno dos apps", () => {
  assert.deepEqual(nxCr("", "site.com", "Mozilla/5.0 (iPhone) AppleWebKit Barcelona 289.0.0.77"), { src: "threads", tipo: "social" });
  assert.deepEqual(nxCr("", "site.com", "Mozilla/5.0 (Linux; Android 14) TwitterAndroid"), { src: "x", tipo: "social" });
});

/* ---------------- parâmetros da URL ---------------- */
test("NX-206 · utm com e-mail, CPF ou telefone formatado não é guardada (id numérico de campanha é)", () => {
  const api = montarNX().api;
  const r = nxSimples(api.capturar("?utm_source=news&utm_term=maria%40email.com&utm_content=(12)%2099999-8888&utm_medium=123.456.789-09"));
  assert.deepEqual(r, { utm_source: "news" }, "antes: o e-mail, o telefone e o CPF iam para o aparelho e para o Órbita");
  assert.equal(nxSimples(api.capturar("?utm_campaign=120210000000000000")).utm_campaign, "120210000000000000", "id do Meta (18 dígitos) continua");
  assert.equal(nxSimples(api.capturar("?utm_source=@clinica")).utm_source, "@clinica", "@perfil sem domínio não é e-mail");
});
test("NX-207 · macro não trocada pela plataforma não vira campanha nem apaga a verdadeira", () => {
  const api = montarNX().api;
  assert.deepEqual(nxSimples(api.capturar("?utm_campaign=%7Bcampaignid%7D&utm_content={{ad.id}}&utm_term=__CID__&gclid={gclid}&utm_source=google")), { utm_source: "google" });
  const g = { v: 3, t: Date.now() - 1000, d: { utm_source: "meta", utm_campaign: "9" }, c: null, r: null };
  const m = montarNX({ search: "?utm_campaign={{campaign.id}}&fbclid=__X__", guardado: g });
  assert.equal(m.guardadoAgora().d.utm_campaign, "9", "antes: «{{campaign.id}}» trocava a campanha guardada");
});
test("NX-214 · «&amp;» de endereço copiado de HTML não esconde a campanha", () => {
  const api = montarNX().api;
  assert.deepEqual(nxSimples(api.capturar("?a=1&amp;utm_source=meta&amp;utm_campaign=7")), { utm_source: "meta", utm_campaign: "7" });
});

/* ---------------- privacidade do envio ---------------- */
test("NX-208 · pedaço do caminho com cara de token vira «-»; slug comum fica", () => {
  const api = montarNX().api;
  assert.equal(api.caminhoSeguro("/redefinir/a8F3k2L9q0Z7x6C5v4B3n2M1"), "/redefinir/-");
  assert.equal(api.caminhoSeguro("/pedido/9f86d081884c7d659a2feaa0c55ad015"), "/pedido/-");
  assert.equal(api.caminhoSeguro("/implante-dentario-em-taubate-2026"), "/implante-dentario-em-taubate-2026");
  assert.equal(api.caminhoSeguro("/blog/clareamento-dental-quanto-custa"), "/blog/clareamento-dental-quanto-custa");
});
test("NX-209 · a página enviada tem no máximo 300 caracteres", async () => {
  const m = montarNX({ pathname: "/" + "categoria/".repeat(100) });
  m.disparar("click", nxEl("a", { href: NX_WA }));
  await nxEsperar(10);
  assert.ok(m.chamadas[0].corpo.p_dados.pagina.length <= 300, "antes: o caminho inteiro (o servidor recusa p_dados acima de 8 KB)");
});

/* ---------------- falhas e robôs ---------------- */
test("NX-210 · o motivo da falha em português no diagnóstico", async () => {
  const m = montarNX({ status: 400, corpoErro: { code: "22023", message: "limite_taxa" } });
  await m.api.codigo();
  assert.equal(m.api.diagnostico().ultimoErro.motivo, "limite de cliques por minuto atingido", "antes: «http»");
  const s = montarNX({ status: 503 });
  await s.api.codigo();
  assert.match(s.api.diagnostico().ultimoErro.motivo, /fora do ar \(erro 503\)/);
});
test("NX-211 · chave pública recusada (401): para de pedir e avisa uma vez no console", async () => {
  const m = montarNX({ status: 401 });
  await m.api.codigo();
  assert.equal(m.chamadas.length, 1);
  assert.equal(m.avisos.filter(a => /recusou o acesso \(401\)/.test(a)).length, 1, "antes: só com ?orbita_debug");
  await nxEsperar(5);
  m.disparar("click", nxEl("a", { href: NX_WA }));
  await nxEsperar(10);
  assert.equal(m.chamadas.length, 1, "o clique seguinte não insiste");
  assert.equal(m.navegacao[0], NX_WA, "o link segue sem código");
  assert.equal(m.api.diagnostico().recusada, true);
});
test("NX-212 · robôs não registram nada; celular CUBOT não é robô", async () => {
  const m = montarNX({ search: "?utm_source=google&gclid=G1", ua: "Mozilla/5.0 (compatible; AdsBot-Google; +http://www.google.com/adsbot.html)" });
  await nxEsperar(10);
  const ev = m.disparar("click", nxEl("a", { href: NX_WA }));
  await nxEsperar(10);
  assert.equal(m.chamadas.length, 0, "antes: o AdsBot gerava aquecimento e clique a cada visita");
  assert.equal(ev.defaultPrevented, true); assert.equal(m.navegacao[0], NX_WA, "o link segue o original, sem esperar");
  const w = montarNX({ search: "?utm_source=meta&utm_campaign=1", webdriver: true }); await nxEsperar(10);
  assert.equal(w.chamadas.length, 0);
  const c = montarNX({ search: "?utm_source=meta&utm_campaign=1", ua: "Mozilla/5.0 (Linux; Android 10; CUBOT X30) Chrome/120" }); await nxEsperar(10);
  assert.equal(c.chamadas.length, 1);
  assert.equal(m.api.diagnostico().robo, true);
});
test("NX-213 · página pré-renderizada só aquece quando a pessoa abre", async () => {
  const m = montarNX({ search: "?utm_source=meta&utm_campaign=1", prerendering: true });
  await nxEsperar(10);
  assert.equal(m.chamadas.length, 0, "antes: a pré-renderização já criava um código");
  m.document.prerendering = false;
  for (const f of m.ouvintes.prerenderingchange || []) f({});
  await nxEsperar(10);
  assert.equal(m.chamadas.length, 1); assert.equal(m.chamadas[0].corpo.p_dados.evento, "aquecimento");
});

/* ---------------- contatos, encurtadores e links ---------------- */
test("NX-215 · sms: e Telegram contam como contato", () => {
  const cc = montarNX().api.canalContato;
  assert.equal(cc("sms:+5512999990000"), "sms"); assert.equal(cc("https://t.me/clinica"), "telegram"); assert.equal(cc("https://telegram.me/clinica"), "telegram");
});
test("NX-217 · mais encurtadores reconhecidos", () => {
  const api = montarNX().api;
  for (const u of ["https://rb.gy/abc", "https://t.ly/x", "https://tiny.cc/x", "https://v.gd/x", "https://qrco.de/x"]) assert.equal(api.ehEncurtador(u), true, u);
});
test("NX-231 · código vencido no href volta ao original antes do ctrl+clique", () => {
  const m = montarNX();
  const a = nxEl("a", { href: `${NX_WA}%20%5Bref%20OLD22%5D`, "data-orbita-original": NX_WA });
  m.disparar("click", a, { ctrlKey: true });
  assert.equal(a.getAttribute("href"), NX_WA, "antes: o [ref] velho seguia para a nova aba");
  const b = nxEl("a", { href: `${NX_WA}%20%5Bref%20OLD22%5D`, "data-orbita-original": NX_WA });
  m.disparar("contextmenu", b);
  assert.equal(b.getAttribute("href"), NX_WA, "copiar link também sai sem o código vencido");
});
test("NX-229/NX-230 · API: codigo() é aquecimento; link() de mensagem curta não cria código", async () => {
  const m = montarNX();
  await m.api.codigo();
  assert.equal(m.chamadas[0].corpo.p_dados.evento, "aquecimento", "antes: cada leitura contava um clique");
  const n = montarNX();
  assert.equal(await n.api.link("https://wa.me/message/ABCDEF"), "https://wa.me/message/ABCDEF");
  assert.equal(n.chamadas.length, 0, "antes: criava um código que nunca ia na mensagem");
});

/* ---------------- acessibilidade e iframes ---------------- */
test("NX-218 · <div data-orbita-wa> ganha foco e abre pelo teclado", async () => {
  const div = nxEl("div", { "data-orbita-wa": NX_WA }), btn = nxEl("button", { "data-orbita-wa": NX_WA }), comTab = nxEl("span", { "data-orbita-wa": NX_WA, tabindex: "-1", role: "button" });
  const m = montarNX({ botoes: [div, btn, comTab] });
  assert.equal(div.getAttribute("tabindex"), "0"); assert.equal(div.getAttribute("role"), "link");
  assert.equal(btn.getAttribute("tabindex"), null, "<button> já é focável");
  assert.equal(comTab.getAttribute("tabindex"), "-1"); assert.equal(comTab.getAttribute("role"), "button", "o que o site definiu fica");
  const ev = m.disparar("keydown", div, { key: "Enter" });
  assert.equal(ev.defaultPrevented, true);
  await nxEsperar(20);
  assert.equal(m.navegacao.length, 1, "antes: Enter no div não fazia nada"); assert.match(m.navegacao[0], /%5Bref%20K7Q2P%5D$/);
  m.disparar("keydown", nxEl("input"), { key: "Enter" }); await nxEsperar(5);
  assert.equal(m.navegacao.length, 1, "Enter fora do botão não é tocado");
});
test("NX-219 · iframe que carrega depois e iframe inserido depois são ligados", () => {
  const ouvA = {}, ouvB = {}, ouvIfr = {};
  const ifr = { contentDocument: { addEventListener: (t, f) => { (ouvA[t] ||= []).push(f); } }, addEventListener: (t, f) => { ouvIfr[t] = f; } };
  let cb = null; const MO = function (f) { cb = f; this.observe = () => {}; };
  const lista = [ifr];
  montarNX({ iframes: lista, mo: MO });
  assert.equal((ouvA.click || []).length, 1);
  ifr.contentDocument = { addEventListener: (t, f) => { (ouvB[t] ||= []).push(f); } };
  ouvIfr.load();
  assert.equal((ouvB.click || []).length, 1, "antes: o documento carregado (depois do about:blank) ficava sem o ouvinte");
  const ouvC = {}; lista.push({ contentDocument: { addEventListener: (t, f) => { (ouvC[t] ||= []).push(f); } } });
  cb([{ addedNodes: [{ nodeType: 1, tagName: "IFRAME" }] }]);
  assert.equal((ouvC.click || []).length, 1, "antes: iframe inserido depois era ignorado");
});
test("NX-220 · com data-consentimento, o iframe é ligado já no carregamento", () => {
  const ouv = {}, ifr = { contentDocument: { addEventListener: (t, f) => { (ouv[t] ||= []).push(f); } } };
  montarNX({ iframes: [ifr], attrs: { "data-consentimento": "aguardar" } });
  assert.equal((ouv.click || []).length, 1, "antes: só com consentimento no carregamento — consentir() depois nunca ligava o iframe");
});

/* ---------------- formulários ---------------- */
test("NX-221 · Elementor (form_fields[utm_source]) e data-orbita=\"utm_campaign\" recebem a origem", () => {
  const a = nxCampo("form_fields[utm_source]"), b = nxCampo("campanha_crm", { attrs: { "data-orbita": "utm_campaign" } });
  montarNX({ search: "?utm_source=meta&utm_campaign=55", inputs: [a, b] });
  assert.equal(a.value, "meta"); assert.equal(b.value, "55");
});
test("NX-222 · campo preenchido pelo script acompanha a campanha nova; o do site não", async () => {
  const meu = nxCampo("utm_campaign"), doSite = nxCampo("utm_source", { value: "manual" });
  const m = montarNX({ search: "?utm_source=meta&utm_campaign=1", inputs: [meu, doSite] });
  assert.equal(meu.value, "1");
  m.janela.location.search = "?utm_source=google&utm_campaign=2";
  m.janela.history.pushState({}, "", "/b");
  await nxEsperar(10);
  assert.equal(meu.value, "2", "antes: ficava a campanha antiga");
  assert.equal(doSite.value, "manual");
});
test("NX-223 · orbita_ref recebe o código assim que ele chega", async () => {
  const ref = nxCampo("orbita_ref");
  montarNX({ search: "?utm_source=meta&utm_campaign=1", inputs: [ref] });
  assert.equal(ref.value, "");
  await nxEsperar(20);
  assert.equal(ref.value, "K7Q2P", "antes: só no próximo carregamento ou envio");
});
test("NX-224 · o campo preenchido avisa o formulário (input e change)", () => {
  const c = nxCampo("utm_source");
  montarNX({ search: "?utm_source=meta", inputs: [c], antes: { Event: class { constructor(t, o) { this.type = t; this.bubbles = !!(o && o.bubbles); } } } });
  assert.deepEqual(c.eventos, ["input", "change"]);
});
test("NX-225 · revogar esvazia os campos que o script preencheu", () => {
  const meu = nxCampo("utm_campaign"), doSite = nxCampo("utm_source", { value: "manual" });
  const m = montarNX({ search: "?utm_source=meta&utm_campaign=1", inputs: [meu, doSite] });
  assert.equal(meu.value, "1");
  m.api.revogar();
  assert.equal(meu.value, "", "antes: a origem seguia no próximo envio"); assert.equal(doSite.value, "manual");
});

/* ---------------- configuração ---------------- */
test("NX-226 · chave em maiúsculas funciona", () => {
  assert.equal(montarNX({ attrs: { "data-chave": NX_CHAVE.toUpperCase() } }).api.ativo(), true, "antes: rastreio desligado");
});
test("NX-227 · data-url só https (ou o servidor local de teste)", async () => {
  const m = montarNX({ cfgJanela: { chave: NX_CHAVE, url: "http://exemplo.com/rpc" } });
  await m.api.codigo();
  assert.match(m.chamadas[0].url, /^https:\/\/.*\/rpc\/nx_rastreio_registrar$/, "antes: ia sem criptografia");
  assert.ok(m.avisos.some(a => /data-url precisa começar com https/.test(a)));
  const l = montarNX({ cfgJanela: { chave: NX_CHAVE, url: "http://127.0.0.1:8787/rpc" } });
  await l.api.codigo();
  assert.equal(l.chamadas[0].url, "http://127.0.0.1:8787/rpc");
});
test("NX-228 · data-dias no máximo 90 e data-espera no máximo 5 s", () => {
  const m = montarNX({ cfgJanela: { chave: NX_CHAVE, dias: 365, espera: 60000 }, pendurar: true });
  assert.equal(m.api.diagnostico().guardaEm, "localStorage, 90 dias");
  m.disparar("click", nxEl("a", { href: NX_WA }));
  assert.ok(m.atrasos.includes(5000), "a espera do clique foi limitada");
  assert.ok(!m.atrasos.includes(60000), "antes: 60 s com o botão parado");
});
test("NX-232/NX-233 · ?orbita_debug=1 depois do # e diagnóstico mais completo", () => {
  const m = montarNX({ hash: "#/contato?orbita_debug=1" });
  assert.ok(m.infos.some(i => /\[Órbita rastreio\] diagnóstico/.test(i)), "antes: o # era ignorado");
  const d = nxSimples(montarNX({ attrs: { "data-consentimento": "aguardar" } }).api.diagnostico());
  assert.equal(d.versao, 3); assert.equal(d.consentimento, "aguardar"); assert.equal(d.robo, false); assert.equal(d.recusada, false);
  assert.equal(nxSimples(montarNX().api.diagnostico()).consentimento, "automatico");
});

/* ---------------- painel (rastreio-config.js) ---------------- */
test("NX-234/NX-235 · com a v3, a política e o aviso citam o tipo de origem, os toques em contato e os formulários", () => {
  const p3 = RC.textoPolitica("X", { versao: 3 }), p2 = RC.textoPolitica("X", { versao: 2 });
  assert.match(p3, /numa visita sem campanha, só o tipo de origem/); assert.match(p3, /telefone, e-mail, SMS, Instagram Direct, Messenger e Telegram/);
  assert.doesNotMatch(p2, /tipo de origem|SMS/);
  assert.match(RC.textoPrivacidade({ versao: 3 }), /campos escondidos/); assert.doesNotMatch(RC.textoPrivacidade({ versao: 2 }), /campos escondidos/);
});
test("NX-236 · texto de privacidade com data-dias acima de 90 diz 90", () => {
  assert.match(RC.textoPrivacidade({ dias: 365 }), /por até 90 dias/);
  assert.match(RC.textoPolitica("X", { dias: 120 }), /por até 90 dias e sem cookies/);
  assert.match(RC.textoPrivacidade({ dias: 7 }), /por até 7 dias/);
});
test("NX-237/NX-238 · páginas com acento legíveis e o «Testar» em português", () => {
  assert.equal(RC.caminhoDe("https://s.com/implant%C3%A1rio/"), "/implantário");
  assert.equal(RC.paginaCurta("https://s.com/clareamento-r%C3%A1pido?x=1"), "/clareamento-rápido");
  assert.equal(RC.caminhoDe("https://s.com/%E0%A4%A"), "/%E0%A4%A", "sequência inválida fica como veio");
  assert.equal(RC.paginaCurta("teste-do-painel"), "teste do painel");
});
test("NX-239/NX-240 · botão pronto: zero de discagem sai; pílula acima da barra do iPhone", () => {
  assert.match(RC.snippetBotaoWhatsapp("012 99999-8888"), /wa\.me\/5512999998888\?/, "antes: wa.me/55012…");
  assert.match(RC.snippetBotaoWhatsapp("0055 12 99999-8888"), /wa\.me\/5512999998888\?/);
  const b = RC.snippetBotaoWhatsapp("12 99999-8888");
  assert.match(b, /border-radius:28px/); assert.match(b, /min-width:56px/); assert.doesNotMatch(b, /[;"]width:56px/, "antes: círculo de 56 px com o texto vazando");
  assert.match(b, /bottom:calc\(16px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});
test("NX-241 · a caixa do código do botão só aparece com número válido", () => {
  assert.match(RCFG, /"aria-label": "Código do botão do WhatsApp", hidden: true/);
  assert.match(RCFG, /preBotao\.hidden = !cod;/);
});

/* ---------------- marca e SRI ---------------- */
test("NX · cada mudança marcada e o SRI da v3 confere com o arquivo", () => {
  for (let n = 201; n <= 241; n++) assert.ok(V3.includes(`NX-${n}`) || RCFG.includes(`NX-${n}`), `NX-${n} sem marca`);
  assert.equal(RC.SRI_V3, `sha384-${createHash("sha384").update(Buffer.from(V3, "utf8")).digest("base64")}`);
  assert.equal(RC.VERSOES[2].publicada, false, "a v3 continua não publicada");
});
}

/* ============================================================ ads-x · Relatórios (relatorios.js e relatorios.css) — NX-301.. */
{
const int = v => Math.round(+v).toLocaleString("pt-BR");
const brl0 = v => `R$ ${Math.round(+v).toLocaleString("pt-BR")}`;
/** o trecho do CSS depois da marca (o bloco novo) */
const blocoCss = id => { const i = CSS.indexOf(`plano 2000d · ${id}`); assert.ok(i > 0, `marca ${id} no CSS`); return CSS.slice(i, i + 900); };

test("NX-301 · «Carteira agora» no singular com 1 aberto e no gênero do vocabulário", () => {
  assert.equal(RL.rotuloAbertos(1), "negócio aberto");
  assert.equal(RL.rotuloAbertos(3), "negócios abertos");
  assert.equal(RL.rotuloAbertos(1, { negocio: "venda", negocios: "vendas", fem: true }), "venda aberta");
  assert.equal(RL.rotuloAbertos(0, { negocio: "venda", negocios: "vendas", fem: true }), "vendas abertas");
  assert.match(REL, /rotuloAbertos\(k\.abertos, \{ negocio: negSing, negocios: negPl, fem \}\)/);
});
test("NX-302 · carteira sem valor não mostra «— previstos» solto", () => {
  assert.deepEqual(RL.pedacosCarteira({ valor_aberto: 1000, previsao_ponderada: null, valor_perdido: "" }), ["valor_aberto"]);
  assert.deepEqual(RL.pedacosCarteira({}), []);
  assert.deepEqual(RL.pedacosCarteira({ valor_aberto: 0, previsao_ponderada: 10, valor_perdido: 5 }), ["valor_aberto", "previsao_ponderada", "valor_perdido"]);
  assert.match(REL, /temC\.includes\("valor_perdido"\) \? ` \(\$\{brl0\(k\.valor_perdido\)\} previstos\)` : ""/);
});
test("NX-303 · subtítulo do funil no feminino («ganhas e perdidas: fechadas»)", () => {
  assert.match(RL.subFunil(true), /\(ganhas e perdidas: fechadas no período\)/);
  assert.match(RL.subFunil(false), /\(ganhos e perdidos: fechados no período\)/);
  assert.equal(RL.flexao("criado", 1, true), "criada");
  assert.equal(RL.flexao("criado", 0, false), "criados");
  assert.match(REL, /sub: subFunil\(fem\)/);
});
test("NX-304 · séries de vendas e o «melhor dia» no feminino", () => {
  const s = RL.seriesVendas(true);
  assert.equal(s.criados, "Criadas"); assert.equal(s.ganhos, "Ganhas"); assert.equal(s.ganhosDe(1), "ganha"); assert.equal(s.ganhosDe(2), "ganhas");
  assert.equal(RL.seriesVendas(false).criados, "Criados");
  assert.match(REL, /series: \[\{ nome: SV\.criados, classe: "g-s1" \}, \{ nome: SV\.ganhos, classe: "g-s0" \}\]/);
  assert.ok(REL.includes("com ${int(melhor.v)} ${SV.ganhosDe(melhor.v)}"));
});
test("NX-305 · resumo da rosca de origem no feminino", () => {
  const o = [{ rotulo: "Site", criados: 1, ganhos: 1 }, { rotulo: "Meta", criados: 3, ganhos: 2, anuncio: true }];
  const t = RL.resumoOrigens(o, int, { fem: true });
  assert.match(t, /Site 1 criada e 1 ganha/);
  assert.match(t, /Meta 3 criadas e 2 ganhas/);
  assert.match(t, /sem anúncio: 1 criada e 1 ganha/);
  assert.match(RL.resumoOrigens(o, int), /Site 1 criado e 1 ganho/);
  assert.match(REL, /resumoOrigens\(orig, int, \{ fem \}\)/);
  assert.match(REL, /centro: \{ valor: int\(tot\), rotulo: flexao\("criado", tot, fem\) \}/);
});
test("NX-306 · colunas de «Por responsável» no gênero (tabela e CSV iguais)", () => {
  assert.deepEqual(RL.colunasDono(true), ["Responsável", "Criadas", "Ganhas", "Conversão", "Receita", "Ticket médio", "Abertas agora"]);
  assert.equal(RL.colunasDono(true, true)[3], "Conversão %");
  assert.match(REL, /colunas: colunasDono\(fem\),/);
});
test("NX-307 · bloco de parados no feminino e com «1 dia» certo", () => {
  const t = RL.textosParados({ fem: true, negocios: "Vendas", qtd: 1, diasMax: 12 });
  assert.equal(t.titulo, "Paradas há mais de 7 dias");
  assert.equal(t.sub, "Vendas abertas que não mudam de etapa há uma semana.");
  assert.equal(t.total, "1 parada");
  assert.equal(t.antigo, "A mais antiga está parada há 12 dias.");
  assert.equal(RL.textosParados({ qtd: 3 }).total, "3 parados");
  assert.equal(RL.textosParados({ diasMax: null }).antigo, "");
  assert.match(REL, /const bp = cartao\(TP\.titulo,/);
});
test("NX-308 · cada etapa parada tem um nome inteiro para o leitor de tela", () => {
  assert.equal(RL.rotuloParado({ nome: "Proposta", qtd: 3, valor: 9000 }, { int, brl0, temValor: true }), "Proposta: 3 parados, R$ 9.000 previstos");
  assert.equal(RL.rotuloParado({ nome: "Visita", qtd: 1 }, { fem: true, int }), "Visita: 1 parada");
  assert.equal(RL.rotuloParado({ qtd: 2 }, { int }), "Etapa sem nome: 2 parados");
  assert.match(REL, /h\("li", \{ "aria-label": rotuloParado\(p, \{ fem, int, brl0, temValor: rp\.temValor \}\) \}/);
});
test("NX-309 · parados exportam CSV (etapa, quantidade, valor, dias)", () => {
  assert.deepEqual(RL.linhasCsvParados([{ nome: "Proposta", qtd: "3", valor: 900, dias_max: 15 }, null, { nome: "Visita", qtd: 1 }]),
    [["Proposta", 3, 900, 15], ["Visita", 1, "", ""]]);
  assert.match(REL, /csv: par\.length \? \{ nome: "parados",/);
});
test("NX-310 · resumo do funil sem «Funil :» e com milhar", () => {
  assert.equal(RL.resumoFunil("", [{ nome: "Lead", qtd_atual: 1500 }], int), "Funil: Lead 1.500");
  assert.equal(RL.resumoFunil("Vendas", [{ nome: "Lead", qtd_atual: 2 }, { nome: "Ganho", qtd_atual: 1 }], int), "Funil Vendas: Lead 2, Ganho 1");
  assert.doesNotMatch(REL, /resumo: `Funil \$\{fr \? fr\.nome : ""\}:/);
});
test("NX-311 · resumo da rosca de perdas com milhar", () => {
  assert.equal(RL.resumoMotivos([{ nome: "Preço", qtd: 1500 }, { nome: "Prazo", qtd: 2 }], int), "Motivos de perda: Preço 1.500, Prazo 2");
  assert.match(REL, /resumo: resumoMotivos\(mot, int\)/);
});
test("NX-312 · CSV dos motivos com a coluna % da tabela", () => {
  assert.deepEqual(RL.linhasCsvMotivos([{ nome: "Preço", qtd: 2, valor: 100 }, { nome: "Prazo", qtd: 1, valor: 50 }]), [["Preço", 2, 66.7, 100], ["Prazo", 1, 33.3, 50]]);
  assert.deepEqual(RL.linhasCsvMotivos([{ nome: "X", qtd: 0, valor: 0 }]), [["X", 0, "", 0]]);
  assert.match(REL, /colunas: \["Motivo", "Quantidade", "%", "Valor previsto"\], linhas: \(\) => linhasCsvMotivos\(mot\)/);
});
test("NX-313 · CSV do funil: ganho/perdido sem «Seguiram» e «Conversão» (igual à tabela)", () => {
  const l = RL.linhasCsvFunil([{ nome: "Lead", tipo: "aberto", qtd_atual: 5, valor_atual: 10, passaram: 8, avancaram: 4, conversao_proxima_pct: 50 },
    { nome: "Ganho", tipo: "ganho", qtd_atual: 3, valor_atual: 9, passaram: 3, avancaram: 0, conversao_proxima_pct: 300 }]);
  assert.deepEqual(l, [["Lead", 5, 10, 8, 4, 50], ["Ganho", 3, 9, 3, "", ""]]);
});
test("NX-314 · «Dia mais movimentado … com 1 nova» (antes «1 novas»)", () => {
  assert.equal(RL.qtdPalavra(1, "nova", "novas", int), "1 nova");
  assert.equal(RL.qtdPalavra(1200, "nova", "novas", int), "1.200 novas");
  assert.ok(REL.includes(`com \${qtdPalavra(melhor.v, "nova", "novas", int)}.`));
});
test("NX-315 · resumo por departamento com plural e milhar", () => {
  assert.equal(RL.resumoDepartamentos([{ nome: "Vendas", novas: 1 }, { nome: null, novas: 1500 }], int), "Por departamento: Vendas 1 nova, Sem departamento 1.500 novas");
  assert.match(REL, /resumo: resumoDepartamentos\(dep, int\)/);
});
test("NX-316 · resumo por número com plural, milhar e número sem nome", () => {
  assert.equal(RL.resumoCanais([{ nome: "Loja", msgs_in: 1, msgs_out: 2000 }, { numero_exibicao: "+55 12 9999-0000", msgs_in: 0, msgs_out: 1 }], int),
    "Por número: Loja 1 recebida e 2.000 enviadas; +55 12 9999-0000 0 recebidas e 1 enviada");
  assert.equal(RL.nomeCanal({}), "Número sem nome");
  assert.match(REL, /itens: can\.map\(c => \(\{ rotulo: nomeCanal\(c\),/);
});
test("NX-317 · pico do calor dito por extenso («à 1 hora», «à meia-noite»)", () => {
  assert.equal(RL.horaFalada(1), "à 1 hora");
  assert.equal(RL.horaFalada(0), "à meia-noite");
  assert.equal(RL.horaFalada(12), "ao meio-dia");
  assert.equal(RL.horaFalada(14), "às 14 horas");
  assert.equal(RL.horaFalada(24), "");
  assert.match(REL, /\$\{L\.SEMANA\[pico\.dow\]\} \$\{horaFalada\(pico\.hora\)\}/);
});
test("NX-318 · «Por atendente» em ordem de conversas (antes a ordem do servidor)", () => {
  const l = RL.linhasAtendente([{ nome: "Bia", conversas: 3, resolvidas: 1 }, { nome: "Ana", conversas: 9 }, { nome: "Caio", conversas: 3, resolvidas: 2 }]);
  assert.deepEqual(l.map(a => a.nome), ["Ana", "Caio", "Bia"]);
  assert.match(REL, /const at = linhasAtendente\(r\.por_atendente \|\| \[\]\);/);
});
test("NX-319 · atendente sem nome vira «Sem atendente»", () => {
  assert.equal(RL.linhasAtendente([{ nome: null, conversas: 2 }])[0].nome, "Sem atendente");
  assert.deepEqual(RL.linhasAtendente([null, "x"]), []);
});
test("NX-320 · atendente que saiu da equipe ganha a marca", () => {
  const l = RL.linhasAtendente([{ nome: "Rui", ativo: false, conversas: 1 }, { nome: "Lia", removido_em: "2026-01-01" }]);
  assert.deepEqual(l.map(a => [a.nome, a.exEquipe]), [["Rui (fora da equipe)", true], ["Lia (fora da equipe)", true]]);
});
test("NX-321 · responsável sem nome vira «Sem responsável»", () => {
  assert.equal(RL.linhasDono([{ nome: null, ganhos: 1 }])[0].nome, "Sem responsável");
  assert.equal(RL.linhasDono([{ ativo: false }])[0].nome, "Sem responsável (fora da equipe)");
});
test("NX-322 · linha «Total» em «Por responsável» (conversão e ticket do total)", () => {
  const t = RL.totalLinhas([{ criados: 10, ganhos: 2, receita: 1000, abertos: 3 }, { criados: "10", ganhos: 3, receita: 500, abertos: null }], ["criados", "ganhos", "receita", "abertos"]);
  assert.deepEqual(t, { criados: 20, ganhos: 5, receita: 1500, abertos: 3, conversao_pct: 25, ticket_medio: 300 });
  assert.equal(RL.totalLinhas([], ["criados", "ganhos"]).conversao_pct, null);
  assert.match(REL, /total: \["Total", int\(tD\.criados\)/);
  assert.match(REL, /total && linhas\.length > 1 \? h\("tfoot"/);
});
test("NX-323 · linha «Total» em «Por atendente»", () => {
  assert.deepEqual(RL.totalLinhas([{ conversas: 2, resolvidas: 1, msgs_out: 10 }, { conversas: 3, resolvidas: 3, msgs_out: 5 }], ["conversas", "resolvidas", "msgs_out"]), { conversas: 5, resolvidas: 4, msgs_out: 15 });
  assert.match(REL, /total: \["Total", int\(tAt\.conversas\), int\(tAt\.resolvidas\), "—", int\(tAt\.msgs_out\)\]/);
});
test("NX-324 · resposta do memo mostra a hora em que ELA chegou", () => {
  const m = new Map([["k", { t: 1700000000000, r: {} }]]);
  assert.equal(RL.horaMemo(m, "k"), 1700000000000);
  assert.equal(RL.horaMemo(m, "outra"), null);
  assert.equal(RL.horaMemo(null, "k"), null);
  assert.match(REL, /const tm = horaMemo\(memo, chaveMemo\);/);
  assert.match(REL, /horaCarga\.classList\.toggle\("relat-hora-velha", Date\.now\(\) - tm >= HORA_VELHA_MS\)/);
});
test("NX-325 · «Atualizar» ocupado por aria-disabled (o foco do teclado não cai no body)", () => {
  assert.doesNotMatch(REL, /btnAtualizar\.disabled = /);
  assert.match(REL, /btnAtualizar\.setAttribute\("aria-disabled", "true"\)/);
  assert.match(blocoCss("NX-325"), /\.rel-btn\[aria-disabled="true"\] \{ opacity: \.55; cursor: progress; \}/);
});
test("NX-326 · «Ver 30 dias» do vazio devolve o foco ao período", () => {
  assert.match(REL, /fn: \(\) => \{ P\.preset = maior; salvar\(\); pintarSeg\(\); pintarChip\(\); carregar\(\); focarPeriodo\(\); \}/);
  assert.match(REL, /function focarPeriodo\(\) \{/);
});
test("NX-327 · chip-resumo diz o que é para o leitor de tela", () => {
  assert.equal(RL.rotuloChip("Últimos 7 dias · Todos os funis"), "Período e filtros: Últimos 7 dias · Todos os funis. Toque para mudar.");
  assert.match(REL, /chipResumo\.setAttribute\("aria-label", rotuloChip\(chipTxt\.textContent\)\)/);
});
test("NX-328 · cada bloco é região nomeada pelo seu título", () => {
  assert.match(REL, /"aria-labelledby": idT \},\s*h\("div", \{ class: "rel-cartao-topo" \}, h\("h2", \{ class: "rel-h2", id: idT \}, titulo\)/);
});
test("NX-329 · faixa mais movimentada dita em texto (não só pela cor)", () => {
  assert.match(REL, /h\("span", \{ class: "sr-only" \}, " \(a faixa mais movimentada\)"\)/);
});
test("NX-330 · funil/departamento escolhido entra no nome do arquivo", () => {
  assert.equal(RL.sufixoFiltro({ atual: "f2", lista: [{ id: "f1", nome: "A" }, { id: "f2", nome: "Pós-venda" }] }), "Pós-venda");
  assert.equal(RL.sufixoFiltro({ atual: "", lista: [{ id: "f1", nome: "A" }] }), "");
  assert.equal(RL.sufixoFiltro(null), "");
  assert.match(REL, /"png", ctx\.cliente\.nome, sufixoFiltro\(filtroExtra\)\)/);
  assert.match(REL, /"csv", ctx\.cliente\.nome, sufixoFiltro\(filtroExtra\)\)/);
});
test("NX-331 · na impressão o título da página vira o nome do PDF (e volta depois)", () => {
  assert.equal(RL.tituloImpressao({ aba: "vendas", cliente: "Clínica Sol", de: "2026-10-01", ate: "2026-10-24" }), "Relatório de vendas · Clínica Sol · 01-10-2026 a 24-10-2026");
  assert.equal(RL.tituloImpressao({ aba: "atendimento", cliente: "A/B", de: "2026-10-05", ate: "2026-10-05", filtro: "Suporte" }), "Relatório de atendimento · A-B · Suporte · 05-10-2026");
  assert.match(REL, /window\.addEventListener\("beforeprint", antes\); window\.addEventListener\("afterprint", depois\);/);
  assert.match(REL, /if \(tirarImpressao\) \{ try \{ tirarImpressao\(\); \}/);
});
test("NX-332 · parado com valor: o valor na 4ª coluna da grade", () => {
  assert.match(blocoCss("NX-332"), /\.relat-parados li:has\(\.relat-parado-valor\) \{ grid-template-columns: auto minmax\(0, 1fr\) auto auto; \}/);
});
test("NX-333 · nome de etapa parada comprido quebra (360 px)", () => {
  assert.match(blocoCss("NX-333"), /\.relat-parado-nome \{ min-width: 0; overflow-wrap: anywhere; \}/);
  assert.match(REL, /class: "relat-parado-nome"/);
});
test("NX-334 · alto contraste: período escolhido e faixa forte visíveis", () => {
  const b = blocoCss("NX-334");
  assert.match(b, /@media \(forced-colors: active\)/);
  assert.match(b, /\.rel-seg-b\[aria-pressed="true"\] \{ outline: 2px solid CanvasText;/);
  assert.match(b, /\.relat-faixa-forte \{ border: 2px solid CanvasText; \}/);
});
test("NX-335 · impressão sem o «Por que difere» fechado", () => {
  assert.match(blocoCss("NX-335"), /\.relat-por-que \{ display: none !important; \}/);
});
test("NX-336 · impressão no meio do «Atualizar» não sai esmaecida", () => {
  assert.match(blocoCss("NX-336"), /\.relat-atualizando \{ opacity: 1 !important; \}/);
});
test("NX-337 · linha «Total» estilizada e legível no modo cartão (≤ 480 px)", () => {
  const b = blocoCss("NX-337");
  assert.match(b, /\.relat-tabela tfoot th, \.relat-tabela tfoot td \{ font-weight: 700;/);
  assert.match(b, /@media \(max-width: 480px\) \{\s*\.relat-tabela tfoot \{ display: block; \}/);
});
test("NX-338 · botões de período quebram de linha (sem rolagem lateral)", () => {
  assert.match(blocoCss("NX-338"), /\.relat-filtros \.rel-seg \{ flex-wrap: wrap; max-width: 100%; \}/);
});
test("DR-403/RC-243/RC-246 · etapa zerada, «i» da taxa, link da etapa e «Copiar tabela» com estilo fora do Início", () => {
  assert.match(blocoCss("DR-403"), /\.g-fetapa\.g-fzero \.g-ftrilho \{ background: repeating-linear-gradient\(90deg, var\(--c-borda\) 0 4px, transparent 4px 8px\); \}/);
  assert.match(CSS, /\.g-fetapa\.g-fzero \.g-fqtd \{ color: var\(--c-texto-2\); \}/);
  const b = blocoCss("RC-243");
  assert.match(b, /^plano 2000d · RC-243[^\n]*\n\.g-flink \{/);
  assert.match(b, /\n\.g-fdica-bt \{ display: inline-grid;/);
  assert.match(CSS, /\n\.g-fdica-txt \{ grid-column: 1 \/ -1;/);
  assert.match(CSS, /\n\.g-copiar-tabela \{ min-height: 36px;/);
  assert.match(CSS, /\.g-copiar-tabela \{ min-height: 44px; \}/);
  assert.match(CSS, /\.g-fdica-bt \{ width: 44px; height: 44px;/);
});
test("NX · marcas: cada mudança nova leva o comentário do plano", () => {
  for (let n = 301; n <= 338; n++) assert.ok(REL.includes(`NX-${n}`) || CSS.includes(`NX-${n}`), `NX-${n} marcado`);
});

}
