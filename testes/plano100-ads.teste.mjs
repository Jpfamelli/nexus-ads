/* ============================================================
   ÓRBITA — plano «100+ melhorias», frente F (Anúncios, Relatórios e Rastreio): F1…F15
   node --test testes/plano100-ads.teste.mjs      (Node puro, sem rede e sem navegador)
   A lógica roda pura (rel-logica, rastreio-config, ads-config); a tela «Site e anúncios» roda num DOM mínimo com ui/api
   falsos; o script do site (web/rastreio.js) roda num contexto vm com window/document/fetch falsos.
   Cada teste de correção falha no código antigo (anotado em «antes:»).
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ler = f => readFileSync(join(RAIZ, f), "utf8");
const N = await import("../web/nucleo.js");
const L = await import("../web/app/rel-logica.js");
const RC = await import("../web/app/rastreio-config.js");
const AC = await import("../web/app/ads-config.js");

/* ---------- dados: uma clínica com 1 campanha Meta e leads de todos os tipos ---------- */
const HOJE = "2026-10-08";
const dia = n => L.somarDias(HOJE, -n);   // n dias antes de hoje
const metricas = [];
for (let n = 1; n <= 20; n++) metricas.push({ p: "meta", d: dia(n), n: "anuncio", c: "C1", cn: "Implante · vídeo", a: "A1", an: "Vídeo do doutor", g: 50, imp: 1000, cli: 20, conv: 4, freq: 1.2, alc: 800 });
const LEADS = [
  // de anúncio reconhecido, fechou com valor informado
  { id: 1, nome: "Ana", origem: "anuncio", plataforma: "meta", anuncio_ext: "A1", campanha_ext: "C1", etapa: "fechou", servico: "Implante", data_conversa: dia(6), data_agenda: dia(5), data_consulta: dia(4), valor: 3000, hora_conversa: 9 },
  // origem anúncio sem plataforma nem ids (marcado à mão): balde «sem campanha identificada»; fechou sem valor, serviço com ticket configurado → estimativa
  { id: 2, nome: "Bia", origem: "anuncio", plataforma: null, anuncio_ext: null, campanha_ext: null, etapa: "fechou", servico: "Clareamento", data_conversa: dia(6), data_agenda: dia(5), data_consulta: dia(3), valor: null, hora_conversa: 21 },
  // Meta com anúncio que a métrica ainda não trouxe: balde meta:nao_identificada
  { id: 3, nome: "Caio", origem: "anuncio", plataforma: "meta", anuncio_ext: "AINDA-NAO-SINCRONIZADO", campanha_ext: null, etapa: "agendada", servico: "Implante", data_conversa: dia(3), data_agenda: dia(2), data_consulta: null, valor: null, hora_conversa: null },
  // fechou sem valor e serviço sem ticket: não soma receita (semValor)
  { id: 4, nome: "Davi", origem: "anuncio", plataforma: "meta", anuncio_ext: "A1", campanha_ext: "C1", etapa: "fechou", servico: "Botox", data_conversa: dia(8), data_agenda: dia(7), data_consulta: dia(6), valor: null, hora_conversa: 9 },
  // orgânico: fora do funil de anúncios
  { id: 5, nome: "Eva", origem: "whatsapp", plataforma: null, etapa: "nova", data_conversa: dia(2), hora_conversa: 14 },
];
const montarM = ({ cfg = {}, leads = LEADS, mets = metricas } = {}) => N.montar(N.datasetDeLinhas({ metricas: mets, leads, hoje: HOJE, dias: 130, cliente: { nome: "Clínica Teste", cfg } }));
const brl0 = v => `R$ ${Math.round(v)}`;

/* ============================================================ F1 — fee de gestão e receita estimada */
test("F1 · fee 0 por padrão: «Retorno sobre anúncios» (receita ÷ anúncios), sem nota de gestão; com fee configurado, «Retorno total» e a nota para todos", () => {
  const M0 = montarM();
  const P0 = L.numerosPeriodo(M0, { dias: 30 });
  assert.equal(P0.fee, 0); assert.equal(P0.gestao, false);
  assert.equal(P0.retorno, P0.roas, "sem gestão o retorno total é o retorno sobre anúncios");
  const r0 = L.rotulosRetorno(P0, brl0);
  assert.deepEqual([r0.olho, r0.nota, r0.gestao], ["Retorno sobre anúncios", "receita ÷ investimento em anúncios", null], "antes: «Retorno total … (anúncios + gestão)» com R$ 997 inventados");
  const P1 = L.numerosPeriodo(montarM({ cfg: { fee: 600 } }), { dias: 30 });
  assert.equal(P1.gestao, true); assert.equal(P1.fee, 600);
  assert.ok(P1.retorno < P1.roas, "a gestão entra no denominador");
  const r1 = L.rotulosRetorno(P1, brl0);
  assert.deepEqual([r1.olho, r1.nota, r1.gestao], ["Retorno total", "receita ÷ (anúncios + gestão)", "inclui R$ 600 de gestão no período"]);
  assert.equal(L.rotulosRetorno({ ...P1, plat: "meta" }).olho, "Retorno sobre Meta", "com plataforma filtrada, nunca gestão");
  // o KPI de investimento mostra a gestão para TODOS (antes: só gestor via `eGestor(ctx)`)
  const k1 = L.kpisAnuncios(P1, { meta: 15, brl0, gestor: false });
  assert.equal(k1[0].extra, "+ R$ 600 de gestão no período");
  assert.equal(L.kpisAnuncios(P0, { meta: 15, brl0 })[0].extra, "");
});

test("F1 · receita estimada só pelo ticket que o cliente configurou: KPI com estimativa:true e ajuda que separa o estimado do informado; sem ticket, nada inventado", () => {
  const Msem = montarM();
  const Psem = L.numerosPeriodo(Msem, { dias: 30 });
  assert.equal(Psem.c.receita, 3000, "só o valor informado (antes: + R$ 420 da tabela odontológica padrão para cada fechamento sem valor)");
  assert.equal(Psem.c.semValor, 2); assert.equal(Psem.estimada, false);
  const ks = L.kpisAnuncios(Psem, { meta: 15, brl0, int: String });
  const rec = ks.find(k => k.id === "receita");
  assert.equal(rec.estimativa, false); assert.equal(rec.extra, "2 fechamentos sem valor informado");
  const Pcom = L.numerosPeriodo(montarM({ cfg: { ticket: { Clareamento: 800 } } }), { dias: 30 });
  assert.equal(Pcom.c.receitaEstimada, 800); assert.equal(Pcom.c.receitaReal, 3000); assert.equal(Pcom.estimada, true);
  const kc = L.kpisAnuncios(Pcom, { meta: 15, brl0 }).find(k => k.id === "receita");
  assert.equal(kc.estimativa, true, "ui.kpi({estimativa:true}) marca «estimado» e «≈»");
  assert.match(kc.ajuda, /R\$ 800 estimados[^;]*; R\$ 3000 informados/);
  assert.equal(kc.v, 3800);
});

test("F1 · a tela usa os rótulos e os KPIs da lógica: ui.kpi com estimativa e a nota de gestão sem filtro de papel", () => {
  const a = ler("web/app/anuncios.js");
  assert.match(a, /const rot = L\.rotulosRetorno\(P, N\.brl0\);/);
  assert.match(a, /rot\.gestao \? h\("p", \{ class: "rel-nota ads-gestao" \}, rot\.gestao\) : null/);
  assert.match(a, /ui\.kpi\(\{ rotulo: k\.l, [\s\S]{0,500}?estimativa: !!k\.estimativa \}\)/);
  assert.doesNotMatch(a, /P\.fee > 0 && eGestor\(ctx\)/, "a gestão não fica escondida do cliente");
  const cfg = ler("web/app/ads-config.js");
  assert.match(cfg, /const PADRAO = \{ cpaAlvo: 15, orcamento: 1500, fee: 0, assinatura: "" \};/, "Ajustes de anúncios: fee padrão 0 (antes 997)");
  assert.doesNotMatch(cfg, /5512997552370/, "placeholder sem telefone de cliente real");
});

/* ============================================================ F2 — balde «Anúncio sem campanha identificada» */
test("F2 · lead de anúncio sem campanha reconhecida entra no funil (herói) no balde próprio; nunca vira linha nem ranking; a sobra se divide em balde × pausadas", () => {
  const M = montarM();
  const P = L.numerosPeriodo(M, { dias: 30 });
  assert.equal(P.c.conversas, 4, "Ana, Bia, Caio e Davi (a Eva é orgânica)");
  const { linhas, total, outras, semCampanha, pausadas } = L.linhasCampanhas(M, { dias: 30 });
  assert.deepEqual(linhas.map(r => r.c.id), ["meta:C1"], "o balde nunca é uma linha de campanha");
  assert.equal(semCampanha.conversas, 2); assert.equal(semCampanha.agendadas, 2); assert.equal(semCampanha.fecharam, 1);
  assert.deepEqual(semCampanha.ids.sort(), ["anuncio:nao_identificada", "meta:nao_identificada"]);
  assert.equal(total.ag + outras.ag, P.c.agendadas, "Total + sobra = herói");
  assert.equal(pausadas.ag, outras.ag - semCampanha.agendadas);
  assert.equal(L.semCampanhaTot(M, P.de, P.ate, { plat: "meta" }).conversas, 1, "filtro por plataforma");
  assert.ok(!L.rankingCriativos(M, { dias: 30, por: "cpa" }).lista.some(x => /nao_identificada/.test(x.k.id)));
  // plataforma desconhecida: «Anúncio» (antes rel-logica dizia «Sem anúncio» para um lead de anúncio)
  assert.equal(L.nomePlat("anuncio"), "Anúncio"); assert.equal(L.nomePlat(null), "Sem anúncio");
  const fp = L.funilPorPlataforma(M, { dias: 30 });
  assert.deepEqual(fp.map(x => x.plat), ["meta", "anuncio"], "o funil por plataforma mostra o anúncio sem plataforma");
  assert.equal(fp[1].nome, "Anúncio");
});

test("F2/F12 · Relatórios → Vendas «por origem» com a régua do Anúncios: WhatsApp + Meta vira «Anúncio · Meta»; orgânico com plataforma continua orgânico; campanha só quando o servidor manda", () => {
  const por = [
    { origem: "anuncio", plataforma: "meta", criados: 5, ganhos: 2, perdidos: 1, receita: 4000 },
    { origem: "whatsapp", plataforma: "meta", criados: 2, ganhos: 1, perdidos: 0, receita: 1000, campanha_nome: "Implante · vídeo" },
    { origem: "organico", plataforma: "meta", criados: 3, ganhos: 0, perdidos: 1, receita: 0 },
    { origem: "site", plataforma: null, criados: 4, ganhos: 1, perdidos: 1, receita: 900 },
    { origem: "formulario", plataforma: null, criados: 1, ganhos: 0, perdidos: 0, receita: 0 },
    null, "lixo",
  ];
  const o = L.origensVendas(por);
  const m = new Map(o.map(x => [x.rotulo, x]));
  assert.ok(m.has("Anúncio · Meta"), "antes: «WhatsApp · Meta» separado do anúncio");
  assert.deepEqual([m.get("Anúncio · Meta").criados, m.get("Anúncio · Meta").ganhos, m.get("Anúncio · Meta").receita], [7, 3, 5000]);
  assert.equal(m.get("Anúncio · Meta").conversao_pct, 75);
  assert.deepEqual(m.get("Anúncio · Meta").campanhas, ["Implante · vídeo"]);
  assert.ok(m.has("Orgânico · Meta") && !m.get("Orgânico · Meta").anuncio, "link da bio do Instagram não é anúncio");
  assert.equal(m.get("Site").conversao_pct, 50);
  assert.ok(m.has("Formulário do site"));
  assert.equal(o[0].rotulo, "Anúncio · Meta", "ordenado por criados");
  assert.deepEqual(L.totalAnuncioVendas(o), { criados: 7, ganhos: 3, receita: 5000 });
  assert.ok(L.ehOrigemAnuncio("anuncio", null) && L.ehOrigemAnuncio("whatsapp", "google") && !L.ehOrigemAnuncio("organico", "meta") && !L.ehOrigemAnuncio("site", null));
  const rel = ler("web/app/relatorios.js");
  assert.match(rel, /const orig = L\.origensVendas\(r\.por_origem \|\| \[\]\);/);
  assert.match(rel, /typeof G\.donut === "function" \? G\.donut : G\.rosca/, "rosca com legenda para a origem (F13)");
});

test("F2 · a tela mostra o balde: nota no herói e a linha «Anúncio sem campanha identificada» no rodapé das Campanhas", () => {
  const a = ler("web/app/anuncios.js");
  assert.match(a, /L\.semCampanhaTot\(M, P\.de, P\.ate, \{ plat: S\.plat \}\)/);
  assert.match(a, /"Anúncio sem campanha identificada"\)/);
  assert.match(a, /const \{ linhas, total, outras, semCampanha, pausadas \} = L\.linhasCampanhas/);
});

/* ============================================================ F3 — calor dia × hora */
test("F3 · calor dia × hora com hora_conversa: célula certa (dia da semana em SP × hora), sem hora fica fora e é contado; RPC antiga → indisponível", () => {
  const M = montarM();
  const c = L.calorHora(M, { dias: 30 });
  assert.equal(c.disponivel, true);
  assert.equal(c.total, 3, "Ana (9h), Bia (21h), Davi (9h); Caio sem mensagem; Eva orgânica");
  assert.equal(c.semHora, 1);
  const dow = n => M.dataDe(M.LEADS.find(x => x.id === n).i).getDay();
  assert.equal(c.matriz[dow(1)][9] + (dow(4) === dow(1) ? 0 : 0), dow(4) === dow(1) ? 2 : 1);
  assert.equal(c.matriz[dow(2)][21], 1);
  assert.equal(c.matriz.flat().reduce((a, b) => a + b, 0), 3);
  assert.equal(L.calorHora(M, { dias: 30, plat: "meta" }).total, 2, "filtro por plataforma");
  const antigo = montarM({ leads: LEADS.map(({ hora_conversa, ...x }) => x) });
  assert.equal(L.calorHora(antigo, { dias: 30 }).disponivel, false, "sem o campo a tela volta ao calor por semana");
  const a = ler("web/app/anuncios.js");
  assert.match(a, /if \(ch\.disponivel\) \{ corpo\.append\(cartaoF, cartaoCalorHora\(ch, periodoTexto\)\); return; \}/);
  assert.match(a, /G\.calor\(alvo, \{ matriz: ch\.matriz/);
  assert.doesNotMatch(a, /A hora da conversa não vem com os dados de anúncios/, "o aviso antigo sumiu");
  // a % da faixa mais forte vem de fx.faixas (fx.forte é a soma crua, sem pct: a tela escrevia «undefined%» — achado no navegador)
  const fx = L.faixasCalor(c.matriz);
  assert.equal(fx.forte.pct, undefined);
  assert.equal(fx.faixas.find(x => x.nome === fx.forte.nome).pct, 67);
  assert.match(a, /const forte = fx\.forte \? fx\.faixas\.find\(x => x\.nome === fx\.forte\.nome\) : null;/);
});

/* ============================================================ F4 — Google: conversões rotuladas e r2 só com conversão rastreada */
test("F4 · Google sem nenhuma conversão na janela: o Radar troca os «Campanha sem conversa» do Google por 1 aviso informativo; Meta continua avisando", () => {
  const mets = [...metricas];
  for (let n = 1; n <= 10; n++) mets.push({ p: "google", d: dia(n), n: "campanha", c: "G1", cn: "Pesquisa implante", g: 40, imp: 500, cli: 30, conv: 0 });
  const M = montarM({ mets });
  assert.ok(!M.avaliar(M.R, true).some(a => a.regra.id === "r2" && a.chave === "r2|google:G1"),
    "integração: o núcleo também deixa de disparar r2 para o Google sem acompanhamento (o WhatsApp do nx-ciclo para junto)");
  assert.equal(L.googleSemConversao(M), true);
  const R = L.montarRadar(M, {});
  assert.ok(!R.atuais.some(a => a.chave === "r2|google:G1"), "antes: crítico diário «gastou sem nenhuma conversa» para sempre");
  assert.ok(!R.episodios.some(e => e.chave === "r2|google:G1"));
  const info = R.episodios.find(e => e.regra === "google_sem_conversao");
  assert.ok(info && info.ativo && info.sev === "info");
  assert.equal(R.ativos, R.atuais.length + 1);
  assert.equal(L.explicarRegra("google_sem_conversao").acao.includes("acompanhamento de conversões"), true);
  const Mok = montarM({ mets: [...metricas, { p: "google", d: dia(1), n: "campanha", c: "G1", cn: "x", g: 40, imp: 500, cli: 30, conv: 1.5 }] });
  assert.equal(L.googleSemConversao(Mok), false);
});

test("F4 · conversões por plataforma com rótulo próprio: Google em conversões (com fração), Meta em conversas no WhatsApp", () => {
  const f = { int: v => String(Math.round(v)), dec: (v, c) => v.toFixed(c).replace(".", ","), brl: v => `R$ ${v.toFixed(2).replace(".", ",")}` };
  assert.equal(L.textoConvPlat("google", { conversoes: 1.5, cpa: 20 }, f), "1,5 conversões (Google) · custo por conversão R$ 20,00", "antes: «2 conversões» arredondado e chamado de conversa");
  assert.equal(L.textoConvPlat("google", { conversoes: 1, cpa: 30 }, f), "1 conversão (Google) · custo por conversão R$ 30,00");
  assert.equal(L.textoConvPlat("meta", { conversoes: 12, cpa: 8.5 }, f), "12 conversas no WhatsApp · custo por conversa R$ 8,50");
  assert.equal(L.textoConvPlat("meta", { conversoes: 0, cpa: null }, f), "0 conversas no WhatsApp · custo por conversa —");
  const P = L.numerosPeriodo(montarM(), { dias: 30 });
  assert.equal(L.kpisAnuncios(P, { temGoogle: false })[1].l, "Custo por conversa (Meta)");
  assert.equal(L.kpisAnuncios(P, { temGoogle: true })[1].l, "Custo por conversão da plataforma");
});

/* ============================================================ F5 — leitura parcial */
test("F5 · status «parcial — …» do nx-ciclo vira estado próprio (não «Atualizado»): pílula «Leitura parcial · Meta», erro continua mandando", () => {
  const agora = Date.parse("2026-10-08T12:00:00Z");
  const sync = "2026-10-08T11:40:00Z";
  const integ = [{ canal: "meta", ativo: true, ultimo_sync: sync, status: "parcial — 0 linhas (sem dados desde 2026-09-30)" }, { canal: "google", ativo: true, ultimo_sync: sync, status: "ok — 3 linhas" }];
  const e = L.estadoIntegracao(integ, [], agora);
  assert.equal(e.nivel, "parcial", "antes: «ok» e a pílula dizia «Atualizado há 20 min»");
  assert.equal(e.canais[0].estado, "parcial");
  assert.equal(L.textoPilula(e, agora), "Leitura parcial · Meta");
  const comErro = L.estadoIntegracao([...integ, { canal: "google", ativo: true, ultimo_sync: sync, status: "erro — token" }], [], agora);
  assert.equal(comErro.nivel, "erro");
  assert.equal(L.estadoIntegracao([{ canal: "meta", ativo: true, ultimo_sync: sync, status: "ok — 9 linhas" }], [], agora).nivel, "ok");
});

/* ============================================================ F6 — Testar conexão */
test("F6 · «Testar conexão» entende a resposta real (cliente.integracoes + explicacao) e a do servidor falso (sync + falhas) e explica por plataforma", () => {
  const real = { ok: true, teste: true, janela: 1, cliente: { cliente: "x", ok: false, integracoes: [
    { canal: "meta", ok: true, status: "ok — 12 linhas", linhas: 12 },
    { canal: "google", ok: false, status: "erro — Google 401", explicacao: { curto: "o refresh token do Google venceu", acao: "Gere um refresh token novo.", passageiro: false } }] } };
  const lr = L.resultadoTesteConexao(real);
  assert.deepEqual(lr.map(x => [x.canal, x.ok, x.linhas]), [["meta", true, 12], ["google", false, null]]);
  assert.deepEqual(AC.textoTesteConexao(lr, "meta", "Meta"), { tom: "ok", texto: "Conexão com o Meta funcionando — 12 linhas lidas do último dia." });
  assert.deepEqual(AC.textoTesteConexao(lr, "google", "Google"), { tom: "ruim", texto: "O refresh token do Google venceu. Gere um refresh token novo." });
  const falso = { ok: false, hoje: HOJE, dias: 1, clientes: [{ cliente: "sorriso-vivo", ok: false, dias: 1, sync: { meta: "erro — fetch failed", google: "parcial — 0 linhas (sem dados desde 2026-09-30)" },
    falhas: [{ canal: "meta", curto: "o Meta não está respondendo", acao: "Nada a fazer agora: a leitura tenta de novo na próxima hora.", passageiro: true }] }] };
  const lf = L.resultadoTesteConexao(falso);
  assert.equal(AC.textoTesteConexao(lf, "meta", "Meta").tom, "aten", "erro passageiro não é vermelho");
  assert.match(AC.textoTesteConexao(lf, "meta", "Meta").texto, /^O Meta não está respondendo\. Nada a fazer agora.*\(Costuma ser passageiro\.\)$/);
  assert.deepEqual(AC.textoTesteConexao(lf, "google", "Google"), { tom: "aten", texto: "O Google respondeu, mas a leitura veio parcial: 0 linhas (sem dados desde 2026-09-30)." });
  assert.equal(AC.textoTesteConexao([], "meta", "Meta").tom, "aten", "sem a plataforma: pede para salvar e ligar");
  assert.deepEqual(L.resultadoTesteConexao(null), []);
  const cfg = ler("web/app/ads-config.js");
  assert.match(cfg, /api\.fn\("nx-ciclo", \{ dias: 1 \}\)/, "nx-ciclo pelo painel: {token, cliente, dias:1}");
  assert.match(cfg, /Há campos digitados e não salvos/, "o teste usa os dados salvos e avisa quando há algo digitado");
});

/* ============================================================ F7–F10 — tela «Site e anúncios» num DOM mínimo */
class No {
  constructor(tag) { this.tag = String(tag).toLowerCase(); this.tagName = this.tag.toUpperCase(); this.nodeType = 1; this.attrs = {}; this.childNodes = []; this.parentNode = null; this.ev = {}; this.hidden = false; this.disabled = false; this.isConnected = true; this.value = ""; const self = this;
    this.style = { setProperty() {} }; this.dataset = new Proxy({}, { set(o, k, v) { o[k] = String(v); self.attrs[`data-${k}`] = String(v); return true; } });
    this.classList = { add: (...c) => { self.attrs.class = [...new Set([...self._cls(), ...c])].join(" "); }, remove: () => {}, toggle: () => {}, contains: c => self._cls().includes(c) }; }
  _cls() { return String(this.attrs.class || "").split(/\s+/).filter(Boolean); }
  get className() { return this.attrs.class || ""; } set className(v) { this.attrs.class = String(v); }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get textContent() { return this.nodeType === 3 ? this._t : this.childNodes.map(c => c.textContent).join(""); }
  set textContent(v) { this.childNodes = []; if (v !== "") this.append(String(v)); }
  append(...xs) { for (const x of xs.flat(Infinity)) { if (x == null || x === false) continue; const n = typeof x === "object" ? x : txt(x); n.parentNode = this; this.childNodes.push(n); } }
  appendChild(x) { this.append(x); return x; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, fn) { (this.ev[t] ||= []).push(fn); }
  click() { for (const fn of this.ev.click || []) fn({ type: "click", target: this, preventDefault() {} }); }
  focus() { No.foco = this; }
  querySelectorAll(sel) { const out = []; const anda = n => { for (const c of n.children) { if (casa(c, sel)) out.push(c); anda(c); } }; anda(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
const txt = v => { const n = new No("#text"); n.nodeType = 3; n._t = String(v); return n; };
const casa = (n, sel) => (sel.startsWith("#") ? n.attrs.id === sel.slice(1) : sel.startsWith(".") ? n._cls().includes(sel.slice(1)) : n.tag === sel);
function h(tag, attrs = {}, ...filhos) {
  const el = new No(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.attrs.class = Array.isArray(v) ? v.filter(Boolean).join(" ") : String(v);
    else if (k === "on") for (const [t, fn] of Object.entries(v)) el.addEventListener(t, fn);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style") continue;
    else if (k === "hidden") el.hidden = true;
    else if (k === "value") { el.value = String(v); el.attrs.value = String(v); }
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...filhos);
  return el;
}
const tique = () => new Promise(r => setTimeout(r, 0));
const botao = (raiz, re) => raiz.querySelectorAll("button").find(b => re.test(b.textContent));

function telaRastreio({ chaves = [null, "a".repeat(48), "b".repeat(48)], listar = null, respostaModal = true, publica = null } = {}) {
  const chamadas = [], modais = [], toasts = [], copiados = [], comandos = [];
  let k = 0;
  const ui = {
    h, limpar: el => { for (const c of el.childNodes) c.isConnected = false; el.childNodes = []; }, esqueleto: () => h("div", { class: "sk" }), icone: n => h("i", { class: `ic ic-${n}` }),
    carregarCss() {}, copiar: async t => { copiados.push(t); }, toast: (t, o) => { toasts.push([t, o]); }, carregando: (_b, p) => p,
    modal: async o => { modais.push(o); return respostaModal; }, kpi: o => h("article", { class: "kpi" }, h("p", { class: "kpi-rot" }, o.rotulo), h("p", { class: "kpi-valor" }, String(o.valor))),
    pilula: (t, c) => h("span", { class: "pilula" }, t ?? c), vazio: o => h("div", { class: "vazio" }, o.titulo), erroCartao: e => h("div", { class: "erro" }, String(e && e.message || e)), checkSucesso() {},
  };
  const api = {
    rpcC: async (nome, p) => {
      chamadas.push(["rpcC", nome, p]);
      if (nome === "nx_entrada_chave") { if (p.p_gerar) k++; return { chave: chaves[Math.min(k, chaves.length - 1)] }; }
      if (nome === "nx_rastreio_listar") { if (listar instanceof Error) throw listar; return listar || { dias: 30, itens: [], totais: { cliques: 0, casados: 0 } }; }
      throw new Error(`rpcC inesperada: ${nome}`);
    },
    rpc: async nome => { chamadas.push(["rpc", nome]); throw new Error("rpc não deveria ser usada aqui"); },
    publica: async (nome, p) => { chamadas.push(["publica", nome, p]); if (publica) return publica(nome, p); return { ok: true, codigo: "K7Q2P", teste: true }; },
    mensagemErro: e => String(e && e.message || e),
  };
  const ctx = { ui, api, cliente: { id: "c1", nome: "Clínica Teste" }, comandos: { registrar: c => { comandos.push(c); return () => {}; } }, navegar() {} };
  const alvo = new No("div");
  return { alvo, ctx, chamadas, modais, toasts, copiados, comandos, montar: () => RC.secoesConfig[0].montar(ctx, alvo) };
}

test("F7 · «Gerar chave de instalação» não duplica a tela (um cartão, um aviso, um id)", async () => {
  const t = telaRastreio({ chaves: [null, "a".repeat(48)] });
  await t.montar(); await tique();
  assert.ok(/ainda não tem uma chave/.test(t.alvo.textContent));
  botao(t.alvo, /Gerar chave de instalação/).click(); await tique(); await tique();
  assert.equal(t.alvo.querySelectorAll("#rastc-instala").length, 1, "antes: 2 cartões «Código de instalação» e id duplicado (raiz criada fora do pintar)");
  assert.equal(t.alvo.querySelectorAll(".rastc").length, 1);
  assert.equal(t.alvo.querySelectorAll(".rastc-privacidade").length, 1);
  assert.equal(t.alvo.querySelectorAll("pre").filter(p => p.textContent.includes("data-chave=")).length, 1);
});

test("F7 · «Gerar nova chave» avisa que desliga o script E o formulário; depois só a chave nova aparece (a revogada some da tela)", async () => {
  const A = "a".repeat(48), B = "b".repeat(48);
  const t = telaRastreio({ chaves: [A, B] });
  await t.montar(); await tique();
  assert.ok(t.alvo.textContent.includes(A));
  botao(t.alvo, /^Gerar nova chave$/).click(); await tique(); await tique();
  const aviso = t.modais[0].corpo.textContent;
  assert.match(aviso, /script de rastreio instalado no site/);
  assert.match(aviso, /formulário do site/, "antes: o diálogo não citava o formulário (leads somem em silêncio)");
  assert.ok(!t.alvo.textContent.includes(A), "antes: a chave revogada continuava na tela, copiável");
  assert.ok(t.alvo.textContent.includes(B));
  assert.equal(t.alvo.querySelectorAll("input").filter(i => i.value === B).length, 1);
  assert.equal(t.alvo.querySelectorAll("#rastc-instala").length, 1, "um cartão só");
  assert.match(t.alvo.textContent, /Atualize o código no site e o formulário do site/);
  assert.ok(t.toasts.some(([m, o]) => /formulário/.test(m) && o.acao && o.acao.rotulo === "Formulário"));
  // cancelar não troca nada
  const c = telaRastreio({ chaves: [A, B], respostaModal: false });
  await c.montar(); await tique();
  botao(c.alvo, /^Gerar nova chave$/).click(); await tique();
  assert.ok(c.alvo.textContent.includes(A)); assert.ok(!c.chamadas.some(x => x[1] === "nx_entrada_chave" && x[2].p_gerar));
});

test("F8 · privacidade correta (o que vai ao Órbita e por quanto tempo) e parágrafo modelo com o nome da empresa e «Copiar»", async () => {
  assert.match(RC.TEXTO_PRIVACIDADE, /vão para o Órbita/); assert.match(RC.TEXTO_PRIVACIDADE, /endereço da página/); assert.match(RC.TEXTO_PRIVACIDADE, /45 dias/);
  assert.doesNotMatch(RC.TEXTO_PRIVACIDADE, /sem cookies nem serviços de terceiros/, "antes: dizia que nada saía do navegador");
  const p = RC.textoPolitica("Clínica Teste");
  assert.match(p, /sistema de atendimento de Clínica Teste/); assert.match(p, /LGPD/); assert.match(p, /Global Privacy Control/);
  assert.match(RC.textoPolitica(""), /de nossa empresa/);
  const t = telaRastreio({ chaves: ["d".repeat(48)] });
  await t.montar(); await tique();
  botao(t.alvo, /Copiar parágrafo/).click(); await tique();
  assert.equal(t.copiados.at(-1), p);
  const rast = ler("web/rastreio.js");
  assert.doesNotMatch(rast, /o mais que alguém faz com ela é registrar cliques/, "o cabeçalho do script diz que a chave também aceita o formulário");
  assert.match(rast, /também mandar contatos pelo formulário do site/);
});

test("F9 · snippet: produção sem data-url no script do Pages; servidor falso aponta SÓ para ele; variante window.ORBITA_RASTREIO; UTMs com macros de ID", async () => {
  const k = "c".repeat(48);
  assert.equal(RC.snippetRastreio(k), `<script src="https://jpfamelli.github.io/nexus-ads/rastreio.js" data-chave="${k}" defer></script>`);
  const local = RC.rastreioLocal({ ORBITA_DEV_FALSO: { origem: "http://localhost:4495", rastreio: { script: "http://localhost:4495/rastreio.js", url: "http://localhost:4495/rest/v1/rpc/nx_rastreio_registrar", apikey: "dev-falso", site: "http://localhost:4495/__dev_falso/site.html" } } });
  assert.ok(local);
  const s = RC.snippetRastreio(k, local);
  assert.match(s, /^<script src="http:\/\/localhost:4495\/rastreio\.js" data-chave="c+" data-url="http:\/\/localhost:4495\/rest\/v1\/rpc\/nx_rastreio_registrar" data-apikey="dev-falso" defer><\/script>$/);
  assert.doesNotMatch(s, /supabase\.co|github\.io/, "nunca a produção no servidor falso");
  assert.equal(RC.rastreioLocal({ ORBITA_DEV_FALSO: { rastreio: { script: "https://dtjznipitihnwmcgpzqh.supabase.co/x.js", url: "https://dtjznipitihnwmcgpzqh.supabase.co/rest/v1/rpc/nx_rastreio_registrar" } } }), null, "endereço de fora não vale");
  assert.equal(RC.rastreioLocal({}), null); assert.equal(RC.rastreioLocal(null), null);
  const g = RC.snippetGerenciador(k, local);
  assert.match(g, /window\.ORBITA_RASTREIO = \{ chave: "c+", url: "http:\/\/localhost:4495\/rest\/v1\/rpc\/nx_rastreio_registrar", apikey: "dev-falso" \};/);
  assert.match(RC.snippetGerenciador(k), /<script src="https:\/\/jpfamelli\.github\.io\/nexus-ads\/rastreio\.js" defer><\/script>$/);
  assert.match(RC.UTM.google, /utm_campaign=\{campaignid\}&utm_content=\{creative\}/);
  assert.match(RC.UTM.meta, /utm_campaign=\{\{campaign\.id\}\}&utm_content=\{\{ad\.id\}\}/);
  // na tela com ?dev-falso=1: o snippet local e o link do site de teste
  globalThis.window = { ORBITA_DEV_FALSO: { rastreio: { script: "http://127.0.0.1:4495/rastreio.js", url: "http://127.0.0.1:4495/rest/v1/rpc/nx_rastreio_registrar", apikey: "dev-falso", site: "http://127.0.0.1:4495/__dev_falso/site.html" } } };
  try {
    const t = telaRastreio({ chaves: [k] });
    await t.montar(); await tique();
    assert.ok(t.alvo.querySelectorAll("pre")[0].textContent.includes('data-url="http://127.0.0.1:4495/rest/v1/rpc/nx_rastreio_registrar"'));
    assert.ok(t.alvo.querySelectorAll("a").some(a => a.getAttribute("href") === "http://127.0.0.1:4495/__dev_falso/site.html"), "oferece o site de teste");
    assert.ok(!t.alvo.textContent.includes("jpfamelli.github.io/nexus-ads/rastreio.js\""));
  } finally { delete globalThis.window; }
});

test("F10 · painel «Cliques do site»: nx_rastreio_listar (30 dias) vira totais, motivos, campanhas e últimos cliques; «Testar» usa api.publica com teste:\"1\"; comando rastreio.painel", async () => {
  const itens = [
    { em: "2026-10-07T12:00:00Z", pagina: "https://site.test/implante", utm_campaign: "Implante", plataforma: "google", origem: "anuncio", casou: true, motivo: "aplicado", contato_nome: "Ana" },
    { em: "2026-10-06T12:00:00Z", pagina: "https://site.test/", utm_campaign: "Implante", plataforma: "google", origem: "anuncio", casou: false, motivo: "pendente" },
    { em: "2026-10-08T09:00:00Z", pagina: "https://site.test/", utm_campaign: null, plataforma: "meta", origem: "organico", casou: false, motivo: null },
    { em: "2026-10-05T09:00:00Z", pagina: "https://site.test/", utm_campaign: "Avaliação", plataforma: "meta", origem: "anuncio", casou: false, motivo: "ja_tem_anuncio" },
  ];
  const R = RC.resumoRastreio({ dias: 30, itens, totais: { cliques: 4, casados: 1, usados: 1, pendentes: 1 } });
  assert.deepEqual(R.totais, { cliques: 4, casados: 1, pendentes: 1, usados: 1, pct: 25 });
  assert.deepEqual(R.campanhas.map(c => [c.nome, c.cliques, c.casados]), [["Implante", 2, 1], ["(sem campanha)", 1, 0], ["Avaliação", 1, 0]]);
  assert.deepEqual(R.motivos.map(m => m.rotulo).sort(), ["a mensagem não chegou com o código", "casou com o negócio", "esperando o negócio nascer", "o negócio já veio de um anúncio"]);
  assert.equal(R.ultimos[0].em, "2026-10-08T09:00:00Z", "mais recente primeiro");
  assert.deepEqual(RC.resumoRastreio({ itens: itens.slice(0, 2) }).totais, { cliques: 2, casados: 1, pendentes: 1, usados: null, pct: 50 }, "formato mínimo do contrato (só cliques/casados): conta pelos itens");
  assert.equal(RC.paginaCurta("https://site.test/implante?x=1"), "/implante"); assert.equal(RC.paginaCurta("https://site.test/"), "site.test");
  const t = telaRastreio({ chaves: ["d".repeat(48)], listar: { dias: 30, itens, totais: { cliques: 4, casados: 1, pendentes: 1 } } });
  await t.montar(); await tique(); await tique();
  assert.deepEqual(t.chamadas.find(c => c[1] === "nx_rastreio_listar").slice(0, 3), ["rpcC", "nx_rastreio_listar", { p_dias: 30 }]);
  const painel = t.alvo.querySelector("#rastc-painel");
  assert.ok(painel, "painel na tela");
  assert.deepEqual(painel.querySelectorAll(".kpi-valor").map(x => x.textContent), ["4", "1", "1"]);
  assert.match(painel.textContent, /o negócio já veio de um anúncio/);
  assert.equal(painel.querySelectorAll("table").length, 1);
  botao(painel, /^Testar$/).click(); await tique(); await tique();
  const pub = t.chamadas.find(c => c[0] === "publica");
  assert.deepEqual(pub, ["publica", "nx_rastreio_registrar", { p_chave: "d".repeat(48), p_dados: { teste: "1", pagina: "teste-do-painel" } }]);
  assert.ok(!t.chamadas.some(c => c[0] !== "publica" && c[1] === "nx_rastreio_registrar"), "nunca rpc/rpcC (p_token/p_cliente extras dão 404)");
  assert.match(painel.querySelector(".ads-rastreio-st").textContent, /código K7Q2P \(teste — nada foi gravado\)/);
  // comando da paleta (A13): registrado pela tela, foca o título do painel
  const cmd = t.comandos.find(c => c.id === "rastreio.painel");
  assert.ok(cmd && typeof cmd.fazer === "function");
  cmd.fazer();
  assert.equal(No.foco && No.foco.attrs.id, "rastc-painel-h");
  // servidor antigo (sem a RPC): texto honesto, sem número inventado
  const velho = Object.assign(new Error("Could not find the function public.nx_rastreio_listar"), { status: 404 });
  const v = telaRastreio({ chaves: ["d".repeat(48)], listar: velho });
  await v.montar(); await tique(); await tique();
  assert.match(v.alvo.querySelector("#rastc-painel").textContent, /ainda não tem o painel de cliques/);
  // limite de taxa no teste
  const lim = telaRastreio({ chaves: ["d".repeat(48)], publica: () => { throw Object.assign(new Error("limite_taxa"), { codigo: "limite_taxa" }); } });
  await lim.montar(); await tique();
  botao(lim.alvo.querySelector("#rastc-painel"), /^Testar$/).click(); await tique(); await tique();
  assert.match(lim.alvo.querySelector(".ads-rastreio-st").textContent, /limite do rastreio/);
});

/* ============================================================ F11 — web/rastreio.js */
const FONTE = ler("web/rastreio.js");
const CHAVE_SITE = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";
const WA = "https://wa.me/5512999990000?text=oi";
function site({ search = "", guardado = null, fetch, config = {}, sessao = null } = {}) {
  const ouvintes = {}, loja = new Map(), navegacao = [], chamadas = [], avisos = [];
  if (guardado) loja.set("orbita:rastreio:v1", JSON.stringify(guardado));
  const attrs = {}; for (const [k, v] of Object.entries({ chave: CHAVE_SITE, ...config })) attrs[`data-${k}`] = v;
  const el = (tag, a = {}, pai = null) => { const x = { ...a }; return { nodeType: 1, tagName: tag.toUpperCase(), parentNode: pai, getAttribute: k => (k in x ? x[k] : null), setAttribute: (k, v) => { x[k] = String(v); } }; };
  const janela = {
    document: { currentScript: el("script", attrs), addEventListener: (t, f) => { (ouvintes[t] ||= []).push(f); } },
    localStorage: { getItem: k => (loja.has(k) ? loja.get(k) : null), setItem: (k, v) => loja.set(k, String(v)) },
    ...(sessao ? { sessionStorage: { getItem: k => (sessao.has(k) ? sessao.get(k) : null), setItem: (k, v) => sessao.set(k, String(v)) } } : {}),
    location: { search, origin: "https://site.com", pathname: "/", assign: u => navegacao.push(u) },
    navigator: {}, open: () => null,
    fetch: (url, init) => { chamadas.push(JSON.parse(init.body)); return fetch ? fetch() : new Promise(() => {}); },
    AbortController, Promise, setTimeout, clearTimeout, JSON, Date, encodeURIComponent, decodeURIComponent, String, Object, Number, Array, RegExp, isFinite,
    console: { warn: m => avisos.push(String(m)) },
  };
  janela.window = janela;
  vm.runInContext(FONTE, vm.createContext(janela), { filename: "rastreio.js" });
  const disparar = (tipo, alvo, extra = {}) => { const ev = { type: tipo, target: alvo, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; for (const f of ouvintes[tipo] || []) f(ev); return ev; };
  // objetos do contexto vm têm outro Object.prototype: dados()/capturar() voltam como JSON para o deepEqual
  const api = Object.assign(Object.create(janela.OrbitaRastreio), { dados: () => JSON.parse(JSON.stringify(janela.OrbitaRastreio.dados())), capturar: q => JSON.parse(JSON.stringify(janela.OrbitaRastreio.capturar(q))) });
  return { el, disparar, navegacao, chamadas, avisos, loja, api, guardado: () => JSON.parse(loja.get("orbita:rastreio:v1") || "null") };
}
const esperar = ms => new Promise(r => setTimeout(r, ms));
const okCodigo = c => async () => ({ ok: true, json: async () => ({ ok: true, codigo: c }) });

test("F11 · data-espera=\"0\" não espera o Órbita (o link original segue na hora); data-dias=\"0\" não leva a origem para a próxima visita", async () => {
  const s = site({ search: "?gclid=G1", config: { espera: "0" } });   // fetch que nunca responde
  s.disparar("click", s.el("a", { href: WA }));
  await esperar(15);
  assert.deepEqual(s.navegacao, [WA], "antes: 0 virava 1500 ms (Number(x) || 1500)");
  const agora = Date.now();
  const v = site({ guardado: { v: 1, t: agora - 60000, d: { utm_source: "google" }, c: null }, config: { dias: "0" } });
  assert.deepEqual(v.api.dados(), {}, "antes: 0 virava 30 dias e a origem antiga continuava");
  const padrao = site({ guardado: { v: 1, t: agora - 60000, d: { utm_source: "google" }, c: null } });
  assert.deepEqual(padrao.api.dados(), { utm_source: "google" }, "sem data-dias, 30 dias como sempre");
  const invalido = site({ guardado: { v: 1, t: agora - 60000, d: { utm_source: "google" }, c: null }, config: { dias: "-3" } });
  assert.deepEqual(invalido.api.dados(), { utm_source: "google" }, "negativo vale o padrão");
});

test("F11 · chave do parâmetro em qualquer caixa e codificada (UTM_Source, utm%5Fmedium) entra; parâmetro desconhecido continua fora", () => {
  const s = site({ search: "?UTM_Source=google&utm%5Fmedium=cpc&GCLID=Cj0&cpf=1" });
  assert.deepEqual(s.api.dados(), { utm_source: "google", utm_medium: "cpc", gclid: "Cj0" }, "antes: só a chave exata em minúsculas");
  assert.deepEqual(s.api.capturar("?Utm_Campaign=Implante"), { utm_campaign: "Implante" });
});

test("F11 · wa.me/message/<código> (mensagem curta do WhatsApp Business) não é reescrito: segue como está, sem chamar o Órbita, com 1 aviso no console", () => {
  const s = site({ search: "?gclid=G1", fetch: okCodigo("K7Q2P") });
  const a = s.el("a", { href: "https://wa.me/message/ABC123" });
  const ev = s.disparar("click", a);
  assert.equal(ev.defaultPrevented, false, "antes: segurava o clique e acrescentava ?text= que o WhatsApp ignora");
  assert.equal(a.getAttribute("href"), "https://wa.me/message/ABC123");
  assert.equal(s.chamadas.length, 0);
  s.disparar("click", a);
  assert.equal(s.avisos.filter(m => /wa\.me\/message/.test(m)).length, 1, "avisa uma vez");
  assert.equal(s.api.reescrever("https://wa.me/message/ABC123", "K7Q2P"), "https://wa.me/message/ABC123");
  assert.equal(s.api.ehMensagemCurta("https://wa.me/message/ABC123"), true);
  assert.equal(s.api.ehLinkWhatsapp("https://wa.me/message/ABC123"), true, "continua sendo link do WhatsApp");
});

test("F11 · botão direito / clique do meio com o código em cache reescrevem o href na hora («copiar link» e nova aba levam o [ref]); sem código, aquecem", async () => {
  const s = site({ search: "?gclid=G1", fetch: okCodigo("K7Q2P") });
  const a = s.el("a", { href: WA });
  s.disparar("contextmenu", a);                        // sem código: aquece (1 chamada), href intacto
  assert.equal(a.getAttribute("href"), WA);
  assert.equal(s.chamadas.length, 1);
  await esperar(10);
  s.disparar("contextmenu", a);
  assert.match(a.getAttribute("href"), /%5Bref%20K7Q2P%5D$/, "antes: só o click reescrevia — o «copiar link» saía sem código");
  const b = s.el("a", { href: WA });
  s.disparar("pointerdown", b, { button: 1 });
  assert.match(b.getAttribute("href"), /%5Bref%20K7Q2P%5D$/);
  assert.equal(b.getAttribute("data-orbita-original"), WA, "o original fica guardado (o próximo código troca o anterior)");
  const outro = s.el("a", { href: "https://site.com/sobre" });
  s.disparar("contextmenu", outro);
  assert.equal(outro.getAttribute("href"), "https://site.com/sobre");
});

/* ============================================================ pedido da frente B — estado do aparelho */
test("estadoCanal/blocosInicio olham o `estado` do aparelho (nx_inicio.canais[].estado): desconectado é ruim mesmo com status ok", () => {
  const agora = Date.parse("2026-10-08T12:00:00Z");
  assert.deepEqual(L.estadoCanal({ status: "ativo", estado: "desconectado", desde: "2026-10-08T10:00:00Z" }, agora), { nivel: "ruim", texto: "Desconectado há 2 h" }, "antes: «Conectado»");
  assert.deepEqual(L.estadoCanal({ status: "ativo", estado: "desconectado" }, agora), { nivel: "ruim", texto: "Desconectado" });
  assert.equal(L.estadoCanal({ status: "ativo", estado: "conectado" }, agora).nivel, "bom");
  assert.equal(L.estadoCanal({ status: "erro", estado: "desconhecido" }, agora).texto, "Com erro");
  const base = canais => ({ conversas: {}, tarefas: {}, negocios: {}, leads: {}, canais });
  assert.ok(L.blocosInicio(base([{ status: "ativo", estado: "desconectado" }])).abertos.includes("numeros"), "antes: recolhido");
  assert.ok(!L.blocosInicio(base([{ status: "ativo", estado: "conectado" }])).abertos.includes("numeros"));
});

/* ============================================================ F14 — aparelho no Radar */
test("F14 · cartão «Aparelho de WhatsApp» do Radar: some sem dado do shell, verde sem número caído, vermelho com o nome e desde quando", () => {
  const agora = Date.parse("2026-10-08T12:00:00Z");
  assert.equal(L.aparelhoRadar(null), null);
  assert.equal(L.aparelhoRadar([]).nivel, "ok");
  const r = L.aparelhoRadar([{ id: "cw1", nome: "Recepção", desde: "2026-10-08T11:30:00Z" }], agora);
  assert.equal(r.nivel, "ruim"); assert.equal(r.titulo, "Um número de WhatsApp está desconectado");
  assert.equal(r.linhas[0], "Recepção — desconectado há 30 min");
  assert.equal(L.aparelhoRadar([{ nome: "A" }, { nome: "B" }], agora).titulo, "2 números de WhatsApp desconectados");
  const a = ler("web/app/anuncios.js");
  assert.match(a, /ctx\.canais\.assinar\(/, "repinta quando o shell muda a lista");
  assert.match(a, /if \(soltarAparelho\) \{ soltarAparelho\(\); soltarAparelho = null; \}/, "solta a assinatura ao desmontar");
});

/* ============================================================ F13 + amarras de estilo */
test("F13 · esqueletos com a forma do conteúdo, vazios com ilustração e a folha nova só com tokens, sem transition: all e com 44 px no toque", () => {
  const a = ler("web/app/anuncios.js"), r = ler("web/app/relatorios.js"), rc = ler("web/app/rastreio-config.js"), css = ler("web/app/relatorios.css");
  assert.match(a, /ui\.esqueleto\("kpi", \{ n: 4 \}\), ui\.esqueleto\("grafico"\)/);
  assert.match(r, /ui\.esqueleto\("kpi", \{ n: 6 \}\), ui\.esqueleto\("grafico"\)/);
  assert.match(a, /ui\.vazio\(\{ tema: "ads"/); assert.match(r, /tema: aba === "vendas" \? "crm" : "conversas"/); assert.match(rc, /ui\.vazio\(\{ tema: "ads"/);
  const bloco = css.slice(css.indexOf("PLANO 100 — frente F"));
  assert.ok(bloco.length > 200);
  assert.doesNotMatch(bloco, /#[0-9a-f]{3,8}\b/i, "só tokens");
  assert.doesNotMatch(bloco, /transition:\s*all/);
  assert.match(bloco, /min-height: var\(--alvo-toque\)/);
  assert.doesNotMatch(bloco, /animation:/, "nenhum movimento novo (o que existe já respeita prefers-reduced-motion)");
  for (const src of [a, r, rc]) assert.doesNotMatch(src, /\.append\([^)\n]*\? h\([^\n]*: null\)(?![^\n]*filter\(Boolean\))/, ".append(...[a, b].filter(Boolean))");
});

test("revisão · «Testar conexão» com a empresa ocupada (ciclo da hora ou o outro botão) ou falha geral não manda «salvar as credenciais»", async () => {
  const { textoTesteConexao } = await import("../web/app/ads-config.js");
  const ocupado = L.resultadoTesteConexao({ ok: true, cliente: { cliente: "x", pulado: "já em execução" } });
  assert.equal(ocupado.motivo, "ocupado");
  const t1 = textoTesteConexao(ocupado, "meta", "Meta");
  assert.equal(t1.tom, "aten"); assert.match(t1.texto, /leitura dos anúncios em andamento/); assert.doesNotMatch(t1.texto, /salve as credenciais/);
  const t2 = textoTesteConexao(L.resultadoTesteConexao({ ok: false, erro: "falhou" }), "google", "Google");
  assert.equal(t2.tom, "ruim"); assert.match(t2.texto, /Não foi possível testar o Google agora/);
  assert.match(textoTesteConexao(L.resultadoTesteConexao({ ok: true, cliente: { integracoes: [] } }), "meta", "Meta").texto, /salve as credenciais/, "sem a plataforma na resposta continua o aviso de credenciais");
});

test("revisão · cartão de receita estimada não diz «valor informado» (cliente sem gestor, sem fechamento sem valor)", () => {
  const P = L.numerosPeriodo(montarM({ cfg: { ticket: { Clareamento: 800, Implante: 3000 } } }), { dias: 30 });
  const rec = L.kpisAnuncios({ ...P, c: { ...P.c, semValor: 0 }, estimada: true }, { meta: 15, brl0, int: String, gestor: false }).find(k => k.id === "receita");
  assert.equal(rec.estimativa, true);
  assert.equal(rec.extra, "inclui estimativa pelo valor de cada serviço", "antes: «valor informado nos negócios ganhos do CRM» ao lado do selo «estimado»");
});

test("revisão · painel clássico «Desde a sua última visita»: fechamento sem valor diz «sem valor» (não «R$ 0») e o total some quando é 0", () => {
  const p = ler("web/painel.js");
  assert.match(p, /\$\{M\.valorDe\(L\)\.semValor \? "sem valor" : brl0\(M\.valorLead\(L\)\)\}<\/span>/);
  assert.match(p, /\$\{total > 0 \? ` · \$\{brl0\(total\)\}` : ""\}<\/h2>/);
});

test("revisão · data-dias=\"0\" vale na visita inteira: a página seguinte (sem parâmetros) mantém a origem; a próxima visita começa vazia", () => {
  const sessao = new Map();
  const p1 = site({ search: "?utm_source=instagram&utm_medium=paid_social&utm_campaign=Implante", config: { dias: "0" }, sessao });
  assert.equal(p1.api.dados().utm_campaign, "Implante");
  const p2 = site({ config: { dias: "0" }, sessao });   // «/contato», mesma aba
  assert.equal(p2.api.dados().utm_campaign, "Implante", "antes: a página sem parâmetros apagava a origem");
  const outra = site({ config: { dias: "0" }, sessao: new Map(), guardado: { v: 1, t: Date.now() - 60000, d: { utm_source: "google" }, c: null } });
  assert.deepEqual(outra.api.dados(), {}, "visita nova (outra sessão): nada da visita anterior, nem o que estava no localStorage");
});
