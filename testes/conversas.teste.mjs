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

console.log(`\n${ok} ok · ${falhas} falha(s)`);
if (falhas) process.exit(1);
