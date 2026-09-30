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
  sessao_invalida: "Sua sessão expirou. Entre de novo.",
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
  codewords_tipo_nao_suportado: "Este canal CodeWords envia somente mensagens de texto. Para anexos e modelos, use um canal Meta.",
  use_testar_codewords: "Confira o estado do aparelho em Configurações → Números de WhatsApp.",
  envio_falhou: "O canal não aceitou a mensagem.",
  template_invalido: "Esse modelo não está aprovado ou faltam parâmetros.",
  midia_grande: "Arquivo grande demais (até 16 MB; fotos até 5 MB).",
  midia_tipo: "Tipo de arquivo não aceito pelo WhatsApp.",
  ia_indisponivel: "A IA não está disponível agora.",
  ia_cota: "A cota de IA do mês acabou.",
  muitos_pedidos: "Muitos pedidos seguidos; espere um minuto.",
  automacao_invalida: "A automação tem um problema.",
  limite_taxa: "Muitos envios em pouco tempo. Tente mais tarde.",
};

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
    case "automacao_invalida":
      if (hint) return `A automação tem um problema: ${hint}.`;
      break;
    default: break;
  }
  if (!MENSAGENS[c] && /_nao_encontrad[oa]$/.test(String(c || ""))) return "Não encontramos esse registro — ele pode ter sido removido.";
  return MENSAGENS[c] ||`Não deu certo agora${c ? ` (${String(c).slice(0, 80)})` : ""}. Tente de novo em instantes.`;
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

/**
 * Cria o cliente.
 * @param {object} o
 *   url, chave            — SUPA_URL e CHAVE_PUBLICA (de ../dados.js)
 *   token(): string|null  — token atual (nx-token)
 *   cliente(): uuid|null  — empresa ativa
 *   aoSessaoInvalida(e)   — shell volta ao login
 *   fetch                 — opcional (testes)
 */
export function criarApi(o) {
  const f = o.fetch || ((...a) => globalThis.fetch(...a));
  const base = String(o.url || "").replace(/\/+$/, "");
  const normalizarPrazo = (v, padrao) => Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(120_000, Number(v)) : padrao;
  const prazoRpc = normalizarPrazo(o.prazoMs ?? o.prazoRpcMs, 20_000);
  const prazoFn = normalizarPrazo(o.prazoMs ?? o.prazoFnMs, 75_000);

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

  function avisarSessao(e) {
    if (e.codigo === "sessao_invalida" && typeof o.aoSessaoInvalida === "function") {
      try { o.aoSessaoInvalida(e); } catch { /* o shell decide */ }
    }
  }

  async function post(url, corpo, prazo = prazoRpc) {
    let r, txt;
    try {
      ({ r, txt } = await buscarComPrazo(url, {
        method: "POST",
        headers: { apikey: o.chave, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(corpo ?? {}),
      }, prazo));
    } catch (causa) {
      if (causa?.codigo === "tempo_rede") throw causa;
      throw erroApi("sem_conexao", { causa });
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
      avisarSessao(e);
      throw e;
    }
    // único caso de erro "por retorno": {ok:false, erro} (nx_convite_aceitar e Edge Functions)
    if (obj && obj.ok === false && obj.erro) {
      const e = erroApi(String(obj.erro), { status: r.status, hint: obj.hint ?? null, detalhe: obj.detalhe ?? null,
        detalhe_texto: typeof obj.detalhe === "string" ? obj.detalhe : null, resposta: obj });
      avisarSessao(e);
      throw e;
    }
    return dados;
  }

  const api = {
    /** RPC com p_token. */
    rpc(nome, params = {}) {
      if (!/^nx_[a-z0-9_]+$/.test(nome)) return Promise.reject(erroApi("funcao_invalida"));
      return post(`${base}/rest/v1/rpc/${nome}`, { p_token: o.token ? o.token() : null, ...params });
    },
    /** RPC com p_token e p_cliente (empresa ativa). */
    rpcC(nome, params = {}) {
      if (!/^nx_[a-z0-9_]+$/.test(nome)) return Promise.reject(erroApi("funcao_invalida"));
      return post(`${base}/rest/v1/rpc/${nome}`, { p_token: o.token ? o.token() : null, p_cliente: o.cliente ? o.cliente() : null, ...params });
    },
    /** RPC pública (sem token): nx_marca_publica, nx_convite_ver, nx_convite_aceitar, nx_senha_redefinir, nx_entrar. */
    publica(nome, params = {}) {
      if (!/^nx_[a-z0-9_]+$/.test(nome)) return Promise.reject(erroApi("funcao_invalida"));
      return post(`${base}/rest/v1/rpc/${nome}`, params);
    },
    /** Edge Function: POST /functions/v1/<funcao> com {token, cliente, ...corpo}. */
    fn(funcao, corpo = {}) {
      if (!/^nx-[a-z0-9-]+$/.test(funcao)) return Promise.reject(erroApi("funcao_invalida"));
      return post(`${base}/functions/v1/${funcao}`, { token: o.token ? o.token() : null, cliente: o.cliente ? o.cliente() : null, ...corpo }, prazoFn);
    },
    mensagemErro,
  };
  return api;
}
