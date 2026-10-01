/* ============================================================
   ÓRBITA — api.js · frente F3 · ESPEC §5.1, §6.1, §7.2, Apêndice B
   Cliente das RPCs (PostgREST) e das Edge Functions, sem SDK.
   Só o app.js carrega este arquivo; os módulos usam ctx.api.
   Erros sempre viram Error com .codigo e .hint:
     - PostgREST {message, hint} → .codigo = message
     - 57014 (statement timeout)  → .codigo = 'tempo_esgotado'
     - {ok:false, erro, detalhe}  → .codigo = erro (nx_convite_aceitar, Edge Functions)
     - rede fora                  → .codigo = 'sem_conexao'
   'sessao_invalida' chama o callback do shell (volta ao login).
   ============================================================ */

export const MENSAGENS = {
  resposta_invalida: "O servidor respondeu em formato inesperado. Atualize os dados; se tentou salvar ou enviar, confira o resultado antes de repetir.",
  // do painel clássico (web/dados.js), com a marca no lugar de "Nexus"
  sessao_invalida: "Sua sessão expirou. Entre para continuar; o que você digitou fica guardado.",
  conta_pendente: "Sua conta ainda está aguardando aprovação.",
  credenciais_invalidas: "E-mail ou senha não conferem.",
  codigo_invalido: "Código de ativação inválido.",
  email_invalido: "Esse e-mail não parece válido.",
  email_em_uso: "Já existe uma conta com esse e-mail. Tente entrar.",
  senha_curta: "A senha precisa ter pelo menos 8 caracteres.",
  nome_invalido: "Informe o nome.",
  sem_acesso: "Sua conta não tem acesso a esta empresa.",
  so_gestor: "Só a equipe da plataforma pode fazer essa alteração.",
  lead_nao_encontrado: "Não encontramos esse registro — ele pode ter sido removido.",
  cliente_nao_encontrado: "Esta empresa não foi encontrada.",
  nao_pode_rebaixar_a_si: "Você não pode tirar o seu próprio acesso de gestor.",
  papel_invalido: "Tipo de acesso inválido.",
  sem_conexao: "A comunicação foi interrompida. Atualize os dados; se tentou salvar ou enviar, confira o resultado antes de repetir.",
  tempo_rede: "O servidor demorou a responder. Atualize os dados; se tentou salvar ou enviar, confira o resultado antes de repetir.",
  // Apêndice B
  sem_permissao: "Seu acesso não permite fazer isso. Fale com o administrador.",
  conta_suspensa: "O acesso desta empresa está suspenso. Fale com o suporte.",
  teste_expirado: "O período de teste terminou. Para continuar, fale com o suporte.",
  modulo_desligado: "Esta área não faz parte do seu plano.",
  limite_plano: "Seu plano chegou ao limite. Para aumentar, fale com o suporte.",
  tempo_esgotado: "Operação grande demais; tente um período menor ou menos itens de uma vez.",
  periodo_grande: "Escolha um período de até 1 ano.",
  funcao_invalida: "Essa tarefa não pode ser executada daqui.",
  so_plataforma: "Só a equipe da plataforma pode fazer essa alteração.",
  convite_invalido: "Este convite não vale mais. Peça um novo ao administrador.",
  link_invalido: "Este link não vale mais. Peça um novo ao administrador.",
  ultimo_admin: "A empresa precisa de pelo menos um administrador.",
  nao_pode_alterar_a_si: "Você não pode mudar o seu próprio papel.",
  slug_em_uso: "Esse endereço já está em uso.",
  dominio_em_uso: "Esse domínio já está em uso.",
  numero_em_uso: "Esse número já está em uso.",
  atalho_em_uso: "Esse atalho já está em uso.",
  dominio_invalido: "Domínio inválido. Use algo como crm.suaempresa.com.br.",
  marca_invalida: "Confira os campos da marca.",
  telefone_em_uso: "Já existe um cadastro com esse telefone.",
  telefone_invalido: "Confira os dados informados.",
  dados_invalidos: "Confira os dados informados.",
  contato_nao_encontrado: "Não encontramos esse registro — ele pode ter sido removido.",
  negocio_nao_encontrado: "Não encontramos esse registro — ele pode ter sido removido.",
  conversa_nao_encontrada: "Não encontramos esse registro — ele pode ter sido removido.",
  canal_nao_encontrado: "Não encontramos esse registro — ele pode ter sido removido.",
  mensagem_nao_encontrada: "Não encontramos esse registro — ele pode ter sido removido.",
  midia_nao_encontrada: "Não encontramos esse registro — ele pode ter sido removido.",
  tarefa_nao_encontrada: "Não encontramos esse registro — ele pode ter sido removido.",
  nota_nao_encontrada: "Não encontramos esse registro — ele pode ter sido removido.",
  etiqueta_nao_encontrada: "Não encontramos esse registro — ele pode ter sido removido.",
  empresa_nao_encontrada: "Não encontramos esse registro — ele pode ter sido removido.",
  automacao_nao_encontrada: "Não encontramos esse registro — ele pode ter sido removido.",
  estagio_invalido: "Essa etapa não é válida.",
  funil_invalido: "Esse funil não é válido.",
  valor_obrigatorio: "Informe o valor para marcar como ganho.",
  motivo_obrigatorio: "Escolha o motivo da perda.",
  campo_obrigatorio: "Preencha os campos obrigatórios antes de continuar.",
  estagio_com_negocios: "Essa etapa tem negócios. Escolha para onde eles vão.",
  conversa_resolvida: "Atendimento resolvido. Reabra para responder.",
  ja_existe_aberta: "Já existe um atendimento aberto com esse contato.",
  fora_da_janela: "Mais de 24 h desde a última mensagem do cliente. Envie um modelo aprovado.",
  canal_sem_token: "Este número ainda não tem o token da Meta. Configure em Números de WhatsApp.",
  codewords_sem_credencial: "Este canal está sem a chave de API reutilizável. Configure CodeWords em Números de WhatsApp.",
  codewords_sem_aparelho: "Este número ainda não foi pareado no CodeWords, então nada pode ser enviado. Faça o pareamento em Configurações › Números de WhatsApp.",
  codewords_falhou: "O CodeWords não concluiu o pedido. Tente de novo em instantes.",
  aparelho_nao_encontrado: "Este número ainda não foi pareado no CodeWords. Use «Parear» em Configurações › Números de WhatsApp e digite o código no celular.",
  numero_diferente: "O aparelho pareado não é o número deste canal. Nada foi enviado; refaça o pareamento em Configurações › Números de WhatsApp.",
  aparelho_desconectado: "O WhatsApp deste número está desconectado do CodeWords. Termine o pareamento no celular e tente de novo.",
  metodo_invalido: "O servidor não aceitou esse pedido. Atualize a página e tente de novo.",
  erro_interno: "O servidor falhou ao concluir o pedido. Tente de novo em instantes; se continuar, fale com o suporte.",
  codewords_tipo_nao_suportado: "Este canal CodeWords envia somente mensagens de texto. Para anexos e modelos, use um canal Meta.",
  use_testar_codewords: "Confira o estado do aparelho em Configurações → Números de WhatsApp.",
  envio_falhou: "O canal não aceitou a mensagem.",
  template_invalido: "Esse modelo não está aprovado ou faltam parâmetros.",
  midia_grande: "Arquivo grande demais (até 16 MB; fotos até 5 MB).",
  midia_tipo: "Tipo de arquivo não aceito pelo WhatsApp.",
  ia_indisponivel: "A IA não está disponível agora.",
  ia_cota: "A cota de IA do mês acabou. Ela volta no começo do próximo mês; para usar mais agora, fale com o suporte.",
  sem_chave: "A IA ainda não foi ligada nesta plataforma: falta a chave da Anthropic. Avise a equipe da Nexus para ativar.",
  ia_desligada: "A IA está desligada nesta plataforma. Avise a equipe da Nexus para ativar.",
  ia_resposta_invalida: "A IA respondeu de um jeito que não deu para usar. Tente descrever com outras palavras.",
  ia_invalida: "A IA respondeu de um jeito que não deu para usar. Tente descrever com outras palavras.",
  descricao_invalida: "Descreva o que você quer automatizar (de 12 a 1.500 caracteres).",
  descricao_curta: "Conte um pouco mais: descreva quando acontece e o que deve ser feito.",
  descricao_longa: "O pedido ficou longo demais. Resuma em até 1.500 caracteres.",
  campo_invalido: "Um dos campos escolhidos não existe mais ou não vale aqui. Confira o campo marcado.",
  etapa_invalida: "Essa etapa não é válida para este funil. Escolha outra.",
  etiqueta_invalida: "Essa etiqueta não existe mais. Escolha outra.",
  pessoa_invalida: "Essa pessoa não está mais na equipe. Escolha outra.",
  departamento_invalido: "Esse departamento não existe mais. Escolha outro.",
  gatilho_invalido: "Esse gatilho não é válido. Escolha outro em «Quando».",
  acao_invalida: "Um dos passos não é válido. Confira o passo marcado.",
  condicao_invalida: "Uma das condições não é válida. Confira a condição marcada.",
  tempo_invalido: "O tempo informado não vale. Use de 1 minuto a 30 dias.",
  passo_invalido: "Um dos passos não é válido. Confira o passo marcado.",
  simulacao_indisponivel: "O teste não está disponível agora. Você ainda pode salvar a automação desligada e conferir depois.",
  muitos_pedidos: "Muitos pedidos seguidos; espere um minuto.",
  automacao_invalida: "A automação tem um problema.",
  limite_taxa: "Muitos envios em pouco tempo. Tente mais tarde.",
  // erros de servidor/rede (M15): o texto técnico (http_503, servico_indisponivel) nunca chega à tela
  servico_indisponivel: "O servidor está fora do ar neste momento. Tentamos de novo sozinhos; se continuar, avise o suporte.",
  http_429: "Muitos pedidos de uma vez. Espere um instante e tente de novo.",
  http_500: "O servidor falhou ao concluir o pedido. Tente de novo em instantes; se continuar, fale com o suporte.",
  http_502: "O servidor está fora do ar neste momento. Tentamos de novo sozinhos; se continuar, avise o suporte.",
  http_503: "O servidor está fora do ar neste momento. Tentamos de novo sozinhos; se continuar, avise o suporte.",
  http_504: "O servidor demorou demais para responder. Se tentou salvar ou enviar, confira o resultado antes de repetir.",
};

/**
 * Mensagens por contexto (M14), só para erros criados por um api com `contexto: true` (o shell liga): leitura offline não fala em
 * "salvar"; escrita offline diz que NADA foi salvo; "confira antes de repetir" fica só para o prazo estourado de uma escrita, que
 * pode ter chegado ao servidor.
 */
function mensagemDeContexto(codigo, ctx) {
  const leitura = !!ctx.leitura;
  if (codigo === "sem_conexao") {
    if (ctx.comCache) return "Sem internet. Mostrando o que já tinha.";
    return leitura ? "Sem internet. Confira a conexão e tente de novo." : "Sem internet: nada foi salvo.";
  }
  if (codigo === "tempo_rede") {
    return leitura ? "O servidor demorou a responder. Tente de novo em instantes."
      : "O servidor demorou a responder. Se tentou salvar ou enviar, confira o resultado antes de repetir.";
  }
  if (/^(servico_indisponivel|http_50[23])$/.test(codigo) && !leitura) return "O servidor está fora do ar neste momento: nada foi salvo. Tente de novo em instantes.";
  return null;
}

const NOME_LIMITE = {
  usuarios: ["usuário", "usuários"], canais: ["número de WhatsApp", "números de WhatsApp"],
  funis: ["funil", "funis"], automacoes: ["automação", "automações"], contatos: ["contato", "contatos"],
  ia_mes: ["sugestão de IA por mês", "sugestões de IA por mês"], empresas: ["cliente", "clientes"],
};
const CAMPO_MARCA = {
  produto: "nome do produto", logo: "logo", logo_claro: "logo para fundo claro", favicon: "ícone da aba",
  cores: "cores", "cores.primaria": "cor primária", "cores.secundaria": "cor secundária", "cores.fundo": "cor de fundo",
  login_titulo: "título do login", login_texto: "texto do login", suporte_wa: "WhatsApp de suporte", assinatura: "assinatura",
};

/** Texto para o usuário a partir de um erro da API (usa .codigo, .hint e .detalhe quando o Apêndice B pede). */
export function mensagemErro(e) {
  const c = e && (e.codigo || e.message);
  const hint = e && e.hint != null ? String(e.hint) : "";
  if (e && e.contexto) { const m = mensagemDeContexto(c, e.contexto); if (m) return m; }
  switch (c) {
    case "limite_plano": {
      const m = /^(org_)?([a-z_]+):(\d+)$/.exec(hint);
      if (m) {
        const [sing, plur] = NOME_LIMITE[m[2]] || [m[2], m[2]];
        const nome = +m[3] === 1 ? sing : plur;
        return m[1] ? `A sua agência chegou ao limite de ${m[3]} ${nome} somando todos os clientes.`
          : `Seu plano permite até ${m[3]} ${nome}. Para aumentar, fale com o suporte.`;
      }
      break;
    }
    case "convite_invalido":
      if (hint === "conta_existente") return "Este convite é só para uma conta nova. Peça outro convite ou use outro e-mail.";
      break;
    case "marca_invalida":
      if (hint) return `Confira o campo ${CAMPO_MARCA[hint] || hint} da marca.`;
      break;
    case "estagio_invalido": case "funil_invalido":
      if (hint === "fechado_no_ads") return "Negócio fechado no funil de anúncios não muda de funil. Use Iniciar pós-venda.";
      if (hint === "sai_do_ads") return "Esse negócio veio do funil de anúncios e só pode ir para outro funil de anúncios.";
      if (hint) return c === "funil_invalido" ? `Esse funil não é válido (${hint}).` : `Essa etapa não é válida (${hint}).`;
      break;
    case "motivo_obrigatorio":
      return `Escolha o motivo da perda${hint === "texto" ? " e escreva a justificativa" : ""}.`;
    case "campo_obrigatorio":
      if (hint) return `Preencha o campo "${hint}" antes de continuar.`;
      break;
    case "estagio_com_negocios":
      if (/^\d+$/.test(hint)) return `Essa etapa tem ${hint} negócio${hint === "1" ? "" : "s"}. Escolha para onde ${hint === "1" ? "ele vai" : "eles vão"}.`;
      break;
    case "envio_falhou": {
      const d = e && (e.detalhe_texto || (typeof e.detalhe === "string" ? e.detalhe : ""));
      if (d) return `O canal não aceitou a mensagem: ${String(d).slice(0, 160)}.`;
      break;
    }
    case "codewords_falhou": {   // o servidor já devolve o motivo em português (não repete o código)
      const d = e && (e.detalhe_texto || (typeof e.detalhe === "string" ? e.detalhe : ""));
      if (d) return String(d).slice(0, 240);
      break;
    }
    case "automacao_invalida":
      if (hint) return `A automação tem um problema: ${hint}.`;
      break;
    case "ia_indisponivel": {   // o nx-ia manda o motivo em .detalhe: sem_chave, sem_sdk, conversa_vazia
      const d = e && (e.detalhe_texto || (typeof e.detalhe === "string" ? e.detalhe : "") || hint);
      if (d === "sem_chave") return MENSAGENS.sem_chave;
      if (d === "sem_sdk") return "A IA está em manutenção neste momento. Tente de novo mais tarde.";
      if (d === "conversa_vazia") return "Ainda não há mensagens nesta conversa para a IA ler.";
      break;
    }
    default: break;
  }
  if (!MENSAGENS[c] && /_nao_encontrad[oa]$/.test(String(c || ""))) return "Não encontramos esse registro — ele pode ter sido removido.";
  return MENSAGENS[c] ||`Não deu certo agora${c ? ` (${String(c).slice(0, 80)})` : ""}. Tente de novo em instantes.`;
}

/** RPCs que só LEEM (podem ser repetidas sem efeito colateral). Tudo que não está aqui é tratado como escrita. */
const LEITURA_SUFIXOS = /_(listar|ver|base|kanban|coluna|buscar)$/;
const LEITURA_NOMES = new Set(["nx_pulso", "nx_app_sessao", "nx_marca_publica", "nx_inicio", "nx_agenda_dia", "nx_agenda_livres", "nx_dados",
  "nx_cv_mensagens", "nx_cv_ia_estado", "nx_cv_buscar_msgs", "nx_automacao_execucoes", "nx_cliente_tema", "nx_integracoes_status", "nx_uso_plano"]);
export function ehLeitura(nome) {
  const n = String(nome || "");
  return LEITURA_NOMES.has(n) || LEITURA_SUFIXOS.test(n) || /^nx_rel_/.test(n);
}

/** Cria um Error no padrão da API. */
export function erroApi(codigo, extra = {}) {
  const e = new Error(codigo);
  e.codigo = codigo;
  Object.assign(e, extra);
  return e;
}

function lerCorpo(txt) {
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return txt; }
}

/** Maior espera aceita por uma Edge Function (o teto delas no Supabase é de ~150 s). */
export const TETO_PRAZO_FN_MS = 145_000;

/**
 * Chamadas cujo SERVIDOR pode levar mais que os 75 s padrão: IA com uma retentativa (Anthropic 45 s × 2 ≈ 91 s: sugerir, resumir),
 * parear do CodeWords (até 90 s), inscrever (60 s) e envio pelo CodeWords com conferência do aparelho (15 s + 60 s). O navegador precisa
 * esperar MAIS que o pior caso do servidor: desistir antes mostraria «tempo_rede» enquanto ele ainda conclui (cota de IA gasta, código de
 * pareamento perdido, mensagem possivelmente enviada).
 */
export const PRAZO_FN_LENTA_MS = 100_000;
const FN_LENTAS = new Set(["nx-ia:sugerir", "nx-ia:resumir", "nx-codewords:parear", "nx-codewords:inscrever",
  "nx-enviar:texto", "nx-enviar:midia", "nx-enviar:template"]);

/** Retentativas das LEITURAS (e das escritas com {req:true}): até 2 repetições, 400 ms e 1,2 s (±25 % de jitter), orçamento de ~8 s por chamada. */
export const RETENTAR_PADRAO = Object.freeze({ tentativas: 2, esperasMs: Object.freeze([400, 1200]), orcamentoMs: 8000, jitter: 0.25 });

/** uuid v4 (identificador da INTENÇÃO de uma escrita, enviado como p_req). */
export function novoUuid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Este erro vale uma nova tentativa? Só transporte e "servidor ocupado" (408/429/502/503/504); regra de negócio, 4xx e sessão nunca. */
export function erroRetentavel(e) {
  if (!e) return false;
  if (e.codigo === "sem_conexao") return true;
  return [408, 429, 502, 503, 504].includes(Number(e.status));
}

/** Retry-After (segundos ou data HTTP) → ms; ausente ou ilegível → null. */
export function lerRetryAfter(v, agora = Date.now()) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Math.min(Number(s), 3600) * 1000;
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.max(0, Math.min(t - agora, 3600_000)) : null;
}

/**
 * Cria o cliente.
 * @param {object} o
 *   url, chave            — SUPA_URL e CHAVE_PUBLICA (de ../dados.js)
 *   token(): string|null  — token atual (nx-token)
 *   cliente(): uuid|null  — empresa ativa
 *   aoSessaoInvalida(e)   — shell volta ao login. Pode devolver uma Promise: nas LEITURAS a chamada espera por ela e, se vier `true`
 *                           (a pessoa entrou de novo), repete a leitura com o token novo; nas escritas o erro sobe na hora.
 *   rede                  — {sucesso(), falha(info), lento(±1)}: o rede.js do shell recebe o resultado FINAL de cada chamada
 *   contexto              — mensagens por contexto (leitura × escrita) nos erros de conexão (o shell liga)
 *   retentar              — true ou {tentativas, esperasMs, orcamentoMs, jitter}: repete leituras e escritas com {req:true}
 *   cache                 — o cache.js do shell ({cacheavel, chaveDe, ler, gravar}): liga rpcC(nome, params, {cache: true, aoCache(dados, em)}) (stale-while-revalidate)
 *   conta()               — id da conta (a chave do cache leva conta + empresa)
 *   aoCache(evento)       — {fase: "servido", em} / {fase: "fim", ok, em}: o shell mostra «Mostrando dados de 14:02 · atualizando…»
 *   agora, esperar(ms), aleatorio(), online() — relógio, espera, sorteio e "tem internet?" (testes)
 *   fetch                 — opcional (testes)
 */
export function criarApi(o) {
  const f = o.fetch || ((...a) => globalThis.fetch(...a));
  const base = String(o.url || "").replace(/\/+$/, "");
  const normalizarPrazo = (v, padrao) => Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(120_000, Number(v)) : padrao;
  const prazoRpc = normalizarPrazo(o.prazoMs ?? o.prazoRpcMs, 20_000);
  const prazoFn = normalizarPrazo(o.prazoMs ?? o.prazoFnMs, 75_000);

  const rede = o.rede || null;                 // M14
  const contexto = !!o.contexto;               // M14: mensagens por contexto (leitura × escrita) nos erros de conexão
  const lentoMs = Number.isFinite(Number(o.lentoMs)) && Number(o.lentoMs) > 0 ? Number(o.lentoMs) : 4000;
  const retentar = o.retentar ? { ...RETENTAR_PADRAO, ...(o.retentar === true ? {} : o.retentar) } : null;   // M15
  const agora = o.agora || (() => Date.now());
  const esperar = o.esperar || (ms => new Promise(r => setTimeout(r, ms)));
  const aleatorio = o.aleatorio || Math.random;
  const estaOnline = o.online || (() => !(typeof navigator !== "undefined" && navigator.onLine === false));
  const avisarRede = (fn, ...a) => { if (rede && typeof rede[fn] === "function") { try { rede[fn](...a); } catch { /* o shell decide */ } } };
  /** aos 4 s sem resposta (somando as repetições) a chamada conta como "lenta" para o estado de conexão; devolve quem encerra a contagem */
  function contarLento() {
    if (!rede) return () => {};
    let ativo = false;
    const t = setTimeout(() => { ativo = true; avisarRede("lento", 1); }, lentoMs);
    return () => { clearTimeout(t); if (ativo) { ativo = false; avisarRede("lento", -1); } };
  }

  const prazoGeralFixo = o.prazoMs != null || o.prazoFnMs != null;
  const prazoDaChamada = (opcoes, chave) => {
    if (prazoGeralFixo) return prazoFn;
    const base = FN_LENTAS.has(chave) ? Math.max(prazoFn, PRAZO_FN_LENTA_MS) : prazoFn;
    const extra = Number(opcoes && opcoes.prazoMs);
    if (!Number.isFinite(extra) || extra <= base) return base;
    return Math.min(TETO_PRAZO_FN_MS, extra);
  };

  async function buscarComPrazo(url, init, ms) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer, expirou = false;
    const rede = (async () => {
      const r = await f(url, { ...init, ...(controller ? { signal: controller.signal } : {}) });
      return { r, txt: await r.text() };
    })();
    const limite = new Promise((_, reject) => {
      timer = setTimeout(() => {
        expirou = true;
        controller?.abort();
        reject(erroApi("tempo_rede"));
      }, ms);
    });
    try {
      return await Promise.race([rede.catch(e => { if (expirou) throw erroApi("tempo_rede"); throw e; }), limite]);
    } finally { clearTimeout(timer); }
  }

  /** UMA tentativa: devolve os dados ou lança Error (.codigo, .status, .hint…). Não fala com o rede.js nem com a sessão. */
  async function tentarUma(url, corpo, prazo, meta) {
    let r, txt;
    try {
      ({ r, txt } = await buscarComPrazo(url, {
        method: "POST",
        headers: { apikey: o.chave, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify((typeof corpo === "function" ? corpo() : corpo) ?? {}),
      }, prazo));
    } catch (causa) {
      const e = causa?.codigo === "tempo_rede" ? causa : erroApi("sem_conexao", { causa });
      if (contexto) e.contexto = { leitura: !!meta.leitura };
      throw e;
    }
    const dados = lerCorpo(txt);
    const obj = dados && typeof dados === "object" && !Array.isArray(dados) ? dados : null;
    if (!r.ok) {
      let codigo = null, hint = null, detalhe = obj;
      if (obj) {
        if (obj.code === "57014" || /statement timeout/i.test(String(obj.message || ""))) codigo = "tempo_esgotado";
        else if (obj.ok === false && obj.erro) { codigo = String(obj.erro); hint = obj.hint ?? null; detalhe = obj.detalhe ?? obj; }
        else if (obj.message) { codigo = String(obj.message); hint = obj.hint ?? null; }
        else if (obj.erro) codigo = String(obj.erro);
      }
      if (!codigo) codigo = r.status === 504 ? "tempo_esgotado" : `http_${r.status}`;
      // .resposta = corpo inteiro (ex.: nx-enviar devolve {ok:false, erro, detalhe, mensagem} e a F5 precisa da mensagem gravada)
      const e = erroApi(codigo, { status: r.status, hint, detalhe, detalhe_texto: typeof detalhe === "string" ? detalhe : null, resposta: obj });
      const ra = r.headers && typeof r.headers.get === "function" ? lerRetryAfter(r.headers.get("retry-after"), agora()) : null;
      if (ra !== null) e.retryAfterMs = ra;
      if (contexto) e.contexto = { leitura: !!meta.leitura };
      throw e;
    }
    // único caso de erro "por retorno": {ok:false, erro} (nx_convite_aceitar e Edge Functions)
    if (obj && obj.ok === false && obj.erro) {
      throw erroApi(String(obj.erro), { status: r.status, hint: obj.hint ?? null, detalhe: obj.detalhe ?? null,
        detalhe_texto: typeof obj.detalhe === "string" ? obj.detalhe : null, resposta: obj });
    }
    return dados;
  }

  /** Quanto esperar (ms) antes de repetir, ou null se não vale repetir (escrita comum, erro de negócio, offline, esgotou tentativas ou orçamento). */
  function esperaAntesDeRepetir(e, meta, repeticoes, inicio) {
    if (!retentar || !(meta.leitura || meta.req) || repeticoes >= retentar.tentativas || !erroRetentavel(e)) return null;
    if (e.codigo === "sem_conexao" && !estaOnline()) return null;      // offline não gasta tentativa: o rede.js cuida da volta
    const baseMs = retentar.esperasMs[Math.min(repeticoes, retentar.esperasMs.length - 1)];
    let espera = Math.round(baseMs * (1 + (aleatorio() * 2 - 1) * retentar.jitter));
    if (e.retryAfterMs != null) espera = Math.max(espera, e.retryAfterMs);
    return agora() - inicio + espera > retentar.orcamentoMs ? null : espera;
  }

  /** Resultado FINAL da chamada para o estado de conexão: 502/503/504 e falha de transporte = servidor fora; qualquer outra resposta prova que ele responde. */
  function relatarErro(e) {
    if (e.codigo === "sem_conexao" || e.codigo === "tempo_rede") avisarRede("falha", { codigo: e.codigo });
    else if ([502, 503, 504].includes(Number(e.status))) avisarRede("falha", { codigo: `http_${e.status}`, status: e.status });
    else avisarRede("sucesso");
  }

  async function chamar(url, corpo, prazo = prazoRpc, meta = {}) {
    const fimLento = contarLento();
    const inicio = agora();
    let repeticoes = 0, reentrou = false;
    try {
      for (;;) {
        try {
          const dados = await tentarUma(url, corpo, prazo, meta);
          avisarRede("sucesso");
          return dados;
        } catch (e) {
          if (e.codigo === "sessao_invalida" && typeof o.aoSessaoInvalida === "function") {
            // leitura: espera a pessoa entrar de novo e repete com o token novo (uma vez); escrita: o erro sobe na hora
            let voltou = false;
            try {
              const r = o.aoSessaoInvalida(e);
              if (meta.leitura && !reentrou) { reentrou = true; voltou = (await r) === true; }
            } catch { voltou = false; }
            if (voltou) continue;
            avisarRede("sucesso");
            throw e;
          }
          const espera = esperaAntesDeRepetir(e, meta, repeticoes, inicio);
          if (espera !== null) { repeticoes += 1; await esperar(espera); continue; }
          if (repeticoes) e.tentativas = repeticoes + 1;
          if (meta.req) e.req = meta.req;
          relatarErro(e);
          throw e;
        }
      }
    } finally { fimLento(); }
  }

  /**
   * M16 — stale-while-revalidate. A rede sai JÁ; se há resposta guardada (≤ 12 h) ela chega antes pelo aoCache(dados, em) e a da rede
   * vem depois (é o que a promessa devolve). Se a rede falhar depois de a tela ter sido pintada do cache, o erro sobe com
   * `e.comCache = true`: a tela mantém o que já mostra e não troca por um cartão de erro. Nunca guarda o que não é cacheável.
   */
  async function comCache(nome, params, opcoes, executar) {
    const chave = o.cache.chaveDe(nome, params, { conta: o.conta ? o.conta() : null, cliente: o.cliente ? o.cliente() : null });
    let resolvida = false, local = null, servido = false;
    const redeP = executar().then(d => { resolvida = true; return d; }, e => { resolvida = true; throw e; });
    redeP.catch(() => {});                                   // a leitura do cache pode demorar mais que um erro imediato: sem aviso de promessa sem dono
    try { local = await o.cache.ler(chave); } catch { local = null; }
    if (local && !resolvida) {
      servido = true;
      try { if (typeof opcoes.aoCache === "function") opcoes.aoCache(local.dados, local.em); } catch (e) { console.error("aoCache falhou", e); }
      if (typeof o.aoCache === "function") { try { o.aoCache({ fase: "servido", em: local.em, nome }); } catch { /* o shell decide */ } }
    }
    try {
      const dados = await redeP;
      o.cache.gravar(chave, nome, dados).catch(() => {});     // sem await: gravar não atrasa a tela
      if (servido && typeof o.aoCache === "function") { try { o.aoCache({ fase: "fim", ok: true, nome }); } catch { /* ok */ } }
      return dados;
    } catch (e) {
      if (servido) {
        e.comCache = true;
        if (e.contexto) e.contexto.comCache = true;
        if (typeof o.aoCache === "function") { try { o.aoCache({ fase: "fim", ok: false, em: local.em, nome, erro: e }); } catch { /* ok */ } }
      }
      throw e;
    }
  }
  const querCache = (nome, opcoes) => !!(o.cache && opcoes && opcoes.cache && o.cache.cacheavel(nome));

  /** {req:true} ou p_req já nos parâmetros: a escrita ganha um uuid por INTENÇÃO (o mesmo em todas as repetições) e pode repetir sem duplicar. */
  function prepararReq(params, opcoes) {
    const quer = opcoes && opcoes.req;
    const dado = params && params.p_req;
    if (!quer && !dado) return { params, req: null };
    const req = typeof quer === "string" && quer ? quer : (dado ? String(dado) : novoUuid());
    return { params: { ...params, p_req: req }, req };
  }

  const api = {
    /** RPC com p_token. opcoes: {req:true|uuid} (escrita idempotente por p_req) e {cache:true, aoCache(dados, em)} (última resposta guardada primeiro). */
    rpc(nome, params = {}, opcoes = {}) {
      if (!/^nx_[a-z0-9_]+$/.test(nome)) return Promise.reject(erroApi("funcao_invalida"));
      const { params: p, req } = prepararReq(params, opcoes);
      const executar = () => chamar(`${base}/rest/v1/rpc/${nome}`, () => ({ p_token: o.token ? o.token() : null, ...p }), prazoRpc, { leitura: ehLeitura(nome), req });
      return querCache(nome, opcoes) ? comCache(nome, params, opcoes, executar) : executar();
    },
    /** RPC com p_token e p_cliente (empresa ativa). opcoes: {req:true|uuid}. */
    rpcC(nome, params = {}, opcoes = {}) {
      if (!/^nx_[a-z0-9_]+$/.test(nome)) return Promise.reject(erroApi("funcao_invalida"));
      const { params: p, req } = prepararReq(params, opcoes);
      const executar = () => chamar(`${base}/rest/v1/rpc/${nome}`, () => ({ p_token: o.token ? o.token() : null, p_cliente: o.cliente ? o.cliente() : null, ...p }), prazoRpc, { leitura: ehLeitura(nome), req });
      return querCache(nome, opcoes) ? comCache(nome, params, opcoes, executar) : executar();
    },
    /** RPC pública (sem token): nx_marca_publica, nx_convite_ver, nx_convite_aceitar, nx_senha_redefinir, nx_entrar. */
    publica(nome, params = {}, opcoes = {}) {
      if (!/^nx_[a-z0-9_]+$/.test(nome)) return Promise.reject(erroApi("funcao_invalida"));
      const executar = () => chamar(`${base}/rest/v1/rpc/${nome}`, params, prazoRpc, { leitura: ehLeitura(nome) });
      return querCache(nome, opcoes) ? comCache(nome, params, opcoes, executar) : executar();
    },
    /**
     * Edge Function: POST /functions/v1/<funcao> com {token, cliente, ...corpo}.
     * `opcoes.prazoMs`: espera maior só para esta chamada (ex.: a IA que monta uma automação demora mais que os 75 s padrão),
     * no máximo TETO_PRAZO_FN_MS. Um prazo geral fixado em criarApi (testes) continua valendo por cima.
     */
    fn(funcao, corpo = {}, opcoes = {}) {
      if (!/^nx-[a-z0-9-]+$/.test(funcao)) return Promise.reject(erroApi("funcao_invalida"));
      return chamar(`${base}/functions/v1/${funcao}`, () => ({ token: o.token ? o.token() : null, cliente: o.cliente ? o.cliente() : null, ...corpo }), prazoDaChamada(opcoes, `${funcao}:${corpo && corpo.acao}`), { leitura: false });
    },
    mensagemErro,
  };
  return api;
}
