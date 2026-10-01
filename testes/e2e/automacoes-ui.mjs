/* ÓRBITA — E2E da aba Automações no navegador de verdade (Chrome headless + demo local fictícia).
   Rodar: node testes/e2e/automacoes-ui.mjs        (precisa do Chrome; CHROME_PATH muda o caminho)
   Não entra no rodar-tudo (depende de um navegador). Sobe scripts/dev-falso.mjs numa porta livre, abre o app
   sem rede externa e confere o que os testes de Node não alcançam: o formulário vira o JSON certo
   (nx_automacao_salvar), o JSON salvo vira o formulário certo, criar com IA, testar, execuções, validação
   ao vivo e ausência de rolagem lateral a 390 px. Nada sai do computador. */
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import assert from "node:assert/strict";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
if (!existsSync(CHROME)) { console.log(`Chrome não encontrado em ${CHROME}; E2E de interface pulado (use CHROME_PATH).`); process.exit(0); }

const dormir = ms => new Promise(r => setTimeout(r, ms));
async function portaLivre() {
  const s = net.createServer();
  await new Promise((ok, falha) => s.listen(0, "127.0.0.1", ok).once("error", falha));
  const { port } = s.address();
  await new Promise(ok => s.close(ok));
  return port;
}

const portaApp = await portaLivre(), portaChrome = await portaLivre();
const servidor = spawn(process.execPath, [join(RAIZ, "scripts", "dev-falso.mjs")], { cwd: RAIZ, env: { ...process.env, ORBITA_DEV_FALSO_PORT: String(portaApp) }, stdio: "ignore", windowsHide: true });
const perfil = mkdtempSync(join(tmpdir(), "orbita-e2e-ui-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${portaChrome}`, `--user-data-dir=${perfil}`, "--no-first-run", "--no-default-browser-check",
  "--disable-gpu", "--disable-extensions", "--host-resolver-rules=MAP dtjznipitihnwmcgpzqh.supabase.co 127.0.0.1:1", "about:blank"], { stdio: "ignore", windowsHide: true });
let ws = null;
const limpar = () => { try { ws && ws.close(); } catch { /* ok */ } chrome.kill(); servidor.kill(); try { rmSync(perfil, { recursive: true, force: true }); } catch { /* ok */ } };
process.on("exit", limpar);

let resultados = 0, falhas = 0;
async function teste(nome, fn) {
  try { await fn(); resultados++; console.log(`  ✓ ${nome}`); } catch (e) { falhas++; console.log(`  ✗ ${nome}\n      ${String(e && e.message || e).split("\n").join("\n      ")}`); }
}

try {
  const BASE = `http://127.0.0.1:${portaApp}/app/?dev-falso=1&dev=1`;
  for (let k = 0; k < 80; k++) { try { if ((await fetch(`http://127.0.0.1:${portaApp}/app/index.html`)).status === 200) break; } catch { /* iniciando */ } await dormir(100); }
  let alvo = null;
  for (let k = 0; k < 80 && !alvo; k++) { await dormir(150); try { alvo = (await (await fetch(`http://127.0.0.1:${portaChrome}/json`)).json()).find(t => t.type === "page"); } catch { /* iniciando */ } }
  assert.ok(alvo, "o Chrome não abriu");
  ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((ok, falha) => { ws.onopen = ok; ws.onerror = falha; });
  let id = 0;
  const pend = new Map(), erros = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const { r, j } = pend.get(d.id); pend.delete(d.id); d.error ? j(new Error(JSON.stringify(d.error))) : r(d.result); }
    else if (d.method === "Runtime.exceptionThrown") erros.push("EXC " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") erros.push("CONSOLE " + d.params.args.map(a => a.value ?? a.description).join(" "));
  };
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; pend.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); });
  const aval = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("página: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  await send("Runtime.enable"); await send("Page.enable");
  // guarda o corpo de toda chamada de gravação (nx_automacao_salvar) e de simulação para conferir o que o formulário mandou
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { window.__rpc = []; const o = window.fetch.bind(window);
    window.fetch = function (input, init) { try { const u = String(typeof input === "string" ? input : (input.href || input.url)); const m = /\\/(rpc|functions\\/v1)\\/([a-z0-9_-]+)$/.exec(u);
      if (m && init && init.body) window.__rpc.push({ nome: m[2], corpo: JSON.parse(init.body) }); } catch (e) {} return o(input, init); }; })();` });
  const tamanho = (w, h, movel) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: !!movel });
  const ir = async hash => { await aval(`location.hash = ${JSON.stringify(hash)}`); await dormir(900); };
  const novaLimpa = async () => { await ir("#/automacoes"); await ir("#/automacoes/nova"); };   // mesmo hash não remonta a tela
  const ate = async (expr, txt = expr, ms = 6000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (await aval(`!!(${expr})`)) return; await dormir(80); } throw new Error(`esperei por: ${txt}`); };
  const clicar = sel => aval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error("sem ${sel}"); e.click(); return true; })()`);
  const clicarTexto = (sel, txt, dentro = "document") => aval(`(() => { const e = [...${dentro}.querySelectorAll(${JSON.stringify(sel)})].find(x => x.textContent.trim().includes(${JSON.stringify(txt)})); if (!e) throw new Error("sem ${sel} com ${txt}"); e.click(); return true; })()`);
  const digitar = (sel, v) => aval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error("sem ${sel}"); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  const escolher = (sel, v) => digitar(sel, v);
  const ultimaChamada = nome => aval(`(() => { const l = window.__rpc.filter(x => x.nome === ${JSON.stringify(nome)}); return l.length ? l[l.length - 1].corpo : null; })()`);
  const limparChamadas = () => aval("window.__rpc.length = 0");

  await tamanho(1280, 1200, false);
  await send("Page.navigate", { url: BASE + "#/inicio" });
  await dormir(2200);

  await teste("lista: Criar com IA no topo, receitas por vertical com selos e filtro, automações com etiquetas", async () => {
    await ir("#/automacoes");
    await ate(`document.querySelector(".au-ia")`, "caixa Criar com IA");
    const r = await aval(`({
      ia: !!document.querySelector(".au-ia textarea"), botao: document.querySelector(".au-ia-bt").disabled,
      primeira: document.querySelector("main section, .au section") && document.querySelector(".au > section, .au > .au-ia") ? document.querySelector(".au > .au-ia") !== null : false,
      receitas: document.querySelectorAll(".au-modelo").length, codewords: document.querySelectorAll(".au-modelo .pilula-ok").length,
      ia_selo: [...document.querySelectorAll(".au-modelo .pilula")].some(p => /usa IA/.test(p.textContent)),
      etiquetas: [...document.querySelectorAll(".au-item .pilula")].map(p => p.textContent.trim()), filtros: [...document.querySelectorAll(".au-lista-filtro .au-chip")].map(c => c.textContent.trim()) })`);
    assert.equal(r.ia, true);
    assert.equal(r.botao, true, "o botão só liga com um pedido de verdade");
    assert.ok(r.receitas >= 12, `receitas: ${r.receitas}`);
    assert.ok(r.codewords >= 4, "selo «sai pelo CodeWords»");
    assert.equal(r.ia_selo, true);
    assert.ok(r.etiquetas.some(t => /Sequência/.test(t)) && r.etiquetas.some(t => /Usa IA/.test(t)) && r.etiquetas.some(t => /WhatsApp/.test(t)), r.etiquetas.join("|"));
    assert.ok(r.filtros.length >= 3 && /Todas/.test(r.filtros[0]), r.filtros.join("|"));
    await clicarTexto(".au-modelos-filtro .au-chip", "Inteligência artificial");
    assert.equal(await aval(`document.querySelectorAll(".au-modelo").length`), 2, "filtro IA: 2 receitas");
  });

  await teste("formulário → JSON: receita de follow-up com a espera trocada e «parar» no fim é gravada com os nomes do contrato", async () => {
    await ir("#/automacoes/nova?modelo=followup_orcamento");
    await ate(`document.querySelector(".au-passo")`, "passos da receita");
    assert.equal(await aval(`document.querySelectorAll(".au-passo").length`), 5);
    assert.equal(await aval(`document.querySelector(".au-nome-inp").value`), "Acompanhar orçamento sem resposta");
    // 1ª espera: de 1 dia para 2 dias
    await aval(`(() => { const p = document.querySelector(".au-passo-esperar"); [...p.querySelectorAll(".au-chip")].find(c => c.textContent.trim() === "2 dias").click(); })()`);
    // «Adicionar passo» → «Parar por aqui»
    await clicarTexto(".au-mais", "Adicionar passo");
    await clicarTexto(".au-tile", "Parar por aqui");
    assert.equal(await aval(`document.querySelectorAll(".au-passo").length`), 6);
    assert.match(await aval(`document.querySelector(".au-frase").textContent`), /esperar 2 dias \(parando se o cliente responder\) e depois enviar a mensagem/);
    assert.match(await aval(`document.querySelector(".au-frase").textContent`), /parar por aqui\.$|parar por aqui \(mensagens/);
    await limparChamadas();
    await clicar(".au-ed-acoes .bt-prim");
    await ate(`window.__rpc.some(x => x.nome === "nx_automacao_salvar")`, "chamada de gravação");
    const c = await ultimaChamada("nx_automacao_salvar");
    const a = c.p_auto;
    assert.equal(a.nome, "Acompanhar orçamento sem resposta");
    assert.equal(a.gatilho, "negocio_estagio");
    assert.deepEqual(Object.keys(a.config), ["estagio_id"]);
    assert.equal(a.ativo, false, "receita com mensagem nasce desligada");
    assert.equal(a.respeitar_horario, true);
    assert.deepEqual(a.acoes.map(x => x.tipo), ["esperar", "enviar_mensagem", "esperar", "enviar_mensagem", "criar_tarefa", "parar"]);
    assert.deepEqual(a.acoes[0], { tipo: "esperar", minutos: 2880, cancelar_se_cliente_responder: true });
    assert.deepEqual(a.acoes[2], { tipo: "esperar", minutos: 2880, cancelar_se_cliente_responder: true });
    assert.deepEqual(a.acoes[5], { tipo: "parar" });
    assert.equal(a.acoes[4].vence_em_horas, 0);
    assert.ok(a.acoes[1].texto.includes("{primeiro_nome}"));
    for (const k of Object.keys(a)) assert.ok(["nome", "gatilho", "config", "condicoes", "acoes", "respeitar_horario", "ativo"].includes(k), `chave fora do contrato: ${k}`);
  });

  await teste("formulário → JSON: gatilho «agendado» (horário e dias em chips) + tarefa + «esperar» com tempo personalizado", async () => {
    await ir("#/automacoes/nova");
    await ate(`document.querySelector(".au-sel-gat select")`, "seletor de gatilho");
    await escolher(".au-sel-gat select", "agendado");
    await ate(`document.querySelector(".au-campo-dias")`, "dias da semana");
    await digitar(".au-campo-hora input", "08:30");
    // dias úteis vem marcado; tira Sex e põe Sáb
    await clicarTexto(".au-campo-dias .au-chips:not(.au-chips-atalho) .au-chip", "Sex");
    await clicarTexto(".au-campo-dias .au-chips:not(.au-chips-atalho) .au-chip", "Sáb");
    assert.match(await aval(`document.querySelector(".au-frase").textContent`), /às segundas, terças, quartas e quintas e aos sábados/i);
    await digitar(".au-nome-inp", "Bom dia: retomar orçamentos");
    await clicarTexto(".au-mais", "Adicionar passo"); await clicarTexto(".au-tile", "Criar tarefa");
    await digitar(".au-passo-criar_tarefa input[type=text]", "Retomar {primeiro_nome}");
    await clicarTexto(".au-mais", "Adicionar passo"); await clicarTexto(".au-tile", "Esperar um tempo");
    await clicarTexto(".au-passo-esperar .au-chip", "Outro");
    await digitar(".au-passo-esperar .au-dur-num input", "3");
    await aval(`(() => { const s = document.querySelector(".au-passo-esperar .au-dur-un select"); s.value = "horas"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    // esperar no último passo é erro (como no servidor): a tela avisa e não grava
    await limparChamadas();
    await clicar(".au-ed-acoes .bt-prim"); await dormir(500);
    assert.equal(await aval(`window.__rpc.some(x => x.nome === "nx_automacao_salvar")`), false, "não grava com «esperar» no fim");
    assert.match(await aval(`document.querySelector("[data-onde=entao] .au-item-erro:not([hidden])").textContent`), /depois de esperar, acrescente outra ação/);
    await clicarTexto(".au-mais", "Adicionar passo"); await clicarTexto(".au-tile", "Anotar no histórico");
    await digitar(".au-passo-nota textarea", "Retomado automaticamente");
    await clicar(".au-ed-acoes .bt-prim");
    await ate(`window.__rpc.some(x => x.nome === "nx_automacao_salvar")`, "gravação");
    const a = (await ultimaChamada("nx_automacao_salvar")).p_auto;
    assert.equal(a.gatilho, "agendado");
    assert.deepEqual(a.config, { horario: "08:30", dias_semana: [1, 2, 3, 4, 6] });
    assert.deepEqual(a.acoes.map(x => x.tipo), ["criar_tarefa", "esperar", "nota"]);
    assert.deepEqual(a.acoes[1], { tipo: "esperar", minutos: 180, cancelar_se_cliente_responder: true });
    assert.equal(a.acoes[0].titulo, "Retomar {primeiro_nome}");
    assert.deepEqual(a.acoes[2], { tipo: "nota", texto: "Retomado automaticamente" });
    assert.equal(a.ativo, true, "sem mensagem nem IA, a automação nova nasce ligada (o interruptor do cabeçalho)");
  });

  await teste("JSON → formulário: automação salva com sequência abre com os passos, os tempos e as chaves certos", async () => {
    await ir("#/automacoes/auto-followup");
    await ate(`document.querySelector(".au-passo")`, "passos");
    const r = await aval(`({
      nome: document.querySelector(".au-nome-inp").value, passos: [...document.querySelectorAll(".au-passo")].map(p => p.dataset.tipo),
      quando: [...document.querySelectorAll(".au-passo-quando")].map(p => p.textContent.trim()),
      marcados: [...document.querySelectorAll(".au-passo-esperar")].map(p => p.querySelector(".au-chip[aria-checked=true]")?.textContent.trim()),
      parar: [...document.querySelectorAll(".au-passo-esperar .au-sw")].map(s => s.getAttribute("aria-checked")),
      ligada: document.querySelector(".au-ed-acoes .au-sw").getAttribute("aria-checked"), abas: [...document.querySelectorAll(".au-abas .aba")].length })`);
    assert.equal(r.nome, "Acompanhar orçamento sem resposta");
    assert.deepEqual(r.passos, ["esperar", "enviar_mensagem", "esperar", "criar_tarefa"]);
    assert.deepEqual(r.quando, ["Na hora", "Depois de 1 dia", "Depois de 1 dia", "Depois de 3 dias"]);
    assert.deepEqual(r.marcados, ["1 dia", "2 dias"]);
    assert.deepEqual(r.parar, ["true", "true"]);
    assert.equal(r.ligada, "true");
    assert.equal(r.abas, 2);
    // mexer no tempo da 1ª espera atualiza o «Depois de…» dos passos seguintes na hora
    await aval(`[...document.querySelector(".au-passo-esperar").querySelectorAll(".au-chip")].find(c => c.textContent.trim() === "3 dias").click()`);
    assert.deepEqual(await aval(`[...document.querySelectorAll(".au-passo-quando")].map(p => p.textContent.trim())`), ["Na hora", "Depois de 3 dias", "Depois de 3 dias", "Depois de 5 dias"]);
  });

  await teste("Criar com IA: pedido → explicação e avisos → editor preenchido e DESLIGADO → grava sem ligar nada", async () => {
    await ir("#/automacoes");
    await ate(`document.querySelector(".au-ia-txt")`, "caixa");
    await digitar(".au-ia-txt", "Quando um orçamento ficar 2 dias sem resposta, manda uma mensagem e avisa o responsável");
    assert.equal(await aval(`document.querySelector(".au-ia-bt").disabled`), false);
    await limparChamadas();
    await clicar(".au-ia-bt");
    await ate(`document.querySelector(".au-ia-res")`, "resultado da IA");
    const chamada = await ultimaChamada("nx-ia");
    assert.equal(chamada.acao, "automacao_montar");
    assert.ok(chamada.descricao.startsWith("Quando um orçamento"));
    const r = await aval(`({ nome: document.querySelector(".au-ia-res-nome").textContent, avisos: document.querySelectorAll(".au-ia-res .au-ia-ped-avisos li").length, exp: !!document.querySelector(".au-ia-res-exp") })`);
    assert.equal(r.nome, "Orçamento sem resposta em 2 dias");
    assert.equal(r.avisos, 2);
    assert.equal(r.exp, true);
    assert.equal(await aval(`window.__rpc.some(x => x.nome === "nx_automacao_salvar")`), false, "a IA nunca salva sozinha");
    await clicarTexto(".au-ia-res .bt", "Conferir e ajustar");
    await ate(`document.querySelector(".au-ia-ped")`, "aviso de montada pela IA");
    assert.equal(await aval(`document.querySelector(".au-nome-inp").value`), "Orçamento sem resposta em 2 dias");
    assert.equal(await aval(`document.querySelector(".au-ed-acoes .au-sw").getAttribute("aria-checked")`), "false", "nasce desligada");
    assert.deepEqual(await aval(`[...document.querySelectorAll(".au-passo")].map(p => p.dataset.tipo)`), ["esperar", "enviar_mensagem", "notificar"]);
    await clicar(".au-ed-acoes .bt-prim");
    await ate(`window.__rpc.some(x => x.nome === "nx_automacao_salvar")`, "gravação");
    const a = (await ultimaChamada("nx_automacao_salvar")).p_auto;
    assert.equal(a.ativo, false);
    assert.deepEqual(a.acoes.map(x => x.tipo), ["esperar", "enviar_mensagem", "notificar"]);
    assert.deepEqual(a.acoes[0], { tipo: "esperar", minutos: 2880, cancelar_se_cliente_responder: true });
  });

  await teste("Criar com IA: cota esgotada e falta da chave da Anthropic viram orientação em português (e o caminho alternativo)", async () => {
    await ir("#/automacoes");
    await ate(`document.querySelector(".au-ia-txt")`, "caixa");
    await digitar(".au-ia-txt", "teste de cota estourada nesta descricao");
    await clicar(".au-ia-bt");
    await ate(`document.querySelector(".au-ia-erro")`, "erro de cota");
    let t = await aval(`document.querySelector(".au-ia-erro").textContent`);
    assert.match(t, /cota de IA deste mês acabou/); assert.match(t, /receitas prontas/);
    assert.ok(await aval(`[...document.querySelectorAll(".au-ia-erro .bt")].some(b => /Criar do zero/.test(b.textContent))`));
    await digitar(".au-ia-txt", "teste de chave ausente nesta descricao");
    await clicar(".au-ia-bt");
    await ate(`/chave da Anthropic/.test(document.querySelector(".au-ia-erro")?.textContent || "")`, "erro de chave");
    t = await aval(`document.querySelector(".au-ia-erro").textContent`);
    assert.match(t, /equipe da Nexus/);
  });

  await teste("Testar: mostra exemplos reais, o que seria feito (esperaria / faria / pularia) e o passo a passo, sem gravar", async () => {
    await ir("#/automacoes/auto-followup");
    await ate(`document.querySelector(".au-teste .bt")`, "botão testar");
    await limparChamadas();
    await clicar(".au-teste .bt");
    await ate(`document.querySelectorAll(".au-sim-alvo").length === 3`, "3 exemplos");
    const chamada = await ultimaChamada("nx_auto_simular");
    assert.equal(chamada.p_automacao.gatilho, "negocio_estagio");
    assert.deepEqual(chamada.p_automacao.acoes.map(x => x.tipo), ["esperar", "enviar_mensagem", "esperar", "criar_tarefa"]);
    const r = await aval(`({ pilulas: [...document.querySelectorAll(".au-sim-passo .pilula")].map(p => p.textContent.trim()), plano: document.querySelectorAll(".au-sim-plano-lista li").length, topo: document.querySelector(".au-sim-topo").textContent })`);
    assert.deepEqual(r.pilulas, ["Esperaria", "Faria", "Pularia"]);
    assert.equal(r.plano, 4);
    assert.match(r.topo, /3 exemplos/); assert.match(r.topo, /Nada foi enviado nem salvo/);
    assert.equal(await aval(`window.__rpc.some(x => x.nome === "nx_automacao_salvar")`), false);
  });

  await teste("Execuções: progresso, estado da sequência, código técnico em português e filtro por situação", async () => {
    await ir("#/automacoes/auto-followup?aba=execucoes");
    await ate(`document.querySelectorAll(".au-ex").length === 5`, "5 execuções");
    const t = await aval(`document.querySelector(".au-exs").textContent`);
    assert.match(t, /2 de 4 passos feitos/); assert.match(t, /Esperando para continuar/); assert.match(t, /Cancelada: o cliente respondeu/);
    assert.match(t, /Este número ainda não foi pareado no CodeWords/);
    assert.doesNotMatch(t, /codewords_sem_aparelho/);
    await clicarTexto(".au-ex-filtro .au-chip", "Com erro");
    assert.equal(await aval(`document.querySelectorAll(".au-ex").length`), 1);
    await clicarTexto(".au-ex-filtro .au-chip", "Em espera");
    assert.equal(await aval(`document.querySelectorAll(".au-ex").length`), 1);
    await clicarTexto(".au-ex-filtro .au-chip", "Puladas ou paradas");
    assert.equal(await aval(`document.querySelectorAll(".au-ex").length`), 2);
  });

  await teste("Duplicar (lista e editor): cria cópia DESLIGADA com o nome «(cópia)»", async () => {
    await ir("#/automacoes/auto-followup");
    await ate(`document.querySelector(".au-ed-acoes .bt-fant")`, "botão duplicar");
    await limparChamadas();
    await clicar(".au-ed-acoes .bt-fant");
    await ate(`window.__rpc.some(x => x.nome === "nx_automacao_salvar")`, "gravação da cópia");
    const a = (await ultimaChamada("nx_automacao_salvar")).p_auto;
    assert.equal(a.nome, "Acompanhar orçamento sem resposta (cópia)");
    assert.equal(a.ativo, false);
    assert.equal(a.id, undefined, "cópia = automação nova");
    assert.deepEqual(a.acoes.map(x => x.tipo), ["esperar", "enviar_mensagem", "esperar", "criar_tarefa"]);
  });

  await teste("validação ao vivo: automação em branco mostra «Falta: …» no bloco certo, só depois de mexer, e não grava", async () => {
    await ir("#/automacoes/nova");
    await ate(`document.querySelector(".au-bloco")`, "blocos");
    assert.equal(await aval(`document.querySelectorAll(".au-bloco-erro:not([hidden])").length`), 0, "começa limpo");
    await limparChamadas();
    await clicar(".au-ed-acoes .bt-prim");
    await dormir(500);
    assert.equal(await aval(`window.__rpc.some(x => x.nome === "nx_automacao_salvar")`), false);
    assert.equal(await aval(`document.querySelector(".au-nome-inp").getAttribute("aria-invalid")`), "true");
    await digitar(".au-nome-inp", "Teste");
    await clicar(".au-ed-acoes .bt-prim"); await dormir(400);
    const txt = await aval(`[...document.querySelectorAll(".au-bloco-erro:not([hidden])")].map(e => e.textContent).join("|")`);
    assert.match(txt, /Falta: escolha a etapa em «Quando»/);
    assert.match(txt, /Falta: acrescente pelo menos uma ação em «Então»/);
    assert.match(await aval(`document.querySelector(".au-estado").textContent`), /^Falta: /);
  });

  await teste("paleta: TODO passo do catálogo abre no editor sem erro e desenha um controle para cada campo", async () => {
    await ir("#/automacoes/nova");
    await ate(`document.querySelector(".au-mais")`, "botão");
    await clicarTexto(".au-mais", "Adicionar passo");
    const n = await aval(`document.querySelectorAll(".au-tile").length`);
    assert.ok(n >= 16, `passos na paleta: ${n}`);
    for (let i = 0; i < n; i++) {
      await novaLimpa();
      await ate(`document.querySelector(".au-mais")`, "botão");
      await clicarTexto(".au-mais", "Adicionar passo");
      const nome = await aval(`(() => { const t = document.querySelectorAll(".au-tile")[${i}]; const n = t.querySelector("strong").textContent; t.click(); return n; })()`);
      await ate(`document.querySelectorAll(".au-passo").length === 1`, `passo «${nome}»`);
      const r = await aval(`(() => { const p = document.querySelector(".au-passo"); return { tipo: p.dataset.tipo, titulo: p.querySelector(".au-acao-tit").textContent.trim(), controles: p.querySelectorAll("input, select, textarea, .au-chip, .au-esc-op, .au-sw").length, desc: !!p.querySelector(".au-passo-desc") }; })()`);
      assert.ok(r.controles > 0 || r.desc, `«${nome}» (${r.tipo}) sem controles nem texto`);
    }
    // atribuir a um departamento exige escolher o departamento; notificar um departamento também
    await novaLimpa(); await ate(`document.querySelector(".au-mais")`, "botão");
    await clicarTexto(".au-mais", "Adicionar passo"); await clicarTexto(".au-tile", "Atribuir a conversa");
    await aval(`(() => { const s = document.querySelector(".au-passo-atribuir select"); s.value = "departamento"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await dormir(200);
    assert.match(await aval(`document.querySelector(".au-passo-atribuir").textContent`), /Escolha o departamento/);
    assert.match(await aval(`document.querySelector(".au-passo-atribuir .au-item-erro").textContent`), /escolha o departamento/);
    // preencher campo: o seletor traz o cadastro, a oportunidade e a pontuação
    await novaLimpa(); await ate(`document.querySelector(".au-mais")`, "botão");
    await clicarTexto(".au-mais", "Adicionar passo"); await clicarTexto(".au-tile", "Preencher um campo");
    assert.deepEqual(await aval(`[...document.querySelectorAll(".au-passo-campo_atualizar optgroup")].map(g => g.label + ":" + g.children.length)`), ["Cadastro:1", "Oportunidade:1", "Pontuação:1"]);
  });

  await teste("produtos: Automações aparece no menu do CRM e do Atendimento (não no Nexus Ads) e abre com o título do produto", async () => {
    for (const [produto, inicio, tem, titulo] of [["crm", "#/crm", true, /Automações · CRM/], ["atendimento", "#/conversas", true, /Automações · Atendimento/], ["ads", "#/anuncios", false, null]]) {
      await send("Page.navigate", { url: `${BASE}&produto=${produto}${inicio}` }); await dormir(2300);
      const itens = await aval(`[...document.querySelectorAll("#nav .nav-b")].map(a => a.dataset.id)`);
      assert.equal(itens.includes("automacoes"), tem, `${produto}: ${itens.join(",")}`);
      if (!tem) continue;
      await aval(`document.querySelector('#nav .nav-b[data-id="automacoes"]').click()`); await dormir(1200);
      assert.match(await aval("document.title"), titulo);
      assert.equal(await aval(`!!document.querySelector(".au-ia")`), true);
      assert.equal(await aval(`document.querySelector('#nav [aria-current="page"]').dataset.id`), "automacoes");
    }
  });

  await teste("celular (390 px): lista, editor com sequência, paleta e testar sem rolagem lateral", async () => {
    await tamanho(390, 1800, true);
    await send("Page.navigate", { url: BASE + "#/inicio" }); await dormir(1800);
    for (const hash of ["#/automacoes", "#/automacoes/nova?modelo=followup_orcamento", "#/automacoes/auto-followup?aba=execucoes", "#/automacoes/nova?modelo=lead_anuncio"]) {
      await ir(hash); await dormir(500);
      if (/modelo=followup/.test(hash)) { await clicarTexto(".au-mais", "Adicionar passo"); await dormir(200); await clicar(".au-teste .bt"); await dormir(900); }
      const r = await aval(`({ w: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, ocultoVisivel: [...document.querySelectorAll("[hidden]")].filter(e => getComputedStyle(e).display !== "none").length })`);
      assert.ok(r.sw <= r.w, `${hash}: rolagem lateral (${r.sw} > ${r.w})`);
      assert.equal(r.ocultoVisivel, 0, `${hash}: elemento [hidden] visível`);
    }
    const alvos = await aval(`[...document.querySelectorAll(".au-chip, .au-tile, .au-esc-op, .bt, .bt-icone")].filter(e => e.offsetParent && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 30).map(e => e.className + ":" + Math.round(e.getBoundingClientRect().height)).slice(0, 8)`);
    assert.deepEqual(alvos.filter(a => /au-chip|au-tile|au-esc-op/.test(a)), [], "chips e blocos de toque com pelo menos 30 px");
  });

  console.log(`\n${resultados} ok · ${falhas} falha(s)${erros.length ? ` · ${erros.length} erro(s) no console` : ""}`);
  if (erros.length) { console.log(erros.slice(0, 6).join("\n")); falhas += 1; }
} catch (e) {
  console.error("E2E de interface interrompido:", e.message);
  falhas += 1;
} finally {
  limpar();
}
process.exit(falhas ? 1 : 0);
