/* ============================================================
   ÓRBITA — plano «1000+ melhorias» (13/10/2026), frente ads · lote ads-1
   node --test testes/plano1000-ads.teste.mjs      (Node puro, sem rede e sem navegador)
   Núcleo (web/nucleo.js), rel-logica, peças puras de anuncios.js/relatorios.js, bloco PURO do painel clássico,
   dados.js (token em origem compartilhada) e o script do site (web/rastreio.js, num contexto vm com janela falsa).
   Cada teste falharia no código anterior ao lote (anotado em «antes:»). Itens de tela que dependem do DOM inteiro
   (montar() do Anúncios, painel clássico) são conferidos pela fonte, como nos testes do plano 100.
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ler = f => readFileSync(join(RAIZ, f), "utf8").replace(/\r\n/g, "\n");
const N = await import("../web/nucleo.js");
const L = await import("../web/app/rel-logica.js");
const A = await import("../web/app/anuncios.js");
const RL = await import("../web/app/relatorios.js");
const api = await import("../web/dados.js");

const ADS = ler("web/app/anuncios.js"), REL = ler("web/app/relatorios.js"), CSS = ler("web/app/relatorios.css");
const PJS = ler("web/painel.js"), PCSS = ler("web/painel.css"), HTML = ler("web/index.html"), RAST = ler("web/rastreio.js");

/* ---------- fixtures ---------- */
const HOJE = "2026-10-13";                       // R = 12/10/2026 (segunda-feira)
const diaDe = (hoje, n) => { const d = N.meioDia(hoje); d.setDate(d.getDate() - n); return N.isoDe(d); };
const dia = n => diaDe(HOJE, n);                 // dia(1) = ontem = R
const met = (d, o = {}) => ({ p: "meta", d, n: "anuncio", c: "C1", cn: "Campanha Meta", a: "A1", an: "Vídeo", g: 30, imp: 1000, alc: 800, cli: 20, conv: 2, freq: 1.2, ...o });
const lead = (o = {}) => ({ id: Math.random().toString(36).slice(2), nome: "Ana", origem: "anuncio", plataforma: "meta", campanha_ext: "C1", anuncio_ext: "A1",
  etapa: "nova", data_conversa: dia(3), ...o });
const montarDe = ({ metricas = [], leads = [], hoje = HOJE, dias = 130, cliente = {} } = {}) =>
  N.montar(N.datasetDeLinhas({ metricas, leads, hoje, dias, cliente: { nome: "Clínica Teste", cfg: {}, ...cliente } }));
const serie = (de, ate, o = {}) => Array.from({ length: ate - de + 1 }, (_, k) => met(dia(de + k), o));

/* ---------- DOM mínimo para as peças puras de anuncios.js ---------- */
function hFake(tag, attrs = {}, ...filhos) {
  const eventos = {}, classes = new Set(String(attrs.class || "").split(/\s+/).filter(Boolean));
  const el = { tag, attrs, dataset: attrs.dataset || {}, filhos: filhos.flat(Infinity).filter(x => x != null && x !== false), eventos,
    value: attrs.value ?? "", disabled: !!attrs.disabled,
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => (on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c), contains: c => classes.has(c) },
    get className() { return [...classes].join(" "); },
    append(...xs) { this.filhos.push(...xs.flat(Infinity).filter(x => x != null && x !== false)); },
    replaceChildren(...xs) { this.filhos = xs.flat(Infinity).filter(x => x != null); },
    addEventListener(k, fn) { eventos[k] = fn; }, querySelector() { return null; }, querySelectorAll() { return []; },
    remove() {}, focus() {}, setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return attrs[k] ?? null; },
    get textContent() { return this.filhos.map(x => (typeof x === "string" ? x : x?.textContent || "")).join(""); },
    set textContent(v) { this.filhos = [String(v)]; } };
  for (const [tipo, fn] of Object.entries(attrs.on || {})) eventos[tipo] = fn;
  return el;
}
const buscar = (raiz, pred) => { if (pred(raiz)) return raiz; for (const f of raiz?.filhos || []) { const a = buscar(f, pred); if (a) return a; } return null; };
const esperar = ms => new Promise(r => setTimeout(r, ms));

/* ---------- bloco PURO do painel clássico ---------- */
const trechoPuro = (() => { const i = PJS.indexOf("/* ==== PURO: início"), f = PJS.indexOf("/* ==== PURO: fim ==== */"); assert.ok(i > 0 && f > i); return PJS.slice(i, f); })();
const P = vm.runInNewContext(`${trechoPuro};({ statusEnvio, estadoIntegracao, faixasFunil, DIAS_PROJECAO_FECHAMENTOS, iniciais, valorFalado })`,
  { horaSP: iso => new Date(iso).toISOString().slice(11, 16), quandoSP: () => "", brl0: N.brl0, int: N.int, Date, Math, JSON, String, Number, URL });

/* ============================================================ AD-200 — token do clássico em origem compartilhada */
function navegador(host) {
  const mk = () => { const m = new Map(); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  const loc = mk(), ses = mk();
  const antes = { location: globalThis.location, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage };
  globalThis.location = { hostname: host }; globalThis.localStorage = loc; globalThis.sessionStorage = ses;
  return { loc, ses, restaurar() { for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } } };
}
test("AD-200 · em jpfamelli.github.io o token vai para o sessionStorage com validade (ociosa e teto), o legado do localStorage sai e é encerrado; no Órbita nada muda", async () => {
  const chamadas = [];
  api.usarFetch(async (url, init) => { chamadas.push({ url, corpo: JSON.parse(init.body) }); return { ok: true, status: 200, text: async () => "null" }; });
  const nav = navegador("jpfamelli.github.io");
  try {
    assert.equal(api.origemCompartilhada("jpfamelli.github.io"), true);
    assert.equal(api.origemCompartilhada("orbita-nexus-ads.netlify.app"), false);
    nav.loc.setItem("nx-token", "velho-do-localstorage");               // antes: lido por qualquer site do mesmo Pages
    const t0 = Date.now();
    api.guardarToken("novo", t0);
    assert.equal(nav.loc.getItem("nx-token"), null, "o token legado saiu do localStorage");
    await esperar(5);
    assert.ok(chamadas.some(c => /nx_sair$/.test(c.url) && c.corpo.p_token === "velho-do-localstorage"), "e foi encerrado no servidor");
    const reg = JSON.parse(nav.ses.getItem("nx-token"));
    assert.equal(reg.t, "novo"); assert.equal(reg.em, t0);
    assert.equal(api.lerToken(t0 + 60_000), "novo");
    assert.equal(api.lerToken(t0 + 60_000 + api.TOKEN_OCIOSO_MS - 1000, { renovar: false }), "novo", "dentro da ociosidade");
    assert.equal(api.lerToken(t0 + 60_000 + api.TOKEN_OCIOSO_MS + 1000), null, "2 h sem uso: sai");
    assert.equal(nav.ses.getItem("nx-token"), null);
    // teto absoluto mesmo em uso
    api.guardarToken("x2", t0);
    for (let h = 1; h <= 11; h++) assert.equal(api.lerToken(t0 + h * 3600e3), "x2");
    assert.equal(api.lerToken(t0 + 12 * 3600e3 + 1000), null, "12 h desde a entrada: sai mesmo em uso");
  } finally { nav.restaurar(); api.usarFetch(null); }
  const nav2 = navegador("orbita-nexus-ads.netlify.app");
  try {
    api.guardarToken("orbita");
    assert.equal(nav2.loc.getItem("nx-token"), "orbita", "Órbita (origem própria): localStorage como sempre");
    assert.equal(api.lerToken(), "orbita");
  } finally { nav2.restaurar(); }
  assert.match(PJS, /api\.lerToken\(Date\.now\(\), \{ renovar: false \}\)\) sessaoExpirou\(\)/, "a aba aberta volta ao login quando vence");
});

/* ============================================================ NÚCLEO */
test("AD-002 · plataforma desconhecida nas métricas não derruba porDia/serieDiaria (soma em «outras»)", () => {
  const M = montarDe({ metricas: [...serie(1, 5), met(dia(2), { p: "tiktok", c: "T1", a: "T1", g: 40 })] });
  let s;
  assert.doesNotThrow(() => { s = M.porDia(); }, "antes: TypeError em s.tiktok");
  assert.equal(s.outras[M.R - 1], 40);
  const sd = L.serieDiaria(M, { dias: 7 });
  const g = sd.atual.reduce((a, d) => a + d.gasto, 0);
  assert.equal(Math.round(g * 100), Math.round(M.consolidar(M.linhasDe(M.R - 6, M.R)).gasto * 100), "a série reconcilia com o total");
});

test("AD-003 · anúncio sem id é um criativo por campanha, com nome legível", () => {
  const M = montarDe({ metricas: [met(dia(1), { a: "", an: undefined, c: "C1" }), met(dia(1), { a: "", an: undefined, c: "C2", cn: "Outra" })] });
  assert.ok(M.CRI["meta:C1:?"] && M.CRI["meta:C2:?"], "antes: um só «meta:?» para todas as campanhas");
  assert.equal(M.CRI["meta:C2:?"].camp, "meta:C2");
  assert.equal(M.CRI["meta:C1:?"].nome, "Anúncio sem identificação");
});

test("AD-004 · utm_campaign sem métrica vai para o balde (com o texto do utm), não vira «Campanha xyz» no mensal", () => {
  const hoje = "2026-10-03";
  const mets = Array.from({ length: 40 }, (_, k) => met(diaDe(hoje, k + 1)));
  const M = montarDe({ hoje, metricas: mets, leads: [lead({ campanha_ext: "xyz", anuncio_ext: null, etapa: "fechou", valor: 900, data_conversa: "2026-09-10", data_agenda: "2026-09-11", data_consulta: "2026-09-12" })] });
  assert.equal(M.CAMP["meta:xyz"], undefined);
  assert.deepEqual(M.CAMP["meta:nao_identificada"].utms, ["xyz"]);
  const set = M.mesesDados().find(m => m.mes === 8);
  assert.doesNotMatch(M.relMensal(set), /Campanha xyz/);
  assert.deepEqual(L.semCampanhaTot(M, set.de, set.ate).utms, ["xyz"]);
  // plano 1000b: a nota do balde saiu para o textoBalde puro (AB-001) — o texto do utm continua nela
  assert.match(A.textoBalde({ conversas: 1, utms: ["xyz"] }, N.int), /campanha no link: «xyz»/, "a nota do balde mostra o texto do utm");
});

test("AD-005 · «Google sem acompanhamento de conversões» em janela fixa de 30 dias: painel (130) e WhatsApp (45) concordam", () => {
  const mets = [...Array.from({ length: 44 }, (_, k) => met(dia(k + 1), { p: "google", c: "G1", a: "GA", conv: 0, g: 10 })), met(dia(60), { p: "google", c: "G1", a: "GA", conv: 3, g: 10 })];
  const M45 = montarDe({ metricas: mets, dias: 45 }), M130 = montarDe({ metricas: mets, dias: 130 });
  assert.equal(M45.GOOGLE_SEM_CONVERSAO, true);
  assert.equal(M130.GOOGLE_SEM_CONVERSAO, true, "antes: a conversão de 60 dias atrás desligava o aviso só no painel");
  assert.equal(L.googleSemConversao(M130), L.googleSemConversao(M45));
  const r2 = M => M.avaliar(M.R).filter(a => a.regra.id === "r2").length;
  assert.equal(r2(M130), r2(M45), "nenhum lado manda r2 do Google");
});

test("AD-006 · ritmo do orçamento: nada de projeção nos 4 primeiros dias (radar, diário e cartão)", () => {
  const hoje = "2026-10-03";                       // ontem = dia 2
  const M = montarDe({ hoje, metricas: [met("2026-10-01", { g: 200 }), met("2026-10-02", { g: 200 })] });
  const m = M.ritmoMes(M.R);
  assert.equal(m.cedo, true);
  assert.ok(!M.avaliar(M.R, true).some(a => a.regra.id === "ritmo"), "antes: «outubro fecha em R$ 6.200»");   // plano 2000d: pela regra (DA-006)
  assert.match(M.relDiario(M.R), /cedo para projetar \(dia 2 do mês\)/);
  assert.match(A.descricaoOrcamentoMensal(m, null, N.brl0), /a projeção começa no 5º dia/);
  assert.equal(montarDe({ metricas: serie(1, 12, { g: 200 }) }).ritmoMes(M.R).cedo, false);
});

test("AD-009 · «Campanha sem conversa» exige gasto em 2 dias ou mais da janela", () => {
  const um = montarDe({ metricas: [met(dia(1), { g: 30, conv: 0 })] });
  assert.ok(!um.avaliar(um.R).some(a => a.regra.id === "r2"), "antes: campanha que estreou ontem virava alerta crítico");
  // plano 2000d: agora são 3 dias com gasto (DA-059 — a Meta ainda aprende nos 2 primeiros); 2 dias só com gasto acima de 3× o piso
  const dois = montarDe({ metricas: [met(dia(1), { g: 15, conv: 0 }), met(dia(2), { g: 15, conv: 0 })] });
  assert.ok(!dois.avaliar(dois.R).some(a => a.regra.id === "r2"));
  const tres = montarDe({ metricas: [met(dia(1), { g: 10, conv: 0 }), met(dia(2), { g: 10, conv: 0 }), met(dia(3), { g: 10, conv: 0 })] });
  assert.ok(tres.avaliar(tres.R).some(a => a.regra.id === "r2"));
});

test("AD-011/AD-012/AD-216/AD-217 · diário: dia da semana, variação sem base, custo por plataforma e o CRM do dia", () => {
  const M = montarDe({ metricas: [met(dia(1), { g: 30, conv: 2 }), met(dia(1), { p: "google", c: "G1", a: "GA", g: 20, conv: 1.5 })],
    leads: [lead({ data_conversa: dia(1) }), lead({ data_conversa: dia(1), etapa: "agendada", data_agenda: dia(1) })],
    cliente: { cfg: { cpaAlvo: 15 } } });                     // plano 1000 (AD-001, lote ads-3): a meta agora precisa estar configurada
  const t = M.relDiario(M.R);
  assert.match(t, /— segunda-feira, 12\/10\/2026/, "AD-217");
  assert.match(t, /• Investido: R\$\s50,00 \(dia anterior zerado\)/, "AD-012: antes «(— vs. dia anterior)»");
  assert.doesNotMatch(t, /\(—/);
  assert.doesNotMatch(t, /• Custo por conversa: /, "AD-011: nada de custo agregado Meta + Google contra a meta");
  assert.match(t, /• Custo por conversa \(Meta\): R\$\s15,00 · meta/);
  assert.match(t, /• Custo por conversão \(Google\): R\$\s13,33/);
  assert.match(t, /• No CRM: 2 conversas novas de anúncio · 1 avaliação agendada/, "AD-216");
  assert.equal(N.varParen(0, 0), "", "os dois zero: sem parêntese");
  assert.equal(N.varParen(80, 0), " (dia anterior zerado)");
  assert.equal(N.varParen(110, 100, " vs. dia anterior"), " (+10% ↑ vs. dia anterior)");
});

test("AD-014/AD-243 · mensal: comparação com o rótulo de fechamento da vertical e o custo de cada cliente novo", () => {
  const hoje = "2026-10-03";
  const mets = Array.from({ length: 70 }, (_, k) => met(diaDe(hoje, k + 1), { g: 20 }));
  const fech = (d, id) => lead({ id, etapa: "fechou", valor: 500, data_conversa: d, data_agenda: d, data_consulta: d });
  const M = montarDe({ hoje, metricas: mets, cliente: { vertical: "oficina" },
    leads: [fech("2026-08-10", 1), fech("2026-09-05", 2), fech("2026-09-15", 3)] });
  const set = M.mesesDados().find(m => m.mes === 8);
  const t = M.relMensal(set);
  assert.match(t, /Em relação a agosto: \+100% — 1 → 2 clientes aprovaram o orçamento\./, "antes: «em clientes novos» com número de fechamentos");
  assert.match(t, /🧾 Cada cliente novo custou R\$\s300 em anúncio\./, "AD-243: 30 dias × R$ 20 ÷ 2");
});

test("AD-019/AD-020 · aviso do radar com a ação de cada item (máx. 3 + «e mais N») e o link do painel quando configurado", () => {
  // plano 2000d: 3 dias com gasto (DA-059)
  const M = montarDe({ metricas: [met(dia(1), { g: 10, conv: 0 }), met(dia(2), { g: 10, conv: 0 }), met(dia(3), { g: 10, conv: 0 })], cliente: { cfg: { painelUrl: "https://orbita-nexus-ads.netlify.app/app/#/anuncios/radar" } } });
  const a = M.avaliar(M.R);
  assert.match(M.textoAlerta(a), /\n👉 Checar “Campanha Meta”/, "antes: só a.msg");
  assert.match(M.textoAlerta(a), /Histórico no painel:_ https:\/\/orbita-nexus-ads\.netlify\.app\/app\/#\/anuncios\/radar$/);
  assert.match(M.relDiario(M.R), /🔗 Painel: https:\/\/orbita/);
  const muitos = Array.from({ length: 5 }, (_, k) => ({ sev: "alerta", msg: `m${k}`, acao: `a${k}` }));
  const tx = M.textoAlerta(muitos);
  assert.equal((tx.match(/👉/g) || []).length, 3);
  assert.match(tx, /… e mais 2 itens no painel\./);
  assert.equal(N.urlPainel({ painelUrl: "http://inseguro.com" }), "", "só https");
  assert.equal(N.urlPainel({ painel_url: "javascript:alert(1)" }), "");
});

test("AD-022/AD-024 · consulta passada sem presença conta à parte; orgânicos do período contados", () => {
  const M = montarDe({ metricas: serie(1, 10), leads: [lead({ etapa: "agendada", data_agenda: dia(8), data_consulta: dia(5) }), lead({ origem: "organico", plataforma: "meta", campanha_ext: "bio", anuncio_ext: null, data_conversa: dia(2) }), lead({ origem: "whatsapp", plataforma: null, data_conversa: dia(2) })] });
  const c = M.crmTot(M.R - 29, M.R);
  assert.equal(c.semPresenca, 1, "antes: não contava em lugar nenhum");
  assert.equal(c.compareceram + c.faltaram, 0);
  assert.equal(L.organicosPeriodo(M, { dias: 30 }), 2);
  assert.match(ADS, /sem presença marcada/); assert.match(ADS, /conversas orgânicas/);
});

test("AD-027 · painel × WhatsApp com Google fracionado e balde: diário e mensal batem com numerosPeriodo", () => {
  const hoje = "2026-10-03";
  const mets = [...Array.from({ length: 40 }, (_, k) => met(diaDe(hoje, k + 1))), ...Array.from({ length: 40 }, (_, k) => met(diaDe(hoje, k + 1), { p: "google", c: "G1", a: "GA", g: 10, conv: 1.5 }))];
  const leads = [lead({ plataforma: null, campanha_ext: null, anuncio_ext: null, etapa: "agendada", data_conversa: "2026-09-10", data_agenda: "2026-09-11" }),
    lead({ etapa: "agendada", data_conversa: "2026-09-12", data_agenda: "2026-09-13" })];
  const M = montarDe({ hoje, metricas: mets, leads });
  const Pm = L.numerosPeriodo(M, { dias: "mes_ant" }), set = M.mesesDados().find(m => m.mes === 8);
  assert.deepEqual([Pm.de, Pm.ate], [set.de, set.ate]);
  const tm = M.relMensal(set);
  assert.match(tm, new RegExp(`📅 ${Pm.c.agendadas} avaliações agendadas`), "o balde entra nos dois lados");
  const numConv = n => (Number.isInteger(n) ? N.int(n) : N.dec(n, 1));
  assert.ok(tm.includes(`💬 ${numConv(Pm.t.conversoes)} conversas e conversões`));
  const dia1 = M.consolidar(M.linhasDe(M.R, M.R));
  assert.ok(M.relDiario(M.R).includes(`Conversas e conversões: ${numConv(dia1.conversoes)} `));
});

test("AD-235 · radar avisa quando o investimento cai de repente (crítico, desligável)", () => {
  const mets = serie(2, 9, { g: 50, conv: 3 });
  const M = montarDe({ metricas: mets });
  const r5 = M.avaliar(M.R).find(a => a.regra.id === "r5");
  assert.ok(r5, "antes: nenhuma regra percebia o gasto zerado");
  // plano 1000b: AB-170 — os dois valores na mesma régua (brlW: centavos abaixo de R$ 100)
  assert.equal(r5.sev, "critico"); assert.match(r5.msg, /caiu de R\$\s50,00 por dia/);
  assert.ok(!montarDe({ metricas: mets, cliente: { cfg: { regrasOff: ["r5"] } } }).avaliar(M.R).some(a => a.regra.id === "r5"), "desligável");
  assert.ok(!montarDe({ metricas: serie(1, 9, { g: 50, conv: 3 }) }).avaliar(M.R).some(a => a.regra.id === "r5"), "gasto normal: nada");
  assert.match(ler("web/app/ads-config.js"), /\["r5", "Investimento parou de repente"\]/, "Ajustes de anúncios liga e desliga");
  assert.equal(L.explicarRegra("r5").oQue, "Os anúncios pararam de gastar de um dia para o outro.");
});

test("AD-237 · radar avisa quando o CRM para de receber as conversas que o Meta conta (só queda, não quem nunca usou o CRM)", () => {
  const mets = serie(1, 17, { g: 30, conv: 7 });
  const velhos = Array.from({ length: 14 }, (_, k) => [0, 1, 2, 3].map(j => lead({ id: `v${k}-${j}`, data_conversa: dia(k + 4) }))).flat();
  const M = montarDe({ metricas: mets, leads: [...velhos, lead({ id: "n1", data_conversa: dia(1) })] });
  const r6 = M.avaliar(M.R).find(a => a.regra.id === "r6");
  assert.ok(r6); assert.match(r6.msg, /o Meta contou 21 conversas, mas só 1 chegou ao CRM/);
  assert.ok(!montarDe({ metricas: mets, leads: [lead({ data_conversa: dia(1) })] }).avaliar(M.R).some(a => a.regra.id === "r6"), "sem histórico de CRM: sem aviso diário");
  assert.ok(M.REGRAS.find(r => r.id === "r6").descricao, "a tela de regras descreve a condição");
});

/* ============================================================ rel-logica + Anúncios (peças puras) */
test("AD-032/AD-208 · envio parcial e leitura parcial (Órbita e clássico)", () => {
  const x = { enviado_em: "2026-10-13T11:00:00Z", erro: "5512999990000: número inválido", destinos: ["5512988880000", "5512999990000"] };
  assert.equal(L.statusEnvio(x).k, "parcial", "antes: ✓ «enviado»");
  assert.match(L.statusEnvio(x).rotulo, /^enviado a 1 de 2 às /);
  assert.equal(P.statusEnvio(x).k, "parcial");
  assert.equal(L.statusEnvio({ enviado_em: x.enviado_em }).k, "enviado");
  assert.equal(L.statusEnvio({ enviado_em: x.enviado_em, erro: "WhatsApp não entregou (código 131026): x" }).k, "erro");
  const integ = [{ canal: "meta", ativo: true, ultimo_sync: new Date(Date.now() - 6e5).toISOString(), status: "parcial — teto de páginas" }];
  assert.equal(P.estadoIntegracao(integ).nivel, "parcial", "antes: o clássico dizia «ok»");
  assert.equal(L.estadoIntegracao(integ).nivel, "parcial");
  assert.match(PJS, /nivel === "parcial"\) txt = `Leitura parcial/);
});

test("AD-045 · selo do Radar: só crítico/atenção contam e a cor é a da maior gravidade", () => {
  assert.deepEqual(L.seloRadar([{ sev: "info" }, { sev: "info" }], 0), { n: 0, sev: null }, "antes: «Radar 2» vermelho só com informativos");
  assert.deepEqual(L.seloRadar([{ sev: "alerta" }, { sev: "info" }], 0), { n: 1, sev: "alerta" });
  assert.deepEqual(L.seloRadar([{ sev: "alerta" }], 1), { n: 2, sev: "critico" });
  assert.match(ADS, /badge\.className = `rel-badge rel-badge-\$\{selo\.sev \|\| "alerta"\}`/);
  assert.match(CSS, /\.rel-badge-alerta \{ background: var\(--pal-2\)/);
});

test("AD-080 · fuso da conta diferente aparece sempre na descrição do período", () => {
  const f = L.fusosDiferentes([{ canal: "meta", ativo: true, status: "ok — 30 linhas · fuso America/New_York (≠ São Paulo)" }, { canal: "google", ativo: true, status: "ok" }]);
  assert.deepEqual(f, [{ canal: "meta", fuso: "America/New_York" }]);
  const M = montarDe({ metricas: serie(1, 10) });
  const Pn = L.numerosPeriodo(M, { dias: 30 });
  assert.match(A.descricaoPeriodoAds(Pn, M.dataBR, L.nomePlat, { fusos: f }), /Meta no fuso America\/New_York: os dias dessa conta fecham às/);   // plano 2000d: DA-166 — diz a que horas de Brasília o dia fecha
  assert.doesNotMatch(A.descricaoPeriodoAds({ ...Pn, plat: "google" }, M.dataBR, L.nomePlat, { fusos: f }), /fuso/, "com o filtro no Google, o fuso do Meta não aparece");
});

test("AD-094 · funil por plataforma: seta só quando cai; acima de 100% diz o que é", () => {
  assert.deepEqual(L.taxaFunilTxt(130, v => `${v}%`), { txt: "130% · mais que a etapa anterior contou", cai: false, acima: true });
  assert.equal(L.taxaFunilTxt(100, v => `${v}%`).txt, "100%");
  assert.equal(L.taxaFunilTxt(40, v => `${v}%`).txt, "40% ↓");
  const fp = A.criarFunilPlataformas({ h: hFake, dados: [{ plat: "meta", nome: "Meta", gasto: 1, receita: 0, max: 13,
    etapas: [{ rotulo: "Conversões", v: 10 }, { rotulo: "Conversas", v: 13 }, { rotulo: "Agendaram", v: 13 }, { rotulo: "Fecharam", v: 2 }],
    taxas: [{ pct: 130 }, { pct: 100 }, { pct: 15.4 }] }], pctTxt: v => `${Math.round(v)}%` });
  assert.doesNotMatch(fp.textContent, /130% ↓|100% ↓/, "antes: «130% ↓» e «100% ↓»");
  assert.match(fp.textContent, /15% ↓/);
});

test("AD-097 · «Este mês» e «Mês passado»: janelas do calendário, comparação e textos", () => {
  const M = montarDe({ metricas: serie(1, 80) });                   // R = 12/10
  const j = L.janela(M, "mes");
  assert.equal(M.dataBR(j.de), "01/10/2026"); assert.equal(M.dataBR(j.ate), "12/10/2026");
  assert.equal(M.dataBR(j.deA), "01/09/2026"); assert.equal(M.dataBR(j.ateA), "12/09/2026");
  const ja = L.janela(M, "mes_ant");
  assert.deepEqual([M.dataBR(ja.de), M.dataBR(ja.ate), M.dataBR(ja.deA), M.dataBR(ja.ateA)], ["01/09/2026", "30/09/2026", "01/08/2026", "31/08/2026"]);
  assert.equal(L.numerosPeriodo(M, { dias: "mes_ant" }).dias, 30);
  assert.equal(L.textoChipAnuncios("mes_ant", ""), "Mês passado · Tudo");
  assert.equal(L.rotuloPeriodo("mes").nos, "neste mês");
  assert.equal(A.periodoValido("mes"), "mes"); assert.equal(A.periodoValido("60"), 60); assert.equal(A.periodoValido("90"), 30);
  assert.match(A.descricaoPeriodoAds(L.numerosPeriodo(M, { dias: "mes_ant" }), M.dataBR, L.nomePlat), /^Mês passado \(01\/09\/2026 a 30\/09\/2026\) · todas as plataformas · mês fechado/);
});

test("AD-098/AD-099 · plataforma por cliente e só as que têm números", () => {
  assert.equal(A.chavePlat("c1"), "nx-app-ads-plat:c1");
  assert.notEqual(A.chavePlat("c1"), A.chavePlat("c2"));
  assert.match(ADS, /lerLocal\(chavePlat\(ctx\.cliente\.id\), ""\)/, "antes: a chave global «nx-app-ads-plat»");
  assert.doesNotMatch(ADS, /gravarLocal\("nx-app-ads-plat"/);
  assert.deepEqual(A.platsDisponiveis(montarDe({ metricas: serie(1, 3) })).map(([v]) => v), ["", "meta"], "só Meta: sem «Google»");
  assert.deepEqual(A.platsDisponiveis(montarDe({ metricas: [...serie(1, 3), met(dia(1), { p: "google", c: "G", a: "G" })] })).map(([v]) => v), ["", "meta", "google"]);
});

test("AD-100/AD-101/AD-102/AD-111 · conversões fracionadas nas tabelas e no CSV; receita informada × estimada; a palavra do Google", () => {
  const rows = [{ c: { nome: "Pesquisa", plat: "google" }, t: { gasto: 30, conversoes: 1.5, cpa: 20 }, k: { conversas: 1, agendadas: 1, fecharam: 1, receita: 900, receitaReal: 500, receitaEstimada: 400 }, roas: 30 }];
  const csv = A.csvCampanhas(rows, { periodo: "x", csv: L.csv });
  const [cab, l1] = csv.replace(/^﻿/, "").split("\r\n");
  assert.match(cab, /Receita informada;Receita estimada/);
  assert.deepEqual(l1.split(";").slice(4, 12), ["1,5", "20", "1", "1", "1", "900", "500", "400"], "antes: 2 (arredondado) e receita misturada");
  assert.match(ADS, /td\("conv", fmtConvG\(r\.t\.conversoes\)/);
  assert.match(ADS, /fmtConv\(d\.conv\), d\.conv \? N\.brl/);
  assert.match(ADS, /convPlat\(x\.k\.plat, x\.t\.conversoes\)/);
});

test("AD-105 · a busca de campanhas filtra ao digitar (sem «Aplicar»), sem redesenhar o campo", async () => {
  const linhas = [{ c: { id: "a", nome: "Implante" }, t: {}, k: {} }, { c: { id: "b", nome: "Clareamento" }, t: {}, k: {} }];
  const filtros = [];
  const painel = A.criarPainelCampanhas({ h: hFake, linhas, estado: {}, aoFiltrar: f => filtros.push(f) });
  const campo = buscar(painel.elemento, n => n.tag === "input");
  campo.value = "impl"; campo.eventos.input();
  await esperar(A.ESPERA_BUSCA_MS + 60);
  assert.deepEqual(filtros, [{ busca: "impl", resultado: "todos" }], "antes: só filtrava no clique de «Aplicar filtros»");
  assert.equal(buscar(painel.elemento, n => n.tag === "input"), campo, "o mesmo campo (o foco e o cursor ficam)");
  assert.deepEqual(painel.linhas.map(r => r.c.id), ["a"]);
});

test("AD-108 · campanha sem gasto há 3 dias sai como «pausada» com o último dia de gasto", () => {
  const M = montarDe({ metricas: [...serie(5, 20), ...serie(1, 20, { c: "C2", cn: "Ativa", a: "A2" })] });
  const { linhas } = L.linhasCampanhas(M, { dias: 30 });
  const c1 = linhas.find(r => r.c.id === "meta:C1"), c2 = linhas.find(r => r.c.id === "meta:C2");
  assert.equal(c1.pausada, true); assert.equal(M.dataBR(c1.ultimoGasto), "08/10/2026");
  assert.equal(c2.pausada, false);
  assert.match(ADS, /pausada · último gasto/);
});

test("AD-109 · linha «Anúncio sem campanha identificada» aparece com o balde só de conversas", () => {
  const M = montarDe({ metricas: serie(1, 10), leads: [lead({ plataforma: null, campanha_ext: null, anuncio_ext: null, data_conversa: dia(2) })] });
  const { semCampanha, outras } = L.linhasCampanhas(M, { dias: 30 });
  assert.equal(semCampanha.conversas, 1); assert.equal(outras.ag + outras.fe + outras.rec, 0, "o caso que sumia: balde sem agenda/fechamento");
  assert.match(ADS, /temBalde \? h\("tr", \{ class: "ads-camp-outras ads-camp-balde" \}/, "antes: temOutras && temBalde");
});

test("AD-115/AD-128 · CPA com Google não usa o medidor da meta; custo por agendamento e por fechamento", () => {
  const M = montarDe({ metricas: [...serie(1, 10, { g: 30 }), met(dia(1), { p: "google", c: "G", a: "G", g: 20, conv: 1 })],
    leads: [lead({ etapa: "fechou", valor: 300, data_conversa: dia(4), data_agenda: dia(3), data_consulta: dia(2) }), lead({ etapa: "agendada", data_conversa: dia(4), data_agenda: dia(3) })] });
  const Pn = L.numerosPeriodo(M, { dias: 30 });
  const kG = L.kpisAnuncios(Pn, { meta: 15, temGoogle: true }).find(k => k.id === "cpa");
  assert.equal(kG.medidor, false, "antes: pintava acima/abaixo da meta de WhatsApp com Google misturado");
  assert.match(kG.extra, /vale para conversas no WhatsApp/);
  assert.equal(L.kpisAnuncios(Pn, { meta: 15 }).find(k => k.id === "cpa").medidor, true);
  assert.equal(Pn.custoAgendamento, 320 / 2); assert.equal(Pn.custoFechamento, 320);
});

test("AD-118 · calor por faixa do dia (padrão no celular) com «Ver por hora»", () => {
  const m = Array.from({ length: 7 }, () => new Array(24).fill(0));
  m[1][9] = 3; m[1][14] = 1; m[5][20] = 2;
  const f = A.matrizFaixasCalor(m);
  assert.deepEqual(f.matriz[1], [0, 3, 1, 0]); assert.deepEqual(f.matriz[5], [0, 0, 0, 2]);
  assert.equal(f.max, 3); assert.deepEqual(f.semanas.map(s => s.rotulo), ["madr.", "manhã", "tarde", "noite"]);
  assert.match(ADS, /let modo = celular \? "faixas" : "hora"(, escolheuModo = false)?;/);   // plano 1000b: AB-061 acrescentou «escolheuModo» (girar a tela troca o modo)
  assert.match(CSS, /\.ads-cal-modo-faixas \.ads-cal-hora, \.ads-cal-modo-hora \.ads-cal-faixas \{ display: none; \}/);
});

test("AD-126/AD-132/AD-138 · estados de acesso, «equipe avisada» só com aviso enviado, relógio do servidor", () => {
  assert.match(A.estadoAcessoAds("modulo_desligado").titulo, /não fazem parte do seu plano/);
  assert.ok(A.estadoAcessoAds("sem_permissao") && A.estadoAcessoAds("teste_expirado"));
  assert.equal(A.estadoAcessoAds("http_500"), null, "erro de verdade continua no erroCartao");
  const agora = Date.parse("2026-10-13T12:00:00Z");
  const al = { regra: "integracao", chave: "integracao|meta", criado_em: "2026-10-13T10:00:00Z" };
  assert.equal(A.equipeAvisada([al], [{ canal: "meta" }], agora), false, "antes: «já foi avisada» sem ninguém ter recebido");
  assert.equal(A.equipeAvisada([{ ...al, enviado_em: "2026-10-13T10:00:05Z" }], [{ canal: "meta" }], agora), true);
  assert.equal(A.equipeAvisada([{ ...al, enviado_em: "x" }], [{ canal: "google" }], agora), false);
  assert.equal(L.desvioRelogio({ agora: "2026-10-13T12:10:00Z" }, agora), 600000);
  assert.equal(L.desvioRelogio({}, agora), 0, "RPC sem a hora do servidor: relógio do aparelho");
  assert.equal(L.desvioRelogio({ agora: "2026-10-13T12:00:20Z" }, agora), 0, "menos de 1 min é ruído");
});

test("AD-131/AD-153/AD-139/AD-144 · por que difere, hoje parcial e cabeçalho de impressão", () => {
  assert.ok(L.POR_QUE_DIFERE.length >= 4 && L.POR_QUE_DIFERE.some(t => /data em que foram criados/.test(t)));
  assert.match(ADS, /Por que os números da plataforma e do CRM diferem\?/);
  assert.match(REL, /Por que difere do Anúncios\?/);
  assert.equal(RL.notaHojeParcial("2026-10-13", "2026-10-13"), " · hoje conta até agora (dia parcial)");
  assert.equal(RL.notaHojeParcial("2026-10-12", "2026-10-13"), "");
  assert.match(REL, /cabImpressao\.textContent = `\$\{ctx\.cliente\.nome\} · Relatório de/);
  assert.match(CSS, /@media print \{\n  \.rel-impressao-cab \{ display: block;/);
});

test("AD-041/AD-044/AD-058/AD-091/AD-092/AD-096/AD-122/AD-148 · tela: copiar, semáforo âmbar, gravidade escrita, rosca, período, imprimir, tabelas em cartão", () => {
  assert.match(ADS, /copiarTexto\(texto, \{ ui, aviso: "Texto copiado\. É só colar no WhatsApp\."/);   // plano 1000b: AB-049 — ui.copiar por dentro de copiarTexto (com reserva)
  assert.match(CSS, /\.ads-sem-alerta \{ --luz: var\(--pal-2\); \}/, "antes: --c-aten (verde-oliva)");
  assert.match(ADS, /h\("p", \{ class: "ads-al-topo" \}, marcaSev\(x\.sev\)\)/, "antes: bolinha colorida sem texto");
  assert.match(CSS, /\.ads-donut-plat \.g-d0 \{ --g: var\(--c-meta\); \}/);
  assert.match(CSS, /\.ads-donut-plat \.g-donut-env \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(CSS, /\.ads-filtros > \.rel-ate \{ flex-basis: 100%;/);
  // plano 1000b: AB-033 — o botão e o ⋮ do celular chamam o mesmo imprimir() (que faz o window.print())
  assert.match(ADS, /class: "rel-btn rel-btn-sec rel-btn-ic ads-imprimir rel-so-largo"[\s\S]{0,200}imprimir\(\)/);
  assert.match(ADS, /const imprimir = \(\) => \{ try \{ window\.print\(\); \}/);
  assert.match(CSS, /@media \(max-width: 480px\) \{\n  \/\* AD-148/);
});

/* ============================================================ painel clássico */
test("AD-194/AD-195/AD-196/AD-197 · clássico: vocabulário da vertical, faixas por vertical, conversões do Google com rótulo próprio", () => {
  assert.match(PJS, /esc\(c\.agendadas === 1 \? V\.agendada\[0\] : V\.agendada\[1\]\)/);
  assert.doesNotMatch(PJS.slice(PJS.indexOf("function renderGeral"), PJS.indexOf("function serieDia")), /"avaliações agendadas"|"pacientes novos"|>No consultório</, "antes: odontologia fixa");
  assert.notDeepEqual(P.faixasFunil("oficina").faixas, P.faixasFunil("odonto").faixas);
  assert.deepEqual(P.faixasFunil("desconhecida").faixas, P.faixasFunil("odonto").faixas);
  assert.match(PJS, /l: temG \? "Custo por conversão da plataforma" : "Custo por conversa", v: t\.cpa, a: ta\.cpa, f: "brl", s: "baixo", medidor: !temG/);
  assert.match(PJS, /No Google, cada conversão registrada custou/);
  assert.match(PJS, /if \(tm && fin\(tm\.cpa\)\)/, "a frase do WhatsApp usa o CPA do Meta");
});

test("AD-052/AD-201/AD-202/AD-206/AD-209/AD-203 · clássico: aviso do Google, nomes ocultos, valor falado, projeção do 7º dia, tabela do gráfico, alvos de 44 px", () => {
  assert.match(PJS, /M\.GOOGLE_SEM_CONVERSAO \? `<li class="al-info-google">/);
  assert.equal(P.iniciais("Maria Souza Lima"), "M. S. L."); assert.equal(P.iniciais(""), "—");
  assert.match(PJS, /nomeCurto: Q\.get\("nomes"\) === "1" \? nomeCurto : iniciais/);
  assert.equal(P.valorFalado(2000, "brl"), `${N.brl0(2000)} por mês`);
  assert.match(PJS, /inv\.setAttribute\("aria-valuetext", valorFalado\(SIM\.inv, "brl"\)\)/);
  assert.equal(P.DIAS_PROJECAO_FECHAMENTOS, 7);
  assert.match(PJS, /atual && rit\.pass >= DIAS_PROJECAO_FECHAMENTOS/);
  assert.match(HTML, /id="btn-tabela-dia"[^>]*aria-controls="tabela-dia"/);
  assert.match(PJS, /function renderTabelaDia\(\)/);
  assert.match(PCSS, /\.chip-tg, \.seg button, \.pill-sm, \.link-b \{ min-height: 44px; \}/);
});

test("AD-207 · numerosPeriodo do clássico e do Órbita dão os mesmos números", () => {
  const src = PJS.slice(PJS.indexOf("function numerosPeriodo() {"), PJS.indexOf("\nfunction renderGeral"));
  const M = montarDe({ metricas: [...serie(1, 70), ...serie(1, 70, { p: "google", c: "G", a: "G", g: 12, conv: 1.5 })],
    leads: [lead({ etapa: "fechou", valor: 700, data_conversa: dia(9), data_agenda: dia(8), data_consulta: dia(6) }), lead({ plataforma: null, campanha_ext: null, anuncio_ext: null, data_conversa: dia(3) })], cliente: { cfg: { fee: 600 } } });
  for (const dias of [7, 30, 60]) for (const plat of ["", "meta", "google"]) {
    const S = { dias, plat };
    const janela = () => { const de = M.R - S.dias + 1; return { de, ate: M.R, deA: de - S.dias, ateA: de - 1 }; };
    const cl = vm.runInNewContext(`${src}; numerosPeriodo()`, { M, S, janela });
    const or = L.numerosPeriodo(M, { dias, plat });
    for (const k of ["de", "ate", "deA", "ateA", "roas", "fee", "custoTotal", "retorno"]) assert.equal(cl[k], or[k], `${k} · ${dias} · ${plat || "tudo"}`);
    assert.deepEqual(JSON.parse(JSON.stringify(cl.t)), JSON.parse(JSON.stringify(or.t)));
    assert.deepEqual(JSON.parse(JSON.stringify(cl.c)), JSON.parse(JSON.stringify(or.c)));
  }
});

/* ============================================================ rastreio (script do site) */
const CHAVE_SITE = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";
const WA = "https://wa.me/5512999990000?text=Ol%C3%A1";
function el(tag, attrs = {}, pai = null) {
  const a = { ...attrs };
  return { nodeType: 1, tagName: tag.toUpperCase(), parentNode: pai, getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); }, _a: a };
}
function site({ search = "", config = {}, ua = "Mozilla/5.0 (Windows NT 10.0)", fetch, links = [], extra = {} } = {}) {   // extra: lote ads-2 (history, addEventListener)
  const ouvintes = {}, loja = new Map(), sessao = new Map(), navegacao = [], abertas = [], chamadas = [], avisos = [], infos = [];
  const cfgAttrs = {};
  for (const [k, v] of Object.entries({ chave: CHAVE_SITE, ...config })) cfgAttrs[`data-${k}`] = v;
  const store = m => ({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) });
  const janela = {
    document: { currentScript: el("script", cfgAttrs), addEventListener: (t, f) => { (ouvintes[t] ||= []).push(f); }, querySelectorAll: () => links },
    localStorage: store(loja), sessionStorage: store(sessao),
    location: { search, origin: "https://site.com", pathname: "/", assign: u => navegacao.push(u) },
    navigator: { userAgent: ua, maxTouchPoints: /iPhone/.test(ua) ? 5 : 0 },
    open: (u, alvo, feat) => { const w = { closed: false, opener: {}, location: { replace: v => { w.destino = v; } }, url: u, alvo, feat }; abertas.push(w); return w; },
    fetch: (url, init) => { chamadas.push({ url, corpo: JSON.parse(init.body) }); return fetch ? fetch() : Promise.reject(new Error("sem rede")); },
    AbortController, Promise, setTimeout, clearTimeout, JSON, Date, encodeURIComponent, decodeURIComponent, String, Object, Number, Array, RegExp,
    console: { warn: m => avisos.push(String(m)), info: (m, d) => infos.push([String(m), d]) },
  };
  Object.assign(janela, extra);
  janela.window = janela;
  vm.runInContext(RAST, vm.createContext(janela), { filename: "rastreio.js" });
  const clicar = (alvo, extra = {}) => { const ev = { target: alvo, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; for (const f of ouvintes.click || []) f(ev); return ev; };
  return { janela, api: janela.OrbitaRastreio, clicar, navegacao, abertas, chamadas, avisos, infos, loja, ouvintes };
}
const okCodigo = c => async () => ({ ok: true, json: async () => ({ ok: true, codigo: c }) });

test("AD-160 · iPhone: o código é pedido no carregamento (com utm) e o clique nunca abre janela vazia", async () => {
  const s = site({ search: "?utm_source=meta&fbclid=F1", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", fetch: okCodigo("K7Q2P") });
  await esperar(20);
  assert.equal(s.chamadas.length, 1, "antes: só pedia no clique (fora do gesto)");
  const a = el("a", { href: WA, target: "_blank" });
  const ev = s.clicar(a);
  assert.equal(ev.defaultPrevented, false, "com o código em cache o clique segue síncrono, dentro do gesto");
  assert.match(a.getAttribute("href"), /%5Bref%20K7Q2P%5D$/);
  // sem código a tempo (Órbita fora): no iPhone vai na mesma aba, sem janela em branco
  const f = site({ search: "?gclid=G", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" });
  f.clicar(el("a", { href: WA, target: "_blank" }));
  await esperar(30);
  assert.equal(f.abertas.length, 0, "antes: window.open('', '_blank') → aba em branco");
  assert.deepEqual(f.navegacao, [WA]);
  assert.match(RAST, /ESPERA_IOS_MS = 700/);
});

test("AD-161 · link encurtado (wa.link, bit.ly) avisa no console e segue sem tocar no link", () => {
  const s = site({ fetch: okCodigo("K7Q2P") });
  assert.equal(s.api.ehEncurtador("https://wa.link/abc123"), true);
  assert.equal(s.api.ehEncurtador("https://www.bit.ly/x"), true);
  assert.equal(s.api.ehEncurtador(WA), false);
  const a = el("a", { href: "https://wa.link/abc123" });
  const ev = s.clicar(a);
  assert.equal(ev.defaultPrevented, false);
  assert.ok(s.avisos.some(m => /link encurtado \(https:\/\/wa\.link\/abc123\)/.test(m)), "antes: saía sem código e sem aviso");
  s.clicar(el("a", { href: "https://bit.ly/zz" }));
  assert.equal(s.avisos.filter(m => /encurtado/.test(m)).length, 1, "avisa uma vez");
});

test("AD-163 · window.open('https://wa.me/…') e <button data-orbita-wa> recebem o código", async () => {
  const s = site({ search: "?gclid=G1", fetch: okCodigo("K7Q2P") });
  await esperar(20);                                     // o código chega no carregamento
  const w = s.janela.open(WA, "_blank");
  assert.match(w.url, /%5Bref%20K7Q2P%5D$/, "antes: window.open passava sem código");
  assert.equal(s.janela.open("https://exemplo.com", "_blank").url, "https://exemplo.com", "outros endereços intactos");
  const b = el("button", { "data-orbita-wa": WA });
  const ev = s.clicar(el("span", {}, b));
  assert.equal(ev.defaultPrevented, true);
  await esperar(5);                                      // plano 1000 (AD-171, lote ads-2): a navegação sai depois do ciclo do evento
  assert.match(s.navegacao[0], /%5Bref%20K7Q2P%5D$/);
  // sem código ainda: o window.open vai com o link original e o código esquenta
  const f = site({ fetch: okCodigo("Z9Y8X") });
  assert.equal(f.janela.open(WA).url, WA);
  await esperar(20);
  assert.equal(f.chamadas.length, 1, "aqueceu para o próximo");
});

test("AD-166 · data-consentimento=aguardar: nada guardado nem enviado até consentir()", async () => {
  const s = site({ search: "?utm_source=google&gclid=G1", config: { consentimento: "aguardar" }, fetch: okCodigo("K7Q2P") });
  await esperar(20);
  assert.equal(s.loja.size, 0, "antes: gravava antes do banner");
  assert.equal(s.chamadas.length, 0);
  const ev = s.clicar(el("a", { href: WA }));
  assert.equal(ev.defaultPrevented, false, "o link segue original, sem esperar");
  assert.equal(s.api.consentir(), true);
  assert.ok(s.loja.has("orbita:rastreio:v1"), "depois do aceite guarda a origem");
  await esperar(20);
  assert.equal(s.chamadas.length, 1);
});

test("AD-170 · ?orbita_debug=1 mostra no console parâmetros, código e links (nada muda no comportamento)", () => {
  const links = [el("a", { href: WA }), el("a", { href: "https://wa.link/x" }), el("a", { href: "https://site.com/sobre" })];
  const s = site({ search: "?orbita_debug=1&utm_source=meta", links });
  const d = s.infos.find(([m]) => /diagnóstico/.test(m));
  assert.ok(d, "antes: não havia modo diagnóstico");
  assert.equal(d[1].ativo, true); assert.equal(d[1].parametros.utm_source, "meta");
  assert.deepEqual(JSON.parse(JSON.stringify(d[1].links.map(x => [x.rastreia, x.motivo]))), [[true, ""], [false, "encurtado"]]);
  assert.equal(site({ search: "?utm_source=meta", links }).infos.length, 0, "sem o parâmetro, silêncio");
  const codigo = RAST.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of [/innerHTML/, /\beval\s*\(/, /document\.cookie/, /sendBeacon/]) assert.ok(!proibido.test(codigo), `não pode usar ${proibido}`);
});

/* ======================================================================================================================
   LOTE ads-2 (13/10/2026) — núcleo, rel-logica, Anúncios, Relatórios, painel clássico, folha e script do site
   ====================================================================================================================== */
const FOLHA_SRC = ler("web/folha.js");
const ADS2 = ler("web/app/anuncios.js"), REL2 = ler("web/app/relatorios.js"), PJS2 = ler("web/painel.js"), CSS2 = ler("web/app/relatorios.css"), PCSS2 = ler("web/painel.css");
const metG = (d, o = {}) => met(d, { p: "google", c: "G1", cn: "Pesquisa Google", a: "GA1", an: "Texto", conv: 1.5, ...o });

/* ---------------- núcleo ---------------- */
test("AD-021 · esc() escapa a aspa simples", () => {
  assert.equal(N.esc(`a'b"<c>&`), "a&#39;b&quot;&lt;c&gt;&amp;");     // antes: a'b… (atributo com aspas simples quebrava)
});

test("AD-220 · sem nome curto, o cabeçalho corta em palavra inteira e sem reticências", () => {
  assert.equal(N.nomeCurtoEmpresa("Clínica Odontológica Sorriso Feliz"), "Clínica Odontológica");
  assert.equal(N.nomeCurtoEmpresa("Oficina do Zé de Taubaté Centro"), "Oficina do Zé");          // larga o «de» solto no fim
  assert.equal(N.nomeCurtoEmpresa("Curto"), "Curto");
  const M = montarDe({ metricas: serie(1, 3), cliente: { nome: "Clínica Odontológica Sorriso Feliz" } });
  assert.equal(M.NOME, "Clínica Odontológica", "antes: «Clínica Odontológica S…»");
  assert.equal(montarDe({ metricas: serie(1, 3), cliente: { nome: "Clínica Odontológica Sorriso Feliz", cfg: { nomeCurto: "Sorriso" } } }).NOME, "Sorriso");
});

test("AD-013/AD-116 · dia sem conversa e meta 0 no diário do WhatsApp", () => {
  const M = montarDe({ metricas: [...serie(2, 8), met(dia(1), { conv: 0 })] });
  const t = M.relDiario(M.R);
  assert.match(t, /• Custo por conversa: nenhuma conversa no dia \(R\$\s30,00 investidos\)/, "antes: «Custo por conversa: — · meta R$ 15»");
  const sem = montarDe({ metricas: serie(1, 8), cliente: { cfg: { cpaAlvo: 0 } } }).relDiario(129);
  assert.doesNotMatch(sem, /meta R\$\s0/, "meta 0 = sem meta, não «meta R$ 0,00»");
});

test("AD-218/AD-219 · reais inteiros acima de R$ 100 e «1 toque a cada N vezes» no lugar do CTR", () => {
  const M = montarDe({ metricas: serie(1, 8, { g: 1234.56, imp: 8100, cli: 100 }) });
  const t = M.relDiario(M.R);
  assert.match(t, /• Investido: R\$\s1\.235/, "antes: R$ 1.234,56");
  assert.match(t, /• Meta: R\$\s1\.235 → 2 conversas · 1 toque a cada 81 vezes que o anúncio apareceu/);
  assert.doesNotMatch(t, /CTR/);
  assert.match(montarDe({ metricas: serie(1, 8) }).relDiario(129), /• Investido: R\$\s30,00/, "abaixo de R$ 100 segue com centavos");
});

test("AD-018 · melhor/pior da semana com piso proporcional (5% do gasto da semana)", () => {
  const grande = [...serie(1, 7, { c: "C1", cn: "Grande A", a: "A1", g: 700 }), ...serie(1, 7, { c: "C2", cn: "Grande B", a: "A2", g: 700, conv: 3 }),
    ...serie(1, 7, { c: "C3", cn: "Pequena", a: "A3", g: 3, conv: 1 })];
  const t = montarDe({ metricas: grande }).relDiario(129);
  assert.doesNotMatch(t, /Melhor: Pequena/, "antes: R$ 21 na semana bastava para ser «melhor» numa conta de R$ 9,8 mil");
  assert.match(t, /🟢 Melhor: Grande B/);
});

test("AD-017 · contextoIA manda conversões com 2 casas (1,5 do Google não vira 2)", () => {
  const M = montarDe({ metricas: [metG(dia(1))] });
  assert.equal(M.contextoIA(M.R).ontem.conversas, 1.5);
});

test("AD-213 · leitura escrita pela IA vem marcada como automática (diário e mensal)", () => {
  const M = montarDe({ metricas: serie(1, 60) });
  assert.match(M.relDiario(M.R, "Tudo bem com as campanhas."), /Tudo bem com as campanhas\.\n_\(leitura automática\)_/);
  const mes = M.mesesDados().find(m => m.completo);
  assert.match(M.relMensal(mes, "Gravar vídeos."), /Gravar vídeos\.\n_\(leitura automática\)_/);
  assert.doesNotMatch(M.relDiario(M.R), /leitura automática/, "sem IA, sem a marca");
});

test("AD-015/AD-244/AD-215 · mensal: conselhos da vertical, Google só com Google, investimento vs. mês anterior e nota de reatribuição", () => {
  const ago = Array.from({ length: 31 }, (_, k) => met(`2026-08-${String(k + 1).padStart(2, "0")}`, { g: 30 }));
  const set = Array.from({ length: 30 }, (_, k) => met(`2026-09-${String(k + 1).padStart(2, "0")}`, { g: 33 }));
  const mensal = (metricas, vertical, hoje = HOJE) => { const M = montarDe({ metricas, hoje, cliente: { vertical } }); return M.relMensal(M.mesesDados().find(m => m.completo && m.mes === 8)); };
  const oficina = mensal([...ago, ...set], "oficina");
  assert.match(oficina, /Gravar 1 vídeo novo mostrando um serviço sendo feito na oficina/, "antes: «rosto de quem atende» para todo mundo");
  assert.doesNotMatch(oficina, /avaliação no Google/, "sem Google no mês, nada de «avaliação no Google»");
  assert.match(oficina, /💰 Investido em anúncios: R\$\s990 \(\+6% vs\. agosto\)/, "antes: só os fechamentos eram comparados");
  const comGoogle = mensal([...ago, ...set, metG("2026-09-10")], "odonto");
  assert.match(comGoogle, /Pedir avaliação no Google aos pacientes satisfeitos/);
  assert.doesNotMatch(oficina, /podem se ajustar/, "mês fechado há 12 dias: sem a nota");
  assert.match(mensal([...ago, ...set], "odonto", "2026-10-04"), /_Os números de setembro ainda podem se ajustar um pouco até o dia 7/);
});

test("AD-023 · agendamento sem data cai no dia da conversa, marcado e contado à parte", () => {
  const M = montarDe({ metricas: serie(1, 10), leads: [lead({ etapa: "agendada", data_conversa: dia(3) }), lead({ etapa: "agendada", data_conversa: dia(3), data_agenda: dia(2) })] });
  const c = M.crmTot(M.R - 9, M.R);
  assert.equal(c.agendadas, 2);
  assert.equal(c.agendaSemData, 1, "antes: nada dizia que um deles era estimado");
  assert.match(ADS2, /c\.agendaSemData > 0 \? h\("span", \{ class: "rel-nota ads-agenda-sem-data" \}/);
});

test("AD-025/AD-026 · linhasDe por índice devolve exatamente o mesmo (e na mesma ordem) que o filtro antigo", () => {
  const metricas = [];
  for (let d = 1; d <= 40; d++) for (const [c, a, p] of [["C1", "A1", "meta"], ["C1", "A2", "meta"], ["C2", "A3", "meta"], ["G1", "GA1", "google"]]) metricas.push(met(dia(d), { c, a, p, g: d + a.length }));
  metricas.push({ ...met(dia(5), { c: "C2", a: "" }), n: "campanha", g: 999 });
  const M = montarDe({ metricas });
  const velho = (de, ate, f = {}) => M.LINHAS.filter(l => l.i >= de && l.i <= ate && (!f.plat || l.plat === f.plat) && (!f.camp || l.camp === f.camp) && (!f.cri || l.cri === f.cri));
  for (const [de, ate] of [[M.R, M.R], [M.R - 6, M.R], [M.R - 13, M.R - 7], [M.R - 29, M.R], [-50, M.R], [M.R - 200, M.R - 100], [M.R - 3, M.R - 5]])
    for (const f of [{}, { plat: "meta" }, { camp: "meta:C1" }, { cri: "meta:A2" }, { plat: "google", camp: "google:G1" }, { camp: "meta:C2" }])
      assert.deepEqual(M.linhasDe(de, ate, f), velho(de, ate, f), `${de}..${ate} ${JSON.stringify(f)}`);
});

test("AD-134 · o radar é calculado uma vez por M (trocar filtro não refaz avaliar/histórico)", () => {
  const M = montarDe({ metricas: serie(1, 30) });
  L.montarRadar(M, {});
  const n = { ...M.CONTAGEM };
  L.montarRadar(M, {}); L.montarRadar(M, {}, Date.now() + 60000);
  assert.deepEqual({ ...M.CONTAGEM }, n, "antes: cada desenhar() refazia 15 avaliações");
  const a = M.historico(), tam = a.length; a.length = 0;
  assert.equal(M.historico().length, tam, "quem mexe na lista devolvida não estraga a guardada");
});

test("AD-053 · alerta de criativo com o nome curto e sem repetir a campanha contida no nome", () => {
  const ms = serie(1, 7, { c: "C9", cn: "Prova social", a: "A9", an: "Prova social · print", imp: 2000, cli: 2, freq: 1 });
  const a = montarDe({ metricas: ms }).avaliar(129).find(x => x.regra.id === "r3");
  assert.ok(a, "r3 dispara (CTR 0,1%)");
  assert.doesNotMatch(a.msg, /\(em /, "antes: «… (em Prova social)» repetia a campanha");
  const outro = montarDe({ metricas: serie(1, 7, { c: "C9", cn: "Implante", a: "A9", an: "Vídeo do doutor", imp: 2000, cli: 2 }) }).avaliar(129).find(x => x.regra.id === "r3");
  assert.match(outro.msg, /Vídeo do doutor \(em Implante\)/);
});

test("AD-238 · fadiga (r4) não acusa campanha de remarketing (frequência alta por desenho)", () => {
  const fad = (o, cliente = {}) => montarDe({ metricas: serie(1, 7, { freq: 4, imp: 1000, ...o }), cliente }).avaliar(129).filter(x => x.regra.id === "r4").length;
  assert.equal(fad({ cn: "Campanha fria" }), 1);
  assert.equal(fad({ cn: "Remarketing · quem visitou o site" }), 0, "antes: acusava sempre");
  assert.equal(fad({ cn: "[RMKT] Instagram" }), 0);
  assert.equal(fad({}, { cfg: { remarketing: ["meta:C1"] } }), 0, "ou pelo id em cfg.remarketing");
});

test("AD-234 · soma dos anúncios acima do total da campanha: vale o total da campanha e a divergência fica registrada", () => {
  const ms = [met(dia(1), { a: "A1", g: 60 }), met(dia(1), { a: "A2", g: 40 }), { ...met(dia(1)), n: "campanha", a: "", g: 80 }];
  const M = montarDe({ metricas: ms });
  const t = M.consolidar(M.linhasDe(M.R, M.R));
  assert.equal(Math.round(t.gasto * 100), 8000, "antes: R$ 100 (a soma dos anúncios), mais do que a plataforma cobrou");
  assert.equal(M.DIVERGENCIAS.length, 1);
  assert.deepEqual({ ...M.DIVERGENCIAS[0] }, { camp: "meta:C1", i: M.R, campanha: 80, anuncios: 100 });
  assert.equal(Math.round(M.LINHAS.find(l => l.cri === "meta:A1").gasto * 100), 4800, "proporção entre os anúncios mantida (60/100 de 80)");
});

/* ---------------- rel-logica ---------------- */
test("AD-110/AD-116 · nivelCpa: neutro sem base (gasto < R$ 20) ou sem meta; KPI sem «Infinity%»", () => {
  assert.equal(L.nivelCpa(2, 15, 2), "neutro", "antes: ponto vermelho numa campanha de R$ 2");
  assert.equal(L.nivelCpa(null, 15, 5), "neutro");
  assert.equal(L.nivelCpa(null, 15, 50), "ruim", "gastou de verdade sem conversa continua ruim");
  assert.equal(L.nivelCpa(10, 15, 100), "bom");
  assert.equal(L.nivelCpa(10, 0, 100), "neutro", "meta 0 do clássico");
  const P = L.numerosPeriodo(montarDe({ metricas: serie(1, 30), cliente: { cfg: { cpaAlvo: 0 } } }), { dias: 30 });
  const k = L.kpisAnuncios(P, { meta: 0, dif: null, brl: N.brl, brl0: N.brl0, pc: N.pc, dec: N.dec, int: N.int }).find(x => x.id === "cpa");
  assert.equal(k.extra, "sem meta definida"); assert.equal(k.medidor, false);
  assert.match(ADS2, /dif = Number\.isFinite\(t\.cpa\) && meta > 0 \?/);
  assert.match(PJS2, /const dif = fin\(t\.cpa\) && meta > 0 \?/); assert.match(PJS2, /medidor: !temG && meta > 0/);
  // plano 1500c: AC-224 — o clássico pinta pela meta da campanha/plataforma (nivelCpa: sem meta → «dot-neutro»)
  assert.match(PJS2, /if \(!\(meta > 0\)\) return "dot-neutro";/); assert.match(PCSS2, /\.dot-neutro \{/); assert.match(CSS2, /\.rel-ponto-neutro \{/);
});

test("AD-112 · ranking sem receita no período abre em «Menor custo por conversa» (sem escolha guardada) e avisa", () => {
  const M = montarDe({ metricas: serie(1, 30, { conv: 3 }) });
  assert.equal(L.rankingCriativos(M, { dias: 30 }).lista.length, 0, "antes: «Nenhum criativo trouxe receita»");
  const r = L.rankingCriativos(M, { dias: 30, reserva: true });
  assert.equal(r.por, "cpa"); assert.equal(r.automatico, true); assert.ok(r.lista.length >= 1);
  assert.match(ADS2, /reserva: !S\.rankEscolhido/); assert.match(ADS2, /R\.automatico \? h\("p", \{ class: "rel-nota ads-rank-auto" \}/);
});

test("AD-140 · período personalizado não aceita data futura (validação e max=hoje nos campos)", () => {
  assert.equal(L.validarPeriodo("2026-10-01", "2027-01-01", "2026-10-13").ok, false);
  assert.match(L.validarPeriodo("2026-10-01", "2026-10-14", "2026-10-13").texto, /não pode passar de hoje/);
  assert.equal(L.validarPeriodo("2026-10-01", "2026-10-13", "2026-10-13").ok, true);
  assert.match(REL2, /"aria-label": "De", value: P\.de \|\| "", max: hojeIso/);
  assert.match(REL2, /"aria-label": "Até", value: P\.ate \|\| "", max: hojeIso/);
});

test("AD-057 · Radar com mais de 12 episódios diz quantos ficaram de fora", () => {
  const ms = [];
  for (let k = 0; k < 16; k++) ms.push(...serie(1, 14, { c: `C${k}`, cn: `Campanha ${k}`, a: `A${k}`, conv: 0, g: 30 }));
  const R = L.montarRadar(montarDe({ metricas: ms }), {});
  assert.equal(R.episodios.length, 12);
  assert.ok(R.ocultos > 0, "antes: hist.slice(0, 12) sem aviso");
  assert.match(ADS2, /R\.ocultos > 0 && filtro !== "ativos"/);
});

test("AD-059 · alerta leva à campanha: campanhaDoAlerta (r1/r2 pela chave, r3/r4 pelo criativo) e «Ver campanha»", () => {
  const M = montarDe({ metricas: serie(1, 10) });
  assert.equal(L.campanhaDoAlerta(M, "r2|meta:C1"), "meta:C1");
  assert.equal(L.campanhaDoAlerta(M, "r4|meta:A1"), "meta:C1");
  assert.equal(L.campanhaDoAlerta(M, "r5|conta"), null); assert.equal(L.campanhaDoAlerta(M, "ritmo"), null);
  const r = L.linhaCampanha(M, "meta:C1", { dias: 7 });
  assert.equal(r.c.id, "meta:C1"); assert.equal(Math.round(r.t.gasto), 210);
  assert.match(ADS2, /L\.campanhaDoAlerta\(M, e\.chave\)/); assert.match(ADS2, /"Ver campanha"\)/);
});

test("AD-081/AD-082/AD-127 · pílula vira botão com detalhe por plataforma; só a mudança de nível é anunciada; «Recarregar» + próxima leitura", () => {
  const agora = Date.parse("2026-10-13T15:00:00Z");
  const e = L.estadoIntegracao([{ canal: "meta", ativo: true, ultimo_sync: "2026-10-13T14:40:00Z", status: "ok" }, { canal: "google", ativo: true, status: "" }], [], agora);
  const d = L.detalhePilula(e, agora);
  assert.deepEqual(d.map(x => x.nome), ["Meta", "Google"]);
  assert.match(d[0].texto, /^lida hoje às 11:40/); assert.equal(d[1].texto, "ainda não leu");
  assert.equal(L.proximaLeitura(Date.parse("2026-10-13T14:40:00Z"), agora), "próxima leitura em ~40 min");
  assert.equal(L.proximaLeitura(Date.parse("2026-10-13T13:40:00Z"), agora), "próxima leitura a qualquer momento");
  assert.match(ADS2, /const pilula = h\("button", \{ type: "button", class: "ads-pilula", "aria-expanded": "false", "aria-controls": "ads-pilula-pop", "aria-live": "off" \}/);
  assert.doesNotMatch(ADS2, /class: "ads-pilula", role: "status"/, "antes: role=status relido a cada 30 s");
  assert.match(ADS2, /if \(nivelAnunciado !== null && nivelAnunciado !== e\.nivel\) avisoNivel\.textContent/);
  assert.match(ADS2, /h\("span", \{ class: "rel-rot" \}, "Recarregar"\)/);
});

test("AD-093 · centro da rosca mostra a plataforma com mais investimento", () => {
  assert.deepEqual(L.centroRosca([{ rotulo: "Meta", valor: 0 }, { rotulo: "Google", valor: 300 }]), { valor: "100%", rotulo: "no Google" }, "antes: «0% no Meta»");
  assert.deepEqual(L.centroRosca([{ rotulo: "Meta", valor: 700 }, { rotulo: "Google", valor: 300 }]), { valor: "70%", rotulo: "no Meta" });
  assert.match(ADS2, /centro: L\.centroRosca\(fatias\)/);
});

test("AD-103/AD-143 · arquivos exportados com o nome do cliente (Anúncios e Relatórios)", () => {
  assert.equal(L.nomeArquivoExport("funil", "2026-09-14", "2026-10-13", "csv", "Clínica Kamiguchi"), "orbita-clinica-kamiguchi-funil-2026-09-14-a-2026-10-13.csv");
  assert.equal(L.nomeArquivoExport("tendencia", "a", "b"), "orbita-tendencia-a-a-b.png", "sem cliente, o formato de antes");
  assert.match(ADS2, /"csv", ctx\.cliente\.nome, "", marcaAgencia\(\)\)\)/);   // plano 1000b: AB-209 encadeia o aviso … · plano 2000d: DA-336 — com a agência
  assert.match(REL2, /L\.nomeArquivoExport\(nome, de, ate, "csv", ctx\.cliente\.nome\)/, "antes: «funil-2026-09-14-a-2026-10-13.csv»");
  assert.match(REL2, /L\.nomeArquivoExport\(png, de, ate, "png", ctx\.cliente\.nome\)/);
});

test("AD-104 · CSV de campanhas com a plataforma legível", () => {
  const M = montarDe({ metricas: [...serie(1, 7), ...serie(1, 7, { p: "google", c: "G1", a: "GA1" })] });
  const { linhas } = L.linhasCampanhas(M, { dias: 7 });
  const csv = A.csvCampanhas(linhas, { periodo: "x", csv: L.csv, nomePlat: L.nomePlat });
  const plats = csv.replace(/^﻿/, "").split("\r\n").slice(1).map(l => l.split(";")[2]).sort();
  assert.deepEqual(plats, ["Google", "Meta"], "antes: meta/google");
});

test("AD-120 · PNG com título, cliente e período e a fonte do sistema declarada", () => {
  assert.deepEqual(L.cabecalhoPng({ titulo: "Tendência", cliente: "Clínica X", periodo: "Últimos 30 dias" }), ["Tendência", "Clínica X · Últimos 30 dias"]);
  const svg = { nodeType: 1, tagName: "svg", getAttributeNames: () => [], getAttribute: () => null, childNodes: [] };
  assert.match(A.svgParaTexto(svg, () => ({ getPropertyValue: p => (p === "font-family" ? "Plex" : "") }), ["font-family"]), /font-family:Plex, system-ui/);
  assert.match(ADS2, /exportarSvgPng\(svg, typeof nome === "function" \? nome\(\) : nome, \{ L, cabecalho:/);
  assert.match(ADS2, /\.\.\.pngDe\("tendencia"/); assert.match(REL2, /cabecalho: \(\) => \{ const \{ de, ate \} = periodo\(\); return L\.cabecalhoPng/);
});

test("AD-121 · no app instalado o arquivo vai pela folha de compartilhar; fora dele, download normal", async () => {
  const partilhas = [];
  const nav = { standalone: true, canShare: () => true, share: async o => { partilhas.push(o); } };
  assert.equal(await A.baixarArquivo(new Blob(["a;b"], { type: "text/csv" }), "x.csv", { nav, doc: null }), "compartilhado");
  assert.equal(partilhas[0].files[0].name, "x.csv");
  const cliques = [];
  const doc = { body: { append() {} }, createElement: () => ({ click() { cliques.push(this.download); }, remove() {} }) };
  assert.equal(await A.baixarArquivo(new Blob(["a"]), "y.csv", { nav: { share: async () => {} }, doc, standalone: false }), "baixado");
  assert.deepEqual(cliques, ["y.csv"]);
  assert.match(REL2, /X\.baixarArquivo\(new Blob/);
});

test("AD-147 · séries acima de 60 dias agrupadas por semana (segunda a domingo)", () => {
  const s = Array.from({ length: 14 }, (_, k) => ({ d: L.somarDias("2026-10-01", k), criados: 1, ganhos: k % 2 }));   // 01/10 é quinta
  const g = L.agruparSemana(s, ["criados", "ganhos"]);
  assert.deepEqual(g.map(x => [x.d, x.ate, x.dias, x.criados]), [["2026-10-01", "2026-10-04", 4, 4], ["2026-10-05", "2026-10-11", 7, 7], ["2026-10-12", "2026-10-14", 3, 3]]);
  assert.equal(L.DIAS_AGRUPAR_SEMANA, 60);
  assert.match(REL2, /const semanal = serie\.length > L\.DIAS_AGRUPAR_SEMANA;/);
});

test("AD-257 · rosca de motivos com 10+ motivos: os 5 maiores + «Outros (N)»", () => {
  const mot = Array.from({ length: 10 }, (_, k) => ({ nome: `m${k}`, qtd: 10 - k, valor: 100 }));
  const r = L.agruparOutros(mot, { max: 6 });
  assert.equal(r.length, 6); assert.equal(r[5].nome, "Outros (5)"); assert.equal(r[5].qtd, 1 + 2 + 3 + 4 + 5);
  assert.equal(L.agruparOutros(mot.slice(0, 4)).length, 4);
  assert.match(REL2, /L\.agruparOutros\(mot, \{ max: 6, juntar:/);
});

test("AD-261 · CSV protege fórmula com espaço antes (« =HIPERLINK(…)»)", () => {
  const out = L.csv(["n"], [[" =HIPERLINK(\"x\")"], ["  +1"], ["\t@a"], ["ok"]]).replace(/^﻿/, "").split("\r\n");
  // plano 1500c: «+» seguido só de número é número (telefone, AC-164) e fica sem apóstrofo
  assert.equal(out[1], `"' =HIPERLINK(""x"")"`); assert.equal(out[2], "  +1"); assert.equal(out[3], "'\t@a"); assert.equal(out[4], "ok");
});

test("AD-151 · janelaComparacao em ano bissexto e na virada de ano", () => {
  assert.deepEqual(RL.janelaComparacao("2028-02-29", "2028-03-01"), { dias: 2, atual: { de: "2028-02-29", ate: "2028-03-01" }, anterior: { de: "2028-02-27", ate: "2028-02-28" } });
  assert.deepEqual(RL.janelaComparacao("2028-03-01", "2028-03-31").anterior, { de: "2028-01-30", ate: "2028-02-29" });
  assert.deepEqual(RL.janelaComparacao("2027-01-01", "2027-01-07").anterior, { de: "2026-12-25", ate: "2026-12-31" });
  assert.deepEqual(RL.janelaComparacao("2027-02-28", "2027-03-01").anterior, { de: "2027-02-26", ate: "2027-02-27" });
});

/* ---------------- Anúncios (peças com DOM mínimo + fonte) ---------------- */
test("AD-107/AD-231 · barras: tocar abre os criativos; «Mostrar todas (N)» acima de 8", () => {
  const linhas = Array.from({ length: 11 }, (_, i) => ({ c: { id: `c${i}`, nome: `C${i}`, plat: "meta" }, t: { gasto: 100 - i, conversoes: 1 }, k: { agendadas: 0 } }));
  const abertas = [];
  const b = A.criarBarrasCampanhas({ h: hFake, linhas, aoEscolher: r => abertas.push(r.c.id) });
  const itens = () => { const out = []; const andar = n => { if (n && n.attrs && /ads-cb-item/.test(n.attrs.class || "")) out.push(n); for (const f of n?.filhos || []) andar(f); }; andar(b.elemento); return out; };
  assert.equal(itens().length, 8);
  assert.ok(b.botaoTodas, "antes: sem «ver todas»"); assert.equal(b.botaoTodas.textContent, "Mostrar todas (11)");
  b.botaoTodas.eventos.click(); assert.equal(itens().length, 11); assert.equal(b.botaoTodas.getAttribute("aria-expanded"), "true");
  itens()[0].eventos.click(); assert.deepEqual(abertas, ["c0"]);
  assert.equal(itens()[0].attrs["aria-haspopup"], "dialog");
  assert.match(ADS2, /aoEscolher: r => \{\s*criativos\(M, r\);/, "antes: a barra marcava a comparação");
});

test("AD-119 · calor semanal: toque numa célula ou setas mostram o valor numa dica viva", () => {
  const calor = { matriz: Array.from({ length: 7 }, (_, d) => [d, d + 1]), semanas: [{ rotulo: "06/10" }, { rotulo: "13/10" }], max: 7, pico: null };
  const caixa = A.criarCalorSemanal({ h: hFake, calor, fmt: v => `${v} conversas` });
  const dica = buscar(caixa, n => /ads-cal-dica/.test(n?.attrs?.class || ""));
  const grade = buscar(caixa, n => /(^| )ads-cal( |$)/.test(n?.attrs?.class || ""));
  assert.equal(dica.attrs["aria-live"], "polite"); assert.equal(grade.attrs.tabindex, "0");
  const cel = buscar(caixa, n => n?.dataset?.txt === "seg · semana de 13/10: 2 conversas");
  cel.eventos.click(); assert.equal(dica.textContent, "seg · semana de 13/10: 2 conversas", "antes: valor só no title");
  grade.eventos.keydown({ key: "Home", preventDefault() {} }); assert.equal(dica.textContent, "seg · semana de 06/10: 1 conversas");
  grade.eventos.keydown({ key: "ArrowDown", preventDefault() {} }); assert.match(dica.textContent, /^ter · semana de 06\/10/);
});

test("AD-229 · semáforo: o número e o rótulo visíveis ficam fora da leitura (só o aria-label)", () => {
  const s = A.criarSemaforoRadar({ h: hFake, semaforo: { contagens: { critico: 1, alerta: 0, info: 2 }, cor: "ruim", frase: "x", acao: "y" } });
  const luz = buscar(s.elemento, n => n?.attrs?.["aria-label"] === "1 crítico");
  const small = buscar(luz, n => n.tag === "small"), b = buscar(luz, n => n.tag === "b");
  assert.equal(small.attrs["aria-hidden"], "true"); assert.equal(b.attrs["aria-hidden"], "true");
});

test("AD-260 · ordenação da tabela lembrada por cliente", () => {
  assert.equal(A.chaveOrdem("c1"), "nx-app-ads-ordem:c1");
  assert.deepEqual(A.lerOrdem('{"chave":"cpa","dir":1}'), { chave: "cpa", dir: 1 });
  assert.deepEqual(A.lerOrdem("lixo"), { chave: "gasto", dir: -1 }); assert.deepEqual(A.lerOrdem('{"chave":"x","dir":1}'), { chave: "gasto", dir: -1 });
  assert.match(ADS2, /S\.ordem = lerOrdem\(lerLocal\(chaveOrdem\(ctx\.cliente\.id\), ""\)\)/);
  assert.match(ADS2, /gravarLocal\(chaveOrdem\(ctx\.cliente\.id\), JSON\.stringify\(S\.ordem\)\)/);
});

test("AD-232 · paleta: «Ir para o Radar», «Ver campanhas» e «Exportar campanhas (CSV)», registrados e soltos ao sair", () => {
  const ids = [];
  const cmds = A.comandosAnuncios({ irRadar: () => ids.push("radar"), irCampanhas: () => {}, exportarCampanhas: () => {} });
  assert.deepEqual(cmds.map(c => c.id), ["anuncios.radar", "anuncios.campanhas", "anuncios.exportar"]);
  cmds[0].fazer(); assert.deepEqual(ids, ["radar"]);
  assert.match(ADS2, /ctx\.comandos\.registrar\(c\)/); assert.match(ADS2, /export function desmontar\(\) \{ soltarGraficos\(\); soltarComandos\(\);/);
});

test("AD-259 · tabela de campanhas com CTR (some no celular)", () => {
  assert.match(ADS2, /\["ctr", "CTR", "Cliques ÷ impressões da plataforma no período\."\]/);
  assert.match(ADS2, /td\("ctr", N\.pc\(r\.t\.ctr, 2\), "CTR"\)/);
  assert.match(CSS2, /@media \(max-width: 760px\) \{ \.ads-tabela td\.c-ctr, \.ads-tabela th\.c-ctr \{ display: none; \} \}/);
});

test("AD-095/AD-117/AD-135/AD-230/AD-125 · textos e cache da tela de Anúncios", () => {
  assert.match(ADS2, /const olhoHeroi = filtros\.hidden \? periodoTexto : P\.rotulo\.titulo;/, "AD-095: herói só com «Últimos 30 dias»");
  assert.match(ADS2, /class: "rel-nota ads-diario-dif" \}, "O investimento dividido por plataforma/, "AD-117");
  assert.match(ADS2, /" em receita registrada no CRM"/, "AD-135");
  assert.match(ADS2, /h\("p", \{ class: "rel-nota ads-regra-limite" \}, h\("b", \{\}, "Limite: "\), descreverRegra\(r\)\)/, "AD-230");
  assert.match(ADS2, /rpcC\("nx_dados", \{ p_dias: DIAS_JANELA \}, \{ cache: true, aoCache:/, "AD-125: stale-while-revalidate");
  assert.match(ADS2, /if \(pintouDoCache \|\| \(e && e\.comCache\)\)/);
});

/* ---------------- Relatórios ---------------- */
test("AD-141 · período guardado por cliente (o legado global vale só até o cliente escolher)", () => {
  const pref = { preset: 7, periodo: { c1: { preset: "per", de: "2026-09-01", ate: "2026-09-30" } } };
  assert.deepEqual(RL.periodoDoCliente(pref, "c1"), { preset: "per", de: "2026-09-01", ate: "2026-09-30" });
  assert.deepEqual(RL.periodoDoCliente(pref, "c2"), { preset: 7, de: null, ate: null }, "sem período próprio: o global de antes");
  assert.deepEqual(RL.periodoDoCliente({}, "c3"), { preset: 30, de: null, ate: null });
  assert.deepEqual(RL.limparFiltrosRelatorios(pref, "c1").periodo, { c1: { preset: 30, de: null, ate: null } });
  // plano 1500c: o período do cliente guarda também «incluir hoje» (AC-156)
  assert.match(REL2, /periodo: \{ \.\.\.\(p\.periodo \|\| \{\}\), \[ctx\.cliente\.id\]: \{ preset: P\.preset, de: P\.de, ate: P\.ate, hoje: !!P\.hoje \} \}/);
});

test("AD-146 · «Limpe os filtros» só com filtro de verdade (7/90 dias não são filtro)", () => {
  assert.equal(RL.recorteFiltrado({ preset: 7 }), false, "antes: 7 dias pedia «Limpe os filtros»");
  assert.equal(RL.recorteFiltrado({ preset: 90 }), false);
  assert.equal(RL.recorteFiltrado({ preset: "per" }), true);
  assert.equal(RL.recorteFiltrado({ preset: 30, funil: "f1" }), true);
  assert.match(REL2, /const filtrado = recorteFiltrado\(P\);/);
});

test("AD-150 · «Quando os pacientes chamam» pelo vocabulário", () => {
  assert.equal(RL.tituloQuandoChamam({ min: k => (k === "contatos" ? "pacientes" : k) }), "Quando os pacientes chamam");
  assert.equal(RL.tituloQuandoChamam({}), "Quando os clientes chamam");
  assert.match(REL2, /cartao\(tituloQuandoChamam\(V\),/);
});

test("AD-253/AD-254/AD-255/AD-256/AD-258 · Enter aplica, hora da carga, atalho de abertas, funil vazio com caminho, «Personalizado»", () => {
  assert.match(REL2, /const personal = h\("form", \{ class: "relat-per"/); assert.match(REL2, /type: "submit", class: "rel-btn rel-btn-prim" \}, "Aplicar"/);
  assert.match(REL2, /personal\.addEventListener\("submit", ev => \{\s*ev\.preventDefault\(\);/);
  assert.match(REL2, /horaCarga\.textContent = `Atualizado às \$\{L\.horaSP/);
  assert.match(REL2, /k\.id === "abertas_agora"[^\n]*\n\s*cel\.append\(h\("a", \{ class: "rel-link relat-kpi-link", href: "#\/conversas\?aba=abertas" \}/);
  assert.match(REL2, /href: "#\/config\/funis" \}, "Criar ou ativar um funil"/);
  assert.doesNotMatch(REL2, /\["per", "Outro"\]/); assert.match(REL2, /\["per", "Personalizado"\]\]/);
});

/* ---------------- painel clássico e folha ---------------- */
test("AD-198/AD-199 · clássico: ritmo com frase neutra e prévia do celular com conversões fracionadas", () => {
  assert.doesNotMatch(PJS2, /O radar já sugeriu segurar \$\{/, "antes: afirmava um aviso que pode não ter saído");
  assert.match(PJS2, /Segurar \$\{brl\(\(m\.proj - orc\) \/ m\.restam\)\} por dia fecha dentro\./);
  assert.match(PJS2, /const convOntem = gOntem \? pluralDec\(ontem\.conversoes/);
});

test("AD-211 · folha A4 com as palavras da vertical", async () => {
  const F = await import("../web/folha.js");
  assert.equal(F.textosFolha("oficina").fecharam, "aprovaram o orçamento");
  assert.equal(F.textosFolha("loja").novo[1], "clientes novos");
  assert.equal(F.textosFolha("odonto").marcada[1], "avaliações marcadas", "odonto continua como sempre");
  assert.equal(F.textosFolha("x"), F.TEXTOS_FOLHA.odonto);
  assert.match(FOLHA_SRC, /T = textosFolha\(M\.vertical\);/);
  assert.doesNotMatch(FOLHA_SRC.replace(/TEXTOS_FOLHA = \{[\s\S]*?\n\};/, ""), /pacientes novos|Nenhum tratamento|vieram à clínica/, "nenhuma palavra odonto fixa fora da tabela");
});

/* ---------------- script do site ---------------- */
test("AD-162 · //wa.me e intent://send…scheme=whatsapp são links de WhatsApp e recebem o código", () => {
  const s = site();
  assert.equal(s.api.ehLinkWhatsapp("//wa.me/5512999990000"), true, "antes: protocol-relative passava sem código");
  const intent = "intent://send/?phone=5512999990000#Intent;scheme=whatsapp;package=com.whatsapp;end";
  assert.equal(s.api.ehLinkWhatsapp(intent), true);
  assert.equal(s.api.ehLinkWhatsapp("intent://scan/#Intent;scheme=zxing;end"), false);
  assert.match(s.api.reescrever(intent, "K7Q2P"), /^intent:\/\/send\/\?phone=5512999990000&text=.*%5Bref%20K7Q2P%5D#Intent;scheme=whatsapp;package=com\.whatsapp;end$/);
  assert.match(s.api.reescrever("//wa.me/5512999990000", "K7Q2P"), /^\/\/wa\.me\/5512999990000\?text=.*%5Bref%20K7Q2P%5D$/);
  assert.equal(s.api.ehEncurtador("//bit.ly/x"), true);
});

test("AD-252 · api.whatsapp.com/message/… recebe o aviso de mensagem curta (e segue intacto)", () => {
  const s = site({ fetch: okCodigo("K7Q2P") });
  assert.equal(s.api.ehMensagemCurta("https://api.whatsapp.com/message/ABCDEF?autoload=1"), true);
  const ev = s.clicar(el("a", { href: "https://api.whatsapp.com/message/ABCDEF" }));
  assert.equal(ev.defaultPrevented, false);
  assert.ok(s.avisos.some(m => /mensagem definida no WhatsApp Business/.test(m)), "antes: ignorado sem aviso");
});

test("AD-164 · site de uma página só: pushState com utm nova recaptura a origem e pede código novo", async () => {
  const ouvJanela = {};
  const s = site({ fetch: okCodigo("K7Q2P"), extra: { history: { pushState() {}, replaceState() {} }, addEventListener: (t, f) => { ouvJanela[t] = f; } } });
  await esperar(10);
  assert.equal(s.chamadas.length, 0, "visita sem origem: nada a pedir");
  s.janela.location.search = "?utm_source=meta&fbclid=F9";
  s.janela.history.pushState({}, "", "/servicos?utm_source=meta&fbclid=F9");
  // plano 1000b: espera até o pedido sair (teto 2 s) — os 20 ms fixos falhavam às vezes com a suíte em paralelo
  for (let t = 0; t < 100 && s.chamadas.length < 1; t++) await esperar(20);
  assert.equal(s.api.dados().fbclid, "F9", "antes: só o carregamento capturava");
  assert.equal(s.chamadas.length, 1);
  assert.equal(typeof ouvJanela.popstate, "function", "popstate também recaptura");
});

test("AD-171 · data-orbita-ignorar deixa o link com o site; botão com código navega depois do ciclo do evento", async () => {
  const s = site({ search: "?gclid=G1", fetch: okCodigo("K7Q2P") });
  await esperar(20);
  const a = el("a", { href: WA, "data-orbita-ignorar": "" });
  const ev = s.clicar(a);
  assert.equal(ev.defaultPrevented, false); assert.equal(a.getAttribute("href"), WA, "nada reescrito");
  s.clicar(el("button", { "data-orbita-wa": WA }));
  assert.equal(s.navegacao.length, 0, "antes: saía da página no meio da captura (gtag/Pixel não rodavam)");
  await esperar(5);
  assert.equal(s.navegacao.length, 1);
});

test("AD-187/AD-188 · registro com keepalive; falha pausa 10 s com recuo (não 1 minuto inteiro)", async () => {
  let agora = 1_000_000, falhar = true;
  const inits = [];
  const s = site({ search: "?gclid=G1", extra: { Date: { now: () => agora }, fetch: (url, init) => { inits.push(init); return falhar ? Promise.reject(new Error("rede")) : Promise.resolve({ ok: true, json: async () => ({ ok: true, codigo: "K7Q2P" }) }); } } });
  await esperar(10);                                    // o pré-aquecimento do carregamento falha (1ª falha)
  assert.equal(inits.length, 1); assert.equal(inits[0].keepalive, true, "AD-187: o pedido sobrevive à navegação");
  agora += 5_000; await s.api.codigo(); assert.equal(inits.length, 1, "dentro da pausa de 10 s");
  agora += 6_000; await s.api.codigo(); assert.equal(inits.length, 2, "antes: só depois de 60 s");
  agora += 15_000; await s.api.codigo(); assert.equal(inits.length, 2, "2ª falha: pausa de 20 s");
  falhar = false; agora += 6_000; assert.equal(await s.api.codigo(), "K7Q2P"); assert.equal(inits.length, 3);
});

test("AD-251 · data-orbita-texto: cada botão manda a sua frase", async () => {
  const s = site({ search: "?gclid=G1", fetch: okCodigo("K7Q2P") });
  await esperar(20);
  const a = el("a", { href: "https://wa.me/5512999990000", "data-orbita-texto": "Quero saber do implante" });
  s.clicar(a);
  assert.match(a.getAttribute("href"), /\?text=Quero%20saber%20do%20implante%20%5Bref%20K7Q2P%5D$/, "antes: «Olá! Vim pelo site.» em todos");
  const b = el("a", { href: "https://wa.me/5512999990000" });
  s.clicar(b);
  assert.match(b.getAttribute("href"), /\?text=Ol%C3%A1!%20Vim%20pelo%20site\.%20%5Bref%20K7Q2P%5D$/);
});

/* ============================================================ lote ads-3 (Anúncios, Relatórios, Rastreio, clássico e núcleo) */
const AC = await import("../web/app/ads-config.js");
const RC = await import("../web/app/rastreio-config.js");
const { createHash } = await import("node:crypto");
const ADSCFG = ler("web/app/ads-config.js"), RCFG = ler("web/app/rastreio-config.js"), ADS3 = ler("web/app/anuncios.js");
const altoCpa = (de, ate, o = {}) => serie(de, ate, { g: 60, conv: 1, ...o });   // R$ 60 por conversa

test("AD-001 · sem metas configuradas: nada de R$ 15 / R$ 1.500 — sem r1, sem ritmo e o diário diz «orçamento não definido»", () => {
  assert.equal(N.CFG_PADRAO.cpaAlvo, null); assert.equal(N.CFG_PADRAO.orcamento, null);       // antes: 15 e 1500
  assert.equal(AC.PADRAO.cpaAlvo, null); assert.equal(AC.PADRAO.orcamento, null);
  const M = montarDe({ metricas: altoCpa(1, 12) });                                             // R$ 720 no mês, CPA R$ 60
  const r1 = M.REGRAS.find(r => r.id === "r1");
  assert.equal(r1.ativa, false); assert.equal(r1.semMeta, true);
  assert.match(r1.descricao, /Sem meta de custo por conversa definida/);
  const al = M.avaliar(M.R, true);
  assert.ok(!al.some(a => a.regra.id === "r1"), "antes: r1 contra o alvo inventado de R$ 15");
  assert.ok(!al.some(a => a.regra.id === "ritmo"), "antes: «acima do orçamento de R$ 1.500»");   // plano 2000d: pela regra (DA-006)
  const t = M.relDiario(M.R);
  assert.doesNotMatch(t, /de R\$\s1\.500/); assert.match(t, /• R\$\s720 investidos · projeção R\$\s1\.860 · orçamento não definido/);
  assert.doesNotMatch(t, /fora da meta/); assert.doesNotMatch(t, /· meta R\$/);
  assert.deepEqual(M.contextoIA(M.R).metas, { custo_conversa: null, orcamento_mes: null });
  // com a meta configurada, tudo volta
  const C = montarDe({ metricas: altoCpa(1, 12), cliente: { cfg: { cpaAlvo: 15, orcamento: 500 } } });
  const ac = C.avaliar(C.R, true);
  // plano 2000d: o «esgotado» tem chave própria (ritmo:esgotado, DA-006) — procura pela regra
  assert.ok(ac.some(a => a.regra.id === "r1")); assert.ok(ac.some(a => a.regra.id === "ritmo"));
  assert.match(C.relDiario(C.R), /• R\$\s720 de R\$\s500 · projeção/);
  // a demo traz as metas dela (fictícia) e o clássico/Anúncios não desenham orçamento sem valor
  assert.match(ler("web/demo.js"), /cpaAlvo: 15, cpaAlvoGoogle: 18, orcamento: 1500/);
  assert.match(PJS, /if \(!\(orc > 0\)\) \{/); assert.match(ADS3, /if \(!\(Number\(M\.CFG\.orcamento\) > 0\)\) \{/);
  assert.match(PJS, /M\.CFG\.cpaAlvo > 0 \? brl\(M\.CFG\.cpaAlvo\) : "não definida"/);
});

test("AD-007 · orçamento 0 é «sem orçamento»: sem alerta de ritmo eterno", () => {
  const M = montarDe({ metricas: serie(1, 12), cliente: { cfg: { orcamento: 0 } } });
  assert.equal(N.temOrcamento({ orcamento: 0 }), false); assert.equal(N.temOrcamento({ orcamento: 300 }), true);
  assert.equal(M.RITMO.ativa, false);
  assert.ok(!M.avaliar(M.R, true).some(a => a.regra.id === "ritmo"), "antes: «acima do orçamento de R$ 0» todo dia");   // plano 2000d: pela regra (DA-006)
  assert.equal(M.situacaoOrc(999), "");
  assert.match(M.relDiario(M.R), /orçamento não definido/);
});

test("AD-008 · o informativo de ritmo se desliga (regrasOff «ritmo») e aparece em Ajustes", () => {
  const cfg = { orcamento: 100 };
  const liga = montarDe({ metricas: serie(1, 12), cliente: { cfg } });
  assert.ok(liga.avaliar(liga.R, true).some(a => a.regra.id === "ritmo"));   // plano 2000d: pela regra (DA-006: «ritmo:esgotado»)
  const desl = montarDe({ metricas: serie(1, 12), cliente: { cfg: { ...cfg, regrasOff: ["ritmo"] } } });
  assert.ok(!desl.avaliar(desl.R, true).some(a => a.regra.id === "ritmo"), "antes: ia ao WhatsApp sem opção de desligar");
  assert.ok(AC.REGRAS.some(([id]) => id === "ritmo"));
});

test("AD-010 · r1 só no Meta enquanto o Google não tem meta própria (cpaAlvoGoogle); a descrição mostra a régua de cada plataforma", () => {
  const metricas = [...altoCpa(1, 14, { p: "google", c: "G1", a: "GA", cn: "Busca" }), ...serie(1, 14, { g: 30, conv: 1 })];   // Google CPA 60; Meta CPA 30
  const so = montarDe({ metricas, cliente: { cfg: { cpaAlvo: 15 } } });
  const r1 = so.avaliar(so.R).filter(a => a.regra.id === "r1").map(a => a.chave);
  assert.deepEqual(r1, ["r1|meta:C1"], "antes: o Google (conversão de pesquisa) também caía contra a meta de conversa");
  assert.match(so.REGRAS.find(r => r.id === "r1").descricao, /Meta: custo por conversa acima de R\$\s20,25 .* Google: fora \(sem meta própria/);
  const comG = montarDe({ metricas, cliente: { cfg: { cpaAlvo: 15, cpaAlvoGoogle: 40 } } });
  const g = comG.avaliar(comG.R).find(a => a.chave === "r1|google:G1");
  assert.ok(g, "com meta própria o Google entra"); assert.match(g.msg, /por conversão/); assert.match(g.acao, /R\$\s40,00/);
  assert.match(ADSCFG, /nome: "cpaAlvoGoogle"/);
});

test("AD-046 · «Silenciar 7 dias»: a chave some do radar (e do WhatsApp do ciclo) até a data; o histórico anterior fica e diz «silenciado»", () => {
  const metricas = [...serie(1, 5, { g: 30, conv: 0 }), ...serie(6, 12, { g: 30, conv: 2 })];   // r2 desde R−2 (3 dias sem conversa)
  const base = montarDe({ metricas });
  assert.ok(base.avaliar(base.R).some(a => a.chave === "r2|meta:C1"));
  const cfg = { silenciados: { "r2|meta:C1": { desde: dia(1), ate: diaDe(HOJE, -6) } } };
  const M = montarDe({ metricas, cliente: { cfg } });
  assert.ok(!M.avaliar(M.R).some(a => a.chave === "r2|meta:C1"), "antes: «Campanha sem conversa» todo dia");
  assert.equal(M.silenciadoAte("r2|meta:C1"), diaDe(HOJE, -6));
  const ep = L.montarRadar(M, {}, Date.parse("2026-10-13T12:00:00Z")).episodios.find(e => e.chave === "r2|meta:C1");
  assert.ok(ep && !ep.ativo && ep.silenciado, "o episódio de antes continua, marcado como silenciado (não «resolvido»)");
  assert.match(ep.desde, /silenciado até 19\/10/);
  assert.equal(N.silenciado(cfg, "r2|meta:C1", diaDe(HOJE, -7)), false, "vencido: volta a avisar");
  // o mapa salvo: vencidos saem, reativar remove
  const m = A.mapaSilenciados({ a: { ate: "2026-10-01" }, b: "2026-10-20", c: { desde: "2026-10-10", ate: "2026-10-30" } }, "d", { desde: "2026-10-12", ate: "2026-10-19" }, "2026-10-12");
  assert.deepEqual(m, { b: { ate: "2026-10-20" }, c: { desde: "2026-10-10", ate: "2026-10-30" }, d: { desde: "2026-10-12", ate: "2026-10-19" } });
  assert.deepEqual(A.mapaSilenciados(m, "c", null, "2026-10-12"), { b: { ate: "2026-10-20" }, d: { desde: "2026-10-12", ate: "2026-10-19" } });
  // plano 1500c: «Silenciar…» virou menu (AC-091) — os 7 dias continuam como opção
  assert.match(ADS3, /\[7, "Por 7 dias"\]/); assert.match(ADS3, /"Reativar avisos"/); assert.match(ADS3, /cfg: \{ silenciados: mapa \}/);
});

test("AD-054 · limites do radar por cliente (cfg.radar): frequência 4 não acusa 3,5; fora da faixa vale o padrão", () => {
  const metricas = serie(1, 7, { freq: 3.5 });
  const padrao = montarDe({ metricas });
  assert.ok(padrao.avaliar(padrao.R).some(a => a.regra.id === "r4"), "padrão 3: dispara");
  const M = montarDe({ metricas, cliente: { cfg: { radar: { freqMax: 4 } } } });
  assert.ok(!M.avaliar(M.R).some(a => a.regra.id === "r4"), "antes: frequência 3 fixa para todas as verticais");
  assert.deepEqual(N.limitesRadar({ radar: { ctrMin: 50, freqMax: "x", r2MinGasto: 40 } }), { ctrMin: 0.9, freqMax: 3, r2MinGasto: 40 });
  assert.match(ADSCFG, /nome: "rd_freqMax"/);
});

test("AD-073 · valor por serviço casa sem acento/caixa («implante» × «Implante») e Ajustes sugere os serviços do CRM", () => {
  const M = montarDe({ leads: [lead({ servico: "Implante", etapa: "fechou", data_conversa: dia(5), data_consulta: dia(3) })], cliente: { cfg: { ticket: { "implánte ": 3000 } } } });
  const c = M.crmTot(M.R - 29, M.R);
  assert.equal(c.fecharam, 1); assert.equal(c.receitaEstimada, 3000, "antes: semValor (a grafia não batia)");
  assert.equal(N.chaveServico("  Implánte "), "implante");
  assert.deepEqual(AC.servicosUsados([{ servico: "Implante" }, { servico: "implante" }, { servico: "Clareamento" }, {}]), ["Clareamento", "Implante"]);
  assert.match(ADSCFG, /list: idSug/);
});

test("AD-133 · salvar metas joga fora o cache do Anúncios daquele cliente", () => {
  A.cacheAds().set("c-1", { em: Date.now() }); A.cacheAds().set("c-2", { em: Date.now() });
  assert.equal(A.invalidarCacheAds("c-1"), true);
  assert.equal(A.cacheAds().has("c-1"), false); assert.equal(A.cacheAds().has("c-2"), true);
  A.cacheAds().clear();
  assert.equal(A.EVENTO_CFG_ADS, "orbita:ads-cfg-salva");
  assert.match(ADSCFG, /dispatchEvent\(new CustomEvent\("orbita:ads-cfg-salva", \{ detail: \{ clienteId: ctx\.cliente\.id \} \}\)\)/);
  assert.match(ADS3, /addEventListener\(EVENTO_CFG_ADS/);
});

/* --- formulário do site: o código gerado roda num DOM falso (AD-228) --- */
function rodarFormulario({ search = "", rastreio = null, campos = {} } = {}) {
  const codigo = AC.codigoExemplo({ url: "https://x.supabase.co/rest/v1/rpc/nx_lead_entrada", apikey: "pub-123", chave: "k".repeat(48) });
  const js = codigo.slice(codigo.indexOf("<script>") + 8, codigo.lastIndexOf("</script>"));
  const pedidos = [], ouv = {};
  const botao = { disabled: false };
  const form = { addEventListener: (t, fn) => { ouv[t] = fn; }, querySelector: () => botao, append() {}, replaceWith(n) { form.trocado = n; }, valores: campos };
  class FormData { constructor(f) { this.f = f; } get(k) { return k in this.f.valores ? this.f.valores[k] : null; } }
  const janela = { OrbitaRastreio: rastreio };
  // plano 1000b: AB-212 pôs um tempo mínimo de 3 s antes do envio (robôs) e AB-114 o role=status no aviso — o relógio falso anda 5 s por leitura
  vm.runInNewContext(js, { Date: { now: (() => { let t = 0; return () => (t += 5000); })() }, document: { getElementById: () => form, createElement: () => ({ textContent: "", setAttribute() {} }) }, FormData, URLSearchParams, location: { search },
    window: janela, fetch: async (url, init) => { pedidos.push({ url, init, corpo: JSON.parse(init.body) }); return { ok: true }; } });
  return { codigo, pedidos, enviar: () => ouv.submit({ preventDefault() {}, target: form }), form };
}
test("AD-173/AD-176/AD-177/AD-228 · formulário do site: origem do rastreio guardada, aceite LGPD e telefone com formato — o JS gerado roda e faz o POST", async () => {
  const comRastreio = rodarFormulario({ search: "", campos: { nome: "Ana", telefone: "12 99999-8888", aceite: "on" },
    rastreio: { dados: () => ({ utm_source: "meta", utm_medium: "paid_social", utm_campaign: "C1", gclid: null, fbclid: "FB1" }) } });
  await comRastreio.enviar();
  assert.equal(comRastreio.pedidos.length, 1);
  const p = comRastreio.pedidos[0];
  assert.equal(p.init.method, "POST"); assert.equal(p.init.headers.apikey, "pub-123");
  assert.equal(p.corpo.p_chave, "k".repeat(48));
  assert.deepEqual([p.corpo.p_dados.utm_source, p.corpo.p_dados.utm_medium, p.corpo.p_dados.utm_campaign, p.corpo.p_dados.fbclid], ["meta", "paid_social", "C1", "FB1"],
    "antes: só utm_source/utm_campaign da URL atual (quem foi para /contato chegava sem origem)");
  assert.equal(p.corpo.p_dados.aceite_privacidade, true);
  assert.ok(comRastreio.form.trocado, "sucesso troca o formulário pela confirmação");
  const semRastreio = rodarFormulario({ search: "?utm_source=google&gclid=G7", campos: { nome: "Bia", telefone: "1299999" } });
  await semRastreio.enviar();
  assert.equal(semRastreio.pedidos[0].corpo.p_dados.utm_source, "google"); assert.equal(semRastreio.pedidos[0].corpo.p_dados.gclid, "G7");
  const html = comRastreio.codigo;
  assert.match(html, /<input name="aceite" type="checkbox" required> Li e aceito a <a href="\/politica-de-privacidade"/, "AD-176");
  assert.match(html, /name="telefone" type="tel" inputmode="tel" autocomplete="tel" placeholder="WhatsApp com DDD" pattern="\[0-9\(\)\+ \.-\]\{10,20\}"/, "AD-177");
  assert.ok(new RegExp("^[0-9()+ .-]{10,20}$").test("(12) 99999-8888") && !new RegExp("^[0-9()+ .-]{10,20}$").test("liga pra mim"));
});

test("AD-068/AD-085 · credenciais conferidas no campo; desligar a integração pergunta antes", () => {
  assert.equal(AC.erroCredencial("meta_ad_account_id", "abc"), "Use o ID da conta de anúncios: act_ seguido só de números (ex.: act_1234567890).");
  assert.equal(AC.erroCredencial("meta_ad_account_id", "act_1234567890"), ""); assert.equal(AC.erroCredencial("meta_ad_account_id", "1234567890"), "");
  assert.match(AC.erroCredencial("google_customer_id", "123456789"), /10 números/); assert.equal(AC.erroCredencial("google_customer_id", "123-456-7890"), "");
  assert.match(AC.erroCredencial("meta_access_token", "EAAcurto"), /curto/); assert.match(AC.erroCredencial("meta_access_token", `EAA${"x".repeat(50)} y`), /espaços/);
  assert.equal(AC.erroCredencial("meta_access_token", ""), "", "em branco = mantém o salvo");
  assert.match(AC.erroCredencial("google_client_id", "123"), /apps\.googleusercontent\.com/);
  assert.match(ADSCFG, /validar: v => erroCredencial\(k, v\)/);
  assert.match(ADSCFG, /if \(st\.ativo && !v\._ativo\) \{\n\s+const ok = await ui\.confirmar\(\{ titulo: `Desligar a integração do \$\{d\.curto\}\?`/);
});

test("AD-070 · admin em #/config/anuncios recebe o texto da seção (gestão cuida das metas), não o genérico", () => {
  const s = AC.secoesConfig.find(x => x.id === "anuncios");
  assert.equal(s.papelMin, "gestor");
  assert.match(s.semAcesso, /cuidadas pela equipe de gestão/);
});

test("AD-072/AD-074/AD-248 · metas vazias com placeholder, WhatsApp 10–13 dígitos formatado, nome curto com 22", () => {
  assert.match(ADSCFG, /valor: reaisOuVazio\(cfg\.cpaAlvo\), placeholder: "sem meta"/);
  assert.match(ADSCFG, /if \(cpa != null && !\(cpa > 0\)\)/, "valida só o preenchido (antes exigia meta > 0 sempre)");
  assert.doesNotMatch(ADSCFG, /cfg\.cpaAlvo \?\? PADRAO\.cpaAlvo/);
  assert.equal(AC.numeroWaValido("+55 (12) 99999-8888"), true); assert.equal(AC.numeroWaValido("12345678901234567890"), false, "antes: 20 dígitos passavam");
  assert.equal(AC.numeroWaValido("99999-8888"), false);
  assert.equal(AC.formatarWa("5512999998888"), "+55 (12) 99999-8888"); assert.equal(AC.formatarWa("1233334444"), "(12) 3333-4444");
  assert.match(ADSCFG, /nome: "nomeCurto", rotulo: "Nome curto \(relatórios\)", valor: cfg\.nomeCurto \|\| "", placeholder: [^\n]*max: 22,/);
  assert.equal(montarDe({ cliente: { cfg: { nomeCurto: "Sorriso Feliz Taubaté!!" } } }).NOME, "Sorriso Feliz Taubaté!!", "o núcleo usa o nome curto inteiro");
});

test("AD-246/AD-245/AD-247 · envio manual: bloqueia com metas não salvas, mensal fala do mês, diário zerado avisa", () => {
  const cfg = { waGestor: ["5512999998888"], waCliente: ["5512988887777"] };
  assert.match(AC.confirmacaoEnvio({ tipo: "diario", cfg, sujo: true }).bloqueio, /ainda não salvou/);
  assert.match(AC.confirmacaoEnvio({ tipo: "diario", cfg: {} }).bloqueio, /Cadastre um WhatsApp/);
  const mes = AC.confirmacaoEnvio({ tipo: "mensal", cfg });
  // plano 1000b: AB-191 — a confirmação também diz QUAIS números
  assert.equal(mes.texto, "Ele sai agora no WhatsApp de 2 destinos (+55 (12) 98888-7777 e +55 (12) 99999-8888), mesmo que o resumo deste mês já tenha sido enviado.", "antes: «…enviado hoje»");
  assert.match(AC.confirmacaoEnvio({ tipo: "diario", cfg, gastoDia: 0, dataDia: "12/10/2026" }).texto, /em 12\/10\/2026 não houve investimento .* zerado \(R\$ 0\)/);
  assert.doesNotMatch(AC.confirmacaoEnvio({ tipo: "diario", cfg, gastoDia: 80 }).texto, /zerado/);
  assert.match(ADSCFG, /confirmacaoEnvio\(\{ tipo, cfg, sujo, gastoDia: tipo === "diario" \? gastoOntem : null, dataDia: dataOntem \}\)/);
});

test("AD-137 · «Painel de apresentação» usa o endereço do cliente; o rastreio não cita o domínio pessoal", () => {
  assert.equal(A.enderecoPainel({ painelUrl: "https://painel.nexus.com.br/kamiguchi" }, N.urlPainel), "https://painel.nexus.com.br/kamiguchi");
  assert.equal(A.enderecoPainel({}, N.urlPainel), "https://jpfamelli.github.io/nexus-ads/");
  assert.doesNotMatch(RCFG, /servido por jpfamelli\.github\.io/);
  assert.match(ADS3, /linkPainel\.href = enderecoPainel\(M\.CFG, N\.urlPainel\)/);
});

test("AD-138 · leitura parcial (ultimo_sync_parcial do servidor novo) não vira «atrasado»; Órbita e clássico iguais", () => {
  const agora = Date.parse("2026-10-13T15:00:00Z");
  const integ = [{ canal: "meta", ativo: true, ultimo_sync: "2026-10-13T10:00:00Z", ultimo_sync_parcial: "2026-10-13T14:30:00Z", status: "parcial — teto de páginas" }];
  for (const f of [L.estadoIntegracao, P.estadoIntegracao]) {
    const e = f(integ, [], agora);
    assert.equal(e.nivel, "parcial", "antes: «Leitura atrasada» (a parcial não avança ultimo_sync)");
    assert.equal(f([{ ...integ[0], ultimo_sync_parcial: null }], [], agora).nivel, "atrasado");
    assert.equal(f([{ ...integ[0], ultimo_sync_parcial: "2026-10-13T09:00:00Z", ultimo_sync: "2026-10-13T14:00:00Z", status: "ok — 3 linhas" }], [], agora).nivel, "ok", "parcial velha não manda");
  }
  assert.match(L.detalhePilula(L.estadoIntegracao(integ, [], agora), agora)[0].texto, /^leitura parcial hoje às 11:30 · última completa hoje às 07:00/);
});

test("AD-168 · snippet com a versão fixa e integrity — o hash confere com web/rastreio.v1.js", () => {
  const v1 = readFileSync(join(RAIZ, "web/rastreio.v1.js"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(RC.SRI_V1, `sha384-${createHash("sha384").update(Buffer.from(v1, "utf8")).digest("base64")}`, "rastreio.v1.js mudou: depois de publicado, crie rastreio.v2.js");
  const s = RC.snippetRastreio("a".repeat(48));
  // plano 1000b: o snippet novo usa a rastreio.v2.js (o hash da v2 é conferido em plano1000b-ads); o SRI da v1 acima continua valendo
  assert.match(s, /src="https:\/\/jpfamelli\.github\.io\/nexus-ads\/rastreio\.v2\.js" integrity="sha384-[^"]+" crossorigin="anonymous"/);
  assert.match(RC.snippetGerenciador("a".repeat(48)), /integrity="sha384-/);
  assert.doesNotMatch(RC.snippetRastreio("a".repeat(48), { script: "http://127.0.0.1:1/rastreio.js", url: "http://127.0.0.1:1/x", apikey: "d" }), /integrity/, "o servidor falso serve o arquivo vivo");
});

test("AD-167/AD-172 · privacidade com as opções do script; www × sem www explicado no painel e no script", () => {
  assert.equal(RC.TEXTO_PRIVACIDADE, RC.textoPrivacidade());
  const t = RC.textoPrivacidade({ dias: 0, gpc: false });
  assert.match(t, /só durante a visita/); assert.doesNotMatch(t, /30 dias|Global Privacy Control/);
  assert.match(RC.textoPolitica("X", { dias: 7 }), /por até 7 dias e sem cookies/);
  assert.doesNotMatch(RC.textoPolitica("X", { gpc: false }), /Global Privacy Control/);
  assert.match(RC.textoPolitica("X"), /por até 30 dias e sem cookies/);
  assert.match(RCFG, /«www\.seusite\.com\.br» e «seusite\.com\.br»/); assert.match(RAST, /www × sem www \(plano 1000, AD-172\)/);
});

test("AD-179/AD-184/AD-185 · onde colar por plataforma; Meta com utm_source=meta e posição; Google com lembrete da marcação automática", () => {
  assert.match(RCFG, /"Onde colar em cada plataforma"/);
  for (const p of ["WordPress", "Wix", "Webflow", "Shopify", "Google Tag Manager"]) assert.ok(RCFG.includes(`"${p}: "`), p);
  assert.match(RC.UTM.meta, /^utm_source=meta&/, "antes: utm_source=instagram também para o Facebook");
  assert.match(RC.UTM.meta, /utm_term=\{\{site_source_name\}\}-\{\{placement\}\}/);
  assert.doesNotMatch(RC.UTM.reserva, /instagram/);
  assert.match(RCFG, /deixe ligada a «Marcação automática»/);
});

test("AD-180/AD-181/AD-183/AD-189 · último clique real, sites que mandam cliques (novo em destaque), «aguardando a mensagem» e N (X%)", () => {
  const agora = Date.parse("2026-10-13T12:00:00Z");
  const itens = [
    { em: "2026-10-13T11:40:00Z", pagina: "https://www.clinica.com.br/implante", casou: false, motivo: null },
    { em: "2026-10-13T11:50:00Z", pagina: "teste-do-painel", casou: false, motivo: null },
    { em: "2026-10-01T10:00:00Z", pagina: "https://clinica.com.br/", casou: true, motivo: "aplicado" },
    { em: "2026-10-12T09:00:00Z", pagina: "https://outro-site.net/x", casou: false, motivo: null },
  ];
  const R = RC.resumoRastreio({ itens }, { agora });
  assert.deepEqual(R.ultimoReal, { em: "2026-10-13T11:40:00Z", host: "clinica.com.br" }, "AD-180: o «Testar» não conta");
  assert.deepEqual(R.hosts.map(x => [x.host, x.cliques, x.novo]), [["clinica.com.br", 2, false], ["outro-site.net", 1, true]], "AD-181");
  assert.equal(RC.rotuloMotivo(null, false, { em: "2026-10-13T11:40:00Z", agora }), "aguardando a mensagem", "AD-183: antes já «não chegou» com 20 min");
  assert.equal(RC.rotuloMotivo(null, false, { em: "2026-10-12T09:00:00Z", agora }), "a mensagem não chegou com o código");
  const m = Object.fromEntries(R.motivos.map(x => [x.rotulo, [x.n, x.pct]]));
  assert.deepEqual(m["aguardando a mensagem"], [2, 50]); assert.deepEqual(m["casou com o negócio"], [1, 25]);
  assert.match(RCFG, /m\.pct == null \? String\(m\.n\) : `\$\{m\.n\} \(\$\{m\.pct\}%\)`/, "AD-189: «N (X%)»");
});

test("AD-182/AD-249/AD-250 · filtro por motivo + «Mostrar mais», atualização a cada 30 s com a seção visível e a % no cartão", () => {
  const agora = Date.parse("2026-10-13T12:00:00Z");
  const itens = Array.from({ length: 25 }, (_, n) => ({ em: `2026-10-0${1 + (n % 9)}T10:00:00Z`, pagina: "https://a.com/", casou: n % 5 === 0, motivo: n % 5 === 0 ? "aplicado" : "codigo_ja_usado" }));
  const R = RC.resumoRastreio({ itens }, { agora });
  assert.equal(R.ultimos.length, 10); assert.equal(R.todos.length, 25, "antes: só os 10 últimos existiam");
  assert.equal(RC.filtrarCliques(R.todos, "casou com o negócio", agora).length, 5);
  assert.equal(RC.filtrarCliques(R.todos, "", agora).length, 25);
  assert.match(RCFG, /Mostrar mais \(\$\{base\.length - Math\.min\(n, base\.length\)\}\)/);
  // plano 1000b: AB-120/AB-133 — as condições (aba visível, seção visível, sem pedido, sem foco dentro) moram em podeAtualizarSozinho
  assert.match(RCFG, /tCliques = setInterval\(\(\) => \{\n\s+if \(!sec\.isConnected\) \{ clearInterval\(tCliques\); if \(io\) io\.disconnect\(\); return; \}\n\s+if \(!podeAtualizarSozinho\(\{ visivel, oculto: typeof document !== "undefined" && document\.hidden,/);
  assert.match(RCFG, /\}, 30000\);/);
  assert.match(RCFG, /kCasou\.append\(h\("small", \{ class: "kpi-sub ads-rastreio-pct" \}, `\$\{T\.pct\}% dos cliques`\)\)/);
});

/* ======================================================================================================================
   REVISÃO ADVERSARIAL (13/10/2026) — achados confirmados; cada teste falharia no código anterior
   ====================================================================================================================== */
test("revisão · <button data-orbita-wa> segue sem código com GPC, sem consentimento, com chave inválida e com link encurtado; <a> intacto", async () => {
  const casos = [
    ["GPC", { extra: { navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0)", maxTouchPoints: 0, globalPrivacyControl: true } } }],
    ["aguardando consentimento", { config: { consentimento: "aguardar" } }],
    ["chave inválida", { config: { chave: "abc" } }],
  ];
  for (const [nome, o] of casos) {
    const s = site({ search: "?gclid=G1", fetch: okCodigo("K7Q2P"), ...o });
    const ev = s.clicar(el("span", {}, el("button", { "data-orbita-wa": WA })));
    assert.equal(ev.defaultPrevented, true, `${nome}: antes o clique não tinha ouvinte (ou saía cedo) e o botão ficava morto`);
    await esperar(5);
    assert.deepEqual(s.navegacao, [WA], `${nome}: destino original, sem código`);
    assert.equal(s.chamadas.length, 0, `${nome}: nada enviado ao Órbita`);
    assert.equal(s.clicar(el("a", { href: WA })).defaultPrevented, false, `${nome}: <a> navega sozinho`);
  }
  // nova aba sem rastreio: abre uma janela só, sem opener
  const g = site({ config: { chave: "abc" } });
  g.clicar(el("button", { "data-orbita-wa": WA, "data-orbita-aba": "nova" }));
  await esperar(5);
  assert.equal(g.abertas.length, 1); assert.equal(g.abertas[0].destino, WA); assert.equal(g.abertas[0].opener, null); assert.equal(g.navegacao.length, 0);
  // link encurtado num botão (rastreio ligado): avisa e segue para ele
  const e = site({ fetch: okCodigo("K7Q2P") });
  e.clicar(el("button", { "data-orbita-wa": "https://wa.link/abc" }));
  await esperar(5);
  assert.deepEqual(e.navegacao, ["https://wa.link/abc"]);
});

test("revisão · data-orbita-aba=nova com código pronto abre UMA vez (window.open com noopener devolve null por especificação)", async () => {
  const pedidas = [];
  const openSpec = (u, alvo, feat) => {                              // como o navegador: com "noopener" o retorno é null
    const w = { closed: false, opener: {}, location: { replace: v => { w.destino = v; } }, url: u, alvo, feat };
    pedidas.push(w); return /noopener/i.test(String(feat || "")) ? null : w;
  };
  const s = site({ search: "?gclid=G1", fetch: okCodigo("K7Q2P"), extra: { open: openSpec } });
  await esperar(20);                                                 // código em cache
  s.clicar(el("button", { "data-orbita-wa": WA, "data-orbita-aba": "nova" }));
  await esperar(5);
  assert.equal(pedidas.length, 1, "uma janela só");
  assert.equal(s.navegacao.length, 0, "antes: o null do noopener caía no location.assign e a aba atual também ia ao WhatsApp");
  assert.match(pedidas[0].destino, /%5Bref%20K7Q2P%5D$/);
  assert.equal(pedidas[0].opener, null, "sem opener");
});

test("revisão · rastreio.v1.js (ainda não publicado) é cópia do rastreio.js corrigido", () => {
  assert.equal(ler("web/rastreio.v1.js"), RAST);
});

test("revisão · clássico: sem meta o interruptor da r1 fica travado («defina a meta») e não chama alternarRegra", () => {
  const M = montarDe({ metricas: serie(1, 10) });
  const r1 = M.REGRAS.find(r => r.id === "r1");
  assert.equal(r1.semMeta, true); assert.equal(r1.ativa, false);
  // plano 1000b: AB-163 — o interruptor travado ganha aria-describedby com o motivo em texto
  assert.match(PJS, /\$\{!r\.semMeta \? \(pode \? "" : [^\n]*\n\s+: ` aria-disabled="true" aria-describedby="rl-trava-meta" data-sem-meta="1" title="\$\{esc\(SEM_META_REGRA\)\}"`/, "antes: aparecia desligado e clicável");
  assert.match(PJS, /if \(b\.dataset\.semMeta\) return toast\(SEM_META_REGRA\);\n\s+if \(b\.getAttribute\("aria-disabled"\) === "true"\)[^\n]*\n\s+alternarRegra\(b\.dataset\.regra\);/,
    "antes: o clique punha a r1 em regrasOff (o contrário do que «ligar» promete)");
  assert.match(PJS, /const SEM_META_REGRA = "[^"]*defina a meta[^"]*";/);
});

test("revisão · clássico: episódio silenciado aparece «silenciado» (M.silenciadoAte), não «resolvido»", () => {
  const i = PJS.indexOf("const htmlHist = hist.slice(0, 8)"), f = PJS.indexOf("const htmlGoogle", i);
  const bloco = PJS.slice(i, f);
  assert.match(bloco, /const silenciado = !ativo && typeof M\.silenciadoAte === "function" \? M\.silenciadoAte\(a\.chave\) : null;/, "antes: só ativo/resolvido");
  assert.match(bloco, /\$\{ativo \? "ativo" : !silenciado \? "resolvido" : "silenciado"\}/);
  assert.match(bloco, /esc\(` · silenciado até \$\{silenciado\.slice\(8, 10\)\}\/\$\{silenciado\.slice\(5, 7\)\}/);
});

test("revisão · github.io: clique/tecla renovam a ociosidade (1×/min) e o conferidor nasce também depois do login", async () => {
  api.usarFetch(async () => ({ ok: true, status: 200, text: async () => "null" }));
  const nav = navegador("jpfamelli.github.io");
  try {
    const t0 = Date.now() + 10 * 3600e3;                            // longe de qualquer toque de outro teste
    api.guardarToken("vivo", t0);
    const t1 = t0 + 90 * 60e3;
    assert.equal(api.renovarUso(t1), true, "antes: não existia — só RPC renovava");
    assert.equal(api.renovarUso(t1 + 10e3), false, "no máximo 1×/min");
    assert.equal(api.lerToken(t1 + api.TOKEN_OCIOSO_MS - 1000, { renovar: false }), "vivo", "a interação sem RPC manteve a sessão viva");
    api.apagarToken();
    assert.equal(api.renovarUso(t1 + 3 * 60e3), false, "sem sessão: nada a renovar");
  } finally { nav.restaurar(); api.usarFetch(null); }
  const nav2 = navegador("orbita-nexus-ads.netlify.app");
  try { api.guardarToken("o"); assert.equal(api.renovarUso(), false, "origem própria: nada muda"); } finally { nav2.restaurar(); }
  assert.match(PJS, /function vigiarSessao\(\) \{\n\s+if \(vigiaSessao \|\| !api\.origemCompartilhada\(location\.hostname\)\) return;/);
  assert.match(PJS, /document\.addEventListener\("pointerdown", tocar, \{ capture: true, passive: true \}\);\n\s+document\.addEventListener\("keydown", tocar, true\);/);
  assert.match(PJS, /api\.guardarToken\(r\.token\);\n\s+S\.token = r\.token;\n\s+vigiarSessao\(\);/, "antes: login novo ficava sem o conferidor de 60 s");
  assert.match(PJS, /api\.guardarToken\(s\.token\);\n\s+S\.token = s\.token;\n\s+vigiarSessao\(\);/);
});

test("revisão · mapa de calor: o comentário AD-150 não engole mais sub/largo; nenhum comentário de linha engole código nos arquivos de ads", () => {
  const linha = REL.split("\n").find(l => l.includes("const bc = cartao(tituloQuandoChamam(V)"));
  assert.ok(linha && !linha.includes("//"), "antes: «{   // AD-150: … sub: …, largo: true,» — sub e largo viravam comentário");
  assert.match(linha, /\{ sub: pico \? `Mensagens recebidas[^\n]*largo: true,$/);
  for (const f of ["web/rastreio.js", "web/app/rastreio-config.js", "web/painel.js", "web/dados.js", "web/nucleo.js", "web/app/relatorios.js", "web/app/rel-logica.js"]) {
    for (const [n, l] of ler(f).split("\n").entries()) {
      const k = l.search(/(^|[\s;,{(])\/\/ /);
      if (k < 0) continue;
      const resto = l.slice(k).replace(/^\s*\/\/ /, "");
      assert.ok(!/(^|\s)[a-z]\w*: [^\n]*, [a-z]\w*: (true|false|\d|`|"|\{)/.test(resto) && !/\b(largo|sub|csv|class|on): (true|`|\{)/.test(resto), `${f}:${n + 1} — código dentro de comentário`);
    }
  }
});

test("revisão · «Mês passado» cobra o fee cheio (mês de 31 ou 28 dias); «Este mês» a fração do mês; N dias segue N/30", () => {
  const cfg = { fee: 1000 };
  const out = montarDe({ hoje: "2026-11-05", metricas: Array.from({ length: 70 }, (_, k) => met(diaDe("2026-11-05", k + 1))), cliente: { cfg } });
  const Pout = L.numerosPeriodo(out, { dias: "mes_ant" });
  assert.equal(Pout.ate - Pout.de + 1, 31);
  assert.equal(Pout.fee, 1000, "antes: 1000 × 31/30 = R$ 1.033");
  const fev = montarDe({ hoje: "2026-03-05", metricas: Array.from({ length: 70 }, (_, k) => met(diaDe("2026-03-05", k + 1))), cliente: { cfg } });
  const Pfev = L.numerosPeriodo(fev, { dias: "mes_ant" });
  assert.equal(Pfev.ate - Pfev.de + 1, 28);
  assert.equal(Pfev.fee, 1000, "antes: 1000 × 28/30 = R$ 933");
  const fim = montarDe({ hoje: "2026-11-01", metricas: Array.from({ length: 40 }, (_, k) => met(diaDe("2026-11-01", k + 1))), cliente: { cfg } });
  assert.equal(L.numerosPeriodo(fim, { dias: "mes" }).fee, 1000, "este mês completo (ontem = 31/10): fee cheio");
  assert.equal(L.numerosPeriodo(out, { dias: "mes" }).fee, 1000 * 4 / 30, "1º a 4/11: 4 dias de 30");
  assert.equal(L.numerosPeriodo(out, { dias: 30 }).fee, 1000);
  assert.equal(L.numerosPeriodo(out, { dias: 7 }).fee, 1000 * 7 / 30);
  assert.equal(L.numerosPeriodo(out, { dias: "mes_ant", plat: "meta" }).fee, 0);
});
