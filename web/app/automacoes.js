/* ============================================================
   ÓRBITA — automacoes.js · frente F7 · T12 (ESPEC §2.6, §5.7, §5.8) + PLANO-NOITE-20261001
   Rotas: #/automacoes · #/automacoes/nova[?modelo=<id>|?ia=1] · #/automacoes/<id>[?aba=execucoes|?testar=1]
   Lista (criar com IA + suas automações + receitas prontas + do sistema); o editor mora em auto-editor.js.
   Dados: nx_automacoes_listar (traz também a base do editor), nx_automacao_salvar | _ativar | _excluir | _execucoes,
   nx_auto_simular (testar), nx-ia ação automacao_montar (criar com IA — nunca salva sozinha).
   Regras do app: sem import estático (auto-logica.js, auto-pecas.js e auto-editor.js vêm por import()
   com ctx.versao), texto de usuário só por textContent (ui.h), nenhuma cor escrita aqui
   (só tokens do CSS / --cor validada).
   ============================================================ */

let L = null;              // auto-logica.js (puro)
let PE = null;             // auto-pecas.js
let ED = null;             // auto-editor.js
let montagem = 0;          // descarta respostas de montagens antigas
let cancelarPulso = null;
let rascunhoIA = null;     // {auto, explicacao, avisos} — a montagem da IA que o editor abre (a cópia da aba fica em rascunhosDe(ctx), chave «ia»)
let textoIA = "";          // o que a pessoa já digitou na caixa «Criar com IA» (sobrevive a voltar da lista)
let donoIA = "";           // «cliente|conta» a quem pertencem textoIA e rascunhoIA: outro cliente ou outra pessoa nunca os vê
let focarIAAoVoltar = false;   // plano 1000b · UB-072: a lista nasce com o foco na caixa «Criar com IA» (voltou de um ?ia=1 sem montagem)

/** Zera o que foi digitado/montado na «Criar com IA» (troca de empresa, de pessoa, saída do módulo). */
function esquecerIA() { textoIA = ""; rascunhoIA = null; donoIA = ""; }

/** Guarda o dono do texto/rascunho; se mudou o cliente ativo ou a conta (a aba não recarrega ao trocar), descarta o que era do outro. */
function conferirDonoIA(ctx) {
  const dono = `${ctx.cliente ? ctx.cliente.id : "-"}|${ctx.sessao && ctx.sessao.conta ? (ctx.sessao.conta.id || ctx.sessao.conta.email || "?") : "-"}`;
  if (donoIA !== dono) { esquecerIA(); donoIA = dono; }
}

async function modulos(ctx, editor) {
  const v = encodeURIComponent(ctx.versao);
  if (!L) L = await import(`./auto-logica.js?v=${v}`);
  if (!PE) PE = await import(`./auto-pecas.js?v=${v}`);
  if (editor && !ED) ED = await import(`./auto-editor.js?v=${v}`);
  return { L, P: PE.pecas(ctx.ui, L), ED };
}

/**
 * Rascunhos guardados na aba (sessionStorage), por empresa + conta + automação: o que ainda não foi salvo sobrevive a recarregar a página,
 * ao Voltar, ao menu e à paleta. «nova» = a automação ainda sem id; «ia» = a montagem da IA (não gasta a cota de novo). Some ao fechar a aba.
 * Tudo em try/catch: sem storage (janela anônima cheia, bloqueio) o editor funciona igual, só sem a rede de proteção.
 */
function rascunhosDe(ctx) {
  const cli = ctx.cliente ? ctx.cliente.id : "-";
  const conta = ctx.sessao && ctx.sessao.conta ? (ctx.sessao.conta.id || ctx.sessao.conta.email || "-") : "-";
  const chave = id => L.chaveRascunho(cli, conta, id);
  return {
    ler(id) { try { return L.lerRascunho(sessionStorage.getItem(chave(id))); } catch { return null; } },
    guardar(id, auto, extra) { try { sessionStorage.setItem(chave(id), L.empacotarRascunho(auto, extra)); return true; } catch { return false; } },
    apagar(id) { try { sessionStorage.removeItem(chave(id)); } catch { /* sem storage */ } },
  };
}

/** plano 1000 · AS-019: chave do texto da caixa «Criar com IA» (mesma régua dos rascunhos: empresa + conta). */
function chaveTextoIA(ctx) {
  const cli = ctx.cliente ? ctx.cliente.id : "-";
  const conta = ctx.sessao && ctx.sessao.conta ? (ctx.sessao.conta.id || ctx.sessao.conta.email || "-") : "-";
  return L.chaveRascunho(cli, conta, "ia-texto");
}

/** plano 1000b · UB-067: o nome de quem dá suporte (marca efetiva da revenda); null sem o shell — o texto diz «a equipe de suporte». */
function nomeSuporte(ctx) {
  try { const m = ctx.shell && typeof ctx.shell.marcaEfetiva === "function" ? ctx.shell.marcaEfetiva() : null; return m && m.produto ? String(m.produto) : null; } catch { return null; }
}

/** plano 2000d · DU-024: só a equipe da plataforma/revenda (gestor, super) vê o nome do fornecedor do WhatsApp. */
function equipeDaPlataforma(ctx) {
  const p = ctx && ctx.sessao && ctx.sessao.conta ? String(ctx.sessao.conta.papel || "") : "";
  const pc = ctx && ctx.cliente ? String(ctx.cliente.papel || "") : "";
  return p === "gestor" || p === "super" || pc === "gestor" || pc === "super" || !!(ctx && ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.super);
}

/** plano 2000d · DU-095: minutos por mensagem da empresa (Configurações → base.minutos_por_mensagem, entre 0,5 e 30); padrão 2. */
export function minutosPorMensagem(base) {
  const v = Number(base && base.minutos_por_mensagem);
  return Number.isFinite(v) && v >= 0.5 && v <= 30 ? v : 2;
}

/** plano 2000d · DU-078/DU-079: o pedido de contratação do shell (app.js), quando ele expõe; null sem ele (a tela usa o link do plano). */
function pedirContratacao(ctx) {
  const f = ctx && ctx.shell && typeof ctx.shell.pedirContratacao === "function" ? ctx.shell.pedirContratacao : null;
  return f ? origem => { try { f(origem); } catch { ctx.navegar("#/config/plano"); } } : null;
}

/** plano 2000d · DU-026: a frase do texto colado inválido com a marca efetiva (revenda) — nunca a marca padrão fixa. */
export function textoColagemInvalida(produto) {
  return produto ? `Esse texto não é uma automação copiada do ${produto}.` : "Esse texto não é uma automação copiada deste sistema.";
}

/**
 * plano 1000b · UB-078 / UB-210: preferência de TELA guardada no aparelho (abrir o «Ver o fluxo», ver receitas de outros segmentos) —
 * só chaves «nx-au-*» de interface; rascunho e dado de cliente nunca passam por aqui (ficam na aba, sessionStorage).
 */
function preferencia(chavePref) {
  const ok = /^nx-au-[a-z-]+$/.test(String(chavePref));
  return {
    ler() { if (!ok) return null; try { return localStorage.getItem(chavePref); } catch { return null; } },
    gravar(v) { if (!ok) return; try { localStorage.setItem(chavePref, String(v)); } catch { /* sem storage: vale só nesta tela */ } },
  };
}

let limpezas = [];         // o que a tela montada precisa desfazer ao sair (ex.: a altura do cabeçalho fixo no scroll-padding)
function desfazerTela() { for (const f of limpezas.splice(0)) { try { f(); } catch { /* ok */ } } }

function pararPulso() {
  if (cancelarPulso) { try { cancelarPulso(); } catch { /* ok */ } cancelarPulso = null; }
}

/* ================================================================== entrada do módulo */

export async function montar(ctx) {
  const eu = ++montagem;
  const { ui } = ctx;
  pararPulso();
  desfazerTela();
  conferirDonoIA(ctx);
  ui.carregarCss("automacoes");
  ui.limpar(ctx.alvo);
  const parte = ctx.rota.partes[0] || null;
  const raiz = ui.h("div", { class: ["au", parte ? "au-pag-editor" : "au-pag-lista"] });
  ctx.alvo.appendChild(raiz);
  // G9: a forma da tela que vem (números do topo + cartões) em vez do esqueleto genérico
  // plano 1000b · UB-187: o editor tem esqueleto com a forma dele (cabeçalho + 3 blocos + lateral), não o de lista
  // revisão 1000b · UB-209: só o 1º bloco fala «Carregando…»; os outros pedaços da mesma tela vão com { anunciar: false }
  const calado = { anunciar: false };
  raiz.appendChild(parte ? ui.h("div", { class: "au-esq au-esq-editor" }, ui.esqueleto("cartao"),
    ui.h("div", { class: "au-esq-ed-grade" }, ui.h("div", { class: "au-esq-ed-fluxo" }, ui.esqueleto("cartao", calado), ui.esqueleto("cartao", calado), ui.esqueleto("cartao", calado)), ui.esqueleto("cartao", calado)))
    : ui.h("div", { class: "au-esq" }, ui.esqueleto("kpi", 4), ui.esqueleto("cartao", calado), ui.esqueleto("cartao", calado)));
  let dados, pecas;
  try {
    const r = await Promise.all([modulos(ctx, !!parte), ctx.api.rpcC("nx_automacoes_listar")]);
    pecas = r[0];
    dados = r[1];
  } catch (e) {
    if (eu !== montagem) return;
    ui.limpar(raiz);
    raiz.appendChild(ui.erroCartao(e, () => montar(ctx)));
    return;
  }
  if (eu !== montagem) return;
  ui.limpar(raiz);
  dados.itens = dados.itens || [];
  dados.base = dados.base || {};
  const rascunhos = rascunhosDe(ctx);
  const amb = {
    L, P: pecas.P,
    rascunho: null,
    rascunhos,
    duplicar: (c, a, botao) => duplicar(c, a, dados.base, botao, dados.itens),
    limparRascunho: () => { rascunhoIA = null; rascunhos.apagar("ia"); },
    aoSair: f => { limpezas.push(f); },
    preferencia,                     // plano 1000b · UB-078: preferências de tela no aparelho (o editor não usa o storage direto)
    testarAoAbrir: false,
  };
  if (!parte) return telaLista(ctx, raiz, dados, pecas.P);
  if (parte === "nova") {
    if (!dados.pode_editar) return semEditar(ctx, raiz, dados);
    // plano 1500c · UCA-103: a automação colada abre como um rascunho (nasce desligada, com as pendências de nome)
    if (ctx.rota.query && ctx.rota.query.colar === "1" && colagem) { amb.rascunho = colagem; colagem = null; return ED.telaEditor(ctx, raiz, dados, null, amb); }
    if (ctx.rota.query && ctx.rota.query.ia === "1") {
      // a memória se perde ao recarregar a página (ou ao sair do módulo): a montagem volta do que ficou guardado na aba
      if (!rascunhoIA) { const g = rascunhos.ler("ia"); if (g) rascunhoIA = { auto: g.auto, explicacao: g.explicacao, avisos: g.avisos }; }
      if (rascunhoIA) amb.rascunho = rascunhoIA;
      else {
        // plano 1000b · UB-072: sem a montagem, não abre o editor em branco — volta à lista com a caixa «Criar com IA» em foco
        ui.toast("Não encontramos mais a montagem da IA nesta aba. Descreva de novo na caixa «Criar com IA».", { tipo: "info" });
        focarIAAoVoltar = true;
        ctx.navegar("#/automacoes");
        return;
      }
    }
    return ED.telaEditor(ctx, raiz, dados, null, amb);
  }
  const item = dados.itens.find(x => x.id === parte);
  if (!item) {
    ctx.titulo("Automação não encontrada");
    raiz.appendChild(ui.vazio({ titulo: "Não encontramos essa automação", texto: "Ela pode ter sido excluída. Volte para a lista.", icone: "raio", tema: "automacoes",
      acao: { rotulo: "Ver automações", fn: () => ctx.navegar("#/automacoes") } }));
    return;
  }
  return ED.telaEditor(ctx, raiz, dados, item, amb);
}

export function desmontar() {
  montagem++;
  pararPulso();
  desfazerTela();
  esquecerIA();   // o app só desmonta ao sair do módulo, trocar de empresa ou sair da conta
}

function semEditar(ctx, raiz, dados = null) {
  ctx.titulo("Automações");
  // plano 1000 · AS-228: diz A QUEM pedir (os administradores da empresa), não só «somente administradores»
  const pedir = L.frasePedirAdmin(dados && dados.base && dados.base.usuarios);
  raiz.appendChild(ctx.ui.vazio({ titulo: "Somente administradores criam automações", texto: `Você pode ver as automações e o histórico de execuções. ${pedir}`, icone: "cadeado",
    acao: { rotulo: "Ver automações", fn: () => ctx.navegar("#/automacoes") } }));
}

/* ================================================================== LISTA */

function telaLista(ctx, raiz, dados, P) {
  const { ui } = ctx;
  const h = ui.h;
  const vv = ctx.vocab;
  const vertical = dados.vertical || (ctx.cliente && ctx.cliente.vertical) || "generico";
  ctx.titulo("Automações");
  const itens = dados.itens;
  // plano 1000b · UB-001: o limite é lido ao vivo (excluir de vez libera a vaga sem F5) — dados.limite é o objeto que muda
  const lim = dados.limite || (dados.limite = {});
  const estaNoLimite = () => lim.limite != null && lim.usadas >= lim.limite;
  const noLimite = estaNoLimite();
  const aoLiberarLimite = [];       // cartão da IA e receitas registram como se reabrem
  const podeEditar = !!dados.pode_editar;

  const usoTxt = lim.limite == null ? `${itens.length} ${itens.length === 1 ? "automação" : "automações"} · sem limite no plano`
    : `${lim.usadas} de ${lim.limite} automações do plano`;     // plano 1000b · UB-070: diz de quê
  const btNova = podeEditar ? h("button", { type: "button", class: "bt bt-sec", disabled: noLimite,
    title: noLimite ? `Seu plano permite até ${lim.limite} automações.` : null,
    on: { click: () => ctx.navegar("#/automacoes/nova") } }, ui.icone("mais"), "Criar do zero") : null;
  // plano 1000 · AS-016: botão de emergência — desliga de uma vez tudo o que manda WhatsApp (com «Religar as mesmas» no aviso)
  // revisão 1000b · UB-122: data-escrita — sem internet o shell (app.js SEL_ESCRITA) marca este botão aria-disabled com a dica antes do clique
  const btPausar = podeEditar ? h("button", { type: "button", class: "bt bt-fant au-pausar", "data-escrita": "", hidden: !L.ligadasQueEnviam(itens).length },
    ui.icone("parar"), "Pausar envios agora") : null;
  // plano 1000 · AS-022: desligar não libera vaga no plano — a pílula diz isso (dica no toque/foco e para o leitor de tela)
  const ajudaUso = lim.limite == null ? null : "Desligadas também contam no plano; para liberar vaga, exclua uma automação.";
  // plano 1000b · UB-184: a pílula não é controle — sem tabindex (o Tab não para nela); a ajuda vai por aria-describedby (ui.dica)
  const pilulaUso = h("span", { class: ["pilula", noLimite ? "pilula-aten" : "pilula-neutra", "au-uso"], title: ajudaUso }, usoTxt);
  // plano 1000b · UB-001: depois de excluir de vez, se saiu do limite, tudo o que criava volta a acender
  const pintarLimite = () => {
    if (lim.limite != null) pilulaUso.textContent = `${lim.usadas} de ${lim.limite} automações do plano`;
    // plano 1500c · UCA-090: sem limite no plano, a pílula também acompanha a exclusão (5 → 4)
    else pilulaUso.textContent = `${itens.length} ${itens.length === 1 ? "automação" : "automações"} · sem limite no plano`;
    if (estaNoLimite()) return;
    pilulaUso.classList.remove("pilula-aten"); pilulaUso.classList.add("pilula-neutra");
    if (btNova) { btNova.disabled = false; btNova.removeAttribute("title"); }
    const av = raiz.querySelector("#au-limite"); if (av) av.remove();
    for (const f of aoLiberarLimite.splice(0)) { try { f(); } catch { /* ok */ } }
  };
  const aoExcluida = () => { if (Number.isFinite(Number(lim.usadas))) lim.usadas = Math.max(0, Number(lim.usadas) - 1); pintarLimite(); };
  if (ajudaUso && typeof ui.dica === "function") { try { ui.dica(pilulaUso, ajudaUso); } catch { /* o title basta */ } }

  raiz.appendChild(h("header", { class: "cab-pag au-cab" },
    h("div", null,
      h("p", { class: "rotulo" }, "Operação no automático"),
      h("h1", { class: "titulo-pag" }, "Automações"),
      // plano 1000 · AS-018: o «por onde sai» vem dos números da empresa (CodeWords, Meta, os dois ou nenhum)
      h("p", { class: "sub" }, `Quando algo acontece, o sistema confere as condições e faz o resto: move no funil, cria tarefas, avisa a equipe, etiqueta, espera um tempo e ${L.viaWhatsApp(dados.base && dados.base.canais)}.`)),
    h("div", { class: "linha au-cab-acoes" },
      pilulaUso,
      btPausar, btNova)));

  // plano 1000b · UB-185: diz A QUEM pedir (o mesmo caminho do semEditar)
  if (!podeEditar) raiz.appendChild(h("p", { class: "aviso au-aviso-papel" }, ui.icone("cadeado"),
    h("span", null, `Você pode ver as automações e o histórico. Para criar ou mudar: ${L.frasePedirAdmin(dados.base && dados.base.usuarios)}`)));
  // plano 2000d · DU-071: teste vencido/suspensa — as ligadas não estão rodando; o topo diz antes de alguém achar que está tudo saindo
  if (L.empresaBloqueada(ctx.cliente) && itens.some(x => x.ativo)) raiz.appendChild(h("p", { class: "aviso aviso-aten au-aviso-parada" }, ui.icone("alerta"),
    h("span", null, "O acesso está só para consulta: nenhuma automação está rodando agora, nem as que aparecem como ligadas. ", h("a", { href: "#/config/plano" }, "Ver Plano e uso"), ".")));
  // plano 1000b · UB-047: UM aviso de limite (aqui no topo, com o caminho para o plano); a caixa da IA e as receitas apontam para ele
  if (noLimite && podeEditar) raiz.appendChild(h("p", { class: "aviso aviso-aten au-aviso-limite", id: "au-limite" }, ui.icone("alerta"),
    h("span", null, `Seu plano chegou ao limite de ${lim.limite} automações (desligadas também contam). Exclua uma que não usa para criar outra, ou peça mais. `,
      h("a", { href: "#/config/plano" }, "Ver Plano e uso"), "."),
    // plano 2000d · DU-079: o pedido de aumento direto (o shell abre o pedido de contratação; sem ele, o link do plano basta)
    pedirContratacao(ctx) ? h("button", { type: "button", class: "bt bt-sec bt-p au-pedir-mais", on: { click: () => pedirContratacao(ctx)("automacoes_limite") } }, ui.icone("mais"), "Pedir mais automações") : null));

  // ------------------------------------------------ resumo em números (item 52): ligadas, execuções, taxa de sucesso, em espera
  const faixaResumo = h("div", { class: "au-resumo", role: "group", "aria-label": "Resumo das automações" });
  const pintarResumo = () => {
    ui.limpar(faixaResumo);
    const r = L.resumoAutomacoes(itens);
    // plano 1000 · AS-014: os números dizem o período (desde a criação; últimos 30 dias quando o servidor manda os contadores do mês)
    const periodo = L.periodoDoResumo(itens) === "30d" ? "nos últimos 30 dias" : "desde a criação de cada uma";
    // ui.kpi (frente A) quer número + formato; enquanto não existe, a peça local aceita o texto pronto
    const kpi = typeof ui.kpi === "function"
      ? o => ui.kpi({ rotulo: o.rotulo, valor: o.num, formato: o.formato || "int", ajuda: o.ajuda })
      : o => P.kpi({ rotulo: o.rotulo, valor: o.texto, ajuda: o.ajuda, icone: o.icone, tom: o.tom });
    faixaResumo.append(
      kpi({ rotulo: `Ligadas de ${r.total}`, num: r.ligadas, texto: `${r.ligadas} de ${r.total}`, ajuda: "Automações que estão rodando agora.", icone: "raio", tom: r.ligadas ? "ok" : null }),
      kpi({ rotulo: "Execuções", num: r.execucoes, texto: ui.num(r.execucoes), ajuda: `Quantas vezes as automações rodaram ${periodo}, somando todas.`, icone: "relogio" }),
      kpi({ rotulo: "Deram certo", num: r.pct == null ? null : r.pct / 100, formato: "pct", texto: r.pct == null ? "—" : `${r.pct}%`,
        ajuda: r.pct == null ? "Ainda não há execuções para medir." : `${ui.num(r.execucoes - r.erros)} de ${ui.num(r.execucoes)} execuções sem erro ${periodo}.`, icone: "check", tom: r.pct == null ? null : L.nivelTaxa(r.pct) }),
      kpi({ rotulo: "Em espera", num: r.em_espera, texto: ui.num(r.em_espera), ajuda: "Pessoas no meio de uma sequência, aguardando o próximo passo.", icone: "relogio", tom: r.em_espera ? "info" : null }));
    // plano 1500c · UCA-105: o tempo que a equipe deixou de gastar (só quando o servidor manda mensagens_30d; sem o dado, o KPI some)
    // plano 2000d · DU-095: os minutos por mensagem vêm da configuração da empresa (base.minutos_por_mensagem; padrão 2) e a ajuda cita o valor
    const mpm = minutosPorMensagem(dados.base);
    const te = L.tempoEconomizado(itens, { minutosPorMensagem: mpm });
    if (te) faixaResumo.append(P.kpi({ rotulo: "Tempo poupado", valor: `≈ ${te.texto}`, icone: "relogio", tom: "ok",
      ajuda: `Nos últimos 30 dias: cada mensagem automática conta ${mpm === 1 ? "1 minuto" : `${String(mpm).replace(".", ",")} minutos`} que alguém da equipe gastaria para escrever e mandar (o valor muda em Configurações).` }));
    // plano 2000d · DU-101: mensagens enviadas hoje pelas automações (quando o servidor manda mensagens_hoje), com o link do histórico
    const mh = dados.base && dados.base.mensagens_hoje != null ? Number(dados.base.mensagens_hoje) : (itens.some(x => x && x.mensagens_hoje != null) ? itens.reduce((n, x) => n + (Number(x && x.mensagens_hoje) || 0), 0) : null);
    // (o histórico de envios ainda não tem tela própria: o KPI fica sem link até ela existir)
    if (Number.isFinite(mh)) faixaResumo.append(P.kpi({ rotulo: "Mensagens hoje", valor: ui.num(mh), icone: "whatsapp", ajuda: "Mensagens que as automações mandaram hoje (as de aviso interno não contam)." }));
  };
  if (itens.length) { pintarResumo(); raiz.appendChild(faixaResumo); }

  // ------------------------------------------------ criar com IA
  // plano 1500c · UCA-058: a primeira automação guiada (3 escolhas → a receita certa), só com a lista vazia
  if (podeEditar && !itens.length && !noLimite) raiz.appendChild(primeiraAutomacao(ctx, vertical, P));
  if (podeEditar) raiz.appendChild(cartaoIA(ctx, dados, noLimite, P, aoLiberarLimite));
  // plano 1500c · UCA-103: colar uma automação copiada de outro cliente (pelos nomes)
  if (podeEditar && !noLimite) raiz.appendChild(caixaColar(ctx, dados));
  if (focarIAAoVoltar) {
    focarIAAoVoltar = false;
    const t = raiz.querySelector(".au-ia-txt:not(:disabled)");
    if (t) { try { t.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem() }); } catch { /* ok */ } t.focus({ preventScroll: true }); }
  }

  // ------------------------------------------------ as do cliente
  const metas = new Map();
  // ligar/desligar (interruptor ou pulso) muda os números do topo e as contagens dos filtros: tudo sai de `itens`, recontado na hora
  let recontarSuas = () => {};
  let suas = null;
  let aoMudarCmds = () => {};     // re-registra os comandos «Ligar/Desligar» da paleta (definido mais abaixo)
  const aoMudarEstado = () => {
    if (itens.length) pintarResumo(); recontarSuas();
    if (btPausar) btPausar.hidden = !L.ligadasQueEnviam(itens).length;
    try { aoMudarCmds(); } catch { /* a paleta é um extra */ }
  };
  // plano 2000d · DU-357: o vazio cita um caso do segmento e abre a receita certa; DU-086: o kit inicial cria 3 desligadas de uma vez
  const vz = L.textoVazio(vertical);
  const vazioLista = () => h("div", { class: "au-vazio" }, ui.vazio({ tema: "automacoes",
    titulo: "Automações fazem o trabalho repetitivo.", /* plano 1000b · UB-071: para quem não edita, o vazio diz a quem pedir */ texto: podeEditar ? `${vz.texto} Descreva o que você quer na caixa acima, ou comece por uma receita pronta.` : `Ainda não há automações criadas. ${L.frasePedirAdmin(dados.base && dados.base.usuarios)}`, icone: "raio",
    acao: podeEditar && !noLimite && L.MODELOS.some(m => m.id === vz.receita) ? { rotulo: "Abrir essa receita", fn: () => ctx.navegar(`#/automacoes/nova?modelo=${encodeURIComponent(vz.receita)}`) } : undefined }),
    podeEditar && !noLimite ? kitInicialCaixa(ctx, dados, vertical) : null);
  if (itens.length) {
    suas = secaoSuas(ctx, dados, itens, metas, P, aoMudarEstado, aoExcluida, () => {
      // plano 1000 · AS-010: a última automação saiu — a seção vira o vazio e o resumo do topo some (sem redesenhar a tela inteira)
      if (itens.length) return;
      const v = vazioLista();
      suas.el.replaceWith ? suas.el.replaceWith(v) : (suas.el.parentNode.insertBefore(v, suas.el), suas.el.remove());
      faixaResumo.remove();
      const alvo = raiz.querySelector(".au-ia-txt:not(:disabled)") || btNova;
      if (alvo && !alvo.disabled) alvo.focus({ preventScroll: true });
    });
    recontarSuas = suas.recontar;
    raiz.appendChild(suas.el);
  } else raiz.appendChild(vazioLista());

  if (btPausar) btPausar.addEventListener("click", () => pausarEnvios(ctx, itens, metas, btPausar, aoMudarEstado, raiz));

  // ------------------------------------------------ receitas prontas
  if (podeEditar) raiz.appendChild(secaoReceitas(ctx, dados, vertical, vv, noLimite, itens.length, P, aoLiberarLimite));

  // ------------------------------------------------ do sistema
  const sis = h("ul", { class: "au-sis", role: "list" });
  for (const r of dados.sistema || []) {
    // plano 1000 · AS-017: as regras que têm ajuste em outro lugar levam até ele
    const ajuste = L.ajusteDaRegraSistema(r.nome);
    sis.appendChild(h("li", { class: "au-sis-item" },
      h("span", { class: "au-sis-ic", "aria-hidden": "true" }, ui.icone("escudo")),
      h("div", null, h("p", { class: "au-sis-nome" }, r.nome), h("p", { class: "au-sis-desc" }, r.descricao),
        ajuste ? h("a", { class: "au-sis-link", href: ajuste.href }, ajuste.rotulo, ui.icone("seta-dir")) : null),
      h("span", { class: "pilula pilula-ok au-sis-selo" }, ui.icone("check"), "Sempre ligada")));
  }
  // plano 1000 · AS-017: no celular a seção nasce recolhida (5 regras fixas não empurram a tela); no computador, aberta
  const celular = (() => { try { return typeof matchMedia === "function" && matchMedia("(max-width: 760px)").matches; } catch { return false; } })();
  const nSis = (dados.sistema || []).length;
  // plano 1000b · UB-046: o h2 fica FORA do <summary> (summary é botão: o título sumia da navegação por cabeçalhos)
  raiz.appendChild(h("section", { class: "au-sec au-sec-sistema", "aria-labelledby": "au-sis" },
    h("div", { class: "au-sec-cab" },
      h("h2", { class: "titulo-sec", id: "au-sis" }, "Do sistema"),
      h("span", { class: "rotulo" }, `${nSis} ${nSis === 1 ? "regra pronta" : "regras prontas"} · não dá para desligar`)),
    h("details", { class: "au-sis-det", open: !celular },
      h("summary", { class: "au-sis-sum" },
        h("span", null, nSis === 1 ? "Ver a regra" : `Ver as ${nSis} regras`),
        ui.icone("seta-baixo", "au-sis-seta")),
      sis)));

  let faixaMudou = null;
  const avisarListaMudou = () => {
    if (faixaMudou && faixaMudou.isConnected) return;
    const bt = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("reabrir"), "Atualizar");
    bt.addEventListener("click", () => montar(ctx));
    faixaMudou = h("div", { class: "aviso au-lista-mudou" }, ui.icone("info"), h("span", { role: "status" }, "A lista mudou: alguém criou ou excluiu uma automação."), bt);
    raiz.insertBefore(faixaMudou, raiz.querySelector(".au-sec") || null);
  };
  // ------------------------------------------------ contadores ao vivo (pulso, no máx. 1× a cada 20 s)
  // plano 1500c · UCA-028: assinado também com a lista vazia (aí só a faixa «A lista mudou» importa)
  if (ctx.pulso && ctx.pulso.assinar) {
    let ultimo = Date.now(), pedindo = false;
    const eu = montagem;
    cancelarPulso = ctx.pulso.assinar(async () => {
      if (pedindo || Date.now() - ultimo < 20000 || eu !== montagem) return;
      pedindo = true; ultimo = Date.now();
      try {
        const novo = await ctx.api.rpcC("nx_automacoes_listar");
        if (eu !== montagem) return;
        // os da lista se repintam; os fora do filtro atual (sem cartão na tela) só atualizam o dado, que o resumo e os filtros contam
        for (const it of novo.itens || []) { const m = metas.get(it.id); if (m) m(it); else { const x = itens.find(y => y.id === it.id); if (x) Object.assign(x, it); } }
        aoMudarEstado();
        // plano 1000b · UB-044: outra pessoa criou ou excluiu → faixa «A lista mudou · Atualizar» (não redesenha sozinho embaixo de quem está usando)
        if (L.listaMudou(itens, novo.itens, excluindo)) avisarListaMudou();
      } catch { /* silencioso: o próximo pulso tenta de novo */ } finally { pedindo = false; }
    });
  }

  // ------------------------------------------------ paleta Ctrl/⌘+K (item 59): o que esta tela oferece
  // plano 1000 · AS-229: cada automação na paleta — «Ligar/desligar …» usa o mesmo interruptor do cartão (com as mesmas confirmações)
  // o comando guarda o estado pedido (c.ligar): se a automação já está assim (o rótulo ficou velho), avisa em vez de inverter
  const fazerCmdAuto = c => {
    if (c.acao === "abrir") { ctx.navegar(`#/automacoes/${c.automacao}`); return; }
    // plano 1000b · UB-048: o cartão é achado comparando o data-id (sem montar seletor CSS à mão — id com «\» ou «"» lançava SyntaxError)
    const cart = [...raiz.querySelectorAll(".au-item")].find(li => li.dataset.id === String(c.automacao));
    const sw = cart ? cart.querySelector(".au-sw") : null;
    if (sw && !sw.disabled) {
      sw.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem() }); sw.focus({ preventScroll: true });
      const agora = typeof sw.ligado === "function" ? sw.ligado() : null;
      if (typeof c.ligar === "boolean" && agora === c.ligar) { ui.toast(`«${c.nome || "A automação"}» já está ${c.ligar ? "ligada" : "desligada"}.`, { tipo: "info" }); return; }
      sw.click();
    } else ctx.navegar(`#/automacoes/${c.automacao}`);      // fora do filtro da lista: abre a automação
  };
  // re-registrados a cada mudança de estado (aoMudarEstado): o rótulo «Ligar/Desligar» acompanha o interruptor
  const cmdsAuto = [];
  const registrarCmdsAuto = () => {
    for (const f of cmdsAuto.splice(0)) { try { f(); } catch { /* ok */ } }
    registrarComandos(ctx, L.comandosDasAutomacoes(itens, { podeEditar }).map(c => ({ ...c, fazer: () => fazerCmdAuto(c) })), cmdsAuto);
  };
  registrarCmdsAuto();
  limpezas.push(() => { for (const f of cmdsAuto.splice(0)) { try { f(); } catch { /* ok */ } } });
  aoMudarCmds = registrarCmdsAuto;
  registrarComandos(ctx, [
    podeEditar && !noLimite ? { id: "automacoes.nova", rotulo: "Criar automação do zero", palavras: "nova automacao criar regra fluxo", icone: "mais", fazer: () => ctx.navegar("#/automacoes/nova") } : null,
    podeEditar && !L.iaDesligada(dados) ? { id: "automacoes.ia", rotulo: "Criar automação com IA", palavras: "ia inteligencia artificial descrever montar", icone: "ia",
      fazer: () => { const t = raiz.querySelector(".au-ia-txt"); if (t) { t.scrollIntoView({ block: "center", behavior: ui.comportamentoRolagem() }); t.focus({ preventScroll: true }); } } } : null,
    // plano 1000b · UB-186: o Ctrl/⌘+Enter da caixa «Criar com IA» aparece na folha de atalhos («?») e na paleta
    podeEditar && !L.iaDesligada(dados) ? { id: "automacoes.ia-enviar", rotulo: "Enviar o pedido da caixa «Criar com IA»", atalho: "Ctrl+Enter", palavras: "ia enviar pedido montar atalho",
      icone: "ia", fazer: () => { const b = raiz.querySelector(".au-ia-bt"); if (b && !b.disabled) b.click(); else { const t = raiz.querySelector(".au-ia-txt"); if (t) t.focus({ preventScroll: false }); } } } : null,
    podeEditar ? { id: "automacoes.receitas", rotulo: "Ver receitas prontas", palavras: "receitas modelos prontas exemplos", icone: "modelo",
      fazer: () => { const e = raiz.querySelector("#au-mod"); if (e) { e.scrollIntoView({ block: "start", behavior: ui.comportamentoRolagem() }); const b = raiz.querySelector(".au-modelos-busca input"); if (b) b.focus({ preventScroll: true }); } } } : null,
  ]);
}

/** Registra comandos na paleta (quando o shell oferece ctx.comandos) e desfaz ao sair da tela. Nunca derruba a tela. */
function registrarComandos(ctx, lista, guardar = limpezas) {
  const reg = ctx.comandos && typeof ctx.comandos.registrar === "function" ? ctx.comandos.registrar : null;
  if (!reg) return;
  for (const c of lista) {
    if (!c) continue;
    try { const cancelar = reg(c); if (typeof cancelar === "function") guardar.push(cancelar); } catch { /* a paleta é um extra */ }
  }
}

/* ------------------------------------------------------------------ plano 1500c · UCA-058: primeira automação guiada */

function primeiraAutomacao(ctx, vertical, P = null) {
  const { ui } = ctx;
  const h = ui.h;
  const resp = {};
  const id = `au-prim-${Math.random().toString(36).slice(2, 7)}`;
  const btAbrir = h("button", { type: "button", class: "bt bt-prim", disabled: true }, ui.icone("seta-dir"), "Abrir a receita sugerida");
  const sugestao = h("p", { class: "sub au-prim-sug", role: "status" });
  const pintar = () => {
    const pronto = !!resp.objetivo && !!resp.quem;
    btAbrir.disabled = !pronto;
    if (!pronto) { sugestao.textContent = ""; return; }
    const idR = L.receitaSugerida(resp, vertical);
    const m = L.MODELOS.find(x => x.id === idR);
    sugestao.textContent = m ? `Sugestão: «${L.tituloModelo(m, ctx.vocab)}».` : "";
    btAbrir.dataset.modelo = idR || "";
  };
  btAbrir.addEventListener("click", () => { if (btAbrir.dataset.modelo) ctx.navegar(`#/automacoes/nova?modelo=${encodeURIComponent(btAbrir.dataset.modelo)}`); });
  const grupos = L.PERGUNTAS_PRIMEIRA.map(p => {
    const idP = `${id}-${p.id}`;
    const grupo = h("div", { class: "au-chips", role: "radiogroup", "aria-labelledby": idP });
    for (const [valor, rotulo] of p.opcoes) {
      const b = h("button", { type: "button", role: "radio", class: "au-chip", "aria-checked": "false" }, rotulo);
      b.addEventListener("click", () => {
        resp[p.id] = valor;
        grupo.querySelectorAll("[role=radio]").forEach(x => x.setAttribute("aria-checked", String(x === b)));
        pintar();
      });
      grupo.appendChild(b);
    }
    if (P && typeof P.setas === "function") P.setas(grupo);     // setas e uma parada de Tab por pergunta
    return h("div", { class: "au-prim-perg" }, h("p", { class: "au-prim-rot", id: idP }, p.pergunta), grupo);
  });
  return h("section", { class: "cartao au-prim", "aria-labelledby": `${id}-t` },
    h("p", { class: "rotulo" }, "Primeira automação"),
    h("h2", { class: "titulo-sec", id: `${id}-t` }, "Três escolhas e a receita certa abre pronta"),
    grupos, sugestao, h("div", { class: "linha" }, btAbrir));
}

/* ------------------------------------------------------------------ plano 1500c · UCA-103: colar automação de outro cliente */

let colagem = null;     // {auto, explicacao, avisos, colada:true} — o que «Colar automação» abre no editor
function caixaColar(ctx, dados) {
  const { ui } = ctx;
  const h = ui.h;
  const id = `au-colar-${Math.random().toString(36).slice(2, 7)}`;
  const area = h("textarea", { id, class: "au-colar-txt", rows: 3, maxlength: 20000, placeholder: "Cole aqui o texto copiado em «Copiar para outro cliente»" });
  const erro = h("p", { class: "campo-erro", role: "alert", hidden: true });
  const btAbrir = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("seta-dir"), "Abrir no editor");
  btAbrir.addEventListener("click", () => {
    // plano 2000d · DU-059: o texto pode trazer uma ou várias automações (o formato antigo continua aceito)
    const lista = L.importarAutomacoes(area.value.trim(), dados.base, ctx.vocab);
    if (!lista.length) { erro.textContent = textoColagemInvalida(nomeSuporte(ctx)); erro.hidden = false; area.focus(); return; }   // plano 2000d · DU-026
    erro.hidden = true;
    if (lista.length > 1) { colarVarias(ctx, dados, lista, btAbrir); return; }
    const r = lista[0];
    colagem = { auto: r.auto, explicacao: "Automação colada de outro cliente. Os itens com o mesmo nome foram ligados aos deste cliente; ela nasce desligada.", avisos: r.pendencias, colada: true };
    ctx.navegar("#/automacoes/nova?colar=1");
  });
  return h("details", { class: "au-colar" },
    h("summary", { class: "au-colar-sum" }, ui.icone("copiar"), h("span", null, "Colar automação de outro cliente")),
    h("div", { class: "campo campo-textarea" }, h("label", { for: id }, "Texto da automação"), area, erro),
    h("div", { class: "linha" }, btAbrir));
}

/**
 * plano 2000d · DU-059: colar VÁRIAS automações — cria cada uma DESLIGADA (as que precisam de ajuste ficam de fora e são ditas pelo nome).
 */
async function colarVarias(ctx, dados, lista, botao) {
  const { ui } = ctx;
  const prontas = lista.filter(r => L.validar(r.auto, { base: dados.base, ligar: false }).ok);
  const ajustar = lista.filter(r => !prontas.includes(r));
  const ok = await ui.confirmar({ titulo: `Criar ${L.plural(prontas.length, "automação", "automações")}?`, rotulo: "Criar desligadas",
    texto: `Elas nascem desligadas.${ajustar.length ? ` ${L.listaNomesCurta(ajustar.map(r => r.auto.nome || "sem nome"))} precisam de ajuste (etapa, etiqueta ou campo que não existe aqui): cole uma de cada vez para abrir no editor.` : ""}` });
  if (!ok || !prontas.length) return;
  const feitas = [], falhas = [];
  const exec = (async () => { for (const r of prontas) { try { await ctx.api.rpcC("nx_automacao_salvar", { p_auto: L.limpar({ ...r.auto, ativo: false }) }); feitas.push(r); } catch { falhas.push(r); } } })();
  await (typeof ui.carregando === "function" ? ui.carregando(botao, exec) : exec);
  if (feitas.length) ui.toast(`${L.plural(feitas.length, "automação criada", "automações criadas")} (desligadas).`, { tipo: "ok" });
  if (falhas.length) ui.toast(`Não consegui criar ${L.listaNomesCurta(falhas.map(r => r.auto.nome))}.`, { tipo: "erro" });
  if (feitas.length) ctx.navegar("#/automacoes");
}

/** plano 2000d · DU-086: «Criar o kit da clínica» — as receitas de destaque desta vertical, desligadas, num toque (só com a lista vazia). */
function kitInicialCaixa(ctx, dados, vertical) {
  const { ui } = ctx;
  const h = ui.h;
  const kit = L.kitInicial(vertical, dados.base, ctx.vocab);
  if (kit.length < 2) return null;
  const nomeSeg = { odonto: "da clínica", oficina: "da oficina", loja: "da loja" }[vertical] || "para começar";
  const bt = h("button", { type: "button", class: "bt bt-sec au-kit-bt" }, ui.icone("raio"), `Criar o kit ${nomeSeg} (${kit.length} desligadas)`);
  bt.addEventListener("click", async () => {
    const feitas = [];
    const exec = (async () => { for (const a of kit) { try { await ctx.api.rpcC("nx_automacao_salvar", { p_auto: L.limpar({ ...a, ativo: false }) }); feitas.push(a); } catch { /* segue com as outras */ } } })();
    await (typeof ui.carregando === "function" ? ui.carregando(bt, exec) : exec);
    ui.toast(feitas.length ? `${L.plural(feitas.length, "automação criada", "automações criadas")} desligada${feitas.length === 1 ? "" : "s"}. Revise e ligue quando quiser.` : "Não consegui criar o kit agora. Tente de novo.", { tipo: feitas.length ? "ok" : "erro" });
    if (feitas.length) ctx.navegar("#/automacoes");
  });
  return h("div", { class: "au-kit" }, h("p", { class: "sub" }, `Ou comece pelo kit: ${kit.map(a => `«${a.nome}»`).join(", ")}.`), bt);
}

/* ------------------------------------------------------------------ Criar com IA */

function cartaoIA(ctx, dados, noLimite, P, aoLiberarLimite = []) {
  const { ui } = ctx;
  const h = ui.h;
  const EXEMPLOS_IA = L.exemplosIA(ctx.vocab);     // 5 pedidos do dia a dia, no vocabulário da vertical (item 55)
  const ia = dados.ia || (dados.base && dados.base.ia) || null;
  // nx_automacoes_listar → ia:{disponivel, usadas, limite}; a base de Conversas usa ia:{ligada, cota:{usadas, limite}} (aceitamos as duas)
  const desligada = L.iaDesligada(dados);
  const cota = ia && (ia.cota || (ia.limite !== undefined ? { usadas: ia.usadas, limite: ia.limite } : null));
  const semCota = !!cota && cota.limite != null && Number(cota.usadas) >= Number(cota.limite);
  const MAX = L.LIMITES.descricao_ia;
  const MIN = 12;

  const id = `au-ia-${Math.random().toString(36).slice(2, 7)}`;
  // plano 1000 · AS-019: o pedido em digitação sobrevive a F5 e à atualização automática (na aba, como os rascunhos do editor)
  if (!textoIA) { try { const g = sessionStorage.getItem(chaveTextoIA(ctx)); if (g) textoIA = String(g).slice(0, MAX); } catch { /* sem storage */ } }
  const guardarTexto = ui.debounce(() => { try { if (textoIA.trim()) sessionStorage.setItem(chaveTextoIA(ctx), textoIA); else sessionStorage.removeItem(chaveTextoIA(ctx)); } catch { /* sem storage */ } }, 400);
  const area = h("textarea", { id, class: "au-ia-txt", rows: 3, maxlength: MAX, disabled: desligada,
    placeholder: `Ex.: ${EXEMPLOS_IA[0]}`, "aria-describedby": noLimite && !desligada ? `${id}-aj au-limite` : `${id}-aj` }, textoIA);   // plano 1000b · UB-047: o aviso único do topo
  area.value = textoIA;                // o texto guardado (memória ou aba) volta para a caixa
  const contador = h("span", { class: "au-ia-cont mono", "aria-hidden": "true" }, `${textoIA.length}/${MAX}`);
  const btCriar = h("button", { type: "button", class: "bt bt-prim bt-g au-ia-bt", disabled: true }, ui.icone("ia"), "Criar com IA");
  // plano 1000b · UB-186: o atalho Ctrl/⌘+Enter deixa de ser secreto — dica ao lado do contador (some em tela de toque, pelo CSS) e na folha «?»
  const teclaMod = (() => { try { return /Mac|iPhone|iPad/i.test(String((typeof navigator !== "undefined" && (navigator.userAgentData && navigator.userAgentData.platform || navigator.platform)) || "")) ? "⌘" : "Ctrl"; } catch { return "Ctrl"; } })();
  const dicaAtalho = h("span", { class: "au-ia-atalho", "aria-hidden": "true" }, `${teclaMod}+Enter para enviar`);
  area.setAttribute("aria-keyshortcuts", "Control+Enter Meta+Enter");
  const estado = h("div", { class: "au-ia-estado", "aria-live": "polite" });
  // plano 1000 · AS-007: no limite de automações os exemplos também apagam (encher a caixa sem poder pedir não ajuda)
  const usar = t => { area.value = t; area.dispatchEvent(new Event("input", { bubbles: true })); area.focus(); };
  const exemplos = h("div", { class: "au-ia-ex-caixa" },
    h("p", { class: "au-ia-ex-rot", id: `${id}-ex` }, "Exemplos — toque para usar"),
    h("div", { class: "au-chips au-ia-ex", role: "group", "aria-labelledby": `${id}-ex` }, EXEMPLOS_IA.map(t => {
      const b = h("button", { type: "button", class: "au-chip au-chip-ex", disabled: desligada || semCota || noLimite, title: t }, ui.icone("ia"), h("span", null, t));
      b.addEventListener("click", () => usar(t));
      return b;
    })));
  // plano 1000 · AS-072: os últimos pedidos desta pessoa nesta empresa voltam como chips (só o texto, no aparelho)
  // plano 1500c · UCA-101: a chave usa só o id da conta (nunca o e-mail); sem id, nada é guardado
  const contaId = ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id ? ctx.sessao.conta.id : null;
  const chaveRecentes = contaId ? `nx-au-ia-recentes:${ctx.cliente ? ctx.cliente.id : "-"}|${contaId}` : null;
  // plano 1500c · UCA-101: {texto, em} — com mais de 30 dias some (computador de recepção compartilhado)
  const lerRecentes = () => { if (!chaveRecentes) return []; try { const v = JSON.parse(localStorage.getItem(chaveRecentes) || "[]"); return L.pedidosRecentes(v); } catch { return []; } };
  const recentesCaixa = h("div", { class: "au-ia-ex-caixa au-ia-recentes" });
  const pintarRecentes = () => {
    ui.limpar(recentesCaixa);
    const l = lerRecentes();
    recentesCaixa.hidden = !l.length || desligada;
    if (recentesCaixa.hidden) return;
    const btLimpar = h("button", { type: "button", class: "bt bt-fant bt-p au-ia-rec-limpar" }, "Limpar recentes");
    btLimpar.addEventListener("click", () => { try { localStorage.removeItem(chaveRecentes); } catch { /* sem storage */ } pintarRecentes(); area.focus(); });
    recentesCaixa.append(h("div", { class: "au-ia-rec-cab" }, h("p", { class: "au-ia-ex-rot", id: `${id}-rec` }, "Pedidos recentes"), btLimpar),
      h("div", { class: "au-chips au-ia-ex", role: "group", "aria-labelledby": `${id}-rec` }, l.map(({ texto: t }) => {
        const b = h("button", { type: "button", class: "au-chip au-chip-ex au-chip-rec", disabled: semCota || noLimite, title: t }, ui.icone("relogio"), h("span", null, t));
        b.addEventListener("click", () => usar(t));
        return b;
      })));
  };
  // pedido com telefone, CPF ou e-mail (AS-071) não fica guardado no aparelho
  const guardarRecente = t => { if (!chaveRecentes || L.dadosPessoaisNoPedido(t).length) return; try { localStorage.setItem(chaveRecentes, JSON.stringify(L.pedidosRecentes(lerRecentes(), t))); } catch { /* sem storage */ } };
  pintarRecentes();
  // plano 1000b · UB-047: a frase do limite é a do topo (#au-limite), ligada à caixa por aria-describedby — não se repete aqui
  // plano 1000b · UB-001: excluiu e saiu do limite → a caixa, os exemplos e os recentes reacendem sem recarregar
  aoLiberarLimite.push(() => {
    noLimite = false;
    area.setAttribute("aria-describedby", `${id}-aj`);
    exemplos.querySelectorAll(".au-chip-ex").forEach(b => { b.disabled = desligada || semCota; });
    pintarBotao(); pintarRecentes();
  });

  // plano 1000 · AS-070: quanto da cota do mês já foi usado, ANTES de pedir (amarelo a partir de 80 %)
  const cotaInfo = desligada ? null : L.linhaCotaIA(cota);
  const linhaCota = cotaInfo ? h("p", { class: ["au-ia-cota", `au-ia-cota-${cotaInfo.tom}`], dataset: { tom: cotaInfo.tom } }, cotaInfo.texto) : null;
  const pintarBotao = () => {
    const n = area.value.trim().length;
    contador.textContent = `${area.value.length}/${MAX}`;
    // plano 1000 · AS-006: sem cota, o botão nem acende (antes a pessoa digitava, esperava e só então recebia «ia_cota»)
    btCriar.disabled = desligada || noLimite || semCota || n < MIN;
    textoIA = area.value;
    guardarTexto();
  };
  area.addEventListener("input", pintarBotao);
  area.addEventListener("keydown", ev => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey) && !btCriar.disabled) { ev.preventDefault(); btCriar.click(); } });
  pintarBotao();

  const cartao = h("section", { class: ["cartao", "au-ia", desligada && "au-ia-off"], "aria-labelledby": `${id}-t` },
    h("div", { class: "au-ia-cab" },
      h("span", { class: "au-ia-ic", "aria-hidden": "true" }, ui.icone("ia")),
      h("div", null,
        h("p", { class: "rotulo" }, "Descreva e a IA monta"),
        h("h2", { class: "titulo-sec", id: `${id}-t` }, "Criar com IA"))),
    h("p", { class: "sub" }, "Descreva o que você quer que aconteça, do jeito que falaria com alguém da equipe. A IA monta a automação, você confere, ajusta e só então salva — ela nunca liga nada sozinha."),
    h("div", { class: "campo campo-textarea au-ia-campo" },
      h("label", { for: id }, "O que você quer automatizar?"),
      area,
      // plano 1000 · AS-071: o pedido vai para a IA (Anthropic) — nada de nome, telefone ou dado de saúde de cliente
      h("small", { class: "campo-ajuda au-ia-ajuda", id: `${id}-aj` }, "Conte o gatilho (quando), o que checar e o que fazer. Use as palavras do seu dia a dia. Não cole nomes, telefones, CPF ou dados de saúde de clientes: o pedido é lido por um serviço de IA externo.")),
    recentesCaixa,
    exemplos,
    h("div", { class: "au-ia-rodape" }, dicaAtalho, contador, btCriar),
    linhaCota,
    estado);

  if (desligada) estado.appendChild(h("p", { class: "aviso aviso-aten" }, ui.icone("ia"),
    h("span", null, "A IA ainda não está ligada nesta plataforma. Peça ao suporte da plataforma para ativar; enquanto isso, use as receitas prontas abaixo ou crie do zero." /* plano 1000b · UB-068: sem citar a Nexus (white-label) */)));
  else if (semCota) estado.appendChild(h("p", { class: "aviso aviso-aten" }, ui.icone("alerta"),
    h("span", null, L.textoCotaEsgotada(ia))));   // plano 1000b · UB-068 · plano 2000d · DU-070: a data de renovação do servidor quando houver

  let pedindo = false;
  let pedidoAtual = 0;           // plano 1000 · AS-073: «Parar de esperar» abandona o pedido em andamento (a resposta que chegar depois é ignorada)
  btCriar.addEventListener("click", async () => {
    if (pedindo || btCriar.disabled) return;
    const descricao = area.value.trim();
    // plano 1000 · AS-071: telefone, CPF ou e-mail no pedido → pergunta antes de mandar para a IA
    const pessoais = L.dadosPessoaisNoPedido(descricao);
    if (pessoais.length) {
      pedindo = true;
      const ok = await ui.confirmar({ titulo: "Mandar dados pessoais para a IA?", rotulo: "Mandar assim mesmo",
        texto: `O pedido tem ${pessoais.map(x => `${x.tipo} («${x.trecho}»)`).join(", ")}. Ele é lido por um serviço de IA externo; para montar a automação não é preciso dado de cliente — troque por algo genérico, como «o paciente».` });
      pedindo = false;
      if (!ok) { area.focus(); return; }
    }
    pedindo = true;
    const meu = ++pedidoAtual;
    // plano 1500c · UCA-102: o pedido só vira «recente» depois que a IA montou (cota esgotada ou erro não viram chip)
    // revisão: a montagem anterior (já paga) volta à tela se a nova chamada falhar (cota, rede) — antes ela sumia de vez
    // plano 1000b · UB-002: só a montagem (.au-ia-res) volta — avisos de estado (erro, carregando, «Paramos de esperar») não se empilham
    const anteriores = [...estado.childNodes].filter(n => n.classList && n.classList.contains("au-ia-res"));
    ui.limpar(estado);
    const txtCarregando = h("span", null, "A IA está montando a automação… isso leva alguns segundos.");
    // plano 1000 · AS-073: a espera pode passar de 1 minuto — dá para desistir (a caixa volta; a cota pode já ter sido usada)
    let desistir = null;
    const desistiu = new Promise((_, rej) => { desistir = () => rej(Object.assign(new Error("cancelado"), { cancelado: true })); });
    desistiu.catch(() => {});
    const controle = typeof AbortController === "function" ? new AbortController() : null;
    const btParar = h("button", { type: "button", class: "bt bt-fant bt-p au-ia-parar" }, ui.icone("fechar"), "Parar de esperar");
    btParar.addEventListener("click", () => { try { if (controle) controle.abort(); } catch { /* ok */ } desistir(); });
    estado.appendChild(h("div", { class: "au-ia-carregando", role: "status" }, h("span", { class: "au-giro", "aria-hidden": "true" }), txtCarregando, btParar));
    // pedidos grandes demoram (o navegador espera até L.PRAZO_MONTAR_IA_MS): diz que ainda está trabalhando, para não clicarem de novo
    const lento = setTimeout(() => { txtCarregando.textContent = "Ainda montando… pedidos maiores levam até 2 minutos. Não feche esta tela nem clique de novo."; }, 20_000);
    area.readOnly = true;   // só-leitura (não disabled): o campo mantém o foco do teclado durante a chamada
    try {
      // `sinal` cancela a chamada de rede quando o api.js aceitar (hoje a resposta que chegar depois só é ignorada)
      const chamada = ctx.api.fn("nx-ia", { acao: "automacao_montar", descricao }, { prazoMs: L.PRAZO_MONTAR_IA_MS, sinal: controle ? controle.signal : undefined });
      const r = await ui.carregando(btCriar, Promise.race([chamada, desistiu]));
      if (meu !== pedidoAtual) return;
      if (!r || !r.automacao || typeof r.automacao !== "object") throw Object.assign(new Error("ia_resposta_invalida"), { codigo: "ia_resposta_invalida" });
      guardarRecente(descricao);     // plano 1500c · UCA-102
      const conv = L.deFormatoIA(r.automacao, dados.base);
      const avisos = [...(Array.isArray(r.avisos) ? r.avisos : []).map(String), ...conv.avisos].filter(Boolean).slice(0, 12);
      const montagemIA = { auto: conv.auto, explicacao: typeof r.explicacao === "string" ? r.explicacao.trim().slice(0, 1500) : "", avisos, descricao };
      ui.limpar(estado);
      estado.appendChild(resultadoIA(ctx, dados, montagemIA, () => { area.focus(); }, reenviar, P));
    } catch (e) {
      ui.limpar(estado);
      if (e && e.cancelado) {
        pedidoAtual++;      // a resposta que ainda chegar não pinta nada
        estado.appendChild(h("p", { class: "aviso au-ia-desistiu", role: "status" }, ui.icone("info"),
          h("span", null, "Paramos de esperar. Se a IA já tinha começado, este pedido pode ter gastado 1 uso da IA do mês. O texto continua na caixa.")));
        if (anteriores.length) estado.append(...anteriores);
        area.focus();
        return;
      }
      // G4 [E167]: reprovada na conferência, mas a montagem voltou (a cota já foi gasta) → abre no editor com o motivo
      const rep = L.montagemReprovada(e, dados.base);
      if (rep) guardarRecente(descricao);     // plano 1500c · UCA-102: a montagem veio (só não passou na conferência)
      if (rep) { estado.appendChild(resultadoIA(ctx, dados, { ...rep, descricao }, () => { area.focus(); }, reenviar, P)); return; }
      const x = L.erroDaIA(e, ctx.api.mensagemErro(e), nomeSuporte(ctx));     // plano 1000b · UB-067
      estado.appendChild(h("div", { class: ["aviso", x.tipo === "cota" || x.tipo === "chave" || x.tipo === "desligada" ? "aviso-aten" : "aviso-ruim", "au-ia-erro"], role: "alert" },
        ui.icone(x.tipo === "rede" ? "alerta" : "ia"),
        h("div", { class: "pilha-p" }, h("p", null, h("b", null, x.titulo)), h("p", null, x.texto),
          x.tipo === "cota" || x.tipo === "chave" || x.tipo === "desligada"
            ? h("div", { class: "linha" }, h("button", { type: "button", class: "bt bt-sec bt-p", on: { click: () => ctx.navegar("#/automacoes/nova") } }, ui.icone("mais"), "Criar do zero"))
            : null)));
      if (anteriores.length) estado.append(...anteriores);   // a montagem de antes continua usável

    } finally {
      clearTimeout(lento);
      pedindo = false;
      area.readOnly = false;
      pintarBotao();
      pintarRecentes();
    }
  });
  /** G4: as respostas às dúvidas da IA viram um pedido novo (o texto vai para a caixa, à vista) e a IA monta de novo. */
  function reenviar(novoTexto) {
    area.value = novoTexto;
    pintarBotao();
    if (btCriar.disabled) { area.focus(); return; }
    btCriar.click();
  }
  return cartao;
}

/** A montagem da IA: explicação, avisos, a frase da automação e o botão que abre o editor. */
function resultadoIA(ctx, dados, m, tentarOutra, reenviar, P) {
  const { ui } = ctx;
  const h = ui.h;
  const frase = L.descrever(m.auto, dados.base, ctx.vocab);
  const problema = L.validar(m.auto, { base: dados.base, ligar: false });
  m.avisos = Array.isArray(m.avisos) ? m.avisos : [];
  const abrir = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("seta-dir"), "Conferir e ajustar no editor");
  abrir.addEventListener("click", () => {
    rascunhoIA = m;
    rascunhosDe(ctx).guardar("ia", m.auto, { explicacao: m.explicacao, avisos: m.avisos });   // recarregar a página não gasta a cota de IA de novo
    ctx.navegar("#/automacoes/nova?ia=1");
  });
  const outra = h("button", { type: "button", class: "bt bt-fant" }, "Pedir de outro jeito");
  outra.addEventListener("click", tentarOutra);
  // plano 1000b · UB-045: só uma frase curta é região viva; o foco vai ao título do resultado (o leitor não lê tudo de uma vez)
  const idNome = `au-ia-res-${Math.random().toString(36).slice(2, 7)}`;
  const nome = h("h3", { class: "au-ia-res-nome", id: idNome, tabindex: "-1" }, m.auto.nome || "Automação sem nome");
  setTimeout(() => { if (nome.isConnected) { try { nome.focus({ preventScroll: false }); } catch { /* ok */ } } }, 0);
  return h("div", { class: "au-ia-res", role: "group", "aria-labelledby": idNome },
    h("p", { class: "rotulo" }, m.reprovada ? "A IA montou, mas falta completar" : "A IA montou"),
    h("p", { class: "sr-only au-ia-res-anuncio", role: "status" }, `A IA montou: ${m.auto.nome || "automação sem nome"}.`),
    nome,
    h("p", { class: "au-ia-res-frase" }, frase),
    m.explicacao ? h("p", { class: "au-ia-res-exp" }, m.explicacao) : null,
    m.reprovada ? h("p", { class: "aviso aviso-ruim au-ia-reprovada" }, ui.icone("alerta"),
      h("span", null, `A conferência reprovou: ${m.reprovada.motivo}. A montagem não se perdeu — abra no editor e complete o que falta.`)) : null,
    m.avisos.length ? perguntasIA(ctx, dados, m, reenviar, P) : null,
    !m.reprovada && !problema.ok ? h("p", { class: "aviso aviso-aten" }, ui.icone("info"), h("span", null, `Falta completar no editor: ${problema.motivo}.`)) : null,
    h("div", { class: "linha au-ia-res-acoes" }, abrir, outra),
    h("p", { class: "sub" }, "Nada foi salvo ainda. No editor você confere cada passo e decide se liga."));
}

/**
 * G4 [E179]: as dúvidas da IA (avisos) como perguntas respondíveis — chips com o que existe no sistema (etapas, pessoas, etiquetas,
 * números) ou «Sim / Não», e um campo livre. «Montar de novo com as respostas» junta tudo ao pedido e chama a IA outra vez.
 */
function perguntasIA(ctx, dados, m, reenviar, P) {
  const { ui } = ctx;
  const h = ui.h;
  const perguntas = L.perguntasDosAvisos(m.avisos, dados.base);
  const respostas = {};
  const bt = h("button", { type: "button", class: "bt bt-sec au-ia-perg-bt", disabled: true }, ui.icone("ia"), "Montar de novo com as respostas");
  const nota = h("p", { class: "sub au-ia-perg-nota", "aria-live": "polite" });
  const atualizar = () => {
    const n = perguntas.filter(p => String(respostas[p.id] || "").trim()).length;
    bt.disabled = !n || typeof reenviar !== "function" || !m.descricao;
    nota.textContent = n ? `${n} ${n === 1 ? "resposta" : "respostas"} para mandar à IA (gasta mais 1 uso da IA do mês).` : "";
  };
  const lista = h("ol", { class: "au-ia-perg", role: "list" }, perguntas.map(p => {
    const idCampo = `au-ia-resp-${p.id}-${Math.random().toString(36).slice(2, 6)}`;
    const campo = h("input", { id: idCampo, type: "text", class: "au-ia-resp", maxlength: 200, autocomplete: "off", placeholder: "Sua resposta (opcional)" });
    const chips = h("div", { class: "au-chips au-ia-perg-chips", role: "group", "aria-label": `Respostas rápidas: ${p.pergunta}` }, p.opcoes.map(op => {
      const c = P ? P.chip({ rotulo: op, ligado: false, aoClicar: b => {
        const ligar = b.getAttribute("aria-pressed") !== "true";
        chips.querySelectorAll(".au-chip").forEach(x => x.setAttribute("aria-pressed", String(x === b && ligar)));
        campo.value = ligar ? op : "";
        respostas[p.id] = campo.value;
        atualizar();
      } }) : h("button", { type: "button", class: "au-chip" }, op);
      return c;
    }));
    campo.addEventListener("input", () => {
      respostas[p.id] = campo.value;
      chips.querySelectorAll(".au-chip").forEach(x => x.setAttribute("aria-pressed", String(x.textContent === campo.value)));
      atualizar();
    });
    return h("li", { class: "au-ia-perg-item", dataset: { pergunta: p.id } },
      h("label", { class: "au-ia-perg-txt", for: idCampo }, ui.icone("alerta"), h("span", null, p.pergunta)),
      chips, campo);
  }));
  bt.addEventListener("click", () => {
    if (bt.disabled) return;
    const r = L.descricaoComRespostas(m.descricao, perguntas, respostas);
    if (r.cortado) ui.toast(`Nem todas as respostas couberam no limite de ${L.LIMITES.descricao_ia} caracteres do pedido; mandamos as primeiras.`, { tipo: "info" });
    reenviar(r.texto);
  });
  atualizar();
  return h("div", { class: "au-ia-perg-caixa" },
    h("p", { class: "rotulo" }, perguntas.length === 1 ? "Um ponto para conferir" : "Pontos para conferir"),
    h("p", { class: "sub" }, "Responda o que quiser (é opcional) e a IA monta de novo com isso — ou ajuste direto no editor."),
    lista, h("div", { class: "linha au-ia-perg-rod" }, bt), nota);
}

/* ------------------------------------------------------------------ Suas automações */

/** plano 1000b · UB-210: lembra (por aparelho) se a pessoa quer ver as receitas de outros segmentos. */
export const CHAVE_RECEITAS_OUTROS = "nx-au-receitas-outros";

/** plano 1000 · AS-004: quanto tempo o cartão que saiu do filtro fica à vista («saindo») antes de sumir. */
export const SAIDA_FILTRO_MS = 1500;
const excluindo = new Set();       // plano 1000b · UB-044: ids no meio do «Desfazer»
const duplicando = new Set();      // plano 1000 · AS-005: trava por automação — dois toques em «Duplicar» criam UMA cópia

/**
 * «Suas automações»: filtros com contagem + lista. Devolve {el, recontar}; recontar() refaz as contagens depois de ligar/desligar.
 * aoEsvaziar(): a última automação foi excluída de vez (a tela troca a seção pelo vazio).
 */
function secaoSuas(ctx, dados, itens, metas, P, aoMudarEstado, aoExcluida = () => {}, aoEsvaziar = () => {}) {
  const { ui } = ctx;
  const h = ui.h;
  let filtro = "todas";
  // plano 2000d · DU-343: acima de 60 automações, os cartões fora da tela não são desenhados (content-visibility no CSS)
  const lista = h("ul", { class: ["au-lista", itens.length > 60 && "au-lista-longa"], role: "list" });
  const vazio = h("div", { class: "au-lista-vazio", hidden: true });
  const filtros = [["todas", "Todas", () => true], ["ligadas", "Ligadas", x => !!x.ativo], ["desligadas", "Desligadas", x => !x.ativo],
    // plano 1500c · UCA-026: «Com erro» na mesma régua do resumo do topo (30 dias quando o servidor manda) — erro de meses atrás não conta
    ["erros", "Com erro", x => L.temErro(x, L.periodoDoResumo(itens))]];
  const rotChip = (k, rot) => k === "erros" && L.periodoDoResumo(itens) === "30d" ? "Com erro (30 dias)" : rot;   // plano 1500c · UCA-026
  const fnFiltro = () => filtros.find(x => x[0] === filtro)[2];
  const barra = h("div", { class: "au-chips au-lista-filtro", role: "radiogroup", "aria-label": "Mostrar automações" });
  const pintarVazio = () => {
    const n = lista.querySelectorAll(".au-item").length;
    vazio.hidden = n > 0;
    ui.limpar(vazio);
    if (!n) vazio.appendChild(h("p", { class: "sub" }, termo.trim() ? `Nenhuma automação com «${termo.trim()}» no nome ou no que faz.` : "Nenhuma automação nesta situação."));
  };
  const ops = {
    /** AS-004: ligou/desligou e o item não casa mais com o filtro → o cartão sai (depois de um instante) e o foco vai ao próximo interruptor. */
    aoMudarItem(it, li) {
      if (fnFiltro()(it)) return;
      li.classList.add("au-saindo");
      setTimeout(() => {
        if (!li.isConnected || fnFiltro()(it)) { li.classList.remove("au-saindo"); return; }
        const tinhaFoco = li.contains(document.activeElement);
        const prox = li.nextSibling || li.parentNode && [...li.parentNode.childNodes].reverse().find(x => x !== li && x.nodeType === 1);
        li.remove(); metas.delete(it.id);
        pintarVazio();
        if (tinhaFoco) { const alvo = prox && prox.querySelector && prox.querySelector(".au-sw"); if (alvo) alvo.focus({ preventScroll: true }); }
      }, SAIDA_FILTRO_MS);
    },
    /** AS-010 + AS-011: o cartão some na hora com «Desfazer»; só quando o aviso fecha a exclusão vale no servidor. */
    excluirItem(it, li, foco) { return excluir(ctx, it, li, { itens, metas, aoMudarEstado, pintarVazio, aoEsvaziar, aoExcluida, foco, usuarios: dados.base && dados.base.usuarios }); },
  };
  // plano 1000 · AS-015: com muitas automações, busca por nome (sem acento) e ordem lembrada por pessoa neste aparelho
  const chaveOrdem = `nx-au-ordem:${ctx.cliente ? ctx.cliente.id : "-"}|${ctx.sessao && ctx.sessao.conta ? (ctx.sessao.conta.id || "-") : "-"}`;
  let termo = "";
  let ordem = "criacao";
  try { const o = localStorage.getItem(chaveOrdem); if (L.ORDENS_AUTOMACAO.some(([k]) => k === o)) ordem = o; } catch { /* sem storage */ }
  const comFerramentas = itens.length >= 6;
  // plano 1000b · UB-049: a busca olha o nome E a frase do que ela faz («lembrete» acha «Confirmar consulta de amanhã»)
  const campoBusca = h("input", { type: "search", class: "au-lista-busca-inp", placeholder: "Buscar pelo nome ou pelo que faz", "aria-label": "Buscar automação pelo nome ou pelo que faz", autocomplete: "off" });
  const frases = new Map();
  const fraseDe = x => { const k = `${x.id}|${x.atualizado_em || ""}`; if (!frases.has(k)) { let f = ""; try { f = L.descrever(x, dados.base, ctx.vocab); } catch { f = ""; } frases.set(k, f); } return frases.get(k); };
  const selOrdem = h("select", { class: "sel au-lista-ordem", "aria-label": "Ordenar automações" },
    L.ORDENS_AUTOMACAO.map(([k, rot]) => h("option", { value: k, selected: k === ordem }, rot)));
  selOrdem.value = ordem;
  const ferramentas = comFerramentas ? h("div", { class: "au-lista-ferramentas" },
    h("label", { class: "busca au-lista-busca" }, ui.icone("busca"), campoBusca), selOrdem) : null;
  // plano 1500c · UCA-069: modo «Selecionar» — caixas nos cartões e uma barra para ligar, desligar ou excluir várias de uma vez
  let sel = null;
  const desenhar = () => {
    ui.limpar(lista);
    const vis = L.listaAutomacoes(itens.filter(fnFiltro()), { termo, ordem, frase: fraseDe });
    metas.clear();
    // plano 1500c · UCA-070: «Por gatilho» separa a lista em grupos com um título (Conversas, Funil, Datas…)
    if (ordem === "gatilho") {
      let i = 0;
      for (const g of L.agruparPorGatilho(vis)) {
        lista.appendChild(h("li", { class: "au-lista-grupo", role: "presentation" }, h("h3", { class: "rotulo au-lista-grupo-tit" }, `${g.grupo} · ${g.itens.length}`)));
        for (const it of g.itens) lista.appendChild(itemLista(ctx, dados, it, metas, P, i++, aoMudarEstado, ops));
      }
    } else if (ordem === "objetivo") {
      // plano 2000d · DU-082: grupos Lembretes / Vendas / Relacionamento / Equipe
      let i = 0;
      for (const g of L.agruparPorObjetivo(vis)) {
        lista.appendChild(h("li", { class: "au-lista-grupo", role: "presentation" }, h("h3", { class: "rotulo au-lista-grupo-tit" }, `${g.grupo} · ${g.itens.length}`)));
        for (const it of g.itens) lista.appendChild(itemLista(ctx, dados, it, metas, P, i++, aoMudarEstado, ops));
      }
    } else vis.forEach((it, i) => lista.appendChild(itemLista(ctx, dados, it, metas, P, i, aoMudarEstado, ops)));
    if (sel) sel.aoDesenhar();   // plano 1500c · UCA-069
    // só os da tela entram em `metas`; o pulso atualiza o dado dos outros direto em `itens` (o resumo do topo conta todos)
    pintarVazio();
  };
  const chips = [];
  const escolher = (k, b) => { filtro = k; barra.querySelectorAll(".au-chip").forEach(c => c.setAttribute("aria-checked", String(c === b))); desenhar(); };
  for (const [k, rot, fn] of filtros) {
    // plano 1000 · AS-003: o chip «Com erro» existe sempre (escondido sem erro): o pulso que traz um erro novo faz ele aparecer
    const b = P.chip({ rotulo: `${rotChip(k, rot)} · ${itens.filter(fn).length}`, ligado: k === filtro, modo: "radio", aoClicar: () => escolher(k, b) });
    b.setAttribute("aria-label", rotuloChipLista(rotChip(k, rot), itens.filter(fn).length));
    chips.push([b, rot, fn, k]);
    barra.appendChild(b);
  }
  P.setas(barra);
  if (dados.pode_editar && itens.length >= 2) sel = modoSelecao(ctx, dados, itens, metas, lista, P, aoMudarEstado, () => { desenhar(); recontar(); }, aoExcluida, aoEsvaziar);   // plano 1500c · UCA-069
  desenhar();
  const contaCab = h("span", { class: "rotulo" });
  const recontar = () => {
    const ligadas = itens.filter(x => x.ativo).length;
    contaCab.textContent = `${ligadas} ${ligadas === 1 ? "ligada" : "ligadas"} de ${itens.length}`;
    for (const [b, rot, fn, k] of chips) {
      const n = itens.filter(fn).length;
      b.textContent = `${rotChip(k, rot)} · ${n}`;
      b.setAttribute("aria-label", rotuloChipLista(rotChip(k, rot), n));
      if (k === "erros") {
        b.hidden = !n;
        if (!n && filtro === "erros") escolher("todas", chips[0][0]);   // o filtro ativo ficou vazio: volta para «Todas»
      }
    }
    barra.hidden = itens.length <= 3 && !itens.some(x => L.temErro(x, L.periodoDoResumo(itens)));   // plano 1500c · UCA-026
  };
  recontar();
  campoBusca.addEventListener("input", ui.debounce(() => { termo = campoBusca.value; desenhar(); }, 150));
  selOrdem.addEventListener("change", () => {
    ordem = selOrdem.value;
    try { localStorage.setItem(chaveOrdem, ordem); } catch { /* sem storage: vale só nesta tela */ }
    desenhar();
  });
  const el = h("section", { class: "au-sec", "aria-labelledby": "au-suas" },
    h("div", { class: "au-sec-cab" },
      h("h2", { class: "titulo-sec", id: "au-suas" }, "Suas automações"),
      contaCab),
    ferramentas, barra, sel ? sel.el : null, lista, vazio);
  return { el, recontar };
}

/**
 * plano 1500c · UCA-089 + UCA-017/018: texto da confirmação de LIGAR pela lista — a mesma régua do editor (mensagem OU IA),
 * com a cota de IA do mês quando houver e o aviso reforçado para disparo em massa. null = liga sem perguntar.
 */
// plano 2000d · DU-040: opcoes.total = quantos recebem agora (nx_auto_simular) → a frase com o número e, acima de 50, digitar o número
// plano 2000d · DU-018: o conflito com a IA de atendimento entra como aviso reforçado
export function textoConfirmarLigar(it, dados, vocab, opcoes = {}) {
  const msg = L.enviaMensagem(it), ia = L.temIA(it);
  if (!msg && !ia) return null;
  let massa = null;
  const opAv = { iaAtendimentoLigada: L.iaAtendimentoLigada(dados) };
  try { massa = L.avisosEstruturaDetalhados(it, vocab, opAv).find(x => x.tipo === "massa_diaria" || x.tipo === "toda_mensagem" || x.tipo === "conflito_ia") || null; } catch { massa = null; }
  const quem = msg && opcoes && opcoes.total != null ? L.fraseQuemRecebe(opcoes.total) : null;
  const d = dados || {};
  const iaD = d.ia || (d.base && d.base.ia) || null;
  const cota = iaD && (iaD.cota || (iaD.limite !== undefined ? { usadas: iaD.usadas, limite: iaD.limite } : null));
  const linha = ia ? L.linhaCotaIA(cota) : null;
  const partes = [];
  if (massa) partes.push(`Atenção: ${massa.texto}`);
  if (msg) partes.push("Esta automação envia mensagens de WhatsApp para clientes. Assim que ligar, quem se encaixar no gatilho começa a receber.");
  if (quem) partes.push(quem.texto);
  if (ia) partes.push(`Ela usa a IA a cada execução (gasta a cota do mês)${linha ? `: ${linha.texto}` : ""}.`);
  partes.push("Dá para desligar a qualquer momento.");
  return { texto: partes.join(" "), massa: !!massa || !!(quem && quem.massa), digitar: quem ? quem.digitar : null, motivoMassa: massa ? massa.texto : null };
}

/**
 * plano 2000d · DU-040: quantos recebem AGORA se ligar (automação de tempo/diária que manda mensagem). null quando não precisa contar ou
 * quando a simulação falha (o diálogo continua, sem o número).
 */
export async function contarQuemRecebe(ctx, it, dados) {
  if (!L.contarAoLigar(it)) return null;
  try {
    const resp = await ctx.api.rpcC("nx_auto_simular", { p_automacao: L.limpar(it) });
    const sim = L.normalizarSimulacao(resp, it, dados && dados.base, ctx.vocab);
    return Number.isFinite(sim.total) ? sim.total : null;
  } catch { return null; }
}

/**
 * plano 2000d · DU-046: o diálogo de ligar várias diz QUAIS disparam em massa (nome + motivo) e, havendo alguma, pede para digitar «ligar».
 * conf = [{it, c}] (c = textoConfirmarLigar). → {texto, massa, digitar}
 */
export function textoLigarLote(alvo, conf) {
  if (alvo.length === 1 && conf.length === 1) return { texto: conf[0].c.texto, massa: conf[0].c.massa, digitar: conf[0].c.digitar || null };
  const massas = conf.filter(x => x.c.massa);
  const base = `${conf.length === 1 ? "Uma delas envia" : `${conf.length} delas enviam`} WhatsApp ou usa a IA: assim que ligar, quem se encaixar começa a receber.`;
  const lista = massas.map(x => `«${x.it.nome}»${x.c.motivoMassa ? `: ${x.c.motivoMassa}` : ""}`).join(" ");
  const texto = massas.length ? `${base} Disparam em massa: ${lista} Dá para desligar a qualquer momento.` : `${base} Dá para desligar a qualquer momento.`;
  return { texto, massa: massas.length > 0, digitar: massas.length ? "ligar" : null };
}

/**
 * plano 1500c · UCA-069: seleção em lote. Devolve {el, aoDesenhar}. Ligar pede a mesma confirmação da lista (mensagem/IA) uma vez só;
 * excluir usa «Desfazer» (só quando o aviso fecha as exclusões vão ao servidor). «N selecionadas» é anunciado (role=status).
 */
function modoSelecao(ctx, dados, itens, metas, lista, P, aoMudarEstado, redesenhar, aoExcluida = () => {}, aoEsvaziar = () => {}) {
  const { ui } = ctx;
  const h = ui.h;
  const marcadas = new Set();
  let ativo = false;
  let ultimaTocada = null;   // plano 2000d · DU-102
  const btModo = h("button", { type: "button", class: "bt bt-fant bt-p au-sel-modo", "aria-pressed": "false" }, ui.icone("check"), h("span", null, "Selecionar"));
  const status = h("p", { class: "au-sel-status", role: "status", "aria-live": "polite" });
  const btLigar = h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { acao: "ligar" } }, "Ligar");
  const btDesligar = h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { acao: "desligar" } }, "Desligar");
  const btExcluir = h("button", { type: "button", class: "bt bt-perigo bt-p", dataset: { acao: "excluir" } }, ui.icone("lixeira"), h("span", null, "Excluir"));
  const btTodas = h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { acao: "todas" } }, "Marcar todas");
  // plano 2000d · DU-059: as marcadas viram um texto só para colar em outro cliente
  const btCopiar = h("button", { type: "button", class: "bt bt-sec bt-p", dataset: { acao: "copiar" } }, ui.icone("copiar"), h("span", null, "Copiar"));
  const barraSel = h("div", { class: "au-sel-barra", role: "toolbar", "aria-label": "Ações nas automações selecionadas", hidden: true }, status, btTodas, btLigar, btDesligar, btCopiar, btExcluir);
  const el = h("div", { class: "au-sel" }, btModo, barraSel);
  const visiveis = () => [...lista.querySelectorAll(".au-item")];
  const doId = id => itens.find(x => String(x.id) === String(id));
  const pintar = () => {
    const n = marcadas.size;
    const vs = visiveis();
    status.textContent = L.textoSelecao(marcadas, vs.map(li => li.dataset.id));   // plano 2000d · DU-076: «3 selecionadas (1 fora do filtro)»
    for (const b of [btLigar, btDesligar, btExcluir, btCopiar]) b.disabled = !n;
    btTodas.textContent = vs.length && vs.every(li => marcadas.has(li.dataset.id)) ? "Desmarcar todas" : "Marcar todas";
  };
  const caixa = li => {
    const id = li.dataset.id;
    const it = doId(id);
    const c = h("input", { type: "checkbox", class: "au-sel-chk", "aria-label": `Selecionar «${it ? it.nome : ""}»` });
    c.checked = marcadas.has(id);
    // plano 2000d · DU-102: Shift+clique marca (ou desmarca) o intervalo desde a última caixa tocada
    c.addEventListener("click", ev => {
      const vs = visiveis();
      const j = vs.indexOf(li);
      if (ev.shiftKey && ultimaTocada != null && j >= 0) {
        const [a, b] = [Math.min(ultimaTocada, j), Math.max(ultimaTocada, j)];
        for (const x of vs.slice(a, b + 1)) { const cx = x.querySelector(".au-sel-chk"); if (c.checked) marcadas.add(x.dataset.id); else marcadas.delete(x.dataset.id); if (cx) cx.checked = c.checked; }
      }
      ultimaTocada = j >= 0 ? j : null;
    });
    c.addEventListener("change", () => { if (c.checked) marcadas.add(id); else marcadas.delete(id); pintar(); });
    return h("label", { class: "au-sel-caixa" }, c);
  };
  const aoDesenhar = () => {
    lista.classList.toggle("au-selecionando", ativo);
    if (!ativo) return;
    // plano 2000d · DU-076: o que só saiu da vista (filtro, busca) CONTINUA marcado (o status diz quantas estão fora); só o que foi excluído sai
    const existentes = new Set(itens.map(x => String(x.id)));
    for (const id of [...marcadas]) if (!existentes.has(id)) marcadas.delete(id);
    for (const li of visiveis()) if (!li.querySelector(".au-sel-caixa")) li.insertBefore(caixa(li), li.firstChild);
    pintar();
  };
  const ligarModo = v => {
    ativo = v; marcadas.clear();
    btModo.setAttribute("aria-pressed", String(v));
    btModo.lastChild.textContent = v ? "Cancelar seleção" : "Selecionar";
    barraSel.hidden = !v;
    lista.querySelectorAll(".au-sel-caixa").forEach(x => x.remove());
    aoDesenhar();
  };
  btModo.addEventListener("click", () => ligarModo(!ativo));
  // plano 2000d · DU-102: Ctrl/⌘+A com o foco na lista marca todas as visíveis
  lista.addEventListener("keydown", ev => {
    if (!ativo || !(ev.ctrlKey || ev.metaKey) || String(ev.key).toLowerCase() !== "a") return;
    if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName) && ev.target.type !== "checkbox") return;
    ev.preventDefault();
    for (const li of visiveis()) { marcadas.add(li.dataset.id); const c = li.querySelector(".au-sel-chk"); if (c) c.checked = true; }
    pintar();
  });
  btCopiar.addEventListener("click", () => {
    const alvo = escolhidas();
    if (!alvo.length) return;
    ui.copiar(JSON.stringify(L.exportarAutomacoes(alvo, dados.base, ctx.vocab)),
      { aviso: `${L.plural(alvo.length, "automação copiada", "automações copiadas")}. No outro cliente, use «Colar automação» na lista.` });
  });
  btTodas.addEventListener("click", () => {
    const vs = visiveis();
    const todas = vs.every(li => marcadas.has(li.dataset.id));
    for (const li of vs) { const c = li.querySelector(".au-sel-chk"); if (todas) marcadas.delete(li.dataset.id); else marcadas.add(li.dataset.id); if (c) c.checked = !todas; }
    pintar();
  });
  const escolhidas = () => [...marcadas].map(doId).filter(Boolean);
  const mudarVarias = async (v, botao) => {
    const alvo = escolhidas().filter(x => !!x.ativo !== v);
    if (!alvo.length) { ui.toast(v ? "As selecionadas já estão ligadas." : "As selecionadas já estão desligadas.", { tipo: "info" }); return; }
    if (v) {
      const conf = [];
      for (const x of alvo) { const c = textoConfirmarLigar(x, dados, ctx.vocab, { total: alvo.length === 1 ? await contarQuemRecebe(ctx, x, dados) : null }); if (c) conf.push({ it: x, c }); }
      if (conf.length) {
        const t = textoLigarLote(alvo, conf);
        const ok = await ui.confirmar({ titulo: alvo.length === 1 ? `Ligar «${alvo[0].nome}»?` : `Ligar ${alvo.length} automações?`,
          rotulo: t.massa ? "Ligar mesmo assim" : "Ligar", perigo: t.massa, texto: t.texto, digitar: t.digitar });
        if (!ok) return;
      }
    } else {
      // plano 2000d · DU-443: desligar várias também diz o que fica pendente (as esperas delas são canceladas, como no interruptor)
      const w = alvo.reduce((n, x) => n + (Number(x.em_espera) || 0), 0);
      if (w) {
        const ok = await ui.confirmar({ titulo: alvo.length === 1 ? `Desligar «${alvo[0].nome}»?` : `Desligar ${alvo.length} automações?`, rotulo: "Desligar", perigo: true,
          texto: `${w === 1 ? "1 pessoa está" : `${w} pessoas estão`} no meio de uma sequência e não ${w === 1 ? "recebe" : "recebem"} os próximos passos: as esperas são canceladas ao desligar.` });
        if (!ok) return;
      }
    }
    const feitas = [], falhas = [];
    const exec = (async () => {
      let n = 0;
      for (const it of alvo) {
        n += 1; status.textContent = `${v ? "Ligando" : "Desligando"} ${n} de ${alvo.length}…`;
        try {
          const novo = await ctx.api.rpcC("nx_automacao_ativar", { p_id: it.id, p_ativo: v });
          const dado = novo && typeof novo === "object" && typeof novo.ativo === "boolean" ? novo : { ativo: v };
          const m = metas.get(it.id); if (m) m(dado); else Object.assign(it, dado);
          feitas.push(it);
        } catch { falhas.push(it); }
      }
    })();
    await (typeof ui.carregando === "function" ? ui.carregando(botao, exec) : exec);
    aoMudarEstado();
    pintar();
    if (falhas.length) ui.toast(`Não consegui ${v ? "ligar" : "desligar"} ${L.listaNomesCurta(falhas.map(x => x.nome))}.`, { tipo: "erro" });   // plano 2000d · DU-048
    if (feitas.length) ui.toast(`${v ? L.plural(feitas.length, "automação ligada", "automações ligadas") : L.plural(feitas.length, "automação desligada", "automações desligadas")}.`, { tipo: "ok" });   // plano 2000d · DU-356
  };
  btLigar.addEventListener("click", () => mudarVarias(true, btLigar));
  btDesligar.addEventListener("click", () => mudarVarias(false, btDesligar));
  btExcluir.addEventListener("click", async () => {
    const alvo = escolhidas();
    if (!alvo.length) return;
    const ok = await ui.confirmar({ titulo: alvo.length === 1 ? `Excluir «${alvo[0].nome}»?` : `Excluir ${alvo.length} automações?`, perigo: true,
      // plano 2000d · DU-354: diz a consequência (quem está no meio da sequência perde os próximos passos)
      texto: (() => { const w = alvo.reduce((n, x) => n + (Number(x.em_espera) || 0), 0); return `O histórico de execuções delas é apagado junto.${w ? ` ${w === 1 ? "1 pessoa no meio de uma sequência não recebe" : `${w} pessoas no meio de sequências não recebem`} os próximos passos.` : ""} Dá para desfazer enquanto o aviso estiver na tela.`; })() });
    if (!ok) return;
    const posicoes = alvo.map(it => [it, itens.indexOf(it)]);
    alvo.forEach(it => excluindo.add(it.id));
    // plano 2000d · DU-047: as que o servidor já apagou não voltam para a tela quando outra falha no meio
    const jaExcluidas = new Set();
    let r;
    try {
      r = await ui.acaoComDesfazer({
        texto: alvo.length === 1 ? `«${alvo[0].nome}» excluída.` : `${alvo.length} automações excluídas.`,
        aplicar: () => { for (const it of alvo) { const i = itens.indexOf(it); if (i >= 0) itens.splice(i, 1); } marcadas.clear(); redesenhar(); aoMudarEstado(); },
        reverter: () => { for (const [it, i] of posicoes.slice().sort((a, b) => a[1] - b[1])) if (!jaExcluidas.has(it) && !itens.includes(it)) itens.splice(Math.min(Math.max(i, 0), itens.length), 0, it); redesenhar(); aoMudarEstado(); },
        firmar: async o => {
          let erro = null;
          for (const it of alvo) {
            try { await ctx.api.rpcC("nx_automacao_excluir", { p_id: it.id }, o && o.saindo ? { keepalive: true } : {}); jaExcluidas.add(it); }
            catch (e) { erro = erro || e; }
          }
          if (erro) throw erro;
        },
      });
    } finally { alvo.forEach(it => excluindo.delete(it.id)); }
    if (r && r.estado === "mantida") { for (let k = 0; k < alvo.length; k++) { try { aoExcluida(); } catch { /* ok */ } } if (!itens.length) aoEsvaziar(); }
    else if (r && r.estado === "falhou" && r.erro) {
      // plano 2000d · DU-047/DU-048: diz quais saíram e quais ficaram (até 3 nomes + «e mais N»)
      const feitas = alvo.filter(it => jaExcluidas.has(it)), ficaram = alvo.filter(it => !jaExcluidas.has(it));
      for (let k = 0; k < feitas.length; k++) { try { aoExcluida(); } catch { /* ok */ } }
      ui.toast(feitas.length ? `Excluídas: ${L.listaNomesCurta(feitas.map(x => x.nome))}. Não consegui excluir ${L.listaNomesCurta(ficaram.map(x => x.nome))}.`
        : L.erroAutomacao(r.erro, ctx.api.mensagemErro(r.erro), dados.base && dados.base.usuarios), { tipo: "erro" });
      if (!itens.length) aoEsvaziar();
    }
  });
  pintar();
  return { el, aoDesenhar, marcadas, ligarModo };
}

/** plano 2000d · DU-054: a observação do cartão (até 120 letras, «…» no corte); "" sem observação. */
export function obsCartao(it) {
  const t = String((it && it.descricao) || "").replace(/\s+/g, " ").trim();
  return t.length > 120 ? `${t.slice(0, 119).trimEnd()}…` : t;
}

/** plano 1000 · AS-226: «Com erro, 2 automações» para o leitor de tela (o «·» do chip era lido de um jeito estranho). */
const rotuloChipLista = (rot, n) => `${rot}, ${n} ${n === 1 ? "automação" : "automações"}`;

function itemLista(ctx, dados, it, metas, P, posicao = 0, aoMudarEstado = () => {}, ops = null) {
  const { ui } = ctx;
  const h = ui.h;
  const vv = ctx.vocab;
  const podeEditar = !!dados.pode_editar;
  const lim = dados.limite || {};
  const noLimiteAgora = () => lim.limite != null && lim.usadas >= lim.limite;   // plano 1000b · UB-001: lido na hora de abrir o menu
  const g = L.GATILHO[it.gatilho];
  const frase = L.descrever(it, dados.base, vv);
  const exec = h("span", { class: "au-item-num" });
  const errs = h("span", { class: "au-item-num au-com-erro" });
  const ultima = h("span", { class: "au-item-ult" });
  const espera = h("span", { class: "au-item-num au-item-espera" });
  // plano 1000b · UB-217: quantas mensagens ela mandou (só quando o servidor manda mensagens_30d — sem o dado, nada)
  const msgs = h("span", { class: "au-item-num au-item-msgs", hidden: true });
  const taxa = h("span", { class: "au-item-taxa" });
  // plano 1000b · UB-256: o interruptor é descrito pela frase e pelo estado ao lado («Ligada»)
  const idFrase = `au-item-fr-${String(it.id).replace(/[^\w-]/g, "")}-${posicao}`;
  const estadoTxt = h("span", { class: "au-item-estado", id: `${idFrase}-est` });
  const ponto = h("span", { class: "au-item-ponto" });
  const pilParada = h("span", { class: "pilula pilula-aten au-pil-parada", hidden: true, title: "Ligada, mas não roda há uma semana: confira se a etapa, o funil ou o horário ainda existem." });
  const pilCaido = h("span", { class: "pilula pilula-ruim au-pil-caido", hidden: true }, "Número desconectado: mensagens paradas");
  const li = h("li", { class: ["au-item", !it.ativo && "au-desligada"], style: { "--i": String(posicao) }, dataset: { id: String(it.id) } });
  const pintar = x => {
    // plano 1500c · UCA-027: a barra mostra os últimos 30 dias quando o servidor manda (quebra recente não fica verde); o total segue no title
    const per = x.ok_30d != null && x.erro_30d != null ? "30d" : "total";
    const t = L.taxaSucesso(x, { periodo: per });
    const tTot = L.taxaSucesso(x);
    exec.textContent = tTot.total === 1 ? "1 execução" : `${ui.num(tTot.total)} execuções`;
    errs.textContent = (t.erros === 1 ? "1 erro" : `${t.erros} erros`) + (per === "30d" ? " em 30 dias" : "");
    taxa.title = per === "30d" ? `Taxa dos últimos 30 dias. Desde a criação: ${tTot.pct == null ? "sem execuções" : tTot.pct + " % deu certo"}.` : "Taxa desde a criação.";
    errs.hidden = !t.erros;
    const w = Number(x.em_espera) || 0;
    espera.textContent = w === 1 ? "1 em espera" : `${w} em espera`;
    espera.hidden = !w;
    const nm = x.mensagens_30d == null || x.mensagens_30d === "" ? null : Number(x.mensagens_30d);
    msgs.hidden = !Number.isFinite(nm);
    msgs.textContent = Number.isFinite(nm) ? `${nm === 1 ? "1 mensagem" : `${ui.num(nm)} mensagens`} em 30 dias` : "";
    // plano 1500c · UCA-114: quando o servidor mandar ultima_execucao_contato, diz para quem rodou («última: Maria, há 2 min»)
    const quemUlt = String(x.ultima_execucao_contato || "").trim().split(/\s+/)[0] || "";
    ultima.textContent = x.ultima_execucao_em ? (quemUlt ? `última: ${quemUlt}, ${ui.relativo(x.ultima_execucao_em)}` : `última ${ui.relativo(x.ultima_execucao_em)}`) : "ainda não rodou";
    ultima.title = x.ultima_execucao_em ? ui.dataHoraBR(x.ultima_execucao_em) : "";
    ui.limpar(taxa); taxa.appendChild(P.barraTaxa({ pct: t.pct, total: t.total }));
    estadoTxt.textContent = L.estadoExibido(x, ctx.cliente);   // plano 2000d · DU-071: «Parada (teste terminou)» quando nada está saindo
    // plano 2000d · DU-067/DU-087: ligada mas parada de verdade (sem rodar há 7 dias; números desconectados)
    const sr = L.semRodarHa(x), ev = L.estadoEnvio(x, dados.base && dados.base.canais);
    pilParada.hidden = !sr; pilParada.textContent = sr ? sr.texto : "";
    pilCaido.hidden = ev !== "parado";
    ui.limpar(ponto); ponto.appendChild(P.pontoEstado(!!x.ativo, { erro: t.erros > 0 }));
  };
  pintar(it);
  const sw = P.interruptor({
    ligado: it.ativo, rotulo: it.nome, desabilitado: !podeEditar,      // plano 1000 · AS-281: «Lembrete, alternador, ligado» (antes «Ligar a automação…» soava como ordem)
    aoMudar: async (v, b) => {
      // ligar algo que manda mensagem ao cliente merece uma confirmação (item 52): a partir dali sai WhatsApp de verdade
      // plano 1500c · UCA-089: a IA também confirma (com a cota do mês), igual ao editor; UCA-017/018: disparo em massa ganha aviso reforçado
      const confirmacao = v ? textoConfirmarLigar(it, dados, vv, { total: await contarQuemRecebe(ctx, it, dados) }) : null;   // plano 2000d · DU-040
      if (confirmacao) {
        const ok = await ui.confirmar({ titulo: `Ligar «${it.nome}»?`, rotulo: confirmacao.massa ? "Ligar mesmo assim" : "Ligar", perigo: confirmacao.massa,
          texto: confirmacao.texto, digitar: confirmacao.digitar || null });
        if (!ok) { b.definir(false); b.focus({ preventScroll: true }); return; }
      }
      // plano 1000 · AS-277: desligar cancela as esperas em andamento (gatilho nx_tg_auto_desligada) — quem está no meio perde os próximos passos
      const avisoEspera = !v ? L.avisoDesligarEspera(it) : null;
      if (avisoEspera) {
        const ok = await ui.confirmar({ titulo: `Desligar «${it.nome}»?`, rotulo: "Desligar", perigo: true,
          texto: `${avisoEspera} As esperas desta automação são canceladas ao desligar.` });
        if (!ok) { b.definir(true); b.focus({ preventScroll: true }); return; }
      }
      const devolverFoco = ui.manterFoco(b);
      b.disabled = true;
      let deuCerto = false;
      try {
        const novo = await ctx.api.rpcC("nx_automacao_ativar", { p_id: it.id, p_ativo: v });
        // o servidor devolve o item atualizado (nx_auto_item); sem «ativo» na resposta, vale o que foi pedido e aceito
        if (novo && typeof novo === "object") Object.assign(it, novo);
        if (!novo || typeof novo.ativo !== "boolean") it.ativo = v;
        if (!v && avisoEspera && !(novo && "em_espera" in novo)) it.em_espera = 0;   // as esperas foram canceladas junto
        li.classList.toggle("au-desligada", !it.ativo);
        pintar(it);
        deuCerto = true;
        ui.toast(v ? `«${it.nome}» ligada.` : `«${it.nome}» desligada.`, { tipo: "ok" });
        // G9: ligou de verdade (o servidor aceitou) → o ✓ de sucesso no lugar do interruptor; desligar não comemora
        if (v && it.ativo && typeof ui.checkSucesso === "function") { try { ui.checkSucesso(caixaSw); } catch { /* sem o ✓, o toast basta */ } }
      } catch (e) {
        b.definir(!v);
        // plano 1000b · UB-257: «falta modelo aprovado» e afins (automacao_invalida) levam direto ao editor, que já aponta o bloco
        const invalida = e && (e.codigo === "automacao_invalida" || e.message === "automacao_invalida");
        ui.toast(L.erroAutomacao(e, ctx.api.mensagemErro(e), dados.base && dados.base.usuarios), { tipo: "erro",   // plano 1500c · UCA-071
          acao: invalida ? { rotulo: "Abrir e corrigir", fn: () => ctx.navegar(`#/automacoes/${it.id}`) } : undefined });
      } finally {
        b.disabled = !podeEditar; devolverFoco();   // desabilitado o botão perde o foco: o 2º Space precisa achá-lo de novo
        aoMudarEstado();                            // «Ligadas de N», os chips e o cabeçalho da seção acompanham o cartão (no erro, voltam junto)
        if (deuCerto && ops) ops.aoMudarItem(it, li);
      }
    },
  });
  sw.setAttribute("aria-describedby", `${idFrase}-est ${idFrase}`);
  const caixaSw = h("div", { class: "au-item-sw" }, sw);
  metas.set(it.id, x => { Object.assign(it, x); pintar(it); sw.definir(it.ativo); li.classList.toggle("au-desligada", !it.ativo); });

  const btMais = h("button", { type: "button", class: "bt-icone au-item-mais", "aria-label": `Opções de ${it.nome}`, "aria-haspopup": "menu" }, ui.icone("opcoes"));
  btMais.addEventListener("click", () => { const noLimite = noLimiteAgora(); const nExec = L.taxaSucesso(it).total; ui.menu(btMais, [
    { rotulo: podeEditar ? "Editar" : "Ver", icone: "editar", fn: () => ctx.navegar(`#/automacoes/${it.id}`) },
    podeEditar ? { rotulo: "Testar (sem enviar nada)", icone: "olho", fn: () => ctx.navegar(`#/automacoes/${it.id}?testar=1`) } : null,
    // plano 1000b · UB-258: o menu diz quantas execuções há
    { rotulo: L.rotuloVerExecucoes(it), icone: "relogio", fn: () => ctx.navegar(`#/automacoes/${it.id}?aba=execucoes`) },   // plano 2000d · DU-100: o mesmo período do cartão
    // plano 2000d · DU-059: copiar para outro cliente direto do cartão (antes só no menu do editor)
    podeEditar ? { rotulo: "Copiar para outro cliente", icone: "copiar", fn: () => ui.copiar(JSON.stringify(L.exportarAutomacao(it, dados.base, vv)), { aviso: "Automação copiada. No outro cliente, use «Colar automação» na lista de automações." }) } : null,
    // AS-005: no limite do plano a cópia seria recusada pelo servidor — o item já aparece desabilitado com o motivo
    podeEditar ? { rotulo: noLimite ? `Duplicar (o plano permite até ${lim.limite})` : "Duplicar", icone: "copiar", desabilitado: noLimite || duplicando.has(it.id),
      fn: () => duplicar(ctx, it, dados.base, null, dados.itens) } : null,
    // plano 1500c · UCA-035: com execuções, antes de excluir oferece «Baixar execuções (CSV)» (o histórico some junto)
    podeEditar ? { rotulo: "Excluir", icone: "lixeira", perigo: true, fn: async () => {
      if (nExec > 0 && !(await oferecerBaixarAntesDeExcluir(ctx, it, P, nExec))) { btMais.focus({ preventScroll: true }); return; }
      return ops ? ops.excluirItem(it, li, btMais) : excluir(ctx, it, li, {});
    } } : null,
  ].filter(Boolean)); });

  const etiquetas = [];
  if (L.temSequencia(it)) etiquetas.push(ui.pilula("Sequência", "info", { icone: "relogio" }));
  if (L.temIA(it)) etiquetas.push(ui.pilula("Usa IA", "prim", { icone: "ia" }));
  // plano 1000 · AS-020: etiqueta de TIPO não é verde (verde é estado bom: «Ligada», «Deu certo»)
  if (L.enviaMensagem(it)) etiquetas.push(ui.pilula("WhatsApp", "neutra", { icone: "whatsapp", class: "au-pil-tipo" }));

  // plano 1000 · AS-012: o link é só o NOME (o ::after cobre o cartão para o clique); a frase, os números e a barra de taxa ficam fora
  // do <a> — o leitor de tela lê o nome como link e a frase como descrição, e o meter não fica aninhado num link
  li.append(
    caixaSw,
    h("div", { class: "au-item-corpo" },
      h("span", { class: "au-item-topo" }, ponto,
        h("a", { class: "au-item-nome au-item-link", href: `#/automacoes/${it.id}`, "aria-describedby": idFrase }, it.nome), estadoTxt),
      h("span", { class: "au-item-frase", id: idFrase }, frase),
      // plano 2000d · DU-054: a observação interna («por que existe») aparece abaixo da frase, até 120 letras (a busca já olha ela)
      obsCartao(it) ? h("span", { class: "au-item-obs", title: String(it.descricao) }, obsCartao(it)) : null,
      h("span", { class: "au-item-meta" },
        h("span", { class: "pilula pilula-neutra au-item-gat" }, ui.icone(g ? g.icone : "raio"), L.rotuloGatilho(it.gatilho, vv)),
        pilParada, pilCaido, etiquetas, exec, errs, msgs, espera, ultima),
      h("span", { class: "au-item-rodape" }, taxa)),
    btMais);
  return li;
}

/**
 * plano 1500c · UCA-035: diálogo antes de excluir uma automação com histórico — «Baixar execuções (CSV)» (fica aberto depois de baixar),
 * «Excluir» ou «Cancelar». Devolve true para seguir com a exclusão.
 */
export async function oferecerBaixarAntesDeExcluir(ctx, it, P, nExec) {
  const { ui } = ctx;
  const r = await ui.modal({
    titulo: `Excluir «${it.nome}»?`, largura: "p", protegerTexto: false,
    corpo: ui.h("p", { class: "confirma-txt" }, `Ela tem ${nExec === 1 ? "1 execução" : `${ui.num(nExec)} execuções`} no histórico, que é apagado junto. Se quiser guardar, baixe antes.`),
    acoes: [
      { rotulo: "Cancelar", tipo: "neutro", valor: false },
      { rotulo: "Baixar execuções (CSV)", tipo: "neutro", icone: "baixar", fn: async () => {
        const resp = await ctx.api.rpcC("nx_automacao_execucoes", { p_id: it.id, p_limite: 200 });
        const lista = Array.isArray(resp) ? resp : resp && Array.isArray(resp.itens) ? resp.itens : [];
        const ok = P && typeof P.baixarTexto === "function" && P.baixarTexto(`execucoes-${L.nomeArquivo(it.nome)}-${new Date().toISOString().slice(0, 10)}.csv`, L.execucoesParaCSV(lista, { vocab: ctx.vocab }));
        ui.toast(ok ? `${lista.length} ${lista.length === 1 ? "execução baixada" : "execuções baixadas"} em CSV.` : "O navegador não deixou baixar o arquivo.", { tipo: ok ? "ok" : "erro" });
        return false;   // continua aberto: agora a pessoa decide se exclui
      } },
      { rotulo: "Excluir", tipo: "perigo", icone: "lixeira", valor: true },
    ],
  });
  return r === true;
}

/** Cria uma cópia DESLIGADA (de uma salva ou do que está aberto no editor). `botao` (do editor) mostra o carregando. */
async function duplicar(ctx, origem, base, botao = null, itens = []) {
  const chave = origem.id || "editor";
  if (duplicando.has(chave)) return;                // AS-005: o 2º toque enquanto o 1º ainda grava não cria outra cópia
  const a = L.limpar(origem);
  delete a.id;
  // plano 1000b · UB-043: «X (cópia 2)» em vez de «X (cópia) (cópia)», sem repetir um nome que já existe
  a.nome = L.nomeDaCopia(origem.nome || "Automação", (Array.isArray(itens) ? itens : []).map(x => x && x.nome));
  a.ativo = false;
  const r = L.validar(a, { base, ligar: false });
  if (!r.ok) { ctx.ui.toast(`Complete a automação antes de duplicar: falta ${r.motivo}.`, { tipo: "info" }); return; }
  duplicando.add(chave);
  try {
    const p = ctx.api.rpcC("nx_automacao_salvar", { p_auto: a });
    const novo = await (botao && typeof ctx.ui.carregando === "function" ? ctx.ui.carregando(botao, p) : p);
    ctx.ui.toast("Cópia criada (desligada). Revise e ligue quando quiser.", { tipo: "ok" });
    ctx.navegar(`#/automacoes/${novo.id}`);
  } catch (e) { ctx.ui.toast(L.erroAutomacao(e, ctx.api.mensagemErro(e), base && base.usuarios), { tipo: "erro" }); } finally { duplicando.delete(chave); }   // plano 1500c · UCA-071
}

/**
 * Excluir com «Desfazer» (AS-011): o cartão some na hora (sem redesenhar a tela — AS-010), o aviso fica 7 s e só quando ele fecha
 * a exclusão vai ao servidor (firmar). Desfazer devolve o cartão no mesmo lugar sem chamada nenhuma.
 */
async function excluir(ctx, it, li, { itens = null, metas = null, aoMudarEstado = () => {}, pintarVazio = () => {}, aoEsvaziar = () => {}, aoExcluida = () => {}, foco = null, usuarios = null } = {}) {
  const { ui } = ctx;
  const pai = li && li.parentNode;
  let posLista = -1, posItens = -1, depoisDe = null;
  excluindo.add(it.id);          // UB-044: no tempo do «Desfazer» o servidor ainda a tem — não é «a lista mudou»
  let r;
  try { r = await ui.acaoComDesfazer({
    texto: `«${it.nome}» excluída. O histórico de execuções dela é apagado quando este aviso fechar.`,
    aplicar: () => {
      if (pai) {
        const irmaos = [...pai.childNodes];
        posLista = irmaos.indexOf(li);
        depoisDe = irmaos[posLista + 1] || null;
        const tinhaFoco = li.contains(document.activeElement) || document.activeElement === foco || !document.activeElement || document.activeElement === document.body;
        const prox = depoisDe || irmaos[posLista - 1] || null;
        li.remove();
        if (metas) metas.delete(it.id);
        pintarVazio();
        if (tinhaFoco) {
          const alvo = prox && prox.querySelector ? prox.querySelector(".au-item-link") : null;
          if (alvo) alvo.focus({ preventScroll: true });
        }
      }
      if (itens) { posItens = itens.indexOf(it); if (posItens >= 0) itens.splice(posItens, 1); }
      aoMudarEstado();
    },
    reverter: () => {
      if (itens && posItens >= 0 && !itens.includes(it)) itens.splice(Math.min(posItens, itens.length), 0, it);
      if (pai && pai.isConnected !== false) {
        pai.insertBefore(li, depoisDe && depoisDe.parentNode === pai ? depoisDe : null);
        const lnk = li.querySelector(".au-item-link");
        if (lnk) lnk.focus({ preventScroll: true });
      }
      pintarVazio();
      aoMudarEstado();
    },
    // a página saindo antes dos 7 s do «Desfazer»: o pedido vai com keepalive (senão o navegador o cancela e a automação «volta»)
    firmar: o => ctx.api.rpcC("nx_automacao_excluir", { p_id: it.id }, o && o.saindo ? { keepalive: true } : {}),
  }); } finally { excluindo.delete(it.id); }
  // plano 1000b · UB-001: excluída de vez → libera a vaga do plano (os botões de criar reacendem)
  if (r && r.estado === "mantida") { try { aoExcluida(); } catch { /* ok */ } if (itens && !itens.length) aoEsvaziar(); return true; }
  if (r && r.estado === "falhou" && r.erro) ui.toast(L.erroAutomacao(r.erro, ctx.api.mensagemErro(r.erro), usuarios), { tipo: "erro" });   // plano 2000d · DU-081: diz a quem pedir
  return false;
}

/**
 * plano 1000 · AS-016: «Pausar envios agora» — desliga, em série, as automações ligadas que mandam WhatsApp (uma confirmação só);
 * o aviso oferece «Religar as mesmas». Cada uma que falhar continua ligada e é dita no fim.
 */
async function pausarEnvios(ctx, itens, metas, botao, aoMudarEstado, raiz = null) {
  const { ui } = ctx;
  const alvo = L.ligadasQueEnviam(itens);
  if (!alvo.length) return;
  const nomes = alvo.slice(0, 5).map(x => `«${x.nome}»`).join(", ") + (alvo.length > 5 ? ` e mais ${alvo.length - 5}` : "");
  const ok = await ui.confirmar({ titulo: alvo.length === 1 ? "Pausar a automação que envia WhatsApp?" : `Pausar as ${alvo.length} automações que enviam WhatsApp?`,
    rotulo: "Pausar agora", perigo: true,
    // plano 1000b · UB-255: diz também o que CONTINUA (a equipe temia que tarefas e etiquetas parassem junto)
    texto: `Desliga ${nomes}. Nada mais sai por elas até religar; quem estava no meio de uma sequência não recebe os próximos passos. Automações que só criam tarefas, etiquetam ou avisam a equipe continuam ligadas.` });
  if (!ok) return;
  // plano 1500c · UCA-032: «Pausando 3 de 15…» (role=status) durante a série — antes só o botão girava
  const progresso = ui.h("p", { class: "sr-only au-pausa-prog", role: "status", "aria-live": "polite" });
  if (botao && botao.parentNode) botao.parentNode.insertBefore(progresso, botao.nextSibling);
  const mudar = async (lista, v) => {
    const feitas = [], falhas = [];
    let n = 0;
    // plano 1000b · UB-051: durante a série os interruptores ficam travados (mexer num deles no meio cruzava os estados)
    const sws = raiz ? [...raiz.querySelectorAll(".au-sw")].filter(b => !b.disabled) : [];
    const listaEl = raiz ? raiz.querySelector(".au-lista") : null;
    sws.forEach(b => { b.disabled = true; }); if (listaEl) listaEl.setAttribute("aria-busy", "true");
    try {
    for (const it of lista) {
      n += 1;
      progresso.textContent = lista.length > 1 ? `${v ? "Religando" : "Pausando"} ${n} de ${lista.length}…` : "";
      try {
        const novo = await ctx.api.rpcC("nx_automacao_ativar", { p_id: it.id, p_ativo: v });
        const m = metas.get(it.id);
        const dado = novo && typeof novo === "object" && typeof novo.ativo === "boolean" ? novo : { ativo: v };
        if (m) m(dado); else Object.assign(it, dado);
        feitas.push(it);
      } catch { falhas.push(it); }
    }
    } finally { sws.forEach(b => { b.disabled = false; }); if (listaEl) listaEl.removeAttribute("aria-busy"); progresso.textContent = ""; }
    aoMudarEstado();
    return { feitas, falhas };
  };
  const r = await ui.carregando(botao, mudar(alvo, false));
  if (r.falhas.length) ui.toast(`Não consegui desligar ${L.listaNomesCurta(r.falhas.map(x => x.nome))}. Tente de novo ou desligue pelo interruptor.`, { tipo: "erro" });   // plano 2000d · DU-048
  if (!r.feitas.length) return;
  const pausadas = r.feitas;
  ui.toast(pausadas.length === 1 ? "1 automação pausada." : `${pausadas.length} automações pausadas.`, { tipo: "ok", ms: 10000,
    acao: { rotulo: "Religar as mesmas", fn: async () => {
      // plano 1000b · UB-050: só as que ainda existem e continuam desligadas (alguém pode ter excluído ou religado no meio)
      const ainda = pausadas.filter(x => itens.includes(x) && !x.ativo);
      if (!ainda.length) { ui.toast("Nenhuma para religar: as pausadas já foram religadas ou excluídas.", { tipo: "info" }); return; }
      const v = await mudar(ainda, true);
      const n = v.feitas.length;
      ui.toast(v.falhas.length ? `Religadas ${n}; ${v.falhas.length} não voltaram (confira o interruptor).` : n === 1 ? "1 automação religada." : `${n} automações religadas.`, { tipo: v.falhas.length ? "erro" : "ok" });
    } } });
}

/* ------------------------------------------------------------------ Receitas prontas */

function secaoReceitas(ctx, dados, vertical, vv, noLimite, qtdItens, P, aoLiberarLimite = []) {
  const { ui } = ctx;
  const h = ui.h;
  const grade = h("div", { class: "au-modelos" });
  const temModeloAprovado = (dados.base.templates || []).some(t => String(t.status || "").toUpperCase() === "APPROVED");
  const exemplo = L.exemploVariaveis({ empresa: ctx.cliente ? ctx.cliente.nome : "", atendente: ctx.sessao && ctx.sessao.conta ? ctx.sessao.conta.nome : "Ana", base: dados.base, vertical });   // plano 1000b · UB-073 · plano 2000d · DU-038
  // plano 1000b · UB-210: «Mostrar receitas de outros segmentos» (lembrado no aparelho) — as escondidas desta vertical vêm no fim
  const daVertical = L.modelosDaVertical(vertical);
  const deOutros = L.MODELOS.filter(m => !daVertical.includes(m));
  let comOutros = false;
  const prefOutros = preferencia(CHAVE_RECEITAS_OUTROS);
  comOutros = !!deOutros.length && prefOutros.ler() === "1";
  let todas = comOutros ? daVertical.concat(deOutros) : daVertical;
  const iaOff = L.iaDesligada(dados);
  let categoria = "todas";
  let termo = "";
  const lim = dados.limite || {};
  const motivoLimite = `Seu plano permite até ${lim.limite} automações. Exclua uma para usar outra receita (veja o aviso no topo).`;   // plano 2000d · DU-103: «desligadas também contam» fica só no aviso do topo
  const iaInfo = dados.ia || (dados.base && dados.base.ia) || null;
  const cotaIA = iaInfo && (iaInfo.cota || (iaInfo.limite !== undefined ? { usadas: iaInfo.usadas, limite: iaInfo.limite } : null));
  const canaisBase = dados.base && Array.isArray(dados.base.canais) ? dados.base.canais : null;
  const cotaTxt = cotaIA && cotaIA.limite != null ? `${ui.num(Number(cotaIA.usadas) || 0)} de ${ui.num(cotaIA.limite)} já usadas` : "";
  // plano 2000d · DU-078: o plano da empresa não inclui IA (o servidor manda ia.no_plano=false e, se souber, ia.plano_com_ia)
  const iaForaDoPlano = !!iaInfo && iaInfo.no_plano === false;
  // plano 2000d · DU-085: as receitas que a empresa já usa (auto.modelo, quando o servidor guardar)
  const emUso = L.receitasEmUso(dados.itens);
  // plano 2000d · DU-419: o tom do texto das receitas (próximo = o de sempre; formal = sem «Oi», com «Olá» e tratamento)
  let tom = "proximo";

  const cacheReceitas = new Map();
  /** plano 1500c · UCA-031 + UCA-120: {auto, frase, bolha} por receita; a bolha usa o corpo do modelo aprovado que a receita escolheu. */
  const preparada = m => {
    const chaveR = `${m.id}|${tom}`;
    if (cacheReceitas.has(chaveR)) return cacheReceitas.get(chaveR);
    let auto = null, frase = "";
    try { auto = L.aplicarModelo(m, dados.base, vv, { tom }); } catch { auto = null; }
    try { frase = auto ? L.descrever(auto, dados.base, vv) : ""; } catch { frase = ""; }
    let b = { texto: "", sugestao: false };
    try { b = textoBolhaReceita(m, auto, dados.base, vertical, exemplo); } catch { /* sem bolha */ }
    const r = { auto, frase, bolha: b.texto, sugestao: b.sugestao };
    cacheReceitas.set(chaveR, r);
    return r;
  };
  const cartao = (m, primeiro) => {
    const selo = L.seloModelo(m, vertical);
    const acTpl = m.auto.acoes.find(a => a.tipo === "enviar_template");
    const acMsg = m.auto.acoes.find(a => a.tipo === "enviar_mensagem");
    const canal = L.canalDaReceita(m);
    // «o que faz», em uma frase, já com as etapas e etiquetas desta empresa (item 55)
    // plano 1500c · UCA-031: aplicarModelo uma vez por receita na montagem da seção (a busca redesenha sem refazer)
    const pr = preparada(m);
    const fraz = pr.frase;
    // no cartão em destaque que manda mensagem: como o cliente vai receber (texto com um exemplo)
    const bolhaTxt = () => pr.bolha;
    const emDestaque = primeiro && selo && (acTpl || acMsg);
    const previaId = `au-mod-prev-${m.id}`;
    const previa = acTpl || acMsg ? h("figure", { class: "au-modelo-previa", id: previaId, hidden: !emDestaque },
      h("figcaption", { class: "rotulo" }, pr.sugestao ? "Como chega no WhatsApp (sugestão de modelo)" : "Como chega no WhatsApp"),   // plano 1500c · UCA-120
      h("div", { class: "au-bolha" }, bolhaTxt())) : null;
    // plano 1000 · AS-075: as outras receitas que mandam mensagem também mostram a bolha, a pedido («Ver mensagem»)
    const btVer = previa && !emDestaque ? h("button", { type: "button", class: "bt bt-fant bt-p au-modelo-ver", "aria-expanded": "false", "aria-controls": previaId },
      ui.icone("olho"), h("span", null, "Ver mensagem")) : null;
    if (btVer) btVer.addEventListener("click", () => {
      const abrir = previa.hidden;
      previa.hidden = !abrir;
      btVer.setAttribute("aria-expanded", String(abrir));
      btVer.lastChild.textContent = abrir ? "Esconder mensagem" : "Ver mensagem";
    });
    const tempo = L.ehSequencia(m) ? miniTempo(ui, m, vv) : null;
    return h("article", { class: ["au-modelo", selo && "au-modelo-destaque", `au-modelo-${m.categoria}`], dataset: { categoria: m.categoria } },
      h("div", { class: "au-modelo-topo" },
        h("span", { class: "au-modelo-ic", "aria-hidden": "true" }, ui.icone(m.icone)),
        h("div", { class: "au-modelo-selos" },
          selo ? h("span", { class: "pilula pilula-prim" }, selo) : null,
          // plano 1000b · UB-069: sem número CodeWords na empresa, a pílula diz o que falta (em vez de prometer «sai pelo CodeWords»)
          canal === "codewords" ? (selosCanalReceita(m, canaisBase).pilula === "falta"
            ? h("span", { class: "pilula pilula-aten au-pil-tipo au-pil-falta-cw", title: "As mensagens desta receita saem por um número conectado por aparelho, que a empresa ainda não tem." }, ui.icone("whatsapp"), "precisa de número conectado por aparelho")
            : h("span", { class: "pilula pilula-neutra au-pil-tipo", title: equipeDaPlataforma(ctx) ? "As mensagens saem pelo CodeWords (WhatsApp conectado por aparelho). Receita pronta e testada." : "As mensagens saem pelo número conectado por aparelho. Receita pronta e testada." }, ui.icone("whatsapp"), "sai pelo número por aparelho")) : null,   // plano 2000d · DU-024: o fornecedor só no title de gestor/super
          canal === "meta" ? h("span", { class: "pilula pilula-info", title: "Usa um modelo aprovado pela Meta (WhatsApp oficial)." }, ui.icone("whatsapp"), "modelo oficial da Meta") : null,
          L.usaIA(m) ? h("span", { class: "pilula pilula-prim", title: "Gasta 1 uso da IA do mês a cada execução." }, ui.icone("ia"), "usa IA") : null,
          emUso.has(m.id) ? h("a", { class: "pilula pilula-ok au-pil-em-uso", href: `#/automacoes/${encodeURIComponent(emUso.get(m.id).id)}`, title: `Já existe: «${emUso.get(m.id).nome}»` }, ui.icone("check"), "Você já usa") : null)),   // plano 2000d · DU-085
      h("h3", null, L.tituloModelo(m, vv)),
      h("p", { class: "sub" }, L.textoModelo(m, vv)),
      fraz ? h("p", { class: "au-modelo-frase" }, ui.icone("raio"), h("span", null, fraz)) : null,
      tempo,
      previa,
      acTpl && !temModeloAprovado ? h("p", { class: "au-modelo-nota" }, ui.icone("info"), "Precisa de um modelo aprovado na Meta; dá para deixar pronta e ligar depois.") : null,
      m.aviso && !acTpl ? h("p", { class: "au-modelo-nota" }, ui.icone("info"), m.aviso) : null,
      // plano 2000d · DU-053: empresa só com número oficial: a receita de texto livre avisa da janela de 24 h (não promete «sai a qualquer hora»)
      selosCanalReceita(m, canaisBase).notaJanela ? h("p", { class: "au-modelo-nota au-modelo-janela" }, ui.icone("alerta"), selosCanalReceita(m, canaisBase).notaJanela) : null,
      iaOff && L.usaIA(m) ? h("p", { class: "au-modelo-nota au-modelo-nota-ia" }, ui.icone("ia"), "A IA ainda não está ligada nesta plataforma: dá para deixar pronta, mas o passo de IA só funciona depois que o suporte da plataforma ativar." /* plano 1000b · UB-068 */) : null,
      // plano 1000 · AS-076: cada execução de uma receita com IA gasta 1 da cota do mês (200 contatos/mês = 200 da cota)
      !iaOff && !iaForaDoPlano && L.usaIA(m) ? h("p", { class: "au-modelo-nota au-modelo-custo" }, ui.icone("ia"),
        `Cada vez que roda, usa 1 da cota de IA do mês${cotaTxt ? ` (${cotaTxt})` : ""}.`,
        // plano 2000d · DU-090: a estimativa do mês pelo volume do gatilho nos últimos 30 dias (base.volume_30d)
        L.estimativaUsosIA(m, dados.base, cotaIA) ? ` ${L.estimativaUsosIA(m, dados.base, cotaIA)}.` : "") : null,
      // plano 2000d · DU-078: sem IA no plano, a nota diz em qual plano tem e oferece o pedido
      iaForaDoPlano && L.usaIA(m) ? h("p", { class: "au-modelo-nota au-modelo-plano" }, ui.icone("ia"),
        h("span", null, `A IA não faz parte do seu plano${iaInfo.plano_com_ia ? `: disponível no plano ${iaInfo.plano_com_ia}` : ""}. `),
        pedirContratacao(ctx) ? h("button", { type: "button", class: "bt bt-fant bt-p au-quero-ia", on: { click: () => pedirContratacao(ctx)("automacoes_ia") } }, "Quero a IA")
          : h("a", { href: "#/config/plano" }, "Ver planos")) : null,
      h("div", { class: "au-modelo-rod" },
        btVer,
        // plano 2000d · DU-077: quantas pessoas a receita pegaria hoje (simula sem salvar)
        pr.auto && L.enviaMensagem(pr.auto) ? botaoQuemPegaria(ctx, pr.auto, dados) : null,
        // plano 1000 · AS-013: no limite, o botão apagado diz o porquê
        // plano 1000b · UB-047: o porquê é o aviso único do topo (#au-limite)
        h("button", { type: "button", class: ["bt", selo ? "bt-prim" : "bt-sec", "bt-p", "au-usar-receita"], disabled: noLimite,
          title: noLimite ? motivoLimite : null, "aria-describedby": noLimite ? "au-limite" : null,
          // plano 1000b · UB-012: cada botão diz QUAL receita (na lista de botões do leitor de tela eram todos «Usar receita»)
          "aria-label": `Usar a receita «${L.tituloModelo(m, vv)}»`,
          on: { click: () => ctx.navegar(`#/automacoes/nova?modelo=${encodeURIComponent(m.id)}${tom === "formal" ? "&tom=formal" : ""}`) } }, "Usar receita")));
  };

  const vazioBusca = h("div", { class: "au-modelos-vazio", hidden: true });
  const statusBusca = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });
  const desenhar = () => {
    desenhada = true;   // plano 2000d · DU-084
    ui.limpar(grade);
    const vis = L.filtrarModelos(todas.filter(m => categoria === "todas" || m.categoria === categoria), termo, vv);
    vis.forEach((m, i) => grade.appendChild(cartao(m, i === 0 && categoria === "todas" && !termo)));
    grade.classList.toggle("au-modelos-filtrada", categoria !== "todas" || !!termo);
    vazioBusca.hidden = vis.length > 0;
    ui.limpar(vazioBusca);
    if (!vis.length) vazioBusca.appendChild(ui.vazio({ tipo: "sem_resultado", tema: "busca", titulo: "Nenhuma receita com essas palavras.", texto: "Tente «mensagem», «tarefa», «IA» ou «orçamento».",
      acao: { rotulo: "Limpar busca", fn: () => { campoBusca.value = ""; termo = ""; desenhar(); campoBusca.focus(); } } }));
    statusBusca.textContent = termo ? `${vis.length} ${vis.length === 1 ? "receita encontrada" : "receitas encontradas"}.` : "";
    recontarChips();
  };
  /** plano 1000b · UB-052: as contagens dos chips seguem a busca («IA» → «WhatsApp · 0»); categoria sem receita nenhuma some. */
  const chipsCat = [];
  const recontarChips = () => {
    const achadas = L.filtrarModelos(todas, termo, vv);
    for (const [k, rot, b] of chipsCat) {
      const nBase = todas.filter(m => k === "todas" || m.categoria === k).length;
      const n = achadas.filter(m => k === "todas" || m.categoria === k).length;
      b.textContent = `${rot} · ${n}`;
      b.setAttribute("aria-label", `${rot}, ${n} ${n === 1 ? "receita" : "receitas"}`);
      if (k !== "todas") b.hidden = !nBase;
    }
    contaReceitas.textContent = `${todas.length} receitas · revise e salve em 1 minuto`;
  };
  const contaReceitas = h("span", { class: "rotulo" });
  // busca nas receitas (item 55): título, texto, tipo de passo e gatilho, sem acento
  const campoBusca = h("input", { type: "search", placeholder: "Buscar receita: mensagem, tarefa, orçamento…", "aria-label": "Buscar receita", autocomplete: "off" });
  campoBusca.addEventListener("input", ui.debounce(() => { termo = campoBusca.value; desenhar(); }, 150));
  const busca = h("label", { class: "busca au-modelos-busca" }, ui.icone("busca"), campoBusca);
  const barra = h("div", { class: "au-chips au-modelos-filtro", role: "radiogroup", "aria-label": "Tipo de receita" });
  for (const [k, rot] of L.CATEGORIAS_MODELO) {
    const n = daVertical.concat(deOutros).filter(m => k === "todas" || m.categoria === k).length;
    if (!n) continue;
    const b = P.chip({ rotulo: `${rot} · ${n}`, ligado: k === categoria, modo: "radio", aoClicar: () => {
      categoria = k; barra.querySelectorAll(".au-chip").forEach(c => c.setAttribute("aria-checked", String(c === b))); desenhar(); } });
    chipsCat.push([k, rot, b]);
    barra.appendChild(b);
  }
  P.setas(barra);
  // UB-210: o filtro só aparece quando há receitas escondidas para esta vertical
  const chkOutros = deOutros.length ? h("input", { type: "checkbox", class: "au-modelos-outros-chk", checked: comOutros }) : null;
  if (chkOutros) {
    chkOutros.checked = comOutros;
    chkOutros.addEventListener("change", () => {
      comOutros = !!chkOutros.checked;
      prefOutros.gravar(comOutros ? "1" : "0");
      todas = comOutros ? daVertical.concat(deOutros) : daVertical;
      if (categoria !== "todas" && !todas.some(m => m.categoria === categoria)) {
        categoria = "todas"; chipsCat.forEach(([k, , c]) => c.setAttribute("aria-checked", String(k === "todas")));
      }
      desenhar();
    });
  }
  const filtroOutros = chkOutros ? h("label", { class: "au-modelos-outros" }, chkOutros, h("span", null, `Mostrar receitas de outros segmentos (${deOutros.length})`)) : null;
  // plano 2000d · DU-419: o tom do texto, escolhido aqui, vale para a prévia e para o editor (?tom=formal)
  const barraTom = h("div", { class: "au-chips au-modelos-tom", role: "radiogroup", "aria-label": "Tom das mensagens" });
  for (const [k, rot] of L.TONS_RECEITA) {
    const b = P.chip({ rotulo: rot, ligado: k === tom, modo: "radio", aoClicar: () => {
      tom = k; barraTom.querySelectorAll(".au-chip").forEach(c => c.setAttribute("aria-checked", String(c === b))); if (desenhada) desenhar(); } });
    barraTom.appendChild(b);
  }
  P.setas(barraTom);
  // plano 2000d · DU-084: a grade (aplicarModelo de cada receita) só é montada quando a seção chega perto da tela ou a busca é usada
  let desenhada = false;
  const desenharJa = desenhar;
  const garantir = () => { if (!desenhada) { desenhada = true; desenharJa(); } };
  campoBusca.addEventListener("focus", garantir);
  recontarChips();
  // plano 1000b · UB-001: saiu do limite → «Usar receita» reacende (e os cartões desenhados depois já nascem acesos)
  aoLiberarLimite.push(() => {
    noLimite = false;
    grade.querySelectorAll(".au-usar-receita").forEach(b => { b.disabled = false; b.removeAttribute("title"); b.removeAttribute("aria-describedby"); });
  });
  const secao = h("section", { class: "au-sec", "aria-labelledby": "au-mod" },
    h("div", { class: "au-sec-cab" },
      h("h2", { class: "titulo-sec", id: "au-mod" }, qtdItens ? "Receitas prontas" : "Comece por uma receita"),
      contaReceitas),
    h("div", { class: "au-modelos-ferramentas" }, busca, barra, barraTom, filtroOutros),
    grade, vazioBusca, statusBusca);
  if (typeof IntersectionObserver === "function") {
    try {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); garantir(); } }, { rootMargin: "400px 0px" });
      io.observe(secao);
    } catch { garantir(); }
  } else garantir();
  return secao;
}

/** plano 2000d · DU-077: «Ver quem pegaria» — simula a receita aplicada (nada é salvo nem enviado) e diz o número no próprio botão. */
function botaoQuemPegaria(ctx, auto, dados) {
  const { ui } = ctx;
  const h = ui.h;
  const res = h("span", { class: "sub au-quem-pegaria", role: "status" });
  const bt = h("button", { type: "button", class: "bt bt-fant bt-p au-ver-quem" }, ui.icone("olho"), h("span", null, "Ver quem pegaria"));
  bt.addEventListener("click", async () => {
    const p = ctx.api.rpcC("nx_auto_simular", { p_automacao: L.limpar(auto) })
      .then(r => L.normalizarSimulacao(r, auto, dados && dados.base, ctx.vocab), () => null);
    const sim = await (typeof ui.carregando === "function" ? ui.carregando(bt, p).catch(() => null) : p);
    const total = sim && Number.isFinite(sim.total) ? sim.total : null;
    res.textContent = total == null ? "Não deu para contar agora." : sim.porEvento ? `Ela roda quando o gatilho acontece${total ? `; agora ${L.plural(total, "pessoa se encaixa", "pessoas se encaixam")}` : ""}.`
      : total === 0 ? "Hoje ninguém se encaixa." : `Hoje pegaria ${L.plural(total, "pessoa", "pessoas")}.`;
  });
  return h("span", { class: "au-ver-quem-caixa" }, bt, res);
}

/**
 * plano 1500c · UCA-120: o texto da bolha de uma receita. Com enviar_template e um modelo achado pelo aplicarModelo (template_id),
 * mostra o CORPO desse modelo; sem modelo, o lembrete sugerido (sugestao:true). Mensagem simples: o texto da receita com o exemplo. → {texto, sugestao}
 */
/**
 * plano 2000d · DU-053: o selo de canal de uma receita pelos números da empresa → {pilula: "ok"|"falta"|null, notaJanela: frase|null}.
 * Só número oficial (todos com provedor e nenhum por aparelho): a receita de texto livre mostra a pílula «falta» e a nota da janela de 24 h.
 */
export function selosCanalReceita(m, canais) {
  if (L.canalDaReceita(m) !== "codewords") return { pilula: null, notaJanela: null };
  const cs = Array.isArray(canais) ? canais : null;
  const semAparelho = !!cs && cs.every(c => c && c.provedor) && !cs.some(c => c.provedor === "codewords");
  const soOficial = semAparelho && cs.length > 0;
  return { pilula: semAparelho ? "falta" : "ok",
    notaJanela: soOficial ? "No seu número oficial, este texto só sai se o cliente escreveu nas últimas 24 h; fora disso, use um modelo aprovado." : null };
}

export function textoBolhaReceita(m, auto, base, vertical, exemplo) {
  const acTpl = m.auto.acoes.find(a => a.tipo === "enviar_template");
  if (acTpl) {
    const acAuto = auto && Array.isArray(auto.acoes) ? auto.acoes.find(a => a.tipo === "enviar_template") : null;
    const tid = acAuto && acAuto.template_id;
    const t = tid ? ((base && base.templates) || []).find(x => x && String(x.id) === String(tid)) : null;
    if (t && t.corpo) return { texto: L.previaModelo(t.corpo, (acAuto && acAuto.parametros) || acTpl.parametros, exemplo), sugestao: false };
    return { texto: L.previaModelo(L.textoModeloLembrete(vertical), acTpl.parametros, exemplo), sugestao: true };
  }
  const acMsg = auto && Array.isArray(auto.acoes) ? auto.acoes.find(a => a.tipo === "enviar_mensagem") : null;
  return { texto: acMsg ? L.aplicarVariaveis(acMsg.texto, exemplo) : "", sugestao: false };
}

/** Mini linha do tempo de uma receita com esperas: «Na hora · Esperar 1 dia · Mensagem · …». */   // plano 2000d · DU-089: o comentário voltou para a função dele
function miniTempo(ui, m, vv = null) {
  const h = ui.h;
  const tl = L.linhaDoTempo(m.auto.acoes);
  return h("ol", { class: "au-mini-tempo", role: "list", "aria-label": "Sequência da receita" }, m.auto.acoes.map((ac, i) => {
    const esp = ac.tipo === "esperar";
    const rot = esp ? `Esperar ${L.formatarDuracao(ac.minutos)}` : L.rotuloAcao(ac.tipo, vv || {});   // plano 1500c · UCA-030: no vocabulário da vertical
    return h("li", { class: ["au-mini-passo", esp && "au-mini-espera"], title: esp ? rot : `${tl[i].quando}: ${rot}` }, esp ? ui.icone("relogio") : null, rot);
  }));
}
