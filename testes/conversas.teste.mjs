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
  // o aviso do canal CodeWords deixou de ocupar a conversa: só aparece ao tocar no clipe ou no ⓘ
  assert.match(comp, /const btInfo = h\("button"[^;]*"aria-expanded": "false"/, "botão ⓘ ao lado do clipe");
  assert.match(comp, /capInfo\.hidden = !temAviso \|\| !infoAberta/, "faixa escondida até a pessoa pedir");
  assert.match(comp, /if \(btClipe\.getAttribute\("aria-disabled"\) === "true"\) \{ if \(usaCodeWords\(\)\) mostrarInfoCanal\(true\)/, "tocar no clipe do CodeWords explica o motivo");
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
  assert.match(comp, /otim = await otimizarFoto\(f\);[\s\S]{0,600}L\.validarArquivo\(escolhidoInicial\)/, "otimiza ANTES de validar o limite de 5 MB");
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
});

await teste("M36: filaDevidos (ordem em que a pessoa mandou, só o que já venceu o backoff) e filaDescartavel (outra conta/empresa ou mais de 7 dias)", () => {
  const AG = 10_000_000;
  const itens = [
    { id: "c", estado: "fila", criada_em: 300, proxima_em: 0 },
    { id: "a", estado: "incerto", criada_em: 100, proxima_em: AG - 1 },
    { id: "b", estado: "fila", criada_em: 200, proxima_em: AG + 5000 },
    { id: "x", estado: "falhou", criada_em: 50, proxima_em: 0 },
    { id: "y", estado: "enviando", criada_em: 60, proxima_em: 0 },
  ];
  assert.deepEqual(L.filaDevidos(itens, AG).map(i => i.id), ["a", "c"], "falhou e enviando nunca saem sozinhos; b ainda espera");
  assert.deepEqual(L.filaDevidos(itens, Infinity).map(i => i.id), ["a", "b", "c"], "\"Enviar agora\"/online ignora o backoff");
  const ok = { id: "r", conta: "u1", cliente: "c1", criada_em: AG - 1000 };
  assert.equal(L.filaDescartavel(ok, { conta: "u1", cliente: "c1", agora: AG }), false);
  assert.equal(L.filaDescartavel(ok, { conta: "u2", cliente: "c1", agora: AG }), true, "item de outra conta");
  assert.equal(L.filaDescartavel(ok, { conta: "u1", cliente: "c2", agora: AG }), true, "item de outra empresa");
  assert.equal(L.filaDescartavel({ ...ok, criada_em: AG - L.FILA_TTL_MS - 1 }, { conta: "u1", cliente: "c1", agora: AG }), true, "mais de 7 dias");
  assert.equal(L.filaDescartavel(null, {}), true);
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
  assert.match(comp, /r\.ligar\(ta, `conversa:\$\{A\.selId\}\$\{modoNota \? ":nota" : ""\}`, \{ seloEm: seloRasc \}\)/, "chave por conversa; nota com rascunho próprio");
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
  assert.match(conv, /const persistido = await filaSalvar\(it\);[\s\S]{0,400}transmitir\(it\);\s*\/\/ sem await/, "grava na fila ANTES de transmitir, sem esperar o servidor");
  assert.match(conv, /acao: "texto", conversa: it\.conversa, texto: it\.texto, client_ref: it\.id/, "o MESMO client_ref em toda repetição do item");
  assert.match(conv, /window\.addEventListener\("orbita:online", aoOnline\)/);
  assert.match(conv, /A\.ctx\.rede\.aoVoltar\(\(\) => esvaziarFila\(\{ forcar: true \}\)\)/);
  assert.match(conv, /if \(A\.fila\.itens\.size\) esvaziarFila\(\);\s*clearTimeout\(_pulsoT\)/, "1º pulso bom esvazia a fila");
  assert.match(conv, /setInterval\(\(\) => \{ esvaziarFila\(\); \}, 20000\)/, "e a cada 20 s");
  assert.match(conv, /if \(await transmitir\(it\) === "rede"\) break;/, "na 1ª falha de rede para (a ordem importa)");
  assert.match(conv, /it\.estado = "falhou"; it\.motivo = c\.motivo \|\| A\.ui\.mensagemErro\(e\);\s*await filaSalvar\(it\)/, "falha definitiva: guarda e mostra o motivo");
  assert.match(conv, /ctx\.naoAtualizar\(\(\) => filaPendentes\(\) > 0\)|A\.ctx\.naoAtualizar\(\(\) => filaPendentes\(\) > 0\)/, "fila pendente segura a atualização automática do app");
  assert.match(conv, /L\.filaDescartavel\(it, \{ conta, cliente \}\)/, "item de outra conta ou de mais de 7 dias é descartado");
  assert.match(chat, /Na fila · envia quando a internet voltar/);
  assert.match(chat, /A\.acoes\.enviarAgora\(m\)/); assert.match(chat, /A\.acoes\.cancelarFila\(m\)/);
  assert.match(chat, /novo\.classList\.add\("entra"\)/, "mensagem nova entra com .entra (M10)");
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
  assert.match(cv, /A\.L\.proximaParaAtender\(\(r && r\.itens\) \|\| \[\], A\.eu && A\.eu\.id\)/);
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
  assert.match(f, /const antes = conv\.status;/); assert.match(f, /p_status: antes \}/, "Desfazer devolve aberta ou pendente, como estava");
  assert.match(f, /p_status: "resolvida"/);
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
      assert.equal((await status())[902], "resolvida"); assert.equal(await hash(), "#/conversas/901", "a próxima abriu sozinha");
      assert.match(await page.evaluate(() => document.body.innerText), /Resolvida · Rafael Mendes/);
      await acorde(["Alt", "Shift"], "KeyR"); await dorme(2500);
      assert.equal((await status())[901], "resolvida"); assert.equal(await hash(), "#/conversas", "sem próxima, volta ao painel da fila");
      // 4) o cliente volta a escrever: a lista anuncia a conversa nova; atender + resolver pelo teclado; Desfazer (Ctrl+Z) reabre
      await fetch(`${base}/__dev_falso/simular/mensagem?conversa=902&texto=${encodeURIComponent("Voltei! Podem me ajudar?")}`);
      await dorme(4500);
      assert.match(await page.evaluate(() => (document.querySelector(".cvl [role=status].sr-only") || {}).textContent || ""), /Nova mensagem de Rafael Mendes/);
      await page.evaluate(() => document.body.focus());
      await acorde(["Alt", "Shift"], "KeyP"); await dorme(2500);
      await acorde(["Alt", "Shift"], "KeyR"); await dorme(2000);
      assert.equal((await status())[902], "resolvida");
      await page.keyboard.press("Escape"); await dorme(200);
      await acorde(["Control"], "KeyZ"); await dorme(2000);
      assert.equal((await status())[902], "aberta", "Desfazer reabre a resolvida");
      assert.equal(await hash(), "#/conversas/902", "e volta para ela");
      assert.deepEqual(erros, []);
    } finally { await browser.close(); }
  } finally { srv.kill(); }
});

console.log(`\n${ok} ok · ${falhas} falha(s)`);
if (falhas) process.exit(1);
