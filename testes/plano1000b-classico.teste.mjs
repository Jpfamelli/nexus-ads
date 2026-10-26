/* ============================================================
   ÓRBITA — plano «1000+ melhorias, rodada B» (14/10/2026), frente classico · lote classico-1
   + pendências de paridade com o Órbita deixadas pela frente ads (AB-053/076/080/081/155/199/225)
   node --test testes/plano1000b-classico.teste.mjs      (Node puro, sem rede e sem navegador)
   (a) painel.js, bloco PURO (o mesmo trecho que roda no navegador, num contexto vm)
   (b) painel.js, peças de tela conferidas pela fonte (a tela inteira precisa do DOM real)
   (c) dados.js (fetch falso, relógio de timers falso, armazenamento falso)
   (d) nucleo.js (textos do WhatsApp e contexto da IA) — também roda nas Edge Functions
   Datas das fixtures relativas ao relógio (hojeSP); cada teste falharia no código anterior ao lote.
   ============================================================ */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ler = f => readFileSync(join(RAIZ, f), "utf8").replace(/\r\n/g, "\n");
const PJS = ler("web/painel.js"), CSS = ler("web/painel.css"), HTML = ler("web/index.html"), DJS = ler("web/dados.js");

const N = await import("../web/nucleo.js");
const api = await import("../web/dados.js");
const esperar = ms => new Promise(r => setTimeout(r, ms));

/* ---------- (a) bloco PURO do painel clássico ---------- */
const trechoPuro = (() => { const i = PJS.indexOf("/* ==== PURO: início"), f = PJS.indexOf("/* ==== PURO: fim ==== */"); assert.ok(i > 0 && f > i); return PJS.slice(i, f); })();
const horaUTC = iso => new Date(iso).toISOString().slice(11, 16);
const P = vm.runInNewContext(`${trechoPuro};({ statusEnvio, erroEnvioPt, canalDe, ultimaLeitura, equipeAvisada, proximaLeitura, diarioSugerido, notaCorte,
  execucaoDoPedido, mascararSegredos, fmtConv, setaVar, convDiaTxt, subMes, colunasCamp, rotuloCelula, colunasKanban, regrasOffDoForm, numerosWa,
  erroCredencial, valorMeta, ultimoGastoCamp, DIAS_PAUSADA, mesclarMarcos, chaveFiltros, lerFiltros })`,
  { horaSP: horaUTC, quandoSP: iso => `em ${new Date(iso).toISOString().slice(8, 10)}/${new Date(iso).toISOString().slice(5, 7)} às ${horaUTC(iso)}`,
    int: N.int, dec: N.dec, brl: N.brl, brl0: N.brl0, plural: N.plural, pluralDec: N.pluralDec, Date, Math, JSON, String, Number, URL });
const VOC = N.VOCABULARIO;
const pl = x => JSON.parse(JSON.stringify(x));   // objetos do contexto vm têm outro protótipo: compara pelo valor

test("AB-080 · statusEnvio do clássico traduz o erro da Meta (como o Órbita) e guarda o original", () => {
  const s = P.statusEnvio({ erro: "(#131047) Re-engagement message" });
  assert.equal(s.k, "erro");
  assert.match(s.erro, /fora da janela de 24 h/, "antes: o inglês da Meta ia cru para a clínica");
  assert.equal(s.erroOriginal, "(#131047) Re-engagement message");
  const p = P.statusEnvio({ enviado_em: "2026-09-27T11:03:00Z", destinos: ["a", "b"], erro: "5512999: Message undeliverable" });
  assert.equal(p.k, "parcial"); assert.match(p.erro, /não recebeu a mensagem/);
  assert.equal(P.erroEnvioPt("sem destino"), "sem destino", "erro sem padrão conhecido passa como veio");
  assert.match(PJS, /<p class="env-motivo" title="\$\{esc\(s\.erroOriginal \|\| ""\)\}">/, "o texto original fica no title");
});

test("AB-199 · «enviado» sem confirmação há mais de 24 h (com `agora`) para de dizer «ainda não confirmada»", () => {
  const x = { enviado_em: "2026-09-27T11:03:00Z" }, depois = Date.parse("2026-09-29T12:00:00Z");
  assert.equal(P.statusEnvio(x, depois).rotulo, "enviado · sem confirmação de entrega");
  assert.match(P.statusEnvio(x, Date.parse("2026-09-27T12:00:00Z")).rotulo, /entrega ainda não confirmada/, "dentro de 24 h: o de sempre");
  assert.match(P.statusEnvio(x).rotulo, /entrega ainda não confirmada/, "sem `agora`: o de sempre (paridade)");
  assert.match(PJS, /statusEnvio\(rel, Date\.now\(\)\)/); assert.match(PJS, /s = statusEnvio\(x, Date\.now\(\)\)/);
});

test("AB-081 · canalDe: a chave decide; na mensagem «Google» vence «meta» (palavra comum)", () => {
  assert.equal(P.canalDe({ chave: "integracao|google", mensagem: "a meta de custo" }), "google");
  assert.equal(P.canalDe({ chave: "x", mensagem: "Google Ads: a conversa passou da meta" }), "google", "antes: meta");
  assert.equal(P.canalDe({ chave: "integracao|meta", mensagem: "Google" }), "meta");
  assert.equal(P.canalDe({ mensagem: "Conexão com o Meta caiu" }), "meta");
  assert.equal(P.canalDe({ chave: "r1|x" }), null);
});

test("AB-076 · a última leitura é o MAIOR instante (não a ordem do texto)", () => {
  const integ = [{ ultimo_sync: "2026-10-14T13:00:00Z" }, { ultimo_sync: "2026-10-14T12:30:00-03:00" }, { ultimo_sync: null }];
  assert.equal(P.ultimaLeitura(integ), "2026-10-14T12:30:00-03:00", "15:30Z vence 13:00Z (antes .sort() no texto escolhia o «…Z»)");
  assert.equal(P.ultimaLeitura([]), null);
  assert.match(PJS, /const ultimoSync = \(\) => ultimaLeitura\(/);
});

test("AB-155 · próxima leitura: passou de 2 h, diz desde quando está atrasada", () => {
  const agora = Date.parse("2026-10-14T15:00:00Z");
  assert.equal(P.proximaLeitura(agora - 30 * 6e4, agora), "em ~30 min");
  const t = P.proximaLeitura(agora - 3 * 36e5, agora);
  assert.equal(t, "leitura atrasada desde 12:00 — tenta de novo a cada hora", "antes: «em instantes» para sempre");
  assert.match(P.proximaLeitura(agora - 30 * 36e5, agora), /^leitura atrasada desde 13\/10 às 09:00 — /, "mais de um dia: com a data");
  assert.match(PJS, /\/\^leitura atrasada\/\.test\(proximaLeitura\(e\.ultimo\)\)/, "a linha do popover usa o texto inteiro");
});

test("AB-225 · orçamento diário sugerido = (orçamento − gasto) ÷ dias restantes", () => {
  assert.equal(P.diarioSugerido(1500, 900, 10), 60);
  assert.equal(P.diarioSugerido(1500, 1600, 10), 0, "orçamento já usado");
  assert.equal(P.diarioSugerido(1500, 900, 0), null); assert.equal(P.diarioSugerido(null, 900, 5), null);
  assert.match(PJS, /Orçamento diário sugerido: \$\{brl\(sug\)\} \(somando as plataformas\)\./);
});

test("AB-053 · lista de relatórios: «mostrando os 12 mais recentes de N»", () => {
  assert.equal(P.notaCorte(12, 20), "Mostrando os 12 relatórios mais recentes de 20.");
  assert.equal(P.notaCorte(12, 12), "");
  assert.match(PJS, /const corteRel = notaCorte\(lista\.length, todosRel\.length\);/);
  assert.match(PJS, /<li class="rel-corte nota-sm">\$\{esc\(corteRel\)\}<\/li>/);
});

test("AB-142 · «A Nexus já foi avisada» só com aviso de conexão ENVIADO nas últimas 24 h", () => {
  const agora = Date.parse("2026-10-14T15:00:00Z"), erros = [{ canal: "meta" }];
  const al = o => ({ regra: "integracao", chave: "integracao|meta", criado_em: "2026-10-14T10:00:00Z", ...o });
  assert.equal(P.equipeAvisada([al({})], erros, agora), false, "registrado mas não enviado");
  assert.equal(P.equipeAvisada([al({ enviado_em: "2026-10-14T10:01:00Z" })], erros, agora), true);
  assert.equal(P.equipeAvisada([al({ enviado_em: "x", criado_em: "2026-10-12T10:00:00Z" })], erros, agora), false, "velho");
  assert.equal(P.equipeAvisada([al({ enviado_em: "x", chave: "integracao|google" })], erros, agora), false, "outra plataforma");
  // plano 2000d: o texto vem de avisoEquipe(agência) — revenda lê o nome DELA (KX-041/KX-056)
  assert.match(PJS, /`Avise a \$\{ag\} para refazer a conexão\.`/);
});

test("AB-138/AB-139/AB-148 · conversões fracionadas do Google não arredondam; sem conversão não vira «— cada»", () => {
  assert.equal(P.fmtConv(1.5), "1,5"); assert.equal(P.fmtConv(2), "2"); assert.equal(P.fmtConv(null), "—");
  assert.match(PJS, /\$\{td\("conv", esc\(fmtConv\(r\.t\.conversoes\)\)\)\}/, "linha da campanha");
  assert.match(PJS, /\$\{td\("conv", esc\(fmtConv\(T\.conversoes\)\)\)\}/, "total");
  assert.match(PJS, /<td>\$\{esc\(fmtConv\(t\.conversoes\)\)\}<\/td>/, "criativos");
  assert.equal(P.convDiaTxt({ conv: 1.5, google: 20, meta: 0 }), "1,5 conversões");
  assert.equal(P.convDiaTxt({ conv: 2, google: 0, meta: 30 }), "2 conversas");
  assert.match(PJS, /por \$\{p\.google > 0 \? "conversão" : "conversa"\}/);
  assert.equal(P.subMes({ conversoes: 0, cpa: null }), "0 conversas", "antes: «0 conversas · — cada»");
  assert.match(P.subMes({ conversoes: 3.5, cpa: 12 }), /^3,5 conversas · R\$\s12,00 cada$/);
});

test("AB-150 · chip de variação: «→» abaixo de 1%", () => {
  assert.equal(P.setaVar(0.4), "→"); assert.equal(P.setaVar(-0.9), "→"); assert.equal(P.setaVar(5), "▲"); assert.equal(P.setaVar(-5), "▼");
  assert.doesNotMatch(PJS, /\$\{v >= 0 \? "▲" : "▼"\} \$\{pc\(Math\.abs\(v\), 0\)\}/);
});

test("AB-140/AB-213/AB-164 · tabelas e quadro com o vocabulário da vertical e cores por token", () => {
  const cc = P.colunasCamp(VOC.oficina), rot = Object.fromEntries(cc.map(([k, l]) => [k, l]));
  assert.equal(rot.fe, "Clientes novos"); assert.equal(rot.rec, "Serviços aprovados");
  assert.match(cc.find(c => c[0] === "roas")[2], /^Serviços aprovados ÷ investimento/);
  assert.equal(P.colunasCamp(VOC.odonto).find(c => c[0] === "fe")[1], "Pacientes novos");
  assert.equal(P.rotuloCelula(VOC.loja).fe, "Clientes novos");
  const k = P.colunasKanban(VOC.oficina, "oficina");
  assert.equal(k[1][1], "Visita agendada"); assert.equal(k[2][1], "Veio · orçamento");
  assert.deepEqual(pl(P.colunasKanban(VOC.odonto).map(c => c[1]).slice(1, 3)), ["Avaliação agendada", "Avaliou · orçamento"]);
  for (const c of k) assert.match(c[2], /^var\(--etapa-[a-z]+\)$/, "cor por token");
  for (const t of ["nova", "agendada", "orcamento", "fechou", "parou"]) assert.match(CSS, new RegExp(`--etapa-${t}: #`));
  assert.doesNotMatch(PJS, /\["nova", "Nova conversa", "#9FB4C7"\],\n\s+\["agendada", "Avaliação agendada"/, "COLS_K sem hex solto");
  assert.doesNotMatch(PJS, /stroke="rgba\(245,233,214,\.08\)"/, "trilha da rosca pelo token");
  assert.match(CSS, /\.donut \.donut-trilha \{ stroke: var\(--tinta\); \}/);
  assert.match(PJS, /aria-label="\$\{esc\(l\)\}: \$\{tot\} \$\{esc\(tot === 1 \? V\.pessoa\[0\] : V\.pessoa\[1\]\)\}"/, "aria-label das colunas");
  assert.match(PJS, /<th scope="col">\$\{esc\(capt\(V\.novo\[1\]\)\)\}<\/th><th scope="col">\$\{esc\(V\.receita\)\}<\/th><th scope="col">Custo\/\$\{esc\(V\.pessoa\[0\]\)\}<\/th>/, "tabela de origem");
  // plano 2000d: com int() (KX-051)
  assert.match(PJS, /<small>\$\{int\(c\.fecharam\)\} \$\{esc\(c\.fecharam === 1 \? V\.pessoa\[0\] : V\.pessoa\[1\]\)\}<\/small>/, "centro da rosca");
});

test("AB-010/AB-231 · salvar o cliente no clássico preserva regrasOff que a tela não conhece", () => {
  const telaAntiga = { r1: true, r2: true, r3: true, r4: true, r5: true, r6: true };
  assert.deepEqual(pl(P.regrasOffDoForm(["ritmo", "r3"], telaAntiga)), ["ritmo"], "r3 religada, «ritmo» (Órbita) fica");
  assert.deepEqual(pl(P.regrasOffDoForm([], { ...telaAntiga, r2: false, ritmo: false })), ["r2", "ritmo"]);
  assert.deepEqual(pl(P.regrasOffDoForm(["ritmo"], { ...telaAntiga, ritmo: true })), [], "ligado na tela: sai");
  assert.match(PJS, /\["ritmo", "Ritmo do orçamento"\]\];/, "o «ritmo» aparece no formulário");
  assert.match(PJS, /regrasOff: regrasOffDoForm\(cfgAntes\.regrasOff, /);
});

test("AB-144 · WhatsApp do formulário: 10 a 13 dígitos, inválido avisa", () => {
  assert.deepEqual(pl(P.numerosWa("9999-8888")), { ok: [], invalidos: ["9999-8888"] }, "antes: sumia calado");
  assert.deepEqual(pl(P.numerosWa("551299999888877").invalidos), ["551299999888877"], "15 dígitos não passa");
  assert.deepEqual(pl(P.numerosWa("(12) 99999-8888\n5512999998888; (12) 99999-8888").ok),["12999998888", "5512999998888"]);
  assert.match(PJS, /inválido: use DDD \+ número/);
});

test("AB-145/AB-146 · credenciais conferidas antes de salvar; desligar a integração pergunta", () => {
  assert.match(P.erroCredencial("meta_ad_account_id", "act_12 34"), /act_ seguido só de números/);
  assert.equal(P.erroCredencial("meta_ad_account_id", "act_1234567890"), "");
  assert.match(P.erroCredencial("google_customer_id", "123-456-78"), /10 números/);
  assert.equal(P.erroCredencial("meta_access_token", ""), "", "em branco = mantém o salvo");
  assert.match(PJS, /const msg = erroCredencial\(i\.name, i\.value\);\n\s+if \(msg\) \{ i\.focus\(\); return avisoForm\(st, msg, true\); \}/);
  // plano 1500c: AC-242 — a pergunta continua, agora no diálogo do próprio painel (confirmar) em vez do confirm() nativo
  assert.match(PJS, /if \(antes\.ativo && !ativo\) \{[\s\S]{0,200}if \(!\(await confirmar\(`Desligar a integração do \$\{nomeC\}\?/);
});

test("AB-147 · meta negativa não apaga a meta calada", () => {
  assert.deepEqual(pl(P.valorMeta("-15")), { ok: false, erro: "não pode ser negativo" });
  assert.deepEqual(pl(P.valorMeta("")), { ok: true, valor: null });
  assert.deepEqual(pl(P.valorMeta("12,5")), { ok: true, valor: 12.5 });
  assert.match(PJS, /const v = valorMeta\(\$\(sel\)\.value\);\n\s+if \(!v\.ok\)/);
});

test("AB-141 · campanha sem gasto há 3 dias ou mais ganha «pausada · último gasto»", () => {
  const ult = P.ultimoGastoCamp([{ camp: "a", i: 5, gasto: 10 }, { camp: "a", i: 8, gasto: 0 }, { camp: "b", i: 9, gasto: 3 }, { camp: "b", i: 12, gasto: 1 }], 10);
  assert.equal(ult.get("a"), 5); assert.equal(ult.get("b"), 9, "o dia 12 (depois de ontem) não conta");
  assert.equal(P.DIAS_PAUSADA, 3);
  assert.match(PJS, /r\.pausaDe = u != null && M\.R - u >= DIAS_PAUSADA \? u : null;/);
  assert.match(PJS, />pausada · último gasto \$\{esc\(M\.ddmm\(r\.pausaDe\)\)\}<\/span>/);
});

test("AB-161 · resumo das execuções com segredo mascarado", () => {
  assert.equal(P.mascararSegredos('{"erro":"token EAAB1234567890abcdef"}'), '{"erro":"token EAA•••"}');
  assert.match(P.mascararSegredos("ya29.a0AfH6SMBxyz-123"), /^ya29\.•••$/);
  assert.match(P.mascararSegredos("chave sb_secret_abcdef123"), /sb_secret_•••/);
  assert.equal(P.mascararSegredos("x".repeat(40)), "xxxx•••");
  assert.equal(P.mascararSegredos("leu 12 linhas · 2 campanhas"), "leu 12 linhas · 2 campanhas", "texto normal passa");
  const r = P.execucaoDoPedido([{ tarefa: "nx-ciclo", inicio: new Date(1000).toISOString(), ok: false, resumo: { erro: "token EAAB1234567890xyz inválido" } }], "nx-ciclo", 1000);
  assert.doesNotMatch(r.rotulo, /EAAB123/); assert.match(r.rotulo, /EAA•••/);
  assert.match(PJS, /const resumoTxt = r => !r \? "" : mascararSegredos\(/);
});

test("AB-162 · o marco é mesclado na lista relida do servidor", () => {
  const frescos = [{ d: "2026-10-01", t: "do outro gestor" }, { d: "2026-10-05", t: "antigo" }];
  assert.deepEqual(pl(P.mesclarMarcos(frescos, "2026-10-03", "meu")), [{ d: "2026-10-01", t: "do outro gestor" }, { d: "2026-10-03", t: "meu" }, { d: "2026-10-05", t: "antigo" }]);
  assert.deepEqual(pl(P.mesclarMarcos(frescos, "2026-10-05", "")), [{ d: "2026-10-01", t: "do outro gestor" }], "texto vazio remove");
  assert.equal(P.mesclarMarcos(Array.from({ length: 50 }, (_, k) => ({ d: `2026-01-${String(k % 28 + 1).padStart(2, "0")}`, t: `m${k}` })), "2026-12-01", "x").length, 40);
  assert.match(PJS, /const r = await api\.dados\(S\.token, S\.clienteId, 1\);/, "relê antes de gravar");
});

test("AB-154 · período, plataforma e ordem guardados por cliente", () => {
  assert.equal(P.chaveFiltros("c1"), "nx-filtros:c1");
  assert.deepEqual(JSON.parse(JSON.stringify(P.lerFiltros('{"dias":60,"plat":"meta","sort":{"key":"cpa","dir":1}}'))), { dias: 60, plat: "meta", sort: { key: "cpa", dir: 1 } });
  assert.deepEqual(JSON.parse(JSON.stringify(P.lerFiltros('{"dias":45,"plat":"tiktok","sort":{"key":"x","dir":3}}'))), { dias: 30, plat: "", sort: { key: "gasto", dir: -1 } }, "valor estranho cai no padrão");
  assert.deepEqual(JSON.parse(JSON.stringify(P.lerFiltros("{quebrado"))).dias, 30);
  assert.match(PJS, /S\.dias = \+v; guardarFiltros\(\);/); assert.match(PJS, /S\.plat = v; S\.kVer = \{\}; S\.criMax = CRI_PASSO; guardarFiltros\(\);/);   // plano 2000d: criativos voltam à 1ª página (KX-049)
  assert.match(PJS, /S\.clienteId = escolhido \? escolhido\.id : null;\n\s+aplicarFiltrosSalvos\(\);/, "a sessão volta com o guardado");
});

/* ---------- (b) peças de tela conferidas pela fonte ---------- */
test("AB-011/AB-137/AB-152 · tabela de campanhas acessível: aria-sort no <th>, «Total» como cabeçalho de linha, nível do CPA em texto", () => {
  assert.match(PJS, /`<th scope="col"\$\{tt \? ` title="\$\{esc\(tt\)\}"` : ""\}\$\{k === key \? ` aria-sort=/, "aria-sort no th");
  assert.doesNotMatch(PJS, /data-sort="\$\{k\}"\$\{k === key \? ` aria-sort/, "antes: no botão");
  assert.match(CSS, /th\[aria-sort="descending"\] button::after/);
  assert.match(PJS, /<tfoot><tr><th scope="row">Total<\/th>/);
  assert.match(CSS, /#tbl-campanhas tfoot th\[scope="row"\]/);
  // plano 1500c: AC-224 — o nível do custo é contra a meta DA CAMPANHA (pontoCpa recebe a campanha)
  assert.match(PJS, /<span class="sr-only">\$\{esc\(NIVEL_CPA\[pontoCpa\(r\.t\.cpa, r\.c\)\]\)\}: <\/span>/);
});

test("AB-012 · trilha do herói: sem base a taxa é null (marcador vazio), nunca «0%»", () => {
  assert.match(PJS, /fin\(tx1\) \? tx1 : null\)/); assert.match(PJS, /fin\(tx2\) \? tx2 : null\);/);
  assert.doesNotMatch(PJS, /fin\(tx[12]\) \? tx[12] : 0/);
});

test("AB-143 · radar clássico conta os episódios além dos 8", () => {
  assert.match(PJS, /hist\.length > 8 \? `<li class="al-mais"><p class="al-d">… e mais \$\{int\(hist\.length - 8\)\} nos últimos 14 dias\.<\/p><\/li>`/);
});

test("AB-149/AB-151/AB-156/AB-158/AB-160 · textos e rótulos da vertical; glifo e gráfico", () => {
  assert.match(PJS, /viram \$\{esc\(M\.VOC\.agendada\[0\]\)\}/); assert.doesNotMatch(PJS, /"Instagram\/Facebook"/);
  assert.match(PJS, /notaReceita\(c, V\.servico\)\)\s*:\s*fin\(roas\)/); assert.match(PJS, /const nota = notaReceita\(c, V\.servico\);/);
  assert.match(PJS, /<span><span aria-hidden="true">▮<\/span> orçamento<\/span>/);
  assert.match(PJS, /aria-label="Investimento diário por plataforma e conversões da plataforma \(média de 7 dias\)/);
  assert.match(PJS, /plural\(novos\.length, M\.VOC\.novo\[0\], M\.VOC\.novo\[1\]\)/); assert.doesNotMatch(PJS, /"paciente novo", "pacientes novos"/);
});

test("AB-153 · setas no seletor de período: um render só depois de 150 ms sem tecla", () => {
  assert.match(PJS, /if \(teclado\) tTecla = setTimeout\(\(\) => aoMudar\(b\.dataset\.v\), 150\);/);
  assert.match(PJS, /sel\(nb, true\); nb\.focus\(\);/);
});

test("AB-157 · barra de frequência na escala do limite do cliente", () => {
  assert.match(PJS, /--w:\$\{Math\.min\(100, t\.freq \/ \(freqLim \* 1\.33\) \* 100\)\}%/);
  assert.match(PJS, /const freqLim = \(M\.LIM && M\.LIM\.freqMax > 0\) \? M\.LIM\.freqMax : 3;/);
  assert.doesNotMatch(PJS, /t\.freq \/ 4 \* 100/);
});

test("AB-159 · campanha escolhida na paleta recebe o foco; sem linha, avisa", () => {
  assert.match(PJS, /tr\.setAttribute\("tabindex", "-1"\);[\s\S]{0,140}tr\.focus\(\{ preventScroll: true \}\);/);
  assert.match(PJS, /if \(!tr\) \{ toast\(`Sem investimento nesta campanha nos últimos \$\{S\.dias\} dias/);
});

test("AB-163 · interruptor travado explica em texto (aria-describedby)", () => {
  assert.match(PJS, /aria-disabled="true" aria-describedby="rl-trava"/);
  assert.match(HTML, /<span id="rl-trava" hidden>indisponível: só a equipe da Nexus liga ou desliga regras<\/span>/);
  assert.match(HTML, /<span id="rl-trava-meta" hidden>/);
});

test("AB-255 · relatório que não saiu: «Enviar de novo» para o gestor", () => {
  assert.match(PJS, /const reenviar = gestor\(\) && !vedadoSuper\(\) && !rel\.exemplo && ehUltimo && \(s\.k === "erro" \|\| s\.k === "parcial"\);/);
  assert.match(PJS, /data-reenviar="\$\{tipo === "mensal" \? "mensal" : "diario"\}">Enviar de novo<\/button>/);
  assert.match(PJS, /await executarTarefa\(b\.dataset\.reenviar === "mensal" \? "mensal" : "diario", b\);/);
});

test("AB-022 · clássico salva a assinatura digitada (vazio = sem assinatura)", () => {
  assert.match(PJS, /assinatura: \$\("#cl-assinatura"\)\.value\.trim\(\),/);
  assert.doesNotMatch(PJS, /\|\| CFG_PADRAO\.assinatura/);
});

/* ---------- (c) dados.js ---------- */
test("AB-165 · rpc com tempo-limite: rede presa vira «tempo_esgotado»", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let sinal = null;
  api.usarFetch((url, init) => { sinal = init.signal; return new Promise(() => {}); });
  try {
    const p = api.sessao("tk");
    p.catch(() => {});
    t.mock.timers.tick(api.TEMPO_LIMITE_MS - 1);
    await Promise.resolve();
    t.mock.timers.tick(1);
    await assert.rejects(p, e => e.codigo === "tempo_esgotado");
    assert.equal(api.TEMPO_LIMITE_MS, 30000);
    assert.ok(sinal && sinal.aborted, "o fetch é abortado");
  } finally { api.usarFetch(null); t.mock.timers.reset(); }
});

test("AB-168 · queda durante a leitura do corpo vira «sem_conexao» (não um TypeError cru)", async () => {
  api.usarFetch(async () => ({ ok: true, status: 200, text: () => Promise.reject(new TypeError("network error")) }));
  try { await assert.rejects(api.sessao("tk"), e => e.codigo === "sem_conexao"); } finally { api.usarFetch(null); }
});

test("AB-166/AB-167 · mensagens de erro sem código cru e sem «paciente/clínica»", () => {
  assert.equal(api.mensagemErro({ codigo: "http_502" }), "O servidor está fora agora. Tente em instantes.");
  assert.doesNotMatch(api.mensagemErro({ codigo: "PGRST301" }), /PGRST301|\(/);
  assert.doesNotMatch(api.mensagemErro({ codigo: "lead_nao_encontrado" }), /[Pp]aciente/);
  assert.doesNotMatch(api.mensagemErro({ codigo: "sem_acesso" }), /clínica/);
});

test("UB-167 · aparelho compartilhado (Lembrar desmarcado): token no sessionStorage, com ociosidade, nunca no localStorage", async () => {
  const mk = () => { const m = new Map(); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  const loc = mk(), ses = mk(), antes = { location: globalThis.location, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage };
  const chamadas = [];
  api.usarFetch(async (url, init) => { chamadas.push({ url, corpo: JSON.parse(init.body) }); return { ok: true, status: 200, text: async () => "null" }; });
  globalThis.location = { hostname: "orbita-nexus-ads.netlify.app" }; globalThis.localStorage = loc; globalThis.sessionStorage = ses;
  try {
    loc.setItem("nx-token", "velho");
    loc.setItem(api.CHAVE_COMPARTILHADO, "1");                 // o login do Órbita marca antes de guardar o token
    const t0 = Date.now();
    api.guardarToken("novo", t0);
    assert.equal(loc.getItem("nx-token"), null, "antes: ficava no localStorage e sobrevivia a fechar o navegador");
    assert.equal(JSON.parse(ses.getItem("nx-token")).t, "novo");
    assert.equal(api.lerToken(t0 + 60e3), "novo");
    assert.equal(api.lerToken(t0 + 60e3 + api.TOKEN_OCIOSO_MS + 1000), null, "mesma ociosidade da origem compartilhada");
    await esperar(5);
    assert.ok(chamadas.some(c => /nx_sair$/.test(c.url) && c.corpo.p_token === "velho"), "o token antigo do disco é encerrado");
    loc.removeItem(api.CHAVE_COMPARTILHADO);                    // voltou a «Lembrar neste aparelho»
    api.guardarToken("lembrado");
    assert.equal(loc.getItem("nx-token"), "lembrado"); assert.equal(ses.getItem("nx-token"), null);
    assert.equal(api.lerToken(), "lembrado");
  } finally { for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } api.usarFetch(null); }
  assert.match(DJS, /export const CHAVE_COMPARTILHADO = "nx-app-compartilhado";/, "a mesma chave que o app.js grava (AS-185)");
});

/* ---------- (d) nucleo.js ---------- */
const HOJE = N.hojeSP();
const dia = n => { const d = N.meioDia(HOJE); d.setDate(d.getDate() - n); return N.isoDe(d); };
const cli = (extra = {}) => ({ id: "c1", slug: "x", nome: "Clínica Teste", cfg: {}, ...extra });
const montarDe = (o = {}) => N.montar(N.datasetDeLinhas({ metricas: [], leads: [], cliente: cli(), hoje: HOJE, dias: 130, ...o }));
const metrica = (d, o = {}) => ({ p: "meta", d, n: "anuncio", c: "C1", cn: "Campanha teste", a: "A1", an: "Anúncio teste",
  imp: 1000, alc: 800, freq: 1.2, cli: 30, g: 30, conv: 2, ...o });
const serie = (de, ate, o = {}) => Array.from({ length: ate - de + 1 }, (_, k) => metrica(dia(de + k), o));
const ultimoMes = M => M.mesesDados().filter(m => m.completo).pop();
const leadF = (d, o = {}) => ({ id: Math.random(), nome: "Ana", origem: "anuncio", plataforma: "meta", campanha_ext: "C1", anuncio_ext: "A1",
  etapa: "fechou", data_conversa: d, data_agenda: d, data_consulta: d, valor: null, servico: null, ...o });

test("AB-211 · «Cada R$ 1 virou R$ 8,90» (moeda com 2 casas)", () => {
  const M0 = montarDe({ metricas: serie(1, 120, { g: 10 }) });
  const m = ultimoMes(M0);
  const iso = N.isoDe(M0.dataDe(m.de + 5));
  const M = montarDe({ metricas: serie(1, 120, { g: 10 }), leads: [leadF(iso, { valor: 2670 })] });
  const t = M.relMensal(ultimoMes(M));
  assert.match(t, /Cada R\$ 1 em anúncio virou \*R\$\s[\d.]+,\d{2}\*/, "antes: «*R$ 8,9*»");
});

test("AB-017/AB-210 · mensal sem conversão sem «custo médio —»; registrar valor «no negócio (CRM)»", () => {
  const M0 = montarDe({ metricas: serie(1, 120, { conv: 0 }) });
  const m = ultimoMes(M0), iso = N.isoDe(M0.dataDe(m.de + 3));
  const M = montarDe({ metricas: serie(1, 120, { conv: 0 }), leads: [leadF(iso)] });
  const t = M.relMensal(ultimoMes(M));
  assert.doesNotMatch(t, /custo médio —/);
  assert.match(t, /registre o valor no negócio \(CRM\)/);
});

test("AB-016/AB-253 · diário: semana sem conversa sem «— por conversa»; investimento com a média dos 7 dias", () => {
  const M = montarDe({ metricas: serie(1, 20, { conv: 0 }) });
  const t = M.relDiario(M.R);
  assert.doesNotMatch(t, /— por conversa/);
  assert.match(t, /nenhuma conversa na semana/);
  assert.match(montarDe({ metricas: serie(1, 20) }).relDiario(129), /• Investido: R\$\s30,00 .*\(média dos 7 dias anteriores: R\$\s30,00\)/);   // plano 1500c: AC-013 — média dos 7 dias ANTERIORES
});

test("AB-018 · melhor/pior da semana com o nome curto e «por conversão» no Google", () => {
  const longo = "Campanha de captação de pacientes para implantes dentários na região metropolitana";
  const M = montarDe({ metricas: serie(1, 10, { p: "google", c: "G1", cn: longo, a: "GA", an: "Anúncio Google" }) });
  const t = M.relDiario(M.R);
  assert.match(t, /por conversão \(única campanha com conversão na semana\)/, "antes: «por conversa» no Google");
  assert.ok(!t.includes(longo), "o nome inteiro (80 letras) não entra");
  assert.ok(t.includes(Object.values(M.CAMP).find(c => c.nome === longo).curto));
});

test("AB-019 · diário com mais de 4 alertas diz quantos ficaram de fora", () => {
  const mets = [];
  for (let c = 1; c <= 7; c++) mets.push(...serie(1, 6, { c: `C${c}`, cn: `Campanha ${c}`, a: `A${c}`, an: `Anúncio ${c}`, g: 15, conv: 0 }));
  const M = montarDe({ metricas: mets });
  const al = M.avaliar(M.R);
  assert.ok(al.length > 4, `fixture com ${al.length} alertas`);
  assert.match(M.relDiario(M.R), new RegExp(`… e mais ${al.length - 4} no painel\\.`));
});

test("AB-022/AB-021 · padrão continua «Equipe Nexus» (clientes atuais); assinatura apagada não vira linha em branco", () => {
  assert.equal(N.CFG_PADRAO.assinatura, "Equipe Nexus · gestão de tráfego");
  const M = montarDe({ metricas: serie(1, 120), cliente: cli({ cfg: { assinatura: "" } }) });
  const t = M.relMensal(ultimoMes(M));
  assert.doesNotMatch(t, /Nexus/);
  assert.ok(t.endsWith("_Qualquer dúvida, é só responder aqui._"), "antes: terminava com uma linha vazia");
  const M2 = montarDe({ metricas: serie(1, 120), cliente: cli({ cfg: { assinatura: "Equipe Ana · tráfego" } }) });
  assert.ok(M2.relMensal(ultimoMes(M2)).endsWith("_Qualquer dúvida, é só responder aqui._\nEquipe Ana · tráfego"));
});

test("AB-023 · leitura da IA com teto (fim de frase) — o diário cabe no WhatsApp", () => {
  const frase = "Os anúncios seguem estáveis e o custo por conversa está dentro do esperado para a semana. ";
  const longa = frase.repeat(40);
  const c = N.cortarLeitura(longa);
  assert.ok(c.length <= N.TETO_LEITURA_IA, `${c.length}`); assert.ok(c.endsWith("."), "corta no fim de uma frase");
  assert.equal(N.cortarLeitura("curta."), "curta.");
  const M = montarDe({ metricas: serie(1, 20) });
  assert.ok(M.relDiario(M.R, longa).length < 4096, "antes: 3.600+ caracteres só de leitura");
  const M2 = montarDe({ metricas: serie(1, 120) });
  assert.ok(!M2.relMensal(ultimoMes(M2), longa).includes(longa.trim()), "o mensal também corta");
});

test("AB-169 · leitura por regras com Google: compara o custo por conversa do Meta", () => {
  const mets = [...serie(1, 14), ...serie(1, 14, { p: "google", c: "G1", cn: "Pesquisa", a: "GA", an: "Texto", g: 80, conv: 1 })];
  const M = montarDe({ metricas: mets });
  const t = M.relDiario(M.R);
  assert.match(t, /• Custo por conversa do Meta estável na semana \(R\$\s15,00\)/, "antes: misturava o Google (R$ 36,67)");
});

test("AB-170 · aviso r5: a mesma régua nos dois valores", () => {
  const mets = serie(2, 9, { g: 50, conv: 3 });
  const M = montarDe({ metricas: mets });
  const r5 = M.avaliar(M.R).find(a => a.regra.id === "r5");
  assert.ok(r5);
  assert.match(r5.msg, /caiu de R\$\s50,00 por dia .* para R\$\s0,00/, "antes: «R$ 50» × «R$ 0,00»");
});

test("AB-171 · mensal cita a campanha pelo nome curto", () => {
  const longo = "Campanha de captação de pacientes para implantes dentários na região metropolitana de SP";
  const M0 = montarDe({ metricas: serie(1, 120, { cn: longo }) });
  const iso = N.isoDe(M0.dataDe(ultimoMes(M0).de + 3));
  const M = montarDe({ metricas: serie(1, 120, { cn: longo }), leads: [leadF(iso, { valor: 900 })] });
  const linha = M.relMensal(ultimoMes(M)).split("\n").find(l => l.startsWith("• Campanha que mais trouxe resultado"));   // plano 1500c: AC-018 — é a campanha
  assert.ok(linha && !linha.includes(longo) && linha.includes(Object.values(M.CAMP).find(c => c.nome === longo).curto), linha);
});

test("AB-172 · bloco de 7 dias com o «fechou» da vertical", () => {
  const M = montarDe({ metricas: serie(1, 20), leads: [leadF(dia(2), { valor: 500 })], cliente: cli({ vertical: "oficina" }) });
  assert.match(M.relDiario(M.R), /1 cliente aprovou o orçamento/);
});

test("AB-020 · conselho de criativo cansado pela régua do cliente (freqMax) e sem remarketing", () => {
  const base = { freq: 3, conv: 2 };
  const M = montarDe({ metricas: serie(1, 120, base), cliente: cli({ cfg: { radar: { freqMax: 6 } } }) });
  assert.doesNotMatch(M.relMensal(ultimoMes(M)), /Gravar 2 vídeos novos/, "antes: 2,6 fixo");
  const P3 = montarDe({ metricas: serie(1, 120, base) });
  assert.match(P3.relMensal(ultimoMes(P3)), /Gravar 2 vídeos novos/, "com o padrão (3 × 0,87 = 2,61) o 3 ainda é cansado");
  const R = montarDe({ metricas: serie(1, 120, { ...base, cn: "Remarketing quente" }) });
  assert.doesNotMatch(R.relMensal(ultimoMes(R)), /Gravar 2 vídeos novos/, "remarketing tem frequência alta por desenho");
});

test("AB-024 · contexto da IA: projeção null no começo do mês e orçamento restante", () => {
  const M = montarDe({ metricas: serie(1, 60), cliente: cli({ cfg: { orcamento: 1500 } }) });
  let ref = M.R; while (M.dataDe(ref).getDate() !== 2) ref--;
  const c = M.contextoIA(ref);
  assert.equal(c.mes.projecao, null, "antes: projeção de ruído no dia 2");
  assert.equal(c.mes.cedo_para_projetar, true);
  assert.equal(c.mes.orcamento_restante, 1500 - c.mes.gasto);
  assert.equal(montarDe({ metricas: serie(1, 60) }).contextoIA(ref).mes.orcamento_restante, null, "sem orçamento: null");
});
