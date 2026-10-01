/* Fluxos da agenda no servidor local fictício; não chama serviços externos. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("nx_onboarding_estado: 11 itens (10 obrigatórios + anúncios opcional), marcam sozinhos e o tenant novo começa em 0", () => comServidor(async ({ rpc, sim }) => {
  const e = (await rpc("nx_onboarding_estado", {})).corpo;
  assert.equal(e.itens.length, 11);
  assert.equal(e.itens.filter(i => i.opcional).length, 1);
  assert.equal(e.total, 10);
  assert.ok(e.feitos > 0 && e.feitos < e.total, "estado parcial por padrão");
  const novo = (await sim("onboarding", "?modo=novo")).estado;
  assert.equal(novo.feitos, 0);
  assert.equal(novo.itens.find(i => i.id === "chave_codewords").feito, false);
  await rpc("nx_codewords_canal_salvar", { p_canal: { id: "cw1" } });
  assert.equal((await rpc("nx_onboarding_estado", {})).corpo.itens.find(i => i.id === "chave_codewords").feito, true, "salvar a chave marca o passo 1 sem recarregar");
  const completo = (await sim("onboarding", "?modo=completo")).estado;
  assert.equal(completo.completo, true);
  assert.equal(completo.feitos, completo.total);
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

test("nx_pulso: devolve nao_lidas e o maior id de entrada; mensagem simulada muda v e a contagem", () => comServidor(async ({ rpc, sim }) => {
  const p1 = (await rpc("nx_pulso", {})).corpo;
  assert.equal(p1.nao_lidas, 2, "conversas com mensagens não lidas (901 e 902)");
  assert.ok(Number.isInteger(p1.ultima_entrada_id));
  const r = await sim("mensagem", "?conversa=903&texto=Oi%20de%20novo");
  assert.equal(r.mensagem.direcao, "in");
  const p2 = (await rpc("nx_pulso", {})).corpo;
  assert.notEqual(p2.v, p1.v, "o pulso muda");
  assert.equal(p2.nao_lidas, 3);
  assert.ok(p2.ultima_entrada_id > p1.ultima_entrada_id);
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
