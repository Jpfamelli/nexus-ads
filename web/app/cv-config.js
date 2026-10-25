/* ============================================================
   ÓRBITA — cv-config.js · frente F5 · ESPEC §7.7 T14 (seções de atendimento)
   secoesConfig (o hub config.js da F3 carrega por import() com ?v=):
     numeros   — Números de WhatsApp: lista + assistente em 5 passos
                 (o que é preciso · dados · webhook · inscrever app · testar)
     respostas — Respostas rápidas (/atalho) com variáveis e prévia
   Nada de segredo volta do servidor: token e app secret só são
   escritos ("✓ preenchido" quando já existem).
   ============================================================ */

async function logica(ctx) { return import(`./cv-logica.js?v=${encodeURIComponent(ctx.versao || "dev")}`); }

const STATUS_CANAL = { ativo: ["Ativo", "ok"], pendente: ["Pendente", "aten"], erro: ["Com erro", "ruim"] };

/* ------------------------------------------------------------ histórico de conexão (item 57)
   O servidor não guarda o histórico de situação do número; esta tela anota, NESTE aparelho (localStorage), cada vez
   que vê a situação mudar («Conectado» → «Desconectado» → …). É honesto com o que é: o que esta tela observou. */
/** Acrescenta uma observação ao histórico: só quando a situação mudou; mais recente primeiro; até `max`. Nunca lança erro. */
export function atualizarHistorico(lista, { rotulo, tom, em = Date.now() } = {}, max = 8) {
  const l = (Array.isArray(lista) ? lista : []).filter(x => x && typeof x.rotulo === "string" && Number.isFinite(Number(x.em))).slice(0, max);
  if (!rotulo) return l;
  if (l[0] && l[0].rotulo === rotulo) return l;
  return [{ rotulo: String(rotulo).slice(0, 60), tom: /^(ok|aten|ruim|neutra|info)$/.test(tom) ? tom : "neutra", em: Number(em) || Date.now() }, ...l].slice(0, max);
}
export const chaveHistorico = (clienteId, canalId) => `nx-canal-hist:${clienteId || "-"}:${canalId || "-"}`;

/* ------------------------------------------------------------ plano 100 · G1: histórico do SERVIDOR, contadores e avisos do número */
const ESTADO_CANAL = { conectado: ["Conectado", "ok"], desconectado: ["Desconectado", "ruim"], desconhecido: ["Sem confirmação", "neutra"] };

/**
 * nx_canal_historico_listar → [{id, canal_id, estado, detalhe, em}] (mais recente primeiro) no formato do bloco de histórico:
 * [{rotulo, tom, em (ms), detalhe}]. null quando a resposta não é a lista do servidor (banco antigo): a tela usa o histórico local.
 */
export function historicoDoServidor(lista, max = 8) {
  if (!Array.isArray(lista)) return null;
  const out = [];
  for (const x of lista) {
    const e = x && ESTADO_CANAL[x.estado];
    const em = x ? Date.parse(x.em) : NaN;
    if (!e || !Number.isFinite(em)) continue;
    out.push({ rotulo: e[0], tom: e[1], em, detalhe: x.detalhe ? String(x.detalhe).slice(0, 200) : "" });
  }
  out.sort((a, b) => b.em - a.em);
  return out.slice(0, max);
}

/** Desde quando o número está na situação de agora (1ª linha do histórico do servidor com o mesmo estado), em ms; null sem dado. */
export function desdeQuando(historico, estado) {
  const e = ESTADO_CANAL[estado];
  const l = Array.isArray(historico) ? historico : [];
  if (!e || !l.length || l[0].rotulo !== e[0]) return null;
  return l[0].em;
}

/** O que o número ignorou, com explicação (nx_canal_json → codewords.contadores {eco, grupo, lid, payload_desconhecido, http_422, http_413, desde}). */
export const CONTADORES_CANAL = Object.freeze([
  ["eco", "Ecos das próprias mensagens", "Cópias do que o próprio número enviou que o CodeWords devolveu. Ignoradas para não duplicar a conversa."],
  ["grupo", "Mensagens de grupo", "Conversas em grupo do WhatsApp não entram no Órbita: só conversas individuais."],
  ["lid", "Contatos sem número (LID)", "O WhatsApp escondeu o número do contato (identificador LID). Sem o número não dá para ligar ao contato."],
  ["payload_desconhecido", "Formato não reconhecido", "Chegou algo num formato que o Órbita ainda não lê. Se crescer, avise a equipe da Nexus."],
  ["http_422", "Pedidos recusados (422)", "O CodeWords mandou dados incompletos ou inválidos e a entrada foi recusada."],
  ["http_413", "Pedidos grandes demais (413)", "Uma entrada passou do tamanho máximo aceito (anexos muito grandes)."],
]);
export function contadoresDoCanal(contadores) {
  const c = contadores && typeof contadores === "object" ? contadores : {};
  const itens = CONTADORES_CANAL.map(([chave, rotulo, explicacao]) => ({ chave, rotulo, explicacao, n: Math.max(0, Math.floor(Number(c[chave]) || 0)) })).filter(x => x.n > 0);
  const desde = c.desde && Number.isFinite(Date.parse(c.desde)) ? c.desde : null;
  return { itens, total: itens.reduce((s, x) => s + x.n, 0), desde };
}

/**
 * Aviso do número da Meta sem app secret próprio (S-F10): o «Testar conexão» devolve `app_secret_global: true` — o webhook só aceita a
 * assinatura do app da plataforma. Quem cadastrou a URL com «?c=» no app da própria empresa tem as mensagens recusadas.
 */
export function avisoAppSecret(canal, teste) {
  if (!canal || canal.provedor === "codewords" || canal.tem_app_secret) return null;
  if (!teste || teste.app_secret_global !== true) return null;
  return "Este número não tem app secret próprio: o webhook aceita só a assinatura do app da plataforma. Se a URL com «?c=» está cadastrada no app da sua empresa na Meta, as mensagens são recusadas — preencha o app secret em «Editar dados» ou peça ao suporte para inscrever o app da plataforma.";
}

/** O teste do assistente («Sim, chegou») conta no checklist do Início NESTE aparelho (marca local honesta: o servidor não vê o teste). */
export function marcarTesteLocal(armazenamento, clienteId, contaId) {
  try {
    const chave = `nx-onb:${clienteId}:${contaId || "-"}`;
    const p = JSON.parse(armazenamento.getItem(chave) || "{}") || {};
    p.pulados = [...new Set([...(Array.isArray(p.pulados) ? p.pulados : []), "mensagem_teste"])];
    p.teste_local_em = Date.now();
    armazenamento.setItem(chave, JSON.stringify(p));
    return true;
  } catch { return false; }
}
/** plano 1000b · CB-100: a MESMA lista do DDD_VALIDO do cv-logica (nx_ddd_valido). Cópia porque este export é síncrono e o cv-logica
    entra por import() com ?v=; o teste plano1000b-conv confere que as duas fontes são iguais. plano 1000b · CB-004: sem o DDD 29. */
export const DDD_CANAL = /^(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[13-5]|6[1-9]|7[13-579]|8[1-9]|9[1-9])$/;
/**
 * plano 1000 · AS-126: número do canal com DDI. «(12) 99999-9999» vira +55; com «+» aceita outro país (8 a 15 dígitos).
 * → {ok, numero: "+55 12 99999-9999" | "+351…", erro}
 */
export function normalizarNumeroCanal(v) {
  // plano 1500c · CX-045: «00 55 12…» (prefixo internacional discado) vale como «+»; «012 99999-9999» (zero de tronco) perde o zero
  const bruto = String(v ?? "").trim().replace(/^00(?=\s*[1-9])/, "+");
  let d = bruto.replace(/\D/g, "");
  const comMais = bruto.startsWith("+");
  if (!comMais && d[0] === "0" && d[1] !== "0" && (d.length === 11 || d.length === 12)) d = d.slice(1);
  const ERRO = "Informe o número com DDI e DDD, ex.: +55 12 99999-9999";
  const ddd = x => DDD_CANAL.test(x);   // plano 1000b · CB-100: só DDD que existe (20, 23, 26… recusados), como o erroTelefone da central
  if (!comMais && (d.length === 10 || d.length === 11)) d = `55${d}`;
  if (d.startsWith("55") && (comMais || d.length === 12 || d.length === 13)) {
    if (!(d.length === 12 || d.length === 13) || !ddd(d.slice(2, 4))) return { ok: false, numero: null, erro: ERRO };
    const loc = d.slice(4);
    return { ok: true, numero: `+55 ${d.slice(2, 4)} ${loc.slice(0, loc.length - 4)}-${loc.slice(-4)}`, erro: null };
  }
  if (comMais && d.length >= 8 && d.length <= 15) return { ok: true, numero: `+${d}`, erro: null };
  return { ok: false, numero: null, erro: ERRO };
}

/**
 * plano 1000 · AS-127: chave do CodeWords, token e app secret da Meta não são «senha do site» — o navegador e os gerenciadores
 * (1Password, LastPass, Dashlane) não devem oferecer salvar nem preencher. Recebe o .campo do ui.campo e devolve o mesmo.
 */
export function semGerenciadorDeSenha(wrap) {
  const inp = wrap && wrap.querySelector ? wrap.querySelector("input") : null;
  if (inp) {
    inp.setAttribute("autocomplete", "off");
    inp.setAttribute("data-1p-ignore", "");
    inp.setAttribute("data-lpignore", "true");
    inp.setAttribute("data-form-type", "other");
    inp.setAttribute("data-bwignore", "");
  }
  return wrap;
}

/** plano 1000 · AS-123: o resultado do «Testar» da Meta em frase (sem ✓/✗ e sem espaço duplo quando a Meta não devolve o número). */
export function fraseTesteMeta(r) {
  const num = r && r.numero ? String(r.numero).trim() : "";
  const n = num ? `O número ${num} respondeu.` : "O número respondeu.";
  return r && r.app_inscrito ? `${n} O app está inscrito.` : `${n} O app não está inscrito: as mensagens não chegam. Use «Inscrever o app».`;
}

/** plano 1000 · AS-128: explicação de cada situação do CodeWords (todas as de L.situacaoCodeWords); outra qualquer → frase neutra. */
export function explicacaoSituacaoCodeWords(rotulo) {
  return {
    "Conectado": "O aparelho e o destino foram conferidos.",
    "Aguardando confirmação": "Toque em «Reconferir agora» para conferir se o aparelho está pareado e recebendo mensagens.",
    "Conectado mas sem receber": "O aparelho está ligado, mas o destino das mensagens precisa ser corrigido.",
    "Desconectado": "Pareie ou reconecte este número pelo WhatsApp no celular.",
  }[rotulo] || "Ainda não sabemos a situação deste número. Toque em «Reconferir agora».";
}

/** plano 1000 · AS-153: dados pessoais na memória aprovada (CPF, telefone, e-mail, data) → [{tipo, trecho}] (no máx. 5). */
export function dadosPessoaisNoTexto(texto) {
  const t = String(texto || "");
  const achados = [];
  const regras = [
    ["CPF", /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g],
    ["e-mail", /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi],
    ["telefone", /(?:\+?55\s?)?\(?\b[1-9]{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g],
    ["data", /\b(?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}\b/g],
  ];
  const vistos = [];
  for (const [tipo, re] of regras) for (const m of t.matchAll(re)) {
    const trecho = m[0];
    // plano 1000b (como o UB-026): celular de 11 dígitos sem máscara («12991234567») casa com o CPF, que é testado antes — fica para a
    // regra do telefone (CPF formatado com ponto continua CPF)
    if (tipo === "CPF" && !trecho.includes(".") && /^[1-9]{2}9\d{8}$/.test(trecho.replace(/\D/g, ""))) continue;
    if (vistos.some(v => v.includes(trecho) || trecho.includes(v))) continue;
    vistos.push(trecho);
    achados.push({ tipo, trecho });
  }
  return achados.slice(0, 5);
}

/** plano 1000b · CB-098: «1 modelo sincronizado» · «5 modelos sincronizados» (sem o plural com parênteses). */
export function textoModelosSincronizados(total) {
  const n = Math.max(0, Number(total) || 0);
  return n === 1 ? "1 modelo sincronizado" : `${n} modelos sincronizados`;
}

/** plano 1000 · AS-285: a qualidade do número como a Meta devolve (GREEN/YELLOW/RED) em português, com o que derruba a nota. */
export function qualidadeMeta(q) {
  const k = String(q || "").trim().toUpperCase();
  const t = {
    GREEN: ["Boa", "ok", "A Meta avalia bem as mensagens deste número."],
    YELLOW: ["Atenção", "aten", "Muitos clientes bloquearam ou denunciaram mensagens recentes. Mande só para quem pediu e responda rápido, ou o limite de envios cai."],
    RED: ["Baixa", "ruim", "A Meta está prestes a limitar este número: bloqueios e denúncias demais. Pause campanhas e envie só respostas a quem escreveu."],
  }[k];
  // plano 1500c · CX-046: número novo ainda sem nota da Meta («UNKNOWN»/«NA») aparecia como «Unknown»
  if (/^(UNKNOWN|NA|N\/A|NONE)$/.test(k)) return { rotulo: "Sem avaliação ainda", tom: "neutra", explicacao: "A Meta só dá a nota depois que o número manda mensagens por alguns dias." };
  if (!t) return k ? { rotulo: k.charAt(0) + k.slice(1).toLowerCase(), tom: "neutra", explicacao: "Situação informada pela Meta." } : null;
  return { rotulo: t[0], tom: t[1], explicacao: t[2] };
}

/** plano 1000 · AS-286: os modelos (templates) de UM número por situação → [{chave, n, rotulo, tom}] (só as que têm algum). */
export function resumoModelos(templates, canalId) {
  const l = (Array.isArray(templates) ? templates : []).filter(t => t && t.canal_id === canalId);
  const grupo = st => { const x = String(st || "").toUpperCase(); return x === "APPROVED" ? "aprovado" : /^(PENDING|IN_APPEAL|PENDING_DELETION)$/.test(x) ? "analise" : "recusado"; };
  const n = { aprovado: 0, analise: 0, recusado: 0 };
  for (const t of l) n[grupo(t.status)]++;
  return [["aprovado", "aprovado", "aprovados", "ok"], ["analise", "em análise", "em análise", "aten"], ["recusado", "recusado ou pausado", "recusados ou pausados", "ruim"]]
    .filter(([k]) => n[k] > 0).map(([k, um, varios, tom]) => ({ chave: k, n: n[k], rotulo: `${n[k]} ${n[k] === 1 ? um : varios}`, tom }));
}

/** plano 1000 · AS-137: o que perde quem exclui o número → frase (conversas abertas por ele e automações que dependem dele). */
export function impactoExcluirNumero({ abertas = null, maisDe = false, automacoes = [] } = {}) {
  const partes = [];
  if (abertas > 0) partes.push(`${maisDe ? "Mais de " : ""}${abertas} ${abertas === 1 && !maisDe ? "conversa aberta fica" : "conversas abertas ficam"} sem canal para responder.`);
  else if (abertas === 0) partes.push("Nenhuma conversa aberta usa este número agora.");
  const a = (automacoes || []).filter(Boolean);
  if (a.length) partes.push(`${a.length === 1 ? "A automação" : `As ${a.length} automações`} ${a.slice(0, 3).map(x => `«${x}»`).join(", ")}${a.length > 3 ? " e outras" : ""} ${a.length === 1 ? "depende" : "dependem"} dele e ${a.length === 1 ? "para" : "param"} de disparar.`);
  return partes.join(" ");
}

/** plano 1000 · AS-131: texto do botão enquanto reconfere vários números. */
export const rotuloReconferindo = (i, n) => (n > 1 ? `Reconferindo ${i} de ${n}…` : "Reconferindo…");

/** plano 1000 · AS-146: o campo de hora não mostra «24:00» — quem escolhe 23:59 como fim quer «até o fim do dia» (o servidor aceita 24:00). */
export const fimDaFaixa = v => (v === "23:59" ? "24:00" : v);

function historicoCanal(ctx, canalId) {
  const chave = chaveHistorico(ctx.cliente && ctx.cliente.id, canalId);
  const ler = () => { try { return atualizarHistorico(JSON.parse(localStorage.getItem(chave) || "[]")); } catch { return []; } };
  return {
    ler,
    registrar(obs) { const l = atualizarHistorico(ler(), obs); try { localStorage.setItem(chave, JSON.stringify(l)); } catch { /* sem storage: só a sessão */ } return l; },
  };
}

/* ============================================================ NÚMEROS */
async function montarNumeros(ctx, alvo) {
  const { ui } = ctx;
  const h = ui.h;
  const [L] = await Promise.all([logica(ctx), ui.carregarCss("conversas"), ui.carregarCss("config")]);
  let canais = [], base = null;

  /** Situação com ponto animado (pulsa quando está tudo certo; parado quando não). O texto continua na pilula. */
  function statusVivo(rotulo, cor) {
    return h("span", { class: "cfg-status", dataset: { tom: cor } }, h("span", { class: "cfg-status-dot", "aria-hidden": "true" }),
      ui.pilula(rotulo, cor, { icone: cor === "ok" ? "check" : cor === "ruim" ? "alerta" : "relogio" }));
  }
  /** Passo a passo com progresso: um segmento por passo, os feitos preenchidos. */
  function progresso(passos, { rotulo = "Passos da conexão" } = {}) {
    const total = passos.length, feitos = passos.filter(p => p.feito).length;
    return h("div", { class: "cfg-progresso", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(feitos), "aria-label": rotulo,
      "aria-valuetext": `${feitos} de ${total} passos feitos` },
      h("span", { class: "cfg-progresso-segs", "aria-hidden": "true" }, passos.map(p => h("i", { class: p.feito ? "feito" : null, title: p.rotulo }))),
      h("span", { class: "cfg-progresso-txt" }, feitos === total ? "Tudo pronto" : `${feitos} de ${total} passos`));
  }
  /** O histórico de conexão recolhido num <details>: o do SERVIDOR (G1, nx_canal_historico_listar) ou, no banco antigo, o observado neste aparelho. */
  function blocoHistorico(lista, { servidor = false } = {}) {
    if (!lista || !lista.length) return null;
    const iso = x => new Date(Number(x.em) || 0).toISOString();
    return h("details", { class: "cfg-hist", dataset: { fonte: servidor ? "servidor" : "local" } },
      h("summary", null, ui.icone("relogio"), h("span", null, `${servidor ? "Histórico de conexão" : "Histórico de conexão neste aparelho"} · ${lista.length}`)),
      h("ol", { class: "cfg-hist-lista" }, lista.map(x => h("li", { class: "cfg-hist-item", dataset: { tom: x.tom } }, h("i", { "aria-hidden": "true" }),
        h("span", { class: "cfg-hist-txt" }, x.rotulo, x.detalhe ? h("small", null, ` · ${x.detalhe}`) : null),
        h("time", { class: "mono", datetime: iso(x), title: ui.dataHoraBR(iso(x)) }, ui.relativo(iso(x)))))),
      h("p", { class: "sub" }, servidor ? "Registrado pelo servidor a cada mudança de situação do número."
        : "Anotado cada vez que esta tela viu a situação mudar; não é o histórico do servidor."));
  }
  /** «Conectado desde …» / «Desconectado desde …» a partir do histórico do servidor (sem histórico, nada: não inventamos o «desde»). */
  function linhaDesde(c, hist) {
    const em = desdeQuando(hist, c.estado);
    if (!em) return null;
    const iso = new Date(em).toISOString();
    return h("p", { class: "sub cfg-desde", dataset: { estado: c.estado } }, `${(ESTADO_CANAL[c.estado] || ["Situação"])[0]} desde `,
      h("time", { class: "mono", datetime: iso, title: ui.dataHoraBR(iso) }, `${ui.dataHoraBR(iso)} (${ui.relativo(iso)})`));
  }
  /** O que o número ignorou (eco, grupo, LID, 422, 413…) com a explicação de cada um — só quando há algo a contar. */
  function blocoContadores(c) {
    const r = contadoresDoCanal(c.codewords && c.codewords.contadores);
    if (!r.itens.length) return null;
    return h("details", { class: "cfg-hist cfg-contadores" },
      h("summary", null, ui.icone("info"), h("span", null, `Mensagens ignoradas · ${ui.num(r.total)}${r.desde ? ` desde ${ui.dataBR(r.desde)}` : ""}`)),
      h("dl", { class: "cfg-ign-lista" }, r.itens.flatMap(x => [
        h("dt", null, h("span", null, x.rotulo), h("b", { class: "mono" }, ui.num(x.n))),
        h("dd", { class: "sub" }, x.explicacao)])),
      h("p", { class: "sub" }, "Contado pelo servidor. Nada disso é erro do aparelho; números altos de «formato não reconhecido» ou 422 valem um aviso à Nexus."));
  }
  // G1: histórico do servidor por número (null = o banco ainda não tem a RPC → histórico local) e o último «Testar conexão» da Meta
  const histServidor = new Map();
  let histDisponivel = null;
  const testesMeta = new Map();
  async function carregarHistoricos() {
    if (histDisponivel === false) return;
    await Promise.all((canais || []).map(async c => {
      try {
        const l = historicoDoServidor(await ctx.api.rpcC("nx_canal_historico_listar", { p_canal: c.id, p_limite: 8 }));
        if (l) { histServidor.set(c.id, l); histDisponivel = true; }
      } catch (e) {
        if (/pgrst202|could not find the function|http_404|funcao_invalida/i.test(String((e && (e.codigo || e.message)) || ""))) histDisponivel = false;
      }
    }));
  }
  /** Histórico a mostrar no cartão: o do servidor quando existe; senão o anotado neste aparelho (e marcado como tal). */
  function historicoDoCartao(c, rotulo, tom) {
    const srv = histServidor.get(c.id);
    // plano 1000 · AS-121: com histórico do servidor, nada é gravado neste aparelho (antes cada redesenho de 30 s escrevia no localStorage)
    if (srv && srv.length) return { lista: srv, servidor: true };
    // revisão: lista VAZIA do servidor (número Meta — só o aparelho grava histórico — ou aparelho ainda sem troca) não apaga o anotado aqui
    return { lista: historicoCanal(ctx, c.id).registrar({ rotulo, tom }), servidor: false };
  }

  const lista = h("div", { class: "cfg-canais" });
  // plano 1000 · AS-129: UM botão «Adicionar número» que explica os dois caminhos (antes eram dois botões empilhados sem diferença clara)
  const novo = h("button", { type: "button", class: "bt bt-prim cfg-add-numero" }, ui.icone("mais"), "Adicionar número");
  novo.addEventListener("click", () => escolherCaminho());
  async function escolherCaminho() {
    let escolha = null;
    const opcao = (valor, titulo, texto, selo) => h("button", { type: "button", class: "cfg-caminho", dataset: { caminho: valor } },
      h("span", { class: "cfg-caminho-tit" }, h("b", null, titulo), selo ? ui.pilula(selo, "ok") : null), h("span", { class: "sub" }, texto));
    const cw = opcao("codewords", "WhatsApp pelo CodeWords", "Usa o WhatsApp do celular da empresa (pareado como aparelho). Manda texto livre a qualquer hora e liga a IA 24h. Leva uns 5 minutos.", "Recomendado");
    const meta = opcao("meta", "API oficial da Meta", "Para quem já tem conta no WhatsApp Business Platform (token e ID do número). Fora da janela de 24 h só sai modelo aprovado.", null);
    const corpo = h("div", { class: "pilha cfg-caminhos" }, h("p", { class: "sub" }, "Escolha como este número vai se conectar. Dá para ter números dos dois tipos."), cw, meta);
    await ui.modal({ titulo: "Adicionar número de WhatsApp", corpo, largura: "m",
      acoes: [{ rotulo: "Cancelar", tipo: "neutro" }],
      aoAbrir: api => {
        for (const b of [cw, meta]) b.addEventListener("click", () => { escolha = b.dataset.caminho; if (api && typeof api.fechar === "function") api.fechar(); });
      } });
    if (escolha === "codewords") assistenteCodeWords(null);
    else if (escolha === "meta") assistente(null);
  }
  // G1: «Reconferir agora» pergunta a cada número como ele está (aparelho no CodeWords, Graph API na Meta) e redesenha com o resultado
  const txtReconferir = h("span", { class: "cfg-reconf-txt" }, "Reconferir agora");
  const bReconferir = h("button", { type: "button", class: "bt bt-fant cfg-reconferir" }, ui.icone("reabrir"), txtReconferir);
  bReconferir.addEventListener("click", () => reconferirTodos(bReconferir));
  ui.limpar(alvo);
  alvo.append(
    ui.cabecalho({ rotulo: "Atendimento", titulo: "Números de WhatsApp", nivel: 2,
      sub: "Conecte pela API oficial da Meta ou pelo CodeWords. As conversas, respostas e confirmações aparecem nesta central.",
      acoes: [novo, bReconferir] }),
    lista);

  let seqCarga = 0;
  /** suave: sem o esqueleto (atualização ao vivo: a lista não pisca); a resposta de uma carga antiga é descartada. */
  async function carregar({ suave = false } = {}) {
    const n = ++seqCarga;
    if (!suave || !lista.childNodes.length) { ui.limpar(lista); lista.appendChild(ui.esqueleto("cartao")); }     // AS-256: lembra o cartão do número
    try {
      const [cs, b] = await Promise.all([ctx.api.rpcC("nx_canais_listar"), ctx.api.rpcC("nx_cv_base")]);
      if (n !== seqCarga) return;
      canais = cs; base = b;
      await carregarHistoricos();
      if (n !== seqCarga) return;
      desenhar();
    } catch (e) {
      if (n !== seqCarga) return;
      if (suave && canais && canais.length) return;      // ao vivo: falhou agora, a lista que está na tela continua valendo
      ui.limpar(lista);
      lista.appendChild(ui.erroCartao(e, carregar));
    }
  }

  let reconferindo = false;
  /** Reconfere todos os números, um por vez (sem disparar vários pedidos à Meta/CodeWords juntos), e recarrega a lista. */
  async function reconferirTodos(botao) {
    if (reconferindo) return;
    if (!canais || !canais.length) { ui.toast("Nenhum número para reconferir ainda.", { tipo: "info" }); return; }
    reconferindo = true;
    let falhas = 0, semConfig = 0;
    // plano 1000 · AS-131: o botão diz em qual está («Reconferindo 2 de 4…») e cada cartão se refaz assim que o número dele responde
    const totalAlvos = canais.filter(c => c.tem_token !== false).length;
    let i = 0;
    const tarefa = (async () => {
      for (const c of canais) {
        // revisão: número ainda sem token/chave não é testado — o teste da Meta gravava status «erro» e o número «caía» sem nunca ter conectado
        if (c.tem_token === false) { semConfig++; continue; }
        txtReconferir.textContent = rotuloReconferindo(++i, totalAlvos);
        try {
          if (c.provedor === "codewords") estadosCodeWords.set(c.id, (await ctx.api.fn("nx-codewords", { acao: "estado", canal: c.id })) || {});
          else testesMeta.set(c.id, (await ctx.api.fn("nx-enviar", { acao: "testar_canal", canal: c.id })) || {});
        } catch { falhas++; }
        if (lista.isConnected && canais.length) desenhar();
      }
    })();
    try { await (botao ? ui.carregando(botao, tarefa) : tarefa); } finally { reconferindo = false; txtReconferir.textContent = "Reconferir agora"; }
    await carregar({ suave: true });
    const nota = semConfig ? ` ${semConfig === 1 ? "1 número ainda não está configurado" : `${semConfig} números ainda não estão configurados`} e ficou de fora.` : "";
    ui.toast((falhas ? `Reconferido, mas ${falhas === 1 ? "1 número não respondeu" : `${falhas} números não responderam`}. Tente de novo em instantes.` : "Números reconferidos agora.") + nota,
      { tipo: falhas ? "info" : "ok" });
  }

  function depNome(id) { const d = ((base && base.departamentos) || []).find(x => x.id === id); return d ? d.nome : "—"; }

  /** plano 1000 · AS-136: «Webhook do app da plataforma» era jargão — diz por onde as mensagens chegam, com a dica de quando usar app próprio. */
  function pilulaWebhook(c) {
    const p = c.tem_app_secret ? ui.pilula("Recebe pelo app da sua empresa", "info") : ui.pilula("Recebe pelo app da plataforma", "neutra");
    const caixa = h("span", { class: "cfg-pil-dica" }, p);
    if (typeof ui.dica === "function") ui.dica(p, c.tem_app_secret
      ? "As mensagens chegam pelo app da Meta da sua empresa (com o app secret que você cadastrou)."
      : "As mensagens chegam pelo app da Meta da plataforma, e o suporte cuida da inscrição. Só use um app próprio se a sua empresa já tem um app na Meta: aí preencha o app secret em «Editar dados».");
    return caixa;
  }

  function desenhar() {
    ui.limpar(lista);
    if (!canais || !canais.length) {
      lista.appendChild(ui.vazio({ tipo: "primeiro_uso", titulo: "Nenhum número conectado.",
        texto: "Conecte o WhatsApp da empresa para receber e responder as conversas aqui. O assistente leva um passo por vez.",
        passos: L.PASSOS_CODEWORDS.map(p => ({ rotulo: p.rotulo, feito: false })),
        acoes: [{ rotulo: "Adicionar pelo CodeWords", fn: () => assistenteCodeWords(null) }, { rotulo: "Conectar pela API oficial da Meta", fn: () => assistente(null) }] }));
      return;
    }
    for (const c of canais) {
      const [rot, cor] = STATUS_CANAL[c.status] || [c.status, "neutra"];
      if (c.provedor === "codewords") {
        lista.appendChild(cartaoCodeWords(c));
        continue;
      }
      const ok = (v, sim, nao, nulo) => ui.pilula(v === true ? sim : v === false ? nao : nulo, v === true ? "ok" : v === false ? "ruim" : "neutra",
        { icone: v === true ? "check" : v === false ? "alerta" : "relogio" });
      const bTestar = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Testar conexão");
      bTestar.addEventListener("click", () => testar(c, bTestar));
      const bInscr = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Inscrever app");
      bInscr.addEventListener("click", () => inscrever(c, bInscr));
      const bSync = h("button", { type: "button", class: "bt bt-sec bt-p" }, "Sincronizar modelos");
      bSync.addEventListener("click", () => sincronizar(c, bSync));
      const bMais = h("button", { type: "button", class: "bt-icone", "aria-label": `Mais opções de ${c.nome}` }, ui.icone("opcoes"));
      bMais.addEventListener("click", () => ui.menu(bMais, [
        { rotulo: "Editar dados", icone: "editar", fn: () => assistente(c, 2) },
        { rotulo: "Webhook (URL e token)", icone: "link", fn: () => assistente(c, 3) },
        "-",
        { rotulo: "Excluir número", icone: "lixeira", perigo: true, fn: () => excluir(c) },
      ]));
      const marcos = L.marcosMeta(c, ((base && base.templates) || []).filter(t => t.canal_id === c.id).length);
      const hist = historicoDoCartao(c, rot, cor);
      const avisoSecret = avisoAppSecret(c, testesMeta.get(c.id));
      const qualidade = qualidadeMeta(c.qualidade);
      const modelos = resumoModelos(base && base.templates, c.id);
      lista.appendChild(h("article", { class: "cartao cfg-canal", dataset: { tom: cor } },
        h("div", null,
          h("h3", { class: "titulo-sec" }, c.nome, statusVivo(rot, cor)),
          progresso(marcos),
          h("div", { class: "cfg-canal-kv" },
            h("span", null, "Número ", h("b", null, c.numero_exibicao || "—")),
            h("span", null, "Departamento ", h("b", null, depNome(c.departamento_id))),
            qualidade ? h("span", { class: "cfg-qualidade", dataset: { tom: qualidade.tom } }, "Qualidade ", h("b", null, qualidade.rotulo)) : null,
            c.verificado_em ? h("span", null, "Testado ", h("b", null, ui.relativo(c.verificado_em))) : null),
          qualidade && qualidade.tom !== "ok" ? h("p", { class: "sub cfg-qualidade-exp" }, qualidade.explicacao) : null,
          // plano 1000 · AS-286: os modelos deste número por situação (de base.templates)
          modelos.length ? h("div", { class: "cfg-modelos", role: "list", "aria-label": "Modelos da Meta deste número" },
            modelos.map(m => h("span", { role: "listitem" }, ui.pilula(m.rotulo, m.tom)))) : null,
          h("div", { class: "cfg-checks", role: "list", "aria-label": "Marcos da conexão" },
            marcos.map(m => h("span", { role: "listitem" },
              ui.pilula(m.rotulo, m.feito ? "ok" : "neutra", { icone: m.feito ? "check" : "relogio" }))),
            pilulaWebhook(c),
            c.app_inscrito === false ? ui.pilula("App NÃO inscrito: nenhuma mensagem chega", "ruim", { icone: "alerta" }) : null),
          linhaDesde(c, hist.servidor ? hist.lista : null),
          c.ultimo_erro ? h("div", { class: "aviso aviso-ruim cfg-erro" }, ui.icone("alerta"), h("p", null, c.ultimo_erro)) : null,
          avisoSecret ? h("div", { class: "aviso aviso-aten cfg-erro cfg-aviso-secret", role: "note" }, ui.icone("cadeado"), h("p", null, avisoSecret)) : null,
          blocoHistorico(hist.lista, { servidor: hist.servidor }),
          // plano 1000 · AS-135: os IDs da Meta só interessam a quem configura — recolhidos
          h("details", { class: "cfg-hist cfg-tecnicos" }, h("summary", null, ui.icone("info"), h("span", null, "Dados técnicos")),
            h("dl", { class: "cfg-ign-lista" },
              // plano 1500c · CC-159: rótulos em português com o nome da Meta entre parênteses (é como aparece no painel dela)
              h("dt", { title: "No painel da Meta: WhatsApp › Configuração da API" }, h("span", null, "ID do número na Meta (Phone number ID)"), h("b", { class: "mono" }, c.phone_number_id || "—")),
              h("dt", { title: "No painel da Meta: WhatsApp › Configuração da API" }, h("span", null, "Conta do WhatsApp Business (WABA)"), h("b", { class: "mono" }, c.waba_id || "—"))))),
        h("div", { class: "cfg-canal-acoes" }, bTestar, bInscr, bSync, bMais)));
    }
  }

  function erroFuncao(e) {
    const c = e && e.codigo;
    if (c === "http_404" || c === "sem_conexao" || /^http_5/.test(String(c))) return "A função de WhatsApp não respondeu agora. Tente de novo em alguns minutos.";
    // aqui o servidor diz qual número/aparelho está errado: essa frase ajuda mais que a genérica
    if ((c === "numero_diferente" || c === "aparelho_nao_encontrado") && e.detalhe_texto) return String(e.detalhe_texto).slice(0, 300);
    return ui.mensagemErro(e);
  }

  /** O teste confirmado no assistente («Sim, chegou») conta no checklist do Início neste aparelho — a mesma chave local do «Já está bom».
      O servidor só enxerga mensagens de conversas; o teste vai direto ao próprio número e não entra lá. */
  function marcarTesteNoChecklist() {
    // sem storage: o item segue pendente até a primeira mensagem de verdade
    try { marcarTesteLocal(localStorage, ctx.cliente.id, ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.id); } catch { /* idem */ }
  }

  async function testar(c, botao) {
    try {
      const r = await ui.carregando(botao, ctx.api.fn("nx-enviar", { acao: "testar_canal", canal: c.id }));
      testesMeta.set(c.id, r || {});
      // plano 1000 · AS-123: frase, sem ✓/✗ nem espaço duplo (o leitor de tela lia «marca de verificação»)
      ui.toast(fraseTesteMeta(r), { tipo: r && r.app_inscrito ? "ok" : "info" });
    } catch (e) { ui.toast(erroFuncao(e), { tipo: "erro" }); }
    carregar({ suave: true });      // plano 1000 · AS-124: sem esqueleto e sem perder a rolagem
  }
  async function inscrever(c, botao) {
    try {
      const r = await ui.carregando(botao, ctx.api.fn("nx-enviar", { acao: "inscrever_app", canal: c.id }));
      ui.toast(r && r.app_inscrito ? "App inscrito na WABA. As mensagens já podem chegar." : "A Meta não confirmou a inscrição. Confira as permissões do token.", { tipo: r && r.app_inscrito ? "ok" : "erro" });
    } catch (e) { ui.toast(erroFuncao(e), { tipo: "erro" }); }
    carregar({ suave: true });      // AS-124
  }
  async function sincronizar(c, botao) {
    try {
      const r = await ui.carregando(botao, ctx.api.fn("nx-enviar", { acao: "sincronizar_templates", canal: c.id }));
      ui.toast(textoModelosSincronizados(r && r.total), { tipo: "ok" });   // plano 1000b · CB-098
    } catch (e) { ui.toast(erroFuncao(e), { tipo: "erro" }); }
  }
  /** plano 1000 · AS-137: antes de excluir, quantas conversas abertas usam o número e quais automações dependem dele (cada consulta
      que falhar só some da frase — a exclusão continua possível). */
  async function impactoDoNumero(c) {
    const [conv, autos] = await Promise.all([
      ctx.api.rpcC("nx_cv_listar", { p_filtro: { aba: "abertas", canal_id: c.id }, p_limite: 50 }).catch(() => null),
      ctx.temModulo("automacoes") ? ctx.api.rpcC("nx_automacoes_listar").catch(() => null) : null,
    ]);
    const itens = conv && Array.isArray(conv.itens) ? conv.itens : null;
    const usa = a => (a.config && a.config.canal_id === c.id) || (Array.isArray(a.condicoes) && a.condicoes.some(x => x && x.campo === "canal_id" && x.valor === c.id));
    return impactoExcluirNumero({ abertas: itens ? itens.length : null, maisDe: !!(conv && conv.tem_mais),
      automacoes: autos && Array.isArray(autos.itens) ? autos.itens.filter(usa).map(a => a.nome) : [] });
  }
  async function excluir(c) {
    const impacto = await impactoDoNumero(c);
    // plano 1500c · CC-158: confirma digitando os 4 últimos dígitos DO número (não exclui o errado); sem número conhecido, «excluir»
    const final = L.finalNumero(c);
    const ok = await ui.confirmar({ titulo: `Excluir o número ${c.nome}?`, perigo: true, digitar: final || "excluir",
      texto: `${impacto ? `${impacto} ` : ""}As conversas e mensagens continuam guardadas, mas deixam de receber e enviar por este número. O token e o app secret são apagados do cofre.${final ? ` Para confirmar, digite os 4 últimos dígitos do número (${final}).` : ""}` });
    if (!ok) return;
    try {
      await ctx.api.rpcC("nx_canal_excluir", { p_id: c.id, p_confirmacao: "excluir" });
      ui.toast("Número excluído.", { tipo: "ok" });
      carregar();
    } catch (e) { ui.toast(ui.mensagemErro(e), { tipo: "erro" }); }
  }

  const estadosCodeWords = new Map();

  function estadoVisualCodeWords(c) { return L.situacaoCodeWords(c, estadosCodeWords.get(c.id)); }

  async function consultarEstadoCodeWords(c, botao) {
    try {
      const r = await ui.carregando(botao, ctx.api.fn("nx-codewords", { acao: "estado", canal: c.id }));
      estadosCodeWords.set(c.id, r || {});
      if (r?.ok && r.inscrito_certo) ui.toast("WhatsApp conectado e recebendo pelo destino configurado.", { tipo: "ok" });
      else ui.toast(r?.motivo || r?.detalhe || "Situação atualizada. Confira o estado do número.", { tipo: r?.ok ? "info" : "erro" });
      await carregar({ suave: true });   // plano 1000b · CB-097: «Reconferir agora» sem esqueleto e sem perder a rolagem (como o AS-124)
    } catch (e) { ui.toast(erroFuncao(e), { tipo: "erro" }); }
  }

  /** plano 1000 · AS-247: «Sincronizado há…» diz o que é — a recuperação periódica das mensagens que o aparelho guardou. */
  function pilulaSync(sync) {
    const p = ui.pilula(`Sincronizado ${ui.relativo(sync.em)}`, sync.erro ? "aten" : "neutra");
    // plano 1500c · CC-316: com erro, a linha fica à vista com o próximo passo (antes só na dica)
    const caixa = h("span", { class: "cfg-pil-dica cfg-sync" }, p,
      sync.erro ? h("small", { class: "cfg-sync-erro", role: "status" }, `A última recuperação falhou: ${sync.erro}. Toque em «Reconferir agora».`) : null);
    if (typeof ui.dica === "function") ui.dica(p, `Última recuperação de mensagens do aparelho: o Órbita busca no CodeWords as mensagens que possam ter se perdido no caminho.${sync.erro ? ` Deu erro: ${sync.erro}` : ""}`);
    return caixa;
  }

  const rotulosVistos = new Map();     // plano 1000 · AS-122: só MUDANÇA de estado é anunciada ao leitor de tela
  function cartaoCodeWords(c) {
    const cw = c.codewords || {};
    const [rotulo, cor] = estadoVisualCodeWords(c);
    const antes = rotulosVistos.get(c.id);
    rotulosVistos.set(c.id, rotulo);
    if (antes && antes !== rotulo && typeof ui.anunciar === "function") ui.anunciar(`${c.nome}: ${rotulo}.`);
    const atualizar = h("button", { type: "button", class: "bt bt-sec bt-p", "aria-label": `Reconferir agora o número ${c.nome}` }, ui.icone("reabrir"), "Reconferir agora");
    atualizar.addEventListener("click", () => consultarEstadoCodeWords(c, atualizar));
    const pr = L.passosCodeWords({ canal: c, estado: estadosCodeWords.get(c.id) });
    const pronto = pr.atual >= 5;            // 5 = só falta a mensagem de teste (recomendada, não obrigatória)
    const conectar = h("button", { type: "button", class: pronto ? "bt bt-sec bt-p" : "bt bt-prim bt-p" }, pronto ? "Configurar" : `Continuar · passo ${pr.atual} de 5`);
    conectar.addEventListener("click", () => assistenteCodeWords(c));
    const mais = h("button", { type: "button", class: "bt-icone", "aria-label": `Mais opções de ${c.nome}` }, ui.icone("opcoes"));
    mais.addEventListener("click", () => ui.menu(mais, [
      { rotulo: "Abrir o assistente do número", icone: "editar", fn: () => assistenteCodeWords(c) }, "-",
      { rotulo: "Excluir número", icone: "lixeira", perigo: true, fn: () => excluir(c) },
    ]));
    const ultimo = estadosCodeWords.get(c.id);
    const resumoRota = cw.rota === "direta"
      ? ui.pilula("Recebimento direto no Órbita", "info")
      : cw.ia_ligada && rotulo === "Conectado" ? ui.pilula("IA 24h ativa", "ok", { icone: "ia" })
        : cw.ia_ligada ? ui.pilula("IA ainda não validada", "aten", { icone: "ia" }) : ui.pilula("IA desligada", "neutra", { icone: "ia" });
    // plano 1000 · AS-128: mapa completo das situações; uma desconhecida não vira «conferidos»
    const explicacao = ultimo?.motivo || (cw.sync?.erro ? `Última sincronização: ${cw.sync.erro}` : explicacaoSituacaoCodeWords(rotulo));
    const aviso = c.ultimo_erro && /^status incerto/i.test(String(c.ultimo_erro)) ? null : c.ultimo_erro;
    const hist = historicoDoCartao(c, rotulo, cor);
    return h("article", { class: "cartao cfg-canal cfg-cw-card", dataset: { tom: cor, estado: c.estado || null } },
      h("div", { class: "cfg-cw-main" },
        h("div", { class: "cfg-cw-titulo" }, h("h3", { class: "titulo-sec" }, c.nome), statusVivo(rotulo, cor), ui.pilula("CodeWords", "info")),
        progresso(pr.passos),
        h("div", { class: "cfg-canal-kv" },
          h("span", null, "Número ", h("b", null, c.numero_exibicao || cw.numero || "—")),
          // plano 1000b · CB-103: «Configurado» em português; o id cru do fluxo fica no title (dado técnico)
          h("span", null, "Fluxo de IA ", h("b", { title: cw.service_id ? `Fluxo: ${cw.service_id}` : null }, cw.service_id ? "Configurado" : "Ainda não configurado")),
          h("span", null, "Departamento ", h("b", null, depNome(c.departamento_id)))),
        h("div", { class: "cfg-checks" },
          cw.tem_api_key ? ui.pilula("Chave salva", "ok", { icone: "cadeado" }) : ui.pilula("Chave ausente", "ruim"),
          resumoRota,
          cw.sync?.em ? pilulaSync(cw.sync) : null),
        h("p", { class: "sub cfg-cw-status-text" }, explicacao),
        linhaDesde(c, hist.servidor ? hist.lista : null),
        aviso ? h("div", { class: "aviso aviso-aten cfg-erro" }, ui.icone("info"), h("p", null, aviso)) : null,
        blocoContadores(c),
        blocoHistorico(hist.lista, { servidor: hist.servidor })),
      h("div", { class: "cfg-canal-acoes cfg-cw-card-actions" }, conectar, atualizar, mais));
  }

  /* ---------------- assistente do número CodeWords (M33): 5 passos, um primário por vez
     1 Chave salva → 2 Parear o aparelho → 3 Conferir o recebimento → 4 Quem atende (IA ou direto) → 5 Mensagem de teste.
     O passo atual é o 1º que o servidor ainda não confirmou (L.passosCodeWords); os feitos ficam recolhidos com ✓ e "Refazer".
     Nos passos 2 e 3 o estado do aparelho é consultado a cada ~5 s. As ações e RPCs são as de sempre; só a ordem e a hierarquia mudaram. */
  async function assistenteCodeWords(canal) {
    const L = await logica(ctx);
    let atual = canal ? { ...canal, codewords: { ...(canal.codewords || {}) } } : null;
    let modalApi = null;   // o link «Abrir Automações» fecha o modal antes de navegar (e pergunta antes, se há algo sem salvar)
    let formInicial = null;   // o que o formulário tinha ao abrir (ou ao salvar): serve para saber se há alteração perdível
    const formAlterado = () => formInicial !== null && JSON.stringify(ui.lerForm(form)) !== formInicial;
    const cw = atual?.codewords || {};
    let estadoVivo = null, testeEnviado = false, testeChegou = false, aguardandoCodigo = false, expandido = null, polling = null, desdePolling = 0, fechado = false;
    const corpo = h("div", { class: "pilha cfg-cw-config" });
    const form = h("form", { class: "pilha", novalidate: true });

    /* ---- campos (todos dentro do MESMO form: ui.lerForm enxerga o assistente inteiro) */
    const chaveWrap = semGerenciadorDeSenha(ui.campo({ rotulo: "Chave da API CodeWords", nome: "codewords_api_key", tipo: "senha", autocomplete: "off",
      placeholder: "cwk-…", ajuda: "Chave reutilizável do plano pago. Ela é enviada ao servidor e nunca volta para esta tela." }));
    const chave = chaveWrap.querySelector('input[name="codewords_api_key"]');
    const chaveSalva = h("div", { class: "cfg-cw-key-state" },
      atual?.codewords?.tem_api_key ? ui.pilula("Chave salva com segurança", "ok", { icone: "cadeado" }) : ui.pilula("Adicione sua chave para começar", "aten"));
    const trocarChave = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Trocar chave");
    if (atual?.codewords?.tem_api_key) chaveWrap.hidden = true;
    trocarChave.hidden = !atual?.codewords?.tem_api_key;
    trocarChave.addEventListener("click", () => { chaveWrap.hidden = false; trocarChave.hidden = true; chave.focus(); });
    const campos = h("div", { class: "grade-2 cfg-cw-grid" },
      ui.campo({ rotulo: "Nome do canal", nome: "nome", valor: atual?.nome || "WhatsApp via CodeWords", max: 40, obrigatorio: true }),
      ui.campo({ rotulo: "Número do WhatsApp", nome: "numero_exibicao", tipo: "tel", valor: atual?.numero_exibicao || cw.numero || "", max: 30, placeholder: "+55 12 99999-9999", obrigatorio: true }));
    const campoDep = (base?.departamentos || []).length ? ui.campo({ rotulo: "Conversas novas caem em", nome: "departamento_id", tipo: "select",
      valor: atual?.departamento_id || (base.departamentos.find(d => d.padrao) || base.departamentos[0]).id,
      opcoes: base.departamentos.map(d => ({ valor: d.id, rotulo: d.nome })) }) : null;
    const campoService = ui.campo({ rotulo: "Service ID do fluxo de IA", nome: "codewords_service_id", valor: cw.service_id || "", max: 120, autocomplete: "off",
      ajuda: "O identificador do fluxo do agente no CodeWords. Necessário para a IA atender." });
    const inpService = campoService.querySelector('input[name="codewords_service_id"]');
    // aparece depois de copiar o prompt: diz o que colar aqui na volta do CodeWords
    const dicaService = h("p", { class: "sub", role: "status", hidden: true }, "Prompt copiado. Quando o CodeWords terminar de publicar o fluxo, cole aqui o Service ID que ele mostrar.");
    const dicaFluxoId = `cfg-cw-fluxo-${Math.random().toString(36).slice(2, 7)}`;
    const dicaFluxo = h("p", { class: "sub", id: dicaFluxoId }, "Para ligar, cole antes o Service ID no campo do item 2.");
    const campoIA =ui.campo({ rotulo: "IA atendendo 24h", nome: "ia_ligada", tipo: "interruptor",
      valor: cw.rota === "direta" ? false : (cw.ia_ligada ?? atual?.ia_ligada ?? true),
      ajuda: "Quando desligada, o fluxo não responde automaticamente por este número." });
    const campoVolta = ui.campo({ rotulo: "A IA volta automaticamente após", nome: "ia_volta_horas", tipo: "select", valor: String(cw.ia_volta_horas ?? 6),
      opcoes: [{ valor: "1", rotulo: "1 hora" }, { valor: "2", rotulo: "2 horas" }, { valor: "4", rotulo: "4 horas" }, { valor: "6", rotulo: "6 horas" }, { valor: "8", rotulo: "8 horas" }, { valor: "12", rotulo: "12 horas" }, { valor: "24", rotulo: "24 horas" }, { valor: "48", rotulo: "48 horas" }, { valor: "72", rotulo: "72 horas" }, { valor: "168", rotulo: "7 dias" }, { valor: "0", rotulo: "Somente quando a equipe devolver" }] });

    /* ---- peças de cada passo */
    const situacao = h("span", { class: "cfg-cw-situacao" });
    const bAtualizar = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Atualizar situação");
    const statusAtual = h("div", { class: "cfg-cw-resultado", role: "status", "aria-live": "polite" });
    const codigoPareamento = h("section", { class: "cfg-cw-pair", hidden: true });
    const receitaBox = h("section", { class: "cfg-cw-receita", hidden: true });
    const resultadoTeste = h("div", { class: "cfg-cw-resultado", role: "status", "aria-live": "polite" });

    const ajuda = (resumo, texto) => h("details", { class: "cfg-ajuda" }, h("summary", null, resumo), h("p", { class: "sub" }, texto));

    const bSalvar = h("button", { type: "button", class: "bt bt-prim" }, "Salvar e continuar");
    const bParear = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("whatsapp"), "Gerar código de pareamento");
    const bJaPareei = h("button", { type: "button", class: "bt bt-fant" }, "Já digitei o código");
    const bConferir = h("button", { type: "button", class: "bt bt-prim" }, "Conferir agora");
    const bFluxo = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("ia"), "Ligar o número na IA");
    const bPrompt = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("copiar"), "Copiar prompt para o CodeWords");
    const bPrefs = h("button", { type: "button", class: "bt bt-fant" }, "Só salvar as preferências");
    const bDireto = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("usuario"), "Receber direto no Órbita");
    const bTeste = h("button", { type: "button", class: "bt bt-prim" }, "Enviar mensagem de teste");

    const linkAutomacoes = ctx.temModulo("automacoes") && ctx.pronto("automacoes") && ctx.pode("supervisor")
      ? h("a", { class: "rel-link", href: "#/automacoes", on: { click: async ev => {
        ev.preventDefault();
        if (formAlterado() && !await ui.confirmar({ titulo: "Sair sem salvar?", texto: "As alterações deste número ainda não foram salvas e vão se perder. Salve antes, se quiser mantê-las.",
          rotulo: "Sair sem salvar", perigo: true })) return;
        if (modalApi) modalApi.fechar(null);
        ctx.navegar("#/automacoes");
      } } }, "Abrir Automações")
      : null;

    const corpoPasso = {
      chave: h("div", { class: "pilha" },
        ajuda("Onde encontro a chave?", "É a chave reutilizável (cwk-…) da sua conta paga no CodeWords. Cole uma vez: ela fica guardada com segurança e nunca volta para esta tela."),
        campos, campoDep, chaveSalva, h("div", { class: "linha cfg-cw-key-row" }, trocarChave), chaveWrap, h("div", { class: "linha" }, bSalvar)),
      parear: h("div", { class: "pilha" },
        ajuda("Como digito o código?", "No celular do número: WhatsApp → Aparelhos conectados → Conectar um aparelho → Conectar com número de telefone, e digite o código que aparece aqui."),
        codigoPareamento, h("div", { class: "linha" }, bParear, bJaPareei)),
      conferir: h("div", { class: "pilha" },
        ajuda("O que é conferir?", "Confirmamos que o aparelho pareado é o número deste canal. Se o celular estiver sem internet, a conferência demora — a tela consulta sozinha a cada poucos segundos."),
        statusAtual, h("div", { class: "linha" }, bConferir)),
      destino: h("div", { class: "cfg-cw-escolha" },
        h("section", { class: "cartao cfg-cw-ia" },
          h("div", { class: "cfg-cw-ia-head" }, ui.icone("ia"), h("div", null, h("h4", { class: "titulo-sec" }, "A IA atende primeiro"),
            h("p", { class: "sub" }, "O CodeWords conversa, agenda e chama a equipe quando precisa; a equipe pode assumir qualquer conversa a qualquer momento."),
            h("p", { class: "sub" }, "Mover de etapa, notas e follow-ups são as Automações do Órbita. As receitas de IA nascem desligadas: ligue-as em Automações. ", linkAutomacoes))),
          // a ordem de quem configura: 1º leva o prompt ao CodeWords, 2º traz de lá o Service ID, 3º liga o número
          h("p", { class: "sub" }, h("strong", null, "1. "), "Copie o prompt, cole no CodeWords e peça para publicar o fluxo."),
          h("div", { class: "linha" }, bPrompt), receitaBox,
          h("p", { class: "sub" }, h("strong", null, "2. "), "Cole abaixo o Service ID que o CodeWords mostrar quando terminar."),
          dicaService, campoService, campoIA, campoVolta, h("p", { class: "sub" }, "Esse prazo começa quando alguém da equipe assume uma conversa."),
          h("p", { class: "sub" }, h("strong", null, "3. "), "Ligue o número na IA. É o Órbita que faz essa ligação: no CodeWords não precisa mexer em nada."),
          h("div", { class: "linha cfg-cw-ops-actions" }, bFluxo, bPrefs), dicaFluxo),
        h("section", { class: "cartao cfg-cw-direto" },
          h("div", { class: "cfg-cw-ia-head" }, ui.icone("usuario"), h("div", null, h("h4", { class: "titulo-sec" }, "A equipe atende"),
            h("p", { class: "sub" }, "As mensagens chegam direto na caixa Conversas do Órbita, sem IA no meio."))),
          h("div", { class: "linha" }, bDireto))),
      teste: h("div", { class: "pilha" },
        h("p", { class: "sub" }, `O Órbita manda uma mensagem real para o próprio número conectado (${atual?.numero_exibicao || cw.numero || "o número deste canal"}). Confira no celular.`),
        h("div", { class: "linha" }, bTeste), resultadoTeste),
    };

    /* ---- o esqueleto do assistente: criado UMA vez (os campos mantêm o que foi digitado); desenharPassos só liga/desliga e troca textos */
    const lista = h("ol", { class: "cfg-steps" });
    const passosEl = new Map();
    L.PASSOS_CODEWORDS.forEach((p, i) => {
      const num = h("span", { class: "cfg-step-n", "aria-hidden": "true" }, String(i + 1));
      const status = h("span", { class: "cfg-step-st" });
      const refazer = h("button", { type: "button", class: "bt bt-fant bt-p cfg-step-refazer" }, "Refazer");
      refazer.addEventListener("click", () => { expandido = p.id; desenharPassos(); });
      const li = h("li", { class: "cfg-step", dataset: { passo: p.id } },
        h("div", { class: "cfg-step-cab" }, num, h("div", { class: "cfg-step-t" }, h("h3", { class: "cfg-step-h" }, p.rotulo), status), refazer),
        h("div", { class: "cfg-step-corpo" }, corpoPasso[p.id]));
      passosEl.set(p.id, { li, num, status, refazer, corpoEl: li.querySelector(".cfg-step-corpo") });
      lista.appendChild(li);
    });
    const fim = h("div", { class: "aviso aviso-ok", hidden: true, role: "status" }, ui.icone("check"),
      h("p", null, h("b", null, "Número pronto. "), "As mensagens deste WhatsApp já chegam e saem pelo Órbita."));
    form.append(h("div", { class: "cfg-cw-topo" }, situacao, bAtualizar), lista, fim);
    formInicial = JSON.stringify(ui.lerForm(form));
    corpo.append(form);

    function desenharPassos() {
      if (fechado) return;
      const P = L.passosCodeWords({ canal: atual, estado: estadoVivo, testeEnviado, testeChegou, aguardandoCodigo });
      const [rot, cor] = L.situacaoCodeWords(atual, estadoVivo);
      situacao.replaceChildren(ui.pilula(rot, cor, { icone: cor === "ok" ? "check" : cor === "ruim" ? "alerta" : "relogio" }));
      for (const p of P.passos) {
        const x = passosEl.get(p.id);
        x.li.dataset.estado = p.estado;
        x.num.textContent = p.feito ? "✓" : String(P.passos.indexOf(p) + 1);
        x.status.textContent = p.texto;
        const aberto = p.estado === "atual" || expandido === p.id;
        x.corpoEl.hidden = !aberto;
        x.refazer.hidden = !(p.feito && !aberto);
        if (p.estado === "atual") x.li.setAttribute("aria-current", "step"); else x.li.removeAttribute("aria-current");
      }
      fim.hidden = P.atual !== 6;
      ajustarPolling(P.atual);
    }

    /* ---- consulta do estado do aparelho (botão e, nos passos 2 e 3, sozinha a cada ~5 s) */
    function pararPolling() { clearInterval(polling); polling = null; }
    function ajustarPolling(passoAtual) {
      const precisa = !!atual?.id && !fechado && ((passoAtual === 2 && aguardandoCodigo) || passoAtual === 3);
      if (precisa && !polling) {
        desdePolling = Date.now();
        polling = setInterval(() => {
          if (!form.isConnected) { pararPolling(); return; }   // plano 1500c · CC-107: o modal saiu da tela (fechou por erro antes do fechado=true)
          if (document.hidden) return;
          if (Date.now() - desdePolling > 5 * 60000) { pararPolling(); statusAtual.textContent = "Parei de consultar sozinho. Toque em «Conferir agora» quando o celular estiver pronto."; return; }
          consultar({ silencioso: true });
        }, 5000);
      } else if (!precisa) pararPolling();
    }
    /** Depois de «Ligar na IA» / «Receber no Órbita»: a consulta ao aparelho que volta vazia (erro) não deixa a tela presa em «Conferindo…». */
    async function conferirDepoisDoPedido() {
      const r = await consultar();
      if (r || fechado) return r;
      statusAtual.textContent = "Não deu para conferir o aparelho agora. Toque em «Conferir agora» em instantes.";
      desenharPassos();
      return null;
    }
    async function consultar({ silencioso = false } = {}) {
      const antesSituacao = L.situacaoCodeWords(atual, estadoVivo)[0];
      const r = await acaoCodeWords("estado", {}, { silencioso });
      if (!r || fechado) return null;
      estadoVivo = r;
      estadosCodeWords.set(atual.id, r);
      statusAtual.textContent = r.inscrito_certo ? "Conectado e recebendo mensagens." : r.motivo || "Situação consultada.";
      if (r.pareado) { aguardandoCodigo = false; ui.limpar(codigoPareamento); codigoPareamento.hidden = true; }
      desenharPassos();
      if (!silencioso || L.situacaoCodeWords(atual, estadoVivo)[0] !== antesSituacao) carregar();     // a lista de trás só se refaz quando algo mudou
      return r;
    }

    /* ---- erro que diz o campo: o servidor chama o número de «numero»; a tela, de «numero_exibicao» */
    const CAMPO_DO_HINT = { numero: "numero_exibicao", departamento: "departamento_id", service_id: "codewords_service_id", api_key: "codewords_api_key" };
    const TEXTO_DO_CAMPO = {
      nome: "Informe o nome do canal (até 40 letras).",
      numero_exibicao: "Informe o número com DDI e DDD, ex.: +55 12 99999-9999",
      codewords_service_id: "Cole só o identificador do fluxo, sem a URL.",
      codewords_api_key: "Use uma chave reutilizável cwk- com pelo menos 20 caracteres.",
      departamento_id: "Escolha um departamento da lista.",
    };
    /** Marca o erro no campo e, se ele estiver num passo recolhido, abre o passo antes (senão o aviso fica escondido). Devolve false se o campo não existe na tela. */
    function erroNoCampo(nome, texto) {
      const el = form.querySelector(`[data-campo="${nome}"]`);
      if (!el) return false;
      const li = el.closest(".cfg-step");
      const x = li ? passosEl.get(li.dataset.passo) : null;
      if (x && x.corpoEl.hidden) { expandido = li.dataset.passo; desenharPassos(); }
      if (nome === "codewords_api_key" && chaveWrap.hidden) { chaveWrap.hidden = false; trocarChave.hidden = true; }
      ui.marcarErro(form, nome, texto || TEXTO_DO_CAMPO[nome] || "Confira este campo.");
      return true;
    }
    /** Erro do servidor que aponta um campo (hint): mostra no campo certo. Devolve true se tratou. */
    function erroDoServidorNoCampo(e) {
      const hint = e?.hint ? String(e.hint) : "";
      const nome = CAMPO_DO_HINT[hint] || hint;
      if (!nome || !/^[a-z_]+$/.test(nome)) return false;
      if (e?.codigo === "dados_invalidos") return erroNoCampo(nome);
      if (e?.codigo === "numero_em_uso") return erroNoCampo(nome, "Esse número já está conectado em outro canal ou em outra empresa.");
      return false;
    }

    async function salvarConfiguracao({ silencioso = false } = {}) {
      const d = ui.lerForm(form); ui.marcarErro(form, null);
      if (!d.nome) { erroNoCampo("nome", "Informe o nome do canal."); return false; }
      const num = normalizarNumeroCanal(d.numero_exibicao);   // plano 1000 · AS-126: sem DDI o pareamento acusava «número diferente» depois
      if (!num.ok) { erroNoCampo("numero_exibicao", num.erro); return false; }
      d.numero_exibicao = num.numero;
      const apiKey = String(d.codewords_api_key || "").trim();
      if (!atual?.id && !apiKey) { erroNoCampo("codewords_api_key", "Cole a chave reutilizável do plano pago."); return false; }
      if (apiKey && (apiKey.length < 20 || !apiKey.startsWith("cwk-") || /\s/.test(apiKey))) { erroNoCampo("codewords_api_key"); return false; }
      // a mesma regra do servidor: quem cola a URL do fluxo no lugar do identificador fica sabendo aqui
      if (d.codewords_service_id && !/^[A-Za-z0-9_-]{1,120}$/.test(String(d.codewords_service_id))) { erroNoCampo("codewords_service_id"); return false; }
      const payload = { nome: d.nome, numero_exibicao: d.numero_exibicao,
        departamento_id: d.departamento_id || null, ia_ligada: !!d.ia_ligada, ia_volta_horas: Number(d.ia_volta_horas ?? 6) };
      if (atual?.id) payload.id = atual.id;
      if (d.codewords_service_id) payload.codewords_service_id = d.codewords_service_id;
      if (apiKey) payload.codewords_api_key = apiKey;
      try {
        const r = await ctx.api.rpcC("nx_codewords_canal_salvar", { p_canal: payload });
        const id = r?.canal?.id || r?.canal?.canal_id || atual?.id;
        chave.value = "";
        formInicial = JSON.stringify(ui.lerForm(form));   // salvo: nada mais a perder
        const listaNova = await ctx.api.rpcC("nx_canais_listar");
        canais = Array.isArray(listaNova) ? listaNova : listaNova?.canais || canais;
        atual = canais.find(x => x.id === id) || { ...(atual || {}), id, nome: d.nome,
          numero_exibicao: d.numero_exibicao, departamento_id: d.departamento_id || null,
          codewords: { ...(atual?.codewords || {}), tem_api_key: !!apiKey || !!atual?.codewords?.tem_api_key,
            service_id: d.codewords_service_id || atual?.codewords?.service_id || null, ia_ligada: !!d.ia_ligada,
            ia_volta_horas: Number(d.ia_volta_horas ?? 6) } };
        if (apiKey) { chaveSalva.replaceChildren(ui.pilula("Chave salva com segurança", "ok", { icone: "cadeado" })); chaveWrap.hidden = true; trocarChave.hidden = false; }
        ui.limpar(codigoPareamento); codigoPareamento.hidden = true;
        ui.limpar(receitaBox); receitaBox.hidden = true; dicaService.hidden = true;
        if (expandido === "chave") expandido = null;
        desenharPassos();
        carregar();
        if (!silencioso) ui.toast("Número e preferências salvos.", { tipo: "ok" });
        return true;
      } catch (e) {
        if (erroDoServidorNoCampo(e)) return false;
        ui.toast(ui.mensagemErro(e), { tipo: "erro" });
        return false;
      }
    }

    async function guardarAntesDaAcao() {
      if (!await salvarConfiguracao({ silencioso: true })) return false;
      return true;
    }
    async function acaoCodeWords(acao, payload = {}, { silencioso = false } = {}) {
      if (!atual?.id) { if (!silencioso) ui.toast("Salve o número antes de continuar.", { tipo: "info" }); return null; }
      try {
        const r = await ctx.api.fn("nx-codewords", { acao, canal: atual.id, ...payload });
        if (!r?.ok) throw Object.assign(new Error(r?.detalhe || r?.erro || "A ação não foi concluída."), { detalhe_texto: r?.detalhe || r?.erro });
        return r;
      } catch (e) {
        // falta um dado da tela (ex.: Service ID para ligar na IA): o aviso vai no campo, não num toast genérico
        if (!silencioso && !erroDoServidorNoCampo(e)) ui.toast(erroFuncao(e), { tipo: "erro" });
        return null;
      }
    }

    bSalvar.addEventListener("click", async () => { await ui.carregando(bSalvar, salvarConfiguracao()); });
    bAtualizar.addEventListener("click", async () => {
      if (!atual?.id) { ui.toast("Salve o número antes de continuar.", { tipo: "info" }); return; }
      const r = await ui.carregando(bAtualizar, consultar());
      if (r) ui.toast(r.inscrito_certo ? "WhatsApp conectado e recebendo pelo destino configurado." : r.motivo || "Situação atualizada.", { tipo: r.inscrito_certo ? "ok" : "info" });
    });
    bConferir.addEventListener("click", async () => { await ui.carregando(bConferir, consultar()); });
    bJaPareei.addEventListener("click", async () => { await ui.carregando(bJaPareei, consultar()); });
    let relogioParear = null;
    const rotuloParear = bParear.lastChild && bParear.lastChild.nodeType === 3 ? bParear.lastChild : null;
    let relogioExpira = null;   // plano 1500c · CC-105
    function esperarNovoCodigo(seg) {   // CB-101: «Gerar outro código em 90 s» no botão até o servidor deixar
      clearInterval(relogioParear);
      let resta = seg;
      const pintar = () => { if (rotuloParear) rotuloParear.textContent = resta > 0 ? `Gerar outro código em ${resta} s` : "Gerar outro código"; bParear.disabled = resta > 0; };
      pintar();
      relogioParear = setInterval(() => { resta--; if (!bParear.isConnected || resta <= 0) { clearInterval(relogioParear); resta = Math.max(0, resta); } pintar(); }, 1000);
      if (relogioParear && typeof relogioParear.unref === "function") relogioParear.unref();   // (node dos testes: não segura o processo)
    }
    bParear.addEventListener("click", async () => {
      if (!await guardarAntesDaAcao()) return;
      const r = await acaoCodeWords("parear"); if (!r) return;
      const copiarCodigo = h("button", { type: "button", class: "bt bt-sec" }, ui.icone("copiar"), "Copiar código");
      // plano 1500c · CC-105: quanto falta para o código expirar (expira_em do servidor ou 3 min a partir de agora)
      const prazoCodigo = h("p", { class: "sub cfg-cw-prazo" }, "O código vale por poucos minutos; se expirar, gere outro.");
      const contarExpiracao = expira => {
        clearInterval(relogioExpira);
        const fim = Number.isFinite(Date.parse(expira || "")) ? Date.parse(expira) : Date.now() + 3 * 60000;
        const pintar = () => { const s = Math.max(0, Math.round((fim - Date.now()) / 1000)); prazoCodigo.textContent = s > 0 ? `O código expira em ${L.textoContagem(s)}. Se expirar, gere outro.` : "O código expirou: gere outro."; return s; };
        pintar();
        relogioExpira = setInterval(() => { if (!prazoCodigo.isConnected || pintar() <= 0) clearInterval(relogioExpira); }, 1000);
        if (relogioExpira && typeof relogioExpira.unref === "function") relogioExpira.unref();
      };
      copiarCodigo.addEventListener("click", () => ui.copiar(r.codigo, { aviso: "Código copiado. Digite-o no WhatsApp do número cadastrado." }));
      ui.limpar(codigoPareamento); codigoPareamento.hidden = false;
      codigoPareamento.append(h("p", { class: "rotulo" }, "Pareamento do WhatsApp"),
        // plano 1500c · CC-106: o leitor de tela lê letra por letra («A B C D 1 2 3 4»), não «mil duzentos e trinta e quatro»
        h("p", { class: "cfg-cw-code", "aria-label": `Código de pareamento: ${String(r.codigo || "").replace(/[\s-]/g, "").split("").join(" ")}` }, r.codigo),
        h("p", { class: "sub" }, r.instrucoes || "No WhatsApp do celular, abra Aparelhos conectados, escolha Conectar aparelho e depois Conectar com número de telefone."),
        // plano 1000b · CB-101: o código expira em poucos minutos e o servidor só gera outro depois de 90 s — a tela diz e conta
        prazoCodigo, copiarCodigo);
      contarExpiracao(r.expira_em);
      esperarNovoCodigo(90);
      aguardandoCodigo = true;
      desenharPassos();
    });
    bFluxo.addEventListener("click", async () => {
      const service = form.querySelector('[name="codewords_service_id"]')?.value.trim();
      if (!service) { ui.toast("Informe e salve o Service ID do fluxo de IA primeiro.", { tipo: "info" }); form.querySelector('[name="codewords_service_id"]')?.focus(); return; }
      const confirmado = await ui.confirmar({ titulo: "Ligar o número na IA?", rotulo: "Ligar na IA",
        texto: "O CodeWords encaminhará as mensagens deste WhatsApp ao fluxo de IA. Confirme que o aparelho pareado mostra o mesmo número e que o fluxo está publicado." });
      if (!confirmado) return;
      form.querySelector('[name="ia_ligada"]').checked = true;
      if (!await guardarAntesDaAcao()) return;
      const r = await acaoCodeWords("ligar_fluxo"); if (!r) return;
      // plano 1000 · AS-119: o CodeWords aceitou o pedido — mas «Conectado» só depois de perguntar ao aparelho (antes a tela inventava)
      atual = { ...atual, codewords: { ...atual.codewords, rota: "fluxo", service_id: service, ia_ligada: true } };
      expandido = null;
      statusAtual.textContent = "Conferindo o aparelho…";
      ui.toast("O CodeWords aceitou ligar o fluxo de IA. Conferindo o aparelho…", { tipo: "info" });
      await conferirDepoisDoPedido();
    });
    bDireto.addEventListener("click", async () => {
      const confirmado = await ui.confirmar({ titulo: "Receber mensagens direto no Órbita?", rotulo: "Receber no Órbita",
        texto: "O aparelho deixará de encaminhar mensagens ao fluxo externo de IA e passará a enviá-las diretamente para a caixa Conversas do Órbita." });
      if (!confirmado) return;
      form.querySelector('[name="ia_ligada"]').checked = false;
      if (!await guardarAntesDaAcao()) return;
      const r = await acaoCodeWords("receber_aqui"); if (!r) return;
      // plano 1000 · AS-119: o estado real vem do aparelho, não do pedido aceito
      atual = { ...atual, codewords: { ...atual.codewords, rota: "direta", ia_ligada: false } };
      expandido = null;
      statusAtual.textContent = "Conferindo o aparelho…";
      ui.toast("O CodeWords aceitou o recebimento direto. Conferindo o aparelho…", { tipo: "info" });
      await conferirDepoisDoPedido();
    });
    bPrefs.addEventListener("click", async () => { await ui.carregando(bPrefs, salvarConfiguracao()); });
    bTeste.addEventListener("click", async () => {
      const confirmado = await ui.confirmar({ titulo: "Enviar uma mensagem de teste?", rotulo: "Enviar teste",
        texto: `Será enviada uma mensagem real pelo CodeWords para o número conectado (${atual?.numero_exibicao || cw.numero || "este canal"}).` });
      if (!confirmado || !await guardarAntesDaAcao()) return;
      const r = await acaoCodeWords("enviar_teste"); if (!r) return;
      testeEnviado = true;
      ui.limpar(resultadoTeste);
      const chegou = h("button", { type: "button", class: "bt bt-prim bt-p" }, ui.icone("check"), "Sim, chegou");
      const naoChegou = h("button", { type: "button", class: "bt bt-fant bt-p" }, "Ainda não chegou");
      chegou.addEventListener("click", () => { testeChegou = true; marcarTesteNoChecklist(); ui.limpar(resultadoTeste); desenharPassos(); ui.toast("Tudo pronto: o número está recebendo e enviando.", { tipo: "ok" }); });
      naoChegou.addEventListener("click", () => { ui.limpar(resultadoTeste); resultadoTeste.append(h("p", { class: "sub" }, "Confira se o celular do número está com internet e o WhatsApp aberto, depois envie de novo. Se continuar, volte ao passo 3 e toque em «Conferir agora».")); });
      resultadoTeste.append(ui.pilula("Enviada", "ok", { icone: "check" }) /* plano 1000b · CB-099: sem ✓ no texto (o leitor lia «marca de verificação») */, h("span", { class: "sub" }, "Chegou no WhatsApp do número conectado?"), chegou, naoChegou);
      desenharPassos();
      ui.toast("O CodeWords aceitou o teste. Confira o WhatsApp do número conectado.", { tipo: "ok" });
    });
    // «Ligar o número na IA» só acende com o Service ID preenchido (antes o clique sem ID só soltava um aviso)
    const ajustarFluxo = () => {
      const falta = !inpService.value.trim();
      bFluxo.disabled = falta;
      bFluxo.title = falta ? "Cole antes o Service ID que o CodeWords mostrar." : "";
      if (falta) bFluxo.setAttribute("aria-describedby", dicaFluxoId); else bFluxo.removeAttribute("aria-describedby");
      dicaFluxo.hidden = !falta;
    };
    inpService.addEventListener("input", ajustarFluxo);
    ajustarFluxo();

    bPrompt.addEventListener("click", () => {
      if (bPrompt.disabled) return;
      // salva e busca o prompt DENTRO do clique: a cópia recebe a promessa do texto ainda no gesto (Safari/iPhone recusam copiar depois de esperar)
      const receita = (async () => {
        if (!await guardarAntesDaAcao()) return null;
        const r = await acaoCodeWords("receita");
        return r ? String(r.prompt || "") : null;
      })();
      const textoPronto = receita.then(t => { if (!t) throw new Error("sem_prompt"); return t; });
      textoPronto.catch(() => { /* sem prompt: o aviso do erro já saiu */ });
      const copiando = typeof ui.copiarDepois === "function"
        ? ui.copiarDepois(textoPronto, { aviso: null })
        : textoPronto.then(t => ui.copiar(t, { aviso: null }));
      // o botão fica travado (aria-busy) até terminar: sem clique duplo, sem dois salvamentos
      ui.carregando(bPrompt, (async () => {
        dicaService.hidden = true;
        const texto = await receita;
        const ok = await Promise.resolve(copiando).then(v => v === true, () => false);
        if (texto) mostrarPrompt(texto, ok);
        else if (texto === "") ui.toast("O prompt veio vazio. Tente de novo em instantes.", { tipo: "erro" });
      })()).catch(e => console.error("copiar prompt", e));
    });

    /** A caixa do prompt (fica à mão para copiar de novo) com o resultado da 1ª cópia, que já aconteceu no clique. */
    function mostrarPrompt(texto, copiou) {
      // plano 1000 · AS-134: o prompt traz a URL secreta — borrado até «Mostrar» (copiar e selecionar funcionam sem revelar)
      const pre = h("pre", { class: "cfg-codigo cfg-cw-prompt", tabindex: "0", "aria-label": "Prompt de configuração do CodeWords (escondido)", dataset: { oculto: "1" } }, h("code", {}, texto));
      const mostrar = h("button", { type: "button", class: "bt bt-fant bt-p cfg-mostrar-prompt", "aria-pressed": "false" }, ui.icone("olho"), h("span", null, "Mostrar"));
      mostrar.addEventListener("click", () => {
        const ver = pre.dataset.oculto === "1";
        pre.dataset.oculto = ver ? "0" : "1";
        mostrar.setAttribute("aria-pressed", String(ver));
        mostrar.lastChild.textContent = ver ? "Esconder" : "Mostrar";
        pre.setAttribute("aria-label", `Prompt de configuração do CodeWords${ver ? "" : " (escondido)"}`);
      });
      // deixa o texto inteiro selecionado: se o navegador bloquear a área de transferência, basta Ctrl+C (ou «Copiar» no menu do celular)
      const selecionarTudo = () => {
        try {
          const faixa = document.createRange(); faixa.selectNodeContents(pre);
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(faixa); pre.focus({ preventScroll: true });
        } catch { /* sem seleção: o texto continua visível para copiar à mão */ }
      };
      const estado = h("p", { class: "sub", role: "status" });
      const rotuloCopiar = h("span", null, "Copiar prompt");
      const copiar = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("copiar"), rotuloCopiar);
      /** Mostra o que aconteceu com a cópia; o botão só vira «Copiar de novo» quando alguma cópia deu certo. */
      const mostrarResultado = ok => {
        if (ok) {
          rotuloCopiar.textContent = "Copiar de novo";
          estado.textContent = "Prompt copiado. Agora é só colar no CodeWords.";
          dicaService.hidden = false;
          ui.toast("Prompt copiado. Cole no CodeWords e mantenha a URL secreta privada.", { tipo: "ok" });
          // a volta do CodeWords é por aqui: o foco já espera no campo do Service ID (rolagem mínima, a caixa do prompt segue à vista)
          try { inpService.focus({ preventScroll: true }); campoService.scrollIntoView({ block: "nearest", behavior: ui.comportamentoRolagem() }); } catch { /* navegador antigo */ }
        } else {
          try { receitaBox.scrollIntoView({ block: "nearest", behavior: ui.comportamentoRolagem() }); } catch { /* navegador antigo */ }
          selecionarTudo();
          estado.textContent = "O navegador não deixou copiar sozinho. Toque em «Copiar prompt» aqui embaixo; se não funcionar, o texto já está selecionado: aperte Ctrl+C.";
          ui.toast("Não deu para copiar sozinho. Toque em «Copiar prompt».", { tipo: "erro" });
        }
      };
      // aqui o texto já está na memória: a cópia sai direto no toque, em qualquer navegador
      copiar.addEventListener("click", async () => mostrarResultado(await ui.copiar(texto, { aviso: null })));
      const selecionar = h("button", { type: "button", class: "bt bt-sec" }, "Selecionar tudo");
      selecionar.addEventListener("click", selecionarTudo);
      ui.limpar(receitaBox); receitaBox.hidden = false;
      receitaBox.append(h("div", { class: "aviso aviso-aten" }, ui.icone("cadeado"), h("p", null, "O prompt contém a URL secreta deste canal. Cole somente no CodeWords e não compartilhe o texto.")),
        estado, h("div", { class: "linha" }, copiar, selecionar, mostrar), pre);
      mostrarResultado(copiou);
    }

    desenharPassos();
    // número já salvo: confere o aparelho ao abrir (os passos recolhem sozinhos o que já está pronto)
    if (atual?.id && atual.codewords?.tem_api_key) consultar({ silencioso: true });

    await ui.modal({
      titulo: atual ? `WhatsApp CodeWords · ${atual.nome}` : "Adicionar WhatsApp pelo CodeWords",
      corpo, largura: "g", fecharFora: false, aoAbrir: api => { modalApi = api; },
      // plano 1000 · AS-245: «Fechar» com campos editados e não salvos pergunta antes (o mesmo critério do link «Abrir Automações»)
      acoes: [{ rotulo: "Fechar", tipo: "neutro", fn: async () => {
        if (formAlterado() && !await ui.confirmar({ titulo: "Fechar sem salvar?", rotulo: "Fechar sem salvar", perigo: true,
          texto: "As alterações deste número ainda não foram salvas e vão se perder. Use «Salvar e continuar» ou «Só salvar as preferências» antes, se quiser mantê-las." })) return false;
        return null;
      } }],
    });
    fechado = true;
    pararPolling();
  }

  /* ---------------- assistente em 5 passos */
  async function assistente(canal, passoInicial = 1) {
    let passo = passoInicial;
    let mudou = false;             // plano 1000 · AS-139: a lista de trás só recarrega UMA vez, ao fechar, e só se algo mudou
    let atual = canal;             // canal salvo (depois do passo 2)
    let webhook = canal ? canal.webhook : null;
    const corpo = h("div", { class: "pilha" });
    const trilha = h("div", { class: "cfg-passos", "aria-hidden": "true" }, [1, 2, 3, 4, 5].map(() => h("span", { class: "cfg-passo" })));
    const conteudo = h("div", { class: "pilha" });
    corpo.append(trilha, conteudo);
    let form = null;

    function marcarTrilha() { [...trilha.children].forEach((s, i) => { s.dataset.feito = i < passo ? "1" : "0"; }); }
    // plano 1000b · CB-102: a trilha é aria-hidden — o título diz «Passo 2 de 5 · Dados do número» e a troca de passo é anunciada
    const NOMES_PASSO = ["O que é preciso", "Dados do número", "Webhook", "Inscrever o app", "Testar"];
    const tituloPasso = (n, nome) => `Passo ${n} de 5 · ${nome}`;
    let passoAnunciado = passoInicial;
    function anunciarPasso() {
      if (passo === passoAnunciado) return;
      passoAnunciado = passo;
      if (typeof ui.anunciar === "function") ui.anunciar(tituloPasso(passo, NOMES_PASSO[passo - 1] || ""));
    }

    function copia(rot, valor, id) {
      const inp = h("input", { id, type: "text", readonly: true, value: valor || "", class: "mono" });
      inp.addEventListener("focus", () => inp.select());
      return h("div", { class: "campo" }, h("label", { for: id }, rot),
        h("div", { class: "cfg-copia" }, inp, h("button", { type: "button", class: "bt bt-sec", on: { click: () => ui.copiar(valor, { aviso: `${rot} copiado.` }) } }, ui.icone("copiar"), "Copiar")));
    }

    function desenharPasso(api) {
      marcarTrilha();
      anunciarPasso();
      ui.limpar(conteudo);
      const prim = api && api.el.querySelector(".modal-rod [data-tipo=primario]");
      const volta = api && api.el.querySelector(".modal-rod [data-tipo=neutro]");
      if (prim) prim.textContent = passo === 2 ? (canal && passoInicial === 2 ? "Salvar" : "Salvar e continuar") : passo === 5 || (canal && passoInicial === 3 && passo === 3) ? "Concluir" : "Continuar";
      if (volta) volta.textContent = passo > 1 && !(canal && passo === passoInicial) ? "Voltar" : "Fechar";
      if (passo === 1) {
        conteudo.append(h("h3", { class: "titulo-sec" }, tituloPasso(1, "O que é preciso")),
          h("ol", { class: "cfg-lista-req" },
            h("li", null, "Acesso ao Meta Business da empresa, com um app que tenha o produto WhatsApp."),
            h("li", null, "Um número dedicado (ou migrado) para a API oficial."),
            h("li", null, "Um token permanente de usuário do sistema com as permissões whatsapp_business_messaging e whatsapp_business_management."),
            h("li", null, "O Phone number ID e o WhatsApp Business Account ID (WABA), que aparecem em WhatsApp → Configuração da API.")),
          // plano 1000 · AS-287: em qual tela da Meta fica cada dado
          h("ul", { class: "cfg-lista-req cfg-onde-meta" },
            h("li", null, h("b", null, "Token: "), h("a", { href: "https://business.facebook.com/settings/system-users", target: "_blank", rel: "noopener noreferrer" }, "business.facebook.com"),
              " → Configurações do negócio → Usuários → Usuários do sistema → Gerar novo token."),
            h("li", null, h("b", null, "Phone number ID e WABA: "), h("a", { href: "https://developers.facebook.com/apps/", target: "_blank", rel: "noopener noreferrer" }, "developers.facebook.com"),
              " → Meus apps → o seu app → WhatsApp → Configuração da API.")),
          h("div", { class: "aviso aviso-aten" }, ui.icone("alerta"),
            h("p", null, h("b", null, "Atenção: "), "o número conectado por este caminho deixa de funcionar no aplicativo WhatsApp do celular. Para usar os dois ao mesmo tempo (coexistência) é preciso outro tipo de conexão — fale com o suporte.")));
      } else if (passo === 2) {
        const deps = (base && base.departamentos) || [];
        form = h("form", { class: "pilha", novalidate: true },
          h("h3", { class: "titulo-sec" }, tituloPasso(2, "Dados do número")),
          h("div", { class: "grade-2" },
            ui.campo({ rotulo: "Nome na central", nome: "nome", valor: atual ? atual.nome : "WhatsApp", obrigatorio: true, max: 40, ajuda: "Ex.: Recepção, Comercial" }),
            ui.campo({ rotulo: "Número (como aparece)", nome: "numero_exibicao", valor: atual ? atual.numero_exibicao : "", max: 30, placeholder: "(12) 99999-9999", validar: "telefone" }),
            ui.campo({ rotulo: "Phone number ID", nome: "phone_number_id", valor: atual ? atual.phone_number_id : "", obrigatorio: true, inputmode: "numeric", autocomplete: "off" }),
            ui.campo({ rotulo: "WhatsApp Business Account ID (WABA)", nome: "waba_id", valor: atual ? atual.waba_id : "", obrigatorio: true, inputmode: "numeric", autocomplete: "off" })),
          semGerenciadorDeSenha(ui.campo({ rotulo: "Token permanente", nome: "token", tipo: "senha", autocomplete: "off",
            placeholder: atual && atual.tem_token ? "✓ preenchido — deixe em branco para manter" : "EAAG…",
            ajuda: "Fica guardado no cofre criptografado. Nunca é mostrado de novo." })),
          semGerenciadorDeSenha(ui.campo({ rotulo: "App secret (opcional)", nome: "app_secret", tipo: "senha", autocomplete: "off",
            placeholder: atual && atual.tem_app_secret ? "✓ preenchido — deixe em branco para manter" : "Só se o app da Meta for da sua empresa",
            ajuda: "Sem ele, o número usa o app da plataforma e o suporte cuida do webhook." })),
          deps.length ? ui.campo({ rotulo: "Conversas novas caem em", nome: "departamento_id", tipo: "select", valor: atual ? atual.departamento_id : (deps.find(d => d.padrao) || deps[0]).id,
            opcoes: deps.map(d => ({ valor: d.id, rotulo: d.nome })) }) : null);
        conteudo.appendChild(form);
      } else if (passo === 3) {
        const w = webhook || {};
        conteudo.append(h("h3", { class: "titulo-sec" }, tituloPasso(3, "Webhook")));
        if (w.modo === "proprio") {
          conteudo.append(h("p", { class: "sub" }, "No Meta Developers, abra o app → WhatsApp → Configuração → Webhook. Cole a URL e o token abaixo, clique em Verificar e salvar e assine o campo «messages»."),
            h("div", { class: "cfg-webhook" }, copia("URL de retorno", w.url, "cfg-wh-url"), copia("Token de verificação", w.verify_token, "cfg-wh-tok")));
        } else {
          conteudo.append(h("div", { class: "aviso" }, ui.icone("info"),
            h("p", null, w.texto || "O webhook deste número é o do aplicativo da plataforma. Peça ao suporte para inscrever o app na WABA.")),
            h("p", { class: "sub" }, "Se preferir usar o app da sua empresa, volte e preencha o app secret."));
        }
      } else if (passo === 4) {
        const res = h("div", { class: "cfg-resultado", "aria-live": "polite" });
        const b = h("button", { type: "button", class: "bt bt-prim" }, "Inscrever o app na WABA");
        b.addEventListener("click", async () => {
          ui.limpar(res);
          try {
            const r = await ui.carregando(b, ctx.api.fn("nx-enviar", { acao: "inscrever_app", canal: atual.id }));
            mudou = true;
            res.appendChild(r && r.app_inscrito ? ui.pilula("App inscrito", "ok", { icone: "check" }) /* plano 1000b · CB-099 */ : ui.pilula("A Meta não confirmou a inscrição", "ruim"));
          } catch (e) { res.appendChild(h("p", { class: "sub" }, erroFuncao(e))); }
        });
        conteudo.append(h("h3", { class: "titulo-sec" }, tituloPasso(4, "Inscrever o app")),
          h("p", { class: "sub" }, "Sem a inscrição do app na conta do WhatsApp (WABA), a Meta não manda nenhuma mensagem para cá. Um clique resolve."),
          h("div", { class: "linha" }, b), res);
      } else if (passo === 5) {
        const res = h("div", { class: "cfg-resultado", "aria-live": "polite" });
        const bT = h("button", { type: "button", class: "bt bt-prim" }, "Testar conexão");
        const bS = h("button", { type: "button", class: "bt bt-sec" }, "Sincronizar modelos");
        bT.addEventListener("click", async () => {
          ui.limpar(res);
          try {
            const r = await ui.carregando(bT, ctx.api.fn("nx-enviar", { acao: "testar_canal", canal: atual.id }));
            testesMeta.set(atual.id, r || {});
            mudou = true;
            const avisoSecret = avisoAppSecret(atual, r);
            const q = qualidadeMeta(r && r.qualidade);
            // plano 1000 · AS-123: as pílulas dizem em palavras (a cor e o ícone da pílula já marcam ok/ruim)
            res.append(...[ui.pilula(r && r.numero ? `Número ${r.numero} respondeu` : "Número respondeu", "ok"),
              ui.pilula(r && r.app_inscrito ? "App inscrito" : "App não inscrito: as mensagens não chegam", r && r.app_inscrito ? "ok" : "ruim"),
              q ? ui.pilula(`Qualidade ${q.rotulo.toLowerCase()}`, q.tom) : null,      // AS-285: «Qualidade GREEN» virava código cru
              avisoSecret ? h("p", { class: "aviso aviso-aten cfg-aviso-secret" }, ui.icone("cadeado"), h("span", null, avisoSecret)) : null].filter(Boolean));
          } catch (e) { res.appendChild(h("p", { class: "sub" }, erroFuncao(e))); }
        });
        bS.addEventListener("click", async () => {
          try { const r = await ui.carregando(bS, ctx.api.fn("nx-enviar", { acao: "sincronizar_templates", canal: atual.id })); mudou = true; res.appendChild(ui.pilula(textoModelosSincronizados(r && r.total), "info")); }   // plano 1000b · CB-098
          catch (e) { res.appendChild(h("p", { class: "sub" }, erroFuncao(e))); }
        });
        conteudo.append(h("h3", { class: "titulo-sec" }, tituloPasso(5, "Testar")),
          h("p", { class: "sub" }, "O número só fica «Ativo» quando responde à Meta E o app está inscrito. Depois, mande um «oi» de outro celular para ver a conversa chegar."),
          h("div", { class: "linha" }, bT, bS), res);
      }
      if (passo !== 2) setTimeout(() => { const f = conteudo.querySelector("button, input"); if (f) f.focus(); }, 30);
    }

    let apiModal = null;
    await ui.modal({
      titulo: canal ? `Número ${canal.nome}` : "Conectar número de WhatsApp", corpo, largura: "m", fecharFora: false,
      aoAbrir: api => { apiModal = api; desenharPasso(api); },
      acoes: [
        { rotulo: "Fechar", tipo: "neutro", fn: () => {
          if (passo > 1 && !(canal && passo === passoInicial)) { passo--; if (passo === 2 && !atual) passo = 2; desenharPasso(apiModal); return false; }
          return null;
        } },
        { rotulo: "Continuar", tipo: "primario", fn: async api => {
          if (passo === 2) {
            const d = ui.lerForm(form);
            ui.marcarErro(form, null);
            if (!d.nome) { ui.marcarErro(form, "nome", "Dê um nome (ex.: Recepção)."); return false; }
            if (!/^\d{5,30}$/.test(String(d.phone_number_id || "").replace(/\s/g, ""))) { ui.marcarErro(form, "phone_number_id", "Só números, como aparece na Meta."); return false; }
            if (!/^\d{5,30}$/.test(String(d.waba_id || "").replace(/\s/g, ""))) { ui.marcarErro(form, "waba_id", "Só números, como aparece na Meta."); return false; }
            if (!atual && !d.token) { ui.marcarErro(form, "token", "Cole o token permanente."); return false; }
            // plano 1000 · AS-138: o número de exibição é conferido como telefone (com DDI), igual ao do CodeWords
            let numeroExib = null;
            if (String(d.numero_exibicao || "").trim()) {
              const num = normalizarNumeroCanal(d.numero_exibicao);
              if (!num.ok) { ui.marcarErro(form, "numero_exibicao", num.erro); return false; }
              numeroExib = num.numero;
            }
            const payload = { nome: d.nome, phone_number_id: d.phone_number_id, waba_id: d.waba_id, numero_exibicao: numeroExib };
            if (atual) payload.id = atual.id;
            if (d.token) payload.token = d.token;
            if (d.app_secret) payload.app_secret = d.app_secret;
            if (d.departamento_id) payload.departamento_id = d.departamento_id;
            try {
              const r = await ctx.api.rpcC("nx_canal_salvar", { p_canal: payload });
              atual = { ...(r.canal || {}), webhook: r.webhook };
              webhook = r.webhook;
              mudou = true;
            } catch (e) {
              const cod = e && e.codigo, hint = e && e.hint;
              if (cod === "numero_em_uso") { ui.marcarErro(form, "phone_number_id", "Esse número já está conectado em outra empresa ou canal."); return false; }
              if (cod === "dados_invalidos" && hint && form.querySelector(`[data-campo="${hint}"]`)) { ui.marcarErro(form, hint, "Confira este campo."); return false; }
              throw e;
            }
            if (canal && passoInicial === 2) { ui.toast("Dados salvos.", { tipo: "ok" }); return true; }
          }
          if (passo === 5 || (canal && passoInicial === 3 && passo === 3)) return true;
          passo++;
          desenharPasso(api);
          return false;
        } },
      ],
    });
    if (mudou) carregar();
  }

  await carregar();
  // G1 · estado ao vivo: o shell avisa quando um número cai ou volta (pulso/notificação) → a lista se refaz sem piscar
  const limpezas = [];
  if (ctx.canais && typeof ctx.canais.assinar === "function") {
    let assinatura = "";
    const chave = l => (Array.isArray(l) ? l : []).map(x => `${x && x.id}:${x && x.desde}`).sort().join("|");
    try { assinatura = chave(ctx.canais.caidos ? ctx.canais.caidos() : []); } catch { /* sem a lista inicial */ }
    try {
      const cancelar = ctx.canais.assinar(l => {
        const k = chave(l);
        if (k === assinatura || !lista.isConnected) return;
        assinatura = k;
        carregar({ suave: true });
      });
      if (typeof cancelar === "function") limpezas.push(cancelar);
    } catch { /* sem o aviso ao vivo: «Reconferir agora» continua */ }
  }
  // e o pulso do cliente (o servidor bate o pulso quando grava o histórico do número): no máx. 1 recarga suave a cada 30 s
  if (ctx.pulso && typeof ctx.pulso.assinar === "function") {
    let ultimo = Date.now();
    try {
      const cancelar = ctx.pulso.assinar(() => {
        if (!lista.isConnected || reconferindo || Date.now() - ultimo < 30000) return;
        ultimo = Date.now();
        carregar({ suave: true });
      });
      if (typeof cancelar === "function") limpezas.push(cancelar);
    } catch { /* idem */ }
  }
  // paleta Ctrl/⌘+K: «Reconferir o número» (rótulo/grupo vêm de comandos.COMANDOS_CONHECIDOS)
  if (ctx.comandos && typeof ctx.comandos.registrar === "function") {
    try { const c = ctx.comandos.registrar({ id: "config.reconferir-numero", fazer: () => reconferirTodos(bReconferir) }); if (typeof c === "function") limpezas.push(c); }
    catch { /* a paleta é um extra */ }
  }
  // M32: o checklist do Início manda para cá com #/config/numeros?assistente=<id do número|novo>: abre o assistente certo e limpa o endereço
  const pedido = ctx.rota && ctx.rota.query && ctx.rota.query.assistente;
  // só enquanto esta lista ainda é a da tela (a pessoa pode ter saído durante a leitura dos números)
  if (pedido && ctx.pode("admin") && lista.isConnected && /^#\/config\/numeros\?/.test(location.hash)) {
    // limpa o endereço SEM navegar: ctx.navegar remontaria a seção e o assistente ficaria preso à lista antiga, que nunca mais se atualiza na tela
    try { history.replaceState(history.state, "", location.pathname + location.search + "#/config/numeros"); } catch { /* o endereço fica com o pedido; o assistente abre igual */ }
    // "novo" (o servidor não apontou um número): o 1º número CodeWords que ainda tem passo a fazer; sem nenhum número, o assistente de um novo
    const c = pedido !== "novo" ? canais.find(x => x.id === pedido)
      : canais.find(x => x.provedor === "codewords" && L.passosCodeWords({ canal: x, estado: estadosCodeWords.get(x.id) }).atual < 6) || canais.find(x => x.provedor !== "codewords" && x.status !== "ativo") || null;
    if (c) (c.provedor === "codewords" ? assistenteCodeWords(c) : assistente(c));
    else if (!canais.length) assistenteCodeWords(null);
  }
  // config.js guarda a função devolvida e a chama ao trocar de seção (o shell também cancela as assinaturas ao sair da tela)
  return () => { seqCarga++; for (const f of limpezas.splice(0)) { try { f(); } catch { /* ok */ } } };
}

/* ============================================================ RESPOSTAS RÁPIDAS */
/** plano 1000 · AS-143: nome falado do botão de variável («{primeiro_nome}» era lido «abre chave primeiro sublinhado nome…»). */
export function rotuloVariavel(v) {
  const nomes = { primeiro_nome: "primeiro nome", nome: "nome completo", atendente: "nome de quem atende", empresa: "nome da empresa", protocolo: "número do protocolo" };
  return `Inserir ${nomes[v] || String(v).replace(/_/g, " ")}`;
}
/** plano 1000 · AS-142: outra resposta com o mesmo atalho (a própria, em edição, não conta) → a resposta ou null. */
export function atalhoRepetido(respostas, atalho, idProprio = null) {
  const a = String(atalho || "").replace(/^\/+/, "").trim().toLowerCase();
  if (!a) return null;
  return (Array.isArray(respostas) ? respostas : []).find(r => r && r.id !== idProprio && String(r.atalho || "").toLowerCase() === a) || null;
}
/** plano 1000 · AS-141: ordem padrão da tabela — as mais usadas primeiro (empate: atalho). */
export function ordenarRespostas(respostas) {
  return (Array.isArray(respostas) ? respostas : []).map(r => ({ ...r, usos: Number(r.usos) || 0 }))
    .sort((a, b) => b.usos - a.usos || String(a.atalho).localeCompare(String(b.atalho), "pt-BR"));
}
/** plano 1000 · AS-240: o arquivo que «Exportar» baixa (sem id, usos nem departamento: o departamento é de cada empresa). */
export function exportarRespostas(respostas) {
  return { tipo: "orbita-respostas", versao: 1,
    respostas: (Array.isArray(respostas) ? respostas : []).map(r => ({ atalho: r.atalho, titulo: r.titulo, corpo: r.corpo, ativo: r.ativo !== false })) };
}
/** plano 1000 · AS-240: lê o arquivo importado → {novas, repetidas (atalhos que já existem), invalidas} ou {erro}. */
export function lerImportacaoRespostas(texto, existentes = []) {
  let j;
  // plano 1500c · CX-043: arquivo salvo pelo Bloco de Notas/Excel começa com a marca BOM (U+FEFF) — antes «não é um JSON válido»
  try { j = JSON.parse(String(texto || "").replace(/^\ufeff/, "")); } catch { return { erro: "O arquivo não é um JSON válido." }; }
  const lista = Array.isArray(j) ? j : j && Array.isArray(j.respostas) ? j.respostas : null;
  if (!lista) return { erro: "O arquivo não tem a lista de respostas exportada pelo Órbita." };
  const novas = [], repetidas = [], vistos = new Set();
  const atualizaveis = [];   // plano 2000d · DC-051: as repetidas que existem aqui, com o id — para «Atualizar as que já existem»
  let invalidas = 0;
  for (const r of lista.slice(0, 500)) {
    // plano 1500c · CX-044: atalho com acento ou espaço («Olá Maria», vindo de outra ferramenta) vira «ola-maria» em vez de ser descartado
    const atalho = String((r && r.atalho) || "").replace(/^\/+/, "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "-");
    const titulo = String((r && r.titulo) || "").trim().slice(0, 60), corpo = String((r && r.corpo) || "").trim();
    if (!/^[a-z0-9_-]{1,30}$/.test(atalho) || !titulo || !corpo || corpo.length > 4096) { invalidas++; continue; }
    const existente = !vistos.has(atalho) ? atalhoRepetido(existentes, atalho) : null;
    if (vistos.has(atalho) || existente) {
      repetidas.push(atalho);
      if (existente && existente.id != null && (existente.titulo !== titulo || existente.corpo !== corpo) && !atualizaveis.some(x => x.id === existente.id))
        atualizaveis.push({ id: existente.id, atalho, titulo, corpo });
      continue;
    }
    vistos.add(atalho);
    novas.push({ atalho, titulo, corpo, ativo: r.ativo !== false });
  }
  return { novas, repetidas, invalidas, atualizaveis };
}

/** plano 2000d · DC-052: pacotes de respostas para começar, por vertical (passam pelo mesmo importar). */
export const PACOTES_RESPOSTAS = Object.freeze({
  odonto: [
    { atalho: "ola", titulo: "Boas-vindas", corpo: "Olá, {primeiro_nome}! Aqui é {atendente}, da {empresa}. Como posso ajudar?" },
    { atalho: "avaliacao", titulo: "Marcar avaliação", corpo: "Podemos marcar uma avaliação com o dentista para entender o seu caso. Qual o melhor dia e período para você?" },
    { atalho: "confirmar", titulo: "Confirmar consulta", corpo: "{primeiro_nome}, posso confirmar a sua consulta? Responda SIM para confirmar ou me diga se precisa remarcar." },
    { atalho: "endereco", titulo: "Endereço", corpo: "Estamos te esperando! Quando chegar, é só se identificar na recepção." },
    { atalho: "convenio", titulo: "Convênio", corpo: "Me diga o nome do seu convênio que eu confiro a cobertura para você." },
    { atalho: "pos", titulo: "Pós-atendimento", corpo: "{primeiro_nome}, como você está depois do atendimento? Qualquer dúvida, é só chamar aqui." },
  ],
  oficina: [
    { atalho: "ola", titulo: "Boas-vindas", corpo: "Olá, {primeiro_nome}! Aqui é {atendente}, da {empresa}. Qual é o carro e o que está acontecendo com ele?" },
    { atalho: "orcamento", titulo: "Orçamento", corpo: "Para passar o orçamento certinho, preciso ver o carro. Qual o melhor dia para trazer?" },
    { atalho: "pronto", titulo: "Carro pronto", corpo: "{primeiro_nome}, o seu carro está pronto para retirada! Qualquer dúvida, é só chamar." },
    { atalho: "revisao", titulo: "Lembrete de revisão", corpo: "{primeiro_nome}, está chegando a hora da revisão do seu carro. Quer agendar?" },
    { atalho: "endereco", titulo: "Endereço", corpo: "Estamos te esperando! Quando chegar, é só procurar a recepção." },
  ],
  loja: [
    { atalho: "ola", titulo: "Boas-vindas", corpo: "Olá, {primeiro_nome}! Aqui é {atendente}, da {empresa}. Em que posso ajudar?" },
    { atalho: "estoque", titulo: "Disponibilidade", corpo: "Vou conferir a disponibilidade para você e já te respondo." },
    { atalho: "pagamento", titulo: "Formas de pagamento", corpo: "Aceitamos Pix, cartão de crédito e débito. Quer que eu envie o link?" },
    { atalho: "entrega", titulo: "Entrega", corpo: "Me passe o seu CEP que eu calculo o prazo e o valor da entrega." },
    { atalho: "obrigado", titulo: "Agradecimento", corpo: "Obrigado pela compra, {primeiro_nome}! Qualquer coisa, é só chamar aqui." },
  ],
  generico: [
    { atalho: "ola", titulo: "Boas-vindas", corpo: "Olá, {primeiro_nome}! Aqui é {atendente}, da {empresa}. Como posso ajudar?" },
    { atalho: "aguarde", titulo: "Aguarde um momento", corpo: "Só um momento que eu já verifico para você." },
    { atalho: "horario", titulo: "Horário", corpo: "Nosso horário de atendimento é de segunda a sexta, em horário comercial." },
    { atalho: "obrigado", titulo: "Agradecimento", corpo: "Obrigado pelo contato, {primeiro_nome}! Qualquer coisa, é só chamar." },
  ],
});
/** Baixa um texto como arquivo (Exportar). → true quando o navegador aceitou. */
function baixarTexto(texto, nome, tipo = "application/json") {
  try {
    const url = URL.createObjectURL(new Blob([texto], { type: `${tipo};charset=utf-8` }));
    const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch { return false; }
}

async function montarRespostas(ctx, alvo) {
  const { ui } = ctx;
  const h = ui.h;
  const [L] = await Promise.all([logica(ctx), ui.carregarCss("conversas"), ui.carregarCss("config")]);
  let base = null, respostas = [], filtro = "", filtroDep = "";
  const podeEditar = ctx.pode("supervisor");
  // plano 1000 · AS-240: exportar/importar (a revenda monta as respostas padrão uma vez e leva para cada cliente)
  const bExportar = h("button", { type: "button", class: "bt bt-fant cfg-resp-exportar", on: { click: () => exportar() } }, ui.icone("baixar"), "Exportar");
  const arquivo = h("input", { type: "file", accept: "application/json,.json", hidden: true, "aria-hidden": "true", tabindex: "-1" });
  const bImportar = podeEditar ? h("button", { type: "button", class: "bt bt-fant cfg-resp-importar", on: { click: () => arquivo.click() } }, ui.icone("folha"), "Importar") : null;
  arquivo.addEventListener("change", () => { const fl = arquivo.files && arquivo.files[0]; arquivo.value = ""; if (fl) importar(fl); });
  const chipsDep = h("div", { class: "cfg-resp-deps", hidden: true });

  const busca = h("input", { type: "search", placeholder: "Buscar resposta", "aria-label": "Buscar resposta" });
  const caixa = h("div", { class: "pilha" });
  const nova = podeEditar ? h("button", { type: "button", class: "bt bt-prim", on: { click: () => editar(null) } }, ui.icone("mais"), "Nova resposta") : null;
  ui.limpar(alvo);
  alvo.append(
    h("header", { class: "cab-pag" },
      h("div", null, h("p", { class: "rotulo" }, "Atendimento"), h("h2", { class: "titulo-pag" }, "Respostas rápidas"),
        h("p", { class: "sub" }, "No chat, digite / e o atalho. As variáveis {primeiro_nome}, {nome}, {atendente}, {empresa} e {protocolo} são trocadas sozinhas.")),
      h("div", { class: "linha cfg-resp-acoes" }, bExportar, bImportar, arquivo, nova)),
    h("div", { class: "fita" }, h("label", { class: "busca cresce" }, ui.icone("busca"), busca)),
    chipsDep,
    caixa);
  busca.addEventListener("input", ui.debounce(() => { filtro = busca.value; desenhar(); }, 150));

  const exemplo = () => ({ nome: "Maria Souza", primeiro_nome: "Maria", atendente: L.primeiroNome(ctx.sessao.conta.nome) || "Ana",
    empresa: (ctx.cliente && ctx.cliente.nome) || "Sua empresa", protocolo: "2026-000123" });

  async function carregar() {
    ui.limpar(caixa);
    caixa.appendChild(ui.esqueleto("tabela", 5));
    try {
      base = await ctx.api.rpcC("nx_cv_base");
      respostas = ordenarRespostas(base.respostas || []);
      desenharChips();
      desenhar();
    } catch (e) { ui.limpar(caixa); caixa.appendChild(ui.erroCartao(e, carregar)); }
  }

  function depNome(id) { const d = ((base && base.departamentos) || []).find(x => x.id === id); return d ? d.nome : "Todos"; }

  /** plano 1000 · AS-144: chips de departamento acima da tabela (só com departamento em alguma resposta). */
  function desenharChips() {
    ui.limpar(chipsDep);
    const deps = ((base && base.departamentos) || []).filter(d => respostas.some(r => r.departamento_id === d.id));
    chipsDep.hidden = !deps.length;
    if (!deps.length) { filtroDep = ""; return; }
    if (filtroDep && !deps.some(d => d.id === filtroDep)) filtroDep = "";
    chipsDep.appendChild(ui.segmentado({ tipo: "filtro", rotulo: "Filtrar por departamento", valor: filtroDep,
      opcoes: [{ valor: "", rotulo: "Todas" }, ...deps.map(d => ({ valor: d.id, rotulo: d.nome, contador: respostas.filter(r => r.departamento_id === d.id).length }))],
      aoMudar: v => { filtroDep = v || ""; desenhar(); } }));
  }

  function exportar() {
    if (!respostas.length) { ui.toast("Nenhuma resposta para exportar ainda.", { tipo: "info" }); return; }
    const nome = `respostas-rapidas-${String((ctx.cliente && ctx.cliente.nome) || "empresa").normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "empresa"}.json`;
    if (baixarTexto(JSON.stringify(exportarRespostas(respostas), null, 2), nome)) ui.toast(`${respostas.length} ${respostas.length === 1 ? "resposta exportada" : "respostas exportadas"}. Use «Importar» na outra empresa.`, { tipo: "ok" });
    else ui.toast("O navegador não deixou baixar o arquivo.", { tipo: "erro" });
  }

  async function importar(arq, { textoPronto = null } = {}) {
    let texto = "";
    if (textoPronto !== null) texto = textoPronto;   // plano 2000d · DC-052: pacote pronto
    else try { texto = await arq.text(); } catch { ui.toast("Não deu para ler o arquivo.", { tipo: "erro" }); return; }
    const r = lerImportacaoRespostas(texto, respostas);
    if (r.erro) { ui.toast(r.erro, { tipo: "erro" }); return; }
    const atualizaveis = r.atualizaveis || [];
    if (!r.novas.length && !atualizaveis.length) { ui.toast(r.repetidas.length ? "Todos os atalhos do arquivo já existem aqui." : "Nenhuma resposta válida no arquivo.", { tipo: "info" }); return; }
    // plano 1500c · CC-157: a conferência diz QUAIS atalhos ficam de fora (os que já existem nunca são sobrescritos)
    const nomesRep = r.repetidas.slice(0, 6).map(a => `/${a}`).join(", ") + (r.repetidas.length > 6 ? ` e mais ${r.repetidas.length - 6}` : "");
    const fora = [r.repetidas.length ? `${r.repetidas.length} com atalho que já existe (${nomesRep}; as daqui continuam como estão)` : "", r.invalidas ? `${r.invalidas} incompleta(s)` : ""].filter(Boolean).join(" e ");
    let atualizar = [];
    if (atualizaveis.length) {
      // plano 2000d · DC-051: «Atualizar as que já existem (mesmo atalho)» — a revenda corrige o texto na planilha e aplica nos clientes
      const chk = h("input", { type: "checkbox", id: "cfg-imp-atualizar" });
      const corpoM = h("div", { class: "pilha-p" },
        h("p", null, `${r.novas.length ? `${r.novas.length} ${r.novas.length === 1 ? "nova" : "novas"} (valem para todos os departamentos). ` : ""}${fora ? `Ficam de fora: ${fora}.` : ""}`),
        h("label", { class: "chip-check", for: "cfg-imp-atualizar" }, chk, `Atualizar as que já existem (mesmo atalho): ${atualizaveis.length}`));
      const esc = await ui.modal({ titulo: "Importar respostas", corpo: corpoM, largura: "p",
        acoes: [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: "Importar", tipo: "primario", fn: () => ({ atualizar: !!chk.checked }) }] });
      if (!esc) return;
      if (esc.atualizar) atualizar = atualizaveis;
      if (!r.novas.length && !atualizar.length) return;
    } else if (!(await ui.confirmar({ titulo: `Importar ${r.novas.length} ${r.novas.length === 1 ? "resposta" : "respostas"}?`, rotulo: "Importar",
      texto: `Elas valem para todos os departamentos.${fora ? ` Ficam de fora: ${fora}.` : ""}` }))) return;
    let atualizadas = 0;
    for (const x of atualizar) {
      try { await ctx.api.rpcC("nx_resposta_salvar", { p_resposta: { id: x.id, titulo: x.titulo, corpo: x.corpo } }); atualizadas++; } catch { /* segue */ }
    }
    if (!r.novas.length) { ui.toast(`${atualizadas} ${atualizadas === 1 ? "resposta atualizada" : "respostas atualizadas"}.`, { tipo: atualizadas ? "ok" : "erro" }); carregar(); return; }
    let ok = 0;
    // plano 1000b · CB-104: progresso «Importando 12 de 40» e, no fim, QUAIS atalhos o servidor recusou
    const recusados = [];
    const prog = r.novas.length > 3 ? ui.toast(`Importando 0 de ${r.novas.length}…`, { tipo: "info", fixo: true, ms: 0 }) : null;
    const pintar = i => { const p = prog && prog.el && prog.el.querySelector && prog.el.querySelector("p"); if (p) p.textContent = `Importando ${i} de ${r.novas.length}…`; };
    let i = 0;
    for (const x of r.novas) {
      pintar(++i);
      try { await ctx.api.rpcC("nx_resposta_salvar", { p_resposta: { ...x, departamento_id: null } }); ok++; } catch { recusados.push(`/${x.atalho}`); /* atalho tomado no meio do caminho: segue */ }
    }
    if (prog && typeof prog.fechar === "function") try { prog.fechar("pronto"); } catch { /* ok */ }
    const lista = recusados.length > 6 ? `${recusados.slice(0, 6).join(", ")} e mais ${recusados.length - 6}` : recusados.join(", ");
    ui.toast(ok === r.novas.length ? `${ok} ${ok === 1 ? "resposta importada" : "respostas importadas"}.`
      : `${ok} de ${r.novas.length} importadas. Recusadas pelo servidor: ${lista}.`, { tipo: ok ? "ok" : "erro", ms: recusados.length ? 12000 : undefined });
    carregar();
  }

  function desenhar() {
    ui.limpar(caixa);
    const q = L.semAcento(filtro.trim());
    const linhas = respostas.filter(r => (!q || L.semAcento(`${r.atalho} ${r.titulo} ${r.corpo}`).includes(q)) && (!filtroDep || r.departamento_id === filtroDep));
    if (!respostas.length) {
      caixa.appendChild(ui.vazio({ titulo: "Nenhuma resposta ainda.", icone: "chat", texto: "Cadastre as frases que a equipe repete todo dia: saudação, endereço, horários, confirmação.",
        acao: podeEditar ? { rotulo: "Nova resposta", fn: () => editar(null) } : null }));
      // plano 2000d · DC-052: «Começar com o pacote» da vertical — passa pelo mesmo importar (conferência e progresso)
      if (podeEditar) {
        const vert = (ctx.vocab && ctx.vocab.vertical) || "generico";
        const pacote = PACOTES_RESPOSTAS[vert] || PACOTES_RESPOSTAS.generico;
        const nomeVert = { odonto: "da clínica", oficina: "da oficina", loja: "da loja" }[vert] || "inicial";
        caixa.appendChild(h("div", { class: "linha cfg-resp-pacote" }, h("button", { type: "button", class: "bt bt-sec cfg-resp-pacote-bt",
          on: { click: () => importar(null, { textoPronto: JSON.stringify({ respostas: pacote }) }) } }, ui.icone("raio"), `Começar com o pacote ${nomeVert} (${pacote.length} respostas)`)));
      }
      return;
    }
    const t = ui.tabela({
      rotulo: "Respostas rápidas",
      colunas: [
        { chave: "atalho", rotulo: "Atalho", render: r => h("span", { class: "mono" }, `/${r.atalho}`), largura: "9rem", ordenavel: true },
        { chave: "titulo", rotulo: "Título", render: r => h("b", null, r.titulo), ordenavel: true },
        { chave: "corpo", rotulo: "Prévia", render: r => h("span", { class: "cfg-resp-corpo", title: r.corpo }, L.aplicarVariaveis(r.corpo, exemplo())) },
        { chave: "departamento_id", rotulo: "Departamento", render: r => depNome(r.departamento_id) },
        { chave: "usos", rotulo: "Usos", render: r => h("span", { class: "mono" }, String(r.usos || 0)), alinhar: "dir", ordenavel: true },
        // plano 1500c · CC-088: liga/desliga direto na linha (resposta sazonal) — grava só {id, ativo}
        { chave: "ativo", rotulo: "Situação", render: r => (podeEditar ? botaoAtiva(r) : ui.pilula(r.ativo === false ? "Desligada" : "Ativa", r.ativo === false ? "neutra" : "ok")) },
      ],
      linhas, vazio: filtroDep ? "Nenhuma resposta deste departamento com essa busca." : "Nenhuma resposta com essa busca.",
      aoClicar: podeEditar ? r => editar(r) : null,
    });
    caixa.appendChild(t.el);
  }

  /** plano 1500c · CC-088: o interruptor da linha (não abre o editor). */
  function botaoAtiva(r) {
    const ligada = r.ativo !== false;
    const b = h("button", { type: "button", role: "switch", class: "cfg-resp-ativa", "aria-checked": String(ligada), "aria-label": `/${r.atalho} ${ligada ? "ativa" : "desligada"}`, dataset: { ligada: ligada ? "1" : "0" } },
      h("span", { class: "cfg-resp-ativa-trilho", "aria-hidden": "true" }), ligada ? "Ativa" : "Desligada");
    b.addEventListener("click", async ev => {
      ev.stopPropagation(); ev.preventDefault();
      if (b.disabled) return;
      b.disabled = true;
      try {
        await ctx.api.rpcC("nx_resposta_salvar", { p_resposta: { id: r.id, ativo: !ligada } });
        r.ativo = !ligada;
        ui.toast(!ligada ? `/${r.atalho} ligada: volta a aparecer no /.` : `/${r.atalho} desligada: some do / até você ligar.`, { tipo: "ok" });
        desenhar();
      } catch (e) { b.disabled = false; ui.toast(ui.mensagemErro(e), { tipo: "erro" }); }
    });
    return b;
  }

  async function editar(r, { copia = false } = {}) {   // plano 1500c · CC-087: copia = nova resposta a partir de outra
    const nova = !r || copia;
    const deps = (base && base.departamentos) || [];
    const f = h("form", { class: "pilha", novalidate: true });
    const cAtalho = ui.campo({ rotulo: "Atalho", nome: "atalho", valor: r ? (copia ? L.atalhoDeCopia(r.atalho, respostas) : r.atalho) : "", obrigatorio: true, max: 31, placeholder: "ola", ajuda: "Letras minúsculas, números, - e _. No chat: /atalho" });
    // plano 1000 · AS-142: atalho que já existe avisa enquanto digita (antes só o servidor recusava ao salvar)
    const inpAtalho = cAtalho.querySelector("input");
    const avisoAtalho = h("small", { class: "campo-erro cfg-atalho-repetido", role: "status", hidden: true });
    cAtalho.appendChild(avisoAtalho);
    const conferirAtalho = () => {
      const outra = atalhoRepetido(respostas, inpAtalho.value, !nova ? r.id : null);
      avisoAtalho.hidden = !outra;
      avisoAtalho.textContent = outra ? `Já existe /${outra.atalho} («${outra.titulo}»). Escolha outro atalho.` : "";
      if (outra) inpAtalho.setAttribute("aria-invalid", "true"); else inpAtalho.removeAttribute("aria-invalid");
    };
    inpAtalho.addEventListener("input", conferirAtalho);
    const cTitulo = ui.campo({ rotulo: "Título", nome: "titulo", valor: r ? r.titulo : "", obrigatorio: true, max: 60 });
    const cCorpo = ui.campo({ rotulo: "Texto", nome: "corpo", tipo: "textarea", valor: r ? r.corpo : "", obrigatorio: true, max: 4096, linhas: 5 });
    const ta = cCorpo.querySelector("textarea");
    const vars = h("div", { class: "cfg-vars", role: "group", "aria-label": "Inserir variável" },
      L.VARIAVEIS.map(v => h("button", { type: "button", on: { click: () => {
        const ini = ta.selectionStart ?? ta.value.length, fim = ta.selectionEnd ?? ini;
        ta.value = ta.value.slice(0, ini) + `{${v}}` + ta.value.slice(fim);
        ta.focus(); ta.setSelectionRange(ini + v.length + 2, ini + v.length + 2); previa();
      } }, "aria-label": rotuloVariavel(v), title: rotuloVariavel(v) }, `{${v}}`)));
    const cont = h("div", { class: "cfg-cont" });
    const prev = h("div", { class: "cv-previa", "aria-live": "polite" });
    function previa() {
      prev.textContent = L.aplicarVariaveis(ta.value || "…", exemplo());
      // plano 1500c · CC-091: com a assinatura ligada o servidor soma «*Nome:*» na frente — o editor diz quanto cabe de verdade
      const comAss = !!(base && base.cfg && base.cfg.assinatura);
      const tetoAss = comAss ? L.tetoTexto({ assinatura: true, nome: (ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.nome) || "" }) : 4096;
      cont.textContent = comAss && tetoAss < 4096 ? `${ta.value.length} / 4096 · cabem ${tetoAss.toLocaleString("pt-BR")} com a assinatura` : `${ta.value.length} / 4096`;
      cont.dataset.alerta = ta.value.length > tetoAss ? "1" : "0";
    }
    ta.addEventListener("input", previa);
    const cDep = deps.length ? ui.campo({ rotulo: "Departamento", nome: "departamento_id", tipo: "select", valor: r ? r.departamento_id || "" : "",
      opcoes: [{ valor: "", rotulo: "Todos" }, ...deps.map(d => ({ valor: d.id, rotulo: d.nome }))], ajuda: "Aparece primeiro para quem atende esse departamento." }) : null;
    const cAtivo = ui.campo({ rotulo: "Ativa (aparece no /)", nome: "ativo", tipo: "interruptor", valor: r ? r.ativo !== false : true });
    f.append(h("div", { class: "grade-2" }, cAtalho, cTitulo), cCorpo, vars, cont, h("p", { class: "rotulo" }, "Prévia"), prev, cDep, cAtivo);
    previa();
    const acoes = [{ rotulo: "Cancelar", tipo: "neutro" }];
    // plano 1500c · CC-087: «Duplicar» abre a nova resposta com o texto desta e o atalho «-copia»
    if (!nova) acoes.unshift({ rotulo: "Duplicar", tipo: "neutro", valor: "duplicar" });
    if (!nova) acoes.unshift({ rotulo: "Excluir", tipo: "perigo", fn: async () => {
      if (!(await ui.confirmar({ titulo: `Excluir /${r.atalho}?`, texto: "A resposta some do / para toda a equipe.", perigo: true }))) return false;
      await ctx.api.rpcC("nx_resposta_excluir", { p_id: r.id });
      ui.toast("Resposta excluída.", { tipo: "ok" });
      return "excluida";
    } });
    acoes.push({ rotulo: "Salvar", tipo: "primario", fn: async () => {
      const d = ui.lerForm(f);
      ui.marcarErro(f, null);
      const atalho = String(d.atalho || "").replace(/^\/+/, "").trim().toLowerCase();
      if (!/^[a-z0-9_-]{1,30}$/.test(atalho)) { ui.marcarErro(f, "atalho", "Use só letras minúsculas sem acento, números, - e _ (até 30)."); return false; }
      if (atalhoRepetido(respostas, atalho, !nova ? r.id : null)) { avisoAtalho.hidden = true; ui.marcarErro(f, "atalho", "Esse atalho já existe."); return false; }
      if (!d.titulo) { ui.marcarErro(f, "titulo", "Dê um título."); return false; }
      if (!d.corpo) { ui.marcarErro(f, "corpo", "Escreva o texto."); return false; }
      try {
        await ctx.api.rpcC("nx_resposta_salvar", { p_resposta: { id: !nova ? r.id : undefined, atalho, titulo: d.titulo, corpo: d.corpo,
          departamento_id: d.departamento_id || null, ativo: d.ativo !== false } });
      } catch (e) {
        if (e && e.codigo === "atalho_em_uso") { ui.marcarErro(f, "atalho", "Esse atalho já existe."); return false; }
        if (e && e.codigo === "dados_invalidos" && e.hint && f.querySelector(`[data-campo="${e.hint}"]`)) { ui.marcarErro(f, e.hint, "Confira este campo."); return false; }
        throw e;
      }
      ui.toast("Resposta salva.", { tipo: "ok" });
      return true;
    } });
    const res = await ui.modal({ titulo: !nova ? `Editar /${r.atalho}` : copia ? `Nova resposta (cópia de /${r.atalho})` : "Nova resposta rápida", corpo: f, largura: "m", acoes });
    if (res === "duplicar") { await editar(r, { copia: true }); return; }
    if (res) carregar();
  }

  await carregar();
}

/* ============================================================ DEPARTAMENTOS E HORÁRIOS (P0-B) */
/** plano 1000 · AS-150: atalhos de horário. «sabado» mexe só no sábado (soma ao que já existe); os outros trocam a semana. */
export const PREDEFINICOES_HORARIO = Object.freeze([
  { id: "comercial", rotulo: "Comercial 8–18" },
  { id: "almoco", rotulo: "Com almoço" },
  { id: "sabado", rotulo: "Sábado até 12h" },
]);
export function predefinicaoHorario(id, atual = null) {
  const sem = (fx, extra = {}) => { const r = {}; for (let d = 0; d < 7; d++) r[d] = d >= 1 && d <= 5 ? fx.map(x => [...x]) : []; return { ...r, ...extra }; };
  if (id === "comercial") return sem([["08:00", "18:00"]]);
  if (id === "almoco") return sem([["08:00", "12:00"], ["13:00", "18:00"]]);
  if (id === "sabado") {
    const base = atual && typeof atual === "object" ? atual : sem([["08:00", "18:00"]]);
    const r = {}; for (let d = 0; d < 7; d++) r[d] = ((base[d] ?? base[String(d)]) || []).map(x => [...x]);
    r[6] = [["08:00", "12:00"]];
    return r;
  }
  return null;
}
/** plano 1000 · AS-235: quem é do departamento (base.usuarios com o id na lista de departamentos). */
export function pessoasDoDepartamento(usuarios, depId) {
  return (Array.isArray(usuarios) ? usuarios : []).filter(u => u && Array.isArray(u.departamentos) && u.departamentos.includes(depId));
}
/** Contraste WCAG entre duas cores [r, g, b] (0–255). */
export function contrasteRgb(a, b) {
  const lum = c => { const [r, g, bl] = c.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Os fundos dos esquemas claro e escuro do app (os mesmos de tema.FUNDOS_ESQUEMA), em RGB: o shell não é importado aqui. */
export const FUNDOS_RGB = Object.freeze({ claro: [243, 240, 233], escuro: [7, 9, 12] });
/** plano 1000 · AS-237: cor do departamento que some no tema claro ou no escuro (contraste < 2 com o fundo). */
export function avisoCorDepartamento(cor, fundos = FUNDOS_RGB) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(cor || "").trim());
  if (!m) return "";
  const rgb = [m[1], m[2], m[3]].map(x => parseInt(x, 16));
  if (contrasteRgb(rgb, fundos.claro) < 2) return "Cor clara demais: no tema claro a pílula e a borda do departamento quase somem. Escolha um tom mais forte.";
  if (contrasteRgb(rgb, fundos.escuro) < 2) return "Cor escura demais: no tema escuro a pílula e a borda do departamento quase somem. Escolha um tom mais claro.";
  return "";
}
/** plano 1000 · AS-288: por que o item do menu do departamento está desabilitado (lido como descrição; o ui.menu mostra quando suportar). */
export function motivosMenuDepartamento(d) {
  return {
    padrao: d.padrao ? "Ele já é o padrão." : !d.ativo ? "Religue o departamento antes de torná-lo padrão." : null,
    ativo: d.padrao ? "O departamento padrão não pode ser desligado: marque outro como padrão antes." : null,
    excluir: d.padrao ? "O departamento padrão não pode ser excluído: marque outro como padrão antes." : null,
  };
}

const HINT_DEP = {
  nome: ["nome", "Dê um nome de até 40 letras."],
  nome_repetido: ["nome", "Já existe um departamento com esse nome."],
  cor: ["cor", "Escolha uma cor da paleta (ou digite o código de 6 dígitos)."],
  horario: ["horario", "Confira o horário: início antes do fim e faixas sem sobrepor."],
  msg_fora_horario: ["msg_fora_horario", "A mensagem pode ter até 1.000 caracteres."],
  padrao: ["padrao", "Sempre existe um departamento padrão. Para trocar, marque outro como padrão."],
  padrao_inativo: ["ativo", "O departamento padrão não pode ficar desligado."],
  maximo: [null, "Limite de 30 departamentos."],
};

async function montarDepartamentos(ctx, alvo) {
  const { ui } = ctx;
  const h = ui.h;
  const [L] = await Promise.all([logica(ctx), ui.carregarCss("conversas"), ui.carregarCss("config")]);
  let base = null, deps = [];
  const novo = h("button", { type: "button", class: "bt bt-prim" }, ui.icone("mais"), "Novo departamento");
  novo.addEventListener("click", () => editar(null));
  const caixa = h("div", { class: "cfg-deps" });
  // plano 1000 · AS-148: a pílula «Aberto/Fechado agora» é refeita a cada minuto enquanto a seção está na tela (antes congelava no desenho)
  let pilulasAgora = [];
  function atualizarAgora(agora = new Date()) {
    for (const x of pilulasAgora) {
      if (!x.el.isConnected) continue;
      const ab = L.horarioAberto(x.d.horario, agora);
      if (x.el.dataset.aberto === (ab ? "1" : "0")) continue;
      x.el.dataset.aberto = ab ? "1" : "0";
      x.el.replaceChildren(ui.pilula(rotuloAgora(x.d.horario, ab, agora), ab ? "ok" : "neutra"));
    }
  }
  /** plano 1500c · CC-103: «Fechado · abre seg 08:00» (antes só «Fechado agora», sem dizer quando abre). */
  function rotuloAgora(horario, aberto, agora = new Date()) {
    if (aberto) return "Aberto agora";
    const prox = L.proximaAbertura(horario, agora);
    return prox ? `Fechado · abre ${prox}` : "Fechado agora";
  }
  const relogioAgora = setInterval(() => { if (!caixa.isConnected) { clearInterval(relogioAgora); return; } atualizarAgora(); }, 60_000);
  ui.limpar(alvo);
  alvo.append(
    h("header", { class: "cab-pag" },
      h("div", null, h("p", { class: "rotulo" }, "Equipe"), h("h2", { class: "titulo-pag" }, "Departamentos e horários"),
        h("p", { class: "sub" }, "Conversa nova cai no departamento do número (ou no padrão). No rodízio, vai para quem está com menos conversas abertas; fora do horário, o cliente recebe a mensagem automática.")),
      novo),
    caixa);

  async function carregar() {
    ui.limpar(caixa);
    caixa.appendChild(ui.esqueleto("cartoes", 2));
    try {
      base = await ctx.api.rpcC("nx_cv_base");
      deps = (base.config && base.config.departamentos) || [];
      desenhar();
    } catch (e) { ui.limpar(caixa); caixa.appendChild(ui.erroCartao(e, carregar)); }
  }

  const padrao = () => deps.find(d => d.padrao) || null;

  function desenhar() {
    ui.limpar(caixa);
    if (!base.config) {
      caixa.appendChild(ui.vazio({ titulo: "Só administradores configuram departamentos.", icone: "cadeado", texto: "Peça ao administrador da sua empresa." }));
      return;
    }
    if (!deps.length) {
      caixa.appendChild(ui.vazio({ titulo: "Nenhum departamento ainda.", icone: "usuario",
        texto: "Crie a Recepção (padrão) para as conversas novas caírem nela.", acao: { rotulo: "Novo departamento", fn: () => editar(null) } }));
      return;
    }
    const agora = new Date();
    pilulasAgora = [];
    for (const d of deps) {
      const cor = ui.corOk(d.cor);
      const aberto = L.horarioAberto(d.horario, agora);
      const bEditar = h("button", { type: "button", class: "bt bt-sec bt-p" }, ui.icone("editar"), "Editar");
      bEditar.addEventListener("click", () => editar(d));
      const bMais = h("button", { type: "button", class: "bt-icone", "aria-label": `Mais opções de ${d.nome}` }, ui.icone("opcoes"));
      bMais.addEventListener("click", () => ui.menu(bMais, [
        { rotulo: "Tornar padrão", icone: "check", fn: () => salvarRapido(d, { padrao: true }, `${d.nome} agora recebe as conversas novas.`), desabilitado: d.padrao || !d.ativo, motivo: motivos.padrao },
        { rotulo: d.ativo ? "Desligar" : "Religar", icone: d.ativo ? "relogio" : "raio", fn: () => salvarRapido(d, { ativo: !d.ativo }, d.ativo ? "Departamento desligado." : "Departamento religado."), desabilitado: d.padrao, motivo: motivos.ativo },
        // plano 1500c · CC-160: «Duplicar» abre o editor com tudo deste (horário, distribuição, mensagem) e o nome «(cópia)»
        { rotulo: "Duplicar", icone: "copiar", fn: () => editar(d, { copia: true }) },
        "-",
        { rotulo: "Excluir", icone: "lixeira", perigo: true, fn: () => excluir(d), desabilitado: d.padrao, motivo: motivos.excluir },
      ]));
      const motivos = motivosMenuDepartamento(d);
      // AS-235: quem é do departamento (até 4 rostos) e o atalho para Usuários já filtrado
      const pessoas = pessoasDoDepartamento(base.usuarios, d.id);
      const rostos = pessoas.length ? h("a", { class: "cfg-dep-pessoas", href: `#/config/usuarios?dep=${encodeURIComponent(d.id)}`,
        "aria-label": `Pessoas do ${d.nome}: ${pessoas.map(p => p.nome).join(", ")}. Abrir em Usuários.` },
        pessoas.slice(0, 4).map(p => ui.avatar(p.nome, p.id, p.avatar || null, { tamanho: "p" })),
        pessoas.length > 4 ? h("span", { class: "cfg-dep-mais mono" }, `+${pessoas.length - 4}`) : null) : null;
      const agoraEl = d.horario ? h("span", { class: "cfg-dep-agora", dataset: { aberto: aberto ? "1" : "0" } }, ui.pilula(rotuloAgora(d.horario, aberto), aberto ? "ok" : "neutra")) : null;
      if (agoraEl) pilulasAgora.push({ d, el: agoraEl });
      const msgInfo = !d.horario ? null
        : d.msg_fora_horario ? h("span", { class: "cfg-dep-msg" }, ui.icone("chat"), "Mensagem fora do horário ligada")
        // plano 1500c · CC-104: o alerta vira o atalho para ligar a mensagem (abre o editor já no campo)
        : h("button", { type: "button", class: "cfg-dep-msg cfg-dep-msg-bt", dataset: { alerta: "1" }, on: { click: () => editar(d, { foco: "msg_fora_horario" }) } }, ui.icone("alerta"), "Sem mensagem fora do horário · Ligar");
      caixa.appendChild(h("article", { class: "cartao cfg-dep", style: cor ? { "--cor": cor } : null, dataset: { inativo: d.ativo ? "0" : "1" } },
        h("div", { class: "cfg-dep-cab" },
          h("span", { class: "cfg-dep-cor", "aria-hidden": "true" }),
          h("h3", { class: "titulo-sec" }, d.nome),
          d.padrao ? ui.pilula("Padrão", "info") : null,
          d.ativo ? null : ui.pilula("Desligado", "neutra"),
          h("span", { class: "cfg-dep-acoes" }, bEditar, bMais)),
        h("p", { class: "cfg-dep-dist" },
          d.distribuicao === "rodizio" ? h("b", null, "Rodízio automático") : h("b", null, "Distribuição manual"),
          d.distribuicao === "rodizio" ? " — vai para quem está com menos conversas abertas." : " — fica na fila até alguém assumir.",
          d.manter_atendente ? " Cliente que volta fica com quem atendeu antes." : ""),
        h("div", { class: "cfg-dep-hor" }, ui.icone("relogio"), h("span", null, L.resumoHorario(d.horario), d.horario ? h("small", { class: "fraco" }, " · horário de Brasília") : null), agoraEl),
        // plano 1500c · CC-315: rodízio sem ninguém — as conversas caem num departamento que ninguém recebe
        d.ativo && d.distribuicao === "rodizio" && !pessoas.length && !(Number(d.pessoas) > 0)
          ? h("p", { class: "aviso aviso-aten cfg-dep-ninguem", role: "status" }, ui.icone("alerta"),
            h("span", null, "Ninguém recebe as conversas deste departamento. ", h("a", { href: `#/config/usuarios?dep=${encodeURIComponent(d.id)}` }, "Escolher pessoas em Usuários")))
          : null,
        h("div", { class: "cfg-dep-rod" },
          msgInfo,
          rostos,
          h("span", { class: "mono" }, `${d.conversas_abertas || 0} em aberto · ${d.canais || 0} ${d.canais === 1 ? "número" : "números"} · ${d.pessoas || 0} ${d.pessoas === 1 ? "pessoa" : "pessoas"}`))));
    }
  }

  async function salvarRapido(d, mudanca, ok) {
    try {
      await ctx.api.rpcC("nx_departamento_salvar", { p_departamento: { id: d.id, ...mudanca } });
      ui.toast(ok, { tipo: "ok" });
      carregar();
    } catch (e) {
      const x = e && e.codigo === "dados_invalidos" && HINT_DEP[e.hint];
      ui.toast(x ? x[1] : ui.mensagemErro(e), { tipo: "erro" });
    }
  }

  async function excluir(d) {
    const p = padrao();
    const n = d.conversas_abertas || 0;
    const ok = await ui.confirmar({ titulo: `Excluir o departamento ${d.nome}?`, perigo: true, rotulo: "Excluir",
      texto: `${n ? `${n === 1 ? "A conversa em aberto" : `As ${n} conversas em aberto`}, os` : "Os"} números e as pessoas dele passam para «${p ? p.nome : "o padrão"}». As respostas rápidas dele ficam para todos.` });
    if (!ok) return;
    try {
      const r = await ctx.api.rpcC("nx_departamento_excluir", { p_id: d.id });
      ui.toast(r && r.movidas ? `Departamento excluído. ${r.movidas} ${r.movidas === 1 ? "conversa foi" : "conversas foram"} para ${p ? p.nome : "o padrão"}.` : "Departamento excluído.", { tipo: "ok" });
      carregar();
    } catch (e) {
      const x = e && e.codigo === "dados_invalidos" && HINT_DEP[e.hint];
      ui.toast(x ? x[1] : ui.mensagemErro(e), { tipo: "erro" });
    }
  }

  /* ---------------- editor */
  async function editar(dOrig, { foco = null, copia = false } = {}) {   // plano 1500c · CC-104: foco = campo que já abre focado
    // plano 1500c · CC-160: a cópia nasce do original (sem id, sem ser padrão, ligada) e grava como departamento novo
    const d = copia && dOrig ? { ...dOrig, id: null, nome: `${String(dOrig.nome || "").slice(0, 31)} (cópia)`, padrao: false, ativo: true } : dOrig;
    const f = h("form", { class: "pilha", novalidate: true });
    const cNome = ui.campo({ rotulo: "Nome", nome: "nome", valor: d ? d.nome : "", obrigatorio: true, max: 40, placeholder: "Ex.: Recepção, Comercial, Financeiro" });
    const cCor = ui.campo({ rotulo: "Cor", nome: "cor", tipo: "cor", valor: d ? d.cor : (ctx.paleta || [])[deps.length % Math.max(1, (ctx.paleta || []).length)] || null, paleta: ctx.paleta });
    // plano 1000 · AS-237: cor que some no tema claro (ou no escuro) avisa — a conta de contraste WCAG da Marca, sem importar o tema.js
    const avisoCor = h("small", { class: "campo-ajuda cfg-cor-aviso", role: "status", hidden: true });
    cCor.appendChild(avisoCor);
    const conferirCor = () => {
      const v = (cCor.querySelector("input[type=hidden]") || {}).value || "";
      const t = avisoCorDepartamento(v);
      avisoCor.hidden = !t; avisoCor.textContent = t;
    };
    cCor.addEventListener("change", conferirCor);
    conferirCor();

    // distribuição (dois cartões de escolha)
    const opDist = (valor, titulo, texto) => {
      const id = `cfg-dist-${valor}`;
      return h("label", { class: "cfg-opcao", for: id },
        h("input", { type: "radio", name: "distribuicao", id, value: valor, checked: (d ? d.distribuicao : "rodizio") === valor }),
        h("span", null, h("b", null, titulo), h("small", null, texto)));
    };
    const cDist = h("fieldset", { class: "campo", dataset: { campo: "distribuicao" } }, h("legend", null, "Quem recebe as conversas novas"),
      h("div", { class: "cfg-opcoes" },
        opDist("rodizio", "Rodízio automático", "Vai para quem está com menos conversas abertas (e recebe no rodízio)."),
        opDist("manual", "Manual", "Fica sem dono na fila; alguém da equipe assume.")));
    const cManter = ui.campo({ rotulo: "Cliente que volta fica com quem atendeu antes", nome: "manter_atendente", tipo: "interruptor", valor: d ? d.manter_atendente !== false : true });
    const ehPadrao = !!(d && d.padrao);
    const cPadrao = ui.campo({ rotulo: "Departamento padrão (recebe as conversas dos números sem departamento)", nome: "padrao", tipo: "interruptor", valor: ehPadrao || (!d && !padrao()),
      desabilitado: ehPadrao, ajuda: ehPadrao ? "Para trocar, marque outro departamento como padrão." : null });
    const cAtivo = ui.campo({ rotulo: "Ligado", nome: "ativo", tipo: "interruptor", valor: d ? d.ativo !== false : true, desabilitado: ehPadrao,
      ajuda: "Desligado some da transferência e dos filtros; as conversas dele continuam." });

    // horário
    let grade = d && d.horario ? clonar(d.horario) : null;
    let ultimaGrade = grade || L.horarioPadrao();
    const b24 = h("button", { type: "button", "aria-pressed": String(!grade) }, "24 horas");
    const bDef = h("button", { type: "button", "aria-pressed": String(!!grade) }, "Horário definido");
    const alterna = h("div", { class: "cv-alterna", role: "group", "aria-label": "Tipo de horário" }, b24, bDef);
    const gradeEl = h("div", { class: "cfg-grade-horario", role: "group", "aria-label": "Horário por dia" });
    const resumo = h("p", { class: "cfg-hor-resumo", "aria-live": "polite" });
    const erroHor = h("small", { class: "campo-erro", hidden: true });
    const bCopiar = h("button", { type: "button", class: "bt bt-fant bt-p" }, ui.icone("copiar"), "Copiar segunda para terça a sexta");
    const blocoGrade = h("div", { class: "pilha-p" }, gradeEl, h("div", { class: "linha" }, bCopiar));
    // plano 1000 · AS-150: predefinições de horário (além do «copiar segunda»)
    const predef = h("div", { class: "linha cfg-predef", role: "group", "aria-label": "Horários prontos" },
      PREDEFINICOES_HORARIO.map(p => h("button", { type: "button", class: "bt bt-fant bt-p", dataset: { predef: p.id }, on: { click: () => {
        const antes = lerGrade();   // plano 1000b · CB-138: a grade anterior volta pelo «Desfazer» do aviso
        grade = predefinicaoHorario(p.id, antes); montarGrade(); atualizarResumo();
        ui.toast(`Horário «${p.rotulo}» aplicado.`, { tipo: "ok", desfazer: () => {
          grade = antes ? clonar(antes) : null; montarGrade(); atualizarResumo();
          ui.anunciar("Horário anterior de volta.");
        } });
      } } }, p.rotulo)));
    blocoGrade.prepend(predef);
    // AS-149: a grade vale no horário de Brasília (o servidor confere no fuso de São Paulo)
    const cHorario = h("fieldset", { class: "campo", dataset: { campo: "horario" } },
      h("legend", null, "Horário de atendimento ", h("small", { class: "fraco cfg-fuso" }, "· horário de Brasília") /* plano 1500c · CC-049: um nome só para o fuso */), alterna, blocoGrade, resumo, erroHor);

    function clonar(x) { const r = {}; for (let i = 0; i < 7; i++) r[i] = ((x[i] ?? x[String(i)]) || []).map(fx => [fx[0], fx[1] === "24:00" ? "23:59" : fx[1]]); return r; }
    function lerGrade() {
      if (!grade) return null;
      const r = {};
      for (const linha of gradeEl.querySelectorAll("[data-dia]")) {
        const dia = Number(linha.dataset.dia);
        const aberto = linha.querySelector("input[type=checkbox]").checked;
        const faixas = [];
        if (aberto) for (const fx of linha.querySelectorAll(".cfg-faixa")) {
          const [a, b] = fx.querySelectorAll("input[type=time]");
          faixas.push([a.value, fimDaFaixa(b.value)]);      // plano 1000 · AS-146: 23:59 na tela = 24:00 (o último minuto aberto)
        }
        r[dia] = faixas;
      }
      return r;
    }
    function atualizarResumo() {
      const g = lerGrade();
      const v = L.validarHorario(g, { meiaNoite: true });     // AS-145: o servidor (20261013d) aceita a faixa noturna como a última do dia
      erroHor.hidden = v.ok; erroHor.textContent = v.ok ? "" : v.erro.texto;
      const noturna = v.ok && v.horario && Object.values(v.horario).some(fx => fx.some(([a, b]) => b < a));
      resumo.textContent = v.ok ? `${L.resumoHorario(v.horario)}${noturna ? " · a faixa que termina antes de começar vai até a madrugada do dia seguinte" : ""}` : "";
      pintarCopiar();
      atualizarPrevia();
    }
    /** plano 1000b · CB-137: «Copiar segunda para terça a sexta» com a segunda fechada fecharia a semana calada — desligado, com o motivo. */
    function pintarCopiar() {
      const seg = gradeEl.querySelector('[data-dia="1"] input[type=checkbox]');
      const fechada = !!seg && !seg.checked;
      bCopiar.disabled = fechada;
      const motivo = "A segunda está fechada: marque a segunda (com o horário) para copiar.";
      if (fechada) { bCopiar.setAttribute("title", motivo); bCopiar.setAttribute("aria-description", motivo); }
      else { bCopiar.removeAttribute("title"); bCopiar.removeAttribute("aria-description"); }
    }
    function faixaEl(dia, fx, podeRemover) {
      const a = h("input", { type: "time", value: fx[0] || "08:00", step: 300, "aria-label": `${L.DIAS_LONGOS[dia]}: início` });
      const b = h("input", { type: "time", value: fx[1] || "18:00", step: 300, "aria-label": `${L.DIAS_LONGOS[dia]}: fim` });
      a.addEventListener("change", atualizarResumo); b.addEventListener("change", atualizarResumo);
      const x = podeRemover ? h("button", { type: "button", class: "bt-icone", "aria-label": `Tirar o intervalo de ${L.DIAS_LONGOS[dia]}` }, ui.icone("fechar")) : null;
      const el = h("span", { class: "cfg-faixa" }, a, h("span", { "aria-hidden": "true" }, "às"), b, x);
      if (x) x.addEventListener("click", () => {
        // plano 1000b · CB-105: o botão focado some com a faixa — o foco vai ao «Intervalo» da linha (ou ao fim da faixa que ficou)
        const linha = el.closest(".cfg-dia");
        el.remove(); desenharLinha(dia); atualizarResumo();
        const alvo = linha && (linha.querySelector(".cfg-mais-faixa") || [...linha.querySelectorAll(".cfg-faixa input[type=time]")].pop());
        try { if (alvo) alvo.focus(); } catch { /* ok */ }
      });
      return el;
    }
    function desenharLinha(dia) {
      const linha = gradeEl.querySelector(`[data-dia="${dia}"]`);
      const faixas = [...linha.querySelectorAll(".cfg-faixa")];
      const caixaF = linha.querySelector(".cfg-faixas");
      const mais = caixaF.querySelector(".cfg-mais-faixa");
      if (mais) mais.remove();
      if (faixas.length < 2 && linha.querySelector("input[type=checkbox]").checked) {
        // plano 1000b · CB-143: o nome diz que o botão divide o dia (08–18 vira 08–12 e 13–18)
        const bm = h("button", { type: "button", class: "bt bt-fant bt-p cfg-mais-faixa", "aria-label": `Intervalo de almoço em ${L.DIAS_LONGOS[dia]}`,
          title: "Divide o horário em duas faixas para o almoço (ex.: 08:00–18:00 vira 08:00–12:00 e 13:00–18:00)" }, ui.icone("mais"), "Intervalo (almoço)");
        bm.addEventListener("click", () => {
          // intervalo de almoço: 08:00–18:00 vira 08:00–12:00 e 13:00–18:00; senão abre uma faixa depois da última
          const ult = faixas[faixas.length - 1];
          const [ci, cf] = ult ? ult.querySelectorAll("input[type=time]") : [];
          let nova;
          if (ci && cf && ci.value < "12:00" && cf.value > "13:00") { nova = ["13:00", cf.value]; cf.value = "12:00"; }
          else {
            const ini = cf && cf.value ? cf.value : "13:00";
            const [hh, mm] = ini.split(":").map(Number);
            const fim = hh >= 21 ? "23:59" : `${String(hh + 2).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
            nova = [ini, fim];
          }
          bm.before(faixaEl(dia, nova, true));
          desenharLinha(dia); atualizarResumo();
        });
        caixaF.appendChild(bm);
      }
    }
    function montarGrade() {
      ui.limpar(gradeEl);
      for (const dia of [1, 2, 3, 4, 5, 6, 0]) {
        const faixas = (grade && grade[dia]) || [];
        const idc = `cfg-dia-${dia}`;
        const idFech = `${idc}-fechado`, idNome = `${idc}-nome`;
        const chk = h("input", { type: "checkbox", id: idc, checked: faixas.length > 0, "aria-describedby": faixas.length ? null : idFech });
        const caixaF = h("div", { class: "cfg-faixas" });
        const fechado = h("span", { class: "sub cfg-fechado", id: idFech, hidden: faixas.length > 0 }, "Fechado");
        faixas.forEach((fx, i) => caixaF.appendChild(faixaEl(dia, fx, i > 0)));
        caixaF.appendChild(fechado);
        chk.addEventListener("change", () => {
          if (chk.checked && !caixaF.querySelector(".cfg-faixa")) fechado.before(faixaEl(dia, dia === 6 ? ["08:00", "12:00"] : ["08:00", "18:00"], false));
          if (!chk.checked) for (const x of caixaF.querySelectorAll(".cfg-faixa")) x.remove();
          fechado.hidden = chk.checked;
          if (chk.checked) chk.removeAttribute("aria-describedby"); else chk.setAttribute("aria-describedby", idFech);
          desenharLinha(dia); atualizarResumo();
        });
        // AS-238: cada dia é um grupo com nome (o leitor diz «Segunda, grupo»); «Fechado» descreve a caixa do dia
        const linha = h("div", { class: "cfg-dia", dataset: { dia }, role: "group", "aria-labelledby": idNome },
          h("label", { class: "cfg-dia-nome", for: idc }, chk, h("span", { id: idNome }, L.DIAS_LONGOS[dia])), caixaF);
        gradeEl.appendChild(linha);
        desenharLinha(dia);
      }
    }
    function modoHorario(definido) {
      if (definido && !grade) grade = clonar(ultimaGrade);
      if (!definido && grade) { ultimaGrade = lerGrade() || ultimaGrade; grade = null; }
      b24.setAttribute("aria-pressed", String(!definido));
      bDef.setAttribute("aria-pressed", String(definido));
      blocoGrade.hidden = !definido;
      if (definido) montarGrade();
      atualizarResumo();
    }
    b24.addEventListener("click", () => modoHorario(false));
    bDef.addEventListener("click", () => modoHorario(true));
    bCopiar.addEventListener("click", () => {
      const g = lerGrade(); if (!g) return;
      if (!(g[1] && g[1].length)) { pintarCopiar(); return; }   // plano 1000b · CB-137: segunda fechada não fecha a semana
      for (const dia of [2, 3, 4, 5]) g[dia] = g[1].map(x => [...x]);
      grade = g; montarGrade(); atualizarResumo();
      ui.anunciar("Horário de segunda copiado para terça a sexta.");
    });

    // mensagem fora do horário
    const cMsg = ui.campo({ rotulo: "Mensagem fora do horário", nome: "msg_fora_horario", tipo: "textarea", linhas: 3, max: 1000, valor: d ? d.msg_fora_horario || "" : "",
      placeholder: "Olá, {primeiro_nome}! Recebemos sua mensagem. Respondemos assim que abrirmos." });
    const taMsg = cMsg.querySelector("textarea");
    const contMsg = h("div", { class: "cfg-cont" });
    const prevMsg = h("div", { class: "cv-previa cfg-previa-in", "aria-live": "polite" });
    const notaMsg = h("p", { class: "sub" });
    const varsMsg = h("div", { class: "cfg-vars", role: "group", "aria-label": "Inserir variável" },
      ["primeiro_nome", "nome", "empresa", "protocolo"].map(v => h("button", { type: "button", on: { click: () => {
        const ini = taMsg.selectionStart ?? taMsg.value.length, fim = taMsg.selectionEnd ?? ini;
        taMsg.value = taMsg.value.slice(0, ini) + `{${v}}` + taMsg.value.slice(fim);
        taMsg.focus(); taMsg.setSelectionRange(ini + v.length + 2, ini + v.length + 2); atualizarPrevia();
      } }, "aria-label": rotuloVariavel(v), title: rotuloVariavel(v) }, `{${v}}`)));
    function atualizarPrevia() {
      const txt = taMsg.value.trim();
      prevMsg.hidden = !txt;
      prevMsg.textContent = L.aplicarVariaveis(txt, { nome: "Maria Souza", primeiro_nome: "Maria", atendente: "", empresa: (ctx.cliente && ctx.cliente.nome) || "Sua empresa", protocolo: "2026-000123" });
      contMsg.textContent = `${taMsg.value.length} / 1000`;
      contMsg.dataset.alerta = taMsg.value.length > 1000 ? "1" : "0";
      notaMsg.textContent = !grade ? "Com atendimento 24 horas esta mensagem nunca é enviada."
        : txt ? "Enviada uma vez a cada 12 h para quem começa uma conversa fora do horário."
        : "Sem mensagem, quem chamar fora do horário não recebe resposta automática.";
    }
    taMsg.addEventListener("input", atualizarPrevia);

    f.append(h("div", { class: "grade-2" }, cNome, cCor), cDist, cManter, cHorario,
      h("div", { class: "pilha-p" }, cMsg, varsMsg, contMsg, prevMsg, notaMsg), cPadrao, cAtivo);
    modoHorario(!!grade);

    const acoes = [{ rotulo: "Cancelar", tipo: "neutro" }, { rotulo: d && !copia ? "Salvar" : "Criar departamento", tipo: "primario", fn: async () => {
      const dados = ui.lerForm(f);
      ui.marcarErro(f, null);
      if (!dados.nome) { ui.marcarErro(f, "nome", HINT_DEP.nome[1]); return false; }
      const v = L.validarHorario(lerGrade(), { meiaNoite: true });
      if (!v.ok) { erroHor.hidden = false; erroHor.textContent = v.erro.texto; gradeEl.querySelector(`[data-dia="${v.erro.dia ?? 1}"] input`)?.focus(); return false; }
      if (String(dados.msg_fora_horario || "").length > 1000) { ui.marcarErro(f, "msg_fora_horario", HINT_DEP.msg_fora_horario[1]); return false; }
      const payload = { nome: dados.nome, cor: dados.cor || null, distribuicao: dados.distribuicao || "rodizio", manter_atendente: !!dados.manter_atendente,
        horario: v.horario, msg_fora_horario: dados.msg_fora_horario || null };
      if (d && !copia) payload.id = d.id;   // CC-160: a cópia é departamento novo
      if (!ehPadrao) { payload.padrao = !!dados.padrao; payload.ativo = dados.ativo !== false; }
      try {
        return await ctx.api.rpcC("nx_departamento_salvar", { p_departamento: payload });
      } catch (e) {
        const x = e && e.codigo === "dados_invalidos" && HINT_DEP[e.hint];
        if (x && x[0] === "horario") { erroHor.hidden = false; erroHor.textContent = x[1]; return false; }
        if (x && x[0]) { ui.marcarErro(f, x[0], x[1]); return false; }
        if (x) { ui.toast(x[1], { tipo: "erro" }); return false; }
        throw e;
      }
    } }];
    const r = await ui.modal({ titulo: copia ? "Duplicar departamento" : d ? `Departamento ${d.nome}` : "Novo departamento", corpo: f, largura: "g", acoes,
      aoAbrir: foco ? () => setTimeout(() => { const x = f.querySelector(`[name="${foco}"]`); if (x) { try { x.scrollIntoView({ block: "center" }); x.focus(); } catch { /* ok */ } } }, 60) : undefined });
    if (r) { ui.toast(d && !copia ? "Departamento salvo." : "Departamento criado.", { tipo: "ok" }); carregar(); }
  }

  await carregar();
  return () => clearInterval(relogioAgora);
}

/* ============================================================ PREFERÊNCIAS DO ATENDIMENTO (P0-B) */
async function montarAtendimento(ctx, alvo) {
  const { ui } = ctx;
  const h = ui.h;
  const [L] = await Promise.all([logica(ctx), ui.carregarCss("conversas"), ui.carregarCss("config")]);   // plano 1000b · CB-003: L.nomeAssinatura na prévia
  const caixa = h("div", { class: "pilha" });
  ui.limpar(alvo);
  alvo.append(
    h("header", { class: "cab-pag" },
      h("div", null, h("p", { class: "rotulo" }, "Atendimento"), h("h2", { class: "titulo-pag" }, "Preferências do atendimento"),
        h("p", { class: "sub" }, "Valem para toda a equipe desta empresa, em todos os números."))),
    caixa);
  let cfg = null;

  async function carregar() {
    ui.limpar(caixa);
    caixa.appendChild(ui.esqueleto("cartoes", 2));
    try { cfg = (await ctx.api.rpcC("nx_cv_base")).cfg || { recibo_leitura: true, assinatura: false }; desenhar(); }
    catch (e) { ui.limpar(caixa); caixa.appendChild(ui.erroCartao(e, carregar)); }
  }

  function opcao(chave, titulo, texto, extra) {
    const c = ui.campo({ rotulo: titulo, nome: chave, tipo: "interruptor", valor: !!cfg[chave] });
    const inp = c.querySelector("input");
    // plano 1000 · AS-233: o próprio controle diz «Salvando…» e depois «Salvo» por 2 s (o toast solto não dizia qual preferência)
    const estado = h("span", { class: "cfg-pref-estado fraco", role: "status", "aria-live": "polite" });
    c.appendChild(estado);
    let relogio = null;
    inp.addEventListener("change", async () => {
      const valor = inp.checked;
      inp.disabled = true;
      clearTimeout(relogio);
      estado.dataset.estado = "salvando"; estado.textContent = "Salvando…";
      try {
        const r = await ctx.api.rpcC("nx_cv_config_salvar", { p_cfg: { [chave]: valor } });
        cfg = { ...cfg, ...(r || {}) };
        estado.dataset.estado = "salvo"; estado.textContent = "Salvo";
        relogio = setTimeout(() => { if (estado.dataset.estado === "salvo") { estado.textContent = ""; delete estado.dataset.estado; } }, 2000);
        if (extra) extra.atualizar();
      } catch (e) {
        inp.checked = !valor;
        estado.textContent = ""; delete estado.dataset.estado;
        ui.toast(ui.mensagemErro(e), { tipo: "erro" });
      } finally { inp.disabled = false; }
    });
    return h("section", { class: "cartao cfg-pref" }, c, h("p", { class: "sub" }, texto), extra ? extra.el : null);
  }

  function previaAssinatura() {
    // plano 1000b · CB-003: a mesma regra do teto e do «Sai como» do composer (L.nomeAssinatura = a do nx-enviar no ar); quando o CB-002
    // levar o servidor ao primeiroNome (sem o «Dra.»), muda só o nomeAssinatura e os três continuam iguais ao que sai
    const nome = L.nomeAssinatura((ctx.sessao && ctx.sessao.conta && ctx.sessao.conta.nome) || "Ana") || "Ana";
    const el = h("div", { class: "cv-previa cfg-previa-ass" });
    return { el, atualizar() {
      ui.limpar(el);
      if (cfg.assinatura) el.append(h("b", null, `${nome}:`), "\n");
      el.append("Olá! Já separei as informações que você pediu. Qualquer dúvida, é só chamar.");   // plano 1500c · CC-130: frase que serve para qualquer negócio
      // plano 2000d · DC-053: a recepção não acha que tudo vai sair com o nome do admin
      if (cfg.assinatura) el.append(h("small", { class: "sub cfg-previa-ass-nota" }, "Exemplo com o seu nome — cada pessoa assina com o próprio primeiro nome."));
    } };
  }

  function desenhar() {
    ui.limpar(caixa);
    const ass = previaAssinatura();
    ass.atualizar();
    caixa.append(
      opcao("recibo_leitura", "Confirmação de leitura",
        // plano 1500c · CC-335: o efeito por tipo de número (no CodeWords o Órbita não marca como lida; quem decide é o aparelho)
        "Quando alguém da equipe abre a conversa, o cliente vê no WhatsApp dele que a mensagem foi lida. Desligado, a leitura fica só aqui na central. Vale para os números da Meta. No número do CodeWords o Órbita e a IA não mandam a confirmação de leitura, ligada ou desligada."),
      opcao("assinatura", "Assinar com o nome de quem atende",
        "Cada mensagem sai com o primeiro nome de quem respondeu na primeira linha, em negrito — o cliente sabe com quem está falando.", ass));
  }

  await carregar();
}

/* ============================================================ ASSISTENTE DE IA (P0-B) */
const IA_TEXTOS = [
  ["sobre", "Sobre a empresa", "Quem somos, diferenciais e para quem atendemos."],
  ["servicos", "Serviços e informações", "O que oferecemos, faixas de preço que podem ser informadas, pagamentos e convênios."],
  ["horarios", "Horários de atendimento", "Dias e horários de funcionamento e disponibilidade da equipe."],
  ["regras", "Regras de atendimento", "Ex.: confirmar nome e serviço; nunca marcar sem confirmar o horário."],
  ["proibido", "O que nunca dizer", "Ex.: diagnóstico por mensagem, promessa de resultado ou preço fechado sem avaliação."],
  ["memoria_aprovada", "Memória operacional aprovada", "Registre somente aprendizados confirmados pela equipe: respostas frequentes, preferências de atendimento e procedimentos internos. Não inclua dados pessoais ou de saúde."],
];

const IA_CAMPOS_EXTRA = [
  ["assistente_nome", "Nome do assistente", "Como o agente se apresenta no WhatsApp."],
  ["endereco", "Endereço", "Endereço, referência, estacionamento e como chegar."],
  ["boas_vindas", "Mensagem de boas-vindas", "Primeira mensagem que o agente deve usar ao iniciar o atendimento."],
];

async function montarIA(ctx, alvo) {
  const { ui } = ctx;
  const h = ui.h;
  const [L] = await Promise.all([logica(ctx), ui.carregarCss("conversas")]);
  const caixa = h("div", { class: "pilha" });
  let haAlteracao = () => false;      // plano 1000 · AS-082: o hub pergunta antes de trocar de seção com alteração não salva
  let semVersaoIA = false;            // plano 2000d · DC-050: servidor sem p_versao (PGRST202) — salva como antes
  /** plano 1500c · CC-129: um número CodeWords — copia o prompt novo (mesma receita do assistente do número); vários — abre Números. */
  function copiarPromptAtualizado(cws) {
    if (cws.length !== 1) { ctx.navegar("#/config/numeros"); return; }
    const texto = ctx.api.fn("nx-codewords", { acao: "receita", canal: cws[0].id })
      .then(r => { const t = r && r.ok !== false ? String(r.prompt || "") : ""; if (!t) throw new Error("sem_prompt"); return t; });
    texto.catch(() => { /* o aviso sai abaixo */ });
    const copiando = typeof ui.copiarDepois === "function" ? ui.copiarDepois(texto, { aviso: null }) : texto.then(t => ui.copiar(t, { aviso: null }));
    Promise.resolve(copiando).then(ok => ui.toast(ok === true ? "Prompt copiado. Cole só no CodeWords: ele tem o endereço secreto deste número."
      : "Não deu para copiar sozinho. Use «Copiar prompt» em Configurações › Números.", { tipo: ok === true ? "ok" : "erro" }),
    () => ui.toast("Não foi possível gerar o prompt agora. Use «Copiar prompt» em Configurações › Números.", { tipo: "erro" }));
  }
  ui.limpar(alvo);
  alvo.append(
    h("header", { class: "cab-pag" },
      h("div", null, h("p", { class: "rotulo" }, "Atendimento"), h("h2", { class: "titulo-pag" }, "Assistente de IA"),
        h("p", { class: "sub" }, "Defina a personalidade e as informações usadas pelo agente do CodeWords. A equipe pode revisar aprendizados e assumir qualquer conversa. As alterações só valem no fluxo após atualizar o prompt do CodeWords."))),
    caixa);

  async function carregar() {
    ui.limpar(caixa);
    caixa.appendChild(ui.esqueleto("cartoes", 2));
    try { desenhar(await ctx.api.rpcC("nx_cv_base")); }
    catch (e) { ui.limpar(caixa); caixa.appendChild(ui.erroCartao(e, carregar)); }
  }

  function desenhar(base) {
    ui.limpar(caixa);
    const ia = base.ia || {};
    const cfg = (base.config && base.config.ia) || null;
    if (!cfg) {
      caixa.appendChild(ui.vazio({ titulo: "Só administradores configuram o assistente.", icone: "cadeado", texto: "Peça ao administrador da sua empresa." }));
      return;
    }
    const cota = ia.cota || {};
    caixa.appendChild(ia.ligada
      ? h("section", { class: "cartao cfg-ia-status" },
          h("div", { class: "linha" }, ui.pilula("Sugestões do Órbita disponíveis", "ok", { icone: "ia" })),
          ui.barraUso("Sugestões da equipe usadas neste mês", cota.usadas || 0, cota.limite ?? null),
          h("p", { class: "sub" }, "Este limite é das sugestões feitas no chat do Órbita. O agente CodeWords e sua ativação são configurados em cada número de WhatsApp."))
      : h("div", { class: "aviso aviso-aten" }, ui.icone("ia"),
          h("p", null, h("b", null, "Sugestões de IA do Órbita indisponíveis. "), "Estas informações ainda podem ser preparadas para o agente CodeWords; a ativação depende do canal.")));

    const f = h("form", { class: "pilha cartao cfg-ia", novalidate: true });
    // plano 1000b · CB-082: o contador não é região viva (era lido a cada tecla); o leitor de tela ouve só ao cruzar 80% e 100% (como o composer)
    const cont = h("div", { class: "cfg-ia-cont" });
    const contAnuncio = h("span", { class: "sr-only cfg-ia-cont-anuncio", role: "status", "aria-live": "polite", "aria-atomic": "true" }, "");
    let faixaAnunciada = null;
    const barra = h("div", { class: "uso-barra" }, h("i"));
    const salvar = h("button", { type: "submit", class: "bt bt-prim" }, "Salvar assistente");
    const sujo = h("span", { class: "sub", hidden: true }, "Alterações não salvas");
    haAlteracao = () => !sujo.hidden && sujo.isConnected;
    const tas = {};
    for (const [k, rot, ph] of IA_CAMPOS_EXTRA) {
      const c = ui.campo({ rotulo: rot, nome: k, tipo: k === "assistente_nome" ? "texto" : "textarea",
        linhas: k === "boas_vindas" ? 3 : 2, max: k === "assistente_nome" ? 40 : k === "endereco" ? 300 : 500,
        valor: cfg[k] || "", placeholder: ph });
      const ctl = c.querySelector(`[name="${k}"]`);
      ctl.addEventListener("input", () => { sujo.hidden = false; atualizarPrevia(); });
      f.appendChild(c);
    }
    for (const [k, rot, ph] of IA_TEXTOS) {
      const c = ui.campo({ rotulo: rot, nome: k, tipo: "textarea", linhas: k === "sobre" || k === "servicos" || k === "memoria_aprovada" ? 4 : 3,
        max: k === "memoria_aprovada" ? 3000 : L.IA_MAX, valor: cfg[k] || "", placeholder: ph });
      tas[k] = c.querySelector("textarea");
      tas[k].addEventListener("input", () => { contar(); atualizarPrevia(); });
      // plano 1500c · CC-125/CC-126: horário e serviços vêm da agenda (a IA não diz um horário e a agenda oferece outro)
      if (k === "horarios" || k === "servicos") {
        const b = h("button", { type: "button", class: "bt bt-fant bt-p cfg-ia-da-agenda", dataset: { campo: k } }, ui.icone("calendario"),
          k === "horarios" ? "Usar o horário da agenda" : "Trazer serviços da agenda");
        b.addEventListener("click", () => trazerDaAgenda(k, b));
        c.appendChild(b);
      }
      f.appendChild(c);
    }
    async function trazerDaAgenda(k, b) {
      let cfgAg = null;
      try { cfgAg = ((await ui.carregando(b, ctx.api.rpcC("nx_agenda_config_ver", {}))) || {}).config || null; }
      catch (e) { ui.toast(ui.mensagemErro(e), { tipo: "erro" }); return; }
      if (!cfgAg) { ui.toast("A agenda ainda não tem configuração.", { tipo: "info" }); return; }
      const ta = tas[k];
      if (k === "horarios") {
        const novo = L.textoHorarioIA(cfgAg.horario, cfgAg.intervalos);
        if (ta.value.trim() && ta.value.trim() !== novo && !(await ui.confirmar({ titulo: "Trocar o texto dos horários?", rotulo: "Trocar",
          texto: `Fica assim: «${novo}». O texto atual sai.` }))) return;
        ta.value = novo;
      } else {
        const linhas = L.linhasServicosIA(cfgAg.duracoes, ta.value);
        if (!linhas.length) { ui.toast(Object.keys(cfgAg.duracoes || {}).length ? "Os serviços da agenda já estão no texto." : "A agenda ainda não tem serviços com duração (Configurações › Agenda).", { tipo: "info" }); return; }
        ta.value = `${ta.value.replace(/\s+$/, "")}${ta.value.trim() ? "\n" : ""}${linhas.join("\n")}`;
        ui.toast(`${linhas.length} ${linhas.length === 1 ? "serviço trazido" : "serviços trazidos"} da agenda.`, { tipo: "ok" });
      }
      contar(); atualizarPrevia();
      try { ta.focus(); } catch { /* ok */ }
    }
    const opTom = (valor, titulo, texto) => {
      const id = `cfg-tom-${valor}`;
      return h("label", { class: "cfg-opcao", for: id },
        h("input", { type: "radio", name: "tom", id, value: valor, checked: (cfg.tom || "proximo") === valor }),
        h("span", null, h("b", null, titulo), h("small", null, texto)));
    };
    const cTom = h("fieldset", { class: "campo", dataset: { campo: "tom" } }, h("legend", null, "Tom das respostas"),
      h("div", { class: "cfg-opcoes" }, opTom("proximo", "Próximo", "«Oi, Maria! Tudo bem?» — leve, com você."), opTom("formal", "Formal", "«Olá, Sra. Maria.» — sóbrio, com senhor/senhora.")));
    cTom.addEventListener("change", () => { sujo.hidden = false; atualizarPrevia(); });
    const previa = h("pre", { class: "cfg-codigo cfg-ia-previa", tabindex: "0", "aria-label": "Prévia das instruções do assistente" });
    const blocoPrevia = h("section", { class: "cartao cfg-ia-preview" },
      h("div", { class: "cfg-ia-preview-head" }, h("div", null, h("p", { class: "rotulo" }, "PRÉVIA APROXIMADA"), h("h2", { class: "titulo-sec" }, "Prévia das instruções")),
        ui.pilula("Aproximada · atualiza enquanto você digita", "aten")),
      // plano 1000 · AS-152: esta prévia é montada no navegador; o prompt REAL sai do servidor (receita do CodeWords) e pode ter mais regras
      h("p", { class: "sub" }, "Esta prévia é montada aqui na tela e serve para conferir o conteúdo: o texto real que o agente recebe é gerado pelo servidor e tem regras a mais. Para ver e copiar o prompt real, salve e use «Copiar prompt» em Configurações → Números de WhatsApp."), previa);
    // plano 2000d · DC-047: «Testar» — uma pergunta de cliente de mentira respondida com o que está NA TELA (ainda não salvo);
    // nx-ia {acao: "simular"} não grava conversa nem gasta a franquia de sugestões. Servidor sem a ação → o aviso diz isso.
    const inTeste = h("input", { type: "text", id: "cfg-ia-teste", maxlength: 1000, placeholder: "Ex.: Quanto custa um clareamento?", autocomplete: "off", enterkeyhint: "send" });
    const btTeste = h("button", { type: "button", class: "bt bt-sec cfg-ia-testar" }, ui.icone("ia"), "Testar");
    const respTeste = h("div", { class: "cfg-ia-teste-resp", role: "status", "aria-live": "polite" });
    async function testarAssistente() {
      const mensagem = inTeste.value.trim();
      if (!mensagem) { ui.toast("Escreva o que um cliente perguntaria.", { tipo: "info" }); try { inTeste.focus(); } catch { /* ok */ } return; }
      const d = ui.lerForm(f);
      const ia = { tom: d.tom === "formal" ? "formal" : "proximo" };
      for (const [k] of IA_TEXTOS) ia[k] = d[k] || "";
      ui.limpar(respTeste);
      respTeste.appendChild(h("p", { class: "sub" }, "Perguntando ao assistente…"));
      try {
        const r = await ui.carregando(btTeste, ctx.api.fn("nx-ia", { acao: "simular", mensagem, ia, empresa: String(ctx.cliente?.nome || "").trim() }));
        ui.limpar(respTeste);
        if (r && r.texto) {
          respTeste.append(h("div", { class: "cv-previa cfg-ia-teste-bolha cfg-previa-in" }, h("small", { class: "rotulo" }, "Cliente"), h("p", null, mensagem)),
            h("div", { class: "cv-previa cfg-ia-teste-bolha cfg-ia-teste-ia" }, h("small", { class: "rotulo" }, "Assistente (teste, nada foi enviado)"), h("p", null, r.texto)));
        } else respTeste.appendChild(h("p", { class: "sub" }, r && r.erro === "dados_invalidos" ? "Este servidor ainda não testa o assistente por aqui." : "O assistente não respondeu agora. Tente de novo."));
      } catch (e) {
        ui.limpar(respTeste);
        respTeste.appendChild(h("p", { class: "sub" }, e && (e.codigo === "dados_invalidos" || e.status === 404) ? "Este servidor ainda não testa o assistente por aqui." : ui.mensagemErro(e)));
      }
    }
    btTeste.addEventListener("click", testarAssistente);
    inTeste.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); testarAssistente(); } });
    const blocoTeste = h("section", { class: "cartao cfg-ia-teste" },
      h("p", { class: "rotulo" }, "TESTAR"), h("h2", { class: "titulo-sec" }, "Pergunte como um cliente"),
      h("p", { class: "sub" }, "A resposta usa o que está nesta tela, mesmo sem salvar. Nada é enviado a ninguém."),
      h("div", { class: "campo" }, h("label", { for: "cfg-ia-teste" }, "Mensagem do cliente"), h("div", { class: "linha" }, inTeste, btTeste)), respTeste);
    f.append(cTom, blocoPrevia, blocoTeste,
      h("div", { class: "cfg-ia-rod" }, h("div", { class: "cfg-ia-medidor" }, cont, contAnuncio, barra), h("div", { class: "linha" }, sujo, salvar)));

    function atualizarPrevia() {
      const d = ui.lerForm(f);
      const empresa = String(ctx.cliente?.nome || ctx.cliente?.razao_social || "sua empresa").trim();
      const nome = d.assistente_nome || "Assistente";
      const partes = [
        `Você é ${nome}, assistente de atendimento de ${empresa}.`,
        `Tom de voz: ${d.tom === "formal" ? "formal, respeitoso e objetivo" : "próximo, acolhedor e claro"}.`,
        d.boas_vindas ? `Boas-vindas: ${d.boas_vindas}` : "Cumprimente a pessoa com naturalidade e pergunte como pode ajudar.",
        d.sobre ? `Sobre a empresa:\n${d.sobre}` : "",
        d.servicos ? `Serviços e informações:\n${d.servicos}` : "",
        d.horarios ? `Horários:\n${d.horarios}` : "",
        d.endereco ? `Endereço:\n${d.endereco}` : "",
        d.regras ? `Regras de atendimento:\n${d.regras}` : "",
        d.proibido ? `Nunca faça ou diga:\n${d.proibido}` : "",
        d.memoria_aprovada ? `Memória operacional aprovada pela equipe (contexto revisado, não é treinamento automático):\n${d.memoria_aprovada}` : "",
        "Regras de segurança: não invente preços, horários ou políticas. Quando faltar uma informação, diga que vai confirmar com a equipe. Não faça diagnóstico nem prometa resultados. Se a pessoa pedir ajuda humana, encaminhe para a equipe.",
      ].filter(Boolean);
      previa.textContent = partes.join("\n\n");
    }

    function contar() {
      const obj = {}; for (const k in tas) obj[k] = tas[k].value;
      const n = L.contarIA(obj);
      cont.textContent = `${n.toLocaleString("pt-BR")} / ${L.IA_MAX.toLocaleString("pt-BR")} caracteres`;
      const p = Math.min(100, Math.round((n / L.IA_MAX) * 100));
      barra.firstChild.style.setProperty("--p", `${p}%`);
      barra.classList.toggle("alta", p >= 80 && p < 100);
      barra.classList.toggle("cheia", n > L.IA_MAX);
      cont.dataset.alerta = n > L.IA_MAX ? "1" : "0";
      salvar.disabled = n > L.IA_MAX;
      const faixa = n > L.IA_MAX ? 2 : p >= 80 ? 1 : 0;   // CB-082
      if (faixaAnunciada !== null && faixa !== faixaAnunciada && faixa > 0)
        contAnuncio.textContent = faixa === 2 ? `Passou do limite: ${cont.textContent}.` : `Perto do limite: ${cont.textContent}.`;
      faixaAnunciada = faixa;
      sujo.hidden = false;
      return n;
    }
    contar();
    sujo.hidden = true;

    f.addEventListener("submit", async ev => {
      ev.preventDefault();
      // plano 1500c · CC-128: o limite do aviso vem do L.IA_MAX (o mesmo da conta), não escrito à mão
      const textoLimite = `Passou de ${L.IA_MAX.toLocaleString("pt-BR")} caracteres. Resuma algum texto.`;
      if (contar() > L.IA_MAX) { ui.toast(textoLimite, { tipo: "erro" }); return; }
      const d = ui.lerForm(f);
      // plano 1000 · AS-153: a memória aprovada vai para o agente — CPF, telefone, e-mail ou data de nascimento ali pedem confirmação
      // plano 2000d · DC-049: todos os textos do assistente (não só a memória) — e o aviso diz em qual campo achou
      const camposConferir = [...IA_TEXTOS.map(([k, rot]) => [k, rot]), ["boas_vindas", "Mensagem de boas-vindas"]];
      const achadosPorCampo = camposConferir.map(([k, rot]) => [k, rot, dadosPessoaisNoTexto(d[k])]).filter(([, , a]) => a.length);
      const pessoais = achadosPorCampo.flatMap(([, , a]) => a);
      const soMemoria = achadosPorCampo.length === 1 && achadosPorCampo[0][0] === "memoria_aprovada";
      if (pessoais.length && !(await ui.confirmar({ titulo: soMemoria ? "A memória aprovada parece ter dados pessoais" : "O assistente parece ter dados pessoais", rotulo: "Salvar mesmo assim", perigo: true,
        texto: soMemoria
          ? `Encontrei ${pessoais.map(p => `${p.tipo} («${p.trecho}»)`).join(", ")}. O assistente usa esse texto com todos os clientes: tire dados pessoais ou de saúde antes de salvar.`
          : `Encontrei ${achadosPorCampo.map(([, rot, a]) => `em «${rot}»: ${a.map(p => `${p.tipo} («${p.trecho}»)`).join(", ")}`).join("; ")}. O assistente usa esses textos com todos os clientes: tire dados pessoais ou de saúde antes de salvar.` }))) {
        const primeiro = achadosPorCampo[0] && tas[achadosPorCampo[0][0]];
        if (primeiro) primeiro.focus();
        return;
      }
      const payload = { tom: d.tom === "formal" ? "formal" : "proximo",
        assistente_nome: d.assistente_nome || "", endereco: d.endereco || "", boas_vindas: d.boas_vindas || "" };
      for (const [k] of IA_TEXTOS) payload[k] = d[k] || "";
      // plano 2000d · DC-050: manda a versão lida (atualizado_em) — quem abriu antes não apaga a edição do colega sem saber
      const versaoLida = cfg && (cfg.atualizado_em || (base.config && base.config.atualizado_em)) || null;
      const salvarIA = async () => {
        if (versaoLida && !semVersaoIA) {
          try { return await ctx.api.rpcC("nx_ia_config_salvar", { p_ia: payload, p_versao: versaoLida }); }
          catch (e) { if (!L.rpcAusente(e)) throw e; semVersaoIA = true; }
        }
        return ctx.api.rpcC("nx_ia_config_salvar", { p_ia: payload });
      };
      try {
        await ui.carregando(salvar, salvarIA());
        avisoVersao.hidden = true;
        sujo.hidden = true;
        // plano 1500c · CC-129: só vale depois de atualizar o prompt do CodeWords — o aviso já oferece copiar o prompt novo
        const cws = ((base && base.canais) || []).filter(k => k && k.provedor === "codewords");
        ui.toast(cws.length ? "Assistente salvo. Atualize o prompt no CodeWords para valer no WhatsApp." : "Assistente salvo.", { tipo: "ok",
          acao: cws.length ? { rotulo: cws.length === 1 ? "Copiar prompt atualizado" : "Abrir Números", fn: () => copiarPromptAtualizado(cws) } : null });
      } catch (e) {
        if (e && e.codigo === "dados_invalidos" && e.hint === "tamanho") ui.toast(textoLimite, { tipo: "erro" });
        else if (e && (Number(e.status) === 409 || e.codigo === "versao_mudou" || e.codigo === "conflito")) {
          // DC-050: outra pessoa salvou depois que esta tela abriu — o formulário continua sujo e o aviso oferece ver a versão salva
          const quando = (e.resposta && e.resposta.atualizado_em) || e.atualizado_em || null;
          const quem = (e.resposta && e.resposta.atualizado_por_nome) || "Outra pessoa";
          ui.limpar(avisoVersao);
          avisoVersao.append(ui.icone("alerta"), h("span", null, `${quem} salvou o assistente${quando ? ` às ${L.horaMsg(quando)}` : " depois que você abriu esta tela"}. Salvar agora apagaria a mudança.`),
            h("button", { type: "button", class: "bt bt-sec bt-p cfg-ia-ver-salva", on: { click: async () => {
              if (await ui.confirmar({ titulo: "Ver a versão salva?", rotulo: "Ver a versão salva", texto: "O que você mudou aqui e não salvou será descartado." })) carregar();
            } } }, "Ver a versão salva"));
          avisoVersao.hidden = false;
          sujo.hidden = false;
        }
        else ui.toast(ui.mensagemErro(e), { tipo: "erro" });
      }
    });
    atualizarPrevia();
    const avisoVersao = h("div", { class: "aviso aviso-aten cfg-ia-versao", role: "alert", hidden: true });   // plano 2000d · DC-050
    f.prepend(avisoVersao);
    caixa.appendChild(f);
  }

  await carregar();
  return {
    pendente: () => haAlteracao(),
    podeSair: async () => !haAlteracao() || ui.confirmar({ titulo: "Sair sem salvar o assistente?", rotulo: "Sair sem salvar", perigo: true,
      texto: "As alterações do assistente de IA ainda não foram salvas e serão perdidas." }),
  };
}

export const secoesConfig = [
  { id: "numeros", titulo: "Números de WhatsApp", desc: "Conecte o WhatsApp pelo CodeWords ou pela Meta", grupo: "Atendimento", papelMin: "admin", modulo: "conversas", icone: "whatsapp", montar: montarNumeros },
  { id: "respostas", titulo: "Respostas rápidas", desc: "Frases prontas que a equipe usa com /", grupo: "Atendimento", papelMin: "supervisor", modulo: "conversas", icone: "chat", montar: montarRespostas },
  { id: "atendimento", titulo: "Preferências do atendimento", desc: "Confirmação de leitura e assinatura", grupo: "Atendimento", papelMin: "admin", modulo: "conversas", icone: "engrenagem", montar: montarAtendimento },
  { id: "ia", titulo: "Assistente de IA", desc: "O que a IA sabe e como ela fala", grupo: "Atendimento", papelMin: "admin", modulo: "conversas", icone: "ia", montar: montarIA },
  { id: "departamentos", titulo: "Departamentos e horários", desc: "Quem atende o quê e em qual horário", grupo: "Equipe", papelMin: "admin", modulo: "conversas", icone: "usuario", montar: montarDepartamentos },
];
