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
    const app = await fetch(`${base}/app/app.js`).then(r => r.text());
    assert.match(app, /DEMO LOCAL · dados fictícios; mensagens e integrações não são reais\./, "a interface deixa claro que não é uma conta conectada");
    assert.match(app, /faixa-demo-local/, "o aviso usa a faixa de sistema, sem cobrir o campo de mensagem");
    assert.doesNotMatch(pagina, /position:fixed;left:50%;bottom:12px/, "o servidor local não injeta mais uma tarja fixa por cima da interface");

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
