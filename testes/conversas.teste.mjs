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

console.log(`\n${ok} ok · ${falhas} falha(s)`);
if (falhas) process.exit(1);
