/* Fluxos da agenda no servidor local fictício; não chama serviços externos. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = resolve(RAIZ, "scripts/dev-falso.mjs");

async function portaLivre() {
  const s = net.createServer();
  await new Promise((ok, falha) => s.listen(0, "127.0.0.1", ok).once("error", falha));
  const { port } = s.address();
  await new Promise(ok => s.close(ok));
  return port;
}

async function subir(port) {
  const child = spawn(process.execPath, [SCRIPT], { cwd: RAIZ, env: { ...process.env, ORBITA_DEV_FALSO_PORT: String(port) }, stdio: "ignore", windowsHide: true });
  const base = `http://127.0.0.1:${port}`;
  const limite = Date.now() + 6000;
  while (Date.now() < limite) {
    try { if ((await fetch(`${base}/app/index.html`)).status === 200) return { child, base }; } catch { /* iniciando */ }
    await new Promise(r => setTimeout(r, 40));
  }
  child.kill();
  throw new Error("servidor fictício não iniciou");
}

test("agenda local fictícia: marca, bloqueia conflito e desmarca sem rede externa", async () => {
  const codigo = await readFile(SCRIPT, "utf8");
  assert.doesNotMatch(codigo, /99755-2370|Rafaella|Kamiguchi/, "o ambiente fictício não reutiliza identidade ou telefone real da clínica");
  const { child, base } = await subir(await portaLivre());
  const rpc = async (nome, corpo) => {
    const r = await fetch(`${base}/__dev_falso/rest/v1/rpc/${nome}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    assert.equal(r.status, 200);
    return r.json();
  };
  try {
    const pagina = await fetch(`${base}/app/?dev-falso=1`).then(r => r.text());
    const paginaMedicao = await fetch(`${base}/app/?dev-falso=1&boot=0`).then(r => r.text());
    const app = await fetch(`${base}/app/app.js`).then(r => r.text());
    assert.match(app, /DEMO LOCAL · dados fictícios; mensagens e integrações não são reais\./, "a interface deixa claro que não é uma conta conectada");
    assert.match(app, /faixa-demo-local/, "o aviso usa a faixa de sistema, sem cobrir o campo de mensagem");
    assert.doesNotMatch(pagina, /position:fixed;left:50%;bottom:12px/, "o servidor local não injeta mais uma tarja fixa por cima da interface");
    assert.match(pagina, /<script src="\/__dev_falso\/boot\.js"><\/script>/, "o modo fictício normal instala o interceptador de forma compatível com CSP");
    assert.doesNotMatch(paginaMedicao, /__dev_falso\/boot\.js/, "o medidor não adiciona uma busca bloqueante que não existe em produção");

    const rel = await rpc("nx_rel_vendas", {});
    assert.equal(rel.serie.reduce((s, x) => s + x.criados, 0), rel.kpis.criados, "a série diária soma os mesmos negócios criados do KPI");
    assert.equal(rel.serie.reduce((s, x) => s + x.ganhos, 0), rel.kpis.ganhos, "a série diária soma os mesmos ganhos do KPI");
    assert.equal(rel.serie.reduce((s, x) => s + x.receita, 0), rel.kpis.receita, "a receita diária soma o total de vendas do KPI");
    assert.equal(rel.kpis.conversao_pct, Math.round(rel.kpis.ganhos * 1000 / (rel.kpis.ganhos + rel.kpis.perdidos)) / 10, "conversão segue ganhos ÷ (ganhos + perdidos)");
    assert.equal(rel.por_origem.reduce((s, x) => s + x.criados, 0), rel.kpis.criados, "origens somam o total de criados");
    assert.equal(rel.por_origem.reduce((s, x) => s + x.ganhos, 0), rel.kpis.ganhos, "origens somam o total de ganhos");
    assert.equal(rel.por_origem.reduce((s, x) => s + x.receita, 0), rel.kpis.receita, "origens somam o total de receita");

    const lista = filtro => rpc("nx_cv_listar", { p_filtro: filtro, p_limite: 50 });
    const abertas = await lista({ aba: "abertas" });
    assert.deepEqual(abertas.itens.map(x => x.id), [901, 902], "Abertas lista apenas o status aberta, em atividade recente primeiro");
    assert.equal(abertas.contagens.abertas, 2, "o contador de Abertas usa o mesmo estado que a aba");
    assert.equal(abertas.contagens.aguardando, 2, "as duas conversas aguardando também estão abertas");
    assert.deepEqual((await lista({ aba: "pendentes" })).itens.map(x => x.id), [903], "Pendentes é uma fila separada de Abertas");
    assert.deepEqual((await lista({ aba: "sem_dono" })).itens.map(x => x.id), [902], "Sem dono exige conversa aberta/pendente sem responsável");
    assert.deepEqual((await lista({ aba: "minhas" })).itens.map(x => x.id), [901], "Minhas restringe ao atendente atual");
    assert.deepEqual((await lista({ aba: "aguardando" })).itens.map(x => x.id), [902, 901], "Aguardando ordena a entrada mais antiga primeiro");
    assert.deepEqual((await lista({ aba: "abertas", canal_id: "wa1" })).itens.map(x => x.id), [902], "o filtro de número restringe a lista");
    assert.deepEqual((await lista({ aba: "abertas", atendente: "eu" })).itens.map(x => x.id), [901], "o filtro de atendente funciona");
    assert.deepEqual((await lista({ aba: "abertas", atendente: "sem" })).itens.map(x => x.id), [902], "o filtro Sem dono funciona");
    assert.deepEqual((await lista({ aba: "abertas", departamento_id: "d1", etiquetas: ["e1"], nao_lidas: true })).itens.map(x => x.id), [901], "departamento, etiqueta e não lidas podem ser combinados");
    const busca = await lista({ aba: "minhas", busca: "Bianca" });
    assert.deepEqual(busca.itens.map(x => x.id), [903], "busca por nome procura em todas as abas abertas ao solicitante");
    assert.equal(busca.busca, true);
    const filtro = await lista({ aba: "abertas", canal_id: "wa1" });
    assert.equal(filtro.contagens.abertas, abertas.contagens.abertas, "contagens de navegação ignoram filtros secundários, como a RPC real");

    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const livres = await rpc("nx_agenda_livres", { p_a_partir: hoje, p_dias: 14, p_servico: "Clareamento", p_negocio: 803 });
    const slot = livres.horarios.find(x => x.livre);
    assert.ok(slot, "há ao menos um horário fictício livre");

    const marcada = await rpc("nx_agenda_marcar", { p_negocio: 803, p_inicio: slot.inicio, p_servico: "Clareamento" });
    assert.equal(marcada.ok, true);
    assert.equal(marcada.consulta.negocio_id, 803);

    const conflito = await rpc("nx_agenda_marcar", { p_negocio: 801, p_inicio: slot.inicio, p_servico: "Aparelho invisível" });
    assert.deepEqual(conflito, { ok: false, erro: "horario_ocupado" });

    const dia = await rpc("nx_agenda_dia", { p_data: slot.inicio.slice(0, 10), p_dias: 1 });
    assert.ok(dia.consultas.some(x => x.negocio_id === 803));
    assert.equal((await rpc("nx_agenda_desmarcar", { p_negocio: 803, p_motivo: "teste local" })).ok, true);
    const depois = await rpc("nx_agenda_dia", { p_data: slot.inicio.slice(0, 10), p_dias: 1 });
    assert.ok(!depois.consultas.some(x => x.negocio_id === 803));
  } finally { child.kill(); }
});

/* ---- respostas fictícias para as frentes C e D (plano de 01/10/2026): onboarding, p_req, client_ref, nao_lidas, falhas programadas ---- */
async function comServidor(corpo) {
  const { child, base } = await subir(await portaLivre());
  const chamar = async (rota, corpoReq) => {
    const r = await fetch(`${base}${rota}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpoReq || {}) });
    const txt = await r.text();
    return { status: r.status, corpo: txt ? JSON.parse(txt) : null, headers: r.headers };
  };
  const rpc = (nome, p) => chamar(`/__dev_falso/rest/v1/rpc/${nome}`, p);
  const fnx = (nome, p) => chamar(`/__dev_falso/functions/v1/${nome}`, p);
  const sim = async (acao, qs = "") => (await fetch(`${base}/__dev_falso/simular/${acao}${qs}`)).json();
  const estado = async () => (await fetch(`${base}/__dev_falso/estado`)).json();
  try { await corpo({ base, rpc, fnx, sim, estado }); } finally { child.kill(); }
}

test("nx_onboarding_estado: mesmo formato do banco (11 itens, 9 obrigatórios; site e anúncios opcionais), marcam sozinhos e o tenant novo começa em 0", () => comServidor(async ({ rpc, sim }) => {
  const e = (await rpc("nx_onboarding_estado", {})).corpo;
  assert.equal(e.itens.length, 11);
  assert.deepEqual(e.itens.filter(i => i.opcional).map(i => i.id), ["script_site", "anuncios_ligados"]);
  assert.equal(e.total, 11);
  assert.equal(e.obrigatorios, 9);
  assert.ok(e.feitos > 0 && e.feitos < e.total, "estado parcial por padrão");
  assert.equal(e.obrigatorios_feitos, 8); assert.equal(e.pct, 89); assert.equal(e.completo, false);
  // só o que a migração 20261002d devolve: nada de rota nem de "dispensado até" (isso é da tela)
  assert.deepEqual(Object.keys(e).sort(), ["completo", "feitos", "itens", "obrigatorios", "obrigatorios_feitos", "pct", "total"]);
  assert.ok(e.itens.every(i => !("rota" in i)));
  const novo = (await sim("onboarding", "?modo=novo")).estado;
  assert.equal(novo.feitos, 0); assert.equal(novo.pct, 0);
  assert.equal(novo.itens.find(i => i.id === "chave_codewords").feito, false);
  await rpc("nx_codewords_canal_salvar", { p_canal: { id: "cw1" } });
  assert.equal((await rpc("nx_onboarding_estado", {})).corpo.itens.find(i => i.id === "chave_codewords").feito, true, "salvar a chave marca o passo 1 sem recarregar");
  const completo = (await sim("onboarding", "?modo=completo")).estado;
  assert.equal(completo.completo, true);
  assert.equal(completo.feitos, completo.total);
  assert.equal(completo.obrigatorios_feitos, 9); assert.equal(completo.pct, 100);
}));

test("marca fictícia: produto e cores hex válidas podem ser trocados para QA white-label; entrada inválida é ignorada", () => comServidor(async ({ rpc, sim }) => {
  await sim("marca", "?produto=Cl%C3%ADnica%20A&primaria=%230E6B7A&secundaria=%23A8D5BA&fundo=%23F7F9FA&cor=%23nope");
  let marca = (await rpc("nx_marca_publica", { p_host: "", p_org: "nexus" })).corpo.marca;
  assert.equal(marca.produto, "Clínica A");
  assert.deepEqual(marca.cores, { primaria: "#0E6B7A", secundaria: "#A8D5BA", fundo: "#F7F9FA" });
  await sim("marca", "?produto=Cl%C3%ADnica%20B&primaria=red&secundaria=%23FFF");
  marca = (await rpc("nx_marca_publica", { p_host: "", p_org: "nexus" })).corpo.marca;
  assert.equal(marca.produto, "Clínica B");
  assert.deepEqual(marca.cores, { primaria: "#B0761F", secundaria: "#6FA3CF", fundo: "#07090C" }, "cores inválidas nunca chegam à tela");
}));

test("p_req: a mesma intenção repetida não cria outra linha (negócio, contato, tarefa)", () => comServidor(async ({ rpc, estado }) => {
  const antes = await estado();
  const req = "11111111-1111-4111-8111-111111111111";
  const a = (await rpc("nx_negocio_salvar", { p_negocio: { contato_id: 501, titulo: "Teste de req" }, p_req: req })).corpo;
  const b = (await rpc("nx_negocio_salvar", { p_negocio: { contato_id: 501, titulo: "Teste de req" }, p_req: req })).corpo;
  assert.equal(a.id, b.id, "mesmo resultado");
  const c = (await rpc("nx_negocio_salvar", { p_negocio: { contato_id: 501, titulo: "Teste de req" }, p_req: "22222222-2222-4222-8222-222222222222" })).corpo;
  assert.notEqual(c.id, a.id, "outro p_req = outra criação");
  assert.equal((await estado()).negocios, antes.negocios + 2);
  const t1 = (await rpc("nx_tarefa_salvar", { p_tarefa: { titulo: "Ligar" }, p_req: req })).corpo;
  const t2 = (await rpc("nx_tarefa_salvar", { p_tarefa: { titulo: "Ligar" }, p_req: req })).corpo;
  assert.equal(t1.id, t2.id);
  const k1 = (await rpc("nx_contato_salvar", { p_contato: { nome: "Novo", telefone: "(12) 99111-2222" }, p_req: req })).corpo;
  const k2 = (await rpc("nx_contato_salvar", { p_contato: { nome: "Novo", telefone: "(12) 99111-2222" }, p_req: req })).corpo;
  assert.equal(k1.id, k2.id);
  const dup = await rpc("nx_contato_salvar", { p_contato: { nome: "Outro", telefone: "12991112222" } });
  assert.equal(dup.status, 400);
  assert.equal(dup.corpo.message, "telefone_em_uso");
  assert.equal(String(dup.corpo.hint), String(k1.id), "o telefone repetido aponta o cadastro existente");
  const achados = (await rpc("nx_contatos_listar", { p_filtro: { busca: "991112222" }, p_por_pagina: 8 })).corpo;
  assert.equal(achados.itens.length, 1, "busca por dígitos do telefone");
}));

test("client_ref: o mesmo client_ref duas vezes = 1 mensagem e 1 envio externo; a mensagem aparece em nx_cv_mensagens", () => comServidor(async ({ rpc, fnx, estado }) => {
  const antes = await estado();
  const ref = "aaaaaaaa-0000-4000-8000-000000000001";
  const a = (await fnx("nx-enviar", { acao: "texto", conversa: 902, texto: "Olá!", client_ref: ref })).corpo;
  const b = (await fnx("nx-enviar", { acao: "texto", conversa: 902, texto: "Olá!", client_ref: ref })).corpo;
  assert.equal(a.ok, true); assert.equal(a.mensagem.id, b.mensagem.id);
  const depois = await estado();
  assert.equal(depois.enviosExternos, antes.enviosExternos + 1, "uma só chamada externa");
  assert.equal(depois.mensagens.find(c => c.id === 902).total, antes.mensagens.find(c => c.id === 902).total + 1, "uma só mensagem gravada");
  const lista = (await rpc("nx_cv_mensagens", { p_conversa: 902 })).corpo.itens;
  assert.equal(lista.filter(m => m.client_ref === ref).length, 1);
  await fnx("nx-enviar", { acao: "texto", conversa: 902, texto: "Outra", client_ref: "aaaaaaaa-0000-4000-8000-000000000002" });
  assert.equal((await estado()).enviosExternos, antes.enviosExternos + 2);
}));

test("client_ref em andamento: o nx-enviar pode responder 409 envio_em_andamento N vezes (sem enviar) e depois enviar normalmente", () => comServidor(async ({ fnx, sim, estado }) => {
  const antes = await estado();
  const ref = "aaaaaaaa-0000-4000-8000-000000000003";
  await sim("falha", "?rpc=nx-enviar&status=409&codigo=envio_em_andamento&vezes=2");
  for (let i = 0; i < 2; i++) {
    const r = await fnx("nx-enviar", { acao: "texto", conversa: 902, texto: "Olá!", client_ref: ref });
    assert.equal(r.status, 409);
    assert.deepEqual(r.corpo, { ok: false, erro: "envio_em_andamento" }, "mesmo corpo da função real");
  }
  assert.equal((await estado()).enviosExternos, antes.enviosExternos, "enquanto está em andamento nada sai");
  const ok = await fnx("nx-enviar", { acao: "texto", conversa: 902, texto: "Olá!", client_ref: ref });
  assert.equal(ok.status, 200); assert.equal(ok.corpo.ok, true);
  assert.equal((await estado()).enviosExternos, antes.enviosExternos + 1);
}));

test("nx_pulso: exatamente {v, notif, nao_lidas, canais, agora} da 20261008b + 20261009b; mensagem simulada muda v e a contagem; resolvida sai da conta", () => comServidor(async ({ rpc, sim }) => {
  const p1 = (await rpc("nx_pulso", {})).corpo;
  assert.deepEqual(Object.keys(p1).sort(), ["agora", "canais", "nao_lidas", "notif", "v"], "nada além do que a RPC real devolve");
  assert.ok(p1.canais.length >= 2 && p1.canais.every(k => k.id && k.nome && ["conectado", "desconectado", "desconhecido"].includes(k.estado) && "desde" in k), "canais [{id, nome, estado, desde}]");
  assert.equal(p1.nao_lidas, 2, "conversas com mensagens não lidas (901 e 902)");
  const r = await sim("mensagem", "?conversa=903&texto=Oi%20de%20novo");
  assert.equal(r.mensagem.direcao, "in");
  const p2 = (await rpc("nx_pulso", {})).corpo;
  assert.notEqual(p2.v, p1.v, "o pulso muda");
  assert.equal(p2.nao_lidas, 3);
  await rpc("nx_cv_status", { p_conversa: 902, p_status: "resolvida" });
  assert.equal((await rpc("nx_pulso", {})).corpo.nao_lidas, 2, "só abertas/pendentes contam, como na RPC real");
}));

test("falha programada: 503 N vezes (com Retry-After), atraso e 'depois de aplicar'; sessão invalidada → 401 sessao_invalida até entrar de novo", () => comServidor(async ({ rpc, sim, estado }) => {
  await sim("falha", "?rpc=nx_inicio&status=503&vezes=2&retryAfter=1");
  const f1 = await rpc("nx_inicio", {}); assert.equal(f1.status, 503); assert.equal(f1.headers.get("retry-after"), "1");
  assert.equal((await rpc("nx_inicio", {})).status, 503);
  assert.equal((await rpc("nx_inicio", {})).status, 200, "depois das N falhas volta ao normal");
  const antes = (await estado()).tarefas;
  await sim("falha", "?rpc=nx_tarefa_salvar&status=504&vezes=1&depois=1");
  assert.equal((await rpc("nx_tarefa_salvar", { p_tarefa: { titulo: "Aplicou e deu 504" }, p_req: "33333333-3333-4333-8333-333333333333" })).status, 504);
  assert.equal((await estado()).tarefas, antes + 1, "o servidor aplicou mesmo respondendo 504");
  const rep = await rpc("nx_tarefa_salvar", { p_tarefa: { titulo: "Aplicou e deu 504" }, p_req: "33333333-3333-4333-8333-333333333333" });
  assert.equal(rep.status, 200); assert.equal((await estado()).tarefas, antes + 1, "repetir com o mesmo p_req não duplica");
  const t0 = Date.now();
  await sim("falha", "?rpc=nx_inicio&atraso=300&vezes=1");
  assert.equal((await rpc("nx_inicio", {})).status, 200);
  assert.ok(Date.now() - t0 >= 280, "atraso aplicado");
  assert.equal((await rpc("nx_inicio", { p_token: "demo-local-session" })).status, 200, "por padrão a sessão não é verificada");
  await sim("sessao-invalida");
  const inv = await rpc("nx_inicio", { p_token: "demo-local-session" });
  assert.equal(inv.status, 401); assert.equal(inv.corpo.message, "sessao_invalida");
  assert.equal((await rpc("nx_marca_publica", {})).status, 200, "rotas públicas seguem abertas");
  const novo = (await rpc("nx_entrar", { p_email: "a@b.c", p_senha: "x" })).corpo.token;
  assert.equal((await rpc("nx_inicio", { p_token: novo })).status, 200, "o token novo vale");
  assert.equal((await rpc("nx_inicio", { p_token: "demo-local-session" })).status, 401, "o antigo continua inválido");
}));

test("sessão: entrar de novo devolve token da MESMA conta; com ?outra=1 o próximo token é de OUTRA conta (para testar a troca de conta)", () => comServidor(async ({ rpc, sim }) => {
  const a = (await rpc("nx_app_sessao", { p_token: "demo-local-session" })).corpo.conta.id;
  await sim("sessao-invalida");
  const t1 = (await rpc("nx_entrar", { p_email: "a@b.c", p_senha: "x" })).corpo.token;
  assert.equal((await rpc("nx_app_sessao", { p_token: t1 })).corpo.conta.id, a, "mesma conta");
  await sim("sessao-invalida", "?outra=1");
  const t2 = (await rpc("nx_entrar", { p_email: "a@b.c", p_senha: "x" })).corpo.token;
  assert.notEqual((await rpc("nx_app_sessao", { p_token: t2 })).corpo.conta.id, a, "outra conta");
}));

test("mídia fictícia: nx-midia subir valida tipo e tamanho (WAV incluído), o upload fica no servidor local e o nx-enviar midia devolve a mensagem enviada com a mídia, em qualquer canal", () => comServidor(async ({ base, rpc, fnx, estado }) => {
  const antes = await estado();
  // subir: mesmas regras do nx-midia de verdade; o endereço de upload nunca aponta para um servidor real
  const erro = async c => (await fnx("nx-midia", { acao: "subir", ...c })).corpo;
  assert.deepEqual(await erro({ mime: "image/svg+xml", tamanho: 10 }), { ok: false, erro: "midia_tipo" });
  assert.deepEqual(await erro({ mime: "image/png", tamanho: 6 * 1024 * 1024 }), { ok: false, erro: "midia_grande" });
  assert.deepEqual(await erro({ mime: "audio/wav", tamanho: 17 * 1024 * 1024 }), { ok: false, erro: "midia_grande" });
  assert.deepEqual(await erro({ mime: "audio/wav" }), { ok: false, erro: "dados_invalidos" });
  const casos = [
    [901, "image/jpeg", "jpg", "foto.jpg", "Olha a foto", "imagem", "Olha a foto"],          // canal CodeWords
    [901, "audio/wav", "wav", "audio-orbita-1790000000000.wav", "ignorada", "audio", null],  // áudio gravado na tela (WAV), sem legenda
    [901, "audio/x-wav", "wav", "voz.wav", undefined, "audio", null],
    [902, "application/pdf", "pdf", "orcamento.pdf", undefined, "documento", null],          // canal Meta
    [902, "video/mp4", "mp4", "video.mp4", "Segue o vídeo", "video", "Segue o vídeo"],
  ];
  let n = 0;
  for (const [conversa, mime, ext, nome, legenda, tipo, corpo] of casos) {
    const s = (await fnx("nx-midia", { acao: "subir", nome, mime, tamanho: 5 })).corpo;
    assert.equal(s.ok, true, mime);
    assert.match(s.path, new RegExp(`^[0-9a-f-]{36}/out/\\d{4}-\\d{2}/[0-9a-f-]{36}\\.${ext}$`), mime);
    const u = new URL(s.upload_url);
    assert.equal(u.protocol, "https:", "a tela só aceita upload em https");
    assert.equal(u.hostname, "dev-falso.invalid", "host que não existe: sem o boot.js nada sai do computador");
    // o boot.js troca o host pelo servidor local (testado abaixo); aqui o PUT vai direto para lá
    const put = await fetch(`${base}/__dev_falso${u.pathname}${u.search}`, { method: "PUT", headers: { "content-type": mime, "x-upsert": "true" }, body: new Uint8Array([1, 2, 3, 4, 5]) });
    assert.equal(put.status, 200, mime);
    const ref = `bbbbbbbb-0000-4000-8000-00000000000${++n}`;
    const pedido = { acao: "midia", conversa, path: s.path, mime, nome, legenda, tamanho: 5, client_ref: ref };
    const a = (await fnx("nx-enviar", pedido)).corpo;
    assert.equal(a.ok, true, mime);
    assert.equal(a.mensagem.tipo, tipo); assert.equal(a.mensagem.corpo, corpo); assert.equal(a.mensagem.status, "enviada");
    assert.equal(a.mensagem.direcao, "out"); assert.equal(a.mensagem.conversa_id, conversa);
    assert.deepEqual(a.mensagem.midia, { path: s.path, mime: mime === "audio/x-wav" ? "audio/wav" : mime, nome, tamanho: 5, estado: "ok" });
    const b = (await fnx("nx-enviar", pedido)).corpo;
    assert.equal(b.repetida, true); assert.equal(b.mensagem.id, a.mensagem.id, "o mesmo client_ref não envia de novo");
    const gravada = (await rpc("nx_cv_mensagens", { p_conversa: conversa })).corpo.itens.find(m => m.id === a.mensagem.id);
    assert.equal(gravada.tipo, tipo); assert.deepEqual(gravada.midia, a.mensagem.midia, "a mídia aparece ao reabrir a conversa");
  }
  const depois = await estado();
  assert.equal(depois.enviosExternos, antes.enviosExternos + casos.length, "um envio por intenção");
  assert.equal(depois.uploads, casos.length);
  const lista = (await rpc("nx_cv_listar", { p_filtro: { aba: "abertas" }, p_limite: 50 })).corpo.itens;
  assert.equal(lista.find(c => c.id === 901).ultima_msg_resumo, "Áudio", "mídia sem legenda tem resumo na lista");
  assert.equal(lista.find(c => c.id === 902).ultima_msg_resumo, "Segue o vídeo");
  // caminho que não é da pasta de envio da empresa, tipo recusado e conversa inexistente
  const ok = (await fnx("nx-midia", { acao: "subir", nome: "a.jpg", mime: "image/jpeg", tamanho: 5 })).corpo;
  assert.equal((await fnx("nx-enviar", { acao: "midia", conversa: 901, path: "outro-cliente/out/2026-10/x.jpg", mime: "image/jpeg" })).corpo.erro, "midia_nao_encontrada");
  assert.equal((await fnx("nx-enviar", { acao: "midia", conversa: 901, path: ok.path, mime: "image/svg+xml" })).corpo.erro, "midia_tipo");
  assert.equal((await fnx("nx-enviar", { acao: "midia", conversa: 999999, path: ok.path, mime: "image/jpeg" })).corpo.erro, "conversa_nao_encontrada");
  assert.equal((await fetch(`${base}/__dev_falso/storage/v1/object/upload/sign/nx-midia/outro/in/x.jpg`, { method: "PUT", body: "x" })).status, 400, "upload só no caminho que o subir devolveu");
  assert.equal((await estado()).enviosExternos, depois.enviosExternos, "pedido recusado não conta envio");
  // as outras ações continuam como antes
  assert.deepEqual((await fnx("nx-midia", { acao: "ver", paths: [ok.path] })).corpo, { ok: true, url: null });
  assert.equal((await fnx("nx-enviar", { acao: "lido", conversa: 901 })).corpo.ok, true);
}));

test("boot.js fictício: fetch E XMLHttpRequest para o Supabase (ou para o host de upload fictício) são trocados pelo servidor local; o resto não muda", () => comServidor(async ({ base }) => {
  const codigo = await (await fetch(`${base}/__dev_falso/boot.js`)).text();
  const pedidos = [], abertos = [];
  class XHR { open(...a) { abertos.push(a); return "aberto"; } }
  const origem = "http://127.0.0.1:4173";
  const guardado = new Map();
  const armazem = { getItem: k => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v), removeItem: k => guardado.delete(k) };
  const janela = { fetch: (u, init) => { pedidos.push([String(u), init]); return "resposta"; } };
  const local = { hostname: "127.0.0.1", search: "?dev-falso=1", href: `${origem}/app/?dev-falso=1`, origin: origem, hash: "" };
  const rodar = (window, location) => new Function("window", "location", "localStorage", "sessionStorage", "XMLHttpRequest", codigo)(window, location, armazem, armazem, XHR);
  rodar(janela, local);
  // H1: o app (e o rastreio-config) sabem que estão no fictício e para onde o snippet do site deve apontar
  assert.deepEqual(janela.ORBITA_DEV_FALSO, { origem, rastreio: { script: `${origem}/rastreio.js`, url: `${origem}/rest/v1/rpc/nx_rastreio_registrar`, apikey: "dev-falso", site: `${origem}/__dev_falso/site.html` } });
  janela.fetch("https://dtjznipitihnwmcgpzqh.supabase.co/functions/v1/nx-enviar", { method: "POST" });
  janela.fetch("/app/versao.json");
  assert.equal(pedidos[0][0], `${origem}/__dev_falso/functions/v1/nx-enviar`);
  assert.deepEqual(pedidos[0][1], { method: "POST" });
  assert.equal(pedidos[1][0], "/app/versao.json", "pedido local segue igual");
  const x = new XHR();
  assert.equal(x.open("PUT", "https://dev-falso.invalid/storage/v1/object/upload/sign/nx-midia/c/out/2026-10/a.wav?token=dev-falso"), "aberto");
  x.open("PUT", "https://dtjznipitihnwmcgpzqh.supabase.co/storage/v1/object/upload/sign/nx-midia/c/out/2026-10/b.jpg?token=t", true);
  x.open("GET", "/app/versao.json");
  x.open("GET", "https://exemplo.test/outro");
  assert.deepEqual(abertos, [
    ["PUT", `${origem}/__dev_falso/storage/v1/object/upload/sign/nx-midia/c/out/2026-10/a.wav?token=dev-falso`],
    ["PUT", `${origem}/__dev_falso/storage/v1/object/upload/sign/nx-midia/c/out/2026-10/b.jpg?token=t`, true],
    ["GET", "/app/versao.json"],
    ["GET", "https://exemplo.test/outro"],
  ], "upload por XHR nunca sai do computador; os demais argumentos do open são preservados");
  // fora do computador local o boot não instala nada
  const fora = { fetch: () => "original" }, antes = XHR.prototype.open;
  rodar(fora, { ...local, hostname: "orbita-nexus-ads.netlify.app" });
  assert.equal(fora.fetch(), "original"); assert.equal(XHR.prototype.open, antes); assert.equal(fora.ORBITA_DEV_FALSO, undefined, "fora do loopback o boot não faz nada");
}));

/* ---- plano 100 · frente H: os contratos 1–12 do plano espelhados com dados fictícios (a onda 2 testa as telas AQUI, nunca na produção) ---- */
test("rastreio (contratos 1 e 2): chave de 48 hex, nx_rastreio_registrar servido SEM prefixo e com CORS, teste sem gravar, atribuir no canal Meta, pendente aplicado quando o negócio nasce, listar sem o código, limite de taxa e troca de chave", () => comServidor(async ({ base, rpc, estado }) => {
  const { chave } = (await rpc("nx_entrada_chave", { p_gerar: false })).corpo;
  assert.match(chave, /^[0-9a-f]{48}$/, "a chave fictícia passa na validação do web/rastreio.js (48 hex)");
  const antes = (await estado()).rastreio;
  // o endereço que o snippet usa (sem /__dev_falso), com o cabeçalho apikey do script e o preflight CORS do site (outra origem)
  const pre = await fetch(`${base}/rest/v1/rpc/nx_rastreio_registrar`, { method: "OPTIONS" });
  assert.equal(pre.status, 204); assert.match(pre.headers.get("access-control-allow-headers"), /apikey/);
  const registrar = async (dados, k = chave) => {
    const r = await fetch(`${base}/rest/v1/rpc/nx_rastreio_registrar`, { method: "POST", headers: { "content-type": "application/json", apikey: "sb_publishable_x" }, body: JSON.stringify({ p_chave: k, p_dados: dados }) });
    return { status: r.status, cors: r.headers.get("access-control-allow-origin"), corpo: await r.json() };
  };
  const a = await registrar({ utm_source: "instagram", utm_medium: "paid_social", utm_campaign: "Avaliação humanizada", pagina: "https://site.test/avaliacao?x=1#topo" });
  assert.equal(a.status, 200); assert.equal(a.cors, "*"); assert.equal(a.corpo.ok, true); assert.match(a.corpo.codigo, /^[A-HJKMNP-Z2-9]{5}$/);
  const t = await registrar({ teste: "1" });
  assert.equal(t.corpo.teste, true); assert.match(t.corpo.codigo, /^[A-HJKMNP-Z2-9]{5}$/);
  assert.equal((await registrar({}, "f".repeat(48))).corpo.ok, true, "chave errada: código plausível sem gravar (não revela nada)");
  assert.equal((await estado()).rastreio.cliques, antes.cliques + 1, "só o clique com a chave certa foi gravado (teste e chave errada não)");
  // atribuir no canal META (contrato 1): o negócio aberto do telefone ganha origem/plataforma/campanha e o rastreio
  const at = (await rpc("nx_rastreio_atribuir", { p_canal: "wa1", p_telefone: "+55 (00) 0000-0502", p_codigo: a.corpo.codigo })).corpo;
  assert.equal(at.aplicado, true); assert.equal(at.negocio_id, 802); assert.equal(at.plataforma, "meta"); assert.equal(at.origem, "anuncio");
  const n = (await rpc("nx_negocio_ver", { p_id: 802 })).corpo.negocio;
  assert.equal(n.plataforma, "meta"); assert.equal(n.campanha_nome, "Avaliação humanizada");
  assert.equal(n.rastreio.codigo, a.corpo.codigo); assert.equal(n.rastreio.pagina, "https://site.test/avaliacao", "página sem ? nem #");
  assert.equal((await rpc("nx_rastreio_atribuir", { p_canal: "wa1", p_telefone: "5500000000502", p_codigo: a.corpo.codigo })).corpo.repetido, true, "o mesmo código pelo mesmo telefone = repetido");
  assert.equal((await rpc("nx_rastreio_atribuir", { p_canal: "cw1", p_telefone: "5500000000501", p_codigo: a.corpo.codigo })).corpo.motivo, "codigo_ja_usado");
  assert.equal((await rpc("nx_rastreio_atribuir", { p_canal: "cw1", p_telefone: "5500000000501", p_codigo: "ZZZZZ" })).corpo.motivo, "codigo_desconhecido");
  assert.equal((await rpc("nx_rastreio_atribuir", { p_canal: "cw1", p_telefone: "5500000000501", p_codigo: "ref" })).corpo.motivo, "codigo_invalido");
  assert.equal((await rpc("nx_rastreio_atribuir", { p_canal: "nenhum", p_telefone: "5500000000501", p_codigo: "ABCDE" })).corpo.message, "canal_nao_encontrado");
  // sem negócio: fica pendente pelo telefone e é aplicado quando o negócio nasce (o gatilho nx_tg_rastreio_pendente)
  const b = await registrar({ gclid: "Cj0-teste", utm_campaign: "Implante · pesquisa" });
  assert.deepEqual((await rpc("nx_rastreio_atribuir", { p_canal: "cw1", p_telefone: "5512988887777", p_codigo: b.corpo.codigo })).corpo, { ok: true, aplicado: false, motivo: "sem_negocio", pendente: true });
  assert.equal((await estado()).rastreio.pendentes, antes.pendentes + 1);
  const novo = (await rpc("nx_negocio_salvar", { p_negocio: { titulo: "Implante", contato: { nome: "Novo do site", telefone: "(12) 98888-7777" }, origem: "whatsapp" } })).corpo;
  assert.equal(novo.origem, "anuncio"); assert.equal(novo.plataforma, "google"); assert.equal(novo.rastreio.codigo, b.corpo.codigo);
  assert.equal((await estado()).rastreio.pendentes, antes.pendentes);
  // listar (admin+): o formato de nx_rastreio_listar (20261008a) — sem o código, com origem/usado_em e os 4 totais
  const lista = (await rpc("nx_rastreio_listar", { p_dias: 30 })).corpo;
  assert.equal(lista.dias, 30);
  assert.equal(lista.totais.cliques, antes.cliques + 2); assert.equal(lista.totais.casados, antes.casados + 2);
  assert.deepEqual(Object.keys(lista.totais).sort(), ["casados", "cliques", "pendentes", "usados"]);
  const item = lista.itens.find(x => x.negocio_id === 802);
  assert.deepEqual(Object.keys(item).sort(), ["casou", "contato_nome", "em", "motivo", "negocio_id", "origem", "pagina", "plataforma", "usado_em", "utm_campaign", "utm_content", "utm_medium", "utm_source"]);
  assert.equal(item.casou, true); assert.equal(item.contato_nome, "Rafael Mendes"); assert.equal(item.motivo, "aplicado"); assert.equal(item.origem, "anuncio"); assert.ok(item.usado_em);
  assert.ok(lista.itens.every(x => !("codigo" in x)), "o código nunca sai na lista");
  assert.ok(lista.itens.some(x => x.motivo === "pendente" && !x.casou), "os cliques de partida trazem um pendente (motivo «pendente» enquanto espera o negócio)");
  // classificação do contrato 1 (nx_rastreio_plataforma): instagram/fbclid sem medium pago = orgânico na Meta
  const org = await registrar({ utm_source: "instagram", fbclid: "IwAR-x" });
  assert.deepEqual((({ plataforma, origem }) => [plataforma, origem])((await rpc("nx_rastreio_listar", { p_dias: 1 })).corpo.itens[0]), ["meta", "organico"]);
  await rpc("nx_negocio_salvar", { p_negocio: { titulo: "Org", contato: { nome: "Orgânica", telefone: "(12) 97777-6666" }, origem: "whatsapp" } });
  const r2 = (await rpc("nx_rastreio_atribuir", { p_canal: "cw1", p_telefone: "5512977776666", p_codigo: org.corpo.codigo })).corpo;
  assert.equal(r2.origem, "organico"); assert.equal(r2.plataforma, "meta"); assert.equal(r2.campanha_ext, null);
  // campanha conhecida (nx_metricas_dia — aqui as linhas da demo) casa por NOME: vira anúncio mesmo sem medium pago, com campanha_ext = id
  const conhecida = await registrar({ utm_source: "facebook", utm_medium: "social", utm_campaign: "Invisível · ângulo dor", utm_content: "Carrossel · como funciona o alinhador" });
  await rpc("nx_negocio_salvar", { p_negocio: { titulo: "Conhecida", contato: { nome: "Da campanha", telefone: "(12) 96666-5555" }, origem: "whatsapp" } });
  const r3 = (await rpc("nx_rastreio_atribuir", { p_canal: "wa1", p_telefone: "5512966665555", p_codigo: conhecida.corpo.codigo })).corpo;
  assert.deepEqual([r3.origem, r3.plataforma, r3.campanha_ext, r3.campanha_nome, r3.anuncio_ext], ["anuncio", "meta", "m1", "Invisível · ângulo dor", "m1b"]);
  const vista = (await rpc("nx_rastreio_listar", { p_dias: 1 })).corpo.itens.find(x => x.utm_campaign === "Invisível · ângulo dor");
  assert.equal(vista.origem, "anuncio"); assert.equal(vista.casou, true);
  // limite de taxa (120 por minuto): já houve 4 cliques gravados neste minuto (a, b, org, conhecida); o 121º é recusado com hint em português
  for (let i = 0; i < 116; i++) assert.equal((await registrar({})).status, 200);
  const lim = await registrar({});
  assert.equal(lim.status, 400); assert.equal(lim.corpo.message, "limite_taxa"); assert.match(lim.corpo.hint, /120/);
  // «Gerar nova chave»: a antiga deixa de valer (código plausível, nada gravado) e o site de teste passa a usar a nova
  const nova = (await rpc("nx_entrada_chave", { p_gerar: true })).corpo.chave;
  assert.notEqual(nova, chave); assert.match(nova, /^[0-9a-f]{48}$/);
  const cliques = (await estado()).rastreio.cliques;
  assert.equal((await registrar({}, chave)).corpo.ok, true); assert.equal((await estado()).rastreio.cliques, cliques, "a chave antiga não grava mais");
  const site = await (await fetch(`${base}/__dev_falso/site.html`)).text();
  assert.ok(site.includes(`data-chave="${nova}"`) && site.includes('data-url="/rest/v1/rpc/nx_rastreio_registrar"'), "o site de teste carrega o script com a chave atual apontando para ESTE servidor");
  assert.doesNotMatch(site, /supabase\.co|jpfamelli\.github\.io|netlify\.app/, "nada no site de teste aponta para a produção");
  assert.equal((await fetch(`${base}/rastreio.js`)).status, 200, "o web/rastreio.js de verdade é servido daqui");
}));

test("contratos 4–9: nx_inicio (funil_mes, series_14d, respondidas_no_prazo_pct, aguardando_lista, canais com estado), nx_dados.hora_conversa, agenda (encaixe, dono_nome, etapa ao marcar, presença), nx_pulso.nao_lidas e nx_app_sessao (ativo, migracao, cliente_pausado)", () => comServidor(async ({ rpc, sim }) => {
  const i = (await rpc("nx_inicio", {})).corpo;
  assert.deepEqual(Object.keys(i.funil_mes).sort(), ["agendados", "conversas", "ganhos", "leads"]);
  assert.ok(i.funil_mes.leads >= i.funil_mes.conversas && i.funil_mes.conversas >= i.funil_mes.agendados && i.funil_mes.agendados >= i.funil_mes.ganhos, "funil decrescente");
  for (const k of ["aguardando", "consultas", "valor_aberto", "leads"]) { assert.equal(i.series_14d[k].length, 14, k); assert.ok(i.series_14d[k].every(Number.isInteger), `${k}: inteiros`); }
  assert.ok(i.conversas.respondidas_no_prazo_pct >= 0 && i.conversas.respondidas_no_prazo_pct <= 100);
  assert.deepEqual(i.conversas.aguardando_lista.map(x => [x.id, x.nome, x.canal]), [[902, "Rafael Mendes", "meta"], [901, "Mariana Costa", "codewords"]], "quem espera, a mais antiga primeiro; canal = provedor do número");
  assert.equal(i.conversas.aguardando_lista.length, i.conversas.aguardando);
  assert.ok(i.conversas.aguardando_lista[0].espera_min >= i.conversas.aguardando_lista[1].espera_min);
  assert.equal(i.conversas.espera_mais_antiga_min, i.conversas.aguardando_lista[0].espera_min);
  assert.deepEqual(i.canais.map(c => [c.id, c.provedor, c.estado]), [["cw1", "codewords", "conectado"], ["wa1", "meta", "conectado"]]);
  assert.ok(i.canais.every(c => "desde" in c && "sync_em" in c && "ultimo_erro" in c));
  assert.deepEqual(Object.keys(i.tarefas.proximas[0]).sort(), ["atrasada", "contato_id", "contato_nome", "id", "negocio_id", "tipo", "titulo", "vence_em"], "tarefas.proximas no formato da RPC real");
  // resolver a 902 tira da lista de quem espera e das contagens (o Início lê o MESMO estado das abas)
  await rpc("nx_cv_status", { p_conversa: 902, p_status: "resolvida" });
  const i2 = (await rpc("nx_inicio", {})).corpo;
  assert.equal(i2.conversas.aguardando, 1); assert.deepEqual(i2.conversas.aguardando_lista.map(x => x.id), [901]);
  // nx_dados: hora_conversa 0–23 (ou null) em cada lead
  const leads = (await rpc("nx_dados", { p_dias: 130 })).corpo.leads;
  assert.ok(leads.length > 10);
  assert.ok(leads.every(l => l.hora_conversa === null || (Number.isInteger(l.hora_conversa) && l.hora_conversa >= 0 && l.hora_conversa <= 23)));
  assert.ok(leads.some(l => l.hora_conversa === null) && leads.some(l => l.hora_conversa !== null), "há leads com e sem hora");
  // agenda: encaixe e dono_nome em cada linha; marcar leva à etapa «agendada» e devolve etapa/anterior; presença
  const hojeSP = i.hoje;
  const dia = (await rpc("nx_agenda_dia", { p_data: hojeSP, p_dias: 2 })).corpo;
  assert.ok(dia.consultas.length >= 2);
  for (const c of dia.consultas) { assert.equal(typeof c.encaixe, "boolean"); assert.ok("dono_nome" in c); assert.equal(typeof c.rotulo, "string"); assert.ok("campanha_ext" in c && "anuncio_ext" in c && "campanha_nome" in c); }
  assert.equal(dia.consultas.find(c => c.negocio_id === 802).dono_nome, "Ana Paula");
  const m1 = (await rpc("nx_agenda_marcar", { p_negocio: 803, p_inicio: `${hojeSP}T22:00:00-03:00`, p_servico: "Clareamento" })).corpo;
  assert.equal(m1.ok, true); assert.equal(m1.etapa, "Avaliação agendada"); assert.equal(m1.anterior, null); assert.equal(m1.consulta.encaixe, false); assert.ok(m1.consulta.rotulo);
  assert.equal((await rpc("nx_negocio_ver", { p_id: 803 })).corpo.negocio.estagio_id, "s2", "o negócio foi para a etapa com marco «agendada»");
  const m2 = (await rpc("nx_agenda_marcar", { p_negocio: 803, p_inicio: `${hojeSP}T22:30:00-03:00`, p_encaixe: true })).corpo;
  assert.equal(m2.remarcada, true); assert.equal(m2.anterior.inicio, m1.consulta.inicio); assert.equal(m2.consulta.encaixe, true);
  assert.equal((await rpc("nx_agenda_dia", { p_data: hojeSP, p_dias: 1 })).corpo.consultas.find(c => c.negocio_id === 803).encaixe, true);
  assert.deepEqual((await rpc("nx_agenda_presenca", { p_negocio: 802, p_estado: "compareceu" })).corpo, { ok: true, presenca: "compareceu", estagio_id: "s2" });
  const f = (await rpc("nx_agenda_presenca", { p_negocio: 802, p_estado: "faltou" })).corpo;
  assert.equal(f.presenca, "faltou"); assert.equal(f.estagio_id, "s4", "faltou leva ao estágio de marco «faltou»");
  assert.equal((await rpc("nx_agenda_dia", { p_data: hojeSP, p_dias: 1 })).corpo.consultas.find(c => c.negocio_id === 802).presenca, "faltou");
  assert.equal((await rpc("nx_agenda_presenca", { p_negocio: 802, p_estado: "limpar" })).corpo.presenca, null);
  const inval = await rpc("nx_agenda_presenca", { p_negocio: 802, p_estado: "talvez" });
  assert.equal(inval.status, 400); assert.equal(inval.corpo.message, "dados_invalidos"); assert.match(inval.corpo.hint, /compareceu/);
  assert.equal((await rpc("nx_agenda_presenca", { p_negocio: 1, p_estado: "faltou" })).corpo.message, "negocio_nao_encontrado");
  // pulso e sessão
  const p = (await rpc("nx_pulso", {})).corpo;
  assert.ok(Number.isInteger(p.nao_lidas) && Number.isInteger(p.notif));
  const s = (await rpc("nx_app_sessao", { p_token: "demo-local-session" })).corpo;
  assert.equal(s.clientes[0].ativo, true);
  const arqs = (await readdir(resolve(RAIZ, "supabase/migrations"))).filter(x => /^\d{8}[a-z]?_.+\.sql$/.test(x)).sort();
  assert.equal(s.migracao, arqs.at(-1).replace(/\.sql$/, ""), "migracao = a última migração do repositório (o banco depois de aplicada)");
  await sim("migracao", "?nome=20261001b_correcoes");
  assert.equal((await rpc("nx_app_sessao", { p_token: "demo-local-session" })).corpo.migracao, "20261001b_correcoes", "simulador: servidor atrasado em relação ao front");
  await sim("cliente", "?ativo=0");
  assert.equal((await rpc("nx_app_sessao", { p_token: "demo-local-session" })).corpo.clientes[0].ativo, false, "super ainda entra e vê o interruptor desligado");
  assert.equal((await rpc("nx_clientes_admin", { p_filtro: {} })).corpo[0].ativo, false);
  await sim("cliente", "?super=0");
  const pausado = await rpc("nx_app_sessao", { p_token: "demo-local-session" });
  assert.equal(pausado.status, 400); assert.equal(pausado.corpo.message, "cliente_pausado"); assert.ok(pausado.corpo.hint);
  assert.equal((await rpc("nx_rastreio_registrar", { p_chave: (await rpc("nx_entrada_chave", {})).corpo.chave, p_dados: {} })).corpo.ok, true, "cliente pausado: o site ainda recebe um código (sem gravar), como no banco");
}));

test("contratos 3 e 7 + paridade (H2): histórico do número e canal_caiu/canal_voltou, execuções em 14 dias com série por dia, uso de IA por dia, contatos por empresa/origem, nota com p_req, IA pausar/devolver completo, Admin e Plano no formato real, nx-ciclo {cliente, dias:1}", () => comServidor(async ({ rpc, fnx, sim, estado }) => {
  const hist = (await rpc("nx_canal_historico_listar", { p_canal: "cw1", p_limite: 10 })).corpo;
  assert.ok(Array.isArray(hist) && hist.length >= 3);
  assert.deepEqual(Object.keys(hist[0]).sort(), ["canal_id", "detalhe", "em", "estado", "id"]);
  assert.deepEqual(hist.map(x => x.estado), ["conectado", "desconectado", "conectado"], "mais recente primeiro");
  assert.equal((await rpc("nx_canal_historico_listar", { p_canal: "zzz" })).corpo.message, "canal_nao_encontrado");
  const notif0 = (await rpc("nx_notificacoes_listar", {})).corpo;
  assert.equal(notif0.nao_lidas, 2); assert.equal(notif0.itens.length, 2);
  assert.equal((await rpc("nx_pulso", {})).corpo.notif, 2, "o pulso e o sino contam as mesmas não lidas");
  const v0 = (await rpc("nx_pulso", {})).corpo.v;
  assert.equal((await sim("canal", "?id=cw1&estado=desconectado")).canal.estado, "desconectado");
  const n1 = (await rpc("nx_notificacoes_listar", {})).corpo;
  assert.equal(n1.nao_lidas, 3); assert.equal(n1.itens[0].tipo, "canal_caiu"); assert.equal(n1.itens[0].link, "#/config/numeros");
  assert.notEqual((await rpc("nx_pulso", {})).corpo.v, v0, "o pulso muda quando o número cai");
  assert.equal((await rpc("nx_inicio", {})).corpo.canais.find(c => c.id === "cw1").estado, "desconectado");
  const cwCaido = (await rpc("nx_cv_base", {})).corpo.canais.find(c => c.id === "cw1");
  assert.equal(cwCaido.codewords.conectado, false, "a tela de Números vê o aparelho caído"); assert.equal(cwCaido.estado, "desconectado");
  assert.deepEqual(Object.keys(cwCaido.codewords.contadores).sort(), ["desde", "eco", "grupo", "http_413", "http_422", "lid", "payload_desconhecido"], "contadores por canal (nx_canal_json da 20261008b)");
  for (const k of ["aviso_em", "conferido_em", "inscricao", "forma_desconhecida"]) assert.ok(k in cwCaido.codewords, k);
  assert.deepEqual(Object.keys(cwCaido.codewords.sync).sort(), ["em", "erro", "falhas"]);
  assert.equal((await rpc("nx_canal_historico_listar", { p_canal: "cw1" })).corpo[0].estado, "desconectado");
  // «Reconferir agora» (nx-codewords estado) vê o aparelho caído e devolve o canal como nx_codewords_situacao (sem o webhook)
  const rec = (await fnx("nx-codewords", { acao: "estado", canal: "cw1" })).corpo;
  assert.equal(rec.conectado, false); assert.equal(rec.inscrito_certo, false); assert.equal(rec.canal.estado, "desconectado");
  assert.ok(rec.canal.codewords.contadores && !("webhook" in rec.canal));
  await sim("canal", "?id=cw1&estado=conectado");
  assert.equal((await fnx("nx-codewords", { acao: "estado", canal: "cw1" })).corpo.conectado, true);
  assert.equal((await rpc("nx_notificacoes_listar", {})).corpo.itens[0].tipo, "canal_voltou");
  assert.equal((await rpc("nx_notificacoes_marcar", { p_ids: null })).corpo.nao_lidas, 0);
  assert.equal((await rpc("nx_pulso", {})).corpo.notif, 0);
  // execuções: espalhadas por 14 dias; a série por dia nasce da MESMA lista
  const ex = (await rpc("nx_automacao_execucoes", { p_id: "auto-followup", p_limite: 200 })).corpo;
  const dias = new Set(ex.map(x => x.criado_em.slice(0, 10)));
  assert.ok(dias.size >= 8, `execuções em vários dias (${dias.size})`);
  assert.ok(ex.some(x => x.estado === "erro") && ex.some(x => x.estado === "esperando") && ex.some(x => x.estado === "cancelada"));
  const serie = (await rpc("nx_automacao_execucoes_dia", { p_automacao: "auto-followup", p_dias: 14 })).corpo;
  assert.equal(serie.length, 14); assert.deepEqual(Object.keys(serie[0]), ["dia", "ok", "erro"]);
  assert.ok(serie[0].dia < serie[13].dia, "mais antigo primeiro");
  assert.equal(serie.reduce((s, d) => s + d.ok + d.erro, 0), ex.length, "a série soma a lista");
  assert.equal(serie.reduce((s, d) => s + d.erro, 0), ex.filter(x => !x.ok).length);
  const uso = (await rpc("nx_ia_uso_dia", { p_dias: 14 })).corpo;
  assert.equal(uso.length, 14); assert.deepEqual(Object.keys(uso[0]), ["dia", "chamadas", "tokens_in", "tokens_out", "custo_usd"]);
  assert.ok(uso.every(u => u.custo_usd >= 0 && Number.isInteger(u.chamadas)));
  // contatos por empresa e por origem, com os campos da RPC real
  const porEmpresa = (await rpc("nx_contatos_listar", { p_filtro: { empresa_id: 71 } })).corpo;
  assert.deepEqual(porEmpresa.itens.map(c => c.id), [501, 504]); assert.equal(porEmpresa.itens[0].empresa.nome, "Convênio Metalúrgica Vale");
  assert.ok("ultimo_contato_em" in porEmpresa.itens[0] && "negocios_abertos" in porEmpresa.itens[0] && "tem_mais" in porEmpresa);
  assert.ok("total_aprox" in porEmpresa && !("paginas" in porEmpresa), "resposta com os campos da RPC real (total_aprox, tem_mais; sem «paginas»)");
  assert.deepEqual((await rpc("nx_contatos_listar", { p_filtro: { origem: ["indicacao"] } })).corpo.itens.map(c => c.id), [504], "origem é LISTA, como em nx_crm_filtro_contatos");
  assert.equal((await rpc("nx_contatos_listar", { p_filtro: { origem: "indicacao" } })).corpo.total, 4, "string solta NÃO filtra (a RPC real só lê array)");
  assert.deepEqual((await rpc("nx_contatos_listar", { p_filtro: {}, p_ordem: "nome" })).corpo.itens.map(c => c.nome), ["Bianca Ferreira", "Lucas Oliveira", "Mariana Costa", "Rafael Mendes"]);
  assert.deepEqual((await rpc("nx_contatos_listar", { p_filtro: { tem_negocio_aberto: false } })).corpo.itens.map(c => c.id), [504]);
  assert.deepEqual((await rpc("nx_contatos_listar", { p_filtro: { dono: "sem" } })).corpo.itens.map(c => c.id), [504]);
  assert.deepEqual((await rpc("nx_contatos_listar", { p_filtro: { dono: "eu" } })).corpo.itens.map(c => c.id).sort(), [501, 503]);
  assert.equal((await rpc("nx_contatos_listar", { p_filtro: [] })).corpo.message, "dados_invalidos");
  // nota interna com p_req: Enter repetido não cria duas
  const antes = (await estado()).mensagens.find(c => c.id === 903).total;
  const req = "44444444-4444-4444-8444-444444444444";
  const nota1 = (await rpc("nx_cv_nota", { p_conversa: 903, p_texto: "Nota interna", p_req: req })).corpo;
  const nota2 = (await rpc("nx_cv_nota", { p_conversa: 903, p_texto: "Nota interna", p_req: req })).corpo;
  assert.equal(nota1.id, nota2.id); assert.equal(nota1.tipo, "nota");
  assert.equal((await estado()).mensagens.find(c => c.id === 903).total, antes + 1);
  assert.equal((await rpc("nx_cv_nota", { p_conversa: 903, p_texto: "  " })).corpo.message, "dados_invalidos");
  // IA: pausar/devolver devolvem o estado completo (nx_cv_ia_json) e só em canal CodeWords
  const e0 = (await rpc("nx_cv_ia_estado", { p_conversa: 901 })).corpo;
  assert.equal(e0.pausada, false); assert.equal(e0.respondendo, true);
  assert.deepEqual(Object.keys(e0).sort(), ["conversa_id", "disponivel", "ia_ligada", "limite_10min", "pausada", "pausada_ate", "pausada_por", "pausada_por_nome", "respondendo", "respostas_10min", "so_manual", "volta_horas"], "EXATAMENTE os campos de nx_cv_ia_json");
  const pz = (await rpc("nx_cv_ia_pausar", { p_conversa: 901, p_horas: null })).corpo;
  assert.equal(pz.pausada, true); assert.equal(pz.respondendo, false); assert.equal(pz.pausada_por, "manual"); assert.equal(pz.pausada_por_nome, "Dra. Helena"); assert.equal(pz.ia_ligada, true); assert.equal(pz.disponivel, true);
  assert.ok(pz.pausada_ate && !pz.so_manual, "sem p_horas: volta no prazo do número");
  assert.deepEqual(Object.keys(pz).sort(), Object.keys(e0).sort(), "mesmo formato do nx_cv_ia_estado");
  const soManual = (await rpc("nx_cv_ia_pausar", { p_conversa: 901, p_horas: 0 })).corpo;
  assert.equal(soManual.so_manual, true); assert.equal(soManual.pausada_ate, null);
  assert.equal((await rpc("nx_cv_ia_pausar", { p_conversa: 901, p_horas: 200 })).corpo.hint, "horas");
  assert.equal((await rpc("nx_cv_ia_devolver", { p_conversa: 901 })).corpo.pausada, false);
  assert.equal((await rpc("nx_cv_ia_estado", { p_conversa: 903 })).corpo.pausada_por_nome, "Ana Paula", "a 903 nasce pausada pela colega");
  assert.equal((await rpc("nx_cv_ia_pausar", { p_conversa: 902 })).corpo.message, "ia_indisponivel", "número Meta não tem IA");
  // Admin → Clientes e Config → Plano no formato do banco
  const adm = (await rpc("nx_clientes_admin", { p_filtro: {} })).corpo;
  assert.equal(adm.length, 1);
  for (const k of ["org", "comercial", "ativo", "uso", "limites", "canais", "criado_em"]) assert.ok(k in adm[0], k);
  assert.deepEqual(Object.keys(adm[0].uso).sort(), ["automacoes", "canais", "contatos", "funis", "ia_mes", "usuarios"]);
  assert.deepEqual(adm[0].canais.map(c => c.estado), ["conectado", "conectado"]);
  assert.deepEqual((await rpc("nx_clientes_admin", { p_filtro: { busca: "oficina" } })).corpo, []);
  assert.equal((await rpc("nx_clientes_admin", { p_filtro: { id: adm[0].id } })).corpo.length, 1);
  const plano = (await rpc("nx_uso_plano", {})).corpo;
  assert.deepEqual(Object.keys(plano).sort(), ["limites", "modulos", "org", "plano", "status", "storage_mb", "teste_ate", "uso"]);
  assert.equal(plano.plano.nome, "Profissional"); assert.ok(plano.limites.contatos > plano.uso.contatos);
  // nx-ciclo {cliente, dias:1} («Testar conexão»): formato de tratarCiclo; a falha programada traz a explicação de explicarErroIntegracao
  const ok = (await fnx("nx-ciclo", { cliente: adm[0].id, dias: 1 })).corpo;
  assert.equal(ok.ok, true); assert.equal(ok.clientes[0].dias, 1); assert.match(ok.clientes[0].sync.meta, /^ok — /);
  await sim("integracao", "?canal=meta&erro=token");
  const ruim = (await fnx("nx-ciclo", { cliente: adm[0].id, dias: 1 })).corpo;
  assert.equal(ruim.ok, false); assert.match(ruim.clientes[0].sync.meta, /^erro — /);
  assert.equal(ruim.clientes[0].falhas[0].canal, "meta"); assert.equal(ruim.clientes[0].falhas[0].passageiro, false); assert.ok(ruim.clientes[0].falhas[0].acao);
  await sim("integracao");
  assert.equal((await fnx("nx-ciclo", { cliente: adm[0].id, dias: 1 })).corpo.ok, true);
  // falha programada com hint (login bloqueado por tentativas, contrato 10)
  await sim("falha", "?rpc=nx_entrar&status=400&codigo=muitas_tentativas&hint=12");
  const bloq = await rpc("nx_entrar", { p_email: "a@b.c", p_senha: "x" });
  assert.equal(bloq.status, 400); assert.deepEqual(bloq.corpo, { code: "P0001", message: "muitas_tentativas", hint: "12", details: null });
  const entrou = (await rpc("nx_entrar", { p_email: "a@b.c", p_senha: "x" })).corpo;
  assert.deepEqual(Object.keys(entrou).sort(), ["nome", "papel", "token"], "nx_entrar devolve {token, nome, papel} como a RPC real");
}));
