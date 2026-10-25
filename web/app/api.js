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
  telefone_invalido: "Confira o telefone: DDD + número, ex.: (12) 99830-3030.",   // plano 1000b · UB-155: diz qual campo e como
  dados_invalidos: "Confira os dados informados.",
  contato_nao_encontrado: "Não encontramos esse registro — ele pode ter sido removido.",
  negocio_nao_encontrado: "Não encontramos esse registro — ele pode ter sido removido.",
  conversa_nao_encontrada: "Não encontramos esse registro — ele pode ter sido removido.",
  canal_nao_encontrado: "Não encontramos esse registro — ele pode ter sido removido.",
  mensagem_nao_encontrada: "Não encontramos esse registro — ele pode ter sido removido.",
  midia_nao_encontrada: "Não encontramos esse registro — ele pode ter sido removido.",
  midia_indisponivel: "O armazenamento de arquivos está temporariamente indisponível. Tente novamente; o arquivo não foi enviado.",
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
  estagio_com_negocios: "Essa etapa tem {negocios}. Escolha para onde eles vão.",   // plano 2000d · DU-157: {negocios} pelo vocabulário da vertical
  conversa_resolvida: "Atendimento resolvido. Reabra para responder.",
  ja_existe_aberta: "Já existe um atendimento aberto com esse contato.",
  fora_da_janela: "Mais de 24 h desde a última mensagem do cliente. Envie um modelo aprovado.",
  canal_sem_token: "Este número ainda não tem o token da Meta. Configure em Números de WhatsApp.",
  // plano 2000d · DU-156: nada de nome de fornecedor (CodeWords) para o cliente da revenda — o código continua o mesmo
  codewords_sem_credencial: "Este número está sem a chave de conexão do aparelho. Configure em Configurações › Números de WhatsApp.",
  codewords_sem_aparelho: "Este número ainda não foi pareado com o celular, então nada pode ser enviado. Faça o pareamento em Configurações › Números de WhatsApp.",
  codewords_falhou: "A conexão do aparelho não concluiu o pedido. Tente de novo em instantes.",
  aparelho_nao_encontrado: "Este número ainda não foi pareado com o celular. Use «Parear» em Configurações › Números de WhatsApp e digite o código no celular.",
  numero_diferente: "O aparelho pareado não é o número deste canal. Nada foi enviado; refaça o pareamento em Configurações › Números de WhatsApp.",
  aparelho_desconectado: "O WhatsApp deste número está desconectado do aparelho. Termine o pareamento no celular e tente de novo.",
  metodo_invalido: "O servidor não aceitou esse pedido. Atualize a página e tente de novo.",
  erro_interno: "O servidor falhou ao concluir o pedido. Tente de novo em instantes; se continuar, fale com o suporte.",
  codewords_tipo_nao_suportado: "Este número, conectado por aparelho, não envia esse tipo de mensagem. Modelos aprovados só existem em número da Meta.",
  use_testar_codewords: "Confira o estado do aparelho em Configurações → Números de WhatsApp.",
  envio_falhou: "O canal não aceitou a mensagem.",
  template_invalido: "Esse modelo não está aprovado ou faltam parâmetros.",
  midia_grande: "Arquivo grande demais (até 16 MB; fotos até 5 MB).",
  midia_tipo: "Tipo de arquivo não aceito pelo WhatsApp.",
  ia_indisponivel: "A IA não está disponível agora.",
  ia_cota: "A cota de IA do mês acabou. Ela volta no começo do próximo mês; para usar mais agora, fale com o suporte.",
  // plano 2000d · DU-155: frases neutras (sem «Nexus» nem «Anthropic») — o cliente da revenda fala com quem fornece o sistema
  sem_chave: "A IA ainda não foi ligada nesta conta. Peça a quem fornece o sistema para ativar.",
  ia_desligada: "A IA está desligada nesta conta. Peça a quem fornece o sistema para ativar.",
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
  automacao_invalida: "A automação tem um problema: confira o que está marcado em vermelho no editor.",   // plano 1000b · UB-156: sem hint, com a pista
  limite_taxa: "Muitos envios em pouco tempo. Tente mais tarde.",
  envio_em_andamento: "A mensagem ainda está sendo enviada. Aguarde um instante.",
  cancelado: "Pedido cancelado.",
  aguarde: "Isso acabou de ser feito. Espere um pouco antes de tentar de novo.",   // plano 1000: nx-codewords/nx-ciclo (pareamento, teste, «Testar conexão»)
  // plano 100 · contratos 9 e 10: empresa pausada no painel e bloqueio de login por tentativas (o hint traz os minutos)
  cliente_pausado: "O acesso desta empresa está pausado pela plataforma. Fale com o suporte para reativar.",
  muitas_tentativas: "Muitas tentativas de entrar. Espere alguns minutos e tente de novo.",
  // nx-enviar (S-F13): texto final (com assinatura) acima do teto e contato bloqueado
  texto_longo: "A mensagem passou do tamanho que o WhatsApp aceita (a assinatura conta). Encurte o texto.",
  contato_bloqueado: "Este contato está bloqueado: nada é enviado até um administrador desbloquear (menu da conversa).",
  // agenda (nx_agenda_checar): sem estes textos a tela mostrava o código cru («antecedencia»)
  antecedencia: "Esse horário está muito em cima da hora. Escolha um horário mais à frente.",
  fora_do_horario: "Esse horário está fora do funcionamento da agenda. Escolha outro horário.",
  passado: "Esse horário já passou. Escolha uma data e hora à frente.",
  consulta_nao_encontrada: "Não encontramos essa {compromisso}. Ela pode ter sido desmarcada.",   // plano 2000d · DU-157: consulta · visita · entrega
  // erros de servidor/rede (M15): o texto técnico (http_503, servico_indisponivel) nunca chega à tela
  servico_indisponivel: "O servidor está fora do ar neste momento. Tentamos de novo sozinhos; se continuar, avise o suporte.",
  http_429: "Muitos pedidos de uma vez. Espere um instante e tente de novo.",
  // plano 2000d · SX-096: as respostas HTTP que chegavam como «Não deu certo agora» sem dizer o porquê
  http_403: "Esta ação não é permitida para o seu acesso. Se precisar, fale com o administrador da empresa.",
  http_408: "O pedido demorou demais para chegar ao servidor. Confira a conexão e tente de novo.",
  http_413: "O arquivo ou o texto é grande demais para enviar. Diminua o tamanho e tente de novo.",
  dono_mudou: "Outra pessoa assumiu esta conversa agora há pouco. Sua mensagem não saiu — confira e envie de novo se ainda fizer sentido.", // plano 2000d · SX-105
  http_500: "O servidor falhou ao concluir o pedido. Tente de novo em instantes; se continuar, fale com o suporte.",
  http_502: "O servidor está fora do ar neste momento. Tentamos de novo sozinhos; se continuar, avise o suporte.",
  http_503: "O servidor está fora do ar neste momento. Tentamos de novo sozinhos; se continuar, avise o suporte.",
  http_504: "O servidor demorou; confira se salvou antes de repetir.",   // plano 1500c · UCC-002: 504 de uma escrita (a leitura vira tempo_esgotado)
  // plano 1500c · UCC-003: a função ainda não foi instalada no servidor (PostgREST 404 · PGRST202/203) — nunca o inglês técnico
  funcao_ausente: "Esta função ainda não foi instalada no servidor; avise o suporte.",
};

/** plano 1500c · UCC-003: o PostgREST respondeu que a função não existe (404 + PGRST202/PGRST203 ou «Could not find the function»)? O código
    do erro continua o de sempre (as telas detectam por ele e escondem a novidade); só a frase muda. */
export function ehFuncaoAusente(e) {
  if (!e) return false;
  if (e.funcaoAusente) return true;
  const code = String((e.resposta && e.resposta.code) || "").toUpperCase();
  return code === "PGRST202" || code === "PGRST203" || /could not find the function/i.test(String(e.codigo || e.message || ""));
}

/** plano 1500c · UCC-007: o caminho de venda de um erro de plano — {rotulo, hash} para um botão no aviso (null quando não há). */
export function acaoDoErro(e) {
  const c = String((e && (e.codigo || e.message)) || "");
  if (c === "teste_expirado") return { rotulo: "Ver planos", hash: "#/config/plano" };
  if (c === "modulo_desligado" || c === "limite_plano") return { rotulo: "Ver Plano e uso", hash: "#/config/plano" };
  return null;
}

/** plano 1500c · UCC-004: «espere 7 s» a partir do Retry-After (só quando o servidor disse quanto). */
function esperaDoErro(e) {
  const ms = Number(e && e.retryAfterMs);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const s = Math.max(1, Math.ceil(ms / 1000));
  return s >= 90 ? `espere ${Math.ceil(s / 60)} min` : `espere ${s} s`;
}

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

/** Minutos do `hint` de muitas_tentativas (contrato 10: «15», «15 min», «em 15 minutos»); sem número → null. */
export function minutosDoHint(hint) {
  const m = /(\d+(?:[.,]\d+)?)/.exec(String(hint ?? ""));
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : null;
}

/** plano 2000d · DU-157: o shell informa o vocabulário da vertical (fn() → vocab.js) para {negocios}/{compromisso} das frases. */
let _vocabMensagens = null;
export function definirVocabDasMensagens(fn) { _vocabMensagens = typeof fn === "function" ? fn : null; }
const PALAVRA_PADRAO = { negocio: "negócio", negocios: "negócios", compromisso: "consulta", compromissos: "consultas", contato: "contato", contatos: "contatos" };
function palavraDoVocab(v, k) {
  try {
    if (v && typeof v.min === "function") { const p = v.min(k); if (p) return String(p); }
    if (v && v[k]) return String(v[k]).toLowerCase();
  } catch { /* vocab estranho: palavra padrão */ }
  return PALAVRA_PADRAO[k] || k;
}
function comVocab(txt, v) {
  if (typeof txt !== "string" || txt.indexOf("{") < 0) return txt;
  let voc = v;
  if (!voc) { try { voc = _vocabMensagens ? _vocabMensagens() : null; } catch { voc = null; } }
  return txt.replace(/\{(negocios?|compromissos?|contatos?)\}/g, (_, k) => palavraDoVocab(voc, k));
}
/** plano 2000d · DU-155/DU-156: texto que veio do servidor (detalhe) não cita o fornecedor do aparelho nem a IA por nome. */
export function semFornecedor(txt) {
  return String(txt ?? "").replace(/\b(?:o|O) CodeWords\b/g, m => (m[0] === "O" ? "A conexão do aparelho" : "a conexão do aparelho"))
    .replace(/\b(?:no|do|pelo) CodeWords\b/g, "no aparelho").replace(/\bCodeWords\b/g, "aparelho")
    .replace(/\bAnthropic\b/g, "IA").replace(/(?:a )?equipe da Nexus/g, "quem fornece o sistema");
}

/** plano 2000d · SX-031/SX-032: a frase do servidor ganha o ponto final só quando não termina com pontuação («recusado.» não vira «recusado..»). */
export function fimDeFrase(t) { const s = String(t ?? "").trim(); return !s ? s : /[.!?…]$/.test(s) ? s : `${s}.`; }
/** plano 2000d · SX-033: o nome técnico do parâmetro («p_nome_cliente») vira o nome do campo («nome cliente»). */
export function nomeDoCampo(hint) { return String(hint ?? "").trim().replace(/^p_/, "").replace(/_/g, " ").trim() || String(hint ?? ""); }

/** Texto para o usuário a partir de um erro da API (usa .codigo, .hint e .detalhe quando o Apêndice B pede).
    plano 2000d · DU-157: `vocab` (opcional; sem ele, o do shell) troca {negocios}/{compromisso} pela palavra da vertical. */
export function mensagemErro(e, vocab = null) {
  return comVocab(mensagemErroBase(e, vocab), vocab);
}
function mensagemErroBase(e, vocab) {
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
    case "dono_mudou": // plano 2000d · SX-105: o servidor manda no hint o nome de quem assumiu
      if (hint.trim()) return `${hint.trim().slice(0, 60)} assumiu esta conversa agora há pouco. Sua mensagem não saiu — confira e envie de novo se ainda fizer sentido.`;
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
      if (hint) return `Preencha o campo "${nomeDoCampo(hint)}" antes de continuar.`;   // plano 2000d · SX-033
      break;
    case "estagio_com_negocios":
      if (/^\d+$/.test(hint)) return `Essa etapa tem ${hint} {negocio${hint === "1" ? "" : "s"}}. Escolha para onde ${hint === "1" ? "ele vai" : "eles vão"}.`;   // plano 2000d · DU-157
      break;
    case "envio_falhou": {
      const d = e && (e.detalhe_texto || (typeof e.detalhe === "string" ? e.detalhe : ""));
      if (d) return `O canal não aceitou a mensagem: ${fimDeFrase(String(d).slice(0, 160))}`;   // plano 2000d · SX-031: sem «..»
      break;
    }
    case "codewords_falhou": {   // o servidor já devolve o motivo em português (não repete o código)
      const d = e && (e.detalhe_texto || (typeof e.detalhe === "string" ? e.detalhe : ""));
      if (d) return semFornecedor(String(d).slice(0, 240));   // plano 2000d · DU-156: o motivo do servidor sem o nome do fornecedor
      break;
    }
    case "automacao_invalida":
      if (hint) return `A automação tem um problema: ${fimDeFrase(hint)}`;   // plano 2000d · SX-032
      break;
    case "sem_permissao":
      // plano 1000b · UB-277: quem já é o administrador da empresa não tem a quem «falar com o administrador»
      if (!(e && e.contexto) && papelDasMensagens() === "admin") return "Esta ação é da plataforma; fale com o suporte.";
      break;
    case "muitas_tentativas": {
      const min = minutosDoHint(hint);
      if (min) return `Muitas tentativas de entrar. Tente de novo em ${min} minuto${min === 1 ? "" : "s"}.`;
      break;
    }
    case "texto_longo": {   // o nx-enviar devolve o teto efetivo ({teto}) — com assinatura ele é menor que o do WhatsApp
      const teto = Number(e && e.resposta && e.resposta.teto);
      if (Number.isFinite(teto) && teto > 0) return `A mensagem passou do limite: no máximo ${teto} caracteres, contando a assinatura. Encurte o texto.`;
      break;
    }
    case "ia_indisponivel": {   // o nx-ia manda o motivo em .detalhe: sem_chave, sem_sdk, conversa_vazia
      const d = e && (e.detalhe_texto || (typeof e.detalhe === "string" ? e.detalhe : "") || hint);
      if (d === "sem_chave") return MENSAGENS.sem_chave;
      if (d === "sem_sdk") return "A IA está em manutenção neste momento. Tente de novo mais tarde.";
      if (d === "conversa_vazia") return "Ainda não há mensagens nesta conversa para a IA ler.";
      break;
    }
    case "muitos_pedidos": case "http_429": case "limite_taxa": {   // plano 1500c · UCC-004: com Retry-After, quanto esperar
      const espera = esperaDoErro(e);
      if (espera) return c === "limite_taxa" ? `Muitos envios em pouco tempo; ${espera} e tente de novo.` : `Muitos pedidos seguidos; ${espera} e tente de novo.`;
      break;
    }
    default: break;
  }
  if (ehFuncaoAusente(e)) return MENSAGENS.funcao_ausente;   // plano 1500c · UCC-003
  if (!MENSAGENS[c] && /_nao_encontrad[oa]$/.test(String(c || ""))) return "Não encontramos esse registro — ele pode ter sido removido.";
  if (MENSAGENS[c]) return MENSAGENS[c];
  // plano 1000 (AS-255): código desconhecido — a equipe da plataforma (super) vê o código cru; as demais pessoas, uma frase com o caminho
  if (_codigoTecnico) return `Não deu certo agora${c ? ` (${String(c).slice(0, 80)})` : ""}. Tente de novo em instantes.`;
  return "Não deu certo agora. Tente de novo em instantes; se continuar, fale com o suporte.";
}

let _papelMensagens = null;
/** Plano 1000b · UB-277: o shell informa o papel na empresa ativa (fn() → "admin" | "atendente" | …) para o texto do sem_permissao. */
export function definirPapelDasMensagens(fn) { _papelMensagens = typeof fn === "function" ? fn : null; }
function papelDasMensagens() { try { return _papelMensagens ? _papelMensagens() : null; } catch { return null; } }

let _codigoTecnico = false;
/** O shell liga depois de ler a sessão: só a conta da plataforma (super) vê o código técnico nos erros desconhecidos. */
export function mostrarCodigoTecnico(sim) { _codigoTecnico = !!sim; }

/** RPCs que só LEEM (podem ser repetidas sem efeito colateral). Tudo que não está aqui é tratado como escrita. */
// plano 1500c · UCC-005: _estado, _resumo, _contar e _historico também só leem (ganham retentativa, cache e a frase de leitura)
const LEITURA_SUFIXOS = /_(listar|ver|base|kanban|coluna|buscar|estado|resumo|contar|historico)$/;
const LEITURA_NOMES = new Set(["nx_pulso", "nx_app_sessao", "nx_marca_publica", "nx_inicio", "nx_agenda_dia", "nx_agenda_livres", "nx_dados",
  "nx_cv_mensagens", "nx_cv_ia_estado", "nx_cv_buscar_msgs", "nx_automacao_execucoes", "nx_cliente_tema", "nx_integracoes_status", "nx_uso_plano",
  // plano 1000 (AS-181): consultas do Admin, das Automações e do Início que eram tratadas como escrita (offline diziam «nada foi salvo» e não repetiam)
  "nx_automacao_execucoes_dia", "nx_ia_uso_dia", "nx_onboarding_estado", "nx_clientes_admin",
  // plano 1000b · UB-153: a saúde da operação (Admin) e o «Testar» do editor de automação (simula sem gravar) também só leem
  "nx_saude", "nx_auto_simular"]);
/** plano 1500c · UCC-005: os «_contar» do servidor que SOMAM contadores (Edge Functions) são escrita — repetir contaria duas vezes. */
const ESCRITAS_COM_SUFIXO_DE_LEITURA = new Set(["nx_canal_contar", "nx_codewords_contar"]);
export function ehLeitura(nome) {
  const n = String(nome || "");
  if (ESCRITAS_COM_SUFIXO_DE_LEITURA.has(n)) return false;
  return LEITURA_NOMES.has(n) || LEITURA_SUFIXOS.test(n) || /^nx_rel_/.test(n);
}

/* ---- plano 1500c · UCC-134: os últimos erros (no máximo 20) ficam na memória desta aba (e na sessão da aba) para o «Copiar diagnóstico».
   Só código, status, nome da chamada e hora: nada de parâmetro, corpo ou mensagem do servidor (podem ter nome e telefone). ---- */
export const MAX_ERROS_RECENTES = 20;
const _erros = [];
const CHAVE_ERROS = "nx-erros-recentes";
export function guardarErroRecente(e, nome = null, agora = Date.now()) {
  if (!e || e.codigo === "cancelado") return;
  const item = { em: new Date(agora).toISOString(), codigo: String(e.codigo || e.message || "erro").slice(0, 60), status: Number(e.status) || null,
    fn: nome ? String(nome).replace(/[^a-z0-9_:-]/gi, "").slice(0, 60) : null };
  // plano 2000d · SX-090: o mesmo erro da mesma chamada repetido em rajada (pulso sem internet) vira UMA linha com a contagem — antes os 20
  // lugares do diagnóstico ficavam todos com o mesmo «sem_conexao» e o erro que importava sumia
  const ult = _erros[_erros.length - 1];
  if (ult && ult.codigo === item.codigo && ult.fn === item.fn && ult.status === item.status && agora - Date.parse(ult.ate || ult.em) < 60_000) {
    ult.vezes = (ult.vezes || 1) + 1; ult.ate = item.em;
    try { if (typeof sessionStorage !== "undefined" && sessionStorage) sessionStorage.setItem(CHAVE_ERROS, JSON.stringify(_erros)); } catch { /* sem storage */ }
    return;
  }
  _erros.push(item);
  while (_erros.length > MAX_ERROS_RECENTES) _erros.shift();
  try { if (typeof sessionStorage !== "undefined" && sessionStorage) sessionStorage.setItem(CHAVE_ERROS, JSON.stringify(_erros)); } catch { /* sem storage */ }
}
export function errosRecentes() {
  if (!_erros.length) {
    try {
      const v = typeof sessionStorage !== "undefined" && sessionStorage ? JSON.parse(sessionStorage.getItem(CHAVE_ERROS) || "[]") : [];
      if (Array.isArray(v)) for (const x of v.slice(-MAX_ERROS_RECENTES)) if (x && typeof x.codigo === "string") _erros.push({ em: String(x.em || ""), codigo: x.codigo, status: Number(x.status) || null, fn: x.fn || null,
        ...(Number(x.vezes) > 1 ? { vezes: Number(x.vezes), ate: String(x.ate || "") } : {}) });   // plano 2000d · SX-090
    } catch { /* ok */ }
  }
  return _erros.map(x => ({ ...x }));
}
export function limparErrosRecentes() { _erros.length = 0; try { sessionStorage.removeItem(CHAVE_ERROS); } catch { /* ok */ } }

/* ---- plano 1500c · UCC-136: diferença entre o relógio do servidor (cabeçalho Date da última resposta) e o do aparelho. A pílula do teste e a
   conta de dias usam agoraServidor(): um aparelho com a data errada não mostra «faltam 40 dias» num teste que acaba amanhã. ---- */
let _desvioRelogio = 0;
export function lerRelogioDoServidor(r, agora = Date.now()) {
  try {
    const d = r && r.headers && typeof r.headers.get === "function" ? r.headers.get("date") : null;
    const t = d ? Date.parse(d) : NaN;
    if (!Number.isFinite(t)) return _desvioRelogio;
    const desvio = t - agora;
    // o cabeçalho tem resolução de 1 s e o caminho leva alguns décimos: menos de 1 min de diferença é ruído, não relógio errado
    _desvioRelogio = Math.abs(desvio) < 60_000 ? 0 : desvio;
  } catch { /* ok */ }
  return _desvioRelogio;
}
export function desvioRelogio() { return _desvioRelogio; }
export function agoraServidor(agora = Date.now()) { return agora + _desvioRelogio; }

/** plano 2000d · SX-092: os dados de um evento do comercial — só valores simples (texto ≤ 120, número, sim/não), no máximo 20 chaves de nome
    curto; objeto, lista e texto comprido (que poderiam levar nome, telefone ou mensagem) ficam de fora. */
export function dadosDoEvento(dados) {
  const out = {};
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return out;
  for (const [k, v] of Object.entries(dados)) {
    if (Object.keys(out).length >= 20 || !/^[a-z0-9_]{1,40}$/i.test(k)) continue;
    if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
    else if (typeof v === "string" && v.length <= 120) out[k] = v;
  }
  return out;
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
 * parear do CodeWords (até 90 s), ligar o fluxo de IA / receber aqui / enviar teste (conexões 15 s + inscrição 60 s) e envio pelo CodeWords
 * com conferência do aparelho (15 s + 60 s). Os nomes são os das ações que o front realmente envia (cv-config.js). O navegador precisa
 * esperar MAIS que o pior caso do servidor: desistir antes mostraria «tempo_rede» enquanto ele ainda conclui (cota de IA gasta, código de
 * pareamento perdido, mensagem possivelmente enviada).
 */
export const PRAZO_FN_LENTA_MS = 100_000;
const FN_LENTAS = new Set(["nx-ia:sugerir", "nx-ia:resumir", "nx-codewords:parear", "nx-codewords:ligar_fluxo", "nx-codewords:receber_aqui", "nx-codewords:enviar_teste",
  "nx-enviar:texto", "nx-enviar:midia", "nx-enviar:template", "nx-enviar:reenviar"]);   // reenviar refaz um envio pelo mesmo caminho (plano 100 · A5 [D132])

/** Plano 1000 (AS-182): ações de Edge Function que só CONSULTAM (podem repetir; offline dizem «Sem internet», não «nada foi salvo»). */
export const FN_LEITURA = Object.freeze(new Set(["nx-codewords:estado", "nx-enviar:testar_canal"]));
/** fn(funcao, {acao}) é leitura? A lista acima ou `opcoes.leitura === true` de quem chama (nunca o contrário: escrita não vira leitura por engano). */
export function fnLeitura(funcao, corpo, opcoes) {
  if (opcoes && opcoes.leitura === true) return true;
  return FN_LEITURA.has(`${funcao}:${corpo && corpo.acao}`);
}

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
  // plano 2000d · SX-030: «1.5» (segundos com fração) vale 1500 ms — antes o Date.parse lia «1.5» como uma data de 2001 e virava 0;
  // qualquer outro número solto («-5») não é uma data HTTP
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Math.min(Number(s), 3600) * 1000);
  if (/^[-+]?[\d.]+$/.test(s)) return null;
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
 *   aoErro(e, meta)       — todo erro FINAL de uma chamada (depois das repetições), antes de subir para quem chamou: o shell reage a
 *                           cliente_pausado (plano 100 · A4). Nunca impede o erro de subir; exceção dentro dele é engolida.
 *   agora, esperar(ms), aleatorio(), online() — relógio, espera, sorteio e "tem internet?" (testes)
 *   fetch                 — opcional (testes)
 */
export function criarApi(o) {
  const f = o.fetch || ((...a) => globalThis.fetch(...a));
  const base = String(o.url || "").replace(/\/+$/, "");
  const normalizarPrazo = (v, padrao) => Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(120_000, Number(v)) : padrao;
  const prazoRpc = normalizarPrazo(o.prazoMs ?? o.prazoRpcMs, 20_000);
  const prazoFn = normalizarPrazo(o.prazoMs ?? o.prazoFnMs, 75_000);

  let _semEvento = false, _semErroCliente = false, _errosEnviados = 0;   // plano 1500c · UCC-104/UCC-135
  const _errosMandados = new Set();   // plano 2000d · SX-091
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

  async function buscarComPrazo(url, init, ms, sinal = null) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    // plano 1000 (pedido de Automações): quem chamou pode desistir («Parar de esperar») — o sinal dele cancela o fetch na hora
    // plano 1500c · UCC-006: o ouvinte sai do sinal quando a chamada termina (um sinal da tela inteira acumulava uma closure por chamada)
    let soltarSinal = () => {};
    if (sinal && controller) {
      if (sinal.aborted) controller.abort();
      else if (typeof sinal.addEventListener === "function") {
        const aoAbortar = () => controller.abort();
        sinal.addEventListener("abort", aoAbortar, { once: true });
        soltarSinal = () => { try { sinal.removeEventListener("abort", aoAbortar); } catch { /* ok */ } };
      }
    }
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
    } finally { clearTimeout(timer); soltarSinal(); }
  }

  /** UMA tentativa: devolve os dados ou lança Error (.codigo, .status, .hint…). Não fala com o rede.js nem com a sessão. */
  async function tentarUma(url, corpo, prazo, meta) {
    let r, txt;
    try {
      ({ r, txt } = await buscarComPrazo(url, {
        method: "POST",
        headers: { apikey: o.chave, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify((typeof corpo === "function" ? corpo() : corpo) ?? {}),
        ...(meta.keepalive ? { keepalive: true } : {}),      // a página está saindo: o navegador termina o envio mesmo com a aba fechada
      }, prazo, meta.sinal));
    } catch (causa) {
      // cancelado por quem chamou (opcoes.sinal): não é falta de internet, não repete, não mexe no estado da conexão
      if (meta.sinal && meta.sinal.aborted) throw erroApi("cancelado", { causa });
      const e = causa?.codigo === "tempo_rede" ? causa : erroApi("sem_conexao", { causa });
      if (contexto) e.contexto = { leitura: !!meta.leitura };
      throw e;
    }
    lerRelogioDoServidor(r);   // plano 1500c · UCC-136
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
      // plano 1500c · UCC-002: 504 sem corpo numa ESCRITA não é «operação grande demais» (frase de período): é http_504, «confira se salvou»
      if (!codigo) codigo = r.status === 504 ? (meta.leitura ? "tempo_esgotado" : "http_504") : `http_${r.status}`;
      // .resposta = corpo inteiro (ex.: nx-enviar devolve {ok:false, erro, detalhe, mensagem} e a F5 precisa da mensagem gravada)
      const e = erroApi(codigo, { status: r.status, hint, detalhe, detalhe_texto: typeof detalhe === "string" ? detalhe : null, resposta: obj });
      const ra = r.headers && typeof r.headers.get === "function" ? lerRetryAfter(r.headers.get("retry-after"), agora()) : null;
      if (ra !== null) e.retryAfterMs = ra;
      if (contexto) e.contexto = { leitura: !!meta.leitura };
      if (ehFuncaoAusente(e)) e.funcaoAusente = true;   // plano 1500c · UCC-003
      const acao = acaoDoErro(e); if (acao) e.acao = acao;   // plano 1500c · UCC-007
      throw e;
    }
    // único caso de erro "por retorno": {ok:false, erro} (nx_convite_aceitar e Edge Functions)
    if (obj && obj.ok === false && obj.erro) {
      const e = erroApi(String(obj.erro), { status: r.status, hint: obj.hint ?? null, detalhe: obj.detalhe ?? null,
        detalhe_texto: typeof obj.detalhe === "string" ? obj.detalhe : null, resposta: obj });
      const acao = acaoDoErro(e); if (acao) e.acao = acao;
      throw e;
    }
    return dados;
  }

  /** Quanto esperar (ms) antes de repetir, ou null se não vale repetir (escrita comum, erro de negócio, offline, esgotou tentativas ou orçamento). */
  function esperaAntesDeRepetir(e, meta, repeticoes, inicio) {
    if (meta.keepalive) return null;                                   // saindo da página: uma tentativa só, em melhor esforço
    if (!retentar || !(meta.leitura || meta.req) || repeticoes >= retentar.tentativas || !erroRetentavel(e)) return null;
    if (e.codigo === "sem_conexao" && !estaOnline()) return null;      // offline não gasta tentativa: o rede.js cuida da volta
    const baseMs = retentar.esperasMs[Math.min(repeticoes, retentar.esperasMs.length - 1)];
    let espera = Math.round(baseMs * (1 + (aleatorio() * 2 - 1) * retentar.jitter));
    if (e.retryAfterMs != null) espera = Math.max(espera, e.retryAfterMs);
    return agora() - inicio + espera > retentar.orcamentoMs ? null : espera;
  }

  /** Resultado FINAL da chamada para o estado de conexão: 502/503/504 e falha de transporte = servidor fora; qualquer outra resposta prova que ele responde. */
  function relatarErro(e) {
    if (e.codigo === "cancelado") return;                                // quem chamou desistiu: nada se sabe sobre a conexão
    if (e.codigo === "sem_conexao" || e.codigo === "tempo_rede") avisarRede("falha", { codigo: e.codigo });
    else if ([502, 503, 504].includes(Number(e.status)) && e.codigo !== "midia_indisponivel") avisarRede("falha", { codigo: `http_${e.status}`, status: e.status });   // um arquivo que não baixou não é «servidor fora»
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
              if (meta.leitura && !reentrou && !meta.keepalive) { reentrou = true; voltou = (await r) === true; }
            } catch { voltou = false; }
            if (voltou) continue;
            avisarRede("sucesso");
            throw e;
          }
          const espera = esperaAntesDeRepetir(e, meta, repeticoes, inicio);
          if (espera !== null) { repeticoes += 1; await esperar(espera); continue; }
          if (repeticoes) e.tentativas = repeticoes + 1;
          if (meta.req) e.req = meta.req;
          guardarErroRecente(e, meta.nome);   // plano 1500c · UCC-134
          relatarErro(e);
          if (typeof o.aoErro === "function") { try { o.aoErro(e, meta); } catch { /* o shell decide; o erro sobe do mesmo jeito */ } }
          throw e;
        }
      }
    } finally { fimLento(); }
  }

  /**
   * M16 — stale-while-revalidate. A rede sai JÁ; se há resposta guardada (≤ 12 h) ela chega antes pelo aoCache(dados, em) e a da rede
   * vem depois (é o que a promessa devolve). Se a rede falhar depois de a tela ter sido pintada do cache, o erro sobe com
   * `e.comCache = true`: a tela mantém o que já mostra e não troca por um cartão de erro. Nunca guarda o que não é cacheável, nem a
   * resposta de uma chamada que começou com outra conta ou outro token (Sair ou troca de conta com a leitura em voo).
   */
  async function comCache(nome, params, opcoes, executar, cliente = o.cliente ? o.cliente() : null, { publica = false } = {}) {
    // quem pediu: se a conta ou o token mudarem no meio, a resposta desta chamada não volta para o aparelho (o limpar() já rodou)
    const contaIni = o.conta ? o.conta() : null, tokenIni = o.token ? o.token() : null;
    const mesmoDono = () => publica || ((o.conta ? o.conta() : null) === contaIni && (o.token ? o.token() : null) === tokenIni);
    // plano 1500c · UCC-008: pública → «pub» no lugar da conta e nenhuma empresa (uma entrada só, igual para quem estiver logado ou não)
    const chave = publica ? o.cache.chaveDe(nome, params, { conta: "pub", cliente: null }) : o.cache.chaveDe(nome, params, { conta: contaIni, cliente });
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
      if (mesmoDono()) o.cache.gravar(chave, nome, dados).catch(() => {});     // sem await: gravar não atrasa a tela
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
  /** {keepalive: true}: a página está saindo (pagehide, aba oculta); o fetch sai com keepalive, uma tentativa só. */
  const saindo = opcoes => !!(opcoes && opcoes.keepalive === true);
  /** RC-262 (plano 1500c) · plano 2000d: o AbortSignal de quem chama ({sinal} ou {signal}); outra coisa → null. */
  const sinalDe = opcoes => { const s = opcoes && (opcoes.sinal || opcoes.signal); return s && typeof s === "object" && "aborted" in s ? s : null; };

  /** {req:true} ou p_req já nos parâmetros: a escrita ganha um uuid por INTENÇÃO (o mesmo em todas as repetições) e pode repetir sem duplicar. */
  function prepararReq(params, opcoes) {
    const quer = opcoes && opcoes.req;
    const dado = params && params.p_req;
    if (!quer && !dado) return { params, req: null };
    const req = typeof quer === "string" && quer ? quer : (dado ? String(dado) : novoUuid());
    return { params: { ...params, p_req: req }, req };
  }

  const api = {
    /** RPC com p_token. opcoes: {req:true|uuid} (escrita idempotente por p_req), {cache:true, aoCache(dados, em)} (última resposta guardada primeiro)
        e {keepalive:true} (a página está saindo: o envio termina mesmo com a aba fechada; uma tentativa, sem repetição). */
    rpc(nome, params = {}, opcoes = {}) {
      if (!/^nx_[a-z0-9_]+$/.test(nome)) return Promise.reject(erroApi("funcao_invalida"));
      const { params: p, req } = prepararReq(params, opcoes);
      // RC-262 (plano 1500c) · plano 2000d: {sinal} (ou {signal}) de quem chama cancela também uma RPC (a tela fechou, a busca mudou)
      const executar = () => chamar(`${base}/rest/v1/rpc/${nome}`, () => ({ p_token: o.token ? o.token() : null, ...p }), prazoRpc, { leitura: ehLeitura(nome), req, keepalive: saindo(opcoes), sinal: sinalDe(opcoes), nome });
      return querCache(nome, opcoes) ? comCache(nome, params, opcoes, executar) : executar();
    },
    /** RPC com p_token e p_cliente (empresa ativa). opcoes: {req:true|uuid}, {cache:true, aoCache} e {keepalive:true}, como em rpc. */
    rpcC(nome, params = {}, opcoes = {}) {
      if (!/^nx_[a-z0-9_]+$/.test(nome)) return Promise.reject(erroApi("funcao_invalida"));
      const { params: p, req } = prepararReq(params, opcoes);
      // a empresa é lida UMA vez: uma repetição (M15) depois de a pessoa trocar de empresa não busca os dados da outra nem os guarda na chave desta
      const cli = o.cliente ? o.cliente() : null;
      const executar = () => chamar(`${base}/rest/v1/rpc/${nome}`, () => ({ p_token: o.token ? o.token() : null, p_cliente: cli, ...p }), prazoRpc, { leitura: ehLeitura(nome), req, keepalive: saindo(opcoes), sinal: sinalDe(opcoes), nome });   // RC-262
      return querCache(nome, opcoes) ? comCache(nome, params, opcoes, executar, cli) : executar();
    },
    /** RPC pública (sem token): nx_marca_publica, nx_convite_ver, nx_convite_aceitar, nx_senha_redefinir, nx_entrar. */
    publica(nome, params = {}, opcoes = {}) {
      if (!/^nx_[a-z0-9_]+$/.test(nome)) return Promise.reject(erroApi("funcao_invalida"));
      // plano 2000d · SX-029: a tela pública (convite, testar) também pode desistir de uma leitura ({sinal}/{signal})
      const executar = () => chamar(`${base}/rest/v1/rpc/${nome}`, params, prazoRpc, { leitura: ehLeitura(nome), sinal: sinalDe(opcoes), nome });
      // plano 1500c · UCC-008: resposta pública (sem sessão) não é de conta nem de empresa — a chave fica «pub:-:nome:…», a mesma para todos
      return querCache(nome, opcoes) ? comCache(nome, params, opcoes, executar, null, { publica: true }) : executar();
    },
    /**
     * Edge Function: POST /functions/v1/<funcao> com {token, cliente, ...corpo}.
     * `opcoes.prazoMs`: espera maior só para esta chamada (ex.: a IA que monta uma automação demora mais que os 75 s padrão),
     * no máximo TETO_PRAZO_FN_MS. Um prazo geral fixado em criarApi (testes) continua valendo por cima.
     * `opcoes.keepalive`: a página está saindo; o envio termina mesmo com a aba fechada (melhor esforço, sem repetição).
     */
    fn(funcao, corpo = {}, opcoes = {}) {
      if (!/^nx-[a-z0-9-]+$/.test(funcao)) return Promise.reject(erroApi("funcao_invalida"));
      const chave = `${funcao}:${corpo && corpo.acao}`;
      // plano 1000b · UB-154: a empresa é lida UMA vez (como no rpcC): a repetição não vai para outra empresa se a pessoa trocar no meio
      const cli = o.cliente ? o.cliente() : null;
      return chamar(`${base}/functions/v1/${funcao}`, () => ({ token: o.token ? o.token() : null, cliente: cli, ...corpo }), prazoDaChamada(opcoes, chave),
        // plano 2000d · SX-028: {signal} (o nome do padrão da web) também cancela uma Edge Function, como já valia no rpc/rpcC
        { leitura: fnLeitura(funcao, corpo, opcoes), keepalive: saindo(opcoes), sinal: sinalDe(opcoes), nome: chave });
    },
    /** plano 1500c · UCC-104: registra um evento leve para o comercial (clique em «Conhecer», «Ver planos»…) por nx_evento_registrar.
        Melhor esforço: nunca lança, nunca repete, e depois que o servidor disser que a função não existe (404) não tenta mais nesta aba. */
    evento(tipo, dados = {}) {
      if (_semEvento || !/^[a-z0-9_.-]{2,40}$/.test(String(tipo || ""))) return Promise.resolve(false);
      return api.rpc("nx_evento_registrar", { p_tipo: String(tipo), p_dados: dadosDoEvento(dados) })   // plano 2000d · SX-092
        .then(() => true, e => { if (ehFuncaoAusente(e) || Number(e && e.status) === 404) _semEvento = true; return false; });
    },
    /** plano 1500c · UCC-135: resumo de um erro do aparelho para o relatório central (nx_erro_cliente_registrar) — só código, tela e versão,
        nada de dado pessoal. Mesmo melhor esforço do evento(); no máximo 10 por aba. */
    erroCliente(resumo = {}) {
      if (_semErroCliente || _errosEnviados >= 10) return Promise.resolve(false);
      const limpo = { codigo: String(resumo.codigo || "erro").slice(0, 60), tela: String(resumo.tela || "").replace(/[^a-z0-9/_-]/gi, "").slice(0, 60),
        versao: String(resumo.versao || "").slice(0, 30), navegador: String(resumo.navegador || "").slice(0, 60) };
      // plano 2000d · SX-091: o mesmo erro na mesma tela vai UMA vez por aba (um erro em laço gastava as 10 vagas e escondia os outros)
      const chaveErro = `${limpo.codigo}|${limpo.tela}`;
      if (_errosMandados.has(chaveErro)) return Promise.resolve(false);
      _errosMandados.add(chaveErro);
      _errosEnviados += 1;
      return api.rpc("nx_erro_cliente_registrar", { p_erro: limpo }, { keepalive: !!resumo.saindo })
        .then(() => true, e => { if (ehFuncaoAusente(e) || Number(e && e.status) === 404) _semErroCliente = true; return false; });
    },
    mensagemErro,
    minutosDoHint,   // o login lê os minutos do bloqueio por tentativas (A9)
  };
  return api;
}
