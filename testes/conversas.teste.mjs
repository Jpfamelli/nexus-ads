/* ============================================================
   ÓRBITA — testes da tela de Conversas (frente F5) · Node puro, sem dependências
   node testes/conversas.teste.mjs
   (a) cv-logica.js: janela, abaDe/pertenceAba, aplicarVariaveis, agruparPorDia (fuso SP),
       montarLinhas, resumoMensagem, iconeStatus (nunca azul), filtrarRespostas, mesclarDelta
       (repetidos, fora de ordem, commit atrasado), anexos, modelos, telefone
   (b) checagem estática dos arquivos da F5 (sem import estático, sem innerHTML, sem hex,
       sem 1fr solto, sem on*= inline, import() sempre com ?v=, node --check)
   ============================================================ */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const APP = join(AQUI, "..", "web", "app");
const ler = f => readFileSync(join(APP, f), "utf8");

let ok = 0, falhas = 0;
async function teste(nome, fn) {
  try { await fn(); ok++; console.log(`  ✓ ${nome}`); }
  catch (e) { falhas++; console.log(`  ✗ ${nome}\n      ${String(e && e.stack || e).split("\n").slice(0, 4).join("\n      ")}`); }
}

const L = await import("../web/app/cv-logica.js");

console.log("\n(a) cv-logica.js");

const AGORA = new Date("2026-09-28T15:00:00-03:00");   // segunda-feira, 15h em São Paulo

await teste("janela: aberta com horas restantes (singular/plural) e fechada", () => {
  const ent = new Date(AGORA.getTime() - 6 * 3600000).toISOString();
  const j = L.janela({ ultima_entrada_em: ent }, AGORA);
  assert.equal(j.aberta, true);
  assert.equal(j.texto, "Janela aberta · 18 h restantes");
  assert.equal(j.nivel, "aberta");
  const j1 = L.janela({ ultima_entrada_em: new Date(AGORA.getTime() - 22.5 * 3600000).toISOString() }, AGORA);
  assert.equal(j1.texto, "Janela aberta · 1 h restante");
  assert.equal(j1.nivel, "acabando");
  const j2 = L.janela({ ultima_entrada_em: new Date(AGORA.getTime() - (24 * 3600000 - 30 * 60000)).toISOString() }, AGORA);
  assert.equal(j2.texto, "Janela aberta · 30 min restantes");
  const f = L.janela({ ultima_entrada_em: new Date(AGORA.getTime() - 25 * 3600000).toISOString() }, AGORA);
  assert.equal(f.aberta, false);
  assert.equal(f.texto, "Janela fechada — só modelos");
  assert.equal(L.janela({}, AGORA).aberta, false, "sem mensagem do cliente = fechada");
  assert.equal(L.janela(null, AGORA).aberta, false);
});

await teste("janela: janela_ate do servidor tem prioridade", () => {
  const j = L.janela({ janela_ate: new Date(AGORA.getTime() + 3 * 3600000).toISOString(), ultima_entrada_em: "2020-01-01T00:00:00Z" }, AGORA);
  assert.equal(j.aberta, true);
  assert.equal(j.texto, "Janela aberta · 3 h restantes");
});

await teste("janela: o aparelho do CodeWords não tem janela de 24 h (canalTemJanela) — composer, selo e «Nova conversa» não travam", () => {
  assert.equal(L.canalTemJanela("codewords"), false);
  assert.equal(L.canalTemJanela("meta"), true);
  assert.equal(L.canalTemJanela(undefined), true, "canal desconhecido segue a regra da Meta");
  // número que nunca escreveu (janela_ate nulo) e conversa de 30 h atrás: fechadas pela conta da Meta, mas só a Meta se importa
  assert.equal(L.janela({ janela_ate: null, ultima_entrada_em: null }, AGORA).aberta, false);
  assert.equal(L.janela({ ultima_entrada_em: new Date(AGORA.getTime() - 30 * 3600000).toISOString() }, AGORA).aberta, false);
  const comp = ler("cv-composer.js");
  assert.match(comp, /L\.canalTemJanela\(provedorCanal\(\)\) && !L\.janela\(c\)\.aberta\) return "janela"/, "situacao(): sem «janela» no CodeWords");
  assert.doesNotMatch(comp, /A janela de 24 h do WhatsApp fechou\. Neste canal CodeWords/, "a faixa «aguarde uma nova mensagem» some");
  assert.match(ler("cv-chat.js"), /L\.canalTemJanela\(provedorCanal\)/, "o selo do cabeçalho some no CodeWords");
  assert.match(ler("conversas.js"), /L\.canalTemJanela\(provedorItem\) && !L\.janela\(item\)\.aberta/, "Nova conversa por CodeWords não abre os modelos da Meta");
});

await teste("abaDe e pertenceAba seguem a regra do nx_cv_listar", () => {
  const eu = "u1";
  assert.equal(L.abaDe({ status: "aberta", atribuida_a: "u1", aguardando: true }, eu), "minhas");
  assert.equal(L.abaDe({ status: "aberta", atribuida_a: null, aguardando: true }, eu), "sem_dono");
  assert.equal(L.abaDe({ status: "aberta", atribuida_a: "u2", aguardando: true }, eu), "aguardando");
  assert.equal(L.abaDe({ status: "aberta", atribuida_a: "u2", aguardando: false }, eu), "abertas");
  assert.equal(L.abaDe({ status: "pendente", atribuida_a: "u2" }, eu), "pendentes");
  assert.equal(L.abaDe({ status: "resolvida" }, eu), "resolvidas");
  assert.equal(L.abaDe({ status: "aberta", oculta: true }, eu), "ocultas");
  const c = { status: "aberta", atribuida_a: "u1", aguardando: true };
  assert.deepEqual(["minhas", "sem_dono", "aguardando", "abertas", "pendentes", "resolvidas", "ocultas"].filter(a => L.pertenceAba(c, a, eu)),
    ["minhas", "aguardando", "abertas"]);
  assert.equal(L.pertenceAba({ status: "pendente", atribuida_a: null }, "sem_dono", eu), true, "sem dono inclui pendente");
  assert.equal(L.pertenceAba({ status: "aberta", oculta: true }, "abertas", eu), false, "oculta fora das abas normais");
  assert.equal(L.pertenceAba({ status: "resolvida", resolvida_em: "2026-08-01T00:00:00Z" }, "resolvidas", eu, AGORA), false, "resolvidas = 30 dias");
  assert.equal(L.pertenceAba({ status: "resolvida", resolvida_em: "2026-09-20T00:00:00Z" }, "resolvidas", eu, AGORA), true);
  assert.equal(L.ABAS.length, 7);
  assert.equal(L.ABAS.find(a => a.id === "resolvidas").vazio, "Nada resolvido nos últimos 30 dias.");
});

await teste("primeiroNome e aplicarVariaveis ({primeiro_nome} {nome} {atendente} {empresa} {protocolo})", () => {
  assert.equal(L.primeiroNome("maria souza"), "Maria");
  assert.equal(L.primeiroNome("  Ângela  Dias "), "Ângela");
  assert.equal(L.primeiroNome("5512998303030"), "");
  assert.equal(L.primeiroNome(null), "");
  const vars = { nome: "maria souza", atendente: "Ana", empresa: "Kamiguchi Odontologia", protocolo: "2026-000123" };
  assert.equal(L.aplicarVariaveis("Olá, {primeiro_nome}! Aqui é {atendente}, da {empresa}. Como posso ajudar?", vars),
    "Olá, Maria! Aqui é Ana, da Kamiguchi Odontologia. Como posso ajudar?");
  assert.equal(L.aplicarVariaveis("Protocolo {protocolo} · {nome}", vars), "Protocolo 2026-000123 · maria souza");
  assert.equal(L.aplicarVariaveis("Olá, {primeiro_nome}!", { nome: "" }), "Olá!", "sem nome some com a vírgula");
  assert.equal(L.aplicarVariaveis("Qual o melhor dia: {dia 1} ou {dia 2}?", vars), "Qual o melhor dia: {dia 1} ou {dia 2}?", "chave desconhecida fica");
  assert.equal(L.aplicarVariaveis("Oi {primeiro_nome}", { primeiro_nome: "Zé" }), "Oi Zé");
});

await teste("agruparPorDia usa o fuso de São Paulo (01h UTC ainda é ontem)", () => {
  const msgs = [
    { id: 1, criado_em: "2026-09-27T23:30:00-03:00" },
    { id: 2, criado_em: "2026-09-28T02:10:00Z" },        // 23:10 do dia 27 em SP
    { id: 3, criado_em: "2026-09-28T03:05:00Z" },        // 00:05 do dia 28 em SP
    { id: 4, criado_em: "2026-09-28T14:00:00-03:00" },
    { id: 5, criado_em: "2026-09-21T10:00:00-03:00" },
  ];
  const g = L.agruparPorDia(msgs.slice(0, 4), AGORA);
  assert.deepEqual(g.map(x => x.dia), ["2026-09-27", "2026-09-28"]);
  assert.deepEqual(g.map(x => x.rotulo), ["Ontem", "Hoje"]);
  assert.deepEqual(g[0].itens.map(m => m.id), [1, 2]);
  assert.deepEqual(g[1].itens.map(m => m.id), [3, 4]);
  assert.equal(L.rotuloDia("2026-09-24", AGORA), "Quinta-feira");
  assert.equal(L.rotuloDia("2026-09-21", AGORA), "21 de setembro");
  assert.equal(L.rotuloDia("2025-12-25", AGORA), "25 de dezembro de 2025");
  assert.equal(L.diaSP("2026-09-28T02:59:59Z"), "2026-09-27");
});

await teste("montarLinhas: separador de dia, de atendimento e bolhas coladas", () => {
  const msgs = [
    { id: 1, conversa_id: 10, direcao: "in", tipo: "texto", criado_em: "2026-09-27T10:00:00-03:00" },
    { id: 2, conversa_id: 10, direcao: "in", tipo: "texto", criado_em: "2026-09-27T10:01:00-03:00" },
    { id: 3, conversa_id: 11, direcao: "in", tipo: "texto", criado_em: "2026-09-28T09:00:00-03:00" },
    { id: 4, conversa_id: 11, direcao: "out", tipo: "texto", enviado_por: { id: "a" }, criado_em: "2026-09-28T09:02:00-03:00" },
    { id: 5, conversa_id: 11, direcao: "out", tipo: "nota", enviado_por: { id: "a" }, criado_em: "2026-09-28T09:03:00-03:00" },
    { id: 6, conversa_id: 11, direcao: "out", tipo: "sistema", criado_em: "2026-09-28T09:04:00-03:00" },
  ];
  const conv = [{ id: 10, protocolo: "2026-000001" }, { id: 11, protocolo: "2026-000002" }];
  const ln = L.montarLinhas(msgs, conv, AGORA);
  assert.deepEqual(ln.map(x => x.tipo), ["dia", "atendimento", "msg", "msg", "dia", "atendimento", "msg", "msg", "msg", "msg"]);
  assert.equal(ln[1].conversa.protocolo, "2026-000001");
  assert.equal(ln[3].junta, true, "mesma direção em 1 min cola");
  assert.equal(ln[7].junta, false, "resposta não cola na mensagem do cliente");
  assert.equal(ln[8].junta, false, "nota não cola em mensagem enviada");
  assert.equal(ln[9].junta, false, "sistema nunca cola");
  const um = L.montarLinhas(msgs.slice(0, 2), [conv[0]], AGORA);
  assert.deepEqual(um.map(x => x.tipo), ["dia", "msg", "msg"], "com um atendimento só, sem separador de atendimento");
});

await teste("resumoMensagem por tipo", () => {
  assert.equal(L.resumoMensagem({ tipo: "texto", corpo: "  Oi,\n tudo bem? " }), "Oi, tudo bem?");
  assert.equal(L.resumoMensagem({ tipo: "imagem", corpo: null }), "Foto");
  assert.equal(L.resumoMensagem({ tipo: "imagem", corpo: "meu dente" }), "Foto: meu dente");
  assert.equal(L.resumoMensagem({ tipo: "documento", midia: { nome: "exame.pdf" } }), "Documento: exame.pdf");
  assert.equal(L.resumoMensagem({ tipo: "audio" }), "Áudio");
  assert.equal(L.resumoMensagem({ tipo: "template", template: { nome: "confirmacao" } }), "Modelo «confirmacao»");
  assert.equal(L.resumoMensagem({ tipo: "nota", corpo: "ligar amanhã" }), "Nota: ligar amanhã");
  assert.equal(L.resumoMensagem({ tipo: "desconhecido" }), "Mensagem não suportada");
  assert.equal(L.resumoMensagem({ tipo: "texto", corpo: "x".repeat(300) }).length, 140);
  assert.equal(L.resumoMensagem(null), "");
});

await teste("iconeStatus: ◷ ✓ ✓✓ ✓✓+lida ! — nunca azul", () => {
  assert.equal(L.iconeStatus("pendente").simbolo, "◷");
  assert.equal(L.iconeStatus("enviada").simbolo, "✓");
  assert.equal(L.iconeStatus("entregue").simbolo, "✓✓");
  const lida = L.iconeStatus("lida");
  assert.equal(lida.simbolo, "✓✓");
  assert.equal(lida.texto, "lida", "lida escrito por extenso");
  assert.equal(L.iconeStatus("falhou").simbolo, "!");
  assert.equal(L.iconeStatus("falhou").cor, "ruim");
  assert.equal(L.iconeStatus("recebida"), null);
  for (const s of ["pendente", "enviada", "entregue", "lida", "falhou"]) {
    const i = L.iconeStatus(s);
    assert.ok(["texto-3", "ruim"].includes(i.cor), `${s}: cor ${i.cor}`);
    assert.ok(!/azul|blue|info|sec|meta/i.test(JSON.stringify(i)), `${s} nunca azul`);
  }
  assert.equal(L.iconeStatus("lida").cor, L.iconeStatus("entregue").cor, "lida tem a MESMA cor de entregue");
});

await teste("termoBarra e filtrarRespostas (/ com prioridade para o atalho)", () => {
  assert.equal(L.termoBarra("/ol"), "ol");
  assert.equal(L.termoBarra("/"), "");
  assert.equal(L.termoBarra("/ola mundo"), null);
  assert.equal(L.termoBarra("oi /ola"), null);
  const lista = [
    { id: 1, atalho: "ola", titulo: "Saudação", corpo: "Olá, {primeiro_nome}!", usos: 3 },
    { id: 2, atalho: "avaliacao", titulo: "Avaliação", corpo: "A avaliação é o primeiro passo", usos: 10 },
    { id: 3, atalho: "horarios", titulo: "Horários", corpo: "Atendemos de segunda a sexta", usos: 1 },
    { id: 4, atalho: "pos", titulo: "Pós-procedimento", corpo: "Como você está depois do procedimento?", usos: 0 },
    { id: 5, atalho: "velha", titulo: "Desligada", corpo: "x", ativo: false },
  ];
  assert.deepEqual(L.filtrarRespostas(lista, "a").map(r => r.id), [2, 1, 3, 4], "atalho que começa > contém > título/corpo; desligada fora");
  assert.deepEqual(L.filtrarRespostas(lista, "ola").map(r => r.id)[0], 1);
  assert.deepEqual(L.filtrarRespostas(lista, "AVALIACAO").map(r => r.id), [2], "sem acento e sem caixa");
  assert.deepEqual(L.filtrarRespostas(lista, "segunda").map(r => r.id), [3], "procura no corpo");
  assert.deepEqual(L.filtrarRespostas(lista, "").map(r => r.id), [2, 1, 3, 4], "vazio: mais usadas primeiro");
  assert.equal(L.filtrarRespostas(lista, "zzz").length, 0);
  assert.equal(L.filtrarRespostas(lista, "", { max: 2 }).length, 2);
});

await teste("mesclarDelta: repetidos da sobreposição de 30 s não duplicam; nova versão substitui", () => {
  const atuais = [
    { id: 10, status: "enviada", atualizado_em: "2026-09-28T14:00:00Z" },
    { id: 11, status: "recebida", atualizado_em: "2026-09-28T14:00:01Z" },
  ];
  const novos = [
    { id: 11, status: "recebida", atualizado_em: "2026-09-28T14:00:01Z" },          // repetido
    { id: 10, status: "entregue", atualizado_em: "2026-09-28T14:00:05Z" },          // status novo
    { id: 12, status: "recebida", atualizado_em: "2026-09-28T14:00:06Z" },
  ];
  const r = L.mesclarDelta(atuais, novos);
  assert.deepEqual(r.map(m => m.id), [10, 11, 12]);
  assert.equal(r[0].status, "entregue");
  assert.equal(L.mesclarDelta(r, novos).length, 3, "aplicar de novo não muda");
});

await teste("mesclarDelta: commit atrasado (id MENOR que o último visto) entra na posição certa", () => {
  const atuais = [{ id: 1 }, { id: 2 }, { id: 5 }];
  const r = L.mesclarDelta(atuais, [{ id: 4 }, { id: 3 }, { id: 6 }]);
  assert.deepEqual(r.map(m => m.id), [1, 2, 3, 4, 5, 6]);
});

await teste("mesclarDelta: versão mais velha não desfaz status; locais (◷) ficam no fim", () => {
  const atuais = [{ id: 7, status: "lida", atualizado_em: "2026-09-28T14:10:00Z" }, { id: "tmp-1", status: "pendente" }];
  const r = L.mesclarDelta(atuais, [{ id: 7, status: "entregue", atualizado_em: "2026-09-28T14:05:00Z" }, { id: 8 }]);
  assert.equal(r.find(m => m.id === 7).status, "lida", "sem regressão");
  assert.deepEqual(r.map(m => m.id), [7, 8, "tmp-1"]);
  assert.equal(L.ultimoId(r), 8);
  assert.equal(L.ultimoId([], 5), 5);
  assert.equal(L.ultimoId([{ id: "tmp-2" }], null), null);
});

await teste("mensagemOtimista: ◷ local com id tmp-", () => {
  const m = L.mensagemOtimista({ conversaId: 9, corpo: "oi", eu: { id: "a", nome: "Ana" }, agora: AGORA });
  assert.match(m.id, /^tmp-\d+$/);
  assert.equal(m.status, "pendente");
  assert.equal(m.direcao, "out");
  assert.equal(L.iconeStatus(m.status).simbolo, "◷");
  assert.notEqual(L.mensagemOtimista({}).id, L.mensagemOtimista({}).id);
});

await teste("tempoEspera e horaLista", () => {
  assert.equal(L.tempoEspera(new Date(AGORA.getTime() - 20000), AGORA), "agora");
  assert.equal(L.tempoEspera(new Date(AGORA.getTime() - 5 * 60000), AGORA), "5 min");
  assert.equal(L.tempoEspera(new Date(AGORA.getTime() - 3 * 3600000), AGORA), "3 h");
  assert.equal(L.tempoEspera(new Date(AGORA.getTime() - 50 * 3600000), AGORA), "2 d");
  assert.equal(L.horaLista("2026-09-28T09:05:00-03:00", AGORA), "09:05");
  assert.equal(L.horaLista("2026-09-27T09:05:00-03:00", AGORA), "Ontem");
  assert.equal(L.horaLista("2026-09-10T09:05:00-03:00", AGORA), "10/09");
  assert.equal(L.horaMsg("2026-09-28T17:05:00Z"), "14:05");
});

await teste("validarArquivo segue as regras da nx-midia (fotos 5 MB, resto 16 MB, tipos do WhatsApp)", () => {
  const MB = 1024 * 1024;
  assert.deepEqual(L.validarArquivo({ name: "a.jpg", type: "image/jpeg", size: 2 * MB }).tipo, "imagem");
  assert.equal(L.validarArquivo({ name: "a.jpg", type: "image/jpeg", size: 6 * MB }).erro, "midia_grande");
  assert.equal(L.validarArquivo({ name: "a.gif", type: "image/gif", size: 1000 }).erro, "midia_tipo");
  assert.equal(L.validarArquivo({ name: "a.svg", type: "image/svg+xml", size: 1000 }).erro, "midia_tipo", "SVG nunca");
  assert.equal(L.validarArquivo({ name: "v.mp4", type: "video/mp4", size: 15 * MB }).tipo, "video");
  assert.equal(L.validarArquivo({ name: "v.mp4", type: "video/mp4", size: 17 * MB }).erro, "midia_grande");
  assert.equal(L.validarArquivo({ name: "a.webm", type: "audio/webm", size: 1000 }).erro, "midia_tipo", "WebM não passa na Cloud API");
  assert.equal(L.validarArquivo({ name: "x.ogg", type: "audio/ogg", size: 1000 }).tipo, "audio");
  assert.equal(L.validarArquivo({ name: "r.pdf", type: "application/pdf", size: 1000 }).tipo, "documento");
  assert.equal(L.validarArquivo({ name: "p.xlsx", type: "", size: 1000 }).tipo, "documento", "tipo pela extensão");
  assert.equal(L.validarArquivo({ name: "z.zip", type: "application/zip", size: 1000 }).erro, "midia_tipo");
  assert.equal(L.validarArquivo({ name: "vazio.pdf", type: "application/pdf", size: 0 }).ok, false);
  assert.equal(L.tamanhoLegivel(1536), "1,5 KB");
  assert.equal(L.tamanhoLegivel(3 * MB), "3 MB");
});

await teste("modelos: contarParametros, preencherModelo, modeloDisponivel (marketing × opt-out)", () => {
  assert.equal(L.contarParametros("Olá, {{1}}! Sua consulta é {{2}} às {{3}}."), 3);
  assert.equal(L.contarParametros("sem parâmetro"), 0);
  assert.equal(L.preencherModelo("Olá, {{1}}! Dia {{2}}.", ["Ana"]), "Olá, Ana! Dia {{2}}.");
  assert.equal(L.modeloDisponivel({ status: "APPROVED", categoria: "UTILITY" }, { optin: false }).ok, true);
  assert.equal(L.modeloDisponivel({ status: "APPROVED", categoria: "MARKETING" }, { optin: false }).ok, false);
  assert.equal(L.modeloDisponivel({ status: "APPROVED", categoria: "MARKETING" }, { optin: null }).ok, true);
  assert.equal(L.modeloDisponivel({ status: "PENDING", categoria: "UTILITY" }).ok, false);
});

await teste("normalizarTelefone com \"+\"/\"00\" = número internacional completo (igual ao nx_cv_nova)", () => {
  assert.equal(L.normalizarTelefone("+1 415 555 1234"), "14155551234", "EUA/Canadá (11 dígitos) não ganha 55");
  assert.equal(L.normalizarTelefone("001 (415) 555-1234"), "14155551234");
  assert.equal(L.normalizarTelefone("0044 20 7946 0958"), "442079460958");
  assert.equal(L.normalizarTelefone("+351 912 345 678"), "351912345678");
  assert.equal(L.normalizarTelefone("+55 12 9830-3030"), "551298303030");
  assert.equal(L.normalizarTelefone("+12345"), null, "menos de 8 dígitos");
  assert.equal(L.normalizarTelefone("+1234567890123456"), null, "mais de 15 dígitos");
});

await teste("normalizarTelefone = nx_tel_normalizar(p, false)", () => {
  assert.equal(L.normalizarTelefone("(12) 99830-3030"), "5512998303030");
  assert.equal(L.normalizarTelefone("12 9830-3030"), "551298303030");
  assert.equal(L.normalizarTelefone("+55 12 99830-3030"), "5512998303030");
  assert.equal(L.normalizarTelefone("14155551234"), "5514155551234", "11 dígitos sem DDI viram BR (regra do banco)");
  assert.equal(L.normalizarTelefone("+1 415 555 1234 00"), "1415555123400");
  assert.equal(L.normalizarTelefone("9830"), null);
  assert.equal(L.normalizarTelefone(""), null);
});

await teste("formatarWhats: *negrito* _itálico_ ~riscado~ ```mono``` e links http(s) só", () => {
  assert.deepEqual(L.formatarWhats("Oi *Ana*, tudo _bem_?"), [
    { tipo: "texto", v: "Oi " }, { tipo: "negrito", v: "Ana" }, { tipo: "texto", v: ", tudo " }, { tipo: "italico", v: "bem" }, { tipo: "texto", v: "?" }]);
  assert.deepEqual(L.formatarWhats("veja https://exemplo.com/a?b=1."), [
    { tipo: "texto", v: "veja " }, { tipo: "link", v: "https://exemplo.com/a?b=1" }, { tipo: "texto", v: "." }]);
  assert.deepEqual(L.formatarWhats("javascript:alert(1)"), [{ tipo: "texto", v: "javascript:alert(1)" }], "só http(s) vira link");
  assert.deepEqual(L.formatarWhats("2*3*4"), [{ tipo: "texto", v: "2*3*4" }], "asterisco no meio da palavra não formata");
  assert.deepEqual(L.formatarWhats("~x~ ```y```").map(x => x.tipo), ["riscado", "texto", "mono"]);
  assert.deepEqual(L.formatarWhats(""), []);
});

await teste("pode(papel, min)", () => {
  assert.equal(L.pode("atendente", "atendente"), true);
  assert.equal(L.pode("leitura", "atendente"), false);
  assert.equal(L.pode("super", "admin"), true);
  assert.equal(L.pode(undefined, "leitura"), false);
});

await teste("P0-B validarHorario = regra do nx_cv_horario_normalizar (7 dias, ≤ 2 faixas, início < fim, sem sobrepor)", () => {
  assert.deepEqual(L.validarHorario(null), { ok: true, horario: null, erro: null });
  const r = L.validarHorario({ 1: [["08:00", "12:00"], ["13:30", "18:00"]], 6: [["08:00", "24:00"]] });
  assert.equal(r.ok, true);
  assert.equal(Object.keys(r.horario).length, 7);
  assert.deepEqual(r.horario[0], []);
  assert.equal(L.validarHorario({ 1: [["08:00", "12:00"], ["11:00", "13:00"]] }).ok, false, "sobreposição");
  assert.equal(L.validarHorario({ 2: [["18:00", "08:00"]] }).erro.dia, 2, "início depois do fim");
  assert.equal(L.validarHorario({ 7: [] }).ok, false, "dia 7");
  assert.equal(L.validarHorario({ 3: [["8:00", "12:00"]] }).ok, false, "HH:MM com 2 dígitos");
  assert.equal(L.validarHorario({ 3: [["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"]] }).ok, false, "3 faixas");
  assert.equal(L.validarHorario({ 3: [["08:00", "12:00"], ["12:00", "18:00"]] }).ok, true, "faixas encostadas valem");
});

await teste("P0-B resumoHorario agrupa dias iguais; null = 24 horas", () => {
  assert.equal(L.resumoHorario(null), "24 horas, todos os dias");
  assert.equal(L.resumoHorario(L.horarioPadrao()), "Seg a Sex 08:00–18:00 · Sáb 08:00–12:00 · Dom fechado");
  const t = {}; for (let d = 0; d < 7; d++) t[d] = [["09:00", "17:00"]];
  assert.equal(L.resumoHorario(t), "Todos os dias 09:00–17:00");
  assert.equal(L.resumoHorario({ 0: [], 1: [["08:00", "12:00"], ["14:00", "18:00"]], 2: [], 3: [], 4: [], 5: [], 6: [] }),
    "Seg 08:00–12:00 e 14:00–18:00 · Ter a Dom fechado");
});

await teste("P0-B horarioAberto = nx_horario_aberto no fuso de SP (fim exclusivo)", () => {
  const hp = L.horarioPadrao();
  assert.equal(L.horarioAberto(hp, "2026-09-28T10:00:00-03:00"), true, "segunda 10h");
  assert.equal(L.horarioAberto(hp, "2026-09-28T18:00:00-03:00"), false, "18h em ponto já fechou");
  assert.equal(L.horarioAberto(hp, "2026-09-28T02:00:00Z"), false, "02h UTC de segunda = domingo 23h em SP");
  assert.equal(L.horarioAberto(hp, "2026-10-03T11:59:00-03:00"), true, "sábado 11h59");
  assert.equal(L.horarioAberto(null, "2026-09-27T03:00:00-03:00"), true, "24 h");
});

await teste("P0-B contarIA soma os 6 textos aparados, incluindo memória aprovada (teto 15.000)", () => {
  assert.equal(L.contarIA({ sobre: "  abc ", servicos: "12345", memoria_aprovada: " xy ", tom: "formal", extra: "zzzz" }), 10);
  assert.equal(L.contarIA(null), 0);
  assert.equal(L.IA_MAX, 15000);
});

await teste("P0-B partesDestaque marca o termo sem acento/caixa (sem HTML)", () => {
  assert.deepEqual(L.partesDestaque("Quero o Clareamento já", "clareamento"),
    [{ t: "Quero o ", marca: false }, { t: "Clareamento", marca: true }, { t: " já", marca: false }]);
  assert.deepEqual(L.partesDestaque("Avaliação e avaliacao", "AVALIACAO").filter(p => p.marca).map(p => p.t), ["Avaliação", "avaliacao"]);
  assert.deepEqual(L.partesDestaque("nada", ""), [{ t: "nada", marca: false }]);
});

/* ============================================================ (b) estáticos */
console.log("\n(b) arquivos da F5");
const ARQS_JS = ["conversas.js", "cv-lista.js", "cv-chat.js", "cv-composer.js", "cv-lateral.js", "cv-config.js", "cv-logica.js"];
const ARQS = [...ARQS_JS, "conversas.css"];

await teste("todos os arquivos da F5 existem", () => {
  for (const f of ARQS) assert.ok(existsSync(join(APP, f)), `falta web/app/${f}`);
});

await teste("JS: node --check, nenhum import estático, import() sempre com ?v=", () => {
  for (const f of ARQS_JS) {
    execFileSync(process.execPath, ["--check", join(APP, f)], { stdio: "pipe" });
    const s = ler(f);
    assert.ok(!/^\s*import\s[^(]/m.test(s), `${f}: import estático`);
    for (const m of s.matchAll(/import\(\s*`([^`]*)`\s*\)/g)) assert.ok(m[1].includes("?v="), `${f}: import() sem ?v= → ${m[1]}`);
    assert.ok(!/import\(\s*["']/.test(s), `${f}: import() com string fixa (sem ?v=)`);
  }
});

await teste("JS: sem innerHTML/outerHTML/insertAdjacentHTML, sem on*= em HTML, sem hex de cor", () => {
  for (const f of ARQS_JS) {
    const s = ler(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/.test(s), `${f}: HTML cru`);
    assert.ok(!/<[a-z][^>]*\son[a-z]+\s*=/i.test(s), `${f}: on*= inline`);
    assert.ok(!/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-zA-Z_-])/.test(s.replace(/href:\s*`#[^`]*`|"#\/[^"]*"|'#\/[^']*'|`#\/[^`]*`|"#i-[^"]*"|`#i-[^`]*`/g, "")), `${f}: hex de cor no JS`);
  }
});

await teste("módulos não carregam ui.js/api.js/app.js/tema.js (recebem pelo ctx)", () => {
  for (const f of ARQS_JS) {
    const s = ler(f);
    assert.ok(!/import\([^)]*\b(ui|api|app|tema)\.js/.test(s), `${f} importa arquivo do shell`);
  }
});

await teste("CSS: sem hex fora de :root, sem 1fr solto, foco visível e reduced-motion respeitado pelos tokens", () => {
  const s = ler("conversas.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(s), "hex no conversas.css");
  assert.ok(!/(^|[^(,\s])\s*\b1fr\b/.test(s.replace(/minmax\(0,\s*1fr\)/g, "")), "1fr solto");
  assert.ok(!/\brgba?\(\s*\d/.test(s), "rgb() fixo no conversas.css (use tokens)");
  assert.ok(!/ease-in[^-]/.test(s), "nunca ease-in");
  assert.ok(!/\b\d+(\.\d+)?m?s\s+(ease|linear|cubic)/.test(s), "duração solta fora dos tokens");
});

await teste("Filtros da inbox ativos ficam visíveis, cada um pode ser removido e há limpeza em lote", () => {
  const s = ler("cv-lista.js");
  assert.match(s, /class: "cvl-filtros-ativos"/);
  assert.match(s, /"aria-label": `Remover filtro \$\{item\.rotulo\}`/);
  assert.match(s, /mudarLista\(\{ filtro: novo \}\)/);
  assert.match(s, /"Limpar filtros"/);
  for (const chave of ["departamento_id", "canal_id", "atendente", "etiquetas", "nao_lidas"]) assert.ok(s.includes(chave), `filtro ${chave}`);
});

await teste("janela baixa: a central usa a altura disponível sem cortar Enviar", () => {
  const js = ler("conversas.js"), css = ler("conversas.css");
  assert.match(js, /const onResize = \(\) => \{\s*mostrarPainel\(A\.painel\);/,
    "ao mudar o tamanho da janela, o estado de chat em tela cheia acompanha o breakpoint");
  assert.match(js, /Math\.max\(0,\s*Math\.floor\(alturaTela\s*-\s*Math\.max\(0,\s*topo\)/,
    "a altura do chat usa o espaço real abaixo do cabeçalho e das faixas");
  assert.match(css, /@media\s*\(max-height:\s*600px\)\s*\{\s*\.cv\s*\{\s*min-height:\s*0/,
    "em janelas baixas, a altura mínima não empurra o compositor para fora da tela");
  assert.match(css, /\.cvx-enviar\s*\{[^}]*height:\s*44px/,
    "o botão Enviar mantém alvo acionável de 44 px");
});

await teste("seções de configuração com os ids fixos do §7.2", async () => {
  const s = ler("cv-config.js");
  for (const id of ["numeros", "respostas", "departamentos", "atendimento", "ia"]) assert.ok(new RegExp(`id:\\s*"${id}"`).test(s), `seção ${id}`);
  assert.ok(/export const secoesConfig/.test(s));
});

await teste("canal CodeWords: «Abrir Automações» pergunta antes de descartar o que não foi salvo (e depois de salvar não pergunta)", () => {
  const s = ler("cv-config.js");
  assert.match(s, /const formAlterado = \(\) => formInicial !== null && JSON\.stringify\(ui\.lerForm\(form\)\) !== formInicial/);
  assert.match(s, /if \(formAlterado\(\) && !await ui\.confirmar\(\{ titulo: "Sair sem salvar\?"[\s\S]{0,200}perigo: true \}\)\) return;\s*if \(modalApi\) modalApi\.fechar\(null\);\s*ctx\.navegar\("#\/automacoes"\)/,
    "a confirmação vem ANTES de fechar o modal e navegar");
  assert.match(s, /formInicial = JSON\.stringify\(ui\.lerForm\(form\)\);\s*\/\/ salvo: nada mais a perder/, "salvar zera a alteração pendente");
});

await teste("conversas.js exporta montar/desmontar", () => {
  const s = ler("conversas.js");
  assert.ok(/export async function montar\(ctx\)/.test(s));
  assert.ok(/export function desmontar\(\)/.test(s));
});

await teste("SQL: nenhuma função definida nos DOIS arquivos (e / e_b) — reaplicar um só nunca desfaz o outro", () => {
  const MIG = join(AQUI, "..", "supabase", "migrations");
  const nomes = f => new Set([...readFileSync(join(MIG, f), "utf8").matchAll(/create or replace function public\.(\w+)\(/g)].map(m => m[1]));
  const e = nomes("20260928e_conversas.sql"), eb = nomes("20260928e_conversas_b.sql");
  const dup = [...e].filter(n => eb.has(n));
  assert.deepEqual(dup, [], `definidas nos dois arquivos: ${dup.join(", ")}`);
  assert.ok(eb.has("nx_cv_base") && !e.has("nx_cv_base"), "nx_cv_base (com config) só no e_b");
  for (const f of ["nx_cv_listar", "nx_cv_nova", "nx_canal_salvar", "nx_cv_distribuir"]) assert.ok(e.has(f), `${f} no arquivo e`);
});

/* ============================================================ M34 — um botão primário por vez, cabeçalho de uma linha, abas numa linha */
console.log("\n(c) M34 — cabeçalho do chat e abas da lista");

await teste("M34: estadoCabecalho — no máximo UM primário em qualquer estado e Resolver segue o dono", () => {
  const EU = "u1";
  const ia = (o = {}) => ({ disponivel: true, ia_ligada: true, pausada: false, ...o });
  const casos = [];
  for (const status of ["aberta", "pendente", "resolvida"]) for (const dono of [null, EU, "u2"]) for (const cw of [false, true]) for (const estIA of [null, ia(), ia({ pausada: true }), { disponivel: false }, ia({ ia_ligada: false })]) for (const pode of [true, false])
    casos.push({ conv: { status, atribuida_a: dono }, eu: EU, pode, codeWords: cw, ia: estIA });
  assert.equal(casos.length, 3 * 3 * 2 * 5 * 2);
  for (const c of casos) {
    const e = L.estadoCabecalho(c);
    const primarios = [e.estilo === "prim" ? e.primaria : null].filter(Boolean);
    assert.ok(primarios.length <= 1, `≤ 1 primário: ${JSON.stringify(c)}`);
    if (!c.pode) assert.equal(e.primaria, null, "sem permissão: nenhum botão de ação");
  }
  // sem dono → Assumir primário; Resolver vira ícone neutro
  let e = L.estadoCabecalho({ conv: { status: "aberta", atribuida_a: null }, eu: EU, pode: true });
  assert.deepEqual([e.primaria, e.estilo, e.resolverIcone], ["assumir", "prim", true]);
  // minha → Resolver em contorno (nenhum primário)
  e = L.estadoCabecalho({ conv: { status: "aberta", atribuida_a: EU }, eu: EU, pode: true });
  assert.deepEqual([e.primaria, e.estilo, e.resolverIcone], ["resolver", "contorno", false]);
  // IA atendendo (CodeWords): Assumir (pausa a IA) e o resto no ⋮ — mesmo com a conversa já minha
  for (const dono of [null, EU, "u2"]) {
    e = L.estadoCabecalho({ conv: { status: "aberta", atribuida_a: dono }, eu: EU, pode: true, codeWords: true, ia: ia() });
    assert.deepEqual([e.primaria, e.estilo, e.resolverNoMenu], ["assumir_ia", "prim", true], `IA atendendo, dono ${dono}`);
  }
  // IA pausada: volta a valer a regra do dono e o "Devolver para a IA" entra no ⋮
  e = L.estadoCabecalho({ conv: { status: "aberta", atribuida_a: EU }, eu: EU, pode: true, codeWords: true, ia: ia({ pausada: true }) });
  assert.deepEqual([e.primaria, e.devolverIA], ["resolver", true]);
  // IA fora do ar ou desligada não esconde o Assumir comum
  e = L.estadoCabecalho({ conv: { status: "aberta", atribuida_a: null }, eu: EU, pode: true, codeWords: true, ia: { disponivel: false } });
  assert.equal(e.primaria, "assumir");
  // resolvida → só Reabrir, em secundário
  e = L.estadoCabecalho({ conv: { status: "resolvida", atribuida_a: EU }, eu: EU, pode: true });
  assert.deepEqual([e.primaria, e.estilo], ["reabrir", "sec"]);
});

await teste("M34: janelaCurta e abasVisiveis (Minhas some para leitura; Ocultas só do supervisor; o resto vai para o menu)", () => {
  assert.equal(L.janelaCurta(L.janela({ ultima_entrada_em: new Date(AGORA.getTime() - 6 * 3600000).toISOString() }, AGORA)), "Janela 18 h");
  assert.equal(L.janelaCurta(L.janela({ ultima_entrada_em: new Date(AGORA.getTime() - (24 * 3600000 - 25 * 60000)).toISOString() }, AGORA)), "Janela 25 min");
  assert.equal(L.janelaCurta(L.janela({}, AGORA)), "Janela fechada");
  assert.deepEqual(L.ABAS_FIXAS, ["minhas", "sem_dono", "aguardando"]);
  const atendente = L.abasVisiveis("atendente", true);
  assert.deepEqual(atendente.fixas.map(a => a.id), ["minhas", "sem_dono", "aguardando"]);
  assert.deepEqual(atendente.mais.map(a => a.id), ["abertas", "pendentes", "resolvidas"], "Ocultas só para supervisor");
  assert.deepEqual(L.abasVisiveis("supervisor", true).mais.map(a => a.id), ["abertas", "pendentes", "resolvidas", "ocultas"]);
  assert.deepEqual(L.abasVisiveis("leitura", false).fixas.map(a => a.id), ["sem_dono", "aguardando"], "leitura não tem Minhas");
  const todas = [...atendente.fixas, ...atendente.mais].map(a => a.id);
  assert.equal(new Set(todas).size, todas.length, "nenhuma aba repetida entre fixas e menu");
});

await teste("M34: o cabeçalho usa um primário por estado, uma linha no celular e a lista usa 1 linha de abas + pontos de cor", () => {
  const chat = ler("cv-chat.js"), lista = ler("cv-lista.js"), comp = ler("cv-composer.js"), css = ler("conversas.css");
  assert.match(chat, /L\.estadoCabecalho\(\{ conv, eu, pode, codeWords, ia \}\)/, "cabeçalho decidido pela função pura");
  assert.doesNotMatch(chat, /"bt bt-prim bt-p"\s*\}[^)]*"Resolver"|class: "bt bt-prim bt-p" \}, ui\.icone\("check"\)/, "Resolver nunca é primário");
  assert.match(chat, /class: "bt bt-p bt-resolver"/, "Resolver (minha) em contorno");
  assert.match(css, /\.bt-resolver \{[^}]*border-color: var\(--c-ok\)/, "contorno em --c-ok");
  assert.match(css, /@media \(max-width: 760px\) \{\s*\/\* M34[^*]*\*\/\s*\.cvc-cab \{ display: flex;/, "cabeçalho de uma linha no celular");
  assert.doesNotMatch(css, /grid-template-areas: "voltar contato" "acoes acoes"/, "sem a segunda linha de ações");
  assert.match(lista, /ui\.segmentado\(\{ opcoes: fixas\.map/, "abas pelo segmentado");
  assert.match(lista, /class: "cvl-dot cvl-dot-etapa"/, "etapa vira ponto de cor");
  assert.doesNotMatch(lista, /cv-etapa cvl-etapa/, "nenhuma pílula de etapa na lista (era cortada com reticências)");
  assert.match(css, /\.cvl-dot \{[^}]*background: var\(--cor/, "ponto de cor pelo token --cor");
  // o aviso (navegador que não grava áudio) não ocupa a conversa: só aparece ao tocar no ⓘ; o clipe vale nos dois canais
  assert.match(comp, /const btInfo = h\("button"[^;]*"aria-expanded": "false"/, "botão ⓘ ao lado do clipe");
  assert.match(comp, /capInfo\.hidden = !temAviso \|\| !infoAberta/, "faixa escondida até a pessoa pedir");
  assert.match(comp, /const temAviso = !gravavel;/, "o ⓘ só existe quando o navegador não grava (o CodeWords deixou de ser «só texto»)");
  assert.match(comp, /btClipe\.setAttribute\("aria-disabled", String\(modoNota \|\| s !== "ok"\)\)/, "o clipe não fica bloqueado por ser CodeWords");
});

/* ============================================================ M37 — fotos do celular sem rejeição */
console.log("\n(d) M37 — fotos: comprimir no aparelho e mostrar o progresso");

await teste("M37: dimensoesFoto — lado maior 1600, nunca amplia, mantém proporção (retrato e paisagem)", () => {
  assert.deepEqual(L.dimensoesFoto(4032, 3024), { w: 1600, h: 1200, mudou: true }, "12 MP paisagem");
  assert.deepEqual(L.dimensoesFoto(3024, 4032), { w: 1200, h: 1600, mudou: true }, "12 MP retrato");
  assert.deepEqual(L.dimensoesFoto(1600, 900), { w: 1600, h: 900, mudou: false }, "já cabe");
  assert.deepEqual(L.dimensoesFoto(800, 600), { w: 800, h: 600, mudou: false }, "pequena não é ampliada");
  assert.deepEqual(L.dimensoesFoto(1601, 1), { w: 1600, h: 1, mudou: true }, "faixa fina nunca vira 0 px");
  assert.deepEqual(L.dimensoesFoto(0, 0), { w: 1, h: 1, mudou: false });
  assert.deepEqual(L.dimensoesFoto(8000, 6000, 1000), { w: 1000, h: 750, mudou: true }, "lado máximo configurável");
});

await teste("M37: planoFoto decide manter ou otimizar (HEIC sempre otimiza; foto pequena segue como veio)", () => {
  const KB = 1024, MB = KB * 1024;
  assert.equal(L.planoFoto({ tipo: "image/jpeg", bytes: 7.2 * MB, largura: 4032, altura: 3024 }).acao, "otimizar");
  assert.equal(L.planoFoto({ tipo: "image/jpeg", bytes: 200 * KB, largura: 1200, altura: 800 }).acao, "manter", "pequena e dentro de 1600 px");
  assert.equal(L.planoFoto({ tipo: "image/jpeg", bytes: 200 * KB, largura: 3000, altura: 2000 }).acao, "otimizar", "leve mas grande demais em px");
  assert.equal(L.planoFoto({ tipo: "image/png", bytes: 900 * KB, largura: 1000, altura: 1000 }).acao, "otimizar", "PNG de 900 KB vira JPEG");
  assert.equal(L.planoFoto({ tipo: "image/heic", bytes: 100 * KB, largura: 800, altura: 600 }).acao, "otimizar", "o WhatsApp não aceita HEIC");
  assert.deepEqual([L.planoFoto({ tipo: "image/jpeg", bytes: 2 * MB, largura: 4000, altura: 3000 }).w, L.planoFoto({ tipo: "image/jpeg", bytes: 2 * MB, largura: 4000, altura: 3000 }).h], [1600, 1200]);
});

await teste("M37: ehFoto, qualidades do JPEG e frases do resumo", () => {
  assert.equal(L.ehFoto({ name: "a.jpg", type: "image/jpeg" }), true);
  assert.equal(L.ehFoto({ name: "a.HEIC", type: "" }), true, "HEIC sem type vem da extensão");
  assert.equal(L.ehFoto({ name: "a.pdf", type: "application/pdf" }), false);
  assert.equal(L.ehFoto({ name: "v.mp4", type: "video/mp4" }), false);
  assert.deepEqual([...L.FOTO_QUALIDADES], [0.82, 0.72, 0.62], "JPEG 0,82 primeiro");
  assert.equal(L.proximaQualidadeFoto(300 * 1024, 0), null, "dentro do alvo (500 KB): para");
  assert.equal(L.proximaQualidadeFoto(900 * 1024, 0), 0.72);
  assert.equal(L.proximaQualidadeFoto(900 * 1024, 1), 0.62);
  assert.equal(L.proximaQualidadeFoto(900 * 1024, 2), null, "acabaram as tentativas");
  assert.equal(L.resumoOtimizacao(7.2 * 1048576, 380 * 1024), "Foto otimizada de 7,2 MB para 380 KB");
  assert.equal(L.resumoOtimizacao(100, 200), "", "se não diminuiu, nada a dizer");
  assert.equal(L.nomeFotoOtimizada("IMG_2231.HEIC"), "IMG_2231.jpg");
  assert.equal(L.nomeFotoOtimizada(""), "foto.jpg");
});

await teste("M37: a foto otimizada passa na regra de 5 MB e o original de 7 MB não; vídeo e documento seguem em 16 MB", () => {
  const MB = 1048576;
  assert.equal(L.validarArquivo({ name: "a.jpg", type: "image/jpeg", size: 7.2 * MB }).erro, "midia_grande");
  assert.equal(L.validarArquivo({ name: "a.jpg", type: "image/jpeg", size: 380 * 1024 }).ok, true);
  assert.equal(L.validarArquivo({ name: "a.heic", type: "image/heic", size: 3 * MB }).ok, false, "HEIC só segue depois de virar JPEG");
  assert.equal(L.validarArquivo({ name: "v.mp4", type: "video/mp4", size: 15 * MB }).ok, true);
});

await teste("M37: progressoEnvio (0–99 até acabar) e mensagem de falha do envio", () => {
  assert.deepEqual(L.progressoEnvio(620, 1000), { pct: 62, texto: "62 %" });
  assert.deepEqual(L.progressoEnvio(1000, 1000), { pct: 99, texto: "99 %" }, "100 só quando o servidor confirma");
  assert.deepEqual(L.progressoEnvio(0, 0), { pct: 0, texto: "0 %" });
  assert.deepEqual(L.progressoEnvio(-5, 100), { pct: 0, texto: "0 %" });
  assert.match(L.dicaErroEnvio("upload_falhou"), /Tentar de novo/);
});

await teste("M37: o compositor otimiza antes de validar, mostra o ganho e oferece o original; o upload usa XMLHttpRequest com progresso e cancelamento", () => {
  const comp = ler("cv-composer.js"), conv = ler("conversas.js"), chat = ler("cv-chat.js");
  assert.match(comp, /createImageBitmap\(f, \{ imageOrientation: "from-image" \}\)/, "EXIF corrigido");
  assert.match(comp, /L\.planoFoto\(/);
  assert.match(comp, /L\.FOTO_QUALIDADES\[t\]/);
  assert.match(comp, /otim = await otimizarFoto\(f\);[\s\S]{0,900}L\.validarArquivo\(escolhidoInicial, \{ provedor: provedorCanal\(\) \}\)/, "otimiza ANTES de validar o limite de 5 MB (e valida pelo canal da conversa)");
  assert.match(comp, /L\.resumoOtimizacao\(f\.size, otim\.arquivo\.size\)/, "resumo 'de X para Y'");
  assert.match(comp, /Enviar a original/, "opção de enviar o original");
  assert.match(conv, /new XMLHttpRequest\(\)/);
  assert.match(conv, /x\.upload\.addEventListener\("progress"/);
  assert.match(conv, /x\.addEventListener\("abort"/);
  assert.doesNotMatch(conv, /fetch\(s\.upload_url/, "o PUT não é mais fetch (sem progresso)");
  assert.match(conv, /if \(!o\.path\) \{/, "tentar de novo não sobe o arquivo outra vez quando ele já subiu");
  assert.match(chat, /role: "progressbar"/);
  assert.match(chat, /A\.acoes\.cancelarEnvio\(m\)/);
});

/* ============================================================ M36 — nada se perde no chat */
console.log("\n(e) M36 — rascunho persistente, fila de saída e envio idempotente");

await teste("M36: novoClientRef — formato aceito pelo servidor, único por intenção, sempre ≤ 80 caracteres", () => {
  const REF = /^[A-Za-z0-9:_.-]{8,80}$/;
  assert.match(L.novoClientRef("5c1b0d3e-0000-4000-8000-000000000001"), REF);
  assert.equal(L.novoClientRef("5c1b0d3e-0000-4000-8000-000000000001"), "orbita:5c1b0d3e-0000-4000-8000-000000000001");
  assert.match(L.novoClientRef(), REF, "sem crypto.randomUUID também gera um ref válido");
  assert.notEqual(L.novoClientRef(), L.novoClientRef());
  assert.ok(L.novoClientRef("x".repeat(200)).length <= 80);
  assert.match(L.novoClientRef("com espaço;e/barra"), REF, "caracteres fora do formato são tirados");
});

await teste("M36: proximaTentativaFila — 20 s, 40 s, 80 s, 160 s e 5 min daí em diante (com jitter opcional)", () => {
  const t0 = 1_000_000;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(n => L.proximaTentativaFila(n, t0) - t0), [20000, 40000, 80000, 160000, 300000, 300000, 300000]);
  assert.equal(L.proximaTentativaFila(0, t0, 1500) - t0, 21500);
  assert.equal(L.proximaTentativaFila(-3, t0) - t0, 20000);
});

await teste("M36: classificarFalhaEnvio — internet que caiu espera na fila, prazo estourado repete com o MESMO ref, regra de negócio vira «Não enviada» com o motivo", () => {
  const e = (codigo, extra = {}) => Object.assign(new Error(codigo), { codigo, ...extra });
  let c = L.classificarFalhaEnvio(e("sem_conexao"));
  assert.deepEqual([c.tipo, c.subtipo], ["rede", "sem_conexao"]);
  for (const cod of ["tempo_rede", "tempo_esgotado"]) assert.deepEqual([L.classificarFalhaEnvio(e(cod)).tipo, L.classificarFalhaEnvio(e(cod)).subtipo], ["rede", "em_voo"], cod);
  assert.equal(L.classificarFalhaEnvio(e("http_504", { status: 504 })).subtipo, "em_voo");
  for (const cod of ["servico_indisponivel", "http_503", "http_502", "http_429", "http_408"]) assert.deepEqual([L.classificarFalhaEnvio(e(cod)).tipo, L.classificarFalhaEnvio(e(cod)).subtipo], ["rede", "servidor"], cod);
  assert.equal(L.classificarFalhaEnvio(e("sessao_invalida", { status: 401 })).tipo, "sessao", "sessão caída: a fila espera o login");
  c = L.classificarFalhaEnvio(e("fora_da_janela"));
  assert.equal(c.tipo, "definitiva"); assert.match(c.motivo, /24 h.*modelo aprovado/);
  assert.equal(L.classificarFalhaEnvio(e("conversa_resolvida")).tipo, "definitiva");
  assert.equal(L.classificarFalhaEnvio(e("dados_invalidos")).tipo, "definitiva");
  // a Graph recusou e o servidor GRAVOU a mensagem como "falhou": é definitiva e traz a mensagem salva
  c = L.classificarFalhaEnvio(e("envio_falhou", { resposta: { ok: false, mensagem: { id: 9, status: "falhou" } } }));
  assert.equal(c.tipo, "definitiva"); assert.equal(c.salva, true);
  // 502 que o servidor marcou como "pode ter saído": definitiva-ambígua (não reenvia sozinha)
  c = L.classificarFalhaEnvio(e("envio_falhou", { status: 502, resposta: { ok: false, ambigua: true } }));
  assert.equal(c.ambigua, true); assert.equal(c.tipo, "definitiva");
  assert.equal(L.classificarFalhaEnvio(null).tipo, "definitiva", "erro sem forma conhecida não repete para sempre");
  // 409 do nx-enviar: outro pedido com o MESMO client_ref ainda está enviando — não é falha, não tem motivo na tela, tenta de novo depois
  c = L.classificarFalhaEnvio(e("envio_em_andamento", { status: 409, resposta: { ok: false, erro: "envio_em_andamento" } }));
  assert.deepEqual([c.tipo, c.subtipo, c.motivo], ["rede", "em_andamento", null]);
  // reserva antiga sem mensagem: 502 marcado como ambíguo e SEM mensagem gravada — pode ter saído, nunca reenviar sozinho
  c = L.classificarFalhaEnvio(e("envio_falhou", { status: 502, resposta: { ok: false, erro: "envio_falhou", ambigua: true } }));
  assert.deepEqual([c.tipo, c.ambigua, c.salva], ["definitiva", true, false]);
});

await teste("M36: filaDevidos (ordem em que a pessoa mandou, só o que já venceu o backoff) e filaDestino (outra conta/empresa fica intacta; só o vencido do próprio escopo sai)", () => {
  const AG = 10_000_000;
  const itens = [
    { id: "c", estado: "fila", criada_em: 300, proxima_em: 0 },
    { id: "a", estado: "incerto", criada_em: 100, proxima_em: AG - 1 },
    { id: "b", estado: "fila", criada_em: 200, proxima_em: AG + 5000 },
    { id: "x", estado: "falhou", criada_em: 50, proxima_em: 0 },
    { id: "y", estado: "enviando", criada_em: 60, proxima_em: 0 },
  ];
  assert.deepEqual(L.filaDevidos(itens, AG).map(i => i.id), ["a", "c"], "falhou e enviando nunca saem sozinhos; b ainda espera");
  assert.deepEqual(L.filaDevidos(itens, AG, { forcar: true }).map(i => i.id), ["a", "b", "c"], "a internet voltou: ignora o backoff");
  assert.deepEqual(L.filaDevidos([{ id: "w", estado: "andamento", criada_em: 1, proxima_em: AG - 1 }, { id: "z", estado: "ambigua", criada_em: 2, proxima_em: 0 }], AG).map(i => i.id), ["w"],
    "«em andamento» (409) volta a perguntar; «pode ter saído» nunca sai sozinha");
  const ok = { id: "r", conta: "u1", cliente: "c1", criada_em: AG - 1000 };
  assert.equal(L.filaDestino(ok, { conta: "u1", cliente: "c1", agora: AG }), "usar");
  assert.equal(L.filaDestino(ok, { conta: "u2", cliente: "c1", agora: AG }), "pular", "item de outra conta: fica onde está");
  assert.equal(L.filaDestino(ok, { conta: "u1", cliente: "c2", agora: AG }), "pular", "item de outra empresa da mesma conta: NUNCA é apagado");
  assert.equal(L.filaDestino({ ...ok, criada_em: AG - L.FILA_TTL_MS - 1 }, { conta: "u1", cliente: "c1", agora: AG }), "apagar", "mais de 7 dias, do próprio escopo");
  assert.equal(L.filaDestino({ ...ok, criada_em: AG - L.FILA_TTL_MS - 1 }, { conta: "u1", cliente: "c2", agora: AG }), "pular", "vencido de OUTRA empresa: quem apaga é a sessão dela");
  assert.equal(L.filaDestino({ ...ok, criada_em: AG - L.FILA_TTL_MS - 1 }, { conta: "u9", cliente: "c1", agora: AG }), "pular", "vencido de OUTRA conta também fica");
  assert.equal(L.filaDestino(null, {}), "pular");
  assert.equal(L.filaDestino(ok, {}), "pular", "sem escopo conhecido não se mexe em nada");
  assert.equal(typeof L.filaDescartavel, "undefined", "a regra antiga (que apagava o item de outra empresa) saiu");
});

await teste("M36: textoRascunhoLista — uma linha, até 80 caracteres, sem quebras", () => {
  assert.equal(L.textoRascunhoLista("  Oi,\n  tudo   bem?  "), "Oi, tudo bem?");
  assert.equal(L.textoRascunhoLista(""), "");
  assert.equal(L.textoRascunhoLista(null), "");
  const longo = L.textoRascunhoLista("a".repeat(200));
  assert.equal(longo.length, 80); assert.ok(longo.endsWith("…"));
});

await teste("M36: o compositor liga o rascunho por conversa (e a nota à parte), só apaga depois de o envio estar GUARDADO e devolve o texto cancelado", () => {
  const comp = ler("cv-composer.js"), conv = ler("conversas.js"), lista = ler("cv-lista.js");
assert.match(comp, /r\.ligar\(ta, `conversa:\$\{idDoCampo\}\$\{modoNota \? ":nota" : ""\}`, \{ seloEm: seloRasc \}\)/, "chave pela conversa DO CAMPO; nota com rascunho próprio");
  assert.match(comp, /function apagarRascunho\(\) \{ if \(rasc && !ta\.value\.trim\(\)\)/, "não apaga o que a pessoa já digitou depois");
  assert.match(comp, /const r = await A\.acoes\.enviar\(\{ tipo: "texto", texto, respondeA: citada \}\);\s*if \(r && r\.persistido !== false\) apagarRascunho\(\)/, "o rascunho sai depois de o item estar na fila");
  assert.match(comp, /devolverTexto\(texto\)/, "Cancelar na fila devolve o texto ao campo");
  assert.match(comp, /rasc\.apagar\(\); if \(typeof rasc\.parar === "function"\) rasc\.parar\(\)/, "alternar nota/mensagem move o rascunho");
  assert.match(lista, /L\.textoRascunhoLista\(A\.acoes\.rascunhoDe\(c\.id\)\)/);
  assert.match(lista, /h\("em", null, "Rascunho: "\)/, "\"Rascunho:\" em itálico na linha da lista");
  assert.match(conv, /function rascunhoDe\(id\)/);
});

await teste("M36: o texto vai pela fila (IndexedDB antes do servidor, client_ref por intenção, backoff, online/pulso/20 s) e a falha definitiva guarda o texto", () => {
  const conv = ler("conversas.js"), chat = ler("cv-chat.js");
  assert.match(conv, /indexedDB\.open\(DB_FILA, 1\)/);
  assert.match(conv, /(?:const|let) persistido = await filaSalvar\(it\);[\s\S]{0,1400}transmitir\(it\);\s*\/\/ sem await/, "grava na fila ANTES de transmitir, sem esperar o servidor; o trecho offline também pode atualizar o resultado da persistência");
  assert.match(conv, /acao: "texto", conversa: it\.conversa, texto: it\.texto, client_ref: it\.id/, "o MESMO client_ref em toda repetição do item");
  assert.match(conv, /window\.addEventListener\("orbita:online", aoOnline\)/);
  assert.match(conv, /A\.ctx\.rede\.aoVoltar\(\(\) => esvaziarFila\(\{ forcar: true \}\)\)/);
  assert.match(conv, /if \(A\.fila\.itens\.size\) esvaziarFila\(\);\s*clearTimeout\(_pulsoT\)/, "1º pulso bom esvazia a fila");
  assert.match(conv, /setInterval\(\(\) => \{ esvaziarFila\(\); \}, 20000\)/, "e a cada 20 s");
  assert.match(conv, /if \(await transmitir\(it\) === "rede"\) break;/, "na 1ª falha de rede para (a ordem importa)");
assert.match(conv, /const p = L\.aposFalhaFila\(it, c, \{[^}]*textoErro: ui\.mensagemErro\(e\) \}\);\s*Object\.assign\(it, p\.campos\);[\s\S]{0,260}await filaSalvar\(it\); atualizarBolha\(it\);/, "falha: a regra pura decide, o item é guardado e a bolha mostra o motivo");
  assert.match(conv, /ctx\.naoAtualizar\(\(\) => filaPendentes\(\) > 0\)|A\.ctx\.naoAtualizar\(\(\) => filaPendentes\(\) > 0\)/, "fila pendente segura a atualização automática do app");
assert.match(conv, /const destino = A\.L\.filaDestino\(it, \{ conta, cliente, agora \}\);\s*if \(destino === "pular"\) continue;/, "item de outra conta ou empresa é só pulado");
  assert.match(conv, /if \(destino === "apagar"\) \{ if \(fila\.db\) reqIdb\(lojaFila\(fila\.db, "readwrite"\)\.delete\(it\.id\)\)/, "só o vencido do próprio escopo é apagado");
  assert.equal((conv.match(/\.delete\(it\.id\)\)/g) || []).length, 1, "nenhum outro delete na leitura da fila");
  assert.match(chat, /L\.textoFila\(\{ estado: m\.filaEstado, motivo: m\.erro, proxima: m\.filaProxima \}\)/, "a bolha da fila diz o motivo real e a próxima tentativa");
  assert.match(ler("cv-logica.js"), /Na fila · envia quando a internet voltar/);
  assert.match(chat, /A\.acoes\.enviarAgora\(m\)/); assert.match(chat, /A\.acoes\.cancelarFila\(m\)/);
  assert.match(chat, /novo\.classList\.add\("entra"\)/, "mensagem nova entra com .entra (M10)");
});

/* ============================================================ R119 (revisão) — nada sai em dobro, nada vai para o cliente errado, nada some sem aviso */
console.log("\n(e2) R119 — fila sem envio em dobro, rascunho na conversa certa, falha com aviso");

await teste("R119 fila: depois de um pedido sair, o MESMO item só é retransmitido 90 s depois — nem com a internet voltando (forcar)", () => {
  const T = 50_000_000;
  assert.equal(L.FILA_ESPERA_REENVIO_MS, 90000);
  const it = { id: "a", estado: "incerto", criada_em: T - 5000, proxima_em: 0, enviada_em: T - 1000 };
  assert.equal(L.esperaReenvioFila(it, T), 89000);
  assert.equal(L.esperaReenvioFila(it, T + 89000), 0);
  assert.equal(L.esperaReenvioFila({ ...it, enviada_em: 0 }, T), 0, "item que nunca foi enviado (estava offline) sai na hora");
  assert.deepEqual(L.filaDevidos([it], T).map(i => i.id), [], "recarregou a página 1 s depois de enviar: não repete");
  assert.deepEqual(L.filaDevidos([it], T, { forcar: true }).map(i => i.id), [], "a internet voltou: também não");
  assert.deepEqual(L.filaDevidos([it], T + 88999, { forcar: true }).map(i => i.id), [], "1 ms antes de completar os 90 s");
  assert.deepEqual(L.filaDevidos([it], T + 90000 - 1000).map(i => i.id), ["a"], "90 s depois do pedido, sai (com o MESMO client_ref)");
  assert.deepEqual(L.filaDevidos([{ ...it, enviada_em: 0 }], T, { forcar: true }).map(i => i.id), ["a"]);
  assert.equal(L.proximaSaidaFila({ proxima_em: T + 20000, enviada_em: T }), T + 90000, "o que vale é o maior entre o backoff e os 90 s");
  assert.equal(L.proximaSaidaFila({ proxima_em: T + 300000, enviada_em: T }), T + 300000);
  assert.equal(L.proximaSaidaFila({ proxima_em: 0, enviada_em: 0 }), 0);
});

await teste("R119 fila: aposFalhaFila — 409 «em andamento» não é falha (20 s, sem motivo); rede volta com backoff; «pode ter saído» e definitiva ficam guardadas e não saem sozinhas", () => {
  const T = 9_000_000;
  const e = (codigo, extra = {}) => Object.assign(new Error(codigo), { codigo, ...extra });
  const item = { id: "x", estado: "enviando", tentativas: 2, enviada_em: T - 500, proxima_em: 0 };
  let p = L.aposFalhaFila(item, L.classificarFalhaEnvio(e("envio_em_andamento", { status: 409 })), { agora: T });
  assert.deepEqual(p, { fim: false, campos: { estado: "andamento", motivo: null, enviada_em: 0, proxima_em: T + 20000 } }, "não conta tentativa, não mostra erro, pergunta de novo em ~20 s");
  assert.deepEqual(L.filaDevidos([{ ...item, ...p.campos }], T + 20000).map(i => i.id), ["x"]);
  p = L.aposFalhaFila(item, L.classificarFalhaEnvio(e("tempo_rede")), { agora: T, jitter: 0 });
  assert.equal(p.fim, false); assert.equal(p.campos.estado, "incerto"); assert.equal(p.campos.tentativas, 3);
  assert.equal(p.campos.proxima_em, L.proximaTentativaFila(2, T, 0));
  assert.equal("enviada_em" in p.campos, false, "prazo estourado: a hora do pedido fica (os 90 s valem)");
  assert.deepEqual(L.filaDevidos([{ ...item, ...p.campos }], T + 80001).map(i => i.id), [], "backoff de 80 s vencido, mas ainda dentro dos 90 s do pedido");
  p = L.aposFalhaFila(item, L.classificarFalhaEnvio(e("sem_conexao")), { agora: T });
  assert.equal(p.campos.estado, "fila"); assert.equal(p.campos.enviada_em, 0, "«sem conexão»: sai assim que a internet volta (a reserva do client_ref no servidor impede o envio em dobro)");
  p = L.aposFalhaFila(item, L.classificarFalhaEnvio(e("sessao_invalida", { status: 401 })), { agora: T });
  assert.deepEqual([p.fim, p.campos.estado, p.campos.enviada_em, p.campos.proxima_em], [false, "fila", 0, T + 15000]);
  // 502 ambíguo sem mensagem gravada: fica na tela com o aviso e NUNCA sai sozinha
  p = L.aposFalhaFila(item, L.classificarFalhaEnvio(e("envio_falhou", { status: 502, resposta: { ok: false, ambigua: true } })), { agora: T });
  assert.deepEqual(p, { fim: true, campos: { estado: "ambigua", motivo: "Pode ter saído — confira no WhatsApp antes de reenviar." } });
  assert.deepEqual(L.filaDevidos([{ ...item, ...p.campos, enviada_em: 0 }], T + 10 * 3600000, { forcar: true }), []);
  p = L.aposFalhaFila(item, L.classificarFalhaEnvio(e("conversa_resolvida")), { agora: T });
  assert.equal(p.fim, true); assert.equal(p.campos.estado, "falhou"); assert.match(p.campos.motivo, /Reabra/);
  p = L.aposFalhaFila(item, L.classificarFalhaEnvio(e("coisa_nova")), { agora: T, textoErro: "Não deu certo agora." });
  assert.deepEqual(p.campos, { estado: "falhou", motivo: "Não deu certo agora." });
});

await teste("R119 fila: item parado há mais de 15 min não sai sozinho e ganha o motivo «Ficou na fila desde <dia hora>»", () => {
  const AGORA2 = new Date("2026-09-28T09:00:00-03:00").getTime();      // segunda, 9h
  const sexta = new Date("2026-09-25T18:02:00-03:00").getTime();
  assert.equal(L.FILA_AUTO_MAX_MS, 15 * 60000);
  assert.equal(L.filaParada({ estado: "fila", criada_em: AGORA2 - 15 * 60000 - 1 }, AGORA2), true);
  assert.equal(L.filaParada({ estado: "incerto", criada_em: sexta }, AGORA2), true);
  assert.equal(L.filaParada({ estado: "andamento", criada_em: sexta }, AGORA2), true);
  assert.equal(L.filaParada({ estado: "fila", criada_em: AGORA2 - 14 * 60000 }, AGORA2), false);
  assert.equal(L.filaParada({ estado: "falhou", criada_em: sexta }, AGORA2), false, "o que já espera a pessoa não muda");
  assert.equal(L.filaParada({ estado: "ambigua", criada_em: sexta }, AGORA2), false);
  assert.equal(L.filaParada({ estado: "enviando", criada_em: sexta }, AGORA2), false, "pedido a caminho não é interrompido");
  assert.equal(L.motivoFilaParada(sexta, new Date(AGORA2)), "Ficou na fila desde sex. às 18:02");
  assert.equal(L.motivoFilaParada(AGORA2 - 40 * 60000, new Date(AGORA2)), "Ficou na fila desde hoje às 08:20");
  assert.equal(L.motivoFilaParada(new Date("2026-09-27T23:10:00-03:00").getTime(), new Date(AGORA2)), "Ficou na fila desde ontem às 23:10");
  assert.equal(L.motivoFilaParada(new Date("2026-09-10T10:00:00-03:00").getTime(), new Date(AGORA2)), "Ficou na fila desde 10/09 às 10:00");
  assert.match(L.motivoFilaParada(null), /^Ficou na fila/);
});

await teste("R119 fila: o texto da bolha diz o motivo real e a hora da próxima tentativa", () => {
  const T = new Date("2026-09-28T14:30:00-03:00").getTime();
  assert.equal(L.textoFila({ estado: "fila", motivo: "Sem internet: a mensagem espera na fila.", proxima: T + 20000 }, T), "Na fila · envia quando a internet voltar");
  assert.equal(L.textoFila({ estado: "fila", motivo: null }, T), "Na fila · envia quando a internet voltar");
  assert.equal(L.textoFila({ estado: "fila", motivo: "O servidor está ocupado: tentando de novo.", proxima: T + 120000 }, T), "Na fila · O servidor está ocupado · nova tentativa às 14:32");
  assert.equal(L.textoFila({ estado: "incerto", motivo: "x", proxima: T + 90000 }, T), "Sem resposta do servidor · tentando de novo (nada sai em dobro) · nova tentativa às 14:31");
  assert.equal(L.textoFila({ estado: "incerto", proxima: T - 1 }, T), "Sem resposta do servidor · tentando de novo (nada sai em dobro)");
  assert.equal(L.textoFila({ estado: "fila", motivo: "Sua sessão expirou. Entre de novo: a mensagem continua guardada." }, T), "Sua sessão expirou. Entre de novo: a mensagem continua guardada.");
});

await teste("R119 fila (tela): a hora do pedido é gravada ANTES do envio, a trava dos 90 s vale em todo caminho, o 409 e o «pode ter saído» não somem, e sair de Conversas não deixa item para reenviar", () => {
  const conv = ler("conversas.js"), chat = ler("cv-chat.js");
  const t = conv.slice(conv.indexOf("async function transmitir(it)"), conv.indexOf("async function falhaDeEnvio"));
  assert.match(t, /if \(L\.esperaReenvioFila\(it\) > 0\) return "espera";/, "a trava fica dentro do transmitir: «Enviar agora», remontar e online passam por ela");
  assert.ok(t.indexOf("it.enviada_em = Date.now();") > 0 && t.indexOf("it.enviada_em = Date.now();") < t.indexOf("await filaSalvar(it);") && t.indexOf("await filaSalvar(it);") < t.indexOf('A.api.fn("nx-enviar"'),
    "enviada_em é gravada no IndexedDB antes do fetch");
  assert.match(conv, /enviada_em: it\.enviada_em \|\| 0,/, "e vai para o banco da fila");
  assert.match(t, /catch \(e\) \{\s*return await falhaDeEnvio\(it, e, \{ L, fila, ui, ctx \}\);/, "só a falha do PEDIDO vira falha de envio");
  assert.match(t, /if \(!A\) \{[^\n]*\n\s*filaSemTela\(fila, it, true\);/, "confirmou com a pessoa fora de Conversas: o item sai do banco (não é reenviado na volta)");
  assert.match(conv, /A\.L\.filaDevidos\(\[\.\.\.fila\.itens\.values\(\)\], Date\.now\(\), \{ forcar \}\)/, "forcar não vira mais «agora = infinito»");
  assert.match(conv, /fila\.itens\.set\(it\.id, \{ \.\.\.it, estado: it\.enviada_em \? "incerto" : "fila", proxima_em: 0 \}\);/);
  assert.match(conv, /if \(it\.estado === "falhou" \|\| it\.estado === "ambigua"\) \{ fila\.itens\.set\(it\.id, \{ \.\.\.it \}\); continue; \}/, "falha e «pode ter saído» voltam como estavam ao remontar");
  assert.match(conv, /if \(A\.L\.filaParada\(it, agora\)\) \{[\s\S]{0,200}estado: "falhou", parada: true, motivo: A\.L\.motivoFilaParada\(it\.criada_em, new Date\(agora\)\)/, "ao abrir: parado há mais de 15 min não sai sozinho");
  assert.match(conv, /if \(A\.L\.filaParada\(it, agora\) && !fila\.emVoo\.has\(it\.id\)\) await filaParar\(it, agora\);/, "e com a tela aberta também não");
  assert.match(conv, /if \(velho\.parada\) \{[\s\S]{0,400}return transmitir\(velho\);/, "«Tentar de novo» de item parado usa o MESMO client_ref (se já tinha saído, o servidor devolve a mesma)");
  assert.match(conv, /const ESPERA_PESSOA = new Set\(\["falhou", "ambigua"\]\);/);
  assert.match(conv, /ambigua \? \(it\.motivo \|\| "Pode ter saído — confira no WhatsApp antes de reenviar\."\)/, "a bolha do item em dúvida fica com o aviso");
  assert.match(chat, /m\.filaEstado === "ambigua" && A\.podeEscrever\) \{\s*falha\.append\(h\("button", \{[^}]*A\.acoes\.reenviarLocal\(m\) \} \}, "Enviar de novo"\),\s*h\("button", \{[^}]*A\.acoes\.descartarLocal\(m\) \} \}, "Descartar"\)\);/);
  assert.match(conv, /setTimeout\(\(\) => \{ desistiu = true; no\(new Error\("fila_lenta"\)\); \}, FILA_PRAZO_ABRIR_MS\)/, "IndexedDB que não abre em 1,5 s não trava o chat");
  assert.match(conv, /const FILA_PRAZO_ABRIR_MS = 1500;/);
  assert.match(conv, /if \(A\.fila\.pronta\) await A\.fila\.pronta;\s*if \(!A \|\| seq !== A\.seqConversa\) return;/);
});

await teste("R119 aviso: falha em conversa que não está aberta vira toast com o nome e «Abrir», marca na linha da lista; mídia e modelo não engolem o erro", () => {
  const conv = ler("conversas.js"), lista = ler("cv-lista.js"), css = ler("conversas.css");
  assert.match(conv, /`Mensagem para \$\{nome\} não foi enviada: \$\{motivo \|\| it\.motivo \|\| "o canal não aceitou a mensagem\."\}`/);
  assert.match(conv, /function avisarFalhaFora\(it, motivo, \{ ui = A && A\.ui, ctx = A && A\.ctx \} = \{\}\) \{\s*if \(!ui \|\| !ctx \|\| \(A && A\.selId === it\.conversa\)\) return;/, "só quando a bolha não está à vista");
  assert.match(conv, /class: "toast-acao", on: \{ click: \(\) => \{ t\.fechar\(\); ctx\.navegar\(`#\/conversas\/\$\{conversaId\}`\); \} \} \}, "Abrir"\)/);
  assert.match(conv, /para: nomeContato\(A\.ver\.contato \|\| conv\.contato\) \|\| null,/, "o item guarda o nome do destinatário");
  const ped = conv.slice(conv.indexOf("async function enviarPedido"), conv.indexOf("/** PUT com progresso"));
  assert.match(ped, /if \(!A \|\| A\.selId !== convId\) \{[\s\S]{0,900}toastAbrir\(ui, ctx, duvida \? `\$\{oQue\} para \$\{para\} pode ter saído — confira no WhatsApp antes de reenviar\.`\s*: `\$\{oQue\} para \$\{para\} não foi enviado: \$\{motivo\}`, convId\);/);
  assert.doesNotMatch(ped, /catch \(e\) \{\s*if \(!A \|\| A\.selId !== convId\) return;/, "o catch não devolve em silêncio");
  // lista: "!" (não enviada / em dúvida) e relógio (na fila); entra na assinatura da linha e no rótulo para leitor de tela
  assert.match(lista, /A\.acoes\.rascunhoDe\(c\.id\), A\.acoes\.filaResumo\(c\.id\),/);
  assert.match(lista, /class: "cvl-fila cvl-fila-falhou"/); assert.match(lista, /"Mensagem não enviada"/); assert.match(lista, /"Mensagem na fila de envio"/);
  assert.match(css, /\.cvl-fila-falhou \{/);
  assert.match(conv, /if \(ESPERA_PESSOA\.has\(x\.estado\)\) return "falhou";\s*if \(x\.estado !== "enviando"\) r = "pendente";/);
  // rascunho x mensagem nova do cliente: a linha mostra a mensagem dele e um selo pequeno
  assert.match(lista, /const rascunhoNaLinha = !!rascunho && !nl;/);
  assert.match(lista, /class: "cvl-selo-rasc"/);
  // j/k: o foco volta à mesma conversa depois de a lista redesenhar
  assert.match(lista, /const idFocado = focada && lista\.contains\(focada\) \? focada\.dataset\.id : null;/);
  assert.match(lista, /const volta = \[\.\.\.lista\.querySelectorAll\("\.cvl-item"\)\]\.find\(x => x\.dataset\.id === idFocado\);\s*if \(volta\) try \{ volta\.focus\(\{ preventScroll: true \}\); \}/);
});

await teste("R119: «Tentar de novo» de falha gravada pelo servidor pede o reenvio da própria mensagem (não assina em dobro) e o botão da bolha antiga some", () => {
  const conv = ler("conversas.js"), chat = ler("cv-chat.js");
  const srv = readFileSync(join(AQUI, "..", "supabase", "functions", "_compartilhado", "enviar.js"), "utf8");
  // o contrato do servidor: ação "reenviar" com `mensagem` (id) e o client_ref no corpo, reenviando sem assinar
  assert.match(srv, /case "reenviar": return acaoReenviar\(db, ctx, corpo, d\);/);
  assert.match(srv, /const id = Number\(corpo\.mensagem\);/);
  assert.match(srv, /assinar: false/);
  assert.match(conv, /\{ acao: "reenviar", mensagem: it\.reenvio, client_ref: it\.id \}/);
  assert.match(conv, /A\.reenviadas\.add\(m\.id\);/);
  assert.match(conv, /if \(daAberta\) return enviarTexto\(\{ tipo: "texto", texto: m\.corpo, reenvio: Number\(m\.id\) \}\);/, "falha da conversa aberta: reenvio da própria mensagem");
  assert.match(conv, /const daAberta = m\.conversa_id == null \|\| Number\(m\.conversa_id\) === Number\(A\.ver\.conversa\.id\);/, "falha de atendimento anterior não usa o reenvio (o servidor recusaria: atendimento resolvido)");
  assert.match(conv, /replace\(\/\^\\\*\[\^\*\\n\]\+:\\\*\\n\/, ""\), reenvio: null \}\);/, "texto novo sai sem a assinatura já gravada");
  assert.match(chat, /m\.tipo === "texto" && m\.corpo && !A\.acoes\.foiReenviada\(m\)\) \{[\s\S]{0,260}A\.acoes\.reenviarGravada\(m\)/);
  assert.doesNotMatch(chat, /A\.acoes\.enviar\(\{ tipo: "texto", texto: m\.corpo \}\)/, "o texto já assinado não volta como mensagem nova");
});

/* ---- compositor de verdade (cv-composer.js + rascunho.js) sobre um DOM mínimo: o que importa é em QUAL conversa cada texto fica ---- */
function elFalso(tag = "div") {
  const ouvintes = new Map();
  return {
    tagName: String(tag).toUpperCase(), type: tag === "textarea" ? "textarea" : "", value: "", hidden: false, disabled: false, dataset: {}, style: {}, attrs: {},
    children: [], parentNode: null, isConnected: true, scrollHeight: 20, textContent: "",
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; },
    addEventListener(t, fn) { if (!ouvintes.has(t)) ouvintes.set(t, new Set()); ouvintes.get(t).add(fn); },
    removeEventListener(t, fn) { if (ouvintes.has(t)) ouvintes.get(t).delete(fn); },
    dispatchEvent(ev) { for (const fn of [...(ouvintes.get(ev.type) || [])]) fn(ev); return true; },
    appendChild(x) { if (x && typeof x === "object") { this.children.push(x); x.parentNode = this; } return x; },
    append(...xs) { for (const x of xs) this.appendChild(x); },
    insertBefore(x) { return this.appendChild(x); },
    removeChild(x) { this.children = this.children.filter(c => c !== x); return x; }, remove() {},
    contains(x) { return this === x || this.children.some(c => c && typeof c.contains === "function" && c.contains(x)); },
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    focus() { globalThis.document.activeElement = this; }, select() { this.sel = [0, this.value.length]; }, setSelectionRange(a, b) { this.sel = [a, b]; }, click() {},
  };
}
const achar = (raiz, teste2) => { if (teste2(raiz)) return raiz; for (const c of raiz.children || []) { const r = achar(c, teste2); if (r) return r; } return null; };
const acharClasse = (raiz, classe) => achar(raiz, x => String(x.attrs && x.attrs.class || "").split(" ").includes(classe));

/** Monta o compositor real com rascunho.js real; devolve os controles do teste. */
async function montarCompositor() {
  const guardado = new Map();
  const storage = { getItem: k => (guardado.has(k) ? guardado.get(k) : null), setItem: (k, v) => { guardado.set(k, String(v)); }, removeItem: k => { guardado.delete(k); },
    key: i => [...guardado.keys()][i] ?? null, get length() { return guardado.size; } };
  const R = await import("../web/app/rascunho.js");
  const { criarComposer } = await import("../web/app/cv-composer.js");
  const rasc = R.criarRascunhos({ storage, conta: () => "u1", cliente: () => "c1", agendar: () => 1, cancelar: () => {},
    doc: { createElement: elFalso, createTextNode: () => elFalso("texto"), addEventListener() {} }, janela: { addEventListener() {} } });
  if (!globalThis.document) globalThis.document = { activeElement: null };
  globalThis.matchMedia = () => ({ matches: true });        // "pointer: coarse": o compositor não agenda foco nem trata Enter (o teste chama o botão Enviar)
  const toasts = [], enviados = [], modais = [];
  let modalResposta = async () => true, ia = async () => ({ texto: "" });
  const ui = {
    h(tag, attrs, ...filhos) {
      const el = elFalso(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (k === "on") for (const [t, fn] of Object.entries(v)) el.addEventListener(t, fn);
        else if (k === "dataset") Object.assign(el.dataset, v);
        else if (k === "hidden" || k === "disabled") el[k] = !!v;
        else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
      }
      for (const x of filhos.flat(3)) {
        if (x && typeof x === "object") el.appendChild(x);
        else if (typeof x === "string" || typeof x === "number") el.textContent += String(x);
      }
      return el;
    },
    icone: () => elFalso("svg"), pilula: () => elFalso("span"), limpar(el) { el.children = []; }, anunciar() {}, menu() {},
    toast(t) { toasts.push(String(t)); return { fechar() {}, el: elFalso() }; },
    modal: o => { modais.push(o); return modalResposta(o); },
  };
  const A = {
    ui, L, ctx: { rascunho: rasc, cliente: { nome: "Clínica" } }, selId: null, ver: null, rascunhos: new Map(), podeEscrever: true,
    base: { ia: {} }, eu: { id: "u1", nome: "Ana" }, icone: () => elFalso("svg"),
    acoes: { rascunhoMudou() {}, nomeContato: c => (c && c.nome) || "", pode: () => true, focarLista() {}, tratarErro() {}, respostaUsada() {},
      enviar: async o => { enviados.push(o); return { persistido: true }; }, sugerirIA: () => ia(), nota: async () => ({}) },
  };
  const comp = criarComposer(A);
  const ta = achar(comp.el, x => x.tagName === "TEXTAREA" && x.attrs["aria-label"] === "Mensagem");
  const botao = rotulo => achar(comp.el, x => x.tagName === "BUTTON" && x.attrs["aria-label"] === rotulo);
  const verDe = id => ({ contato: { nome: `Cliente ${id}` },
    conversa: { id, status: "aberta", canal_id: "k1", canal: { provedor: "meta", tem_token: true }, janela_ate: new Date(Date.now() + 3600000).toISOString() } });
  // número do CodeWords: sem token da Meta e com a "janela" fechada pela conta da Meta (o cliente nunca escreveu) — nada disso pode travar
  const verCodeWords = id => ({ contato: { nome: `Cliente ${id}` },
    conversa: { id, status: "aberta", canal_id: "k2", canal: { provedor: "codewords" }, janela_ate: null, ultima_entrada_em: null } });
  return {
    A, comp, ta, toasts, enviados, modais, botao,
    abrirCodeWords(id) { comp.guardar(); A.selId = id; A.ver = verCodeWords(id); comp.definirConversa(); },
    /** como o conversas.js faz: guarda o texto do campo, troca a seleção e (carregar = true) a conversa nova termina de abrir */
    selecionar(id, { carregar = true } = {}) { comp.guardar(); A.selId = id; A.ver = null; if (carregar) { A.ver = verDe(id); comp.definirConversa(); } },
    carregar(id) { A.ver = verDe(id); comp.definirConversa(); },
    digitar(texto) { ta.value = texto; ta.dispatchEvent({ type: "input" }); },
    guardadoEm: chave => { const b = guardado.get(`nx-rasc:u1:c1:${chave}`); return b ? JSON.parse(b).t : null; },
    chaves: () => [...guardado.keys()].map(k => k.replace("nx-rasc:u1:c1:", "")).sort(),
    aoModal(fn) { modalResposta = fn; }, aoIA(fn) { ia = fn; },
  };
}

/** Lista real sobre DOM mínimo: controla busca, estados acessíveis e tentativa de novo da busca em mensagens. */
async function montarLista({ busca = "", filtro = {}, buscaMsgs = null } = {}) {
  const { criarLista } = await import("../web/app/cv-lista.js");
  const chamadas = [], toasts = [];
  let A;
  const ui = {
    h(tag, attrs, ...filhos) {
      const el = elFalso(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (k === "on") for (const [t, fn] of Object.entries(v)) el.addEventListener(t, fn);
        else if (k === "dataset") Object.assign(el.dataset, v);
        else if (k === "hidden" || k === "disabled") el[k] = !!v;
        else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
      }
      for (const x of filhos.flat(3)) {
        if (x && typeof x === "object") el.appendChild(x);
        else if (typeof x === "string" || typeof x === "number") el.textContent += String(x);
      }
      return el;
    },
    icone: () => elFalso("svg"),
    limpar(el) { el.children = []; },
    debounce(fn, ms) { let timer; const f = (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), ms); }; f.cancelar = () => clearTimeout(timer); return f; },
    segmentado() { const el = elFalso(); el.ativar = () => {}; el.reposicionar = () => {}; el.contar = () => {}; return el; },
    avatar: () => elFalso("span"), pilula: () => elFalso("span"), etiqueta: () => elFalso("span"),
    vazio: () => elFalso("div"), esqueleto: () => elFalso("div"), erroCartao: () => elFalso("div"),
    toast(t) { toasts.push(String(t)); }, menu() {},
  };
  A = {
    ui, L, ctx: { papel: "admin" }, podeEscrever: true, eu: { id: "u1", nome: "Ana" }, aba: "minhas", busca, buscaMsgs,
    filtro: { ...filtro }, itens: [], temMais: false, carregandoLista: false, base: { canais: [{ id: "canal" }], departamentos: [], usuarios: [], etiquetas: [] }, contagens: {},
    acoes: {
      mudarLista(p) { chamadas.push(p); if (p.busca !== undefined) A.busca = p.busca; if (p.filtro !== undefined) A.filtro = p.filtro; },
      carregarLista() { chamadas.push({ carregarLista: true }); }, repetirBuscaMensagens() { chamadas.push({ repetirBuscaMensagens: true }); },
      lerAvisos: () => ({ som: false, tela: false }), pode: () => true, novaConversa() {}, atenderProximo() {}, menuAvisos() {},
    },
  };
  const lista = criarLista(A);
  return { A, lista, chamadas, toasts, encontrar: pred => achar(lista.el, pred), classe: nome => acharClasse(lista.el, nome) };
}

await teste("Atendimento follow-up: busca de um caractere limpa o filtro antigo e explica o mínimo de busca", async () => {
  const t = await montarLista({ busca: "Mariana" });
  const busca = t.encontrar(x => x.tagName === "INPUT" && x.attrs["aria-label"] === "Buscar conversas");
  busca.value = "M"; busca.dispatchEvent({ type: "input" });
  assert.equal(t.A.busca, "", "não mantém resultados antigos filtrados por Mariana");
  assert.ok(t.chamadas.some(x => x.busca === ""), "limpa a busca aplicada sem esperar o debounce");
  const dica = t.classe("cvl-busca-ajuda");
  assert.equal(dica.hidden, false);
  assert.match(dica.textContent, /digite mais 1 caractere/i);
});

await teste("Atendimento follow-up: Enter aplica a busca pendente e composição IME só busca ao terminar", async () => {
  const t = await montarLista();
  const busca = t.encontrar(x => x.tagName === "INPUT" && x.attrs["aria-label"] === "Buscar conversas");
  busca.value = "Mar"; busca.dispatchEvent({ type: "input" });
  assert.equal(t.chamadas.length, 0, "texto normal aguarda o debounce curto");
  const enter = { type: "keydown", key: "Enter", preventDefault() { this.defaultPrevented = true; } };
  busca.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, true);
  assert.equal(t.A.busca, "Mar", "Enter aplica imediatamente");
  busca.value = ""; busca.dispatchEvent({ type: "input" });
  t.chamadas.length = 0;
  busca.dispatchEvent({ type: "compositionstart" });
  busca.value = "María"; busca.dispatchEvent({ type: "input", isComposing: true });
  busca.dispatchEvent({ type: "keydown", key: "Enter", isComposing: true, keyCode: 229, preventDefault() { this.defaultPrevented = true; } });
  assert.equal(t.chamadas.length, 0, "não envia uma busca parcial enquanto o IME compõe caracteres");
  busca.dispatchEvent({ type: "compositionend" });
  assert.equal(t.A.busca, "María", "o termo final é aplicado ao encerrar composição");
});

await teste("Atendimento follow-up: o botão Filtros expõe estado e quantidade de filtros ativos", async () => {
  const t = await montarLista({ filtro: { departamento_id: "d1", etiquetas: ["e1", "e2"], nao_lidas: true } });
  t.lista.render();
  const b = t.encontrar(x => x.tagName === "BUTTON" && String(x.attrs.class).includes("cvl-filtro"));
  assert.equal(b.attrs["aria-pressed"], "true");
  assert.equal(b.attrs["aria-label"], "Filtros (4 ativos)");
  t.A.filtro = {}; t.lista.render();
  assert.equal(b.attrs["aria-pressed"], "false");
  assert.equal(b.attrs["aria-label"], "Filtros");
});

await teste("Atendimento follow-up: erro de busca nas mensagens é anunciado e pode ser repetido", async () => {
  const t = await montarLista({ busca: "consulta", buscaMsgs: { q: "consulta", carregando: false, itens: [], erro: new Error("offline") } });
  t.lista.render();
  const erro = acharClasse(t.classe("cvl-msgs"), "cvl-msgs-info");
  assert.equal(erro.attrs.role, "alert");
  assert.match(erro.textContent, /não deu para procurar/i);
  const tentar = t.encontrar(x => x.tagName === "BUTTON" && x.attrs["aria-label"] === "Tentar buscar mensagens novamente");
  assert.ok(tentar, "há uma ação explícita de nova tentativa");
  tentar.dispatchEvent({ type: "click" });
  assert.ok(t.chamadas.some(x => x.repetirBuscaMensagens));
  t.A.buscaMsgs = { q: "consulta", carregando: false, itens: [], erro: null }; t.lista.render();
  assert.equal(acharClasse(t.classe("cvl-msgs"), "cvl-msgs-info").attrs.role, "status", "resultado vazio também é comunicado");
});

await teste("Atendimento follow-up: lista marca aria-busy durante carga e limpa o estado ao concluir", async () => {
  const t = await montarLista();
  t.A.carregandoLista = true; t.lista.render();
  const lista = t.classe("cvl-lista");
  assert.equal(lista.attrs["aria-busy"], "true");
  t.A.carregandoLista = false; t.lista.render();
  assert.equal(lista.attrs["aria-busy"], "false");
});

await teste("Atendimento follow-up: compositor mostra caracteres restantes perto do limite sem anunciar cada tecla", async () => {
  const t = await montarCompositor(); t.selecionar(72); t.digitar("x".repeat(3900));
  const contador = acharClasse(t.comp.el, "cvx-contador");
  assert.equal(contador.hidden, false);
  assert.match(contador.textContent, /196 caracteres restantes/);
  assert.equal(contador.attrs["aria-live"], "off", "evita ler 4 mil atualizações por tecla");
  t.digitar("x".repeat(3890));
  assert.equal(contador.hidden, true, "a indicação visual some quando ainda há folga");
});

await teste("Atendimento follow-up: gravação com erro descarta o fragmento e libera o microfone", async () => {
  await comGravadorFalso(async reg => {
    const t = await montarCompositor(); t.abrirCodeWords(73);
    acharClasse(t.comp.el, "cvx-audio").dispatchEvent({ type: "click" }); await new Promise(r => setTimeout(r, 5));
    const rec = reg.gravadores[0]; rec.emitirErro();
    if (rec.state !== "inactive") rec.stop();
    await rec.fim; await new Promise(r => setTimeout(r, 5));
    assert.deepEqual(t.enviados, [], "erro de captura nunca abre um envio com áudio parcial");
    assert.equal(t.modais.length, 0);
    assert.equal(reg.faixasParadas, 1);
    assert.match(t.toasts.join(" "), /gravação falhou|gravação foi interrompida/i);
  });
});

await teste("Atendimento follow-up: anexo é revalidado após a confirmação do modal", async () => {
  const t = await montarCompositor(); t.selecionar(74);
  const pdf = { name: "proposta.pdf", type: "application/pdf", size: 1000 };
  let liberar; t.aoModal(() => new Promise(ok => { liberar = ok; }));
  const pendente = t.comp.anexar(pdf); await new Promise(r => setTimeout(r, 5));
  t.A.ver.conversa.status = "resolvida";
  liberar(true); await pendente;
  assert.deepEqual(t.enviados, [], "não envia se o atendimento foi resolvido enquanto o modal estava aberto");
  assert.match(t.toasts.join(" "), /atendimento mudou|não está mais disponível|nada foi enviado|não foi enviado/i);
});

await teste("Atendimento follow-up: URL temporária de prévia é revogada mesmo se o modal falhar", async () => {
  const t = await montarCompositor(); t.selecionar(75);
  const criar = URL.createObjectURL, revogar = URL.revokeObjectURL, revogadas = [];
  URL.createObjectURL = () => "blob:preview-followup";
  URL.revokeObjectURL = u => revogadas.push(u);
  try {
    t.aoModal(() => Promise.reject(new Error("modal fechado pelo navegador")));
    await assert.rejects(t.comp.anexar(new File([new Uint8Array([1])], "voz.mp3", { type: "audio/mpeg" })));
    assert.deepEqual(revogadas, ["blob:preview-followup"]);
    assert.deepEqual(t.enviados, []);
  } finally { URL.createObjectURL = criar; URL.revokeObjectURL = revogar; }
});

await teste("Atendimento follow-up: modelo é validado de novo com status e consentimento atuais no clique final", async () => {
  const t = await montarCompositor(); t.selecionar(76);
  t.A.ver.contato.optin_marketing = true;
  t.A.base.templates = [{ id: "tpl-1", canal_id: "k1", status: "APPROVED", categoria: "MARKETING", nome: "novidade", idioma: "pt_BR", corpo: "Novidades" }];
  const erros = [];
  t.aoModal(async o => {
    achar(o.corpo, x => String(x.attrs.class || "").split(" ").includes("cv-modelo")).dispatchEvent({ type: "click" });
    t.A.ver.contato.optin_marketing = false;
    const aceito = o.acoes[1].fn({ erro: e => erros.push(e) });
    assert.equal(aceito, false, "confirmação não aceita o modelo depois do opt-out");
    return false;
  });
  await t.comp.abrirModelos();
  assert.deepEqual(t.enviados, []);
  assert.match(erros.join(" "), /não receber marketing/i);
});

await teste("Atendimento follow-up: colar várias imagens informa que só a primeira será anexada", async () => {
  const t = await montarCompositor(); t.selecionar(77);
  const criar = URL.createObjectURL, revogar = URL.revokeObjectURL, bitmap = globalThis.createImageBitmap;
  URL.createObjectURL = () => "blob:paste-followup"; URL.revokeObjectURL = () => {};
  globalThis.createImageBitmap = async () => { throw new Error("fallback de navegador"); };
  try {
    const imagens = ["um.png", "dois.png"].map(nome => new File([new Uint8Array([1, 2])], nome, { type: "image/png" }));
    const ev = { type: "paste", clipboardData: { items: imagens.map(f => ({ kind: "file", type: f.type, getAsFile: () => f })) }, preventDefault() { this.defaultPrevented = true; } };
    t.ta.dispatchEvent(ev); await new Promise(r => setTimeout(r, 15));
    assert.equal(ev.defaultPrevented, true);
    assert.match(t.toasts.join(" "), /2 imagens|somente a primeira/i);
    assert.equal(t.enviados.length, 1);
    assert.equal(t.enviados[0].arquivo.name, "um.png");
  } finally { URL.createObjectURL = criar; URL.revokeObjectURL = revogar; if (bitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = bitmap; }
});

await teste("R119 rascunho: A → B → A — cada texto fica na chave da conversa em que foi digitado (antes o da 902 ia parar na chave da 901 e o da 902 sumia)", async () => {
  const t = await montarCompositor();
  t.selecionar(902); t.digitar("Seu orçamento ficou em R$ 850");
  t.selecionar(901);
  assert.equal(t.guardadoEm("conversa:902"), "Seu orçamento ficou em R$ 850", "abrir outra conversa não apaga o rascunho guardado da anterior");
  assert.equal(t.guardadoEm("conversa:901"), null);
  assert.equal(t.ta.value, "", "a 901 abre com o campo vazio");
  t.digitar("Pode vir às 15h");
  t.selecionar(902);
  assert.equal(t.guardadoEm("conversa:901"), "Pode vir às 15h", "a chave da 901 guarda o que foi escrito PARA a 901");
  assert.equal(t.guardadoEm("conversa:902"), "Seu orçamento ficou em R$ 850", "e a da 902 continua com o dela");
  assert.equal(t.ta.value, "Seu orçamento ficou em R$ 850");
  assert.deepEqual(t.chaves(), ["conversa:901", "conversa:902"]);
  assert.equal(t.A.rascunhos.get(901), "Pode vir às 15h"); assert.equal(t.A.rascunhos.get(902), "Seu orçamento ficou em R$ 850");
});

await teste("R119 rascunho: troca dupla rápida (Alt+↓ duas vezes) não copia o texto para a conversa do meio; digitar e Enter durante a troca ficam na conversa do campo", async () => {
  const t = await montarCompositor();
  t.selecionar(1); t.digitar("Seu orçamento ficou em R$ 850");
  t.selecionar(2, { carregar: false });            // a 2 ainda está carregando…
  t.selecionar(3, { carregar: false });            // …e a pessoa já pediu a 3: o campo ainda tem o texto da 1
  assert.equal(t.A.rascunhos.get(2), undefined, "a conversa do meio não ganha o rascunho da primeira");
  assert.equal(t.A.rascunhos.get(3), undefined);
  assert.equal(t.A.rascunhos.get(1), "Seu orçamento ficou em R$ 850");
  assert.equal(t.comp.textoDe(3), "", "a lista não mostra «Rascunho:» na conversa selecionada enquanto o campo é de outra");
  assert.equal(t.comp.textoDe(1), "Seu orçamento ficou em R$ 850");
  t.digitar("Seu orçamento ficou em R$ 850, à vista");     // ainda digitando enquanto a 3 carrega
  assert.equal(t.A.rascunhos.get(1), "Seu orçamento ficou em R$ 850, à vista"); assert.equal(t.A.rascunhos.get(3), undefined);
  t.botao("Enviar").dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(t.enviados, [], "com a troca em andamento, Enviar não manda o texto para ninguém");
  t.carregar(3);
  assert.equal(t.ta.value, "", "a 3 abre vazia");
  assert.equal(t.guardadoEm("conversa:1"), "Seu orçamento ficou em R$ 850, à vista"); assert.equal(t.guardadoEm("conversa:3"), null); assert.equal(t.guardadoEm("conversa:2"), null);
});

await teste("R119 rascunho: nota interna nunca vira rascunho de mensagem para o cliente", async () => {
  const t = await montarCompositor();
  t.selecionar(7);
  t.comp.alternarNota(true); t.digitar("cliente inadimplente, cobrar antes de marcar");
  assert.equal(t.comp.textoDe(7), "", "a lista não mostra a nota como «Rascunho:»");
  t.selecionar(8);
  assert.equal(t.A.rascunhos.get(7), undefined, "trocar de conversa não guarda a nota como mensagem");
  assert.equal(t.guardadoEm("conversa:7"), null); assert.equal(t.guardadoEm("conversa:7:nota"), "cliente inadimplente, cobrar antes de marcar");
  t.selecionar(7);
  assert.equal(t.ta.value, "", "ao voltar, o campo de MENSAGEM não traz o texto da nota");
  // texto de mensagem que a pessoa leva para a nota deixa de ser rascunho de mensagem
  t.digitar("anotar isto"); assert.equal(t.A.rascunhos.get(7), "anotar isto");
  t.comp.alternarNota(true);
  assert.equal(t.A.rascunhos.get(7), undefined); assert.equal(t.guardadoEm("conversa:7"), null);
});

await teste("R119 IA: sugestão que chega depois de trocar de conversa não entra no campo; com texto no campo, entra ABAIXO (não sobrescreve)", async () => {
  const t = await montarCompositor();
  let soltar; t.aoIA(() => new Promise(ok => { soltar = ok; }));
  t.selecionar(1);
  t.botao("Sugerir resposta com IA").dispatchEvent({ type: "click" });
  t.selecionar(2); t.digitar("Oi, Bruna! Sobre o seu retorno");
  soltar({ texto: "Olá, Ana! Seu exame ficou pronto." });
  await new Promise(r => setTimeout(r, 5));
  assert.equal(t.ta.value, "Oi, Bruna! Sobre o seu retorno", "o texto pensado para o cliente 1 não cai no campo do cliente 2");
  assert.match(t.toasts.join("\n"), /sugestão da IA chegou depois que você trocou de conversa/i);
  assert.equal(t.A.rascunhos.get(2), "Oi, Bruna! Sobre o seu retorno");
  // mesma conversa, campo com texto: acrescenta abaixo e seleciona só a sugestão
  t.aoIA(async () => ({ texto: "Posso agendar para amanhã às 10h?" }));
  t.botao("Sugerir resposta com IA").dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 5));
  assert.equal(t.ta.value, "Oi, Bruna! Sobre o seu retorno\n\nPosso agendar para amanhã às 10h?");
  assert.deepEqual(t.ta.sel, ["Oi, Bruna! Sobre o seu retorno\n\n".length, t.ta.value.length]);
  assert.equal(t.A.rascunhos.get(2), t.ta.value, "e o rascunho da sessão acompanha");
  // campo vazio: a sugestão entra inteira, como sempre
  t.selecionar(3);
  t.botao("Sugerir resposta com IA").dispatchEvent({ type: "click" });
  await new Promise(r => setTimeout(r, 5));
  assert.equal(t.ta.value, "Posso agendar para amanhã às 10h?");
});

await teste("R119 anexo e modelo: o modal diz para quem vai e, se a conversa mudou no meio, nada é enviado (com aviso)", async () => {
  const t = await montarCompositor();
  const pdf = { name: "orcamento.pdf", type: "application/pdf", size: 120000 };
  let soltar; t.aoModal(() => new Promise(ok => { soltar = ok; }));
  t.selecionar(41);
  const p = t.comp.anexar(pdf);
  await new Promise(r => setTimeout(r, 5));
  assert.equal(t.modais[0].titulo, "Enviar arquivo para Cliente 41");
  t.selecionar(42);                               // chegou mensagem e a pessoa abriu outra conversa com o modal na tela
  soltar(true); await p;
  assert.deepEqual(t.enviados, [], "o arquivo escolhido para a 41 não vai para a 42");
  assert.match(t.toasts.join("\n"), /o arquivo não foi enviado/);
  // sem trocar de conversa: envia, e diz ao envio para qual conversa o arquivo foi preparado
  t.aoModal(async () => true);
  await t.comp.anexar(pdf);
  assert.equal(t.enviados.length, 1); assert.equal(t.enviados[0].tipo, "midia"); assert.equal(t.enviados[0].conversa, 42);
  assert.match(t.enviados[0].client_ref, /^orbita:[A-Za-z0-9_.-]{1,74}$/, "a mídia recebe uma referência estável para esta intenção de envio");
  // modelos: título com o nome e a mesma trava no botão «Enviar modelo»
  const comp = ler("cv-composer.js"), conv = ler("conversas.js");
  assert.match(comp, /titulo: `Enviar modelo para \$\{nomeDestino\(\)\}`/);
  assert.match(comp, /if \(!mesmaConversa\(idInicio\)\) \{ api\.erro\("A conversa aberta mudou\./);
  assert.match(comp, /A\.acoes\.enviar\(\{ tipo: "template", conversa: idInicio, template: escolhido, parametros: vals \}\)/);
  assert.match(comp, /if \(!mesmaConversa\(idInicio\)\) \{ ui\.toast\("Você trocou de conversa enquanto a foto era preparada/, "depois de otimizar a foto também");
  assert.match(conv, /if \(o\.conversa != null && \(o\.conversa !== conv\.id \|\| A\.selId !== conv\.id\)\) \{/, "e o próprio envio confere a conversa");
});

await teste("R119 rascunho.js: depois de parar()/apagarTudo() (Sair), desligar() e salvarAgora() não regravam nada", async () => {
  const guardado = new Map();
  const storage = { getItem: k => (guardado.has(k) ? guardado.get(k) : null), setItem: (k, v) => { guardado.set(k, String(v)); }, removeItem: k => { guardado.delete(k); },
    key: i => [...guardado.keys()][i] ?? null, get length() { return guardado.size; } };
  const R = await import("../web/app/rascunho.js");
  const rasc = R.criarRascunhos({ storage, conta: () => "u1", cliente: () => "c1", agendar: () => 1, cancelar: () => {}, doc: null, janela: null });
  const campo = elFalso("textarea");
  const ctl = rasc.ligar(campo, "conversa:5");
  campo.value = "resposta que não foi enviada"; campo.dispatchEvent({ type: "input" });
  ctl.salvarAgora();
  assert.equal(guardado.size, 1, "antes do Sair o rascunho está guardado");
  rasc.apagarTudo();                               // Sair
  assert.equal(guardado.size, 0);
  ctl.desligar();                                  // a tela desmonta DEPOIS do Sair (o compositor desliga o rascunho)
  ctl.salvarAgora(); rasc.salvarTudo();
  assert.equal(guardado.size, 0, "nenhum rascunho fica no aparelho depois do Sair");
  // um controle novo (outra pessoa entrou) funciona normalmente
  const ctl2 = rasc.ligar(campo, "conversa:5");
  ctl2.salvarAgora();
  assert.equal(guardado.size, 1);
});

/* ============================================================ mídia pelo número do CodeWords (áudio, foto e arquivo) */
console.log("\n(e2) CodeWords — áudio, foto e arquivo pelo aparelho");

await teste("CodeWords áudio: wavDePcm monta o cabeçalho RIFF de 44 bytes (PCM 16 bits, mono, 16 kHz, little-endian), byte a byte", () => {
  const pcm = new Float32Array([0, 1, -1, 0.5, -0.5, 2, -3, NaN]);
  const w = L.wavDePcm(pcm, 16000);
  assert.ok(w instanceof Uint8Array, "devolve bytes prontos para virar arquivo");
  assert.equal(w.length, 44 + pcm.length * 2, "44 de cabeçalho + 2 bytes por amostra");
  assert.deepEqual([...w.slice(0, 44)], [
    0x52, 0x49, 0x46, 0x46,       // "RIFF"
    52, 0, 0, 0,                  // tamanho do resto do arquivo: 36 + 16 bytes de dados
    0x57, 0x41, 0x56, 0x45,       // "WAVE"
    0x66, 0x6d, 0x74, 0x20,       // "fmt "
    16, 0, 0, 0,                  // o bloco fmt tem 16 bytes
    1, 0,                         // PCM sem compressão
    1, 0,                         // mono
    0x80, 0x3e, 0, 0,             // 16000 Hz
    0x00, 0x7d, 0, 0,             // 32000 bytes por segundo
    2, 0,                         // 2 bytes por amostra
    16, 0,                        // 16 bits
    0x64, 0x61, 0x74, 0x61,       // "data"
    16, 0, 0, 0,                  // 8 amostras × 2 bytes
  ]);
  const dv = new DataView(w.buffer, w.byteOffset, w.byteLength);
  const amostras = Array.from({ length: pcm.length }, (_, i) => dv.getInt16(44 + i * 2, true));
  assert.deepEqual(amostras, [0, 32767, -32768, 16384, -16384, 32767, -32768, 0], "corta em [-1, 1] (2 e -3 não dão a volta) e o que não é número vira silêncio");
});

await teste("CodeWords áudio: wavDePcm — 1 s a 16 kHz mono dá 32.044 bytes; vazio é só o cabeçalho; a taxa informada vai para o cabeçalho", () => {
  assert.equal(L.WAV_TAXA, 16000);
  const um = L.wavDePcm(new Float32Array(16000));
  assert.equal(um.length, 44 + 32000);
  const dv = new DataView(um.buffer);
  assert.equal(dv.getUint32(4, true), 36 + 32000);
  assert.equal(dv.getUint16(22, true), 1, "mono");
  assert.equal(dv.getUint32(24, true), 16000, "sem taxa informada = 16 kHz");
  assert.equal(dv.getUint32(28, true), 32000);
  assert.equal(dv.getUint32(40, true), 32000);
  const vazio = L.wavDePcm(new Float32Array(0));
  assert.equal(vazio.length, 44);
  assert.equal(new DataView(vazio.buffer).getUint32(4, true), 36);
  assert.equal(new DataView(vazio.buffer).getUint32(40, true), 0);
  assert.equal(L.wavDePcm(null).length, 44, "sem amostras não quebra");
  const oito = new DataView(L.wavDePcm([0.25, -0.25], 8000).buffer);          // vetor comum também serve
  assert.equal(oito.getUint32(24, true), 8000); assert.equal(oito.getUint32(28, true), 16000);
  assert.equal(oito.getInt16(44, true), 8192); assert.equal(oito.getInt16(46, true), -8192);
  assert.equal(new DataView(L.wavDePcm([0], 0).buffer).getUint32(24, true), 16000, "taxa inválida cai em 16 kHz");
});

await teste("CodeWords anexos: WAV passa só em número do CodeWords; na Meta é recusado com o motivo marcado; o resto das regras é igual nos dois canais", () => {
  const MB = 1024 * 1024, cw = { provedor: "codewords" };
  assert.equal(L.MIME_WAV, "audio/wav");
  assert.deepEqual(L.validarArquivo({ name: "voz.wav", type: "audio/wav", size: 500000 }, cw), { ok: true, mime: "audio/wav", tipo: "audio", limite: 16 * MB });
  assert.deepEqual(L.validarArquivo({ name: "voz.wav", type: "audio/wav", size: 500000 }, { provedor: "meta" }),
    { ok: false, erro: "midia_tipo", mime: "audio/wav", tipo: null, limite: 16 * MB, wav: true });
  assert.equal(L.validarArquivo({ name: "voz.wav", type: "audio/wav", size: 500000 }).wav, true, "sem canal informado vale a regra da Meta");
  assert.equal(L.validarArquivo({ name: "voz.wav", type: "audio/wav", size: 500000 }).ok, false);
  // o mesmo WAV com os outros nomes que os navegadores usam, e só pela extensão
  for (const type of ["audio/x-wav", "audio/wave", "audio/vnd.wave", "AUDIO/WAV; codecs=1"]) {
    assert.equal(L.validarArquivo({ name: "voz.wav", type, size: 1000 }, cw).mime, "audio/wav", type);
    assert.equal(L.validarArquivo({ name: "voz.wav", type, size: 1000 }, cw).ok, true, type);
  }
  assert.equal(L.validarArquivo({ name: "GRAVACAO.WAV", type: "", size: 1000 }, cw).tipo, "audio", "arquivo sem type: vale a extensão .wav");
  assert.equal(L.validarArquivo({ name: "gravacao.wav", type: "", size: 1000 }, { provedor: "meta" }).wav, true);
  assert.equal(L.validarArquivo({ name: "voz.wav", type: "audio/wav", size: 17 * MB }, cw).erro, "midia_grande", "até 16 MB");
  const vazio = L.validarArquivo({ name: "voz.wav", type: "audio/wav", size: 0 }, cw);
  assert.equal(vazio.ok, false); assert.equal(vazio.wav, undefined, "WAV vazio no CodeWords não ganha o aviso «este número não aceita WAV»");
  // nada mais muda por ser CodeWords
  assert.equal(L.validarArquivo({ name: "a.jpg", type: "image/jpeg", size: 6 * MB }, cw).erro, "midia_grande", "foto continua em 5 MB");
  assert.equal(L.validarArquivo({ name: "v.mp4", type: "video/mp4", size: 15 * MB }, cw).tipo, "video");
  assert.equal(L.validarArquivo({ name: "x.ogg", type: "audio/ogg", size: 1000 }, cw).tipo, "audio");
  assert.equal(L.validarArquivo({ name: "r.pdf", type: "application/pdf", size: 1000 }, cw).tipo, "documento");
  assert.equal(L.validarArquivo({ name: "a.webm", type: "audio/webm", size: 1000 }, cw).erro, "midia_tipo");
  assert.equal(L.validarArquivo({ name: "a.webm", type: "audio/webm", size: 1000 }, cw).wav, undefined);
  assert.equal(L.validarArquivo({ name: "z.zip", type: "application/zip", size: 1000 }, cw).erro, "midia_tipo");
});

await teste("CodeWords composer: clipe e arrastar liberados (sem janela de 24 h e sem token da Meta); modelos continuam fora; .wav entra aqui e é recusado na Meta com texto claro", async () => {
  const t = await montarCompositor();
  t.abrirCodeWords(77);
  assert.equal(t.comp.aceitaAnexo(), true, "anexo liberado mesmo com a janela «fechada» pela conta da Meta e sem token");
  assert.equal(t.botao("Anexar arquivo").attrs["aria-disabled"], "false");
  assert.equal(t.ta.disabled, false);
  assert.equal(acharClasse(t.comp.el, "cvx-trava").hidden, true, "nenhuma faixa de janela/token");
  // modelos são da Meta: botão escondido, desligado, e a função recusa
  const btModelos = t.botao("Enviar modelo aprovado");
  assert.equal(btModelos.hidden, true); assert.equal(btModelos.disabled, true);
  await t.comp.abrirModelos();
  assert.equal(t.modais.length, 0, "o seletor de modelos não abre");
  assert.match(t.toasts.join("\n"), /Modelos da Meta não estão disponíveis neste canal CodeWords/);
  // um .wav do disco segue como áudio, sem legenda
  const wav = new File([new Uint8Array(2000)], "recado.wav", { type: "audio/x-wav" });
  await t.comp.anexar(wav);
  assert.equal(t.modais.length, 1); assert.equal(t.modais[0].titulo, "Enviar arquivo para Cliente 77");
  assert.equal(t.enviados.length, 1);
  assert.equal(t.enviados[0].tipo, "midia"); assert.equal(t.enviados[0].conversa, 77);
  assert.equal(t.enviados[0].validacao.mime, "audio/wav"); assert.equal(t.enviados[0].validacao.tipo, "audio");
  assert.equal(t.enviados[0].legenda, "", "áudio vai sem legenda");
  // foto e documento também
  await t.comp.anexar(new File([new Uint8Array(900)], "foto.jpg", { type: "image/jpeg" }));
  await t.comp.anexar({ name: "orcamento.pdf", type: "application/pdf", size: 120000 });
  assert.deepEqual(t.enviados.slice(1).map(e => e.validacao.tipo), ["imagem", "documento"]);
  // na Meta o mesmo .wav não passa, e o aviso diz o porquê
  const m = await montarCompositor();
  m.selecionar(78);
  assert.equal(m.botao("Enviar modelo aprovado").hidden, false, "na Meta os modelos continuam à vista");
  await m.comp.anexar(wav);
  assert.deepEqual(m.enviados, []); assert.equal(m.modais.length, 0);
  assert.match(m.toasts.join("\n"), /Este número não aceita WAV: use MP3, OGG, AAC ou M4A/);
  // nota interna continua sem anexo, em qualquer canal
  t.comp.alternarNota(true);
  assert.equal(t.comp.aceitaAnexo(), false);
});

await teste("CodeWords composer: vídeo avisa que chega como arquivo (só neste canal) e a mídia nunca sai como resposta citada", async () => {
  const video = () => new File([new Uint8Array(4000)], "passeio.mp4", { type: "video/mp4" });
  const pdf = { name: "orcamento.pdf", type: "application/pdf", size: 120000 };
  const citada = { id: 5, direcao: "in", tipo: "texto", corpo: "qual o valor?", wamid: "w-5" };
  const t = await montarCompositor();
  t.abrirCodeWords(81);
  await t.comp.anexar(video());
  assert.ok(acharClasse(t.modais[0].corpo, "cv-aviso-canal"), "linha «Neste número o vídeo chega como arquivo para baixar.» no modal");
  assert.equal(t.enviados[0].validacao.tipo, "video");
  await t.comp.anexar(pdf);
  assert.equal(acharClasse(t.modais[1].corpo, "cv-aviso-canal"), null, "documento não leva o aviso");
  assert.match(ler("cv-composer.js"), /codeWords && v\.tipo === "video" \? h\("p", \{ class: "sub cv-aviso-canal" \}, "Neste número o vídeo chega como arquivo para baixar\."\)/);
  // respondendo a uma mensagem + arquivo: a faixa «Respondendo…» sai e nada de citação segue
  const faixa = acharClasse(t.comp.el, "cvx-resp");
  t.comp.responder(citada);
  assert.equal(faixa.hidden, false);
  await t.comp.anexar(pdf);
  assert.equal(faixa.hidden, true, "o arquivo não aparece como resposta citada");
  assert.equal(t.enviados.length, 3);
  for (const e of t.enviados) { assert.equal(e.respondeA, undefined); assert.equal("responde_a" in e, false); }
  // cancelar o modal não desfaz a resposta que a pessoa estava escrevendo
  t.comp.responder(citada); t.aoModal(async () => false);
  await t.comp.anexar(pdf);
  assert.equal(faixa.hidden, false); assert.equal(t.enviados.length, 3);
  // Meta: sem aviso de vídeo, e o comportamento de antes (a faixa fica) não muda
  const m = await montarCompositor();
  m.selecionar(82);
  await m.comp.anexar(video());
  assert.equal(acharClasse(m.modais[0].corpo, "cv-aviso-canal"), null);
  m.comp.responder(citada);
  await m.comp.anexar(pdf);
  assert.equal(acharClasse(m.comp.el, "cvx-resp").hidden, false);
  // e o pedido ao servidor nunca leva responde_a em mídia (com o tamanho, como combinado com o nx-enviar)
  const chamada = /A\.api\.fn\("nx-enviar", \{ acao: "midia",[^}]*\}\)/.exec(ler("conversas.js"));
  assert.ok(chamada, "chamada de mídia do nx-enviar");
  assert.equal(chamada[0], 'A.api.fn("nx-enviar", { acao: "midia", conversa: convId, path: o.path, mime: o.validacao.mime, nome: o.arquivo.name, legenda: o.legenda || undefined, tamanho: o.arquivo.size, client_ref: o.client_ref })');
  assert.doesNotMatch(chamada[0], /responde_a/);
});

/** Navegador de mentira para a gravação: MediaRecorder que só grava WebM (nem ogg nem mp4), microfone, AudioContext e OfflineAudioContext. */
async function comGravadorFalso(fn) {
  const antes = { MR: globalThis.MediaRecorder, AC: globalThis.AudioContext, OAC: globalThis.OfflineAudioContext, seguro: globalThis.isSecureContext,
    nav: Object.getOwnPropertyDescriptor(globalThis, "navigator") };
  const reg = { gravadores: [], contextos: 0, fechados: 0, offline: [], faixasParadas: 0, decodificar: async () => ({ duration: 0.5 }) };
  globalThis.MediaRecorder = class {
    static isTypeSupported() { return false; }
    constructor(fluxo, opcoes) { this.opcoes = opcoes; this.state = "inactive"; this.mimeType = "audio/webm;codecs=opus"; this.ouvintes = {}; reg.gravadores.push(this); }
    addEventListener(tipo, f) { (this.ouvintes[tipo] ||= []).push(f); }
    emitirErro() { for (const f of this.ouvintes.error || []) f({ error: new Error("capture failed") }); }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      for (const f of this.ouvintes.dataavailable || []) f({ data: new Blob([new Uint8Array(640)], { type: "audio/webm" }) });
      this.fim = Promise.all((this.ouvintes.stop || []).map(f => f()));
    }
  };
  globalThis.AudioContext = class {
    constructor() { reg.contextos++; }
    decodeAudioData(buf) { return reg.decodificar(buf); }
    close() { reg.fechados++; return Promise.resolve(); }
  };
  globalThis.OfflineAudioContext = class {
    constructor(canais, quadros, taxa) { this.quadros = quadros; this.destination = {}; reg.offline.push({ canais, quadros, taxa }); }
    createBufferSource() { return { connect() {}, start() {} }; }
    startRendering() { return Promise.resolve({ getChannelData: () => new Float32Array(this.quadros).fill(0.25) }); }
  };
  globalThis.isSecureContext = true;
  Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true,
    value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { reg.faixasParadas++; } }] }) } } });
  try { return await fn(reg); }
  finally {
    for (const g of reg.gravadores) if (g.state !== "inactive") g.stop();        // nenhum cronômetro de gravação fica vivo depois do teste
    globalThis.MediaRecorder = antes.MR; globalThis.AudioContext = antes.AC; globalThis.OfflineAudioContext = antes.OAC; globalThis.isSecureContext = antes.seguro;
    if (antes.nav) Object.defineProperty(globalThis, "navigator", antes.nav); else delete globalThis.navigator;
  }
}
const tique = () => new Promise(r => setTimeout(r, 5));

await teste("CodeWords gravação: grava no formato padrão do navegador (mesmo sem ogg/mp4) e anexa WAV 16 kHz mono «audio-orbita-<hora>.wav»; na Meta o mesmo navegador segue sem gravar", async () => {
  await comGravadorFalso(async reg => {
    const t = await montarCompositor();
    t.abrirCodeWords(91);
    const btAudio = acharClasse(t.comp.el, "cvx-audio");
    assert.equal(btAudio.disabled, false, "no CodeWords o microfone vale mesmo onde o navegador não grava ogg nem mp4");
    assert.equal(btAudio.attrs["aria-label"], "Gravar áudio para enviar (até 1 minuto)");
    assert.equal(acharClasse(t.comp.el, "cvx-info").hidden, true, "sem aviso de «não dá para gravar»");
    btAudio.dispatchEvent({ type: "click" }); await tique();
    assert.equal(reg.gravadores.length, 1);
    assert.equal(reg.gravadores[0].opcoes, undefined, "sem exigir mimeType: o formato padrão do navegador");
    assert.equal(reg.gravadores[0].state, "recording");
    assert.equal(btAudio.attrs["aria-pressed"], "true");
    btAudio.dispatchEvent({ type: "click" });               // parar
    await reg.gravadores[0].fim; await tique();
    assert.equal(t.enviados.length, 1);
    const e = t.enviados[0];
    assert.equal(e.tipo, "midia"); assert.equal(e.conversa, 91); assert.equal(e.legenda, "");
    assert.match(e.arquivo.name, /^audio-orbita-\d{13}\.wav$/);
    assert.equal(e.arquivo.type, "audio/wav");
    assert.deepEqual({ mime: e.validacao.mime, tipo: e.validacao.tipo, ok: e.validacao.ok }, { mime: "audio/wav", tipo: "audio", ok: true });
    assert.deepEqual(reg.offline, [{ canais: 1, quadros: 8000, taxa: 16000 }], "reamostrado em 16 kHz, um canal (0,5 s = 8.000 quadros)");
    const bytes = new Uint8Array(await e.arquivo.arrayBuffer());
    assert.equal(bytes.length, 44 + 8000 * 2);
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "RIFF"); assert.equal(String.fromCharCode(...bytes.slice(8, 12)), "WAVE");
    const dv = new DataView(bytes.buffer);
    assert.equal(dv.getUint16(22, true), 1); assert.equal(dv.getUint32(24, true), 16000); assert.equal(dv.getInt16(44, true), 8192);
    assert.equal(reg.contextos, 1); assert.equal(reg.fechados, 1, "o AudioContext é fechado");
    assert.equal(reg.faixasParadas, 1, "o microfone é solto");
    assert.equal(t.modais[0].titulo, "Enviar arquivo para Cliente 91", "a pessoa revisa o áudio antes de mandar");
    // Meta, mesmo navegador: sem ogg/mp4 não há gravação (como sempre foi) e o ⓘ explica
    const m = await montarCompositor();
    m.selecionar(92);
    assert.equal(acharClasse(m.comp.el, "cvx-audio").disabled, true);
    assert.equal(acharClasse(m.comp.el, "cvx-info").hidden, false);
    acharClasse(m.comp.el, "cvx-audio").dispatchEvent({ type: "click" }); await tique();
    assert.equal(reg.gravadores.length, 1, "nenhum gravador novo na Meta");
    assert.match(m.toasts.join("\n"), /A gravação não está disponível aqui\. Anexe um áudio salvo em MP3, OGG, AAC ou M4A\./);
  });
});

await teste("CodeWords gravação: se a permissão do microfone terminar depois da troca de conversa, a gravação não começa nem muda de destino", async () => {
  await comGravadorFalso(async reg => {
    const t = await montarCompositor();
    t.abrirCodeWords(93);
    const btAudio = acharClasse(t.comp.el, "cvx-audio");
    let liberarPermissao, paradas = 0;
    navigator.mediaDevices.getUserMedia = () => new Promise(ok => { liberarPermissao = ok; });
    btAudio.dispatchEvent({ type: "click" });
    await tique();
    t.abrirCodeWords(94);
    liberarPermissao({ getTracks: () => [{ stop() { paradas++; } }] });
    await tique();
    if (reg.gravadores[0] && reg.gravadores[0].state !== "inactive") {
      t.abrirCodeWords(95);            // limpa a regressão no caso RED, sem deixar microfone/timer aberto
      await reg.gravadores[0].fim;
    }
    assert.equal(reg.gravadores.length, 0, "não cria MediaRecorder para a conversa que substituiu a original durante a permissão");
    assert.equal(paradas, 1, "solta o microfone que chegou tarde");
    assert.deepEqual(t.enviados, [], "nenhum áudio é anexado à conversa nova");
  });
});

await teste("CodeWords gravação: se a conversão para WAV falhar, avisa e oferece anexar um áudio salvo (nada sai, o AudioContext fecha); trocar de conversa no meio não manda o áudio para outro cliente", async () => {
  await comGravadorFalso(async reg => {
    const t = await montarCompositor();
    t.abrirCodeWords(95);
    const btAudio = acharClasse(t.comp.el, "cvx-audio");
    reg.decodificar = async () => { throw new Error("EncodingError"); };
    btAudio.dispatchEvent({ type: "click" }); await tique();
    btAudio.dispatchEvent({ type: "click" });
    await reg.gravadores[0].fim; await tique();
    assert.deepEqual(t.enviados, []); assert.equal(t.modais.length, 0);
    assert.match(t.toasts.join("\n"), /Não foi possível preparar o áudio gravado neste navegador, e ele não foi enviado\. Toque no clipe para anexar um áudio salvo/);
    assert.equal(reg.fechados, reg.contextos, "fecha o AudioContext mesmo com erro");
    assert.equal(btAudio.disabled, false, "dá para gravar de novo");
    // a conversão demora e a pessoa abre outra conversa: o áudio da 95 não vai para a 96
    let soltar; reg.decodificar = () => new Promise(ok => { soltar = ok; });
    btAudio.dispatchEvent({ type: "click" }); await tique();
    btAudio.dispatchEvent({ type: "click" }); await tique();
    t.abrirCodeWords(96);
    soltar({ duration: 1 });
    await reg.gravadores[1].fim; await tique();
    assert.deepEqual(t.enviados, []);
    assert.match(t.toasts.join("\n"), /Você trocou de conversa enquanto o áudio era preparado: nada foi enviado/);
    // trocar de conversa DURANTE a gravação cancela (como já era)
    acharClasse(t.comp.el, "cvx-audio").dispatchEvent({ type: "click" }); await tique();
    assert.equal(reg.gravadores[2].state, "recording");
    t.abrirCodeWords(97);
    await reg.gravadores[2].fim; await tique();
    assert.equal(reg.gravadores[2].state, "inactive"); assert.deepEqual(t.enviados, []);
  });
});

await teste("CodeWords tela: nenhum texto diz mais que o canal é «só texto»; arrastar/colar usam a mesma regra do clipe; a bolha de mídia mostra «Pode ter saído» quando o servidor responde ambigua", () => {
  const comp = ler("cv-composer.js"), chat = ler("cv-chat.js"), conv = ler("conversas.js"), apiJs = ler("api.js"), logica = ler("cv-logica.js");
  assert.match(comp, /function aceitaAnexo\(\) \{ return !modoNota && situacao\(\) === "ok"; \}/, "anexo não depende mais do provedor");
  for (const s of [comp, chat, conv, apiJs]) {
    assert.doesNotMatch(s, /CodeWords envia (apenas |somente )?(mensagens de )?texto|não envia mídia|use um canal (WhatsApp Cloud API|Meta)|selecione um canal WhatsApp Cloud API/i);
  }
  // modelos seguem bloqueados no CodeWords: botão, função e menu «+» do celular
  assert.match(comp, /btModelos\.hidden = codeWords;/);
  assert.match(comp, /btModelos\.disabled = codeWords \|\| modoNota \|\| !\(s === "ok" \|\| s === "janela"\);/);
  assert.match(comp, /async function abrirModelos\(\) \{\s*if \(usaCodeWords\(\)\) \{ ui\.toast\("Modelos da Meta não estão disponíveis neste canal CodeWords\."/);
  assert.match(comp, /!usaCodeWords\(\) \? \{ rotulo: "Modelos aprovados"/);
  // gravação: na Meta exige ogg/mp4; no CodeWords basta gravador + decodificador, e o WAV sai da função pura
  assert.match(comp, /function podeGravar\(\) \{ return !!globalThis\.isSecureContext && \(usaCodeWords\(\) \? gravaWav\(\) : !!formatoGravacao\(\)\); \}/);
  assert.match(comp, /const rec = emWav \? new MediaRecorder\(fluxo\) : new MediaRecorder\(fluxo, \{ mimeType: mimePreferido \}\);/);
  assert.match(comp, /new OAC\(1, Math\.max\(1, Math\.round\(audio\.duration \* L\.WAV_TAXA\)\), L\.WAV_TAXA\)/, "OfflineAudioContext mono a 16 kHz");
  assert.match(comp, /L\.wavDePcm\(pronto\.getChannelData\(0\), L\.WAV_TAXA\)/);
  assert.match(comp, /\} finally \{ try \{ await ctx\.close\(\); \} catch \{/, "AudioContext sempre fechado");
  assert.match(comp, /audio\/ogg,audio\/wav,application\/pdf/, "o seletor de arquivo oferece .wav");
  assert.match(logica, /if \(provedor !== "codewords"\) return \{ ok: false, erro: "midia_tipo", mime, tipo: null, limite, wav: true \};/);
  // arrastar para o chat e colar imagem passam pelo mesmo aceitaAnexo()/anexar()
  assert.match(chat, /corpo\.addEventListener\("dragenter", ev => \{ if \(!temArquivo\(ev\) \|\| !A\.composer\.aceitaAnexo\(\)\) return;/);
  assert.match(chat, /if \(f\) A\.composer\.anexar\(f\);/);
  const colagem = comp.slice(comp.indexOf('ta.addEventListener("paste"'), comp.indexOf('/* ---------------- fotos: otimiza'));
  assert.match(colagem, /const imagens = itens\.filter\(i => i\.kind === "file" && \/\^image\\\/\/\.test\(i\.type\)\)/);
  assert.match(colagem, /imagens\[0\]/, "a colagem só anexa a primeira imagem da área de transferência");
  assert.match(colagem, /getAsFile\(\)[\s\S]*new File\(/);
  assert.match(colagem, /somente a primeira será anexada/);
  // resposta ambígua (timeout/5xx do aparelho): a mensagem gravada entra marcada e a bolha avisa, sem reenviar sozinha
  assert.match(conv, /const msg = r && r\.mensagem \? \{ \.\.\.r\.mensagem, \.\.\.\(r\.ambigua === true \? \{ ambigua: true \} : \{\}\) \} : null;\s*A\.msgs = A\.msgs\.filter\(m => m\.id !== tmp\.id\);/);
  assert.match(conv, /if \(tmp\.midia && tmp\.midia\.local_url && msg\.midia && msg\.midia\.path\) A\.midia\.set\(msg\.midia\.path, \{ url: null, local: tmp\.midia\.local_url/, "a prévia local segue na bolha gravada");
  assert.match(chat, /const ambigua = m\.ambigua === true \|\| \(m\.status === "pendente" && \/\^status incerto:\/i\.test\(String\(m\.erro \|\| ""\)\)\);/);
  assert.match(chat, /"Pode ter saído — confira no WhatsApp antes de reenviar\."/);
  assert.match(chat, /if \(\["imagem", "video", "audio", "documento", "sticker"\]\.includes\(m\.tipo\)\) bolha\.appendChild\(blocoMidia\(m\)\);/);
  // falha do aparelho: o servidor devolve a saída gravada como «falhou» e a tela mostra o motivo dele
  assert.match(conv, /if \(codigo === "envio_falhou" && salva && salva\.id\) \{/);
  assert.doesNotMatch(apiJs, /codewords_tipo_nao_suportado: "[^"]*somente mensagens de texto/);
});

/* ============================================================ M33 — assistente passo a passo do número (CodeWords e Meta) */
console.log("\n(f) M33 — assistente do número");

await teste("M33: passosCodeWords — o passo atual é o 1º que o servidor ainda não confirmou (5 estados do canal)", () => {
  const cw = (o = {}) => ({ id: "k1", nome: "Recepção", codewords: { tem_api_key: true, conectado: true, numero_conferido: true, rota: "fluxo", service_id: "svc-1", inscricao: "svc-1", ia_ligada: true, ...o } });
  // 1) canal que ainda não existe → passo 1
  let r = L.passosCodeWords({ canal: null });
  assert.equal(r.atual, 1); assert.deepEqual(r.passos.map(p => p.estado), ["atual", "futuro", "futuro", "futuro", "futuro"]);
  assert.equal(r.passos.length, 5); assert.deepEqual(r.passos.map(p => p.id), ["chave", "parear", "conferir", "destino", "teste"]);
  // 2) chave salva, aparelho não pareado → passo 2
  r = L.passosCodeWords({ canal: cw({ conectado: false, numero_conferido: null }) });
  assert.equal(r.atual, 2); assert.equal(r.passos[0].feito, true); assert.equal(r.passos[1].estado, "atual");
  assert.match(r.passos[1].texto, /Gere o código/);
  assert.match(L.passosCodeWords({ canal: cw({ conectado: false }), aguardandoCodigo: true }).passos[1].texto, /Aguardando você ler o código no celular/);
  // 3) pareado, número ainda não conferido → passo 3 ("Aguardando confirmação", nunca "Não sei")
  r = L.passosCodeWords({ canal: cw({ numero_conferido: null }) });
  assert.equal(r.atual, 3); assert.match(r.passos[2].texto, /Aguardando confirmação/);
  // 4) conferido mas o destino ainda não aponta para o Órbita → passo 4
  r = L.passosCodeWords({ canal: cw({ inscricao: null, service_id: null }) });
  assert.equal(r.atual, 4); assert.match(r.passos[3].texto, /Escolha quem responde primeiro/);
  // 5) tudo configurado → só falta a mensagem de teste (passo 5); com o teste entregue → 6 (tudo pronto)
  r = L.passosCodeWords({ canal: cw() });
  assert.equal(r.atual, 5); assert.equal(r.passos[3].feito, true); assert.match(r.passos[3].texto, /A IA atende primeiro/);
  assert.match(L.passosCodeWords({ canal: cw(), testeEnviado: true }).passos[4].texto, /confirme se chegou/);
  r = L.passosCodeWords({ canal: cw(), testeEnviado: true, testeChegou: true });
  assert.equal(r.atual, 6); assert.ok(r.passos.every(p => p.feito));
  // receber direto também fecha o passo 4
  r = L.passosCodeWords({ canal: cw({ rota: "direta", service_id: null, inscricao: "URL deste canal" }) });
  assert.equal(r.atual, 5); assert.match(r.passos[3].texto, /direto na caixa Conversas/);
});

await teste("M33: o estado vivo do aparelho (nx-codewords/estado) manda mais que o que o banco guardou; um passo só vale se os anteriores valem", () => {
  const sem = { id: "k1", codewords: { tem_api_key: false } };
  assert.equal(L.passosCodeWords({ canal: sem }).atual, 1, "sem chave não há aparelho");
  assert.equal(L.passosCodeWords({ canal: sem, estado: { pareado: true, conectado: true, numero_confere: true, inscrito_certo: true } }).atual, 1, "mesmo com o estado verde, sem chave volta ao passo 1");
  const salvo = { id: "k1", codewords: { tem_api_key: true, conectado: false } };
  assert.equal(L.passosCodeWords({ canal: salvo }).atual, 2);
  assert.equal(L.passosCodeWords({ canal: salvo, estado: { pareado: true, conectado: true, numero_confere: false } }).atual, 3, "pareou: segue para conferir");
  assert.equal(L.passosCodeWords({ canal: salvo, estado: { pareado: true, conectado: true, numero_confere: true, rota_atual: "a", rota_esperada: "b" } }).atual, 4);
  assert.equal(L.passosCodeWords({ canal: salvo, estado: { inscrito_certo: true } }).atual, 5, "inscrito_certo sozinho já confirma aparelho, número e destino");
  assert.equal(L.passosCodeWords({ canal: salvo, estado: { pareado: false, conectado: false } }).atual, 2, "desconectou de novo: volta ao passo 2");
});

await teste("M33: situacaoCodeWords — «Não sei» virou «Aguardando confirmação»; Conectado, Desconectado e Conectado mas sem receber continuam", () => {
  assert.deepEqual(L.situacaoCodeWords({ codewords: {} }), ["Aguardando confirmação", "neutra"]);
  assert.deepEqual(L.situacaoCodeWords(null), ["Aguardando confirmação", "neutra"]);
  assert.deepEqual(L.situacaoCodeWords({ codewords: {} }, { inscrito_certo: true }), ["Conectado", "ok"]);
  assert.deepEqual(L.situacaoCodeWords({ codewords: {} }, { pareado: false }), ["Desconectado", "ruim"]);
  assert.deepEqual(L.situacaoCodeWords({ codewords: {} }, { pareado: true, conectado: true, numero_confere: false }), ["Conectado mas sem receber", "aten"]);
  assert.deepEqual(L.situacaoCodeWords({ codewords: { conectado: false, phone_id: "x" } }), ["Desconectado", "ruim"]);
  assert.deepEqual(L.situacaoCodeWords({ codewords: { conectado: true, numero_conferido: true, rota: "direta", inscricao: "Chega pela URL deste canal" } }), ["Conectado", "ok"]);
  assert.deepEqual(L.situacaoCodeWords({ codewords: { conectado: true, numero_conferido: true, rota: "fluxo", service_id: "s1", inscricao: "s1:ativo" } }), ["Conectado", "ok"]);
  assert.deepEqual(L.situacaoCodeWords({ codewords: { conectado: true, numero_conferido: true, rota: "fluxo", service_id: "s1", inscricao: "outro" } }), ["Conectado mas sem receber", "aten"]);
  assert.doesNotMatch(JSON.stringify([L.situacaoCodeWords(null)]), /Não sei/);
});

await teste("M33: marcosMeta — os mesmos 3 marcos para o número da Meta (token, app inscrito, modelos sincronizados)", () => {
  assert.deepEqual(L.marcosMeta({ tem_token: true, app_inscrito: true }, 3).map(m => [m.id, m.feito]), [["token", true], ["inscrito", true], ["modelos", true]]);
  assert.equal(L.marcosMeta({ tem_token: true, app_inscrito: true }, 3)[2].rotulo, "3 modelos sincronizados");
  assert.equal(L.marcosMeta({ tem_token: true, app_inscrito: true }, 1)[2].rotulo, "1 modelo sincronizado");
  assert.deepEqual(L.marcosMeta({ tem_token: false, app_inscrito: null }, 0).map(m => m.feito), [false, false, false]);
  assert.deepEqual(L.marcosMeta(null).map(m => m.feito), [false, false, false]);
});

await teste("M33: o assistente do CodeWords tem UM primário por passo, desenha uma vez e consulta o aparelho a cada ~5 s só nos passos 2 e 3; a seção usa ui.cabecalho nível 2", () => {
  const s = ler("cv-config.js");
  const bloco = s.slice(s.indexOf("async function assistenteCodeWords(canal)"), s.indexOf("/* ---------------- assistente em 5 passos */"));
  assert.match(bloco, /L\.PASSOS_CODEWORDS\.forEach\(\(p, i\) =>/, "o esqueleto dos 5 passos nasce uma vez");
  assert.match(bloco, /L\.passosCodeWords\(\{ canal: atual, estado: estadoVivo, testeEnviado, testeChegou, aguardandoCodigo \}\)/);
  assert.match(bloco, /\(passoAtual === 2 && aguardandoCodigo\) \|\| passoAtual === 3/, "só os passos 2 e 3 consultam sozinhos");
  assert.match(bloco, /\}, 5000\);/, "a cada ~5 s");
  assert.match(bloco, /5 \* 60000/, "e para depois de 5 minutos");
  assert.match(bloco, /acoes: \[\{ rotulo: "Fechar", tipo: "neutro" \}\]/, "o rodapé só fecha: sem «Salvar configuração» competindo com o passo");
  assert.equal((bloco.match(/class: "bt bt-prim"/g) || []).length, 6, "salvar, gerar código, conferir, ligar na IA, enviar teste e o «copiar prompt» que só nasce depois de pedir o prompt: um por passo");
  assert.match(bloco, /pararPolling\(\);\s*\}\s*$/, "fechar o modal para a consulta");
  assert.match(s, /ui\.cabecalho\(\{ rotulo: "Atendimento", titulo: "Números de WhatsApp", nivel: 2/, "fim do H1 duplicado na seção");
  assert.doesNotMatch(s.slice(s.indexOf("async function montarNumeros"), s.indexOf("/* ============================================================ RESPOSTAS RÁPIDAS */")), /h\("h1"/, "Números de WhatsApp não cria H1");
  assert.match(s, /tipo: "primeiro_uso", titulo: "Nenhum número conectado\."/, "primeiro uso com os passos acendendo");
  assert.match(s, /L\.marcosMeta\(c,/, "Meta com os mesmos marcos");
  assert.doesNotMatch(s, /"Não sei"/);
});

/* ============================================================ M35 — central de conversas por teclado */
console.log("\n(g) M35 — teclado da central");

const EV = (o = {}) => ({ key: "", code: "", altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, isComposing: false, getModifierState: () => false, ...o });
const C = (id, o = {}) => ({ id, status: "aberta", aguardando: false, atribuida_a: null, oculta: false, nao_lidas: 0, ultima_msg_dir: "out", contato: { nome: `Contato ${id}` }, ...o });

await teste("M35: acordeDoEvento — Alt+↓/↑ e Alt+Shift+A/R/N/T/P funcionam dentro do campo; j k / ? só fora dele", () => {
  const a = (o, emCampo = false) => L.acordeDoEvento(EV(o), { emCampo });
  for (const emCampo of [false, true]) {
    assert.equal(a({ key: "ArrowDown", altKey: true }, emCampo), "proxima");
    assert.equal(a({ key: "ArrowUp", altKey: true }, emCampo), "anterior");
    assert.equal(a({ key: "A", code: "KeyA", altKey: true, shiftKey: true }, emCampo), "assumir");
    assert.equal(a({ key: "R", code: "KeyR", altKey: true, shiftKey: true }, emCampo), "resolver");
    assert.equal(a({ key: "N", code: "KeyN", altKey: true, shiftKey: true }, emCampo), "nota");
    assert.equal(a({ key: "T", code: "KeyT", altKey: true, shiftKey: true }, emCampo), "transferir");
    assert.equal(a({ key: "P", code: "KeyP", altKey: true, shiftKey: true }, emCampo), "atender");
  }
  // no Mac Alt+letra muda o caractere (key vira «®»): o código físico manda
  assert.equal(a({ key: "®", code: "KeyR", altKey: true, shiftKey: true }), "resolver");
  // letras soltas: só fora de campo
  assert.equal(a({ key: "j" }), "mover_baixo"); assert.equal(a({ key: "k" }), "mover_cima");
  assert.equal(a({ key: "/" }), "buscar"); assert.equal(a({ key: "?", shiftKey: true }), "ajuda");
  for (const key of ["j", "k", "/", "?"]) assert.equal(a({ key }, true), null, `«${key}» dentro do campo é texto`);
  // nada de letra solta com Alt sem Shift, nem Alt+Shift com outra tecla
  assert.equal(a({ key: "a", code: "KeyA", altKey: true }), null);
  assert.equal(a({ key: "x", code: "KeyX", altKey: true, shiftKey: true }), null);
  assert.equal(a({ key: "ArrowDown", altKey: true, shiftKey: true }), null);
});

await teste("M35: o AltGr do teclado ABNT2 (Ctrl+Alt) e Ctrl/⌘ nunca disparam um acorde; composição de IME também não", () => {
  assert.equal(L.acordeDoEvento(EV({ key: "ArrowDown", altKey: true, ctrlKey: true })), null, "AltGr no Windows chega como Ctrl+Alt");
  assert.equal(L.acordeDoEvento(EV({ key: "R", code: "KeyR", altKey: true, shiftKey: true, ctrlKey: true })), null);
  assert.equal(L.acordeDoEvento(EV({ key: "R", code: "KeyR", altKey: true, shiftKey: true, metaKey: true })), null);
  assert.equal(L.acordeDoEvento(EV({ key: "R", code: "KeyR", altKey: true, shiftKey: true, getModifierState: m => m === "AltGraph" })), null);
  assert.equal(L.acordeDoEvento(EV({ key: "j", ctrlKey: true })), null);
  assert.equal(L.acordeDoEvento(EV({ key: "ArrowDown", altKey: true, isComposing: true })), null);
  assert.equal(L.acordeDoEvento(null), null);
  // todo acorde da folha que usa Alt leva Shift quando é letra (a regra do risco 12 do plano)
  for (const a of L.ACORDES.filter(x => /^Alt\+/.test(x.teclas) && /[A-Z]$/.test(x.teclas))) assert.match(a.teclas, /^Alt\+Shift\+[A-Z]$/, `${a.id}: Alt+Shift+letra`);
  assert.deepEqual(["proxima", "anterior", "assumir", "resolver", "nota", "transferir"].map(id => L.ACORDES.find(a => a.id === id).teclas),
    ["Alt+↓", "Alt+↑", "Alt+Shift+A", "Alt+Shift+R", "Alt+Shift+N", "Alt+Shift+T"], "os acordes do plano");
});

await teste("M35: proximaConversa — vizinha na lista, sem a oculta, null nas pontas; sem conversa aberta parte da 1ª (ou da última)", () => {
  const itens = [C(1), C(2, { oculta: true }), C(3), C(4)];
  assert.equal(L.proximaConversa(itens, 1, 1), 3);
  assert.equal(L.proximaConversa(itens, 3, 1), 4);
  assert.equal(L.proximaConversa(itens, 4, 1), null);
  assert.equal(L.proximaConversa(itens, 3, -1), 1);
  assert.equal(L.proximaConversa(itens, 1, -1), null);
  assert.equal(L.proximaConversa(itens, null, 1), 1);
  assert.equal(L.proximaConversa(itens, null, -1), 4);
  assert.equal(L.proximaConversa(itens, 999, 1), 1, "a aberta saiu da lista");
  assert.equal(L.proximaConversa([], null, 1), null);
});

await teste("M35: proximaParaAtender — a que espera há mais tempo, só aberta, aguardando e sem dono ou minha (nunca a de colega, a oculta ou a resolvida)", () => {
  const h = min => new Date(Date.UTC(2026, 9, 1, 12, 0, 0) - min * 60000).toISOString();
  const itens = [
    C(1, { aguardando: true, ultima_entrada_em: h(5) }),
    C(2, { aguardando: true, ultima_entrada_em: h(40), atribuida_a: "ana" }),           // da colega: fica de fora
    C(3, { aguardando: true, ultima_entrada_em: h(20), atribuida_a: "eu" }),            // minha
    C(4, { aguardando: true, ultima_entrada_em: h(90), oculta: true }),
    C(5, { aguardando: true, ultima_entrada_em: h(60), status: "resolvida" }),
    C(6, { aguardando: false, ultima_entrada_em: h(80) }),
    C(7, { aguardando: true, ultima_entrada_em: h(20) }),                               // empate com a 3: o menor id
  ];
  assert.equal(L.proximaParaAtender(itens, "eu").id, 3);
  assert.equal(L.proximaParaAtender(itens.slice(3, 6), "eu"), null, "ninguém espera");
  assert.equal(L.proximaParaAtender([], "eu"), null);
  assert.equal(L.proximaParaAtender([C(9, { aguardando: true })], "eu").id, 9, "sem hora de entrada ainda conta (vai para o fim)");
  assert.equal(L.proximaParaAtender([C(8, { aguardando: true }), C(9, { aguardando: true, ultima_entrada_em: h(1) })], "eu").id, 9);
});

await teste("M35: proximaAposResolver — a seguinte (ou, no fim, a anterior), sem as já resolvidas, e na aba Resolvidas elas contam", () => {
  const itens = [C(1), C(2), C(3, { status: "resolvida" }), C(4)];
  assert.equal(L.proximaAposResolver(itens, 1).id, 2);
  assert.equal(L.proximaAposResolver(itens, 2).id, 4, "pula a resolvida");
  assert.equal(L.proximaAposResolver(itens, 4).id, 2, "no fim da lista volta para a anterior que ainda serve");
  assert.equal(L.proximaAposResolver([C(1)], 1), null, "fila zerada");
  assert.equal(L.proximaAposResolver(itens, 2, { aba: "resolvidas" }).id, 3);
  assert.equal(L.proximaAposResolver([C(1), C(2, { oculta: true })], 1), null);
  assert.equal(L.proximaAposResolver(itens, 99).id, 1, "a resolvida já saiu da lista: parte do começo");
});

await teste("M35: anúncio da lista — conversa nova (a aberta não), texto «Nova mensagem de Mariana, aguardando há 3 min», vários e 1 a cada 10 s", () => {
  const agora = new Date("2026-10-01T12:00:00Z");
  const antes = [C(1, { nao_lidas: 1, ultima_msg_dir: "in" }), C(2)];
  const depois = [
    C(1, { nao_lidas: 2, ultima_msg_dir: "in", aguardando: true, ultima_entrada_em: "2026-10-01T11:57:00Z", contato: { nome: "Mariana" } }),
    C(2, { nao_lidas: 1, ultima_msg_dir: "out" }),                                       // saída: não anuncia
    C(3, { nao_lidas: 1, ultima_msg_dir: "in", contato: { nome: "Rafael" } }),           // conversa nova
  ];
  const novas = L.novasEntradas(antes, depois);
  assert.deepEqual(novas.map(c => c.id), [1, 3]);
  assert.deepEqual(L.novasEntradas(antes, depois, { ignorar: 1 }).map(c => c.id), [3], "a conversa aberta e à vista fica de fora");
  assert.equal(L.textoNovaMensagem([novas[0]], agora), "Nova mensagem de Mariana, aguardando há 3 min");
  assert.equal(L.textoNovaMensagem([novas[1]], agora), "Nova mensagem de Rafael");
  assert.equal(L.textoNovaMensagem(novas, agora), "2 conversas com mensagem nova, a primeira de Mariana");
  assert.equal(L.textoNovaMensagem([], agora), "");
  assert.equal(L.textoNovaMensagem([C(5, { contato: {}, ultima_msg_dir: "in" })], agora), "Nova mensagem de um contato");
  assert.deepEqual(L.novasEntradas(depois, depois), [], "nada novo: nada a anunciar");
  // no máximo 1 anúncio a cada 10 s
  assert.equal(L.ANUNCIO_INTERVALO_MS, 10000);
  assert.equal(L.esperaAnuncio(0, 1_000_000), 0);
  assert.equal(L.esperaAnuncio(1_000_000, 1_004_000), 6000);
  assert.equal(L.esperaAnuncio(1_000_000, 1_010_000), 0);
  assert.equal(L.esperaAnuncio(1_000_000, 1_020_000), 0);
});

await teste("M40: base e primeira página da central iniciam juntas; falha da base desmonta a lista pendente", () => {
  const cv = ler("conversas.js");
  const listaInicial = cv.indexOf("const listaInicial = carregarLista({ reset: true });");
  const base = cv.indexOf("await carregarBase();", listaInicial);
  const listaAguardar = cv.indexOf("await listaInicial;", base);
  const rota = cv.indexOf("await aplicarRota(ctx.rota);", listaAguardar);
  assert.ok(listaInicial >= 0 && base > listaInicial && listaAguardar > base && rota > listaAguardar);
  assert.match(cv.slice(base, listaAguardar), /catch \(e\) \{\s*desmontar\(\);[\s\S]*ui\.erroCartao\(e, \(\) => montar\(ctx\)\)/);
});

await teste("M22: respostas rápidas do compositor anunciam opções sem aria-expanded inválido no textarea", () => {
  const comp = ler("cv-composer.js");
  assert.doesNotMatch(comp, /ta\.setAttribute\("aria-expanded"/);
  assert.match(comp, /role: "status", "aria-live": "polite", "aria-atomic": "true"/);
  assert.match(comp, /rrStatus\.textContent = rrItens\.length/);
  assert.match(comp, /Resposta rápida aplicada\./);
});

await teste("M35: a tela liga o teclado (um ouvinte que sai ao desmontar, sem se meter em modal), o botão «Atender o próximo» e a paleta (só se o shell oferecer o registro)", () => {
  const cv = ler("conversas.js"), lista = ler("cv-lista.js"), chat = ler("cv-chat.js"), comp = ler("cv-composer.js"), css = ler("conversas.css");
  assert.match(cv, /document\.addEventListener\("keydown", aoTeclaCentral\);\s*A\.limpar\.push\(\(\) => document\.removeEventListener\("keydown", aoTeclaCentral\)\)/);
  assert.match(cv, /if \(!A \|\| ev\.defaultPrevented\) return;\s*if \(document\.querySelector\("dialog\[open\]"\)\) return;/, "com modal aberto o teclado é do modal; quem já tratou a tecla (a paleta do shell) vence");
  assert.match(cv, /A\.L\.acordeDoEvento\(ev, \{ emCampo: emCampoDeTexto\(ev\.target\) \}\)/);
  for (const id of ["proxima", "anterior", "atender", "assumir", "resolver", "nota", "transferir", "mover_baixo", "mover_cima", "buscar", "ajuda", "foco_lista"]) assert.match(cv, new RegExp(`case "${id}":`), `comando ${id}`);
  // a paleta: só com ctx.comandos.registrar; ações do plano (Nova conversa, Atender o próximo) e atalhos exibidos
  assert.match(cv, /if \(!reg \|\| typeof reg\.registrar !== "function"\) return;/);
  assert.match(cv, /def\("atender", "Atender o próximo"/); assert.match(cv, /def\("nova", "Nova conversa"/);
  assert.match(cv, /"Alt\+Shift\+R"/);
  // Atender o próximo: a fila «aguardando», a regra pura, abre, e assume (a IA do CodeWords pausa pelo mesmo caminho do botão)
  assert.match(cv, /rpcC\("nx_cv_listar", \{ p_filtro: \{ aba: "aguardando" \}/);
  assert.match(cv, /const esperando = \(\(r && r\.itens\) \|\| \[\]\)\.filter\(x => !_pendResolver\.has\(x\.id\)\);\s*const c = A\.L\.proximaParaAtender\(esperando, A\.eu && A\.eu\.id\);/,
    "a regra pura escolhe; a recém-resolvida (Desfazer ainda na tela) fica de fora");
  assert.match(cv, /est\.primaria === "assumir_ia"\) await acoes\.assumirIA\(\);\s*else if \(est\.primaria === "assumir"\) await acoes\.assumir\(\);/);
  assert.match(lista, /class: "bt bt-sec bt-p cvl-atender", hidden: true/, "no cabeçalho da lista, só quando há fila");
  assert.match(lista, /btAtender\.hidden = !\(ag > 0\)/);
  assert.match(chat, /cvc-atender[\s\S]{0,200}A\.acoes\.atenderProximo\(ev\.currentTarget\)/, "e no painel vazio");
  // Esc no campo devolve o foco à lista; Alt+Shift+N alterna a nota do próprio compositor
  assert.match(comp, /ev\.key === "Escape" && !ev\.isComposing\) \{ ev\.preventDefault\(\); A\.acoes\.focarLista\(\); return; \}/);
  assert.match(comp, /alternarNota\(forcar\) \{ if \(el\.hidden \|\| !A\.podeEscrever\) return false; alternarNota\(forcar\); return modoNota; \}/);
  assert.match(css, /\.cvl-item:focus-visible \{ outline: 2px solid var\(--c-prim\)/, "o foco do j/k aparece na lista");
});

await teste("M35: Resolver tem Desfazer (ui.acaoComDesfazer «Resolvida · nome»), devolve o estado anterior, abre a próxima só se a preferência estiver ligada e Desfazer volta para a resolvida", () => {
  const cv = ler("conversas.js"), chat = ler("cv-chat.js");
  const f = cv.slice(cv.indexOf("async function resolverComDesfazer"), cv.indexOf("/** Devolve o foco à lista (Esc no campo)"));
  assert.match(f, /A\.ui\.acaoComDesfazer\(\{\s*texto: `Resolvida · \$\{nome\}`/);
assert.match(f, /const antes = conv\.status;/);
  assert.match(f, /const pend = \{ antes: \{ status: antes, aguardando: !!conv\.aguardando, nao_lidas: Number\(conv\.nao_lidas\) \|\| 0 \}, cancelado: false \};/, "Desfazer devolve aberta ou pendente, ainda na fila de espera, como estava");
  // a tela resolve na hora; o servidor só recebe quando o aviso fecha (firmar) — o Desfazer não dispara automação nem tira a conversa da fila de espera
  const aplicar = f.slice(f.indexOf("aplicar: () => {"), f.indexOf("firmar: async"));
  assert.ok(aplicar.length > 100 && !/rpcC?\(/.test(aplicar), "aplicar não fala com o servidor");
  assert.match(aplicar, /trocarConversa\(\{ id, status: "resolvida" \}\)/);
  assert.match(f, /firmar: async \(\{ saindo = false \} = \{\}\) => \{\s*if \(pend\.cancelado\) return;/);
  assert.match(f, /api\.rpc\("nx_cv_status", \{ p_cliente: cliente, p_conversa: id, p_status: "resolvida" \}, saindo \? \{ keepalive: true \} : \{\}\)/, "página saindo: keepalive; a empresa vai fixa (a pessoa pode ter trocado)");
  assert.equal((f.match(/nx_cv_status/g) || []).length - (f.match(/\(nx_cv_status\)/g) || []).length, 1, "uma única escrita: a do firmar (o Desfazer não escreve nada)");
  const volta = f.slice(f.indexOf("const voltarTela = () => {"), f.indexOf("await A.ui.acaoComDesfazer"));
  assert.ok(volta.length > 100 && !/rpcC?\(/.test(volta), "Desfazer só devolve a tela");
  assert.match(volta, /if \(!naMesmaEmpresa\(\)\) return;/, "Desfazer depois de sair de Conversas não quebra (A nulo)");
  assert.match(f, /reverter: voltarTela,/);
  assert.match(cv, /const _pendResolver = new Map\(\);/, "o Resolver pendente sobrevive a sair de Conversas e voltar");
  assert.match(cv, /A\.itens = itensComPendencia\(mais \?/, "o pulso não desfaz na tela o Resolver que ainda espera o Desfazer");
  assert.match(cv, /const pend = _pendResolver\.get\(A\.selId\);\s*if \(pend && !pend\.firmando\) \{[\s\S]{0,220}pend\.cancelado = true; _pendResolver\.delete\(id\); A\.resolvendo\.delete\(id\);/, "«Reabrir» durante o Desfazer cancela o Resolver pendente e libera o próximo Resolver");
  assert.match(cv, /const entradaAntes = Date\.parse\(conv\.ultima_entrada_em \|\| ""\) \|\| 0;/, "o Resolver guarda a última mensagem do cliente vista no clique");
  assert.match(cv, /if \(c && \(Date\.parse\(c\.ultima_entrada_em \|\| ""\) \|\| 0\) > entradaAntes\) \{/, "cliente escreveu durante o aviso: não resolve por cima");
  assert.match(cv, /pend\.firmando = true;/);
  assert.match(cv, /db\.onversionchange = \(\) => \{ try \{ db\.close\(\); \}/, "o Sair consegue apagar a fila (a conexão se fecha)");
  assert.match(f, /const proxima = A\.avancar \? A\.L\.proximaAposResolver\(A\.itens, id, \{ aba: A\.aba \}\) : null;/, "sem a preferência a conversa fica aberta, como sempre foi");
  assert.match(f, /if \(proxima\) \{ A\.focoAoAbrir = "composer"; A\.ctx\.navegar\(`#\/conversas\/\$\{proxima\.id\}`\); \}\s*else \{ A\.focoAoAbrir = "lista"; A\.ctx\.navegar\("#\/conversas"\); \}/, "sem próxima, volta ao painel da fila");
  assert.match(f, /if \(avancou && aindaNaProxima\) \{ A\.focoAoAbrir = "composer"; abrir\(id\); \}/, "Desfazer reabre a resolvida se a próxima abriu sozinha e a pessoa ainda está nela");
  assert.match(f, /if \(A\.resolvendo\.has\(id\)\) return;/, "Alt+Shift+R duas vezes não resolve duas vezes");
  assert.match(f, /conv\.status === "resolvida"\) \{ aviso\("Esta conversa já está resolvida\."\)/);
  // todo caminho de «Resolver» (botão, ✓, menu ⋮ e acorde) passa por ela; só pendente/aberta ficam no status direto
  assert.equal((chat.match(/A\.acoes\.resolver\(/g) || []).length, 3);
  assert.doesNotMatch(chat, /status\("resolvida"/);
  assert.match(cv, /async status\(novo, botao\) \{\s*if \(novo === "resolvida"\) return resolverComDesfazer\(botao\);/);
  // preferência por navegador, desligada até a pessoa ligar; mora no menu ⋮ e na folha de atalhos
  assert.match(cv, /avancar: lerPreferencia\("avancar", "0"\) === "1"/);
  assert.match(cv, /definirAvancar\(sim\) \{\s*A\.avancar = !!sim; gravarPreferencia\("avancar", sim \? "1" : "0"\);/);
  assert.match(chat, /Ao resolver, abrir a próxima: ligado/); assert.match(cv, /rotulo: "Ao resolver, abrir a próxima conversa"/);
  assert.match(chat, /rotulo: "Atalhos de teclado"/);
});

await teste("M35: o leitor de tela ouve a lista (role=status aria-live=polite), com texto na vez se vier dentro dos 10 s, e as conversas novas passam por ele a cada pulso", () => {
  const cv = ler("conversas.js"), lista = ler("cv-lista.js");
  assert.match(lista, /class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true"/);
  assert.match(lista, /L\.esperaAnuncio\(ultimoAnuncio, Date\.now\(\)\)/);
  assert.match(lista, /textoPendente = texto;/);
  assert.match(cv, /const novas = A\.L\.novasEntradas\(A\.itens, r\.itens \|\| \[\], \{ ignorar: A\.selId && !document\.hidden \? A\.selId : null \}\);\s*if \(novas\.length\) A\.lista\.anunciar\(A\.L\.textoNovaMensagem\(novas\)\);/);
  assert.match(cv, /if \(!reset && !mais\) \{\s*avisarNovidades/, "só nos pulsos, nunca na 1ª página nem em «carregar mais»");
});

await teste("M35 (navegador): 3 conversas resolvidas sem mouse no dev-falso (atender, nota, resolver que avança, fila zerada, anúncio, Desfazer) — roda com ORBITA_QA_NAVEGADOR=1", async () => {
  if (process.env.ORBITA_QA_NAVEGADOR !== "1") { console.log("      (pulado: defina ORBITA_QA_NAVEGADOR=1 para abrir o Chrome)"); return; }
  const { createRequire } = await import("node:module");
  const { spawn } = await import("node:child_process");
  const RAIZ = join(AQUI, "..");
  const req = createRequire(join(process.env.ORBITA_PUPPETEER || RAIZ, "x.js"));
  const puppeteer = req("puppeteer-core");
  const chrome = process.env.ORBITA_CHROME || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
  assert.ok(chrome, "Chrome não encontrado (ORBITA_CHROME)");
  const porta = 4800 + Math.floor(Math.random() * 90);
  const srv = spawn(process.execPath, [join(RAIZ, "scripts", "dev-falso.mjs")], { env: { ...process.env, ORBITA_DEV_FALSO_PORT: String(porta) }, stdio: "ignore", windowsHide: true });
  try {
    await new Promise(r => setTimeout(r, 1800));
    const base = `http://127.0.0.1:${porta}`;
    const status = async () => Object.fromEntries((await (await fetch(`${base}/__dev_falso/estado`)).json()).mensagens.map(c => [c.id, c.status]));
    const dorme = ms => new Promise(r => setTimeout(r, ms));
    const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      const erros = []; page.on("pageerror", e => erros.push(String(e.message || e)));
      await page.goto(`${base}/app/?dev-falso=1&dev=1#/inicio`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => { try { localStorage.setItem("nx-cv-aba", "aguardando"); localStorage.setItem("nx-cv-avancar", "1"); } catch { /* ok */ } });
      await page.evaluate(() => { location.hash = "#/conversas"; });
      await dorme(3500);
      const acorde = async (mods, key) => { for (const m of mods) await page.keyboard.down(m); await page.keyboard.press(key); for (const m of mods.slice().reverse()) await page.keyboard.up(m); };
      const foco = () => page.evaluate(() => document.activeElement && document.activeElement.tagName);
      const hash = () => page.evaluate(() => location.hash);
      // 1) Atender o próximo: abre a que espera há mais tempo (902) e assume
      await page.evaluate(() => document.body.focus());
      await acorde(["Alt", "Shift"], "KeyP"); await dorme(2500);
      assert.equal(await hash(), "#/conversas/902"); assert.equal(await foco(), "TEXTAREA", "o cursor já está no campo");
      // nota interna liga e desliga pelo acorde, com o cursor no campo
      await acorde(["Alt", "Shift"], "KeyN"); await dorme(250);
      assert.equal(await page.evaluate(() => document.querySelector(".cvx").dataset.modo), "nota");
      await acorde(["Alt", "Shift"], "KeyN"); await dorme(250);
      assert.equal(await page.evaluate(() => document.querySelector(".cvx").dataset.modo), "texto");
      // Esc devolve o foco à lista; ? abre a folha (fora de campo) e Esc a fecha
      await page.keyboard.press("Escape"); await dorme(250);
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains("cvl-item")), true, "Esc no campo leva o foco à lista");
      await page.keyboard.down("Shift"); await page.keyboard.press("Slash"); await page.keyboard.up("Shift"); await dorme(500);
      assert.equal(await page.evaluate(() => !!document.querySelector("dialog[open] .cv-teclas")), true, "? abre a folha de atalhos");
      await page.keyboard.press("Escape"); await dorme(300);
      // 2) Resolver (avança para a próxima da lista, 901) e 3) resolver de novo (fila zerada: volta ao painel)
      await page.evaluate(() => { const t = document.querySelector(".cvx textarea"); t && t.focus(); });
      await acorde(["Alt", "Shift"], "KeyR"); await dorme(2500);
      assert.equal(await hash(), "#/conversas/901", "a próxima abriu sozinha");
      assert.match(await page.evaluate(() => document.body.innerText), /Resolvida · Rafael Mendes/);
      assert.equal((await status())[902], "aberta", "com o Desfazer na tela, o servidor ainda não foi avisado");
      await acorde(["Alt", "Shift"], "KeyR"); await dorme(2500);
      assert.equal(await hash(), "#/conversas", "sem próxima, volta ao painel da fila");
      await dorme(7500);                                     // os avisos fecham (7 s): agora sim a escrita vai ao servidor
      assert.equal((await status())[902], "resolvida"); assert.equal((await status())[901], "resolvida");
      // 4) o cliente volta a escrever: a lista anuncia a conversa nova; atender + resolver pelo teclado; Desfazer (Ctrl+Z) reabre
      await fetch(`${base}/__dev_falso/simular/mensagem?conversa=902&texto=${encodeURIComponent("Voltei! Podem me ajudar?")}`);
      await dorme(4500);
      assert.match(await page.evaluate(() => (document.querySelector(".cvl [role=status].sr-only") || {}).textContent || ""), /Nova mensagem de Rafael Mendes/);
      await page.evaluate(() => document.body.focus());
      await acorde(["Alt", "Shift"], "KeyP"); await dorme(2500);
      await acorde(["Alt", "Shift"], "KeyR"); await dorme(2000);
      assert.equal(await hash(), "#/conversas", "resolveu na tela");
      assert.equal((await status())[902], "aberta", "mas o servidor só saberá quando o aviso fechar");
      await page.keyboard.press("Escape"); await dorme(200);
      await acorde(["Control"], "KeyZ"); await dorme(2000);
      await dorme(7000);                                     // passou o prazo do aviso: o Desfazer valeu, nada foi ao servidor
      assert.equal((await status())[902], "aberta", "Desfazer: a conversa nunca chegou a ser resolvida no servidor");
      assert.equal(await hash(), "#/conversas/902", "e volta para ela");
      assert.deepEqual(erros, []);
    } finally { await browser.close(); }
  } finally { srv.kill(); }
});

console.log(`\n${ok} ok · ${falhas} falha(s)`);
if (falhas) process.exit(1);
